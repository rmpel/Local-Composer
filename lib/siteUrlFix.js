"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySiteUrlQueryPatch = void 0;
const path = __importStar(require("path"));
const webroot_1 = require("./webroot");
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
const applySiteUrlQueryPatch = ({ siteDatabase, logger }) => {
    const PATCH_MARK = '__localComposerSiteUrlPatch';
    if (!siteDatabase || typeof siteDatabase.runQuery !== 'function') {
        logger.warn('SiteDatabaseService not found — siteurl false-positive patch skipped.');
        return false;
    }
    if (siteDatabase[PATCH_MARK]) {
        return true;
    }
    const originalRunQuery = siteDatabase.runQuery.bind(siteDatabase);
    siteDatabase.runQuery = async (site, query, ...rest) => {
        var _a;
        const result = await originalRunQuery(site, query, ...rest);
        try {
            if (typeof result === 'string' &&
                typeof query === 'string' &&
                HOME_SITEURL_QUERY.test(query.trim()) &&
                ((_a = site === null || site === void 0 ? void 0 : site.paths) === null || _a === void 0 ? void 0 : _a.app)) {
                // Reconstruct Local's DEFAULT paths — site.paths is already
                // patched to the composer webroot here (see webroot.ts).
                const app = site.paths.app;
                const resolved = (0, webroot_1.resolveComposerPaths)(site, { app, webRoot: path.join(app, 'public') });
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
        }
        catch (err) {
            // Never break a database query over a composer-detection hiccup.
        }
        return result;
    };
    siteDatabase[PATCH_MARK] = true;
    logger.info('SiteDatabaseService.runQuery patched: home/siteurl report normalized, without the composer core subdir.');
    return true;
};
exports.applySiteUrlQueryPatch = applySiteUrlQueryPatch;
//# sourceMappingURL=siteUrlFix.js.map