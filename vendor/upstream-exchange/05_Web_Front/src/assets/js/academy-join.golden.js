'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');

if (page.indexOf("mutate('academy', 'join'") === -1) throw new Error('join missing');
if (page.indexOf("mutate('academy', 'leave'") === -1) throw new Error('leave missing');
if (page.indexOf("query('academy', 'rooms'") === -1) throw new Error('rooms missing');
if (page.indexOf("query('academy', 'room'") === -1) throw new Error('room missing');
if (page.indexOf("mutate('academy', 'streamCredential'") === -1) throw new Error('streamCredential missing');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist academy join in localStorage');

console.log('academy-join.golden: ok');
