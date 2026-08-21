'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Canvas.vue'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');

if (page.indexOf('updateScene') === -1) throw new Error('updateScene missing');
if (page.indexOf('expectedFingerprint') === -1) throw new Error('expectedFingerprint missing');
if (page.indexOf("query('academy', 'session'") === -1) throw new Error('session query missing');
if (page.indexOf("mutate('academy', 'updateScene'") === -1) throw new Error('updateScene mutate missing');
if (page.indexOf('version: 1') === -1) throw new Error('scene v1 missing');
if (page.indexOf('version: 2') !== -1) throw new Error('must not send scene schema v2');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist scene in localStorage');
if (hub.indexOf("academy/Canvas.vue") === -1) throw new Error('Canvas not imported as a card');

console.log('academy-canvas.golden: ok');
