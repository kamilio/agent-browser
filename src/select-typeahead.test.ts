import { afterEach, expect, it, vi } from "vitest";
import { describeControl } from "./control-rendering.js";
import { controlValue, selectedOptions, selectOptions } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { SelectTypeahead, selectTypeaheadLimits } from "./select-typeahead.js";

const trees: DocumentTree[] = [];
function fixture(
	options = '<option value="a">Alpha</option><option value="b">Blue</option><option value="c">Black</option><option value="d">Green</option>',
	attributes = "",
) {
	let now = 100;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const tree = parseHtmlDocument(
		`<select id="pick" ${attributes}>${options}</select><input id="other">`,
		"https://fixture.invalid/typeahead",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const id = query.querySelector("#pick") as number;
	const other = query.querySelector("#other") as number;
	const actions = documentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	const calls: string[] = [];
	for (const type of [
		"keydown",
		"keypress",
		"beforeinput",
		"input",
		"change",
		"keyup",
	])
		actions.events.addEventListener(id, type, () =>
			calls.push(`${type}:${controlValue(tree, id)}`),
		);
	return {
		tree,
		id,
		other,
		actions,
		calls,
		advance: (elapsed: number) => {
			now += elapsed;
		},
		press: (key: string) => actions.keyboard.press(key),
		value: () => controlValue(tree, id),
	};
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

it("selects by displayed label with ordered ordinary input/change notifications", () => {
	const { press, value, calls } = fixture();
	press("b");
	expect(value()).toBe("b");
	expect(calls).toEqual([
		"keydown:a",
		"keypress:a",
		"input:b",
		"change:b",
		"keyup:b",
	]);
});

it("extends a prefix starting at the current selection", () => {
	const { press, value } = fixture();
	press("b");
	press("l");
	expect(value()).toBe("b");
	press("a");
	expect(value()).toBe("c");
});

it("cycles repeated initial characters and wraps in option order", () => {
	const { press, value } = fixture();
	press("b");
	expect(value()).toBe("b");
	press("b");
	expect(value()).toBe("c");
	press("b");
	expect(value()).toBe("b");
});

it("repeated held keydown cycles once per repeat, without a keyup default", () => {
	const { actions, value } = fixture();
	actions.keyboard.down("b");
	expect(value()).toBe("b");
	actions.keyboard.down("b");
	expect(value()).toBe("c");
	actions.keyboard.up("b");
	expect(value()).toBe("c");
});

it("does not discard a failed prefix to manufacture a single-character match", () => {
	const { press, value, calls } = fixture();
	press("b");
	press("g");
	expect(value()).toBe("b");
	expect(calls.filter((call) => call.startsWith("change:"))).toEqual([
		"change:b",
	]);
});

it("expires a prefix strictly after the one-second window", () => {
	const { press, advance, value } = fixture();
	press("b");
	advance(1001);
	press("g");
	expect(value()).toBe("d");
});

it("continues at the exact one-second boundary", () => {
	const { press, advance, value } = fixture();
	press("b");
	advance(1000);
	press("g");
	expect(value()).toBe("b");
});

it("uses keypress creation time rather than time after a slow callback", () => {
	const { press, advance, actions, id, value } = fixture();
	press("b");
	actions.events.addEventListener(id, "keypress", () => advance(2000));
	press("g");
	expect(value()).toBe("b");
});

it.each(["keydown", "keypress"])(
	"canceled %s neither selects nor appends a prefix",
	(type) => {
		const { press, actions, id, value } = fixture();
		press("b");
		const listener = (event: { preventDefault(): void }) =>
			event.preventDefault();
		actions.events.addEventListener(id, type, listener);
		expect(press("g").canceled).toBe(true);
		actions.events.removeEventListener(id, type, listener);
		press("l");
		press("a");
		expect(value()).toBe("c");
	},
);

it.each(["Control+b", "Meta+b", "Alt+b"])(
	"%s does not start a prefix",
	(key) => {
		const { press, value } = fixture();
		press(key);
		expect(value()).toBe("a");
		press("g");
		expect(value()).toBe("d");
	},
);

it("matches shifted letters case-insensitively", () => {
	const { press, value } = fixture();
	press("Shift+b");
	expect(value()).toBe("b");
});

it("skips disabled options and optgroups while wrapping", () => {
	const { press, value } = fixture(
		"<option>a</option><option disabled>Bee</option><optgroup disabled><option>Blue</option></optgroup><option>Black</option>",
	);
	press("b");
	expect(value()).toBe("Black");
});

it.each(["", "<option disabled>Blue</option>"])(
	"empty or disabled-only lists do not notify",
	(options) => {
		const { press, calls } = fixture(options);
		press("b");
		expect(
			calls.some(
				(call) => call.startsWith("input:") || call.startsWith("change:"),
			),
		).toBe(false);
	},
);

it("starts at the first option when no option is selected", () => {
	const { press, tree, id, value } = fixture(
		'<option value="first">Blue</option><option value="second">Black</option>',
	);
	tree.setSelectSelection(id, []);
	press("b");
	expect(value()).toBe("first");
});

it("retains option identity when two matching options have the same value", () => {
	const { press, tree, id } = fixture(
		'<option value="same">Blue</option><option value="same">Black</option>',
	);
	const before = selectedOptions(tree, id)[0].id;
	press("b");
	expect(selectedOptions(tree, id)[0].id).not.toBe(before);
});

it("searches label overrides rather than submitted values or hidden text", () => {
	const { press, value } = fixture(
		'<option>a</option><option value="wrong" label="Green">Blue</option><option value="chosen" label="Blue">Orange</option>',
	);
	press("b");
	expect(value()).toBe("chosen");
});

it("folds canonical accents and ignores leading label whitespace", () => {
	const { press, value } = fixture(
		'<option>a</option><option value="chosen" label=" &#160;Éclair">ignored</option>',
	);
	press("e");
	expect(value()).toBe("chosen");
});

it("supports a supplementary character without splitting its surrogate pair", () => {
	const { press, value } = fixture(
		'<option>a</option><option value="chosen">😀 label</option>',
	);
	press("😀");
	expect(value()).toBe("chosen");
});

it("uses the same script-excluding label for search and visible captions", () => {
	const { tree, id, press, value } = fixture(
		'<option>a</option><option value="chosen">Blue</option>',
	);
	const option = selectOptions(tree, id)[1];
	const script = tree.createElement("script");
	tree.append(script, tree.createText("Hidden"));
	tree.append(option.id, script);
	press("b");
	expect(value()).toBe("chosen");
	expect(describeControl(tree, id, 8)?.text).toBe("Blue");
});

it("accepts spaces inside an active prefix but does not fake opening a popup", () => {
	const { press, value } = fixture(
		"<option>a</option><option>New Jersey</option><option>New York</option>",
	);
	expect(() => press("Space")).toThrow("popup");
	for (const key of ["n", "e", "w", "Space", "y"]) press(key);
	expect(value()).toBe("New York");
});

it("matches the same collapsed label whitespace shown by software paint", () => {
	const { tree, id, press, value } = fixture(
		'<option>a</option><option value="chosen" label=" New   York ">ignored</option>',
	);
	for (const key of ["n", "e", "w", "Space", "y"]) press(key);
	expect(value()).toBe("chosen");
	expect(describeControl(tree, id, 8)?.text).toBe("New York");
});

it("resets on blur even when the same select regains focus before another key", () => {
	const { actions, tree, id, other, press, value } = fixture();
	press("b");
	actions.focus.focus(tree.reference(other));
	actions.focus.focus(tree.reference(id));
	press("g");
	expect(value()).toBe("d");
});

it("resets when a focused select is detached and reinserted", () => {
	const { actions, tree, id, press, value } = fixture();
	press("b");
	const parent = tree.get(id).parent as number;
	tree.remove(id);
	tree.append(parent, id);
	actions.focus.focus(tree.reference(id));
	press("g");
	expect(value()).toBe("d");
});

it.each(["focus", "disable", "remove"])(
	"keypress-time %s suppresses the old target's default",
	(mode) => {
		const { actions, tree, id, other, press, value } = fixture();
		actions.events.addEventListener(id, "keypress", () => {
			if (mode === "focus") actions.focus.focus(tree.reference(other));
			else if (mode === "disable") tree.setAttribute(id, "disabled", "");
			else tree.remove(id);
		});
		press("b");
		expect(value()).toBe("a");
	},
);

it("reads live labels after keypress callbacks", () => {
	const { actions, tree, id, press, value } = fixture();
	actions.events.addEventListener(id, "keypress", () =>
		tree.setAttribute(selectOptions(tree, id)[3].id, "label", "Orange"),
	);
	press("o");
	expect(value()).toBe("d");
});

it("retains input-listener changes and does not commit a second change on blur", () => {
	const { actions, tree, id, other, press, value, calls } = fixture();
	actions.events.addEventListener(id, "input", () =>
		tree.setOptionSelected(selectOptions(tree, id)[3].id, true),
	);
	press("b");
	expect(value()).toBe("d");
	actions.focus.focus(tree.reference(other));
	expect(calls.filter((call) => call.startsWith("change:"))).toEqual([
		"change:d",
	]);
});

it("fails multiple-select typeahead without collapsing selected options", () => {
	const { tree, id, press } = fixture(
		"<option selected>a</option><option selected>b</option>",
		"multiple",
	);
	expect(() => press("b")).toThrow("Multiple-select keyboard");
	expect(selectedOptions(tree, id)).toHaveLength(2);
});

it("uses existing single-listbox semantics without claiming its painting", () => {
	const { press, value } = fixture(undefined, 'size="4"');
	press("g");
	expect(value()).toBe("d");
});

it("bounds accumulated prefixes and recovers after expiration", () => {
	const { press, advance, value } = fixture();
	for (let index = 0; index < selectTypeaheadLimits.maxPrefixCodeUnits; index++)
		press("a");
	expect(() => press("b")).toThrow("prefix limit");
	expect(value()).toBe("a");
	advance(1001);
	press("b");
	expect(value()).toBe("b");
});

it("retains the existing option-count bound", () => {
	const { press } = fixture("<option>a</option>".repeat(5001));
	expect(() => press("z")).toThrow("option limit");
});

it.each(["individual", "aggregate"])(
	"bounds %s scanned label text before selection changes",
	(mode) => {
		const options =
			mode === "individual"
				? `<option>${"x".repeat(4097)}</option>`
				: `<option>${"x".repeat(4096)}</option>`.repeat(17);
		const { press, tree, id } = fixture(options);
		const before = selectedOptions(tree, id)[0].id;
		expect(() => press("z")).toThrow("label limit");
		expect(selectedOptions(tree, id)[0].id).toBe(before);
	},
);

it("rejects invalid timestamps and ignores backward time without corrupting the prefix", () => {
	const { tree, id } = fixture();
	const search = new SelectTypeahead(tree);
	const options = selectOptions(tree, id);
	expect(() =>
		search.find(id, "b", Number.NaN, options, options[0].id),
	).toThrow("time");
	expect(search.find(id, "b", 100, options, options[0].id)).toBe(options[1].id);
	expect(search.find(id, "g", 99, options, options[1].id)).toBeUndefined();
	expect(search.find(id, "l", 101, options, options[1].id)).toBe(options[1].id);
	tree.close();
	expect(search.active(id, 102)).toBe(false);
	expect(() => search.find(id, "a", 102, options, undefined)).toThrow("closed");
});

it("changes actual control pixels through native selectedness", () => {
	const { press, tree } = fixture();
	const before = rasterizeDocument(tree).image.pixels;
	press("b");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it("keeps asynchronous input/change ordering on the same default path", async () => {
	const { actions, calls } = fixture();
	await actions.keyboard.pressAsync("b");
	expect(calls).toEqual([
		"keydown:a",
		"keypress:a",
		"input:b",
		"change:b",
		"keyup:b",
	]);
});
