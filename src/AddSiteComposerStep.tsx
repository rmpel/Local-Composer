import React, { useState } from 'react';
import { ipcAsync } from '@getflywheel/local/renderer';
import {
	Title,
	FlySelect,
	PrimaryButton,
	TextButton,
	InputPasswordToggle,
	AdvancedToggle,
} from '@getflywheel/local-components';
import { IPC_EVENTS } from './constants';

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

interface StepProps {
	siteSettings: any;
	updateSiteSettings: (settings: any) => void;
	wpCredentials: any;
	updateWpCredentials: (credentials: any) => void;
	history?: any;
	[key: string]: any;
}

const ComposerForm = (props: StepProps & { onSwitchToPlain: () => void }) => {
	const [templateUrl, setTemplateUrl] = useState<string>(
		() => window.localStorage.getItem(TEMPLATE_URL_STORAGE_KEY) ?? '',
	);
	const [adminUsername, setAdminUsername] = useState<string>(props.wpCredentials?.adminUsername ?? '');
	const [adminPassword, setAdminPassword] = useState<string>(props.wpCredentials?.adminPassword ?? '');
	const [adminEmail, setAdminEmail] = useState<string>(props.wpCredentials?.adminEmail ?? '');
	const [multiSite, setMultiSite] = useState<string>('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const validate = (): string | null => {
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
		const problem = validate();
		if (problem) {
			setError(problem);
			return;
		}
		setError(null);
		setSubmitting(true);
		try {
			window.localStorage.setItem(TEMPLATE_URL_STORAGE_KEY, templateUrl.trim());
			const result = await ipcAsync(IPC_EVENTS.CREATE_COMPOSER_SITE, {
				newSiteInfo: {
					...props.siteSettings,
					multiSite,
				},
				wpCredentials: { adminUsername, adminPassword, adminEmail },
				templateUrl: templateUrl.trim(),
			});
			if (result && result.ok === false) {
				setError(result.error ?? 'Could not fetch the template.');
				setSubmitting(false);
			}
			// On success the main process navigates to the new site's screen.
		} catch (err) {
			setError('Something went wrong starting the bootstrap — see Local\'s log.');
			setSubmitting(false);
		}
	};

	return (
		<div className="AddSiteContent">
			<Title size="l" container={{ margin: 'l 0' }}>
				Set up WordPress
			</Title>
			<div className="Inner">
				<div className="FormRow FormRow__Half __Margin_0">
					<div className="FormField">
						<label>Installation type</label>
						<FlySelect
							value="composer"
							options={{
								plain: 'Standard WordPress',
								composer: 'Composer project (from template)',
							}}
							onChange={(value: string) => {
								if (value === 'plain') {
									props.onSwitchToPlain();
								}
							}}
						/>
					</div>
				</div>
				<div className="FormRow">
					<div className="FormField" style={{ width: '100%' }}>
						<label>Template composer.json (URL or absolute path)</label>
						<input
							type="text"
							placeholder="https://example.com/path/to/composer.json"
							value={templateUrl}
							onChange={(e) => setTemplateUrl(e.target.value)}
							spellCheck={false}
						/>
					</div>
				</div>
				<div className="FormRow FormRow__Third">
					<div className="FormField">
						<label>WordPress username</label>
						<input
							type="text"
							value={adminUsername}
							onChange={(e) => setAdminUsername(e.target.value)}
						/>
					</div>
					<div className="FormField">
						<label>WordPress password</label>
						<InputPasswordToggle
							value={adminPassword}
							onChange={(value: any) => setAdminPassword(value?.target?.value ?? value)}
						/>
					</div>
					<div className="FormField">
						<label>WordPress e-mail</label>
						<input
							type="email"
							value={adminEmail}
							onChange={(e) => setAdminEmail(e.target.value)}
						/>
					</div>
				</div>
				<AdvancedToggle>
					<div className="FormRow FormRow__Half">
						<div className="FormField">
							<label>Is this a WordPress Multisite?</label>
							<FlySelect
								value={multiSite}
								options={MULTISITE_OPTIONS}
								onChange={(value: string) => setMultiSite(value)}
							/>
						</div>
					</div>
				</AdvancedToggle>
				{error && (
					<p style={{ color: '#dc3232', marginTop: '10px' }}>{error}</p>
				)}
			</div>
			<PrimaryButton className="Continue" onClick={onSubmit} disabled={submitting}>
				{submitting ? 'Starting…' : 'Add Composer Site'}
			</PrimaryButton>
			<TextButton className="GoBack" onClick={() => props.history?.goBack()}>
				Go back
			</TextButton>
		</div>
	);
};

/**
 * Wrap Local's original "Set up WordPress" step component. Memoized by the
 * caller (renderer.tsx) so the wizard sees a stable component identity
 * across re-renders.
 */
export const wrapWordPressStep = (OriginalStep: any) => {
	const WordPressStepWithComposer = (props: StepProps) => {
		const [setupType, setSetupType] = useState<'plain' | 'composer'>('plain');
		if (setupType === 'composer') {
			return <ComposerForm {...props} onSwitchToPlain={() => setSetupType('plain')} />;
		}
		return (
			<React.Fragment>
				<div style={{ position: 'absolute', top: '30px', right: '84px', zIndex: 5 }}>
					<TextButton inline onClick={() => setSetupType('composer')}>
						Use a composer template instead
					</TextButton>
				</div>
				<OriginalStep {...props} />
			</React.Fragment>
		);
	};
	return WordPressStepWithComposer;
};
