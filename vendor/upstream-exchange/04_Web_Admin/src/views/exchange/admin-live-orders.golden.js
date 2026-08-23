'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'Order.vue'), 'utf8');

function requireText(text, message) {
  if (!source.includes(text)) throw new Error(message);
}

requireText('/api/v1/admin/orders/open', 'admin orders must use the canonical svc-trade operator endpoint');
requireText('credentials: \'same-origin\'', 'admin orders must carry the same-origin operator session');
requireText('ordersError', 'admin orders must render transport/refusal state separately from empty');
if (source.includes('queryBBOrder')) throw new Error('legacy Java exchange-order query must not remain wired');
if (/0\.00\s*(BTC|USDT)/.test(source)) throw new Error('admin orders must not contain fixture money rows');

process.stdout.write('admin-live-orders golden: ok\n');
