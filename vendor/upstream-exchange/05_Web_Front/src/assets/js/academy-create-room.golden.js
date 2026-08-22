'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('academy', 'createRoom'") === -1) throw new Error('createRoom missing');
if (page.indexOf("query('academy', 'rooms'") === -1) throw new Error('rooms reload missing');
if (page.indexOf('if (minStake) input.minStake = minStake;') === -1) {
  throw new Error('blank minStake must be omitted, not sent empty');
}
if (page.indexOf('minStake: Number') !== -1 || page.indexOf('minStake: parseFloat') !== -1 || page.indexOf('minStake: parseInt') !== -1) {
  throw new Error('minStake must stay a decimal string');
}
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist academy create room in localStorage');
if (en.indexOf('createRoom:') === -1) throw new Error('createRoom i18n missing');
if (en.indexOf('createRoomLead:') === -1) throw new Error('createRoomLead i18n missing');
if (en.indexOf('createRoomSlug:') === -1) throw new Error('createRoomSlug i18n missing');
if (en.indexOf('createRoomSubmit:') === -1) throw new Error('createRoomSubmit i18n missing');
if (en.indexOf('createRoomSignIn:') === -1) throw new Error('createRoomSignIn i18n missing');
if (en.indexOf('createRoomCreated:') === -1) throw new Error('createRoomCreated i18n missing');

console.log('academy-create-room.golden: ok');
