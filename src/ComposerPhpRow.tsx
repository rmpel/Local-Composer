import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ipcRenderer } from 'electron';
import type { Site } from '@getflywheel/local';
import { ipcAsync } from '@getflywheel/local/renderer';
import {
	TableListRow,
	FlySelect,
	TextButton,
	Tooltip,
	CircleInfoIcon,
} from '@getflywheel/local-components';
import {
	ComposerPhpMode,
	ComposerPhpState,
	IPC_EVENTS,
	PHP_MODE_LABELS,
	majorMinor,
} from './constants';

interface Props {
	site: Site;
	siteStatus: string;
}

const compareVersions = (a: string, b: string): number => {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] || 0) - (pb[i] || 0);
		if (diff) {
			return diff;
		}
	}
	return 0;
};

const ComposerPhpRow = ({ site }: Props) => {
	const [state, setState] = useState<ComposerPhpState | null>(null);
	const [applyArmed, setApplyArmed] = useState(false);
	const [applying, setApplying] = useState(false);
	const [applyError, setApplyError] = useState<string | null>(null);
	const armTimer = useRef<any>(null);

	const localPhp = majorMinor((site as any)?.services?.php?.version);

	const refresh = useCallback(async () => {
		const fresh = await ipcAsync(IPC_EVENTS.GET_PHP_STATE, site.id);
		setState(fresh);
	}, [site.id]);

	useEffect(() => {
		setState(null);
		setApplyArmed(false);
		setApplyError(null);
		refresh();
	}, [site.id]);

	useEffect(() => {
		const onStateChanged = (_event: unknown, siteId: string) => {
			if (siteId === site.id) {
				refresh();
			}
		};
		const onSwapped = (_event: unknown, swappedSite: any) => {
			if (swappedSite?.id === site.id) {
				refresh();
			}
		};
		ipcRenderer.on(IPC_EVENTS.PHP_STATE_CHANGED, onStateChanged);
		ipcRenderer.on('siteServiceSwapped', onSwapped);
		return () => {
			ipcRenderer.removeListener(IPC_EVENTS.PHP_STATE_CHANGED, onStateChanged);
			ipcRenderer.removeListener('siteServiceSwapped', onSwapped);
		};
	}, [site.id, refresh]);

	const onModeChange = async (mode: ComposerPhpMode) => {
		if (!state || mode === state.mode) {
			return;
		}
		setState({ ...state, mode });
		const fresh = await ipcAsync(IPC_EVENTS.SET_PHP_MODE, site.id, mode);
		setState(fresh);
	};

	/**
	 * Composer → Local. The swap restarts the site, so the button arms first
	 * and a second click confirms — same information Local's own dropdown
	 * confirm dialog conveys.
	 */
	const onApply = async () => {
		if (!state?.declared) {
			return;
		}
		if (!applyArmed) {
			setApplyArmed(true);
			clearTimeout(armTimer.current);
			armTimer.current = setTimeout(() => setApplyArmed(false), 6000);
			return;
		}
		clearTimeout(armTimer.current);
		setApplyArmed(false);
		setApplying(true);
		setApplyError(null);
		try {
			const available = await ipcAsync('lightningServices:getServices', 'php');
			const candidates = Object.values(available?.php || {}).filter((service: any) =>
				service.binVersion.startsWith(`${state.declared}.`),
			) as any[];
			candidates.sort(
				(a, b) =>
					Number(Boolean(b.registered)) - Number(Boolean(a.registered)) ||
					compareVersions(b.binVersion, a.binVersion),
			);
			const target = candidates[0];
			if (!target) {
				setApplyError(`Local offers no PHP ${state.declared}.x`);
				return;
			}
			await ipcAsync('SiteProvisionerService:swapService', site, 'php', 'php', target.binVersion);
		} catch (err) {
			setApplyError('Switching failed — see Local\'s log.');
		} finally {
			setApplying(false);
			refresh();
		}
	};

	const mismatch = Boolean(state?.found && state.declared && localPhp && state.declared !== localPhp);

	const renderIndicator = () => {
		if (!state?.found) {
			return (
				<span className="LocalComposer_Indicator">
					No composer.json
					<Tooltip
						content={<div>Looked in app/, app/public_html/, app/web/,<br />app/public/ and app/public/wp-content/.</div>}
						showDelay={300}
						className="LocalComposer_Tooltip"
					>
						<CircleInfoIcon />
					</Tooltip>
				</span>
			);
		}
		const className = mismatch
			? 'LocalComposer_Indicator LocalComposer_Indicator--mismatch'
			: 'LocalComposer_Indicator';
		return (
			<span className={className}>
				{`Composer: ${state.declared ?? '—'}`}
				{mismatch ? ` (Local: ${localPhp})` : state.declared ? ' ✓' : ''}
				<Tooltip
					content={
						<div>
							{state.declared
								? `Declared via ${state.source === 'platform' ? 'config.platform.php' : 'require.php'} in`
								: 'No PHP version declared in'}
							<br />
							{state.composerJsonPath}
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

	const renderAction = () => {
		if (state?.syncing) {
			return <span className="LocalComposer_Indicator">Updating composer.json…</span>;
		}
		if (applyError) {
			return <span className="LocalComposer_Indicator LocalComposer_Indicator--mismatch">{applyError}</span>;
		}
		if (state?.mode === 'composer-leads' && mismatch && state.declared) {
			return (
				<TextButton inline disabled={applying} onClick={onApply}>
					{applying
						? 'Switching…'
						: applyArmed
							? `Click again to confirm — site will restart`
							: `Switch Local to PHP ${state.declared}`}
				</TextButton>
			);
		}
		return null;
	};

	return (
		<TableListRow label="Composer PHP" alignMiddle>
			<div className="LocalComposer_Cell">
				<FlySelect
					className="LocalComposer_Select"
					options={PHP_MODE_LABELS}
					value={state?.mode ?? 'separate'}
					disabled={!state || !state.found || applying || Boolean(state?.syncing)}
					onChange={onModeChange}
				/>
				{state !== null && renderIndicator()}
				{renderAction()}
			</div>
		</TableListRow>
	);
};

export default ComposerPhpRow;
