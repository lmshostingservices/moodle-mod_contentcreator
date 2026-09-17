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
 * Content Creator - seed a Topics-and-Text subtopic pack for manual testing.
 *
 * Developer fixture. Run from the Moodle root with the CLI:
 *     php tests/moodle/seed-subtopic.php
 * It is not reachable over the web and takes no user input.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

// Seeds a Topics-and-Text activity whose cards are `subtopic` — the content-driven
// prose card added in v15.3.11. This is the shape that exposed
// FIX-SUBTOPIC-PARAGRAPHS-DISCARDED: the slide editor drew paragraph boxes for it and
// the Save collector had no branch that read them back.
define('CLI_SCRIPT', true);
require(__DIR__ . '/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/lib/modinfolib.php');
global $DB, $CFG;

$cat = $DB->get_record('course_categories', [], '*', IGNORE_MULTIPLE);
$course = create_course(
    (object)[
    'fullname' => 'Subtopic edit test', 'shortname' => 'subedit' . time(),
    'category' => $cat->id, 'format' => 'topics', 'numsections' => 2,
    ]
);

$manifest = [
  'title' => 'CampusPlus training',
  // A generated pack is locked; without this view.php shows the builder, not the player.
  'locked' => true,
  'context' => ['mode' => 'topicstext', 'language' => 'en-AU'],
  'topics' => [[
    'id' => 't1', 'title' => 'Topic 1 - Training pathway',
    'sections' => [[
      'id' => 's1', 'title' => 'CampusPlus Training Pathway', 'cardType' => null,
      'generated' => true,
      'cards' => [
        ['cardType' => 'subtopic',
         'title' => 'CampusPlus Training Pathway',
         'paragraphs' => [
            'SEEDED-PARAGRAPH-ONE The CampusPlus Training Pathway offers a comprehensive '
            . 'learning experience for staff involved in the programme. It integrates '
            . 'workshops, webinars, networking opportunities and reflective practice '
            . 'submissions across the whole of the first year of study.',
            'SEEDED-PARAGRAPH-TWO Participants can earn micro-credentials by completing '
            . 'specific components of the training pathway. These credentials are a '
            . 'testament to the professional development achieved and can be shown to '
            . 'an employer or a professional body on request.',
         ],
         'keyTerms' => [
            ['term' => 'Micro-credential', 'definition' => 'A short award for one completed component'],
            ['term' => 'Reflective practice', 'definition' => 'A written account of what was learned'],
         ],
        ],
        ['cardType' => 'subtopic',
         'title' => 'Second subtopic card',
         'paragraphs' => [
            'SEEDED-SECOND-CARD-ONE The second card exists so the test can prove that '
            . 'saving an edit to the first card leaves its neighbour alone, which is the '
            . 'failure mode a full cards array replacement invites on every save.',
            'SEEDED-SECOND-CARD-TWO Its second paragraph is here for the same reason and '
            . 'must survive the save untouched, in full, with the wording it was seeded '
            . 'with and nothing else in its place.',
         ],
        ],
      ],
    ]],
  ]],
];

$json = json_encode($manifest);
require_once($CFG->dirroot . '/mod/contentcreator/classes/manifest_storage.php');
$stored = \mod_contentcreator\manifest_storage::compress($json);

$module = $DB->get_record('modules', ['name' => 'contentcreator'], '*', MUST_EXIST);
$instance = (object)[
    'course' => $course->id, 'name' => 'Subtopic edit activity',
    'intro' => '', 'introformat' => 1,
    'manifestjson' => $stored, 'manifestversion' => 1,
    'timecreated' => time(), 'timemodified' => time(),
];
$instance->id = $DB->insert_record('contentcreator', $instance);

$cm = (object)[
    'course' => $course->id, 'module' => $module->id, 'instance' => $instance->id,
    'section' => 0, 'visible' => 1, 'visibleold' => 1, 'added' => time(),
];
$cm->id = add_course_module($cm);
course_add_cm_to_section($course->id, $cm->id, 0);
rebuild_course_cache($course->id, true);

echo "COURSE={$course->id} CMID={$cm->id}\n";
echo "URL=/mod/contentcreator/view.php?id={$cm->id}\n";
