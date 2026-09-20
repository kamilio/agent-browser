import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { PageScripts } from "../src/page-scripts.js";

const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled SafeJS package explicitly");
const { factory } = await loadPageRuntime(packageRoot, {
	adapter: "extension",
	runtimeOptions: { classicScripts: true, classicScriptErrors: "report" },
});
const document = parseHtmlDocument("", "https://example.com/");
const owner = new PageScripts(
	{ document, interactions: documentInteractions(document) },
	factory,
);
const cases = [
	["ordinary", "{timeout:1000}", "1:0"],
	[
		"inherited getter",
		"Object.setPrototypeOf({}, {get timeout(){reads++;return '1000';}})",
		"1:1",
	],
	["guest coercion", "{timeout:{valueOf(){reads++;return 7.8;}}}", "1:1"],
	["null dictionary", "null", "1:0"],
	["primitive dictionary", "1", "TypeError:0"],
	["bigint timeout", "{timeout:1n}", "TypeError:0"],
	["symbol timeout", "{timeout:Symbol()}", "TypeError:0"],
] as const;
const outcomes = [];
try {
	const initialized = await owner.evaluate(
		`
		Object.getOwnPropertyNames = function(){return [];};
		Object.create = function(){throw new Error('application replacement');};
	`,
		{ discardResult: true },
	);
	if (!initialized.ok) throw new Error("Guest initialization failed");
	for (const [name, options, expected] of cases) {
		const result = await owner.evaluate(`
			var reads = 0, result;
			try {
				var handle = requestIdleCallback(function(){}, ${options});
				cancelIdleCallback(handle);
				result = '1:' + reads;
			} catch(error) { result = error.name + ':' + reads; }
			result;
		`);
		outcomes.push({
			name,
			passed: result.ok && result.value === expected,
			value: result.value,
			error: result.error,
		});
	}
	const aliases = await owner.evaluate(
		"requestIdleCallback === window.requestIdleCallback && requestIdleCallback.length === 1",
	);
	outcomes.push({
		name: "classic Window alias",
		passed: aliases.ok && aliases.value === true,
		value: aliases.value,
		error: aliases.error,
	});
	const exported = await owner.evaluate("({timeout:1000})");
	outcomes.push({
		name: "general record export stays strict",
		passed: !exported.ok && exported.error?.code === "script-error",
		value: exported.value,
		error: exported.error,
	});
	const ok = outcomes.every((outcome) => outcome.passed);
	console.log(
		JSON.stringify({
			scope:
				"Actual SafeJS idle dictionary conversion after application Object method replacements; no network or meeting join",
			ok,
			outcomes,
		}),
	);
	if (!ok) process.exitCode = 1;
} finally {
	await owner.close();
	document.close();
}
