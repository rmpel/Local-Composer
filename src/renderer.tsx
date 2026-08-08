import React from 'react';
import { ipcRenderer } from 'electron';
import type { Site } from '@getflywheel/local';
import { ipcAsync } from '@getflywheel/local/renderer';
import ComposerPhpRow from './ComposerPhpRow';
import ComposerProjectRow from './ComposerProjectRow';
import DatabaseTabFix from './DatabaseTabFix';
import EnvFixRow from './EnvFixRow';
import { wrapWordPressStep } from './AddSiteComposerStep';
import { IPC_EVENTS } from './constants';

const STYLE_ID = 'local-composer-styles';

// tsc has no SCSS pipeline, so the few rules matching Local's native row
// styling are injected directly.
const injectStyles = () => {
	if (document.getElementById(STYLE_ID)) {
		return;
	}
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		.LocalComposer_Cell { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
		.LocalComposer_Select { min-width: 250px; }
		.LocalComposer_Indicator { display: inline-flex; align-items: center; gap: 6px; color: #7f8285; white-space: nowrap; }
		.LocalComposer_Indicator--mismatch { color: #d18e22; }
		.LocalComposer_Indicator--active { color: #51bb7b; }
		.LocalComposer_Tooltip { display: inline-flex; align-items: center; }
		.LocalComposer_Tooltip path { fill: #5d5e5e; }
	`;
	document.head.appendChild(style);
};

export default function (context): void {
	const { hooks } = context;

	injectStyles();

	// Local broadcasts service swaps to renderer windows only; forward them to
	// our main-process listener, which owns the Local → Composer PHP sync.
	ipcRenderer.on('siteServiceSwapped', (_event, site: any) => {
		if (site?.id) {
			ipcAsync(IPC_EVENTS.SITE_SWAPPED, site.id);
		}
	});

	// Two extra rows in the site's Overview table, right below Xdebug:
	// the composer-project/webroot indicator and the PHP version sync.
	hooks.addContent('SiteInfoOverview_TableList', (site: Site, siteStatus: string) => (
		<React.Fragment key={`local-composer-${site.id}`}>
			<ComposerProjectRow site={site} siteStatus={siteStatus} />
			<ComposerPhpRow site={site} siteStatus={siteStatus} />
		</React.Fragment>
	));

	// Database tab: patch the native pane's wp-config parsing for composer
	// sites (see DatabaseTabFix for the full story), plus the .env DB_HOST
	// row with its socket-fix button (shown only when a .env exists).
	hooks.addContent('SiteInfoDatabase_TableList', (site: Site) => (
		<React.Fragment key={`local-composer-db-${site.id}`}>
			<DatabaseTabFix site={site} />
			<EnvFixRow site={site} />
		</React.Fragment>
	));

	// "Add a site" wizard: wrap the "Set up WordPress" step with the
	// composer-template option. The wrap is memoized per original component
	// so the wizard keeps a stable component identity across re-renders
	// (the filter runs on every render of the AddSite page).
	const wrappedSteps = new Map<any, any>();
	hooks.addFilter('AddSiteIndexJS:RoutesArray', (routes: any[]) =>
		routes.map((route) => {
			if (route?.key !== 'add-wordpress') {
				return route;
			}
			if (!wrappedSteps.has(route.component)) {
				wrappedSteps.set(route.component, wrapWordPressStep(route.component));
			}
			return { ...route, component: wrappedSteps.get(route.component) };
		}),
	);
}
