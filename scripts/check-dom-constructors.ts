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
const document = parseHtmlDocument(
	'<div id="html"></div><svg id="svg"></svg><math id="math"></math>',
	"https://example.com/",
);
const owner = new PageScripts(
	{ document, interactions: documentInteractions(document) },
	factory,
);
try {
	const result = await owner.evaluate(`
		(() => {
		const html = document.querySelector("#html");
		const svg = document.querySelector("#svg");
		const math = document.querySelector("#math");
		const text = document.createTextNode("detached");
		let illegal = false;
		try { new SVGElement(); } catch (error) { illegal = error instanceof TypeError; }
		class SubElement extends HTMLElement {}
		return [
			html instanceof Node, html instanceof Element, html instanceof HTMLElement,
			!(html instanceof SVGElement), svg instanceof Node, svg instanceof Element,
			svg instanceof SVGElement, !(svg instanceof HTMLElement), math instanceof Element,
			!(math instanceof HTMLElement), !(math instanceof SVGElement), document instanceof Document,
			text instanceof Text, text instanceof CharacterData, !(text instanceof Element),
			document.createDocumentFragment() instanceof DocumentFragment,
			!({nodeType: 1, namespaceURI: "http://www.w3.org/2000/svg"} instanceof SVGElement),
			!(Object.create(SVGElement.prototype) instanceof SVGElement),
			!(html instanceof SubElement), window.SVGElement === SVGElement,
			SVGElement.prototype.constructor === SVGElement, Node.ELEMENT_NODE === 1, illegal
		];
		})()
	`);
	const checks = Array.isArray(result.value) ? result.value : [];
	console.log(
		JSON.stringify({
			scope:
				"Actual SafeJS DOM constructor brands in an in-memory native document; no network, media or meeting join",
			ok:
				result.ok &&
				checks.length === 23 &&
				checks.every((value) => value === true),
			checks: checks.length,
			metrics: result.metrics,
			error: result.error,
		}),
	);
	if (
		!result.ok ||
		checks.length !== 23 ||
		!checks.every((value) => value === true)
	)
		process.exitCode = 1;
} finally {
	await owner.close();
	document.close();
}
