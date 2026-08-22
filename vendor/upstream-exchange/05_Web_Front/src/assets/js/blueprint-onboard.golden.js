'use strict';

/**
 * fail-first: mutate('blueprint','onboard'
 * Run: node src/assets/js/blueprint-onboard.golden.js
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Blueprint.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

if (page.indexOf("mutate('blueprint', 'onboard'") === -1 && page.indexOf("mutate('blueprint','onboard'") === -1) {
  throw new Error("fail-first: Blueprint.vue must contain mutate('blueprint','onboard'");
}
if (page.indexOf('submitOnboard') === -1) throw new Error('Onboard click handler missing');
if (page.indexOf("intafaced.blueprint.onboardNow") === -1) throw new Error('Onboard button label missing');
if (page.indexOf('/api/blueprint/trpc/onboard') === -1) throw new Error('onboard refuse path must be IxState, not a pretty-lie');
if (page.indexOf('userId:') !== -1) throw new Error('onboard must not send userId from the browser');
if (page.indexOf('setVisibility') !== -1) throw new Error('this PR must not draw setVisibility');
if (page.indexOf("mutate('blueprint', 'erase'") !== -1) throw new Error('this PR must not draw erase');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist blueprint onboard in localStorage');
if (page.indexOf('engineVersion:') !== -1) throw new Error('must not invent a Neural Engine profile locally');
if (lang.indexOf('onboardNow:') === -1) throw new Error('en.js missing intafaced.blueprint.onboardNow');
if (lang.indexOf('never invents a profile') === -1) throw new Error('onboard lead must refuse a missing Neural Engine honestly');

console.log('blueprint-onboard.golden: ok');
