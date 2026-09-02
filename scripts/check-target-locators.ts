import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { resolveBrowserTarget } from "../src/target-locator.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const document = parseHtmlDocument(
	'<label for="name">Full name</label><input id="name" data-testid="name-field"><button id="show" data-testid="show">Show details</button><button id="secret" hidden data-testid="secret">Private action</button><p id="status">Waiting</p>',
	"https://example.com/",
);
const interactions = new DocumentInteractions(document);
const queries = new DocumentQueries(document);
const scripts = new PageScripts({ document, interactions }, core);
let completed = false;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

const target = (source: string) =>
	resolveBrowserTarget(document, queries, source);
async function evaluate(source: string) {
	const result = await scripts.evaluate(source);
	if (!result.ok)
		throw new Error(`Locator fixture evaluation failed: ${result.error?.code}`);
	return result.value;
}

try {
	await evaluate(`
document.getElementById("show").addEventListener("click", function() {
 document.getElementById("secret").removeAttribute("hidden");
});
document.getElementById("secret").addEventListener("click", function() {
 document.getElementById("status").textContent = "Activated";
});
document.getElementById("name").addEventListener("input", function() {
 document.getElementById("status").textContent = "Typed: " + this.value;
});
`);
	const input = target("getByRole('textbox', {name:'Full name', exact:true})");
	await interactions.fillAsync(input, "Agent input");
	check(
		"Role/name targeting fills a native control and runs its interpreted handler",
		(await evaluate(
			'return document.getElementById("status").textContent;',
		)) === "Typed: Agent input",
	);
	let hiddenRole = false;
	try {
		target("getByRole('button', {name:'Private action'})");
	} catch (error) {
		hiddenRole =
			error instanceof AgentBrowserError && error.code === "not-found";
	}
	check("Role targeting does not select a hidden action", hiddenRole);
	const hiddenReference = target("getByTestId('secret')");
	let hiddenAction = false;
	try {
		await interactions.clickAsync(hiddenReference);
	} catch (error) {
		hiddenAction =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check(
		"Test-ID targeting does not bypass native visibility checks",
		hiddenAction,
	);
	await interactions.clickAsync(target("getByTestId('show')"));
	const revealed = target("getByRole('button', {name:'private action'})");
	check(
		"The same role locator sees a live interpreted visibility change",
		revealed === hiddenReference,
	);
	await interactions.clickAsync(revealed);
	check(
		"The resolved stable ref activates the actual interpreted button listener",
		(await evaluate(
			'return document.getElementById("status").textContent;',
		)) === "Activated",
	);
	await evaluate(
		'document.getElementById("name").setAttribute("data-testid", "renamed");',
	);
	check(
		"Test-ID lookups observe interpreted attribute changes without replacing the node",
		target("getByTestId('renamed')") === input,
	);
	await evaluate(
		'let duplicate = document.createElement("button"); duplicate.textContent = "Private action"; document.body.appendChild(duplicate);',
	);
	let ambiguous = false;
	try {
		target("getByRole('button', {name:'Private action', exact:true})");
	} catch (error) {
		ambiguous =
			error instanceof AgentBrowserError && error.code === "not-actionable";
	}
	check(
		"An interpreted duplicate makes subsequent targeting fail rather than selecting the first",
		ambiguous,
	);
	check(
		"CSS and saved-reference targeting still reach the same native node",
		target("#name") === input && target(input) === input,
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
