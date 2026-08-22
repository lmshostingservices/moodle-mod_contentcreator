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
 * Tests for the shared text to speech voice resolver.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_contentcreator\voice
 */
final class voice_test extends \advanced_testcase {
    /**
     * A language with its own Chirp 3 HD voice resolves to that voice and keeps its language.
     *
     * @return void
     */
    public function test_resolve_native_language(): void {
        $this->resetAfterTest();
        $this->assertSame(['en-AU-Chirp3-HD-Aoede', 'en-AU'], voice::resolve('en-AU', 'Aoede'));
        $this->assertSame(['ja-JP-Chirp3-HD-Kore', 'ja-JP'], voice::resolve('ja-JP', 'Kore'));
    }

    /**
     * The speech service names some languages differently from the BCP 47 form the UI uses.
     *
     * @return void
     */
    public function test_resolve_language_aliases(): void {
        $this->resetAfterTest();
        $this->assertSame(['cmn-CN-Chirp3-HD-Kore', 'cmn-CN'], voice::resolve('zh-CN', 'Kore'));
        // nb-NO must pass through untouched: no-NO has no voice.
        $this->assertSame(['nb-NO-Chirp3-HD-Aoede', 'nb-NO'], voice::resolve('nb-NO', 'Aoede'));
    }

    /**
     * A language with no Chirp 3 HD voice falls back, and reports the fallback's language.
     *
     * Sending the requested language alongside a voice belonging to another one makes the
     * speech service reject the pair, which reached the learner as silence.
     *
     * @return void
     */
    public function test_resolve_languages_without_chirp3(): void {
        $this->resetAfterTest();
        $this->assertSame(['ms-MY-Standard-D', 'ms-MY'], voice::resolve('ms-MY', 'Zephyr'));
        $this->assertSame(['fil-PH-Standard-A', 'fil-PH'], voice::resolve('fil-PH', 'Zephyr'));
        $this->assertSame(['hi-IN-Chirp3-HD-Leda', 'hi-IN'], voice::resolve('pa-IN', 'Leda'));
        $this->assertSame(['pt-BR-Chirp3-HD-Puck', 'pt-BR'], voice::resolve('pt-PT', 'Puck'));
        $this->assertSame(['yue-HK-Standard-D', 'yue-HK'], voice::resolve('zh-HK', 'Kore'));
    }

    /**
     * An empty language falls back to the plugin default rather than producing a bare voice id.
     *
     * @return void
     */
    public function test_resolve_empty_language(): void {
        $this->resetAfterTest();
        $this->assertSame(['en-AU-Chirp3-HD-Aoede', 'en-AU'], voice::resolve('', 'Aoede'));
    }

    /**
     * An explicit voice name from the caller wins over everything else.
     *
     * @return void
     */
    public function test_resolve_name_explicit(): void {
        $this->resetAfterTest();
        set_config('voicegender', 'Charon', 'mod_contentcreator');
        $this->assertSame('Fenrir', voice::resolve_name('Fenrir'));
        $this->assertSame('Orus', voice::resolve_name('Orus', 'male'));
    }

    /**
     * The site setting is honoured when the caller names no voice.
     *
     * ajax.php previously ignored this setting altogether, so a voice chosen in the plugin
     * settings had no effect on the player.
     *
     * @return void
     */
    public function test_resolve_name_site_setting(): void {
        $this->resetAfterTest();
        set_config('voicegender', 'Charon', 'mod_contentcreator');
        $this->assertSame('Charon', voice::resolve_name(''));
        $this->assertSame('Charon', voice::resolve_name('NotAVoice'));
    }

    /**
     * Gender values stored before v13.1 still resolve to a voice.
     *
     * @return void
     */
    public function test_resolve_name_legacy_gender(): void {
        $this->resetAfterTest();
        set_config('voicegender', '', 'mod_contentcreator');
        $this->assertSame('Puck', voice::resolve_name('', 'male'));
        $this->assertSame('Aoede', voice::resolve_name('', 'female'));

        set_config('voicegender', 'male', 'mod_contentcreator');
        $this->assertSame('Puck', voice::resolve_name(''));
    }

    /**
     * Text below the cap is returned with markup stripped and whitespace collapsed.
     *
     * @return void
     */
    public function test_clean_text_short(): void {
        $this->resetAfterTest();
        $this->assertSame('Hi there', voice::clean_text('<b>Hi</b>  there', 100));
    }

    /**
     * The cap counts characters, not bytes, and never splits a character.
     *
     * The byte based version this replaces cut multibyte text mid character, handing
     * malformed UTF-8 to the speech service.
     *
     * @return void
     */
    public function test_clean_text_multibyte(): void {
        $this->resetAfterTest();
        $japanese = str_repeat('あ', 50);

        $capped = voice::clean_text($japanese, 40);
        $this->assertSame(40, \core_text::strlen($capped));
        $this->assertTrue(mb_check_encoding($capped, 'UTF-8'));
    }

    /**
     * Overlong text is cut at a sentence boundary rather than mid clause.
     *
     * @return void
     */
    public function test_clean_text_sentence_boundary(): void {
        $this->resetAfterTest();
        $text = 'One sentence here. Two sentence here. And a long tail that overflows the cap.';
        $this->assertSame('One sentence here. Two sentence here.', voice::clean_text($text, 40));
    }

    /**
     * Both TTS routes must agree on the cache key or identical audio is paid for twice.
     *
     * @return void
     */
    public function test_cache_key_is_stable(): void {
        $this->resetAfterTest();
        [$voiceid, $language] = voice::resolve('en-AU', 'Aoede');

        $first = voice::cache_key('hello', $voiceid, $language);
        $this->assertSame($first, voice::cache_key('hello', $voiceid, $language));
        $this->assertNotSame($first, voice::cache_key('hello', 'en-AU-Chirp3-HD-Puck', 'en-AU'));
        $this->assertNotSame($first, voice::cache_key('goodbye', $voiceid, $language));
    }
}
