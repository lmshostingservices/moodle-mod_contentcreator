/**
 * v15.6.4 — the feedback must open with "Correct" or "Incorrect", on screen and aloud.
 *
 * The activity used to say it. The word came from the VENDOR, inside the feedback string -
 * "Correct! Construction guidance requires..." - so when the generation prompts were
 * tightened and that lead-in stopped coming back, the verdict disappeared from every route
 * at once. Nothing in the plugin had ever owned it, so nothing noticed and nothing failed.
 *
 * It is the plugin's now, and this suite is what stops it going missing again. Two
 * properties matter and neither is visible by reading one file:
 *
 *   1. The SAME string is displayed and spoken. builder.js synthesises the feedback clip
 *      and player5.js renders the line; if they diverge, a learner is told one thing on
 *      screen and a different thing in their headphones - a fault nobody reports, because
 *      each half looks right on its own.
 *   2. The verdict is never doubled. Older packs and any vendor still sending the lead-in
 *      already open with the word, and "Correct. Correct! ..." reads and sounds worse than
 *      never having added it.
 *
 * Runs the shipped CcState.withVerdict rather than describing it.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const STATE = path.join(root, 'amd', 'src', 'cc-state.js');
const PLAYER = path.join(root, 'amd', 'src', 'player5.js');
const BUILDER = path.join(root, 'amd', 'src', 'builder.js');
const TRANSLATIONS = path.join(root, 'amd', 'src', 'translations.js');

const state = fs.readFileSync(STATE, 'utf8');
const player = fs.readFileSync(PLAYER, 'utf8');
const builder = fs.readFileSync(BUILDER, 'utf8');
const translations = fs.readFileSync(TRANSLATIONS, 'utf8');

let failures = 0;
let checks = 0;
function ok(condition, label, detail) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
    }
}

/** Lift withVerdict out of the shipped cc-state.js. */
function loadWithVerdict() {
    const start = state.indexOf('function withVerdict(');
    if (start === -1) { throw new Error('withVerdict() not found in cc-state.js'); }
    let depth = 0;
    let end = state.indexOf('{', start);
    for (; end < state.length; end++) {
        if (state[end] === '{') { depth++; } else if (state[end] === '}') {
            depth--;
            if (depth === 0) { end++; break; }
        }
    }
    // eslint-disable-next-line no-new-func
    return new Function(state.slice(start, end) + '; return withVerdict;')();
}

const withVerdict = loadWithVerdict();

console.log('verdict in feedback');
console.log('');

// --- 1. The verdict is added ------------------------------------------------------
console.log('  adding it');
ok(withVerdict('Correct', 'Construction guidance requires underground essential-service '
    + 'information to be obtained before excavation.')
    === 'Correct. Construction guidance requires underground essential-service '
    + 'information to be obtained before excavation.',
    'a correct answer does not get its verdict');
ok(withVerdict('Incorrect', 'Scraping with the excavator can strike a live service.')
    === 'Incorrect. Scraping with the excavator can strike a live service.',
    'a wrong answer does not get its verdict');
ok(withVerdict('Correct', '   leading space is trimmed  ') === 'Correct. leading space is trimmed',
    'the feedback is not trimmed before the verdict is added');

// --- 2. ...and never doubled ------------------------------------------------------
console.log('  not doubling it');
// The exact shapes the vendor has used over time. Every one of these already tells the
// learner the verdict, so the plugin must not tell them again.
[
    'Correct! Clause 4 applies.',
    'Correct. Clause 4 applies.',
    'Correct: clause 4 applies.',
    'Correct, clause 4 applies.',
    'Correct - clause 4 applies.',
    'correct! lower case is still the verdict',
    'CORRECT! upper case is too'
].forEach(function (text) {
    ok(withVerdict('Correct', text) === text.trim(),
        'the verdict was doubled on: ' + text, withVerdict('Correct', text));
});
[
    'Incorrect! A verbal notice is not the register.',
    'Incorrect. A verbal notice is not the register.',
    'incorrect - the register is the record'
].forEach(function (text) {
    ok(withVerdict('Incorrect', text) === text.trim(),
        'the verdict was doubled on: ' + text, withVerdict('Incorrect', text));
});

// The trap: "Incorrect" begins with the letters of no other word, but a naive
// startsWith('Correct') test against "Incorrect! ..." fails the other way - and a pack
// whose feedback already says "Incorrect" must not have "Correct." bolted in front of it.
ok(withVerdict('Correct', 'Incorrect! this pack already says so')
    === 'Incorrect! this pack already says so',
    'a "Correct" label was prefixed onto text that already reads "Incorrect"');
ok(withVerdict('Incorrect', 'Correct! this pack already says so')
    === 'Correct! this pack already says so',
    'an "Incorrect" label was prefixed onto text that already reads "Correct"');

// A word that merely STARTS with the verdict is not the verdict.
ok(withVerdict('Correct', 'Correctly identifying the service is the first step.')
    === 'Correct. Correctly identifying the service is the first step.',
    '"Correctly" was mistaken for the verdict, so the line lost its lead-in');

// --- 3. Degenerate input ----------------------------------------------------------
console.log('  degenerate input');
ok(withVerdict('Correct', '') === '', 'empty feedback gained a verdict with nothing after it');
ok(withVerdict('Correct', null) === '', 'null feedback threw or produced text');
ok(withVerdict('Correct', undefined) === '', 'undefined feedback threw or produced text');
ok(withVerdict('', 'some feedback') === 'some feedback',
    'a missing label produced a stray separator');
ok(withVerdict(null, 'some feedback') === 'some feedback', 'a null label threw');

// --- 4. Every language can say it -------------------------------------------------
console.log('  translation');
// Both label tables carry correct_pos / correct_neg for every language. If they did not,
// a non-English pack would narrate an English word in the middle of its own language, or
// - worse, given _lbl's behaviour - read the key name aloud.
const uiPos = (translations.match(/correct_pos:/g) || []).length;
const uiNeg = (translations.match(/correct_neg:/g) || []).length;
ok(uiPos === uiNeg, 'correct_pos and correct_neg are not paired: '
    + uiPos + ' vs ' + uiNeg);
ok(uiPos >= 100, 'expected the pair in both label tables for every language, found '
    + uiPos + ' - one of the tables is short');

// --- 5. The two callers use the shared helper -------------------------------------
console.log('  one implementation, two callers');
ok(/withVerdict: withVerdict,/.test(state), 'cc-state does not export withVerdict');
ok(/verdictLabel: function/.test(state), 'cc-state does not export verdictLabel');

const playerCalls = (player.match(/CcState\.withVerdict\(/g) || []).length;
ok(playerCalls === 3, 'expected 3 withVerdict calls in player5 (chosen option in each of '
    + 'the two handlers, plus the revealed correct answer), found ' + playerCalls);
ok(/CcState\.withVerdict\(\s*\n?\s*CcState\.verdictLabel\(/.test(builder)
    || /CcState\.withVerdict\(/.test(builder),
    'builder.js does not narrate through withVerdict, so the clip and the screen can drift');
ok(/CcState\.verdictLabel\(_dpOpts\[oi\]\.correct\)/.test(builder),
    'the narrated verdict is not taken from the option\'s own correctness');

// The player must resolve the words through getLabel, not as literals. They were literals
// until this release, which was tolerable only while they were screen-reader-only text.
ok(!/\?\s*'Correct'\s*:\s*'Incorrect'/.test(player),
    'player5 still hard-codes the English verdict');
ok((player.match(/getLabel\(isCorrect \? 'correct_pos' : 'correct_neg'\)/g) || []).length >= 4,
    'the verdict words are not resolved through getLabel everywhere');

// --- 6. The builder must not re-bill a clip that already says it -------------------
console.log('  clip regeneration');
ok(/opt\.feedbackAudioUrl && opt\.feedbackVerdictSpoken/.test(builder),
    'the builder regenerates every feedback clip, or none - neither is right');
ok(/opt\.feedbackVerdictSpoken = true;/.test(builder),
    'a regenerated clip is not marked, so it will be re-billed on every future build');
ok(/msgreasonnoverdictclip/.test(builder),
    'an author is not told that their existing clips will be regenerated');

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks');
process.exit(0);
