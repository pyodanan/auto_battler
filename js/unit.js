// Unit Entity Class: represents a champion on bench or combat arena

import { CHAMPIONS, STAR_MULTIPLIERS } from './constants.js';

let unitUniqueIdCounter = 1;

export class Unit {
  constructor(championId, starLevel = 1, isEnemy = false) {
    this.instanceId = unitUniqueIdCounter++;
    this.championId = championId;
    this.baseData = CHAMPIONS[championId];
    if (!this.baseData) {
      throw new Error(`Unknown champion ID: ${championId}`);
    }

    this.name = this.baseData.name;
    this.nameTh = this.baseData.nameTh;
    this.heroClass = this.baseData.heroClass;
    this.cost = this.baseData.cost;
    this.starLevel = starLevel;
    this.isEnemy = isEnemy;

    // Grid coordinates
    this.gridX = -1;
    this.gridY = -1;
    this.benchIndex = -1; // 0..7 if on bench

    // Visual rendering position (smoothed interpolation)
    this.renderX = 0;
    this.renderY = 0;

    // Combat states
    this.target = null;
    this.attackTimer = 0;
    this.isCasting = false;
    this.castTimer = 0;
    this.stunTimer = 0;
    this.shield = 0;
    this.isDead = false;

    // Synergy / trait bonus buffs
    this.bonusArmor = 0;
    this.bonusMagicResist = 0;
    this.bonusAttackSpeed = 0;
    this.bonusMagicPower = 0;
    this.bonusCritChance = 0;
    this.bonusCritDamage = 0;
    this.bonusDmgReduction = 0;
    this.bonusDodge = 0;
    this.armorPenetration = 0;
    this.shredsMR = false;
    this.hpRegenPercent = 0;
    this.startingMana = this.baseData.startingMana || 0;
    this.hasJumpedToBackline = false;

    // Animation & feedback
    this.animState = 'idle'; // idle, attack, hit, cast
    this.hitFlashTimer = 0;
    this.facing = isEnemy ? -1 : 1; // 1 = right/up, -1 = left/down
    this.dissolveTimer = 1.0; // 1.0 down to 0 on death

    // Metrics for DPS meter
    this.totalDamageDealt = 0;
    this.totalDamageTaken = 0;
    this.totalHealingDone = 0;

    // Initialize stats with star level
    this.initStats();
  }

  initStats() {
    const mult = STAR_MULTIPLIERS[this.starLevel] || STAR_MULTIPLIERS[1];
    this.maxHp = Math.round(this.baseData.hp * mult.hp);
    this.currentHp = this.maxHp;
    this.attack = Math.round(this.baseData.attack * mult.attack);
    this.armor = this.baseData.armor;
    this.magicResist = this.baseData.magicResist;
    this.attackSpeed = this.baseData.attackSpeed;
    this.range = this.baseData.range;
    this.maxMana = this.baseData.maxMana;
    this.currentMana = this.startingMana;
  }

  // Reset transient combat buffs and restore HP/Mana for new round
  resetForCombat() {
    this.initStats();
    this.currentMana = this.startingMana;
    this.target = null;
    this.attackTimer = 0.5 + Math.random() * 0.3; // Stagger initial attacks slightly
    this.isCasting = false;
    this.castTimer = 0;
    this.stunTimer = 0;
    this.shield = 0;
    this.isDead = false;
    this.hasJumpedToBackline = false;
    this.hitFlashTimer = 0;
    this.dissolveTimer = 1.0;
    this.animState = 'idle';
    this.totalDamageDealt = 0;
    this.totalDamageTaken = 0;
    this.totalHealingDone = 0;
  }

  // Effective attack speed including bonuses
  getEffectiveAttackSpeed() {
    return this.attackSpeed * (1 + this.bonusAttackSpeed);
  }

  // Effective armor
  getEffectiveArmor() {
    return Math.max(0, this.armor + this.bonusArmor);
  }

  // Effective magic resistance
  getEffectiveMagicResist() {
    return Math.max(0, this.magicResist + this.bonusMagicResist);
  }

  // Take damage with proper defense reduction formulas
  takeDamage(rawDamage, type = 'PHYSICAL', isCrit = false, armorPen = 0) {
    if (this.isDead) return 0;

    // Check dodge
    if (this.bonusDodge > 0 && Math.random() < this.bonusDodge) {
      return { actualDamage: 0, dodged: true };
    }

    let effectiveDamage = rawDamage;

    if (type === 'PHYSICAL') {
      const targetArmor = this.getEffectiveArmor() * (1 - armorPen);
      const reduction = 100 / (100 + targetArmor);
      effectiveDamage = rawDamage * reduction;
    } else if (type === 'MAGIC') {
      const targetMR = this.getEffectiveMagicResist();
      const reduction = 100 / (100 + targetMR);
      effectiveDamage = rawDamage * reduction;
    }
    // TRUE damage ignores resistances

    // Apply global damage reduction buff if any (e.g. Knight synergy 4)
    if (this.bonusDmgReduction > 0) {
      effectiveDamage *= (1 - this.bonusDmgReduction);
    }

    effectiveDamage = Math.max(1, Math.round(effectiveDamage));

    // Absorb with shield first
    let hpDamage = effectiveDamage;
    if (this.shield > 0) {
      if (this.shield >= hpDamage) {
        this.shield -= hpDamage;
        hpDamage = 0;
      } else {
        hpDamage -= this.shield;
        this.shield = 0;
      }
    }

    this.currentHp = Math.max(0, this.currentHp - hpDamage);
    this.totalDamageTaken += effectiveDamage;

    // Gain 5 mana when taking damage (up to maxMana)
    this.gainMana(5);

    // Visual trigger
    this.hitFlashTimer = 0.12;

    if (this.currentHp <= 0) {
      this.isDead = true;
      this.currentHp = 0;
    }

    return { actualDamage: effectiveDamage, isCrit, dodged: false, isDead: this.isDead };
  }

  // Heal unit
  receiveHeal(amount) {
    if (this.isDead) return 0;
    const missingHp = this.maxHp - this.currentHp;
    const actualHeal = Math.min(missingHp, Math.round(amount));
    this.currentHp += actualHeal;
    return actualHeal;
  }

  // Add mana
  gainMana(amount) {
    if (this.isDead) return;
    this.currentMana = Math.min(this.maxMana, this.currentMana + amount);
  }

  // Check if ready to cast ultimate skill
  canCastSkill() {
    return !this.isDead && this.stunTimer <= 0 && this.currentMana >= this.maxMana;
  }
}
