/**
 * v15.4.31 — the WAF / bot-challenge interstitial must be fatal, never transient.
 *
 * Reproduces the Octec outage of 17 Sep 2026: every request to ajax.php came back
 * HTTP 200 carrying a "One moment, please..." challenge page instead of JSON.
 * pollJob() counted each one as a transient failure, retried five times, then
 * abandoned a job that had already been submitted and charged.
 *
 * These tests exercise ccLooksLikeHtml() directly, because that predicate is what
 * decides retry-vs-fail. Extracted from amd/src/generator.js so the test cannot
 * drift from the shipped implementation.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'amd', 'src', 'generator.js');

/** Pull ccLooksLikeHtml out of generator.js without executing the whole module. */
function loadPredicate() {
    const src = fs.readFileSync(SRC, 'utf8');
    const start = src.indexOf('function ccLooksLikeHtml(');
    if (start === -1) { throw new Error('ccLooksLikeHtml() not found in generator.js'); }
    let i = src.indexOf('{', start);
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
        if (src[end] === '{') { depth++; }
        else if (src[end] === '}') { depth--; if (depth === 0) { end++; break; } }
    }
    // eslint-disable-next-line no-new-func
    return new Function(src.slice(start, end) + '; return ccLooksLikeHtml;')();
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
            src.indexOf('ccLooksLikeHtml(pollText)') !== -1]
    ];
    structural.forEach(function (s) {
        if (s[1]) { pass++; } else { failures.push({ name: s[0], err: 'not found in generator.js' }); }
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
