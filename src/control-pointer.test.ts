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

function fixture(markup = '<input id="field" value="ABCD" size="6">') {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input,textarea{font-size:8px;color:red}</style>${markup}`,
		"https://fixture.invalid/control-pointer",
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
		click: (horizontal: number, vertical = 8) => {
			actions.mouse.move(horizontal, vertical);
			actions.mouse.down();
			actions.mouse.up();
		},
	};
}

it("places the actual primary mouse caret at the clicked input start", () => {
	const test = fixture();
	test.click(6);
	expect(test.selection()).toMatchObject({ anchor: 0, focus: 0 });
	expect(test.value()).toBe("ABCD");
	test.actions.keyboard.type("Q");
	expect(test.value()).toBe("QABCD");
});

it("uses the initial viewport when clicking a blurred long input", () => {
	const test = fixture('<input id="field" value="ABCDEFGHIJ" size="4">');
	test.click(12);
	expect(test.selection()).toMatchObject({ anchor: 1, focus: 1 });
	expect(test.value()).toBe("ABCDEFGHIJ");
});

it("uses the already focused end-scrolled viewport when placing another caret", () => {
	const test = fixture('<input id="field" size="4">');
	test.actions.fill(test.tree.reference(test.field), "ABCDEFGHIJ");
	test.click(6);
	expect(test.selection()).toMatchObject({ anchor: 6, focus: 6 });
	expect(test.value()).toBe("ABCDEFGHIJ");
});

it("retains repeated same-position caret publication as a selection no-op", () => {
	const test = fixture();
	test.click(12);
	expect(test.selection()).toMatchObject({ focus: 1 });
	const invalidate = vi.spyOn(test.tree, "invalidatePresentation");
	test.click(12);
	expect(test.selection()).toMatchObject({ focus: 1 });
	expect(invalidate).not.toHaveBeenCalled();
	test.actions.keyboard.type("Q");
	expect(test.value()).toBe("AQBCD");
});

it("maps masked password clicks only to native code-point boundaries", () => {
	const test = fixture('<input id="field" type="password" size="6">');
	test.actions.fill(test.tree.reference(test.field), "a🙂b");
	test.click(18);
	expect(test.selection()).toMatchObject({ anchor: 3, focus: 3 });
	expect(
		JSON.stringify(describeControl(test.tree, test.field, 8)),
	).not.toContain("a🙂b");
});

it("preserves an exact masked midpoint through integer texture scaling", () => {
	const test = fixture(
		'<input id="field" type="password" style="font-size:16px;width:220px;height:32px">',
	);
	test.actions.fill(test.tree.reference(test.field), "a🙂b");
	test.click(30, 16);
	expect(test.selection()).toMatchObject({ anchor: 3, focus: 3 });
});

it("does not place a stale offset after focus changes the control value", () => {
	const test = fixture();
	test.actions.events.addEventListener(test.field, "focus", () => {
		test.tree.setControl(test.field, { value: "replacement" });
	});
	test.actions.mouse.move(12, 8);
	expect(() => test.actions.mouse.down()).toThrow("changed");
	expect(test.selection()).toBeUndefined();
	expect(test.value()).toBe("replacement");
});

it("does not overwrite a newer caret published by a focus handler", () => {
	const test = fixture();
	test.actions.events.addEventListener(test.field, "focus", () => {
		test.actions.keyboard.press("Home");
	});
	test.actions.mouse.move(24, 8);
	expect(() => test.actions.mouse.down()).toThrow("changed");
	expect(test.selection()).toMatchObject({ focus: 0 });
});

it("releases temporary focus guards after repeated failed pointer placements", () => {
	const test = fixture();
	let turns = 0;
	test.actions.events.addEventListener(test.field, "focus", () => {
		test.tree.setControl(test.field, { value: `changed${turns++}` });
	});
	for (let turn = 0; turn < 40; turn++) {
		test.actions.mouse.move(12, 8);
		expect(() => test.actions.mouse.down()).toThrow("changed during focus");
		test.actions.mouse.up();
		test.actions.focus.blurElement(test.field);
	}
	expect(turns).toBe(40);
	expect(test.selection()).toBeUndefined();
});
