<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Plugin-level static checks that need PHP but NOT a Moodle install.
 *
 * Run from the plugin root:   php tests/php/static-checks.php
 * Exit 0 = pass, 1 = fail. No database, no web server, no Moodle core.
 *
 * WHY
 *
 * Everything else in tests/js checks JavaScript. These are the plugin-shaped mistakes that
 * only appear once Moodle loads the thing: a version that disagrees with the changelog and
 * silently refuses to upgrade, a capability with no lang string (which renders as a raw key
 * in the roles UI), a get_string() key that does not exist (which renders as
 * [[thekey]] on the page), a getLabel() key with no entry in translations.js (which renders
 * the key itself to the learner).
 *
 * The two zip-shape rules this file also enforces are release-process scars: v15.3.13 went
 * out twice under one $plugin->version, and Moodle upgrades on the number, so the second
 * ZIP was silently ignored.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$root = dirname(__DIR__, 2);
chdir($root);

$failures = 0;
$checks = 0;

/**
 * Record one assertion.
 *
 * @param string $label What is being asserted.
 * @param bool $ok The result.
 * @param string $detail Printed when it fails.
 * @return void
 */
function check(string $label, bool $ok, string $detail = ''): void {
    global $failures, $checks;
    $checks++;
    if ($ok) {
        echo "  ok   $label\n";
        return;
    }
    $failures++;
    echo "  FAIL $label" . ($detail ? "\n         $detail" : '') . "\n";
}

/**
 * Every .php file in the plugin, excluding dependencies.
 *
 * @return array Relative paths.
 */
function plugin_php_files(): array {
    $out = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator('.', FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $p = $f->getPathname();
        if (substr($p, -4) !== '.php') {
            continue;
        }
        if (strpos($p, 'node_modules') !== false) {
            continue;
        }
        $out[] = $p;
    }
    sort($out);
    return $out;
}

echo "\n1. PHP syntax\n";
$phpfiles = plugin_php_files();
$syntaxbad = [];
foreach ($phpfiles as $f) {
    $out = [];
    exec('php -l ' . escapeshellarg($f) . ' 2>&1', $out, $rc);
    if ($rc !== 0) {
        $syntaxbad[] = $f . ': ' . implode(' ', $out);
    }
}
check(count($phpfiles) . ' PHP files parse', empty($syntaxbad), implode("\n         ", $syntaxbad));

echo "\n2. Version agreement - Moodle upgrades on the number, so these cannot drift\n";
define('MOODLE_INTERNAL', true);
foreach (['MATURITY_ALPHA' => 50, 'MATURITY_BETA' => 100, 'MATURITY_RC' => 150, 'MATURITY_STABLE' => 200,
          'CONTEXT_SYSTEM' => 10, 'CONTEXT_USER' => 30, 'CONTEXT_COURSECAT' => 40, 'CONTEXT_COURSE' => 50,
          'CONTEXT_MODULE' => 70, 'CONTEXT_BLOCK' => 80, 'CAP_ALLOW' => 1, 'CAP_PREVENT' => -1,
          'CAP_PROHIBIT' => -1000, 'RISK_XSS' => 1, 'RISK_SPAM' => 2, 'RISK_PERSONAL' => 4,
          'RISK_DATALOSS' => 8, 'RISK_CONFIG' => 16, 'RISK_MANAGETRUST' => 32] as $k => $v) {
    if (!defined($k)) {
        define($k, $v);
    }
}
$plugin = new stdClass();
include 'version.php';
$pkg = json_decode(file_get_contents('package.json'), true);
preg_match('/^## ([0-9.]+)/m', file_get_contents('CHANGELOG.md'), $logm);
check(
    'version.php, package.json and the CHANGELOG all say the same release',
    $plugin->release === $pkg['version'] && $plugin->release === ($logm[1] ?? ''),
    "version.php={$plugin->release} package.json={$pkg['version']} changelog=" . ($logm[1] ?? '?'));
check(
    '$plugin->version is a 10-digit YYYYMMDDXX integer',
    (bool)preg_match('/^20\d{8}$/', (string)$plugin->version), (string)$plugin->version);
check('component is mod_contentcreator', $plugin->component === 'mod_contentcreator');

echo "\n3. Language strings\n";
$string = [];
include 'lang/en/contentcreator.php';
$usedstrings = [];
foreach ($phpfiles as $f) {
    $getstringpattern = '/get_string\(\s*[\'"]([a-zA-Z0-9_]+)[\'"]\s*,\s*[\'"]mod_contentcreator[\'"]/';
    if (preg_match_all($getstringpattern, file_get_contents($f), $mm)) {
        foreach ($mm[1] as $k) {
            $usedstrings[$k][] = $f;
        }
    }
}
$missingstrings = array_diff(array_keys($usedstrings), array_keys($string));
check(
    count($usedstrings) . ' get_string() keys all exist in lang/en (a missing one renders as [[key]])',
    empty($missingstrings), implode(', ', $missingstrings));

echo "\n4. Capabilities\n";
$capabilities = [];
include 'db/access.php';
$defined = [];
foreach (array_keys($capabilities) as $full) {
    $defined[] = substr($full, strlen('mod/contentcreator:'));
}
$capsused = [];
foreach ($phpfiles as $f) {
    if (preg_match_all('/[\'"]mod\/contentcreator:([a-z]+)[\'"]/', file_get_contents($f), $cc)) {
        foreach ($cc[1] as $c) {
            $capsused[$c][] = $f;
        }
    }
}
check(
    'every capability checked in code is defined in db/access.php',
    empty(array_diff(array_keys($capsused), $defined)),
    implode(', ', array_diff(array_keys($capsused), $defined)));
$nostring = [];
foreach ($defined as $c) {
    if (!isset($string["contentcreator:$c"])) {
        $nostring[] = $c;
    }
}
check(
    count($defined) . ' capabilities all have their lang string (a missing one shows a raw key '
        . 'in Define Roles)',
    empty($nostring),
    implode(', ', $nostring)
);

echo "\n5. Built AMD matches source - amd/build is what Moodle serves\n";
$markers = [
    'player5' => ['cc5-dp-reveal', 'correctAnswerLabel'],
    'cc-card-slots' => ['cc5-dp-correct-flag'],
    'generator' => ['carry NO FEEDBACK', 'NO WRONG-ANSWER FEEDBACK'],
    'prompts' => ['FOR REPAIR ONLY'],
    'translations' => ['correctAnswerLabel'],
];
foreach ($markers as $mod => $needles) {
    $built = file_get_contents("amd/build/$mod.min.js");
    foreach ($needles as $needle) {
        check(
    "amd/build/$mod.min.js contains \"$needle\"",
            strpos($built, $needle) !== false, 'Rebuild with: npx grunt amd');
    }
}
$srcfiles = glob('amd/src/*.js');
$stale = [];
foreach ($srcfiles as $src) {
    $built = 'amd/build/' . basename($src, '.js') . '.min.js';
    if (file_exists($built) && filemtime($built) < filemtime($src)) {
        $stale[] = basename($src);
    }
}
check(
    'no built module is older than its source',
    empty($stale), 'stale: ' . implode(', ', $stale) . ' - run: npx grunt amd');

echo "\n6. Release-pipeline rules - the ones that BLOCK a promotion\n";

// V15.5.2. Three pipeline findings in one release, all of them mechanical, all of them
// caught after the zip was built rather than before. They are cheap to check here.

// --- 6a. No unfiltered parameter types without an on-the-same-line justification ------
//
// Moodle's two unfiltered parameter types are approval blockers unless the line carries a
// justification. check_answer.php shipped a section id as one of them with the reason in a
// comment BLOCK above the line, which does not count - and was the wrong fix anyway, since
// the id is now constrained where it is created.
//
// V15.5.5: the token is BUILT here rather than written out, so this file does not contain
// the literal string it is looking for. That is not cosmetic. The first version wrote it
// out and had to exclude itself from its own sweep - and the harness then became the only
// file in the plugin with an unjustified usage, which the release pipeline found and this
// suite could not.
$unfiltered = 'PARAM' . '_RAW';
$rawoffenders = [];
foreach (plugin_php_files() as $f) {
    foreach (file($f) as $n => $line) {
        if (!preg_match('/\b' . $unfiltered . '(_TRIMMED)?\b/', $line)) {
            continue;
        }
        // The justification must be on the same line, in the form the pipeline accepts.
        if (stripos($line, 'pipeline-ignore') !== false) {
            continue;
        }
        $rawoffenders[] = $f . ':' . ($n + 1);
    }
}
check(
    'every unfiltered parameter type carries a same-line pipeline-ignore justification',
    empty($rawoffenders),
    'unjustified: ' . implode(', ', $rawoffenders));

// --- 6b. Comment blocks start with a capital -----------------------------------------
// V15.5.5: this now also sees TRAILING comments - a // after code on the same line - and
// it no longer exempts this file.
//
// The first version looked only at lines that BEGIN with //. The release pipeline counts a
// trailing comment as its own block, and there was one sitting in lang/en that this suite
// declared clean for three releases. A continuation line inside a block is still exempt,
// or the GPL header would fail in every file.
$lowercomments = [];
foreach (plugin_php_files() as $f) {
    $prevwasownline = false;
    foreach (file($f) as $n => $line) {
        $trimmed = trim($line);
        $ownline = strpos($trimmed, '//') === 0;
        if ($ownline) {
            if (!$prevwasownline) {
                $body = trim(substr($trimmed, 2));
                if ($body !== '' && preg_match('/^[a-z]/', $body)) {
                    $lowercomments[] = $f . ':' . ($n + 1) . ' (block)';
                }
            }
            $prevwasownline = true;
            continue;
        }
        $prevwasownline = false;
        // A trailing comment. The guard against a // inside a quoted string is crude but
        // sufficient here: a URL is the only realistic false positive and it is preceded
        // by a colon, not whitespace.
        if (preg_match('~\S\s+//\s*(.+)$~', $line, $tm) && strpos($line, '://') === false) {
            if (preg_match('/^[a-z]/', trim($tm[1]))) {
                $lowercomments[] = $f . ':' . ($n + 1) . ' (trailing)';
            }
        }
    }
}
check(
    'no comment block or trailing comment begins with a lowercase letter',
    empty($lowercomments),
    'lowercase openings: ' . implode(', ', $lowercomments));

// V15.5.5: two more of the pipeline's coding-style rules, both of which it found in this
// very file after the sweeps above had been told to skip it.
$fnkeyword = 'function' . '(';
$fnspacing = [];
foreach (plugin_php_files() as $f) {
    foreach (file($f) as $n => $line) {
        // Strip a trailing comment first, so prose describing the rule cannot trip it.
        $code = preg_replace('~\s//.*$~', '', $line);
        // The lookbehind matters. A name such as register_shutdown_function ends in the
        // same eight characters before its parenthesis and is not a violation; a plain
        // substring match reported one in ajax.php as a defect that was not there.
        if (preg_match('/(?<![A-Za-z0-9_])' . preg_quote($fnkeyword, '/') . '/', $code)) {
            $fnspacing[] = $f . ':' . ($n + 1);
        }
    }
}
check(
    'no PHP file writes the function keyword with no space before its parenthesis',
    empty($fnspacing),
    implode(', ', $fnspacing));

// NOT IMPLEMENTED, deliberately: "multi-line calls, opening paren last on line".
//
// The release pipeline reports this rule and the one instance it found has been fixed. A
// check for it is not here because one sample is not enough to implement it without false
// positives, and a check that cries wolf is worse than no check - it teaches you to skim
// past the section it lives in.
//
// The two shapes could not be told apart from the evidence available. Both have code after
// an unclosed opening parenthesis, and only the first was reported:
//
//     if (preg_match_all(            <- reported
//     if (has_capability($a, $b)     <- not reported, and perfectly good code
//         || has_capability($c, $d)) {
//
// A first draft flagged four lines, three of them correct. It was removed rather than
// tuned on guesswork. If the rule is ever published, implement it here.

// --- 6c. Language strings are one line each -------------------------------------------
//
// A literal newline inside a $string value is valid PHP and works at runtime, but AMOS
// and every lang-file parser expect one string per line. Use "\n" in a double-quoted
// string instead - the runtime value is identical.
$langsrc = file_get_contents('lang/en/contentcreator.php');
preg_match_all("/^\\\$string\\['[A-Za-z0-9_:]+'\\] = '(?:[^'\\\\\\\\]|\\\\\\\\.)*';$/m", $langsrc, $singles);
$multiline = 0;
foreach ($singles[0] as $decl) {
    if (strpos($decl, "\n") !== false) {
        $multiline++;
    }
}
check(
    'no language string spans more than one physical line',
    $multiline === 0,
    $multiline . ' multi-line string(s) - use "\\n" in a double-quoted string instead');

// --- 6d. The section id character set agrees on both sides ----------------------------
//
// cc-state.js constrains ids at creation; evidence.php normalises them on the way back
// in. If the two character sets drift, a legitimate id stops resolving and the learner's
// answer cannot be graded.
// The two helpers share a CHARACTER CLASS but deliberately differ in what they do with a
// disallowed character, and conflating them is the bug this release fixed.
//
//   cc-state.js safeSectionId()      SUBSTITUTES an underscore. It mints a readable id at
//                                    creation time: "pc 1.1" becomes "pc_1_1".
//   evidence.php normalise_section_id() REMOVES it, because it has to mangle a string
//                                    exactly as clean_param(PARAM_ALPHANUMEXT) does in
//                                    order to match a legacy id back: "pc 1.1" -> "pc11".
//
// Section 7 below proves the behaviour. These two only guard the character class, which
// must stay identical in both or an id that is safe to mint becomes one that cannot be
// matched.
$state = file_get_contents('amd/src/cc-state.js');
$evidence = file_get_contents('classes/evidence.php');
check(
    'cc-state.js mints section ids from [A-Za-z0-9_-] by substitution',
    strpos($state, "replace(/[^A-Za-z0-9_-]+/g, '_')") !== false,
    'safeSectionId() has changed its character set or its substitution');
check(
    'evidence.php matches on the same class by removal, as the transport does',
    preg_match("/preg_replace\\('\\/\\[\\^A-Za-z0-9_-\\]\\/', *''/", $evidence) === 1,
    'normalise_section_id() no longer mirrors clean_param(PARAM_ALPHANUMEXT)');
// Anchored on the DECLARATION, not on the token appearing anywhere in the file. The
// first version of this check passed a mutation that changed the real parameter type,
// because the token it looked for was still sitting in a comment three lines above.
check(
    'check_answer declares its section id as PARAM_ALPHANUMEXT',
    preg_match(
        "/'sectionid'\s*=>\s*new external_value\(\s*PARAM_ALPHANUMEXT\s*,/",
        file_get_contents('classes/external/check_answer.php')
    ) === 1,
    'the section id parameter type no longer matches the character set ids are constrained to');

echo "\n7. Section id resolution - behaviour, against the real class\n";

// V15.5.2. Not static analysis: this loads \mod_contentcreator\evidence and runs its own
// resolver, because the thing that matters is whether a LEGACY manifest id survives the
// round trip through PARAM_ALPHANUMEXT - and the first version of it could not.
//
// normalise_section_id() has to mangle a string exactly the way clean_param() does for
// PARAM_ALPHANUMEXT, which REMOVES disallowed characters. The first version SUBSTITUTED an
// underscore, copying CcState.safeSectionId(). "pc 1.1" then normalised to "pc_1_1" on the
// server while the transport delivered "pc11": the comparison could never match, on
// exactly the manifests it was written to rescue.
//
// evidence.php's pure methods need no database, so it loads standalone.
if (!defined('MOODLE_INTERNAL')) {
    define('MOODLE_INTERNAL', true);
}
require_once(__DIR__ . '/../../classes/evidence.php');

/**
 * What Moodle's clean_param() does to a PARAM_ALPHANUMEXT value.
 *
 * @param string $p Raw parameter value.
 * @return string The value as execute() would receive it.
 */
function cc_transport(string $p): string {
    return preg_replace('/[^A-Za-z0-9_-]/i', '', $p);
}

/**
 * Build a one-topic manifest holding the given section ids.
 *
 * @param array $ids Section ids.
 * @return array A manifest.
 */
function cc_manifest(array $ids): array {
    $sections = [];
    foreach ($ids as $id) {
        $sections[] = ['id' => $id, 'cards' => []];
    }
    return ['topics' => [['id' => 't1', 'sections' => $sections]]];
}

$cases = [
    [['subtopic_0_1'], 'subtopic_0_1', 'subtopic_0_1', 'a modern id matches exactly'],
    [['subtopic_0_1'], 'subtopic_0_1_learning', 'subtopic_0_1', 'the challenge slide suffix is stripped'],
    [['pc 1.1'], 'pc 1.1', 'pc 1.1', 'a legacy id with a space and a dot still resolves'],
    [['PC-1.1', 'PC-1.2'], 'PC-1.2', 'PC-1.2', 'the right one of two legacy ids resolves'],
    [['a"b'], 'a"b', 'a"b', 'a legacy id containing a quote still resolves'],
    [['x.1', 'x 1'], 'x.1', '', 'two ids that normalise alike are REFUSED, not guessed'],
    [['subtopic_0_1'], 'nonexistent', '', 'an unknown section is refused'],
    [['subtopic_0_1'], '', '', 'an empty id is refused'],
    [[], 'anything', '', 'a manifest with no sections resolves nothing'],
];

$rtbad = [];
foreach ($cases as $c) {
    [$ids, $client, $want, $why] = $c;
    $got = \mod_contentcreator\evidence::resolve_section_id(cc_manifest($ids), cc_transport($client));
    if ($got !== $want) {
        $rtbad[] = $why . " (sent '$client', transport gave '" . cc_transport($client)
            . "', resolved '$got', expected '$want')";
    }
}
check(
    count($cases) . ' section id round-trips resolve correctly',
    empty($rtbad),
    implode("\n         ", $rtbad));

// The mangling must match the transport, not the client-side minting helper.
check(
    'normalise_section_id() removes disallowed characters rather than substituting',
    \mod_contentcreator\evidence::normalise_section_id('pc 1.1') === 'pc11',
    "got '" . \mod_contentcreator\evidence::normalise_section_id('pc 1.1')
        . "', expected 'pc11' - it must mirror clean_param(PARAM_ALPHANUMEXT)");

echo "\n8. The answer-key scrub is gone and must stay gone\n";

// V15.6.1 REVERT-CC-ANSWER-IN-DOM. V15.5.0 stripped the answer key out of what a learner
// received, which forced every answer through a web service call before the learner was
// told anything. The concealment bought little - the activity is unscored and the answer
// appears after one click either way - and it made a formative knowledge check fail
// closed on a bad network.
//
// Grading is local again, and it reads the answer key out of the manifest the player
// already holds. So a reinstated scrub would not merely restore the old trade-off, it
// would break every challenge on the site silently: ccGradeLocally() would find no
// correct option and return graded:false for every question, and nothing would say why.
// These checks exist so that reinstating it fails here instead.
require_once(__DIR__ . '/../../classes/manifest_storage.php');

$gmsrc = file_get_contents('classes/external/get_manifest.php');
$mssrc = file_get_contents('classes/manifest_storage.php');

check(
    'get_manifest does not strip the answer key',
    strpos($gmsrc, 'strip_answer_key') === false);
check(
    'get_manifest does not vary its payload by capability',
    strpos($gmsrc, '$isstaff') === false
    && strpos($gmsrc, ":manage'") === false);
check(
    'get_manifest returns the decompressed manifest unchanged',
    preg_match("/'manifest' => \\\$rawmanifest,/", $gmsrc) === 1);
check(
    'manifest_storage no longer defines the scrub helpers',
    !method_exists('\mod_contentcreator\manifest_storage', 'strip_answer_key')
    && strpos($mssrc, 'strip_question_answer_key') === false);
check(
    'manifest_storage still compresses and decompresses',
    method_exists('\mod_contentcreator\manifest_storage', 'decompress'));

// Completion did not move. The server still re-reads the stored manifest and decides for
// itself, so the evidence row stays unforgeable whatever the browser believes.
$casrc = file_get_contents('classes/external/check_answer.php');
check(
    'check_answer still resolves the correct option from the stored manifest',
    strpos($casrc, 'evidence::correct_index') !== false
    && strpos($casrc, 'evidence::record_answer') !== false);

echo "\n9. Server-side grading - every answer-key shape that exists in the wild\n";

/**
 * Wrap cards in a one-section manifest.
 *
 * @param string $id Section id.
 * @param array $cards Cards for that section.
 * @return array A manifest.
 */
function cc_sec(string $id, array $cards): array {
    return ['topics' => [['id' => 't1', 'sections' => [['id' => $id, 'cards' => $cards]]]]];
}

$shapes = [
    'per-option correct' => [cc_sec('s1', [['cardType' => 'decision-point', 'questions' => [
        ['question' => 'q', 'options' => [['text' => 'a'], ['text' => 'b', 'correct' => true], ['text' => 'c']]]]]]), 1],
    'per-option isCorrect' => [cc_sec('s1', [['cardType' => 'decision-point', 'questions' => [
        ['question' => 'q', 'options' => [['text' => 'a'], ['text' => 'b'], ['text' => 'c', 'isCorrect' => true]]]]]]), 2],
    'question-level correctIndex' => [cc_sec('s1', [['cardType' => 'decision-point', 'questions' => [
        ['question' => 'q', 'correctIndex' => 0, 'options' => [['text' => 'a'], ['text' => 'b']]]]]]), 0],
    'legacy single-question card' => [cc_sec('s1', [['cardType' => 'decision-point', 'question' => 'q',
        'options' => [['text' => 'a'], ['text' => 'b', 'correct' => true]]]]), 1],
];
$shapebad = [];
foreach ($shapes as $name => $pair) {
    [$m, $want] = $pair;
    $q = \mod_contentcreator\evidence::question_at($m, 's1', 0);
    $got = $q === null ? null : \mod_contentcreator\evidence::correct_index($q['options'], $q);
    if ($got !== $want) {
        $shapebad[] = "$name: resolved " . var_export($got, true) . ", expected $want";
    }
}
check(
    count($shapes) . ' answer-key shapes all resolve to the right option',
    empty($shapebad),
    implode("\n         ", $shapebad));

$nonemarked = cc_sec('s1', [['cardType' => 'decision-point', 'questions' => [
    ['question' => 'q', 'options' => [['text' => 'a'], ['text' => 'b']]]]]]);
$nq = \mod_contentcreator\evidence::question_at($nonemarked, 's1', 0);
check(
    'a question with nothing marked correct resolves to null, not option 0',
    \mod_contentcreator\evidence::correct_index($nq['options'], $nq) === null);
check(
    'a correctIndex past the end of the options is ignored',
    \mod_contentcreator\evidence::correct_index([['text' => 'a']], ['correctIndex' => 7]) === null);
check(
    'a question index past the end returns null',
    \mod_contentcreator\evidence::question_at($nonemarked, 's1', 9) === null);
check(
    'an unknown section returns null',
    \mod_contentcreator\evidence::question_at($nonemarked, 'nope', 0) === null);

// THE DEADLOCK. The player renders each decision-point card as its own challenge and
// numbers its questions from zero inside it. The first version of challenge_sections()
// accumulated across cards: a section with two cards of three questions demanded six
// answers that the learner could never supply, so the activity could never complete - and
// question 0 of the second card would have been graded against question 0 of the first.
$twocards = cc_sec('s1', [
    ['cardType' => 'decision-point', 'questions' => [
        ['question' => 'A1', 'options' => [['text' => 'a', 'correct' => true]]],
        ['question' => 'A2', 'options' => [['text' => 'a', 'correct' => true]]],
        ['question' => 'A3', 'options' => [['text' => 'a', 'correct' => true]]]]],
    ['cardType' => 'decision-point', 'questions' => [
        ['question' => 'B1', 'options' => [['text' => 'b', 'correct' => true]]],
        ['question' => 'B2', 'options' => [['text' => 'b', 'correct' => true]]],
        ['question' => 'B3', 'options' => [['text' => 'b', 'correct' => true]]]]],
]);
check(
    'two challenge cards require 3 answers, not 6 - the completion deadlock',
    (\mod_contentcreator\evidence::challenge_sections($twocards)['s1'] ?? 0) === 3,
    'required ' . (\mod_contentcreator\evidence::challenge_sections($twocards)['s1'] ?? 0)
        . ' answers, which a learner could never supply');
check(
    'question 0 is the first card\'s, matching what the player rendered',
    (\mod_contentcreator\evidence::question_at($twocards, 's1', 0)['question'] ?? '') === 'A1');
check(
    'an index past the first card is out of range rather than the second card\'s',
    \mod_contentcreator\evidence::question_at($twocards, 's1', 3) === null);

$disabled = cc_sec('s1', [['cardType' => 'decision-point', 'questions' => [
    ['question' => 'q', 'options' => [['text' => 'a', 'correct' => true]]]]]]);
$disabled['activitySettings'] = ['enabled' => false];
check(
    'challenges switched off require no answers at all',
    \mod_contentcreator\evidence::challenge_sections($disabled) === []);

echo "\n10. The answer tally - the arithmetic completion depends on\n";

// V15.5.4. evidence::apply_answer() decides whether a learner's challenge can ever be
// completed. Three of its rules are only obvious once written down, and none of them had
// a test.
$tallybad = [];

/**
 * Assert one tally outcome.
 *
 * @param string $why What is being checked.
 * @param array $got The result of apply_answer().
 * @param int $answered Expected answered count.
 * @param int $correct Expected correct count.
 * @return void
 */
function cc_tally(string $why, array $got, int $answered, int $correct): void {
    global $tallybad;
    if ($got['answered'] !== $answered || $got['correct'] !== $correct) {
        $tallybad[] = "$why: got {$got['answered']}/{$got['correct']}, expected $answered/$correct";
    }
}

$a = \mod_contentcreator\evidence::apply_answer(null, 0, true, 3);
cc_tally('first answer', $a, 1, 1);
$a = \mod_contentcreator\evidence::apply_answer($a['mask'], 1, false, 3);
cc_tally('second answer, wrong', $a, 2, 1);
$a = \mod_contentcreator\evidence::apply_answer($a['mask'], 2, true, 3);
cc_tally('third answer completes the challenge', $a, 3, 2);

// Re-answering REPLACES. Without this, answered climbs past total and the comparison in
// all_challenges_answered() would pass for the wrong reason.
$b = \mod_contentcreator\evidence::apply_answer($a['mask'], 1, true, 3);
cc_tally('re-answering replaces rather than accumulating', $b, 3, 3);
$b = \mod_contentcreator\evidence::apply_answer($b['mask'], 1, false, 3);
cc_tally('and can downgrade the same question again', $b, 3, 2);
check(
    'the tally is correct across a full challenge, including re-answers',
    empty($tallybad),
    implode("\n         ", $tallybad));

// The invariant completion rests on.
$spam = null;
for ($i = 0; $i < 20; $i++) {
    $spam = \mod_contentcreator\evidence::apply_answer($spam, $i, true, 3)['mask'];
}
$spamfinal = \mod_contentcreator\evidence::apply_answer($spam, 0, true, 3);
check(
    'questionsanswered can never exceed questiontotal, however many answers arrive',
    $spamfinal['answered'] === 3,
    'twenty answers to a three-question challenge tallied ' . $spamfinal['answered']);

// An author edits a five-question challenge down to three. Answers to the questions that
// no longer exist must not hold the learner at 5-of-3 forever.
$five = null;
for ($i = 0; $i < 5; $i++) {
    $five = \mod_contentcreator\evidence::apply_answer($five, $i, true, 5)['mask'];
}
$shrunk = \mod_contentcreator\evidence::apply_answer($five, 0, true, 3);
check(
    'answers to questions an author has since deleted are dropped, not carried',
    $shrunk['answered'] === 3 && count((array)json_decode($shrunk['mask'], true)) === 3,
    'tallied ' . $shrunk['answered'] . ' against a total of 3 - the learner would be stuck');

$defensive = [
    'a corrupt mask' => \mod_contentcreator\evidence::apply_answer('not json', 0, true, 3)['answered'] === 1,
    'a mask that decodes to a scalar' => \mod_contentcreator\evidence::apply_answer('42', 0, true, 3)['answered'] === 1,
    'an empty mask' => \mod_contentcreator\evidence::apply_answer('', 0, false, 3)['answered'] === 1,
    'a negative question index' => \mod_contentcreator\evidence::apply_answer(null, -1, true, 3)['answered'] === 0,
    'an index equal to the total' => \mod_contentcreator\evidence::apply_answer(null, 3, true, 3)['answered'] === 0,
    'a zero total' => \mod_contentcreator\evidence::apply_answer(null, 0, true, 0)['answered'] === 0,
];
$defbad = array_keys(array_filter($defensive, function ($v) {
    return !$v;
}));
check(
    count($defensive) . ' malformed inputs are handled rather than fatal',
    empty($defbad),
    'mishandled: ' . implode(', ', $defbad));

// The mask must survive json_decode(..., true) as an array with its keys intact.
$sparse = \mod_contentcreator\evidence::apply_answer(null, 2, true, 3);
$sparse = \mod_contentcreator\evidence::apply_answer($sparse['mask'], 0, false, 3);
$decoded = json_decode($sparse['mask'], true);
check(
    'a sparse mask round-trips with its keys, rather than collapsing to a list',
    is_array($decoded) && ($decoded['0'] ?? null) === 0 && ($decoded['2'] ?? null) === 1,
    $sparse['mask']);

echo "\n11. Nothing anywhere still calls the removed scrub\n";

// The helpers were public and lived on a class half the plugin includes. A call left
// behind in a route that is only exercised on a live site would be a fatal error the
// tests would never see, so sweep the whole tree rather than the two files that used it.
$scrubcallers = [];
$sweep = new RecursiveIteratorIterator(new RecursiveDirectoryIterator('.'));
foreach ($sweep as $f) {
    if (!$f->isFile()) {
        continue;
    }
    $path = $f->getPathname();
    if (!preg_match('/\.(php|js)$/', $path) || strpos($path, '/amd/build/') !== false) {
        continue;
    }
    // The test tree names the removed helpers on purpose - the checks above, and the
    // JS suite that asserts get_manifest has not started stripping again. What matters
    // is that no shipped code calls them.
    if (strpos($path, '/tests/') !== false) {
        continue;
    }
    $body = file_get_contents($path);
    if (preg_match('/strip_answer_key|strip_question_answer_key/', $body)) {
        $scrubcallers[] = $path;
    }
}
check(
    'no file references strip_answer_key() or strip_question_answer_key()',
    empty($scrubcallers),
    implode(', ', $scrubcallers));

echo "\n12. Backup covers every evidence column\n";

// A column missing from the backup element is dropped silently on a course copy, and
// nobody finds out until a restored learner's completion is recomputed from rows that are
// short a field.
$evstart = strpos($xmlsrc ?? ($xmlsrc = file_get_contents('db/install.xml')),
    '<TABLE NAME="contentcreator_evidence"');
$evblock = substr($xmlsrc, $evstart, strpos($xmlsrc, '</TABLE>', $evstart) - $evstart);
preg_match_all('/<FIELD NAME="([^"]+)"/', $evblock, $evm);
$evcolumns = array_values(array_diff($evm[1], ['id']));

$bksrc = file_get_contents('backup/moodle2/backup_contentcreator_stepslib.php');
$bkstart = strpos($bksrc, "\$evidence = new backup_nested_element(");
$bkblock = substr($bksrc, $bkstart, strpos($bksrc, ');', strpos($bksrc, '[', $bkstart)) - $bkstart);
preg_match_all("/'([a-z]+)',/", $bkblock, $bkm);
$bkfields = array_values(array_diff($bkm[1], ['evidence', 'id']));

check(
    'every evidence column appears in the backup element',
    empty(array_diff($evcolumns, $bkfields)),
    'missing: ' . implode(', ', array_diff($evcolumns, $bkfields)));
check(
    'the backup element declares no field that is not a column',
    empty(array_diff($bkfields, $evcolumns)),
    'phantom: ' . implode(', ', array_diff($bkfields, $evcolumns)));

$rssrc = file_get_contents('backup/moodle2/restore_contentcreator_stepslib.php');
$rshandler = strpos($rssrc, 'function process_contentcreator_evidence') === false ? ''
    : substr($rssrc, strpos($rssrc, 'function process_contentcreator_evidence'), 600);
check(
    'the restore handler remaps cmid, remaps userid and discards the old primary key',
    strpos($rssrc, "'/activity/contentcreator/evidences/evidence'") !== false
    && strpos($rshandler, '$data->cmid = $this->task->get_moduleid();') !== false
    && strpos($rshandler, "get_mappingid('user', \$data->userid)") !== false
    && strpos($rshandler, 'unset($data->id);') !== false,
    'a restored row would carry the SOURCE course module id or the source user id');
check(
    'userid is annotated, so the users are included in the backup file',
    strpos($bksrc, "\$evidence->annotate_ids('user', 'userid');") !== false);

echo "\n13. The on-demand gate - learners may not spend site credits, at all\n";

// V15.6.0. This gate has been narrowed twice and both earlier positions were wrong in the
// same direction - each made it EASIER to turn off something that should never have been
// on, while leaving it on by default:
//
//   before v13.85  gated on :view alone; every enrolled learner could spend
//   v13.85         added the capability, granted to student so nothing changed
//   v15.5.0        added a site switch in front of it, defaulting to on
//   v15.6.0        staff only, structurally, with no setting to get wrong
//
// The stubs are guarded so this file stays inert if it is ever loaded where Moodle's own
// functions already exist.
if (!function_exists('has_capability')) {
    /**
     * Stand in for Moodle's has_capability().
     *
     * @param string $cap Capability name.
     * @param mixed $context Ignored.
     * @return bool Whether the harness granted it.
     */
    function has_capability($cap, $context = null) {
        global $ccfakecaps;
        return !empty($ccfakecaps[$cap]);
    }
}
if (!class_exists('moodle_exception')) {
    /**
     * Stand in for Moodle's moodle_exception.
     */
    class moodle_exception extends Exception {
        /**
         * Construct with a language string key.
         *
         * @param string $key Language string key.
         * @param string $component Component name.
         */
        public function __construct($key, $component = '') {
            parent::__construct($key);
        }
    }
}
if (!class_exists('context')) {
    /**
     * Stand in for Moodle's context base class.
     */
    class context {
    }
}

require_once(__DIR__ . '/../../classes/ondemand.php');

/**
 * Run the gate with a given set of capabilities.
 *
 * @param array $caps Capabilities the user holds.
 * @return string 'allowed' or 'refused'.
 */
function cc_gate(array $caps): string {
    global $ccfakecaps;
    $ccfakecaps = $caps;
    try {
        \mod_contentcreator\ondemand::require_can_generate(new context());
        return 'allowed';
    } catch (Exception $e) {
        return 'refused';
    }
}

$ondemand = 'mod/contentcreator:generateondemand';
$gatecases = [
    'a learner holding the capability is REFUSED anyway' => [cc_gate([$ondemand => true]), 'refused'],
    'a learner holding nothing is refused' => [cc_gate([]), 'refused'],
    'an editing teacher is allowed' => [
        cc_gate([$ondemand => true, 'mod/contentcreator:manage' => true]), 'allowed'],
    'a non-editing teacher is allowed, via :review' => [
        cc_gate([$ondemand => true, 'mod/contentcreator:review' => true]), 'allowed'],
    'a manager is allowed' => [
        cc_gate([$ondemand => true, 'mod/contentcreator:manage' => true, 'mod/contentcreator:review' => true]),
        'allowed'],
    'staff WITHOUT the capability are still refused, so a site can prohibit it' => [
        cc_gate(['mod/contentcreator:manage' => true]), 'refused'],
    'a reviewer without the capability is refused' => [
        cc_gate(['mod/contentcreator:review' => true]), 'refused'],
];
$gatebad = [];
foreach ($gatecases as $why => $pair) {
    if ($pair[0] !== $pair[1]) {
        $gatebad[] = "$why: got {$pair[0]}, expected {$pair[1]}";
    }
}
check(
    count($gatecases) . ' on-demand gate outcomes are correct',
    empty($gatebad),
    implode("\n         ", $gatebad));

// The point of v15.6.0: being staff is required structurally, not by configuration. If
// can_generate() ever stops consulting :manage/:review, granting the capability to the
// student role would put learners back on the paid balance.
check(
    'the gate requires staff, not merely the capability',
    strpos(file_get_contents(__DIR__ . '/../../classes/ondemand.php'), 'mod/contentcreator:manage') !== false
    && strpos(file_get_contents(__DIR__ . '/../../classes/ondemand.php'), 'mod/contentcreator:review') !== false,
    'can_generate() no longer checks for staff');

// The setting is gone and must not come back by accident.
$noswitch = strpos(file_get_contents(__DIR__ . '/../../settings.php'), 'learnerondemand') === false
    && strpos(file_get_contents(__DIR__ . '/../../classes/ondemand.php'), 'learnerondemand') === false;
check(
    'no site setting can re-enable learner generation',
    $noswitch,
    'learnerondemand is referenced again - it was removed in v15.6.0 on purpose');

// The student archetype must not appear on the capability, or a FRESH install would grant
// it again - and the Define Roles screen would imply learners can do something they cannot.
$accessrc = file_get_contents(__DIR__ . '/../../db/access.php');
$capblock = substr(
    $accessrc,
    strpos($accessrc, "'mod/contentcreator:generateondemand'"),
    400
);
check(
    'student is not among the generateondemand archetypes',
    strpos($capblock, "'student'") === false,
    'a fresh install would grant learners a capability they cannot use');

// And an EXISTING site must have it taken away, because an archetype default is only
// applied when the capability is first installed.
$upsrc = file_get_contents(__DIR__ . '/../../db/upgrade.php');
check(
    'the upgrade revokes the capability from the student role on existing sites',
    strpos($upsrc, "unassign_capability('mod/contentcreator:generateondemand'") !== false
    && strpos($upsrc, "'archetype' => 'student'") !== false,
    'sites upgrading from v15.5.x would keep the stale grant on the Define Roles screen');
check(
    'the upgrade also clears the removed setting out of the config table',
    strpos($upsrc, "unset_config('learnerondemand', 'mod_contentcreator')") !== false);

echo "\n14. Whole-plugin integrity - not just the code this release touched\n";

// V15.5.5. Everything above grew out of a specific defect. These are a sweep of the plugin
// as a whole, and the first one found a live bug on its first run: two declarations of
// errorsectionnotfound, the later silently overriding the earlier, so a learner hitting a
// missing section got a message written for a teacher editing a slide.

// --- 14a. Duplicate language keys -----------------------------------------------------
$langall = file_get_contents('lang/en/contentcreator.php');
preg_match_all("/^\\\$string\\['([A-Za-z0-9_:]+)'\\]/m", $langall, $keym);
$keycounts = array_count_values($keym[1]);
$dupekeys = [];
foreach ($keycounts as $k => $c) {
    if ($c > 1) {
        $dupekeys[] = "$k (x$c)";
    }
}
check(
    count($keym[1]) . ' language keys, none declared twice',
    empty($dupekeys),
    'a later declaration silently overrides the earlier one: ' . implode(', ', $dupekeys));

// --- 14b. Web service classes exist and are complete -----------------------------------
$svsrc = file_get_contents('db/services.php');
preg_match_all("/'classname' => '([^']+)'/", $svsrc, $clsm);
$wsbad = [];
foreach ($clsm[1] as $cls) {
    $rel = str_replace(['mod_contentcreator\\', '\\'], ['classes/', '/'], $cls) . '.php';
    if (!file_exists($rel)) {
        $wsbad[] = "$cls: no file at $rel";
        continue;
    }
    $body = file_get_contents($rel);
    foreach (['execute', 'execute_parameters', 'execute_returns'] as $fn) {
        if (strpos($body, "function $fn(") === false) {
            $wsbad[] = "$cls: missing $fn()";
        }
    }
}
check(
    count($clsm[1]) . ' web service classes exist and declare all three required methods',
    empty($wsbad),
    implode("\n         ", $wsbad));

// --- 14c. Every table touched in PHP is declared ---------------------------------------
preg_match_all('/<TABLE NAME="([^"]+)"/', file_get_contents('db/install.xml'), $tabm);
$phpblob = '';
foreach (plugin_php_files() as $f) {
    $phpblob .= file_get_contents($f) . "\n";
}
preg_match_all(
    "/(?:get_record|get_records|insert_record|update_record|delete_records|get_field|set_field"
        . "|delete_records_select|get_records_select|count_records|record_exists)\\(\\s*'(contentcreator[a-z_]*)'/",
    $phpblob,
    $usem
);
$undeclaredtables = array_diff(array_unique($usem[1]), $tabm[1]);
check(
    count(array_unique($usem[1])) . ' tables are read or written in PHP, all declared in install.xml',
    empty($undeclaredtables),
    'not in install.xml: ' . implode(', ', $undeclaredtables));

// --- 14d. Every AMD module referenced by name exists ------------------------------------
$jsblob = '';
foreach (glob('amd/src/*.js') as $f) {
    $jsblob .= file_get_contents($f) . "\n";
}
foreach (['view.php', 'index.php'] as $f) {
    if (file_exists($f)) {
        $jsblob .= file_get_contents($f) . "\n";
    }
}
preg_match_all("~'mod_contentcreator/([A-Za-z0-9_.\\-/]+)'~", $jsblob, $amdm);
$missingmods = [];
foreach (array_unique($amdm[1]) as $mod) {
    if (substr($mod, -1) === '.' || substr($mod, -1) === '/') {
        continue;
    }
    if (!file_exists("amd/src/$mod.js")) {
        $missingmods[] = $mod;
    }
}
check(
    count(array_unique($amdm[1])) . ' AMD module references all resolve to a source file',
    empty($missingmods),
    'referenced but absent: ' . implode(', ', $missingmods));

// --- 14e. Source and build are in step --------------------------------------------------
$srcnames = array_map(function ($p2) {
    return basename($p2, '.js');
}, glob('amd/src/*.js'));
$buildnames = array_map(function ($p2) {
    return basename($p2, '.min.js');
}, glob('amd/build/*.min.js'));
check(
    count($srcnames) . ' modules have both a source and a build, with nothing orphaned either way',
    empty(array_diff($buildnames, $srcnames)) && empty(array_diff($srcnames, $buildnames)),
    'built with no source: ' . implode(', ', array_diff($buildnames, $srcnames))
        . '; source with no build: ' . implode(', ', array_diff($srcnames, $buildnames)));

// --- 14f. Capabilities have language strings --------------------------------------------
preg_match_all("/'(mod\\/contentcreator:[a-z]+)'\\s*=>/", file_get_contents('db/access.php'), $capdecl);
$capnostring = [];
foreach (array_unique($capdecl[1]) as $c) {
    $key = 'contentcreator:' . substr($c, strrpos($c, ':') + 1);
    if (strpos($langall, "\$string['$key']") === false) {
        $capnostring[] = $c;
    }
}
check(
    count(array_unique($capdecl[1])) . ' capabilities all have a language string',
    empty($capnostring),
    'a missing one shows the raw key in Define Roles: ' . implode(', ', $capnostring));

echo "\n" . ($failures ? "FAILED $failures of $checks" : "PASSED all $checks static checks") . "\n";
exit($failures ? 1 : 0);
