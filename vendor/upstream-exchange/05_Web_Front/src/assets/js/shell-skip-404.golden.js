/**
 * remaining-SOT §12.2 residuals — skip path + branded 404.
 *
 * Vue files are the authority. Axe does not certify this. Named AT is still
 * human. This golden is the machine-provable slice:
 *   skip chrome exists and points at a main landmark
 *   wildcard * renders NotFound, not a money table
 *   #route-heading (or equivalent h1) exists on that 404
 *
 * Run: node src/assets/js/shell-skip-404.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var failed = 0;
function assert(value, name) {
  if (!value) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

var front = path.join(__dirname, '../..');
var app = fs.readFileSync(path.join(front, 'App.vue'), 'utf8');
var notFound = fs.readFileSync(path.join(front, 'pages/NotFound.vue'), 'utf8');
var routes = fs.readFileSync(path.join(front, 'config/routes.js'), 'utf8');
var boundary = fs.readFileSync(
  path.join(front, 'components/intafaced/RouteBoundary.vue'),
  'utf8'
);
var en = fs.readFileSync(path.join(front, 'assets/lang/en.js'), 'utf8');

var appTemplate = app.slice(0, app.indexOf('</template>'));
var notFoundTemplate = notFound.slice(0, notFound.indexOf('</template>'));

assert(
  /<a class="ix-skip-link ix-global-skip" href="#route-main"[^>]*>Skip to main content<\/a>/.test(
    appTemplate
  ),
  'member shell skip link copy is honest “Skip to main content” and targets #route-main'
);
assert(
  /<main id="route-main"[^>]*aria-labelledby="route-heading"/.test(appTemplate),
  'skip target is a main landmark labelled by #route-heading'
);
assert(
  appTemplate.indexOf('<RouteBoundary') >= 0 &&
    appTemplate.indexOf('<router-view') >= 0 &&
    appTemplate.indexOf('id="route-main"') < appTemplate.indexOf('<RouteBoundary') &&
    appTemplate.indexOf('<RouteBoundary') < appTemplate.indexOf('<router-view'),
  '404 paints inside the same main + RouteBoundary as every other route'
);
assert(
  app.indexOf('focusRouteMain()') >= 0 && app.indexOf('this.$refs.routeMain.focus()') >= 0,
  'skip click focuses the main landmark'
);

assert(
  /id="route-heading"/.test(boundary) && /<h1 id="route-heading"/.test(boundary),
  'RouteBoundary owns the stable #route-heading H1'
);
assert(
  /<h1 class="ix-notfound-title">\{\{\s*\$t\("shellResidual\.notFoundLead"\)\s*\}\}<\/h1>/.test(
    notFoundTemplate
  ),
  'not-found has an equivalent visible H1 (notFoundLead)'
);
assert(
  /<p class="ix-notfound-code">404<\/p>/.test(notFoundTemplate),
  'not-found paints branded 404 copy'
);
assert(
  notFoundTemplate.indexOf('shellResidual.notFoundMid') >= 0 &&
    notFoundTemplate.indexOf('shellResidual.notFoundTail') >= 0 &&
    notFoundTemplate.indexOf('attempted') >= 0,
  'not-found names the attempted address instead of guessing'
);

var wildcard = routes.match(
  /\{\s*path:\s*'\*'\s*,\s*component:\s*resolve=>\(require\(\["\.\.\/pages\/NotFound"\],resolve\)\)\s*\}/
);
assert(!!wildcard, 'wildcard * route renders pages/NotFound');
var afterWildcard = routes.slice(routes.lastIndexOf("{ path: '*'"));
assert(
  afterWildcard.indexOf('];') >= 0 &&
    !/\{\s*path:/.test(afterWildcard.slice(afterWildcard.indexOf('}') + 1, afterWildcard.indexOf('];'))),
  'wildcard * stays last in the route table'
);
assert(
  !/\{\s*path:\s*'\*'\s*,\s*component:\s*resolve=>\(require\(\["\.\.\/pages\/(index|Index|Home)"/.test(
    routes
  ),
  'wildcard * is not the home page'
);

assert(
  /notFoundLead:\s*"This address is not one of ours"/.test(en),
  'painted 404 lead is honest (not a blank page, not a working desk)'
);
assert(/titleNotFound:\s*"Not found"/.test(en), 'document-title catalog names not-found');

var paintedKeys = ['notFoundLead', 'notFoundMid', 'notFoundTail', 'titleNotFound'];
var painted = notFoundTemplate;
paintedKeys.forEach(function (key) {
  var match = en.match(new RegExp(key + ':\\s*"([^"]*)"'));
  assert(!!match, 'en.js has ' + key + ' for not-found paint');
  if (match) painted += '\n' + match[1];
});
var fakes = ['$0', '$0.00', 'connected', 'seeded', 'Available 0', 'balance 0'];
fakes.forEach(function (fake) {
  assert(
    painted.toLowerCase().indexOf(fake.toLowerCase()) < 0,
    'not-found copy does not contain fabricated “' + fake + '”'
  );
});
assert(
  !/<table[\s>]/.test(notFoundTemplate) && notFoundTemplate.indexOf('ix-table') < 0,
  'not-found is not a fake empty money table'
);

if (failed) process.exit(1);
console.log('\nshell-skip-404.golden: all passed');
