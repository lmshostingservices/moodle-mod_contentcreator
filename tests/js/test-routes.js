// Build a minimally-compliant card of every type on every route, straight from the
// spec table, and assert the checks pass. If a route's specs and its floors ever
// disagree again, this fails.
const {load}=require('./loader.js');
const P=load('mod_contentcreator/prompts'), G=load('mod_contentcreator/generator');
const words=n=>Array.from({length:n},(_,i)=>'w'+i).join(' ');

function setPath(card, path, count, text){
  const segs=path.split('.');
  let node=card;
  for(let i=0;i<segs.length;i++){
    const seg=segs[i], isArr=seg.endsWith('[]'), key=isArr?seg.slice(0,-2):seg, last=i===segs.length-1;
    if(isArr){
      if(!node[key]) node[key]=Array.from({length:count},()=>({}));
      if(last){ node[key]=Array.from({length:count},()=>text); }
      else { node[key].forEach(o=>{ const rest=segs.slice(i+1).join('.'); setPath(o,rest,count,text); }); return; }
    } else if(last){ node[key]=text; }
    else { node[key]=node[key]||{}; node=node[key]; }
  }
}

let failures=0;
['vet','workplace','university','general'].forEach(mode=>{
  const specs=P.getFieldSpecs(mode);
  const cards=Object.keys(specs).map(ct=>{
    const card={cardType:ct};
    specs[ct].forEach(f=>{
      const n=(P.CC_EXPECTED_ITEMS[ct]||{})[f.path]||1;
      const lo=(f.byCount&&f.byCount[n])?f.byCount[n][0]:f.min;
      setPath(card,f.path,n,words(lo));
    });
    if(ct==='decision-point'&&Array.isArray(card.options)){
      card.options=card.options.map((o,i)=>({text:words(P.CC_OPTION_SPEC.min),feedback:words(mode==='general'?40:30),correct:i===0}));
    }
    return card;
  });
  // keyTakeaway lives on card 1
  cards[0].keyTakeaway='Carbohydrate loading means 10 to 12 grams per kilogram daily for two to four days before the event. A first timer who has not rehearsed it should lower that target instead.';
  const res={
    field:G.fieldIssues(cards,mode), depth:G.depthIssues(cards,mode),
    parity:G.optionParityIssues(cards), takeaway:G.keyTakeawayIssues(cards),
    artefact:G.artefactIssues(cards)
  };
  const total=Object.values(res).reduce((a,b)=>a+b.length,0);
  console.log(mode.padEnd(12)+ (total? 'FAIL '+total+' issue(s)':'pass') );
  if(total){ failures++; Object.entries(res).forEach(([k,v])=>v.forEach(i=>console.log('    ['+k+'] '+i.slice(0,140)))); }
});
console.log(failures? '\nSPEC/FLOOR DISAGREEMENT on '+failures+' route(s)' : '\nAll four teacher-facing routes: a minimally-compliant pack passes every check.');

// Legacy IDs must keep resolving for historical saved content. They are migration
// aliases, not teacher-facing routes.
['pd','topicstext'].forEach(mode => {
  try {
    const sys=P.getSystemPromptForMode(mode), specs=P.getFieldSpecs(mode);
    if(!sys || !specs || !Object.keys(specs).length){ failures++; console.log(mode.padEnd(12)+'FAIL legacy route did not resolve'); }
    else { console.log(mode.padEnd(12)+'legacy-compatible'); }
  } catch(e){ failures++; console.log(mode.padEnd(12)+'FAIL legacy route threw: '+e.message); }
});


// ---------------------------------------------------------------------------
// v15: LEGISLATION RELEVANCE GATE.
// Verified legal packs are candidate context only. Unrelated training must not receive
// blanket compliance boilerplate, while genuinely regulatory/safety topics still do.
// ---------------------------------------------------------------------------
if (typeof G.ccLegislationRelevant === 'function') {
  const unrelated = G.ccLegislationRelevant('workplace',
    {industryContext:'Professional services', priorityContent:'Use the new expense system to submit receipts.'},
    {title:'Submitting an expense claim'});
  const relevant = G.ccLegislationRelevant('workplace',
    {industryContext:'Construction', priorityContent:'Follow the site WHS procedure and incident reporting requirements.'},
    {title:'Responding to a workplace hazard'});
  const generalNever = G.ccLegislationRelevant('general',
    {priorityContent:'A privacy-themed general knowledge article.'}, {title:'Privacy'});
  if (unrelated || !relevant || generalNever) {
    failures++;
    console.log('legislation relevance gate FAIL: unrelated='+unrelated+', relevant='+relevant+', general='+generalNever);
  } else {
    console.log('legislation relevance gate pass');
  }
} else {
  failures++;
  console.log('legislation relevance gate FAIL: helper not exported');
}

// ---------------------------------------------------------------------------
// v13.98.2: SENTENCE-BUDGET COHERENCE.
//
// The defect this guards against shipped for four minor versions: a field asking
// for "EXACTLY 2 sentences, 42-58 words" while the route capped sentences at 18-20
// words. Two sentences of 18 words is 36. The range was unreachable, and measured
// output sat at exactly two short sentences on every scenario card in every pack.
//
// Any field that states a sentence count must be satisfiable within the route's own
// sentence cap.
// ---------------------------------------------------------------------------
const CTX = { language: 'en-AU' };
// v13.98.3: the REPAIR prompts are checked too. Three independent audits found that the
// v13.98.2 three-sentence fix had been applied to the generation prompts only, so the
// repair pass - which v13.98 made fire far more often - was still handing the model the
// impossible constraint the release had just removed. A guard that only reads half the
// prompts in the file is how that shipped.
const PROMPTS = {
  'vet (generate)': P.VET_SYSTEM_PROMPT,
  'workplace (generate)': P.WORKPLACE_SYSTEM_PROMPT,
  'pd (generate)': P.PD_SYSTEM_PROMPT,
  'university (generate)': P.UNIVERSITY_SYSTEM_PROMPT,
  'general (generate)': P.GENERAL_SYSTEM_PROMPT,
  'topicstext (generate)': P.TOPICSTEXT_SYSTEM_PROMPT,
  'vet (repair)': P.getContentRepairPromptForMode('vet', CTX),
  'workplace (repair)': P.getContentRepairPromptForMode('workplace', CTX),
  'pd (repair)': P.getContentRepairPromptForMode('pd', CTX),
  'university (repair)': P.getContentRepairPromptForMode('university', CTX),
  'general (repair)': P.getContentRepairPromptForMode('general', CTX),
  'topicstext (repair)': P.getContentRepairPromptForMode('topicstext', CTX)
};
const WORDNUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };
let budgetFails = 0;
console.log('\nSentence-budget coherence (generation AND repair prompts):');
Object.keys(PROMPTS).forEach(function (label) {
  const text = PROMPTS[label] || '';
  const capM = text.match(/[Ss]entences (?:stay )?(?:are )?under (\d+) words/);
  if (!capM) { console.log('  ' + label.padEnd(22) + 'no sentence cap stated'); return; }
  // "under 20" means at most 19. The v13.98.2 guard used 20 and could not see a range
  // that was unreachable by exactly one word - which two routes then were.
  const cap = parseInt(capM[1], 10) - 1;
  const re = /EXACTLY (ONE|TWO|THREE|FOUR|\d+) (?:short )?sentences?, (\d+)-(\d+) words/gi;
  let m, checked = 0, bad = 0;
  while ((m = re.exec(text)) !== null) {
    const n = WORDNUM[String(m[1]).toUpperCase()] || parseInt(m[1], 10);
    const lo = parseInt(m[2], 10), hi = parseInt(m[3], 10);
    checked++;
    if (n * cap < hi) {
      bad++; budgetFails++;
      console.log('  ' + label.padEnd(22) + 'UNREACHABLE: ' + n + ' sentences x ' + cap +
        ' words = ' + (n * cap) + ', but the field asks for ' + lo + '-' + hi);
    }
  }
  // The key takeaway is two sentences on every route and is specified in a shared block.
  const tk = text.match(/Two sentences, (\d+)-(\d+) words in total/);
  if (tk && 2 * cap < parseInt(tk[2], 10)) {
    budgetFails++;
    console.log('  ' + label.padEnd(22) + 'UNREACHABLE: keyTakeaway 2 x ' + cap + ' = ' +
      (2 * cap) + ' against ' + tk[1] + '-' + tk[2]);
  }
  if (!bad) {
    console.log('  ' + label.padEnd(22) + checked + ' sentence-counted field(s), all reachable within the ' +
      (cap + 1) + '-word cap');
  }
});
if (budgetFails) { console.log('\nSENTENCE BUDGET INCOHERENT on ' + budgetFails + ' field(s)'); process.exit(1); }

// ---------------------------------------------------------------------------
// v13.99: SOURCE DELIVERY.
//
// The defect this guards against was invisible from inside the prompt and survived
// three audits: every route interpolated the FIRST 12,000 characters of the author's
// reference material, identically, for every section. A 36,802-character source meant
// slides 3, 4 and 5 were written having been shown none of their own material.
//
// This asserts that a section's own material reaches it.
// ---------------------------------------------------------------------------
console.log('\nSource delivery:');
const LONG = Array.from({length: 40}, function (_, i) {
  return 'SECTION ' + (i + 1) + ' HEADING ABOUT SUBJECT ' + (i + 1) + '\n\n' +
    'This part of the manual covers subject' + (i + 1) + ' in detail. The threshold is ' +
    (i + 1) * 7 + ' grams per kilogram and the window is ' + (i + 2) + ' days. ' +
    'It names marker' + (i + 1) + ' as the thing to watch. '.repeat(6);
}).join('\n\n');
let srcFails = 0;
[0, 17, 39].forEach(function (n) {
  const up = P.buildFiveCardUserPrompt(
    { mode: 'workplace', priorityContent: LONG },
    { title: 'Subject ' + (n + 1) + ' and marker' + (n + 1), _sectionIndex: n, _siblingTitles: ['a', 'b'] }
  );
  const got = up.indexOf('marker' + (n + 1)) !== -1 && up.indexOf((n + 1) * 7 + ' grams') !== -1;
  if (!got) { srcFails++; }
  console.log('  section ' + String(n + 1).padStart(2) + ' of 40: ' +
    (got ? 'its own material reached it' : 'ITS OWN MATERIAL WAS NOT SUPPLIED'));
});
if (srcFails) { console.log('\nSOURCE NOT DELIVERED to ' + srcFails + ' section(s)'); }
process.exit((failures || budgetFails || srcFails) ? 1 : 0);
