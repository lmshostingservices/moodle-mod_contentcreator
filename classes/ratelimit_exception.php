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
 * A rate-limit breach, carrying enough detail for a caller to act on it.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS Hosting Services
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace mod_contentcreator;

defined('MOODLE_INTERNAL') || die();

/**
 * Thrown when a caller has exhausted a rate-limit bucket.
 *
 * v15.4.3. Before this, a breach was a plain moodle_exception and the AJAX layer turned it
 * into `{success: false, error: "<translated sentence>"}`. The only way a client could tell
 * a rate-limit refusal apart from any other failure was to match that sentence - which is
 * written in the site's language, of which there are 53. So no client ever did, and every
 * caller treated a refusal as a transient error and RETRIED it: three attempts per card,
 * then three more for the fallback, each one consuming another slot and pushing the reset
 * further away. One locked-out build made sixty guaranteed-to-fail requests.
 *
 * This carries the three facts a caller needs to behave: that the failure was a rate limit,
 * which bucket, and how many seconds until a slot frees. The sliding window makes the last
 * one exact rather than a guess.
 *
 * @package mod_contentcreator
 */
class ratelimit_exception extends \moodle_exception {
    /** @var string The bucket that was exhausted, e.g. 'voice'. */
    public $bucket = '';

    /** @var string 'user' when this caller is over their allowance, 'site' for the aggregate ceiling. */
    public $scope = 'user';

    /** @var int Seconds until the oldest call falls out of the window and a slot frees. */
    public $retryafter = 0;

    /** @var int The ceiling that was applied. */
    public $ceiling = 0;

    /**
     * Constructor.
     *
     * @param string $errorcode  Language string key for the message.
     * @param string $bucket     Logical bucket name.
     * @param string $scope      'user' or 'site'.
     * @param int    $retryafter Seconds until a slot frees.
     * @param int    $ceiling    The ceiling that was applied.
     * @param mixed  $a          Language string parameters.
     */
    public function __construct($errorcode, $bucket, $scope, $retryafter, $ceiling, $a = null) {
        $this->bucket = (string)$bucket;
        $this->scope = ($scope === 'site') ? 'site' : 'user';
        $this->retryafter = max(0, (int)$retryafter);
        $this->ceiling = max(0, (int)$ceiling);
        parent::__construct($errorcode, 'mod_contentcreator', '', $a);
    }
}
