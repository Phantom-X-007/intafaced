/* Fail-first golden for B5 scale and attached TP/SL wiring. */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '../../pages/exchange/Exchange.vue'),
  'utf8',
);
const start = source.indexOf('submitScale()');
const end = source.indexOf('/**\n     * PLACE AN ORDER', start);
if (start < 0 || end < 0) throw new Error('B5 advanced order methods are missing');
const advanced = source.slice(start, end);

for (const marker of [
  "orderType === 'scale'",
  'buildScaleOrders',
  "rest('/orders'",
  'clientOrderId: this.nextClientOrderId()',
  "type: 'take_profit'",
  "type: 'stop'",
  'reduceOnly: true',
  'matchingPositions.length === 0',
  'advancedPlanLocked',
  'batchAcceptedChildren > 0',
]) {
  if (!source.includes(marker)) throw new Error(`B5 golden missing marker: ${marker}`);
}
for (const forbidden of ['Number(amount)', 'parseFloat(', 'fake depth', 'volume-plan']) {
  if (advanced.includes(forbidden)) throw new Error(`B5 golden forbids: ${forbidden}`);
}

console.log('scale-tpsl-ticket golden: PASS');
