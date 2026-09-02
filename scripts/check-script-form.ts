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
	'<input id="external" name="external" value="outside" form="main"><form id="main" name="primary"><input id="email" name="email"><input id="red" type="radio" name="color" value="red" checked><input id="blue" type="radio" name="color" value="blue"><input id="image" type="image" name="image"><select name="item"><option value="one">One</option></select></form><form id="other"></form>',
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
		throw new Error(`Form binding evaluation failed: ${result.error?.code}`);
	return result.value;
}
function reference(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error("Missing form fixture target");
	return document.reference(id);
}
try {
	check(
		"Interpreted form collections include external associations and exclude image inputs",
		(await evaluate(
			'var form = document.forms.namedItem("primary"); var elements = form.elements; var external = document.getElementById("external"); return document.forms.length === 2 && elements === form.elements && elements.length === 5 && form.length === 5 && elements[0] === external && external.form === form && elements.namedItem("image") === null;',
		)) === true,
	);
	check(
		"Interpreted named lookup returns fresh live radio groups with actual native values",
		(await evaluate(
			'var group = elements.namedItem("color"); var red = document.getElementById("red"); var blue = document.getElementById("blue"); var events = ""; form.addEventListener("input", function() { events += "input;"; }); form.addEventListener("change", function() { events += "change;"; }); group.value = "blue"; return group !== elements.namedItem("color") && group.length === 2 && group[1] === blue && group.value === "blue" && !red.checked && blue.checked && events === "";',
		)) === true,
	);
	const firstRequest = prepareFormSubmission(
		document,
		reference("#main"),
	).request;
	check(
		"Native form serialization includes interpreted radio-group state and external controls",
		new URL(firstRequest.url).searchParams.get("color") === "blue" &&
			new URL(firstRequest.url).searchParams.get("external") === "outside",
	);
	await interactions.setCheckedAsync(reference("#red"), true);
	check(
		"Native radio action updates interpreted groups and dispatches handlers exactly once",
		(await evaluate(
			'return group.value === "red" && events === "input;change;";',
		)) === true,
	);
	await evaluate(
		'form.method = "POST"; form.action = "/send"; form.enctype = "application/x-www-form-urlencoded"; elements.namedItem("email").value = "agent@example.com";',
	);
	const post = prepareFormSubmission(document, reference("#main")).request;
	const body =
		typeof post.body === "string"
			? post.body
			: new TextDecoder().decode(post.body);
	check(
		"Interpreted form metadata configures actual native POST preparation",
		post.method === "POST" &&
			post.url === "https://example.com/send" &&
			new URLSearchParams(body).get("email") === "agent@example.com",
	);
	check(
		"Live radio-group filters preserve exact whitespace-bearing names after interpreted edits",
		(await evaluate(
			'red.name = "a b"; blue.name = "a b"; var renamed = elements.namedItem("a b"); return group.length === 0 && renamed.length === 2 && renamed.value === "red" && elements.namedItem("a") === null;',
		)) === true,
	);
	check(
		"Interpreted form-owner reassignment updates saved collections on both forms",
		(await evaluate(
			'var other = document.getElementById("other"); external.setAttribute("form", "other"); return elements.length === 4 && elements.namedItem("external") === null && other.elements[0] === external && external.form === other;',
		)) === true,
	);
	check(
		"Interpreted input type changes refresh image exclusion and reflected control flags",
		(await evaluate(
			'var image = document.getElementById("image"); image.type = "text"; image.readOnly = true; image.required = true; form.noValidate = true; return elements.length === 5 && elements.namedItem("image") === image && image.getAttribute("readonly") === "" && image.getAttribute("required") === "" && form.noValidate;',
		)) === true,
	);
	check(
		"Removing a form updates document.forms while its saved descendant collection remains live",
		(await evaluate(
			"form.remove(); return document.forms.length === 1 && elements.length === 5 && red.form === form;",
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
