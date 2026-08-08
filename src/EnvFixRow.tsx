import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Site } from '@getflywheel/local';
import { ipcAsync } from '@getflywheel/local/renderer';
import {
	TableListRow,
	TextButton,
	Tooltip,
	CircleInfoIcon,
} from '@getflywheel/local-components';
import { EnvState, IPC_EVENTS } from './constants';
import { findDatabaseComponent } from './DatabaseTabFix';

interface Props {
	site: Site;
}

/**
 * ".env DB_HOST" row in the Database tab, shown only when the project has a
 * .env file. A fresh .env says DB_HOST="localhost" (TCP :3306), but Local's
 * per-site MySQL listens on a unix socket — the fix button rewrites the line
 * to WordPress's host:socket syntax (localhost:/…/mysqld.sock). After the
 * fix, the native rows are refreshed through the same patched getDBInfo the
 * Database tab fix installed.
 */
const EnvFixRow = ({ site }: Props) => {
	const [state, setState] = useState<EnvState | null>(null);
	const [fixing, setFixing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const anchorRef = useRef<HTMLSpanElement | null>(null);

	const refresh = useCallback(async () => {
		setState(await ipcAsync(IPC_EVENTS.GET_ENV_STATE, site.id));
	}, [site.id]);

	useEffect(() => {
		setState(null);
		setError(null);
		refresh();
	}, [site.id]);

	const onFix = async () => {
		setFixing(true);
		setError(null);
		try {
			const fresh: EnvState | null = await ipcAsync(IPC_EVENTS.FIX_ENV_DB_HOST, site.id);
			setState(fresh);
			// The config chain now evaluates differently — refresh the native
			// rows above through the (patched) pane component.
			const anchor = anchorRef.current;
			const instance = anchor && findDatabaseComponent(anchor);
			instance?.getDBInfo();
		} catch (err) {
			setError('Could not update the .env — see Local\'s log.');
		} finally {
			setFixing(false);
		}
	};

	if (state === null) {
		// No .env (or still loading): stay invisible, but keep a DOM anchor.
		return <span ref={anchorRef} style={{ display: 'none' }} />;
	}

	const renderContent = () => {
		if (error) {
			return <span className="LocalComposer_Indicator LocalComposer_Indicator--mismatch">{error}</span>;
		}
		if (state.matches) {
			return (
				<span className="LocalComposer_Indicator LocalComposer_Indicator--active">
					{'✓ uses Local\'s MySQL socket'}
					<Tooltip
						content={
							<div>
								{state.envPath}
								<br />
								DB_HOST=&quot;{state.desiredDbHost}&quot;
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
		return (
			<React.Fragment>
				<span className="LocalComposer_Indicator LocalComposer_Indicator--mismatch">
					{state.currentDbHost === null
						? 'DB_HOST not set'
						: `DB_HOST is "${state.currentDbHost}"`}
					<Tooltip
						content={
							<div>
								{state.envPath}
								<br />
								{'Local\'s MySQL listens on a per-site unix socket;'}
								<br />
								{'"localhost" alone means TCP port 3306 and will not connect.'}
							</div>
						}
						showDelay={300}
						className="LocalComposer_Tooltip"
					>
						<CircleInfoIcon />
					</Tooltip>
				</span>
				<TextButton inline disabled={fixing} onClick={onFix}>
					{fixing ? 'Updating…' : 'Point DB_HOST at Local\'s socket'}
				</TextButton>
			</React.Fragment>
		);
	};

	return (
		<TableListRow label=".env DB_HOST" alignMiddle>
			<div className="LocalComposer_Cell">
				<span ref={anchorRef} style={{ display: 'none' }} />
				{renderContent()}
			</div>
		</TableListRow>
	);
};

export default EnvFixRow;
