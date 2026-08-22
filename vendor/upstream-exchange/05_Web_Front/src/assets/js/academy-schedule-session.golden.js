'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('academy', 'scheduleSession'") === -1) throw new Error('scheduleSession missing');
if (page.indexOf("mutate('academy', 'startSession'") === -1) throw new Error('startSession missing');
if (page.indexOf("mutate('academy', 'endSession'") === -1) throw new Error('endSession missing');
if (page.indexOf('startsAt: startsAt') === -1) throw new Error('startsAt must be sent as the ISO string');
if (page.indexOf('startsAt: new Date') !== -1 || page.indexOf('Date.parse') !== -1) {
  throw new Error('startsAt must stay an ISO string, not a Date');
}
if (page.indexOf("s.status === 'scheduled'") === -1) throw new Error('Start must be gated on scheduled');
if (page.indexOf("s.status === 'live'") === -1) throw new Error('End must include live');
if (page.indexOf('academy.not_host') !== -1 && page.indexOf("reason === 'academy.not_host'") !== -1) {
  throw new Error('named refuse must stay named via IxState, not remapped');
}
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist academy schedule in localStorage');
if (en.indexOf('scheduleLead:') === -1) throw new Error('scheduleLead i18n missing');
if (en.indexOf('scheduleTitle:') === -1) throw new Error('scheduleTitle i18n missing');
if (en.indexOf('scheduleStartsAt:') === -1) throw new Error('scheduleStartsAt i18n missing');
if (en.indexOf('scheduleSubmit:') === -1) throw new Error('scheduleSubmit i18n missing');
if (en.indexOf('scheduleSignIn:') === -1) throw new Error('scheduleSignIn i18n missing');
if (en.indexOf('scheduleScheduled:') === -1) throw new Error('scheduleScheduled i18n missing');
if (en.indexOf('startSession:') === -1) throw new Error('startSession i18n missing');
if (en.indexOf('startSessionStarted:') === -1) throw new Error('startSessionStarted i18n missing');
if (en.indexOf('endSession:') === -1) throw new Error('endSession i18n missing');
if (en.indexOf('endSessionEnded:') === -1) throw new Error('endSessionEnded i18n missing');

console.log('academy-schedule-session.golden: ok');
