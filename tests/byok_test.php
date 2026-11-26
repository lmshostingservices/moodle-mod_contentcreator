<?php
// This file is part of Moodle - https://moodle.org/
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
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_contentcreator;

use mod_contentcreator\local\byok\documents;
use mod_contentcreator\local\byok\engine;
use mod_contentcreator\local\byok\media;

/**
 * Tests for writing cards, pictures, narration and example documents on the site's own AI.
 *
 * The ported routes (local\byok\engine, media and documents) were compared with the LMS Labs service source on tens of
 * thousands of randomised requests and AI answers, with identical results; these tests cover the wiring into the
 * plugin: the site's AI, background jobs, pictures kept in the activity and the answers the pages read.
 *
 * @package    mod_contentcreator
 * @copyright  2026 AI Grader <support@lmshostingservices.com>
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_contentcreator\byok
 * @covers     \mod_contentcreator\local\byok\engine
 * @covers     \mod_contentcreator\local\byok\media
 * @covers     \mod_contentcreator\local\byok\documents
 * @covers     \mod_contentcreator\task\byok_generate
 */
#[\PHPUnit\Framework\Attributes\CoversClass(byok::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(engine::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(media::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(documents::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(task\byok_generate::class)]
final class byok_test extends \advanced_testcase {
    /** @var array Requests the mocked providers received: [url, decoded body]. */
    protected $requests = [];
    /** @var array Text answers the mocked text provider gives, in order (null: the provider fails). */
    protected $answers = [];

    /**
     * Licence the site for Bring your own AI on a test key: text on Anthropic, pictures and voice on OpenAI, and no
     * LMS Labs credentials.
     */
    protected function setUp(): void {
        parent::setUp();
        if (!class_exists('\local_aiconfig\byok\ai')) {
            $this->markTestSkipped('AI Grader Central Config with Bring your own AI is not installed.');
        }
        $this->resetAfterTest();
        $pair = sodium_crypto_sign_keypair();
        set_config('testpublickey', base64_encode(sodium_crypto_sign_publickey($pair)), 'local_aiconfig');
        $payload = json_encode(['v' => 1, 'id' => 'lic_t', 'site' => \local_aiconfig\byok\licence::site_host(),
            'plan' => 'pro', 'byok' => true, 'products' => ['*'], 'sub' => 'sub_t', 'exp' => time() + DAYSECS]);
        $b64 = fn(string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        set_config('licencekey', $b64($payload) . '.' .
            $b64(sodium_crypto_sign_detached($payload, sodium_crypto_sign_secretkey($pair))), 'local_aiconfig');
        foreach (['text' => 'anthropic', 'image' => 'openai', 'voice' => 'openai'] as $service => $vendor) {
            set_config('src_' . $service, 'ownkey', 'local_aiconfig');
            set_config('vendor_' . $service, $vendor, 'local_aiconfig');
        }
        set_config('key_anthropic', 'sk-test', 'local_aiconfig');
        set_config('key_openai', 'sk-test', 'local_aiconfig');
        set_config('siteid', '', 'local_aiconfig');
        set_config('apikey', '', 'local_aiconfig');
        $this->requests = [];
        $this->answers = [];
        $GLOBALS['local_aiconfig_byok_mock'] = function ($url, $headers, $body, $vendor, $raw = false) {
            $this->requests[] = [$url, is_string($body) ? json_decode($body, true) : $body];
            if (strpos($url, '/images/') !== false) {
                return ['data' => [['b64_json' => base64_encode($this->png(1536, 1024))]]];
            }
            if (strpos($url, '/audio/speech') !== false) {
                return 'ID3-not-really-an-mp3';
            }
            $answer = array_shift($this->answers);
            if ($answer === null) {
                throw new \moodle_exception('byok_callfailed', 'local_aiconfig', '', (object) ['vendor' => $vendor,
                    'detail' => 'Overloaded']);
            }
            return ['content' => [['type' => 'text', 'text' => $answer]], 'stop_reason' => 'end_turn'];
        };
    }

    /**
     * Clean up the mock.
     */
    protected function tearDown(): void {
        unset($GLOBALS['local_aiconfig_byok_mock']);
        engine::$aicall = null;
        media::$image = null;
        media::$tts = null;
        media::$store = null;
        parent::tearDown();
    }

    /**
     * A plain PNG picture.
     *
     * @param int $width
     * @param int $height
     * @return string
     */
    protected function png(int $width, int $height): string {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, imagecolorallocate($image, 15, 108, 191));
        ob_start();
        imagepng($image);
        imagedestroy($image);
        return ob_get_clean();
    }

    /**
     * A Content Creator activity.
     *
     * @return \context_module
     */
    protected function activity(): \context_module {
        $course = $this->getDataGenerator()->create_course();
        $cm = $this->getDataGenerator()->create_module('contentcreator', ['course' => $course->id]);
        return \context_module::instance($cm->cmid);
    }

    /**
     * The service-checked case: one request, the AI's answer and what the service returns for it.
     *
     * @return array
     */
    protected function fixture(): array {
        return json_decode(file_get_contents(__DIR__ . '/fixtures/byok_cards.json'), true);
    }

    /**
     * The settings decide which work runs on the site's own AI.
     */
    public function test_state(): void {
        $this->assertSame(['text' => true, 'image' => true, 'voice' => true], byok::state());
        $this->assertTrue(byok::any());
        set_config('src_image', 'credits', 'local_aiconfig');
        set_config('src_voice', 'credits', 'local_aiconfig');
        $this->assertSame(['text' => true, 'image' => false, 'voice' => false], byok::state());
        set_config('licencekey', '', 'local_aiconfig');
        $this->assertSame(['text' => false, 'image' => false, 'voice' => false], byok::state());
        $this->assertFalse(byok::any());
    }

    /**
     * Cards written on the site's AI come back exactly as the service returns them for the same AI answer.
     */
    public function test_cards_match_service(): void {
        $case = $this->fixture();
        $this->answers = [$case['answer']];
        $answer = byok::prompt($case['request']);
        $this->assertTrue($answer['success']);
        $this->assertTrue($answer['ownai']);
        $this->assertSame($case['content_length'], strlen($answer['content']));
        $this->assertSame($case['content_sha1'], sha1($answer['content']));
        foreach ($case['meta'] as $name => $value) {
            $this->assertSame($value, $answer['meta'][$name], $name);
        }
        $this->assertCount(1, $this->requests);
        [$url, $sent] = $this->requests[0];
        $this->assertStringContainsString('anthropic.com', $url);
        $this->assertSame($case['system'], $sent['system']);
        $this->assertSame($case['user'], $sent['messages'][0]['content'][0]['text']);
    }

    /**
     * A provider failure reads as the service's failure plus what the site's AI said.
     */
    public function test_cards_failure(): void {
        $this->answers = [null, null, null, null, null, null];
        $answer = byok::prompt($this->fixture()['request']);
        $this->assertFalse($answer['success']);
        $this->assertStringStartsWith('AI generation failed', $answer['error']);
        $this->assertStringContainsString('Your AI said:', $answer['error']);
        $this->assertStringContainsString('Overloaded', $answer['error']);
    }

    /**
     * Background writing: started, polled, finished, and only visible to the activity that started it.
     */
    public function test_background_job(): void {
        $this->setAdminUser();
        $context = $this->activity();
        $other = $this->activity();
        $case = $this->fixture();

        $started = byok::start($case['request'], $context, 'key-1');
        $this->assertTrue($started['ok']);
        $this->assertTrue($started['new']);
        $this->assertFalse($started['idempotency']);
        $this->assertTrue(byok::is_job($started['jobId']));
        $this->assertSame(['ok' => true, 'status' => 'pending'], byok::poll($started['jobId'], $context));

        // The same submit again gets the same job; a different request with the same key is refused.
        $again = byok::start($case['request'], $context, 'key-1');
        $this->assertSame([true, $started['jobId'], true, false],
            [$again['ok'], $again['jobId'], $again['idempotency'], $again['new']]);
        $clash = byok::start(['userPrompt' => 'something else'] + $case['request'], $context, 'key-1');
        $this->assertFalse($clash['ok']);

        $this->assertSame(['ok' => false, 'error' => 'Job not found or expired'], byok::poll($started['jobId'], $other));
        $this->assertNull(byok::poll('job_123', $context));

        // Run through the background task, as on a web server that cannot answer first.
        $this->answers = [$case['answer']];
        $task = new task\byok_generate();
        $task->set_custom_data(['jobid' => $started['jobId'], 'payload' => $case['request']]);
        $task->execute();
        $done = byok::poll($started['jobId'], $context);
        $this->assertSame('done', $done['status']);
        $this->assertSame($case['content_sha1'], sha1($done['result']['content']));

        // A finished job is not run twice.
        byok::run_job(['jobid' => $started['jobId'], 'payload' => $case['request']]);
        $this->assertCount(1, $this->requests);
    }

    /**
     * A failed background job is polled as /api/jobs reports a failure.
     */
    public function test_background_job_failure(): void {
        $this->setAdminUser();
        $context = $this->activity();
        $started = byok::start($this->fixture()['request'], $context, '');
        $this->answers = [null, null, null, null, null, null];
        byok::run_job(['jobid' => $started['jobId'], 'payload' => $this->fixture()['request']]);
        $poll = byok::poll($started['jobId'], $context);
        $this->assertSame('error', $poll['status']);
        $this->assertSame('JOB_GENERATION_FAILED', $poll['errorCode']);
        $this->assertStringContainsString('Overloaded', $poll['error']);
        $this->assertFalse($poll['result']['success']);
    }

    /**
     * A slide picture: the brief from the site's text AI, the picture from its image AI, kept in the activity.
     */
    public function test_image_kept_in_activity(): void {
        $this->setAdminUser();
        $context = $this->activity();
        $brief = 'A food handler in a commercial kitchen checks a probe thermometer reading at a cool room door.';
        $this->answers = [$brief];
        $answer = byok::image(['slideTitle' => 'Temperature control', 'industry' => 'Hospitality',
            'aspectRatio' => '4:3'], $context);
        $this->assertTrue($answer['success']);
        $this->assertSame(0, $answer['creditsUsed']);
        $this->assertSame($brief, $answer['images'][0]['prompt']);
        $this->assertSame('1536x1024', $this->requests[1][1]['size']);
        $this->assertSame($brief, $this->requests[1][1]['prompt']);

        $files = get_file_storage()->get_area_files($context->id, 'mod_contentcreator', byok::FILEAREA, false,
            'filename', false);
        $this->assertCount(1, $files);
        $file = reset($files);
        $this->assertTrue(byok::is_picture($file->get_filename()));
        $this->assertStringEndsWith('/mod_contentcreator/voiceovers/' . $context->instanceid . '/' .
            $file->get_filename(), $answer['images'][0]['url']);
        // Cut to 4:3 from the centre, as the service does.
        $size = getimagesizefromstring($file->get_content());
        $this->assertSame([1365, 1024, IMAGETYPE_JPEG], [$size[0], $size[1], $size[2]]);
        $this->assertFalse(byok::is_picture('narration.ogg'));
    }

    /**
     * With writing on LMS Labs, the picture brief is the service's own fallback brief.
     */
    public function test_image_brief_fallback(): void {
        set_config('src_text', 'credits', 'local_aiconfig');
        $this->setAdminUser();
        $answer = byok::image(['slideTitle' => 'Manual handling', 'aspectRatio' => '1:1'], $this->activity());
        $this->assertTrue($answer['success']);
        $this->assertStringStartsWith('Professional documentary photograph', $answer['images'][0]['prompt']);
        $this->assertStringContainsString('Australia vocational workplace scene showing: Manual handling',
            $answer['images'][0]['prompt']);
        $this->assertCount(1, $this->requests);
        $this->assertSame('1024x1024', $this->requests[0][1]['size']);
    }

    /**
     * Three pictures to choose from, all kept in the activity.
     */
    public function test_slide_pictures(): void {
        $this->setAdminUser();
        $context = $this->activity();
        $answer = byok::slide_image((object) ['slideTitle' => 'Lifting technique', 'context' => (object) [
            'industry' => 'Warehousing']], $context);
        $this->assertTrue($answer['success']);
        $this->assertCount(3, $answer['imageUrls']);
        $this->assertSame($answer['imageUrls'][0], $answer['imageUrl']);
        $this->assertSame('unlimited', $answer['creditsRemaining']);
        $this->assertCount(3, get_file_storage()->get_area_files($context->id, 'mod_contentcreator', byok::FILEAREA,
            false, 'filename', false));

        // A request the service's checker refuses.
        $bad = byok::slide_image((object) ['slideTitle' => 5], $context);
        $this->assertFalse($bad['success']);
    }

    /**
     * A teacher's own picture is made ready for a slide and kept here.
     */
    public function test_upload(): void {
        $this->setAdminUser();
        $context = $this->activity();
        $path = make_request_directory() . '/photo.png';
        file_put_contents($path, $this->png(1600, 900));
        $answer = byok::upload($path, 'photo.png', $context);
        $this->assertTrue($answer['success']);
        $this->assertSame('image/jpeg', $answer['mimeType']);
        $this->assertSame('photo.png', $answer['fileName']);
        $files = get_file_storage()->get_area_files($context->id, 'mod_contentcreator', byok::FILEAREA, false,
            'filename', false);
        $size = getimagesizefromstring(reset($files)->get_content());
        $this->assertSame([1200, 675], [$size[0], $size[1]]);
    }

    /**
     * Narration on the site's own voice, with the closest OpenAI voice to the chosen one.
     */
    public function test_narration(): void {
        $answer = byok::tts(['text' => 'Check the probe thermometer before every shift.',
            'voiceId' => 'en-AU-Chirp3-HD-Aoede', 'languageCode' => 'en-AU']);
        $this->assertTrue($answer['success']);
        $this->assertSame(base64_encode('ID3-not-really-an-mp3'), $answer['audioContent']);
        $this->assertSame('audio/ogg', $answer['audioType']);
        // Not an Ogg clip, so the length is estimated from the words, as on the service.
        $this->assertSame(3, $answer['durationSeconds']);
        $this->assertSame('nova', $this->requests[0][1]['voice']);
        $this->assertSame('opus', $this->requests[0][1]['response_format']);
        $this->assertSame(1.0, $this->requests[0][1]['speed']);
    }

    /**
     * Example workplace documents, one and several, cleaned as the service cleans them.
     */
    public function test_documents(): void {
        $this->answers = ["```html\n<html><body><h1>Safe work method statement</h1></body></html>\n```"];
        $answer = byok::example(['docId' => 'swms', 'docName' => 'SWMS', 'industry' => 'Construction']);
        $this->assertSame(['success' => true, 'content' => '<h1>Safe work method statement</h1>', 'docId' => 'swms',
            'docName' => 'SWMS', 'domain' => 'Safety & Risk', 'renderProfile' => 'stepsTable', 'ownai' => true], $answer);
        $this->assertStringContainsString('Construction', $this->requests[0][1]['messages'][0]['content'][0]['text']);

        // One document fails: the others still come back.
        $this->answers = ['<p>Risk assessment</p>', null, '<p>Incident report</p>'];
        $answer = byok::batch(['documents' => [['docId' => 'risk_assessment', 'docName' => 'Risk assessment'],
            ['docId' => 'jsa', 'docName' => 'JSA'], ['docId' => 'incident_report', 'docName' => 'Incident report']]]);
        $this->assertTrue($answer['success']);
        $this->assertSame(['risk_assessment', 'incident_report'], array_keys($answer['documentExamples']));
    }
}
