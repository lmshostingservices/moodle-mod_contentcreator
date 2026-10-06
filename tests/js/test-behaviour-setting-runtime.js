/* eslint-env node */
/**
 * v15.7.2: "Require the correct answer to continue" in Behaviour settings, in a browser.
 *
 * Run:  node tests/js/test-behaviour-setting-runtime.js   (exit 0 = pass, 1 = fail)
 * Needs playwright + chromium and node_modules/jquery; SKIPS without them.
 *
 * The REAL showSettingsModal() and saveSettings(), lifted out of player5.js, against a
 * manifest saved BEFORE the setting existed. Asserts the three things the owner asked
 * for after generation: the setting is in the modal, it is ON for old content, and
 * changing it is saved into the manifest and takes effect on the live player.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'amd', 'src');

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.log('SKIP: playwright not installed - runtime checks not run');
    process.exit(0);
}
const JQUERY = path.join(ROOT, 'node_modules', 'jquery', 'dist', 'jquery.min.js');
if (!fs.existsSync(JQUERY)) {
    console.log('SKIP: node_modules/jquery not present - runtime checks not run');
    process.exit(0);
}

let failures = 0;
let checks = 0;
/**
 * @param {String} label
 * @param {Boolean} ok
 * @param {String} [detail]
 */
function check(label, ok, detail) {
    checks++;
    if (ok) { console.log('  ok   ' + label); return; }
    failures++;
    console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
}

const src = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
/**
 * @param {String} name
 * @return {String}
 */
function liftMethod(name) {
    const start = src.indexOf('        ' + name + ': function(');
    if (start === -1) { throw new Error(name + ' not found in player5.js'); }
    let depth = 0;
    let i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') { depth++; } else if (src[i] === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i).trim();
}
/**
 * @param {String} name
 * @return {String}
 */
function liftFunction(name) {
    const start = src.indexOf('    function ' + name + '(');
    if (start === -1) { throw new Error(name + ' not found in player5.js'); }
    let depth = 0;
    let i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') { depth++; } else if (src[i] === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i);
}
let methods;
let clamp;
try {
    methods = ['showSettingsModal', 'saveSettings'].map(liftMethod).join(',\n');
    clamp = liftFunction('_clampDwell');
} catch (e) {
    console.log('FAIL: ' + e.message + ' - fix the extraction, do not delete this file.');
    process.exit(1);
}
// The constructor line, by its text, so the default it applies is the shipped one.
const ctorLine = (src.match(/this\.requireCorrectAnswer = \(config\.manifest\.activitySettings\?\.requireCorrectAnswer\) !== false;/) || [])[0];
check('the player constructor defaults the setting to ON when absent', !!ctorLine);

// BEFORE generation: the builder's own toggle, and that it reaches the manifest.
const builderSrc = fs.readFileSync(path.join(SRC, 'builder.js'), 'utf8');
check('the builder renders the toggle before generation, ticked by default',
    /<input type="checkbox" id="cc-require-correct-enabled" checked>/.test(builderSrc));
check('...and generation writes it into activitySettings',
    /const requireCorrectAnswer = requireCorrectCheckbox\?\.checked \?\? true;/.test(builderSrc)
    && /requireCorrectAnswer: requireCorrectAnswer \/\/ v15\.7\.2/.test(builderSrc));
check('...which manifest.builder.js carries through intact (whole activitySettings object)',
    /planned\[key\] = inputs\[key\] \|\| MANIFEST_SETTINGS\[key\]\(\);/.test(
        fs.readFileSync(path.join(SRC, 'manifest.builder.js'), 'utf8')));

// A pack saved by v15.7.1: activitySettings has no requireCorrectAnswer key.
const oldManifest = {mode: 'vet', settings: {progressionMode: 'free'}, voiceSettings: {enabled: true},
    activitySettings: {enabled: true}, topics: []};

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<script>${fs.readFileSync(JQUERY, 'utf8')}</script></head><body>
<script>
var CC_DWELL_MIN = 0, CC_DWELL_MAX = 120;
${clamp}
function getLabel(k) { return k; }
function getIcon() { return ''; }
var saved = [];
var Ajax = {call: function(reqs) {
    saved.push(JSON.parse(reqs[0].args.manifest));
    return [{done: function(cb) { cb({success: true}); return {fail: function() {}}; }}];
}};
var Notification = {addNotification: function() {}};
var config = {manifest: ${JSON.stringify(oldManifest)}};
var player = {
    manifest: config.manifest, cmid: 9, canEdit: false, rendered: 0,
    render: function() { this.rendered++; },
    countSlidesWithoutImages: function() { return 0; },
    countSlidesWithoutVoiceover: function() { return 0; },
${methods}
};
${ctorLine.replace('this.', 'player.')}
window.player = player;
window.saved = saved;
</script></body></html>`;
const tmp = path.join(require('os').tmpdir(), 'cc-behaviour-harness.html');
fs.writeFileSync(tmp, page_html, 'utf8');

(async function() {
    const dirs = fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers') : [];
    const candidates = dirs.filter(function(d) { return /^chromium(-\d+)?$/.test(d); })
        .map(function(d) { return '/opt/pw-browsers/' + d + '/chrome-linux/chrome'; })
        .filter(function(p) { return fs.existsSync(p); });
    let browser = null;
    for (let i = 0; i < candidates.length && !browser; i++) {
        browser = await playwright.chromium.launch({executablePath: candidates[i]}).catch(function() { return null; });
    }
    if (!browser) { browser = await playwright.chromium.launch().catch(function() { return null; }); }
    if (!browser) { console.log('SKIP: no chromium available'); process.exit(0); }
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', function(e) { errors.push(String(e)); });
    await page.goto('file://' + tmp);

    console.log('\n1. An OLD pack (no requireCorrectAnswer key)');
    check('the live player has the setting ON', await page.evaluate(() => window.player.requireCorrectAnswer === true));
    await page.evaluate(() => window.player.showSettingsModal());
    const box = await page.$('#cc5-require-correct-answer');
    check('Behaviour settings shows the checkbox', !!box);
    check('...ticked, because absent means ON', box && await box.isChecked());
    check('...with its label', (await page.textContent('.cc5-settings-modal')).includes('requireCorrectAnswer'));

    console.log('\n2. The teacher turns it off and saves');
    await page.uncheck('#cc5-require-correct-answer');
    await page.evaluate(() => window.player.saveSettings());
    const saved = await page.evaluate(() => window.saved);
    check('the saved manifest carries requireCorrectAnswer: false',
        saved.length === 1 && saved[0].activitySettings.requireCorrectAnswer === false,
        JSON.stringify(saved[0] && saved[0].activitySettings));
    check('...without disturbing activities enabled', saved[0].activitySettings.enabled === true);
    check('the live player follows immediately and re-renders',
        await page.evaluate(() => window.player.requireCorrectAnswer === false && window.player.rendered === 1));

    console.log('\n3. Reopened, it shows what was saved');
    await page.evaluate(() => window.player.showSettingsModal());
    check('the checkbox is now unticked', !(await page.isChecked('#cc5-require-correct-answer')));

    console.log('\n4. Activities off greys it out but keeps its value');
    await page.check('#cc5-require-correct-answer');
    await page.uncheck('#cc5-activities-enabled');
    check('it is disabled while activities are off', await page.isDisabled('#cc5-require-correct-answer'));
    await page.evaluate(() => window.player.saveSettings());
    const saved2 = await page.evaluate(() => window.saved[1]);
    check('its value is still saved', saved2 && saved2.activitySettings.requireCorrectAnswer === true,
        JSON.stringify(saved2 && saved2.activitySettings));

    check('no JavaScript errors', errors.length === 0, errors.join('\n'));
    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' Behaviour settings checks'));
    process.exit(failures ? 1 : 0);
})();
