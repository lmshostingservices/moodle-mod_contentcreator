/* eslint-env node */
/**
 * v15.7.2: multi-select industry and sub-industry, in a real browser.
 *
 * Run:  node tests/js/test-industry-multiselect-runtime.js   (exit 0 = pass, 1 = fail)
 * Needs playwright + chromium; SKIPS (exit 0, reason printed) without them.
 *
 * The helpers under test are the REAL ones, lifted out of builder.js by their own source
 * text (ccMultiValues, ccMultiValue, ccSectorOptionsHtml, ccJobTitlesForIndustries,
 * ccIndustryContextText, ccEnhanceMultiSelect), driving the same <select multiple> markup
 * the builder template renders. The industry and sub-industry tables are small stand-ins:
 * the tables are data, and tests/moodle/e2e-industry-pickers.js covers them on a real
 * Moodle.
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

const builderSrc = fs.readFileSync(path.join(SRC, 'builder.js'), 'utf8');
/**
 * Lift `const name = (...) => ...;` out of builder.js.
 *
 * @param {String} name
 * @return {String}
 */
function liftConst(name) {
    const start = builderSrc.indexOf('    const ' + name + ' = (');
    if (start === -1) { throw new Error(name + ' not found in builder.js'); }
    const arrow = builderSrc.indexOf('=>', start);
    let i = arrow + 2;
    while (builderSrc[i] === ' ') { i++; }
    if (builderSrc[i] !== '{') {
        // Expression body: up to the end of the line.
        return builderSrc.slice(start, builderSrc.indexOf('\n', i)).trim();
    }
    let depth = 0;
    for (; i < builderSrc.length; i++) {
        if (builderSrc[i] === '{') { depth++; } else if (builderSrc[i] === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return builderSrc.slice(start, i).trim() + ';';
}
let lifted;
try {
    lifted = ['ccMultiValues', 'ccMultiValue', 'ccSectorOptionsHtml', 'ccJobTitlesForIndustries',
        'ccIndustryContextText', 'ccEnhanceMultiSelect'].map(liftConst).join('\n');
} catch (e) {
    console.log('FAIL: ' + e.message + ' - fix the extraction, do not delete this file.');
    process.exit(1);
}

check('the VET template renders both pickers as <select multiple>',
    /id="cc-industry" data-testid="select-industry" multiple>/.test(builderSrc)
    && /id="cc-industry-sector" data-testid="select-industry-sector" multiple>/.test(builderSrc));
check('the Workplace/Policy template does too',
    /id="cc-wp-industry" data-testid="select-wp-industry" multiple>/.test(builderSrc)
    && /id="cc-wp-industry-sector" data-testid="select-wp-industry-sector" multiple>/.test(builderSrc));
check('the pickers are enhanced when the step is bound',
    /const bindCountryStateHandlers = \(\) => \{\n\s+ccEnhanceIndustryPickers\(\);/.test(builderSrc));
check('the VET cascade fills sub-industries from EVERY selected industry',
    /ccSectorOptionsHtml\(industries, ccMultiValues\('cc-industry-sector'\)\)/.test(builderSrc));
check('the Workplace cascade does too',
    /ccSectorOptionsHtml\(industries, ccMultiValues\('cc-wp-industry-sector'\)\)/.test(builderSrc));
check('VET and Workplace contexts carry every selection to the AI',
    (builderSrc.match(/const industryContext = ccIndustryContextText\(|\? ccIndustryContextText\(/g) || []).length === 2
    && /industries: ccMultiValues\('cc-industry'\)/.test(builderSrc)
    && /industries: ccMultiValues\('cc-wp-industry'\)/.test(builderSrc));
check('no reader still describes the context from the first industry only',
    !/const industrySector = document\.getElementById\('cc(-wp)?-industry-sector'\)\?\.value/.test(builderSrc));

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<style>${fs.readFileSync(path.join(ROOT, 'styles', 'tokens.css'), 'utf8')}
${fs.readFileSync(path.join(ROOT, 'styles', 'builder.css'), 'utf8')}</style></head><body>
<div class="cc-form-group"><label class="cc-form-label">Industry</label>
<select class="cc-select" id="cc-industry" multiple>
<option value="Construction">Construction</option><option value="Mining">Mining</option>
<option value="Health">Health</option></select></div>
<div class="cc-form-group"><label class="cc-form-label">Sub-industry</label>
<select class="cc-select" id="cc-industry-sector" multiple></select></div>
<script>
var SUBS = {Construction: ['Civil', 'Residential', 'General'], Mining: ['Open cut', 'Underground', 'General'], Health: ['Aged care']};
var JOBS = {Construction: ['Labourer', 'Supervisor'], Mining: ['Driller', 'Supervisor'], Other: ['Worker']};
function getSubcategoriesForIndustry(i) { return SUBS[i] || ['General']; }
function getJobTitlesForIndustry(i) { return JOBS[i] || JOBS.Other; }
function s(k) { return k; }
function escapeHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
${lifted}
// The cascade, as the VET onchange does it.
var ind = document.getElementById('cc-industry');
ind.onchange = function() {
    document.getElementById('cc-industry-sector').innerHTML =
        ccSectorOptionsHtml(ccMultiValues('cc-industry'), ccMultiValues('cc-industry-sector'));
};
ccEnhanceMultiSelect(ind, 'msgselectindustries');
ccEnhanceMultiSelect(document.getElementById('cc-industry-sector'), 'msgselectsectors');
window.api = {ccMultiValues: ccMultiValues, ccMultiValue: ccMultiValue,
    ccJobTitlesForIndustries: ccJobTitlesForIndustries, ccIndustryContextText: ccIndustryContextText};
</script></body></html>`;
const tmp = path.join(require('os').tmpdir(), 'cc-industry-harness.html');
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

    console.log('\n1. Picking several industries');
    check('the native select is hidden and a toggle shows the placeholder',
        await page.$eval('#cc-industry', e => getComputedStyle(e).opacity === '0')
        && (await page.textContent('#cc-industry + .cc-multi .cc-multi-summary')) === 'msgselectindustries');
    check('sub-industry is disabled until an industry is picked',
        await page.$eval('#cc-industry-sector + .cc-multi .cc-multi-toggle', e => e.disabled));
    await page.click('#cc-industry + .cc-multi .cc-multi-toggle');
    await page.check('#cc-industry-opt-0');   // Construction
    await page.check('#cc-industry-opt-1');   // Mining
    let vals = await page.evaluate(() => window.api.ccMultiValues('cc-industry'));
    check('both industries are selected on the native select', JSON.stringify(vals) === '["Construction","Mining"]',
        JSON.stringify(vals));
    check('.value still returns the FIRST - per-industry lookups keep working',
        (await page.$eval('#cc-industry', e => e.value)) === 'Construction');
    check('the toggle summarises the selection',
        (await page.textContent('#cc-industry + .cc-multi .cc-multi-summary')) === 'Construction, Mining');

    // Close the panel as a user would before moving to the next control.
    await page.keyboard.press('Escape');
    console.log('\n2. Sub-industries from every selected industry');
    const groups = await page.$$eval('#cc-industry-sector optgroup', os => os.map(o => o.label));
    check('one group per industry', JSON.stringify(groups) === '["Construction","Mining"]', JSON.stringify(groups));
    await page.click('#cc-industry-sector + .cc-multi .cc-multi-toggle');
    const boxes = await page.$$eval('#cc-industry-sector-panel input', is => is.map(i => i.value));
    check('the panel offers both industries\' sub-industries', boxes.includes('Civil') && boxes.includes('Underground'),
        JSON.stringify(boxes));
    await page.check('#cc-industry-sector-panel input[value="Civil"]');
    await page.check('#cc-industry-sector-panel input[value="Underground"]');
    vals = await page.evaluate(() => window.api.ccMultiValues('cc-industry-sector'));
    check('several sub-industries are selected', JSON.stringify(vals) === '["Civil","Underground"]', JSON.stringify(vals));

    console.log('\n3. Adding an industry keeps what is already ticked');
    await page.keyboard.press('Escape');
    await page.click('#cc-industry + .cc-multi .cc-multi-toggle');
    await page.check('#cc-industry-opt-2');   // Health
    vals = await page.evaluate(() => window.api.ccMultiValues('cc-industry-sector'));
    check('Civil and Underground survive the sub-industry list being rebuilt',
        JSON.stringify(vals) === '["Civil","Underground"]', JSON.stringify(vals));
    const boxes2 = await page.$$eval('#cc-industry-sector-panel input', is => is.map(i => i.value));
    check('...and the panel was rebuilt with Health\'s sub-industries', boxes2.includes('Aged care'),
        JSON.stringify(boxes2));
    await page.uncheck('#cc-industry-opt-1'); // drop Mining - the industry panel is still open
    vals = await page.evaluate(() => window.api.ccMultiValues('cc-industry-sector'));
    check('removing an industry drops its sub-industries', JSON.stringify(vals) === '["Civil"]', JSON.stringify(vals));

    console.log('\n4. A shared sub-industry name stays unambiguous and in step');
    await page.check('#cc-industry-opt-1');   // Mining back
    await page.keyboard.press('Escape');
    await page.click('#cc-industry-sector + .cc-multi .cc-multi-toggle');
    check('opening one picker closes the other',
        await page.$eval('#cc-industry-panel', e => e.hidden));
    await page.check('#cc-industry-sector-panel input[value="General"] >> nth=0');
    const generalBoxes = await page.$$eval('#cc-industry-sector-panel input[value="General"]', is => is.map(i => i.checked));
    check('ticking "General" ticks it under both industries, and it is listed once',
        generalBoxes.every(Boolean)
        && (await page.evaluate(() => window.api.ccMultiValues('cc-industry-sector'))).filter(v => v === 'General').length === 1,
        JSON.stringify(generalBoxes));

    console.log('\n5. What the AI is told');
    const one = await page.evaluate(() => window.api.ccIndustryContextText(['Construction'], ['Civil']));
    check('one industry reads exactly as before', one === 'Construction - Civil', one);
    const many = await page.evaluate(() => window.api.ccIndustryContextText(['Construction', 'Mining'], ['Civil', 'Underground']));
    check('several are listed with their own sub-industries',
        /Construction \(Civil\); Mining \(Underground\)$/.test(many), many);
    check('...and the model is told to vary the industry across slides, not blend them',
        /vary the industry\s+across slides rather than blending/.test(many), many);
    const jobs = await page.evaluate(() => window.api.ccJobTitlesForIndustries(['Construction', 'Mining']));
    check('job title suggestions come from every industry, de-duplicated',
        JSON.stringify(jobs) === '["Labourer","Supervisor","Driller"]', JSON.stringify(jobs));

    console.log('\n6. Keyboard and dismissal');
    await page.keyboard.press('Escape');
    check('Escape closes the panel',
        await page.$eval('#cc-industry-sector-panel', e => e.hidden));
    check('the toggle reports its state to assistive tech',
        (await page.$eval('#cc-industry-sector + .cc-multi .cc-multi-toggle', e => e.getAttribute('aria-expanded'))) === 'false');
    // A script setting the native select directly (as the e2e Moodle test does) is reflected.
    await page.selectOption('#cc-industry', ['Health']);
    await page.waitForTimeout(100);
    check('selectOption() on the native select updates the visible summary',
        (await page.textContent('#cc-industry + .cc-multi .cc-multi-summary')) === 'Health');

    check('no JavaScript errors', errors.length === 0, errors.join('\n'));
    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' industry checks'));
    process.exit(failures ? 1 : 0);
})();
