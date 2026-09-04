/**
 * Golden: remaining-SOT §19.6 M12 RFQ/block + M14 PnL/statements — named refuse.
 *
 * /p2p is C2C, not firm RFQ. Ticket/copy must name the refuse so a trader
 * cannot confuse C2C or copy-follow with a firm quote. Do not invent last-look.
 * Realized vs funding vs fees export does not exist — named unavailable, not
 * a fake statement. Do not invent PnL.
 *
 * Run from 05_Web_Front:
 *   node src/assets/js/ix-m12-m14-refuse.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

var vue = read('../../pages/exchange/Exchange.vue');
var p2p = read('../../pages/intafaced/P2P.vue');
var portfolio = read('../../pages/intafaced/Portfolio.vue');
var money = read('../../components/uc/MoneyIndex.vue');
var en = read('../lang/en.js');

assert(/ticketCapability === 'rfq'/.test(vue), 'ticket mounts RFQ as a refused capability');
assert(/exchange\.residual\.rfqOff/.test(vue), 'RFQ type-strip uses named off copy');
assert(/exchange\.residual\.rfqRefuse/.test(vue), 'ticket RFQ door names the refuse');
assert(/intafaced\.exchange\.copy\.rfqRefuse/.test(vue), 'copy mode names RFQ/block refuse');
assert(/helperDoors[\s\S]*'rfq'/.test(vue), 'setOrderType treats rfq as a helper door');
assert(/ticketCapability !== 'peg' && this\.ticketCapability !== 'rfq'/.test(vue), 'deskLock tradable excludes rfq');
assert(!/lastLook\s*[:=]\s*true/.test(vue) && !/last-look quote/.test(vue), 'ticket does not invent last-look');

assert(/ix-p2p-rfq-refuse/.test(p2p), '/p2p has a named RFQ/block refuse');
assert(/intafaced\.modules\.p2p\.rfqRefuse/.test(p2p), '/p2p refuse is keyed');
assert(/title:\s*"C2C \/ P2P"/.test(en), '/p2p title is C2C, not OTC-as-RFQ');
assert(/not a firm RFQ\/block desk/.test(en), '/p2p blurb names C2C vs firm RFQ');
assert(/Firm RFQ\/block \(firm quote, expiry, allocation\) is unavailable here/.test(en), 'P2P refuse names firm quote/expiry/allocation');
assert(!/last-look/.test(en.match(/rfqRefuse: "Firm RFQ\/block[\s\S]*?"/)[0]), 'P2P refuse does not invent last-look');

assert(/ix-portfolio-pnl/.test(portfolio), '/portfolio has a PnL/statements card');
assert(/intafaced\.portfolio\.pnlRefuse/.test(portfolio), '/portfolio PnL refuse is keyed');
assert(/Realized vs funding vs fees export is unavailable/.test(en), 'portfolio names realized vs funding vs fees');
assert(/does not invent PnL/.test(en), 'portfolio refuse forbids invented PnL');
assert(!/ix-portfolio-pnl[\s\S]{0,400}ix-table/.test(portfolio), 'PnL card is not an empty table-as-zero');

assert(/ix-money-pnl-refuse/.test(money), '/uc/money names statement refuse');
assert(/no PnL export is mounted/.test(money), 'money OS does not invent a statement');

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all ix-m12-m14-refuse golden tests passed');
