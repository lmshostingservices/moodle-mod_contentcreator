/**
 * Every issue a detector raises must be ROUTED — to the repair queue or to the
 * author — and not silently discarded.
 *
 * generator.js filters softIssues against CC_REPAIRABLE to decide what gets a paid
 * repair, and the same two lists feed `needsReview`, which is what "N sections need
 * attention" counts. A message matching neither list is measured, then thrown away:
 * not repaired, not flagged, not shown. `qualityIssues` on the card has no reader in
 * builder.js or player5.js.
 *
 * That has now happened FIVE times — v15.3.7 (policy fidelity), v15.4.11 and
 * v15.4.13 (activity fields), v15.4.16 (pack shape), and v15.4.31 (padding,
 * duplicate sentences, and structural-repair content loss). Each time the fix was
 * "add another regex". This test is the standing check that the regexes and the
 * messages have not drifted apart again.
 *
 * NOTE for whoever reads this next: the real fix is to stop routing on prose. A
 * detector should return {message, route: 'repair'|'review'} and the filter should
 * read the route. Until that lands, this test is the guard.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'amd', 'src', 'generator.js');

/** Extract a regex-literal array by name from generator.js. */
function extractList(src, name) {
    const i = src.indexOf('const ' + name + ' = [');
    if (i === -1) { throw new Error(name + ' not found in generator.js'); }
    const j = src.indexOf('];', i);
    const body = src.slice(i, j);
    const found = body.match(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g) || [];
    return found.map(function (lit) {
        const last = lit.lastIndexOf('/');
        // eslint-disable-next-line no-new-func
        return new RegExp(lit.slice(1, last), lit.slice(last + 1));
    });
}

/**
 * One sample per detector, worded as the detector actually words it.
 * `route` is where it must land.
 */
const samples = [
    // v15.4.31 — the four that were being discarded.
    { route: 'repair', detector: 'paddingIssues (promised specific)',
      msg: 'A PROMISED SPECIFIC IS NEVER GIVEN: the card promises a figure and never gives one' },
    { route: 'repair', detector: 'paddingIssues (abstraction run)',
      msg: 'PADDING - THREE ABSTRACTIONS IN A ROW: tailored, balanced, appropriate' },
    { route: 'repair', detector: 'duplicateSentenceIssues',
      msg: 'Card 3 (mistakes): repeats a sentence already used on card 1. Rewrite it with new wording: "x"' },
    { route: 'review', detector: 'structural repair content loss',
      msg: 'This section lost content during a structural repair (900 words in, 400 words out). Review it.' },

    // Previously-fixed instances, kept so they cannot regress.
    { route: 'repair', detector: 'cardQualityIssues',
      msg: 'QUALITY STANDARD [VET-HOOK-4] Card 1 (hook-scenario): panel 4 ends on a question' },
    { route: 'repair', detector: 'policyFidelityIssues (figures)',
      msg: 'INVENTED FIGURES: the card states 14 days; the policy does not contain it' },
    { route: 'repair', detector: 'policyFidelityIssues (quote)',
      msg: 'THE RULE IS NOT QUOTED: card 2 summarises instead of quoting the clause' },
    { route: 'repair', detector: 'activityFieldIssues',
      msg: 'the Flip and Learn activity cannot be built: keyTerms is missing' },
    { route: 'repair', detector: 'pack shape',
      msg: 'PACK SHAPE: the decision-point is missing from this pack' },
    { route: 'repair', detector: 'itemCountIssues',
      msg: 'steps came back with 3 of the 4 this card is asked for' },
    { route: 'repair', detector: 'optionFeedbackIssues',
      msg: 'two wrong answers carry NO FEEDBACK at all' },
    { route: 'review', detector: 'no source document',
      msg: 'NO SOURCE DOCUMENT REACHED GENERATION for this section' },
    { route: 'review', detector: 'no distractor feedback anywhere',
      msg: 'NO WRONG-ANSWER FEEDBACK ANYWHERE IN THIS PACK' }
];

// Must match nothing: proves the patterns are anchored and not catch-alls.
const mustNotMatch = [
    'Content generated successfully',
    'concept text 2: 44 words, needs 42-56',
    'The learner opened the card and read it'
];

module.exports = function run() {
    const src = fs.readFileSync(SRC, 'utf8');
    const repairable = extractList(src, 'CC_REPAIRABLE');
    const reviewOnly = extractList(src, 'CC_REVIEW_ONLY');

    const failures = [];
    let pass = 0;

    samples.forEach(function (s) {
        const r = repairable.some(function (re) { return re.test(s.msg); });
        const v = reviewOnly.some(function (re) { return re.test(s.msg); });
        const got = r ? 'repair' : (v ? 'review' : 'DISCARDED');
        if (got === s.route) {
            pass++;
        } else {
            failures.push({
                name: s.detector,
                err: 'routed to ' + got + ', expected ' + s.route
                   + (got === 'DISCARDED'
                        ? ' — this finding is measured and then thrown away'
                        : '')
            });
        }
    });

    mustNotMatch.forEach(function (msg) {
        const hit = repairable.some(function (re) { return re.test(msg); })
                 || reviewOnly.some(function (re) { return re.test(msg); });
        if (!hit) { pass++; } else {
            failures.push({ name: 'must not match: "' + msg + '"', err: 'a routing pattern is too broad' });
        }
    });

    return {
        name: 'no detector finding is silently discarded',
        pass: pass,
        total: samples.length + mustNotMatch.length,
        failures: failures
    };
};

if (require.main === module) {
    const r = module.exports();
    r.failures.forEach(function (f) { console.log('  FAIL ' + f.name + '\n       ' + f.err); });
    console.log((r.failures.length ? 'FAILED ' : 'ok  ') + r.pass + '/' + r.total + ' ' + r.name);
    process.exit(r.failures.length ? 1 : 0);
}
