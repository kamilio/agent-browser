import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>html,body{margin:0;padding:0}button{display:block;width:40px;height:20px}</style><button id="target">Activate</button>',
	"https://fixture.invalid/pointer-activation",
);
documentStyles(tree).setViewport(100, 80);
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
async function guest(label: string, source: string) {
	const result = await page.evaluate(source);
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	const target = queries.querySelector("#target");
	if (target === null) throw new Error("Missing target");
	await guest(
		"Guest listeners capture pointer fields from shared activation events",
		'var target = document.getElementById("target"); var records = []; var cancel = false; var pointerMoveFields = false; function record(event) { records.push({ type: event.type, id: event.pointerId, pointer: event.pointerType, pressure: event.pressure, primary: event.isPrimary, width: event.width, height: event.height, tangent: event.tangentialPressure, tiltX: event.tiltX, tiltY: event.tiltY, twist: event.twist, altitude: event.altitudeAngle, azimuth: event.azimuthAngle, persistent: event.persistentDeviceId, window: event.view === window, detail: event.detail, trusted: event.isTrusted, buttons: event.buttons }); if (cancel) event.preventDefault(); } target.addEventListener("click", record); target.addEventListener("auxclick", record); target.addEventListener("contextmenu", record); target.addEventListener("mousemove", function (event) { pointerMoveFields = typeof event.pointerId !== "undefined"; }); return records.length === 0;',
	);
	await actions.programmaticClickAsync(target);
	await guest(
		"Programmatic activation has non-pointer identity",
		'return records.length === 1 && records[0].id === -1 && records[0].pointer === "" && records[0].detail === 0;',
	);
	await actions.mouse.moveAsync(5, 5);
	await actions.mouse.downAsync("left");
	await actions.mouse.upAsync("left");
	await guest(
		"Coordinate left click has stable mouse identity and existing click detail",
		'return records.length === 2 && records[1].type === "click" && records[1].id === 1 && records[1].pointer === "mouse" && records[1].detail === 1;',
	);
	await actions.mouse.downAsync("middle");
	await actions.mouse.upAsync("middle");
	await guest(
		"Auxiliary clicks retain mouse identity",
		'return records.length === 3 && records[2].type === "auxclick" && records[2].id === 1 && records[2].pointer === "mouse";',
	);
	await actions.mouse.downAsync("right");
	await actions.mouse.upAsync("right");
	await guest(
		"Context menu activation retains default pointer pressure despite held buttons",
		'return records.length === 5 && records[3].type === "contextmenu" && records[3].buttons === 2 && records[3].pressure === 0 && records[3].primary === false && records[4].type === "auxclick";',
	);
	await actions.keyboard.pressAsync("Enter");
	await guest(
		"Keyboard activation uses non-pointer identity",
		'return records.length === 6 && records[5].type === "click" && records[5].id === -1 && records[5].pointer === "";',
	);
	await actions.clickAsync(tree.reference(target));
	await guest(
		"Reference-only agent activation does not impersonate a coordinate pointer",
		'return records.length === 7 && records[6].id === -1 && records[6].pointer === "";',
	);
	await guest(
		"Every activation exposes default pointer geometry and the owned Window",
		"return records.every(function (entry) { return entry.width === 1 && entry.height === 1 && entry.pressure === 0 && entry.tangent === 0 && entry.tiltX === 0 && entry.tiltY === 0 && entry.twist === 0 && entry.altitude === Math.PI / 2 && entry.azimuth === 0 && entry.persistent === 0 && entry.primary === false && entry.window && !entry.trusted; });",
	);
	await guest(
		"Mouse movement remains an explicitly non-PointerEvent stream",
		"return !pointerMoveFields;",
	);
	await guest(
		"Arms cancellation from a guest pointer-field listener",
		"cancel = true; return true;",
	);
	check(
		"Guest cancellation still reaches native activation",
		(await actions.programmaticClickAsync(target)).defaultPrevented,
	);
	const observation = await page.evaluate(
		"return { htmlElementClick: typeof target.click, pointerEventConstructor: typeof PointerEvent, records: records };",
	);
	observations.push(observation);
	if (!observation.ok) throw new Error("Guest capability observation failed");
	check(
		"No guest listener errors were swallowed",
		actions.events.drainErrors().length === 0,
	);
	await page.close();
	queries.close();
	tree.close();
	check(
		"Runtime and event owners close",
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
					"Existing experimental SafeJS with native programmatic, mouse, keyboard and reference activation; synthetic document and no network",
				limitations:
					"Pointer activation attributes only; no guest PointerEvent constructor, coalesced/predicted methods, pointer streams/capture/touch/pen, guest HTMLElement.click, real-site or deployment acceptance",
			},
			null,
			2,
		),
	);
}
