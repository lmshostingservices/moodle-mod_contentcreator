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

namespace mod_contentcreator;

use mod_contentcreator\local\byok\documents;
use mod_contentcreator\local\byok\engine;
use mod_contentcreator\local\byok\media;

/**
 * Bring your own AI: Content Creator work that runs on the site's own AI instead of LMS Labs credits.
 *
 * AI Grader Central Config (local_aiconfig) decides, for each kind of work, whether it runs on LMS Labs credits,
 * the Moodle AI subsystem or the site's own key. Writing (cards and document examples), pictures and narration are
 * decided separately. Work on the site's own AI runs the service's own logic (local\byok) inside this Moodle site and
 * answers exactly as the service would, so the page does not need to know where it ran. Pictures are kept in the
 * activity's own files instead of on LMS Labs. The free helpers (topic and workplace suggestions, document reading,
 * training.gov.au and the community gallery) stay on LMS Labs.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class byok {
    /** The component Central Config knows this plugin by. */
    const COMPONENT = 'mod_contentcreator';
    /** Seconds one text call may take: a pack of cards is a long answer. */
    const TEXT_TIMEOUT = 240;
    /** Seconds a request may run while the site's own AI works. */
    const TIME_LIMIT = 600;
    /** Job ids of generations running here start with this. */
    const JOB_PREFIX = 'byok';
    /** The plugin's Google voices, and the closest OpenAI voice for each. */
    const OPENAI_VOICES = ['Aoede' => 'nova', 'Kore' => 'shimmer', 'Leda' => 'coral', 'Zephyr' => 'sage',
        'Puck' => 'onyx', 'Charon' => 'echo', 'Fenrir' => 'ash', 'Orus' => 'ballad'];
    /** What the routes need in siteId and apiKey when nothing goes to LMS Labs. */
    const NO_CREDENTIALS = 'byok';
    /** Pictures kept for the activity share the voiceover file area, so backup and restore carry them. */
    const FILEAREA = 'voiceovers';

    /** @var string|null What the site's AI said when its last call failed. */
    protected static $lasterror = null;

    /**
     * Whether a kind of work runs on the site's own AI now.
     *
     * @param string $kind text, image or voice.
     * @return bool
     */
    public static function uses(string $kind): bool {
        return class_exists('\local_aiconfig\byok\ai') && \local_aiconfig\byok\ai::uses_own_ai(self::COMPONENT, $kind);
    }

    /**
     * Which kinds of work run on the site's own AI, for the page.
     *
     * @return array text, image, voice => bool.
     */
    public static function state(): array {
        return ['text' => self::uses('text'), 'image' => self::uses('image'), 'voice' => self::uses('voice')];
    }

    /**
     * Whether any work runs on the site's own AI, so LMS Labs credentials are not needed for it.
     *
     * @return bool
     */
    public static function any(): bool {
        return in_array(true, self::state(), true);
    }

    // Writing.

    /**
     * Write cards (POST /api/moodle/content-creator/prompt) on the site's own AI.
     *
     * @param array $payload The request the plugin would send to LMS Labs.
     * @return array The service's answer.
     */
    public static function prompt(array $payload): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks();
        [, $answer] = engine::prompt(self::body($payload));
        return self::answer($answer);
    }

    /**
     * One example workplace document (POST /api/moodle/content-creator/generate-document-example).
     *
     * @param array $payload
     * @return array
     */
    public static function example(array $payload): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks();
        [, $answer] = documents::example(self::body($payload));
        return self::answer($answer);
    }

    /**
     * Several example documents at once (POST /api/moodle/content-creator/batch-generate-documents).
     *
     * @param array $payload
     * @return array
     */
    public static function batch(array $payload): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks();
        [, $answer] = documents::batch(self::body($payload));
        return self::answer($answer);
    }

    // Background writing: a job polled like the service's /api/jobs.

    /**
     * The cache that holds own-AI generation jobs.
     *
     * @return \cache
     */
    protected static function jobs(): \cache {
        return \cache::make('mod_contentcreator', 'byokjobs');
    }

    /**
     * Cache key for a job id or an idempotency key.
     *
     * @param string $name
     * @return string
     */
    protected static function key(string $name): string {
        return 'j' . sha1($name);
    }

    /**
     * Whether a job id is one of this plugin's own-AI jobs.
     *
     * @param string $jobid
     * @return bool
     */
    public static function is_job(string $jobid): bool {
        return strpos($jobid, self::JOB_PREFIX) === 0;
    }

    /**
     * Start writing cards in the background (POST /api/moodle/content-creator/prompt/start).
     *
     * A repeat of a submit with the same idempotency key gets the first job back instead of a second one, as on the
     * service.
     *
     * @param array $payload The prompt request.
     * @param \context $context The activity.
     * @param string $idempotencykey The page's key for this submit, or ''.
     * @return array ok, jobId, idempotency; and new (true when the job still has to be run).
     */
    public static function start(array $payload, \context $context, string $idempotencykey): array {
        global $USER;
        $jobs = self::jobs();
        $claim = $idempotencykey === '' ? null : self::key("idem:{$USER->id}:{$context->id}:{$idempotencykey}");
        if ($claim !== null) {
            $earlier = $jobs->get($claim);
            if ($earlier !== false) {
                if ($earlier['hash'] !== sha1(json_encode($payload))) {
                    return ['ok' => false, 'error' => 'Idempotency-Key was already used with a different payload'];
                }
                return ['ok' => true, 'jobId' => $earlier['jobid'], 'idempotency' => true, 'new' => false];
            }
        }
        $jobid = self::JOB_PREFIX . bin2hex(random_bytes(16));
        $jobs->set(self::key($jobid), ['contextid' => $context->id, 'status' => 'pending']);
        if ($claim !== null) {
            $jobs->set($claim, ['jobid' => $jobid, 'hash' => sha1(json_encode($payload))]);
        }
        return ['ok' => true, 'jobId' => $jobid, 'idempotency' => false, 'new' => true];
    }

    /**
     * Send the page its answer, then write the cards in this same request.
     *
     * Each section runs in its own web request, side by side, as on the service. Where the web server cannot hand the
     * answer back before the work ends, the job goes to a background task instead.
     *
     * @param array $response The JSON answer for the page.
     * @param string $jobid
     * @param array $payload The prompt request.
     * @param \context $context The activity.
     */
    public static function answer_then_run(array $response, string $jobid, array $payload, \context $context): void {
        global $USER;
        $data = ['jobid' => $jobid, 'payload' => $payload];
        $json = json_encode($response);
        if (function_exists('fastcgi_finish_request') || PHP_SAPI === 'apache2handler') {
            ignore_user_abort(true);
            \core\session\manager::write_close();
            while (ob_get_level() > 0) {
                ob_end_clean();
            }
            if (!headers_sent()) {
                header('Content-Type: application/json; charset=utf-8');
                header('Content-Length: ' . strlen($json));
                header('Connection: close');
            }
            echo $json;
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            } else {
                flush();
            }
            self::run_job($data);
            return;
        }
        $task = new task\byok_generate();
        $task->set_custom_data($data);
        $task->set_userid($USER->id);
        \core\task\manager::queue_adhoc_task($task);
        echo $json;
    }

    /**
     * Answer a job poll as /api/jobs does.
     *
     * @param string $jobid
     * @param \context $context The activity asking.
     * @return array|null The poll answer, or null when the job is not one of this site's own-AI jobs.
     */
    public static function poll(string $jobid, \context $context): ?array {
        if (!self::is_job($jobid)) {
            return null;
        }
        $job = self::jobs()->get(self::key($jobid));
        if ($job === false || (int) $job['contextid'] !== (int) $context->id) {
            return ['ok' => false, 'error' => 'Job not found or expired'];
        }
        $answer = ['ok' => true, 'status' => $job['status']];
        if ($job['status'] === 'done') {
            $answer['result'] = $job['result'];
        } else if ($job['status'] === 'error') {
            $answer += ['result' => $job['result'], 'errorCode' => 'JOB_GENERATION_FAILED', 'error' => $job['error']];
        }
        return $answer;
    }

    /**
     * Run a job: write the cards and keep the answer for the poll.
     *
     * @param array $data jobid and payload.
     */
    public static function run_job(array $data): void {
        $jobs = self::jobs();
        $key = self::key($data['jobid']);
        $job = $jobs->get($key);
        if ($job === false || $job['status'] !== 'pending') {
            return;
        }
        $jobs->set($key, ['status' => 'processing'] + $job);
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks();
        try {
            [$status, $answer] = engine::prompt(self::body($data['payload']));
            $answer = self::answer($answer);
        } catch (\Throwable $e) {
            [$status, $answer] = [500, ['success' => false, 'error' => $e->getMessage()]];
        }
        if ($status >= 200 && $status < 300 && ($answer['success'] ?? null) !== false) {
            $jobs->set($key, ['status' => 'done', 'result' => $answer] + $job);
            return;
        }
        // As on the service: the failure's own message, and the failed answer kept for the page.
        $error = $answer['error'] ?? '';
        $jobs->set($key, ['status' => 'error', 'result' => $answer,
            'error' => is_string($error) && $error !== '' ? $error : "Content Creator request failed (HTTP {$status})"] + $job);
    }

    // Narration.

    /**
     * Narrate a piece of text (POST /api/moodle/content-creator/tts) on the site's own voice.
     *
     * @param array $payload
     * @return array
     */
    public static function tts(array $payload): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks();
        [, $answer] = media::tts(self::body($payload));
        return self::answer($answer);
    }

    // Pictures.

    /**
     * One slide picture (POST /api/moodle/content-creator/generate-image), kept in the activity's files.
     *
     * The picture brief is written by the site's own text AI when writing runs here too; otherwise the service's
     * own fallback brief is used, as the service does when its writer gives no usable brief.
     *
     * @param array $payload
     * @param \context $context The activity.
     * @return array
     */
    public static function image(array $payload, \context $context): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks($context);
        [, $answer] = media::image(self::body($payload));
        return self::answer($answer);
    }

    /**
     * Three pictures to choose from for one slide (POST /api/moodle/content-creator/generate-slide-image).
     *
     * @param array|\stdClass $payload
     * @param \context $context The activity.
     * @return array
     */
    public static function slide_image($payload, \context $context): array {
        \core_php_time_limit::raise(self::TIME_LIMIT);
        self::hooks($context);
        [, $answer] = media::slide_image(self::body($payload));
        return self::answer($answer);
    }

    /**
     * A teacher's own picture for a slide (POST /api/moodle/content-creator/upload-slide-image), kept here.
     *
     * @param string $path The checked upload.
     * @param string $name Its file name.
     * @param \context $context The activity.
     * @return array
     */
    public static function upload(string $path, string $name, \context $context): array {
        self::hooks($context);
        [, $answer] = media::upload((string) file_get_contents($path), $name);
        $answer['ownai'] = true;
        return $answer;
    }

    /**
     * Keep a finished picture in the activity's files.
     *
     * @param string $jpeg
     * @param \context $context The activity.
     * @return string Its URL.
     */
    public static function store(string $jpeg, \context $context): string {
        $cmid = (int) $context->instanceid;
        $filename = 'image_' . bin2hex(random_bytes(16)) . '.jpg';
        get_file_storage()->create_file_from_string([
            'contextid' => $context->id, 'component' => self::COMPONENT, 'filearea' => self::FILEAREA,
            'itemid' => $cmid, 'filepath' => '/', 'filename' => $filename, 'mimetype' => 'image/jpeg',
        ], $jpeg);
        return \moodle_url::make_pluginfile_url($context->id, self::COMPONENT, self::FILEAREA, $cmid, '/', $filename)
            ->out(false);
    }

    /**
     * Whether a file in the activity's files is a slide picture kept here (rather than narration).
     *
     * @param string $filename
     * @return bool
     */
    public static function is_picture(string $filename): bool {
        return (bool) preg_match('/^image_[0-9a-f]{32}\.jpg$/', $filename);
    }

    // Plumbing.

    /**
     * The request as the service's routes see it, with the credentials the routes check for filled in.
     *
     * @param array|\stdClass $payload
     * @return \stdClass
     */
    protected static function body($payload): \stdClass {
        // Through JSON, so the port sees exactly the types the service would.
        $body = json_decode(json_encode($payload, JSON_PRESERVE_ZERO_FRACTION));
        if (!$body instanceof \stdClass) {
            $body = new \stdClass();
        }
        foreach (['siteId', 'apiKey'] as $key) {
            if (!is_string($body->$key ?? null) || trim($body->$key) === '') {
                $body->$key = self::NO_CREDENTIALS;
            }
        }
        return $body;
    }

    /**
     * The service's answer as an array, with what the site's AI said added to a failure.
     *
     * @param mixed $answer
     * @return array
     */
    protected static function answer($answer): array {
        $answer = json_decode(json_encode($answer), true);
        if (!is_array($answer)) {
            $answer = [];
        }
        if (empty($answer['success']) && self::$lasterror !== null && is_string($answer['error'] ?? null)
                && strpos($answer['error'], self::$lasterror) === false) {
            $answer['error'] .= ' ' . get_string('byok_said', 'mod_contentcreator', self::$lasterror);
        }
        $answer['ownai'] = true;
        return $answer;
    }

    /**
     * Point the ported routes at the site's own AI.
     *
     * @param \context|null $context The activity, where pictures are kept.
     */
    protected static function hooks(?\context $context = null): void {
        self::$lasterror = null;
        $text = self::uses('text');
        engine::$aicall = function (string $system, string $user, int $maxtokens, bool $json, float $temperature,
                ?array $schema) use ($text): string {
            if (!$text) {
                // Only the picture brief asks for writing while writing stays on LMS Labs: the brief falls back.
                return '';
            }
            try {
                return \local_aiconfig\byok\ai::text(self::COMPONENT, $system, $user, [
                    'json' => $json, 'maxtokens' => $maxtokens, 'temperature' => $temperature, 'schema' => $schema,
                    'timeout' => self::TEXT_TIMEOUT,
                ]);
            } catch (\moodle_exception $e) {
                self::$lasterror = $e->getMessage();
                throw $e;
            }
        };
        media::$image = function (string $prompt, string $size): string {
            try {
                return \local_aiconfig\byok\ai::image(self::COMPONENT, $prompt, ['size' => $size, 'quality' => 'high']);
            } catch (\moodle_exception $e) {
                self::$lasterror = $e->getMessage();
                throw $e;
            }
        };
        media::$tts = function (string $text, string $voiceid, string $language, string $format): string {
            try {
                return self::speech($text, $voiceid, $language, $format);
            } catch (\moodle_exception $e) {
                self::$lasterror = $e->getMessage();
                throw $e;
            }
        };
        media::$sleep = null;
        media::$store = $context === null ? null : function (string $jpeg) use ($context): string {
            return self::store($jpeg, $context);
        };
    }

    /**
     * One narration request.
     *
     * The service narrates with Google Chirp 3 HD voices at normal speed. A Google key uses the same voice; an OpenAI
     * key gets the closest OpenAI voice of the same kind; ElevenLabs uses the voice the administrator chose.
     *
     * @param string $text
     * @param string $voiceid A Chirp 3 HD voice, such as en-AU-Chirp3-HD-Zephyr.
     * @param string $language
     * @param string $format ogg or mp3.
     * @return string Audio bytes.
     */
    protected static function speech(string $text, string $voiceid, string $language, string $format): string {
        $vendor = \local_aiconfig\byok\router::vendor(\local_aiconfig\byok\router::VOICE);
        if ($vendor === 'googletts') {
            $name = $voiceid;
        } else if ($vendor === 'openai') {
            $parts = explode('-', $voiceid);
            $name = self::OPENAI_VOICES[end($parts)] ?? '';
        } else {
            $name = '';
        }
        return \local_aiconfig\byok\ai::speech(self::COMPONENT, $text,
            ['language' => $language, 'voice' => $name, 'format' => $format, 'rate' => 1.0]);
    }
}
