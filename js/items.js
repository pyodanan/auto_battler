// Equipable items. A win drops one item; a boss round (every 5th) drops two.

export const ITEM_BENCH_SIZE = 6;

export const ITEMS = {
  longsword: {
    id: 'longsword',
    name: 'Longsword',
    nameTh: 'ดาบยาว',
    icon: '🗡️',
    description: 'พลังโจมตี +20%',
    apply(unit) {
      unit.attack = Math.round(unit.attack * 1.2);
    }
  },
  chainmail: {
    id: 'chainmail',
    name: 'Chainmail',
    nameTh: 'เกราะโซ่',
    icon: '🛡️',
    description: 'เกราะ +30',
    apply(unit) {
      unit.bonusArmor += 30;
    }
  },
  spellbook: {
    id: 'spellbook',
    name: 'Spellbook',
    nameTh: 'คัมภีร์เวท',
    icon: '📖',
    description: 'พลังเวท +30%',
    apply(unit) {
      unit.bonusMagicPower += 0.3;
    }
  },
  swiftbow: {
    id: 'swiftbow',
    name: 'Swift Bow',
    nameTh: 'คันธนูว่องไว',
    icon: '🏹',
    description: 'ความเร็วโจมตี +30%',
    apply(unit) {
      unit.bonusAttackSpeed += 0.3;
    }
  },
  talisman: {
    id: 'talisman',
    name: 'Talisman',
    nameTh: 'เครื่องราง',
    icon: '✨',
    description: 'ต้านทานเวท +25',
    apply(unit) {
      unit.bonusMagicResist += 25;
    }
  }
};

export function itemDropsForWin(round, rng = Math.random) {
  const count = round > 0 && round % 5 === 0 ? 2 : 1;
  const ids = Object.keys(ITEMS);
  const drops = [];
  for (let i = 0; i < count; i++) {
    drops.push(ids[Math.floor(rng() * ids.length)]);
  }
  return drops;
}

export function applyItemToUnit(unit) {
  const item = ITEMS[unit.itemId];
  if (item) item.apply(unit);
}
