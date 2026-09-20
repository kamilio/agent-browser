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
const outcomes = [];
for (const profile of ["bounded-v1", "application-unicode-v1"] as const) {
	const document = parseHtmlDocument("", "https://example.com/");
	const owner = new PageScripts(
		{ document, interactions: documentInteractions(document) },
		factory,
		{ budgetProfile: profile },
	);
	try {
		const result = await owner.evaluate(
			'new RegExp("a".repeat(4097)).source.length',
		);
		outcomes.push({
			profile,
			passed:
				profile === "bounded-v1"
					? !result.ok &&
						result.error?.code === "budgetExceeded" &&
						result.error.budget === "stringLength"
					: result.ok && result.value === 4097,
			error: result.error,
		});
	} finally {
		await owner.close();
		document.close();
	}
}
const ok = outcomes.every((outcome) => outcome.passed);
console.log(
	JSON.stringify({
		scope:
			"Actual SafeJS regex admission through native page profiles; no network, media or meeting join",
		ok,
		outcomes,
	}),
);
if (!ok) process.exitCode = 1;
