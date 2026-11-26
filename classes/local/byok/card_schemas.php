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
 * The service's card response formats (CC_CARD_JSON_SCHEMA and CC_TOPICSTEXT_JSON_SCHEMA), copied unchanged.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class card_schemas {
    /** @var array The card format for the fixed-layout routes. */
    const CARD = [
        'type' => 'json_schema',
        'json_schema' => [
            'name' => 'route_card_content',
            'strict' => true,
            'schema' => [
                'type' => 'object',
                'properties' => [
                    'cards' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'cardType' => [
                                    'type' => 'string',
                                ],
                                'voiceoverText' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'pcStatement' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'elementText' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'summaryLine' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'heading' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'bodyText' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'title' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'context' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'consequence' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyPoints' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'anyOf' => [
                                                    [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'title' => [
                                                                'type' => 'string',
                                                            ],
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['title', 'text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                    [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'actions' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'heading' => [
                                                        'type' => 'string',
                                                    ],
                                                    'bullets' => [
                                                        'type' => 'array',
                                                        'items' => [
                                                            'type' => 'string',
                                                        ],
                                                    ],
                                                ],
                                                'required' => ['heading', 'bullets'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'standardItems' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'text' => [
                                                        'type' => 'string',
                                                    ],
                                                    'benefit' => [
                                                        'anyOf' => [
                                                            [
                                                                'type' => 'string',
                                                            ],
                                                            [
                                                                'type' => 'null',
                                                            ],
                                                        ],
                                                    ],
                                                    'consequence' => [
                                                        'anyOf' => [
                                                            [
                                                                'type' => 'string',
                                                            ],
                                                            [
                                                                'type' => 'null',
                                                            ],
                                                        ],
                                                    ],
                                                ],
                                                'required' => ['text', 'benefit', 'consequence'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'errorItems' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'error' => [
                                                        'type' => 'string',
                                                    ],
                                                    'consequence' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['error', 'consequence'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'description' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyTakeaway' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'proTip' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyInfo' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'expertInsight' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'evidenceGenerated' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'requirements' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'observableBehaviours' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'industryArtefactsReferenced' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'checklistItems' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'mappedPerformanceCriteria' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'mappedKnowledgeEvidence' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'terminology' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'term' => [
                                                        'type' => 'string',
                                                    ],
                                                    'definition' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['term', 'definition'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'mentalModel' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'object',
                                            'properties' => [
                                                'name' => [
                                                    'type' => 'string',
                                                ],
                                                'principle' => [
                                                    'type' => 'string',
                                                ],
                                            ],
                                            'required' => ['name', 'principle'],
                                            'additionalProperties' => false,
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'reflection' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'object',
                                            'properties' => [
                                                'question' => [
                                                    'type' => 'string',
                                                ],
                                                'sampleAnswers' => [
                                                    'type' => 'array',
                                                    'items' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                            ],
                                            'required' => ['question', 'sampleAnswers'],
                                            'additionalProperties' => false,
                                        ],
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'turningPoint' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'conceptDefinition' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'significance' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyTerms' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'term' => [
                                                        'type' => 'string',
                                                    ],
                                                    'definition' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['term', 'definition'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'frameworks' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'name' => [
                                                        'type' => 'string',
                                                    ],
                                                    'originator' => [
                                                        'type' => 'string',
                                                    ],
                                                    'principle' => [
                                                        'type' => 'string',
                                                    ],
                                                    'limitation' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['name', 'originator', 'principle', 'limitation'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'cognitiveConsiderations' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'considerations' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'dimension' => [
                                                        'type' => 'string',
                                                    ],
                                                    'description' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['dimension', 'description'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'analysisPrompts' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'consequences' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'impactStatement' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyMetrics' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'steps' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'anyOf' => [
                                                    [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'step' => [
                                                                'type' => 'string',
                                                            ],
                                                            'icon' => [
                                                                'type' => 'string',
                                                            ],
                                                            'detail' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['step', 'icon', 'detail'],
                                                        'additionalProperties' => false,
                                                    ],
                                                    [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'action' => [
                                                                'type' => 'string',
                                                            ],
                                                            'detail' => [
                                                                'type' => 'string',
                                                            ],
                                                            'timeframe' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['action', 'detail', 'timeframe'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'risks' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'risk' => [
                                                        'type' => 'string',
                                                    ],
                                                    'likelihood' => [
                                                        'type' => 'string',
                                                    ],
                                                    'impact' => [
                                                        'type' => 'string',
                                                    ],
                                                    'mitigation' => [
                                                        'type' => 'string',
                                                    ],
                                                    'consequence' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['risk', 'likelihood', 'impact', 'mitigation', 'consequence'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'policyItems' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'policy' => [
                                                        'type' => 'string',
                                                    ],
                                                    'requirement' => [
                                                        'type' => 'string',
                                                    ],
                                                    'consequence' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['policy', 'requirement', 'consequence'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'optimisationTips' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'skillStatement' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'relevance' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyIndicators' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'frameworkSteps' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'step' => [
                                                        'type' => 'string',
                                                    ],
                                                    'explanation' => [
                                                        'type' => 'string',
                                                    ],
                                                    'example' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['step', 'explanation', 'example'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyPrinciple' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'applications' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'situation' => [
                                                        'type' => 'string',
                                                    ],
                                                    'action' => [
                                                        'type' => 'string',
                                                    ],
                                                    'rationale' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['situation', 'action', 'rationale'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'pitfallItems' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'pitfall' => [
                                                        'type' => 'string',
                                                    ],
                                                    'consequence' => [
                                                        'type' => 'string',
                                                    ],
                                                    'correction' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['pitfall', 'consequence', 'correction'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'keyInsight' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'criticalReflection' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'string',
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'schemaVersion' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'integer',
                                            'enum' => [2],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                                'questions' => [
                                    'anyOf' => [
                                        [
                                            'type' => 'array',
                                            'minItems' => 3,
                                            'maxItems' => 3,
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'question' => [
                                                        'type' => 'string',
                                                    ],
                                                    'options' => [
                                                        'type' => 'array',
                                                        'minItems' => 4,
                                                        'maxItems' => 4,
                                                        'items' => [
                                                            'type' => 'object',
                                                            'properties' => [
                                                                'text' => [
                                                                    'type' => 'string',
                                                                ],
                                                                'correct' => [
                                                                    'type' => 'boolean',
                                                                ],
                                                                'feedback' => [
                                                                    'type' => 'string',
                                                                ],
                                                            ],
                                                            'required' => ['text', 'correct', 'feedback'],
                                                            'additionalProperties' => false,
                                                        ],
                                                    ],
                                                    'feedback' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['question', 'options', 'feedback'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        [
                                            'type' => 'null',
                                        ],
                                    ],
                                ],
                            ],
                            'required' => [
                                'cardType',
                                'voiceoverText',
                                'pcStatement',
                                'elementText',
                                'summaryLine',
                                'heading',
                                'bodyText',
                                'title',
                                'context',
                                'consequence',
                                'keyPoints',
                                'actions',
                                'standardItems',
                                'errorItems',
                                'description',
                                'keyTakeaway',
                                'proTip',
                                'keyInfo',
                                'expertInsight',
                                'evidenceGenerated',
                                'requirements',
                                'observableBehaviours',
                                'industryArtefactsReferenced',
                                'checklistItems',
                                'mappedPerformanceCriteria',
                                'mappedKnowledgeEvidence',
                                'terminology',
                                'mentalModel',
                                'reflection',
                                'turningPoint',
                                'conceptDefinition',
                                'significance',
                                'keyTerms',
                                'frameworks',
                                'cognitiveConsiderations',
                                'considerations',
                                'analysisPrompts',
                                'consequences',
                                'impactStatement',
                                'keyMetrics',
                                'steps',
                                'risks',
                                'policyItems',
                                'optimisationTips',
                                'skillStatement',
                                'relevance',
                                'keyIndicators',
                                'frameworkSteps',
                                'keyPrinciple',
                                'applications',
                                'pitfallItems',
                                'keyInsight',
                                'criticalReflection',
                                'schemaVersion',
                                'questions',
                            ],
                            'additionalProperties' => false,
                        ],
                    ],
                ],
                'required' => ['cards'],
                'additionalProperties' => false,
            ],
        ],
    ];

    /** @var array The card format for Topics and Text. */
    const TOPICS = [
        'type' => 'json_schema',
        'json_schema' => [
            'name' => 'topicstext_card_content',
            'strict' => true,
            'schema' => [
                'type' => 'object',
                'properties' => [
                    'cards' => [
                        'type' => 'array',
                        'minItems' => 7,
                        'maxItems' => 11,
                        'items' => [
                            'anyOf' => [
                                [
                                    'type' => 'object',
                                    'properties' => [
                                        'cardType' => [
                                            'type' => 'string',
                                        ],
                                        'heading' => [
                                            'type' => 'string',
                                        ],
                                        'paragraphs' => [
                                            'type' => 'array',
                                            'minItems' => 2,
                                            'maxItems' => 2,
                                            'items' => [
                                                'type' => 'string',
                                            ],
                                        ],
                                        'keyTerms' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 4,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'term' => [
                                                                'type' => 'string',
                                                            ],
                                                            'definition' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['term', 'definition'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                        'goodItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                        'badItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                    ],
                                    'required' => [
                                        'cardType',
                                        'heading',
                                        'paragraphs',
                                        'keyTerms',
                                        'goodItems',
                                        'badItems',
                                    ],
                                    'additionalProperties' => false,
                                ],
                                [
                                    'type' => 'object',
                                    'properties' => [
                                        'cardType' => [
                                            'type' => 'string',
                                            'enum' => ['decision-point'],
                                        ],
                                        'title' => [
                                            'type' => 'string',
                                        ],
                                        'question' => [
                                            'type' => 'string',
                                        ],
                                        'options' => [
                                            'type' => 'array',
                                            'minItems' => 4,
                                            'maxItems' => 4,
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'text' => [
                                                        'type' => 'string',
                                                    ],
                                                    'correct' => [
                                                        'type' => 'boolean',
                                                    ],
                                                    'feedback' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['text', 'correct', 'feedback'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        'goodItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                        'badItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                    ],
                                    'required' => ['cardType', 'title', 'question', 'options', 'goodItems', 'badItems'],
                                    'additionalProperties' => false,
                                ],
                                [
                                    'type' => 'object',
                                    'properties' => [
                                        'cardType' => [
                                            'type' => 'string',
                                            'enum' => ['decision-point'],
                                        ],
                                        'schemaVersion' => [
                                            'type' => 'integer',
                                            'enum' => [2],
                                        ],
                                        'questions' => [
                                            'type' => 'array',
                                            'minItems' => 3,
                                            'maxItems' => 3,
                                            'items' => [
                                                'type' => 'object',
                                                'properties' => [
                                                    'question' => [
                                                        'type' => 'string',
                                                    ],
                                                    'options' => [
                                                        'type' => 'array',
                                                        'minItems' => 4,
                                                        'maxItems' => 4,
                                                        'items' => [
                                                            'type' => 'object',
                                                            'properties' => [
                                                                'text' => [
                                                                    'type' => 'string',
                                                                ],
                                                                'correct' => [
                                                                    'type' => 'boolean',
                                                                ],
                                                                'feedback' => [
                                                                    'type' => 'string',
                                                                ],
                                                            ],
                                                            'required' => ['text', 'correct', 'feedback'],
                                                            'additionalProperties' => false,
                                                        ],
                                                    ],
                                                    'feedback' => [
                                                        'type' => 'string',
                                                    ],
                                                ],
                                                'required' => ['question', 'options', 'feedback'],
                                                'additionalProperties' => false,
                                            ],
                                        ],
                                        'goodItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                        'badItems' => [
                                            'anyOf' => [
                                                [
                                                    'type' => 'array',
                                                    'minItems' => 3,
                                                    'maxItems' => 3,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'properties' => [
                                                            'text' => [
                                                                'type' => 'string',
                                                            ],
                                                        ],
                                                        'required' => ['text'],
                                                        'additionalProperties' => false,
                                                    ],
                                                ],
                                                [
                                                    'type' => 'null',
                                                ],
                                            ],
                                        ],
                                    ],
                                    'required' => ['cardType', 'schemaVersion', 'questions', 'goodItems', 'badItems'],
                                    'additionalProperties' => false,
                                ],
                            ],
                        ],
                    ],
                ],
                'required' => ['cards'],
                'additionalProperties' => false,
            ],
        ],
    ];
}
