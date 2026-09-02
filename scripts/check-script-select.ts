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
	'<form id="form" action="/search"><select id="select" name="choice"><option id="first" value="one">First</option><optgroup label="Group"><option id="second" value="two">Second</option></optgroup></select><button type="reset" id="reset">Reset</button></form>',
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
		throw new Error(`Select fixture evaluation failed: ${result.error?.code}`);
	return result.value;
}
function reference(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing fixture target");
	return document.reference(id);
}

try {
	check(
		"Initial interpreted select getters share native selection and form identity",
		(await evaluate(
			'var select = document.getElementById("select"); var first = document.getElementById("first"); var second = document.getElementById("second"); return select.value === "one" && select.selectedIndex === 0 && select.options[0] === first && first.form === select.form;',
		)) === true,
	);
	check(
		"Saved indexed option and selected-option capabilities remain live after interpreted assignment",
		(await evaluate(
			'var options = select.options; var selected = select.selectedOptions; select.value = "two"; return options === select.options && selected === select.selectedOptions && selected.length === 1 && selected[0] === second && second.index === 1;',
		)) === true,
	);
	const request = prepareFormSubmission(document, reference("#form")).request;
	check(
		"Native form serialization uses interpreted select value assignment",
		new URL(request.url).searchParams.get("choice") === "two",
	);
	check(
		"Interpreted option value/text creation updates live collection and native selection",
		(await evaluate(
			'var late = document.createElement("option"); late.value = "late"; late.text = "  Late  option "; select.appendChild(late); late.selected = true; return select.value === "late" && select.selectedIndex === 2 && options[2] === late && late.text === "Late option";',
		)) === true,
	);
	check(
		"Multiple selected assignments accumulate while selectedIndex chooses one",
		(await evaluate(
			'select.multiple = true; first.selected = true; second.selected = true; var count = selected.length; select.selectedIndex = 1; return count === 3 && selected.length === 1 && select.type === "select-multiple" && select.value === "two";',
		)) === true,
	);
	check(
		"Property assignment does not synthesize native input or change events",
		(await evaluate(
			'var events = ""; select.addEventListener("input", function() { events += "input;"; }); select.addEventListener("change", function() { events += "change;"; }); select.value = "one"; return events === "";',
		)) === true,
	);
	await interactions.selectAsync(reference("#select"), ["two"]);
	check(
		"Native select dispatch updates interpreted getters and handlers exactly once",
		(await evaluate(
			'return events === "input;change;" && select.value === "two" && selected[0] === second;',
		)) === true,
	);
	check(
		"Missing values clear selection and remove the field from native submission",
		(await evaluate(
			'select.value = "absent"; return select.value === "" && select.selectedIndex === -1 && selected.length === 0;',
		)) === true &&
			!new URL(
				prepareFormSubmission(document, reference("#form")).request.url,
			).searchParams.has("choice"),
	);
	check(
		"Default and current selected state are separate for explicitly changed options",
		(await evaluate(
			'select.multiple = false; second.selected = true; second.defaultSelected = true; second.selected = false; return second.defaultSelected && !second.selected && select.value === "one";',
		)) === true,
	);
	check(
		"Select remove(index) removes the option instead of its owning select",
		(await evaluate(
			"select.remove(2); return select.isConnected && options.length === 2 && !late.isConnected && late.form === null;",
		)) === true,
	);
	check(
		"Detached option text, label and explicit value are available before insertion",
		(await evaluate(
			'var detached = document.createElement("option"); detached.text = "  New\\n choice "; detached.defaultSelected = true; var initial = detached.selected; detached.selected = false; detached.label = "Label"; return detached.value === "New choice" && detached.label === "Label" && initial && !detached.selected && detached.index === 0;',
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
