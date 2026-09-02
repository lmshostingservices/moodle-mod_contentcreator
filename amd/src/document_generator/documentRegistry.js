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
 * Document Registry - 40 Workplace Document Types across 7 Domains
 * v6.5.3 - Contextual Workplace Document Popups
 * 
 * Each document has:
 * - domain: Category for coverage tracking
 * - appliesToRoutes: Which routes can show this document
 * - difficultyByJobLevel: How the document appears for different job levels
 * - renderProfile: How to format the document (stepsTable, formFields, checklist, policyExcerpt, procedure)
 * 
 * @module mod_contentcreator/document_generator/documentRegistry
 *
 * @module     mod_contentcreator/document_generator/documentRegistry
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define([], function () {
    'use strict';

    // Job level ladder (standardised)
    const JOB_LEVELS = ['entry', 'apprentice', 'worker', 'supervisor', 'manager'];

    // Difficulty meanings:
    // view_only: Read-only, awareness
    // guided: Step-by-step support
    // standard: Normal workplace use
    // verify: Check or confirm
    // review: Review others' work
    // approve: Formal approval
    // enforce: Ensure compliance
    // govern: Set or own policy
    // overview: High-level visibility
    // acknowledge: Confirm understanding

    const documentRegistry = [
        // ===================================================================
        // 1. SAFETY & RISK DOMAIN (10 documents)
        // ===================================================================
        {
            id: 'swms',
            displayName: 'Safe Work Method Statement (SWMS)',
            aliases: ['SWMS', 'Safe Work Method Statement'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['AU'],
            renderProfile: 'stepsTable',
            promptTemplateId: 'swms_v1',
            description: 'High-risk work safety planning document',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'jsa',
            displayName: 'Job Safety Analysis (JSA / JHA)',
            aliases: ['JSA', 'JHA', 'Job Safety Analysis', 'Job Hazard Analysis'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['AU', 'US', 'CA', 'NZ'],
            renderProfile: 'stepsTable',
            promptTemplateId: 'jsa_v1',
            description: 'Task-based hazard identification and control',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'risk_assessment',
            displayName: 'Risk Assessment',
            aliases: ['Risk Assessment', 'RA'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'stepsTable',
            promptTemplateId: 'risk_v1',
            description: 'Systematic evaluation of workplace risks',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'contribute',
                manager: 'approve'
            }
        },
        {
            id: 'hazard_report',
            displayName: 'Hazard Report',
            aliases: ['Hazard Report', 'Hazard Identification'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'hazard_v1',
            description: 'Reporting identified workplace hazards',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'incident_report',
            displayName: 'Incident / Injury Report',
            aliases: ['Incident Report', 'Injury Report', 'Accident Report', 'Near Miss Report'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'incident_v1',
            description: 'Recording incidents, injuries, or near misses',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'near_miss_report',
            displayName: 'Near Miss Report',
            aliases: ['Near Miss', 'Near Miss Report'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'nearmiss_v1',
            description: 'Reporting events that could have caused harm',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'permit_to_work',
            displayName: 'Permit to Work',
            aliases: ['Permit to Work', 'PTW', 'Work Permit'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['AU', 'UK', 'NZ'],
            renderProfile: 'formFields',
            promptTemplateId: 'permit_v1',
            description: 'Authorisation for high-risk activities',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'guided',
                supervisor: 'approve',
                manager: 'overview'
            }
        },
        {
            id: 'prestart_checklist',
            displayName: 'Pre-Start Safety Checklist',
            aliases: ['Pre-start Checklist', 'Prestart Check', 'Pre-Start'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'checklist',
            promptTemplateId: 'prestart_v1',
            description: 'Safety checks before starting work',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'verify',
                manager: 'overview'
            }
        },
        {
            id: 'emergency_plan',
            displayName: 'Emergency Response Plan (Excerpt)',
            aliases: ['Emergency Plan', 'Emergency Response', 'ERP'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'emergency_v1',
            description: 'Procedures for emergency situations',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'view_only',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'ppe_checklist',
            displayName: 'PPE Checklist',
            aliases: ['PPE Checklist', 'PPE Register', 'Personal Protective Equipment'],
            domain: 'Safety & Risk',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'checklist',
            promptTemplateId: 'ppe_v1',
            description: 'Personal protective equipment requirements',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },

        // ===================================================================
        // 2. OPERATIONS & TASK EXECUTION DOMAIN (7 documents)
        // ===================================================================
        {
            id: 'sop',
            displayName: 'Standard Operating Procedure (SOP)',
            aliases: ['SOP', 'Standard Operating Procedure'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'procedure',
            promptTemplateId: 'sop_v1',
            description: 'Step-by-step instructions for tasks',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'work_instruction',
            displayName: 'Work Instruction',
            aliases: ['Work Instruction', 'Task Instruction'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'procedure',
            promptTemplateId: 'instruction_v1',
            description: 'Detailed instructions for specific tasks',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'job_card',
            displayName: 'Job Card / Job Sheet',
            aliases: ['Job Card', 'Job Sheet', 'Work Order'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'jobcard_v1',
            description: 'Recording job details and completion',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'verify',
                manager: 'overview'
            }
        },
        {
            id: 'maintenance_log',
            displayName: 'Maintenance Log',
            aliases: ['Maintenance Log', 'Service Log', 'Equipment Log'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'maintenance_v1',
            description: 'Recording equipment maintenance activities',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'service_report',
            displayName: 'Service Report',
            aliases: ['Service Report'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'service_v1',
            description: 'Documenting service work completed',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'quality_checklist',
            displayName: 'Quality Checklist',
            aliases: ['Quality Checklist', 'QC Checklist'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'checklist',
            promptTemplateId: 'quality_v1',
            description: 'Ensuring work meets quality standards',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'verify',
                manager: 'overview'
            }
        },
        {
            id: 'shift_handover',
            displayName: 'Shift Handover Log',
            aliases: ['Shift Handover', 'Handover Log'],
            domain: 'Operations & Task Execution',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'handover_v1',
            description: 'Communicating between shifts',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },

        // ===================================================================
        // 3. PEOPLE, BEHAVIOUR & CONDUCT DOMAIN (6 documents)
        // ===================================================================
        {
            id: 'code_of_conduct',
            displayName: 'Code of Conduct',
            aliases: ['Code of Conduct', 'Conduct Policy'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'conduct_v1',
            description: 'Expected workplace behaviour standards',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },
        {
            id: 'equal_opportunity_policy',
            displayName: 'Equal Opportunity Policy',
            aliases: ['Equal Opportunity', 'EEO Policy', 'Diversity Policy'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'eeo_v1',
            description: 'Fair treatment and anti-discrimination',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },
        {
            id: 'bullying_harassment_policy',
            displayName: 'Bullying & Harassment Policy',
            aliases: ['Bullying Policy', 'Harassment Policy', 'Anti-Bullying'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'bullying_v1',
            description: 'Prevention of workplace bullying',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },
        {
            id: 'conflict_of_interest',
            displayName: 'Conflict of Interest Declaration',
            aliases: ['Conflict of Interest', 'COI Declaration'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'coi_v1',
            description: 'Declaring potential conflicts',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'review',
                manager: 'govern'
            }
        },
        {
            id: 'performance_review',
            displayName: 'Performance Review Form',
            aliases: ['Performance Review', 'Appraisal Form'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'performance_v1',
            description: 'Evaluating employee performance',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'standard',
                supervisor: 'review',
                manager: 'approve'
            }
        },
        {
            id: 'disciplinary_procedure',
            displayName: 'Disciplinary Procedure (Excerpt)',
            aliases: ['Disciplinary Procedure', 'Disciplinary Process'],
            domain: 'People, Behaviour & Conduct',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'disciplinary_v1',
            description: 'Process for addressing misconduct',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'view_only',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },

        // ===================================================================
        // 4. TRAINING, COMPETENCY & CAPABILITY DOMAIN (6 documents)
        // ===================================================================
        {
            id: 'training_record',
            displayName: 'Training Record',
            aliases: ['Training Record', 'Training Log'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'training_v1',
            description: 'Recording completed training',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'approve'
            }
        },
        {
            id: 'competency_checklist',
            displayName: 'Competency Checklist',
            aliases: ['Competency Checklist', 'Skills Checklist'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'checklist',
            promptTemplateId: 'competency_v1',
            description: 'Verifying skills and competencies',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'verify',
                manager: 'approve'
            }
        },
        {
            id: 'induction_checklist',
            displayName: 'Induction Checklist',
            aliases: ['Induction Checklist', 'Onboarding Checklist'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'checklist',
            promptTemplateId: 'induction_v1',
            description: 'New employee orientation items',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'acknowledge',
                supervisor: 'verify',
                manager: 'overview'
            }
        },
        {
            id: 'licence_register',
            displayName: 'Licence / Certification Register',
            aliases: ['Licence Register', 'Certification Register'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'licence_v1',
            description: 'Tracking licences and certifications',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'skills_matrix',
            displayName: 'Skills Matrix',
            aliases: ['Skills Matrix', 'Competency Matrix'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'stepsTable',
            promptTemplateId: 'skills_v1',
            description: 'Mapping team skills and gaps',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'view_only',
                supervisor: 'review',
                manager: 'govern'
            }
        },
        {
            id: 'supervision_plan',
            displayName: 'Supervision Plan',
            aliases: ['Supervision Plan'],
            domain: 'Training, Competency & Capability',
            appliesToRoutes: ['vocational', 'workplace'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'supervision_v1',
            description: 'Plan for supervising learners/new staff',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'view_only',
                supervisor: 'standard',
                manager: 'approve'
            }
        },

        // ===================================================================
        // 5. REPORTING, ESCALATION & RECORDS DOMAIN (5 documents)
        // ===================================================================
        {
            id: 'customer_complaint',
            displayName: 'Customer Complaint Form',
            aliases: ['Customer Complaint', 'Complaint Form'],
            domain: 'Reporting, Escalation & Records',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'complaint_v1',
            description: 'Recording customer complaints',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'non_conformance',
            displayName: 'Non-Conformance Report',
            aliases: ['Non-Conformance', 'NCR', 'Non-Compliance Report'],
            domain: 'Reporting, Escalation & Records',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'ncr_v1',
            description: 'Reporting deviations from standards',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'approve'
            }
        },
        {
            id: 'corrective_action',
            displayName: 'Corrective Action Register',
            aliases: ['Corrective Action', 'CAPA', 'Action Register'],
            domain: 'Reporting, Escalation & Records',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'capa_v1',
            description: 'Tracking corrective and preventive actions',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'guided',
                supervisor: 'review',
                manager: 'approve'
            }
        },
        {
            id: 'audit_finding',
            displayName: 'Audit Finding Log',
            aliases: ['Audit Finding', 'Audit Log'],
            domain: 'Reporting, Escalation & Records',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'audit_v1',
            description: 'Recording audit observations',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'view_only',
                supervisor: 'review',
                manager: 'govern'
            }
        },
        {
            id: 'improvement_request',
            displayName: 'Improvement Request Form',
            aliases: ['Improvement Request', 'Suggestion Form'],
            domain: 'Reporting, Escalation & Records',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'improvement_v1',
            description: 'Suggesting process improvements',
            difficultyByJobLevel: {
                entry: 'guided',
                apprentice: 'standard',
                worker: 'standard',
                supervisor: 'review',
                manager: 'approve'
            }
        },

        // ===================================================================
        // 6. GOVERNANCE, POLICY & COMPLIANCE DOMAIN (4 documents)
        // ===================================================================
        {
            id: 'whs_policy',
            displayName: 'WHS Policy',
            aliases: ['WHS Policy', 'OHS Policy', 'Health and Safety Policy'],
            domain: 'Governance, Policy & Compliance',
            appliesToRoutes: ['vocational', 'workplace', 'university'],
            countries: ['AU', 'NZ'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'whs_v1',
            description: 'Workplace health and safety policy',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },
        {
            id: 'privacy_policy',
            displayName: 'Privacy Policy',
            aliases: ['Privacy Policy', 'Data Privacy'],
            domain: 'Governance, Policy & Compliance',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'privacy_v1',
            description: 'Handling personal information',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },
        {
            id: 'data_handling',
            displayName: 'Data Handling Procedure',
            aliases: ['Data Handling', 'Data Protection'],
            domain: 'Governance, Policy & Compliance',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'procedure',
            promptTemplateId: 'datahandling_v1',
            description: 'Procedures for handling data securely',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'standard',
                supervisor: 'review',
                manager: 'govern'
            }
        },
        {
            id: 'records_management',
            displayName: 'Records Management Policy',
            aliases: ['Records Management', 'Document Control'],
            domain: 'Governance, Policy & Compliance',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'policyExcerpt',
            promptTemplateId: 'records_v1',
            description: 'Managing and retaining records',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'view_only',
                worker: 'acknowledge',
                supervisor: 'enforce',
                manager: 'govern'
            }
        },

        // ===================================================================
        // 7. CUSTOMER, CLIENT & EXTERNAL INTERFACES DOMAIN (2 documents)
        // ===================================================================
        {
            id: 'client_intake',
            displayName: 'Client Intake / Consent Form',
            aliases: ['Client Intake', 'Consent Form', 'Client Consent'],
            domain: 'Customer, Client & External Interfaces',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'intake_v1',
            description: 'Collecting client information and consent',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        },
        {
            id: 'customer_feedback',
            displayName: 'Customer Feedback Form',
            aliases: ['Customer Feedback', 'Feedback Form', 'Survey'],
            domain: 'Customer, Client & External Interfaces',
            appliesToRoutes: ['workplace', 'university'],
            countries: ['ALL'],
            renderProfile: 'formFields',
            promptTemplateId: 'feedback_v1',
            description: 'Collecting customer feedback',
            difficultyByJobLevel: {
                entry: 'view_only',
                apprentice: 'guided',
                worker: 'standard',
                supervisor: 'review',
                manager: 'overview'
            }
        }
    ];

    // Build a lookup map for fast alias matching
    const aliasMap = {};
    documentRegistry.forEach(function (doc) {
        doc.aliases.forEach(function (alias) {
            aliasMap[alias.toLowerCase()] = doc;
        });
    });

    return {
        JOB_LEVELS: JOB_LEVELS,
        documentRegistry: documentRegistry,
        aliasMap: aliasMap,

        /**
         * Find document by alias (case-insensitive)
         */
        findByAlias: function (alias) {
            return aliasMap[alias.toLowerCase()] || null;
        },

        /**
         * Find document by ID
         */
        findById: function (id) {
            return documentRegistry.find(function (d) { return d.id === id; }) || null;
        },

        /**
         * Get all documents for a route
         */
        getDocumentsForRoute: function (route) {
            return documentRegistry.filter(function (d) {
                return d.appliesToRoutes.includes(route);
            });
        },

        /**
         * Get difficulty level for a document and job level
         */
        getDifficulty: function (doc, jobLevel) {
            if (!doc || !doc.difficultyByJobLevel) return 'view_only';
            return doc.difficultyByJobLevel[jobLevel] || 'view_only';
        },

        /**
         * Get all aliases as a regex pattern for text scanning
         */
        getAliasPattern: function () {
            var allAliases = [];
            documentRegistry.forEach(function (doc) {
                doc.aliases.forEach(function (alias) {
                    allAliases.push(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                });
            });
            // Sort by length descending to match longer aliases first
            allAliases.sort(function (a, b) { return b.length - a.length; });
            return new RegExp('\\b(' + allAliases.join('|') + ')\\b', 'gi');
        }
    };
});
