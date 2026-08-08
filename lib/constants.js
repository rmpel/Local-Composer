"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.majorMinor = exports.IPC_EVENTS = exports.WEBROOT_MODE_LABELS = exports.PHP_MODE_LABELS = exports.DEFAULT_PHP_MODE = exports.SITE_FLAG_CORE_DIR = exports.SITE_FLAG_PHP_MODE = exports.ADDON_ID = void 0;
exports.ADDON_ID = 'local-composer';
/**
 * Per-site flags persisted into Local's sites.json via siteData.updateSite().
 * They travel with the site object into both the main and renderer processes.
 *
 * SITE_FLAG_PHP_MODE deliberately keeps the key the standalone
 * local-composer-php add-on used, so existing per-site settings carry over
 * when switching to this add-on.
 */
exports.SITE_FLAG_PHP_MODE = 'composerPhpMode';
exports.SITE_FLAG_CORE_DIR = 'composerCoreDir';
exports.DEFAULT_PHP_MODE = 'separate';
exports.PHP_MODE_LABELS = {
    'separate': 'Keep separate',
    'local-leads': 'Local determines Composer PHP',
    'composer-leads': 'Composer determines Local PHP',
};
exports.WEBROOT_MODE_LABELS = {
    'auto': 'Auto-detect (composer-aware)',
    'default': 'Local default (app/public)',
};
exports.IPC_EVENTS = {
    GET_PHP_STATE: 'local-composer:get-php-state',
    SET_PHP_MODE: 'local-composer:set-php-mode',
    SITE_SWAPPED: 'local-composer:site-swapped',
    PHP_STATE_CHANGED: 'local-composer:php-state-changed',
    GET_PROJECT_STATE: 'local-composer:get-project-state',
    SET_WEBROOT_MODE: 'local-composer:set-webroot-mode',
    PROJECT_STATE_CHANGED: 'local-composer:project-state-changed',
    GET_DB_CONFIG: 'local-composer:get-db-config',
    GET_ENV_STATE: 'local-composer:get-env-state',
    FIX_ENV_DB_HOST: 'local-composer:fix-env-db-host',
    CREATE_COMPOSER_SITE: 'local-composer:create-composer-site',
};
/**
 * The composer side of the PHP sync only ever deals in major.minor:
 * composer.json pins config.platform.php as e.g. "8.3" (house convention),
 * while Local runs a full binVersion like "8.3.30" whose patch level moves
 * independently.
 */
const majorMinor = (version) => {
    const match = /(\d+)\.(\d+)/.exec(version || '');
    return match ? `${match[1]}.${match[2]}` : null;
};
exports.majorMinor = majorMinor;
//# sourceMappingURL=constants.js.map