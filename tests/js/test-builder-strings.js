/**
 * Every s('key') the builder renders must be prefetched and must exist in lang/en.
 *
 * v15.4.5 shipped a whole block of Policy labels that rendered as their own raw keys
 * ("msgpolicydetails" on screen where a label belonged), because the strings were
 * declared in lang/en and used by s() but never added to builder.js's prefetch list.
 * The CHANGELOG for that release says this suite exists. It did not. It does now.
 *
 * Three things have to line up for a string to render:
 *   1. s('key') is called somewhere in builder.js
 *   2. 'key' is in the prefetch array at the top of builder.js
 *   3. $string['key'] is defined in lang/en/contentcreator.php
 *
 * A key that is missing from 2 renders as the JS fallback if there is one, or as the
 * bare key if there is not. A key missing from 3 renders as the bare key on any site
 * whose language pack does not carry it.
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
const lang = fs.readFileSync(path.join(root, 'lang', 'en', 'contentcreator.php'), 'utf8');

let failures = 0;
let checks = 0;

function fail(message) {
    failures++;
    console.log('  FAIL  ' + message);
}

// Keys actually rendered: s('msgfoo') and s("msgfoo").
const used = new Set();
const useRe = /\bs\(\s*'([A-Za-z0-9_]+)'\s*\)|\bs\(\s*"([A-Za-z0-9_]+)"\s*\)/g;
let m;
while ((m = useRe.exec(builder)) !== null) {
    used.add(m[1] || m[2]);
}

// The prefetch array, read between its declaration and its closing bracket. Matching
// on a trailing comma alone would miss the last entry, which is exactly the entry a
// careless edit is most likely to get wrong - msgphuniexample sat there when this
// suite was written.
const arraystart = builder.indexOf('const CC_MESSAGE_KEYS = [');
if (arraystart === -1) {
    fail('CC_MESSAGE_KEYS array not found in builder.js');
}
const arrayend = builder.indexOf('];', arraystart);
const header = arraystart === -1 ? '' : builder.slice(arraystart, arrayend);
const prefetched = new Set();
const preRe = /'([A-Za-z0-9_]+)'/g;
while ((m = preRe.exec(header)) !== null) {
    prefetched.add(m[1]);
}

// Strings defined in lang/en.
const declared = new Set();
const langRe = /\$string\['([A-Za-z0-9_:]+)'\]/g;
while ((m = langRe.exec(lang)) !== null) {
    declared.add(m[1]);
}

console.log('builder string coverage');
console.log('  s() keys rendered:   ' + used.size);
console.log('  keys prefetched:     ' + prefetched.size);
console.log('  strings in lang/en:  ' + declared.size);
console.log('');

const missingprefetch = [];
const missinglang = [];

used.forEach(function(key) {
    checks += 2;
    if (!prefetched.has(key)) {
        missingprefetch.push(key);
    }
    if (!declared.has(key)) {
        missinglang.push(key);
    }
});

if (missingprefetch.length) {
    fail(missingprefetch.length + ' key(s) used by s() but not in the prefetch list: '
        + missingprefetch.sort().join(', '));
}
if (missinglang.length) {
    fail(missinglang.length + ' key(s) used by s() but not declared in lang/en: '
        + missinglang.sort().join(', '));
}

// The v15.5.0 "tailor it" example must be present for all seven routes, because the
// two shared panels pick their example by route and a missing one falls through to
// another route's subject matter, which is worse than showing nothing.
// renderTailorExample() resolves its two keys through s() at call time, so they reach
// the language layer as arguments rather than as literal s('...') calls and the scan
// above cannot see them. Check the call sites, and check the language layer directly.
const TAILOR_ROUTES = ['vet', 'wp', 'policy', 'uni', 'pd', 'general', 'topicstext'];

['msgtailortitle', 'msgtailorintro', 'msgtailorcopy', 'msgtailorcopied']
    .forEach(function(key) {
        checks++;
        if (!used.has(key)) {
            fail(key + ' is declared but never rendered');
        }
    });

TAILOR_ROUTES.forEach(function(route) {
    const body = 'msgtailor' + route;
    const lead = 'msgtailorlead' + route;

    checks++;
    if (builder.indexOf("renderTailorExample('" + lead + "', '" + body + "'") === -1) {
        fail('route ' + route + ' has no renderTailorExample call, so its panel would '
            + 'show another route\'s brief or nothing at all');
    }

    [body, lead].forEach(function(key) {
        checks++;
        if (!prefetched.has(key)) {
            fail(key + ' is not in the prefetch list');
        }
        checks++;
        if (!declared.has(key)) {
            fail(key + ' is not declared in lang/en');
        }
    });

    // The brief is newline-separated and rendered as a list. One line means someone has
    // flattened it back to a sentence and the bullets have silently gone.
    //
    // v15.5.2: the declaration is now a DOUBLE-quoted single-line string carrying "\n"
    // escapes. It used to be a single-quoted string containing literal newlines, which is
    // valid PHP and works at runtime, but AMOS and every lang-file parser expect one
    // string per line. Both spellings are read here so this suite is not the thing that
    // stops someone reverting, and the line count is taken from whichever it finds.
    checks++;
    const dq = lang.match(new RegExp('\\$string\\[\'' + body + '\'\\] = "((?:[^"\\\\]|\\\\.)*)";', 'm'));
    const sq = lang.match(new RegExp('\\$string\\[\'' + body + '\'\\] = \'([\\s\\S]*?)\';\\n', 'm'));
    let lineCount = 0;
    if (dq) {
        lineCount = dq[1].split('\\n').filter(Boolean).length;
    } else if (sq) {
        lineCount = sq[1].split('\n').filter(Boolean).length;
    }
    if (!dq && !sq) {
        fail(body + ' could not be read back from lang/en');
    } else if (lineCount < 8) {
        fail(body + ' has ' + lineCount + ' lines; the per-route brief has been truncated');
    }
});

// Both shared panels must branch, or a route silently shows its neighbour's brief.
checks++;
if (!/selectedMode === 'policy'\s*\n?\s*\? renderTailorExample\('msgtailorleadpolicy'/.test(builder)) {
    fail('workplace panel does not branch to the policy brief');
}
checks++;
if (!/selectedMode === 'general'\s*\n?\s*\? renderTailorExample\('msgtailorleadgeneral'/.test(builder)
    || !/selectedMode === 'topicstext'\s*\n?\s*\? renderTailorExample\('msgtailorleadtopicstext'/.test(builder)) {
    fail('pd panel does not branch to the general and topicstext briefs');
}

console.log('');
if (failures) {
    console.log(failures + ' failure(s) across ' + checks + ' checks');
    process.exit(1);
}
console.log('PASS  ' + checks + ' checks');
process.exit(0);
