import * as path from 'path';
import { resolveComposerPaths } from './webroot';

/**
 * Part 6 — the "WordPress URL settings do not match the host set in Local"
 * false positive.
 *
 * Local's troubleshooting bar reads home/siteurl straight from the database
 * (SiteDatabaseService.runQuery, raw SQL — no WordPress, no wp-config) and
 * compares them to site.host after stripping only the protocol
 * (renderer/sites/SiteInfoTroubleshootingBar.js). On a core-in-subdirectory
 * composer site, siteurl is legitimately https://<host>/wp, so the
 * comparison can never pass and the warning banner shows on every running
 * composer site. Its "Fix it" button happens to be a no-op — the domain
 * changer bails when the old domain contains the new one, which
 * '<host>/wp' vs '<host>' always does — so the banner also never clears.
 *
 * The same check also reads `home` and compares it the same way, so a
 * `home` value with a trailing slash (https://<host>/ vs host <host>) trips
 * the banner just as falsely — WordPress itself treats the two as
 * identical.
 *
 * The IPC handler and ChangeSiteDomainService both call runQuery on the
 * siteDatabase singleton at call time, so wrapping the instance method
 * covers both consumers. When their exact home/siteurl lookup comes
 * through for a composer site, trailing slashes are dropped from the
 * returned URL and — for siteurl — the known core subdir is stripped.
 * The domain part is passed through untouched, so a genuine mismatch (a
 * stale production URL in the database) still trips the banner and is
 * still repairable — only the legitimate core-path suffix and slash
 * normalization stop doing so.
 */

/** The two query shapes the banner check and the domain changer issue. */
const HOME_SITEURL_QUERY = /^SELECT option_value FROM \S+options WHERE option_name='(home|siteurl)' LIMIT 1$/;

interface PatchDeps {
	siteDatabase: any;
	logger: { info: (msg: string) => void; warn: (msg: string) => void };
}

export const applySiteUrlQueryPatch = ({ siteDatabase, logger }: PatchDeps): boolean => {
	const PATCH_MARK = '__localComposerSiteUrlPatch';
	if (!siteDatabase || typeof siteDatabase.runQuery !== 'function') {
		logger.warn('SiteDatabaseService not found — siteurl false-positive patch skipped.');
		return false;
	}
	if (siteDatabase[PATCH_MARK]) {
		return true;
	}
	const originalRunQuery = siteDatabase.runQuery.bind(siteDatabase);
	siteDatabase.runQuery = async (site: any, query: any, ...rest: any[]) => {
		const result = await originalRunQuery(site, query, ...rest);
		try {
			if (
				typeof result === 'string' &&
				typeof query === 'string' &&
				HOME_SITEURL_QUERY.test(query.trim()) &&
				site?.paths?.app
			) {
				// Reconstruct Local's DEFAULT paths — site.paths is already
				// patched to the composer webroot here (see webroot.ts).
				const app = site.paths.app;
				const resolved = resolveComposerPaths(site, { app, webRoot: path.join(app, 'public') });
				if (resolved) {
					let value = result.trim().replace(/\/+$/, '');
					if (resolved.coreDir !== resolved.webRoot) {
						const suffix = '/' + path.relative(resolved.webRoot, resolved.coreDir).split(path.sep).join('/');
						if (value.toLowerCase().endsWith(suffix.toLowerCase())) {
							value = value.slice(0, value.length - suffix.length);
						}
					}
					return value;
				}
			}
		} catch (err) {
			// Never break a database query over a composer-detection hiccup.
		}
		return result;
	};
	siteDatabase[PATCH_MARK] = true;
	logger.info('SiteDatabaseService.runQuery patched: home/siteurl report normalized, without the composer core subdir.');
	return true;
};
