import { BalanceSimulator } from './js/balanceSimulator.js';
import { CHAMPIONS } from './js/constants.js';

console.log('=== AUTO-BATTLER CLASS BALANCE MATRIX VERIFICATION ===\n');

const tier1 = ['galahad', 'pyromancer', 'shadowblade', 'woodman', 'acolyte'];
const matrix = BalanceSimulator.runFullBalanceMatrix(1000);

console.log(
  'Attacker \\ Defender'.padEnd(20) +
  tier1.map(t => CHAMPIONS[t].name.padEnd(14)).join('')
);
console.log('-'.repeat(90));

tier1.forEach(c1 => {
  let row = CHAMPIONS[c1].name.padEnd(20);
  tier1.forEach(c2 => {
    const rate = matrix[c1][c2];
    row += `${rate}%`.padEnd(14);
  });
  console.log(row);
});

const expectations = [
  ['galahad', 'shadowblade', 60],
  ['pyromancer', 'galahad', 60],
  ['shadowblade', 'pyromancer', 60],
  ['shadowblade', 'woodman', 60],
  ['woodman', 'acolyte', 60],
  ['acolyte', 'pyromancer', 60],
  ['galahad', 'woodman', 60],
  ['pyromancer', 'woodman', 60]
];

console.log('\n=== KEY COUNTER RELATIONSHIPS: ===');
let failed = false;
for (const [winner, loser, minimum] of expectations) {
  const rate = matrix[winner][loser];
  const ok = rate >= minimum;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'ok' : 'FAIL'} ${CHAMPIONS[winner].name} vs ${CHAMPIONS[loser].name}: ${rate}% (need >= ${minimum}%)`
  );
}

if (failed) {
  console.error('\nBalance check failed.');
  process.exit(1);
}
