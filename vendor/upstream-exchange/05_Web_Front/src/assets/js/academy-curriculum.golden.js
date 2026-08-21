'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var page = fs.readFileSync(path.join(root, 'pages/intafaced/academy/Curriculum.vue'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'pages/intafaced/Academy.vue'), 'utf8');

if (page.indexOf('markCurriculumComplete') === -1) throw new Error('markCurriculumComplete missing');
if (page.indexOf("query('academy', 'curriculum'") === -1) throw new Error('curriculum query missing');
if (page.indexOf("query('academy', 'curriculumItem'") === -1) throw new Error('curriculumItem missing');
if (page.indexOf("mutate('academy', 'markCurriculumComplete'") === -1) throw new Error('complete mutate missing');
if (page.indexOf("foundations") === -1 || page.indexOf("markets") === -1 || page.indexOf("builder") === -1 || page.indexOf("sovereign") === -1) {
  throw new Error('four curriculum paths missing');
}
if (hub.indexOf("academy/Curriculum.vue") === -1) throw new Error('Curriculum not imported as a second card');
if (page.indexOf('localStorage') !== -1) throw new Error('must not persist curriculum in localStorage');

console.log('academy-curriculum.golden: ok');
