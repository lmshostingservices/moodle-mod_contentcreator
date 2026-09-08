<?php
define('CLI_SCRIPT', true);
require(__DIR__ . '/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/lib/modinfolib.php');
global $DB, $CFG;

// A course.
$cat = $DB->get_record('course_categories', [], '*', IGNORE_MULTIPLE);
$course = create_course((object)[
    'fullname' => 'Reveal test', 'shortname' => 'reveal' . time(),
    'category' => $cat->id, 'format' => 'topics', 'numsections' => 2,
]);

// A manifest shaped exactly like a SAVED schema-v2 pack: the question's single feedback
// line sits on the correct option, and the three distractors are bare.
$manifest = [
  'title' => 'Recording incidents',
  'context' => ['mode' => 'vet', 'language' => 'en-AU'],
  'topics' => [[
    'id' => 't1', 'title' => 'Topic 1 - Incident recording',
    'sections' => [[
      'id' => 's1', 'title' => 'Section 1', 'cardType' => null,
      'cards' => [
        ['cardType' => 'decision-point', 'schemaVersion' => 2,
         'title' => 'Testing incident recording',
         'questions' => [[
           'question' => 'Which action meets the recording rule in clause four?',
           'options' => [
             ['text' => 'Record the incident in the register within two working days of it happening',
              'feedback' => 'Clause 4 gives two working days, and the register is the record an auditor checks first.',
              'correct' => true],
             ['text' => 'Tell the supervisor verbally and leave the register until the monthly review',
              'feedback' => '', 'correct' => false],
             ['text' => 'Wait until the client complains before entering anything in the register',
              'feedback' => '', 'correct' => false],
             ['text' => 'Treat the email thread about it as the record and skip the register',
              'feedback' => '', 'correct' => false],
           ],
         ]],
         'keyTerms' => [
            ['term' => 'Register', 'definition' => 'The bound record of incidents kept for audit'],
            ['term' => 'Clause 4', 'definition' => 'The rule setting the two working day deadline'],
            ['term' => 'Auditor', 'definition' => 'The person who checks the register at review'],
         ],
         'goodItems' => [['text' => 'Record the incident on the day it happens'],
                         ['text' => 'Name the people involved in the entry'],
                         ['text' => 'Sign and date every register entry']],
         'badItems'  => [['text' => 'Leave the register until the monthly review'],
                         ['text' => 'Record only incidents a client complained about'],
                         ['text' => 'Keep the record in a personal notebook']],
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
    'course' => $course->id, 'name' => 'Reveal test activity',
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
