I read both files in full. Here is the checklist.

---

# CONTENT QUALITY STANDARD
## AI-generated workplace and vocational learning content
### Version 1.0 — source of truth for prompt design and automated validation

---

## HOW TO USE THIS DOCUMENT

Every criterion has an ID (`T0-1`, `T2-4`…). Prompts should be traceable to IDs. Validators should be named after IDs. If a rule is not on this list, it is not a rule.

**Three terms are load-bearing throughout. Define them once, use them everywhere.**

**TEACHABLE SPECIFIC.** An atom of transferable substance. It is one of:
- a number, duration, threshold, dose, ratio or tolerance (`10–12 g/kg/day`, `2–3 seconds`, `30 g per hour`)
- a named entity, tool, standard, protocol, study or person (`beta-alanine`, `Louise Burke race-walker study`, `carbohydrate mouth rinse`, `AS/NZS 3000`)
- a rule with a stated boundary condition (`below 30 minutes, no carbohydrate during exercise; beyond 90 minutes, it becomes critical`)
- a causal mechanism with a named intermediate (`beta-alanine → carnosine → intramuscular buffering`)
- a named failure state and its observable signature (`bonking — you can keep moving but cannot hold the pace`)

Not a teachable specific: "tailored", "balanced", "important", "understanding energy systems", "individual needs", "optimal performance". These are category labels. **The whole of the failing pack is built from category labels.**

**SOURCE ANCHOR.** A teachable specific that is traceable to the uploaded source material. Machine-checkable by string/number matching against the source.

**PROCEDURAL vs. META-PROCEDURAL.** A procedure is the steps of the work (`weigh the athlete, multiply by 10, subtract fibre-heavy foods, spread across 2–4 days`). A meta-procedure is the steps of *talking about* the work (`assess needs, explain clearly, tailor advice, monitor feedback, keep learning`). Meta-procedure is the single most common generated failure mode because it can be written without knowing anything. Every mental-model card in the failing pack is meta-procedure.

---

# TIER 0 — DISQUALIFYING

Six rules. Any failure and the pack is not shippable at any price. These are all machine-checkable and should be hard gates in the pipeline, not review items.

### T0-1 — SOURCE FIDELITY FLOOR
**The rule.** Each slide contains at least **six** source anchors, of which at least **two** are numeric or named-entity anchors. Across the pack, at least **60%** of the teachable specifics present in the source appear somewhere in the output.

**Observe in seconds.** Open the source, open the slide. Circle every number and proper noun in the source section. Count how many appear in the slide.

**Machine check.** YES, and this is the most important validator you will build. Extract candidate specifics from the source (regex for numbers with units, gram/percent/minute/second patterns; capitalised multi-word terms; named-entity recognition). Extract the same from output. Compute recall. Gate at 60% pack-level, 6 anchors per slide.

**FAIL (real).** The source teaches: stored ATP lasts 2–3 seconds; creatine phosphate adds 6–8 seconds; ATP-PC covers ~10 seconds; anaerobic glycolysis 1–7 minutes; carbohydrate loading at 10–12 g/kg/day for 2–4 days yielding 2–3% improvement; 30 g/hour between 60 minutes and 2 hours; the carbohydrate mouth rinse and its oral receptor mechanism; beta-alanine → carnosine buffering; Louise Burke's race-walker study finding ketogenic inferior with higher perceived exertion; low-carbohydrate diets reducing exercise economy; train low / compete high; sleep low; the AFL midfielder vs. full forward contrast; high-GI in recovery from long endurance work, low-GI otherwise. **The entire five-slide output contains one number: "under 10 seconds".** Roughly forty teachable specifics in; approximately one out. Recall ≈ 3%.

**PASS.** A concept-explainer panel reading: *"Stored ATP runs out in 2–3 seconds. Creatine phosphate buys another 6–8. That is your whole ATP-PC budget: about ten seconds. A 100 m sprint fits inside it. A 400 m does not."*

**Why.** Learning is the acquisition of specifics. Content that generalises the source has not compressed it, it has deleted it. There is nothing left to transfer.

---

### T0-2 — NO SUBJECT DRIFT
**The rule.** The scenario cards must be set in the situation where the source's knowledge is *used*, and the actions performed in them must be the actions the source teaches. A generic workplace frame (meeting, email, colleague disagreement, client call) is only permissible if the source's subject is genuinely a workplace-interaction subject.

**Observe in seconds.** Read the four hook panels. Ask: *could I have written these having read only the slide title?* If yes, fail.

**Machine check.** PARTIAL. Flag any pack where ≥60% of hook-scenario cards contain a term from the generic-office lexicon (`team meeting`, `colleague`, `stakeholder`, `deadline`, `client call`, `presentation`, `morale`, `product launch`) while the source contains none of them. Also flag domain-noun density: scenario cards should carry ≥3 domain nouns per card.

**FAIL (real).** Every one of the five hooks is a meeting. Slide 1.3 — "Matching Nutrition and Supplements to Exercise" — opens with a nutritionist and an exercise physiologist disagreeing, a marketing team needing a product launch strategy, and "team tension… negatively impacts productivity". Not one panel contains an athlete exercising. The source's subject is what happens inside a working muscle; the output's subject is office harmony at a supplement company. **The source was never about this.**

**PASS.** *"Ninety minutes into her first marathon, Priya's legs still work but her pace has dropped forty seconds a kilometre and she can't get it back."*

**Why.** Transfer is governed by the match between encoding context and retrieval context. Content encoded in a meeting room does not retrieve on a start line.

---

### T0-3 — NO INTERNAL DUPLICATION
**The rule.** No content block appears twice within a slide. No card is substantially identical to the same card type in another slide of the same pack (cosine similarity < 0.80 between same-type cards).

**Observe in seconds.** Scroll. If your eye catches the same sentence twice, fail.

**Machine check.** YES, trivially. Exact-match and near-match detection within and across cards. This should never have reached a human.

**FAIL (real).** In slide 1.1 the five mistakes appear twice verbatim, once as bullets and again as `Error:` blocks. The competency-summary's five items appear **four times** in the same card. And slide 1.5's concept-explainer is a near-copy of 1.4's, which is a near-copy of 1.3's, 1.2's and 1.1's — **all five slides explain the same three energy systems**, so the source's topics 2, 3, 4 and 5 (fuelling, supplements, endurance strategy, during/recovery) received no conceptual teaching at all.

**PASS.** Five slides, five distinct concept-explainers: energy systems; fuel selection by intensity; supplement–system matching; glycogen loading; intra-exercise and recovery fuelling.

**Why.** Repetition without variation produces no additional learning and destroys credibility. Repetition of the *identical* card across a pack means four-fifths of the pack is empty.

---

### T0-4 — SCAFFOLD HONESTY
**The rule.** A structural slot may not be filled with a placeholder, a mislabelled slot, or a restatement of its own heading. If a slot has no legitimate content in this domain, it is omitted, not padded.

**Observe in seconds.** Read every labelled slot. Does the label describe the content?

**Machine check.** YES for the specific pathologies: slot content that is a substring of, or ≥0.9 similar to, the card title or the summary; a `Legislation` slot with no citable instrument (no Act, standard, regulation, clause number, or named guideline).

**FAIL (real).** `Legislation: The Three Energy Systems / Obligation: Practitioners should deeply understand how different energy systems impact exercise performance.` This is not legislation. There is no legislation. The slot demanded a governing rule and the generator invented a fake obligation to fill it. Worse, the `Connection` line and the `Summary` line are the identical sentence in all five slides.

**PASS.** Either a real instrument — *"Sports Dietitians Australia position statement: beta-alanine supplementation requires individualised loading protocols; recommend referral rather than blanket prescription"* — or the slot is empty and the card renders without it.

**Why.** A fabricated authority statement is worse than no authority statement: it teaches learners to trust a false frame, and it is a compliance liability in exactly the regulated domains where this product is sold.

---

### T0-5 — THE ANSWER IS NOT GUESSABLE
**The rule.** The decision-point's correct option must not be identifiable without the content. Specifically: the correct option's length must be within ±30% of the mean distractor length, and no distractor may be an option no competent practitioner would ever choose.

**Observe in seconds.** Cover the card content. Read the four options. If you can pick the right one, fail.

**Machine check.** YES for length. PARTIAL for strawman detection: flag distractors containing absolutist markers (`only`, `solely`, `all`, `never`, `ignore`, `overlook`, `rely solely`) — these are the linguistic fingerprint of a strawman.

**FAIL (real).** Slide 1.1: option A runs 34 words; B is "Focus solely on aerobic systems" (5 words); C "Use only technical terms" (4); D "Assume all clients need the same advice" (7). Three of four distractors contain `solely`/`only`/`all`. The answer is visible from across the room. In all five slides, **every** correct option is the longest, and **every** distractor is a strawman. The question functions as a formatting artefact, not an assessment.

**PASS.** *"A 68 kg club runner has four days to her first marathon and has never carb-loaded. What do you set as her target?*
*A) 10–12 g/kg/day for the full four days — the evidence-based dose (680–816 g/day).*
*B) 7 g/kg/day for three days, with fibre reduced — achievable, and captures most of the benefit.*
*C) Normal eating plus a large pasta meal the night before.*
*D) 10–12 g/kg/day but only for the final 24 hours."* — B is right; A is the textbook answer that ignores the practice constraint the source explicitly raises; all four are things real people do.

**Why.** Testing effect requires actual retrieval. A guessable item produces no retrieval and gives the learner false confidence.

---

### T0-6 — LANGUAGE INTEGRITY
**The rule.** No sentence contains a word-substitution artefact, agreement error, or non-idiomatic collocation.

**Observe in seconds.** Read three sentences aloud. If any is not English a professional would write, fail.

**Machine check.** YES. Maintain a blocklist of known substitution artefacts and grep for them. The current pipeline evidently performs a post-hoc word replacement (`overall`→`in total`, `effectively`→`well`, `appropriate`→`right`, `facilitate`→`help with`) with no grammatical awareness.

**FAIL (real).** *"affecting their performance and in total experience negatively"*; *"impacting in total success"*; *"their in total athletic performance"*; *"the most right nutritional support"*; *"you help with a discussion"*; *"This system quickly uses oxygen"* (the aerobic system's defining property is that it is *slow*, and the substitution has introduced a factual error); *"Matching nutrition to energy systems well"*; *"Communicating clearly and well"*.

**PASS.** Sentences that survive being read aloud to a subject-matter expert.

**Why.** Disfluency is attributed to the source, not the medium. A learner who trips over "in total performance" stops believing the content and correctly concludes a machine wrote it without care.

---

# TIER 1 — THE CONTENT IS ABOUT SOMETHING

Substance, fidelity, specificity. The difference between teaching a subject and describing that a subject exists.

### T1-1 — SPECIFIC DENSITY
**Rule.** Every content card carries ≥2 teachable specifics. The seven-card slide carries ≥12 total.
**Observe.** Highlight every number, name and threshold on the card. Two or more marks = pass.
**Machine.** YES. Count numerics + named entities + bounded rules per card.
**FAIL (real).** The slide 1.5 mental-model card: five steps, zero specifics. "Identify exercise type. Assess energy demands. Consider nutrition needs. Monitor athlete feedback. Adjust recommendations."
**PASS.** "Under 30 minutes: nothing needed. 30–60: a mouth rinse will do — the receptors are oral, you can spit it out. 60–120: 30 g/hour. Beyond 2 hours: 60–90 g/hour and practise it in training first."
**Why.** Specificity is the precondition for both encoding and retrieval; abstractions have no retrieval cues.

### T1-2 — THE CARD TEACHES SOMETHING THE TITLE DOESN'T
**Rule.** Delete the card body. Could a competent generalist reconstruct 80% of it from the title alone? If yes, fail.
**Observe.** The reconstruct test, done in your head, in ten seconds.
**Machine.** PARTIAL. Proxy: content-word overlap between title and body >40% = flag.
**FAIL (real).** Title "Discuss Nutritional Needs" / body "Explain how nutrition supports their specific energy system, offering food examples that are easy to incorporate."
**PASS.** Title "Why not fat load?" / body "You already carry 30+ times more energy as fat than as glycogen. Availability was never the constraint. Conversion *rate* is. That is why the strategy is loading carbohydrate, not fat."
**Why.** Zero-information content consumes attention without adding schema.

### T1-3 — MECHANISM, NOT ONLY OUTCOME
**Rule.** Each concept-explainer states at least one causal mechanism with a named intermediate step — what happens, in what order, inside the system.
**Observe.** Find a "because" that is followed by a mechanism rather than a benefit.
**Machine.** PARTIAL. Flag concept-explainers where the only causal connectives lead to outcome nouns (`performance`, `results`, `satisfaction`, `trust`).
**FAIL (real).** "This system supports high-intensity exercise lasting several minutes by using carbohydrates to produce ATP rapidly."
**PASS.** "Glycolysis splits glucose to ATP without oxygen and leaves lactate and hydrogen ions behind. The H⁺ is what burns. Carnosine buffers it, beta-alanine is the rate-limiting precursor of carnosine — which is the entire reason the supplement exists."
**Why.** Mechanistic understanding is what allows transfer to novel cases; outcome-only knowledge transfers to nothing.

### T1-4 — QUANTITY, THRESHOLD OR BOUNDARY PRESENT
**Rule.** Where the source gives a number, threshold or boundary, the output carries it. Where the source gives a range, the output carries the range, not the midpoint.
**Observe.** Diff the numbers.
**Machine.** YES. Numeric recall against source, with unit matching.
**FAIL (real).** Source: "10–12 grams per kilogram of body weight per day for 2–4 days… improves performance by 2–3%." Output: the phrase "carbohydrate loading", once, in a mental-model step, with no quantity.
**PASS.** The numbers, with their units and their scope condition.
**Why.** A threshold is what converts knowledge into a decision. Without it the learner cannot act.

### T1-5 — NAMED EXEMPLARS OVER CATEGORIES
**Rule.** Where the source names a person, study, product, tool, or case, the output names it too.
**Observe.** Scan for proper nouns. Zero proper nouns in a slide drawn from a source rich in them = fail.
**Machine.** YES. Proper-noun recall.
**FAIL (real).** The Louise Burke race-walker study — a named researcher, a named athlete population, a specific finding (ketogenic inferior), a specific secondary outcome (higher perceived exertion, "it felt harder") — appears nowhere. Nor does the AFL midfielder / full forward contrast, which is the source's single best teaching example.
**PASS.** "Burke's race walkers got *better* at burning fat and *worse* at racing. Their perceived exertion went up. Fat oxidation is not the goal; performance is."
**Why.** Named cases are episodic hooks; categories are not memorable and not citable.

### T1-6 — NO FACT INTRODUCED THAT IS NOT IN THE SOURCE
**Rule.** Every claim is either in the source or is uncontroversial general knowledge. No invented statistics, obligations, or attributions.
**Observe.** Pick the three most confident-sounding claims. Find them in the source.
**Machine.** PARTIAL. Flag numerics and named entities in the output with no source match — these are candidate hallucinations and must be reviewed.
**FAIL (real).** "Practitioners must match energy systems with right nutrition and supplements for optimal performance" presented under a `Legislation` heading — a fabricated professional obligation.
**PASS.** Every anchor traceable to a line in the upload.
**Why.** Fabrication in vocational content is not a quality defect, it is a liability.

### T1-7 — THE SLIDE'S KEY TAKEAWAY IS THE SLIDE'S SUBJECT
**Rule.** The takeaway names the subject and states a claim about it. It may not be a generic professional virtue.
**Observe.** Read the takeaway. Does it contain a subject noun from the source?
**Machine.** YES. Require ≥2 domain terms; blocklist takeaways whose head noun is `trust`, `confidence`, `communication`, `collaboration`, `productivity`.
**FAIL (real).** Slide 1.4, titled "Endurance Nutrition and Advanced Fuelling Strategies", has the takeaway: *"Providing quick, informed responses is essential to building and maintaining client trust and confidence in your expertise."* This is a takeaway about customer service attached to a slide about glycogen. Slide 1.3's takeaway is about "team confidence and productivity". Slide 1.5 has **no takeaway at all**.
**PASS.** "Carbohydrate loading works — about 2–3% — but only if the athlete has practised eating that much."
**Why.** The takeaway is the retrieval handle for the whole slide. A wrong handle indexes nothing.

---

# TIER 2 — THE LEARNER DOES SOMETHING

This is the weakest area of the product by a wide margin. In the entire failing pack — 35 cards — the learner is asked to do exactly five things, all of them at the very end of a slide, all of them guessable. The learner is a reader for 34 cards out of 35.

### T2-1 — RETRIEVAL BEFORE EXPOSITION
**Rule.** At least one card per slide asks the learner to commit to an answer *before* the content that answers it is presented. Structurally: the hook-scenario must end on an unresolved question the learner is asked to answer, not on a tidy resolution.
**Observe.** Read the fourth hook panel. Does it end in a question mark or a decision the learner must make? Or does it end in the characters resolving it themselves?
**Machine.** YES. Require the terminal hook panel to contain an interrogative directed at the learner (second person + `?`), or an explicit prompt token.
**FAIL (real).** Every hook resolves itself. Slide 1.1 panel 4: *"After the meeting, the team member approaches the nutritionist for further clarification… The conversation sparks ideas for new product development."* The learner has watched other people learn.
**PASS.** *"She's at 32 km, pace collapsing, and she's had water only. You have ten seconds to tell her what to take and how much. What do you say?"* — then the concept card.
**Why.** Pretesting / the generation effect: an unsuccessful retrieval attempt before exposure substantially improves retention of the subsequent exposure.

### T2-2 — PREDICTION POINT
**Rule.** At least one card asks the learner to predict an outcome before revealing it.
**Observe.** Look for "what happens next / which one / how much" addressed to the learner.
**Machine.** PARTIAL. Detect second-person interrogatives outside the decision-point card. Currently: zero across the pack.
**FAIL (real).** Nothing in the pack asks the learner to predict anything.
**PASS.** Mental-model step: *"Two athletes, same 90-minute session. One had a normal breakfast, one trained fasted. Which one's session felt harder — and which one's adaptation was larger? (They are not the same answer.)"*
**Why.** Prediction errors drive encoding; a violated expectation is remembered where a confirmed one is not.

### T2-3 — DESIRABLE DIFFICULTY IN THE DISCRIMINATION
**Rule.** The decision-point must require a discrimination between two defensible options, not between an answer and three strawmen. At least two options must be things a competent practitioner might actually choose.
**Observe.** Ask of each distractor: *has a real professional ever done this on purpose?* Need at least two yeses.
**Machine.** PARTIAL. Strawman-marker detection (T0-5) plus a required-review flag when the correct option is also the most abstract.
**FAIL (real).** Slide 1.5: "A) Integrate varied exercises and nutrition strategies to engage all energy systems well" against "B) Focus solely on aerobic training", "C) Rely on a single exercise type", "D) Overlook client feedback". Nobody chooses D. This is not a test.
**PASS.** *"Athlete does 75 minutes of interval work. Carbohydrate during the session? A) None — under 90 minutes. B) 30 g. C) 60 g. D) Mouth rinse only."* — B is right, A and D are defensible for lower intensities, C is over-fuelling. All four are live.
**Why.** Discriminations near the boundary are what build usable category structure; discriminations against absurdity build none.

### T2-4 — FEEDBACK EXPLAINS THE MISCONCEPTION, NOT THE PENALTY
**Rule.** Each distractor's feedback names *why someone would believe it* and *what specifically is wrong*, in that order. Feedback that only states a consequence fails.
**Observe.** Read one distractor's feedback. Does it contain a fact? Or only a bad outcome?
**Machine.** YES. Require ≥1 teachable specific per feedback string; flag feedback whose content words are exclusively outcome/affect terms.
**FAIL (real).** *"B) Focus solely on aerobic systems → This neglects the need for rapid energy, limiting the relevance of your advice and potentially leading to ineffective recommendations."* Nothing is corrected. The learner who chose B is told they will be less effective, which they already suspected, and learns no fact.
**PASS.** *"A) None — under 90 minutes. Reasonable rule, wrong case. The 90-minute guide assumes steady moderate intensity. Interval work burns glycogen far faster; at 75 minutes of intervals she's already low. 30 g/hour."*
**Why.** Corrective feedback that addresses the specific misconception is the strongest single lever in the testing-effect literature; outcome-only feedback is close to inert.

### T2-5 — GENERATION, NOT RECOGNITION, AT LEAST ONCE PER SLIDE
**Rule.** At least one prompt per slide requires the learner to produce something — a number, a phrase, a decision — rather than select it.
**Observe.** Is there any blank the learner fills?
**Machine.** YES if the schema supports a free-response or numeric-entry slot; otherwise this is a schema gap and should be raised as a product requirement.
**FAIL (real).** Zero generation across the pack. Seven card types, one of which is interactive, and it is multiple choice.
**PASS.** *"Your athlete is 72 kg. Write her daily loading target."* (720–864 g.)
**Why.** Generation effect: self-produced answers are retained substantially better than recognised ones.

### T2-6 — THE MISTAKES CARD IS DIAGNOSTIC, NOT MORAL
**Rule.** Each mistake describes a specific wrong action with a specific technical consequence, and is a mistake a *knowledgeable* person makes. "Not caring", "not listening", "not keeping up to date" are not mistakes, they are character flaws.
**Observe.** Does each mistake name a thing done wrongly, or an attitude held wrongly?
**Machine.** PARTIAL. Flag mistakes whose head verb is `ignoring`, `neglecting`, `overlooking`, `failing to`, `assuming`, `rushing` — this construction indicates a moral rather than technical error. In the failing pack, **24 of the 25 mistakes** use it.
**FAIL (real).** "Neglecting to Update Knowledge → Stagnates practice with outdated information." "Using Technical Jargon → Alienates clients." These are true of every profession in existence and were written without reading the source.
**PASS.** "Loading with the athlete's usual high-fibre carbohydrates → they fill up at 6 g/kg and never reach target, then blame the strategy. Drop fibre and fat for the loading window only."
**Why.** Error-based learning requires the errors to be the ones actually made at the boundary of competence.

### T2-7 — THE MENTAL MODEL IS THE PROCEDURE OF THE WORK
**Rule.** Steps must be executable by someone holding the tools of the trade, and at least three of the 4–5 steps must contain a teachable specific. Consultation meta-procedure (`assess → explain → tailor → monitor → keep learning`) is a fail.
**Observe.** Could you follow these steps and produce an artefact? Or only have a conversation?
**Machine.** YES. Require ≥3 of 5 steps to contain a numeric or named entity; blocklist the meta-procedure verb sequence.
**FAIL (real).** All five mental models are the same meta-procedure. Slide 1.2: "Assess Activity Type → Explain Energy Systems → Tailor Nutrition Advice → Monitor Client Feedback." Slide 1.4 differs only in wording. Not one step tells the learner what to actually do with a number.
**PASS.** "1. Weigh the athlete. 2. Multiply by 10 for a first load target; use 7 if they've never loaded. 3. Strip fibre and fat from the four days. 4. Divide across 5–6 feeds — nobody hits target in three meals. 5. Rehearse it once in training four weeks out; if they can't eat it then, the number is wrong."
**Why.** Procedural knowledge is stored and retrieved differently from declarative; steps that are not executable are declarative content wearing a numbered list.

---

# TIER 3 — IT STICKS

### T3-1 — THE HOOK NAMES A PERSON, A MOMENT AND A STAKE IN THE FIRST 15 WORDS
**Rule.** Literally that. A named human, a specific time or place, and something that can be lost.
**Observe.** Read 15 words. Count three things.
**Machine.** YES. First-15-word window: require a proper-noun person, a temporal/spatial marker, and a stake term.
**FAIL (real).** "During a team meeting, the nutritionist explains how the body produces energy for exercise." One unnamed role, no moment, no stake.
**PASS.** "Thirty-two kilometres in, Priya's pace has gone and there are ten to run."
**Why.** Concreteness and named agents are the strongest predictors of recall in narrative material.

### T3-2 — SAME PEOPLE, LATER (SCENARIO CONTINUITY)
**Rule.** The applied-scenario contains the same named individuals as the hook, at a later, specified point in time, with the earlier situation explicitly resolved by the specific thing the slide taught.
**Observe.** Are the names the same? Is the resolution attributable to a specific taught fact?
**Machine.** YES for name continuity — string-match named entities across hook and applied cards. PARTIAL for resolution attribution: require ≥1 teachable specific from this slide's concept/mental-model cards to appear in the applied card.
**FAIL (real).** Slide 1.1's hook features "the nutritionist" and "a new team member"; the applied scenario features "you" and an unnamed triathlon client. Different people, different problem. And the resolution is: *"You suggest specific supplements to support their energy demands"* — without naming one. The card claims specificity while containing none.
**PASS.** Priya, next marathon, at 32 km, taking her fourth 30 g gel on schedule, pace holding.
**Why.** Narrative closure over a continuous cast is what converts a fact into an episode; episodes survive six months, facts do not.

### T3-3 — ONE CONCRETE IMAGE PER SLIDE
**Rule.** Each slide contains at least one physically imaginable image, analogy or number-made-tangible.
**Observe.** Can you see it?
**Machine.** NO. Human review, or LLM-judge with a rubric.
**FAIL (real).** Nothing in 35 cards is visualisable. Note that the source *offered* one and it was discarded: "the three energy systems should not be viewed like traffic lights that simply switch on and off."
**PASS.** "Not traffic lights — a mixing desk. All three faders are always up; the intensity of what you're doing decides which one is loudest." Or: "10–12 g/kg for a 70 kg runner is about 850 g of carbohydrate — fourteen cups of cooked rice, every day, for four days. Now you see why it needs practising."
**Why.** Dual coding: verbal plus imageable representation roughly doubles recall over verbal alone.

### T3-4 — PROFESSIONAL SALIENCE: THE STAKE IS THE LEARNER'S OWN
**Rule.** The consequence of getting it wrong must land on the learner or someone they are responsible for, in terms that matter in their trade — not on "trust", "reputation" or "satisfaction" in the abstract.
**Observe.** What actually goes wrong? Name it.
**Machine.** PARTIAL. Flag packs where >70% of consequence strings terminate in `trust`, `satisfaction`, `credibility`, `reputation`, `dissatisfaction`, `morale`.
**FAIL (real).** Essentially every consequence in the pack. "Loss of trust." "Client dissatisfaction." "Impacting in total business growth." Twenty-five mistakes, and not one of them results in an athlete performing worse for a stated physiological reason.
**PASS.** "She blows up at 32 km on the day she's been building towards for nine months, and it was a fixable fuelling error."
**Why.** Emotional and self-relevant encoding produces markedly stronger consolidation; abstract reputational stakes produce none.

### T3-5 — ONE SURPRISE PER SLIDE
**Rule.** Each slide contains at least one claim that contradicts a plausible lay assumption, and flags it as counter-intuitive.
**Observe.** Did anything make you go "huh"?
**Machine.** PARTIAL. Detect contrast markers (`but`, `however`, `counter-intuitively`, `you'd expect`) attached to a teachable specific.
**FAIL (real).** Nothing in the pack is surprising. Everything is what you'd guess.
**PASS.** "You'd expect the fat-adapted walkers to do better. They got measurably worse — and it *felt* harder too." Or: "You don't even have to swallow it. Rinse and spit works under an hour, because the receptors are in your mouth, not your gut."
**Why.** Prediction error is the trigger for memory consolidation. Content that confirms expectations is not encoded as new.

### T3-6 — SPACED RE-ENCOUNTER ACROSS THE PACK
**Rule.** Each slide's central specifics must recur, in a *changed* form, in at least one later slide — as a callback, a harder application, or a distractor.
**Observe.** Does slide 4 use anything from slide 1?
**Machine.** YES. Track teachable-specific identifiers across slides; require ≥2 cross-slide reappearances per pack, and require the surrounding text to differ.
**FAIL (real).** The three energy systems are *repeated verbatim* in all five slides — which is not spacing, it is duplication (T0-3), because nothing is asked of them the second time. Meanwhile no specific from any slide is ever applied in a later one.
**PASS.** Slide 1 teaches the 10-second ATP-PC window. Slide 3's decision-point asks why creatine helps a netballer and not a marathoner, and the learner has to reach back for it.
**Why.** Spaced retrieval with varied context is the highest-yield intervention in the whole literature. Verbatim restatement is the lowest.

---

# TIER 4 — IT IS WELL MADE

### T4-1 — REGISTER MATCHES THE TRADE
**Rule.** Vocabulary and sentence length match how the audience speaks at work. Technical terms are used, and defined once, at first use.
**Observe.** Would a sparky, a barista or a physio say this sentence?
**Machine.** PARTIAL. Mean sentence length ≤22 words; corporate-abstraction density; check that each technical term's first occurrence is within 20 words of a definition.
**FAIL (real).** "This detailed assessment helps in tailoring nutrition advice to meet specific energy needs well." Also: `glycolysis`, `ATP`, `creatine phosphate` and `macronutrients` are all used without definition, while `tailored` and `optimal` are used forty times.
**PASS.** "Glycogen is just carbohydrate parked in your muscles. You hold about 500 g of it. That's the tank."
**Why.** Register mismatch signals the content was not made for this audience, and predicts disengagement independent of content quality.

### T4-2 — LOAD DISCIPLINE
**Rule.** ≤1 new concept per panel; ≤3 new terms per card; ≤7 new terms per slide.
**Observe.** Circle new terms on a card. More than three, fail.
**Machine.** YES. Term-novelty tracking across the pack.
**FAIL (real).** Not a live failure here — the pack fails in the opposite direction, introducing almost nothing. Note that fixing Tier 1 *will* create Tier 4 load pressure, and this rule is the counterweight.
**PASS.** Concept card introduces `glycogen` and `glucose` and nothing else.
**Why.** Intrinsic load is finite; exceeding it converts teaching into exposure.

### T4-3 — VARIETY ACROSS THE PACK
**Rule.** Across the pack's slides, same-type cards must differ in structure, not only in wording: hook settings must span ≥3 distinct situations; mental models must not share a step template; decision-points must vary in question stem type (diagnose / choose / quantify / sequence / rule out).
**Observe.** Read all five hooks in a row. Are they the same scene?
**Machine.** YES. Structural fingerprinting per card type, similarity threshold, plus a required stem-type distribution.
**FAIL (real).** Five hooks, five meetings. Five mental models, one template. Five decision-points, all "How do you ensure X well?" — three of them literally begin "How do you ensure".
**PASS.** Hook 1 mid-race; hook 2 in a supermarket aisle at 9pm; hook 3 in a clinic with a sceptical client; hook 4 four days out with a full plate; hook 5 in the finish chute.
**Why.** Contextual variation during encoding is what makes retrieval robust to new contexts.

### T4-4 — COHERENCE OF THE UNIT
**Rule.** All seven cards of a slide are about the same subtopic, and the slide title, takeaway, concept, model, mistakes and question all point at the same competency.
**Observe.** Write the slide's one-line purpose from the title. Now check each card against it.
**Machine.** PARTIAL. Term-overlap between title and each card; flag cards below threshold.
**FAIL (real).** Slide 1.4 is titled endurance fuelling; its takeaway is about response speed and client trust; its concept card is the generic three energy systems; its mental model is a consultation script; its mistakes are communication faults; its question is "How do you ensure your nutrition advice aligns with a client's unique endurance goals?" Six cards, six subjects, none of them endurance fuelling.
**PASS.** Seven cards that could each be captioned with the same eight-word competency statement.
**Why.** Coherence is what allows the seven cards to build one schema rather than seven fragments.

### T4-5 — ACCESSIBILITY AND PLAIN STRUCTURE
**Rule.** Sentences average ≤22 words; no sentence over 40; lists are parallel in grammatical form; no card relies on colour, position or an unlabelled visual to carry meaning; every abbreviation expanded at first use.
**Observe.** Find the longest sentence. Count it.
**Machine.** YES, entirely.
**FAIL (real).** "Align supplements with the energy system being used. For brief, intense activities, recommend creatine; for endurance sports, suggest carbohydrates to meet the energy needs well, making sure that athletes receive the most right nutritional support tailored to their specific exercise requirements." (41 words, ungrammatical, ends in filler.) Also the competency-summary lists mix full sentences with bare fragments ("Matching nutrition to energy systems well") in the same card.
**PASS.** Parallel, expanded, short.
**Why.** Every point of syntactic friction is extraneous cognitive load spent on decoding rather than learning.

### T4-6 — NO FILLER CLAUSES
**Rule.** No sentence ends in a clause that adds no information. Ban the trailing-benefit construction: `…, which improves outcomes and satisfaction.`
**Observe.** Delete the last clause. Did you lose anything?
**Machine.** YES. Pattern-match trailing `, which …` / `, leading to …` / `, making sure …` clauses whose content words are all abstractions.
**FAIL (real).** "…making sure they receive the most effective support possible." "…which is key to improving satisfaction and achieving desired results." "…leading to greater satisfaction and success." Roughly one in three sentences in the pack ends this way.
**PASS.** The sentence stops when the information stops.
**Why.** Filler dilutes signal density and trains the learner to skim, which then costs you the sentences that mattered.

---

# A. THE PACK-LEVEL TESTS

Seven tests that cannot be judged on a single card. Run them after every card passes.

**P-1 — TOPIC PARTITION.** Each slide teaches a *different* subtopic. Compute pairwise similarity of concept-explainer cards across slides; any pair above 0.80 is a failure. **Real result: all ten pairs fail.** The source contained five genuinely distinct topics — energy systems, macronutrient fuelling, supplement matching, endurance strategy, during-and-after — and the output taught topic 1, five times.

**P-2 — SOURCE COVERAGE MAP.** Every major section of the source maps to at least one slide, and every slide maps back to a source section. Machine-checkable by section-to-slide anchor matching. **Real result:** source sections on carbohydrate loading, train-low/compete-high, sleep low, beta-alanine, creatine protocols, the mouth rinse, the duration ladder, high- vs low-GI recovery, and the Burke study map to **nothing**. Coverage of the source's teachable content: under 10%.

**P-3 — THE SPINE.** State the pack's argument in one sentence of the form *"Because X, therefore Y, which is why Z."* If you cannot, there is no spine. **PASS:** "Because all three energy systems always run and only their mix changes, fuel has to be matched to intensity and duration rather than to sport — which is why the practical questions are always 'how hard, how long, and what did you eat first'." **Real result:** the pack has no spine; each slide restarts from zero.

**P-4 — PROGRESSION.** Later slides must be harder, and must presuppose earlier ones. Measure: new-specific count per slide should not decline; ≥1 explicit backward reference per slide after the first; decision-point difficulty should rise. **Real result:** slide 5 is no harder than slide 1 and contains no reference to any earlier slide. There is no reason the five slides are in this order.

**P-5 — CAPABILITY DELTA.** Write the sentence: *"After this pack, a learner can [verb] [object] [under condition] that they could not before."* It must contain a specific. **PASS:** "…can set a carbohydrate-loading target in g/day for a named athlete, adjust it for a first-timer, and say what to strip from the diet to make it achievable." **Real result:** the only honest completion is "…can name three energy systems", which most of the audience could already do. Delta ≈ 0.

**P-6 — NON-REPETITION OF EXAMPLES.** No exemplar (sprinter, marathon runner, soccer player) is used more than twice across a pack. **Real result:** "sprinting and weightlifting" appears in all five concept cards; "soccer" in four. The pack has four distinct examples total, all of them generic, while the source supplied twenty-plus specific ones including AFL positional demands, race walkers, netball take-offs, the swimmer's block dive, road-cycling intermediate sprints and the first-time weekend-warrior marathoner.

**P-7 — ASSESSMENT COVERAGE.** The pack's decision-points must collectively test the pack's main specifics, and no two questions may test the same discrimination. **Real result:** all five questions test the same proposition — "consider the individual and communicate clearly" — and none tests any content from the source. A learner could answer all five correctly without opening the pack.

---

# B. THE TEN QUESTIONS

The practical instrument. In order. Stop at the first "no" in questions 1–3 and reject.

1. **Open the source. Circle every number and proper noun in the section this slide came from. How many are in the slide?** *Fewer than six: reject.* (T0-1)
2. **Read the four hook panels. Could you have written them from the title alone, without the source?** *Yes: reject.* (T0-2)
3. **Does any block of text appear twice in this pack?** *Yes: reject.* (T0-3)
4. **Cover the cards. Read only the four answer options. Can you pick the right one?** *Yes: the assessment is decorative.* (T0-5)
5. **Read the five mistakes. Are these errors a knowledgeable person makes, or things a careless person is?** *If they'd be true in any job, they were written without reading the source.* (T2-6)
6. **Follow the mental-model steps. Do you produce anything — a number, a plan, a setting? Or do you just have a conversation?** (T2-7)
7. **What is the one number a learner will remember from this slide?** *If there isn't one, the slide has no handle.* (T1-4, T3-1)
8. **Are the people in the applied scenario the same people, by name, as in the hook — and is their problem solved by a specific thing this slide taught?** (T3-2)
9. **Read the five concept-explainers side by side. Are they five explanations, or one explanation five times?** (P-1)
10. **Complete the sentence: "After this pack, a learner can ___ that they could not before."** *If you cannot put a specific in the blank, nothing was taught.* (P-5)

Questions 1, 3, 4 and 9 are fully automatable and should never reach a human. Questions 2, 5, 6, 8 are LLM-judgeable with a rubric. Questions 7 and 10 are the two a human should always personally answer.

---

# C. WHAT WORLD-CLASS LOOKS LIKE THAT GOOD DOES NOT

Content that is accurate, well-formatted, complete and on-topic is *good*. It is also forgotten in three weeks. Three things separate six-month retention from that, and only three.

## 1. IT COSTS THE LEARNER SOMETHING BEFORE IT GIVES THEM ANYTHING

Good content explains, then checks. World-class content extracts a commitment first, and only then explains. The learner must be wrong about something, out loud, early. This is the single largest gap in the current product: across 35 cards the learner is asked to commit to an answer exactly five times, always last, always trivially.

The mechanism is prediction error. A learner who has privately guessed "you'd carb-load for a week" and is then told "two to four days, and here's the study" has an encoding event. A learner told the same fact cold has an exposure.

**On each card type:**
- **hook-scenario** — panel 4 ends on the learner's decision, not the characters'. "You have ten seconds. What do you tell her?"
- **concept-explainer** — leads with the thing that contradicts the guess. "Fat isn't the problem. You've got 30 times more of it than glycogen. *Rate* is the problem."
- **mental-model** — one step contains a branch the learner must choose between before the next step is visible.
- **applied-scenario** — panel 3 introduces a complication the taught rule does not cleanly cover, and makes the learner decide before panel 4 resolves it.
- **mistakes** — framed as "here is what you probably just thought, and why it's nearly right", not as a list of sins.
- **competency-summary** — the "avoid" column names the *specific* wrong belief, not the vice: "thinking fat-adapted means faster" rather than "assuming one-size-fits-all".
- **decision-point** — two options are genuinely defensible; the learner must reason, not spot the strawman.

## 2. IT IS MADE OF THINGS, NOT CATEGORIES

Good content is *about* a subject. World-class content is *made of* it. Every abstraction is dragged down to something with edges: a number, a name, a person, an object. This is what makes content citable — and the test of six-month retention is whether the learner can *say something* about it to a colleague. Nobody repeats "understanding energy systems is essential for tailored advice". People repeat "you can rinse and spit — the receptors are in your mouth" and "10–12 grams per kilo, which is fourteen cups of rice a day, which is why nobody manages it first time".

The failing pack has zero of these. The source had forty.

**On each card type:**
- **hook** — a named person, a clock, an object. "Priya. 32 km. One empty gel wrapper."
- **concept-explainer** — every claim carries a quantity or a named intermediate. Mechanism with parts, not benefit with adjectives.
- **mental-model** — steps operate on numbers. Step 2 is "multiply by 10", not "assess needs".
- **applied-scenario** — the resolution names the thing. Not "you recommend a supplement" but "you tell her 3 g of creatine monohydrate daily, no loading phase".
- **mistakes** — the specific wrong number, and the number it should have been.
- **competency-summary** — ten items that are ten *facts in imperative form*, not ten virtues. "Set the load at 7 g/kg for a first-timer" beats "tailors advice to the individual".
- **decision-point** — the options are quantities and named protocols, not attitudes.

## 3. IT HAS A SPINE, AND THE SPINE IS AN ARGUMENT

Good content is organised. World-class content is *argued*: slide 2 exists because slide 1 raised a problem it doesn't solve, and slide 5 is only answerable if you remember slide 1. The pack is one claim developed, not five modules delivered.

This source hands you the spine on a plate and the output threw it away: *all three systems always run, only the mix changes — therefore you cannot prescribe by sport, only by intensity and duration — therefore every practical question reduces to how hard, how long, and what did you eat first.* Every one of the five topics is a consequence of that sentence. A pack built on it would have slide 5's recovery question answerable only by reaching back to slide 1's overlap graph.

**On each card type:**
- **hook** — the situation is one the previous slide left unresolved.
- **concept-explainer** — states its dependency explicitly: "this only makes sense because of the overlap you saw in slide 1".
- **mental-model** — the same procedural skeleton across the pack, with each slide adding one new decision to it, so by slide 5 the learner is running a five-branch procedure they built themselves.
- **applied-scenario** — the same cast, advancing. Priya's marathon runs through the whole pack.
- **mistakes** — at least one mistake per slide is "applying the previous slide's rule outside its boundary".
- **competency-summary** — the final slide's summary is the pack's argument, compressed.
- **decision-point** — at least one question per slide from slide 2 onward requires a specific from an earlier slide.

---

# D. THE HONEST RANKING

Scored against the standard above. Achievable = what this source and this seven-card format could have produced.

| Tier | Score | Verdict |
|---|---|---|
| **TIER 0** | **0 / 6** | Fails all six disqualifying gates. |
| **TIER 1** | **0.5 / 7** | ~3% source recall. One number in the entire pack. |
| **TIER 2** | **0.5 / 7** | Learner is passive in 34 of 35 cards; the 35th is guessable. |
| **TIER 3** | **0.5 / 6** | Nothing concrete, nothing surprising, no continuity, no stake. |
| **TIER 4** | **1 / 6** | Structurally complete, linguistically broken. |
| **PACK (A)** | **0 / 7** | One topic taught five times; no spine; capability delta zero. |

**TIER 0 — 0/6.** T0-1: recall ≈3% against ~40 available specifics. T0-2: all five hooks relocate a sports-physiology subject into a supplement company's meeting room; slide 1.3's hook is about a product launch deadline and office tension. T0-3: mistakes duplicated verbatim, competency items repeated four times per card, concept-explainer near-identical across all five slides. T0-4: a fabricated `Legislation` slot with an invented "Obligation" in a domain with no legislation, and `Connection` = `Summary` verbatim in every slide. T0-5: correct option is longest in 5/5; 14 of 15 distractors are strawmen. T0-6: "in total performance", "the most right nutritional support", and "the aerobic system *quickly* uses oxygen" — a substitution artefact that inverts a fact.

**TIER 1 — 0.5/7.** The half point is T1-6 (little outright hallucination, other than the fake obligation). Everything else fails. Zero mechanisms; zero named exemplars from a source containing Louise Burke, race walkers, AFL midfielders, and the mouth rinse; zero of the source's ~15 quantities; two of five takeaways are about client trust and team productivity; one slide has no takeaway at all.

**TIER 2 — 0.5/7.** One interactive card per slide, positioned last, answerable without reading. No pretesting, no prediction, no generation, no free response. All 25 mistakes are moral rather than technical ("Neglecting to Update Knowledge"). All 15 pieces of distractor feedback state a consequence and correct nothing. All five mental models are the same consultation meta-procedure.

**TIER 3 — 0.5/6.** No named person survives from hook to applied scenario in any slide. No image — the source's own traffic-lights analogy was discarded. Every consequence lands on "trust" or "satisfaction"; not one lands on an athlete's actual performance. Nothing counter-intuitive anywhere. The one "spacing" present is verbatim duplication, which is anti-spacing.

**TIER 4 — 1/6.** T4-2 passes by accident: load is low because content is absent. Register is corporate-abstract for an audience of practitioners and athletes. Five identical hooks, five identical models, three questions starting "How do you ensure". Slide 1.4's seven cards are about six different subjects. Roughly a third of all sentences end in a contentless benefit clause.

**PACK — 0/7.** All ten cross-slide concept pairs exceed the duplication threshold. Nine of the source's major sections map to nothing. No spine, no progression, no backward references, no example variety, and five assessments testing one proposition that is not in the source.

### Overall: **7% of achievable quality.**

To be precise about what that 7% is: the pack has the right number of slides, the right number of cards per slide, the right number of items per card, correct British spelling, and factually defensible (if empty) statements about three energy systems. It is a perfectly-formed container with the contents removed.

The uncomfortable framing for the team: **this pack would be almost exactly as good if the author had uploaded nothing at all.** Every substantive line in it could be generated from the five slide titles by a model with no source document. The upload — a rich, specific, forty-fact lecture transcript — passed through the pipeline and left no trace. That is the defect. It is not a polish problem, a tone problem, or a prompt-wording problem. The generator is writing *about* the topic instead of *from* the source, and until T0-1 is a hard gate with numeric recall measured against the upload, every other improvement is cosmetic.

**The one change with the highest yield:** extract teachable specifics from the source *before* generation, pass them to the generator as a required manifest, and reject any card that consumes none of them. Everything in Tiers 1 and 3 follows from having specifics to work with; Tier 2 is a separate and equally large piece of work on the interaction design.