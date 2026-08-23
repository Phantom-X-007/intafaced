'use strict';

const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(path.join(__dirname, 'Market.vue'), 'utf8');
const en = fs.readFileSync(path.join(__dirname, '../../assets/lang/en.js'), 'utf8');

const requiredPageMarkers = [
  "mutate('market', 'proposePerpMarket'",
  "this.draftId('marketPerpProposal')",
  'perpForm.symbol',
  'perpForm.settle',
  'perpForm.oracleSource',
  'perpForm.leverageCap',
  'endpoint="/api/market/trpc/proposePerpMarket"',
  'perpProposal.data.status',
];

for (const marker of requiredPageMarkers) {
  if (!page.includes(marker)) throw new Error(`Market.vue is missing ${marker}`);
}

for (const key of ['perpProposal', 'perpProposalLead', 'perpSymbol', 'perpSettle', 'perpOracleSource', 'perpLeverageCap', 'perpLeverageHint', 'perpPropose', 'perpProposed']) {
  if (!en.includes(`${key}:`)) throw new Error(`en.js is missing intafaced.market.${key}`);
}

if (/\b(BTC|ETH|USDT|NVDA|oil)\b/i.test(page)) throw new Error('proposal form must not paint a real ticker or settlement fixture');
if (/leverageCap:\s*['"]?10/i.test(page)) throw new Error('proposal form must not default leverage to 10x');

console.log('perp proposal golden: PASS');
