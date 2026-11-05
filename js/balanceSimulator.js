// Balance Simulator: Monte-Carlo Combat Simulation Engine
// Can run headless in Node.js or in browser to verify 1v1 and team matchup balance

import { CHAMPIONS } from './constants.js';

export class BalanceSimulator {
  // Fast headless 1v1 simulation between two champions
  static simulate1v1(champIdA, champIdB, iterations = 1000) {
    const dataA = CHAMPIONS[champIdA];
    const dataB = CHAMPIONS[champIdB];

    if (!dataA || !dataB) {
      throw new Error(`Invalid champion IDs: ${champIdA}, ${champIdB}`);
    }

    let aWins = 0;
    let bWins = 0;
    let draws = 0;

    for (let i = 0; i < iterations; i++) {
      const result = BalanceSimulator.runSingleDuel(dataA, dataB);
      if (result === 'A') aWins++;
      else if (result === 'B') bWins++;
      else draws++;
    }

    return {
      champA: dataA.name,
      champB: dataB.name,
      classA: dataA.heroClass,
      classB: dataB.heroClass,
      iterations,
      aWins,
      bWins,
      draws,
      winRateA: Number(((aWins / iterations) * 100).toFixed(1)),
      winRateB: Number(((bWins / iterations) * 100).toFixed(1))
    };
  }

  // Single headless duel step simulation
  static runSingleDuel(dataA, dataB) {
    let hpA = dataA.hp;
    let hpB = dataB.hp;
    let manaA = dataA.startingMana || 0;
    let manaB = dataB.startingMana || 0;
    
    // Stagger initial attacks slightly (fair turn initiative)
    let timerA = Math.random() * (0.5 / dataA.attackSpeed);
    let timerB = Math.random() * (0.5 / dataB.attackSpeed);

    let stunA = 0;
    let stunB = 0;
    let shieldA = 0;
    let shieldB = 0;

    // Range distance simulation
    let dist = 4.0;
    if (dataA.jumpsToBackline || dataB.jumpsToBackline) {
      dist = 1.0; // Rogue jumps straight into melee range
    }

    const moveSpeed = 2.4; // tiles per second
    const dt = 0.05; // 20 ticks per second
    const maxTime = 30.0;
    let time = 0;

    while (hpA > 0 && hpB > 0 && time < maxTime) {
      time += dt;

      // Distance closing
      if (dist > dataA.range && dist > dataB.range) {
        dist = Math.max(1.0, dist - (moveSpeed * 2) * dt);
      } else if (dist > dataA.range) {
        dist = Math.max(1.0, dist - moveSpeed * dt);
      } else if (dist > dataB.range) {
        dist = Math.max(1.0, dist - moveSpeed * dt);
      }

      // Handle Stuns
      if (stunA > 0) stunA -= dt;
      if (stunB > 0) stunB -= dt;

      // Combatant A Attack Turn
      if (stunA <= 0 && dist <= dataA.range) {
        timerA -= dt;
        if (timerA <= 0) {
          timerA = 1 / dataA.attackSpeed;
          manaA += 10;

          // Check Skill
          if (manaA >= dataA.maxMana) {
            manaA = 0;
            const skillDmg = dataA.skill.damage || (dataA.attack * (dataA.skill.damageMultiplier || 1.8));
            const dmgType = dataA.skill.type || 'PHYSICAL';
            const armorPen = dataA.skill.armorPen || 0;

            if (dmgType === 'HEAL') {
              hpA = Math.min(dataA.hp, hpA + (dataA.skill.healAmount || 200));
            } else {
              const res = BalanceSimulator.calcDamage(skillDmg, dmgType, dataB.armor * (1 - armorPen), dataB.magicResist);
              let rem = res;
              if (shieldB > 0) {
                if (shieldB >= rem) { shieldB -= rem; rem = 0; }
                else { rem -= shieldB; shieldB = 0; }
              }
              hpB -= rem;
              manaB = Math.min(dataB.maxMana, manaB + 8);
            }

            if (dataA.id === 'galahad') { stunB = 1.2; shieldA += 150; }
          } else {
            // Auto attack
            let isCrit = Math.random() < (dataA.heroClass === 'ROGUE' ? 0.35 : 0.10);
            let rawDmg = isCrit ? dataA.attack * 1.5 : dataA.attack;
            const attackType = dataA.attackType || 'PHYSICAL';
            const res = BalanceSimulator.calcDamage(rawDmg, attackType, dataB.armor, dataB.magicResist);
            let rem = res;
            if (shieldB > 0) {
              if (shieldB >= rem) { shieldB -= rem; rem = 0; }
              else { rem -= shieldB; shieldB = 0; }
            }
            hpB -= rem;
            manaB = Math.min(dataB.maxMana, manaB + 8);
          }
        }
      }

      if (hpB <= 0) break;

      // Combatant B Attack Turn
      if (stunB <= 0 && dist <= dataB.range) {
        timerB -= dt;
        if (timerB <= 0) {
          timerB = 1 / dataB.attackSpeed;
          manaB += 10;

          // Check Skill
          if (manaB >= dataB.maxMana) {
            manaB = 0;
            const skillDmg = dataB.skill.damage || (dataB.attack * (dataB.skill.damageMultiplier || 1.8));
            const dmgType = dataB.skill.type || 'PHYSICAL';
            const armorPen = dataB.skill.armorPen || 0;

            if (dmgType === 'HEAL') {
              hpB = Math.min(dataB.hp, hpB + (dataB.skill.healAmount || 200));
            } else {
              const res = BalanceSimulator.calcDamage(skillDmg, dmgType, dataA.armor * (1 - armorPen), dataA.magicResist);
              let rem = res;
              if (shieldA > 0) {
                if (shieldA >= rem) { shieldA -= rem; rem = 0; }
                else { rem -= shieldA; shieldA = 0; }
              }
              hpA -= rem;
              manaA = Math.min(dataA.maxMana, manaA + 8);
            }

            if (dataB.id === 'galahad') { stunA = 1.2; shieldB += 150; }
          } else {
            // Auto attack
            let isCrit = Math.random() < (dataB.heroClass === 'ROGUE' ? 0.35 : 0.10);
            let rawDmg = isCrit ? dataB.attack * 1.5 : dataB.attack;
            const attackType = dataB.attackType || 'PHYSICAL';
            const res = BalanceSimulator.calcDamage(rawDmg, attackType, dataA.armor, dataA.magicResist);
            let rem = res;
            if (shieldA > 0) {
              if (shieldA >= rem) { shieldA -= rem; rem = 0; }
              else { rem -= shieldA; shieldA = 0; }
            }
            hpA -= rem;
            manaA = Math.min(dataA.maxMana, manaA + 8);
          }
        }
      }
    }

    if (hpA > 0 && hpB <= 0) return 'A';
    if (hpB > 0 && hpA <= 0) return 'B';
    return hpA > hpB ? 'A' : (hpB > hpA ? 'B' : 'DRAW');
  }

  // Defense damage formula
  static calcDamage(raw, type, armor, mr) {
    if (type === 'MAGIC') {
      return Math.round(raw * (100 / (100 + mr)));
    }
    return Math.round(raw * (100 / (100 + armor)));
  }

  // Run full matrix across all 5 primary Tier 1 champions
  static runFullBalanceMatrix(iterations = 500) {
    const tier1Champs = ['galahad', 'pyromancer', 'shadowblade', 'woodman', 'acolyte'];
    const matrix = {};

    tier1Champs.forEach(c1 => {
      matrix[c1] = {};
      tier1Champs.forEach(c2 => {
        if (c1 === c2) {
          matrix[c1][c2] = 50.0;
        } else {
          const sim = BalanceSimulator.simulate1v1(c1, c2, iterations);
          matrix[c1][c2] = sim.winRateA;
        }
      });
    });

    return matrix;
  }
}
