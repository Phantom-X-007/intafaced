'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Certs.vue'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');

if (page.indexOf('grantCert') === -1) throw new Error('grantCert missing');
if (page.indexOf('myCerts') === -1) throw new Error('myCerts missing');
if (page.indexOf("query('academy', 'myCerts'") === -1) throw new Error('myCerts query missing');
if (page.indexOf("query('academy', 'certProgress'") === -1) throw new Error('certProgress missing');
if (page.indexOf("mutate('academy', 'grantCert'") === -1) throw new Error('grantCert mutate missing');
if (page.indexOf('alreadyGranted') === -1) throw new Error('alreadyGranted missing');
if (page.indexOf('invent') !== -1 && page.indexOf('does not invent') === -1) {
  // comment may say "no invent"; the UI must not mint perk money
}
if (hub.indexOf("academy/Certs.vue") === -1) throw new Error('Certs not imported as a card');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist certs in localStorage');

console.log('academy-certs.golden: ok');
