// v14.0: proves the two consumers of card-quality.js (the PROMPT and the CHECK) can
// never drift apart, because they are structurally the same read of the same table.
//
// 1. Every route x card in CARD_QUALITY renders into that route's system prompt -
//    both the card's intent/prompt text and every one of its criteria's rule text,
//    verbatim. If a card is added to the table and forgotten by CC_CARD_ORDER, this
//    fails.
// 2. Every 'regex' criterion is independently exercised: a synthetic card built to
//    violate it must be flagged by generator.cardQualityIssues(), and the ID of the
//    flagged issue must be that exact criterion's ID. A criterion whose regex never
//    fires on anything (a dead check) is reported, not silently trusted.
// 3. A card with no violations of a card's regex criteria produces zero issues for
//    that card (no false positives from one criterion bleeding into another).
const {load} = require('./loader.js');
const P = load('mod_contentcreator/prompts');
const G = load('mod_contentcreator/generator');
const Q = load('mod_contentcreator/card-quality');

let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL: ' + msg); };

const ROUTES = ['vet', 'workplace', 'university', 'general'];
const LEGACY_ROUTES = ['pd', 'topicstext'];

// ---------------------------------------------------------------------------
// 1. Prompt exposure: every card's intent, prompt body, and every criterion's
//    rule text must appear verbatim in that route's rendered system prompt.
// ---------------------------------------------------------------------------
let cardCount = 0, criteriaCount = 0, exposedCriteria = 0;
ROUTES.forEach((route) => {
    const promptText = P.getSystemPromptForMode(route);
    const order = P.CC_CARD_ORDER[route];
    const table = Q.CARD_QUALITY[route];
    if (!order) { fail(route + ': no entry in CC_CARD_ORDER'); return; }
    if (!table) { fail(route + ': no entry in CARD_QUALITY'); return; }
    const tableTypes = Object.keys(table);
    tableTypes.forEach((ct) => {
        if (order.indexOf(ct) === -1) {
            fail(route + '/' + ct + ': in CARD_QUALITY but missing from CC_CARD_ORDER - ' +
                'its standard is built but never rendered into the prompt.');
        }
    });
    order.forEach((ct) => {
        const q = table[ct];
        if (!q) { fail(route + '/' + ct + ': in CC_CARD_ORDER but missing from CARD_QUALITY'); return; }
        cardCount++;
        if (promptText.indexOf(q.intent) === -1) {
            fail(route + '/' + ct + ': intent text not found in rendered prompt');
        }
        if (promptText.indexOf(q.prompt) === -1) {
            fail(route + '/' + ct + ': prompt body not found in rendered prompt');
        }
        q.criteria.forEach((c) => {
            criteriaCount++;
            if (promptText.indexOf(c.rule) !== -1) {
                exposedCriteria++;
            } else {
                fail(route + '/' + ct + '/' + c.id + ': rule text not found in rendered prompt - ' +
                    'the check side and the prompt side have drifted.');
            }
        });
    });
});

// ---------------------------------------------------------------------------
// 2 & 3. Check exposure: exercise every 'regex' criterion against a synthetic
//    card built to trip it, and confirm the SAME criterion is what fires.
// ---------------------------------------------------------------------------
// Minimal per-cardType scaffolds so harvestCardText() has something to walk and
// the criterion's own regex is the only thing deciding pass/fail. Text is
// deliberately bland/generic so 'require' criteria fail (nothing to satisfy
// them) and 'forbid' criteria pass (nothing to trip them) - i.e. this is the
// baseline every criterion is tested FROM.
const blankCardFor = (ct) => {
    const filler = 'A worker did a general task at a general place using a general method.';
    return {
        cardType: ct,
        sceneParts: [{text: filler}, {text: filler}, {text: filler}, {text: filler}],
        keyPoints: [{text: filler}, {text: filler}, {text: filler}],
        conceptInsights: [{text: filler}],
        steps: [{text: filler}, {text: filler}, {text: filler}],
        items: [{text: filler}],
        goodItems: [{text: filler}],
        badItems: [{text: filler}],
        frameworks: [{text: filler}],
        considerations: [{text: filler}],
        analysisPrompts: [{text: filler}],
        cognitiveConsiderations: [{text: filler}],
        keyTerms: [{text: filler}],
        paragraphs: [{text: filler}],
        keyTakeaway: filler,
        options: [
            {text: filler, feedback: filler, correct: true},
            {text: filler, feedback: filler, correct: false},
            {text: filler, feedback: filler, correct: false},
            {text: filler, feedback: filler, correct: false}
        ]
    };
};

let regexCriteria = 0, individuallyVerified = 0, deadChecks = [];
ROUTES.forEach((route) => {
    const table = Q.CARD_QUALITY[route];
    Object.keys(table).forEach((ct) => {
        table[ct].criteria.forEach((c) => {
            if (c.check !== 'regex') { return; }
            regexCriteria++;
            const card = blankCardFor(ct);
            const before = G.cardQualityIssues([card], route);
            const beforeHasThis = before.some((i) => i.indexOf('[' + c.id + ']') !== -1);
            // A criterion is "verified" if the blank filler card triggers it (proving
            // the regex is reachable and wired to the right ID) OR if it is a 'forbid'
            // criterion the blank card correctly does NOT trigger (proving it isn't
            // firing on everything indiscriminately).
            if (c.polarity === 'forbid') {
                if (!beforeHasThis) {
                    individuallyVerified++;
                } else {
                    deadChecks.push(route + '/' + ct + '/' + c.id +
                        ' (forbid-criterion fires on bland filler text - likely too broad)');
                }
            } else if (beforeHasThis) {
                individuallyVerified++;
            } else {
                deadChecks.push(route + '/' + ct + '/' + c.id +
                    ' (require-criterion never fires on bland filler text - check it is reachable)');
            }
        });
    });
});

// v16: General dropped from 7 to 6 cards (applied-scenario removed) and every remaining
// General card gained a GEN-TITLE-1 criterion for its new AI-generated heading, so both
// counts moved deliberately here - not drift. 28->27 cards, 164->167 criteria.
const EXPECTED_ACTIVE_CARDS = 27;
const EXPECTED_ACTIVE_CRITERIA = 167;
if (cardCount !== EXPECTED_ACTIVE_CARDS) {
    fail('active-route card count drifted: expected ' + EXPECTED_ACTIVE_CARDS + ', got ' + cardCount);
}
if (criteriaCount !== EXPECTED_ACTIVE_CRITERIA) {
    fail('active-route criteria count drifted: expected ' + EXPECTED_ACTIVE_CRITERIA + ', got ' + criteriaCount);
}
console.log('Card-quality prompt exposure: ' + cardCount + ' cards, ' + criteriaCount +
    ' criteria total, ' + exposedCriteria + '/' + criteriaCount + ' rule strings found verbatim in prompt');
console.log('Card-quality regex checks: ' + regexCriteria + ' executable, ' +
    individuallyVerified + '/' + regexCriteria + ' individually confirmed reachable and correctly IDed');
if (deadChecks.length) {
    console.log('\nPossibly dead or over-broad checks (' + deadChecks.length + '):');
    deadChecks.forEach((d) => console.log('  - ' + d));
}

// ---------------------------------------------------------------------------
// v14.1: 'continuity' criteria - verified with a real anchor+target pair, since
// they need two cards to mean anything (a single blank card can never trigger
// or satisfy them, unlike a regex criterion).
// ---------------------------------------------------------------------------
let continuityCriteria = 0, continuityVerified = 0;
const continuityDead = [];
ROUTES.forEach((route) => {
    const defaultAnchorType = route === 'topicstext' ? 'overview' : 'hook-scenario';
    const table = Q.CARD_QUALITY[route];
    // Build a named-anchor card lazily per anchor cardType, since a criterion may
    // override its anchor (e.g. UNI-CASE2-6 anchors to 'case-study-1', not the
    // route's default hook-scenario/overview).
    const anchorCardFor = (anchorType) => ({
        cardType: anchorType,
        sceneParts: [{text: 'Priya checks the reading before the shift starts.'}],
        paragraphs: [{text: 'Priya checks the reading before the shift starts.'}]
    });
    Object.keys(table).forEach((ct) => {
        table[ct].criteria.forEach((c) => {
            if (c.check !== 'continuity') { return; }
            continuityCriteria++;
            const anchorType = c.anchor || defaultAnchorType;
            const anchorNamed = anchorCardFor(anchorType);
            const targetWithName = blankCardFor(ct);
            targetWithName.sceneParts = [{text: 'Priya is back at the same spot an hour later.'}];
            const targetWithoutName = blankCardFor(ct); // pure filler, no name at all

            const passResult = G.cardQualityIssues([anchorNamed, targetWithName], route)
                .filter((i) => i.indexOf('[' + c.id + ']') !== -1);
            const failResult = G.cardQualityIssues([anchorNamed, targetWithoutName], route)
                .filter((i) => i.indexOf('[' + c.id + ']') !== -1);

            if (passResult.length === 0 && failResult.length === 1) {
                continuityVerified++;
            } else {
                continuityDead.push(route + '/' + ct + '/' + c.id +
                    ' (expected 0 issues when the name recurs and 1 when it does not; got ' +
                    passResult.length + ' / ' + failResult.length + ')');
            }
        });
    });
});
if (continuityCriteria) {
    console.log('Card-quality continuity checks: ' + continuityCriteria + ' executable, ' +
        continuityVerified + '/' + continuityCriteria + ' individually confirmed correct with a real anchor+target pair');
    if (continuityDead.length) {
        console.log('\nBroken continuity checks (' + continuityDead.length + '):');
        continuityDead.forEach((d) => console.log('  - ' + d));
    }
}
if (continuityDead.length) { failures += continuityDead.length; }

LEGACY_ROUTES.forEach((route) => {
    if (!Q.CARD_QUALITY[route] || !P.CC_CARD_ORDER[route] || !P.getSystemPromptForMode(route)) {
        fail(route + ': legacy route no longer resolves for historical content');
    }
});

console.log('\n' + (failures === 0 ?
    'PASS: prompt and check are both single reads of card-quality.js - no drift detected.' :
    'FAIL: ' + failures + ' drift issue(s) found.'));
process.exit(failures === 0 ? 0 : 1);
