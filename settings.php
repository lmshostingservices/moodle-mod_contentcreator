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
 * Content Creator - Admin settings
 *
 * Note: Site ID and API Key are managed via AI Grader Central Config (local_aiconfig).
 * These fallback settings are only used if Central Config is not installed.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig && isset($settings)) {
    // Check whether AI Grader Central Config is available.
    $centralconfigurl = new moodle_url('/admin/settings.php', ['section' => 'local_aiconfig']);
    $centralconfiginstalled = file_exists($CFG->dirroot . '/local/aiconfig/version.php');

    if ($centralconfiginstalled) {
        $noticetext = get_string('centralconfigfound', 'mod_contentcreator') . ' ' .
            html_writer::link($centralconfigurl, get_string('centralconfigconfigure', 'mod_contentcreator'));
        $noticetype = \core\output\notification::NOTIFY_SUCCESS;
    } else {
        $noticetext = get_string('centralconfigmissing', 'mod_contentcreator') . ' ' .
            html_writer::link(
                new moodle_url('https://lms-labs.com/docs/ai-central-config'),
                get_string('centralconfiglearnmore', 'mod_contentcreator'),
                ['target' => '_blank', 'rel' => 'noreferrer noopener']
            );
        $noticetype = \core\output\notification::NOTIFY_INFO;
    }

    $settings->add(new admin_setting_heading(
        'mod_contentcreator/centralconfignotice',
        '',
        $OUTPUT->notification($noticetext, $noticetype, false)
    ));

    $settings->add(new admin_setting_heading(
        'mod_contentcreator/aiheading',
        get_string('aisettings', 'mod_contentcreator'),
        get_string('aisettingsdesc', 'mod_contentcreator')
    ));

    $settings->add(new admin_setting_configtext(
        'mod_contentcreator/siteid',
        get_string('siteid', 'mod_contentcreator'),
        $centralconfiginstalled
            ? get_string('settingfallbacknote', 'mod_contentcreator', get_string('siteiddesc', 'mod_contentcreator'))
            : get_string('siteiddesc', 'mod_contentcreator'),
        '',
        PARAM_ALPHANUMEXT
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'mod_contentcreator/apikey',
        get_string('apikey', 'mod_contentcreator'),
        $centralconfiginstalled
            ? get_string('settingfallbacknote', 'mod_contentcreator', get_string('apikeydesc', 'mod_contentcreator'))
            : get_string('apikeydesc', 'mod_contentcreator'),
        ''
    ));

    $settings->add(new admin_setting_configselect(
        'mod_contentcreator/country',
        get_string('country', 'mod_contentcreator'),
        get_string('countrydesc', 'mod_contentcreator'),
        'Australia',
        [
            'Australia' => 'Australia',
            'New Zealand' => 'New Zealand',
            'United Kingdom' => 'United Kingdom',
            'United States' => 'United States',
            'Canada' => 'Canada',
            'Ireland' => 'Ireland',
            'South Africa' => 'South Africa',
            'India' => 'India',
            'Pakistan' => 'Pakistan',
            'Philippines' => 'Philippines',
            'Singapore' => 'Singapore',
            'Malaysia' => 'Malaysia',
            'Indonesia' => 'Indonesia',
            'Japan' => 'Japan',
            'South Korea' => 'South Korea',
            'China' => 'China',
            'Hong Kong' => 'Hong Kong',
            'Taiwan' => 'Taiwan',
            'Thailand' => 'Thailand',
            'Vietnam' => 'Vietnam',
            'France' => 'France',
            'Germany' => 'Germany',
            'Italy' => 'Italy',
            'Spain' => 'Spain',
            'Portugal' => 'Portugal',
            'Netherlands' => 'Netherlands',
            'Belgium' => 'Belgium',
            'Sweden' => 'Sweden',
            'Norway' => 'Norway',
            'Denmark' => 'Denmark',
            'Finland' => 'Finland',
            'Poland' => 'Poland',
            'Czech Republic' => 'Czech Republic',
            'Austria' => 'Austria',
            'Switzerland' => 'Switzerland',
            'Russia' => 'Russia',
            'Ukraine' => 'Ukraine',
            'Turkey' => 'Turkey',
            'Saudi Arabia' => 'Saudi Arabia',
            'UAE' => 'United Arab Emirates',
            'Egypt' => 'Egypt',
            'Nigeria' => 'Nigeria',
            'Kenya' => 'Kenya',
            'Brazil' => 'Brazil',
            'Mexico' => 'Mexico',
            'Argentina' => 'Argentina',
            'Chile' => 'Chile',
            'Colombia' => 'Colombia',
            'Other' => 'Other',
        ]
    ));

    // Voice settings.
    $settings->add(new admin_setting_heading(
        'mod_contentcreator/voiceheading',
        get_string('voicesettings', 'mod_contentcreator'),
        get_string('voicesettingsdesc', 'mod_contentcreator')
    ));

    $settings->add(new admin_setting_configcheckbox(
        'mod_contentcreator/enablevoice',
        get_string('enablevoice', 'mod_contentcreator'),
        get_string('enablevoicedesc', 'mod_contentcreator'),
        1
    ));

    $settings->add(new admin_setting_configselect(
        'mod_contentcreator/voicelanguage',
        get_string('voicelanguage', 'mod_contentcreator'),
        get_string('voicelanguagedesc', 'mod_contentcreator'),
        'en-AU',
        [
            'en-AU' => 'English (Australia)',
            'en-GB' => 'English (UK)',
            'en-US' => 'English (US)',
            'en-IN' => 'English (India)',
            'en-NZ' => 'English (New Zealand)',
            'zh-CN' => 'Chinese (Mandarin)',
            'zh-TW' => 'Chinese (Traditional)',
            'zh-HK' => 'Chinese (Cantonese)',
            'ja-JP' => 'Japanese',
            'ko-KR' => 'Korean',
            'vi-VN' => 'Vietnamese',
            'th-TH' => 'Thai',
            'id-ID' => 'Indonesian',
            'ms-MY' => 'Malay',
            'fil-PH' => 'Filipino',
            'hi-IN' => 'Hindi',
            'ta-IN' => 'Tamil',
            'te-IN' => 'Telugu',
            'ur-PK' => 'Urdu',
            'ar-XA' => 'Arabic',
            'fr-FR' => 'French',
            'de-DE' => 'German',
            'es-ES' => 'Spanish (Spain)',
            'es-US' => 'Spanish (US)',
            'pt-BR' => 'Portuguese (Brazil)',
            'pt-PT' => 'Portuguese (Portugal)',
            'it-IT' => 'Italian',
            'nl-NL' => 'Dutch',
            'pl-PL' => 'Polish',
            'ru-RU' => 'Russian',
            'uk-UA' => 'Ukrainian',
            'tr-TR' => 'Turkish',
            'sv-SE' => 'Swedish',
            'nb-NO' => 'Norwegian',
            'da-DK' => 'Danish',
            'fi-FI' => 'Finnish',
            'cs-CZ' => 'Czech',
            'ro-RO' => 'Romanian',
            'hu-HU' => 'Hungarian',
            'el-GR' => 'Greek',
            'he-IL' => 'Hebrew',
            'bg-BG' => 'Bulgarian',
            'sk-SK' => 'Slovak',
            'hr-HR' => 'Croatian',
            'sr-RS' => 'Serbian',
            'sl-SI' => 'Slovenian',
            'ca-ES' => 'Catalan',
            'eu-ES' => 'Basque',
            'gl-ES' => 'Galician',
            'af-ZA' => 'Afrikaans',
            'sw-KE' => 'Swahili',
            'bn-IN' => 'Bengali',
        ]
    ));

    $settings->add(new admin_setting_configselect(
        'mod_contentcreator/voicegender',
        get_string('voicegender', 'mod_contentcreator'),
        get_string('voicegenderdesc', 'mod_contentcreator'),
        'Zephyr',
        [
            'Zephyr' => get_string('voice_zephyr', 'mod_contentcreator'),
            'Aoede'  => get_string('voice_aoede', 'mod_contentcreator'),
            'Kore'   => get_string('voice_kore', 'mod_contentcreator'),
            'Leda'   => get_string('voice_leda', 'mod_contentcreator'),
            'Puck'   => get_string('voice_puck', 'mod_contentcreator'),
            'Charon' => get_string('voice_charon', 'mod_contentcreator'),
            'Fenrir' => get_string('voice_fenrir', 'mod_contentcreator'),
            'Orus'   => get_string('voice_orus', 'mod_contentcreator'),
        ]
    ));

    // Focus requirement setting.
    $settings->add(new admin_setting_heading(
        'mod_contentcreator/focusheading',
        get_string('requirefocus', 'mod_contentcreator'),
        ''
    ));

    $settings->add(new admin_setting_configcheckbox(
        'mod_contentcreator/requirefocus',
        get_string('requirefocus', 'mod_contentcreator'),
        get_string('requirefocusdesc', 'mod_contentcreator'),
        0
    ));

    $settings->add(new admin_setting_heading(
        'mod_contentcreator/ratelimitheading',
        get_string('ratelimitsettings', 'mod_contentcreator'),
        get_string('ratelimitsettingsdesc', 'mod_contentcreator')
    ));

    $settings->add(new admin_setting_configtext(
        'mod_contentcreator/ratelimitgenerate',
        get_string('ratelimitgenerate', 'mod_contentcreator'),
        get_string('ratelimitgeneratedesc', 'mod_contentcreator'),
        60,
        PARAM_INT
    ));

    $settings->add(new admin_setting_configtext(
        'mod_contentcreator/ratelimitvendor',
        get_string('ratelimitvendor', 'mod_contentcreator'),
        get_string('ratelimitvendordesc', 'mod_contentcreator'),
        200,
        PARAM_INT
    ));

    $settings->add(new admin_setting_configtext(
        'mod_contentcreator/ratelimitvoice',
        get_string('ratelimitvoice', 'mod_contentcreator'),
        get_string('ratelimitvoicedesc', 'mod_contentcreator'),
        100,
        PARAM_INT
    ));
}
