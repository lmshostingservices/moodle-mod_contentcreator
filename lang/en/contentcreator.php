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
 * Language strings for mod_contentcreator.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
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
$string['eventcoursemoduleviewed'] = 'Content Creator viewed';
$string['completionviewallslides'] = 'Student must view all slides';
$string['completionviewallslidesdesc'] = 'Student must view all slides to complete this activity';
$string['completionviewallslides_help'] = 'If enabled, students must navigate through all content slides to complete the activity.';
$string['completionallactivities'] = 'Student must complete all activities at 100%';
$string['completionallactivitiesdesc'] = 'Student must score 100% on every Decision Challenge activity';
$string['completionallactivities_help'] = 'If enabled, students must achieve a perfect score (100%) on all Decision Challenge activities embedded in the content. Each challenge contains a quiz, flip cards, and a category sort — all three must be passed.';
$string['aisettings'] = 'AI Configuration';
$string['aisettingsdesc'] = 'Configure the AI provider settings for content generation.';
$string['siteid'] = 'Site ID';
$string['siteiddesc'] = 'Your EssayGraderAI Site ID from lms-labs.com';
$string['apikey'] = 'API Key';
$string['apikeydesc'] = 'Your EssayGraderAI API key from lms-labs.com';
$string['country'] = 'Country';
$string['countrydesc'] = 'Select the country for legislation and terminology context.';
$string['voicesettings'] = 'Voice Configuration';
$string['voicesettingsdesc'] = 'Configure text-to-speech settings for audio narration using Chirp 3 HD.';
$string['enablevoice'] = 'Enable Voice Narration';
$string['enablevoicedesc'] = 'Allow voice narration for content slides using Chirp 3 HD.';
$string['voicelanguage'] = 'Voice Language';
$string['voicelanguagedesc'] = 'Select the language for voice narration. Text and voiceover will both be in this language.';
$string['voicegender'] = 'Default Voice';
$string['voicegenderdesc'] = 'Select the default Chirp 3 HD voice used as a site-wide fallback when a module has not specified a voice. Individual modules override this in their Voiceover Settings.';
$string['voice_aoede'] = 'Aoede — Warm & Friendly (Female)';
$string['voice_kore'] = 'Kore — Clear & Professional (Female)';
$string['voice_leda'] = 'Leda — Soft & Nurturing (Female)';
$string['voice_zephyr'] = 'Zephyr — Energetic & Youthful (Female)';
$string['voice_puck'] = 'Puck — Upbeat & Clear (Male)';
$string['voice_charon'] = 'Charon — Informative & Calm (Male)';
$string['voice_fenrir'] = 'Fenrir — Excitable & Bold (Male)';
$string['voice_orus'] = 'Orus — Firm & Direct (Male)';
$string['requirefocus'] = 'Require Browser Focus';
$string['requirefocusdesc'] = 'If enabled, students must keep this tab active while viewing slides. Switching to another tab or window will reset the current slide progress.';
$string['errorsessionexpired'] = 'Your session has expired. Please refresh the page and try again.';
$string['errornotloggedin'] = 'Please log in to use Content Creator.';
$string['errormissingaction'] = 'The request did not specify an action.';
$string['errorunknownaction'] = 'The requested action is not supported.';
$string['errorgeneric'] = 'The server could not complete your request. Please try again.';
$string['errornotconfigured'] = 'Site ID and API key are not configured. Please install AI Grader Central Config, or set them in the plugin settings.';
$string['errorapiinvalidresponse'] = 'The AI service returned a response that could not be read.';
$string['errorapinoresponse'] = 'API error: 0 ({$a})';
$string['errorapihttp'] = 'API error: {$a}';
$string['errorgenerationfailed'] = 'Content generation failed. Please try again.';
$string['errorjobstartfailed'] = 'The content generation job could not be started.';
$string['errorjobstatusfailed'] = 'The status of the content generation job could not be checked.';
$string['errorvoicedisabled'] = 'Voice narration is disabled for this site.';
$string['errorttsfailed'] = 'Voiceover generation failed. Please try again.';
$string['errorttsinprogress'] = 'A voiceover is already being generated for this section. Please wait about ten seconds and try again.';
$string['errorinvalidprogress'] = 'The progress data sent by the browser could not be read.';
$string['progresssaved'] = 'Progress saved.';
$string['errornodocuments'] = 'No documents were specified.';
$string['errorinvaliddocuments'] = 'The list of documents could not be read.';
$string['errordocumentsfailed'] = 'The document examples could not be generated.';
$string['errorinvalidrequestdata'] = 'The request data could not be read.';
$string['errornoslidetitle'] = 'A slide title is required to generate an image.';
$string['errorimagefailed'] = 'Image generation failed. Please try again.';
$string['errorinvalidaudio'] = 'The audio data sent by the browser is not valid.';
$string['errorfilestorefailed'] = 'The audio file could not be saved.';
$string['galleryimageprompt'] = 'Slide image';
$string['gallerygalleryprompt'] = 'Gallery image';
$string['galleryslidelabel'] = 'Slide {$a}';
$string['gallerysource'] = '{$a->activity} - {$a->slide}';
$string['gallerysourcegallery'] = '{$a} - Gallery';
$string['vendorerrorunknownendpoint'] = 'The requested AI service endpoint is not available.';
$string['vendorerrorwrongaction'] = 'The requested AI service endpoint cannot be used in this way.';
$string['vendorerrormissingunit'] = 'A unit code is required for this AI service request.';
$string['vendorerrorinvalidjson'] = 'The request sent to the AI service was not valid JSON.';
$string['vendorerrorgeneric'] = 'The AI service could not complete this request. Please try again.';
$string['vendorerrornofile'] = 'No file was uploaded.';
$string['vendorerroruploadfailed'] = 'The file upload did not complete. Please try again.';
$string['vendorerrorfiletype'] = 'Only PDF files can be uploaded.';
$string['vendorerrorfilesize'] = 'The uploaded file is larger than the {$a} MB limit for this type of upload.';
$string['errorratelimited'] = 'You have made too many AI requests in a short time. Please wait a few minutes and try again.';
$string['centralconfigfound'] = 'AI Grader Central Config is installed. The site ID and API key are managed centrally.';
$string['centralconfigconfigure'] = 'Configure central settings';
$string['centralconfigmissing'] = 'Recommended: install AI Grader Central Config to set the site ID and API key once for all AI Grader plugins.';
$string['centralconfiglearnmore'] = 'Learn more about AI Grader Central Config';
$string['settingfallbacknote'] = '{$a} This value is only a fallback: AI Grader Central Config takes priority.';
$string['resetuserdata'] = 'Delete all attempts, slide progress and checklist responses';
$string['privacy:metadata:contentcreator_attempts:maxscore'] = 'The maximum score available for the activity attempt.';
$string['privacy:metadata:contentcreator_attempts:attemptdata'] = 'Additional JSON data recorded for the attempt, such as per-card interaction state.';
$string['privacy:metadata:contentcreator_checklist'] = 'Before You Start checklist completion recorded per user per topic.';
$string['privacy:metadata:contentcreator_checklist:userid'] = 'The ID of the user whose checklist progress is recorded.';
$string['privacy:metadata:contentcreator_checklist:cmid'] = 'The course module the checklist entry belongs to.';
$string['privacy:metadata:contentcreator_checklist:topicid'] = 'The manifest topic the checklist entry relates to.';
$string['privacy:metadata:contentcreator_checklist:complete'] = 'Whether the user has completed the checklist for the topic.';
$string['privacy:metadata:contentcreator_checklist:timecreated'] = 'When the checklist entry was created.';
$string['privacy:metadata:contentcreator_checklist:timemodified'] = 'When the checklist entry was last updated.';
$string['privacy:metadata:lmslabs'] = 'Content Creator sends content authoring requests to the LMS Labs service at lms-labs.com so that course content, document examples and voiceover audio can be generated. No learner identifiers are sent.';
$string['privacy:metadata:lmslabs:siteid'] = 'The site identifier used to identify this Moodle site for billing and credit accounting.';
$string['privacy:metadata:lmslabs:apikey'] = 'The site API key used to authenticate this Moodle site with the service.';
$string['privacy:metadata:lmslabs:prompt'] = 'The content generation prompt, including the topic and course context entered by the teacher.';
$string['privacy:metadata:lmslabs:topictext'] = 'Topic titles, descriptions and unit of competency details submitted for content generation.';
$string['privacy:metadata:lmslabs:cardtext'] = 'Slide and card text submitted for text-to-speech voiceover synthesis.';
$string['privacy:metadata:lmslabs:documentcontent'] = 'The content of reference documents uploaded by a teacher and submitted for extraction and analysis.';
$string['errortexttoolong'] = 'The text is too long for voiceover. The maximum is {$a} characters.';
$string['errordocgenfailed'] = 'The document example could not be generated. Please try again later.';
$string['errorsavefailed'] = 'The content could not be saved. Please try again, and ask your administrator to check the server logs if the problem continues.';
$string['errorinvalidjson'] = 'The content sent to the server was not valid JSON and could not be saved.';
$string['errorinvalidchunkindex'] = 'The upload could not be processed because the chunk information was invalid.';
$string['errormissingchunk'] = 'The upload is incomplete: chunk {$a} was not received. Please try saving again.';
$string['errornomanifest'] = 'No content has been generated for this activity yet.';
$string['errorinvalidmanifest'] = 'The stored content for this activity could not be read.';
$string['errorsectionnotfound'] = 'That slide could not be found in the stored content.';
$string['manifestsaved'] = 'Content saved successfully.';
$string['chunkreceived'] = 'Chunk {$a} received.';
$string['slidesaved'] = 'Slide saved successfully.';
$string['slidesavedvoiceover'] = 'Slide saved. The voiceover will be regenerated when you select Listen, at a cost of 5 credits.';
$string['sectionviewrecorded'] = 'Section view recorded.';
$string['modulecompleted'] = 'Activity completed.';
$string['errorratelimiteddetail'] = 'You have made too many requests. This action is limited to {$a->max} requests every {$a->minutes} minutes. Please wait and try again.';
$string['cachedef_ratelimit'] = 'Rate limit counters for AI generation requests';
