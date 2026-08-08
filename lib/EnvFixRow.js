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
const renderer_1 = require("@getflywheel/local/renderer");
const local_components_1 = require("@getflywheel/local-components");
const constants_1 = require("./constants");
const DatabaseTabFix_1 = require("./DatabaseTabFix");
/**
 * ".env DB_HOST" row in the Database tab, shown only when the project has a
 * .env file. A fresh .env says DB_HOST="localhost" (TCP :3306), but Local's
 * per-site MySQL listens on a unix socket — the fix button rewrites the line
 * to WordPress's host:socket syntax (localhost:/…/mysqld.sock). After the
 * fix, the native rows are refreshed through the same patched getDBInfo the
 * Database tab fix installed.
 */
const EnvFixRow = ({ site }) => {
    const [state, setState] = (0, react_1.useState)(null);
    const [fixing, setFixing] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const anchorRef = (0, react_1.useRef)(null);
    const refresh = (0, react_1.useCallback)(async () => {
        setState(await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.GET_ENV_STATE, site.id));
    }, [site.id]);
    (0, react_1.useEffect)(() => {
        setState(null);
        setError(null);
        refresh();
    }, [site.id]);
    const onFix = async () => {
        setFixing(true);
        setError(null);
        try {
            const fresh = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.FIX_ENV_DB_HOST, site.id);
            setState(fresh);
            // The config chain now evaluates differently — refresh the native
            // rows above through the (patched) pane component.
            const anchor = anchorRef.current;
            const instance = anchor && (0, DatabaseTabFix_1.findDatabaseComponent)(anchor);
            instance === null || instance === void 0 ? void 0 : instance.getDBInfo();
        }
        catch (err) {
            setError('Could not update the .env — see Local\'s log.');
        }
        finally {
            setFixing(false);
        }
    };
    if (state === null) {
        // No .env (or still loading): stay invisible, but keep a DOM anchor.
        return react_1.default.createElement("span", { ref: anchorRef, style: { display: 'none' } });
    }
    const renderContent = () => {
        if (error) {
            return react_1.default.createElement("span", { className: "LocalComposer_Indicator LocalComposer_Indicator--mismatch" }, error);
        }
        if (state.matches) {
            return (react_1.default.createElement("span", { className: "LocalComposer_Indicator LocalComposer_Indicator--active" },
                '✓ uses Local\'s MySQL socket',
                react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                        state.envPath,
                        react_1.default.createElement("br", null),
                        "DB_HOST=\"",
                        state.desiredDbHost,
                        "\""), showDelay: 300, className: "LocalComposer_Tooltip" },
                    react_1.default.createElement(local_components_1.CircleInfoIcon, null))));
        }
        return (react_1.default.createElement(react_1.default.Fragment, null,
            react_1.default.createElement("span", { className: "LocalComposer_Indicator LocalComposer_Indicator--mismatch" },
                state.currentDbHost === null
                    ? 'DB_HOST not set'
                    : `DB_HOST is "${state.currentDbHost}"`,
                react_1.default.createElement(local_components_1.Tooltip, { content: react_1.default.createElement("div", null,
                        state.envPath,
                        react_1.default.createElement("br", null),
                        'Local\'s MySQL listens on a per-site unix socket;',
                        react_1.default.createElement("br", null),
                        '"localhost" alone means TCP port 3306 and will not connect.'), showDelay: 300, className: "LocalComposer_Tooltip" },
                    react_1.default.createElement(local_components_1.CircleInfoIcon, null))),
            react_1.default.createElement(local_components_1.TextButton, { inline: true, disabled: fixing, onClick: onFix }, fixing ? 'Updating…' : 'Point DB_HOST at Local\'s socket')));
    };
    return (react_1.default.createElement(local_components_1.TableListRow, { label: ".env DB_HOST", alignMiddle: true },
        react_1.default.createElement("div", { className: "LocalComposer_Cell" },
            react_1.default.createElement("span", { ref: anchorRef, style: { display: 'none' } }),
            renderContent())));
};
exports.default = EnvFixRow;
//# sourceMappingURL=EnvFixRow.js.map