// Battle Engine: Handles Auto-Battler Arena, AI Pathfinding, Targeting, Skills, and Combat Simulation

import { GAME_CONFIG, CLASSES, STAR_MULTIPLIERS } from './constants.js';
import { sound } from './audio.js';
import { spriteGen } from './pixelSprites.js';

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

    // Callbacks
    this.onBattleEnd = null;
  }

  // Set battle speed multiplier
  setSpeed(speedMultiplier) {
    this.speed = speedMultiplier;
  }

  // Calculate and apply team synergies
  applySynergies(teamUnits, isEnemy = false) {
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
          // Apply synergy buff to team units
          syn.apply(teamUnits);
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

    // Apply synergies
    this.applySynergies(playerUnits, false);
    this.applySynergies(enemies, true);

    this.units = [...playerUnits, ...enemies];
    this.projectiles = [];
    this.floatingTexts = [];
    this.particles = [];
    this.battleActive = true;
    this.battleTimer = 0;

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
    if (!this.battleActive) return;

    const scaledDt = dt * this.speed;
    this.battleTimer += scaledDt;

    // Overtime mode after 25s: 2x attack speed & damage to resolve ties
    const isOvertime = this.battleTimer > 25;

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
        const healAmt = (unit.maxHp * unit.hpRegenPercent) * scaledDt;
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

      // Attack cooldown
      unit.attackTimer -= scaledDt * (isOvertime ? 2 : 1);

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
        this.stepTowardsTarget(unit, unit.target, scaledDt);
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

    // Update Floating combat text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.vy * scaledDt;
      ft.life -= scaledDt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Check round win / lose condition
    const alivePlayers = this.units.filter(u => !u.isEnemy && !u.isDead);
    const aliveEnemies = this.units.filter(u => u.isEnemy && !u.isDead);

    if (alivePlayers.length === 0 || aliveEnemies.length === 0 || this.battleTimer >= GAME_CONFIG.MAX_BATTLE_TIME_SEC) {
      this.endBattle(alivePlayers.length > 0 && aliveEnemies.length === 0, aliveEnemies.length);
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

  // Step unit 1 tile closer to target if movement cooldown expires
  stepTowardsTarget(unit, target, dt) {
    if (unit.isDead || unit.stunTimer > 0) return;

    unit.moveTimer = (unit.moveTimer || 0) + dt;
    if (unit.moveTimer < 0.45) return; // Movement speed cadence
    unit.moveTimer = 0;

    const dx = Math.sign(target.gridX - unit.gridX);
    const dy = Math.sign(target.gridY - unit.gridY);

    const nextX = unit.gridX + dx;
    const nextY = unit.gridY + dy;

    // Check collision with other living units
    const isOccupied = this.units.some(u => !u.isDead && u.gridX === nextX && u.gridY === nextY);
    if (!isOccupied && nextX >= 0 && nextX < this.cols && nextY >= 0 && nextY < this.rows) {
      unit.gridX = nextX;
      unit.gridY = nextY;
      unit.facing = dx !== 0 ? dx : unit.facing;
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

    if (attacker.range > 1) {
      // Spawn ranged projectile
      const projType = attacker.heroClass === 'ARCHER' ? 'ARROW' : (attacker.heroClass === 'MAGE' ? 'FIREBALL' : 'HOLY');
      this.spawnProjectile(attacker, target, damage, 'PHYSICAL', isCrit, projType, attacker.armorPenetration);
    } else {
      // Melee instant hit
      const dmgResult = target.takeDamage(damage, 'PHYSICAL', isCrit, attacker.armorPenetration);
      unitDamageMetrics(attacker, dmgResult.actualDamage);
      this.triggerDamageVisuals(target, dmgResult, 'PHYSICAL');
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
      case 'woodman': { // Rapid Barrage
        unit.bonusAttackSpeed += 0.90;
        setTimeout(() => { unit.bonusAttackSpeed -= 0.90; }, 5000);
        this.addFloatingText('HASTE!', unit.gridX, unit.gridY, '#2ecc71');
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
    }
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
  endBattle(playerWon, survivingEnemies) {
    this.battleActive = false;
    if (playerWon) {
      sound.playRoundWin();
    } else {
      sound.playRoundLoss();
    }

    if (this.onBattleEnd) {
      this.onBattleEnd(playerWon, survivingEnemies);
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

    // 3. Render Units on Board and Bench
    this.units.forEach(unit => {
      this.renderUnit(unit);
    });

    this.bench.forEach(unit => {
      if (unit) this.renderUnit(unit, true);
    });

    // 4. Render Projectiles
    this.projectiles.forEach(p => {
      spriteGen.drawProjectile(ctx, p.type, p.startX, p.startY, p.currentX, p.currentY);
    });

    // 5. Render Floating Combat Text
    this.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.font = `bold ${ft.fontSize}px 'Press Start 2P', monospace, sans-serif`;
      ctx.fillStyle = ft.color;
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
    ctx.fillText(stars, px - (unit.starLevel * 4), py - 26);

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
}

function unitDamageMetrics(unit, amount) {
  if (unit && amount > 0) {
    unit.totalDamageDealt += amount;
  }
}
