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
 * Cache definitions for Content Creator.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$definitions = [
    // Sliding-window counters used by \mod_contentcreator\ratelimiter to throttle
    // credit-consuming and vendor-facing requests. Keys are simple strings built
    // from the user id and bucket name; values are arrays of request timestamps.
    'ratelimit' => [
        'mode' => cache_store::MODE_APPLICATION,
        'simplekeys' => true,
        'simpledata' => false,
        'ttl' => 3600,
    ],

    // v13.94.3: Ownership record for an asynchronous generation job. action=poll_job
    // used to accept any job id from any caller who held :manage on any Content Creator
    // activity, and returned the vendor's raw job payload for it - so one author could
    // read another author's generated content simply by guessing or replaying a job id.
    // The id is now bound to the user and course module it was issued to, and a poll
    // that does not match is refused. A cache is the right store rather than a table:
    // the binding is write-once, read-a-handful-of-times and dead within minutes, so it
    // has no business surviving in the database or needing an install/upgrade step.
    // Keys are md5(job id), because the vendor's ids contain characters simple keys do not
    // allow; values are 'userid:cmid'.
    'jobowner' => [
        'mode' => cache_store::MODE_APPLICATION,
        'simplekeys' => true,
        'simpledata' => true,
        'ttl' => 7200,
    ],
];
