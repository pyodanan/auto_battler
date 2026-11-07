// Plain-data summary of a finished run, shared by the game-over screen and tests.

import { CHAMPIONS } from './constants.js';

export function buildRunSummary({ round, gold, level, damage = {}, healing = {}, comp = [] }) {
  const ranked = Object.entries(damage).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  return {
    roundReached: round,
    gold,
    level,
    topDamage: top
      ? {
          championId: top[0],
          name: CHAMPIONS[top[0]] ? CHAMPIONS[top[0]].nameTh : top[0],
          amount: top[1]
        }
      : null,
    healing,
    comp: comp.map((unit) => ({
      championId: unit.championId,
      name: CHAMPIONS[unit.championId] ? CHAMPIONS[unit.championId].nameTh : unit.championId,
      star: unit.starLevel,
      itemId: unit.itemId || null
    }))
  };
}
