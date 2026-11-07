// Enemy wave plans. Rounds 1-6 are scripted. Later rounds grow in
// count, star level, cost, and an elite multiplier after round 15.

import { CHAMPIONS } from './constants.js';

export function isBossRound(round) {
  return round > 0 && round % 5 === 0;
}

export function eliteRank(round) {
  if (round < 16) return 0;
  return Math.min(4, Math.floor((round - 15) / 2));
}

export function eliteStatMultiplier(rank) {
  return 1 + (0.15 * rank);
}

const SLOTS = [
  { gridX: 1, gridY: 2 },
  { gridX: 3, gridY: 2 },
  { gridX: 5, gridY: 2 },
  { gridX: 6, gridY: 1 },
  { gridX: 2, gridY: 0 },
  { gridX: 4, gridY: 0 },
  { gridX: 0, gridY: 1 }
];

const SCRIPTED = {
  1: [['woodman', 1]],
  2: [['galahad', 1], ['pyromancer', 1]],
  3: [['galahad', 1], ['galahad', 1], ['shadowblade', 1]],
  4: [['valkyrie', 1], ['pyromancer', 1], ['stormcaller', 1]],
  5: [['galahad', 2], ['woodman', 1], ['deadeye', 1]],
  6: [['shadowblade', 1], ['specter', 1], ['acolyte', 1], ['highpriest', 1]]
};

// Each template repeats a class so the wave actually turns a synergy on.
const SCALED_TEMPLATES = [
  ['warden', 'galahad', 'frostweaver', 'pyromancer', 'chaplain', 'ranger', 'cutpurse'],
  ['galahad', 'warden', 'shadowblade', 'specter', 'woodman', 'deadeye', 'acolyte'],
  ['paladin', 'valkyrie', 'archmage', 'stormcaller', 'saint', 'marksman', 'nightblade']
];

const BOSSES = ['paladin', 'archmage', 'nightblade', 'marksman', 'saint'];

function scaledTemplate(round) {
  if (round >= 15) return SCALED_TEMPLATES[2];
  if (round >= 10) return SCALED_TEMPLATES[1];
  return SCALED_TEMPLATES[0];
}

function baseStar(round) {
  if (round >= 15) return 3;
  if (round >= 10) return 2;
  return 1;
}

function scaledCount(round) {
  if (round >= 13) return 7;
  if (round >= 10) return 6;
  return 6;
}

export function planEnemyWave(round) {
  const boss = isBossRound(round);
  const elite = eliteRank(round);

  if (SCRIPTED[round]) {
    return {
      round,
      boss,
      elite,
      units: SCRIPTED[round].map(([championId, star], index) => ({
        championId,
        star,
        gridX: SLOTS[index].gridX,
        gridY: SLOTS[index].gridY
      }))
    };
  }

  const template = scaledTemplate(round);
  const count = scaledCount(round);
  const star = baseStar(round);
  const units = template.slice(0, count).map((championId, index) => ({
    championId,
    star,
    gridX: SLOTS[index].gridX,
    gridY: SLOTS[index].gridY
  }));

  if (boss) {
    units[0].championId = BOSSES[(round / 5) % BOSSES.length];
    units[0].star = Math.min(3, star + 1);
  } else if (round % 5 === 4) {
    units[0].star = Math.min(3, star + 1);
  }

  return { round, boss, elite, units };
}

export function waveThreat(plan) {
  const eliteMult = eliteStatMultiplier(plan.elite || 0);
  return plan.units.reduce((sum, unit) => {
    const cost = CHAMPIONS[unit.championId].cost;
    return sum + (cost * unit.star * unit.star * eliteMult);
  }, 0);
}
