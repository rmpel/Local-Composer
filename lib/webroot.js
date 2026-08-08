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
exports.buildProjectState = exports.applyConfigTemplatesPatch = exports.applyWpCliCorePathPatch = exports.applySitePathsPatch = exports.resolveComposerPaths = exports.webRootDirOf = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("./constants");
const project_1 = require("./project");
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
const isCoreDir = (dir) => fs.existsSync(path.join(dir, 'wp-includes', 'version.php'));
const flagOf = (site) => {
    const value = site === null || site === void 0 ? void 0 : site[constants_1.SITE_FLAG_CORE_DIR];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'auto';
};
/**
 * public_html/wp → public_html; a core sitting directly in the project dir
 * (core-at-webroot layouts) is its own webroot.
 */
const webRootDirOf = (projectDir, coreDir) => {
    const parent = path.dirname(coreDir);
    return parent === projectDir ? coreDir : parent;
};
exports.webRootDirOf = webRootDirOf;
/**
 * Resolve the composer core dir + webroot for a site, or null to leave
 * Local's defaults untouched. `origPaths` is the object Local's own getter
 * just produced.
 */
const resolveComposerPaths = (site, origPaths) => {
    var _a;
    const flag = flagOf(site);
    if (flag === 'default') {
        return null;
    }
    const siteRoot = path.dirname(origPaths.app);
    if (flag !== 'auto') {
        // Manual escape hatch: a core-dir path relative to app/.
        const coreDir = path.resolve(origPaths.app, flag);
        const project = (0, project_1.getProject)(siteRoot);
        return { coreDir, webRoot: (0, exports.webRootDirOf)((_a = project === null || project === void 0 ? void 0 : project.dir) !== null && _a !== void 0 ? _a : origPaths.app, coreDir) };
    }
    // Auto mode is deliberately conservative: a stock site (app/public is a
    // WordPress install) is never touched.
    if (isCoreDir(origPaths.webRoot)) {
        return null;
    }
    const project = (0, project_1.getProject)(siteRoot);
    if (!(project === null || project === void 0 ? void 0 : project.coreDir)) {
        return null;
    }
    return {
        coreDir: project.coreDir,
        webRoot: (0, exports.webRootDirOf)(project.dir, project.coreDir),
    };
};
exports.resolveComposerPaths = resolveComposerPaths;
/**
 * Redefine the `paths` getter on Site.prototype so webRoot resolves to the
 * composer WEBROOT. Idempotent; returns false (and leaves Local stock) if
 * the model no longer looks patchable.
 */
const applySitePathsPatch = ({ SiteClass, logger }) => {
    const proto = SiteClass === null || SiteClass === void 0 ? void 0 : SiteClass.prototype;
    const PATCH_MARK = '__localComposerWebRootPatch';
    if (!proto) {
        logger.warn('Site class not found — webRoot patch skipped, running indicator-only.');
        return false;
    }
    if (proto[PATCH_MARK]) {
        return true;
    }
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'paths');
    if (!(descriptor === null || descriptor === void 0 ? void 0 : descriptor.get) || descriptor.set) {
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
                const resolved = (0, exports.resolveComposerPaths)(this, paths);
                if (resolved && resolved.webRoot !== paths.webRoot) {
                    return Object.assign(Object.assign({}, paths), { webRoot: resolved.webRoot });
                }
            }
            catch (err) {
                // Any detection hiccup must never break Site.paths itself.
            }
            return paths;
        },
    });
    proto[PATCH_MARK] = true;
    logger.info('Site.paths.webRoot patched: composer-aware webroot resolution active.');
    return true;
};
exports.applySitePathsPatch = applySitePathsPatch;
/**
 * Wrap WpCliService.run so wp-cli receives the CORE dir as its --path.
 * The wrapper passes a shallow site clone whose paths.webRoot is the core
 * dir — run() reads `site.paths` lazily, so nothing else changes. All
 * wp-cli consumers (WordPress version, multisite sync, search-replace,
 * installers, our own wp config list) go through this one method.
 */
const applyWpCliCorePathPatch = ({ wpCli, logger }) => {
    const PATCH_MARK = '__localComposerCorePathPatch';
    if (!wpCli || typeof wpCli.run !== 'function') {
        logger.warn('WpCliService not found — wp-cli core-path patch skipped.');
        return false;
    }
    if (wpCli[PATCH_MARK]) {
        return true;
    }
    const originalRun = wpCli.run.bind(wpCli);
    wpCli.run = (site, args, opts) => {
        try {
            const paths = site === null || site === void 0 ? void 0 : site.paths;
            if (paths === null || paths === void 0 ? void 0 : paths.app) {
                const resolved = (0, exports.resolveComposerPaths)(site, paths);
                if (resolved && resolved.coreDir !== paths.webRoot) {
                    const clone = Object.create(Object.getPrototypeOf(site));
                    Object.assign(clone, site);
                    Object.defineProperty(clone, 'paths', {
                        get: () => (Object.assign(Object.assign({}, paths), { webRoot: resolved.coreDir })),
                    });
                    site = clone;
                }
            }
        }
        catch (err) {
            // Fall through with the original site object.
        }
        return originalRun(site, args, opts);
    };
    wpCli[PATCH_MARK] = true;
    logger.info('WpCliService.run patched: wp-cli now targets the composer core dir.');
    return true;
};
exports.applyWpCliCorePathPatch = applyWpCliCorePathPatch;
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
const applyConfigTemplatesPatch = ({ configTemplates, logger }) => {
    const PATCH_MARK = '__localComposerConfigVarsPatch';
    if (!configTemplates || typeof configTemplates.compileConfigTemplates !== 'function') {
        logger.warn('ConfigTemplatesService not found — config-variables patch skipped.');
        return false;
    }
    if (configTemplates[PATCH_MARK]) {
        return true;
    }
    const original = configTemplates.compileConfigTemplates.bind(configTemplates);
    configTemplates.compileConfigTemplates = (site, templatesDir, destDir, context) => {
        var _a;
        try {
            if (context && typeof context.wpCaBundlePath === 'string' && ((_a = site === null || site === void 0 ? void 0 : site.paths) === null || _a === void 0 ? void 0 : _a.app)) {
                // Reconstruct Local's DEFAULT paths: resolveComposerPaths'
                // conservative guard compares against app/public, and
                // site.paths is already patched to the webroot here.
                const app = site.paths.app;
                const resolved = (0, exports.resolveComposerPaths)(site, { app, webRoot: path.join(app, 'public') });
                if (resolved) {
                    context = Object.assign(Object.assign({}, context), { wpCaBundlePath: path.join(resolved.coreDir, 'wp-includes', 'certificates', 'ca-bundle.crt') });
                }
            }
        }
        catch (err) {
            // Never break config compilation over a detection hiccup.
        }
        return original(site, templatesDir, destDir, context);
    };
    configTemplates[PATCH_MARK] = true;
    logger.info('ConfigTemplatesService patched: wpCaBundlePath resolves to the composer core dir.');
    return true;
};
exports.applyConfigTemplatesPatch = applyConfigTemplatesPatch;
/** State for the Overview row, computed main-side on request. */
const buildProjectState = (site, sitePath) => {
    var _a;
    const flag = flagOf(site);
    const mode = flag === 'auto' || flag === 'default' ? flag : 'manual';
    const empty = {
        found: false,
        composerJsonPath: null,
        coreDirRelative: null,
        webRootRelative: null,
        source: null,
        coreInstalled: false,
        mode,
        active: false,
    };
    const project = (0, project_1.getProject)(sitePath);
    if (!project) {
        return empty;
    }
    const appDir = path.join(sitePath, 'app');
    const origPaths = { app: appDir, webRoot: path.join(appDir, 'public') };
    const resolved = (0, exports.resolveComposerPaths)(site, origPaths);
    const coreDir = mode === 'manual' ? (_a = resolved === null || resolved === void 0 ? void 0 : resolved.coreDir) !== null && _a !== void 0 ? _a : null : project.coreDir;
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
exports.buildProjectState = buildProjectState;
//# sourceMappingURL=webroot.js.map