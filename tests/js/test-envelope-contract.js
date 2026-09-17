/**
 * "Return ONLY valid JSON" and "label it at the top" must not contradict each other.
 *
 * v15.5.0 FIX-CC-ENVELOPE-AMBIGUITY. Every route's system prompt opens by demanding JSON
 * and nothing else. The downloaded prompt file then appends a topics header telling the
 * model to "Label it as Element 1 at the top" or to "Label each sub topic using JUST the
 * letter". No field was ever named for that label, so the only reading of "at the top"
 * was a heading line above the object - which the first instruction forbids.
 *
 * Nothing crashed. parseChatGPTJSONBlocks starts at the first "{", so a heading line was
 * silently discarded, and a model that instead folded the label into a card title put
 * text on screen the author never wrote. Either way the numbering a teacher asked for did
 * not survive.
 *
 * The envelope now defines "subtopicLabel", the headers name it, and the parser reads it.
 * This suite checks all three ends, and checks that output produced by an older prompt
 * file still parses - a teacher with a saved prompt file must not be broken by this.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'amd', 'src');

/**
 * Load an AMD module outside Moodle.
 *
 * @param {String} file Filename under amd/src.
 * @param {Array} deps Stubs passed to the factory, in declaration order.
 * @returns {Object} The module's exports.
 */
function loadAmd(file, deps) {
    let exported;
    const sandbox = {
        define: function(d, factory) { exported = factory.apply(null, deps); },
        window: {}, document: {}, console: {log: function() {}, warn: function() {}, error: function() {}},
        setTimeout: setTimeout, fetch: function() { return Promise.resolve(); }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), sandbox, {filename: file});
    return exported;
}

const CcStateStub = {
    createLogger: function() {
        return {log: function() {}, warn: function() {}, error: function() {}, debug: function() {}};
    }
};

const Prompts = loadAmd('prompts.js', [{}, CcStateStub, {}]);
const Generator = loadAmd('generator.js', [Prompts, CcStateStub, {}, {}]);
const builder = fs.readFileSync(path.join(SRC, 'builder.js'), 'utf8');

let failures = 0;
let checks = 0;

function ok(condition, label, detail) {
    checks++;
    if (condition) {
        console.log('  ok   ' + label);
        return;
    }
    failures++;
    console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
}

const ROUTES = ['vet', 'workplace', 'university', 'pd', 'general', 'policy', 'topicstext'];
const CONTEXT = {country: 'AU', language: 'en-AU', spelling: 'en-AU'};

console.log('envelope contract');
console.log('');
console.log('1. Every route defines where the label goes');

ROUTES.forEach(function(route) {
    const prompt = Prompts.getSystemPromptForMode(route, CONTEXT);

    ok(prompt.indexOf('${CC_ENVELOPE_BLOCK}') === -1,
        route + ': the envelope block is interpolated, not left as a literal placeholder');
    ok(prompt.indexOf('"subtopicLabel"') !== -1,
        route + ': names the subtopicLabel field');
    ok(prompt.indexOf('The first character of your') !== -1,
        route + ': states that nothing may appear outside the JSON object');
    ok(/never shown to the learner/.test(prompt),
        route + ': says the label is not learner-facing');
    ok(prompt.indexOf('Return ONLY valid JSON') !== -1 || /Return ONLY a valid JSON/.test(prompt),
        route + ': still demands JSON only');
});

console.log('');
console.log('2. The downloaded prompt file names the field rather than "the top"');

ok(builder.indexOf("Label it as Element ' + elNum + ' at the top") === -1,
    'the VET header no longer says "at the top"');
ok(builder.indexOf('\'Do NOT prefix with "Sub Topic".\\n\'') === -1
    || builder.indexOf('subtopicLabel') !== -1,
    'the sub topic headers name the field');

// One per route family: VET, the three letter-labelled routes, and Topics & Text.
const labelMentions = (builder.match(/"subtopicLabel"/g) || []).length;
ok(labelMentions >= 5,
    'every topics header names subtopicLabel (' + labelMentions + ' mentions)');
ok(/\{ "subtopicLabel": "PC ' \+ elNum \+ '\.1", "cards": \[ \.\.\. \] \}/.test(builder),
    'the VET header shows a worked envelope with the PC number in it');
ok(builder.indexOf('Do NOT write an element heading or a PC heading anywhere outside the JSON') !== -1,
    'the VET header forbids a heading outside the JSON');

console.log('');
console.log('3. The parser reads the label, so the instruction is not a fiction');

const parse = Generator.parseChatGPTJSONBlocks;
ok(typeof parse === 'function', 'parseChatGPTJSONBlocks is exported');

const labelled = parse(
    '{"subtopicLabel":"PC 1.1","cards":[{"cardType":"hook-scenario"}]}\n'
    + '=== NEXT ===\n'
    + '{"subtopicLabel":"PC 1.2","cards":[{"cardType":"hook-scenario"}]}'
);
ok(labelled.length === 2, 'two labelled blocks parse', labelled.length + ' found');
ok(labelled[0] && labelled[0].ccSubtopicLabel === 'PC 1.1',
    'block 1 carries its label', String(labelled[0] && labelled[0].ccSubtopicLabel));
ok(labelled[1] && labelled[1].ccSubtopicLabel === 'PC 1.2',
    'block 2 carries its label', String(labelled[1] && labelled[1].ccSubtopicLabel));

// The return shape must not have changed: every caller indexes these as card arrays.
ok(labelled.every(function(b) { return Array.isArray(b) && b.length === 1; }),
    'blocks are still plain card arrays - .length and [i] are untouched');
ok(labelled[0][0].cardType === 'hook-scenario',
    'the cards themselves came through unchanged');

// A label of whitespace is not a label.
const blank = parse('{"subtopicLabel":"   ","cards":[{"cardType":"hook-scenario"}]}');
ok(blank.length === 1 && blank[0].ccSubtopicLabel === undefined,
    'a whitespace-only label is ignored rather than stored');

console.log('');
console.log('4. Output from an older prompt file must still work');

// What a model produced when the instruction had no field to name: a heading line above
// the object. A teacher with a prompt file saved before this release is still sending it.
//
// v15.5.1 changed the answer here. When this suite was first written the heading line was
// unreadable by design and the honest result was no label at all. Having then found a live
// paste whose ONLY labels were heading lines, the parser now recovers a recognised heading
// - PC numbers, Element numbers, a bare "1.2" or "A" - so output from an older prompt file
// gets its labels back too. Arbitrary prose above a block is still not a label.
const heading = parse('Element 1\n{"cards":[{"cardType":"hook-scenario"}]}');
ok(heading.length === 1, 'a heading line above the JSON still parses');
ok(heading[0] && heading[0].ccSubtopicLabel === 'Element 1',
    'and its label is recovered from that heading line',
    String(heading[0] && heading[0].ccSubtopicLabel));

const prose = parse('Here is the content you asked for.\n{"cards":[{"cardType":"hook-scenario"}]}');
ok(prose.length === 1 && prose[0].ccSubtopicLabel === undefined,
    'but ordinary prose above a block is not mistaken for a label',
    String(prose[0] && prose[0].ccSubtopicLabel));

const unlabelled = parse(
    '{"cards":[{"cardType":"hook-scenario"}]}\n=== NEXT ===\n{"cards":[{"cardType":"hook-scenario"}]}'
);
ok(unlabelled.length === 2, 'unlabelled multi-block output still parses');
ok(unlabelled.every(function(b) { return b.ccSubtopicLabel === undefined; }),
    'no label is invented for it');

// Markdown fences, which the prompt forbids and models emit anyway.
const fenced = parse('```json\n{"subtopicLabel":"A","cards":[{"cardType":"hook-scenario"}]}\n```');
ok(fenced.length === 1 && fenced[0].ccSubtopicLabel === 'A',
    'a fenced block still parses and keeps its label');

console.log('');
console.log('5. Every block in the paste must be found, whatever separates them');

// THE REGRESSION THIS SECTION EXISTS FOR (v15.5.1 FIX-CC-PASTE-BLOCKS-DROPPED).
//
// A teacher pasted three PCs of VET output and got one. parseChatGPTJSONBlocks split the
// paste only on a line of 3+ equals signs, then took the first "{" in each segment. The
// model had separated its blocks with a bare "1.2" and "1.3" instead of "=== NEXT ===",
// so the whole paste was one segment and PCs 1.2 and 1.3 were discarded in silence - then
// regenerated with paid AI calls, which is the opposite of what the prompt file promises.
//
// The verbatim shape that failed. Headings above each block, bare PC numbers between them,
// and not one equals sign anywhere.
const REAL_PASTE = [
    'Element 1: Identify health and safety legislative requirements of construction work.',
    'PC 1.1: Basic roles, responsibilities and rights of duty holders are identified.',
    '{"cards":[{"cardType":"hook-scenario","keyTakeaway":"one"}]}',
    '1.2',
    'Element 1: Identify health and safety legislative requirements of construction work.',
    'PC 1.2: Duty of care requirements are identified.',
    '{"cards":[{"cardType":"hook-scenario","keyTakeaway":"two"}]}',
    '1.3',
    'Element 1: Identify health and safety legislative requirements of construction work.',
    'PC 1.3: Construction safe work practices are identified and explained.',
    '{"cards":[{"cardType":"hook-scenario","keyTakeaway":"three"}]}'
].join('\n');

const real = parse(REAL_PASTE);
ok(real.length === 3,
    'all three blocks are found when the model uses no separator at all',
    real.length + ' of 3 - this is the live defect');
ok(real.length === 3 && real.map(function(b) { return b[0].keyTakeaway; }).join(',') === 'one,two,three',
    'they come back in the order they were written');
ok(real.length === 3 && real.map(function(b) { return b.ccSubtopicLabel; }).join(',') === 'PC 1.1,PC 1.2,PC 1.3',
    'each block recovers its PC number from the heading line above it',
    JSON.stringify(real.map(function(b) { return b.ccSubtopicLabel; })));

// An envelope label must beat a recovered heading - it is the one the model was asked for.
const both = parse('PC 9.9\n{"subtopicLabel":"A","cards":[{"cardType":"a"}]}');
ok(both.length === 1 && both[0].ccSubtopicLabel === 'A',
    'an envelope label wins over a heading recovered from the preamble',
    both[0] && both[0].ccSubtopicLabel);

// The separator must still work, because prompt files already downloaded still ask for it.
ok(parse('{"cards":[{"cardType":"a"}]}\n=== NEXT ===\n{"cards":[{"cardType":"b"}]}').length === 2,
    '=== NEXT === separated output still parses');

// The old brace counter counted braces inside strings. Card text legitimately contains
// them, and one "}" in a sentence closed the envelope early and truncated the block.
const braces = parse('{"cards":[{"cardType":"a","text":"use {curly} braces and a \\" quote"}]}'
    + '\n{"cards":[{"cardType":"b"}]}');
ok(braces.length === 2,
    'braces and escaped quotes inside card text do not close the object early',
    braces.length + ' of 2');

// A stray brace in prose above the JSON left every real block unbalanced from that point.
// Breaking there would discard the whole paste over one character of commentary.
ok(parse('Note: use { to open.\n{"cards":[{"cardType":"a"}]}').length === 1,
    'a stray brace in a preamble does not swallow the rest of the paste');

ok(parse('```json\n{"cards":[{"cardType":"a"}]}\n```\n```json\n{"cards":[{"cardType":"b"}]}\n```').length === 2,
    'two fenced blocks both parse');

// A response cut off mid-object must not cost the complete blocks before it.
const trunc = parse('{"cards":[{"cardType":"a"}]}\n1.2\n{"cards":[{"cardType":');
ok(trunc.length === 1, 'a truncated final block keeps the complete ones before it',
    trunc.length + ' of 1');

ok(parse('just some prose with no json in it at all').length === 0,
    'text that is not card JSON yields nothing rather than a false positive');

console.log('');
if (failures) {
    console.log('FAILED ' + failures + ' of ' + checks);
    process.exit(1);
}
console.log('PASSED all ' + checks + ' checks');
process.exit(0);
