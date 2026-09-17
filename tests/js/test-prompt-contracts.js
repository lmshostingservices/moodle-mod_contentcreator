/**
 * v15.4.31 — the prompt must not contradict the spec tables it ships with.
 *
 * Each block below fails against 15.4.30. These are the contradictions that make a
 * route unsatisfiable, and an unsatisfiable instruction is how the 4 September
 * General outage began.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function loadPrompts() {
    const stub = { createLogger: () => ({ warn() {}, log() {}, error() {} }) };
    let mod;
    global.define = function (deps, factory) { mod = factory(stub, stub, stub); };
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(ROOT, 'amd/src/prompts.js'), 'utf8'));
    delete global.define;
    return mod;
}

function loadLegislation() {
    let mod;
    global.define = function (deps, factory) { mod = factory(); };
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(ROOT, 'amd/src/legislation.js'), 'utf8'));
    delete global.define;
    return mod;
}

module.exports = function run() {
    const P = loadPrompts();
    const L = loadLegislation();
    const src = fs.readFileSync(path.join(ROOT, 'amd/src/prompts.js'), 'utf8');
    const failures = [];
    let pass = 0;
    const check = function (name, ok, err) {
        if (ok) { pass++; } else { failures.push({ name: name, err: err || 'failed' }); }
    };

    // -----------------------------------------------------------------------
    // 1. No route may state a whole-card word band its own field specs cannot
    //    produce. VET/Workplace stated 180-310 while mental-model is 332-584 —
    //    its MINIMUM 22 words above the stated ceiling.
    // -----------------------------------------------------------------------
    check('no hardcoded whole-card word band survives in any prompt',
        !/Written to spec a card lands between \d+ and \d+ words/.test(src),
        'a hand-typed band is back; it will drift from CC_FIELD_SPECS again');

    ['vet', 'workplace', 'pd', 'university', 'general', 'policy'].forEach(function (mode) {
        const prompt = P.getFiveCardSystemPromptForMode(mode);
        const types = P.getCardSchemaForMode(mode).cardTypes;
        types.forEach(function (ct) {
            const r = P.getCardWordRange(mode, ct);
            if (!r) { return; }
            // The rendered budget line must quote the real derived totals.
            check(mode + '/' + ct + ' total is stated in the prompt',
                prompt.indexOf(ct + ': ' + r.min + '-' + r.max + ' words') !== -1,
                'prompt does not carry the derived total ' + r.min + '-' + r.max);
        });
    });

    // -----------------------------------------------------------------------
    // 2. The card count a prompt asks for must equal what validation expects.
    //    General asked for 6 twice while everything else expected 7, so every
    //    General section failed the count and bought a billed repair.
    //    Vendor contract 2026-09-05.2 confirms General is 7.
    // -----------------------------------------------------------------------
    [['vet', 7], ['workplace', 7], ['pd', 7], ['university', 7], ['general', 7], ['policy', 6]]
        .forEach(function (pair) {
            const mode = pair[0];
            const n = pair[1];
            check(mode + ' schema length is ' + n,
                P.getCardSchemaForMode(mode).cardTypes.length === n,
                'got ' + P.getCardSchemaForMode(mode).cardTypes.length);
            check(mode + ' getCardCountForMode is ' + n,
                P.getCardCountForMode(mode) === n,
                'got ' + P.getCardCountForMode(mode));
            const prompt = P.getFiveCardSystemPromptForMode(mode);
            const m = prompt.match(/exactly (\d+) cards/);
            check(mode + ' prompt asks for exactly ' + n + ' cards',
                !!m && Number(m[1]) === n,
                m ? 'prompt asks for ' + m[1] : 'no card count in the prompt');
        });

    // -----------------------------------------------------------------------
    // 3. Topics and Text is content-driven: its schema must name the card types
    //    it actually emits, and positional backfill must never run for it.
    // -----------------------------------------------------------------------
    const tt = P.getCardSchemaForMode('topicstext').cardTypes;
    check('topicstext schema names the live card types',
        tt.indexOf('subtopic') !== -1 && tt.indexOf('decision-point') !== -1,
        'got ' + tt.join(', '));
    check('topicstext schema does not lead with the retired four-slot shape',
        tt[0] === 'subtopic', 'first type is ' + tt[0]);

    const twoCards = P.normalizeCards([{ paragraphs: ['a'] }, { paragraphs: ['b'] }], { mode: 'topicstext' });
    check('a 2-card topicstext pack is NOT stamped positionally',
        !twoCards[0].cardType && !twoCards[1].cardType,
        'got ' + twoCards.map(function (c) { return c.cardType || '(none)'; }).join(', '));

    const vet7 = P.normalizeCards([{}, {}, {}, {}, {}, {}, {}], { mode: 'vet' });
    check('a 7-card vet pack IS still stamped positionally',
        vet7[0].cardType === 'hook-scenario' && vet7[6].cardType === 'decision-point',
        'got ' + vet7.map(function (c) { return c.cardType; }).join(', '));

    // -----------------------------------------------------------------------
    // 4. Jurisdiction. 'GB' is what the country dropdown emits; the pack is
    //    keyed 'UK'. The old fallback handed those courses Australian WHS and
    //    RTO Standards and labelled the block "(Australia)".
    // -----------------------------------------------------------------------
    const ukBlock = L.buildPromptInjection('GB', null, 'content');
    check('GB resolves to the United Kingdom pack',
        ukBlock && ukBlock.indexOf('United Kingdom') !== -1 && ukBlock.indexOf('Australia') === -1,
        'GB produced: ' + (ukBlock ? (ukBlock.match(/CONTEXT \(([^)]*)\)/) || ['', '?'])[1] : 'nothing'));
    check('GB compliance tags are not Australian',
        L.getComplianceTags('GB').join(' ').indexOf('RTO Standards') === -1,
        'got ' + L.getComplianceTags('GB').join(' '));

    ['SG', 'AE', 'IN', 'PH', 'ZA', 'XX', ''].forEach(function (c) {
        check('country ' + (c || '(empty)') + ' gets NO legislation rather than the wrong one',
            L.buildPromptInjection(c, null, 'content') === '',
            'emitted a block for a country with no verified pack');
    });
    check('AU still works', (L.buildPromptInjection('AU', null, 'content') || '').indexOf('Australia') !== -1);

    // -----------------------------------------------------------------------
    // 5. The worked examples must obey the ranges the same prompt states, and
    //    their bracketed counts must be true. Three Workplace and three PD
    //    panels sat at 43-44 against a 46-56 floor.
    // -----------------------------------------------------------------------
    const annotated = /"(text|keyTakeaway)":\s*"((?:[^"\\]|\\.)*)"\s*\[(\d+)\s*words?\]/g;
    let m;
    let examples = 0;
    while ((m = annotated.exec(src)) !== null) {
        examples++;
        const field = m[1];
        const txt = m[2].replace(/\s+/g, ' ').trim();
        const claimed = Number(m[3]);
        const actual = txt.split(' ').filter(Boolean).length;
        const lo = field === 'text' ? 46 : 28;
        const hi = field === 'text' ? 56 : 38;
        check('worked example ' + field + ' #' + examples + ' is annotated truthfully',
            claimed === actual, 'claims ' + claimed + ', actually ' + actual);
        check('worked example ' + field + ' #' + examples + ' is inside its own stated range',
            actual >= lo && actual <= hi, actual + ' words, range ' + lo + '-' + hi);
        txt.split(/(?<=[.?!]) /).forEach(function (sent) {
            const w = sent.split(' ').filter(Boolean).length;
            check('worked example sentence stays under 20 words',
                w <= 19, w + ' words: ' + sent.slice(0, 50));
        });
    }
    check('worked examples were actually found', examples >= 12, 'only ' + examples);

    return { name: 'prompt contracts agree with the spec tables', pass: pass, total: pass + failures.length, failures: failures };
};

if (require.main === module) {
    const r = module.exports();
    r.failures.forEach(function (f) { console.log('  FAIL ' + f.name + '\n       ' + f.err); });
    console.log((r.failures.length ? 'FAILED ' : 'ok  ') + r.pass + '/' + r.total + ' ' + r.name);
    process.exit(r.failures.length ? 1 : 0);
}
