/* eslint-env node */
/**
 * Grunt configuration for mod_contentcreator.
 *
 * Mirrors the behaviour of Moodle core's `grunt amd` task for a standalone
 * plugin checkout: every module under amd/src is transpiled with Babel,
 * given its canonical AMD module name, minified with Terser, and written to
 * amd/build/<name>.min.js alongside a source map.
 *
 * Usage:
 *   npm install
 *   npx grunt amd      # build every module
 *   npx grunt eslint   # lint amd/src
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const COMPONENT = 'mod_contentcreator';
const SRCDIR = path.join(__dirname, 'amd', 'src');
const BUILDDIR = path.join(__dirname, 'amd', 'build');

/**
 * Recursively collect every .js file under a directory.
 *
 * @param {String} dir Directory to walk.
 * @param {String} [prefix] Relative prefix accumulated so far.
 * @return {Array} Relative paths, posix separated.
 */
function collect(dir, prefix) {
    prefix = prefix || '';
    let found = [];
    fs.readdirSync(dir, {withFileTypes: true}).forEach((entry) => {
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            found = found.concat(collect(path.join(dir, entry.name), rel));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            found.push(rel);
        }
    });
    return found;
}

/**
 * Insert the canonical module name as the first argument of a bare define().
 *
 * Sources use an anonymous define(), per Moodle convention. The built file
 * must be named so it can be concatenated and cached by the AMD loader.
 *
 * @param {String} code Transpiled module source.
 * @param {String} modulename Canonical name, e.g. mod_contentcreator/player5.
 * @return {String} Source with the module name applied.
 */
function nameModule(code, modulename) {
    const named = code.replace(
        /\bdefine\s*\(\s*(\[|function\b)/,
        'define("' + modulename + '", $1'
    );
    if (named === code) {
        throw new Error('No define() call found to name in ' + modulename);
    }
    return named;
}

module.exports = function(grunt) {
    grunt.registerTask('amd', 'Transpile and minify the AMD modules.', async function() {
        const done = this.async();
        const babel = require('@babel/core');
        const terser = require('terser');

        const modules = collect(SRCDIR);
        let built = 0;

        try {
            for (const rel of modules) {
                const modulename = COMPONENT + '/' + rel.replace(/\.js$/, '');
                const source = fs.readFileSync(path.join(SRCDIR, rel), 'utf8');

                const transpiled = babel.transformSync(source, {
                    filename: rel,
                    babelrc: false,
                    configFile: false,
                    compact: false,
                    presets: [[require.resolve('@babel/preset-env'), {
                        modules: false,
                        bugfixes: true,
                        // Explicit floor rather than the package browserslist.
                        // Safari 12 predates optional chaining and nullish
                        // coalescing, which forces Babel to actually lower
                        // that syntax instead of emitting it verbatim.
                        targets: {
                            chrome: '64',
                            firefox: '60',
                            safari: '12',
                            edge: '79',
                        },
                    }]],
                });

                const named = nameModule(transpiled.code, modulename);
                const outfile = rel.replace(/\.js$/, '.min.js');

                const minified = await terser.minify({[outfile]: named}, {
                    ecma: 5,
                    sourceMap: {
                        filename: path.basename(outfile),
                        url: path.basename(outfile) + '.map',
                    },
                    format: {comments: false},
                });

                const target = path.join(BUILDDIR, outfile);
                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, minified.code);
                fs.writeFileSync(target + '.map', minified.map);
                built++;
                grunt.log.ok(modulename);
            }
            grunt.log.writeln('Built ' + built + ' module(s).');
            done();
        } catch (err) {
            grunt.log.error(err.message);
            done(false);
        }
    });

    grunt.registerTask('eslint', 'Lint the AMD sources.', function() {
        const done = this.async();
        const {execFile} = require('child_process');
        execFile('npx', ['eslint', 'amd/src'], {cwd: __dirname}, (err, stdout) => {
            if (stdout) {
                grunt.log.writeln(stdout);
            }
            done(!err);
        });
    });

    // v15.1.1 FIX-CC-CI-GRUNT-STYLELINT.
    //
    // `moodle-plugin-ci grunt` asks grunt for the task list a plugin needs - for this
    // plugin, `amd` then `stylelint`. Because the plugin ships this Gruntfile, grunt
    // resolves it in preference to Moodle's, and a task grunt cannot find is fatal:
    //
    //     Warning: Task "stylelint" not found. Use --force to continue.
    //     Aborted due to warnings.
    //
    // That is what failed every job of the v15.1.0 CI run, after the `amd` task above
    // had already completed successfully. It had been failing on every release before
    // that too - the workflow carried `continue-on-error: true` on the Grunt step until
    // the ci.yml rewrite between v13.97.1 and v15.1.0 removed it.
    //
    // WHAT THIS TASK DELIBERATELY DOES NOT DO. Moodle's stylelint target globs a
    // component's root `styles.css`. This plugin has no root styles.css - its CSS lives
    // in styles/*.css - so Moodle's own stylelint reports "Linted 0 files without
    // errors" against this plugin. Verified directly by running Moodle 4.5's grunt
    // against a staged copy of this plugin. This task therefore matches that scope
    // exactly, so the check reaches the same verdict Moodle's would.
    //
    // Pointing stylelint at styles/*.css instead would NOT be a like-for-like check: run
    // with Moodle's own .stylelintrc it reports 4,610 problems, overwhelmingly
    // whitespace/brace formatting plus declaration-no-important. Cleaning that up is a
    // real piece of work and belongs with the wider Moodle-compliance track (the
    // 6,102 eslint findings in amd/src, the ajax.php router, Mustache adoption), not
    // smuggled into a patch release. It is recorded here so the gap is visible in the
    // code rather than only in a project doc.
    grunt.registerTask('stylelint', 'Lint CSS, matching Moodle\'s own component scope.', function() {
        const rootcss = path.join(__dirname, 'styles.css');
        if (!fs.existsSync(rootcss)) {
            grunt.log.ok('Linted 0 files without errors'
                + ' (no root styles.css - matches Moodle\'s stylelint scope for this plugin).');
            return true;
        }
        // A root styles.css has appeared, so this plugin is now inside Moodle's stylelint
        // scope and this task must not keep reporting a clean pass it did not earn. Fail
        // loudly with what to do, rather than shelling out to a stylelint that is not a
        // dependency of this package and would crash with an unrelated config error.
        grunt.fail.fatal('styles.css exists, so this plugin is now in Moodle\'s stylelint scope, '
            + 'but this Gruntfile has no real stylelint wired up. Add stylelint + Moodle\'s '
            + '.stylelintrc to devDependencies and lint it here before releasing.');
        return false;
    });

    grunt.registerTask('default', ['amd']);
};
