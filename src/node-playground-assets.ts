import { readFile } from "node:fs/promises";
import { playgroundCss, playgroundHtml } from "./playground-assets.js";

export async function loadPlaygroundAssets() {
	const source = (name: string) =>
		readFile(new URL(`./${name}.js`, import.meta.url), "utf8");
	const [script, captureClient, captureArtifacts, errors] = await Promise.all([
		source("playground"),
		source("capture-client"),
		source("capture-artifacts"),
		source("errors"),
	]);
	return {
		html: playgroundHtml,
		styles: playgroundCss,
		script,
		captureClient,
		captureArtifacts,
		errors,
	};
}
