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
exports.invalidateProject = exports.getProject = exports.detectProject = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const composer_1 = require("./composer");
const isCoreDir = (dir) => fs.existsSync(path.join(dir, 'wp-includes', 'version.php'));
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
const detectProject = (sitePath) => {
    var _a, _b;
    const composerJsonPath = (0, composer_1.findComposerJson)(sitePath);
    if (!composerJsonPath) {
        return null;
    }
    const dir = path.dirname(composerJsonPath);
    const project = {
        composerJsonPath,
        dir,
        coreDir: null,
        source: null,
        coreInstalled: false,
    };
    const declared = (_b = (_a = (0, composer_1.readComposerJson)(composerJsonPath)) === null || _a === void 0 ? void 0 : _a.extra) === null || _b === void 0 ? void 0 : _b['wordpress-install-dir'];
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
exports.detectProject = detectProject;
/**
 * Site.paths is a getter that many services hit on hot paths (every wp-cli
 * call, config compile, shell open), and detection does synchronous fs probes
 * plus a JSON parse — so results are cached briefly per site path.
 */
const CACHE_TTL_MS = 5000;
const cache = new Map();
const getProject = (sitePath) => {
    const hit = cache.get(sitePath);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return hit.project;
    }
    const project = (0, exports.detectProject)(sitePath);
    cache.set(sitePath, { at: Date.now(), project });
    return project;
};
exports.getProject = getProject;
const invalidateProject = (sitePath) => {
    if (sitePath) {
        cache.delete(sitePath);
    }
    else {
        cache.clear();
    }
};
exports.invalidateProject = invalidateProject;
//# sourceMappingURL=project.js.map