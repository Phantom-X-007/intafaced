/* Auction ticket wire — refuse unsupported auction/benchmark; no silent limit. */
'use strict';

var assert = require('assert');
var tradeWire = require('./ix-trade.js');
var auctionTicket = require('./ix-auction-ticket.js');

function catchPlace(input) {
  try {
    tradeWire.toCreateOrderBody(input);
    return null;
  } catch (e) {
    return e;
  }
}

var base = {
  symbol: 'BTC/USDT',
  type: 'LIMIT_PRICE',
  side: 'BUY',
  amount: '10',
  price: '100'
};

var auctionErr = catchPlace(Object.assign({}, base, { auction: true }));
assert.ok(auctionErr);
assert.strictEqual(auctionErr.code, 'trade.auction_unsupported');
assert.ok(auctionErr.message.indexOf('does not invent an auction price') !== -1);

var benchErr = catchPlace(Object.assign({}, base, { benchmark: true }));
assert.ok(benchErr);
assert.strictEqual(benchErr.code, 'trade.benchmark_unsupported');
assert.ok(benchErr.message.indexOf('does not invent a benchmark price') !== -1);

var gtc = tradeWire.toCreateOrderBody(Object.assign({}, base, { timeInForce: 'GTC' }));
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'auction'), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(gtc, 'benchmark'), false);
assert.strictEqual(gtc.amount, '10');
assert.strictEqual(gtc.price, '100');

var off = tradeWire.toCreateOrderBody(Object.assign({}, base, { auction: false, benchmark: false }));
assert.strictEqual(Object.prototype.hasOwnProperty.call(off, 'auction'), false);

var auctionMsg = tradeWire.orderFailureMessage({ reason: 'auction_unsupported' }, 'place');
assert.ok(auctionMsg.indexOf('does not invent an auction price') !== -1);
assert.ok(auctionMsg.indexOf('No order was placed.') !== -1);

var benchMsg = tradeWire.orderFailureMessage({ reason: 'trade.benchmark_unsupported' }, 'place');
assert.ok(benchMsg.indexOf('does not invent a benchmark price') !== -1);

assert.strictEqual(typeof auctionTicket.installBazaarAuctionTicket, 'function');
assert.strictEqual(auctionTicket.installBazaarAuctionTicket(null), false);
assert.strictEqual(auctionTicket.readTicketAuction({}), false);
assert.strictEqual(auctionTicket.readTicketAuction({ auction: false }), false);
assert.strictEqual(auctionTicket.readTicketAuction({ auction: true }), true);
assert.strictEqual(auctionTicket.readTicketBenchmark({ benchmark: true }), true);

var auctionAssert;
try {
  auctionTicket.assertTicketAuction({ auction: true });
} catch (e) {
  auctionAssert = e;
}
assert.ok(auctionAssert);
assert.strictEqual(auctionAssert.code, 'trade.auction_unsupported');

auctionTicket.assertTicketAuction({});
auctionTicket.assertTicketAuction({ auction: false });

console.log('ix-auction-ticket golden: PASS');
