# AI Content Creator (mod_contentcreator)

An activity module that lets teachers generate interactive, card-based learning
content — slides, images, voiceovers and embedded practice activities — and
delivers it to students in a mobile-first player.

## ⚠️ Requires a paid third-party service

**This plugin is not usable on its own.** All content generation (text, images,
document examples and text-to-speech voiceovers) is performed by
**LMS-Labs**, a commercial hosted service at <https://lms-labs.com>.

* You must hold an active LMS-Labs subscription and configure a **Site ID** and
  **API key** before any generation feature will work.
* The service is **credit-metered**. Generating a slide voiceover costs
  5 credits; image and document generation consume credits at the rates
  published by the provider.
* Without credentials the plugin installs cleanly and existing content still
  plays, but nothing new can be generated.

Provider terms of service: <https://lms-labs.com/terms>
Provider privacy policy: <https://lms-labs.com/privacy>
Pricing and credits: <https://lms-labs.com/pricing>

### What is sent to the provider

When a teacher generates content, the following leaves your Moodle site and is
transmitted to LMS-Labs over HTTPS:

| Data | When |
|---|---|
| Your Site ID and API key | Every request (authentication) |
| Topic titles, prompts and generation options entered by the teacher | Content generation |
| Text of a card or slide | Voiceover (text-to-speech) generation |
| Uploaded reference documents (e.g. PDF unit outlines) | Document extraction |

No student identifiers, names, email addresses or grades are transmitted. All
provider traffic is proxied through your Moodle server using Moodle's HTTP
client, so your site's proxy settings and blocked-host rules apply. See the
plugin's privacy provider for the formal declaration.

## Requirements

* Moodle 4.2 (2023042400) or later
* PHP 8.0 or later
* Outbound HTTPS access from the Moodle server to `lms-labs.com`
* An LMS-Labs subscription (see above)

## Installation

1. Copy the plugin into `mod/contentcreator` in your Moodle installation, or
   install the ZIP via *Site administration → Plugins → Install plugins*.
2. Visit *Site administration → Notifications* to complete the database upgrade.
3. Configure the plugin at
   *Site administration → Plugins → Activity modules → AI Content Creator*.

## Configuration

| Setting | Purpose |
|---|---|
| `siteid` | Your LMS-Labs Site ID |
| `apikey` | Your LMS-Labs API key (stored masked) |
| `country` | Jurisdiction used to select legislation references in generated content |
| `enablevoice` | Enable text-to-speech voiceover generation |
| `voicelanguage` | Default narration language |
| `voicegender` | Default narration voice |
| `requirefocus` | Pause playback when the learner leaves the tab |

### Narration

Slides and activity feedback are both narrated with the Google Chirp 3 HD voice chosen
in `voicegender`, in the language set by `voicelanguage` or by the additional-language
tab the learner has selected. A few languages offered in the additional-language list
have no Chirp 3 HD voice and fall back to the closest available one — Punjabi is narrated
with the Hindi voice, European Portuguese with the Brazilian one, Catalan with the
Spanish one, and Malay, Filipino, Cantonese and Icelandic use standard voices.

Generated audio costs 5 credits and is cached in the activity's own file area, keyed on
the text, voice and language, so repeat playback of the same narration is free. The cache
is removed with the activity. Where voice generation is disabled or unavailable, activity
feedback falls back to the browser's own speech engine, which will not match the slide
narration.

If the optional `local_aiconfig` plugin is installed, the Site ID and API key
are read from it instead, so a single set of credentials can be shared across
all LMS-Labs plugins. This is an optional soft dependency — the plugin works
without it.

## Capabilities

| Capability | Grants |
|---|---|
| `mod/contentcreator:addinstance` | Add a Content Creator activity to a course |
| `mod/contentcreator:view` | View and play published content |
| `mod/contentcreator:manage` | Author content and use generation features (consumes credits) |
| `mod/contentcreator:review` | Review learner attempts |

Only `mod/contentcreator:manage` permits credit-consuming generation. Grant it
deliberately.

## Privacy

The plugin stores per-user attempt scores, section view progress and topic
checklist state, and generates voiceover audio files. All of it is covered by
the Moodle Privacy API, including export and deletion. Transmission to
LMS-Labs is declared as an external location.

## Backup and restore

Full support, including user data (attempts, progress, checklists) and
generated voiceover files.

## Issues and source

* Issue tracker: <https://github.com/lms-labs/moodle-mod_contentcreator/issues>
* Source: <https://github.com/lms-labs/moodle-mod_contentcreator>

## Licence

GNU GPL v3 or later. See <http://www.gnu.org/copyleft/gpl.html>.
