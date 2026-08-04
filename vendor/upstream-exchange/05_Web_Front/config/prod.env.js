'use strict'
// Values here are substituted into the bundle verbatim by DefinePlugin, so
// each one must be a *source expression* — hence the quotes inside the quotes.
module.exports = {
  NODE_ENV: '"production"',
  // Public origin of the site, read by Vue.prototype.rootHost in src/main.js to
  // build shareable links and QR codes. Not the API base; that is a relative
  // path proxied per config/index.js.
  SITE_ORIGIN: JSON.stringify(process.env.SITE_ORIGIN || 'http://127.0.0.1:8090')
}
