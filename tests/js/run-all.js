#!/usr/bin/env node
/**
 * mod_contentcreator — JavaScript test runner.
 *
 * `npm test` points here. Before v15.4.31 this file did not exist, so `npm test`
 * exited MODULE_NOT_FOUND and nothing ran — while comments across the codebase
 * asserted that particular tests made particular bugs impossible. Four of those
 * bugs then recurred. Any new guard belongs in this directory; it is picked up
 * automatically.
 *
 * Every tests/js/test-*.js is run as its own CHILD PROCESS. That is deliberate:
 * several suites call process.exit() at the end, so requiring them in-process
 * terminates the runner before it can report. A child also means one suite
 * cannot corrupt another through globals — these tests stub `define` and eval
 * AMD modules, which is exactly the kind of thing that leaks.
 *
 * Contract for a suite: print whatever you like, exit 0 on success and non-zero
 * on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const files = fs.readdirSync(DIR)
    .filter(function (f) { return /^test-.*\.js$/.test(f); })
    .sort();

if (!files.length) {
    console.error('No test-*.js suites found in ' + DIR);
    process.exit(1);
}

const quiet = process.argv.indexOf('--quiet') !== -1;

console.log('mod_contentcreator — running ' + files.length + ' suite(s)\n');

const failed = [];

files.forEach(function (f) {
    const res = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8' });
    const out = (res.stdout || '') + (res.stderr || '');
    const ok = res.status === 0;

    if (ok) {
        console.log('  PASS  ' + f);
        if (!quiet && out.trim()) {
            console.log(out.trim().split('\n').map(function (l) { return '        ' + l; }).join('\n'));
        }
    } else {
        failed.push(f);
        console.log('  FAIL  ' + f + (res.status === null ? '  (crashed)' : '  (exit ' + res.status + ')'));
        console.log(out.trim().split('\n').map(function (l) { return '        ' + l; }).join('\n'));
    }
});

console.log('');
console.log(files.length - failed.length + '/' + files.length + ' suite(s) passed');

if (failed.length) {
    console.log('FAILED: ' + failed.join(', '));
    process.exit(1);
}
console.log('All suites passed.');
