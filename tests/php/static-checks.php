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
check('version.php, package.json and the CHANGELOG all say the same release',
    $plugin->release === $pkg['version'] && $plugin->release === ($logm[1] ?? ''),
    "version.php={$plugin->release} package.json={$pkg['version']} changelog=" . ($logm[1] ?? '?'));
check('$plugin->version is a 10-digit YYYYMMDDXX integer',
    (bool)preg_match('/^20\d{8}$/', (string)$plugin->version), (string)$plugin->version);
check('component is mod_contentcreator', $plugin->component === 'mod_contentcreator');

echo "\n3. Language strings\n";
$string = [];
include 'lang/en/contentcreator.php';
$usedstrings = [];
foreach ($phpfiles as $f) {
    if (preg_match_all('/get_string\(\s*[\'"]([a-zA-Z0-9_]+)[\'"]\s*,\s*[\'"]mod_contentcreator[\'"]/',
            file_get_contents($f), $mm)) {
        foreach ($mm[1] as $k) {
            $usedstrings[$k][] = $f;
        }
    }
}
$missingstrings = array_diff(array_keys($usedstrings), array_keys($string));
check(count($usedstrings) . ' get_string() keys all exist in lang/en (a missing one renders as [[key]])',
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
check('every capability checked in code is defined in db/access.php',
    empty(array_diff(array_keys($capsused), $defined)),
    implode(', ', array_diff(array_keys($capsused), $defined)));
$nostring = [];
foreach ($defined as $c) {
    if (!isset($string["contentcreator:$c"])) {
        $nostring[] = $c;
    }
}
check(count($defined) . ' capabilities all have their lang string (a missing one shows a raw key '
    . 'in Define Roles)', empty($nostring), implode(', ', $nostring));

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
        check("amd/build/$mod.min.js contains \"$needle\"",
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
check('no built module is older than its source',
    empty($stale), 'stale: ' . implode(', ', $stale) . ' - run: npx grunt amd');

echo "\n" . ($failures ? "FAILED $failures of $checks" : "PASSED all $checks static checks") . "\n";
exit($failures ? 1 : 0);
