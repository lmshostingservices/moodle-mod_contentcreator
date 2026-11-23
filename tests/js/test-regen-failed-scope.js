/**
 * "Regenerate Failed" must regenerate exactly the sections the builder counted, no more.
 *
 * builder.js (triggerFailedRegeneration) counts a section when it has a failed
 * (placeholder) card. A needsReview section - salvaged, complete content - is not counted:
 * v15.6.3 removed it on purpose. generator.js decides per section whether to make new
 * cards (needsCards). Until v15.7.13 it still treated needsReview as a reason to
 * regenerate, so the banner said "Only regenerating 1 slides" while every needsReview
 * section was regenerated, overwritten, charged again, and had its voiceover re-bought.
 *
 * This lifts the real needsCards expression out of generator.js and runs it against
 * sample sections, so the check is on behaviour, not on wording.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const gen = fs.readFileSync(path.join(root, 'amd', 'src', 'generator.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'amd', 'src', 'builder.js'), 'utf8');

let failed = 0;
function check(name, ok, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
    if (!ok) { failed++; }
}

console.log('regenerate failed: scope');

const m = gen.match(/const needsCards = (.+);/);
check('the needsCards expression is found in generator.js', !!m);
if (!m) { process.exit(1); }

// eslint-disable-next-line no-new-func
const needsCards = new Function('regenerateFailedOnly', 'existingSection', 'expectedCardCount',
    'return ' + m[1] + ';');

const seven = (extra) => Array.from({length: 7}, () => Object.assign({cardType: 'x'}, extra || {}));

check('a section with failed cards is regenerated',
    needsCards(true, {cards: seven({failed: true})}, 7) === true);
check('a section with too few cards is regenerated',
    needsCards(true, {cards: seven().slice(0, 5)}, 7) === true);
check('a complete, needsReview (salvaged) section is NOT regenerated',
    needsCards(true, {cards: seven({needsReview: true})}, 7) === false);
check('a complete, clean section is NOT regenerated',
    needsCards(true, {cards: seven()}, 7) === false);
check('a full (non-failed-only) build always generates',
    needsCards(false, {cards: seven()}, 7) === true);

// The builder's count must not include needsReview either, or the two drift apart again.
const countStart = builder.indexOf('const triggerFailedRegeneration');
const countBody = builder.slice(countStart, builder.indexOf('if (failedCount === 0)', countStart));
const countCode = countBody.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
check('the builder count does not count needsReview either',
    countStart !== -1 && !/needsReview/.test(countCode));

console.log(failed ? '\nFAILED ' + failed + ' check(s)' : '\nPASSED all checks');
process.exit(failed ? 1 : 0);
