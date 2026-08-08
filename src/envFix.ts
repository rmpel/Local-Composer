import * as fs from 'fs';
import * as path from 'path';
import { EnvState } from './constants';
import { getProject } from './project';

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
const envLine = (key: string) => new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*(.*?)[ \\t]*$`, 'm');

const DB_HOST_LINE = envLine('DB_HOST');

const stripQuotes = (value: string): string => {
	const match = /^"(.*)"$|^'(.*)'$/.exec(value);
	if (match) {
		return match[1] ?? match[2] ?? '';
	}
	return value;
};

/** Quote for phpdotenv when the value needs it (spaces, quotes, #). */
const envQuote = (value: string): string =>
	/[\s#'"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

/**
 * Replace an uncommented KEY=… line in place. When the key is absent:
 * append it if `appendIfMissing`, otherwise leave the file untouched (used
 * for template-specific keys like WP_DOMAIN/MULTISITE that only make sense
 * when the template's .env already carries them).
 * Returns true when the file was changed.
 */
export const setEnvValue = (
	envPath: string,
	key: string,
	value: string,
	appendIfMissing = false,
): boolean => {
	const contents = fs.readFileSync(envPath, 'utf8');
	const line = envLine(key);
	const newLine = `${key}=${envQuote(value)}`;
	let updated: string;
	if (line.test(contents)) {
		updated = contents.replace(line, newLine);
	} else if (appendIfMissing) {
		const separator = contents.endsWith('\n') || contents === '' ? '' : '\n';
		updated = `${contents}${separator}${newLine}\n`;
	} else {
		return false;
	}
	if (updated !== contents) {
		fs.writeFileSync(envPath, updated);
		return true;
	}
	return false;
};

/**
 * Bootstrap helper: when a template ships .env.example/.env.dist but no
 * .env, copy it so the site has a config to fix up. Returns the .env path
 * or null.
 */
export const ensureEnvFromExample = (dir: string): string | null => {
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

/**
 * Probe order mirrors where the config chains actually load .env from: next
 * to composer.json first, then the app folder, then the webroot.
 */
export const findEnvFile = (sitePath: string): string | null => {
	const candidates: string[] = [];
	const project = getProject(sitePath);
	if (project) {
		candidates.push(path.join(project.dir, '.env'));
	}
	candidates.push(path.join(sitePath, 'app', '.env'));
	if (project?.coreDir) {
		candidates.push(path.join(path.dirname(project.coreDir), '.env'));
	}
	for (const candidate of [...new Set(candidates)]) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
};

export const readEnvDbHost = (envPath: string): string | null => {
	try {
		const contents = fs.readFileSync(envPath, 'utf8');
		const match = DB_HOST_LINE.exec(contents);
		return match ? stripQuotes(match[1]) : null;
	} catch (err) {
		return null;
	}
};

export const buildEnvState = (sitePath: string, socketPath: string | null): EnvState | null => {
	const envPath = findEnvFile(sitePath);
	if (!envPath || !socketPath) {
		return null;
	}
	const desiredDbHost = `localhost:${socketPath}`;
	const currentDbHost = readEnvDbHost(envPath);
	return {
		envPath,
		currentDbHost,
		desiredDbHost,
		matches: currentDbHost === desiredDbHost,
	};
};

/**
 * Rewrite (or append) the DB_HOST line. Throws on I/O failure; the caller
 * turns that into a banner/state for the UI.
 */
export const fixEnvDbHost = (envPath: string, desiredDbHost: string): void => {
	setEnvValue(envPath, 'DB_HOST', desiredDbHost, true);
};
