// Shared champion pool. Copies leave the pool when offered in the shop
// and return when the offer is rerolled or the unit is sold.

import { CHAMPIONS } from './constants.js';

export const POOL_SIZES = {
  1: 12,
  2: 10,
  3: 8,
  5: 6
};

// 1+1 makes a 2-star (2 copies). 2+2 makes a 3-star (4 copies).
export function copiesForStar(starLevel) {
  if (starLevel >= 3) return 4;
  if (starLevel === 2) return 2;
  return 1;
}

export class ChampionPool {
  constructor(champions = CHAMPIONS, sizes = POOL_SIZES) {
    this.remaining = {};
    this.sizes = {};
    for (const [id, champ] of Object.entries(champions)) {
      const size = sizes[champ.cost];
      if (!size) {
        throw new Error(`No pool size for ${id} (cost ${champ.cost})`);
      }
      this.remaining[id] = size;
      this.sizes[id] = size;
    }
  }

  available(cost) {
    return Object.keys(this.remaining).filter((id) => {
      return CHAMPIONS[id].cost === cost && this.remaining[id] > 0;
    });
  }

  draw(id) {
    if (!this.remaining[id]) return false;
    this.remaining[id] -= 1;
    return true;
  }

  drawRandom(cost, rng = Math.random) {
    const options = this.available(cost);
    if (options.length === 0) return null;
    const id = options[Math.floor(rng() * options.length)];
    this.draw(id);
    return id;
  }

  release(id, count = 1) {
    if (this.remaining[id] === undefined) {
      throw new Error(`Unknown champion ID: ${id}`);
    }
    this.remaining[id] = Math.min(this.sizes[id], this.remaining[id] + count);
    return this.remaining[id];
  }
}
