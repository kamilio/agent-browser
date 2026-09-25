import { controlChecked, controlValue } from "../src/controls.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const tree = parseHtmlDocument(
	'<input id="text" value="abcd"><input id="check" type="checkbox">',
	"https://fixture.invalid/held-keyboard",
);
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
	const field = [...tree.walk()].find(
		({ node }) => node.attributes.id === "text",
	)?.node.id;
	const box = [...tree.walk()].find(
		({ node }) => node.attributes.id === "check",
	)?.node.id;
	if (field === undefined || box === undefined)
		throw new Error("Missing fixture controls");
	await interactions.focus.focusAsync(tree.reference(field));
	await guest(
		"Guest installs listeners over native keyboard event capabilities",
		`
		var field = document.getElementById("text");
		var box = document.getElementById("check");
		var trace = [];
		var blockSpace = false;
		var lastEvent;
		function record(event) {
			trace.push([event.type, event.key, event.code, event.shiftKey, event.ctrlKey, event.altKey, event.metaKey, event.repeat, event.location]);
			if (event.key === "x") event.preventDefault();
			if (event.type === "keyup" && event.key === " " && blockSpace) event.preventDefault();
			lastEvent = event;
		}
		field.addEventListener("keydown", record);
		field.addEventListener("keypress", record);
		field.addEventListener("keyup", record);
		box.addEventListener("keydown", record);
		box.addEventListener("keypress", record);
		box.addEventListener("keyup", record);
		return typeof field.addEventListener === "function";
	`,
	);
	await interactions.keyboard.downAsync("Shift");
	await guest(
		"Shift down exposes modifier state before any release",
		'return trace.length === 1 && trace[0][0] === "keydown" && trace[0][1] === "Shift" && trace[0][3] && trace[0][8] === 1;',
	);
	await interactions.keyboard.pressAsync("ArrowLeft");
	const selection = await interactions.keyboard.pressAsync("ArrowLeft");
	check(
		"Held Shift extends native selection across separate actions",
		selection.selection?.start === 2 && selection.selection.end === 4,
	);
	await interactions.keyboard.upAsync("Shift");
	await guest(
		"Release exposes cleared modifier state",
		'return lastEvent.type === "keyup" && lastEvent.key === "Shift" && !lastEvent.shiftKey;',
	);
	await interactions.keyboard.pressAsync("Backspace");
	check(
		"Native editing deletes the selected text",
		controlValue(tree, field) === "ab",
	);
	await guest(
		"Guest sees native edited value",
		'trace = []; return field.value === "ab";',
	);
	await interactions.keyboard.downAsync("a");
	await interactions.keyboard.downAsync("KeyA");
	await guest(
		"Repeated down propagates repeat and physical code through SafeJS",
		'return trace.length === 4 && !trace[0][7] && trace[2][7] && trace[2][2] === "KeyA" && field.value === "abaa";',
	);
	await interactions.keyboard.upAsync("a");
	const canceled = await interactions.keyboard.downAsync("x");
	check(
		"Guest prevention is observed before the native default",
		canceled.canceled && controlValue(tree, field) === "abaa",
	);
	await interactions.keyboard.upAsync("x");
	await interactions.keyboard.downAsync("AltRight");
	await guest(
		"Right modifier location and Alt state reach the guest",
		'return lastEvent.key === "Alt" && lastEvent.code === "AltRight" && lastEvent.location === 2 && lastEvent.altKey;',
	);
	await interactions.keyboard.upAsync("AltRight");
	await interactions.focus.focusAsync(tree.reference(box));
	check(
		"Native action focuses checkbox before Space activation",
		interactions.focus.active() === box,
	);
	await interactions.keyboard.downAsync("Space");
	check("Space down does not activate a checkbox", !controlChecked(tree, box));
	await interactions.keyboard.upAsync("Space");
	await guest(
		"Space up activates native checkbox and updates guest state",
		"blockSpace = true; return box.checked;",
	);
	await interactions.keyboard.downAsync("Space");
	await interactions.keyboard.upAsync("Space");
	await guest(
		"Canceling keyup prevents the pending native activation",
		"return box.checked;",
	);
	await interactions.focus.focusAsync(tree.reference(field));
	check(
		"Native action returns focus to the text control",
		interactions.focus.active() === field,
	);
	await interactions.keyboard.downAsync("Shift");
	await interactions.keyboard.typeAsync("q");
	await guest(
		"Type preserves literal characters while Shift remains held",
		'return field.value === "abaaq" && lastEvent.shiftKey;',
	);
	await interactions.keyboard.upAsync("Shift");
	check(
		"No native callback errors accumulated",
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
				page: page.metrics(),
				fixture:
					"production PageScripts over in-memory HTML; no network or sockets",
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				limitations:
					"document-scoped keyboard state; no OS clipboard, IME, system shortcuts or full keyboard-layout emulation",
			},
			null,
			2,
		),
	);
}
