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
 * AI Content Creator - Legislation-Aware Content Engine
 * v6.3.0 - Country-specific compliance framework
 * 
 * This module provides:
 * - Country legislation pack loading
 * - State/province overlay merging
 * - Compliance rule injection for AI prompts
 * - Audit-ready compliance tagging
 * 
 * @module mod_contentcreator/legislation
 *
 * @module     mod_contentcreator/legislation
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([], function () {
    'use strict';

    // ===========================================================================
    // COUNTRY LEGISLATION PACKS (Embedded for reliable loading)
    // These are teaching-safe summaries, NOT raw law text
    // ===========================================================================

    const LEGISLATION_PACKS = {
        'AU': {
            meta: { country: 'Australia', country_code: 'AU', version: '1.0.0' },
            legislation_groups: [
                {
                    group_id: 'WHS_AU',
                    group_name: 'Work Health and Safety (WHS)',
                    abbreviation: 'WHS',
                    priority: 'high',
                    summary_for_ai: 'All training content must promote safe work practices and model correct hazard management behaviour.',
                    content_rules: [
                        'Always promote safe work practices',
                        'Never present unsafe behaviour as correct',
                        'Include hazard identification where relevant',
                        'Include risk controls using practical workplace examples',
                        'Model correct PPE usage when applicable',
                        'Demonstrate correct incident reporting procedures'
                    ],
                    scenario_rules: [
                        'Scenarios must reflect realistic workplace hazards',
                        'Unsafe actions must result in corrective feedback',
                        'Emergency and incident reporting procedures must be correct'
                    ],
                    assessment_rules: [
                        'Correct answers must align with safe work practices',
                        'Incorrect answers should explain safety consequences'
                    ]
                },
                {
                    group_id: 'PRIVACY_AU',
                    group_name: 'Privacy and Data Protection',
                    abbreviation: 'APPs',
                    priority: 'high',
                    summary_for_ai: 'Learner information and workplace data must be handled responsibly.',
                    content_rules: [
                        'Use fictional or anonymised personal information in examples',
                        'Model respectful handling of digital and paper records',
                        'Demonstrate secure storage and disposal of records'
                    ],
                    scenario_rules: [
                        'Scenarios involving records must demonstrate confidentiality',
                        'Personal information must only be shared on a need-to-know basis'
                    ],
                    assessment_rules: [
                        'Questions must reinforce confidentiality principles',
                        'Do not require learners to disclose real personal information'
                    ]
                },
                {
                    group_id: 'EEO_AU',
                    group_name: 'Equal Opportunity and Anti-Discrimination',
                    abbreviation: 'EO',
                    priority: 'high',
                    summary_for_ai: 'Training content must be inclusive, fair, and free from discrimination.',
                    content_rules: [
                        'Use inclusive and respectful language',
                        'Avoid stereotypes or biased assumptions',
                        'Include diverse workplace roles and contexts',
                        'Use gender-neutral job titles where possible'
                    ],
                    scenario_rules: [
                        'Scenarios must not normalise bullying or harassment',
                        'Discriminatory behaviour must be corrected, not rewarded'
                    ],
                    assessment_rules: [
                        'Correct answers must support fair treatment',
                        'Feedback must discourage discriminatory behaviour'
                    ]
                },
                {
                    group_id: 'VET_AU',
                    group_name: 'Training and Assessment Compliance (RTO)',
                    abbreviation: 'RTO Standards',
                    priority: 'high',
                    summary_for_ai: 'All content must meet Australian VET training and assessment standards.',
                    content_rules: [
                        'Content must align to unit requirements and performance criteria',
                        'Learning materials must be clear and learner-friendly',
                        'Reasonable adjustment must be supported'
                    ],
                    scenario_rules: [
                        'Simulated workplaces must be realistic and achievable',
                        'Tasks must be solvable using provided information'
                    ],
                    assessment_rules: [
                        'Assessment must be fair, valid, reliable, and flexible',
                        'Do not trick learners with irrelevant complexity'
                    ]
                }
            ],
            prompt_injection_block: {
                system_instruction: 'All generated content must comply with Australian WHS, privacy (APPs), equal opportunity, and VET training requirements. Safety, inclusivity, and learner fairness must be prioritised. Use Australian English spelling (behaviour, organisation, colour, centre).',
                enforcement_level: 'strict'
            },
            spelling: 'en-AU'
        },

        'UK': {
            meta: { country: 'United Kingdom', country_code: 'UK', version: '1.0.0' },
            legislation_groups: [
                {
                    group_id: 'HSE_UK',
                    group_name: 'Health and Safety at Work',
                    abbreviation: 'H&S',
                    priority: 'high',
                    summary_for_ai: 'All training must reflect safe working practices under UK health and safety expectations.',
                    content_rules: [
                        'Promote safe work practices at all times',
                        'Never reward unsafe behaviour',
                        'Include hazard awareness where relevant'
                    ],
                    scenario_rules: [
                        'Scenarios must include realistic workplace hazards',
                        'Unsafe decisions must result in corrective outcomes'
                    ],
                    assessment_rules: [
                        'Correct answers must align with safe practices',
                        'Feedback must reinforce safety responsibilities'
                    ]
                },
                {
                    group_id: 'GDPR_UK',
                    group_name: 'Data Protection and Privacy (GDPR)',
                    abbreviation: 'GDPR',
                    priority: 'high',
                    summary_for_ai: 'Personal data must be treated confidentially and responsibly.',
                    content_rules: [
                        'Use fictional or anonymised personal data',
                        'Model secure handling of records'
                    ],
                    scenario_rules: [
                        'Confidential data must not be shared casually'
                    ],
                    assessment_rules: [
                        'Do not require real personal information'
                    ]
                },
                {
                    group_id: 'EQUALITY_UK',
                    group_name: 'Equality and Anti-Discrimination',
                    abbreviation: 'Equality Act',
                    priority: 'high',
                    summary_for_ai: 'Training must be inclusive and free from bias.',
                    content_rules: [
                        'Use inclusive language',
                        'Avoid stereotypes'
                    ],
                    scenario_rules: [
                        'Discrimination must never be presented as acceptable'
                    ],
                    assessment_rules: [
                        'Correct answers must promote fairness'
                    ]
                }
            ],
            prompt_injection_block: {
                system_instruction: 'All content must comply with UK health and safety, data protection (GDPR), and equality requirements. Use British English spelling.',
                enforcement_level: 'strict'
            },
            spelling: 'en-GB'
        },

        'NZ': {
            meta: { country: 'New Zealand', country_code: 'NZ', version: '1.0.0' },
            legislation_groups: [
                {
                    group_id: 'HSWA_NZ',
                    group_name: 'Health and Safety at Work',
                    abbreviation: 'HSWA',
                    priority: 'high',
                    summary_for_ai: 'Training must reflect safe work practices under New Zealand law.',
                    content_rules: [
                        'Promote hazard awareness',
                        'Model correct risk controls',
                        'Demonstrate worker participation in safety'
                    ],
                    scenario_rules: [
                        'Scenarios must demonstrate safe decision-making'
                    ],
                    assessment_rules: [
                        'Correct answers must reinforce safety responsibilities'
                    ]
                },
                {
                    group_id: 'PRIVACY_NZ',
                    group_name: 'Privacy and Information Protection',
                    abbreviation: 'Privacy Act',
                    priority: 'high',
                    summary_for_ai: 'Personal information must be protected and used responsibly.',
                    content_rules: [
                        'Use fictional personal data only',
                        'Demonstrate confidentiality'
                    ],
                    scenario_rules: [
                        'Information sharing must be appropriate'
                    ],
                    assessment_rules: [
                        'Avoid real personal data collection'
                    ]
                }
            ],
            prompt_injection_block: {
                system_instruction: 'All content must comply with New Zealand HSWA and Privacy Act requirements. Use New Zealand English spelling.',
                enforcement_level: 'strict'
            },
            spelling: 'en-NZ'
        },

        'CA': {
            meta: { country: 'Canada', country_code: 'CA', version: '1.0.0' },
            legislation_groups: [
                {
                    group_id: 'OHSA_CA',
                    group_name: 'Occupational Health and Safety',
                    abbreviation: 'OHS',
                    priority: 'high',
                    summary_for_ai: 'Training must promote safe work practices appropriate to Canadian workplaces.',
                    content_rules: [
                        'Always promote safe behaviour',
                        'Identify hazards where relevant',
                        'Emphasise worker rights including right to refuse unsafe work'
                    ],
                    scenario_rules: [
                        'Unsafe actions must be corrected'
                    ],
                    assessment_rules: [
                        'Correct answers must reinforce safety obligations'
                    ]
                },
                {
                    group_id: 'PIPEDA_CA',
                    group_name: 'Privacy and Personal Information',
                    abbreviation: 'PIPEDA',
                    priority: 'high',
                    summary_for_ai: 'Personal information must be handled responsibly and confidentially.',
                    content_rules: [
                        'Use fictional data',
                        'Demonstrate secure handling of information'
                    ],
                    scenario_rules: [
                        'Confidentiality must be maintained'
                    ],
                    assessment_rules: [
                        'Do not request real personal data'
                    ]
                }
            ],
            prompt_injection_block: {
                system_instruction: 'All content must comply with Canadian OHS and PIPEDA privacy requirements. Use Canadian English spelling.',
                enforcement_level: 'strict'
            },
            spelling: 'en-CA'
        },

        'US': {
            meta: { country: 'United States', country_code: 'US', version: '1.0.0' },
            legislation_groups: [
                {
                    group_id: 'OSHA_US',
                    group_name: 'Occupational Safety and Health (OSHA)',
                    abbreviation: 'OSHA',
                    priority: 'high',
                    summary_for_ai: 'Training content must promote safe work practices consistent with OSHA expectations.',
                    content_rules: [
                        'Always promote safe work practices',
                        'Never reward or normalise unsafe behaviour',
                        'Include hazard awareness where relevant'
                    ],
                    scenario_rules: [
                        'Workplace scenarios must include realistic hazards',
                        'Unsafe decisions must result in corrective outcomes'
                    ],
                    assessment_rules: [
                        'Correct answers must align with safe work practices',
                        'Incorrect answers must explain safety risks'
                    ]
                },
                {
                    group_id: 'PRIVACY_US',
                    group_name: 'Privacy and Learner Data Protection',
                    abbreviation: 'Privacy',
                    priority: 'high',
                    summary_for_ai: 'Learner and employee information must be handled responsibly.',
                    content_rules: [
                        'Use fictional or anonymised personal information',
                        'Model secure handling of digital and paper records'
                    ],
                    scenario_rules: [
                        'Scenarios involving records must demonstrate confidentiality'
                    ],
                    assessment_rules: [
                        'Do not require learners to provide real personal information'
                    ]
                },
                {
                    group_id: 'EEO_US',
                    group_name: 'Equal Employment Opportunity (EEO)',
                    abbreviation: 'EEO',
                    priority: 'high',
                    summary_for_ai: 'Training must be inclusive and free from discrimination.',
                    content_rules: [
                        'Use inclusive and neutral language',
                        'Avoid stereotypes or biased assumptions',
                        'Represent diverse roles and workplaces'
                    ],
                    scenario_rules: [
                        'Discrimination or harassment must never be rewarded'
                    ],
                    assessment_rules: [
                        'Correct answers must support fair treatment'
                    ]
                }
            ],
            prompt_injection_block: {
                system_instruction: 'All generated content must comply with U.S. OSHA safety expectations, privacy principles, and equal employment opportunity requirements. Use American English spelling.',
                enforcement_level: 'strict'
            },
            spelling: 'en-US'
        }
    };

    // ===========================================================================
    // AUSTRALIAN STATE OVERLAYS
    // ===========================================================================

    const STATE_OVERLAYS = {
        'AU': {
            'NSW': {
                region: 'New South Wales',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Reflect consultation with workers where safety decisions are made',
                        'Reinforce shared responsibility for workplace safety'
                    ],
                    additional_scenario_rules: [
                        'Include supervisor and worker consultation in WHS scenarios'
                    ]
                }],
                system_instruction_append: 'Apply New South Wales-specific WHS consultation and reporting expectations.'
            },
            'VIC': {
                region: 'Victoria',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Emphasise employer responsibility for safe systems of work'
                    ],
                    additional_scenario_rules: [
                        'Demonstrate employer duty of care in workplace scenarios'
                    ]
                }],
                system_instruction_append: 'Apply Victoria-specific workplace safety expectations and employer duties.'
            },
            'QLD': {
                region: 'Queensland',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Include heat stress and sun safety awareness where relevant',
                        'Address remote and isolated work considerations'
                    ],
                    additional_scenario_rules: [
                        'Consider tropical and outdoor workplace hazards'
                    ]
                }],
                system_instruction_append: 'Apply Queensland-specific workplace safety expectations including heat and remote work considerations.'
            },
            'WA': {
                region: 'Western Australia',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Address mining and resources industry safety where relevant',
                        'Include fly-in fly-out (FIFO) work considerations'
                    ],
                    additional_scenario_rules: [
                        'Consider remote site and mining workplace contexts'
                    ]
                }],
                system_instruction_append: 'Apply Western Australia-specific workplace safety expectations including mining and FIFO considerations.'
            },
            'SA': {
                region: 'South Australia',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Include SafeWork SA reporting expectations'
                    ]
                }],
                system_instruction_append: 'Apply South Australia workplace safety expectations.'
            },
            'TAS': {
                region: 'Tasmania',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: []
                }],
                system_instruction_append: 'Apply Tasmania workplace safety expectations.'
            },
            'NT': {
                region: 'Northern Territory',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Address remote and isolated work safety',
                        'Include heat stress and tropical hazards awareness'
                    ],
                    additional_scenario_rules: [
                        'Consider remote community and mining contexts'
                    ]
                }],
                system_instruction_append: 'Apply Northern Territory workplace safety expectations including remote and tropical considerations.'
            },
            'ACT': {
                region: 'Australian Capital Territory',
                overlay_rules: [{
                    applies_to_group_id: 'WHS_AU',
                    additional_content_rules: [
                        'Consider public sector and office-based work contexts'
                    ]
                }],
                system_instruction_append: 'Apply ACT workplace safety expectations.'
            }
        },
        'CA': {
            'ON': {
                region: 'Ontario',
                overlay_rules: [{
                    applies_to_group_id: 'OHSA_CA',
                    additional_content_rules: [
                        'Emphasise worker rights including the right to know, participate, and refuse unsafe work'
                    ],
                    additional_scenario_rules: [
                        'Scenarios must demonstrate supervisor responsibility',
                        'Unsafe work refusal must be handled appropriately'
                    ]
                }],
                system_instruction_append: 'Apply Ontario-specific worker rights and supervisor responsibilities in all safety-related content.'
            },
            'BC': {
                region: 'British Columbia',
                overlay_rules: [{
                    applies_to_group_id: 'OHSA_CA',
                    additional_content_rules: [
                        'Include WorkSafeBC expectations'
                    ]
                }],
                system_instruction_append: 'Apply British Columbia workplace safety expectations.'
            }
        },
        'US': {
            'CA': {
                region: 'California',
                overlay_rules: [{
                    applies_to_group_id: 'OSHA_US',
                    additional_content_rules: [
                        'Reinforce higher safety expectations where applicable',
                        'Promote proactive hazard prevention'
                    ],
                    additional_scenario_rules: [
                        'Scenarios should demonstrate employer responsibility for prevention'
                    ]
                }],
                system_instruction_append: 'Apply California-specific safety expectations, including proactive hazard prevention and employer responsibility.'
            },
            'TX': {
                region: 'Texas',
                overlay_rules: [{
                    applies_to_group_id: 'OSHA_US',
                    additional_content_rules: [
                        'Address heat stress and outdoor work safety'
                    ]
                }],
                system_instruction_append: 'Apply Texas workplace safety expectations.'
            }
        }
    };

    // ===========================================================================
    // ABBREVIATION MAP (for display in content footers)
    // ===========================================================================

    const ABBREVIATION_MAP = {
        'AU': { safety: 'WHS', privacy: 'APPs', equality: 'EO', training: 'RTO Standards' },
        'UK': { safety: 'H&S', privacy: 'GDPR', equality: 'Equality Act' },
        'NZ': { safety: 'HSWA', privacy: 'Privacy Act', equality: 'HRA' },
        'CA': { safety: 'OHS', privacy: 'PIPEDA', equality: 'HRC' },
        'US': { safety: 'OSHA', privacy: 'Privacy', equality: 'EEO' }
    };

    // ===========================================================================
    // STATE NAME TO CODE MAPPING (handles full names from dropdowns)
    // ===========================================================================

    const STATE_NAME_TO_CODE = {
        'AU': {
            'new south wales': 'NSW',
            'victoria': 'VIC',
            'queensland': 'QLD',
            'western australia': 'WA',
            'south australia': 'SA',
            'tasmania': 'TAS',
            'northern territory': 'NT',
            'australian capital territory': 'ACT'
        },
        'CA': {
            'ontario': 'ON',
            'british columbia': 'BC',
            'alberta': 'AB',
            'quebec': 'QC',
            'manitoba': 'MB',
            'saskatchewan': 'SK',
            'nova scotia': 'NS',
            'new brunswick': 'NB'
        },
        'US': {
            'california': 'CA',
            'texas': 'TX',
            'new york': 'NY',
            'florida': 'FL'
        }
    };

    /**
     * Normalize state input to code (handles full names or codes)
     * @param {string} countryCode - ISO country code
     * @param {string} stateInput - State name or code
     * @returns {string} State code (uppercase) or empty string
     */
    const normalizeStateCode = (countryCode, stateInput) => {
        if (!stateInput) return '';
        const input = stateInput.trim();
        const inputLower = input.toLowerCase();
        const country = (countryCode || 'AU').toUpperCase();
        
        // Check if it's already a valid code
        if (STATE_OVERLAYS[country]?.[input.toUpperCase()]) {
            return input.toUpperCase();
        }
        
        // Look up full name in mapping
        const mapping = STATE_NAME_TO_CODE[country];
        if (mapping && mapping[inputLower]) {
            return mapping[inputLower];
        }
        
        return input.toUpperCase(); // Return as-is if no mapping found
    };

    // ===========================================================================
    // CORE FUNCTIONS
    // ===========================================================================

    /**
     * Get legislation pack for a country
     * @param {string} countryCode - ISO country code (AU, UK, NZ, CA, US)
     * @returns {Object|null} Legislation pack or null if not found
     */
    const getPack = (countryCode) => {
        const code = (countryCode || 'AU').toUpperCase();
        return LEGISLATION_PACKS[code] || LEGISLATION_PACKS['AU'];
    };

    /**
     * Get state/province overlay
     * @param {string} countryCode - ISO country code
     * @param {string} stateInput - State/province code or full name
     * @returns {Object|null} State overlay or null
     */
    const getOverlay = (countryCode, stateInput) => {
        if (!stateInput) return null;
        const country = (countryCode || 'AU').toUpperCase();
        const stateCode = normalizeStateCode(country, stateInput);
        return STATE_OVERLAYS[country]?.[stateCode] || null;
    };

    /**
     * Apply state overlay to a base pack (immutable)
     * @param {Object} basePack - Country legislation pack
     * @param {Object} overlay - State overlay
     * @returns {Object} Merged pack
     */
    const applyOverlay = (basePack, overlay) => {
        if (!overlay) return basePack;

        const mergedPack = JSON.parse(JSON.stringify(basePack));

        overlay.overlay_rules?.forEach(overlayRule => {
            const group = mergedPack.legislation_groups.find(
                g => g.group_id === overlayRule.applies_to_group_id
            );
            if (!group) return;

            if (overlayRule.additional_content_rules) {
                group.content_rules = [...group.content_rules, ...overlayRule.additional_content_rules];
            }
            if (overlayRule.additional_scenario_rules) {
                group.scenario_rules = [...(group.scenario_rules || []), ...overlayRule.additional_scenario_rules];
            }
            if (overlayRule.additional_assessment_rules) {
                group.assessment_rules = [...(group.assessment_rules || []), ...overlayRule.additional_assessment_rules];
            }
        });

        if (overlay.system_instruction_append) {
            mergedPack.prompt_injection_block.system_instruction += '\n' + overlay.system_instruction_append;
        }

        return mergedPack;
    };

    /**
     * Get merged legislation pack for country + state
     * @param {string} countryCode - ISO country code
     * @param {string} stateCode - Optional state/province code
     * @returns {Object} Merged legislation pack
     */
    const getMergedPack = (countryCode, stateCode) => {
        const basePack = getPack(countryCode);
        const overlay = getOverlay(countryCode, stateCode);
        return applyOverlay(basePack, overlay);
    };

    /**
     * Build compliance rules block for AI system prompt
     * @param {Object} pack - Legislation pack
     * @param {string} contentType - 'content', 'scenario', or 'assessment'
     * @returns {string} Formatted rules block
     */
    const buildRulesBlock = (pack, contentType = 'content') => {
        if (!pack?.legislation_groups) return '';

        const ruleKey = contentType === 'assessment' ? 'assessment_rules' :
                        contentType === 'scenario' ? 'scenario_rules' : 'content_rules';

        const lines = [];
        pack.legislation_groups.forEach(group => {
            if (group.priority === 'high') {
                const rules = group[ruleKey] || group.content_rules || [];
                if (rules.length > 0) {
                    lines.push(`\n${group.abbreviation || group.group_name}:`);
                    rules.forEach(rule => lines.push(`  - ${rule}`));
                }
            }
        });

        return lines.join('\n');
    };

    /**
     * Build full legislation injection for system prompt
     * @param {string} countryCode - ISO country code
     * @param {string} stateCode - Optional state code
     * @param {string} contentType - 'content', 'scenario', or 'assessment'
     * @returns {string} Full legislation block for prompt injection
     */
    const buildPromptInjection = (countryCode, stateCode, contentType = 'content') => {
        const pack = getMergedPack(countryCode, stateCode);

        let injection = `\nMANDATORY COMPLIANCE FRAMEWORK (${pack.meta.country}):
${pack.prompt_injection_block.system_instruction}

Compliance Rules:${buildRulesBlock(pack, contentType)}

IMPORTANT: Legislation supports the content - it does not dominate it.
- Write for learners, not lawyers
- Use principle-based language, never cite section numbers
- Avoid threatening or penalty language
- Safety, inclusivity, and fairness are non-negotiable`;

        return injection;
    };

    /**
     * Get compliance tags for content footer (audit trail)
     * @param {string} countryCode - ISO country code
     * @returns {string[]} Array of abbreviations e.g. ['WHS', 'APPs', 'EO']
     */
    const getComplianceTags = (countryCode) => {
        const code = (countryCode || 'AU').toUpperCase();
        const abbrevs = ABBREVIATION_MAP[code] || ABBREVIATION_MAP['AU'];
        return Object.values(abbrevs).filter(Boolean);
    };

    /**
     * Render compliance footer for content display
     * @param {string[]} tags - Compliance tags
     * @returns {string} Formatted footer e.g. "Compliance: WHS * APPs * EO"
     */
    const renderComplianceFooter = (tags) => {
        if (!tags || tags.length === 0) return '';
        return `Compliance: ${tags.join(' * ')}`;
    };

    /**
     * Get spelling variant for country
     * @param {string} countryCode - ISO country code
     * @returns {string} Spelling variant e.g. 'en-AU', 'en-US'
     */
    const getSpelling = (countryCode) => {
        const pack = getPack(countryCode);
        return pack?.spelling || 'en-AU';
    };

    /**
     * Get available states for a country
     * @param {string} countryCode - ISO country code
     * @returns {Object[]} Array of {code, name} for states
     */
    const getAvailableStates = (countryCode) => {
        const code = (countryCode || 'AU').toUpperCase();
        const states = STATE_OVERLAYS[code];
        if (!states) return [];
        return Object.entries(states).map(([stateCode, data]) => ({
            code: stateCode,
            name: data.region
        }));
    };

    // ===========================================================================
    // PUBLIC API
    // ===========================================================================

    return {
        getPack,
        getOverlay,
        applyOverlay,
        getMergedPack,
        buildRulesBlock,
        buildPromptInjection,
        getComplianceTags,
        renderComplianceFooter,
        getSpelling,
        getAvailableStates,
        normalizeStateCode,
        LEGISLATION_PACKS,
        STATE_OVERLAYS,
        ABBREVIATION_MAP,
        STATE_NAME_TO_CODE
    };
});
