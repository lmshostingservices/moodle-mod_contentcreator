/* eslint-env node */
/**
 * v15.7.5: getting every Performance Criterion of a unit in, on SITHFAB021's real text.
 *
 * Run:  node tests/js/test-tga-pcs.js      (exit 0 = pass, 1 = fail)
 *
 * Reported 26 Oct 2026: fetching SITHFAB021 showed 4 elements and 1 PC. training.gov.au
 * numbers that unit inconsistently - "1.1 Identify..." then "1.2. Where appropriate...",
 * "2.1. Use knowledge..." - and the fetch (parsed on the LMS Labs server, not here) kept
 * only 1.1. That server fix is handed over separately. What this file proves is the
 * plugin's own half, which had three faults of its own on the same unit:
 *
 *   1. nothing on screen said the unit was incomplete;
 *   2. "Merge (add missing only)" added nothing, because it only added missing ELEMENTS;
 *   3. pasting the TGA TABLE (rather than typed lines) lost the first PC of every element
 *      into the element's name - 16 of 20 PCs.
 *
 * The functions are the REAL ones, lifted out of builder.js by their own source text.
 * The fixtures are SITHFAB021's Elements and Performance Criteria exactly as TGA shows
 * them, trailing full stops and all: tests/fixtures/SITHFAB021-lines.txt (typed or copied
 * line by line) and SITHFAB021-table.txt (the table copied whole: header rows, and each
 * element on one line with its first PC after a tab).
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const builderSrc = fs.readFileSync(path.join(ROOT, 'amd', 'src', 'builder.js'), 'utf8');
const LINES = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'SITHFAB021-lines.txt'), 'utf8');
const TABLE = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'SITHFAB021-table.txt'), 'utf8');

let failures = 0;
let checks = 0;
/**
 * @param {String} label
 * @param {Boolean} ok
 * @param {String} [detail]
 */
function check(label, ok, detail) {
    checks++;
    if (ok) { console.log('  ok   ' + label); return; }
    failures++;
    console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
}

/**
 * Lift `const name = ...;` (block or expression arrow) out of builder.js.
 *
 * @param {String} name
 * @return {String}
 */
function liftConst(name) {
    const start = builderSrc.indexOf('    const ' + name + ' = ');
    if (start === -1) { throw new Error(name + ' not found in builder.js'); }
    const arrow = builderSrc.indexOf('=>', start);
    let i = arrow + 2;
    while (builderSrc[i] === ' ') { i++; }
    if (builderSrc[i] === '{') {
        let depth = 0;
        for (; i < builderSrc.length; i++) {
            if (builderSrc[i] === '{') { depth++; } else if (builderSrc[i] === '}') {
                depth--;
                if (depth === 0) { i++; break; }
            }
        }
        return builderSrc.slice(start, i) + ';';
    }
    // Expression body: to the terminating ";\n".
    return builderSrc.slice(start, builderSrc.indexOf(';\n', i) + 1);
}
let api;
try {
    const src = ['ccElementCode', 'ccPcCode', 'ccMergeElements', 'ccElementsMissingPcs',
        'parseElementsText', 'renderTGADetails'].map(liftConst).join('\n');
    // eslint-disable-next-line no-new-func
    api = new Function('s', 'escapeHtml', src
        + '\nreturn {ccElementCode, ccPcCode, ccMergeElements, ccElementsMissingPcs, parseElementsText, renderTGADetails};')(
        function(k) {
            return {msgunitmissingpcs: 'MISSING PCS FOR {$a}', msgunitmissingpcsbtn: 'PASTE'}[k] || k;
        },
        function(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); });
} catch (e) {
    console.log('FAIL: ' + e.message + ' - fix the extraction, do not delete this file.');
    process.exit(1);
}

// SITHFAB021: 5 + 6 + 3 + 6 = 20 PCs.
const EXPECT_CODES = ['1.1', '1.2', '1.3', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6',
    '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '4.4', '4.5', '4.6'];
/**
 * @param {Array} els
 * @return {String}
 */
const shape = (els) => els.map(e => api.ccElementCode(e) + ':' + (e.performanceCriteria || []).length).join(' ');
/**
 * @param {Array} els
 * @return {Array<String>}
 */
const codes = (els) => [].concat.apply([], els.map(e => (e.performanceCriteria || []).map(api.ccPcCode)));

console.log('\n1. Pasted line by line (what worked before) still gives all 20');
const fromLines = api.parseElementsText(LINES);
check('4 elements with 5, 6, 3 and 6 PCs', shape(fromLines) === '1:5 2:6 3:3 4:6', shape(fromLines));
check('20 PCs in total', codes(fromLines).length === 20, String(codes(fromLines).length));
check('the PC numbers are 1.1-4.6 in order, trailing full stops removed',
    JSON.stringify(codes(fromLines)) === JSON.stringify(EXPECT_CODES), JSON.stringify(codes(fromLines)));
check('1.1 (no full stop) and 1.2. (full stop) are both read',
    codes(fromLines).indexOf('1.1') === 0 && codes(fromLines).indexOf('1.2') === 1);
check('element names are clean', fromLines.map(e => e.name).join(' | ')
    === 'Follow the principles of responsible service of alcohol | Assist customers to drink within appropriate limits | '
    + 'Assess alcohol affected customers and identify those to whom sale or service must be refused | Refuse to provide alcohol',
    fromLines.map(e => e.name).join(' | '));

console.log('\n2. Pasted as the TGA TABLE (lost 4 of 20 PCs before this release)');
const fromTable = api.parseElementsText(TABLE);
check('4 elements with 5, 6, 3 and 6 PCs', shape(fromTable) === '1:5 2:6 3:3 4:6', shape(fromTable));
check('the first PC of every element is there', ['1.1', '2.1', '3.1', '4.1'].every(c => codes(fromTable).includes(c)),
    JSON.stringify(codes(fromTable)));
check('no element name has a tab or PC text in it',
    fromTable.every(e => !/\t|\d\.\d/.test(e.name)), fromTable.map(e => JSON.stringify(e.name)).join(' | '));
check('the header rows are ignored', fromTable.length === 4);
check('table and line pastes give the identical result',
    JSON.stringify(fromTable) === JSON.stringify(fromLines));

console.log('\n3. What the fetch returned for SITHFAB021, and the warning');
// Exactly what the screenshot shows: element 1 with 1.1 only, elements 2-4 empty.
const fetched = () => [
    {code: '1', title: 'Follow the principles of responsible service of alcohol.',
        performanceCriteria: ['1.1 Identify the provisions of relevant state or territory legislation, licensing requirements, house policy and responsible service of alcohol principles.']},
    {code: '2', title: 'Assist customers to drink within appropriate limits.', performanceCriteria: []},
    {code: '3', title: 'Assess alcohol affected customers and identify those to whom sale or service must be refused.', performanceCriteria: []},
    {code: '4', title: 'Refuse to provide alcohol.', performanceCriteria: []}
];
const unit = {unitCode: 'SITHFAB021', unitTitle: 'Provide responsible service of alcohol', elements: fetched(),
    knowledgeEvidence: [], performanceEvidence: [], foundationSkills: []};
check('elements 2, 3 and 4 are reported as having no PCs',
    JSON.stringify(api.ccElementsMissingPcs(unit)) === '[2,3,4]', JSON.stringify(api.ccElementsMissingPcs(unit)));
const card = api.renderTGADetails(unit);
check('the unit card shows the warning naming them', /MISSING PCS FOR 2, 3, 4/.test(card) && /data-testid="unit-missing-pcs"/.test(card));
check('...with the button that opens the paste box', /cc-unit-gap-paste/.test(card));

console.log('\n4. Merge fills in the missing PCs (it added nothing before this release)');
const merged = api.ccMergeElements(fetched(), fromTable);
check('all 20 PCs are now present, 5/6/3/6', shape(merged.elements) === '1:5 2:6 3:3 4:6', shape(merged.elements));
check('1.1 is not duplicated', codes(merged.elements).filter(c => c === '1.1').length === 1);
check('the fetched 1.1 keeps its fetched text',
    merged.elements[0].performanceCriteria[0] === fetched()[0].performanceCriteria[0]);
check('PCs are in number order', JSON.stringify(codes(merged.elements)) === JSON.stringify(codes(fromLines)),
    JSON.stringify(codes(merged.elements)));
check('the status counts are right: 0 elements and 19 PCs added',
    merged.addedElements === 0 && merged.addedPcs === 19, JSON.stringify({e: merged.addedElements, p: merged.addedPcs}));
check('the fetched element titles are kept', merged.elements[1].title === 'Assist customers to drink within appropriate limits.');
check('the warning goes away once merged',
    api.ccElementsMissingPcs({elements: merged.elements}).length === 0
    && !/unit-missing-pcs/.test(api.renderTGADetails(Object.assign({}, unit, {elements: merged.elements}))));
const given = fetched();
const givenBefore = JSON.stringify(given);
api.ccMergeElements(given, fromTable);
check('merging does not change the array it was given', JSON.stringify(given) === givenBefore);

console.log('\n5. Merge edge cases');
const objShaped = [{code: 1, performanceCriteria: [{code: '1.1.', text: 'Identify the provisions'}]}];
const m2 = api.ccMergeElements(objShaped, fromLines.slice(0, 1));
check('object-shaped fetched PCs ({code: "1.1."}) are matched, not duplicated',
    m2.elements[0].performanceCriteria.length === 5 && m2.addedPcs === 4, shape(m2.elements));
const m3 = api.ccMergeElements(fetched(), [{code: '5', name: 'New element', performanceCriteria: ['5.1 Do a thing']}]);
check('a genuinely new element is still added, in number order',
    m3.addedElements === 1 && api.ccElementCode(m3.elements[4]) === '5', shape(m3.elements));
const m4 = api.ccMergeElements(api.parseElementsText(LINES), api.parseElementsText(LINES));
check('merging a complete unit with itself adds nothing', m4.addedElements === 0 && m4.addedPcs === 0);
const three = api.ccMergeElements([{code: '1', performanceCriteria: ['1.1.2 b', '1.1.10 d']}],
    [{code: '1', performanceCriteria: ['1.1.1 a', '1.1.3 c']}]);
check('3-level PC numbers sort numerically (1.1.2 before 1.1.10)',
    JSON.stringify(codes(three.elements)) === '["1.1.1","1.1.2","1.1.3","1.1.10"]', JSON.stringify(codes(three.elements)));

console.log('\n6. The paste reader still handles the formats it handled before');
const old = api.parseElementsText('1 Plan the work\n1.1 Read the plan\n1.1.1 Sub point\n2.  Do the work\n2.1 Do it\nand carry on');
check('"1 Element" without a full stop, 3-level PCs, and wrapped PC text', shape(old) === '1:2 2:1'
    && old[1].performanceCriteria[0] === '2.1 Do it and carry on', shape(old) + ' ' + JSON.stringify(old[1].performanceCriteria));
check('Windows line endings', shape(api.parseElementsText(LINES.replace(/\n/g, '\r\n'))) === '1:5 2:6 3:3 4:6');

console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' TGA PC checks'));
process.exit(failures ? 1 : 0);
