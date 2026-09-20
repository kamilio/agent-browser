import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import { PageScripts } from "../src/page-scripts.js";

const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled SafeJS package explicitly");
const { factory } = await loadPageRuntime(packageRoot, {
	adapter: "extension",
	runtimeOptions: { classicScripts: true, domExpandos: "bounded-v1" },
});
const document = parseHtmlDocument(
	'<div id="target"></div>',
	"https://example.com/",
);
const owner = new PageScripts(
	{ document, interactions: documentInteractions(document) },
	factory,
);
try {
	const result = await owner.evaluate(`(() => {
		const node = document.querySelector("#target");
		const first = Symbol("same"), second = Symbol("same");
		const value = { count: 21 };
		const callback = () => value.count * 2;
		node[first] = value; node[second] = callback; node.private = value;
		const checks = [
			node[first] === value, node[second] === callback, node[second]() === 42,
			node.private === value, first in node, Object.hasOwn(node, first),
			Object.getOwnPropertySymbols(node).length === 2,
			Object.keys(node).includes("private"), ({...node})[first] === value,
			Object.assign({}, node)[second] === callback,
			document.querySelector("#target") === node,
			node.getAttribute("id") === "target",
			delete node[first], !(first in node), node[second]() === 42
		];
		delete node[second]; delete node.private;
		for (let index = 0; index < 64; index++) node["private" + index] = index;
		let bounded = false;
		try { node[Symbol("overflow")] = 1; } catch(error) { bounded = error instanceof RangeError; }
		checks.push(bounded, node.private63 === 63);
		delete node.private0; node[second] = callback;
		checks.push(node[second]() === 42);
		return checks;
	})()`);
	const checks = Array.isArray(result.value) ? result.value : [];
	const ok =
		result.ok &&
		checks.length === 18 &&
		checks.every((value) => value === true);
	console.log(
		JSON.stringify({
			scope:
				"Actual SafeJS guest fields on native DOM nodes; no network, media or meeting join",
			ok,
			checks: checks.length,
			error: result.error,
		}),
	);
	if (!ok) process.exitCode = 1;
} finally {
	await owner.close();
	document.close();
}
