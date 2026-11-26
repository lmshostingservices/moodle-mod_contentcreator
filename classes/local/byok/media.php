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
 * Content Creator narration and slide pictures, ported from the LMS Labs service for Bring your own AI.
 *
 * Ports of the service's /tts, /generate-image, /generate-slide-image and /upload-slide-image routes for
 * /api/moodle/content-creator, with the service's own prompts and checks. Voice goes to {@see self::$tts}, pictures to
 * {@see self::$image} and the picture brief to {@see engine::$aicall}; finished pictures are kept by
 * {@see self::$store}, which the plugin points at the activity's own files. The routes were compared with the service's
 * code on generated requests and AI replies.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class media extends engine {
    /** @var callable|null fn(string $prompt, string $size): string, the picture's bytes. */
    public static $image = null;

    /** @var callable|null fn(string $text, string $voiceid, string $language, string $format): string, audio bytes. */
    public static $tts = null;

    /** @var callable|null fn(int $ms): void, how retries wait; null sleeps. */
    public static $sleep = null;

    /** @var callable|null fn(string $jpeg): string, keeps a finished picture and gives its URL. */
    public static $store = null;

    /** @var int The most UTF-8 bytes the service sends the voice in one request. */
    const TTS_MAX_BYTES = 4800;

    /** @var string[] The service's country names for slide pictures. */
    const COUNTRIES = ['AU' => 'Australia', 'UK' => 'United Kingdom', 'GB' => 'United Kingdom', 'US' => 'United States',
        'NZ' => 'New Zealand', 'CA' => 'Canada'];

    /** @var string */
    const IMAGE_UNIVERSITY = 'You write image prompts for an AI image generator. Your job is to turn a university learning topic ' .
        "into a vivid, specific photograph description.\n\nINPUT:\n- Sub-topic: %%slideTitle%%\n%%slideDescription%%\n" .
        "%%requirements%%\n%%country%%\n%%state%%\n%%industry%%\n%%subIndustry%%\n%%workplace%%\n%%jobRole%%\n" .
        "%%unitCode%%\n%%unitTitle%%\n%%scenarioContext%%\n\n" .
        "Write ONE image prompt (under 200 words) following these rules:\n\n" .
        '1. Describe a SPECIFIC academic or professional scene showing the actual concept, research activity, ' .
        "or practice from the sub-topic - NOT generic stock photos of students at desks\n" .
        '2. Name the EXACT setting authentic to the discipline (e.g. "modern university biochemistry ' .
        "laboratory with fume hoods and spectrophotometers\" not just \"science lab\")\n" .
        '3. Show a person ACTIVELY engaged in the discipline-specific task - conducting research, analysing ' .
        "data, presenting findings, collaborating, practising a professional skill - with natural body language\n" .
        '4. Include discipline-appropriate equipment, resources, and environmental details (e.g. "dual-monitor ' .
        'workstation showing statistical analysis software, peer-reviewed journal printouts, whiteboard with ' .
        "research framework diagram\")\n" .
        '5. Settings should reflect real academic environments: lecture halls, research labs, clinical ' .
        "settings, professional offices, fieldwork sites, libraries, seminar rooms\n" .
        '6. Specify natural indoor/outdoor lighting appropriate to the setting, professional documentary-style ' .
        "photography, ultra realistic, high detail\n" .
        '7. People should be diverse (mixed ages 20s-40s, mixed ethnicities and body types), candid natural ' .
        "poses, never staged or stock-photo style\n8. No dramatic cinematic effects, no text overlays, no watermarks\n" .
        '9. Do NOT include workplace safety elements (PPE, hard hats, high-vis, barricades, exclusion zones) ' .
        "unless the discipline specifically requires them (e.g. chemistry lab coats, medical gloves)\n\n" .
        'Output ONLY the prompt text. No preamble, no explanation, no quotes.';

    /** @var string[] What each line of IMAGE_UNIVERSITY says before its value. */
    const IMAGE_UNIVERSITY_LINES = [
        'slideDescription' => '- Description: ',
        'requirements' => '- Key learning outcomes: ',
        'country' => '- Country: ',
        'state' => '- State/Region: ',
        'industry' => '- Discipline: ',
        'subIndustry' => '- Specialisation: ',
        'workplace' => '- Setting: ',
        'jobRole' => '- Learner role: ',
        'unitCode' => '- Unit code: ',
        'unitTitle' => '- Unit title: ',
        'scenarioContext' => '- Scenario context: ',
    ];

    /** @var string */
    const IMAGE_WORKPLACE = 'You write image prompts for an AI image generator. Your job is to turn a workplace training slide ' .
        "into a vivid, specific photograph description.\n\nINPUT:\n- Sub-topic: %%slideTitle%%\n%%slideDescription%%\n" .
        "%%requirements%%\n%%country%%\n%%state%%\n%%industry%%\n%%subIndustry%%\n%%workplace%%\n%%jobRole%%\n" .
        "%%unitCode%%\n%%unitTitle%%\n%%scenarioContext%%\n\n" .
        "Write ONE image prompt (under 200 words) following these rules:\n\n" .
        '1. Describe a SPECIFIC real workplace scene showing the actual task, hazard, or procedure from the ' .
        "sub-topic - NOT generic people reading documents or looking at plans\n" .
        '2. Name the EXACT workplace setting authentic to the country and industry (e.g. "Australian civil ' .
        "construction site with scaffolding around a concrete bridge pier\" not just \"construction site\")\n" .
        '3. Show a worker ACTIVELY performing the specific task - inspecting, operating, measuring, ' .
        "installing, demonstrating - with their hands engaged and body positioned naturally\n" .
        '4. List EXACT PPE items correct for this industry and task (e.g. "white hard hat, high-visibility ' .
        "long-sleeve shirt, steel-cap boots, safety glasses, fall-arrest harness clipped to anchor point\")\n" .
        '5. Include industry-specific equipment, signage, control measures, and environmental details visible ' .
        "in the scene (e.g. \"green scaffold inspection tag, exclusion zone barricades, sediment control fencing\")\n" .
        '6. Specify natural outdoor/indoor lighting appropriate to the setting, clear weather, ' .
        "documentary-style photography, ultra realistic, high detail\n" .
        '7. Workers should be diverse (mixed ages 20s-50s, mixed ethnicities and body types), candid natural ' .
        "poses, never staged or stock-photo style\n8. No dramatic cinematic effects, no text overlays, no watermarks\n\n" .
        'Output ONLY the prompt text. No preamble, no explanation, no quotes.';

    /** @var string[] What each line of IMAGE_WORKPLACE says before its value. */
    const IMAGE_WORKPLACE_LINES = [
        'slideDescription' => '- Description: ',
        'requirements' => '- Key requirements: ',
        'country' => '- Country: ',
        'state' => '- State/Region: ',
        'industry' => '- Industry: ',
        'subIndustry' => '- Sub-industry: ',
        'workplace' => '- Workplace: ',
        'jobRole' => '- Job role: ',
        'unitCode' => '- Unit of competency: ',
        'unitTitle' => '- Unit title: ',
        'scenarioContext' => '- Scenario context: ',
    ];

    /**
     * POST /api/moodle/content-creator/tts: one narration clip.
     *
     * @param \stdClass $body The request.
     * @return array [status, body]
     */
    public static function tts(\stdClass $body): array {
        $v = self::fields($body, [
            'siteId' => ['str', null], 'apiKey' => ['str', null], 'text' => ['str', null, 1, 50000],
            'languageCode' => ['str', 'en-AU'], 'voiceId' => ['str', 'en-AU-Chirp3-HD-Kore'],
            'creditsToUse' => ['num', 5, 1], 'subtopicKey' => ['str', ''], 'sectionId' => ['str', ''],
        ]);
        if ($v === null) {
            return [400, ['success' => false, 'error' => 'Invalid request parameters']];
        }
        $ws = '[' . self::WS . ']';
        $text = preg_replace(['/-{3,}/u', '/\*{3,}/u', '/#{1,6}' . $ws . '*/u'], '', $v['text']);
        $text = self::trim(preg_replace('/' . $ws . '{2,}/u', ' ', $text));
        try {
            [$audio, $seconds, $type] = self::voiceover($text, $v['voiceId'], $v['languageCode']);
        } catch (\Throwable $e) {
            $code = $e->getCode();
            $message = $e->getMessage();
            $quota = $code === 429 || $code === 8 ||
                preg_match('/quota|rate.limit|resource.exhausted|too.many.requests/i', $message);
            $auth = $code === 403 || $code === 7 || $code === 16 || preg_match('/permission|forbidden|unauthenticated/i', $message);
            $error = $quota ? 'Voice generation temporarily unavailable due to rate limits. Please try again in a minute.'
                : ($auth ? 'Voice generation configuration error. Please contact your administrator.'
                : ($message !== '' ? $message : 'TTS generation failed'));
            return [$quota ? 429 : 500, ['success' => false, 'error' => $error,
                'errorType' => $quota ? 'quota' : ($auth ? 'auth' : 'unknown')]];
        }
        return [200, ['success' => true, 'audioContent' => base64_encode($audio), 'audioType' => $type,
            'durationSeconds' => self::number($seconds), 'credits' => -1]];
    }

    /**
     * The service's generateVoiceover(): one Ogg Opus clip, or MP3 pieces joined when the text is long.
     *
     * @param string $text
     * @param string $voiceid
     * @param string $language
     * @return array [audio bytes, seconds, mime type]
     */
    public static function voiceover(string $text, string $voiceid, string $language): array {
        $chunks = self::chunks($text, self::TTS_MAX_BYTES);
        $words = function () use ($text): int {
            return (int) max(2, ceil((count(preg_split('/[' . self::WS . ']+/u', $text)) / 150) * 60));
        };
        if (count($chunks) === 1) {
            $audio = self::synthesise($chunks[0], $voiceid, $language, 'ogg');
            try {
                $seconds = self::ogg_seconds($audio);
            } catch (\Throwable $e) {
                $seconds = $words();
            }
            return [$audio, $seconds, 'audio/ogg'];
        }
        $audio = '';
        foreach ($chunks as $chunk) {
            $audio .= self::synthesise($chunk, $voiceid, $language, 'mp3');
        }
        return [$audio, $words(), 'audio/mpeg'];
    }

    /**
     * One request to the voice, tried up to four times as the service does.
     *
     * @param string $text
     * @param string $voiceid
     * @param string $language
     * @param string $format ogg or mp3.
     * @return string
     */
    protected static function synthesise(string $text, string $voiceid, string $language, string $format): string {
        $wait = 1000;
        for ($attempt = 1;; $attempt++) {
            try {
                $audio = (self::$tts)($text, $voiceid, $language, $format);
                if ($audio === '') {
                    throw new \RuntimeException('No audio content in TTS response');
                }
                return $audio;
            } catch (\Throwable $e) {
                if ($attempt >= 4) {
                    throw $e;
                }
                $sleep = self::$sleep ?? function (int $ms): void {
                    usleep($ms * 1000);
                };
                $sleep(min(5000, $wait));
                $wait *= 2;
            }
        }
    }

    /**
     * The service's splitTextIntoChunks(): sentences packed into pieces of at most $max UTF-8 bytes.
     *
     * @param string $text
     * @param int $max
     * @return string[]
     */
    public static function chunks(string $text, int $max): array {
        if (strlen($text) <= $max) {
            return [$text];
        }
        $chunks = [];
        $current = '';
        foreach (preg_split('/(?<=[.!?])[' . self::WS . ']+/u', $text) as $sentence) {
            $test = $current . ($current !== '' ? ' ' : '') . $sentence;
            if (strlen($test) <= $max) {
                $current = $test;
                continue;
            }
            if ($current !== '') {
                $chunks[] = $current;
            }
            if (strlen($sentence) <= $max) {
                $current = $sentence;
                continue;
            }
            $remaining = $sentence;
            while (strlen($remaining) > $max) {
                $cut = (int) floor($max / 2);
                $sub = self::slice($remaining, 0, $cut);
                $space = strrpos($sub, ' ');
                if ($space !== false && self::len(substr($sub, 0, $space)) > self::len($sub) * 0.3) {
                    $cut = self::len(substr($sub, 0, $space));
                }
                $chunks[] = self::trim(self::slice($remaining, 0, $cut));
                $remaining = self::trim(self::slice($remaining, $cut));
            }
            $current = $remaining;
        }
        if (self::trim($current) !== '') {
            $chunks[] = self::trim($current);
        }
        return $chunks;
    }

    /**
     * The service's parseOggOpusDuration(): seconds from the last granule position.
     *
     * @param string $buffer Ogg Opus bytes.
     * @return float
     */
    public static function ogg_seconds(string $buffer): float {
        $offset = 0;
        $last = 0.0;
        $preskip = 0;
        $n = strlen($buffer);
        while ($offset + 27 <= $n) {
            if (substr($buffer, $offset, 4) !== 'OggS') {
                break;
            }
            $parts = unpack('Vlo/Vhi', $buffer, $offset + 6);
            $granule = $parts['hi'] * 4294967296.0 + $parts['lo'];
            $segments = ord($buffer[$offset + 26]);
            if ($offset + 27 + $segments > $n) {
                break;
            }
            $length = 0;
            for ($i = 0; $i < $segments; $i++) {
                $length += ord($buffer[$offset + 27 + $i]);
            }
            $start = $offset + 27 + $segments;
            if ($start + 8 <= $n && substr($buffer, $start, 8) === 'OpusHead' && $start + 12 <= $n) {
                $preskip = unpack('v', $buffer, $start + 10)[1];
            }
            if ($granule > 0) {
                $last = $granule;
            }
            $offset = $start + $length;
        }
        if ($last <= 0) {
            throw new \RuntimeException('Could not determine OGG duration');
        }
        return max(0.1, ($last - $preskip) / 48000);
    }

    /**
     * POST /api/moodle/content-creator/generate-image: a picture brief written by the AI, then one picture.
     *
     * @param \stdClass $body The request.
     * @return array [status, body]
     */
    public static function image(\stdClass $body): array {
        $text = ['str', ''];
        $v = self::fields($body, [
            'siteId' => ['str', null], 'apiKey' => ['str', null], 'slideTitle' => ['str', null, 1],
            'slideDescription' => $text, 'topicTitle' => $text, 'unitCode' => $text, 'unitTitle' => $text,
            'industry' => $text, 'subIndustry' => $text, 'workplace' => $text, 'jobRole' => $text,
            'country' => ['str', 'Australia'], 'state' => $text, 'requirements' => $text, 'route' => ['str', 'vet'],
            'scenarioContext' => $text, 'aspectRatio' => ['enum', '16:9', ['16:9', '4:3', '1:1']],
            'subtopicKey' => $text, 'sectionId' => $text, 'creditsToUse' => ['num', false, 1],
            'isRegeneration' => ['bool', false],
        ]);
        if ($v === null) {
            return [400, ['success' => false, 'error' => 'Invalid request parameters']];
        }
        try {
            $university = $v['route'] === 'university';
            $replace = ['%%slideTitle%%' => $v['slideTitle']];
            foreach ($university ? self::IMAGE_UNIVERSITY_LINES : self::IMAGE_WORKPLACE_LINES as $name => $label) {
                $replace["%%{$name}%%"] = $v[$name] !== '' ? $label . $v[$name] : '';
            }
            $brief = strtr($university ? self::IMAGE_UNIVERSITY : self::IMAGE_WORKPLACE, $replace);
            $prompt = self::trim((self::$aicall)('', $brief, 2000, false, 1.0, null));
            if (self::len($prompt) < 50) {
                $subject = implode(', ', array_filter([$v['slideTitle'], $v['slideDescription'], $v['topicTitle'],
                    $v['unitTitle']], 'strlen'));
                $industry = implode(' ', array_filter([$v['industry'], $v['subIndustry'], $v['workplace']], 'strlen'));
                $prompt = 'Professional documentary photograph, Canon EOS R5, 50mm lens, natural daylight, sharp focus. ' .
                    ($v['country'] !== '' ? $v['country'] : 'Australian') . ' ' . ($industry !== '' ? $industry : 'vocational') .
                    " workplace scene showing: {$subject}. Real photograph, photorealistic, ultra-detailed, no text, no " .
                    'cartoons, no illustrations.';
            }
            $jpeg = self::picture($prompt, $v['aspectRatio']);
            try {
                $url = (self::$store)($jpeg);
            } catch (\Throwable $e) {
                return [500, ['success' => false, 'error' => 'Image generation failed - could not persist image']];
            }
            return [200, ['success' => true, 'images' => [['url' => $url, 'prompt' => $prompt]], 'creditsUsed' => 0]];
        } catch (\Throwable $e) {
            return [500, ['success' => false, 'error' => self::humanise($e->getMessage())]];
        }
    }

    /**
     * POST /api/moodle/content-creator/generate-slide-image: three pictures to choose from for one slide.
     *
     * @param \stdClass $body The request.
     * @return array [status, body]
     */
    public static function slide_image(\stdClass $body): array {
        $optional = ['str', false];
        $v = self::fields($body, [
            'siteId' => ['str', null], 'apiKey' => ['str', null], 'slideTitle' => ['str', null],
            'slideDescription' => ['str', ''], 'requirements' => ['strs', []], 'positiveList' => ['strs', []],
            'negativeList' => ['strs', []],
            'context' => ['object', new \stdClass(), [
                'topic' => $optional, 'unitCode' => $optional, 'unitTitle' => $optional, 'industry' => $optional,
                'industrySector' => $optional, 'jobTitle' => $optional, 'country' => ['str', 'AU'], 'route' => ['str', 'vet'],
            ]],
            'aspectRatio' => ['enum', '16:9', ['16:9', '4:3', '1:1']], 'customPrompt' => ['str', ''],
            'isRegeneration' => ['bool', false], 'subtopicKey' => ['str', ''], 'sectionId' => ['str', ''],
            'creditsToUse' => ['num', false, 1],
        ]);
        if ($v === null) {
            // The service's schema check throws here and the route answers with the checker's own report.
            return [500, ['success' => false, 'error' => 'Invalid request parameters']];
        }
        try {
            $prompt = self::slide_prompt($v);
            $urls = [];
            for ($i = 0; $i < 3; $i++) {
                $urls[] = self::picture($prompt, $v['aspectRatio'], true);
            }
            $urls = array_values(array_filter($urls, 'strlen'));
            if (!$urls) {
                throw new \RuntimeException('Failed to generate images');
            }
            foreach ($urls as $i => $jpeg) {
                try {
                    $urls[$i] = (self::$store)($jpeg);
                } catch (\Throwable $e) {
                    $urls[$i] = 'data:image/jpeg;base64,' . base64_encode($jpeg);
                }
            }
            return [200, ['success' => true, 'imageUrls' => $urls, 'imageUrl' => $urls[0], 'prompt' => $prompt,
                'creditsUsed' => 0, 'creditsRemaining' => 'unlimited']];
        } catch (\Throwable $e) {
            return [500, ['success' => false, 'error' => self::humanise($e->getMessage())]];
        }
    }

    /**
     * POST /api/moodle/content-creator/upload-slide-image: a teacher's own picture, made ready for a slide.
     *
     * @param string $bytes The uploaded picture.
     * @param string $name Its file name.
     * @return array [status, body]
     */
    public static function upload(string $bytes, string $name): array {
        $original = strlen($bytes);
        $jpeg = $bytes;
        $src = @imagecreatefromstring($bytes);
        if ($src !== false) {
            $w = imagesx($src);
            $h = imagesy($src);
            if ($w > 1200) {
                $dst = imagecreatetruecolor(1200, max(1, (int) round($h * 1200 / $w)));
                imagecopyresampled($dst, $src, 0, 0, 0, 0, 1200, imagesy($dst), $w, $h);
                imagedestroy($src);
                $src = $dst;
            } else if (!imageistruecolor($src)) {
                imagepalettetotruecolor($src);
            }
            ob_start();
            imagejpeg($src, null, 85);
            $jpeg = ob_get_clean();
            imagedestroy($src);
        }
        try {
            $url = (self::$store)($jpeg);
        } catch (\Throwable $e) {
            return [500, ['success' => false, 'error' => 'Image upload failed - could not store image']];
        }
        return [200, ['success' => true, 'imageUrl' => $url, 'fileName' => $name, 'fileSize' => strlen($jpeg),
            'originalSize' => $original, 'mimeType' => 'image/jpeg', 'creditsUsed' => 0]];
    }

    /**
     * One picture from the image AI, shaped and compressed as the service does (generateImageWithOpenAI()).
     *
     * @param string $prompt
     * @param string $aspect 16:9, 4:3 or 1:1.
     * @param bool $quiet True to give '' rather than fail when the AI sends no picture back.
     * @return string JPEG bytes.
     */
    protected static function picture(string $prompt, string $aspect, bool $quiet = false): string {
        if (self::trim($prompt) === '') {
            return '';
        }
        $raw = (self::$image)($prompt, $aspect === '1:1' ? '1024x1024' : '1536x1024');
        if ($raw === '') {
            if ($quiet) {
                return '';
            }
            throw new \RuntimeException('Image provider returned no image');
        }
        return self::optimise($raw, $aspect === '4:3');
    }

    /**
     * The service's optimizeImageBuffer(): optionally cut to 4:3 from the centre, at most 2400 pixels wide, JPEG 92.
     *
     * @param string $raw Image bytes.
     * @param bool $fourthree Cut to 4:3 first.
     * @return string JPEG bytes.
     */
    public static function optimise(string $raw, bool $fourthree = false): string {
        $src = @imagecreatefromstring($raw);
        if ($src === false) {
            throw new \RuntimeException('Input buffer contains unsupported image format');
        }
        $w = imagesx($src);
        $h = imagesy($src);
        [$x, $y, $cw, $ch] = [0, 0, $w, $h];
        if ($fourthree && $w / $h > 4 / 3) {
            $cw = max(1, (int) round($h * 4 / 3));
            $x = max(0, (int) floor(($w - $cw) / 2));
        } else if ($fourthree && $w / $h < 4 / 3) {
            $ch = max(1, (int) round($w * 3 / 4));
            $y = max(0, (int) floor(($h - $ch) / 2));
        }
        $tw = min($cw, 2400);
        $th = $tw === $cw ? $ch : max(1, (int) round($ch * 2400 / $cw));
        $dst = imagecreatetruecolor($tw, $th);
        imagecopyresampled($dst, $src, 0, 0, $x, $y, $tw, $th, $cw, $ch);
        imagedestroy($src);
        ob_start();
        imagejpeg($dst, null, 92);
        $out = ob_get_clean();
        imagedestroy($dst);
        return $out;
    }

    /**
     * The service's humanizeImageError(): a readable message from a picture AI's error.
     *
     * @param string $raw The error's message.
     * @return string
     */
    public static function humanise(string $raw): string {
        // err.message || String(err): an error without a message reads "Error".
        $raw = $raw !== '' ? $raw : 'Error';
        $busy = 'Image generation is busy right now. Please wait 30 seconds and try again.';
        $out = 'Image generation is temporarily unavailable. Please try again in a few minutes.';
        if (str_starts_with($raw, '{') || str_starts_with($raw, '[')) {
            $parsed = self::parse($raw);
            $inner = $parsed === self::BAD ? null : self::prop(self::prop($parsed, 'error'), 'message');
            if (!self::truthy($inner) && $parsed !== self::BAD) {
                $inner = self::prop($parsed, 'message');
            }
            if (is_string($inner) && $inner !== '') {
                if (str_contains($inner, 'prepayment credits are depleted') || str_contains($inner, 'RESOURCE_EXHAUSTED')) {
                    return $out;
                }
                if (str_contains($inner, '429') || str_contains($inner, 'rate') || str_contains($inner, 'quota')) {
                    return $busy;
                }
                return self::slice($inner, 0, 200);
            }
            if (is_array($inner)) {
                // Array.prototype.includes looks for an equal item; .substring then throws and the raw text is used.
                if (in_array('prepayment credits are depleted', $inner, true) || in_array('RESOURCE_EXHAUSTED', $inner, true)) {
                    return $out;
                }
                if (in_array('429', $inner, true) || in_array('rate', $inner, true) || in_array('quota', $inner, true)) {
                    return $busy;
                }
            }
        }
        if (str_contains($raw, 'prepayment credits') || str_contains($raw, 'RESOURCE_EXHAUSTED')) {
            return $out;
        }
        if (str_contains($raw, 'rate limit') || str_contains($raw, '429')) {
            return $busy;
        }
        $raw = self::slice($raw, 0, 300);
        return $raw !== '' ? $raw : 'Image generation failed';
    }

    /**
     * The service's buildImagePrompt(): the slide picture brief.
     *
     * @param array $v The checked request.
     * @return string
     */
    protected static function slide_prompt(array $v): string {
        $c = [];
        foreach (get_object_vars($v['context']) as $name => $value) {
            $c[$name] = $value === null ? '' : $value;
        }
        $route = $c['route'];
        $country = self::lookup(self::COUNTRIES, $c['country'] !== '' ? $c['country'] : 'AU');
        $countryname = $country ?? 'International';
        $industry = $c['industry'] . ($c['industrySector'] !== '' ? ' - ' . $c['industrySector'] : '');
        $slidetitle = $v['slideTitle'];
        $slidedescription = $v['slideDescription'];
        $requirements = $v['requirements'];
        $positive = $v['positiveList'];
        $customprompt = $v['customPrompt'];
        $parts = [];
        if ($route === 'university') {
            $parts[] = 'Create a high-quality, photorealistic academic image suitable for university and ' .
                'higher education course content.';
            $parts[] = 'The image must visually represent the learning topic described, matching the ' .
                'slide content and intended learning outcome, not generic stock photos of students at desks.';
            $parts[] = 'Country/Region: ' . $countryname . '.';
            if ($c['unitCode'] !== '' && $c['unitTitle'] !== '') {
                $parts[] = 'Course/Unit: ' . $c['unitCode'] . ' - ' . $c['unitTitle'] . '.';
            } else if ($c['topic'] !== '') {
                $parts[] = 'Topic: ' . $c['topic'] . '.';
            }
            if ($c['industry'] !== '') {
                $parts[] = 'Discipline/Subject Area: ' . $industry . '.';
            }
            $parts[] = 'Specific Learning Activity: ' . $slidetitle . '.';
            if (self::len($slidedescription) > 20) {
                $descsnippet = self::slice($slidedescription, 0, 200);
                $parts[] = 'Context: ' . $descsnippet . '.';
            }
            $parts[] = 'Show a SPECIFIC academic or professional scene depicting the actual concept, ' .
                'research activity, or disciplinary practice from the topic.';
            $parts[] = 'Use an EXACT setting authentic to the discipline: research laboratories, lecture ' .
                'halls, clinical simulation rooms, professional offices, fieldwork sites, ' .
                'libraries, seminar rooms, studio spaces, or industry-relevant professional environments.';
            $parts[] = 'Show a person ACTIVELY engaged in the discipline-specific task: conducting ' .
                'research, analysing data, presenting findings, collaborating with peers, ' .
                'practising a professional skill, using specialist equipment, or facilitating discussion.';
            $parts[] = 'Include discipline-appropriate equipment, resources, and environmental details ' .
                'authentic to the subject area.';
            if ($c['jobTitle'] !== '') {
                $parts[] = 'Show a ' . $c['jobTitle'] . ' engaged in the learning activity.';
            }
            if ($requirements) {
                $keyreqs = implode(', ', array_slice($requirements, 0, 4));
                $parts[] = 'Key learning elements to show: ' . $keyreqs . '.';
            }
            $parts[] = 'Include realistic diversity: mix of genders, ages (20s-40s), ethnicities, and ' .
                'body types. Candid natural poses, never staged or stock-photo style.';
            $parts[] = 'All people must display professional academic behaviour: focused attention, ' .
                'intellectual engagement, collaborative interaction where appropriate.';
            $parts[] = 'Do NOT include workplace safety elements (PPE, hard hats, high-vis, safety boots, ' .
                'barricades, exclusion zones) UNLESS the discipline specifically requires them ' .
                '(e.g. chemistry lab coats and goggles, medical gloves, engineering safety glasses).';
            $parts[] = 'Ultra-realistic, professional documentary-style photography.';
            $parts[] = 'Natural indoor or outdoor lighting appropriate to the academic setting.';
            $parts[] = 'High resolution, sharp focus.';
            $parts[] = 'Neutral, clean colour grading suitable for digital learning slides.';
            $parts[] = 'Camera perspective should feel like a peer or educator observing engaged learning.';
            $parts[] = 'No cartoon, illustration, or exaggerated styles. No implausible scenarios.';
        } else if ($route === 'pd') {
            $parts[] = 'Create a high-quality, photorealistic professional development image suitable for ' .
                'workplace learning, leadership, communication, and interpersonal skills content.';
            $parts[] = 'The image must visually represent the specific professional skill or interaction ' .
                'described, matching the slide content and intended learning outcome, not generic ' .
                'stock imagery.';
            $parts[] = 'Country/Region: ' . $countryname . '.';
            if ($c['unitCode'] !== '' && $c['unitTitle'] !== '') {
                $parts[] = 'Course/Unit: ' . $c['unitCode'] . ' - ' . $c['unitTitle'] . '.';
            } else if ($c['topic'] !== '') {
                $parts[] = 'Topic: ' . $c['topic'] . '.';
            }
            if ($c['industry'] !== '') {
                $parts[] = 'Professional Context: ' . $industry . '.';
            }
            $parts[] = 'Specific Professional Development Activity: ' . $slidetitle . '.';
            if (self::len($slidedescription) > 20) {
                $descsnippet = self::slice($slidedescription, 0, 200);
                $parts[] = 'Context: ' . $descsnippet . '.';
            }
            $parts[] = 'Use a realistic professional setting appropriate to the activity, such as an ' .
                'office, meeting room, consultation space, training room, reception area, or other ' .
                'subject-appropriate workplace environment.';
            $parts[] = 'Show the actual professional interaction or skill in progress, such as giving ' .
                'feedback, coaching, collaborating, presenting, resolving a difficult ' .
                'conversation, planning, consulting, or making a decision.';
            $parts[] = 'People should wear business-appropriate or role-appropriate professional clothing ' .
                'with no real company logos.';
            if ($c['jobTitle'] !== '') {
                $parts[] = 'Show a ' . $c['jobTitle'] . ' engaged in the professional development activity.';
            }
            if ($requirements) {
                $keyreqs = implode(', ', array_slice($requirements, 0, 4));
                $parts[] = 'Key learning elements to show: ' . $keyreqs . '.';
            }
            if ($positive) {
                $keydos = implode(', ', array_slice($positive, 0, 3));
                $parts[] = 'Demonstrate effective professional practice: ' . $keydos . '.';
            }
            $parts[] = 'Include realistic diversity: mix of genders, ages, ethnicities, cultural ' .
                'backgrounds, and body types. Use candid natural poses, never staged or stock-photo style.';
            $parts[] = 'Facial expressions and body language should communicate professionalism, ' .
                'attentive listening, confidence, empathy, calmness, or constructive engagement as ' .
                'appropriate to the activity.';
            $parts[] = 'Do NOT include PPE, hard hats, high-visibility clothing, safety boots, ' .
                'barricades, or industrial safety equipment unless the specific subject genuinely ' .
                'requires them.';
            $parts[] = 'Ultra-realistic, professional documentary-style photography.';
            $parts[] = 'Natural lighting appropriate to the professional setting.';
            $parts[] = 'High resolution, sharp focus.';
            $parts[] = 'Neutral, clean colour grading suitable for digital learning slides.';
            $parts[] = 'Camera perspective should feel like an unobtrusive observer of an authentic ' .
                'professional interaction.';
            $parts[] = 'No cartoon, illustration, exaggerated poses, implausible scenarios, or generic ' .
                'staged corporate stock-photo compositions.';
        } else if ($route === 'topicstext') {
            $parts[] = 'Create a high-quality, photorealistic editorial or documentary photograph ' .
                'suitable as the lead image for a well-made explanatory article.';
            $parts[] = 'The image must illustrate the actual subject described by the slide title and ' .
                'content, not a generic workplace, training, or corporate scene.';
            $parts[] = 'Country/Region: ' . $countryname .
                '. Use regional details only when they are genuinely relevant to the subject.';
            if ($c['topic'] !== '') {
                $parts[] = 'Article Topic: ' . $c['topic'] . '.';
            }
            $parts[] = 'Specific Subject to Illustrate: ' . $slidetitle . '.';
            if (self::len($slidedescription) > 20) {
                $descsnippet = self::slice($slidedescription, 0, 200);
                $parts[] = 'Article Context: ' . $descsnippet . '.';
            }
            if ($requirements) {
                $keyreqs = implode(', ', array_slice($requirements, 0, 4));
                $parts[] = 'Key visual elements to include where appropriate: ' . $keyreqs . '.';
            }
            $parts[] = 'Choose the setting, objects, composition, and visual emphasis solely from the ' .
                'subject matter. The image may depict a place, object, process, food, artwork, ' .
                'historical material, natural scene, technology, abstract concept made visually ' .
                'concrete, or people when people are genuinely relevant.';
            $parts[] = 'Do not assume that a person must be present. If people are relevant, show ' .
                'natural, authentic activity with realistic diversity and distinct individuals.';
            $parts[] = 'Do NOT assume any workplace, industry, training environment, safety procedure, ' .
                'PPE, hard hats, high-visibility clothing, or industrial equipment unless the ' .
                'subject itself explicitly calls for it.';
            $parts[] = 'Keep the composition clear and visually engaging, with the main subject ' .
                'immediately understandable and suitable for the top of an explanatory article.';
            $parts[] = 'Ultra-realistic, professional editorial or documentary photography.';
            $parts[] = 'Natural lighting appropriate to the subject.';
            $parts[] = 'High resolution, sharp focus.';
            $parts[] = 'Clean, balanced colour grading suitable for digital learning content.';
            $parts[] = 'Use an authentic camera perspective that best explains or showcases the subject.';
            $parts[] = 'No cartoon, illustration, exaggerated styles, unrelated workplace imagery, or ' .
                'implausible scenarios.';
        } else {
            $parts[] = 'Create a high-quality, photorealistic workplace training image suitable for ' .
                'vocational education, workplace training, and professional skills development.';
            $parts[] = 'The image must visually represent the learning topic and task described, matching ' .
                'the slide content and intended learning outcome, not generic stock imagery.';
            $parts[] = 'Country/Region: ' . $countryname . '.';
            if ($c['unitCode'] !== '' && $c['unitTitle'] !== '') {
                $parts[] = 'Qualification/Unit: ' . $c['unitCode'] . ' - ' . $c['unitTitle'] . '.';
            } else if ($c['topic'] !== '') {
                $parts[] = 'Topic: ' . $c['topic'] . '.';
            }
            if ($c['industry'] !== '') {
                $parts[] = 'Industry/Sector: ' . $industry . '.';
            }
            $parts[] = 'Specific Task Being Performed: ' . $slidetitle . '.';
            if (self::len($slidedescription) > 20) {
                $descsnippet = self::slice($slidedescription, 0, 200);
                $parts[] = 'Task Context: ' . $descsnippet . '.';
            }
            $parts[] = 'Depict a realistic workplace environment appropriate to the specified country and industry.';
            $parts[] = 'Workers must wear country-appropriate, industry-standard uniforms and PPE such ' .
                'as: safety helmets, gloves, eye and hearing protection, high-visibility clothing ' .
                'where required, industry-appropriate footwear.';
            $parts[] = 'PPE must be correctly worn and suitable for the task.';
            $parts[] = 'Uniforms should be professional, clean, and generic with no real company logos.';
            if ($c['jobTitle'] !== '') {
                $parts[] = 'Show a ' . $c['jobTitle'] . ' performing the task.';
            }
            $parts[] = 'Include realistic workforce diversity: mix of genders, different ethnic and ' .
                'cultural backgrounds, inclusive representation without stereotypes.';
            $parts[] = 'All people must display professional workplace behaviour: correct posture and ' .
                'body positioning, focused attention on the task, safe interaction with tools, ' .
                'equipment, and colleagues.';
            $parts[] = 'Facial expressions should convey competence, calmness, and engagement.';
            $parts[] = 'The image must clearly demonstrate: correct tools, equipment, and materials; safe ' .
                'work practices aligned with local industry expectations; logical task sequencing ' .
                'where visually possible.';
            $parts[] = 'Avoid clutter or irrelevant background elements. The primary learning action must ' .
                'be clearly visible and central in the image.';
            if ($requirements) {
                $keyreqs = implode(', ', array_slice($requirements, 0, 4));
                $parts[] = 'Key elements to show: ' . $keyreqs . '.';
            }
            if ($positive) {
                $keydos = implode(', ', array_slice($positive, 0, 3));
                $parts[] = 'Demonstrate correct practice: ' . $keydos . '.';
            }
            $parts[] = 'Ultra-realistic, professional training photography style.';
            $parts[] = 'Natural lighting appropriate to the workplace environment.';
            $parts[] = 'High resolution, sharp focus.';
            $parts[] = 'Neutral, clean colour grading suitable for digital learning slides.';
            $parts[] = 'Camera perspective should feel like a trainer or assessor observing best practice.';
            $parts[] = 'No unsafe actions or shortcuts. No incorrect PPE or unrealistic practices. No ' .
                'cartoon, illustration, or exaggerated styles. No incorrect tools or implausible workflows.';
            $parts[] = 'Ensure all tools, PPE, and safety practices reflect common regulatory and industry expectations for ' .
                $countryname . ' and the specified industry.';
        }
        $parts[] = 'CRITICAL: Generate a completely text-free image. Do NOT include any text, letters, ' .
            'numbers, words, labels, signs, banners, posters, writing, captions, watermarks, ' .
            'logos, brand names, or typographic elements of any kind. The image must contain zero ' .
            'readable or unreadable text characters. If the scene would naturally contain signage ' .
            'or labels, show them blank, obscured, or out of focus. Pure visual content only.';
        $parts[] = 'CRITICAL: Never duplicate or clone any person\'s face or body in the image. Every ' .
            'individual shown must be visually distinct — unique face, build, and appearance. Do ' .
            'NOT show the same person appearing more than once. Limit total people shown to a ' .
            'realistic number for the scene (typically 1–4). No repeated or mirrored figures.';
        if (self::trim($customprompt) !== '') {
            $parts[] = 'Additional instructions: ' . self::trim($customprompt);
        }
        return implode(' ', $parts);
    }

    // Request checks and JavaScript semantics.

    /**
     * The service's zod request check, for flat requests.
     *
     * Each rule is [type, default, ...]: type str, num, bool, strs (array of strings), docs (1 to 20 {docId, docName}),
     * enum (third item lists the values) or object (third item holds the rules for its fields). A null default makes
     * the field required; false leaves an absent optional field out (null). Unknown fields are dropped, as zod drops them.
     *
     * @param mixed $body
     * @param array $rules
     * @return array|null The values, or null when the request is refused.
     */
    protected static function fields($body, array $rules): ?array {
        if (!$body instanceof \stdClass) {
            return null;
        }
        $out = [];
        foreach ($rules as $name => $rule) {
            [$type, $default] = $rule;
            if (!property_exists($body, $name)) {
                if ($default === null) {
                    return null;
                }
                if ($type === 'object') {
                    $default = self::fields(new \stdClass(), $rule[2]);
                    $default = $default === null ? null : (object) $default;
                    if ($default === null) {
                        return null;
                    }
                }
                $out[$name] = $default === false && $type !== 'bool' ? null : $default;
                continue;
            }
            $value = $body->$name;
            if ($type === 'str' || $type === 'enum') {
                if (!is_string($value) || ($type === 'enum' && !in_array($value, $rule[2], true))) {
                    return null;
                }
                $size = self::len($value);
            } else if ($type === 'num') {
                if (!is_int($value) && !is_float($value)) {
                    return null;
                }
                $size = $value;
            } else if ($type === 'bool') {
                if (!is_bool($value)) {
                    return null;
                }
                $size = null;
            } else if ($type === 'strs') {
                if (!is_array($value) || count(array_filter($value, 'is_string')) !== count($value)) {
                    return null;
                }
                $size = null;
            } else if ($type === 'docs') {
                if (!is_array($value) || !$value || count($value) > 20) {
                    return null;
                }
                foreach ($value as $i => $doc) {
                    $doc = self::fields($doc, ['docId' => ['str', null], 'docName' => ['str', null]]);
                    if ($doc === null) {
                        return null;
                    }
                    $value[$i] = (object) $doc;
                }
                $size = null;
            } else {
                $inner = self::fields($value, $rule[2]);
                if ($inner === null) {
                    return null;
                }
                $value = (object) $inner;
                $size = null;
            }
            $min = $type === 'enum' || $type === 'object' ? null : ($rule[2] ?? null);
            $max = $rule[3] ?? null;
            if ($size !== null && (($min !== null && $size < $min) || ($max !== null && $size > $max))) {
                return null;
            }
            $out[$name] = $value;
        }
        return $out;
    }

    /**
     * map[key] on a JavaScript object literal: an inherited Object.prototype member comes back as JavaScript prints it.
     *
     * @param array $map
     * @param string $key
     * @return mixed The value, the printed member, or null when JavaScript gives undefined.
     */
    protected static function lookup(array $map, string $key) {
        if (array_key_exists($key, $map)) {
            return $map[$key];
        }
        if (in_array($key, self::PROTO, true)) {
            return self::member($key);
        }
        return null;
    }

    /**
     * String(Object.prototype[name]).
     *
     * @param string $name One of self::PROTO.
     * @return string
     */
    protected static function member(string $name): string {
        if ($name === '__proto__') {
            return '[object Object]';
        }
        return 'function ' . ($name === 'constructor' ? 'Object' : $name) . '() { [native code] }';
    }

    /**
     * A number as JSON writes it: whole floats as integers.
     *
     * @param int|float $n
     * @return int|float
     */
    protected static function number($n) {
        return is_float($n) && is_finite($n) && floor($n) == $n && abs($n) < 1e15 ? (int) $n : $n;
    }

    /**
     * String.prototype.slice() with a non-negative start, in UTF-16 code units.
     *
     * @param string $s
     * @param int $start
     * @param int|null $end
     * @return string
     */
    public static function slice(string $s, int $start, ?int $end = null): string {
        $u = mb_convert_encoding($s, 'UTF-16LE', 'UTF-8');
        $units = (int) (strlen($u) / 2);
        $end = $end === null ? $units : min($end, $units);
        if ($end <= $start) {
            return '';
        }
        // A surrogate pair cut in half becomes U+FFFD, as it does when JavaScript's string is sent on as UTF-8.
        $previous = mb_substitute_character();
        mb_substitute_character(0xFFFD);
        $out = mb_convert_encoding(substr($u, $start * 2, ($end - $start) * 2), 'UTF-8', 'UTF-16LE');
        mb_substitute_character($previous);
        return $out;
    }
}
