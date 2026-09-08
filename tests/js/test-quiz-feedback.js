/* eslint-env node */
/**
 * Wrong-answer feedback: the checks, their routing, and the prompts behind them.
 *
 * Run:  node tests/js/test-quiz-feedback.js       (exit 0 = pass, 1 = fail)
 *
 * If tests/js/run-all.js enumerates its suites by name rather than by glob, add this file
 * to that list - a suite nothing runs is worth nothing.
 *
 * WHY THIS SUITE EXISTS
 *
 * v15.4.20 fixed a learner-visible defect: a wrong answer showed no feedback, because the
 * vendor's schema v2 carries plain-string options and one feedback per question, so
 * normalizeCardSchema() leaves every distractor with feedback:''. Three things had to hold
 * for the fix to work, and none of them were guarded:
 *
 *   1. The checks must fire on a bare card and stay silent on a written one - INCLUDING in
 *      the five shipped languages written without spaces between words (ja, zh, cmn, yue,
 *      th), where a whitespace word count reads a complete explanation as one word.
 *   2. Every issue they raise must match CC_REPAIRABLE or CC_REVIEW_ONLY. The house rule
 *      from v15.4.15-18: "a check nothing acts on is not a check" - four detectors were
 *      written that release whose findings were silently discarded because they matched
 *      neither list.
 *   3. The BUILD must contain the fix. amd/build/*.min.js is what Moodle serves, and the
 *      first v15.4.20 ZIP shipped a player5 bundle compiled before the last source edit.
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
const BUILD = path.join(ROOT, 'amd', 'build');

let failures = 0;
let checks = 0;

/**
 * Assert one condition.
 *
 * @param {String} label What is being asserted.
 * @param {Boolean} ok The result.
 * @param {String} [detail] Printed when the assertion fails.
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

/**
 * Load an AMD module from amd/src with stubbed dependencies.
 *
 * @param {String} file Module file name.
 * @param {Array} deps Values passed to the module factory.
 * @return {Object} The module's exports.
 */
function loadAmd(file, deps) {
    let exported;
    const sandbox = {
        define: function(d, factory) { exported = factory.apply(null, deps); },
        window: {}, document: {}, console: console, setTimeout: setTimeout,
        fetch: function() { return Promise.resolve(); }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), sandbox, {filename: file});
    return exported;
}

const CcStateStub = {
    createLogger: function() {
        return {log: function() {}, warn: function() {}, error: function() {}, debug: function() {}};
    }
};
const Prompts = loadAmd('prompts.js', [{}, CcStateStub, {}]);
const G = loadAmd('generator.js', [Prompts, CcStateStub, {}, {}]);

const repairable = function(issue) {
    return G.CC_REPAIRABLE.some(function(re) { return re.test(issue); });
};
const reviewOnly = function(issue) {
    return G.CC_REVIEW_ONLY.some(function(re) { return re.test(issue); });
};

/**
 * A decision-point card carrying one question.
 *
 * @param {Array} options The options array.
 * @return {Object} The card.
 */
function dpCard(options) {
    const card = {cardType: 'decision-point', schemaVersion: 2,
        questions: [{question: 'Which action meets the reporting rule?', options: options}]};
    card.options = card.questions[0].options;   // What normalizeCardSchema does.
    return card;
}

const RIGHT = {text: 'Record the incident in the register within two working days of it happening',
    feedback: 'Right - clause 4 gives you two working days, and the register is the record an auditor asks for first.',
    correct: true};
const BARE_1 = {text: 'Tell the supervisor verbally and leave the register until the monthly review',
    feedback: '', correct: false};
const BARE_2 = {text: 'Wait until the client complains before entering anything in the register',
    feedback: '', correct: false};
const WRITTEN = {text: 'Email the team about it and treat the email thread as the record',
    feedback: 'An email is not the register - clause 4 names the register specifically, so an audit finds nothing.',
    correct: false};

console.log('\n1. optionFeedbackIssues - tiering by evidence');

const barePack = [dpCard([RIGHT, BARE_1, BARE_2])];
const bareIssues = G.optionFeedbackIssues(barePack);
check('a pack with no distractor feedback anywhere raises exactly one issue',
    bareIssues.length === 1, JSON.stringify(bareIssues));
check('...and it is REVIEW-ONLY, so it spends no credits on a repair that cannot succeed',
    bareIssues.every(function(i) { return reviewOnly(i) && !repairable(i); }), bareIssues[0]);

const mixedPack = [dpCard([RIGHT, BARE_1, BARE_2]), dpCard([RIGHT, WRITTEN])];
const mixedIssues = G.optionFeedbackIssues(mixedPack);
check('when another card proves the shape is accepted, the bare card becomes REPAIRABLE',
    mixedIssues.length === 1 && repairable(mixedIssues[0]) && !reviewOnly(mixedIssues[0]),
    JSON.stringify(mixedIssues));

check('a card whose distractors all carry feedback raises nothing',
    G.optionFeedbackIssues([dpCard([RIGHT, WRITTEN])]).length === 0);

const threeQ = {cardType: 'decision-point', schemaVersion: 2, questions: [
    {question: 'q1', options: [RIGHT, BARE_1]},
    {question: 'q2', options: [RIGHT, BARE_1]},
    {question: 'q3', options: [RIGHT, BARE_1]}
]};
threeQ.options = threeQ.questions[0].options;
const threeIssues = G.optionFeedbackIssues([threeQ, dpCard([RIGHT, WRITTEN])]);
check('three bare questions produce ONE aggregated issue, not three near-identical ones',
    threeIssues.length === 1 && /question 1, 2, 3/.test(threeIssues[0]), JSON.stringify(threeIssues));

check('malformed input does not throw (null card, null option, no questions, wrong type)',
    (function() {
        try {
            G.optionFeedbackIssues([null, {cardType: 'decision-point'},
                dpCard([null, {text: 'x'}]), {cardType: 'mistakes'}]);
            return true;
        } catch (e) { return 'threw: ' + e.message; }
    })() === true);

console.log('\n2. Routing - the v15.4.15-18 rule: a check nothing acts on is not a check');

const everyIssue = bareIssues.concat(mixedIssues).concat(threeIssues);
check('every issue this check can raise matches CC_REPAIRABLE or CC_REVIEW_ONLY',
    everyIssue.every(function(i) { return repairable(i) || reviewOnly(i); }),
    everyIssue.filter(function(i) { return !repairable(i) && !reviewOnly(i); }).join('\n'));
check('no issue matches BOTH lists (routing must be unambiguous)',
    everyIssue.every(function(i) { return !(repairable(i) && reviewOnly(i)); }));

console.log('\n3. ccWordCount - script awareness, calibrated against real paired text');

check('English is byte-for-byte what the old whitespace split returned',
    G.ccWordCount('Record the incident in the register within two working days') === 10
    && G.ccWordCount('  spaced   out  text ') === 3
    && G.ccWordCount('') === 0 && G.ccWordCount(null) === 0);

// Every spaced language must be untouched. Korean above all: v15.4.21 classed Hangul with
// Han on the assumption that Korean is unspaced. It is not - measured at 0.78 whitespace
// words per English word in this plugin's own table - and dividing its syllables inflated a
// 12-word sentence to 19, which would have let genuinely short Korean content clear every
// floor in this file.
[
    ['Korean', '사고는 발생일로부터 이틀 이내에 등록부에 기록해야 하며 감사에서 확인할 수 있어야 합니다'],
    ['Vietnamese', 'Ghi lại sự cố vào sổ đăng ký trong vòng hai ngày làm việc'],
    ['Arabic', 'سجل الحادث في السجل خلال يومي عمل من وقوعه'],
    ['Hindi', 'घटना को दो कार्य दिवसों के भीतर रजिस्टर में दर्ज करें'],
    ['Greek', 'Καταγράψτε το περιστατικό στο μητρώο εντός δύο εργάσιμων ημερών']
].forEach(function(pair) {
    const whitespace = pair[1].trim().split(/\s+/).filter(Boolean).length;
    check(pair[0] + ' is counted exactly as before (it is a spaced language)',
        G.ccWordCount(pair[1]) === whitespace,
        'whitespace=' + whitespace + ' ccWordCount=' + G.ccWordCount(pair[1]));
});

check('Japanese measures in word units rather than one whitespace token',
    G.ccWordCount('この対応は記録義務を満たしており、監査で確認できる証拠が残ります') >= 8);
check('Chinese likewise, and NOT with the Japanese divisor - they differ by 58%',
    G.ccWordCount('在事件发生后的两个工作日内将其记录在登记簿中以便审计核查') >= 12);
check('Thai likewise',
    G.ccWordCount('บันทึกเหตุการณ์ลงในทะเบียนภายในสองวันทำการนับจากวันที่เกิดเหตุ') >= 8);
check('a mixed sentence counts both halves',
    G.ccWordCount('AVETMISS の報告は 30 日以内に提出する') > G.ccWordCount('AVETMISS 30'));

// The divisors are not opinions. translations.js holds 669 English UI strings and their
// translations in all 53 languages, so characters-per-English-word can be MEASURED. This
// re-measures it on every run and fails if a constant has drifted outside the middle half
// of the distribution it was drawn from - which is also what happens if someone edits the
// constants to taste, or if the table is retranslated.
console.log('\n3b. ...and the divisors still match the table they were measured from');

const tsrc = fs.readFileSync(path.join(SRC, 'translations.js'), 'utf8').split('NARRATION_LABELS')[0];
const table = {};
let locale = null;
tsrc.split('\n').forEach(function(line) {
    const head = line.match(/^ {8}'([a-z-]+)': \{/);
    if (head) { locale = head[1]; table[locale] = {}; return; }
    // Both quote styles. A single-quote-only parser silently skips every string that
    // contains an apostrophe ("Edit each card's content...") - it read 669 of the 676 keys,
    // and a calibration that quietly measures a subset is the same class of mistake as a
    // divisor that was never measured at all. (Re-checked: the seven it missed are short
    // strings the 4-word filter excludes anyway, so the ratios did not move - but the
    // parser is fixed rather than the finding waved off.)
    const kv = line.match(/^ {12}(\w+):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),?\s*$/);
    if (kv && locale) { table[locale][kv[1]] = kv[2] !== undefined ? kv[2] : kv[3]; }
});

/**
 * Characters of a script per English word, over every translated pair.
 *
 * @param {String} lang Locale key in the table.
 * @param {RegExp} rx Global regex matching the script's characters.
 * @return {Object} {n, p25, median, p75}
 */
function charsPerEnglishWord(lang, rx) {
    const out = [];
    Object.keys(table.en || {}).forEach(function(k) {
        const target = (table[lang] || {})[k];
        if (!target) { return; }
        const words = table.en[k].trim().split(/\s+/).filter(Boolean).length;
        const chars = (target.match(rx) || []).length;
        if (words >= 4 && chars >= 6) { out.push(chars / words); }
    });
    out.sort(function(a, b) { return a - b; });
    return {n: out.length, p25: out[Math.floor(out.length * 0.25)],
        median: out[Math.floor(out.length / 2)], p75: out[Math.floor(out.length * 0.75)]};
}

const HAN_RX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f]/g;
const THAI_RX = /[\u0e00-\u0e7f]/g;
const HANGUL_RX = /[\uac00-\ud7af]/g;

check('the table still has enough paired strings to calibrate against',
    (table.en && Object.keys(table.en).length >= 676) && Object.keys(table).length === 53,
    'en keys=' + Object.keys(table.en || {}).length + ' locales=' + Object.keys(table).length);

// The divisors are the p25 of each distribution, deliberately: every consumer of the count
// is a MINIMUM, and a floor enforced on an estimate with a +/-25% spread fails good content.
// The assertion is therefore "equals p25, and never above the median" - it fails both if a
// constant drifts and if someone re-centres them on the median, which is the mistake this
// release corrected.
// Read the constants OUT OF generator.js rather than restating them here. A test that
// compares its own literal against the table proves only that the literal is right - it
// passes happily while the shipped code uses something else, which is what happened on the
// first draft of this check.
const genSource = fs.readFileSync(path.join(SRC, 'generator.js'), 'utf8');

/**
 * The value of a CC_CHARS_PER_WORD_* constant as generator.js actually declares it.
 *
 * @param {String} name Constant suffix, e.g. 'JA'.
 * @return {Number} The declared value, or NaN if the declaration is gone.
 */
function declaredDivisor(name) {
    const m = genSource.match(new RegExp('CC_CHARS_PER_WORD_' + name + '\\s*=\\s*([0-9.]+)\\s*;'));
    return m ? parseFloat(m[1]) : NaN;
}

[['ja', HAN_RX, 'JA'], ['zh', HAN_RX, 'ZH'], ['th', THAI_RX, 'TH']].forEach(function(spec) {
    const m = charsPerEnglishWord(spec[0], spec[1]);
    const declared = declaredDivisor(spec[2]);
    check(spec[0] + ': generator.js uses ' + declared + ', which is the measured p25 ('
        + m.p25.toFixed(2) + ') and at or below the median (' + m.median.toFixed(2)
        + '), n=' + m.n,
        Math.abs(declared - m.p25) < 0.01 && declared <= m.median,
        'declared=' + declared + ' p25=' + m.p25.toFixed(2) + ' median=' + m.median.toFixed(2));
});

const koWords = [];
Object.keys(table.en || {}).forEach(function(k) {
    const target = (table.ko || {})[k];
    if (!target) { return; }
    const w = table.en[k].trim().split(/\s+/).filter(Boolean).length;
    const kw = target.trim().split(/\s+/).filter(Boolean).length;
    if (w >= 4 && kw >= 2) { koWords.push(kw / w); }
});
koWords.sort(function(a, b) { return a - b; });
check('Korean is confirmed SPACED by the table (median words per English word near 1), '
    + 'so Hangul must never be divided like Han',
    koWords.length > 40 && koWords[Math.floor(koWords.length / 2)] < 1.3
    && (charsPerEnglishWord('ko', HANGUL_RX).median > 1.5),
    'median words/word=' + koWords[Math.floor(koWords.length / 2)].toFixed(2));

console.log('\n4. A complete CJK pack is not reported as broken');

const jp = function(text, feedback, correct) {
    return {text: text, feedback: feedback, correct: !!correct};
};
const jpCard = dpCard([
    jp('二営業日以内に登録簿へ記録し、監査で確認できる形で残す',
       '正解です。第四条は二営業日を定めており、登録簿が監査で最初に確認される記録になります。', true),
    jp('上司に口頭で伝え、登録簿への記入は月次確認まで待つ',
       '口頭の報告は記録として残らないため、第四条の要件を満たしません。監査では未対応と判断されます。'),
    jp('顧客から苦情が出るまで登録簿には何も記入しない',
       '苦情を待つ運用は期限そのものを無視しており、二営業日の要件を最初から満たせません。')
]);
check('no missing-feedback issue on a fully written Japanese card',
    G.optionFeedbackIssues([jpCard]).length === 0,
    JSON.stringify(G.optionFeedbackIssues([jpCard])));
check('no "option stub" parity issue on it either (the check that spent the repair attempt)',
    G.optionParityIssues([jpCard]).length === 0,
    JSON.stringify(G.optionParityIssues([jpCard])));

console.log('\n5. distractorQualityIssues - every question, not only the first');

const giveaway = {cardType: 'decision-point', schemaVersion: 2, questions: [
    {question: 'clean question', options: [RIGHT, WRITTEN]},
    {question: 'clean question two', options: [RIGHT, WRITTEN]},
    {question: 'the one with giveaways', options: [
        RIGHT,
        {text: 'Ignoring non-verbal cues results in misinterpretation of emotions', feedback: 'x', correct: false},
        {text: 'Assuming everyone understood without checking leads to errors', feedback: 'y', correct: false}
    ]}
]};
giveaway.options = giveaway.questions[0].options;
const dq = G.distractorQualityIssues([giveaway]);
check('self-announcing distractors on question 3 are caught',
    dq.length === 1 && /question 3/.test(dq[0]), JSON.stringify(dq));
check('...and the message still routes to CC_REPAIRABLE', dq.every(repairable));

console.log('\n6. Prompts - the repair pass gets the shape, not the generation contract');

['vet', 'university', 'workplace', 'pd', 'topicstext', 'policy', 'general'].forEach(function(mode) {
    const rep = Prompts.getContentRepairPromptForMode(mode, {language: 'en-AU'});
    check(mode + ': repair prompt carries the decision-point SHAPE block',
        /FOR REPAIR ONLY/.test(rep));
    check(mode + ': repair prompt does NOT carry the generation rules that would rewrite a card',
        !/THREE QUESTIONS INSTEAD OF ONE/.test(rep)
        && !/MUST TEST THREE DIFFERENT THINGS/.test(rep)
        && !/OPTION PARITY APPLIES TO EVERY QUESTION/.test(rep));
    check(mode + ': generation prompt still carries the full three-question block',
        /THREE QUESTIONS INSTEAD OF ONE/.test(Prompts.getSystemPromptForMode(mode)));
});

const ttUser = Prompts.buildTopicsTextUserPrompt({mode: 'topicstext'}, {title: 'Leadership'});
const ttRepair = Prompts.getContentRepairPromptForMode('topicstext', {language: 'en-AU'});
['overview', 'key-concepts', 'examples-application', 'key-takeaways'].forEach(function(dead) {
    check('topicstext prompts no longer name the retired card type "' + dead + '"',
        ttUser.indexOf(dead) === -1 && ttRepair.indexOf(dead) === -1);
});
check('the topicstext user prompt asks for subtopic cards and the 6-10 range',
    /subtopic/.test(ttUser) && /minimum of 6/.test(ttUser) && /maximum of 10/.test(ttUser));
check('...and no longer forbids the heading every subtopic card must carry',
    !/no heading fields/i.test(ttUser) && /heading/.test(ttUser));

console.log('\n6b. The rendered card - the learner-facing end of the same claim');

// Renders the EXACT shape a saved v2 manifest holds: the question's one feedback line on
// the correct option, nothing on the distractors. The claim being tested is that such a
// pack - one already in a customer's database, which no upgrade can rewrite - still gives
// the learner something when they answer wrong.
const Slots = loadAmd('cc-card-slots.js', []);
Slots.init({
    getLabel: function(k) { return k === 'correctAnswerLabel' ? 'Correct answer' : k; },
    escapeHtml: function(t) { return String(t === undefined || t === null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    fixGrammar: function(t) { return t; },
    getIcon: function() { return ''; },
    resolveScenePartIcon: function() { return ''; },
    formatTextWithDocLinks: function(t) { return t; }
});

const savedManifestCard = {cardType: 'decision-point', schemaVersion: 2, title: 'Recording incidents',
    questions: [{question: 'Which action meets the rule?', options: [RIGHT, BARE_1, BARE_2]}]};
savedManifestCard.options = savedManifestCard.questions[0].options;
const rendered = Slots.renderDecisionChallenge(savedManifestCard,
    [{term: 'Register', definition: 'The record of incidents'}, {term: 'Clause 4', definition: 'The reporting rule'}],
    [{text: 'a'}, {text: 'b'}, {text: 'c'}, {text: 'd'}], {positive: 'Good', negative: 'Avoid'}, false);

check('the challenge quiz rendered at all',
    /cc5-quiz-question/.test(rendered) && /cc5-dp-option/.test(rendered));
check('exactly one option is marked correct',
    (rendered.match(/data-correct="true"/g) || []).length === 1,
    (rendered.match(/data-correct="true"/g) || []).length + ' found');
check('the "Correct answer" badge is rendered once, on the correct option only',
    (rendered.match(/cc5-dp-correct-flag/g) || []).length === 1);
check('the correct option carries a feedback element for the reveal to show',
    /data-correct="true"[\s\S]{0,400}?cc5-dp-feedback/.test(rendered));
check('the bare distractors carry no feedback element (nothing to show - this is the defect)',
    (rendered.match(/cc5-dp-feedback/g) || []).length === 1,
    (rendered.match(/cc5-dp-feedback/g) || []).length + ' feedback elements for 3 options');
check('the badge is inside the option body, where the reveal styling scopes it',
    /cc5-dp-option-body[\s\S]{0,300}?cc5-dp-correct-flag/.test(rendered));

console.log('\n7. The build is not stale - amd/build is what Moodle serves');

[
    ['player5.min.js', ['cc5-dp-reveal', 'correctAnswerLabel']],
    ['cc-card-slots.min.js', ['cc5-dp-correct-flag']],
    ['generator.min.js', ['carry NO FEEDBACK', 'NO WRONG-ANSWER FEEDBACK']],
    ['prompts.min.js', ['FOR REPAIR ONLY', 'NOT OPTIONAL']],
    ['translations.min.js', ['correctAnswerLabel']]
].forEach(function(entry) {
    const built = fs.readFileSync(path.join(BUILD, entry[0]), 'utf8');
    entry[1].forEach(function(marker) {
        check(entry[0] + ' contains "' + marker + '"', built.indexOf(marker) !== -1,
            'Rebuild with: npx grunt amd');
    });
});

const cssFile = fs.readFileSync(path.join(ROOT, 'styles', 'player5.css'), 'utf8');
check('player5.css styles the reveal in BOTH themes',
    /\.cc5-dp-option\.cc5-dp-reveal/.test(cssFile)
    && /dark-mode .cc5-dp-option\.cc5-dp-reveal/.test(cssFile));
check('the dimming rule exempts the revealed answer',
    /\[data-answered="true"\] \.cc5-dp-option:not\(\[data-selected\]\):not\(\.cc5-dp-reveal\)/.test(cssFile));
check('the answered states have dark-mode rules (they had none before v15.4.20)',
    /dark-mode \.cc5-dp-option\[data-selected="correct"\]/.test(cssFile)
    && /dark-mode \.cc5-dp-option\[data-selected="incorrect"\]/.test(cssFile));

console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' checks'));
process.exit(failures ? 1 : 0);
