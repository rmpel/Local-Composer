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
exports.wrapWordPressStep = void 0;
const react_1 = __importStar(require("react"));
const renderer_1 = require("@getflywheel/local/renderer");
const local_components_1 = require("@getflywheel/local-components");
const constants_1 = require("./constants");
/**
 * Replacement for the wizard's "Set up WordPress" step, injected through the
 * AddSiteIndexJS:RoutesArray filter.
 *
 * Plain mode renders Local's original step untouched, with a single
 * absolutely-positioned "Use a composer template instead" link at the
 * top-right (no wrapper classes — Local's AddSiteContent has a background
 * that would cover the original title).
 *
 * Composer mode mirrors the original step's exact markup skeleton —
 * AddSiteContent → Title → ONE .Inner with the form rows → buttons — because
 * the window lays those out as a flex column and any extra .Inner grabs its
 * own share of the height (the v0.4.1 layout bug).
 */
const TEMPLATE_URL_STORAGE_KEY = 'local-composer:lastTemplateUrl';
// String literals for Local.MultiSite — this module stays free of runtime
// @getflywheel/local imports (renderer convention in this add-on).
const MULTISITE_OPTIONS = {
    '': 'No',
    'ms-subdir': 'Yes – Subdirectory',
    'ms-subdomain': 'Yes – Subdomain',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ComposerForm = (props) => {
    var _a, _b, _c, _d, _e, _f;
    const [templateUrl, setTemplateUrl] = (0, react_1.useState)(() => { var _a; return (_a = window.localStorage.getItem(TEMPLATE_URL_STORAGE_KEY)) !== null && _a !== void 0 ? _a : ''; });
    const [adminUsername, setAdminUsername] = (0, react_1.useState)((_b = (_a = props.wpCredentials) === null || _a === void 0 ? void 0 : _a.adminUsername) !== null && _b !== void 0 ? _b : '');
    const [adminPassword, setAdminPassword] = (0, react_1.useState)((_d = (_c = props.wpCredentials) === null || _c === void 0 ? void 0 : _c.adminPassword) !== null && _d !== void 0 ? _d : '');
    const [adminEmail, setAdminEmail] = (0, react_1.useState)((_f = (_e = props.wpCredentials) === null || _e === void 0 ? void 0 : _e.adminEmail) !== null && _f !== void 0 ? _f : '');
    const [multiSite, setMultiSite] = (0, react_1.useState)('');
    const [error, setError] = (0, react_1.useState)(null);
    const [submitting, setSubmitting] = (0, react_1.useState)(false);
    const validate = () => {
        if (!templateUrl.trim()) {
            return 'A template composer.json URL (or absolute path) is required.';
        }
        if (!adminUsername) {
            return 'WordPress admin username is missing.';
        }
        if (!adminPassword) {
            return 'WordPress admin password is missing.';
        }
        if (!adminEmail || !EMAIL_PATTERN.test(adminEmail)) {
            return 'A valid WordPress admin email is required.';
        }
        return null;
    };
    const onSubmit = async () => {
        var _a;
        const problem = validate();
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            window.localStorage.setItem(TEMPLATE_URL_STORAGE_KEY, templateUrl.trim());
            const result = await (0, renderer_1.ipcAsync)(constants_1.IPC_EVENTS.CREATE_COMPOSER_SITE, {
                newSiteInfo: Object.assign(Object.assign({}, props.siteSettings), { multiSite }),
                wpCredentials: { adminUsername, adminPassword, adminEmail },
                templateUrl: templateUrl.trim(),
            });
            if (result && result.ok === false) {
                setError((_a = result.error) !== null && _a !== void 0 ? _a : 'Could not fetch the template.');
                setSubmitting(false);
            }
            // On success the main process navigates to the new site's screen.
        }
        catch (err) {
            setError('Something went wrong starting the bootstrap — see Local\'s log.');
            setSubmitting(false);
        }
    };
    return (react_1.default.createElement("div", { className: "AddSiteContent" },
        react_1.default.createElement(local_components_1.Title, { size: "l", container: { margin: 'l 0' } }, "Set up WordPress"),
        react_1.default.createElement("div", { className: "Inner" },
            react_1.default.createElement("div", { className: "FormRow FormRow__Half __Margin_0" },
                react_1.default.createElement("div", { className: "FormField" },
                    react_1.default.createElement("label", null, "Installation type"),
                    react_1.default.createElement(local_components_1.FlySelect, { value: "composer", options: {
                            plain: 'Standard WordPress',
                            composer: 'Composer project (from template)',
                        }, onChange: (value) => {
                            if (value === 'plain') {
                                props.onSwitchToPlain();
                            }
                        } }))),
            react_1.default.createElement("div", { className: "FormRow" },
                react_1.default.createElement("div", { className: "FormField", style: { width: '100%' } },
                    react_1.default.createElement("label", null, "Template composer.json (URL or absolute path)"),
                    react_1.default.createElement("input", { type: "text", placeholder: "https://example.com/path/to/composer.json", value: templateUrl, onChange: (e) => setTemplateUrl(e.target.value), spellCheck: false }))),
            react_1.default.createElement("div", { className: "FormRow FormRow__Third" },
                react_1.default.createElement("div", { className: "FormField" },
                    react_1.default.createElement("label", null, "WordPress username"),
                    react_1.default.createElement("input", { type: "text", value: adminUsername, onChange: (e) => setAdminUsername(e.target.value) })),
                react_1.default.createElement("div", { className: "FormField" },
                    react_1.default.createElement("label", null, "WordPress password"),
                    react_1.default.createElement(local_components_1.InputPasswordToggle, { value: adminPassword, onChange: (value) => { var _a, _b; return setAdminPassword((_b = (_a = value === null || value === void 0 ? void 0 : value.target) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : value); } })),
                react_1.default.createElement("div", { className: "FormField" },
                    react_1.default.createElement("label", null, "WordPress e-mail"),
                    react_1.default.createElement("input", { type: "email", value: adminEmail, onChange: (e) => setAdminEmail(e.target.value) }))),
            react_1.default.createElement(local_components_1.AdvancedToggle, null,
                react_1.default.createElement("div", { className: "FormRow FormRow__Half" },
                    react_1.default.createElement("div", { className: "FormField" },
                        react_1.default.createElement("label", null, "Is this a WordPress Multisite?"),
                        react_1.default.createElement(local_components_1.FlySelect, { value: multiSite, options: MULTISITE_OPTIONS, onChange: (value) => setMultiSite(value) })))),
            error && (react_1.default.createElement("p", { style: { color: '#dc3232', marginTop: '10px' } }, error))),
        react_1.default.createElement(local_components_1.PrimaryButton, { className: "Continue", onClick: onSubmit, disabled: submitting }, submitting ? 'Starting…' : 'Add Composer Site'),
        react_1.default.createElement(local_components_1.TextButton, { className: "GoBack", onClick: () => { var _a; return (_a = props.history) === null || _a === void 0 ? void 0 : _a.goBack(); } }, "Go back")));
};
/**
 * Wrap Local's original "Set up WordPress" step component. Memoized by the
 * caller (renderer.tsx) so the wizard sees a stable component identity
 * across re-renders.
 */
const wrapWordPressStep = (OriginalStep) => {
    const WordPressStepWithComposer = (props) => {
        const [setupType, setSetupType] = (0, react_1.useState)('plain');
        if (setupType === 'composer') {
            return react_1.default.createElement(ComposerForm, Object.assign({}, props, { onSwitchToPlain: () => setSetupType('plain') }));
        }
        return (react_1.default.createElement(react_1.default.Fragment, null,
            react_1.default.createElement("div", { style: { position: 'absolute', top: '30px', right: '84px', zIndex: 5 } },
                react_1.default.createElement(local_components_1.TextButton, { inline: true, onClick: () => setSetupType('composer') }, "Use a composer template instead")),
            react_1.default.createElement(OriginalStep, Object.assign({}, props))));
    };
    return WordPressStepWithComposer;
};
exports.wrapWordPressStep = wrapWordPressStep;
//# sourceMappingURL=AddSiteComposerStep.js.map