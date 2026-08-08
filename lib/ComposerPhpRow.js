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
const compareVersions = (a, b) => {
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
const ComposerPhpRow = ({ site }) => {
    var _a, _b, _c;
    const [state, setState] = (0, react_1.useState)(null);
    const [applyArmed, setApplyArmed] = (0, react_1.useState)(false);
    const [applying, setApplying] = (0, react_1.useState)(false);
    const [applyError, setApplyError] = (0, react_1.useState)(null);
    const armTimer = (0, react_1.useRef)(null);
    const localPhp = (0, constants_1.majorMinor)((_b = (_a = site === null || site === void 0 ? void 0 : site.services) === null || _a === void 0 ? void 0 : _a.php) === null || _b === void 0 ? void 0 : _b.version);
    const refresh = (0, react_1.useCallback)(async () => {
        const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.GET_PHP_STATE, site.id);
        setState(fresh);
    }, [site.id]);
    (0, react_1.useEffect)(() => {
        setState(null);
        setApplyArmed(false);
        setApplyError(null);
        refresh();
    }, [site.id]);
    (0, react_1.useEffect)(() => {
        const onStateChanged = (_event, siteId) => {
            if (siteId === site.id) {
                refresh();
            }
        };
        const onSwapped = (_event, swappedSite) => {
            if ((swappedSite === null || swappedSite === void 0 ? void 0 : swappedSite.id) === site.id) {
                refresh();
            }
        };
        electron_1.ipcRenderer.on(constants_1.IPC_EVENTS.PHP_STATE_CHANGED, onStateChanged);
        electron_1.ipcRenderer.on('siteServiceSwapped', onSwapped);
        return () => {
            electron_1.ipcRenderer.removeListener(constants_1.IPC_EVENTS.PHP_STATE_CHANGED, onStateChanged);
            electron_1.ipcRenderer.removeListener('siteServiceSwapped', onSwapped);
        };
    }, [site.id, refresh]);
    const onModeChange = async (mode) => {
        if (!state || mode === state.mode) {
            return;
        }
        setState(Object.assign(Object.assign({}, state), { mode }));
        const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.SET_PHP_MODE, site.id, mode);
        setState(fresh);
    };
    /**
     * Composer → Local. The swap restarts the site, so the button arms first
     * and a second click confirms — same information Local's own dropdown
     * confirm dialog conveys.
     */
    const onApply = async () => {
        if (!(state === null || state === void 0 ? void 0 : state.declared)) {
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
            const available = await (0, renderer_1.ipcAsync)('lightningServices:getServices', 'php');
            const candidates = Object.values((available === null || available === void 0 ? void 0 : available.php) || {}).filter((service) => service.binVersion.startsWith(`${state.declared}.`));
            candidates.sort((a, b) => Number(Boolean(b.registered)) - Number(Boolean(a.registered)) ||
                compareVersions(b.binVersion, a.binVersion));
            const target = candidates[0];
            if (!target) {
                setApplyError(`Local offers no PHP ${state.declared}.x`);
                return;
            }
            await (0, renderer_1.ipcAsync)('SiteProvisionerService:swapService', site, 'php', 'php', target.binVersion);
        }
        catch (err) {
            setApplyError('Switching failed — see Local\'s log.');
        }
        finally {
            setApplying(false);
            refresh();
        }
    };
    const mismatch = Boolean((state === null || state === void 0 ? void 0 : state.found) && state.declared && localPhp && state.declared !== localPhp);
    const renderIndicator = () => {
        var _a;
        if (!(state === null || state === void 0 ? void 0 : state.found)) {
            return (react_1.default.createElement("span", { className: "LocalComposer_Indicator" },
                "No composer.json",
                react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                        "Looked in app/, app/public_html/, app/web/,",
                        react_1.default.createElement("br", null),
                        "app/public/ and app/public/wp-content/."), showDelay: 300, className: "LocalComposer_Tooltip" },
                    react_1.default.createElement(local_components_1.CircleInfoIcon, null))));
        }
        const className = mismatch
            ? 'LocalComposer_Indicator LocalComposer_Indicator--mismatch'
            : 'LocalComposer_Indicator';
        return (react_1.default.createElement("span", { className: className },
            `Composer: ${(_a = state.declared) !== null && _a !== void 0 ? _a : '—'}`,
            mismatch ? ` (Local: ${localPhp})` : state.declared ? ' ✓' : '',
            react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                    state.declared
                        ? `Declared via ${state.source === 'platform' ? 'config.platform.php' : 'require.php'} in`
                        : 'No PHP version declared in',
                    react_1.default.createElement("br", null),
                    state.composerJsonPath), showDelay: 300, className: "LocalComposer_Tooltip" },
                react_1.default.createElement(local_components_1.CircleInfoIcon, null))));
    };
    const renderAction = () => {
        if (state === null || state === void 0 ? void 0 : state.syncing) {
            return react_1.default.createElement("span", { className: "LocalComposer_Indicator" }, "Updating composer.json\u2026");
        }
        if (applyError) {
            return react_1.default.createElement("span", { className: "LocalComposer_Indicator LocalComposer_Indicator--mismatch" }, applyError);
        }
        if ((state === null || state === void 0 ? void 0 : state.mode) === 'composer-leads' && mismatch && state.declared) {
            return (react_1.default.createElement(local_components_1.TextButton, { inline: true, disabled: applying, onClick: onApply }, applying
                ? 'Switching…'
                : applyArmed
                    ? `Click again to confirm — site will restart`
                    : `Switch Local to PHP ${state.declared}`));
        }
        return null;
    };
    return (react_1.default.createElement(local_components_1.TableListRow, { label: "Composer PHP", alignMiddle: true },
        react_1.default.createElement("div", { className: "LocalComposer_Cell" },
            react_1.default.createElement(local_components_1.FlySelect, { className: "LocalComposer_Select", options: constants_1.PHP_MODE_LABELS, value: (_c = state === null || state === void 0 ? void 0 : state.mode) !== null && _c !== void 0 ? _c : 'separate', disabled: !state || !state.found || applying || Boolean(state === null || state === void 0 ? void 0 : state.syncing), onChange: onModeChange }),
            state !== null && renderIndicator(),
            renderAction())));
};
exports.default = ComposerPhpRow;
//# sourceMappingURL=ComposerPhpRow.js.map