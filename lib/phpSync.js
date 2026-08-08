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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Local = __importStar(require("@getflywheel/local"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const constants_1 = require("./constants");
const composer_1 = require("./composer");
/**
 * PHP version sync — ported from the standalone local-composer-php add-on
 * ("Composer PHP Sync"). Keeps a site's Local PHP version and its
 * composer.json platform pin in sync, in either direction, per site.
 * Disable the old add-on when this one is enabled: both would register the
 * same Overview row and watch the same composer.json.
 */
const BANNER_ID = 'local-composer-php';
function registerPhpSync(context, logger) {
    const { siteData, lightningServices } = LocalMain.getServiceContainer().cradle;
    const watchers = new Map();
    const watchDebounce = new Map();
    const syncing = new Set();
    /**
     * Timestamps of our own composer.json/lock writes, so the composer-leads
     * watcher doesn't misread a local-leads sync (or a lock refresh) as a
     * user edit.
     */
    const selfWrites = new Map();
    const getSite = (siteId) => siteData.getSite(siteId);
    const sitePath = (site) => LocalMain.formatHomePath(site.path);
    const getMode = (site) => (site === null || site === void 0 ? void 0 : site[constants_1.SITE_FLAG_PHP_MODE]) || constants_1.DEFAULT_PHP_MODE;
    const notifyRenderer = (siteId) => {
        LocalMain.sendIPCEvent(constants_1.IPC_EVENTS.PHP_STATE_CHANGED, siteId);
    };
    const banner = (siteId, variant, title, message) => {
        LocalMain.sendIPCEvent('showSiteBanner', {
            siteID: siteId,
            id: BANNER_ID,
            variant,
            title,
            message,
        });
    };
    const buildState = (siteId) => {
        const site = getSite(siteId);
        const empty = {
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
        const composerJsonPath = (0, composer_1.findComposerJson)(sitePath(site));
        if (!composerJsonPath) {
            return empty;
        }
        const { declared, source } = (0, composer_1.readComposerPhp)(composerJsonPath);
        return Object.assign(Object.assign({}, empty), { found: true, composerJsonPath, declared, source });
    };
    const phpBinFor = (site) => {
        var _a, _b, _c;
        try {
            const service = lightningServices.getSiteServiceByRole(new Local.Site(site), Local.SiteServiceRole.PHP);
            if ((service === null || service === void 0 ? void 0 : service.bin) && fs.existsSync(service.bin)) {
                return service.bin;
            }
        }
        catch (err) {
            logger.warn(`Falling back to manual PHP binary lookup: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
        }
        return (0, composer_1.findPhpBinFallback)(context.environment.userDataPath, (_c = (_b = site === null || site === void 0 ? void 0 : site.services) === null || _b === void 0 ? void 0 : _b.php) === null || _c === void 0 ? void 0 : _c.version);
    };
    const markSelfWrite = (dir) => selfWrites.set(dir, Date.now());
    const isSelfWrite = (dir) => Date.now() - (selfWrites.get(dir) || 0) < 10000;
    /**
     * Local → Composer. Writes composer.json truthfully in all cases; the lock
     * is only refreshed when the new pin still satisfies every locked package's
     * PHP floor — a blocked downgrade is the user's call to make (it would
     * rewrite installed packages, possibly plugins/themes).
     */
    const syncLocalToComposer = async (siteId) => {
        var _a, _b, _c, _d;
        if (syncing.has(siteId)) {
            return;
        }
        syncing.add(siteId);
        notifyRenderer(siteId);
        try {
            const site = getSite(siteId);
            const targetPhp = (0, constants_1.majorMinor)((_b = (_a = site === null || site === void 0 ? void 0 : site.services) === null || _a === void 0 ? void 0 : _a.php) === null || _b === void 0 ? void 0 : _b.version);
            const composerJsonPath = site && (0, composer_1.findComposerJson)(sitePath(site));
            if (!targetPhp || !composerJsonPath) {
                return;
            }
            const dir = path.dirname(composerJsonPath);
            const { declared } = (0, composer_1.readComposerPhp)(composerJsonPath);
            if (declared === targetPhp) {
                return;
            }
            const phpBin = phpBinFor(site);
            if (!phpBin) {
                banner(siteId, 'error', 'Composer PHP Sync: PHP binary not found', 'Could not locate the site\'s PHP service binary.');
                return;
            }
            logger.info(`Syncing composer.json of ${site.name} to PHP ${targetPhp} (was: ${declared !== null && declared !== void 0 ? declared : 'undeclared'}).`);
            const lockExists = fs.existsSync(path.join(dir, 'composer.lock'));
            let blocked = false;
            let blockReport = '';
            if (lockExists) {
                // Pre-flight: exit 1 means locked packages have a higher PHP
                // floor than the new pin (which composer reads as X.Y.0).
                const preflight = await (0, composer_1.runComposer)(phpBin, dir, ['why-not', 'php', `${targetPhp}.0`, '--locked']);
                blocked = !preflight.ok;
                blockReport = preflight.output;
            }
            markSelfWrite(dir);
            const config = await (0, composer_1.runComposer)(phpBin, dir, ['config', 'platform.php', targetPhp]);
            if (!config.ok) {
                banner(siteId, 'error', 'Composer PHP Sync: could not update composer.json', config.output.slice(0, 500));
                return;
            }
            if (blocked) {
                banner(siteId, 'warning', `composer.json now declares PHP ${targetPhp}, but locked packages require more.`, `Run "composer update" yourself to downgrade them — this may rewrite installed plugins/themes. ${blockReport.slice(0, 600)}`);
                return;
            }
            if (lockExists) {
                markSelfWrite(dir);
                const lock = await (0, composer_1.runComposer)(phpBin, dir, ['update', '--lock', '--no-install', '--no-scripts', '--no-audit']);
                markSelfWrite(dir);
                if (!lock.ok) {
                    banner(siteId, 'warning', `composer.json now declares PHP ${targetPhp}, but the lock refresh failed.`, 'Possibly offline — run "composer update --lock" when online.');
                    return;
                }
            }
            if (fs.existsSync(path.join(dir, 'vendor'))) {
                markSelfWrite(dir);
                await (0, composer_1.runComposer)(phpBin, dir, ['dump-autoload']);
            }
            banner(siteId, 'success', `composer.json now declares PHP ${targetPhp}.`);
            logger.info(`composer.json of ${site.name} synced to PHP ${targetPhp}.`);
        }
        catch (err) {
            logger.error(`Local → Composer sync failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err}`);
            banner(siteId, 'error', 'Composer PHP Sync failed', `${(_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : err}`);
        }
        finally {
            syncing.delete(siteId);
            notifyRenderer(siteId);
        }
    };
    /**
     * Composer → Local, detection half. The actual swap restarts the site, so
     * it is never run unattended: the Overview row offers the one-click apply.
     */
    const evaluateComposerLeads = (siteId) => {
        var _a, _b;
        const site = getSite(siteId);
        if (!site || getMode(site) !== 'composer-leads') {
            return;
        }
        const state = buildState(siteId);
        const localPhp = (0, constants_1.majorMinor)((_b = (_a = site === null || site === void 0 ? void 0 : site.services) === null || _a === void 0 ? void 0 : _a.php) === null || _b === void 0 ? void 0 : _b.version);
        if (state.declared && localPhp && state.declared !== localPhp) {
            banner(siteId, 'warning', `composer.json declares PHP ${state.declared}, but this site runs PHP ${localPhp}.`, 'Open the site\'s Overview tab and use "Composer PHP" to apply it.');
        }
        notifyRenderer(siteId);
    };
    const stopWatcher = (siteId) => {
        var _a;
        (_a = watchers.get(siteId)) === null || _a === void 0 ? void 0 : _a.close();
        watchers.delete(siteId);
        const timer = watchDebounce.get(siteId);
        if (timer) {
            clearTimeout(timer);
            watchDebounce.delete(siteId);
        }
    };
    const startWatcher = (siteId) => {
        var _a;
        stopWatcher(siteId);
        const site = getSite(siteId);
        const composerJsonPath = site && (0, composer_1.findComposerJson)(sitePath(site));
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
                watchDebounce.set(siteId, setTimeout(() => {
                    watchDebounce.delete(siteId);
                    if (isSelfWrite(dir)) {
                        notifyRenderer(siteId);
                        return;
                    }
                    evaluateComposerLeads(siteId);
                }, 750));
            });
            watchers.set(siteId, watcher);
        }
        catch (err) {
            logger.warn(`Could not watch ${dir}: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
        }
    };
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.GET_PHP_STATE, async (siteId) => buildState(siteId));
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.SET_PHP_MODE, async (siteId, mode) => {
        siteData.updateSite(siteId, {
            id: siteId,
            [constants_1.SITE_FLAG_PHP_MODE]: mode,
        });
        logger.info(`PHP version management for site ${siteId} set to "${mode}".`);
        if (mode === 'composer-leads') {
            startWatcher(siteId);
            evaluateComposerLeads(siteId);
        }
        else {
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
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.SITE_SWAPPED, async (siteId) => {
        const site = getSite(siteId);
        if (getMode(site) === 'local-leads') {
            await syncLocalToComposer(siteId);
        }
        else {
            notifyRenderer(siteId);
        }
    });
    // Re-arm watchers for composer-leads sites on app boot.
    for (const site of Object.values(siteData.getSites())) {
        if (getMode(site) === 'composer-leads') {
            startWatcher(site.id);
        }
    }
}
exports.default = registerPhpSync;
//# sourceMappingURL=phpSync.js.map