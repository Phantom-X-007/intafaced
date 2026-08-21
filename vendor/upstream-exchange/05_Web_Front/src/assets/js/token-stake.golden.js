'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Token.vue'), 'utf8');

if (page.indexOf('stakeOf') === -1) throw new Error('Token.vue must contain stakeOf');
if (page.indexOf("query('token', 'stakeOf'") === -1) throw new Error('stakeOf query missing');
if (page.indexOf("query('token', 'accessOf'") === -1) throw new Error('accessOf query missing');
if (page.indexOf("query('token', 'listStakes'") === -1) throw new Error('listStakes query missing');
if (page.indexOf("mutate('token', 'stake'") === -1) throw new Error('stake mutate missing');
if (page.indexOf("mutate('token', 'unstake'") === -1) throw new Error('unstake mutate missing');
if (page.indexOf("mutate('token', 'mint") !== -1) throw new Error('must not invent mint/admin');
if (page.indexOf('/trpc/mintEpoch') !== -1) throw new Error('must not invent mint/admin');
if (page.indexOf('intafaced.token.noStakes') === -1) throw new Error('empty list must not be drawn as 0');
if (page.indexOf('stake.data.staked') === -1) throw new Error('stakeOf zero must render the returned figure');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist token stake in localStorage');

console.log('token-stake.golden: ok');
