import * as fs from 'fs';
import * as path from 'path';
import * as Local from '@getflywheel/local';
import * as LocalMain from '@getflywheel/local/main';
import {
	ComposerPhpMode,
	ComposerPhpState,
	DEFAULT_PHP_MODE,
	IPC_EVENTS,
	SITE_FLAG_PHP_MODE,
	majorMinor,
} from './constants';
import { findComposerJson, findPhpBinFallback, readComposerPhp, runComposer } from './composer';

/**
 * PHP version sync — ported from the standalone local-composer-php add-on
 * ("Composer PHP Sync"). Keeps a site's Local PHP version and its
 * composer.json platform pin in sync, in either direction, per site.
 * Disable the old add-on when this one is enabled: both would register the
 * same Overview row and watch the same composer.json.
 */

const BANNER_ID = 'local-composer-php';

export default function registerPhpSync(context: LocalMain.AddonMainContext, logger: any): void {
	const { siteData, lightningServices } = LocalMain.getServiceContainer().cradle as any;

	const watchers = new Map<string, fs.FSWatcher>();
	const watchDebounce = new Map<string, NodeJS.Timeout>();
	const syncing = new Set<string>();
	/**
	 * Timestamps of our own composer.json/lock writes, so the composer-leads
	 * watcher doesn't misread a local-leads sync (or a lock refresh) as a
	 * user edit.
	 */
	const selfWrites = new Map<string, number>();

	const getSite = (siteId: string) => siteData.getSite(siteId);

	const sitePath = (site: any): string => LocalMain.formatHomePath(site.path);

	const getMode = (site: any): ComposerPhpMode => site?.[SITE_FLAG_PHP_MODE] || DEFAULT_PHP_MODE;

	const notifyRenderer = (siteId: string) => {
		LocalMain.sendIPCEvent(IPC_EVENTS.PHP_STATE_CHANGED, siteId);
	};

	const banner = (siteId: string, variant: 'success' | 'warning' | 'error', title: string, message?: string) => {
		LocalMain.sendIPCEvent('showSiteBanner', {
			siteID: siteId,
			id: BANNER_ID,
			variant,
			title,
			message,
		});
	};

	const buildState = (siteId: string): ComposerPhpState => {
		const site = getSite(siteId);
		const empty: ComposerPhpState = {
			found: false,
			composerJsonPath: null,
			declared: null,
			source: null,
			mode: getMode(site),
			syncing: syncing.has(siteId),
		};
		if (!site) {
			return empty;
		}
		const composerJsonPath = findComposerJson(sitePath(site));
		if (!composerJsonPath) {
			return empty;
		}
		const { declared, source } = readComposerPhp(composerJsonPath);
		return { ...empty, found: true, composerJsonPath, declared, source };
	};

	const phpBinFor = (site: any): string | null => {
		try {
			const service = lightningServices.getSiteServiceByRole(new Local.Site(site), Local.SiteServiceRole.PHP);
			if (service?.bin && fs.existsSync(service.bin)) {
				return service.bin;
			}
		} catch (err) {
			logger.warn(`Falling back to manual PHP binary lookup: ${err?.message ?? err}`);
		}
		return findPhpBinFallback(context.environment.userDataPath, site?.services?.php?.version);
	};

	const markSelfWrite = (dir: string) => selfWrites.set(dir, Date.now());

	const isSelfWrite = (dir: string): boolean => Date.now() - (selfWrites.get(dir) || 0) < 10000;

	/**
	 * Local → Composer. Writes composer.json truthfully in all cases; the lock
	 * is only refreshed when the new pin still satisfies every locked package's
	 * PHP floor — a blocked downgrade is the user's call to make (it would
	 * rewrite installed packages, possibly plugins/themes).
	 */
	const syncLocalToComposer = async (siteId: string): Promise<void> => {
		if (syncing.has(siteId)) {
			return;
		}
		syncing.add(siteId);
		notifyRenderer(siteId);
		try {
			const site = getSite(siteId);
			const targetPhp = majorMinor(site?.services?.php?.version);
			const composerJsonPath = site && findComposerJson(sitePath(site));
			if (!targetPhp || !composerJsonPath) {
				return;
			}
			const dir = path.dirname(composerJsonPath);
			const { declared } = readComposerPhp(composerJsonPath);
			if (declared === targetPhp) {
				return;
			}

			const phpBin = phpBinFor(site);
			if (!phpBin) {
				banner(siteId, 'error', 'Composer PHP Sync: PHP binary not found', 'Could not locate the site\'s PHP service binary.');
				return;
			}

			logger.info(`Syncing composer.json of ${site.name} to PHP ${targetPhp} (was: ${declared ?? 'undeclared'}).`);

			const lockExists = fs.existsSync(path.join(dir, 'composer.lock'));
			let blocked = false;
			let blockReport = '';
			if (lockExists) {
				// Pre-flight: exit 1 means locked packages have a higher PHP
				// floor than the new pin (which composer reads as X.Y.0).
				const preflight = await runComposer(phpBin, dir, ['why-not', 'php', `${targetPhp}.0`, '--locked']);
				blocked = !preflight.ok;
				blockReport = preflight.output;
			}

			markSelfWrite(dir);
			const config = await runComposer(phpBin, dir, ['config', 'platform.php', targetPhp]);
			if (!config.ok) {
				banner(siteId, 'error', 'Composer PHP Sync: could not update composer.json', config.output.slice(0, 500));
				return;
			}

			if (blocked) {
				banner(
					siteId,
					'warning',
					`composer.json now declares PHP ${targetPhp}, but locked packages require more.`,
					`Run "composer update" yourself to downgrade them — this may rewrite installed plugins/themes. ${blockReport.slice(0, 600)}`,
				);
				return;
			}

			if (lockExists) {
				markSelfWrite(dir);
				const lock = await runComposer(phpBin, dir, ['update', '--lock', '--no-install', '--no-scripts', '--no-audit']);
				markSelfWrite(dir);
				if (!lock.ok) {
					banner(
						siteId,
						'warning',
						`composer.json now declares PHP ${targetPhp}, but the lock refresh failed.`,
						'Possibly offline — run "composer update --lock" when online.',
					);
					return;
				}
			}

			if (fs.existsSync(path.join(dir, 'vendor'))) {
				markSelfWrite(dir);
				await runComposer(phpBin, dir, ['dump-autoload']);
			}

			banner(siteId, 'success', `composer.json now declares PHP ${targetPhp}.`);
			logger.info(`composer.json of ${site.name} synced to PHP ${targetPhp}.`);
		} catch (err) {
			logger.error(`Local → Composer sync failed: ${err?.message ?? err}`);
			banner(siteId, 'error', 'Composer PHP Sync failed', `${err?.message ?? err}`);
		} finally {
			syncing.delete(siteId);
			notifyRenderer(siteId);
		}
	};

	/**
	 * Composer → Local, detection half. The actual swap restarts the site, so
	 * it is never run unattended: the Overview row offers the one-click apply.
	 */
	const evaluateComposerLeads = (siteId: string) => {
		const site = getSite(siteId);
		if (!site || getMode(site) !== 'composer-leads') {
			return;
		}
		const state = buildState(siteId);
		const localPhp = majorMinor(site?.services?.php?.version);
		if (state.declared && localPhp && state.declared !== localPhp) {
			banner(
				siteId,
				'warning',
				`composer.json declares PHP ${state.declared}, but this site runs PHP ${localPhp}.`,
				'Open the site\'s Overview tab and use "Composer PHP" to apply it.',
			);
		}
		notifyRenderer(siteId);
	};

	const stopWatcher = (siteId: string) => {
		watchers.get(siteId)?.close();
		watchers.delete(siteId);
		const timer = watchDebounce.get(siteId);
		if (timer) {
			clearTimeout(timer);
			watchDebounce.delete(siteId);
		}
	};

	const startWatcher = (siteId: string) => {
		stopWatcher(siteId);
		const site = getSite(siteId);
		const composerJsonPath = site && findComposerJson(sitePath(site));
		if (!composerJsonPath) {
			return;
		}
		const dir = path.dirname(composerJsonPath);
		try {
			// Watch the directory, not the file: composer rewrites via
			// rename, which kills a direct file watch on macOS.
			const watcher = fs.watch(dir, (_eventType, filename) => {
				if (filename && filename !== 'composer.json') {
					return;
				}
				const existing = watchDebounce.get(siteId);
				if (existing) {
					clearTimeout(existing);
				}
				watchDebounce.set(
					siteId,
					setTimeout(() => {
						watchDebounce.delete(siteId);
						if (isSelfWrite(dir)) {
							notifyRenderer(siteId);
							return;
						}
						evaluateComposerLeads(siteId);
					}, 750),
				);
			});
			watchers.set(siteId, watcher);
		} catch (err) {
			logger.warn(`Could not watch ${dir}: ${err?.message ?? err}`);
		}
	};

	LocalMain.addIpcAsyncListener(IPC_EVENTS.GET_PHP_STATE, async (siteId: string) => buildState(siteId));

	LocalMain.addIpcAsyncListener(IPC_EVENTS.SET_PHP_MODE, async (siteId: string, mode: ComposerPhpMode) => {
		siteData.updateSite(siteId, {
			id: siteId,
			[SITE_FLAG_PHP_MODE]: mode,
		} as Partial<Local.SiteJSON>);
		logger.info(`PHP version management for site ${siteId} set to "${mode}".`);

		if (mode === 'composer-leads') {
			startWatcher(siteId);
			evaluateComposerLeads(siteId);
		} else {
			stopWatcher(siteId);
		}
		if (mode === 'local-leads') {
			// Initial sync — deliberately not awaited; the row shows progress
			// via the syncing flag and the PHP_STATE_CHANGED push.
			syncLocalToComposer(siteId);
		}
		return buildState(siteId);
	});

	// The renderer forwards Local's own 'siteServiceSwapped' broadcast here
	// (there is no main-process hook for it).
	LocalMain.addIpcAsyncListener(IPC_EVENTS.SITE_SWAPPED, async (siteId: string) => {
		const site = getSite(siteId);
		if (getMode(site) === 'local-leads') {
			await syncLocalToComposer(siteId);
		} else {
			notifyRenderer(siteId);
		}
	});

	// Re-arm watchers for composer-leads sites on app boot.
	for (const site of Object.values(siteData.getSites()) as any[]) {
		if (getMode(site) === 'composer-leads') {
			startWatcher(site.id);
		}
	}
}
