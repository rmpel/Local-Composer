import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { majorMinor } from './constants';

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

export const findComposerJson = (sitePath: string): string | null => {
	for (const candidate of COMPOSER_JSON_CANDIDATES) {
		const file = path.join(sitePath, candidate);
		if (fs.existsSync(file)) {
			return file;
		}
	}
	return null;
};

/** Read + parse a composer.json, tolerating a UTF-8 BOM. Null on failure. */
export const readComposerJson = (composerJsonPath: string): any | null => {
	try {
		const raw = fs.readFileSync(composerJsonPath, 'utf8').replace(/^﻿/, '');
		return JSON.parse(raw);
	} catch (err) {
		return null;
	}
};

/**
 * config.platform.php is authoritative (it's what composer resolves against);
 * require.php is the fallback, interpreted as its minimum-satisfying
 * major.minor (so "^8.3" and ">=8.3 <8.5" both read as 8.3).
 */
export const readComposerPhp = (
	composerJsonPath: string,
): { declared: string | null; source: 'platform' | 'require' | null } => {
	const json = readComposerJson(composerJsonPath);
	const platformPhp = majorMinor(json?.config?.platform?.php);
	if (platformPhp) {
		return { declared: platformPhp, source: 'platform' };
	}
	const requirePhp = majorMinor(json?.require?.php);
	if (requirePhp) {
		return { declared: requirePhp, source: 'require' };
	}
	return { declared: null, source: null };
};

/**
 * Local ships composer.phar in its extraResources (it's what Local's own site
 * shells put on PATH), so no dependency on a system composer.
 */
export const composerPharPath = (): string =>
	path.join((process as any).electronPaths.resourcesPath, 'bin', 'composer', 'composer.phar');

export interface ComposerResult {
	ok: boolean;
	code: number;
	output: string;
}

/**
 * The phar's shebang is `env php`, so the site's own lightning-service PHP
 * binary is passed explicitly — composer then resolves/validates with the
 * exact PHP the site runs.
 */
export const runComposer = (
	phpBin: string,
	cwd: string,
	args: string[],
	timeout = 180000,
): Promise<ComposerResult> =>
	new Promise((resolve) => {
		execFile(
			phpBin,
			[composerPharPath(), '--no-interaction', ...args],
			{
				cwd,
				env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
				timeout,
				maxBuffer: 16 * 1024 * 1024,
			},
			(error: any, stdout, stderr) => {
				resolve({
					ok: !error,
					code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
					output: `${stdout || ''}${stderr || ''}`.trim(),
				});
			},
		);
	});

/**
 * Fallback PHP binary lookup for when the lightning-services container lookup
 * fails: scan the services directory for the site's version and take the
 * platform dir's bin/php.
 */
export const findPhpBinFallback = (userDataPath: string, phpVersion: string): string | null => {
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
	} catch (err) {
		// Services dir unreadable — caller reports the failure.
	}
	return null;
};
