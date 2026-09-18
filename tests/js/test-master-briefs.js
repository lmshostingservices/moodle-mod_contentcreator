/**
 * v15.7.0 — the per-route quality brief shown beside the ChatGPT prompt.
 *
 * The prompt the builder hands a teacher gets the SHAPE right: seven cards, the JSON
 * envelope, the field names. The fast-parse path depends on that shape exactly. What it
 * cannot do in the space it has is teach the model how to WRITE good learner material, and
 * that is where the measured gap has always been — option feedback arriving at five or six
 * words against a thirty-word floor, Performance Criteria paraphrased back instead of
 * taught, one generic example where three real ones were asked for.
 *
 * The brief is the second half of that, one per route. Three things have to hold:
 *
 *   1. **Every route has one**, because a route that silently has none looks identical to
 *      one that does until a teacher goes looking for it.
 *   2. **They are route-specific.** Seven copies of one generic brief would pass a
 *      presence check and teach nothing: a VET unit, a university subject and a compliance
 *      policy do not fail in the same way, which is the entire reason for writing seven.
 *   3. **Each one carries the parts that fix the known defects** — the three-example rule,
 *      the feedback floor, the do-not-fabricate rule, the seven-card sequence, and the
 *      narration note. Those are not stylistic preferences; each corresponds to a measured
 *      failure in shipped packs.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const briefsSrc = fs.readFileSync(path.join(root, 'amd', 'src', 'masterbriefs.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'amd', 'src', 'builder.js'), 'utf8');
const lang = fs.readFileSync(path.join(root, 'lang', 'en', 'contentcreator.php'), 'utf8');

let failures = 0;
let checks = 0;
function ok(condition, label, detail) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
    }
}

// Load the shipped module. define() is stubbed so the real factory runs.
function loadBriefs() {
    let mod = null;
    const define = function (deps, factory) { mod = factory(); };
    // eslint-disable-next-line no-new-func
    new Function('define', briefsSrc)(define);
    if (!mod) { throw new Error('masterbriefs.js did not define a module'); }
    return mod;
}

const Briefs = loadBriefs();

// The routes the builder actually dispatches on. Kept here rather than read from the
// module, so that deleting a brief fails instead of shrinking the expectation.
const ROUTES = ['vet', 'workplace', 'university', 'pd', 'policy', 'general', 'topicstext'];

console.log('master briefs');
console.log('');

// --- 1. Every route has one -------------------------------------------------------
console.log('  coverage');

ROUTES.forEach(function (route) {
    const brief = Briefs.forRoute(route);
    ok(brief && brief.length > 4000, 'the ' + route + ' brief is missing or too short to be '
        + 'a brief: ' + (brief ? brief.length : 0) + ' characters');
});
ok(Briefs.routes().length === ROUTES.length,
    'the module defines ' + Briefs.routes().length + ' briefs, expected ' + ROUTES.length);
ok(Briefs.forRoute('nonsense') === '', 'an unknown route does not return an empty string');
ok(Briefs.forRoute(null) === '' && Briefs.forRoute(undefined) === '',
    'a null or undefined route throws instead of returning empty');

// --- 2. They are genuinely different from each other -------------------------------
console.log('  route specificity');

// Seven copies of one brief would pass every check above. This is what stops that.
const bodies = ROUTES.map(function (r) { return Briefs.forRoute(r); });
for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
        ok(bodies[i] !== bodies[j],
            'the ' + ROUTES[i] + ' and ' + ROUTES[j] + ' briefs are identical');
    }
}

// Each brief must contain vocabulary that belongs to its route and would be wrong in the
// others. A VET brief without "Performance Criteria" is not a VET brief.
const MARKERS = {
    vet: ['Performance Criteria', 'Knowledge Evidence', 'model WHS', 'Registered Training Organisation',
        'Code of Practice', 'SWMS'],
    workplace: ['organisation', 'escalate', 'policies', 'team leader'],
    university: ['learning outcome', 'discipline', 'misconception', 'citation'],
    pd: ['practitioner', 'scope of practice', 'registration', 'continuing-professional-development'],
    policy: ['supplied document', 'threshold', 'clause', 'auditor'],
    general: ['analogy', 'prior knowledge', 'convention'],
    topicstext: ['source text', 'quote', 'ambiguous', 'traceable']
};
Object.keys(MARKERS).forEach(function (route) {
    const brief = Briefs.forRoute(route);
    MARKERS[route].forEach(function (marker) {
        ok(brief.toLowerCase().indexOf(marker.toLowerCase()) !== -1,
            'the ' + route + ' brief never mentions "' + marker + '"');
    });
});

// ...and the route-specific vocabulary must NOT have leaked everywhere. If every brief
// talks about Performance Criteria then they are not route-specific, whatever else differs.
ok(ROUTES.filter(function (r) {
    return Briefs.forRoute(r).indexOf('Performance Criteria') !== -1;
}).length === 1, 'more than one brief talks about Performance Criteria, which belongs to VET');
ok(ROUTES.filter(function (r) {
    return Briefs.forRoute(r).toLowerCase().indexOf('scope of practice') !== -1;
}).length === 1, 'more than one brief talks about scope of practice, which belongs to PD');

// --- 3. Each carries the parts that fix the known defects --------------------------
console.log('  the quality rules that matter');

// Each of these corresponds to a measured failure in shipped packs, not a preference.
const REQUIRED = [
    // 16 of 77 fields in the last validated pack were under range, option feedback worst
    // of all at 5-7 words against a 30-44 floor.
    { name: 'a feedback floor in words', test: /at least 30 to 45 words/ },
    { name: 'feedback for EVERY option, not just the wrong one', test: /feedback for EVERY option/ },
    // The vendor flattens long fields; three examples is the instruction most often lost.
    { name: 'the three-example rule', test: /at least three/i },
    // A fabricated citation in compliance material is the most expensive failure available.
    { name: 'a do-not-fabricate rule', test: /[Nn]ever invent|do not invent/ },
    // The plugin renders seven cards; a brief that does not say so produces seven
    // disconnected examples.
    { name: 'the seven-card sequence', test: /seven-card learning sequence/ },
    { name: 'one situation carried across the cards', test: /rather than starting a new unrelated example/ },
    // Everything is narrated, and the voice reads punctuation literally.
    { name: 'the narration note', test: /narrated by a synthetic voice/ },
    { name: 'a final quality standard', test: /FINAL QUALITY STANDARD/ },
    { name: 'an accuracy check', test: /ACCURACY CHECK/ },
    // Without this the model returns the input reworded, which is the oldest failure here.
    { name: 'a do-not-paraphrase rule', test: /rather than (merely )?(restat|paraphras|summaris)|not (merely )?(restate|paraphrase|summarise)/i }
];
ROUTES.forEach(function (route) {
    const brief = Briefs.forRoute(route);
    REQUIRED.forEach(function (rule) {
        ok(rule.test.test(brief), 'the ' + route + ' brief is missing ' + rule.name);
    });
});

// Every brief must end with the fill-in block, or a teacher pastes it with nothing in it.
ROUTES.forEach(function (route) {
    const brief = Briefs.forRoute(route);
    ok(/COURSE-SPECIFIC INPUT/.test(brief),
        'the ' + route + ' brief has no input block for the teacher to fill in');
    ok(/\[INSERT/.test(brief),
        'the ' + route + ' brief has no placeholders in its input block');
    ok(/^Now develop the learner content/m.test(brief),
        'the ' + route + ' brief does not end by asking for the content');
});

// --- 4. Nothing that breaks the paste ----------------------------------------------
console.log('  safe to paste');

ROUTES.forEach(function (route) {
    const brief = Briefs.forRoute(route);
    // A backtick or ${ would have broken the template literal the module is built from;
    // node --check catches that, but a stray one inside the TEXT is also a hazard when the
    // teacher pastes it into a chat that renders markdown.
    ok(brief.indexOf('`') === -1, 'the ' + route + ' brief contains a backtick');
    ok(brief.indexOf('${') === -1, 'the ' + route + ' brief contains a template placeholder');
    // The brief instructs against markdown in the OUTPUT; it should not model it in the
    // input either.
    ok(!/^#{1,6}\s/m.test(brief), 'the ' + route + ' brief uses markdown headings');
    ok(!/\|.*\|.*\|/.test(brief), 'the ' + route + ' brief contains a markdown table');
});

// --- 5. The builder shows it, for every route --------------------------------------
console.log('  wired into every route');

ok(/const renderMasterBrief = \(route, id\)/.test(builder),
    'renderMasterBrief is missing from builder.js');
ROUTES.forEach(function (route) {
    ok(builder.indexOf("renderMasterBrief('" + route + "'") !== -1,
        'the ' + route + ' route does not render its brief');
});

// Each panel needs its own DOM id, or two on one screen collide.
const ids = (builder.match(/renderMasterBrief\('[a-z]+', '([^']+)'\)/g) || []);
ok(ids.length === ROUTES.length, 'expected ' + ROUTES.length + ' brief panels, found ' + ids.length);

// The copy button must serve the brief, not the tailor example's lang key.
ok(/data-brief-route="/.test(builder), 'the copy button does not identify its route');
ok(/MasterBriefs\.forRoute\(route\)/.test(builder),
    'the copy handler does not read the brief from the module');

// --- 6. The hover says the one thing a teacher could get wrong ---------------------
console.log('  the hover');

const hover = (lang.match(/\$string\['msgbriefhover'\] = '((?:[^'\\]|\\.)*)'/) || [])[1] || '';
ok(hover.length > 80, 'msgbriefhover is missing or too short: "' + hover + '"');
ok(/as well as/i.test(hover) && /not instead of/i.test(hover),
    'the hover does not say to paste the brief AS WELL AS the prompt rather than instead '
    + 'of it, which is the one mistake that would leave the generation with no structural '
    + 'instructions at all: "' + hover + '"');

// A tooltip alone is invisible to a keyboard or touch user, and this is the sentence that
// stops someone pasting the brief instead of the prompt.
ok(/aria-label="' \+ escapeHtml\(hover\)/.test(builder),
    'the hover text is not exposed to assistive technology');
// Scoped to the badge itself. A bare /tabindex="0"/ over the whole file passes on any
// other focusable element in builder.js, which is what it did when this was first written.
const badge = builder.slice(builder.indexOf('const renderMasterBrief'),
    builder.indexOf('const renderTailorExample'));
ok(/tabindex="0" role="note"/.test(badge),
    'the info badge cannot be reached by keyboard, so the sentence that stops someone '
    + 'pasting the brief instead of the prompt is mouse-only');
ok(/cursor:help/.test(badge), 'the info badge does not look like one');

['msgbrieftitle', 'msgbriefintro', 'msgbriefhover', 'msgbriefcopy', 'msgbriefshow']
    .forEach(function (key) {
        ok(lang.indexOf("$string['" + key + "']") !== -1, key + ' is not in lang/en');
        ok(builder.indexOf("'" + key + "'") !== -1, key + ' is not registered in builder.js');
    });

// --- 7. The briefs stay OUT of the language file -----------------------------------
console.log('  not in the string table');

// Deliberate, and worth asserting so nobody "fixes" it later: seven briefs is ~100 KB,
// they are not translatable in any useful sense (the VET one is about Australian model WHS
// law), and they are pasted into an English-language model as machine-facing instructions.
ok(lang.indexOf('MASTER BRIEF') === -1,
    'a brief has been moved into lang/en, which nearly doubles the language file and '
    + 'invites a machine translation of Australian WHS terminology');
ok(/WHY THIS IS NOT IN lang/.test(briefsSrc),
    'masterbriefs.js no longer explains why it is not in the string table');

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks');
process.exit(0);
