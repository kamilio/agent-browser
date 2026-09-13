import { afterEach, expect, it } from "vitest";
import { findClickPoint } from "./click-target.js";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { documentInteractions } from "./interactions.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const content = '<fieldset id="target"><div id="child"></div></fieldset>';
const baseCss =
	"html,body{margin:0;padding:0;font-size:8px;line-height:8px;background:white}#host{width:200px}fieldset{width:100px;margin:0;padding:3px 7px 11px 5px;border:2px solid red;background:white}#child{display:block;width:20px;height:10px;margin:0;background:blue}";

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(css = "", markup = content) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style><main id="host">${markup}</main>`,
		"https://fixture.invalid/fieldset-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(240, 160);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fieldset fixture ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const rect = (selector: string) =>
		geometry.getBoundingClientRect(id(selector));
	return { tree, queries, styles, id, geometry, rect };
}

function boxes(page: ReturnType<typeof fixture>, selector = "#target") {
	const layout = layoutDocument(page.tree);
	const formatting = layout.text.horizontal.formatting;
	const reference = page.tree.reference(page.id(selector));
	const outerNode = formatting.nodes.find((node) => node.ref === reference);
	if (!outerNode || typeof outerNode.fieldsetContent !== "number")
		throw new Error("Missing fieldset content ownership");
	const innerNode = formatting.nodes[outerNode.fieldsetContent];
	const outer = layout.boxes.find((box) => box.id === outerNode.id);
	const inner = layout.boxes.find((box) => box.id === innerNode.id);
	if (!outer || !inner) throw new Error("Missing fieldset layout boxes");
	return { layout, formatting, outerNode, innerNode, outer, inner };
}

it("keeps distinct fieldset/content boxes without duplicating DOM or public geometry", () => {
	const page = fixture();
	const revision = page.tree.revision;
	const source = serializeHtml(page.tree);
	const snapshot = snapshotDocument(page.tree);
	const { layout, formatting, outerNode, innerNode, outer, inner } =
		boxes(page);
	const reference = page.tree.reference(page.id("#target"));
	expect(formatting.issues).toEqual({});
	expect(outerNode).toMatchObject({
		kind: "block",
		display: "flow-root",
		ref: reference,
		independentContext: true,
		children: [innerNode.id],
	});
	expect(innerNode).toMatchObject({
		kind: "block",
		display: "flow-root",
		parent: outerNode.id,
		fieldsetOwner: outerNode.id,
		independentContext: true,
		box: { height: "100%" },
	});
	expect(innerNode.ref).toBeUndefined();
	expect(
		formatting.nodes.filter((node) => node.ref === reference),
	).toHaveLength(1);
	expect(layout.boxes.filter((box) => box.ref === reference)).toHaveLength(1);
	expect(outer).toMatchObject({
		paddingTop: 0,
		paddingRight: 0,
		paddingBottom: 0,
		paddingLeft: 0,
		contentWidth: 100,
		borderBoxWidth: 104,
		borderBoxHeight: 28,
	});
	expect(inner).toMatchObject({
		borderX: 2,
		borderY: 2,
		borderBoxWidth: 100,
		contentWidth: 88,
		paddingTop: 3,
		paddingRight: 7,
		paddingBottom: 11,
		paddingLeft: 5,
	});
	expect(page.styles.box(page.id("#target"))).toMatchObject({
		"padding-top": "3px",
		"padding-right": "7px",
		"padding-bottom": "11px",
		"padding-left": "5px",
	});
	expect(page.geometry.getClientRects(page.id("#target"))).toHaveLength(1);
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 104,
		height: 28,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 5,
		width: 20,
		height: 10,
	});
	expect(page.geometry.getUsedStyle(page.id("#target"))).toMatchObject({
		width: 100,
		"padding-top": 0,
		"padding-left": 0,
	});
	expect(page.tree.revision).toBe(revision);
	expect(serializeHtml(page.tree)).toBe(source);
	expect(snapshotDocument(page.tree)).toEqual(snapshot);
});

it.each(["block", "flow-root", "inline", "inline-block"])(
	"uses the correct outer formatting level without changing computed display:%s",
	(display) => {
		const page = fixture(`#target{display:${display}}`);
		const { outerNode, innerNode } = boxes(page);
		const inline = display.startsWith("inline");
		expect(page.styles.get(page.id("#target")).display).toBe(display);
		expect(outerNode).toMatchObject({
			display: inline ? "inline-block" : "flow-root",
			level: inline ? "inline" : "block",
		});
		expect(innerNode.level).toBe("block");
		const outer = page.rect("#target");
		expect(outer).toMatchObject({ width: 104, height: 28 });
		expect(page.rect("#child")).toMatchObject({
			x: outer.x + 7,
			y: outer.y + 5,
		});
	},
);

it("resolves all percentage padding against the original containing block", () => {
	const page = fixture("#target{padding:10%}");
	const { inner } = boxes(page);
	expect(inner).toMatchObject({
		borderBoxWidth: 100,
		contentWidth: 60,
		paddingTop: 20,
		paddingRight: 20,
		paddingBottom: 20,
		paddingLeft: 20,
	});
	expect(page.rect("#child")).toMatchObject({ x: 22, y: 22 });
	expect(page.rect("#target")).toMatchObject({ width: 104, height: 54 });
});

it("uses native min-content width to overflow a narrow parent until explicitly reset", () => {
	const page = fixture(
		"#host{width:30px}#target{width:auto;padding:0;border:none}",
		'<fieldset id="target"><div id="word">AAAAAA</div></fieldset>',
	);
	const target = page.id("#target");
	const reference = page.tree.reference(target);
	const intrinsic = measureIntrinsicWidths(page.tree).widths.find(
		(entry) => entry.ref === reference,
	);
	expect(intrinsic).toMatchObject({ minContent: 36, maxContent: 36 });
	expect(page.rect("#host").width).toBe(30);
	expect(page.rect("#target").width).toBe(36);
	page.tree.setAttribute(target, "style", "min-width:0");
	expect(page.rect("#target").width).toBe(30);
	expect(layoutDocument(page.tree).metrics.glyphs).toBe(6);
	page.tree.removeAttribute(target, "style");
	expect(page.rect("#target").width).toBe(36);
	page.tree.setData(page.tree.get(page.id("#word")).children[0], "AAAAAAAAAA");
	expect(page.rect("#target").width).toBe(60);
});

it.each([
	["content-box", "auto", 104, 28, 100, 88],
	["border-box", "auto", 100, 28, 96, 84],
	["content-box", "40px", 104, 44, 100, 88],
	["border-box", "40px", 100, 40, 96, 84],
] as const)(
	"resolves %s sizing with height:%s without charging outer padding twice",
	(sizing, height, width, outerHeight, innerWidth, contentWidth) => {
		const page = fixture(`#target{box-sizing:${sizing};height:${height}}`);
		const { inner } = boxes(page);
		expect(page.rect("#target")).toMatchObject({ width, height: outerHeight });
		expect(inner).toMatchObject({ borderBoxWidth: innerWidth, contentWidth });
		expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	},
);

it("includes externally resolved percentage padding in the intrinsic minimum", () => {
	const page = fixture(
		"#host{width:100px}#target{width:0;padding:10%;border:none}",
	);
	const { outer, inner } = boxes(page);
	expect(outer.contentWidth).toBe(40);
	expect(outer.borderBoxHeight).toBe(30);
	expect(inner).toMatchObject({
		paddingBasis: 100,
		paddingLeft: 10,
		paddingRight: 10,
		paddingTop: 10,
		paddingBottom: 10,
		contentWidth: 20,
	});
	expect(page.rect("#child")).toMatchObject({ x: 10, y: 10, width: 20 });
});

it("resolves a nested fieldset's percentage padding against its actual parent", () => {
	const page = fixture(
		"#inner{width:50px;margin:0;padding:10%;border:none}",
		'<fieldset id="target"><fieldset id="inner"><div id="child"></div></fieldset></fieldset>',
	);
	const nested = boxes(page, "#inner");
	expect(nested.outer.contentWidth).toBe(50);
	expect(nested.inner.paddingBasis).toBe(88);
	expect(nested.inner.paddingLeft).toBeCloseTo(8.8, 10);
	expect(nested.inner.paddingRight).toBeCloseTo(8.8, 10);
	expect(page.rect("#child").x).toBeCloseTo(15.8, 10);
});

it("gives definite-height content its own percentage-height reference", () => {
	const page = fixture(
		"#target{height:40px;box-sizing:border-box}#child{height:50%}",
	);
	const { outer, inner } = boxes(page);
	expect(outer).toMatchObject({ contentHeight: 36, borderBoxHeight: 40 });
	expect(inner).toMatchObject({
		contentHeight: 36,
		borderBoxHeight: 50,
		paddingTop: 3,
		paddingBottom: 11,
	});
	expect(page.rect("#child").height).toBe(18);
});

it("keeps zero minimum resets independent of transferred padding", () => {
	const page = fixture("#target{width:0;min-width:0;padding:5px;border:none}");
	const { outer, inner } = boxes(page);
	expect(outer.contentWidth).toBe(0);
	expect(inner.borderBoxWidth).toBe(10);
	expect(page.rect("#child")).toMatchObject({ x: 5, y: 5, width: 20 });
});

it("retains transferred padding in an empty auto-height content box", () => {
	const page = fixture("", '<fieldset id="target"></fieldset>');
	const { inner } = boxes(page);
	expect(inner).toMatchObject({ contentHeight: 0, borderBoxHeight: 14 });
	expect(page.rect("#target")).toMatchObject({ width: 104, height: 18 });
});

it("isolates child margins from the fieldset and following normal flow", () => {
	const page = fixture(
		"#target{padding:0;border:none}#child{margin-top:7px;margin-bottom:9px}#after{height:5px}",
		`${content}<div id="after"></div>`,
	);
	expect(page.rect("#target")).toMatchObject({ y: 0, height: 26 });
	expect(page.rect("#child")).toMatchObject({ y: 7, height: 10 });
	expect(page.rect("#after")).toMatchObject({ y: 26, height: 5 });
});

it("retains separate owners and padding for nested fieldsets", () => {
	const page = fixture(
		"#target{padding:5px;border-width:1px}#nested{width:40px;padding:3px}",
		'<fieldset id="target"><fieldset id="nested"><div id="child"></div></fieldset></fieldset>',
	);
	const outer = boxes(page);
	const nested = boxes(page, "#nested");
	expect(outer.innerNode.fieldsetOwner).toBe(outer.outerNode.id);
	expect(nested.innerNode.fieldsetOwner).toBe(nested.outerNode.id);
	expect(outer.innerNode.id).not.toBe(nested.innerNode.id);
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 102,
		height: 32,
	});
	expect(page.rect("#nested")).toMatchObject({
		x: 6,
		y: 6,
		width: 44,
		height: 20,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 11,
		y: 11,
		width: 20,
		height: 10,
	});
	for (const selector of ["#target", "#nested"])
		expect(page.geometry.getClientRects(page.id(selector))).toHaveLength(1);
});

it("invalidates cached geometry and hit regions after padding and display changes", () => {
	const page = fixture();
	const target = page.id("#target");
	const child = page.id("#child");
	const hits = documentHitTesting(page.tree);
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	expect(hits.elementFromPoint(8, 6)).toBe(child);
	page.tree.setAttribute(target, "style", "padding:0");
	expect(page.rect("#child")).toMatchObject({ x: 2, y: 2 });
	expect(page.rect("#target").height).toBe(14);
	expect(hits.elementFromPoint(3, 3)).toBe(child);
	page.tree.setAttribute(target, "style", "display:none");
	expect(page.geometry.getClientRects(child)).toEqual([]);
	expect(findClickPoint(page.tree, child).blocked).toBe("no-box");
	expect(hits.elementFromPoint(3, 3)).not.toBe(child);
	page.tree.removeAttribute(target, "style");
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	expect(hits.elementFromPoint(3, 3)).toBe(target);
});

it("rebinds percentage padding when reparented into a different containing block", () => {
	const page = fixture(
		"#target{padding:10%}#other{width:300px}",
		`${content}<div id="other"></div>`,
	);
	expect(page.rect("#child")).toMatchObject({ x: 22, y: 22 });
	page.tree.append(page.id("#other"), page.id("#target"));
	expect(page.rect("#target")).toMatchObject({ width: 104, height: 74 });
	expect(page.rect("#child")).toMatchObject({ x: 32, y: 32 });
	expect(boxes(page).inner.contentWidth).toBe(40);
});

it("recomputes transferred percentage padding when viewport sizing changes", () => {
	const page = fixture("#host{width:50vw}#target{padding:10%}");
	page.styles.setViewport(200, 160);
	expect(page.rect("#host").width).toBe(100);
	expect(page.rect("#child")).toMatchObject({ x: 12, y: 12 });
	page.styles.setViewport(400, 160);
	expect(page.rect("#host").width).toBe(200);
	expect(page.rect("#child")).toMatchObject({ x: 22, y: 22 });
	expect(page.rect("#target").height).toBe(54);
});

it("keeps input click, fill and snapshots attached to the DOM control", () => {
	const page = fixture(
		"#input{display:block;width:40px;height:16px;margin:0;padding:0;border:none}",
		'<fieldset id="target"><input id="input" aria-label="Query"></fieldset>',
	);
	const input = page.id("#input");
	const reference = page.tree.reference(input);
	const actions = documentInteractions(page.tree);
	const hits = documentHitTesting(page.tree);
	expect(page.rect("#input")).toMatchObject({
		x: 7,
		y: 5,
		width: 40,
		height: 16,
	});
	expect(hits.elementFromPoint(10, 8)).toBe(input);
	expect(hits.elementFromPoint(3, 3)).toBe(page.id("#target"));
	expect(findClickPoint(page.tree, input).point).toBeDefined();
	actions.click(reference);
	expect(page.tree.activeElement).toBe(input);
	actions.fill(reference, "typed");
	expect(controlValue(page.tree, input)).toBe("typed");
	const entries = snapshotDocument(page.tree).entries.filter(
		(entry) => entry.ref === reference,
	);
	expect(entries).toHaveLength(1);
	expect(entries[0]).toMatchObject({
		role: "textbox",
		name: "Query",
		value: "typed",
	});
	page.tree.setAttribute(page.id("#target"), "disabled", "");
	expect(() => actions.fill(reference, "blocked")).toThrow(/disabled/i);
	expect(controlValue(page.tree, input)).toBe("typed");
});

it("paints the outer solid border once and keeps anonymous padding owned by the fieldset", () => {
	const page = fixture();
	const raster = rasterizeDocument(page.tree, {
		clip: { x: 0, y: 0, width: 30, height: 20 },
	});
	const pixel = (horizontal: number, vertical: number) => {
		const offset = (vertical * raster.image.width + horizontal) * 4;
		return [...raster.image.pixels.slice(offset, offset + 4)];
	};
	expect(pixel(0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(3, 3)).toEqual([255, 255, 255, 255]);
	expect(pixel(8, 6)).toEqual([0, 0, 255, 255]);
	expect(pixel(29, 6)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(3, 3)).toBe(
		page.id("#target"),
	);
});

it("does not treat a hidden legend as rendered content", () => {
	const page = fixture(
		"",
		'<fieldset id="target"><legend hidden>Omitted</legend><div id="child"></div></fieldset>',
	);
	expect(page.rect("#target")).toMatchObject({ width: 104, height: 28 });
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	expect(buildFormattingTree(page.tree).issues).toEqual({});
});

it.each([
	{
		name: "visible legend",
		css: "",
		markup:
			'<fieldset id="target"><legend>Visible</legend><div id="child"></div></fieldset>',
	},
	{
		name: "groove border",
		css: "#target{border-style:groove}",
		markup: content,
	},
	{ name: "flex container", css: "#target{display:flex}", markup: content },
	{ name: "grid container", css: "#target{display:grid}", markup: content },
	{ name: "flex item", css: "#host{display:flex}", markup: content },
	{ name: "grid item", css: "#host{display:grid}", markup: content },
	{ name: "float", css: "#target{float:left}", markup: content },
	{
		name: "absolute positioning",
		css: "#target{position:absolute}",
		markup: content,
	},
	{
		name: "fixed positioning",
		css: "#target{position:fixed}",
		markup: content,
	},
	{
		name: "non-visible overflow",
		css: "#target{overflow:hidden}",
		markup: content,
	},
])(
	"keeps $name outside the admitted fieldset layout profile",
	({ css, markup }) => {
		const page = fixture(css, markup);
		const revision = page.tree.revision;
		const source = serializeHtml(page.tree);
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(page.tree.revision).toBe(revision);
		expect(serializeHtml(page.tree)).toBe(source);
	},
);

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{
		name: "formatting work",
		options: { text: { formatting: { maxWork: 1 } } },
	},
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])(
	"fails closed on tiny $name budgets without retaining partial layout",
	({ options }) => {
		const page = fixture();
		const baseline = layoutDocument(page.tree);
		const revision = page.tree.revision;
		const source = serializeHtml(page.tree);
		expect(() => layoutDocument(page.tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(page.tree.revision).toBe(revision);
		expect(serializeHtml(page.tree)).toBe(source);
		expect(layoutDocument(page.tree)).toEqual(baseline);
		expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	},
);

it("counts the synthetic content box against the formatting box limit", () => {
	const page = fixture();
	const baseline = buildFormattingTree(page.tree);
	expect(
		baseline.nodes.filter((node) => node.fieldsetOwner !== undefined),
	).toHaveLength(1);
	expect(() =>
		buildFormattingTree(page.tree, { maxBoxes: baseline.metrics.boxes - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(buildFormattingTree(page.tree)).toEqual(baseline);
});
