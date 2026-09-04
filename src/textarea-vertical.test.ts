import { afterEach, expect, it, vi } from "vitest";
import { controlValue } from "./controls.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import type { BrowserEvent } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import {
	nativeControlCaret,
	readNativeControlSelection,
} from "./native-control-caret.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(value = "ABCDE\nX\n12345", attributes = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}textarea{font-size:8px;width:120px;height:80px;color:red}</style><textarea id="field" ${attributes}></textarea><input id="other"><div style="height:1000px"></div>`,
		"https://fixture.invalid/textarea-vertical",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(240, 180);
	const queries = new DocumentQueries(tree);
	const field = queries.querySelector("#field");
	const other = queries.querySelector("#other");
	if (field === null || other === null) throw Error("Missing fixture controls");
	const actions = documentInteractions(tree);
	actions.fill(tree.reference(field), value);
	return {
		tree,
		field,
		other,
		actions,
		keyboard: actions.keyboard,
		selection: () => readNativeControlSelection(tree, field),
		value: () => controlValue(tree, field),
	};
}

it("retains a preferred visual column through short textarea rows", () => {
	const test = fixture();
	for (const [key, offset] of [
		["ArrowUp", 7],
		["ArrowUp", 5],
		["ArrowDown", 7],
		["ArrowDown", 13],
	] as const) {
		test.keyboard.press(key);
		expect(test.selection()).toMatchObject({ anchor: offset, focus: offset });
	}
	expect(test.value()).toBe("ABCDE\nX\n12345");
});

it("extends from a fixed anchor and replaces the resulting range", () => {
	const test = fixture();
	test.keyboard.press("Shift+ArrowUp");
	test.keyboard.press("Shift+ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 13, focus: 5 });
	test.keyboard.type("!");
	expect(test.value()).toBe("ABCDE!");
});

it("moves from a reverse selection focus without Shift", () => {
	const test = fixture();
	test.keyboard.placeControlCaret(test.field, 3, 13);
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ anchor: 7, focus: 7 });
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ anchor: 11, focus: 11 });
});

it("resets the desired column after horizontal movement", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	test.keyboard.press("ArrowLeft");
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 0, focus: 0 });
});

it("resets the desired column even after same-offset pointer placement", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	test.keyboard.placeControlCaret(test.field, 7);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 1, focus: 1 });
});

it("uses following-row affinity for wrapped visual rows", () => {
	const test = fixture("ABCDEFGHI", 'style="width:30px"');
	test.keyboard.placeControlCaret(test.field, 7);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 4 });
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 1 });
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ focus: 4 });
});

it("crosses empty hard lines without losing the desired column", () => {
	const test = fixture("ABCDE\n\n12345\n");
	test.keyboard.placeControlCaret(test.field, 3);
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ focus: 6 });
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ focus: 10 });
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ focus: 13 });
});

it("clamps beyond rows without emitting input or scrolling the document", () => {
	const test = fixture();
	const emitted: string[] = [];
	for (const type of ["beforeinput", "input", "scroll"])
		test.actions.events.addEventListener(test.field, type, () =>
			emitted.push(type),
		);
	const before = documentScroll(test.tree).get();
	test.keyboard.press("ArrowDown");
	expect(test.selection()).toMatchObject({ focus: 13 });
	test.keyboard.placeControlCaret(test.field, 3);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 0 });
	expect(documentScroll(test.tree).get()).toEqual(before);
	expect(emitted).toEqual([]);
});

it("allows readonly vertical selection but retains edit rejection", () => {
	const test = fixture();
	test.tree.setAttribute(test.field, "readonly", "");
	test.keyboard.press("Shift+ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 13, focus: 7 });
	expect(() => test.keyboard.type("Q")).toThrow("readonly");
	expect(test.value()).toBe("ABCDE\nX\n12345");
});

it("honors canceled keydown without resetting the preferred column", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	const cancel = (event: BrowserEvent) => event.preventDefault();
	test.actions.events.addEventListener(test.field, "keydown", cancel);
	expect(test.keyboard.press("ArrowUp").canceled).toBe(true);
	expect(test.selection()).toMatchObject({ focus: 7 });
	test.actions.events.removeEventListener(test.field, "keydown", cancel);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 5 });
});

it("uses captured Shift even when a keydown handler releases it", () => {
	const test = fixture();
	test.keyboard.down("Shift");
	test.actions.events.addEventListener(test.field, "keydown", () =>
		test.keyboard.up("Shift"),
	);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 13, focus: 7 });
});

it("does not move the old control after keydown redirects focus", () => {
	const test = fixture();
	test.actions.events.addEventListener(test.field, "keydown", () =>
		test.actions.focus.focus(test.tree.reference(test.other)),
	);
	test.keyboard.press("ArrowUp");
	expect(test.tree.activeElement).toBe(test.other);
	expect(test.selection()).toBeUndefined();
	expect(test.value()).toBe("ABCDE\nX\n12345");
});

it("rejects a focus round trip during vertical key dispatch", () => {
	const test = fixture();
	test.actions.events.addEventListener(test.field, "keydown", () => {
		test.actions.focus.focus(test.tree.reference(test.other));
		test.actions.focus.focus(test.tree.reference(test.field));
	});
	expect(() => test.keyboard.press("ArrowUp")).toThrow(
		"Focus changed during textarea key dispatch",
	);
	expect(test.selection()).toMatchObject({ focus: 13 });
});

it("resets the preferred column after a font geometry change", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	test.tree.setAttribute(test.field, "style", "font-size:16px");
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 1 });
});

it("uses the new value after fill rather than an old vertical record", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	test.actions.fill(test.tree.reference(test.field), "AB\n1234");
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ anchor: 2, focus: 2 });
	expect(test.value()).toBe("AB\n1234");
});

it("resets the preferred column after externally owned caret movement", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	nativeControlCaret(test.tree).select(test.field, 6, 6);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 0 });
});

it("preserves same-offset pointer reset during a vertical notification", () => {
	const test = fixture();
	let reset = false;
	const remove = test.tree.onChange((change) => {
		if (!reset && change.kind === "style" && test.selection()?.focus === 7) {
			reset = true;
			test.keyboard.placeControlCaret(test.field, 7);
		}
	});
	test.keyboard.press("ArrowUp");
	remove();
	expect(reset).toBe(true);
	test.keyboard.press("ArrowUp");
	expect(test.selection()).toMatchObject({ focus: 1 });
});

it.each(["font-size:0", "width:8px", "height:6px"])(
	"does not invent vertical geometry for %s",
	(style) => {
		const test = fixture();
		test.tree.setAttribute(test.field, "style", style);
		test.keyboard.press("ArrowUp");
		expect(test.selection()).toMatchObject({ focus: 13 });
	},
);

it.each(["display:none", "visibility:hidden"])(
	"releases focus rather than inventing a caret for %s",
	(style) => {
		const test = fixture();
		test.tree.setAttribute(test.field, "style", style);
		test.keyboard.press("ArrowUp");
		expect(test.tree.activeElement).not.toBe(test.field);
		expect(test.selection()).toBeUndefined();
		expect(test.value()).toBe("ABCDE\nX\n12345");
	},
);

it("publishes the first vertical destination without an intermediate end caret", () => {
	const tree = parseHtmlDocument(
		"<style>textarea{font-size:8px;width:120px;height:80px}</style><textarea>ABCDE\nX\n12345</textarea>",
		"https://fixture.invalid/first-vertical",
	);
	trees.push(tree);
	const field = new DocumentQueries(tree).querySelector("textarea");
	if (field === null) throw Error("Missing textarea");
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(field));
	expect(readNativeControlSelection(tree, field)).toBeUndefined();
	const observed: unknown[] = [];
	const remove = tree.onChange((change) => {
		if (change.kind === "style") {
			const selection = readNativeControlSelection(tree, field);
			if (selection) observed.push(selection);
		}
	});
	actions.keyboard.press("ArrowUp");
	remove();
	expect(observed).toEqual([
		{ anchor: 7, focus: 7, start: 7, end: 7, valueLength: 13 },
	]);
});

it("does not allocate more selection listeners for repeated vertical movement", () => {
	const test = fixture();
	test.keyboard.press("ArrowUp");
	const change = vi.spyOn(test.tree, "onChange");
	const close = vi.spyOn(test.tree, "onClose");
	for (let iteration = 0; iteration < 40; iteration++) {
		test.keyboard.press("ArrowUp");
		test.keyboard.press("ArrowDown");
	}
	expect(change).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

it("rejects close during caret notification without publishing later state", () => {
	const test = fixture();
	let closed = false;
	const remove = test.tree.onChange((change) => {
		if (!closed && change.kind === "style" && test.selection()?.focus === 7) {
			closed = true;
			test.keyboard.close();
		}
	});
	expect(() => test.keyboard.press("ArrowUp")).toThrow("closed");
	remove();
	expect(closed).toBe(true);
	expect(test.selection()).toBeUndefined();
	expect(() => test.keyboard.press("ArrowDown")).toThrow("closed");
});
