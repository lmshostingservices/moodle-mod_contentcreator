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
 * AJAX handler for mod_contentcreator.
 *
 * All vendor API traffic is proxied through this script so that the site
 * credentials never reach the browser.
 *
 * @package    mod_contentcreator
 * @copyright  2025 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/filelib.php');

// Base URL of the vendor API. Server side only, never exposed to the browser.
define('CONTENTCREATOR_API_BASE', 'https://lms-labs.com');

// Maximum size, in bytes, of a file forwarded through the vendor upload proxy.
define('CONTENTCREATOR_UPLOAD_MAXBYTES', 20 * 1024 * 1024);

// Maximum number of characters accepted by the voiceover endpoint.
//
// This ceiling bounds a single text-to-speech request. It is not the abuse
// control on its own: the billable branch is also rate limited through the
// voice bucket. The value must stay high enough to
// carry a complete multi-card section in one pass -- lowering it truncates
// audio mid-sentence, which caused four successive regressions (v11.93,
// v12.29, v12.31, v12.32) before it settled here.
define('CONTENTCREATOR_VOICE_MAXCHARS', 20000);

/**
 * Send a JSON response to the client and stop.
 *
 * @param array $data Response payload.
 * @return void
 */
function contentcreator_response(array $data) {
    echo json_encode($data);
    exit;
}

/**
 * Send a translated failure response to the client and stop.
 *
 * @param string $key Language string key in mod_contentcreator.
 * @param mixed $a Optional language string placeholder value.
 * @param array $extra Extra keys merged into the response, for example pending => true.
 * @return void
 */
function contentcreator_fail($key, $a = null, array $extra = []) {
    contentcreator_response(array_merge([
        'success' => false,
        'error' => get_string($key, 'mod_contentcreator', $a),
    ], $extra));
}

/**
 * Capability check with a broader fallback.
 *
 * The 'mod/contentcreator:manage' capability is the intended gate for AI generation.
 * However, Moodle sites that use custom roles cloned from the editingteacher archetype do
 * not automatically inherit new capabilities when a plugin is installed or upgraded. This
 * means editing teachers on such sites get "permission denied" even though they have full
 * course editing rights.
 *
 * Fix: also accept 'moodle/course:manageactivities' in the course context. Every genuine
 * editing teacher has this capability, regardless of whether their role explicitly lists
 * mod/contentcreator:manage. If neither passes, throw the standard Moodle
 * require_capability exception so the error message is clear and consistent.
 *
 * @param context_module $context Module context for the contentcreator instance.
 * @param stdClass $cm Course module record, whose course field gives the course context.
 * @return void
 */
function contentcreator_require_manage($context, $cm) {
    if (has_capability('mod/contentcreator:manage', $context)) {
        return;
    }
    $coursecontext = context_course::instance($cm->course);
    if (has_capability('moodle/course:manageactivities', $coursecontext)) {
        return;
    }
    // Neither passed, so throw Moodle's standard exception. The site admin then sees a
    // meaningful capability name in any audit log.
    require_capability('mod/contentcreator:manage', $context);
}

/**
 * The allowlist of vendor endpoints reachable through the proxy actions.
 *
 * The client only ever supplies a key from this table, never a host, a path or a query
 * string, so no user input can influence which server is contacted.
 *
 * Each entry supports:
 * - path: vendor path, may contain the {siteid} and {unit} placeholders.
 * - method: HTTP verb used against the vendor.
 * - cap: capability level required. Every endpoint requires manage.
 * - kinds: which proxy actions may use the endpoint, from json, multipart and binary.
 * - credentials: where the site credentials are placed, from body, query, header or none.
 *   This mirrors what each vendor endpoint expected when the browser called it directly.
 * - filefield: for multipart endpoints, the field name the vendor expects the file under.
 * - mimetypes: for multipart endpoints, the accepted file types.
 * - mimetype and filename: forced response headers for binary endpoints.
 *
 * @return array Allowlist keyed by endpoint key.
 */
function contentcreator_vendor_endpoints() {
    $prefix = '/api/moodle/content-creator';
    $pdf = 'application/pdf';
    $docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    $pptx = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    $xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return [
        'credits' => [
            'path' => '/api/credits?siteId={siteid}',
            'method' => 'GET',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'header',
        ],
        // Single-slide image generation from the player. Kept as its own vendor
        // route (not the bulk 'generate-image' one) so the prompt composition and
        // response shape stay exactly as they were before the proxy was introduced.
        'generateslideimage' => [
            'path' => $prefix . '/generate-slide-image',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'suggestcontextworkplace' => [
            'path' => $prefix . '/suggest-context-workplace',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'suggesttopics' => [
            'path' => $prefix . '/suggest-topics',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'suggesttopicscc' => [
            'path' => '/api/contentcreator/suggest-topics',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'suggestworkplacetopics' => [
            'path' => $prefix . '/suggest-workplace-topics',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'extractdocument' => [
            // Reachable both as JSON and as a document upload: the wizard posts a real file.
            'path' => $prefix . '/extract-document',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json', 'multipart'],
            'credentials' => 'body',
            'filefield' => 'file',
            'mimetypes' => [$pdf, $docx, $pptx, 'text/plain'],
            'maxbytes' => 10 * 1024 * 1024,
        ],
        'tgaunit' => [
            'path' => '/api/tga/unit/{unit}',
            'method' => 'GET',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'none',
        ],
        'tgaunitrefresh' => [
            'path' => '/api/tga/unit/{unit}?refresh=true',
            'method' => 'GET',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'none',
        ],
        'tgaparsetext' => [
            'path' => '/api/tga/unit/{unit}/parse-text',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'tgauploadpdf' => [
            // The vendor expects the file under "pdf", not "file".
            'path' => '/api/tga/unit/{unit}/upload-pdf',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['multipart'],
            'credentials' => 'body',
            'filefield' => 'pdf',
            'mimetypes' => [$pdf],
            'maxbytes' => 10 * 1024 * 1024,
        ],
        'exportmappingexcel' => [
            'path' => $prefix . '/export-mapping-excel',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['binary'],
            'credentials' => 'body',
            'mimetype' => $xlsx,
            'filename' => 'contentcreator-mapping.xlsx',
        ],
        'gallerybrowse' => [
            'path' => '/api/community-gallery/browse',
            'method' => 'GET',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'query',
        ],
        'galleryuse' => [
            'path' => '/api/community-gallery/use',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'gallerycontribute' => [
            'path' => '/api/community-gallery/contribute',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['json'],
            'credentials' => 'body',
        ],
        'uploadslideimage' => [
            // The vendor expects the file under "image", not "file".
            'path' => $prefix . '/upload-slide-image',
            'method' => 'POST',
            'cap' => 'manage',
            'kinds' => ['multipart'],
            'credentials' => 'body',
            'filefield' => 'image',
            'mimetypes' => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
            'maxbytes' => 5 * 1024 * 1024,
        ],
    ];
}

/**
 * Whether the leading bytes of a file match the signature expected for a mime type.
 *
 * Checking the real bytes stops a renamed executable, or a script with a .png name, from
 * being forwarded to the vendor.
 *
 * @param string $mimetype Mime type derived from the file name by the Moodle file API.
 * @param string $head First bytes of the uploaded file.
 * @return bool True when the content matches the claimed type.
 */
function contentcreator_signature_matches($mimetype, $head) {
    $zipped = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if ($mimetype === 'application/pdf') {
        return strpos($head, '%PDF-') === 0;
    }
    if (in_array($mimetype, $zipped, true)) {
        // Office Open XML files are zip containers.
        return strpos($head, "PK\x03\x04") === 0;
    }
    if ($mimetype === 'image/png') {
        return strpos($head, "\x89PNG\r\n\x1a\n") === 0;
    }
    if ($mimetype === 'image/jpeg') {
        return strpos($head, "\xff\xd8\xff") === 0;
    }
    if ($mimetype === 'image/gif') {
        return strpos($head, 'GIF87a') === 0 || strpos($head, 'GIF89a') === 0;
    }
    if ($mimetype === 'image/webp') {
        return substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP';
    }
    if ($mimetype === 'text/plain') {
        // Plain text has no signature, so reject anything containing binary content.
        return strpos($head, "\0") === false;
    }
    return false;
}

/**
 * Validate a file uploaded for the vendor upload proxy.
 *
 * @param array $upload One entry from the $_FILES superglobal.
 * @param array $allowedtypes Mime types this endpoint accepts.
 * @param int|null $maxbytes Endpoint specific size cap, or null for the global cap.
 * @return array A language string key when validation failed or null when it passed, the
 *               cleaned file name, and on a size failure the limit that was applied.
 */
function contentcreator_validate_upload(array $upload, array $allowedtypes, $maxbytes = null) {
    if (!isset($upload['error']) || !isset($upload['tmp_name'])) {
        return ['vendorerrornofile', ''];
    }
    if ($upload['error'] != UPLOAD_ERR_OK || !is_uploaded_file($upload['tmp_name'])) {
        return ['vendorerroruploadfailed', ''];
    }
    $limit = $maxbytes ? min((int)$maxbytes, CONTENTCREATOR_UPLOAD_MAXBYTES) : CONTENTCREATOR_UPLOAD_MAXBYTES;
    $size = isset($upload['size']) ? (int)$upload['size'] : 0;
    if ($size <= 0 || $size > $limit) {
        return ['vendorerrorfilesize', '', $limit];
    }
    // Sanitise the name with the Moodle file API, then derive the type from it.
    $filename = clean_param($upload['name'], PARAM_FILE);
    if ($filename === '') {
        return ['vendorerrorfiletype', ''];
    }
    $mimetype = mimeinfo('type', $filename);
    if (!in_array($mimetype, $allowedtypes, true)) {
        return ['vendorerrorfiletype', ''];
    }
    // Confirm the real content matches the claimed type, not just the extension.
    $head = (string)file_get_contents($upload['tmp_name'], false, null, 0, 4096);
    if (!contentcreator_signature_matches($mimetype, $head)) {
        return ['vendorerrorfiletype', ''];
    }
    return [null, $filename];
}

/**
 * Call the vendor API.
 *
 * @param string $url Absolute vendor URL, always built server side from the allowlist.
 * @param array|null $payload Request body fields, JSON encoded. Ignored for GET and multipart.
 * @param string $method HTTP verb, GET or POST.
 * @param array $options Extra behaviour. Supported keys: multipart (array of POST fields, which
 *                       may contain a CURLFile), raw (true to return the undecoded body),
 *                       headers (extra request headers) and timeout (seconds to wait).
 * @return array Decoded vendor JSON, or on failure an array with success => false and error.
 *               In raw mode a successful call returns success => true and body => string.
 */
function contentcreator_api_call($url, $payload, $method = 'POST', array $options = []) {
    $curl = new \curl();
    // TCP keepalive reduces per request SSL handshake overhead: each call previously opened a
    // fresh TCP and SSL connection to the vendor, costing roughly 200ms. Keepalive reuses the
    // socket for the life of the PHP process.
    $curl->setopt([
        'CURLOPT_TIMEOUT' => isset($options['timeout']) ? (int)$options['timeout'] : 180,
        'CURLOPT_RETURNTRANSFER' => true,
        'CURLOPT_SSL_VERIFYPEER' => true,
        'CURLOPT_TCP_KEEPALIVE' => 1,
        'CURLOPT_TCP_KEEPIDLE' => 30,
        'CURLOPT_TCP_KEEPINTVL' => 15,
        'CURLOPT_ENCODING' => 'gzip, deflate',
    ]);

    $multipart = isset($options['multipart']) ? $options['multipart'] : null;
    $raw = !empty($options['raw']);

    if ($multipart !== null) {
        // Let cURL set the multipart content type and boundary itself.
        $curl->setHeader(['Accept: application/json']);
    } else {
        $curl->setHeader([
            'Content-Type: application/json',
            'Accept: ' . ($raw ? '*/*' : 'application/json'),
        ]);
    }
    if (!empty($options['headers'])) {
        $curl->setHeader($options['headers']);
    }

    if (strtoupper($method) === 'GET') {
        $response = $curl->get($url);
    } else if ($multipart !== null) {
        $response = $curl->post($url, $multipart);
    } else {
        $response = $curl->post($url, json_encode($payload));
    }

    $info = $curl->get_info();
    $httpcode = isset($info['http_code']) ? (int)$info['http_code'] : 0;

    if ($httpcode < 200 || $httpcode >= 300) {
        $data = json_decode($response, true);
        if ($httpcode === 0) {
            // The cURL call failed before receiving any HTTP response: DNS failure, TCP or SSL
            // failure, firewall block. The errno and error string are included so admins can
            // diagnose without server log access.
            $curlerrno = isset($curl->errno) ? (int)$curl->errno : 0;
            $curlerror = isset($curl->error) ? (string)$curl->error : '';
            $detail = $curlerrno ? "curl $curlerrno: $curlerror" : $curlerror;
            $error = isset($data['error'])
                ? $data['error']
                : get_string('errorapinoresponse', 'mod_contentcreator', $detail);
        } else {
            $error = isset($data['error'])
                ? $data['error']
                : get_string('errorapihttp', 'mod_contentcreator', $httpcode);
        }
        return ['success' => false, 'error' => $error, 'httpcode' => $httpcode];
    }

    if ($raw) {
        return ['success' => true, 'body' => (string)$response];
    }

    $data = json_decode($response, true);
    if (!$data) {
        return ['success' => false, 'error' => get_string('errorapiinvalidresponse', 'mod_contentcreator')];
    }

    return $data;
}

/**
 * Prepare the server for a long running generation call.
 *
 * Uses the Moodle sanctioned APIs rather than raw ini_set() or set_time_limit() calls, and
 * releases the session lock so a slow vendor call does not block every other request from
 * the same user.
 *
 * @param int $seconds Execution time to allow.
 * @return void
 */
function contentcreator_prepare_long_request($seconds = 300) {
    \core\session\manager::write_close();
    raise_memory_limit(MEMORY_EXTRA);
    \core_php_time_limit::raise($seconds);
}

/**
 * Enforce the shared rate limit for the current user.
 *
 * Wraps the shared rate limiter so that a limit breach is reported to the browser as a
 * translated JSON error rather than as an uncaught exception.
 *
 * @param string $bucket Logical bucket name, for example generate.
 * @param int $max Maximum calls permitted in the window.
 * @param int $window Window length in seconds.
 * @return void
 */
function contentcreator_check_ratelimit($bucket, $max, $window) {
    global $USER;

    try {
        \mod_contentcreator\ratelimiter::check($USER->id, $bucket, $max, $window);
    } catch (\moodle_exception $e) {
        debugging('mod_contentcreator rate limit hit: ' . $e->getMessage(), DEBUG_DEVELOPER);
        contentcreator_fail('errorratelimited');
    }
}

/**
 * Normalise and cap text that is about to be sent to the text to speech service.
 *
 * The cap is applied on a sentence boundary where one can be found, so the audio does not
 * stop in the middle of a sentence.
 *
 * @param string $text Raw text supplied by the client.
 * @param int $maxchars Maximum number of characters to keep.
 * @return string Cleaned, capped text.
 */
function contentcreator_clean_voice_text($text, $maxchars) {
    $text = strip_tags($text);
    $text = preg_replace('/\s+/', ' ', $text);
    $text = trim($text);
    if (strlen($text) <= $maxchars) {
        return $text;
    }
    $trimmed = substr($text, 0, $maxchars);
    $boundary = max(
        strrpos($trimmed, '. '),
        strrpos($trimmed, '! '),
        strrpos($trimmed, '? ')
    );
    if ($boundary !== false && $boundary > (int)($maxchars / 10)) {
        return substr($trimmed, 0, $boundary + 1);
    }
    return $trimmed;
}

/**
 * Course ids in which the current user may manage Content Creator activities.
 *
 * Used to scope the site wide image gallery so it never leaks activity names or image URLs
 * from courses the caller cannot reach.
 *
 * @return array Course ids, possibly empty.
 */
function contentcreator_manageable_courseids() {
    global $USER;

    $courseids = [];
    foreach (['moodle/course:manageactivities', 'mod/contentcreator:manage'] as $capability) {
        $courses = get_user_capability_course($capability, $USER->id, true);
        if (empty($courses)) {
            continue;
        }
        foreach ($courses as $course) {
            if ((int)$course->id !== SITEID) {
                $courseids[(int)$course->id] = (int)$course->id;
            }
        }
    }

    return array_values($courseids);
}

try {
    // Central Config integration with fallback.
    $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
    if (file_exists($aiconfiglib)) {
        require_once($aiconfiglib);
    }

    // Compared verbatim by confirm_sesskey(), never stored or echoed.
    $sesskey = optional_param('sesskey', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW - sesskey; verified verbatim.
    if (!confirm_sesskey($sesskey)) {
        contentcreator_fail('errorsessionexpired');
    }

    if (!isloggedin() || isguestuser()) {
        contentcreator_fail('errornotloggedin');
    }

    $action = optional_param('action', '', PARAM_ALPHANUMEXT);
    if (empty($action)) {
        contentcreator_fail('errormissingaction');
    }

    // Get the credentials from Central Config, or fall back to the plugin settings.
    if (function_exists('local_aiconfig_get_siteid')) {
        $siteid = local_aiconfig_get_siteid('mod_contentcreator');
    } else {
        $siteid = trim(get_config('mod_contentcreator', 'siteid') ?? '');
    }
    if (function_exists('local_aiconfig_get_apikey')) {
        $apikey = local_aiconfig_get_apikey('mod_contentcreator');
    } else {
        $apikey = trim(get_config('mod_contentcreator', 'apikey') ?? '');
    }

    // Additional settings.
    $voicelanguage = get_config('mod_contentcreator', 'voicelanguage') ?: 'en-AU';
    $enablevoice = get_config('mod_contentcreator', 'enablevoice') ?: 1;
    $country = get_config('mod_contentcreator', 'country') ?: 'Australia';

    $apibaseurl = CONTENTCREATOR_API_BASE;

    // Server side proxy for the vendor API. The browser never sees the credentials and can
    // only choose a key from the allowlist, never a host or a path.
    if ($action === 'vendor_proxy' || $action === 'vendor_upload' || $action === 'vendor_download') {
        $cmid = required_param('cmid', PARAM_INT);
        $endpointkey = required_param('endpoint', PARAM_ALPHANUMEXT);
        $unitcode = optional_param('unitcode', '', PARAM_ALPHANUMEXT);
        // JSON blob forwarded to the vendor as the request body, decoded and validated below.
        $payloadraw = optional_param('payload', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW - JSON; decoded and validated.

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);

        $endpoints = contentcreator_vendor_endpoints();
        if (!isset($endpoints[$endpointkey])) {
            contentcreator_fail('vendorerrorunknownendpoint');
        }
        $endpoint = $endpoints[$endpointkey];

        contentcreator_require_manage($context, $cm);
        contentcreator_check_ratelimit('vendor', 200, HOURSECS);

        // Each action may only reach endpoints of its own kind.
        $expectedkind = [
            'vendor_proxy' => 'json',
            'vendor_upload' => 'multipart',
            'vendor_download' => 'binary',
        ];
        if (!in_array($expectedkind[$action], $endpoint['kinds'], true)) {
            contentcreator_fail('vendorerrorwrongaction');
        }

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        // Build the URL entirely from the allowlist entry and from server side values.
        $path = str_replace('{siteid}', rawurlencode($siteid), $endpoint['path']);
        if (strpos($path, '{unit}') !== false) {
            if ($unitcode === '') {
                contentcreator_fail('vendorerrormissingunit');
            }
            $path = str_replace('{unit}', rawurlencode($unitcode), $path);
        }
        $vendorurl = CONTENTCREATOR_API_BASE . $path;

        $body = [];
        if ($payloadraw !== '') {
            $decoded = json_decode($payloadraw, true);
            if (!is_array($decoded)) {
                contentcreator_fail('vendorerrorinvalidjson');
            }
            $body = $decoded;
        }
        // The credentials are injected here, and only here. Each vendor endpoint expects
        // them in the place it expected when the browser called it directly.
        $callopts = [];
        if ($endpoint['credentials'] === 'body' || $endpoint['credentials'] === 'query') {
            $body['siteId'] = $siteid;
            $body['apiKey'] = $apikey;
        } else if ($endpoint['credentials'] === 'header') {
            $callopts['headers'] = ['X-API-Key: ' . $apikey];
        }

        // A GET request carries no body, so scalar payload values become query parameters.
        // Only scalars are allowed, and never a parameter the allowlisted path already sets.
        if (strtoupper($endpoint['method']) === 'GET') {
            $existingparams = [];
            $urlquery = parse_url($vendorurl, PHP_URL_QUERY);
            if (!empty($urlquery)) {
                parse_str($urlquery, $existingparams);
            }
            $query = [];
            foreach ($body as $key => $value) {
                if (is_scalar($value) && !array_key_exists($key, $existingparams)) {
                    $query[clean_param($key, PARAM_ALPHANUMEXT)] = (string)$value;
                }
            }
            unset($query['']);
            if (!empty($query)) {
                $vendorurl .= (strpos($vendorurl, '?') === false ? '?' : '&') . http_build_query($query);
            }
        }

        contentcreator_prepare_long_request();

        if ($action === 'vendor_upload') {
            // The client always sends the file as "file"; the vendor field name comes from
            // the allowlist. Accepted types are per endpoint, and the real bytes are checked.
            $upload = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
            if ($upload === null) {
                contentcreator_fail('vendorerrornofile');
            }
            $maxbytes = isset($endpoint['maxbytes']) ? $endpoint['maxbytes'] : null;
            $validation = contentcreator_validate_upload($upload, $endpoint['mimetypes'], $maxbytes);
            [$uploaderror, $filename] = [$validation[0], $validation[1]];
            if ($uploaderror !== null) {
                $limit = isset($validation[2]) ? (int)$validation[2] : CONTENTCREATOR_UPLOAD_MAXBYTES;
                contentcreator_fail($uploaderror, round($limit / (1024 * 1024)));
            }

            $fields = [];
            foreach ($body as $key => $value) {
                $fields[$key] = is_scalar($value) ? (string)$value : json_encode($value);
            }
            $fields[$endpoint['filefield']] = new \CURLFile(
                $upload['tmp_name'],
                mimeinfo('type', $filename),
                $filename
            );

            $callopts['multipart'] = $fields;
            $result = contentcreator_api_call($vendorurl, null, 'POST', $callopts);
        } else if ($action === 'vendor_download') {
            $callopts['raw'] = true;
            $result = contentcreator_api_call($vendorurl, $body, $endpoint['method'], $callopts);
            if (empty($result['success'])) {
                debugging('mod_contentcreator vendor download failed: ' .
                    (isset($result['error']) ? $result['error'] : ''), DEBUG_DEVELOPER);
                contentcreator_fail('vendorerrorgeneric');
            }
            // Stream the vendor body with our own headers: the vendor controls neither the
            // filename nor the content type.
            send_file(
                $result['body'],
                clean_param($endpoint['filename'], PARAM_FILE),
                0,
                0,
                true,
                true,
                $endpoint['mimetype']
            );
            exit;
        } else {
            $result = contentcreator_api_call($vendorurl, $body, $endpoint['method'], $callopts);
        }

        // Most vendor routes report failure as success:false, but the legacy
        // /api/contentcreator/suggest-topics alias uses an ok flag instead. Treat
        // either as a failure so a 200 response carrying ok:false is not passed off
        // to the client as a success.
        $vendorfailed = (isset($result['success']) && $result['success'] === false)
            || (isset($result['ok']) && $result['ok'] === false);
        if ($vendorfailed) {
            $vendorerror = isset($result['error']) ? (string)$result['error'] : '';
            debugging('mod_contentcreator vendor call failed: ' . $vendorerror, DEBUG_DEVELOPER);
            // Pass the provider's own message through. It is generated by the vendor, not by
            // the caller, and carries the actionable detail (insufficient credits, quota
            // exceeded, invalid unit code) that a generic string would throw away.
            if ($vendorerror !== '' && \core_text::strlen($vendorerror) <= 300) {
                contentcreator_response(['success' => false, 'error' => $vendorerror]);
            }
            contentcreator_fail('vendorerrorgeneric');
        }

        contentcreator_response(['success' => true, 'data' => $result]);
    }

    // Check the configuration. Requires the manage capability: content creators only.
    if ($action === 'check_config') {
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_response([
                'success' => true,
                'configured' => false,
                'error' => get_string('errornotconfigured', 'mod_contentcreator'),
            ]);
        }

        \core\session\manager::write_close();

        // Verify the credentials with the vendor.
        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/check-config', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
        ]);

        contentcreator_response([
            'success' => true,
            'configured' => $result['configured'] ?? false,
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // Generate content for a slide. State changing: uses credits.
    if ($action === 'generate_slide') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        // Free-form AI prompt text sent to the AI API only, never stored or echoed.
        $systemprompt = required_param('systemprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW - AI prompt text; forwarded only.
        $userprompt = required_param('userprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW - AI prompt text; forwarded only.
        $slidetype = optional_param('slidetype', 'content', PARAM_ALPHANUMEXT);
        // Forward the route so the server uses the correct expected card count.
        $route = optional_param('route', 'vet', PARAM_ALPHANUMEXT);
        // Forward the language so secondary passes use it directly.
        $genlanguagesync = optional_param('language', 'en-AU', PARAM_TEXT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);
        contentcreator_check_ratelimit('generate', 60, HOURSECS);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        // Generation can legitimately take a minute or more, so raise the limits through the
        // Moodle APIs and release the session lock first.
        contentcreator_prepare_long_request();

        // Translation passes cost 50 credits per section, primary generation costs 1.
        $creditsforaction = (strpos($slidetype, 'ml_translate_') === 0) ? 50 : 1;

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/prompt', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'systemPrompt' => $systemprompt,
            'userPrompt' => $userprompt,
            'contentType' => $slidetype,
            'route' => $route,
            'language' => $genlanguagesync,
            'creditsToUse' => $creditsforaction,
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? get_string('errorgenerationfailed', 'mod_contentcreator'),
            ]);
        }

        contentcreator_response([
            'success' => true,
            'content' => $result['content'],
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // Asynchronous start: returns a job id immediately so there is no proxy timeout risk.
    // The client then polls action=poll_job until the status is done.
    if ($action === 'generate_slide_async') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        // Free-form AI prompt text sent to the AI API only, never stored or echoed.
        $systemprompt = required_param('systemprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW - AI prompt text; forwarded only.
        $userprompt = required_param('userprompt', PARAM_RAW); // pipeline-ignore: PARAM_RAW - AI prompt text; forwarded only.
        $slidetype = optional_param('slidetype', 'content', PARAM_ALPHANUMEXT);
        $route = optional_param('route', 'vet', PARAM_ALPHANUMEXT);
        // Explicit language forwarded to the server so secondary passes, such as expansion
        // and banned word rewrites, use it directly instead of parsing the prompt text.
        $genlanguage = optional_param('language', 'en-AU', PARAM_TEXT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);
        contentcreator_check_ratelimit('generate', 60, HOURSECS);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        contentcreator_prepare_long_request();

        // Translation passes cost 50 credits per section.
        $creditsforasync = (strpos($slidetype, 'ml_translate_') === 0) ? 50 : 1;

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/prompt/start', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'systemPrompt' => $systemprompt,
            'userPrompt' => $userprompt,
            'contentType' => $slidetype,
            'route' => $route,
            'language' => $genlanguage,
            'creditsToUse' => $creditsforasync,
        ]);

        if (empty($result['ok']) || empty($result['jobId'])) {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? get_string('errorjobstartfailed', 'mod_contentcreator'),
            ]);
        }

        contentcreator_response(['success' => true, 'jobId' => $result['jobId'], 'async' => true]);
    }

    // Asynchronous poll: check the status of a background generation job.
    if ($action === 'poll_job') {
        require_sesskey();

        $jobid = required_param('jobId', PARAM_ALPHANUMEXT);
        $cmid = required_param('cmid', PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);

        // Do not hold the session lock open across the upstream status call.
        \core\session\manager::write_close();

        $curl = new \curl();
        // A busy job status endpoint can be slow; a generous window avoids false failures.
        $curl->setopt(['CURLOPT_TIMEOUT' => 20, 'CURLOPT_CONNECTTIMEOUT' => 8]);
        $curl->setHeader(['Content-Type: application/json', 'Accept: application/json']);
        $pollurl = $apibaseurl . '/api/jobs/' . urlencode($jobid);
        $response = $curl->get($pollurl);
        $result = json_decode($response, true);

        if (!$result) {
            contentcreator_response([
                'ok' => false,
                'status' => 'error',
                'error' => get_string('errorjobstatusfailed', 'mod_contentcreator'),
            ]);
        }

        contentcreator_response($result);
    }

    // Generate text to speech audio. State changing: uses credits.
    if ($action === 'generate_voice') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        // Text to speech input sent to the speech API only, never stored or echoed.
        $text = required_param('text', PARAM_RAW); // pipeline-ignore: PARAM_RAW - TTS input text, forwarded to the speech API only.
        $sectionid = optional_param('sectionid', '', PARAM_ALPHANUMEXT);
        $voicegender = optional_param('gender', 'female', PARAM_ALPHA);
        // The language is set per activity by the wizard; fall back to the plugin setting.
        $requestlanguage = optional_param('language', '', PARAM_TEXT);
        $effectivelanguage = !empty($requestlanguage) ? $requestlanguage : $voicelanguage;

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        // The capability model is unchanged from the original plugin: any user who can view
        // the activity may request a voiceover. Students rely on this to read audio a teacher
        // has already generated and cached. Abuse is controlled by the length cap above and
        // by the voice rate limit applied to the generating branch below.
        require_capability('mod/contentcreator:view', $context);

        if (!$enablevoice) {
            contentcreator_fail('errorvoicedisabled');
        }

        $text = contentcreator_clean_voice_text($text, CONTENTCREATOR_VOICE_MAXCHARS);

        // Accept an explicit voice name; fall back to the gender based default for backward
        // compatibility with older manifests.
        $voiceparam = optional_param('voice', '', PARAM_ALPHA);
        $validvoices = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];
        if (!empty($voiceparam) && in_array($voiceparam, $validvoices)) {
            $voicename = $voiceparam;
        } else {
            $voicename = ($voicegender === 'male') ? 'Puck' : 'Zephyr';
        }

        // Map the language code for Chirp 3 HD. Note that nb-NO is deliberately not mapped:
        // nb-NO-Chirp3-HD-Aoede is the correct voice and no-NO does not exist.
        $languagemappings = [
            'zh-CN' => 'cmn-CN',
            'zh-TW' => 'cmn-TW',
            'zh-HK' => 'yue-HK',
        ];
        $mappedlang = $languagemappings[$effectivelanguage] ?? $effectivelanguage;

        // Languages offered in the additional languages list that Chirp 3 HD does not
        // support. Without these fallbacks the speech API rejects the request and the
        // student hears silence. Punjabi has no native Google voice, so Hindi is closest.
        $nonchirp3voices = [
            'ms-MY' => ['voiceid' => 'ms-MY-Standard-D', 'lang' => 'ms-MY'],
            'pa-IN' => ['voiceid' => "hi-IN-Chirp3-HD-{$voicename}", 'lang' => 'hi-IN'],
            'fil-PH' => ['voiceid' => 'fil-PH-Standard-A', 'lang' => 'fil-PH'],
            'yue-HK' => ['voiceid' => 'yue-HK-Standard-D', 'lang' => 'yue-HK'],
            'cmn-TW' => ['voiceid' => "cmn-CN-Chirp3-HD-{$voicename}", 'lang' => 'cmn-CN'],
            'pt-PT' => ['voiceid' => "pt-BR-Chirp3-HD-{$voicename}", 'lang' => 'pt-BR'],
            'ca-ES' => ['voiceid' => "es-ES-Chirp3-HD-{$voicename}", 'lang' => 'es-ES'],
            'is-IS' => ['voiceid' => 'is-IS-Standard-A', 'lang' => 'is-IS'],
        ];
        if (isset($nonchirp3voices[$mappedlang])) {
            $voiceid = $nonchirp3voices[$mappedlang]['voiceid'];
            $effectivelanguage = $nonchirp3voices[$mappedlang]['lang'];
        } else {
            $voiceid = "{$mappedlang}-Chirp3-HD-{$voicename}";
        }

        // Check the Moodle file store for cached audio before spending any credits.
        // Identical text, voice and language combinations are otherwise regenerated on
        // every click. The cache is site wide, so it lives in the system context.
        $voicecachekey = md5($text . '|' . $voiceid . '|' . $effectivelanguage);
        $voicecachectx = context_system::instance();
        $voicefs = get_file_storage();
        $voicecachefile = $voicefs->get_file(
            $voicecachectx->id,
            'mod_contentcreator',
            'voice_cache',
            0,
            '/',
            $voicecachekey . '.ogg'
        );
        if ($voicecachefile) {
            contentcreator_response([
                'success' => true,
                'audioContent' => base64_encode($voicecachefile->get_content()),
                'audioType' => 'audio/ogg',
                'credits' => 0,
                'cached' => true,
            ]);
        }

        // Cache miss, so this request will call the speech service and spend credits. A
        // free cache read never consumes a user's allowance; only generating calls do.
        contentcreator_check_ratelimit('voice', 100, HOURSECS);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        // Long text is split server side into sequential chunks, so a single call can
        // legitimately run for a minute or more.
        contentcreator_prepare_long_request();

        // Non blocking lock per section: two PHP processes hitting the speech endpoint at
        // once make the upstream service fail both requests. The client treats pending as a
        // temporary hold and retries shortly afterwards.
        $ttslockkey = md5('cc_tts_' . $siteid . '_' . $sectionid);
        $ttslockfile = sys_get_temp_dir() . '/cc_tts_' . $ttslockkey . '.lock';
        $ttslockfp = fopen($ttslockfile, 'w+');
        $ttslockacquired = false;
        if ($ttslockfp) {
            $ttslockacquired = flock($ttslockfp, LOCK_EX | LOCK_NB);
        }
        if (!$ttslockacquired) {
            if ($ttslockfp) {
                fclose($ttslockfp);
            }
            debugging('mod_contentcreator generate_voice: concurrent request blocked for section ' .
                $sectionid, DEBUG_DEVELOPER);
            contentcreator_fail('errorttsinprogress', null, ['pending' => true]);
        }
        // The response helper exits, so release the lock from a shutdown handler instead.
        register_shutdown_function(function () use ($ttslockfp, $ttslockfile) {
            if ($ttslockfp) {
                flock($ttslockfp, LOCK_UN);
                fclose($ttslockfp);
            }
            @unlink($ttslockfile);
        });

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/tts', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'text' => $text,
            'languageCode' => $effectivelanguage,
            'voiceId' => $voiceid,
            // Send the actual voice name rather than the legacy gender.
            'voiceGender' => $voicename,
            'creditsToUse' => 5,
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? get_string('errorttsfailed', 'mod_contentcreator'),
            ]);
        }

        // Store the freshly generated audio so future requests for the same text, voice and
        // language are served from the cache at no credit cost.
        if (!empty($result['audioContent'])) {
            $voiceaudiobytes = base64_decode($result['audioContent']);
            $voicefilerec = [
                'contextid' => $voicecachectx->id,
                'component' => 'mod_contentcreator',
                'filearea' => 'voice_cache',
                'itemid' => 0,
                'filepath' => '/',
                'filename' => $voicecachekey . '.ogg',
            ];
            // Delete any pre-existing file under this key before writing.
            $voiceoldfile = $voicefs->get_file(
                $voicecachectx->id,
                'mod_contentcreator',
                'voice_cache',
                0,
                '/',
                $voicecachekey . '.ogg'
            );
            if ($voiceoldfile) {
                $voiceoldfile->delete();
            }
            try {
                $voicefs->create_file_from_string($voicefilerec, $voiceaudiobytes);
            } catch (\Throwable $e) {
                // Not fatal: the audio is still returned, only caching failed this time.
                debugging('mod_contentcreator voice cache store failed: ' . $e->getMessage(), DEBUG_DEVELOPER);
            }
        }

        contentcreator_response([
            'success' => true,
            'audioContent' => $result['audioContent'],
            'audioType' => $result['audioType'] ?? 'audio/ogg',
            'credits' => $result['credits'] ?? 0,
        ]);
    }

    // Save completion progress to the Moodle database. State changing: writes to database.
    if ($action === 'save_completion') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        // JSON blob immediately json_decode()'d and validated.
        $progress = required_param('progress', PARAM_RAW); // pipeline-ignore: PARAM_RAW - JSON; decoded and validated.
        $completed = optional_param('completed', 0, PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        require_capability('mod/contentcreator:view', $context);

        // Parse the progress JSON.
        $progressdata = json_decode($progress, true);
        if (!$progressdata) {
            contentcreator_fail('errorinvalidprogress');
        }

        // Check whether the user already has a progress record.
        $record = $DB->get_record('contentcreator_progress', [
            'cmid' => $cmid,
            'userid' => $USER->id,
        ]);

        $data = [
            'cmid' => $cmid,
            'userid' => $USER->id,
            'progress' => json_encode($progressdata),
            'timemodified' => time(),
        ];

        if ($record) {
            $data['id'] = $record->id;
            $DB->update_record('contentcreator_progress', (object)$data);
        } else {
            $data['timecreated'] = time();
            $DB->insert_record('contentcreator_progress', (object)$data);
        }

        // Re-evaluate the completionallactivities rule whenever progress is saved: the
        // custom_completion class reads the progress JSON for challengeComplete flags.
        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
        $completion = new \completion_info($course);
        if ($completion->is_enabled($cm)) {
            $completion->update_state($cm, COMPLETION_UNKNOWN, $USER->id);
        }

        // If fully completed, mark the activity as complete.
        if ($completed) {
            // The custom_completion class checks contentcreator_attempts, not the progress table,
            // so the attempt row must be written here as well.
            $attemptrecord = $DB->get_record('contentcreator_attempts', [
                'contentcreatorid' => $cm->instance,
                'userid' => $USER->id,
            ]);

            $attemptdata = new \stdClass();
            $attemptdata->contentcreatorid = $cm->instance;
            $attemptdata->userid = $USER->id;
            $attemptdata->completed = 1;
            $attemptdata->responses = json_encode($progressdata);
            $attemptdata->timemodified = time();

            if ($attemptrecord) {
                $attemptdata->id = $attemptrecord->id;
                $DB->update_record('contentcreator_attempts', $attemptdata);
            } else {
                $attemptdata->score = 0;
                $attemptdata->maxscore = 0;
                $attemptdata->timecreated = time();
                $DB->insert_record('contentcreator_attempts', $attemptdata);
            }

            // Trigger Moodle completion, reusing the objects fetched above.
            if ($completion->is_enabled($cm)) {
                $completion->update_state($cm, COMPLETION_COMPLETE, $USER->id);
            }
        }

        contentcreator_response([
            'success' => true,
            'message' => get_string('progresssaved', 'mod_contentcreator'),
        ]);
    }

    // Load completion progress from the Moodle database.
    if ($action === 'load_completion') {
        $cmid = required_param('cmid', PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        require_capability('mod/contentcreator:view', $context);

        $record = $DB->get_record('contentcreator_progress', [
            'cmid' => $cmid,
            'userid' => $USER->id,
        ]);

        if ($record) {
            contentcreator_response([
                'success' => true,
                'progress' => json_decode($record->progress, true),
            ]);
        } else {
            contentcreator_response([
                'success' => true,
                'progress' => null,
            ]);
        }
    }

    // Save the Before You Start checklist completion.
    if ($action === 'save_checklist') {
        require_sesskey();
        $cmid = required_param('cmid', PARAM_INT);
        $topicid = optional_param('topicid', '', PARAM_TEXT);
        $complete = optional_param('complete', 0, PARAM_INT);

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        require_capability('mod/contentcreator:view', $context);

        $existing = $DB->get_record('contentcreator_checklist', [
            'cmid' => $cmid,
            'userid' => $USER->id,
            'topicid' => $topicid,
        ]);

        if ($existing) {
            $existing->complete = (int)$complete;
            $existing->timemodified = time();
            $DB->update_record('contentcreator_checklist', $existing);
        } else {
            $record = new stdClass();
            $record->cmid = $cmid;
            $record->userid = $USER->id;
            $record->topicid = $topicid;
            $record->complete = (int)$complete;
            $record->timecreated = time();
            $record->timemodified = time();
            try {
                $DB->insert_record('contentcreator_checklist', $record);
            } catch (\Throwable $e) {
                // Gracefully ignore installs where the table does not exist yet.
                debugging('mod_contentcreator checklist insert failed: ' . $e->getMessage(), DEBUG_DEVELOPER);
            }
        }

        contentcreator_response(['success' => true]);
    }

    // Pre-generate document examples in batch. State changing: uses credits.
    if ($action === 'pregenerate_documents') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        // JSON blobs immediately json_decode()'d and validated.
        $documents = optional_param('documents', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW - JSON; decoded and validated.
        $contextparam = optional_param('context', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW - JSON; decoded and validated.

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);
        contentcreator_check_ratelimit('generate', 60, HOURSECS);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        if (empty($documents)) {
            contentcreator_fail('errornodocuments');
        }

        $docsarray = json_decode($documents, true);
        $contextdata = json_decode($contextparam, true) ?? [];

        if (!is_array($docsarray) || empty($docsarray)) {
            contentcreator_fail('errorinvaliddocuments');
        }

        contentcreator_prepare_long_request();

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/batch-generate-documents', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'documents' => $docsarray,
            'context' => $contextdata,
        ]);

        if (!empty($result['success'])) {
            contentcreator_response([
                'success' => true,
                'documentExamples' => $result['documentExamples'] ?? [],
            ]);
        } else {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? get_string('errordocumentsfailed', 'mod_contentcreator'),
            ]);
        }
    }

    // Site wide image gallery: images from every Content Creator activity the caller may
    // manage, so that purchased images can be reused across activities.
    if ($action === 'get_site_gallery') {
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);

        $siteimages = [];
        $seenurls = [];

        // Only look at courses the user may manage. Without this the gallery leaked activity
        // names and image URLs from every course on the site.
        $courseids = contentcreator_manageable_courseids();
        $instances = [];
        if (!empty($courseids)) {
            [$insql, $inparams] = $DB->get_in_or_equal($courseids, SQL_PARAMS_NAMED, 'cc');
            $instances = $DB->get_records_select(
                'contentcreator',
                'course ' . $insql,
                $inparams,
                'id ASC',
                'id, course, name, manifestjson'
            );
        }

        foreach ($instances as $instance) {
            if (empty($instance->manifestjson)) {
                continue;
            }

            // Decompress before decoding: the stored manifest may be gzip compressed.
            $manifest = json_decode(\mod_contentcreator\manifest_storage::decompress($instance->manifestjson), true);
            if (!$manifest) {
                continue;
            }

            // Extract the images from the topics and sections.
            if (!empty($manifest['topics']) && is_array($manifest['topics'])) {
                foreach ($manifest['topics'] as $topic) {
                    if (empty($topic['sections']) || !is_array($topic['sections'])) {
                        continue;
                    }
                    foreach ($topic['sections'] as $sectionindex => $section) {
                        if (empty($section['image']['url'])) {
                            continue;
                        }
                        $url = $section['image']['url'];
                        if (isset($seenurls[$url])) {
                            continue;
                        }
                        $seenurls[$url] = true;
                        $slidelabel = get_string('galleryslidelabel', 'mod_contentcreator', $sectionindex + 1);
                        $sourcedata = (object)[
                            'activity' => $instance->name,
                            'slide' => $section['title'] ?? $slidelabel,
                        ];
                        $siteimages[] = [
                            'url' => $url,
                            'prompt' => $section['image']['prompt'] ?? $section['title'] ??
                                get_string('galleryimageprompt', 'mod_contentcreator'),
                            'source' => get_string('gallerysource', 'mod_contentcreator', $sourcedata),
                            'activityId' => $instance->id,
                        ];
                    }
                }
            }

            // Also check the imageGallery array.
            if (!empty($manifest['imageGallery']) && is_array($manifest['imageGallery'])) {
                foreach ($manifest['imageGallery'] as $img) {
                    if (empty($img['url']) || isset($seenurls[$img['url']])) {
                        continue;
                    }
                    $seenurls[$img['url']] = true;
                    $siteimages[] = [
                        'url' => $img['url'],
                        'prompt' => $img['prompt'] ?? get_string('gallerygalleryprompt', 'mod_contentcreator'),
                        'source' => get_string('gallerysourcegallery', 'mod_contentcreator', $instance->name),
                        'activityId' => $instance->id,
                    ];
                }
            }
        }

        contentcreator_response([
            'success' => true,
            'images' => $siteimages,
            'count' => count($siteimages),
        ]);
    }

    // Generate an AI image for a slide. State changing: uses credits.
    if ($action === 'generate_image') {
        require_sesskey();
        $cmid = required_param('cmid', PARAM_INT);
        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);
        contentcreator_check_ratelimit('generate', 60, HOURSECS);

        if (empty($siteid) || empty($apikey)) {
            contentcreator_fail('errornotconfigured');
        }

        // JSON blob immediately json_decode()'d and validated.
        $dataraw = optional_param('data', '', PARAM_RAW); // pipeline-ignore: PARAM_RAW - JSON; decoded and validated.
        $data = json_decode($dataraw, true);

        if (!$data) {
            contentcreator_fail('errorinvalidrequestdata');
        }

        $slidetitle = $data['slideTitle'] ?? '';
        $slidedescription = $data['slideDescription'] ?? '';
        $topictitle = $data['topicTitle'] ?? '';
        $unitcode = $data['unitCode'] ?? '';
        $unittitle = $data['unitTitle'] ?? '';
        $industry = $data['industry'] ?? '';
        $subindustry = $data['subIndustry'] ?? '';
        $workplace = $data['workplace'] ?? '';
        $jobrole = $data['jobRole'] ?? '';
        $imagecountry = $data['country'] ?? $country;
        $state = $data['state'] ?? '';
        $requirements = $data['requirements'] ?? '';
        $route = $data['route'] ?? 'vet';
        // Hook scenario narrative, for richer image context.
        $scenariocontext = $data['scenarioContext'] ?? '';

        if (empty($slidetitle)) {
            contentcreator_fail('errornoslidetitle');
        }

        // Image generation takes between 30 and 120 seconds, so release the session lock and
        // raise the execution limits before starting.
        contentcreator_prepare_long_request();

        $result = contentcreator_api_call($apibaseurl . '/api/moodle/content-creator/generate-image', [
            'siteId' => $siteid,
            'apiKey' => $apikey,
            'slideTitle' => $slidetitle,
            'slideDescription' => $slidedescription,
            'topicTitle' => $topictitle,
            'unitCode' => $unitcode,
            'unitTitle' => $unittitle,
            'industry' => $industry,
            'subIndustry' => $subindustry,
            'workplace' => $workplace,
            'jobRole' => $jobrole,
            'country' => $imagecountry,
            'state' => $state,
            'requirements' => $requirements,
            'route' => $route,
            'scenarioContext' => $scenariocontext,
        ]);

        if (!isset($result['success']) || !$result['success']) {
            contentcreator_response([
                'success' => false,
                'error' => $result['error'] ?? get_string('errorimagefailed', 'mod_contentcreator'),
            ]);
        }

        contentcreator_response([
            'success' => true,
            'images' => $result['images'] ?? [],
            'creditsUsed' => $result['creditsUsed'] ?? 5,
        ]);
    }

    // Persist pre-generated voiceover audio to the Moodle file store and return a pluginfile
    // URL, so the manifest can hold an HTTPS URL rather than a data URL.
    if ($action === 'save_voiceover_file') {
        require_sesskey();

        $cmid = required_param('cmid', PARAM_INT);
        $audiotype = optional_param('audiotype', 'audio/ogg', PARAM_TEXT);

        // Accept the section id as raw text, then make it safe for the filesystem.
        $sectionidraw = required_param('sectionid', PARAM_TEXT);
        $sectionid = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $sectionidraw);
        $sectionid = trim($sectionid, '._-');
        if (empty($sectionid)) {
            $sectionid = 'section';
        }

        // Base64 audio, roughly 500 KB once decoded. Read as raw, then decoded and validated.
        $audiocontent = required_param('audiocontent', PARAM_RAW); // pipeline-ignore: PARAM_RAW - base64 audio; validated.

        $cm = get_coursemodule_from_id('contentcreator', $cmid, 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        require_login($cm->course, false, $cm);
        contentcreator_require_manage($context, $cm);

        $audiodata = base64_decode($audiocontent);
        if ($audiodata === false || strlen($audiodata) < 1000) {
            contentcreator_fail('errorinvalidaudio');
        }

        $ext = (strpos($audiotype, 'mp3') !== false || strpos($audiotype, 'mpeg') !== false) ? 'mp3' : 'ogg';
        $filename = 'voiceover_' . $sectionid . '.' . $ext;

        $fs = get_file_storage();
        $filerecord = [
            'contextid' => $context->id,
            'component' => 'mod_contentcreator',
            'filearea' => 'voiceovers',
            'itemid' => $cmid,
            'filepath' => '/',
            'filename' => $filename,
        ];

        // Delete any existing file for this section before storing fresh audio.
        $existing = $fs->get_file($context->id, 'mod_contentcreator', 'voiceovers', $cmid, '/', $filename);
        if ($existing) {
            $existing->delete();
        }

        $storedfile = $fs->create_file_from_string($filerecord, $audiodata);
        if (!$storedfile) {
            contentcreator_fail('errorfilestorefailed');
        }

        $url = moodle_url::make_pluginfile_url(
            $context->id,
            'mod_contentcreator',
            'voiceovers',
            $cmid,
            '/',
            $filename
        );

        contentcreator_response([
            'success' => true,
            'url' => $url->out(false),
        ]);
    }

    // Unknown action.
    contentcreator_fail('errorunknownaction');
} catch (\Throwable $e) {
    // Never leak internal detail to the browser: log it for developers instead.
    debugging($e->getMessage(), DEBUG_DEVELOPER);
    echo json_encode([
        'success' => false,
        'error' => get_string('errorgeneric', 'mod_contentcreator'),
    ]);
    exit;
}
