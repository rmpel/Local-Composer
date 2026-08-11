import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import { DbConfig, EnvState, IPC_EVENTS, SITE_FLAG_CORE_DIR, WebRootMode } from './constants';
import {
	applyConfigTemplatesPatch,
	applySitePathsPatch,
	applyWpCliCorePathPatch,
	buildProjectState,
} from './webroot';
import { getProject, invalidateProject } from './project';
import { buildEnvState, fixEnvDbHost } from './envFix';
import { applySiteUrlQueryPatch } from './siteUrlFix';
import registerAddSiteComposer from './addSiteComposer';
import registerPhpSync from './phpSync';

export default function (context: LocalMain.AddonMainContext): void {
	const { siteData, localLogger, wpCli, lightningServices, configTemplates, siteDatabase } =
		LocalMain.getServiceContainer().cradle as any;

	const logger = localLogger.child({
		thread: 'main',
		addon: 'local-composer',
	});

	/**
	 * Part 1 — the split webroot/core patches. @getflywheel/local is
	 * module-aliased to the same Site class Local's own services use.
	 * Site.paths.webRoot → the composer WEBROOT (DocumentRoot {{root}},
	 * site shell, wp-config probes); WpCliService.run → the CORE dir
	 * (WordPress version, multisite sync, search-replace, installs).
	 */
	applySitePathsPatch({ SiteClass: Local.Site, logger });
	applyWpCliCorePathPatch({ wpCli, logger });
	applyConfigTemplatesPatch({ configTemplates, logger });

	LocalMain.addIpcAsyncListener(IPC_EVENTS.GET_PROJECT_STATE, async (siteId: string) => {
		const site = siteData.getSite(siteId);
		if (!site) {
			return null;
		}
		return buildProjectState(site, LocalMain.formatHomePath(site.path));
	});

	LocalMain.addIpcAsyncListener(IPC_EVENTS.SET_WEBROOT_MODE, async (siteId: string, mode: WebRootMode) => {
		const site = siteData.getSite(siteId);
		if (!site) {
			return null;
		}
		siteData.updateSite(siteId, {
			id: siteId,
			[SITE_FLAG_CORE_DIR]: mode,
		} as Partial<Local.SiteJSON>);
		invalidateProject(LocalMain.formatHomePath(site.path));
		logger.info(`Webroot handling for site ${siteId} set to "${mode}".`);
		const fresh = siteData.getSite(siteId);
		return buildProjectState(fresh, LocalMain.formatHomePath(fresh.path));
	});

	/**
	 * Part 2 — effective DB constants for the Database tab. Local's own tab
	 * regex-parses app/public/wp-config.php as text, which fails twice on
	 * composer sites: wrong path, and configs that define nothing statically
	 * (constants come from a core package / env files). `wp config list`
	 * evaluates the real wp-config.php chain without loading WordPress or
	 * touching the database, so it works on stopped sites too.
	 */
	const dbConfigCache = new Map<string, { at: number; config: DbConfig | null }>();
	const DB_CONFIG_TTL_MS = 15000;

	LocalMain.addIpcAsyncListener(IPC_EVENTS.GET_DB_CONFIG, async (siteId: string): Promise<DbConfig | null> => {
		const site = siteData.getSite(siteId);
		if (!site) {
			return null;
		}
		const sitePath = LocalMain.formatHomePath(site.path);
		// Only composer sites take the wp-cli route; stock sites return null so
		// the Database tab keeps its fast native file-parse path.
		if (!getProject(sitePath)?.coreDir) {
			return null;
		}
		const cached = dbConfigCache.get(siteId);
		if (cached && Date.now() - cached.at < DB_CONFIG_TTL_MS) {
			return cached.config;
		}
		let config: DbConfig | null = null;
		try {
			const output = await wpCli.run(new Local.Site(site), ['config', 'list', '--format=json']);
			const json = output.slice(output.indexOf('['), output.lastIndexOf(']') + 1);
			const entries = JSON.parse(json) as Array<{ name: string; value: string }>;
			const map: Record<string, string> = {};
			for (const entry of entries) {
				map[entry.name] = entry.value;
			}
			config = {
				DB_HOST: map.DB_HOST ?? null,
				DB_NAME: map.DB_NAME ?? null,
				DB_USER: map.DB_USER ?? null,
				DB_PASSWORD: map.DB_PASSWORD ?? null,
				table_prefix: map.table_prefix ?? null,
			};
		} catch (err) {
			// e.g. the config chain needs a running database, or wp-cli failed —
			// the renderer falls back to Local's native behavior.
			logger.warn(`wp config list failed for site ${siteId}: ${err?.message ?? err}`);
		}
		dbConfigCache.set(siteId, { at: Date.now(), config });
		return config;
	});

	/**
	 * Part 3 — .env DB_HOST fixer. Points the project's .env DB_HOST at
	 * Local's per-site MySQL socket (localhost:<socket>), so env-driven
	 * config chains connect without a hand-edited wp-config-local.php.
	 */
	const socketFor = (site: any): string | null => {
		try {
			const dbService = lightningServices.getSiteServiceByRole(new Local.Site(site), Local.SiteServiceRole.DATABASE);
			if (dbService?.socket) {
				return dbService.socket;
			}
		} catch (err) {
			logger.warn(`Falling back to computed socket path: ${err?.message ?? err}`);
		}
		return path.join(context.environment.userDataPath, 'run', site.id, 'mysql', 'mysqld.sock');
	};

	LocalMain.addIpcAsyncListener(IPC_EVENTS.GET_ENV_STATE, async (siteId: string): Promise<EnvState | null> => {
		const site = siteData.getSite(siteId);
		if (!site) {
			return null;
		}
		return buildEnvState(LocalMain.formatHomePath(site.path), socketFor(site));
	});

	LocalMain.addIpcAsyncListener(IPC_EVENTS.FIX_ENV_DB_HOST, async (siteId: string): Promise<EnvState | null> => {
		const site = siteData.getSite(siteId);
		if (!site) {
			return null;
		}
		const sitePath = LocalMain.formatHomePath(site.path);
		const state = buildEnvState(sitePath, socketFor(site));
		if (!state) {
			return null;
		}
		if (!state.matches) {
			fixEnvDbHost(state.envPath, state.desiredDbHost);
			logger.info(`Set DB_HOST in ${state.envPath} to "${state.desiredDbHost}".`);
			// The Database tab's values come from evaluating the config chain,
			// which just changed.
			dbConfigCache.delete(siteId);
		}
		return buildEnvState(sitePath, socketFor(site));
	});

	/**
	 * Part 4 — "Add a site" from a remote composer.json template.
	 */
	registerAddSiteComposer(context, logger);

	/**
	 * Part 5 — PHP version sync (the former "Composer PHP Sync" add-on,
	 * local-composer-php, now integrated).
	 */
	registerPhpSync(context, logger);

	/**
	 * Part 6 — suppress the "WordPress URL settings do not match the host"
	 * false positive on core-in-subdirectory sites. See siteUrlFix.ts.
	 */
	applySiteUrlQueryPatch({ siteDatabase, logger });
}
