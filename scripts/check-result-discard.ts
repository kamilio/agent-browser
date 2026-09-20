import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { PageScripts } from "../src/page-scripts.js";

const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled SafeJS package explicitly");
const { factory } = await loadPageRuntime(packageRoot, {
	adapter: "extension",
	runtimeOptions: { classicScripts: true },
});
const document = parseHtmlDocument("", "https://example.com/");
const owner = new PageScripts(
	{ document, interactions: documentInteractions(document) },
	factory,
);
try {
	const completion = await owner.evaluate(
		"globalThis.loaded = Object.create({ ready: true }); loaded;",
		{ discardResult: true },
	);
	const effect = await owner.evaluate("loaded.ready");
	const exported = await owner.evaluate("loaded");
	const checks = {
		discardedCompletion: completion.ok && completion.value === undefined,
		preservedEffect: effect.ok && effect.value === true,
		rejectedNonDataExport:
			!exported.ok && exported.error?.code === "script-error",
	};
	const ok = Object.values(checks).every(Boolean);
	console.log(
		JSON.stringify({
			scope:
				"Actual SafeJS result discard through native page evaluation; no network, media or meeting join",
			ok,
			checks,
		}),
	);
	if (!ok) process.exitCode = 1;
} finally {
	await owner.close();
	document.close();
}
