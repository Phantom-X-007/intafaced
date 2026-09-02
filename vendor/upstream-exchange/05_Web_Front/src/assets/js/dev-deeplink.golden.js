'use strict';

var fs = require('fs');
var path = require('path');
var source = fs.readFileSync(path.join(__dirname, '../../../config/index.js'), 'utf8');
var bindings = source.match(/bypass:\s*spaHtmlBypass/g) || [];

if (source.indexOf("return '/index.html'") < 0 || bindings.length !== 3) {
  console.error('FAIL: /uc, /exchange, and /otc HTML deep links must bypass API proxies');
  process.exit(1);
}

console.log('dev-deeplink.golden: ok');
