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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const Local = __importStar(require("@getflywheel/local"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const constants_1 = require("./constants");
const webroot_1 = require("./webroot");
const project_1 = require("./project");
const envFix_1 = require("./envFix");
const addSiteComposer_1 = __importDefault(require("./addSiteComposer"));
const phpSync_1 = __importDefault(require("./phpSync"));
function default_1(context) {
    const { siteData, localLogger, wpCli, lightningServices, configTemplates } = LocalMain.getServiceContainer().cradle;
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
    (0, webroot_1.applySitePathsPatch)({ SiteClass: Local.Site, logger });
    (0, webroot_1.applyWpCliCorePathPatch)({ wpCli, logger });
    (0, webroot_1.applyConfigTemplatesPatch)({ configTemplates, logger });
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.GET_PROJECT_STATE, async (siteId) => {
        const site = siteData.getSite(siteId);
        if (!site) {
            return null;
        }
        return (0, webroot_1.buildProjectState)(site, LocalMain.formatHomePath(site.path));
    });
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.SET_WEBROOT_MODE, async (siteId, mode) => {
        const site = siteData.getSite(siteId);
        if (!site) {
            return null;
        }
        siteData.updateSite(siteId, {
            id: siteId,
            [constants_1.SITE_FLAG_CORE_DIR]: mode,
        });
        (0, project_1.invalidateProject)(LocalMain.formatHomePath(site.path));
        logger.info(`Webroot handling for site ${siteId} set to "${mode}".`);
        const fresh = siteData.getSite(siteId);
        return (0, webroot_1.buildProjectState)(fresh, LocalMain.formatHomePath(fresh.path));
    });
    /**
     * Part 2 — effective DB constants for the Database tab. Local's own tab
     * regex-parses app/public/wp-config.php as text, which fails twice on
     * composer sites: wrong path, and configs that define nothing statically
     * (constants come from a core package / env files). `wp config list`
     * evaluates the real wp-config.php chain without loading WordPress or
     * touching the database, so it works on stopped sites too.
     */
    const dbConfigCache = new Map();
    const DB_CONFIG_TTL_MS = 15000;
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.GET_DB_CONFIG, async (siteId) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const site = siteData.getSite(siteId);
        if (!site) {
            return null;
        }
        const sitePath = LocalMain.formatHomePath(site.path);
        // Only composer sites take the wp-cli route; stock sites return null so
        // the Database tab keeps its fast native file-parse path.
        if (!((_a = (0, project_1.getProject)(sitePath)) === null || _a === void 0 ? void 0 : _a.coreDir)) {
            return null;
        }
        const cached = dbConfigCache.get(siteId);
        if (cached && Date.now() - cached.at < DB_CONFIG_TTL_MS) {
            return cached.config;
        }
        let config = null;
        try {
            const output = await wpCli.run(new Local.Site(site), ['config', 'list', '--format=json']);
            const json = output.slice(output.indexOf('['), output.lastIndexOf(']') + 1);
            const entries = JSON.parse(json);
            const map = {};
            for (const entry of entries) {
                map[entry.name] = entry.value;
            }
            config = {
                DB_HOST: (_b = map.DB_HOST) !== null && _b !== void 0 ? _b : null,
                DB_NAME: (_c = map.DB_NAME) !== null && _c !== void 0 ? _c : null,
                DB_USER: (_d = map.DB_USER) !== null && _d !== void 0 ? _d : null,
                DB_PASSWORD: (_e = map.DB_PASSWORD) !== null && _e !== void 0 ? _e : null,
                table_prefix: (_f = map.table_prefix) !== null && _f !== void 0 ? _f : null,
            };
        }
        catch (err) {
            // e.g. the config chain needs a running database, or wp-cli failed —
            // the renderer falls back to Local's native behavior.
            logger.warn(`wp config list failed for site ${siteId}: ${(_g = err === null || err === void 0 ? void 0 : err.message) !== null && _g !== void 0 ? _g : err}`);
        }
        dbConfigCache.set(siteId, { at: Date.now(), config });
        return config;
    });
    /**
     * Part 3 — .env DB_HOST fixer. Points the project's .env DB_HOST at
     * Local's per-site MySQL socket (localhost:<socket>), so env-driven
     * config chains connect without a hand-edited wp-config-local.php.
     */
    const socketFor = (site) => {
        var _a;
        try {
            const dbService = lightningServices.getSiteServiceByRole(new Local.Site(site), Local.SiteServiceRole.DATABASE);
            if (dbService === null || dbService === void 0 ? void 0 : dbService.socket) {
                return dbService.socket;
            }
        }
        catch (err) {
            logger.warn(`Falling back to computed socket path: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
        }
        return path.join(context.environment.userDataPath, 'run', site.id, 'mysql', 'mysqld.sock');
    };
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.GET_ENV_STATE, async (siteId) => {
        const site = siteData.getSite(siteId);
        if (!site) {
            return null;
        }
        return (0, envFix_1.buildEnvState)(LocalMain.formatHomePath(site.path), socketFor(site));
    });
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.FIX_ENV_DB_HOST, async (siteId) => {
        const site = siteData.getSite(siteId);
        if (!site) {
            return null;
        }
        const sitePath = LocalMain.formatHomePath(site.path);
        const state = (0, envFix_1.buildEnvState)(sitePath, socketFor(site));
        if (!state) {
            return null;
        }
        if (!state.matches) {
            (0, envFix_1.fixEnvDbHost)(state.envPath, state.desiredDbHost);
            logger.info(`Set DB_HOST in ${state.envPath} to "${state.desiredDbHost}".`);
            // The Database tab's values come from evaluating the config chain,
            // which just changed.
            dbConfigCache.delete(siteId);
        }
        return (0, envFix_1.buildEnvState)(sitePath, socketFor(site));
    });
    /**
     * Part 4 — "Add a site" from a remote composer.json template.
     */
    (0, addSiteComposer_1.default)(context, logger);
    /**
     * Part 5 — PHP version sync (the former "Composer PHP Sync" add-on,
     * local-composer-php, now integrated).
     */
    (0, phpSync_1.default)(context, logger);
}
exports.default = default_1;
//# sourceMappingURL=main.js.map