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
 * Tests for the rate limiter's cache keys.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_contentcreator\ratelimiter
 */

namespace mod_contentcreator;

/**
 * Rate limiter tests.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \mod_contentcreator\ratelimiter
 */
final class ratelimiter_test extends \advanced_testcase {
    /**
     * REGRESSION (V13.95.7 FIX-CC-CACHE-SIMPLEKEY): every key this class builds must be a
     * legal Moodle simple key.
     *
     * The ratelimit cache declares simplekeys, and cache_helper::hash_key() throws a
     * coding_exception for any key containing a character outside [a-zA-Z0-9_]. Both keys used
     * to join with a colon ("5:vendor", "site:vendor"). Because that check is wrapped in
     * debugging(), the fault was invisible on production sites and fatal on any site with
     * developer debugging enabled - it killed every rate-limited action, including topic
     * suggestions, with "Cache definition mod_contentcreator/ratelimit requires simple keys".
     *
     * PHPUnit runs with debugging on, so simply exercising the limiter reproduces it.
     *
     * @return void
     */
    public function test_every_bucket_builds_a_legal_simple_key(): void {
        $this->resetAfterTest();

        // Both the per-user path and the site-wide ceiling, for every bucket in real use.
        foreach (['generate', 'vendor', 'vendorread', 'voice'] as $bucket) {
            ratelimiter::enforce(7, $bucket, 5, HOURSECS);
        }

        // Reaching here without a coding_exception is the assertion; make it explicit.
        $this->assertTrue(true, 'Rate limiter built only legal simple cache keys.');
    }

    /**
     * The per-user allowance is enforced, and the key survives repeated use.
     *
     * @return void
     */
    public function test_per_user_ceiling_is_enforced(): void {
        $this->resetAfterTest();

        // The enforce() call prefers the admin setting over the caller's default, and the plugin ships
        // a default of 60 for this bucket - so the ceiling has to be set explicitly here or
        // the test silently asserts nothing.
        set_config('ratelimitgenerate', 2, 'mod_contentcreator');

        ratelimiter::enforce(11, 'generate', 2, HOURSECS);
        ratelimiter::enforce(11, 'generate', 2, HOURSECS);

        $this->expectException(\moodle_exception::class);
        ratelimiter::enforce(11, 'generate', 2, HOURSECS);
    }

    /**
     * One user's bucket must not consume another user's allowance.
     *
     * @return void
     */
    public function test_buckets_are_isolated_per_user(): void {
        $this->resetAfterTest();

        set_config('ratelimitgenerate', 1, 'mod_contentcreator');

        ratelimiter::enforce(21, 'generate', 1, HOURSECS);

        // A different user still has their own allowance.
        ratelimiter::enforce(22, 'generate', 1, HOURSECS);

        // And the first user is now blocked.
        $this->expectException(\moodle_exception::class);
        ratelimiter::enforce(21, 'generate', 1, HOURSECS);
    }
}
