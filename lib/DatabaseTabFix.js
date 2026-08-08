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
exports.findDatabaseComponent = void 0;
const react_1 = __importStar(require("react"));
const renderer_1 = require("@getflywheel/local/renderer");
const local_components_1 = require("@getflywheel/local-components");
const constants_1 = require("./constants");
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
const displayHost = (rawHost) => {
    if (rawHost && rawHost !== 'localhost') {
        return rawHost.split(':')[0];
    }
    return rawHost;
};
const patchedGetDBInfo = (original) => async function () {
    try {
        const { siteID } = this.props.match.params;
        const site = this.props.sites[siteID];
        const config = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.GET_DB_CONFIG, siteID);
        if (!config) {
            return original.call(this);
        }
        // 'db' === Local.SiteServiceRole.DATABASE; string literal keeps this
        // module free of runtime @getflywheel/local imports (same pattern as
        // ComposerPhpRow's 'php').
        const dbService = await (0, renderer_1.ipcAsync)('lightningServices:getSiteServiceByRole', site, 'db');
        this.setState({
            dbName: config.DB_NAME,
            dbUser: config.DB_USER,
            dbPassword: config.DB_PASSWORD,
            dbHost: displayHost(config.DB_HOST),
            dbPort: dbService === null || dbService === void 0 ? void 0 : dbService.port,
            dbSocket: dbService === null || dbService === void 0 ? void 0 : dbService.socket,
        });
    }
    catch (err) {
        return original.call(this);
    }
};
/**
 * From any DOM node rendered by React, find the enclosing class-component
 * instance that looks like SiteInfoDatabase. Handles both fiber key styles
 * (__reactFiber$… for React 17+, __reactInternalInstance$… for 16).
 */
const findDatabaseComponent = (node) => {
    const fiberKey = Object.keys(node).find((key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
    if (!fiberKey) {
        return null;
    }
    let fiber = node[fiberKey];
    while (fiber) {
        const instance = fiber.stateNode;
        if (instance &&
            typeof instance.getDBInfo === 'function' &&
            typeof instance.getFromWPConfig === 'function') {
            return instance;
        }
        fiber = fiber.return;
    }
    return null;
};
exports.findDatabaseComponent = findDatabaseComponent;
const DatabaseTabFix = ({ site }) => {
    var _a, _b, _c, _d;
    const [mode, setMode] = (0, react_1.useState)('pending');
    const [config, setConfig] = (0, react_1.useState)(null);
    const anchorRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        setMode('pending');
        setConfig(null);
        (async () => {
            var _a;
            const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.GET_DB_CONFIG, site.id);
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
            const instance = anchor && (0, exports.findDatabaseComponent)(anchor);
            if (instance) {
                const proto = (_a = instance.constructor) === null || _a === void 0 ? void 0 : _a.prototype;
                if (proto && !proto[PATCH_MARK]) {
                    proto[PATCH_MARK] = true;
                    proto.getDBInfo = patchedGetDBInfo(proto.getDBInfo);
                }
                // Re-run with the patched method: the native rows update in
                // place (the mount-time run already raced ahead with the
                // broken file parse).
                instance.getDBInfo();
                setMode('patched');
            }
            else {
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
        return (react_1.default.createElement(react_1.default.Fragment, null,
            react_1.default.createElement(local_components_1.TableListRow, { label: "Host (composer)", selectable: true }, (_a = displayHost(config.DB_HOST)) !== null && _a !== void 0 ? _a : '—'),
            react_1.default.createElement(local_components_1.TableListRow, { label: "Database name (composer)", selectable: true }, (_b = config.DB_NAME) !== null && _b !== void 0 ? _b : '—'),
            react_1.default.createElement(local_components_1.TableListRow, { label: "Username (composer)", selectable: true }, (_c = config.DB_USER) !== null && _c !== void 0 ? _c : '—'),
            react_1.default.createElement(local_components_1.TableListRow, { label: "Password (composer)", selectable: true }, (_d = config.DB_PASSWORD) !== null && _d !== void 0 ? _d : '—')));
    }
    // Invisible anchor: gives the fiber walk a DOM node inside the pane.
    return react_1.default.createElement("span", { ref: anchorRef, style: { display: 'none' } });
};
exports.default = DatabaseTabFix;
//# sourceMappingURL=DatabaseTabFix.js.map