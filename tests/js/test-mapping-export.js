/* eslint-env node */
/**
 * v15.7.2: the Excel mapping export, end to end up to the network.
 *
 * Run:  node tests/js/test-mapping-export.js      (exit 0 = pass, 1 = fail)
 *
 * The workbook itself is built by the vendor's export-mapping-excel endpoint; what this
 * plugin owns is the PAYLOAD and which data it is built from. Three paths now produce that
 * payload, and all three must send the vendor the same thing:
 *
 *   A. the builder, step 3, before generation (the path that has always existed);
 *   B. the player, after generation, on a pack built by this release (unit data saved in
 *      the manifest as `mappingSource`);
 *   C. the player, after generation, on a pack built BEFORE this release (no
 *      `mappingSource`; the unit is fetched from training.gov.au again by its code).
 *
 * The contract is pinned against the v15.7.1 builder's payload, reproduced field for field
 * below as V1571_PAYLOAD, so a change that alters what the vendor receives fails here.
 *
 * Paths B and C run the REAL player methods (canExportMapping, loadMappingUnit,
 * exportMappingExcel), lifted out of player5.js by their source text, with the transport
 * stubbed at CcState.vendorFetch / vendorDownload - the exact seam where the request
 * leaves the browser.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'amd', 'src');

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
 * @param {*} a
 * @param {*} b
 * @return {String|null} null when deep-equal, else the assertion message.
 */
function diff(a, b) {
    try { assert.deepStrictEqual(a, b); return null; } catch (e) { return e.message.slice(0, 1500); }
}

// --- the real modules ------------------------------------------------------------------
/**
 * @param {String} file
 * @param {Array} deps
 * @return {Object}
 */
function loadAmd(file, deps) {
    const sandbox = {
        define: function(d, f) { sandbox._m = f.apply(null, deps || []); },
        window: {}, document: {}, console: console, M: {cfg: {sesskey: 'x', wwwroot: ''}},
        setTimeout: setTimeout, Promise: Promise, URL: URL
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(SRC, file), 'utf8'), sandbox, {filename: file});
    return sandbox._m;
}
const CcState = loadAmd('cc-state.js');
const ManifestBuilder = loadAmd('manifest.builder.js', [{}, {}, CcState]);

// --- fixtures: what training.gov.au returns, and what the planner produces ----------------
const TGA_RESPONSE = {success: true, data: {
    code: 'CPCWHS1001', title: 'Prepare to work safely in the construction industry',
    elements: [
        {code: '1', title: 'Identify health and safety legislative requirements',
            performanceCriteria: [{code: '1.1', text: 'Identify and follow WHS legislation'}]},
        {code: '2', title: 'Identify construction hazards and risk control measures',
            performanceCriteria: [{code: '2.1', text: 'Identify hazards'}, {code: '2.2', text: 'Apply controls'}]}
    ],
    performanceCriteria: [],
    knowledgeEvidence: ['WHS legislation', 'Hazard identification'],
    performanceEvidence: ['Identify three hazards'],
    foundationSkills: ['Reading: interpret signs']
}};
// The builder's tgaData, shaped exactly as builder.js shapes the TGA response.
const unit = TGA_RESPONSE.data;
const tgaData = {
    unitCode: unit.code, unitTitle: unit.title, elements: unit.elements,
    performanceCriteria: unit.performanceCriteria, knowledgeEvidence: unit.knowledgeEvidence,
    performanceEvidence: unit.performanceEvidence, foundationSkills: unit.foundationSkills
};
const AI_CONTEXT = {jobTitles: [{title: 'Labourer'}], practicalMapping: [{pc: '2.1', task: 'Walk the site'}]};
const context = {
    mode: 'vet', country: 'AU', state: 'WA', industry: 'Construction', industrySector: 'Civil',
    industries: ['Construction'], industrySectors: ['Civil'],
    jobLevel: 'Worker', jobTitle: 'Labourer', jobTasks: ['Set out barriers'],
    taskEquipment: {'Set out barriers': 'Bollards'}, unitCode: unit.code, unitTitle: unit.title,
    aiContext: AI_CONTEXT
};
const topicPlan = {topics: [{
    id: 'topic_0', title: 'Hazards on a civil site', description: 'Spotting and controlling hazards',
    subtopics: [
        {id: 'subtopic_0_0', title: 'Common hazards', description: 'Trenches, plant, traffic',
            keyPoints: ['Trenches collapse'], coversMappings: {pc: ['2.1'], ke: ['KE2'], pe: ['PE1'], fs: []},
            mappings: [{type: 'pc', code: '2.1'}]},
        // A subtopic with NO coversMappings: must become the empty object, as in v15.7.1.
        {id: 'subtopic_0_1', title: 'Controls', description: '', keyPoints: []}
    ]
}]};
const DATE = '2026-10-06T03:00:00.000Z';

// --- the v15.7.1 builder payload, reproduced field for field --------------------------
// Copied from builder.js exportExcelMapping() as shipped in v15.7.1. This is the contract.
function v1571Payload() {
    const knowledgeEvidence = tgaData.requiredKnowledge || tgaData.knowledgeEvidence || [];
    const performanceEvidence = tgaData.requiredSkills || tgaData.performanceEvidence || [];
    return {
        unitCode: tgaData.code || tgaData.unitCode || 'Unknown',
        unitTitle: tgaData.title || tgaData.unitTitle || 'Untitled Unit',
        generationContext: {
            generatedDate: DATE, mode: 'vet',
            industry: context.industry || context.industrySector || '',
            industrySector: context.industrySector || '', jobTitle: context.jobTitle || '',
            jobLevel: 'Worker', jobTasks: context.jobTasks || [],
            taskEquipment: context.taskEquipment || {}, country: context.country || 'AU',
            state: context.state || ''
        },
        topics: topicPlan.topics.map(topic => ({
            title: topic.title, description: topic.description || '',
            subtopics: (topic.subtopics || []).map(sub => {
                let coversMappings = sub.coversMappings;
                if (!coversMappings || typeof coversMappings !== 'object' || Array.isArray(coversMappings)) {
                    coversMappings = {pc: [], ke: [], pe: [], fs: []};
                }
                return {title: sub.title, description: sub.description || '',
                    keyPoints: sub.keyPoints || [], coversMappings: coversMappings,
                    mappings: Array.isArray(sub.mappings) ? sub.mappings : []};
            })
        })),
        tgaData: {
            elements: tgaData.elements || [], requiredKnowledge: knowledgeEvidence,
            requiredSkills: performanceEvidence, knowledgeEvidence: knowledgeEvidence,
            performanceEvidence: performanceEvidence, foundationSkills: tgaData.foundationSkills || []
        },
        aiContext: AI_CONTEXT
    };
}
const V1571_PAYLOAD = JSON.parse(JSON.stringify(v1571Payload()));

// --- A. the builder path ---------------------------------------------------------------
console.log('\nA. Builder, before generation');
const builderSrc = fs.readFileSync(path.join(SRC, 'builder.js'), 'utf8');
check('builder.js builds the payload through CcState.buildMappingPayload',
    /const payload = CcState\.buildMappingPayload\(\{/.test(builderSrc));
const payloadA = JSON.parse(JSON.stringify(CcState.buildMappingPayload({
    unitCode: tgaData.code || tgaData.unitCode || 'Unknown',
    unitTitle: tgaData.title || tgaData.unitTitle || 'Untitled Unit',
    context: Object.assign({}, context, {mode: 'vet'}),
    jobLevel: 'Worker', topics: topicPlan.topics, tgaData: tgaData, aiContext: AI_CONTEXT,
    generatedDate: DATE
})));
let d = diff(payloadA, V1571_PAYLOAD);
check('the builder payload is IDENTICAL to v15.7.1 (vendor contract unchanged)', d === null, d);
check('builder.js saves the unit data into the pack as mappingSource',
    /mappingSource: \(generationContext\.mode === 'vet'\)\s*\? CcState\.mappingSourceFromTga\(tgaData\)/.test(builderSrc));
check('...and carries it through a failed-slide regeneration',
    /mappingSource: existingManifest\.mappingSource \|\| null/.test(builderSrc));

// --- simulate generation ----------------------------------------------------------------
const planned = ManifestBuilder.buildPlannedManifest({
    mode: 'vet', context: context, topicPlan: JSON.parse(JSON.stringify(topicPlan)),
    mappingSource: CcState.mappingSourceFromTga(tgaData)
});
check('manifest.builder.js puts mappingSource on the manifest',
    planned.mappingSource && planned.mappingSource.unitCode === 'CPCWHS1001'
    && planned.mappingSource.elements.length === 2, JSON.stringify(planned.mappingSource));
check('a non-VET build gets mappingSource: null, not undefined',
    ManifestBuilder.buildPlannedManifest({mode: 'general', context: {}, topicPlan: topicPlan}).mappingSource === null);
// What generator.js does to each subtopic: spreads it into a section and adds cards.
const generated = JSON.parse(JSON.stringify(planned));
generated.createdAt = DATE;
generated.topics = generated.topics.map(t => {
    const sections = (t.subtopics || []).map(sub => Object.assign({}, sub, {
        cards: [{cardType: 'hook-scenario'}], generated: true}));
    const copy = Object.assign({}, t, {sections: sections});
    delete copy.subtopics;
    return copy;
});

// --- B and C. the player path, with the real methods -------------------------------------
/**
 * @param {String} name
 * @return {String}
 */
function liftMethod(name) {
    const src = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
    const start = src.indexOf('        ' + name + ': function(');
    if (start === -1) { throw new Error(name + ' not found in player5.js'); }
    let depth = 0;
    let i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') { depth++; } else if (src[i] === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    return src.slice(start, i).trim();
}
const playerSrc = fs.readFileSync(path.join(SRC, 'player5.js'), 'utf8');
check('the player renders a mapping button beside the PDF and text exports',
    /cc5-export-text-btn[\s\S]{0,1200}canExportMapping\(\)[\s\S]{0,400}cc5-export-mapping-btn/.test(playerSrc));
check('...and binds it', /on\('click', '\.cc5-export-mapping-btn'/.test(playerSrc));

/**
 * Build a player object holding the three real methods and a stubbed transport.
 *
 * @param {Object} manifest
 * @param {Boolean} canEdit
 * @return {Object} {player, sent, fetched, notes}
 */
function makePlayer(manifest, canEdit) {
    const sent = [];
    const fetched = [];
    const notes = [];
    const stubState = Object.assign({}, CcState, {
        vendorFetch: function(cmid, endpoint, opts) {
            fetched.push({endpoint: endpoint, opts: opts});
            return Promise.resolve(JSON.parse(JSON.stringify(TGA_RESPONSE)));
        },
        vendorDownload: function(cmid, endpoint, opts) {
            sent.push({endpoint: endpoint, payload: JSON.parse(JSON.stringify(opts.payload))});
            return Promise.resolve({size: 4096});
        }
    });
    const sandbox = {
        CcState: stubState, console: console, Promise: Promise,
        getLabel: function(k) { return k; }, ccWarn: function() {},
        Notification: {addNotification: function(n) { notes.push(n); }},
        URL: {createObjectURL: function() { return 'blob:x'; }, revokeObjectURL: function() {}},
        document: {
            getElementById: function() { return null; },
            createElement: function() { return {click: function() {}}; },
            body: {appendChild: function() {}, removeChild: function() {}}
        }
    };
    vm.createContext(sandbox);
    const methods = ['canExportMapping', 'loadMappingUnit', 'exportMappingExcel'].map(liftMethod).join(',\n');
    vm.runInContext('var player = {' + methods + '};', sandbox);
    sandbox.player.manifest = manifest;
    sandbox.player.cmid = 7;
    sandbox.player.canEdit = canEdit;
    return {player: sandbox.player, sent: sent, fetched: fetched, notes: notes};
}

(async function() {
    console.log('\nB. Player, after generation, pack built by this release');
    let h = makePlayer(JSON.parse(JSON.stringify(generated)), true);
    check('the button shows for a teacher on a VET pack', h.player.canExportMapping() === true);
    await h.player.exportMappingExcel(null);
    check('training.gov.au is NOT asked again - the pack has the unit', h.fetched.length === 0,
        JSON.stringify(h.fetched));
    check('exactly one request, to export-mapping-excel',
        h.sent.length === 1 && h.sent[0].endpoint === 'exportmappingexcel', JSON.stringify(h.sent.map(x => x.endpoint)));
    d = h.sent.length ? diff(h.sent[0].payload, V1571_PAYLOAD) : 'nothing sent';
    check('the payload is IDENTICAL to what the builder sends before generation', d === null, d);
    check('a success notice names the .xlsx file',
        h.notes.some(n => n.type === 'success' && /CPCWHS1001_Mapping_Document\.xlsx/.test(n.message)),
        JSON.stringify(h.notes));

    console.log('\nC. Player, after generation, pack built BEFORE this release (no mappingSource)');
    const legacy = JSON.parse(JSON.stringify(generated));
    delete legacy.mappingSource;
    h = makePlayer(legacy, true);
    check('the button still shows - the unit code is in the context', h.player.canExportMapping() === true);
    await h.player.exportMappingExcel(null);
    check('the unit is fetched again from training.gov.au by its code',
        h.fetched.length === 1 && h.fetched[0].endpoint === 'tgaunit'
        && h.fetched[0].opts.unitcode === 'CPCWHS1001', JSON.stringify(h.fetched));
    d = h.sent.length ? diff(h.sent[0].payload, V1571_PAYLOAD) : 'nothing sent';
    check('...and the payload is IDENTICAL to the builder\'s', d === null, d);

    console.log('\nD. When the button must NOT show, and failures');
    check('not for a learner', makePlayer(generated, false).player.canExportMapping() === false);
    const wp = JSON.parse(JSON.stringify(generated));
    wp.mode = 'workplace';
    wp.context = {mode: 'workplace'};
    delete wp.mappingSource;
    check('not on a non-VET pack', makePlayer(wp, true).player.canExportMapping() === false);
    const noUnit = JSON.parse(JSON.stringify(legacy));
    noUnit.context.unitCode = '';
    check('not on a VET pack with no unit code', makePlayer(noUnit, true).player.canExportMapping() === false);
    h = makePlayer(legacy, true);
    h.player.loadMappingUnit = function() { return Promise.reject(new Error('TGA down')); };
    await h.player.exportMappingExcel(null);
    check('a failure tells the teacher instead of failing silently',
        h.sent.length === 0 && h.notes.some(n => n.type === 'error' && /TGA down/.test(n.message)),
        JSON.stringify(h.notes));

    console.log('\nE. Several industries reach the mapping');
    const multi = JSON.parse(JSON.stringify(generated));
    multi.context.industries = ['Construction', 'Mining'];
    multi.context.industry = 'Construction, Mining';
    h = makePlayer(multi, true);
    await h.player.exportMappingExcel(null);
    check('generationContext.industry lists every selected industry',
        h.sent.length && h.sent[0].payload.generationContext.industry === 'Construction, Mining',
        h.sent.length ? h.sent[0].payload.generationContext.industry : 'nothing sent');

    console.log('\nF. Self-audit regressions (independent review of v15.7.2)');
    // Every real pack stores aiContext: {} (builder.js `CC_AI_CONTEXT || {}`, and nothing
    // assigns CC_AI_CONTEXT), while the builder's export sends `CC_AI_CONTEXT || null`.
    const realistic = JSON.parse(JSON.stringify(legacy));
    realistic.context.aiContext = {};
    h = makePlayer(realistic, true);
    await h.player.exportMappingExcel(null);
    const builderNull = JSON.parse(JSON.stringify(CcState.buildMappingPayload({
        unitCode: tgaData.unitCode, unitTitle: tgaData.unitTitle,
        context: Object.assign({}, realistic.context, {mode: 'vet'}), jobLevel: 'Worker',
        topics: topicPlan.topics, tgaData: tgaData, aiContext: null, generatedDate: DATE})));
    check('a pack holding aiContext {} sends null, exactly as the builder does',
        h.sent.length && h.sent[0].payload.aiContext === null
        && diff(h.sent[0].payload, builderNull) === null,
        h.sent.length ? JSON.stringify(h.sent[0].payload.aiContext) + ' ' + diff(h.sent[0].payload, builderNull) : 'nothing sent');
    // Packs built before v15.3.7 store job-level SLUGS; the builder's export translated them.
    const oldLevels = JSON.parse(JSON.stringify(legacy));
    oldLevels.context.jobLevel = 'entry, worker';
    h = makePlayer(oldLevels, true);
    await h.player.exportMappingExcel(null);
    check('job-level slugs from an old pack reach the workbook as labels',
        h.sent.length && h.sent[0].payload.generationContext.jobLevel === 'Entry Level / Trainee, Worker / Operator',
        h.sent.length ? h.sent[0].payload.generationContext.jobLevel : 'nothing sent');
    check('labels already stored pass through unchanged',
        CcState.jobLevelLabel('Supervisor / Team Leader') === 'Supervisor / Team Leader');
    check('the slug table matches lang/en exactly',
        (function() {
            const lang = fs.readFileSync(path.join(ROOT, 'lang', 'en', 'contentcreator.php'), 'utf8');
            return ['entry', 'worker', 'supervisor', 'manager', 'executive'].every(function(k) {
                const m = lang.match(new RegExp("\\$string\\['msgjl" + k + "'\\] = '([^']*)'"));
                return m && CcState.jobLevelLabel(k) === m[1];
            });
        })());

    console.log('\n' + (failures ? 'FAILED ' + failures + ' of ' + checks : 'PASSED all ' + checks + ' mapping checks'));
    process.exit(failures ? 1 : 0);
})();
