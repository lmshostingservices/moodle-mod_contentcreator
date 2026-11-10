<?php
namespace mod_contentcreator\aicoursebuilder;

defined('MOODLE_INTERNAL') || die();

/**
 * Generate one course lesson through Content Creator's native async route and manifest store.
 */
class native_adapter {
    private const ESTIMATE_ROUTE = '/api/moodle/content-creator/estimate';
    private const START_ROUTE = '/api/moodle/content-creator/prompt/start';
    private const JOB_ROUTE = '/api/jobs/';

    public static function estimate(): int {
        $quote = \local_aicoursebuilder\local\api_client::request_json(
            'POST',
            self::ESTIMATE_ROUTE,
            [],
            15
        );
        if (empty($quote['success']) || ($quote['operation'] ?? '') !== 'subtopic' || !isset($quote['credits'])) {
            throw new \moodle_exception('generationfailed', 'local_aicoursebuilder');
        }
        return max(0, (int)$quote['credits']);
    }

    public static function generate(int $cmid, array $brief): string {
        global $DB;
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $instance = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);
        $programid = (int)($brief['programid'] ?? 0);
        $lesson = (array)($brief['lesson'] ?? []);
        $program = (array)($brief['program'] ?? []);
        $title = clean_param((string)($lesson['title'] ?? $instance->name), PARAM_TEXT);
        $source = trim(clean_param((string)($brief['sourcecontent'] ?? ''), PARAM_TEXT));
        // Content Creator is planned when the teacher supplies a long sample, so the
        // sample text is the main source. Add every supplied source after the outcomes.
        $extra = [];
        foreach ((array)($brief['sources'] ?? []) as $item) {
            $text = trim(clean_param((string)($item['text'] ?? ''), PARAM_TEXT));
            if ($text !== '' && strpos($source, $text) === false) {
                $extra[] = clean_param((string)($item['name'] ?? 'Source'), PARAM_TEXT) . ":\n" . $text;
            }
        }
        if ($extra) {
            $source = trim("Lesson outcomes:\n" . $source . "\n\n" . implode("\n\n", $extra));
        }
        if ($source === '') {
            throw new \moodle_exception('generationfailed', 'local_aicoursebuilder');
        }
        $source = \core_text::substr($source, 0, 20000);
        $language = trim(clean_param((string)($program['language'] ?? ''), PARAM_TEXT)) ?: 'English';
        $spelling = trim(clean_param((string)($program['spelling'] ?? ''), PARAM_TEXT));
        $locale = ['australian' => 'en-AU', 'british' => 'en-GB', 'american' => 'en-US'][\core_text::strtolower($spelling)] ?? 'en-AU';
        $level = is_scalar($program['level'] ?? null)
            ? clean_param((string)$program['level'], PARAM_TEXT) : '';
        $country = is_scalar($program['country'] ?? null)
            ? clean_param((string)$program['country'], PARAM_TEXT) : '';
        $sector = is_scalar($program['sector'] ?? null) ? clean_param((string)$program['sector'], PARAM_TEXT) : '';
        $profile = is_scalar($program['learnerProfile'] ?? null) ? clean_param((string)$program['learnerProfile'], PARAM_TEXT) : '';
        $audience = trim(implode(', ', array_filter([$country, $sector, $level, \core_text::substr($profile, 0, 400)])));
        $systemprompt = implode("\n", [
            'You create accurate, age-appropriate educational lesson content using only the supplied curriculum source.',
            'Generate ALL content in ' . $language . ($spelling !== '' ? ' with ' . $spelling . ' spelling' : '') . '. This is NON-NEGOTIABLE.',
            'Follow the server-provided card schema exactly. Do not invent standards, citations, or facts absent from the source.',
            'Use clear language for the stated learner level and make every card teach the stated lesson outcomes.',
        ]);
        $userprompt = implode("\n\n", [
            'Create one self-contained lesson pack for a Moodle Content Creator activity.',
            'Lesson title: ' . $title,
            'Learner audience: ' . ($audience !== '' ? $audience : 'General learners'),
            'Curriculum and lesson source (the only factual authority):',
            $source,
        ]);
        $subtopickey = 'aicb-' . $programid . '-cc-' . $cmid;
        $attempt = max(1, (int)($brief['attempt'] ?? 1));
        $idempotencykey = 'aicb_cc_' . $programid . '_' . $cmid . ($attempt > 1 ? '_a' . $attempt : '');
        $started = \local_aicoursebuilder\local\api_client::request_json(
            'POST',
            self::START_ROUTE,
            [
                'systemPrompt' => $systemprompt,
                'userPrompt' => $userprompt,
                'contentType' => 'section',
                'route' => 'general',
                'language' => $locale,
                'creditsToUse' => self::estimate(),
                'subtopicKey' => $subtopickey,
                'sectionId' => (string)$cmid,
            ],
            30,
            ['Idempotency-Key: ' . $idempotencykey]
        );
        $jobid = (string)($started['jobId'] ?? '');
        if (empty($started['ok']) || !preg_match('/^[A-Za-z0-9-]{1,100}$/', $jobid)) {
            throw new \moodle_exception('generationfailed', 'local_aicoursebuilder');
        }
        return $jobid;
    }

    public static function status(int $cmid, string $jobid): array {
        if (!preg_match('/^[A-Za-z0-9-]{1,100}$/', $jobid)) {
            return ['status' => 'failed', 'retryable' => false, 'error' => 'The Content Creator job reference is invalid.'];
        }
        try {
            $poll = \local_aicoursebuilder\local\api_client::request_json(
                'GET',
                self::JOB_ROUTE . rawurlencode($jobid),
                null,
                20
            );
        } catch (\Throwable $e) {
            return ['status' => 'running'];
        }
        $status = (string)($poll['status'] ?? '');
        if ($status === 'pending' || $status === 'processing' || $status === 'running') {
            return ['status' => 'running'];
        }
        if ($status === 'error' || $status === 'expired') {
            $reason = trim(clean_param((string)($poll['error'] ?? ($poll['result']['error'] ?? '')), PARAM_TEXT));
            // A provider outage is temporary and the failed job is not charged, so let
            // the builder retry it (with a new attempt key) instead of failing for good.
            $transient = ($poll['errorCode'] ?? '') === 'JOB_GENERATION_FAILED';
            return ['status' => 'failed', 'retryable' => $transient,
                'error' => 'Content Creator generation did not complete' . ($reason !== '' ? ': ' . $reason : '.')];
        }
        if ($status !== 'done' || !is_array($poll['result'] ?? null) || empty($poll['result']['success'])) {
            return ['status' => 'failed', 'retryable' => false, 'error' => 'Content Creator returned an incomplete result.'];
        }

        $content = (string)($poll['result']['content'] ?? '');
        $cards = json_decode($content, true);
        if (is_array($cards) && isset($cards['cards']) && is_array($cards['cards'])) {
            $cards = $cards['cards'];
        }
        if (!is_array($cards) || $cards === []) {
            return ['status' => 'failed', 'retryable' => false, 'error' => 'Content Creator returned no usable lesson cards.'];
        }
        foreach ($cards as $card) {
            if (!is_array($card) || empty($card['cardType']) || !is_string($card['cardType'])) {
                return ['status' => 'failed', 'retryable' => false, 'error' => 'Content Creator returned a card with an invalid type.'];
            }
        }
        $manifest = self::manifest_for($cmid, $cards);
        return ['status' => 'complete', 'result' => ['manifest' => $manifest]];
    }

    public static function save_result(int $cmid, array $result): bool {
        if (!is_array($result['manifest'] ?? null)) {
            return false;
        }
        $saved = \mod_contentcreator\external\save_manifest::execute(
            $cmid,
            json_encode($result['manifest'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            'AI Course Builder'
        );
        return !empty($saved['success']);
    }

    private static function manifest_for(int $cmid, array $cards): array {
        $now = gmdate('c');
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        global $DB;
        $instance = $DB->get_record('contentcreator', ['id' => $cm->instance], 'name', MUST_EXIST);
        $title = clean_param((string)$instance->name, PARAM_TEXT);
        return [
            'version' => '6.3.0',
            'locked' => true,
            'createdAt' => $now,
            'generatedAt' => $now,
            'mode' => 'general',
            'context' => [
                'mode' => 'general',
                'courseBuilder' => true,
                'activitiesEnabled' => false,
                'generateImages' => false,
            ],
            'topics' => [[
                'id' => 'aicb-topic-' . $cmid,
                'title' => $title,
                'sections' => [[
                    'id' => 'aicb-section-' . $cmid,
                    'title' => $title,
                    'cards' => array_values($cards),
                ]],
            ]],
            'totalSections' => 1,
            'totalCards' => count($cards),
            'estimatedMinutes' => 10,
            'voiceSettings' => ['enabled' => false, 'language' => 'en-AU'],
            'imageSettings' => ['enabled' => false],
            'activitySettings' => ['enabled' => false],
        ];
    }
}
