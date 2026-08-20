'use strict';

var fs = require('fs');
var path = require('path');
var exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('Convert desk missing ' + needle);
}

assertContains(exchange, "query('trade', 'convert.quote'");
assertContains(exchange, "mutate('trade', 'convert.execute'");
assertContains(exchange, 'clientConvertId');
assertContains(exchange, 'convertCanExecute');
console.log('ix-convert.golden: ok');
