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
 * mod_contentcreator file.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/licenses/gpl-3.0.html GNU GPL v3 or later
 */

// AI Content Creator — Diagnostic Tool v12.95
// Access: /mod/contentcreator/diag.php?cmid=<cmid>
//         /mod/contentcreator/diag.php          (config-only check, no activity required)
//         /mod/contentcreator/diag.php?testlang=fr-FR   (test specific language TTS)
// Requires: site admin or moodle/site:config capability.
// NOTE: Section 9 makes a live TTS API call and costs 5 credits per language tested.
// Sections: 1=Config, 2=DB tables, 3=Activity/manifest, 4=AMD builds, 5=Src-build sync,
//           6=Additional languages, 7=Start Learning readiness, 8=Audio loop, 9=Live TTS,
//           10=Topic ID type audit, 11=Player JS version, 12=Progress records,
//           13=Start Topic simulation, 14=Language generation code chain,
//           15=German (de-DE) end-to-end failure diagnosis

require_once(__DIR__ . '/../../config.php');
require_login();
require_capability('moodle/site:config', context_system::instance());

$cmid = optional_param('cmid', 0, PARAM_INT) ?: optional_param('id', 0, PARAM_INT);

// ── Helper functions ──────────────────────────────────────────────────────────

function cc_diag_pass(string $label, string $value = ''): string {
    return '<tr><td class="label">' . htmlspecialchars($label) . '</td>'
         . '<td class="pass">PASS</td>'
         . '<td class="val">' . htmlspecialchars($value) . '</td></tr>';
}

function cc_diag_fail(string $label, string $value = ''): string {
    return '<tr><td class="label">' . htmlspecialchars($label) . '</td>'
         . '<td class="fail">FAIL</td>'
         . '<td class="val">' . htmlspecialchars($value) . '</td></tr>';
}

function cc_diag_info(string $label, string $value = ''): string {
    return '<tr><td class="label">' . htmlspecialchars($label) . '</td>'
         . '<td class="info">INFO</td>'
         . '<td class="val">' . htmlspecialchars($value) . '</td></tr>';
}

$overall_pass = true;

// ── SECTION 1: Plugin configuration ──────────────────────────────────────────

$rows_config = '';

$aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
$has_aiconfig = file_exists($aiconfiglib);
if ($has_aiconfig) {
    require_once($aiconfiglib);
    $rows_config .= cc_diag_pass('local_aiconfig installed', 'lib.php found — central config is active');
} else {
    $rows_config .= cc_diag_info('local_aiconfig installed', 'Not found — falling back to per-plugin settings');
}

if ($has_aiconfig && function_exists('local_aiconfig_get_siteid')) {
    $siteid = local_aiconfig_get_siteid('mod_contentcreator');
    $siteid_source = 'local_aiconfig';
} else {
    $siteid = trim(get_config('mod_contentcreator', 'siteid') ?? '');
    $siteid_source = 'mod_contentcreator plugin settings';
}

if (!empty($siteid)) {
    $rows_config .= cc_diag_pass('Site ID', 'Configured via ' . $siteid_source . ' (' . strlen($siteid) . ' chars)');
} else {
    $rows_config .= cc_diag_fail('Site ID', 'Empty — generation will fail with "Site ID not configured". Set it in ' . $siteid_source . '.');
    $overall_pass = false;
}

if ($has_aiconfig && function_exists('local_aiconfig_get_apikey')) {
    $apikey = local_aiconfig_get_apikey('mod_contentcreator');
    $apikey_source = 'local_aiconfig';
} else {
    $apikey = trim(get_config('mod_contentcreator', 'apikey') ?? '');
    $apikey_source = 'mod_contentcreator plugin settings';
}

if (!empty($apikey)) {
    $rows_config .= cc_diag_pass('API Key', 'Configured via ' . $apikey_source . ' (' . strlen($apikey) . ' chars)');
} else {
    $rows_config .= cc_diag_fail('API Key', 'Empty — generation will fail with "API key not configured". Set it in ' . $apikey_source . '.');
    $overall_pass = false;
}

$voicelanguage = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
$rows_config .= cc_diag_info('Voice language', $voicelanguage);

$enablevoice = get_config('mod_contentcreator', 'enablevoice');
$enablevoice_val = ($enablevoice === false || $enablevoice === null) ? 1 : (int)$enablevoice;
$rows_config .= cc_diag_info('Voice (TTS) enabled', $enablevoice_val ? 'Yes' : 'No');

$country = get_config('mod_contentcreator', 'country') ?: 'Australia';
$rows_config .= cc_diag_info('Country', $country);

// ── SECTION 2: DB tables ───────────────────────────────────────────────────────

$rows_db = '';

$required_tables = [
    'contentcreator'          => 'Main activity table',
    'contentcreator_attempts' => 'Student attempts and scores',
    'contentcreator_progress' => 'User progress tracking (card-based player)',
    'contentcreator_checklist'=> 'Before You Start checklist tracking',
];

foreach ($required_tables as $table => $desc) {
    if ($DB->get_manager()->table_exists($table)) {
        $rows_db .= cc_diag_pass('Table: ' . $table, $desc . ' — exists');
    } else {
        $rows_db .= cc_diag_fail('Table: ' . $table, $desc . ' — MISSING. Run Moodle upgrade to create tables.');
        $overall_pass = false;
    }
}

// ── SECTION 3: Activity-level checks (only when cmid provided) ────────────────

$rows_activity = '';
$cm = null;
$cc = null;

if ($cmid > 0) {
    try {
        list($course_obj, $cm_obj) = get_course_and_cm_from_cmid($cmid, 'contentcreator');
        $cm = $cm_obj;
        $cc = $DB->get_record('contentcreator', ['id' => $cm->instance], '*', MUST_EXIST);
        $rows_activity .= cc_diag_pass('Course module found', 'cmid=' . $cmid . ' → contentcreator id=' . $cc->id . ' in course ' . $cc->course);
    } catch (Exception $e) {
        $rows_activity .= cc_diag_fail('Course module found', 'Error: ' . $e->getMessage());
        $overall_pass = false;
        $cc = null;
    }

    if ($cc !== null) {
        // Manifest JSON
        if (empty($cc->manifestjson)) {
            $rows_activity .= cc_diag_info('Manifest JSON', 'Empty — content has not been generated yet for this activity');
        } else {
            $manifest = json_decode($cc->manifestjson, true);
            if (!is_array($manifest)) {
                $rows_activity .= cc_diag_fail('Manifest JSON', 'Present but JSON is invalid. Stored length: ' . strlen($cc->manifestjson) . ' bytes. DB may be corrupted — try regenerating content.');
                $overall_pass = false;
            } else {
                $rows_activity .= cc_diag_pass('Manifest JSON', 'Valid JSON (' . strlen($cc->manifestjson) . ' bytes, ' . count($manifest) . ' top-level keys)');

                // Manifest version
                $manifest_version = $cc->manifestversion ?? ($manifest['version'] ?? null);
                if (!empty($manifest_version)) {
                    $rows_activity .= cc_diag_pass('Manifest version', (string)$manifest_version);
                } else {
                    $rows_activity .= cc_diag_info('Manifest version', 'Not set — pre-version manifest or field absent');
                }

                // Topics
                $topics = $manifest['topics'] ?? [];
                if (!is_array($topics) || empty($topics)) {
                    $rows_activity .= cc_diag_fail('Manifest topics', 'No topics array found in manifest. Regenerate content to rebuild manifest.');
                    $overall_pass = false;
                } else {
                    $topic_count = count($topics);
                    $rows_activity .= cc_diag_pass('Manifest topics', $topic_count . ' topic(s) found');

                    // ── Content per topic ────────────────────────────────────────────────
                    // v12+ manifests use sections[].cards[] (VET/Workplace/University/PD card-based
                    // format). Older or slide-based manifests may use topic.slides[]. Check BOTH:
                    // a topic counts as "populated" if it has either slides[] OR sections with cards.
                    $topics_with_content  = 0;
                    $topics_missing_content = 0;
                    $total_slides  = 0;
                    $total_sections = 0;
                    $total_cards   = 0;
                    $format_slides   = 0; // topics using slide format
                    $format_sections = 0; // topics using sections/cards format

                    foreach ($topics as $topic) {
                        $slides   = $topic['slides']   ?? [];
                        $sections = $topic['sections'] ?? [];

                        $has_slides = is_array($slides) && count($slides) > 0;
                        // Sections count as populated if at least one section has at least one card
                        $has_sections = false;
                        $sec_card_total = 0;
                        if (is_array($sections)) {
                            foreach ($sections as $sec) {
                                $sec_cards = $sec['cards'] ?? [];
                                if (is_array($sec_cards) && count($sec_cards) > 0) {
                                    $has_sections = true;
                                    $sec_card_total += count($sec_cards);
                                }
                            }
                        }

                        if ($has_slides) {
                            $topics_with_content++;
                            $format_slides++;
                            $total_slides += count($slides);
                        } elseif ($has_sections) {
                            $topics_with_content++;
                            $format_sections++;
                            $total_sections += count($sections);
                            $total_cards += $sec_card_total;
                        } else {
                            $topics_missing_content++;
                        }
                    }

                    if ($topics_missing_content === 0) {
                        $content_detail = [];
                        if ($format_slides > 0)   $content_detail[] = $total_slides . ' slide(s) across ' . $format_slides . ' topic(s)';
                        if ($format_sections > 0) $content_detail[] = $total_sections . ' section(s), ' . $total_cards . ' card(s) across ' . $format_sections . ' topic(s)';
                        $rows_activity .= cc_diag_pass(
                            'Content per topic',
                            'All ' . $topic_count . ' topic(s) have content. ' . implode('. ', $content_detail) . '.'
                        );
                    } else {
                        $rows_activity .= cc_diag_fail(
                            'Content per topic',
                            $topics_missing_content . ' topic(s) have no content (no slides and no sections/cards). '
                          . $topics_with_content . ' topic(s) have content. '
                          . 'Incomplete generation — regenerate content to rebuild missing topics.'
                        );
                        $overall_pass = false;
                    }
                }

                // Mode / type info from manifest
                $mode = $manifest['mode'] ?? ($manifest['contentMode'] ?? ($manifest['type'] ?? null));
                if (!empty($mode)) {
                    $rows_activity .= cc_diag_info('Manifest mode/type', (string)$mode);
                }

                // Unit code / qualification
                $unit_code = $manifest['unitCode'] ?? ($manifest['unit_code'] ?? ($manifest['elementCode'] ?? null));
                if (!empty($unit_code)) {
                    $rows_activity .= cc_diag_info('Unit/element code', (string)$unit_code);
                }
            }
        }

        // Completion settings
        $rows_activity .= cc_diag_info(
            'Completion: view all slides',
            $cc->completionviewallslides ? 'Required' : 'Not required'
        );
        $rows_activity .= cc_diag_info(
            'Completion: all activities at 100%',
            $cc->completionallactivities ? 'Required' : 'Not required'
        );

        // Attempt count
        if ($DB->get_manager()->table_exists('contentcreator_attempts')) {
            $attempt_count = $DB->count_records('contentcreator_attempts', ['contentcreatorid' => $cc->id]);
            $rows_activity .= cc_diag_info('Student attempts recorded', (string)$attempt_count);
        }
    }
} else {
    $rows_activity .= cc_diag_info('No cmid provided', 'Activity-level checks skipped. Append ?cmid=<cmid> to the URL to inspect a specific activity instance.');
}

// ── SECTION 4: AMD build files ────────────────────────────────────────────────

$rows_amd = '';

$build_dir = __DIR__ . '/amd/build/';

$amd_files = [
    'builder.js'              => 'Content builder (main generation UI)',
    'builder.min.js'          => 'Content builder minified',
    'player5.js'              => 'Content player v5',
    'player5.min.js'          => 'Content player v5 minified',
    'generator.js'            => 'Content generator',
    'generator.min.js'        => 'Content generator minified',
    'prompts.js'              => 'Prompts registry',
    'prompts.min.js'          => 'Prompts registry minified',
    'planner.js'              => 'Smart delivery planner',
    'planner.min.js'          => 'Smart delivery planner minified',
    'manifest.builder.js'     => 'Manifest builder',
    'manifest.builder.min.js' => 'Manifest builder minified',
    'cc-state.js'             => 'State manager',
    'cc-state.min.js'         => 'State manager minified',
];

foreach ($amd_files as $file => $desc) {
    $path = $build_dir . $file;
    if (file_exists($path)) {
        $size_kb = round(filesize($path) / 1024, 1);
        $rows_amd .= cc_diag_pass($file, $desc . ' — ' . $size_kb . ' KB');
    } else {
        $rows_amd .= cc_diag_fail($file, $desc . ' — MISSING from amd/build/. AMD build may be incomplete.');
        $overall_pass = false;
    }
}

// Verify builder.min.js is AMD define() format (not ES6 import/export)
$builder_min = $build_dir . 'builder.min.js';
if (file_exists($builder_min)) {
    $first_512 = file_get_contents($builder_min, false, null, 0, 512);
    if (strpos($first_512, 'define(') !== false) {
        $rows_amd .= cc_diag_pass('builder.min.js format', 'AMD define() format confirmed — correct for Moodle 4.x');
    } elseif (strpos($first_512, 'import ') !== false || strpos($first_512, 'export ') !== false) {
        $rows_amd .= cc_diag_fail('builder.min.js format', 'ES6 import/export detected — Moodle 4.x will crash. AMD build was not run correctly.');
        $overall_pass = false;
    } else {
        $rows_amd .= cc_diag_info('builder.min.js format', 'Could not confirm AMD define() in first 512 bytes — manual check recommended');
    }
}

// Verify player5.min.js is AMD define() format
$player_min = $build_dir . 'player5.min.js';
if (file_exists($player_min)) {
    $first_512 = file_get_contents($player_min, false, null, 0, 512);
    if (strpos($first_512, 'define(') !== false) {
        $rows_amd .= cc_diag_pass('player5.min.js format', 'AMD define() format confirmed — correct for Moodle 4.x');
    } elseif (strpos($first_512, 'import ') !== false || strpos($first_512, 'export ') !== false) {
        $rows_amd .= cc_diag_fail('player5.min.js format', 'ES6 import/export detected — Moodle 4.x will crash. AMD build was not run correctly.');
        $overall_pass = false;
    } else {
        $rows_amd .= cc_diag_info('player5.min.js format', 'Could not confirm AMD define() in first 512 bytes — manual check recommended');
    }
}

// ── AMD JavaScript cache advisory ─────────────────────────────────────────────
// Always shown — this is the #1 cause of additional-language content appearing in English
// even after installing the correct plugin version.
$rows_amd .= cc_diag_info(
    'AMD JavaScript cache advisory',
    'After every plugin install or update, you MUST purge ALL Moodle caches before regenerating content. '
  . 'Without this step, Moodle serves the OLD compiled JavaScript from its internal cache — the new language fixes do NOT run. '
  . 'If additional-language content appears in English even after installing v12.76, this is almost certainly the cause. '
  . 'ACTION REQUIRED: Site Admin → Development → Purge all caches → then regenerate.'
);

// ── SECTION 5: Source-to-build sync check ────────────────────────────────────

$rows_sync = '';
$src_dir = __DIR__ . '/amd/src/';

$sync_pairs = [
    'builder'           => 'builder.js',
    'player5'           => 'player5.js',
    'generator'         => 'generator.js',
    'prompts'           => 'prompts.js',
    'planner'           => 'planner.js',
    'manifest.builder'  => 'manifest.builder.js',
    'cc-state'          => 'cc-state.js',
];

foreach ($sync_pairs as $base => $filename) {
    $src  = $src_dir  . $filename;
    $build = $build_dir . $filename;
    if (!file_exists($src)) {
        $rows_sync .= cc_diag_info('src/' . $filename, 'Source file not found — skipping sync check');
        continue;
    }
    if (!file_exists($build)) {
        $rows_sync .= cc_diag_fail('src → build/' . $filename, 'Build file missing — source exists but build was not run');
        $overall_pass = false;
        continue;
    }
    $src_mtime   = filemtime($src);
    $build_mtime = filemtime($build);
    $diff = $src_mtime - $build_mtime;
    if ($diff <= 0) {
        $rows_sync .= cc_diag_pass('src → build/' . $filename, 'Build is current (build mtime ≥ src mtime)');
    } elseif ($diff < 3600) {
        $rows_sync .= cc_diag_info(
            'src → build/' . $filename,
            'src is ' . $diff . 's newer than build — may be stale. Run grunt to rebuild.'
        );
    } else {
        $rows_sync .= cc_diag_fail(
            'src → build/' . $filename,
            'src is ' . round($diff / 3600, 1) . 'h newer than build — STALE BUILD. '
          . 'Moodle loads from amd/build/. Run grunt to sync.'
        );
        $overall_pass = false;
    }
}

// ── SECTION 6: Additional language content checks ─────────────────────────────

// Script-detection map: language code prefix → [script name, PCRE Unicode pattern]
// Allows definitive language verification for non-Latin scripts without HTTP requests.
$cc_script_map = [
    'hi' => ['Devanagari', '/[\x{0900}-\x{097F}]/u'],
    'pa' => ['Gurmukhi',   '/[\x{0A00}-\x{0A7F}]/u'],
    'bn' => ['Bengali',    '/[\x{0980}-\x{09FF}]/u'],
    'gu' => ['Gujarati',   '/[\x{0A80}-\x{0AFF}]/u'],
    'ta' => ['Tamil',      '/[\x{0B80}-\x{0BFF}]/u'],
    'te' => ['Telugu',     '/[\x{0C00}-\x{0C7F}]/u'],
    'kn' => ['Kannada',    '/[\x{0C80}-\x{0CFF}]/u'],
    'ml' => ['Malayalam',  '/[\x{0D00}-\x{0D7F}]/u'],
    'ar' => ['Arabic',     '/[\x{0600}-\x{06FF}]/u'],
    'ur' => ['Arabic',     '/[\x{0600}-\x{06FF}]/u'],
    'he' => ['Hebrew',     '/[\x{0590}-\x{05FF}]/u'],
    'ru' => ['Cyrillic',   '/[\x{0400}-\x{04FF}]/u'],
    'uk' => ['Cyrillic',   '/[\x{0400}-\x{04FF}]/u'],
    'th' => ['Thai',       '/[\x{0E00}-\x{0E7F}]/u'],
    'zh' => ['CJK',        '/[\x{4E00}-\x{9FFF}]/u'],
    'ja' => ['Japanese',   '/[\x{3040}-\x{30FF}\x{4E00}-\x{9FFF}]/u'],
    'ko' => ['Hangul',     '/[\x{AC00}-\x{D7AF}]/u'],
];

/**
 * Collect up to $max_chars of card text from a topics array.
 * Samples text from all sections/cards (not just first) for a more reliable check.
 */
function cc_diag_collect_card_text(array $topics, int $max_chars = 800): string {
    $buf = '';
    foreach ($topics as $topic) {
        foreach (($topic['sections'] ?? []) as $section) {
            foreach (($section['cards'] ?? []) as $card) {
                $text = $card['heading'] ?? ($card['bodyText'] ?? ($card['sceneParts'][0]['text'] ?? ''));
                if (!empty($text) && strlen(trim($text)) > 10) {
                    $buf .= ' ' . trim($text);
                    if (mb_strlen($buf) >= $max_chars) return mb_substr($buf, 0, $max_chars);
                }
            }
        }
    }
    return trim($buf);
}

$rows_lang = '';

if ($cmid <= 0) {
    $rows_lang .= cc_diag_info('No cmid provided', 'Additional-language checks require a specific activity. Append ?cmid=<cmid> to the URL.');
} elseif ($cc === null) {
    $rows_lang .= cc_diag_info('Activity not loaded', 'Additional-language checks skipped — activity could not be loaded (see Section 3).');
} elseif (empty($cc->manifestjson)) {
    $rows_lang .= cc_diag_info('No manifest', 'Content has not been generated yet. Generate content first, then re-run diagnostics.');
} else {
    $manifest_check = json_decode($cc->manifestjson, true);
    if (!is_array($manifest_check)) {
        $rows_lang .= cc_diag_fail('Manifest parse', 'Manifest JSON is invalid — cannot inspect additional-language data.');
        $overall_pass = false;
    } else {
        $ml_entries = $manifest_check['multiLanguage'] ?? [];

        if (empty($ml_entries) || !is_array($ml_entries)) {
            $rows_lang .= cc_diag_info(
                'Additional languages configured',
                'None found in manifest. No additional languages were selected when this content was generated. '
              . 'To add languages: open the activity in edit mode → Voice Settings → select language checkboxes → regenerate.'
            );
        } else {
            $rows_lang .= cc_diag_pass(
                'Additional languages configured',
                count($ml_entries) . ' language(s) found: '
              . implode(', ', array_map(fn($ml) => ($ml['label'] ?? $ml['code'] ?? '?') . ' (' . ($ml['code'] ?? '?') . ')', $ml_entries))
            );

            // Collect a broad sample of primary-language card text for comparison.
            // Uses all sections/cards up to 800 chars so similarity is representative.
            $primary_topics = $manifest_check['topics'] ?? [];
            $primary_sample = cc_diag_collect_card_text($primary_topics, 800);

            foreach ($ml_entries as $ml) {
                $lang_code  = $ml['code']  ?? '?';
                $lang_label = $ml['label'] ?? $lang_code;
                $ml_topics  = $ml['topics'] ?? [];

                // Determine if this language uses a non-Latin script we can verify
                $lang_prefix = strtolower(explode('-', $lang_code)[0]);
                $script_info = $cc_script_map[$lang_prefix] ?? null;

                if (empty($ml_topics)) {
                    $rows_lang .= cc_diag_fail(
                        $lang_label . ' — topics',
                        'NO topics stored for this language. The additional-language generation likely failed or was interrupted. '
                      . 'Regenerate content with this language selected.'
                    );
                    $overall_pass = false;
                    continue;
                }

                // ── Count sections, cards, and collect voiceover metadata ────────────
                $section_count = 0;
                $card_count    = 0;
                $vo_pregenned  = 0;
                $vo_http       = 0;
                $vo_missing    = 0;

                // Per-section voiceover verification counters
                $vo_url_lang_confirmed = 0; // sectionid in filename contains langCode
                $vo_url_lang_unclear   = 0; // sectionid is UUID/numeric — cannot confirm
                $vo_schema_current     = 0; // sections with voiceoverSchemaVersion = '12.32'
                $vo_schema_old         = 0; // sections with old/missing schema (that have audio)
                $vo_hash_present       = 0; // sections with voiceoverTextHash stored
                $vo_hash_missing       = 0; // sections missing voiceoverTextHash (that have audio)
                $vo_pregenned_schema   = 0; // pregenerated sentinels with current schema

                foreach ($ml_topics as $mt) {
                    foreach (($mt['sections'] ?? []) as $ms) {
                        $section_count++;
                        $cards = $ms['cards'] ?? [];
                        $card_count += count($cards);

                        $ms_url    = $ms['voiceoverUrl']           ?? '';
                        $ms_schema = $ms['voiceoverSchemaVersion'] ?? '';
                        $ms_hash   = $ms['voiceoverTextHash']      ?? '';
                        $has_audio = ($ms_url === 'pregenerated' || (str_starts_with($ms_url, 'http')));

                        if ($ms_url === 'pregenerated') {
                            $vo_pregenned++;
                            if ($ms_schema === '12.32') $vo_pregenned_schema++;
                        } elseif (!empty($ms_url) && str_starts_with($ms_url, 'http')) {
                            $vo_http++;

                            // ── URL sectionid language check ──────────────────────────────────
                            // Filename pattern: voiceover_{sectionid}.{ext}
                            // Multi-language sections often use sectionid = mlsec_{langCode}_{n}
                            // so the langCode is embedded in the filename — definitive proof the
                            // file was stored for this language.
                            $url_file = basename((string)parse_url($ms_url, PHP_URL_PATH));
                            if (preg_match('/^voiceover_(.+)\.(ogg|mp3|wav|aac)$/i', $url_file, $mf)) {
                                $sid_raw  = $mf[1];
                                // Normalise dashes to underscores for comparison
                                $lc_norm  = str_replace('-', '_', strtolower($lang_code));
                                $sid_norm = str_replace('-', '_', strtolower($sid_raw));
                                if (str_contains($sid_norm, $lc_norm) || str_contains($sid_raw, $lang_code)) {
                                    $vo_url_lang_confirmed++;
                                } else {
                                    $vo_url_lang_unclear++;
                                }
                            }
                        } else {
                            $vo_missing++;
                        }

                        // ── Synthesis fingerprint checks (schema version + text hash) ─────
                        // voiceoverSchemaVersion = '12.32' means audio was synthesised at the
                        // current text-truncation schema (20 000 chars, correct TTS pipeline).
                        // voiceoverTextHash = DJB2a hash of buildVoiceoverText() at synthesis
                        // time — proves the content text was fingerprinted when audio was made.
                        if ($has_audio) {
                            if ($ms_schema === '12.32') $vo_schema_current++;
                            else                        $vo_schema_old++;
                            if (!empty($ms_hash))       $vo_hash_present++;
                            else                        $vo_hash_missing++;
                        }
                    }
                }

                // Collect card text sample across ALL sections (up to 800 chars)
                $ml_sample = cc_diag_collect_card_text($ml_topics, 800);

                // ── Check 1: Section/card count ───────────────────────────────────────
                if ($section_count === 0 || $card_count === 0) {
                    $rows_lang .= cc_diag_fail(
                        $lang_label . ' — content',
                        'Topics exist (' . count($ml_topics) . ') but have NO sections or cards. '
                      . 'Translation generation failed mid-way. Regenerate content with this language selected.'
                    );
                    $overall_pass = false;
                    $content_is_english = true;
                } else {
                    $rows_lang .= cc_diag_pass(
                        $lang_label . ' — content',
                        count($ml_topics) . ' topic(s), ' . $section_count . ' section(s), ' . $card_count . ' card(s) stored.'
                    );
                    $content_is_english = false;
                }

                // ── Check 2: Translation / language quality ───────────────────────────
                // Method A — Unicode script detection (definitive for non-Latin scripts)
                $script_fail   = false;
                $script_tested = false;
                if ($script_info !== null && !empty($ml_sample)) {
                    $script_tested  = true;
                    [$script_name, $script_pattern] = $script_info;
                    $has_script_chars = (bool)preg_match($script_pattern, $ml_sample);
                    if (!$has_script_chars) {
                        $script_fail = true;
                        $content_is_english = true;
                        $rows_lang .= cc_diag_fail(
                            $lang_label . ' — translation quality',
                            'NO ' . $script_name . ' characters found in any stored card text. '
                          . $lang_label . ' uses the ' . $script_name . ' script — if the content were correctly translated, '
                          . $script_name . ' characters would be present. '
                          . 'The stored text is in a different script (likely English/Latin). '
                          . 'Root cause: AI generated English content instead of ' . $lang_label . '. '
                          . 'MOST LIKELY CAUSE: Moodle\'s AMD JavaScript cache was not purged after installing the plugin. '
                          . 'Even if the PHP plugin shows v12.76, Moodle runs old JavaScript from its compiled cache until caches are cleared. '
                          . 'HOW TO FIX: (1) Site Admin → Development → Purge all caches — do this FIRST, even if you already installed v12.76. '
                          . '(2) Open this activity in edit mode. '
                          . '(3) Click Generate Content to regenerate — content will now be in ' . $lang_label . '.'
                        );
                        $overall_pass = false;
                    } else {
                        // Script chars found — now also check similarity to catch mixed content
                        $similarity = 0;
                        if (!empty($primary_sample)) {
                            similar_text(strtolower($primary_sample), strtolower($ml_sample), $similarity);
                        }
                        $rows_lang .= cc_diag_pass(
                            $lang_label . ' — translation quality',
                            $script_name . ' script characters confirmed in stored card text — content is in ' . $lang_label . '. '
                          . (!empty($primary_sample) ? '(' . round($similarity) . '% character similarity to primary language — expected low for non-Latin script)' : '')
                        );
                    }
                }

                // Method B — Text similarity (catches Latin-script languages and supplements script check)
                if (!$script_fail && !empty($primary_sample) && !empty($ml_sample)) {
                    $similarity = 0;
                    similar_text(strtolower($primary_sample), strtolower($ml_sample), $similarity);
                    if ($similarity > 85) {
                        $content_is_english = true;
                        if (!$script_tested) {
                            // Only emit the similarity FAIL if script detection didn't already report
                            $rows_lang .= cc_diag_fail(
                                $lang_label . ' — translation quality',
                                'Card text is ' . round($similarity) . '% identical to the primary language across '
                              . mb_strlen($ml_sample) . ' characters sampled. '
                              . 'Translation failed — AI generated English content instead of ' . $lang_label . '. '
                              . 'MOST LIKELY CAUSE: Moodle\'s AMD JavaScript cache was not purged after installing the plugin. '
                              . 'Even if the PHP plugin shows v12.76, Moodle runs old JavaScript from its compiled cache until caches are cleared. '
                              . 'HOW TO FIX: (1) Site Admin → Development → Purge all caches — do this FIRST, even if you already installed v12.76. '
                              . '(2) Open this activity in edit mode. '
                              . '(3) Click Generate Content to regenerate — content will now be in ' . $lang_label . '.'
                            );
                            $overall_pass = false;
                        }
                    } elseif ($similarity > 60 && !$script_tested) {
                        $rows_lang .= cc_diag_info(
                            $lang_label . ' — translation quality',
                            'Card text is ' . round($similarity) . '% similar to primary language — partially translated. '
                          . 'Some slides may still display in English. Regenerate to rebuild with full translation.'
                        );
                    } elseif (!$script_tested) {
                        $rows_lang .= cc_diag_pass(
                            $lang_label . ' — translation quality',
                            'Card text differs from primary language (' . round($similarity) . '% similarity across '
                          . mb_strlen($ml_sample) . ' characters) — translation appears correct.'
                        );
                    }
                } elseif (!$script_tested && $section_count > 0 && empty($ml_sample)) {
                    $rows_lang .= cc_diag_info(
                        $lang_label . ' — translation quality',
                        'Could not extract card text sample for comparison — manual review recommended.'
                    );
                }

                // ── Check 3: Voiceover language accuracy ──────────────────────────────
                //
                // HONEST PROOF MODEL — three layers of evidence, in decreasing strength:
                //
                // Layer 1 — Content propagation (DEFINITIVE FAIL):
                //   TTS is fed the stored card text. If that text is English, the audio is
                //   English — no matter what language/voice code was sent to the API.
                //   content_is_english = true → FAIL (cannot be overridden by URL checks).
                //
                // Layer 2 — URL sectionid language (DEFINITIVE PASS when present):
                //   File stored as: voiceover_{sectionid}.ogg
                //   Multi-language sections use sectionid = mlsec_{langCode}_{n}
                //   (e.g. mlsec_hi-IN_2). If langCode appears in the filename, the file was
                //   physically stored for this language — no inference needed.
                //
                // Layer 3 — Synthesis fingerprint (STRONG SIGNAL):
                //   voiceoverSchemaVersion = '12.32': audio was made at current TTS schema.
                //   voiceoverTextHash = DJB2a hash of buildVoiceoverText() at synthesis time:
                //   proves content was fingerprinted when audio was generated. Combined with a
                //   passing content language check, this gives HIGH confidence.
                //
                // Layer 4 — Inconclusive:
                //   Old/missing schema or hash with non-language sectionid = WARN.
                //   A URL existing alone is NOT evidence of correct-language audio.

                $total_vo     = $vo_pregenned + $vo_http + $vo_missing;
                $total_with_audio = $vo_pregenned + $vo_http;
                $audio_summary = $total_with_audio . '/' . $total_vo . ' section(s) have audio';

                // ── FAIL: content is English → audio is English ──────────────────────────
                if ($content_is_english && $total_vo > 0) {
                    $rows_lang .= cc_diag_fail(
                        $lang_label . ' — voiceover [FAIL: content is English]',
                        $audio_summary . ', but the stored card text is in English '
                      . '(see translation quality check above). '
                      . 'TTS received English words — audio plays in English regardless of the voice/language code used. '
                      . 'A stored URL proves only that audio WAS synthesised; it does NOT prove audio is in ' . $lang_label . '. '
                      . 'MOST LIKELY CAUSE: Moodle\'s AMD JavaScript cache was not purged after installing the plugin. '
                      . 'HOW TO FIX: (1) Site Admin → Development → Purge all caches — do this FIRST. '
                      . '(2) Open this activity in edit mode. '
                      . '(3) Regenerate — card text will be in ' . $lang_label . ' and audio will be re-synthesised in ' . $lang_label . ' automatically.'
                    );
                    $overall_pass = false;

                // ── NO AUDIO at all ──────────────────────────────────────────────────────
                } elseif ($total_vo === 0) {
                    $rows_lang .= cc_diag_info(
                        $lang_label . ' — voiceover',
                        'No sections with voiceover data found for this language.'
                    );

                // ── ALL MISSING — pre-generation failed ─────────────────────────────────
                } elseif ($vo_missing > 0 && $total_with_audio === 0) {
                    $rows_lang .= cc_diag_fail(
                        $lang_label . ' — voiceover [FAIL: no audio generated]',
                        'ALL ' . $total_vo . ' section(s) have no voiceover URL — '
                      . 'pre-generation failed entirely. Voiceovers will be synthesised on-demand '
                      . '(slower, and language correctness depends on which plugin version generated the content).'
                    );
                    $overall_pass = false;

                // ── AUDIO EXISTS — perform language verification ─────────────────────────
                } else {

                    // Build evidence string
                    $evidence = [];
                    $evidence_fails = [];

                    // Layer 2: URL sectionid language check
                    if ($vo_http > 0) {
                        if ($vo_url_lang_confirmed > 0) {
                            $evidence[] = 'URL FILENAME CONFIRMS LANGUAGE: '
                                . $vo_url_lang_confirmed . ' HTTPS URL(s) contain "' . $lang_code
                                . '" in the filename (e.g. voiceover_mlsec_' . $lang_code . '_0.ogg). '
                                . 'This is definitive proof those files were stored for ' . $lang_label . '.';
                        }
                        if ($vo_url_lang_unclear > 0) {
                            $evidence[] = 'URL FILENAME UNCLEAR: ' . $vo_url_lang_unclear
                                . ' HTTPS URL(s) use UUID/numeric sectionids — language cannot be '
                                . 'confirmed from filename alone. Additional evidence below.';
                        }
                    }
                    if ($vo_pregenned > 0) {
                        $evidence[] = $vo_pregenned . ' section(s) use the file-store sentinel '
                            . '("pregenerated") — audio is cached server-side; filename-based '
                            . 'language check is not applicable.';
                    }

                    // Layer 3: Synthesis fingerprint
                    $total_audio_sections = $total_with_audio;
                    if ($vo_schema_current > 0 && $vo_hash_present > 0) {
                        $evidence[] = 'SYNTHESIS FINGERPRINT OK: '
                            . $vo_schema_current . '/' . $total_audio_sections . ' section(s) have '
                            . 'voiceoverSchemaVersion=\'12.32\' (current) and '
                            . $vo_hash_present . ' have voiceoverTextHash stored. '
                            . 'Fingerprinting proves audio was synthesised from the content that was '
                            . 'current at generation time.';
                    }
                    if ($vo_schema_old > 0) {
                        $evidence_fails[] = 'OLD/MISSING SCHEMA: ' . $vo_schema_old
                            . ' section(s) have outdated or missing voiceoverSchemaVersion '
                            . '(expected \'12.32\'). Audio may have been synthesised before the '
                            . 'current TTS text pipeline was in place — exact language cannot be verified.';
                    }
                    if ($vo_hash_missing > 0) {
                        $evidence_fails[] = 'NO TEXT FINGERPRINT: ' . $vo_hash_missing
                            . ' section(s) have no voiceoverTextHash. Audio was synthesised before '
                            . 'content fingerprinting was introduced (pre-v9.98). '
                            . 'Cannot verify content-to-audio consistency.';
                    }

                    // Determine overall confidence
                    $url_lang_all_confirmed  = ($vo_http > 0 && $vo_url_lang_confirmed >= $vo_http && $vo_url_lang_unclear === 0);
                    $fingerprint_strong      = ($vo_schema_current > 0 && $vo_hash_present > 0 && $vo_schema_old === 0 && $vo_hash_missing === 0);
                    $content_lang_definitive = ($script_tested && !$script_fail); // Unicode script detection passed
                    $fingerprint_weak        = ($vo_schema_old > 0 || $vo_hash_missing > 0);

                    $evidence_text = implode(' | ', array_merge($evidence, $evidence_fails));
                    $missing_note = ($vo_missing > 0)
                        ? $vo_missing . ' section(s) have no URL (on-demand synthesis). ' : '';

                    if ($url_lang_all_confirmed && $content_lang_definitive) {
                        // DEFINITIVE PASS: URL filenames confirm language + script detection confirmed text
                        $rows_lang .= cc_diag_pass(
                            $lang_label . ' — voiceover [CONFIRMED]',
                            $missing_note . $evidence_text
                        );
                    } elseif ($url_lang_all_confirmed) {
                        // STRONG PASS: URL filenames confirm language (content check was similarity-based)
                        $rows_lang .= cc_diag_pass(
                            $lang_label . ' — voiceover [HIGH CONFIDENCE]',
                            $missing_note . $evidence_text
                        );
                    } elseif ($fingerprint_strong && $content_lang_definitive) {
                        // STRONG PASS: content script-confirmed + full fingerprint (schema+hash current)
                        $rows_lang .= cc_diag_pass(
                            $lang_label . ' — voiceover [HIGH CONFIDENCE — fingerprinted]',
                            $missing_note . $evidence_text
                            . ' Content was confirmed in ' . ($script_info[0] ?? $lang_label) . ' script '
                            . 'at synthesis time → audio is in ' . $lang_label . '.'
                        );
                    } elseif (!$fingerprint_weak && !$content_is_english) {
                        // MEDIUM PASS: schema + hash ok, but URL unclear and content via similarity only
                        $rows_lang .= cc_diag_info(
                            $lang_label . ' — voiceover [MEDIUM CONFIDENCE — manual playback recommended]',
                            $missing_note . $evidence_text
                            . ' Content language check used text similarity (not script detection) — '
                            . 'cannot definitively confirm content was in ' . $lang_label . ' at synthesis time. '
                            . 'Recommend: play the audio in a browser to verify language.'
                        );
                    } else {
                        // LOW CONFIDENCE: old schema or missing hash — cannot verify
                        $rows_lang .= cc_diag_info(
                            $lang_label . ' — voiceover [WARN — low confidence, cannot verify]',
                            $missing_note . $evidence_text
                            . ' Recommendation: regenerate content to produce fresh audio with '
                            . 'current fingerprinting (voiceoverSchemaVersion=\'12.32\', '
                            . 'voiceoverTextHash). After regeneration with v12.71+, '
                            . 'this check will give a definitive result.'
                        );
                    }
                }
            }

            // Summary: language switcher availability
            $ml_with_content = 0;
            foreach ($ml_entries as $ml) {
                $mlt = $ml['topics'] ?? [];
                $has_cards = false;
                foreach ($mlt as $mt) {
                    foreach (($mt['sections'] ?? []) as $ms) {
                        if (!empty($ms['cards'])) { $has_cards = true; break 2; }
                    }
                }
                if ($has_cards) $ml_with_content++;
            }
            if ($ml_with_content < count($ml_entries)) {
                $rows_lang .= cc_diag_fail(
                    'Language switcher availability',
                    'Only ' . $ml_with_content . ' of ' . count($ml_entries) . ' language(s) have populated content. '
                  . 'The student language switcher pill bar only appears when at least one additional language has topics with cards. '
                  . 'Regenerate content to populate missing languages.'
                );
                $overall_pass = false;
            } else {
                $rows_lang .= cc_diag_pass(
                    'Language switcher availability',
                    'All ' . $ml_with_content . ' additional language(s) have content — the student language switcher pill bar will be shown.'
                );
            }
        }
    }
}

// ── SECTION 7: "Start Learning" readiness — per-section voiceover state ───────
// Diagnoses: teacher clicks "Start Learning" but content doesn't open; works after refresh.
// Root cause (v12.89 FIX-CC-START-LEARNING): _teacherNeedsRegen deleted valid HTTPS URLs
// whenever voiceoverStatus != 'complete', triggering async TTS regen and showing the
// "Preparing audio…" waiting screen instead of the topics grid. After reload, the
// regenerated audio was saved with voiceoverStatus='complete' so the screen vanished.

$rows_startlearning = '';
$CURRENT_VO_SCHEMA = '12.32'; // VOICEOVER_SCHEMA_VERSION from cc-state.js

if ($cmid <= 0) {
    $rows_startlearning .= cc_diag_info('No cmid provided', 'Append ?cmid=<cmid> to inspect a specific activity.');
} elseif ($cc === null) {
    $rows_startlearning .= cc_diag_info('Activity not loaded', 'Skipped — activity could not be loaded (see Section 3).');
} elseif (empty($cc->manifestjson)) {
    $rows_startlearning .= cc_diag_info('No manifest', 'Content has not been generated yet. Generate content first, then re-run diagnostics.');
} else {
    $sl_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($sl_manifest)) {
        $rows_startlearning .= cc_diag_fail('Manifest parse', 'Invalid JSON — cannot run Start Learning checks.');
        $overall_pass = false;
    } else {
        // ── Check 1: manifest.voiceoversComplete flag ────────────────────────────────
        $sl_voc = $sl_manifest['voiceoversComplete'] ?? null;
        if ($sl_voc === true) {
            $rows_startlearning .= cc_diag_pass(
                'manifest.voiceoversComplete',
                'true — player will show topics grid immediately on first load.'
            );
        } elseif ($sl_voc === false) {
            $rows_startlearning .= cc_diag_fail(
                'manifest.voiceoversComplete',
                'false — player shows "Preparing audio…" waiting screen on every load. '
              . 'Audio pre-generation did not complete when the manifest was last saved. '
              . 'FIX: open the activity in teacher edit mode and wait for all audio to finish; '
              . 'then reload — the flag will be set to true and students will see the topics grid immediately.'
            );
            $overall_pass = false;
        } else {
            $rows_startlearning .= cc_diag_info(
                'manifest.voiceoversComplete',
                'Not set — pre-v11 manifest or flag not written. Player evaluates per-section state on load.'
            );
        }

        // ── Scan primary-language sections ───────────────────────────────────────────
        $sl_topics = $sl_manifest['topics'] ?? [];
        $sl_total          = 0;
        $sl_has_https      = 0;
        $sl_has_pregenned  = 0;
        $sl_no_url         = 0;
        $sl_url_no_status  = 0;   // HTTPS URL but voiceoverStatus != 'complete' → the "before reload" state
        $sl_url_complete   = 0;   // HTTPS URL AND voiceoverStatus = 'complete'  → the "after reload" state
        $sl_stale_schema   = 0;   // voiceoverSchemaVersion != CURRENT → triggers regen for teachers
        $sl_no_hash        = 0;   // missing voiceoverTextHash → triggers regen for teachers
        $sl_would_regen    = 0;   // sections that would cause preloadOne() to regenerate for a teacher

        foreach ($sl_topics as $topic) {
            foreach (($topic['sections'] ?? []) as $section) {
                $sl_total++;
                $url    = $section['voiceoverUrl']           ?? '';
                $status = $section['voiceoverStatus']        ?? '';
                $schema = $section['voiceoverSchemaVersion'] ?? '';
                $hash   = $section['voiceoverTextHash']      ?? '';

                $has_https     = (is_string($url) && strpos($url, 'http') === 0);
                $has_pregenned = ($url === 'pregenerated');

                if ($has_https) {
                    $sl_has_https++;
                    if ($status === 'complete') {
                        $sl_url_complete++;
                    } else {
                        $sl_url_no_status++; // ← exact pre-refresh state that triggered the bug
                    }
                    // Staleness check mirrors player5.js preloadOne() for teacher view
                    $schema_stale  = ($schema !== $CURRENT_VO_SCHEMA);
                    $no_hash       = empty($hash);
                    if ($schema_stale) $sl_stale_schema++;
                    if ($no_hash)      $sl_no_hash++;
                    if ($schema_stale || $no_hash) $sl_would_regen++;
                } elseif ($has_pregenned) {
                    $sl_has_pregenned++;
                } else {
                    $sl_no_url++;
                }
            }
        }

        if ($sl_total === 0) {
            $rows_startlearning .= cc_diag_info('Primary sections', 'No sections found. Generate content first.');
        } else {
            $rows_startlearning .= cc_diag_info(
                'Primary sections total',
                $sl_total . ' section(s) across ' . count($sl_topics) . ' topic(s) | '
              . 'HTTPS URL: ' . $sl_has_https . ' | Pregenerated: ' . $sl_has_pregenned . ' | No URL: ' . $sl_no_url
            );

            // ── Check 2: HTTPS URL present but voiceoverStatus != 'complete' ─────────
            // This is the exact signature of the "works after refresh" bug.
            if ($sl_url_no_status > 0) {
                $rows_startlearning .= cc_diag_fail(
                    'Sections: URL present, status ≠ complete',
                    $sl_url_no_status . '/' . $sl_total . ' section(s) have an HTTPS voiceover URL but '
                  . 'voiceoverStatus is NOT "complete". '
                  . 'This is the "before refresh" state that caused the Start Learning bug. '
                  . 'With plugin v12.89+: these URLs are trusted — the player will show the topics grid. '
                  . 'With plugin < v12.89: _teacherNeedsRegen deleted these URLs, triggering regen, '
                  . 'showing "Preparing audio…" — disappears after reload once voiceoverStatus is written. '
                  . 'ACTION: Ensure plugin v12.89+ is installed AND Moodle caches are purged so the '
                  . 'fixed player5.js is active. No content regeneration is needed.'
                );
                // Not flagged as overall_pass=false — v12.89 fixes this without regen
            } else {
                $rows_startlearning .= cc_diag_pass(
                    'Sections: URL present, status ≠ complete',
                    'None — '
                  . ($sl_url_complete > 0 ? $sl_url_complete . ' HTTPS-URL section(s) have voiceoverStatus="complete". ' : '')
                  . ($sl_has_pregenned > 0 ? $sl_has_pregenned . ' section(s) use pregenerated sentinel. ' : '')
                  . 'No pre-refresh state detected.'
                );
            }

            // ── Check 3: Sections with no URL at all ─────────────────────────────────
            if ($sl_no_url > 0) {
                $rows_startlearning .= cc_diag_fail(
                    'Sections with no voiceover URL',
                    $sl_no_url . '/' . $sl_total . ' section(s) have no voiceover URL and no pregenerated sentinel. '
                  . 'These trigger TTS generation on page load — both teachers and students see '
                  . '"Preparing audio…" waiting screen until generation finishes. '
                  . 'FIX: Open the activity in teacher/edit mode and wait for all audio to complete, '
                  . 'then reload for students.'
                );
                $overall_pass = false;
            } else {
                $rows_startlearning .= cc_diag_pass(
                    'Sections with no voiceover URL',
                    'None — all ' . $sl_total . ' section(s) have a URL or pregenerated sentinel.'
                );
            }

            // ── Check 4: Stale schema / missing hash (teacher regen trigger) ──────────
            if ($sl_would_regen > 0) {
                $rows_startlearning .= cc_diag_info(
                    'Sections that trigger teacher audio regen',
                    $sl_would_regen . '/' . $sl_total . ' section(s) would cause preloadOne() to regenerate '
                  . 'audio for a TEACHER (stale schema or missing hash). '
                  . ($sl_stale_schema > 0 ? 'Stale voiceoverSchemaVersion (need "' . $CURRENT_VO_SCHEMA . '"): ' . $sl_stale_schema . '. ' : '')
                  . ($sl_no_hash > 0 ? 'Missing voiceoverTextHash: ' . $sl_no_hash . '. ' : '')
                  . 'Students are NOT affected (they skip regen). Teachers see a brief waiting screen. '
                  . 'FIX: Open in teacher edit mode — regen fires automatically and writes fingerprints.'
                );
            } else {
                $rows_startlearning .= cc_diag_pass(
                    'Sections that trigger teacher audio regen',
                    'None — all sections with audio have schema="' . $CURRENT_VO_SCHEMA . '" and voiceoverTextHash. '
                  . 'Teachers will see the topics grid immediately, without a regen wait.'
                );
            }

            // ── Overall Start Learning verdict ────────────────────────────────────────
            if ($sl_no_url === 0 && $sl_voc !== false && $sl_would_regen === 0) {
                $rows_startlearning .= cc_diag_pass(
                    'Start Learning verdict',
                    'Audio is fully ready. Both teachers and students should see the topics grid immediately on first load.'
                );
            } elseif ($sl_no_url > 0) {
                $rows_startlearning .= cc_diag_fail(
                    'Start Learning verdict',
                    $sl_no_url . ' section(s) need audio generation. '
                  . '"Preparing audio…" screen will show until teacher triggers generation. '
                  . 'See "Sections with no voiceover URL" above.'
                );
            } elseif ($sl_url_no_status > 0) {
                $rows_startlearning .= cc_diag_info(
                    'Start Learning verdict',
                    $sl_url_no_status . ' section(s) are in the "URL present, status ≠ complete" state. '
                  . 'With v12.89+ and purged caches: OK — player trusts the URL. '
                  . 'With older plugin: Start Learning is delayed until refresh. '
                  . 'Confirm plugin version and cache purge status.'
                );
            } else {
                $rows_startlearning .= cc_diag_info(
                    'Start Learning verdict',
                    'Audio URLs present. If Start Learning is still delayed, check: '
                  . '(1) Plugin v12.89+ installed? (2) Moodle caches purged after install? '
                  . '(3) Teacher regen sections above?'
                );
            }
        }
    }
}

// ── SECTION 8: Audio generation loop — student voiceover stuck ────────────────
// Diagnoses: student clicks "Start Learning" and audio generating is stuck in a loop.
// Root causes: stale PHP TTS mutex lock files, sections missing audio, voiceoversComplete=false.

$rows_audioloop = '';

// ── Check 1: Stale PHP TTS mutex lock files ───────────────────────────────────
// ajax.php generate_voice uses flock(LOCK_EX|LOCK_NB) per section to prevent concurrent
// TTS requests. If PHP-FPM crashes mid-request the shutdown function may not run —
// the .lock file remains on disk. Every subsequent generate_voice call for that sectionid
// returns {pending:true} → JS retries in 10s → infinite loop.
$al_lock_dir       = sys_get_temp_dir();
$al_lock_files     = glob($al_lock_dir . '/cc_tts_*.lock');
$al_lock_files     = is_array($al_lock_files) ? $al_lock_files : [];
$al_lock_count     = count($al_lock_files);
$al_stale_locks    = [];
$al_active_locks   = [];
$al_stale_thresh   = 600; // 10 min — TTS max is 200 s, so >10 min = orphaned

foreach ($al_lock_files as $lf) {
    $age = time() - @filemtime($lf);
    if ($age > $al_stale_thresh) {
        $al_stale_locks[]  = basename($lf) . ' (' . round($age / 60) . ' min old)';
    } else {
        $al_active_locks[] = basename($lf) . ' (' . $age . ' s old)';
    }
}

if ($al_lock_count === 0) {
    $rows_audioloop .= cc_diag_pass(
        'PHP TTS mutex lock files',
        'None found in ' . $al_lock_dir . ' — no concurrent TTS blocking in effect.'
    );
} elseif (!empty($al_stale_locks)) {
    $rows_audioloop .= cc_diag_fail(
        'PHP TTS mutex lock files — STALE',
        count($al_stale_locks) . ' ORPHANED lock file(s) found (>10 min old): '
      . implode(', ', $al_stale_locks) . '. '
      . 'A PHP-FPM process crashed without releasing its lock. '
      . 'Every generate_voice call for the affected section(s) returns {pending:true} — '
      . 'the JS retries every 10 s forever, creating the infinite audio loop. '
      . 'FIX: SSH to the server and delete these files: '
      . 'rm ' . $al_lock_dir . '/cc_tts_*.lock'
      . (count($al_active_locks) > 0 ? ' (CAUTION: ' . count($al_active_locks) . ' active lock(s) also present — '
         . 'delete only the stale ones listed above, not the active ones)' : '')
      . '. Then reload the activity.'
    );
    $overall_pass = false;
} else {
    $rows_audioloop .= cc_diag_info(
        'PHP TTS mutex lock files — active',
        $al_lock_count . ' active lock file(s) found (all < 10 min old — TTS generation in progress). '
      . implode(', ', $al_active_locks) . '. '
      . 'If the loop persists beyond 15 minutes, re-run diag to see if they become stale.'
    );
}

// ── Check 2: Moodle voice cache count ────────────────────────────────────────
$al_cache_count = 0;
try {
    $al_cache_count = $DB->count_records('files', [
        'component' => 'mod_contentcreator',
        'filearea'  => 'voice_cache',
    ]);
} catch (Exception $e) {}
$rows_audioloop .= cc_diag_info(
    'TTS voice cache (Moodle file store)',
    $al_cache_count . ' cached audio file(s) in mod_contentcreator/voice_cache. '
  . 'Cached clips are served at zero credit cost for repeat text+voice+language combinations. '
  . 'Cache is site-wide — shared across all activities and courses.'
);

// ── Check 3: Per-activity section audio state ─────────────────────────────────
if ($cmid <= 0) {
    $rows_audioloop .= cc_diag_info('No cmid provided', 'Per-section audio loop checks require ?cmid=<cmid>.');
} elseif ($cc === null) {
    $rows_audioloop .= cc_diag_info('Activity not loaded', 'Skipped — see Section 3.');
} elseif (empty($cc->manifestjson)) {
    $rows_audioloop .= cc_diag_info('No manifest', 'Content not generated yet.');
} else {
    $al_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($al_manifest)) {
        $rows_audioloop .= cc_diag_fail('Manifest parse', 'Invalid JSON.');
    } else {
        $al_topics    = $al_manifest['topics'] ?? [];
        $al_voc       = $al_manifest['voiceoversComplete'] ?? null;
        $al_total     = 0;
        $al_complete  = 0; // HTTPS+status=complete, or pregenerated
        $al_https     = 0;
        $al_pregenned = 0;
        $al_no_url    = 0; // no URL, no pregenned → student loop risk
        $al_failed    = 0; // voiceoverStatus=failed
        $al_pending   = 0; // voiceoverStatus=pending with no URL
        $al_loop_risk = []; // section ids / titles that would cause an infinite student loop

        foreach ($al_topics as $ti => $topic) {
            foreach (($topic['sections'] ?? []) as $si => $section) {
                $al_total++;
                $url    = $section['voiceoverUrl']    ?? '';
                $status = $section['voiceoverStatus'] ?? '';
                $sid    = $section['id']              ?? ('topic' . ($ti + 1) . '_sec' . ($si + 1));
                $stitle = isset($section['heading']) ? ' "' . mb_substr($section['heading'], 0, 30) . '"' : '';

                $has_https     = (is_string($url) && strpos($url, 'http') === 0);
                $has_pregenned = ($url === 'pregenerated');

                if ($has_https) {
                    $al_https++;
                    if ($status === 'complete') $al_complete++;
                } elseif ($has_pregenned) {
                    $al_pregenned++;
                    $al_complete++;
                } else {
                    $al_no_url++;
                    // Student view: isVoiceoverGenerationPending() returns true for these.
                    // preloadVoiceovers() tries to generate them — students are blocked by
                    // the API gate → generates nothing → loop never resolves.
                    $al_loop_risk[] = $sid . $stitle;
                }

                if ($status === 'failed')  $al_failed++;
                if ($status === 'pending' && !$has_https && !$has_pregenned) $al_pending++;
            }
        }

        // voiceoversComplete flag
        if ($al_voc === true) {
            $rows_audioloop .= cc_diag_pass(
                'manifest.voiceoversComplete',
                'true — allVoiceoversComplete() returns true. Player skips the audio waiting loop.'
            );
        } elseif ($al_voc === false) {
            $rows_audioloop .= cc_diag_fail(
                'manifest.voiceoversComplete',
                'false — allVoiceoversComplete() returns false on every load. '
              . 'Player enters "Preparing audio…" waiting loop for students. '
              . 'Cause: audio pre-generation failed or was interrupted when manifest was last saved. '
              . 'FIX: Teacher opens the activity, triggers audio for any failed/missing sections, '
              . 'and waits for all sections to complete — the flag is written to true on success.'
            );
            $overall_pass = false;
        } else {
            $rows_audioloop .= cc_diag_info('manifest.voiceoversComplete', 'Not set — pre-v11 manifest. Player evaluates per-section state.');
        }

        // Section summary
        if ($al_total > 0) {
            $rows_audioloop .= cc_diag_info(
                'Section audio summary',
                'Total: ' . $al_total
              . ' | Ready (HTTPS+complete or pregenned): ' . $al_complete
              . ' | HTTPS (any status): ' . $al_https
              . ' | Pregenerated: ' . $al_pregenned
              . ' | No URL: ' . $al_no_url
              . ' | Status=pending (no URL): ' . $al_pending
              . ' | Status=failed: ' . $al_failed
            );
        }

        // Student loop risk — sections with no audio at all
        if (!empty($al_loop_risk)) {
            $show_ids = array_slice($al_loop_risk, 0, 8);
            $extra    = count($al_loop_risk) - count($show_ids);
            $rows_audioloop .= cc_diag_fail(
                'Sections with no audio — student loop risk',
                count($al_loop_risk) . '/' . $al_total . ' section(s) have no voiceoverUrl and no pregenerated sentinel: '
              . implode(', ', $show_ids)
              . ($extra > 0 ? '… and ' . $extra . ' more.' : '.')
              . ' For students: isVoiceoverGenerationPending() returns true — player enters '
              . '"Preparing audio…" loop indefinitely because students cannot call generate_voice '
              . '(API is teacher-only). '
              . 'FIX: Teacher opens the activity in edit/view mode and waits for all audio to '
              . 'complete. Then students reload the page.'
            );
            $overall_pass = false;
        } else {
            $rows_audioloop .= cc_diag_pass(
                'Sections with no audio — student loop risk',
                'None — all ' . $al_total . ' section(s) have a voiceover URL or pregenerated sentinel. '
              . 'Students will not enter an infinite audio waiting loop from missing audio.'
            );
        }

        // Failed sections
        if ($al_failed > 0) {
            $rows_audioloop .= cc_diag_fail(
                'Sections with voiceoverStatus = failed',
                $al_failed . ' section(s) hit the 3-retry limit and are marked failed. '
              . 'The player renders a failed-state for these sections. '
              . 'FIX: Teacher opens the activity and clicks "Reset & retry audio".'
            );
            $overall_pass = false;
        }

        // Pending sections (half-generated state)
        if ($al_pending > 0) {
            $rows_audioloop .= cc_diag_info(
                'Sections with voiceoverStatus = pending (no URL)',
                $al_pending . ' section(s) have status="pending" but no URL — likely mid-generation '
              . 'state from an interrupted page load. Teacher reload will restart preload for these. '
              . 'If they persist after teacher reload, check TTS mutex locks (Check 1 above).'
            );
        }

        // Overall audio loop verdict
        $al_loop_factors = [];
        if (!empty($al_loop_risk))    $al_loop_factors[] = count($al_loop_risk) . ' section(s) missing audio';
        if ($al_voc === false)        $al_loop_factors[] = 'manifest.voiceoversComplete=false';
        if ($al_failed > 0)           $al_loop_factors[] = $al_failed . ' section(s) with status=failed';
        if (!empty($al_stale_locks))  $al_loop_factors[] = count($al_stale_locks) . ' stale PHP TTS lock file(s)';

        if (empty($al_loop_factors)) {
            $rows_audioloop .= cc_diag_pass(
                'Audio loop verdict',
                'No conditions found that would cause an infinite audio waiting loop for students.'
            );
        } else {
            $rows_audioloop .= cc_diag_fail(
                'Audio loop verdict',
                'Audio loop conditions detected: ' . implode('; ', $al_loop_factors) . '. '
              . 'See individual checks above for fix instructions.'
            );
        }
    }
}

// ── SECTION 9: Live TTS API test ──────────────────────────────────────────────
// Makes a real generate_voice call to lms-labs.com and shows the raw HTTP
// response so you can see exactly why 403s are happening.
// Costs 5 credits per language tested (same as a real voiceover call).
// Skip by appending ?nottstest=1 to the URL.

$rows_tts = '';
$skip_tts_test = optional_param('nottstest', 0, PARAM_INT);

if ($skip_tts_test) {
    $rows_tts .= cc_diag_info('Live TTS test', 'Skipped — ?nottstest=1 was passed.');
} else {
    // Language code mappings — identical to ajax.php
    $tts_lang_mappings = [
        'zh-CN' => 'cmn-CN',
        'zh-TW' => 'cmn-TW',
        'zh-HK' => 'yue-HK',
        'nb-NO' => 'no-NO',
    ];
    $tts_apibaseurl = 'https://lms-labs.com';
    $tts_test_text  = 'Hello.'; // minimal text to keep call fast

    // Build list of languages to test
    $langs_to_test = [];

    // Always test primary language (site voiceover setting)
    $primary_lang = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
    $langs_to_test[] = ['label' => 'Primary language (site voicelanguage setting)', 'code' => $primary_lang];

    // If activity loaded, detect additional languages from manifest
    if ($cc !== null && !empty($manifest)) {
        $addl_langs = $manifest['additionalLanguages'] ?? $manifest['additional_languages'] ?? [];
        if (!empty($addl_langs) && is_array($addl_langs)) {
            foreach ($addl_langs as $al) {
                $al_code = is_array($al) ? ($al['code'] ?? $al['language'] ?? null) : (string)$al;
                if ($al_code && $al_code !== $primary_lang) {
                    $langs_to_test[] = ['label' => 'Additional language from activity manifest', 'code' => $al_code];
                    break; // test first non-primary only to avoid burning credits
                }
            }
        }
    }

    // Allow ?testlang=fr-FR to explicitly test a specific language code
    $testlang_param = optional_param('testlang', '', PARAM_TEXT);
    if (!empty($testlang_param)) {
        $langs_to_test[] = ['label' => 'Manually specified (?testlang=' . htmlspecialchars($testlang_param) . ')', 'code' => trim($testlang_param)];
    }

    if (empty($siteid) || empty($apikey)) {
        $rows_tts .= cc_diag_fail('Live TTS test', 'Skipped — Site ID or API Key not configured. Fix Section 1 first.');
    } else {
        foreach ($langs_to_test as $lt) {
            $lcode      = trim($lt['code']);
            $mapped     = $tts_lang_mappings[$lcode] ?? $lcode;
            $voiceid    = $mapped . '-Chirp3-HD-Aoede';
            $label      = $lt['label'];

            // Show what will be sent
            $rows_tts .= cc_diag_info(
                $label . ' — request params',
                'languageCode=' . htmlspecialchars($lcode)
                . ' | voiceId=' . htmlspecialchars($voiceid)
                . ' | endpoint=' . htmlspecialchars($tts_apibaseurl . '/api/moodle/content-creator/tts')
                . ' | text="' . htmlspecialchars($tts_test_text) . '"'
                . ' | creditsToUse=5'
            );

            // Fire the live call
            $tts_curl = new \curl();
            $tts_curl->setopt([
                'CURLOPT_TIMEOUT'        => 30,
                'CURLOPT_CONNECTTIMEOUT' => 10,
                'CURLOPT_RETURNTRANSFER' => true,
            ]);
            $tts_curl->setHeader(['Content-Type: application/json', 'Accept: application/json']);

            $tts_payload = [
                'siteId'       => $siteid,
                'apiKey'       => $apikey,
                'text'         => $tts_test_text,
                'languageCode' => $lcode,
                'voiceId'      => $voiceid,
                'voiceGender'  => 'female',
                'creditsToUse' => 5,
            ];

            $tts_response = $tts_curl->post(
                $tts_apibaseurl . '/api/moodle/content-creator/tts',
                json_encode($tts_payload)
            );
            $tts_info     = $tts_curl->get_info();
            $tts_httpcode = isset($tts_info['http_code']) ? (int)$tts_info['http_code'] : 0;
            $tts_data     = @json_decode($tts_response, true);
            $tts_raw_err  = is_array($tts_data)
                ? ($tts_data['error'] ?? $tts_data['message'] ?? $tts_data['detail'] ?? '')
                : (string)$tts_response;

            if ($tts_httpcode >= 200 && $tts_httpcode < 300) {
                $cached_note = (!empty($tts_data['cached'])) ? ' (served from cache — 0 credits used)' : ' (audio generated — 5 credits used)';
                $rows_tts .= cc_diag_pass(
                    $label . ' — TTS result',
                    'HTTP ' . $tts_httpcode . ' — SUCCESS.' . $cached_note
                    . ' audioType=' . ($tts_data['audioType'] ?? '?')
                );
            } else {
                $overall_pass = false;
                $raw = htmlspecialchars(substr((string)$tts_raw_err, 0, 400));

                // Produce a specific diagnosis from the HTTP code + error body
                if ($tts_httpcode === 0) {
                    $diagnosis = 'HTTP 0 (cURL timeout / DNS failure) — Moodle could not reach '
                        . $tts_apibaseurl . '. Check server outbound internet access and firewall rules. '
                        . 'cURL errno: ' . (isset($tts_curl->errno) ? (int)$tts_curl->errno : 'n/a');
                } elseif ($tts_httpcode === 403) {
                    if (stripos($tts_raw_err, 'credit') !== false || stripos($tts_raw_err, 'balance') !== false || stripos($tts_raw_err, 'insufficient') !== false) {
                        $diagnosis = 'HTTP 403 — CREDITS EXHAUSTED. The account linked to this Site ID has no remaining credits. Top up on the AI Grader portal.';
                    } elseif (stripos($tts_raw_err, 'voice') !== false || stripos($tts_raw_err, 'locale') !== false || stripos($tts_raw_err, 'language') !== false || stripos($tts_raw_err, 'chirp') !== false) {
                        $diagnosis = 'HTTP 403 — UNSUPPORTED VOICE / LANGUAGE. The voiceId "' . htmlspecialchars($voiceid) . '" or languageCode "' . htmlspecialchars($lcode) . '" is rejected by the TTS service. This language may not be supported on your account plan, or the Chirp 3 HD voice model may not be available for this locale. Try a different language code via ?testlang= or contact AI Grader support.';
                    } elseif (stripos($tts_raw_err, 'plan') !== false || stripos($tts_raw_err, 'tier') !== false || stripos($tts_raw_err, 'feature') !== false || stripos($tts_raw_err, 'upgrade') !== false) {
                        $diagnosis = 'HTTP 403 — PLAN / FEATURE RESTRICTION. Multilingual TTS is not enabled on your current subscription plan. Contact AI Grader support to enable it.';
                    } elseif (stripos($tts_raw_err, 'site') !== false || stripos($tts_raw_err, 'apikey') !== false || stripos($tts_raw_err, 'api_key') !== false || stripos($tts_raw_err, 'auth') !== false || stripos($tts_raw_err, 'unauthor') !== false || stripos($tts_raw_err, 'invalid') !== false) {
                        $diagnosis = 'HTTP 403 — AUTHENTICATION REJECTED. The Site ID or API Key was refused. Check values in Section 1 match exactly what is shown in the AI Grader portal.';
                    } else {
                        $diagnosis = 'HTTP 403 — FORBIDDEN. Raw server response: ' . $raw
                            . '. POSSIBLE CAUSES: (1) Credits exhausted — check portal balance. '
                            . '(2) Site ID / API Key mismatch — check Section 1. '
                            . '(3) Multilingual TTS not enabled on plan (English works but other languages fail). '
                            . '(4) voiceId format rejected — voiceId sent was "' . htmlspecialchars($voiceid) . '".';
                    }
                } elseif ($tts_httpcode === 401) {
                    $diagnosis = 'HTTP 401 — UNAUTHORISED. Site ID or API Key is wrong. Check Section 1.';
                } elseif ($tts_httpcode === 429) {
                    $diagnosis = 'HTTP 429 — RATE LIMITED. Too many TTS requests in a short time. Wait 60 seconds and retry.';
                } elseif ($tts_httpcode === 500 || $tts_httpcode === 502 || $tts_httpcode === 503) {
                    $diagnosis = 'HTTP ' . $tts_httpcode . ' — AI Grader SERVER ERROR. This is a server-side problem, not a configuration issue. Try again in a few minutes. Raw: ' . $raw;
                } else {
                    $diagnosis = 'HTTP ' . $tts_httpcode . ' — Unexpected response. Raw: ' . $raw;
                }

                $rows_tts .= cc_diag_fail($label . ' — TTS result', $diagnosis);
            }
        }
    }
}

// ── SECTION 10: Topic ID & Start Topic button — data-topic-id type audit ─────
// Diagnoses: student/teacher clicks "Start Learning" / topic card but the view
// stays on the topics grid (button appears to do nothing).
//
// Root cause A (pre-v12.94): jQuery .data('topic-id') auto-converts numeric-looking
// attribute values to integers. If topic.id in the manifest is stored as a JSON integer
// (e.g. 1 not "1"), renderSlideView's strict === comparison returned undefined → the
// topic-not-found guard fired → currentView was reset to 'topics' → render() re-drew
// the topics grid over the user's click. Fixed in v12.94 with String() coercion on both
// sides. The FIX is in src — but Moodle loads from amd/BUILD. If the build is stale
// or caches not purged, the old code is still running.
//
// Root cause B: topic has no sections[] → renderSlideView renders an empty slide area.
// Root cause C: renderSlideContent() throws → try/catch (added v12.94) catches and
//               shows an error panel; older builds silently left the topics grid on screen.

$rows_topicid = '';

if ($cmid <= 0) {
    $rows_topicid .= cc_diag_info('No cmid provided', 'Append ?cmid=<cmid> to inspect a specific activity.');
} elseif ($cc === null) {
    $rows_topicid .= cc_diag_info('Activity not loaded', 'Skipped — see Section 3.');
} elseif (empty($cc->manifestjson)) {
    $rows_topicid .= cc_diag_info('No manifest', 'Content not generated yet. Generate content first.');
} else {
    $topicid_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($topicid_manifest)) {
        $rows_topicid .= cc_diag_fail('Manifest parse', 'Invalid JSON.');
    } else {
        $ti_topics = $topicid_manifest['topics'] ?? [];

        if (empty($ti_topics)) {
            $rows_topicid .= cc_diag_fail('Topics in manifest', 'No topics array. Regenerate content.');
        } else {
            $rows_topicid .= cc_diag_pass('Topics in manifest', count($ti_topics) . ' topic(s) found.');

            // Manifest layout: single-topic hero or multi-topic grid?
            $ti_layout = count($ti_topics) === 1 ? 'single-topic hero (cc5-single-start-btn cc5-topic-card)' : 'multi-topic grid (cc5-topic-card per card)';
            $rows_topicid .= cc_diag_info('Button layout', $ti_layout);

            $ti_has_numeric = false;
            $ti_has_mixed   = false;
            $ti_id_types    = [];

            foreach ($ti_topics as $ti => $topic) {
                $raw_id   = $topic['id'] ?? null;
                $php_type = gettype($raw_id);
                $ti_id_types[] = 'topic[' . $ti . '].id=' . json_encode($raw_id) . ' (' . $php_type . ')';

                // Is this ID numeric? jQuery .data() will return an int for e.g. data-topic-id="1"
                // That int compared === to PHP string "1" fails in pre-v12.94 code.
                if (is_int($raw_id) || (is_string($raw_id) && ctype_digit((string)$raw_id))) {
                    $ti_has_numeric = true;
                }

                // Check section count
                $sections = $topic['sections'] ?? [];
                if (empty($sections)) {
                    $rows_topicid .= cc_diag_fail(
                        'Topic[' . $ti . '] "' . htmlspecialchars(mb_substr($topic['title'] ?? '(no title)', 0, 40)) . '" — sections',
                        'No sections[] in this topic. renderSlideView() would render an empty slide area and show 0/0 slides. Regenerate content.'
                    );
                    $overall_pass = false;
                } else {
                    $sec_with_cards = 0;
                    foreach ($sections as $sec) {
                        if (!empty($sec['cards'])) $sec_with_cards++;
                    }
                    $rows_topicid .= cc_diag_pass(
                        'Topic[' . $ti . '] "' . htmlspecialchars(mb_substr($topic['title'] ?? '(no title)', 0, 40)) . '" — sections',
                        count($sections) . ' section(s), ' . $sec_with_cards . ' with cards[].'
                    );
                }

                // Simulate renderSlideView topic lookup with String() coercion (v12.94 fix):
                // data-topic-id on the button = String(raw_id) as set by escapeHtml(sTopic.id).
                // jQuery .data() returns the value parsed: integers stay int, UUIDs stay string.
                // Pre-v12.94: manifest topic.id compared ===  jQuery .data() result → mismatch for int IDs.
                // v12.94: String(t.id) === String(currentTopicId) → always matches.
                $data_attr_val = (string)$raw_id; // what the HTML attribute contains
                // jQuery .data() parses: if the attribute value is all-digits, returns int
                $jquery_data_result = ctype_digit($data_attr_val) ? (int)$data_attr_val : $data_attr_val;
                // Pre-v12.94 strict ===: topic.id (PHP type) === jquery result
                $pre_v1294_match = ($raw_id === $jquery_data_result);
                // v12.94 String() coercion: String(topic.id) === String(jquery result) → always matches
                $v1294_match = ((string)$raw_id === (string)$jquery_data_result);

                if (!$pre_v1294_match && $v1294_match) {
                    $rows_topicid .= cc_diag_fail(
                        'Topic[' . $ti . '] ID type mismatch (pre-v12.94 bug)',
                        'topic.id=' . json_encode($raw_id) . ' (type=' . $php_type . ') vs '
                      . 'jQuery .data() returns ' . json_encode($jquery_data_result) . ' (type=' . gettype($jquery_data_result) . '). '
                      . 'Strict === comparison fails → renderSlideView falls back to topics grid → "Start Topic does nothing". '
                      . 'FIX: Install v12.94+ (has String() coercion fix in player5.js) AND purge Moodle caches. '
                      . 'If the build is stale, the fix is not active — see Section 11.'
                    );
                    $overall_pass = false;
                } elseif ($pre_v1294_match) {
                    $rows_topicid .= cc_diag_pass(
                        'Topic[' . $ti . '] ID type match',
                        'topic.id=' . json_encode($raw_id) . ' — jQuery .data() returns same type. No type-mismatch issue for this topic (both pre- and post-v12.94 code would find the topic).'
                    );
                }
            }

            $rows_topicid .= cc_diag_info(
                'All topic IDs',
                implode(' | ', $ti_id_types)
            );

            if ($ti_has_numeric) {
                $rows_topicid .= cc_diag_info(
                    'Numeric topic ID detected',
                    'One or more topic IDs are integers or digit-only strings. jQuery .data() converts data-topic-id="1" to integer 1. '
                  . 'Pre-v12.94 code used strict === which failed for these. v12.94 uses String() coercion — safe. '
                  . 'See Section 11 to confirm the v12.94 build is active on this Moodle site.'
                );
            } else {
                $rows_topicid .= cc_diag_pass(
                    'Topic ID format',
                    'All topic IDs are non-numeric strings (e.g. UUIDs). jQuery .data() returns them as strings. '
                  . 'The pre-v12.94 type-mismatch bug would NOT have affected these IDs — look for other causes in Sections 11-13.'
                );
            }
        }
    }
}

// ── SECTION 11: Player JS version & Start Topic fix verification ──────────────
// Checks the COMPILED amd/build/player5.js (what Moodle actually loads) for:
// 1. CC_VERSION string → tells us what code version is running.
// 2. FIX-CC-TOPIC-FIND text → confirms the String() coercion fix is compiled in.
// 3. FIX-CC-RENDER-GUARD text → confirms try/catch around renderSlideContent is compiled in.
// 4. MD5 comparison src vs build → detects stale build (src newer than build).
// Note: Moodle also caches compiled JS internally (jsrev). Even with the right build file,
// students may get the old code until Moodle caches are purged (Site Admin → Purge all caches).

$rows_playerjs = '';

$player_src_path   = __DIR__ . '/amd/src/player5.js';
$player_build_path = __DIR__ . '/amd/build/player5.js';
$player_min_path   = __DIR__ . '/amd/build/player5.min.js';

// ── 11a: src version ──────────────────────────────────────────────────────────
if (!file_exists($player_src_path)) {
    $rows_playerjs .= cc_diag_fail('player5.js src', 'File not found at ' . $player_src_path);
    $overall_pass = false;
    $src_cc_version = null;
} else {
    // Read first 4 KB to find CC_VERSION — it's defined near the top of cc-state.js
    // which player5.js imports. The src may inline it.
    $src_head = file_get_contents($player_src_path, false, null, 0, 8192);
    preg_match("/CC_VERSION\s*=\s*['\"]([^'\"]+)['\"]/" , $src_head, $m_src);
    $src_cc_version = $m_src[1] ?? null;
    $has_topicfind_src  = (strpos(file_get_contents($player_src_path), 'FIX-CC-TOPIC-FIND') !== false);
    $has_renderguard_src = (strpos(file_get_contents($player_src_path), 'FIX-CC-RENDER-GUARD') !== false);
    $rows_playerjs .= cc_diag_info('player5.js src — CC_VERSION', $src_cc_version ?? '(not found in first 8 KB — check cc-state.js)');
    $rows_playerjs .= $has_topicfind_src
        ? cc_diag_pass('player5.js src — FIX-CC-TOPIC-FIND present', 'String() coercion fix is in source.')
        : cc_diag_fail('player5.js src — FIX-CC-TOPIC-FIND present', 'Not found in src. This fix requires player5.js with the String() coercion for topic ID lookup.');
    $rows_playerjs .= $has_renderguard_src
        ? cc_diag_pass('player5.js src — FIX-CC-RENDER-GUARD present', 'try/catch around renderSlideContent is in source.')
        : cc_diag_info('player5.js src — FIX-CC-RENDER-GUARD present', 'Not found. Pre-v12.94 src.');
}

// ── 11b: build file checks ────────────────────────────────────────────────────
if (!file_exists($player_build_path)) {
    $rows_playerjs .= cc_diag_fail('player5.js build', 'File not found at ' . $player_build_path . '. AMD build has not been run.');
    $overall_pass = false;
    $build_cc_version = null;
} else {
    // Read the full build to search for fix markers
    $build_content = file_get_contents($player_build_path);
    // CC_VERSION lives in cc-state.js (player5 imports it via CcState.CC_VERSION).
    // Look for it in the cc-state build file, not player5 build.
    $ccstate_build_path = __DIR__ . '/amd/build/cc-state.js';
    $build_cc_version = null;
    if (file_exists($ccstate_build_path)) {
        preg_match("/CC_VERSION\s*=\s*['\"]([^'\"]+)['\"]/" , file_get_contents($ccstate_build_path), $m_build);
        $build_cc_version = $m_build[1] ?? null;
    }
    if (!$build_cc_version) {
        // Fallback: check player5 build directly (in case future versions embed it)
        preg_match("/CC_VERSION\s*=\s*['\"]([^'\"]+)['\"]/" , substr($build_content, 0, 8192), $m_build);
        $build_cc_version = $m_build[1] ?? null;
    }

    // FIX-CC-TOPIC-FIND is a comment marker. AMD compilers strip comments so it
    // will NOT appear in build/player5.js even when the fix is present.
    // Check for the actual String() coercion code instead: topicId = String(topicId)
    $has_topicfind_build   = (strpos($build_content, 'FIX-CC-TOPIC-FIND') !== false)
                          || (strpos($build_content, 'String(topicId)') !== false)
                          || (strpos($build_content, 'topicId=String(') !== false);
    $has_renderguard_build = (strpos($build_content, 'FIX-CC-RENDER-GUARD') !== false)
                          || (strpos($build_content, 'try{') !== false && strpos($build_content, 'renderSlideContent') !== false);

    // Version comparison: extract numeric parts for ≥ 12.94 check
    $build_ver_ok = false;
    if ($build_cc_version) {
        $parts = explode('.', $build_cc_version);
        $major = (int)($parts[0] ?? 0);
        $minor = (int)($parts[1] ?? 0);
        $build_ver_ok = ($major > 12) || ($major === 12 && $minor >= 94);
    }

    $rows_playerjs .= cc_diag_info('player5.js BUILD — CC_VERSION',
        ($build_cc_version ?? '(not found — CC_VERSION is in cc-state.js, checked there)')
    );

    if ($build_ver_ok) {
        $rows_playerjs .= cc_diag_pass('player5.js BUILD — version ≥ 12.94', 'Version ' . $build_cc_version . ' — covers FIX-CC-TOPIC-FIND fix era.');
    } else {
        $rows_playerjs .= cc_diag_fail(
            'player5.js BUILD — version ≥ 12.94',
            'Build version ' . ($build_cc_version ?? 'unknown — CC_VERSION is defined in cc-state.js') . ' could not be confirmed ≥ 12.94. '
          . 'If cc-state.js version is ≥ 12.94 then the String() coercion fix is active. '
          . 'After any plugin update, purge all Moodle caches (Site Admin → Development → Purge all caches).'
        );
        // Not setting $overall_pass = false — version lookup limitation, not a real failure.
    }

    if ($has_topicfind_build) {
        $rows_playerjs .= cc_diag_pass(
            'player5.js BUILD — FIX-CC-TOPIC-FIND compiled in',
            'String(topicId) coercion code confirmed in build file. '
          . 'Note: AMD compilation strips comment markers like FIX-CC-TOPIC-FIND — the actual fix code is what matters.'
        );
    } else {
        $rows_playerjs .= cc_diag_fail(
            'player5.js BUILD — FIX-CC-TOPIC-FIND compiled in',
            'String(topicId) coercion NOT found in build/player5.js. '
          . 'Even if the src has the fix, Moodle loads from amd/build/ — the old code is running. '
          . 'FIX: Rebuild AMD files from src, then purge all Moodle caches (Site Admin → Development → Purge all caches).'
        );
        $overall_pass = false;
    }

    if ($has_renderguard_build) {
        $rows_playerjs .= cc_diag_pass('player5.js BUILD — FIX-CC-RENDER-GUARD compiled in', 'try/catch around renderSlideContent confirmed in build.');
    } else {
        $rows_playerjs .= cc_diag_info('player5.js BUILD — FIX-CC-RENDER-GUARD compiled in', 'Not found — pre-v12.94 build. Exceptions inside renderSlideContent() would silently leave the topics grid on screen.');
    }

    // MD5 src vs build staleness check
    if (file_exists($player_src_path)) {
        $src_md5   = md5_file($player_src_path);
        $build_md5 = md5_file($player_build_path);
        if ($src_md5 === $build_md5) {
            $rows_playerjs .= cc_diag_pass('src vs build MD5', 'Identical — build is a direct copy of src (no minification step). Content is in sync.');
        } else {
            $src_mtime   = filemtime($player_src_path);
            $build_mtime = filemtime($player_build_path);
            $diff = $src_mtime - $build_mtime;
            if ($diff > 0) {
                $rows_playerjs .= cc_diag_info(
                    'src vs build — mtime diff',
                    'src is ' . round($diff / 60, 1) . ' minutes newer than build. Files differ (minification is normal). '
                  . ($diff > 3600 ? 'WARN: src is >1 hour newer — confirm build was run after last src edit.' : 'Diff is small — likely just whitespace/minification.')
                );
            } else {
                $rows_playerjs .= cc_diag_pass('src vs build — mtime diff', 'Build is equal or newer than src. No staleness detected.');
            }
        }
    }
}

// ── 11c: player5.min.js check ────────────────────────────────────────────────
// Moodle normally loads the .min.js in production (when $CFG->debugdeveloper is off).
if (!file_exists($player_min_path)) {
    $rows_playerjs .= cc_diag_fail('player5.min.js BUILD', 'Not found. Moodle will fall back to player5.js for non-minified loads.');
    $overall_pass = false;
} else {
    $min_content = file_get_contents($player_min_path);
    $has_topicfind_min   = (strpos($min_content, 'FIX-CC-TOPIC-FIND') !== false);
    $has_renderguard_min = (strpos($min_content, 'FIX-CC-RENDER-GUARD') !== false);
    preg_match("/CC_VERSION\s*=\s*['\"]([^'\"]+)['\"]/" , substr($min_content, 0, 8192), $m_min);
    $min_cc_version = $m_min[1] ?? null;

    // Most minifiers strip comments, so FIX-CC-TOPIC-FIND (in a comment) may be absent.
    // The String() coercion code itself (String(t.id)) is the actual check.
    $has_string_coerce = (strpos($min_content, 'String(t.id)') !== false || strpos($min_content, 'String(self.currentTopicId)') !== false);

    $rows_playerjs .= cc_diag_info('player5.min.js — CC_VERSION', $min_cc_version ?? '(not found)');

    if ($has_topicfind_min) {
        $rows_playerjs .= cc_diag_pass('player5.min.js — FIX-CC-TOPIC-FIND comment', 'Comment marker present in min file.');
    } elseif ($has_string_coerce) {
        $rows_playerjs .= cc_diag_pass(
            'player5.min.js — String() coercion code',
            'String(t.id) / String(self.currentTopicId) found in min file. Minifier stripped comments but the actual fix code is present — topic lookup will work correctly.'
        );
    } else {
        $rows_playerjs .= cc_diag_fail(
            'player5.min.js — FIX-CC-TOPIC-FIND code',
            'Neither FIX-CC-TOPIC-FIND comment nor String(t.id) coercion found in player5.min.js. '
          . 'This is the file Moodle loads in production. The "Start Topic does nothing" bug is ACTIVE. '
          . 'FIX: Rebuild AMD (grunt) and purge all Moodle caches.'
        );
        $overall_pass = false;
    }
}

// ── 11d: Moodle jsrev / cache advisory ───────────────────────────────────────
$rows_playerjs .= cc_diag_info(
    'Moodle JS cache — action required after any update',
    'Even if the build files above are correct, Moodle serves JS from its own compiled cache (jsrev). '
  . 'Students receive the CACHED version until you: Site Admin → Development → Purge all caches. '
  . 'If you just installed a new plugin version and the Start Topic button still does nothing, '
  . 'cache purge is the most likely missing step. After purging, students must HARD RELOAD (Ctrl+Shift+R).'
);

// ── SECTION 12: Student progress records ─────────────────────────────────────
// Diagnoses: corrupted or missing progress records in contentcreator_progress that
// could cause load_completion or save_completion to misbehave.

$rows_progress = '';

if ($cmid <= 0) {
    $rows_progress .= cc_diag_info('No cmid provided', 'Append ?cmid=<cmid> to inspect progress records.');
} elseif (!$DB->get_manager()->table_exists('contentcreator_progress')) {
    $rows_progress .= cc_diag_fail('contentcreator_progress table', 'Table does not exist — see Section 2.');
} else {
    $prog_records = $DB->get_records('contentcreator_progress', ['cmid' => $cmid], 'timemodified DESC', 'id,userid,progress,timecreated,timemodified', 0, 50);
    $prog_count = count($prog_records);

    if ($prog_count === 0) {
        $rows_progress .= cc_diag_info(
            'Progress records for this cmid',
            'None found. No student has completed any slides yet, OR load_completion has never successfully returned data. '
          . 'This is normal for a new activity. If a student reports progress is not saving, check Section 13.'
        );
    } else {
        $rows_progress .= cc_diag_pass('Progress records for this cmid', $prog_count . ' record(s) found (showing up to 50, newest first).');

        $prog_corrupt = 0;
        $prog_empty_sections = 0;
        $prog_with_lastvisited = 0;
        $prog_details = [];

        foreach ($prog_records as $rec) {
            $json = @json_decode($rec->progress, true);
            if (!is_array($json)) {
                $prog_corrupt++;
                $overall_pass = false;
                $prog_details[] = 'userid=' . $rec->userid . ': CORRUPT JSON (raw length=' . strlen($rec->progress) . ')';
                continue;
            }

            $sections = $json['sections'] ?? [];
            $section_count = count($sections);
            $complete_count = 0;
            foreach ($sections as $sid => $sval) {
                if (!empty($sval['complete'])) $complete_count++;
            }

            $lv = $json['lastVisited'] ?? null;
            if ($lv) $prog_with_lastvisited++;
            if ($section_count === 0) $prog_empty_sections++;

            $age_days = round((time() - (int)$rec->timemodified) / 86400, 1);
            $prog_details[] = 'userid=' . $rec->userid
                . ' | sections=' . $section_count . ' (' . $complete_count . ' complete)'
                . ($lv ? ' | lastVisited=' . htmlspecialchars(mb_substr(json_encode($lv), 0, 60)) : ' | no lastVisited')
                . ' | modified ' . $age_days . 'd ago';
        }

        if ($prog_corrupt > 0) {
            $rows_progress .= cc_diag_fail(
                'Corrupt progress records',
                $prog_corrupt . ' record(s) contain invalid JSON. load_completion returns null progress for these users — '
              . 'their cross-device sync is broken. The player falls back to localStorage only. '
              . 'FIX: These records can be safely deleted (the user will restart from localStorage state). '
              . 'Run: DELETE FROM {contentcreator_progress} WHERE cmid=' . $cmid . ' AND id IN (corrupt record ids).'
            );
        } else {
            $rows_progress .= cc_diag_pass('Progress record JSON validity', 'All ' . $prog_count . ' record(s) contain valid JSON.');
        }

        if ($prog_empty_sections > 0) {
            $rows_progress .= cc_diag_info(
                'Records with empty sections{}',
                $prog_empty_sections . ' record(s) have no section progress saved yet. '
              . 'This means the student opened the activity but has not completed any slides. Normal state.'
            );
        }

        $rows_progress .= cc_diag_info('lastVisited present', $prog_with_lastvisited . '/' . $prog_count . ' record(s) have a lastVisited value (resumed from a specific slide).');

        // Show per-user detail (max 15 rows)
        $show_details = array_slice($prog_details, 0, 15);
        $extra_prog = $prog_count - count($show_details);
        foreach ($show_details as $d) {
            $rows_progress .= cc_diag_info('Progress record', $d);
        }
        if ($extra_prog > 0) {
            $rows_progress .= cc_diag_info('Progress records', '… and ' . $extra_prog . ' more (showing first 15).');
        }
    }

    // Attempts table
    if ($DB->get_manager()->table_exists('contentcreator_attempts') && $cc !== null) {
        $attempt_count = $DB->count_records('contentcreator_attempts', ['contentcreatorid' => $cc->id]);
        $completed_attempts = $DB->count_records('contentcreator_attempts', ['contentcreatorid' => $cc->id, 'completed' => 1]);
        $rows_progress .= cc_diag_info(
            'contentcreator_attempts',
            $attempt_count . ' attempt record(s) | ' . $completed_attempts . ' marked completed=1. '
          . '(Completion tick requires a completed=1 record — written by save_completion when overall progress=100%.)'
        );
    }
}

// ── SECTION 13: Start Topic button — full click simulation & verdict ──────────
// Simulates exactly what happens when a student clicks "Start Learning" / a topic card.
// Maps each possible failure mode to a specific fix.

$rows_simulate = '';

if ($cmid <= 0) {
    $rows_simulate .= cc_diag_info('No cmid provided', 'Append ?cmid=<cmid> to run the simulation.');
} elseif ($cc === null) {
    $rows_simulate .= cc_diag_info('Activity not loaded', 'Skipped — see Section 3.');
} elseif (empty($cc->manifestjson)) {
    $rows_simulate .= cc_diag_info('No manifest', 'Content not generated yet.');
} else {
    $sim_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($sim_manifest)) {
        $rows_simulate .= cc_diag_fail('Manifest parse', 'Invalid JSON.');
    } else {
        $sim_topics = $sim_manifest['topics'] ?? [];
        $sim_voEnabled = (bool)(get_config('mod_contentcreator', 'enablevoice') ?? 1);

        // ── Step 1: Would the voiceover waiting screen block the student? ─────────
        // Mirrors isVoiceoverGenerationPending() for students (editMode=false, canEdit=false, isTeacher=false)
        $sim_blocking_sections = [];
        $sim_pregenned_count   = 0;
        $sim_https_count       = 0;
        $sim_failed_sections   = []; // voiceoverStatus=failed — these do NOT block (gate skips them)

        foreach ($sim_topics as $ti => $topic) {
            foreach (($topic['sections'] ?? []) as $si => $section) {
                if (($section['slideType'] ?? '') === 'activity') continue; // activities skipped by gate

                $url    = $section['voiceoverUrl'] ?? '';
                $status = $section['voiceoverStatus'] ?? '';
                $sid    = $section['id'] ?? ('t' . $ti . '_s' . $si);

                $hasUrl          = is_string($url) && strpos($url, 'http') === 0;
                $hasPregenerated = ($url === 'pregenerated');
                $hasFallback     = isset($section['_preloadFallbackUrl']) && strpos($section['_preloadFallbackUrl'], 'http') === 0;
                $isFailed        = ($status === 'failed');

                if ($isFailed) {
                    $sim_failed_sections[] = $sid; // gate skips failed → does NOT block
                    continue;
                }

                if ($hasUrl)          { $sim_https_count++;    continue; }
                if ($hasPregenerated) { $sim_pregenned_count++; continue; }
                if ($hasFallback)     { continue; } // fallback URL — gate treats as "has audio"

                // None of the above — this section would trigger isVoiceoverGenerationPending()=true
                $sim_blocking_sections[] = $sid . (isset($section['heading']) ? ' "' . mb_substr($section['heading'], 0, 30) . '"' : '');
            }
        }

        $voWaitBypassed = false; // not persisted in PHP — assume student hasn't clicked "Continue anyway"
        $isVoicePending = $sim_voEnabled && !empty($sim_blocking_sections);

        if (!$sim_voEnabled) {
            $rows_simulate .= cc_diag_pass(
                'Step 1: Voiceover waiting screen',
                'Voice is DISABLED — isVoiceoverGenerationPending() always returns false. Student sees the topics grid immediately. No voiceover gate blocking.'
            );
        } elseif ($isVoicePending) {
            $show_blocking = array_slice($sim_blocking_sections, 0, 6);
            $extra_b = count($sim_blocking_sections) - count($show_blocking);
            $rows_simulate .= cc_diag_fail(
                'Step 1: Voiceover waiting screen — BLOCKING',
                'isVoiceoverGenerationPending() = TRUE for students. '
              . count($sim_blocking_sections) . ' learning section(s) have no voiceoverUrl and no pregenerated sentinel: '
              . implode(', ', $show_blocking) . ($extra_b > 0 ? ' … and ' . $extra_b . ' more.' : '. ')
              . 'The player shows "Preparing audio…" instead of the topics grid. '
              . 'The "Start Learning" button on the topics grid is NEVER REACHED by students. '
              . 'This is the most common cause of the "Start Topic does nothing" report. '
              . 'FIX: Teacher opens the activity in view/edit mode and waits for ALL audio to finish generating. '
              . 'Then students reload the page.'
            );
            $overall_pass = false;
        } else {
            $rows_simulate .= cc_diag_pass(
                'Step 1: Voiceover waiting screen',
                'isVoiceoverGenerationPending() = false for students. '
              . 'Audio is ready (' . $sim_https_count . ' HTTPS, ' . $sim_pregenned_count . ' pregenerated'
              . (!empty($sim_failed_sections) ? ', ' . count($sim_failed_sections) . ' failed-but-skipped' : '') . '). '
              . 'Student sees the topics grid and the Start Learning button. Voiceover gate is NOT the cause.'
            );
        }

        // ── Step 2: Can the click handler find the topic? ─────────────────────────
        // Simulates the click + renderSlideView topic lookup
        $rows_simulate .= cc_diag_info(
            'Step 2: Click handler fires',
            'Click on cc5-topic-card sets currentView="slides", currentTopicId=<topic id from data attribute>, calls render().'
        );

        $sim_topic_find_ok = true;
        foreach ($sim_topics as $ti => $topic) {
            $raw_id = $topic['id'] ?? null;
            // Simulate data-topic-id attribute value: escapeHtml(sTopic.id) = String form
            $attr_val = (string)$raw_id;
            // Simulate jQuery .data() result: auto-parses numeric strings
            $jquery_result = ctype_digit($attr_val) ? (int)$attr_val : $attr_val;
            // v12.94 lookup: String(t.id) === String(currentTopicId)
            $found_v1294 = false;
            foreach ($sim_topics as $t) {
                if ((string)($t['id'] ?? '') === (string)$jquery_result) {
                    $found_v1294 = true;
                    break;
                }
            }
            // Pre-v12.94 lookup: t.id === currentTopicId (strict ===)
            $found_pre = false;
            foreach ($sim_topics as $t) {
                if (($t['id'] ?? null) === $jquery_result) {
                    $found_pre = true;
                    break;
                }
            }

            if (!$found_v1294) {
                $rows_simulate .= cc_diag_fail(
                    'Step 2: Topic[' . $ti . '] — find (v12.94)',
                    'Even with String() coercion, topic id=' . json_encode($raw_id) . ' cannot be found. This is unexpected — check manifest integrity.'
                );
                $sim_topic_find_ok = false;
                $overall_pass = false;
            } elseif (!$found_pre && $found_v1294) {
                $rows_simulate .= cc_diag_fail(
                    'Step 2: Topic[' . $ti . '] — find (pre-v12.94 build)',
                    'Pre-v12.94 code (strict ===): topic id=' . json_encode($raw_id) . ' NOT FOUND (jQuery returns ' . json_encode($jquery_result) . '). '
                  . 'renderSlideView() fires topic-not-found fallback → resets to topics grid → "Start Topic does nothing". '
                  . 'v12.94 code (String() coerce): FOUND. '
                  . 'CONCLUSION: The bug is caused by a stale AMD build or un-purged Moodle JS cache. See Section 11.'
                );
                $sim_topic_find_ok = false;
                $overall_pass = false;
            } else {
                $rows_simulate .= cc_diag_pass(
                    'Step 2: Topic[' . $ti . '] — find (both pre- and post-v12.94)',
                    'topic id=' . json_encode($raw_id) . ' is found by both strict === and String() coercion. Type-mismatch is NOT the cause for this topic.'
                );
            }
        }

        // ── Step 3: Would renderSlideContent succeed? ──────────────────────────────
        $sim_render_ok = true;
        foreach ($sim_topics as $ti => $topic) {
            $sections = $topic['sections'] ?? [];
            if (empty($sections)) {
                $rows_simulate .= cc_diag_fail(
                    'Step 3: Topic[' . $ti . '] — sections exist',
                    'No sections[] found. renderSlideView would render an empty slide area (0/0 slides). '
                  . 'With pre-v12.94 builds (no try/catch in renderSlideContent), this causes a JS exception → topics grid stays. '
                  . 'FIX: Regenerate content for this topic.'
                );
                $sim_render_ok = false;
                $overall_pass = false;
            } else {
                $first_section = $sections[0];
                $cards = $first_section['cards'] ?? [];
                $rows_simulate .= cc_diag_pass(
                    'Step 3: Topic[' . $ti . '] — first section',
                    'sections[0] id=' . json_encode($first_section['id'] ?? 'missing') . ', cards=' . count($cards) . '. renderSlideContent has data to work with.'
                );
            }
        }

        // ── Step 4: AJAX load_completion ───────────────────────────────────────────
        $rows_simulate .= cc_diag_info(
            'Step 4: AJAX load_completion',
            'After render(), the player calls ajax.php?action=load_completion with sesskey+cmid. '
          . 'This fetches DB progress and deep-merges it with localStorage. '
          . 'If ajax.php returns non-200 or {success:false}, the player continues from localStorage only — NOT a blocking failure. '
          . 'Check browser Network tab: POST to /mod/contentcreator/ajax.php should return HTTP 200 with {success:true, progress:{...}}.'
        );

        // ── Step 5: AJAX save_completion ───────────────────────────────────────────
        $rows_simulate .= cc_diag_info(
            'Step 5: AJAX save_completion (on slide complete)',
            'When a student completes a slide, save_completion is called. Requires mod/contentcreator:view capability. '
          . 'If students have this capability and a valid sesskey, saves work. '
          . 'If save_completion fails silently, progress is only in localStorage — resets on browser clear. '
          . 'Not a cause of "Start Topic does nothing" but related to progress persistence issues.'
        );

        // ── Overall verdict ────────────────────────────────────────────────────────
        $verdict_problems = [];
        if ($isVoicePending)     $verdict_problems[] = 'VOICEOVER GATE: ' . count($sim_blocking_sections) . ' section(s) blocking the topics grid';
        if (!$sim_topic_find_ok) $verdict_problems[] = 'TOPIC ID MISMATCH: type coercion needed (stale build / un-purged cache)';
        if (!$sim_render_ok)     $verdict_problems[] = 'EMPTY SECTIONS: no content to display for one or more topics';

        if (empty($verdict_problems)) {
            $rows_simulate .= cc_diag_pass(
                'Start Topic button — overall verdict',
                'No blocking conditions found for this activity. '
              . 'If the button still does nothing: '
              . '(1) Open browser DevTools → Console tab → click the button and look for "[CC v...]" log lines. '
              . 'If you see "renderSlideView: topic not found", the build is stale (Section 11). '
              . '(2) Network tab → click button → check for a failed POST to ajax.php. '
              . '(3) Purge all Moodle caches and hard-reload (Ctrl+Shift+R) — most common fix. '
              . '(4) If button still does nothing after cache purge, check Section 11 for stale AMD build.'
            );
        } else {
            $rows_simulate .= cc_diag_fail(
                'Start Topic button — overall verdict',
                'BLOCKING conditions found: ' . implode(' | ', $verdict_problems) . '. '
              . 'See individual steps above for specific fix instructions.'
            );
        }

        // ── Browser console guide ─────────────────────────────────────────────────
        $rows_simulate .= cc_diag_info(
            'Browser console — what to look for when clicking Start Topic',
            'Open DevTools (F12) → Console tab → click the Start Topic button. '
          . 'GOOD: "[CC v12.94+] topic-card click: topicId=..." followed by no errors. '
          . 'BAD (type mismatch, stale build): "[CC v...] renderSlideView: topic not found for currentTopicId=..." — '
          .   'this confirms the stale build / un-purged cache issue (see Section 11). '
          . 'BAD (render error, pre-v12.94): "[CC v...] FIX-CC-RENDER-GUARD: renderSlideContent threw..." — '
          .   'a JS exception inside the slide renderer; the error message will tell you which section caused it. '
          . 'BAD (no log at all): the click handler is not firing — inspect the DOM to confirm the button has the '
          .   'cc5-topic-card class and data-topic-id attribute (right-click → Inspect). '
          . 'NETWORK tab: every button click should NOT trigger any new network request — the player navigates '
          .   'client-side. A new page load happening means something is calling window.location.'
        );
    }
}

// ── SECTION 14: Language generation code chain ────────────────────────────────
// Verifies the four AMD build files that must ALL be running for German/additional-
// language content to generate correctly. A single stale file in this chain causes
// the LLM to ignore the German language instruction and return English content.

$rows_langchain = '';

// Build file marker matrix
// Each entry: [ 'label', 'file' (relative to $build_dir), markers[] ]
// Each marker: [ 'needle', 'desc', 'critical' ]
$lc_files = [
    [
        'label' => 'prompts.js build',
        'file'  => 'prompts.js',
        'markers' => [
            [
                'needle'   => 'getLangPrefixForUserPrompt',
                'desc'     => 'FIX-CC-MULTILANG-TEXT (v12.69) — injects MANDATORY LANGUAGE REQUIREMENT header into every user prompt. Without this, 12,000 chars of English reference material in the user prompt overrides the system-level German instruction.',
                'critical' => true,
            ],
            [
                'needle'   => 'LANGUAGE_NAMES',
                'desc'     => 'Language name map — maps language codes (de-DE, fr-FR, etc.) to display names used in the system prompt.',
                'critical' => true,
            ],
            [
                'needle'   => 'de-DE',
                'desc'     => 'German (de-DE) present in LANGUAGE_NAMES map — without this entry getLanguageName(\'de-DE\') returns undefined and every prompt reads "Generate ALL content in undefined".',
                'critical' => true,
            ],
            [
                'needle'   => 'getLanguageInstructions',
                'desc'     => 'System prompt language instruction function — builds the "IMPORTANT: Generate ALL content in German" block for the system prompt.',
                'critical' => true,
            ],
        ],
    ],
    [
        'label' => 'generator.js build',
        'file'  => 'generator.js',
        'markers' => [
            [
                'needle'   => 'voiceSettings',
                'desc'     => 'Reads voiceSettings.language from planned manifest to determine the target generation language.',
                'critical' => true,
            ],
            [
                'needle'   => 'context.language',
                'desc'     => 'Threads language code from voiceSettings into context.language, which is then passed to both prompt functions.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLanguageInstructions',
                'desc'     => 'Calls Prompts.getLanguageInstructions() to build the German system prompt block.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLangPrefixForUserPrompt',
                'desc'     => 'Calls Prompts.getLangPrefixForUserPrompt() to inject the mandatory language gate into the user prompt.',
                'critical' => true,
            ],
        ],
    ],
    [
        'label' => 'manifest.builder.js build',
        'file'  => 'manifest.builder.js',
        'markers' => [
            [
                'needle'   => 'inputs.context',
                'desc'     => 'Threads context (including context.language) from builder inputs through to the planned manifest that generator.js reads.',
                'critical' => true,
            ],
        ],
    ],
    [
        'label' => 'builder.js build',
        'file'  => 'builder.js',
        'markers' => [
            [
                'needle'   => 'FIX-CC-ML-LANG-CAPTURE',
                'desc'     => 'IIFE closure (v12.66) that captures the language code as a true function parameter, preventing it from being overwritten mid-loop when async retries outlast the for-loop boundary.',
                'critical' => true,
            ],
            [
                'needle'   => 'additionalLangs',
                'desc'     => 'Multi-language generation loop variable — iterates over each additional language and calls ManifestBuilder.build() with that language\'s context.',
                'critical' => true,
            ],
            [
                'needle'   => 'multiLanguage',
                'desc'     => 'Stores generated language content into manifest.multiLanguage[] — the array the player reads when the student clicks a language pill.',
                'critical' => true,
            ],
        ],
    ],
];

$lc_any_critical_fail = false;

foreach ($lc_files as $fc) {
    $filepath = $build_dir . $fc['file'];
    if (!file_exists($filepath)) {
        $rows_langchain .= cc_diag_fail(
            $fc['label'],
            'Build file not found: amd/build/' . $fc['file'] . ' — plugin was not installed correctly.'
        );
        $lc_any_critical_fail = true;
        continue;
    }
    $fc_content  = file_get_contents($filepath);
    $fc_mtime    = date('Y-m-d H:i', filemtime($filepath));
    $fc_bytes    = number_format(filesize($filepath));
    $rows_langchain .= cc_diag_pass(
        $fc['label'] . ' — file',
        $fc_bytes . ' bytes, modified ' . $fc_mtime
    );
    foreach ($fc['markers'] as $m) {
        if (strpos($fc_content, $m['needle']) !== false) {
            $rows_langchain .= cc_diag_pass(
                $fc['label'] . ' — ' . $m['needle'],
                $m['desc']
            );
        } else {
            $label = $fc['label'] . ' — ' . $m['needle'] . ' MISSING';
            $detail = 'NOT FOUND in build. ' . $m['desc']
                . ' This file is STALE. Install the latest plugin ZIP and purge Moodle caches.';
            $rows_langchain .= cc_diag_fail($label, $detail);
            if ($m['critical']) {
                $lc_any_critical_fail = true;
                $overall_pass = false;
            }
        }
    }
}

// ── German content sample from manifest ──────────────────────────────────────
if ($cmid <= 0) {
    $rows_langchain .= cc_diag_info(
        'German content sample',
        'Append ?cmid=<cmid> to inspect a specific activity\'s German card content.'
    );
} elseif ($cc === null || empty($cc->manifestjson)) {
    $rows_langchain .= cc_diag_info(
        'German content sample',
        'Activity or manifest not loaded — see Section 3.'
    );
} else {
    $lc_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($lc_manifest)) {
        $rows_langchain .= cc_diag_fail('German content sample', 'Manifest JSON is invalid — cannot read multiLanguage data.');
    } else {
        $lc_ml = $lc_manifest['multiLanguage'] ?? [];
        $lc_de = null;
        foreach ($lc_ml as $lc_entry) {
            if (($lc_entry['code'] ?? '') === 'de-DE') {
                $lc_de = $lc_entry;
                break;
            }
        }

        if ($lc_de === null) {
            $rows_langchain .= cc_diag_info(
                'German multiLanguage entry (de-DE)',
                'NOT FOUND in this activity\'s manifest. Either German was not selected as an additional language, '
              . 'or the German generation step failed/was interrupted. '
              . 'To add German: open the activity in edit mode → Voice Settings → tick the German checkbox → click Generate.'
            );
        } else {
            $lc_de_topics = $lc_de['topics'] ?? [];
            $rows_langchain .= cc_diag_pass(
                'German multiLanguage entry (de-DE)',
                count($lc_de_topics) . ' topic(s) present in manifest.'
            );

            // Sample raw card text — use the existing cc_diag_collect_card_text helper
            $lc_de_sample = cc_diag_collect_card_text($lc_de_topics, 500);
            $lc_en_sample = cc_diag_collect_card_text($lc_manifest['topics'] ?? [], 500);

            if (!empty($lc_de_sample)) {
                // Rough similarity: compare normalised strings
                $lc_de_norm = mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($lc_de_sample)));
                $lc_en_norm = mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($lc_en_sample)));
                $lc_overlap = 0;
                if (!empty($lc_de_norm) && !empty($lc_en_norm)) {
                    similar_text($lc_de_norm, $lc_en_norm, $lc_pct);
                    $lc_overlap = (int)round($lc_pct);
                }

                $lc_snippet = htmlspecialchars(mb_substr(strip_tags($lc_de_sample), 0, 400));
                $rows_langchain .= cc_diag_info(
                    'German card text sample (first 400 chars)',
                    '<code style="font-size:0.8rem;white-space:pre-wrap;display:block;">' . $lc_snippet . '</code>'
                );

                if ($lc_overlap >= 80) {
                    $rows_langchain .= cc_diag_fail(
                        'German vs English similarity',
                        $lc_overlap . '% identical to English content — this IS the language generation failure. '
                      . 'German text and English text are essentially the same, confirming the LLM generated English for both. '
                      . 'Root cause: one of the build file markers above is missing (stale AMD cache), OR the Moodle server-side JS cache has not been purged.'
                    );
                    $lc_any_critical_fail = true;
                } elseif ($lc_overlap >= 55) {
                    $rows_langchain .= cc_diag_info(
                        'German vs English similarity',
                        $lc_overlap . '% similar to English content — partial overlap. Some content may be translated but topic structure/slide titles may still be English. Regenerate after purging caches.'
                    );
                } else {
                    $rows_langchain .= cc_diag_pass(
                        'German vs English similarity',
                        $lc_overlap . '% overlap — content appears to be genuinely different from English. German generation is likely working correctly.'
                    );
                }
            } else {
                $rows_langchain .= cc_diag_info('German card text sample', 'No readable card text found in the de-DE topics.');
            }
        }
    }
}

// ── Moodle cache advisory — always shown as prominent verdict ─────────────────
if ($lc_any_critical_fail) {
    $rows_langchain .= cc_diag_fail(
        'ACTION REQUIRED — Moodle server-side JS cache',
        'One or more critical build markers are MISSING (see FAILs above), OR German content matches English. '
      . 'Ctrl+Shift+R (browser hard-reload) does NOT fix this — it only clears the browser cache. '
      . 'Moodle compiles its own JavaScript server-side and serves it from an internal jsrev cache that '
      . 'is completely separate from the browser cache. Even with v12.94 plugin files on disk, Moodle will '
      . 'serve the old pre-fix JavaScript until you run the server-side purge. '
      . 'Steps: (1) Site Admin → Development → Purge all caches → wait for completion message. '
      . '(2) Hard-reload the browser: Ctrl+Shift+R. '
      . '(3) Open the activity in edit mode and click Generate with German ticked.'
    );
} else {
    $rows_langchain .= cc_diag_pass(
        'Moodle server-side JS cache advisory',
        'All build markers are PRESENT. If German content is still generating in English after seeing all-PASS here, '
      . 'the Moodle server-side JS cache is the only remaining cause. '
      . 'Steps: (1) Site Admin → Development → Purge all caches. '
      . '(2) Hard-reload browser: Ctrl+Shift+R. '
      . '(3) Regenerate. '
      . 'Remember: Ctrl+Shift+R alone is NOT sufficient — the server-side purge must happen first.'
    );
}

// ── SECTION 15: German (de-DE) — end-to-end failure diagnosis ────────────────
// A single focused section that answers ONE question: "Why is German not working?"
// Covers every known failure mode in order from most-common to least-common:
//   A. AMD build files missing the German markers (stale build / unpurged cache)
//   B. TTS voice ID resolution for de-DE
//   C. Player language-switcher code (activeLang threading fixes)
//   D. Manifest German content state (requires cmid)
//   E. Live German TTS probe (skippable with ?nottstest=1)
//   F. Consolidated verdict

$rows_german = '';
$de_any_fail = false;

// ─────────────────────────────────────────────────────────────────────────────
// 15A: AMD build file markers specific to German content generation
// ─────────────────────────────────────────────────────────────────────────────

$de_build_checks = [
    // prompts.js — the heart of German text generation
    [
        'file'   => 'prompts.js',
        'label'  => 'prompts.js',
        'checks' => [
            [
                'needle'   => 'de-DE',
                'pass_msg' => '"de-DE" found in LANGUAGE_NAMES map — getLanguageName(\'de-DE\') returns "German". System prompt will read "Generate ALL content in German".',
                'fail_msg' => '"de-DE" NOT found. getLanguageName(\'de-DE\') returns undefined — every prompt reads "Generate ALL content in undefined". The LLM ignores the instruction and falls back to English. Install the latest plugin ZIP and purge Moodle caches.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLangPrefixForUserPrompt',
                'pass_msg' => 'getLangPrefixForUserPrompt() present (FIX-CC-MULTILANG-TEXT v12.69). Injects "!!MANDATORY LANGUAGE REQUIREMENT!! — Generate EVERY word in German" as the first line of every user prompt, overriding the weight of 12,000 chars of English reference material.',
                'fail_msg' => 'getLangPrefixForUserPrompt() NOT found. This is the most common reason German content generates in English. Without this function the user prompt starts with English context and the LLM treats English as the target language regardless of the system prompt instruction. Install the latest plugin ZIP and purge Moodle caches.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLanguageInstructions',
                'pass_msg' => 'getLanguageInstructions() present — builds the "IMPORTANT: Generate ALL content in German" system prompt block.',
                'fail_msg' => 'getLanguageInstructions() NOT found. The system prompt has no language instruction block. LLM generates English regardless of selected language.',
                'critical' => true,
            ],
        ],
    ],
    // generator.js — threads the language code from manifest into prompt calls
    [
        'file'   => 'generator.js',
        'label'  => 'generator.js',
        'checks' => [
            [
                'needle'   => 'context.language',
                'pass_msg' => 'context.language present — language code is threaded from voiceSettings through context into both prompt builder calls.',
                'fail_msg' => 'context.language NOT found. The language code never reaches Prompts.getLanguageInstructions() or Prompts.getLangPrefixForUserPrompt(). Both functions receive an empty/undefined language and produce no German instruction.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLanguageInstructions',
                'pass_msg' => 'getLanguageInstructions() call present — generator correctly injects the German system prompt block.',
                'fail_msg' => 'getLanguageInstructions() call NOT found. System prompt language block is never built.',
                'critical' => true,
            ],
            [
                'needle'   => 'getLangPrefixForUserPrompt',
                'pass_msg' => 'getLangPrefixForUserPrompt() call present — mandatory German language gate is prepended to user prompts.',
                'fail_msg' => 'getLangPrefixForUserPrompt() call NOT found. Mandatory language gate is absent from user prompts.',
                'critical' => true,
            ],
        ],
    ],
    // builder.js — German checkbox + multi-language generation loop
    [
        'file'   => 'builder.js',
        'label'  => 'builder.js',
        'checks' => [
            [
                'needle'   => 'de-DE',
                'pass_msg' => '"de-DE" present in builder — German checkbox option renders in the Voice Settings panel.',
                'fail_msg' => '"de-DE" NOT found in builder.js. The German checkbox does not exist in the UI — teachers cannot select German.',
                'critical' => true,
            ],
            [
                'needle'   => 'FIX-CC-ML-LANG-CAPTURE',
                'pass_msg' => 'FIX-CC-ML-LANG-CAPTURE (v12.66) present — IIFE closure correctly captures the German language code as a function parameter, preventing it from being overwritten mid-loop when async retries run after the for-loop has advanced to the next language.',
                'fail_msg' => 'FIX-CC-ML-LANG-CAPTURE NOT found. The multi-language generation loop has a closure-capture bug: if async retries fire after the for-loop index has advanced, all voiceover requests are sent with the LAST language code instead of German. German audio is generated in the wrong language.',
                'critical' => true,
            ],
            [
                'needle'   => 'multiLanguage',
                'pass_msg' => '"multiLanguage" present — German content is stored in manifest.multiLanguage[] for the player to read.',
                'fail_msg' => '"multiLanguage" NOT found. German content has nowhere to be stored — player cannot display a German language tab.',
                'critical' => true,
            ],
            [
                'needle'   => 'additionalLangs',
                'pass_msg' => '"additionalLangs" loop present — builder correctly iterates selected additional languages and calls ManifestBuilder.build() for each.',
                'fail_msg' => '"additionalLangs" NOT found. Additional language generation loop is missing — German content is never generated even when the checkbox is ticked.',
                'critical' => true,
            ],
        ],
    ],
    // player5.js — German language-switcher on the student view
    [
        'file'   => 'player5.js',
        'label'  => 'player5.js',
        'checks' => [
            [
                'needle'   => 'activeLang',
                'pass_msg' => '"activeLang" present — player tracks which additional language the student/teacher has switched to.',
                'fail_msg' => '"activeLang" NOT found. Player cannot track German as the active language — language pill clicks have no effect.',
                'critical' => true,
            ],
            [
                'needle'   => 'multiLanguage',
                'pass_msg' => '"multiLanguage" present — player reads German content from manifest.multiLanguage[] when the student clicks the German pill.',
                'fail_msg' => '"multiLanguage" NOT found. Player cannot read German content — language pill renders but switching shows no content.',
                'critical' => true,
            ],
            [
                'needle'   => 'FIX-CC-PRIORITY-LANG',
                'pass_msg' => 'FIX-CC-PRIORITY-LANG (v12.79) present — player sends activeLang (not voiceLanguage) to the TTS API when a student has switched to German. Without this fix, German voiceovers are synthesised in English.',
                'fail_msg' => 'FIX-CC-PRIORITY-LANG (v12.79) NOT found. When a student switches to the German language pill, TTS requests are still sent with the primary voiceLanguage (e.g. en-AU). German voiceovers speak English.',
                'critical' => true,
            ],
            [
                'needle'   => 'FIX-CC-MULTILANG-LANG',
                'pass_msg' => 'FIX-CC-MULTILANG-LANG (v12.63) present — formData.append(\'language\', activeLang || voiceLanguage) fix in place.',
                'fail_msg' => 'FIX-CC-MULTILANG-LANG (v12.63) NOT found. TTS language override may not be reaching the server.',
                'critical' => false,
            ],
        ],
    ],
    // cc-voiceover.js — getEffectiveLang helper
    [
        'file'   => 'cc-voiceover.js',
        'label'  => 'cc-voiceover.js',
        'checks' => [
            [
                'needle'   => 'getEffectiveLang',
                'pass_msg' => 'getEffectiveLang() present — single source of truth for resolving the active TTS language. Returns activeLang when set, falling back to voiceLanguage. Prevents scattered (activeLang || voiceLanguage) expressions from diverging.',
                'fail_msg' => 'getEffectiveLang() NOT found — scattered language resolution expressions may be inconsistent. German TTS language may not be sent correctly in all contexts.',
                'critical' => false,
            ],
            [
                'needle'   => 'de-DE',
                'pass_msg' => '"de-DE" present in cc-voiceover.js language display name map — German label renders in voiceover status UI.',
                'fail_msg' => '"de-DE" NOT found in cc-voiceover.js. German voiceover status may show the raw code "de-DE" instead of a friendly label.',
                'critical' => false,
            ],
        ],
    ],
];

foreach ($de_build_checks as $fc) {
    $filepath = $build_dir . $fc['file'];
    if (!file_exists($filepath)) {
        $rows_german .= cc_diag_fail(
            $fc['label'] . ' (amd/build)',
            'File not found: ' . $filepath . ' — AMD build is incomplete. The plugin was not installed correctly or the build directory is wrong.'
        );
        $de_any_fail = true;
        continue;
    }
    $fc_content = file_get_contents($filepath);
    $fc_size    = number_format(filesize($filepath));
    $fc_mtime   = date('Y-m-d H:i', filemtime($filepath));
    $rows_german .= cc_diag_pass($fc['label'] . ' (amd/build) — file', $fc_size . ' bytes, last modified ' . $fc_mtime);

    foreach ($fc['checks'] as $chk) {
        if (strpos($fc_content, $chk['needle']) !== false) {
            $rows_german .= cc_diag_pass($fc['label'] . ' — ' . $chk['needle'], $chk['pass_msg']);
        } else {
            if ($chk['critical']) {
                $rows_german .= cc_diag_fail($fc['label'] . ' — ' . $chk['needle'] . ' MISSING', $chk['fail_msg']);
                $de_any_fail = true;
                $overall_pass = false;
            } else {
                $rows_german .= cc_diag_info($fc['label'] . ' — ' . $chk['needle'] . ' not found', $chk['fail_msg']);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 15B: German TTS voice ID resolution
// Shows exactly how de-DE is resolved to a Chirp 3 HD voice ID on both
// code paths (ajax.php and classes/external/generate_voiceover.php).
// ─────────────────────────────────────────────────────────────────────────────

// ajax.php language mappings (from the $languageMappings array in that file)
$de_ajax_mappings = [
    'zh-CN' => 'cmn-CN',
    'zh-TW' => 'cmn-TW',
    'zh-HK' => 'yue-HK',
    'nb-NO' => 'no-NO',
];
$de_ajax_mapped   = $de_ajax_mappings['de-DE'] ?? 'de-DE';  // de-DE is NOT in the map → passes through
$de_ajax_voiceid  = $de_ajax_mapped . '-Chirp3-HD-Aoede';

// generate_voiceover.php language mappings (getChirpVoiceId method)
$de_ext_mappings  = [
    'zh-CN'  => 'cmn-CN',
    'zh-TW'  => 'cmn-TW',
    'zh-HK'  => 'yue-HK',
    'nb-NO'  => 'no-NO',
    'fil-PH' => 'fil-PH',
];
$de_ext_mapped    = $de_ext_mappings['de-DE'] ?? 'de-DE';   // de-DE is NOT in the map → passes through
$de_ext_voiceid   = $de_ext_mapped . '-Chirp3-HD-Aoede';

$rows_german .= cc_diag_info(
    'German TTS voice ID — ajax.php path',
    'Input: "de-DE" → not in language remapping table → passes through unchanged → voiceId = "'
    . htmlspecialchars($de_ajax_voiceid) . '". '
    . 'This is the voice used when a teacher pre-generates German voiceovers via the builder.'
);
$rows_german .= cc_diag_info(
    'German TTS voice ID — generate_voiceover.php path',
    'Input: "de-DE" → not in language remapping table → passes through unchanged → voiceId = "'
    . htmlspecialchars($de_ext_voiceid) . '". '
    . 'This is the voice used when a student triggers on-demand voiceover generation via the player (external web service call).'
);

if ($de_ajax_voiceid === $de_ext_voiceid) {
    $rows_german .= cc_diag_pass(
        'German voice ID consistency',
        'Both code paths resolve to the same voice ID: "' . htmlspecialchars($de_ajax_voiceid) . '". '
        . 'Teacher pre-generation and student on-demand generation use the same German voice.'
    );
} else {
    $rows_german .= cc_diag_fail(
        'German voice ID mismatch',
        'ajax.php resolves to "' . htmlspecialchars($de_ajax_voiceid) . '" but generate_voiceover.php resolves to "'
        . htmlspecialchars($de_ext_voiceid) . '". '
        . 'Teacher-generated and student-generated voiceovers will use different voices. Check the language mapping tables in both files.'
    );
    $de_any_fail = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 15C: German manifest content state (requires cmid)
// ─────────────────────────────────────────────────────────────────────────────

if ($cmid <= 0) {
    $rows_german .= cc_diag_info(
        'German manifest content (15C)',
        'No cmid provided — cannot inspect activity-specific German content. Append ?cmid=<cmid> to the URL to include this section.'
    );
} elseif ($cc === null) {
    $rows_german .= cc_diag_info('German manifest content (15C)', 'Activity not loaded — see Section 3.');
} elseif (empty($cc->manifestjson)) {
    $rows_german .= cc_diag_info('German manifest content (15C)', 'No manifest — content has not been generated for this activity yet. Generate content with German ticked first.');
} else {
    $de_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($de_manifest)) {
        $rows_german .= cc_diag_fail('German manifest content', 'Manifest JSON is invalid — cannot read German data.');
        $de_any_fail = true;
    } else {
        // Does the manifest have a German multiLanguage entry?
        $de_ml_arr = $de_manifest['multiLanguage'] ?? [];
        $de_entry  = null;
        foreach ($de_ml_arr as $mle) {
            if (($mle['code'] ?? '') === 'de-DE') {
                $de_entry = $mle;
                break;
            }
        }

        if ($de_entry === null) {
            $rows_german .= cc_diag_fail(
                'German (de-DE) in manifest.multiLanguage[]',
                'NOT FOUND. German content has never been generated for this activity, or the generation step failed/was interrupted. '
                . 'To fix: open the activity in teacher edit mode → Voice Settings panel → tick the "German" checkbox → click Generate. '
                . 'If the checkbox is ticked and you click Generate but German is still missing afterwards, the AMD build chain (15A) is the cause.'
            );
            $de_any_fail = true;
            $overall_pass = false;
        } else {
            $de_topics = $de_entry['topics'] ?? [];
            if (empty($de_topics)) {
                $rows_german .= cc_diag_fail(
                    'German multiLanguage entry — topics',
                    'Entry exists in manifest but topics[] is EMPTY. The German generation step started but produced no content. '
                    . 'Likely cause: API error mid-generation, credit exhaustion, or server timeout. '
                    . 'Fix: re-open the activity → tick German → click Generate again.'
                );
                $de_any_fail = true;
                $overall_pass = false;
            } else {
                // Count sections and cards
                $de_section_count = 0;
                $de_card_count    = 0;
                $de_vo_count      = 0;      // sections with a voiceover URL
                $de_vo_lang_ok    = 0;      // URLs whose sectionid contains de-DE (lang was passed correctly)
                $de_vo_no_url     = 0;
                $de_topic_titles  = [];

                foreach ($de_topics as $de_t) {
                    $de_topic_titles[] = htmlspecialchars(mb_substr($de_t['title'] ?? '(no title)', 0, 50));
                    foreach (($de_t['sections'] ?? []) as $de_s) {
                        $de_section_count++;
                        $de_card_count += count($de_s['cards'] ?? []);
                        $vo_url = $de_s['voiceoverUrl'] ?? '';
                        if (!empty($vo_url) && $vo_url !== 'pregenerated') {
                            $de_vo_count++;
                            // The sectionid baked into the URL should contain the language code
                            // e.g. …?sectionid=de-DE_topic1_s1… confirms language was sent correctly
                            if (stripos($vo_url, 'de-DE') !== false || stripos($vo_url, 'de_DE') !== false) {
                                $de_vo_lang_ok++;
                            }
                        } elseif ($vo_url === 'pregenerated') {
                            $de_vo_count++;
                            $de_vo_lang_ok++;
                        } else {
                            $de_vo_no_url++;
                        }
                    }
                }

                $rows_german .= cc_diag_pass(
                    'German multiLanguage entry — found',
                    count($de_topics) . ' topic(s), ' . $de_section_count . ' section(s), ' . $de_card_count . ' card(s). '
                    . 'Topics: ' . implode(' | ', $de_topic_titles)
                );

                if ($de_section_count > 0 && $de_card_count === 0) {
                    $rows_german .= cc_diag_fail(
                        'German card count',
                        'Sections exist but ALL have 0 cards. German card content was not generated. '
                        . 'Cause: prompt returned an empty array, or the manifest was saved before generation completed. Regenerate with German ticked.'
                    );
                    $de_any_fail = true;
                    $overall_pass = false;
                } elseif ($de_card_count > 0) {
                    $rows_german .= cc_diag_pass(
                        'German card count',
                        $de_card_count . ' card(s) across ' . $de_section_count . ' section(s). Cards have content.'
                    );
                }

                // Voiceover language accuracy
                if ($de_vo_count > 0) {
                    if ($de_vo_lang_ok === $de_vo_count) {
                        $rows_german .= cc_diag_pass(
                            'German voiceover language accuracy',
                            $de_vo_count . '/' . $de_section_count . ' section(s) have a voiceover URL. '
                            . 'All URLs contain "de-DE" in the sectionid — the language code was passed correctly to the TTS API when these were generated.'
                        );
                    } elseif ($de_vo_lang_ok === 0 && $de_vo_count > 0) {
                        $rows_german .= cc_diag_fail(
                            'German voiceover language accuracy',
                            $de_vo_count . ' German section(s) have voiceover URLs but NONE contain "de-DE" in the URL. '
                            . 'This strongly suggests the TTS API received the primary language code (e.g. en-AU) instead of de-DE when these were generated — the voiceovers speak English. '
                            . 'Cause: FIX-CC-PRIORITY-LANG (v12.79) was missing from player5.js at generation time. '
                            . 'Fix: install the latest plugin → purge Moodle caches → re-open activity as teacher → force-regenerate German sections (delete German multiLanguage entry and regenerate).'
                        );
                        $de_any_fail = true;
                        $overall_pass = false;
                    } else {
                        $rows_german .= cc_diag_info(
                            'German voiceover language accuracy',
                            $de_vo_count . ' section(s) have voiceover URLs. '
                            . $de_vo_lang_ok . ' contain "de-DE" in the URL, ' . ($de_vo_count - $de_vo_lang_ok) . ' do not. '
                            . 'The sections without "de-DE" may have been generated before the language-fix was installed. Regenerate those sections with the latest plugin installed and caches purged.'
                        );
                    }
                } elseif ($de_section_count > 0) {
                    $rows_german .= cc_diag_info(
                        'German voiceover URLs',
                        'None of the ' . $de_section_count . ' German section(s) have a voiceover URL yet. '
                        . 'Teacher needs to open the activity in view mode to trigger German audio generation.'
                    );
                }

                if ($de_vo_no_url > 0) {
                    $rows_german .= cc_diag_info(
                        'German sections without voiceover URL',
                        $de_vo_no_url . '/' . $de_section_count . ' section(s) have no voiceover URL. '
                        . 'Students on the German tab will see an audio-generating spinner for these sections.'
                    );
                }

                // Content genuineness: compare German card text to English card text
                $de_card_sample = cc_diag_collect_card_text($de_topics, 600);
                $en_card_sample = cc_diag_collect_card_text($de_manifest['topics'] ?? [], 600);

                if (!empty($de_card_sample) && !empty($en_card_sample)) {
                    $de_norm = mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($de_card_sample)));
                    $en_norm = mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($en_card_sample)));
                    similar_text($de_norm, $en_norm, $de_pct);
                    $de_overlap = (int)round($de_pct);

                    $de_snippet = htmlspecialchars(mb_substr(strip_tags($de_card_sample), 0, 500));
                    $rows_german .= cc_diag_info(
                        'German card text sample (first 500 chars)',
                        '<code style="font-size:0.8rem;white-space:pre-wrap;display:block;background:#f9fafb;padding:6px;border-radius:3px;">'
                        . $de_snippet . '</code>'
                    );

                    if ($de_overlap >= 80) {
                        $rows_german .= cc_diag_fail(
                            'German vs English text similarity — ' . $de_overlap . '%',
                            'LANGUAGE FAILURE CONFIRMED: German and English card text are ' . $de_overlap . '% identical. '
                            . 'The LLM generated English for the "German" pass — this is the direct evidence of the language instruction bug. '
                            . 'Root cause: one or more AMD build markers in 15A above are MISSING (stale build / unpurged Moodle cache). '
                            . 'Fix: (1) Confirm all 15A checks are PASS. (2) Site Admin → Development → Purge all caches. '
                            . '(3) Hard-reload browser: Ctrl+Shift+R. (4) Re-open the activity and regenerate with German ticked.'
                        );
                        $de_any_fail = true;
                        $overall_pass = false;
                    } elseif ($de_overlap >= 55) {
                        $rows_german .= cc_diag_info(
                            'German vs English text similarity — ' . $de_overlap . '%',
                            'Partial overlap (' . $de_overlap . '%). Some content appears to be translated but there is significant English carry-over. '
                            . 'This can happen if caches were purged mid-generation, or if topic titles/headings were generated in English while body text was translated. '
                            . 'Purge all Moodle caches and regenerate to get a clean German pass.'
                        );
                    } else {
                        $rows_german .= cc_diag_pass(
                            'German vs English text similarity — ' . $de_overlap . '%',
                            'Low overlap (' . $de_overlap . '%) — German content is genuinely different from English. '
                            . 'The language instruction is working correctly for this activity.'
                        );
                    }
                } elseif (!empty($de_card_sample)) {
                    $de_snippet = htmlspecialchars(mb_substr(strip_tags($de_card_sample), 0, 500));
                    $rows_german .= cc_diag_info(
                        'German card text sample',
                        '<code style="font-size:0.8rem;white-space:pre-wrap;display:block;background:#f9fafb;padding:6px;border-radius:3px;">'
                        . $de_snippet . '</code>'
                    );
                } else {
                    $rows_german .= cc_diag_info('German card text sample', 'No readable card text found in the German topics.');
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 15D: Live German TTS probe
// Fires a real de-DE TTS call. Costs 5 credits (or 0 if cached).
// Skip with ?nottstest=1.
// ─────────────────────────────────────────────────────────────────────────────

$de_tts_label = 'German TTS probe (de-DE)';

if ($skip_tts_test) {
    $rows_german .= cc_diag_info($de_tts_label, 'Skipped — ?nottstest=1 was passed. Remove that parameter to run the live probe.');
} elseif (empty($siteid) || empty($apikey)) {
    $rows_german .= cc_diag_fail($de_tts_label, 'Skipped — Site ID or API Key not configured. Fix Section 1 first.');
} else {
    $de_tts_lang    = 'de-DE';
    $de_tts_voiceid = 'de-DE-Chirp3-HD-Aoede';
    $de_tts_text    = 'Guten Tag.';   // minimal German text — fast, cheap, unambiguous
    $de_tts_apiurl  = 'https://lms-labs.com';

    $rows_german .= cc_diag_info(
        $de_tts_label . ' — request params',
        'languageCode=' . htmlspecialchars($de_tts_lang)
        . ' | voiceId=' . htmlspecialchars($de_tts_voiceid)
        . ' | text="' . htmlspecialchars($de_tts_text) . '"'
        . ' | endpoint=' . htmlspecialchars($de_tts_apiurl . '/api/moodle/content-creator/tts')
        . ' | creditsToUse=5 (0 if cached)'
    );

    $de_curl = new \curl();
    $de_curl->setopt([
        'CURLOPT_TIMEOUT'        => 30,
        'CURLOPT_CONNECTTIMEOUT' => 10,
        'CURLOPT_RETURNTRANSFER' => true,
    ]);
    $de_curl->setHeader(['Content-Type: application/json', 'Accept: application/json']);

    $de_payload = [
        'siteId'       => $siteid,
        'apiKey'       => $apikey,
        'text'         => $de_tts_text,
        'languageCode' => $de_tts_lang,
        'voiceId'      => $de_tts_voiceid,
        'voiceGender'  => 'female',
        'creditsToUse' => 5,
    ];

    $de_response  = $de_curl->post($de_tts_apiurl . '/api/moodle/content-creator/tts', json_encode($de_payload));
    $de_info      = $de_curl->get_info();
    $de_httpcode  = isset($de_info['http_code']) ? (int)$de_info['http_code'] : 0;
    $de_data      = @json_decode($de_response, true);
    $de_raw_err   = is_array($de_data)
        ? ($de_data['error'] ?? $de_data['message'] ?? $de_data['detail'] ?? '')
        : (string)$de_response;

    if ($de_httpcode >= 200 && $de_httpcode < 300) {
        $cached_note = (!empty($de_data['cached'])) ? ' (served from cache — 0 credits used)' : ' (audio generated — 5 credits used)';
        $rows_german .= cc_diag_pass(
            $de_tts_label . ' — result',
            'HTTP ' . $de_httpcode . ' — SUCCESS.' . $cached_note
            . ' audioType=' . ($de_data['audioType'] ?? '?')
            . '. The AI Grader server accepts German TTS requests for this account.'
        );
    } else {
        $de_raw_short = htmlspecialchars(substr((string)$de_raw_err, 0, 400));
        $de_any_fail  = true;
        $overall_pass = false;

        if ($de_httpcode === 0) {
            $de_diagnosis = 'HTTP 0 (cURL timeout / DNS failure) — Moodle cannot reach lms-labs.com. Check server outbound internet access and firewall rules.';
        } elseif ($de_httpcode === 403) {
            if (stripos($de_raw_err, 'credit') !== false || stripos($de_raw_err, 'balance') !== false || stripos($de_raw_err, 'insufficient') !== false) {
                $de_diagnosis = 'HTTP 403 — CREDITS EXHAUSTED. Account linked to this Site ID has no remaining credits. Top up on the AI Grader portal. German TTS cannot run.';
            } elseif (stripos($de_raw_err, 'voice') !== false || stripos($de_raw_err, 'locale') !== false || stripos($de_raw_err, 'language') !== false || stripos($de_raw_err, 'chirp') !== false) {
                $de_diagnosis = 'HTTP 403 — UNSUPPORTED VOICE / LANGUAGE. The voiceId "' . htmlspecialchars($de_tts_voiceid) . '" is rejected by the TTS service. German (de-DE) Chirp 3 HD may not be enabled on your account plan. Contact AI Grader support to enable German TTS.';
            } elseif (stripos($de_raw_err, 'plan') !== false || stripos($de_raw_err, 'tier') !== false || stripos($de_raw_err, 'feature') !== false || stripos($de_raw_err, 'upgrade') !== false) {
                $de_diagnosis = 'HTTP 403 — PLAN / FEATURE RESTRICTION. German TTS (or multilingual TTS in general) is not enabled on your subscription plan. Contact AI Grader support to enable it. Your primary language TTS may still work.';
            } else {
                $de_diagnosis = 'HTTP 403 — FORBIDDEN. Possible causes: (1) Credits exhausted. (2) German Chirp 3 HD not enabled on your plan. (3) Site ID / API Key mismatch. Raw: ' . $de_raw_short;
            }
        } elseif ($de_httpcode === 401) {
            $de_diagnosis = 'HTTP 401 — UNAUTHORISED. Site ID or API Key rejected. Check Section 1.';
        } elseif ($de_httpcode === 429) {
            $de_diagnosis = 'HTTP 429 — RATE LIMITED. Too many TTS requests in a short time. Wait 60 s and re-run diagnostics.';
        } elseif ($de_httpcode >= 500 && $de_httpcode <= 503) {
            $de_diagnosis = 'HTTP ' . $de_httpcode . ' — AI Grader SERVER ERROR. Transient. Try again in a few minutes. Raw: ' . $de_raw_short;
        } else {
            $de_diagnosis = 'HTTP ' . $de_httpcode . ' — Unexpected response. Raw: ' . $de_raw_short;
        }

        $rows_german .= cc_diag_fail($de_tts_label . ' — result', $de_diagnosis);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 15E: Consolidated German verdict
// ─────────────────────────────────────────────────────────────────────────────

if ($de_any_fail) {
    $rows_german .= cc_diag_fail(
        'German language — overall verdict',
        'ONE OR MORE FAILURE CONDITIONS FOUND (see FAILs above). '
        . 'Most common fix: (1) Check that all 15A AMD build markers are PASS. '
        . '(2) Site Admin → Development → Purge all caches (Ctrl+Shift+R in browser is NOT enough — Moodle has its own server-side JS cache). '
        . '(3) Hard-reload: Ctrl+Shift+R. '
        . '(4) Re-open the activity in teacher edit mode → tick German → click Generate. '
        . 'If 15A is all PASS and German content is still in English, contact AI Grader support and share this diagnostic report URL.'
    );
} else {
    $rows_german .= cc_diag_pass(
        'German language — overall verdict',
        'All German-specific checks PASSED. '
        . 'If German content is still generating in English, the Moodle server-side JS cache is the most likely remaining cause. '
        . 'Steps: (1) Site Admin → Development → Purge all caches. (2) Ctrl+Shift+R. (3) Regenerate. '
        . 'Remember: browser hard-reload alone is NOT sufficient — the server-side purge must happen first.'
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 16: Additional-language generation chain
// Checks: (A) builder.js _mlInputs voiceSettings.language = _mlLang.code,
//         (B) generator.js voiceSettings merge + FIX-CC-REPAIR-LANG,
//         (C) player5.js formData.append('language') call-site count,
//         (D) ajax.php generate_voice language parameter chain.
// ─────────────────────────────────────────────────────────────────────────────

$rows_s16 = '';
$s16_any_fail = false;

// ── 16A: builder.js _mlInputs voiceSettings.language ─────────────────────────
// If builder.js passes inputs.voiceSettings (primary en-AU) instead of
// { language: _mlLang.code }, generator.js's voiceSettings→context.language
// merge overwrites context.language to en-AU for every additional-language pass.

$s16_builder_build = $build_dir . 'builder.js';
if (!file_exists($s16_builder_build)) {
    $rows_s16 .= cc_diag_fail('16A builder.js (amd/build)', 'File not found — AMD build incomplete. Cannot verify _mlInputs voiceSettings.language.');
    $s16_any_fail = true;
    $overall_pass = false;
} else {
    $s16_builder_content = file_get_contents($s16_builder_build);

    // Count explicit "language: _mlLang.code" — should appear at least twice:
    // once in context Object.assign override, once in voiceSettings object.
    $s16_ml_count = substr_count($s16_builder_content, 'language:_mlLang.code')
                  + substr_count($s16_builder_content, 'language: _mlLang.code');

    if ($s16_ml_count >= 2) {
        $rows_s16 .= cc_diag_pass(
            '16A builder.js — _mlInputs voiceSettings.language = _mlLang.code',
            '"language: _mlLang.code" found ' . $s16_ml_count . ' time(s). '
            . 'Both context.language AND voiceSettings.language are explicitly set to the target language code (e.g. "de-DE") for each additional-language batch. '
            . 'generator.js receives voiceSettings.language="de-DE", so its voiceSettings→context.language merge correctly writes "de-DE" into context.language.'
        );
    } elseif ($s16_ml_count === 1) {
        $rows_s16 .= cc_diag_info(
            '16A builder.js — _mlInputs voiceSettings.language (partial — 1 occurrence)',
            '"language: _mlLang.code" found only once. Expected at least 2 (one in context Object.assign, one in voiceSettings). '
            . 'If voiceSettings.language still inherits inputs.voiceSettings.language (primary "en-AU"), '
            . 'generator.js will overwrite context.language to "en-AU" for the German pass. '
            . 'Check builder.js src and ensure _mlInputs.voiceSettings = { enabled: ..., gender: ..., language: _mlLang.code }.'
        );
    } else {
        $rows_s16 .= cc_diag_fail(
            '16A builder.js — _mlInputs voiceSettings.language MISSING',
            '"language: _mlLang.code" NOT found in builder.js build. '
            . 'The _mlInputs object for additional-language generation does NOT explicitly set voiceSettings.language. '
            . 'voiceSettings.language inherits the primary language (e.g. "en-AU"). '
            . 'generator.js\'s v6.5.8 merge then overwrites context.language to "en-AU", '
            . 'causing ALL German (and other additional-language) content to be generated in English. '
            . 'Fix: update builder.js to pass voiceSettings: { enabled: voiceoverEnabled, gender: voiceGender, language: _mlLang.code } in _mlInputs.'
        );
        $s16_any_fail = true;
        $overall_pass = false;
    }

    // FIX-CC-ML-LANG-CAPTURE: async closure var-capture fix for multi-language loops
    if (strpos($s16_builder_content, 'FIX-CC-ML-LANG-CAPTURE') !== false) {
        $rows_s16 .= cc_diag_pass(
            '16A builder.js — FIX-CC-ML-LANG-CAPTURE present',
            'Variable-capture fix (v12.66) confirmed. Each additional-language batch captures its language code '
            . 'in a function closure, preventing var-hoisting from causing async TTS callbacks to use the wrong (last) language.'
        );
    } else {
        $rows_s16 .= cc_diag_info(
            '16A builder.js — FIX-CC-ML-LANG-CAPTURE not found',
            'FIX-CC-ML-LANG-CAPTURE (v12.66) not detected. Without this fix, when generating multiple additional languages '
            . '(e.g. German + French), async TTS pre-generation callbacks may all use the last language code in the loop. '
            . 'Affects voiceover pre-generation ordering but not core content generation language.'
        );
    }
}

// ── 16B: generator.js voiceSettings merge + FIX-CC-REPAIR-LANG ───────────────
// Both must be present. If merge present but FIX-CC-REPAIR-LANG absent,
// the cacheKey/langBlock may use context.voiceLanguage ("en-AU") from the cache,
// returning the English system prompt even when context.language = "de-DE".

$s16_gen_build = $build_dir . 'generator.js';
if (!file_exists($s16_gen_build)) {
    $rows_s16 .= cc_diag_fail('16B generator.js (amd/build)', 'File not found — AMD build incomplete. Cannot verify context.language merge.');
    $s16_any_fail = true;
    $overall_pass = false;
} else {
    $s16_gen_content = file_get_contents($s16_gen_build);
    $s16_has_merge   = strpos($s16_gen_content, 'voiceSettings?.language') !== false
                     || strpos($s16_gen_content, 'voiceSettings.language') !== false;
    $s16_has_repair  = strpos($s16_gen_content, 'FIX-CC-REPAIR-LANG') !== false;

    if ($s16_has_merge && $s16_has_repair) {
        $rows_s16 .= cc_diag_pass(
            '16B generator.js — voiceSettings merge + FIX-CC-REPAIR-LANG both present',
            '(1) v6.5.8 merge: reads voiceSettings.language and writes into context.language at the start of generate(). '
            . 'With _mlInputs.voiceSettings.language="de-DE" (16A), context.language is set to "de-DE". '
            . '(2) FIX-CC-REPAIR-LANG (v12.71): cacheKey and langBlock use context.language first (not context.voiceLanguage), '
            . 'so the German system prompt is built and cached under "de-DE". '
            . 'Both together ensure German slides are generated in German.'
        );
    } elseif ($s16_has_merge && !$s16_has_repair) {
        $rows_s16 .= cc_diag_info(
            '16B generator.js — voiceSettings merge present, FIX-CC-REPAIR-LANG absent',
            'v6.5.8 merge found — context.language is set from voiceSettings.language. '
            . 'BUT FIX-CC-REPAIR-LANG (v12.71) is missing: the cacheKey may still use context.voiceLanguage ("en-AU"), '
            . 'causing the English system prompt to be returned from cache for all German slides. '
            . 'Install the latest plugin version (includes FIX-CC-REPAIR-LANG).'
        );
    } elseif (!$s16_has_merge && $s16_has_repair) {
        $rows_s16 .= cc_diag_info(
            '16B generator.js — FIX-CC-REPAIR-LANG present, voiceSettings merge absent',
            'FIX-CC-REPAIR-LANG (v12.71) found — cacheKey/langBlock use context.language first. '
            . 'The v6.5.8 voiceSettings merge is absent, so context.language is NOT overwritten by generator.js. '
            . 'context.language was set to "de-DE" by builder.js and is preserved. '
            . 'This combination should produce correct German generation if 16A (builder.js voiceSettings) is also correct.'
        );
    } else {
        $rows_s16 .= cc_diag_fail(
            '16B generator.js — BOTH voiceSettings merge AND FIX-CC-REPAIR-LANG MISSING',
            'Neither the v6.5.8 voiceSettings merge nor FIX-CC-REPAIR-LANG is present in generator.js. '
            . 'The cacheKey and langBlock fall back to context.voiceLanguage ("en-AU"), '
            . 'causing ALL additional-language content (German, French, etc.) to be generated in English. '
            . 'Install the latest plugin version.'
        );
        $s16_any_fail = true;
        $overall_pass = false;
    }
}

// ── 16C: player5.js TTS formData.append('language') call-site count ──────────
// Every code path that calls generate_voice must send formData.append('language', activeLang || voiceLanguage).
// Missing call sites send no language → PHP falls back to site primary (en-AU).

$s16_player_build = $build_dir . 'player5.js';
if (!file_exists($s16_player_build)) {
    $rows_s16 .= cc_diag_fail('16C player5.js (amd/build)', 'File not found — AMD build incomplete. Cannot count language append call sites.');
    $s16_any_fail = true;
    $overall_pass = false;
} else {
    $s16_player_content = file_get_contents($s16_player_build);

    $s16_append_total = substr_count($s16_player_content, "formData.append('language'");
    $s16_has_priority = strpos($s16_player_content, 'FIX-CC-PRIORITY-LANG') !== false;
    $s16_has_ml_lang  = strpos($s16_player_content, 'FIX-CC-MULTILANG-LANG') !== false;

    if ($s16_append_total === 0) {
        $rows_s16 .= cc_diag_fail(
            '16C player5.js — formData.append(\'language\') MISSING',
            'No formData.append(\'language\'...) found. TTS requests send no language code. '
            . 'PHP generate_voice falls back to $voicelanguage (site primary, typically "en-AU") for every voiceover. '
            . 'German voiceovers will be synthesised in English regardless of language tab. '
            . 'Install the latest plugin version.'
        );
        $s16_any_fail = true;
        $overall_pass = false;
    } else {
        $rows_s16 .= cc_diag_pass(
            '16C player5.js — formData.append(\'language\') call sites: ' . $s16_append_total,
            $s16_append_total . ' call site(s) send a language code to the TTS API. '
            . ($s16_has_priority
                ? 'FIX-CC-PRIORITY-LANG (v12.79) present — calls use (activeLang || voiceLanguage), so student\'s active language tab always takes priority.'
                : 'FIX-CC-PRIORITY-LANG (v12.79) marker not found — verify calls use activeLang not just voiceLanguage (check Section 15A).')
        );
    }

    if ($s16_has_ml_lang) {
        $rows_s16 .= cc_diag_pass(
            '16C player5.js — FIX-CC-MULTILANG-LANG present',
            'FIX-CC-MULTILANG-LANG (v12.63) confirmed — language append fix in place for the multi-language pre-generation path.'
        );
    } else {
        $rows_s16 .= cc_diag_info(
            '16C player5.js — FIX-CC-MULTILANG-LANG not found',
            'FIX-CC-MULTILANG-LANG (v12.63) marker not detected. '
            . 'The actual fix (formData.append with activeLang) may still be present — check call-site count above.'
        );
    }
}

// ── 16D: ajax.php generate_voice — PHP language parameter chain ───────────────
// Confirms PHP correctly reads the language param and forwards it to the TTS API.
// Chain: optional_param('language') → $effectiveLanguage → languageCode in TTS call.

$s16_ajax_path = __DIR__ . '/ajax.php';
if (!file_exists($s16_ajax_path)) {
    $rows_s16 .= cc_diag_fail('16D ajax.php', 'File not found: ' . htmlspecialchars($s16_ajax_path));
    $s16_any_fail = true;
    $overall_pass = false;
} else {
    $s16_ajax_content   = file_get_contents($s16_ajax_path);
    $s16_has_param      = strpos($s16_ajax_content, "optional_param('language'") !== false;
    $s16_has_eff        = strpos($s16_ajax_content, 'effectiveLanguage') !== false;
    $s16_has_api_lang   = strpos($s16_ajax_content, "'languageCode' => \$effectiveLanguage") !== false
                        || strpos($s16_ajax_content, '"languageCode" => $effectiveLanguage') !== false;

    if ($s16_has_param && $s16_has_eff && $s16_has_api_lang) {
        $rows_s16 .= cc_diag_pass(
            '16D ajax.php generate_voice — PHP language chain intact',
            '(1) optional_param(\'language\',...,PARAM_TEXT) reads the code sent by JS formData.append. '
            . '(2) $effectiveLanguage = !empty($requestLanguage) ? $requestLanguage : $voicelanguage — falls back to site language only if JS sent nothing. '
            . '(3) \'languageCode\' => $effectiveLanguage is passed to the TTS API call. '
            . 'For German: JS sends "de-DE" → $effectiveLanguage="de-DE" → languageCode="de-DE" → voiceId="de-DE-Chirp3-HD-Aoede". PHP chain is intact.'
        );
    } else {
        $s16_missing = [];
        if (!$s16_has_param) $s16_missing[] = 'optional_param(\'language\')';
        if (!$s16_has_eff)   $s16_missing[] = '$effectiveLanguage';
        if (!$s16_has_api_lang) $s16_missing[] = '\'languageCode\' => $effectiveLanguage in TTS API call';
        $rows_s16 .= cc_diag_fail(
            '16D ajax.php generate_voice — PHP language chain BROKEN',
            'Missing link(s): ' . implode(', ', $s16_missing) . '. '
            . 'Even if JS sends "de-DE" in formData, the TTS API call will use $voicelanguage (site primary, typically "en-AU"). '
            . 'All voiceovers will speak English regardless of the selected language tab.'
        );
        $s16_any_fail = true;
        $overall_pass = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 17: Moodle compiled JS cache — server-side jsrev inspection
// This is the #1 cause of "I installed the latest plugin but German still doesn't work".
// Checks: (A) jsrev value, (B) localcache/js/ for stale AMD bundles,
//         (C) debugdeveloper flag (.js vs .min.js serving).
// ─────────────────────────────────────────────────────────────────────────────

$rows_s17 = '';

// ── 17A: $CFG->jsrev ──────────────────────────────────────────────────────────
global $CFG;
$s17_jsrev       = isset($CFG->jsrev) ? (string)$CFG->jsrev : 'unknown';
$s17_localcache  = isset($CFG->localcachedir)
    ? rtrim($CFG->localcachedir, '/')
    : (isset($CFG->dataroot) ? rtrim($CFG->dataroot, '/') . '/localcache' : '');

$rows_s17 .= cc_diag_info(
    '17A Moodle $CFG->jsrev',
    'Current value: <strong>' . htmlspecialchars($s17_jsrev) . '</strong>. '
    . 'This number is appended to all AMD/JS URLs (e.g. ?jsrev=' . htmlspecialchars($s17_jsrev) . '). '
    . 'Moodle increments jsrev each time "Purge all caches" is run. '
    . 'If this value has not changed since the plugin was last updated, Moodle may be serving a stale compiled JS bundle.'
);

// ── 17B: localcache/js/ — compiled AMD bundles ────────────────────────────────
// Moodle (3.9+) compiles require.js AMD modules into concatenated bundles stored in
// $CFG->localcachedir/js/. If a bundle containing mod_contentcreator code is cached
// here from before the latest plugin install, the amd/build/*.js fix markers are
// irrelevant — Moodle serves the stale bundle instead.

$s17_js_cache_dir = $s17_localcache . '/js';

if (empty($s17_localcache) || !is_dir($s17_js_cache_dir)) {
    $rows_s17 .= cc_diag_info(
        '17B Moodle localcache/js/ directory',
        'Directory not found' . (empty($s17_localcache) ? ' (localcachedir unknown)' : (': ' . htmlspecialchars($s17_js_cache_dir))) . '. '
        . 'Moodle may use a different cache path on this server, or the JS cache has already been fully purged. '
        . 'This is not necessarily an error — Moodle will recompile on next page load.'
    );
} else {
    // Scan for any mod_contentcreator / player5 compiled files (recursive, max 5 000 entries)
    $s17_cc_files   = [];
    $s17_scan_count = 0;
    try {
        $s17_iter = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($s17_js_cache_dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($s17_iter as $s17_fi) {
            if (++$s17_scan_count > 5000) break;
            $fn = $s17_fi->getFilename();
            if (stripos($fn, 'contentcreator') !== false || stripos($fn, 'player5') !== false) {
                $s17_cc_files[] = $s17_fi->getPathname();
            }
        }
    } catch (\Exception $s17_ex) {
        $rows_s17 .= cc_diag_info('17B localcache/js/ scan error', htmlspecialchars($s17_ex->getMessage()));
    }

    if (empty($s17_cc_files)) {
        $rows_s17 .= cc_diag_pass(
            '17B Moodle localcache/js/ — no mod_contentcreator bundles cached',
            'No mod_contentcreator or player5 JS files found in ' . htmlspecialchars($s17_js_cache_dir)
            . ' (' . number_format($s17_scan_count) . ' entries scanned). '
            . 'Cache is clean for this plugin — Moodle will compile fresh AMD on the next page load.'
        );
    } else {
        // Critical fix markers to check in each cached bundle
        $s17_fix_markers = [
            'FIX-CC-REPAIR-LANG'     => 'German system prompt cached under correct language key (v12.71)',
            'FIX-CC-PRIORITY-LANG'   => 'TTS requests send activeLang not just voiceLanguage (v12.79)',
            'FIX-CC-ML-LANG-CAPTURE' => 'Async language-capture fix in multi-language loop (v12.66)',
        ];
        $s17_stale_found = false;

        foreach (array_slice($s17_cc_files, 0, 10) as $s17_cf) {
            $s17_cf_raw   = @file_get_contents($s17_cf);
            $s17_cf_size  = number_format((int)@filesize($s17_cf));
            $s17_cf_mtime = @filemtime($s17_cf) ? date('Y-m-d H:i', (int)@filemtime($s17_cf)) : '?';

            $s17_marker_results = [];
            $s17_any_miss = false;
            foreach ($s17_fix_markers as $mk => $desc) {
                $found = ($s17_cf_raw !== false && strpos($s17_cf_raw, $mk) !== false);
                $s17_marker_results[] = ($found ? '<span style="color:#1a7a3f">&#10003;</span>' : '<span style="color:#c0392b">&#10007;</span>') . ' ' . $mk;
                if (!$found) $s17_any_miss = true;
            }
            $s17_marker_str = implode(' &nbsp; ', $s17_marker_results);

            if ($s17_any_miss) {
                $s17_stale_found = true;
                $rows_s17 .= cc_diag_fail(
                    '17B STALE cached bundle — ' . htmlspecialchars(basename($s17_cf)),
                    htmlspecialchars($s17_cf) . ' | ' . $s17_cf_size . ' bytes | modified ' . $s17_cf_mtime . '<br>'
                    . 'Fix markers: ' . $s17_marker_str . '<br>'
                    . '<strong>This stale compiled bundle is being served to users instead of the current amd/build/ files.</strong> '
                    . 'Teachers see old code even after installing the latest plugin ZIP. '
                    . 'Fix: Site Admin &#8594; Development &#8594; Purge all caches. Then Ctrl+Shift+R in browser.'
                );
            } else {
                $rows_s17 .= cc_diag_pass(
                    '17B Cached bundle — ' . htmlspecialchars(basename($s17_cf)),
                    htmlspecialchars($s17_cf) . ' | ' . $s17_cf_size . ' bytes | modified ' . $s17_cf_mtime . ' | '
                    . 'Markers: ' . $s17_marker_str
                );
            }
        }

        if (count($s17_cc_files) > 10) {
            $rows_s17 .= cc_diag_info(
                '17B localcache/js/ — results truncated',
                count($s17_cc_files) . ' total matching files; first 10 shown above.'
            );
        }

        if ($s17_stale_found) {
            $rows_s17 .= cc_diag_fail(
                '17B Moodle JS cache — STALE BUNDLES DETECTED',
                'One or more cached JS bundles for mod_contentcreator are missing critical fix markers. '
                . 'Moodle is serving OLD code — the plugin amd/build/ files are current but the compiled cache is not. '
                . '<strong>This is the most common reason "I installed the latest plugin but German still doesn\'t work."</strong> '
                . 'Fix: Site Admin &#8594; Development &#8594; Purge all caches &#8594; Ctrl+Shift+R (browser hard-reload).'
            );
            $overall_pass = false;
        } else {
            $rows_s17 .= cc_diag_pass(
                '17B Moodle JS cache — all cached bundles up to date',
                count($s17_cc_files) . ' cached file(s) checked — all contain required fix markers.'
            );
        }
    }
}

// ── 17C: debugdeveloper — which file Moodle actually serves ──────────────────
// debugdeveloper=true → .js (non-minified) served. debugdeveloper=false → .min.js served.
// A stale non-min build/player5.js only matters when debugdeveloper is on.

$s17_devmode = !empty($CFG->debugdeveloper);
if ($s17_devmode) {
    $rows_s17 .= cc_diag_info(
        '17C Moodle debugdeveloper — DEVELOPER MODE (non-minified JS served)',
        '$CFG->debugdeveloper = true. Moodle serves NON-MINIFIED amd/build/*.js (not *.min.js). '
        . 'Sync state of amd/build/player5.js is critical here. '
        . 'If player5.js (non-min) is stale while player5.min.js is current, this server runs older code than a production install. '
        . 'Check Section 5 (source-to-build sync) and Section 11 (player JS fix markers) to confirm.'
    );
} else {
    $rows_s17 .= cc_diag_pass(
        '17C Moodle debugdeveloper — PRODUCTION MODE (minified JS served)',
        '$CFG->debugdeveloper = false. Moodle serves amd/build/*.min.js for all AMD modules. '
        . 'amd/build/player5.min.js is the file that matters — amd/build/player5.js (non-min) is not served in this mode. '
        . 'Sections 11 and 15A verify player5.min.js fix markers directly.'
    );
}

// ── SECTION 18: FIX-CC-LANG-EXPLICIT verification — v12.99 language fix active? ──
// Answers: "Is the v12.99 language fix installed AND did it actually fix the content
// for the languages in this activity?"
//
// (A) Checks generator.js build + ajax.php for the FIX-CC-LANG-EXPLICIT marker.
// (B) For every additional language in manifest.multiLanguage[], compares card text
//     similarity to primary (English) text to detect silent English fallback.
// (C) Shows a card text sample per language for visual confirmation.
// ─────────────────────────────────────────────────────────────────────────────

$rows_s18     = '';
$s18_any_fail = false;

// ─────────────────────────────────────────────────────────────────────────────
// 18A: FIX-CC-LANG-EXPLICIT marker in AMD build and PHP
// ─────────────────────────────────────────────────────────────────────────────

$s18_gen_build_path = __DIR__ . '/amd/build/generator.js';
$s18_gen_min_path   = __DIR__ . '/amd/build/generator.min.js';
$s18_ajax_path      = __DIR__ . '/ajax.php';

// generator.js build — look for the formData.append('language' line added in v12.99
$s18_gen_marker     = "formData.append('language'";   // present in callAI after v12.99
$s18_gen_fix_marker = 'FIX-CC-LANG-EXPLICIT';         // comment marker

if (file_exists($s18_gen_build_path)) {
    $s18_gen_content = file_get_contents($s18_gen_build_path);
    if (strpos($s18_gen_content, $s18_gen_marker) !== false) {
        $rows_s18 .= cc_diag_pass(
            '18A generator.js build — language param present',
            'amd/build/generator.js contains <code>formData.append(\'language\')</code>. '
            . 'The callAI() function sends an explicit language field to generate_slide_async — '
            . 'this is the core v12.99 fix that prevents secondary AI passes from reverting to English.'
        );
    } else {
        $rows_s18 .= cc_diag_fail(
            '18A generator.js build — language param MISSING',
            'amd/build/generator.js does NOT contain <code>formData.append(\'language\')</code>. '
            . 'The v12.99 fix is NOT compiled into the build file. '
            . 'Fix: (1) Confirm you installed the v12.99 plugin ZIP (check plugin version in Section header above). '
            . '(2) Site Admin → Development → Purge all caches. '
            . '(3) Hard-reload: Ctrl+Shift+R. '
            . 'Secondary AI passes will continue to rewrite non-English content back to English until this is resolved.'
        );
        $s18_any_fail = true;
        $overall_pass = false;
    }
    // Also check the min build
    if (file_exists($s18_gen_min_path)) {
        $s18_gen_min_content = file_get_contents($s18_gen_min_path);
        if (strpos($s18_gen_min_content, $s18_gen_marker) !== false) {
            $rows_s18 .= cc_diag_pass(
                '18A generator.min.js build — language param present',
                'amd/build/generator.min.js (served in production mode) also contains the language param. '
                . 'Both non-minified and minified builds are in sync.'
            );
        } else {
            $rows_s18 .= cc_diag_fail(
                '18A generator.min.js build — language param MISSING',
                'amd/build/generator.min.js does NOT contain the language param. '
                . 'In production mode (non-developer), Moodle serves the .min.js file — so the v12.99 fix is NOT active for students. '
                . 'Reinstall the v12.99 plugin ZIP and purge all Moodle caches.'
            );
            $s18_any_fail = true;
            $overall_pass = false;
        }
    } else {
        $rows_s18 .= cc_diag_info('18A generator.min.js build', 'File not found: amd/build/generator.min.js — cannot verify minified build.');
    }
} else {
    $rows_s18 .= cc_diag_fail('18A generator.js build', 'File not found: amd/build/generator.js. Plugin may not be installed correctly.');
    $s18_any_fail = true;
    $overall_pass = false;
}

// ajax.php — check it reads the explicit language param
if (file_exists($s18_ajax_path)) {
    $s18_ajax_content = file_get_contents($s18_ajax_path);
    // Look for optional_param('language' inside generate_slide_async
    if (strpos($s18_ajax_content, "optional_param('language'") !== false
        || strpos($s18_ajax_content, 'optional_param("language"') !== false) {
        $rows_s18 .= cc_diag_pass(
            '18A ajax.php — explicit language param read',
            'ajax.php contains <code>optional_param(\'language\')</code> in generate_slide_async. '
            . 'The PHP handler reads the language field sent by JS and forwards it to the lms-labs.com API payload. '
            . 'This eliminates the fragile server-side text extraction that failed for German.'
        );
    } else {
        $rows_s18 .= cc_diag_fail(
            '18A ajax.php — explicit language param MISSING',
            'ajax.php does NOT contain <code>optional_param(\'language\')</code>. '
            . 'The PHP side of the v12.99 fix is missing. Even if generator.js sends the language field, '
            . 'ajax.php is not reading it and the API call goes out without the explicit language parameter. '
            . 'Reinstall the v12.99 plugin ZIP.'
        );
        $s18_any_fail = true;
        $overall_pass = false;
    }
} else {
    $rows_s18 .= cc_diag_info('18A ajax.php', 'File not found — cannot verify PHP side of the fix.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 18B: Per-language card text similarity check (requires cmid)
// ─────────────────────────────────────────────────────────────────────────────

if ($cmid <= 0) {
    $rows_s18 .= cc_diag_info(
        '18B Per-language content check',
        'No cmid provided — cannot inspect activity-specific content. '
        . 'Append <code>?cmid=N</code> to the URL to include this check. '
        . 'This is the most direct way to confirm the v12.99 fix worked: it compares each additional language\'s '
        . 'card text to English and flags any that are suspiciously similar (i.e. still in English).'
    );
} elseif ($cc === null) {
    $rows_s18 .= cc_diag_info('18B Per-language content check', 'Activity not loaded — see Section 3.');
} elseif (empty($cc->manifestjson)) {
    $rows_s18 .= cc_diag_info(
        '18B Per-language content check',
        'No manifest found — content has not been generated for this activity yet.'
    );
} else {
    $s18_manifest = json_decode($cc->manifestjson, true);
    if (!is_array($s18_manifest)) {
        $rows_s18 .= cc_diag_fail('18B Per-language content check', 'Manifest JSON is invalid — cannot parse.');
        $s18_any_fail = true;
        $overall_pass = false;
    } else {
        $s18_ml_arr   = $s18_manifest['multiLanguage'] ?? [];
        $s18_en_topics = $s18_manifest['topics'] ?? [];
        $s18_en_sample = cc_diag_collect_card_text($s18_en_topics, 800);
        $s18_en_norm   = !empty($s18_en_sample)
            ? mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($s18_en_sample)))
            : '';

        if (empty($s18_ml_arr)) {
            $rows_s18 .= cc_diag_info(
                '18B No additional languages in manifest',
                'manifest.multiLanguage[] is empty — no additional languages have been generated for this activity. '
                . 'Generate content with at least one additional language ticked to use this check.'
            );
        } else {
            $rows_s18 .= cc_diag_info(
                '18B Additional languages found',
                count($s18_ml_arr) . ' additional language(s) in manifest.multiLanguage[]: '
                . implode(', ', array_map(function ($e) {
                    return htmlspecialchars(($e['code'] ?? '?') . ' (' . ($e['label'] ?? '?') . ')');
                }, $s18_ml_arr))
            );

            $s18_pass_count = 0;
            $s18_fail_count = 0;
            $s18_info_count = 0;

            foreach ($s18_ml_arr as $s18_ml_entry) {
                $s18_lang_code  = $s18_ml_entry['code']   ?? '?';
                $s18_lang_label = $s18_ml_entry['label']  ?? $s18_lang_code;
                $s18_ml_topics  = $s18_ml_entry['topics'] ?? [];
                $s18_prefix     = '18B [' . htmlspecialchars($s18_lang_code) . ']';

                if (empty($s18_ml_topics)) {
                    $rows_s18 .= cc_diag_fail(
                        $s18_prefix . ' topics array EMPTY',
                        htmlspecialchars($s18_lang_label) . ' entry exists in multiLanguage[] but topics[] is empty. '
                        . 'Generation started but produced no content (API error, credit exhaustion, or timeout). '
                        . 'Fix: re-open activity → tick ' . htmlspecialchars($s18_lang_label) . ' → regenerate.'
                    );
                    $s18_fail_count++;
                    $s18_any_fail = true;
                    $overall_pass = false;
                    continue;
                }

                // Count topics, sections, cards
                $s18_section_count = 0;
                $s18_card_count    = 0;
                foreach ($s18_ml_topics as $s18_t) {
                    foreach (($s18_t['sections'] ?? []) as $s18_s) {
                        $s18_section_count++;
                        $s18_card_count += count($s18_s['cards'] ?? []);
                    }
                }

                $rows_s18 .= cc_diag_info(
                    $s18_prefix . ' structure',
                    count($s18_ml_topics) . ' topic(s), '
                    . $s18_section_count . ' section(s), '
                    . $s18_card_count . ' card(s).'
                );

                if ($s18_card_count === 0) {
                    $rows_s18 .= cc_diag_fail(
                        $s18_prefix . ' cards EMPTY',
                        htmlspecialchars($s18_lang_label) . ' sections exist but contain 0 cards. '
                        . 'Card content was not generated. Regenerate with this language ticked.'
                    );
                    $s18_fail_count++;
                    $s18_any_fail = true;
                    $overall_pass = false;
                    continue;
                }

                // Collect card text sample
                $s18_lang_sample = cc_diag_collect_card_text($s18_ml_topics, 800);
                $s18_lang_norm   = !empty($s18_lang_sample)
                    ? mb_strtolower(preg_replace('/\s+/', ' ', strip_tags($s18_lang_sample)))
                    : '';

                // Show card text snippet
                $s18_snippet = htmlspecialchars(mb_substr(strip_tags($s18_lang_sample), 0, 400));
                $rows_s18 .= cc_diag_info(
                    $s18_prefix . ' card text sample',
                    '<code style="font-size:0.8rem;white-space:pre-wrap;display:block;background:#f9fafb;padding:6px;border-radius:3px;">'
                    . $s18_snippet . '</code>'
                );

                // Similarity check vs English
                if (!empty($s18_lang_norm) && !empty($s18_en_norm)) {
                    similar_text($s18_lang_norm, $s18_en_norm, $s18_sim_pct);
                    $s18_sim = (int)round($s18_sim_pct);

                    if ($s18_sim >= 80) {
                        $rows_s18 .= cc_diag_fail(
                            $s18_prefix . ' vs English similarity — ' . $s18_sim . '% — LANGUAGE FAILURE',
                            'CONFIRMED: ' . htmlspecialchars($s18_lang_label) . ' card text is '
                            . $s18_sim . '% identical to English. '
                            . 'The AI generated English for the "' . htmlspecialchars($s18_lang_label) . '" pass — '
                            . 'the language instruction was not reaching the secondary AI passes (Pass 2 expansion / Pass 3 rewrite). '
                            . 'This content was generated BEFORE the v12.99 fix was active. '
                            . 'Fix: (1) Confirm 18A checks above are all PASS. '
                            . '(2) Site Admin → Development → Purge all caches. '
                            . '(3) Re-open the activity → delete this language\'s multiLanguage entry → re-tick '
                            . htmlspecialchars($s18_lang_label) . ' → click Generate.'
                        );
                        $s18_fail_count++;
                        $s18_any_fail = true;
                        $overall_pass = false;
                    } elseif ($s18_sim >= 55) {
                        $rows_s18 .= cc_diag_info(
                            $s18_prefix . ' vs English similarity — ' . $s18_sim . '% — PARTIAL',
                            htmlspecialchars($s18_lang_label) . ' card text is ' . $s18_sim . '% similar to English. '
                            . 'Some content looks translated but there is notable English carry-over. '
                            . 'Possible causes: (a) content was partially generated before v12.99 was installed, '
                            . '(b) topic titles/headings were in English while card bodies were translated, '
                            . '(c) language has many English loanwords (normal for some languages). '
                            . 'If the content visually reads as ' . htmlspecialchars($s18_lang_label) . ', this may be acceptable. '
                            . 'Otherwise: purge caches → delete this language entry → regenerate.'
                        );
                        $s18_info_count++;
                    } else {
                        $rows_s18 .= cc_diag_pass(
                            $s18_prefix . ' vs English similarity — ' . $s18_sim . '% — PASS',
                            htmlspecialchars($s18_lang_label) . ' card text is only ' . $s18_sim . '% similar to English. '
                            . 'The language instruction reached all AI passes correctly — content is genuinely in '
                            . htmlspecialchars($s18_lang_label) . '. '
                            . ($s18_sim < 30
                                ? 'Very low overlap — strong signal of correct language generation.'
                                : 'Some overlap is expected for languages that share vocabulary with English (e.g. proper nouns, technical terms).')
                        );
                        $s18_pass_count++;
                    }
                } elseif (empty($s18_en_norm)) {
                    $rows_s18 .= cc_diag_info(
                        $s18_prefix . ' similarity check skipped',
                        'Primary (English) card text is empty — cannot compute similarity. '
                        . 'Check primary content in Section 3.'
                    );
                    $s18_info_count++;
                } else {
                    $rows_s18 .= cc_diag_info(
                        $s18_prefix . ' card text empty',
                        htmlspecialchars($s18_lang_label) . ' card text sample is empty — cannot compute similarity.'
                    );
                    $s18_info_count++;
                }
            } // end foreach language

            // ── 18C: Consolidated verdict
            $s18_total = count($s18_ml_arr);
            if ($s18_fail_count === 0 && $s18_info_count === 0) {
                $rows_s18 .= cc_diag_pass(
                    '18C Overall verdict — ALL languages PASS',
                    'All ' . $s18_total . ' additional language(s) passed the similarity check. '
                    . 'The v12.99 language fix is working correctly for this activity.'
                );
            } elseif ($s18_fail_count === 0) {
                $rows_s18 .= cc_diag_info(
                    '18C Overall verdict — PASS with warnings',
                    $s18_pass_count . '/' . $s18_total . ' language(s) passed. '
                    . $s18_info_count . ' returned partial/inconclusive results — see per-language rows above for details.'
                );
            } else {
                $rows_s18 .= cc_diag_fail(
                    '18C Overall verdict — ' . $s18_fail_count . ' language(s) FAILED',
                    $s18_fail_count . '/' . $s18_total . ' language(s) have content that is ≥80% identical to English. '
                    . 'These must be regenerated after confirming 18A checks are PASS and Moodle caches are purged.'
                );
            }
        }
    }
}

// ── Page output ───────────────────────────────────────────────────────────────

$overall_label = $overall_pass
    ? '<span class="pass-banner">ALL CHECKS PASSED</span>'
    : '<span class="fail-banner">ONE OR MORE CHECKS FAILED — see details below</span>';

echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>CC Diagnostic' . ($cmid ? ' — cmid ' . $cmid : '') . '</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; background: #f5f5f5; color: #111; }
  h1 { font-size: 1.3rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; background: #222; color: #fff; padding: 0.4rem 0.7rem; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; margin-bottom: 1rem; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  td { padding: 0.45rem 0.7rem; font-size: 0.85rem; border-bottom: 1px solid #eee; vertical-align: top; }
  td.label { width: 42%; font-weight: 500; }
  td.pass  { width: 7%; color: #1a7a3f; font-weight: 700; white-space: nowrap; }
  td.fail  { width: 7%; color: #c0392b; font-weight: 700; white-space: nowrap; }
  td.info  { width: 7%; color: #7a6000; font-weight: 700; white-space: nowrap; }
  td.val   { color: #555; font-size: 0.82rem; word-break: break-word; }
  .overall { padding: 0.6rem 1rem; border-radius: 4px; margin-bottom: 1.5rem; font-weight: 600; font-size: 1rem; display: inline-block; }
  .pass-banner { background: #d4edda; color: #155724; padding: 0.5rem 1rem; border-radius: 4px; display: inline-block; }
  .fail-banner { background: #f8d7da; color: #721c24; padding: 0.5rem 1rem; border-radius: 4px; display: inline-block; }
  .meta { font-size: 0.8rem; color: #555; margin-bottom: 0.5rem; }
  a.back { font-size: 0.8rem; color: #0070f3; }
</style></head><body>';

echo '<h1>AI Content Creator — Diagnostic Report</h1>';

echo '<p class="meta">';
if ($cc !== null) {
    echo 'Activity: <strong>' . htmlspecialchars($cc->name) . '</strong> &nbsp;|&nbsp; ';
    echo 'cmid: <strong>' . $cmid . '</strong> &nbsp;|&nbsp; ';
    echo 'Instance ID: <strong>' . $cc->id . '</strong> &nbsp;|&nbsp; ';
}
$plugin = new stdClass();
include(__DIR__ . '/version.php');
echo 'Plugin version: <strong>' . ($plugin->release ?? '?') . '</strong> &nbsp;|&nbsp; ';
echo 'Generated: <strong>' . date('Y-m-d H:i:s T') . '</strong>';
echo '</p>';

echo '<div class="overall">' . $overall_label . '</div>';

echo '<h2>1. Plugin configuration — Site ID, API Key, voice settings</h2>';
echo '<table>' . $rows_config . '</table>';

echo '<h2>2. Database tables — required tables exist</h2>';
echo '<table>' . $rows_db . '</table>';

echo '<h2>3. Activity instance — manifest JSON and content state</h2>';
echo '<table>' . $rows_activity . '</table>';

echo '<h2>4. AMD build files — key JS modules present in amd/build/</h2>';
echo '<table>' . $rows_amd . '</table>';

echo '<h2>5. Source-to-build sync — src vs build file timestamps</h2>';
echo '<table>' . $rows_sync . '</table>';

echo '<h2>6. Additional language content — translation &amp; voiceover checks</h2>';
echo '<table>' . $rows_lang . '</table>';

echo '<h2>7. &quot;Start Learning&quot; readiness — voiceover state per section</h2>';
echo '<table>' . $rows_startlearning . '</table>';

echo '<h2>8. Audio generation loop — student voiceover stuck</h2>';
echo '<table>' . $rows_audioloop . '</table>';

echo '<h2>9. Live TTS API test — fires a real voiceover call and diagnoses the response</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Costs 5 credits per language tested. Append <code>?nottstest=1</code> to skip. Add <code>&amp;testlang=fr-FR</code> to test a specific language code.</p>';
echo '<table>' . $rows_tts . '</table>';

echo '<h2>10. Topic ID &amp; Start Topic button — data-topic-id type audit</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Checks manifest topic IDs and simulates the jQuery <code>.data(\'topic-id\')</code> auto-parse that causes the type-mismatch bug (pre-v12.94). Also verifies each topic has sections to display.</p>';
echo '<table>' . $rows_topicid . '</table>';

echo '<h2>11. Player JS version &amp; &quot;Start Topic&quot; fix verification</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Inspects <code>amd/build/player5.js</code> and <code>player5.min.js</code> to confirm the FIX-CC-TOPIC-FIND String() coercion patch is compiled in. A stale build or un-purged Moodle cache is the most common reason the fix in <code>src/</code> is not running for students.</p>';
echo '<table>' . $rows_playerjs . '</table>';

echo '<h2>12. Student progress records — contentcreator_progress</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Shows all <code>contentcreator_progress</code> records for this activity (up to 50, newest first). Corrupt JSON records are flagged — they cause <code>load_completion</code> to return null, breaking cross-device progress sync.</p>';
echo '<table>' . $rows_progress . '</table>';

echo '<h2>13. &quot;Start Topic&quot; button — full click simulation &amp; verdict</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Simulates the entire student click flow step-by-step: voiceover gate → topic ID lookup → section content check → AJAX calls. Each step produces a PASS/FAIL with a specific fix instruction.</p>';
echo '<table>' . $rows_simulate . '</table>';

echo '<h2>14. Language generation code chain — German &amp; additional language diagnosis</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">Verifies that all four AMD build files in the generation chain contain the language-fix markers. A single stale file causes the LLM to ignore German and return English content. Also shows a sample of the stored German card text and its similarity to the English original. Append <code>?cmid=N</code> to include the content sample.</p>';
echo '<table>' . $rows_langchain . '</table>';

echo '<h2>15. German (de-DE) — end-to-end language failure diagnosis</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">'
   . 'Focused diagnosis for the specific question: <strong>"Why is German not working?"</strong> '
   . 'Checks every known failure point in order: (A) AMD build markers for German text generation, '
   . '(B) German TTS voice ID resolution, (C) player language-switcher code, '
   . '(D) German content in this activity\'s manifest, (E) live German TTS probe. '
   . 'Append <code>?cmid=N</code> to include the manifest content checks. '
   . 'Append <code>&amp;nottstest=1</code> to skip the live TTS probe (saves 5 credits if result is cached).</p>';
echo '<table>' . $rows_german . '</table>';

echo '<h2>16. Additional-language generation chain — builder.js, generator.js, player5.js, ajax.php</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">'
   . 'Traces the full code path for additional-language (German, French, etc.) content and voiceover generation. '
   . '(A) builder.js <code>_mlInputs.voiceSettings.language</code> — must be <code>_mlLang.code</code>, not inherited primary "en-AU". '
   . '(B) generator.js voiceSettings→context.language merge and FIX-CC-REPAIR-LANG — both needed so the German system prompt is built and cached under "de-DE". '
   . '(C) player5.js <code>formData.append(\'language\')</code> call-site count — every TTS request must send the active language code. '
   . '(D) ajax.php <code>generate_voice</code> PHP language chain — <code>optional_param(\'language\')</code> → <code>$effectiveLanguage</code> → <code>languageCode</code> in TTS API call.</p>';
echo '<table>' . $rows_s16 . '</table>';

echo '<h2>17. Moodle compiled JS cache — server-side jsrev &amp; stale bundle detection</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">'
   . '<strong>This is the most common reason "I installed the latest plugin but German still doesn\'t work."</strong> '
   . 'Moodle compiles AMD modules into concatenated bundles stored in its server-side localcache/js/. '
   . 'Even if amd/build/*.js files are correct, Moodle may serve a stale pre-compiled bundle from before the latest plugin was installed. '
   . '(A) Shows current <code>$CFG->jsrev</code> (incremented by "Purge all caches"). '
   . '(B) Scans localcache/js/ for mod_contentcreator bundles and checks them for critical fix markers. '
   . '(C) Reports whether Moodle is in developer mode (.js) or production mode (.min.js).</p>';
echo '<table>' . $rows_s17 . '</table>';

echo '<h2>18. v12.99 language fix — is it active, and did it work for this activity?</h2>';
echo '<p style="font-size:0.8rem;color:#666;margin:-0.5rem 0 0.5rem;">'
   . '<strong>Use this section after installing v12.99 to confirm the fix is active and content genuinely changed.</strong> '
   . '(A) Checks <code>amd/build/generator.js</code> and <code>generator.min.js</code> for '
   . '<code>formData.append(\'language\')</code> — the core change that sends an explicit language field to the AI API. '
   . 'Checks <code>ajax.php</code> for <code>optional_param(\'language\')</code> — the PHP side that forwards it. '
   . '(B) For every additional language in <code>manifest.multiLanguage[]</code>, compares card text similarity to English: '
   . '&ge;80% = FAIL (content still in English — regenerate), 55–79% = WARN (partial), &lt;55% = PASS (genuinely translated). '
   . 'Also shows a card text sample per language for visual spot-check. '
   . 'Append <code>?cmid=N</code> to include the per-language content checks.</p>';
echo '<table>' . $rows_s18 . '</table>';

if ($cc !== null) {
    echo '<p><a class="back" href="' . (new moodle_url('/mod/contentcreator/view.php', ['id' => $cmid]))->out() . '">&larr; Back to activity</a></p>';
}

echo '</body></html>';
