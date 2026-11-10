<?php
namespace mod_contentcreator\aicoursebuilder;

defined('MOODLE_INTERNAL') || die();

/**
 * AI Course Builder adapter for Content Creator.
 */
class generator {
    private const COMPONENT = 'mod_contentcreator';

    public static function is_available(): bool {
        return class_exists('\local_aicoursebuilder\local\generator_runtime')
            && \local_aicoursebuilder\local\generator_runtime::component_available(self::COMPONENT);
    }

    public static function estimate(array $brief): int {
        return \local_aicoursebuilder\local\generator_runtime::estimate(self::COMPONENT, $brief);
    }

    public static function generate(int $cmid, array $brief): string {
        return \local_aicoursebuilder\local\generator_runtime::generate(self::COMPONENT, $cmid, $brief);
    }

    public static function status(int $cmid, string $jobid): array {
        return \local_aicoursebuilder\local\generator_runtime::status(self::COMPONENT, $cmid, $jobid);
    }

    public static function native_estimate(array $brief): int {
        return native_adapter::estimate();
    }

    public static function native_generate(int $cmid, array $brief): string {
        return native_adapter::generate($cmid, $brief);
    }

    public static function native_status(int $cmid, string $jobid): array {
        return native_adapter::status($cmid, $jobid);
    }

    public static function native_save_result(int $cmid, array $result): bool {
        return native_adapter::save_result($cmid, $result);
    }
}
