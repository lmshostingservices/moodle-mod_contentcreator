/**
 * v15.4.31 — the WAF / bot-challenge interstitial must be fatal, never transient.
 *
 * Reproduces the Octec outage of 17 Sep 2026: every request to ajax.php came back
 * HTTP 200 carrying a "One moment, please..." challenge page instead of JSON.
 * pollJob() counted each one as a transient failure, retried five times, then
 * abandoned a job that had already been submitted and charged.
 *
 * These tests exercise the predicate directly, because it is what decides
 * retry-vs-fail. Extracted from the shipped source so the test cannot drift from it.
 *
 * v15.5.1: the predicate moved to cc-state.js. It lived in generator.js as a private
 * copy, which is exactly why the VOICEOVER path in builder.js went three releases
 * without it - ten .json() calls with no guard, inside a three-attempt-per-card retry
 * loop. A live site answered every one of them with a bot-protection page and produced
 * forty identical parse errors and no diagnosis.
 *
 * So this file now also asserts that NEITHER builder.js NOR generator.js has grown a
 * private copy again. One predicate, in the module both of them already depend on.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const AMD = path.join(__dirname, '..', '..', 'amd', 'src');
const SRC = path.join(AMD, 'generator.js');
const STATE = path.join(AMD, 'cc-state.js');
const BUILDER = path.join(AMD, 'builder.js');
const PLAYER = path.join(AMD, 'player5.js');
const AJAX = path.join(__dirname, '..', '..', 'ajax.php');

/** Pull looksLikeHtml out of cc-state.js without executing the whole module. */
function loadPredicate() {
    const src = fs.readFileSync(STATE, 'utf8');
    const start = src.indexOf('function looksLikeHtml(');
    if (start === -1) { throw new Error('looksLikeHtml() not found in cc-state.js'); }
    let i = src.indexOf('{', start);
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
        if (src[end] === '{') { depth++; }
        else if (src[end] === '}') { depth--; if (depth === 0) { end++; break; } }
    }
    // eslint-disable-next-line no-new-func
    return new Function(src.slice(start, end) + '; return looksLikeHtml;')();
}

// The verbatim body Octec's server returned, truncated as it appeared in the console.
const WAF_CHALLENGE = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf8">\n'
    + '  <script>\n      (function(){\n          setTimeout(function(){\n'
    + '              window.location.reload();\n          }, 5000);\n      }())\n  </script>\n'
    + '  <title>One moment, please...</title>';

const cases = [
    // --- must be detected as HTML (fatal) ---
    { html: true,  name: 'the Octec WAF challenge page',        body: WAF_CHALLENGE },
    { html: true,  name: 'a doctype with a leading BOM',        body: '﻿<!DOCTYPE html><html></html>' },
    { html: true,  name: 'leading whitespace before doctype',   body: '\n\n   <!doctype HTML>' },
    { html: true,  name: 'a bare <html> with no doctype',       body: '<html><body>Access denied</body></html>' },
    { html: true,  name: 'a Moodle maintenance page',           body: '<!DOCTYPE html>\n<html><head><title>Site maintenance</title>' },
    { html: true,  name: 'an XML error document',               body: '<?xml version="1.0"?><error>blocked</error>' },

    // --- must NOT be detected as HTML (ordinary responses, and content containing markup) ---
    { html: false, name: 'a normal JSON success envelope',      body: '{"success":true,"content":"[]"}' },
    { html: false, name: 'a JSON error envelope',               body: '{"success":false,"error":"insufficient credits"}' },
    { html: false, name: 'a rate-limit envelope',               body: '{"success":false,"errorcode":"ratelimited","retryafter":740}' },
    { html: false, name: 'card content that CONTAINS html',     body: '{"content":"<p>You are on site</p><svg viewBox=\\"0 0 24 24\\"/>"}' },
    { html: false, name: 'a card whose text opens with a tag',  body: '{"cards":[{"text":"<!DOCTYPE is discussed in this lesson>"}]}' },
    { html: false, name: 'a JSON array',                        body: '[{"cardType":"hook-scenario"}]' },
    { html: false, name: 'an empty body',                       body: '' },
    { html: false, name: 'whitespace only',                     body: '   \n  ' }
];

/**
 * Every bare .json() left in amd/src, with its file and line.
 *
 * Written as a sweep rather than a per-file check because the defect this guards against
 * was precisely a file nobody thought to check: the guard existed, one module used it, and
 * the module that mattered did not.
 *
 * @returns {Array} Strings of the form "file:line", empty when the tree is clean.
 */
function bareJsonCalls() {
    const dir = path.join(__dirname, '..', '..', 'amd', 'src');
    const out = [];
    fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach(function (file) {
        let inBlock = false;
        fs.readFileSync(path.join(dir, file), 'utf8').split('\n').forEach(function (line, i) {
            // Comments describe the old behaviour at length in these files, and readJson's
            // own doc comment names response.json() in prose. Neither is a bare read, so
            // both line and block comments are stripped before the line is examined.
            let code = line;
            if (inBlock) {
                const close = code.indexOf('*/');
                if (close === -1) { return; }
                code = code.slice(close + 2);
                inBlock = false;
            }
            code = code.replace(/\/\*[\s\S]*?\*\//g, '');
            const open = code.indexOf('/*');
            if (open !== -1) { code = code.slice(0, open); inBlock = true; }
            code = code.replace(/\/\/.*$/, '');
            // readJson() itself must call response.text(), not .json().
            if (/\breadJson\b/.test(code)) { return; }
            if (/[\w$)]\s*\.json\(\)/.test(code)) { out.push(file + ':' + (i + 1)); }
        });
    });
    return out;
}

module.exports = function run() {
    const looksLikeHtml = loadPredicate();
    let pass = 0;
    const failures = [];
    cases.forEach(function (c) {
        const got = looksLikeHtml(c.body) === true;
        if (got === c.html) { pass++; }
        else {
            failures.push({
                name: c.name,
                err: 'expected ' + (c.html ? 'HTML (fatal)' : 'not HTML (parse as JSON)')
                   + ', got ' + (got ? 'HTML' : 'not HTML')
            });
        }
    });

    // The class the retry ladders check by type rather than by message wording.
    const src = fs.readFileSync(SRC, 'utf8');
    const stateSrc = fs.readFileSync(STATE, 'utf8');
    const builderSrc = fs.readFileSync(BUILDER, 'utf8');
    const playerSrc = fs.readFileSync(PLAYER, 'utf8');

    const structural = [
        ['CcFatalTransportError is defined', src.indexOf('function CcFatalTransportError(') !== -1],
        ['it carries the ccFatal marker', /this\.ccFatal\s*=\s*true/.test(src)],
        ['pollJob re-throws it without counting a retry',
            /if \(pollErr instanceof CcFatalTransportError\) \{ throw pollErr; \}/.test(src)],
        ['callAI\'s catch re-throws it by type, not by message',
            /if \(error && error\.ccFatal\) \{ throw error; \}/.test(src)],
        ['the submit path checks the body before JSON.parse',
            src.indexOf('ccLooksLikeHtml(rawText)') !== -1],
        ['the poll path checks the body before JSON.parse',
            src.indexOf('ccLooksLikeHtml(pollText)') !== -1],

        // v15.5.1: one predicate, not two. A private copy in either module is how the
        // voiceover path missed the v15.4.31 fix entirely.
        ['generator.js uses the shared predicate rather than a private copy',
            src.indexOf('var ccLooksLikeHtml = CcState.looksLikeHtml;') !== -1
            && src.indexOf('function ccLooksLikeHtml(') === -1],
        ['cc-state.js exports it',
            fs.readFileSync(STATE, 'utf8').indexOf('looksLikeHtml: looksLikeHtml,') !== -1],
        ['builder.js has no private copy either',
            fs.readFileSync(BUILDER, 'utf8').indexOf('function ccLooksLikeHtml(') === -1],

        // The voiceover path is the one that was exposed. Every JSON read in builder.js
        // must go through the shared reader.
        ['builder.js reads responses through CcState.readJson',
            fs.readFileSync(BUILDER, 'utf8').indexOf('CcState.readJson(') !== -1],
        ['no bare response.json() is left in builder.js',
            (fs.readFileSync(BUILDER, 'utf8').match(/await\s+\w*[Rr]esp\w*\.json\(\)/g) || []).length === 0],

        // v15.6.0: a permission refusal is the OTHER kind of permanent fault. A learner may
        // not originate a credit-spending call, and ajax.php answers one with
        // {success:false, staffonly:true}. The preload treats a failed generate_voice as a
        // soft failure and routes it into a three-attempt retry ladder, so a refusal handled
        // like a transient fault costs three requests per card per learner and ends with the
        // card marked FAILED rather than simply silent.
        ['the player can recognise a permission refusal',
            fs.readFileSync(PLAYER, 'utf8').indexOf('const ccIsStaffOnlyRefusal =') !== -1],
        ['it keys on the staffonly flag, not on message wording',
            /data\.staffonly === true/.test(fs.readFileSync(PLAYER, 'utf8'))],
        ['all three generate_voice handlers check it before retrying or failing',
            (fs.readFileSync(PLAYER, 'utf8').match(/ccIsStaffOnlyRefusal\(data\)/g) || []).length === 3],
        ['ajax.php sends the flag rather than letting the exception escape',
            fs.readFileSync(AJAX, 'utf8').indexOf("['staffonly' => true]") !== -1],

        // v15.6.2 FIX-CC-413-LOOKS-LIKE-A-CONTENT-FAILURE.
        //
        // v15.5.1 put the HTML guard in cc-state.js so that BOTH callers could use it, then
        // routed builder.js through it and left vendorFetch() - the generator's own
        // transport - reading raw. Every "Unexpected token '<'" a generation produced came
        // through that one line, and an HTTP 413 with an empty body came through it as a
        // generic parse failure that nothing recognised as fatal: retried three times at the
        // same size, then turned into "One or more cards failed generation - open the module
        // and check this topic" on a topic whose content was never the problem.
        //
        // So the rule is now the whole plugin, not one module: NO raw .json() anywhere.
        ['vendorFetch reads through readJson',
            /'The request to ' \+ endpoint\);/.test(stateSrc)
            && stateSrc.indexOf("return readJson(response, 'The request to ' + endpoint);") !== -1],
        ['vendorUpload reads through readJson',
            stateSrc.indexOf("return readJson(response, 'The upload to ' + endpoint);") !== -1],
        ['player5.js reads through CcState.readJson',
            (playerSrc.match(/CcState\.readJson\(/g) || []).length >= 9],
        ['no bare .json() survives anywhere in amd/src',
            bareJsonCalls().length === 0, bareJsonCalls().join(', ')],

        // The named statuses. Retrying any of them sends the identical request again.
        ['413 is named, and named as a web-server limit rather than a plugin fault',
            /413: 'the request was rejected as too large/.test(stateSrc)
            && /client_max_body_size/.test(stateSrc)],
        ['the status error is only consulted when the body is not JSON',
            /if \(!response\.ok\) \{\s*\n\s*throw transportStatusError/.test(stateSrc)],

        // The builder retried a fatal error three times per card, because its loops only
        // knew about ccRateLimited. That is where forty identical parse errors in one
        // console came from.
        ['the builder has a fatal-transport flag',
            builderSrc.indexOf('var _voFatal = null;') !== -1],
        ['all three voiceover retry loops honour ccFatal',
            (builderSrc.match(/\.ccFatal\) \{/g) || []).length === 3],
        ['a fatal transport error stops new work being enqueued',
            (builderSrc.match(/&& !_voFatal\)/g) || []).length >= 3],
        ['and is reported once, with the fix, rather than per card',
            builderSrc.indexOf('PRE-GEN STOPPED  -  the request was ') !== -1]
    ];
    structural.forEach(function (s) {
        if (s[1]) { pass++; } else { failures.push({ name: s[0], err: s[2] || 'not found' }); }
    });

    return {
        name: 'transport faults are fatal, not transient',
        pass: pass,
        total: cases.length + structural.length,
        failures: failures
    };
};

if (require.main === module) {
    const r = module.exports();
    r.failures.forEach(function (f) { console.log('  FAIL ' + f.name + ' [' + f.err + ']'); });
    console.log((r.failures.length ? 'FAILED ' : 'ok  ') + r.pass + '/' + r.total + ' ' + r.name);
    process.exit(r.failures.length ? 1 : 0);
}
