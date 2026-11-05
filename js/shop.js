// Shop and Economy System: handles unit recruitment, rerolling, XP/leveling, interest, and 3-to-1 star combining

import { GAME_CONFIG, CHAMPIONS, LEVEL_XP } from './constants.js';
import { Unit } from './unit.js';
import { sound } from './audio.js';

export class ShopManager {
  constructor(game) {
    this.game = game;
    this.shopSlots = new Array(GAME_CONFIG.SHOP_SIZE).fill(null);
    this.isLocked = false;
  }

  // Champion roll odds by player level [Tier 1 chance, Tier 3 chance]
  static TIER_ODDS = {
    1: [1.00, 0.00],
    2: [1.00, 0.00],
    3: [0.85, 0.15],
    4: [0.70, 0.30],
    5: [0.55, 0.45],
    6: [0.40, 0.60],
    7: [0.30, 0.70],
    8: [0.20, 0.80]
  };

  // Roll new units in shop
  refreshShop(isFree = false) {
    if (!isFree) {
      if (this.game.gold < GAME_CONFIG.REROLL_COST) return false;
      this.game.gold -= GAME_CONFIG.REROLL_COST;
      sound.playReroll();
    }

    const odds = ShopManager.TIER_ODDS[this.game.playerLevel] || [0.5, 0.5];
    const tier1Ids = Object.keys(CHAMPIONS).filter(id => CHAMPIONS[id].cost === 1);
    const tier3Ids = Object.keys(CHAMPIONS).filter(id => CHAMPIONS[id].cost === 3);

    for (let i = 0; i < GAME_CONFIG.SHOP_SIZE; i++) {
      const rollTier = Math.random() < odds[0] ? 1 : 3;
      const pool = rollTier === 1 ? tier1Ids : tier3Ids;
      const chosenId = pool[Math.floor(Math.random() * pool.length)];
      this.shopSlots[i] = {
        championId: chosenId,
        cost: CHAMPIONS[chosenId].cost,
        bought: false
      };
    }

    return true;
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

    // Check for 3-star auto combine!
    this.checkAutoCombine(item.championId);

    return true;
  }

  // Check if player has 3 identical copies to combine (1★ -> 2★, 2★ -> 3★)
  checkAutoCombine(championId) {
    const engine = this.game.battleEngine;

    // Helper to get all player units of this champion
    const getAllCopies = () => {
      const boardCopies = engine.units.filter(u => !u.isEnemy && u.championId === championId);
      const benchCopies = engine.bench.filter(u => u !== null && u.championId === championId);
      return [...boardCopies, ...benchCopies];
    };

    // 1. Check combining 3x 1-Star -> 1x 2-Star
    let copies1Star = getAllCopies().filter(u => u.starLevel === 1);
    if (copies1Star.length >= 3) {
      // Pick 1 to upgrade, remove the other 2
      const [kept, remove1, remove2] = copies1Star.slice(0, 3);

      this.removeUnitFromStorage(remove1);
      this.removeUnitFromStorage(remove2);

      kept.starLevel = 2;
      kept.initStats();
      sound.playCombine();
      this.game.showBanner(`★ รวมพลังสำเร็จ! 2★ ${kept.nameTh}`, '#f1c40f');

      // Check again for 3-star combination cascading!
      this.checkAutoCombine(championId);
      return;
    }

    // 2. Check combining 3x 2-Star -> 1x 3-Star
    let copies2Star = getAllCopies().filter(u => u.starLevel === 2);
    if (copies2Star.length >= 3) {
      const [kept, remove1, remove2] = copies2Star.slice(0, 3);

      this.removeUnitFromStorage(remove1);
      this.removeUnitFromStorage(remove2);

      kept.starLevel = 3;
      kept.initStats();
      sound.playCombine();
      this.game.showBanner(`★★★ ขั้นสูงสุด! 3★ ${kept.nameTh} ทรงพลัง!`, '#e056fd');
    }
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
    const baseCost = unit.cost;
    let refund = baseCost;
    if (unit.starLevel === 2) refund = baseCost * 3 - 1;
    if (unit.starLevel === 3) refund = baseCost * 9 - 2;

    this.game.gold += refund;
    sound.playBuy();
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
