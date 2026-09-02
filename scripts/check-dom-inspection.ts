import { inspectDom } from "../src/dom-inspection.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { playgroundDom } from "../src/playground.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const document = parseHtmlDocument(
	'<main><div id="details" hidden><p>Before</p></div><input id="password" type="password" value="initial-fixture-secret"><input id="name" value="initial"></main>',
	"https://example.com/",
);
const interactions = new DocumentInteractions(document);
const scripts = new PageScripts({ document, interactions }, core);
let completed = false;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

try {
	const before = inspectDom(document);
	const initial = before.nodes.find((node) =>
		node.attributes.some(
			(attribute) => attribute.name === "id" && attribute.value === "details",
		),
	);
	if (!initial) throw new Error("Missing fixture node");
	const evaluated = await scripts.evaluate(`
let details = document.getElementById("details");
details.setAttribute("data-state", "updated-by-script");
details.innerHTML = "<span>Rendered by JavaScript</span><!-- inert fixture -->";
document.getElementById("password").value = "current-fixture-secret";
document.getElementById("name").value = "edited-by-script";
return true;
`);
	check(
		"The real interpreter mutates the same native document",
		evaluated.ok && evaluated.value === true,
	);
	const revision = document.revision;
	const after = inspectDom(document, { maxDepth: 8 });
	const details = after.nodes.find((node) => node.ref === initial.ref);
	check(
		"Inspected attributes keep their stable node reference after script mutation",
		details?.attributes.some(
			(attribute) =>
				attribute.name === "data-state" &&
				attribute.value === "updated-by-script",
		) === true,
	);
	check(
		"Hidden subtrees expose interpreted text and comment mutations",
		after.nodes.some((node) => node.text === "Rendered by JavaScript") &&
			after.nodes.some(
				(node) => node.kind === "comment" && node.text === " inert fixture ",
			),
	);
	check(
		"Inspection includes current ordinary form state",
		after.nodes.some((node) => node.control?.value === "edited-by-script"),
	);
	const serialized = JSON.stringify(after);
	check(
		"Neither original nor interpreted password values appear in inspection",
		!serialized.includes("initial-fixture-secret") &&
			!serialized.includes("current-fixture-secret") &&
			after.nodes.some(
				(node) => node.protected && node.control?.value === "[redacted]",
			),
	);
	const scoped = inspectDom(document, { root: initial.ref, maxDepth: 1 });
	check(
		"Subtree inspection discloses hidden descendants at the selected depth limit",
		scoped.nodes[0].ref === initial.ref &&
			scoped.nodes.some((node) => node.childrenTruncated) &&
			scoped.truncated,
	);
	const display = playgroundDom(after);
	check(
		"The playground formatter consumes the actual post-script DOM",
		display.includes("Rendered by JavaScript") &&
			display.includes(initial.ref) &&
			!display.includes("current-fixture-secret"),
	);
	check(
		"Inspector reads do not change the live document revision",
		document.revision === revision,
	);
	completed = true;
} finally {
	await scripts.close();
	document.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "existing-experimental-core-in-memory",
				completed,
				checks,
				passed: checks.filter((entry) => entry.passed).length,
			},
			null,
			2,
		),
	);
}
