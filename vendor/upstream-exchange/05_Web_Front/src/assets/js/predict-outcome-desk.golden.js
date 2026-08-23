/* Fail-first golden for the custodial outcome desk. */
const fs = require('fs');
const path = require('path');

const routes = fs.readFileSync(path.join(__dirname, '../../config/routes.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Predict.vue'), 'utf8');

for (const marker of [
  "path: '/predict'",
  "rest('/outcomes/markets')",
  "rest('/outcomes/orders'",
  "rest('/orderbook/'",
  "side: 'buy'",
  "type: 'limit'",
  'clientOrderId: clientOrderId',
]) {
  if (!(routes + page).includes(marker)) throw new Error(`predict outcome golden missing: ${marker}`);
}
for (const forbidden of ['sports', 'USDT', 'HIP-4', 'parseFloat(', 'Number(amount)', 'Number(price)']) {
  if (page.includes(forbidden)) throw new Error(`predict outcome golden forbids: ${forbidden}`);
}

console.log('predict-outcome-desk golden: PASS');
