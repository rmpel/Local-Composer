import * as fs from 'fs';
import * as path from 'path';
import { SITE_FLAG_CORE_DIR, ComposerProjectState, WebRootMode } from './constants';
import { getProject } from './project';

/**
 * The webRoot patch — the heart of this add-on.
 *
 * `Site.paths.webRoot` is hardcoded to app/public in Local
 * (shared/models/Site.js), with no filter and no per-site override. On a
 * composer layout with a public_html/ or web/ webroot that breaks the web
 * server's DocumentRoot (the {{root}} variable in the conf templates comes
 * from site.paths.webRoot via the http service's configVariables), the site
 * shell's cwd, one-click admin's wp-config probe, and — because every
 * wp-cli invocation runs `wp --path=<webRoot>` — the WordPress version,
 * multisite domain sync and domain-rename search-replace.
 *
 * The subtlety: those consumers want two DIFFERENT directories. The web
 * server, shell and file ops want the *webroot* (public_html); wp-cli wants
 * the *core* dir (public_html/wp, where wp-includes lives — verified that
 * wp-cli finds wp-config.php one level up on its own, and that the
 * WP_CONFIG_PATH env Local sets pointing at a nonexistent file is
 * harmless). So the fix is split:
 *
 *   - Site.prototype.paths (applySitePathsPatch) resolves webRoot to the
 *     WEBROOT — DocumentRoot, shell, table-prefix probe all get public_html.
 *   - WpCliService.run (applyWpCliCorePathPatch) hands wp-cli a site clone
 *     whose webRoot is the CORE dir.
 *
 * Local aliases @getflywheel/local to the same module instance its own
 * services use, so both patches reach every consumer.
 *
 * Not covered (they hardcode 'app/public' without going through Site.paths):
 * MagicSync push/pull, importers/exporters, Live Links' mu-plugin path.
 */

const isCoreDir = (dir: string): boolean => fs.existsSync(path.join(dir, 'wp-includes', 'version.php'));

const flagOf = (site: any): string => {
	const value = site?.[SITE_FLAG_CORE_DIR];
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'auto';
};

/**
 * public_html/wp → public_html; a core sitting directly in the project dir
 * (core-at-webroot layouts) is its own webroot.
 */
export const webRootDirOf = (projectDir: string, coreDir: string): string => {
	const parent = path.dirname(coreDir);
	return parent === projectDir ? coreDir : parent;
};

export interface ComposerPaths {
	coreDir: string;
	webRoot: string;
}

/**
 * Resolve the composer core dir + webroot for a site, or null to leave
 * Local's defaults untouched. `origPaths` is the object Local's own getter
 * just produced.
 */
export const resolveComposerPaths = (
	site: any,
	origPaths: { app: string; webRoot: string },
): ComposerPaths | null => {
	const flag = flagOf(site);
	if (flag === 'default') {
		return null;
	}
	const siteRoot = path.dirname(origPaths.app);
	if (flag !== 'auto') {
		// Manual escape hatch: a core-dir path relative to app/.
		const coreDir = path.resolve(origPaths.app, flag);
		const project = getProject(siteRoot);
		return { coreDir, webRoot: webRootDirOf(project?.dir ?? origPaths.app, coreDir) };
	}
	// Auto mode is deliberately conservative: a stock site (app/public is a
	// WordPress install) is never touched.
	if (isCoreDir(origPaths.webRoot)) {
		return null;
	}
	const project = getProject(siteRoot);
	if (!project?.coreDir) {
		return null;
	}
	return {
		coreDir: project.coreDir,
		webRoot: webRootDirOf(project.dir, project.coreDir),
	};
};

interface PatchDeps {
	SiteClass: any;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

/**
 * Redefine the `paths` getter on Site.prototype so webRoot resolves to the
 * composer WEBROOT. Idempotent; returns false (and leaves Local stock) if
 * the model no longer looks patchable.
 */
export const applySitePathsPatch = ({ SiteClass, logger }: PatchDeps): boolean => {
	const proto = SiteClass?.prototype;
	const PATCH_MARK = '__localComposerWebRootPatch';
	if (!proto) {
		logger.warn('Site class not found — webRoot patch skipped, running indicator-only.');
		return false;
	}
	if (proto[PATCH_MARK]) {
		return true;
	}
	const descriptor = Object.getOwnPropertyDescriptor(proto, 'paths');
	if (!descriptor?.get || descriptor.set) {
		logger.warn('Site.paths no longer matches the expected shape — webRoot patch skipped.');
		return false;
	}
	const originalGet = descriptor.get;
	Object.defineProperty(proto, 'paths', {
		configurable: true,
		enumerable: descriptor.enumerable,
		get() {
			const paths = originalGet.call(this);
			try {
				const resolved = resolveComposerPaths(this, paths);
				if (resolved && resolved.webRoot !== paths.webRoot) {
					return { ...paths, webRoot: resolved.webRoot };
				}
			} catch (err) {
				// Any detection hiccup must never break Site.paths itself.
			}
			return paths;
		},
	});
	proto[PATCH_MARK] = true;
	logger.info('Site.paths.webRoot patched: composer-aware webroot resolution active.');
	return true;
};

/**
 * Wrap WpCliService.run so wp-cli receives the CORE dir as its --path.
 * The wrapper passes a shallow site clone whose paths.webRoot is the core
 * dir — run() reads `site.paths` lazily, so nothing else changes. All
 * wp-cli consumers (WordPress version, multisite sync, search-replace,
 * installers, our own wp config list) go through this one method.
 */
export const applyWpCliCorePathPatch = ({ wpCli, logger }: { wpCli: any; logger: any }): boolean => {
	const PATCH_MARK = '__localComposerCorePathPatch';
	if (!wpCli || typeof wpCli.run !== 'function') {
		logger.warn('WpCliService not found — wp-cli core-path patch skipped.');
		return false;
	}
	if (wpCli[PATCH_MARK]) {
		return true;
	}
	const originalRun = wpCli.run.bind(wpCli);
	wpCli.run = (site: any, args: any, opts: any) => {
		try {
			const paths = site?.paths;
			if (paths?.app) {
				const resolved = resolveComposerPaths(site, paths);
				if (resolved && resolved.coreDir !== paths.webRoot) {
					const clone = Object.create(Object.getPrototypeOf(site));
					Object.assign(clone, site);
					Object.defineProperty(clone, 'paths', {
						get: () => ({ ...paths, webRoot: resolved.coreDir }),
					});
					site = clone;
				}
			}
		} catch (err) {
			// Fall through with the original site object.
		}
		return originalRun(site, args, opts);
	};
	wpCli[PATCH_MARK] = true;
	logger.info('WpCliService.run patched: wp-cli now targets the composer core dir.');
	return true;
};

/**
 * Wrap ConfigTemplatesService.compileConfigTemplates to fix config
 * variables that lightning services compute with a hardcoded
 * app/public path instead of site.paths.webRoot. Known offender:
 * PhpService's wpCaBundlePath ({{wpCaBundlePath}} → openssl.cafile in
 * php.ini) joins site.longPath + "app/public/wp-includes/…" literally —
 * doubly wrong on composer layouts (webroot name AND the core subdir).
 * Every service's config compile funnels through this one method, so the
 * fix covers every PHP version package without touching downloaded
 * service files.
 */
export const applyConfigTemplatesPatch = ({ configTemplates, logger }: { configTemplates: any; logger: any }): boolean => {
	const PATCH_MARK = '__localComposerConfigVarsPatch';
	if (!configTemplates || typeof configTemplates.compileConfigTemplates !== 'function') {
		logger.warn('ConfigTemplatesService not found — config-variables patch skipped.');
		return false;
	}
	if (configTemplates[PATCH_MARK]) {
		return true;
	}
	const original = configTemplates.compileConfigTemplates.bind(configTemplates);
	configTemplates.compileConfigTemplates = (site: any, templatesDir: any, destDir: any, context: any) => {
		try {
			if (context && typeof context.wpCaBundlePath === 'string' && site?.paths?.app) {
				// Reconstruct Local's DEFAULT paths: resolveComposerPaths'
				// conservative guard compares against app/public, and
				// site.paths is already patched to the webroot here.
				const app = site.paths.app;
				const resolved = resolveComposerPaths(site, { app, webRoot: path.join(app, 'public') });
				if (resolved) {
					context = {
						...context,
						wpCaBundlePath: path.join(resolved.coreDir, 'wp-includes', 'certificates', 'ca-bundle.crt'),
					};
				}
			}
		} catch (err) {
			// Never break config compilation over a detection hiccup.
		}
		return original(site, templatesDir, destDir, context);
	};
	configTemplates[PATCH_MARK] = true;
	logger.info('ConfigTemplatesService patched: wpCaBundlePath resolves to the composer core dir.');
	return true;
};

/** State for the Overview row, computed main-side on request. */
export const buildProjectState = (site: any, sitePath: string): ComposerProjectState => {
	const flag = flagOf(site);
	const mode: WebRootMode | 'manual' = flag === 'auto' || flag === 'default' ? flag : 'manual';
	const empty: ComposerProjectState = {
		found: false,
		composerJsonPath: null,
		coreDirRelative: null,
		webRootRelative: null,
		source: null,
		coreInstalled: false,
		mode,
		active: false,
	};
	const project = getProject(sitePath);
	if (!project) {
		return empty;
	}
	const appDir = path.join(sitePath, 'app');
	const origPaths = { app: appDir, webRoot: path.join(appDir, 'public') };
	const resolved = resolveComposerPaths(site, origPaths);
	const coreDir = mode === 'manual' ? resolved?.coreDir ?? null : project.coreDir;
	return {
		found: true,
		composerJsonPath: project.composerJsonPath,
		coreDirRelative: coreDir ? path.relative(sitePath, coreDir) : null,
		webRootRelative: resolved ? path.relative(sitePath, resolved.webRoot) : null,
		source: mode === 'manual' ? 'manual' : project.source,
		coreInstalled: coreDir ? isCoreDir(coreDir) : false,
		mode,
		active: Boolean(resolved),
	};
};
