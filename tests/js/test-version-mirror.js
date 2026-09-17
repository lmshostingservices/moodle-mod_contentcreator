/**
 * CC_VERSION must equal $plugin->release, exactly.
 *
 * This test exists because the constant has silently fallen behind FOUR times:
 *   v13.94.3  left at 13.65     for ~29 releases
 *   v15.0.0   left at 13.94.8   for ~20 releases
 *   v15.1.1   left at 15.0.0    for  1 release
 *   v15.4.31  left at 15.4.18   for 12 releases  <- confirmed against the live
 *                                                   Octec database, where six
 *                                                   manifests written on a
 *                                                   15.4.30 site carried
 *                                                   "builtWithVersion":"15.4.18"
 *
 * The v15.1.1 comment in cc-state.js states that this file makes a fourth
 * recurrence impossible. It did not, because the file was not in the shipped
 * package and `npm test` pointed at a runner that did not exist either. Both are
 * restored in v15.4.31.
 *
 * What the drift actually costs, which is why this is not cosmetic:
 *   - generator.js keys its system-prompt cache on CC_VERSION so that a
 *     regeneration cannot reuse a prompt built under an older release. Frozen,
 *     a pack regenerated on 15.4.30 can hit the prompt cached under 15.4.18 and
 *     silently lose twelve releases of prompt fixes, at full price.
 *   - builder.js stamps manifests with it and compares the stamp to decide
 *     whether to offer "this module was built with an older release, re-apply?".
 *     Frozen, compareVersions() returns 0 and the prompt never fires.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = function run() {
    const failures = [];
    let pass = 0;
    const total = 3;

    const state = fs.readFileSync(path.join(ROOT, 'amd/src/cc-state.js'), 'utf8');
    const version = fs.readFileSync(path.join(ROOT, 'version.php'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    const mState = state.match(/var\s+CC_VERSION\s*=\s*'([^']+)'/);
    const mRelease = version.match(/\$plugin->release\s*=\s*'([^']+)'/);

    if (!mState) { failures.push({ name: 'CC_VERSION found in cc-state.js', err: 'not found' }); }
    if (!mRelease) { failures.push({ name: '$plugin->release found in version.php', err: 'not found' }); }

    if (mState && mRelease) {
        if (mState[1] === mRelease[1]) {
            pass++;
        } else {
            failures.push({
                name: 'cc-state.js CC_VERSION === version.php $plugin->release',
                err: 'CC_VERSION is ' + mState[1] + ' but $plugin->release is ' + mRelease[1]
                   + ' — the prompt cache and the stale-build prompt both key off this'
            });
        }

        if (mState[1] === pkg.version) {
            pass++;
        } else {
            failures.push({
                name: 'cc-state.js CC_VERSION === package.json version',
                err: 'CC_VERSION is ' + mState[1] + ' but package.json says ' + pkg.version
            });
        }
    }

    // $plugin->version must be a 10-digit YYYYMMDDXX integer and must move with the
    // release, or Moodle will not run the upgrade.
    const mNum = version.match(/\$plugin->version\s*=\s*(\d+)/);
    if (mNum && /^\d{10}$/.test(mNum[1])) {
        pass++;
    } else {
        failures.push({
            name: '$plugin->version is a 10-digit YYYYMMDDXX integer',
            err: mNum ? 'got ' + mNum[1] : 'not found'
        });
    }

    return { name: 'CC_VERSION mirrors $plugin->release', pass: pass, total: total, failures: failures };
};

if (require.main === module) {
    const r = module.exports();
    r.failures.forEach(function (f) { console.log('  FAIL ' + f.name + '\n       ' + f.err); });
    console.log((r.failures.length ? 'FAILED ' : 'ok  ') + r.pass + '/' + r.total + ' ' + r.name);
    process.exit(r.failures.length ? 1 : 0);
}
