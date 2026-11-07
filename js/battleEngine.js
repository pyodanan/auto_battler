// Battle Engine: Handles Auto-Battler Arena, AI Pathfinding, Targeting, Skills, and Combat Simulation

import { GAME_CONFIG, CLASSES, STAR_MULTIPLIERS } from './constants.js';
import { sound } from './audio.js';
import { spriteGen } from './pixelSprites.js';
import { ITEMS } from './items.js';

export class BattleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.cols = GAME_CONFIG.GRID_COLS;
    this.rows = GAME_CONFIG.GRID_ROWS;

    // Grid cell size in pixels
    this.cellWidth = canvas.width / this.cols;
    this.cellHeight = (canvas.height - 100) / this.rows; // Reserve bottom area for bench
    this.benchY = canvas.height - 90;

    this.units = []; // All units on board (player + enemy)
    this.bench = new Array(GAME_CONFIG.BENCH_SLOTS).fill(null);

    this.projectiles = [];
    this.floatingTexts = [];
    this.particles = [];

    this.battleActive = false;
    this.battleTimer = 0;
    this.speed = 1; // 1x, 2x, 4x

    // Active synergies cache
    this.playerSynergies = {};
    this.enemySynergies = {};

    // Drag & Drop / Selection visual state
    this.selectedUnit = null;
    this.draggedUnit = null;
    this.dragPosition = null;
    this.dragTargetTile = null;
    this.itemDragHoverUnit = null;

    // Callbacks
    this.onBattleEnd = null;
  }

  // Set battle speed multiplier
  setSpeed(speedMultiplier) {
    this.speed = speedMultiplier;
  }

  // Calculate and apply team synergies
  applySynergies(teamUnits, isEnemy = false, applyBuffs = true) {
    const classCounts = {};
    const uniqueChampionsSeen = new Set();

    teamUnits.forEach(u => {
      if (!uniqueChampionsSeen.has(u.championId)) {
        uniqueChampionsSeen.add(u.championId);
        classCounts[u.heroClass] = (classCounts[u.heroClass] || 0) + 1;
      }
    });

    const activeTraits = {};

    Object.keys(CLASSES).forEach(classKey => {
      const cls = CLASSES[classKey];
      const count = classCounts[classKey] || 0;
      activeTraits[classKey] = {
        count,
        tier: 0,
        activeDesc: null
      };

      // Check milestones (descending 4, 2)
      for (let i = cls.synergies.length - 1; i >= 0; i--) {
        const syn = cls.synergies[i];
        if (count >= syn.count) {
          activeTraits[classKey].tier = syn.count;
          activeTraits[classKey].activeDesc = syn.desc;
          if (applyBuffs) syn.apply(teamUnits);
          break;
        }
      }
    });

    if (isEnemy) {
      this.enemySynergies = activeTraits;
    } else {
      this.playerSynergies = activeTraits;
    }

    return activeTraits;
  }

  // Start battle round
  startBattle(enemyUnits) {
    // Collect player board units (rows 3..5)
    const playerUnits = this.units.filter(u => !u.isEnemy);
    const enemies = enemyUnits.map(e => {
      e.isEnemy = true;
      return e;
    });

    // Reset units for battle
    [...playerUnits, ...enemies].forEach(u => u.resetForCombat());

    // Apply synergies, then pick up mana granted by those traits
    this.applySynergies(playerUnits, false);
    this.applySynergies(enemies, true);
    [...playerUnits, ...enemies].forEach(unit => {
      unit.currentMana = Math.min(unit.maxMana, unit.startingMana);
    });

    this.units = [...playerUnits, ...enemies];
    this.projectiles = [];
    this.floatingTexts = [];
    this.particles = [];
    this.battleActive = true;
    this.battleTimer = 0;
    this.overtimeAlerted = false;

    // Trigger Rogue Assassin jump to enemy backline at start
    this.units.forEach(u => {
      if (u.baseData.jumpsToBackline && !u.hasJumpedToBackline) {
        this.performRogueJump(u);
      }
    });
  }

  // Rogue leaps behind the enemy backline
  performRogueJump(rogue) {
    rogue.hasJumpedToBackline = true;
    const targetRow = rogue.isEnemy ? this.rows - 1 : 0; // Enemy backline
    // Find unoccupied column in target row
    let bestCol = rogue.gridX;
    const occupiedCols = new Set(this.units.filter(u => u.gridY === targetRow && !u.isDead).map(u => u.gridX));

    if (!occupiedCols.has(bestCol)) {
      rogue.gridY = targetRow;
    } else {
      for (let c = 0; c < this.cols; c++) {
        if (!occupiedCols.has(c)) {
          rogue.gridX = c;
          rogue.gridY = targetRow;
          break;
        }
      }
    }

    // Rogue jump particle
    this.addFloatingText('SHADOW STEP!', rogue.gridX, rogue.gridY, '#e74c3c');
  }

  // Main combat update loop
  update(dt) {
    // Always update floating combat text so numbers rise and expire naturally
    const floatDt = dt * (this.battleActive ? this.speed : 1);
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.vy * floatDt;
      ft.life -= floatDt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    if (!this.battleActive) return;

    const scaledDt = dt * this.speed;
    this.battleTimer += scaledDt;

    // Overtime mode after 25s: 2.5x attack speed & reduced heals to resolve ties
    const overtimeStart = GAME_CONFIG.OVERTIME_START_SEC || 25;
    const isOvertime = this.battleTimer > overtimeStart;

    if (isOvertime && !this.overtimeAlerted) {
      this.overtimeAlerted = true;
      this.addFloatingText('⚡ OVERTIME!', Math.floor(this.cols / 2), 2, '#f39c12', 16);
    }

    // Update units
    this.units.forEach(unit => {
      if (unit.isDead) {
        if (unit.dissolveTimer > 0) {
          unit.dissolveTimer -= scaledDt * 2;
        }
        return;
      }

      // Handle Stun
      if (unit.stunTimer > 0) {
        unit.stunTimer -= scaledDt;
        return;
      }

      // Handle HP Regen synergy (Cleric)
      if (unit.hpRegenPercent > 0) {
        const healAmt = (unit.maxHp * unit.hpRegenPercent) * scaledDt * (isOvertime ? 0.35 : 1);
        unit.receiveHeal(healAmt);
      }

      // Tick hit flash visual
      if (unit.hitFlashTimer > 0) {
        unit.hitFlashTimer -= scaledDt;
      }

      // Check skill cast
      if (unit.canCastSkill()) {
        this.executeSkill(unit);
        return;
      }

      // Attack cooldown (accelerated in overtime)
      unit.attackTimer -= scaledDt * (isOvertime ? 2.5 : 1);

      // AI Target Acquisition: find closest enemy
      if (!unit.target || unit.target.isDead) {
        unit.target = this.findClosestTarget(unit);
      }

      if (!unit.target) return; // No targets left

      const dist = this.getGridDistance(unit.gridX, unit.gridY, unit.target.gridX, unit.target.gridY);

      if (dist <= unit.range) {
        // In attack range: perform auto attack
        if (unit.attackTimer <= 0) {
          this.performAutoAttack(unit, unit.target);
          unit.attackTimer = 1 / unit.getEffectiveAttackSpeed();
        }
      } else {
        // Out of range: step towards target
        this.stepTowardsTarget(unit, unit.target, scaledDt, isOvertime);
      }
    });

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.currentX += p.vx * scaledDt;
      p.currentY += p.vy * scaledDt;

      const targetX = p.target.gridX * this.cellWidth + this.cellWidth / 2;
      const targetY = p.target.gridY * this.cellHeight + this.cellHeight / 2;
      const dist = Math.hypot(p.currentX - targetX, p.currentY - targetY);

      if (dist < 20 || p.target.isDead) {
        // Hit target
        if (!p.target.isDead) {
          const dmgResult = p.target.takeDamage(p.damage, p.damageType, p.isCrit, p.armorPen);
          unitDamageMetrics(p.source, dmgResult.actualDamage);
          this.triggerDamageVisuals(p.target, dmgResult, p.damageType);
        }
        this.projectiles.splice(i, 1);
      }
    }

    // Check round win / lose condition
    const alivePlayers = this.units.filter(u => !u.isEnemy && !u.isDead);
    const aliveEnemies = this.units.filter(u => u.isEnemy && !u.isDead);
    const isTimeout = this.battleTimer >= GAME_CONFIG.MAX_BATTLE_TIME_SEC;

    if (alivePlayers.length === 0 || aliveEnemies.length === 0 || isTimeout) {
      let playerWon = false;
      let survivingEnemies = 0;

      if (alivePlayers.length > 0 && aliveEnemies.length === 0) {
        playerWon = true;
        survivingEnemies = 0;
      } else if (alivePlayers.length === 0 && aliveEnemies.length > 0) {
        playerWon = false;
        survivingEnemies = aliveEnemies.length;
      } else if (isTimeout) {
        // Timeout: side with more units wins!
        if (alivePlayers.length > aliveEnemies.length) {
          playerWon = true;
          survivingEnemies = 0;
        } else if (alivePlayers.length < aliveEnemies.length) {
          playerWon = false;
          survivingEnemies = Math.max(1, aliveEnemies.length - alivePlayers.length);
        } else {
          // Equal unit count: tie-break by total remaining HP
          const playerHpSum = alivePlayers.reduce((s, u) => s + u.currentHp, 0);
          const enemyHpSum = aliveEnemies.reduce((s, u) => s + u.currentHp, 0);
          if (playerHpSum >= enemyHpSum) {
            playerWon = true;
            survivingEnemies = 0;
          } else {
            playerWon = false;
            survivingEnemies = 1;
          }
        }
      }

      this.endBattle(playerWon, survivingEnemies, isTimeout);
    }
  }

  // Find closest living enemy
  findClosestTarget(unit) {
    let closest = null;
    let minDistance = Infinity;

    this.units.forEach(other => {
      if (other.isDead || other.isEnemy === unit.isEnemy) return;

      const dist = this.getGridDistance(unit.gridX, unit.gridY, other.gridX, other.gridY);
      if (dist < minDistance) {
        minDistance = dist;
        closest = other;
      }
    });

    return closest;
  }

  getGridDistance(x1, y1, x2, y2) {
    // Chebyshev distance (diagonal moves allowed in grid)
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
  }

  // Step unit 1 tile closer to target with smart fallback routing
  stepTowardsTarget(unit, target, dt, isOvertime = false) {
    if (unit.isDead || unit.stunTimer > 0) return;

    unit.moveTimer = (unit.moveTimer || 0) + dt;
    const moveCadence = isOvertime ? 0.22 : 0.45;
    if (unit.moveTimer < moveCadence) return; // Movement speed cadence
    unit.moveTimer = 0;

    const dx = Math.sign(target.gridX - unit.gridX);
    const dy = Math.sign(target.gridY - unit.gridY);

    // Multi-candidate pathfinding: direct diagonal, cardinal, then lateral detour
    const candidates = [];
    if (dx !== 0 && dy !== 0) candidates.push({ x: unit.gridX + dx, y: unit.gridY + dy });
    if (dx !== 0) candidates.push({ x: unit.gridX + dx, y: unit.gridY });
    if (dy !== 0) candidates.push({ x: unit.gridX, y: unit.gridY + dy });
    if (dx === 0 && dy !== 0) {
      candidates.push({ x: unit.gridX + 1, y: unit.gridY + dy }, { x: unit.gridX - 1, y: unit.gridY + dy });
    }
    if (dy === 0 && dx !== 0) {
      candidates.push({ x: unit.gridX + dx, y: unit.gridY + 1 }, { x: unit.gridX + dx, y: unit.gridY - 1 });
    }

    for (const step of candidates) {
      if (step.x >= 0 && step.x < this.cols && step.y >= 0 && step.y < this.rows) {
        const isOccupied = this.units.some(u => !u.isDead && u.gridX === step.x && u.gridY === step.y);
        if (!isOccupied) {
          unit.gridX = step.x;
          unit.gridY = step.y;
          unit.facing = (step.x - unit.gridX !== 0) ? Math.sign(step.x - unit.gridX) : unit.facing;
          break;
        }
      }
    }
  }

  // Perform basic auto attack
  performAutoAttack(attacker, target) {
    attacker.animState = 'attack';
    setTimeout(() => { attacker.animState = 'idle'; }, 180);

    // Calculate critical strike
    let isCrit = false;
    let damage = attacker.attack;

    const critChance = (attacker.heroClass === 'ROGUE' ? 0.35 : 0.10) + attacker.bonusCritChance;
    if (Math.random() < critChance || attacker.earlyCritBuff) {
      isCrit = true;
      const critMultiplier = 1.5 + attacker.bonusCritDamage;
      damage = Math.round(damage * critMultiplier);
    }

    // Gain 10 mana on attack
    attacker.gainMana(10);
    sound.playAttack(attacker.heroClass);

    const damageType = attacker.baseData.attackType || 'PHYSICAL';
    if (damageType === 'MAGIC') {
      damage = Math.round(damage * (1 + attacker.bonusMagicPower));
    }

    if (attacker.range > 1) {
      const projType = attacker.heroClass === 'ARCHER' ? 'ARROW' : (attacker.heroClass === 'MAGE' ? 'FIREBALL' : 'HOLY');
      this.spawnProjectile(attacker, target, damage, damageType, isCrit, projType, attacker.armorPenetration);
    } else {
      const dmgResult = target.takeDamage(damage, damageType, isCrit, attacker.armorPenetration);
      unitDamageMetrics(attacker, dmgResult.actualDamage);
      this.triggerDamageVisuals(target, dmgResult, damageType);
    }
  }

  // Execute special ultimate ability
  executeSkill(unit) {
    unit.currentMana = 0;
    unit.animState = 'cast';
    sound.playSkill(unit.heroClass);

    setTimeout(() => { unit.animState = 'idle'; }, 250);

    const mult = STAR_MULTIPLIERS[unit.starLevel] || STAR_MULTIPLIERS[1];
    const skillData = unit.baseData.skill;
    this.addFloatingText(`★ ${skillData.nameTh}!`, unit.gridX, unit.gridY, '#f1c40f', 18);

    switch (unit.championId) {
      case 'galahad': { // Shield Slam
        if (unit.target && !unit.target.isDead) {
          const dmg = Math.round(skillData.damage * mult.skill);
          const res = unit.target.takeDamage(dmg, 'PHYSICAL');
          unit.target.stunTimer = 1.5;
          unit.shield += 180;
          unitDamageMetrics(unit, res.actualDamage);
          this.triggerDamageVisuals(unit.target, res, 'PHYSICAL');
          this.addFloatingText('STUNNED!', unit.target.gridX, unit.target.gridY, '#00e5ff');
        }
        break;
      }
      case 'valkyrie': { // Divine Whirlwind
        const dmg = Math.round(skillData.damage * mult.skill);
        unit.shield += 300 * mult.skill;
        this.units.forEach(other => {
          if (!other.isDead && other.isEnemy !== unit.isEnemy) {
            const d = this.getGridDistance(unit.gridX, unit.gridY, other.gridX, other.gridY);
            if (d <= 1.5) {
              const res = other.takeDamage(dmg, 'PHYSICAL');
              unitDamageMetrics(unit, res.actualDamage);
              this.triggerDamageVisuals(other, res, 'PHYSICAL');
            }
          }
        });
        break;
      }
      case 'pyromancer': { // Fireblast
        if (unit.target && !unit.target.isDead) {
          const dmg = Math.round(skillData.damage * mult.skill * (1 + unit.bonusMagicPower));
          const res = unit.target.takeDamage(dmg, 'MAGIC');
          unitDamageMetrics(unit, res.actualDamage);
          this.triggerDamageVisuals(unit.target, res, 'MAGIC');
          this.spawnProjectile(unit, unit.target, 0, 'MAGIC', false, 'FIREBALL');
        }
        break;
      }
      case 'stormcaller': { // Chain Lightning
        const dmg = Math.round(skillData.damage * mult.skill * (1 + unit.bonusMagicPower));
        const enemies = this.units.filter(u => !u.isDead && u.isEnemy !== unit.isEnemy);
        enemies.slice(0, 3).forEach(target => {
          const res = target.takeDamage(dmg, 'MAGIC');
          unitDamageMetrics(unit, res.actualDamage);
          this.triggerDamageVisuals(target, res, 'MAGIC');
          this.spawnProjectile(unit, target, 0, 'MAGIC', false, 'LIGHTNING');
        });
        break;
      }
      case 'shadowblade': { // Backstab
        if (unit.target && !unit.target.isDead) {
          const dmg = Math.round(unit.attack * skillData.damageMultiplier * mult.skill);
          const res = unit.target.takeDamage(dmg, 'PHYSICAL', true);
          unitDamageMetrics(unit, res.actualDamage);
          this.triggerDamageVisuals(unit.target, res, 'PHYSICAL');
        }
        break;
      }
      case 'specter': { // Shadow Dance (multi-hit)
        if (unit.target && !unit.target.isDead) {
          for (let h = 0; h < 4; h++) {
            setTimeout(() => {
              if (unit.target && !unit.target.isDead) {
                const dmg = Math.round(skillData.damagePerHit * mult.skill);
                const res = unit.target.takeDamage(dmg, 'PHYSICAL', Math.random() < 0.5);
                unitDamageMetrics(unit, res.actualDamage);
                this.triggerDamageVisuals(unit.target, res, 'PHYSICAL');
              }
            }, h * 80);
          }
        }
        break;
      }
      case 'woodman': { // Piercing shot plus attack speed for the rest of the round
        this.castGenericSkill(unit, skillData, mult);
        if (skillData.attackSpeedBuff) {
          this.addFloatingText('HASTE!', unit.gridX, unit.gridY, '#2ecc71');
        }
        break;
      }
      case 'deadeye': { // Piercing Arrow
        const dmg = Math.round(skillData.damage * mult.skill);
        // Pierces all enemies in same row
        this.units.forEach(other => {
          if (!other.isDead && other.isEnemy !== unit.isEnemy && other.gridY === unit.gridY) {
            const res = other.takeDamage(dmg, 'PHYSICAL', false, 0.40);
            unitDamageMetrics(unit, res.actualDamage);
            this.triggerDamageVisuals(other, res, 'PHYSICAL');
          }
        });
        break;
      }
      case 'acolyte': { // Lesser Heal
        const allies = this.units.filter(u => !u.isDead && u.isEnemy === unit.isEnemy);
        if (allies.length > 0) {
          allies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
          const targetAlly = allies[0];
          const heal = Math.round(skillData.healAmount * mult.skill);
          const actual = targetAlly.receiveHeal(heal);
          unit.totalHealingDone += actual;
          targetAlly.bonusArmor += 20;
          setTimeout(() => { targetAlly.bonusArmor -= 20; }, 4000);
          this.addFloatingText(`+${actual} HEAL`, targetAlly.gridX, targetAlly.gridY, '#2ecc71');
        }
        break;
      }
      case 'highpriest': { // Holy Sanctuary
        const allies = this.units.filter(u => !u.isDead && u.isEnemy === unit.isEnemy);
        const heal = Math.round(skillData.healAmount * mult.skill);
        allies.forEach(ally => {
          const actual = ally.receiveHeal(heal);
          unit.totalHealingDone += actual;
          ally.shield += 150;
          this.addFloatingText(`+${actual}`, ally.gridX, ally.gridY, '#f1c40f');
        });
        break;
      }
      default:
        this.castGenericSkill(unit, skillData, mult);
        break;
    }
  }

  // Data-driven cast used by champions that do not have a hand-tuned case
  castGenericSkill(unit, skillData, mult) {
    if (skillData.attackSpeedBuff && !unit.skillHasteApplied) {
      unit.bonusAttackSpeed += skillData.attackSpeedBuff;
      unit.skillHasteApplied = true;
    }
    if (skillData.selfShield) {
      unit.shield += Math.round(skillData.selfShield * mult.skill);
    }

    if (skillData.type === 'HEAL') {
      const allies = this.units.filter(u => !u.isDead && u.isEnemy === unit.isEnemy);
      if (allies.length === 0) return;
      let targets = allies;
      if (!skillData.healAll) {
        allies.sort((a, b) => (a.currentHp / a.maxHp) - (b.currentHp / b.maxHp));
        targets = [allies[0]];
      }
      const heal = Math.round((skillData.healAmount || 0) * mult.skill);
      targets.forEach(ally => {
        const actual = ally.receiveHeal(heal);
        unit.totalHealingDone += actual;
        if (skillData.shield) ally.shield += Math.round(skillData.shield * mult.skill);
        this.addFloatingText(`+${actual}`, ally.gridX, ally.gridY, '#2ecc71');
      });
      return;
    }

    const enemies = this.units.filter(u => !u.isDead && u.isEnemy !== unit.isEnemy);
    let targets = [];
    if (skillData.radius) {
      const origin = skillData.onTarget && unit.target ? unit.target : unit;
      targets = enemies.filter(other => {
        return this.getGridDistance(origin.gridX, origin.gridY, other.gridX, other.gridY) <= skillData.radius;
      });
    } else if (skillData.sameRow) {
      targets = enemies.filter(other => other.gridY === unit.gridY);
    } else if (unit.target && !unit.target.isDead) {
      targets = [unit.target];
    }

    const hits = skillData.hits || 1;
    const magicScale = skillData.type === 'MAGIC' ? (1 + unit.bonusMagicPower) : 1;
    const pen = skillData.armorPen || 0;
    const damageType = skillData.type === 'MAGIC' ? 'MAGIC' : 'PHYSICAL';
    targets.forEach(target => {
      for (let hit = 0; hit < hits; hit++) {
        if (target.isDead) break;
        const base = skillData.damage || Math.round(unit.attack * (skillData.damageMultiplier || 1.5));
        const dmg = Math.round(base * mult.skill * magicScale);
        const res = target.takeDamage(dmg, damageType, !!skillData.alwaysCrit, pen);
        unitDamageMetrics(unit, res.actualDamage);
        this.triggerDamageVisuals(target, res, damageType);
      }
      if (skillData.stun && !target.isDead) {
        target.stunTimer = Math.max(target.stunTimer, skillData.stun);
      }
    });
  }

  // Spawn projectile in flight
  spawnProjectile(source, target, damage, damageType, isCrit, type, armorPen = 0) {
    const startX = source.gridX * this.cellWidth + this.cellWidth / 2;
    const startY = source.gridY * this.cellHeight + this.cellHeight / 2;
    const targetX = target.gridX * this.cellWidth + this.cellWidth / 2;
    const targetY = target.gridY * this.cellHeight + this.cellHeight / 2;

    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = 400; // px/sec

    this.projectiles.push({
      source,
      target,
      damage,
      damageType,
      isCrit,
      type,
      armorPen,
      currentX: startX,
      currentY: startY,
      startX,
      startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    });
  }

  // Damage popup and hit sounds
  triggerDamageVisuals(target, dmgResult, damageType) {
    if (dmgResult.dodged) {
      this.addFloatingText('MISS!', target.gridX, target.gridY, '#bdc3c7');
      return;
    }

    if (dmgResult.isCrit) {
      sound.playCrit();
      this.addFloatingText(`CRIT ${dmgResult.actualDamage}!`, target.gridX, target.gridY, '#f39c12', 16);
    } else {
      sound.playHit();
      const color = damageType === 'MAGIC' ? '#9b59b6' : '#e74c3c';
      this.addFloatingText(`-${dmgResult.actualDamage}`, target.gridX, target.gridY, color);
    }
  }

  addFloatingText(text, gridX, gridY, color = '#ffffff', fontSize = 12) {
    const pixelX = gridX * this.cellWidth + this.cellWidth / 2 + (Math.random() - 0.5) * 16;
    const pixelY = gridY * this.cellHeight + 10;
    this.floatingTexts.push({
      text,
      x: pixelX,
      y: pixelY,
      vy: 28,
      life: 0.9,
      color,
      fontSize
    });
  }

  // End round
  endBattle(playerWon, survivingEnemies, isTimeout = false) {
    this.battleActive = false;
    this.floatingTexts = [];
    this.projectiles = [];
    if (playerWon) {
      sound.playRoundWin();
    } else {
      sound.playRoundLoss();
    }

    if (this.onBattleEnd) {
      this.onBattleEnd(playerWon, survivingEnemies, isTimeout);
    }
  }

  // Render board, units, bench, and animations
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Draw Checkerboard Arena Grid
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * this.cellWidth;
        const y = r * this.cellHeight;

        const isPlayerTerritory = r >= 3;
        const isDarkTile = (r + c) % 2 === 1;

        if (isPlayerTerritory) {
          ctx.fillStyle = isDarkTile ? '#1b263b' : '#23334d';
        } else {
          ctx.fillStyle = isDarkTile ? '#341f26' : '#452832';
        }

        ctx.fillRect(x, y, this.cellWidth, this.cellHeight);

        // Tile border
        ctx.strokeStyle = '#0d131f';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, this.cellWidth, this.cellHeight);
      }
    }

    // Midline separation
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 3 * this.cellHeight);
    ctx.lineTo(this.canvas.width, 3 * this.cellHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Bench Area (at bottom)
    ctx.fillStyle = '#0f141d';
    ctx.fillRect(0, this.benchY - 15, this.canvas.width, 105);
    ctx.strokeStyle = '#3a4a60';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, this.benchY - 15, this.canvas.width, 105);

    // Bench slots
    const benchSlotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
    for (let i = 0; i < GAME_CONFIG.BENCH_SLOTS; i++) {
      const bx = i * benchSlotWidth;
      ctx.fillStyle = '#18202c';
      ctx.fillRect(bx + 4, this.benchY - 8, benchSlotWidth - 8, 80);
      ctx.strokeStyle = '#2d3b4e';
      ctx.strokeRect(bx + 4, this.benchY - 8, benchSlotWidth - 8, 80);

      // Bench slot index number
      ctx.fillStyle = '#4a5b73';
      ctx.font = '10px monospace';
      ctx.fillText(`${i + 1}`, bx + 8, this.benchY + 8);
    }

    // Drop target highlight during drag
    if (this.dragTargetTile) {
      this.renderDragTargetTile();
    }

    // Selected unit highlight
    if (this.selectedUnit && this.selectedUnit !== this.draggedUnit) {
      this.renderUnitSelectionHighlight(this.selectedUnit);
    }

    // Item drag hover highlight
    if (this.itemDragHoverUnit) {
      this.renderItemTargetHighlight(this.itemDragHoverUnit);
    }

    // 3. Render Units on Board and Bench
    this.units.forEach(unit => {
      this.renderUnit(unit);
    });

    this.bench.forEach(unit => {
      if (unit) this.renderUnit(unit, true);
    });

    // Render Floating Dragged Unit (on top of static units)
    if (this.draggedUnit && this.dragPosition) {
      this.renderFloatingDraggedUnit();
    }

    // 4. Render Projectiles
    this.projectiles.forEach(p => {
      spriteGen.drawProjectile(ctx, p.type, p.startX, p.startY, p.currentX, p.currentY);
    });

    // 5. Render Floating Combat Text
    this.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.font = `bold ${ft.fontSize}px 'Press Start 2P', monospace, sans-serif`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life / 0.4));
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.x - 14, ft.y);
      ctx.restore();
    });
  }

  // Draw an individual unit
  renderUnit(unit, isOnBench = false) {
    if (unit.isDead && unit.dissolveTimer <= 0) return;

    const ctx = this.ctx;
    let px, py;

    if (isOnBench) {
      const benchSlotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
      px = unit.benchIndex * benchSlotWidth + benchSlotWidth / 2;
      py = this.benchY + 32;
    } else {
      px = unit.gridX * this.cellWidth + this.cellWidth / 2;
      py = unit.gridY * this.cellHeight + this.cellHeight / 2;
    }

    ctx.save();

    // Ghost transparency if unit is currently being dragged
    if (unit === this.draggedUnit) {
      ctx.globalAlpha = 0.35;
    }

    // Death dissolve
    if (unit.isDead) {
      ctx.globalAlpha = Math.max(0, unit.dissolveTimer);
    }

    // Hit flash
    if (unit.hitFlashTimer > 0) {
      ctx.filter = 'brightness(2.5)';
    }

    // Idle breathing offset
    const idleBounce = Math.sin((Date.now() / 250) + unit.instanceId) * 1.5;

    // Get 16x16 pixel sprite
    const spriteCanvas = spriteGen.getSprite(unit.heroClass, unit.starLevel, unit.animState, unit.isEnemy);
    const spriteSize = 42; // Scaled pixel size

    // Draw sprite centered
    ctx.drawImage(
      spriteCanvas,
      px - spriteSize / 2,
      py - spriteSize / 2 + (unit.animState === 'idle' ? idleBounce : 0),
      spriteSize,
      spriteSize
    );

    ctx.filter = 'none';

    // Draw Star Level Indicators (★, ★★, ★★★)
    const starColor = unit.starLevel === 3 ? '#e056fd' : (unit.starLevel === 2 ? '#f1c40f' : '#ffffff');
    ctx.fillStyle = starColor;
    ctx.font = '10px monospace';
    const stars = '★'.repeat(unit.starLevel);
    ctx.fillText(stars, px - (unit.starLevel * 4), py - 24);

    // Draw Champion Name Badge above head during preparation / waiting phase (หน้ารอ)
    if (!this.battleActive) {
      ctx.save();
      ctx.font = 'bold 10px "Sarabun", sans-serif';
      const nameText = unit.nameTh;
      const textMetrics = ctx.measureText(nameText);
      const badgeW = Math.max(textMetrics.width + 10, 48);
      const badgeH = 16;
      const badgeX = px - badgeW / 2;
      const badgeY = py - 43;

      // Dark capsule with class-themed border
      const clsColor = CLASSES[unit.heroClass] ? CLASSES[unit.heroClass].color : '#3498db';
      ctx.fillStyle = 'rgba(10, 14, 23, 0.90)';
      ctx.strokeStyle = clsColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      // Unit name text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameText, px, badgeY + badgeH / 2 + 1);
      ctx.restore();
    }

    if (unit.itemId && ITEMS[unit.itemId]) {
      ctx.font = '12px sans-serif';
      ctx.fillText(ITEMS[unit.itemId].icon, px + 12, py - 18);
    }

    // Draw Health Bar & Mana Bar (if alive)
    if (!unit.isDead) {
      const barW = 44;
      const barH = 5;
      const barX = px - barW / 2;
      const barY = py + 22;

      // HP Bar background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // HP Fill
      const hpPct = Math.max(0, unit.currentHp / unit.maxHp);
      ctx.fillStyle = unit.isEnemy ? '#e74c3c' : '#2ecc71';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      // Shield overlay
      if (unit.shield > 0) {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(barX, barY, Math.min(barW, (unit.shield / unit.maxHp) * barW), barH);
      }

      // Mana Bar
      const manaH = 3;
      const manaY = barY + barH + 2;
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(barX - 1, manaY - 1, barW + 2, manaH + 2);

      const manaPct = Math.min(1, unit.currentMana / unit.maxMana);
      ctx.fillStyle = '#3498db';
      ctx.fillRect(barX, manaY, barW * manaPct, manaH);
    }

    ctx.restore();
  }

  // Visual highlight for the drag target cell / slot
  renderDragTargetTile() {
    const ctx = this.ctx;
    const target = this.dragTargetTile;
    if (!target) return;

    ctx.save();
    if (target.type === 'BOARD') {
      const tx = target.gridX * this.cellWidth;
      const ty = target.gridY * this.cellHeight;
      if (target.valid) {
        ctx.fillStyle = 'rgba(46, 204, 113, 0.28)';
        ctx.strokeStyle = '#2ecc71';
        ctx.shadowColor = '#2ecc71';
      } else {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.32)';
        ctx.strokeStyle = '#e74c3c';
        ctx.shadowColor = '#e74c3c';
      }
      ctx.lineWidth = 3;
      ctx.shadowBlur = 8;
      ctx.fillRect(tx + 2, ty + 2, this.cellWidth - 4, this.cellHeight - 4);
      ctx.strokeRect(tx + 2, ty + 2, this.cellWidth - 4, this.cellHeight - 4);
    } else if (target.type === 'BENCH') {
      const benchSlotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
      const bx = target.benchIndex * benchSlotWidth;
      ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 8;
      ctx.fillRect(bx + 4, this.benchY - 8, benchSlotWidth - 8, 80);
      ctx.strokeRect(bx + 4, this.benchY - 8, benchSlotWidth - 8, 80);
    }
    ctx.restore();
  }

  // Visual highlight around currently selected unit (click mode)
  renderUnitSelectionHighlight(unit) {
    const ctx = this.ctx;
    let px, py;
    if (unit.benchIndex >= 0) {
      const benchSlotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
      px = unit.benchIndex * benchSlotWidth + benchSlotWidth / 2;
      py = this.benchY + 32;
    } else {
      px = unit.gridX * this.cellWidth + this.cellWidth / 2;
      py = unit.gridY * this.cellHeight + this.cellHeight / 2;
    }

    ctx.save();
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#f1c40f';
    ctx.shadowBlur = 10;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(px - 25, py - 25, 50, 50);
    ctx.restore();
  }

  // Visual highlight when an item is dragged over a unit
  renderItemTargetHighlight(unit) {
    const ctx = this.ctx;
    let px, py;
    if (unit.benchIndex >= 0) {
      const benchSlotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
      px = unit.benchIndex * benchSlotWidth + benchSlotWidth / 2;
      py = this.benchY + 32;
    } else {
      px = unit.gridX * this.cellWidth + this.cellWidth / 2;
      py = unit.gridY * this.cellHeight + this.cellHeight / 2;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(241, 196, 15, 0.25)';
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#f1c40f';
    ctx.shadowBlur = 14;
    ctx.fillRect(px - 26, py - 26, 52, 52);
    ctx.strokeRect(px - 26, py - 26, 52, 52);

    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.fillStyle = '#f1c40f';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText('EQUIP', px - 20, py - 32);
    ctx.restore();
  }

  // Render the floating unit following pointer during drag
  renderFloatingDraggedUnit() {
    const ctx = this.ctx;
    const { x, y } = this.dragPosition;
    const unit = this.draggedUnit;

    ctx.save();

    // 1. Drop shadow beneath the unit
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 26, 22, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Unit sprite with subtle elevation
    const spriteCanvas = spriteGen.getSprite(unit.heroClass, unit.starLevel, 'idle', unit.isEnemy);
    const spriteSize = 46;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.drawImage(
      spriteCanvas,
      x - spriteSize / 2,
      y - spriteSize / 2 - 8,
      spriteSize,
      spriteSize
    );
    ctx.shadowBlur = 0;

    // 3. Star level
    const starColor = unit.starLevel === 3 ? '#e056fd' : (unit.starLevel === 2 ? '#f1c40f' : '#ffffff');
    ctx.fillStyle = starColor;
    ctx.font = '11px monospace';
    const stars = '★'.repeat(unit.starLevel);
    ctx.fillText(stars, x - (unit.starLevel * 4), y - 36);

    // 4. Item icon if equipped
    if (unit.itemId && ITEMS[unit.itemId]) {
      ctx.font = '14px sans-serif';
      ctx.fillText(ITEMS[unit.itemId].icon, x + 14, y - 24);
    }

    // 5. Unit name badge
    ctx.font = '10px "Sarabun", sans-serif';
    ctx.fillStyle = 'rgba(13, 19, 31, 0.9)';
    ctx.strokeStyle = '#3a4a60';
    ctx.lineWidth = 1;
    const badgeW = 72;
    ctx.fillRect(x - badgeW / 2, y + 28, badgeW, 18);
    ctx.strokeRect(x - badgeW / 2, y + 28, badgeW, 18);
    ctx.fillStyle = '#ecf0f1';
    ctx.textAlign = 'center';
    ctx.fillText(unit.nameTh, x, y + 41);
    ctx.textAlign = 'left';

    ctx.restore();
  }
}

function unitDamageMetrics(unit, amount) {
  if (unit && amount > 0) {
    unit.totalDamageDealt += amount;
  }
}
