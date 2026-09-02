import { prepareFormSubmission } from "../src/forms.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { type PageScriptCore, PageScripts } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const document = parseHtmlDocument(
	'<form id="form"><select id="select" name="choice"><option id="first" value="one">One</option><option id="second" value="two">Two</option></select><select id="other"><option value="other">Other</option></select></form>',
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
		throw new Error(`Selection state evaluation failed: ${result.error?.code}`);
	return result.value;
}
function reference(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture target");
	return document.reference(id);
}
try {
	check(
		"Interpreted value selection preserves clean peer defaults while ignoring dirty defaults",
		(await evaluate(
			'var select = document.getElementById("select"); var other = document.getElementById("other"); var first = document.getElementById("first"); var second = document.getElementById("second"); var options = select.options; select.value = "two"; first.defaultSelected = true; second.defaultSelected = true; return select.value === "one" && first.selected && !second.selected;',
		)) === true,
	);
	check(
		"Interpreted reparenting repairs both select owners and live option collections",
		(await evaluate(
			'second.selected = true; other.appendChild(second); var moved = select.value === "one" && other.value === "two" && options.length === 1; second.remove(); return moved && other.value === "other" && second.selected && second.form === null;',
		)) === true,
	);
	check(
		"Multiple mode normalization persists instead of resurrecting old selected states",
		(await evaluate(
			'select.innerHTML = "<option value=one>One</option><option value=two>Two</option>"; first = options[0]; second = options[1]; select.multiple = true; second.selected = true; var both = select.selectedOptions.length === 2; select.multiple = false; select.multiple = true; return both && select.value === "two" && !first.selected && select.selectedOptions.length === 1;',
		)) === true,
	);
	check(
		"Explicitly cleared selection survives unrelated changes but repairs on option insertion",
		(await evaluate(
			'select.multiple = false; select.selectedIndex = -1; select.className = "changed"; var cleared = select.value === ""; var late = document.createElement("option"); late.value = "late"; select.appendChild(late); return cleared && select.value === "one" && first.selected;',
		)) === true,
	);
	check(
		"Interpreted removal updates native selection and excludes disabled fallback options",
		(await evaluate(
			'second.disabled = true; first.remove(); return select.value === "late" && late.selected && !second.selected;',
		)) === true,
	);
	const request = prepareFormSubmission(document, reference("#form")).request;
	check(
		"Native form serialization observes repaired interpreted selection",
		new URL(request.url).searchParams.get("choice") === "late",
	);
	check(
		"Interpreted option cloning preserves dirty state separately from defaultSelected",
		(await evaluate(
			"second.selected = false; second.defaultSelected = true; var copy = second.cloneNode(true); copy.defaultSelected = false; copy.defaultSelected = true; return copy.defaultSelected && !copy.selected;",
		)) === true,
	);
	await evaluate(
		'select.innerHTML = "<option value=one>One</option><option value=two selected>Two</option>"; first = options[0]; second = options[1]; select.value = "one"; var events = ""; document.getElementById("form").addEventListener("reset", function() { events += "reset;"; }); select.addEventListener("input", function() { events += "input;"; }); select.addEventListener("change", function() { events += "change;"; });',
	);
	await interactions.forms.resetAsync(reference("#form"));
	check(
		"Native reset restores interpreted defaults without extra input/change dispatch",
		(await evaluate(
			'return select.value === "two" && events === "reset;";',
		)) === true,
	);
	check(
		"Native reset clears dirtiness so later interpreted default changes take effect",
		(await evaluate(
			'first.defaultSelected = true; return select.value === "one" && !second.selected;',
		)) === true,
	);
	check(
		"Moving an entire interpreted select preserves intentional empty selection",
		(await evaluate(
			'select.selectedIndex = -1; var container = document.createElement("div"); document.body.appendChild(container); container.appendChild(select); return select.value === "" && select.selectedIndex === -1 && options.length === 2;',
		)) === true,
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
