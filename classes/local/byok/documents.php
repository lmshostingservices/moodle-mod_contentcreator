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

namespace mod_contentcreator\local\byok;

/**
 * Content Creator workplace document examples, ported from the LMS Labs service for Bring your own AI.
 *
 * Ports of the service's /generate-document-example and /batch-generate-documents routes for
 * /api/moodle/content-creator, with the service's own prompts and clean-up. Each AI call goes to {@see engine::$aicall}.
 * The routes were compared with the service's code on generated requests and AI replies.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class documents extends media {
    /** @var array[] The service's job level table: detail, vocabulary and examples for each level. */
    const LEVELS = [
        'entry' => ['basic', 'simple, everyday language', 'straightforward, common situations'],
        'apprentice' => ['foundational', 'clear workplace terms with explanations', 'typical learning scenarios'],
        'worker' => ['standard', 'standard industry terminology', 'realistic workplace situations'],
        'supervisor' => ['comprehensive', 'professional industry language', 'team management scenarios'],
        'manager' => ['advanced', 'business and compliance terminology', 'strategic and compliance scenarios'],
    ];

    /** @var array[] The service's DOCUMENT_TYPE_CONFIGS: domain and render profile for each document. */
    const TYPES = [
        'swms' => ['Safety & Risk', 'stepsTable'],
        'jsa' => ['Safety & Risk', 'stepsTable'],
        'risk_assessment' => ['Safety & Risk', 'checklist'],
        'hazard_report' => ['Safety & Risk', 'formFields'],
        'incident_report' => ['Safety & Risk', 'formFields'],
        'near_miss_report' => ['Safety & Risk', 'formFields'],
        'permit_to_work' => ['Safety & Risk', 'formFields'],
        'prestart_checklist' => ['Safety & Risk', 'checklist'],
        'emergency_plan' => ['Safety & Risk', 'procedure'],
        'ppe_checklist' => ['Safety & Risk', 'checklist'],
        'sop' => ['Operations', 'procedure'],
        'work_instruction' => ['Operations', 'procedure'],
        'job_card' => ['Operations', 'formFields'],
        'maintenance_log' => ['Operations', 'formFields'],
        'quality_checklist' => ['Operations', 'checklist'],
        'shift_handover' => ['Operations', 'formFields'],
        'code_of_conduct' => ['People & Conduct', 'policyExcerpt'],
        'equal_opportunity_policy' => ['People & Conduct', 'policyExcerpt'],
        'bullying_harassment_policy' => ['People & Conduct', 'policyExcerpt'],
        'conflict_of_interest' => ['People & Conduct', 'formFields'],
        'performance_review' => ['People & Conduct', 'formFields'],
        'training_record' => ['Training', 'formFields'],
        'competency_checklist' => ['Training', 'checklist'],
        'induction_checklist' => ['Training', 'checklist'],
        'customer_complaint' => ['Customer', 'formFields'],
        'non_conformance' => ['Reporting', 'formFields'],
        'corrective_action' => ['Governance', 'formFields'],
        'whs_policy' => ['Governance', 'policyExcerpt'],
        'privacy_policy' => ['Governance', 'policyExcerpt'],
        'data_handling' => ['Governance', 'procedure'],
        'client_intake' => ['Customer', 'formFields'],
        'customer_feedback' => ['Customer', 'formFields'],
    ];

    /** @var string[] The service's language names for batch document examples. */
    const LANGUAGES = [
        'en-AU' => 'English (Australian)', 'en-GB' => 'English (British)', 'en-US' => 'English (American)',
        'ja-JP' => 'Japanese', 'zh-CN' => 'Chinese (Simplified)', 'zh-TW' => 'Chinese (Traditional)',
        'ko-KR' => 'Korean', 'vi-VN' => 'Vietnamese', 'th-TH' => 'Thai', 'id-ID' => 'Indonesian', 'ms-MY' => 'Malay',
        'tl-PH' => 'Filipino/Tagalog', 'hi-IN' => 'Hindi', 'ta-IN' => 'Tamil', 'ar-XA' => 'Arabic',
        'es-ES' => 'Spanish', 'pt-BR' => 'Portuguese (Brazilian)', 'fr-FR' => 'French', 'de-DE' => 'German',
        'it-IT' => 'Italian', 'ru-RU' => 'Russian', 'pl-PL' => 'Polish', 'nl-NL' => 'Dutch', 'sv-SE' => 'Swedish',
        'da-DK' => 'Danish', 'fi-FI' => 'Finnish', 'nb-NO' => 'Norwegian', 'el-GR' => 'Greek', 'tr-TR' => 'Turkish',
        'he-IL' => 'Hebrew', 'cs-CZ' => 'Czech', 'hu-HU' => 'Hungarian', 'ro-RO' => 'Romanian',
        'uk-UA' => 'Ukrainian', 'bg-BG' => 'Bulgarian', 'hr-HR' => 'Croatian', 'sk-SK' => 'Slovak',
        'sl-SI' => 'Slovenian', 'lt-LT' => 'Lithuanian', 'lv-LV' => 'Latvian', 'et-EE' => 'Estonian',
        'sr-RS' => 'Serbian', 'mk-MK' => 'Macedonian', 'sq-AL' => 'Albanian', 'is-IS' => 'Icelandic',
        'mt-MT' => 'Maltese', 'cy-GB' => 'Welsh', 'ga-IE' => 'Irish', 'eu-ES' => 'Basque', 'ca-ES' => 'Catalan',
        'gl-ES' => 'Galician', 'af-ZA' => 'Afrikaans', 'sw-KE' => 'Swahili', 'bn-IN' => 'Bengali',
        'gu-IN' => 'Gujarati', 'kn-IN' => 'Kannada', 'ml-IN' => 'Malayalam', 'mr-IN' => 'Marathi',
        'pa-IN' => 'Punjabi', 'te-IN' => 'Telugu', 'ur-PK' => 'Urdu',
    ];

    /** @var string */
    const DOC_UNIVERSITY = "You are an expert academic document generator for higher education training purposes.\n\n" .
        'Generate a realistic EXAMPLE of a "%%docName%%" document adapted for a university or higher education ' .
        "context.\n\nCONTEXT:\n- Country: %%country%%\n- State/Region: %%stateOrNot%%\n" .
        "- Discipline/Subject Area: %%industry%%%%subIndustryBrackets%%\n- Role: %%jobTitle%% (%%jobLevel%% level)\n" .
        "- Training Route: university\n- Document Domain: %%domain%%%%stateContext%%\n%%scenarioLine%%\n\n" .
        "DOCUMENT REQUIREMENTS:\n" .
        '1. Create a realistic example appropriate for a university or higher education setting in the ' .
        "%%industry%% discipline\n2. Use %%vocabulary%%\n" .
        '3. Include %%examples%% adapted for academic contexts (research, coursework, clinical placements, ' .
        "fieldwork, laboratory work, professional practice)\n4. Provide %%detail%% level of detail\n" .
        "5. Make it specific to the discipline and academic role\n" .
        "6. IMPORTANT: Create a realistic fictional INSTITUTION or ORGANISATION NAME that matches the academic context:\n" .
        "   - For \"%%industry%%\"%%subIndustryBrackets%% in %%country%%%%stateBrackets%%\n" .
        '   - Use academic naming patterns (e.g., "[City] University", "[Region] Institute of Technology", ' .
        "\"Faculty of [Discipline]\", \"[Name] Research Centre\")\n" .
        '   - Examples: "Western Sydney University School of Nursing", "Melbourne Institute of Technology", ' .
        "\"Griffith University Faculty of Health Sciences\"\n" .
        "   - NEVER use generic names like \"Acme\", \"ABC University\", \"XYZ Institute\", or \"Example University\"\n" .
        "7. Adapt workplace-specific language to academic equivalents:\n" .
        "   - \"Workers\" → \"Students\", \"Researchers\", \"Practitioners\", or \"Clinicians\" as appropriate\n" .
        '   - "Workplace" → "Campus", "Laboratory", "Clinical setting", "Fieldwork site", or "Research ' .
        "facility\"\n" .
        '   - "Supervisor" → "Course coordinator", "Research supervisor", "Clinical mentor", or "Academic ' .
        "lead\"\n   - \"WHS\" → relevant safety context only if discipline requires it (lab safety, clinical protocols, " .
        'fieldwork risk)';

    /** @var string */
    const DOC_WORKPLACE = "You are an expert workplace document generator for training purposes.\n\n" .
        "Generate a realistic EXAMPLE of a \"%%docName%%\" document for training purposes.\n\nCONTEXT:\n" .
        "- Country: %%country%%\n- State/Region: %%stateOrNot%%\n- Industry: %%industry%%%%subIndustryBrackets%%\n" .
        "- Job Role: %%jobTitle%% (%%jobLevel%% level)\n- Training Route: %%route%%\n" .
        "- Document Domain: %%domain%%%%stateContext%%\n%%scenarioLine%%\n\nDOCUMENT REQUIREMENTS:\n" .
        "1. Create a realistic example that could be used in the %%industry%% industry\n2. Use %%vocabulary%%\n" .
        "3. Include %%examples%%\n4. Provide %%detail%% level of detail\n" .
        "5. Make it specific to the industry and job role\n" .
        "6. IMPORTANT: Create a realistic fictional COMPANY NAME that matches the industry context:\n" .
        "   - For \"%%industry%%\"%%subIndustryBrackets%% in %%country%%%%stateBrackets%%\n" .
        '   - Use industry-appropriate naming patterns (e.g., "[Location] [Industry] Services", "[Founder ' .
        "Name] [Trade]\", \"[Region] [Specialty] Group\")\n" .
        '   - Examples: "Melbourne Precision Engineering", "Coastal Aged Care Services", "Hunter Valley Mining ' .
        "Solutions\", \"Brisbane Metro Construction\"\n" .
        '   - NEVER use generic names like "Acme", "ABC Company", "XYZ Corp", or "Example Inc"';

    /** @var string */
    const DOC_SUFFIX = "\nRENDER PROFILE: %%renderProfile%%\n%%formatStepsTable%%\n%%formatChecklist%%\n%%formatFormFields%%\n" .
        "%%formatProcedure%%\n%%formatPolicyExcerpt%%\n\nCRITICAL DISPLAY RULES:\n" .
        "1. This is a READ-ONLY sample for students to VIEW - NOT an interactive form\n" .
        "2. Do NOT include any HTML form elements: <input>, <textarea>, <select>, <button>, <form>\n" .
        '3. Do NOT include instructional text like "Please complete this form", "Fill in the fields below", or ' .
        "\"Enter your details\"\n4. Show the document AS IF it was already completed with realistic example data\n" .
        '5. For form-style documents, display field labels with their example values as static text (use ' .
        "tables or <strong>Label:</strong> Value format)\n\nOUTPUT FORMAT:\n" .
        "Return valid HTML content (no markdown). Use these tags only:\n- <h3> for section headings\n" .
        "- <p> for paragraphs\n- <ul>/<ol> and <li> for lists\n- <table>, <tr>, <th>, <td> for tables\n" .
        "- <strong> for emphasis\n\nDo NOT include:\n- <html>, <head>, <body> tags\n- CSS styles\n- Scripts\n" .
        "- The document title (it's already shown in the modal header)\n" .
        "- ANY form elements (<input>, <textarea>, <select>, <button>)\n" .
        "- Instructional text asking users to fill in or complete anything\n\n" .
        'Keep the content focused and training-appropriate (2-4 sections maximum).';

    /** @var string */
    const DOC_BATCH = "You are an expert workplace document generator for training purposes.\n\n" .
        "Generate a realistic EXAMPLE of a \"%%docName%%\" document for training purposes.\n\nCONTEXT:\n" .
        "- Country: %%country%%\n- State/Region: %%stateOrNot%%\n- Industry: %%industry%%%%subIndustryBrackets%%\n" .
        "- Job Role: %%jobTitle%% (%%jobLevel%% level)\n- Training Route: %%route%%\n- Document Domain: %%domain%%\n" .
        "- Language: %%languageName%%%%stateContext%%%%languageInstruction%%\n\nDOCUMENT REQUIREMENTS:\n" .
        "1. Create a realistic example that could be used in the %%industry%% industry\n2. Use %%vocabulary%%\n" .
        "3. Include %%examples%%\n4. Provide %%detail%% level of detail\n" .
        "5. Make it specific to the industry and job role\n" .
        "6. IMPORTANT: Create a realistic fictional COMPANY NAME that matches the industry context:\n" .
        "   - For \"%%industry%%\"%%subIndustryBrackets%% in %%country%%%%stateBrackets%%\n" .
        '   - Use industry-appropriate naming patterns (e.g., "[Location] [Industry] Services", "[Founder ' .
        "Name] [Trade]\", \"[Region] [Specialty] Group\")\n" .
        '   - Examples: "Melbourne Precision Engineering", "Coastal Aged Care Services", "Hunter Valley Mining ' .
        "Solutions\", \"Brisbane Metro Construction\"\n" .
        "   - NEVER use generic names like \"Acme\", \"ABC Company\", \"XYZ Corp\", or \"Example Inc\"\n\n" .
        "RENDER PROFILE: %%renderProfile%%\n%%formatStepsTable%%\n%%formatChecklist%%\n%%formatFormFields%%\n" .
        "%%formatProcedure%%\n%%formatPolicyExcerpt%%\n\nCRITICAL DISPLAY RULES:\n" .
        "1. This is a READ-ONLY sample for students to VIEW - NOT an interactive form\n" .
        "2. Do NOT include any HTML form elements: <input>, <textarea>, <select>, <button>, <form>\n" .
        '3. Do NOT include instructional text like "Please complete this form", "Fill in the fields below", or ' .
        "\"Enter your details\"\n4. Show the document AS IF it was already completed with realistic example data\n" .
        '5. For form-style documents, display field labels with their example values as static text (use ' .
        "tables or <strong>Label:</strong> Value format)\n\nOUTPUT FORMAT:\n" .
        "Return valid HTML content (no markdown). Use these tags only:\n- <h3> for section headings\n" .
        "- <p> for paragraphs\n- <ul>/<ol> and <li> for lists\n- <table>, <tr>, <th>, <td> for tables\n" .
        "- <strong> for emphasis\n\n" .
        "Do NOT include <html>, <head>, <body> tags, CSS styles, scripts, form elements, or instructional text.\n" .
        'Keep the content focused and training-appropriate (2-4 sections maximum).';

    /** @var string[] The format line for each render profile. */
    const FORMATS = [
        'stepsTable' => 'Format as a table with columns: Step | Hazard/Risk | Control Measure',
        'checklist' => 'Format as a checklist with checkbox items (use ☐ or ☑ symbols, not actual input elements)',
        'formFields' => 'Format as a completed form EXAMPLE showing field labels and SAMPLE VALUES already filled in (use ' .
            'tables or definition lists, NOT input/textarea/select elements)',
        'procedure' => 'Format as numbered steps with clear instructions',
        'policyExcerpt' => 'Format as policy excerpt with key points and responsibilities',
    ];

    /**
     * POST /api/moodle/content-creator/generate-document-example: one example document.
     *
     * @param \stdClass $body The request.
     * @return array [status, body]
     */
    public static function example(\stdClass $body): array {
        $v = self::fields($body, [
            'siteId' => ['str', ''], 'apiKey' => ['str', ''], 'docId' => ['str', null], 'docName' => ['str', null],
            'country' => ['str', 'AU'], 'state' => ['str', ''], 'industry' => ['str', 'general'], 'subIndustry' => ['str', ''],
            'jobLevel' => ['str', 'worker'], 'jobTitle' => ['str', 'Worker'], 'route' => ['str', 'workplace'],
            'scenarioContext' => ['str', ''],
        ]);
        if ($v === null) {
            return [400, ['success' => false, 'error' => 'Invalid request parameters']];
        }
        try {
            [$domain, $profile] = self::type($v['docId']);
            $replace = self::context($v, $domain, $profile) + [
                '%%scenarioLine%%' => $v['scenarioContext'] !== '' ? "\nScenario Context: {$v['scenarioContext']}" : '',
                '%%stateContext%%' => $v['state'] !== '' && $v['country'] === 'AU' ? "\nNote: Apply {$v['state']} " .
                    "state-specific WHS regulations where relevant (e.g., SafeWork {$v['state']} requirements)." : '',
            ];
            $template = ($v['route'] === 'university' ? self::DOC_UNIVERSITY : self::DOC_WORKPLACE) . self::DOC_SUFFIX;
            $content = self::clean((self::$aicall)('', strtr($template, $replace), 8192, false, 1.0, null));
            $answer = ['success' => true, 'content' => $content, 'docId' => $v['docId'], 'docName' => $v['docName']];
            if ($domain !== null) {
                $answer += ['domain' => $domain, 'renderProfile' => $profile];
            }
            return [200, $answer];
        } catch (\Throwable $e) {
            $message = $e->getMessage();
            return [500, ['success' => false, 'error' => $message !== '' ? $message : 'Document generation failed']];
        }
    }

    /**
     * POST /api/moodle/content-creator/batch-generate-documents: up to twenty examples; ones that fail are left out.
     *
     * @param \stdClass $body The request.
     * @return array [status, body]
     */
    public static function batch(\stdClass $body): array {
        $v = self::fields($body, [
            'siteId' => ['str', ''], 'apiKey' => ['str', ''], 'documents' => ['docs', null],
            'context' => ['object', false, [
                'country' => ['str', 'AU'], 'state' => ['str', ''], 'industry' => ['str', 'general'],
                'subIndustry' => ['str', ''], 'jobLevel' => ['str', 'worker'], 'jobTitle' => ['str', 'Worker'],
                'route' => ['str', 'workplace'], 'language' => ['str', 'en-AU'],
            ]],
        ]);
        if ($v === null) {
            return [400, ['success' => false, 'error' => 'Invalid request parameters']];
        }
        $ctx = $v['context'] === null ? ['country' => 'AU', 'state' => '', 'industry' => 'general', 'subIndustry' => '',
            'jobLevel' => 'worker', 'jobTitle' => 'Worker', 'route' => 'workplace', 'language' => 'en-AU']
            : get_object_vars($v['context']);
        $language = $ctx['language'] !== '' ? $ctx['language'] : 'en-AU';
        $name = self::lookup(self::LANGUAGES, $language) ?? 'English (Australian)';
        $replace = [
            '%%stateContext%%' => $ctx['state'] !== '' && $ctx['country'] === 'AU' ?
                "\nNote: Apply {$ctx['state']} state-specific WHS regulations where relevant." : '',
            '%%languageName%%' => $name,
            '%%languageInstruction%%' => str_starts_with($language, 'en-') ? '' : "\n\nCRITICAL LANGUAGE REQUIREMENT:\n" .
                "- Generate ALL content in {$name}\n- Use native {$name} vocabulary and phrasing\n" .
                "- Use {$name} date/number formats where applicable\n- Industry terminology should be in {$name}",
        ];
        $examples = new \stdClass();
        foreach ($v['documents'] as $doc) {
            [$domain, $profile] = self::type($doc->docId);
            $prompt = strtr(self::DOC_BATCH, self::context($ctx + ['docName' => $doc->docName], $domain, $profile) + $replace);
            try {
                $content = self::clean((self::$aicall)('', $prompt, 8192, false, 1.0, null));
            } catch (\Throwable $e) {
                continue;
            }
            if ($doc->docId === '__proto__') {
                // Assigning to __proto__ replaces the object's prototype, so the service's answer never shows it.
                continue;
            }
            $example = ['content' => $content];
            if ($domain !== null) {
                $example += ['domain' => $domain, 'renderProfile' => $profile];
            }
            unset($examples->{$doc->docId});
            $examples->{$doc->docId} = (object) $example;
        }
        $ordered = new \stdClass();
        foreach (self::keys($examples) as $key) {
            $ordered->$key = $examples->$key;
        }
        return [200, ['success' => true, 'documentExamples' => $ordered]];
    }

    /**
     * DOCUMENT_TYPE_CONFIGS[docId] || the general fallback.
     *
     * @param string $docid
     * @return array [domain, render profile]; both null for an Object.prototype member, which has neither.
     */
    protected static function type(string $docid): array {
        if (array_key_exists($docid, self::TYPES)) {
            return self::TYPES[$docid];
        }
        return in_array($docid, self::PROTO, true) ? [null, null] : ['General', 'procedure'];
    }

    /**
     * The placeholders the document prompts share.
     *
     * @param array $v country, state, industry, subIndustry, jobLevel, jobTitle, route and docName.
     * @param string|null $domain
     * @param string|null $profile
     * @return array
     */
    protected static function context(array $v, ?string $domain, ?string $profile): array {
        if (array_key_exists($v['jobLevel'], self::LEVELS)) {
            [$detail, $vocabulary, $examples] = self::LEVELS[$v['jobLevel']];
        } else if (in_array($v['jobLevel'], self::PROTO, true)) {
            [$detail, $vocabulary, $examples] = ['undefined', 'undefined', 'undefined'];
        } else {
            [$detail, $vocabulary, $examples] = self::LEVELS['worker'];
        }
        $replace = [
            '%%docName%%' => $v['docName'], '%%country%%' => $v['country'],
            '%%stateOrNot%%' => $v['state'] !== '' ? $v['state'] : 'Not specified', '%%industry%%' => $v['industry'],
            '%%subIndustryBrackets%%' => $v['subIndustry'] !== '' ? " ({$v['subIndustry']})" : '',
            '%%jobTitle%%' => $v['jobTitle'], '%%jobLevel%%' => $v['jobLevel'], '%%route%%' => $v['route'],
            '%%domain%%' => $domain ?? 'undefined', '%%detail%%' => $detail, '%%vocabulary%%' => $vocabulary,
            '%%examples%%' => $examples, '%%stateBrackets%%' => $v['state'] !== '' ? " ({$v['state']})" : '',
            '%%renderProfile%%' => $profile ?? 'undefined',
        ];
        foreach (self::FORMATS as $name => $line) {
            $replace['%%format' . ucfirst($name) . '%%'] = $profile === $name ? $line : '';
        }
        return $replace;
    }

    /**
     * The service's clean-up of a generated document: code fences and outer page tags removed.
     *
     * @param string $content
     * @return string
     */
    protected static function clean(string $content): string {
        $content = self::trim(preg_replace(['/```html\n?/u', '/```\n?/u'], '', $content));
        return self::trim(preg_replace(['/<\/?html[^>]*>/iu', '/<\/?body[^>]*>/iu', '/<\/?head[^>]*>[\s\S]*?<\/head>/iu'], '',
            $content));
    }
}
