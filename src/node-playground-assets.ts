import { readFile } from "node:fs/promises";
import { playgroundCss, playgroundHtml } from "./playground-assets.js";

export const playgroundDependencyPaths = [
	["captureClient", "/capture-client.js"],
	["captureArtifacts", "/capture-artifacts.js"],
	["errors", "/errors.js"],
	["traceView", "/trace-view.js"],
	["traceReview", "/trace-review.js"],
	["terminalTabs", "/terminal-tabs.js"],
] as const;

export async function loadPlaygroundAssets(
	source = (name: string) =>
		readFile(new URL(`./${name}.js`, import.meta.url), "utf8"),
) {
	const [
		script,
		captureClient,
		captureArtifacts,
		errors,
		traceView,
		traceReview,
		terminalTabs,
	] = await Promise.all([
		source("playground"),
		source("capture-client"),
		source("capture-artifacts"),
		source("errors"),
		source("trace-view"),
		source("trace-review"),
		source("terminal-tabs"),
	]);
	return {
		html: playgroundHtml,
		styles: playgroundCss,
		script,
		captureClient,
		captureArtifacts,
		errors,
		traceView,
		traceReview,
		terminalTabs,
	};
}
