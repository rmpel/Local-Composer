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
exports.findPhpBinFallback = exports.runComposer = exports.composerPharPath = exports.readComposerPhp = exports.readComposerJson = exports.findComposerJson = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const constants_1 = require("./constants");
/**
 * All supported layouts, first hit wins: "app folder in git"
 * (app/composer.json, the common case), custom webroots checked in from the
 * app folder (public_html, web), "public folder in git", and the odd legacy
 * wp-content root.
 */
const COMPOSER_JSON_CANDIDATES = [
    'app/composer.json',
    'app/public_html/composer.json',
    'app/web/composer.json',
    'app/public/composer.json',
    'app/public/wp-content/composer.json',
    'composer.json',
];
const findComposerJson = (sitePath) => {
    for (const candidate of COMPOSER_JSON_CANDIDATES) {
        const file = path.join(sitePath, candidate);
        if (fs.existsSync(file)) {
            return file;
        }
    }
    return null;
};
exports.findComposerJson = findComposerJson;
/** Read + parse a composer.json, tolerating a UTF-8 BOM. Null on failure. */
const readComposerJson = (composerJsonPath) => {
    try {
        const raw = fs.readFileSync(composerJsonPath, 'utf8').replace(/^﻿/, '');
        return JSON.parse(raw);
    }
    catch (err) {
        return null;
    }
};
exports.readComposerJson = readComposerJson;
/**
 * config.platform.php is authoritative (it's what composer resolves against);
 * require.php is the fallback, interpreted as its minimum-satisfying
 * major.minor (so "^8.3" and ">=8.3 <8.5" both read as 8.3).
 */
const readComposerPhp = (composerJsonPath) => {
    var _a, _b, _c;
    const json = (0, exports.readComposerJson)(composerJsonPath);
    const platformPhp = (0, constants_1.majorMinor)((_b = (_a = json === null || json === void 0 ? void 0 : json.config) === null || _a === void 0 ? void 0 : _a.platform) === null || _b === void 0 ? void 0 : _b.php);
    if (platformPhp) {
        return { declared: platformPhp, source: 'platform' };
    }
    const requirePhp = (0, constants_1.majorMinor)((_c = json === null || json === void 0 ? void 0 : json.require) === null || _c === void 0 ? void 0 : _c.php);
    if (requirePhp) {
        return { declared: requirePhp, source: 'require' };
    }
    return { declared: null, source: null };
};
exports.readComposerPhp = readComposerPhp;
/**
 * Local ships composer.phar in its extraResources (it's what Local's own site
 * shells put on PATH), so no dependency on a system composer.
 */
const composerPharPath = () => path.join(process.electronPaths.resourcesPath, 'bin', 'composer', 'composer.phar');
exports.composerPharPath = composerPharPath;
/**
 * The phar's shebang is `env php`, so the site's own lightning-service PHP
 * binary is passed explicitly — composer then resolves/validates with the
 * exact PHP the site runs.
 */
const runComposer = (phpBin, cwd, args, timeout = 180000) => new Promise((resolve) => {
    (0, child_process_1.execFile)(phpBin, [(0, exports.composerPharPath)(), '--no-interaction', ...args], {
        cwd,
        env: Object.assign(Object.assign({}, process.env), { COMPOSER_NO_INTERACTION: '1' }),
        timeout,
        maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
        resolve({
            ok: !error,
            code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
            output: `${stdout || ''}${stderr || ''}`.trim(),
        });
    });
});
exports.runComposer = runComposer;
/**
 * Fallback PHP binary lookup for when the lightning-services container lookup
 * fails: scan the services directory for the site's version and take the
 * platform dir's bin/php.
 */
const findPhpBinFallback = (userDataPath, phpVersion) => {
    try {
        const servicesRoot = path.join(userDataPath, 'lightning-services');
        const serviceDir = fs
            .readdirSync(servicesRoot)
            .filter((dir) => dir.startsWith(`php-${phpVersion}`))
            .sort()
            .pop();
        if (!serviceDir) {
            return null;
        }
        const binRoot = path.join(servicesRoot, serviceDir, 'bin');
        for (const platformDir of fs.readdirSync(binRoot)) {
            const phpBin = path.join(binRoot, platformDir, 'bin', process.platform === 'win32' ? 'php.exe' : 'php');
            if (fs.existsSync(phpBin)) {
                return phpBin;
            }
        }
    }
    catch (err) {
        // Services dir unreadable — caller reports the failure.
    }
    return null;
};
exports.findPhpBinFallback = findPhpBinFallback;
//# sourceMappingURL=composer.js.map