// Main Game Controller: Manages state machine, user inputs, round flow, and enemy waves

import { GAME_CONFIG, CLASSES, CHAMPIONS, LEVEL_XP } from './constants.js';
import { BattleEngine } from './battleEngine.js';
import { ShopManager } from './shop.js';
import { Unit } from './unit.js';
import { sound } from './audio.js';
import { BalanceSimulator } from './balanceSimulator.js';
import { ITEMS, ITEM_BENCH_SIZE, itemDropsForWin } from './items.js';
import { planEnemyWave, eliteStatMultiplier } from './waves.js';
import { buildRunSummary } from './runSummary.js';

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
    this.selectedItemIndex = null;
    this.itemBench = [];
    this.dragState = null;
    this.draggingItemIndex = null;
    this.runStats = { damage: {}, healing: {} };
    this.hoveredUnit = null;
    this.inspectedUnit = null;
    this.speed = 1;
    this.activeTab = 'TRAITS'; // 'TRAITS', 'DPS', 'INSPECTOR'
    this.dpsFilter = 'ALL'; // 'ALL', 'PLAYER', 'ENEMY'

    // Setup hooks
    this.battleEngine.onBattleEnd = (playerWon, survivingEnemies, isTimeout = false) => {
      this.handleBattleResolved(playerWon, survivingEnemies, isTimeout);
    };

    // Pre-saved player board composition for auto-restoring after combat
    this.savedBoardUnits = [];

    this.initInputListeners();
    this.initItemDragListeners();
    this.initUIListeners();

    // Initial shop roll
    this.shopManager.refreshShop(true);

    // Give player 1 starter unit on bench and take that copy out of the pool
    this.shopManager.pool.draw('galahad');
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

  // Coordinate and tile resolution helpers
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  getTileAtCanvasCoords(x, y) {
    if (y >= this.battleEngine.benchY - 15) {
      const slotWidth = this.canvas.width / GAME_CONFIG.BENCH_SLOTS;
      const benchIndex = Math.floor(x / slotWidth);
      if (benchIndex >= 0 && benchIndex < GAME_CONFIG.BENCH_SLOTS) {
        return { type: 'BENCH', benchIndex };
      }
      return null;
    }

    const cellW = this.battleEngine.cellWidth;
    const cellH = this.battleEngine.cellHeight;
    const gridX = Math.floor(x / cellW);
    const gridY = Math.floor(y / cellH);

    if (gridX >= 0 && gridX < GAME_CONFIG.GRID_COLS && gridY >= 0 && gridY < GAME_CONFIG.GRID_ROWS) {
      return { type: 'BOARD', gridX, gridY };
    }
    return null;
  }

  getUnitAtCanvasCoords(x, y) {
    const tile = this.getTileAtCanvasCoords(x, y);
    if (!tile) return null;

    if (tile.type === 'BENCH') {
      return this.battleEngine.bench[tile.benchIndex] || null;
    }
    if (tile.type === 'BOARD') {
      return this.battleEngine.units.find(u => !u.isEnemy && u.gridX === tile.gridX && u.gridY === tile.gridY) || null;
    }
    return null;
  }

  setSelectedUnit(unit) {
    this.selectedUnit = unit;
    this.battleEngine.selectedUnit = unit;
    this.updateUnitInspector();
  }

  isPointerOverSellButton(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    return !!(el && (el.id === 'sellBtn' || el.closest('#sellBtn')));
  }

  // Deploy or reposition unit on board
  deployOrMoveUnit(unit, gridX, gridY) {
    if (gridY < 3) {
      this.showBanner('ไม่สามารถวางในแดนศัตรูได้ (แถว 1-3)', '#e74c3c');
      return false;
    }

    const targetUnit = this.battleEngine.units.find(u => !u.isEnemy && u.gridX === gridX && u.gridY === gridY);

    if (unit.benchIndex >= 0) {
      // Deploying from Bench to Board
      if (targetUnit) {
        // Swap bench unit with existing board unit
        this.battleEngine.bench[unit.benchIndex] = targetUnit;
        targetUnit.benchIndex = unit.benchIndex;
        targetUnit.gridX = -1;
        targetUnit.gridY = -1;

        const idx = this.battleEngine.units.indexOf(targetUnit);
        if (idx !== -1) this.battleEngine.units.splice(idx, 1);

        unit.benchIndex = -1;
        unit.gridX = gridX;
        unit.gridY = gridY;
        this.battleEngine.units.push(unit);

        sound.playDeploy();
        this.showBanner(`สลับตำแหน่ง: ${unit.nameTh} กับ ${targetUnit.nameTh}`, '#3498db');
        return true;
      } else {
        // Deploy to empty tile
        if (this.getDeployedCount() >= this.playerLevel) {
          this.showBanner(`จำกัดจำนวนลงสนาม ${this.playerLevel} ตัว! ซื้อเลเวลเพิ่มได้`, '#e74c3c');
          return false;
        }

        this.battleEngine.bench[unit.benchIndex] = null;
        unit.benchIndex = -1;
        unit.gridX = gridX;
        unit.gridY = gridY;
        this.battleEngine.units.push(unit);

        sound.playDeploy();
        this.showBanner(`วาง ${unit.nameTh} ลงสนาม`, '#2ecc71');
        return true;
      }
    } else {
      // Repositioning from Board to Board
      if (targetUnit && targetUnit !== unit) {
        targetUnit.gridX = unit.gridX;
        targetUnit.gridY = unit.gridY;
        unit.gridX = gridX;
        unit.gridY = gridY;
        sound.playDrop();
        this.showBanner(`สลับตำแหน่ง ${unit.nameTh} กับ ${targetUnit.nameTh}`, '#3498db');
        return true;
      } else if (!targetUnit) {
        unit.gridX = gridX;
        unit.gridY = gridY;
        sound.playDrop();
        return true;
      }
      return false;
    }
  }

  // Move unit to bench
  moveUnitToBench(unit, targetBenchIdx) {
    if (targetBenchIdx < 0 || targetBenchIdx >= GAME_CONFIG.BENCH_SLOTS) return false;
    const targetUnit = this.battleEngine.bench[targetBenchIdx];

    if (unit.benchIndex >= 0) {
      if (unit.benchIndex === targetBenchIdx) return false;
      // Bench-to-bench move / swap
      this.battleEngine.bench[unit.benchIndex] = targetUnit;
      if (targetUnit) targetUnit.benchIndex = unit.benchIndex;
      this.battleEngine.bench[targetBenchIdx] = unit;
      unit.benchIndex = targetBenchIdx;
      sound.playDrop();
      return true;
    } else {
      // Board-to-bench move / swap
      if (targetUnit) {
        // Swap board unit with bench unit
        const bIdx = this.battleEngine.units.indexOf(unit);
        if (bIdx !== -1) this.battleEngine.units.splice(bIdx, 1);

        this.battleEngine.bench[targetBenchIdx] = unit;
        targetUnit.benchIndex = -1;
        targetUnit.gridX = unit.gridX;
        targetUnit.gridY = unit.gridY;

        unit.benchIndex = targetBenchIdx;
        unit.gridX = -1;
        unit.gridY = -1;

        this.battleEngine.units.push(targetUnit);
        sound.playDrop();
        this.showBanner(`สลับ ${unit.nameTh} กลับม้านั่งสำรอง`, '#3498db');
        return true;
      } else {
        // Place board unit on empty bench slot
        const bIdx = this.battleEngine.units.indexOf(unit);
        if (bIdx !== -1) this.battleEngine.units.splice(bIdx, 1);

        unit.gridX = -1;
        unit.gridY = -1;
        unit.benchIndex = targetBenchIdx;
        this.battleEngine.bench[targetBenchIdx] = unit;

        sound.playDrop();
        this.showBanner(`นำ ${unit.nameTh} กลับม้านั่งสำรอง`, '#3498db');
        return true;
      }
    }
  }

  // Handle Drag-and-Drop and Click pointer listeners
  initInputListeners() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'PREP') return;
      const { x, y } = this.getCanvasCoords(e);

      // If an item is currently selected, clicking a unit equips it
      if (this.selectedItemIndex !== null) {
        const targetUnit = this.getUnitAtCanvasCoords(x, y);
        if (targetUnit) {
          this.equipSelectedItem(targetUnit);
        } else {
          this.selectedItemIndex = null;
        }
        this.updateUI();
        return;
      }

      const unit = this.getUnitAtCanvasCoords(x, y);
      if (unit) {
        this.dragState = {
          pointerId: e.pointerId,
          unit: unit,
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          isDragging: false
        };
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      } else {
        // Empty tile clicked - if we had a selected unit, move it here
        const tile = this.getTileAtCanvasCoords(x, y);
        if (this.selectedUnit && tile) {
          if (tile.type === 'BOARD') {
            this.deployOrMoveUnit(this.selectedUnit, tile.gridX, tile.gridY);
          } else if (tile.type === 'BENCH') {
            this.moveUnitToBench(this.selectedUnit, tile.benchIndex);
          }
          this.setSelectedUnit(null);
          this.updateUI();
        } else if (this.selectedUnit) {
          this.setSelectedUnit(null);
          this.updateUI();
        }
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragState) {
        if (this.phase === 'PREP') {
          const { x, y } = this.getCanvasCoords(e);
          const hovered = this.getUnitAtCanvasCoords(x, y);
          this.canvas.style.cursor = hovered ? 'grab' : 'default';
        }
        return;
      }

      const { x, y } = this.getCanvasCoords(e);
      const dist = Math.hypot(x - this.dragState.startX, y - this.dragState.startY);

      if (!this.dragState.isDragging && dist > 5) {
        this.dragState.isDragging = true;
        this.battleEngine.draggedUnit = this.dragState.unit;
        this.canvas.style.cursor = 'grabbing';
        this.setSelectedUnit(null);
      }

      if (this.dragState.isDragging) {
        this.dragState.currentX = x;
        this.dragState.currentY = y;
        this.battleEngine.dragPosition = { x, y };

        const sellBtn = document.getElementById('sellBtn');
        const isOverSell = this.isPointerOverSellButton(e.clientX, e.clientY);
        if (isOverSell) {
          sellBtn.classList.add('drag-hover-sell');
          this.battleEngine.dragTargetTile = null;
        } else {
          sellBtn.classList.remove('drag-hover-sell');
          const tile = this.getTileAtCanvasCoords(x, y);
          if (tile) {
            if (tile.type === 'BOARD') {
              const isPlayerTerritory = tile.gridY >= 3;
              let valid = isPlayerTerritory;
              if (isPlayerTerritory && this.dragState.unit.benchIndex >= 0) {
                const existing = this.battleEngine.units.find(u => !u.isEnemy && u.gridX === tile.gridX && u.gridY === tile.gridY);
                if (!existing && this.getDeployedCount() >= this.playerLevel) {
                  valid = false;
                }
              }
              this.battleEngine.dragTargetTile = { type: 'BOARD', gridX: tile.gridX, gridY: tile.gridY, valid };
            } else if (tile.type === 'BENCH') {
              this.battleEngine.dragTargetTile = { type: 'BENCH', benchIndex: tile.benchIndex, valid: true };
            }
          } else {
            this.battleEngine.dragTargetTile = null;
          }
        }
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragState) return;

      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}

      const sellBtn = document.getElementById('sellBtn');
      sellBtn.classList.remove('drag-hover-sell');

      if (this.dragState.isDragging) {
        const isOverSell = this.isPointerOverSellButton(e.clientX, e.clientY);
        if (isOverSell) {
          const sold = this.dragState.unit;
          this.shopManager.sellUnit(sold);
          this.setSelectedUnit(null);
          this.showBanner(`ขาย ${sold.nameTh} สำเร็จ! ได้รับทองคืน`, '#2ecc71');
        } else {
          const { x, y } = this.getCanvasCoords(e);
          const tile = this.getTileAtCanvasCoords(x, y);
          if (tile) {
            if (tile.type === 'BOARD') {
              this.deployOrMoveUnit(this.dragState.unit, tile.gridX, tile.gridY);
            } else if (tile.type === 'BENCH') {
              this.moveUnitToBench(this.dragState.unit, tile.benchIndex);
            }
          }
        }
      } else {
        // Pure Click gesture
        const clickedUnit = this.dragState.unit;
        if (this.selectedUnit === clickedUnit) {
          this.setSelectedUnit(null);
        } else if (this.selectedUnit) {
          // Swap previously selected unit with clicked unit
          if (clickedUnit.benchIndex >= 0 && this.selectedUnit.benchIndex >= 0) {
            this.moveUnitToBench(this.selectedUnit, clickedUnit.benchIndex);
          } else if (clickedUnit.benchIndex >= 0 && this.selectedUnit.gridX >= 0) {
            this.moveUnitToBench(this.selectedUnit, clickedUnit.benchIndex);
          } else if (clickedUnit.gridX >= 0) {
            this.deployOrMoveUnit(this.selectedUnit, clickedUnit.gridX, clickedUnit.gridY);
          }
          this.setSelectedUnit(null);
        } else {
          this.setSelectedUnit(clickedUnit);
          this.showBanner(`เลือก: ${clickedUnit.nameTh} (${clickedUnit.starLevel}★)`, '#3498db');
        }
      }

      this.dragState = null;
      this.battleEngine.draggedUnit = null;
      this.battleEngine.dragPosition = null;
      this.battleEngine.dragTargetTile = null;
      this.canvas.style.cursor = 'default';
      this.updateUI();
    });

    this.canvas.addEventListener('pointercancel', (e) => {
      if (this.dragState) {
        document.getElementById('sellBtn').classList.remove('drag-hover-sell');
        this.dragState = null;
        this.battleEngine.draggedUnit = null;
        this.battleEngine.dragPosition = null;
        this.battleEngine.dragTargetTile = null;
        this.canvas.style.cursor = 'default';
        this.updateUI();
      }
    });
  }

  // Setup HTML5 Drag and Drop listeners for items
  initItemDragListeners() {
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.draggingItemIndex === null || this.phase !== 'PREP') return;

      const { x, y } = this.getCanvasCoords(e);
      const targetUnit = this.getUnitAtCanvasCoords(x, y);
      this.battleEngine.itemDragHoverUnit = targetUnit;
      e.dataTransfer.dropEffect = targetUnit ? 'copy' : 'none';
    });

    this.canvas.addEventListener('dragleave', () => {
      this.battleEngine.itemDragHoverUnit = null;
    });

    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.draggingItemIndex === null || this.phase !== 'PREP') return;

      const { x, y } = this.getCanvasCoords(e);
      const targetUnit = this.getUnitAtCanvasCoords(x, y);
      if (targetUnit) {
        this.selectedItemIndex = this.draggingItemIndex;
        this.equipSelectedItem(targetUnit);
      } else {
        this.showBanner('กรุณาลากไอเทมไปวางบนตัวละคร', '#f39c12');
      }

      this.draggingItemIndex = null;
      this.battleEngine.itemDragHoverUnit = null;
      this.updateUI();
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
        const sold = this.selectedUnit;
        this.shopManager.sellUnit(sold);
        this.setSelectedUnit(null);
        this.updateUI();
        this.showBanner(`ขาย ${sold.nameTh} สำเร็จ! ได้รับทองคืน`, '#2ecc71');
      } else {
        this.showBanner('คลิกเลือกตัวละคร หรือลากตัวละครมาวางที่นี่เพื่อขาย!', '#f39c12');
      }
    });

    // Sidebar tabs toggle
    const tabs = [
      { btn: 'tabTraitsBtn', content: 'synergiesTabContent', key: 'TRAITS' },
      { btn: 'tabDpsBtn', content: 'dpsTabContent', key: 'DPS' },
      { btn: 'tabInfoBtn', content: 'unitInspectorTabContent', key: 'INSPECTOR' }
    ];
    tabs.forEach(t => {
      const btn = document.getElementById(t.btn);
      if (!btn) return;
      btn.addEventListener('click', () => {
        tabs.forEach(o => {
          const b = document.getElementById(o.btn);
          const c = document.getElementById(o.content);
          if (b) b.classList.toggle('active', o.key === t.key);
          if (c) {
            c.classList.toggle('active', o.key === t.key);
            c.style.display = o.key === t.key ? 'block' : 'none';
          }
        });
        this.activeTab = t.key;
        this.updateUI();
      });
    });

    // DPS filters
    ['dpsFilterAll', 'dpsFilterPlayer', 'dpsFilterEnemy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          ['dpsFilterAll', 'dpsFilterPlayer', 'dpsFilterEnemy'].forEach(x => {
            const b = document.getElementById(x);
            if (b) b.classList.toggle('active', x === id);
          });
          this.dpsFilter = id === 'dpsFilterPlayer' ? 'PLAYER' : (id === 'dpsFilterEnemy' ? 'ENEMY' : 'ALL');
          this.updateDpsMeter();
        });
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

    document.getElementById('restartBtn').addEventListener('click', () => {
      window.location.reload();
    });
  }

  gainItem(itemId) {
    if (this.itemBench.length >= ITEM_BENCH_SIZE) return false;
    this.itemBench.push(itemId);
    return true;
  }

  equipSelectedItem(unit) {
    if (this.selectedItemIndex === null) return;
    const itemId = this.itemBench[this.selectedItemIndex];
    if (!itemId) return;
    const previous = unit.itemId;
    this.itemBench.splice(this.selectedItemIndex, 1);
    unit.itemId = itemId;
    if (previous) this.itemBench.push(previous);
    unit.initStats();
    this.selectedItemIndex = null;
    this.setSelectedUnit(unit);
    sound.playDeploy();
    this.showBanner(`ใส่ ${ITEMS[itemId].nameTh} ให้ ${unit.nameTh}`, '#f1c40f');
  }

  // Start Combat
  startCombatPhase() {
    this.phase = 'BATTLE';
    this.setSelectedUnit(null);
    this.dragState = null;
    this.battleEngine.draggedUnit = null;
    this.battleEngine.dragPosition = null;
    this.battleEngine.dragTargetTile = null;
    this.canvas.style.cursor = 'default';
    document.getElementById('readyBtn').disabled = true;
    document.getElementById('readyBtn').innerText = '⚔️ กำลังต่อสู้...';

    // Save snapshot of player's board placement
    this.savedBoardUnits = this.battleEngine.units.filter(u => !u.isEnemy).map(u => ({
      championId: u.championId,
      starLevel: u.starLevel,
      gridX: u.gridX,
      gridY: u.gridY,
      itemId: u.itemId
    }));

    const enemies = this.generateEnemyWave(this.round);

    this.battleEngine.startBattle(enemies);
    this.updateUI();
  }

  generateEnemyWave(roundNum) {
    const plan = planEnemyWave(roundNum);
    const eliteMult = eliteStatMultiplier(plan.elite);
    return plan.units.map(spawn => {
      const unit = new Unit(spawn.championId, spawn.star, true);
      unit.gridX = spawn.gridX;
      unit.gridY = spawn.gridY;
      unit.eliteMultiplier = eliteMult;
      unit.initStats();
      return unit;
    });
  }

  // Handle combat finish
  recordCombatStats() {
    for (const unit of this.battleEngine.units) {
      if (unit.isEnemy) continue;
      this.runStats.damage[unit.championId] = (this.runStats.damage[unit.championId] || 0) + unit.totalDamageDealt;
      this.runStats.healing[unit.championId] = (this.runStats.healing[unit.championId] || 0) + unit.totalHealingDone;
    }
  }

  handleBattleResolved(playerWon, survivingEnemies, isTimeout = false) {
    this.battleEngine.floatingTexts = [];
    this.battleEngine.projectiles = [];
    this.recordCombatStats();
    this.phase = 'PREP';
    document.getElementById('readyBtn').disabled = false;
    document.getElementById('readyBtn').innerText = '⚔️ เริ่มต่อสู้ (Ready)';

    const timerBadge = document.getElementById('battleTimerBadge');
    if (timerBadge) timerBadge.style.display = 'none';

    if (playerWon) {
      const drops = itemDropsForWin(this.round);
      const names = [];
      for (const itemId of drops) {
        if (this.gainItem(itemId)) names.push(ITEMS[itemId].nameTh);
      }
      const dropText = names.length ? ` ได้ ${names.join(', ')}` : ' (คลังไอเทมเต็ม)';
      const winMsg = isTimeout
        ? `⏰ หมดเวลา! ชนะด้วยยูนิตที่เหลือในรอบที่ ${this.round}!${dropText}`
        : `🎉 ชนะรอบที่ ${this.round}!${dropText}`;
      this.showBanner(winMsg, '#2ecc71');
      this.shopManager.awardRoundIncome(true);
      this.round++;
    } else {
      // Deduct player HP: 2 base + 2 per surviving enemy
      const damageTaken = 2 + (survivingEnemies * 2);
      this.playerHp = Math.max(0, this.playerHp - damageTaken);
      const lossMsg = isTimeout
        ? `⏰ หมดเวลา! พ่ายแพ้ตามจำนวนยูนิต เสียพลังชีวิต ${damageTaken} HP`
        : `💀 พ่ายแพ้! เสียพลังชีวิต ${damageTaken} HP`;
      this.showBanner(lossMsg, '#e74c3c');
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
      u.itemId = snap.itemId || null;
      u.initStats();
      return u;
    });

    // Auto reroll shop if not locked
    if (!this.shopManager.isLocked) {
      this.shopManager.refreshShop(true);
    }

    this.updateUI();
  }

  handleGameOver() {
    this.phase = 'DONE';
    document.getElementById('readyBtn').disabled = true;
    const summary = buildRunSummary({
      round: this.round,
      gold: this.gold,
      level: this.playerLevel,
      damage: this.runStats.damage,
      healing: this.runStats.healing,
      comp: this.savedBoardUnits
    });
    this.showBanner(`GAME OVER! พ่ายแพ้ในรอบที่ ${summary.roundReached}`, '#e74c3c');

    const top = summary.topDamage
      ? `${summary.topDamage.name} (${summary.topDamage.amount})`
      : 'ยังไม่มีดาเมจ';
    const comp = summary.comp.length
      ? summary.comp.map(unit => `${unit.name} ${unit.star}★${unit.itemId ? ' +' + ITEMS[unit.itemId].nameTh : ''}`).join('<br>')
      : 'ไม่ได้วางตัวลงสนาม';

    document.getElementById('gameOverStats').innerHTML = `
      <p>พ่ายแพ้ในรอบที่ <strong>${summary.roundReached}</strong></p>
      <p>เลเวล ${summary.level} · ทองคงเหลือ ${summary.gold}</p>
      <p>ดาเมจสูงสุด: ${top}</p>
      <h3>ทีมตอนจบ</h3>
      <p>${comp}</p>
    `;
    document.getElementById('gameOverModal').style.display = 'flex';
  }

  renderItemTray() {
    const tray = document.getElementById('itemTray');
    if (!tray) return;
    tray.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'item-tray-label';
    label.textContent = 'ไอเทม';
    tray.appendChild(label);

    if (this.itemBench.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'item-tray-empty';
      empty.textContent = 'ชนะรอบแล้วลากไอเทมไปใส่ตัวละคร หรือคลิกเลือก';
      tray.appendChild(empty);
      return;
    }

    this.itemBench.forEach((itemId, index) => {
      const item = ITEMS[itemId];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `item-chip ${this.selectedItemIndex === index ? 'selected' : ''}`;
      chip.innerHTML = `<span>${item.icon} ${item.nameTh}</span><small>${item.description}</small>`;

      // Drag-and-drop item support
      chip.setAttribute('draggable', 'true');
      chip.addEventListener('dragstart', (e) => {
        if (this.phase !== 'PREP') {
          e.preventDefault();
          return;
        }
        this.draggingItemIndex = index;
        e.dataTransfer.setData('text/plain', itemId);
        e.dataTransfer.effectAllowed = 'copyMove';
      });

      chip.addEventListener('dragend', () => {
        this.draggingItemIndex = null;
        this.battleEngine.itemDragHoverUnit = null;
      });

      chip.addEventListener('click', () => {
        if (this.phase !== 'PREP') return;
        this.selectedItemIndex = this.selectedItemIndex === index ? null : index;
        this.setSelectedUnit(null);
        if (this.selectedItemIndex !== null) {
          this.showBanner(`เลือก ${item.nameTh}: ลากหรือคลิกใส่ตัวละคร`, '#f1c40f');
        }
        this.updateUI();
      });
      tray.appendChild(chip);
    });
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

    this.renderItemTray();

    this.shopManager.shopSlots.forEach((slot, idx) => {
      const card = document.createElement('div');
      if (!slot) {
        card.className = 'shop-card bought';
        card.innerHTML = '<div class="card-skill">พูลหมด</div>';
        shopContainer.appendChild(card);
        return;
      }
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

    // 3. Synergies, Unit Inspector, DPS Meter
    this.updateSynergiesSidebar();
    this.updateUnitInspector();
    this.updateDpsMeter();
  }

  // Render Unit Inspector Details in sidebar
  updateUnitInspector() {
    const details = document.getElementById('unitInspectorDetails');
    if (!details) return;

    const unit = this.selectedUnit;
    if (!unit) {
      details.innerHTML = `
        <div class="inspector-empty">
          <span>👆</span>
          <p>คลิกหรือลากตัวละครบนสนามหรือม้านั่ง เพื่อตรวจสอบสเตตัสและจัดทัพ</p>
        </div>
      `;
      return;
    }

    const champ = CHAMPIONS[unit.championId];
    const cls = CLASSES[unit.heroClass];
    const itemData = unit.itemId ? ITEMS[unit.itemId] : null;

    details.innerHTML = `
      <div class="inspector-header">
        <h4 style="color: ${cls.color}">${cls.icon} ${unit.nameTh} (${unit.starLevel}★)</h4>
        <small class="inspector-tag">${cls.nameTh} · Cost ${unit.cost} 🪙</small>
      </div>
      <div class="inspector-stats-grid">
        <div class="stat-row"><span>❤️ HP:</span><strong>${unit.currentHp}/${unit.maxHp}</strong></div>
        <div class="stat-row"><span>💧 Mana:</span><strong>${unit.currentMana}/${unit.maxMana}</strong></div>
        <div class="stat-row"><span>⚔️ ATK:</span><strong>${unit.attack}</strong></div>
        <div class="stat-row"><span>🛡️ Armor:</span><strong>${unit.armor}</strong></div>
        <div class="stat-row"><span>✨ MR:</span><strong>${unit.magicResist}</strong></div>
        <div class="stat-row"><span>🏹 Range:</span><strong>${unit.range} ช่อง</strong></div>
      </div>
      <div class="inspector-skill">
        <h5>⚡ สกิล: ${champ.skill.nameTh}</h5>
        <p>${champ.skill.description}</p>
      </div>
      <div class="inspector-item">
        <h5>🎒 ไอเทมที่สวมใส่:</h5>
        ${itemData ? `<p><strong>${itemData.icon} ${itemData.nameTh}:</strong> ${itemData.description}</p>` : '<p class="placeholder-text">ยังไม่ได้สวมใส่ไอเทม (ลากไอเทมมาใส่ได้)</p>'}
      </div>
    `;
  }

  // Render Live DPS Meter in sidebar
  updateDpsMeter() {
    const list = document.getElementById('dpsList');
    if (!list) return;

    const allUnits = this.battleEngine.units;
    if (allUnits.length === 0) {
      list.innerHTML = '<p class="placeholder-text">เริ่มต่อสู้เพื่อดูสถิติดาเมจแบบเรียลไทม์</p>';
      return;
    }

    let filtered = allUnits;
    if (this.dpsFilter === 'PLAYER') filtered = allUnits.filter(u => !u.isEnemy);
    else if (this.dpsFilter === 'ENEMY') filtered = allUnits.filter(u => u.isEnemy);

    const maxDmg = Math.max(1, ...filtered.map(u => u.totalDamageDealt));

    list.innerHTML = filtered.map(u => {
      const pct = Math.min(100, Math.round((u.totalDamageDealt / maxDmg) * 100));
      const color = u.isEnemy ? '#e74c3c' : '#3498db';
      return `
        <div class="dps-row">
          <div class="dps-name">${u.isEnemy ? '👾' : '🛡️'} ${u.nameTh} ${u.starLevel}★</div>
          <div class="dps-bar-container">
            <div class="dps-bar" style="width: ${pct}%; background-color: ${color};"></div>
            <span class="dps-val">${u.totalDamageDealt}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render active synergies
  updateSynergiesSidebar() {
    const listEl = document.getElementById('synergiesList');
    listEl.innerHTML = '';

    const boardUnits = this.battleEngine.units.filter(u => !u.isEnemy);
    const activeTraits = this.battleEngine.applySynergies(boardUnits, false, false);

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
          <li>🏹 <strong>พลธนู (Archer):</strong> ชนะนักบวช (ยิงต่อเนื่องชนะการฮีล) | แพ้อัศวิน นักฆ่า และจอมเวท</li>
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

      if (this.phase === 'BATTLE') {
        const timerBadge = document.getElementById('battleTimerBadge');
        const timerText = document.getElementById('battleTimerText');
        if (timerBadge && timerText) {
          timerBadge.style.display = 'flex';
          const maxTime = GAME_CONFIG.MAX_BATTLE_TIME_SEC || 45;
          const timeLeft = Math.max(0, Math.ceil(maxTime - this.battleEngine.battleTimer));
          const overtimeStart = GAME_CONFIG.OVERTIME_START_SEC || 25;
          if (this.battleEngine.battleTimer > overtimeStart) {
            timerBadge.classList.add('overtime-active');
            timerText.innerText = `⚡ ${timeLeft}s`;
          } else {
            timerBadge.classList.remove('overtime-active');
            timerText.innerText = `${timeLeft}s`;
          }
        }

        if (this.activeTab === 'DPS') {
          this.dpsTick = (this.dpsTick || 0) + dt;
          if (this.dpsTick >= 0.25) {
            this.dpsTick = 0;
            this.updateDpsMeter();
          }
        }
      } else {
        const timerBadge = document.getElementById('battleTimerBadge');
        if (timerBadge && timerBadge.style.display !== 'none') {
          timerBadge.style.display = 'none';
        }
      }

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
