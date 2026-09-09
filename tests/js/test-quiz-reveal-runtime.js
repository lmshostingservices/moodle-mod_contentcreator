/* eslint-env node */
/**
 * The wrong-answer reveal, executed in a real browser.
 *
 * Run:  node tests/js/test-quiz-reveal-runtime.js      (exit 0 = pass, 1 = fail)
 * Needs: playwright + a chromium build, and node_modules/jquery. Skips with exit 0 and a
 * printed reason if either is missing, so it never blocks a checkout that has neither.
 *
 * WHY THIS EXISTS, SEPARATELY FROM test-quiz-feedback.js
 *
 * That suite proves the CHECKS and the MARKUP. It cannot prove the behaviour, and the
 * behaviour is the whole fix: a learner clicks a wrong answer and something appears. Up to
 * v15.4.22 every claim about that was reasoning - that jQuery's .show() beats a stylesheet
 * `display:none`, that the delegated handler binds, that the reveal survives the dimming
 * rule, that the keyboard path takes it too. Reasoning about a cascade is exactly what
 * produced the dark-mode defect this release also fixed.
 *
 * So: the REAL rendered markup (from cc-card-slots.js), the REAL stylesheet, the REAL
 * handler lifted verbatim out of player5.js, real jQuery, and a real Chromium. The handler
 * is extracted by locating its own source text - if that extraction ever stops matching,
 * this file fails rather than silently testing nothing.
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
    console.log('SKIP: playwright not installed (npm i -D playwright) - runtime checks not run');
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
 * Assert one condition.
 *
 * @param {String} label What is being asserted.
 * @param {Boolean} ok The result.
 * @param {String} [detail] Printed on failure.
 * @return {void}
 */
function check(label, ok, detail) {
    checks++;
    if (ok) { console.log('  ok   ' + label); return; }
    failures++;
    console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
}

// ---------------------------------------------------------------------------
// 1. The real markup, from the real renderer.
// ---------------------------------------------------------------------------
let Slots;
(function loadSlots() {
    const sandbox = {define: function(d, f) { sandbox._m = f.apply(null, []); }, window: {}, document: {}, console: console};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, 'cc-card-slots.js'), 'utf8'), sandbox, {filename: 'cc-card-slots.js'});
    Slots = sandbox._m;
})();
Slots.init({
    getLabel: function(k) { return k === 'correctAnswerLabel' ? 'Correct answer' : k; },
    escapeHtml: function(t) { return String(t === undefined || t === null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    fixGrammar: function(t) { return t; },
    getIcon: function() { return ''; },
    resolveScenePartIcon: function() { return ''; },
    formatTextWithDocLinks: function(t) { return t; }
});

// Exactly what a saved schema-v2 manifest holds: the question's single feedback line on the
// correct option, nothing on the distractors.
const card = {cardType: 'decision-point', schemaVersion: 2, title: 'Recording incidents', questions: [{
    question: 'Which action meets the recording rule?',
    options: [
        {text: 'Record the incident in the register within two working days of it happening',
         feedback: 'Clause 4 gives two working days, and the register is what an auditor checks first.',
         // The clip a v2 pack has on its correct option - and NOT on its distractors. The
         // generator writes these lines starting "Correct!", which is why playing this one
         // to someone who answered wrong was worse than saying nothing.
         feedbackAudioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
         correct: true},
        {text: 'Tell the supervisor verbally and leave the register until the monthly review',
         feedback: '', correct: false},
        {text: 'Wait until the client complains before entering anything in the register',
         feedback: '', correct: false},
        // A distractor that DOES carry its own reason, as every pack generated from the
        // v15.4.20 prompt onward should. Its own clip must be the one that plays.
        {text: 'Treat the email thread about it as the record and skip the register',
         feedback: 'An email is not the register, and clause 4 names the register specifically.',
         feedbackAudioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAB=',
         correct: false}
    ]
}]};
card.options = card.questions[0].options;
const quizHtml = Slots.renderDecisionChallenge(card,
    [{term: 'Register', definition: 'The record of incidents'}, {term: 'Clause 4', definition: 'The reporting rule'}],
    [{text: 'a'}, {text: 'b'}, {text: 'c'}, {text: 'd'}], {positive: 'Good', negative: 'Avoid'}, false);

// ---------------------------------------------------------------------------
// 2. The real handler, lifted verbatim out of player5.js.
// ---------------------------------------------------------------------------
const playerSrc = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
const HANDLER_START = "$(document).on('click keydown', '.cc5-decision-challenge .cc5-dp-option', function(e) {";
const HANDLER_END = '// v15.4.6: the challenge-quiz Try Again handler is REMOVED with its button.';
const startIdx = playerSrc.indexOf(HANDLER_START);
const endIdx = playerSrc.indexOf(HANDLER_END);
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.log('FAIL: could not locate the challenge-quiz handler in player5.js.\n'
        + '      The markers this test extracts by have moved. Fix the markers - do NOT\n'
        + '      delete this file: an unextractable handler means these checks are not running.');
    process.exit(1);
}
const handlerSource = playerSrc.slice(startIdx, endIdx).trimEnd();

const page_html = `<!doctype html><html><head><meta charset="utf-8">
<style>${fs.readFileSync(path.join(ROOT, 'styles', 'player5.css'), 'utf8')}</style>
<script>${fs.readFileSync(JQUERY, 'utf8')}</script>
</head><body>
<div class="cc5-player" id="player">${quizHtml}</div>
<script>
// Stubs for everything the handler reaches outside itself. Nothing here influences the
// behaviour under test - they only stop it throwing.
var narration = {paused: false, pause: function() { this.paused = true; }};
var self = {quizVoiceEnabled: true, currentAudio: narration, _quizFbAudio: null,
    stopNarrationForActivities: function() {}, scrollElementToTop: function() {}};
window.__narration = narration;
// Capture every clip the handler tries to play. The question this answers is not "does
// audio work" - it is "WHOSE feedback is the learner hearing".
window.__played = [];
var NativeAudio = window.Audio;
window.Audio = function(src) {
    window.__played.push(src);
    return {play: function() { return Promise.resolve(); }, pause: function() {}, currentTime: 0};
};
var calls = {correctSound: 0, incorrectSound: 0, unlock: 0, celebration: 0};
function playDecisionCorrectSound() { calls.correctSound++; }
function playDecisionIncorrectSound() { calls.incorrectSound++; }
function playUnlockSound() { calls.unlock++; }
function showActivityMiniCelebration() { calls.celebration++; }
function haptic() {}
function ccWarn() {}
function getLabel(k) { return k === 'correctAnswerLabel' ? 'Correct answer' : k; }
var _tryAgainFor = function($opt) {
    var $q = $opt.closest('.cc5-quiz-question');
    if ($q.length) { return $q.find('.cc5-dp-try-again'); }
    return $opt.closest('.cc5-challenge-panel').find('.cc5-dp-try-again');
};
window.__calls = calls;

// HARNESS SETUP, not behaviour under test: the challenge opens on its start screen and the
// panel-transition handler (a different handler, not the one under test) is what activates
// the quiz panel. This does exactly what that handler does to make the quiz visible - the
// two lines at player5.js:12525-12526 - so the clicks below land on a panel in the state a
// learner would see after pressing Start.
window.__openQuiz = function() {
    var $c = $('.cc5-decision-challenge');
    $c.removeClass('cc5-challenge-at-start');
    $c.find('.cc5-challenge-panel').removeClass('cc5-active');
    $c.find('.cc5-challenge-panel[data-panel="1"]').addClass('cc5-active');
};
${handlerSource}
</script></body></html>`;

const tmp = path.join(require('os').tmpdir(), 'cc-reveal-harness.html');
fs.writeFileSync(tmp, page_html, 'utf8');

/**
 * Read the state of the three options as the browser computes it.
 *
 * @param {Object} page Playwright page.
 * @return {Promise<Object>} State snapshot.
 */
async function snapshot(page) {
    // .cc5-dp-option carries `transition: background .18s, border-color .18s`, so a
    // computed colour read immediately after the click is a value part-way through the
    // interpolation - the first draft of this test read rgb(117,179,240) for a border that
    // settles red, and reported a dark-mode defect that did not exist. Wait for every
    // animation on the panel to finish before believing any colour.
    await page.evaluate(function() {
        var running = [];
        document.querySelectorAll('.cc5-quiz-question.cc5-active *').forEach(function(el) {
            if (el.getAnimations) { running = running.concat(el.getAnimations()); }
        });
        return Promise.all(running.map(function(a) { return a.finished.catch(function() {}); }));
    });
    return page.evaluate(function() {
        var out = [];
        document.querySelectorAll('.cc5-quiz-question.cc5-active .cc5-dp-option').forEach(function(el) {
            var fb = el.querySelector('.cc5-dp-feedback');
            var flag = el.querySelector('.cc5-dp-correct-flag');
            var cs = getComputedStyle(el);
            out.push({
                correct: el.getAttribute('data-correct'),
                selected: el.getAttribute('data-selected'),
                revealed: el.classList.contains('cc5-dp-reveal'),
                opacity: cs.opacity,
                borderColor: cs.borderTopColor,
                feedbackVisible: fb ? getComputedStyle(fb).display !== 'none' : null,
                feedbackText: fb ? fb.textContent.trim().slice(0, 40) : null,
                flagVisible: flag ? getComputedStyle(flag).display !== 'none' : null,
                flagTop: flag ? Math.round(flag.getBoundingClientRect().top) : null,
                textBottom: (function() {
                    var t = el.querySelector('.cc5-dp-option-text');
                    return t ? Math.round(t.getBoundingClientRect().bottom) : null;
                })(),
                flagBelowText: (function() {
                    var t = el.querySelector('.cc5-dp-option-text');
                    if (!t || !flag) { return null; }
                    // Its top edge must be at or below the text's last line box, allowing
                    // 2px for rounding - an inline badge sits ABOVE that bottom edge.
                    return flag.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 2;
                })(),
                srText: (el.querySelector('.cc5-dp-result-text') || {}).textContent || ''
            });
        });
        return {options: out, calls: window.__calls};
    });
}

(async function run() {
    // A pinned chromium may live under any of these; fall back to whatever playwright
    // manages itself. A missing browser SKIPS - it must never look like a pass.
    const candidates = (fs.readdirSync('/opt/pw-browsers').filter(function(d) {
        return /^chromium(-\d+)?$/.test(d);
    }) || []).map(function(d) { return '/opt/pw-browsers/' + d + '/chrome-linux/chrome'; })
        .filter(function(p2) { return fs.existsSync(p2); });
    let browser = null;
    for (let i = 0; i < candidates.length && !browser; i++) {
        browser = await playwright.chromium.launch({executablePath: candidates[i]}).catch(function() { return null; });
    }
    if (!browser) { browser = await playwright.chromium.launch().catch(function() { return null; }); }
    if (!browser) {
        console.log('SKIP: no chromium available to launch - runtime checks not run');
        process.exit(0);
    }
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', function(err) { pageErrors.push(String(err)); });

    console.log('\n1. A learner clicks a WRONG answer (the reported defect)');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    const before = await snapshot(page);
    check('before answering, no option shows feedback or a badge',
        before.options.every(function(o) { return !o.feedbackVisible && !o.flagVisible && !o.revealed; }),
        JSON.stringify(before.options));

    // :not([data-feedback-audio]) is load-bearing. shuffleOptions() randomises the order, so
    // "the first wrong option" is sometimes the distractor that DOES carry its own clip -
    // which then plays, correctly, and failed this check about two runs in five. The bug was
    // in the selector, not the player: an audio assertion has to name WHICH option it clicks.
    await page.click('.cc5-quiz-question.cc5-active '
        + '.cc5-dp-option[data-correct="false"]:not([data-feedback-audio])');
    const after = await snapshot(page);
    const chosen = after.options.find(function(o) { return o.selected === 'incorrect'; });
    const right = after.options.find(function(o) { return o.correct === 'true'; });

    check('no JavaScript error was thrown', pageErrors.length === 0, pageErrors.join('\n'));
    check('the chosen wrong option is marked incorrect', !!chosen);
    check('THE CORRECT ANSWER IS REVEALED', !!right && right.revealed, JSON.stringify(right));
    check('its feedback is actually visible in the browser (stylesheet display:none beaten)',
        !!right && right.feedbackVisible === true, JSON.stringify(right));
    check('the feedback carries the real explanation text',
        !!right && /Clause 4 gives two working days/.test(right.feedbackText || ''), right && right.feedbackText);
    check('the "Correct answer" badge is visible on it',
        !!right && right.flagVisible === true);
    // v15.4.25: VISIBLE is not the same as PLACED. The badge shipped as inline-block next
    // to an inline <span> of option text, so it rendered glued to the last word - visible,
    // and wrong. Every check up to here passed it. This one asserts it starts its own line
    // below the text rather than sharing the text's baseline.
    check('...and it sits on its own line, not glued to the end of the option text',
        !!right && right.flagBelowText === true,
        right && ('badge top=' + right.flagTop + ' text bottom=' + right.textBottom));
    check('the revealed option is NOT dimmed by the answered-state rule',
        !!right && parseFloat(right.opacity) === 1, right && right.opacity);
    check('the other unchosen option IS dimmed, so the reveal stands out',
        after.options.some(function(o) { return o.correct === 'false' && !o.selected && parseFloat(o.opacity) < 0.5; }),
        JSON.stringify(after.options.map(function(o) { return o.opacity; })));
    check('in light mode the revealed answer carries a green border and the chosen one red',
        !!right && !!chosen
        && (function(c) { return c[1] > c[0] + 20; })((right.borderColor.match(/\d+/g) || []).map(Number))
        && (function(c) { return c[0] > c[1] + 40; })((chosen.borderColor.match(/\d+/g) || []).map(Number)),
        'reveal=' + (right || {}).borderColor + ' chosen=' + (chosen || {}).borderColor);
    check('the screen reader is told which one is correct',
        !!right && /Correct answer/.test(right.srText), right && right.srText);
    check('the incorrect sound fired, the correct one did not',
        after.calls.incorrectSound === 1 && after.calls.correctSound === 0, JSON.stringify(after.calls));

    check('a wrong answer with no reason of its own plays NOTHING - it must never read out '
        + 'the correct answer\'s "Correct!..." line to someone who just got it wrong',
        (await page.evaluate(function() { return window.__played.length; })) === 0,
        JSON.stringify(await page.evaluate(function() { return window.__played; })));

    check('answering silences the section narration even when no clip plays',
        (await page.evaluate(function() { return window.__narration.paused; })) === true);

    console.log('\n1b. A wrong answer that HAS its own reason reads that reason out');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    // The distractor carrying its own feedback and its own clip.
    await page.click('.cc5-quiz-question.cc5-active .cc5-dp-option[data-feedback-audio]'
        + '[data-correct="false"]');
    await page.waitForTimeout(500);
    const playedOwn = await page.evaluate(function() { return window.__played; });
    check('exactly one clip plays, and it is the WRONG answer\'s own',
        playedOwn.length === 1 && /ZGF0YQAAAAB=$/.test(playedOwn[0]),
        JSON.stringify(playedOwn));
    const stateOwn = await snapshot(page);
    check('...and the correct answer is still revealed beside it',
        stateOwn.options.some(function(o) { return o.correct === 'true' && o.revealed; }));

    console.log('\n2. Clicking the RIGHT answer is unchanged');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    await page.click('.cc5-quiz-question.cc5-active .cc5-dp-option[data-correct="true"]');
    const ok = await snapshot(page);
    const okRight = ok.options.find(function(o) { return o.correct === 'true'; });
    check('the chosen correct option shows its own feedback',
        !!okRight && okRight.selected === 'correct' && okRight.feedbackVisible === true);
    check('nothing is "revealed" - there was nothing to reveal',
        ok.options.every(function(o) { return !o.revealed; }));
    check('the badge stays hidden when the learner got it right themselves',
        !!okRight && okRight.flagVisible === false);

    console.log('\n3. The keyboard path takes the same route');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    await page.focus('.cc5-quiz-question.cc5-active .cc5-dp-option[data-correct="false"]');
    await page.keyboard.press('Enter');
    const kb = await snapshot(page);
    check('Enter on a wrong option reveals the correct one',
        (kb.options.find(function(o) { return o.correct === 'true'; }) || {}).revealed === true);

    console.log('\n4. A second click cannot re-score or re-reveal');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    await page.click('.cc5-quiz-question.cc5-active .cc5-dp-option[data-correct="false"]');
    await page.evaluate(function() {
        // pointer-events:none stops a real click, so dispatch straight at the element -
        // the handler's own answered-guard is what must refuse it.
        document.querySelectorAll('.cc5-quiz-question.cc5-active .cc5-dp-option').forEach(function(el) {
            el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        });
    });
    const twice = await snapshot(page);
    check('a second answer is refused: still exactly one selected option',
        twice.options.filter(function(o) { return o.selected; }).length === 1,
        JSON.stringify(twice.options.map(function(o) { return o.selected; })));
    check('and the sounds did not fire again', twice.calls.incorrectSound === 1, JSON.stringify(twice.calls));

    console.log('\n5. Dark mode, in the browser rather than in my head');
    await page.goto('file://' + tmp);
    await page.evaluate(function() { window.__openQuiz(); });
    await page.evaluate(function() { document.getElementById('player').classList.add('dark-mode'); });
    await page.click('.cc5-quiz-question.cc5-active .cc5-dp-option[data-correct="false"]');
    const dark = await snapshot(page);
    const darkRight = dark.options.find(function(o) { return o.correct === 'true'; });
    const darkWrong = dark.options.find(function(o) { return o.selected === 'incorrect'; });
    const rgb = function(s) { return (s.match(/\d+/g) || [0, 0, 0]).map(Number); };
    check('in dark mode the revealed answer still carries a GREEN border',
        !!darkRight && rgb(darkRight.borderColor)[1] > rgb(darkRight.borderColor)[0] + 20,
        darkRight && darkRight.borderColor);
    check('and the wrong answer a RED one (this had no dark rule before v15.4.20)',
        !!darkWrong && rgb(darkWrong.borderColor)[0] > rgb(darkWrong.borderColor)[1] + 40,
        darkWrong && darkWrong.borderColor);
    check('the revealed feedback is visible in dark mode too',
        !!darkRight && darkRight.feedbackVisible === true);

    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' runtime checks'));
    process.exit(failures ? 1 : 0);
})();
