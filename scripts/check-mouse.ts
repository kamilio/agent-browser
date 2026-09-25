import { controlChecked } from "../src/controls.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<style>html,body{margin:0;padding:0}#first,#second,#label{display:block;width:40px;height:20px;font-size:8px;line-height:12px}</style><div id="first" tabindex="0">First</div><a id="second" href="/next">Next</a><input id="check" type="checkbox" style="display:none"><label id="label" for="check">Check</label>',
	"https://fixture.invalid/mouse",
);
documentStyles(tree).setViewport(100, 80);
const interactions = documentInteractions(tree);
const page = new PageScripts({ document: tree, interactions }, core);
const checks: { label: string; passed: boolean }[] = [];
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
	await guest(
		"Guest installs real mouse listeners",
		`
		var first = document.getElementById("first"); var second = document.getElementById("second");
		var trace = []; var blockDown = false; var blockClick = false; var lastMouse; var exitTarget; var enterTarget;
		function record(event) {
			trace.push(event.type + ":" + event.buttons + ":" + event.clientX);
			lastMouse = event;
			if (event.type === "mousedown" && blockDown) event.preventDefault();
			if (event.type === "click" && blockClick) event.preventDefault();
		}
		document.addEventListener("mousemove", record); document.addEventListener("mousedown", record);
		document.addEventListener("mouseup", record); document.addEventListener("click", record);
		document.addEventListener("auxclick", record); document.addEventListener("contextmenu", record);
		first.addEventListener("mouseout", function(event) { exitTarget = event.relatedTarget; });
		second.addEventListener("mouseover", function(event) { enterTarget = event.relatedTarget; });
		return typeof first.addEventListener === "function";
	`,
	);
	await interactions.mouse.moveAsync(5, 5);
	await guest(
		"Guest observes coordinates, movement, target identity and view",
		'return lastMouse.type === "mousemove" && lastMouse.target === first && lastMouse.clientX === 5 && lastMouse.pageY === 5 && lastMouse.movementX === 5 && lastMouse.view === window;',
	);
	await interactions.keyboard.downAsync("Shift");
	await interactions.mouse.downAsync();
	await guest(
		"Guest mouse events share held keyboard modifiers",
		'return lastMouse.buttons === 1 && lastMouse.button === 0 && lastMouse.shiftKey && lastMouse.getModifierState("Shift") && !lastMouse.getModifierState("CapsLock");',
	);
	check(
		"Mouse down focuses the native eligible target",
		interactions.focus.active() ===
			new DocumentQueries(tree).querySelector("#first"),
	);
	await interactions.mouse.upAsync();
	await guest(
		"Guest observes mouseup then click after release",
		'return trace[trace.length - 2] === "mouseup:0:5" && lastMouse.type === "click" && lastMouse.buttons === 0 && lastMouse.detail === 1;',
	);
	await interactions.keyboard.upAsync("Shift");
	await guest(
		"Guest enables cancellation before the native default",
		"blockDown = true; blockClick = true; return true;",
	);
	await interactions.mouse.moveAsync(5, 25);
	await guest(
		"Boundary events preserve related element identities",
		"return exitTarget === second && enterTarget === first;",
	);
	const down = await interactions.mouse.downAsync();
	check(
		"Guest mousedown prevention is observed before native focus",
		down.canceled &&
			interactions.focus.active() ===
				new DocumentQueries(tree).querySelector("#first"),
	);
	const prevented = await interactions.mouse.upAsync();
	check(
		"Guest click prevention suppresses native navigation intent",
		prevented.canceled && !prevented.defaultAction,
	);
	await guest(
		"Guest restores uncanceled activation",
		"blockDown = false; blockClick = false; return true;",
	);
	await interactions.mouse.downAsync();
	const click = await interactions.mouse.upAsync();
	check(
		"An uncanceled coordinate link produces the session-owned navigation intent",
		click.defaultAction?.kind === "navigate" &&
			click.defaultAction.url === "https://fixture.invalid/next",
	);
	await interactions.mouse.downAsync("right");
	await guest(
		"Right down dispatches a contextmenu event without a native menu",
		'return lastMouse.type === "contextmenu" && lastMouse.button === 2 && lastMouse.buttons === 2;',
	);
	await interactions.mouse.upAsync("right");
	await guest(
		"Right release produces auxclick with released button state",
		'return lastMouse.type === "auxclick" && lastMouse.button === 2 && lastMouse.buttons === 0;',
	);
	await interactions.mouse.moveAsync(5, 45);
	await interactions.mouse.downAsync();
	await interactions.mouse.upAsync();
	check(
		"A real styled label activates its CSS-hidden native checkbox",
		controlChecked(
			tree,
			new DocumentQueries(tree).querySelector("#check") as number,
		),
	);
	await guest(
		"Guest reads the native checkbox change",
		'return document.getElementById("check").checked;',
	);
	check(
		"Native mouse state finishes released without listener errors",
		interactions.mouse.metrics().buttons === 0 &&
			interactions.events.drainErrors().length === 0,
	);
	passed = true;
} finally {
	await page.close();
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				mouse: interactions.mouse.metrics(),
				page: page.metrics(),
				fixture:
					"production PageScripts and native mouse actions over in-memory HTML; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"normal-flow mouse profile only; native control layout, PointerEvents, drag, selection, scrolling, hover/active CSS and OS input remain open",
			},
			null,
			2,
		),
	);
}
