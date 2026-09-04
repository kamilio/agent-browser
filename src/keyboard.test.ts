import { expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { BrowserKeyboardEvent } from "./keyboard.js";

function fixture(tag = "input", attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://example.com/");
	const actions = new DocumentInteractions(tree);
	const field = tree.createElement(tag, attributes);
	tree.append(tree.root, field);
	actions.focus.focus(tree.reference(field));
	return {
		tree,
		actions,
		field,
		keyboard: actions.keyboard,
		events: actions.events,
		value: () => controlValue(tree, field),
	};
}

it("types through keyboard and input events in order with current values", () => {
	const { keyboard, events, field, value } = fixture();
	const calls: unknown[] = [];
	for (const type of ["keydown", "keypress", "beforeinput", "input", "keyup"])
		events.addEventListener(field, type, (event) =>
			calls.push([
				type,
				value(),
				event instanceof BrowserKeyboardEvent ? event.key : null,
			]),
		);
	expect(keyboard.type("a")).toMatchObject({
		characters: 1,
		canceled: false,
		selection: { start: 1, end: 1 },
	});
	expect(calls).toEqual([
		["keydown", "", "a"],
		["keypress", "", "a"],
		["beforeinput", "", null],
		["input", "a", null],
		["keyup", "a", "a"],
	]);
	expect(events.drainErrors()).toEqual([]);
});

it.each(["keydown", "keypress", "beforeinput"])(
	"respects cancellation at %s and still releases the key",
	(type) => {
		const { keyboard, events, field, value } = fixture();
		let released = 0;
		events.addEventListener(field, type, (event) => event.preventDefault());
		events.addEventListener(field, "keyup", () => released++);
		expect(keyboard.press("a").canceled).toBe(true);
		expect(value()).toBe("");
		expect(released).toBe(1);
	},
);

it("edits selections with Shift arrows and select-all chords", () => {
	const { keyboard, value } = fixture("input", { value: "abcd" });
	keyboard.press("Shift+ArrowLeft");
	expect(keyboard.press("Shift+ArrowLeft").selection).toEqual({
		start: 2,
		end: 4,
	});
	keyboard.type("XY");
	expect(value()).toBe("abXY");
	keyboard.press("Control+a");
	keyboard.type("z");
	expect(value()).toBe("z");
	keyboard.press("Meta+A");
	keyboard.press("Delete");
	expect(value()).toBe("");
});

it("moves and deletes by Unicode code point without splitting surrogate pairs", () => {
	const { keyboard, value } = fixture("input", { value: "a🙂b" });
	keyboard.press("ArrowLeft");
	keyboard.press("Backspace");
	expect(value()).toBe("ab");
	keyboard.type("🙂");
	keyboard.press("ArrowLeft");
	keyboard.press("Delete");
	expect(value()).toBe("ab");
});

it("uses logical textarea lines and keeps Home at offset zero before a newline", () => {
	const { keyboard, value } = fixture("textarea", {});
	keyboard.type("one");
	keyboard.press("Enter");
	keyboard.type("two");
	keyboard.press("Home");
	keyboard.type("X");
	expect(value()).toBe("one\nXtwo");
	keyboard.press("End");
	expect(keyboard.press("ArrowLeft").selection).toEqual({ start: 7, end: 7 });
	keyboard.press("Control+A");
	keyboard.press("Enter");
	keyboard.press("ArrowLeft");
	expect(keyboard.press("Home").selection).toEqual({ start: 0, end: 0 });
	keyboard.type("prefix");
	expect(value()).toBe("prefix\n");
});

it("limits typed insertion by maxlength but permits deletion and replacement", () => {
	const { keyboard, value } = fixture("input", { maxlength: "3" });
	keyboard.type("abcd");
	expect(value()).toBe("abc");
	keyboard.press("Backspace");
	keyboard.type("Z");
	expect(value()).toBe("abZ");
	keyboard.press("Control+A");
	keyboard.type("new");
	expect(value()).toBe("new");
});

it("allows readonly focus and selection but never editing", () => {
	const { keyboard, value } = fixture("input", {
		readonly: "",
		value: "fixed",
	});
	expect(keyboard.press("Control+A").selection).toEqual({ start: 0, end: 5 });
	expect(() => keyboard.type("x")).toThrow("readonly");
	expect(() => keyboard.press("Backspace")).toThrow("readonly");
	expect(value()).toBe("fixed");
});

it.each([
	"Control+",
	"Control+Control+A",
	"a+b",
	"ControlOrMeta+A",
	"F13",
	"__proto__",
])("rejects unsupported %s before events", (key) => {
	const { keyboard, events, field } = fixture();
	let calls = 0;
	events.addEventListener(field, "keydown", () => calls++);
	expect(() => keyboard.press(key)).toThrow();
	expect(calls).toBe(0);
});

it("rejects multiline text and bounded typing overflow before changes", () => {
	const { keyboard, value } = fixture();
	for (const text of [
		"line\nline",
		"\ud800",
		"x".repeat(4097),
		"x".repeat(16385),
	])
		expect(() => keyboard.type(text)).toThrow();
	expect(value()).toBe("");
});

it.each(["type", "fill"])(
	"does not overwrite another focus target after beforeinput during %s",
	(operation) => {
		const { tree, actions, keyboard, events, field, value } = fixture();
		const other = tree.createElement("input");
		tree.append(tree.root, other);
		events.addEventListener(field, "beforeinput", () =>
			actions.focus.focus(tree.reference(other)),
		);
		expect(() =>
			operation === "type"
				? keyboard.type("x")
				: actions.fill(tree.reference(field), "x"),
		).toThrow("changed during beforeinput");
		expect(value()).toBe("");
		expect(controlValue(tree, other)).toBe("");
	},
);

it("does not overwrite a listener's value and sends keyup on failure", () => {
	const { tree, keyboard, events, field, value } = fixture();
	let releases = 0;
	events.addEventListener(field, "beforeinput", () =>
		tree.setControl(field, { value: "listener" }),
	);
	events.addEventListener(field, "keyup", () => releases++);
	expect(() => keyboard.press("x")).toThrow("changed during beforeinput");
	expect(value()).toBe("listener");
	expect(releases).toBe(1);
});

it("refreshes returned caret after an input handler changes the value", () => {
	const { tree, keyboard, events, field } = fixture();
	events.addEventListener(field, "input", () =>
		tree.setControl(field, { value: "" }),
	);
	expect(keyboard.type("x").selection).toEqual({ start: 0, end: 0 });
});

it("stops multicharacter typing when an input handler redirects focus", () => {
	const { tree, actions, keyboard, events, field, value } = fixture();
	const other = tree.createElement("input");
	tree.append(tree.root, other);
	events.addEventListener(field, "input", () =>
		actions.focus.focus(tree.reference(other)),
	);
	expect(() => keyboard.type("ab")).toThrow("Focus changed during typing");
	expect(value()).toBe("a");
	expect(controlValue(tree, other)).toBe("");
});

it.each([false, true])(
	"activates a checkbox on Space keyup unless canceled (%s)",
	(cancel) => {
		const { tree, keyboard, events, field } = fixture("input", {
			type: "checkbox",
		});
		const calls: string[] = [];
		for (const type of [
			"keydown",
			"keypress",
			"keyup",
			"click",
			"input",
			"change",
		])
			events.addEventListener(field, type, (event) => {
				calls.push(type);
				if (cancel && type === "keyup") event.preventDefault();
			});
		keyboard.press("Space");
		expect(controlChecked(tree, field)).toBe(!cancel);
		expect(calls).toEqual(
			cancel
				? ["keydown", "keypress", "keyup"]
				: ["keydown", "keypress", "keyup", "click", "input", "change"],
		);
	},
);

it("tabs without an initial focus and gives keyup to the newly focused control", () => {
	const { tree, actions, keyboard, events, field } = fixture();
	actions.focus.focus(null);
	const targets: (number | null)[] = [];
	events.addEventListener(tree.root, "keyup", (event) =>
		targets.push(event.target),
	);
	keyboard.press("Tab");
	expect(actions.focus.active()).toBe(field);
	expect(targets).toEqual([field]);
});

it("rejects closed document keyboard actions", () => {
	const { tree, keyboard } = fixture();
	tree.close();
	expect(() => keyboard.press("a")).toThrow("closed");
});
