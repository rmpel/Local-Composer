import React, { useEffect, useRef, useState } from 'react';
import type { Site } from '@getflywheel/local';
import { ipcAsync } from '@getflywheel/local/renderer';
import { TableListRow } from '@getflywheel/local-components';
import { DbConfig, IPC_EVENTS } from './constants';

/**
 * Fix Local's Database tab for composer sites.
 *
 * The native tab (SiteInfoDatabase, compiled into Local's webpack bundle)
 * reads app/public/wp-config.php as *text* and regex-parses literal
 * `'DB_NAME', 'value'` pairs. On composer sites that fails twice: the path is
 * wrong, and the real wp-config.php often defines nothing statically (DB
 * constants come from a core package / env files at runtime). So the values
 * must come from evaluating the config — which the main process does via
 * `wp config list` (IPC GET_DB_CONFIG).
 *
 * Getting those values into the native rows: the component's module lives
 * inside the webpack bundle, so it can't be require()d and patched directly.
 * Instead, this hook component renders inside the same pane (the
 * SiteInfoDatabase_TableList content hook), climbs from its own DOM node up
 * the React fiber tree to the mounted SiteInfoDatabase instance — method
 * names like getFromWPConfig survive minification — and patches getDBInfo on
 * its constructor's prototype, then re-runs it. The patched method serves
 * wp-cli-derived values for composer sites and defers to the original for
 * everything else, so stock sites keep the fast native path.
 *
 * If Local's internals ever change and the fiber walk fails, the component
 * falls back to appending corrected read-only rows to the table instead.
 */

const PATCH_MARK = '__localComposerDbPatch';

/** Mirrors the display logic of the native getDBInfo host handling. */
const displayHost = (rawHost: string | null): string | null => {
	if (rawHost && rawHost !== 'localhost') {
		return rawHost.split(':')[0];
	}
	return rawHost;
};

const patchedGetDBInfo = (original: (...args: any[]) => Promise<void>) =>
	async function (this: any): Promise<void> {
		try {
			const { siteID } = this.props.match.params;
			const site = this.props.sites[siteID];
			const config: DbConfig | null = await ipcAsync(IPC_EVENTS.GET_DB_CONFIG, siteID);
			if (!config) {
				return original.call(this);
			}
			// 'db' === Local.SiteServiceRole.DATABASE; string literal keeps this
			// module free of runtime @getflywheel/local imports (same pattern as
			// ComposerPhpRow's 'php').
			const dbService = await ipcAsync('lightningServices:getSiteServiceByRole', site, 'db');
			this.setState({
				dbName: config.DB_NAME,
				dbUser: config.DB_USER,
				dbPassword: config.DB_PASSWORD,
				dbHost: displayHost(config.DB_HOST),
				dbPort: dbService?.port,
				dbSocket: dbService?.socket,
			});
		} catch (err) {
			return original.call(this);
		}
	};

/**
 * From any DOM node rendered by React, find the enclosing class-component
 * instance that looks like SiteInfoDatabase. Handles both fiber key styles
 * (__reactFiber$… for React 17+, __reactInternalInstance$… for 16).
 */
export const findDatabaseComponent = (node: Element): any | null => {
	const fiberKey = Object.keys(node).find(
		(key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'),
	);
	if (!fiberKey) {
		return null;
	}
	let fiber = (node as any)[fiberKey];
	while (fiber) {
		const instance = fiber.stateNode;
		if (
			instance &&
			typeof instance.getDBInfo === 'function' &&
			typeof instance.getFromWPConfig === 'function'
		) {
			return instance;
		}
		fiber = fiber.return;
	}
	return null;
};

interface Props {
	site: Site;
}

type Mode = 'pending' | 'patched' | 'fallback' | 'inactive';

const DatabaseTabFix = ({ site }: Props) => {
	const [mode, setMode] = useState<Mode>('pending');
	const [config, setConfig] = useState<DbConfig | null>(null);
	const anchorRef = useRef<HTMLSpanElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		setMode('pending');
		setConfig(null);
		(async () => {
			const fresh: DbConfig | null = await ipcAsync(IPC_EVENTS.GET_DB_CONFIG, site.id);
			if (cancelled) {
				return;
			}
			if (!fresh) {
				// Not a composer site (or wp-cli failed): stay out of the way.
				setMode('inactive');
				return;
			}
			setConfig(fresh);
			const anchor = anchorRef.current;
			const instance = anchor && findDatabaseComponent(anchor);
			if (instance) {
				const proto = instance.constructor?.prototype;
				if (proto && !proto[PATCH_MARK]) {
					proto[PATCH_MARK] = true;
					proto.getDBInfo = patchedGetDBInfo(proto.getDBInfo);
				}
				// Re-run with the patched method: the native rows update in
				// place (the mount-time run already raced ahead with the
				// broken file parse).
				instance.getDBInfo();
				setMode('patched');
			} else {
				setMode('fallback');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [site.id]);

	if (mode === 'inactive') {
		return null;
	}

	if (mode === 'fallback' && config) {
		// Fiber walk failed (Local internals changed?) — at least present the
		// correct values as extra rows instead of silently showing nothing.
		return (
			<React.Fragment>
				<TableListRow label="Host (composer)" selectable>
					{displayHost(config.DB_HOST) ?? '—'}
				</TableListRow>
				<TableListRow label="Database name (composer)" selectable>
					{config.DB_NAME ?? '—'}
				</TableListRow>
				<TableListRow label="Username (composer)" selectable>
					{config.DB_USER ?? '—'}
				</TableListRow>
				<TableListRow label="Password (composer)" selectable>
					{config.DB_PASSWORD ?? '—'}
				</TableListRow>
			</React.Fragment>
		);
	}

	// Invisible anchor: gives the fiber walk a DOM node inside the pane.
	return <span ref={anchorRef} style={{ display: 'none' }} />;
};

export default DatabaseTabFix;
