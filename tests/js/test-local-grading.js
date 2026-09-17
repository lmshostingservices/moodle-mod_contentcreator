/**
 * v15.6.1 — the browser and the server must reach the same verdict.
 *
 * Grading moved back to the client for the message the learner sees, while the completion
 * record stayed on the server: player5.js decides instantly from the manifest it already
 * holds, then reports the answer to mod_contentcreator_check_answer, which re-reads the
 * stored manifest and decides for itself.
 *
 * That is two graders on one set of data, and the failure mode is quiet. If they disagree,
 * a learner is congratulated on screen while the evidence row records a wrong answer - or,
 * worse, told they were wrong on a question the server counted, which no amount of retrying
 * would fix because nothing is broken. Nobody would report it as a bug; it would surface as
 * a completion that never arrives.
 *
 * So this suite runs the SHIPPED implementations - ccGradeLocally() and ccFindQuestion()
 * lifted out of player5.js, and \mod_contentcreator\evidence lifted out of the plugin by
 * running PHP - over the same fixtures and asserts they agree on every one. The fixtures
 * cover all four answer-key shapes that exist in stored manifests, the "first decision-point
 * card only" rule both must obey, and the "_learning" section-id suffix the challenge slide
 * carries.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const PLAYER = path.join(root, 'amd', 'src', 'player5.js');

let failures = 0;
let checks = 0;

function ok(condition, label, detail) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
    }
}

/**
 * Lift one object-literal method out of player5.js by name, brace-matched.
 *
 * Extracted rather than reimplemented: a copy in this file would pass forever while the
 * shipped code drifted, which is the one thing this suite exists to catch.
 *
 * @param {String} src player5.js source.
 * @param {String} name Method name as it appears in the object literal.
 * @returns {String} The method source, as `name: function(...) {...}`.
 */
function lift(src, name) {
    const start = src.indexOf(name + ': function(');
    if (start === -1) { throw new Error(name + '() not found in player5.js'); }
    let i = src.indexOf('{', src.indexOf('(', start));
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
        if (src[end] === '{') { depth++; } else if (src[end] === '}') {
            depth--;
            if (depth === 0) { end++; break; }
        }
    }
    return src.slice(start, end);
}

const playersrc = fs.readFileSync(PLAYER, 'utf8');
const grader = new Function(
    'return {' + lift(playersrc, 'ccGradeLocally') + ',' + lift(playersrc, 'ccFindQuestion') + '};'
)();

/**
 * Call the lifted ccGradeLocally() with a `this` that carries the manifest and both
 * methods, which is what the player object provides at runtime.
 *
 * @param {Object} manifest The loaded manifest.
 * @param {String} sectionId Section id from the slide wrapper.
 * @param {Number} q Zero-based question index.
 * @param {Number} o Chosen option index, in manifest order.
 * @returns {Object|null} The verdict, or null.
 */
function gradeLocally(manifest, sectionId, q, o) {
    const self = Object.assign({ manifest: manifest }, grader);
    return self.ccGradeLocally(sectionId, q, o);
}

/**
 * Wrap cards in a one-topic, one-section manifest.
 *
 * @param {String} id Section id.
 * @param {Array} cards Cards for that section.
 * @returns {Object} A manifest.
 */
function sec(id, cards) {
    return { topics: [{ id: 't1', sections: [{ id: id, cards: cards }] }] };
}

const dp = (questions) => ({ cardType: 'decision-point', questions: questions });
const opts = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) { out.push({ text: 'opt' + i, feedback: 'fb' + i }); }
    return out;
};

// Each case: a manifest, the section id the slide carries, a question index, and the
// option indexes to try. Every option of every question is tried, so a fixture with three
// options is three comparisons.
const cases = [];

// --- the four answer-key shapes ---------------------------------------------------
const perCorrect = opts(3);
perCorrect[1].correct = true;
cases.push({ name: 'per-option correct', m: sec('s1', [dp([{ question: 'q', options: perCorrect }])]), sid: 's1', q: 0 });

const perIsCorrect = opts(3);
perIsCorrect[2].isCorrect = true;
cases.push({ name: 'per-option isCorrect', m: sec('s1', [dp([{ question: 'q', options: perIsCorrect }])]), sid: 's1', q: 0 });

cases.push({
    name: 'question-level correctIndex',
    m: sec('s1', [dp([{ question: 'q', correctIndex: 0, options: opts(4) }])]),
    sid: 's1', q: 0
});

const legacy = opts(2);
legacy[1].correct = true;
cases.push({
    name: 'legacy card-is-the-question',
    m: sec('s1', [{ cardType: 'decision-point', question: 'q', options: legacy }]),
    sid: 's1', q: 0
});

// --- no answer key at all: both must decline to grade, neither may guess ----------
cases.push({
    name: 'no option marked correct',
    m: sec('s1', [dp([{ question: 'q', options: opts(3) }])]),
    sid: 's1', q: 0
});
cases.push({
    name: 'correctIndex out of range',
    m: sec('s1', [dp([{ question: 'q', correctIndex: 9, options: opts(3) }])]),
    sid: 's1', q: 0
});

// --- precedence: a per-option flag wins over a contradicting correctIndex ---------
const contradiction = opts(3);
contradiction[0].correct = true;
cases.push({
    name: 'per-option flag contradicts correctIndex',
    m: sec('s1', [dp([{ question: 'q', correctIndex: 2, options: contradiction }])]),
    sid: 's1', q: 0
});

// --- the first-card rule: a second decision-point card must be invisible ----------
// The player renders each decision-point card as its own challenge numbering from zero,
// so a grader that flattened across cards would resolve q1 to the second card's first
// question - and mark the wrong option correct on every multi-card section.
const first = opts(2);
first[0].correct = true;
const second = opts(2);
second[1].correct = true;
const twocards = sec('s1', [
    { cardType: 'concept-explainer', heading: 'h' },
    dp([{ question: 'first card q0', options: first }]),
    dp([{ question: 'second card q0', options: second }])
]);
cases.push({ name: 'two challenge cards, q0', m: twocards, sid: 's1', q: 0 });
cases.push({ name: 'two challenge cards, q1 is out of range', m: twocards, sid: 's1', q: 1 });

// --- the _learning suffix the challenge slide carries -----------------------------
const suffixed = opts(3);
suffixed[2].correct = true;
cases.push({
    name: 'section id carrying the _learning suffix',
    m: sec('subtopic_0_1', [dp([{ question: 'q', options: suffixed }])]),
    sid: 'subtopic_0_1_learning', q: 0
});

// --- a section that does not exist, and a card that is not a challenge ------------
cases.push({ name: 'unknown section', m: sec('s1', [dp([{ question: 'q', options: perCorrect }])]), sid: 'nope', q: 0 });
cases.push({
    name: 'section with no challenge card',
    m: sec('s1', [{ cardType: 'concept-explainer', heading: 'h' }]),
    sid: 's1', q: 0
});

// --- an id the transport mangles -------------------------------------------------
// The browser matches the manifest id verbatim, because that is the string it read out
// of the manifest. The server never sees that string: clean_param(PARAM_ALPHANUMEXT) has
// already removed the dot and the space by the time check_answer runs, and
// resolve_section_id() normalises the manifest's ids the same way to find it again. Both
// must still land on the same question, so the fixture feeds each the id it would really
// receive.
const dotted = opts(3);
dotted[1].correct = true;
cases.push({
    name: 'a section id the transport mangles',
    m: sec('pc 1.1', [dp([{ question: 'q', options: dotted }])]),
    sid: 'pc 1.1', serversid: 'pc11', q: 0
});

// --- multiple questions on one card -----------------------------------------------
const qa = opts(3);
qa[0].correct = true;
const qb = opts(3);
qb[2].correct = true;
const multi = sec('s1', [dp([{ question: 'a', options: qa }, { question: 'b', options: qb }])]);
cases.push({ name: 'two questions on one card, q0', m: multi, sid: 's1', q: 0 });
cases.push({ name: 'two questions on one card, q1', m: multi, sid: 's1', q: 1 });

// Build the comparison set: every case at every option index it could receive, plus one
// past the end, because a player holding a stale manifest can send an index that no
// longer exists and the two must refuse it the same way.
const probes = [];
cases.forEach((c) => {
    for (let o = 0; o <= 4; o++) {
        probes.push({
            name: c.name + ' [o' + o + ']',
            manifest: c.m,
            sectionid: c.sid,
            // What the transport would deliver, when that differs from what the browser holds.
            serversectionid: c.serversid || c.sid,
            q: c.q,
            o: o
        });
    }
});

// --- the server's answer, from the shipped PHP -------------------------------------
// evidence.php is run as PHP rather than read as text: correct_index() and question_at()
// are what check_answer calls, and only running them proves what they return.
const php = `<?php
define('MOODLE_INTERNAL', true);
require_once('` + root.replace(/'/g, "\\'") + `/classes/evidence.php');
$probes = json_decode(file_get_contents('php://stdin'), true);
$out = [];
foreach ($probes as $p) {
    // Mirror check_answer::execute(): resolve the claimed id against the manifest first -
    // that is where the "_learning" suffix the challenge slide carries is handled - then
    // look the question up. Skipping the resolve here would compare the browser against a
    // server path that does not exist.
    $sid = \\mod_contentcreator\\evidence::resolve_section_id($p['manifest'], $p['serversectionid']);
    $q = $sid === '' ? null
        : \\mod_contentcreator\\evidence::question_at($p['manifest'], $sid, $p['q']);
    if ($q === null || empty($q['options']) || !is_array($q['options'])) {
        $out[] = ['resolved' => false, 'graded' => false, 'correctindex' => -1, 'iscorrect' => false];
        continue;
    }
    $ci = \\mod_contentcreator\\evidence::correct_index($q['options'], $q);
    $o = $p['o'];
    $inrange = ($o >= 0 && $o < count($q['options']));
    $out[] = [
        'resolved' => $inrange,
        'graded' => $inrange && $ci !== null,
        'correctindex' => $ci === null ? -1 : $ci,
        'iscorrect' => $inrange && $ci !== null && $o === $ci,
    ];
}
echo json_encode($out);
`;

const tmp = path.join(require('os').tmpdir(), 'cc-evidence-probe-' + process.pid + '.php');
fs.writeFileSync(tmp, php);
let server;
try {
    server = JSON.parse(execFileSync('php', [tmp], { input: JSON.stringify(probes) }).toString());
} finally {
    fs.unlinkSync(tmp);
}

console.log('local grading agrees with the server');
console.log('');
console.log('  ' + probes.length + ' probes across ' + cases.length + ' fixtures');

let agreed = 0;
probes.forEach((p, i) => {
    const s = server[i];
    const local = gradeLocally(p.manifest, p.sectionid, p.q, p.o);

    // Shape one: neither resolved it. The player unlocks the question; the server records
    // nothing. Both refuse, which is the agreement that matters here.
    if (!s.resolved) {
        ok(local === null, p.name + ': the server could not resolve it but the browser did',
            JSON.stringify(local));
        if (local === null) { agreed++; }
        return;
    }

    ok(local !== null, p.name + ': the server resolved it but the browser did not');
    if (local === null) { return; }

    const same = local.graded === s.graded
        && local.iscorrect === s.iscorrect
        && local.correctindex === s.correctindex;
    ok(same, p.name + ': the two verdicts differ',
        'browser ' + JSON.stringify({ graded: local.graded, iscorrect: local.iscorrect,
            correctindex: local.correctindex })
        + '  server ' + JSON.stringify({ graded: s.graded, iscorrect: s.iscorrect,
            correctindex: s.correctindex }));
    if (same) { agreed++; }
});

// The fixtures must actually exercise both outcomes. A suite in which nothing was ever
// graded correct would agree perfectly and prove nothing.
const graded = probes.filter((p, i) => server[i].graded);
ok(graded.length > 10, 'too few probes were graded at all: ' + graded.length);
ok(graded.some((p, i) => server[probes.indexOf(p)].iscorrect), 'no probe was ever correct');
ok(graded.some((p) => !server[probes.indexOf(p)].iscorrect), 'no probe was ever incorrect');

// The player's own contract: the shape it returns is the shape the two handlers read.
const sample = gradeLocally(cases[0].m, 's1', 0, 1);
['success', 'graded', 'iscorrect', 'correctindex', 'feedback', 'correctfeedback', 'feedbackaudiourl']
    .forEach((field) => {
        ok(Object.prototype.hasOwnProperty.call(sample, field),
            'the local verdict is missing ' + field + ', which check_answer returns');
    });
ok(sample.feedback === 'fb1', 'the chosen option\'s feedback is not returned');
const wrong = gradeLocally(cases[0].m, 's1', 0, 0);
ok(wrong.correctfeedback === 'fb1', 'a wrong answer does not carry the correct option\'s feedback');
ok(sample.correctfeedback === '', 'a correct answer discloses the correct option\'s feedback twice');

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks (' + agreed + ' verdicts agreed)');
process.exit(0);
