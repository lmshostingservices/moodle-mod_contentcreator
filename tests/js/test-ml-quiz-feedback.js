/**
 * v15.6.6 — an additional language must narrate its quiz feedback, in its own language.
 *
 * Until this release `pregenQuizFeedback` was called only from the primary path. A German
 * or Japanese pack got section narration, card narration, and **total silence on every quiz
 * answer** — and nothing said so. The player logs "no pre-generated feedback clip - silent
 * by design", which was true of the code and never true of the author's intent.
 *
 * Three things have to hold, and each of them is a bug that would ship silently:
 *
 *   1. **The clip key carries the language.** A translated section keeps the SAME id as the
 *      primary one, so without the prefix the German clip overwrites the English one in the
 *      file store and both languages play German. This is FIX-CC-ML-SECTIONID-COLLISION
 *      (v13.5) again, one level down.
 *   2. **The translation payload strips option audio.** v15.4.2 widened the strip to the
 *      cards when narration moved onto them and stopped there. Options carry
 *      `feedbackAudioUrl` too, and nobody noticed because nothing had ever generated it for
 *      an additional language. This release makes the omission live: a translated option
 *      would arrive carrying the English URL *and* the `feedbackVerdictSpoken` marker, the
 *      builder would skip it as already current, and a German learner would hear English.
 *   3. **The verdict is spoken in the pack's language**, which means the narration language
 *      must be registered before the clip text is built.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const builder = fs.readFileSync(path.join(root, 'amd', 'src', 'builder.js'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'amd', 'src', 'generator.js'), 'utf8');

let failures = 0;
let checks = 0;
function ok(condition, label, detail) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
    }
}

console.log('multi-language quiz feedback');
console.log('');

// --- 1. It is generated for additional languages at all ---------------------------
console.log('  it runs for every language');

ok(/const pregenQuizFeedback = async\(section, langCode, keyPrefix\)/.test(builder),
    'pregenQuizFeedback still takes only a section, so it can only serve the primary pack');

const mlCalls = (builder.match(/pregenQuizFeedback\(section, langCode,\s*\n?\s*langCode \+ '_'\)/g) || []).length;
ok(mlCalls === 3, 'expected 3 additional-language call sites, mirroring the 3 in the '
    + 'primary path (per-card success, partial cards, whole-section fallback), found ' + mlCalls);

const primaryCalls = (builder.match(/pregenQuizFeedback\(section\)/g) || []).length;
ok(primaryCalls === 3, 'the primary path no longer has its 3 call sites, found ' + primaryCalls);

// --- 2. The clip key carries the language -----------------------------------------
console.log('  the clip key cannot collide');

// Both the generate and the persist call must use the SAME key, or the clip is made under
// one name and looked for under another.
const keyUses = (builder.match(/_qKey \+ oi/g) || []).length;
ok(keyUses === 2, 'expected the composed key in both the TTS and the persist call, found '
    + keyUses);
ok(/var _qKey = \(keyPrefix \|\| ''\) \+ String\(section\.id\) \+ '_dpfb';/.test(builder),
    'the clip key is not composed from the prefix, so additional languages collide with '
    + 'the primary pack in the file store');
ok(!/_qFd\.append\('sectionid', String\(section\.id\) \+ '_dpfb'/.test(builder),
    'the TTS call still hard-codes an unprefixed key');

// The prefix passed must match the convention the card path already uses, so the two
// cannot drift apart.
ok(/_cfd\.append\('sectionid', langCode \+ '_'\s*\n?\s*\+ String\(section\.id\) \+ '_c'/.test(builder),
    'the card path no longer uses langCode + "_" + id, so the quiz key is following a '
    + 'convention that no longer exists');

// --- 3. The translation must not carry English audio forward ----------------------
console.log('  translated options do not inherit English clips');

const stripStart = generator.indexOf('(slim.cards || []).forEach(');
ok(stripStart !== -1, 'the translation payload strip was not found in generator.js');
const stripBody = generator.slice(stripStart, stripStart + 2000);

ok(/delete o\.feedbackAudioUrl;/.test(stripBody),
    'a translated option keeps feedbackAudioUrl, so the additional language inherits the '
    + 'ENGLISH clip - the v15.4.2 card bug, one level down');
ok(/delete o\.feedbackVerdictSpoken;/.test(stripBody),
    'a translated option keeps feedbackVerdictSpoken, so the builder skips it as already '
    + 'current and the English clip is never replaced');
ok(/Array\.isArray\(c\.questions\)/.test(stripBody),
    'the strip does not handle the multi-question card shape, so only the legacy '
    + 'single-question shape is cleaned');

// The card-level strip it sits beside must still be there - a regression in either half
// produces the same symptom.
['voiceoverUrl', 'voiceoverStatus', 'voiceoverTextHash'].forEach(function (f) {
    ok(new RegExp('delete c\\.' + f + ';').test(stripBody),
        'the card-level strip lost ' + f);
});

// --- 4. It stops when the build stops ---------------------------------------------
console.log('  it honours the stop conditions');

const fnStart = builder.indexOf('const pregenQuizFeedback = async(section, langCode, keyPrefix)');
const fnBody = builder.slice(fnStart, builder.indexOf('/**', fnStart + 100));

ok(/if \(_voSkipRequested\) return;/.test(fnBody),
    'Skip voiceover no longer stops quiz feedback');
ok(/_voSkipRequested \|\| _voRateLimited \|\| _voFatal/.test(fnBody),
    'the per-option loop does not check all three stop conditions, so twelve options would '
    + 'each make their own refused request');
ok(/_qErr && _qErr\.ccFatal/.test(fnBody),
    'a fatal transport error inside the option loop is treated as a per-option failure, '
    + 'which is the refusal burst v15.6.2 exists to stop');
ok(/if \(!_voFatal\) \{ _voFatal = _qErr; \}/.test(fnBody),
    'a fatal transport error here does not stop the rest of the build');

// --- 5. The verdict is spoken in the pack's language ------------------------------
console.log('  the verdict is in the right language');

// useNarrationLanguage(langCode) must run before the clip text is built, or
// CcState.verdictLabel resolves against whatever language was registered last - which on
// the second additional language is the first one.
const mlFn = builder.indexOf('var fn = async function(section, attempt) {');
ok(mlFn !== -1, 'the additional-language section function was not found');
const mlBody = builder.slice(mlFn, mlFn + 4000);
const setLang = mlBody.indexOf('useNarrationLanguage(langCode);');
const firstQuiz = mlBody.indexOf('pregenQuizFeedback(section, langCode');
ok(setLang !== -1, 'the additional-language path does not register its narration language');
ok(firstQuiz !== -1 && setLang < firstQuiz,
    'quiz feedback is narrated before the language is registered, so the verdict word '
    + 'comes from the previous language');
ok(/CcState\.verdictLabel\(_dpOpts\[oi\]\.correct\)/.test(builder),
    'the narrated verdict is not resolved per option');

// --- 6. The strip, actually run against a realistic section -----------------------
console.log('  the strip works, not just exists');

// Static checks above prove the lines are there. This proves they do the job: the strip is
// lifted out of generator.js and run over a section shaped the way a decision-point is
// really stored, carrying English clips on every option of every question.
const liftStart = generator.indexOf('(slim.cards || []).forEach(');
let depth = 0;
let liftEnd = generator.indexOf('{', liftStart);
for (; liftEnd < generator.length; liftEnd++) {
    if (generator[liftEnd] === '{') { depth++; } else if (generator[liftEnd] === '}') {
        depth--;
        if (depth === 0) { liftEnd += 3; break; }
    }
}
const stripSrc = generator.slice(liftStart, liftEnd);
// eslint-disable-next-line no-new-func
const runStrip = new Function('slim', stripSrc + '; return slim;');

const englishOption = (text) => ({
    text: text,
    feedback: 'Correct. Construction guidance requires the service to be located first.',
    feedbackAudioUrl: 'https://site/pluginfile.php/1/mod_contentcreator/voiceover_s1_dpfb0.ogg',
    feedbackVerdictSpoken: true
});
const section = {
    id: 'subtopic_0_1',
    cards: [
        { cardType: 'concept-explainer', voiceoverUrl: 'https://site/en.ogg',
            voiceoverStatus: 'complete', voiceoverTextHash: 'abc',
            voiceoverWordCount: 120, voiceoverSchemaVersion: '3' },
        { cardType: 'decision-point', questions: [
            { question: 'q1', options: [englishOption('a'), englishOption('b')] },
            { question: 'q2', options: [englishOption('c'), englishOption('d')] }
        ] },
        // The legacy shape: the card IS the question.
        { cardType: 'decision-point', question: 'legacy',
            options: [englishOption('e'), englishOption('f')] }
    ]
};

const stripped = runStrip(JSON.parse(JSON.stringify(section)));
const allOptions = [];
stripped.cards.forEach(function (c) {
    const qs = (Array.isArray(c.questions) && c.questions.length) ? c.questions : [c];
    qs.forEach(function (q) { ((q && q.options) || []).forEach(function (o) { allOptions.push(o); }); });
});

ok(allOptions.length === 6, 'the fixture did not yield 6 options: ' + allOptions.length);
ok(allOptions.every(function (o) { return o.feedbackAudioUrl === undefined; }),
    'an English clip URL survived the strip',
    JSON.stringify(allOptions.filter(function (o) { return o.feedbackAudioUrl; })));
ok(allOptions.every(function (o) { return o.feedbackVerdictSpoken === undefined; }),
    'the "already current" marker survived, so the builder would skip the option');

// ...and nothing that has to be translated was thrown away with it.
ok(allOptions.every(function (o) { return o.text && o.feedback; }),
    'the strip removed text or feedback, which are the whole point of translating');
ok(stripped.cards[0].voiceoverUrl === undefined
    && stripped.cards[0].voiceoverSchemaVersion === undefined,
    'the card-level strip stopped working');
ok(stripped.cards[1].questions.length === 2 && stripped.cards[2].question === 'legacy',
    'the strip damaged the card structure');

// --- 7. The author is told about packs built before this release ------------------
console.log('  existing translated packs are reported');

// Every multi-language module ever built has silent quiz feedback. Regenerating it costs
// credits, so the author is told on the update panel rather than finding it on the bill.
const detect = builder.slice(builder.indexOf('const detectStaleBuild = (m) =>'));
const detectBody = detect.slice(0, detect.indexOf('\n    };'));
ok(/m\.multiLanguage/.test(detectBody),
    'detectStaleBuild never looks at additional languages, so an author with a translated '
    + 'pack is never told its quiz feedback is silent');
ok(/o\.feedback && !o\.feedbackAudioUrl/.test(detectBody),
    'the count does not require the option to HAVE feedback, so options the pack never '
    + 'explained - silent by design in every language - would be counted as work to do');
ok(/msgreasonmlsilent/.test(detectBody),
    'nothing is reported to the author');

// forEachSection walks m.topics only. The separate walk is deliberate: widening it would
// change what staleSections counts and what "Apply updates" clears, and clearing an
// additional language's SECTION audio is a far larger charge than this line is worth.
const forEach = builder.slice(builder.indexOf('const forEachSection = (m, fn) =>'));
ok(!/multiLanguage/.test(forEach.slice(0, forEach.indexOf('\n    };'))),
    'forEachSection was widened to the additional languages, which silently changes what '
    + '"Apply updates" clears');

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks');
process.exit(0);
