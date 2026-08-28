/**
 * Industry Document Profiles - 20+ Industries with Document Priorities
 * v6.5.3 - Contextual Workplace Document Popups
 * 
 * Each profile controls:
 * - priorityDomains: Which document domains matter most
 * - coreDocuments: Essential documents (pre-selected in suggestions)
 * - optionalDocuments: Useful but not essential
 * - suppressedDocuments: Never show for this industry
 * 
 * @module mod_contentcreator/document_generator/industryProfiles
 */

define([], function () {
    'use strict';

    const industryProfiles = {
        // ===================================================================
        // HIGH-RISK INDUSTRIES (Safety & Risk Heavy)
        // ===================================================================
        
        construction: {
            displayName: 'Construction',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution',
                'Training, Competency & Capability'
            ],
            coreDocuments: ['swms', 'jsa', 'risk_assessment', 'permit_to_work', 'prestart_checklist'],
            optionalDocuments: ['incident_report', 'hazard_report', 'ppe_checklist', 'maintenance_log', 'training_record'],
            suppressedDocuments: ['customer_complaint', 'client_intake', 'customer_feedback']
        },

        manufacturing: {
            displayName: 'Manufacturing',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['risk_assessment', 'jsa', 'maintenance_log', 'quality_checklist', 'sop'],
            optionalDocuments: ['incident_report', 'hazard_report', 'ppe_checklist', 'training_record'],
            suppressedDocuments: ['client_intake']
        },

        mining_resources: {
            displayName: 'Mining & Resources',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution',
                'Training, Competency & Capability'
            ],
            coreDocuments: ['swms', 'permit_to_work', 'risk_assessment', 'training_record', 'prestart_checklist'],
            optionalDocuments: ['incident_report', 'hazard_report', 'emergency_plan', 'ppe_checklist'],
            suppressedDocuments: ['customer_complaint', 'client_intake']
        },

        energy_utilities: {
            displayName: 'Energy & Utilities',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution',
                'Training, Competency & Capability'
            ],
            coreDocuments: ['swms', 'permit_to_work', 'risk_assessment', 'training_record', 'licence_register'],
            optionalDocuments: ['incident_report', 'maintenance_log', 'emergency_plan'],
            suppressedDocuments: []
        },

        transport_logistics: {
            displayName: 'Transport & Logistics',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['risk_assessment', 'incident_report', 'maintenance_log', 'prestart_checklist'],
            optionalDocuments: ['training_record', 'licence_register', 'job_card'],
            suppressedDocuments: []
        },

        warehousing: {
            displayName: 'Warehousing',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['jsa', 'risk_assessment', 'incident_report', 'prestart_checklist'],
            optionalDocuments: ['training_record', 'quality_checklist'],
            suppressedDocuments: []
        },

        agriculture: {
            displayName: 'Agriculture',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['risk_assessment', 'jsa', 'maintenance_log', 'prestart_checklist'],
            optionalDocuments: ['incident_report', 'training_record', 'ppe_checklist'],
            suppressedDocuments: []
        },

        laboratory_science: {
            displayName: 'Laboratory & Science',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['risk_assessment', 'jsa', 'incident_report', 'sop'],
            optionalDocuments: ['training_record', 'quality_checklist'],
            suppressedDocuments: []
        },

        trades_general: {
            displayName: 'Trades (General)',
            priorityDomains: [
                'Safety & Risk',
                'Operations & Task Execution'
            ],
            coreDocuments: ['jsa', 'risk_assessment', 'job_card', 'prestart_checklist'],
            optionalDocuments: ['incident_report', 'maintenance_log', 'training_record'],
            suppressedDocuments: []
        },

        // ===================================================================
        // SERVICE INDUSTRIES (Customer & Operations Heavy)
        // ===================================================================

        healthcare: {
            displayName: 'Healthcare',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'Reporting, Escalation & Records',
                'People, Behaviour & Conduct'
            ],
            coreDocuments: ['incident_report', 'privacy_policy', 'client_intake'],
            optionalDocuments: ['training_record', 'induction_checklist', 'code_of_conduct'],
            suppressedDocuments: ['swms', 'permit_to_work', 'job_card']
        },

        disability_aged_care: {
            displayName: 'Disability & Aged Care',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'People, Behaviour & Conduct',
                'Reporting, Escalation & Records'
            ],
            coreDocuments: ['privacy_policy', 'incident_report', 'client_intake', 'code_of_conduct'],
            optionalDocuments: ['training_record', 'induction_checklist'],
            suppressedDocuments: ['swms', 'permit_to_work']
        },

        hospitality: {
            displayName: 'Hospitality',
            priorityDomains: [
                'Operations & Task Execution',
                'Customer, Client & External Interfaces',
                'People, Behaviour & Conduct'
            ],
            coreDocuments: ['sop', 'customer_complaint', 'code_of_conduct'],
            optionalDocuments: ['incident_report', 'training_record', 'induction_checklist'],
            suppressedDocuments: ['swms', 'permit_to_work']
        },

        retail: {
            displayName: 'Retail',
            priorityDomains: [
                'Customer, Client & External Interfaces',
                'People, Behaviour & Conduct'
            ],
            coreDocuments: ['customer_complaint', 'code_of_conduct', 'induction_checklist'],
            optionalDocuments: ['incident_report', 'training_record'],
            suppressedDocuments: ['swms', 'permit_to_work', 'jsa']
        },

        cleaning_facilities: {
            displayName: 'Cleaning & Facilities Management',
            priorityDomains: [
                'Operations & Task Execution',
                'Safety & Risk'
            ],
            coreDocuments: ['sop', 'jsa', 'incident_report', 'quality_checklist'],
            optionalDocuments: ['customer_complaint', 'training_record'],
            suppressedDocuments: []
        },

        property_real_estate: {
            displayName: 'Property & Real Estate',
            priorityDomains: [
                'Customer, Client & External Interfaces',
                'Governance, Policy & Compliance'
            ],
            coreDocuments: ['client_intake', 'privacy_policy', 'customer_complaint'],
            optionalDocuments: ['incident_report', 'code_of_conduct'],
            suppressedDocuments: ['swms', 'permit_to_work', 'jsa']
        },

        // ===================================================================
        // PROFESSIONAL INDUSTRIES (Governance & Policy Heavy)
        // ===================================================================

        business_office: {
            displayName: 'Business / Office',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'People, Behaviour & Conduct'
            ],
            coreDocuments: ['privacy_policy', 'code_of_conduct', 'training_record'],
            optionalDocuments: ['incident_report', 'data_handling', 'induction_checklist'],
            suppressedDocuments: ['swms', 'permit_to_work', 'jsa', 'prestart_checklist']
        },

        education_training: {
            displayName: 'Education & Training',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'Training, Competency & Capability'
            ],
            coreDocuments: ['training_record', 'induction_checklist', 'privacy_policy'],
            optionalDocuments: ['incident_report', 'code_of_conduct'],
            suppressedDocuments: ['swms', 'permit_to_work']
        },

        government_public: {
            displayName: 'Government & Public Sector',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'Reporting, Escalation & Records'
            ],
            coreDocuments: ['privacy_policy', 'incident_report', 'code_of_conduct', 'conflict_of_interest'],
            optionalDocuments: ['training_record', 'audit_finding'],
            suppressedDocuments: []
        },

        it_software: {
            displayName: 'IT & Software',
            priorityDomains: [
                'Governance, Policy & Compliance',
                'Operations & Task Execution'
            ],
            coreDocuments: ['privacy_policy', 'data_handling', 'incident_report'],
            optionalDocuments: ['training_record', 'code_of_conduct'],
            suppressedDocuments: ['swms', 'permit_to_work', 'jsa', 'prestart_checklist']
        },

        creative_industries: {
            displayName: 'Creative Industries',
            priorityDomains: [
                'People, Behaviour & Conduct',
                'Governance, Policy & Compliance'
            ],
            coreDocuments: ['code_of_conduct', 'privacy_policy'],
            optionalDocuments: ['training_record', 'client_intake'],
            suppressedDocuments: ['swms', 'permit_to_work']
        }
    };

    // ===================================================================
    // SUB-INDUSTRY OVERRIDES
    // ===================================================================

    const subIndustryProfiles = {
        construction: {
            residential: {
                displayName: 'Residential Construction',
                addCoreDocuments: ['prestart_checklist'],
                addOptionalDocuments: ['customer_complaint'],
                suppressDocuments: []
            },
            commercial: {
                displayName: 'Commercial Construction',
                addCoreDocuments: ['permit_to_work', 'audit_finding'],
                addOptionalDocuments: [],
                suppressDocuments: []
            },
            civil: {
                displayName: 'Civil Construction',
                addCoreDocuments: ['emergency_plan'],
                addOptionalDocuments: [],
                suppressDocuments: []
            }
        },
        healthcare: {
            hospital: {
                displayName: 'Hospital / Acute Care',
                addCoreDocuments: ['emergency_plan'],
                addOptionalDocuments: [],
                suppressDocuments: []
            },
            community: {
                displayName: 'Community Care',
                addCoreDocuments: [],
                addOptionalDocuments: [],
                suppressDocuments: ['emergency_plan']
            },
            allied_health: {
                displayName: 'Allied Health',
                addCoreDocuments: ['client_intake'],
                addOptionalDocuments: [],
                suppressDocuments: []
            }
        },
        hospitality: {
            food_service: {
                displayName: 'Food Service',
                addCoreDocuments: ['quality_checklist'],
                addOptionalDocuments: [],
                suppressDocuments: []
            },
            accommodation: {
                displayName: 'Accommodation',
                addCoreDocuments: ['customer_feedback'],
                addOptionalDocuments: [],
                suppressDocuments: []
            }
        },
        retail: {
            food_retail: {
                displayName: 'Food Retail',
                addCoreDocuments: ['quality_checklist'],
                addOptionalDocuments: [],
                suppressDocuments: []
            }
        }
    };

    return {
        industryProfiles: industryProfiles,
        subIndustryProfiles: subIndustryProfiles,

        /**
         * Get industry profile by key
         */
        getProfile: function (industryKey) {
            return industryProfiles[industryKey] || null;
        },

        /**
         * Get sub-industry profile
         */
        getSubProfile: function (industryKey, subKey) {
            if (!subIndustryProfiles[industryKey]) return null;
            return subIndustryProfiles[industryKey][subKey] || null;
        },

        /**
         * Get merged document lists for industry + sub-industry
         */
        getMergedDocuments: function (industryKey, subKey) {
            var industry = industryProfiles[industryKey];
            if (!industry) return { core: [], optional: [], suppressed: [] };

            var core = new Set(industry.coreDocuments);
            var optional = new Set(industry.optionalDocuments);
            var suppressed = new Set(industry.suppressedDocuments);

            // Apply sub-industry overrides
            if (subKey && subIndustryProfiles[industryKey] && subIndustryProfiles[industryKey][subKey]) {
                var sub = subIndustryProfiles[industryKey][subKey];
                if (sub.addCoreDocuments) {
                    sub.addCoreDocuments.forEach(function (d) { core.add(d); });
                }
                if (sub.addOptionalDocuments) {
                    sub.addOptionalDocuments.forEach(function (d) { optional.add(d); });
                }
                if (sub.suppressDocuments) {
                    sub.suppressDocuments.forEach(function (d) {
                        core.delete(d);
                        optional.delete(d);
                        suppressed.add(d);
                    });
                }
            }

            return {
                core: Array.from(core),
                optional: Array.from(optional),
                suppressed: Array.from(suppressed)
            };
        },

        /**
         * Check if document is relevant for industry
         */
        isDocumentRelevant: function (docId, industryKey, subKey) {
            var merged = this.getMergedDocuments(industryKey, subKey);
            if (merged.suppressed.includes(docId)) return false;
            return merged.core.includes(docId) || merged.optional.includes(docId) || 
                   (!merged.suppressed.includes(docId)); // Default to relevant if not suppressed
        },

        /**
         * Get document priority (core=2, optional=1, other=0)
         */
        getDocumentPriority: function (docId, industryKey, subKey) {
            var merged = this.getMergedDocuments(industryKey, subKey);
            if (merged.core.includes(docId)) return 2;
            if (merged.optional.includes(docId)) return 1;
            return 0;
        }
    };
});
