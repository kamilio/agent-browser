import { parseHtmlDocument } from "../src/html-parser.js";
import { serializeHtml } from "../src/html-serialization.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const checks: { label: string; passed: boolean }[] = [];
const document = parseHtmlDocument(
	'<button id="load" type="button">Load</button><main id="mount"><input id="sentinel" value="initial"></main><p id="status">Ready</p><table id="table"></table>',
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
			`HTML insertion fixture evaluation failed: ${result.error?.code}`,
		);
	return result.value;
}
function reference(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture target");
	return document.reference(id);
}
try {
	const sentinel = reference("#sentinel");
	check(
		"Actual page code installs adjacent HTML and outerHTML event handlers",
		(await evaluate(`
var mount = document.getElementById("mount"); var oldCard; var insertedScripts = 0;
var sentinel = document.getElementById("sentinel"); var status = document.getElementById("status");
document.getElementById("load").addEventListener("click", function() {
  mount.insertAdjacentHTML("beforeend", '<article id="card"><button id="replace">Replace card</button><script>insertedScripts++;<\/script></article>');
  document.getElementById("replace").addEventListener("click", function() {
    oldCard = document.getElementById("card");
    oldCard.outerHTML = '<article id="card"><button id="finish">Finish card</button><script>insertedScripts++;<\/script></article>';
    document.getElementById("finish").addEventListener("click", function() {
      status.insertAdjacentHTML("beforebegin", '<p id="before">Before status</p>');
      status.insertAdjacentHTML("afterend", '<p id="after">After status</p>');
      status.insertAdjacentHTML("afterbegin", "Done ");
    });
  });
});
return typeof mount.insertAdjacentHTML === "function";
`)) === true,
	);
	await interactions.fill(sentinel, "edited value");
	await interactions.clickAsync(reference("#load"));
	check(
		"Native activation creates parsed actionable controls without reparsing an existing input",
		renderSnapshot(snapshotDocument(document)).includes("Replace card") &&
			(await evaluate(
				'return sentinel === document.getElementById("sentinel") && sentinel.value === "edited value";',
			)) === true &&
			reference("#sentinel") === sentinel,
	);
	const oldCardReference = reference("#card");
	const oldButtonReference = reference("#replace");
	await interactions.clickAsync(oldButtonReference);
	check(
		"An interpreted outerHTML action replaces the card with fresh native identities",
		reference("#card") !== oldCardReference &&
			queries.querySelector("#replace") === null &&
			queries.querySelector("#finish") !== null,
	);
	let stale = false;
	try {
		document.resolve(oldButtonReference);
	} catch {
		stale = true;
	}
	check(
		"Removed references become stale while retained guest capabilities remain readable",
		stale &&
			(await evaluate(
				'return oldCard.parentNode === null && oldCard.querySelector("#replace").textContent === "Replace card";',
			)) === true,
	);
	check(
		"Scripts parsed by both insertion paths remain inert",
		(await evaluate("return insertedScripts === 0;")) === true,
	);
	await interactions.clickAsync(reference("#finish"));
	check(
		"Native click on the replacement runs its explicitly registered interpreted listener",
		renderSnapshot(snapshotDocument(document)).includes('text "Done"') &&
			(await evaluate('return status.textContent === "Done Ready";')) ===
				true &&
			queries.querySelector("#before") !== null &&
			queries.querySelector("#after") !== null,
	);
	check(
		"Interpreted table insertion uses a table context rather than generic markup wrapping",
		(await evaluate(`
var table = document.getElementById("table"); table.insertAdjacentHTML("beforeend", '<tr id="row"><td id="cell">one</td></tr>');
document.getElementById("cell").outerHTML = '<td id="cell">two</td><td>three</td>';
return table.querySelector("tbody > tr > td").textContent === "two" && document.getElementById("row").childNodes.length === 2;
`)) === true,
	);
	const revision = document.revision;
	const count = document.nodeCount;
	check(
		"Rejected fragment parsing preserves committed DOM and native allocation",
		(await evaluate(`
var rejected = false; try { document.getElementById("card").outerHTML = '<p>staged</p><template>unsupported'; } catch (error) { rejected = true; }
return rejected && document.getElementById("finish") !== null;
`)) === true &&
			document.revision === revision &&
			document.nodeCount === count,
	);
	check(
		"Detached outerHTML is a no-op even for unsupported parser input",
		(await evaluate(`
var previous = oldCard.outerHTML; oldCard.outerHTML = '<template>unsupported'; return previous === oldCard.outerHTML;
`)) === true,
	);
	check(
		"Fragment-parent insertion and replacement use body context",
		(await evaluate(`
var fragment = document.createDocumentFragment(); var child = document.createElement("td"); fragment.appendChild(child);
child.insertAdjacentHTML("beforebegin", '<tr><td>before</td></tr>'); child.outerHTML = '<tr><td>after</td></tr>';
return fragment.textContent === "beforeafter" && fragment.querySelector("td") === null;
`)) === true,
	);
	check(
		"Live HTML export includes the committed replacement and retains native input state separately",
		serializeHtml(document).includes('id="finish"') &&
			!serializeHtml(document).includes('id="replace"') &&
			(await evaluate('return sentinel.value === "edited value";')) === true,
	);
	await scripts.close();
	check(
		"Owner cleanup preserves independently owned native document actions and references",
		scripts.closed &&
			!interactions.events.metrics().closed &&
			document.resolve(sentinel).id === queries.querySelector("#sentinel"),
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
