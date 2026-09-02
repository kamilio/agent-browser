import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const document = parseHtmlDocument(
	'<label for="new">New task</label><input id="new"><button id="add" type="button">Add</button><ul id="list"></ul><p id="status">Ready</p>',
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
async function evaluate(source: string) {
	const result = await scripts.evaluate(source);
	if (!result.ok)
		throw new Error(
			`Mutation fixture evaluation failed: ${result.error?.code}`,
		);
	return result.value;
}
function reference(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture node");
	return document.reference(id);
}

try {
	check(
		"Actual interpreted application installs modern DOM mutation handlers",
		(await evaluate(`
var list = document.getElementById("list");
var input = document.getElementById("new");
var status = document.getElementById("status");
var count = 0;
document.getElementById("add").addEventListener("click", function() {
  count++;
  var row = document.createElement("li"); row.id = "task-" + count;
  var toggle = document.createElement("button"); toggle.id = "toggle-" + count;
  toggle.append(input.value);
  var remove = document.createElement("button"); remove.id = "remove-" + count;
  remove.append("Delete " + input.value);
  toggle.addEventListener("click", function() { toggle.replaceChildren("Done " + toggle.textContent); });
  remove.addEventListener("click", function() { row.replaceWith(); status.replaceChildren("Removed"); });
  row.append(toggle, " ", remove); list.append(row); input.value = "";
});
return typeof list.append === "function" && typeof list.replaceChildren === "function";
`)) === true,
	);
	await interactions.fill(reference("#new"), "Write tests");
	await interactions.clickAsync(reference("#add"));
	const firstReference = reference("#toggle-1");
	check(
		"Native fill and click create an interpreted actionable task in the semantic snapshot",
		renderSnapshot(snapshotDocument(document)).includes("Write tests") &&
			queries.querySelector("#task-1") !== null,
	);
	await interactions.fill(reference("#new"), "Read docs");
	await interactions.clickAsync(reference("#add"));
	check(
		"Prepending an existing interpreted row preserves stable native references",
		(await evaluate(`
var first = document.getElementById("task-1"); var second = document.getElementById("task-2");
list.prepend(second); return list.firstChild === second && second.nextSibling === first;
`)) === true &&
			document.resolve(firstReference).id ===
				queries.querySelector("#toggle-1"),
	);
	await interactions.clickAsync(firstReference);
	check(
		"A moved button retains its interpreted listener and replaces text without rebuilding the node",
		renderSnapshot(snapshotDocument(document)).includes("Done Write tests") &&
			reference("#toggle-1") === firstReference,
	);
	check(
		"Before and after handle self references and reused siblings in interpreted code",
		(await evaluate(`
first.before(second, first); first.after(second);
return list.firstChild === first && first.nextSibling === second && list.childNodes.length === 2;
`)) === true,
	);
	check(
		"Fragment-based replacement transfers identity and empties the source",
		(await evaluate(`
var fragment = document.createDocumentFragment(); fragment.append(second, first);
list.replaceChildren(fragment); return fragment.childNodes.length === 0 && list.firstChild === second && second.nextSibling === first;
`)) === true,
	);
	check(
		"Interpreted replaceChild returns the old node while retaining the moved subtree",
		(await evaluate(`
var placeholder = document.createElement("li"); placeholder.append("placeholder");
var previous = list.replaceChild(placeholder, second);
var returned = list.replaceChild(second, placeholder);
return previous === second && returned === placeholder && list.firstChild === second;
`)) === true,
	);
	await interactions.clickAsync(reference("#remove-2"));
	check(
		"Native delete activation runs a retained listener after both replacement paths",
		queries.querySelector("#task-2") === null &&
			document.textContent(queries.querySelector("#status") as number) ===
				"Removed",
	);
	check(
		"Character-data ChildNode methods support native text replacement and removal",
		(await evaluate(`
var text = document.createTextNode("one"); var marker = document.createComment("marker");
status.replaceChildren(text, marker); text.before("before "); text.after(" after");
text.replaceWith("middle"); marker.remove(); return status.textContent === "before middle after";
`)) === true,
	);
	check(
		"Invalid cyclic replacement preserves the live parent and its content",
		(await evaluate(`
var rejected = false; try { list.replaceChildren(list); } catch (error) { rejected = true; }
return rejected && list.childNodes.length === 1 && list.firstChild === first;
`)) === true,
	);
	check(
		"Detached nodes ignore sibling mutations without moving connected arguments",
		(await evaluate(`
second.after(first, "ignored"); return first.parentNode === list && list.childNodes.length === 1;
`)) === true,
	);
	await scripts.close();
	check(
		"Closing the script owner leaves the independently owned native document usable",
		scripts.closed &&
			!interactions.events.metrics().closed &&
			document.resolve(firstReference).id ===
				queries.querySelector("#toggle-1"),
	);
	completed = true;
} finally {
	await scripts.close();
	queries.close();
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
