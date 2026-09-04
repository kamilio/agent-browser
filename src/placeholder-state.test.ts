import { afterEach, expect, it } from "vitest";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlShowsPlaceholder, controlValue } from "./controls.js";
import { initialPaintStyle } from "./css-paint.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(markup = '<input id="target" placeholder="Hint">', css = "") {
	const tree = parseHtmlDocument(
		`<style>${css}</style>${markup}`,
		"https://fixture.invalid/placeholder",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const value = queries.querySelector(selector);
		if (value === null) throw new Error(`Missing ${selector}`);
		return value;
	};
	const target = id("#target");
	return {
		tree,
		queries,
		id,
		target,
		actions: documentInteractions(tree),
		styles: documentStyles(tree),
	};
}

it.each([
	"text",
	"search",
	"url",
	"tel",
	"email",
	"password",
	"number",
	"",
	"unknown",
	"TEXT",
])("shares empty-value placeholder state for input type %s", (type) => {
	const { tree, queries, target } = fixture(
		`<input id="target" type="${type}" placeholder="Hint">`,
	);
	expect(controlShowsPlaceholder(tree, target)).toBe(true);
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	expect(describeControl(tree, target, 8)).toMatchObject({
		placeholder: true,
		text: "Hint",
	});
	tree.setControl(target, { value: "42" });
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
	expect(describeControl(tree, target, 8)?.placeholder).toBe(false);
});

it.each([
	"hidden",
	"checkbox",
	"radio",
	"range",
	"color",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
	"file",
	"submit",
	"reset",
	"button",
	"image",
])("does not assign placeholder state to input type %s", (type) => {
	const { tree, queries, target } = fixture(
		`<input id="target" type="${type}" placeholder="Hint">`,
	);
	expect(controlShowsPlaceholder(tree, target)).toBe(false);
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
});

it.each(["div", "button", "select", "option", "progress"])(
	"does not assign placeholder state to %s",
	(tag) => {
		const { tree, queries, target } = fixture(
			`<${tag} id="target" placeholder="Hint"></${tag}>`,
		);
		expect(controlShowsPlaceholder(tree, target)).toBe(false);
		expect(queries.matches(target, ":placeholder-shown")).toBe(false);
	},
);

it.each([
	["", false],
	["placeholder", true],
	['placeholder=""', true],
	['placeholder="placeholder"', true],
	['placeholder value="value"', false],
	['placeholder="" value="value"', false],
	['placeholder="placeholder" value="value"', false],
] as const)(
	"matches the WPT attribute/value case %s",
	(attributes, expected) => {
		const { queries, target, styles, id } = fixture(
			`<input id="target" ${attributes}><span id="result">Result</span>`,
			`${expected ? ":placeholder-shown" : ":not(:placeholder-shown)"} + span { background-color:green }`,
		);
		expect(queries.matches(target, ":placeholder-shown")).toBe(expected);
		expect(styles.paint(id("#result"))["background-color"]).toEqual([
			0, 128, 0, 255,
		]);
	},
);

it.each(["input", "textarea"])(
	"tracks empty placeholder reflection and value changes for %s",
	(tag) => {
		const { tree, queries, target } = fixture(
			`<${tag} id="target" placeholder="FAIL"></${tag}>`,
		);
		tree.setAttribute(target, "placeholder", "");
		expect(queries.matches(target, ":placeholder-shown")).toBe(true);
		expect(describeControl(tree, target, 8)).toMatchObject({
			placeholder: true,
			text: "",
		});
		tree.setControl(target, { value: "No RED" });
		expect(queries.matches(target, ":placeholder-shown")).toBe(false);
		tree.setControl(target, { value: "" });
		expect(queries.matches(target, ":placeholder-shown")).toBe(true);
		tree.removeAttribute(target, "placeholder");
		expect(queries.matches(target, ":placeholder-shown")).toBe(false);
	},
);

it("invalidates type changes from hidden to the default text type", () => {
	const { tree, queries, target, styles, id } = fixture(
		'<input id="target" type="hidden" placeholder="text"><span id="result">Result</span>',
		"span { background-color:red } :placeholder-shown + span { background-color:green }",
	);
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
	expect(styles.paint(id("#result"))["background-color"]).toEqual([
		255, 0, 0, 255,
	]);
	tree.setAttribute(target, "type", "");
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	expect(styles.paint(id("#result"))["background-color"]).toEqual([
		0, 128, 0, 255,
	]);
	tree.setAttribute(target, "type", "checkbox");
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
});

it.each([
	["text", "\r\n", true],
	["text", " ", false],
	["email", " \t\n", true],
	["url", " \t\n", true],
	["number", "invalid", true],
	["number", "0", false],
] as const)(
	"uses sanitized %s value %j, not the raw attribute",
	(type, value, expected) => {
		const { tree, queries, target } = fixture(
			`<input id="target" type="${type}" placeholder="Hint">`,
		);
		tree.setAttribute(target, "value", value);
		expect(queries.matches(target, ":placeholder-shown")).toBe(expected);
		expect(describeControl(tree, target, 8)?.placeholder).toBe(expected);
	},
);

it("uses textarea text defaults until its live value is dirty, then resets correctly", () => {
	const { tree, queries, target, actions, id } = fixture(
		'<form id="form"><textarea id="target" placeholder="Hint">default</textarea></form>',
	);
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
	tree.setTextContent(target, "");
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	actions.fill(tree.reference(target), "typed");
	tree.setTextContent(target, "new default");
	expect(controlValue(tree, target)).toBe("typed");
	actions.fill(tree.reference(target), "");
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	actions.forms.reset(tree.reference(id("#form")));
	expect(controlValue(tree, target)).toBe("new default");
	expect(queries.matches(target, ":placeholder-shown")).toBe(false);
});

it("keeps hints while focused, disabled or readonly without making controls editable", () => {
	const { tree, queries, target, actions } = fixture();
	actions.focus.focus(tree.reference(target));
	expect(queries.matches(target, ":focus:placeholder-shown")).toBe(true);
	expect(describeControl(tree, target, 8)?.placeholder).toBe(true);
	tree.setAttribute(target, "readonly", "");
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	expect(() => actions.fill(tree.reference(target), "blocked")).toThrow();
	tree.setAttribute(target, "disabled", "");
	expect(queries.matches(target, ":disabled:placeholder-shown")).toBe(true);
});

it("supports scoped, relational and detached queries without caching matching results", () => {
	const { tree, queries, target, id } = fixture(
		'<main id="parent"><input id="target" placeholder="Hint"><input id="other"></main>',
	);
	const saved = queries.querySelectorAll(":placeholder-shown");
	expect(queries.querySelector("main:has(> :placeholder-shown)")).toBe(
		id("#parent"),
	);
	expect(
		queries.querySelectorAll(":scope > :is(:placeholder-shown)", id("#parent")),
	).toEqual([target]);
	expect(queries.closest(target, ":where(:placeholder-shown)")).toBe(target);
	expect(
		queries.querySelector("input:nth-child(1 of :placeholder-shown)"),
	).toBe(target);
	tree.remove(target);
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	expect(queries.querySelectorAll(":placeholder-shown")).toEqual([]);
	expect(saved).toEqual([target]);
	tree.append(id("#parent"), target);
	expect(queries.querySelectorAll(":placeholder-shown")).toEqual([target]);
});

it("refreshes state-only caches while rebuilding for value and placeholder changes", () => {
	const { tree, queries, target } = fixture();
	const selectors = [
		":placeholder-shown",
		":placeholder-shown:hover",
		":not(:placeholder-shown)",
	];
	const compare = () => {
		const fresh = new DocumentQueries(tree);
		try {
			for (const selector of selectors)
				expect(queries.querySelectorAll(selector)).toEqual(
					fresh.querySelectorAll(selector),
				);
		} finally {
			fresh.close();
		}
	};
	compare();
	const before = queries.metrics().structuralBuilds;
	tree.setPointerState(target, null);
	compare();
	expect(queries.metrics().structuralBuilds).toBe(before);
	tree.setControl(target, { value: "typed" });
	compare();
	expect(queries.metrics().structuralBuilds).toBe(before + 1);
	tree.setControl(target, { value: "" });
	tree.removeAttribute(target, "placeholder");
	compare();
	expect(queries.metrics().structuralBuilds).toBe(before + 2);
});

it.each(["input", "textarea"])(
	"normalizes %s hint newlines without changing its attribute or submitted value",
	(tag) => {
		const { tree, target } = fixture(
			`<${tag} id="target" placeholder="Hint"></${tag}>`,
		);
		tree.setAttribute(target, "placeholder", "first\r\nsecond\rthird\nlast");
		const control = describeControl(tree, target, 8);
		expect(control?.text).toBe(
			tag === "textarea"
				? "first\nsecond\nthird\nlast"
				: "firstsecondthirdlast",
		);
		expect(tree.get(target).attributes.placeholder).toBe(
			"first\r\nsecond\rthird\nlast",
		);
		expect(controlValue(tree, target)).toBe("");
		if (!control) throw new Error("Missing rendered control");
		expect(() =>
			rasterizeControl(
				control,
				control.width,
				control.height,
				initialPaintStyle,
				() => {},
			),
		).not.toThrow();
	},
);

it("keeps the raw hint allocation limit even when normalization removes newlines", () => {
	const { tree, target, queries } = fixture();
	tree.setAttribute(target, "placeholder", "\r".repeat(4097));
	expect(queries.matches(target, ":placeholder-shown")).toBe(true);
	expect(() => describeControl(tree, target, 8)).toThrow(
		"Control text limit exceeded",
	);
});

it("preserves selector work and output limits and releases owners on close", () => {
	const { tree, queries, target } = fixture(
		'<input id="target" placeholder><input placeholder>',
	);
	const bounded = new DocumentQueries(tree, { maxResults: 1 });
	expect(() => bounded.querySelectorAll(":placeholder-shown")).toThrow();
	bounded.close();
	const workBounded = new DocumentQueries(tree, { maxWork: 1 });
	expect(() => workBounded.querySelectorAll(":placeholder-shown")).toThrow();
	workBounded.close();
	tree.close();
	expect(queries.metrics().closed).toBe(true);
	expect(queries.metrics().indexedNodes).toBe(0);
	expect(() => queries.matches(target, ":placeholder-shown")).toThrow();
});

it.each([
	":placeholder-shown",
	":is(:placeholder-shown)",
	":where(:placeholder-shown)",
	":not(:not(:placeholder-shown))",
	String.raw`:place\68 older-shown`,
	":nth-child(1 of :placeholder-shown)",
])("invalidates styles for live values through %s", (selector) => {
	const { tree, styles, target, actions, id } = fixture(
		'<input id="target" placeholder><span id="result">Label</span>',
		`span { background-color:red } input${selector} + span { background-color:green }`,
	);
	expect(styles.paint(id("#result"))["background-color"]).toEqual([
		0, 128, 0, 255,
	]);
	tree.setControl(target, { value: "filled" });
	expect(styles.paint(id("#result"))["background-color"]).toEqual([
		255, 0, 0, 255,
	]);
	actions.fill(tree.reference(target), "");
	expect(styles.paint(id("#result"))["background-color"]).toEqual([
		0, 128, 0, 255,
	]);
});

it("invalidates ancestor styles through :has on textarea values and reset", () => {
	const { tree, target, styles, id, actions } = fixture(
		'<form id="form"><textarea id="target" placeholder></textarea></form>',
		"form { background-color:red } form:has(:placeholder-shown) { background-color:green }",
	);
	const form = id("#form");
	expect(styles.paint(form)["background-color"]).toEqual([0, 128, 0, 255]);
	tree.setControl(target, { value: "filled" });
	expect(styles.paint(form)["background-color"]).toEqual([255, 0, 0, 255]);
	actions.forms.reset(tree.reference(form));
	expect(styles.paint(form)["background-color"]).toEqual([0, 128, 0, 255]);
});

it("retains ordinary value-only style reuse when no selectors depend on live values", () => {
	const { tree, target, styles } = fixture(
		'<input id="target" placeholder data-example=":placeholder-shown">',
		'[data-example=":placeholder-shown"] { background-color:green }',
	);
	const original = styles.get(target);
	tree.setControl(target, { value: "filled" });
	expect(styles.get(target)).toBe(original);
});

it("remembers parsed value dependencies across selector cache eviction and clears on close", () => {
	const { tree } = fixture();
	const queries = new DocumentQueries(tree, { maxCachedSelectors: 1 });
	expect(queries.metrics().controlValueDependent).toBe(false);
	queries.querySelector(":placeholder-shown");
	queries.querySelector("input");
	expect(queries.metrics()).toMatchObject({
		cachedSelectors: 1,
		controlValueDependent: true,
	});
	queries.close();
	expect(queries.metrics().controlValueDependent).toBe(false);
});

it.each(["hidden", "HIDDEN", "HiDdEn"])(
	"enforces non-rendering for %s inputs despite author-important display",
	(type) => {
		const { tree, target, styles, queries } = fixture(
			`<input id="target" type="${type}" placeholder style="display:flex!important"><span>Label</span>`,
			"input { display:block!important }",
		);
		expect(styles.get(target)).toMatchObject({
			display: "none",
			displayed: false,
		});
		expect(queries.matches(target, ":placeholder-shown")).toBe(false);
		expect(documentGeometry(tree).getClientRects(target)).toEqual([]);
		expect(rasterizeDocument(tree).metrics.paintedControls).toBe(0);
		tree.removeAttribute(target, "style");
		tree.setAttribute(target, "type", "text");
		expect(styles.get(target)).toMatchObject({
			display: "block",
			displayed: true,
		});
		expect(queries.matches(target, ":placeholder-shown")).toBe(true);
		expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
	},
);
