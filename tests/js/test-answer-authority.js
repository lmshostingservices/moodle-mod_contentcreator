/**
 * The answer key must not reach a learner, and the client must not decide anything.
 *
 * v15.5.0 FIX-CC-ANSWER-IN-DOM and FIX-CC-COMPLETION-FORGEABLE. Before this release:
 *
 *   - cc-card-slots.js wrote data-correct="true" onto the winning option, put every
 *     option's feedback text beside it, flagged the correct one with a span, and carried
 *     the URL of every option's feedback narration. The answer was readable in the
 *     Elements panel before the learner clicked.
 *   - get_manifest.php sent the whole manifest, answer key included, to every learner.
 *   - ajax.php's save_completion took `completed` off the POST body and handed it to
 *     completion_info::update_state().
 *   - record_section_view validated its parameters and wrote nothing at all.
 *
 * These are static checks over the source. They cannot prove the runtime behaviour - only
 * a real generation can - but each one fails loudly if a future edit puts the answer back
 * in the markup or lets the browser assert its own completion, which is the regression
 * worth a suite of its own.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const slots = read('amd', 'src', 'cc-card-slots.js');
const player = read('amd', 'src', 'player5.js');
const getmanifest = read('classes', 'external', 'get_manifest.php');
const storage = read('classes', 'manifest_storage.php');
const ajax = read('ajax.php');
const sectionview = read('classes', 'external', 'record_section_view.php');
const saveattempt = read('classes', 'external', 'save_attempt.php');
const checkanswer = read('classes', 'external', 'check_answer.php');
const services = read('db', 'services.php');
const evidence = read('classes', 'evidence.php');

let failures = 0;
let checks = 0;

function ok(condition, label) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label);
    }
}

// Strip line and block comments so a rule cannot be satisfied - or broken - by prose
// that merely describes the old behaviour. Every note added in this release talks about
// data-correct at length.
function code(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/(^|[^:'"])\/\/.*$/, '$1'))
        .join('\n');
}

const slotscode = code(slots);
const playercode = code(player);

console.log('answer authority');
console.log('');

// --- 1. The renderer must not emit the answer ------------------------------------
console.log('  renderer');

// The decision-point renderers must not write data-correct. The document-activity
// renderer is a separate, non-interactive worked-answer display and is excluded by
// name rather than by accident.
const dpRenderRegion = slotscode.slice(0, slotscode.indexOf('cc5-docactivity-section'));
ok(dpRenderRegion.indexOf("data-correct=") === -1,
    'a decision-point renderer still emits data-correct');
ok(dpRenderRegion.indexOf('data-feedback-audio=') === -1,
    'a decision-point renderer still emits data-feedback-audio');

// Option text is still rendered; only the answer is gone.
ok(/cc5-dp-option-text/.test(slotscode), 'option text is no longer rendered at all');

// data-oidx is what the server grades on.
const oidxCount = (slotscode.match(/data-oidx="/g) || []).length;
ok(oidxCount === 2, 'expected data-oidx in both option renderers, found ' + oidxCount);

// The shuffle must carry the manifest index, or data-oidx is the display index wearing
// a different name and three cards in four grade the wrong option correct.
ok(/copy\._ccIndex = i;/.test(slotscode), 'shuffleOptions does not stamp the manifest index');
ok(/_ccIndex/.test(dpRenderRegion), 'the renderers do not read _ccIndex');

// Feedback is rendered empty and filled by the handler, not written from the manifest.
ok(!/cc5-dp-feedback[^]{0,200}escapeHtml\(fixGrammar\(opt\.feedback/.test(slotscode),
    'option feedback is still written into the markup from the manifest');

// --- 2. The player must ask the server -------------------------------------------
console.log('  player');

ok(/mod_contentcreator_check_answer/.test(playercode),
    'player5 never calls check_answer');
ok(/ccGradeAnswer:\s*function/.test(playercode),
    'ccGradeAnswer is missing');
ok(/ccUnlockOptions:\s*function/.test(playercode),
    'ccUnlockOptions is missing, so a dropped connection would close a question for good');

// Both interactive handlers must route through it. Two call sites: standalone card and
// challenge quiz.
const gradeCalls = (playercode.match(/self\.ccGradeAnswer\(/g) || []).length;
ok(gradeCalls === 2, 'expected 2 ccGradeAnswer call sites, found ' + gradeCalls);

// Neither handler may still read the attribute that no longer exists. Those two reads
// would grade every answer incorrect, silently.
ok(!/var isCorrect = \(\$option\.attr\('data-correct'\) === 'true'\)/.test(playercode),
    'the standalone handler still reads data-correct');
ok(!/var isCorrect = \(\$opt\.attr\('data-correct'\) === 'true'\)/.test(playercode),
    'the challenge quiz handler still reads data-correct');

// The verdict comes from the response.
ok(/var isCorrect = !!result\.iscorrect;/.test(playercode),
    'the handlers do not take their verdict from the server response');

// The reveal must select by the index the server named.
ok(/data-oidx="' \+ result\.correctindex \+ '"/.test(playercode),
    'the wrong-answer reveal does not select by the server-supplied index');

// Locking must happen before the request, or a double tap submits twice.
const standalone = playercode.indexOf("if ($option.closest('.cc5-decision-challenge').length) return;");
ok(standalone !== -1, 'standalone handler not found');
if (standalone !== -1) {
    const body = playercode.slice(standalone, standalone + 1400);
    const lock = body.indexOf("$options.attr('data-answered', 'true')");
    const call = body.indexOf('self.ccGradeAnswer(');
    ok(lock !== -1 && call !== -1 && lock < call,
        'the standalone handler locks after the grading call, not before it');
}

// --- 3. The manifest must be scrubbed for learners --------------------------------
console.log('  manifest');

ok(/strip_answer_key/.test(getmanifest), 'get_manifest does not strip the answer key');
ok(/mod\/contentcreator:manage/.test(getmanifest) && /mod\/contentcreator:review/.test(getmanifest),
    'get_manifest does not exempt staff, so the builder and print view would break');
ok(/if \(!\$isstaff\)/.test(getmanifest), 'the scrub is not gated on staff');

ok(/function strip_answer_key/.test(storage), 'strip_answer_key is not defined');
['correct', 'isCorrect', 'feedback', 'feedbackAudioUrl'].forEach((field) => {
    ok(new RegExp("'" + field + "'").test(storage), 'strip_answer_key does not remove ' + field);
});
ok(/correctIndex/.test(storage), 'strip_answer_key does not remove correctIndex');
// A manifest it cannot parse must come back untouched rather than empty.
ok(/return \$rawmanifest;/.test(storage), 'strip_answer_key has no unchanged-input path');

// --- 4. Completion must be server-decided -----------------------------------------
console.log('  completion');

ok(/evidence::is_complete/.test(ajax),
    'ajax.php still grants completion without consulting the evidence');
ok(/\$completed = \$completed && \\mod_contentcreator\\evidence::is_complete/.test(ajax),
    'ajax.php does not gate the client claim behind the server verdict');
ok(/evidence::record_views/.test(ajax),
    'ajax.php does not reconcile claimed section views against the manifest');

ok(/evidence::record_view\(/.test(sectionview),
    'record_section_view still writes nothing');

ok(/\$granted = \$params\['completed'\]/.test(saveattempt),
    'save_attempt still trusts its completed parameter');
ok(/evidence::is_complete/.test(saveattempt),
    'save_attempt does not consult the evidence');
ok(/if \(\$granted\) \{/.test(saveattempt),
    'save_attempt still fires completion on the unverified flag');

// Sticky: an existing completion must never be revoked by this change.
ok(/\$already = \$DB->get_field\('contentcreator_attempts', 'completed'/.test(evidence),
    'evidence::is_complete does not honour completions earned before this release');

// --- 5. The endpoint must be registered and must grade on the server --------------
console.log('  endpoint');

ok(/mod_contentcreator_check_answer/.test(services), 'check_answer is not in db/services.php');
ok(/'type' => 'write'/.test(services), 'services.php declares no write type');
ok(/evidence::correct_index/.test(checkanswer),
    'check_answer does not resolve the correct option from the manifest');
ok(/evidence::record_answer/.test(checkanswer),
    'check_answer does not record the result');
ok(/require_capability\('mod\/contentcreator:view'/.test(checkanswer),
    'check_answer has no capability check');
ok(/_learning/.test(checkanswer),
    'check_answer does not normalise the challenge slide id back to its section id');
// The correct option is disclosed only after a wrong answer, never up front.
ok(/if \(\$graded && !\$iscorrect/.test(checkanswer),
    'check_answer returns the correct option\'s feedback unconditionally');

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks');
process.exit(0);
