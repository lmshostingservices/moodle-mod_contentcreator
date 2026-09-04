const {load}=require('./loader.js');
const G=load('mod_contentcreator/generator');

// ---- Fixture A: slide 1.1 of the v13.97.1 pack, verbatim ----------------
const BAD = [
 { cardType:'hook-scenario',
   sceneParts:[
    {title:'Observing a Discussion', text:'During a team meeting, the nutritionist explains how the body produces energy for exercise. She shows why it matters to ATP in muscle contraction. A new team member is curious about how different exercises impact energy needs. They ask questions about the role of nutrition in energy production.'},
    {title:'Explaining Energy Systems', text:'The nutritionist describes the three energy systems: ATP-PC, anaerobic glycolysis, and aerobic. She explains how they work together during exercise.'},
    {title:'Highlighting Practical Implications', text:'The nutritionist uses examples like a sprinter and a marathon runner to illustrate energy demands. She emphasises the need for tailored nutrition strategies.'},
    {title:'Discussing Application', text:'After the meeting, the team member approaches the nutritionist for further clarification. They discuss how to apply this knowledge.'}],
   keyTakeaway:'A deep understanding of energy systems is essential for developing effective and tailored supplement strategies that meet individual needs.' },
 { cardType:'mistakes', items:[
    {mistake:'Overlooking Exercise Type', consequence:'Misaligns supplement recommendations with client needs, which can lead to dissatisfaction and a loss of trust.'},
    {mistake:'Ignoring Nutritional Timing', consequence:'Fails to optimise energy availability during exercise sessions, affecting their in total experience negatively.'},
    {mistake:'Assuming One System Dominates', consequence:'Oversimplifies energy needs, leading to ineffective advice and dissatisfaction.'},
    {mistake:'Neglecting Client Feedback', consequence:'Misses cues for adjusting advice, which can lead to ineffective outcomes.'},
    {mistake:'Using Technical Jargon', consequence:'Alienates clients with complex explanations, which can result in confusion.'}]},
 { cardType:'decision-point',
   question:'How do you integrate energy system knowledge into client consultations well?',
   options:[
    {text:'Discuss exercise types with clients to understand their specific routines and goals, which helps tailor supplement advice based on specific energy demands, improving client outcomes and satisfaction.', correct:true, feedback:'This approach helps tailor supplement advice based on specific energy demands, improving client outcomes.'},
    {text:'Focus solely on aerobic systems', feedback:'This neglects the need for rapid energy, limiting the relevance of your advice.'},
    {text:'Use only technical terms', feedback:'Clients may not understand the information, reducing their trust in your guidance.'},
    {text:'Assume all clients need the same advice', feedback:'This ignores individual differences, leading to ineffective recommendations.'}]}
];

// ---- Fixture B: the same three cards rewritten to spec -------------------
const GOOD = [
 { cardType:'hook-scenario',
   sceneParts:[
    {title:'The Wednesday Call', text:'Marcus rings at 4pm on the Wednesday before his first marathon, three days out from the start line. He is meant to be on 10 grams of carbohydrate per kilo and he has managed six, and he sounds ready to abandon the plan.'},
    {title:'What He Actually Ate', text:'You walk back through his day: porridge, a chicken salad, two bananas and a wholemeal pasta dinner. It is good food and it is far too much fibre to fit 700 grams of carbohydrate around, which is why he is full by lunchtime.'},
    {title:'Three Days Left', text:'Sarah, his running partner, did the same load last year and swears it worked. He wants to know why the number that suited her at 62 kilos should be the number he chases at 88 kilos this week.'},
    {title:'What He Decides', text:'He has one evening to change the plan before Thursday, and he is asking you whether to push through the full target or drop it. Both answers change what he can hold on Sunday, so you cannot leave it vague.'}],
   keyTakeaway:'Carbohydrate loading means 10 to 12 grams per kilogram of body weight daily for two to four days, and it is worth about 2 to 3 per cent over a set distance. A first-timer who has never rehearsed it will not manage that volume, so lower the target or practise it in training.' },
 { cardType:'mistakes', items:[
    {mistake:'Sending a first-timer into a full load', consequence:'Ten to twelve grams per kilo is a genuinely large volume of food, and someone who has never rehearsed it is full by lunchtime on day one. Marcus arrives at the start line under-fuelled and blaming himself for it.'},
    {mistake:'Leaving fibre intake where it was', consequence:'High-fibre, low-GI choices are right for most of the year and wrong for these three days, because they fill the athlete before the carbohydrate target is met. Marcus eats well, misses the load, and cannot work out why.'},
    {mistake:'Treating the marathon as purely aerobic', consequence:'Fat covers the steady miles but converts too slowly for the hill at 30 kilometres or a finishing sprint. The runner who fuelled for fat alone is the one walking the last climb while people stream past.'},
    {mistake:'Skipping carbohydrate past ninety minutes', consequence:'Glycogen runs down from roughly the ninety-minute mark and there is nothing to draw on. Marcus can keep moving but he cannot hold his pace, which is what hitting the wall feels like from the inside.'},
    {mistake:'Copying another athlete’s numbers', consequence:'Sarah loads at 62 kilos and Marcus at 88, so the same gram target is two different plans. Handing him her figure sets him up to under-fuel and to trust the next thing you tell him rather less.'}]},
 { cardType:'decision-point',
   question:'Marcus has 40 minutes of high-intensity intervals booked for Thursday morning. What do you tell him to take on during that session?',
   options:[
    {text:'Nothing during the session, provided his pre-training meal was adequate', correct:true, feedback:'Under about 30 minutes the body has enough available fuel, and at 40 minutes a sound pre-training meal still covers it. The load matters here, not mid-session feeding.'},
    {text:'Around 30 grams of carbohydrate an hour, taken from the first interval', feedback:'That is the right call past about 60 minutes, not at 40. Feeding a short session adds gut load for no performance return on the day.'},
    {text:'A carbohydrate drink rinsed around the mouth and spat out every 15 minutes', feedback:'The mouth rinse is real and it earns its place between 30 and 60 minutes, but with a good pre-session meal it adds little at this duration.'},
    {text:'A protein and fat mix to protect muscle and sustain his energy levels', feedback:'Fat digests slowly and sits in the stomach during hard work. Protein is a recovery nutrient here, not a fuel to take mid-session.'}]}
];

function report(label, cards){
  console.log('\n=== ' + label + ' ===');
  const groups = {
    keyTakeaway: G.keyTakeawayIssues(cards),
    optionParity: G.optionParityIssues(cards),
    fieldLength: G.fieldIssues(cards, 'workplace'),
    concreteness: G.concretenessIssues(cards),
    distractors: G.distractorQualityIssues(cards),
    subjectDrift: G.subjectDriftIssues(cards, 'workplace'),
    meetingOpener: G.scenarioOpeningIssues(cards),
    sameOutcome: G.repeatedOutcomeIssues(cards),
    artefacts: G.artefactIssues(cards),
    depth: G.depthIssues(cards, 'workplace')
  };
  let total=0;
  Object.keys(groups).forEach(k=>{
    total += groups[k].length;
    console.log('  ' + k.padEnd(13) + groups[k].length + ' issue(s)');
    groups[k].slice(0,2).forEach(i=>console.log('      - ' + i.slice(0,150)));
  });
  console.log('  TOTAL: ' + total);
  return total;
}

const bad = report('v13.97.1 output as shipped', BAD);
const good = report('rewritten to spec', GOOD);

// v13.98.1: the five REAL mistakes cards from the shipped pack, extracted from its
// text export. Subject drift and same-outcome between them must catch most of these -
// this is the check no length measurement could ever have made.
const real = require('./real-mistakes.json');
console.log('\n=== subject drift across the five real mistakes cards ===');
let caught = 0;
real.forEach(function (card, i) {
  const d = G.subjectDriftIssues([card], 'workplace');
  const o = G.repeatedOutcomeIssues([card]);
  if (d.length || o.length) { caught++; }
  console.log('  slide 1.' + (i + 1) + ': drift=' + d.length + ' same-outcome=' + o.length);
});
console.log('  caught ' + caught + ' of 5');
console.log('  PD is exempt from drift (its subject IS communication): ' +
  G.subjectDriftIssues(real, 'pd').length + ' issue(s), expect 0');

console.log('\nBad flags ' + bad + ' issues, compliant flags ' + good + '.');
// The compliant fixture was written to the pre-v13.98.1 ranges, so a few of its fields
// now sit just under the raised minima. What must hold is the SEPARATION.
process.exit(bad > 3 * good && caught >= 3 && G.subjectDriftIssues(real, 'pd').length === 0 ? 0 : 1);
