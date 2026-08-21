'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Agents.vue'), 'utf8');

function assertContains(value, needle) {
  if (value.indexOf(needle) === -1) throw new Error('Agents coach missing ' + needle);
}

assertContains(page, "query('agents', 'coach.session'");
if (page.indexOf('includePositions: true') !== -1) {
  throw new Error('Agents coach must not send includePositions');
}
if (page.indexOf('asAdvice: true') !== -1) {
  throw new Error('Agents coach must not send asAdvice');
}
if (page.indexOf("mutate('agents', 'coach.session'") !== -1) {
  throw new Error('coach.session is a query on tip, not a mutate');
}
console.log('agents-coach.golden: ok');
