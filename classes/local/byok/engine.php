<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

namespace mod_contentcreator\local\byok;

/**
 * The Content Creator card writer, ported from the LMS Labs service for Bring your own AI.
 *
 * A port of the service's /api/moodle/content-creator/prompt route: the first pass with its retries and fallbacks,
 * the answer-key and card format checks, word-floor expansion, banned-word rewrite, micro-expansion and the quality
 * report, with the service's own prompts. Each AI call goes to {@see self::$aicall}, which the plugin points at the
 * site's own AI. The route was compared with the service's code on generated requests and AI replies.
 *
 * Card objects are kept as stdClass (as JSON.parse makes them) so the checks see what the service sees.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class engine {
    /**
     * @var callable|null Text call: fn(string $system, string $user, int $maxtokens, bool $json, float $temperature,
     *     ?array $schema): string
     */
    public static $aicall = null;

    /** @var string JavaScript's whitespace (\s and String.prototype.trim), as a character class body. */
    const WS = '\x{9}-\x{d}\x{20}\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}';

    /** @var string[] Names every JavaScript object has through its prototype. */
    const PROTO = ['constructor', '__proto__', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__',
        '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'valueOf', 'toLocaleString'];

    /** @var array The card types of each fixed-layout route, in order (CC_ORDERED_CARD_TYPES). */
    const ORDERED = [
        'vet' => ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary',
            'decision-point'],
        'workplace' => ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes',
            'competency-summary', 'decision-point'],
        'pd' => ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary',
            'decision-point'],
        'university' => ['concept-anchor', 'theoretical-framework', 'analytical-lens', 'ethics-considerations', 'case-study-1',
            'case-study-2', 'decision-point'],
        'general' => ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes',
            'competency-summary', 'decision-point'],
        'policy' => ['hook-scenario', 'concept-explainer', 'mental-model', 'mistakes', 'competency-summary', 'decision-point'],
    ];

    /** @var array The array each card type must carry. */
    const REQUIRED_ARRAY = [
        'hook-scenario' => 'keyPoints',
        'concept-explainer' => 'keyPoints',
        'mental-model' => 'steps',
        'applied-scenario' => 'keyPoints',
        'mistakes' => 'errorItems',
        'competency-summary' => 'standardItems',
        'concept-anchor' => 'keyTerms',
        'theoretical-framework' => 'frameworks',
        'analytical-lens' => 'analysisPrompts',
        'ethics-considerations' => 'considerations',
        'case-study-1' => 'applications',
        'case-study-2' => 'applications',
    ];

    /** @var string[] Recognisable LLM register the cards must not use. */
    const BANNED = ['delve', 'tapestry', 'leverage', 'paradigm', 'synergy', 'multifaceted', 'nuanced', 'pivotal', 'realm',
        'holistic', 'robust', 'empower', 'cutting-edge', 'game-changer'];

    /** @var array Word ranges of the fields the cards ship (CC_SHIPPED_FIELD_RANGES). */
    const RANGES = [
        'scenePartsText' => [46, 56],
        'conceptInsightsText' => [42, 56],
        'stepDetail' => [35, 45],
        'itemConsequence' => [38, 50],
        'optionFeedback' => [25, 38],
    ];

    /** @var string The word-floor contract the meta reports. */
    const FLOOR_CONTRACT_VERSION = '2026-09-18.1';

    /** @var string */
    const WARNING = 'Generated content needs teacher review because one or more quality checks remain unresolved.';

    /** @var string */
    const LANG_GUARD = "\n\n⚠️ MANDATORY LANGUAGE REQUIREMENT: ALL text content MUST remain in %%lang%%. Do NOT rewrite or " .
        'translate any text field into English — the course language is %%lang%%. Only expand or fix the ' .
        'specific fields listed; keep every other field exactly as it is, including its language.';

    /** @var string */
    const BUDGET_TOPICS = "\n\n⚠️ OUTPUT SIZE CONSTRAINT (CRITICAL): Your full response must be a \"cards\" array containing 7-11 " .
        'objects (6-10 prose subtopics plus one decision-point) matching the Topics and Text schema and must ' .
        'total UNDER 10,000 tokens. Every prose/subtopic card must contain exactly two paragraphs of 55-70 ' .
        'words. A decision-point is required and must be the final card. Its questions must use per-option ' .
        'correct=true/false with exactly one true and non-empty feedback on every option; do not use ' .
        'correctAnswer. Do not add voiceoverText or fields that are not part of the route schema. Exceeding ' .
        '10,000 tokens will truncate the JSON and cause a schema failure.';

    /** @var string */
    const BUDGET_FIXED = "\n\n⚠️ OUTPUT SIZE CONSTRAINT (CRITICAL): Your full response must be a \"cards\" array of exactly %%count%% " .
        'objects in this exact cardType order: %%types%%. This server contract takes precedence over any older ' .
        'count stated above. The response must total UNDER 10,000 tokens. For every schema field that does NOT ' .
        'belong to the current card type\'s specific content requirements, you MUST output exactly null — never ' .
        'invent, elaborate, or guess content for inapplicable fields. Only the 4-8 fields explicitly required ' .
        'for each card type should contain text; all remaining fields → null. On every decision-point ' .
        'question, mark exactly one option with correct=true and every option with specific non-empty ' .
        'feedback; do not use correctAnswer. Exceeding 10,000 tokens will truncate the JSON and cause a schema failure.';

    /** @var string */
    const QUALITY_GUARD = "\n\n⚠️ SERVER-VERIFIED CONTENT RULES: Before returning JSON, verify every hook-scenario and " .
        'applied-scenario sceneParts[].text (or legacy keyPoints[].text) has at least 46 words; every ' .
        'concept-explainer has exactly five conceptInsights[].text (or legacy keyPoints[].text) values at ' .
        '42-56 words; every mistakes items[].consequence (or legacy errorItems[].consequence) has 38-50 words; ' .
        'every mental-model steps[].detail has 35-45 words; and every decision-point option feedback has 25-38 ' .
        'words. The mental-model and applied-scenario items must each end with a named, concrete instance ' .
        'carried over from the card 1 scenario, using the same person and job. schemaVersion and questions are ' .
        'valid only on decision-point; that card must use schemaVersion 2 with exactly three questions and ' .
        'four options per question. Every decision question must have exactly one option with correct=true, ' .
        'non-empty feedback on every option, and no correctAnswer field. Remove banned wording by rewriting ' .
        'the complete sentence grammatically, never by blindly swapping an isolated word.';

    /** @var string */
    const EXPANSION_SYSTEM = 'You are repairing specific content fields to meet the caller\'s minimum word counts and quality ' .
        'requirements. ONLY expand the fields listed below. Keep all other fields EXACTLY as they are, except ' .
        'that any banned wording listed in the user message must be removed by rewriting the complete affected ' .
        'sentence grammatically. For array items like requirements[0], keyPoints[2], etc., rewrite THAT ' .
        'SPECIFIC ITEM to meet its minimum word count while keeping the same meaning. Do not summarise or ' .
        'truncate. Return the same JSON structure with a "cards" array.';

    /** @var string */
    const REWRITE_SYSTEM = 'Rewrite the complete affected sentences below so the banned wording is removed grammatically. Return ' .
        'ONLY a JSON array of objects with {cardIndex, field, text} where text is the rewritten version. Keep ' .
        'word counts the same or higher and continue to follow the caller\'s field specification. Never perform ' .
        'a blind single-word substitution. Use plain, direct language. No markdown.';

    /** @var string */
    const MICRO_SYSTEM = 'Expand ONLY the listed fields to meet the caller\'s word-count minimums. Do not change any other ' .
        'field. Do not summarise or truncate. Keep the same tone, style, sentence requirements, and card-type ' .
        'specification.%%banned%% Return ONLY JSON as {"repairs":[{"label":"cards[0].field","text":"replacement"}]}.';

    /** @var string */
    const MICRO_BANNED = ' Where possible, avoid this LLM register: %%words%%. Meeting the requested word floor is more ' .
        'important than avoiding one of these terms.';

    /**
     * The prompt route: write one card pack.
     *
     * @param \stdClass $body The request the plugin would send (systemPrompt, userPrompt, contentType, route, ...).
     * @return array [HTTP status, answer]
     */
    public static function prompt(\stdClass $body): array {
        try {
            return self::prompt_inner($body);
        } catch (\Throwable $e) {
            return [500, ['success' => false, 'error' => $e->getMessage() !== '' ? $e->getMessage() : 'Prompt generation failed']];
        }
    }

    /**
     * The prompt route's body.
     *
     * @param \stdClass $body
     * @return array [HTTP status, answer]
     */
    protected static function prompt_inner(\stdClass $body): array {
        $issues = [];
        foreach (['systemPrompt', 'userPrompt'] as $key) {
            $value = $body->$key ?? null;
            if (!is_string($value)) {
                $issues[] = ['code' => 'invalid_type', 'expected' => 'string', 'received' => $value === null ? 'undefined'
                    : 'other', 'path' => [$key], 'message' => $value === null ? 'Required' : 'Expected string'];
            } else if (self::len($value) > 500000) {
                $issues[] = ['code' => 'too_big', 'maximum' => 500000, 'type' => 'string', 'inclusive' => true, 'exact' => false,
                    'message' => 'String must contain at most 500000 character(s)', 'path' => [$key]];
            }
        }
        if ($issues) {
            return [400, ['success' => false, 'error' => 'Invalid request parameters', 'details' => $issues]];
        }
        $system = $body->systemPrompt;
        $user = $body->userPrompt;
        $contenttype = isset($body->contentType) && is_string($body->contentType) ? $body->contentType : 'section';
        $route = isset($body->route) && is_string($body->route) ? $body->route : 'vet';

        $expected = self::expected_count($route);
        $schema = self::schema_for_route($route);

        $lang = null;
        if (preg_match('/Generate ALL content in ([^\n.]+)\.[' . self::WS . ']*This is NON-NEGOTIABLE/u', $system, $m)) {
            $lang = self::trim($m[1]);
        }
        $langguard = $lang !== null ? str_replace('%%lang%%', $lang, self::LANG_GUARD) : '';

        $calls = [];
        $reasons = [];
        $meta = [
            'floorContractVersion' => self::FLOOR_CONTRACT_VERSION,
            'passes' => 1,
            'expansionTriggered' => false,
            'rewriteTriggered' => false,
            'microExpansionTriggered' => false,
            'finalBannedHits' => 0,
            'finalBannedWords' => [],
            'underFloorFields' => [],
            'qualityStatus' => 'passed',
            'qualityWarnings' => [],
            'route' => $route,
            'expectedCards' => $expected,
            'modelUsed' => '',
            'modelsUsed' => [],
            'fallbackUsed' => false,
            'fallbackReason' => null,
            'fallbackReasons' => [],
            'retryCount' => 0,
            'callDurationsMs' => [],
            'totalModelDurationMs' => 0,
            'modelCalls' => [],
            'cacheHitCount' => 0,
            'cachedPromptTokens' => 0,
            'skipSecondaryPasses' => false,
            'secondaryPassesSkipped' => false,
            'callerFieldRangesSupplied' => false,
            'fieldRangeDiagnostics' => [],
            'lengthDiagnostics' => [],
        ];
        $record = function (array $call) use (&$meta, &$calls, &$reasons): void {
            $calls[] = $call;
            $meta['callDurationsMs'][] = $call['durationMs'];
            $meta['totalModelDurationMs'] += $call['durationMs'];
            if (!in_array($call['model'], $meta['modelsUsed'], true)) {
                $meta['modelsUsed'][] = $call['model'];
            }
            if ($call['fallback']) {
                $meta['fallbackUsed'] = true;
                if (isset($call['reason']) && $call['reason'] !== '' && !in_array($call['reason'], $reasons, true)) {
                    $reasons[] = $call['reason'];
                }
            }
        };
        // The service's callTrackedOpenAI(): the call, timed and recorded in the meta.
        $call = function (string $stage, string $sys, string $usr, int $maxtokens, bool $json, float $temperature,
                string $model, ?array $format = null, bool $fallback = false, ?string $reason = null) use ($record): string {
            $started = microtime(true);
            try {
                $out = (self::$aicall)($sys, $usr, $maxtokens, $json || $format !== null, $temperature,
                    $format === null ? null
                        : ['name' => $format['json_schema']['name'], 'schema' => $format['json_schema']['schema']]);
            } catch (\Throwable $e) {
                $entry = ['stage' => $stage, 'provider' => 'openai', 'model' => $model,
                    'durationMs' => self::elapsed($started), 'success' => false, 'fallback' => $fallback,
                    'reason' => $reason !== null && $reason !== '' ? $reason : self::classify($e->getMessage())];
                $record($entry);
                throw $e;
            }
            $entry = ['stage' => $stage, 'provider' => 'openai', 'model' => $model, 'durationMs' => self::elapsed($started),
                'success' => true, 'fallback' => $fallback];
            if ($reason !== null) {
                $entry['reason'] = $reason;
            }
            $record($entry);
            return $out;
        };
        $finish = function (array $answer) use (&$meta, &$calls, &$reasons): array {
            $meta['fallbackReasons'] = $reasons;
            $meta['modelCalls'] = $calls;
            $answer['meta'] = $meta;
            return $answer;
        };

        if (strpos($contenttype, 'ml_translate_') === 0) {
            try {
                $raw = $call('translation', $system, $user, 16000, true, 0.3, 'gpt-4o');
                $meta['modelUsed'] = 'gpt-4o';
            } catch (\Throwable $e) {
                return [500, ['success' => false, 'error' => 'Translation failed: ' . $e->getMessage()]];
            }
            $meta['fallbackReason'] = $reasons[0] ?? null;
            return [200, $finish(['success' => true, 'content' => $raw, 'credits' => -1])];
        }

        if ($route === 'topicstext') {
            $budget = self::BUDGET_TOPICS;
            $quality = '';
        } else {
            $types = self::ordered($route) ?? self::ORDERED['general'];
            $budget = str_replace(['%%count%%', '%%types%%'], [(string) $expected, implode(', ', $types)], self::BUDGET_FIXED);
            $quality = self::QUALITY_GUARD;
        }
        $primary = $system . $budget . $quality;
        $callerspec = "\n\nCALLER'S ORIGINAL CONTENT SPECIFICATION (MANDATORY):\n" . $system . $quality
            . "\n\nFollow this specification when repairing content. Preserve its card-type requirements, field meanings, tone, "
            . 'sentence rules, word ranges, scenario continuity, and decision-point field ownership.';

        // Pass 1: the main model twice, the fast model, then the long-context fallback.
        $cards = null;
        $fromgemini = false;
        $pass1model = 'gpt-4o';
        try {
            $cards = self::unwrap($call('pass1', $primary, $user, 12000, false, 0.5, 'gpt-4o', $schema));
        } catch (\Throwable $e) {
            $cards = null;
        }
        if (!self::usable($cards, $route)) {
            try {
                $meta['retryCount']++;
                $cards = self::unwrap($call('pass1-retry', $primary, $user, 12000, false, 0.5, 'gpt-4o', $schema, true,
                    'pass1_unusable_or_failed'));
            } catch (\Throwable $e) {
                // Keep what the first attempt gave.
                unset($e);
            }
        }
        if (!self::usable($cards, $route)) {
            try {
                $meta['retryCount']++;
                $mini = self::unwrap($call('pass1-mini-fallback', $primary, $user, 12000, false, 0.35, 'gpt-4o-mini', $schema,
                    true, 'primary_model_unusable_or_failed'));
                if (self::usable($mini, $route)) {
                    $cards = $mini;
                    $pass1model = 'gpt-4o-mini';
                    $meta['fallbackUsed'] = true;
                    $reasons[] = 'openai_primary_unusable';
                }
            } catch (\Throwable $e) {
                unset($e);
            }
        }
        if (!self::usable($cards, $route)) {
            $reasons[] = 'openai_pass1_exhausted';
            $meta['fallbackUsed'] = true;
            $contents = $primary . "\n\n---\n\n" . $user . "\n\n" . ($route === 'topicstext'
                ? 'Return a JSON object with a "cards" array matching the Topics and Text contract exactly. '
                    . 'Do not add voiceoverText.'
                : 'Return a JSON object with a "cards" array. Each card must include "cardType" and all inapplicable schema '
                    . 'fields set to null.');
            $started = microtime(true);
            try {
                $text = (self::$aicall)('', $contents, 12000, true, 0.5, null);
                $record(['stage' => 'pass1-fallback', 'provider' => 'gemini', 'model' => 'gemini-2.5-flash',
                    'durationMs' => self::elapsed($started), 'success' => true, 'fallback' => true,
                    'reason' => 'openai_pass1_exhausted']);
                $cards = self::unwrap($text);
                if ($route === 'topicstext' && !self::usable_topics($cards)) {
                    $cards = null;
                }
                if (self::usable($cards, $route)) {
                    $fromgemini = true;
                    $meta['modelUsed'] = 'gemini-2.5-flash';
                }
            } catch (\Throwable $e) {
                $record(['stage' => 'pass1-fallback', 'provider' => 'gemini', 'model' => 'gemini-2.5-flash',
                    'durationMs' => self::elapsed($started), 'success' => false, 'fallback' => true,
                    'reason' => 'provider_error']);
            }
            if (!self::usable($cards, $route)) {
                return [500, ['success' => false, 'error' => 'AI generation failed - all providers exhausted']];
            }
        }
        if (!$fromgemini) {
            $meta['modelUsed'] = $pass1model;
        }

        $pass1under = self::floors($cards, $route);
        $pass1banned = self::banned($cards);
        $meta['lengthDiagnostics'][] = self::diagnostic('pass1', $cards, $pass1under);
        if (!$pass1under && !$pass1banned['needsRewrite']) {
            $meta['finalBannedHits'] = $pass1banned['total'];
            $meta['finalBannedWords'] = $pass1banned['high'];
        } else {
            // Pass 2: expand the fields under their word floor.
            if ($pass1under) {
                $meta['expansionTriggered'] = true;
                $meta['passes'] = 2;
                $lines = [];
                foreach ($pass1under as $f) {
                    $target = self::target($f);
                    $instruction = 'rewrite to at least ' . $target . ' words (hard minimum ' . $f['min']
                        . (isset($f['max']) ? ', declared maximum ' . $f['max'] : '') . ')';
                    $line = '- ' . $f['label'] . ': currently ' . $f['current'] . 'w, ' . $instruction;
                    if (strpos($f['label'], '[') !== false
                            && preg_match('/cards\[(\d+)\]\.(\w+)\[(\d+)\](?:\.(\w+))?/', $f['label'], $m)) {
                        $card = $cards[(int) $m[1]] ?? null;
                        $list = self::prop($card, $m[2]);
                        $item = self::prop($list, (int) $m[3]);
                        $current = '';
                        if (isset($m[4]) && $m[4] !== '' && self::truthy($item)) {
                            $sub = self::prop($item, $m[4]);
                            $current = self::truthy($sub) ? $sub : '';
                        } else if (self::truthy($item)) {
                            $current = is_string($item) ? $item : '';
                        }
                        $line .= '. Current text: "' . self::str($current) . '"';
                    }
                    $lines[] = $line;
                }
                $expsystem = self::EXPANSION_SYSTEM . $callerspec . $langguard;
                $words = $pass1banned['high'];
                $expuser = "Expand or fix ONLY these under-length fields:\n" . implode("\n", $lines)
                    . "\n\nAlso rewrite any sentence containing these banned words, if present: "
                    . ($words ? implode(', ', $words) : 'none') . ".\n\nContent:\n"
                    . self::json((object) ['cards' => $cards], '  ');
                try {
                    $raw = $call('pass2-expansion', $expsystem, $expuser, 16000, false, 0.6, 'gpt-4o', $schema);
                    $expanded = self::unwrap($raw);
                    if ($expanded !== null && count($expanded) >= count($cards)) {
                        self::apply_repairs($cards, $expanded, $pass1under);
                        $meta['modelUsed'] = 'gpt-4o';
                    }
                } catch (\Throwable $e) {
                    // Keep the first pass.
                    unset($e);
                }
                $meta['lengthDiagnostics'][] = self::diagnostic('pass2-expansion', $cards, self::floors($cards, $route));
            }

            // Pass 3: rewrite the fields with banned words.
            $bannedresult = self::banned($cards);
            if ($bannedresult['needsRewrite']) {
                $meta['rewriteTriggered'] = true;
                $meta['passes'] = max($meta['passes'], 2) + 1;
                $hits = $bannedresult['high'];
                $affected = self::banned_fields($cards, $hits);
                if ($affected) {
                    $snippets = [];
                    $requested = [];
                    foreach ($affected as $a) {
                        $snippets[] = 'Card ' . ($a['cardIndex'] + 1) . ', ' . $a['field'] . ': "' . $a['text'] . '"';
                        $requested['cards[' . $a['cardIndex'] . '].' . $a['field']] = true;
                    }
                    $rwsystem = self::REWRITE_SYSTEM . $callerspec . $langguard;
                    $rwuser = 'Banned words to replace: ' . implode(', ', $hits)
                        . "\n\nFields to rewrite:\n" . implode("\n", $snippets);
                    try {
                        $raw = $call('pass3-rewrite', $rwsystem, $rwuser, 16000, true, 0.2, 'gpt-4o');
                        $rewrites = self::parse($raw === '' ? '[]' : $raw);
                        if (is_array($rewrites)) {
                            $applied = 0;
                            foreach ($rewrites as $rw) {
                                $field = self::prop($rw, 'field');
                                $label = 'cards[' . self::str(self::prop($rw, 'cardIndex')) . '].'
                                    . (self::truthy($field) ? self::str($field) : '');
                                $text = self::prop($rw, 'text');
                                if (!isset($requested[$label]) || !is_string($text)) {
                                    continue;
                                }
                                if (self::words($text) < self::words(self::get_text($cards, $label))) {
                                    continue;
                                }
                                if (self::set_text($cards, $label, $text)) {
                                    $applied++;
                                }
                            }
                            if ($applied > 0) {
                                $meta['modelUsed'] = 'gpt-4o';
                            }
                        }
                    } catch (\Throwable $e) {
                        // A failed rewrite leaves the cards as they are.
                        unset($e);
                    }
                    $meta['lengthDiagnostics'][] = self::diagnostic('pass3-rewrite', $cards, self::floors($cards, $route));
                }
            }

            // Micro-expansion: replacements for the fields still under their floor.
            $finalunder = self::floors($cards, $route);
            if ($finalunder) {
                $meta['microExpansionTriggered'] = true;
                $lines = [];
                $requested = [];
                foreach ($finalunder as $f) {
                    $lines[] = '- ' . $f['label'] . ': currently ' . $f['current'] . 'w, rewrite to at least ' . self::target($f)
                        . ' words (hard minimum ' . $f['min'] . (isset($f['max']) ? ', declared maximum ' . $f['max'] : '')
                        . '). Current text: "' . self::get_text($cards, $f['label']) . '"';
                    $requested[$f['label']] = $f;
                }
                $banned = str_replace('%%words%%', implode(', ', self::BANNED), self::MICRO_BANNED);
                $microsystem = str_replace('%%banned%%', $banned, self::MICRO_SYSTEM) . $callerspec . $langguard;
                $microuser = "Expand ONLY these fields:\n" . implode("\n", $lines);
                try {
                    $raw = $call('micro-expansion', $microsystem, $microuser, 16000, true, 0.3, 'gpt-4o');
                    $parsed = self::parse($raw === '' ? '{}' : $raw);
                    $repairs = is_array($parsed) ? $parsed : self::prop($parsed, 'repairs');
                    if (is_array($repairs)) {
                        foreach ($repairs as $repair) {
                            $label = self::prop($repair, 'label');
                            $text = self::prop($repair, 'text');
                            if (!is_string($label) || !isset($requested[$label]) || !is_string($text)) {
                                continue;
                            }
                            $f = $requested[$label];
                            $count = self::words($text);
                            if ($count <= $f['current'] || $count < self::target($f)) {
                                continue;
                            }
                            if (isset($f['max']) && $count > $f['max']) {
                                continue;
                            }
                            self::set_text($cards, $f['label'], $text);
                        }
                        $meta['modelUsed'] = 'gpt-4o';
                        $meta['passes']++;
                    }
                } catch (\Throwable $e) {
                    // Keep the previous result.
                    unset($e);
                }
                $meta['lengthDiagnostics'][] = self::diagnostic('micro-expansion', $cards, self::floors($cards, $route));
            }

            $postunder = self::floors($cards, $route);
            $meta['lengthDiagnostics'][] = self::diagnostic('post-secondary', $cards, $postunder);
            if ($postunder) {
                $meta['underFloorFields'] = array_column($postunder, 'label');
            }
        }

        $clean = self::banned($cards);
        $meta['finalBannedHits'] = $clean['total'];
        $meta['finalBannedWords'] = $clean['high'];

        if ($route !== 'topicstext') {
            $types = self::ordered($route) ?? self::ORDERED['general'];
            foreach ($cards as $i => $card) {
                if (isset($types[$i]) && self::prop($card, 'cardType') !== $types[$i]) {
                    self::set_prop($cards[$i], 'cardType', $types[$i]);
                }
            }
        }
        if ($route === 'pd') {
            foreach ($cards as $i => $card) {
                $type = self::prop($card, 'cardType');
                if ($type === 'scenario-1' || $type === 'scenario-2') {
                    $reflection = $card->reflection ?? null;
                    if (self::truthy($reflection) && (is_object($reflection) || is_array($reflection))) {
                        $question = self::prop($reflection, 'question');
                        $card->reflection = self::truthy($question) ? $question : '';
                    }
                    if (!self::truthy($card->turningPoint ?? null) && self::truthy($card->consequence ?? null)) {
                        $card->turningPoint = $card->consequence;
                    }
                }
            }
        }

        $answerkey = self::decisions($cards);
        if (!$answerkey['valid']) {
            return [422, ['success' => false,
                'error' => 'Generated decision-point content has no unambiguous answer key or complete per-option feedback.',
                'answerKeyErrors' => $answerkey['errors']]];
        }
        $cleanunder = self::floors($cards, $route);
        $meta['lengthDiagnostics'][] = self::diagnostic('final', $cards, $cleanunder);
        $meta['underFloorFields'] = array_column($cleanunder, 'label');
        $missing = [];
        foreach ($cards as $i => $card) {
            $type = self::prop($card, 'cardType');
            $need = null;
            if ($type === 'hook-scenario' || $type === 'applied-scenario') {
                $need = ['keyPoints', 4];
            } else if ($type === 'concept-explainer') {
                $need = ['keyPoints', 5];
            } else if ($type === 'mistakes') {
                $need = ['errorItems', 5];
            }
            if ($need !== null) {
                $list = self::prop($card, $need[0]);
                if (!self::is_list($list) || count($list) < $need[1]) {
                    $missing[] = 'cards[' . $i . '].' . $need[0]
                        . ' (' . (self::is_list($list) ? count($list) : 0) . '/' . $need[1] . ')';
                }
            }
        }
        array_push($meta['underFloorFields'], ...$missing);
        $short = [];
        foreach ($cleanunder as $f) {
            if (!preg_match('/^cards\[(\d+)\]\./', $f['label'], $m)) {
                continue;
            }
            $card = $cards[(int) $m[1]] ?? null;
            if ($card === null) {
                continue;
            }
            $type = self::prop($card, 'cardType');
            $critical = (in_array($type, ['hook-scenario', 'applied-scenario', 'concept-explainer'], true)
                    && preg_match('/\.keyPoints\[\d+\](?:\.text)?$/', $f['label']))
                || ($type === 'mistakes' && preg_match('/\.errorItems\[\d+\]\.consequence$/', $f['label']));
            if ($critical) {
                $short[] = $f['label'] . ':' . $f['current'] . 'w<' . $f['min'] . 'w';
            }
        }
        if ($short || $missing) {
            array_push($meta['qualityWarnings'], ...$short, ...$missing);
        }
        if ($meta['finalBannedWords']) {
            $meta['qualityWarnings'][] = 'Banned wording remains: ' . implode(', ', $meta['finalBannedWords']);
        }
        if ($meta['qualityWarnings'] || $meta['underFloorFields']) {
            $meta['qualityStatus'] = 'warning';
        }
        $meta['fallbackReason'] = $reasons[0] ?? null;
        return [200, $finish(['success' => true, 'content' => self::json($cards), 'credits' => -1,
            'warning' => $meta['qualityStatus'] === 'warning' ? self::WARNING : null])];
    }

    // The route's model bookkeeping.

    /**
     * Milliseconds since a start time.
     *
     * @param float $started microtime(true)
     * @return int
     */
    protected static function elapsed(float $started): int {
        return (int) round((microtime(true) - $started) * 1000);
    }

    /**
     * The service's classifyModelFailure().
     *
     * @param string $message
     * @return string
     */
    protected static function classify(string $message): string {
        if (strpos($message, 'OPENAI_TIMEOUT') === 0) {
            return 'timeout';
        }
        if (strpos($message, 'OPENAI_TOKEN_LIMIT') === 0
                || preg_match('/context length|maximum context|too many tokens|token limit/i', $message)) {
            return 'token_limit';
        }
        if (strpos($message, '429') !== false || preg_match('/rate.?limit|quota|RESOURCE_EXHAUSTED/i', $message)) {
            return 'rate_limit';
        }
        if (preg_match('/refusal/i', $message)) {
            return 'model_refusal';
        }
        return 'provider_error';
    }

    // The card contract.

    /**
     * CC_ORDERED_CARD_TYPES[route]: the route's card types, or null for a route without a fixed layout.
     *
     * @param string $route
     * @return array|null
     * @throws \coding_exception For a name every JavaScript object has, which the service cannot handle either.
     */
    protected static function ordered(string $route): ?array {
        if (in_array($route, self::PROTO, true)) {
            throw new \RuntimeException('orderedTypes.map is not a function');
        }
        return self::ORDERED[$route] ?? null;
    }

    /**
     * The service's ccExpectedCardCount() (the plugin never sends intendedCount).
     *
     * @param string $route
     * @return int
     */
    public static function expected_count(string $route): int {
        if ($route === 'topicstext') {
            return 7;
        }
        return in_array($route, ['vet', 'workplace', 'pd', 'university', 'general'], true) ? 7 : 6;
    }

    /**
     * The service's ccCardJsonSchemaForRoute(): the response format for a route.
     *
     * @param string $route
     * @return array {type: json_schema, json_schema: {name, strict, schema}}
     */
    public static function schema_for_route(string $route): array {
        $base = $route === 'topicstext' ? card_schemas::TOPICS : card_schemas::CARD;
        $basecards = $base['json_schema']['schema']['properties']['cards'];
        $types = self::ordered($route);
        if ($types !== null) {
            $source = $basecards['items'];
            $branches = [];
            foreach ($types as $type) {
                $properties = $source['properties'];
                $properties['cardType'] = ['type' => 'string', 'enum' => [$type]];
                if ($type === 'decision-point') {
                    $properties['schemaVersion'] = ['type' => 'integer', 'enum' => [2]];
                    $properties['questions'] = $source['properties']['questions']['anyOf'][0];
                } else {
                    $properties['schemaVersion'] = ['type' => 'null'];
                    $properties['questions'] = ['type' => 'null'];
                }
                $field = self::REQUIRED_ARRAY[$type] ?? null;
                if ($field !== null) {
                    $array = $source['properties'][$field]['anyOf'][0];
                    if ($type === 'concept-explainer') {
                        $array['minItems'] = 5;
                        $array['maxItems'] = 5;
                    }
                    $properties[$field] = $array;
                }
                $branch = $source;
                $branch['properties'] = $properties;
                $branches[] = $branch;
            }
            $items = ['anyOf' => $branches];
        } else {
            $items = $basecards['items'];
        }
        $cards = $basecards;
        $cards['items'] = $route === 'topicstext' ? $basecards['items'] : $items;
        $cards['minItems'] = $route === 'topicstext' ? 7 : self::expected_count($route);
        $cards['maxItems'] = $route === 'topicstext' ? 11 : self::expected_count($route);
        $out = $base;
        $out['json_schema']['name'] = preg_replace('/[^a-z0-9_-]/i', '_', $route) . '_card_content';
        $out['json_schema']['schema']['properties']['cards'] = $cards;
        return $out;
    }

    /**
     * The service's ccUnwrapCards(): the card list in a reply, with its answer key made canonical, or null.
     *
     * @param string $raw
     * @return array|null
     */
    public static function unwrap(string $raw): ?array {
        $parsed = self::parse($raw);
        if ($parsed === self::BAD) {
            return null;
        }
        if (is_array($parsed)) {
            $cards = $parsed;
        } else if (is_object($parsed)) {
            if (property_exists($parsed, 'cards') && is_array($parsed->cards)) {
                $cards = $parsed->cards;
            } else {
                $cards = null;
                foreach (self::keys($parsed) as $key) {
                    if (is_array($parsed->$key)) {
                        $cards = $parsed->$key;
                        break;
                    }
                }
                if ($cards === null) {
                    $cards = [$parsed];
                }
            }
        } else {
            return null;
        }
        return self::decisions($cards)['valid'] ? $cards : null;
    }

    /**
     * The service's ccNormalizeDecisionAnswers(): check every decision question has one clear answer and feedback on
     * every option, and rewrite its options to the published {text, correct, feedback} shape.
     *
     * @param array $cards Rewritten only when every question passes.
     * @return array valid, errors
     */
    public static function decisions(array &$cards): array {
        $errors = [];
        $working = self::copy($cards);
        $question = function ($q, string $label) use (&$errors): bool {
            $before = count($errors);
            $options = self::prop($q, 'options');
            if (!self::truthy($q) || !(is_object($q) || is_array($q)) || !is_array($options) || count($options) !== 4) {
                $errors[] = $label . '.options must contain exactly four options';
                return false;
            }
            if (is_object($q) && property_exists($q, 'correctAnswer')) {
                $errors[] = $label . ' uses unsupported correctAnswer';
                return false;
            }
            $feedbacks = null;
            if (is_array(self::prop($q, 'optionFeedback'))) {
                $feedbacks = $q->optionFeedback;
            } else if (is_array(self::prop($q, 'feedbackByOption'))) {
                $feedbacks = $q->feedbackByOption;
            }
            $read = [];
            foreach ($options as $i => $option) {
                if (is_string($option)) {
                    $feedback = $feedbacks !== null ? ($feedbacks[$i] ?? null) : null;
                    $read[] = ['text' => $option, 'feedback' => is_string($feedback) ? $feedback : null, 'source' => 'string'];
                } else if (!self::truthy($option) || !(is_object($option) || is_array($option))) {
                    $read[] = ['text' => null, 'feedback' => null, 'source' => 'invalid'];
                } else {
                    if (is_object($option) && property_exists($option, 'correctAnswer')) {
                        $errors[] = $label . '.options[' . $i . '] uses unsupported correctAnswer';
                    }
                    $read[] = ['text' => self::prop($option, 'text'), 'feedback' => self::prop($option, 'feedback'),
                        'source' => $option];
                }
            }
            foreach ($read as $o) {
                if (!is_string($o['text']) || self::trim($o['text']) === '' || !is_string($o['feedback'])
                        || self::trim($o['feedback']) === '') {
                    $errors[] = $label . '.options must include non-empty text and feedback for every option';
                    return false;
                }
            }
            $answers = [];
            foreach (['correct', 'isCorrect'] as $key) {
                $present = false;
                foreach ($read as $o) {
                    if (is_object($o['source']) && property_exists($o['source'], $key)) {
                        $present = true;
                    }
                }
                if (!$present) {
                    continue;
                }
                $typed = true;
                foreach ($read as $o) {
                    if (!is_object($o['source']) || !is_bool($o['source']->$key ?? null)) {
                        $typed = false;
                    }
                }
                if (!$typed) {
                    $errors[] = $label . '.options.' . $key . ' must be boolean on every option when supplied';
                    continue;
                }
                $indexes = [];
                foreach ($read as $i => $o) {
                    if ($o['source']->$key === true) {
                        $indexes[] = $i;
                    }
                }
                if (count($indexes) !== 1) {
                    $errors[] = $label . '.options.' . $key . ' must identify exactly one correct option';
                    continue;
                }
                $answers[] = $indexes[0];
            }
            if (is_object($q) && property_exists($q, 'correctIndex') && $q->correctIndex !== null) {
                $index = $q->correctIndex;
                if (!self::is_integer($index) || $index < 0 || $index >= count($read)) {
                    $errors[] = $label . '.correctIndex must be an integer from 0 to 3';
                } else {
                    $answers[] = (int) $index;
                }
            }
            if (!$answers) {
                $errors[] = $label . ' has no resolvable correct answer';
                return false;
            }
            $answer = $answers[0];
            foreach ($answers as $a) {
                if ($a !== $answer) {
                    $errors[] = $label . ' contains contradictory answer-key sources';
                    return false;
                }
            }
            if (count($errors) > $before) {
                return false;
            }
            $published = [];
            foreach ($read as $i => $o) {
                $out = is_object($o['source']) ? clone $o['source'] : new \stdClass();
                unset($out->isCorrect);
                $out->text = $o['text'];
                $out->correct = $i === $answer;
                $out->feedback = $o['feedback'];
                $published[] = $out;
            }
            $q->options = $published;
            unset($q->optionFeedback, $q->feedbackByOption, $q->correctIndex);
            return true;
        };
        foreach ($working as $i => $card) {
            if (self::prop($card, 'cardType') !== 'decision-point') {
                continue;
            }
            if (property_exists($card, 'correctAnswer')) {
                $errors[] = 'cards[' . $i . '] uses unsupported correctAnswer';
                continue;
            }
            if (is_array($card->questions ?? null)) {
                foreach ($card->questions as $qi => $q) {
                    $question($q, 'cards[' . $i . '].questions[' . $qi . ']');
                }
            } else if (is_array($card->options ?? null)) {
                $question($card, 'cards[' . $i . ']');
            } else {
                $errors[] = 'cards[' . $i . '] has no decision question';
            }
        }
        if ($errors) {
            return ['valid' => false, 'errors' => $errors];
        }
        $cards = $working;
        return ['valid' => true, 'errors' => []];
    }

    /**
     * The service's ccHasUsableGeneratedCards(): the right cards, in order, with a gradable decision card and the format.
     *
     * @param array|null $cards Made canonical as a side effect, as in the service.
     * @param string $route
     * @return bool
     */
    public static function usable(?array &$cards, string $route): bool {
        if ($route === 'topicstext') {
            return self::usable_topics($cards);
        }
        if ($cards === null || count($cards) !== self::expected_count($route)) {
            return false;
        }
        if (!self::decisions($cards)['valid']) {
            return false;
        }
        $types = self::ordered($route);
        if ($types === null) {
            return false;
        }
        foreach ($cards as $i => $card) {
            if (self::prop($card, 'cardType') !== ($types[$i] ?? null)) {
                return false;
            }
        }
        foreach ($cards as $card) {
            if ($card->cardType === 'decision-point') {
                $questions = $card->schemaVersion ?? null;
                if (!self::same($questions, 2) || !is_array($card->questions ?? null) || count($card->questions) !== 3) {
                    return false;
                }
                foreach ($card->questions as $q) {
                    if (!is_string(self::prop($q, 'question')) || !self::options_ok(self::prop($q, 'options'))
                            || !is_string($q->feedback ?? null)) {
                        return false;
                    }
                }
                continue;
            }
            if (($card->schemaVersion ?? null) !== null || ($card->questions ?? null) !== null) {
                return false;
            }
            $field = self::REQUIRED_ARRAY[$card->cardType] ?? null;
            $minimum = $card->cardType === 'concept-explainer' ? 5 : 1;
            if ($field !== null && (!is_array($card->$field ?? null) || count($card->$field) < $minimum)) {
                return false;
            }
        }
        return self::matches((object) ['cards' => $cards], self::schema_for_route($route)['json_schema']['schema']);
    }

    /**
     * Four options, each a non-empty text with a boolean correct and non-empty feedback, exactly one correct.
     *
     * @param mixed $options
     * @return bool
     */
    protected static function options_ok($options): bool {
        if (!is_array($options) || count($options) !== 4) {
            return false;
        }
        $correct = 0;
        foreach ($options as $o) {
            if (!is_object($o) || !is_string($o->text ?? null) || self::trim($o->text) === '' || !is_bool($o->correct ?? null)
                    || !is_string($o->feedback ?? null) || self::trim($o->feedback) === '') {
                return false;
            }
            $correct += $o->correct === true ? 1 : 0;
        }
        return $correct === 1;
    }

    /**
     * The service's ccHasUsableTopicstextShape().
     *
     * @param array|null $cards Made canonical as a side effect.
     * @return bool
     */
    public static function usable_topics(?array &$cards): bool {
        if ($cards === null || count($cards) < 7 || count($cards) > 11) {
            return false;
        }
        if (!self::decisions($cards)['valid']) {
            return false;
        }
        $final = $cards[count($cards) - 1];
        if (self::prop($final, 'cardType') !== 'decision-point') {
            return false;
        }
        for ($i = 0; $i < count($cards) - 1; $i++) {
            if (self::prop($cards[$i], 'cardType') === 'decision-point') {
                return false;
            }
            $paragraphs = self::prop($cards[$i], 'paragraphs');
            if (!is_array($paragraphs) || count($paragraphs) !== 2) {
                return false;
            }
            foreach ($paragraphs as $p) {
                if (!is_string($p) || self::trim($p) === '') {
                    return false;
                }
            }
        }
        $schema = self::schema_for_route('topicstext')['json_schema']['schema'];
        if (self::same($final->schemaVersion ?? null, 2)) {
            if (!is_array($final->questions ?? null) || count($final->questions) !== 3) {
                return false;
            }
            foreach ($final->questions as $q) {
                $text = self::prop($q, 'question');
                $feedback = self::prop($q, 'feedback');
                if (!is_string($text) || self::trim($text) === '' || !self::options_ok(self::prop($q, 'options'))
                        || !is_string($feedback) || self::trim($feedback) === '') {
                    return false;
                }
            }
            return self::matches((object) ['cards' => $cards], $schema);
        }
        $options = $final->options ?? null;
        if (!is_array($options) || count($options) !== 4) {
            return false;
        }
        $correct = 0;
        foreach ($options as $o) {
            $correct += self::prop($o, 'correct') === true ? 1 : 0;
        }
        if ($correct !== 1) {
            return false;
        }
        foreach ($options as $o) {
            $text = self::prop($o, 'text');
            $feedback = self::prop($o, 'feedback');
            if (!is_string($text) || self::trim($text) === '' || !is_bool(self::prop($o, 'correct'))
                    || !is_string($feedback) || self::trim($feedback) === '') {
                return false;
            }
        }
        return self::matches((object) ['cards' => $cards], $schema);
    }

    /**
     * The service's ccMatchesDeclaredSchema(): the JSON Schema subset the card formats use.
     *
     * @param mixed $value
     * @param mixed $schema
     * @return bool
     */
    public static function matches($value, $schema): bool {
        if (!is_array($schema)) {
            return false;
        }
        if (isset($schema['anyOf'])) {
            foreach ($schema['anyOf'] as $candidate) {
                if (self::matches($value, $candidate)) {
                    return true;
                }
            }
            return false;
        }
        if (isset($schema['enum'])) {
            $found = false;
            foreach ($schema['enum'] as $allowed) {
                $found = $found || self::same($allowed, $value);
            }
            if (!$found) {
                return false;
            }
        }
        switch ($schema['type'] ?? null) {
            case 'null':
                return $value === null;
            case 'string':
                return is_string($value);
            case 'boolean':
                return is_bool($value);
            case 'integer':
                return self::is_integer($value);
            case 'array':
                if (!is_array($value) || (isset($schema['minItems']) && count($value) < $schema['minItems'])
                        || (isset($schema['maxItems']) && count($value) > $schema['maxItems'])) {
                    return false;
                }
                foreach ($value as $item) {
                    if (!self::matches($item, $schema['items'] ?? null)) {
                        return false;
                    }
                }
                return true;
            case 'object':
                if (!is_object($value)) {
                    return false;
                }
                $properties = $schema['properties'] ?? [];
                foreach ($schema['required'] ?? [] as $key) {
                    if (!property_exists($value, $key) && !in_array($key, self::PROTO, true)) {
                        return false;
                    }
                }
                if (($schema['additionalProperties'] ?? null) === false) {
                    foreach (self::keys($value) as $key) {
                        if (!array_key_exists($key, $properties) && !in_array($key, self::PROTO, true)) {
                            return false;
                        }
                    }
                }
                foreach ($properties as $key => $child) {
                    if (property_exists($value, $key) && !self::matches($value->$key, $child)) {
                        return false;
                    }
                }
                return true;
            default:
                return false;
        }
    }

    // Word floors.

    /**
     * The service's ccCheckWordFloors(): the fields under their word floor.
     *
     * @param array $cards
     * @param string $route
     * @return array[] label, current, min and (when the field has one) max.
     */
    public static function floors(array $cards, string $route): array {
        $under = [];
        $add = function (string $label, int $current, int $min, ?int $max = null) use (&$under): void {
            $field = ['label' => $label, 'current' => $current, 'min' => $min];
            if ($max !== null) {
                $field['max'] = $max;
            }
            $under[] = $field;
        };
        foreach ($cards as $ci => $card) {
            if (!self::truthy($card)) {
                continue;
            }
            $type = self::prop($card, 'cardType');
            $at = 'cards[' . $ci . '].';
            if ($route === 'topicstext') {
                if ($type === 'decision-point') {
                    self::option_floors($add, $card, $ci);
                } else {
                    $paragraphs = self::prop($card, 'paragraphs');
                    $paragraphs = is_array($paragraphs) ? $paragraphs : [];
                    for ($pi = 0; $pi < 2; $pi++) {
                        $count = self::words($paragraphs[$pi] ?? null);
                        if ($count < 55) {
                            $add($at . 'paragraphs[' . $pi . ']', $count, 55);
                        }
                    }
                }
                continue;
            }
            $voiceover = self::prop($card, 'voiceoverText');
            if (is_string($voiceover) && self::trim($voiceover) !== '' && $type !== 'decision-point') {
                $count = self::words($voiceover);
                if ($count < 60) {
                    $add($at . 'voiceoverText', $count, 60);
                }
            }
            foreach (['context' => 70, 'bodyText' => 50, 'description' => 50, 'consequence' => 30, 'conceptDefinition' => 30,
                    'significance' => 30, 'skillStatement' => 30, 'relevance' => 30, 'turningPoint' => 25] as $key => $min) {
                $value = self::prop($card, $key);
                if (self::truthy($value)) {
                    $count = self::words($value);
                    if ($count < $min) {
                        $add($at . $key, $count, $min);
                    }
                }
            }
            $reflection = self::prop($card, 'reflection');
            if (self::truthy($reflection) && is_string($reflection)) {
                $count = self::words($reflection);
                if ($count < 20) {
                    $add($at . 'reflection', $count, 20);
                }
            }
            foreach (['keyPrinciple' => 15, 'impactStatement' => 30, 'keyInsight' => 15, 'criticalReflection' => 25,
                    'summaryLine' => 15] as $key => $min) {
                $value = self::prop($card, $key);
                if (self::truthy($value)) {
                    $count = self::words($value);
                    if ($count < $min) {
                        $add($at . $key, $count, $min);
                    }
                }
            }
            foreach (['keyTakeaway', 'proTip', 'keyInfo', 'expertInsight'] as $key) {
                $count = self::words(self::prop($card, $key));
                if ($count > 0 && $count < 13) {
                    $add($at . $key, $count, 15);
                }
            }
            $scene = $type === 'hook-scenario' || $type === 'applied-scenario';
            if ($scene) {
                [$keymin, $keymax] = self::RANGES['scenePartsText'];
            } else if ($type === 'concept-explainer') {
                [$keymin, $keymax] = self::RANGES['conceptInsightsText'];
            } else {
                [$keymin, $keymax] = [24, null];
            }
            if ($type === 'competency-summary') {
                [$stdmin, $stdmax] = [5, 10];
            } else if ($type === 'decision-point') {
                [$stdmin, $stdmax] = [7, 16];
            } else {
                [$stdmin, $stdmax] = [10, null];
            }
            $keypoints = self::or_empty(self::prop($card, 'keyPoints'));
            if ($scene && is_array(self::prop($card, 'sceneParts'))) {
                $keypoints = [];
            } else if ($type === 'concept-explainer' && is_array(self::prop($card, 'conceptInsights'))) {
                $keypoints = [];
            }
            $checks = [
                ['requirements', self::or_empty(self::prop($card, 'requirements')), 18, null],
                ['keyPoints', $keypoints, $keymin, $keymax],
                ['standardItems', self::or_empty(self::prop($card, 'standardItems')), $stdmin, $stdmax],
            ];
            foreach ($checks as [$field, $items, $min, $max]) {
                foreach (self::items($items) as $i => $item) {
                    if (is_string($item)) {
                        $count = self::words($item);
                        if ($count < $min) {
                            $add($at . $field . '[' . $i . ']', $count, $min, $max);
                        }
                    } else if (is_object($item) && is_string(self::prop($item, 'text'))) {
                        $count = self::words($item->text);
                        if ($count < $min) {
                            $add($at . $field . '[' . $i . '].text', $count, $min, $max);
                        }
                    }
                }
            }
            $structured = [];
            if ($scene && is_array(self::prop($card, 'sceneParts'))) {
                $structured[] = ['sceneParts', $card->sceneParts, self::RANGES['scenePartsText'], 'text'];
            }
            if ($type === 'concept-explainer' && is_array(self::prop($card, 'conceptInsights'))) {
                $structured[] = ['conceptInsights', $card->conceptInsights, self::RANGES['conceptInsightsText'], 'text'];
            }
            if ($type === 'mistakes' && is_array(self::prop($card, 'items'))) {
                $structured[] = ['items', $card->items, self::RANGES['itemConsequence'], 'consequence'];
            }
            foreach ($structured as [$field, $items, $range, $sub]) {
                foreach ($items as $i => $item) {
                    $value = is_object($item) || is_array($item) ? self::prop($item, $sub) : '';
                    if (!is_string($value)) {
                        continue;
                    }
                    $count = self::words($value);
                    if ($count < $range[0]) {
                        $add($at . $field . '[' . $i . '].' . $sub, $count, $range[0], $range[1]);
                    }
                }
            }
            if ($type === 'competency-summary' && is_array(self::prop($card, 'standardItems'))) {
                foreach ($card->standardItems as $si => $item) {
                    $benefit = is_object($item) && is_string(self::prop($item, 'benefit')) ? $item->benefit : '';
                    $count = self::words($benefit);
                    if ($count < 14) {
                        $add($at . 'standardItems[' . $si . '].benefit', $count, 14, 22);
                    }
                }
            }
            $errors = self::prop($card, 'errorItems');
            $legacy = $type === 'mistakes' && is_array(self::prop($card, 'items')) ? [] : (is_array($errors) ? $errors : []);
            if ($legacy) {
                if ($type === 'mistakes') {
                    [$conmin, $conmax] = self::RANGES['itemConsequence'];
                } else {
                    [$conmin, $conmax] = [$type === 'competency-summary' ? 10 : 12, null];
                }
                foreach ($legacy as $ei => $item) {
                    if ($type === 'decision-point' && (is_object($item) || is_array($item))) {
                        $error = self::prop($item, 'error');
                        $count = self::words(is_string($error) ? $error : '');
                        if ($count < 7) {
                            $add($at . 'errorItems[' . $ei . '].error', $count, 7, 16);
                        }
                    }
                    if (self::truthy($item) && is_string(self::prop($item, 'consequence'))) {
                        $count = self::words($item->consequence);
                        if ($count < $conmin) {
                            $add($at . 'errorItems[' . $ei . '].consequence', $count, $conmin, $conmax);
                        }
                    }
                }
            }
            $subchecks = [
                ['pitfallItems', [['pitfall', 10], ['correction', 10]]],
                ['risks', [['risk', 10]]],
                ['frameworkSteps', [['explanation', 10]]],
                ['applications', [['rationale', 10]]],
            ];
            foreach ($subchecks as [$field, $subs]) {
                self::sub_floors($add, $card, $ci, $field, $subs);
            }
            foreach (['consequences' => 10, 'cognitiveConsiderations' => 10, 'analysisPrompts' => 10, 'keyIndicators' => 8]
                    as $field => $min) {
                foreach (self::items(self::or_empty(self::prop($card, $field))) as $i => $item) {
                    if (is_string($item)) {
                        $count = self::words($item);
                        if ($count < $min) {
                            $add($at . $field . '[' . $i . ']', $count, $min);
                        }
                    }
                }
            }
            $steps = self::prop($card, 'steps');
            if (is_array($steps)) {
                [$min, $max] = self::RANGES['stepDetail'];
                foreach ($steps as $si => $item) {
                    if (self::truthy($item) && is_string(self::prop($item, 'detail'))) {
                        $count = self::words($item->detail);
                        if ($count < $min) {
                            $add($at . 'steps[' . $si . '].detail', $count, $min, $max);
                        }
                    }
                }
            }
            self::sub_floors($add, $card, $ci, 'policyItems', [['requirement', 12]]);
            self::sub_floors($add, $card, $ci, 'risks', [['impact', 12], ['mitigation', 8]]);
            self::option_floors($add, $card, $ci);
            if ($type === 'decision-point') {
                [$min, $max] = self::RANGES['optionFeedback'];
                $feedback = function ($value, string $label) use ($add, $min, $max): void {
                    if (!is_string($value)) {
                        return;
                    }
                    $count = self::words($value);
                    if ($count < $min) {
                        $add($label, $count, $min, $max);
                    }
                };
                $options = self::prop($card, 'options');
                if (is_array($options)) {
                    foreach ($options as $oi => $option) {
                        $feedback(self::prop($option, 'feedback'), $at . 'options[' . $oi . '].feedback');
                    }
                }
                $questions = self::prop($card, 'questions');
                if (is_array($questions)) {
                    foreach ($questions as $qi => $q) {
                        $options = self::prop($q, 'options');
                        if (!is_array($options)) {
                            continue;
                        }
                        foreach ($options as $oi => $option) {
                            $feedback(self::prop($option, 'feedback'),
                                $at . 'questions[' . $qi . '].options[' . $oi . '].feedback');
                        }
                    }
                }
            }
        }
        return $under;
    }

    /**
     * Floors for named fields of the objects in an array field.
     *
     * @param callable $add
     * @param mixed $card
     * @param int $ci
     * @param string $field
     * @param array $subs [name, minimum] pairs.
     */
    protected static function sub_floors(callable $add, $card, int $ci, string $field, array $subs): void {
        $items = self::prop($card, $field);
        if (!is_array($items)) {
            return;
        }
        foreach ($items as $i => $item) {
            foreach ($subs as [$sub, $min]) {
                if (self::truthy($item) && is_string(self::prop($item, $sub))) {
                    $count = self::words($item->$sub);
                    if ($count < $min) {
                        $add('cards[' . $ci . '].' . $field . '[' . $i . '].' . $sub, $count, $min);
                    }
                }
            }
        }
    }

    /**
     * The service's ccAddDecisionOptionFloorChecks(): decision option texts of at least seven words.
     *
     * @param callable $add
     * @param mixed $card
     * @param int $ci
     */
    protected static function option_floors(callable $add, $card, int $ci): void {
        if (self::prop($card, 'cardType') !== 'decision-point') {
            return;
        }
        $inspect = function (array $options, string $prefix) use ($add, $ci): void {
            foreach ($options as $oi => $option) {
                if (!is_object($option) || !is_string(self::prop($option, 'text'))) {
                    continue;
                }
                $count = self::words($option->text);
                if ($count < 7) {
                    $add('cards[' . $ci . '].' . $prefix . '[' . $oi . '].text', $count, 7, 16);
                }
            }
        };
        $questions = self::prop($card, 'questions');
        $options = self::prop($card, 'options');
        if (self::same(self::prop($card, 'schemaVersion'), 2) && is_array($questions)) {
            foreach ($questions as $qi => $q) {
                $qoptions = self::prop($q, 'options');
                if (is_array($qoptions)) {
                    $inspect($qoptions, 'questions[' . $qi . '].options');
                }
            }
        } else if (is_array($options)) {
            $inspect($options, 'options');
        }
    }

    /**
     * The service's ccRepairTargetWords().
     *
     * @param array $field
     * @return int
     */
    protected static function target(array $field): int {
        return isset($field['max']) ? min($field['min'] + 4, $field['max']) : $field['min'] + 4;
    }

    /**
     * The service's ccLengthDiagnostic(): word counts and the fields under their floor, for the meta.
     *
     * @param string $pass
     * @param array $cards
     * @param array $under
     * @return array
     */
    protected static function diagnostic(string $pass, array $cards, array $under): array {
        $counts = [];
        foreach ($cards as $ci => $card) {
            foreach (self::labels($card, 'cards[' . $ci . ']') as $label) {
                $counts[] = ['label' => $label, 'words' => self::words(self::get_text($cards, $label))];
            }
        }
        $fields = [];
        foreach ($under as $f) {
            $fields[] = ['label' => $f['label'], 'current' => $f['current'], 'min' => $f['min'], 'max' => $f['max'] ?? null,
                'source' => 'server'];
        }
        return ['pass' => $pass, 'wordCounts' => $counts, 'underRangeFieldCount' => count($under),
            'underRangeFields' => $fields];
    }

    /**
     * The service's ccApplyTargetedRepairs(): copy only requested fields that now meet their floor and did not shrink.
     *
     * @param array $cards
     * @param array $candidate The repaired cards the AI returned.
     * @param array $fields
     * @return int How many were applied.
     */
    protected static function apply_repairs(array &$cards, array $candidate, array $fields): int {
        $applied = 0;
        foreach ($fields as $f) {
            $words = self::words(self::get_text($candidate, $f['label']));
            $max = $f['max'] ?? null;
            if ($words >= self::target($f) && $words >= self::words(self::get_text($cards, $f['label']))
                    && ($max === null || $words <= $max)
                    && self::set_text($cards, $f['label'], self::get_text($candidate, $f['label']))) {
                $applied++;
            }
        }
        return $applied;
    }

    // Banned words.

    /**
     * The service's ccCheckBannedWords().
     *
     * @param array $cards
     * @return array high (the banned words found), total, needsRewrite
     */
    protected static function banned(array $cards): array {
        $text = mb_strtolower(self::json($cards), 'UTF-8');
        $high = [];
        foreach (self::BANNED as $word) {
            if (preg_match('/\b' . preg_quote($word, '/') . '\b/i', $text)) {
                $high[] = $word;
            }
        }
        return ['high' => $high, 'total' => count($high), 'needsRewrite' => count($high) >= 1];
    }

    /**
     * The service's ccExtractBannedFieldTexts(): the text fields that contain a banned word.
     *
     * @param array $cards
     * @param array $words
     * @return array[] cardIndex, field, text
     */
    protected static function banned_fields(array $cards, array $words): array {
        $affected = [];
        foreach ($cards as $ci => $card) {
            foreach (self::labels($card, 'cards[' . $ci . ']') as $label) {
                $text = self::get_text($cards, $label);
                $lower = mb_strtolower($text, 'UTF-8');
                foreach ($words as $word) {
                    if (strpos($lower, mb_strtolower($word, 'UTF-8')) !== false) {
                        $affected[] = ['cardIndex' => $ci, 'field' => preg_replace('/^cards\[\d+\]\./', '', $label),
                            'text' => $text];
                        break;
                    }
                }
            }
        }
        return $affected;
    }

    // Card fields by label, such as cards[2].keyPoints[1].text.

    /**
     * The service's ccTextFieldLabels(): the labels of every text in a value.
     *
     * @param mixed $value
     * @param string $prefix
     * @return string[]
     */
    protected static function labels($value, string $prefix): array {
        if (is_string($value)) {
            return [$prefix];
        }
        $out = [];
        if (is_array($value)) {
            foreach ($value as $i => $item) {
                array_push($out, ...self::labels($item, $prefix . '[' . $i . ']'));
            }
        } else if (is_object($value)) {
            foreach (self::keys($value) as $key) {
                if ($key === 'cardType' || $key === 'schemaVersion') {
                    continue;
                }
                array_push($out, ...self::labels($value->$key, $prefix . '.' . $key));
            }
        }
        return $out;
    }

    /**
     * The service's ccFieldPath().
     *
     * @param string $label
     * @return array|null
     */
    protected static function path(string $label): ?array {
        if (!preg_match('/^cards\[(\d+)\]\.([^\n\r\x{2028}\x{2029}]+)\z/u', $label, $m)) {
            return null;
        }
        $path = [(int) $m[1]];
        preg_match_all('/([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/', $m[2], $tokens, PREG_SET_ORDER);
        foreach ($tokens as $t) {
            $path[] = isset($t[2]) ? (int) $t[2] : $t[1];
        }
        return count($path) > 1 ? $path : null;
    }

    /**
     * The service's ccGetFieldText().
     *
     * @param array $cards
     * @param string $label
     * @return string
     */
    public static function get_text(array $cards, string $label): string {
        $path = self::path($label);
        if ($path === null) {
            return '';
        }
        $value = $cards;
        foreach ($path as $part) {
            if ($value === null) {
                return '';
            }
            $value = self::prop($value, $part);
        }
        return is_string($value) ? $value : '';
    }

    /**
     * The service's ccSetFieldText().
     *
     * @param array $cards
     * @param string $label
     * @param string $text
     * @return bool
     */
    public static function set_text(array &$cards, string $label, string $text): bool {
        $path = self::path($label);
        if ($path === null || self::trim($text) === '') {
            return false;
        }
        $parent = &$cards;
        foreach ($path as $n => $part) {
            if ($parent === null) {
                return false;
            }
            if (is_array($parent)) {
                if (!is_int($part) || $part >= count($parent)) {
                    return false;
                }
                if ($n === count($path) - 1) {
                    $parent[$part] = $text;
                    return true;
                }
                $parent = &$parent[$part];
            } else if (is_object($parent)) {
                if (!property_exists($parent, (string) $part)) {
                    return false;
                }
                if ($n === count($path) - 1) {
                    $parent->{(string) $part} = $text;
                    return true;
                }
                $parent = &$parent->{(string) $part};
            } else {
                throw new \RuntimeException("Cannot use 'in' operator to search for '" . $part . "'");
            }
        }
        return false;
    }

    // JavaScript semantics.

    /** @var string What parse() returns when JSON.parse would throw. */
    const BAD = "\0bad-json\0";

    /**
     * JSON.parse, with objects kept as stdClass; self::BAD when it would throw.
     *
     * @param string $text
     * @return mixed
     */
    public static function parse(string $text) {
        try {
            $value = json_decode($text, false, 100000, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            return self::BAD;
        }
        return self::doubles($value);
    }

    /**
     * Integers too big for a JavaScript number become doubles, as JSON.parse makes them.
     *
     * @param mixed $value
     * @return mixed
     */
    protected static function doubles($value) {
        if (is_int($value)) {
            return abs($value) > 9007199254740992 ? (float) $value : $value;
        }
        if (is_array($value)) {
            return array_map([self::class, 'doubles'], $value);
        }
        if (is_object($value)) {
            foreach (get_object_vars($value) as $key => $child) {
                $value->{(string) $key} = self::doubles($child);
            }
        }
        return $value;
    }

    /**
     * JSON.parse(JSON.stringify(value)): a deep copy, with non-finite numbers as null.
     *
     * @param mixed $value
     * @return mixed
     */
    public static function copy($value) {
        if (is_float($value) && !is_finite($value)) {
            return null;
        }
        if (is_array($value)) {
            return array_map([self::class, 'copy'], $value);
        }
        if (is_object($value)) {
            $out = new \stdClass();
            foreach (self::keys($value) as $key) {
                $out->$key = self::copy($value->$key);
            }
            return $out;
        }
        return $value;
    }

    /**
     * An object's keys in JavaScript order: array-index keys ascending, then the rest as inserted.
     *
     * @param \stdClass $object
     * @return string[]
     */
    public static function keys(\stdClass $object): array {
        $indexes = [];
        $names = [];
        foreach (array_keys(get_object_vars($object)) as $key) {
            $key = (string) $key;
            if (preg_match('/^(?:0|[1-9][0-9]*)$/', $key) && (float) $key < 4294967295) {
                $indexes[] = $key;
            } else {
                $names[] = $key;
            }
        }
        usort($indexes, function ($a, $b) {
            return (float) $a <=> (float) $b;
        });
        return array_merge($indexes, $names);
    }

    /**
     * JSON.stringify(value) or, with a gap, JSON.stringify(value, null, gap).
     *
     * @param mixed $value
     * @param string $gap
     * @param string $indent
     * @return string
     */
    public static function json($value, string $gap = '', string $indent = ''): string {
        if ($value === null || is_bool($value)) {
            return $value === null ? 'null' : ($value ? 'true' : 'false');
        }
        if (is_int($value) || is_float($value)) {
            return is_float($value) && !is_finite($value) ? 'null' : self::numstr($value);
        }
        if (is_string($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS
                | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        $inner = $indent . $gap;
        $parts = [];
        if (is_array($value)) {
            if (!$value) {
                return '[]';
            }
            foreach ($value as $item) {
                $parts[] = self::json($item, $gap, $inner);
            }
            [$open, $close] = ['[', ']'];
        } else {
            foreach (self::keys($value) as $key) {
                $parts[] = self::json($key) . ($gap === '' ? ':' : ': ') . self::json($value->$key, $gap, $inner);
            }
            if (!$parts) {
                return '{}';
            }
            [$open, $close] = ['{', '}'];
        }
        if ($gap === '') {
            return $open . implode(',', $parts) . $close;
        }
        return $open . "\n" . $inner . implode(",\n" . $inner, $parts) . "\n" . $indent . $close;
    }

    /**
     * value[key] for a JSON value; null where JavaScript gives undefined.
     *
     * @param mixed $value
     * @param string|int $key
     * @return mixed
     */
    public static function prop($value, $key) {
        if (is_object($value)) {
            return property_exists($value, (string) $key) ? $value->{(string) $key} : null;
        }
        $index = is_int($key) ? $key : (preg_match('/^(?:0|[1-9][0-9]*)$/', (string) $key) ? (int) $key : null);
        if (is_array($value)) {
            if ($key === 'length') {
                return count($value);
            }
            return $index !== null && $index < count($value) ? $value[$index] : null;
        }
        if (is_string($value)) {
            if ($key === 'length') {
                return self::len($value);
            }
            if ($index === null || $index >= self::len($value)) {
                return null;
            }
            return mb_convert_encoding(substr(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8'), $index * 2, 2), 'UTF-8',
                'UTF-16LE');
        }
        return null;
    }

    /**
     * value[key] = v on a card.
     *
     * @param mixed $card
     * @param string $key
     * @param mixed $v
     */
    protected static function set_prop(&$card, string $key, $v): void {
        if (!is_object($card)) {
            throw new \RuntimeException("Cannot set properties of " . self::str($card));
        }
        $card->$key = $v;
    }

    /**
     * value || []: the value when truthy.
     *
     * @param mixed $value
     * @return mixed
     */
    protected static function or_empty($value) {
        return self::truthy($value) ? $value : [];
    }

    /**
     * What `for (i = 0; i < x.length; i++) x[i]` visits.
     *
     * @param mixed $value
     * @return array
     */
    protected static function items($value): array {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value)) {
            $out = [];
            for ($i = 0, $n = self::len($value); $i < $n; $i++) {
                $out[] = self::prop($value, $i);
            }
            return $out;
        }
        if (is_object($value) && self::is_integer(self::prop($value, 'length'))) {
            $out = [];
            for ($i = 0; $i < $value->length; $i++) {
                $out[] = self::prop($value, $i);
            }
            return $out;
        }
        return [];
    }

    /**
     * JavaScript truthiness.
     *
     * @param mixed $value
     * @return bool
     */
    public static function truthy($value): bool {
        if (is_float($value) && is_nan($value)) {
            return false;
        }
        return is_array($value) || is_object($value) || ($value !== null && $value !== false && $value !== 0
            && $value !== 0.0 && $value !== '');
    }

    /**
     * String(value), as a template literal writes it.
     *
     * @param mixed $value
     * @return string
     */
    public static function str($value): string {
        if (is_string($value)) {
            return $value;
        }
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value) || is_float($value)) {
            return self::numstr($value);
        }
        if (is_array($value)) {
            return implode(',', array_map(function ($item) {
                return $item === null ? '' : self::str($item);
            }, $value));
        }
        return '[object Object]';
    }

    /**
     * Strict equality between JSON values (numbers compare by value).
     *
     * @param mixed $a
     * @param mixed $b
     * @return bool
     */
    protected static function same($a, $b): bool {
        if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) {
            return $a == $b;
        }
        return $a === $b;
    }

    /**
     * Number.isInteger.
     *
     * @param mixed $value
     * @return bool
     */
    protected static function is_integer($value): bool {
        return is_int($value) || (is_float($value) && is_finite($value) && floor($value) == $value);
    }

    /**
     * Array.isArray.
     *
     * @param mixed $value
     * @return bool
     */
    protected static function is_list($value): bool {
        return is_array($value);
    }

    /**
     * The service's ccWordCount(): (str || '').trim().split(/\s+/).filter(Boolean).length.
     *
     * @param mixed $value
     * @return int
     */
    public static function words($value): int {
        if (!self::truthy($value)) {
            return 0;
        }
        if (!is_string($value)) {
            throw new \RuntimeException('(str || "").trim is not a function');
        }
        return count(preg_split('/[' . self::WS . ']+/u', self::trim($value), -1, PREG_SPLIT_NO_EMPTY));
    }

    /**
     * String.prototype.trim.
     *
     * @param string $s
     * @return string
     */
    public static function trim(string $s): string {
        return preg_replace('/^[' . self::WS . ']+|[' . self::WS . ']+$/u', '', $s);
    }

    /**
     * A string's length in UTF-16 code units.
     *
     * @param string $s
     * @return int
     */
    public static function len(string $s): int {
        return (int) (strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')) / 2);
    }

    /**
     * String(number) as JavaScript writes it.
     *
     * @param int|float $n
     * @return string
     */
    public static function numstr($n): string {
        if (is_int($n)) {
            return (string) $n;
        }
        if (is_nan($n)) {
            return 'NaN';
        }
        if (is_infinite($n)) {
            return $n > 0 ? 'Infinity' : '-Infinity';
        }
        if ($n == 0) {
            return '0';
        }
        for ($precision = 1; $precision <= 17; $precision++) {
            $e = sprintf('%.' . ($precision - 1) . 'e', abs($n));
            if ((float) $e === abs($n)) {
                break;
            }
        }
        [$mantissa, $exponent] = explode('e', $e);
        $digits = rtrim(str_replace('.', '', $mantissa), '0');
        $digits = $digits === '' ? '0' : $digits;
        $k = strlen($digits);
        $point = (int) $exponent + 1;
        $sign = $n < 0 ? '-' : '';
        if ($k <= $point && $point <= 21) {
            return $sign . $digits . str_repeat('0', $point - $k);
        }
        if (0 < $point && $point <= 21) {
            return $sign . substr($digits, 0, $point) . '.' . substr($digits, $point);
        }
        if (-6 < $point && $point <= 0) {
            return $sign . '0.' . str_repeat('0', -$point) . $digits;
        }
        $exp = $point - 1;
        return $sign . ($k === 1 ? $digits : $digits[0] . '.' . substr($digits, 1)) . 'e' . ($exp >= 0 ? '+' . $exp : $exp);
    }
}
