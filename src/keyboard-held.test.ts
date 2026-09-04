import { expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import { keyboardChord, KeyboardState } from "./keyboard-state.js";

function fixture(tag = "input", attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	const actions = new DocumentInteractions(tree);
	const field = tree.createElement(tag, attributes);
	tree.append(tree.root, field);
	actions.focus.focus(tree.reference(field));
	const events: BrowserKeyboardEvent[] = [];
	for (const name of ["keydown", "keypress", "keyup"])
		actions.events.addEventListener(tree.root, name, (event) => {
			if (event instanceof BrowserKeyboardEvent) events.push(event);
		});
	return {
		tree,
		actions,
		field,
		keyboard: actions.keyboard,
		events,
		value: () => controlValue(tree, field),
	};
}

it.each([
	["Shift", "shiftKey", 1],
	["ShiftRight", "shiftKey", 2],
	["Control", "ctrlKey", 1],
	["ControlRight", "ctrlKey", 2],
	["Alt", "altKey", 1],
	["AltRight", "altKey", 2],
	["Meta", "metaKey", 1],
	["MetaRight", "metaKey", 2],
] as const)(
	"holds and releases %s before dispatch with immutable event fields",
	(key, flag, location) => {
		const { keyboard, events, value } = fixture();
		keyboard.down(key);
		expect(events).toHaveLength(1);
		expect(events[0][flag]).toBe(true);
		expect(events[0].location).toBe(location);
		keyboard.up(key);
		expect(events[1][flag]).toBe(false);
		expect(events[0][flag]).toBe(true);
		expect(value()).toBe("");
	},
);

it("keeps the other physical modifier side held", () => {
	const { keyboard, events } = fixture();
	keyboard.down("ShiftLeft");
	keyboard.down("ShiftRight");
	keyboard.up("ShiftLeft");
	expect(events.at(-1)?.shiftKey).toBe(true);
	keyboard.up("ShiftRight");
	expect(events.at(-1)?.shiftKey).toBe(false);
});

it("repeats down events by physical key and resets after release", () => {
	const { keyboard, events, value } = fixture();
	keyboard.down("a");
	keyboard.down("KeyA");
	expect(value()).toBe("aa");
	expect(events.map((event) => [event.type, event.repeat])).toEqual([
		["keydown", false],
		["keypress", false],
		["keydown", true],
		["keypress", true],
	]);
	keyboard.up("A");
	keyboard.down("a");
	expect(events.slice(-3).map((event) => event.repeat)).toEqual([
		false,
		false,
		false,
	]);
});

it("extends a text selection while Shift is held across commands", () => {
	const { keyboard, value } = fixture("input", { value: "abcd" });
	keyboard.down("Shift");
	keyboard.press("ArrowLeft");
	expect(keyboard.press("ArrowLeft").selection).toEqual({ start: 2, end: 4 });
	keyboard.up("Shift");
	keyboard.press("Backspace");
	expect(value()).toBe("ab");
});

it("types literal text without clearing held modifiers", () => {
	const { keyboard, value, events } = fixture();
	keyboard.down("Shift");
	keyboard.down("Control");
	keyboard.type("a+1");
	expect(value()).toBe("a+1");
	keyboard.up("Control");
	keyboard.press("b");
	expect(value()).toBe("a+1B");
	expect(events.at(-1)?.shiftKey).toBe(true);
	keyboard.up("Shift");
});

it("press emits real modifier events and releases in reverse order", () => {
	const { keyboard, events, value } = fixture();
	keyboard.press("Control+Shift+KeyC");
	expect(events.map((event) => [event.type, event.key])).toEqual([
		["keydown", "Control"],
		["keydown", "Shift"],
		["keydown", "C"],
		["keyup", "C"],
		["keyup", "Shift"],
		["keyup", "Control"],
	]);
	expect(value()).toBe("");
	expect(events.at(-1)?.ctrlKey).toBe(false);
});

it("press preserves a modifier already held by an earlier command", () => {
	const { keyboard, events, value } = fixture();
	keyboard.down("Shift");
	keyboard.press("Shift+KeyA");
	expect(events.filter((event) => event.key === "Shift")).toHaveLength(1);
	keyboard.press("KeyB");
	expect(value()).toBe("AB");
	keyboard.up("Shift");
});

it.each(["Alt+a", "Control+c", "Control+Meta+a", "F12", "ArrowDown"])(
	"delivers %s to page listeners without inventing a native shortcut default",
	(key) => {
		const { keyboard, value, events } = fixture("input", { value: "keep" });
		keyboard.press(key);
		expect(value()).toBe("keep");
		expect(events.some((event) => event.type === "keydown")).toBe(true);
	},
);

it.each(["keydown", "keypress", "keyup"])(
	"canceled Space %s prevents checkbox activation",
	(type) => {
		const { keyboard, actions, tree, field } = fixture("input", {
			type: "checkbox",
		});
		actions.events.addEventListener(field, type, (event) =>
			event.preventDefault(),
		);
		keyboard.down("Space");
		expect(controlChecked(tree, field)).toBe(false);
		keyboard.up("Space");
		expect(controlChecked(tree, field)).toBe(false);
	},
);

it("activates Space only on release and does not retain a stale activation", () => {
	const { keyboard, tree, field } = fixture("input", { type: "checkbox" });
	keyboard.down("Space");
	keyboard.down("Space");
	expect(controlChecked(tree, field)).toBe(false);
	keyboard.up("Space");
	expect(controlChecked(tree, field)).toBe(true);
	keyboard.up("Space");
	expect(controlChecked(tree, field)).toBe(true);
});

it("does not activate the old Space target after focus moves", () => {
	const { keyboard, tree, actions, field } = fixture("input", {
		type: "checkbox",
	});
	keyboard.down("Space");
	const next = tree.createElement("input");
	tree.append(tree.root, next);
	actions.focus.focus(tree.reference(next));
	keyboard.up("Space");
	expect(controlChecked(tree, field)).toBe(false);
});

it("Tab down changes focus and up reaches the new focus", () => {
	const { keyboard, tree, actions, field, events } = fixture();
	const next = tree.createElement("input");
	tree.append(tree.root, next);
	keyboard.down("Tab");
	expect(actions.focus.active()).toBe(next);
	expect(events[0].target).toBe(field);
	keyboard.up("Tab");
	expect(events[1].target).toBe(next);
});

it("releases a press chord after editing fails", () => {
	const { keyboard, tree, field, value, events } = fixture("input", {
		readonly: "",
	});
	expect(() => keyboard.press("Shift+a")).toThrow("readonly");
	expect(events.slice(-2).map((event) => [event.type, event.key])).toEqual([
		["keyup", "A"],
		["keyup", "Shift"],
	]);
	tree.removeAttribute(field, "readonly");
	keyboard.press("a");
	expect(value()).toBe("a");
});

it("isolates held keys by document and rejects actions after close", () => {
	const first = fixture();
	const second = fixture();
	first.keyboard.down("Shift");
	second.keyboard.press("a");
	expect(second.value()).toBe("a");
	first.tree.close();
	expect(() => first.keyboard.down("a")).toThrow("closed");
	expect(() => first.keyboard.up("Shift")).toThrow("closed");
});

it("bounds retained held keys and restores capacity on release", () => {
	const state = new KeyboardState();
	const keys = Array.from({ length: 65 }, (_, index) =>
		String.fromCodePoint(0x400 + index),
	);
	for (const key of keys.slice(0, 64)) state.down(key);
	expect(() => state.down(keys[64])).toThrow("64");
	expect(state.down(keys[0]).repeat).toBe(true);
	state.up(keys[0]);
	expect(state.down(keys[64]).repeat).toBe(false);
	state.clear();
	expect(state.down(keys[64]).repeat).toBe(false);
});

it.each([
	"Control+",
	"Control+Control+A",
	"Shift+Shift",
	"a+b",
	"__proto__",
	"ControlOrMeta+a",
	"Shift+bad",
	"++",
])("rejects invalid %s before dispatch or state changes", (input) => {
	const { keyboard, events, value } = fixture();
	expect(() => keyboard.press(input)).toThrow();
	expect(events).toEqual([]);
	keyboard.press("a");
	expect(value()).toBe("a");
});

it("supports plus chords and US physical aliases without translating literal digits", () => {
	expect(keyboardChord("Control++")).toEqual(["Control", "+"]);
	expect(keyboardChord("+")).toEqual(["+"]);
	const { keyboard, value } = fixture();
	keyboard.down("Shift");
	keyboard.press("Digit1");
	keyboard.press("Equal");
	keyboard.press("1");
	keyboard.up("Shift");
	expect(value()).toBe("!+1");
});

it("does not apply select-all to shifted or combined control shortcuts", () => {
	const { keyboard, value } = fixture("input", { value: "keep" });
	keyboard.press("Control+Shift+a");
	keyboard.press("Control+Meta+a");
	keyboard.press("q");
	expect(value()).toBe("keepq");
});
