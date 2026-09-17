/* eslint-env node */
/**
 * The STANDALONE decision-point card, executed in a real browser.
 *
 * test-quiz-reveal-runtime.js covers the three-activity challenge. This covers the other
 * renderer, and it was the untested half of v15.5.0's server-side grading.
 *
 * renderDecisionChallenge() falls back to renderDecisionPoint() when a pack yields neither
 * flip cards nor sort items - fewer than two flip items or fewer than four sort items. The
 * card that comes out is a different shape with a different handler: it keeps Try Again,
 * which the challenge quiz dropped in v15.4.6, and it has no wrong-answer reveal.
 *
 * What makes it worth a file of its own is Try Again. The handler is asynchronous now, and
 * Try Again re-enables a question that has already been through one server round trip. If
 * the reset and the grading path disagree - a feedback node removed on the first attempt
 * and expected on the second, a lock that is not cleared, a second request that is never
 * sent - the learner gets a card that looks live and does nothing.
 *
 * Real markup from cc-card-slots.js, the real stylesheet, the real handler lifted out of
 * player5.js, real jQuery, real Chromium, and a faithful stand-in for check_answer.
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
 * Assert one condition.
 *
 * @param {String} label What is being asserted.
 * @param {Boolean} ok The result.
 * @param {String} [detail] Printed on failure.
 * @return {void}
 */
function check(label, ok, detail) {
    checks++;
    if (ok) {
        console.log('  ok   ' + label);
        return;
    }
    failures++;
    console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
}

let Slots;
(function loadSlots() {
    const sandbox = {
        define: function(d, f) { sandbox._m = f.apply(null, []); },
        window: {}, document: {}, console: console
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, 'cc-card-slots.js'), 'utf8'), sandbox,
        {filename: 'cc-card-slots.js'});
    Slots = sandbox._m;
})();
Slots.init({
    getLabel: function(k) { return k === 'correctAnswerLabel' ? 'Correct answer' : k; },
    escapeHtml: function(t) {
        return String(t === undefined || t === null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    fixGrammar: function(t) { return t; },
    getIcon: function() { return ''; },
    resolveScenePartIcon: function() { return ''; },
    formatTextWithDocLinks: function(t) { return t; }
});

// Option 1 is correct. Option 2 carries its own reason; option 0 and 3 carry none, which
// is what a v2 pack looks like and is the case that used to leave a learner with nothing.
const OPTIONS = [
    {text: 'Cross the opening because the supervisor waved you through', feedback: '', correct: false},
    {text: 'Stay behind the barrier and use the marked pedestrian route',
        feedback: 'Correct. The worker duty applies to your own movement.', correct: true},
    {text: 'Move the barrier so the route is shorter',
        feedback: 'Moving a barrier changes a control other people rely on.', correct: false},
    {text: 'Follow whoever crossed first', feedback: '', correct: false}
];

const card = {
    cardType: 'decision-point', schemaVersion: 2, title: 'Duty of care',
    questions: [{question: 'Which action applies your worker duties?', options: OPTIONS}]
};
card.options = OPTIONS;

// No flip items and no sort items, which is exactly how renderDecisionChallenge falls
// through to the standalone renderer.
const html = Slots.renderDecisionChallenge(card, [], [], {positive: 'Good', negative: 'Avoid'}, false);

// ---------------------------------------------------------------------------
// The real handler, lifted out of player5.js by its own markers.
// ---------------------------------------------------------------------------
const playerSrc = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');

/**
 * Cut a handler out of player5.js between two literal markers.
 *
 * An extraction that stops matching fails the suite rather than silently testing nothing.
 *
 * @param {String} startMarker Literal text the handler begins with.
 * @param {String} endMarker Literal text that follows it.
 * @param {String} name For the failure message.
 * @return {String} The handler source.
 */
function extract(startMarker, endMarker, name) {
    const a = playerSrc.indexOf(startMarker);
    const b = playerSrc.indexOf(endMarker, a);
    if (a === -1 || b === -1 || b < a) {
        console.log('FAIL: could not locate the ' + name + ' in player5.js.\n'
            + '      The markers this test extracts by have moved. Fix the markers - do NOT\n'
            + '      delete this file: an unextractable handler means these checks are not running.');
        process.exit(1);
    }
    return playerSrc.slice(a, b).trimEnd();
}

const answerHandler = extract(
    "$(document).on('click keydown', '.cc5-dp-option', function(e) {",
    '// -- v10.43b: Try Again',
    'standalone decision-point answer handler');
const tryAgainHandler = extract(
    "$(document).on('click', '.cc5-dp-try-again-btn', function(e) {",
    '// -- end v10.43b decision point handler',
    'standalone Try Again handler');

const page = `<!doctype html><html><head><meta charset="utf-8">
<style>${fs.readFileSync(path.join(ROOT, 'styles', 'player5.css'), 'utf8')}</style>
<script>${fs.readFileSync(JQUERY, 'utf8')}</script>
</head><body>
<div class="cc5-player" id="player"><div class="cc5-slide-content" data-section-id="subtopic_0_1">${html}</div></div>
<script>
var OPTIONS = ${JSON.stringify(OPTIONS)};
window.__graded = [];
window.__unlocked = 0;
function ccWarn() {}
function getLabel(k) { return k === 'correctAnswerLabel' ? 'Correct answer' : k; }
function playDecisionCorrectSound() { window.__sounds.correct++; }
function playDecisionIncorrectSound() { window.__sounds.incorrect++; }
window.__sounds = {correct: 0, incorrect: 0};
window.Audio = function() { return {play: function() { return Promise.resolve(); }, pause: function() {}, currentTime: 0}; };
var _tryAgainFor = function($opt) {
    var $q = $opt.closest('.cc5-quiz-question');
    if ($q.length) { return $q.find('.cc5-dp-try-again'); }
    return $opt.closest('.cc5-decision-challenge').find('.cc5-dp-try-again');
};
// A faithful stand-in for mod_contentcreator_check_answer: it reads data-oidx exactly as
// the real ccGradeAnswer does and answers from the same fixture the markup was built from.
var self = {
    quizVoiceEnabled: false, currentAudio: null, _quizFbAudio: null, cmid: 1,
    ccGradeAnswer: function($opt, done) {
        var oidx = parseInt($opt.attr('data-oidx'), 10);
        window.__graded.push(oidx);
        if (isNaN(oidx) || !OPTIONS[oidx]) { done(new Error('no manifest index')); return; }
        var correctIndex = -1;
        OPTIONS.forEach(function(o, i) { if (o.correct) { correctIndex = i; } });
        var chosen = OPTIONS[oidx];
        var isCorrect = (oidx === correctIndex);
        Promise.resolve().then(function() {
            done(null, {
                success: true, graded: true, iscorrect: isCorrect, correctindex: correctIndex,
                feedback: chosen.feedback || '',
                correctfeedback: (!isCorrect ? (OPTIONS[correctIndex].feedback || '') : ''),
                feedbackaudiourl: ''
            });
        });
    },
    ccUnlockOptions: function($options) {
        window.__unlocked++;
        $options.attr('data-answered', 'false').data('answered', false);
        $options.find('.cc5-dp-option').attr('aria-disabled', 'false').attr('aria-pressed', 'false');
    }
};
window.self2 = self;
window.__realGrade = self.ccGradeAnswer;
${answerHandler}
${tryAgainHandler}
</script></body></html>`;

const tmp = path.join(require('os').tmpdir(), 'cc-standalone-dp.html');
fs.writeFileSync(tmp, page, 'utf8');

const OPT = '.cc5-dp-option';
const RIGHT = OPT + '[data-oidx="1"]';
const WRONG_BARE = OPT + '[data-oidx="0"]';
const WRONG_WITH_REASON = OPT + '[data-oidx="2"]';

/**
 * Wait for the verdict to land in the DOM.
 *
 * @param {Object} p Playwright page.
 * @return {Promise<void>} Resolves once an option has been scored.
 */
async function settle(p) {
    await p.waitForSelector('.cc5-dp-option[data-selected]', {timeout: 5000});
}

/**
 * Read the state of every option as the browser computes it.
 *
 * @param {Object} p Playwright page.
 * @return {Promise<Array>} One entry per option.
 */
function snapshot(p) {
    return p.evaluate(function() {
        var out = [];
        document.querySelectorAll('.cc5-dp-option').forEach(function(el) {
            var fb = el.querySelector('.cc5-dp-feedback');
            out.push({
                oidx: el.getAttribute('data-oidx'),
                selected: el.getAttribute('data-selected'),
                ariaDisabled: el.getAttribute('aria-disabled'),
                feedbackVisible: fb ? getComputedStyle(fb).display !== 'none' : null,
                feedbackText: fb ? fb.textContent.trim() : null,
                srText: (el.querySelector('.cc5-dp-result-text') || {}).textContent || ''
            });
        });
        return out;
    });
}

(async function run() {
    const candidates = (fs.existsSync('/opt/pw-browsers')
        ? fs.readdirSync('/opt/pw-browsers').filter(function(d) { return /^chromium(-\d+)?$/.test(d); })
        : []).map(function(d) { return '/opt/pw-browsers/' + d + '/chrome-linux/chrome'; })
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
    const p = await browser.newPage();
    const pageErrors = [];
    p.on('pageerror', function(err) { pageErrors.push(String(err)); });

    console.log('\nthe standalone decision-point card, in a real browser');

    console.log('\n1. The fallback renderer was reached, and it names no answer');
    await p.goto('file://' + tmp);
    check('the standalone card rendered, not the three-activity challenge',
        (await p.$$('.cc5-dp-option')).length === 4
        && (await p.$$('.cc5-decision-challenge')).length === 0,
        'options=' + (await p.$$('.cc5-dp-option')).length
            + ' challenge=' + (await p.$$('.cc5-decision-challenge')).length);
    check('no option carries data-correct', (await p.$$('[data-correct]')).length === 0);
    check('every option carries its manifest index',
        (await p.$$('[data-oidx]')).length === 4);
    const before = await snapshot(p);
    check('nothing shows feedback before an answer',
        before.every(function(o) { return !o.feedbackVisible; }));
    check('no feedback TEXT is present in the DOM before an answer',
        before.every(function(o) { return !o.feedbackText; }),
        JSON.stringify(before.map(function(o) { return o.feedbackText; })));

    console.log('\n2. A wrong answer with no reason of its own');
    await p.click(WRONG_BARE);
    await settle(p);
    let s = await snapshot(p);
    check('no JavaScript error was thrown', pageErrors.length === 0, pageErrors.join('\n'));
    check('the chosen option is marked incorrect',
        (s.find(function(o) { return o.oidx === '0'; }) || {}).selected === 'incorrect');
    check('the server was asked about the MANIFEST index, not the display index',
        JSON.stringify(await p.evaluate(function() { return window.__graded; })) === '[0]');
    check('the screen reader is told the result',
        /Incorrect/.test((s.find(function(o) { return o.oidx === '0'; }) || {}).srText));
    check('the incorrect sound fired and the correct one did not',
        JSON.stringify(await p.evaluate(function() { return window.__sounds; })) === '{"correct":0,"incorrect":1}');
    check('the correct answer is NOT revealed - this card keeps Try Again',
        !s.some(function(o) { return o.oidx === '1' && o.feedbackVisible; }));
    check('the options are locked',
        s.every(function(o) { return o.ariaDisabled === 'true'; }));

    console.log('\n3. Try Again, then a second answer that must still reach the server');
    await p.click('.cc5-dp-try-again-btn');
    s = await snapshot(p);
    check('Try Again clears the selection',
        s.every(function(o) { return !o.selected; }),
        JSON.stringify(s.map(function(o) { return o.selected; })));
    check('Try Again unlocks the options',
        s.every(function(o) { return o.ariaDisabled !== 'true'; }));
    check('Try Again hides any feedback it had shown',
        s.every(function(o) { return !o.feedbackVisible; }));

    // The point of this file. The first attempt has already been through a round trip; if
    // the reset and the grading path disagree the card looks live and does nothing.
    await p.click(WRONG_WITH_REASON);
    await settle(p);
    s = await snapshot(p);
    check('a SECOND answer is sent to the server after Try Again',
        JSON.stringify(await p.evaluate(function() { return window.__graded; })) === '[0,2]',
        JSON.stringify(await p.evaluate(function() { return window.__graded; })));
    check('the second answer is scored',
        (s.find(function(o) { return o.oidx === '2'; }) || {}).selected === 'incorrect');
    check('its own reason is shown, from the server response',
        /Moving a barrier changes a control/.test(
            (s.find(function(o) { return o.oidx === '2'; }) || {}).feedbackText || ''),
        (s.find(function(o) { return o.oidx === '2'; }) || {}).feedbackText);
    check('and it is actually visible, not just present',
        (s.find(function(o) { return o.oidx === '2'; }) || {}).feedbackVisible === true);

    console.log('\n4. The right answer');
    await p.goto('file://' + tmp);
    await p.click(RIGHT);
    await settle(p);
    s = await snapshot(p);
    const right = s.find(function(o) { return o.oidx === '1'; });
    check('the correct option is marked correct', right && right.selected === 'correct');
    check('its feedback comes back from the server and is shown',
        right && right.feedbackVisible === true
        && /The worker duty applies to your own movement/.test(right.feedbackText || ''),
        right && right.feedbackText);
    check('the correct sound fired', (await p.evaluate(function() { return window.__sounds.correct; })) === 1);
    check('no Try Again is offered for a right answer',
        (await p.evaluate(function() {
            var b = document.querySelector('.cc5-dp-try-again');
            return b ? getComputedStyle(b).display : 'none';
        })) === 'none');

    console.log('\n5. A failed grading call must not close the question');
    await p.goto('file://' + tmp);
    await p.evaluate(function() {
        window.self2.ccGradeAnswer = function($opt, done) {
            Promise.resolve().then(function() { done(new Error('network down')); });
        };
    });
    await p.click(WRONG_BARE);
    await p.waitForTimeout(300);
    const failed = await p.evaluate(function() {
        var set = document.querySelector('.cc5-dp-options');
        return {
            unlocked: window.__unlocked,
            answered: set.getAttribute('data-answered'),
            selected: set.querySelectorAll('.cc5-dp-option[data-selected]').length
        };
    });
    check('the question is unlocked rather than closed',
        failed.unlocked === 1 && failed.answered === 'false', JSON.stringify(failed));
    check('nothing was scored', failed.selected === 0);
    await p.evaluate(function() { window.self2.ccGradeAnswer = window.__realGrade; });
    await p.click(RIGHT);
    await settle(p);
    s = await snapshot(p);
    check('the learner can answer again after the failure, and it scores',
        (s.find(function(o) { return o.oidx === '1'; }) || {}).selected === 'correct');

    check('no JavaScript error was thrown across the whole run',
        pageErrors.length === 0, pageErrors.join('\n'));

    await browser.close();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks
        : 'PASSED all ' + checks + ' runtime checks'));
    process.exit(failures ? 1 : 0);
})();
