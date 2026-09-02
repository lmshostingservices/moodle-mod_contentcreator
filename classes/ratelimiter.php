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
 * Sliding-window rate limiter for Content Creator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

/**
 * Per-user, per-bucket sliding-window rate limiter backed by the Moodle Cache API.
 *
 * Per-user buckets: 'generate' (60/hour), 'voice' (100/hour), 'vendor' (200/hour),
 * 'vendorread' (600/hour). Site-wide buckets (v13.85, via check_site): 'voice'
 * (2000/hour) and 'generate' (1000/hour).
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class ratelimiter {
    /**
     * Enforce both the site-wide and the per-user allowance for a bucket.
     *
     * v13.94.3: the admin settings ratelimitgenerate / ratelimitvoice / ratelimitvendor and
     * the site ceilings were read only by mod_contentcreator_check_ratelimit() in ajax.php. The
     * two web-service entry points, external\generate_voiceover and
     * external\generate_document_example, passed hardcoded 100 and 60 straight to check()
     * instead, so an administrator who raised or lowered a limit changed only one of the two
     * ways the same work reaches the vendor - and a bucket set to 0 to disable it kept
     * running on the web-service path. Resolving the settings here means every caller gets
     * the configured value, and the site ceiling can no longer be skipped by accident.
     *
     * @param int $userid User id.
     * @param string $bucket Logical bucket name, e.g. 'generate'.
     * @param int $default Per-user ceiling to use when the site has not configured one.
     * @param int $window Window length in seconds.
     * @return void
     * @throws \moodle_exception
     */
    public static function enforce(int $userid, string $bucket, int $default, int $window): void {
        // The per-user ceiling is admin-configurable so a site doing bulk authoring can raise
        // it without a code change, and an author who trips it can be unblocked from the
        // settings page. A configured value of 0 disables that bucket. Unknown buckets keep
        // the caller's default.
        $settingmap = [
            'generate' => 'ratelimitgenerate',
            'vendor' => 'ratelimitvendor',
            'voice' => 'ratelimitvoice',
            // FIX-CC-VENDORREAD-NOT-CONFIGURABLE (v13.95.1): the read-only bucket was the one
            // bucket with no setting behind it, so its 600/hour ceiling could not be raised or
            // disabled by an administrator - unlike every other bucket here. An author who met
            // it was locked out of reading their own credit balance, which spends nothing, with
            // no way for the site to do anything about it.
            'vendorread' => 'ratelimitvendorread',
        ];
        $max = $default;
        if (isset($settingmap[$bucket])) {
            $configured = get_config('mod_contentcreator', $settingmap[$bucket]);
            if ($configured !== false && $configured !== '' && is_numeric($configured)) {
                $max = (int)$configured;
            }
        }

        // The aggregate ceiling (v13.85) is checked BEFORE the per-user one, so a site that
        // has hit its own limit reports that rather than telling an individual user they
        // personally made too many requests. Read-only buckets are exempt: they spend no
        // credits and cost the vendor nothing.
        $sitemap = [
            'voice' => ['sitelimitvoice', 2000],
            'generate' => ['sitelimitgenerate', 1000],
            'vendor' => ['sitelimitgenerate', 1000],
        ];
        if (isset($sitemap[$bucket])) {
            [$sitesetting, $sitedefault] = $sitemap[$bucket];
            $sitemax = get_config('mod_contentcreator', $sitesetting);
            $sitemax = ($sitemax !== false && $sitemax !== '' && is_numeric($sitemax))
                ? (int)$sitemax
                : $sitedefault;
            self::check_site($bucket, $sitemax, $window);
        }

        self::check($userid, $bucket, $max, $window);
    }

    /**
     * Throw if the user has exceeded the allowance for a bucket.
     *
     * Records the current call when it is permitted, so each successful call
     * consumes one slot in the window.
     *
     * @param int $userid User id.
     * @param string $bucket Logical bucket name, e.g. 'generate'.
     * @param int $max Maximum calls permitted in the window.
     * @param int $window Window length in seconds.
     * @return void
     * @throws \moodle_exception
     */
    public static function check(int $userid, string $bucket, int $max, int $window): void {
        if ($max <= 0 || $window <= 0) {
            return;
        }

        $cache = \cache::make('mod_contentcreator', 'ratelimit');
        // FIX-CC-CACHE-SIMPLEKEY (v13.95.7): this was $userid . ':' . $bucket. The ratelimit
        // cache declares simplekeys, and cache_helper::hash_key() rejects any key containing a
        // character outside [a-zA-Z0-9_] - a colon is invalid. The check is wrapped in
        // debugging(), so the key worked silently on production sites and threw a fatal
        // coding_exception on any site with developer debugging on, killing every rate-limited
        // action. Underscore is a legal simple-key character.
        $key = $userid . '_' . $bucket;
        $now = time();

        $timestamps = $cache->get($key);
        if (!is_array($timestamps)) {
            $timestamps = [];
        }

        // Prune anything that has fallen out of the sliding window.
        $cutoff = $now - $window;
        $timestamps = array_values(
            array_filter(
                $timestamps,
                function ($timestamp) use ($cutoff) {
                    return (int)$timestamp > $cutoff;
                }
            )
        );

        if (count($timestamps) >= $max) {
            $cache->set($key, $timestamps);
            throw new \moodle_exception('errorratelimiteddetail', 'mod_contentcreator', '', (object)[
                'max' => $max,
                'minutes' => (int)ceil($window / MINSECS),
            ]);
        }

        $timestamps[] = $now;
        $cache->set($key, $timestamps);
    }

    /**
     * Throw if the WHOLE SITE has exceeded the allowance for a bucket.
     *
     * Added in v13.85. The per-user limits above cannot bound total spend: an
     * endpoint that any enrolled learner may call, at 100 calls per user per
     * hour, has no ceiling at all once a cohort is large enough. This is the
     * aggregate backstop. It is deliberately generous by default so that normal
     * teaching never meets it - it exists to stop a runaway, not to ration.
     *
     * Uses the same sliding-window store as check(), under a reserved key that
     * cannot collide with a user id.
     *
     * @param string $bucket Logical bucket name, e.g. 'voice'.
     * @param int $max Maximum calls permitted site-wide in the window. 0 disables.
     * @param int $window Window length in seconds.
     * @return void
     * @throws \moodle_exception
     */
    public static function check_site(string $bucket, int $max, int $window): void {
        if ($max <= 0 || $window <= 0) {
            return;
        }

        $cache = \cache::make('mod_contentcreator', 'ratelimit');
        // FIX-CC-CACHE-SIMPLEKEY (v13.95.7): was 'site:' . $bucket - see the note in check().
        // 'site_' is still a reserved prefix that cannot collide with a numeric user id.
        $key = 'site_' . $bucket;
        $now = time();

        $timestamps = $cache->get($key);
        if (!is_array($timestamps)) {
            $timestamps = [];
        }

        $cutoff = $now - $window;
        $timestamps = array_values(
            array_filter(
                $timestamps,
                function ($timestamp) use ($cutoff) {
                    return (int)$timestamp > $cutoff;
                }
            )
        );

        if (count($timestamps) >= $max) {
            $cache->set($key, $timestamps);
            throw new \moodle_exception('errorsiteratelimited', 'mod_contentcreator');
        }

        $timestamps[] = $now;
        $cache->set($key, $timestamps);
    }
}
