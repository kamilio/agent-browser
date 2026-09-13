import { afterEach, expect, it } from "vitest";
import { bitmapFont } from "./bitmap-font.js";
import { findClickPoint } from "./click-target.js";
import { controlValue } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import {
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { prepareFormSubmission } from "./forms.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { documentInteractions } from "./interactions.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const content = '<button id="target"><span id="child"></span></button>';
const baseCss =
	"html,body{margin:0;padding:0;font-family:'Agent Mono';font-size:8px;line-height:8px;background:white}#host{width:200px}#target{display:block;width:100px;height:50px;margin:0;padding:3px 7px 11px 5px;border:2px solid red;background:white;font-family:'Agent Mono';font-size:8px;line-height:8px}#child{display:block;width:20px;height:10px;margin:0;padding:0;border:none;background:blue}";
const atomicCss =
	"#target{font-size:0;line-height:0}#child{display:inline-block}";

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
		"https://fixture.invalid/button-content-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(240, 160);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing button fixture ${selector}`);
		return found;
	};
	const reference = (selector: string) => tree.reference(id(selector));
	const geometry = documentGeometry(tree);
	const rect = (selector: string) =>
		geometry.getBoundingClientRect(id(selector));
	return { tree, queries, styles, id, reference, geometry, rect };
}

function retained(page: ReturnType<typeof fixture>, selector = "#target") {
	const layout = layoutDocument(page.tree);
	const formatting = layout.text.horizontal.formatting;
	const reference = page.reference(selector);
	const node = formatting.nodes.find((entry) => entry.ref === reference);
	const box = layout.boxes.find((entry) => entry.ref === reference);
	if (!node || !box) throw new Error(`Missing retained button box ${selector}`);
	return { layout, formatting, node, box };
}

it("retains real children, one outer reference and button-owned padding without changing the DOM", () => {
	const page = fixture();
	const revision = page.tree.revision;
	const source = serializeHtml(page.tree);
	const snapshot = snapshotDocument(page.tree);
	const { layout, formatting, node, box } = retained(page);
	const child = formatting.nodes.find(
		(entry) => entry.ref === page.reference("#child"),
	);
	expect(formatting.issues).toEqual({});
	expect(node).toMatchObject({
		kind: "block",
		display: "flow-root",
		level: "block",
		independentContext: true,
	});
	expect(node.control).toBeUndefined();
	expect(child).toMatchObject({ kind: "block" });
	expect(
		formatting.nodes.filter((entry) => entry.ref === page.reference("#target")),
	).toHaveLength(1);
	expect(
		layout.boxes.filter((entry) => entry.ref === page.reference("#target")),
	).toHaveLength(1);
	expect(box).toMatchObject({
		paddingTop: 3,
		paddingRight: 7,
		paddingBottom: 11,
		paddingLeft: 5,
		contentWidth: 84,
		contentHeight: 32,
		borderBoxWidth: 100,
		borderBoxHeight: 50,
	});
	expect(page.styles.box(page.id("#target"))["box-sizing"]).toBe("border-box");
	expect(page.styles.text(page.id("#target"))["text-align"]).toBe("center");
	expect(page.styles.flex(page.id("#target"))["align-content"]).toBe("center");
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 100,
		height: 50,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 16,
		width: 20,
		height: 10,
	});
	expect(page.geometry.getClientRects(page.id("#target"))).toHaveLength(1);
	expect(page.geometry.getClientRects(page.id("#child"))).toHaveLength(1);
	expect(page.tree.revision).toBe(revision);
	expect(serializeHtml(page.tree)).toBe(source);
	expect(snapshotDocument(page.tree)).toEqual(snapshot);
});

it("centers atomic content by default and paints and hits the real child rather than a caption", () => {
	const page = fixture(atomicCss);
	expect(page.rect("#child")).toMatchObject({
		x: 39,
		y: 16,
		width: 20,
		height: 10,
	});
	const hits = documentHitTesting(page.tree);
	expect(hits.elementFromPoint(40, 17)).toBe(page.id("#child"));
	expect(hits.elementFromPoint(8, 6)).toBe(page.id("#target"));
	expect(hits.elementsFromPoint(40, 17).slice(0, 2)).toEqual([
		page.id("#child"),
		page.id("#target"),
	]);
	expect(findClickPoint(page.tree, page.id("#target")).point).toBeDefined();
	expect(findClickPoint(page.tree, page.id("#child")).point).toBeDefined();
	const raster = rasterizeDocument(page.tree, {
		clip: { x: 0, y: 0, width: 100, height: 50 },
	});
	const pixel = (horizontal: number, vertical: number) => {
		const offset = (vertical * raster.image.width + horizontal) * 4;
		return [...raster.image.pixels.slice(offset, offset + 4)];
	};
	expect(pixel(0, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(8, 6)).toEqual([255, 255, 255, 255]);
	expect(pixel(40, 17)).toEqual([0, 0, 255, 255]);
	expect(pixel(60, 17)).toEqual([255, 255, 255, 255]);
});

it("lets author horizontal and vertical alignment override UA centering", () => {
	const page = fixture(
		`${atomicCss}#target{text-align:right;align-content:end}`,
	);
	expect(page.styles.text(page.id("#target"))["text-align"]).toBe("right");
	expect(page.styles.flex(page.id("#target"))["align-content"]).toBe("end");
	expect(page.rect("#child")).toMatchObject({
		x: 71,
		y: 27,
		width: 20,
		height: 10,
	});
});

it("honors author content-box sizing and start alignment without transferring padding", () => {
	const page = fixture(
		`${atomicCss}#target{box-sizing:content-box;text-align:left;align-content:start}`,
	);
	expect(page.rect("#target")).toMatchObject({ width: 116, height: 68 });
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	expect(retained(page).box).toMatchObject({
		contentWidth: 100,
		contentHeight: 50,
	});
});

it.each(["inline", "inline-block", "block", "flow-root"])(
	"preserves computed display:%s while using an independent button formatting context",
	(display) => {
		const page = fixture(`#target{display:${display}}`);
		const { node } = retained(page);
		const inline = display.startsWith("inline");
		expect(page.styles.get(page.id("#target")).display).toBe(display);
		expect(node).toMatchObject({
			kind: "block",
			display: inline ? "inline-block" : "flow-root",
			level: inline ? "inline" : "block",
			independentContext: true,
		});
		expect(page.rect("#target")).toMatchObject({ width: 100, height: 50 });
		expect(page.rect("#child")).toMatchObject({
			x: page.rect("#target").x + 7,
			y: page.rect("#target").y + 16,
			width: 20,
			height: 10,
		});
	},
);

it.each(["inline-block", "block"])(
	"uses native fit-content width and wraps rich text for an auto-width %s button",
	(display) => {
		const page = fixture(
			`#target{display:${display};width:auto;height:auto;padding:2px 3px;border:1px solid red}#child{display:inline;width:auto;height:auto}`,
			'<button id="target"><span id="child">AAAA AAAA</span></button>',
		);
		const advance = bitmapFont.advance;
		expect(
			measureIntrinsicWidths(page.tree).widths.find(
				(entry) => entry.ref === page.reference("#target"),
			),
		).toMatchObject({ minContent: 4 * advance, maxContent: 9 * advance });
		expect(page.rect("#target")).toMatchObject({
			width: 9 * advance + 8,
			height: 14,
		});
		page.tree.setAttribute(page.id("#host"), "style", "width:40px");
		expect(page.rect("#target")).toMatchObject({ width: 40, height: 22 });
		expect(page.geometry.getClientRects(page.id("#child"))).toHaveLength(2);
		page.tree.setAttribute(page.id("#host"), "style", "width:20px");
		expect(page.rect("#target").width).toBe(4 * advance + 8);
	},
);

it.each([
	{
		name: "minimum sizes",
		css: "width:auto;height:auto;min-width:60px;min-height:40px",
		width: 60,
		height: 40,
		childTop: 11,
	},
	{
		name: "maximum sizes",
		css: "width:120px;height:90px;max-width:70px;max-height:46px",
		width: 70,
		height: 46,
		childTop: 14,
	},
	{
		name: "minimums larger than maximums",
		css: "width:auto;height:auto;min-width:80px;max-width:50px;min-height:60px;max-height:40px",
		width: 80,
		height: 60,
		childTop: 21,
	},
])(
	"applies border-box $name before centering children",
	({ css, width, height, childTop }) => {
		const page = fixture(`#target{${css}}`);
		expect(page.rect("#target")).toMatchObject({ width, height });
		expect(page.rect("#child")).toMatchObject({
			x: 7,
			y: childTop,
			width: 20,
			height: 10,
		});
	},
);

it("resolves percentage padding against the containing block without charging it twice", () => {
	const page = fixture("#target{height:auto;padding:10%}");
	expect(page.rect("#target")).toMatchObject({ width: 100, height: 54 });
	expect(page.rect("#child")).toMatchObject({
		x: 22,
		y: 22,
		width: 20,
		height: 10,
	});
	expect(retained(page).box).toMatchObject({
		contentWidth: 56,
		paddingTop: 20,
		paddingRight: 20,
		paddingBottom: 20,
		paddingLeft: 20,
	});
});

it("resolves child percentage height against the actual button content box", () => {
	const page = fixture("#child{height:50%}");
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 13,
		width: 20,
		height: 16,
	});
	expect(retained(page).box).toMatchObject({ contentHeight: 32 });
});

it("contains child margins rather than collapsing them into surrounding normal flow", () => {
	const page = fixture(
		"#target{height:auto;padding:0;border:none}#child{margin:7px 0 9px}#after{height:5px}",
		`${content}<div id="after"></div>`,
	);
	expect(page.rect("#target")).toMatchObject({ y: 0, height: 26 });
	expect(page.rect("#child")).toMatchObject({ y: 7, height: 10 });
	expect(page.rect("#after")).toMatchObject({ y: 26, height: 5 });
});

it("retains the real parent text strut when a rich inline child has a smaller font", () => {
	const page = fixture(
		"#target{width:auto;height:auto;padding:0;border:none;font-size:16px;line-height:20px;text-align:left}#child{display:inline;width:auto;height:auto;font-size:8px;line-height:8px}",
		'<button id="target"><span id="child">AA</span></button>',
	);
	const { layout } = retained(page);
	const context = layout.contexts.find(
		(entry) => entry.ref === page.reference("#target"),
	);
	expect(context?.lines).toHaveLength(1);
	expect(context?.lines[0]).toMatchObject({ height: 20, baseline: 16 });
	expect(
		context?.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 0, 9],
		["A", bitmapFont.advance, 9],
	]);
	expect(page.rect("#target")).toMatchObject({
		width: 2 * bitmapFont.advance,
		height: 20,
	});
	expect(page.geometry.getClientRects(page.id("#child"))).toHaveLength(1);
});

it("keeps descent below an empty atomic child instead of suppressing the real strut", () => {
	const page = fixture(
		"#target{width:auto;height:auto;padding:0;border:none}#child{display:inline-block}#after{height:5px}",
		`${content}<div id="after"></div>`,
	);
	const context = layoutDocument(page.tree).contexts.find(
		(entry) => entry.ref === page.reference("#target"),
	);
	expect(context?.lines[0]).toMatchObject({
		baseline: 10,
		height: 10 + bitmapFont.descent,
	});
	expect(page.rect("#target")).toMatchObject({ width: 20, height: 11 });
	expect(page.rect("#child")).toMatchObject({
		x: 0,
		y: 0,
		width: 20,
		height: 10,
	});
	expect(page.rect("#after").y).toBe(11);
});

it("lays out nested element content with its own border and padding", () => {
	const page = fixture(
		"#target{width:80px;height:auto;padding:2px;border-width:1px}#nested{width:40px;padding:3px;border:1px solid green}",
		'<button id="target"><div id="nested"><span id="child"></span></div></button>',
	);
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 80,
		height: 24,
	});
	expect(page.rect("#nested")).toMatchObject({
		x: 3,
		y: 3,
		width: 48,
		height: 18,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 7,
		width: 20,
		height: 10,
	});
	for (const selector of ["#target", "#nested", "#child"])
		expect(page.geometry.getClientRects(page.id(selector))).toHaveLength(1);
	expect(documentHitTesting(page.tree).elementFromPoint(8, 8)).toBe(
		page.id("#child"),
	);
});

it("accumulates relative button and child offsets without moving the following block", () => {
	const page = fixture(
		"#target{position:relative;left:9px;top:6px}#child{position:relative;left:3px;top:4px}#after{height:5px}",
		`${content}<div id="after"></div>`,
	);
	expect(page.rect("#target")).toMatchObject({
		x: 9,
		y: 6,
		width: 100,
		height: 50,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 19,
		y: 26,
		width: 20,
		height: 10,
	});
	expect(page.rect("#after")).toMatchObject({ x: 0, y: 50, height: 5 });
	expect(documentHitTesting(page.tree).elementFromPoint(20, 27)).toBe(
		page.id("#child"),
	);
});

it("invalidates child geometry and hits after padding, child-size and display mutations", () => {
	const page = fixture(atomicCss);
	const hits = documentHitTesting(page.tree);
	expect(page.rect("#child")).toMatchObject({ x: 39, y: 16 });
	page.tree.setAttribute(page.id("#target"), "style", "padding:0");
	expect(page.rect("#child")).toMatchObject({ x: 40, y: 20 });
	page.tree.setAttribute(page.id("#child"), "style", "width:40px;height:20px");
	expect(page.rect("#child")).toMatchObject({
		x: 30,
		y: 15,
		width: 40,
		height: 20,
	});
	expect(hits.elementFromPoint(31, 16)).toBe(page.id("#child"));
	page.tree.setAttribute(page.id("#target"), "style", "display:none");
	expect(page.geometry.getClientRects(page.id("#child"))).toEqual([]);
	expect(findClickPoint(page.tree, page.id("#child")).blocked).toBe("no-box");
	expect(hits.elementFromPoint(31, 16)).not.toBe(page.id("#child"));
	page.tree.removeAttribute(page.id("#target"), "style");
	page.tree.removeAttribute(page.id("#child"), "style");
	expect(page.rect("#child")).toMatchObject({
		x: 39,
		y: 16,
		width: 20,
		height: 10,
	});
	expect(hits.elementFromPoint(40, 17)).toBe(page.id("#child"));
});

it("rebinds percentage width and centered child geometry after reparenting", () => {
	const page = fixture(
		`${atomicCss}#target{width:50%}#other{width:300px}`,
		`${content}<div id="other"></div>`,
	);
	const reference = page.reference("#target");
	expect(page.rect("#target").width).toBe(100);
	expect(page.rect("#child")).toMatchObject({ x: 39, y: 16 });
	page.tree.append(page.id("#other"), page.id("#target"));
	expect(page.reference("#target")).toBe(reference);
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 150,
		height: 50,
	});
	expect(page.rect("#child")).toMatchObject({ x: 64, y: 16 });
	expect(documentHitTesting(page.tree).elementFromPoint(65, 17)).toBe(
		page.id("#child"),
	);
});

it("recomputes percentage width and centering after viewport changes", () => {
	const page = fixture(`${atomicCss}#host{width:50vw}#target{width:50%}`);
	page.styles.setViewport(200, 160);
	expect(page.rect("#target").width).toBe(50);
	expect(page.rect("#child")).toMatchObject({ x: 14, y: 16 });
	page.styles.setViewport(400, 160);
	expect(page.rect("#target").width).toBe(100);
	expect(page.rect("#child")).toMatchObject({ x: 39, y: 16 });
	expect(documentHitTesting(page.tree).elementFromPoint(40, 17)).toBe(
		page.id("#child"),
	);
});

it("omits hidden descendants and removes the entire subtree under a hidden ancestor", () => {
	const page = fixture(
		"#target{height:auto}",
		'<button id="target"><span id="hidden" hidden>Never rendered</span><span id="child"></span></button>',
	);
	expect(page.rect("#target")).toMatchObject({ width: 100, height: 28 });
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 5 });
	expect(page.geometry.getClientRects(page.id("#hidden"))).toEqual([]);
	expect(layoutDocument(page.tree).metrics.glyphs).toBe(0);
	page.tree.setAttribute(page.id("#host"), "hidden", "");
	expect(page.geometry.getClientRects(page.id("#target"))).toEqual([]);
	expect(page.geometry.getClientRects(page.id("#child"))).toEqual([]);
	expect(documentHitTesting(page.tree).elementFromPoint(8, 6)).not.toBe(
		page.id("#child"),
	);
	page.tree.removeAttribute(page.id("#host"), "hidden");
	expect(page.rect("#target")).toMatchObject({ width: 100, height: 28 });
});

it("does not promote foreign button names into the HTML rich-button path or UA defaults", () => {
	const page = fixture("", "");
	for (const namespace of [svgNamespace, mathmlNamespace]) {
		const target = page.tree.createParserElement("button", {}, namespace);
		const child = page.tree.createParserElement("span", {}, namespace);
		page.tree.append(target, child);
		page.tree.append(page.id("#host"), target);
		expect(page.styles.get(target).display).toBe("inline");
		expect(page.styles.box(target)["box-sizing"]).toBe("content-box");
		expect(page.styles.text(target)["text-align"]).toBe("start");
		expect(page.styles.flex(target)["align-content"]).toBe("normal");
		const node = buildFormattingTree(page.tree).nodes.find(
			(entry) => entry.ref === page.tree.reference(target),
		);
		expect(node).toMatchObject({ kind: "deferred" });
		expect(node?.control).toBeUndefined();
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		page.tree.remove(target);
	}
});

it("keeps disabled rich content visible and hit-testable but denies activation", () => {
	const page = fixture(
		"",
		'<button id="target" disabled><span id="child"></span></button>',
	);
	const actions = documentInteractions(page.tree);
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 16,
		width: 20,
		height: 10,
	});
	expect(documentHitTesting(page.tree).elementFromPoint(8, 17)).toBe(
		page.id("#child"),
	);
	expect(() => actions.click(page.reference("#target"))).toThrow(/disabled/i);
	expect(() => actions.click(page.reference("#child"))).toThrow(/disabled/i);
	page.tree.removeAttribute(page.id("#target"), "disabled");
	expect(() => actions.click(page.reference("#child"))).not.toThrow();
	expect(page.rect("#child")).toMatchObject({ x: 7, y: 16 });
});

it("keeps descendant clicks, submitter identity, reset and type=button boundaries attached to the control", () => {
	const page = fixture(
		"#field{display:none}",
		'<form id="form" action="/submit"><input id="field" name="query" value="initial"><button id="target" name="choice" value="yes"><span id="child">Send</span></button></form>',
	);
	const actions = documentInteractions(page.tree);
	expect(page.rect("#child").width).toBe(20);
	expect(actions.click(page.reference("#child")).defaultAction).toEqual({
		kind: "submit",
		formRef: page.reference("#form"),
		submitterRef: page.reference("#target"),
	});
	expect(
		prepareFormSubmission(page.tree, page.reference("#form"), {
			submitter: page.reference("#target"),
		}).request.url,
	).toBe("https://fixture.invalid/submit?query=initial&choice=yes");
	page.tree.setAttribute(page.id("#target"), "type", "button");
	expect(actions.click(page.reference("#child")).defaultAction).toBeUndefined();
	expect(() =>
		prepareFormSubmission(page.tree, page.reference("#form"), {
			submitter: page.reference("#child"),
		}),
	).toThrow(/submitter/i);
	page.tree.setControl(page.id("#field"), { value: "edited" });
	page.tree.setAttribute(page.id("#target"), "type", "reset");
	expect(actions.click(page.reference("#child")).reset).toMatchObject({
		reset: true,
	});
	expect(controlValue(page.tree, page.id("#field"))).toBe("initial");
	expect(page.geometry.getClientRects(page.id("#target"))).toHaveLength(1);
});

it("preserves the optimized software representation for a plain-text button", () => {
	const page = fixture("", '<button id="target">Save</button>');
	const { node, formatting } = retained(page);
	expect(formatting.issues).toEqual({});
	expect(node).toMatchObject({
		kind: "replaced",
		control: { kind: "button", text: "Save" },
	});
	expect(page.geometry.getClientRects(page.id("#target"))).toHaveLength(1);
	expect(
		snapshotDocument(page.tree).entries.filter(
			(entry) => entry.ref === page.reference("#target"),
		),
	).toHaveLength(1);
});

it.each([
	{ display: "block", sizing: "border-box", floating: "none" },
	{ display: "inline-block", sizing: "border-box", floating: "none" },
	{ display: "block", sizing: "content-box", floating: "none" },
	{ display: "inline-block", sizing: "content-box", floating: "none" },
	{ display: "block", sizing: "border-box", floating: "left" },
	{ display: "block", sizing: "content-box", floating: "left" },
])(
	"resolves inherited intrinsic minimums with real percentage padding for $display $sizing float:$floating buttons",
	({ display, sizing, floating }) => {
		const page = fixture(
			`#minimum{width:200px;border:none;padding:0;margin:0}#target{display:${display};float:${floating};box-sizing:${sizing};width:auto;min-width:inherit;max-width:0;height:20px;border:none;padding:0 10%;font-size:0;line-height:0}`,
			`<fieldset id="minimum">${content}</fieldset>`,
		);
		expect(page.styles.box(page.id("#target"))["min-width"]).toBe(
			"min-content",
		);
		expect(buildFormattingTree(page.tree).issues).toEqual(
			floating === "none" ? {} : { "float-layout-not-supported": 1 },
		);
		expect(page.rect("#target")).toMatchObject({ width: 60, height: 20 });
		expect(page.rect("#child")).toMatchObject({ x: 20, width: 20 });
		page.tree.setAttribute(page.id("#minimum"), "style", "width:100px");
		expect(page.rect("#target")).toMatchObject({ width: 40, height: 20 });
		expect(page.rect("#child")).toMatchObject({ x: 10, width: 20 });
	},
);

it.each(["flex", "inline-flex", "block flex", "inline flex"])(
	"uses real flex children and auto fit-content for %s buttons",
	(display) => {
		const page = fixture(
			`#target{display:${display};width:auto;height:24px;padding:0;border:none;font-size:0;line-height:0;gap:4px;align-items:center}#second{display:block;width:10px;height:6px}`,
			'<button id="target"><span id="child"></span><span id="second"></span></button>',
		);
		const button = page.rect("#target");
		expect(button).toMatchObject({ width: 34, height: 24 });
		expect(page.rect("#child")).toMatchObject({
			x: button.x,
			y: button.y + 7,
			width: 20,
			height: 10,
		});
		expect(page.rect("#second")).toMatchObject({
			x: button.x + 24,
			y: button.y + 9,
			width: 10,
			height: 6,
		});
		expect(retained(page).node.contentMode).toBe("flex");
		expect(rasterizeDocument(page.tree).metrics.paintedControls).toBe(1);
	},
);

it.each(["grid", "block grid"])(
	"uses native grid sizing and UA content centering for %s buttons",
	(display) => {
		const page = fixture(
			`#target{display:${display};width:auto;height:24px;padding:0;border:none;font-size:0;line-height:0;grid-template-columns:20px 10px;grid-template-rows:10px;gap:4px;align-items:center}#second{display:block;width:10px;height:6px}`,
			'<button id="target"><span id="child"></span><span id="second"></span></button>',
		);
		const button = page.rect("#target");
		expect(button).toMatchObject({ width: 34, height: 24 });
		expect(page.rect("#child")).toMatchObject({
			x: button.x,
			y: button.y + 7,
			width: 20,
			height: 10,
		});
		expect(page.rect("#second")).toMatchObject({
			x: button.x + 24,
			y: button.y + 9,
			width: 10,
			height: 6,
		});
		expect(retained(page).node.contentMode).toBe("grid");
		expect(rasterizeDocument(page.tree).metrics.paintedControls).toBe(1);
	},
);

it.each(["left", "right"])(
	"retains button children in a %s-floating fit-content box",
	(side) => {
		const page = fixture(
			`#target{float:${side};width:auto;height:auto;padding:0;border:none}#after{clear:both;height:1px}`,
			`${content}<div id="after"></div>`,
		);
		expect(page.rect("#target")).toMatchObject({
			x: side === "left" ? 0 : 180,
			y: 0,
			width: 20,
			height: 10,
		});
		expect(page.rect("#child")).toEqual(page.rect("#target"));
		expect(page.rect("#after").y).toBe(10);
	},
);

it.each([
	{ name: "absolute positioning", css: "#target{position:absolute}" },
	{ name: "fixed positioning", css: "#target{position:fixed}" },
	{ name: "inline grid", css: "#target{display:inline-grid}" },
	{ name: "flex item", css: "#host{display:flex}" },
	{ name: "grid item", css: "#host{display:grid}" },
])(
	"does not silently flatten rich content in an unsupported $name",
	({ css }) => {
		const page = fixture(css);
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
	{
		name: "descendant depth",
		options: { text: { formatting: { maxDepth: 4 } } },
	},
	{
		name: "descendant text",
		options: { text: { formatting: { maxTextCodeUnits: 1 } } },
	},
])(
	"enforces $name limits without retaining partial rich-button layout",
	({ options }) => {
		const page = fixture(
			"",
			'<button id="target"><div><span id="child">AAAA</span></div></button>',
		);
		const baseline = layoutDocument(page.tree);
		const revision = page.tree.revision;
		const source = serializeHtml(page.tree);
		expect(() => layoutDocument(page.tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(page.tree.revision).toBe(revision);
		expect(serializeHtml(page.tree)).toBe(source);
		expect(layoutDocument(page.tree)).toEqual(baseline);
		expect(page.rect("#child")).toMatchObject({
			x: 7,
			y: 16,
			width: 20,
			height: 10,
		});
	},
);
