import { type ExtractedNode, extractDocument } from "../src/extraction.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { ScriptDom } from "../src/script-dom.js";
import { DocumentQueries } from "../src/selectors.js";
import { type Realm, loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const check = (label: string, passed: boolean) => {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Extraction probe assertion failed");
};

const core = await loadExtendedCore();
const tree = parseHtmlDocument(
	'<title>Controlled fixture</title><main id="article"><h1>Static source</h1></main><button id="mutate">Mutate</button><input type="password" value="not-exported">',
	"https://fixture.invalid/",
);
const actions = new DocumentInteractions(tree);
const queries = new DocumentQueries(tree);
const pending: Promise<unknown>[] = [];
let realm: Realm | undefined;
const dom = new ScriptDom(tree, core, {
	events: actions.events,
	callbacks: {
		isClosed: () => realm?.closed ?? false,
		startCallback: (callback, args, options) => {
			const invocation = core.startCallback(callback, args, options);
			pending.push(invocation.result);
			return invocation;
		},
	},
});

try {
	realm = core.createRealm({
		bindings: { document: dom.document },
		budget: new core.Budget({ maxSteps: 100_000, deadline: Date.now() + 1000 }),
		maxEvaluations: 8,
		maxSourceLength: 16_384,
		sink: { log() {}, error() {} },
	});
	const article = queries.querySelector("#article");
	const button = queries.querySelector("#mutate");
	if (article === null || button === null)
		throw new Error("Missing fixture nodes");
	const root = tree.reference(article);
	check(
		"Initial extraction reads the parsed document",
		extractDocument(tree, { root }).content === "# Static source\n",
	);
	await realm.evaluate(
		'document.querySelector("#article").innerHTML = "<h2>Created by JavaScript</h2><p>Read <a id=link href=/next>Next page</a></p>"; document.querySelector("#mutate").addEventListener("click", function () { document.querySelector("h2").textContent = "Changed by interpreted callback"; document.querySelector("#link").setAttribute("href", "/after-action"); });',
	);
	const afterScript = extractDocument(tree, { root });
	check(
		"Actual SafeJS-created HTML appears in Markdown without another fetch",
		typeof afterScript.content === "string" &&
			afterScript.content.includes("## Created by JavaScript") &&
			afterScript.content.includes("https://fixture.invalid/next") &&
			!afterScript.content.includes("Static source"),
	);
	const structured = extractDocument(tree, { root, format: "json" });
	if (structured.format !== "json")
		throw new Error("Unexpected extraction format");
	const nodes: ExtractedNode[] = [structured.content];
	let link: ExtractedNode | undefined;
	while (nodes.length) {
		const node = nodes.pop();
		if (!node) break;
		if (node.type === "link") link = node;
		nodes.push(...(node.children ?? []));
	}
	check(
		"Structured link refs resolve to the same script-created DOM nodes",
		!!link && tree.resolve(link.ref).attributes.id === "link",
	);
	await actions.clickAsync(tree.reference(button));
	await Promise.all(pending);
	const afterAction = extractDocument(tree, { root });
	check(
		"Interpreted native-action callbacks change subsequent extraction",
		typeof afterAction.content === "string" &&
			afterAction.content.includes("Changed by interpreted callback") &&
			afterAction.content.includes("https://fixture.invalid/after-action"),
	);
	check(
		"Extraction preserves node identity after callback mutations",
		!!link && tree.resolve(link.ref).attributes.href === "/after-action",
	);
	check(
		"Whole-document structured extraction does not export password values",
		!JSON.stringify(extractDocument(tree, { format: "json" })).includes(
			"not-exported",
		),
	);
	const repeated = extractDocument(tree, { root });
	check(
		"Repeated extraction reads retained state without replaying scripts",
		JSON.stringify(repeated) === JSON.stringify(afterAction) &&
			pending.length === 1,
	);
} catch (error) {
	checks.push({
		label: error instanceof Error ? error.message : "Extraction probe failed",
		passed: false,
	});
} finally {
	await realm?.close();
	await Promise.allSettled(pending);
	dom.close();
	queries.close();
	actions.close();
	tree.close();
}

console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Actual explicitly selected SafeJS interpreter with an in-memory HTML/action fixture. No HTTP server, public-site request, PTY, subprocess or browser service is created. This is not a substitute for the denied real terminal/site acceptance gate.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((item) => !item.passed)) process.exitCode = 1;
