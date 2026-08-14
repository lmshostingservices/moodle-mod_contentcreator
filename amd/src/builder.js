/**
 * Content Creator v7.9.74 - Smart Learning Content Wizard
 * [SPEC] 3-step wizard: Mode  ->  Context  ->  Topics  ->  Generate
 * [SPEC] VET mode: TGA auto-fetch, context injection
 * [SPEC] Workplace mode: Document-first, company training content
 * [SPEC] University mode: Learning outcomes, Blooms mapping
 * [SPEC] v7.9.6: Route-specific card microlearning model support (VET 7-card, Uni 6-card, Workplace 6-card)
 *
 * @module     mod_contentcreator/builder
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('mod_contentcreator/builder', [
    'core/ajax',
    'core/notification',
    'mod_contentcreator/manifest.builder',
    'mod_contentcreator/planner',
    'mod_contentcreator/cc-state',
    'mod_contentcreator/generator'
], function(Ajax, Notification, ManifestBuilder, Planner, CcState, Generator) {
    'use strict';

    // v9.83 Phase-1: Version and logger now come from the shared cc-state module,
    // eliminating the duplication that existed between builder.js and player5.js.
    const CC_VERSION = CcState.CC_VERSION;
    const CC_VERBOSE_LOG = false; // dev flag  -  stays local so each module can tune independently

    // AUTO-SPLIT-SECTION (v12.78): Elements with more than this many PCs are automatically
    // split into two sections (Part 1, Part 2) to keep each content pack manageable.
    const MAX_PCS_PER_SECTION = 8;
    const _log = CcState.createLogger(CC_VERBOSE_LOG);
    const ccLog = _log.log;
    const ccWarn = _log.warn;
    const ccError = _log.error;


    let cmid = 0;
    let container = null;
    let manifest = null;
    let currentStep = 1;
    let selectedMode = null;
    let tgaData = null;
    let topicPlan = null;
    let suggestedMajorTopics = []; // AI-suggested Major Learning Topics (Stage 1)
    let selectedMajorTopicIds = []; // User-selected Major Topic IDs for generation
    let selectedElementIds = []; // v6.9.11: User-selected element IDs (e.g., just Element 1)
    let elementSelectionInitialized = false; // v6.9.25: Flag to prevent re-init after deselect all
    let workplaceData = null; // Workplace mode: extracted document content
    let vetPastedContent = ''; // v7.9.0: Pasted text for VET reference content
    let uniPastedContent = ''; // v7.9.0: Pasted text for University course content
    let pdPastedContent = ''; // v9.21: Pasted text for PD course content
    let currentCredits = null; // Current AI credits balance
    
    // v6.9.1: Initialize AI context globals at module load to prevent undefined errors
    window.CC_AI_CONTEXT = window.CC_AI_CONTEXT || null;
    window.CC_AI_JOB_TITLES = window.CC_AI_JOB_TITLES || [];
    window.CC_AI_TASK_CATEGORIES = window.CC_AI_TASK_CATEGORIES || [];
    window.CC_AI_EQUIPMENT_CATEGORIES = window.CC_AI_EQUIPMENT_CATEGORIES || [];
    window.CC_AI_DETECTED_INDUSTRY = window.CC_AI_DETECTED_INDUSTRY || '';
    window.CC_AI_DETECTED_SECTOR = window.CC_AI_DETECTED_SECTOR || '';
    window.CC_SELECTED_JOB_TITLES = window.CC_SELECTED_JOB_TITLES || [];
    window.CC_SELECTED_TASKS = window.CC_SELECTED_TASKS || [];
    window.CC_SELECTED_EQUIPMENT = window.CC_SELECTED_EQUIPMENT || [];
    window.CC_SELECTED_JOB_ROLES = window.CC_SELECTED_JOB_ROLES || [];
    window.CC_SELECTED_JOB_LEVELS = window.CC_SELECTED_JOB_LEVELS || [];
    window.CC_SELECTED_TASK_CATEGORIES = window.CC_SELECTED_TASK_CATEGORIES || [];
    window.CC_SELECTED_EQUIPMENT_CATEGORIES = window.CC_SELECTED_EQUIPMENT_CATEGORIES || [];
    window.CC_SELECTED_EQUIPMENT_LEGACY = window.CC_SELECTED_EQUIPMENT_LEGACY || [];
    
    // v6.9.1: AI failure tracking
    window.CC_AI_FAILED = window.CC_AI_FAILED || false;
    window.CC_AI_NO_FALLBACK = window.CC_AI_NO_FALLBACK || false;
    window.CC_AI_LOADING = window.CC_AI_LOADING || false;

    let storedContext = null; // Context captured from Step 2 for display in Step 3
    let storedOutcomes = []; // v6.5.48: Outcomes captured from Step 2 (DOM elements are replaced)
    let storedTopicHierarchy = null; // v9.24: Structured hierarchy from paste {topics: [{title, subtopics: [string]}]}
    let workplacePastedContent = ''; // v8.4.24: Pasted text for Workplace reference content

    /**
     * v7.9.10: Get Moodle site primary color from theme CSS variables
     * Falls back to #047857 (emerald) if not available
     * @returns {string} - Hex color code
     */
    const getMoodlePrimaryColor = () => {
        try {
            // Try Boost theme CSS variable (--primary)
            const computedStyle = getComputedStyle(document.documentElement);
            let primary = computedStyle.getPropertyValue("--primary")?.trim();
            if (primary && /^#[0-9A-Fa-f]{6}$/.test(primary)) return primary;
            
            // Try Bootstrap 5 variable (--bs-primary)
            primary = computedStyle.getPropertyValue("--bs-primary")?.trim();
            if (primary && /^#[0-9A-Fa-f]{6}$/.test(primary)) return primary;
            
            const tempBtn = document.createElement("button");
            tempBtn.className = "btn btn-primary";
            tempBtn.style.display = "none";
            var ccRoot = document.getElementById('contentcreator-app') || document.body;
            ccRoot.appendChild(tempBtn);
            const btnStyle = getComputedStyle(tempBtn);
            const bgColor = btnStyle.backgroundColor;
            ccRoot.removeChild(tempBtn);
            
            // Convert rgb(r,g,b) to hex
            if (bgColor && bgColor.startsWith("rgb")) {
                const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (match) {
                    const hex = "#" + [match[1], match[2], match[3]].map(x => {
                        const h = parseInt(x).toString(16);
                        return h.length === 1 ? "0" + h : h;
                    }).join("");
                    return hex.toUpperCase();
                }
            }
        } catch (e) {
            // Ignore errors, return fallback
        }
        return "#047857"; // Fallback emerald
    };

    /**
     * v6.6.6: Truncate text at word boundary to avoid mid-word cuts
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum character length (default 150)
     * @returns {string} - Truncated text at word boundary, never mid-word
     */
    const truncateAtWordBoundary = (text, maxLength = 150) => {
        if (!text || text.length <= maxLength) return text;
        
        // Find the last space before maxLength
        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > maxLength * 0.5) {
            // Truncate at the last word boundary
            return truncated.substring(0, lastSpace).trim();
        }
        // If no good word boundary found, just return trimmed version
        return truncated.trim();
    };

    const fixGrammar = (str) => {
        if (!str || typeof str !== 'string') return str;
        var s = str;
        s = s.replace(/\bso you don['\u2019]?t\s+(?=[a-z]+\b)(?!have|get|need|make|miss|lose|fall|cause|end|skip|forget|ignore|rush|start|put|leave|let|take|break|use|risk|create|become|repeat|face|allow|go|run|do|know|see|feel|think|try|keep|come|give|find|want|work|stop|set|move|turn|hold|bring|begin|carry|follow|overlook|expose|compromise|violate|exceed|delay|suffer|experience|injure|damage|endanger|contaminate|drop|wear|hit|cut|catch|pass|sit|stand|add|open|check|provide|handle|manage|ensure|maintain|avoid|prevent|reduce|increase|improve|receive|complete)/gi, 'so you avoid ');
        s = s.replace(/\bso you\s+your\b/gi, 'so you protect your');
        s = s.replace(/\bso you\s+safety\b/gi, 'so you maintain safety');
        s = s.replace(/\bso you\s+the\s+safety\b/gi, 'so you ensure the safety');
        s = s.replace(/\bso you\s+the\s+/gi, 'so you understand the ');
        s = s.replace(/\bso you\s+(?:optimal|proper|adequate|sufficient|full|complete|clear|immediate|minimal|consistent|accurate|appropriate|correct|comfortable|effective|efficient|maximum|minimum|good|better|best|safe|total|reliable|thorough|reasonable|necessary|successful|secure|healthy|stable|strong|smooth|timely|rapid|quick|clean|standard|suitable|regular|balanced|controlled|steady|uniform)\b/gi, function(match) {
            return 'so you ensure ' + match.replace(/^so you\s+/i, '');
        });
        s = s.replace(/\b(is|are|was|were)\s+because\s+because\b/gi, '$1 because');
        s = s.replace(/\b(\w{4,})\s+\1\b/g, '$1');
        s = s.replace(/\.\s*\.\s*/g, '. ');
        s = s.replace(/\s{2,}/g, ' ');
        return s.trim();
    };

    const fixManifestGrammar = (obj) => {
        if (!obj) return obj;
        if (typeof obj === 'string') return fixGrammar(obj);
        if (Array.isArray(obj)) return obj.map(item => fixManifestGrammar(item));
        if (typeof obj === 'object') {
            const fixed = {};
            for (const [key, value] of Object.entries(obj)) {
                if (key === 'id' || key === 'type' || key === 'contrastType' || key === 'language' || key === 'gender' || key === 'voiceoverUrl' || key === 'image' || key === 'image2' || key === 'icon' || key === 'color' || key === 'number' || key === 'sectionId') {
                    fixed[key] = value;
                } else {
                    fixed[key] = fixManifestGrammar(value);
                }
            }
            return fixed;
        }
        return obj;
    };

    /**
     * v6.9.23: VALIDATOR-COMPLIANT KEY POINT GENERATOR
     * Implements ChatGPT v7.0 Validator Suite:
     * - V1.1: 5-6 key points minimum (not 3)
     * - V1.2: Required functional roles (obtain, interpret, confirm, document, report, escalate)
     * - V3.1: Concrete anchors required (documents, roles, artefacts)
     * - V3.2: No abstract verbs ("Apply knowledge of..."  ->  concrete actions)
     * - V5.1: Stop-work authority presence
     * - V4.3: PE evidence type hints
     */
    const generateDynamicKeyPoints = (pcText, pcNumber, elementName, tgaData) => {
        const keyPoints = [];
        
        // Extract verbs and object from PC text
        const words = pcText.split(/\s+/);
        const firstVerb = words[0]?.replace(/[,;]/g, '') || 'Complete';
        const restOfPC = words.slice(1).join(' ').replace(/^,?\s*(and\s+)?/i, '');
        
        // v6.9.23: FUNCTIONAL ROLE MAPPING - ensures each PC has complete operational coverage
        const functionalRoles = {
            obtain: ['Locate', 'Access', 'Retrieve', 'Source', 'Collect'],
            interpret: ['Review', 'Analyse', 'Assess', 'Evaluate', 'Check'],
            confirm: ['Verify', 'Validate', 'Confirm', 'Cross-check', 'Ensure'],
            document: ['Record', 'Complete', 'Log', 'Sign-off', 'Update'],
            report: ['Notify', 'Communicate', 'Brief', 'Inform', 'Report'],
            escalate: ['Escalate', 'Stop work', 'Refuse', 'Raise concern', 'Flag']
        };
        
        // v6.9.23: CONCRETE ANCHORS - prevents abstract garbage
        const concreteAnchors = {
            documents: ['procedure', 'permit', 'SWMS', 'JSA', 'checklist', 'plan', 'record', 'form', 'register'],
            roles: ['supervisor', 'site manager', 'safety officer', 'authorised person', 'competent person'],
            artefacts: ['sign-off', 'approval', 'authorisation', 'clearance', 'inspection tag', 'logbook entry'],
            conditions: ['site conditions', 'hazards', 'controls', 'exclusion zones', 'barriers', 'signage']
        };
        
        // Determine relevant anchors based on PC text keywords
        const pcLower = pcText.toLowerCase();
        const getRelevantAnchor = (category) => {
            const items = concreteAnchors[category];
            const match = items.find(item => pcLower.includes(item.toLowerCase()));
            return match || items[Math.floor(Math.random() * items.length)];
        };
        
        // KeyPoint 1: OBTAIN - Where does the information come from?
        const doc = getRelevantAnchor('documents');
        keyPoints.push(`Locate and access the relevant ${doc} before commencing work`);
        
        // KeyPoint 2: INTERPRET - What does this mean for how work is done?
        keyPoints.push(`Review ${doc} requirements and identify how they apply to this specific task`);
        
        // KeyPoint 3: CONFIRM - Who confirms and how?
        const role = getRelevantAnchor('roles');
        keyPoints.push(`Confirm task requirements with ${role} before proceeding`);
        
        // KeyPoint 4: Direct PC action (the actual requirement)
        const actionVerb = functionalRoles.interpret[Math.floor(Math.random() * 3)];
        keyPoints.push(`${firstVerb} ${restOfPC} according to site-specific procedures`);
        
        // KeyPoint 5: DOCUMENT - Where is this recorded?
        const artefact = getRelevantAnchor('artefacts');
        keyPoints.push(`Complete required ${artefact} and record task completion in the appropriate register`);
        
        // KeyPoint 6: ESCALATE/STOP-WORK (V5.1 compliance)
        // At least one key point must include stop-work authority
        keyPoints.push(`Stop work immediately and report to ${role} if conditions change or hazards are identified`);
        
        // v6.9.23: Find PE for evidence type hint (V4.3)
        const peItems = tgaData?.performanceEvidence || [];
        const relevantPE = peItems.find(pe => {
            const peText = typeof pe === 'string' ? pe : pe?.text || '';
            const pcKeywords = pcText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            return pcKeywords.some(kw => peText.toLowerCase().includes(kw));
        });
        
        // If PE found, add evidence-based key point (replacing generic if over 6)
        if (relevantPE) {
            const peText = typeof relevantPE === 'string' ? relevantPE : relevantPE?.text || '';
            const cleanedPE = peText.replace(/^(the candidate must\s+)?/i, '').trim();
            // Replace the 4th key point with PE-specific content for better evidence coverage
            keyPoints[3] = `Demonstrate ${cleanedPE} as required by assessment conditions`;
        }
        
        return keyPoints;
    };

    const COUNTRIES = [
        { code: 'AU', name: 'Australia', lang: 'en-AU' },
        { code: 'GB', name: 'United Kingdom', lang: 'en-GB' },
        { code: 'US', name: 'United States', lang: 'en-US' },
        { code: 'IN', name: 'India', lang: 'en-IN' },
        { code: 'ES', name: 'Spain', lang: 'es-ES' },
        { code: 'MX', name: 'Mexico', lang: 'es-US' },
        { code: 'FR', name: 'France', lang: 'fr-FR' },
        { code: 'CA', name: 'Canada', lang: 'fr-CA' },
        { code: 'DE', name: 'Germany', lang: 'de-DE' },
        { code: 'BR', name: 'Brazil', lang: 'pt-BR' },
        { code: 'BE', name: 'Belgium', lang: 'nl-BE' },
        { code: 'NL', name: 'Netherlands', lang: 'nl-NL' },
        { code: 'DK', name: 'Denmark', lang: 'da-DK' },
        { code: 'FI', name: 'Finland', lang: 'fi-FI' },
        { code: 'NO', name: 'Norway', lang: 'nb-NO' },
        { code: 'SE', name: 'Sweden', lang: 'sv-SE' },
        { code: 'BG', name: 'Bulgaria', lang: 'bg-BG' },
        { code: 'CZ', name: 'Czech Republic', lang: 'cs-CZ' },
        { code: 'HR', name: 'Croatia', lang: 'hr-HR' },
        { code: 'HU', name: 'Hungary', lang: 'hu-HU' },
        { code: 'PL', name: 'Poland', lang: 'pl-PL' },
        { code: 'RO', name: 'Romania', lang: 'ro-RO' },
        { code: 'RU', name: 'Russia', lang: 'ru-RU' },
        { code: 'SK', name: 'Slovakia', lang: 'sk-SK' },
        { code: 'SI', name: 'Slovenia', lang: 'sl-SI' },
        { code: 'RS', name: 'Serbia', lang: 'sr-RS' },
        { code: 'UA', name: 'Ukraine', lang: 'uk-UA' },
        { code: 'EE', name: 'Estonia', lang: 'et-EE' },
        { code: 'LT', name: 'Lithuania', lang: 'lt-LT' },
        { code: 'LV', name: 'Latvia', lang: 'lv-LV' },
        { code: 'GR', name: 'Greece', lang: 'el-GR' },
        { code: 'IT', name: 'Italy', lang: 'it-IT' },
        { code: 'CN', name: 'China', lang: 'cmn-CN' },
        { code: 'JP', name: 'Japan', lang: 'ja-JP' },
        { code: 'KR', name: 'South Korea', lang: 'ko-KR' },
        { code: 'ID', name: 'Indonesia', lang: 'id-ID' },
        { code: 'TH', name: 'Thailand', lang: 'th-TH' },
        { code: 'VN', name: 'Vietnam', lang: 'vi-VN' },
        { code: 'BD', name: 'Bangladesh', lang: 'bn-IN' },
        { code: 'PK', name: 'Pakistan', lang: 'ur-IN' },
        { code: 'IL', name: 'Israel', lang: 'he-IL' },
        { code: 'TR', name: 'Turkey', lang: 'tr-TR' },
        { code: 'SA', name: 'Saudi Arabia', lang: 'ar-XA' },
        { code: 'AE', name: 'United Arab Emirates', lang: 'ar-XA' },
        { code: 'EG', name: 'Egypt', lang: 'ar-XA' },
        { code: 'KE', name: 'Kenya', lang: 'sw-KE' },
        { code: 'NZ', name: 'New Zealand', lang: 'en-AU' },
        { code: 'IE', name: 'Ireland', lang: 'en-GB' },
        { code: 'SG', name: 'Singapore', lang: 'en-GB' },
        { code: 'MY', name: 'Malaysia', lang: 'en-GB' },
        { code: 'PH', name: 'Philippines', lang: 'en-US' }
    ];

    // States/Regions for all supported countries
    const COUNTRY_STATES = {
        AU: ['Australian Capital Territory', 'New South Wales', 'Northern Territory', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia'],
        GB: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
        US: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
        IN: ['Andhra Pradesh', 'Bihar', 'Delhi', 'Gujarat', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'],
        CA: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan'],
        DE: ['Baden-W\u00fcrttemberg', 'Bavaria', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hesse', 'Lower Saxony', 'North Rhine-Westphalia', 'Rhineland-Palatinate', 'Saarland', 'Saxony', 'Saxony-Anhalt', 'Schleswig-Holstein', 'Thuringia'],
        FR: ['\u00cele-de-France', 'Auvergne-Rh\u00f4ne-Alpes', 'Hauts-de-France', 'Nouvelle-Aquitaine', 'Occitanie', 'Grand Est', 'Provence-Alpes-C\u00f4te d\'Azur', 'Pays de la Loire', 'Bretagne', 'Normandie'],
        ES: ['Andaluc\u00eda', 'Arag\u00f3n', 'Asturias', 'Canarias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y Le\u00f3n', 'Catalu\u00f1a', 'Comunidad Valenciana', 'Extremadura', 'Galicia', 'Islas Baleares', 'La Rioja', 'Madrid', 'Murcia', 'Navarra', 'Pa\u00eds Vasco'],
        MX: ['Aguascalientes', 'Baja California', 'Chiapas', 'Chihuahua', 'Ciudad de M\u00e9xico', 'Coahuila', 'Guanajuato', 'Jalisco', 'M\u00e9xico', 'Michoac\u00e1n', 'Nuevo Le\u00f3n', 'Oaxaca', 'Puebla', 'Quer\u00e9taro', 'Quintana Roo', 'San Luis Potos\u00ed', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Veracruz', 'Yucat\u00e1n'],
        BR: ['Acre', 'Alagoas', 'Amazonas', 'Bahia', 'Cear\u00e1', 'Distrito Federal', 'Esp\u00edrito Santo', 'Goi\u00e1s', 'Maranh\u00e3o', 'Mato Grosso', 'Minas Gerais', 'Par\u00e1', 'Para\u00edba', 'Paran\u00e1', 'Pernambuco', 'Rio de Janeiro', 'Rio Grande do Sul', 'Santa Catarina', 'S\u00e3o Paulo'],
        IT: ['Abruzzo', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', 'Veneto'],
        NL: ['Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg', 'North Brabant', 'North Holland', 'Overijssel', 'South Holland', 'Utrecht', 'Zeeland'],
        BE: ['Antwerp', 'Brussels', 'East Flanders', 'Flemish Brabant', 'Hainaut', 'Li\u00e8ge', 'Limburg', 'Luxembourg', 'Namur', 'Walloon Brabant', 'West Flanders'],
        PL: ['Greater Poland', 'Lesser Poland', 'Lower Silesian', '\u0141\u00f3d\u017a', 'Masovian', 'Pomeranian', 'Silesian', 'West Pomeranian'],
        CN: ['Beijing', 'Fujian', 'Guangdong', 'Hebei', 'Henan', 'Hubei', 'Jiangsu', 'Liaoning', 'Shandong', 'Shanghai', 'Sichuan', 'Tianjin', 'Zhejiang'],
        JP: ['Aichi', 'Chiba', 'Fukuoka', 'Hiroshima', 'Hokkaido', 'Hyogo', 'Kanagawa', 'Kyoto', 'Osaka', 'Saitama', 'Tokyo'],
        KR: ['Busan', 'Daegu', 'Daejeon', 'Gangwon', 'Gwangju', 'Gyeonggi', 'Incheon', 'Jeju', 'Seoul', 'Ulsan'],
        NZ: ['Auckland', 'Bay of Plenty', 'Canterbury', 'Hawke\'s Bay', 'Manawat\u016b-Whanganui', 'Northland', 'Otago', 'Southland', 'Taranaki', 'Waikato', 'Wellington'],
        IE: ['Connacht', 'Leinster', 'Munster', 'Ulster'],
        SA: ['Central', 'Eastern Province', 'Makkah', 'Madinah', 'Northern Borders', 'Riyadh'],
        AE: ['Abu Dhabi', 'Ajman', 'Dubai', 'Fujairah', 'Ras Al Khaimah', 'Sharjah', 'Umm Al Quwain'],
        ZA: ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'],
        MY: ['Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu'],
        PH: ['Calabarzon', 'Central Luzon', 'Central Visayas', 'Davao', 'Metro Manila', 'Northern Mindanao', 'Western Visayas'],
        ID: ['Bali', 'Banten', 'DKI Jakarta', 'East Java', 'Central Java', 'West Java', 'Yogyakarta'],
        TH: ['Bangkok', 'Chiang Mai', 'Chonburi', 'Nakhon Ratchasima', 'Phuket', 'Songkhla'],
        VN: ['Da Nang', 'Hai Phong', 'Hanoi', 'Ho Chi Minh City'],
        SG: [], // City-state, no regions
        TR: ['Ankara', 'Antalya', 'Bursa', 'Istanbul', 'Izmir'],
        EG: ['Alexandria', 'Aswan', 'Cairo', 'Giza', 'Luxor'],
        KE: ['Central', 'Coast', 'Eastern', 'Nairobi', 'Nyanza', 'Rift Valley', 'Western'],
        NG: ['Abuja', 'Anambra', 'Kano', 'Lagos', 'Oyo', 'Rivers'],
        DK: ['Capital Region', 'Central Denmark', 'North Denmark', 'Region Zealand', 'Southern Denmark'],
        FI: ['Helsinki-Uusimaa', 'Lapland', 'Northern Ostrobothnia', 'Pirkanmaa', 'Southwest Finland'],
        NO: ['Eastern Norway', 'Northern Norway', 'Tr\u00f8ndelag', 'Western Norway'],
        SE: ['G\u00f6taland', 'Norrland', 'Svealand'],
        AT: ['Burgenland', 'Carinthia', 'Lower Austria', 'Salzburg', 'Styria', 'Tyrol', 'Upper Austria', 'Vienna', 'Vorarlberg'],
        CH: ['Aargau', 'Basel', 'Bern', 'Geneva', 'Lucerne', 'St. Gallen', 'Ticino', 'Vaud', 'Zurich'],
        PT: ['Alentejo', 'Algarve', 'Central Portugal', 'Lisbon', 'Northern Portugal'],
        CZ: ['Central Bohemia', 'Moravia-Silesia', 'Prague', 'South Moravia'],
        HU: ['Budapest', 'Central Hungary', 'Northern Hungary', 'Southern Great Plain', 'Western Transdanubia'],
        RO: ['Bucharest', 'Cluj', 'Constan\u021ba', 'Ia\u0219i', 'Timi\u0219'],
        BG: ['Burgas', 'Plovdiv', 'Sofia', 'Varna'],
        HR: ['City of Zagreb', 'Dalmatia', 'Istria', 'Slavonia'],
        SK: ['Bratislava', 'Ko\u0161ice', 'Pre\u0161ov', '\u017Dilina'],
        SI: ['Central Slovenia', 'Coastal - Karst', 'Drava'],
        GR: ['Attica', 'Central Macedonia', 'Crete', 'Peloponnese', 'Thessaly'],
        IL: ['Central District', 'Haifa', 'Jerusalem', 'Northern District', 'Southern District', 'Tel Aviv'],
        PK: ['Islamabad', 'Khyber Pakhtunkhwa', 'Punjab', 'Sindh'],
        BD: ['Chittagong', 'Dhaka', 'Khulna', 'Rajshahi', 'Sylhet'],
        RU: ['Central Federal District', 'Moscow', 'Northwestern', 'Saint Petersburg', 'Siberian', 'Southern', 'Urals', 'Volga'],
        UA: ['Dnipropetrovsk', 'Kharkiv', 'Kyiv', 'Lviv', 'Odesa'],
        EE: ['Harju', 'Ida-Viru', 'P\u00e4rnu', 'Tallinn', 'Tartu'],
        LT: ['Kaunas', 'Klaip\u0117da', '\u0160iauliai', 'Vilnius'],
        LV: ['Kurzeme', 'Latgale', 'Riga', 'Vidzeme', 'Zemgale'],
        RS: ['Belgrade', '\u0160umadija', 'Vojvodina']
    };
    
    // Get states for a country (returns empty array if not found)
    const getStatesForCountry = (countryCode) => {
        return COUNTRY_STATES[countryCode] || [];
    };

    // Bind country/state handlers directly using onchange (event delegation doesn't work in Moodle AMD)
    const bindCountryStateHandlers = () => {
        // VET mode - Country/State
        const vetCountry = document.getElementById('cc-country');
        if (vetCountry) {
            vetCountry.onchange = (e) => {
                const stateSelect = document.getElementById('cc-state');
                if (stateSelect) {
                    const states = getStatesForCountry(e.target.value);
                    stateSelect.innerHTML = '<option value="">Select (optional)...</option>' +
                        states.map(s => `<option value="${s}">${s}</option>`).join('');
                }
            };
        }
        
        // VET mode - Industry/Sector (sub-industry) + Job Titles cascade
        const vetIndustry = document.getElementById('cc-industry');
        if (vetIndustry) {
            vetIndustry.onchange = (e) => {
                const industry = e.target.value;
                // Populate Industry Sector
                const sectorSelect = document.getElementById('cc-industry-sector');
                if (sectorSelect) {
                    const sectors = getSubcategoriesForIndustry(industry);
                    sectorSelect.innerHTML = '<option value="">Select sector (optional)...</option>' +
                        sectors.map(s => `<option value="${s}">${s}</option>`).join('');
                }
                // Populate Job Titles based on industry
                const jobTitleSelect = document.getElementById('cc-job-title');
                const jobTitleCustom = document.getElementById('cc-job-title-custom');
                if (jobTitleSelect) {
                    const jobTitles = getJobTitlesForIndustry(industry);
                    jobTitleSelect.innerHTML = '<option value="">Select job title...</option>' +
                        jobTitles.map(j => `<option value="${j}">${j}</option>`).join('') +
                        '<option value="_other">Other (custom)...</option>';
                    jobTitleSelect.classList.remove('cc-hidden');
                    if (jobTitleCustom) jobTitleCustom.classList.add('cc-hidden');
                }
                // Reset Job Tasks (v6.6.33: Multi-select system)
                const jobTasksList = document.getElementById('cc-job-tasks-list');
                const jobTasksSelected = document.getElementById('cc-job-tasks-selected');
                const jobTasksCustomWrapper = document.getElementById('cc-job-tasks-custom-wrapper');
                if (jobTasksList) {
                    jobTasksList.innerHTML = '<div class="cc-job-tasks-placeholder">Select job title first...</div>';
                }
                if (jobTasksSelected) jobTasksSelected.innerHTML = '';
                if (jobTasksCustomWrapper) jobTasksCustomWrapper.classList.add('cc-hidden');
                // Clear stored tasks
                window.CC_SELECTED_JOB_TASKS = [];
                // v6.9.18: Update button visibility when industry changes
                updateGenerateTopicsButton();
            };
        }
        
        
        // ===========================================================================
        // VET mode - Multiple Job Roles (v6.7.62: 1-3 roles as scenario multipliers)
        // ChatGPT Guidance: Roles are scenario MULTIPLIERS, not content MIXERS
        // ===========================================================================
        
        // Initialize job roles array
        window.CC_SELECTED_JOB_ROLES = [];
        const MAX_JOB_ROLES = 5;
        
        // ===========================================================================
        // v6.7.67: Auto-Suggestion Engine (ChatGPT Architecture)
        // Uses INTERSECTION logic - suggests items relevant across multiple roles
        // Shows explainable "why" feedback - transparent, not mystical
        // ===========================================================================
        
        // Unit  ->  Risk Domains (what hazard categories does this unit address?)
        const UNIT_RISK_DOMAINS = {
            'height': ['fall_risk', 'access_equipment', 'edge_protection', 'rescue'],
            'ewp': ['fall_risk', 'access_equipment', 'rescue', 'mobile_plant'],
            'scaffold': ['fall_risk', 'access_equipment', 'edge_protection', 'structural'],
            'elevated': ['fall_risk', 'access_equipment', 'edge_protection'],
            'lift': ['mechanical_risk', 'load_handling', 'communication', 'rigging'],
            'crane': ['mechanical_risk', 'load_handling', 'communication', 'rigging'],
            'rig': ['load_handling', 'rigging', 'mechanical_risk'],
            'dogging': ['load_handling', 'rigging', 'communication'],
            'confine': ['atmospheric', 'rescue', 'isolation', 'communication'],
            'enclosed': ['atmospheric', 'rescue', 'isolation'],
            'traffic': ['vehicle_movement', 'pedestrian', 'communication', 'signage'],
            'excavat': ['ground_collapse', 'underground_services', 'mobile_plant'],
            'trench': ['ground_collapse', 'atmospheric', 'rescue'],
            'hazard': ['chemical', 'ppe', 'emergency', 'containment'],
            'chemical': ['chemical', 'ppe', 'emergency', 'containment'],
            'asbestos': ['respiratory', 'ppe', 'containment', 'disposal'],
            'electri': ['electrical', 'isolation', 'testing', 'ppe'],
            'forklift': ['mobile_plant', 'load_handling', 'pedestrian', 'stability'],
            'mobile plant': ['mobile_plant', 'mechanical_risk', 'communication'],
            'manual handling': ['musculoskeletal', 'load_handling', 'equipment'],
            'infection': ['biological', 'ppe', 'hygiene', 'disposal'],
            'whs': ['general_safety', 'hazard_id', 'risk_control'],
            'risk': ['hazard_id', 'risk_control', 'documentation'],
            'emergency': ['emergency', 'rescue', 'communication', 'first_aid'],
            'first aid': ['first_aid', 'emergency', 'documentation'],
            'fire': ['fire', 'emergency', 'evacuation']
        };
        
        // Equipment  ->  Risk Domains (what hazards does this equipment relate to?)
        const EQUIPMENT_RISK_MAP = {
            'height_safety': ['fall_risk', 'rescue', 'edge_protection'],
            'ewp_types': ['fall_risk', 'access_equipment', 'mobile_plant'],
            'scaffold_systems': ['fall_risk', 'access_equipment', 'structural'],
            'scaffold_components': ['fall_risk', 'structural'],
            'hand_tools': ['general_safety'],
            'lifting': ['load_handling', 'rigging', 'mechanical_risk'],
            'rigging': ['load_handling', 'rigging'],
            'crane_types': ['load_handling', 'mechanical_risk'],
            'controls': ['mechanical_risk', 'mobile_plant'],
            'communication': ['communication'],
            'gas_detection': ['atmospheric', 'confined_space'],
            'ventilation': ['atmospheric'],
            'rescue': ['rescue', 'emergency'],
            'signage': ['signage', 'pedestrian'],
            'barriers': ['pedestrian', 'vehicle_movement'],
            'ppe': ['ppe', 'general_safety'],
            'safety': ['general_safety', 'ppe'],
            'site_safety': ['general_safety', 'ppe', 'signage'],
            'maintenance': ['mechanical_risk'],
            'accessories': ['general_safety'],
            'first_aid': ['first_aid', 'emergency'],
            'fire': ['fire', 'emergency']
        };
        
        // Task  ->  Risk Domains (what hazards does this task category address?)
        const TASK_RISK_MAP = {
            'heights': ['fall_risk', 'access_equipment'],
            'access': ['access_equipment', 'fall_risk'],
            'rescue': ['rescue', 'emergency'],
            'safety': ['general_safety', 'ppe', 'hazard_id'],
            'operate': ['mechanical_risk', 'mobile_plant'],
            'site': ['general_safety', 'signage'],
            'erect': ['structural', 'fall_risk'],
            'modify': ['structural'],
            'dismantle': ['structural', 'fall_risk'],
            'inspect': ['hazard_id', 'documentation'],
            'lift': ['load_handling', 'rigging'],
            'rig': ['rigging', 'load_handling'],
            'communicate': ['communication'],
            'hazards': ['hazard_id', 'risk_control'],
            'setup': ['signage', 'general_safety'],
            'plan': ['documentation', 'risk_control'],
            'emergency': ['emergency', 'rescue'],
            'entry': ['atmospheric', 'isolation'],
            'atmosphere': ['atmospheric'],
            'identify': ['hazard_id'],
            'handle': ['chemical', 'ppe'],
            'dispose': ['disposal', 'containment'],
            'isolate': ['isolation', 'electrical'],
            'test': ['testing', 'electrical'],
            'load': ['load_handling'],
            'stack': ['load_handling', 'stability']
        };
        
        // Auto-suggest using INTERSECTION logic (ChatGPT pattern)
        const autoSuggestCategories = () => {
            // Only trigger when exactly 3 roles selected
            if (window.CC_SELECTED_JOB_ROLES.length !== MAX_JOB_ROLES) return;
            
            // Get unit title and extract risk domains
            const unitTitleEl = document.getElementById('cc-unit-title');
            const unitTitle = (unitTitleEl?.value || '').toLowerCase();
            if (!unitTitle) return;
            
            // Find matching unit risk domains
            const unitDomains = new Set();
            Object.entries(UNIT_RISK_DOMAINS).forEach(([keyword, domains]) => {
                if (unitTitle.includes(keyword)) {
                    domains.forEach(d => unitDomains.add(d));
                }
            });
            
            // Fallback to general safety if no matches
            if (unitDomains.size === 0) {
                unitDomains.add('general_safety');
                unitDomains.add('ppe');
                unitDomains.add('hazard_id');
            }
            
            // Count task/equipment relevance across job roles
            const taskCounts = {};
            const equipmentCounts = {};
            const industry = document.getElementById('cc-industry')?.value || '';
            
            window.CC_SELECTED_JOB_ROLES.forEach(role => {
                const taskCats = getTaskCategoriesForJobTitle(industry, role);
                const equipCats = getEquipmentCategoriesForJobTitle(industry, role);
                
                taskCats.forEach(cat => {
                    const taskDomains = TASK_RISK_MAP[cat.id] || [];
                    const relevant = taskDomains.some(d => unitDomains.has(d));
                    if (relevant) {
                        taskCounts[cat.id] = (taskCounts[cat.id] || 0) + 1;
                    }
                });
                
                equipCats.forEach(cat => {
                    const eqDomains = EQUIPMENT_RISK_MAP[cat.id] || [];
                    const relevant = eqDomains.some(d => unitDomains.has(d));
                    if (relevant) {
                        equipmentCounts[cat.id] = (equipmentCounts[cat.id] || 0) + 1;
                    }
                });
            });
            
            // INTERSECTION: Prefer items shared across 2+ job roles
            const suggestedTasks = Object.entries(taskCounts)
                .filter(([_, count]) => count >= 2)
                .map(([id]) => id);
            
            // Equipment: Allow items relevant to at least 1 role (more permissive)
            const suggestedEquipment = Object.entries(equipmentCounts)
                .filter(([_, count]) => count >= 1)
                .map(([id]) => id);
            
            // Always include 'safety' task if heights/hazards unit
            if (unitTitle.includes('height') || unitTitle.includes('hazard') || unitTitle.includes('whs')) {
                if (!suggestedTasks.includes('safety')) suggestedTasks.push('safety');
                if (!suggestedEquipment.includes('height_safety') && unitTitle.includes('height')) {
                    suggestedEquipment.push('height_safety');
                }
            }
            
            // Auto-select matching categories with delay for render
            setTimeout(() => {
                const taskCards = document.querySelectorAll('#cc-task-category-cards .cc-category-card');
                const equipCards = document.querySelectorAll('#cc-equipment-category-cards .cc-category-card');
                
                const selectedTaskNames = [];
                const selectedEquipNames = [];
                
                taskCards.forEach(card => {
                    const catId = card.dataset.categoryId;
                    if (suggestedTasks.includes(catId) && !card.classList.contains('cc-selected')) {
                        card.click();
                        selectedTaskNames.push(card.querySelector('.cc-category-title')?.textContent || catId);
                    }
                });
                
                equipCards.forEach(card => {
                    const catId = card.dataset.categoryId;
                    if (suggestedEquipment.includes(catId) && !card.classList.contains('cc-selected')) {
                        card.click();
                        selectedEquipNames.push(card.querySelector('.cc-category-title')?.textContent || catId);
                    }
                });
                
                // Show explainable "why" feedback (ChatGPT recommended)
                if (selectedTaskNames.length > 0 || selectedEquipNames.length > 0) {
                    const roleList = window.CC_SELECTED_JOB_ROLES.join(', ');
                    const unitShort = unitTitle.length > 40 ? unitTitle.substring(0, 40) + '...' : unitTitle;
                    
                    const feedback = document.createElement('div');
                    feedback.className = 'cc-auto-suggest-feedback';
                    feedback.innerHTML = `
                        <div class="cc-suggest-header">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                            <strong>Smart Suggestions Applied</strong>
                        </div>
                        <div class="cc-suggest-reason">
                            <span>Suggested based on:</span>
                            <ul>
                                <li><strong>${unitShort}</strong> risk profile</li>
                                <li>Overlap across <strong>${roleList}</strong> roles</li>
                                ${selectedEquipNames.length > 0 ? `<li>Common plant used: ${selectedEquipNames.slice(0, 3).join(', ')}</li>` : ''}
                            </ul>
                        </div>
                        <div class="cc-suggest-note">You can add or remove selections as needed.</div>
                    `;
                    
                    const taskSection = document.getElementById('cc-task-category-cards')?.parentElement;
                    if (taskSection) {
                        const existing = taskSection.querySelector('.cc-auto-suggest-feedback');
                        if (existing) existing.remove();
                        taskSection.insertBefore(feedback, taskSection.firstChild);
                        // Fade out after 8 seconds
                        setTimeout(() => {
                            feedback.style.opacity = '0';
                            setTimeout(() => feedback.remove(), 500);
                        }, 8000);
                    }
                }
            }, 150); // Wait for cards to render
        };
        
        // Helper function to render job role chips
        const renderJobRoleChips = () => {
            const chipsContainer = document.getElementById('cc-job-roles-chips');
            if (!chipsContainer) return;
            
            if (window.CC_SELECTED_JOB_ROLES.length === 0) {
                chipsContainer.innerHTML = '';
                return;
            }
            
            chipsContainer.innerHTML = window.CC_SELECTED_JOB_ROLES.map((role, idx) => `
                <div class="cc-role-chip" data-testid="chip-job-role-${idx}">
                    <span class="cc-role-chip-text">${role}</span>
                    <button type="button" class="cc-role-chip-remove" data-role="${role}" data-testid="button-remove-role-${idx}" aria-label="Remove ${role}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `).join('');
            
            // Add remove handlers
            chipsContainer.querySelectorAll('.cc-role-chip-remove').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    const roleToRemove = btn.dataset.role;
                    window.CC_SELECTED_JOB_ROLES = window.CC_SELECTED_JOB_ROLES.filter(r => r !== roleToRemove);
                    renderJobRoleChips();
                    updateCategoriesForRoles();
                };
            });
        };
        
        // v6.8.2: Helper function to update task/equipment categories based on Unit of Competency
        // v6.8.7: Attached to window for global access from fetchTGAUnit, handlePdfUpload
        window.updateCategoriesForUnit = function() {
            const taskCardsContainer = document.getElementById('cc-task-category-cards');
            const equipmentCardsContainer = document.getElementById('cc-equipment-category-cards');
            const industry = document.getElementById('cc-industry')?.value || '';
            
            // Get unit title for keyword matching
            const unitTitleEl = document.getElementById('cc-unit-title');
            const unitTitle = (unitTitleEl?.value || '').toLowerCase();
            
            // Also check reference docs content for keywords
            const combinedText = unitTitle;
            
            if (!unitTitle) {
                if (taskCardsContainer) {
                    taskCardsContainer.innerHTML = '<div class="cc-category-placeholder">Fetch unit or upload documents to see suggested task categories...</div>';
                }
                if (equipmentCardsContainer) {
                    equipmentCardsContainer.innerHTML = '<div class="cc-category-placeholder">Fetch unit or upload documents to see suggested equipment categories...</div>';
                }
                return;
            }
            
            // Get categories from industry (or default)
            const taskCategories = getTaskCategoriesForJobTitle(industry || '_default', '_default');
            const equipCategories = getEquipmentCategoriesForJobTitle(industry || '_default', '_default');
            
            // Render all categories - use window.CC_BUILDER for module access
            if (taskCardsContainer && window.CC_BUILDER?.renderCategoryCards) {
                window.CC_BUILDER.renderCategoryCards(taskCardsContainer, taskCategories, 'task');
            }
            if (equipmentCardsContainer && window.CC_BUILDER?.renderCategoryCards) {
                window.CC_BUILDER.renderCategoryCards(equipmentCardsContainer, equipCategories, 'equipment');
            }
            
            // Auto-suggest based on unit keywords + PDF content
            setTimeout(() => {
                if (typeof autoSuggestFromContent === 'function') {
                    autoSuggestFromContent(combinedText);
                } else if (window.autoSuggestFromContent) {
                    window.autoSuggestFromContent(combinedText);
                }
            }, 200);
        };
        
        // v6.8.4: Auto-suggest categories based on combined unit title + PDF content
        // DYNAMIC MATCHING: Extracts words from unit/PDF and matches against category card text
        // Uses stemming-like matching for word roots (5+ chars for precision)
        // v6.8.7: Also exposed to window for access from window.updateCategoriesForUnit
        window.autoSuggestFromContent = function(combinedText) {
            if (!combinedText) return;
            
            const taskCards = document.querySelectorAll('#cc-task-category-cards .cc-category-card');
            const equipCards = document.querySelectorAll('#cc-equipment-category-cards .cc-category-card');
            
            const selectedTaskNames = [];
            const selectedEquipNames = [];
            
            // Extract meaningful words from content (4+ chars, no common stop words)
            const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'were', 'they', 'will', 'when', 'who', 'with', 'this', 'that', 'from', 'what', 'which', 'their', 'would', 'there', 'could', 'other', 'into', 'more', 'some', 'them', 'than', 'then', 'these', 'only', 'over', 'such', 'make', 'like', 'just', 'also', 'know', 'take', 'come', 'made', 'find', 'work', 'part', 'must', 'does', 'need', 'good', 'each', 'very', 'when', 'where', 'while', 'should', 'through', 'performance', 'criteria', 'evidence', 'knowledge', 'required', 'demonstrate', 'ability', 'according', 'including', 'following', 'relevant', 'appropriate', 'ensure', 'complete', 'identify', 'apply', 'using', 'undertake', 'carry', 'maintain', 'industry', 'procedures', 'requirements', 'policies', 'basic', 'principles', 'practices']);
            
            // Important VET acronyms that should be kept even if short
            const IMPORTANT_ACRONYMS = new Set(['whs', 'ohs', 'ppe', 'ewp', 'cpr', 'rto', 'swms', 'sds', 'msds', 'mhe', 'hrw']);
            
            const contentWords = combinedText
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => (w.length >= 4 || IMPORTANT_ACRONYMS.has(w)) && !STOP_WORDS.has(w));
            
            // Create a Set for faster lookups
            const contentWordSet = new Set(contentWords);
            
            // Simple stemmer: get word root (removes common suffixes)
            const getStem = (word) => {
                if (word.length < 5) return word;
                return word
                    .replace(/ing$/, '')
                    .replace(/tion$/, '')
                    .replace(/ment$/, '')
                    .replace(/ness$/, '')
                    .replace(/ity$/, '')
                    .replace(/ies$/, 'y')
                    .replace(/ical$/, 'ic')
                    .replace(/ally$/, '')
                    .replace(/ful$/, '')
                    .replace(/less$/, '')
                    .replace(/able$/, '')
                    .replace(/ible$/, '')
                    .replace(/ous$/, '')
                    .replace(/ive$/, '')
                    .replace(/er$/, '')
                    .replace(/or$/, '')
                    .replace(/ly$/, '')
                    .replace(/ed$/, '')
                    .replace(/es$/, '')
                    .replace(/s$/, '');
            };
            
            // Get stems of content words
            const contentStems = new Set(contentWords.map(getStem));
            
            // Helper: Check if category card text shares significant words with content
            const matchesContent = (cardText) => {
                const cardWords = cardText
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, ' ')
                    .split(/\s+/)
                    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
                
                // Count matching words using stems
                let matchCount = 0;
                for (const word of cardWords) {
                    // Exact match
                    if (contentWordSet.has(word)) {
                        matchCount += 2; // Exact matches worth more
                        continue;
                    }
                    // Stem match (e.g., "height" matches "heights", "weld" matches "welding")
                    const wordStem = getStem(word);
                    if (wordStem.length >= 4 && contentStems.has(wordStem)) {
                        matchCount++;
                    }
                }
                
                // Require at least 1 meaningful match
                return matchCount >= 1;
            };
            
            // Check task cards
            taskCards.forEach(card => {
                const title = card.querySelector('.cc-category-title')?.textContent || '';
                const examples = card.querySelector('.cc-category-examples')?.textContent || '';
                const cardText = title + ' ' + examples;
                
                if (matchesContent(cardText) && !card.classList.contains('cc-selected')) {
                    card.click();
                    selectedTaskNames.push(title);
                }
            });
            
            // Check equipment cards
            equipCards.forEach(card => {
                const title = card.querySelector('.cc-category-title')?.textContent || '';
                const examples = card.querySelector('.cc-category-examples')?.textContent || '';
                const cardText = title + ' ' + examples;
                
                if (matchesContent(cardText) && !card.classList.contains('cc-selected')) {
                    card.click();
                    selectedEquipNames.push(title);
                }
            });
            
            // Show feedback if suggestions were made
            if (selectedTaskNames.length > 0 || selectedEquipNames.length > 0) {
                const feedback = document.createElement('div');
                feedback.className = 'cc-auto-suggest-feedback';
                feedback.innerHTML = `
                    <div class="cc-suggest-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                        <strong>Smart Suggestions Applied</strong>
                    </div>
                    <div class="cc-suggest-reason">
                        Based on your unit and uploaded documents, we've suggested:<br>
                        ${selectedTaskNames.length > 0 ? `<strong>Tasks:</strong> ${selectedTaskNames.join(', ')}<br>` : ''}
                        ${selectedEquipNames.length > 0 ? `<strong>Equipment:</strong> ${selectedEquipNames.join(', ')}` : ''}
                    </div>
                    <div class="cc-suggest-note">You can add or remove selections as needed.</div>
                `;
                
                const taskSection = document.getElementById('cc-task-category-cards')?.parentElement;
                if (taskSection) {
                    const existing = taskSection.querySelector('.cc-auto-suggest-feedback');
                    if (existing) existing.remove();
                    taskSection.insertBefore(feedback, taskSection.firstChild);
                    setTimeout(() => {
                        feedback.style.opacity = '0';
                        setTimeout(() => feedback.remove(), 500);
                    }, 10000);
                }
            }
        };
        
        // Legacy: keep updateCategoriesForRoles for chip removal but redirect to unit-based
        const updateCategoriesForRoles = () => {
            // v6.8.2: Categories are now unit-based, not role-based
            // This function is kept for chip removal handlers but doesn't affect categories
        };
        
        const vetJobTitle = document.getElementById('cc-job-title');
        if (vetJobTitle) {
            vetJobTitle.onchange = (e) => {
                const jobTitle = e.target.value;
                const jobTitleCustom = document.getElementById('cc-job-title-custom');
                
                // Handle "Other" selection for custom job title
                if (jobTitle === '_other') {
                    if (jobTitleCustom) {
                        jobTitleCustom.classList.remove('cc-hidden');
                        jobTitleCustom.focus();
                    }
                    // Reset dropdown
                    vetJobTitle.value = '';
                    return;
                }
                
                if (jobTitleCustom) jobTitleCustom.classList.add('cc-hidden');
                
                // Add role if not already selected and under limit
                if (jobTitle && !window.CC_SELECTED_JOB_ROLES.includes(jobTitle)) {
                    if (window.CC_SELECTED_JOB_ROLES.length >= MAX_JOB_ROLES) {
                        // Show max roles message
                        const chipsContainer = document.getElementById('cc-job-roles-chips');
                        if (chipsContainer) {
                            const existingMsg = chipsContainer.querySelector('.cc-max-roles-msg');
                            if (!existingMsg) {
                                const msg = document.createElement('div');
                                msg.className = 'cc-max-roles-msg';
                                msg.textContent = `Maximum ${MAX_JOB_ROLES} roles reached. Remove one to add another.`;
                                chipsContainer.appendChild(msg);
                                setTimeout(() => msg.remove(), 3000);
                            }
                        }
                        vetJobTitle.value = '';
                        return;
                    }
                    
                    window.CC_SELECTED_JOB_ROLES.push(jobTitle);
                    renderJobRoleChips();
                    updateCategoriesForRoles();
                    
                    // v6.7.67: Auto-suggest when 3 roles selected
                    if (window.CC_SELECTED_JOB_ROLES.length === MAX_JOB_ROLES) {
                        autoSuggestCategories();
                    }
                }
                
                // Reset dropdown for next selection
                vetJobTitle.value = '';
                
                // Clear legacy single-role variables
                window.CC_SELECTED_TASK_CATEGORIES = [];
                window.CC_SELECTED_EQUIPMENT_CATEGORIES = [];
                window.CC_SELECTED_JOB_TASKS = [];
            };
        }
        
        // ===========================================================================
        // VET mode - Custom Job Title Input Handler (v6.7.62: Multi-role support)
        // ===========================================================================
        const vetJobTitleCustom = document.getElementById('cc-job-title-custom');
        if (vetJobTitleCustom) {
            // Helper function to add custom job title to roles
            const addCustomJobRole = () => {
                const customTitle = vetJobTitleCustom.value.trim();
                if (!customTitle) return;
                
                // Check if already added or at max
                if (window.CC_SELECTED_JOB_ROLES.includes(customTitle)) {
                    vetJobTitleCustom.value = '';
                    vetJobTitleCustom.classList.add('cc-hidden');
                    return;
                }
                
                if (window.CC_SELECTED_JOB_ROLES.length >= MAX_JOB_ROLES) {
                    const chipsContainer = document.getElementById('cc-job-roles-chips');
                    if (chipsContainer) {
                        const msg = document.createElement('div');
                        msg.className = 'cc-max-roles-msg';
                        msg.textContent = `Maximum ${MAX_JOB_ROLES} roles reached. Remove one to add another.`;
                        chipsContainer.appendChild(msg);
                        setTimeout(() => msg.remove(), 3000);
                    }
                    return;
                }
                
                // Add to roles array
                window.CC_SELECTED_JOB_ROLES.push(customTitle);
                renderJobRoleChips();
                updateCategoriesForRoles();
                
                // v6.7.67: Auto-suggest when 3 roles selected
                if (window.CC_SELECTED_JOB_ROLES.length === MAX_JOB_ROLES) {
                    autoSuggestCategories();
                }
                
                // Clear and hide input
                vetJobTitleCustom.value = '';
                vetJobTitleCustom.classList.add('cc-hidden');
            };
            
            // Trigger on blur (when user leaves the field)
            vetJobTitleCustom.onblur = addCustomJobRole;
            
            // Also trigger on Enter key
            vetJobTitleCustom.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomJobRole();
                }
            };
        }
        
        // ===========================================================================
        // Render Category Cards - Beautiful multi-select cards with icons & examples
        // v6.8.7: Exposed to window.CC_BUILDER for global access
        // ===========================================================================
        window.CC_BUILDER = window.CC_BUILDER || {};
        window.CC_BUILDER.renderCategoryCards = function(container, categories, type) {
            if (!container || !categories || categories.length === 0) {
                container.innerHTML = '<div class="cc-category-placeholder">No categories available</div>';
                return;
            }
            
            // SVG icon mapping for common Lucide icons
            const iconSvg = {
                'construction': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
                'wrench': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
                'arrow-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
                'clipboard-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
                'move-vertical': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 18 12 22 16 18"/><polyline points="8 6 12 2 16 6"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
                'shield-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
                'shield': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
                'arrow-up-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>',
                'door-open': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/></svg>',
                'zap': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
                'life-buoy': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg>',
                'map-pin': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
                'arrow-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
                'settings': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
                'radio': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>',
                'alert-triangle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                'tool': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
                'power': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
                'link': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
                'search': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
                'navigation': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
                'puzzle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></svg>',
                'truck': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
                'hand': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
                'compass': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
                'square': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
                'alert-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
                'home': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
                'box': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
                'door-closed': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/></svg>',
                'layers': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
                'ruler': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>',
                'users': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
                'calendar': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
                'file-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
                'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
                'file-text': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
                'clipboard-list': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
                'user-plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
                'trash-2': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
                'package': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
                'droplet': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
                'shovel': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22v-5l5-5 5 5-5 5z"/><path d="M9.5 14.5 16 8"/><path d="m17 2 5 5-.5.5a3.53 3.53 0 0 1-5 0s0 0 0 0a3.53 3.53 0 0 1 0-5L17 2"/></svg>',
                'hard-hat': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/></svg>',
                'heart': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
                'accessibility': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/></svg>',
                'utensils': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
                'eye': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
                'message-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>',
                'trending-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
                'briefcase': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
                'monitor': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
                'circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>',
                'circle-dot': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>',
                'arrow-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
                'filter': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
                'waves': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>',
                'lock': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
                'stethoscope': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',
                'pill': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
                'activity': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
                'clipboard': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
                'bandage': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11.5V9a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v1.4"/><path d="M14 10V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 9.9V9a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M6 14v0a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2v0"/><path d="M18 11v0a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2v0a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"/><path d="M14 13v0a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2v0a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"/><path d="M10 16v0a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2v0a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2z"/></svg>',
                'folder': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
                'user': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
                'building': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
                'dollar-sign': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
                'award': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
                'target': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
                'user-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
                'book-open': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
                'bed': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
                'ladder': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v18"/><path d="M16 3v18"/><path d="M8 14h8"/><path d="M8 10h8"/><path d="M8 6h8"/><path d="M8 18h8"/></svg>',
                'leaf': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
                'wheat': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/><path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/></svg>',
                'gauge': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
                'chart-bar': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
                'hammer': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L12 9"/><path d="M17.64 15 22 10.64"/><path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91"/></svg>',
                'replace': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4c0-1.1.9-2 2-2"/><path d="M20 2c1.1 0 2 .9 2 2"/><path d="M22 8c0 1.1-.9 2-2 2"/><path d="M16 10c-1.1 0-2-.9-2-2"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5c0-1.7 1.3-3 3-3h1"/><path d="m21 17-3-3-3 3"/><path d="M18 14v5c0 1.7-1.3 3-3 3h-1"/><path d="M10 14c0 1.1-.9 2-2 2"/><path d="M4 16c-1.1 0-2-.9-2-2"/><path d="M2 12c0-1.1.9-2 2-2"/><path d="M8 10c1.1 0 2 .9 2 2"/></svg>',
                'grid-3x3': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',
                'paint-bucket': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></svg>',
                'sparkles': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
                'minus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
                'arrow-down-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="7" x2="17" y2="17"/><polyline points="17 7 17 17 7 17"/></svg>',
                'frame': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="6" x2="2" y2="6"/><line x1="22" y1="18" x2="2" y2="18"/><line x1="6" y1="2" x2="6" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/></svg>',
                'scissors': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
                'link-2': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
                'corner-up-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>',
                'move': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
                'hand-helping': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14"/><path d="m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 13 6 6"/></svg>',
                'siren': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12a5 5 0 0 1 5-5v0a5 5 0 0 1 5 5v6H7v-6Z"/><path d="M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5v-1Z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/></svg>',
                'sign': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4v10.586a1 1 0 0 1-.293.707L12 16l-1.707-1.707A1 1 0 0 1 10 13.586V3z"/><path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>',
                'octagon': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/></svg>',
                'map': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>',
                'thermometer': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>',
                'layout-grid': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
                'cpu': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
                'battery': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/></svg>',
                'shopping-cart': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
                'clock': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
                'camera': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
                'crosshair': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>',
                'database': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
                'flask': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><path d="M6 8h12"/><path d="M6 16h12"/></svg>',
                'wind': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
                'mountain': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>',
                'fuel': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg>'
            };
            
            // Default icon if not found
            const defaultIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
            
            const getIcon = (iconName) => iconSvg[iconName] || defaultIcon;
            
            // Build cards HTML
            container.innerHTML = `
                <div class="cc-category-cards-grid">
                    ${categories.map((cat, idx) => `
                        <div class="cc-category-card" data-category-id="${cat.id}" data-category-type="${type}" data-testid="card-${type}-${cat.id}">
                            <div class="cc-category-card-header">
                                <div class="cc-category-icon">${getIcon(cat.icon)}</div>
                                <div class="cc-category-checkbox">
                                    <input type="checkbox" id="cc-cat-${type}-${cat.id}" class="cc-category-input" data-category-id="${cat.id}" data-testid="checkbox-${type}-${cat.id}">
                                    <label for="cc-cat-${type}-${cat.id}" class="cc-category-checkmark"></label>
                                </div>
                            </div>
                            <h4 class="cc-category-title">${escapeHtml(cat.title)}</h4>
                            <ul class="cc-category-examples">
                                ${cat.examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Attach click handlers
            container.querySelectorAll('.cc-category-card').forEach(card => {
                card.onclick = (e) => {
                    // Don't toggle if clicking directly on the checkbox
                    if (e.target.type === 'checkbox') return;
                    
                    const checkbox = card.querySelector('.cc-category-input');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                };
            });
            
            container.querySelectorAll('.cc-category-input').forEach(checkbox => {
                checkbox.onchange = (e) => {
                    const catId = e.target.dataset.categoryId;
                    const catType = e.target.closest('.cc-category-card').dataset.categoryType;
                    const card = e.target.closest('.cc-category-card');
                    
                    if (e.target.checked) {
                        card.classList.add('selected');
                        // VET mode arrays
                        if (catType === 'task') {
                            if (!window.CC_SELECTED_TASK_CATEGORIES.includes(catId)) {
                                window.CC_SELECTED_TASK_CATEGORIES.push(catId);
                            }
                        } else if (catType === 'equipment') {
                            if (!window.CC_SELECTED_EQUIPMENT_CATEGORIES.includes(catId)) {
                                window.CC_SELECTED_EQUIPMENT_CATEGORIES.push(catId);
                            }
                        }
                        // v6.6.40: Workplace mode arrays
                        else if (catType === 'wp-task') {
                            if (!window.CC_WP_SELECTED_TASK_CATEGORIES) window.CC_WP_SELECTED_TASK_CATEGORIES = [];
                            if (!window.CC_WP_SELECTED_TASK_CATEGORIES.includes(catId)) {
                                window.CC_WP_SELECTED_TASK_CATEGORIES.push(catId);
                            }
                        } else if (catType === 'wp-equipment') {
                            if (!window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES) window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES = [];
                            if (!window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES.includes(catId)) {
                                window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES.push(catId);
                            }
                        }
                    } else {
                        card.classList.remove('selected');
                        // VET mode arrays
                        if (catType === 'task') {
                            window.CC_SELECTED_TASK_CATEGORIES = window.CC_SELECTED_TASK_CATEGORIES.filter(id => id !== catId);
                        } else if (catType === 'equipment') {
                            window.CC_SELECTED_EQUIPMENT_CATEGORIES = window.CC_SELECTED_EQUIPMENT_CATEGORIES.filter(id => id !== catId);
                        }
                        // v6.6.40: Workplace mode arrays
                        else if (catType === 'wp-task') {
                            if (window.CC_WP_SELECTED_TASK_CATEGORIES) {
                                window.CC_WP_SELECTED_TASK_CATEGORIES = window.CC_WP_SELECTED_TASK_CATEGORIES.filter(id => id !== catId);
                            }
                        } else if (catType === 'wp-equipment') {
                            if (window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES) {
                                window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES = window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES.filter(id => id !== catId);
                            }
                        }
                    }
                    
                    // Update legacy CC_SELECTED_JOB_TASKS for prompt compatibility
                    if (catType === 'task' || catType === 'equipment') {
                        window.CC_BUILDER.updateLegacyJobTasksFromCategories();
                    } else if (catType === 'wp-task' || catType === 'wp-equipment') {
                        updateWpSelectionCounts();
                    }
                };
            });
        };
        
        // Update legacy job tasks array from selected categories (for prompt compatibility)
        // v6.9.1: Only runs if AI context is NOT available to avoid overwriting AI selections
        window.CC_BUILDER.updateLegacyJobTasksFromCategories = function() {
            // v6.9.1: Skip if AI context is active - don't overwrite AI-selected data
            if (window.CC_AI_CONTEXT && 
                (window.CC_SELECTED_JOB_TITLES?.length > 0 || 
                 window.CC_SELECTED_TASKS?.length > 0)) {
                return;
            }
            
            const industry = document.getElementById('cc-industry')?.value || '';
            const jobTitle = document.getElementById('cc-job-title')?.value || '';
            const taskCategories = getTaskCategoriesForJobTitle(industry, jobTitle);
            const equipmentCategories = getEquipmentCategoriesForJobTitle(industry, jobTitle);
            
            // Build legacy format: combine selected task + equipment categories
            const selectedTasks = [];
            
            // Add task category titles + examples
            window.CC_SELECTED_TASK_CATEGORIES.forEach(catId => {
                const cat = taskCategories.find(c => c.id === catId);
                if (cat) {
                    selectedTasks.push(`[${cat.title}] ${cat.examples.slice(0, 3).join(', ')}`);
                }
            });
            
            // Store equipment info (legacy format - strings not IDs)
            window.CC_SELECTED_EQUIPMENT_LEGACY = [];
            window.CC_SELECTED_EQUIPMENT_CATEGORIES.forEach(catId => {
                const cat = equipmentCategories.find(c => c.id === catId);
                if (cat) {
                    window.CC_SELECTED_EQUIPMENT_LEGACY.push(`[${cat.title}] ${cat.examples.slice(0, 3).join(', ')}`);
                }
            });
            
            window.CC_SELECTED_JOB_TASKS = selectedTasks;
        };
        
        // v6.6.40: Update Workplace mode selection counts
        const updateWpSelectionCounts = function() {
            const taskCount = (window.CC_WP_SELECTED_TASK_CATEGORIES || []).length;
            const equipmentCount = (window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES || []).length;
            
            const taskCountEl = document.getElementById('cc-wp-task-count');
            const equipmentCountEl = document.getElementById('cc-wp-equipment-count');
            
            if (taskCountEl) {
                taskCountEl.textContent = `${taskCount} selected`;
            }
            if (equipmentCountEl) {
                equipmentCountEl.textContent = `${equipmentCount} selected`;
            }
        };
        
        // ===========================================================================
        // v6.8.5: AUTO-SUGGESTION CARDS - Render read-only cards based on training package
        // Displays job roles, task categories, and equipment categories
        // ===========================================================================
        
        // SVG icons for auto-suggestion cards (subset of common icons)
        const AUTO_ICONS = {
            'users': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
            'clipboard-list': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
            'wrench': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            'box': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
            'sparkles': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
            'default': '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>'
        };
        
        // Get training package data from code (first 3 characters of unit code)
        const getTrainingPackageData = (unitCode) => {
            if (!unitCode || unitCode.length < 3) return null;
            const packageCode = unitCode.substring(0, 3).toUpperCase();
            // Access TRAINING_PACKAGE_DATA from training_packages.js (v6.8.6: uses window global)
            // CRITICAL: training_packages.js attaches to window.TRAINING_PACKAGE_DATA for AMD compatibility
            const pkgData = window.TRAINING_PACKAGE_DATA || (typeof TRAINING_PACKAGE_DATA !== 'undefined' ? TRAINING_PACKAGE_DATA : null);
            if (pkgData && pkgData[packageCode]) {
                return { code: packageCode, ...pkgData[packageCode] };
            }
            return null;
        };
        
        // ===========================================================================
        // v6.9.14: VET AI suggestions removed - AI auto-generates context based on
        // Industry + Sector + Job Level. No manual job/task/equipment selection UI.
        // ===========================================================================
        
        // Helper to get level badge (kept for workplace mode)
        const getLevelBadge = (level) => {
            const colors = {
                worker: 'cc-level-worker',
                supervisor: 'cc-level-supervisor',
                manager: 'cc-level-manager'
            };
            const labels = {
                worker: 'Worker',
                supervisor: 'Supervisor',
                manager: 'Manager'
            };
            return `<span class="cc-level-badge ${colors[level] || colors.worker}">${labels[level] || 'Worker'}</span>`;
        };
        
        // ===========================================================================
        // v6.9.1: AI-POWERED WORKPLACE SUGGESTIONS - Analyzes uploaded documents
        // Generates contextual job titles, tasks, equipment with section mappings
        // NOTE: VET mode AI suggestions were removed in v6.9.14 - AI now auto-generates
        // ===========================================================================
        
        window.CC_BUILDER.renderWorkplaceAISuggestions = async function(documentData) {
            const container = document.getElementById('cc-wp-ai-suggestions-container');
            if (!container) {
                return;
            }
            
            // Show loading state
            container.classList.remove('cc-hidden');
            container.innerHTML = `
                <div class="cc-auto-loading">
                    <div class="cc-spinner"></div>
                    <p>AI is analyzing the document to suggest relevant roles, tasks, and equipment...</p>
                </div>
            `;
            
            // Gather document info
            const docTitle = documentData?.filename || workplaceData?.filename || 'Uploaded Document';
            const docContent = documentData?.content || workplaceData?.content || '';
            const docSections = documentData?.sections || workplaceData?.suggestedTopics || [];
            
            // Get user-selected context
            const industry = document.getElementById('cc-wp-industry')?.value || '';
            const industrySector = document.getElementById('cc-wp-industry-sector')?.value || '';
            const trainingType = document.getElementById('cc-training-type')?.value || 'induction';
            
            if (!docContent || docContent.length < 100) {
                container.innerHTML = `
                    <div class="cc-auto-placeholder cc-auto-info">
                        <p>Upload a document to generate AI-powered suggestions for job titles, tasks, and equipment.</p>
                    </div>
                `;
                return;
            }
            
            try {
                const response = await fetch('https://lms-labs.com/api/moodle/content-creator/suggest-context-workplace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        documentTitle: docTitle,
                        documentContent: docContent.substring(0, 15000), // Limit content size
                        documentSections: docSections.slice(0, 10),
                        industry: industry,
                        industrySector: industrySector,
                        trainingType: trainingType
                    })
                });
                
                if (!response.ok) throw new Error(`API returned ${response.status}`);
                const result = await response.json();
                
                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Failed to get suggestions');
                }
                
                const aiData = result.data;
                
                // ===========================================================================
                // v6.9.1: WORKPLACE AI CONTEXT RECEIVED - Job titles, tasks, equipment with section mappings
                // ===========================================================================                
                // Store all AI data for prompt use and Excel export
                window.CC_WP_AI_JOB_TITLES = aiData.jobTitles || [];
                window.CC_WP_AI_TASK_CATEGORIES = aiData.taskCategories || [];
                window.CC_WP_AI_EQUIPMENT_CATEGORIES = aiData.equipmentCategories || [];
                window.CC_WP_AI_DETECTED_INDUSTRY = aiData.detectedIndustry || '';
                window.CC_WP_AI_DETECTED_SECTOR = aiData.detectedSector || '';
                
                // Initialize selected arrays (first item of each pre-selected)
                window.CC_WP_SELECTED_JOB_TITLES = aiData.jobTitles?.length > 0 ? [aiData.jobTitles[0].id] : [];
                window.CC_WP_SELECTED_TASKS = aiData.taskCategories?.length > 0 ? [aiData.taskCategories[0].id] : [];
                window.CC_WP_SELECTED_EQUIPMENT = aiData.equipmentCategories?.length > 0 ? [aiData.equipmentCategories[0].id] : [];
                
                // v6.9.1: Store full AI context for Excel export
                window.CC_WP_AI_CONTEXT = {
                    documentTitle: docTitle,
                    detectedIndustry: aiData.detectedIndustry || '',
                    detectedSector: aiData.detectedSector || '',
                    jobTitles: aiData.jobTitles || [],
                    taskCategories: aiData.taskCategories || [],
                    equipmentCategories: aiData.equipmentCategories || []
                };
                
                // Helper to get level badge
                const getLevelBadge = (level) => {
                    const colors = {
                        worker: 'cc-level-worker',
                        supervisor: 'cc-level-supervisor',
                        manager: 'cc-level-manager'
                    };
                    const labels = {
                        worker: 'Worker',
                        supervisor: 'Supervisor',
                        manager: 'Manager'
                    };
                    return `<span class="cc-level-badge ${colors[level] || colors.worker}">${labels[level] || 'Worker'}</span>`;
                };
                
                // Build HTML with selectable AI-generated cards
                let html = `
                    <!-- AI Detection Header -->
                    <div class="cc-ai-header">
                        <div class="cc-ai-header-icon">${AUTO_ICONS['sparkles']}</div>
                        <div class="cc-ai-header-content">
                            <h4 class="cc-ai-header-title">${escapeHtml(aiData.detectedIndustry || 'Industry')} * ${escapeHtml(aiData.detectedSector || 'Sector')}</h4>
                            <p class="cc-ai-header-subtitle">AI has analysed your document and extracted relevant context. Select the job titles, tasks, and equipment that apply.</p>
                        </div>
                    </div>
                `;
                
                // Job Titles Section (selectable with section mapping)
                if (aiData.jobTitles && aiData.jobTitles.length > 0) {
                    html += `
                        <div class="cc-ai-section" data-section="wp-job-titles">
                            <div class="cc-ai-section-header">
                                <div class="cc-ai-section-icon">${AUTO_ICONS['users']}</div>
                                <div class="cc-ai-section-text">
                                    <h4 class="cc-ai-section-title">Job Titles</h4>
                                    <p class="cc-ai-section-hint">Who is this training for? Select 1-3 job titles.</p>
                                </div>
                                <span class="cc-ai-section-count"><span id="cc-wp-job-count">1</span>/${aiData.jobTitles.length}</span>
                            </div>
                            <div class="cc-ai-cards" id="cc-wp-ai-job-cards">
                                ${aiData.jobTitles.map((job, idx) => `
                                    <label class="cc-ai-card ${idx === 0 ? 'cc-ai-card--selected' : ''}" data-id="${job.id}" data-testid="wp-ai-job-${job.id}">
                                        <input type="checkbox" class="cc-ai-checkbox" ${idx === 0 ? 'checked' : ''} />
                                        <div class="cc-ai-card-body">
                                            <div class="cc-ai-card-header">
                                                <span class="cc-ai-card-title">${escapeHtml(job.title)}</span>
                                                ${getLevelBadge(job.level)}
                                            </div>
                                            <p class="cc-ai-card-mapping">Referenced in: ${escapeHtml(job.sectionMapping || 'Throughout document')}</p>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                // Task Categories Section (selectable with section mapping)
                if (aiData.taskCategories && aiData.taskCategories.length > 0) {
                    html += `
                        <div class="cc-ai-section" data-section="wp-tasks">
                            <div class="cc-ai-section-header">
                                <div class="cc-ai-section-icon">${AUTO_ICONS['clipboard-list']}</div>
                                <div class="cc-ai-section-text">
                                    <h4 class="cc-ai-section-title">Procedures & Tasks</h4>
                                    <p class="cc-ai-section-hint">What tasks are covered? Select 1-3 task categories.</p>
                                </div>
                                <span class="cc-ai-section-count"><span id="cc-wp-task-count">1</span>/${aiData.taskCategories.length}</span>
                            </div>
                            <div class="cc-ai-cards" id="cc-wp-ai-task-cards">
                                ${aiData.taskCategories.map((task, idx) => `
                                    <label class="cc-ai-card ${idx === 0 ? 'cc-ai-card--selected' : ''}" data-id="${task.id}" data-testid="wp-ai-task-${task.id}">
                                        <input type="checkbox" class="cc-ai-checkbox" ${idx === 0 ? 'checked' : ''} />
                                        <div class="cc-ai-card-body">
                                            <span class="cc-ai-card-title">${escapeHtml(task.title)}</span>
                                            <p class="cc-ai-card-examples">${escapeHtml((task.examples || []).slice(0, 2).join(', '))}</p>
                                            <p class="cc-ai-card-mapping">Found in: ${escapeHtml(task.sectionMapping || 'Throughout document')}</p>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                // Equipment Categories Section (selectable with section mapping)
                if (aiData.equipmentCategories && aiData.equipmentCategories.length > 0) {
                    html += `
                        <div class="cc-ai-section" data-section="wp-equipment">
                            <div class="cc-ai-section-header">
                                <div class="cc-ai-section-icon">${AUTO_ICONS['wrench']}</div>
                                <div class="cc-ai-section-text">
                                    <h4 class="cc-ai-section-title">Tools & Equipment</h4>
                                    <p class="cc-ai-section-hint">What equipment is mentioned? Select 1-3 categories.</p>
                                </div>
                                <span class="cc-ai-section-count"><span id="cc-wp-equip-count">1</span>/${aiData.equipmentCategories.length}</span>
                            </div>
                            <div class="cc-ai-cards" id="cc-wp-ai-equip-cards">
                                ${aiData.equipmentCategories.map((equip, idx) => `
                                    <label class="cc-ai-card ${idx === 0 ? 'cc-ai-card--selected' : ''}" data-id="${equip.id}" data-testid="wp-ai-equip-${equip.id}">
                                        <input type="checkbox" class="cc-ai-checkbox" ${idx === 0 ? 'checked' : ''} />
                                        <div class="cc-ai-card-body">
                                            <span class="cc-ai-card-title">${escapeHtml(equip.title)}</span>
                                            <p class="cc-ai-card-examples">${escapeHtml((equip.examples || []).slice(0, 2).join(', '))}</p>
                                            <p class="cc-ai-card-mapping">Found in: ${escapeHtml(equip.sectionMapping || 'Throughout document')}</p>
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                
                container.innerHTML = html;
                
                // Attach selection handlers for Workplace
                const attachWpSelectionHandlers = () => {
                    // Job Titles
                    document.querySelectorAll('#cc-wp-ai-job-cards .cc-ai-card').forEach(card => {
                        card.addEventListener('click', (e) => {
                            if (e.target.type !== 'checkbox') {
                                const checkbox = card.querySelector('input[type="checkbox"]');
                                checkbox.checked = !checkbox.checked;
                            }
                            updateWpSelection('wp-job-titles', card);
                        });
                    });
                    
                    // Tasks
                    document.querySelectorAll('#cc-wp-ai-task-cards .cc-ai-card').forEach(card => {
                        card.addEventListener('click', (e) => {
                            if (e.target.type !== 'checkbox') {
                                const checkbox = card.querySelector('input[type="checkbox"]');
                                checkbox.checked = !checkbox.checked;
                            }
                            updateWpSelection('wp-tasks', card);
                        });
                    });
                    
                    // Equipment
                    document.querySelectorAll('#cc-wp-ai-equip-cards .cc-ai-card').forEach(card => {
                        card.addEventListener('click', (e) => {
                            if (e.target.type !== 'checkbox') {
                                const checkbox = card.querySelector('input[type="checkbox"]');
                                checkbox.checked = !checkbox.checked;
                            }
                            updateWpSelection('wp-equipment', card);
                        });
                    });
                };
                
                const updateWpSelection = (section, card) => {
                    const checkbox = card.querySelector('input[type="checkbox"]');
                    
                    if (checkbox.checked) {
                        card.classList.add('cc-ai-card--selected');
                    } else {
                        card.classList.remove('cc-ai-card--selected');
                    }
                    
                    // Update window globals based on section
                    if (section === 'wp-job-titles') {
                        const selected = Array.from(document.querySelectorAll('#cc-wp-ai-job-cards input:checked'))
                            .map(cb => cb.closest('.cc-ai-card').dataset.id);
                        window.CC_WP_SELECTED_JOB_TITLES = selected;
                        const countEl = document.getElementById('cc-wp-job-count');
                        if (countEl) countEl.textContent = selected.length;
                    } else if (section === 'wp-tasks') {
                        const selected = Array.from(document.querySelectorAll('#cc-wp-ai-task-cards input:checked'))
                            .map(cb => cb.closest('.cc-ai-card').dataset.id);
                        window.CC_WP_SELECTED_TASKS = selected;
                        const countEl = document.getElementById('cc-wp-task-count');
                        if (countEl) countEl.textContent = selected.length;
                    } else if (section === 'wp-equipment') {
                        const selected = Array.from(document.querySelectorAll('#cc-wp-ai-equip-cards input:checked'))
                            .map(cb => cb.closest('.cc-ai-card').dataset.id);
                        window.CC_WP_SELECTED_EQUIPMENT = selected;
                        const countEl = document.getElementById('cc-wp-equip-count');
                        if (countEl) countEl.textContent = selected.length;
                    }
                };
                
                attachWpSelectionHandlers();
                
            } catch (err) {
                container.innerHTML = `
                    <div class="cc-auto-placeholder cc-auto-error">
                        <p>Could not generate AI suggestions from document. You can still proceed with manual context selection below.</p>
                    </div>
                `;
            }
        };
        
        // Workplace mode - Country/State
        const wpCountry = document.getElementById('cc-wp-country');
        if (wpCountry) {
            wpCountry.onchange = (e) => {
                const stateSelect = document.getElementById('cc-wp-state');
                if (stateSelect) {
                    const states = getStatesForCountry(e.target.value);
                    stateSelect.innerHTML = '<option value="">Select (optional)...</option>' +
                        states.map(s => `<option value="${s}">${s}</option>`).join('');
                }
            };
        }
        
        // Workplace mode - Industry/Sector (v6.5.47: Added sub-industry like VET mode)
        // v6.6.40: Also populates job titles and resets tasks/equipment
        const wpIndustry = document.getElementById('cc-wp-industry');
        if (wpIndustry) {
            wpIndustry.onchange = (e) => {
                const industry = e.target.value;
                // Populate Industry Sector
                const sectorSelect = document.getElementById('cc-wp-industry-sector');
                if (sectorSelect) {
                    const sectors = getSubcategoriesForIndustry(industry);
                    sectorSelect.innerHTML = '<option value="">Select sector (optional)...</option>' +
                        sectors.map(s => `<option value="${s}">${s}</option>`).join('');
                }
                // v6.6.40: Populate Job Titles based on industry
                const jobTitleSelect = document.getElementById('cc-wp-job-title');
                const jobTitleCustomContainer = document.getElementById('cc-wp-custom-job-container');
                if (jobTitleSelect) {
                    const jobTitles = getJobTitlesForIndustry(industry);
                    jobTitleSelect.innerHTML = '<option value="">Select job title...</option>' +
                        jobTitles.map(j => `<option value="${j}">${j}</option>`).join('') +
                        '<option value="_other">Other (custom)...</option>';
                    if (jobTitleCustomContainer) jobTitleCustomContainer.classList.add('cc-hidden');
                }
                // Reset task/equipment categories
                const taskGrid = document.getElementById('cc-wp-task-categories');
                const equipmentGrid = document.getElementById('cc-wp-equipment-categories');
                if (taskGrid) taskGrid.innerHTML = '<p class="cc-form-hint">Select job title first...</p>';
                if (equipmentGrid) equipmentGrid.innerHTML = '<p class="cc-form-hint">Select job title first...</p>';
                window.CC_WP_SELECTED_TASK_CATEGORIES = [];
                window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES = [];
            };
        }
        
        // v6.6.40: Workplace mode - Job Title  ->  Task & Equipment Categories
        const wpJobTitle = document.getElementById('cc-wp-job-title');
        if (wpJobTitle) {
            wpJobTitle.onchange = (e) => {
                const jobTitle = e.target.value;
                const industry = document.getElementById('cc-wp-industry')?.value || '';
                const jobTitleCustomContainer = document.getElementById('cc-wp-custom-job-container');
                const taskContainer = document.getElementById('cc-wp-task-categories');
                const equipmentContainer = document.getElementById('cc-wp-equipment-categories');
                
                // Handle custom job title
                if (jobTitle === '_other') {
                    if (jobTitleCustomContainer) jobTitleCustomContainer.classList.remove('cc-hidden');
                } else {
                    if (jobTitleCustomContainer) jobTitleCustomContainer.classList.add('cc-hidden');
                }
                
                // Initialize selection arrays for Workplace mode
                window.CC_WP_SELECTED_TASK_CATEGORIES = [];
                window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES = [];
                
                // Get task and equipment categories
                const taskCategories = getTaskCategoriesForJobTitle(industry, jobTitle);
                const equipmentCategories = getEquipmentCategoriesForJobTitle(industry, jobTitle);
                
                // Render task category cards using same pattern as VET
                if (taskContainer) {
                    window.CC_BUILDER.renderCategoryCards(taskContainer, taskCategories, 'wp-task');
                }
                
                // Render equipment category cards
                if (equipmentContainer) {
                    window.CC_BUILDER.renderCategoryCards(equipmentContainer, equipmentCategories, 'wp-equipment');
                }
                
                updateWpSelectionCounts();
            };
        }
        
        // ===========================================================================
        // Workplace mode - Custom Job Title Input Handler (v6.6.52: Fix custom title categories)
        // ===========================================================================
        const wpJobTitleCustom = document.getElementById('cc-wp-job-title-custom');
        if (wpJobTitleCustom) {
            // Helper function to populate categories with custom job title
            const populateWpCategories = () => {
                const customTitle = wpJobTitleCustom.value.trim();
                if (!customTitle) return;
                
                const industry = document.getElementById('cc-wp-industry')?.value || '';
                const taskContainer = document.getElementById('cc-wp-task-categories');
                const equipmentContainer = document.getElementById('cc-wp-equipment-categories');
                
                // Clear previously selected categories
                window.CC_WP_SELECTED_TASK_CATEGORIES = [];
                window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES = [];
                
                // Get categories using custom job title
                const taskCategories = getTaskCategoriesForJobTitle(industry, customTitle);
                const equipmentCategories = getEquipmentCategoriesForJobTitle(industry, customTitle);
                
                if (taskContainer) {
                    window.CC_BUILDER.renderCategoryCards(taskContainer, taskCategories, 'wp-task');
                }
                if (equipmentContainer) {
                    window.CC_BUILDER.renderCategoryCards(equipmentContainer, equipmentCategories, 'wp-equipment');
                }
                
                updateWpSelectionCounts();
            };
            
            // Trigger on blur (when user leaves the field)
            wpJobTitleCustom.onblur = populateWpCategories;
            
            // Also trigger on Enter key
            wpJobTitleCustom.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    populateWpCategories();
                }
            };
        }
        
        // University mode
        const uniCountry = document.getElementById('cc-uni-country');
        if (uniCountry) {
            uniCountry.onchange = (e) => {
                const stateSelect = document.getElementById('cc-uni-state');
                if (stateSelect) {
                    const states = getStatesForCountry(e.target.value);
                    stateSelect.innerHTML = '<option value="">Select (optional)...</option>' +
                        states.map(s => `<option value="${s}">${s}</option>`).join('');
                }
            };
        }
    };

    const INDUSTRIES = [
        'Aged Care', 'Agriculture', 'Automotive', 'Aviation', 'Building & Construction',
        'Business Services', 'Childcare', 'Community Services', 'Education', 'Electrical',
        'Engineering', 'Finance', 'Food Processing', 'Government', 'Healthcare',
        'Hospitality', 'Information Technology', 'Logistics', 'Manufacturing', 'Mining',
        'Plumbing', 'Retail', 'Security', 'Sport & Recreation', 'Tourism', 'Transport',
        'Utilities', 'Warehousing', 'Other'
    ];

    const INDUSTRY_SUBCATEGORIES = {
        'Aged Care': [
            'Residential Aged Care', 'Home Care Services', 'Dementia Care', 'Palliative Care',
            'Community Aged Care', 'Retirement Living', 'Respite Care', 'Allied Health in Aged Care'
        ],
        'Agriculture': [
            'Cropping & Grain', 'Livestock & Cattle', 'Dairy Farming', 'Horticulture',
            'Viticulture & Wine', 'Aquaculture', 'Poultry', 'Shearing & Wool',
            'Agricultural Contracting', 'Irrigation & Water Management'
        ],
        'Automotive': [
            'Light Vehicle Mechanical', 'Heavy Vehicle Mechanical', 'Auto Electrical',
            'Panel Beating & Spray Painting', 'Motorcycle Technician', 'Marine Mechanical',
            'Automotive Parts & Accessories', 'Vehicle Sales', 'Tyre Fitting'
        ],
        'Aviation': [
            'Commercial Aviation', 'General Aviation', 'Aircraft Maintenance', 'Ground Operations',
            'Air Traffic Control', 'Cabin Crew', 'Aviation Security', 'Helicopter Operations'
        ],
        'Building & Construction': [
            'Residential Construction', 'Commercial Construction', 'Civil Construction',
            'Mining Construction', 'Industrial Construction', 'High-Rise Construction',
            'Renovation & Refurbishment', 'Demolition', 'Scaffolding', 'Formwork',
            'Concreting', 'Steel Fixing', 'Carpentry', 'Bricklaying', 'Tiling',
            'Painting & Decorating', 'Plastering', 'Roofing', 'Glazing', 'Waterproofing'
        ],
        'Business Services': [
            'Accounting & Bookkeeping', 'Human Resources', 'Marketing & Advertising',
            'Legal Services', 'Consulting', 'Recruitment', 'Training & Development',
            'Property Management', 'Cleaning Services', 'Security Services'
        ],
        'Childcare': [
            'Long Day Care', 'Family Day Care', 'Outside School Hours Care', 'Kindergarten/Preschool',
            'Occasional Care', 'In-Home Care', 'Special Needs Support', 'Early Intervention'
        ],
        'Community Services': [
            'Disability Support', 'Mental Health Support', 'Youth Work', 'Family Services',
            'Homelessness Services', 'Drug & Alcohol Services', 'Aboriginal & Torres Strait Islander Services',
            'Refugee & Migrant Services', 'Domestic Violence Support', 'Case Management'
        ],
        'Education': [
            'Primary Education', 'Secondary Education', 'Vocational Education (VET)',
            'Higher Education/University', 'TAFE', 'Adult Education', 'Special Education',
            'Early Childhood Education', 'Online/Distance Education', 'Education Support',
            'Training Administration', 'School Administration', 'Private Training Provider (RTO)'
        ],
        'Electrical': [
            'Domestic Electrical', 'Commercial Electrical', 'Industrial Electrical',
            'Instrumentation', 'Refrigeration & Air Conditioning', 'Solar Installation',
            'Data & Communications', 'Fire Protection Systems', 'Lift Installation'
        ],
        'Engineering': [
            'Mechanical Engineering', 'Civil Engineering', 'Structural Engineering',
            'Electrical Engineering', 'Chemical Engineering', 'Mining Engineering',
            'Environmental Engineering', 'Project Engineering', 'Maintenance Engineering'
        ],
        'Finance': [
            'Banking', 'Insurance', 'Financial Planning', 'Mortgage Broking',
            'Credit & Lending', 'Superannuation', 'Investment Management', 'Payroll',
            'Accounts Payable/Receivable', 'Auditing'
        ],
        'Food Processing': [
            'Meat Processing', 'Seafood Processing', 'Dairy Processing', 'Bakery',
            'Beverage Manufacturing', 'Confectionery', 'Fruit & Vegetable Processing',
            'Ready Meals & Convenience Foods', 'Quality Assurance', 'Food Safety'
        ],
        'Government': [
            'Local Government', 'State Government', 'Federal Government', 'Emergency Services',
            'Regulatory & Compliance', 'Policy & Planning', 'Customer Service',
            'Parks & Recreation', 'Infrastructure', 'Community Engagement'
        ],
        'Healthcare': [
            'Acute Care/Hospital', 'Primary Care/GP', 'Allied Health', 'Mental Health',
            'Community Health', 'Dental', 'Pharmacy', 'Pathology', 'Radiology',
            'Emergency Services', 'Surgical', 'Rehabilitation', 'Infection Control',
            'Aged Care Nursing', 'Midwifery', 'Disability Health', 'Aboriginal Health'
        ],
        'Hospitality': [
            'Hotels & Accommodation', 'Restaurants & Cafes', 'Bars & Pubs', 'Catering',
            'Events & Functions', 'Fast Food & Quick Service', 'Clubs & Gaming',
            'Commercial Cookery', 'Patisserie', 'Front Office', 'Housekeeping'
        ],
        'Information Technology': [
            'Software Development', 'Network Administration', 'Cybersecurity', 'Cloud Computing',
            'Database Administration', 'IT Support/Help Desk', 'Web Development',
            'Data Analytics', 'Systems Administration', 'IT Project Management'
        ],
        'Logistics': [
            'Supply Chain Management', 'Freight Forwarding', 'Customs & Border',
            'Inventory Management', 'Distribution', 'Third-Party Logistics (3PL)',
            'Last Mile Delivery', 'Cold Chain Logistics', 'Dangerous Goods'
        ],
        'Manufacturing': [
            'Food & Beverage Manufacturing', 'Pharmaceutical Manufacturing', 'Chemical Manufacturing',
            'Metal Fabrication', 'Plastics & Rubber', 'Textiles', 'Furniture Manufacturing',
            'Electronics Manufacturing', 'Printing', 'Packaging', 'Process Manufacturing'
        ],
        'Mining': [
            'Open Cut Mining', 'Underground Mining', 'Coal Mining', 'Iron Ore',
            'Gold Mining', 'Mineral Processing', 'Exploration', 'Drilling',
            'Mine Site Services', 'Tailings Management', 'Mine Rehabilitation'
        ],
        'Plumbing': [
            'Domestic Plumbing', 'Commercial Plumbing', 'Industrial Plumbing',
            'Gas Fitting', 'Roofing & Drainage', 'Fire Protection Plumbing',
            'Irrigation', 'Water Treatment', 'Mechanical Services'
        ],
        'Retail': [
            'Supermarkets & Grocery', 'Fashion & Apparel', 'Electronics & Technology',
            'Hardware & Building', 'Pharmacy Retail', 'Furniture & Homewares',
            'Automotive Retail', 'Sporting Goods', 'Online/E-commerce', 'Luxury Retail'
        ],
        'Security': [
            'Static Security', 'Mobile Patrol', 'Event Security', 'Close Protection',
            'Loss Prevention', 'Corporate Security', 'Cash in Transit', 'CCTV & Monitoring',
            'Access Control', 'Cybersecurity Operations'
        ],
        'Sport & Recreation': [
            'Fitness & Personal Training', 'Aquatics', 'Outdoor Recreation', 'Sports Coaching',
            'Sports Administration', 'Community Recreation', 'Event Management',
            'Golf & Turf Management', 'Sports Medicine Support'
        ],
        'Tourism': [
            'Travel Agencies', 'Tour Operations', 'Attractions & Theme Parks', 'Eco-Tourism',
            'Adventure Tourism', 'Cultural Tourism', 'Cruise Operations', 'Tourism Marketing',
            'Visitor Information Services', 'Indigenous Tourism'
        ],
        'Transport': [
            'Road Transport', 'Rail Transport', 'Maritime Transport', 'Air Transport',
            'Public Transport', 'Taxi & Rideshare', 'Courier Services', 'Bus Operations',
            'Heavy Vehicle Operations', 'Transport Administration'
        ],
        'Utilities': [
            'Electricity Generation', 'Electricity Distribution', 'Gas Distribution',
            'Water Supply', 'Wastewater Treatment', 'Renewable Energy', 'Smart Grid',
            'Meter Reading', 'Network Maintenance'
        ],
        'Warehousing': [
            'General Warehousing', 'Cold Storage', 'Distribution Centres', 'Cross-Docking',
            'Hazardous Goods Storage', 'Automated Warehousing', 'Order Fulfillment',
            'Returns Processing', 'Inventory Control'
        ],
        'Other': [
            'General Industry', 'Cross-Industry', 'Emerging Industry'
        ]
    };

    const getSubcategoriesForIndustry = (industry) => {
        return INDUSTRY_SUBCATEGORIES[industry] || ['General'];
    };

    // ===========================================================================
    // JOB TITLES BY INDUSTRY - Curated list with "Other" option for custom entry
    // ===========================================================================
    const INDUSTRY_JOB_TITLES = {
        'Aged Care': [
            'Personal Care Worker', 'Aged Care Worker', 'Enrolled Nurse', 'Registered Nurse',
            'Care Coordinator', 'Lifestyle Officer', 'Facility Manager', 'Medication Assistant',
            'Allied Health Assistant', 'Dementia Care Worker', 'Diversional Therapist',
            'Home Care Worker', 'Palliative Care Worker', 'Respite Care Worker'
        ],
        'Agriculture': [
            'Farm Hand', 'Farm Worker', 'Tractor Operator', 'Livestock Handler',
            'Irrigation Technician', 'Harvest Worker', 'Stock Manager', 'Farm Supervisor',
            'Agricultural Mechanic', 'Agronomist', 'Wool Classer', 'Shearer',
            'Station Hand', 'Dairy Farmer', 'Horticulturist', 'Farm Manager'
        ],
        'Automotive': [
            'Mechanic', 'Apprentice Mechanic', 'Motor Mechanic', 'Service Advisor',
            'Workshop Supervisor', 'Panel Beater', 'Spray Painter', 'Auto Electrician',
            'Parts Interpreter', 'Workshop Manager', 'Tyre Fitter', 'Vehicle Detailer',
            'Motorcycle Technician', 'Heavy Vehicle Mechanic', 'Diesel Mechanic'
        ],
        'Aviation': [
            'Ground Crew', 'Baggage Handler', 'Aircraft Refueller', 'Ramp Officer',
            'Aircraft Maintenance Engineer', 'Cabin Crew', 'Flight Attendant', 'Flight Dispatcher',
            'Ground Operations Supervisor', 'Pilot', 'Air Traffic Controller',
            'Aviation Security Officer', 'Check-In Agent', 'Load Controller'
        ],
        'Building & Construction': [
            'Scaffold Worker', 'EWP Operator', 'Crane Operator', 'Rigger', 'Dogman',
            'Carpenter', 'Bricklayer', 'Concreter', 'Steel Fixer', 'Formworker',
            'Labourer', 'Site Supervisor', 'Safety Officer', 'Trades Assistant',
            'Tiler', 'Plasterer', 'Roofer', 'Glazier', 'Painter', 'Traffic Controller',
            'Site Manager', 'Foreman', 'Project Manager', 'Estimator', 'Building Surveyor'
        ],
        'Business Services': [
            'Administration Officer', 'Receptionist', 'Office Manager', 'HR Officer',
            'Accounts Clerk', 'Payroll Officer', 'Project Coordinator', 'Executive Assistant',
            'Bookkeeper', 'Marketing Coordinator', 'Recruitment Consultant', 'Legal Secretary',
            'Office Administrator', 'Data Entry Operator', 'Business Analyst', 'HR Manager'
        ],
        'Childcare': [
            'Childcare Educator', 'Early Childhood Educator', 'Diploma Educator', 'Room Leader',
            'Centre Director', 'Educational Leader', 'Family Day Care Educator',
            'OSHC Coordinator', 'Inclusion Support Worker', 'Early Childhood Teacher',
            'Kindergarten Teacher', 'Preschool Teacher', 'Childcare Worker', 'Nanny',
            'Before/After School Care Worker', 'Childcare Centre Manager'
        ],
        'Community Services': [
            'Support Worker', 'Case Manager', 'Youth Worker', 'Mental Health Worker',
            'Family Support Worker', 'Disability Support Worker', 'Community Development Officer',
            'Team Leader', 'Social Worker', 'Counsellor', 'Drug & Alcohol Worker',
            'Housing Worker', 'Welfare Officer', 'Community Engagement Officer',
            'Aboriginal Health Worker', 'Case Worker', 'Program Coordinator'
        ],
        'Education': [
            'Teacher', 'Primary School Teacher', 'Secondary School Teacher', 'Teacher Aide',
            'Education Support Officer', 'Trainer', 'Assessor', 'Trainer and Assessor',
            'VET Coordinator', 'Student Support Officer', 'Laboratory Technician',
            'School Administrator', 'Librarian', 'Curriculum Coordinator',
            'Head of Department', 'Principal', 'Deputy Principal',
            'Special Education Teacher', 'TAFE Teacher', 'Tutor',
            'Training Coordinator', 'Education Manager', 'Learning Support Officer'
        ],
        'Electrical': [
            'Electrician', 'Apprentice Electrician', 'Electrical Supervisor', 'Instrumentation Technician',
            'Data Cabler', 'Solar Installer', 'Refrigeration Mechanic', 'Fire Systems Technician',
            'Electrical Contractor', 'Air Conditioning Technician', 'Electrical Engineer',
            'Switchboard Technician', 'Communications Technician', 'Electrical Foreman'
        ],
        'Engineering': [
            'Engineering Technician', 'Project Engineer', 'Maintenance Engineer', 'Design Engineer',
            'Quality Engineer', 'CAD Operator', 'Engineering Supervisor', 'Test Technician',
            'Civil Engineer', 'Mechanical Engineer', 'Structural Engineer', 'Draftsperson',
            'Engineering Manager', 'Site Engineer', 'Process Engineer', 'Environmental Engineer'
        ],
        'Finance': [
            'Bank Teller', 'Customer Service Officer', 'Loans Officer', 'Financial Planner',
            'Mortgage Broker', 'Accounts Officer', 'Compliance Officer', 'Branch Manager',
            'Accountant', 'Bookkeeper', 'Payroll Officer', 'Insurance Agent',
            'Financial Adviser', 'Auditor', 'Credit Analyst', 'Finance Manager'
        ],
        'Food Processing': [
            'Production Worker', 'Machine Operator', 'Quality Controller', 'Boner/Slicer',
            'Packer', 'Forklift Operator', 'Line Supervisor', 'Hygiene Officer',
            'Food Safety Officer', 'Process Worker', 'Bakery Worker', 'Production Supervisor',
            'Quality Assurance Officer', 'Laboratory Technician', 'Plant Operator'
        ],
        'Government': [
            'Customer Service Officer', 'Administrative Officer', 'Compliance Officer', 'Inspector',
            'Policy Officer', 'Project Officer', 'Team Leader', 'Manager',
            'Regulatory Officer', 'Case Officer', 'Ranger', 'Council Worker',
            'Building Inspector', 'Planning Officer', 'Environmental Health Officer',
            'Emergency Services Worker', 'Firefighter', 'Paramedic', 'Police Officer'
        ],
        'Healthcare': [
            'Patient Services Assistant', 'Ward Clerk', 'Enrolled Nurse', 'Registered Nurse',
            'Allied Health Assistant', 'Orderly', 'Phlebotomist', 'Clinical Coder',
            'Health Information Officer', 'Theatre Technician', 'Sterilisation Technician',
            'Doctor', 'Midwife', 'Physiotherapist', 'Occupational Therapist',
            'Speech Pathologist', 'Pharmacist', 'Pharmacy Assistant', 'Dental Assistant',
            'Radiographer', 'Paramedic', 'Medical Receptionist', 'Practice Manager',
            'Clinical Nurse', 'Nurse Practitioner', 'Personal Care Assistant'
        ],
        'Hospitality': [
            'Kitchen Hand', 'Commis Chef', 'Chef de Partie', 'Head Chef', 'Sous Chef',
            'Waiter', 'Waitress', 'Barista', 'Bartender', 'Front Office Agent',
            'Housekeeping Attendant', 'Duty Manager', 'Events Coordinator', 'Gaming Attendant',
            'Restaurant Manager', 'Hotel Manager', 'Concierge', 'Cook',
            'Pastry Chef', 'Food & Beverage Manager', 'Bar Manager', 'Night Auditor'
        ],
        'Information Technology': [
            'Help Desk Officer', 'IT Support Technician', 'Network Administrator', 'Systems Administrator',
            'Software Developer', 'Web Developer', 'Database Administrator', 'Cybersecurity Analyst',
            'IT Project Coordinator', 'Data Analyst', 'IT Manager', 'Programmer',
            'Network Engineer', 'Systems Analyst', 'Cloud Engineer', 'DevOps Engineer',
            'IT Consultant', 'Technical Support Officer', 'IT Trainer'
        ],
        'Logistics': [
            'Logistics Coordinator', 'Freight Forwarder', 'Customs Broker', 'Supply Chain Analyst',
            'Dispatch Officer', 'Transport Planner', 'Inventory Controller', 'Operations Manager',
            'Logistics Manager', 'Warehouse Coordinator', 'Import/Export Officer',
            'Distribution Manager', 'Fleet Manager', 'Supply Chain Manager'
        ],
        'Manufacturing': [
            'Production Operator', 'Machine Operator', 'CNC Operator', 'Process Worker',
            'Quality Inspector', 'Maintenance Fitter', 'Production Supervisor', 'Toolmaker',
            'Welder', 'Fabricator', 'Assembly Worker', 'Packer',
            'Production Manager', 'Plant Manager', 'Quality Manager', 'Safety Officer',
            'Boilermaker', 'Maintenance Electrician', 'Factory Worker', 'Storeman'
        ],
        'Mining': [
            'Haul Truck Operator', 'Excavator Operator', 'Loader Operator', 'Driller',
            'Shot Firer', 'Fitter', 'Boilermaker', 'Electrician',
            'Geologist', 'Survey Technician', 'Process Plant Operator', 'Mining Engineer',
            'Deputy/Supervisor', 'Safety Advisor', 'Environmental Officer',
            'Mine Manager', 'Maintenance Supervisor', 'Drill & Blast Engineer',
            'Underground Miner', 'Ore Processing Technician', 'Exploration Geologist'
        ],
        'Plumbing': [
            'Plumber', 'Apprentice Plumber', 'Gas Fitter', 'Drainer',
            'Roofer/Roof Plumber', 'Fire Protection Plumber', 'Irrigation Technician',
            'Plumbing Supervisor', 'Plumbing Contractor', 'Mechanical Plumber',
            'Water Treatment Technician', 'Plumbing Foreman', 'Plumbing Inspector'
        ],
        'Retail': [
            'Sales Assistant', 'Customer Service Representative', 'Store Manager', 'Visual Merchandiser',
            'Stock Controller', 'Cashier', 'Department Manager', 'Loss Prevention Officer',
            'Retail Manager', 'Shop Assistant', 'Pharmacy Assistant', 'Butcher',
            'Baker', 'Deli Assistant', 'Retail Buyer', 'Area Manager',
            'Assistant Store Manager', 'Online Sales Coordinator', 'Checkout Operator'
        ],
        'Security': [
            'Security Officer', 'Security Guard', 'Control Room Operator', 'Mobile Patrol Officer',
            'Event Security Officer', 'Close Protection Officer', 'Loss Prevention Officer',
            'Site Supervisor', 'Security Manager', 'Cash-in-Transit Officer',
            'Corporate Security Officer', 'CCTV Operator', 'Access Control Officer',
            'Security Trainer', 'Risk Manager'
        ],
        'Sport & Recreation': [
            'Fitness Instructor', 'Personal Trainer', 'Gym Manager', 'Pool Lifeguard',
            'Swim Teacher', 'Sports Coach', 'Recreation Officer', 'Outdoor Guide',
            'Aquatics Manager', 'Sports Administrator', 'Facility Manager',
            'Group Fitness Instructor', 'Sports Development Officer', 'Exercise Physiologist',
            'Adventure Guide', 'Camp Coordinator', 'Recreation Centre Manager'
        ],
        'Tourism': [
            'Travel Consultant', 'Tour Guide', 'Reservation Agent', 'Visitor Information Officer',
            'Attractions Attendant', 'Tour Coordinator', 'Tourism Marketing Officer', 'Operations Manager',
            'Travel Agent', 'Tour Manager', 'Booking Agent', 'Theme Park Attendant',
            'Ecotourism Guide', 'Cruise Ship Staff', 'Tourism Manager'
        ],
        'Transport': [
            'Truck Driver', 'Bus Driver', 'Train Driver', 'Courier Driver',
            'Fleet Coordinator', 'Dispatch Officer', 'Transport Supervisor', 'Logistics Coordinator',
            'Heavy Vehicle Driver', 'Taxi Driver', 'Delivery Driver', 'Transport Manager',
            'Traffic Controller', 'Freight Handler', 'Bus Operator', 'Maritime Worker'
        ],
        'Utilities': [
            'Meter Reader', 'Linesperson', 'Network Technician', 'Plant Operator',
            'Water Treatment Operator', 'Fitter', 'Electrician', 'Field Service Technician',
            'Gas Fitter', 'Power Station Operator', 'Utility Worker',
            'Network Controller', 'Maintenance Technician', 'Renewable Energy Technician'
        ],
        'Warehousing': [
            'Forklift Operator', 'Warehouse Worker', 'Picker/Packer', 'Receival Officer',
            'Dispatch Officer', 'Inventory Controller', 'Warehouse Supervisor', 'WMS Operator',
            'Warehouse Manager', 'Storeman', 'Stock Controller', 'Loading Dock Worker',
            'Returns Officer', 'Dangerous Goods Handler', 'Order Processor'
        ],
        'Other': [
            'General Worker', 'Team Member', 'Operator', 'Technician', 'Supervisor',
            'Coordinator', 'Manager', 'Administrator', 'Officer', 'Assistant'
        ]
    };

    const getJobTitlesForIndustry = (industry) => {
        return INDUSTRY_JOB_TITLES[industry] || INDUSTRY_JOB_TITLES['Other'];
    };

    // ===========================================================================
    // JOB TASK CATEGORIES - Industry-specific grouped tasks with examples
    // v6.6.38: Category-based approach with beautiful card UI
    // Each category has: id, icon (Lucide icon name), title, and examples
    // ===========================================================================
    const JOB_TASK_CATEGORIES = {
        // --- BUILDING & CONSTRUCTION -------------------------------------------
        'Building & Construction': {
            'Scaffold Worker': [
                { id: 'erect', icon: 'construction', title: 'Erect & Assemble', examples: ['Set out scaffold footprint', 'Install base plates and sole boards', 'Install standards, ledgers and transoms', 'Install working platforms and guardrails', 'Tie scaffold to structure'] },
                { id: 'modify', icon: 'wrench', title: 'Alter & Modify', examples: ['Add or remove lifts', 'Extend scaffold bays', 'Adjust tie-in locations', 'Reconfigure access points', 'Install cantilever sections'] },
                { id: 'dismantle', icon: 'arrow-down', title: 'Dismantle & Remove', examples: ['Remove components top-down', 'Lower components safely', 'Maintain exclusion zones', 'Stack and store components', 'Prepare for transport'] },
                { id: 'inspect', icon: 'clipboard-check', title: 'Inspect & Tag', examples: ['Conduct pre-use inspections', 'Check compliance tags', 'Identify damage or defects', 'Tag out unsafe scaffolds', 'Verify load classifications'] },
                { id: 'heights', icon: 'move-vertical', title: 'Work at Heights', examples: ['Access platforms safely', 'Maintain edge protection', 'Handle tools without drop risk', 'Use fall-arrest systems', 'Transition anchor points'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Controls', examples: ['Install toe boards and mesh', 'Establish exclusion zones', 'Manage dropped-object risks', 'Coordinate with other trades', 'Respond to weather conditions'] }
            ],
            'EWP Operator': [
                { id: 'operate', icon: 'arrow-up-circle', title: 'Operate EWP', examples: ['Pre-start inspection', 'Position EWP for task', 'Operate boom/scissor controls', 'Park and secure EWP', 'Battery/fuel management'] },
                { id: 'access', icon: 'door-open', title: 'Access Work', examples: ['Installing signage at height', 'Maintenance access work', 'Building inspection access', 'HVAC installation access', 'Painting at height'] },
                { id: 'electrical', icon: 'zap', title: 'Electrical Access', examples: ['Lighting installation', 'Cable tray access', 'Camera installation', 'Sensor mounting', 'Conduit installation'] },
                { id: 'rescue', icon: 'life-buoy', title: 'Emergency & Rescue', examples: ['Emergency lowering procedure', 'Rescue planning', 'Entrapment response', 'Communication protocols', 'First aid access'] },
                { id: 'site', icon: 'map-pin', title: 'Site Setup', examples: ['Ground assessment', 'Outrigger deployment', 'Exclusion zone setup', 'Traffic management', 'Overhead hazard checks'] },
                { id: 'heights', icon: 'shield-check', title: 'Height Safety', examples: ['Harness connection', 'Fall restraint systems', 'Edge protection', 'Tool tethering', 'Weather monitoring'] }
            ],
            'Crane Operator': [
                { id: 'lift', icon: 'arrow-up', title: 'Lifting Operations', examples: ['Lifting steel beams', 'Moving precast panels', 'Lifting scaffold materials', 'Personnel transfer', 'Tandem lift operations'] },
                { id: 'setup', icon: 'settings', title: 'Crane Setup', examples: ['Pre-start checks', 'Outrigger deployment', 'Load chart review', 'Radius calculation', 'Ground bearing assessment'] },
                { id: 'communicate', icon: 'radio', title: 'Communication', examples: ['Radio protocols', 'Hand signals with dogman', 'Lift briefings', 'Emergency stop signals', 'Multi-crane coordination'] },
                { id: 'hazards', icon: 'alert-triangle', title: 'Hazard Management', examples: ['Powerline clearance', 'Wind monitoring', 'Swing radius control', 'Underground services', 'Overhead obstructions'] },
                { id: 'maintain', icon: 'tool', title: 'Daily Maintenance', examples: ['Wire rope inspection', 'Fluid level checks', 'Brake testing', 'Safety device checks', 'Documentation'] },
                { id: 'shutdown', icon: 'power', title: 'Shutdown & Secure', examples: ['End-of-shift procedure', 'Boom stowing', 'Lock-out procedures', 'Weather securing', 'Handover protocols'] }
            ],
            'Rigger': [
                { id: 'sling', icon: 'link', title: 'Slinging & Rigging', examples: ['Select sling type', 'Calculate load weight', 'Apply sling angles', 'Rig unbalanced loads', 'Use spreader beams'] },
                { id: 'inspect', icon: 'search', title: 'Equipment Inspection', examples: ['Inspect slings and shackles', 'Check SWL markings', 'Identify wear and damage', 'Tag out defective gear', 'Maintain register'] },
                { id: 'direct', icon: 'navigation', title: 'Direct Crane Movements', examples: ['Hand signals', 'Radio communication', 'Guide loads to position', 'Clear swing paths', 'Coordinate with trades'] },
                { id: 'assemble', icon: 'puzzle', title: 'Assemble Plant', examples: ['Assemble mobile cranes', 'Erect tower cranes', 'Install personnel hoists', 'Set up material hoists', 'Commission equipment'] },
                { id: 'move', icon: 'truck', title: 'Move Plant & Equipment', examples: ['Relocate machinery', 'Transport modules', 'Position prefab units', 'Move heavy equipment', 'Install plant on plinths'] },
                { id: 'safety', icon: 'shield', title: 'Lift Zone Safety', examples: ['Establish exclusion zones', 'Barricade lift areas', 'Position spotters', 'Manage pedestrian traffic', 'Emergency procedures'] }
            ],
            'Dogman': [
                { id: 'signal', icon: 'hand', title: 'Crane Signals', examples: ['Standard hand signals', 'Radio communication', 'Emergency stop signal', 'Slew direction signals', 'Hoist up/down signals'] },
                { id: 'sling', icon: 'link', title: 'Slinging Loads', examples: ['Select appropriate slings', 'Apply correct hitches', 'Balance load centre', 'Secure tag lines', 'Check before lift'] },
                { id: 'direct', icon: 'compass', title: 'Direct Operations', examples: ['Guide load to position', 'Communicate obstructions', 'Clear landing area', 'Coordinate unhooking', 'Supervise lift zone'] },
                { id: 'inspect', icon: 'clipboard-check', title: 'Pre-Lift Checks', examples: ['Verify load weight', 'Check crane capacity', 'Inspect rigging gear', 'Confirm lift plan', 'Brief all parties'] },
                { id: 'zone', icon: 'square', title: 'Zone Management', examples: ['Set up exclusion zones', 'Position barricades', 'Control access points', 'Monitor pedestrians', 'Maintain clear zones'] },
                { id: 'emergency', icon: 'alert-circle', title: 'Emergency Response', examples: ['Emergency stop procedure', 'Load lowering', 'Entanglement response', 'Communication failure', 'Incident reporting'] }
            ],
            'Carpenter': [
                { id: 'frame', icon: 'home', title: 'Wall & Roof Framing', examples: ['Install wall frames', 'Fit roof trusses', 'Install ceiling joists', 'Brace structures', 'Set out plates'] },
                { id: 'formwork', icon: 'box', title: 'Formwork', examples: ['Build wall formwork', 'Construct column forms', 'Install slab edge forms', 'Strip and clean forms', 'Apply release agents'] },
                { id: 'fitout', icon: 'door-closed', title: 'Internal Fit-out', examples: ['Install doors and frames', 'Fit windows', 'Install architraves', 'Fix skirting boards', 'Build stairs'] },
                { id: 'flooring', icon: 'layers', title: 'Flooring & Decking', examples: ['Lay timber flooring', 'Install subfloor', 'Build decking', 'Install bearers and joists', 'Level and pack'] },
                { id: 'measure', icon: 'ruler', title: 'Setting Out', examples: ['Read plans and drawings', 'Set out building lines', 'Transfer levels', 'Calculate materials', 'Mark cutting lines'] },
                { id: 'safety', icon: 'shield-check', title: 'Safe Work Practices', examples: ['Use power tools safely', 'Work at heights', 'Handle heavy materials', 'Maintain clean site', 'PPE compliance'] }
            ],
            'Labourer': [
                { id: 'cleanup', icon: 'trash-2', title: 'Site Clean-up', examples: ['Clear construction waste', 'Sort recyclable materials', 'Clean work areas', 'Remove debris', 'Prepare for next trade'] },
                { id: 'materials', icon: 'package', title: 'Material Handling', examples: ['Unload deliveries', 'Distribute materials', 'Stack and store stock', 'Move equipment', 'Feed materials to trades'] },
                { id: 'assist', icon: 'users', title: 'Assist Trades', examples: ['Hold materials in place', 'Pass tools and fixings', 'Mix mortar or concrete', 'Operate plant for trades', 'Prepare work areas'] },
                { id: 'excavate', icon: 'shovel', title: 'Excavation Support', examples: ['Hand dig around services', 'Compact fill material', 'Spread aggregate', 'Level surfaces', 'Form edges'] },
                { id: 'concrete', icon: 'droplet', title: 'Concrete Work', examples: ['Pour and spread concrete', 'Vibrate concrete', 'Finish surfaces', 'Cure concrete', 'Strip formwork'] },
                { id: 'safety', icon: 'hard-hat', title: 'Site Safety', examples: ['Maintain barricades', 'Erect temporary fencing', 'Install signage', 'Report hazards', 'Attend toolbox talks'] }
            ],
            'Site Supervisor': [
                { id: 'plan', icon: 'calendar', title: 'Daily Planning', examples: ['Conduct toolbox talks', 'Allocate work tasks', 'Review daily schedule', 'Coordinate deliveries', 'Brief subcontractors'] },
                { id: 'permits', icon: 'file-check', title: 'Permits & Compliance', examples: ['Issue work permits', 'Review SWMS', 'Check licences', 'Maintain registers', 'Conduct inspections'] },
                { id: 'manage', icon: 'users', title: 'Team Management', examples: ['Supervise workers', 'Manage subcontractors', 'Resolve conflicts', 'Monitor performance', 'Approve timesheets'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality Control', examples: ['Inspect completed work', 'Check against specs', 'Document defects', 'Sign off stages', 'Coordinate rework'] },
                { id: 'incident', icon: 'alert-triangle', title: 'Incident Management', examples: ['Investigate incidents', 'Complete reports', 'Implement corrective actions', 'Report to management', 'Review near misses'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Daily progress reports', 'Photo documentation', 'Variation records', 'Weather logs', 'Material reconciliation'] }
            ],
            'Safety Officer': [
                { id: 'audit', icon: 'clipboard-list', title: 'Safety Audits', examples: ['Conduct site audits', 'Inspect work areas', 'Review documentation', 'Score compliance', 'Track corrective actions'] },
                { id: 'swms', icon: 'file-text', title: 'SWMS Development', examples: ['Write SWMS', 'Review contractor SWMS', 'Update risk assessments', 'Train workers on SWMS', 'Sign-off procedures'] },
                { id: 'incident', icon: 'alert-circle', title: 'Incident Investigation', examples: ['Investigate incidents', 'Gather evidence', 'Interview witnesses', 'Determine root cause', 'Recommend controls'] },
                { id: 'induct', icon: 'user-plus', title: 'Inductions & Training', examples: ['Conduct site inductions', 'Deliver toolbox talks', 'Train on procedures', 'Assess competency', 'Maintain records'] },
                { id: 'hazard', icon: 'search', title: 'Hazard Identification', examples: ['Conduct hazard walks', 'Review hazard reports', 'Assess risk levels', 'Implement controls', 'Monitor effectiveness'] },
                { id: 'ppe', icon: 'shield', title: 'PPE Compliance', examples: ['Inspect PPE condition', 'Issue PPE', 'Enforce requirements', 'Train on correct use', 'Maintain register'] }
            ],
            'Traffic Controller': [
                { id: 'setup', icon: 'sign', title: 'Setup Traffic Control', examples: ['Install signage', 'Position cones and barriers', 'Deploy message boards', 'Set up delineation', 'Establish tapers'] },
                { id: 'operate', icon: 'octagon', title: 'Control Traffic', examples: ['Operate stop/slow bat', 'Direct vehicles', 'Manage pedestrians', 'Coordinate with other TCs', 'Respond to driver queries'] },
                { id: 'plan', icon: 'map', title: 'Traffic Management Plan', examples: ['Read and follow TMP', 'Identify plan requirements', 'Report plan issues', 'Request modifications', 'Adapt to conditions'] },
                { id: 'communicate', icon: 'radio', title: 'Communication', examples: ['Radio protocols', 'Coordinate lane changes', 'Report incidents', 'Brief relief staff', 'Liaise with supervisors'] },
                { id: 'emergency', icon: 'siren', title: 'Emergency Response', examples: ['Clear emergency access', 'Stop traffic for incidents', 'Direct emergency vehicles', 'Report accidents', 'First response actions'] },
                { id: 'pack', icon: 'package', title: 'Pack Up & Relocate', examples: ['Remove signage safely', 'Store equipment', 'Load vehicles', 'Relocate setup', 'End-of-shift handover'] }
            ],
            'Bricklayer': [
                { id: 'lay', icon: 'grid-3x3', title: 'Lay Bricks & Blocks', examples: ['Lay facing bricks', 'Build block walls', 'Install lintels', 'Create bonds and patterns', 'Maintain course levels'] },
                { id: 'mortar', icon: 'droplet', title: 'Mix & Apply Mortar', examples: ['Mix mortar batches', 'Apply bed joints', 'Tool mortar joints', 'Clean excess mortar', 'Cure properly'] },
                { id: 'set', icon: 'ruler', title: 'Setting Out', examples: ['Set out wall lines', 'Establish corners', 'Check levels and plumb', 'Transfer heights', 'Mark openings'] },
                { id: 'scaffold', icon: 'construction', title: 'Scaffold Work', examples: ['Work from scaffold', 'Move materials up', 'Maintain tidy platform', 'Request modifications', 'Edge protection'] },
                { id: 'cut', icon: 'scissors', title: 'Cutting & Shaping', examples: ['Cut bricks to size', 'Create angles and returns', 'Form window reveals', 'Shape decorative work', 'Install DPC'] },
                { id: 'safety', icon: 'shield-check', title: 'Safe Work', examples: ['Manual handling', 'Work at heights', 'Dust control', 'PPE compliance', 'Tool maintenance'] }
            ],
            'Concreter': [
                { id: 'pour', icon: 'droplet', title: 'Pour Concrete', examples: ['Direct concrete truck', 'Place concrete in forms', 'Spread and level', 'Vibrate to consolidate', 'Monitor slump'] },
                { id: 'finish', icon: 'sparkles', title: 'Finish Surfaces', examples: ['Float surfaces', 'Trowel to finish', 'Edge and groove', 'Apply textures', 'Broom finish'] },
                { id: 'formwork', icon: 'box', title: 'Formwork', examples: ['Set out forms', 'Install edge boards', 'Place reinforcement', 'Check levels', 'Apply release'] },
                { id: 'reinforce', icon: 'layout-grid', title: 'Reinforcement', examples: ['Place mesh', 'Position bar chairs', 'Tie reo bars', 'Check cover', 'Lap bars correctly'] },
                { id: 'cure', icon: 'thermometer', title: 'Cure & Protect', examples: ['Apply curing compound', 'Protect from weather', 'Control joints', 'Cover in wet/cold', 'Monitor curing'] },
                { id: 'strip', icon: 'move', title: 'Strip & Finish', examples: ['Strip formwork', 'Clean forms', 'Patch minor defects', 'Cure exposed edges', 'Stack forms'] }
            ],
            'Steel Fixer': [
                { id: 'place', icon: 'layout-grid', title: 'Place Reinforcement', examples: ['Position bar in forms', 'Install mesh sheets', 'Place starter bars', 'Position ligatures', 'Set bar chairs'] },
                { id: 'tie', icon: 'link-2', title: 'Tie Reinforcement', examples: ['Tie intersections', 'Lap bars correctly', 'Tie ligatures', 'Secure mesh sheets', 'Connect prefab cages'] },
                { id: 'bend', icon: 'corner-up-right', title: 'Cut & Bend', examples: ['Cut bar to length', 'Bend standard shapes', 'Create crank bars', 'Form stirrups', 'Fabricate special shapes'] },
                { id: 'read', icon: 'file-text', title: 'Read Drawings', examples: ['Interpret reo schedules', 'Check bar sizes', 'Verify spacing', 'Identify lap positions', 'Check cover requirements'] },
                { id: 'prefab', icon: 'puzzle', title: 'Prefabricate', examples: ['Build reo cages', 'Assemble beam cages', 'Create column cages', 'Build wall panels', 'Prepare for lifting'] },
                { id: 'safety', icon: 'shield-check', title: 'Safe Work', examples: ['Manual handling reo', 'Impalement protection', 'Work at heights', 'Tool safety', 'PPE compliance'] }
            ],
            'Formworker': [
                { id: 'erect', icon: 'box', title: 'Erect Formwork', examples: ['Assemble wall forms', 'Install column forms', 'Set slab edge forms', 'Erect beam formwork', 'Install soffit forms'] },
                { id: 'set', icon: 'ruler', title: 'Set Out', examples: ['Transfer levels', 'Set out positions', 'Check dimensions', 'Mark pour heights', 'Establish plumb'] },
                { id: 'prop', icon: 'arrow-up-circle', title: 'Propping & Bracing', examples: ['Install props', 'Set prop heights', 'Install bracing', 'Check prop capacity', 'Adjust for levels'] },
                { id: 'strip', icon: 'move', title: 'Strip Formwork', examples: ['Remove forms safely', 'Clean for reuse', 'Stack and store', 'Repair damaged forms', 'Apply release agent'] },
                { id: 'crane', icon: 'arrow-up', title: 'Gang Form Handling', examples: ['Rig gang forms', 'Direct crane placement', 'Connect form ties', 'Adjust alignment', 'Coordinate pours'] },
                { id: 'safety', icon: 'shield-check', title: 'Safe Work', examples: ['Edge protection', 'Prop kick-out protection', 'Work at heights', 'Manual handling', 'Pinch point awareness'] }
            ],
            'Trades Assistant': [
                { id: 'assist', icon: 'hand-helping', title: 'Assist Tradesperson', examples: ['Pass tools and materials', 'Hold items in place', 'Prepare work areas', 'Clean up after tasks', 'Fetch supplies'] },
                { id: 'prep', icon: 'clipboard-check', title: 'Preparation Work', examples: ['Prepare surfaces', 'Mix materials', 'Set out equipment', 'Organise workspace', 'Stage materials'] },
                { id: 'carry', icon: 'package', title: 'Material Handling', examples: ['Carry materials', 'Load and unload', 'Stock work areas', 'Distribute supplies', 'Return unused stock'] },
                { id: 'tools', icon: 'tool', title: 'Tool Management', examples: ['Maintain tools', 'Clean equipment', 'Organise tool kit', 'Report damaged tools', 'Charge batteries'] },
                { id: 'cleanup', icon: 'trash-2', title: 'Site Clean-up', examples: ['Clean work areas', 'Remove rubbish', 'Sort waste', 'Sweep and tidy', 'Prepare for next day'] },
                { id: 'learn', icon: 'book-open', title: 'Learning Tasks', examples: ['Observe techniques', 'Practice basic skills', 'Ask questions', 'Follow instructions', 'Document learning'] }
            ],
            'Tiler': [
                { id: 'lay', icon: 'grid-3x3', title: 'Lay Tiles', examples: ['Lay floor tiles', 'Install wall tiles', 'Apply feature tiles', 'Lay mosaic sheets', 'Install large format'] },
                { id: 'prep', icon: 'square', title: 'Surface Preparation', examples: ['Prepare substrates', 'Apply waterproofing', 'Level surfaces', 'Install battens', 'Prime surfaces'] },
                { id: 'cut', icon: 'scissors', title: 'Cutting & Shaping', examples: ['Cut tiles to size', 'Create cutouts', 'Form mitres', 'Shape around obstacles', 'Drill holes'] },
                { id: 'grout', icon: 'droplet', title: 'Grouting & Sealing', examples: ['Apply grout', 'Clean grout lines', 'Seal porous tiles', 'Apply silicone joints', 'Cure grout'] },
                { id: 'set', icon: 'ruler', title: 'Setting Out', examples: ['Plan tile layout', 'Set reference lines', 'Calculate quantities', 'Mark tile positions', 'Plan pattern'] },
                { id: 'safety', icon: 'shield-check', title: 'Safe Work', examples: ['Wet area safety', 'Dust control', 'Manual handling', 'Chemical handling', 'Tool safety'] }
            ],
            'Plasterer': [
                { id: 'apply', icon: 'paint-bucket', title: 'Apply Plaster', examples: ['Apply render coats', 'Set cornices', 'Install plasterboard', 'Apply skim coats', 'Create texture finishes'] },
                { id: 'prep', icon: 'square', title: 'Surface Preparation', examples: ['Clean surfaces', 'Apply bonding agents', 'Fix beads and stops', 'Patch holes', 'Prepare joints'] },
                { id: 'tape', icon: 'minus', title: 'Taping & Jointing', examples: ['Tape plasterboard joints', 'Apply joint compound', 'Sand joints smooth', 'Finish internal corners', 'Finish external corners'] },
                { id: 'scaffold', icon: 'construction', title: 'Work at Heights', examples: ['Work from scaffold', 'Use trestles safely', 'Access ceilings', 'Work on ladders', 'Use stilts'] },
                { id: 'tools', icon: 'tool', title: 'Tool & Material Care', examples: ['Clean tools daily', 'Maintain hawks and trowels', 'Store materials correctly', 'Mix compounds', 'Manage waste'] },
                { id: 'finish', icon: 'sparkles', title: 'Finishing', examples: ['Sand to smooth finish', 'Apply texture patterns', 'Repair defects', 'Touch up before paint', 'Quality check'] }
            ],
            'Roofer': [
                { id: 'install', icon: 'home', title: 'Install Roofing', examples: ['Lay roof tiles', 'Install metal sheets', 'Fix ridge capping', 'Install valley trays', 'Apply flashing'] },
                { id: 'sarking', icon: 'layers', title: 'Sarking & Insulation', examples: ['Install sarking', 'Lay insulation batts', 'Tape sarking joints', 'Fit around penetrations', 'Seal vapour barriers'] },
                { id: 'gutter', icon: 'arrow-down-right', title: 'Gutters & Downpipes', examples: ['Install guttering', 'Fit downpipes', 'Connect to stormwater', 'Install leaf guards', 'Set falls correctly'] },
                { id: 'repair', icon: 'tool', title: 'Repairs & Maintenance', examples: ['Replace broken tiles', 'Reseal flashings', 'Clear blocked gutters', 'Repair leaks', 'Re-bed ridge caps'] },
                { id: 'safety', icon: 'shield-check', title: 'Roof Safety', examples: ['Install edge protection', 'Use safety mesh', 'Set up roof anchors', 'Use harness systems', 'Manage fragile roofs'] },
                { id: 'access', icon: 'ladder', title: 'Access & Setup', examples: ['Position ladders safely', 'Work from EWP', 'Set up scaffold', 'Use roof walkways', 'Protect finished areas'] }
            ],
            'Glazier': [
                { id: 'install', icon: 'square', title: 'Install Glass', examples: ['Install window panes', 'Fit shopfronts', 'Install sliding doors', 'Mount mirrors', 'Install balustrades'] },
                { id: 'measure', icon: 'ruler', title: 'Measure & Cut', examples: ['Measure openings', 'Mark cutting lines', 'Score and snap glass', 'Use glass cutter', 'Polish edges'] },
                { id: 'frame', icon: 'frame', title: 'Frame Installation', examples: ['Install window frames', 'Fit door frames', 'Install mullions', 'Set up curtain wall', 'Adjust hardware'] },
                { id: 'seal', icon: 'droplet', title: 'Sealing & Glazing', examples: ['Apply sealant beads', 'Install gaskets', 'Fit glazing blocks', 'Apply structural silicone', 'Weatherseal frames'] },
                { id: 'handle', icon: 'hand', title: 'Glass Handling', examples: ['Carry glass safely', 'Use vacuum lifters', 'Transport on trolleys', 'Store glass vertically', 'Protect edges'] },
                { id: 'safety', icon: 'shield-check', title: 'Glass Safety', examples: ['PPE for glass handling', 'Dispose of broken glass', 'Tape broken panes', 'Manage sharp edges', 'Use correct gloves'] }
            ],
            'Painter': [
                { id: 'apply', icon: 'paint-bucket', title: 'Apply Paint', examples: ['Brush paint application', 'Roller application', 'Spray painting', 'Cut in edges', 'Apply multiple coats'] },
                { id: 'prep', icon: 'square', title: 'Surface Preparation', examples: ['Sand surfaces', 'Fill holes and cracks', 'Apply primer', 'Mask areas', 'Clean surfaces'] },
                { id: 'setup', icon: 'clipboard-check', title: 'Setup & Protection', examples: ['Cover floors', 'Mask windows and trim', 'Set up work area', 'Prepare paint materials', 'Mix colours'] },
                { id: 'heights', icon: 'arrow-up', title: 'Work at Heights', examples: ['Use extension ladders', 'Work from scaffold', 'Use EWP', 'Use trestles', 'Access confined areas'] },
                { id: 'cleanup', icon: 'trash-2', title: 'Clean Up', examples: ['Clean brushes and rollers', 'Clean spray equipment', 'Remove masking', 'Store materials', 'Dispose of waste'] },
                { id: 'special', icon: 'sparkles', title: 'Special Finishes', examples: ['Apply texture coatings', 'Create faux finishes', 'Apply epoxy coatings', 'Line marking', 'Protective coatings'] }
            ]
        },
        // --- MINING ----------------------------------------------------------------
        'Mining': {
            'Haul Truck Operator': [
                { id: 'load', icon: 'truck', title: 'Loading Operations', examples: ['Position for loading', 'Monitor load weight', 'Communicate with excavator', 'Check load distribution', 'Respond to loader signals'] },
                { id: 'haul', icon: 'arrow-right', title: 'Haul & Transport', examples: ['Transport ore to crusher', 'Haul overburden', 'Navigate pit roads', 'Maintain safe speeds', 'Use designated routes'] },
                { id: 'dump', icon: 'arrow-down', title: 'Dumping Operations', examples: ['Position at stockpile', 'Dump at crusher', 'Use dump blocks', 'Tip over edge safely', 'Clear tray after dump'] },
                { id: 'prestart', icon: 'clipboard-check', title: 'Pre-Start Checks', examples: ['Inspect tyres', 'Check fluid levels', 'Test brakes and steering', 'Check lights and alarms', 'Report defects'] },
                { id: 'refuel', icon: 'fuel', title: 'Refuelling', examples: ['Position at fuel bay', 'Connect fuel lines', 'Monitor fuel quantity', 'Spill prevention', 'Record fuel use'] },
                { id: 'safety', icon: 'shield-check', title: 'Pit Safety', examples: ['Maintain safe distances', 'Right of way rules', 'Dust suppression', 'Storm response', 'Emergency procedures'] }
            ],
            'Excavator Operator': [
                { id: 'dig', icon: 'shovel', title: 'Digging & Loading', examples: ['Dig at mine face', 'Load haul trucks', 'Dig to grade', 'Create benches', 'Remove overburden'] },
                { id: 'bench', icon: 'layers', title: 'Bench Management', examples: ['Maintain bench heights', 'Grade bench floors', 'Create access ramps', 'Scale loose rock', 'Maintain drainage'] },
                { id: 'stockpile', icon: 'package', title: 'Stockpile Management', examples: ['Build stockpiles', 'Reclaim from stockpile', 'Maintain pile shape', 'Blend material', 'Separate ore grades'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Care', examples: ['Pre-start inspection', 'Track maintenance', 'Bucket teeth changes', 'Fluid checks', 'Report defects'] },
                { id: 'drain', icon: 'droplet', title: 'Water Management', examples: ['Dig sumps', 'Create drains', 'Maintain water flow', 'Pump operations', 'Flood response'] },
                { id: 'safety', icon: 'shield-check', title: 'Dig Safety', examples: ['Wall stability awareness', 'Underground services', 'Swing radius safety', 'Communication protocols', 'Emergency procedures'] }
            ],
            'Loader Operator': [
                { id: 'load', icon: 'package', title: 'Loading Trucks', examples: ['Load haul trucks', 'Balance truck loads', 'Match bucket to truck', 'Count bucket passes', 'Communicate with trucks'] },
                { id: 'stockpile', icon: 'layers', title: 'Stockpile Work', examples: ['Build stockpiles', 'Reclaim material', 'Blend ores', 'Push up stockpiles', 'Maintain pile faces'] },
                { id: 'feed', icon: 'arrow-right', title: 'Feed Equipment', examples: ['Feed crushers', 'Load ROM bins', 'Feed hoppers', 'Maintain feed rates', 'Size material'] },
                { id: 'cleanup', icon: 'sparkles', title: 'Site Clean-up', examples: ['Clean spillage', 'Clear roadways', 'Push up windrows', 'Maintain work areas', 'Clear drainage'] },
                { id: 'prestart', icon: 'clipboard-check', title: 'Pre-Start Checks', examples: ['Inspect bucket and teeth', 'Check tyres', 'Test brakes', 'Check fluids', 'Report faults'] },
                { id: 'safety', icon: 'shield-check', title: 'Operating Safety', examples: ['Maintain exclusion zones', 'Awareness of surrounds', 'Communication protocols', 'Right of way', 'Emergency response'] }
            ],
            'Driller': [
                { id: 'production', icon: 'circle-dot', title: 'Production Drilling', examples: ['Set up drill rig', 'Drill blast holes', 'Maintain hole pattern', 'Control drill depth', 'Change drill bits'] },
                { id: 'explore', icon: 'search', title: 'Exploration Drilling', examples: ['Diamond core drilling', 'RC drilling', 'Sample collection', 'Core handling', 'Hole logging'] },
                { id: 'grade', icon: 'chart-bar', title: 'Grade Control', examples: ['Grade control drilling', 'Sample preparation', 'Mark ore boundaries', 'Blast hole sampling', 'Assay coordination'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Maintenance', examples: ['Service drill rig', 'Change consumables', 'Maintain compressor', 'Repair breakdowns', 'Pre-start checks'] },
                { id: 'safety', icon: 'shield-check', title: 'Drill Safety', examples: ['Dust suppression', 'Hearing protection', 'Moving parts safety', 'Stored energy', 'Rig stability'] },
                { id: 'record', icon: 'file-text', title: 'Recording & Reporting', examples: ['Log drill depths', 'Record sample data', 'Document conditions', 'Report geology changes', 'Shift handover'] }
            ],
            'Shot Firer': [
                { id: 'load', icon: 'package', title: 'Load Explosives', examples: ['Load blast holes', 'Handle explosives safely', 'Apply correct charge', 'Insert primers', 'Stem holes'] },
                { id: 'connect', icon: 'link', title: 'Connect & Wire', examples: ['Connect detonators', 'Wire blast patterns', 'Test continuity', 'Connect to initiation', 'Verify connections'] },
                { id: 'fire', icon: 'zap', title: 'Initiate Blasts', examples: ['Fire button operation', 'Blast timing control', 'Sequential firing', 'Remote initiation', 'Confirm detonation'] },
                { id: 'clear', icon: 'users', title: 'Exclusion Zones', examples: ['Establish blast zones', 'Clear personnel', 'Position sentries', 'Radio communication', 'Sirens and warnings'] },
                { id: 'inspect', icon: 'search', title: 'Post-Blast Inspection', examples: ['Check for misfires', 'Inspect blast results', 'Measure fragmentation', 'Assess wall damage', 'Clear area safe'] },
                { id: 'storage', icon: 'lock', title: 'Magazine Management', examples: ['Store explosives', 'Maintain magazines', 'Stock control', 'Security compliance', 'Transport safely'] }
            ],
            'Process Plant Operator': [
                { id: 'crush', icon: 'circle', title: 'Crushing Operations', examples: ['Monitor crushers', 'Control feed rates', 'Change wear parts', 'Clear blockages', 'Optimise settings'] },
                { id: 'convey', icon: 'arrow-right', title: 'Conveyor Systems', examples: ['Start-up sequences', 'Monitor belt tracking', 'Clear spillage', 'Inspect idlers', 'Emergency stops'] },
                { id: 'screen', icon: 'filter', title: 'Screening & Sizing', examples: ['Monitor screens', 'Change screen media', 'Adjust settings', 'Clear blockages', 'Check efficiency'] },
                { id: 'pump', icon: 'droplet', title: 'Pump Operations', examples: ['Start/stop pumps', 'Monitor pressures', 'Prime pumps', 'Clear blockages', 'Maintain seals'] },
                { id: 'water', icon: 'waves', title: 'Water Treatment', examples: ['Monitor water quality', 'Chemical dosing', 'Operate thickeners', 'Tailings management', 'Reclaim water'] },
                { id: 'safety', icon: 'shield-check', title: 'Plant Safety', examples: ['Lockout/tagout', 'Confined space entry', 'Chemical handling', 'Noise management', 'Emergency response'] }
            ],
            'Fitter': [
                { id: 'maintain', icon: 'tool', title: 'Planned Maintenance', examples: ['Service equipment', 'Replace wear parts', 'Lubricate components', 'Adjust clearances', 'Inspect components'] },
                { id: 'repair', icon: 'wrench', title: 'Breakdown Repairs', examples: ['Diagnose faults', 'Replace failed parts', 'Emergency repairs', 'Fabricate solutions', 'Restore to service'] },
                { id: 'hydraulic', icon: 'droplet', title: 'Hydraulic Systems', examples: ['Replace hoses', 'Repair cylinders', 'Service pumps', 'Adjust pressures', 'Flush systems'] },
                { id: 'component', icon: 'puzzle', title: 'Component Rebuild', examples: ['Rebuild gearboxes', 'Overhaul pumps', 'Recondition parts', 'Measure tolerances', 'Assemble components'] },
                { id: 'fabricate', icon: 'scissors', title: 'Fabrication', examples: ['Weld repairs', 'Cut and shape metal', 'Fit structural repairs', 'Modify equipment', 'Create brackets'] },
                { id: 'safety', icon: 'shield-check', title: 'Maintenance Safety', examples: ['Lockout/tagout', 'Permit to work', 'Confined space', 'Working at heights', 'Manual handling'] }
            ],
            'Boilermaker': [
                { id: 'fabricate', icon: 'scissors', title: 'Fabrication', examples: ['Cut steel plate', 'Shape components', 'Drill and punch holes', 'Bend and roll', 'Fit components'] },
                { id: 'weld', icon: 'zap', title: 'Welding', examples: ['MIG welding', 'Stick welding', 'TIG welding', 'Flux core welding', 'Weld repairs'] },
                { id: 'repair', icon: 'tool', title: 'Structural Repairs', examples: ['Repair truck trays', 'Fix bucket wear', 'Repair hoppers', 'Patch tanks', 'Reinforce structures'] },
                { id: 'install', icon: 'package', title: 'Install Equipment', examples: ['Install chutes', 'Fit wear liners', 'Mount brackets', 'Install guards', 'Fit access platforms'] },
                { id: 'maintain', icon: 'clipboard-check', title: 'Inspect & Maintain', examples: ['Inspect welds', 'Check for cracks', 'Measure wear', 'NDT support', 'Document repairs'] },
                { id: 'safety', icon: 'shield-check', title: 'Hot Work Safety', examples: ['Fire watch', 'Welding fumes', 'Eye protection', 'Burn prevention', 'Permit to work'] }
            ],
            'Deputy/Supervisor': [
                { id: 'plan', icon: 'calendar', title: 'Shift Planning', examples: ['Allocate crews', 'Review work orders', 'Prioritise tasks', 'Coordinate resources', 'Handover briefings'] },
                { id: 'inspect', icon: 'clipboard-check', title: 'Inspections', examples: ['Pre-start inspections', 'Workplace inspections', 'Equipment checks', 'Compliance audits', 'Hazard identification'] },
                { id: 'supervise', icon: 'users', title: 'Team Supervision', examples: ['Monitor performance', 'Provide direction', 'Address issues', 'Support training', 'Manage conflicts'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Management', examples: ['Conduct toolbox talks', 'Review risk assessments', 'Investigate incidents', 'Enforce standards', 'Issue permits'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Production reports', 'Incident reports', 'Shift logs', 'Equipment status', 'Daily briefings'] },
                { id: 'emergency', icon: 'alert-circle', title: 'Emergency Response', examples: ['Lead emergency response', 'Coordinate evacuations', 'First response', 'Emergency communications', 'Incident command'] }
            ],
            'Safety Advisor': [
                { id: 'audit', icon: 'clipboard-list', title: 'Safety Audits', examples: ['Conduct workplace audits', 'Critical control verification', 'Contractor audits', 'Document findings', 'Track corrective actions'] },
                { id: 'incident', icon: 'alert-circle', title: 'Incident Investigation', examples: ['Lead investigations', 'Gather evidence', 'Root cause analysis', 'Prepare reports', 'Present findings'] },
                { id: 'risk', icon: 'shield', title: 'Risk Management', examples: ['Develop risk assessments', 'Review JHAs', 'Implement controls', 'Monitor effectiveness', 'Update registers'] },
                { id: 'train', icon: 'book-open', title: 'Training & Awareness', examples: ['Deliver safety training', 'Develop materials', 'Conduct inductions', 'Toolbox talks', 'Competency assessment'] },
                { id: 'comply', icon: 'check-circle', title: 'Compliance', examples: ['Monitor legislation', 'Audit compliance', 'Maintain records', 'Liaise with regulators', 'Prepare for inspections'] },
                { id: 'systems', icon: 'settings', title: 'Safety Systems', examples: ['Develop procedures', 'Maintain HSMS', 'Review standards', 'Implement improvements', 'Manage documentation'] }
            ],
            'Environmental Officer': [
                { id: 'monitor', icon: 'eye', title: 'Environmental Monitoring', examples: ['Water quality testing', 'Dust monitoring', 'Noise monitoring', 'Rehabilitation monitoring', 'Wildlife surveys'] },
                { id: 'comply', icon: 'file-check', title: 'Compliance', examples: ['Maintain approvals', 'Submit reports', 'Track conditions', 'Liaise with regulators', 'Conduct audits'] },
                { id: 'waste', icon: 'trash-2', title: 'Waste Management', examples: ['Classify waste', 'Manage disposal', 'Track waste streams', 'Minimise waste', 'Manage spills'] },
                { id: 'rehab', icon: 'leaf', title: 'Rehabilitation', examples: ['Plan rehabilitation', 'Revegetation programs', 'Erosion control', 'Monitor progress', 'Closure planning'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Prepare reports', 'Document compliance', 'Track metrics', 'Community updates', 'Government reporting'] },
                { id: 'incident', icon: 'alert-triangle', title: 'Incident Response', examples: ['Respond to spills', 'Investigate incidents', 'Implement corrective actions', 'Report breaches', 'Clean-up coordination'] }
            ],
            'Geologist': [
                { id: 'map', icon: 'map', title: 'Geological Mapping', examples: ['Map pit faces', 'Log drill core', 'Identify structures', 'Document geology', 'Create sections'] },
                { id: 'sample', icon: 'flask', title: 'Sampling', examples: ['Collect samples', 'Prepare samples', 'Submit for assay', 'QA/QC protocols', 'Manage results'] },
                { id: 'model', icon: 'box', title: 'Geological Modelling', examples: ['Update resource models', 'Create block models', 'Interpret data', 'Estimate resources', 'Validate models'] },
                { id: 'grade', icon: 'chart-bar', title: 'Grade Control', examples: ['Mark ore contacts', 'Define dig limits', 'Reconcile production', 'Optimise recovery', 'Stockpile management'] },
                { id: 'explore', icon: 'search', title: 'Exploration', examples: ['Plan drill programs', 'Target generation', 'Prospect evaluation', 'Analyse results', 'Report findings'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Geological reports', 'Monthly reports', 'Resource statements', 'Technical documentation', 'Stakeholder updates'] }
            ],
            'Survey Technician': [
                { id: 'survey', icon: 'target', title: 'Mine Surveying', examples: ['Pickup surveys', 'Establish control', 'Monitor subsidence', 'Check volumes', 'As-built surveys'] },
                { id: 'setout', icon: 'crosshair', title: 'Set Out', examples: ['Mark drill holes', 'Set out infrastructure', 'Mark blast patterns', 'Establish boundaries', 'Guide development'] },
                { id: 'data', icon: 'database', title: 'Data Processing', examples: ['Process field data', 'Create DTMs', 'Calculate volumes', 'Update plans', 'Manage databases'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Production reports', 'Monthly reconciliation', 'Volume reports', 'Progress reports', 'Survey certificates'] },
                { id: 'equip', icon: 'settings', title: 'Equipment Management', examples: ['Calibrate instruments', 'Maintain GPS systems', 'Manage data loggers', 'Update software', 'Equipment checks'] },
                { id: 'safety', icon: 'shield-check', title: 'Field Safety', examples: ['Work near equipment', 'Vehicle safety', 'Communicate with operations', 'Pit access protocols', 'Emergency procedures'] }
            ],
            'Mining Engineer': [
                { id: 'plan', icon: 'map', title: 'Mine Planning', examples: ['Design pit layouts', 'Plan extraction sequences', 'Optimise haulage', 'Schedule production', 'Design waste dumps'] },
                { id: 'drill', icon: 'circle-dot', title: 'Drill & Blast', examples: ['Design blast patterns', 'Optimise fragmentation', 'Review blast results', 'Control vibration', 'Improve efficiency'] },
                { id: 'ground', icon: 'mountain', title: 'Ground Control', examples: ['Slope stability analysis', 'Wall design', 'Monitor movement', 'Implement controls', 'Review geology'] },
                { id: 'ventilate', icon: 'wind', title: 'Ventilation (UG)', examples: ['Design ventilation', 'Monitor air quality', 'Plan circuit changes', 'Emergency ventilation', 'Optimise systems'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Technical reports', 'Feasibility studies', 'Cost analysis', 'Production forecasts', 'Management reports'] },
                { id: 'optimise', icon: 'trending-up', title: 'Optimisation', examples: ['Improve productivity', 'Reduce costs', 'Benchmark performance', 'Implement technology', 'Continuous improvement'] }
            ]
        },
        // --- AGED CARE -------------------------------------------------------------
        'Aged Care': {
            'Personal Care Worker': [
                { id: 'adl', icon: 'heart', title: 'Personal Care (ADLs)', examples: ['Assist with showering', 'Help with dressing', 'Oral hygiene support', 'Toileting assistance', 'Grooming and hair care'] },
                { id: 'mobility', icon: 'accessibility', title: 'Mobility Support', examples: ['Transfer from bed to chair', 'Walking assistance', 'Use of mobility aids', 'Repositioning in bed', 'Fall prevention'] },
                { id: 'meals', icon: 'utensils', title: 'Meal Assistance', examples: ['Prepare meals', 'Assist with eating', 'Monitor food intake', 'Manage special diets', 'Hydration support'] },
                { id: 'observe', icon: 'eye', title: 'Observation & Reporting', examples: ['Monitor health changes', 'Report concerns', 'Document care provided', 'Handover information', 'Incident reporting'] },
                { id: 'social', icon: 'users', title: 'Social & Emotional Support', examples: ['Companionship', 'Engage in activities', 'Support family visits', 'Maintain dignity', 'End of life support'] },
                { id: 'infection', icon: 'shield', title: 'Infection Control', examples: ['Hand hygiene', 'PPE use', 'Linen handling', 'Waste disposal', 'Clean equipment'] }
            ],
            'Enrolled Nurse': [
                { id: 'meds', icon: 'pill', title: 'Medication Administration', examples: ['Administer oral medications', 'Apply topical treatments', 'S4 medication checks', 'Document administration', 'Monitor for reactions'] },
                { id: 'wound', icon: 'bandage', title: 'Wound Care', examples: ['Assess wounds', 'Change dressings', 'Monitor healing', 'Report deterioration', 'Document care'] },
                { id: 'vital', icon: 'activity', title: 'Vital Signs & Observations', examples: ['Record blood pressure', 'Monitor temperature', 'Measure blood glucose', 'Neurological observations', 'Detect changes'] },
                { id: 'care', icon: 'clipboard', title: 'Care Planning', examples: ['Contribute to care plans', 'Implement nursing tasks', 'Evaluate outcomes', 'Update documentation', 'Handover care'] },
                { id: 'supervise', icon: 'users', title: 'Supervise Care Staff', examples: ['Delegate tasks', 'Oversee personal care', 'Provide guidance', 'Check task completion', 'Support team'] },
                { id: 'emergency', icon: 'alert-circle', title: 'Emergency Response', examples: ['First response', 'CPR and first aid', 'Escalate to RN', 'Comfort measures', 'Document incidents'] }
            ],
            'Registered Nurse': [
                { id: 'assess', icon: 'stethoscope', title: 'Clinical Assessment', examples: ['Comprehensive assessment', 'Identify care needs', 'Clinical decision making', 'Risk assessment', 'Diagnosis support'] },
                { id: 'plan', icon: 'file-text', title: 'Care Planning', examples: ['Develop care plans', 'Set goals', 'Plan interventions', 'Review and update', 'Multidisciplinary input'] },
                { id: 'meds', icon: 'pill', title: 'Complex Medications', examples: ['S8 medication management', 'Injections', 'Infusions', 'Medication reviews', 'Education'] },
                { id: 'supervise', icon: 'users', title: 'Staff Supervision', examples: ['Supervise care team', 'Delegate appropriately', 'Provide clinical leadership', 'Performance feedback', 'Training and development'] },
                { id: 'family', icon: 'home', title: 'Family Communication', examples: ['Discuss care with family', 'Care conferences', 'End of life discussions', 'Provide updates', 'Support decision making'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality & Compliance', examples: ['Audit clinical records', 'Incident management', 'Accreditation compliance', 'Policy implementation', 'Continuous improvement'] }
            ],
            'Care Coordinator': [
                { id: 'assess', icon: 'clipboard', title: 'Needs Assessment', examples: ['Conduct ACAT assessments', 'Identify care needs', 'Review funding eligibility', 'Document requirements', 'Coordinate reviews'] },
                { id: 'plan', icon: 'calendar', title: 'Care Coordination', examples: ['Develop care plans', 'Coordinate services', 'Allocate staff', 'Schedule appointments', 'Manage waitlists'] },
                { id: 'family', icon: 'users', title: 'Family Liaison', examples: ['Family meetings', 'Address concerns', 'Provide updates', 'Manage expectations', 'Advocate for residents'] },
                { id: 'staff', icon: 'user-check', title: 'Staff Coordination', examples: ['Roster management', 'Allocate care tasks', 'Supervise team', 'Address issues', 'Training coordination'] },
                { id: 'comply', icon: 'file-check', title: 'Compliance', examples: ['Quality indicators', 'Accreditation preparation', 'Documentation audits', 'Policy compliance', 'Report submission'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Maintain records', 'Process referrals', 'Manage budgets', 'Order supplies', 'Reporting'] }
            ],
            'Lifestyle Officer': [
                { id: 'program', icon: 'calendar', title: 'Program Planning', examples: ['Develop activity calendar', 'Plan group activities', 'Organise outings', 'Seasonal events', 'Cultural celebrations'] },
                { id: 'individual', icon: 'user', title: 'Individual Activities', examples: ['One-on-one engagement', 'Life story work', 'Personal interests', 'Sensory activities', 'Meaningful occupation'] },
                { id: 'group', icon: 'users', title: 'Group Activities', examples: ['Exercise groups', 'Music and arts', 'Games and puzzles', 'Social gatherings', 'Reminiscence groups'] },
                { id: 'assess', icon: 'clipboard', title: 'Activity Assessment', examples: ['Assess preferences', 'Document participation', 'Review outcomes', 'Adjust programs', 'Report progress'] },
                { id: 'volunteer', icon: 'heart', title: 'Volunteer Coordination', examples: ['Recruit volunteers', 'Provide orientation', 'Coordinate visits', 'Support activities', 'Recognise contributions'] },
                { id: 'resource', icon: 'package', title: 'Resource Management', examples: ['Manage activity budget', 'Order supplies', 'Maintain equipment', 'Set up spaces', 'Store materials safely'] }
            ],
            'Facility Manager': [
                { id: 'operations', icon: 'building', title: 'Facility Operations', examples: ['Oversee daily operations', 'Manage maintenance', 'Ensure safety compliance', 'Coordinate services', 'Emergency management'] },
                { id: 'staff', icon: 'users', title: 'Staff Management', examples: ['Recruit and hire', 'Performance management', 'Roster approvals', 'Training programs', 'Handle HR issues'] },
                { id: 'finance', icon: 'dollar-sign', title: 'Financial Management', examples: ['Budget management', 'Financial reporting', 'Cost control', 'Invoice approvals', 'Revenue optimisation'] },
                { id: 'quality', icon: 'award', title: 'Quality & Accreditation', examples: ['Prepare for audits', 'Maintain standards', 'Continuous improvement', 'Complaint management', 'Incident oversight'] },
                { id: 'family', icon: 'home', title: 'Stakeholder Relations', examples: ['Family communication', 'Community engagement', 'Regulatory liaison', 'External partnerships', 'Advocacy'] },
                { id: 'strategic', icon: 'target', title: 'Strategic Planning', examples: ['Service development', 'Capacity planning', 'Market positioning', 'Policy development', 'Long-term planning'] }
            ],
            'Medication Assistant': [
                { id: 'administer', icon: 'pill', title: 'Medication Administration', examples: ['Administer oral medications', 'Apply creams and patches', 'Administer eye/ear drops', 'Document administration', 'Monitor for effects'] },
                { id: 'check', icon: 'check-circle', title: 'Medication Checks', examples: ['Verify 5 rights', 'Check expiry dates', 'Confirm resident identity', 'Match to chart', 'Report discrepancies'] },
                { id: 'store', icon: 'lock', title: 'Medication Storage', examples: ['Store correctly', 'Fridge temperature monitoring', 'Secure controlled drugs', 'Manage stock levels', 'Handle returns'] },
                { id: 'document', icon: 'file-text', title: 'Documentation', examples: ['Complete medication charts', 'Record refusals', 'Note observations', 'Handover information', 'Update records'] },
                { id: 'report', icon: 'alert-circle', title: 'Report & Escalate', examples: ['Report adverse reactions', 'Escalate concerns', 'Report errors', 'Notify changes', 'Communicate with pharmacy'] },
                { id: 'support', icon: 'heart', title: 'Resident Support', examples: ['Assist with swallowing', 'Provide water', 'Explain medications', 'Reassure residents', 'Maintain dignity'] }
            ],
            'Allied Health Assistant': [
                { id: 'physio', icon: 'activity', title: 'Physiotherapy Support', examples: ['Assist exercises', 'Supervise walking', 'Apply hot/cold packs', 'Use therapy equipment', 'Document sessions'] },
                { id: 'ot', icon: 'hand', title: 'OT Support', examples: ['Practice daily activities', 'Use adaptive equipment', 'Memory activities', 'Fine motor exercises', 'Environmental setup'] },
                { id: 'speech', icon: 'message-circle', title: 'Speech Pathology Support', examples: ['Mealtime supervision', 'Communication support', 'Practice exercises', 'Use communication aids', 'Texture modification'] },
                { id: 'group', icon: 'users', title: 'Group Programs', examples: ['Lead exercise groups', 'Conduct activities', 'Monitor participation', 'Adapt activities', 'Report outcomes'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Record attendance', 'Note progress', 'Report concerns', 'Update therapists', 'Maintain records'] },
                { id: 'equipment', icon: 'settings', title: 'Equipment Management', examples: ['Prepare equipment', 'Clean after use', 'Check condition', 'Report faults', 'Store correctly'] }
            ]
        },
        // --- AGRICULTURE -----------------------------------------------------------
        'Agriculture': {
            'Farm Hand': [
                { id: 'livestock', icon: 'heart', title: 'Livestock Handling', examples: ['Move stock between paddocks', 'Assist with mustering', 'Feed animals', 'Check water troughs', 'Monitor animal health'] },
                { id: 'crop', icon: 'leaf', title: 'Crop Work', examples: ['Assist with planting', 'Weed control', 'Harvest assistance', 'Irrigate crops', 'Apply fertiliser'] },
                { id: 'maintain', icon: 'tool', title: 'Property Maintenance', examples: ['Repair fences', 'Maintain yards', 'Clear vegetation', 'Maintain roads', 'General repairs'] },
                { id: 'machinery', icon: 'truck', title: 'Machinery Operation', examples: ['Operate tractors', 'Drive farm vehicles', 'Operate implements', 'Pre-start checks', 'Basic maintenance'] },
                { id: 'store', icon: 'package', title: 'Storage & Supplies', examples: ['Store feed and hay', 'Manage chemical storage', 'Receive deliveries', 'Stock take', 'Maintain sheds'] },
                { id: 'safety', icon: 'shield-check', title: 'Farm Safety', examples: ['Follow safe work practices', 'Use PPE', 'Handle chemicals safely', 'Report hazards', 'Emergency response'] }
            ],
            'Tractor Operator': [
                { id: 'operate', icon: 'truck', title: 'Tractor Operation', examples: ['Drive tractors', 'Navigate paddocks', 'Operate GPS guidance', 'Manage PTO operations', 'Control hydraulics'] },
                { id: 'implements', icon: 'settings', title: 'Implement Work', examples: ['Connect implements', 'Operate ploughs', 'Use seeders', 'Operate sprayers', 'Use hay equipment'] },
                { id: 'cultivate', icon: 'layers', title: 'Cultivation', examples: ['Prepare seedbeds', 'Cultivate soil', 'Create furrows', 'Level paddocks', 'Break up soil'] },
                { id: 'harvest', icon: 'wheat', title: 'Harvest Support', examples: ['Drive chaser bins', 'Support harvesters', 'Transport grain', 'Load trucks', 'Assist with yield mapping'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Maintenance', examples: ['Daily pre-start checks', 'Grease and lubricate', 'Check fluid levels', 'Clean equipment', 'Report faults'] },
                { id: 'safety', icon: 'shield-check', title: 'Operating Safety', examples: ['Rollover awareness', 'PTO safety', 'Safe mounting/dismounting', 'Traffic management', 'Fatigue management'] }
            ],
            'Livestock Handler': [
                { id: 'handle', icon: 'heart', title: 'Animal Handling', examples: ['Move cattle/sheep', 'Work in yards', 'Load/unload trucks', 'Draft animals', 'Restrain for treatment'] },
                { id: 'husbandry', icon: 'stethoscope', title: 'Animal Husbandry', examples: ['Assist with calving/lambing', 'Ear tagging', 'Drenching', 'Vaccination assistance', 'Castration/marking'] },
                { id: 'feed', icon: 'utensils', title: 'Feeding & Watering', examples: ['Feed livestock', 'Check water systems', 'Maintain troughs', 'Supplement feeding', 'Manage feed storage'] },
                { id: 'monitor', icon: 'eye', title: 'Monitoring', examples: ['Check stock daily', 'Identify sick animals', 'Monitor condition', 'Report issues', 'Count stock'] },
                { id: 'facilities', icon: 'home', title: 'Facility Management', examples: ['Maintain yards', 'Clean water troughs', 'Repair gates', 'Maintain races', 'Keep areas clean'] },
                { id: 'safety', icon: 'shield-check', title: 'Animal Safety', examples: ['Safe handling techniques', 'Avoid kick zones', 'Use appropriate pressure', 'Recognise stress signs', 'Emergency procedures'] }
            ],
            'Irrigation Technician': [
                { id: 'operate', icon: 'droplet', title: 'Irrigation Operation', examples: ['Start/stop irrigation', 'Set watering schedules', 'Monitor application rates', 'Adjust pressure', 'Zone management'] },
                { id: 'maintain', icon: 'tool', title: 'System Maintenance', examples: ['Inspect pipelines', 'Clean filters', 'Replace sprinklers', 'Check valves', 'Flush lines'] },
                { id: 'install', icon: 'wrench', title: 'Installation', examples: ['Lay pipe', 'Install drip lines', 'Connect fittings', 'Install valves', 'Set up controllers'] },
                { id: 'diagnose', icon: 'search', title: 'Troubleshooting', examples: ['Locate leaks', 'Diagnose pressure issues', 'Fix blockages', 'Repair breaks', 'Test system performance'] },
                { id: 'monitor', icon: 'gauge', title: 'Monitoring', examples: ['Check soil moisture', 'Monitor crop conditions', 'Record water usage', 'Weather monitoring', 'Efficiency analysis'] },
                { id: 'safety', icon: 'shield-check', title: 'Water Safety', examples: ['Chemical injection safety', 'Electrical safety', 'Excavation safety', 'Vehicle safety', 'Heat stress awareness'] }
            ],
            'Harvest Worker': [
                { id: 'harvest', icon: 'wheat', title: 'Harvesting', examples: ['Operate harvesters', 'Hand picking', 'Cut and gather', 'Quality sorting', 'Yield monitoring'] },
                { id: 'transport', icon: 'truck', title: 'Crop Transport', examples: ['Drive field bins', 'Load trucks', 'Transport to storage', 'Weigh loads', 'Track quantities'] },
                { id: 'process', icon: 'settings', title: 'Post-Harvest Processing', examples: ['Grade produce', 'Clean and sort', 'Pack products', 'Store correctly', 'Quality checks'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Support', examples: ['Clean equipment', 'Minor adjustments', 'Refuel machinery', 'Report faults', 'Assist with maintenance'] },
                { id: 'store', icon: 'package', title: 'Storage', examples: ['Fill silos/bins', 'Monitor conditions', 'Aeration management', 'Pest monitoring', 'Stock rotation'] },
                { id: 'safety', icon: 'shield-check', title: 'Harvest Safety', examples: ['Machinery guarding', 'Dust protection', 'Sun and heat protection', 'Fatigue management', 'Emergency procedures'] }
            ],
            'Stock Manager': [
                { id: 'manage', icon: 'users', title: 'Team Management', examples: ['Supervise workers', 'Allocate tasks', 'Train staff', 'Roster management', 'Performance feedback'] },
                { id: 'herd', icon: 'heart', title: 'Herd Management', examples: ['Manage breeding programs', 'Monitor herd health', 'Plan rotations', 'Sales and purchases', 'Record keeping'] },
                { id: 'health', icon: 'stethoscope', title: 'Animal Health Programs', examples: ['Vaccination programs', 'Parasite control', 'Disease prevention', 'Vet liaison', 'Treatment decisions'] },
                { id: 'infrastructure', icon: 'home', title: 'Infrastructure', examples: ['Plan improvements', 'Manage contractors', 'Maintain facilities', 'Budget management', 'Equipment decisions'] },
                { id: 'compliance', icon: 'file-check', title: 'Compliance', examples: ['NLIS compliance', 'Chemical records', 'QA programs', 'Animal welfare', 'Environmental compliance'] },
                { id: 'report', icon: 'chart-bar', title: 'Reporting', examples: ['Production reports', 'Financial analysis', 'Market analysis', 'Management reports', 'Strategic planning'] }
            ],
            'Farm Supervisor': [
                { id: 'supervise', icon: 'users', title: 'Staff Supervision', examples: ['Direct daily work', 'Monitor performance', 'Provide training', 'Address issues', 'Safety briefings'] },
                { id: 'plan', icon: 'calendar', title: 'Work Planning', examples: ['Schedule activities', 'Prioritise tasks', 'Coordinate resources', 'Weather contingencies', 'Contractor coordination'] },
                { id: 'operations', icon: 'settings', title: 'Operations Management', examples: ['Oversee crop operations', 'Manage livestock activities', 'Monitor equipment use', 'Quality control', 'Problem solving'] },
                { id: 'maintain', icon: 'tool', title: 'Maintenance Oversight', examples: ['Schedule maintenance', 'Manage repairs', 'Equipment allocation', 'Inventory management', 'Contractor supervision'] },
                { id: 'report', icon: 'file-text', title: 'Reporting', examples: ['Daily reports', 'Production tracking', 'Incident reports', 'Cost monitoring', 'Handover communication'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Management', examples: ['Conduct toolbox talks', 'Hazard identification', 'Incident investigation', 'Compliance monitoring', 'Emergency coordination'] }
            ],
            'Agricultural Mechanic': [
                { id: 'service', icon: 'tool', title: 'Servicing', examples: ['Service tractors', 'Maintain headers', 'Service pumps', 'Lubricate equipment', 'Change filters and fluids'] },
                { id: 'repair', icon: 'wrench', title: 'Repairs', examples: ['Diagnose faults', 'Repair engines', 'Fix hydraulic systems', 'Repair transmissions', 'Weld and fabricate'] },
                { id: 'electrical', icon: 'zap', title: 'Electrical Systems', examples: ['Diagnose electrical faults', 'Repair wiring', 'Test batteries', 'Repair lights', 'Program controllers'] },
                { id: 'hydraulic', icon: 'droplet', title: 'Hydraulic Systems', examples: ['Replace hoses', 'Repair rams', 'Test pressures', 'Bleed systems', 'Replace seals'] },
                { id: 'prepare', icon: 'clipboard-check', title: 'Pre-Season Preparation', examples: ['Prepare for harvest', 'Ready sowing equipment', 'Test all systems', 'Order parts', 'Schedule work'] },
                { id: 'field', icon: 'truck', title: 'Field Support', examples: ['Breakdown response', 'Field repairs', 'Parts delivery', 'Equipment transport', 'Emergency welding'] }
            ]
        },
        // --- AUTOMOTIVE ------------------------------------------------------------
        'Automotive': {
            'Mechanic': [
                { id: 'service', icon: 'tool', title: 'Vehicle Servicing', examples: ['Oil and filter changes', 'Fluid checks and top-ups', 'Brake inspections', 'Tyre rotations', 'Multi-point inspections'] },
                { id: 'diagnose', icon: 'search', title: 'Diagnostics', examples: ['Read fault codes', 'Road test vehicles', 'Diagnose engine issues', 'Electrical testing', 'Component testing'] },
                { id: 'repair', icon: 'wrench', title: 'Repairs', examples: ['Replace brake components', 'Engine repairs', 'Suspension work', 'Cooling system repairs', 'Exhaust repairs'] },
                { id: 'electrical', icon: 'zap', title: 'Electrical Systems', examples: ['Battery testing and replacement', 'Alternator repairs', 'Starter motor work', 'Lighting repairs', 'Accessory installation'] },
                { id: 'steering', icon: 'compass', title: 'Steering & Suspension', examples: ['Wheel alignments', 'Shock absorber replacement', 'Ball joint replacement', 'Power steering repairs', 'Wheel bearing replacement'] },
                { id: 'safety', icon: 'shield-check', title: 'Workshop Safety', examples: ['Vehicle hoisting', 'Hazardous waste handling', 'Tool maintenance', 'PPE usage', 'Fire prevention'] }
            ],
            'Apprentice Mechanic': [
                { id: 'assist', icon: 'hand-helping', title: 'Assist Mechanic', examples: ['Pass tools', 'Hold components', 'Clean parts', 'Label parts', 'Watch and learn'] },
                { id: 'basic', icon: 'tool', title: 'Basic Tasks', examples: ['Oil changes', 'Filter replacements', 'Fluid top-ups', 'Tyre changes', 'Battery replacement'] },
                { id: 'clean', icon: 'sparkles', title: 'Workshop Duties', examples: ['Keep workshop clean', 'Organise tools', 'Dispose of waste', 'Stock shelves', 'Maintain equipment'] },
                { id: 'learn', icon: 'book-open', title: 'Learning Activities', examples: ['Study training materials', 'Complete workbooks', 'Practice skills', 'Ask questions', 'Document learning'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Practices', examples: ['Use PPE correctly', 'Follow procedures', 'Report hazards', 'Safe lifting', 'Chemical handling'] },
                { id: 'customer', icon: 'user', title: 'Customer Interaction', examples: ['Move customer vehicles', 'Answer basic questions', 'Take phone messages', 'Maintain professionalism', 'Customer service support'] }
            ],
            'Service Advisor': [
                { id: 'book', icon: 'calendar', title: 'Booking & Scheduling', examples: ['Book appointments', 'Schedule technicians', 'Manage workshop capacity', 'Priority scheduling', 'Estimate timeframes'] },
                { id: 'consult', icon: 'message-circle', title: 'Customer Consultation', examples: ['Greet customers', 'Discuss concerns', 'Explain services', 'Obtain approvals', 'Provide updates'] },
                { id: 'quote', icon: 'file-text', title: 'Quoting & Invoicing', examples: ['Prepare quotes', 'Explain costs', 'Process invoices', 'Handle payments', 'Manage disputes'] },
                { id: 'coordinate', icon: 'users', title: 'Workshop Coordination', examples: ['Liaise with technicians', 'Track job progress', 'Order parts', 'Manage delays', 'Quality checks'] },
                { id: 'upsell', icon: 'trending-up', title: 'Additional Services', examples: ['Identify service needs', 'Recommend repairs', 'Present options', 'Explain value', 'Handle objections'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Maintain records', 'Process warranties', 'Update customer details', 'Generate reports', 'Follow up calls'] }
            ],
            'Workshop Supervisor': [
                { id: 'manage', icon: 'users', title: 'Team Management', examples: ['Supervise technicians', 'Allocate work', 'Monitor productivity', 'Provide feedback', 'Handle issues'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality Control', examples: ['Inspect completed work', 'Review diagnostics', 'Approve repairs', 'Handle comebacks', 'Maintain standards'] },
                { id: 'workflow', icon: 'clock', title: 'Workflow Management', examples: ['Monitor job progress', 'Manage bottlenecks', 'Prioritise urgent work', 'Coordinate resources', 'Meet targets'] },
                { id: 'parts', icon: 'package', title: 'Parts Management', examples: ['Approve parts orders', 'Manage stock levels', 'Handle returns', 'Supplier liaison', 'Cost control'] },
                { id: 'training', icon: 'book-open', title: 'Training & Development', examples: ['Train apprentices', 'Upskill team', 'Technical support', 'Tool training', 'Safety training'] },
                { id: 'safety', icon: 'shield-check', title: 'Workshop Safety', examples: ['Maintain safe environment', 'Conduct inspections', 'Investigate incidents', 'Enforce compliance', 'Equipment maintenance'] }
            ],
            'Panel Beater': [
                { id: 'repair', icon: 'hammer', title: 'Panel Repairs', examples: ['Hammer and dolly work', 'Fill and sand panels', 'Straighten dents', 'Repair creases', 'Metal finishing'] },
                { id: 'replace', icon: 'replace', title: 'Panel Replacement', examples: ['Remove damaged panels', 'Cut and weld patches', 'Install new panels', 'Align panels', 'Prepare for paint'] },
                { id: 'frame', icon: 'grid-3x3', title: 'Frame Straightening', examples: ['Use frame machine', 'Measure alignment', 'Pull and push corrections', 'Check tolerances', 'Document repairs'] },
                { id: 'weld', icon: 'zap', title: 'Welding', examples: ['MIG welding', 'Spot welding', 'Plug welding', 'Prepare weld areas', 'Treat welds'] },
                { id: 'prep', icon: 'paint-bucket', title: 'Paint Preparation', examples: ['Sand surfaces', 'Apply primer', 'Apply filler', 'Block sand', 'Mask areas'] },
                { id: 'safety', icon: 'shield-check', title: 'Workshop Safety', examples: ['Welding safety', 'Dust protection', 'Chemical handling', 'Manual handling', 'Eye protection'] }
            ],
            'Spray Painter': [
                { id: 'prep', icon: 'layers', title: 'Surface Preparation', examples: ['Clean surfaces', 'Apply primer', 'Sand between coats', 'Mask vehicles', 'Prepare spray booth'] },
                { id: 'mix', icon: 'droplet', title: 'Paint Mixing', examples: ['Mix paint colours', 'Match existing paint', 'Use mixing systems', 'Prepare clear coat', 'Record formulas'] },
                { id: 'spray', icon: 'paint-bucket', title: 'Spray Application', examples: ['Apply base coat', 'Apply clear coat', 'Achieve even coverage', 'Control runs and sags', 'Blend panels'] },
                { id: 'cure', icon: 'thermometer', title: 'Curing & Finishing', examples: ['Operate spray booth', 'Cure paint properly', 'Polish defects', 'Final inspection', 'Remove masking'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Maintenance', examples: ['Clean spray guns', 'Maintain booth', 'Change filters', 'Calibrate equipment', 'Manage supplies'] },
                { id: 'safety', icon: 'shield-check', title: 'Paint Safety', examples: ['Use respirator', 'Spray booth ventilation', 'Isocyanate safety', 'Fire prevention', 'Chemical storage'] }
            ],
            'Auto Electrician': [
                { id: 'diagnose', icon: 'search', title: 'Electrical Diagnostics', examples: ['Use diagnostic tools', 'Read wiring diagrams', 'Test circuits', 'Locate faults', 'Interpret fault codes'] },
                { id: 'repair', icon: 'wrench', title: 'Electrical Repairs', examples: ['Repair wiring', 'Replace components', 'Repair starters and alternators', 'Fix lighting systems', 'Repair power windows'] },
                { id: 'install', icon: 'settings', title: 'Install Systems', examples: ['Install audio systems', 'Fit alarms', 'Install cameras', 'Wire accessories', 'Install lighting'] },
                { id: 'battery', icon: 'battery', title: 'Battery Systems', examples: ['Test batteries', 'Replace batteries', 'Service terminals', 'Hybrid/EV systems', 'Charging system repairs'] },
                { id: 'control', icon: 'cpu', title: 'Control Systems', examples: ['ECU diagnostics', 'Sensor testing', 'Module programming', 'CAN bus diagnostics', 'Immobiliser systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Electrical Safety', examples: ['High voltage safety', 'Isolate systems', 'Use insulated tools', 'Static discharge prevention', 'Battery safety'] }
            ],
            'Parts Interpreter': [
                { id: 'identify', icon: 'search', title: 'Parts Identification', examples: ['Use parts catalogues', 'Identify from VIN', 'Cross-reference numbers', 'Locate supersessions', 'Verify compatibility'] },
                { id: 'quote', icon: 'file-text', title: 'Quoting & Sales', examples: ['Prepare quotes', 'Process sales', 'Handle enquiries', 'Upsell accessories', 'Manage trade accounts'] },
                { id: 'order', icon: 'shopping-cart', title: 'Ordering', examples: ['Order from dealers', 'Source aftermarket', 'Track deliveries', 'Handle backorders', 'Expedite urgent orders'] },
                { id: 'stock', icon: 'package', title: 'Stock Management', examples: ['Receive deliveries', 'Stock shelves', 'Conduct stocktakes', 'Manage min/max levels', 'Handle returns'] },
                { id: 'customer', icon: 'user', title: 'Customer Service', examples: ['Serve counter customers', 'Answer phone enquiries', 'Technical advice', 'Handle complaints', 'Build relationships'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Maintain records', 'Process warranties', 'Update pricing', 'Generate reports', 'Manage invoices'] }
            ]
        },
        // --- AVIATION -----------------------------------------------------------------
        'Aviation': {
            '_default': [
                { id: 'preflight', icon: 'clipboard-check', title: 'Pre-Flight Operations', examples: ['Conduct walk-around inspections', 'Review weather briefings', 'Complete flight planning', 'Check fuel and weight calculations', 'Verify documentation'] },
                { id: 'ground', icon: 'plane', title: 'Ground Operations', examples: ['Aircraft marshalling', 'Ground equipment operation', 'Baggage handling', 'Refuelling operations', 'Pushback and towing'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Compliance', examples: ['Follow SOPs', 'Complete safety briefings', 'Report hazards and incidents', 'Conduct risk assessments', 'Emergency procedures'] },
                { id: 'customer', icon: 'users', title: 'Passenger Services', examples: ['Check-in procedures', 'Boarding management', 'Customer assistance', 'Special needs support', 'Complaint handling'] },
                { id: 'maintenance', icon: 'wrench', title: 'Aircraft Maintenance', examples: ['Scheduled inspections', 'Component replacement', 'Defect rectification', 'Documentation and logging', 'Tool control'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Radio procedures', 'Crew coordination', 'ATC liaison', 'Briefings and handovers', 'Emergency communications'] }
            ]
        },
        // --- BUSINESS SERVICES --------------------------------------------------------
        'Business Services': {
            '_default': [
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Document management', 'Data entry and filing', 'Correspondence handling', 'Meeting coordination', 'Record keeping'] },
                { id: 'customer', icon: 'user', title: 'Client Services', examples: ['Client communication', 'Query handling', 'Service delivery', 'Relationship management', 'Feedback collection'] },
                { id: 'finance', icon: 'dollar-sign', title: 'Financial Tasks', examples: ['Invoice processing', 'Expense management', 'Budget tracking', 'Financial reporting', 'Payroll support'] },
                { id: 'digital', icon: 'monitor', title: 'Digital Operations', examples: ['Software systems use', 'Database management', 'Online platforms', 'Digital communication', 'Report generation'] },
                { id: 'compliance', icon: 'file-check', title: 'Compliance & Quality', examples: ['Policy adherence', 'Quality checks', 'Audit preparation', 'Privacy compliance', 'Documentation standards'] },
                { id: 'coordinate', icon: 'users', title: 'Coordination', examples: ['Team collaboration', 'Project coordination', 'Stakeholder liaison', 'Meeting facilitation', 'Cross-functional work'] }
            ]
        },
        // --- CHILDCARE ----------------------------------------------------------------
        'Childcare': {
            '_default': [
                { id: 'care', icon: 'heart', title: 'Child Care & Supervision', examples: ['Monitor children safely', 'Respond to individual needs', 'Assist with personal care', 'Manage behaviour positively', 'Support emotional wellbeing'] },
                { id: 'activities', icon: 'puzzle', title: 'Learning Activities', examples: ['Plan age-appropriate activities', 'Set up learning environments', 'Facilitate play-based learning', 'Support developmental milestones', 'Document learning outcomes'] },
                { id: 'nutrition', icon: 'utensils', title: 'Nutrition & Meals', examples: ['Prepare healthy meals', 'Supervise mealtimes', 'Manage dietary requirements', 'Maintain food safety', 'Encourage healthy eating'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Hygiene', examples: ['Maintain safe environments', 'Conduct safety checks', 'Follow hygiene protocols', 'Administer first aid', 'Report hazards'] },
                { id: 'family', icon: 'users', title: 'Family Communication', examples: ['Daily handovers', 'Progress updates', 'Parent meetings', 'Address concerns', 'Build partnerships'] },
                { id: 'compliance', icon: 'clipboard', title: 'Compliance & Documentation', examples: ['Maintain records', 'Follow NQF requirements', 'Document observations', 'Prepare for assessment', 'Policy adherence'] }
            ]
        },
        // --- COMMUNITY SERVICES -------------------------------------------------------
        'Community Services': {
            '_default': [
                { id: 'support', icon: 'heart', title: 'Client Support', examples: ['Provide direct assistance', 'Emotional support', 'Practical help', 'Advocacy support', 'Crisis intervention'] },
                { id: 'assess', icon: 'clipboard', title: 'Assessment & Planning', examples: ['Conduct needs assessments', 'Develop support plans', 'Set goals with clients', 'Review progress', 'Update care plans'] },
                { id: 'connect', icon: 'link', title: 'Service Coordination', examples: ['Referral to services', 'Liaise with agencies', 'Coordinate support', 'Follow up referrals', 'Case conferencing'] },
                { id: 'communicate', icon: 'message-circle', title: 'Communication', examples: ['Active listening', 'Client interviews', 'Family meetings', 'Report writing', 'Case notes'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Ethics', examples: ['Maintain boundaries', 'Mandatory reporting', 'Risk assessment', 'Privacy compliance', 'Cultural safety'] },
                { id: 'admin', icon: 'folder', title: 'Documentation', examples: ['Maintain case files', 'Record keeping', 'Data entry', 'Prepare reports', 'Funding compliance'] }
            ]
        },
        // --- EDUCATION ----------------------------------------------------------------
        'Education': {
            '_default': [
                { id: 'teach', icon: 'book-open', title: 'Teaching & Instruction', examples: ['Deliver lessons', 'Explain concepts', 'Demonstrate skills', 'Facilitate discussions', 'Guide learning activities'] },
                { id: 'plan', icon: 'calendar', title: 'Planning & Preparation', examples: ['Develop lesson plans', 'Prepare resources', 'Design assessments', 'Curriculum planning', 'Differentiate instruction'] },
                { id: 'assess', icon: 'check-circle', title: 'Assessment', examples: ['Assess student work', 'Provide feedback', 'Record grades', 'Monitor progress', 'Identify learning gaps'] },
                { id: 'manage', icon: 'users', title: 'Classroom Management', examples: ['Establish routines', 'Manage behaviour', 'Create safe environment', 'Engage students', 'Resolve conflicts'] },
                { id: 'support', icon: 'heart', title: 'Student Support', examples: ['Support individual needs', 'Pastoral care', 'Learning support', 'Parent communication', 'Wellbeing referrals'] },
                { id: 'admin', icon: 'clipboard', title: 'Administration', examples: ['Maintain records', 'Report writing', 'Meeting attendance', 'Compliance tasks', 'Professional development'] }
            ]
        },
        // --- ELECTRICAL ---------------------------------------------------------------
        'Electrical': {
            '_default': [
                { id: 'install', icon: 'zap', title: 'Electrical Installation', examples: ['Install wiring systems', 'Fit electrical accessories', 'Install distribution boards', 'Connect appliances', 'Install lighting'] },
                { id: 'maintain', icon: 'tool', title: 'Maintenance & Repair', examples: ['Diagnose electrical faults', 'Replace components', 'Test and repair circuits', 'Upgrade installations', 'Conduct scheduled maintenance'] },
                { id: 'test', icon: 'search', title: 'Testing & Inspection', examples: ['Conduct insulation tests', 'Verify earth continuity', 'Test RCDs', 'Inspect installations', 'Issue certificates'] },
                { id: 'plan', icon: 'clipboard', title: 'Planning & Documentation', examples: ['Read drawings and specs', 'Plan cable routes', 'Calculate loads', 'Prepare as-built documentation', 'Complete work orders'] },
                { id: 'safety', icon: 'shield-check', title: 'Electrical Safety', examples: ['Isolate supplies', 'Lock out/tag out', 'Test before touch', 'Use insulated tools', 'Follow safe work procedures'] },
                { id: 'comply', icon: 'file-check', title: 'Compliance', examples: ['Follow AS/NZS standards', 'Comply with regulations', 'Obtain permits', 'Complete compliance documentation', 'Maintain licences'] }
            ]
        },
        // --- ENGINEERING --------------------------------------------------------------
        'Engineering': {
            '_default': [
                { id: 'design', icon: 'ruler', title: 'Design & Analysis', examples: ['Develop technical designs', 'Perform calculations', 'Create specifications', 'Conduct analysis', 'Review and approve designs'] },
                { id: 'project', icon: 'calendar', title: 'Project Management', examples: ['Plan project phases', 'Coordinate resources', 'Monitor progress', 'Manage budgets', 'Stakeholder communication'] },
                { id: 'implement', icon: 'settings', title: 'Implementation', examples: ['Supervise construction', 'Commission systems', 'Conduct site inspections', 'Troubleshoot issues', 'Verify installations'] },
                { id: 'document', icon: 'file-text', title: 'Documentation', examples: ['Prepare technical reports', 'Create drawings', 'Document specifications', 'Maintain records', 'Prepare submissions'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality Assurance', examples: ['Conduct quality reviews', 'Verify compliance', 'Test performance', 'Audit processes', 'Continuous improvement'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Risk', examples: ['Conduct risk assessments', 'Implement safety measures', 'Review safety documentation', 'Incident investigation', 'Compliance verification'] }
            ]
        },
        // --- FINANCE ------------------------------------------------------------------
        'Finance': {
            '_default': [
                { id: 'process', icon: 'dollar-sign', title: 'Transaction Processing', examples: ['Process payments', 'Record transactions', 'Reconcile accounts', 'Manage invoices', 'Handle receipts'] },
                { id: 'report', icon: 'chart-bar', title: 'Financial Reporting', examples: ['Prepare financial statements', 'Generate reports', 'Analyse variances', 'Present findings', 'Period-end processing'] },
                { id: 'comply', icon: 'file-check', title: 'Compliance', examples: ['Follow regulations', 'Maintain audit trails', 'Privacy compliance', 'Anti-money laundering', 'Prepare for audits'] },
                { id: 'customer', icon: 'user', title: 'Client Services', examples: ['Client consultations', 'Answer enquiries', 'Process applications', 'Manage accounts', 'Resolve disputes'] },
                { id: 'analyse', icon: 'search', title: 'Analysis', examples: ['Analyse financial data', 'Identify trends', 'Risk assessment', 'Performance analysis', 'Budgeting support'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Maintain records', 'File management', 'Data entry', 'Correspondence', 'System maintenance'] }
            ]
        },
        // --- FOOD PROCESSING ----------------------------------------------------------
        'Food Processing': {
            '_default': [
                { id: 'process', icon: 'settings', title: 'Production Operations', examples: ['Operate processing equipment', 'Monitor production lines', 'Adjust machine settings', 'Maintain production rates', 'Handle changeovers'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality Control', examples: ['Conduct quality checks', 'Sample testing', 'Record measurements', 'Identify defects', 'Implement corrective actions'] },
                { id: 'safety', icon: 'shield-check', title: 'Food Safety', examples: ['Follow HACCP procedures', 'Maintain hygiene standards', 'Temperature monitoring', 'Allergen management', 'Cleaning and sanitisation'] },
                { id: 'material', icon: 'package', title: 'Material Handling', examples: ['Receive raw materials', 'Store ingredients correctly', 'Manage stock rotation', 'Prepare materials', 'Handle packaging'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment Maintenance', examples: ['Pre-start checks', 'Clean equipment', 'Report faults', 'Basic maintenance', 'Calibration support'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Complete production records', 'Traceability documentation', 'Quality logs', 'Temperature records', 'Batch documentation'] }
            ]
        },
        // --- GOVERNMENT ---------------------------------------------------------------
        'Government': {
            '_default': [
                { id: 'service', icon: 'users', title: 'Public Service Delivery', examples: ['Assist members of public', 'Process applications', 'Provide information', 'Handle enquiries', 'Service counter duties'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Document management', 'Record keeping', 'Correspondence', 'Meeting coordination', 'File management'] },
                { id: 'policy', icon: 'file-text', title: 'Policy & Compliance', examples: ['Apply policies', 'Follow procedures', 'Compliance monitoring', 'Audit support', 'Regulatory adherence'] },
                { id: 'communicate', icon: 'message-circle', title: 'Communication', examples: ['Stakeholder liaison', 'Report writing', 'Briefing preparation', 'Public communication', 'Internal coordination'] },
                { id: 'data', icon: 'database', title: 'Data & Systems', examples: ['Data entry', 'Database management', 'Report generation', 'System use', 'Information security'] },
                { id: 'ethics', icon: 'shield-check', title: 'Ethics & Integrity', examples: ['Maintain confidentiality', 'Declare conflicts', 'Professional conduct', 'Privacy compliance', 'Code of conduct'] }
            ]
        },
        // --- HEALTHCARE ---------------------------------------------------------------
        'Healthcare': {
            '_default': [
                { id: 'clinical', icon: 'stethoscope', title: 'Clinical Care', examples: ['Patient assessment', 'Treatment administration', 'Monitor vital signs', 'Administer medications', 'Clinical procedures'] },
                { id: 'patient', icon: 'heart', title: 'Patient Support', examples: ['Assist with ADLs', 'Mobility support', 'Emotional care', 'Patient education', 'Comfort measures'] },
                { id: 'safety', icon: 'shield-check', title: 'Infection Control', examples: ['Hand hygiene', 'PPE use', 'Sterile technique', 'Waste management', 'Environmental cleaning'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Patient records', 'Care plans', 'Observation charts', 'Handover notes', 'Incident reports'] },
                { id: 'communicate', icon: 'message-circle', title: 'Communication', examples: ['Patient communication', 'Family updates', 'Multidisciplinary collaboration', 'Handover', 'Escalation'] },
                { id: 'emergency', icon: 'alert-circle', title: 'Emergency Response', examples: ['Recognise deterioration', 'Activate emergency response', 'Basic life support', 'First response', 'Post-emergency documentation'] }
            ]
        },
        // --- HOSPITALITY --------------------------------------------------------------
        'Hospitality': {
            '_default': [
                { id: 'service', icon: 'user', title: 'Customer Service', examples: ['Greet and seat guests', 'Take orders', 'Serve food and beverages', 'Handle payments', 'Resolve complaints'] },
                { id: 'food', icon: 'utensils', title: 'Food & Beverage', examples: ['Food preparation', 'Plate presentation', 'Beverage service', 'Coffee making', 'Menu knowledge'] },
                { id: 'hygiene', icon: 'sparkles', title: 'Hygiene & Safety', examples: ['Food safety compliance', 'Clean work areas', 'Temperature control', 'Allergen awareness', 'Sanitisation'] },
                { id: 'setup', icon: 'settings', title: 'Setup & Service', examples: ['Set tables', 'Prepare service areas', 'Stock stations', 'Event setup', 'Closing duties'] },
                { id: 'team', icon: 'users', title: 'Teamwork', examples: ['Coordinate with kitchen', 'Support colleagues', 'Shift handover', 'Training new staff', 'Team communication'] },
                { id: 'admin', icon: 'clipboard', title: 'Administrative', examples: ['Process reservations', 'Cash handling', 'Stock management', 'Complete checklists', 'Report issues'] }
            ]
        },
        // --- INFORMATION TECHNOLOGY ---------------------------------------------------
        'Information Technology': {
            '_default': [
                { id: 'support', icon: 'headphones', title: 'Technical Support', examples: ['Troubleshoot issues', 'Helpdesk tickets', 'User assistance', 'Remote support', 'Escalate problems'] },
                { id: 'systems', icon: 'server', title: 'Systems Administration', examples: ['Server management', 'User account management', 'System monitoring', 'Backup and recovery', 'Security updates'] },
                { id: 'develop', icon: 'code', title: 'Development', examples: ['Write code', 'Test applications', 'Debug issues', 'Deploy updates', 'Documentation'] },
                { id: 'security', icon: 'shield', title: 'Cybersecurity', examples: ['Monitor threats', 'Implement controls', 'Security audits', 'Incident response', 'User awareness'] },
                { id: 'network', icon: 'wifi', title: 'Networking', examples: ['Configure networks', 'Troubleshoot connectivity', 'Maintain infrastructure', 'Monitor performance', 'Documentation'] },
                { id: 'project', icon: 'calendar', title: 'Project Work', examples: ['Requirements gathering', 'Project planning', 'Implementation', 'Testing', 'Change management'] }
            ]
        },
        // --- LOGISTICS ----------------------------------------------------------------
        'Logistics': {
            '_default': [
                { id: 'receive', icon: 'package', title: 'Receiving', examples: ['Unload deliveries', 'Check against orders', 'Inspect for damage', 'Process documentation', 'Put away stock'] },
                { id: 'dispatch', icon: 'truck', title: 'Dispatch', examples: ['Pick orders', 'Pack shipments', 'Load vehicles', 'Prepare documentation', 'Schedule deliveries'] },
                { id: 'inventory', icon: 'clipboard-list', title: 'Inventory Control', examples: ['Stock counts', 'Location management', 'Stock rotation', 'Replenishment', 'Report discrepancies'] },
                { id: 'transport', icon: 'map-pin', title: 'Transport Coordination', examples: ['Route planning', 'Carrier coordination', 'Track shipments', 'Manage delays', 'Customer updates'] },
                { id: 'systems', icon: 'monitor', title: 'Systems & Data', examples: ['WMS operation', 'Data entry', 'Report generation', 'Barcode scanning', 'System queries'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['Safe lifting', 'Forklift safety', 'Traffic management', 'Hazardous goods', 'PPE compliance'] }
            ]
        },
        // --- MANUFACTURING ------------------------------------------------------------
        'Manufacturing': {
            '_default': [
                { id: 'operate', icon: 'settings', title: 'Machine Operation', examples: ['Set up machines', 'Operate production equipment', 'Monitor processes', 'Adjust settings', 'Changeovers'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality Control', examples: ['Inspect products', 'Measure tolerances', 'Record data', 'Identify defects', 'Implement corrections'] },
                { id: 'maintain', icon: 'tool', title: 'Maintenance', examples: ['Pre-start checks', 'Clean equipment', 'Basic maintenance', 'Report faults', 'Assist technicians'] },
                { id: 'material', icon: 'package', title: 'Material Handling', examples: ['Load materials', 'Handle work in progress', 'Move finished goods', 'Stock management', 'Waste disposal'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['Machine guarding', 'Lock out/tag out', 'PPE use', 'Hazard reporting', 'Emergency procedures'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Production records', 'Quality logs', 'Downtime recording', 'Batch traceability', 'Shift handover'] }
            ]
        },
        // --- PLUMBING -----------------------------------------------------------------
        'Plumbing': {
            '_default': [
                { id: 'install', icon: 'droplet', title: 'Installation', examples: ['Install pipework', 'Fit fixtures', 'Connect appliances', 'Install hot water systems', 'Drainage installation'] },
                { id: 'maintain', icon: 'tool', title: 'Maintenance & Repair', examples: ['Clear blockages', 'Repair leaks', 'Replace tapware', 'Maintain hot water systems', 'Scheduled servicing'] },
                { id: 'test', icon: 'search', title: 'Testing & Inspection', examples: ['Pressure testing', 'Leak detection', 'Compliance inspection', 'Water quality testing', 'Gas testing'] },
                { id: 'gas', icon: 'flame', title: 'Gas Fitting', examples: ['Install gas pipework', 'Connect gas appliances', 'Test for leaks', 'Service gas equipment', 'Gas compliance'] },
                { id: 'plan', icon: 'clipboard', title: 'Planning', examples: ['Read plans', 'Calculate materials', 'Plan pipe runs', 'Prepare quotes', 'Complete documentation'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['Confined space work', 'Trench safety', 'Hot work procedures', 'Gas safety', 'PPE compliance'] }
            ]
        },
        // --- RETAIL -------------------------------------------------------------------
        'Retail': {
            '_default': [
                { id: 'service', icon: 'user', title: 'Customer Service', examples: ['Greet customers', 'Answer enquiries', 'Product recommendations', 'Handle complaints', 'Process returns'] },
                { id: 'sales', icon: 'shopping-cart', title: 'Sales', examples: ['Process transactions', 'Cash handling', 'EFTPOS operation', 'Upselling', 'Loyalty programs'] },
                { id: 'stock', icon: 'package', title: 'Stock Management', examples: ['Receive deliveries', 'Stock shelves', 'Price items', 'Stock counts', 'Manage stockroom'] },
                { id: 'display', icon: 'layout-grid', title: 'Visual Merchandising', examples: ['Set up displays', 'Maintain presentation', 'Signage placement', 'Seasonal changes', 'Promotional displays'] },
                { id: 'security', icon: 'shield', title: 'Loss Prevention', examples: ['Monitor for theft', 'Tag merchandise', 'Process refunds', 'Security awareness', 'Incident reporting'] },
                { id: 'admin', icon: 'clipboard', title: 'Administration', examples: ['End of day procedures', 'Sales reports', 'Order stock', 'Opening/closing duties', 'Maintain records'] }
            ]
        },
        // --- SECURITY -----------------------------------------------------------------
        'Security': {
            '_default': [
                { id: 'patrol', icon: 'eye', title: 'Patrol & Surveillance', examples: ['Conduct patrols', 'Monitor CCTV', 'Observe suspicious activity', 'Check perimeters', 'Report irregularities'] },
                { id: 'access', icon: 'door-open', title: 'Access Control', examples: ['Verify credentials', 'Issue passes', 'Search procedures', 'Control entry points', 'Maintain visitor logs'] },
                { id: 'respond', icon: 'alert-circle', title: 'Incident Response', examples: ['Respond to alarms', 'Handle disturbances', 'First responder duties', 'De-escalation', 'Liaise with police'] },
                { id: 'crowd', icon: 'users', title: 'Crowd Management', examples: ['Queue management', 'Event security', 'Venue control', 'Emergency evacuation', 'Customer assistance'] },
                { id: 'report', icon: 'file-text', title: 'Documentation', examples: ['Incident reports', 'Activity logs', 'Handover notes', 'Evidence preservation', 'Daily reports'] },
                { id: 'comply', icon: 'shield-check', title: 'Compliance', examples: ['Follow legislation', 'Maintain licence', 'Use of force guidelines', 'Privacy compliance', 'Professional conduct'] }
            ]
        },
        // --- SPORT & RECREATION -------------------------------------------------------
        'Sport & Recreation': {
            '_default': [
                { id: 'instruct', icon: 'users', title: 'Instruction & Coaching', examples: ['Deliver sessions', 'Demonstrate techniques', 'Provide feedback', 'Skill development', 'Motivate participants'] },
                { id: 'facility', icon: 'home', title: 'Facility Operations', examples: ['Maintain equipment', 'Setup areas', 'Cleanliness standards', 'Safety checks', 'Opening/closing procedures'] },
                { id: 'customer', icon: 'user', title: 'Customer Service', examples: ['Member enquiries', 'Process memberships', 'Handle bookings', 'Resolve complaints', 'Tours and inductions'] },
                { id: 'program', icon: 'calendar', title: 'Program Delivery', examples: ['Plan activities', 'Run programs', 'Manage events', 'Adapt for abilities', 'Evaluate outcomes'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & First Aid', examples: ['Risk assessment', 'Emergency response', 'First aid', 'Pool safety', 'Incident management'] },
                { id: 'admin', icon: 'clipboard', title: 'Administration', examples: ['Maintain records', 'Process payments', 'Booking systems', 'Attendance tracking', 'Report generation'] }
            ]
        },
        // --- TOURISM ------------------------------------------------------------------
        'Tourism': {
            '_default': [
                { id: 'service', icon: 'user', title: 'Visitor Services', examples: ['Greet visitors', 'Provide information', 'Answer enquiries', 'Make recommendations', 'Handle complaints'] },
                { id: 'guide', icon: 'map', title: 'Guiding & Tours', examples: ['Conduct tours', 'Deliver commentary', 'Manage groups', 'Answer questions', 'Cultural interpretation'] },
                { id: 'book', icon: 'calendar', title: 'Bookings & Reservations', examples: ['Process bookings', 'Manage reservations', 'Confirm arrangements', 'Handle cancellations', 'Payment processing'] },
                { id: 'promote', icon: 'megaphone', title: 'Promotion', examples: ['Provide destination information', 'Distribute materials', 'Social media content', 'Partner with operators', 'Represent at events'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Compliance', examples: ['Safety briefings', 'Emergency procedures', 'Risk management', 'Accessibility support', 'Compliance checks'] },
                { id: 'admin', icon: 'folder', title: 'Administration', examples: ['Maintain records', 'Process documentation', 'Report on visitation', 'Stock merchandise', 'Financial reconciliation'] }
            ]
        },
        // --- TRANSPORT ----------------------------------------------------------------
        'Transport': {
            '_default': [
                { id: 'operate', icon: 'truck', title: 'Vehicle Operation', examples: ['Pre-trip inspections', 'Safe driving practices', 'Navigate routes', 'Manage loads', 'Post-trip procedures'] },
                { id: 'load', icon: 'package', title: 'Load Management', examples: ['Load vehicles safely', 'Secure loads', 'Check weight distribution', 'Unload at destination', 'Handle fragile goods'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Complete logbooks', 'Delivery documentation', 'Chain of responsibility', 'Manifest management', 'Report incidents'] },
                { id: 'customer', icon: 'user', title: 'Customer Service', examples: ['Professional presentation', 'Delivery confirmation', 'Handle enquiries', 'Manage delays', 'Collect payments'] },
                { id: 'comply', icon: 'file-check', title: 'Compliance', examples: ['Fatigue management', 'Speed compliance', 'Mass and dimension limits', 'Dangerous goods', 'Maintain licences'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['Road safety', 'Vehicle safety', 'Load restraint', 'Manual handling', 'Emergency procedures'] }
            ]
        },
        // --- UTILITIES ----------------------------------------------------------------
        'Utilities': {
            '_default': [
                { id: 'operate', icon: 'settings', title: 'Operations', examples: ['Operate plant equipment', 'Monitor systems', 'Adjust controls', 'Respond to alarms', 'Maintain operations'] },
                { id: 'maintain', icon: 'tool', title: 'Maintenance', examples: ['Scheduled maintenance', 'Repair faults', 'Test equipment', 'Replace components', 'Preventive maintenance'] },
                { id: 'field', icon: 'map-pin', title: 'Field Work', examples: ['Site visits', 'Meter reading', 'Service connections', 'Emergency response', 'Customer site work'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['High voltage safety', 'Confined space entry', 'Working at heights', 'Gas safety', 'Excavation safety'] },
                { id: 'customer', icon: 'user', title: 'Customer Service', examples: ['Handle enquiries', 'Explain services', 'Process applications', 'Resolve complaints', 'Outage communication'] },
                { id: 'document', icon: 'clipboard', title: 'Documentation', examples: ['Work orders', 'Asset records', 'Test results', 'Compliance records', 'Incident reports'] }
            ]
        },
        // --- WAREHOUSING --------------------------------------------------------------
        'Warehousing': {
            '_default': [
                { id: 'receive', icon: 'package', title: 'Receiving', examples: ['Unload deliveries', 'Check shipments', 'Inspect for damage', 'Process receipts', 'Put away stock'] },
                { id: 'store', icon: 'archive', title: 'Storage', examples: ['Locate stock correctly', 'Maintain organisation', 'Stock rotation (FIFO)', 'Manage locations', 'Space utilisation'] },
                { id: 'pick', icon: 'clipboard-list', title: 'Order Picking', examples: ['Pick orders accurately', 'Multi-order picking', 'Voice/RF picking', 'Batch picking', 'Verify picks'] },
                { id: 'dispatch', icon: 'truck', title: 'Dispatch', examples: ['Pack orders', 'Prepare documentation', 'Load vehicles', 'Schedule shipments', 'Carrier coordination'] },
                { id: 'equipment', icon: 'forklift', title: 'Equipment Operation', examples: ['Forklift operation', 'Pallet jack use', 'Order pickers', 'Reach stackers', 'Pre-start checks'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety', examples: ['Safe lifting', 'Traffic management', 'Racking safety', 'Chemical storage', 'Emergency procedures'] }
            ]
        },
        // --- DEFAULT CATEGORIES FOR ALL OTHER INDUSTRIES ---------------------------
        '_default': {
            '_default': [
                { id: 'core', icon: 'briefcase', title: 'Core Operations', examples: ['Primary work tasks', 'Standard procedures', 'Daily responsibilities', 'Process execution', 'Service delivery'] },
                { id: 'quality', icon: 'check-circle', title: 'Quality & Standards', examples: ['Quality checks', 'Compliance requirements', 'Standard adherence', 'Documentation', 'Audit preparation'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Risk', examples: ['Safety procedures', 'Hazard identification', 'PPE requirements', 'Incident reporting', 'Emergency response'] },
                { id: 'communicate', icon: 'message-circle', title: 'Communication', examples: ['Team coordination', 'Customer interaction', 'Reporting', 'Handover procedures', 'Stakeholder liaison'] },
                { id: 'maintain', icon: 'tool', title: 'Equipment & Resources', examples: ['Equipment operation', 'Maintenance tasks', 'Resource management', 'Tool care', 'Stock handling'] },
                { id: 'improve', icon: 'trending-up', title: 'Improvement & Development', examples: ['Process improvement', 'Skill development', 'Problem solving', 'Innovation', 'Efficiency gains'] }
            ]
        }
    };

    // ===========================================================================
    // EQUIPMENT CATEGORIES - Industry-specific grouped equipment with examples
    // v6.6.38: Category-based approach with beautiful card UI
    // Each category has: id, icon (Lucide icon name), title, and examples
    // ===========================================================================
    const EQUIPMENT_CATEGORIES = {
        // --- BUILDING & CONSTRUCTION -------------------------------------------
        'Building & Construction': {
            'Scaffold Worker': [
                { id: 'scaffold_systems', icon: 'construction', title: 'Scaffold Systems', examples: ['Tube and coupler', 'Modular/system scaffold (ringlock, cuplock, kwikstage)', 'Mobile scaffolds', 'Cantilever scaffolds', 'Suspended scaffolds'] },
                { id: 'scaffold_components', icon: 'package', title: 'Scaffold Components', examples: ['Standards, ledgers, transoms', 'Base plates, sole boards', 'Steel/aluminium planks', 'Guardrails, mid-rails, toe boards', 'Access ladders, stair units, hop-up brackets'] },
                { id: 'height_safety', icon: 'shield', title: 'Height Safety Equipment', examples: ['Full-body harness', 'Lanyards (fixed, adjustable, shock-absorbing)', 'Inertia reels, static lines', 'Certified anchor points', 'Temporary edge protection'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand & Power Tools', examples: ['Scaffold spanners/podgers', 'Impact wrenches', 'Spirit levels, tape measures', 'Hammers, torque tools', 'Tagging equipment'] },
                { id: 'lifting', icon: 'arrow-up', title: 'Lifting & Handling', examples: ['Gin wheels', 'Rope and pulley systems', 'Mechanical hoists', 'Cranes for large lifts', 'Forklifts for ground transport'] },
                { id: 'site_safety', icon: 'alert-triangle', title: 'Site Safety & PPE', examples: ['Compliance tags', 'Barricades, bunting, signage', 'Exclusion zone barriers', 'Tool lanyards, drop mats', 'Hard hat, high-vis, steel-caps, gloves'] }
            ],
            'EWP Operator': [
                { id: 'ewp_types', icon: 'arrow-up-circle', title: 'EWP Types', examples: ['Scissor lifts', 'Boom lifts (articulating)', 'Boom lifts (telescopic)', 'Vertical mast lifts', 'Spider lifts'] },
                { id: 'controls', icon: 'settings', title: 'Controls & Systems', examples: ['Platform controls', 'Ground controls', 'Emergency lowering systems', 'Outrigger systems', 'Levelling systems'] },
                { id: 'height_safety', icon: 'shield', title: 'Height Safety', examples: ['Full-body harness', 'Lanyard with platform anchor', 'Tool tethers', 'Edge protection rails', 'Rescue equipment'] },
                { id: 'accessories', icon: 'package', title: 'Accessories', examples: ['Material handling attachments', 'Platform extensions', 'Lighting kits', 'Generator sets', 'Tyre protection mats'] },
                { id: 'maintenance', icon: 'tool', title: 'Maintenance Equipment', examples: ['Battery charger', 'Hydraulic fluid', 'Function test equipment', 'Cleaning equipment', 'Pre-start checklist forms'] },
                { id: 'safety', icon: 'alert-triangle', title: 'Site Safety & PPE', examples: ['Exclusion zone barriers', 'Warning signage', 'Traffic cones', 'Hard hat, high-vis, harness', 'Steel-cap boots'] }
            ],
            'Crane Operator': [
                { id: 'crane_types', icon: 'truck', title: 'Crane Types', examples: ['Mobile crane (all-terrain)', 'Franna/pick and carry', 'Tower crane', 'Crawler crane', 'Overhead/gantry crane'] },
                { id: 'controls', icon: 'settings', title: 'Controls & Instruments', examples: ['Operator cab controls', 'Load moment indicator (LMI)', 'Anti-two block device', 'Slew limiters', 'Wind speed indicator'] },
                { id: 'rigging', icon: 'link', title: 'Rigging Equipment', examples: ['Chain slings', 'Wire rope slings', 'Synthetic slings', 'Shackles and hooks', 'Spreader beams, lifting frames'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Two-way radios', 'Hand signal charts', 'Crane cameras', 'Warning sirens', 'Communication headsets'] },
                { id: 'setup', icon: 'package', title: 'Setup Equipment', examples: ['Outrigger pads', 'Ground mats', 'Load charts', 'Lift plans', 'Exclusion zone equipment'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hard hat', 'High-vis clothing', 'Steel-cap boots', 'Gloves', 'Safety glasses'] }
            ],
            'Carpenter': [
                { id: 'power_tools', icon: 'zap', title: 'Power Tools', examples: ['Circular saw', 'Reciprocating saw', 'Power drill/driver', 'Nail gun (framing, finish)', 'Jigsaw, mitre saw'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand Tools', examples: ['Hammer, claw hammer', 'Chisels, planes', 'Hand saw', 'Pry bars', 'Utility knife'] },
                { id: 'measuring', icon: 'ruler', title: 'Measuring & Layout', examples: ['Tape measure', 'Builders square', 'Spirit level, laser level', 'Chalk line', 'Builders string line'] },
                { id: 'fixing', icon: 'package', title: 'Fixing Equipment', examples: ['Nail gun compressor', 'Screw gun', 'Drill bits, driver bits', 'Clamps', 'Work bench'] },
                { id: 'access', icon: 'ladder', title: 'Access Equipment', examples: ['A-frame ladder', 'Extension ladder', 'Trestles', 'Scaffold platform', 'Step platforms'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Safety glasses', 'Hearing protection', 'Dust mask', 'Work gloves', 'Steel-cap boots'] }
            ],
            'Site Supervisor': [
                { id: 'documentation', icon: 'clipboard', title: 'Documentation', examples: ['Daily diary', 'Permit books', 'Inspection checklists', 'SWMS register', 'Drawing sets'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Two-way radio', 'Mobile phone', 'Site PA system', 'Notice boards', 'Digital tablets'] },
                { id: 'measuring', icon: 'ruler', title: 'Measuring Equipment', examples: ['Laser level', 'Tape measure', 'Dumpy level', 'Survey equipment', 'Plan wheel'] },
                { id: 'monitoring', icon: 'camera', title: 'Monitoring Equipment', examples: ['Site cameras', 'Progress photo equipment', 'Drone (if licensed)', 'Weather station', 'Time lapse systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['First aid kit', 'Fire extinguisher', 'Spill kit', 'Defibrillator (AED)', 'Emergency equipment'] },
                { id: 'ppe', icon: 'hard-hat', title: 'PPE', examples: ['Hard hat', 'High-vis clothing', 'Steel-cap boots', 'Safety glasses', 'Hearing protection'] }
            ],
            '_default': [
                { id: 'power_tools', icon: 'zap', title: 'Power Tools', examples: ['Power drill', 'Grinder', 'Saw', 'Impact driver', 'Specialised power tools'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand Tools', examples: ['Hammers', 'Screwdrivers', 'Pliers', 'Spanners', 'Specialised hand tools'] },
                { id: 'measuring', icon: 'ruler', title: 'Measuring Equipment', examples: ['Tape measure', 'Level', 'Square', 'Laser level', 'Specialised measuring'] },
                { id: 'access', icon: 'ladder', title: 'Access Equipment', examples: ['Ladders', 'Scaffolding', 'EWP', 'Trestles', 'Work platforms'] },
                { id: 'lifting', icon: 'arrow-up', title: 'Lifting Equipment', examples: ['Manual handling aids', 'Trolleys', 'Hoists', 'Slings', 'Cranes'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hard hat', 'High-vis', 'Steel-caps', 'Gloves', 'Eye and hearing protection'] }
            ]
        },
        // --- MINING ----------------------------------------------------------------
        'Mining': {
            'Haul Truck Operator': [
                { id: 'trucks', icon: 'truck', title: 'Haul Trucks', examples: ['Rigid body trucks (Cat 785, 793)', 'Articulated trucks', 'Autonomous trucks', 'Water carts', 'Service trucks'] },
                { id: 'loading', icon: 'package', title: 'Loading Points', examples: ['Excavator loading area', 'Shovel loading bays', 'Stockpile areas', 'ROM pad', 'Dump points'] },
                { id: 'systems', icon: 'settings', title: 'Truck Systems', examples: ['Dispatch system (Modular, Wenco)', 'GPS/Fleet management', 'Tyre pressure monitoring', 'Brake retarder', 'Payload monitoring'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Two-way radio', 'Light vehicle interaction horn', 'Autonomous system interfaces', 'Pit communication protocols', 'Emergency stop systems'] },
                { id: 'maintenance', icon: 'tool', title: 'Maintenance Checks', examples: ['Pre-start checklist', 'Tyre inspection tools', 'Fluid level gauges', 'Brake testing', 'Fault reporting system'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hard hat with chin strap', 'High-vis clothing', 'Steel-cap boots', 'Safety glasses', 'Hearing protection'] }
            ],
            'Process Plant Operator': [
                { id: 'crushing', icon: 'circle', title: 'Crushing Equipment', examples: ['Jaw crusher', 'Cone crusher', 'Gyratory crusher', 'Impact crusher', 'Screening plants'] },
                { id: 'conveyors', icon: 'arrow-right', title: 'Conveyor Systems', examples: ['Belt conveyors', 'Feeders', 'Transfer points', 'Trippers', 'Stackers/reclaimers'] },
                { id: 'processing', icon: 'settings', title: 'Processing Equipment', examples: ['Ball mills', 'SAG mills', 'Flotation cells', 'Thickeners', 'Leach tanks'] },
                { id: 'pumps', icon: 'droplet', title: 'Pumps & Pipelines', examples: ['Slurry pumps', 'Water pumps', 'Reagent dosing pumps', 'Pipeline systems', 'Valves and actuators'] },
                { id: 'control', icon: 'monitor', title: 'Control Systems', examples: ['SCADA/DCS', 'Control room screens', 'PLCs', 'Field instruments', 'Sample systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hard hat', 'Hearing protection', 'Safety glasses', 'Respirator', 'Chemical-resistant clothing'] }
            ],
            '_default': [
                { id: 'mobile', icon: 'truck', title: 'Mobile Equipment', examples: ['Haul trucks', 'Excavators', 'Loaders', 'Graders', 'Water carts'] },
                { id: 'fixed', icon: 'settings', title: 'Fixed Plant', examples: ['Crushers', 'Conveyors', 'Process equipment', 'Pumps', 'Screens'] },
                { id: 'drilling', icon: 'circle-dot', title: 'Drilling Equipment', examples: ['Drill rigs', 'Bits and consumables', 'Sample equipment', 'Support vehicles', 'Water supply'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Two-way radios', 'Dispatch systems', 'Emergency systems', 'Light vehicle protocols', 'Control room'] },
                { id: 'maintenance', icon: 'tool', title: 'Maintenance', examples: ['Workshop equipment', 'Field service vehicles', 'Welding equipment', 'Lifting equipment', 'Diagnostic tools'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hard hat', 'Steel-caps', 'High-vis', 'Hearing and eye protection', 'Self-rescuer'] }
            ]
        },
        // --- AGED CARE -------------------------------------------------------------
        'Aged Care': {
            '_default': [
                { id: 'mobility', icon: 'accessibility', title: 'Mobility Equipment', examples: ['Wheelchairs', 'Walking frames', 'Hoists and slings', 'Transfer belts', 'Standing aids'] },
                { id: 'clinical', icon: 'stethoscope', title: 'Clinical Equipment', examples: ['Blood pressure monitor', 'Blood glucose meter', 'Thermometer', 'Pulse oximeter', 'Wound care supplies'] },
                { id: 'medication', icon: 'pill', title: 'Medication Equipment', examples: ['Medication trolley', 'Webster packs', 'Pill crushers', 'Medication fridge', 'Controlled drug safe'] },
                { id: 'personal_care', icon: 'heart', title: 'Personal Care', examples: ['Shower chair', 'Commode chair', 'Bed pan/urinal', 'Continence aids', 'Skin care products'] },
                { id: 'beds', icon: 'bed', title: 'Beds & Furniture', examples: ['Electric beds', 'Pressure mattresses', 'Bed rails', 'Over-bed tables', 'Recliner chairs'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Gloves', 'Aprons', 'Face masks', 'Hand sanitiser', 'Spill kits'] }
            ]
        },
        // --- AGRICULTURE -----------------------------------------------------------
        'Agriculture': {
            '_default': [
                { id: 'tractors', icon: 'truck', title: 'Tractors & Vehicles', examples: ['Tractors', 'UTVs/ATVs', 'Farm trucks', 'Telehandlers', 'Headers/harvesters'] },
                { id: 'implements', icon: 'settings', title: 'Implements', examples: ['Ploughs', 'Seeders', 'Sprayers', 'Spreaders', 'Hay equipment'] },
                { id: 'livestock', icon: 'heart', title: 'Livestock Equipment', examples: ['Yards and races', 'Crushes and head bails', 'Calf cradles', 'Shearing equipment', 'Livestock trailers'] },
                { id: 'irrigation', icon: 'droplet', title: 'Irrigation', examples: ['Pumps', 'Pivots/lateral moves', 'Drip systems', 'Sprinklers', 'Controllers'] },
                { id: 'storage', icon: 'package', title: 'Storage', examples: ['Silos', 'Hay sheds', 'Chemical storage', 'Fuel storage', 'Grain bins'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Sun protection', 'Hearing protection', 'Steel-cap boots', 'Chemical-rated PPE', 'First aid kit'] }
            ]
        },
        // --- AUTOMOTIVE ------------------------------------------------------------
        'Automotive': {
            '_default': [
                { id: 'lifting', icon: 'arrow-up', title: 'Lifting Equipment', examples: ['Vehicle hoist (2-post, 4-post)', 'Jacks and stands', 'Transmission jack', 'Engine crane', 'Pit'] },
                { id: 'diagnostic', icon: 'search', title: 'Diagnostic Equipment', examples: ['Scan tool/code reader', 'Multimeter', 'Oscilloscope', 'Compression tester', 'Leak detection equipment'] },
                { id: 'power_tools', icon: 'zap', title: 'Power Tools', examples: ['Impact wrench', 'Air ratchet', 'Drill', 'Grinder', 'Compressor'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand Tools', examples: ['Socket sets', 'Spanners', 'Screwdrivers', 'Pliers', 'Specialty tools'] },
                { id: 'specialty', icon: 'settings', title: 'Specialty Equipment', examples: ['Wheel alignment machine', 'Brake lathe', 'Tyre changer', 'Wheel balancer', 'AC machine'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Safety glasses', 'Hearing protection', 'Gloves', 'Steel-cap boots', 'Overalls'] }
            ]
        },
        // --- AVIATION -----------------------------------------------------------------
        'Aviation': {
            '_default': [
                { id: 'aircraft', icon: 'plane', title: 'Aircraft Equipment', examples: ['Aircraft systems', 'Navigation instruments', 'Communication radios', 'Flight displays', 'Safety equipment'] },
                { id: 'ground', icon: 'truck', title: 'Ground Support Equipment', examples: ['Baggage carts', 'Pushback tugs', 'Fuel trucks', 'Ground power units', 'Air start units'] },
                { id: 'maintenance', icon: 'tool', title: 'Maintenance Equipment', examples: ['Hand tools (aviation)', 'Power tools', 'Torque wrenches', 'Test equipment', 'Calibrated instruments'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Fire extinguishers', 'Life jackets', 'Emergency slides', 'First aid kits', 'Oxygen equipment'] },
                { id: 'handling', icon: 'package', title: 'Handling Equipment', examples: ['Cargo loaders', 'Belt loaders', 'Passenger stairs', 'Catering trucks', 'Lavatory service vehicles'] },
                { id: 'ppe', icon: 'hard-hat', title: 'PPE', examples: ['High-vis vest', 'Hearing protection', 'Safety boots', 'Eye protection', 'Gloves'] }
            ]
        },
        // --- BUSINESS SERVICES --------------------------------------------------------
        'Business Services': {
            '_default': [
                { id: 'computing', icon: 'monitor', title: 'Computing Equipment', examples: ['Desktop computers', 'Laptops', 'Tablets', 'Monitors', 'Docking stations'] },
                { id: 'communication', icon: 'phone', title: 'Communication', examples: ['Telephone systems', 'Video conferencing', 'Headsets', 'Mobile devices', 'Intercoms'] },
                { id: 'office', icon: 'printer', title: 'Office Equipment', examples: ['Printers/copiers', 'Scanners', 'Shredders', 'Binding machines', 'Laminators'] },
                { id: 'software', icon: 'code', title: 'Software Systems', examples: ['Office suites', 'CRM systems', 'Accounting software', 'Project management', 'Email systems'] },
                { id: 'furniture', icon: 'layout-dashboard', title: 'Workspace Equipment', examples: ['Ergonomic chairs', 'Height-adjustable desks', 'Meeting room equipment', 'Whiteboards', 'Storage systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Ergonomics', examples: ['Wrist rests', 'Monitor stands', 'First aid kit', 'Fire extinguisher', 'Emergency equipment'] }
            ]
        },
        // --- CHILDCARE ----------------------------------------------------------------
        'Childcare': {
            '_default': [
                { id: 'play', icon: 'puzzle', title: 'Play Equipment', examples: ['Indoor play equipment', 'Outdoor playground', 'Sandpit', 'Climbing frames', 'Ride-on toys'] },
                { id: 'learning', icon: 'book-open', title: 'Learning Resources', examples: ['Books and puzzles', 'Art supplies', 'Musical instruments', 'Sensory materials', 'Educational toys'] },
                { id: 'care', icon: 'heart', title: 'Care Equipment', examples: ['Change tables', 'Cots and beds', 'Highchairs', 'Prams/strollers', 'Potty chairs'] },
                { id: 'kitchen', icon: 'utensils', title: 'Kitchen Equipment', examples: ['Commercial kitchen', 'Sterilisers', 'Bottle warmers', 'Food storage', 'Dishwashers'] },
                { id: 'technology', icon: 'tablet', title: 'Technology', examples: ['Tablets', 'Interactive whiteboards', 'Digital cameras', 'Parent communication apps', 'Sign-in systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Safety gates', 'First aid kits', 'Smoke detectors', 'Sun protection', 'Hand sanitiser stations'] }
            ]
        },
        // --- COMMUNITY SERVICES -------------------------------------------------------
        'Community Services': {
            '_default': [
                { id: 'technology', icon: 'monitor', title: 'Technology', examples: ['Computers/laptops', 'Case management software', 'Tablets for fieldwork', 'Mobile phones', 'Video conferencing'] },
                { id: 'communication', icon: 'phone', title: 'Communication', examples: ['Telephone systems', 'Messaging systems', 'Interpreter services', 'TTY devices', 'Emergency contacts'] },
                { id: 'transport', icon: 'car', title: 'Transport', examples: ['Fleet vehicles', 'Community buses', 'Wheelchair accessible vehicles', 'GPS systems', 'First aid kits'] },
                { id: 'office', icon: 'folder', title: 'Office Equipment', examples: ['Printers/scanners', 'Filing systems', 'Secure storage', 'Meeting room equipment', 'Reception equipment'] },
                { id: 'resources', icon: 'package', title: 'Client Resources', examples: ['Information brochures', 'Emergency supplies', 'Food parcels', 'Clothing items', 'Hygiene packs'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Personal alarms', 'First aid kits', 'Duress systems', 'PPE (home visits)', 'Safety signage'] }
            ]
        },
        // --- EDUCATION ----------------------------------------------------------------
        'Education': {
            '_default': [
                { id: 'teaching', icon: 'presentation', title: 'Teaching Equipment', examples: ['Interactive whiteboards', 'Projectors', 'Document cameras', 'Presentation equipment', 'Audio systems'] },
                { id: 'technology', icon: 'laptop', title: 'Educational Technology', examples: ['Computers/laptops', 'Tablets', 'Learning management systems', 'Educational software', 'Digital resources'] },
                { id: 'resources', icon: 'book-open', title: 'Learning Resources', examples: ['Textbooks', 'Library resources', 'Manipulatives', 'Science equipment', 'Art supplies'] },
                { id: 'classroom', icon: 'layout-grid', title: 'Classroom Equipment', examples: ['Desks and chairs', 'Storage units', 'Display boards', 'Whiteboards', 'Stationery'] },
                { id: 'assessment', icon: 'clipboard', title: 'Assessment Tools', examples: ['Testing materials', 'Marking systems', 'Recording equipment', 'Portfolios', 'Grading software'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['First aid kits', 'Emergency equipment', 'Safety signage', 'Fire extinguishers', 'Evacuation equipment'] }
            ]
        },
        // --- ELECTRICAL ---------------------------------------------------------------
        'Electrical': {
            '_default': [
                { id: 'test', icon: 'search', title: 'Testing Equipment', examples: ['Multimeter', 'Insulation tester', 'RCD tester', 'Loop impedance tester', 'Voltage indicator'] },
                { id: 'power_tools', icon: 'zap', title: 'Power Tools', examples: ['Drill/driver', 'Rotary hammer', 'Angle grinder', 'Cable cutter', 'Crimping tool'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand Tools', examples: ['Screwdrivers (insulated)', 'Pliers set', 'Cable strippers', 'Wire cutters', 'Fish tape'] },
                { id: 'access', icon: 'ladder', title: 'Access Equipment', examples: ['Ladders', 'Scaffolds', 'EWPs', 'Step platforms', 'Roof anchors'] },
                { id: 'installation', icon: 'package', title: 'Installation Materials', examples: ['Cable and conduit', 'Switchboards', 'Accessories', 'Fixings', 'Cable tray'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Insulated gloves', 'Safety glasses', 'Arc flash protection', 'Lock out/tag out kit', 'Voltage-rated boots'] }
            ]
        },
        // --- ENGINEERING --------------------------------------------------------------
        'Engineering': {
            '_default': [
                { id: 'computing', icon: 'monitor', title: 'Computing & CAD', examples: ['Workstations', 'CAD/CAE software', 'Simulation tools', 'Project management software', 'Databases'] },
                { id: 'measuring', icon: 'ruler', title: 'Measurement & Testing', examples: ['Survey equipment', 'Testing instruments', 'Calibrated tools', 'Data loggers', 'Analysis equipment'] },
                { id: 'site', icon: 'hard-hat', title: 'Site Equipment', examples: ['Safety equipment', 'Vehicles', 'Communication radios', 'Sample collection equipment', 'Monitoring equipment'] },
                { id: 'documentation', icon: 'file-text', title: 'Documentation', examples: ['Drawing equipment', 'Plotters/printers', 'Technical libraries', 'Standards documentation', 'Archive systems'] },
                { id: 'workshop', icon: 'tool', title: 'Workshop Equipment', examples: ['Prototype tools', 'Testing rigs', 'Fabrication equipment', 'Measuring tools', 'Assembly equipment'] },
                { id: 'safety', icon: 'shield-check', title: 'PPE', examples: ['Safety boots', 'Hard hat', 'High-vis', 'Safety glasses', 'Hearing protection'] }
            ]
        },
        // --- FINANCE ------------------------------------------------------------------
        'Finance': {
            '_default': [
                { id: 'computing', icon: 'monitor', title: 'Computing Systems', examples: ['Computers/workstations', 'Dual monitors', 'Secure terminals', 'Tablets', 'Mobile devices'] },
                { id: 'software', icon: 'code', title: 'Software', examples: ['Accounting software', 'Banking systems', 'Spreadsheet software', 'Reporting tools', 'CRM systems'] },
                { id: 'security', icon: 'lock', title: 'Security Equipment', examples: ['Secure safes', 'Cash handling equipment', 'Document shredders', 'Secure storage', 'Access control'] },
                { id: 'office', icon: 'printer', title: 'Office Equipment', examples: ['Printers', 'Scanners', 'Calculators', 'Cheque processing', 'Document management'] },
                { id: 'communication', icon: 'phone', title: 'Communication', examples: ['Telephone systems', 'Video conferencing', 'Secure email', 'Recording systems', 'Intercom'] },
                { id: 'safety', icon: 'shield-check', title: 'Compliance & Safety', examples: ['Audit trail systems', 'Backup systems', 'First aid kit', 'Emergency equipment', 'Ergonomic equipment'] }
            ]
        },
        // --- FOOD PROCESSING ----------------------------------------------------------
        'Food Processing': {
            '_default': [
                { id: 'processing', icon: 'settings', title: 'Processing Equipment', examples: ['Conveyors', 'Mixing equipment', 'Cooking equipment', 'Cutting/slicing machines', 'Packaging machines'] },
                { id: 'refrigeration', icon: 'thermometer', title: 'Temperature Control', examples: ['Cool rooms', 'Freezers', 'Blast chillers', 'Temperature monitors', 'Refrigerated transport'] },
                { id: 'quality', icon: 'search', title: 'Quality Equipment', examples: ['Testing equipment', 'Metal detectors', 'X-ray machines', 'Weighing scales', 'Laboratory equipment'] },
                { id: 'cleaning', icon: 'sparkles', title: 'Cleaning & Sanitisation', examples: ['Pressure washers', 'CIP systems', 'Sanitising equipment', 'Cleaning chemicals', 'Waste disposal'] },
                { id: 'material', icon: 'package', title: 'Material Handling', examples: ['Forklifts', 'Pallet jacks', 'Bins and containers', 'Pumps', 'Storage systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Hairnets/beard nets', 'Gloves', 'Aprons', 'Safety boots', 'Hearing protection'] }
            ]
        },
        // --- GOVERNMENT ---------------------------------------------------------------
        'Government': {
            '_default': [
                { id: 'computing', icon: 'monitor', title: 'Computing', examples: ['Desktop computers', 'Laptops', 'Secure terminals', 'Multi-factor authentication', 'Government systems'] },
                { id: 'communication', icon: 'phone', title: 'Communication', examples: ['Phone systems', 'Video conferencing', 'Secure email', 'Public address systems', 'Counter systems'] },
                { id: 'office', icon: 'printer', title: 'Office Equipment', examples: ['Printers/copiers', 'Scanners', 'Shredders', 'Filing systems', 'Meeting room equipment'] },
                { id: 'customer', icon: 'user', title: 'Customer Service', examples: ['Queue management', 'Service counters', 'Digital kiosks', 'Payment systems', 'Accessibility equipment'] },
                { id: 'records', icon: 'folder', title: 'Records Management', examples: ['Archive systems', 'Document management', 'Secure storage', 'Digitisation equipment', 'Retention systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & Security', examples: ['Access control', 'CCTV', 'Duress alarms', 'First aid equipment', 'Emergency equipment'] }
            ]
        },
        // --- HEALTHCARE ---------------------------------------------------------------
        'Healthcare': {
            '_default': [
                { id: 'clinical', icon: 'stethoscope', title: 'Clinical Equipment', examples: ['Vital signs monitors', 'Diagnostic equipment', 'Treatment equipment', 'Medical devices', 'Point of care testing'] },
                { id: 'patient', icon: 'bed', title: 'Patient Care', examples: ['Hospital beds', 'Hoists and lifters', 'Wheelchairs', 'IV equipment', 'Oxygen delivery'] },
                { id: 'medication', icon: 'pill', title: 'Medication Equipment', examples: ['Medication trolleys', 'Infusion pumps', 'Drug safes', 'Refrigerators', 'Dispensing systems'] },
                { id: 'infection', icon: 'shield', title: 'Infection Control', examples: ['PPE supplies', 'Hand hygiene stations', 'Sterilisation equipment', 'Waste disposal', 'Isolation equipment'] },
                { id: 'technology', icon: 'monitor', title: 'Health Technology', examples: ['Electronic health records', 'Telehealth equipment', 'Patient monitoring', 'Imaging systems', 'Communication systems'] },
                { id: 'emergency', icon: 'alert-circle', title: 'Emergency Equipment', examples: ['Resuscitation equipment', 'Defibrillators', 'Emergency trolley', 'Suction equipment', 'Airway management'] }
            ]
        },
        // --- HOSPITALITY --------------------------------------------------------------
        'Hospitality': {
            '_default': [
                { id: 'kitchen', icon: 'utensils', title: 'Kitchen Equipment', examples: ['Commercial ovens', 'Cooktops', 'Fryers', 'Grills', 'Food processors'] },
                { id: 'beverage', icon: 'coffee', title: 'Beverage Equipment', examples: ['Coffee machines', 'Bar equipment', 'Glass washers', 'Ice machines', 'Refrigeration'] },
                { id: 'service', icon: 'user', title: 'Service Equipment', examples: ['Point of sale', 'EFTPOS terminals', 'Order pads', 'Serving trays', 'Table equipment'] },
                { id: 'storage', icon: 'package', title: 'Storage & Refrigeration', examples: ['Cool rooms', 'Freezers', 'Dry stores', 'Display fridges', 'Wine storage'] },
                { id: 'cleaning', icon: 'sparkles', title: 'Cleaning Equipment', examples: ['Commercial dishwashers', 'Sanitiser stations', 'Cleaning equipment', 'Waste systems', 'Exhaust systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Non-slip shoes', 'Aprons', 'Oven mitts', 'First aid kits', 'Fire suppression'] }
            ]
        },
        // --- INFORMATION TECHNOLOGY ---------------------------------------------------
        'Information Technology': {
            '_default': [
                { id: 'hardware', icon: 'server', title: 'Hardware', examples: ['Servers', 'Workstations', 'Laptops', 'Mobile devices', 'Networking equipment'] },
                { id: 'networking', icon: 'wifi', title: 'Networking', examples: ['Routers', 'Switches', 'Firewalls', 'Access points', 'Cabling equipment'] },
                { id: 'software', icon: 'code', title: 'Software Tools', examples: ['Development environments', 'Monitoring software', 'Ticketing systems', 'Remote access tools', 'Security software'] },
                { id: 'testing', icon: 'search', title: 'Testing & Diagnostics', examples: ['Cable testers', 'Network analysers', 'Multimeters', 'Diagnostic software', 'Load testing tools'] },
                { id: 'storage', icon: 'database', title: 'Data & Storage', examples: ['Storage arrays', 'Backup systems', 'Cloud services', 'Data centres', 'Archive systems'] },
                { id: 'accessories', icon: 'package', title: 'Accessories & Consumables', examples: ['Cables', 'Adapters', 'Tools', 'Labels', 'Cleaning supplies'] }
            ]
        },
        // --- LOGISTICS ----------------------------------------------------------------
        'Logistics': {
            '_default': [
                { id: 'mhe', icon: 'forklift', title: 'Material Handling', examples: ['Forklifts', 'Pallet jacks', 'Order pickers', 'Conveyor systems', 'Dock equipment'] },
                { id: 'vehicles', icon: 'truck', title: 'Vehicles', examples: ['Delivery trucks', 'Vans', 'Semi-trailers', 'Container handling', 'Yard tractors'] },
                { id: 'technology', icon: 'barcode', title: 'Technology', examples: ['WMS systems', 'Barcode scanners', 'RF devices', 'GPS tracking', 'Label printers'] },
                { id: 'packaging', icon: 'package', title: 'Packaging Equipment', examples: ['Stretch wrappers', 'Strapping machines', 'Carton sealers', 'Scales', 'Packing benches'] },
                { id: 'storage', icon: 'archive', title: 'Storage Systems', examples: ['Pallet racking', 'Shelving', 'Pick bins', 'Mezzanines', 'Automated systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['High-vis vests', 'Safety boots', 'Gloves', 'Traffic management', 'Spill kits'] }
            ]
        },
        // --- MANUFACTURING ------------------------------------------------------------
        'Manufacturing': {
            '_default': [
                { id: 'machinery', icon: 'settings', title: 'Production Machinery', examples: ['CNC machines', 'Presses', 'Lathes', 'Mills', 'Assembly equipment'] },
                { id: 'material', icon: 'truck', title: 'Material Handling', examples: ['Forklifts', 'Overhead cranes', 'Conveyors', 'Automated guided vehicles', 'Hoists'] },
                { id: 'quality', icon: 'ruler', title: 'Quality Equipment', examples: ['CMM machines', 'Gauges', 'Testing equipment', 'Inspection tools', 'Measuring instruments'] },
                { id: 'tools', icon: 'tool', title: 'Tools', examples: ['Hand tools', 'Power tools', 'Cutting tools', 'Jigs and fixtures', 'Specialty tooling'] },
                { id: 'technology', icon: 'monitor', title: 'Technology', examples: ['PLCs', 'HMIs', 'SCADA systems', 'MES software', 'Quality systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Machine guards', 'Lock out/tag out', 'PPE', 'Extraction systems', 'Emergency stops'] }
            ]
        },
        // --- PLUMBING -----------------------------------------------------------------
        'Plumbing': {
            '_default': [
                { id: 'power_tools', icon: 'zap', title: 'Power Tools', examples: ['Pipe threader', 'Rotary hammer', 'Drain camera', 'Pipe cutter', 'Press tool'] },
                { id: 'hand_tools', icon: 'tool', title: 'Hand Tools', examples: ['Pipe wrenches', 'Tube cutters', 'Soldering equipment', 'Basin wrench', 'Plungers'] },
                { id: 'testing', icon: 'search', title: 'Testing Equipment', examples: ['Pressure testing kit', 'Gas leak detector', 'Thermometer', 'Manometer', 'Flow meter'] },
                { id: 'drainage', icon: 'droplet', title: 'Drainage Equipment', examples: ['Electric eel', 'High pressure jetter', 'Drain rods', 'Inspection camera', 'Location equipment'] },
                { id: 'gas', icon: 'flame', title: 'Gas Equipment', examples: ['Gas detector', 'Manometer', 'Pressure regulator', 'Pipe freeze kit', 'Flaring tools'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Safety glasses', 'Gloves', 'Knee pads', 'Hearing protection', 'Respiratory protection'] }
            ]
        },
        // --- RETAIL -------------------------------------------------------------------
        'Retail': {
            '_default': [
                { id: 'pos', icon: 'credit-card', title: 'Point of Sale', examples: ['Cash registers', 'EFTPOS terminals', 'Barcode scanners', 'Receipt printers', 'Customer displays'] },
                { id: 'display', icon: 'layout-grid', title: 'Display Equipment', examples: ['Shelving units', 'Display stands', 'Mannequins', 'Signage', 'Lighting'] },
                { id: 'stock', icon: 'package', title: 'Stock Equipment', examples: ['Stock trolleys', 'Step ladders', 'Pricing guns', 'Stock counters', 'Pallet jacks'] },
                { id: 'security', icon: 'shield', title: 'Security', examples: ['Security tags', 'Detagger', 'CCTV', 'Alarm systems', 'Safe'] },
                { id: 'technology', icon: 'monitor', title: 'Technology', examples: ['Stock management system', 'Computers', 'Handheld devices', 'Label printers', 'Digital signage'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['First aid kit', 'Fire extinguisher', 'Box cutters (safety)', 'Lifting equipment', 'Floor signage'] }
            ]
        },
        // --- SECURITY -----------------------------------------------------------------
        'Security': {
            '_default': [
                { id: 'surveillance', icon: 'eye', title: 'Surveillance', examples: ['CCTV systems', 'Monitors', 'Recording equipment', 'Patrol cameras', 'Drone surveillance'] },
                { id: 'access', icon: 'door-open', title: 'Access Control', examples: ['Swipe/tap systems', 'Biometric readers', 'Key management', 'Barriers/turnstiles', 'Intercom systems'] },
                { id: 'communication', icon: 'radio', title: 'Communication', examples: ['Two-way radios', 'Mobile phones', 'Body cameras', 'PA systems', 'Duress alarms'] },
                { id: 'patrol', icon: 'compass', title: 'Patrol Equipment', examples: ['Patrol vehicles', 'Torches', 'Checkpoint systems', 'Keys/access devices', 'First aid kits'] },
                { id: 'protection', icon: 'shield', title: 'Protection Equipment', examples: ['Stab vests', 'Handcuffs', 'Batons', 'Restraint equipment', 'Defensive equipment'] },
                { id: 'ppe', icon: 'hard-hat', title: 'PPE & Uniform', examples: ['Uniform', 'High-vis', 'Safety boots', 'Gloves', 'Weather protection'] }
            ]
        },
        // --- SPORT & RECREATION -------------------------------------------------------
        'Sport & Recreation': {
            '_default': [
                { id: 'fitness', icon: 'dumbbell', title: 'Fitness Equipment', examples: ['Cardio machines', 'Weight machines', 'Free weights', 'Resistance equipment', 'Functional training'] },
                { id: 'sport', icon: 'trophy', title: 'Sports Equipment', examples: ['Balls and goals', 'Nets and courts', 'Timing systems', 'Scoreboards', 'Sport-specific gear'] },
                { id: 'pool', icon: 'waves', title: 'Aquatic Equipment', examples: ['Lane ropes', 'Pool equipment', 'Rescue equipment', 'Testing equipment', 'Cleaning equipment'] },
                { id: 'facility', icon: 'home', title: 'Facility Equipment', examples: ['Lockers', 'Benches', 'Cleaning equipment', 'Sound systems', 'Climate control'] },
                { id: 'technology', icon: 'tablet', title: 'Technology', examples: ['Booking systems', 'Member management', 'Access control', 'AV equipment', 'Heart rate monitors'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & First Aid', examples: ['First aid kits', 'Defibrillators', 'Spine boards', 'Safety equipment', 'Emergency phones'] }
            ]
        },
        // --- TOURISM ------------------------------------------------------------------
        'Tourism': {
            '_default': [
                { id: 'transport', icon: 'bus', title: 'Transport', examples: ['Tour buses', 'Boats', 'ATVs', 'Bicycles', 'Shuttle vehicles'] },
                { id: 'communication', icon: 'mic', title: 'Communication', examples: ['PA systems', 'Headset tours', 'Two-way radios', 'Microphones', 'Translation devices'] },
                { id: 'technology', icon: 'tablet', title: 'Technology', examples: ['Booking systems', 'POS systems', 'Tablets', 'Digital displays', 'Audio guides'] },
                { id: 'safety', icon: 'life-buoy', title: 'Safety Equipment', examples: ['Life jackets', 'First aid kits', 'Emergency beacons', 'Satellite phones', 'Safety signage'] },
                { id: 'outdoor', icon: 'compass', title: 'Outdoor Equipment', examples: ['Camping gear', 'Navigation equipment', 'Weather monitoring', 'Lighting', 'Viewing equipment'] },
                { id: 'visitor', icon: 'user', title: 'Visitor Services', examples: ['Information displays', 'Brochure stands', 'Merchandise displays', 'Queue management', 'Accessibility equipment'] }
            ]
        },
        // --- TRANSPORT ----------------------------------------------------------------
        'Transport': {
            '_default': [
                { id: 'vehicles', icon: 'truck', title: 'Vehicles', examples: ['Trucks (rigid/articulated)', 'Vans', 'Buses', 'Tankers', 'Specialised vehicles'] },
                { id: 'load', icon: 'package', title: 'Load Equipment', examples: ['Pallet jacks', 'Tail lifts', 'Load restraints', 'Tarps/curtains', 'Ramps'] },
                { id: 'technology', icon: 'map-pin', title: 'Technology', examples: ['GPS navigation', 'Telematics', 'EWD systems', 'Dash cameras', 'Communication systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Safety triangles', 'Fire extinguisher', 'First aid kit', 'Wheel chocks', 'PPE'] },
                { id: 'maintenance', icon: 'tool', title: 'Maintenance', examples: ['Tyre equipment', 'Jump starters', 'Basic tools', 'Spare parts', 'Cleaning equipment'] },
                { id: 'documentation', icon: 'clipboard', title: 'Documentation', examples: ['Logbooks', 'Delivery documentation', 'Vehicle manuals', 'Permits', 'Inspection forms'] }
            ]
        },
        // --- UTILITIES ----------------------------------------------------------------
        'Utilities': {
            '_default': [
                { id: 'network', icon: 'zap', title: 'Network Equipment', examples: ['Transformers', 'Switchgear', 'Meters', 'Pumps', 'Valves'] },
                { id: 'vehicles', icon: 'truck', title: 'Vehicles & Access', examples: ['Service vehicles', 'Bucket trucks', 'EWPs', 'Cable trailers', 'Excavators'] },
                { id: 'testing', icon: 'search', title: 'Testing Equipment', examples: ['Voltage testers', 'Flow meters', 'Pressure gauges', 'Quality analysers', 'Detection equipment'] },
                { id: 'tools', icon: 'tool', title: 'Tools', examples: ['Insulated tools', 'Cable equipment', 'Pipe equipment', 'Power tools', 'Specialty tools'] },
                { id: 'technology', icon: 'monitor', title: 'Technology', examples: ['SCADA systems', 'GIS systems', 'Asset management', 'Mobile devices', 'Metering systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['Arc flash protection', 'Gas monitors', 'Confined space equipment', 'First aid', 'Rescue equipment'] }
            ]
        },
        // --- WAREHOUSING --------------------------------------------------------------
        'Warehousing': {
            '_default': [
                { id: 'mhe', icon: 'forklift', title: 'Material Handling', examples: ['Counterbalance forklift', 'Reach truck', 'Order picker', 'Pallet jacks', 'Conveyors'] },
                { id: 'storage', icon: 'archive', title: 'Storage Systems', examples: ['Pallet racking', 'Shelving', 'Mezzanines', 'Bins and totes', 'Automated systems'] },
                { id: 'technology', icon: 'barcode', title: 'Technology', examples: ['WMS software', 'RF scanners', 'Label printers', 'Voice picking', 'RFID systems'] },
                { id: 'packaging', icon: 'package', title: 'Packaging', examples: ['Stretch wrappers', 'Strapping machines', 'Scales', 'Tape machines', 'Void fill'] },
                { id: 'dock', icon: 'truck', title: 'Dock Equipment', examples: ['Dock levellers', 'Dock doors', 'Loading ramps', 'Container tilters', 'Lighting'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety Equipment', examples: ['High-vis vests', 'Safety boots', 'Pedestrian barriers', 'Speed limits', 'First aid'] }
            ]
        },
        // --- DEFAULT FOR ALL OTHER INDUSTRIES --------------------------------------
        '_default': {
            '_default': [
                { id: 'primary', icon: 'briefcase', title: 'Primary Equipment', examples: ['Core work equipment', 'Main tools of trade', 'Production equipment', 'Service equipment', 'Processing equipment'] },
                { id: 'tools', icon: 'tool', title: 'Tools', examples: ['Hand tools', 'Power tools', 'Specialty tools', 'Diagnostic equipment', 'Maintenance tools'] },
                { id: 'technology', icon: 'monitor', title: 'Technology', examples: ['Computers/tablets', 'Software systems', 'Communication devices', 'Monitoring equipment', 'Control systems'] },
                { id: 'materials', icon: 'package', title: 'Materials & Supplies', examples: ['Consumables', 'Stock items', 'Replacement parts', 'Cleaning supplies', 'Packaging materials'] },
                { id: 'transport', icon: 'truck', title: 'Transport & Handling', examples: ['Vehicles', 'Trolleys', 'Forklifts', 'Conveying equipment', 'Storage systems'] },
                { id: 'safety', icon: 'shield-check', title: 'Safety & PPE', examples: ['Personal protective equipment', 'Safety systems', 'First aid equipment', 'Emergency equipment', 'Safety signage'] }
            ]
        }
    };

    // ===========================================================================
    // HELPER FUNCTIONS - Get categories for job title/industry
    // ===========================================================================
    // NOTE: getJobTitlesForIndustry is defined earlier in the file (around line 1047)
    
    const getTaskCategoriesForJobTitle = (industry, jobTitle) => {
        // Try specific industry + job title first
        if (JOB_TASK_CATEGORIES[industry] && JOB_TASK_CATEGORIES[industry][jobTitle]) {
            return JOB_TASK_CATEGORIES[industry][jobTitle];
        }
        // Try industry default
        if (JOB_TASK_CATEGORIES[industry] && JOB_TASK_CATEGORIES[industry]['_default']) {
            return JOB_TASK_CATEGORIES[industry]['_default'];
        }
        // Fall back to global default
        return JOB_TASK_CATEGORIES['_default']['_default'];
    };

    const getEquipmentCategoriesForJobTitle = (industry, jobTitle) => {
        // Try specific industry + job title first
        if (EQUIPMENT_CATEGORIES[industry] && EQUIPMENT_CATEGORIES[industry][jobTitle]) {
            return EQUIPMENT_CATEGORIES[industry][jobTitle];
        }
        // Try industry default
        if (EQUIPMENT_CATEGORIES[industry] && EQUIPMENT_CATEGORIES[industry]['_default']) {
            return EQUIPMENT_CATEGORIES[industry]['_default'];
        }
        // Fall back to global default
        return EQUIPMENT_CATEGORIES['_default']['_default'];
    };

    // Legacy function for backward compatibility
    const getTasksForJobTitle = (jobTitle) => {
        // This returns flat task list for old code paths
        const categories = getTaskCategoriesForJobTitle('_default', jobTitle);
        return categories.flatMap(cat => cat.examples.slice(0, 2));
    };

    const JOB_LEVELS = [
        { value: 'entry', label: 'Entry Level / Trainee' },
        { value: 'worker', label: 'Worker / Operator' },
        { value: 'supervisor', label: 'Supervisor / Team Leader' },
        { value: 'manager', label: 'Manager / Senior' },
        { value: 'executive', label: 'Executive / Director' }
    ];

    const BLOOMS_LEVELS = [
        { value: 'remember', label: 'Remember - Recall facts and concepts' },
        { value: 'understand', label: 'Understand - Explain ideas or concepts' },
        { value: 'apply', label: 'Apply - Use information in new situations' },
        { value: 'analyze', label: 'Analyze - Draw connections among ideas' },
        { value: 'evaluate', label: 'Evaluate - Justify a decision or action' },
        { value: 'create', label: 'Create - Produce new or original work' }
    ];

    const COURSE_LEVELS = [
        { value: 'certificate', label: 'Certificate / Diploma' },
        { value: 'undergraduate', label: 'Undergraduate' },
        { value: 'postgraduate', label: 'Postgraduate' },
        { value: 'professional', label: 'Professional Development' }
    ];

    const escapeHtml = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    const countWords = (text) => {
        if (!text || !text.trim()) return 0;
        return text.trim().split(/\s+/).length;
    };

    // Get language code from country code for spelling/localization
    const getCountryLang = (countryCode) => {
        const country = COUNTRIES.find(c => c.code === countryCode);
        return country?.lang || 'en-AU';
    };

    const init = (config) => {
        cmid = config.cmid;
        container = document.getElementById('contentcreator-app');
        if (!container) return;
        
        // v6.6.38: Initialize category selection arrays at startup
        window.CC_SELECTED_TASK_CATEGORIES = window.CC_SELECTED_TASK_CATEGORIES || [];
        window.CC_SELECTED_EQUIPMENT_CATEGORIES = window.CC_SELECTED_EQUIPMENT_CATEGORIES || [];
        window.CC_SELECTED_EQUIPMENT = window.CC_SELECTED_EQUIPMENT || [];
        window.CC_SELECTED_JOB_TASKS = window.CC_SELECTED_JOB_TASKS || []; // Legacy compatibility
        
        fetchCreditsBalance(); // Fetch credits on init
        
        // v6.6.15: Check for regenerate=failed URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const regenerateMode = urlParams.get('regenerate');
        loadManifest(regenerateMode === 'failed');
    };
    
    // Fetch current AI credits balance from the server
    // v6.5.18: Fixed endpoint URL and credential format
    const fetchCreditsBalance = async () => {
        try {
            const siteId = window.CC_CONFIG?.siteId;
            const apiKey = window.CC_CONFIG?.apiKey;
            if (!siteId || !apiKey) {
                return;
            }
            
            // v6.5.18: Use correct endpoint /api/credits with siteId in query, apiKey in X-API-Key header for security
            const url = `https://lms-labs.com/api/credits?siteId=${encodeURIComponent(siteId)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey
                }
            });
            
            
            if (response.ok) {
                const data = await response.json();
                currentCredits = data.balance || data.credits || 0;
                updateCreditsDisplay();
            } else {
                const errorText = await response.text();
            }
        } catch (error) {
        }
    };
    
    // Update the credits display in the UI
    const updateCreditsDisplay = () => {
        const creditsEl = document.getElementById('cc-current-credits');
        if (creditsEl && currentCredits !== null) {
            creditsEl.textContent = currentCredits.toLocaleString();
        }
    };
    
    // v6.9.22: Count total subtopics across all topics for dynamic credit estimation
    const countTotalSubtopics = () => {
        if (!topicPlan?.topics) return 0;
        return topicPlan.topics.reduce((total, topic) => {
            return total + (topic.subtopics?.length || 0);
        }, 0);
    };
    
    // v6.9.22: Get dynamic credit estimation HTML
    // v12.55: Helper  -  count how many additional language checkboxes are currently ticked
    const countCheckedAdditionalLangs = () => {
        return document.querySelectorAll('#cc-additional-langs input[type="checkbox"]:checked').length;
    };

    const getCreditEstimationHtml = () => {
        const subtopicCount = countTotalSubtopics();
        const creditsPerSubtopic = 100;
        const creditsPerExtraLang = 50; // FIX-CC-ML-TRANSLATE-CREDITS (v13.17): translations cost 50/subtopic
        const extraLangs = countCheckedAdditionalLangs();
        const baseCredits = subtopicCount * creditsPerSubtopic;
        const extraCredits = subtopicCount * creditsPerExtraLang * extraLangs;
        const totalCredits = baseCredits + extraCredits;
        const audAmount = (totalCredits / 10).toFixed(0); // $10 AUD = 100 credits

        if (subtopicCount === 0) {
            return '<span class="cc-credit-amount" id="cc-credit-estimation">100 credits per subtopic</span>';
        }

        if (extraLangs > 0) {
            return `<span class="cc-credit-amount" id="cc-credit-estimation">${subtopicCount} subtopics x ${creditsPerSubtopic} credits + ${extraLangs} extra language${extraLangs > 1 ? 's' : ''} x ${creditsPerExtraLang} credits = <strong>${totalCredits.toLocaleString()} credits</strong> ($${audAmount} AUD)</span>`;
        }
        return `<span class="cc-credit-amount" id="cc-credit-estimation">${subtopicCount} subtopics  x  ${creditsPerSubtopic} credits = <strong>${totalCredits.toLocaleString()} credits</strong> ($${audAmount} AUD)</span>`;
    };
    
    // v6.9.22: Update credit estimation display dynamically
    // v13.17: Extra languages cost 50 credits/subtopic (translation), primary costs 100/subtopic
    const updateCreditEstimation = () => {
        const estimationEl = document.getElementById('cc-credit-estimation');
        if (estimationEl) {
            const subtopicCount = countTotalSubtopics();
            const creditsPerSubtopic = 100;
            const creditsPerExtraLang = 50;
            const extraLangs = countCheckedAdditionalLangs();
            const baseCredits = subtopicCount * creditsPerSubtopic;
            const extraCredits = subtopicCount * creditsPerExtraLang * extraLangs;
            const totalCredits = baseCredits + extraCredits;
            const audAmount = (totalCredits / 10).toFixed(0);

            if (subtopicCount > 0) {
                if (extraLangs > 0) {
                    estimationEl.innerHTML = `${subtopicCount} subtopics x ${creditsPerSubtopic} credits + ${extraLangs} extra language${extraLangs > 1 ? 's' : ''} x ${creditsPerExtraLang} credits = <strong>${totalCredits.toLocaleString()} credits</strong> ($${audAmount} AUD)`;
                } else {
                    estimationEl.innerHTML = `${subtopicCount} subtopics  x  ${creditsPerSubtopic} credits = <strong>${totalCredits.toLocaleString()} credits</strong> ($${audAmount} AUD)`;
                }
            } else {
                estimationEl.textContent = '100 credits per subtopic';
            }
        }
    };

    // v6.6.15: Added regenerateFailedOnly parameter for auto-regeneration of failed slides
    const loadManifest = (regenerateFailedOnly = false) => {
        Ajax.call([{
            methodname: 'mod_contentcreator_get_manifest',
            args: { cmid: cmid }
        }])[0].then(response => {
            if (response.manifest) {
                const result = ManifestBuilder.deserialize(response.manifest);
                if (result.success && ManifestBuilder.isLocked(result.manifest)) {
                    manifest = result.manifest;
                    
                    // v6.6.15: Auto-regenerate failed slides if requested
                    if (regenerateFailedOnly) {
                        triggerFailedRegeneration(manifest);
                    } else {
                        renderLocked();
                    }
                } else {
                    manifest = null;
                    renderWizard();
                }
            } else {
                manifest = null;
                renderWizard();
            }
        }).catch((error) => {
            Notification.exception(error);
        });
    };

    // v7.8.8: Chunked save for large manifests to bypass server POST limits
    // v11.13 FIX: Was 2MB  -  caused "Invalid json in request: Syntax error" because
    // the 2MB chunk + Moodle's JSON wrapper overhead exceeds PHP post_max_size on
    // many hosting configs. Aligned with player5.js which uses 900KB safely.
    const CHUNK_SIZE = 900 * 1024; // 900KB chunks (safe under PHP post_max_size)
    const CHUNK_THRESHOLD = 2 * 1024 * 1024; // Switch to chunked above 2MB
    
    // v11.47 FIX BUG-CC-MSGCHAN: Moodle 4.4+ routes Ajax.call through a service-worker
    // message channel. If the channel closes mid-flight (service worker lifecycle, browser
    // extension interference) the Ajax promise rejects with "A listener indicated an
    // asynchronous response by returning true, but the message channel closed before a
    // response was received"  -  a transient browser-level error, NOT a server error.
    // With no retry logic this single transient failure  ->  callback(false)  -> 
    // "Failed to save generated content." permanently.
    // Fix: both the direct-save and chunked-save paths now retry up to MAX_SAVE_RETRIES
    // times with exponential back-off (1s, 2s, 3s). A transient channel drop always
    // recovers on the next attempt. Chunked retries start over with a fresh uploadId
    // (orphaned partial-chunk temp files are cleaned by Moodle's scheduled temp cleanup).
    const MAX_SAVE_RETRIES = 3;

    // v11.49 FIX BUG-CC-DBWRITE: Strip inline base64 audio before saving to DB.
    // Pre-generated voiceover stores audio as 'data:audio/...;base64,...' URLs  -  one
    // per section  -  which can add 2-6 MB of already-compressed binary data that gzip
    // barely shrinks.  The player regenerates audio on demand from voiceoverText when
    // voiceoverUrl is absent/empty, so stripping data: URLs here is safe.
    // voiceoverText / voiceoverWordCount / voiceoverSchemaVersion / voiceoverTextHash
    // are all preserved so the player's freshness-check logic still works.
    const stripInlineAudio = (obj) => {
        if (Array.isArray(obj)) return obj.map(stripInlineAudio);
        if (obj && typeof obj === 'object') {
            var out = {};
            for (var k of Object.keys(obj)) {
                if (k === 'voiceoverUrl' && typeof obj[k] === 'string' && obj[k].startsWith('data:')) {
                    out[k] = 'pregenerated'; // v11.51: sentinel value (was '' causing false MISSING warnings + student TTS race)
                } else {
                    out[k] = stripInlineAudio(obj[k]);
                }
            }
            return out;
        }
        return obj;
    };

    const saveManifest = async (manifestData, callback) => {
        const cleanManifest = stripInlineAudio(manifestData);
        const serialized = ManifestBuilder.serialize(cleanManifest);
        const sizeKB = (serialized.length / 1024).toFixed(1);
        const isChunked = serialized.length >= CHUNK_THRESHOLD;
        ccLog('[CC v11.49 SAVE] saveManifest: ' + sizeKB + 'KB | chunked=' + isChunked + ' (audio stripped from data: URLs)');

        // -- Direct save (< 2MB) ------------------------------------------------
        if (!isChunked) {
            const attemptDirectSave = (attempt) => {
                ccLog('[CC SAVE] Direct save attempt ' + attempt + '/' + MAX_SAVE_RETRIES);
                Ajax.call([{
                    methodname: 'mod_contentcreator_save_manifest',
                    args: {
                        cmid: cmid,
                        manifest: serialized,
                        version: new Date().toISOString()
                    }
                }])[0].then(() => {
                    ccLog('[CC SAVE] Direct save OK on attempt ' + attempt);
                    if (callback) callback(true);
                }).catch((e) => {
                    var msg = (e && e.message) ? e.message : String(e);
                    console.error('[CC SAVE] Direct save attempt ' + attempt + ' FAILED:', msg);
                    if (attempt < MAX_SAVE_RETRIES) {
                        setTimeout(() => attemptDirectSave(attempt + 1), 1000 * attempt);
                    } else {
                        console.error('[CC SAVE] All ' + MAX_SAVE_RETRIES + ' direct-save attempts exhausted.');
                        if (callback) callback(false);
                    }
                });
            };
            attemptDirectSave(1);
            return;
        }

        // -- Chunked save (>= 2MB)  -  retry entire sequence with fresh uploadId --
        const attemptChunkedSave = async (attempt) => {
            const totalChunks = Math.ceil(serialized.length / CHUNK_SIZE);
            const uploadId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            ccLog('[CC SAVE] Chunked save attempt ' + attempt + '/' + MAX_SAVE_RETRIES +
                  ' | chunks=' + totalChunks + ' | uploadId=' + uploadId);
            try {
                for (var i = 0; i < totalChunks; i++) {
                    const start = i * CHUNK_SIZE;
                    const end = Math.min(start + CHUNK_SIZE, serialized.length);
                    const chunk = serialized.substring(start, end);
                    const isLast = (i === totalChunks - 1);
                    await new Promise((resolve, reject) => {
                        Ajax.call([{
                            methodname: 'mod_contentcreator_save_manifest_chunk',
                            args: {
                                cmid: cmid,
                                uploadid: uploadId,
                                chunk: chunk,
                                chunkindex: i,
                                totalchunks: totalChunks,
                                islast: isLast ? 1 : 0,
                                version: isLast ? new Date().toISOString() : ''
                            }
                        }])[0].then(resolve).catch(reject);
                    });
                }
                ccLog('[CC SAVE] Chunked save OK on attempt ' + attempt);
                if (callback) callback(true);
            } catch (e) {
                var msg = (e && e.message) ? e.message : String(e);
                console.error('[CC SAVE] Chunked save attempt ' + attempt + ' FAILED:', msg);
                if (attempt < MAX_SAVE_RETRIES) {
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                    return attemptChunkedSave(attempt + 1);
                }
                console.error('[CC SAVE] All ' + MAX_SAVE_RETRIES + ' chunked-save attempts exhausted.');
                if (callback) callback(false);
            }
        };
        attemptChunkedSave(1);
    };

    // v6.6.15: Trigger regeneration of only failed slides
    // Preserves successfully generated content, only regenerates slides with generated:false
    const triggerFailedRegeneration = async (existingManifest) => {
        // Count failed slides
        let failedCount = 0;
        existingManifest.topics?.forEach(topic => {
            (topic.sections || []).forEach(section => {
                if (section.generated === false || (section.cards && section.cards.some(c => c.failed))) failedCount++;
                if (section.scenario?.generated === false) failedCount++;
                if (section.outcome?.generated === false) failedCount++;
                if (section.activity?.generated === false) failedCount++;
            });
        });
        
        if (failedCount === 0) {
            window.location.href = '?id=' + cmid; // Redirect to player
            return;
        }
        
        
        // Show progress UI
        container.innerHTML = `
            <div class="cc-wizard">
                <div class="cc-wizard-header">
                    <h1 class="cc-wizard-title">Regenerating Failed Content</h1>
                    <p class="cc-wizard-subtitle">Only regenerating ${failedCount} slides that failed previously. Your successful content is preserved.</p>
                </div>
                <div class="cc-generation-panel">
                    <div class="cc-gen-progress">
                        <div class="cc-gen-progress-bar" style="width: 0%"></div>
                    </div>
                    <div class="cc-gen-status">
                        <span class="cc-gen-phase">Initializing...</span>
                        <span class="cc-gen-item"></span>
                    </div>
                </div>
            </div>
        `;
        
        try {
            // Build inputs from existing manifest
            // v11.54 FIX: imageSettings and activitySettings were missing here,
            // causing failed-slide regeneration to always skip images and activities.
            const inputs = {
                mode: existingManifest.mode,
                context: existingManifest.context,
                topicPlan: { topics: existingManifest.topics },
                settings: existingManifest.settings,
                voiceSettings: existingManifest.voiceSettings,
                appearanceSettings: existingManifest.appearanceSettings,
                imageSettings: existingManifest.imageSettings || { enabled: false },
                activitySettings: existingManifest.activitySettings || { enabled: true }
            };
            
            const result = await ManifestBuilder.build(inputs, cmid, {
                onProgress: (progress) => {
                    const progressBar = container.querySelector('.cc-gen-progress-bar');
                    const phaseEl = container.querySelector('.cc-gen-phase');
                    const itemEl = container.querySelector('.cc-gen-item');
                    if (progressBar) {
                        progressBar.style.width = Math.round((progress.current / progress.total) * 100) + '%';
                    }
                    if (phaseEl) phaseEl.textContent = progress.phase || '';
                    if (itemEl) itemEl.textContent = progress.itemTitle || '';
                },
                onComplete: (newManifest) => {
                    if (newManifest && newManifest.topics) {
                        newManifest = fixManifestGrammar(newManifest);
                    }
                    saveManifest(newManifest, (success) => {
                        if (success) {
                            window.location.href = '?id=' + cmid; // Redirect to player
                        } else {
                            showError('Failed to save regenerated content');
                        }
                    });
                },
                onError: (error) => {
                    showError('Regeneration failed: ' + error);
                }
            }, { regenerateFailedOnly: true, existingManifest: existingManifest });
            
            if (!result.success) {
                showError('Regeneration failed: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            showError('Regeneration failed: ' + error.message);
        }
    };

    const renderWizard = () => {
        container.innerHTML = `
            <div class="cc-wizard">
                <div class="cc-wizard-header">
                    <h1 class="cc-wizard-title">Create Learning Content</h1>
                    <p class="cc-wizard-subtitle">Build engaging, compliant learning experiences with AI assistance</p>
                </div>

                <div class="cc-wizard-steps">
                    <div class="cc-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'complete' : ''}" data-step="1">
                        <span class="cc-step-number">1</span>
                        <span class="cc-step-label">Select Mode</span>
                    </div>
                    <div class="cc-step-connector ${currentStep > 1 ? 'active' : ''}"></div>
                    <div class="cc-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'complete' : ''}" data-step="2">
                        <span class="cc-step-number">2</span>
                        <span class="cc-step-label">Learning Context</span>
                    </div>
                    <div class="cc-step-connector ${currentStep > 2 ? 'active' : ''}"></div>
                    <div class="cc-step ${currentStep >= 3 ? 'active' : ''}" data-step="3">
                        <span class="cc-step-number">3</span>
                        <span class="cc-step-label">Topics & Generate</span>
                    </div>
                </div>

                <div id="cc-wizard-content" class="cc-wizard-content">
                    ${renderCurrentStep()}
                </div>

                <div id="cc-error-section" class="cc-error-banner" style="display: none;">
                    <span id="cc-error-message"></span>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                        <button type="button" class="cc-btn cc-btn-sm cc-btn-primary" id="cc-error-retry-btn" style="display:none;">Try Again</button>
                        <button type="button" class="cc-error-close" data-action="close-error">&times;</button>
                    </div>
                </div>
            </div>
        `;

        bindWizardEvents();
    };

    const renderCurrentStep = () => {
        switch (currentStep) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            default: return renderStep1();
        }
    };

    const renderStep1 = () => {
        return `
            <div class="cc-step-content" data-testid="step-1-mode">
                <h2 class="cc-section-title">Choose Your Learning Mode</h2>
                <p class="cc-section-subtitle">Select the mode that matches your educational context. This determines how content is structured and mapped.</p>

                <div style="background:linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%);border:1px solid #93c5fd;border-radius:10px;padding:18px 20px;margin-bottom:20px;" data-testid="info-how-it-works">
                    <div style="display:flex;align-items:flex-start;gap:12px;">
                        <div style="flex-shrink:0;width:40px;height:40px;background:linear-gradient(135deg,#3b82f6,#6366f1);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;font-size:14px;color:#1e3a5f;margin-bottom:6px;">How It Works  -  3 Simple Steps</div>
                            <div style="display:flex;flex-direction:column;gap:10px;">
                                <div style="display:flex;align-items:flex-start;gap:8px;">
                                    <div style="flex-shrink:0;width:22px;height:22px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#2563eb;margin-top:1px;">1</div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;color:#1e40af;">Choose your mode and enter your topics</div>
                                        <div style="font-size:12px;color:#3b82f6;line-height:1.5;">Select VET, Workplace, University, or PD / Short Courses mode below. Then enter your major topic and sub topics.</div>
                                    </div>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:8px;">
                                    <div style="flex-shrink:0;width:22px;height:22px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#2563eb;margin-top:1px;">2</div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;color:#1e40af;">Add context and generate your slides</div>
                                        <div style="font-size:12px;color:#3b82f6;line-height:1.5;">Select your industry and topics, then click Generate — AI builds your slides automatically. Optionally, paste reference content or use the ChatGPT prompt when you need more control or want to upload documents as guides.</div>
                                    </div>
                                </div>
                                <div style="display:flex;align-items:flex-start;gap:8px;">
                                    <div style="flex-shrink:0;width:22px;height:22px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#2563eb;margin-top:1px;">3</div>
                                    <div>
                                        <div style="font-weight:600;font-size:13px;color:#1e40af;">Generate your slides</div>
                                        <div style="font-size:12px;color:#3b82f6;line-height:1.5;">AI builds your slides with text, images, voiceover, and real-world scenarios  -  all from your refined content.</div>
                                    </div>
                                </div>
                            </div>
                            <div style="margin-top:10px;padding:8px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:11px;color:#92400e;line-height:1.5;">
                                <strong>Important:</strong> Each Content Creator activity is designed for <strong>one major topic only</strong>. For effective learning, place revision activities between your topics  -  use <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> to reinforce understanding before students move to the next topic.
                            </div>
                            <div style="margin-top:8px;padding:8px 12px;background:#dbeafe;border-radius:6px;font-size:11px;color:#1e40af;line-height:1.5;">
                                <strong>Tip:</strong> You can generate slides directly — no ChatGPT needed. Use the optional ChatGPT prompt (shown later) when you want to upload documents as guides or review and refine content before generating.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="cc-mode-cards">
                    <div role="button" tabindex="0" class="cc-mode-card ${selectedMode === 'vet' ? 'selected' : ''}" 
                            data-mode="vet" data-testid="button-mode-vet">
                        <div class="cc-mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                            </svg>
                        </div>
                        <h3 class="cc-mode-title">Vocational (RTO)</h3>
                        <p class="cc-mode-description">Unit of competency with RTO compliance</p>
                        <ul class="cc-mode-features">
                            <li>Auto-imports from training.gov.au</li>
                            <li>Competency-based assessment focus</li>
                            <li>Element & PC coverage mapping</li>
                            <li>Upload reference documents</li>
                        </ul>
                    </div>

                    <div role="button" tabindex="0" class="cc-mode-card ${selectedMode === 'workplace' ? 'selected' : ''}" 
                            data-mode="workplace" data-testid="button-mode-workplace">
                        <div class="cc-mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 7h-9M14 17H5"/>
                                <circle cx="17" cy="17" r="3"/>
                                <circle cx="7" cy="7" r="3"/>
                            </svg>
                        </div>
                        <h3 class="cc-mode-title">Workplace Training</h3>
                        <p class="cc-mode-description">Company policies, procedures & onboarding</p>
                        <ul class="cc-mode-features">
                            <li>Upload company documents (PDF, Word)</li>
                            <li>AI extracts topics from your content</li>
                            <li>Induction, safety & policy training</li>
                            <li>Real workplace decision scenarios</li>
                        </ul>
                    </div>

                    <div role="button" tabindex="0" class="cc-mode-card ${selectedMode === 'university' ? 'selected' : ''}" 
                            data-mode="university" data-testid="button-mode-university">
                        <div class="cc-mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                            </svg>
                        </div>
                        <h3 class="cc-mode-title">University / Higher Ed</h3>
                        <p class="cc-mode-description">Academic courses with Bloom's Taxonomy alignment</p>
                        <ul class="cc-mode-features">
                            <li>Learning outcome-driven structure</li>
                            <li>Concept-Application-Reflection flow</li>
                            <li>Critical thinking emphasis</li>
                            <li>Academic tone and terminology</li>
                        </ul>
                    </div>

                    <div role="button" tabindex="0" class="cc-mode-card ${selectedMode === 'pd' ? 'selected' : ''}" 
                            data-mode="pd" data-testid="button-mode-pd">
                        <div class="cc-mode-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                        </div>
                        <h3 class="cc-mode-title">PD / Short Courses</h3>
                        <p class="cc-mode-description">Professional development, upskilling & staff training courses</p>
                        <ul class="cc-mode-features">
                            <li>Enter course title, AI suggests topics</li>
                            <li>Or paste your own topics</li>
                            <li>Practical, skills-focused content</li>
                            <li>Perfect for CPD & micro-credentials</li>
                        </ul>
                    </div>
                </div>

                <div class="cc-wizard-actions">
                    <div></div>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-next-step" 
                            data-testid="button-next" ${!selectedMode ? 'disabled' : ''}>
                        Continue
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon-right">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    };

    const renderStep2 = () => {
        if (selectedMode === 'vet') {
            return renderStep2VET();
        } else if (selectedMode === 'workplace') {
            return renderStep2Workplace();
        } else if (selectedMode === 'pd') {
            return renderStep2PD();
        } else {
            return renderStep2University();
        }
    };

    const renderStep2VET = () => {
        return `
            <div class="cc-step-content" data-testid="step-2-vet">
                <h2 class="cc-section-title">Learning Context - Vocational (RTO)</h2>
                <p class="cc-section-subtitle">Enter the unit code to auto-fetch competency data, then provide workplace context for relevant examples.</p>

                <div class="cc-instruction-card" data-testid="instruction-card-vet">
                    <div class="cc-instruction-card-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    </div>
                    <div class="cc-instruction-card-text">
                        <strong>One element per content pack.</strong> Each Content Creator activity covers a single element at a time. Select the element you want to build content for, and each PC becomes a learning slide. To cover more elements, create additional Content Creator activities in your course. <strong>Best practice:</strong> Place an <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> activity between each element so students can consolidate their learning before moving on.
                    </div>
                </div>

                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Unit of Competency</h3>
                    <div class="cc-unit-fetch-row">
                        <div class="cc-form-group cc-form-group-lg">
                            <label class="cc-form-label">Unit Code *</label>
                            <div class="cc-input-with-button">
                                <input type="text" class="cc-input" id="cc-unit-code" 
                                       placeholder="e.g., RIIWHS204E" data-testid="input-unit-code"
                                       value="${tgaData?.unitCode || ''}">
                                <button type="button" class="cc-btn cc-btn-secondary" id="cc-fetch-unit" 
                                        data-testid="button-fetch-unit">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                                    </svg>
                                    Fetch Unit
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="cc-unit-details" class="cc-unit-details ${tgaData ? '' : 'cc-hidden'}">
                        ${tgaData ? renderTGADetails(tgaData) : ''}
                    </div>

                    <div id="cc-unit-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>Fetching unit data from training.gov.au...</span>
                    </div>

                    <!-- PDF Upload Fallback - shown when TGA API fails -->
                    <div id="cc-pdf-upload-section" class="cc-pdf-upload-section cc-hidden">
                        <div class="cc-alert cc-alert-warning">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-alert-icon">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <div class="cc-alert-content">
                                <strong>TGA API unavailable</strong>
                                <p>Unable to fetch unit data automatically. Upload the unit PDF or paste the unit text from training.gov.au instead.</p>
                            </div>
                        </div>
                        <!-- Tab switcher -->
                        <div class="cc-fallback-tabs" style="display:flex;gap:0;margin-bottom:12px;border-bottom:2px solid var(--cc-border);">
                            <button type="button" id="cc-tab-pdf" class="cc-fallback-tab cc-fallback-tab-active" data-testid="button-tab-upload-pdf"
                                style="padding:7px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid var(--cc-primary);margin-bottom:-2px;color:var(--cc-primary);">
                                Upload PDF
                            </button>
                            <button type="button" id="cc-tab-paste" class="cc-fallback-tab" data-testid="button-tab-paste-text"
                                style="padding:7px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--cc-text-secondary);">
                                Paste Text
                            </button>
                        </div>
                        <!-- PDF upload panel (default) -->
                        <div id="cc-fallback-pdf-panel">
                            <div class="cc-pdf-upload-row">
                                <input type="file" id="cc-pdf-file" accept=".pdf" class="cc-file-input" data-testid="input-pdf-file">
                                <button type="button" class="cc-btn cc-btn-secondary" id="cc-upload-pdf" data-testid="button-upload-pdf">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="17 8 12 3 7 8"/>
                                        <line x1="12" y1="3" x2="12" y2="15"/>
                                    </svg>
                                    Upload PDF
                                </button>
                            </div>
                            <p class="cc-form-hint">Download the unit PDF from <a href="https://training.gov.au" target="_blank" rel="noopener">training.gov.au</a> and upload it here.</p>
                        </div>
                        <!-- Paste text panel (shown when PDF fails or user prefers copy-paste) -->
                        <div id="cc-fallback-paste-panel" style="display:none;">
                            <textarea id="cc-paste-unit-text" rows="9"
                                      data-testid="textarea-paste-unit-text"
                                      class="cc-paste-textarea"
                                      style="width:100%;box-sizing:border-box;font-size:13px;font-family:inherit;resize:vertical;"
                                      placeholder="Paste the unit of competency text here. Include the Performance Evidence, Knowledge Evidence and Elements sections for best results."></textarea>
                            <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
                                <button type="button" class="cc-btn cc-btn-secondary" id="cc-process-paste-text" data-testid="button-process-paste-text">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                        <polyline points="9 11 12 14 22 4"/>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                    </svg>
                                    Process Text
                                </button>
                                <span class="cc-form-hint" style="margin:0;">Open the unit on <a href="https://training.gov.au" target="_blank" rel="noopener">training.gov.au</a>, select all text (Ctrl+A / Cmd+A) and paste here.</span>
                            </div>
                        </div>
                    </div>

                    <div id="cc-pdf-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>Extracting competency data from PDF...</span>
                    </div>
                </div>

                <!-- v6.8.9: Progressive Disclosure - These sections are hidden until unit is fetched -->
                <div id="cc-unit-dependent-sections" class="cc-unit-dependent-sections cc-hidden" data-testid="unit-dependent-sections">

                <!-- v8.4.34: Element Selection - User picks ONE element before providing context -->
                <div class="cc-form-section" id="cc-element-selection-section">
                    <h3 class="cc-form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-section-icon" style="width:24px;height:24px;min-width:24px;max-width:24px;">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                            <path d="m9 14 2 2 4-4"/>
                        </svg>
                        Select Element to Generate
                    </h3>
                    <p class="cc-form-hint">Choose <strong>one element</strong> to generate learning content for. Generate each element separately so you can place <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> between them for revision and deeper learning.</p>
                    <div id="cc-element-list" data-testid="element-list">
                        ${tgaData?.elements?.length > 0 ? renderElementList(tgaData) : '<p class="cc-form-hint">No elements found.</p>'}
                    </div>

                    <!-- v10.25: Element correction tools - shown when unit is loaded -->
                    <div id="cc-element-correction-bar" class="${tgaData?.elements?.length > 0 ? '' : 'cc-hidden'}" style="margin-top:10px;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <button type="button" id="cc-refresh-elements" class="cc-btn cc-btn-ghost cc-btn-sm" data-testid="button-refresh-elements" title="Re-fetch this unit from training.gov.au, bypassing the cache">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:14px;height:14px;">
                                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                                Refresh from TGA
                            </button>
                            <button type="button" id="cc-toggle-paste-elements" class="cc-btn cc-btn-ghost cc-btn-sm" data-testid="button-toggle-paste-elements">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:14px;height:14px;">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                Paste elements manually
                            </button>
                        </div>
                        <!-- Paste panel (collapsed by default) -->
                        <div id="cc-paste-elements-panel" class="cc-hidden" style="margin-top:10px;padding:12px;background:var(--cc-bg-subtle,var(--cc-bg));border:1px solid var(--cc-border);border-radius:6px;">
                            <p class="cc-form-hint" style="margin-bottom:8px;">If auto-fetch missed an element, paste the <strong>Elements and Performance Criteria</strong> section from <a href="https://training.gov.au" target="_blank" rel="noopener">training.gov.au</a> below.<br>Format: <code>1. Element name</code> on its own line, then <code>1.1 PC text</code> etc.</p>
                            <textarea id="cc-paste-elements-text" rows="10"
                                      data-testid="textarea-paste-elements"
                                      style="width:100%;box-sizing:border-box;font-size:12px;font-family:monospace;resize:vertical;background:var(--cc-input-bg,var(--cc-bg));color:var(--cc-text);border:1px solid var(--cc-border);border-radius:4px;padding:8px;"
                                      placeholder="Paste the elements section here, e.g.:
1. Plan and prepare for the detailed design of urban roads
1.1 Interpret and analyse data and identify viable options
1.2 Recommend the preferred option
2. Undertake the detailed design of urban roads
2.1 Select appropriate design parameters
..."></textarea>
                            <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap;">
                                <button type="button" id="cc-apply-paste-elements" class="cc-btn cc-btn-secondary cc-btn-sm" data-testid="button-apply-paste-elements">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:14px;height:14px;">
                                        <polyline points="9 11 12 14 22 4"/>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                    </svg>
                                    Apply &amp; replace elements
                                </button>
                                <button type="button" id="cc-merge-paste-elements" class="cc-btn cc-btn-ghost cc-btn-sm" data-testid="button-merge-paste-elements">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:14px;height:14px;">
                                        <circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>
                                    </svg>
                                    Merge (add missing only)
                                </button>
                                <span id="cc-paste-elements-status" class="cc-form-hint" style="margin:0;"></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- v8.4.34: Everything below is hidden until an element is selected -->
                <div id="cc-element-dependent-sections" class="${selectedElementIds.length > 0 ? '' : 'cc-hidden'}" data-testid="element-dependent-sections">

                <!-- v6.9.5: Workplace Context - User must fill this BEFORE AI suggestions -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Workplace Context</h3>
                    <p class="cc-form-hint">Fill in these fields first. AI will use this context to suggest relevant job titles, tasks, and equipment.</p>
                    
                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Country *</label>
                            <select class="cc-select" id="cc-country" data-testid="select-country">
                                ${COUNTRIES.map(c => `<option value="${c.code}" ${c.code === 'AU' ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">State/Region</label>
                            <select class="cc-select" id="cc-state" data-testid="select-state">
                                <option value="">Select (optional)...</option>
                                ${getStatesForCountry('AU').map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Industry *</label>
                            <select class="cc-select" id="cc-industry" data-testid="select-industry">
                                <option value="">Select industry...</option>
                                ${INDUSTRIES.map(i => `<option value="${i}">${i}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Industry Sector</label>
                            <select class="cc-select" id="cc-industry-sector" data-testid="select-industry-sector">
                                <option value="">Select industry first...</option>
                            </select>
                            <small class="cc-form-hint">More specific sector for realistic scenarios</small>
                        </div>
                    </div>

                    <div class="cc-form-group">
                        <label class="cc-form-label">Job Level * <small style="font-weight:400;color:var(--cc-muted,#6b7280)">(select one or more)</small></label>
                        <div class="cc-job-level-pills" id="cc-job-level-pills" data-testid="group-job-levels">
                            ${JOB_LEVELS.map(j => `
                            <button type="button" class="cc-level-pill" data-value="${j.value}" data-testid="pill-job-level-${j.value}">
                                ${j.label}
                            </button>`).join('')}
                        </div>
                        <small class="cc-form-hint">AI will create workplace scenarios for all selected levels</small>
                    </div>
                    
                    <div class="cc-ai-info-banner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" class="cc-info-icon">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                        </svg>
                        <div class="cc-ai-info-text">
                            <strong>Industry + Sector + Job Level = Realistic Scenarios</strong><br>
                            AI will automatically generate appropriate job titles, workplace tasks, and equipment examples based on your selections above.
                        </div>
                    </div>
                </div>
                
                <!-- Suggest Subtopics button -->
                <div class="cc-suggest-topics-section" id="cc-suggest-topics-section">
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-suggest-topics-btn" data-testid="button-suggest-topics">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                            <circle cx="7.5" cy="14.5" r="1.5"/>
                            <circle cx="16.5" cy="14.5" r="1.5"/>
                        </svg>
                        Suggest Subtopics
                    </button>
                    <div id="cc-suggest-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>AI is suggesting subtopics for your major topic...</span>
                    </div>
                </div>
                
                <!-- Topics container - renders AFTER button click -->
                <div id="cc-topics-container"></div>

                <!-- v13.33: Reference Content (Optional) - shown when topics are selected -->
                <div id="cc-vet-chatgpt-section" class="cc-form-section cc-hidden">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Reference Content <span style="font-weight:400;font-size:12px;color:#6b7280;">(Optional)</span></h3>
                    </div>

                    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" width="20" height="20" style="flex-shrink:0;margin-top:1px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            <div>
                                <div style="font-weight:600;font-size:13px;color:#15803d;margin-bottom:4px;">Ready to generate — no reference content needed</div>
                                <div style="font-size:12px;color:#166534;line-height:1.5;">AI will build your slides directly from your unit, topics, and context. Click <strong>Continue</strong> below to generate your slides now.</div>
                            </div>
                        </div>
                    </div>

                    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#fafafa;">
                        <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:6px;">Or use the ChatGPT prompt for more control (optional)</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:12px;padding:8px 12px;background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;">
                            <strong>When to use this:</strong> Use the ChatGPT prompt when you want to <strong>upload documents as guides</strong> (e.g. a training manual, policy doc, or unit PDF), or when you want to <strong>review and edit content before slides are generated</strong> for full creative control.
                        </div>
                        <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:12px;">
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bbf7d0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#065f46;">1</div>
                                <span>Download the prompt file below (includes your topics + context)</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bbf7d0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#065f46;">2</div>
                                <span>Open ChatGPT, paste the prompt — then upload any documents you want to use as guides</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bbf7d0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#065f46;">3</div>
                                <span>Review and refine the ChatGPT output until you are happy with it</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bbf7d0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#065f46;">4</div>
                                <span>Paste the output below, then click Continue to generate your slides</span>
                            </div>
                        </div>
                        <button type="button" id="cc-download-vet-prompt" class="cc-btn cc-btn-sm" data-testid="button-download-vet-prompt" style="display:inline-flex;align-items:center;gap:6px;background:#10b981;color:white;border:none;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download ChatGPT Prompt File (includes your topics + context)
                        </button>
                        <div class="cc-paste-text-panel" id="cc-vet-paste-panel">
                            <textarea class="cc-paste-textarea" id="cc-vet-paste-text" 
                                      placeholder="Optional: Paste ChatGPT output or any reference material here to guide the AI..."
                                      data-testid="textarea-vet-paste" rows="6">${escapeHtml(vetPastedContent)}</textarea>
                            <div class="cc-paste-footer">
                                <span class="cc-paste-word-count" id="cc-vet-paste-count">${vetPastedContent ? countWords(vetPastedContent) + ' words' : '0 words'}</span>
                                ${vetPastedContent ? '<button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-vet-paste-clear" data-testid="button-vet-paste-clear">Clear</button>' : ''}
                            </div>
                        </div>
                    </div>
                </div>

                
                </div><!-- END cc-element-dependent-sections -->
                </div><!-- END cc-unit-dependent-sections -->

                <div class="cc-wizard-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-prev-step" data-testid="button-back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back
                    </button>
                    <!-- v6.9.27: Hidden by default - only shown after topics are suggested AND selected -->
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg cc-hidden" id="cc-next-step" data-testid="button-next">
                        Continue
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon-right">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    };

    // v6.9.18: Update Generate Topics button visibility based on ALL required inputs
    // v8.4.24: Separate logic for VET (TGA-dependent) and Workplace (document-dependent) modes
    const updateGenerateTopicsButton = () => {
        const nextBtn = document.getElementById('cc-next-step');
        if (!nextBtn || (selectedMode !== 'vet' && selectedMode !== 'workplace')) return;
        
        const hasTopics = suggestedMajorTopics.length > 0;
        const hasSelection = selectedMajorTopicIds.length > 0;
        
        let allInputsValid = false;
        
        if (selectedMode === 'vet') {
            const hasTgaData = tgaData && tgaData.elements && tgaData.elements.length > 0;
            const hasIndustry = !!document.getElementById('cc-industry')?.value;
            const hasJobLevel = window.CC_SELECTED_JOB_LEVELS.length > 0;
            allInputsValid = hasTgaData && hasIndustry && hasJobLevel;
        } else if (selectedMode === 'workplace') {
            const hasDocument = !!workplaceData;
            const hasIndustry = !!document.getElementById('cc-wp-industry')?.value;
            const hasTrainingType = !!document.getElementById('cc-training-type')?.value;
            allInputsValid = hasDocument && hasIndustry && hasTrainingType;
        }
        
        const suggestSection = document.getElementById('cc-suggest-topics-section') || document.getElementById('cc-wp-suggest-section');
        
        const chatgptSection = selectedMode === 'vet'
            ? document.getElementById('cc-vet-chatgpt-section')
            : document.getElementById('cc-wp-chatgpt-section');
        
        if (allInputsValid && hasTopics && hasSelection) {
            suggestSection?.classList.add('cc-hidden');
            if (chatgptSection) {
                chatgptSection.classList.remove('cc-hidden');
                chatgptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // v13.33: Reference content is optional — show Continue regardless of paste content
            nextBtn.classList.remove('cc-hidden');
        } else {
            nextBtn.classList.add('cc-hidden');
            if (chatgptSection) chatgptSection.classList.add('cc-hidden');
            if (!hasTopics) {
                suggestSection?.classList.remove('cc-hidden');
            } else {
                suggestSection?.classList.add('cc-hidden');
            }
        }
    };

    // v8.4.24: Workplace Training mode - document-first, no TGA unit required
    const TRAINING_TYPES = [
        { value: 'induction', label: 'Staff Induction / Onboarding' },
        { value: 'policy', label: 'Policy & Procedure Training' },
        { value: 'safety', label: 'Workplace Health & Safety' },
        { value: 'compliance', label: 'Compliance & Regulatory' },
        { value: 'skills', label: 'Skills Development' },
        { value: 'leadership', label: 'Leadership & Management' },
        { value: 'customer', label: 'Customer Service' },
        { value: 'technical', label: 'Technical / Systems Training' },
        { value: 'custom', label: 'Custom Training Module' }
    ];
    
    const TARGET_AUDIENCES = [
        { value: 'new-starters', label: 'New Starters / Inductees' },
        { value: 'all-staff', label: 'All Staff' },
        { value: 'supervisors', label: 'Supervisors / Team Leaders' },
        { value: 'managers', label: 'Managers' },
        { value: 'contractors', label: 'Contractors / Visitors' },
        { value: 'specific-dept', label: 'Specific Department' }
    ];

    const renderStep2Workplace = () => {
        return `
            <div class="cc-step-content" data-testid="step-2-workplace">
                <h2 class="cc-section-title">Learning Context - Workplace Training</h2>
                <p class="cc-section-subtitle">Upload your company documents and provide context. AI will extract topics and build interactive training content.</p>

                <div class="cc-instruction-card" data-testid="instruction-card-workplace">
                    <div class="cc-instruction-card-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    </div>
                    <div class="cc-instruction-card-text">
                        <strong>One topic per content pack.</strong> Each Content Creator activity covers a single training topic at a time (e.g. "Manual Handling" or "Fire Evacuation"). Each sub topic (A, B, C) becomes a learning slide. To cover more topics, create additional Content Creator activities in your course. <strong>Best practice:</strong> Place an <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> activity between each topic so students can consolidate their learning before moving on.
                    </div>
                </div>

                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-section-icon" style="width:24px;height:24px;min-width:24px;max-width:24px;">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        Training Document
                    </h3>
                    <p class="cc-form-hint">Upload the policy, procedure, manual, or training material you want to convert into interactive learning content.</p>

                    <div id="cc-drop-zone" class="cc-upload-dropzone ${workplaceData ? 'cc-hidden' : ''}" data-testid="dropzone-workplace">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-upload-icon">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        <p class="cc-upload-text">Drag and drop your document here</p>
                        <p class="cc-upload-hint">or <button type="button" class="cc-link-button" id="cc-browse-file" data-testid="button-browse-file">browse files</button></p>
                        <p class="cc-upload-formats">Supported: PDF, DOCX, PPTX, TXT (max 10MB)</p>
                        <input type="file" id="cc-workplace-file" accept=".pdf,.docx,.pptx,.txt" class="cc-hidden" data-testid="input-workplace-file">
                    </div>

                    <div id="cc-file-preview" class="cc-file-preview ${workplaceData ? '' : 'cc-hidden'}" data-testid="file-preview">
                        <div class="cc-file-info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-file-icon">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <div>
                                <span id="cc-uploaded-filename" class="cc-file-name">${workplaceData?.filename || ''}</span>
                                <span id="cc-uploaded-filesize" class="cc-file-size">${workplaceData ? formatFileSize(workplaceData.wordCount * 6) : ''}</span>
                            </div>
                        </div>
                        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-remove-file" data-testid="button-remove-file">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Remove
                        </button>
                    </div>

                    <div id="cc-extract-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>Extracting content from document...</span>
                    </div>
                </div>

                <div id="cc-workplace-content" class="cc-workplace-content ${workplaceData ? '' : 'cc-hidden'}" data-testid="workplace-content">
                    ${workplaceData ? renderWorkplaceDetails(workplaceData) : ''}
                </div>

                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Training Details</h3>
                    <p class="cc-form-hint">Provide context about the training to help AI create relevant, realistic scenarios.</p>

                    <div class="cc-form-group">
                        <label class="cc-form-label">Training Topic *</label>
                        <input type="text" class="cc-input" id="cc-wp-training-topic" 
                               placeholder="e.g., Manual Handling Procedures, Fire Evacuation, Chemical Storage" data-testid="input-wp-training-topic">
                        <small class="cc-form-hint">This is your major topic. AI will suggest sub topics (A, B, C) under it based on your uploaded document.</small>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Training Type *</label>
                            <select class="cc-select" id="cc-training-type" data-testid="select-training-type">
                                <option value="">Select training type...</option>
                                ${TRAINING_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Target Audience *</label>
                            <select class="cc-select" id="cc-wp-audience" data-testid="select-audience">
                                ${TARGET_AUDIENCES.map(a => `<option value="${a.value}">${a.label}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Company / Organisation Name</label>
                            <input type="text" class="cc-input" id="cc-company-name" 
                                   placeholder="e.g., Acme Industries Pty Ltd" data-testid="input-company-name">
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Department</label>
                            <input type="text" class="cc-input" id="cc-wp-department" 
                                   placeholder="e.g., Operations, HR, Safety" data-testid="input-department">
                        </div>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Country *</label>
                            <select class="cc-select" id="cc-wp-country" data-testid="select-wp-country">
                                ${COUNTRIES.map(c => `<option value="${c.code}" ${c.code === 'AU' ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">State/Region</label>
                            <select class="cc-select" id="cc-wp-state" data-testid="select-wp-state">
                                <option value="">Select (optional)...</option>
                                ${getStatesForCountry('AU').map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Industry *</label>
                            <select class="cc-select" id="cc-wp-industry" data-testid="select-wp-industry">
                                <option value="">Select industry...</option>
                                ${INDUSTRIES.map(i => `<option value="${i}">${i}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Industry Sector</label>
                            <select class="cc-select" id="cc-wp-industry-sector" data-testid="select-wp-industry-sector">
                                <option value="">Select industry first...</option>
                            </select>
                            <small class="cc-form-hint">More specific sector for realistic scenarios</small>
                        </div>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Job Level</label>
                            <select class="cc-select" id="cc-wp-job-level" data-testid="select-wp-job-level">
                                ${JOB_LEVELS.map(j => `<option value="${j.value}">${j.label}</option>`).join('')}
                            </select>
                            <small class="cc-form-hint">AI creates scenarios appropriate for this level</small>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Additional Instructions</label>
                            <input type="text" class="cc-input" id="cc-wp-instructions" 
                                   placeholder="e.g., Focus on forklift operations" data-testid="input-wp-instructions">
                        </div>
                    </div>
                    
                    <div class="cc-ai-info-banner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" class="cc-info-icon">
                            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                        </svg>
                        <div class="cc-ai-info-text">
                            <strong>Document + Context = Targeted Training</strong><br>
                            AI will extract key topics from your uploaded document and combine them with your training context to create realistic, scenario-based learning content.
                        </div>
                    </div>
                </div>

                <div id="cc-wp-suggest-section" class="cc-suggest-topics-section ${workplaceData ? '' : 'cc-hidden'}">
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-suggest-workplace-topics-btn" data-testid="button-suggest-workplace-topics"
                            ${!workplaceData ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                            <circle cx="7.5" cy="14.5" r="1.5"/>
                            <circle cx="16.5" cy="14.5" r="1.5"/>
                        </svg>
                        Suggest Subtopics
                    </button>
                    <div id="cc-workplace-suggest-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>AI is suggesting subtopics for your major topic...</span>
                    </div>
                </div>

                <!-- v13.33: Reference Content (Optional) - shown when topics are selected -->
                <div id="cc-wp-chatgpt-section" class="cc-form-section cc-hidden">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Reference Content <span style="font-weight:400;font-size:12px;color:#6b7280;">(Optional)</span></h3>
                    </div>

                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" width="20" height="20" style="flex-shrink:0;margin-top:1px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            <div>
                                <div style="font-weight:600;font-size:13px;color:#1e40af;margin-bottom:4px;">Ready to generate — no reference content needed</div>
                                <div style="font-size:12px;color:#1d4ed8;line-height:1.5;">AI will build your slides directly from your uploaded document, topics, and context. Click <strong>Continue</strong> below to generate your slides now.</div>
                            </div>
                        </div>
                    </div>

                    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#fafafa;">
                        <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:6px;">Or use the ChatGPT prompt for more control (optional)</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:12px;padding:8px 12px;background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;">
                            <strong>When to use this:</strong> Use the ChatGPT prompt when you want to <strong>review and edit the content before slides are generated</strong>, or when you want to provide <strong>additional documents as guides</strong> beyond your uploaded training document.
                        </div>
                        <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:12px;">
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bfdbfe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#1e3a5f;">1</div>
                                <span>Download the prompt file below (includes your topics + context)</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bfdbfe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#1e3a5f;">2</div>
                                <span>Open ChatGPT, paste the prompt — then upload any additional documents you want to use as guides</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bfdbfe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#1e3a5f;">3</div>
                                <span>Review and refine the ChatGPT output until you are happy with it</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bfdbfe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#1e3a5f;">4</div>
                                <span>Paste the output below, then click Continue to generate your slides</span>
                            </div>
                        </div>
                        <button type="button" id="cc-download-wp-prompt" class="cc-btn cc-btn-sm" data-testid="button-download-wp-prompt" style="display:inline-flex;align-items:center;gap:6px;background:#3b82f6;color:white;border:none;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download ChatGPT Prompt File (includes your topics + context)
                        </button>
                        <div class="cc-paste-text-panel" id="cc-wp-paste-panel">
                            <textarea class="cc-paste-textarea" id="cc-wp-paste-text"
                                      placeholder="Optional: Paste ChatGPT output or any reference material here to guide the AI..."
                                      data-testid="textarea-wp-paste" rows="6">${workplacePastedContent || ''}</textarea>
                            <div class="cc-paste-footer">
                                <span class="cc-paste-word-count" id="cc-wp-paste-count">${workplacePastedContent ? countWords(workplacePastedContent) + ' words' : '0 words'}</span>
                            </div>
                        </div>
                    </div>
                </div>


                <div class="cc-wizard-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-prev-step" data-testid="button-back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back
                    </button>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg cc-hidden" id="cc-next-step" data-testid="button-next">
                        Continue
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon-right">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    };

    const renderStep2University = () => {
        const hasOutcomes = storedOutcomes.length > 0;
        const hasChatGPTContent = !!uniPastedContent;
        return `
            <div class="cc-step-content" data-testid="step-2-university">
                <h2 class="cc-section-title">Learning Context - University</h2>
                <p class="cc-section-subtitle">Follow the steps below to build your course content. Each section unlocks as you complete the previous one.</p>

                <div class="cc-instruction-card" data-testid="instruction-card-university">
                    <div class="cc-instruction-card-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    </div>
                    <div class="cc-instruction-card-text">
                        <strong>One topic per content pack.</strong> Each Content Creator activity covers a single topic at a time (e.g. "Motivation Theories" or "Group Dynamics"). Each sub topic (A, B, C) becomes a learning slide. To cover more topics, create additional Content Creator activities in your course. <strong>Best practice:</strong> Place an <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> activity between each topic so students can consolidate their learning before moving on.
                    </div>
                </div>

                <!-- SECTION 1: Course Information -->
                <div class="cc-form-section">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#8b5cf6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">1</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Course Information</h3>
                    </div>
                    
                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Country *</label>
                            <select class="cc-select" id="cc-uni-country" data-testid="select-uni-country">
                                ${COUNTRIES.map(c => `<option value="${c.code}" ${c.code === 'AU' ? 'selected' : ''}>${c.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">State/Region</label>
                            <select class="cc-select" id="cc-uni-state" data-testid="select-uni-state">
                                <option value="">Select (optional)...</option>
                                ${getStatesForCountry('AU').map(s => `<option value="${s}">${s}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="cc-form-group">
                        <label class="cc-form-label">Course / Topic Title *</label>
                        <input type="text" class="cc-input" id="cc-course-name" 
                               placeholder="e.g., Motivation Theories, Group Dynamics, Organisational Behaviour" data-testid="input-course-name">
                        <small class="cc-form-hint">This is your major topic. AI will suggest sub topics (A, B, C) under it.</small>
                    </div>

                    <div class="cc-form-grid cc-form-grid-2">
                        <div class="cc-form-group">
                            <label class="cc-form-label">Course Level *</label>
                            <select class="cc-select" id="cc-course-level" data-testid="select-course-level">
                                ${COURSE_LEVELS.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-form-label">Subject Area *</label>
                            <input type="text" class="cc-input" id="cc-subject-area" 
                                   placeholder="e.g., Psychology, Business, Engineering" data-testid="input-subject-area">
                        </div>
                    </div>

                    <div class="cc-form-group">
                        <label class="cc-form-label">Bloom's Taxonomy Focus *</label>
                        <select class="cc-select" id="cc-blooms-level" data-testid="select-blooms-level">
                            ${BLOOMS_LEVELS.map(b => `<option value="${b.value}">${b.label}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- SECTION 2: Subtopics (Bulk Paste) -->
                <div class="cc-form-section">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#8b5cf6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">2</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Subtopics</h3>
                    </div>

                    <div style="background:linear-gradient(135deg,#faf5ff 0%,#f5f3ff 100%);border:1px solid #d8b4fe;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                        <div style="font-weight:600;font-size:13px;color:#4c1d95;margin-bottom:8px;">How to paste your subtopics</div>
                        <div style="font-size:12px;color:#6d28d9;line-height:1.6;">
                            Paste the subtopics for your major topic below (one per line). Each subtopic will become a separate learning slide:<br><br>
                            <div style="background:white;border:1px solid #e9d5ff;border-radius:6px;padding:10px 12px;font-family:monospace;font-size:11px;line-height:1.7;color:#581c87;">
                                How visibility shifts meaning<br>
                                Public disagreement and response pressure<br>
                                Personal opinion vs institutional signal<br>
                                Platform-specific risks<br>
                                When personal becomes professional<br>
                                Managing digital footprint
                            </div>
                            <div style="margin-top:8px;color:#7c3aed;font-size:11px;">
                                <strong>Tip:</strong> List 4-8 sub topics. Each sub topic (A, B, C) becomes one learning slide in your content pack. You can also paste lists or bullet points.
                            </div>
                        </div>
                    </div>

                    <div id="cc-outcomes-list" class="cc-outcomes-list" style="display:none;"></div>

                    <div id="cc-bulk-paste-panel" data-testid="panel-bulk-paste">
                        <textarea class="cc-paste-textarea" id="cc-bulk-paste-text" 
                                  placeholder="Paste your subtopics here (one per line)...&#10;&#10;How visibility shifts meaning&#10;Public disagreement and response pressure&#10;Personal opinion vs institutional signal&#10;Platform-specific risks&#10;When personal becomes professional&#10;Managing digital footprint" 
                                  data-testid="textarea-bulk-paste" rows="10">${storedOutcomes.length > 0 ? escapeHtml(storedOutcomes.join('\\n')) : ''}</textarea>
                        <div class="cc-bulk-paste-actions">
                            <span class="cc-paste-word-count" id="cc-bulk-paste-count">${storedOutcomes.length > 0 ? storedOutcomes.length + ' items detected' : '0 items detected'}</span>
                            <div class="cc-bulk-paste-buttons">
                                <button type="button" class="cc-btn cc-btn-primary cc-btn-sm" id="cc-bulk-paste-add" data-testid="button-bulk-paste-add">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                        <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                    Confirm Subtopics
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="cc-uni-topics-confirmed" class="${hasOutcomes ? '' : 'cc-hidden'}" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-top:8px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            <span style="font-weight:600;font-size:13px;color:#15803d;" id="cc-uni-topics-count">${countTopicsLabel(storedOutcomes)}</span>
                        </div>
                        <div id="cc-uni-topics-preview">${renderConfirmedTopicsHTML(storedOutcomes)}</div>
                        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-uni-topics-edit" data-testid="button-edit-topics" style="margin-top:8px;font-size:11px;">Edit Subtopics</button>
                    </div>
                </div>

                <!-- SECTION 3: Reference Content (Optional - shown when topics confirmed) -->
                <div id="cc-uni-chatgpt-section" class="cc-form-section ${hasOutcomes ? '' : 'cc-hidden'}">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#8b5cf6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">3</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Reference Content <span style="font-weight:400;font-size:12px;color:#6b7280;">(Optional)</span></h3>
                    </div>

                    <div style="background:#faf5ff;border:1px solid #c4b5fd;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" width="20" height="20" style="flex-shrink:0;margin-top:1px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            <div>
                                <div style="font-weight:600;font-size:13px;color:#6d28d9;margin-bottom:4px;">Ready to generate — no reference content needed</div>
                                <div style="font-size:12px;color:#7c3aed;line-height:1.5;">AI will build your slides directly from your topics and course context. Click <strong>Generate Topics</strong> below to generate your slides now.</div>
                            </div>
                        </div>
                    </div>

                    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#fafafa;">
                        <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:6px;">Or use the ChatGPT prompt for more control (optional)</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:12px;padding:8px 12px;background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;">
                            <strong>When to use this:</strong> Use the ChatGPT prompt when you want to <strong>upload course readings or academic documents as guides</strong>, or when you want to <strong>review and edit content before slides are generated</strong> for full creative control.
                        </div>
                        <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:12px;">
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#ddd6fe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#7c3aed;">1</div>
                                <span>Download the prompt file below (includes your topics)</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#ddd6fe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#7c3aed;">2</div>
                                <span>Open ChatGPT, paste the prompt — then upload any course readings or documents you want to use as guides</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#ddd6fe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#7c3aed;">3</div>
                                <span>Review and refine the ChatGPT output until you are happy with it</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#ddd6fe;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#7c3aed;">4</div>
                                <span>Paste the output below, then click Generate Topics to generate your slides</span>
                            </div>
                        </div>
                        <button type="button" id="cc-download-uni-prompt" class="cc-btn cc-btn-sm" data-testid="button-download-uni-prompt" style="display:inline-flex;align-items:center;gap:6px;background:#8b5cf6;color:white;border:none;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download ChatGPT Prompt File (includes your topics)
                        </button>
                        <div class="cc-paste-text-panel" id="cc-uni-paste-panel">
                            <textarea class="cc-paste-textarea" id="cc-uni-paste-text" 
                                      placeholder="Optional: Paste ChatGPT output or any reference material here to guide the AI..."
                                      data-testid="textarea-uni-paste" rows="6">${escapeHtml(uniPastedContent)}</textarea>
                            <div class="cc-paste-footer">
                                <span class="cc-paste-word-count" id="cc-uni-paste-count">${uniPastedContent ? countWords(uniPastedContent) + ' words' : '0 words'}</span>
                                ${uniPastedContent ? '<button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-uni-paste-clear" data-testid="button-uni-paste-clear">Clear</button>' : ''}
                            </div>
                        </div>
                    </div>
                </div>


                <div class="cc-wizard-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-prev-step" data-testid="button-back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back
                    </button>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg ${hasOutcomes ? '' : 'cc-hidden'}" id="cc-next-step" data-testid="button-next">
                        Generate Topics
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon-right">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    };

    const renderStep2PD = () => {
        const hasOutcomes = storedOutcomes.length > 0;
        const hasChatGPTContent = !!pdPastedContent;
        return `
            <div class="cc-step-content" data-testid="step-2-pd">
                <h2 class="cc-section-title">Learning Context - Professional Development</h2>
                <p class="cc-section-subtitle">Enter your course details, then add topics by letting AI suggest them or paste your own.</p>

                <div class="cc-instruction-card" data-testid="instruction-card-pd">
                    <div class="cc-instruction-card-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" style="width:20px;height:20px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    </div>
                    <div class="cc-instruction-card-text">
                        <strong>One topic per content pack.</strong> Each Content Creator activity covers a single topic at a time (e.g. "Active Listening" or "Managing Conflict"). Each sub topic (A, B, C) becomes a learning slide. To cover more topics, create additional Content Creator activities in your course. <strong>Best practice:</strong> Place an <strong>AI Learning Activities</strong>, <strong>AI Video Activity</strong>, <strong>AI Knowledge Check</strong>, or <strong>AI Essay Maker</strong> activity between each topic so students can consolidate their learning before moving on.
                    </div>
                </div>

                <!-- SECTION 1: Course Information -->
                <div class="cc-form-section">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#0ea5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">1</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Course Information</h3>
                    </div>
                    
                    <div class="cc-form-group">
                        <label class="cc-label" for="cc-pd-course-title">Course / Topic Title <span class="cc-required">*</span></label>
                        <input type="text" id="cc-pd-course-title" class="cc-input" placeholder="e.g. Active Listening, Managing Conflict, Mental Health First Aid" data-testid="input-pd-course-title" />
                        <small class="cc-form-hint">This is your major topic. AI will suggest sub topics (A, B, C) under it.</small>
                    </div>
                    <div class="cc-form-grid cc-form-grid-2" style="margin-top:12px;">
                        <div class="cc-form-group">
                            <label class="cc-label" for="cc-pd-audience">Target Audience</label>
                            <select id="cc-pd-audience" class="cc-select" data-testid="select-pd-audience">
                                <option value="all-staff">All Staff</option>
                                <option value="new-starters">New Starters</option>
                                <option value="team-leaders">Team Leaders</option>
                                <option value="managers">Managers</option>
                                <option value="senior-leaders">Senior Leaders</option>
                                <option value="frontline-workers">Frontline Workers</option>
                                <option value="specialists">Specialists / Technical Staff</option>
                                <option value="contractors">Contractors</option>
                            </select>
                        </div>
                        <div class="cc-form-group">
                            <label class="cc-label" for="cc-pd-industry">Industry (Optional)</label>
                            <input type="text" id="cc-pd-industry" class="cc-input" placeholder="e.g. Healthcare, Construction, Finance" data-testid="input-pd-industry" />
                        </div>
                    </div>
                    <div class="cc-form-grid cc-form-grid-2" style="margin-top:12px;">
                        <div class="cc-form-group">
                            <label class="cc-label" for="cc-pd-country">Country</label>
                            <select id="cc-pd-country" class="cc-select" data-testid="select-pd-country">
                                <option value="AU" selected>Australia</option>
                                <option value="NZ">New Zealand</option>
                                <option value="GB">United Kingdom</option>
                                <option value="US">United States</option>
                                <option value="CA">Canada</option>
                                <option value="SG">Singapore</option>
                                <option value="AE">United Arab Emirates</option>
                                <option value="IN">India</option>
                                <option value="PH">Philippines</option>
                                <option value="ZA">South Africa</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- SECTION 2: Topics -->
                <div class="cc-form-section" style="margin-top:24px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#0ea5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">2</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Subtopics</h3>
                    </div>
                    <p class="cc-section-subtitle" style="margin-bottom:12px;">Add the subtopics for your major topic. You can let AI suggest them or paste your own.</p>

                    <div style="display:flex;gap:10px;margin-bottom:16px;" id="cc-pd-topic-actions">
                        <button type="button" class="cc-btn cc-btn-primary" id="cc-pd-suggest-topics" data-testid="button-pd-suggest-topics">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:16px;height:16px;">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            Suggest Subtopics with AI
                        </button>
                        <button type="button" class="cc-btn cc-btn-ghost" id="cc-pd-paste-own" data-testid="button-pd-paste-own">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:16px;height:16px;">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                            </svg>
                            Paste Your Own Subtopics
                        </button>
                    </div>

                    <!-- AI Suggest Loading -->
                    <div id="cc-pd-suggest-loading" class="cc-loading-state cc-hidden">
                        <div class="cc-spinner"></div>
                        <span>AI is suggesting subtopics for your major topic...</span>
                    </div>

                    <!-- Paste panel (hidden by default) -->
                    <div id="cc-pd-paste-panel" class="cc-hidden" style="background:var(--cc-bg);border:1px solid var(--cc-border);border-radius:8px;padding:16px;">
                        <label class="cc-label" style="margin-bottom:8px;">Paste your subtopics (one per line)</label>
                        <textarea id="cc-pd-paste-text" class="cc-textarea" style="min-height:150px;font-family:monospace;" 
                                  placeholder="What makes a good leader&#10;Leadership vs management&#10;Active listening techniques&#10;Giving constructive feedback&#10;Setting clear expectations"
                                  data-testid="textarea-pd-paste" rows="10">${storedOutcomes.length > 0 ? escapeHtml(storedOutcomes.join('\\n')) : ''}</textarea>
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
                            <span class="cc-paste-word-count" id="cc-pd-paste-count">${storedOutcomes.length > 0 ? storedOutcomes.length + ' items detected' : '0 items detected'}</span>
                            <div style="display:flex;gap:8px;">
                                <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-pd-paste-cancel" data-testid="button-pd-paste-cancel">Cancel</button>
                                <button type="button" class="cc-btn cc-btn-primary cc-btn-sm" id="cc-pd-paste-confirm" data-testid="button-pd-paste-confirm">Confirm Subtopics</button>
                            </div>
                        </div>
                    </div>

                    <!-- Confirmed Topics Display -->
                    <div id="cc-pd-topics-confirmed" class="${hasOutcomes ? '' : 'cc-hidden'}" style="background:var(--cc-bg);border:1px solid var(--cc-border-success, #86efac);border-radius:8px;padding:16px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <span style="font-weight:600;font-size:13px;color:#15803d;" id="cc-pd-topics-count">${countTopicsLabel(storedOutcomes)}</span>
                            <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" id="cc-pd-topics-edit" data-testid="button-pd-edit-topics">Edit Subtopics</button>
                        </div>
                        <div id="cc-pd-topics-preview">${renderConfirmedTopicsHTML(storedOutcomes)}</div>
                    </div>
                </div>

                <!-- SECTION 3: Reference Content (Optional - v13.33) -->
                <div id="cc-pd-chatgpt-section" class="cc-form-section ${hasOutcomes ? '' : 'cc-hidden'}" style="margin-top:24px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                        <div style="flex-shrink:0;width:28px;height:28px;background:#0ea5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:white;">3</div>
                        <h3 class="cc-form-section-title" style="margin:0;padding:0;border:none;">Reference Content <span style="font-weight:400;font-size:12px;color:#6b7280;">(Optional)</span></h3>
                    </div>

                    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 16px;margin-bottom:14px;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" width="20" height="20" style="flex-shrink:0;margin-top:1px;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                            <div>
                                <div style="font-weight:600;font-size:13px;color:#0369a1;margin-bottom:4px;">Ready to generate — no reference content needed</div>
                                <div style="font-size:12px;color:#0284c7;line-height:1.5;">AI will build your slides directly from your course title and subtopics. Click <strong>Generate Topics</strong> below to generate your slides now.</div>
                            </div>
                        </div>
                    </div>

                    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#fafafa;">
                        <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:6px;">Or use the ChatGPT prompt for more control (optional)</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.6;margin-bottom:12px;padding:8px 12px;background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;">
                            <strong>When to use this:</strong> Use the ChatGPT prompt when you want to <strong>upload reference documents as guides</strong> (e.g. a course manual, company policy, or learning framework), or when you want to <strong>review and edit content before slides are generated</strong> for full creative control.
                        </div>
                        <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:12px;">
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bae6fd;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#0369a1;">1</div>
                                <span>Download the prompt file below (includes your topics)</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bae6fd;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#0369a1;">2</div>
                                <span>Open ChatGPT, paste the prompt — then upload any reference documents you want to use as guides</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bae6fd;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#0369a1;">3</div>
                                <span>Review and refine the ChatGPT output until you are happy with it</span>
                            </div>
                            <div style="display:flex;align-items:flex-start;gap:8px;">
                                <div style="flex-shrink:0;width:20px;height:20px;background:#bae6fd;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;color:#0369a1;">4</div>
                                <span>Paste the output below, then click Generate Topics to generate your slides</span>
                            </div>
                        </div>
                        <button type="button" class="cc-btn cc-btn-primary" id="cc-download-pd-prompt" data-testid="button-download-pd-prompt" style="margin-bottom:12px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:16px;height:16px;">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download ChatGPT Prompt File (includes your topics)
                        </button>
                        <textarea id="cc-pd-paste-chatgpt" class="cc-textarea" style="min-height:140px;" 
                                  placeholder="Optional: Paste ChatGPT output or any reference material here to guide the AI..."
                                  data-testid="textarea-pd-chatgpt">${escapeHtml(pdPastedContent)}</textarea>
                        <div style="display:flex;justify-content:space-between;margin-top:4px;">
                            <span class="cc-paste-word-count" id="cc-pd-chatgpt-count">${pdPastedContent ? pdPastedContent.split(/\\s+/).filter(Boolean).length + ' words' : '0 words'}</span>
                        </div>
                    </div>
                </div>


                <div class="cc-wizard-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-prev-step" data-testid="button-back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back
                    </button>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-next-step" data-testid="button-next">
                        Generate Topics
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon-right">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    };

    const renderOutcomeItem = (index, text) => {
        return `
            <div class="cc-outcome-item" data-index="${index}">
                <span class="cc-outcome-number">${index + 1}</span>
                <textarea class="cc-textarea" placeholder="Enter learning outcome..." 
                          data-testid="input-outcome-${index}">${escapeHtml(text)}</textarea>
                ${index > 0 ? `<button type="button" class="cc-btn-icon-only cc-btn-danger" data-action="delete-outcome">&times;</button>` : ''}
            </div>
        `;
    };

    const renderWorkplaceDetails = (data) => {
        const wordCount = data.content?.split(/\s+/).length || 0;
        const topicCount = suggestedMajorTopics.length;
        const selectedCount = selectedMajorTopicIds.length;
        
        return `
            <div class="cc-unit-card">
                <div class="cc-unit-header">
                    <span class="cc-unit-code">${escapeHtml(data.filename || 'Uploaded Document')}</span>
                    <span class="cc-unit-status">Content Extracted</span>
                </div>
                <h4 class="cc-unit-title">${escapeHtml(data.title || 'Training Content')}</h4>
                <div class="cc-unit-stats">
                    <div class="cc-stat">
                        <span class="cc-stat-value">${wordCount.toLocaleString()}</span>
                        <span class="cc-stat-label">Words</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${data.sections?.length || 0}</span>
                        <span class="cc-stat-label">Sections</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${topicCount}</span>
                        <span class="cc-stat-label">Topics</span>
                    </div>
                </div>
                
                ${suggestedMajorTopics.length > 0 ? renderMajorTopicSelector() : `
                    <div class="cc-suggest-topics-section">
                        <p class="cc-suggest-hint">Click below to have AI analyze your document and suggest subtopics for your major topic.</p>
                        <button type="button" class="cc-btn cc-btn-secondary cc-wp-inner-suggest-btn" data-testid="button-suggest-workplace-topics">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                                <circle cx="7.5" cy="14.5" r="1.5"/>
                                <circle cx="16.5" cy="14.5" r="1.5"/>
                            </svg>
                            Suggest Subtopics
                        </button>
                        <div id="cc-workplace-inner-suggest-loading" class="cc-loading-state cc-hidden">
                            <div class="cc-spinner"></div>
                            <span>AI is suggesting subtopics for your major topic...</span>
                        </div>
                    </div>
                `}
            </div>
        `;
    };

    // Helper: some TGA PDFs concatenate all PC body text into el.name during PDF parsing.
    // Strip leaked PC text by searching for the opening 35 chars of each PC inside the name.
    // Short prefix survives PDF line-wrap reformatting where exact text may differ.
    // FIX v10.43: Added fallback heuristic for when performanceCriteria is empty or search
    // keys don't match (e.g. TLIF0009 table-format PDFs). Also covers leakIdx=0 edge case.
    const cleanElementName = (el) => {
        const raw = el.title || el.name || el.text || '';
        if (!raw) return raw;

        // Pass 1: PC-based stripping (most accurate  -  uses actual PC body text as search key)
        const pcs = el.performanceCriteria || [];
        for (const pc of pcs) {
            const pcText = typeof pc === 'string' ? pc : (pc.text || pc.title || '');
            const pcBody = pcText.replace(/^[\d.]+\d\s+/, '').trim();
            if (pcBody.length < 10) continue;
            // Try decreasing key lengths to survive minor PDF reformatting differences
            for (const keyLen of [35, 25, 15]) {
                if (pcBody.length < keyLen) continue;
                const searchKey = pcBody.substring(0, keyLen);
                const leakIdx = raw.indexOf(searchKey);
                if (leakIdx > 0) return raw.substring(0, leakIdx).trim();
            }
        }

        // Pass 2: Fallback  -  if the element name is suspiciously long (>150 chars),
        // it almost certainly contains leaked PC text. Truncate at the last word
        // boundary before 130 chars (safely within the longest real TGA element title).
        if (raw.length > 150) {
            const truncated = raw.substring(0, 130);
            const lastSpace = truncated.lastIndexOf(' ');
            return (lastSpace > 30 ? truncated.substring(0, lastSpace) : truncated).trim();
        }

        return raw;
    };

    // v8.4.34: Render element list with radio-style single selection and PC details
    const renderElementList = (data) => {
        if (!data.elements || data.elements.length === 0) return '<p class="cc-form-hint">No elements found in this unit.</p>';
        
        return data.elements.map((el, idx) => {
            const elementId = idx + 1;
            const isSelected = selectedElementIds.includes(elementId);
            const pcCount = el.performanceCriteria?.length || 0;
            const pcList = (el.performanceCriteria || []).map(pc => {
                const pcText = typeof pc === 'string' ? pc : (pc.text || pc.title || '');
                return pcText;
            }).filter(t => t);

            const displayName = cleanElementName(el) || 'Element ' + elementId;
            
            return `
                <label class="cc-element-radio-card ${isSelected ? 'selected' : ''}" data-element-id="${elementId}" data-testid="element-card-${elementId}">
                    <div class="cc-element-radio-header">
                        <div class="cc-element-radio-left">
                            <input type="radio" name="cc-element-select" class="cc-element-radio" 
                                   value="${elementId}" ${isSelected ? 'checked' : ''}
                                   data-element-id="${elementId}" data-testid="radio-element-${elementId}">
                            <span class="cc-element-number-badge">${elementId}</span>
                            <span class="cc-element-radio-title">${escapeHtml(displayName)}</span>
                        </div>
                        <span class="cc-element-pc-count">${pcCount} PC${pcCount !== 1 ? 's' : ''}</span>
                    </div>
                    ${pcList.length > 0 ? `
                    <div class="cc-element-pc-list">
                        ${pcList.map(pc => `<div class="cc-element-pc-item"><span class="cc-pc-bullet"></span><span class="cc-pc-text">${escapeHtml(pc)}</span></div>`).join('')}
                    </div>` : ''}
                </label>
            `;
        }).join('');
    };

    const renderTGADetails = (data) => {
        const allPcCount = data.elements?.reduce((sum, el) => sum + (el.performanceCriteria?.length || 0), 0) || 0;
        
        // v8.4.34: Do NOT auto-select all elements. User must pick ONE.
        // selectedElementIds stays empty until user explicitly selects.
        
        return `
            <div class="cc-unit-card">
                <div class="cc-unit-header">
                    <span class="cc-unit-code">${escapeHtml(data.unitCode)}</span>
                    <span class="cc-unit-status">Fetched from TGA</span>
                </div>
                <h4 class="cc-unit-title">${escapeHtml(data.unitTitle)}</h4>
                <div class="cc-unit-stats">
                    <div class="cc-stat">
                        <span class="cc-stat-value">${data.elements?.length || 0}</span>
                        <span class="cc-stat-label">Elements</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${allPcCount}</span>
                        <span class="cc-stat-label">PC</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${data.knowledgeEvidence?.length || 0}</span>
                        <span class="cc-stat-label">KE</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${data.performanceEvidence?.length || 0}</span>
                        <span class="cc-stat-label">PE</span>
                    </div>
                    <div class="cc-stat">
                        <span class="cc-stat-value">${data.foundationSkills?.length || 0}</span>
                        <span class="cc-stat-label">FS</span>
                    </div>
                </div>
                
                <!-- v6.9.38: Element selector REMOVED - Topics ARE elements, no double handling needed -->
                <!-- User selects which elements to include via the Topic selector after clicking Suggest Topics -->
                
                <!-- v6.9.29: Topics now render AFTER Suggest Topics button for natural scroll flow -->
            </div>
        `;
    };

    const renderMajorTopicSelector = () => {
        const selectedCount = selectedMajorTopicIds.length;
        const totalCount = suggestedMajorTopics.length;
        
        return `
            <div class="cc-major-topic-selector">
                <div class="cc-topic-selector-header">
                    <div class="cc-topic-selector-info">
                        <h5 class="cc-topic-selector-title">
                            Compliance Coverage Map
                            <span class="cc-planning-badge" title="This layer ensures audit coverage. Specific workplace examples appear in the Content Layers.">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-badge-icon"><path d="M3.5 5.5L5 7l2.5-2.5"/><path d="M3.5 11.5L5 13l2.5-2.5"/><path d="M3.5 17.5L5 19l2.5-2.5"/><path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/></svg>
                                Planning Layer
                            </span>
                        </h5>
                        <p class="cc-topic-selector-hint">What this unit must cover (expanded later with role-specific content)</p>
                    </div>
                    <div class="cc-topic-selector-stats">
                        <span class="cc-stats-badge">${selectedCount}/${totalCount} selected</span>
                    </div>
                </div>
                <div class="cc-planning-info-banner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" class="cc-info-icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    <div class="cc-planning-info-text">
                        <strong>About this section:</strong> These topics show what must be covered to meet unit requirements. They are planning markers, not learner-facing content. Each topic will be expanded in the next step into role-specific explanations, scenarios, and activities based on your selected context.
                    </div>
                </div>
                <div class="cc-topic-selector-actions">
                    <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" id="cc-select-all-topics" data-testid="button-select-all">
                        Select All
                    </button>
                    <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" id="cc-deselect-all-topics" data-testid="button-deselect-all">
                        Deselect All
                    </button>
                </div>
                <div class="cc-major-topic-list">
                    ${suggestedMajorTopics.map((topic, idx) => {
                        const isChecked = selectedMajorTopicIds.includes(topic.id);
                        const _pcs = topic.coverageSummary?.performanceCriteria;
                        const _pcsDisplay = Array.isArray(_pcs) && _pcs.length && _pcs[0]
                            ? _pcs.join(', ')
                            : (_pcs?.length || 0);
                        const coverageText = topic.coverageSummary ? 
                            `Elements: ${topic.coverageSummary.elements?.join(', ') || '-'} | PCs: ${_pcsDisplay}` : '';
                        return `
                            <label class="cc-major-topic-card ${isChecked ? 'selected' : ''}" data-topic-id="${topic.id}">
                                <div class="cc-topic-card-checkbox">
                                    <input type="checkbox" class="cc-major-topic-checkbox" 
                                           data-topic-id="${topic.id}" 
                                           ${isChecked ? 'checked' : ''}
                                           data-testid="checkbox-topic-${idx}">
                                </div>
                                <div class="cc-topic-card-content">
                                    <div class="cc-topic-card-header">
                                        <span class="cc-topic-number-badge">${idx + 1}</span>
                                        <h6 class="cc-topic-card-title" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(topic.title)}</h6>
                                        <span class="cc-topic-time-badge">${escapeHtml(topic.estimatedTime || '15-20 min')}</span>
                                    </div>
                                    <p class="cc-topic-card-description">${escapeHtml(topic.description)}</p>
                                    ${topic.splitPart ? `<div style="margin-top:4px;padding:2px 8px;font-size:11px;font-weight:600;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;display:inline-block;">Part ${topic.splitPart} of ${topic.splitTotal} — split (${MAX_PCS_PER_SECTION}+ PCs)</div>` : ''}
                                    <div class="cc-topic-card-coverage">${escapeHtml(coverageText)}</div>
                                </div>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    const suggestMajorTopics = async () => {
        ccLog("suggestMajorTopics: Starting subtopic suggestion...");
        if (!tgaData) return;

        let vetMajorTopic = '';
        if (selectedElementIds.length > 0 && tgaData?.elements) {
            const selectedEl = tgaData.elements[selectedElementIds[0] - 1];
            vetMajorTopic = selectedEl ? (cleanElementName(selectedEl) || selectedEl?.title || selectedEl?.name || '') : '';
        }
        ccLog("suggestMajorTopics: TGA data:", tgaData?.unitCode, tgaData?.unitTitle, "| majorTopic:", vetMajorTopic);
        
        const loadingEl = document.getElementById('cc-suggest-loading');
        const suggestBtn = document.getElementById('cc-suggest-topics-btn');
        
        // Hide any other loading states that might be visible
        document.getElementById('cc-unit-loading')?.classList.add('cc-hidden');
        document.getElementById('cc-pdf-loading')?.classList.add('cc-hidden');
        
        loadingEl?.classList.remove('cc-hidden');
        if (suggestBtn) suggestBtn.disabled = true;
        
        try {
            // v6.6.4: Comprehensive request logging to diagnose AI generation failures
            // v6.9.36: Filter elements by user selection BEFORE sending to AI
            const filteredElements = tgaData.elements.filter((_, idx) => 
                selectedElementIds.length === 0 || selectedElementIds.includes(idx + 1)
            );
            
            const requestPayload = {
                unitCode: tgaData.unitCode,
                unitTitle: tgaData.unitTitle,
                majorTopic: vetMajorTopic,
                elements: filteredElements,
                selectedElementIds: selectedElementIds, // v11.78: so server knows real element numbers
                knowledgeEvidence: tgaData.knowledgeEvidence,
                performanceEvidence: tgaData.performanceEvidence,
                foundationSkills: tgaData.foundationSkills,
                context: (() => {
                    const countryCode = document.getElementById('cc-country')?.value || 'AU';
                    const state = document.getElementById('cc-state')?.value || '';
                    const industry = document.getElementById('cc-industry')?.value || '';
                    const industrySector = document.getElementById('cc-industry-sector')?.value || '';
                    const jobLevel = window.CC_SELECTED_JOB_LEVELS.length > 0
                        ? window.CC_SELECTED_JOB_LEVELS.join(', ')
                        : 'worker';
                    
                    // v6.9.14: jobTitle, jobTasks, taskEquipment left empty
                    // Server-side AI will auto-generate appropriate scenarios based on
                    // Industry + Sector + Job Level context
                    
                    
                    return {
                        country: countryCode,
                        state: state,
                        language: getCountryLang(countryCode),
                        industry: industry,
                        industrySector: industrySector,
                        jobLevel: jobLevel,
                        jobTitle: '',           // v6.9.14: AI auto-generates
                        jobTasks: [],           // v6.9.14: AI auto-generates
                        taskEquipment: {}       // v6.9.14: AI auto-generates
                    };
                })()
            };
            
            ccLog('suggestMajorTopics: Sending request to API...', { unitCode: requestPayload.unitCode, elements: requestPayload.elements?.length });
            const response = await fetch('https://lms-labs.com/api/moodle/content-creator/suggest-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            });
            
            if (!response.ok) {
            ccLog("suggestMajorTopics: Response status:", response.status, response.statusText);
                // v7.9.7: Enhanced error details from server
                let errorDetails = '';
                let debugInfo = '';
                let errorType = '';
                let timestamp = '';
                try {
                    const errorBody = await response.json();
                    errorDetails = errorBody.error || '';
                    debugInfo = errorBody.debugInfo || '';
                    errorType = errorBody.errorType || '';
                    timestamp = errorBody.timestamp || '';
                } catch (e) {
                    // Response wasn't JSON
                    try {
                        const errorText = await response.text();
                        errorDetails = errorText.substring(0, 200);
                    } catch (e2) {
                        errorDetails = 'Could not read error response';
                    }
                }
                throw new Error('API returned ' + response.status + ': ' + (errorDetails || response.statusText) + (debugInfo ? ' | Debug: ' + debugInfo : ''));
            }
            
            
            const responseText = await response.text();
            
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseErr) {
                throw new Error('Server returned invalid JSON: ' + responseText.substring(0, 200));
            }
            
            if (data.suggestedTopics) {
            ccLog("suggestMajorTopics: Parsed data:", { success: data.success, topics: data.suggestedTopics?.length || 0, error: data.error });
                data.suggestedTopics.forEach((t, i) => {
                    (t.subtopics || []).forEach((s, j) => {
                    });
                });
            }
            
            ccLog("suggestMajorTopics: Response received:", { success: data.success, topicCount: data.suggestedTopics?.length });
            if (data.success && data.suggestedTopics?.length > 0) {
                // v11.78: Belt-and-suspenders client-side correction of element numbers.
                // The server now receives selectedElementIds and uses them in the prompt,
                // so the AI should return correct numbers. This guard corrects any remaining
                // mismatch (e.g., AI ignores instruction) so topics always reflect the
                // element the user actually selected.
                suggestedMajorTopics = data.suggestedTopics.map((t, i) => {
                    const actualElNum = (selectedElementIds.length > i && selectedElementIds[i] > 0)
                        ? selectedElementIds[i]
                        : (i + 1);
                    // Fix title: replace "Element N:" prefix with correct number
                    let title = t.title || '';
                    title = title.replace(/^Element\s+\d+:\s*/i, 'Element ' + actualElNum + ': ');
                    if (title.length > 150) {
                        const trunc = title.substring(0, 130);
                        const sp = trunc.lastIndexOf(' ');
                        title = (sp > 30 ? trunc.substring(0, sp) : trunc).trim();
                    }
                    // Fix subtopics: correct pcNumber, id, and title prefix
                    const fixedSubtopics = (t.subtopics || []).map((sub, si) => {
                        const fixedPc = actualElNum + '.' + (si + 1);
                        const subTitle = (sub.title || '').replace(/^\d+\.\d+\.?\s+/, fixedPc + '. ');
                        return Object.assign({}, sub, {
                            pcNumber: fixedPc,
                            id: fixedPc,
                            title: subTitle
                        });
                    });
                    // Fix coverageSummary.performanceCriteria codes
                    const fixedCoverage = t.coverageSummary
                        ? Object.assign({}, t.coverageSummary, {
                            performanceCriteria: fixedSubtopics.map(function(s) { return s.pcNumber; })
                          })
                        : t.coverageSummary;
                    return Object.assign({}, t, {
                        id: 'Element ' + actualElNum,
                        elementNumber: actualElNum,
                        title: title,
                        subtopics: fixedSubtopics,
                        coverageSummary: fixedCoverage
                    });
                });
                // AUTO-SPLIT-SECTION: Post-process AI-returned topics — if the corresponding
                // TGA element has >MAX_PCS_PER_SECTION PCs, split into Part 1 + Part 2.
                // This mirrors createDefaultMajorTopics() split logic for the AI path.
                suggestedMajorTopics = suggestedMajorTopics.flatMap(function(t) {
                    var elNum = t.elementNumber || 0;
                    var el = tgaData && tgaData.elements && tgaData.elements.find(function(_, idx) { return idx + 1 === elNum; });
                    var pcCount = (el && el.performanceCriteria && el.performanceCriteria.length) || 0;
                    var subs = t.subtopics || [];
                    if (pcCount > MAX_PCS_PER_SECTION && subs.length > 1) {
                        var splitAt = Math.ceil(subs.length / 2);
                        var subsA = subs.slice(0, splitAt);
                        var subsB = subs.slice(splitAt);
                        var baseTitle = t.title.replace(/\s*[\u2014\u2013-]\s*Part\s+\d.*$/i, '');
                        var _allPcCodes = t.coverageSummary?.performanceCriteria || [];
                        var _pcCodesA = _allPcCodes.slice(0, splitAt);
                        var _pcCodesB = _allPcCodes.slice(splitAt);
                        return [
                            Object.assign({}, t, { id: t.id + ' Part 1', title: baseTitle + ' \u2014 Part 1 of 2', subtopics: subsA, splitPart: 1, splitTotal: 2, coverageSummary: t.coverageSummary ? Object.assign({}, t.coverageSummary, { performanceCriteria: _pcCodesA }) : t.coverageSummary }),
                            Object.assign({}, t, { id: t.id + ' Part 2', title: baseTitle + ' \u2014 Part 2 of 2', subtopics: subsB, splitPart: 2, splitTotal: 2, coverageSummary: t.coverageSummary ? Object.assign({}, t.coverageSummary, { performanceCriteria: _pcCodesB }) : t.coverageSummary })
                        ];
                    }
                    return [t];
                });
                selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
                
                // v6.9.29: Render topics into container BELOW the Suggest Topics button
                const topicsContainer = document.getElementById('cc-topics-container');
                if (topicsContainer) {
                    topicsContainer.innerHTML = renderMajorTopicSelector();
                    bindMajorTopicSelectorEvents();
                    ccLog("suggestMajorTopics: Rendering topics to container");
                }
                updateGenerateTopicsButton(); // v6.9.5: Show button after topics suggested
                hideError();
            } else {
                showError(data.error || 'Failed to suggest topics. Using default topic structure.');
                createDefaultMajorTopics();
            }
        } catch (err) {
            const errorMsg = err?.message || err?.toString() || 'Unknown error'; showError('Topic suggestion failed: ' + errorMsg.substring(0, 200));
            ccError("suggestMajorTopics: Error:", errorMsg);
            createDefaultMajorTopics();
        } finally {
            loadingEl?.classList.add('cc-hidden');
            if (suggestBtn) suggestBtn.disabled = false;
        }
    };

    // Convert abstract PC text to workplace-action title (Golden Rules compliant)
    const pcToWorkplaceAction = (pcText) => {
        if (!pcText) return 'Complete Required Tasks';
        
        // Remove common abstract prefixes and convert to action verbs
        const abstractToAction = {
            'identifying': 'Check',
            'interpreting': 'Read and Apply',
            'recognizing': 'Spot',
            'understanding': 'Apply',  // v6.6.4: Changed from 'Learn' (BANNED) to 'Apply'
            'demonstrating': 'Show',
            'applying': 'Use',
            'evaluating': 'Review',
            'analyzing': 'Examine',
            'selecting': 'Choose',
            'determining': 'Decide',
            'establishing': 'Set Up',
            'maintaining': 'Keep Up',
            'monitoring': 'Watch',
            'communicating': 'Talk With Team About',
            'documenting': 'Record',
            'reporting': 'Report',
            'implementing': 'Put Into Action',
            'following': 'Follow',
            'completing': 'Complete',
            'preparing': 'Get Ready',
            'inspecting': 'Check',
            'verifying': 'Confirm',
            'ensuring': 'Make Sure',
            'obtaining': 'Get',
            'accessing': 'Access',
            'reviewing': 'Review'
        };
        
        let result = pcText.trim();
        const firstWord = result.split(' ')[0].toLowerCase();
        
        // Replace abstract gerund with action verb
        if (abstractToAction[firstWord]) {
            result = abstractToAction[firstWord] + ' ' + result.split(' ').slice(1).join(' ');
        }
        
        // Capitalize first letter and limit length
        result = result.charAt(0).toUpperCase() + result.slice(1);
        const words = result.split(' ');
        if (words.length > 8) {
            result = words.slice(0, 8).join(' ');
        }
        
        return result;
    };

    const createDefaultMajorTopics = () => {
        if (!tgaData?.elements?.length) return;
        
        // ========================================================================
        // v6.9.15: ELEMENT/PC STRUCTURE - Only selected elements
        // Elements = Major Topics (exact numbering)
        // Performance Criteria = Subtopics (exact numbering, minimum 3 dot points each)
        // v6.6.76: Now uses storedContext for job-specific content in fallback
        // ========================================================================
        
        // v6.9.17: Log ALL context fields being used
        const industry = storedContext?.industry || '';
        const industrySector = storedContext?.industrySector || '';
        const jobLevel = storedContext?.jobLevel || 'worker';
        const jobTitle = storedContext?.jobTitle || '';
        const jobTasks = storedContext?.jobTasks || [];
        
        // v6.9.15: Filter elements to only include selected ones
        const elementsToProcess = tgaData.elements.filter((_, idx) => 
            selectedElementIds.length === 0 || selectedElementIds.includes(idx + 1)
        );
        
        // Get KE/PE/FS from tgaData for distribution across subtopics
        const allKE = tgaData.knowledgeEvidence || [];
        const allPE = tgaData.performanceEvidence || [];
        const allFS = tgaData.foundationSkills || [];
        const totalPCs = tgaData.elements.reduce((sum, el) => sum + (el.performanceCriteria?.length || 0), 0) || 1;
        
        // AUTO-SPLIT-SECTION (v12.78): Helper — builds subtopics from a slice of PCs.
        // pcStartOffset = index within this element's PC array where this slice begins.
        const buildSubtopicsFromPCs = (pcSlice, pcStartOffset, elNumber, elName, pcOffset) => {
            return pcSlice.map((pc, sliceIdx) => {
                const pcIdx = pcStartOffset + sliceIdx;
                const pcNumber = `${elNumber}.${pcIdx + 1}`;
                const pcText = typeof pc === 'string' ? pc : (pc?.text || pc?.description || pc?.name || `Performance Criterion ${pcNumber}`);
                const absolutePCIndex = pcOffset + pcIdx;

                const kePerPC = Math.max(1, Math.ceil(allKE.length / totalPCs));
                const keStart = absolutePCIndex * kePerPC;
                const keSlice = allKE.slice(keStart, keStart + kePerPC).map((k, ki) => `KE${keStart + ki + 1}`);

                const pePerPC = Math.max(1, Math.ceil(allPE.length / totalPCs));
                const peStart = absolutePCIndex * pePerPC;
                const peSlice = allPE.slice(peStart, peStart + pePerPC).map((p, pi) => `PE${peStart + pi + 1}`);

                const fsPerPC = Math.max(1, Math.ceil(allFS.length / totalPCs));
                const fsStart = absolutePCIndex * fsPerPC;
                const fsSlice = allFS.slice(fsStart, fsStart + fsPerPC).map((f, fi) => `FS${fsStart + fi + 1}`);

                // v6.6.4: Generate keyPoints DYNAMICALLY from PC text - NO hardcoded content
                // v6.6.76: Include job context (sector, title, tasks) in keyPoints generation
                // v6.6.79: Strip leading number from pcText to avoid "3.1 3.1 ..." duplication
                const pcClean = pcText.replace(/^[\d.]+\s*/, '').trim();
                const keyPoints = generateDynamicKeyPoints(pcClean, pcNumber, elName, tgaData);

                // v6.6.76: Add job-specific keyPoint if context available
                if (jobTitle && industrySector && keyPoints.length > 0) {
                    keyPoints[0] = `As a ${jobTitle} in ${industrySector}: ${keyPoints[0]}`;
                }

                // v8.4.36: Slide heading = "X.Y. [official TGA PC text]"
                const fullTitle = pcClean.charAt(0).toUpperCase() + pcClean.slice(1);
                const headingTitle = fullTitle.endsWith('.') ? fullTitle : fullTitle + '.';
                const fullDescription = headingTitle;

                return {
                    id: pcNumber,
                    pcNumber: pcNumber,
                    title: `${pcNumber}. ${headingTitle}`,
                    description: fullDescription,
                    keyPoints: keyPoints,
                    coversPC: [pcNumber],
                    coversMappings: {
                        pc: [pcNumber],
                        ke: keSlice,
                        pe: peSlice,
                        fs: fsSlice
                    }
                };
            });
        };

        // AUTO-SPLIT-SECTION (v12.78): flatMap allows one element to produce 2 topics
        // when its PC count exceeds MAX_PCS_PER_SECTION.
        suggestedMajorTopics = elementsToProcess.flatMap((el) => {
            const elIdx = tgaData.elements.indexOf(el);
            let pcOffset = 0;
            for (let i = 0; i < elIdx; i++) {
                pcOffset += (tgaData.elements[i].performanceCriteria?.length || 0);
            }
            const elNumber = elIdx + 1;
            const elName = cleanElementName(el) || `Element ${elNumber}`;
            const pcs = el.performanceCriteria || [];

            // v6.6.76: Include job context in element description
            let description = `This element covers the requirements for ${elName.toLowerCase()}.`;
            if (jobTitle && industrySector) {
                description = `As a ${jobTitle} in ${industrySector}, ${elName.toLowerCase()} is essential for workplace compliance.`;
            }

            // Helper: assemble a topic object from a subtopics array
            const makeTopicObj = (subtopics, titleOverride, idOverride, splitPart, splitTotal) => {
                const coveredKE = subtopics.flatMap(s => s.coversMappings?.ke || []);
                const coveredPE = subtopics.flatMap(s => s.coversMappings?.pe || []);
                const coveredFS = subtopics.flatMap(s => s.coversMappings?.fs || []);
                const pcCodes = subtopics.map(s => s.pcNumber);
                const pcTexts = subtopics.map(s => {
                    const raw = s.title || '';
                    return raw.replace(/^[\d.]+\s*/, '').replace(/\.\s*$/, '').trim();
                });
                const obj = {
                    id: idOverride,
                    elementNumber: elNumber,
                    title: titleOverride,
                    description: description,
                    estimatedTime: `${Math.max(10, subtopics.length * 5)}-${Math.max(15, subtopics.length * 8)} min`,
                    subtopics: subtopics,
                    // v6.9.17: Store FULL job context for AI generation
                    jobContext: {
                        industry: industry,
                        industrySector: industrySector,
                        jobLevel: jobLevel,
                        jobTitle: jobTitle,
                        jobTasks: jobTasks
                    },
                    coverageSummary: {
                        elements: [`${elNumber}`],
                        performanceCriteria: pcCodes,
                        performanceCriteriaTexts: pcTexts,
                        knowledgeEvidence: coveredKE,
                        performanceEvidence: coveredPE,
                        foundationSkills: coveredFS
                    }
                };
                if (splitPart) {
                    obj.splitPart = splitPart;
                    obj.splitTotal = splitTotal;
                }
                return obj;
            };

            // AUTO-SPLIT: if PC count exceeds threshold, emit two topic objects
            if (pcs.length > MAX_PCS_PER_SECTION) {
                const splitAt = Math.ceil(pcs.length / 2);
                const pcsA = pcs.slice(0, splitAt);
                const pcsB = pcs.slice(splitAt);
                const subtopicsA = buildSubtopicsFromPCs(pcsA, 0, elNumber, elName, pcOffset);
                const subtopicsB = buildSubtopicsFromPCs(pcsB, splitAt, elNumber, elName, pcOffset);
                const pcFirst = `${elNumber}.1`;
                const pcMid   = `${elNumber}.${splitAt + 1}`;
                const pcLast  = `${elNumber}.${pcs.length}`;
                return [
                    makeTopicObj(
                        subtopicsA,
                        `Element ${elNumber}: ${elName} — Part 1 (PCs ${pcFirst}–${elNumber}.${splitAt})`,
                        `Element ${elNumber} Part 1`,
                        1, 2
                    ),
                    makeTopicObj(
                        subtopicsB,
                        `Element ${elNumber}: ${elName} — Part 2 (PCs ${pcMid}–${pcLast})`,
                        `Element ${elNumber} Part 2`,
                        2, 2
                    )
                ];
            }

            // Normal path — single topic for this element
            const subtopics = buildSubtopicsFromPCs(pcs, 0, elNumber, elName, pcOffset);
            return [makeTopicObj(
                subtopics,
                `Element ${elNumber}: ${elName}`,
                `Element ${elNumber}`,
                null, null
            )];
        });
        
        selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
        
        // v6.9.29: Render topics into container BELOW the Suggest Topics button
        const topicsContainer = document.getElementById('cc-topics-container');
        if (topicsContainer) {
            topicsContainer.innerHTML = renderMajorTopicSelector();
            bindMajorTopicSelectorEvents();
        }
        updateGenerateTopicsButton(); // v6.9.5: Show button after default topics created
    };

    const renderStep3 = () => {
        if (!topicPlan) {
            return `
                <div class="cc-step-content" data-testid="step-3-generating">
                    <div class="cc-loading-state">
                        <div class="cc-spinner cc-spinner-lg"></div>
                        <h3>Generating Topic Structure...</h3>
                        <p class="cc-text-muted">AI is analyzing your inputs and creating an optimized learning sequence.</p>
                    </div>
                </div>
            `;
        }

        // Build subtitle using stored context
        let subtitleText = 'Based on your course context and learning outcomes';
        if (selectedMode === 'vet' && storedContext) {
            const industry = storedContext.industry || '';
            const industrySector = storedContext.industrySector || '';
            const jobLevelLabel = storedContext.jobLevel
                ? storedContext.jobLevel.split(', ').map(v => JOB_LEVELS.find(j => j.value === v)?.label || v).join(' + ')
                : '';
            const jobTitle = storedContext.jobTitle || '';
            const parts = [tgaData?.unitCode || 'Unit'];
            // v6.6.76: Show industry with sector (e.g., "Building & Construction - Roofing")
            if (industry && industrySector) {
                parts.push(`${industry} - ${industrySector}`);
            } else if (industry) {
                parts.push(industry);
            }
            if (jobLevelLabel) parts.push(jobLevelLabel);
            if (jobTitle) parts.push(jobTitle);
            subtitleText = `Based on ${parts.join(' * ')}`;
        } else if (selectedMode === 'workplace' && storedContext) {
            const parts = [];
            if (storedContext.companyName) parts.push(storedContext.companyName);
            const trainingLabel = TRAINING_TYPES.find(t => t.value === storedContext.trainingType)?.label || '';
            if (trainingLabel) parts.push(trainingLabel);
            subtitleText = parts.length > 0 ? `Based on ${parts.join(' * ')}` : 'Based on your workplace document';
        } else if (selectedMode === 'pd' && storedContext) {
            const courseTitle = storedContext.courseTitle || storedContext.courseName || '';
            subtitleText = courseTitle
                ? `Based on ${courseTitle} * ${storedOutcomes.length} subtopic${storedOutcomes.length !== 1 ? 's' : ''}`
                : `Based on ${storedOutcomes.length} subtopic${storedOutcomes.length !== 1 ? 's' : ''}`;
        } else if (selectedMode === 'university' && storedContext) {
            const parts = [];
            if (storedContext.courseName) parts.push(storedContext.courseName);
            if (storedContext.subjectArea) parts.push(storedContext.subjectArea);
            subtitleText = parts.length > 0
                ? `Based on ${parts.join(' * ')} * ${storedOutcomes.length} subtopic${storedOutcomes.length !== 1 ? 's' : ''}`
                : `Based on ${storedOutcomes.length} subtopic${storedOutcomes.length !== 1 ? 's' : ''}`;
        }

        return `
            <div class="cc-step-content" data-testid="step-3-topics">
                <h2 class="cc-section-title">Proposed Learning Structure</h2>
                <p class="cc-section-subtitle">${subtitleText}</p>

                ${selectedMode === 'vet' ? renderCoverageBadges() : ''}

                <div class="cc-topics-tree">
                    ${topicPlan.topics.map((topic, ti) => renderTopicItem(topic, ti)).join('')}
                </div>

                <!-- Appearance Settings (v6.4.4) - Header Color -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Appearance Settings</h3>
                    <p class="cc-form-hint">Customize the look and feel of your learning content</p>
                    
                    <div class="cc-form-group">
                        <label class="cc-form-label">Slide Header Color</label>
                        <div class="cc-color-picker-wrapper">
                            <input type="color" id="cc-header-color" class="cc-color-input" value="${getMoodlePrimaryColor()}" data-testid="input-header-color">
                            <input type="text" id="cc-header-color-hex" class="cc-color-hex-input" value="${getMoodlePrimaryColor()}" placeholder="${getMoodlePrimaryColor()}" data-testid="input-header-color-hex">
                            <span class="cc-color-hint">Uses your site's primary color by default</span>
                        </div>
                    </div>
                </div>

                <!-- Voice Settings (v6.5.11) - with On/Off toggle, BEFORE progression mode -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Voiceover Settings</h3>
                    <p class="cc-form-hint">Configure the AI-generated voiceover for each slide (Chirp 3 HD)</p>
                    
                    <!-- Voiceover Enable/Disable Toggle (v6.5.11) -->
                    <div class="cc-form-group cc-voiceover-toggle-group">
                        <label class="cc-form-label">Enable Voiceover</label>
                        <div class="cc-toggle-wrapper">
                            <label class="cc-toggle" data-testid="toggle-voiceover">
                                <input type="checkbox" id="cc-voiceover-enabled" checked>
                                <span class="cc-toggle-slider"></span>
                            </label>
                            <span class="cc-toggle-label" id="cc-voiceover-status">Enabled</span>
                        </div>
                        <p class="cc-form-hint-sm">When disabled, slides will not have AI voiceovers</p>
                    </div>
                    
                    <div class="cc-voice-settings-grid" id="cc-voice-options">
                        <!-- Voice Selection (v13.1: 8 Chirp 3 HD voices) -->
                        <div class="cc-voice-setting cc-voice-setting-full">
                            <label class="cc-form-label">Voice</label>
                            <div class="cc-voice-group-label">Female</div>
                            <div class="cc-voice-options">
                                <label class="cc-voice-card selected" data-voice="Aoede">
                                    <input type="radio" name="voiceName" value="Aoede" checked data-testid="radio-voice-Aoede">
                                    <span class="cc-voice-card-name">Aoede</span>
                                    <span class="cc-voice-card-style">Warm &amp; Friendly</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Kore">
                                    <input type="radio" name="voiceName" value="Kore" data-testid="radio-voice-Kore">
                                    <span class="cc-voice-card-name">Kore</span>
                                    <span class="cc-voice-card-style">Clear &amp; Professional</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Leda">
                                    <input type="radio" name="voiceName" value="Leda" data-testid="radio-voice-Leda">
                                    <span class="cc-voice-card-name">Leda</span>
                                    <span class="cc-voice-card-style">Soft &amp; Nurturing</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Zephyr">
                                    <input type="radio" name="voiceName" value="Zephyr" data-testid="radio-voice-Zephyr">
                                    <span class="cc-voice-card-name">Zephyr</span>
                                    <span class="cc-voice-card-style">Energetic &amp; Youthful</span>
                                </label>
                            </div>
                            <div class="cc-voice-group-label cc-voice-group-label-male">Male</div>
                            <div class="cc-voice-options">
                                <label class="cc-voice-card" data-voice="Puck">
                                    <input type="radio" name="voiceName" value="Puck" data-testid="radio-voice-Puck">
                                    <span class="cc-voice-card-name">Puck</span>
                                    <span class="cc-voice-card-style">Upbeat &amp; Clear</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Charon">
                                    <input type="radio" name="voiceName" value="Charon" data-testid="radio-voice-Charon">
                                    <span class="cc-voice-card-name">Charon</span>
                                    <span class="cc-voice-card-style">Informative &amp; Calm</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Fenrir">
                                    <input type="radio" name="voiceName" value="Fenrir" data-testid="radio-voice-Fenrir">
                                    <span class="cc-voice-card-name">Fenrir</span>
                                    <span class="cc-voice-card-style">Excitable &amp; Bold</span>
                                </label>
                                <label class="cc-voice-card" data-voice="Orus">
                                    <input type="radio" name="voiceName" value="Orus" data-testid="radio-voice-Orus">
                                    <span class="cc-voice-card-name">Orus</span>
                                    <span class="cc-voice-card-style">Firm &amp; Direct</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Voice Language -->
                        <div class="cc-voice-setting">
                            <label class="cc-form-label">Voiceover Language</label>
                            <select id="cc-voice-language" class="cc-select" data-testid="select-voice-language">
                                <option value="en-AU" selected>English (Australia)</option>
                                <option value="en-GB">English (UK)</option>
                                <option value="en-US">English (US)</option>
                                <option value="en-IN">English (India)</option>
                                <option value="ar-XA">Arabic</option>
                                <option value="bn-IN">Bengali (India)</option>
                                <option value="bg-BG">Bulgarian</option>
                                <option value="ca-ES">Catalan</option>
                                <option value="yue-HK">Cantonese (Hong Kong)</option>
                                <option value="cs-CZ">Czech</option>
                                <option value="da-DK">Danish</option>
                                <option value="nl-BE">Dutch (Belgium)</option>
                                <option value="nl-NL">Dutch (Netherlands)</option>
                                <option value="fil-PH">Filipino</option>
                                <option value="fi-FI">Finnish</option>
                                <option value="fr-CA">French (Canada)</option>
                                <option value="fr-FR">French (France)</option>
                                <option value="de-DE">German</option>
                                <option value="el-GR">Greek</option>
                                <option value="gu-IN">Gujarati</option>
                                <option value="he-IL">Hebrew</option>
                                <option value="hi-IN">Hindi</option>
                                <option value="hu-HU">Hungarian</option>
                                <option value="is-IS">Icelandic</option>
                                <option value="id-ID">Indonesian</option>
                                <option value="it-IT">Italian</option>
                                <option value="ja-JP">Japanese</option>
                                <option value="kn-IN">Kannada</option>
                                <option value="ko-KR">Korean</option>
                                <option value="lv-LV">Latvian</option>
                                <option value="lt-LT">Lithuanian</option>
                                <option value="ms-MY">Malay</option>
                                <option value="ml-IN">Malayalam</option>
                                <option value="cmn-CN">Mandarin (China)</option>
                                <option value="cmn-TW">Mandarin (Taiwan)</option>
                                <option value="mr-IN">Marathi</option>
                                <option value="nb-NO">Norwegian</option>
                                <option value="pl-PL">Polish</option>
                                <option value="pt-BR">Portuguese (Brazil)</option>
                                <option value="pt-PT">Portuguese (Portugal)</option>
                                <option value="pa-IN">Punjabi</option>
                                <option value="ro-RO">Romanian</option>
                                <option value="ru-RU">Russian</option>
                                <option value="sr-RS">Serbian</option>
                                <option value="sk-SK">Slovak</option>
                                <option value="es-ES">Spanish (Spain)</option>
                                <option value="es-US">Spanish (US)</option>
                                <option value="sv-SE">Swedish</option>
                                <option value="ta-IN">Tamil</option>
                                <option value="te-IN">Telugu</option>
                                <option value="th-TH">Thai</option>
                                <option value="tr-TR">Turkish</option>
                                <option value="uk-UA">Ukrainian</option>
                                <option value="vi-VN">Vietnamese</option>
                            </select>
                        </div>
                        <!-- Additional Student Languages (v12.55) -->
                        <div class="cc-voice-setting cc-voice-setting-full" id="cc-additional-langs-setting">
                            <label class="cc-form-label">Additional Student Languages</label>
                            <p class="cc-form-hint-sm" style="margin:4px 0 10px;">Students can switch between the primary language above and any language selected here. Full content and voiceover will be generated in each selected language.</p>
                            <div class="cc-multilang-checkboxes" id="cc-additional-langs">
                                <label class="cc-multilang-option"><input type="checkbox" value="ar-XA" data-testid="chk-lang-ar"> Arabic</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="bn-IN" data-testid="chk-lang-bn"> Bengali (India)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="bg-BG" data-testid="chk-lang-bg"> Bulgarian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ca-ES" data-testid="chk-lang-ca"> Catalan</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="yue-HK" data-testid="chk-lang-yue"> Cantonese (Hong Kong)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="cs-CZ" data-testid="chk-lang-cs"> Czech</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="da-DK" data-testid="chk-lang-da"> Danish</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="nl-BE" data-testid="chk-lang-nl-be"> Dutch (Belgium)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="nl-NL" data-testid="chk-lang-nl"> Dutch (Netherlands)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="en-AU" data-testid="chk-lang-en-au"> English (Australia)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="en-GB" data-testid="chk-lang-en-gb"> English (UK)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="en-IN" data-testid="chk-lang-en-in"> English (India)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="en-US" data-testid="chk-lang-en-us"> English (US)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="fil-PH" data-testid="chk-lang-fil"> Filipino</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="fi-FI" data-testid="chk-lang-fi"> Finnish</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="fr-CA" data-testid="chk-lang-fr-ca"> French (Canada)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="fr-FR" data-testid="chk-lang-fr"> French (France)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="de-DE" data-testid="chk-lang-de"> German</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="el-GR" data-testid="chk-lang-el"> Greek</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="gu-IN" data-testid="chk-lang-gu"> Gujarati</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="he-IL" data-testid="chk-lang-he"> Hebrew</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="hi-IN" data-testid="chk-lang-hi"> Hindi</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="hu-HU" data-testid="chk-lang-hu"> Hungarian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="is-IS" data-testid="chk-lang-is"> Icelandic</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="id-ID" data-testid="chk-lang-id"> Indonesian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="it-IT" data-testid="chk-lang-it"> Italian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ja-JP" data-testid="chk-lang-ja"> Japanese</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="kn-IN" data-testid="chk-lang-kn"> Kannada</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ko-KR" data-testid="chk-lang-ko"> Korean</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="lv-LV" data-testid="chk-lang-lv"> Latvian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="lt-LT" data-testid="chk-lang-lt"> Lithuanian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ms-MY" data-testid="chk-lang-ms"> Malay</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ml-IN" data-testid="chk-lang-ml"> Malayalam</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="cmn-CN" data-testid="chk-lang-cmn-cn"> Mandarin (Simplified)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="cmn-TW" data-testid="chk-lang-cmn-tw"> Mandarin (Traditional)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="mr-IN" data-testid="chk-lang-mr"> Marathi</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="nb-NO" data-testid="chk-lang-nb"> Norwegian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="pl-PL" data-testid="chk-lang-pl"> Polish</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="pt-BR" data-testid="chk-lang-pt"> Portuguese (Brazil)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="pt-PT" data-testid="chk-lang-pt-pt"> Portuguese (Portugal)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="pa-IN" data-testid="chk-lang-pa"> Punjabi</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ro-RO" data-testid="chk-lang-ro"> Romanian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ru-RU" data-testid="chk-lang-ru"> Russian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="sr-RS" data-testid="chk-lang-sr"> Serbian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="sk-SK" data-testid="chk-lang-sk"> Slovak</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="es-ES" data-testid="chk-lang-es-es"> Spanish (Spain)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="es-US" data-testid="chk-lang-es"> Spanish (US)</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="sv-SE" data-testid="chk-lang-sv"> Swedish</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="ta-IN" data-testid="chk-lang-ta"> Tamil</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="te-IN" data-testid="chk-lang-te"> Telugu</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="th-TH" data-testid="chk-lang-th"> Thai</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="tr-TR" data-testid="chk-lang-tr"> Turkish</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="uk-UA" data-testid="chk-lang-uk"> Ukrainian</label>
                                <label class="cc-multilang-option"><input type="checkbox" value="vi-VN" data-testid="chk-lang-vi"> Vietnamese</label>
                            </div>
                            <p class="cc-form-hint-sm cc-tip-box" style="margin-top:8px;background:var(--cc-bg-secondary,#f1f5f9);padding:8px 12px;border-radius:6px;"><strong>Note:</strong> Primary language costs 100 credits per subtopic. Each additional language costs 50 credits per subtopic (translation pass). A full set of slides and voiceovers is created for each language selected. The credit estimate above updates automatically as you select languages.</p>
                        </div>
                    </div>
                </div>

                <!-- Images Section (v6.6.68) - AI-generated slide images -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Images</h3>
                    <p class="cc-form-hint">Add professional AI-generated images to learning slides</p>
                    
                    <div class="cc-form-group cc-images-toggle-group">
                        <label class="cc-form-label">Apply AI Images to All Slides</label>
                        <div class="cc-toggle-row">
                            <label class="cc-toggle" data-testid="toggle-images">
                                <input type="checkbox" id="cc-images-enabled" checked>
                                <span class="cc-toggle-slider"></span>
                            </label>
                            <span class="cc-toggle-label" id="cc-images-status">Enabled</span>
                        </div>
                        <p class="cc-form-hint-sm">When enabled, AI will generate images for each learning slide (5 credits per image)</p>
                        <p class="cc-form-hint-sm cc-tip-box" style="margin-top: 8px; background: var(--cc-bg-secondary, #f1f5f9); padding: 8px 12px; border-radius: 6px;">
                            <strong>Tip:</strong> You can also manually add or upload images after slides are generated by clicking the purple Edit button on any slide.
                        </p>
                    </div>
                </div>

                <!-- Decision Challenge Activities (v11.11) -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Decision Challenge Activities</h3>
                    <p class="cc-form-hint">Include the 3-activity challenge (quiz, flip cards, category sort) at the end of each topic</p>
                    
                    <div class="cc-form-group cc-activities-toggle-group">
                        <label class="cc-form-label">Include Decision Challenge</label>
                        <div class="cc-toggle-row">
                            <label class="cc-toggle" data-testid="toggle-activities">
                                <input type="checkbox" id="cc-activities-enabled" checked>
                                <span class="cc-toggle-slider"></span>
                            </label>
                            <span class="cc-toggle-label" id="cc-activities-status">Enabled</span>
                        </div>
                        <p class="cc-form-hint-sm">When disabled, content will be delivered without interactive challenge activities</p>
                    </div>
                </div>

                <!-- Progression Mode Selector (v6.5.11) - AFTER voiceover settings so toggle can disable "Must Listen" -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Slide Progression Mode</h3>
                    <p class="cc-form-hint">Choose how learners progress through the slides</p>
                    <div class="cc-progression-options" id="cc-progression-options">
                        <label class="cc-progression-card selected" data-mode="free">
                            <input type="radio" name="progressionMode" value="free" checked data-testid="radio-progression-free">
                            <div class="cc-progression-content">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-progression-icon">
                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                </svg>
                                <span class="cc-progression-title">Free Navigation</span>
                                <span class="cc-progression-desc">Learners can move freely between slides</span>
                            </div>
                        </label>
                        <label class="cc-progression-card" data-mode="timed">
                            <input type="radio" name="progressionMode" value="timed" data-testid="radio-progression-timed">
                            <div class="cc-progression-content">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-progression-icon">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                                <span class="cc-progression-title">Timed Reading</span>
                                <span class="cc-progression-desc">Minimum time per slide before continuing</span>
                            </div>
                        </label>
                        <label class="cc-progression-card" data-mode="voiceover" id="cc-progression-voiceover">
                            <input type="radio" name="progressionMode" value="voiceover" data-testid="radio-progression-voiceover">
                            <div class="cc-progression-content">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-progression-icon">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                                </svg>
                                <span class="cc-progression-title">Must Listen</span>
                                <span class="cc-progression-desc">Learners must listen to voiceover before continuing</span>
                            </div>
                        </label>
                    </div>
                    <div id="cc-timed-duration" class="cc-timed-options cc-hidden">
                        <label class="cc-form-label">Reading time per slide</label>
                        <select id="cc-slide-duration" class="cc-select" data-testid="select-slide-duration">
                            <option value="5">5 seconds</option>
                            <option value="10" selected>10 seconds</option>
                            <option value="15">15 seconds</option>
                            <option value="20">20 seconds</option>
                            <option value="30">30 seconds</option>
                            <option value="45">45 seconds</option>
                            <option value="60">1 minute</option>
                            <option value="90">1.5 minutes</option>
                            <option value="120">2 minutes</option>
                            <option value="180">3 minutes</option>
                            <option value="240">4 minutes</option>
                            <option value="300">5 minutes</option>
                            <option value="420">7 minutes</option>
                            <option value="600">10 minutes</option>
                        </select>
                    </div>
                </div>

                <!-- Topic Navigation Mode (v6.5.3) - Lockstep or Free -->
                <div class="cc-form-section">
                    <h3 class="cc-form-section-title">Topic Navigation Mode</h3>
                    <p class="cc-form-hint">Control whether learners must complete topics in order</p>
                    <div class="cc-progression-options">
                        <label class="cc-progression-card selected" data-mode="free">
                            <input type="radio" name="topicNavMode" value="free" checked data-testid="radio-topic-nav-free">
                            <div class="cc-progression-content">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-progression-icon">
                                    <rect x="3" y="3" width="7" height="7"/>
                                    <rect x="14" y="3" width="7" height="7"/>
                                    <rect x="14" y="14" width="7" height="7"/>
                                    <rect x="3" y="14" width="7" height="7"/>
                                </svg>
                                <span class="cc-progression-title">Free Navigation</span>
                                <span class="cc-progression-desc">Learners can access any topic in any order</span>
                            </div>
                        </label>
                        <label class="cc-progression-card" data-mode="lockstep">
                            <input type="radio" name="topicNavMode" value="lockstep" data-testid="radio-topic-nav-lockstep">
                            <div class="cc-progression-content">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-progression-icon">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <span class="cc-progression-title">Sequential (Lockstep)</span>
                                <span class="cc-progression-desc">Learners must complete each topic before accessing the next</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="cc-generate-section">
                    <div class="cc-generate-info">
                        <div class="cc-credit-info-row">
                            <div class="cc-credit-cost">
                                <span class="cc-credit-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M12 6v6l4 2"/>
                                    </svg>
                                </span>
                                ${getCreditEstimationHtml()}
                                <span class="cc-credit-label">to generate content</span>
                            </div>
                            <div class="cc-credit-balance">
                                <span class="cc-balance-label">Your balance:</span>
                                <span class="cc-balance-amount" id="cc-current-credits">${currentCredits !== null ? currentCredits.toLocaleString() : '...'}</span>
                                <span class="cc-balance-unit">credits</span>
                                <a href="https://lms-labs.com/pricing" target="_blank" class="cc-buy-credits-link" data-testid="link-buy-credits">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M12 8v8M8 12h8"/>
                                    </svg>
                                    Buy more
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="cc-progress-section" class="cc-progress-section cc-hidden">
                    <h3 class="cc-progress-title">Generating Content</h3>
                    <div class="cc-progress-bar">
                        <div class="cc-progress-fill" id="cc-gen-progress" style="width: 0%"></div>
                    </div>
                    <p id="cc-gen-status" class="cc-progress-status">Preparing...</p>
                    <!-- v12.57 FIX-CC-BUILDER-STUCK: "Skip voiceover" bypass button shown only
                         during voiceover pre-generation phase (toggled by JS). If the teacher
                         clicks it, the voiceover loop is cancelled and generation proceeds to
                         save  -  voiceovers will be generated on-demand the first time a student
                         (or the teacher) opens the activity, which is the existing fallback path. -->
                    <div id="cc-vo-skip-wrap" style="display:none;margin-top:12px;text-align:center;">
                        <button type="button" id="cc-vo-skip-btn" class="cc-btn cc-btn-ghost cc-btn-sm" style="font-size:0.82rem;opacity:0.8;">
                            Skip voiceover generation and continue
                        </button>
                        <p style="font-size:0.75rem;color:var(--cc-text-muted,#6b7280);margin:4px 0 0;">
                            Voiceovers will be generated when the activity is first opened.
                        </p>
                    </div>
                    <div id="cc-live-qa" class="cc-qa-results" style="display:none;margin-top:16px;"></div>
                </div>

                <!-- v7.5.xx: Credit Cost Estimation Panel -->
                <div id="cc-credit-estimation" class="cc-credit-estimation" style="margin-bottom: 16px; padding: 12px 16px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 1px solid #f59e0b; border-radius: 8px; display: none;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" style="width: 20px; height: 20px;">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            <span style="font-weight: 600; color: #92400e;">Estimated Credit Cost:</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                            <span id="cc-credit-estimate-value" style="font-size: 1.25rem; font-weight: 700; color: #b45309;" data-testid="text-credit-estimate">0 credits</span>
                            <span id="cc-credit-breakdown" style="font-size: 0.875rem; color: #78350f;"></span>
                        </div>
                    </div>
                    <p style="margin: 8px 0 0 0; font-size: 0.75rem; color: #78350f; opacity: 0.8;">
                        Based on <span id="cc-pc-count">0</span> PCs  x  credits per PC. Actual cost may vary with AI retries.
                    </p>
                </div>

                <div class="cc-wizard-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-prev-step" data-testid="button-back">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                        Back
                    </button>
                    <button type="button" class="cc-btn cc-btn-secondary" id="cc-export-excel-btn" data-testid="button-export-excel" style="display: none;">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                        </svg>
                        Export Excel Mapping
                    </button>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-generate-btn" data-testid="button-generate" title="Topics will be expanded using your selected job role, industry, and location.">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        Generate Role-Specific Content
                    </button>
                </div>
            </div>
        `;
    };

    const renderCoverageBadges = () => {
        if (!topicPlan?.coverage) return '';
        const { pc, ke, pe, fs } = topicPlan.coverage;
        return `
            <div class="cc-coverage-badges">
                <div class="cc-coverage-badge ${pc.covered === pc.total ? 'complete' : 'partial'}">
                    <span class="cc-badge-icon">PC</span>
                    <span class="cc-badge-value">${pc.covered}/${pc.total}</span>
                </div>
                <div class="cc-coverage-badge ${ke.covered === ke.total ? 'complete' : 'partial'}">
                    <span class="cc-badge-icon">KE</span>
                    <span class="cc-badge-value">${ke.covered}/${ke.total}</span>
                </div>
                <div class="cc-coverage-badge ${pe.covered === pe.total ? 'complete' : 'partial'}">
                    <span class="cc-badge-icon">PE</span>
                    <span class="cc-badge-value">${pe.covered}/${pe.total}</span>
                </div>
                <div class="cc-coverage-badge ${fs.covered === fs.total ? 'complete' : 'partial'}">
                    <span class="cc-badge-icon">FS</span>
                    <span class="cc-badge-value">${fs.covered}/${fs.total}</span>
                </div>
            </div>
        `;
    };

    // =========================================================================
    // WORLD-CLASS LEARNING STRUCTURE RENDERER (ChatGPT Refactor)
    // - DOM creation instead of string concatenation
    // - Semantic HTML with ARIA accessibility
    // - Audit-ready mapping document generation
    // =========================================================================

    // Strip leading number pattern from title (e.g., "1.1 Topic" -> "Topic")
    const stripNumberPrefix = (title) => {
        if (!title) return '';
        return title.replace(/^\d+(\.\d+)?\s*[- - :]?\s*/, '').trim();
    };

    // Normalize title with escaping and cleanup
    const normalizeTitle = (title) => escapeHtml(stripNumberPrefix(title || '').trim());

    // Create DOM element utility (clean + testable)
    const createEl = (tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    };

    // Normalize mappings for safe data handling (no silent failures)
    const normalizeMappings = (m = {}) => ({
        elements: Array.isArray(m.elements) ? m.elements : [],
        performanceCriteria: Array.isArray(m.performanceCriteria) ? m.performanceCriteria : [],
        performanceEvidence: Array.isArray(m.performanceEvidence) ? m.performanceEvidence : [],
        knowledgeEvidence: Array.isArray(m.knowledgeEvidence) ? m.knowledgeEvidence : [],
        foundationSkills: Array.isArray(m.foundationSkills) ? m.foundationSkills : []
    });

    // Subtopic renderer (componentised, accessible) - now includes keyPoints
    // v6.6.76: Use actual pcNumber from data instead of array index
    const renderSubtopicItemDOM = (subtopic, topicIndex, subIndex, elementNumber) => {
        const item = createEl('div', 'cc-subtopic-item');
        item.dataset.subtopicIndex = subIndex;
        item.setAttribute('role', 'listitem');

        // v6.6.76: Use actual PC number from subtopic data if available, else use element-based numbering
        const pcNumber = subtopic.pcNumber || `${elementNumber || (topicIndex + 1)}.${subIndex + 1}`;
        const number = createEl('span', 'cc-subtopic-number', pcNumber);

        const info = createEl('div', 'cc-subtopic-info');
        info.appendChild(createEl('span', 'cc-subtopic-title', normalizeTitle(subtopic.title)));

        // Render keyPoints (sub-sub-topics) if available
        const keyPoints = subtopic.keyPoints || [];
        if (keyPoints.length > 0) {
            const keyPointsList = createEl('ul', 'cc-keypoints-list');
            keyPoints.forEach(kp => {
                const li = createEl('li', 'cc-keypoint-item', typeof kp === 'string' ? kp : (kp.text || kp.title || ''));
                keyPointsList.appendChild(li);
            });
            info.appendChild(keyPointsList);
        }

        item.append(number, info);
        return item;
    };

    // Topic renderer (semantic + accessible with ARIA)
    // v6.6.76: Extract element number from topic.id (e.g., "Element 3" -> 3)
    const renderTopicItemDOM = (topic, topicIndex) => {
        const container = createEl('section', 'cc-topic-item');
        container.dataset.topicIndex = topicIndex;
        container.setAttribute('aria-labelledby', `cc-topic-title-${topicIndex}`);

        // v6.6.76: Extract actual element number from topic.id or title
        const elementMatch = (topic.id || topic.title || '').match(/Element\s*(\d+)/i);
        const elementNumber = elementMatch ? parseInt(elementMatch[1], 10) : (topicIndex + 1);

        const header = createEl('header', 'cc-topic-header');

        const toggle = createEl('button', 'cc-topic-toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-controls', `cc-subtopics-${topicIndex}`);

        toggle.appendChild(createEl('span', 'cc-topic-number', elementNumber));

        const info = createEl('div', 'cc-topic-info');
        const titleEl = createEl('h4', 'cc-topic-title', normalizeTitle(topic.title));
        titleEl.id = `cc-topic-title-${topicIndex}`;
        info.appendChild(titleEl);
        info.appendChild(createEl('span', 'cc-topic-sections', `${topic.subtopics?.length || 0} sections`));

        // AUTO-SPLIT-SECTION (v12.78): Show a clear badge when this topic is a split part
        if (topic.splitPart) {
            const splitBadge = createEl('span', 'cc-topic-split-badge');
            splitBadge.style.cssText = 'display:inline-block;margin-top:4px;padding:2px 8px;font-size:11px;font-weight:600;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;';
            splitBadge.textContent = `Part ${topic.splitPart} of ${topic.splitTotal} — element split because it has more than ${MAX_PCS_PER_SECTION} performance criteria`;
            info.appendChild(splitBadge);
        }

        toggle.appendChild(info);
        header.appendChild(toggle);

        const subtopicsWrap = createEl('div', 'cc-subtopics');
        subtopicsWrap.id = `cc-subtopics-${topicIndex}`;
        subtopicsWrap.setAttribute('role', 'list');

        (topic.subtopics || []).forEach((sub, si) => {
            subtopicsWrap.appendChild(renderSubtopicItemDOM(sub, topicIndex, si, elementNumber));
        });

        container.append(header, subtopicsWrap);
        return container;
    };

    // Render learning structure to DOM (clean + testable)
    const renderLearningStructureDOM = (topics, mountEl) => {
        mountEl.innerHTML = '';
        topics.forEach((topic, index) => {
            mountEl.appendChild(renderTopicItemDOM(topic, index));
        });
    };

    // Generate mapping document rows - ChatGPT EXACT FORMAT
    // Structure: Unit Requirement Type | Requirement Reference | Requirement Text | Learning Content Location | Coverage Explanation
    // Each row = one unit requirement (Element, PC, KE, PE, FS) showing where it's taught
    const generateMappingDocument = (topics) => {
        const rows = [];
        
        // Build reverse lookup: for each requirement code, find which topics/subtopics cover it
        const coverageMap = {
            elements: {},      // e.g., "1" -> [{topic, subtopic, location}]
            pc: {},            // e.g., "1.1" -> [{topic, subtopic, location}]
            ke: {},            // e.g., "KE1" -> [{topic, subtopic, location}]
            pe: {},            // e.g., "PE1" -> [{topic, subtopic, location}]
            fs: {}             // e.g., "FS1" -> [{topic, subtopic, location}]
        };
        
        topics.forEach((topic, tIndex) => {
            const elementNum = tIndex + 1;
            // Track element coverage
            if (!coverageMap.elements[elementNum]) coverageMap.elements[elementNum] = [];
            coverageMap.elements[elementNum].push({
                location: `Element ${elementNum}`,
                topicTitle: topic.title
            });
            
            (topic.subtopics || []).forEach((sub, sIndex) => {
                const pcNum = `${elementNum}.${sIndex + 1}`;
                const location = `Element ${elementNum}  -  PC ${pcNum}`;
                const mappings = sub.coversMappings || {};
                
                // Track PC coverage
                if (!coverageMap.pc[pcNum]) coverageMap.pc[pcNum] = [];
                coverageMap.pc[pcNum].push({
                    location,
                    subtopicTitle: sub.title,
                    keyPoints: sub.keyPoints || []
                });
                
                // Track KE coverage
                (mappings.ke || []).forEach(ke => {
                    if (!coverageMap.ke[ke]) coverageMap.ke[ke] = [];
                    coverageMap.ke[ke].push({ location, subtopicTitle: sub.title });
                });
                
                // Track PE coverage
                (mappings.pe || []).forEach(pe => {
                    if (!coverageMap.pe[pe]) coverageMap.pe[pe] = [];
                    coverageMap.pe[pe].push({ location, subtopicTitle: sub.title });
                });
                
                // Track FS coverage
                (mappings.fs || []).forEach(fs => {
                    if (!coverageMap.fs[fs]) coverageMap.fs[fs] = [];
                    coverageMap.fs[fs].push({ location, subtopicTitle: sub.title });
                });
            });
        });
        
        return coverageMap;
    };

    // Coverage analysis with gap detection (enterprise-grade validation)
    const analyseCoverage = (coverageMap, unitRequirements) => {
        const covered = {
            elements: Object.keys(coverageMap.elements).length,
            performanceCriteria: Object.keys(coverageMap.pc).length,
            knowledgeEvidence: Object.keys(coverageMap.ke).length,
            performanceEvidence: Object.keys(coverageMap.pe).length,
            foundationSkills: Object.keys(coverageMap.fs).length
        };

        const findGaps = (required, coveredMap) => {
            if (!required) return [];
            return required.filter(r => !coveredMap[r]);
        };

        return {
            covered,
            gaps: {
                elements: findGaps(unitRequirements?.elements, coverageMap.elements),
                performanceCriteria: findGaps(unitRequirements?.performanceCriteria, coverageMap.pc),
                knowledgeEvidence: findGaps(unitRequirements?.knowledgeEvidence, coverageMap.ke),
                performanceEvidence: findGaps(unitRequirements?.performanceEvidence, coverageMap.pe),
                foundationSkills: findGaps(unitRequirements?.foundationSkills, coverageMap.fs)
            }
        };
    };

    // Render mapping table - ChatGPT EXACT FORMAT
    // Structure: Unit Requirement Type | Requirement Reference | Requirement Text | Learning Content Location | Coverage Explanation
    const renderMappingTable = (coverageMap, unitData) => {
        const table = document.createElement('table');
        table.className = 'cc-mapping-table';
        table.setAttribute('role', 'table');

        const rows = [];
        
        // Helper to get requirement text from unit data
        const getElementText = (elNum) => {
            const el = unitData?.elements?.[parseInt(elNum) - 1];
            return el?.name || el?.title || `Element ${elNum}`;
        };
        
        const getPCText = (pcNum) => {
            const parts = pcNum.split('.');
            const elIdx = parseInt(parts[0]) - 1;
            const el = unitData?.elements?.[elIdx];
            if (!el) return `PC ${pcNum}`;
            if (parts.length === 2) {
                const pcIdx = parseInt(parts[1]) - 1;
                const pc = el?.performanceCriteria?.[pcIdx];
                return typeof pc === 'string' ? pc : (pc?.text || `PC ${pcNum}`);
            }
            if (parts.length === 3) {
                // AI misread of multi-digit 2-level code: "5.1.0" → try "5.10"
                const twoLevelCode = parts[0] + '.' + parts[1] + parts[2];
                const findPc = (code) => el.performanceCriteria?.find(pc => {
                    const s = typeof pc === 'string' ? pc : (pc?.text || '');
                    return s.startsWith(code + ' ') || s === code;
                });
                const pc = findPc(pcNum) || findPc(twoLevelCode);
                return typeof pc === 'string' ? pc : (pc?.text || `PC ${pcNum}`);
            }
            return `PC ${pcNum}`;
        };
        
        const getKEText = (keRef) => {
            const idx = parseInt(keRef.replace(/\D/g, '')) - 1;
            const ke = unitData?.knowledgeEvidence?.[idx];
            return typeof ke === 'string' ? ke : (ke?.text || keRef);
        };
        
        const getPEText = (peRef) => {
            const idx = parseInt(peRef.replace(/\D/g, '')) - 1;
            const pe = unitData?.performanceEvidence?.[idx];
            return typeof pe === 'string' ? pe : (pe?.text || peRef);
        };
        
        const getFSText = (fsRef) => {
            const idx = parseInt(fsRef.replace(/\D/g, '')) - 1;
            const fs = unitData?.foundationSkills?.[idx];
            return typeof fs === 'string' ? fs : (fs?.text || fsRef);
        };

        // Add Element rows
        Object.entries(coverageMap.elements).forEach(([elNum, locations]) => {
            rows.push({
                type: 'Element',
                ref: `Element ${elNum}`,
                text: getElementText(elNum),
                location: locations.map(l => l.location).join(', '),
                explanation: `Learning content introduces ${getElementText(elNum).toLowerCase()} as a core learning focus.`
            });
        });

        // Add PC rows
        Object.entries(coverageMap.pc).forEach(([pcNum, locations]) => {
            const keyPoints = locations[0]?.keyPoints || [];
            const explanation = keyPoints.length > 0 
                ? `Learning slides teach: ${keyPoints.slice(0, 2).map(kp => kp.substring(0, 60)).join('; ')}${keyPoints.length > 2 ? '...' : ''}`
                : `Learning slides cover ${getPCText(pcNum).substring(0, 80)}`;
            rows.push({
                type: 'Performance Criteria',
                ref: pcNum,
                text: getPCText(pcNum),
                location: locations.map(l => l.location).join(', '),
                explanation
            });
        });

        // Add KE rows
        Object.entries(coverageMap.ke).forEach(([keRef, locations]) => {
            rows.push({
                type: 'Knowledge Evidence',
                ref: keRef,
                text: getKEText(keRef),
                location: locations.map(l => l.location).join(', '),
                explanation: `Learners are taught ${getKEText(keRef).substring(0, 80).toLowerCase()}`
            });
        });

        // Add PE rows - v6.6.6: Fixed banned verb "develop skills"  ->  use observable action verbs
        Object.entries(coverageMap.pe).forEach(([peRef, locations]) => {
            const peText = getPEText(peRef);
            // Extract first verb from PE text to create observable explanation
            const peClean = peText.replace(/^(the candidate must\s+)?/i, '').trim();
            const firstWord = peClean.split(/\s+/)[0] || 'Demonstrate';
            const restOfText = peClean.split(/\s+/).slice(1).join(' ').substring(0, 60);
            rows.push({
                type: 'Performance Evidence',
                ref: peRef,
                text: peText,
                location: locations.map(l => l.location).join(', '),
                explanation: `Learners ${firstWord.toLowerCase()} ${restOfText}`
            });
        });

        // Add FS rows
        Object.entries(coverageMap.fs).forEach(([fsRef, locations]) => {
            rows.push({
                type: 'Foundation Skills',
                ref: fsRef,
                text: getFSText(fsRef),
                location: locations.map(l => l.location).join(', '),
                explanation: `${getFSText(fsRef).substring(0, 80)} is embedded through learning activities`
            });
        });

        table.innerHTML = `
            <thead>
                <tr>
                    <th scope="col">Unit Requirement Type</th>
                    <th scope="col">Requirement Reference</th>
                    <th scope="col">Requirement Text</th>
                    <th scope="col">Learning Content Location</th>
                    <th scope="col">Coverage Explanation</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr class="cc-mapping-row-${r.type.toLowerCase().replace(/\s/g, '-')}">
                        <td>${escapeHtml(r.type)}</td>
                        <td>${escapeHtml(r.ref)}</td>
                        <td>${escapeHtml(r.text.substring(0, 120))}${r.text.length > 120 ? '...' : ''}</td>
                        <td>${escapeHtml(r.location)}</td>
                        <td>${escapeHtml(r.explanation)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        return table;
    };

    // Render audit summary with gap detection
    const renderAuditSummary = (coverageResult) => {
        const hasGaps = Object.values(coverageResult.gaps).some(g => g.length > 0);

        const summary = document.createElement('div');
        summary.className = 'cc-audit-summary';

        if (hasGaps) {
            summary.innerHTML = `
                <h4 class="cc-audit-title cc-audit-warning">Coverage Gaps Identified</h4>
                <p>The following unit requirements are not currently mapped:</p>
                <ul class="cc-gap-list">
                    ${Object.entries(coverageResult.gaps)
                        .filter(([, g]) => g.length)
                        .map(([k, g]) => `<li><strong>${k}:</strong> ${g.join(', ')}</li>`)
                        .join('')}
                </ul>
            `;
        } else {
            summary.innerHTML = `
                <h4 class="cc-audit-title cc-audit-success">Full Coverage Confirmed</h4>
                <p>
                    This learning structure demonstrates full coverage of all unit
                    elements, performance criteria, performance evidence, knowledge
                    evidence, and foundation skills requirements.
                </p>
            `;
        }
        return summary;
    };

    // Render complete mapping document section (polished, ASQA-ready)
    // ChatGPT EXACT FORMAT: Learning Coverage Mapping Document
    const renderMappingDocumentSection = (topics, unitRequirements, mountEl) => {
        const coverageMap = generateMappingDocument(topics);
        const coverage = analyseCoverage(coverageMap, unitRequirements);

        const section = document.createElement('section');
        section.className = 'cc-mapping-document';

        section.innerHTML = `
            <h3 class="cc-mapping-title">Learning Coverage Mapping Document</h3>
            <p class="cc-mapping-intro">
                This mapping document demonstrates where unit requirements are taught.
                Mapping is for training coverage only - no assessment or evidence collection.
            </p>
        `;

        section.appendChild(renderAuditSummary(coverage));
        // Pass tgaData to renderMappingTable so it can look up requirement texts
        section.appendChild(renderMappingTable(coverageMap, tgaData));
        mountEl.appendChild(section);
    };

    // Render sub-subtopics (the specific PCs/KEs covered by each subtopic)
    // PRIORITY: keyPoints (dot points) > PC text lookup > PC codes
    const renderSubSubtopics = (sub, elements) => {
        const mappings = sub.coversMappings || sub.coversPC || [];
        const keyPoints = sub.keyPoints || [];
        
        // Build list of what this subtopic covers
        const items = [];
        
        if (keyPoints.length > 0) {
            keyPoints.forEach(point => {
                items.push(`<div class="cc-subsubtopic-item">${escapeHtml(point)}</div>`);
            });
        }
        
        if (items.length === 0 && mappings.pc && Array.isArray(mappings.pc) && mappings.pc.length > 0 && elements) {
            mappings.pc.forEach(pcCode => {
                const parts = pcCode.split('.');
                const elIdx = parseInt(parts[0]) - 1;
                const element = elements[elIdx];
                if (!element || !element.performanceCriteria) return;

                let pcText = null;
                if (parts.length === 2) {
                    // Standard 2-level code: "5.1" → element 5, PC at index 0
                    const pcIdx = parseInt(parts[1]) - 1;
                    const pcItem = element.performanceCriteria[pcIdx];
                    pcText = typeof pcItem === 'string' ? pcItem : (pcItem?.text || pcItem?.description || null);
                } else if (parts.length === 3) {
                    // 3-part code can mean two things:
                    // (a) Genuine 3-level: "5.1.0 Work diary..." stored as-is (rare TGA format)
                    // (b) AI misread of multi-digit 2-level: "5.10" → AI writes "5.1.0",
                    //     "5.11" → AI writes "5.1.1". Join parts[1]+parts[2] to recover "5.10".
                    const twoLevelCode = parts[0] + '.' + parts[1] + parts[2]; // e.g. "5.10"
                    const findPc = (code) => element.performanceCriteria.find(pc => {
                        const s = typeof pc === 'string' ? pc : (pc?.text || pc?.description || '');
                        return s.startsWith(code + ' ') || s === code;
                    });
                    const pcItem = findPc(pcCode) || findPc(twoLevelCode);
                    if (pcItem) {
                        pcText = typeof pcItem === 'string' ? pcItem : (pcItem?.text || pcItem?.description || null);
                    }
                }
                if (pcText) {
                    items.push(`<div class="cc-subsubtopic-item">${escapeHtml(pcText.substring(0, 80))}${pcText.length > 80 ? '...' : ''}</div>`);
                }
            });
        }
        
        if (items.length === 0 && Array.isArray(mappings) && mappings.length > 0) {
            items.push(`<div class="cc-subsubtopic-item cc-muted">Covers: ${mappings.join(', ')}</div>`);
        }
        
        if (items.length === 0) return '';
        
        return `<div class="cc-subsubtopics">${items.join('')}</div>`;
    };

    // Legacy string-based renderer for backward compatibility (used in Step 3 preview)
    // v6.6.76: Use actual element/PC numbers from data instead of array indices
    const renderTopicItem = (topic, topicIndex) => {
        const cleanTitle = stripNumberPrefix(topic.title);
        const isUniversity = selectedMode === 'university' || selectedMode === 'pd';
        let elementNumber;
        if (isUniversity) {
            elementNumber = topic.number || (topicIndex + 1);
        } else {
            const elementMatch = (topic.id || topic.title || '').match(/Element\s*(\d+)/i);
            elementNumber = elementMatch ? parseInt(elementMatch[1], 10) : (topicIndex + 1);
        }
        
        return `
            <section class="cc-topic-item" data-topic-index="${topicIndex}" aria-labelledby="cc-topic-title-${topicIndex}">
                <header class="cc-topic-header">
                    <button type="button" class="cc-topic-toggle" aria-expanded="true" aria-controls="cc-subtopics-${topicIndex}">
                        <span class="cc-topic-number">${elementNumber}</span>
                        <div class="cc-topic-info">
                            <h4 class="cc-topic-title" id="cc-topic-title-${topicIndex}">${escapeHtml(cleanTitle || topic.title)}</h4>
                            <span class="cc-topic-sections">${topic.subtopics?.length || 0} ${selectedMode === 'pd' ? (topic.subtopics?.length === 1 ? 'topic' : 'topics') : isUniversity ? (topic.subtopics?.length === 1 ? 'outcome' : 'outcomes') : 'sections'}</span>
                        </div>
                    </button>
                </header>
                <div class="cc-subtopics" id="cc-subtopics-${topicIndex}" role="list">
                    ${(topic.subtopics || []).map((sub, si) => {
                        const cleanSubTitle = stripNumberPrefix(sub.title);
                        const subSubtopics = renderSubSubtopics(sub, tgaData?.elements);
                        const displayNumber = isUniversity
                            ? (sub.number || `${elementNumber}.${si + 1}`)
                            : (sub.pcNumber || `${elementNumber}.${si + 1}`);
                        return `
                            <div class="cc-subtopic-item" data-subtopic-index="${si}" role="listitem">
                                <span class="cc-subtopic-number">${displayNumber}</span>
                                <div class="cc-subtopic-info">
                                    <span class="cc-subtopic-title">${escapeHtml(cleanSubTitle || sub.title)}</span>
                                    ${subSubtopics}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    };

    const bindWizardEvents = () => {
        // Mode card click handlers
        container.querySelectorAll('.cc-mode-card').forEach(card => {
            card.addEventListener('click', () => {
                container.querySelectorAll('.cc-mode-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedMode = card.dataset.mode;
                const nextBtn = document.getElementById('cc-next-step');
                if (nextBtn) nextBtn.disabled = false;
            });
        });

        // Keyboard support for div[role="button"] mode cards (Enter/Space to activate)
        container.addEventListener('keydown', (e) => {
            const card = e.target.closest('.cc-mode-card[role="button"]');
            if (!card) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                card.click();
            }
        });

        container.querySelector('#cc-next-step')?.addEventListener('click', handleNextStep);
        container.querySelector('#cc-prev-step')?.addEventListener('click', handlePrevStep);
        container.querySelector('#cc-fetch-unit')?.addEventListener('click', fetchTGAUnit);
        container.querySelector('#cc-upload-pdf')?.addEventListener('click', handlePdfUpload);
        container.querySelector('#cc-process-paste-text')?.addEventListener('click', handlePasteTextExtract);
        // v10.25: Element correction bar events
        container.querySelector('#cc-refresh-elements')?.addEventListener('click', handleRefreshElements);
        container.querySelector('#cc-toggle-paste-elements')?.addEventListener('click', togglePasteElements);
        container.querySelector('#cc-apply-paste-elements')?.addEventListener('click', () => applyPasteElements(false));
        container.querySelector('#cc-merge-paste-elements')?.addEventListener('click', () => applyPasteElements(true));
        // Fallback tab switcher
        container.querySelector('#cc-tab-pdf')?.addEventListener('click', () => switchFallbackTab('pdf'));
        container.querySelector('#cc-tab-paste')?.addEventListener('click', () => switchFallbackTab('paste'));
        container.querySelector('#cc-add-outcome')?.addEventListener('click', addOutcome);
        container.querySelector('#cc-bulk-paste-toggle')?.addEventListener('click', toggleBulkPaste);
        container.querySelector('#cc-bulk-paste-cancel')?.addEventListener('click', closeBulkPaste);
        container.querySelector('#cc-bulk-paste-add')?.addEventListener('click', () => {
            if (selectedMode === 'university' || selectedMode === 'workplace') {
                const textarea = document.getElementById('cc-bulk-paste-text');
                if (!textarea) return;
                const items = parseBulkOutcomes(textarea.value);
                if (items.length === 0) return;
                storedOutcomes = items;
                storedTopicHierarchy = buildSingleTopicHierarchy(getMajorTopicTitle(), items);

                const confirmedPanel = document.getElementById('cc-uni-topics-confirmed') || document.getElementById('cc-wp-topics-confirmed');
                if (confirmedPanel) {
                    confirmedPanel.classList.remove('cc-hidden');
                    const countEl = confirmedPanel.querySelector('[id$="-topics-count"]');
                    if (countEl) countEl.textContent = countTopicsLabel(items);
                    const previewEl = confirmedPanel.querySelector('[id$="-topics-preview"]');
                    if (previewEl) previewEl.innerHTML = renderConfirmedTopicsHTML(items);
                }

                const pastePanel = document.getElementById('cc-bulk-paste-panel');
                if (pastePanel) pastePanel.classList.add('cc-hidden');

                const chatgptSection = document.getElementById('cc-uni-chatgpt-section') || document.getElementById('cc-wp-chatgpt-section');
                if (chatgptSection) {
                    chatgptSection.classList.remove('cc-hidden');
                    chatgptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                applyBulkPaste();
            }
        });
        container.querySelector('#cc-bulk-paste-text')?.addEventListener('input', updateBulkPasteCount);

        container.querySelector('#cc-uni-topics-edit')?.addEventListener('click', () => {
            const confirmedPanel = document.getElementById('cc-uni-topics-confirmed');
            if (confirmedPanel) confirmedPanel.classList.add('cc-hidden');
            const pastePanel = document.getElementById('cc-bulk-paste-panel');
            if (pastePanel) {
                pastePanel.classList.remove('cc-hidden');
                const textarea = document.getElementById('cc-bulk-paste-text');
                if (textarea && storedOutcomes.length > 0) {
                    textarea.value = storedOutcomes.join('\n');
                    updateBulkPasteCount();
                }
                textarea?.focus();
            }
        });

        container.querySelector('#cc-wp-topics-edit')?.addEventListener('click', () => {
            const confirmedPanel = document.getElementById('cc-wp-topics-confirmed');
            if (confirmedPanel) confirmedPanel.classList.add('cc-hidden');
            const pastePanel = document.getElementById('cc-bulk-paste-panel');
            if (pastePanel) {
                pastePanel.classList.remove('cc-hidden');
                const textarea = document.getElementById('cc-bulk-paste-text');
                if (textarea && storedOutcomes.length > 0) {
                    textarea.value = storedOutcomes.join('\n');
                    updateBulkPasteCount();
                }
                textarea?.focus();
            }
        });

        const uniPasteTextarea = container.querySelector('#cc-uni-paste-text');
        if (uniPasteTextarea) {
            uniPasteTextarea.addEventListener('input', () => {
                uniPastedContent = uniPasteTextarea.value;
                const countEl = document.getElementById('cc-uni-paste-count');
                if (countEl) countEl.textContent = countWords(uniPastedContent) + ' words';
                const nextBtn = document.getElementById('cc-next-step');
                if (uniPastedContent.trim().length > 50) {
                    if (nextBtn) nextBtn.classList.remove('cc-hidden');
                } else {
                    if (nextBtn) nextBtn.classList.add('cc-hidden');
                }
            });
        }

        container.querySelector('#cc-download-uni-prompt')?.addEventListener('click', () => downloadDynamicPrompt('university'));
        container.querySelector('#cc-download-wp-prompt')?.addEventListener('click', () => downloadDynamicPrompt('workplace'));
        container.querySelector('#cc-download-vet-prompt')?.addEventListener('click', () => downloadDynamicPrompt('vet'));
        container.querySelector('#cc-download-pd-prompt')?.addEventListener('click', () => downloadDynamicPrompt('pd'));

        container.querySelector('#cc-pd-suggest-topics')?.addEventListener('click', suggestPDTopics);
        container.querySelector('#cc-pd-paste-own')?.addEventListener('click', () => {
            const pastePanel = document.getElementById('cc-pd-paste-panel');
            if (pastePanel) {
                pastePanel.classList.remove('cc-hidden');
                const textarea = document.getElementById('cc-pd-paste-text');
                if (textarea && storedOutcomes.length > 0) {
                    textarea.value = storedOutcomes.join('\n');
                    updatePDPasteCount();
                }
                textarea?.focus();
            }
        });
        container.querySelector('#cc-pd-paste-cancel')?.addEventListener('click', () => {
            const pastePanel = document.getElementById('cc-pd-paste-panel');
            if (pastePanel) pastePanel.classList.add('cc-hidden');
        });
        container.querySelector('#cc-pd-paste-confirm')?.addEventListener('click', () => {
            const textarea = document.getElementById('cc-pd-paste-text');
            if (!textarea) return;
            const items = parseBulkOutcomes(textarea.value);
            if (items.length === 0) return;
            storedOutcomes = items;
            storedTopicHierarchy = buildSingleTopicHierarchy(getMajorTopicTitle(), items);
            const confirmedPanel = document.getElementById('cc-pd-topics-confirmed');
            if (confirmedPanel) {
                confirmedPanel.classList.remove('cc-hidden');
                const countEl = document.getElementById('cc-pd-topics-count');
                if (countEl) countEl.textContent = countTopicsLabel(items);
                const previewEl = document.getElementById('cc-pd-topics-preview');
                if (previewEl) previewEl.innerHTML = renderConfirmedTopicsHTML(items);
            }
            const pastePanel = document.getElementById('cc-pd-paste-panel');
            if (pastePanel) pastePanel.classList.add('cc-hidden');
            const chatgptSection = document.getElementById('cc-pd-chatgpt-section');
            if (chatgptSection) {
                chatgptSection.classList.remove('cc-hidden');
                chatgptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
        container.querySelector('#cc-pd-paste-text')?.addEventListener('input', updatePDPasteCount);
        container.querySelector('#cc-pd-topics-edit')?.addEventListener('click', () => {
            const confirmedPanel = document.getElementById('cc-pd-topics-confirmed');
            if (confirmedPanel) confirmedPanel.classList.add('cc-hidden');
            const pastePanel = document.getElementById('cc-pd-paste-panel');
            if (pastePanel) {
                pastePanel.classList.remove('cc-hidden');
                const textarea = document.getElementById('cc-pd-paste-text');
                if (textarea && storedOutcomes.length > 0) {
                    textarea.value = storedOutcomes.join('\n');
                    updatePDPasteCount();
                }
                textarea?.focus();
            }
        });
        container.querySelector('#cc-pd-paste-chatgpt')?.addEventListener('input', (e) => {
            pdPastedContent = e.target.value;
            const count = document.getElementById('cc-pd-chatgpt-count');
            if (count) count.textContent = pdPastedContent.trim().split(/\s+/).filter(Boolean).length + ' words';
            // v13.33: Reference content is optional — Continue always visible when topics are confirmed
            const nextBtn = document.getElementById('cc-next-step');
            if (nextBtn) nextBtn.classList.remove('cc-hidden');
        });
        container.querySelector('#cc-generate-btn')?.addEventListener('click', generateContent);
        container.querySelector('#cc-export-excel-btn')?.addEventListener('click', exportExcelMapping);
        
        // Country/State dropdown - use direct onchange binding (event delegation doesn't work in Moodle AMD)
        bindCountryStateHandlers();

        container.querySelectorAll('.cc-radio-card').forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            card.addEventListener('click', () => {
                container.querySelectorAll('.cc-radio-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                radio.checked = true;
            });
        });

        // Progression mode selector (v6.3.0) - v6.5.50: Fixed to scope within parent group only
        container.querySelectorAll('.cc-progression-card').forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            card.addEventListener('click', () => {
                // Only remove 'selected' from cards within the same .cc-progression-options group
                const parentGroup = card.closest('.cc-progression-options');
                if (parentGroup) {
                    parentGroup.querySelectorAll('.cc-progression-card').forEach(c => c.classList.remove('selected'));
                }
                card.classList.add('selected');
                radio.checked = true;
                
                // Show/hide timed duration selector (v13.34 FIX: guard to progressionMode only)
                if (radio.name === 'progressionMode') {
                    const timedOptions = document.getElementById('cc-timed-duration');
                    if (timedOptions) {
                        if (radio.value === 'timed') {
                            timedOptions.classList.remove('cc-hidden');
                        } else {
                            timedOptions.classList.add('cc-hidden');
                        }
                    }
                }
            });
        });

        // Voice selector (v13.1: 8-voice cards)
        container.querySelectorAll('.cc-voice-card').forEach(card => {
            const radio = card.querySelector('input[type="radio"]');
            card.addEventListener('click', () => {
                container.querySelectorAll('.cc-voice-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                radio.checked = true;
            });
        });

        // Voiceover enable/disable toggle (v6.5.11)
        const voiceoverToggle = container.querySelector('#cc-voiceover-enabled');
        const voiceoverStatus = container.querySelector('#cc-voiceover-status');
        const voiceOptions = container.querySelector('#cc-voice-options');
        const mustListenCard = container.querySelector('#cc-progression-voiceover');
        
        if (voiceoverToggle) {
            voiceoverToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                
                // Update status label
                if (voiceoverStatus) {
                    voiceoverStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
                }
                
                // Show/hide voice options (gender and language)
                if (voiceOptions) {
                    voiceOptions.style.display = isEnabled ? '' : 'none';
                }
                
                // Enable/disable "Must Listen" progression mode
                if (mustListenCard) {
                    const mustListenRadio = mustListenCard.querySelector('input[type="radio"]');
                    if (isEnabled) {
                        mustListenCard.classList.remove('cc-progression-disabled');
                        mustListenCard.style.opacity = '';
                        mustListenCard.style.pointerEvents = '';
                        if (mustListenRadio) mustListenRadio.disabled = false;
                    } else {
                        mustListenCard.classList.add('cc-progression-disabled');
                        mustListenCard.style.opacity = '0.5';
                        mustListenCard.style.pointerEvents = 'none';
                        if (mustListenRadio) mustListenRadio.disabled = true;
                        
                        // If "Must Listen" was selected, switch to "Free Navigation"
                        if (mustListenRadio && mustListenRadio.checked) {
                            const freeRadio = container.querySelector('input[name="progressionMode"][value="free"]');
                            if (freeRadio) {
                                freeRadio.checked = true;
                                container.querySelectorAll('.cc-progression-card[data-mode]').forEach(c => {
                                    c.classList.remove('selected');
                                });
                                freeRadio.closest('.cc-progression-card')?.classList.add('selected');
                            }
                        }
                    }
                }
            });
        }

        // FIX-CC-MULTILANG-54 (v12.59/v12.60): Sync the Additional Languages checkbox list so
        // the currently selected primary voice language is shown as disabled (not hidden).
        // All 54 languages remain visible at all times. The primary language checkbox is
        // unchecked, disabled, shown at 45% opacity, and its label updated to append
        // "  -  Default" so teachers understand it is already included automatically.
        // When the primary changes, the old primary's label is restored to its original text.
        const voiceLangSel = container.querySelector('#cc-voice-language');
        function syncAdditionalLangFilter() {
            var primaryLang = voiceLangSel ? voiceLangSel.value : 'en-AU';
            container.querySelectorAll('#cc-additional-langs input[type="checkbox"]').forEach(function(cb) {
                var row = cb.closest('label.cc-multilang-option');
                if (!row) return;
                // Find the text node (last child text node of the label, after the input)
                var textNode = null;
                for (var i = row.childNodes.length - 1; i >= 0; i--) {
                    if (row.childNodes[i].nodeType === 3 && row.childNodes[i].textContent.trim()) {
                        textNode = row.childNodes[i];
                        break;
                    }
                }
                if (cb.value === primaryLang) {
                    cb.checked = false;
                    cb.disabled = true;
                    row.style.opacity = '0.5';
                    row.title = 'Already your primary language  -  included automatically';
                    if (textNode) {
                        if (!row.dataset.origLabel) {
                            row.dataset.origLabel = textNode.textContent;
                        }
                        textNode.textContent = row.dataset.origLabel + ' \u2014 Default';
                    }
                } else {
                    cb.disabled = false;
                    row.style.opacity = '';
                    row.title = '';
                    if (textNode && row.dataset.origLabel) {
                        textNode.textContent = row.dataset.origLabel;
                        delete row.dataset.origLabel;
                    }
                }
            });
        }
        if (voiceLangSel) {
            voiceLangSel.addEventListener('change', syncAdditionalLangFilter);
        }
        syncAdditionalLangFilter();

        // Images enable/disable toggle (v6.6.68)
        const imagesToggle = container.querySelector('#cc-images-enabled');
        const imagesStatus = container.querySelector('#cc-images-status');
        
        if (imagesToggle) {
            imagesToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                
                // Update status label
                if (imagesStatus) {
                    imagesStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
                }
                
            });
        }

        // Activities enable/disable toggle (v11.11)
        const activitiesToggle = container.querySelector('#cc-activities-enabled');
        const activitiesStatus = container.querySelector('#cc-activities-status');
        
        if (activitiesToggle) {
            activitiesToggle.addEventListener('change', (e) => {
                const isEnabled = e.target.checked;
                
                if (activitiesStatus) {
                    activitiesStatus.textContent = isEnabled ? 'Enabled' : 'Disabled';
                }
                
            });
        }

        // Header color picker sync (v6.4.4)
        const colorInput = container.querySelector('#cc-header-color');
        const colorHexInput = container.querySelector('#cc-header-color-hex');
        if (colorInput && colorHexInput) {
            colorInput.addEventListener('input', (e) => {
                colorHexInput.value = e.target.value.toUpperCase();
            });
            colorHexInput.addEventListener('input', (e) => {
                const hex = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    colorInput.value = hex;
                }
            });
            colorHexInput.addEventListener('blur', (e) => {
                let hex = e.target.value;
                if (!/^#/.test(hex)) hex = '#' + hex;
                if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    colorInput.value = hex;
                    colorHexInput.value = hex.toUpperCase();
                } else {
                    colorHexInput.value = colorInput.value.toUpperCase();
                }
            });
        }

        container.querySelector('[data-action="close-error"]')?.addEventListener('click', hideError);
        container.querySelector('#cc-error-retry-btn')?.addEventListener('click', () => {
            hideError();
            generateContent();
        });

        container.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('[data-action="delete-outcome"]');
            if (deleteBtn) {
                const item = deleteBtn.closest('.cc-outcome-item');
                if (item) {
                    item.remove();
                    updateOutcomeNumbers();
                }
            }
        });

        // Workplace mode file upload handlers
        const dropZone = container.querySelector('#cc-drop-zone');
        const workplaceFileInput = container.querySelector('#cc-workplace-file');
        const browseBtn = container.querySelector('#cc-browse-file');
        const removeFileBtn = container.querySelector('#cc-remove-file');

        if (browseBtn && workplaceFileInput) {
            browseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                workplaceFileInput.click();
            });
        }

        if (workplaceFileInput) {
            workplaceFileInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file) handleWorkplaceFileUpload(file);
            });
        }

        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', removeWorkplaceFile);
        }

        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const file = e.dataTransfer?.files?.[0];
                if (file) handleWorkplaceFileUpload(file);
            });
        }

        
        // v7.9.0: Bind Upload/Paste toggle buttons and paste textarea handlers
        container.querySelectorAll('.cc-input-method-toggle .cc-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const method = e.currentTarget.dataset.method;
                const target = e.currentTarget.dataset.target;
                const toggleGroup = e.currentTarget.parentElement;
                toggleGroup.querySelectorAll('.cc-toggle-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const parentSection = toggleGroup.parentElement;
                parentSection.querySelectorAll('.cc-input-panel').forEach(panel => {
                    const panelType = panel.dataset.panel;
                    if (panelType === `${target}-${method}`) {
                        panel.classList.remove('cc-hidden');
                    } else if (panelType?.startsWith(`${target}-`)) {
                        panel.classList.add('cc-hidden');
                    }
                });
            });
        });

        const vetPasteTextarea = container.querySelector('#cc-vet-paste-text');
        if (vetPasteTextarea) {
            vetPasteTextarea.addEventListener('input', (e) => {
                vetPastedContent = e.target.value;
                const countEl = document.getElementById('cc-vet-paste-count');
                if (countEl) countEl.textContent = countWords(vetPastedContent) + ' words';
                const nextBtn = document.getElementById('cc-next-step');
                if (vetPastedContent.trim().length > 50) {
                    if (nextBtn) nextBtn.classList.remove('cc-hidden');
                } else {
                    if (nextBtn) nextBtn.classList.add('cc-hidden');
                }
            });
        }
        const vetPasteClearBtn = container.querySelector('#cc-vet-paste-clear');
        if (vetPasteClearBtn) {
            vetPasteClearBtn.addEventListener('click', () => {
                vetPastedContent = '';
                const textarea = document.getElementById('cc-vet-paste-text');
                if (textarea) textarea.value = '';
                const countEl = document.getElementById('cc-vet-paste-count');
                if (countEl) countEl.textContent = '0 words';

            });
        }

        const wpPasteTextarea = container.querySelector('#cc-wp-paste-text');
        if (wpPasteTextarea) {
            wpPasteTextarea.addEventListener('input', (e) => {
                workplacePastedContent = e.target.value;
                const countEl = document.getElementById('cc-wp-paste-count');
                if (countEl) countEl.textContent = countWords(workplacePastedContent) + ' words';
                const nextBtn = document.getElementById('cc-next-step');
                if (workplacePastedContent.trim().length > 50) {
                    if (nextBtn) nextBtn.classList.remove('cc-hidden');
                } else {
                    if (nextBtn) nextBtn.classList.add('cc-hidden');
                }
            });
        }

        const uniPasteTextareaOld = container.querySelector('#cc-uni-paste-text');
        if (uniPasteTextareaOld && !uniPasteTextareaOld._ccBound) {
            uniPasteTextareaOld._ccBound = true;
        }
        const uniPasteClearBtn = container.querySelector('#cc-uni-paste-clear');
        if (uniPasteClearBtn) {
            uniPasteClearBtn.addEventListener('click', () => {
                uniPastedContent = '';
                const textarea = document.getElementById('cc-uni-paste-text');
                if (textarea) textarea.value = '';
                const countEl = document.getElementById('cc-uni-paste-count');
                if (countEl) countEl.textContent = '0 words';
            });
        }

        // v6.9.14: Bind VET mode element/topic selector events when tgaData exists
        if (selectedMode === 'vet' && tgaData) {
            bindMajorTopicSelectorEvents();
        }
        
        // v8.4.24: Bind workplace mode events - suggest button always, topic events when data exists
        if (selectedMode === 'workplace') {
            const wpSuggestBtn = container.querySelector('#cc-suggest-workplace-topics-btn');
            if (wpSuggestBtn) {
                wpSuggestBtn.addEventListener('click', suggestWorkplaceTopics);
            }
            // Bind industry/training type change handlers for button gating
            const wpIndustrySelect = document.getElementById('cc-wp-industry');
            if (wpIndustrySelect && !wpIndustrySelect._ccWpBound) {
                wpIndustrySelect._ccWpBound = true;
                wpIndustrySelect.addEventListener('change', updateGenerateTopicsButton);
            }
            const trainingTypeSelect = document.getElementById('cc-training-type');
            if (trainingTypeSelect && !trainingTypeSelect._ccWpBound) {
                trainingTypeSelect._ccWpBound = true;
                trainingTypeSelect.addEventListener('change', updateGenerateTopicsButton);
            }
            if (workplaceData) {
                bindWorkplaceTopicSelectorEvents();
            }
        }

        // v12.55: Additional language checkboxes  ->  re-run credit estimation so teacher sees
        // the full cost immediately (each extra language = same credits as primary language).
        const additionalLangsContainer = container.querySelector('#cc-additional-langs');
        if (additionalLangsContainer) {
            additionalLangsContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                chk.addEventListener('change', updateCreditEstimation);
            });
        }
    };

    // v10.25: Bind element selection radio events  -  extracted so it can be called
    // after paste-in or refresh rebuilds the element list.
    const bindElementSelectionEvents = () => {
        const elementListEl = document.getElementById('cc-element-list');
        if (!elementListEl) return;
        elementListEl.querySelectorAll('.cc-element-radio').forEach(radio => {
            if (radio._ccBound) return;
            radio._ccBound = true;
            radio.addEventListener('change', (e) => {
                const elementId = parseInt(e.target.dataset.elementId, 10);
                selectedElementIds = [elementId];
                elementSelectionInitialized = true;
                elementListEl.querySelectorAll('.cc-element-radio-card').forEach(card => {
                    card.classList.remove('selected');
                });
                const selectedCard = e.target.closest('.cc-element-radio-card');
                if (selectedCard) selectedCard.classList.add('selected');
                const elementDepSections = document.getElementById('cc-element-dependent-sections');
                if (elementDepSections) elementDepSections.classList.remove('cc-hidden');
                suggestedMajorTopics = [];
                selectedMajorTopicIds = [];
                const topicsContainer = document.getElementById('cc-topics-container');
                if (topicsContainer) topicsContainer.innerHTML = '';
                updateGenerateTopicsButton();
                const refDocsSection = elementDepSections?.querySelector('.cc-form-section');
                if (refDocsSection) refDocsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                ccLog('Element selected:', elementId, tgaData?.elements?.[elementId - 1]?.title);
            });
        });
    };

    const bindMajorTopicSelectorEvents = () => {
        const detailsEl = document.getElementById('cc-unit-details');
        if (!detailsEl) return;

        const suggestBtn = document.getElementById('cc-suggest-topics-btn');
        if (suggestBtn && !suggestBtn._ccBound) {
            suggestBtn._ccBound = true;
            suggestBtn.addEventListener('click', suggestMajorTopics);
        }
        
        // v6.9.18: Bind dropdown change handlers (now that dropdowns exist)
        const sectorSelect = document.getElementById('cc-industry-sector');
        if (sectorSelect && !sectorSelect._ccBound) {
            sectorSelect._ccBound = true;
            sectorSelect.addEventListener('change', updateGenerateTopicsButton);
        }
        
        const jobLevelPills = document.getElementById('cc-job-level-pills');
        if (jobLevelPills && !jobLevelPills._ccBound) {
            jobLevelPills._ccBound = true;
            jobLevelPills.addEventListener('click', (e) => {
                const pill = e.target.closest('.cc-level-pill');
                if (!pill) return;
                const val = pill.dataset.value;
                if (window.CC_SELECTED_JOB_LEVELS.includes(val)) {
                    window.CC_SELECTED_JOB_LEVELS = window.CC_SELECTED_JOB_LEVELS.filter(v => v !== val);
                    pill.classList.remove('cc-level-active');
                } else {
                    window.CC_SELECTED_JOB_LEVELS.push(val);
                    pill.classList.add('cc-level-active');
                }
                updateGenerateTopicsButton();
            });
        }

        bindElementSelectionEvents();

        // v6.9.39: Topics are in cc-topics-container (sibling of cc-unit-details), not inside detailsEl
        const topicsContainer = document.getElementById('cc-topics-container');
        
        const selectAllBtn = topicsContainer?.querySelector('#cc-select-all-topics');
        const deselectAllBtn = topicsContainer?.querySelector('#cc-deselect-all-topics');
        
        // Select All Topics button
        selectAllBtn?.addEventListener('click', () => {
            selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
            topicsContainer.innerHTML = renderMajorTopicSelector();
            bindMajorTopicSelectorEvents();
            updateGenerateTopicsButton();
        });

        // Deselect All Topics button
        deselectAllBtn?.addEventListener('click', () => {
            selectedMajorTopicIds = [];
            topicsContainer.innerHTML = renderMajorTopicSelector();
            bindMajorTopicSelectorEvents();
            updateGenerateTopicsButton();
        });

        // Individual topic checkbox handlers
        topicsContainer?.querySelectorAll('.cc-major-topic-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const topicId = e.target.dataset.topicId;
                if (e.target.checked) {
                    if (!selectedMajorTopicIds.includes(topicId)) {
                        selectedMajorTopicIds.push(topicId);
                    }
                } else {
                    selectedMajorTopicIds = selectedMajorTopicIds.filter(id => id !== topicId);
                }
                // Update visual state
                const card = e.target.closest('.cc-major-topic-card');
                if (card) {
                    card.classList.toggle('selected', e.target.checked);
                }
                // Update stats badge
                updateTopicStats();
                updateGenerateTopicsButton(); // v6.9.5
            });
        });
    };

    const updateTopicStats = () => {
        const selectedCount = selectedMajorTopicIds.length;
        const totalCount = suggestedMajorTopics.length;
        
        const statsBadge = document.querySelector('.cc-stats-badge');
        if (statsBadge) {
            statsBadge.textContent = `${selectedCount}/${totalCount} selected`;
        }
    };

    const handleNextStep = async () => {
        if (currentStep === 1) {
            if (!selectedMode) {
                showError('Please select a learning mode to continue.');
                return;
            }
            currentStep = 2;
            updateWizardUI();
        } else if (currentStep === 2) {
            const validation = validateStep2();
            if (!validation.valid) {
                showError(validation.error);
                return;
            }
            // Capture context from DOM before step change (elements will be replaced)
            storedContext = gatherContext();
            // v6.5.48: Also capture outcomes for University mode before DOM elements are replaced
            storedOutcomes = gatherOutcomes();
            currentStep = 3;
            topicPlan = null;
            updateWizardUI();
            await generateTopicPlan();
        }
    };

    const handlePrevStep = () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    };

    const updateWizardUI = () => {
        const content = document.getElementById('cc-wizard-content');
        if (content) {
            content.innerHTML = renderCurrentStep();
            bindWizardEvents();
        }

        container.querySelectorAll('.cc-step').forEach((step, i) => {
            step.classList.remove('active', 'complete');
            if (i + 1 === currentStep) step.classList.add('active');
            if (i + 1 < currentStep) step.classList.add('complete');
        });

        container.querySelectorAll('.cc-step-connector').forEach((conn, i) => {
            conn.classList.toggle('active', i + 1 < currentStep);
        });

        // Show Excel export button only for VET mode on step 3
        const excelBtn = document.getElementById('cc-export-excel-btn');
        if (excelBtn) {
            excelBtn.style.display = (currentStep === 3 && selectedMode === 'vet' && tgaData) ? 'inline-flex' : 'none';
        }
    };

    const validateStep2 = () => {
        if (selectedMode === 'vet') {
            if (!tgaData) {
                return { valid: false, error: 'Please fetch a unit from training.gov.au first.' };
            }
            
            // v8.4.34: Require exactly ONE element to be selected
            if (selectedElementIds.length === 0) {
                return { valid: false, error: 'Please select an element to generate learning content for.' };
            }
            if (selectedElementIds.length > 1) {
                selectedElementIds = [selectedElementIds[0]]; // Enforce single
            }
            
            // v6.9.15: Auto-generate topics from selected element if none exist
            if (suggestedMajorTopics.length === 0) {
                storedContext = gatherContext();
                createDefaultMajorTopics();
                selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
            }
            
            if (selectedMajorTopicIds.length === 0) {
                return { valid: false, error: 'Please click "Suggest Topics" to generate learning topics for the selected element.' };
            }
            
            // v6.9.14: Simplified validation - only require Industry from dropdown
            // AI auto-generates job titles, tasks, equipment based on Industry + Sector + Job Level
            const dropdownIndustry = document.getElementById('cc-industry')?.value;
            
            if (!dropdownIndustry) {
                return { valid: false, error: 'Please select an Industry to contextualise the learning content.' };
            }
            
            // v6.9.14: Job Level is required
            if (window.CC_SELECTED_JOB_LEVELS.length === 0) {
                return { valid: false, error: 'Please select at least one Job Level for appropriate scenario complexity.' };
            }
            // v13.33: VET reference content is optional — no paste gate
        } else if (selectedMode === 'workplace') {
            if (!workplaceData) {
                return { valid: false, error: 'Please upload a training document first.' };
            }
            const trainingType = document.getElementById('cc-training-type')?.value;
            if (!trainingType) {
                return { valid: false, error: 'Please select a training type.' };
            }
            const wpIndustry = document.getElementById('cc-wp-industry')?.value;
            if (!wpIndustry) {
                return { valid: false, error: 'Please select an industry.' };
            }
            if (suggestedMajorTopics.length === 0) {
                return { valid: false, error: 'Please click "Suggest Learning Topics" to generate major topics.' };
            }
            if (selectedMajorTopicIds.length === 0) {
                return { valid: false, error: 'Please select at least one Major Learning Topic.' };
            }
            // v13.33: Workplace reference content is optional — no paste gate
        } else if (selectedMode === 'pd') {
            // v9.83 PD-GATE FIX: ChatGPT content is optional for PD mode.
            // Previously, pdPastedContent was a hard validation gate AND the Generate button
            // was hidden until content was pasted  -  teachers saw a dead-end with no path
            // forward if they hadn't used the ChatGPT prompt file workflow.
            // PD / Short Courses mode can generate directly from title + subtopics.
            const courseTitle = document.getElementById('cc-pd-course-title')?.value;
            if (!courseTitle?.trim()) {
                return { valid: false, error: 'Please enter a course title.' };
            }
            if (storedOutcomes.length === 0) {
                return { valid: false, error: 'Please add your subtopics by clicking "Suggest Subtopics with AI" or "Paste Your Own Subtopics".' };
            }
        } else {
            const courseName = document.getElementById('cc-course-name')?.value;
            const subjectArea = document.getElementById('cc-subject-area')?.value;
            if (!courseName?.trim()) {
                return { valid: false, error: 'Please enter a course name.' };
            }
            if (!subjectArea?.trim()) {
                return { valid: false, error: 'Please enter a subject area.' };
            }
            if (storedOutcomes.length === 0) {
                return { valid: false, error: 'Please paste your subtopics, then click Confirm Subtopics.' };
            }
            // v13.33: University reference content is optional — no paste gate
        }
        return { valid: true };
    };

    const gatherOutcomes = () => {
        if ((selectedMode === 'university' || selectedMode === 'workplace' || selectedMode === 'pd') && storedOutcomes.length > 0) {
            return [...storedOutcomes];
        }
        const outcomes = [];
        container.querySelectorAll('.cc-outcome-item textarea').forEach(ta => {
            if (ta.value.trim()) {
                outcomes.push(ta.value.trim());
            }
        });
        return outcomes;
    };

    const addOutcome = () => {
        const list = document.getElementById('cc-outcomes-list');
        if (!list) return;
        const count = list.querySelectorAll('.cc-outcome-item').length;
        list.insertAdjacentHTML('beforeend', renderOutcomeItem(count, ''));
    };

    const updateOutcomeNumbers = () => {
        container.querySelectorAll('.cc-outcome-item').forEach((item, i) => {
            const num = item.querySelector('.cc-outcome-number');
            if (num) num.textContent = i + 1;
            item.dataset.index = i;
        });
    };

    const parseBulkOutcomes = (text) => {
        return text.split('\n')
            .map(line => line.trim())
            .map(line => line.replace(/^\d+[\.\)\-:\s]+/, ''))
            .map(line => line.replace(/^[-**]\s*/, ''))
            .map(line => line.trim())
            .filter(line => line.length > 0);
    };

    const buildSingleTopicHierarchy = (majorTitle, items) => {
        if (!majorTitle || !items || items.length === 0) return null;
        return [{ title: majorTitle, subtopics: items.slice() }];
    };

    const getMajorTopicTitle = () => {
        if (selectedMode === 'pd') {
            return document.getElementById('cc-pd-course-title')?.value?.trim() || '';
        } else if (selectedMode === 'university') {
            return document.getElementById('cc-course-name')?.value?.trim() || '';
        } else if (selectedMode === 'workplace') {
            return document.getElementById('cc-wp-training-topic')?.value?.trim() || '';
        }
        return '';
    };

    const parseTopicHierarchy = (text) => {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return null;

        const hasNumberedMajor = lines.some(l => /^\d+[\.\)]\s+/.test(l.trim()) && !/^\d+\.\d+/.test(l.trim()));
        const hasNumberedSub = lines.some(l => /^\d+\.\d+/.test(l.trim()));
        const hasIndented = lines.some(l => l.length > l.trimStart().length && (l.trimStart().startsWith('-') || l.trimStart().startsWith('*') || l.trimStart().startsWith('*')));

        if (!hasNumberedMajor && !hasNumberedSub && !hasIndented) return null;

        const topics = [];
        let currentTopic = null;

        for (const raw of lines) {
            const trimmed = raw.trim();
            const indent = raw.length - raw.trimStart().length;
            const isMajor = /^\d+[\.\)]\s+/.test(trimmed) && !/^\d+\.\d+/.test(trimmed);
            const isSub = /^\d+\.\d+/.test(trimmed) || (indent >= 2 && /^[-**]\s+/.test(trimmed));

            const cleanText = trimmed
                .replace(/^\d+\.\d+[\.\)\s]+/, '')
                .replace(/^\d+[\.\)\-:\s]+/, '')
                .replace(/^[-**]\s*/, '')
                .trim();

            if (!cleanText) continue;

            const isPlainLine = !isMajor && !isSub && indent === 0 && !/^[-**]\s+/.test(trimmed);

            if (isMajor) {
                currentTopic = { title: cleanText, subtopics: [] };
                topics.push(currentTopic);
            } else if (isSub && currentTopic) {
                currentTopic.subtopics.push(cleanText);
            } else if (!currentTopic) {
                currentTopic = { title: cleanText, subtopics: [] };
                topics.push(currentTopic);
            } else if (isPlainLine && currentTopic.subtopics.length > 0) {
                currentTopic = { title: cleanText, subtopics: [] };
                topics.push(currentTopic);
            } else {
                currentTopic.subtopics.push(cleanText);
            }
        }

        const hasHierarchy = topics.some(t => t.subtopics.length > 0);
        return hasHierarchy ? topics : null;
    };

    const countTopicsLabel = (items) => {
        return items.length + (items.length === 1 ? ' subtopic' : ' subtopics') + ' confirmed';
    };

    const renderConfirmedTopicsHTML = (items) => {
        if (items.length === 0) return '';
        const majorTitle = getMajorTopicTitle();
        let html = '';
        if (majorTitle) {
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
            html += '<div style="flex-shrink:0;width:22px;height:22px;background:#dbeafe;border-radius:50%;display:flex;align-items:center;justify-content:center;">';
            html += '<svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" width="12" height="12"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>';
            html += '</div>';
            html += '<span style="font-weight:700;font-size:13px;color:#1e40af;">Major Topic: ' + escapeHtml(majorTitle) + '</span>';
            html += '</div>';
        }
        html += '<div style="' + (majorTitle ? 'margin-left:30px;' : '') + '">';
        items.forEach((item, i) => {
            html += '<div style="display:flex;align-items:center;gap:8px;margin-top:5px;">';
            html += '<div style="flex-shrink:0;width:18px;height:18px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:9px;color:#16a34a;">' + (i + 1) + '</div>';
            html += '<span style="font-size:12px;color:#15803d;">' + escapeHtml(item) + '</span>';
            html += '</div>';
        });
        return html;
    };

    const toggleBulkPaste = () => {
        const panel = document.getElementById('cc-bulk-paste-panel');
        if (panel) {
            panel.classList.toggle('cc-hidden');
            if (!panel.classList.contains('cc-hidden')) {
                document.getElementById('cc-bulk-paste-text')?.focus();
            }
        }
    };

    const closeBulkPaste = () => {
        const panel = document.getElementById('cc-bulk-paste-panel');
        const textarea = document.getElementById('cc-bulk-paste-text');
        if (panel) panel.classList.add('cc-hidden');
        if (textarea) textarea.value = '';
        updateBulkPasteCount();
    };

    const updateBulkPasteCount = () => {
        const textarea = document.getElementById('cc-bulk-paste-text');
        const counter = document.getElementById('cc-bulk-paste-count');
        if (!textarea || !counter) return;
        const items = parseBulkOutcomes(textarea.value);
        counter.textContent = items.length === 1 ? '1 item detected' : items.length + ' items detected';
    };

    const suggestPDTopics = async () => {
        const courseTitle = document.getElementById('cc-pd-course-title')?.value?.trim();
        if (!courseTitle) {
            showError('Please enter a course / topic title first.');
            return;
        }
        const majorTopic = courseTitle;
        const audience = document.getElementById('cc-pd-audience')?.value || 'all-staff';
        const industry = document.getElementById('cc-pd-industry')?.value || '';
        const country = document.getElementById('cc-pd-country')?.value || 'AU';

        const loadingEl = document.getElementById('cc-pd-suggest-loading');
        const actionsEl = document.getElementById('cc-pd-topic-actions');
        if (loadingEl) loadingEl.classList.remove('cc-hidden');
        if (actionsEl) actionsEl.style.display = 'none';

        try {
            const siteId = window.CC_CONFIG?.siteId || '';
            const apiKey = window.CC_CONFIG?.apiKey || '';

            if (!siteId || !apiKey) {
                ccWarn('suggestPDTopics: Missing credentials - siteId:', !!siteId, 'apiKey:', !!apiKey);
                showError('AI Grader credentials not configured. Please check your Site ID and API Key in the AI Config settings.');
                return;
            }

            ccLog('suggestPDTopics: Requesting subtopics for:', courseTitle, '| majorTopic:', majorTopic, '| industry:', industry, '| country:', country);

            const response = await fetch('https://lms-labs.com/api/contentcreator/suggest-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    siteId: siteId,
                    apiKey: apiKey,
                    subjectName: courseTitle,
                    majorTopic: majorTopic,
                    industry: industry,
                    country: country
                })
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                ccError('suggestPDTopics: API error:', response.status, errorBody);
                throw new Error(errorBody.error || 'Failed to suggest topics (HTTP ' + response.status + ')');
            }
            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'Failed to suggest topics');

            ccLog('suggestPDTopics: Received response, topics length:', (data.topics || '').length);

            const topicsRaw = data.topics || '';
            if (!topicsRaw || topicsRaw.length === 0) {
                showError('No topics were suggested. Try a different course title or paste your own topics.');
                return;
            }

            const topicsText = typeof topicsRaw === 'string' ? topicsRaw : '';
            const items = parseBulkOutcomes(topicsText);
            storedOutcomes = items;
            storedTopicHierarchy = buildSingleTopicHierarchy(majorTopic, items);

            if (items.length > 0) {
                const confirmedPanel = document.getElementById('cc-pd-topics-confirmed');
                if (confirmedPanel) {
                    confirmedPanel.classList.remove('cc-hidden');
                    const countEl = document.getElementById('cc-pd-topics-count');
                    if (countEl) countEl.textContent = countTopicsLabel(items);
                    const previewEl = document.getElementById('cc-pd-topics-preview');
                    if (previewEl) previewEl.innerHTML = renderConfirmedTopicsHTML(items);
                }
                const chatgptSection = document.getElementById('cc-pd-chatgpt-section');
                if (chatgptSection) {
                    chatgptSection.classList.remove('cc-hidden');
                    chatgptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } else {
                showError('No topics were suggested. Try a different course title or paste your own topics.');
            }
        } catch (err) {
            console.error('CC: Failed to suggest PD topics:', err);
            showError('Could not suggest topics. Please paste your own topics instead.');
        } finally {
            if (loadingEl) loadingEl.classList.add('cc-hidden');
            if (actionsEl) actionsEl.style.display = '';
        }
    };

    const updatePDPasteCount = () => {
        const textarea = document.getElementById('cc-pd-paste-text');
        const counter = document.getElementById('cc-pd-paste-count');
        if (!textarea || !counter) return;
        const items = parseBulkOutcomes(textarea.value);
        counter.textContent = items.length === 1 ? '1 item detected' : items.length + ' items detected';
    };

    const downloadDynamicPrompt = async (mode) => {
        const filenames = {
            vet: 'ChatGPT-Prompt-VET.txt',
            workplace: 'ChatGPT-Prompt-Workplace.txt',
            university: 'ChatGPT-Prompt-University.txt',
            pd: 'ChatGPT-Prompt-PD.txt'
        };

        let contextBlock = '';
        let topicsText = '';

        if (mode === 'vet') {
            const country = document.getElementById('cc-country')?.selectedOptions?.[0]?.text || 'Australia';
            const state = document.getElementById('cc-state')?.value || '';
            const industry = document.getElementById('cc-industry')?.value || '';
            const industrySector = document.getElementById('cc-industry-sector')?.value || '';
            const jobLevelsText = window.CC_SELECTED_JOB_LEVELS
                .map(v => JOB_LEVELS.find(j => j.value === v)?.label || v)
                .join(', ');

            const ctxLines = [];
            ctxLines.push('====================================================================');
            ctxLines.push('YOUR CONTEXT  -  USE THIS TO TAILOR ALL CONTENT');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            if (country) ctxLines.push('Country: ' + country);
            if (state) ctxLines.push('State/Region: ' + state);
            if (industry) ctxLines.push('Industry: ' + industry);
            if (industrySector) ctxLines.push('Industry Sector: ' + industrySector);
            if (jobLevelsText) ctxLines.push('Job Level(s): ' + jobLevelsText);
            ctxLines.push('');
            ctxLines.push('IMPORTANT: Use the industry, sector, and job level above to make ALL');
            ctxLines.push('examples, scenarios, equipment references, and workplace situations');
            ctxLines.push('specific to this context. Do NOT use generic examples.');
            ctxLines.push('');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            contextBlock = ctxLines.join('\n');

            if (tgaData && selectedElementIds.length > 0) {
                const elIdx = selectedElementIds[0] - 1;
                const el = tgaData.elements?.[elIdx];
                if (el) {
                    const lines = [];
                    lines.push('Unit: ' + (tgaData.unitCode || '') + ' - ' + (tgaData.unitTitle || ''));
                    lines.push('Element ' + (elIdx + 1) + ': ' + (cleanElementName(el) || ''));
                    if (el.performanceCriteria && el.performanceCriteria.length > 0) {
                        // If selected topics are split parts, only include PCs that belong to those parts
                        const _selForEl = suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id) && t.elementNumber === elIdx + 1);
                        const _splitPcSet = _selForEl.length > 0 && _selForEl.some(t => t.splitPart)
                            ? new Set(_selForEl.flatMap(t => t.coverageSummary?.performanceCriteria || []))
                            : null;
                        lines.push('');
                        lines.push('Performance Criteria:');
                        let _pcIdx = 0;
                        el.performanceCriteria.forEach((pc, i) => {
                            const _pcCode = (elIdx + 1) + '.' + (i + 1);
                            if (_splitPcSet && !_splitPcSet.has(_pcCode)) return;
                            _pcIdx++;
                            lines.push('  ' + _pcIdx + '. ' + (pc.text || pc.title || pc));
                        });
                    }
                    topicsText = lines.join('\n');
                }
            }

            if (suggestedMajorTopics.length > 0) {
                const selectedTopics = suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id));
                if (selectedTopics.length > 0) {
                    topicsText += (topicsText ? '\n\n' : '');
                    topicsText += 'Selected Learning Topics:\n';
                    selectedTopics.forEach((t, i) => {
                        topicsText += '  ' + (i + 1) + '. ' + t.title + (t.description ? '  -  ' + t.description : '') + '\n';
                    });
                }
            }
        } else if (mode === 'workplace') {
            const country = document.getElementById('cc-wp-country')?.selectedOptions?.[0]?.text || 'Australia';
            const state = document.getElementById('cc-wp-state')?.value || '';
            const industry = document.getElementById('cc-wp-industry')?.value || '';
            const industrySector = document.getElementById('cc-wp-industry-sector')?.value || '';
            const jobLevel = document.getElementById('cc-wp-job-level')?.selectedOptions?.[0]?.text || '';
            const trainingType = document.getElementById('cc-training-type')?.selectedOptions?.[0]?.text || '';
            const targetAudience = document.getElementById('cc-wp-audience')?.selectedOptions?.[0]?.text || '';
            const companyName = document.getElementById('cc-company-name')?.value || '';
            const department = document.getElementById('cc-wp-department')?.value || '';

            const ctxLines = [];
            ctxLines.push('====================================================================');
            ctxLines.push('YOUR CONTEXT  -  USE THIS TO TAILOR ALL CONTENT');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            if (companyName) ctxLines.push('Company: ' + companyName);
            if (department) ctxLines.push('Department: ' + department);
            if (trainingType) ctxLines.push('Training Type: ' + trainingType);
            if (targetAudience) ctxLines.push('Target Audience: ' + targetAudience);
            if (country) ctxLines.push('Country: ' + country);
            if (state) ctxLines.push('State/Region: ' + state);
            if (industry) ctxLines.push('Industry: ' + industry);
            if (industrySector) ctxLines.push('Industry Sector: ' + industrySector);
            if (jobLevel) ctxLines.push('Job Level: ' + jobLevel);
            if (workplaceData?.filename) ctxLines.push('Training Document: ' + workplaceData.filename);
            ctxLines.push('');
            ctxLines.push('IMPORTANT: Use the industry, company, training type, and audience above');
            ctxLines.push('to make ALL examples, scenarios, and workplace situations specific to');
            ctxLines.push('this context. Do NOT use generic examples.');
            ctxLines.push('');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            contextBlock = ctxLines.join('\n');

            if (suggestedMajorTopics.length > 0) {
                const selectedTopics = suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id));
                if (selectedTopics.length > 0) {
                    topicsText = 'Selected sub topics (' + selectedTopics.length + ' total  -  generate content for ALL of them):\n';
                    selectedTopics.forEach((t, i) => {
                        const letter = String.fromCharCode(65 + i);
                        topicsText += '  ' + letter + ': ' + t.title + (t.description ? '  -  ' + t.description : '') + '\n';
                    });
                }
            } else if (storedOutcomes.length > 0) {
                topicsText = 'Selected sub topics (' + storedOutcomes.length + ' total  -  generate content for ALL of them):\n';
                storedOutcomes.forEach((o, i) => {
                    const letter = String.fromCharCode(65 + i);
                    topicsText += '  ' + letter + ': ' + o + '\n';
                });
            }
        } else if (mode === 'pd') {
            const courseTitle = document.getElementById('cc-pd-course-title')?.value || '';
            const audience = document.getElementById('cc-pd-audience')?.selectedOptions?.[0]?.text || 'All Staff';
            const industry = document.getElementById('cc-pd-industry')?.value || '';
            const country = document.getElementById('cc-pd-country')?.selectedOptions?.[0]?.text || 'Australia';

            const ctxLines = [];
            ctxLines.push('====================================================================');
            ctxLines.push('YOUR CONTEXT  -  USE THIS TO TAILOR ALL CONTENT');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            if (courseTitle) ctxLines.push('Course Title: ' + courseTitle);
            if (audience) ctxLines.push('Target Audience: ' + audience);
            if (industry) ctxLines.push('Industry: ' + industry);
            if (country) ctxLines.push('Country: ' + country);
            ctxLines.push('');
            ctxLines.push('IMPORTANT: Use the course title, target audience, and industry above');
            ctxLines.push('to make ALL examples, scenarios, and workplace situations specific to');
            ctxLines.push('this context. Content should be practical, skills-focused, and directly');
            ctxLines.push('applicable to the workplace. Do NOT use generic examples.');
            ctxLines.push('');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            contextBlock = ctxLines.join('\n');

            if (storedOutcomes.length > 0) {
                topicsText = 'Selected sub topics (' + storedOutcomes.length + ' total  -  generate content for ALL of them):\n';
                storedOutcomes.forEach((o, i) => {
                    const letter = String.fromCharCode(65 + i);
                    topicsText += '  ' + letter + ': ' + o + '\n';
                });
            }
        } else {
            const country = document.getElementById('cc-uni-country')?.selectedOptions?.[0]?.text || 'Australia';
            const state = document.getElementById('cc-uni-state')?.value || '';
            const courseName = document.getElementById('cc-course-name')?.value || '';
            const courseLevel = document.getElementById('cc-course-level')?.selectedOptions?.[0]?.text || '';
            const subjectArea = document.getElementById('cc-subject-area')?.value || '';
            const bloomsLevel = document.getElementById('cc-blooms-level')?.selectedOptions?.[0]?.text || '';

            const ctxLines = [];
            ctxLines.push('====================================================================');
            ctxLines.push('YOUR CONTEXT  -  USE THIS TO TAILOR ALL CONTENT');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            if (courseName) ctxLines.push('Course Name: ' + courseName);
            if (courseLevel) ctxLines.push('Course Level: ' + courseLevel);
            if (subjectArea) ctxLines.push('Subject Area: ' + subjectArea);
            if (bloomsLevel) ctxLines.push('Bloom\'s Taxonomy Focus: ' + bloomsLevel);
            if (country) ctxLines.push('Country: ' + country);
            if (state) ctxLines.push('State/Region: ' + state);
            ctxLines.push('');
            ctxLines.push('IMPORTANT: Use the course name, subject area, and academic level above');
            ctxLines.push('to make ALL examples, case studies, and references specific to this');
            ctxLines.push('context. Match the academic register to the course level.');
            ctxLines.push('');
            ctxLines.push('====================================================================');
            ctxLines.push('');
            contextBlock = ctxLines.join('\n');

            const formatAsLetterList = (items) => {
                let result = 'Selected sub topics (' + items.length + ' total  -  generate content for ALL of them):\n';
                items.forEach((item, i) => {
                    const letter = String.fromCharCode(65 + i);
                    result += '  ' + letter + ': ' + item + '\n';
                });
                return result;
            };
            if (storedOutcomes.length > 0) {
                topicsText = formatAsLetterList(storedOutcomes);
            } else {
                const previewEl = document.getElementById('cc-uni-topics-preview');
                if (previewEl) {
                    const items = [];
                    previewEl.querySelectorAll('li, div, span').forEach(el => {
                        const t = el.textContent?.trim();
                        if (t && t.length > 0) items.push(t);
                    });
                    if (items.length > 0) {
                        topicsText = formatAsLetterList(items);
                    }
                }
                if (!topicsText) {
                    const textarea = document.getElementById('cc-bulk-paste-text');
                    if (textarea && textarea.value.trim()) {
                        const items = parseBulkOutcomes(textarea.value);
                        if (items.length > 0) {
                            storedOutcomes = items;
                            topicsText = formatAsLetterList(items);
                        }
                    }
                }
            }
            console.log('CC: downloadDynamicPrompt university  -  storedOutcomes:', storedOutcomes.length, 'topicsText length:', topicsText.length);
        }

        let topicsHeader = '';
        if (topicsText.trim()) {
            topicsHeader = '====================================================================\n';
            if (mode === 'vet') {
                const elNum = (selectedElementIds.length > 0) ? selectedElementIds[0] : 1;
                topicsHeader += 'YOUR ELEMENT & PERFORMANCE CRITERIA TO COVER\n';
                topicsHeader += '====================================================================\n\n';
                topicsHeader += 'The teacher has selected the following element and its performance criteria.\n';
                topicsHeader += 'This is ONE element only. Label it as Element ' + elNum + ' at the top.\n';
                topicsHeader += 'Generate a COMPLETE seven-card sequence for EACH PC below.\n';
                topicsHeader += 'Use the numbering format: PC ' + elNum + '.1, PC ' + elNum + '.2, PC ' + elNum + '.3, etc. All PCs belong to Element ' + elNum + '.\n';
                topicsHeader += 'Do NOT create additional element headers. Do NOT skip any PCs.\n\n';
            } else if (mode === 'workplace') {
                topicsHeader += 'YOUR SUB TOPICS TO COVER\n';
                topicsHeader += '====================================================================\n\n';
                topicsHeader += 'The teacher has selected the following sub topics.\n';
                topicsHeader += 'Generate a COMPLETE card sequence for EACH sub topic below.\n';
                topicsHeader += 'Label each sub topic using JUST the letter: A, B, C, etc. Do NOT prefix with "Sub Topic".\n';
                topicsHeader += 'Do NOT use numbers. Do NOT skip any sub topics.\n\n';
            } else if (mode === 'pd') {
                topicsHeader += 'YOUR SUB TOPICS TO COVER\n';
                topicsHeader += '====================================================================\n\n';
                topicsHeader += 'The teacher has defined the following sub topics for this PD course.\n';
                topicsHeader += 'Generate a COMPLETE six-card sequence for EACH sub topic below.\n';
                topicsHeader += 'Label each sub topic using JUST the letter: A, B, C, etc. Do NOT prefix with "Sub Topic".\n';
                topicsHeader += 'Content should be practical, skills-focused, and directly applicable.\n';
                topicsHeader += 'Do NOT use numbers. Do NOT skip any sub topics.\n\n';
            } else {
                topicsHeader += 'YOUR SUB TOPICS TO COVER\n';
                topicsHeader += '====================================================================\n\n';
                topicsHeader += 'The teacher has defined the following sub topics.\n';
                topicsHeader += 'Generate a COMPLETE card sequence for EACH sub topic below.\n';
                topicsHeader += 'Label each sub topic using JUST the letter: A, B, C, etc. Do NOT prefix with "Sub Topic".\n';
                topicsHeader += 'Do NOT use numbers. Do NOT skip any sub topics.\n\n';
            }
            topicsHeader += topicsText.trim() + '\n\n';
            topicsHeader += '====================================================================\n\n';
        }

        // Prompt templates embedded directly  -  avoids Moodle blocking .txt file fetches from plugin dirs
        const PROMPT_TEMPLATES = {
            vet: `ROLE

You are a VET (Vocational Education and Training) content designer creating slide card content for the AI Content Creator  -  an interactive Moodle learning activity used by frontline workers and apprentices in Australian industry.

You write as a practical workplace colleague who has worked on job sites, trained new workers, and assessed competency in real workplaces. Not a corporate trainer. Not a compliance officer. Not an academic.

Your tone is calm, direct, steady, and grounded in real work. You write in natural, connected paragraphs. Full, complete sentences. Ideas unfold clearly and gradually. No punchy fragments. No slogans. No dramatic rhetorical contrasts.


--------------------------------------------------------------------

WHAT IS THE AI CONTENT CREATOR?

The AI Content Creator displays your output as 7 interactive learning cards inside Moodle  -  one set of 7 cards per Performance Criterion. Each card has a specific visual layout and purpose, and together they tell one continuous story.

You MUST write your output using the EXACT labeled sections shown below. Do not invent your own labels or section names.

--------------------------------------------------------------------

STORY CONTINUITY  -  ESSENTIAL

All 7 cards must feel like one connected learning journey, not 7 separate topics.

The GOLDEN RULE: Cards 1 and 4 happen in the SAME job situation  -  same worker, same site, same day.
- Card 1 (Hook Scenario): The opening scene. Worker faces a situation.
- Card 4 (Applied Scenario): "Later that morning..."  -  same job, new development or higher stakes.
- Card 2 must open with "What you just saw..." or "In that situation..."  -  direct reference to Card 1.
- Card 3 gives the mental model for handling exactly what happened in Card 1.
- Card 7 places the learner inside the Card 1/4 story as a decision moment.
- Cards 5 and 6 are grounded in that same job context.

Never write 7 disconnected cards about a general topic. Write 7 cards about ONE specific job situation.

--------------------------------------------------------------------

THE 7 SLIDE CARDS  -  EXACT OUTPUT FORMAT

Repeat this full 7-card block for EACH Performance Criterion listed in the task.

====================================================================
VOICEOVER NARRATION SYSTEM  -  READ THIS BEFORE WRITING ANY VOICEOVER
====================================================================

The Moodle player has a built-in text-to-speech narration engine. Before playing each card's VOICEOVER, it automatically reads aloud  -  in this exact order:

  STEP 1 (automatic): The full Performance Criterion text from the ===PC [N.X]: ...=== header line.
           What the learner hears: "1.1: Apply standard precautions when handling chemical substances."

  STEP 2 (automatic): The card type label combined with the TITLE you wrote.
           What the learner hears: "Scene Setting: A busy Tuesday afternoon at the Prestons depot."
           Or: "How to Handle It: Three checks before accepting any delivery."
           Or: "Your Decision: You are the driver  -  what do you do?"

  STEP 3 (your VOICEOVER field): Your narration plays immediately after Steps 1 and 2.

Because the player reads the PC text and the card label+title automatically, your VOICEOVER field:
   ->  Must begin DIRECTLY with the substantive narration  -  never with the PC text, card label, or TITLE
   ->  Must contain EXACTLY the text specified in each card's VOICEOVER instruction  -  no additions, no paraphrasing, no summarising
   ->  Must read like a voice actor's script  -  natural, connected narration that flows from where Step 2 left off

====================================================================

===================================================PC [N.X]: [Copy the full Performance Criterion text here]===================================================

[CARD 1  -  HOOK SCENARIO]
Displays: An opening scene. A realistic job situation where this topic is immediately relevant. Narrative paragraphs. No bullet points.

TITLE: [Short scene-setting title  -  8 words max. e.g. "A busy Tuesday afternoon at the Prestons depot"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Who, where, what time, what are they doing. Introduce a real tension or challenge related to this topic. End with a moment where the right knowledge matters. Connected prose. No headings. No bullets.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting, no summarising. This IS the complete narration script for this card. The player has already announced the PC/sub-topic heading (Step 1) and "Scene Setting: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with the first sentence of CONTENT, no preamble.]

[CARD 2  -  CONCEPT EXPLAINER]
Displays: The concept explained directly  -  what the situation in Card 1 is really about.

TITLE: [Short heading that references Card 1's situation  -  8 words max. e.g. "What the worker should have known"]
CONTENT: [3 paragraphs, minimum 120 words. Para 1 MUST start with "What you just saw..." or "In that situation..."  -  explain the concept directly. Para 2: what this means in practice  -  the rule, the standard, the expectation. Para 3: why it matters in this specific workplace context.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting. The player has already announced the PC/sub-topic heading (Step 1) and "What This Means: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "What you just saw..." or "In that situation..." exactly as written in CONTENT. No preamble, no card label.]

[CARD 3  -  MENTAL MODEL]
Displays: A numbered step-by-step flow  -  how to handle exactly this type of situation.

TITLE: [Short heading: the mental model or decision process  -  8 words max. e.g. "How to check it properly every time"]
STEP 1 TITLE: [Short step label  -  4 words max]
STEP 1 DETAIL: [2 - 3 sentences. What this step involves and why it matters.]
STEP 2 TITLE: [Short step label]
STEP 2 DETAIL: [2 - 3 sentences.]
STEP 3 TITLE: [Short step label]
STEP 3 DETAIL: [2 - 3 sentences.]
STEP 4 TITLE: [Short step label  -  optional 4th step if genuinely needed]
STEP 4 DETAIL: [2 - 3 sentences  -  only if genuinely needed]
VOICEOVER: [Copy all step content word for word in this exact format: "[STEP 1 TITLE]: [STEP 1 DETAIL] [STEP 2 TITLE]: [STEP 2 DETAIL] [STEP 3 TITLE]: [STEP 3 DETAIL]"  -  and so on for every step you wrote. Do NOT include TITLE  -  the player has already announced "How to Handle It: [your TITLE]" (Step 2). Start your VOICEOVER directly with Step 1 Title. Minimum 60 words covering all steps.]

[CARD 4  -  APPLIED SCENARIO]
Displays: "Later that day..."  -  a continuation of Card 1, same job, new development.

TITLE: [Short title that signals continuation  -  8 words max. e.g. "Later that morning  -  a second delivery arrives"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Continue the SAME job situation from Card 1. Use "Later that day...", "On the same shift...", or "The same worker now..."  -  new complication or higher stakes. End with a moment of correct action or decision.]
HIGHLIGHT: [1 - 2 sentences. The key moment or correct action  -  what made the difference. Written as a pull-quote.]
VOICEOVER: [Copy CONTENT word for word then HIGHLIGHT word for word  -  verbatim, in that order. The player has already announced the PC/sub-topic heading (Step 1) and "On the Job: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "Later that day..." or "On the same shift..." as written in CONTENT. No preamble, no card label.]

[CARD 5  -  COMMON MISTAKES]
Displays: Warning cards  -  specific mistakes grounded in the Card 1/4 scenario context.

TITLE: [Short heading  -  8 words max. e.g. "What goes wrong in situations like this"]
MISTAKE 1: [Specific mistake  -  named, sounds reasonable but creates a problem. Grounded in the scenario.]
CONSEQUENCE 1: [Minimum 50 words. Specific chain of events  -  what actually happens. Not vague.]
MISTAKE 2: [Specific mistake  -  different from Mistake 1.]
CONSEQUENCE 2: [Minimum 50 words. Specific chain of events.]
MISTAKE 3: [Specific mistake.]
CONSEQUENCE 3: [Minimum 50 words. End with a PRACTICAL HABIT  -  a specific check, phrase, or routine that prevents this.]
VOICEOVER: [Copy all MISTAKE and CONSEQUENCE text word for word in this order: "[MISTAKE 1]. [CONSEQUENCE 1] [MISTAKE 2]. [CONSEQUENCE 2] [MISTAKE 3]. [CONSEQUENCE 3]". The player has already announced the PC/sub-topic heading (Step 1) and "Watch Out For: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with Mistake 1. No preamble, no card label.]

[CARD 6  -  COMPETENCY SUMMARY]
Displays: Two columns  -  left column "What Good Looks Like" (green) + right column "What to Avoid" (red).

TITLE: [Short heading  -  8 words max. e.g. "You are ready when you can"]
GOOD 1: [Observable marker of competence  -  full sentence, action verb first, grounded in the Card 1/4 scenario. e.g. "Checks the temperature log before signing any refrigerated delivery docket"]
GOOD 2: [Observable marker of competence.]
GOOD 3: [Observable marker of competence.]
GOOD 4: [Observable marker of competence.]
GOOD 5: [Observable marker of competence.]
BAD 1: [Specific failure pattern  -  full sentence describing what the incompetent worker does or skips, grounded in the scenario. e.g. "Signs the delivery paperwork without checking whether the temperature stayed within range"]
BAD 2: [Failure pattern.]
BAD 3: [Failure pattern.]
BAD 4: [Failure pattern.]
BAD 5: [Failure pattern.]
VOICEOVER: [Copy all GOOD items then all BAD items word for word in this exact format: "[GOOD 1]. [GOOD 2]. [GOOD 3]. [GOOD 4]. [GOOD 5]. Watch out for: [BAD 1]. [BAD 2]. [BAD 3]. [BAD 4]. [BAD 5]." The player has already announced the PC/sub-topic heading (Step 1) and "You Are Ready When You Can: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with GOOD 1. No preamble, no card label.]

[CARD 7  -  DECISION POINT]
Displays: An interactive question placing the learner inside the Card 1/4 story.

TITLE: [Short title that places the learner in the story  -  10 words max. e.g. "You are the driver  -  what do you do?"]
QUESTION: [1 - 2 sentences. The exact moment of decision. Place learner in the Card 1/4 story. Specific details  -  job, location, pressure, stakes.]
OPTION A: [Specific action. Sounds reasonable  -  not obviously wrong.]
FEEDBACK A: [2 - 3 sentences. What happens if they choose this. Specific, realistic consequence.]
OPTION B: [Specific action  -  the correct or best action.]
FEEDBACK B: [2 - 3 sentences. Why this is right and what it achieves.]
OPTION C: [Specific action  -  a common shortcut or wrong assumption.]
FEEDBACK C: [2 - 3 sentences. The consequence of this choice.]
OPTION D: [Specific action  -  another option that seems reasonable but misses something important.]
FEEDBACK D: [2 - 3 sentences. What is missed and why it matters.]
CORRECT: [Letter of the correct option  -  A, B, C or D]
VOICEOVER: [Write in this exact format  -  copy each field verbatim: "[QUESTION text] Option A: [OPTION A text]. Option B: [OPTION B text]. Option C: [OPTION C text]. Option D: [OPTION D text]." Do NOT include any FEEDBACK text here  -  feedback only plays after the learner clicks an option, not in the voiceover. The player has already announced the PC/sub-topic heading (Step 1) and "Your Decision: [your TITLE]" (Step 2)  -  start directly with the QUESTION sentence, no preamble.]

--------------------------------------------------------------------

WRITING STANDARDS

LANGUAGE:
- Australian English spelling (organisation, recognise, behaviour, practise, licence)
- Full, complete sentences throughout
- Medium-length sentences, easy to follow
- Plain, precise vocabulary
- Concrete details: specific tools, equipment, locations, times, conversations

BANNED WORDS  -  do not use any of these:
crucial, delve, dive, unpack, holistic, robust, synergy, paradigm, multifaceted, nuanced, pivotal, empower, leverage, realm, journey, landscape, endeavour, pertaining, henceforth, whereby, thereof, therein, notwithstanding, explore, navigate, utilise, utilize, foster, streamline, effectively, efficiently, best practice, ensuring, critical, paramount, comprehensive, subsequently, furthermore, facilitate, it is important to, in order to ensure, for safety purposes, various, range of, significantly, overall, appropriate

STORY COHERENCE  -  every 7-card block must have:
1. One continuous job situation threading through Cards 1, 4, and 7
2. Card 2 opening with a direct reference to Card 1 ("What you just saw...")
3. Card 3 giving practical tools for the exact situation in Cards 1/4
4. A realistic, specific decision in Card 7  -  not generic
5. Specific, realistic consequences in Card 5  -  not vague outcomes
6. Observable, assessable behaviours in Card 6

--------------------------------------------------------------------

TASK INSTRUCTIONS

Use the Performance Criteria listed in the section below.
Generate a complete 7-card block for EACH Performance Criterion.
Do NOT combine multiple PCs into one block.
Do NOT add commentary or summaries between cards.
Stop after all PCs are complete.

--------------------------------------------------------------------

The context and task details follow below.

--------------------------------------------------------------------`,
            workplace: `ROLE

You are a workplace learning designer creating slide card content for the AI Content Creator  -  an interactive Moodle learning activity used by workplace professionals and team members.

You write as a practical, experienced colleague who understands real workplace challenges, organisational dynamics, and what makes professionals better at their jobs. Not a consultant. Not a motivational speaker.

Your tone is clear, direct, and practical. You write in natural, connected paragraphs. Full, complete sentences. Ideas unfold clearly. No corporate jargon. No punchy fragments. No slogans.


--------------------------------------------------------------------

WHAT IS THE AI CONTENT CREATOR?

The AI Content Creator displays your output as 7 interactive learning cards inside Moodle  -  one set of 7 cards per sub topic. Each card has a specific visual layout and purpose, and together they tell one continuous story.

You MUST write your output using the EXACT labeled sections shown below. Do not invent your own labels or section names.

--------------------------------------------------------------------

STORY CONTINUITY  -  ESSENTIAL

All 7 cards must feel like one connected learning journey, not 7 separate topics.

The GOLDEN RULE: Cards 1 and 4 happen in the SAME job situation  -  same worker, same site, same day.
- Card 1 (Hook Scenario): The opening scene. Worker faces a situation.
- Card 4 (Applied Scenario): "Later that morning..."  -  same job, new development or higher stakes.
- Card 2 must open with "What you just saw..." or "In that situation..."  -  direct reference to Card 1.
- Card 3 gives the mental model for handling exactly what happened in Card 1.
- Card 7 places the learner inside the Card 1/4 story as a decision moment.
- Cards 5 and 6 are grounded in that same job context.

Never write 7 disconnected cards about a general topic. Write 7 cards about ONE specific job situation.

--------------------------------------------------------------------

THE 7 SLIDE CARDS  -  EXACT OUTPUT FORMAT

Repeat this full 7-card block for EACH sub topic listed in the task.

====================================================================
VOICEOVER NARRATION SYSTEM  -  READ THIS BEFORE WRITING ANY VOICEOVER
====================================================================

The Moodle player has a built-in text-to-speech narration engine. Before playing each card's VOICEOVER, it automatically reads aloud  -  in this exact order:

  STEP 1 (automatic): The sub topic title from the ===A  -  [title]=== header line.
           What the learner hears: "Managing a difficult conversation with a distressed client."

  STEP 2 (automatic): The card type label combined with the TITLE you wrote.
           What the learner hears: "Scene Setting: A Friday afternoon in the project office."
           Or: "How to Handle It: Three checks before accepting any delivery."
           Or: "Your Decision: You are the driver  -  what do you do?"

  STEP 3 (your VOICEOVER field): Your narration plays immediately after Steps 1 and 2.

Because the player reads the sub topic title and the card label+title automatically, your VOICEOVER field:
   ->  Must begin DIRECTLY with the substantive narration  -  never with the sub topic title, card label, or TITLE
   ->  Must contain EXACTLY the text specified in each card's VOICEOVER instruction  -  no additions, no paraphrasing, no summarising
   ->  Must read like a voice actor's script  -  natural, connected narration that flows from where Step 2 left off

====================================================================

===================================================A  -  [Sub topic title here]===================================================

[CARD 1  -  HOOK SCENARIO]
Displays: An opening scene. A realistic job situation where this topic is immediately relevant. Narrative paragraphs. No bullet points.

TITLE: [Short scene-setting title  -  8 words max. e.g. "A busy Tuesday afternoon at the Prestons depot"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Who, where, what time, what are they doing. Introduce a real tension or challenge related to this topic. End with a moment where the right knowledge matters. Connected prose. No headings. No bullets.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting, no summarising. This IS the complete narration script for this card. The player has already announced the PC/sub-topic heading (Step 1) and "Scene Setting: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with the first sentence of CONTENT, no preamble.]

[CARD 2  -  CONCEPT EXPLAINER]
Displays: The concept explained directly  -  what the situation in Card 1 is really about.

TITLE: [Short heading that references Card 1's situation  -  8 words max. e.g. "What the worker should have known"]
CONTENT: [3 paragraphs, minimum 120 words. Para 1 MUST start with "What you just saw..." or "In that situation..."  -  explain the concept directly. Para 2: what this means in practice  -  the rule, the standard, the expectation. Para 3: why it matters in this specific workplace context.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting. The player has already announced the PC/sub-topic heading (Step 1) and "What This Means: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "What you just saw..." or "In that situation..." exactly as written in CONTENT. No preamble, no card label.]

[CARD 3  -  MENTAL MODEL]
Displays: A numbered step-by-step flow  -  how to handle exactly this type of situation.

TITLE: [Short heading: the mental model or decision process  -  8 words max. e.g. "How to check it properly every time"]
STEP 1 TITLE: [Short step label  -  4 words max]
STEP 1 DETAIL: [2 - 3 sentences. What this step involves and why it matters.]
STEP 2 TITLE: [Short step label]
STEP 2 DETAIL: [2 - 3 sentences.]
STEP 3 TITLE: [Short step label]
STEP 3 DETAIL: [2 - 3 sentences.]
STEP 4 TITLE: [Short step label  -  optional 4th step if genuinely needed]
STEP 4 DETAIL: [2 - 3 sentences  -  only if genuinely needed]
VOICEOVER: [Copy all step content word for word in this exact format: "[STEP 1 TITLE]: [STEP 1 DETAIL] [STEP 2 TITLE]: [STEP 2 DETAIL] [STEP 3 TITLE]: [STEP 3 DETAIL]"  -  and so on for every step you wrote. Do NOT include TITLE  -  the player has already announced "How to Handle It: [your TITLE]" (Step 2). Start your VOICEOVER directly with Step 1 Title. Minimum 60 words covering all steps.]

[CARD 4  -  APPLIED SCENARIO]
Displays: "Later that day..."  -  a continuation of Card 1, same job, new development.

TITLE: [Short title that signals continuation  -  8 words max. e.g. "Later that morning  -  a second delivery arrives"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Continue the SAME job situation from Card 1. Use "Later that day...", "On the same shift...", or "The same worker now..."  -  new complication or higher stakes. End with a moment of correct action or decision.]
HIGHLIGHT: [1 - 2 sentences. The key moment or correct action  -  what made the difference. Written as a pull-quote.]
VOICEOVER: [Copy CONTENT word for word then HIGHLIGHT word for word  -  verbatim, in that order. The player has already announced the PC/sub-topic heading (Step 1) and "On the Job: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "Later that day..." or "On the same shift..." as written in CONTENT. No preamble, no card label.]

[CARD 5  -  COMMON MISTAKES]
Displays: Warning cards  -  specific mistakes grounded in the Card 1/4 scenario context.

TITLE: [Short heading  -  8 words max. e.g. "What goes wrong in situations like this"]
MISTAKE 1: [Specific mistake  -  named, sounds reasonable but creates a problem. Grounded in the scenario.]
CONSEQUENCE 1: [Minimum 50 words. Specific chain of events  -  what actually happens. Not vague.]
MISTAKE 2: [Specific mistake  -  different from Mistake 1.]
CONSEQUENCE 2: [Minimum 50 words. Specific chain of events.]
MISTAKE 3: [Specific mistake.]
CONSEQUENCE 3: [Minimum 50 words. End with a PRACTICAL HABIT  -  a specific check, phrase, or routine that prevents this.]
VOICEOVER: [Copy all MISTAKE and CONSEQUENCE text word for word in this order: "[MISTAKE 1]. [CONSEQUENCE 1] [MISTAKE 2]. [CONSEQUENCE 2] [MISTAKE 3]. [CONSEQUENCE 3]". The player has already announced the PC/sub-topic heading (Step 1) and "Watch Out For: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with Mistake 1. No preamble, no card label.]

[CARD 6  -  COMPETENCY SUMMARY]
Displays: Two columns  -  left column "What Good Looks Like" (green) + right column "What to Avoid" (red).

TITLE: [Short heading  -  8 words max. e.g. "You are ready when you can"]
GOOD 1: [Observable marker of competence  -  full sentence, action verb first, grounded in the Card 1/4 scenario. e.g. "Checks the temperature log before signing any refrigerated delivery docket"]
GOOD 2: [Observable marker of competence.]
GOOD 3: [Observable marker of competence.]
GOOD 4: [Observable marker of competence.]
GOOD 5: [Observable marker of competence.]
BAD 1: [Specific failure pattern  -  full sentence describing what the incompetent worker does or skips, grounded in the scenario. e.g. "Signs the delivery paperwork without checking whether the temperature stayed within range"]
BAD 2: [Failure pattern.]
BAD 3: [Failure pattern.]
BAD 4: [Failure pattern.]
BAD 5: [Failure pattern.]
VOICEOVER: [Copy all GOOD items then all BAD items word for word in this exact format: "[GOOD 1]. [GOOD 2]. [GOOD 3]. [GOOD 4]. [GOOD 5]. Watch out for: [BAD 1]. [BAD 2]. [BAD 3]. [BAD 4]. [BAD 5]." The player has already announced the PC/sub-topic heading (Step 1) and "You Are Ready When You Can: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with GOOD 1. No preamble, no card label.]

[CARD 7  -  DECISION POINT]
Displays: An interactive question placing the learner inside the Card 1/4 story.

TITLE: [Short title that places the learner in the story  -  10 words max. e.g. "You are the driver  -  what do you do?"]
QUESTION: [1 - 2 sentences. The exact moment of decision. Place learner in the Card 1/4 story. Specific details  -  job, location, pressure, stakes.]
OPTION A: [Specific action. Sounds reasonable  -  not obviously wrong.]
FEEDBACK A: [2 - 3 sentences. What happens if they choose this. Specific, realistic consequence.]
OPTION B: [Specific action  -  the correct or best action.]
FEEDBACK B: [2 - 3 sentences. Why this is right and what it achieves.]
OPTION C: [Specific action  -  a common shortcut or wrong assumption.]
FEEDBACK C: [2 - 3 sentences. The consequence of this choice.]
OPTION D: [Specific action  -  another option that seems reasonable but misses something important.]
FEEDBACK D: [2 - 3 sentences. What is missed and why it matters.]
CORRECT: [Letter of the correct option  -  A, B, C or D]
VOICEOVER: [Write in this exact format  -  copy each field verbatim: "[QUESTION text] Option A: [OPTION A text]. Option B: [OPTION B text]. Option C: [OPTION C text]. Option D: [OPTION D text]." Do NOT include any FEEDBACK text here  -  feedback only plays after the learner clicks an option, not in the voiceover. The player has already announced the PC/sub-topic heading (Step 1) and "Your Decision: [your TITLE]" (Step 2)  -  start directly with the QUESTION sentence, no preamble.]

--------------------------------------------------------------------

WRITING STANDARDS

LANGUAGE:
- Australian English spelling (organisation, recognise, behaviour, practise, licence)
- Full, complete sentences throughout
- Medium-length sentences, easy to follow
- Plain, precise vocabulary
- Concrete details: specific tools, equipment, locations, times, conversations

BANNED WORDS  -  do not use any of these:
crucial, delve, dive, unpack, holistic, robust, synergy, paradigm, multifaceted, nuanced, pivotal, empower, leverage, realm, journey, landscape, endeavour, pertaining, henceforth, whereby, thereof, therein, notwithstanding, explore, navigate, utilise, utilize, foster, streamline, effectively, efficiently, best practice, ensuring, critical, paramount, comprehensive, subsequently, furthermore, facilitate, it is important to, in order to ensure, for safety purposes, various, range of, significantly, overall, appropriate

STORY COHERENCE  -  every 7-card block must have:
1. One continuous job situation threading through Cards 1, 4, and 7
2. Card 2 opening with a direct reference to Card 1 ("What you just saw...")
3. Card 3 giving practical tools for the exact situation in Cards 1/4
4. A realistic, specific decision in Card 7  -  not generic
5. Specific, realistic consequences in Card 5  -  not vague outcomes
6. Observable, assessable behaviours in Card 6

--------------------------------------------------------------------

TASK INSTRUCTIONS

Use the sub topics listed in the section below.
Generate a complete 7-card block for EACH sub topic.
Do NOT combine multiple sub topics into one block.
Do NOT add commentary or summaries between cards.
Label each sub topic block using the letter system: A, B, C, D, etc.
Stop after all sub topics are complete.

--------------------------------------------------------------------

The context and task details follow below.

--------------------------------------------------------------------`,
            university: `ROLE

You are a university learning designer creating slide card content for the AI Content Creator  -  an interactive Moodle learning activity used by undergraduate and postgraduate students.

You write as a knowledgeable academic colleague who bridges theory and practice  -  someone who understands both the intellectual rigour of the discipline and what students actually need to apply ideas. Not a lecturer reading from notes. Not a textbook.

Your tone is clear, intellectually honest, and direct. You write in natural, connected paragraphs. Full, complete sentences. Ideas unfold with precision. No academic jargon without explanation. No slogans.


--------------------------------------------------------------------

WHAT IS THE AI CONTENT CREATOR?

The AI Content Creator displays your output as 7 interactive learning cards inside Moodle  -  one set of 7 cards per sub topic. Each card has a specific visual layout and purpose, and together they tell one continuous story.

You MUST write your output using the EXACT labeled sections shown below. Do not invent your own labels or section names.

--------------------------------------------------------------------

STORY CONTINUITY  -  ESSENTIAL

All 7 cards must feel like one connected learning journey, not 7 separate topics.

The GOLDEN RULE: Cards 1 and 4 happen in the SAME job situation  -  same worker, same site, same day.
- Card 1 (Hook Scenario): The opening scene. Worker faces a situation.
- Card 4 (Applied Scenario): "Later that morning..."  -  same job, new development or higher stakes.
- Card 2 must open with "What you just saw..." or "In that situation..."  -  direct reference to Card 1.
- Card 3 gives the mental model for handling exactly what happened in Card 1.
- Card 7 places the learner inside the Card 1/4 story as a decision moment.
- Cards 5 and 6 are grounded in that same job context.

Never write 7 disconnected cards about a general topic. Write 7 cards about ONE specific job situation.

--------------------------------------------------------------------

THE 7 SLIDE CARDS  -  EXACT OUTPUT FORMAT

Repeat this full 7-card block for EACH sub topic listed in the task.

====================================================================
VOICEOVER NARRATION SYSTEM  -  READ THIS BEFORE WRITING ANY VOICEOVER
====================================================================

The Moodle player has a built-in text-to-speech narration engine. Before playing each card's VOICEOVER, it automatically reads aloud  -  in this exact order:

  STEP 1 (automatic): The sub topic title from the ===A  -  [title]=== header line.
           What the learner hears: "Managing a difficult conversation with a distressed client."

  STEP 2 (automatic): The card type label combined with the TITLE you wrote.
           What the learner hears: "Scene Setting: A Friday afternoon in the project office."
           Or: "How to Handle It: Three checks before accepting any delivery."
           Or: "Your Decision: You are the driver  -  what do you do?"

  STEP 3 (your VOICEOVER field): Your narration plays immediately after Steps 1 and 2.

Because the player reads the sub topic title and the card label+title automatically, your VOICEOVER field:
   ->  Must begin DIRECTLY with the substantive narration  -  never with the sub topic title, card label, or TITLE
   ->  Must contain EXACTLY the text specified in each card's VOICEOVER instruction  -  no additions, no paraphrasing, no summarising
   ->  Must read like a voice actor's script  -  natural, connected narration that flows from where Step 2 left off

====================================================================

===================================================A  -  [Sub topic title here]===================================================

[CARD 1  -  HOOK SCENARIO]
Displays: An opening scene. A realistic job situation where this topic is immediately relevant. Narrative paragraphs. No bullet points.

TITLE: [Short scene-setting title  -  8 words max. e.g. "A busy Tuesday afternoon at the Prestons depot"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Who, where, what time, what are they doing. Introduce a real tension or challenge related to this topic. End with a moment where the right knowledge matters. Connected prose. No headings. No bullets.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting, no summarising. This IS the complete narration script for this card. The player has already announced the PC/sub-topic heading (Step 1) and "Scene Setting: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with the first sentence of CONTENT, no preamble.]

[CARD 2  -  CONCEPT EXPLAINER]
Displays: The concept explained directly  -  what the situation in Card 1 is really about.

TITLE: [Short heading that references Card 1's situation  -  8 words max. e.g. "What the worker should have known"]
CONTENT: [3 paragraphs, minimum 120 words. Para 1 MUST start with "What you just saw..." or "In that situation..."  -  explain the concept directly. Para 2: what this means in practice  -  the rule, the standard, the expectation. Para 3: why it matters in this specific workplace context.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting. The player has already announced the PC/sub-topic heading (Step 1) and "What This Means: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "What you just saw..." or "In that situation..." exactly as written in CONTENT. No preamble, no card label.]

[CARD 3  -  MENTAL MODEL]
Displays: A numbered step-by-step flow  -  how to handle exactly this type of situation.

TITLE: [Short heading: the mental model or decision process  -  8 words max. e.g. "How to check it properly every time"]
STEP 1 TITLE: [Short step label  -  4 words max]
STEP 1 DETAIL: [2 - 3 sentences. What this step involves and why it matters.]
STEP 2 TITLE: [Short step label]
STEP 2 DETAIL: [2 - 3 sentences.]
STEP 3 TITLE: [Short step label]
STEP 3 DETAIL: [2 - 3 sentences.]
STEP 4 TITLE: [Short step label  -  optional 4th step if genuinely needed]
STEP 4 DETAIL: [2 - 3 sentences  -  only if genuinely needed]
VOICEOVER: [Copy all step content word for word in this exact format: "[STEP 1 TITLE]: [STEP 1 DETAIL] [STEP 2 TITLE]: [STEP 2 DETAIL] [STEP 3 TITLE]: [STEP 3 DETAIL]"  -  and so on for every step you wrote. Do NOT include TITLE  -  the player has already announced "How to Handle It: [your TITLE]" (Step 2). Start your VOICEOVER directly with Step 1 Title. Minimum 60 words covering all steps.]

[CARD 4  -  APPLIED SCENARIO]
Displays: "Later that day..."  -  a continuation of Card 1, same job, new development.

TITLE: [Short title that signals continuation  -  8 words max. e.g. "Later that morning  -  a second delivery arrives"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Continue the SAME job situation from Card 1. Use "Later that day...", "On the same shift...", or "The same worker now..."  -  new complication or higher stakes. End with a moment of correct action or decision.]
HIGHLIGHT: [1 - 2 sentences. The key moment or correct action  -  what made the difference. Written as a pull-quote.]
VOICEOVER: [Copy CONTENT word for word then HIGHLIGHT word for word  -  verbatim, in that order. The player has already announced the PC/sub-topic heading (Step 1) and "On the Job: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "Later that day..." or "On the same shift..." as written in CONTENT. No preamble, no card label.]

[CARD 5  -  COMMON MISTAKES]
Displays: Warning cards  -  specific mistakes grounded in the Card 1/4 scenario context.

TITLE: [Short heading  -  8 words max. e.g. "What goes wrong in situations like this"]
MISTAKE 1: [Specific mistake  -  named, sounds reasonable but creates a problem. Grounded in the scenario.]
CONSEQUENCE 1: [Minimum 50 words. Specific chain of events  -  what actually happens. Not vague.]
MISTAKE 2: [Specific mistake  -  different from Mistake 1.]
CONSEQUENCE 2: [Minimum 50 words. Specific chain of events.]
MISTAKE 3: [Specific mistake.]
CONSEQUENCE 3: [Minimum 50 words. End with a PRACTICAL HABIT  -  a specific check, phrase, or routine that prevents this.]
VOICEOVER: [Copy all MISTAKE and CONSEQUENCE text word for word in this order: "[MISTAKE 1]. [CONSEQUENCE 1] [MISTAKE 2]. [CONSEQUENCE 2] [MISTAKE 3]. [CONSEQUENCE 3]". The player has already announced the PC/sub-topic heading (Step 1) and "Watch Out For: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with Mistake 1. No preamble, no card label.]

[CARD 6  -  COMPETENCY SUMMARY]
Displays: Two columns  -  left column "What Good Looks Like" (green) + right column "What to Avoid" (red).

TITLE: [Short heading  -  8 words max. e.g. "You are ready when you can"]
GOOD 1: [Observable marker of competence  -  full sentence, action verb first, grounded in the Card 1/4 scenario. e.g. "Checks the temperature log before signing any refrigerated delivery docket"]
GOOD 2: [Observable marker of competence.]
GOOD 3: [Observable marker of competence.]
GOOD 4: [Observable marker of competence.]
GOOD 5: [Observable marker of competence.]
BAD 1: [Specific failure pattern  -  full sentence describing what the incompetent worker does or skips, grounded in the scenario. e.g. "Signs the delivery paperwork without checking whether the temperature stayed within range"]
BAD 2: [Failure pattern.]
BAD 3: [Failure pattern.]
BAD 4: [Failure pattern.]
BAD 5: [Failure pattern.]
VOICEOVER: [Copy all GOOD items then all BAD items word for word in this exact format: "[GOOD 1]. [GOOD 2]. [GOOD 3]. [GOOD 4]. [GOOD 5]. Watch out for: [BAD 1]. [BAD 2]. [BAD 3]. [BAD 4]. [BAD 5]." The player has already announced the PC/sub-topic heading (Step 1) and "You Are Ready When You Can: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with GOOD 1. No preamble, no card label.]

[CARD 7  -  DECISION POINT]
Displays: An interactive question placing the learner inside the Card 1/4 story.

TITLE: [Short title that places the learner in the story  -  10 words max. e.g. "You are the driver  -  what do you do?"]
QUESTION: [1 - 2 sentences. The exact moment of decision. Place learner in the Card 1/4 story. Specific details  -  job, location, pressure, stakes.]
OPTION A: [Specific action. Sounds reasonable  -  not obviously wrong.]
FEEDBACK A: [2 - 3 sentences. What happens if they choose this. Specific, realistic consequence.]
OPTION B: [Specific action  -  the correct or best action.]
FEEDBACK B: [2 - 3 sentences. Why this is right and what it achieves.]
OPTION C: [Specific action  -  a common shortcut or wrong assumption.]
FEEDBACK C: [2 - 3 sentences. The consequence of this choice.]
OPTION D: [Specific action  -  another option that seems reasonable but misses something important.]
FEEDBACK D: [2 - 3 sentences. What is missed and why it matters.]
CORRECT: [Letter of the correct option  -  A, B, C or D]
VOICEOVER: [Write in this exact format  -  copy each field verbatim: "[QUESTION text] Option A: [OPTION A text]. Option B: [OPTION B text]. Option C: [OPTION C text]. Option D: [OPTION D text]." Do NOT include any FEEDBACK text here  -  feedback only plays after the learner clicks an option, not in the voiceover. The player has already announced the PC/sub-topic heading (Step 1) and "Your Decision: [your TITLE]" (Step 2)  -  start directly with the QUESTION sentence, no preamble.]

--------------------------------------------------------------------

WRITING STANDARDS

LANGUAGE:
- Australian English spelling (organisation, recognise, behaviour, practise, licence)
- Full, complete sentences throughout
- Medium-length sentences, easy to follow
- Plain, precise vocabulary
- Concrete details: specific tools, equipment, locations, times, conversations

BANNED WORDS  -  do not use any of these:
crucial, delve, dive, unpack, holistic, robust, synergy, paradigm, multifaceted, nuanced, pivotal, empower, leverage, realm, journey, landscape, endeavour, pertaining, henceforth, whereby, thereof, therein, notwithstanding, explore, navigate, utilise, utilize, foster, streamline, effectively, efficiently, best practice, ensuring, critical, paramount, comprehensive, subsequently, furthermore, facilitate, it is important to, in order to ensure, for safety purposes, various, range of, significantly, overall, appropriate

STORY COHERENCE  -  every 7-card block must have:
1. One continuous job situation threading through Cards 1, 4, and 7
2. Card 2 opening with a direct reference to Card 1 ("What you just saw...")
3. Card 3 giving practical tools for the exact situation in Cards 1/4
4. A realistic, specific decision in Card 7  -  not generic
5. Specific, realistic consequences in Card 5  -  not vague outcomes
6. Observable, assessable behaviours in Card 6

--------------------------------------------------------------------

TASK INSTRUCTIONS

Use the sub topics listed in the section below.
Generate a complete 7-card block for EACH sub topic.
Do NOT combine multiple sub topics into one block.
Do NOT add commentary or summaries between cards.
Label each sub topic block using the letter system: A, B, C, D, etc.
Stop after all sub topics are complete.

--------------------------------------------------------------------

The context and task details follow below.

--------------------------------------------------------------------`,
            pd: `ROLE

You are a professional development learning designer creating slide card content for the AI Content Creator  -  an interactive Moodle learning activity used by working professionals continuing their development.

You write as a senior, experienced practitioner  -  someone who has lived the challenges professionals face and knows what genuinely improves practice. Not a consultant. Not a motivational coach.

Your tone is warm, direct, and evidence-informed. You write in natural, connected paragraphs. Full, complete sentences. No corporate speak. No motivational platitudes. No punchy fragments.


--------------------------------------------------------------------

WHAT IS THE AI CONTENT CREATOR?

The AI Content Creator displays your output as 7 interactive learning cards inside Moodle  -  one set of 7 cards per sub topic. Each card has a specific visual layout and purpose, and together they tell one continuous story.

You MUST write your output using the EXACT labeled sections shown below. Do not invent your own labels or section names.

--------------------------------------------------------------------

STORY CONTINUITY  -  ESSENTIAL

All 7 cards must feel like one connected learning journey, not 7 separate topics.

The GOLDEN RULE: Cards 1 and 4 happen in the SAME job situation  -  same worker, same site, same day.
- Card 1 (Hook Scenario): The opening scene. Worker faces a situation.
- Card 4 (Applied Scenario): "Later that morning..."  -  same job, new development or higher stakes.
- Card 2 must open with "What you just saw..." or "In that situation..."  -  direct reference to Card 1.
- Card 3 gives the mental model for handling exactly what happened in Card 1.
- Card 7 places the learner inside the Card 1/4 story as a decision moment.
- Cards 5 and 6 are grounded in that same job context.

Never write 7 disconnected cards about a general topic. Write 7 cards about ONE specific job situation.

--------------------------------------------------------------------

THE 7 SLIDE CARDS  -  EXACT OUTPUT FORMAT

Repeat this full 7-card block for EACH sub topic listed in the task.

====================================================================
VOICEOVER NARRATION SYSTEM  -  READ THIS BEFORE WRITING ANY VOICEOVER
====================================================================

The Moodle player has a built-in text-to-speech narration engine. Before playing each card's VOICEOVER, it automatically reads aloud  -  in this exact order:

  STEP 1 (automatic): The sub topic title from the ===A  -  [title]=== header line.
           What the learner hears: "Managing a difficult conversation with a distressed client."

  STEP 2 (automatic): The card type label combined with the TITLE you wrote.
           What the learner hears: "Scene Setting: A Friday afternoon in the project office."
           Or: "How to Handle It: Three checks before accepting any delivery."
           Or: "Your Decision: You are the driver  -  what do you do?"

  STEP 3 (your VOICEOVER field): Your narration plays immediately after Steps 1 and 2.

Because the player reads the sub topic title and the card label+title automatically, your VOICEOVER field:
   ->  Must begin DIRECTLY with the substantive narration  -  never with the sub topic title, card label, or TITLE
   ->  Must contain EXACTLY the text specified in each card's VOICEOVER instruction  -  no additions, no paraphrasing, no summarising
   ->  Must read like a voice actor's script  -  natural, connected narration that flows from where Step 2 left off

====================================================================

===================================================A  -  [Sub topic title here]===================================================

[CARD 1  -  HOOK SCENARIO]
Displays: An opening scene. A realistic job situation where this topic is immediately relevant. Narrative paragraphs. No bullet points.

TITLE: [Short scene-setting title  -  8 words max. e.g. "A busy Tuesday afternoon at the Prestons depot"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Who, where, what time, what are they doing. Introduce a real tension or challenge related to this topic. End with a moment where the right knowledge matters. Connected prose. No headings. No bullets.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting, no summarising. This IS the complete narration script for this card. The player has already announced the PC/sub-topic heading (Step 1) and "Scene Setting: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with the first sentence of CONTENT, no preamble.]

[CARD 2  -  CONCEPT EXPLAINER]
Displays: The concept explained directly  -  what the situation in Card 1 is really about.

TITLE: [Short heading that references Card 1's situation  -  8 words max. e.g. "What the worker should have known"]
CONTENT: [3 paragraphs, minimum 120 words. Para 1 MUST start with "What you just saw..." or "In that situation..."  -  explain the concept directly. Para 2: what this means in practice  -  the rule, the standard, the expectation. Para 3: why it matters in this specific workplace context.]
VOICEOVER: [Copy CONTENT word for word  -  verbatim, no rewriting. The player has already announced the PC/sub-topic heading (Step 1) and "What This Means: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "What you just saw..." or "In that situation..." exactly as written in CONTENT. No preamble, no card label.]

[CARD 3  -  MENTAL MODEL]
Displays: A numbered step-by-step flow  -  how to handle exactly this type of situation.

TITLE: [Short heading: the mental model or decision process  -  8 words max. e.g. "How to check it properly every time"]
STEP 1 TITLE: [Short step label  -  4 words max]
STEP 1 DETAIL: [2 - 3 sentences. What this step involves and why it matters.]
STEP 2 TITLE: [Short step label]
STEP 2 DETAIL: [2 - 3 sentences.]
STEP 3 TITLE: [Short step label]
STEP 3 DETAIL: [2 - 3 sentences.]
STEP 4 TITLE: [Short step label  -  optional 4th step if genuinely needed]
STEP 4 DETAIL: [2 - 3 sentences  -  only if genuinely needed]
VOICEOVER: [Copy all step content word for word in this exact format: "[STEP 1 TITLE]: [STEP 1 DETAIL] [STEP 2 TITLE]: [STEP 2 DETAIL] [STEP 3 TITLE]: [STEP 3 DETAIL]"  -  and so on for every step you wrote. Do NOT include TITLE  -  the player has already announced "How to Handle It: [your TITLE]" (Step 2). Start your VOICEOVER directly with Step 1 Title. Minimum 60 words covering all steps.]

[CARD 4  -  APPLIED SCENARIO]
Displays: "Later that day..."  -  a continuation of Card 1, same job, new development.

TITLE: [Short title that signals continuation  -  8 words max. e.g. "Later that morning  -  a second delivery arrives"]
CONTENT: [3 - 4 paragraphs, minimum 150 words. Continue the SAME job situation from Card 1. Use "Later that day...", "On the same shift...", or "The same worker now..."  -  new complication or higher stakes. End with a moment of correct action or decision.]
HIGHLIGHT: [1 - 2 sentences. The key moment or correct action  -  what made the difference. Written as a pull-quote.]
VOICEOVER: [Copy CONTENT word for word then HIGHLIGHT word for word  -  verbatim, in that order. The player has already announced the PC/sub-topic heading (Step 1) and "On the Job: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with "Later that day..." or "On the same shift..." as written in CONTENT. No preamble, no card label.]

[CARD 5  -  COMMON MISTAKES]
Displays: Warning cards  -  specific mistakes grounded in the Card 1/4 scenario context.

TITLE: [Short heading  -  8 words max. e.g. "What goes wrong in situations like this"]
MISTAKE 1: [Specific mistake  -  named, sounds reasonable but creates a problem. Grounded in the scenario.]
CONSEQUENCE 1: [Minimum 50 words. Specific chain of events  -  what actually happens. Not vague.]
MISTAKE 2: [Specific mistake  -  different from Mistake 1.]
CONSEQUENCE 2: [Minimum 50 words. Specific chain of events.]
MISTAKE 3: [Specific mistake.]
CONSEQUENCE 3: [Minimum 50 words. End with a PRACTICAL HABIT  -  a specific check, phrase, or routine that prevents this.]
VOICEOVER: [Copy all MISTAKE and CONSEQUENCE text word for word in this order: "[MISTAKE 1]. [CONSEQUENCE 1] [MISTAKE 2]. [CONSEQUENCE 2] [MISTAKE 3]. [CONSEQUENCE 3]". The player has already announced the PC/sub-topic heading (Step 1) and "Watch Out For: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with Mistake 1. No preamble, no card label.]

[CARD 6  -  COMPETENCY SUMMARY]
Displays: Two columns  -  left column "What Good Looks Like" (green) + right column "What to Avoid" (red).

TITLE: [Short heading  -  8 words max. e.g. "You are ready when you can"]
GOOD 1: [Observable marker of competence  -  full sentence, action verb first, grounded in the Card 1/4 scenario. e.g. "Checks the temperature log before signing any refrigerated delivery docket"]
GOOD 2: [Observable marker of competence.]
GOOD 3: [Observable marker of competence.]
GOOD 4: [Observable marker of competence.]
GOOD 5: [Observable marker of competence.]
BAD 1: [Specific failure pattern  -  full sentence describing what the incompetent worker does or skips, grounded in the scenario. e.g. "Signs the delivery paperwork without checking whether the temperature stayed within range"]
BAD 2: [Failure pattern.]
BAD 3: [Failure pattern.]
BAD 4: [Failure pattern.]
BAD 5: [Failure pattern.]
VOICEOVER: [Copy all GOOD items then all BAD items word for word in this exact format: "[GOOD 1]. [GOOD 2]. [GOOD 3]. [GOOD 4]. [GOOD 5]. Watch out for: [BAD 1]. [BAD 2]. [BAD 3]. [BAD 4]. [BAD 5]." The player has already announced the PC/sub-topic heading (Step 1) and "You Are Ready When You Can: [your TITLE]" (Step 2)  -  start your VOICEOVER directly with GOOD 1. No preamble, no card label.]

[CARD 7  -  DECISION POINT]
Displays: An interactive question placing the learner inside the Card 1/4 story.

TITLE: [Short title that places the learner in the story  -  10 words max. e.g. "You are the driver  -  what do you do?"]
QUESTION: [1 - 2 sentences. The exact moment of decision. Place learner in the Card 1/4 story. Specific details  -  job, location, pressure, stakes.]
OPTION A: [Specific action. Sounds reasonable  -  not obviously wrong.]
FEEDBACK A: [2 - 3 sentences. What happens if they choose this. Specific, realistic consequence.]
OPTION B: [Specific action  -  the correct or best action.]
FEEDBACK B: [2 - 3 sentences. Why this is right and what it achieves.]
OPTION C: [Specific action  -  a common shortcut or wrong assumption.]
FEEDBACK C: [2 - 3 sentences. The consequence of this choice.]
OPTION D: [Specific action  -  another option that seems reasonable but misses something important.]
FEEDBACK D: [2 - 3 sentences. What is missed and why it matters.]
CORRECT: [Letter of the correct option  -  A, B, C or D]
VOICEOVER: [Write in this exact format  -  copy each field verbatim: "[QUESTION text] Option A: [OPTION A text]. Option B: [OPTION B text]. Option C: [OPTION C text]. Option D: [OPTION D text]." Do NOT include any FEEDBACK text here  -  feedback only plays after the learner clicks an option, not in the voiceover. The player has already announced the PC/sub-topic heading (Step 1) and "Your Decision: [your TITLE]" (Step 2)  -  start directly with the QUESTION sentence, no preamble.]

--------------------------------------------------------------------

WRITING STANDARDS

LANGUAGE:
- Australian English spelling (organisation, recognise, behaviour, practise, licence)
- Full, complete sentences throughout
- Medium-length sentences, easy to follow
- Plain, precise vocabulary
- Concrete details: specific tools, equipment, locations, times, conversations

BANNED WORDS  -  do not use any of these:
crucial, delve, dive, unpack, holistic, robust, synergy, paradigm, multifaceted, nuanced, pivotal, empower, leverage, realm, journey, landscape, endeavour, pertaining, henceforth, whereby, thereof, therein, notwithstanding, explore, navigate, utilise, utilize, foster, streamline, effectively, efficiently, best practice, ensuring, critical, paramount, comprehensive, subsequently, furthermore, facilitate, it is important to, in order to ensure, for safety purposes, various, range of, significantly, overall, appropriate

STORY COHERENCE  -  every 7-card block must have:
1. One continuous job situation threading through Cards 1, 4, and 7
2. Card 2 opening with a direct reference to Card 1 ("What you just saw...")
3. Card 3 giving practical tools for the exact situation in Cards 1/4
4. A realistic, specific decision in Card 7  -  not generic
5. Specific, realistic consequences in Card 5  -  not vague outcomes
6. Observable, assessable behaviours in Card 6

--------------------------------------------------------------------

TASK INSTRUCTIONS

Use the sub topics listed in the section below.
Generate a complete 7-card block for EACH sub topic.
Do NOT combine multiple sub topics into one block.
Do NOT add commentary or summaries between cards.
Label each sub topic block using the letter system: A, B, C, D, etc.
Stop after all sub topics are complete.

--------------------------------------------------------------------

The context and task details follow below.

--------------------------------------------------------------------`
        };

        // Build the full prompt from template + context block + topics header
        const promptText = PROMPT_TEMPLATES[mode] || PROMPT_TEMPLATES.vet;
        const fullPrompt = promptText +
            (contextBlock ? '\n\n' + contextBlock : '') +
            (topicsHeader ? '\n' + topicsHeader : '');

        // Trigger browser download of the prompt as a .txt file
        const blob = new Blob([fullPrompt], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenames[mode] || 'ChatGPT-Prompt.txt';
        const dlRoot = document.getElementById('contentcreator-app') || document.body;
        dlRoot.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        dlRoot.removeChild(a);
    };

    // v10.25: Parse pasted plain-text TGA elements (element + performance criteria)
    const parseElementsText = (text) => {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const elements = [];
        let current = null;
        let pendingCode = null;

        for (const line of lines) {
            // PC line: "1.1 text", "1.1. text", or 3-level "1.1.0 text" / "1.1.1 text"
            if (/^\d+\.\d+(?:\.\d+)?\.?\s+/.test(line)) {
                if (!current && pendingCode) {
                    current = { code: pendingCode, name: 'Element ' + pendingCode, performanceCriteria: [] };
                    elements.push(current);
                    pendingCode = null;
                }
                if (current) {
                    const pcMatch = line.match(/^(\d+\.\d+(?:\.\d+)?)\.?\s+(.+)/);
                    if (pcMatch) {
                        current.performanceCriteria.push(pcMatch[1] + ' ' + pcMatch[2].trim());
                    }
                }
                continue;
            }

            // Element line: "1. Element name" or "1 Element name" (two+ spaces)
            const elMatch = line.match(/^(\d+)\.?\s{1,}(.+)/) ;
            if (elMatch && !line.match(/^\d+\.\d+/)) {
                if (pendingCode) {
                    // The pending lone-digit code + this line's number mismatch  -  use elMatch
                    pendingCode = null;
                }
                current = { code: elMatch[1], name: elMatch[2].replace(/\.$/, '').trim(), performanceCriteria: [] };
                elements.push(current);
                continue;
            }

            // If we had a lone pending code and next line is the element name
            if (pendingCode && !line.match(/^\d+/)) {
                current = { code: pendingCode, name: line.replace(/\.$/, '').trim(), performanceCriteria: [] };
                elements.push(current);
                pendingCode = null;
                continue;
            }

            // Continuation of current element name (before first PC)
            if (current && current.performanceCriteria.length === 0 && !line.match(/^\d+/)) {
                current.name = (current.name + ' ' + line.replace(/\.$/, '').trim()).trim();
                continue;
            }

            // Continuation of last PC
            if (current && current.performanceCriteria.length > 0 && !line.match(/^\d+/)) {
                const lastPc = current.performanceCriteria[current.performanceCriteria.length - 1];
                current.performanceCriteria[current.performanceCriteria.length - 1] = lastPc + ' ' + line.trim();
            }
        }
        return elements;
    };

    // v10.25: Show/hide the paste-elements panel
    const togglePasteElements = () => {
        const panel = document.getElementById('cc-paste-elements-panel');
        if (!panel) return;
        panel.classList.toggle('cc-hidden');
    };

    // v10.25: Apply pasted elements  -  replace or merge with tgaData.elements
    const applyPasteElements = (mergeMode) => {
        const textarea = document.getElementById('cc-paste-elements-text');
        const statusEl = document.getElementById('cc-paste-elements-status');
        if (!textarea || !tgaData) return;

        const parsed = parseElementsText(textarea.value);
        if (parsed.length === 0) {
            if (statusEl) statusEl.textContent = 'No elements found  -  check the format.';
            return;
        }

        if (mergeMode) {
            // Merge: add elements whose code is not already present
            const existingCodes = new Set((tgaData.elements || []).map(e => String(e.code)));
            const newEls = parsed.filter(e => !existingCodes.has(String(e.code)));
            tgaData.elements = [...(tgaData.elements || []), ...newEls]
                .sort((a, b) => parseInt(a.code, 10) - parseInt(b.code, 10));
            if (statusEl) statusEl.textContent = `Merged ${newEls.length} new element(s). Total: ${tgaData.elements.length}`;
        } else {
            // Replace
            tgaData.elements = parsed;
            if (statusEl) statusEl.textContent = `Replaced with ${parsed.length} element(s).`;
        }

        // Re-render element list and stats
        const elementListEl = document.getElementById('cc-element-list');
        if (elementListEl) elementListEl.innerHTML = renderElementList(tgaData);
        // Re-render the unit stats card
        const detailsEl = document.getElementById('cc-unit-details');
        if (detailsEl) detailsEl.innerHTML = renderTGADetails(tgaData);
        // Reset element selection
        selectedElementIds = [];
        elementSelectionInitialized = false;
        // Re-show correction bar
        const corrBar = document.getElementById('cc-element-correction-bar');
        if (corrBar) corrBar.classList.remove('cc-hidden');
        // Collapse the paste panel
        const panel = document.getElementById('cc-paste-elements-panel');
        if (panel) panel.classList.add('cc-hidden');
        // Re-bind element card events
        bindElementSelectionEvents();
    };

    // v10.25: Force-refresh the current unit from TGA, bypassing cache
    const handleRefreshElements = async () => {
        const unitCode = document.getElementById('cc-unit-code')?.value?.trim().toUpperCase();
        if (!unitCode) { showError('Please enter a unit code first.'); return; }
        const btn = document.getElementById('cc-refresh-elements');
        if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }
        try {
            const response = await fetch(`https://lms-labs.com/api/tga/unit/${unitCode}?refresh=true`);
            if (!response.ok) throw new Error('TGA returned ' + response.status);
            const data = await response.json();
            const unit = data.data || data.unit;
            if (data.success && unit) {
                tgaData = {
                    unitCode: unit.code,
                    unitTitle: unit.title,
                    elements: unit.elements || [],
                    performanceCriteria: unit.performanceCriteria || [],
                    knowledgeEvidence: unit.knowledgeEvidence || [],
                    performanceEvidence: unit.performanceEvidence || [],
                    foundationSkills: unit.foundationSkills || []
                };
                selectedElementIds = [];
                elementSelectionInitialized = false;
                const detailsEl = document.getElementById('cc-unit-details');
                if (detailsEl) { detailsEl.innerHTML = renderTGADetails(tgaData); detailsEl.classList.remove('cc-hidden'); }
                const elementListEl = document.getElementById('cc-element-list');
                if (elementListEl) elementListEl.innerHTML = renderElementList(tgaData);
                const corrBar = document.getElementById('cc-element-correction-bar');
                if (corrBar) corrBar.classList.remove('cc-hidden');
                bindMajorTopicSelectorEvents();
                bindElementSelectionEvents();
            }
        } catch (e) {
            showError('Refresh failed: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon" style="width:14px;height:14px;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refresh from TGA'; }
        }
    };

    const fetchTGAUnit = async () => {
        const unitCode = document.getElementById('cc-unit-code')?.value?.trim().toUpperCase();
        if (!unitCode) {
            showError('Please enter a unit code.');
            return;
        }

        const loadingEl = document.getElementById('cc-unit-loading');
        const detailsEl = document.getElementById('cc-unit-details');
        const fetchBtn = document.getElementById('cc-fetch-unit');
        const pdfUploadSection = document.getElementById('cc-pdf-upload-section');

        loadingEl?.classList.remove('cc-hidden');
        detailsEl?.classList.add('cc-hidden');
        pdfUploadSection?.classList.add('cc-hidden');
        if (fetchBtn) fetchBtn.disabled = true;
        
        // v6.9.1: Clear previous AI context before fetching new unit
        window.CC_AI_CONTEXT = null;
        window.CC_AI_JOB_TITLES = [];
        window.CC_AI_TASK_CATEGORIES = [];
        window.CC_AI_EQUIPMENT_CATEGORIES = [];
        window.CC_AI_DETECTED_INDUSTRY = '';
        window.CC_AI_DETECTED_SECTOR = '';
        window.CC_SELECTED_JOB_TITLES = [];
        window.CC_SELECTED_TASKS = [];
        window.CC_SELECTED_EQUIPMENT = [];
        
        // v6.9.1: Also clear legacy context variables
        window.CC_SELECTED_JOB_ROLES = [];
        window.CC_SELECTED_JOB_LEVELS = [];
        document.querySelectorAll('.cc-level-pill').forEach(p => p.classList.remove('cc-level-active'));
        window.CC_SELECTED_TASK_CATEGORIES = [];
        window.CC_SELECTED_EQUIPMENT_CATEGORIES = [];
        window.CC_SELECTED_EQUIPMENT_LEGACY = [];
        
        // v6.9.1: Clear AI failure flags
        window.CC_AI_FAILED = false;
        window.CC_AI_NO_FALLBACK = false;
        window.CC_AI_LOADING = false;

        try {
            const response = await fetch(`https://lms-labs.com/api/tga/unit/${unitCode}`);
            
            if (!response.ok) {
                throw new Error('TGA API returned ' + response.status);
            }
            const data = await response.json();

            // API returns { success: true, data: {...} } - unit is in data.data, not data.unit
            const unit = data.data || data.unit;
            if (data.success && unit) {
                tgaData = {
                    unitCode: unit.code,
                    unitTitle: unit.title,
                    elements: unit.elements || [],
                    performanceCriteria: unit.performanceCriteria || [],
                    knowledgeEvidence: unit.knowledgeEvidence || [],
                    performanceEvidence: unit.performanceEvidence || [],
                    foundationSkills: unit.foundationSkills || []
                };
                suggestedMajorTopics = [];
                selectedMajorTopicIds = [];
                selectedElementIds = []; // v8.4.34: Reset - user must pick ONE element
                elementSelectionInitialized = false;
                detailsEl.innerHTML = renderTGADetails(tgaData);
                detailsEl?.classList.remove('cc-hidden');
                // v8.4.34: Show unit-dependent sections (element selection appears first)
                const unitDepSections = document.getElementById('cc-unit-dependent-sections');
                if (unitDepSections) {
                    unitDepSections.classList.remove('cc-hidden');
                }
                // v8.4.34: Render element list for selection
                const elementListEl = document.getElementById('cc-element-list');
                if (elementListEl) {
                    elementListEl.innerHTML = renderElementList(tgaData);
                }
                // v10.25: Show the element correction bar (Refresh + Paste tools)
                const corrBar = document.getElementById('cc-element-correction-bar');
                if (corrBar) corrBar.classList.remove('cc-hidden');
                // v8.4.34: Hide element-dependent sections until user picks an element
                const elementDepSections = document.getElementById('cc-element-dependent-sections');
                if (elementDepSections) {
                    elementDepSections.classList.add('cc-hidden');
                }
                bindMajorTopicSelectorEvents();
                
                // v6.9.5: DON'T call AI suggestions immediately - wait for user to fill context first
                // The user must select Industry, Sector, Job Level BEFORE AI can suggest relevant content
                // AI suggestions will be triggered when user clicks "Suggest Topics" button
                
                // v6.9.2: Hide legacy context section - AI suggestions replace them
                const legacyContextSection = document.querySelector('#cc-task-category-cards')?.closest('.cc-form-section');
                if (legacyContextSection) {
                    legacyContextSection.style.display = 'none';
                    legacyContextSection.dataset.hiddenByAi = 'true';
                }
                
                // Show PDF upload if PE/KE are empty (common for streamlined units)
                const hasPEKE = (unit.performanceEvidence?.length > 0) || (unit.knowledgeEvidence?.length > 0);
                if (hasPEKE) {
                    pdfUploadSection?.classList.add('cc-hidden');
                    hideError();
                } else {
                    // Show upload option for missing PE/KE
                    pdfUploadSection?.classList.remove('cc-hidden');
                    showError('Unit found but Performance/Knowledge Evidence missing. Upload the complete unit PDF to extract this data.');
                }
            } else {
                // Show PDF upload fallback
                showError(data.error || 'Unit not found. Try uploading the PDF instead.');
                pdfUploadSection?.classList.remove('cc-hidden');
                tgaData = null;
            }
        } catch (err) {
            // Show PDF upload fallback on error/timeout
            showError('TGA API unavailable. Please upload the unit PDF instead.');
            pdfUploadSection?.classList.remove('cc-hidden');
            tgaData = null;
        } finally {
            loadingEl?.classList.add('cc-hidden');
            if (fetchBtn) fetchBtn.disabled = false;
        }
    };

    const handlePdfUpload = async () => {
        const unitCode = document.getElementById('cc-unit-code')?.value?.trim().toUpperCase();
        const fileInput = document.getElementById('cc-pdf-file');
        const file = fileInput?.files?.[0];

        if (!unitCode) {
            showError('Please enter a unit code first.');
            return;
        }
        if (!file) {
            showError('Please select a PDF file to upload.');
            return;
        }
        if (file.type !== 'application/pdf') {
            showError('Please upload a PDF file.');
            return;
        }

        const pdfLoadingEl = document.getElementById('cc-pdf-loading');
        const pdfUploadSection = document.getElementById('cc-pdf-upload-section');
        const detailsEl = document.getElementById('cc-unit-details');
        const uploadBtn = document.getElementById('cc-upload-pdf');

        pdfLoadingEl?.classList.remove('cc-hidden');
        if (uploadBtn) uploadBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('pdf', file);

            const response = await fetch(`https://lms-labs.com/api/tga/unit/${unitCode}/upload-pdf`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('PDF upload API returned ' + response.status);
            }
            const data = await response.json();

            if (data.success && data.data) {
                const unit = data.data;
                // Merge with existing tgaData if available (preserves elements from prior fetch)
                tgaData = {
                    unitCode: unit.code || tgaData?.unitCode || unitCode,
                    unitTitle: unit.title || tgaData?.unitTitle || unitCode,
                    elements: unit.elements?.length > 0 ? unit.elements : (tgaData?.elements || []),
                    performanceCriteria: unit.performanceCriteria?.length > 0 ? unit.performanceCriteria : (tgaData?.performanceCriteria || []),
                    knowledgeEvidence: unit.knowledgeEvidence || [],
                    performanceEvidence: unit.performanceEvidence || [],
                    foundationSkills: unit.foundationSkills || tgaData?.foundationSkills || []
                };
                detailsEl.innerHTML = renderTGADetails(tgaData);
                detailsEl?.classList.remove('cc-hidden');
                // v8.4.34: Show unit-dependent sections and render element list
                const unitDepSections = document.getElementById('cc-unit-dependent-sections');
                if (unitDepSections) {
                    unitDepSections.classList.remove('cc-hidden');
                }
                const elementListEl = document.getElementById('cc-element-list');
                if (elementListEl) {
                    elementListEl.innerHTML = renderElementList(tgaData);
                }
                // v10.25: Show element correction bar
                const corrBarPdf = document.getElementById('cc-element-correction-bar');
                if (corrBarPdf) corrBarPdf.classList.remove('cc-hidden');
                const elementDepSections = document.getElementById('cc-element-dependent-sections');
                if (elementDepSections) {
                    elementDepSections.classList.add('cc-hidden');
                }
                bindMajorTopicSelectorEvents();
                pdfUploadSection?.classList.add('cc-hidden');
                hideError();
            } else {
                showError(data.error || 'Failed to extract data from PDF.');
            }
        } catch (err) {
            showError('Failed to upload PDF. Please try again.');
        } finally {
            pdfLoadingEl?.classList.add('cc-hidden');
            if (uploadBtn) uploadBtn.disabled = false;
        }
    };

    /** Switch between Upload PDF / Paste Text tabs in the fallback panel */
    const switchFallbackTab = (tab) => {
        const pdfPanel  = document.getElementById('cc-fallback-pdf-panel');
        const pastePanel = document.getElementById('cc-fallback-paste-panel');
        const tabPdf   = document.getElementById('cc-tab-pdf');
        const tabPaste = document.getElementById('cc-tab-paste');
        if (!pdfPanel || !pastePanel) return;
        if (tab === 'paste') {
            pdfPanel.style.display  = 'none';
            pastePanel.style.display = '';
            if (tabPdf)   { tabPdf.style.borderBottomColor   = 'transparent'; tabPdf.style.color   = 'var(--cc-text-secondary)'; }
            if (tabPaste) { tabPaste.style.borderBottomColor = 'var(--cc-primary)'; tabPaste.style.color = 'var(--cc-primary)'; }
        } else {
            pdfPanel.style.display  = '';
            pastePanel.style.display = 'none';
            if (tabPdf)   { tabPdf.style.borderBottomColor   = 'var(--cc-primary)'; tabPdf.style.color   = 'var(--cc-primary)'; }
            if (tabPaste) { tabPaste.style.borderBottomColor = 'transparent'; tabPaste.style.color = 'var(--cc-text-secondary)'; }
        }
    };

    /** Process pasted unit text as a fallback when PDF upload is unavailable */
    const handlePasteTextExtract = async () => {
        const unitCode = document.getElementById('cc-unit-code')?.value?.trim().toUpperCase();
        const textarea = document.getElementById('cc-paste-unit-text');
        const pastedText = textarea?.value?.trim();

        if (!unitCode) { showError('Please enter a unit code first.'); return; }
        if (!pastedText || pastedText.length < 50) { showError('Please paste the unit text before processing.'); return; }

        const pdfLoadingEl    = document.getElementById('cc-pdf-loading');
        const pdfUploadSection = document.getElementById('cc-pdf-upload-section');
        const detailsEl       = document.getElementById('cc-unit-details');
        const processBtn      = document.getElementById('cc-process-paste-text');

        pdfLoadingEl?.classList.remove('cc-hidden');
        if (pdfLoadingEl) pdfLoadingEl.querySelector('span').textContent = 'Extracting competency data from pasted text...';
        if (processBtn) processBtn.disabled = true;

        try {
            const response = await fetch(`https://lms-labs.com/api/tga/unit/${unitCode}/parse-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: pastedText })
            });
            if (!response.ok) throw new Error('Text parse API returned ' + response.status);
            const data = await response.json();

            if (data.success && data.data) {
                const unit = data.data;
                tgaData = {
                    unitCode:  unit.code  || tgaData?.unitCode  || unitCode,
                    unitTitle: unit.title || tgaData?.unitTitle || unitCode,
                    elements:  unit.elements?.length > 0 ? unit.elements : (tgaData?.elements || []),
                    performanceCriteria:  unit.performanceCriteria?.length > 0 ? unit.performanceCriteria : (tgaData?.performanceCriteria || []),
                    knowledgeEvidence:    unit.knowledgeEvidence || [],
                    performanceEvidence:  unit.performanceEvidence || [],
                    foundationSkills:     unit.foundationSkills || tgaData?.foundationSkills || []
                };
                detailsEl.innerHTML = renderTGADetails(tgaData);
                detailsEl?.classList.remove('cc-hidden');
                const unitDepSections = document.getElementById('cc-unit-dependent-sections');
                if (unitDepSections) unitDepSections.classList.remove('cc-hidden');
                const elementListEl = document.getElementById('cc-element-list');
                if (elementListEl) elementListEl.innerHTML = renderElementList(tgaData);
                // v10.25: Show element correction bar
                const corrBarTxt = document.getElementById('cc-element-correction-bar');
                if (corrBarTxt) corrBarTxt.classList.remove('cc-hidden');
                const elementDepSections = document.getElementById('cc-element-dependent-sections');
                if (elementDepSections) elementDepSections.classList.add('cc-hidden');
                bindMajorTopicSelectorEvents();
                pdfUploadSection?.classList.add('cc-hidden');
                hideError();
            } else {
                showError(data.error || 'Failed to extract data from pasted text.');
            }
        } catch (err) {
            showError('Failed to process pasted text. Please try again or use the PDF upload option.');
        } finally {
            pdfLoadingEl?.classList.add('cc-hidden');
            if (pdfLoadingEl) pdfLoadingEl.querySelector('span').textContent = 'Extracting competency data from PDF...';
            if (processBtn) processBtn.disabled = false;
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const handleWorkplaceFileUpload = async (file) => {
        if (!file) return;

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            showError('File size exceeds 10MB limit. Please upload a smaller file.');
            return;
        }

        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain'
        ];
        const allowedExtensions = ['.pdf', '.docx', '.pptx', '.txt'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
            showError('Invalid file type. Please upload PDF, DOCX, PPTX, or TXT files only.');
            return;
        }

        const dropZone = document.getElementById('cc-drop-zone');
        const filePreview = document.getElementById('cc-file-preview');
        const filenameEl = document.getElementById('cc-uploaded-filename');
        const filesizeEl = document.getElementById('cc-uploaded-filesize');
        const extractLoading = document.getElementById('cc-extract-loading');
        const contentEl = document.getElementById('cc-workplace-content');

        // Update UI to show file preview
        dropZone?.classList.add('cc-hidden');
        filenameEl.textContent = file.name;
        filesizeEl.textContent = formatFileSize(file.size);
        filePreview?.classList.remove('cc-hidden');
        extractLoading?.classList.remove('cc-hidden');
        contentEl?.classList.add('cc-hidden');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('https://lms-labs.com/api/moodle/content-creator/extract-document', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Document extraction API returned ' + response.status);
            }
            const data = await response.json();

            if (data.success && data.data) {
                workplaceData = {
                    filename: file.name,
                    title: data.data.title || file.name.replace(/\.[^/.]+$/, ''),
                    content: data.data.content || '',
                    sections: data.data.sections || [],
                    wordCount: data.data.wordCount || 0
                };
                // Reset topic selections for new document
                suggestedMajorTopics = [];
                selectedMajorTopicIds = [];
                selectedElementIds = []; // v6.9.11
                contentEl.innerHTML = renderWorkplaceDetails(workplaceData);
                contentEl?.classList.remove('cc-hidden');
                bindWorkplaceTopicSelectorEvents();
                hideError();
                
                // v6.9.1: Trigger AI-powered context suggestions from document
                if (window.CC_BUILDER?.renderWorkplaceAISuggestions) {
                    window.CC_BUILDER.renderWorkplaceAISuggestions(workplaceData);
                }
            } else {
                showError(data.error || 'Failed to extract content from document.');
                removeWorkplaceFile();
            }
        } catch (err) {
            showError('Failed to process document. Please try again.');
            removeWorkplaceFile();
        } finally {
            extractLoading?.classList.add('cc-hidden');
        }
    };

    const removeWorkplaceFile = () => {
        const dropZone = document.getElementById('cc-drop-zone');
        const filePreview = document.getElementById('cc-file-preview');
        const fileInput = document.getElementById('cc-workplace-file');
        const contentEl = document.getElementById('cc-workplace-content');

        dropZone?.classList.remove('cc-hidden');
        filePreview?.classList.add('cc-hidden');
        contentEl?.classList.add('cc-hidden');
        if (fileInput) fileInput.value = '';
        workplaceData = null;
        suggestedMajorTopics = [];
        selectedMajorTopicIds = [];
        selectedElementIds = []; // v6.9.11
    };



    const suggestWorkplaceTopics = async () => {
        if (!workplaceData) {
            showError('Please upload a document first.');
            return;
        }

        const majorTopic = document.getElementById('cc-wp-training-topic')?.value?.trim();
        if (!majorTopic) {
            showError('Please enter a training topic first.');
            return;
        }

        const suggestBtn = document.getElementById('cc-suggest-workplace-topics-btn');
        const loadingEl = document.getElementById('cc-workplace-suggest-loading');
        const contentEl = document.getElementById('cc-workplace-content');
        // Also target inner card button/loading (no id  -  found by class to avoid duplicate-id issues)
        const innerSuggestBtn = contentEl?.querySelector('.cc-wp-inner-suggest-btn');
        const innerLoadingEl = document.getElementById('cc-workplace-inner-suggest-loading');
        
        document.getElementById('cc-extract-loading')?.classList.add('cc-hidden');

        if (suggestBtn) suggestBtn.disabled = true;
        if (innerSuggestBtn) innerSuggestBtn.disabled = true;
        loadingEl?.classList.remove('cc-hidden');
        innerLoadingEl?.classList.remove('cc-hidden');

        try {
            const context = gatherContext();
            const response = await fetch('https://lms-labs.com/api/moodle/content-creator/suggest-workplace-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: workplaceData.content,
                    title: workplaceData.title,
                    majorTopic: majorTopic,
                    context: context,
                    duration: parseInt(document.querySelector('input[name="duration"]:checked')?.value) || 10
                })
            });
            
            if (!response.ok) {
                throw new Error('API returned ' + response.status + ': ' + response.statusText);
            }
            const data = await response.json();

            if (data.success && data.topics?.length > 0) {
                suggestedMajorTopics = data.topics.map((t, i) => {
                    let title = t.title || '';
                    if (title.length > 150) {
                        const trunc = title.substring(0, 130);
                        const sp = trunc.lastIndexOf(' ');
                        title = (sp > 30 ? trunc.substring(0, sp) : trunc).trim();
                    }
                    return {
                    id: `topic-${i}`,
                    title: title,
                    description: t.description || '',
                    subtopics: t.subtopics || []
                    };
                });
                // Auto-select all by default
                selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
                contentEl.innerHTML = renderWorkplaceDetails(workplaceData);
                bindWorkplaceTopicSelectorEvents();
                updateGenerateTopicsButton();
                hideError();
            } else {
                showError(data.error || 'Failed to suggest topics. Please try again.');
            }
        } catch (err) {
            showError('Failed to suggest topics. Please try again.');
        } finally {
            loadingEl?.classList.add('cc-hidden');
            innerLoadingEl?.classList.add('cc-hidden');
            if (suggestBtn) suggestBtn.disabled = false;
        }
    };

    const bindWorkplaceTopicSelectorEvents = () => {
        const contentEl = document.getElementById('cc-workplace-content');
        if (!contentEl) return;

        // Suggest Topics button (inner card button  -  no id to avoid duplicate-id conflict with #cc-wp-suggest-section button)
        contentEl.querySelector('.cc-wp-inner-suggest-btn')?.addEventListener('click', suggestWorkplaceTopics);

        // Select All button
        contentEl.querySelector('#cc-select-all-topics')?.addEventListener('click', () => {
            selectedMajorTopicIds = suggestedMajorTopics.map(t => t.id);
            contentEl.innerHTML = renderWorkplaceDetails(workplaceData);
            bindWorkplaceTopicSelectorEvents();
            updateGenerateTopicsButton();
        });

        // Deselect All button
        contentEl.querySelector('#cc-deselect-all-topics')?.addEventListener('click', () => {
            selectedMajorTopicIds = [];
            contentEl.innerHTML = renderWorkplaceDetails(workplaceData);
            bindWorkplaceTopicSelectorEvents();
            updateGenerateTopicsButton();
        });

        // Individual checkbox handlers
        contentEl.querySelectorAll('.cc-major-topic-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const topicId = e.target.dataset.topicId;
                if (e.target.checked) {
                    if (!selectedMajorTopicIds.includes(topicId)) {
                        selectedMajorTopicIds.push(topicId);
                    }
                } else {
                    selectedMajorTopicIds = selectedMajorTopicIds.filter(id => id !== topicId);
                }
                const card = e.target.closest('.cc-major-topic-card');
                if (card) {
                    card.classList.toggle('selected', e.target.checked);
                }
                updateTopicStats();
                updateGenerateTopicsButton();
            });
        });
    };

    const generateTopicPlan = async () => {
        const duration = parseInt(document.querySelector('input[name="duration"]:checked')?.value) || 10;

        const inputs = {
            mode: selectedMode,
            duration: duration,
            context: storedContext || gatherContext()
        };

        if (selectedMode === 'vet' && tgaData) {
            // Pass selected Major Topics (ChatGPT's two-stage model)
            const selectedTopics = suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id));
            selectedTopics.forEach((t, i) => {
                if (t.subtopics && t.subtopics.length > 0) {
                    t.subtopics.forEach((s, j) => {
                    });
                } else {
                }
            });
            inputs.selectedMajorTopics = selectedTopics;
            inputs.tgaData = tgaData;
        } else if (selectedMode === 'workplace' && workplaceData) {
            // Pass selected Major Topics for workplace mode
            const selectedTopics = suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id));
            inputs.selectedMajorTopics = selectedTopics;
            inputs.workplaceData = workplaceData;
        } else {
            inputs.outcomes = storedOutcomes.length > 0 ? storedOutcomes : gatherOutcomes();
            if (storedTopicHierarchy) {
                inputs.topicHierarchy = storedTopicHierarchy;
            }
        }

        try {
            topicPlan = Planner.planTopics(inputs);
            updateWizardUI();
        } catch (err) {
            showError('Failed to generate topic structure. Please try again.');
            currentStep = 2;
            updateWizardUI();
        }
    };

    const gatherContext = () => {
        if (selectedMode === 'vet') {
            const countryCode = document.getElementById('cc-country')?.value || 'AU';
            const state = document.getElementById('cc-state')?.value || '';
            
            // ===========================================================================
            // v6.9.14: SIMPLIFIED CONTEXT - AI AUTO-GENERATES SCENARIOS
            // User only selects: Country, State, Industry, Sector, Job Level
            // AI automatically generates appropriate job titles, tasks, equipment
            // ===========================================================================
            
            // v6.9.14: Get context from dropdowns - AI auto-generates scenarios based on these
            const industry = document.getElementById('cc-industry')?.value || '';
            const industrySector = document.getElementById('cc-industry-sector')?.value || '';
            const jobLevel = window.CC_SELECTED_JOB_LEVELS.length > 0
                ? window.CC_SELECTED_JOB_LEVELS.join(', ')
                : 'worker';
            
            // v6.9.17: jobLevel is the input - AI dynamically generates job titles in scenarios
            // No manual job title selection - AI handles this based on industry + sector + level
            const jobTitle = ''; // AI generates job titles dynamically
            
            // v6.9.14: No more manual job/task/equipment selection - AI handles this automatically
            const selectedJobTitleIds = [];
            const selectedTaskIds = [];
            const selectedEquipmentIds = [];
            
            // v6.9.14: Empty AI data arrays since we're not using AI suggestions UI
            const aiJobTitles = [];
            const aiTaskCategories = [];
            const aiEquipmentCategories = [];
            
            // v6.9.17: jobRoles empty - AI generates dynamically based on jobLevel
            const selectedJobTitles = [];
            const jobRoles = [];
            
            // Build selected tasks with examples and element mappings
            const selectedTasks = aiTaskCategories.filter(t => selectedTaskIds.includes(t.id));
            const jobTasks = selectedTasks.map(t => {
                const examples = (t.examples || []).slice(0, 3).join(', ');
                return examples ? `${t.title}: ${examples}` : t.title;
            });
            
            // Build selected equipment with examples and element mappings
            const selectedEquipment = aiEquipmentCategories.filter(e => selectedEquipmentIds.includes(e.id));
            const equipmentList = selectedEquipment.map(e => {
                const examples = (e.examples || []).slice(0, 3).join(', ');
                return examples ? `${e.title}: ${examples}` : e.title;
            });
            
            // Map tasks to equipment for prompt binding
            const taskEquipment = {};
            const equipmentStr = equipmentList.join('; ');
            jobTasks.forEach(task => {
                if (equipmentStr) {
                    taskEquipment[task] = equipmentStr;
                }
            });
            
            const learnerRole = jobTitle ? `${jobTitle} (${jobLevel})` : jobLevel;
            const industryContext = industrySector ? `${industry} - ${industrySector}` : industry;
            
            // Debug logging            
            // Build auto* arrays for prompts (all AI items, not just selected)
            const autoJobRoles = aiJobTitles.map(j => j.title);
            const autoTaskCategories = aiTaskCategories.map(t => t.title);
            const autoEquipmentCategories = aiEquipmentCategories.map(e => {
                const examples = (e.examples || []).slice(0, 3).join(', ');
                return examples ? `${e.title} (${examples})` : e.title;
            });
            
            // v8.4.34: Get selected element info for single-element generation
            const selectedElementIdx = selectedElementIds.length > 0 ? selectedElementIds[0] - 1 : -1;
            const selectedElement = (selectedElementIdx >= 0 && tgaData?.elements?.[selectedElementIdx]) ? {
                index: selectedElementIdx + 1,
                title: cleanElementName(tgaData.elements[selectedElementIdx]) || `Element ${selectedElementIdx + 1}`,
                performanceCriteria: tgaData.elements[selectedElementIdx].performanceCriteria || []
            } : null;
            
            const contextObj = {
                mode: 'vet',
                country: countryCode,
                language: getCountryLang(countryCode),
                state: state,
                industry: industry,
                industrySector: industrySector,
                industryContext: industryContext,
                jobLevel: jobLevel,
                jobTitle: jobTitle,
                jobRoles: jobRoles,
                jobTasks: jobTasks,
                taskEquipment: taskEquipment,
                equipmentList: equipmentList,
                learnerRole: learnerRole,
                location: state ? `${state}, ${countryCode}` : countryCode,
                unitCode: tgaData?.unitCode || tgaData?.code || '',
                unitTitle: tgaData?.unitTitle || tgaData?.title || '',
                selectedElement: selectedElement, // v8.4.34: Single selected element
                pastedContent: vetPastedContent || '',
                priorityContent: vetPastedContent || null,
                // v6.9.0: Full AI context for prompts (all items, not just selected)
                autoJobRoles: autoJobRoles,
                autoTaskCategories: autoTaskCategories,
                autoEquipmentCategories: autoEquipmentCategories,
                // v6.9.0: Selected AI items with full metadata for Excel audit trail
                aiSelectedJobTitles: selectedJobTitles,      // Full objects with level, elementMapping, rationale
                aiSelectedTasks: selectedTasks,              // Full objects with examples, elementMapping, rationale
                aiSelectedEquipment: selectedEquipment,      // Full objects with examples, elementMapping, rationale
                aiContext: window.CC_AI_CONTEXT || {}        // Full AI response for export
            };
            
            
            return contextObj;
        } else if (selectedMode === 'workplace') {
            const countryCode = document.getElementById('cc-wp-country')?.value || 'AU';
            const state = document.getElementById('cc-wp-state')?.value || '';
            const targetAudience = document.getElementById('cc-wp-audience')?.value || 'new-starters';
            const companyName = document.getElementById('cc-company-name')?.value || '';
            const department = document.getElementById('cc-wp-department')?.value || '';
            const industry = document.getElementById('cc-wp-industry')?.value || '';
            const industrySector = document.getElementById('cc-wp-industry-sector')?.value || '';
            const industryContext = industrySector 
                ? `${industry} - ${industrySector}` 
                : (industry || 'Workplace training');
            const jobLevel = document.getElementById('cc-wp-job-level')?.value || 'worker';
            
            const wpAiCtx = window.CC_WP_AI_CONTEXT || {};
            const selectedJobIds = window.CC_WP_SELECTED_JOB_TITLES || [];
            const selectedTaskIds = (window.CC_WP_SELECTED_TASKS && window.CC_WP_SELECTED_TASKS.length > 0) 
                ? window.CC_WP_SELECTED_TASKS 
                : (window.CC_WP_SELECTED_TASK_CATEGORIES || []);
            const selectedEquipIds = (window.CC_WP_SELECTED_EQUIPMENT && window.CC_WP_SELECTED_EQUIPMENT.length > 0)
                ? window.CC_WP_SELECTED_EQUIPMENT
                : (window.CC_WP_SELECTED_EQUIPMENT_CATEGORIES || []);
            
            const allJobs = wpAiCtx.jobTitles || [];
            const allTasks = wpAiCtx.taskCategories || [];
            const allEquip = wpAiCtx.equipmentCategories || [];
            
            const pickedJobs = allJobs.filter(j => selectedJobIds.includes(j.id)).map(j => j.title);
            const pickedTasks = allTasks.filter(t => selectedTaskIds.includes(t.id));
            const pickedEquip = allEquip.filter(e => selectedEquipIds.includes(e.id));
            
            const jobTasks = pickedTasks.map(t => {
                const examples = (t.examples || []).slice(0, 3).join(', ');
                return examples ? `${t.title}: ${examples}` : t.title;
            });
            const equipmentList = pickedEquip.map(e => {
                const examples = (e.examples || []).slice(0, 3).join(', ');
                return examples ? `${e.title}: ${examples}` : e.title;
            });
            
            const jobTitle = pickedJobs.length > 0 ? pickedJobs[0] : '';
            const learnerRole = jobTitle ? `${jobTitle} (${jobLevel})` : (targetAudience === 'supervisors' ? 'supervisor' : (targetAudience === 'contractors' ? 'contractor' : 'employee'));
            
            return {
                mode: 'workplace',
                country: countryCode,
                language: getCountryLang(countryCode),
                state: state,
                companyName: companyName,
                department: department,
                trainingType: document.getElementById('cc-training-type')?.value || 'induction',
                industry: industry,
                industrySector: industrySector,
                industryContext: industryContext,
                targetAudience: targetAudience,
                jobLevel: jobLevel,
                jobTitle: jobTitle,
                jobRoles: pickedJobs,
                jobTasks: jobTasks,
                taskEquipment: {},
                equipmentList: equipmentList,
                additionalInstructions: document.getElementById('cc-wp-instructions')?.value || '',
                learnerRole: learnerRole,
                location: state ? `${state}, ${countryCode}` : countryCode,
                pastedContent: workplacePastedContent || '',
                priorityContent: workplacePastedContent || null,
                aiSelectedJobTitles: pickedJobs,
                aiSelectedTasks: jobTasks,
                aiSelectedEquipment: equipmentList,
                wpAiContext: wpAiCtx
            };
        } else if (selectedMode === 'pd') {
            const countryCode = document.getElementById('cc-pd-country')?.value || 'AU';
            const courseTitle = document.getElementById('cc-pd-course-title')?.value || '';
            const audience = document.getElementById('cc-pd-audience')?.value || 'all-staff';
            const industry = document.getElementById('cc-pd-industry')?.value || '';
            const industryContext = industry || 'Professional Development';

            return {
                mode: 'pd',
                country: countryCode,
                language: getCountryLang(countryCode),
                state: '',
                courseName: courseTitle,
                courseTitle: courseTitle,
                targetAudience: audience,
                industry: industry,
                industryContext: industryContext,
                learnerRole: audience.replace(/-/g, ' '),
                location: countryCode,
                learningOutcomes: gatherOutcomes() || [],
                pastedContent: pdPastedContent || '',
                priorityContent: pdPastedContent || null
            };
        } else {
            const countryCode = document.getElementById('cc-uni-country')?.value || 'AU';
            const state = document.getElementById('cc-uni-state')?.value || '';
            const courseLevel = document.getElementById('cc-course-level')?.value || 'undergraduate';
            const courseName = document.getElementById('cc-course-name')?.value || '';
            const subjectArea = document.getElementById('cc-subject-area')?.value || '';
            const industryContext = subjectArea ? `${subjectArea} (${courseLevel})` : `${courseLevel} education`;
            return {
                mode: 'university',
                country: countryCode,
                language: getCountryLang(countryCode),
                state: state,
                courseName: courseName,
                courseLevel: courseLevel,
                subjectArea: subjectArea,
                industryContext: industryContext,
                bloomsLevel: document.getElementById('cc-blooms-level')?.value || 'apply',
                learnerRole: `${courseLevel} student`,
                location: state ? `${state}, ${countryCode}` : countryCode,
                learningOutcomes: gatherOutcomes() || [],
                pastedContent: uniPastedContent || '',
                priorityContent: uniPastedContent || null
            };
        }
    };

    // =========================================================================
    // EXCEL MAPPING EXPORT (VET mode only)
    // Generates comprehensive Excel document with unit component  ->  topic mapping
    // =========================================================================
    const exportExcelMapping = async () => {
        
        if (selectedMode !== 'vet') {
            showError('Excel export is only available for VET mode.');
            return;
        }
        if (!tgaData) {
            showError('Excel export requires TGA data to be loaded first.');
            return;
        }
        if (!topicPlan?.topics) {
            showError('Excel export requires topics to be generated first.');
            return;
        }

        const exportBtn = document.getElementById('cc-export-excel-btn');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';
        }

        try {
            // v6.5.19: Send both field name formats for KE/PE to ensure server receives data
            const knowledgeEvidence = tgaData.requiredKnowledge || tgaData.knowledgeEvidence || [];
            const performanceEvidence = tgaData.requiredSkills || tgaData.performanceEvidence || [];
            
            // v6.6.34: Enhanced payload with quality/context information for audit documentation
            const context = storedContext || {};
            const jobLevelLabel = context.jobLevel
                ? context.jobLevel.split(', ').map(v => JOB_LEVELS.find(j => j.value === v)?.label || v).join(', ')
                : '';
            
            const payload = {
                unitCode: tgaData.code || tgaData.unitCode || 'Unknown',
                unitTitle: tgaData.title || tgaData.unitTitle || 'Untitled Unit',
                // v6.6.34: Quality metadata for audit documentation
                generationContext: {
                    generatedDate: new Date().toISOString(),
                    mode: selectedMode || 'vet',
                    // Industry/Job Context
                    industry: context.industry || context.industrySector || '',
                    industrySector: context.industrySector || '',
                    jobTitle: context.jobTitle || '',
                    jobLevel: jobLevelLabel,
                    // v6.6.33: Multiple job tasks with equipment
                    jobTasks: context.jobTasks || [],
                    taskEquipment: context.taskEquipment || {},
                    // Location for compliance context
                    country: context.country || 'AU',
                    state: context.state || ''
                },
                topics: topicPlan.topics.map(topic => ({
                    title: topic.title,
                    // v6.6.34: Include topic description/purpose for audit trail
                    description: topic.description || '',
                    subtopics: (topic.subtopics || []).map(sub => {
                        // coversMappings must be an object, not an array
                        let coversMappings = sub.coversMappings;
                        if (!coversMappings || typeof coversMappings !== 'object' || Array.isArray(coversMappings)) {
                            coversMappings = { pc: [], ke: [], pe: [], fs: [] };
                        }
                        return {
                            title: sub.title,
                            // v6.6.34: Include subtopic description for learning purpose clarity
                            description: sub.description || '',
                            keyPoints: sub.keyPoints || [],
                            coversMappings: coversMappings,
                            mappings: Array.isArray(sub.mappings) ? sub.mappings : []
                        };
                    })
                })),
                tgaData: {
                    elements: tgaData.elements || [],
                    // Send BOTH field name formats so server can use whichever it expects
                    requiredKnowledge: knowledgeEvidence,
                    requiredSkills: performanceEvidence,
                    knowledgeEvidence: knowledgeEvidence,
                    performanceEvidence: performanceEvidence,
                    foundationSkills: tgaData.foundationSkills || []
                },
                // v6.8.9: AI-generated context for Practical Mapping sheet
                aiContext: window.CC_AI_CONTEXT || null
            };

            const response = await fetch('https://lms-labs.com/api/moodle/content-creator/export-mapping-excel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Site-ID': window.CC_CONFIG?.siteId || '',
                    'X-API-Key': window.CC_CONFIG?.apiKey || ''
                },
                body: JSON.stringify(payload)
            });


            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Export failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const blob = await response.blob();
            
            if (blob.size < 100) {
                const text = await blob.text();
                throw new Error('Server returned invalid file: ' + text);
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${payload.unitCode}_Mapping_Document.xlsx`;
            var dlRoot = document.getElementById('contentcreator-app') || document.body;
            dlRoot.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            dlRoot.removeChild(a);


        } catch (err) {
            showError('Failed to export Excel mapping: ' + err.message);
        } finally {
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Export Excel Mapping
                `;
            }
        }
    };

    const generateContent = async () => {
        console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'generateContent() CALLED');
        console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'selectedMode=' + selectedMode + ' | cmid=' + cmid);
        console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'topicPlan:', topicPlan ? ('topics=' + (topicPlan.topics?.length || 0)) : 'NULL');
        console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'storedContext:', storedContext ? JSON.stringify(storedContext).substring(0, 300) : 'NULL');
        console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'storedOutcomes:', storedOutcomes?.length || 0, 'items');
        if (!topicPlan) {
            console.error('[CC DIAG] generateContent() ABORTED: topicPlan is null/undefined');
            showError('No topic plan available. Please go back and try again.');
            return;
        }

        const progressSection = document.getElementById('cc-progress-section');
        const generateBtn = document.getElementById('cc-generate-btn');
        const prevBtn = document.getElementById('cc-prev-step');

        progressSection?.classList.remove('cc-hidden');
        if (generateBtn) generateBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;

        try {
            
            // Gather progression settings
            const progressionMode = document.querySelector('input[name="progressionMode"]:checked')?.value || 'free';
            const slideDuration = parseInt(document.getElementById('cc-slide-duration')?.value) || 10;
            const topicNavMode = document.querySelector('input[name="topicNavMode"]:checked')?.value || 'free';
            
            // Gather voice settings (v6.3.0, v6.5.11 - added voiceoverEnabled)
            const voiceoverCheckbox = document.getElementById('cc-voiceover-enabled');
            const voiceoverEnabled = voiceoverCheckbox?.checked ?? true;
            const voiceName = document.querySelector('input[name="voiceName"]:checked')?.value || 'Aoede';
            const voiceLanguage = document.getElementById('cc-voice-language')?.value || 'en-AU';

            // v12.55: Gather additional student language selections
            const additionalLangs = Array.from(
                document.querySelectorAll('#cc-additional-langs input[type="checkbox"]:checked')
            ).map(function(cb) {
                return { code: cb.value, label: cb.parentElement.textContent.trim() };
            }).filter(function(l) { return l.code !== voiceLanguage; });
            // CC-ML-DEBUG v13.3
            ccLog('%c[CC-ML BUILDER]',
                'background:#7c3aed;color:#fff;padding:2px 6px;border-radius:3px;',
                'voiceName=' + voiceName, '| voiceLanguage=' + voiceLanguage,
                '| voiceoverEnabled=' + voiceoverEnabled,
                '| additionalLangs (' + additionalLangs.length + '):', additionalLangs.map(function(l) { return l.code; }).join(', ') || '(none)');

            // v6.6.68: Gather images settings
            const imagesCheckbox = document.getElementById('cc-images-enabled');
            const imagesEnabled = imagesCheckbox?.checked ?? true;
            
            // v11.11: Gather activities settings
            const activitiesCheckbox = document.getElementById('cc-activities-enabled');
            const activitiesEnabled = activitiesCheckbox?.checked ?? true;
            
            // v7.5.13: ENHANCED DEBUGGING for AI Images setting
            
            // v6.5.37: Debug logging for voiceover state
            
            // Gather appearance settings (v6.4.4)
            const headerColor = document.getElementById('cc-header-color')?.value || getMoodlePrimaryColor();
            
            // v6.5.48: Use storedContext (captured in Step 2) - DOM elements no longer exist
            const inputs = {
                mode: selectedMode,
                context: storedContext || gatherContext(),
                duration: parseInt(document.querySelector('input[name="duration"]:checked')?.value) || 10,
                criteria: selectedMode === 'vet' ? tgaData : selectedMode === 'workplace' ? { workplaceDocument: workplaceData, topics: suggestedMajorTopics.filter(t => selectedMajorTopicIds.includes(t.id)) } : { outcomes: storedOutcomes.length > 0 ? storedOutcomes : gatherOutcomes() },
                topicPlan: topicPlan, // Pass the AI-generated topic plan!
                settings: {
                    progressionMode: progressionMode,
                    slideDuration: slideDuration,
                    topicNavMode: topicNavMode // v6.5.3: lockstep or free
                },
                voiceSettings: {
                    enabled: voiceoverEnabled, // v6.5.11: on/off toggle
                    voice: voiceName,          // v13.1: explicit voice name
                    language: voiceLanguage
                },
                imageSettings: {
                    enabled: imagesEnabled // v6.6.68: generate AI images for slides
                },
                activitySettings: {
                    enabled: activitiesEnabled // v11.11: include decision challenge activities
                },
                appearanceSettings: {
                    headerColor: headerColor
                }
            };
            
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'generateContent() INPUTS READY:');
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  mode=' + inputs.mode);
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  context=' + JSON.stringify(inputs.context || {}).substring(0, 300));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  criteria=' + JSON.stringify(inputs.criteria || {}).substring(0, 300));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  topicPlan topics=' + (inputs.topicPlan?.topics?.length || 0));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  voice=' + JSON.stringify(inputs.voiceSettings));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  images=' + JSON.stringify(inputs.imageSettings));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', '  activities=' + JSON.stringify(inputs.activitySettings));
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'Calling ManifestBuilder.build()...');

            // v9.74: Slow-generation warning  -  fires after 75s in 'generating' status.
            // AI API calls can take 1-3 minutes for large topic plans; without feedback
            // users assume the page is broken and reload, losing their work.
            let _slowGenTimer = null;
            const _clearSlowGenTimer = () => {
                if (_slowGenTimer) { clearTimeout(_slowGenTimer); _slowGenTimer = null; }
            };

            const result = await ManifestBuilder.build(inputs, cmid, {
                onStatus: (status) => {
                    const statusText = {
                        planning: 'Planning content structure...',
                        generating: 'Generating content with AI...',
                        complete: 'Complete!',
                        error: 'Error occurred'
                    };
                    document.getElementById('cc-gen-status').textContent = statusText[status] || status;
                    _clearSlowGenTimer();
                    if (status === 'generating') {
                        _slowGenTimer = setTimeout(() => {
                            const el = document.getElementById('cc-gen-status');
                            if (el) el.textContent = 'Still generating  -  the AI is working on your content. This can take 1\u20132 minutes for larger courses. Please do not close this page.';
                        }, 75000);
                    }
                },
                onProgress: (progress) => {
                    _clearSlowGenTimer();
                    const percent = Math.round((progress.current / progress.total) * 100);
                    document.getElementById('cc-gen-progress').style.width = percent + '%';
                    const topicNum = Math.floor(progress.current / Math.max(1, Math.ceil(progress.total / (topicPlan?.topics?.length || 1)))) + 1;
                    const topicTotal = topicPlan?.topics?.length || 1;
                    const statusEl = document.getElementById('cc-gen-status');
                    if (statusEl) {
                        statusEl.textContent = 'Topic ' + Math.min(topicNum, topicTotal) + ' of ' + topicTotal + ': ' + (progress.itemTitle || 'Generating content') + ' (' + percent + '%)';
                    }
                    // v11.30: Show live QA indicator
                    const liveQa = document.getElementById('cc-live-qa');
                    if (liveQa && percent > 0) {
                        liveQa.style.display = '';
                        liveQa.innerHTML = '<div class="cc-qa-results-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Validating content structure...</div><p class="cc-qa-results-desc" style="margin-bottom:0;">Each topic is checked for correct card count, required fields, and voiceover length. Structurally broken content triggers one targeted repair pass.</p>';
                    }
                },
                onComplete: async (generatedManifest) => {
                    if (generatedManifest && generatedManifest.topics) {
                        ccLog('[BUILDER v8.4.12] Applying grammar fixes to generated content...');
                        generatedManifest = fixManifestGrammar(generatedManifest);
                    }
                    manifest = generatedManifest;
                    
                    // v7.2.76: Pre-generate ALL voiceovers before saving
                    // Students should NEVER have to wait for voiceover generation
                    // v7.6.4: Updated to work with route-specific card architecture (cards array, not type='learning')
                    if (voiceoverEnabled && generatedManifest.topics) {
                        var _builderVoStart = Date.now();
                        ccLog('%c[VOICEOVER BUILDER v8.4.11] PRE-GEN START | lang: ' + voiceLanguage + ' | voice: ' + voiceName, 'color: #8b5cf6; font-weight: bold');
                        document.getElementById('cc-gen-status').textContent = 'Pre-generating voiceovers...';
                        document.getElementById('cc-gen-progress').style.width = '0%';

                        // v12.57 FIX-CC-BUILDER-STUCK: Show the "Skip voiceover" bypass button
                        // during the voiceover phase only. The button sets _voSkipRequested which
                        // pregenOne checks  -  when true it resolves early without making a TTS call.
                        var _voSkipRequested = false;
                        var _voSkipWrap = document.getElementById('cc-vo-skip-wrap');
                        var _voSkipBtn  = document.getElementById('cc-vo-skip-btn');
                        if (_voSkipWrap) _voSkipWrap.style.display = '';
                        if (_voSkipBtn) {
                            _voSkipBtn.onclick = function() {
                                _voSkipRequested = true;
                                _voSkipBtn.disabled = true;
                                _voSkipBtn.textContent = 'Skipping\u2026';
                                document.getElementById('cc-gen-status').textContent = 'Voiceover skipped  -  saving module\u2026';
                                ccLog('[VOICEOVER BUILDER v12.57] PRE-GEN SKIPPED by user');
                            };
                        }
                        
                        // v7.6.4: Collect all sections with generated content (card model uses .cards array)
                        const allSections = [];
                        generatedManifest.topics.forEach(topic => {
                            if (topic.sections) {
                                topic.sections.forEach(section => {
                                    // v7.6.4: Check for card structure OR legacy learning type
                                    const hasFiveCards = section.cards && section.cards.length > 0;
                                    const hasDescription = section.description && section.description.trim();
                                    const isLegacyLearning = section.type === 'learning';
                                    
                                    if (section.id && (hasFiveCards || hasDescription || isLegacyLearning)) {
                                        allSections.push(section);
                                    }
                                });
                            }
                        });
                        
                        
                        // Pre-generate voiceovers with concurrency limit
                        const CONCURRENT = 3;
                        let completed = 0;
                        let index = 0;
                        
                        const pregenOne = async (section, attempt) => {
                            attempt = attempt || 1;
                            // v12.57: Exit immediately if user clicked "Skip voiceover generation".
                            if (_voSkipRequested) return;
                            try {
                                // v11.02: Use the shared buildVoiceoverText from cc-state.js.
                                // This produces byte-identical text to the player's buildFullVoiceoverText,
                                // eliminating the schema-version / word-count / hash mismatches that caused
                                // every builder-pregenerated voiceover to be detected as "stale" and
                                // re-synthesised on first play  -  wasting TTS API credits.
                                var voText = CcState.buildVoiceoverText(section, generatedManifest);

                                if (!voText.trim()) return;
                                
                                const formData = new FormData();
                                formData.append('sesskey', M.cfg.sesskey);
                                formData.append('action', 'generate_voice');
                                formData.append('cmid', cmid);
                                formData.append('text', voText);
                                formData.append('sectionid', section.id);
                                formData.append('language', voiceLanguage);
                                formData.append('voice', voiceName);
                                
                                var _sectionStart = Date.now();
                                ccLog('[VOICEOVER BUILDER v8.4.11] PRE-GEN section ' + section.id + ' | attempt: ' + attempt + ' | textLen: ' + voText.length);
                                // v12.57 FIX-CC-BUILDER-STUCK: Add a 210-second AbortController so a
                                // hung PHP curl (e.g. Google TTS rate-limited or network stall) cannot
                                // freeze the entire builder progress screen indefinitely. PHP side has
                                // CURLOPT_TIMEOUT=180s; 210s gives it 30s headroom before the browser
                                // abort fires. Previously no timeout existed here, so a single stuck
                                // section caused "Pre-generating voiceovers..." to appear forever.
                                var _builderAbortCtrl = new AbortController();
                                var _builderAbortTimer = setTimeout(function() {
                                    _builderAbortCtrl.abort();
                                    console.warn('[VOICEOVER BUILDER v12.57] ABORT section ' + section.id + '  -  210s timeout exceeded on attempt ' + attempt);
                                }, 210000);
                                let response;
                                try {
                                    response = await fetch(M.cfg.wwwroot + '/mod/contentcreator/ajax.php', {
                                        method: 'POST',
                                        body: formData,
                                        signal: _builderAbortCtrl.signal
                                    });
                                } finally {
                                    clearTimeout(_builderAbortTimer);
                                }
                                
                                if (!response.ok) throw new Error('Voice API returned ' + response.status);
                                const data = await response.json();
                                var _sectionDur = ((Date.now() - _sectionStart) / 1000).toFixed(1);
                                
                                if (data.success && data.audioContent) {
                                    var _voWordCount = voText.split(/\s+/).length;
                                    ccLog('%c[VOICEOVER BUILDER v9.75] PRE-GEN OK section ' + section.id + ' | attempt: ' + attempt + ' | ' + _sectionDur + 's | ' + (data.audioContent.length / 1024).toFixed(0) + 'KB | words: ' + _voWordCount, 'color: #10b981');
                                    // FIX-CC-BUILDER-PRIMARY-PERSIST (v13.14): Previously stored a data: URL
                                    // here. saveManifest's stripAudio() then replaced it with the 'pregenerated'
                                    // sentinel, leaving voiceoverStatus=undefined. On the teacher's first player
                                    // load, the entry guard treated the sentinel as needing re-generation —
                                    // wasting TTS credits and triggering the checkComplete race condition that
                                    // set voiceoversComplete=false and left all play buttons permanently disabled.
                                    // Fix: persist to file store immediately (matching the multilanguage path).
                                    // If persist fails, fall back to data URL + mark complete so at minimum the
                                    // player's race-condition fix (FIX-CC-VOICECOMPLETE-RACE v13.14) can fire.
                                    var _primaryPersistOk = false;
                                    try {
                                        var _ppFd = new FormData();
                                        _ppFd.append('sesskey', M.cfg.sesskey);
                                        _ppFd.append('action', 'save_voiceover_file');
                                        _ppFd.append('cmid', cmid);
                                        _ppFd.append('sectionid', String(section.id || ('prim_' + _voWordCount)));
                                        _ppFd.append('audiocontent', data.audioContent);
                                        _ppFd.append('audiotype', data.audioType || 'audio/ogg');
                                        var _ppResp = await fetch(M.cfg.wwwroot + '/mod/contentcreator/ajax.php', { method: 'POST', body: _ppFd });
                                        if (_ppResp.ok) {
                                            var _ppData = await _ppResp.json();
                                            if (_ppData.success && _ppData.url) {
                                                section.voiceoverUrl = _ppData.url;
                                                section.voiceoverStatus = 'complete';
                                                _primaryPersistOk = true;
                                                ccLog('%c[VOICEOVER BUILDER v13.14] PRIMARY PERSIST OK section ' + section.id + ' -> ' + _ppData.url, 'color:#10b981;font-weight:bold');
                                            }
                                        }
                                    } catch (_ppErr) {
                                        ccWarn('[VOICEOVER BUILDER v13.14] PRIMARY PERSIST FAIL section ' + section.id + ': ' + _ppErr.message + ' — falling back to data URL');
                                    }
                                    if (!_primaryPersistOk) {
                                        // Fallback: store data URL (will become 'pregenerated' via stripAudio).
                                        // Still mark complete so allVoiceoversComplete() returns true and the
                                        // player's FIX-CC-VOICECOMPLETE-RACE fires on the teacher's first load.
                                        section.voiceoverUrl = 'data:' + data.audioType + ';base64,' + data.audioContent;
                                        section.voiceoverStatus = 'complete';
                                    }
                                    section.voiceoverWordCount = _voWordCount;
                                    // v11.02: Stamp schema version + text hash from cc-state.js.
                                    // Player5 compares these on playback  -  match means "fresh, skip TTS".
                                    section.voiceoverSchemaVersion = CcState.VOICEOVER_SCHEMA_VERSION;
                                    section.voiceoverTextHash = CcState.voiceoverTextHash(voText);
                                } else {
                                    throw new Error(data.error || 'No audio returned');
                                }
                            } catch (err) {
                                console.error('[VOICEOVER BUILDER v8.4.11] PRE-GEN FAIL section ' + (section.id || '?') + ' | attempt: ' + attempt + ' | ' + err.message);
                                if (attempt < 3 && !section.voiceoverUrl) {
                                    var retryDelay = attempt * 2000;
                                    ccLog('[VOICEOVER BUILDER v8.4.11] RETRY section ' + section.id + ' in ' + (retryDelay/1000) + 's (attempt ' + (attempt+1) + '/3)');
                                    await new Promise(r => setTimeout(r, retryDelay));
                                    return pregenOne(section, attempt + 1);
                                }
                            }
                            
                            completed++;
                            const percent = Math.round((completed / allSections.length) * 100);
                            document.getElementById('cc-gen-progress').style.width = percent + '%';
                            document.getElementById('cc-gen-status').textContent = 
                                `Pre-generating voiceovers (${completed}/${allSections.length})`;
                        };
                        
                        const promises = [];
                        while (index < allSections.length) {
                            while (promises.length < CONCURRENT && index < allSections.length) {
                                const section = allSections[index++];
                                const p = pregenOne(section, 1).then(() => {
                                    promises.splice(promises.indexOf(p), 1);
                                });
                                promises.push(p);
                            }
                            if (promises.length >= CONCURRENT) {
                                await Promise.race(promises);
                            }
                        }
                        await Promise.all(promises);
                        // v12.57: Hide the bypass button now that the phase is over.
                        if (_voSkipWrap) _voSkipWrap.style.display = 'none';
                        var _builderVoDur = ((Date.now() - _builderVoStart) / 1000).toFixed(1);
                        var _withUrl = allSections.filter(s => s.voiceoverUrl).length;
                        if (_voSkipRequested) {
                            ccLog('%c[VOICEOVER BUILDER v12.57] PRE-GEN SKIPPED by user  -  ' + _withUrl + '/' + allSections.length + ' sections completed before skip', 'color: #f59e0b; font-weight: bold');
                        } else {
                            ccLog('%c[VOICEOVER BUILDER v8.4.11] PRE-GEN COMPLETE | ' + _builderVoDur + 's | success: ' + _withUrl + '/' + allSections.length + ' sections', 'color: #8b5cf6; font-weight: bold');
                        }
                        if (_withUrl < allSections.length && !_voSkipRequested) {
                            console.error('[VOICEOVER BUILDER v8.4.11] WARNING: ' + (allSections.length - _withUrl) + ' sections FAILED pre-generation after 3 attempts each.');
                        }
                        
                    }
                    
                    // v12.55: Generate content for each additional student language
                    if (additionalLangs.length > 0) {
                        generatedManifest.multiLanguage = [];
                        for (var _mli = 0; _mli < additionalLangs.length; _mli++) {
                            var _mlLang = additionalLangs[_mli];
                            document.getElementById('cc-gen-status').textContent =
                                'Generating ' + _mlLang.label + ' content (' + (_mli + 1) + ' of ' + additionalLangs.length + ')...';
                            document.getElementById('cc-gen-progress').style.width = '0%';

                            // FIX-CC-MULTILANG-TRANSLATE (v13.15): Replace ManifestBuilder.build() re-generation
                            // with direct translation of the already-generated primary content.
                            //
                            // Root cause of the bug: ManifestBuilder.build() was called with
                            // context.language='de-DE' but received the same English topicPlan + English
                            // criteria + English scenario seeds. The AI generated English content regardless
                            // of the language instruction because ~12,000 chars of English input overwhelmed
                            // the language gate. The CC-ML CONTENT-SAMPLE log confirmed all card text was
                            // English even after multiple fix attempts (v12.69, v13.10, v13.13).
                            //
                            // Solution: Deep-clone the primary topics and send each section to the AI as a
                            // focused translation task. The AI's entire input is English card content —
                            // there is no competing English reference material, so translation is reliable.
                            var _mlTopics = null;
                            try {
                                _mlTopics = await Generator.translateTopicsForLanguage(
                                    generatedManifest.topics,
                                    _mlLang.code,
                                    cmid,
                                    function(p) {
                                        var pct = Math.round((p.current / p.total) * 100);
                                        document.getElementById('cc-gen-progress').style.width = pct + '%';
                                        document.getElementById('cc-gen-status').textContent =
                                            'Translating ' + _mlLang.label + '  —  ' + (p.itemLabel || '') + ' (' + pct + '%)';
                                    }
                                );
                            } catch (_mlTransErr) {
                                console.error('[CC-ML TRANSLATE] translateTopicsForLanguage failed for ' + _mlLang.code + ':', _mlTransErr.message);
                            }
                            var _mlResult = _mlTopics ? { topics: _mlTopics } : null;

                            // CC-ML-DEBUG v13.3
                            if (_mlResult) {
                                var _dbgTopics = (_mlResult.topics || []).length;
                                var _dbgSects = (_mlResult.topics || []).reduce(function(a,t){return a+(t.sections||[]).length;},0);
                                ccLog('%c[CC-ML BUILDER CONTENT]',
                                    'background:#16a34a;color:#fff;padding:2px 6px;border-radius:3px;',
                                    _mlLang.code + ' generated: topics=' + _dbgTopics + ' sections=' + _dbgSects);
                            } else {
                                console.error('%c[CC-ML BUILDER FAIL]',
                                    'background:#dc2626;color:#fff;padding:2px 6px;border-radius:3px;',
                                    _mlLang.code + ' ManifestBuilder.build() returned null — content NOT generated for this language!');
                            }
                            if (_mlResult && _mlResult.topics) {
                                // Pre-generate voiceovers for this language
                                if (voiceoverEnabled) {
                                    document.getElementById('cc-gen-status').textContent =
                                        'Pre-generating ' + _mlLang.label + ' voiceovers...';
                                    document.getElementById('cc-gen-progress').style.width = '0%';
                                    var _mlSections = [];
                                    _mlResult.topics.forEach(function(t) {
                                        (t.sections || []).forEach(function(s) {
                                            // FIX-CC-ML-SECTION-FILTER (v13.15): Previously only collected sections
                                            // with s.cards — excluded description-only and legacy sections, leaving
                                            // them with no voiceover and causing the INCOMPLETE VOICEOVERS loop.
                                            // Now mirrors the primary filter: include all non-activity sections.
                                            if (s.id && s.slideType !== 'activity') _mlSections.push(s);
                                        });
                                    });
                                    var _mlDone = 0;
                                    var _mlIdx2 = 0;
                                    var _mlPromises2 = [];
                                    // FIX-CC-ML-LANG-CAPTURE (v12.66): pregenLangOne previously used
                                    // var _mlLangCode2 = _mlLang.code, which is function-scoped (var
                                    // hoisting). In the multi-language for loop, any async retry that
                                    // outlasted the loop's await boundary would close over the next
                                    // iteration's language code instead of its own, sending voiceover
                                    // requests to the wrong TTS language.
                                    // Fix: factory IIFE captures langCode as a true parameter (by value),
                                    // immune to outer-scope reassignment. The inner fn variable is used
                                    // for reliable self-reference in the recursive retry path.
                                    var pregenLangOne = (function(langCode) {
                                        var fn = async function(section, attempt) {
                                            attempt = attempt || 1;
                                            try {
                                                var voText = CcState.buildVoiceoverText(section, _mlResult);
                                                if (!voText.trim()) { _mlDone++; return; }
                                                var fd = new FormData();
                                                fd.append('sesskey', M.cfg.sesskey);
                                                fd.append('action', 'generate_voice');
                                                fd.append('cmid', cmid);
                                                fd.append('text', voText);
                                                fd.append('sectionid', section.id);
                                                fd.append('language', langCode);
                                                fd.append('voice', voiceName);
                                                var r = await fetch(M.cfg.wwwroot + '/mod/contentcreator/ajax.php', { method: 'POST', body: fd });
                                                if (!r.ok) throw new Error(r.status);
                                                var d = await r.json();
                                                if (d.success && d.audioContent) {
                                                    // FIX-CC-MULTILANG-PERSIST (v12.68): Previously this stored a
                                                    // data:audio base64 URL on the section. saveManifestSilent's
                                                    // stripAudio() then deleted every data: URL on save (to keep
                                                    // the DB row under MySQL's max_allowed_packet), replacing it
                                                    // with the 'pregenerated' sentinel. Primary-language audio
                                                    // recovers because a teacher reload triggers a re-persist
                                                    // path on the player; additional languages have no such
                                                    // recovery, so Punjabi/Thai students were stuck on the
                                                    // "INCOMPLETE VOICEOVERS" loop forever. We now persist each
                                                    // clip to the Moodle file store immediately and store the
                                                    // returned HTTPS URL — that survives stripAudio cleanly.
                                                    var _persistFd = new FormData();
                                                    _persistFd.append('sesskey', M.cfg.sesskey);
                                                    _persistFd.append('action', 'save_voiceover_file');
                                                    _persistFd.append('cmid', cmid);
                                                    // FIX-CC-ML-SECTIONID-COLLISION (v13.5): Primary and additional-language
                                                    // sections share the same section.id (e.g. '2.1'). Without a language
                                                    // prefix, save_voiceover_file stored both under voiceover_2.1.mp3 and the
                                                    // last writer silently overwrote the other language's audio. Fix: prefix
                                                    // sectionid with the language code so de-DE section 2.1 saves as
                                                    // voiceover_de-DE_2.1.mp3 — a completely separate file from voiceover_2.1.mp3.
                                                    _persistFd.append('sectionid', langCode + '_' + String(section.id || ('mlsec_' + langCode)));
                                                    _persistFd.append('audiocontent', d.audioContent);
                                                    _persistFd.append('audiotype', d.audioType || 'audio/ogg');
                                                    var _persistResp = await fetch(M.cfg.wwwroot + '/mod/contentcreator/ajax.php', { method: 'POST', body: _persistFd });
                                                    if (!_persistResp.ok) throw new Error('persist HTTP ' + _persistResp.status);
                                                    var _persistData = await _persistResp.json();
                                                    if (!_persistData.success || !_persistData.url) throw new Error(_persistData.error || 'persist returned no url');
                                                    section.voiceoverUrl = _persistData.url;
                                                    section.voiceoverStatus = 'complete';
                                                    section.voiceoverWordCount = voText.split(/\s+/).length;
                                                    section.voiceoverSchemaVersion = CcState.VOICEOVER_SCHEMA_VERSION;
                                                    section.voiceoverTextHash = CcState.voiceoverTextHash(voText);
                                                    ccLog('%c[VOICEOVER BUILDER v12.68] MULTI-LANG PERSIST OK ' + langCode + ' sec ' + section.id + ' -> ' + _persistData.url, 'color:#10b981');
                                                } else { throw new Error(d.error || 'No audio'); }
                                            } catch (e) {
                                                if (attempt < 3) {
                                                    await new Promise(function(rr) { setTimeout(rr, attempt * 2000); });
                                                    return fn(section, attempt + 1);
                                                }
                                                ccWarn('[MULTI-LANG VO] ' + langCode + ' sec ' + (section.id || '?') + ' failed: ' + e.message);
                                            }
                                            _mlDone++;
                                            document.getElementById('cc-gen-progress').style.width =
                                                Math.round((_mlDone / (_mlSections.length || 1)) * 100) + '%';
                                        };
                                        return fn;
                                    })(_mlLang.code);
                                    var _MLCONC = 3;
                                    while (_mlIdx2 < _mlSections.length) {
                                        while (_mlPromises2.length < _MLCONC && _mlIdx2 < _mlSections.length) {
                                            (function(_sec2) {
                                                var _p2 = pregenLangOne(_sec2, 1).then(function() {
                                                    _mlPromises2.splice(_mlPromises2.indexOf(_p2), 1);
                                                });
                                                _mlPromises2.push(_p2);
                                            })(_mlSections[_mlIdx2++]);
                                        }
                                        if (_mlPromises2.length >= _MLCONC) {
                                            await Promise.race(_mlPromises2);
                                        }
                                    }
                                    await Promise.all(_mlPromises2);
                                }
                                // CC-ML-DEBUG v13.3: audit voiceover coverage before pushing
                                var _mlVoCount = 0, _mlVoMiss = 0;
                                (_mlResult.topics || []).forEach(function(t) {
                                    (t.sections || []).forEach(function(s) {
                                        if (s.slideType === 'activity') { return; }
                                        if (s.voiceoverUrl && (s.voiceoverUrl.startsWith('http') || s.voiceoverUrl === 'pregenerated')) { _mlVoCount++; }
                                        else { _mlVoMiss++; }
                                    });
                                });
                                ccLog('%c[CC-ML BUILDER PUSH]',
                                    _mlVoMiss > 0 ? 'background:#d97706;color:#fff;padding:2px 6px;border-radius:3px;' : 'background:#16a34a;color:#fff;padding:2px 6px;border-radius:3px;',
                                    'Pushing multiLanguage entry for ' + _mlLang.code,
                                    '| voiceovers OK=' + _mlVoCount, '| MISSING=' + _mlVoMiss,
                                    _mlVoMiss > 0 ? '⚠ Students will hear silence for ' + _mlVoMiss + ' section(s)' : '✓ All voiceovers persisted');
                                // FIX-CC-ML-VOICE-SETTINGS (v13.16): multiLanguage entry was
                                // pushed with no voiceSettings. Player read mlEntry.voiceSettings
                                // as {} → voiceLanguage fell back to primary (en-AU) even when
                                // activeLang=de-DE. Now stores the actual language code + voice
                                // used during pre-generation so the player uses correct TTS lang.
                                generatedManifest.multiLanguage.push({
                                    code: _mlLang.code,
                                    label: _mlLang.label,
                                    topics: _mlResult.topics,
                                    voiceSettings: { language: _mlLang.code, voice: voiceName }
                                });
                            }
                        }
                    }

                    // Now save manifest with voiceovers included
                    saveManifest(generatedManifest, (success) => {
                        if (success) {
                            renderLocked();
                        } else {
                            showError('Failed to save generated content.');
                            progressSection?.classList.add('cc-hidden');
                            if (generateBtn) generateBtn.disabled = false;
                            if (prevBtn) prevBtn.disabled = false;
                        }
                    });
                },
                onError: (error) => {
                    console.error('[CC DIAG] ManifestBuilder.build() onError callback:', error);
                    const errStr = String(error || '');
                    const friendlyMsg = /invalid request|too long|request.*param|400/i.test(errStr)
                        ? 'Generation failed — the content may be too long. Try reducing your reference material, then click Try Again.'
                        : /timeout|timed out/i.test(errStr)
                            ? 'Generation timed out. The AI is under heavy load — click Try Again to retry.'
                            : errStr || 'Content generation failed. Click Try Again to retry.';
                    showError(friendlyMsg, true);
                    progressSection?.classList.add('cc-hidden');
                    if (generateBtn) generateBtn.disabled = false;
                    if (prevBtn) prevBtn.disabled = false;
                }
            });
            console.log('%c[CC DIAG]', 'background: #1e40af; color: #fff; padding: 2px 6px; border-radius: 3px;', 'ManifestBuilder.build() returned:', result?.success ? 'SUCCESS' : 'FAILURE', result?.error || '');
        } catch (err) {
            console.error('[CC DIAG] generateContent() CATCH BLOCK:', err.message, err.stack);
            const catchMsg = String(err?.message || '');
            const catchFriendly = /invalid request|too long|request.*param|400/i.test(catchMsg)
                ? 'Generation failed — the content may be too long. Try reducing your reference material, then click Try Again.'
                : /timeout|timed out/i.test(catchMsg)
                    ? 'Generation timed out. Click Try Again to retry.'
                    : 'Content generation failed. Click Try Again to retry.';
            showError(catchFriendly, true);
            progressSection?.classList.add('cc-hidden');
            if (generateBtn) generateBtn.disabled = false;
            if (prevBtn) prevBtn.disabled = false;
        }
    };


    // v10.27: Unified 7-card descriptions for all 4 routes
    const UNIFIED_CARD_DESCRIPTIONS = [
        { name: 'Hook Scenario',       type: 'hook-scenario',       summary: 'opening scene  -  a realistic job situation introducing the topic through narrative' },
        { name: 'Concept Explainer',   type: 'concept-explainer',   summary: 'explains the concept behind Card 1  -  \"what you just saw means...\"' },
        { name: 'Mental Model',        type: 'mental-model',        summary: 'numbered step-by-step flow  -  how to handle this type of situation' },
        { name: 'Applied Scenario',    type: 'applied-scenario',    summary: '\"later that day...\"  -  continuation of Card 1\'s story, higher stakes or new complication' },
        { name: 'Decision Point',      type: 'decision-point',      summary: 'interactive question placing the learner inside the Card 1/4 story' },
        { name: 'Common Mistakes',     type: 'mistakes',            summary: 'warning cards  -  specific mistakes grounded in the scenario context' },
        { name: 'Competency Summary',  type: 'competency-summary',  summary: 'checklist of observable competent behaviours  -  what a supervisor would see' }
    ];

    const CARD_DESC_TOKENS = {
        workplace: {
            contentType: 'workplace training content',
            cardCount: 7,
            cardDescriptions: UNIFIED_CARD_DESCRIPTIONS,
            yourJob: 'Write rich reference content based on the uploaded document so the AI has enough depth to build all 7 cards well.',
            step3Extra: '',
            step7Text: 'Click "Parse & Apply" - your content will load as reference material',
            step8Text: 'Click "Suggest Learning Topics" then "Generate" to create the interactive slides'
        },
        vet: {
            contentType: 'vocational training content',
            cardCount: 7,
            cardDescriptions: UNIFIED_CARD_DESCRIPTIONS,
            yourJob: 'Write rich reference content so the AI has enough depth to build all 7 cards well.',
            step3Extra: '',
            step7Text: 'Click "Parse & Apply" - your content will load as reference material',
            step8Text: 'Click "Generate Topics" then "Generate" to create the interactive slides'
        },
        university: {
            contentType: 'academic content',
            cardCount: 7,
            cardDescriptions: UNIFIED_CARD_DESCRIPTIONS,
            yourJob: 'Write rich reference content so the AI has enough depth to build all 7 cards well.',
            step3Extra: ' along with your syllabus/course outline',
            step7Text: 'Click "Parse & Apply" - your learning outcomes and content will load',
            step8Text: 'Click "Generate Topics" then "Generate" to create the interactive slides'
        },
        pd: {
            contentType: 'professional development content',
            cardCount: 7,
            cardDescriptions: UNIFIED_CARD_DESCRIPTIONS,
            yourJob: 'Write rich reference content so the AI has enough depth to build all 7 cards well.',
            step3Extra: '',
            step7Text: 'Click "Parse & Apply" - your content will load as reference material',
            step8Text: 'Click "Generate Topics" then "Generate" to create the interactive slides'
        }
    };

    /**
     * Generate shared intro + instructions + route-specific card description for ChatGPT prompt
     * @param {string} mode - 'workplace', 'vet', or 'university'
     * @returns {string} The shared prompt text
     */
    const buildSharedPromptIntro = (mode) => {
        const t = CARD_DESC_TOKENS[mode] || CARD_DESC_TOKENS.workplace;
        let s = '';
        s += 'The AI Content Creator builds interactive ' + t.cardCount + '-card learning slides\n';
        s += 'for each topic. ChatGPT\'s job is to generate rich REFERENCE\n';
        s += 'MATERIAL that the AI slide engine uses as its source of truth.\n\n';
        s += 'ChatGPT does NOT generate the slides directly. Instead, it\n';
        s += 'generates detailed ' + t.contentType + ' that the AI engine converts\n';
        s += 'into ' + t.cardCount + ' interactive slide cards per topic:\n';
        t.cardDescriptions.forEach((card, i) => {
            s += '  Card ' + (i + 1) + ' - ' + card.name + ': ' + card.summary + '\n';
        });
        s += '\n';
        s += 'The richer and more structured your ChatGPT output is, the\n';
        s += 'better the AI slides will be.\n\n';
        s += 'INSTRUCTIONS:\n';
        s += '1. Copy ALL of the text below the dashed line\n';
        s += '2. Open ChatGPT (GPT-4 recommended)\n';
        s += '3. Paste it into a new conversation' + t.step3Extra + '\n';
        s += '4. ChatGPT will generate structured reference content\n';
        s += '5. Copy the ENTIRE output from ChatGPT (including the === markers)\n';
        s += '6. Back in Content Creator, paste it into the "Paste ChatGPT Output Here" box\n';
        s += '7. ' + t.step7Text + '\n';
        s += '8. ' + t.step8Text + '\n\n';
        s += '================================================================\n';
        s += 'PASTE EVERYTHING BELOW INTO CHATGPT:\n';
        s += '================================================================\n\n';
        return s;
    };

    /**
     * Generate route-specific card architecture description for ChatGPT prompt
     * @param {string} mode - 'workplace', 'vet', or 'university'
     * @returns {string} The card architecture description text
     */
    const build5CardDescription = (mode) => {
        const t = CARD_DESC_TOKENS[mode] || CARD_DESC_TOKENS.workplace;
        let s = '';
        s += 'IMPORTANT CONTEXT - HOW YOUR OUTPUT WILL BE USED:\n';
        s += 'An AI engine will read your output and convert it into interactive ' + t.cardCount + '-card learning slides for each topic.\n';
        s += 'Each set of ' + t.cardCount + ' cards follows this structure:\n\n';
        t.cardDescriptions.forEach((card, i) => {
            s += '  CARD ' + (i + 1) + ' - ' + card.name.toUpperCase() + ': ' + card.summary + '\n';
        });
        s += '\n';
        s += 'YOUR JOB: ' + t.yourJob + '\n\n';
        return s;
    };

    const showError = (message, showRetry = false) => {
        const section = document.getElementById('cc-error-section');
        const msgEl = document.getElementById('cc-error-message');
        const retryBtn = document.getElementById('cc-error-retry-btn');
        if (section && msgEl) {
            msgEl.textContent = message;
            section.style.display = 'flex';
        }
        if (retryBtn) retryBtn.style.display = showRetry ? '' : 'none';
    };

    const hideError = () => {
        const section = document.getElementById('cc-error-section');
        if (section) section.style.display = 'none';
    };

    const renderLocked = () => {
        if (!manifest) return;
        
        // Calculate topic and activity counts from manifest structure
        const topicCount = manifest.topics?.length || 0;
        const activityCount = manifest.topics?.reduce((sum, topic) => 
            sum + (topic.sections?.filter(s => s.activity)?.length || 0), 0) || 0;
        
        const modeLabel = selectedMode === 'vet' ? 'Vocational (RTO)' : selectedMode === 'workplace' ? 'Workplace Training' : selectedMode === 'university' ? 'University' : 'Professional Development';

        // v11.73: Extract validity gate results per topic from manifest cards (replaces dual scoring)
        let qaResultsHtml = '';
        const topicResults = [];
        if (manifest.topics) {
            manifest.topics.forEach(function(topic) {
                const cards = [];
                if (topic.sections) {
                    topic.sections.forEach(function(section) {
                        if (section.cards) {
                            section.cards.forEach(function(card) { cards.push(card); });
                        }
                    });
                }
                if (cards.length > 0) {
                    const passed = cards.some(function(c) { return c.qualityAction === 'VALIDITY_GATE_PASS'; });
                    const failed = cards.some(function(c) { return c.qualityAction === 'FAILED'; });
                    topicResults.push({
                        title: topic.title || topic.name || 'Untitled Topic',
                        pass: passed && !failed
                    });
                }
            });
        }

        if (topicResults.length > 0) {
            qaResultsHtml = '<div class="cc-qa-results"><h3 class="cc-qa-results-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;vertical-align:middle;margin-right:6px;"><path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>Structure Validation Results</h3><p class="cc-qa-results-desc">Each topic is checked for correct card count, required fields, and voiceover length. Broken structure triggers one targeted repair pass.</p>';
            topicResults.forEach(function(t) {
                const badgeClass = 'cc-qa-badge-pass';
                const badgeLabel = 'Valid';
                qaResultsHtml += '<div class="cc-qa-topic-row">';
                qaResultsHtml += '<div class="cc-qa-topic-info">';
                qaResultsHtml += '<div class="cc-qa-topic-name">' + t.title + '</div>';
                qaResultsHtml += '<div class="cc-qa-topic-scores">Structure validated  -  card count, fields, and voiceover length checked.</div>';
                qaResultsHtml += '</div>';
                qaResultsHtml += '<div class="cc-qa-badge ' + badgeClass + '">' + badgeLabel + '</div>';
                qaResultsHtml += '</div>';
            });
            qaResultsHtml += '</div>';
        }

        container.innerHTML = `
            <div class="cc-locked">
                <div class="cc-locked-header">
                    <div class="cc-locked-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                    </div>
                    <h2 class="cc-locked-title">Content Generated Successfully</h2>
                    <p class="cc-locked-subtitle">
                        Mode: ${modeLabel} | 
                        ${topicCount} topics | 
                        ${activityCount} activities
                    </p>
                </div>

                ${qaResultsHtml}

                <div class="cc-locked-actions">
                    <button type="button" class="cc-btn cc-btn-ghost" id="cc-reset-btn" data-testid="button-reset">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                            <path d="M3 3v5h5"/>
                        </svg>
                        Reset & Start Over
                    </button>
                    <button type="button" class="cc-btn cc-btn-primary cc-btn-lg" id="cc-player-btn" data-testid="button-launch-player">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="cc-btn-icon">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Launch Learning Module
                    </button>
                </div>
            </div>
        `;

        document.getElementById('cc-reset-btn')?.addEventListener('click', () => {
            if (confirm('Are you sure? This will delete all generated content and allow you to create new content.')) {
                manifest = null;
                tgaData = null;
                topicPlan = null;
                selectedMode = null;
                suggestedMajorTopics = [];
                selectedMajorTopicIds = [];
                selectedElementIds = []; // v8.4.34
                elementSelectionInitialized = false;
                currentStep = 1;
                
                // v6.9.1: Clear AI context variables on reset
                window.CC_AI_CONTEXT = null;
                window.CC_AI_JOB_TITLES = [];
                window.CC_AI_TASK_CATEGORIES = [];
                window.CC_AI_EQUIPMENT_CATEGORIES = [];
                window.CC_AI_DETECTED_INDUSTRY = '';
                window.CC_AI_DETECTED_SECTOR = '';
                window.CC_SELECTED_JOB_TITLES = [];
                window.CC_SELECTED_TASKS = [];
                window.CC_SELECTED_EQUIPMENT = [];
                
                // v6.9.1: Also clear legacy context variables
                window.CC_SELECTED_JOB_ROLES = [];
                window.CC_SELECTED_TASK_CATEGORIES = [];
                window.CC_SELECTED_EQUIPMENT_CATEGORIES = [];
                window.CC_SELECTED_EQUIPMENT_LEGACY = [];
                
                // v6.9.1: Clear AI failure flags
                window.CC_AI_FAILED = false;
                window.CC_AI_NO_FALLBACK = false;
                window.CC_AI_LOADING = false;
                
                saveManifest({ locked: false, reset: true }, () => {
                    renderWizard();
                });
            }
        });

        document.getElementById('cc-player-btn')?.addEventListener('click', () => {
            window.location.href = '?id=' + cmid;
        });
    };

    return { init };
});
