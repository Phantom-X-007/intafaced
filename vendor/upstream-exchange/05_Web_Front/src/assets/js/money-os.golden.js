#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertContains(value, needle, label) {
  if (value.indexOf(needle) === -1) throw new Error((label || needle) + ' missing');
}

var app = read('App.vue');
var rail = read('pages/uc/MemberCenter.vue');
var balances = read('components/uc/MoneyIndex.vue');
var custody = read('components/uc/CustodyNotBuilt.vue');
var login = read('pages/uc/Login.vue');

assertContains(app, '!isTerminalRoute && !isMoneyOsRoute', 'Money OS excludes marketing chrome');
assertContains(app, 'p === "/exchange"', 'desk route remains terminal mode');
assertContains(rail, 'to="/uc/money"', 'balances rail link');
assertContains(rail, 'Deposit <span>not live</span>', 'deposit refusal in rail');
assertContains(rail, '@media screen and (max-width: 640px)', 'compact viewport rules');
assertContains(balances, 'GET /api/v1/account/balance', 'ledger-backed balance source');
assertContains(balances, 'unknown, not zero', 'failed reads do not fabricate zero');
assertContains(balances, 'String(value)', 'decimal strings stay strings');
assertContains(custody, 'CustodyNotBuilt', 'shared custody refusal');
assertContains(login, 'this.$router.push("/exchange")', 'login returns to desk');

if (balances.indexOf('parseFloat') !== -1 || balances.indexOf('Number(') !== -1) {
  throw new Error('balance screen must not convert money to a JavaScript number');
}

console.log('money-os.golden: ok');
