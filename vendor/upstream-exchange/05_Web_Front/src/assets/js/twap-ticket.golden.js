/* Fail-first golden for the B4 TWAP ticket wiring. */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../pages/exchange/Exchange.vue'),
  'utf8',
);
const executable = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

for (const marker of [
  "algo.createTwap",
  'sliceIntervalMs: 30000',
  'clientAlgoId',
  'twapDurationSeconds',
  'Number(duration) < 30',
  'Number(duration) > 86400',
]) {
  if (!source.includes(marker)) throw new Error(`TWAP golden missing marker: ${marker}`);
}
for (const forbidden of ['volume-plan', 'fake fills', 'totalQty: Number', 'parseFloat']) {
  if (executable.includes(forbidden)) throw new Error(`TWAP golden forbids: ${forbidden}`);
}

console.log('twap-ticket golden: PASS');
