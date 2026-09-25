import { expect, it } from "vitest";
import { controlValue, selectedOptions } from "./controls.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";

function fixture(
	options = '<option value="a">Alpha</option><option value="b">Beta</option><option value="c">Gamma</option>',
	attributes = "",
) {
	const tree = parseHtmlDocument(
		`<select id="pick" ${attributes}>${options}</select><input id="other">`,
		"https://fixture.invalid/",
	);
	const actions = documentInteractions(tree);
	const query = new DocumentQueries(tree);
	const id = query.querySelector("#pick") as number;
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
		actions,
		id,
		calls,
		query,
		value: () => controlValue(tree, id),
		press: (key: string) => actions.keyboard.press(key),
	};
}

it.each(["ArrowDown", "ArrowRight"])(
	"%s moves to the next option and dispatches ordered notifications",
	(key) => {
		const { press, value, calls } = fixture();
		press(key);
		expect(value()).toBe("b");
		expect(calls).toEqual(["keydown:a", "input:b", "change:b", "keyup:b"]);
	},
);

it.each(["ArrowUp", "ArrowLeft"])("%s moves backwards", (key) => {
	const { press, value } = fixture();
	press("End");
	press(key);
	expect(value()).toBe("b");
});

it("Home and End skip disabled options and disabled optgroups", () => {
	const { press, value } = fixture(
		"<option disabled>x</option><option>a</option><optgroup disabled><option>b</option></optgroup><option>c</option><option disabled>y</option>",
	);
	press("End");
	expect(value()).toBe("c");
	press("ArrowUp");
	expect(value()).toBe("a");
	press("ArrowDown");
	expect(value()).toBe("c");
	press("Home");
	expect(value()).toBe("a");
});

it("does not wrap or notify at unchanged endpoints", () => {
	const { press, calls } = fixture();
	press("ArrowUp");
	press("Home");
	expect(calls).toEqual(["keydown:a", "keyup:a", "keydown:a", "keyup:a"]);
});

it.each(["ArrowDown", "ArrowUp", "Home", "End"])(
	"%s recovers from no selection",
	(key) => {
		const { press, tree, id, value } = fixture();
		tree.setSelectSelection(id, []);
		press(key);
		expect(value()).toBe(["ArrowDown", "Home"].includes(key) ? "a" : "c");
	},
);

it.each(["", "<option disabled>a</option>"])(
	"empty or wholly disabled options remain unchanged",
	(options) => {
		const { press, calls } = fixture(options);
		press("ArrowDown");
		press("End");
		expect(
			calls.filter(
				(call) => call.startsWith("input:") || call.startsWith("change:"),
			),
		).toEqual([]);
	},
);

it("uses option identity rather than duplicate values", () => {
	const { press, tree, id } = fixture(
		'<option value="x">First</option><option value="x">Second</option>',
	);
	const before = selectedOptions(tree, id)[0].id;
	press("ArrowDown");
	expect(selectedOptions(tree, id)[0].id).not.toBe(before);
});

it("keydown cancellation suppresses selection but still releases the key", () => {
	const { press, actions, id, calls, value } = fixture();
	actions.events.addEventListener(id, "keydown", (event) =>
		event.preventDefault(),
	);
	expect(press("ArrowDown").canceled).toBe(true);
	expect(value()).toBe("a");
	expect(calls).toEqual(["keydown:a", "keyup:a"]);
});

it.each(["disabled", "removed", "focus"])(
	"does not change the old select after keydown %s",
	(mode) => {
		const { press, actions, tree, id, query, value } = fixture();
		actions.events.addEventListener(id, "keydown", () => {
			if (mode === "disabled") tree.setAttribute(id, "disabled", "");
			else if (mode === "removed") tree.remove(id);
			else
				actions.focus.focus(
					tree.reference(query.querySelector("#other") as number),
				);
		});
		press("ArrowDown");
		expect(value()).toBe("a");
	},
);

it("observes options and selection changed in keydown", () => {
	const { press, actions, tree, id, value } = fixture();
	actions.events.addEventListener(id, "keydown", () =>
		tree.setOptionSelected(tree.get(id).children[1], true),
	);
	press("ArrowDown");
	expect(value()).toBe("c");
});

it("input and change are noncancelable with correct composed flags", () => {
	const { press, actions, id, value } = fixture();
	const flags: unknown[] = [];
	for (const type of ["input", "change"])
		actions.events.addEventListener(id, type, (event) => {
			flags.push([event.type, event.bubbles, event.cancelable, event.composed]);
			event.preventDefault();
		});
	press("ArrowDown");
	expect(flags).toEqual([
		["input", true, false, true],
		["change", true, false, false],
	]);
	expect(value()).toBe("b");
});

it("does not overwrite listener mutations or emit another change on blur", () => {
	const { press, actions, tree, id, calls, value } = fixture();
	actions.events.addEventListener(id, "input", () =>
		tree.setOptionSelected(tree.get(id).children[2], true),
	);
	press("ArrowDown");
	press("Tab");
	expect(value()).toBe("c");
	expect(calls.filter((call) => call.startsWith("change:"))).toEqual([
		"change:c",
	]);
});

it("held repeat moves once per down and keyup does not change selection", () => {
	const { actions, value } = fixture();
	actions.keyboard.down("ArrowDown");
	expect(value()).toBe("b");
	actions.keyboard.down("ArrowDown");
	expect(value()).toBe("c");
	actions.keyboard.up("ArrowDown");
	expect(value()).toBe("c");
});

it.each(["Control+ArrowDown", "Meta+ArrowDown", "Alt+ArrowDown"])(
	"%s delivers a shortcut without pretending to open a popup",
	(key) => {
		const { press, value } = fixture();
		press(key);
		expect(value()).toBe("a");
	},
);

it.each(["ArrowDown", "Home", "End"])(
	"multiple selection rejects %s before changing state",
	(key) => {
		const { press, value } = fixture(undefined, "multiple");
		expect(() => press(key)).toThrow("Multiple-select keyboard");
		expect(value()).toBe("");
	},
);

it.each(["Enter", "Space"])("unsupported popup %s fails explicitly", (key) => {
	const { press, value, calls } = fixture();
	expect(() => press(key)).toThrow("popup is not implemented");
	expect(value()).toBe("a");
	expect(calls.at(-1)).toBe("keyup:a");
});

it("bounds option scanning before mutation", () => {
	const { press, value } = fixture("<option>a</option>".repeat(5001));
	expect(() => press("End")).toThrow("option limit");
	expect(value()).toBe("a");
});

it("selection updates real software-control pixels", () => {
	const { press, tree } = fixture();
	const before = rasterizeDocument(tree).image.pixels;
	press("ArrowDown");
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it("async actions deliver callbacks in the same native order", async () => {
	const { actions, calls } = fixture();
	await actions.keyboard.pressAsync("ArrowDown");
	expect(calls).toEqual(["keydown:a", "input:b", "change:b", "keyup:b"]);
});

it("single-select listbox semantics work independently of unsupported listbox painting", () => {
	const { press, value } = fixture(undefined, 'size="4"');
	press("Home");
	press("Shift+ArrowDown");
	expect(value()).toBe("b");
});

it("canceled unsupported keys do not raise a default-action failure", () => {
	const { press, actions, id, value } = fixture();
	actions.events.addEventListener(id, "keydown", (event) =>
		event.preventDefault(),
	);
	expect(press("Enter").canceled).toBe(true);
	expect(value()).toBe("a");
});
