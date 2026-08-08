"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const electron_1 = require("electron");
const renderer_1 = require("@getflywheel/local/renderer");
const ComposerPhpRow_1 = __importDefault(require("./ComposerPhpRow"));
const ComposerProjectRow_1 = __importDefault(require("./ComposerProjectRow"));
const DatabaseTabFix_1 = __importDefault(require("./DatabaseTabFix"));
const EnvFixRow_1 = __importDefault(require("./EnvFixRow"));
const AddSiteComposerStep_1 = require("./AddSiteComposerStep");
const constants_1 = require("./constants");
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
function default_1(context) {
    const { hooks } = context;
    injectStyles();
    // Local broadcasts service swaps to renderer windows only; forward them to
    // our main-process listener, which owns the Local → Composer PHP sync.
    electron_1.ipcRenderer.on('siteServiceSwapped', (_event, site) => {
        if (site === null || site === void 0 ? void 0 : site.id) {
            (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.SITE_SWAPPED, site.id);
        }
    });
    // Two extra rows in the site's Overview table, right below Xdebug:
    // the composer-project/webroot indicator and the PHP version sync.
    hooks.addContent('SiteInfoOverview_TableList', (site, siteStatus) => (react_1.default.createElement(react_1.default.Fragment, { key: `local-composer-${site.id}` },
        react_1.default.createElement(ComposerProjectRow_1.default, { site: site, siteStatus: siteStatus }),
        react_1.default.createElement(ComposerPhpRow_1.default, { site: site, siteStatus: siteStatus }))));
    // Database tab: patch the native pane's wp-config parsing for composer
    // sites (see DatabaseTabFix for the full story), plus the .env DB_HOST
    // row with its socket-fix button (shown only when a .env exists).
    hooks.addContent('SiteInfoDatabase_TableList', (site) => (react_1.default.createElement(react_1.default.Fragment, { key: `local-composer-db-${site.id}` },
        react_1.default.createElement(DatabaseTabFix_1.default, { site: site }),
        react_1.default.createElement(EnvFixRow_1.default, { site: site }))));
    // "Add a site" wizard: wrap the "Set up WordPress" step with the
    // composer-template option. The wrap is memoized per original component
    // so the wizard keeps a stable component identity across re-renders
    // (the filter runs on every render of the AddSite page).
    const wrappedSteps = new Map();
    hooks.addFilter('AddSiteIndexJS:RoutesArray', (routes) => routes.map((route) => {
        if ((route === null || route === void 0 ? void 0 : route.key) !== 'add-wordpress') {
            return route;
        }
        if (!wrappedSteps.has(route.component)) {
            wrappedSteps.set(route.component, (0, AddSiteComposerStep_1.wrapWordPressStep)(route.component));
        }
        return Object.assign(Object.assign({}, route), { component: wrappedSteps.get(route.component) });
    }));
}
exports.default = default_1;
//# sourceMappingURL=renderer.js.map