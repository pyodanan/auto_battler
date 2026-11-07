import test from 'node:test';
import assert from 'node:assert/strict';

import { CHAMPIONS, CLASSES } from '../js/constants.js';
import { ChampionPool, POOL_SIZES, copiesForStar } from '../js/pool.js';
import { ShopManager } from '../js/shop.js';
import { Unit } from '../js/unit.js';
import { ITEMS, itemDropsForWin } from '../js/items.js';
import { planEnemyWave, waveThreat, isBossRound } from '../js/waves.js';
import { buildRunSummary } from '../js/runSummary.js';
import { BalanceSimulator } from '../js/balanceSimulator.js';

function createGame(level = 1) {
  const game = {
    gold: 50,
    playerLevel: level,
    playerXP: 0,
    winStreak: 0,
    lossStreak: 0,
    itemBench: [],
    banners: [],
    showBanner(message) {
      this.banners.push(message);
    },
    gainItem(itemId) {
      this.itemBench.push(itemId);
      return true;
    },
    battleEngine: {
      units: [],
      bench: Array(8).fill(null)
    }
  };
  game.shopManager = new ShopManager(game);
  return game;
}

test('every class has a champion at cost 1, 2, 3, and 5', () => {
  for (const cost of [1, 2, 3, 5]) {
    for (const classId of Object.keys(CLASSES)) {
      const found = Object.values(CHAMPIONS).some((champ) => champ.cost === cost && champ.heroClass === classId);
      assert.equal(found, true, `${classId} cost ${cost}`);
    }
  }
  for (const champ of Object.values(CHAMPIONS)) {
    assert.ok(POOL_SIZES[champ.cost], champ.id);
    assert.equal(typeof champ.skill.type, 'string', champ.id);
  }
});

test('pool draw and release stay inside the printed copy count', () => {
  const pool = new ChampionPool();
  assert.equal(pool.remaining.galahad, POOL_SIZES[1]);
  assert.equal(pool.remaining.paladin, POOL_SIZES[5]);

  while (pool.draw('galahad')) {}
  assert.equal(pool.remaining.galahad, 0);
  assert.equal(pool.draw('galahad'), false);

  pool.release('galahad', 3);
  assert.equal(pool.remaining.galahad, 3);
  pool.release('galahad', 100);
  assert.equal(pool.remaining.galahad, POOL_SIZES[1]);
  assert.equal(copiesForStar(1), 1);
  assert.equal(copiesForStar(2), 2);
  assert.equal(copiesForStar(3), 4);
});

test('shop offers only champions that are still in the pool', () => {
  const game = createGame(1);
  for (const id of Object.keys(CHAMPIONS)) {
    game.shopManager.pool.remaining[id] = id === 'woodman' ? 1 : 0;
  }

  game.shopManager.refreshShop(true, () => 0);
  const offered = game.shopManager.shopSlots.filter(Boolean);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].championId, 'woodman');
  assert.equal(game.shopManager.pool.remaining.woodman, 0);

  game.shopManager.refreshShop(true, () => 0);
  assert.equal(game.shopManager.shopSlots.filter(Boolean).length, 1);
  assert.equal(game.shopManager.pool.remaining.woodman, 0);
});

test('selling a two-star unit returns the two copies that made it', () => {
  const game = createGame(1);
  const unit = new Unit('woodman', 2, false);
  unit.itemId = 'longsword';
  unit.benchIndex = 0;
  game.battleEngine.bench[0] = unit;
  game.shopManager.pool.remaining.woodman = 0;

  game.shopManager.sellUnit(unit);
  assert.equal(game.shopManager.pool.remaining.woodman, 2);
  assert.equal(game.gold, 51);
  assert.deepEqual(game.itemBench, ['longsword']);
  assert.equal(game.battleEngine.bench[0], null);
});

test('two copies of the same star combine, and two two-stars become three', () => {
  const game = createGame(1);
  const place = (star, index) => {
    const unit = new Unit('woodman', star, false);
    unit.benchIndex = index;
    game.battleEngine.bench[index] = unit;
    return unit;
  };

  place(1, 0);
  place(1, 1);
  game.shopManager.checkAutoCombine('woodman');
  const twos = game.battleEngine.bench.filter(unit => unit && unit.starLevel === 2);
  assert.equal(twos.length, 1);
  assert.equal(game.battleEngine.bench.filter(Boolean).length, 1);

  place(2, 2);
  game.shopManager.checkAutoCombine('woodman');
  const threes = game.battleEngine.bench.filter(unit => unit && unit.starLevel === 3);
  assert.equal(threes.length, 1);
  assert.equal(game.battleEngine.bench.filter(Boolean).length, 1);
});

test('level 1 shop rolls cost 1 and level 8 can roll cost 5', () => {
  assert.equal(ShopManager.rollCost(1, () => 0.99), 1);
  assert.equal(ShopManager.rollCost(8, () => 0), 1);
  assert.equal(ShopManager.rollCost(8, () => 0.99), 5);
  for (const odds of Object.values(ShopManager.TIER_ODDS)) {
    const total = odds.reduce((sum, chance) => sum + chance, 0);
    assert.ok(Math.abs(total - 1) < 0.001);
  }
});

test('items change stats once and wins drop more loot on boss rounds', () => {
  const unit = new Unit('galahad', 1, false);
  const baseAttack = unit.attack;
  unit.itemId = 'longsword';
  unit.initStats();
  unit.initStats();
  assert.equal(unit.attack, Math.round(baseAttack * 1.2));

  unit.itemId = 'chainmail';
  unit.initStats();
  assert.equal(unit.bonusArmor, 30);
  unit.initStats();
  assert.equal(unit.bonusArmor, 30);

  const rng = () => 0;
  assert.equal(itemDropsForWin(4, rng).length, 1);
  assert.equal(itemDropsForWin(10, rng).length, 2);
  assert.equal(itemDropsForWin(10, rng)[0], Object.keys(ITEMS)[0]);
});

test('waves grow after round 6 and boss rounds are marked', () => {
  assert.equal(isBossRound(5), true);
  assert.equal(isBossRound(10), true);
  assert.equal(isBossRound(15), true);
  assert.equal(planEnemyWave(6).boss, false);

  assert.ok(waveThreat(planEnemyWave(7)) > waveThreat(planEnemyWave(6)));
  assert.ok(waveThreat(planEnemyWave(10)) > waveThreat(planEnemyWave(9)));
  assert.ok(waveThreat(planEnemyWave(15)) > waveThreat(planEnemyWave(10)));
  assert.ok(waveThreat(planEnemyWave(20)) > waveThreat(planEnemyWave(15)));
  assert.ok(planEnemyWave(20).units.length >= planEnemyWave(7).units.length);

  const round7Classes = planEnemyWave(7).units.map((unit) => CHAMPIONS[unit.championId].heroClass);
  assert.ok(round7Classes.some((classId) => round7Classes.filter((other) => other === classId).length >= 2));

  for (const round of [1, 5, 6, 7, 10, 14, 15, 20]) {
    const plan = planEnemyWave(round);
    const tiles = new Set(plan.units.map((unit) => `${unit.gridX},${unit.gridY}`));
    assert.equal(tiles.size, plan.units.length, `round ${round}`);
    assert.equal(plan.boss, isBossRound(round));
    for (const unit of plan.units) {
      assert.ok(CHAMPIONS[unit.championId], unit.championId);
      assert.ok(unit.star >= 1 && unit.star <= 3);
      assert.ok(unit.gridX >= 0 && unit.gridX < 8);
      assert.ok(unit.gridY >= 0 && unit.gridY < 3);
    }
  }
});

test('run summary names the top damage dealer and the last comp', () => {
  const summary = buildRunSummary({
    round: 9,
    gold: 12,
    level: 5,
    damage: { galahad: 40, woodman: 120 },
    healing: { acolyte: 80 },
    comp: [{ championId: 'woodman', starLevel: 2, itemId: 'swiftbow' }]
  });
  assert.equal(summary.roundReached, 9);
  assert.equal(summary.topDamage.championId, 'woodman');
  assert.equal(summary.topDamage.amount, 120);
  assert.equal(summary.comp[0].star, 2);
  assert.equal(summary.comp[0].itemId, 'swiftbow');
});

test('tier-1 counters stay in the pentagram, including archer into cleric', () => {
  const iterations = 200;
  const rate = (a, b) => BalanceSimulator.simulate1v1(a, b, iterations).winRateA;

  assert.ok(rate('galahad', 'shadowblade') >= 70);
  assert.ok(rate('pyromancer', 'galahad') >= 70);
  assert.ok(rate('shadowblade', 'pyromancer') >= 70);
  assert.ok(rate('acolyte', 'pyromancer') >= 70);
  assert.ok(rate('woodman', 'acolyte') >= 60);
  assert.ok(rate('galahad', 'woodman') >= 70);
  assert.ok(rate('shadowblade', 'woodman') >= 70);
  assert.ok(rate('pyromancer', 'woodman') >= 60);
});
