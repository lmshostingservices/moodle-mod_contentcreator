/**
 * The slide image upload must hand the section id from the "Upload from device" button
 * to the file input in a form the change handler can read.
 *
 * Until v15.7.12 the button stored it with jQuery .data('section-id', id), which writes
 * only to jQuery's internal cache, and the change handler read .attr('data-section-id'),
 * which reads the DOM. The read was always undefined, so every chosen file was dropped
 * without an upload or a message. A client reported it as "it will not let me upload a
 * PNG image to the cards"; it affected every file type.
 *
 * Both sides must use the attribute. This checks the source, so it needs no browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'amd', 'src', 'player5.js'), 'utf8');

let failed = 0;
function check(name, ok) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name);
    if (!ok) { failed++; }
}

console.log('slide image upload hand-off');

const clickStart = src.indexOf("$(document).on('click', '.cc5-image-upload-option'");
const changeStart = src.indexOf("$(document).on('change', '.cc5-image-file-input'");
check('the upload button handler exists', clickStart !== -1);
check('the file input change handler exists', changeStart !== -1);

const clickBody = src.slice(clickStart, src.indexOf('});', clickStart));
const changeBody = src.slice(changeStart, src.indexOf('validateImageAspectRatio', changeStart));

check('the button writes the section id as an attribute',
    /\.cc5-image-file-input'\)\.attr\('data-section-id',/.test(clickBody));
check('the button does not use jQuery .data() for it (the change handler cannot see that)',
    !/\.data\('section-id'/.test(clickBody));
check('the change handler reads the attribute',
    /\.attr\('data-section-id'\)/.test(changeBody));
check('a file with no section id is reported, not dropped silently',
    /if \(file && !sectionId\)[\s\S]*showErrorToast/.test(changeBody));

console.log(failed ? '\nFAILED ' + failed + ' check(s)' : '\nPASSED all checks');
process.exit(failed ? 1 : 0);
