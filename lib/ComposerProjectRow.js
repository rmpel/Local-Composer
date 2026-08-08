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
const react_1 = __importStar(require("react"));
const electron_1 = require("electron");
const renderer_1 = require("@getflywheel/local/renderer");
const local_components_1 = require("@getflywheel/local-components");
const constants_1 = require("./constants");
/**
 * "Composer project" Overview row: shows the detected WordPress core dir the
 * add-on steers Local's wp-cli/webRoot to, with an auto/off switch. Manual
 * per-site paths (any other value of the composerCoreDir flag in sites.json)
 * are displayed but not editable here.
 */
const ComposerProjectRow = ({ site }) => {
    const [state, setState] = (0, react_1.useState)(null);
    const refresh = (0, react_1.useCallback)(async () => {
        const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.GET_PROJECT_STATE, site.id);
        setState(fresh);
    }, [site.id]);
    (0, react_1.useEffect)(() => {
        setState(null);
        refresh();
    }, [site.id]);
    (0, react_1.useEffect)(() => {
        const onChanged = (_event, siteId) => {
            if (siteId === site.id) {
                refresh();
            }
        };
        electron_1.ipcRenderer.on(constants_1.IPC_EVENTS.PROJECT_STATE_CHANGED, onChanged);
        return () => {
            electron_1.ipcRenderer.removeListener(constants_1.IPC_EVENTS.PROJECT_STATE_CHANGED, onChanged);
        };
    }, [site.id, refresh]);
    const onModeChange = async (mode) => {
        if (!state || mode === state.mode) {
            return;
        }
        setState(Object.assign(Object.assign({}, state), { mode }));
        const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.SET_WEBROOT_MODE, site.id, mode);
        setState(fresh);
    };
    if (state === null || !state.found) {
        // Non-composer sites keep a clean Overview: no row at all.
        return null;
    }
    const sourceLabel = state.source === 'wordpress-install-dir'
        ? 'declared by extra["wordpress-install-dir"] in composer.json'
        : state.source === 'probe'
            ? 'found by probing common composer layouts'
            : state.source === 'manual'
                ? 'set manually via the composerCoreDir site flag'
                : null;
    const renderStatus = () => {
        if (state.mode === 'default') {
            return react_1.default.createElement("span", { className: "LocalComposer_Indicator" }, "Using Local's default (app/public)");
        }
        if (!state.coreDirRelative) {
            return (react_1.default.createElement("span", { className: "LocalComposer_Indicator LocalComposer_Indicator--mismatch" },
                "WordPress core not found",
                react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                        "composer.json found, but no WordPress core dir could be",
                        react_1.default.createElement("br", null),
                        "determined. Declare extra[\"wordpress-install-dir\"]",
                        react_1.default.createElement("br", null),
                        "or run composer install."), showDelay: 300, className: "LocalComposer_Tooltip" },
                    react_1.default.createElement(local_components_1.CircleInfoIcon, null))));
        }
        const className = state.active
            ? 'LocalComposer_Indicator LocalComposer_Indicator--active'
            : 'LocalComposer_Indicator';
        return (react_1.default.createElement("span", { className: className },
            state.webRootRelative && state.webRootRelative !== state.coreDirRelative
                ? `Webroot: ${state.webRootRelative} · Core: ${state.coreDirRelative}`
                : `Core: ${state.coreDirRelative}`,
            state.active ? ' ✓' : '',
            !state.coreInstalled ? ' (not installed yet)' : '',
            react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                    sourceLabel,
                    react_1.default.createElement("br", null),
                    state.active
                        ? 'Web server & shell use the webroot; wp-cli (WordPress version, multisite sync) targets the core dir.'
                        : 'Local\'s default webroot is a WordPress install, so nothing is overridden.'), showDelay: 300, className: "LocalComposer_Tooltip" },
                react_1.default.createElement(local_components_1.CircleInfoIcon, null))));
    };
    return (react_1.default.createElement(local_components_1.TableListRow, { label: "Composer project", alignMiddle: true },
        react_1.default.createElement("div", { className: "LocalComposer_Cell" },
            react_1.default.createElement(local_components_1.FlySelect, { className: "LocalComposer_Select", options: constants_1.WEBROOT_MODE_LABELS, value: state.mode === 'manual' ? 'auto' : state.mode, disabled: state.mode === 'manual', onChange: onModeChange }),
            renderStatus())));
};
exports.default = ComposerProjectRow;
//# sourceMappingURL=ComposerProjectRow.js.map