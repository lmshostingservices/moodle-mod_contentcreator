/**
 * v15.4.31 — regression tests for the card-quality criteria that misfired.
 *
 * Every case below FAILS against the v15.4.30 criteria and PASSES after the
 * FIX-CC-QUALITY-REGEX-SCOPE change. Each one cost a paid repair call, because
 * every issue cardQualityIssues() raises begins "QUALITY STANDARD [" and that
 * prefix is in CC_REPAIRABLE.
 *
 * These evaluate the criteria the same way generator.js does: `field` /
 * `fieldIndex` / `allowEmpty` when present, whole-card text otherwise.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function loadCardQuality() {
    let mod;
    global.define = function (deps, factory) { mod = factory(); };
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(ROOT, 'amd/src/card-quality.js'), 'utf8'));
    delete global.define;
    return mod;
}

/** Mirror of generator.js ccReadFieldPathRaw for the paths these rules use. */
function readField(card, p) {
    const segs = String(p).split('.');
    let nodes = [card];
    for (const seg of segs) {
        const isArr = seg.slice(-2) === '[]';
        const key = isArr ? seg.slice(0, -2) : seg;
        const next = [];
        nodes.forEach(function (n) {
            if (n === null || n === undefined) { return; }
            const v = n[key];
            if (v === undefined) { return; }
            if (isArr) { (Array.isArray(v) ? v : [v]).forEach(function (x) { next.push(x); }); }
            else { next.push(v); }
        });
        nodes = next;
    }
    return nodes.map(function (n) { return (typeof n === 'string') ? n : ''; });
}

/** Mirror of the generator's evaluation, including the v15.4.31 scoping. */
function evaluate(criterion, card, wholeText) {
    let subject = wholeText;
    if (criterion.field) {
        const paths = Array.isArray(criterion.field) ? criterion.field : [criterion.field];
        let parts = [];
        for (const p of paths) {
            const got = readField(card, p);
            if (got.some(function (g) { return g.trim() !== ''; })) { parts = got; break; }
            if (got.length && !parts.length) { parts = got; }
        }
        if (typeof criterion.fieldIndex === 'number') {
            parts = parts.length > criterion.fieldIndex ? [parts[criterion.fieldIndex]] : [];
        }
        const nonEmpty = parts.filter(function (p) { return p.trim() !== ''; });
        if (!nonEmpty.length && criterion.allowEmpty && criterion.polarity !== 'forbid') { return true; }
        if (!parts.length) { return true; }
        subject = parts.join(' ');
    }
    const matched = criterion.re.test(subject);
    return criterion.polarity === 'forbid' ? !matched : matched;
}

function find(CQ, mode, cardType, id) {
    const c = (CQ[mode] && CQ[mode][cardType] && CQ[mode][cardType].criteria || [])
        .find(function (x) { return x.id === id; });
    if (!c) { throw new Error('criterion not found: ' + id); }
    return c;
}

function flatten(card) {
    const out = [];
    (function walk(n) {
        if (n === null || n === undefined) { return; }
        if (typeof n === 'string') { out.push(n); return; }
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (typeof n === 'object') { Object.keys(n).forEach(function (k) { walk(n[k]); }); }
    })(card);
    return out.join(' ');
}

const cases = [];

// ---------------------------------------------------------------------------
// VET-CONCEPT-1 — required a citable instrument, run over the whole card.
// ---------------------------------------------------------------------------
cases.push({
    name: 'VET-CONCEPT-1 passes a card whose heading is the permitted empty string',
    why: 'The VET prompt says: "If this topic genuinely sits under no such document, '
       + 'return heading as an empty string ... never invent one." v15.4.30 failed it, '
       + 'and the repair was then asked to supply an instrument.',
    run: function (CQ) {
        const card = {
            cardType: 'concept-explainer',
            heading: '',
            keyInfo: 'You check the reading before you start the pump.',
            conceptInsights: [{ title: 'Ten grams a kilo', text: 'Carbohydrate loading raises muscle glycogen.' }]
        };
        return evaluate(find(CQ, 'vet', 'concept-explainer', 'VET-CONCEPT-1'), card, flatten(card));
    }
});
cases.push({
    name: 'VET-CONCEPT-1 no longer passes on the stray word "Act" elsewhere on the card',
    why: 'v15.4.30 matched "Act quickly when the alarm sounds." and recorded a pass.',
    run: function (CQ) {
        const card = {
            cardType: 'concept-explainer',
            heading: 'The site induction rules',
            conceptInsights: [{ title: 'Move fast', text: 'Act quickly when the alarm sounds.' }]
        };
        return evaluate(find(CQ, 'vet', 'concept-explainer', 'VET-CONCEPT-1'), card, flatten(card)) === false;
    }
});
cases.push({
    name: 'VET-CONCEPT-1 still passes a real citation in the heading',
    run: function (CQ) {
        const card = {
            cardType: 'concept-explainer',
            heading: 'Work Health and Safety Regulations 2011',
            conceptInsights: [{ title: 'Duty', text: 'You must isolate before you enter.' }]
        };
        return evaluate(find(CQ, 'vet', 'concept-explainer', 'VET-CONCEPT-1'), card, flatten(card));
    }
});

// ---------------------------------------------------------------------------
// VET-HOOK-4 — \?\s*$ anchored to the end of the WHOLE card, which is the
// keyTakeaway, and a takeaway must be two statements.
// ---------------------------------------------------------------------------
cases.push({
    name: 'VET-HOOK-4 passes a compliant hook whose panel 4 ends on a question',
    why: 'v15.4.30 anchored to the end of the flattened card, so the keyTakeaway after '
       + 'panel 4 made a correct card fail on every generation, on four routes.',
    run: function (CQ) {
        const card = {
            cardType: 'hook-scenario',
            sceneParts: [
                { title: 'Aisle seven', text: 'You are stacking pallets at 6:40 am.' },
                { title: 'Shut it down', text: 'The forklift is still running two metres from Dan.' },
                { title: 'Ten seconds', text: 'You look, listen and feel for no more than ten seconds.' },
                { title: 'Your call', text: 'There is one gasp in that time. Do you start compressions now?' }
            ],
            keyTakeaway: 'An occasional gasp is not normal breathing, so start CPR at thirty to two. '
                       + 'Waiting costs the first three minutes.'
        };
        return evaluate(find(CQ, 'vet', 'hook-scenario', 'VET-HOOK-4'), card, flatten(card));
    }
});
cases.push({
    name: 'VET-HOOK-4 still fails when the characters resolve it themselves',
    run: function (CQ) {
        const card = {
            cardType: 'hook-scenario',
            sceneParts: [
                { title: 'Aisle seven', text: 'You are stacking pallets at 6:40 am.' },
                { title: 'Shut it down', text: 'The forklift is still running.' },
                { title: 'Ten seconds', text: 'You look, listen and feel.' },
                { title: 'Sam decides', text: 'Sam starts compressions and calls it in.' }
            ],
            keyTakeaway: 'An occasional gasp is not normal breathing. Start CPR.'
        };
        return evaluate(find(CQ, 'vet', 'hook-scenario', 'VET-HOOK-4'), card, flatten(card)) === false;
    }
});

// ---------------------------------------------------------------------------
// VET-DECISION-2 — forbade the bare words only / all / never anywhere on the
// card, including the question stem and all four feedback strings.
// ---------------------------------------------------------------------------
cases.push({
    name: 'VET-DECISION-2 passes ordinary English in the feedback',
    why: 'v15.4.30 forbade "only", "all" and "never" as bare words across the whole '
       + 'card, so most compliant decision-points failed and bought a repair.',
    run: function (CQ) {
        const card = {
            cardType: 'decision-point',
            question: 'The reading sits between the two thresholds. What do you do?',
            options: [
                { text: 'Stop work and call the supervisor before the next lift',
                  feedback: 'Right. The ninety-minute guide only holds for steady work, and all four readings agree.' },
                { text: 'Carry on and note the reading in the log at smoko',
                  feedback: 'This never gets reviewed in time to matter on this shift.' },
                { text: 'Re-zero the gauge and take a second reading', feedback: 'Plausible, but it loses ten minutes.' },
                { text: 'Ask the leading hand to sign it off as within range', feedback: 'That moves the decision, not the risk.' }
            ]
        };
        return evaluate(find(CQ, 'vet', 'decision-point', 'VET-DECISION-2'), card, flatten(card));
    }
});
cases.push({
    name: 'VET-DECISION-2 still fails a genuine strawman option',
    run: function (CQ) {
        const card = {
            cardType: 'decision-point',
            question: 'The reading sits between the two thresholds. What do you do?',
            options: [
                { text: 'Stop work and call the supervisor before the next lift', feedback: 'Right.' },
                { text: 'Ignore the reading and keep lifting', feedback: 'No.' },
                { text: 'Rely solely on the gauge and nothing else', feedback: 'No.' },
                { text: 'Assume all readings in that band are safe', feedback: 'No.' }
            ]
        };
        return evaluate(find(CQ, 'vet', 'decision-point', 'VET-DECISION-2'), card, flatten(card)) === false;
    }
});

// ---------------------------------------------------------------------------
// UNI-ANCHOR-2 — the 'i' flag destroyed the capitalised-surname requirement.
// ---------------------------------------------------------------------------
cases.push({
    name: 'UNI-ANCHOR-2 no longer passes a lowercase word beside a number',
    why: 'With the i flag, [A-Z][a-z]{2,} matched any word in any case, so '
       + '"the survey ran for 1995 participants" satisfied a rule about a surname and a year.',
    run: function (CQ) {
        const card = { cardType: 'concept-anchor', significance: 'the survey ran for 1995 participants' };
        return evaluate(find(CQ, 'university', 'concept-anchor', 'UNI-ANCHOR-2'), card, flatten(card)) === false;
    }
});
cases.push({
    name: 'UNI-ANCHOR-2 still passes a real surname and year',
    run: function (CQ) {
        const card = { cardType: 'concept-anchor', significance: 'Festinger (1957) argued the opposite.' };
        return evaluate(find(CQ, 'university', 'concept-anchor', 'UNI-ANCHOR-2'), card, flatten(card));
    }
});

module.exports = function run() {
    const CQ = loadCardQuality().CARD_QUALITY;
    let pass = 0;
    const failures = [];
    cases.forEach(function (c) {
        let ok;
        try { ok = c.run(CQ) === true; } catch (e) { ok = false; c.err = e.message; }
        if (ok) { pass++; } else { failures.push(c); }
    });
    return { name: 'card-quality criterion scope', pass: pass, total: cases.length, failures: failures };
};

if (require.main === module) {
    const r = module.exports();
    r.failures.forEach(function (f) {
        console.log('  FAIL ' + f.name + (f.err ? ' [' + f.err + ']' : ''));
        if (f.why) { console.log('       ' + f.why); }
    });
    console.log((r.failures.length ? 'FAILED ' : 'ok  ') + r.pass + '/' + r.total + ' ' + r.name);
    process.exit(r.failures.length ? 1 : 0);
}
