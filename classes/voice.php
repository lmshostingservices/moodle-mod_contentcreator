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

/**
 * Shared voice resolution for Content Creator.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

/**
 * Resolves a language code and voice name into the voice id sent to the speech service.
 *
 * v13.94.3: this table used to exist twice. ajax.php carried the full version, including
 * the fallbacks for the eight locales Chirp 3 HD does not cover; the web-service path in
 * external\generate_voiceover carried a shorter copy that omitted them, so it built ids
 * like 'ms-MY-Chirp3-HD-Zephyr', which do not exist - the service rejected the request and
 * the learner heard silence. Both call sites now share this one implementation so the two
 * tables cannot drift apart again.
 *
 * Voice selection remains Google Chirp 3 HD, chosen by the author before generation. The
 * fallbacks below are not a downgrade of that policy: each one covers a locale where
 * Chirp 3 HD has no voice at all, and each either stays on Chirp 3 HD in the nearest
 * supported locale or, where there is no such locale, uses the only Google voice there is.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class voice {
    /** @var string[] The Chirp 3 HD voice names offered to authors. */
    const VALID_VOICES = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];

    /**
     * Resolve the speech service voice id and the language code to request with it.
     *
     * @param string $languagecode Language code chosen for the activity, for example 'en-AU' or 'zh-CN'.
     * @param string $voicename Chirp 3 HD voice name, for example 'Zephyr'.
     * @return array ['voiceid' => string, 'language' => string] - the language may differ from
     *               the one passed in where the requested locale has no voice of its own.
     */
    public static function resolve(string $languagecode, string $voicename): array {
        // Language codes the speech service knows under a different name. Note that nb-NO is
        // deliberately absent: nb-NO-Chirp3-HD-Aoede is the correct voice and no-NO does not
        // exist (FIX-CC-ML-NB-NO, v13.19).
        $languagemappings = [
            'zh-CN' => 'cmn-CN', // Mandarin Chinese.
            'zh-TW' => 'cmn-TW', // Traditional Chinese.
            'zh-HK' => 'yue-HK', // Cantonese.
        ];
        $mappedlang = $languagemappings[$languagecode] ?? $languagecode;

        // Locales offered in the additional-languages list that Chirp 3 HD does not cover.
        // Without these the speech service rejects the request outright and the student
        // hears silence. Punjabi has no native Google voice, so Hindi is the closest.
        $nonchirp3voices = [
            'ms-MY' => ['voiceid' => 'ms-MY-Standard-D', 'language' => 'ms-MY'],
            'pa-IN' => ['voiceid' => "hi-IN-Chirp3-HD-{$voicename}", 'language' => 'hi-IN'],
            'fil-PH' => ['voiceid' => 'fil-PH-Standard-A', 'language' => 'fil-PH'],
            'yue-HK' => ['voiceid' => 'yue-HK-Standard-D', 'language' => 'yue-HK'],
            'cmn-TW' => ['voiceid' => "cmn-CN-Chirp3-HD-{$voicename}", 'language' => 'cmn-CN'],
            'pt-PT' => ['voiceid' => "pt-BR-Chirp3-HD-{$voicename}", 'language' => 'pt-BR'],
            'ca-ES' => ['voiceid' => "es-ES-Chirp3-HD-{$voicename}", 'language' => 'es-ES'],
            'is-IS' => ['voiceid' => 'is-IS-Standard-A', 'language' => 'is-IS'],
        ];

        if (isset($nonchirp3voices[$mappedlang])) {
            return $nonchirp3voices[$mappedlang];
        }

        // The language code is returned unchanged here, not remapped. Only the voice id
        // carries the mapped locale, which is what both call sites already sent to the
        // service and what is known to work in production; the mapping exists to name the
        // voice, not to relabel the request.
        return [
            'voiceid' => "{$mappedlang}-Chirp3-HD-{$voicename}",
            'language' => $languagecode,
        ];
    }
}
