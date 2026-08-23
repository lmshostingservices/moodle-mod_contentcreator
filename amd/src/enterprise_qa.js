/**
 * Enterprise QA: Multilingual + Route-aware + Route-specific Cards + Auto-Revision
 * Post-generation validator for Content Creator enterprise content engine.
 * Validates structure, quality, duplication, language consistency, and route signals.
 * Supports 52 languages with RTL checks for Arabic/Hebrew.
 *
 * @module     mod_contentcreator/enterprise_qa
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function() {
    /**
     * v13.77 FIX-OBJECT-TEXT: entries in the card content arrays arrive as EITHER
     * plain strings or objects, depending on what the vendor API returns for that
     * field on that run. Joining or concatenating them straight into text emitted
     * "[object Object]" whenever an object turned up. These two helpers flatten
     * either shape to readable text so every text-assembly path is shape-safe.
     *
     * @param {*} entry A string, or an object such as {title, text} / {error, consequence}.
     * @return {String} Readable text for the entry, or an empty string.
     */
    var ccEntryText = function(entry) {
        if (entry === null || entry === undefined) { return ''; }
        if (typeof entry === 'string') { return entry; }
        if (typeof entry !== 'object') { return String(entry); }
        var head = entry.title || entry.step || entry.term || entry.name ||
                   entry.dimension || entry.heading || entry.mistake ||
                   entry.error || entry.pitfall || '';
        var body = entry.text || entry.detail || entry.definition || entry.description ||
                   entry.consequence || entry.principle || entry.content ||
                   entry.prompt || entry.item || entry.behaviour || '';
        if (head && body && head !== body) { return head + ': ' + body; }
        return head || body || '';
    };

    /**
     * Flatten an array of string-or-object entries to an array of non-empty strings.
     *
     * @param {Array} arr The array to flatten; anything non-array yields [].
     * @return {Array} Array of readable strings.
     */
    var ccTextList = function(arr) {
        if (!Array.isArray(arr)) { return []; }
        return arr.map(ccEntryText).filter(function(s) { return s; });
    };

    'use strict';

    var DEFAULT_POLICY = {
        minScoreToPass: 90,
        hardFailScore: 75,
        maxAttempts: 3,
        optionLengthVarianceMax: 140,
        duplicationSimilarityThreshold: 0.85,
        checkEnglishLeakage: true,
        enforceUnsafePrefix: true,
        enforceModalityStrength: true,
        enforceEscalationPresence: true,
        enableRTLChecks: true
    };

    var BANNED_PHRASES_EN = [
        "comply with standards",
        "follow procedures appropriately",
        "ensure safety at all times",
        "maintain best practice",
        "it is important to",
        "in order to",
        "highlights the importance of",
        "for safety purposes",
        "ensure everyone returns home safely",
        "key considerations",
        "in today's workplace",
        "in the modern workplace"
    ];

    var ENGLISH_LEAK_TOKENS = [
        "the", "and", "with", "must", "should", "do not", "ensure", "assess", "identify"
    ];

    var ROUTE_SIGNALS = {
        vocational: ["procedure", "check", "inspect", "report", "equipment", "tool", "form", "hazard", "risk", "SDS", "SWMS"],
        university: ["theory", "model", "framework", "mechanism", "limitation", "counterpoint", "debate", "analysis", "methodology"],
        workplace: ["policy", "procedure", "sop", "manager", "supervisor", "system", "record", "incident", "compliance", "accountability"],
        pd: ["skill", "technique", "practice", "approach", "strategy", "principle", "development", "competency", "capability", "reflection"]
    };

    var EXPECTED_CARD_TYPES = {
        vocational: ['hook-scenario', 'concept-explainer', 'mental-model', 'applied-scenario', 'mistakes', 'competency-summary', 'decision-point'],
        university: ['concept-anchor', 'theoretical-framework', 'analytical-lens', 'ethics-considerations', 'case-study-1', 'case-study-2'],
        workplace: ['business-impact', 'action-framework', 'risk-card', 'policy-alignment', 'scenario-1', 'scenario-2'],
        pd: ['skill-anchor', 'core-framework', 'application-guide', 'common-pitfalls', 'scenario-1', 'scenario-2']
    };

    var EXPECTED_CARD_COUNTS = {
        vocational: 7,
        university: 6,
        workplace: 6,
        pd: 6
    };

    var LANGUAGE_PACKS = {
        "en-AU": { doNot: ["Do not "], must: ["must", "required to", "need to"], escalation: ["escalate", "notify", "report", "call"] },
        "en-GB": { doNot: ["Do not "], must: ["must", "required to", "need to"], escalation: ["escalate", "notify", "report", "call"] },
        "en-IN": { doNot: ["Do not "], must: ["must", "required to", "need to"], escalation: ["escalate", "notify", "report", "call"] },
        "en-US": { doNot: ["Do not "], must: ["must", "required to", "need to"], escalation: ["escalate", "notify", "report", "call"] },
        "es-ES": { doNot: ["No ", "No debe ", "No debes ", "No haga "], must: ["debe", "es obligatorio", "se requiere"], escalation: ["informar", "notificar", "escalar", "llamar", "reportar"] },
        "es-US": { doNot: ["No ", "No debe ", "No debes ", "No haga "], must: ["debe", "es obligatorio", "se requiere"], escalation: ["informar", "notificar", "escalar", "llamar", "reportar"] },
        "fr-CA": { doNot: ["Ne ", "Ne pas ", "N'"], must: ["doit", "obligatoire", "il faut"], escalation: ["signaler", "notifier", "appeler", "alerter"] },
        "fr-FR": { doNot: ["Ne ", "Ne pas ", "N'"], must: ["doit", "obligatoire", "il faut"], escalation: ["signaler", "notifier", "appeler", "alerter"] },
        "de-DE": { doNot: ["Nicht ", "Auf keinen Fall ", "Unterlassen Sie "], must: ["muss", "m\u00fcssen", "verpflichtend", "erforderlich"], escalation: ["melden", "benachrichtigen", "eskalieren", "anrufen"] },
        "nl-BE": { doNot: ["Niet ", "Doe niet "], must: ["moet", "verplicht", "vereist"], escalation: ["melden", "rapporteren", "waarschuwen"] },
        "nl-NL": { doNot: ["Niet ", "Doe niet "], must: ["moet", "verplicht", "vereist"], escalation: ["melden", "rapporteren", "waarschuwen"] },
        "pt-BR": { doNot: ["N\u00e3o "], must: ["deve", "\u00e9 obrigat\u00f3rio", "se requer", "obrigat\u00f3rio"], escalation: ["informar", "notificar", "ligar", "reportar"] },
        "it-IT": { doNot: ["Non "], must: ["deve", "obbligatorio", "\u00e8 necessario"], escalation: ["segnalare", "informare", "chiamare", "notificare"] },
        "da-DK": { doNot: ["M\u00e5 ikke "], must: ["skal", "p\u00e5kr\u00e6vet", "obligatorisk"], escalation: ["rapportere", "informere", "tilkalde"] },
        "fi-FI": { doNot: ["\u00c4l\u00e4 "], must: ["t\u00e4ytyy", "on pakollista", "vaaditaan"], escalation: ["ilmoittaa", "raportoida", "h\u00e4lytt\u00e4\u00e4"] },
        "nb-NO": { doNot: ["Ikke "], must: ["m\u00e5", "skal", "p\u00e5krevd", "obligatorisk"], escalation: ["rapportere", "varsle", "melde"] },
        "sv-SE": { doNot: ["G\u00f6r inte ", "G\u00f6r ej "], must: ["m\u00e5ste", "obligatoriskt", "kr\u00e4vs"], escalation: ["rapportera", "informera", "larma"] },
        "bg-BG": { doNot: ["\u041d\u0435 "], must: ["\u0442\u0440\u044f\u0431\u0432\u0430", "\u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u043e", "\u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u043e \u0435"], escalation: ["\u0434\u043e\u043a\u043b\u0430\u0434\u0432\u0430\u0439\u0442\u0435", "\u0441\u044a\u043e\u0431\u0449\u0435\u0442\u0435", "\u0443\u0432\u0435\u0434\u043e\u043c\u0435\u0442\u0435"] },
        "cs-CZ": { doNot: ["Ne "], must: ["mus\u00ed", "je povinn\u00e9", "vy\u017eaduje se"], escalation: ["nahl\u00e1sit", "informovat", "upozornit"] },
        "hr-HR": { doNot: ["Ne "], must: ["mora", "obavezno", "potrebno je"], escalation: ["prijaviti", "obavijestiti", "nazvati"] },
        "hu-HU": { doNot: ["Ne "], must: ["kell", "k\u00f6telez\u0151", "sz\u00fcks\u00e9ges"], escalation: ["jelenteni", "\u00e9rtes\u00edteni", "h\u00edvni"] },
        "pl-PL": { doNot: ["Nie "], must: ["musi", "obowi\u0105zkowe", "wymagane"], escalation: ["zg\u0142osi\u0107", "poinformowa\u0107", "powiadomi\u0107"] },
        "ro-RO": { doNot: ["Nu "], must: ["trebuie", "obligatoriu", "este necesar"], escalation: ["raporta", "notifica", "anun\u021ba"] },
        "ru-RU": { doNot: ["\u041d\u0435 "], must: ["\u0434\u043e\u043b\u0436\u0435\u043d", "\u043d\u0443\u0436\u043d\u043e", "\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e"], escalation: ["\u0441\u043e\u043e\u0431\u0449\u0438\u0442\u044c", "\u0434\u043e\u043b\u043e\u0436\u0438\u0442\u044c", "\u0443\u0432\u0435\u0434\u043e\u043c\u0438\u0442\u044c", "\u0432\u044b\u0437\u0432\u0430\u0442\u044c"] },
        "sk-SK": { doNot: ["Ne "], must: ["mus\u00ed", "je povinn\u00e9", "vy\u017eaduje sa"], escalation: ["nahl\u00e1si\u0165", "informova\u0165", "upozorni\u0165"] },
        "sl-SI": { doNot: ["Ne "], must: ["mora", "obvezno", "potrebno je"], escalation: ["poro\u010dati", "obvestiti", "poklicati"] },
        "sr-RS": { doNot: ["Ne "], must: ["mora", "obavezno", "potrebno je"], escalation: ["prijaviti", "obavestiti", "pozvati"] },
        "uk-UA": { doNot: ["\u041d\u0435 "], must: ["\u043f\u043e\u0432\u0438\u043d\u0435\u043d", "\u043f\u043e\u0442\u0440\u0456\u0431\u043d\u043e", "\u043e\u0431\u043e\u0432'\u044f\u0437\u043a\u043e\u0432\u043e"], escalation: ["\u043f\u043e\u0432\u0456\u0434\u043e\u043c\u0438\u0442\u0438", "\u0434\u043e\u043f\u043e\u0432\u0456\u0441\u0442\u0438", "\u0432\u0438\u043a\u043b\u0438\u043a\u0430\u0442\u0438"] },
        "et-EE": { doNot: ["\u00c4ra "], must: ["peab", "kohustuslik", "n\u00f5utav"], escalation: ["teavitada", "raporteerida", "kutsuda"] },
        "lt-LT": { doNot: ["Ne "], must: ["privalo", "b\u016btina", "reikalaujama"], escalation: ["prane\u0161ti", "informuoti", "i\u0161kviesti"] },
        "lv-LV": { doNot: ["Ne "], must: ["j\u0101", "oblig\u0101ti", "nepiecie\u0161ams"], escalation: ["zi\u0146ot", "inform\u0113t", "izsaukt"] },
        "el-GR": { doNot: ["\u039c\u03b7\u03bd ", "\u039c\u03b7 "], must: ["\u03c0\u03c1\u03ad\u03c0\u03b5\u03b9", "\u03c5\u03c0\u03bf\u03c7\u03c1\u03b5\u03c9\u03c4\u03b9\u03ba\u03cc", "\u03b1\u03c0\u03b1\u03c1\u03b1\u03af\u03c4\u03b7\u03c4\u03bf"], escalation: ["\u03b1\u03bd\u03b1\u03c6\u03ad\u03c1\u03b5\u03c4\u03b5", "\u03b5\u03b9\u03b4\u03bf\u03c0\u03bf\u03b9\u03ae\u03c3\u03c4\u03b5", "\u03ba\u03b1\u03bb\u03ad\u03c3\u03c4\u03b5"] },
        "cmn-CN": { doNot: ["\u4e0d\u8981 "], must: ["\u5fc5\u987b", "\u9700\u8981", "\u52a1\u5fc5"], escalation: ["\u62a5\u544a", "\u901a\u77e5", "\u8054\u7cfb", "\u547c\u53eb"] },
        "zh-CN": { doNot: ["\u4e0d\u8981 "], must: ["\u5fc5\u987b", "\u9700\u8981", "\u52a1\u5fc5"], escalation: ["\u62a5\u544a", "\u901a\u77e5", "\u8054\u7cfb", "\u547c\u53eb"] },
        "ja-JP": { doNot: ["\u3057\u3066\u306f\u3044\u3051\u306a\u3044", "\u3057\u306a\u3044\u3067\u304f\u3060\u3055\u3044", "\u301c\u3057\u3066\u306f\u306a\u3089\u306a\u3044"], must: ["\u5fc5\u8981\u304c\u3042\u308a\u307e\u3059", "\u5fc5\u9808", "\u301c\u3057\u306a\u3051\u308c\u3070\u306a\u3089\u306a\u3044"], escalation: ["\u5831\u544a\u3059\u308b", "\u901a\u77e5\u3059\u308b", "\u9023\u7d61\u3059\u308b"] },
        "ko-KR": { doNot: ["\ud558\uc9c0 \ub9c8\uc2ed\uc2dc\uc624", "\ud558\uc9c0 \ub9c8\uc138\uc694", "\ud558\uba74 \uc548 \ub429\ub2c8\ub2e4"], must: ["\ud574\uc57c \ud569\ub2c8\ub2e4", "\ud544\uc218", "\ubc18\ub4dc\uc2dc"], escalation: ["\ubcf4\uace0\ud558\ub2e4", "\uc54c\ub9ac\ub2e4", "\uc2e0\uace0\ud558\ub2e4"] },
        "id-ID": { doNot: ["Jangan "], must: ["harus", "wajib", "diperlukan"], escalation: ["laporkan", "beritahu", "hubungi"] },
        "th-TH": { doNot: ["\u0e2d\u0e22\u0e48\u0e32 "], must: ["\u0e15\u0e49\u0e2d\u0e07", "\u0e08\u0e33\u0e40\u0e1b\u0e47\u0e19", "\u0e1a\u0e31\u0e07\u0e04\u0e31\u0e1a"], escalation: ["\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19", "\u0e41\u0e08\u0e49\u0e07", "\u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d"] },
        "vi-VN": { doNot: ["Kh\u00f4ng "], must: ["ph\u1ea3i", "b\u1eaft bu\u1ed9c", "c\u1ea7n"], escalation: ["b\u00e1o c\u00e1o", "th\u00f4ng b\u00e1o", "g\u1ecdi"] },
        "fil-PH": { doNot: ["Huwag "], must: ["dapat", "kinakailangan", "obligado"], escalation: ["iulat", "ipaalam", "tumawag"] },
        "ms-MY": { doNot: ["Jangan "], must: ["mesti", "wajib", "diperlukan"], escalation: ["lapor", "maklumkan", "hubungi"] },
        "bn-IN": { doNot: ["\u0995\u09b0\u09ac\u09c7\u09a8 \u09a8\u09be ", "\u0995\u0996\u09a8\u0993 ", "\u09a8\u09be "], must: ["\u0985\u09ac\u09b6\u09cd\u09af\u0987", "\u09aa\u09cd\u09b0\u09af\u09bc\u09cb\u099c\u09a8", "\u09ac\u09be\u09a7\u09cd\u09af\u09a4\u09be\u09ae\u09c2\u09b2\u0995"], escalation: ["\u09b0\u09bf\u09aa\u09cb\u09b0\u09cd\u099f \u0995\u09b0\u09c1\u09a8", "\u099c\u09be\u09a8\u09be\u09a8", "\u0985\u09ac\u09b9\u09bf\u09a4 \u0995\u09b0\u09c1\u09a8"] },
        "gu-IN": { doNot: ["\u0aa8 \u0a95\u0ab0\u0acb ", "\u0a95\u0acd\u0aaf\u0abe\u0ab0\u0ac7\u0aaf "], must: ["\u0a9c\u0ab0\u0ac2\u0ab0\u0ac0 \u0a9b\u0ac7", "\u0a86\u0ab5\u0ab6\u0acd\u0aaf\u0a95", "\u0aab\u0ab0\u0a9c\u0abf\u0aaf\u0abe\u0aa4"], escalation: ["\u0ab0\u0abf\u0aaa\u0acb\u0ab0\u0acd\u0a9f \u0a95\u0ab0\u0acb", "\u0a9c\u0aa3\u0abe\u0ab5\u0acb", "\u0ab8\u0ac2\u0a9a\u0abf\u0aa4 \u0a95\u0ab0\u0acb"] },
        "hi-IN": { doNot: ["\u0928 \u0915\u0930\u0947\u0902 ", "\u0915\u092d\u0940 "], must: ["\u091a\u093e\u0939\u093f\u090f", "\u0905\u0928\u093f\u0935\u093e\u0930\u094d\u092f", "\u091c\u093c\u0930\u0942\u0930\u0940"], escalation: ["\u0930\u093f\u092a\u094b\u0930\u094d\u091f \u0915\u0930\u0947\u0902", "\u0938\u0942\u091a\u093f\u0924 \u0915\u0930\u0947\u0902", "\u092c\u0924\u093e\u090f\u0901"] },
        "kn-IN": { doNot: ["\u0cae\u0cbe\u0ca1\u0cac\u0cc7\u0ca1\u0cbf ", "\u0c8e\u0c82\u0ca6\u0cbf\u0c97\u0cc2 "], must: ["\u0cae\u0cbe\u0ca1\u0cac\u0cc7\u0c95\u0cc1", "\u0c95\u0ca1\u0ccd\u0ca1\u0cbe\u0caf", "\u0c85\u0cb5\u0cb6\u0ccd\u0caf\u0c95"], escalation: ["\u0cb5\u0cb0\u0ca6\u0cbf \u0cae\u0cbe\u0ca1\u0cbf", "\u0cb8\u0cc2\u0c9a\u0cbf\u0cb8\u0cbf", "\u0ca4\u0cbf\u0cb3\u0cbf\u0cb8\u0cbf"] },
        "ml-IN": { doNot: ["\u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d30\u0d41\u0d24\u0d4d ", "\u0d12\u0d30\u0d3f\u0d15\u0d4d\u0d15\u0d32\u0d41\u0d02 "], must: ["\u0d05\u0d35\u0d36\u0d4d\u0d2f\u0d2e\u0d3e\u0d23\u0d4d", "\u0d15\u0d23\u0d4d\u0d1f\u0d46\u0d24\u0d4d\u0d24\u0d23\u0d02", "\u0d28\u0d3f\u0d7c\u0d2c\u0d28\u0d4d\u0d27\u0d2e\u0d3e\u0d23\u0d4d"], escalation: ["\u0d31\u0d3f\u0d2a\u0d4d\u0d2a\u0d4b\u0d7c\u0d1f\u0d4d\u0d1f\u0d4d \u0d1a\u0d46\u0d2f\u0d4d\u0d2f\u0d41\u0d15", "\u0d05\u0d31\u0d3f\u0d2f\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15", "\u0d35\u0d3f\u0d33\u0d3f\u0d15\u0d4d\u0d15\u0d41\u0d15"] },
        "mr-IN": { doNot: ["\u0915\u0930\u0942 \u0928\u0915\u093e ", "\u0915\u0927\u0940\u0939\u0940 "], must: ["\u0906\u0935\u0936\u094d\u092f\u0915 \u0906\u0939\u0947", "\u092c\u093e\u0927\u094d\u092f", "\u0905\u0928\u093f\u0935\u093e\u0930\u094d\u092f"], escalation: ["\u0905\u0939\u0935\u093e\u0932 \u0926\u094d\u092f\u093e", "\u0915\u0933\u0935\u093e", "\u0938\u0942\u091a\u093f\u0924 \u0915\u0930\u093e"] },
        "ta-IN": { doNot: ["\u0b9a\u0bc6\u0baf\u0bcd\u0baf \u0bb5\u0bc7\u0ba3\u0bcd\u0b9f\u0bbe\u0bae\u0bcd ", "\u0b92\u0bb0\u0bc1\u0baa\u0bcb\u0ba4\u0bc1\u0bae\u0bcd "], must: ["\u0b95\u0b9f\u0bcd\u0b9f\u0bbe\u0baf\u0bae\u0bcd", "\u0ba4\u0bc7\u0bb5\u0bc8", "\u0b85\u0bb5\u0b9a\u0bbf\u0baf\u0bae\u0bcd"], escalation: ["\u0b85\u0bb1\u0bbf\u0b95\u0bcd\u0b95\u0bc8 \u0b9a\u0bc6\u0baf\u0bcd\u0baf\u0bb5\u0bc1\u0bae\u0bcd", "\u0ba4\u0bc6\u0bb0\u0bbf\u0bb5\u0bbf\u0b95\u0bcd\u0b95\u0bb5\u0bc1\u0bae\u0bcd", "\u0b85\u0bb4\u0bc8\u0b95\u0bcd\u0b95\u0bb5\u0bc1\u0bae\u0bcd"] },
        "te-IN": { doNot: ["\u0c1a\u0c47\u0c2f\u0c35\u0c26\u0c4d\u0c26\u0c41 ", "\u0c0e\u0c2a\u0c4d\u0c2a\u0c41\u0c21\u0c42 "], must: ["\u0c24\u0c2a\u0c4d\u0c2a\u0c28\u0c3f\u0c38\u0c30\u0c3f", "\u0c05\u0c35\u0c38\u0c30\u0c02", "\u0c15\u0c3e\u0c35\u0c3e\u0c32\u0c3f"], escalation: ["\u0c30\u0c3f\u0c2a\u0c4b\u0c30\u0c4d\u0c1f\u0c4d \u0c1a\u0c47\u0c2f\u0c02\u0c21\u0c3f", "\u0c24\u0c46\u0c32\u0c3f\u0c2f\u0c1c\u0c47\u0c2f\u0c02\u0c21\u0c3f", "\u0c15\u0c3e\u0c32\u0c4d \u0c1a\u0c47\u0c2f\u0c02\u0c21\u0c3f"] },
        "ur-IN": { doNot: ["\u0646\u06c1 \u06a9\u0631\u06cc\u06ba ", "\u06a9\u0628\u06be\u06cc "], must: ["\u0636\u0631\u0648\u0631\u06cc \u06c1\u06d2", "\u0644\u0627\u0632\u0645\u06cc", "\u0648\u0627\u062c\u0628"], escalation: ["\u0631\u067e\u0648\u0631\u0679 \u06a9\u0631\u06cc\u06ba", "\u0627\u0637\u0644\u0627\u0639 \u062f\u06cc\u06ba", "\u0628\u062a\u0627\u0626\u06cc\u06ba"] },
        "ar-XA": { doNot: ["\u0644\u0627 "], must: ["\u064a\u062c\u0628", "\u0625\u0644\u0632\u0627\u0645\u064a", "\u0636\u0631\u0648\u0631\u064a"], escalation: ["\u0623\u0628\u0644\u063a", "\u0623\u062e\u0637\u0631", "\u0627\u062a\u0635\u0644", "\u0628\u0644\u0651\u063a"] },
        "he-IL": { doNot: ["\u05d0\u05dc "], must: ["\u05d7\u05d9\u05d9\u05d1", "\u05e0\u05d3\u05e8\u05e9", "\u05d7\u05d5\u05d1\u05d4"], escalation: ["\u05dc\u05d3\u05d5\u05d5\u05d7", "\u05dc\u05d4\u05d5\u05d3\u05d9\u05e2", "\u05dc\u05d4\u05ea\u05e7\u05e9\u05e8"] },
        "tr-TR": { doNot: ["Yapmay\u0131n ", "Sak\u0131n "], must: ["zorunlu", "gereklidir", "mutlaka"], escalation: ["bildirin", "rapor edin", "haber verin"] },
        "sw-KE": { doNot: ["Usifanye ", "Usifanye hivyo "], must: ["lazima", "inahitajika", "ni lazima"], escalation: ["ripoti", "arifu", "piga simu"] }
    };

    var RTL_LANGS = ["ar-XA", "he-IL"];

    function getLangPack(languageCode) {
        return LANGUAGE_PACKS[languageCode] || null;
    }

    function isEnglishVariant(languageCode) {
        return (languageCode || '').startsWith('en-');
    }

    function countWords(str) {
        return (str || '').trim().split(/\s+/).filter(function(w) { return w; }).length;
    }

    function inRange(val, min, max) {
        return val >= min && val <= max;
    }

    function stringifyLower(obj) {
        return JSON.stringify(obj || {}).toLowerCase();
    }

    function normalizeText(str) {
        return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    }

    function collectLearnerTextChunks(content) {
        var chunks = [];
        if (!content) return chunks;

        var cards = Array.isArray(content) ? content : null;
        if (!cards || cards.length === 0) return chunks;

        cards.forEach(function(card) {
            if (!card) return;

            if (card.voiceoverText) chunks.push(card.voiceoverText);

            switch (card.cardType) {
                case 'performance-anchor':
                    if (card.pcStatement) chunks.push(card.pcStatement);
                    if (card.summaryLine) chunks.push(card.summaryLine);
                    break;
                case 'plain-english':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (Array.isArray(card.keyPoints)) chunks = chunks.concat(ccTextList(card.keyPoints));
                    break;
                case 'action-breakdown':
                    if (Array.isArray(card.actions)) {
                        card.actions.forEach(function(action) {
                            if (!action) return;
                            if (action.heading) chunks.push(action.heading);
                            if (Array.isArray(action.bullets)) chunks = chunks.concat(action.bullets);
                        });
                    }
                    break;
                case 'competence-standard':
                    if (Array.isArray(card.standardItems)) chunks = chunks.concat(ccTextList(card.standardItems));
                    break;
                case 'scenario-1':
                case 'scenario-2':
                    if (card.context) chunks.push(card.context);
                    if (card.consequence) chunks.push(card.consequence);
                    if (card.turningPoint) chunks.push(card.turningPoint);
                    if (card.reflection && typeof card.reflection === 'string') chunks.push(card.reflection);
                    break;
                case 'common-errors':
                    if (Array.isArray(card.errorItems)) {
                        card.errorItems.forEach(function(item) {
                            if (!item) return;
                            if (item.error) chunks.push(item.error);
                            if (item.consequence) chunks.push(item.consequence);
                        });
                    }
                    break;
                case 'concept-anchor':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (card.conceptDefinition) chunks.push(card.conceptDefinition);
                    if (card.significance) chunks.push(card.significance);
                    if (Array.isArray(card.keyTerms)) {
                        card.keyTerms.forEach(function(t) {
                            if (!t) return;
                            if (typeof t === 'string') { chunks.push(t); return; }
                            if (t.term) chunks.push(t.term);
                            if (t.definition) chunks.push(t.definition);
                        });
                    }
                    break;
                case 'theoretical-framework':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (Array.isArray(card.frameworks)) {
                        card.frameworks.forEach(function(f) {
                            if (!f) return;
                            if (f.name) chunks.push(f.name);
                            if (f.principle) chunks.push(f.principle);
                            if (f.limitation) chunks.push(f.limitation);
                        });
                    }
                    break;
                case 'analytical-lens':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (Array.isArray(card.cognitiveConsiderations)) chunks = chunks.concat(ccTextList(card.cognitiveConsiderations));
                    break;
                case 'ethics-considerations':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (Array.isArray(card.considerations)) {
                        card.considerations.forEach(function(c) {
                            if (!c) return;
                            if (c.dimension) chunks.push(c.dimension);
                            if (c.description) chunks.push(c.description);
                        });
                    }
                    break;
                case 'case-study-1':
                case 'case-study-2':
                    if (card.context) chunks.push(card.context);
                    if (card.consequence) chunks.push(card.consequence);
                    if (card.criticalReflection) chunks.push(card.criticalReflection);
                    if (Array.isArray(card.analysisPrompts)) chunks = chunks.concat(ccTextList(card.analysisPrompts));
                    break;
                case 'business-impact':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (card.impactStatement) chunks.push(card.impactStatement);
                    if (Array.isArray(card.keyMetrics)) {
                        card.keyMetrics.forEach(function(m) {
                            if (!m) return;
                            if (typeof m === 'string') { chunks.push(m); return; }
                            if (m.metric) chunks.push(m.metric);
                            if (m.value) chunks.push(m.value);
                        });
                    }
                    if (Array.isArray(card.consequences)) chunks = chunks.concat(ccTextList(card.consequences));
                    if (Array.isArray(card.optimisationTips)) chunks = chunks.concat(ccTextList(card.optimisationTips));
                    break;
                case 'action-framework':
                    if (Array.isArray(card.steps)) {
                        card.steps.forEach(function(s) {
                            if (!s) return;
                            if (typeof s === 'string') { chunks.push(s); return; }
                            if (s.action) chunks.push(s.action);
                            if (s.detail) chunks.push(s.detail);
                        });
                    }
                    break;
                case 'risk-card':
                    if (Array.isArray(card.risks)) {
                        card.risks.forEach(function(r) {
                            if (!r) return;
                            if (r.risk) chunks.push(r.risk);
                            if (r.impact) chunks.push(r.impact);
                            if (r.mitigation) chunks.push(r.mitigation);
                            if (r.consequence) chunks.push(r.consequence);
                        });
                    }
                    break;
                case 'policy-alignment':
                    if (Array.isArray(card.policyItems)) {
                        card.policyItems.forEach(function(p) {
                            if (!p) return;
                            if (p.policy) chunks.push(p.policy);
                            if (p.requirement) chunks.push(p.requirement);
                            if (p.consequence) chunks.push(p.consequence);
                        });
                    }
                    break;
                case 'skill-anchor':
                    if (card.skillStatement) chunks.push(card.skillStatement);
                    if (card.relevance) chunks.push(card.relevance);
                    if (Array.isArray(card.keyIndicators)) chunks = chunks.concat(ccTextList(card.keyIndicators));
                    break;
                case 'core-framework':
                    if (card.keyPrinciple) chunks.push(card.keyPrinciple);
                    if (Array.isArray(card.frameworkSteps)) {
                        card.frameworkSteps.forEach(function(s) {
                            if (!s) return;
                            if (s.step) chunks.push(s.step);
                            if (s.explanation) chunks.push(s.explanation);
                            if (s.example) chunks.push(s.example);
                        });
                    }
                    break;
                case 'application-guide':
                    if (card.bodyText) chunks.push(card.bodyText);
                    if (Array.isArray(card.applications)) {
                        card.applications.forEach(function(a) {
                            if (!a) return;
                            if (a.situation) chunks.push(a.situation);
                            if (a.action) chunks.push(a.action);
                            if (a.rationale) chunks.push(a.rationale);
                        });
                    }
                    break;
                case 'common-pitfalls':
                    if (Array.isArray(card.pitfallItems)) {
                        card.pitfallItems.forEach(function(p) {
                            if (!p) return;
                            if (p.pitfall) chunks.push(p.pitfall);
                            if (p.consequence) chunks.push(p.consequence);
                            if (p.correction) chunks.push(p.correction);
                        });
                    }
                    break;
                case 'hook-scenario':
                case 'applied-scenario':
                    if (Array.isArray(card.sceneParts)) {
                        card.sceneParts.forEach(function(part) {
                            if (!part) return;
                            var t = part.text || part.content || part.description || '';
                            if (t) chunks.push(t);
                            if (part.title) chunks.push(part.title);
                        });
                    }
                    if (card.description) chunks.push(card.description);
                    if (card.highlightText) chunks.push(card.highlightText);
                    break;
                case 'concept-explainer':
                    if (Array.isArray(card.conceptInsights)) {
                        card.conceptInsights.forEach(function(insight) {
                            if (!insight) return;
                            var t = insight.text || insight.content || insight.description || '';
                            if (t) chunks.push(t);
                            if (insight.title) chunks.push(insight.title);
                        });
                    }
                    break;
                case 'mental-model':
                    if (Array.isArray(card.steps)) {
                        card.steps.forEach(function(s) {
                            if (!s) return;
                            var heading = s.step || s.action || s.title || '';
                            if (heading) chunks.push(heading);
                            var detail = s.detail || s.description || s.explanation || '';
                            if (detail) chunks.push(detail);
                        });
                    }
                    break;
                case 'mistakes':
                    if (Array.isArray(card.items)) {
                        card.items.forEach(function(item) {
                            if (!item) return;
                            if (typeof item === 'string') { chunks.push(item); return; }
                            var m = item.mistake || item.error || item.pitfall || '';
                            if (m) chunks.push(m);
                            if (item.consequence) chunks.push(item.consequence);
                        });
                    }
                    break;
                case 'competency-summary':
                    if (Array.isArray(card.goodItems)) {
                        card.goodItems.forEach(function(item) {
                            if (!item) return;
                            var t = typeof item === 'string' ? item : (item.text || item.behaviour || item.criterion || '');
                            if (t) chunks.push(t);
                        });
                    }
                    if (Array.isArray(card.badItems)) {
                        card.badItems.forEach(function(item) {
                            if (!item) return;
                            var t = typeof item === 'string' ? item : (item.text || '');
                            if (t) chunks.push(t);
                        });
                    }
                    break;
                case 'decision-point':
                    if (card.question) chunks.push(card.question);
                    if (Array.isArray(card.options)) {
                        card.options.forEach(function(opt) {
                            if (!opt) return;
                            if (opt.text) chunks.push(opt.text);
                            if (opt.feedback) chunks.push(opt.feedback);
                        });
                    }
                    break;
            }
        });

        return chunks.filter(function(c) { return typeof c === 'string' && c.length > 0; });
    }

    function jaccardSimilarity(a, b) {
        var setA = new Set((a || '').split(/\s+/).filter(function(w) { return w.length > 3; }));
        var setB = new Set((b || '').split(/\s+/).filter(function(w) { return w.length > 3; }));
        if (setA.size === 0 || setB.size === 0) return 0;
        var intersection = 0;
        setA.forEach(function(w) { if (setB.has(w)) intersection++; });
        var union = new Set([...setA, ...setB]).size;
        return union > 0 ? intersection / union : 0;
    }

    function startsWithAny(text, prefixes) {
        if (!text || !prefixes) return false;
        return prefixes.some(function(p) { return text.startsWith(p); });
    }

    function validateEnterpriseContent(cards, routeType, languageCode, policy) {
        policy = policy || DEFAULT_POLICY;
        var results = { pass: true, score: 100, errors: [], warnings: [], meta: {} };

        var expectedCount = EXPECTED_CARD_COUNTS[routeType] || 6;

        if (!Array.isArray(cards) || cards.length !== expectedCount) {
            results.errors.push("Output is not a valid array of " + expectedCount + " cards (got " + (Array.isArray(cards) ? cards.length : 'non-array') + ").");
            results.score -= 30;
            results.pass = false;
            return results;
        }

        checkCardStructure(cards, routeType, results);
        checkCardWordBudgets(cards, routeType, results);
        checkFillerLanguage(cards, results);
        checkDuplication(cards, policy, results);

        var scenarioCards = cards.filter(function(c) {
            return c && (c.cardType === 'scenario-1' || c.cardType === 'scenario-2' || c.cardType === 'case-study-1' || c.cardType === 'case-study-2' || c.cardType === 'hook-scenario' || c.cardType === 'applied-scenario');
        });
        checkScenarioFriction(scenarioCards, results);

        checkConcreteNouns(cards, routeType, results);
        checkRouteSignals(cards, routeType, results);
        checkAntiDuplication(cards, results);

        validateLanguageLayer(cards, routeType, languageCode, policy, results);

        if (results.errors.length > 0) results.pass = false;
        if (results.score < policy.minScoreToPass) results.pass = false;

        return results;
    }

    function checkCardStructure(cards, routeType, results) {
        var expectedTypes = EXPECTED_CARD_TYPES[routeType] || [];

        for (var i = 0; i < expectedTypes.length; i++) {
            if (!cards[i] || cards[i].cardType !== expectedTypes[i]) {
                results.warnings.push("Card " + (i + 1) + " has unexpected cardType: " + (cards[i] ? cards[i].cardType : 'missing') + " (expected: " + expectedTypes[i] + ").");
                results.score -= 2;
            }
        }

        cards.forEach(function(card, idx) {
            if (!card) return;
            switch (card.cardType) {
                case 'competence-standard':
                    if (!Array.isArray(card.standardItems) || card.standardItems.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (competence-standard) missing standardItems array.");
                        results.score -= 8;
                    }
                    break;
                case 'action-breakdown':
                    if (!Array.isArray(card.actions) || card.actions.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (action-breakdown) missing actions array.");
                        results.score -= 8;
                    }
                    break;
                case 'theoretical-framework':
                    if (!Array.isArray(card.frameworks) || card.frameworks.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (theoretical-framework) missing frameworks array.");
                        results.score -= 8;
                    }
                    break;
                case 'case-study-1':
                case 'case-study-2':
                    if (!card.context) {
                        results.errors.push("Card " + (idx + 1) + " (" + card.cardType + ") missing context.");
                        results.score -= 8;
                    }
                    break;
                case 'risk-card':
                    if (!Array.isArray(card.risks) || card.risks.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (risk-card) missing risks array.");
                        results.score -= 8;
                    }
                    break;
                case 'policy-alignment':
                    if (!Array.isArray(card.policyItems) || card.policyItems.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (policy-alignment) missing policyItems array.");
                        results.score -= 8;
                    }
                    break;
                case 'scenario-1':
                case 'scenario-2':
                    if (!card.context) {
                        results.errors.push("Card " + (idx + 1) + " (" + card.cardType + ") missing context.");
                        results.score -= 6;
                    }
                    break;
                case 'performance-anchor':
                    if (!card.pcStatement) {
                        results.errors.push("Card " + (idx + 1) + " (performance-anchor) missing pcStatement.");
                        results.score -= 6;
                    }
                    break;
                case 'plain-english':
                    if (!card.bodyText) {
                        results.errors.push("Card " + (idx + 1) + " (plain-english) missing bodyText.");
                        results.score -= 6;
                    }
                    break;
                case 'common-errors':
                    if (!Array.isArray(card.errorItems) || card.errorItems.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (common-errors) missing errorItems array.");
                        results.score -= 6;
                    }
                    break;
                case 'concept-anchor':
                    if (!card.bodyText) {
                        results.errors.push("Card " + (idx + 1) + " (concept-anchor) missing bodyText.");
                        results.score -= 6;
                    }
                    break;
                case 'analytical-lens':
                    if (!card.bodyText) {
                        results.errors.push("Card " + (idx + 1) + " (analytical-lens) missing bodyText.");
                        results.score -= 6;
                    }
                    break;
                case 'ethics-considerations':
                    if (!card.bodyText) {
                        results.errors.push("Card " + (idx + 1) + " (ethics-considerations) missing bodyText.");
                        results.score -= 6;
                    }
                    break;
                case 'business-impact':
                    if (!card.bodyText) {
                        results.errors.push("Card " + (idx + 1) + " (business-impact) missing bodyText.");
                        results.score -= 6;
                    }
                    break;
                case 'action-framework':
                    if (!Array.isArray(card.steps) || card.steps.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (action-framework) missing steps array.");
                        results.score -= 6;
                    }
                    break;
                case 'skill-anchor':
                    if (!card.skillStatement) {
                        results.errors.push("Card " + (idx + 1) + " (skill-anchor) missing skillStatement.");
                        results.score -= 6;
                    }
                    if (!card.relevance) {
                        results.warnings.push("Card " + (idx + 1) + " (skill-anchor) missing relevance.");
                        results.score -= 3;
                    }
                    break;
                case 'core-framework':
                    if (!Array.isArray(card.frameworkSteps) || card.frameworkSteps.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (core-framework) missing frameworkSteps array.");
                        results.score -= 6;
                    }
                    break;
                case 'application-guide':
                    if (!Array.isArray(card.applications) || card.applications.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (application-guide) missing applications array.");
                        results.score -= 6;
                    }
                    break;
                case 'common-pitfalls':
                    if (!Array.isArray(card.pitfallItems) || card.pitfallItems.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (common-pitfalls) missing pitfallItems array.");
                        results.score -= 6;
                    }
                    break;
                case 'hook-scenario':
                    if (!Array.isArray(card.sceneParts) || card.sceneParts.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (hook-scenario) missing sceneParts array.");
                        results.score -= 8;
                    }
                    break;
                case 'concept-explainer':
                    if (!Array.isArray(card.conceptInsights) || card.conceptInsights.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (concept-explainer) missing conceptInsights array.");
                        results.score -= 8;
                    }
                    break;
                case 'mental-model':
                    if (!Array.isArray(card.steps) || card.steps.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (mental-model) missing steps array.");
                        results.score -= 8;
                    }
                    break;
                case 'applied-scenario':
                    if (!Array.isArray(card.sceneParts) || card.sceneParts.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (applied-scenario) missing sceneParts array.");
                        results.score -= 8;
                    }
                    break;
                case 'mistakes':
                    if (!Array.isArray(card.items) || card.items.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (mistakes) missing items array.");
                        results.score -= 8;
                    }
                    break;
                case 'competency-summary':
                    if ((!Array.isArray(card.goodItems) || card.goodItems.length === 0) &&
                        (!Array.isArray(card.badItems) || card.badItems.length === 0)) {
                        results.errors.push("Card " + (idx + 1) + " (competency-summary) missing goodItems/badItems arrays.");
                        results.score -= 8;
                    }
                    break;
                case 'decision-point':
                    if (!card.question) {
                        results.errors.push("Card " + (idx + 1) + " (decision-point) missing question.");
                        results.score -= 8;
                    }
                    if (!Array.isArray(card.options) || card.options.length === 0) {
                        results.errors.push("Card " + (idx + 1) + " (decision-point) missing options array.");
                        results.score -= 8;
                    }
                    break;
            }
        });
    }

    function checkCardWordBudgets(cards, routeType, results) {
        cards.forEach(function(card, idx) {
            if (!card) return;
            switch (card.cardType) {
                case 'performance-anchor':
                    if (card.pcStatement) {
                        var pcWords = countWords(card.pcStatement);
                        if (!inRange(pcWords, 15, 60)) {
                            results.warnings.push("Card " + (idx + 1) + " pcStatement word count (" + pcWords + ") outside range 15\u201360.");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'plain-english':
                case 'concept-anchor':
                case 'business-impact':
                    if (card.bodyText) {
                        var bodyWords = countWords(card.bodyText);
                        var bodyRange = routeType === "university" ? [40, 100] : [30, 80];
                        if (!inRange(bodyWords, bodyRange[0], bodyRange[1])) {
                            results.warnings.push("Card " + (idx + 1) + " bodyText word count (" + bodyWords + ") outside range " + bodyRange[0] + "\u2013" + bodyRange[1] + ".");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'theoretical-framework':
                case 'analytical-lens':
                case 'ethics-considerations':
                    if (card.bodyText) {
                        var fwBodyWords = countWords(card.bodyText);
                        if (!inRange(fwBodyWords, 30, 100)) {
                            results.warnings.push("Card " + (idx + 1) + " bodyText word count (" + fwBodyWords + ") outside range 30\u2013100.");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'scenario-1':
                case 'scenario-2':
                case 'case-study-1':
                case 'case-study-2':
                    if (card.context) {
                        var ctxWords = countWords(card.context);
                        if (!inRange(ctxWords, 20, 150)) {
                            results.warnings.push("Card " + (idx + 1) + " context word count (" + ctxWords + ") outside range 20\u2013150.");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'skill-anchor':
                    if (card.skillStatement) {
                        var skillWords = countWords(card.skillStatement);
                        if (!inRange(skillWords, 20, 80)) {
                            results.warnings.push("Card " + (idx + 1) + " skillStatement word count (" + skillWords + ") outside range 20\u201380.");
                            results.score -= 2;
                        }
                    }
                    if (card.relevance) {
                        var relWords = countWords(card.relevance);
                        if (!inRange(relWords, 15, 60)) {
                            results.warnings.push("Card " + (idx + 1) + " relevance word count (" + relWords + ") outside range 15\u201360.");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'core-framework':
                    if (card.keyPrinciple) {
                        var kpWords = countWords(card.keyPrinciple);
                        if (!inRange(kpWords, 10, 50)) {
                            results.warnings.push("Card " + (idx + 1) + " keyPrinciple word count (" + kpWords + ") outside range 10\u201350.");
                            results.score -= 2;
                        }
                    }
                    break;
                case 'application-guide':
                    if (card.bodyText) {
                        var agBodyWords = countWords(card.bodyText);
                        if (!inRange(agBodyWords, 20, 80)) {
                            results.warnings.push("Card " + (idx + 1) + " bodyText word count (" + agBodyWords + ") outside range 20\u201380.");
                            results.score -= 2;
                        }
                    }
                    break;
            }
        });
    }

    function checkFillerLanguage(cards, results) {
        var t = stringifyLower(cards);
        for (var i = 0; i < BANNED_PHRASES_EN.length; i++) {
            if (t.includes(BANNED_PHRASES_EN[i])) {
                results.warnings.push("Filler phrase detected: \"" + BANNED_PHRASES_EN[i] + "\". Replace with a specific example.");
                results.score -= 3;
            }
        }
    }

    function checkDuplication(cards, policy, results) {
        var chunks = collectLearnerTextChunks(cards);
        var norm = chunks.map(normalizeText);
        var dupFound = false;

        for (var i = 0; i < norm.length && !dupFound; i++) {
            for (var j = i + 1; j < norm.length && !dupFound; j++) {
                if (norm[i].length > 15 && norm[j].length > 15) {
                    var sim = jaccardSimilarity(norm[i], norm[j]);
                    if (sim >= policy.duplicationSimilarityThreshold) {
                        results.warnings.push("Possible duplication across cards/sections (high similarity: " + Math.round(sim * 100) + "%).");
                        results.score -= 3;
                        dupFound = true;
                    }
                }
            }
        }
    }

    function checkConcreteNouns(cards, routeType, results) {
        var concreteIndicators = [
            "equipment", "system", "document", "tool", "form", "machine",
            "report", "policy", "software", "database", "procedure", "model",
            "checklist", "log", "record", "register"
        ];
        if (routeType === "vocational") {
            concreteIndicators = concreteIndicators.concat([
                "forklift", "hazard", "airway", "bleeding", "logbook", "permit",
                "matrix", "meter", "gauge", "valve", "sensor", "pump", "crane",
                "scaffold", "chemical", "substance", "vehicle", "container",
                "label", "sign", "temperature", "pressure", "voltage", "weight"
            ]);
        } else if (routeType === "university") {
            concreteIndicators = concreteIndicators.concat([
                "theory", "framework", "study", "research", "data", "evidence",
                "method", "analysis", "journal", "paper", "hypothesis", "sample",
                "variable", "experiment", "survey", "interview", "literature",
                "citation", "source", "discipline", "paradigm"
            ]);
        } else if (routeType === "pd") {
            concreteIndicators = concreteIndicators.concat([
                "meeting", "conversation", "feedback", "email", "deadline",
                "team", "colleague", "manager", "client", "stakeholder",
                "presentation", "project", "decision", "relationship",
                "performance", "career", "trust", "conflict", "agenda"
            ]);
        } else {
            concreteIndicators = concreteIndicators.concat([
                "hazard", "incident", "sop", "compliance", "audit", "permit",
                "risk", "register", "matrix", "vehicle", "chemical", "sign"
            ]);
        }

        var chunks = collectLearnerTextChunks(cards);
        var allText = chunks.join(' ').toLowerCase();
        var foundCount = concreteIndicators.filter(function(word) { return allText.includes(word); }).length;

        if (foundCount < 2) {
            results.warnings.push("Content may lack concrete nouns. Found only " + foundCount + " indicators for " + routeType + " route.");
            results.score -= 2;
        }
    }

    function checkScenarioFriction(scenarioCards, results) {
        if (!scenarioCards || scenarioCards.length === 0) return;
        var frictionSignals = [
            "urgent", "deadline", "pressure", "risk", "hazard", "spill", "conflict",
            "unclear", "missing", "blocked", "limited", "crowd", "delay", "rush",
            "busy", "unavailable", "waiting", "ambiguity", "competing", "tension",
            "short-staffed", "broken", "malfunct", "overflow", "backlog"
        ];

        scenarioCards.forEach(function(card, idx) {
            if (!card) return;
            var t = JSON.stringify(card).toLowerCase();
            var has = frictionSignals.some(function(s) { return t.includes(s); });
            if (!has) {
                results.errors.push("Card (" + card.cardType + ") lacks friction (hazard/time pressure/ambiguity/stakeholder tension).");
                results.score -= 10;
            }
        });
    }

    function checkRouteSignals(cards, routeType, results) {
        var t = stringifyLower(cards);
        var signals = ROUTE_SIGNALS[routeType] || [];
        var count = signals.reduce(function(acc, w) { return acc + (t.includes(w) ? 1 : 0); }, 0);
        if (count < 2) {
            results.warnings.push("Route signal weak for \"" + routeType + "\" (tone/intent may drift).");
            results.score -= 3;
        }
    }

    function checkAntiDuplication(cards, results) {
        if (!cards || cards.length < 2) return;

        var cardTexts = cards.map(function(card) {
            if (!card) return '';
            var texts = [];
            if (card.bodyText) texts.push(card.bodyText);
            if (card.pcStatement) texts.push(card.pcStatement);
            if (card.context) texts.push(card.context);
            if (card.consequence) texts.push(card.consequence);
            if (card.summaryLine) texts.push(card.summaryLine);
            if (card.skillStatement) texts.push(card.skillStatement);
            if (card.relevance) texts.push(card.relevance);
            if (card.keyPrinciple) texts.push(card.keyPrinciple);
            if (card.turningPoint) texts.push(card.turningPoint);
            if (card.reflection) texts.push(typeof card.reflection === 'string' ? card.reflection : '');
            if (Array.isArray(card.standardItems)) texts = texts.concat(ccTextList(card.standardItems));
            if (Array.isArray(card.keyPoints)) texts = texts.concat(ccTextList(card.keyPoints));
            if (Array.isArray(card.keyIndicators)) texts = texts.concat(ccTextList(card.keyIndicators));
            if (Array.isArray(card.steps)) {
                card.steps.forEach(function(s) {
                    if (!s) return;
                    if (typeof s === 'string') { texts.push(s); return; }
                    if (s.step) texts.push(s.step);
                    if (s.action) texts.push(s.action);
                    var detail = s.detail || s.description || s.explanation || '';
                    if (detail) texts.push(detail);
                });
            }
            if (Array.isArray(card.consequences)) texts = texts.concat(ccTextList(card.consequences));
            if (Array.isArray(card.analysisPrompts)) texts = texts.concat(ccTextList(card.analysisPrompts));
            if (Array.isArray(card.risks)) {
                card.risks.forEach(function(r) {
                    if (r && r.risk) texts.push(r.risk);
                    if (r && r.impact) texts.push(r.impact);
                    if (r && r.mitigation) texts.push(r.mitigation);
                });
            }
            if (Array.isArray(card.policyItems)) {
                card.policyItems.forEach(function(p) {
                    if (p && p.policy) texts.push(p.policy);
                    if (p && p.requirement) texts.push(p.requirement);
                });
            }
            if (Array.isArray(card.frameworks)) {
                card.frameworks.forEach(function(f) {
                    if (f && f.name) texts.push(f.name);
                    if (f && f.principle) texts.push(f.principle);
                    if (f && f.limitation) texts.push(f.limitation);
                });
            }
            if (Array.isArray(card.considerations)) {
                card.considerations.forEach(function(c) {
                    if (c && c.dimension) texts.push(c.dimension);
                    if (c && c.description) texts.push(c.description);
                });
            }
            if (Array.isArray(card.frameworkSteps)) {
                card.frameworkSteps.forEach(function(s) {
                    if (s && s.step) texts.push(s.step);
                    if (s && s.explanation) texts.push(s.explanation);
                });
            }
            if (Array.isArray(card.applications)) {
                card.applications.forEach(function(a) {
                    if (a && a.situation) texts.push(a.situation);
                    if (a && a.action) texts.push(a.action);
                });
            }
            if (Array.isArray(card.actions)) {
                card.actions.forEach(function(a) {
                    if (a && a.heading) texts.push(a.heading);
                    if (a && Array.isArray(a.bullets)) texts = texts.concat(a.bullets);
                });
            }
            if (Array.isArray(card.errorItems)) {
                card.errorItems.forEach(function(e) {
                    if (e && e.error) texts.push(e.error);
                    if (e && e.consequence) texts.push(e.consequence);
                });
            }
            if (Array.isArray(card.pitfallItems)) {
                card.pitfallItems.forEach(function(p) {
                    if (p && p.pitfall) texts.push(p.pitfall);
                    if (p && p.consequence) texts.push(p.consequence);
                });
            }
            if (Array.isArray(card.sceneParts)) {
                card.sceneParts.forEach(function(part) {
                    if (!part) return;
                    var t = part.text || part.content || part.description || '';
                    if (t) texts.push(t);
                    if (part.title) texts.push(part.title);
                });
            }
            if (Array.isArray(card.conceptInsights)) {
                card.conceptInsights.forEach(function(insight) {
                    if (!insight) return;
                    var t = insight.text || insight.content || insight.description || '';
                    if (t) texts.push(t);
                    if (insight.title) texts.push(insight.title);
                });
            }
            if (Array.isArray(card.items)) {
                card.items.forEach(function(item) {
                    if (!item) return;
                    if (typeof item === 'string') { texts.push(item); return; }
                    var m = item.mistake || item.error || item.pitfall || '';
                    if (m) texts.push(m);
                    if (item.consequence) texts.push(item.consequence);
                });
            }
            if (Array.isArray(card.goodItems)) {
                card.goodItems.forEach(function(item) {
                    if (!item) return;
                    var t = typeof item === 'string' ? item : (item.text || item.behaviour || item.criterion || '');
                    if (t) texts.push(t);
                });
            }
            if (Array.isArray(card.badItems)) {
                card.badItems.forEach(function(item) {
                    if (!item) return;
                    var t = typeof item === 'string' ? item : (item.text || '');
                    if (t) texts.push(t);
                });
            }
            if (card.question) texts.push(card.question);
            if (Array.isArray(card.options)) {
                card.options.forEach(function(opt) {
                    if (!opt) return;
                    if (opt.text) texts.push(opt.text);
                    if (opt.feedback) texts.push(opt.feedback);
                });
            }
            return texts.join(' ').toLowerCase();
        });

        for (var i = 0; i < cardTexts.length; i++) {
            for (var j = i + 1; j < cardTexts.length; j++) {
                if (cardTexts[i].length > 30 && cardTexts[j].length > 30) {
                    var sim = jaccardSimilarity(cardTexts[i], cardTexts[j]);
                    if (sim > 0.7) {
                        results.warnings.push("Cards " + (i + 1) + " and " + (j + 1) + " may have duplicated content (similarity: " + Math.round(sim * 100) + "%).");
                        results.score -= 3;
                        return;
                    }
                }
            }
        }
    }

    function validateLanguageLayer(cards, routeType, languageCode, policy, results) {
        var langPack = getLangPack(languageCode);

        if (policy.checkEnglishLeakage && !isEnglishVariant(languageCode)) {
            var t = stringifyLower(cards);
            var hits = ENGLISH_LEAK_TOKENS.filter(function(tok) { return t.includes(tok); }).length;
            if (hits >= 6) {
                results.warnings.push("Possible English leakage (mixed language). Make sure all learner-visible text is in the selected language.");
                results.score -= 5;
            }
        }

        if (policy.enforceUnsafePrefix && langPack) {
            var commonErrorCards = cards.filter(function(c) { return c && (c.cardType === 'common-errors' || c.cardType === 'mistakes'); });
            commonErrorCards.forEach(function(card) {
                var isMistakes = card.cardType === 'mistakes';
                var errorItems = isMistakes
                    ? (card.items || []).map(function(item) { return { error: typeof item === 'string' ? item : (item.mistake || item.error || item.pitfall || '') }; })
                    : (card.errorItems || []);
                if (!Array.isArray(errorItems)) return;
                var startStrict = !(languageCode === 'ja-JP' || languageCode === 'ko-KR');
                errorItems.forEach(function(item) {
                    if (!item || !item.error) return;
                    if (startStrict) {
                        if (!startsWithAny(item.error, langPack.doNot)) {
                            var msg = "Error item does not start with expected \"Do not\" equivalent for " + languageCode + ": \"" + (item.error || '').substring(0, 50) + "\"";
                            if (routeType === "university") {
                                results.warnings.push(msg);
                                results.score -= 2;
                            } else {
                                results.errors.push(msg);
                                results.score -= 5;
                            }
                        }
                    } else {
                        var ok = langPack.doNot.some(function(p) { return (item.error || '').includes(p); });
                        if (!ok) {
                            results.warnings.push("Error item may be missing a clear negative imperative for " + languageCode + ".");
                            results.score -= 3;
                        }
                    }
                });
            });
        }

        if (policy.enforceModalityStrength && langPack && (routeType === "workplace" || routeType === "vocational")) {
            var tMod = stringifyLower(cards);
            var hasMust = langPack.must.some(function(m) { return tMod.includes(m.toLowerCase()); });
            if (!hasMust) {
                results.warnings.push("Compliance modality may be weak in " + languageCode + " (no strong \"must/required\" equivalents detected).");
                results.score -= 4;
            }
        }

        if (policy.enforceEscalationPresence && langPack && (routeType === "workplace" || routeType === "vocational")) {
            var tEsc = stringifyLower(cards);
            var hasEsc = langPack.escalation.some(function(e) { return tEsc.includes(e.toLowerCase()); });
            if (!hasEsc) {
                results.warnings.push("Escalation/notification language may be missing in " + languageCode + ".");
                results.score -= 3;
            }
        }

        if (policy.enableRTLChecks && RTL_LANGS.indexOf(languageCode) !== -1) {
            rtlSanityChecks(cards, languageCode, results);
        }
    }

    function rtlSanityChecks(cards, languageCode, results) {
        var chunks = collectLearnerTextChunks(cards).join("\n");

        var heavyAscii = /[A-Za-z]{6,}/.test(chunks);
        if (heavyAscii) {
            results.warnings.push("RTL language (" + languageCode + ") contains long Latin sequences; check for unintended English leakage.");
            results.score -= 3;
        }

        var latinOptionLabels = /\bA\)|\bB\)|\bC\)|\bD\)/.test(chunks);
        if (latinOptionLabels) {
            results.warnings.push("RTL language (" + languageCode + ") contains Latin option labels (A/B/C/D). Consider localised numbering.");
            results.score -= 2;
        }
    }

    function buildEnterpriseRevisionPrompt(config) {
        var mode = config.mode || 'REVISE';
        var attempt = config.attempt || 1;
        var issues = config.issues || { errors: [], warnings: [] };
        var routeType = config.routeType || 'vocational';
        var languageCode = config.languageCode || 'en-AU';
        var expectedCount = EXPECTED_CARD_COUNTS[routeType] || 6;

        var issueLines = [];
        (issues.errors || []).forEach(function(e) { issueLines.push("ERROR: " + e); });
        (issues.warnings || []).slice(0, 5).forEach(function(w) { issueLines.push("WARNING: " + w); });

        var instruction = mode === 'REGENERATE'
            ? 'Content quality is too low (score below ' + DEFAULT_POLICY.hardFailScore + '). COMPLETELY REGENERATE all ' + expectedCount + ' cards from scratch.'
            : 'Content needs targeted fixes. REVISE the specific issues listed below while keeping the overall structure intact.';

        return [
            'ENTERPRISE QA REVISION (Attempt ' + attempt + '/' + DEFAULT_POLICY.maxAttempts + ')',
            '',
            instruction,
            '',
            'ISSUES FOUND:',
            issueLines.join('\n'),
            '',
            'ROUTE: ' + routeType,
            'LANGUAGE: ' + languageCode,
            '',
            'Fix ALL listed issues. Return ONLY valid JSON array of exactly ' + expectedCount + ' cards.'
        ].join('\n');
    }

    function buildAuditRecord(config) {
        return {
            timestamp: new Date().toISOString(),
            routeType: config.routeType || 'unknown',
            languageCode: config.languageCode || 'en-AU',
            attempts: config.attempts || 1,
            finalScore: config.report ? config.report.score : 0,
            passed: config.report ? config.report.pass : false,
            errorCount: config.report ? config.report.errors.length : 0,
            warningCount: config.report ? config.report.warnings.length : 0,
            errors: config.report ? config.report.errors.slice(0, 5) : [],
            warnings: config.report ? config.report.warnings.slice(0, 5) : []
        };
    }

    function mapRouteType(mode) {
        if (mode === 'vet') return 'vocational';
        if (mode === 'university') return 'university';
        if (mode === 'workplace') return 'workplace';
        if (mode === 'pd') return 'pd';
        return 'vocational';
    }

    function mapLanguageCode(langCode) {
        if (!langCode) return 'en-AU';
        if (LANGUAGE_PACKS[langCode]) return langCode;
        var baseCode = langCode.split('-')[0];
        var candidates = Object.keys(LANGUAGE_PACKS);
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].startsWith(baseCode)) return candidates[i];
        }
        return 'en-AU';
    }

    return {
        DEFAULT_POLICY: DEFAULT_POLICY,
        LANGUAGE_PACKS: LANGUAGE_PACKS,
        validateEnterpriseContent: validateEnterpriseContent,
        buildEnterpriseRevisionPrompt: buildEnterpriseRevisionPrompt,
        buildAuditRecord: buildAuditRecord,
        mapRouteType: mapRouteType,
        mapLanguageCode: mapLanguageCode,
        collectLearnerTextChunks: collectLearnerTextChunks,
        jaccardSimilarity: jaccardSimilarity
    };
});
