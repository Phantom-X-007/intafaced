'use strict';

/**
 * Fail-first golden — academy stored video (not LiveKit).
 * Run: node src/assets/js/academy-videos.golden.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Curriculum.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');

if (page.indexOf("query('academy', 'videos'") === -1) throw new Error("videos query missing");
if (page.indexOf('academy.video_storage_unconfigured') === -1) {
  throw new Error('unconfigured code academy.video_storage_unconfigured missing');
}
if (page.indexOf("query('academy', 'videoPlayback'") === -1) throw new Error('videoPlayback query missing');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist video in localStorage');
if (page.indexOf('LiveKit') !== -1 || page.indexOf('livekit') !== -1) {
  throw new Error('must not invent LiveKit on stored VOD');
}
if (page.indexOf('tailwind') !== -1 || page.indexOf('class="tw-') !== -1) {
  throw new Error('no Tailwind on the videos card');
}
if (en.indexOf('videoLead') === -1) throw new Error('intafaced.academy.videoLead missing');
if (en.indexOf('videoPlay') === -1) throw new Error('intafaced.academy.videoPlay missing');
if (en.indexOf('videoGranted') === -1) throw new Error('intafaced.academy.videoGranted missing');
if (!/^\s+video:\s+"/m.test(en)) throw new Error('intafaced.academy.video missing');

console.log('academy-videos.golden: ok');
