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
exports.fixEnvDbHost = exports.buildEnvState = exports.readEnvDbHost = exports.findEnvFile = exports.ensureEnvFromExample = exports.setEnvValue = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const project_1 = require("./project");
/**
 * .env DB_HOST fixer.
 *
 * Acato-style composer projects read their database settings from a .env
 * next to composer.json (vlucas/phpdotenv via acato-wp-core). A fresh .env
 * says DB_HOST="localhost", which under Local means "TCP port 3306" — but
 * Local's per-site MySQL listens on a per-site unix socket. WordPress
 * supports the `host:/path/to/socket` syntax in DB_HOST, so pointing it at
 * `localhost:<Local's socket>` makes the site connect without any wp-config
 * gymnastics.
 *
 * The edit is deliberately minimal: only the (uncommented) DB_HOST line is
 * replaced, byte-for-byte everything else; a missing DB_HOST is appended.
 * Values are double-quoted because socket paths contain spaces
 * ("Application Support") and phpdotenv requires quoting for those.
 */
/** Only an uncommented assignment counts; first hit wins. */
const envLine = (key) => new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.*?)[ \\t]*$`, 'm');
const DB_HOST_LINE = envLine('DB_HOST');
const stripQuotes = (value) => {
    var _a, _b;
    const match = /^"(.*)"$|^'(.*)'$/.exec(value);
    if (match) {
        return (_b = (_a = match[1]) !== null && _a !== void 0 ? _a : match[2]) !== null && _b !== void 0 ? _b : '';
    }
    return value;
};
/** Quote for phpdotenv when the value needs it (spaces, quotes, #). */
const envQuote = (value) => /[\s#'"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
/**
 * Replace an uncommented KEY=… line in place. When the key is absent:
 * append it if `appendIfMissing`, otherwise leave the file untouched (used
 * for template-specific keys like WP_DOMAIN/MULTISITE that only make sense
 * when the template's .env already carries them).
 * Returns true when the file was changed.
 */
const setEnvValue = (envPath, key, value, appendIfMissing = false) => {
    const contents = fs.readFileSync(envPath, 'utf8');
    const line = envLine(key);
    const newLine = `${key}=${envQuote(value)}`;
    let updated;
    if (line.test(contents)) {
        updated = contents.replace(line, newLine);
    }
    else if (appendIfMissing) {
        const separator = contents.endsWith('\n') || contents === '' ? '' : '\n';
        updated = `${contents}${separator}${newLine}\n`;
    }
    else {
        return false;
    }
    if (updated !== contents) {
        fs.writeFileSync(envPath, updated);
        return true;
    }
    return false;
};
exports.setEnvValue = setEnvValue;
/**
 * Bootstrap helper: when a template ships .env.example/.env.dist but no
 * .env, copy it so the site has a config to fix up. Returns the .env path
 * or null.
 */
const ensureEnvFromExample = (dir) => {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
        return envPath;
    }
    for (const example of ['.env.example', '.env.dist', '.env.local']) {
        const examplePath = path.join(dir, example);
        if (fs.existsSync(examplePath)) {
            fs.copyFileSync(examplePath, envPath);
            return envPath;
        }
    }
    return null;
};
exports.ensureEnvFromExample = ensureEnvFromExample;
/**
 * Probe order mirrors where the config chains actually load .env from: next
 * to composer.json first, then the app folder, then the webroot.
 */
const findEnvFile = (sitePath) => {
    const candidates = [];
    const project = (0, project_1.getProject)(sitePath);
    if (project) {
        candidates.push(path.join(project.dir, '.env'));
    }
    candidates.push(path.join(sitePath, 'app', '.env'));
    if (project === null || project === void 0 ? void 0 : project.coreDir) {
        candidates.push(path.join(path.dirname(project.coreDir), '.env'));
    }
    for (const candidate of [...new Set(candidates)]) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
};
exports.findEnvFile = findEnvFile;
const readEnvDbHost = (envPath) => {
    try {
        const contents = fs.readFileSync(envPath, 'utf8');
        const match = DB_HOST_LINE.exec(contents);
        return match ? stripQuotes(match[1]) : null;
    }
    catch (err) {
        return null;
    }
};
exports.readEnvDbHost = readEnvDbHost;
const buildEnvState = (sitePath, socketPath) => {
    const envPath = (0, exports.findEnvFile)(sitePath);
    if (!envPath || !socketPath) {
        return null;
    }
    const desiredDbHost = `localhost:${socketPath}`;
    const currentDbHost = (0, exports.readEnvDbHost)(envPath);
    return {
        envPath,
        currentDbHost,
        desiredDbHost,
        matches: currentDbHost === desiredDbHost,
    };
};
exports.buildEnvState = buildEnvState;
/**
 * Rewrite (or append) the DB_HOST line. Throws on I/O failure; the caller
 * turns that into a banner/state for the UI.
 */
const fixEnvDbHost = (envPath, desiredDbHost) => {
    (0, exports.setEnvValue)(envPath, 'DB_HOST', desiredDbHost, true);
};
exports.fixEnvDbHost = fixEnvDbHost;
//# sourceMappingURL=envFix.js.map