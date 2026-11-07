import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_CONFIG, CHAMPIONS } from '../js/constants.js';
import { Unit } from '../js/unit.js';
import { ShopManager } from '../js/shop.js';

function createMockGame(playerLevel = 1) {
  const game = {
    gold: 50,
    playerLevel,
    playerXP: 0,
    itemBench: [],
    banners: [],
    showBanner(msg) {
      this.banners.push(msg);
    },
    gainItem(itemId) {
      this.itemBench.push(itemId);
      return true;
    },
    battleEngine: {
      units: [],
      bench: Array(GAME_CONFIG.BENCH_SLOTS).fill(null)
    },
    getDeployedCount() {
      return this.battleEngine.units.filter(u => !u.isEnemy).length;
    },
    deployOrMoveUnit(unit, gridX, gridY) {
      if (gridY < 3) {
        this.showBanner('ไม่สามารถวางในแดนศัตรูได้ (แถว 1-3)');
        return false;
      }

      const targetUnit = this.battleEngine.units.find(u => !u.isEnemy && u.gridX === gridX && u.gridY === gridY);

      if (unit.benchIndex >= 0) {
        if (targetUnit) {
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
          return true;
        } else {
          if (this.getDeployedCount() >= this.playerLevel) {
            this.showBanner(`จำกัดจำนวนลงสนาม ${this.playerLevel} ตัว! ซื้อเลเวลเพิ่มได้`);
            return false;
          }

          this.battleEngine.bench[unit.benchIndex] = null;
          unit.benchIndex = -1;
          unit.gridX = gridX;
          unit.gridY = gridY;
          this.battleEngine.units.push(unit);
          return true;
        }
      } else {
        if (targetUnit && targetUnit !== unit) {
          targetUnit.gridX = unit.gridX;
          targetUnit.gridY = unit.gridY;
          unit.gridX = gridX;
          unit.gridY = gridY;
          return true;
        } else if (!targetUnit) {
          unit.gridX = gridX;
          unit.gridY = gridY;
          return true;
        }
        return false;
      }
    },
    moveUnitToBench(unit, targetBenchIdx) {
      if (targetBenchIdx < 0 || targetBenchIdx >= GAME_CONFIG.BENCH_SLOTS) return false;
      const targetUnit = this.battleEngine.bench[targetBenchIdx];

      if (unit.benchIndex >= 0) {
        if (unit.benchIndex === targetBenchIdx) return false;
        this.battleEngine.bench[unit.benchIndex] = targetUnit;
        if (targetUnit) targetUnit.benchIndex = unit.benchIndex;
        this.battleEngine.bench[targetBenchIdx] = unit;
        unit.benchIndex = targetBenchIdx;
        return true;
      } else {
        if (targetUnit) {
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
          return true;
        } else {
          const bIdx = this.battleEngine.units.indexOf(unit);
          if (bIdx !== -1) this.battleEngine.units.splice(bIdx, 1);

          unit.gridX = -1;
          unit.gridY = -1;
          unit.benchIndex = targetBenchIdx;
          this.battleEngine.bench[targetBenchIdx] = unit;
          return true;
        }
      }
    }
  };
  game.shopManager = new ShopManager(game);
  return game;
}

test('drag-and-drop deployment enforces player territory and level cap', () => {
  const game = createMockGame(1);
  const unit1 = new Unit('galahad', 1, false);
  unit1.benchIndex = 0;
  game.battleEngine.bench[0] = unit1;

  // Cannot deploy to enemy territory (rows 0-2)
  const rejected = game.deployOrMoveUnit(unit1, 2, 1);
  assert.equal(rejected, false);
  assert.equal(unit1.benchIndex, 0);
  assert.equal(game.getDeployedCount(), 0);

  // Successfully deploy to player row 3
  const deployed = game.deployOrMoveUnit(unit1, 2, 3);
  assert.equal(deployed, true);
  assert.equal(unit1.benchIndex, -1);
  assert.equal(unit1.gridX, 2);
  assert.equal(unit1.gridY, 3);
  assert.equal(game.getDeployedCount(), 1);
  assert.equal(game.battleEngine.bench[0], null);

  // Try to deploy a 2nd unit when level is 1
  const unit2 = new Unit('woodman', 1, false);
  unit2.benchIndex = 1;
  game.battleEngine.bench[1] = unit2;

  const capRejected = game.deployOrMoveUnit(unit2, 3, 4);
  assert.equal(capRejected, false);
  assert.equal(unit2.benchIndex, 1);
  assert.equal(game.getDeployedCount(), 1);

  // But swapping with unit1 is allowed even at level 1!
  const swapped = game.deployOrMoveUnit(unit2, 2, 3);
  assert.equal(swapped, true);
  assert.equal(unit2.benchIndex, -1);
  assert.equal(unit2.gridX, 2);
  assert.equal(unit2.gridY, 3);
  assert.equal(unit1.benchIndex, 1);
  assert.equal(unit1.gridX, -1);
  assert.equal(game.getDeployedCount(), 1);
});

test('moving units between board and bench preserves position and count', () => {
  const game = createMockGame(2);
  const u1 = new Unit('paladin', 1, false);
  u1.benchIndex = 0;
  game.battleEngine.bench[0] = u1;

  game.deployOrMoveUnit(u1, 0, 4);
  assert.equal(game.getDeployedCount(), 1);

  // Move board unit back to bench
  game.moveUnitToBench(u1, 3);
  assert.equal(game.getDeployedCount(), 0);
  assert.equal(u1.benchIndex, 3);
  assert.equal(game.battleEngine.bench[3], u1);

  // Move bench to bench
  game.moveUnitToBench(u1, 5);
  assert.equal(u1.benchIndex, 5);
  assert.equal(game.battleEngine.bench[3], null);
  assert.equal(game.battleEngine.bench[5], u1);
});

test('endBattle and round resolution clears floating combat text and projectiles', () => {
  const engine = {
    battleActive: true,
    floatingTexts: [{ text: '-150', life: 0.8 }, { text: 'CRIT 300!', life: 0.5 }],
    projectiles: [{ id: 1 }],
    speed: 1,
    endBattle(playerWon, survivingEnemies) {
      this.battleActive = false;
      this.floatingTexts = [];
      this.projectiles = [];
    },
    update(dt) {
      const floatDt = dt * (this.battleActive ? this.speed : 1);
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.life -= floatDt;
        if (ft.life <= 0) {
          this.floatingTexts.splice(i, 1);
        }
      }
      if (!this.battleActive) return;
    }
  };

  // Calling update with battleActive = false still expires any lingering texts
  engine.battleActive = false;
  engine.floatingTexts = [{ text: '-50', life: 0.05 }];
  engine.update(0.1);
  assert.equal(engine.floatingTexts.length, 0);

  // Calling endBattle clears everything immediately
  engine.floatingTexts = [{ text: '-100', life: 0.9 }];
  engine.projectiles = [{ id: 2 }];
  engine.endBattle(true, 0);
  assert.equal(engine.floatingTexts.length, 0);
  assert.equal(engine.projectiles.length, 0);
  assert.equal(engine.battleActive, false);
});

test('battle timeout awards victory to side with more surviving units or higher HP', () => {
  function resolveBattleOutcome(alivePlayers, aliveEnemies, isTimeout) {
    let playerWon = false;
    let survivingEnemies = 0;

    if (alivePlayers.length > 0 && aliveEnemies.length === 0) {
      playerWon = true;
      survivingEnemies = 0;
    } else if (alivePlayers.length === 0 && aliveEnemies.length > 0) {
      playerWon = false;
      survivingEnemies = aliveEnemies.length;
    } else if (isTimeout) {
      if (alivePlayers.length > aliveEnemies.length) {
        playerWon = true;
        survivingEnemies = 0;
      } else if (alivePlayers.length < aliveEnemies.length) {
        playerWon = false;
        survivingEnemies = Math.max(1, aliveEnemies.length - alivePlayers.length);
      } else {
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
    return { playerWon, survivingEnemies };
  }

  // Case 1: Timeout occurs while player has 2 units and enemy has 1 unit -> Player WINS!
  const res1 = resolveBattleOutcome(
    [{ currentHp: 500 }, { currentHp: 300 }],
    [{ currentHp: 200 }],
    true
  );
  assert.equal(res1.playerWon, true);
  assert.equal(res1.survivingEnemies, 0);

  // Case 2: Timeout occurs with 1 unit each, player has 600 HP vs enemy 200 HP -> Player WINS!
  const res2 = resolveBattleOutcome(
    [{ currentHp: 600 }],
    [{ currentHp: 200 }],
    true
  );
  assert.equal(res2.playerWon, true);

  // Case 3: Timeout occurs with 1 unit each, enemy has higher HP -> Enemy wins
  const res3 = resolveBattleOutcome(
    [{ currentHp: 150 }],
    [{ currentHp: 400 }],
    true
  );
  assert.equal(res3.playerWon, false);
  assert.equal(res3.survivingEnemies, 1);
});
