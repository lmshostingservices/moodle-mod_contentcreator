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

    grunt.registerTask('default', ['amd']);
};
