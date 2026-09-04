import { afterEach, expect, it, vi } from "vitest";
import { controlValue, optionLabel, selectOptions } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { selectKeyboardCapabilities } from "./select-keyboard.js";
import { SelectTypeahead, selectTypeaheadLimits } from "./select-typeahead.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
});

function fixture(
	options = "<option value=a>Alpha</option><option value=b><b>Beta</b></option><option value=c>Blue</option>",
	attributes = "",
) {
	let now = 100;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	const tree = parseHtmlDocument(
		`<!doctype html><select ${attributes}><button><selectedcontent></selectedcontent></button>${options}</select><input>`,
		"https://example.test/",
	);
	trees.push(tree);
	const query = new DocumentQueries(tree);
	const find = (selector: string) => {
		const id = query.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	};
	const select = find("select");
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(select));
	return {
		tree,
		find,
		select,
		actions,
		press: (key: string) => actions.keyboard.press(key),
		value: () => controlValue(tree, select),
		content: () => serializeHtml(tree, find("selectedcontent")),
		advance: (amount: number) => {
			now += amount;
		},
	};
}

it("refreshes selectedcontent before keyboard input and change notifications", () => {
	const { actions, select, press, content } = fixture();
	const observed: string[] = [];
	for (const type of ["input", "change"])
		actions.events.addEventListener(select, type, () =>
			observed.push(content()),
		);
	press("ArrowDown");
	expect(observed).toEqual(["<b>Beta</b>", "<b>Beta</b>"]);
});

it("refreshes selectedcontent after a typeahead match", () => {
	const { press, content } = fixture();
	press("b");
	expect(content()).toBe("<b>Beta</b>");
});

it("matches displayed text when an option label attribute is empty", () => {
	const { press, value } = fixture(
		"<option value=a>Alpha</option><option label='' value=b>Beta</option>",
	);
	press("b");
	expect(value()).toBe("b");
});

it.each(["ArrowDown", "ArrowRight"])(
	"%s selects the next enabled option",
	(key) => {
		const { press, value, content } = fixture();
		press(key);
		expect(value()).toBe("b");
		expect(content()).toBe("<b>Beta</b>");
	},
);

it.each(["ArrowUp", "ArrowLeft"])(
	"%s selects the previous enabled option",
	(key) => {
		const { press, value, content } = fixture();
		press("End");
		press(key);
		expect(value()).toBe("b");
		expect(content()).toBe("<b>Beta</b>");
	},
);

it("Home and End skip disabled endpoints and groups through rich wrappers", () => {
	const { press, value, content } = fixture(
		"<option disabled>X</option><option>A</option><optgroup disabled><div><option>B</option></div></optgroup><option>C</option><option disabled>Y</option>",
	);
	press("End");
	expect(value()).toBe("C");
	press("ArrowUp");
	expect(value()).toBe("A");
	press("Home");
	expect(content()).toBe("A");
});

it("does not wrap or refresh copies when navigation cannot change selection", () => {
	const { tree, find, select, press, content, actions } = fixture();
	const original = [...tree.get(find("selectedcontent")).children];
	const input = vi.fn();
	actions.events.addEventListener(select, "input", input);
	press("Home");
	press("ArrowUp");
	expect(input).not.toHaveBeenCalled();
	expect(tree.get(find("selectedcontent")).children).toEqual(original);
	expect(content()).toBe("Alpha");
});

it.each(["ArrowDown", "ArrowUp", "Home", "End"])(
	"%s starts from an explicit empty selection",
	(key) => {
		const { tree, select, press, value } = fixture();
		tree.setSelectSelection(select, []);
		press(key);
		expect(value()).toBe(key === "ArrowDown" || key === "Home" ? "a" : "c");
	},
);

it("emits ordered ordinary input/change events without text-edit notifications", () => {
	const { select, actions, press, value } = fixture();
	const calls: unknown[] = [];
	for (const type of [
		"keydown",
		"keypress",
		"beforeinput",
		"input",
		"change",
		"keyup",
	])
		actions.events.addEventListener(select, type, (event) =>
			calls.push([
				type,
				value(),
				event.bubbles,
				event.cancelable,
				event.composed,
			]),
		);
	press("ArrowDown");
	expect(calls).toEqual([
		["keydown", "a", true, true, true],
		["input", "b", true, false, true],
		["change", "b", true, false, false],
		["keyup", "b", true, true, true],
	]);
});

it.each(["keydown", "keypress"])(
	"canceled %s suppresses typeahead, cloning and selection",
	(type) => {
		const { select, actions, press, value, content } = fixture();
		actions.events.addEventListener(select, type, (event) =>
			event.preventDefault(),
		);
		press("b");
		expect(value()).toBe("a");
		expect(content()).toBe("Alpha");
	},
);

it("honors canceled navigation keydown", () => {
	const { select, actions, press, value } = fixture();
	actions.events.addEventListener(select, "keydown", (event) =>
		event.preventDefault(),
	);
	press("End");
	expect(value()).toBe("a");
});

it.each(["disabled", "detached", "focus"])(
	"does not act on the old select after keydown %s",
	(mode) => {
		const { tree, select, actions, press, value, find } = fixture();
		actions.events.addEventListener(select, "keydown", () => {
			if (mode === "disabled") tree.setAttribute(select, "disabled", "");
			else if (mode === "detached") tree.remove(select);
			else actions.focus.focus(tree.reference(find("input")));
		});
		press("ArrowDown");
		expect(value()).toBe("a");
	},
);

it.each(["Control+ArrowDown", "Meta+ArrowDown", "Alt+ArrowDown", "Control+A"])(
	"%s does not emulate a picker or an edit",
	(key) => {
		const { press, value } = fixture();
		press(key);
		expect(value()).toBe("a");
	},
);

it("reads option and selection changes made by keydown handlers", () => {
	const { tree, select, actions, press, value, find } = fixture();
	actions.events.addEventListener(select, "keydown", () =>
		tree.setOptionSelected(find("[value=b]"), true),
	);
	press("ArrowDown");
	expect(value()).toBe("c");
});

it("does not overwrite selection mutations made by input handlers", () => {
	const { tree, select, actions, press, value, content, find } = fixture();
	const change: string[] = [];
	actions.events.addEventListener(select, "input", () =>
		tree.setOptionSelected(find("[value=c]"), true),
	);
	actions.events.addEventListener(select, "change", () =>
		change.push(`${value()}:${content()}`),
	);
	press("ArrowDown");
	expect(change).toEqual(["c:<b>Beta</b>"]);
});

it("extends and expires typeahead prefixes at the declared boundary", () => {
	const { press, advance, value } = fixture();
	press("b");
	advance(1000);
	press("l");
	expect(value()).toBe("c");
	advance(1001);
	press("a");
	expect(value()).toBe("a");
});

it("cycles repeated initials through enabled matches", () => {
	const { press, value } = fixture();
	press("b");
	expect(value()).toBe("b");
	press("b");
	expect(value()).toBe("c");
	press("b");
	expect(value()).toBe("b");
});

it("does not turn a failed multi-character prefix into a different single-letter search", () => {
	const { press, value } = fixture();
	press("z");
	press("b");
	expect(value()).toBe("a");
});

it("searches displayed labels rather than values or copied child text", () => {
	const { press, value, content } = fixture(
		"<option value=a>Alpha</option><option value=z label=Beta><i>Different</i></option>",
	);
	press("b");
	expect(value()).toBe("z");
	expect(content()).toBe("<i>Different</i>");
});

it.each(["Éclair", "E\u0301clair", "éCLAIR"])(
	"uses the declared accent/case folding profile for %s",
	(label) => {
		const { press, value } = fixture(
			`<option value=a>Alpha</option><option value=e label='${label}'>Different</option>`,
		);
		press("e");
		expect(value()).toBe("e");
	},
);

it("accepts spaces inside an active typeahead prefix", () => {
	const { press, value } = fixture(
		"<option value=a>Alpha</option><option value=n label=' New   York '>City</option>",
	);
	for (const key of ["n", "e", "w", "Space", "y"]) press(key);
	expect(value()).toBe("n");
});

it("resets typeahead after a focus round trip", () => {
	const { tree, select, actions, press, value, find } = fixture();
	press("b");
	actions.focus.focus(tree.reference(find("input")));
	actions.focus.focus(tree.reference(select));
	press("a");
	expect(value()).toBe("a");
});

it.each(["", "<option disabled>X</option>"])(
	"does not notify for an empty or disabled-only list %j",
	(options) => {
		const { actions, select, press, value } = fixture(options);
		const input = vi.fn();
		actions.events.addEventListener(select, "input", input);
		press("End");
		press("x");
		expect(input).not.toHaveBeenCalled();
		expect(value()).toBe("");
	},
);

it.each(["ArrowDown", "Home", "b"])(
	"rejects multiple-select %s before mutation",
	(key) => {
		const { press, value } = fixture(undefined, "multiple");
		expect(() => press(key)).toThrow("Multiple-select keyboard");
		expect(value()).toBe("");
	},
);

it.each(["Enter", "Space"])(
	"reports unsupported popup %s while still sending keyup",
	(key) => {
		const { actions, select, press, value } = fixture();
		const keyup = vi.fn();
		actions.events.addEventListener(select, "keyup", keyup);
		expect(() => press(key)).toThrow("popup is not implemented");
		expect(keyup).toHaveBeenCalledTimes(1);
		expect(value()).toBe("a");
	},
);

it("enforces the option-count limit before selecting", () => {
	const { press, value } = fixture(
		"<option>A</option>".repeat(selectKeyboardCapabilities.maxOptions + 1),
	);
	expect(() => press("End")).toThrow("option limit");
	expect(value()).toBe("A");
});

it("enforces the typeahead prefix bound and recovers after expiry", () => {
	const { press, advance, value } = fixture();
	for (let index = 0; index < selectTypeaheadLimits.maxPrefixCodeUnits; index++)
		press("z");
	expect(() => press("z")).toThrow("prefix limit");
	advance(1001);
	press("b");
	expect(value()).toBe("b");
});

it("bounds individual displayed labels before matching", () => {
	const { press, value } = fixture(
		`<option value=a>Alpha</option><option value=b label='${"b".repeat(selectTypeaheadLimits.maxLabelCodeUnits + 1)}'>Beta</option>`,
	);
	expect(() => press("b")).toThrow("label limit");
	expect(value()).toBe("a");
});

it("bounds cumulative label scanning", () => {
	const options = `<option label='${"b".repeat(4096)}'>Beta</option>`.repeat(
		17,
	);
	const { press, value } = fixture(`<option value=a>Alpha</option>${options}`);
	expect(() => press("z")).toThrow("label limit");
	expect(value()).toBe("a");
});

it("rejects invalid timestamps and ignores backwards time without changing selection", () => {
	const { tree, select, value } = fixture();
	const typeahead = new SelectTypeahead(tree);
	const options = selectOptions(tree, select);
	expect(() =>
		typeahead.find(select, "b", Number.NaN, options, options[0].id),
	).toThrow("Invalid typeahead time");
	expect(typeahead.find(select, "b", 100, options, options[0].id)).toBe(
		options[1].id,
	);
	expect(
		typeahead.find(select, "b", 99, options, options[0].id),
	).toBeUndefined();
	expect(value()).toBe("a");
});

it("supports asynchronous keyboard delivery with cloned content before input", async () => {
	const { actions, select, content } = fixture();
	const values: string[] = [];
	actions.events.addEventListener(select, "input", async () => {
		values.push(content());
	});
	await actions.keyboard.pressAsync("ArrowDown");
	expect(values).toEqual(["<b>Beta</b>"]);
});

it("keeps displayed-label fallback distinct from an explicitly nonempty label", () => {
	const { tree, find } = fixture(
		"<option label=''> Text <script>hidden</script> body </option>",
	);
	const option = find("option");
	expect(optionLabel(tree, option)).toBe("Text body");
	tree.setAttribute(option, "label", " ");
	expect(optionLabel(tree, option)).toBe(" ");
});

it("rejects keyboard actions after the owner closes", () => {
	const { tree, press } = fixture();
	tree.close();
	expect(() => press("ArrowDown")).toThrow("closed");
});
