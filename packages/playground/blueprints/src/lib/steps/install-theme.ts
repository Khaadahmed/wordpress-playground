import { StepHandler } from '.';
import { asDOM, zipNameToHumanName } from './common';

export interface InstallThemeStep<ResourceType> {
	step: 'installTheme';
	themeZipFile: ResourceType;
	options?: InstallThemeOptions;
}

export interface InstallThemeOptions {
	/**
	 * Whether to activate the theme after installing it.
	 */
	activate?: boolean;
}

/**
 * Installs a WordPress theme in the Playground.
 * Technically, it uses the same theme upload form as a WordPress user
 * would, and then activates the theme if needed.
 *
 * @param playground The playground client.
 * @param themeZipFile The theme zip file.
 * @param options Optional. Set `activate` to false if you don't want to activate the theme.
 */
export const installTheme: StepHandler<InstallThemeStep<File>> = async (
	playground,
	{ themeZipFile, options = {} },
	progress
) => {
	progress?.tracker.setCaption(
		`Installing the ${zipNameToHumanName(themeZipFile.name)} theme`
	);
	try {
		const activate = 'activate' in options ? options.activate : true;

		// Upload it to WordPress
		const themeForm = await playground.request({
			url: '/wp-admin/theme-install.php',
		});
		const themeFormPage = await asDOM(themeForm);
		const themeFormData = new FormData(
			themeFormPage.querySelector('.wp-upload-form')! as HTMLFormElement
		) as any;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { themezip, ...postData } = Object.fromEntries(
			themeFormData.entries()
		);

		const themeInstalledResponse = await playground.request({
			url: '/wp-admin/update.php?action=upload-theme',
			method: 'POST',
			formData: postData,
			files: { themezip: themeZipFile },
		});

		// Activate if needed
		if (activate) {
			const themeInstalledPage = await asDOM(themeInstalledResponse);

			const messageContainer = themeInstalledPage.querySelector(
				'#wpbody-content > .wrap'
			);
			if (
				messageContainer?.textContent?.includes(
					'Theme installation failed.'
				)
			) {
				console.error(messageContainer?.textContent);
				return;
			}

			const activateButton = themeInstalledPage.querySelector(
				'#wpbody-content .activatelink, ' +
					'.update-from-upload-actions .button.button-primary'
			);
			if (!activateButton) {
				console.error('The "activate" button was not found.');
				return;
			}

			const activateButtonHref =
				activateButton.attributes.getNamedItem('href')!.value;
			const activateThemeUrl = new URL(
				activateButtonHref,
				await playground.pathToInternalUrl('/wp-admin/')
			).toString();
			await playground.request({
				url: activateThemeUrl,
			});
		}
	} catch (error) {
		console.error(
			`Proceeding without the ${themeZipFile.name} theme. Could not install it in wp-admin. ` +
				`The original error was: ${error}`
		);
		console.error(error);
	}
};
