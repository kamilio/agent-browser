import { controlChecked, controlValue } from "../src/controls.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { renderSnapshot, snapshotDocument } from "../src/snapshot.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<input id="focused"><div hidden inert><label id="label" for="toggle">Toggle</label><input id="toggle" type="checkbox" readonly></div><input id="disabled" type="checkbox" disabled><input id="detached" type="checkbox"><a id="link" href="/before">Link</a><form><input id="value" value="default"><button id="reset" type="reset">Reset</button></form><p id="output">initial</p>',
	"https://fixture.invalid/programmatic-click",
);
const actions = documentInteractions(tree);
const queries = new DocumentQueries(tree);
const page = new PageScripts({ document: tree, interactions: actions }, core);
const checks: { label: string; passed: boolean }[] = [];
const observations: unknown[] = [];
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
function target(selector: string) {
	const id = queries.querySelector(selector);
	if (id === null) throw new Error(`Missing target: ${selector}`);
	return id;
}
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	const toggle = target("#toggle");
	const detached = target("#detached");
	const link = target("#link");
	await actions.focus.focusAsync(tree.reference(target("#focused")));
	await guest(
		"Registers real guest click/input/change callbacks on a hidden readonly control",
		'var toggle = document.getElementById("toggle"); var focused = document.getElementById("focused"); var label = document.getElementById("label"); var disabled = document.getElementById("disabled"); var detached = document.getElementById("detached"); var link = document.getElementById("link"); var output = document.getElementById("output"); var trace = ""; var cancel = false; var labelClicks = 0; var disabledClicks = 0; var detachedTrace = ""; toggle.addEventListener("click", function (event) { trace += "click:" + toggle.checked + ":" + event.isTrusted + ":" + event.detail + ";"; if (cancel) event.preventDefault(); }); toggle.addEventListener("input", function () { trace += "input;"; output.textContent = "activated"; }); toggle.addEventListener("change", function () { trace += "change;"; }); label.addEventListener("click", function () { labelClicks++; }); disabled.addEventListener("click", function () { disabledClicks++; }); detached.addEventListener("click", function () { detachedTrace += "click;"; }); detached.addEventListener("input", function () { detachedTrace += "input;"; }); return document.activeElement === focused;',
	);
	await actions.programmaticClickAsync(toggle);
	await guest(
		"Host-originated activation waits for guest handlers and preserves focus",
		'return trace === "click:true:false:0;input;change;" && toggle.checked && document.activeElement === focused && output.textContent === "activated";',
	);
	check(
		"Semantic output shares the guest-mutated document",
		renderSnapshot(snapshotDocument(tree)).includes("activated"),
	);
	await guest(
		"Arms cancellation inside the guest listener",
		'trace = ""; cancel = true; return toggle.checked;',
	);
	tree.setControl(toggle, { indeterminate: true });
	const canceled = await actions.programmaticClickAsync(toggle);
	check(
		"Canceled guest click rolls native checkbox state back",
		canceled.defaultPrevented &&
			controlChecked(tree, toggle) &&
			tree.get(toggle).control.indeterminate === true,
	);
	await guest(
		"Cancellation suppresses input/change after the guest click prefix",
		'return trace === "click:false:false:0;" && toggle.checked && document.activeElement === focused;',
	);
	await guest(
		"Prepares label forwarding",
		'trace = ""; cancel = false; return labelClicks === 0;',
	);
	const forwarded = await actions.programmaticClickAsync(target("#label"));
	check(
		"The native label pipeline forwards through inert and hidden ancestors",
		forwarded.label?.forwarded === true,
	);
	await guest(
		"Forwarded guest callbacks see current state without focus movement",
		'return labelClicks === 1 && trace === "click:false:false:0;input;change;" && !toggle.checked && document.activeElement === focused;',
	);
	await actions.programmaticClickAsync(target("#disabled"));
	await guest(
		"Disabled targets do not invoke retained guest listeners",
		"return disabledClicks === 0 && !disabled.checked;",
	);
	await guest(
		"Guest detaches a control while retaining its capability",
		"detached.parentNode.removeChild(detached); return detached.parentNode === null;",
	);
	await actions.programmaticClickAsync(detached);
	await guest(
		"Detached click updates native checked state but emits no input event",
		'return detached.checked && detachedTrace === "click;";',
	);
	await guest(
		"Guest changes a detached anchor during its click listener",
		'link.parentNode.removeChild(link); link.addEventListener("click", function () { link.setAttribute("href", "/after"); }); return link.parentNode === null;',
	);
	const navigation = await actions.programmaticClickAsync(link);
	check(
		"Navigation remains an intent derived after the guest callback",
		navigation.defaultAction?.kind === "navigate" &&
			navigation.defaultAction.url === "https://fixture.invalid/after",
	);
	const value = target("#value");
	tree.setControl(value, { value: "edited" });
	await guest(
		"Registers a guest reset callback that changes the reset default",
		'var value = document.getElementById("value"); value.parentNode.addEventListener("reset", function () { value.setAttribute("value", "guest-default"); }); return value.value === "edited";',
	);
	const reset = await actions.programmaticClickAsync(target("#reset"));
	check(
		"Reset default runs after its real guest event handler",
		reset.reset?.reset === true &&
			controlValue(tree, value) === "guest-default",
	);
	observations.push(
		await page.evaluate("return { htmlElementClick: typeof toggle.click };"),
	);
	check(
		"No guest event failures were swallowed",
		actions.events.drainErrors().length === 0,
	);
	await page.close();
	queries.close();
	tree.close();
	check(
		"Runtime and native event owners close",
		page.metrics().closed &&
			actions.events.metrics().closed &&
			actions.events.metrics().activeDispatches === 0,
	);
	passed = true;
} finally {
	await page.close();
	queries.close();
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
					"Existing experimental SafeJS with host-originated programmatic activation over a synthetic document; no network, sockets or CLI parity claim",
				limitations:
					"Guest HTMLElement.click is still absent; synchronous guest-to-host activation needs a supported runtime await boundary. PointerEvent fields, detached form defaults, real sites, released-runtime throughput and deployment remain unverified or unsupported",
			},
			null,
			2,
		),
	);
}
