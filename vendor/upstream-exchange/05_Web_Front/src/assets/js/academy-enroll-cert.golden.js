'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Certs.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("mutate('academy', 'enrollCertPath'") === -1) throw new Error('enrollCertPath mutate missing');
if (page.indexOf("{ pathSlug:") === -1 && page.indexOf("{ pathSlug: pathSlug }") === -1) {
  throw new Error('enrollCertPath pathSlug missing');
}
if (page.indexOf('foundations') === -1 || page.indexOf('markets') === -1 || page.indexOf('builder') === -1 || page.indexOf('sovereign') === -1) {
  throw new Error('four cert path slugs missing');
}
if (page.indexOf("mutate('academy', 'grantCert'") === -1) throw new Error('grantCert mutate must stay');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist enroll in localStorage');
if (en.indexOf("'certs.enroll'") === -1) throw new Error('certs.enroll i18n missing');
if (en.indexOf("'certs.enrollLead'") === -1) throw new Error('certs.enrollLead i18n missing');
if (en.indexOf("'certs.enrollSubmit'") === -1) throw new Error('certs.enrollSubmit i18n missing');
if (en.indexOf("'certs.enrollSignIn'") === -1) throw new Error('certs.enrollSignIn i18n missing');
if (en.indexOf("'certs.enrolled'") === -1) throw new Error('certs.enrolled i18n missing');

console.log('academy-enroll-cert.golden: ok');
