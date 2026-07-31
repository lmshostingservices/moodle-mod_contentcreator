<?php
/**
 * Content Creator - Language strings
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'AI Content Creator';
$string['modulename'] = 'AI Content Creator';
$string['modulenameplural'] = 'AI Content Creators';
$string['modulename_help'] = 'AI Content Creator builds interactive slide-based training modules with AI-generated content and Google Chirp 3 HD voiceover narration.

Four learning routes shape the card format: VET/Workplace (7-card sequence: Introduction, Plain English, Scenario, Action Breakdown, Common Errors, Workplace Application, Check Knowledge), University (academic essay-focused card types), Professional Development (reflection and goal-setting cards), and Generic (flexible format for any content type).

Teachers choose a route, enter the topic and learning outcomes, then click Generate — the AI writes a complete slide deck using the configured ChatGPT prompt template. Alternatively, teachers build or edit cards manually using the in-builder AI chat panel. Individual card types include step-by-step action breakdowns, realistic workplace scenario stories, common errors with corrective guidance, and interactive knowledge-check questions with instant scored feedback.

Voiceover narration is generated per slide using Google Chirp 3 HD text-to-speech in 52 languages with 8 voice styles (Aoede, Kore, Leda, Zephyr, Charon, Fenrir, Orus, Puck). Each slide voiceover costs 5 credits. Teachers can require students to listen to the full voiceover before the Next button activates. Interactive elements include expandable info popup boxes and external document links embedded within cards.

Student progress is tracked per slide and written to the Moodle gradebook. Activity completion can be set to viewing all slides or achieving a passing grade.';
$string['pluginadministration'] = 'AI Content Creator administration';
$string['contentcreatorname'] = 'Name';
$string['contentcreatorname_help'] = 'Enter a descriptive name for this content activity.';
$string['contentcreator:addinstance'] = 'Add AI Content Creator activity';
$string['contentcreator:view'] = 'View AI Content Creator';
$string['contentcreator:manage'] = 'Manage AI Content Creator content';
$string['contentcreator:review'] = 'Review AI Content Creator attempts';
$string['noinstances'] = 'No AI Content Creator activities found in this course.';
$string['privacy:metadata'] = 'The AI Content Creator plugin stores student attempt and progress data.';
$string['privacy:metadata:contentcreator_attempts'] = 'Student attempt records for Content Creator activities.';
$string['privacy:metadata:contentcreator_attempts:userid'] = 'The ID of the user who made the attempt.';
$string['privacy:metadata:contentcreator_attempts:score'] = 'The score achieved in the activity.';
$string['privacy:metadata:contentcreator_attempts:completed'] = 'Whether the user completed the activity.';
$string['privacy:metadata:contentcreator_attempts:responses'] = 'The user responses to activity questions.';
$string['privacy:metadata:contentcreator_attempts:timecreated'] = 'When the attempt was created.';
$string['privacy:metadata:contentcreator_attempts:timemodified'] = 'When the attempt was last modified.';
$string['privacy:metadata:contentcreator_progress'] = 'Student progress tracking for Content Creator activities.';
$string['privacy:metadata:contentcreator_progress:userid'] = 'The ID of the user whose progress is tracked.';
$string['privacy:metadata:contentcreator_progress:progress'] = 'JSON data tracking which sections the user has viewed.';
$string['privacy:metadata:contentcreator_progress:timecreated'] = 'When the progress record was created.';
$string['privacy:metadata:contentcreator_progress:timemodified'] = 'When the progress was last updated.';
$string['privacy:metadata:essaygraderai'] = 'Content Creator sends prompts to lms-labs.com for AI content generation.';
$string['privacy:metadata:essaygraderai:siteid'] = 'The site identifier for billing purposes.';
$string['privacy:metadata:essaygraderai:prompt'] = 'The content generation prompt sent to the AI.';
$string['privacy:metadata:essaygraderai:context'] = 'Contextual information about the learning topic.';

// Events.
$string['eventcoursemoduleviewed'] = 'Content Creator viewed';

// Completion strings.
$string['completionviewallslides'] = 'Student must view all slides';
$string['completionviewallslidesdesc'] = 'Student must view all slides to complete this activity';
$string['completionviewallslides_help'] = 'If enabled, students must navigate through all content slides to complete the activity.';
$string['completionallactivities'] = 'Student must complete all activities at 100%';
$string['completionallactivitiesdesc'] = 'Student must score 100% on every Decision Challenge activity';
$string['completionallactivities_help'] = 'If enabled, students must achieve a perfect score (100%) on all Decision Challenge activities embedded in the content. Each challenge contains a quiz, flip cards, and a category sort — all three must be passed.';

// Settings strings.
$string['aisettings'] = 'AI Configuration';
$string['aisettingsdesc'] = 'Configure the AI provider settings for content generation.';
$string['siteid'] = 'Site ID';
$string['siteiddesc'] = 'Your EssayGraderAI Site ID from lms-labs.com';
$string['apikey'] = 'API Key';
$string['apikeydesc'] = 'Your EssayGraderAI API key from lms-labs.com';
$string['country'] = 'Country';
$string['countrydesc'] = 'Select the country for legislation and terminology context.';

// Voice settings.
$string['voicesettings'] = 'Voice Configuration';
$string['voicesettingsdesc'] = 'Configure text-to-speech settings for audio narration using Chirp 3 HD.';
$string['enablevoice'] = 'Enable Voice Narration';
$string['enablevoicedesc'] = 'Allow voice narration for content slides using Chirp 3 HD.';
$string['voicelanguage'] = 'Voice Language';
$string['voicelanguagedesc'] = 'Select the language for voice narration. Text and voiceover will both be in this language.';
$string['voicegender'] = 'Default Voice';
$string['voicegenderdesc'] = 'Select the default Chirp 3 HD voice used as a site-wide fallback when a module has not specified a voice. Individual modules override this in their Voiceover Settings.';
$string['voicefemale'] = 'Female (Aoede — Warm & Friendly)';
$string['voicemale'] = 'Male (Puck — Upbeat & Clear)';
$string['voice_aoede'] = 'Aoede — Warm & Friendly (Female)';
$string['voice_kore']  = 'Kore — Clear & Professional (Female)';
$string['voice_leda']  = 'Leda — Soft & Nurturing (Female)';
$string['voice_zephyr']= 'Zephyr — Energetic & Youthful (Female)';
$string['voice_puck']  = 'Puck — Upbeat & Clear (Male)';
$string['voice_charon']= 'Charon — Informative & Calm (Male)';
$string['voice_fenrir']= 'Fenrir — Excitable & Bold (Male)';
$string['voice_orus']  = 'Orus — Firm & Direct (Male)';

// Progression settings.
$string['progressionsettings'] = 'Slide Progression';
$string['progressionsettingsdesc'] = 'Control how students navigate through content slides.';
$string['progressionmode'] = 'Progression Mode';
$string['progressionmodedesc'] = 'Choose how students can advance to the next slide.';
$string['progressionfree'] = 'Free navigation (click next anytime)';
$string['progressionvoiceover'] = 'Must listen to voiceover before continuing';
$string['progressiontimed'] = 'Minimum time per slide';
$string['slideduration'] = 'Slide Duration (seconds)';
$string['slidedurationdesc'] = 'When using timed progression, minimum seconds required per slide before student can continue.';

// Focus requirement settings.
$string['requirefocus'] = 'Require Browser Focus';
$string['requirefocusdesc'] = 'If enabled, students must keep this tab active while viewing slides. Switching to another tab or window will reset the current slide progress.';
$string['focuslostmessage'] = 'Slide Reset';
$string['focuslostdetail'] = 'You navigated away from this learning content. Please stay focused on this tab to complete the slide.';

