// Main Game Controller: Manages state machine, user inputs, round flow, and enemy waves

import { GAME_CONFIG, CLASSES, CHAMPIONS, LEVEL_XP } from './constants.js';
import { BattleEngine } from './battleEngine.js';
import { ShopManager } from './shop.js';
import { Unit } from './unit.js';
import { sound } from './audio.js';
import { BalanceSimulator } from './balanceSimulator.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.battleEngine = new BattleEngine(this.canvas);
    this.shopManager = new ShopManager(this);

    // Player State
    this.gold = GAME_CONFIG.INITIAL_GOLD;
    this.playerHp = GAME_CONFIG.INITIAL_PLAYER_HP;
    this.playerLevel = 3; // Starts at Lv 3 (3 units max on board)
    this.playerXP = 0;
    this.round = 1;
    this.phase = 'PREP'; // 'PREP' or 'BATTLE'
    this.winStreak = 0;
    this.lossStreak = 0;

    // Interaction state
    this.selectedUnit = null; // clicked unit on bench or board
    this.speed = 1;

    // Setup hooks
    this.battleEngine.onBattleEnd = (playerWon, survivingEnemies) => {
      this.handleBattleResolved(playerWon, survivingEnemies);
    };

    // Pre-saved player board composition for auto-restoring after combat
    this.savedBoardUnits = [];

    this.initInputListeners();
    this.initUIListeners();

    // Initial shop roll
    this.shopManager.refreshShop(true);

    // Give player 1 starter unit on bench
    const starter = new Unit('galahad', 1, false);
    starter.benchIndex = 0;
    this.battleEngine.bench[0] = starter;

    // Update UI
    this.updateUI();
  }

  // Get currently deployed unit count on board
  getDeployedCount() {
    return this.battleEngine.units.filter(u => !u.isEnemy).length;
  }

  // Handle Board and Bench clicking / positioning
  initInputListeners() {
    this.canvas.addEventListener('click', (e) => {
      if (this.phase === 'BATTLE') return; // Cannot move during active combat

      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // 1. Check Bench Click
      if (clickY >= this.battleEngine.benchY - 15) {
        const slotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
        const benchIdx = Math.floor(clickX / slotWidth);

        if (benchIdx >= 0 && benchIdx < GAME_CONFIG.BENCH_SLOTS) {
          const benchUnit = this.battleEngine.bench[benchIdx];

          if (this.selectedUnit) {
            // Swap or move to bench
            if (this.selectedUnit.benchIndex >= 0) {
              // Bench to Bench swap
              this.battleEngine.bench[this.selectedUnit.benchIndex] = benchUnit;
              if (benchUnit) benchUnit.benchIndex = this.selectedUnit.benchIndex;
              this.battleEngine.bench[benchIdx] = this.selectedUnit;
              this.selectedUnit.benchIndex = benchIdx;
            } else {
              // Board to Bench move
              if (!benchUnit) {
                // Remove from board, place on bench
                const bIdx = this.battleEngine.units.indexOf(this.selectedUnit);
                if (bIdx !== -1) this.battleEngine.units.splice(bIdx, 1);
                this.selectedUnit.gridX = -1;
                this.selectedUnit.gridY = -1;
                this.selectedUnit.benchIndex = benchIdx;
                this.battleEngine.bench[benchIdx] = this.selectedUnit;
              }
            }
            this.selectedUnit = null;
          } else if (benchUnit) {
            // Select bench unit
            this.selectedUnit = benchUnit;
            this.showBanner(`เลือก: ${benchUnit.nameTh}`, '#3498db');
          }
          this.updateUI();
          return;
        }
      }

      // 2. Check Arena Grid Click
      const cellW = this.battleEngine.cellWidth;
      const cellH = this.battleEngine.cellHeight;
      const gridX = Math.floor(clickX / cellW);
      const gridY = Math.floor(clickY / cellH);

      if (gridX >= 0 && gridX < GAME_CONFIG.GRID_COLS && gridY >= 0 && gridY < GAME_CONFIG.GRID_ROWS) {
        // Only rows 3, 4, 5 are player territory
        if (gridY < 3) {
          this.showBanner('ไม่สามารถวางในแดนศัตรูได้ (แถว 1-3)', '#e74c3c');
          return;
        }

        const existingUnitOnTile = this.battleEngine.units.find(u => !u.isEnemy && u.gridX === gridX && u.gridY === gridY);

        if (this.selectedUnit) {
          if (this.selectedUnit.benchIndex >= 0) {
            // Deploy from Bench to Board
            if (this.getDeployedCount() >= this.playerLevel && !existingUnitOnTile) {
              this.showBanner(`จำกัดจำนวนลงสนาม ${this.playerLevel} ตัว! ซื้อเลเวลเพิ่มได้`, '#e74c3c');
              this.selectedUnit = null;
              this.updateUI();
              return;
            }

            if (existingUnitOnTile) {
              // Swap bench unit with board unit
              this.battleEngine.bench[this.selectedUnit.benchIndex] = existingUnitOnTile;
              existingUnitOnTile.benchIndex = this.selectedUnit.benchIndex;
              existingUnitOnTile.gridX = -1;
              existingUnitOnTile.gridY = -1;
              const idx = this.battleEngine.units.indexOf(existingUnitOnTile);
              if (idx !== -1) this.battleEngine.units.splice(idx, 1);

              this.selectedUnit.benchIndex = -1;
              this.selectedUnit.gridX = gridX;
              this.selectedUnit.gridY = gridY;
              this.battleEngine.units.push(this.selectedUnit);
            } else {
              // Move from bench to empty tile
              this.battleEngine.bench[this.selectedUnit.benchIndex] = null;
              this.selectedUnit.benchIndex = -1;
              this.selectedUnit.gridX = gridX;
              this.selectedUnit.gridY = gridY;
              this.battleEngine.units.push(this.selectedUnit);
            }
          } else {
            // Move from board tile to board tile
            if (existingUnitOnTile) {
              // Swap positions
              existingUnitOnTile.gridX = this.selectedUnit.gridX;
              existingUnitOnTile.gridY = this.selectedUnit.gridY;
            }
            this.selectedUnit.gridX = gridX;
            this.selectedUnit.gridY = gridY;
          }

          this.selectedUnit = null;
        } else if (existingUnitOnTile) {
          // Select unit on board
          this.selectedUnit = existingUnitOnTile;
          this.showBanner(`เลือก: ${existingUnitOnTile.nameTh} (${existingUnitOnTile.starLevel}★)`, '#3498db');
        }

        this.updateUI();
      }
    });
  }

  // Setup DOM buttons and controls
  initUIListeners() {
    // Reroll button
    document.getElementById('rerollBtn').addEventListener('click', () => {
      if (this.phase === 'BATTLE') return;
      if (this.shopManager.refreshShop()) {
        this.updateUI();
      }
    });

    // Buy XP button
    document.getElementById('buyXpBtn').addEventListener('click', () => {
      this.shopManager.buyXP();
      this.updateUI();
    });

    // Start Combat button
    document.getElementById('readyBtn').addEventListener('click', () => {
      if (this.phase === 'PREP') {
        if (this.getDeployedCount() === 0) {
          this.showBanner('ต้องวางตัวละครลงสนามอย่างน้อย 1 ตัว!', '#e74c3c');
          return;
        }
        this.startCombatPhase();
      }
    });

    // Speed toggle
    document.getElementById('speedBtn').addEventListener('click', () => {
      if (this.speed === 1) this.speed = 2;
      else if (this.speed === 2) this.speed = 4;
      else this.speed = 1;
      this.battleEngine.setSpeed(this.speed);
      document.getElementById('speedBtn').innerText = `${this.speed}x SPEED`;
    });

    // Mute toggle
    document.getElementById('audioBtn').addEventListener('click', () => {
      const isMuted = sound.toggleMute();
      document.getElementById('audioBtn').innerText = isMuted ? '🔇 Muted' : '🔊 Sound: ON';
    });

    // Sell Selected Unit button
    document.getElementById('sellBtn').addEventListener('click', () => {
      if (this.selectedUnit) {
        this.shopManager.sellUnit(this.selectedUnit);
        this.selectedUnit = null;
        this.updateUI();
      } else {
        this.showBanner('คลิกเลือกตัวละครที่ต้องการขายก่อน!', '#f39c12');
      }
    });

    // Balance Matrix modal toggle
    document.getElementById('balanceBtn').addEventListener('click', () => {
      this.showBalanceModal();
    });

    // Close modal
    document.getElementById('modalCloseBtn').addEventListener('click', () => {
      document.getElementById('balanceModal').style.display = 'none';
    });
  }

  // Start Combat
  startCombatPhase() {
    this.phase = 'BATTLE';
    this.selectedUnit = null;
    document.getElementById('readyBtn').disabled = true;
    document.getElementById('readyBtn').innerText = '⚔️ กำลังต่อสู้...';

    // Save snapshot of player's board placement
    this.savedBoardUnits = this.battleEngine.units.filter(u => !u.isEnemy).map(u => ({
      championId: u.championId,
      starLevel: u.starLevel,
      gridX: u.gridX,
      gridY: u.gridY
    }));

    // Generate balanced enemy wave
    const enemies = this.generateEnemyWave(this.round);

    this.battleEngine.startBattle(enemies);
    this.updateUI();
  }

  // Generate balanced enemy waves exhibiting clear class synergies
  generateEnemyWave(roundNum) {
    const enemies = [];
    const createEnemy = (champId, star = 1, gx = 0, gy = 0) => {
      const u = new Unit(champId, star, true);
      u.gridX = gx;
      u.gridY = gy;
      return u;
    };

    switch (roundNum) {
      case 1: // Wave 1: 1 Archer
        enemies.push(createEnemy('woodman', 1, 3, 0));
        break;
      case 2: // Wave 2: 1 Knight + 1 Mage (Frontline + Backline)
        enemies.push(createEnemy('galahad', 1, 3, 2));
        enemies.push(createEnemy('pyromancer', 1, 4, 0));
        break;
      case 3: // Wave 3: (2) Knights synergy (+30 Armor) + 1 Rogue
        enemies.push(createEnemy('galahad', 1, 2, 2));
        enemies.push(createEnemy('galahad', 1, 5, 2));
        enemies.push(createEnemy('shadowblade', 1, 3, 1));
        break;
      case 4: // Wave 4: (2) Mages synergy (+40% AP) + 1 Knight tank
        enemies.push(createEnemy('valkyrie', 1, 3, 2));
        enemies.push(createEnemy('pyromancer', 1, 2, 0));
        enemies.push(createEnemy('stormcaller', 1, 5, 0));
        break;
      case 5: // Wave 5 Boss: 2-star Galahad + 2 Archers
        enemies.push(createEnemy('galahad', 2, 3, 2));
        enemies.push(createEnemy('woodman', 1, 1, 0));
        enemies.push(createEnemy('deadeye', 1, 6, 0));
        break;
      case 6: // Wave 6: (2) Rogues + (2) Clerics sustain comp
        enemies.push(createEnemy('shadowblade', 1, 2, 1));
        enemies.push(createEnemy('specter', 1, 5, 1));
        enemies.push(createEnemy('acolyte', 1, 3, 0));
        enemies.push(createEnemy('highpriest', 1, 4, 0));
        break;
      default: {
        // Endless / High rounds: 4-6 balanced units
        enemies.push(createEnemy('valkyrie', 2, 3, 2));
        enemies.push(createEnemy('stormcaller', 2, 2, 0));
        enemies.push(createEnemy('specter', 2, 4, 1));
        enemies.push(createEnemy('highpriest', 1, 5, 0));
        if (roundNum >= 8) {
          enemies.push(createEnemy('deadeye', 2, 1, 0));
        }
      }
    }

    return enemies;
  }

  // Handle combat finish
  handleBattleResolved(playerWon, survivingEnemies) {
    this.phase = 'PREP';
    document.getElementById('readyBtn').disabled = false;
    document.getElementById('readyBtn').innerText = '⚔️ เริ่มต่อสู้ (Ready)';

    if (playerWon) {
      this.showBanner(`🎉 ชนะรอบที่ ${this.round}! รับรางวัลชัยชนะ`, '#2ecc71');
      this.shopManager.awardRoundIncome(true);
      this.round++;
    } else {
      // Deduct player HP: 2 base + 2 per surviving enemy
      const damageTaken = 2 + (survivingEnemies * 2);
      this.playerHp = Math.max(0, this.playerHp - damageTaken);
      this.showBanner(`💀 พ่ายแพ้! เสียพลังชีวิต ${damageTaken} HP`, '#e74c3c');
      this.shopManager.awardRoundIncome(false);

      if (this.playerHp <= 0) {
        this.handleGameOver();
        return;
      }
      this.round++;
    }

    // Restore player units on board from saved snapshot
    this.battleEngine.units = this.savedBoardUnits.map(snap => {
      const u = new Unit(snap.championId, snap.starLevel, false);
      u.gridX = snap.gridX;
      u.gridY = snap.gridY;
      return u;
    });

    // Auto reroll shop if not locked
    if (!this.shopManager.isLocked) {
      this.shopManager.refreshShop(true);
    }

    this.updateUI();
  }

  handleGameOver() {
    this.showBanner(`GAME OVER! คุณรอดชีวิตได้ถึงรอบที่ ${this.round}`, '#e74c3c');
    setTimeout(() => {
      if (confirm(`จบเกม! คุณมาถึงรอบที่ ${this.round}\nต้องการเริ่มเกมใหม่หรือไม่?`)) {
        window.location.reload();
      }
    }, 1500);
  }

  // Render HTML UI components (Shop cards, player stats, synergies)
  updateUI() {
    // 1. Stats Bar
    document.getElementById('playerHp').innerText = this.playerHp;
    document.getElementById('playerGold').innerText = this.gold;
    document.getElementById('playerLevel').innerText = this.playerLevel;
    document.getElementById('currentRound').innerText = this.round;

    const deployed = this.getDeployedCount();
    document.getElementById('deployedUnits').innerText = `${deployed}/${this.playerLevel}`;

    const neededXP = LEVEL_XP[this.playerLevel];
    document.getElementById('playerXp').innerText = `${this.playerXP}/${neededXP}`;

    // Streak
    const streakEl = document.getElementById('playerStreak');
    if (this.winStreak > 1) {
      streakEl.innerText = `🔥 ชนะต่อเนื่อง ${this.winStreak}`;
      streakEl.style.color = '#e67e22';
    } else if (this.lossStreak > 1) {
      streakEl.innerText = `❄️ แพ้ต่อเนื่อง ${this.lossStreak}`;
      streakEl.style.color = '#3498db';
    } else {
      streakEl.innerText = 'ปกติ';
      streakEl.style.color = '#95a5a6';
    }

    // 2. Shop Slots
    const shopContainer = document.getElementById('shopCards');
    shopContainer.innerHTML = '';

    this.shopManager.shopSlots.forEach((slot, idx) => {
      const card = document.createElement('div');
      card.className = `shop-card tier-${slot.cost} ${slot.bought ? 'bought' : ''}`;

      const champ = CHAMPIONS[slot.championId];
      const cls = CLASSES[champ.heroClass];

      card.innerHTML = `
        <div class="card-header">
          <span class="card-name">${champ.nameTh}</span>
          <span class="card-cost">${slot.cost} 🪙</span>
        </div>
        <div class="card-class" style="color: ${cls.color}">${cls.icon} ${cls.nameTh}</div>
        <div class="card-stats">HP:${champ.hp} | ATK:${champ.attack}</div>
        <div class="card-skill">${champ.skill.nameTh}</div>
      `;

      card.addEventListener('click', () => {
        if (this.phase === 'PREP') {
          if (this.shopManager.buySlot(idx)) {
            this.updateUI();
          }
        }
      });

      shopContainer.appendChild(card);
    });

    // 3. Synergies Sidebar
    this.updateSynergiesSidebar();
  }

  // Render active synergies
  updateSynergiesSidebar() {
    const listEl = document.getElementById('synergiesList');
    listEl.innerHTML = '';

    const boardUnits = this.battleEngine.units.filter(u => !u.isEnemy);
    const activeTraits = this.battleEngine.applySynergies(boardUnits, false);

    Object.keys(CLASSES).forEach(cKey => {
      const cls = CLASSES[cKey];
      const traitInfo = activeTraits[cKey];

      const item = document.createElement('div');
      const isActive = traitInfo.tier > 0;
      item.className = `synergy-item ${isActive ? 'active' : ''}`;

      item.innerHTML = `
        <div class="syn-header">
          <span>${cls.icon} ${cls.nameTh}</span>
          <span class="syn-count">${traitInfo.count}/4</span>
        </div>
        <div class="syn-note">${cls.counterNote}</div>
        ${isActive ? `<div class="syn-bonus">✨ ${traitInfo.activeDesc}</div>` : ''}
      `;

      listEl.appendChild(item);
    });
  }

  // Show floating alert banner
  showBanner(msg, color = '#f1c40f') {
    const banner = document.getElementById('gameBanner');
    banner.innerText = msg;
    banner.style.borderColor = color;
    banner.style.color = color;
    banner.classList.add('visible');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      banner.classList.remove('visible');
    }, 2500);
  }

  // Open in-game Balance Matrix modal
  showBalanceModal() {
    const modal = document.getElementById('balanceModal');
    const content = document.getElementById('balanceMatrixContent');

    const matrix = BalanceSimulator.runFullBalanceMatrix(500);
    const champs = ['galahad', 'pyromancer', 'shadowblade', 'woodman', 'acolyte'];

    let html = `
      <p class="matrix-desc">ทดสอบจำลองการต่อสู้ 500 ครั้งด้วย Monte-Carlo Simulation เพื่อตรวจสอบความสมดุลแบบ Rock-Paper-Scissors:</p>
      <table class="balance-table">
        <thead>
          <tr>
            <th>ผู้โจมตี \\ ผู้ตั้งรับ</th>
            ${champs.map(c => `<th>${CHAMPIONS[c].nameTh}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${champs.map(c1 => `
            <tr>
              <td><strong>${CHAMPIONS[c1].nameTh}</strong></td>
              ${champs.map(c2 => {
                const winRate = matrix[c1][c2];
                let colorClass = winRate >= 65 ? 'win-strong' : (winRate <= 35 ? 'win-weak' : 'win-fair');
                return `<td class="${colorClass}">${winRate}%</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="counter-guide">
        <h4>⚡ สรุปความสัมพันธ์ได้เปรียบ-เสียเปรียบ (Counter Matrix):</h4>
        <ul>
          <li>🛡️ <strong>อัศวิน (Knight):</strong> ชนะนักฆ่า (เกราะหนาทนดาเมจกายภาพ) | แพ้จอมเวท (เวททะลุเกราะ)</li>
          <li>🔮 <strong>จอมเวท (Mage):</strong> ชนะอัศวิน (เบิร์สเวทรุนแรง) | แพ้นักฆ่า (โดนกระโดดล้วงแนวหลังตายไว)</li>
          <li>🗡️ <strong>นักฆ่า (Rogue):</strong> ชนะจอมเวท & พลธนู (ล้วงแถวหลังเบิร์สคริติคอล) | แพ้อัศวิน (ตีไม่เข้า)</li>
          <li>🏹 <strong>พลธนู (Archer):</strong> ดาเมจกายภาพระยะไกลสม่ำเสมอ | แพ้นักฆ่ากระโดดใส่</li>
          <li>✨ <strong>นักบวช (Cleric):</strong> ฮีลต่อเนื่อง ต้านทานเวทสูง ลดดาเมจเบิร์สของจอมเวท</li>
        </ul>
      </div>
    `;

    content.innerHTML = html;
    modal.style.display = 'flex';
  }

  // Main render animation loop
  startLoop() {
    let lastTime = performance.now();

    const loop = (currentTime) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      this.battleEngine.update(dt);
      this.battleEngine.render();

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

// Bootstrap when window loads
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.startLoop();
});
