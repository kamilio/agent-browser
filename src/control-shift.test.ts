import { afterEach, expect, it, vi } from "vitest";
import { describeControl } from "./control-rendering.js";
import { controlValue } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { readNativeControlSelection } from "./native-control-caret.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(markup = '<input id="field" value="ABCDE" size="10">') {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input,textarea{font-size:8px;color:red}</style>${markup}`,
		"https://fixture.invalid/control-shift",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const field = new DocumentQueries(tree).querySelector("#field");
	if (field === null) throw new Error("Missing field");
	const actions = documentInteractions(tree);
	return {
		tree,
		field,
		actions,
		selection: () => readNativeControlSelection(tree, field),
		value: () => controlValue(tree, field),
		click: (horizontal: number) => {
			actions.mouse.move(horizontal, 8);
			actions.mouse.down();
			actions.mouse.up();
		},
	};
}

it("extends a focused native control from its anchor before replacement", () => {
	const test = fixture();
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.click(36);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({
		anchor: 2,
		focus: 5,
		start: 2,
		end: 5,
	});
	expect(test.value()).toBe("ABCDE");
	test.actions.keyboard.type("Q");
	expect(test.value()).toBe("ABQ");
});

it("retains a reverse pointer selection for native deletion", () => {
	const test = fixture();
	test.click(30);
	test.actions.keyboard.down("Shift");
	test.click(12);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({
		anchor: 4,
		focus: 1,
		start: 1,
		end: 4,
	});
	test.actions.keyboard.press("Backspace");
	expect(test.value()).toBe("AE");
});

it("preserves the anchor while extending an existing reverse selection", () => {
	const test = fixture();
	test.click(30);
	test.actions.keyboard.down("Shift");
	test.click(12);
	test.click(18);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({
		anchor: 4,
		focus: 2,
		start: 2,
		end: 4,
	});
});

it("still collapses an unmodified pointer placement", () => {
	const test = fixture();
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.click(36);
	test.actions.keyboard.up("Shift");
	test.click(24);
	expect(test.selection()).toMatchObject({
		anchor: 3,
		focus: 3,
		start: 3,
		end: 3,
	});
});

it("does not invent an anchor for a blurred control", () => {
	const test = fixture();
	test.actions.keyboard.down("Shift");
	test.click(18);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({ anchor: 2, focus: 2 });
});

it("preserves selection when a shifted primary mousedown is canceled", () => {
	const test = fixture();
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.click(30);
	const before = test.selection();
	expect(before).toMatchObject({ anchor: 2, focus: 4 });
	test.actions.events.addEventListener(
		test.field,
		"mousedown",
		(event) => event.preventDefault(),
		{ once: true },
	);
	test.click(6);
	expect(test.selection()).toEqual(before);
	test.actions.keyboard.up("Shift");
});

it("uses captured Shift even when a mousedown handler releases it", () => {
	const test = fixture();
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.actions.events.addEventListener(
		test.field,
		"mousedown",
		() => test.actions.keyboard.up("Shift"),
		{ once: true },
	);
	test.click(36);
	expect(test.actions.keyboard.modifiers().shift).toBe(false);
	expect(test.selection()).toMatchObject({ anchor: 2, focus: 5 });
});

it("does not adopt Shift pressed after the mousedown event was captured", () => {
	const test = fixture();
	test.click(18);
	test.actions.events.addEventListener(
		test.field,
		"mousedown",
		() => test.actions.keyboard.down("Shift"),
		{ once: true },
	);
	test.click(36);
	expect(test.actions.keyboard.modifiers().shift).toBe(true);
	expect(test.selection()).toMatchObject({ anchor: 5, focus: 5 });
	test.actions.keyboard.up("Shift");
});

it.each([false, true])(
	"ignores event-property overrides to captured Shift=%s and coordinates",
	(shift) => {
		const test = fixture();
		test.click(18);
		if (shift) test.actions.keyboard.down("Shift");
		let overridden = false;
		test.actions.events.addEventListener(
			test.field,
			"mousedown",
			(event) => {
				Object.defineProperties(event, {
					shiftKey: { value: !shift },
					clientX: { value: 6 },
					clientY: { value: 8 },
				});
				overridden = true;
			},
			{ once: true },
		);
		test.click(36);
		expect(overridden).toBe(true);
		expect(test.selection()).toMatchObject({ anchor: shift ? 2 : 5, focus: 5 });
		if (shift) test.actions.keyboard.up("Shift");
	},
);

it("publishes one anchored selection without a provisional end caret", () => {
	const test = fixture();
	test.actions.focus.focus(test.tree.reference(test.field));
	expect(test.selection()).toBeUndefined();
	test.actions.keyboard.down("Shift");
	const invalidate = vi.spyOn(test.tree, "invalidatePresentation");
	test.click(18);
	expect(test.selection()).toMatchObject({ anchor: 5, focus: 2 });
	expect(invalidate).toHaveBeenCalledTimes(1);
	test.actions.keyboard.up("Shift");
});

it("permits readonly shifted selection without permitting replacement", () => {
	const test = fixture('<input id="field" value="ABCDE" size="10" readonly>');
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.click(36);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({ anchor: 2, focus: 5 });
	expect(() => test.actions.keyboard.type("Q")).toThrow();
	expect(test.value()).toBe("ABCDE");
});

it("retains native surrogate boundaries and masks in password extension", () => {
	const test = fixture('<input id="field" type="password" size="10">');
	test.actions.fill(test.tree.reference(test.field), "a🙂b");
	test.actions.keyboard.down("Shift");
	test.click(12);
	test.actions.keyboard.up("Shift");
	expect(test.selection()).toMatchObject({
		anchor: 4,
		focus: 1,
		start: 1,
		end: 4,
	});
	const descriptor = describeControl(test.tree, test.field, 8);
	expect(descriptor).toMatchObject({ text: "****" });
	expect(JSON.stringify(descriptor)).not.toContain("a🙂b");
});

it("does not invalidate presentation for an unchanged shifted selection", () => {
	const test = fixture();
	test.click(18);
	test.actions.keyboard.down("Shift");
	test.click(36);
	expect(test.selection()).toMatchObject({ anchor: 2, focus: 5 });
	const invalidate = vi.spyOn(test.tree, "invalidatePresentation");
	test.click(36);
	expect(invalidate).not.toHaveBeenCalled();
	test.actions.keyboard.up("Shift");
});

it.each([
	[Number.NaN, 0],
	[1, 2],
	[0, -1],
	[5, 0],
])(
	"rejects focus %s / anchor %s before creating native caret ownership",
	(focus, anchor) => {
		const test = fixture(
			'<input id="field" type="password" value="a🙂b" size="10">',
		);
		test.actions.focus.focus(test.tree.reference(test.field));
		const invalidate = vi.spyOn(test.tree, "invalidatePresentation");
		const subscribe = vi.spyOn(test.tree, "onChange");
		const cleanup = vi.spyOn(test.tree, "onClose");
		expect(test.selection()).toBeUndefined();
		expect(() =>
			test.actions.keyboard.placeControlCaret(test.field, focus, anchor),
		).toThrow("Invalid control caret boundary");
		expect(test.selection()).toBeUndefined();
		expect(invalidate).not.toHaveBeenCalled();
		expect(subscribe).not.toHaveBeenCalled();
		expect(cleanup).not.toHaveBeenCalled();
	},
);
