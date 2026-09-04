// =============================================================================
// CHECK THE CHECKLIST.
//
// The content quality standard (docs/CONTENT-QUALITY-STANDARD.md) is the source of
// truth. This asserts, criterion by criterion, that each one is (a) STATED in every
// route prompt that it applies to, and (b) ENFORCED by a named validator where the
// standard says a machine check is possible.
//
// A criterion that is in the standard and in neither the prompt nor a validator is a
// criterion nobody is working to. That is what this test exists to make impossible.
//
//   node tests/js/test-standard.js
// =============================================================================
const path = require('path');
const { load } = require(path.join(__dirname, 'loader.js'));
const P = load('mod_contentcreator/prompts');
const G = load('mod_contentcreator/generator');

const ROUTES = {
  vet: P.VET_SYSTEM_PROMPT, workplace: P.WORKPLACE_SYSTEM_PROMPT,
  university: P.UNIVERSITY_SYSTEM_PROMPT, general: P.GENERAL_SYSTEM_PROMPT
};
const UNIFIED = ['vet', 'workplace', 'general'];
const ALL = Object.keys(ROUTES);
const HAS_SCENARIOS = UNIFIED;                 // hook / applied cards
const HAS_DECISION = ALL;                      // every teacher-facing route has a decision-point
const HAS_MISTAKES = UNIFIED;                  // mistakes / competency cards

// id, short name, routes it applies to, phrase(s) proving the PROMPT states it,
// validator name proving it is ENFORCED (null = judgement only, by design).
const MATRIX = [
  ['T0-1','source fidelity floor',        ALL,          ['USE THE SOURCE'],                       'sourceAnchorIssues'],
  ['T0-2','no subject drift',             ALL,          ['STAY IN YOUR OWN SLIDE'],               'subjectDriftIssues'],
  ['T0-3','no internal duplication',      ALL,          ['STAY IN YOUR OWN SLIDE'],               'duplicateSentenceIssues'],
  ['T0-4','scaffold honesty',             ALL,          ['Never invent'],                         null],
  ['T0-5','answer not guessable',         HAS_DECISION, ['DECISION QUESTION'],                    'optionParityIssues'],
  ['T0-6','language integrity',           ALL,          ['VAGUE LANGUAGE'],                       'artefactIssues'],
  ['T1-1','specific density',             ALL,          ['concrete'],                             'specificDensityIssues'],
  ['T1-2','teaches beyond the title',     ALL,          ['could not have guessed from the card'], null],
  ['T1-3','mechanism not outcome',        ALL,          ['MECHANISM'],                            null],
  ['T1-4','source-grounded quantities',   ALL,          ['threshold'],                            'specificDensityIssues'],
  ['T1-5','named exemplars where useful', ALL,          ['named'],                                null],
  ['T1-6','no invented facts',            ALL,          ['Carry across its numbers'],             null],
  ['T1-7','takeaway is the subject',      ALL,          ['KEY TAKEAWAY'],                         'keyTakeawayIssues'],
  ['T2-1','retrieval/prediction before exposition', HAS_SCENARIOS, ['COMMITMENT POINT','prediction'], 'commitmentPointIssues'],
  ['T2-2','learner prediction point',     HAS_SCENARIOS,['MAKE THE LEARNER COMMIT','prediction'], 'commitmentPointIssues'],
  ['T2-3','desirable difficulty',         HAS_DECISION, ['plausible'],                            'distractorQualityIssues'],
  ['T2-4','feedback teaches',             HAS_DECISION, ['feedback'],                             null],
  ['T2-5','generation not recognition',   [],           [],                                       null], // schema gap, see below
  ['T2-6','mistakes diagnostic not moral',HAS_MISTAKES, ['plausible'],                            'moralMistakeIssues'],
  ['T2-7','mental model fits the work',   UNIFIED,      ['INSTRUCTIONAL MODEL ROUTER - CHOOSE THE MODEL FROM THE LEARNING JOB'], 'metaProcedureIssues'],
  ['T3-1','hook names person/moment/stake',['vet','workplace'],['NAMED person, a MOMENT and a STAKE'], 'concretenessIssues'],
  ['T3-2','scenario continuity',          HAS_SCENARIOS,['SAME people as Card 1','same person','CONTINUITY'], null],
  ['T3-3','one concrete image',           ALL,          ['concrete'],                             'concretenessIssues'],
  ['T3-4','the stake is the learner\'s',  HAS_SCENARIOS,['stake'],                                'scenarioOpeningIssues'],
  ['T3-5','curiosity/surprise',            HAS_SCENARIOS,['CONTRADICTS','contradicts','surprising'],             null],
  ['T3-6','spaced re-encounter',          ALL,          ['earlier slide'],                        null],
  ['T4-1','register matches route',        ALL,          ['VOICE'],                                null],
  ['T4-2','load discipline',              ALL,          ['word range','WORD RANGE'],                           'depthIssues'],
  ['T4-3','variety across the pack',      ALL,          ['different'],                            'scenarioOpeningIssues'],
  ['T4-4','coherence of the unit',        ALL,          ['STAY IN YOUR OWN SLIDE'],               null],
  ['T4-5','plain structure',              ALL,          ['Sentences'],                            'readabilityIssues'],
  ['T4-6','no filler clauses',            ALL,          ['filler'],                               'fieldIssues']
];

let stated = 0, statedTotal = 0, enforced = 0, enforceable = 0, fails = 0;
console.log('CRITERION                          ROUTES STATING IT           VALIDATOR');
console.log('-'.repeat(88));
MATRIX.forEach(function (row) {
  const [id, name, routes, phrases, validator] = row;
  if (!routes.length) {
    console.log((id + ' ' + name).padEnd(35) + 'n/a - schema gap'.padEnd(28) + '-');
    return;
  }
  const missing = routes.filter(function (r) {
    return !phrases.some(function (p) { return (ROUTES[r] || '').indexOf(p) !== -1; });
  });
  statedTotal += routes.length; stated += (routes.length - missing.length);
  if (validator) { enforceable++; if (typeof G[validator] === 'function') { enforced++; } }
  const okStated = missing.length === 0;
  const okVal = !validator || typeof G[validator] === 'function';
  if (!okStated || !okVal) { fails++; }
  console.log((id + ' ' + name).padEnd(35) +
    (okStated ? (routes.length + '/' + routes.length + ' stated') : ('MISSING on ' + missing.join(','))).padEnd(28) +
    (validator ? ((okVal ? '' : 'MISSING ') + validator) : 'judgement only'));
});
console.log('-'.repeat(88));
console.log('Stated in the prompts : ' + stated + '/' + statedTotal + ' route-criteria');
console.log('Enforced by a check   : ' + enforced + '/' + enforceable + ' of the machine-checkable criteria');
console.log('Judgement only        : ' + MATRIX.filter(function (r) { return r[2].length && !r[4]; }).length + ' criteria');
console.log('\nKNOWN GAP - T2-5 generation, not recognition: the card schema has no free-response');
console.log('or numeric-entry slot, so a learner can only ever select, never produce. This is a');
console.log('product requirement, not a prompt fix, and it is recorded here so it is not lost.');
// Legacy route IDs remain readable, but they are not teacher-facing standards.
['pd','topicstext'].forEach(function (legacy) {
  const resolved = P.getSystemPromptForMode(legacy);
  if (!resolved || resolved.length < 1000) {
    console.log('LEGACY ROUTE FAILED TO RESOLVE: ' + legacy);
    fails++;
  }
});
if (fails) { console.log('\n' + fails + ' CRITERION/CRITERIA NOT COVERED'); }
process.exit(fails ? 1 : 0);
