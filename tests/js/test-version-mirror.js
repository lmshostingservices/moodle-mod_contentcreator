// The release version is written by hand in four places. Three of them are invisible to
// the Moodle plugin readiness gate, and one of those - CC_VERSION in cc-state.js - has now
// silently frozen stale THREE times:
//
//   v13.94.3  left at '13.65' while the plugin shipped 13.94.x (29 releases stale)
//   v15.0.0   left at '13.94.8' from 13.95.0 through 15.0.0 (~20 releases stale)
//   v15.1.0   left at '15.0.0' - in the very release whose CHANGELOG entry claims
//             "it has now been bumped to match $plugin->release ... so it isn't missed
//             a third time". It was missed a third time, the same day, by the release
//             that announced the fix.
//
// Each time the response was a checklist item and a stern comment. That has now failed
// three times, which is enough evidence that manual sync discipline does not work here.
// This test makes the drift a build failure instead.
//
// Why it matters: CC_VERSION stamps manifest.builtWithVersion and drives builder.js's
// compareVersions() staleness check. Frozen, the "plugin updates available - apply them"
// panel silently stops offering itself to teachers whose modules predate the current
// release, and every console/support log misreports the running version.
//
//   node tests/js/test-version-mirror.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failures = 0;
const check = (label, actual, expected, detail) => {
    const ok = actual === expected;
    if (!ok) { failures++; }
    console.log(
        (ok ? '  PASS  ' : '  FAIL  ') + label.padEnd(46) +
        (ok ? String(actual) : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
    );
    if (!ok && detail) { console.log('        ' + detail); }
};

// version.php is the single source of truth - everything else must agree with it.
const versionPhp = read('version.php');
const release = (versionPhp.match(/\$plugin->release\s*=\s*'([^']+)'/) || [])[1];
const numeric = (versionPhp.match(/\$plugin->version\s*=\s*(\d+)/) || [])[1];

if (!release) {
    console.error('FATAL: could not read $plugin->release from version.php');
    process.exit(1);
}

console.log(`\nversion.php is the source of truth: release ${release}, version ${numeric}\n`);

// 1. The JS mirror the readiness gate cannot see. This is the one that keeps breaking.
const ccState = read('amd/src/cc-state.js');
const ccVersion = (ccState.match(/var\s+CC_VERSION\s*=\s*'([^']+)'/) || [])[1];
check('cc-state.js CC_VERSION', ccVersion, release,
    'Fix: amd/src/cc-state.js, the CC_VERSION constant.');

// 2. The BUILT bundle. Source can be right while the shipped artifact is stale, because
//    the ZIP carries amd/build, not amd/src - a correct fix that was never `grunt amd`-ed
//    still ships the old string to every site.
const built = read('amd/build/cc-state.min.js');
const builtHasRelease = built.indexOf('"' + release + '"') !== -1 ||
                        built.indexOf("'" + release + "'") !== -1;
check('amd/build/cc-state.min.js rebuilt', builtHasRelease, true,
    'The built bundle does not contain the release string. Run: npx grunt amd');

// 3. CHANGELOG's first heading. The readiness gate does check this one, but failing here
//    locally is cheaper than failing in the pipeline after a ZIP has been cut.
const changelog = read('CHANGELOG.md');
const firstHeading = (changelog.match(/^##\s+(\S+)/m) || [])[1];
check('CHANGELOG.md first ## heading', firstHeading, release,
    'Fix: add the release entry at the top of CHANGELOG.md.');

// 4. Numeric version must be a canonical 10-digit YYYYMMDDXX and move forward with the
//    release. The gate checks the format; it cannot tell that a bumped release string was
//    shipped with last release's numeric version, which would stop Moodle upgrading sites.
check('version.php numeric is 10 digits', /^\d{10}$/.test(numeric || ''), true,
    `Got ${JSON.stringify(numeric)} - must be YYYYMMDDXX.`);

// 5. No other hardcoded release-shaped literal in live (non-comment) JS. Catches a new
//    fourth mirror being introduced by hand somewhere else in the codebase.
const strayMirrors = [];
fs.readdirSync(path.join(ROOT, 'amd', 'src')).filter(f => f.endsWith('.js')).forEach(file => {
    read(path.join('amd', 'src', file)).split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        const m = code.match(/=\s*'(\d+\.\d+\.\d+)'\s*;/);
        if (m && m[1] !== release) {
            strayMirrors.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
    });
});
check('no stray hardcoded version assignments', strayMirrors.length, 0,
    strayMirrors.join('\n        '));

console.log('');
if (failures) {
    console.log(`FAIL: ${failures} version mirror(s) out of step with $plugin->release (${release}).`);
    console.log('These do not all fail the Moodle readiness gate - that is exactly why this test exists.');
    process.exit(1);
}
console.log(`PASS: every version mirror agrees with $plugin->release (${release}).`);
