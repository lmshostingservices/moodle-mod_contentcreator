/* eslint-env node */
/**
 * v15.7.2: Category Sort with and without "Require the correct answer to continue".
 *
 * Run:  node tests/js/test-sort-gate-runtime.js      (exit 0 = pass, 1 = fail)
 * Needs playwright + chromium and node_modules/jquery; SKIPS (exit 0, reason printed)
 * when either is missing, like test-quiz-reveal-runtime.js.
 *
 * The REAL renderer (cc-card-slots.js renderDecisionChallenge), the REAL stylesheet and the
 * REAL _showSortItem/_handleSortAnswer methods, lifted out of player5.js by their own
 * source text - if that extraction stops matching, this file fails rather than silently
 * testing nothing.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// The real renderer.
let Slots;
(function() {
    const sandbox = {define: function(d, f) { sandbox._m = f.apply(null, []); }, window: {}, document: {}, console: console};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, 'cc-card-slots.js'), 'utf8'), sandbox);
    Slots = sandbox._m;
})();
Slots.init({
    getLabel: function(k) { return k; },
    escapeHtml: function(t) { return String(t === undefined || t === null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    fixGrammar: function(t) { return t; },
    getIcon: function() { return ''; },
    resolveScenePartIcon: function() { return ''; },
    formatTextWithDocLinks: function(t) { return t; }
});
const card = {cardType: 'decision-point', questions: [{question: 'Q?', options: [
    {text: 'right', feedback: 'yes', correct: true}, {text: 'wrong', feedback: 'no', correct: false}]}]};
// Item 0 is good, item 1 bad, then alternating. One item carries markup, to prove the
// dropped copy is text, not HTML.
const sortItems = [
    {text: 'Check the register <b>daily</b>', category: 'good'},
    {text: 'Skip the register', category: 'bad'},
    {text: 'Report within two days', category: 'good'},
    {text: 'Wait for a complaint', category: 'bad'}
];
const html = Slots.renderDecisionChallenge(card,
    [{term: 'a', definition: 'b'}, {term: 'c', definition: 'd'}], sortItems,
    {positive: 'Good', negative: 'Avoid'}, false);

/**
 * Lift one method of the Player prototype out of player5.js by its own source text.
 *
 * @param {String} name Method name.
 * @return {String} "name: function(...) {...}"
 */
function liftMethod(name) {
    const src = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
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
let methods;
try {
    methods = ['_showSortItem', '_handleSortAnswer'].map(liftMethod).join(',\n');
} catch (e) {
    console.log('FAIL: ' + e.message + ' - fix the extraction, do not delete this file.');
    process.exit(1);
}

// The shipped tap handler, by its own source text.
const TAP_HANDLER = (function() {
    const src = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
    const start = src.indexOf("$(document).on('click', '.cc5-sort-tap', function(e) {");
    if (start === -1) {
        console.log('FAIL: the .cc5-sort-tap handler was not found in player5.js');
        process.exit(1);
    }
    const end = src.indexOf('});', start) + 3;
    return src.slice(start, end);
})();

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<style>${fs.readFileSync(path.join(ROOT, 'styles', 'player5.css'), 'utf8')}</style>
<script>${fs.readFileSync(JQUERY, 'utf8')}</script>
</head><body><div class="cc5-player" id="player">${html}</div>
<script>
var calls = {right: 0, wrong: 0, drop: 0, unlock: 0, celebrate: 0};
function playDecisionCorrectSound() { calls.right++; }
function playDecisionIncorrectSound() { calls.wrong++; }
function playSortDropSound() { calls.drop++; }
function playUnlockSound() { calls.unlock++; }
function showActivityMiniCelebration() { calls.celebrate++; }
function haptic() {}
function getLabel(k) { return k; }
var player = {
${methods}
};
window.__calls = calls;
window.__player = player;
// The REAL tap-button handler, lifted out of player5.js (see TAP_HANDLER below), bound
// with self pointing at the lifted methods - so a keyboard press goes the shipped way.
var self = player;
${TAP_HANDLER}
window.__start = function(requireCorrect) {
    player.requireCorrectAnswer = requireCorrect;
    var $c = $('.cc5-decision-challenge');
    var $arena = $c.find('.cc5-sort-arena');
    // HARNESS SETUP: show the sort panel, as the panel-transition handler does when the
    // learner reaches it. Hidden panels are display:none and nothing in them can take
    // focus, which the keyboard section below depends on.
    $c.removeClass('cc5-challenge-at-start');
    $c.find('.cc5-challenge-panel').removeClass('cc5-active');
    $arena.closest('.cc5-challenge-panel').addClass('cc5-active');
    $arena.data('current', 0).data('score', 0);
    player._showSortItem($c, 0);
};
window.__answer = function(cat) {
    player._handleSortAnswer($('.cc5-decision-challenge'), cat);
};
window.__state = function() {
    var $c = $('.cc5-decision-challenge');
    var $a = $c.find('.cc5-sort-arena');
    var p = $a.find('.cc5-sort-retry-prompt')[0];
    return {
        current: parseInt($a.data('current'), 10),
        score: parseInt($a.data('score'), 10),
        scoreText: $a.find('.cc5-sort-score').text(),
        dropped: $a.find('.cc5-sort-dropped-item').length,
        droppedWrong: $a.find('.cc5-drop-incorrect').length,
        droppedHtmlBold: $a.find('.cc5-sort-dropped-item b').length,
        itemText: $a.find('.cc5-sort-item-text').text(),
        prompt: p ? p.textContent : null,
        promptVisible: p ? getComputedStyle(p).display !== 'none' : false,
        finishDisabled: $c.find('.cc5-challenge-panel .cc5-sort-arena').closest('.cc5-challenge-panel')
            .find('.cc5-challenge-finish-btn').prop('disabled'),
        sortPassed: $c.data('sort-passed'),
        locked: !!$a.data('sorting-locked')
    };
};
</script></body></html>`;
const tmp = path.join(require('os').tmpdir(), 'cc-sort-gate-harness.html');
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
    const settle = function() { return page.waitForTimeout(700); };

    console.log('\n1. Setting ON (default): a wrong column keeps the item until it is right');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__start(true); });
    await page.evaluate(function() { window.__answer('bad'); }); // item 0 is good
    await settle();
    let st = await page.evaluate(function() { return window.__state(); });
    check('the item is NOT filed and the activity does not advance', st.current === 0 && st.dropped === 0,
        JSON.stringify(st));
    check('the try-again prompt is shown', st.promptVisible && st.prompt === 'sortTryAgainPrompt',
        JSON.stringify(st));
    check('controls are unlocked again for the retry', st.locked === false, JSON.stringify(st));
    await page.evaluate(function() { window.__answer('good'); });
    await settle();
    st = await page.evaluate(function() { return window.__state(); });
    check('the right column files it and moves to the next item', st.current === 1 && st.dropped === 1,
        JSON.stringify(st));
    check('the prompt is cleared', !st.promptVisible, JSON.stringify(st));
    check('a retried item scores once filed correctly (final answers count, v15.7.4)', st.score === 1 && st.scoreText === '1',
        JSON.stringify(st));
    check('item text is dropped as TEXT, not HTML', st.droppedHtmlBold === 0, JSON.stringify(st));
    // The remaining three right first time.
    for (const cat of ['bad', 'good', 'bad']) {
        await page.evaluate(function(c) { window.__answer(c); }, cat);
        await settle();
    }
    st = await page.evaluate(function() { return window.__state(); });
    check('all four filed, all four scored', st.dropped === 4 && st.score === 4, JSON.stringify(st));
    check('See Results unlocks at the end', st.finishDisabled === false, JSON.stringify(st));
    check('sort-passed is TRUE: the learner finished with every item right', st.sortPassed === true,
        JSON.stringify(st));

    console.log('\n2. Setting ON, all right first time');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__start(true); });
    for (const cat of ['good', 'bad', 'good', 'bad']) {
        await page.evaluate(function(c) { window.__answer(c); }, cat);
        await settle();
    }
    st = await page.evaluate(function() { return window.__state(); });
    check('4 of 4 and passed', st.score === 4 && st.sortPassed === true, JSON.stringify(st));

    console.log('\n3. Setting OFF: the v15.7.1 behaviour, unchanged');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__start(false); });
    await page.evaluate(function() { window.__answer('bad'); });
    await settle();
    st = await page.evaluate(function() { return window.__state(); });
    check('a wrong column is filed anyway, marked wrong, and the activity moves on',
        st.current === 1 && st.dropped === 1 && st.droppedWrong === 1, JSON.stringify(st));
    check('no try-again prompt', !st.promptVisible, JSON.stringify(st));
    for (const cat of ['bad', 'good', 'bad']) {
        await page.evaluate(function(c) { window.__answer(c); }, cat);
        await settle();
    }
    st = await page.evaluate(function() { return window.__state(); });
    check('finishes 3 of 4, not passed, See Results unlocked',
        st.score === 3 && st.sortPassed === false && st.finishDisabled === false, JSON.stringify(st));

    console.log('\n4. Keyboard focus survives a wrong answer (self-audit)');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__start(true); });
    await page.waitForTimeout(600);
    await page.focus('.cc5-sort-tap-bad');          // item 0 is good: a wrong answer
    await page.keyboard.press('Enter');
    await settle();
    const focusAfterWrong = await page.evaluate(function() {
        var a = document.activeElement;
        return a ? (a.className || a.tagName) : null;
    });
    check('focus is back on the button the learner pressed, not on <body>',
        /cc5-sort-tap-bad/.test(focusAfterWrong || ''), focusAfterWrong);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.focus('.cc5-sort-tap-good');
    await page.keyboard.press('Enter');
    await settle();
    const focusAfterRight = await page.evaluate(function() {
        var a = document.activeElement;
        return a ? (a.className || a.tagName) : null;
    });
    check('...and still in the activity after a right answer moves to the next item',
        /cc5-sort-tap/.test(focusAfterRight || ''), focusAfterRight);

    check('no JavaScript errors', errors.length === 0, errors.join('\n'));
    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' sort checks'));
    process.exit(failures ? 1 : 0);
})();
