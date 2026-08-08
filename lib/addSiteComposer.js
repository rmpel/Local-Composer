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
exports.retargetDocumentRoot = exports.fetchText = void 0;
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const path = __importStar(require("path"));
const Local = __importStar(require("@getflywheel/local"));
const LocalMain = __importStar(require("@getflywheel/local/main"));
const constants_1 = require("./constants");
const composer_1 = require("./composer");
const envFix_1 = require("./envFix");
const project_1 = require("./project");
const webroot_1 = require("./webroot");
/**
 * "Add a site" from a remote composer.json template.
 *
 * Local's own flow: create site record → provision services → install
 * WordPress into app/public. Ours: create + provision through Local's
 * AddSiteService with installWP:false, then bootstrap the composer project:
 *
 *   1. fetch the template composer.json (URL or local path) → app/composer.json
 *   2. composer install (Local's bundled phar + the site's own PHP)
 *   3. .env: copy from .env.example if needed; point DB_HOST at Local's
 *      socket; fill DB_NAME/DB_USER/DB_PASSWORD/WP_DOMAIN when the template
 *      carries those keys
 *   4. rewrite the site's web-server conf template so DocumentRoot points at
 *      the composer webroot, then restart (configs recompile on start)
 *   5. wp core install / multisite-install (wp-cli works because the webRoot
 *      patch now resolves the fresh composer layout)
 *   6. multisite: flag the site, enable the template's MULTISITE env switch
 *      (deliberately *after* the install — templates warn against enabling
 *      it earlier), sync network domains into hosts/router
 *
 * Failures after site creation leave the (running) site in place and report
 * a banner with the failing step — the user can finish by hand instead of
 * losing the provisioned site.
 */
const BANNER_ID = 'local-composer-bootstrap';
const COMPOSER_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_REDIRECTS = 5;
const fetchText = (source, redirects = 0) => {
    if (source.startsWith('file://')) {
        return (0, exports.fetchText)(source.slice('file://'.length));
    }
    if (source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(source)) {
        return fs.promises.readFile(source, 'utf8');
    }
    return new Promise((resolve, reject) => {
        if (!/^https?:\/\//.test(source)) {
            reject(new Error(`Unsupported template source: ${source}`));
            return;
        }
        const get = source.startsWith('https://') ? https.get : http.get;
        get(source, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (redirects >= MAX_REDIRECTS) {
                    reject(new Error('Too many redirects fetching the template.'));
                    return;
                }
                resolve((0, exports.fetchText)(new URL(res.headers.location, source).toString(), redirects + 1));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`Fetching the template returned HTTP ${res.statusCode}.`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        }).on('error', reject);
    });
};
exports.fetchText = fetchText;
/**
 * Point the compiled-config templates' DocumentRoot at the composer webroot.
 * Per-site conf templates (conf/{apache,nginx}/site.conf.hbs) contain the
 * default webroot as a literal absolute path and are recompiled on every
 * site start. The boundary guard keeps `…/app/public` from also matching
 * `…/app/public_html`.
 */
const retargetDocumentRoot = (sitePath, webRootDir) => {
    const defaultWebRoot = path.join(sitePath, 'app', 'public');
    const pattern = new RegExp(defaultWebRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])', 'g');
    const touched = [];
    for (const httpd of ['apache', 'nginx']) {
        const confPath = path.join(sitePath, 'conf', httpd, 'site.conf.hbs');
        if (!fs.existsSync(confPath)) {
            continue;
        }
        const contents = fs.readFileSync(confPath, 'utf8');
        const updated = contents.replace(pattern, webRootDir);
        if (updated !== contents) {
            fs.writeFileSync(confPath, updated);
            touched.push(confPath);
        }
    }
    return touched;
};
exports.retargetDocumentRoot = retargetDocumentRoot;
function registerAddSiteComposer(context, logger) {
    const { addSite, siteData, wpCli, siteDatabase, siteProcessManager, router, lightningServices, } = LocalMain.getServiceContainer().cradle;
    const freshSite = (siteId) => new Local.Site(siteData.getSite(siteId));
    const message = (siteId, label) => {
        LocalMain.sendIPCEvent('updateSiteMessage', siteId, label ? { label, stripes: true } : '');
    };
    const banner = (siteId, variant, title, body) => {
        LocalMain.sendIPCEvent('showSiteBanner', {
            siteID: siteId,
            id: BANNER_ID,
            variant,
            title,
            message: body,
        });
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
    const socketFor = (site) => {
        try {
            const dbService = lightningServices.getSiteServiceByRole(new Local.Site(site), Local.SiteServiceRole.DATABASE);
            if (dbService === null || dbService === void 0 ? void 0 : dbService.socket) {
                return dbService.socket;
            }
        }
        catch (err) {
            // fall through to the computed path
        }
        return path.join(context.environment.userDataPath, 'run', site.id, 'mysql', 'mysqld.sock');
    };
    /** Fetch + parse-check the template. Throws with a user-facing message. */
    const validateTemplate = async (templateUrl) => {
        const templateRaw = (await (0, exports.fetchText)(templateUrl)).replace(/^﻿/, '');
        let template;
        try {
            template = JSON.parse(templateRaw);
        }
        catch (err) {
            throw new Error('The template is not valid JSON — check the URL points at a composer.json.');
        }
        if (!template || typeof template !== 'object' || Array.isArray(template)) {
            throw new Error('The template is not a composer.json object.');
        }
        return templateRaw;
    };
    const bootstrap = async ({ newSiteInfo, wpCredentials, templateUrl }, templateRaw) => {
        var _a, _b, _c;
        const site = await addSite.addSite({
            newSiteInfo,
            wpCredentials,
            goToSite: true,
            installWP: false,
        });
        const siteId = site.id;
        const sitePath = LocalMain.formatHomePath(site.path);
        const appDir = path.join(sitePath, 'app');
        try {
            message(siteId, 'Writing composer.json from template');
            await fs.promises.writeFile(path.join(appDir, 'composer.json'), templateRaw);
            // The provisioner pre-created the default (empty) webroot; a stale
            // app/public would fool layout probes and confuse humans.
            try {
                fs.rmdirSync(path.join(appDir, 'public'));
            }
            catch (err) {
                // non-empty or missing — leave it
            }
            (0, project_1.invalidateProject)(sitePath);
            const phpBin = phpBinFor(site);
            if (!phpBin) {
                throw new Error('Could not locate the site\'s PHP binary for composer.');
            }
            message(siteId, 'Running composer install — this can take several minutes');
            const install = await (0, composer_1.runComposer)(phpBin, appDir, ['install'], COMPOSER_INSTALL_TIMEOUT_MS);
            if (!install.ok) {
                throw new Error(`composer install failed:\n${install.output.slice(-600)}`);
            }
            (0, project_1.invalidateProject)(sitePath);
            const project = (0, project_1.getProject)(sitePath);
            if (!(project === null || project === void 0 ? void 0 : project.coreDir) || !project.coreInstalled) {
                throw new Error('composer install finished but no WordPress core dir was found — does the template declare extra["wordpress-install-dir"]?');
            }
            message(siteId, 'Configuring .env');
            (0, envFix_1.ensureEnvFromExample)(project.dir);
            const envPath = (0, envFix_1.findEnvFile)(sitePath);
            if (envPath) {
                (0, envFix_1.setEnvValue)(envPath, 'DB_HOST', `localhost:${socketFor(site)}`, true);
                (0, envFix_1.setEnvValue)(envPath, 'DB_NAME', 'local');
                (0, envFix_1.setEnvValue)(envPath, 'DB_USER', 'root');
                (0, envFix_1.setEnvValue)(envPath, 'DB_PASSWORD', 'root');
                (0, envFix_1.setEnvValue)(envPath, 'WP_DOMAIN', site.domain);
                (0, envFix_1.setEnvValue)(envPath, 'MULTISITE', 'false');
            }
            message(siteId, 'Pointing the web server at the composer webroot');
            const webRootDir = (0, webroot_1.webRootDirOf)(project.dir, project.coreDir);
            (0, exports.retargetDocumentRoot)(sitePath, webRootDir);
            message(siteId, 'Restarting site');
            await siteProcessManager.restart(freshSite(siteId));
            await siteDatabase.waitForDB(freshSite(siteId));
            const multiSite = newSiteInfo.multiSite && newSiteInfo.multiSite !== Local.MultiSite.No
                ? newSiteInfo.multiSite
                : null;
            message(siteId, 'Installing WordPress');
            const installArgs = [
                'core',
                multiSite ? 'multisite-install' : 'install',
                `--url=http://${site.domain}`,
                `--title=${site.name}`,
                `--admin_user=${wpCredentials.adminUsername}`,
                `--admin_password=${wpCredentials.adminPassword}`,
                `--admin_email=${wpCredentials.adminEmail}`,
                '--skip-email',
            ];
            if (multiSite) {
                // Env-driven templates define the multisite constants themselves
                // (MULTISITE switch below); never let wp-cli edit wp-config.php.
                installArgs.push('--skip-config');
                if (multiSite === Local.MultiSite.Subdomain) {
                    installArgs.push('--subdomains');
                }
            }
            await wpCli.run(freshSite(siteId), installArgs);
            if (multiSite) {
                if (envPath) {
                    // Deliberately after the install: templates warn to enable
                    // this only once the network exists.
                    (0, envFix_1.setEnvValue)(envPath, 'MULTISITE', multiSite === Local.MultiSite.Subdomain ? 'domains' : 'true');
                }
                siteData.updateSite(siteId, { id: siteId, multiSite });
                try {
                    const urls = await wpCli.run(freshSite(siteId), ['site', 'list', '--field=url']);
                    siteData.updateSite(siteId, {
                        id: siteId,
                        multiSiteDomains: urls.trim().split('\n'),
                    });
                    await router.restart();
                }
                catch (err) {
                    logger.warn(`Multisite domain sync after bootstrap failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
                }
            }
            message(siteId, '');
            LocalMain.sendIPCEvent('updateSiteStatus', siteId, 'running');
            banner(siteId, 'success', 'Composer site ready.', `Template: ${templateUrl}`);
            logger.info(`Composer bootstrap finished for ${site.name} (${templateUrl}).`);
        }
        catch (err) {
            message(siteId, '');
            LocalMain.sendIPCEvent('updateSiteStatus', siteId, 'running');
            banner(siteId, 'warning', 'Composer bootstrap incomplete.', `${(_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : err} — the site itself was created; you can finish the remaining steps manually.`);
            logger.error(`Composer bootstrap failed: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err}`);
        }
    };
    LocalMain.addIpcAsyncListener(constants_1.IPC_EVENTS.CREATE_COMPOSER_SITE, async (payload) => {
        var _a;
        let templateRaw;
        try {
            // Awaited: a bad template URL fails inline in the wizard, before
            // any site is created.
            templateRaw = await validateTemplate(payload.templateUrl);
        }
        catch (err) {
            return { ok: false, error: `${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}` };
        }
        // The rest is deliberately not awaited: the wizard closes and
        // progress continues on the site screen, like Local's own flow.
        bootstrap(payload, templateRaw).catch((err) => {
            var _a;
            logger.error(`Composer bootstrap failed: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
        });
        return { ok: true };
    });
}
exports.default = registerAddSiteComposer;
//# sourceMappingURL=addSiteComposer.js.map