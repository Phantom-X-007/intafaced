#!/usr/bin/env node
/**
 * Fail-first: Token.vue closeProposal writes passed|rejected.
 * Quorum/threshold from TOKEN_GOVERNANCE_QUORUM_BPS — blank is
 * token.governance_quorum_unset. Grant kind close is
 * token.governance_execute_unwired (no value moved).
 *
 * Run from 05_Web_Front: node src/assets/js/token-governance-tally.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '../../');
var closePath = path.join(__dirname, '../../../../../../services/svc-token/src/governance-close.ts');
var servicePath = path.join(__dirname, '../../../../../../services/svc-token/src/token-service.ts');
var routerPath = path.join(__dirname, '../../../../../../services/svc-token/src/router.ts');
var envPath = path.join(__dirname, '../../../../../../services/svc-token/src/env.ts');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/Token.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var close = fs.readFileSync(closePath, 'utf8');
var service = fs.readFileSync(servicePath, 'utf8');
var router = fs.readFileSync(routerPath, 'utf8');
var env = fs.readFileSync(envPath, 'utf8');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

assert(close.indexOf('TOKEN_GOVERNANCE_QUORUM_BPS') !== -1, 'quorum env named');
assert(close.indexOf('TOKEN_GOVERNANCE_THRESHOLD_BPS') !== -1, 'threshold env named');
assert(close.indexOf('token.governance_quorum_unset') !== -1, 'blank env named refuse');
assert(close.indexOf("status = quorumMet && passMet ? 'passed' : 'rejected'") !== -1 || /'passed' \| 'rejected'/.test(close), 'outcome is passed|rejected');
assert(close.indexOf('token.governance_execute_unwired') !== -1, 'grant execute unwired named');
assert(close.indexOf('.default(') === -1, 'governance-close has no default bps');

assert(service.indexOf('async closeProposal') !== -1, 'TokenService.closeProposal');
assert(service.indexOf('SET status = ${status}') !== -1, 'close writes status');
assert(service.indexOf("'passed'") !== -1 && service.indexOf("'rejected'") !== -1, 'close writes passed|rejected');
assert(service.indexOf('token.governance_quorum_unset') !== -1, 'service names quorum unset');

var closeBody = service.slice(service.indexOf('async closeProposal('));
var nextMethod = closeBody.search(/\n  async [a-zA-Z]/);
if (nextMethod > 0) closeBody = closeBody.slice(0, nextMethod);
assert(closeBody.indexOf('ledger.post') === -1, 'closeProposal does not ledger.post');
assert(closeBody.indexOf('recipes.') === -1, 'closeProposal does not call recipes');
assert(closeBody.indexOf('executeUnwiredFor') !== -1, 'grant close wires executeUnwiredFor');

assert(router.indexOf('closeProposal:') !== -1, 'router mounts closeProposal');
assert(router.indexOf("'passed', 'rejected'") !== -1 || router.indexOf("'passed'") !== -1, 'router status includes passed/rejected');
assert(router.indexOf('token.governance_execute_unwired') !== -1, 'router execute unwired');
assert(router.indexOf('token.governance_quorum_unset') !== -1, 'router maps quorum unset');

assert(env.indexOf('TOKEN_GOVERNANCE_QUORUM_BPS') !== -1, 'env.ts quorum key');
assert(env.indexOf('TOKEN_GOVERNANCE_THRESHOLD_BPS') !== -1, 'env.ts threshold key');
var quorumSlice = env.slice(env.indexOf('TOKEN_GOVERNANCE_QUORUM_BPS'), env.indexOf('TOKEN_GOVERNANCE_QUORUM_BPS') + 220);
var thresholdSlice = env.slice(env.indexOf('TOKEN_GOVERNANCE_THRESHOLD_BPS'), env.indexOf('TOKEN_GOVERNANCE_THRESHOLD_BPS') + 220);
assert(!/\.default\(\s*\d+/.test(quorumSlice), 'env.ts quorum has no numeric default');
assert(!/\.default\(\s*\d+/.test(thresholdSlice), 'env.ts threshold has no numeric default');

assert(page.indexOf("mutate('token', 'closeProposal'") !== -1, 'Token.vue mutates closeProposal');
assert(page.indexOf('proposalId: this.proposalId') !== -1, 'Token.vue sends proposalId');
assert(page.indexOf('closed.data.status') !== -1, 'Token.vue draws service passed|rejected');
assert(page.indexOf('token.governance_quorum_unset') !== -1, 'Token.vue names quorum unset');
assert(page.indexOf('token.governance_execute_unwired') !== -1, 'Token.vue names grant execute unwired');
assert(page.indexOf('Number(') === -1, 'no Number( on Token.vue');
assert(page.indexOf('parseFloat') === -1, 'no parseFloat on Token.vue');
assert(page.indexOf('parseInt') === -1, 'no parseInt on Token.vue');
assert(page.indexOf('audited:true') === -1 && page.indexOf('audited: true') === -1, 'never audited:true');

assert(lang.indexOf('closeTitle:') !== -1, 'en.js closeTitle');
assert(lang.indexOf('closeRun:') !== -1, 'en.js closeRun');
assert(lang.indexOf('token.governance_quorum_unset') !== -1, 'en.js names quorum unset');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('token-governance-tally.golden: ok');
process.exit(0);
