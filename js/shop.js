// Shop and Economy System: handles unit recruitment, rerolling, XP/leveling, interest, and pair star combining

import { GAME_CONFIG, CHAMPIONS, LEVEL_XP } from './constants.js';
import { Unit } from './unit.js';
import { sound } from './audio.js';
import { ChampionPool, copiesForStar } from './pool.js';

export const SHOP_COSTS = [1, 2, 3, 5];

export class ShopManager {
  constructor(game) {
    this.game = game;
    this.shopSlots = new Array(GAME_CONFIG.SHOP_SIZE).fill(null);
    this.isLocked = false;
    this.pool = new ChampionPool();
  }

  // Toggle shop lock state
  toggleLock() {
    this.isLocked = !this.isLocked;
    if (this.isLocked) {
      this.game.showBanner('🔒 ล็อคร้านค้าแล้ว (Shop Locked)', '#f1c40f');
    } else {
      this.game.showBanner('🔓 ปลดล็อคร้านค้าแล้ว (Shop Unlocked)', '#3498db');
    }
    sound.playBuy();
    return this.isLocked;
  }

  // Champion roll odds by player level [cost 1, cost 2, cost 3, cost 5]
  static TIER_ODDS = {
    1: [1.00, 0.00, 0.00, 0.00],
    2: [0.85, 0.15, 0.00, 0.00],
    3: [0.70, 0.25, 0.05, 0.00],
    4: [0.50, 0.30, 0.18, 0.02],
    5: [0.35, 0.30, 0.28, 0.07],
    6: [0.22, 0.28, 0.33, 0.17],
    7: [0.15, 0.20, 0.35, 0.30],
    8: [0.10, 0.15, 0.30, 0.45]
  };

  static rollCost(level, rng = Math.random) {
    const odds = ShopManager.TIER_ODDS[level] || ShopManager.TIER_ODDS[8];
    let roll = rng();
    for (let i = 0; i < SHOP_COSTS.length; i++) {
      roll -= odds[i];
      if (roll <= 0) return SHOP_COSTS[i];
    }
    return SHOP_COSTS[SHOP_COSTS.length - 1];
  }

  // Roll new units in shop. Unbought offers go back into the pool first.
  refreshShop(isFree = false, rng = Math.random) {
    if (!isFree) {
      if (this.game.gold < GAME_CONFIG.REROLL_COST) return false;
      this.game.gold -= GAME_CONFIG.REROLL_COST;
      sound.playReroll();
    }

    for (const slot of this.shopSlots) {
      if (slot && !slot.bought) this.pool.release(slot.championId, 1);
    }

    for (let i = 0; i < GAME_CONFIG.SHOP_SIZE; i++) {
      const chosenId = this.drawFromPool(rng);
      if (!chosenId) {
        this.shopSlots[i] = null;
        continue;
      }
      this.shopSlots[i] = {
        championId: chosenId,
        cost: CHAMPIONS[chosenId].cost,
        bought: false
      };
    }

    return true;
  }

  drawFromPool(rng = Math.random) {
    const firstCost = ShopManager.rollCost(this.game.playerLevel, rng);
    const costs = [firstCost, ...SHOP_COSTS.filter(cost => cost !== firstCost)];
    for (const cost of costs) {
      const id = this.pool.drawRandom(cost, rng);
      if (id) return id;
    }
    return null;
  }

  // Buy champion from slot (0..4)
  buySlot(index) {
    const item = this.shopSlots[index];
    if (!item || item.bought) return false;

    if (this.game.gold < item.cost) {
      this.game.showBanner('ทองไม่พอ! (Not enough gold)', '#e74c3c');
      return false;
    }

    // Find first empty bench slot
    const emptyBenchIndex = this.game.battleEngine.bench.findIndex(slot => slot === null);
    if (emptyBenchIndex === -1) {
      this.game.showBanner('ที่นั่งสำรองเต็ม! (Bench is full)', '#e74c3c');
      return false;
    }

    // Deduct gold
    this.game.gold -= item.cost;
    item.bought = true;
    sound.playBuy();

    // Create new unit on bench
    const newUnit = new Unit(item.championId, 1, false);
    newUnit.benchIndex = emptyBenchIndex;
    this.game.battleEngine.bench[emptyBenchIndex] = newUnit;

    this.checkAutoCombine(item.championId);

    return true;
  }

  // 1★+1★ becomes 2★, then 2★+2★ becomes 3★. Extra pairs cascade in the same buy.
  checkAutoCombine(championId) {
    const engine = this.game.battleEngine;
    const copies = [
      ...engine.units.filter(u => !u.isEnemy && u.championId === championId),
      ...engine.bench.filter(u => u !== null && u.championId === championId)
    ];

    const pair = copies.filter(u => u.starLevel === 1);
    if (pair.length >= 2) {
      this.mergePair(pair[0], pair[1], 2);
      return;
    }

    const upgraded = copies.filter(u => u.starLevel === 2);
    if (upgraded.length >= 2) {
      this.mergePair(upgraded[0], upgraded[1], 3);
    }
  }

  mergePair(kept, removed, nextStar) {
    this.removeUnitFromStorage(removed);
    this.returnEquippedItem(removed);
    kept.starLevel = nextStar;
    kept.initStats();
    sound.playCombine();
    if (nextStar === 3) {
      this.game.showBanner(`★★★ ขั้นสูงสุด! 3★ ${kept.nameTh} ทรงพลัง!`, '#e056fd');
    } else {
      this.game.showBanner(`★ รวมพลังสำเร็จ! 2★ ${kept.nameTh}`, '#f1c40f');
    }
    this.checkAutoCombine(kept.championId);
  }

  returnEquippedItem(unit) {
    if (!unit.itemId || typeof this.game.gainItem !== 'function') return;
    const returned = this.game.gainItem(unit.itemId);
    if (returned) unit.itemId = null;
  }

  // Remove a unit from wherever it is (board or bench)
  removeUnitFromStorage(unit) {
    const engine = this.game.battleEngine;
    if (unit.benchIndex >= 0) {
      engine.bench[unit.benchIndex] = null;
      unit.benchIndex = -1;
    } else {
      const idx = engine.units.indexOf(unit);
      if (idx !== -1) {
        engine.units.splice(idx, 1);
      }
    }
  }

  // Sell a unit for gold
  sellUnit(unit) {
    if (!unit) return;
    const copies = copiesForStar(unit.starLevel);
    const refund = Math.max(1, unit.cost * copies - Math.max(0, unit.starLevel - 1));

    this.game.gold += refund;
    sound.playBuy();
    this.pool.release(unit.championId, copies);
    this.returnEquippedItem(unit);
    this.removeUnitFromStorage(unit);
    this.game.showBanner(`ขาย ${unit.name} ได้รับ +${refund} ทอง`, '#f1c40f');
  }

  // Buy 4 XP for 4 Gold
  buyXP() {
    if (this.game.playerLevel >= GAME_CONFIG.MAX_LEVEL) {
      this.game.showBanner('เลเวลเต็มแล้ว! (Max Level)', '#95a5a6');
      return;
    }

    if (this.game.gold < GAME_CONFIG.XP_COST) {
      this.game.showBanner('ทองไม่พอซื้อ XP!', '#e74c3c');
      return;
    }

    this.game.gold -= GAME_CONFIG.XP_COST;
    this.game.playerXP += GAME_CONFIG.XP_AMOUNT;
    sound.playBuy();

    const neededXP = LEVEL_XP[this.game.playerLevel];
    if (this.game.playerXP >= neededXP) {
      this.game.playerXP -= neededXP;
      this.game.playerLevel++;
      sound.playCombine();
      this.game.showBanner(`LEVEL UP! เลเวล ${this.game.playerLevel} (ลงได้ ${this.game.playerLevel} ตัว)`, '#2ecc71');
    }
  }

  // Calculate and award round income (Base + Interest + Streak)
  awardRoundIncome(isWin) {
    // 1. Base income
    let income = GAME_CONFIG.BASE_ROUND_GOLD;

    // 2. Interest: 1 gold per 10 saved up to 5 max
    const interest = Math.min(GAME_CONFIG.MAX_INTEREST_GOLD, Math.floor(this.game.gold / 10));
    income += interest;

    // 3. Streak bonus
    if (isWin) {
      this.game.winStreak++;
      this.game.lossStreak = 0;
    } else {
      this.game.lossStreak++;
      this.game.winStreak = 0;
    }

    const currentStreak = Math.max(this.game.winStreak, this.game.lossStreak);
    let streakBonus = 0;
    if (currentStreak >= 5) streakBonus = 3;
    else if (currentStreak >= 3) streakBonus = 2;
    else if (currentStreak >= 2) streakBonus = 1;

    income += streakBonus;
    this.game.gold += income;

    // Free 1 XP each round
    if (this.game.playerLevel < GAME_CONFIG.MAX_LEVEL) {
      this.game.playerXP += 2;
      const neededXP = LEVEL_XP[this.game.playerLevel];
      if (this.game.playerXP >= neededXP) {
        this.game.playerXP -= neededXP;
        this.game.playerLevel++;
      }
    }

    return { base: GAME_CONFIG.BASE_ROUND_GOLD, interest, streakBonus, total: income };
  }
}
