export const ADDON_ID = 'local-composer';

/**
 * Per-site flags persisted into Local's sites.json via siteData.updateSite().
 * They travel with the site object into both the main and renderer processes.
 *
 * SITE_FLAG_PHP_MODE deliberately keeps the key the standalone
 * local-composer-php add-on used, so existing per-site settings carry over
 * when switching to this add-on.
 */
export const SITE_FLAG_PHP_MODE = 'composerPhpMode';
export const SITE_FLAG_CORE_DIR = 'composerCoreDir';

export type ComposerPhpMode = 'separate' | 'local-leads' | 'composer-leads';

export const DEFAULT_PHP_MODE: ComposerPhpMode = 'separate';

export const PHP_MODE_LABELS: Record<ComposerPhpMode, string> = {
	'separate': 'Keep separate',
	'local-leads': 'Local determines Composer PHP',
	'composer-leads': 'Composer determines Local PHP',
};

/**
 * Webroot handling for the site:
 *   'auto'    — detect the WordPress core dir from composer.json
 *               (extra["wordpress-install-dir"]) or common probes; only kicks
 *               in when Local's default app/public is not a WordPress install.
 *   'default' — never override; behave exactly like stock Local.
 * Any other string value of the site flag is a manual core-dir path relative
 * to the site's app/ folder (escape hatch, set via sites.json).
 */
export type WebRootMode = 'auto' | 'default';

export const WEBROOT_MODE_LABELS: Record<WebRootMode, string> = {
	'auto': 'Auto-detect (composer-aware)',
	'default': 'Local default (app/public)',
};

export const IPC_EVENTS = {
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
 * Payload for the composer-bootstrap "Add a site" flow. newSiteInfo is the
 * same shape the native wizard sends to Local's addSite (siteName, sitePath,
 * siteDomain, environment, multiSite, …) — collected by wizard steps 1–2 and
 * our replacement step 3.
 */
export interface CreateComposerSitePayload {
	newSiteInfo: any;
	wpCredentials: {
		adminUsername: string;
		adminPassword: string;
		adminEmail: string;
	};
	/** http(s) URL — or absolute local path — of the template composer.json. */
	templateUrl: string;
}

/**
 * State of the site's .env DB_HOST versus what Local's per-site MySQL
 * actually listens on (localhost:<unix socket>). Null overall = no .env
 * found (the row stays hidden).
 */
export interface EnvState {
	envPath: string;
	/** Current DB_HOST value in the .env, unquoted; null = no DB_HOST line. */
	currentDbHost: string | null;
	/** localhost:<socket path> for this site. */
	desiredDbHost: string;
	matches: boolean;
}

/**
 * Effective database constants for a composer site, obtained by evaluating
 * the real wp-config.php chain via `wp config list --format=json` (wp-cli's
 * config command executes wp-config.php without loading WordPress or
 * touching the database). Null values = constant not defined.
 */
export interface DbConfig {
	DB_HOST: string | null;
	DB_NAME: string | null;
	DB_USER: string | null;
	DB_PASSWORD: string | null;
	table_prefix: string | null;
}

/**
 * The composer side of the PHP sync only ever deals in major.minor:
 * composer.json pins config.platform.php as e.g. "8.3" (house convention),
 * while Local runs a full binVersion like "8.3.30" whose patch level moves
 * independently.
 */
export const majorMinor = (version: string | null | undefined): string | null => {
	const match = /(\d+)\.(\d+)/.exec(version || '');
	return match ? `${match[1]}.${match[2]}` : null;
};

export interface ComposerPhpState {
	found: boolean;
	composerJsonPath: string | null;
	declared: string | null;
	source: 'platform' | 'require' | null;
	mode: ComposerPhpMode;
	syncing: boolean;
}

export interface ComposerProjectState {
	/** A composer.json was found for this site. */
	found: boolean;
	composerJsonPath: string | null;
	/** WordPress core dir, relative to the site root (e.g. "app/public_html/wp"). */
	coreDirRelative: string | null;
	/** Webroot, relative to the site root (e.g. "app/public_html"). */
	webRootRelative: string | null;
	/** How the core dir was determined. */
	source: 'wordpress-install-dir' | 'probe' | 'manual' | null;
	/** True when core dir exists on disk and contains wp-includes/. */
	coreInstalled: boolean;
	mode: WebRootMode | 'manual';
	/** True when the webRoot patch is currently overriding Local's default. */
	active: boolean;
}
