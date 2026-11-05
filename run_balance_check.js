import { BalanceSimulator } from './js/balanceSimulator.js';
import { CHAMPIONS } from './js/constants.js';

console.log('=== AUTO-BATTLER CLASS BALANCE MATRIX VERIFICATION ===\n');

const tier1 = ['galahad', 'pyromancer', 'shadowblade', 'woodman', 'acolyte'];
const matrix = BalanceSimulator.runFullBalanceMatrix(1000);

console.log(
  'Attacker \\ Defender'.padEnd(20) +
  tier1.map(t => CHAMPIONS[t].name.padEnd(12)).join('')
);
console.log('-'.repeat(80));

tier1.forEach(c1 => {
  let row = CHAMPIONS[c1].name.padEnd(20);
  tier1.forEach(c2 => {
    const rate = matrix[c1][c2];
    row += `${rate}%`.padEnd(12);
  });
  console.log(row);
});

console.log('\n=== KEY COUNTER RELATIONSHIPS: ===');
const check = (a, b) => {
  console.log(`${CHAMPIONS[a].name} vs ${CHAMPIONS[b].name}: ${matrix[a][b]}% win rate`);
};

check('galahad', 'shadowblade'); // Knight vs Rogue (Knight should counter)
check('pyromancer', 'galahad');    // Mage vs Knight (Mage should counter)
check('shadowblade', 'pyromancer'); // Rogue vs Mage (Rogue should counter)
check('shadowblade', 'woodman');    // Rogue vs Archer (Rogue should counter)
check('woodman', 'galahad');        // Archer vs Knight
check('acolyte', 'pyromancer');     // Cleric vs Mage
