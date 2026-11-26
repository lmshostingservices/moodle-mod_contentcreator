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

namespace mod_contentcreator\task;

/**
 * Writes cards on the site's own AI (Bring your own AI) when the web server cannot finish the request early.
 *
 * @package    mod_contentcreator
 * @copyright  2026 LMS-Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class byok_generate extends \core\task\adhoc_task {
    /**
     * Run the job; its progress and result go to the job cache the status poll reads.
     */
    public function execute() {
        $data = json_decode($this->get_custom_data_as_string(), true);
        if (!is_array($data) || empty($data['jobid'])) {
            return;
        }
        \mod_contentcreator\byok::run_job($data);
    }
}
