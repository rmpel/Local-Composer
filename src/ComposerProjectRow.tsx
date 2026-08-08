import React, { useCallback, useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';
import type { Site } from '@getflywheel/local';
import { ipcAsync } from '@getflywheel/local/renderer';
import {
	TableListRow,
	FlySelect,
	Tooltip,
	CircleInfoIcon,
} from '@getflywheel/local-components';
import {
	ComposerProjectState,
	IPC_EVENTS,
	WEBROOT_MODE_LABELS,
	WebRootMode,
} from './constants';

interface Props {
	site: Site;
	siteStatus: string;
}

/**
 * "Composer project" Overview row: shows the detected WordPress core dir the
 * add-on steers Local's wp-cli/webRoot to, with an auto/off switch. Manual
 * per-site paths (any other value of the composerCoreDir flag in sites.json)
 * are displayed but not editable here.
 */
const ComposerProjectRow = ({ site }: Props) => {
	const [state, setState] = useState<ComposerProjectState | null>(null);

	const refresh = useCallback(async () => {
		const fresh = await ipcAsync(IPC_EVENTS.GET_PROJECT_STATE, site.id);
		setState(fresh);
	}, [site.id]);

	useEffect(() => {
		setState(null);
		refresh();
	}, [site.id]);

	useEffect(() => {
		const onChanged = (_event: unknown, siteId: string) => {
			if (siteId === site.id) {
				refresh();
			}
		};
		ipcRenderer.on(IPC_EVENTS.PROJECT_STATE_CHANGED, onChanged);
		return () => {
			ipcRenderer.removeListener(IPC_EVENTS.PROJECT_STATE_CHANGED, onChanged);
		};
	}, [site.id, refresh]);

	const onModeChange = async (mode: WebRootMode) => {
		if (!state || mode === state.mode) {
			return;
		}
		setState({ ...state, mode });
		const fresh = await ipcAsync(IPC_EVENTS.SET_WEBROOT_MODE, site.id, mode);
		setState(fresh);
	};

	if (state === null || !state.found) {
		// Non-composer sites keep a clean Overview: no row at all.
		return null;
	}

	const sourceLabel =
		state.source === 'wordpress-install-dir'
			? 'declared by extra["wordpress-install-dir"] in composer.json'
			: state.source === 'probe'
				? 'found by probing common composer layouts'
				: state.source === 'manual'
					? 'set manually via the composerCoreDir site flag'
					: null;

	const renderStatus = () => {
		if (state.mode === 'default') {
			return <span className="LocalComposer_Indicator">Using Local's default (app/public)</span>;
		}
		if (!state.coreDirRelative) {
			return (
				<span className="LocalComposer_Indicator LocalComposer_Indicator--mismatch">
					WordPress core not found
					<Tooltip
						content={
							<div>
								composer.json found, but no WordPress core dir could be
								<br />
								determined. Declare extra[&quot;wordpress-install-dir&quot;]
								<br />
								or run composer install.
							</div>
						}
						showDelay={300}
						className="LocalComposer_Tooltip"
					>
						<CircleInfoIcon />
					</Tooltip>
				</span>
			);
		}
		const className = state.active
			? 'LocalComposer_Indicator LocalComposer_Indicator--active'
			: 'LocalComposer_Indicator';
		return (
			<span className={className}>
				{state.webRootRelative && state.webRootRelative !== state.coreDirRelative
					? `Webroot: ${state.webRootRelative} · Core: ${state.coreDirRelative}`
					: `Core: ${state.coreDirRelative}`}
				{state.active ? ' ✓' : ''}
				{!state.coreInstalled ? ' (not installed yet)' : ''}
				<Tooltip
					content={
						<div>
							{sourceLabel}
							<br />
							{state.active
								? 'Web server & shell use the webroot; wp-cli (WordPress version, multisite sync) targets the core dir.'
								: 'Local\'s default webroot is a WordPress install, so nothing is overridden.'}
						</div>
					}
					showDelay={300}
					className="LocalComposer_Tooltip"
				>
					<CircleInfoIcon />
				</Tooltip>
			</span>
		);
	};

	return (
		<TableListRow label="Composer project" alignMiddle>
			<div className="LocalComposer_Cell">
				<FlySelect
					className="LocalComposer_Select"
					options={WEBROOT_MODE_LABELS}
					value={state.mode === 'manual' ? 'auto' : state.mode}
					disabled={state.mode === 'manual'}
					onChange={onModeChange}
				/>
				{renderStatus()}
			</div>
		</TableListRow>
	);
};

export default ComposerProjectRow;
