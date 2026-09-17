#!/usr/bin/env bash
#
# Build the release zip, with the name derived from version.php rather than typed.
#
# WHY THIS EXISTS
#
# v15.6.1 was packaged by hand as "mod_contentcreator-v15.6.1.zip" and the LMS Labs release
# pipeline rejected it: "Uploaded ZIP metadata is inconsistent: uploaded filename
# 'mod_contentcreator-v15.6.1.zip' must be exactly 'mod_contentcreator_v15.6.1.zip'". A
# hyphen where every prior release had an underscore.
#
# The plugin itself was correct and every gate had passed. The only step done by hand was the
# one that failed, which is the whole argument for this file: the name is COMPUTED from
# $plugin->component and $plugin->release, so it cannot disagree with what is inside the zip,
# and the release number is never typed twice.
#
# Usage:  npm run package          (or: bash tools/package.sh)
#         OUT_DIR=/somewhere npm run package
#
# @package    mod_contentcreator
# @copyright  2025 AI Grader
# @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

set -euo pipefail

cd "$(dirname "$0")/.."
PLUGIN_DIR="$(pwd)"
OUT_DIR="${OUT_DIR:-/mnt/user-data/outputs}"

# --- 1. Read the identity out of version.php, the one place it is authoritative ----------
# Parsed with PHP rather than grep so a reformatted version.php cannot quietly change what
# this reads.
# version.php ends in `defined('MOODLE_INTERNAL') || die()`, which exits SILENTLY with
# status 0 outside Moodle - the first draft of this script read three empty strings and
# blamed version.php. Both constants it expects are defined before the require.
CC_READ_VERSION='
    define("MOODLE_INTERNAL", true);
    define("MATURITY_ALPHA", 50);
    define("MATURITY_BETA", 100);
    define("MATURITY_RC", 150);
    define("MATURITY_STABLE", 200);
    $plugin = new stdClass();
    require "version.php";
    printf("%s %s %s", $plugin->component, $plugin->release, $plugin->version);
'
read -r COMPONENT RELEASE VERSION <<EOF
$(php -r "$CC_READ_VERSION")
EOF

if [ -z "$COMPONENT" ] || [ -z "$RELEASE" ] || [ -z "$VERSION" ]; then
    echo "FAIL  could not read component/release/version out of version.php" >&2
    exit 1
fi

# The pipeline's rule, stated once, here. Underscore before the v, no hyphen anywhere.
ZIP_NAME="${COMPONENT}_v${RELEASE}.zip"
ZIP_PATH="${OUT_DIR}/${ZIP_NAME}"

# A release with a hyphen or a space in it would produce a name the pipeline rejects, and
# the failure would look like a packaging bug rather than a version.php one.
if ! [[ "$RELEASE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "FAIL  \$plugin->release is '$RELEASE'; expected three dot-separated numbers" >&2
    exit 1
fi

# The directory inside the zip must be the Moodle plugin NAME, not the component - Moodle
# installs mod_contentcreator into mod/contentcreator/.
PLUGIN_NAME="${COMPONENT#*_}"
if [ "$(basename "$PLUGIN_DIR")" != "$PLUGIN_NAME" ]; then
    echo "FAIL  the working directory is '$(basename "$PLUGIN_DIR")' but the zip must contain" >&2
    echo "      a '$PLUGIN_NAME' directory. Rename the checkout rather than the zip." >&2
    exit 1
fi

echo "Packaging $COMPONENT $RELEASE ($VERSION)"
echo "  -> $ZIP_PATH"
echo ""

# --- 2. Refuse to package something that has not passed its gates ------------------------
# Packaging is the last step, so it is also the last chance to stop a broken release. Each
# of these has caught something real.
echo "Gates:"

php tests/php/static-checks.php > /tmp/cc-pkg-static.$$ 2>&1 || {
    echo "  FAIL  static checks"
    tail -20 /tmp/cc-pkg-static.$$
    rm -f /tmp/cc-pkg-static.$$
    exit 1
}
echo "  ok    $(tail -1 /tmp/cc-pkg-static.$$)"
rm -f /tmp/cc-pkg-static.$$

node tests/js/run-all.js > /tmp/cc-pkg-js.$$ 2>&1 || {
    echo "  FAIL  JS suites"
    tail -30 /tmp/cc-pkg-js.$$
    rm -f /tmp/cc-pkg-js.$$
    exit 1
}
echo "  ok    $(grep -E '^[0-9]+/[0-9]+ suite' /tmp/cc-pkg-js.$$ || echo 'JS suites passed')"
rm -f /tmp/cc-pkg-js.$$

LINTFAIL=0
while IFS= read -r f; do
    php -l "$f" > /dev/null 2>&1 || { echo "  FAIL  php -l $f"; LINTFAIL=1; }
done < <(find . -name '*.php' -not -path './node_modules/*' -not -path './vendor/*')
[ "$LINTFAIL" -eq 0 ] || exit 1
echo "  ok    php -l clean"
echo ""

# --- 3. Build ----------------------------------------------------------------------------
mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"
( cd .. && zip -rq "$ZIP_PATH" "$PLUGIN_NAME" \
    -x "${PLUGIN_NAME}/node_modules/*" \
    -x '*/.git/*' \
    -x '*/.DS_Store' \
    -x '*.swp' )

# --- 4. Verify from INSIDE the zip, not from the working tree ----------------------------
# The working tree passing proves nothing about what was actually shipped: an excluded path,
# a stale build artefact or a file never saved would all pass above and fail here.
VERIFY="$(mktemp -d)"
trap 'rm -rf "$VERIFY"' EXIT
unzip -q "$ZIP_PATH" -d "$VERIFY"

cd "$VERIFY/$PLUGIN_NAME"

ZRELEASE="$(php -r "$CC_READ_VERSION" | cut -d' ' -f2)"
if [ "$ZRELEASE" != "$RELEASE" ]; then
    echo "FAIL  the zip says release '$ZRELEASE', the filename says '$RELEASE'" >&2
    exit 1
fi

# The check the pipeline itself makes, made here first.
if [ "$(basename "$ZIP_PATH")" != "${COMPONENT}_v${ZRELEASE}.zip" ]; then
    echo "FAIL  filename '$(basename "$ZIP_PATH")' is not '${COMPONENT}_v${ZRELEASE}.zip'" >&2
    exit 1
fi

php tests/php/static-checks.php > /dev/null 2>&1 || {
    echo "FAIL  static checks do not pass inside the zip" >&2
    exit 1
}
node tests/js/run-all.js > /dev/null 2>&1 || {
    echo "FAIL  JS suites do not pass inside the zip" >&2
    exit 1
}
[ ! -d node_modules ] || { echo "FAIL  node_modules was shipped" >&2; exit 1; }
[ -d amd/build ] || { echo "FAIL  amd/build is missing from the zip" >&2; exit 1; }

cd "$PLUGIN_DIR"

echo "Verified from inside the zip:"
echo "  ok    release $ZRELEASE matches the filename"
echo "  ok    static checks and JS suites pass"
echo "  ok    amd/build present, node_modules absent"
echo ""
echo "READY  $ZIP_PATH"
echo "       $(du -h "$ZIP_PATH" | cut -f1)"
