'use strict';
/**
 * Fail-first: /market/mine leftover mutate is market.createListing.
 * Price stays a decimal string. Shell does not post. Subscribe is not invented.
 * Run from 05_Web_Front: node src/assets/js/market-create-listing.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/market/Mine.vue'), 'utf8');
if (page.indexOf("mutate('market', 'createListing'") === -1) throw new Error('createListing missing');
if (page.indexOf("offerType: 'one_time'") === -1) throw new Error('offerType one_time missing');
if (page.indexOf('price: this.listing.price') === -1) throw new Error('price must be the decimal string field');
if (page.indexOf('Number(') !== -1) throw new Error('money converted to number');
if (page.indexOf('parseFloat') !== -1) throw new Error('price parseFloat');
if (page.indexOf('parseInt') !== -1) throw new Error('price parseInt');
if (page.indexOf('type="number"') !== -1) throw new Error('numeric input would coerce money');
if (page.indexOf('periodSeconds') !== -1) throw new Error('invented subscribe period');
if (page.indexOf("offerType: 'subscription'") !== -1) throw new Error('invented subscribe offerType');
if (page.indexOf('listings.data && listings.data.length') === -1) throw new Error('empty myListings must stay empty, not 0');
if (page.indexOf('/api/market/trpc/createListing') === -1) throw new Error('createListing refuse surface missing');
if (/\bfetch\s*\(/.test(page)) throw new Error('shell must not post; mutate is the only write');
var nav = fs.readFileSync(path.join(root, 'config/ix-nav.js'), 'utf8');
if (nav.indexOf('createListing') === -1) throw new Error('/market/mine procedures missing createListing');
console.log('market-create-listing.golden: ok');
