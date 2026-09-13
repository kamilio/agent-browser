import { afterEach, expect, it } from "vitest";
import { describeControl, rasterizeControl } from "./control-rendering.js";
import { controlChecked } from "./controls.js";
import { initialPaintStyle } from "./css-paint.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
function fixture(html = '<button id="target">Go</button>', css = "") {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0}input,button,textarea,select{font-size:8px}${css}</style>${html}`,
		"https://fixture.invalid/controls",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(300, 160);
	const id = new DocumentQueries(tree).querySelector("#target") as number;
	return {
		tree,
		id,
		geometry: documentGeometry(tree),
		actions: documentInteractions(tree),
		descriptor: () => describeControl(tree, id, 8),
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("lays out and paints a real default button with matching pointer geometry", () => {
	const { tree, id, geometry, actions, descriptor } = fixture();
	expect(descriptor()).toMatchObject({
		kind: "button",
		text: "Go",
		width: 24,
		height: 16,
	});
	expect(geometry.getBoundingClientRect(id)).toMatchObject({
		width: 24,
		height: 16,
	});
	const raster = rasterizeDocument(tree);
	expect(raster.metrics).toMatchObject({
		paintedControls: 1,
		paintedImages: 0,
	});
	const rect = geometry.getBoundingClientRect(id);
	expect(actions.mouse.move(rect.x + 2, rect.y + 2).reference).toBe(
		tree.reference(id),
	);
	actions.mouse.down();
	expect(actions.focus.active()).toBe(id);
	actions.mouse.up();
});

it.each([
	"text",
	"search",
	"email",
	"url",
	"tel",
	"password",
	"number",
	"submit",
	"reset",
	"button",
	"checkbox",
	"radio",
	"file",
])("renders input type %s without an image resource", (type) => {
	const { tree } = fixture(`<input id="target" type="${type}" value="12">`);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		paintedControls: 1,
		paintedImages: 0,
	});
});

it("uses independent control dimensions instead of stretching an intrinsic image ratio", () => {
	const { geometry, id } = fixture(undefined, "button{width:100px}");
	expect(geometry.getBoundingClientRect(id)).toMatchObject({
		width: 100,
		height: 16,
	});
});

it("honors padding, border-box, min/max and percent widths", () => {
	const { geometry, id } = fixture(
		undefined,
		"button{width:50%;max-width:80px;height:30px;padding:3px;box-sizing:border-box}",
	);
	expect(geometry.getBoundingClientRect(id)).toMatchObject({
		width: 80,
		height: 30,
	});
});

it("does not retain or rasterize the raw password value in formatting data", () => {
	const { tree, descriptor } = fixture(
		'<input id="target" type="password" value="secret-phrase">',
	);
	expect(descriptor()?.text).toBe("*************");
	expect(JSON.stringify(buildFormattingTree(tree))).not.toContain(
		"secret-phrase",
	);
	expect(JSON.stringify(rasterizeDocument(tree).layout)).not.toContain(
		"secret-phrase",
	);
});

it("updates text and focus appearance from live native control state", () => {
	const { tree, id, actions, descriptor } = fixture(
		'<input id="target" value="before">',
	);
	const before = rasterizeDocument(tree).image.pixels;
	actions.fill(tree.reference(id), "after");
	expect(descriptor()).toMatchObject({ text: "after", focused: true });
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
});

it.each(["checkbox", "radio"])(
	"a visible %s changes native state and pixels on mouse activation",
	(type) => {
		const { tree, id, actions, geometry } = fixture(
			`<input id="target" type="${type}">`,
		);
		const before = rasterizeDocument(tree).image.pixels;
		const rect = geometry.getBoundingClientRect(id);
		actions.mouse.move(rect.x + 3, rect.y + 3);
		actions.mouse.down();
		actions.mouse.up();
		expect(controlChecked(tree, id)).toBe(true);
		expect(rasterizeDocument(tree).image.pixels).not.toEqual(before);
	},
);

it("paints disabled and indeterminate state without changing control values", () => {
	const { tree, id, descriptor } = fixture(
		'<input id="target" type="checkbox" disabled>',
	);
	tree.setControl(id, { indeterminate: true });
	expect(descriptor()).toMatchObject({
		disabled: true,
		indeterminate: true,
		checked: false,
	});
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
	expect(controlChecked(tree, id)).toBe(false);
});

it("uses textarea rows/cols and live multiline content", () => {
	const { tree, descriptor } = fixture(
		'<textarea id="target" rows="3" cols="5">one\ntwo</textarea>',
	);
	expect(descriptor()).toMatchObject({
		kind: "textarea",
		width: 42,
		height: 32,
		text: "one\ntwo",
	});
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("sizes a single select for all option labels and paints the current selected label", () => {
	const { tree, id, descriptor, actions } = fixture(
		'<select id="target"><option value="one">A</option><option value="two">Longer</option></select>',
	);
	expect(descriptor()).toMatchObject({ kind: "select", text: "A", width: 60 });
	actions.select(tree.reference(id), ["two"]);
	expect(descriptor()).toMatchObject({ text: "Longer", width: 60 });
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it("renders placeholder text without making it the control value", () => {
	const { tree, id, descriptor } = fixture(
		'<input id="target" placeholder="Hint">',
	);
	expect(descriptor()).toMatchObject({ text: "Hint", placeholder: true });
	expect(tree.get(id).control.value).toBeUndefined();
});

it("normalizes ordinary indented option labels before measuring and painting", () => {
	const { tree, descriptor } = fixture(
		'<select id="target"><option>\n  Some   text\n</option></select>',
	);
	expect(descriptor()).toMatchObject({ text: "Some text", width: 78 });
	expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
});

it.each([
	'<input id="target" type="range">',
	'<select id="target" multiple><option>A</option></select>',
	'<button id="target" style="position:absolute"><span>Rich</span></button>',
])("keeps unsupported control profile explicit: %s", (html) => {
	const { tree } = fixture(html);
	expect(() => rasterizeDocument(tree)).toThrow();
});

it("bounds control text, aggregate formatting text, dimensions and raster allocation", () => {
	const { tree, id, descriptor } = fixture();
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 1 })).toThrow(
		"text limit",
	);
	const control = descriptor();
	if (!control) throw new Error("Missing control");
	expect(() =>
		rasterizeControl(control, 4097, 1, initialPaintStyle, () => {}),
	).toThrow("raster limit");
	expect(() =>
		rasterizeControl(control, 2048, 2048, initialPaintStyle, () => {}),
	).toThrow("raster limit");
	tree.setTextContent(id, "a".repeat(4097));
	expect(() => descriptor()).toThrow("text limit");
});

it("paints deterministic theme pixels and clips captions inside a small control", () => {
	const { descriptor } = fixture();
	const control = descriptor();
	if (!control) throw new Error("Missing control");
	let work = 0;
	const image = rasterizeControl(
		control,
		24,
		16,
		initialPaintStyle,
		(amount) => {
			work += amount;
		},
	);
	expect([...image.pixels.slice(0, 4)]).toEqual([96, 96, 96, 255]);
	expect([
		...image.pixels.slice((2 * 24 + 2) * 4, (2 * 24 + 2) * 4 + 4),
	]).toEqual([240, 240, 240, 255]);
	expect(work).toBeGreaterThan(24 * 16);
	expect(
		rasterizeControl(control, 2, 2, initialPaintStyle, () => {}).pixels,
	).toHaveLength(16);
});
