/**
 * v15.6.3 — the failure report, in a real browser.
 *
 * What it replaces: a red "Needs review" badge and the sentence "One or more cards failed
 * generation - open the module and check this topic". That was the entirety of what an
 * author was told, for every cause. A web-server refusal, a firewall page, a rate limit, a
 * vendor timeout and a genuinely malformed card all produced the same six words - and only
 * the last of them is something an author can act on by opening the module.
 *
 * Two behaviours are asserted here and neither can be proven by reading the source:
 *
 *   1. A SALVAGED section passes. `needsReview` marks cards that exhausted their attempts
 *      but carry their full content; since v15.3.18 the salvage is refused outright if any
 *      card in the section is empty, so a salvaged section has a complete, renderable set
 *      by construction. It is ready to show, so it shows, with no badge and no popup.
 *   2. A PLACEHOLDER card opens the report by itself, names the cause in plain English,
 *      quotes the underlying message verbatim, and says what to do about it.
 *
 * The functions are lifted out of the shipped builder.js and run against real DOM, so the
 * markup, the escaping and the wiring are exercised rather than described.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const playwright = require('playwright');

const root = path.join(__dirname, '..', '..');
const builder = fs.readFileSync(path.join(root, 'amd', 'src', 'builder.js'), 'utf8');
const lang = fs.readFileSync(path.join(root, 'lang', 'en', 'contentcreator.php'), 'utf8');

let failures = 0;
let checks = 0;
function check(label, condition, detail) {
    checks++;
    if (condition) {
        console.log('  ok   ' + label);
    } else {
        failures++;
        console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
    }
}

/** Lift an arrow-function const out of builder.js by name, brace-matched. */
function lift(name) {
    const start = builder.indexOf('const ' + name + ' = (');
    if (start === -1) { throw new Error(name + ' not found in builder.js'); }
    let depth = 0;
    let i = builder.indexOf('{', start);
    let end = i;
    for (; end < builder.length; end++) {
        if (builder[end] === '{') { depth++; } else if (builder[end] === '}') {
            depth--;
            if (depth === 0) { end++; break; }
        }
    }
    return builder.slice(start, end) + ';';
}

// The real English strings, so a key that resolves to nothing shows up as blank text in
// the assertions below rather than passing on a stub.
const strings = {};
const langRe = /\$string\['([A-Za-z0-9_]+)'\]\s*=\s*'((?:[^'\\]|\\.)*)'/g;
let lm;
while ((lm = langRe.exec(lang)) !== null) {
    strings[lm[1]] = lm[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

const harness = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<style>
/* tokens.css declares the dark values on .contentcreator-container, NOT on :root. The
   harness reproduces exactly that, because it is the reason the panel needed the fix:
   anything hung off document.body resolves the light values. */
:root {
    --cc-bg: hsl(0 0% 100%); --cc-bg-subtle: hsl(0 0% 96%);
    --cc-fg: hsl(0 0% 9%); --cc-fg-muted: hsl(0 0% 40%);
    --cc-border: hsl(0 0% 89%); --cc-radius: 8px; --cc-primary: hsl(210deg 91% 60%);
}
.contentcreator-container.cc-dark {
    --cc-bg: hsl(0 0% 7%); --cc-bg-subtle: hsl(0 0% 11%);
    --cc-fg: hsl(0 0% 98%); --cc-fg-muted: hsl(217 8% 65%);
    --cc-border: hsl(0 0% 18%);
}
</style>
<div id="container" class="contentcreator-container"></div>
<script>
var STRINGS = ${JSON.stringify(strings)};
function s(key) { return STRINGS[key] === undefined ? key : STRINGS[key]; }
function escapeHtml(v) {
    return String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
var copied = null;
function copyViaTextarea(text, done) { copied = text; if (done) { done(); } }
// The handler prefers navigator.clipboard and falls back to the textarea. Headless
// Chromium resolves writeText without a permission prompt, so BOTH paths are recorded
// here - the assertion is about the text produced, not about which route carried it.
try {
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {writeText: function(t) { copied = t; return Promise.resolve(); }}
    });
} catch (e) { /* If it cannot be overridden, the textarea fallback still records. */ }
var CcState = {CC_VERSION: '15.6.5'};
function ccWarn() {}
var container = document.getElementById('container');
${lift('ccCollectTopicProblems')}
${lift('ccClassifyFailure')}
${lift('ccShowFailureReport')}
window.ccCollectTopicProblems = ccCollectTopicProblems;
window.ccClassifyFailure = ccClassifyFailure;
window.ccShowFailureReport = ccShowFailureReport;
window.__copied = function() { return copied; };
</script>
</body></html>`;

// A section that was SALVAGED: every card has content, the section failed a structural
// assertion, and the cards are flagged needsReview. Nothing here is broken for a learner.
const salvagedTopic = {
    title: 'Element 1: Identify health and safety legislative requirements',
    sections: [{
        id: 'subtopic_0_1',
        title: 'PC 1.1',
        cards: [
            { cardType: 'hook-scenario', keyTakeaway: 'Stay behind the barrier.' },
            { cardType: 'concept-explainer', needsReview: true, failed: false,
                qualityAction: 'STRUCTURAL_REVIEW',
                failureReason: 'Structural validation failed after 2 attempt(s): mental-model has 2 steps' },
            { cardType: 'decision-point', needsReview: true, failed: false }
        ]
    }]
};

// A section that FAILED: placeholder cards, which a learner sees.
const failedTopic = {
    title: 'Element 2: Identify construction hazards and control measures',
    sections: [{
        id: 'subtopic_0_2',
        title: 'PC 2.1',
        cards: [
            { cardType: 'hook-scenario', failed: true, qualityAction: 'FAILED',
                failureReason: 'The request to generate_slide: HTTP 413 - the request was '
                    + 'rejected as too large before it reached Moodle. This is a web-server '
                    + 'limit, not a plugin fault: raise the request body limit (nginx '
                    + '`client_max_body_size`, or LimitRequestBody on Apache) to at least '
                    + '24m and reload.' },
            { cardType: 'concept-explainer', failed: true, qualityAction: 'FAILED',
                failureReason: 'Structural validation failed after 2 attempt(s): card count 5, expected 7' }
        ]
    }]
};

(async function () {
    const tmp = path.join(os.tmpdir(), 'cc-fail-report-' + process.pid + '.html');
    fs.writeFileSync(tmp, harness);
    // A pinned chromium may live under any of these; fall back to whatever playwright
    // manages itself. A missing browser SKIPS - it must never look like a pass.
    const candidates = (fs.readdirSync('/opt/pw-browsers').filter(function (d) {
        return /^chromium(-\d+)?$/.test(d);
    }) || []).map(function (d) { return '/opt/pw-browsers/' + d + '/chrome-linux/chrome'; })
        .filter(function (c) { return fs.existsSync(c); });
    let browser = null;
    for (let i = 0; i < candidates.length && !browser; i++) {
        browser = await playwright.chromium.launch({ executablePath: candidates[i] })
            .catch(function () { return null; });
    }
    if (!browser) { browser = await playwright.chromium.launch().catch(function () { return null; }); }
    if (!browser) {
        console.log('SKIP: no chromium available to launch - runtime checks not run');
        fs.unlinkSync(tmp);
        process.exit(0);
    }
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('file://' + tmp);

    console.log('failure report');
    console.log('');

    console.log('1. A salvaged section is ready to show, so nothing is reported');
    const salvaged = await page.evaluate((t) => window.ccCollectTopicProblems(t), salvagedTopic);
    check('a needsReview card is not collected as a problem',
        salvaged.length === 0, JSON.stringify(salvaged));

    await page.evaluate((t) => window.ccShowFailureReport([
        { title: t.title, pass: true, problems: window.ccCollectTopicProblems(t) }
    ]), salvagedTopic);
    check('...and no popup opens for it',
        (await page.locator('#cc-fail-report').count()) === 0);

    console.log('');
    console.log('2. A placeholder card is reported, in detail');
    const failed = await page.evaluate((t) => window.ccCollectTopicProblems(t), failedTopic);
    check('both placeholder cards are collected', failed.length === 2, JSON.stringify(failed));
    check('each carries its section, card type and reason',
        failed.every((p) => p.section === 'PC 2.1' && p.cardType && p.reason),
        JSON.stringify(failed));

    await page.evaluate((t) => window.ccShowFailureReport([
        { title: t.title, pass: false, problems: window.ccCollectTopicProblems(t) }
    ]), failedTopic);
    check('the popup opened', (await page.locator('#cc-fail-report').count()) === 1);
    check('it is a modal dialog for assistive technology',
        (await page.getAttribute('#cc-fail-report', 'role')) === 'dialog'
        && (await page.getAttribute('#cc-fail-report', 'aria-modal')) === 'true');

    const text = await page.textContent('#cc-fail-report');
    check('it names the topic', /Element 2/.test(text));
    check('it names the section and the card', /PC 2\.1/.test(text) && /hook-scenario/.test(text));

    // The whole point: the CAUSE in plain English, not the same sentence for everything.
    check('the 413 is described as a refusal before Moodle, in plain English',
        /refused before it reached Moodle/.test(text), text.slice(0, 400));
    check('...and the remedy names the web-server setting',
        /client_max_body_size/.test(text));
    check('...and says it is not a fault in the module',
        /not a fault in this module/i.test(text));

    // Two different causes in one topic must not collapse into one message.
    check('the structural failure is described differently from the transport one',
        /incomplete or the wrong shape/.test(text), text.slice(0, 600));

    check('the underlying message is quoted verbatim for a support ticket',
        /HTTP 413/.test(text) && /card count 5, expected 7/.test(text));

    console.log('');
    console.log('3. It behaves like a dialog');
    const copyText = await page.evaluate(async () => {
        document.querySelector('#cc-fail-copy').click();
        // writeText resolves on a microtask; let it land before reading.
        await Promise.resolve();
        return window.__copied();
    });
    check('Copy report produces plain text carrying both reasons',
        copyText && /HTTP 413/.test(copyText) && /card count 5/.test(copyText),
        String(copyText).slice(0, 200));
    check('...and stamps the plugin version, so a pasted report identifies the build',
        copyText && copyText.indexOf('15.6.5') !== -1);

    await page.click('#cc-fail-dismiss');
    check('it closes', (await page.locator('#cc-fail-report').count()) === 0);

    // Reopening must not stack a second copy on top of the first.
    await page.evaluate((t) => {
        const r = [{ title: t.title, pass: false, problems: window.ccCollectTopicProblems(t) }];
        window.ccShowFailureReport(r);
        window.ccShowFailureReport(r);
    }, failedTopic);
    check('opening it twice leaves exactly one dialog',
        (await page.locator('#cc-fail-report').count()) === 1);

    await page.keyboard.press('Escape');
    check('Escape closes it', (await page.locator('#cc-fail-report').count()) === 0);

    console.log('');
    console.log('4. Untrusted text is escaped');
    // Every one of these payloads must be inert. An injected <script> is NOT a valid
    // probe - innerHTML never executes one, so a test using it passes even with the
    // escaping removed. That mistake was in this file until a mutation run caught it.
    // These use img/onerror, which innerHTML does fire.
    //
    // The reason field matters most: it is the only one carrying text the plugin did not
    // write, straight from a server the site does not control.
    await page.evaluate(() => {
        window.ccShowFailureReport([{
            title: '<img src=x onerror="window.__xssTitle=1">',
            pass: false,
            problems: [{
                section: '<img src=x onerror="window.__xssSection=1">',
                cardType: '<img src=x onerror="window.__xssCard=1">',
                reason: '<img src=x onerror="window.__xssReason=1">'
            }]
        }]);
    });
    const xss = await page.evaluate(() => ({
        title: window.__xssTitle, section: window.__xssSection,
        card: window.__xssCard, reason: window.__xssReason,
        imgs: document.querySelectorAll('#cc-fail-report img').length
    }));
    check('a topic title carrying markup does not execute', xss.title === undefined);
    check('a section name carrying markup does not execute', xss.section === undefined);
    check('a card type carrying markup does not execute', xss.card === undefined);
    check('the server-supplied reason carrying markup does not execute',
        xss.reason === undefined);
    check('no element was created from any of them', xss.imgs === 0, JSON.stringify(xss));
    check('...and they are shown as text rather than rendered',
        (await page.textContent('#cc-fail-report')).indexOf('<img src=x') !== -1);

    console.log('');
    console.log('5. It carries the theme, because it lives outside the themed container');
    // tokens.css declares dark mode on .contentcreator-container and its siblings, never
    // on :root. A fixed overlay has to hang off document.body to sit above everything, so
    // it resolves the LIGHT values - a white panel with black text on a dark page, which
    // is the first thing an author would see after a failed build.
    const themed = await page.evaluate(() => {
        document.getElementById('container').classList.add('cc-dark');
        window.ccShowFailureReport([{
            title: 'T', pass: false,
            problems: [{ section: 'S', cardType: 'c', reason: 'HTTP 413' }]
        }]);
        const panel = document.getElementById('cc-fail-report');
        const container = document.getElementById('container');
        const read = (el, t) => window.getComputedStyle(el).getPropertyValue(t).trim();
        return {
            panelBg: read(panel, '--cc-bg'),
            containerBg: read(container, '--cc-bg'),
            panelFg: read(panel, '--cc-fg'),
            containerFg: read(container, '--cc-fg'),
            bodyBg: read(document.body, '--cc-bg')
        };
    });
    check('the harness really does scope dark to the container, as tokens.css does',
        themed.bodyBg !== themed.containerBg,
        JSON.stringify(themed) + ' - if these match, this test proves nothing');
    check('the panel resolves the CONTAINER\'s background, not the page default',
        themed.panelBg === themed.containerBg, JSON.stringify(themed));
    check('...and its foreground too', themed.panelFg === themed.containerFg,
        JSON.stringify(themed));
    await page.evaluate(() => {
        document.getElementById('cc-fail-dismiss').click();
        document.getElementById('container').classList.remove('cc-dark');
    });

    console.log('');
    console.log('6. It cleans up after itself, and keeps focus');
    // The keydown listener used to be removed only when Escape fired. Closing with the
    // button left it on document, holding a closure over the whole problem list, and every
    // reopen added another.
    const listeners = await page.evaluate(() => {
        let live = 0;
        const realAdd = document.addEventListener.bind(document);
        const realRemove = document.removeEventListener.bind(document);
        document.addEventListener = function (type) {
            if (type === 'keydown') { live++; }
            return realAdd.apply(document, arguments);
        };
        document.removeEventListener = function (type) {
            if (type === 'keydown') { live--; }
            return realRemove.apply(document, arguments);
        };
        const rs = [{ title: 'T', pass: false,
            problems: [{ section: 'S', cardType: 'c', reason: 'x' }] }];
        for (let i = 0; i < 5; i++) {
            window.ccShowFailureReport(rs);
            document.getElementById('cc-fail-dismiss').click();
        }
        document.addEventListener = realAdd;
        document.removeEventListener = realRemove;
        return live;
    });
    check('closing by button removes the key listener, five opens later',
        listeners === 0, 'listeners still attached: ' + listeners);

    // aria-modal="true" asserts the rest of the page is inert. Tab must not leave.
    const trapped = await page.evaluate(async () => {
        window.ccShowFailureReport([{ title: 'T', pass: false,
            problems: [{ section: 'S', cardType: 'c', reason: 'x' }] }]);
        const panel = document.getElementById('cc-fail-report');
        const buttons = panel.querySelectorAll('button');
        buttons[buttons.length - 1].focus();
        const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        buttons[buttons.length - 1].dispatchEvent(ev);
        return {
            prevented: ev.defaultPrevented,
            wrappedToFirst: document.activeElement === buttons[0],
            inside: panel.contains(document.activeElement)
        };
    });
    check('Tab off the last control wraps back into the dialog',
        trapped.prevented && trapped.wrappedToFirst && trapped.inside,
        JSON.stringify(trapped));

    // Closing must hand focus back to whatever opened it.
    const returned = await page.evaluate(() => {
        document.getElementById('cc-fail-dismiss').click();
        const badge = document.createElement('button');
        badge.id = 'opener';
        document.getElementById('container').appendChild(badge);
        badge.focus();
        window.ccShowFailureReport([{ title: 'T', pass: false,
            problems: [{ section: 'S', cardType: 'c', reason: 'x' }] }]);
        document.getElementById('cc-fail-dismiss').click();
        return document.activeElement && document.activeElement.id;
    });
    check('closing returns focus to whatever opened it', returned === 'opener',
        'focus landed on: ' + returned);

    console.log('');
    check('no JavaScript error was thrown across the whole run',
        pageErrors.length === 0, pageErrors.join('\n'));

    await browser.close();
    fs.unlinkSync(tmp);

    console.log('');
    if (failures) {
        console.log('FAILED ' + failures + ' of ' + checks + ' runtime checks');
        process.exit(1);
    }
    console.log('PASSED all ' + checks + ' runtime checks');
    process.exit(0);
}());
