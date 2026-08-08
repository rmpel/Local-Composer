import * as fs from 'fs';
import * as path from 'path';
import { findComposerJson, readComposerJson } from './composer';

/**
 * Composer-project introspection: where is the WordPress core dir?
 *
 * Everything in Local that breaks on composer sites (WordPress version,
 * multisite domain sync, one-click admin, site shell) funnels through wp-cli
 * with `--path=<Site.paths.webRoot>` — and wp-cli needs the *core* directory
 * (the one containing wp-includes/), not the webroot. For subdir installs the
 * two differ: webroot public_html/, core public_html/wp/.
 *
 * composer.json hands us the core dir for free via
 * extra["wordpress-install-dir"] (Acato: "public_html/wp", Bedrock: "web/wp").
 * When it's absent we probe common layouts.
 */

export interface ComposerProject {
	composerJsonPath: string;
	/** Directory containing composer.json. */
	dir: string;
	/** Absolute path to the WordPress core dir, if determinable. */
	coreDir: string | null;
	source: 'wordpress-install-dir' | 'probe' | null;
	/** core dir exists and contains wp-includes/ */
	coreInstalled: boolean;
}

const isCoreDir = (dir: string): boolean => fs.existsSync(path.join(dir, 'wp-includes', 'version.php'));

/**
 * Webroot dirs (relative to composer.json's dir) to probe for a core
 * subdirectory when composer.json does not declare wordpress-install-dir.
 */
const CORE_PROBES = [
	'public_html/wp',
	'web/wp',
	'public/wp',
	'wp',
	'public_html',
	'web',
];

export const detectProject = (sitePath: string): ComposerProject | null => {
	const composerJsonPath = findComposerJson(sitePath);
	if (!composerJsonPath) {
		return null;
	}
	const dir = path.dirname(composerJsonPath);
	const project: ComposerProject = {
		composerJsonPath,
		dir,
		coreDir: null,
		source: null,
		coreInstalled: false,
	};

	const declared = readComposerJson(composerJsonPath)?.extra?.['wordpress-install-dir'];
	if (typeof declared === 'string' && declared.trim() !== '') {
		// Trusted even when not (yet) installed — composer.json states where
		// core will live, which beats Local's default either way.
		const coreDir = path.resolve(dir, declared.trim());
		project.coreDir = coreDir;
		project.source = 'wordpress-install-dir';
		project.coreInstalled = isCoreDir(coreDir);
		return project;
	}

	for (const probe of CORE_PROBES) {
		const candidate = path.join(dir, probe);
		if (isCoreDir(candidate)) {
			project.coreDir = candidate;
			project.source = 'probe';
			project.coreInstalled = true;
			return project;
		}
	}

	return project;
};

/**
 * Site.paths is a getter that many services hit on hot paths (every wp-cli
 * call, config compile, shell open), and detection does synchronous fs probes
 * plus a JSON parse — so results are cached briefly per site path.
 */
const CACHE_TTL_MS = 5000;
const cache = new Map<string, { at: number; project: ComposerProject | null }>();

export const getProject = (sitePath: string): ComposerProject | null => {
	const hit = cache.get(sitePath);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
		return hit.project;
	}
	const project = detectProject(sitePath);
	cache.set(sitePath, { at: Date.now(), project });
	return project;
};

export const invalidateProject = (sitePath?: string): void => {
	if (sitePath) {
		cache.delete(sitePath);
	} else {
		cache.clear();
	}
};
