/**
 * v15.6.2 — HTTP 413 must be a named, fatal, operator-facing fault.
 *
 * The site that reported this saw "One or more cards failed generation - open the module
 * and check this topic" on a topic whose content was fine. Behind it: the web server
 * refused `generate_slide` with HTTP 413 and an empty body, because the request exceeded
 * its body limit. Empty is not HTML, so the v15.4.31 guard did not fire; it is not JSON
 * either, so the read threw a generic "response was not JSON" that nothing recognised as
 * fatal. The card retried at exactly the same size, three times, then the section fell
 * through to getFailedCardSequence().
 *
 * Three things were wrong and all three are asserted here:
 *   1. the fault was anonymous, when the status said precisely what it was;
 *   2. it was retried, when the retry sends a byte-for-byte identical request;
 *   3. it was reported as a CONTENT failure, sending the author to inspect a topic they
 *      cannot fix, instead of naming the web-server setting that would fix it.
 *
 * These run the shipped transportStatusError() and readJson() rather than describing them.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE = path.join(__dirname, '..', '..', 'amd', 'src', 'cc-state.js');

/** Lift transportStatusError and readJson out of cc-state.js without running the module. */
function load() {
    const src = fs.readFileSync(STATE, 'utf8');
    const grab = (name) => {
        // readJson is declared `async function`; grabbing from `function` would drop the
        // keyword and the extracted source would not parse.
        let start = src.indexOf('async function ' + name + '(');
        if (start === -1) { start = src.indexOf('function ' + name + '('); }
        if (start === -1) { throw new Error(name + '() not found in cc-state.js'); }
        let depth = 0;
        let end = src.indexOf('{', start);
        for (; end < src.length; end++) {
            if (src[end] === '{') { depth++; } else if (src[end] === '}') {
                depth--;
                if (depth === 0) { end++; break; }
            }
        }
        return src.slice(start, end);
    };
    const body = [grab('looksLikeHtml'), grab('htmlBodyError'), grab('transportStatusError'),
        grab('readJson')].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(body + '; return {transportStatusError: transportStatusError, readJson: readJson};')();
}

const { transportStatusError, readJson } = load();

/** A minimal stand-in for a fetch Response. */
function res(status, body) {
    return { status: status, ok: status >= 200 && status < 300, text: async () => body };
}

let failures = 0;
let checks = 0;
function ok(condition, label, detail) {
    checks++;
    if (!condition) {
        failures++;
        console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
    }
}

console.log('transport status faults');
console.log('');

// --- 1. The status codes that cannot be retried ----------------------------------
console.log('  fatal statuses');
[413, 401, 403, 404, 405, 431, 501].forEach(function (status) {
    const err = transportStatusError('generate_slide', status, '');
    ok(err.ccFatal === true, 'HTTP ' + status + ' is not marked fatal');
    ok(err.ccStatus === status, 'HTTP ' + status + ' does not carry its status');
    ok(/HTTP \d{3}/.test(err.message), 'HTTP ' + status + ' does not name the status');
    ok(err.message.indexOf('generate_slide') === 0, 'HTTP ' + status + ' does not say what failed');
});

// 413 is the one that happened, and its message has to be actionable by whoever reads it.
const e413 = transportStatusError('generate_slide', 413, '');
ok(/too large/.test(e413.message), 'the 413 message does not say the request was too large');
ok(/client_max_body_size/.test(e413.message), 'the 413 message does not name the nginx setting');
ok(/not a plugin fault/.test(e413.message), 'the 413 message does not say whose fault it is');
ok(/stopped rather than retried/.test(e413.message), 'the 413 message does not say it stopped');
ok(/The body was empty\.$/.test(e413.message), 'an empty body is not described as empty');

// --- 2. A status we have no advice for is reported, but not declared unretryable ---
console.log('  unknown statuses');
[500, 502, 503, 504, 429].forEach(function (status) {
    const err = transportStatusError('x', status, 'upstream timed out');
    ok(!err.ccFatal, 'HTTP ' + status + ' was wrongly marked fatal - it is worth retrying');
    ok(err.ccStatus === status, 'HTTP ' + status + ' does not carry its status');
});

// --- 3. readJson: the status only decides when the body is not JSON ---------------
console.log('  readJson');

(async function () {
    // A JSON error payload on a failed status must still be READ, not replaced by a
    // status error. pollJob() depends on exactly this - the server's own error text is
    // more useful than anything a status code can say.
    const jsonError = await readJson(res(400, '{"success":false,"error":"unit not found"}'), 'x');
    ok(jsonError.error === 'unit not found', 'a JSON error body on a failed status was discarded');

    const okBody = await readJson(res(200, '{"success":true}'), 'x');
    ok(okBody.success === true, 'a normal response no longer parses');

    // The reported failure: 413, empty body.
    let caught = null;
    try {
        await readJson(res(413, ''), 'generate_slide');
    } catch (e) { caught = e; }
    ok(caught !== null, 'an empty 413 body did not throw');
    ok(caught && caught.ccFatal === true, 'an empty 413 was not fatal, so it would be retried');
    ok(caught && /client_max_body_size/.test(caught.message), 'the 413 error is not actionable');

    // An HTML body still wins: it is more specific about what answered.
    let html = null;
    try {
        await readJson(res(413, '<!DOCTYPE html><html><body>Request Entity Too Large</body></html>'), 'x');
    } catch (e) { html = e; }
    ok(html && html.ccHtmlBody === true, 'an HTML 413 body lost its HTML classification');
    ok(html && html.ccFatal === true, 'an HTML 413 body is not fatal');

    // A 200 with a broken body is still a broken body, not a transport refusal - that
    // distinction is the whole reason the status is consulted in the catch and not before.
    let broken = null;
    try {
        await readJson(res(200, 'not json at all'), 'x');
    } catch (e) { broken = e; }
    ok(broken && broken.ccBadJson === true, 'a malformed 200 body is no longer reported as such');
    ok(broken && !broken.ccFatal, 'a malformed 200 body was wrongly made fatal');

    console.log('');
    if (failures) {
        console.log(failures + ' failure(s) across ' + checks + ' checks');
        process.exit(1);
    }
    console.log('PASS  ' + checks + ' checks');
    process.exit(0);
}());
