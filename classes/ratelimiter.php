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
        $key = $userid . ':' . $bucket;
        $now = time();

        $timestamps = $cache->get($key);
        if (!is_array($timestamps)) {
            $timestamps = [];
        }

        // Prune anything that has fallen out of the sliding window.
        $cutoff = $now - $window;
        $timestamps = array_values(array_filter($timestamps, function ($timestamp) use ($cutoff) {
            return (int)$timestamp > $cutoff;
        }));

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
        $key = 'site:' . $bucket;
        $now = time();

        $timestamps = $cache->get($key);
        if (!is_array($timestamps)) {
            $timestamps = [];
        }

        $cutoff = $now - $window;
        $timestamps = array_values(array_filter($timestamps, function ($timestamp) use ($cutoff) {
            return (int)$timestamp > $cutoff;
        }));

        if (count($timestamps) >= $max) {
            $cache->set($key, $timestamps);
            throw new \moodle_exception('errorsiteratelimited', 'mod_contentcreator');
        }

        $timestamps[] = $now;
        $cache->set($key, $timestamps);
    }
}
