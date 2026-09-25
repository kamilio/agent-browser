import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<main id="main"><button id="target" class="mark">Go</button><label id="label" for="check">Check</label><input id="check" type="checkbox"><div id="other" tabindex="0">Other</div></main>',
	"https://fixture.invalid/query-state",
);
const nativeQueries = new DocumentQueries(tree);
const id = (selector: string) => {
	const value = nativeQueries.querySelector(selector);
	if (value === null) throw new Error(`Missing ${selector}`);
	return value;
};
const ids = {
	target: id("#target"),
	other: id("#other"),
	label: id("#label"),
	check: id("#check"),
	main: id("#main"),
};
const page = new PageScripts(
	{ document: tree, interactions: documentInteractions(tree) },
	core,
);
const checks: { label: string; passed: boolean }[] = [];
const observations: unknown[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
function queryMetrics() {
	const result = page.metrics().dom?.queries;
	if (!result) throw new Error("Missing guest query metrics");
	return result;
}
try {
	await guest(
		"Guest warms real query bindings and retains a static result",
		'var target = document.getElementById("target"); var label = document.getElementById("label"); var checkControl = document.getElementById("check"); var other = document.getElementById("other"); var parent = document.getElementById("main"); var saved = document.querySelectorAll(".mark"); return saved.length === 1 && saved[0] === target && !target.matches(":hover");',
	);
	const initial = queryMetrics();
	observations.push(initial);
	tree.setPointerState(ids.target, null);
	await guest(
		"Guest sees hovered target/ancestors through retained structural data",
		'return target.matches(":hover") && parent.matches(":hover") && document.querySelector("main:has(> :hover)") === parent;',
	);
	check(
		"Guest hover refresh avoids structural rebuilding",
		queryMetrics().structuralBuilds === initial.structuralBuilds &&
			queryMetrics().stateRefreshes === initial.stateRefreshes + 1,
	);
	tree.setActiveElement(ids.check);
	tree.setKeyboardActivation(ids.target);
	await guest(
		"Focus and keyboard active refresh together",
		'return checkControl.matches(":focus") && target.matches(":active") && parent.matches(":focus-within:active");',
	);
	check(
		"Guest focus/activation refresh still reuses structure",
		queryMetrics().structuralBuilds === initial.structuralBuilds &&
			queryMetrics().stateRefreshes === initial.stateRefreshes + 2,
	);
	tree.setTargetElement(ids.other);
	tree.setPointerState(ids.label, ids.target);
	await guest(
		"Target and one-way label hover refresh correctly",
		'return other.matches(":target") && label.matches(":hover") && checkControl.matches(":hover") && target.matches(":active");',
	);
	check(
		"Multiple state revisions coalesce into one refresh",
		queryMetrics().stateRefreshes === initial.stateRefreshes + 3,
	);
	tree.setAttribute(ids.target, "class", "changed");
	tree.setPointerState(ids.other, null);
	await guest(
		"A DOM mutation falls back without retaining old attribute results",
		'return document.querySelector(".mark") === null && document.querySelector(".changed") === target && saved.length === 1 && saved[0] === target;',
	);
	check(
		"Attribute plus pointer change rebuilds guest structure",
		queryMetrics().structuralBuilds === initial.structuralBuilds + 1,
	);
	tree.setControl(ids.check, { checked: true });
	await guest(
		"Native control changes retain live guest selector behavior",
		'return checkControl.matches(":checked") && document.querySelector(":checked") === checkControl;',
	);
	check(
		"Control state remains on the conservative full-rebuild path",
		queryMetrics().structuralBuilds === initial.structuralBuilds + 2,
	);
	tree.append(ids.main, tree.createElement("div", { class: "mark" }));
	await guest(
		"Inserted nodes appear without mutating the old result snapshot",
		'return document.querySelectorAll(".mark").length === 1 && document.querySelector(".mark") !== target && saved[0] === target;',
	);
	check(
		"Structural insertion rebuilds the index",
		queryMetrics().structuralBuilds === initial.structuralBuilds + 3,
	);
	observations.push(queryMetrics());
	await page.close();
	nativeQueries.close();
	tree.close();
	check(
		"Runtime and query owner release retained data",
		page.metrics().closed &&
			queryMetrics().closed &&
			queryMetrics().indexedNodes === 0,
	);
	passed = true;
} finally {
	await page.close();
	nativeQueries.close();
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				observations,
				page: page.metrics(),
				fixture:
					"Actual experimental-SafeJS query bindings and native controlled document-state transitions; no network, sockets or remote browser",
				limitations:
					"Functional cache/invalidation evidence, not guest-loop throughput, real-site behavior, layout performance acceptance or deployment proof",
			},
			null,
			2,
		),
	);
}
