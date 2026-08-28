/**
 * Content Creator  -  Shared icon data and icon-lookup helpers.
 *
 * Extracted from player5.js (v9.83 Phase-2) to eliminate the large inline SVG
 * blocks from the player module and make them reusable by any AMD consumer.
 *
 * Exports:
 *   ICONS                  {Object}   name  ->  SVG string
 *   CONTEXTUAL_ICON_MAP    {Array}    keyword-based contextual mappings
 *   CONTRAST_PAIRS         {Object}   contrast-type  ->  { positive, negative, icons }
 *   getIcon(name)          {Function} safe ICONS lookup (falls back to shield)
 *   getContextualSlideIcon(title, description)  {Function} keyword-match  ->  icon name
 *
 * NOT exported here (kept in player5.js  -  needs UI_LABELS + currentLang):
 *   getContrastPair(contrastType)
 *
 * THIRD PARTY CONTENT:
 * The SVG path data in the ICONS table below is taken from Lucide
 * (https://lucide.dev), a fork of Feather Icons, and is used under the
 * ISC Licence. Copyright (c) for portions of Lucide are held by Cole Bemis
 * 2013-2022 as part of Feather (MIT); all other copyright (c) for Lucide are
 * held by Lucide Contributors 2022. See thirdpartylibs.xml for the plugin's
 * declaration of this library.
 *
 * @module     mod_contentcreator/cc-icons
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define([], function () {
    'use strict';

    // ===========================================================================
    // ICON SVG STRINGS
    // Extended icon mapping  -  content-specific icons
    // ===========================================================================
    var ICONS = {
        shield: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        glasses: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-4 0"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2"/><path d="M21.5 13 19 7c-.7-1.3-1.4-2-3-2"/></svg>',
        ear: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/></svg>',
        hand: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
        'hard-hat': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6h0"/><path d="M14 6h0a6 6 0 0 1 6 6v3"/></svg>',
        sparkles: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
        wrench: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
        'alert-triangle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
        droplets: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>',
        zap: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        flame: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
        eye: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
        'check-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        users: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        clock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        'file-text': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>',
        'circle-slash': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>',
        volume2: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
        'arrow-left': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
        'chevron-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
        'chevron-left': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
        book: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        clipboard: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
        briefcase: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
        target: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        settings: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
        'graduation-cap': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
        heartbeat: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
        lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
        truck: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
        phone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        building: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
        info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
        pencil: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
        save: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
        zoomIn: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
        plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
        trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
        loader: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cc5-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
        'thumbs-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
        'thumbs-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>',
        'shield-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>',
        'badge-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>',
        'ban': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
        'trending-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
        'trending-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
        'user-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
        'user-x': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg>',
        'star': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        'alert-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
        'smile': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>',
        'frown': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>',
        'x-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
        'check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        'message-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
        'handshake': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/></svg>',
        'lightbulb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
        'brain': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg>',
        'megaphone': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
        'scale': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
        'puzzle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></svg>',
        'list-checks': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>',
        'clipboard-list': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
        'clipboard-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>',
        'file-check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
        'repeat': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
        'map-pin': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
        'ruler': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>',
        'cloud': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>',
        'anchor': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>',
        'layers': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
        'search': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
        'zoom-in': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>',
        'download': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>',
        'file-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>',
        'image-plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
        'image': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
        'gallery': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" rx="2"/><path d="M21 15.2V21h-5.8"/><path d="m21 21-4.3-4.3a2.12 2.12 0 0 0-3 0L3 21"/><circle cx="9" cy="9" r="2"/></svg>',
        'pause': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        'refresh-cw': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
        'tag': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
        'award': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
        'book-open': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        'help-circle': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
        'folder': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
        'calendar': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
        'dollar-sign': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
    };

    // ===========================================================================
    // COMPREHENSIVE CONTEXTUAL ICON MAPPING (v6.5.30)
    // 60+ keyword mappings for learning and activity slides across all routes
    // Priority: Specific context > General category > Default
    // ===========================================================================
    var CONTEXTUAL_ICON_MAP = [
        // TIER 1: COMMUNICATION & CONSULTATION (highest priority for workplace/VET)
        { keywords: ['consult', 'consulting', 'discuss', 'discussing', 'conversation', 'dialogue'], icon: 'message-circle' },
        { keywords: ['supervisor', 'supervisors', 'manager', 'managers', 'boss', 'lead', 'leader'], icon: 'user-check' },
        { keywords: ['communicate', 'communicating', 'communication', 'brief', 'briefing', 'debrief'], icon: 'message-circle' },
        { keywords: ['meeting', 'meetings', 'toolbox', 'huddle', 'standup'], icon: 'users' },
        { keywords: ['feedback', 'review', 'reviews', 'performance'], icon: 'message-circle' },
        { keywords: ['collaborate', 'collaboration', 'teamwork', 'team', 'teams', 'colleague'], icon: 'users' },
        { keywords: ['negotiate', 'negotiation', 'resolve', 'resolution', 'conflict'], icon: 'handshake' },
        { keywords: ['escalate', 'escalation', 'refer', 'referral'], icon: 'trending-up' },
        { keywords: ['report', 'reporting', 'notify', 'notification', 'inform', 'informing'], icon: 'megaphone' },

        // TIER 2: SPECIFIC WORK ENVIRONMENTS (VET high priority)
        { keywords: ['height', 'elevat', 'ladder', 'scaffold', 'roof', 'platform', 'working at height'], icon: 'hard-hat' },
        { keywords: ['confine', 'enclosed', 'tank', 'pit', 'trench', 'confined space'], icon: 'hard-hat' },
        { keywords: ['electric', 'power', 'energy', 'voltage', 'circuit', 'wiring', 'electrical'], icon: 'zap' },
        { keywords: ['chemical', 'hazmat', 'toxic', 'corrosive', 'flammable', 'substance', 'spill'], icon: 'droplets' },
        { keywords: ['fire', 'emergency', 'evacuat', 'rescue', 'first aid', 'burn'], icon: 'flame' },
        { keywords: ['fall', 'harness', 'anchor', 'lanyard', 'arrest', 'fall protection'], icon: 'anchor' },

        // TIER 3: EQUIPMENT & PHYSICAL CONTROLS
        { keywords: ['ppe', 'helmet', 'glove', 'goggle', 'respirator', 'protective', 'gear'], icon: 'hard-hat' },
        { keywords: ['machine', 'machinery', 'equipment', 'tool', 'plant', 'operate', 'operating'], icon: 'wrench' },
        // v10.88: weighbridge and weight/load keywords  ->  truck icon (weighbridges weigh heavy vehicles)
        { keywords: ['weighbridge', 'weigh bridge', 'weigh station', 'axle load', 'gross mass', 'gvm', 'gross vehicle mass', 'overloaded', 'over weight', 'overweight vehicle', 'payload'], icon: 'truck' },
        { keywords: ['weight limit', 'load limit', 'load capacity', 'tonne', 'tonnes', 'metric ton'], icon: 'truck' },
        { keywords: ['vehicle', 'forklift', 'crane', 'truck', 'transport', 'drive', 'driving'], icon: 'truck' },
        { keywords: ['sign', 'signage', 'barricade', 'barrier', 'cone', 'exclusion', 'zone'], icon: 'alert-triangle' },
        { keywords: ['clean', 'cleaning', 'hygiene', 'sanit', 'disinfect'], icon: 'sparkles' },

        // TIER 4: HAZARDS & RISKS
        { keywords: ['hazard', 'risk', 'danger', 'dangerous'], icon: 'alert-triangle' },
        { keywords: ['warn', 'warning', 'caution', 'alert'], icon: 'alert-triangle' },
        { keywords: ['injur', 'incident', 'accident', 'harm'], icon: 'heartbeat' },
        { keywords: ['safe', 'safety', 'protect', 'protection'], icon: 'shield' },

        // TIER 5: DOCUMENTATION & COMPLIANCE
        { keywords: ['document', 'documentation', 'record', 'recording', 'log', 'logging', 'outdated', 'expired', 'obsolete', 'old version', 'superseded'], icon: 'clipboard-list' },
        { keywords: ['permit', 'permits', 'authoris', 'authoriz', 'approval', 'approv'], icon: 'file-check' },
        { keywords: ['swms', 'jsa', 'jsea', 'take 5', 'licence', 'license', 'certificate'], icon: 'file-check' },
        { keywords: ['policy', 'policies', 'procedure', 'procedures', 'standard', 'standards'], icon: 'clipboard-check' },
        { keywords: ['audit', 'auditing', 'compliance', 'compliant', 'regulation', 'regulatory'], icon: 'clipboard-check' },
        { keywords: ['form', 'forms', 'paperwork', 'checklist', 'checklists'], icon: 'clipboard-list' },

        // TIER 6: TRAINING & LEARNING (University/VET)
        { keywords: ['train', 'training', 'induct', 'induction', 'competenc', 'qualif'], icon: 'graduation-cap' },
        { keywords: ['learn', 'learning', 'study', 'studying', 'understand', 'understanding'], icon: 'book-open' },
        { keywords: ['assess', 'assessment', 'evaluate', 'evaluation', 'exam', 'test'], icon: 'clipboard-check' },
        { keywords: ['research', 'researching', 'analyse', 'analysis', 'analyz', 'critical'], icon: 'search' },
        { keywords: ['theory', 'theoretical', 'concept', 'concepts', 'principle', 'principles'], icon: 'lightbulb' },
        { keywords: ['think', 'thinking', 'reflect', 'reflection', 'consider'], icon: 'brain' },

        // TIER 7: WORKPLACE/BUSINESS (Workplace route)
        { keywords: ['customer', 'client', 'service', 'support'], icon: 'smile' },
        { keywords: ['professional', 'professionalism', 'conduct', 'behaviour', 'behavior'], icon: 'user-check' },
        { keywords: ['ethics', 'ethical', 'integrity', 'honest', 'honesty'], icon: 'scale' },
        { keywords: ['decision', 'decisions', 'decide', 'deciding', 'choice', 'choices'], icon: 'help-circle' },
        { keywords: ['problem', 'problems', 'solve', 'solving', 'solution', 'solutions'], icon: 'lightbulb' },
        { keywords: ['goal', 'goals', 'objective', 'objectives', 'target', 'targets'], icon: 'target' },
        { keywords: ['quality', 'standard', 'excellence', 'best practice'], icon: 'award' },
        { keywords: ['budget', 'cost', 'costs', 'finance', 'financial', 'money', 'spend', 'spending', 'expenditure', 'funds', 'funding', 'allocation', 'allocations', 'invoice', 'invoicing', 'pricing', 'revenue', 'profit', 'loss'], icon: 'dollar-sign' },
        { keywords: ['time', 'timing', 'schedule', 'deadline', 'deadlines'], icon: 'clock' },
        { keywords: ['project', 'projects', 'manage', 'management', 'managing'], icon: 'folder' },
        { keywords: ['plan', 'planning', 'prepare', 'preparation', 'organis', 'organiz'], icon: 'clipboard-check' },

        // TIER 8: PROCESS & ACTIONS
        { keywords: ['inspect', 'inspection', 'check', 'checking', 'verify', 'verification'], icon: 'eye' },
        { keywords: ['monitor', 'monitoring', 'supervise', 'supervising', 'oversee', 'observe'], icon: 'eye' },
        { keywords: ['method', 'methods', 'step', 'steps', 'process', 'processes'], icon: 'list-checks' },
        { keywords: ['perform', 'performing', 'conduct', 'conducting', 'execute', 'carry out'], icon: 'check-circle' },
        { keywords: ['maintain', 'maintenance', 'repair', 'repairing', 'fix', 'fixing'], icon: 'wrench' },
        { keywords: ['install', 'installation', 'set up', 'setting up', 'assemble'], icon: 'wrench' },
        { keywords: ['remove', 'removing', 'dismantle', 'dismantling', 'dispose', 'disposal'], icon: 'trash' },

        // TIER 9: ENVIRONMENT & CONDITIONS
        { keywords: ['weather', 'wind', 'rain', 'temperature', 'heat', 'cold'], icon: 'cloud' },
        { keywords: ['location', 'site', 'workplace', 'area', 'environment'], icon: 'map-pin' },
        { keywords: ['store', 'storage', 'storing', 'warehouse', 'inventory'], icon: 'folder' },

        // TIER 10: TIME & FREQUENCY
        { keywords: ['before', 'prior', 'first', 'initial', 'start', 'begin'], icon: 'clock' },
        { keywords: ['daily', 'regular', 'routine', 'always', 'ongoing', 'continuous'], icon: 'repeat' },
        { keywords: ['complete', 'completion', 'finish', 'final', 'end'], icon: 'check-circle' }
    ];

    // ===========================================================================
    // CONTRAST PAIRS CONFIGURATION (v6.5.7)
    // Dynamic headings and icons based on content context
    // ===========================================================================
    var CONTRAST_PAIRS = {
        'dos-donts': {
            positive: "Do's", negative: "Don'ts",
            positiveIcon: 'check-circle', negativeIcon: 'x-circle',
            positiveListIcon: 'check', negativeListIcon: 'x'
        },
        'safe-unsafe': {
            positive: "Safe Practice", negative: "Unsafe Practice",
            positiveIcon: 'shield-check', negativeIcon: 'alert-triangle',
            positiveListIcon: 'shield-check', negativeListIcon: 'alert-triangle'
        },
        'great-poor-service': {
            positive: "Great Customer Service", negative: "Poor Customer Service",
            positiveIcon: 'thumbs-up', negativeIcon: 'thumbs-down',
            positiveListIcon: 'thumbs-up', negativeListIcon: 'thumbs-down'
        },
        'compliant-noncompliant': {
            positive: "Compliant", negative: "Non-Compliant",
            positiveIcon: 'badge-check', negativeIcon: 'ban',
            positiveListIcon: 'badge-check', negativeListIcon: 'ban'
        },
        'above-below-line': {
            positive: "Above the Line", negative: "Below the Line",
            positiveIcon: 'trending-up', negativeIcon: 'trending-down',
            positiveListIcon: 'trending-up', negativeListIcon: 'trending-down'
        },
        'professional-unprofessional': {
            positive: "Professional", negative: "Unprofessional",
            positiveIcon: 'user-check', negativeIcon: 'user-x',
            positiveListIcon: 'user-check', negativeListIcon: 'user-x'
        },
        'effective-ineffective': {
            positive: "Effective", negative: "Ineffective",
            positiveIcon: 'target', negativeIcon: 'x-circle',
            positiveListIcon: 'target', negativeListIcon: 'x-circle'
        },
        'best-avoid': {
            positive: "Best Practice", negative: "Avoid",
            positiveIcon: 'star', negativeIcon: 'alert-circle',
            positiveListIcon: 'star', negativeListIcon: 'alert-circle'
        },
        'correct-incorrect': {
            positive: "Correct", negative: "Incorrect",
            positiveIcon: 'check-circle', negativeIcon: 'x-circle',
            positiveListIcon: 'check', negativeListIcon: 'x'
        },
        'tick-cross': {
            positive: "Correct", negative: "Incorrect",
            positiveIcon: 'check-circle', negativeIcon: 'x-circle',
            positiveListIcon: 'check', negativeListIcon: 'x'
        },
        'acceptable-unacceptable': {
            positive: "Acceptable", negative: "Unacceptable",
            positiveIcon: 'smile', negativeIcon: 'frown',
            positiveListIcon: 'smile', negativeListIcon: 'frown'
        }
    };

    var GENERIC_AI_ICONS = {
        'sparkles': 1, 'star': 1, 'check-circle': 1
    };

    // ===========================================================================
    // CARD-TYPE ICON STRATEGY (ChatGPT recommendation  -  card-aware fallbacks)
    // When semantic matching returns nothing, use card-appropriate icon pools
    // ===========================================================================
    var CARD_ICON_STRATEGY = {
        'hook-scenario':      ['map-pin', 'users', 'message-circle', 'flame'],
        'concept-explainer':  ['lightbulb', 'message-circle', 'clipboard-check'],
        'mental-model':       ['list-checks', 'clipboard-check', 'repeat'],
        'applied-scenario':   ['briefcase', 'target', 'brain', 'check-circle'],
        'mistakes':           ['alert-triangle', 'alert-circle', 'heartbeat'],
        'competency-summary': ['check-circle', 'alert-circle'],
        'decision-point':     ['help-circle', 'brain']
    };

    var SCENE_PART_TITLE_ICONS = [
        { patterns: ['setting', 'location', 'scene', 'workplace', 'site', 'environment', 'context', 'where'], icon: 'map-pin' },
        { patterns: ['who', 'people', 'team', 'involved', 'here', 'crew', 'staff', 'role', 'player'], icon: 'users' },
        { patterns: ['happened', 'went wrong', 'event', 'incident', 'problem', 'issue', 'tension', 'challenge', 'trigger', 'action', 'moment'], icon: 'zap' },
        { patterns: ['pressure', 'stakes', 'risk', 'consequence', 'deadline', 'urgency', 'truth', 'impact', 'cost', 'danger', 'why it matters'], icon: 'alert-triangle' }
    ];

    var SCENE_PART_POSITION_ICONS = ['map-pin', 'users', 'zap', 'alert-triangle', 'alert-circle'];

    /**
     * Get icon SVG by name. Falls back to shield if name is unknown.
     * @param {string} name - Icon key from ICONS
     * @returns {string} SVG string
     */
    function getIcon(name) {
        return ICONS[name] || ICONS.shield;
    }

    function hasIcon(name) {
        return !!(name && ICONS[name]);
    }

    /**
     * Priority-based semantic icon matching (ChatGPT v2 recommendation).
     * Uses regex tiers  -  Risk > Communication > People > Process > Thinking > Time > Business.
     * Returns null when nothing matches (caller uses card-type or AI fallback).
     * @param {string} title
     * @param {string} text
     * @returns {string|null}
     */
    function getContextualSlideIcon(title, text) {
        var t = ((title || '') + ' ' + (text || '')).toLowerCase();

        // PRIORITY 1  -  RISK / SAFETY (highest signal)
        if (/risk|hazard|danger|unsafe|caution|warning/.test(t))    return 'alert-triangle';
        if (/injur|harm|incident|accident|hurt/.test(t))             return 'heartbeat';
        if (/fire|flame|burn|emergency|evacuat/.test(t))             return 'flame';
        if (/electric|voltage|shock|circuit/.test(t))                return 'zap';
        if (/chemical|toxic|corrosive|flammable|spill|substance/.test(t)) return 'droplets';
        if (/height|ladder|scaffold|harness|fall arrest/.test(t))    return 'anchor';

        // PRIORITY 2  -  COMMUNICATION
        if (/email|call|talk|discuss|inform|convers|dialogue/.test(t)) return 'message-circle';
        if (/report|notify|alert|announce|broadcast|escalat/.test(t)) return 'megaphone';
        if (/phone|contact|reach/.test(t))                            return 'phone';

        // PRIORITY 3  -  PEOPLE
        if (/supervisor|manager|boss|lead|approv/.test(t))           return 'user-check';
        if (/team|staff|colleague|crew|group|worker/.test(t))        return 'users';
        if (/negotiat|agreement|coordinat|handshake/.test(t))        return 'handshake';

        // PRIORITY 4  -  PROCESS / COMPLIANCE
        if (/step|process|procedure|method/.test(t))                  return 'list-checks';
        if (/policy|compliance|regulation|audit|standard/.test(t))   return 'clipboard-check';
        if (/permit|authoris|authoriz|licence|license|certificate/.test(t)) return 'file-check';
        if (/document|record|log|form|paperwork|checklist/.test(t))  return 'clipboard-list';

        // PRIORITY 5  -  THINKING / LEARNING
        if (/decide|decision|consider|think|reflect/.test(t))        return 'brain';
        if (/check|review|inspect|verify|examine/.test(t))           return 'search';
        if (/train|induct|qualif|competenc/.test(t))                 return 'graduation-cap';
        if (/learn|study|theory|concept|principle/.test(t))          return 'book-open';
        if (/idea|solution|innovat|approach/.test(t))                return 'lightbulb';

        // PRIORITY 6  -  TIME
        if (/deadline|urgent|time.limit|before|prior/.test(t))      return 'clock';
        if (/schedul|calendar|plan|prepare/.test(t))                  return 'calendar';

        // PRIORITY 7  -  BUSINESS
        if (/client|customer|service|support/.test(t))               return 'briefcase';
        if (/cost|budget|financ|money|spend|revenue|profit/.test(t)) return 'dollar-sign';
        if (/goal|objective|target/.test(t))                          return 'target';

        // PRIORITY 8  -  EQUIPMENT / ENVIRONMENT
        if (/vehicle|forklift|truck|transport|drive/.test(t))        return 'truck';
        if (/tool|equipment|machine|device|operate/.test(t))         return 'wrench';
        if (/location|site|workplace|area|environment/.test(t))      return 'map-pin';
        if (/weather|wind|rain|temperature|weather/.test(t))         return 'cloud';

        return null;
    }

    // Extended pool used when card-type pool and position icons are all exhausted
    var EXTENDED_ICON_POOL = ['search', 'brain', 'target', 'clipboard-list', 'message-circle'];

    /**
     * Resolve the best icon for a scenePart, mistake item, or flip card.
     * Flow: semantic match  ->  card-type pool  ->  AI icon  ->  position fallback  ->  extended pool.
     * Uniqueness is enforced per card via the shared usedIcons Set passed from the call site.
     * @param {string}      aiIcon    - Icon string from AI response
     * @param {string}      partTitle - Part/item title
     * @param {string}      partText  - Part/item body text
     * @param {number}      partIndex - 0-based index within the card
     * @param {string|null} cardType  - Card type key (e.g. 'hook-scenario', 'mistakes')
     * @param {Set|null}    usedIcons - Shared Set tracking icons already used in this card
     * @returns {string} Resolved icon name (guaranteed unique within the card)
     */
    function resolveScenePartIcon(aiIcon, partTitle, partText, partIndex, cardType, usedIcons) {
        usedIcons = usedIcons || new Set();
        var idx = partIndex || 0;

        // 0. Explicitly stored icon  -  always honour first.
        //    If the teacher chose this icon via the Edit Slide icon picker it must be
        //    respected before any default selection logic runs.
        if (aiIcon && ICONS[aiIcon]) {
            usedIcons.add(aiIcon);
            return aiIcon;
        }

        // 1. Card-type positional default  -  strict position lookup, no content analysis.
        //    Part 0 always gets pool[0], part 1 always gets pool[1], etc. This gives
        //    predictable, semantically appropriate icons regardless of the part's text
        //    content. Only fires when no stored icon exists (AI-generated or new content).
        if (cardType && CARD_ICON_STRATEGY[cardType]) {
            var pool = CARD_ICON_STRATEGY[cardType];
            var resolved = pool[idx % pool.length];
            usedIcons.add(resolved);
            return resolved;
        }

        // 2. Semantic match  -  for card types with no defined pool (e.g. custom card types)
        var semanticIcon = getContextualSlideIcon(partTitle || '', partText || '');
        if (semanticIcon && !usedIcons.has(semanticIcon)) {
            usedIcons.add(semanticIcon);
            return semanticIcon;
        }

        // 3. Position icons  -  scan for first unused
        for (var j = 0; j < SCENE_PART_POSITION_ICONS.length; j++) {
            var posIcon = SCENE_PART_POSITION_ICONS[(idx + j) % SCENE_PART_POSITION_ICONS.length];
            if (!usedIcons.has(posIcon)) {
                usedIcons.add(posIcon);
                return posIcon;
            }
        }

        // 4. Extended pool  -  last resort before absolute fallback
        for (var k = 0; k < EXTENDED_ICON_POOL.length; k++) {
            if (!usedIcons.has(EXTENDED_ICON_POOL[k])) {
                usedIcons.add(EXTENDED_ICON_POOL[k]);
                return EXTENDED_ICON_POOL[k];
            }
        }

        // 5. Safety reset  -  if all pools exhausted (extreme edge case), clear and restart
        if (usedIcons.size > 10) {
            usedIcons.clear();
        }

        return 'map-pin';
    }

    return {
        ICONS: ICONS,
        CONTEXTUAL_ICON_MAP: CONTEXTUAL_ICON_MAP,
        CARD_ICON_STRATEGY: CARD_ICON_STRATEGY,
        CONTRAST_PAIRS: CONTRAST_PAIRS,
        getIcon: getIcon,
        hasIcon: hasIcon,
        getContextualSlideIcon: getContextualSlideIcon,
        resolveScenePartIcon: resolveScenePartIcon
    };
});
