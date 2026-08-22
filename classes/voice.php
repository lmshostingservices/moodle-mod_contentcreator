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

/**
 * Text to speech voice resolution.
 *
 * The plugin reaches the speech service by two routes: ajax.php for the player and the
 * builder, and \mod_contentcreator\external\generate_voiceover for the mobile app and any
 * other web service consumer. Both had their own copy of the language map, the voice name
 * defaults and the text cleaner, and the copies had drifted:
 *
 * - The web service had no fallback for languages without a Chirp 3 HD voice, so it built
 *   identifiers such as ms-MY-Chirp3-HD-Zephyr, which do not exist. The speech service
 *   rejected the request and the learner heard silence.
 * - The web service sent the requested language as languageCode while sending a voice
 *   belonging to a different language, so zh-CN was paired with a cmn-CN voice.
 * - ajax.php ignored the site level voice setting entirely and mapped a binary gender to a
 *   hardcoded name, so choosing a voice in the plugin settings had no effect there.
 * - ajax.php measured its length cap in bytes, which truncates mid character in Japanese,
 *   Thai, Arabic and Chinese.
 *
 * Both routes now share this class, and both write to the same file area with the same cache
 * key, so identical text is generated once and charged once.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class voice {
    /** @var string[] Chirp 3 HD voice names offered by the builder and the settings page. */
    const VALID_VOICES = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];

    /** @var string Voice used when nothing else resolves. */
    const DEFAULT_VOICE = 'Aoede';

    /** @var string Voice used for the legacy male gender value. */
    const DEFAULT_VOICE_MALE = 'Puck';

    /** @var int Maximum characters sent to the speech service in one request. */
    const MAX_TEXT_LENGTH = 20000;

    /**
     * Resolve a voice name from a request parameter and the site setting.
     *
     * Priority: an explicit valid voice name from the caller, then the site setting (which
     * may hold either a voice name or a legacy male/female value), then the default.
     *
     * @param string $requested Voice name supplied by the caller, possibly empty or invalid.
     * @param string $gender Legacy gender parameter, used only when no voice name is given.
     * @return string A name from self::VALID_VOICES.
     */
    public static function resolve_name(string $requested, string $gender = ''): string {
        $requested = trim($requested);
        if (in_array($requested, self::VALID_VOICES, true)) {
            return $requested;
        }

        // The site setting may hold a voice name, or male/female from before v13.1.
        $siteconfig = trim((string)get_config('mod_contentcreator', 'voicegender'));
        if (in_array($siteconfig, self::VALID_VOICES, true)) {
            return $siteconfig;
        }

        $effectivegender = $gender !== '' ? strtolower(trim($gender)) : strtolower($siteconfig);
        if ($effectivegender === 'male') {
            return self::DEFAULT_VOICE_MALE;
        }

        return self::DEFAULT_VOICE;
    }

    /**
     * Resolve the speech service voice identifier and the language to send alongside it.
     *
     * The returned language is the one the voice actually belongs to, which is not always the
     * one that was asked for: a language without a Chirp 3 HD voice falls back to the closest
     * available one, and the identifier and the language code must agree or the speech service
     * rejects the pair.
     *
     * @param string $language Requested BCP 47 language tag, for example en-AU or pa-IN.
     * @param string $voicename A name from self::VALID_VOICES.
     * @return array [string $voiceid, string $language] identifier and its language.
     */
    public static function resolve(string $language, string $voicename): array {
        $language = trim($language) !== '' ? trim($language) : 'en-AU';

        // Tags the speech service names differently from the BCP 47 form the UI uses.
        // nb-NO is deliberately absent: nb-NO-Chirp3-HD-Aoede is correct and no-NO does
        // not exist.
        $aliases = [
            'zh-CN' => 'cmn-CN',
            'zh-TW' => 'cmn-TW',
            'zh-HK' => 'yue-HK',
        ];
        $mapped = $aliases[$language] ?? $language;

        // Languages offered in the additional-languages list that Chirp 3 HD does not
        // cover. Punjabi has no native voice at all, so Hindi is the closest match.
        $fallbacks = [
            'ms-MY' => ['ms-MY-Standard-D', 'ms-MY'],
            'pa-IN' => ["hi-IN-Chirp3-HD-{$voicename}", 'hi-IN'],
            'fil-PH' => ['fil-PH-Standard-A', 'fil-PH'],
            'yue-HK' => ['yue-HK-Standard-D', 'yue-HK'],
            'cmn-TW' => ["cmn-CN-Chirp3-HD-{$voicename}", 'cmn-CN'],
            'pt-PT' => ["pt-BR-Chirp3-HD-{$voicename}", 'pt-BR'],
            'ca-ES' => ["es-ES-Chirp3-HD-{$voicename}", 'es-ES'],
            'is-IS' => ['is-IS-Standard-A', 'is-IS'],
        ];
        if (isset($fallbacks[$mapped])) {
            return $fallbacks[$mapped];
        }

        return ["{$mapped}-Chirp3-HD-{$voicename}", $mapped];
    }

    /**
     * Strip markup from narration text and cap its length at a sentence boundary.
     *
     * Lengths are measured in characters rather than bytes. The byte based version this
     * replaces could cut a multi byte character in half, handing malformed UTF-8 to the
     * speech service, and applied a cap roughly three times tighter than intended for
     * Japanese, Thai, Arabic and Chinese.
     *
     * @param string $text Raw narration text.
     * @param int|null $maxchars Character cap, defaulting to self::MAX_TEXT_LENGTH.
     * @return string Cleaned text, no longer than the cap.
     */
    public static function clean_text(string $text, ?int $maxchars = null): string {
        $maxchars = $maxchars ?? self::MAX_TEXT_LENGTH;
        $text = strip_tags($text);
        $text = preg_replace('/\s+/u', ' ', $text);
        $text = trim($text);

        if (\core_text::strlen($text) <= $maxchars) {
            return $text;
        }

        $trimmed = \core_text::substr($text, 0, $maxchars);

        // Prefer to end on a sentence so the narration does not stop mid clause. A boundary
        // in the first tenth of the text means the content is not really sentences, so the
        // hard cut is kept instead.
        $boundary = false;
        foreach (['. ', '! ', '? '] as $terminator) {
            $found = \core_text::strrpos($trimmed, $terminator);
            if ($found !== false && ($boundary === false || $found > $boundary)) {
                $boundary = $found;
            }
        }
        if ($boundary !== false && $boundary > (int)($maxchars / 10)) {
            return \core_text::substr($trimmed, 0, $boundary + 1);
        }

        return $trimmed;
    }

    /**
     * Cache key for a piece of generated audio.
     *
     * Identical across both routes so that audio generated by one is reused by the other
     * instead of being paid for twice.
     *
     * @param string $text Cleaned narration text.
     * @param string $voiceid Resolved voice identifier.
     * @param string $language Language belonging to that voice.
     * @return string Key, without a file extension.
     */
    public static function cache_key(string $text, string $voiceid, string $language): string {
        return md5($text . '|' . $voiceid . '|' . $language);
    }
}
