import { afterEach, expect, it } from "vitest";
import { initialBoxStyle } from "./css-box.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import {
	type FormattingTree,
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentHitTesting } from "./hit-testing.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(markup: string) {
	const tree = parseHtmlDocument(markup, "https://example.com/");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing fixture ${selector}`);
		return result;
	};
	return {
		tree,
		id,
		ref: (selector: string) => tree.reference(id(selector)),
		styles: documentStyles(tree),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function textOrder(formatting: FormattingTree) {
	const result: string[] = [];
	const pending = [formatting.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		const node = formatting.nodes[id];
		if (node.kind === "text") result.push(node.text ?? "");
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	return result.join("");
}

function verifyTree(formatting: FormattingTree) {
	const incoming = new Map<number, number>();
	const seen = new Set<number>();
	const pending = [formatting.root];
	while (pending.length) {
		const id = pending.pop();
		if (id === undefined) break;
		expect(seen.has(id)).toBe(false);
		seen.add(id);
		const node = formatting.nodes[id];
		expect(node.id).toBe(id);
		for (const child of node.children) {
			incoming.set(child, (incoming.get(child) ?? 0) + 1);
			expect(formatting.nodes[child].parent).toBe(id);
			if (node.kind === "inline" || node.contentMode === "inline")
				expect(formatting.nodes[child].level).toBe("inline");
			if (node.contentMode === "blocks")
				expect(formatting.nodes[child].level).toBe("block");
			pending.push(child);
		}
	}
	expect(seen.size).toBe(formatting.nodes.length);
	for (const node of formatting.nodes)
		expect(incoming.get(node.id) ?? 0).toBe(
			node.id === formatting.root ? 0 : 1,
		);
	expect(formatting.nodes[formatting.root].parent).toBeNull();
}

it("builds immutable block/inline/text records without altering the native document", () => {
	const { tree, ref } = fixture(
		"<main><p>Hello <em>world</em>!<!-- ignored --></p></main>",
	);
	const before = snapshotDocument(tree);
	const result = buildFormattingTree(tree);
	verifyTree(result);
	expect(textOrder(result)).toBe("Hello world!");
	expect(result.nodes.find((node) => node.ref === ref("p"))).toMatchObject({
		kind: "block",
		contentMode: "inline",
	});
	expect(result.nodes.find((node) => node.ref === ref("em"))).toMatchObject({
		kind: "inline",
		fragmentIndex: 0,
		fragmentCount: 1,
	});
	expect(result.issues).toEqual({});
	expect(Object.isFrozen(result)).toBe(true);
	expect(
		result.nodes.every(
			(node) => Object.isFrozen(node) && Object.isFrozen(node.children),
		),
	).toBe(true);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("wraps inline runs around block children in anonymous block containers", () => {
	const { tree, ref } = fixture(
		'<main>before<div id="middle">middle</div>after</main>',
	);
	const result = buildFormattingTree(tree);
	const main = result.nodes.find((node) => node.ref === ref("main"));
	expect(main?.contentMode).toBe("blocks");
	expect(main?.children.map((id) => result.nodes[id].kind)).toEqual([
		"anonymous-block",
		"block",
		"anonymous-block",
	]);
	for (const node of result.nodes.filter(
		(node) => node.kind === "anonymous-block",
	)) {
		expect(node.ref).toBeUndefined();
		expect(node.box).toBe(initialBoxStyle);
	}
	expect(textOrder(result)).toBe("beforemiddleafter");
	verifyTree(result);
});

it("splits nested inline ancestors around a block without changing DOM parents or text order", () => {
	const { tree, ref, id } = fixture(
		'<main><span id="outer">A<span id="inner">B<div id="block">C</div>D</span>E</span></main>',
	);
	const parent = tree.get(id("#block")).parent;
	const result = buildFormattingTree(tree);
	verifyTree(result);
	expect(textOrder(result)).toBe("ABCDE");
	const main = result.nodes.find((node) => node.ref === ref("main"));
	expect(main?.children.map((id) => result.nodes[id].kind)).toEqual([
		"anonymous-block",
		"block",
		"anonymous-block",
	]);
	for (const target of ["#outer", "#inner"]) {
		const fragments = result.nodes.filter((node) => node.ref === ref(target));
		expect(fragments.map((node) => node.fragmentIndex)).toEqual([0, 1]);
		expect(fragments.every((node) => node.fragmentCount === 2)).toBe(true);
	}
	expect(tree.get(id("#block")).parent).toBe(parent);
});

it("preserves empty inline fragments at block-in-inline boundaries", () => {
	const { tree, ref } = fixture(
		'<main><span id="outer"><div>inside</div></span></main>',
	);
	const result = buildFormattingTree(tree);
	const fragments = result.nodes.filter((node) => node.ref === ref("#outer"));
	expect(fragments).toHaveLength(2);
	expect(fragments.every((node) => node.children.length === 0)).toBe(true);
	verifyTree(result);
});

it("retains raw whitespace for the future inline layout stage rather than fabricating line metrics", () => {
	const { tree } = fixture("<main> \n <div>body</div>\t</main>");
	const result = buildFormattingTree(tree);
	expect(textOrder(result)).toBe(" \n body\t");
	expect(result.stage).toBe("display-decomposition");
	expect(
		result.nodes.every((node) => !("height" in node) && !("y" in node)),
	).toBe(true);
});

it("flattens display:contents while using DOM ancestry for computed style inheritance", () => {
	const { tree, ref, styles } = fixture(
		'<main style="width:400px"><section id="contents" style="display:contents;width:40px;visibility:hidden"><div id="child" style="width:50%;visibility:visible">child</div></section></main>',
	);
	styles.setViewport(800, 600);
	const result = resolveDocumentBlockWidths(tree);
	expect(
		result.formatting.nodes.some((node) => node.ref === ref("#contents")),
	).toBe(false);
	expect(
		result.formatting.nodes.find((node) => node.ref === ref("#child"))?.visible,
	).toBe(true);
	expect(
		result.widths.find((node) => node.ref === ref("#child"))?.contentWidth,
	).toBe(200);
});

it("lets display:contents carry block children through inline splitting", () => {
	const { tree, ref } = fixture(
		'<main><span>A<section id="contents" style="display:contents"><div>B</div></section>C</span></main>',
	);
	const result = buildFormattingTree(tree);
	expect(result.nodes.some((node) => node.ref === ref("#contents"))).toBe(
		false,
	);
	expect(textOrder(result)).toBe("ABC");
	verifyTree(result);
});

it.each(["inline", "contents", "inline-block", "inline flow-root"])(
	"blockifies root display %s without rewriting the visibility API",
	(display) => {
		const { tree, ref, styles, id } = fixture(
			`<style>html{display:${display};width:300px}</style><p>text</p>`,
		);
		const result = resolveDocumentBlockWidths(tree);
		expect(
			result.formatting.nodes.find((node) => node.ref === ref("html"))?.kind,
		).toBe("block");
		expect(
			result.widths.find((node) => node.ref === ref("html"))?.contentWidth,
		).toBe(300);
		expect(styles.get(id("html")).display).toBe(display);
	},
);

it("excludes display:none subtrees, including unsupported descendants", () => {
	const { tree, ref } = fixture(
		'<div id="hidden" style="display:none"><input><span style="display:block;visibility:visible">hidden</span></div><p>visible</p>',
	);
	const result = buildFormattingTree(tree);
	expect(result.nodes.some((node) => node.ref === ref("#hidden"))).toBe(false);
	expect(textOrder(result)).toBe("visible");
	expect(result.issues).toEqual({});
});

it("keeps display:none on the root empty rather than blockifying it into visibility", () => {
	const { tree } = fixture(
		"<style>html{display:none}</style><main>hidden</main>",
	);
	const result = resolveDocumentBlockWidths(tree);
	expect(result.formatting.nodes).toHaveLength(1);
	expect(result.widths).toHaveLength(0);
});

it("reports missing or multiple native document elements instead of inferring a browser root", () => {
	const { tree, id } = fixture("<main></main>");
	tree.remove(id("html"));
	expect(buildFormattingTree(tree).issues["missing-document-element"]).toBe(1);
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	tree.append(tree.root, tree.createElement("div"));
	tree.append(tree.root, tree.createElement("div"));
	expect(buildFormattingTree(tree).issues["multiple-document-elements"]).toBe(
		1,
	);
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
});

it("retains hidden visibility boxes and visually present aria-hidden/inert content", () => {
	const { tree, ref } = fixture(
		'<main style="visibility:hidden"><span id="hidden">hidden</span><span id="visible" style="visibility:visible">visible</span></main><div id="aria" aria-hidden="true" inert>kept</div>',
	);
	const result = buildFormattingTree(tree);
	expect(
		result.nodes.find((node) => node.ref === ref("#hidden"))?.visible,
	).toBe(false);
	expect(
		result.nodes.find((node) => node.ref === ref("#visible"))?.visible,
	).toBe(true);
	expect(result.nodes.find((node) => node.ref === ref("#aria"))?.visible).toBe(
		true,
	);
	expect(textOrder(result)).toBe("hiddenvisiblekept");
});

it("handles ordinary breaks and the explicit unusual-element contents profile", () => {
	const { tree, ref } = fixture(
		'before<br id="break">after<img id="image" style="display:contents"><object id="object" style="display:contents"><p>omitted</p></object><button id="button" style="display:contents">kept</button>',
	);
	const result = buildFormattingTree(tree);
	expect(result.nodes.find((node) => node.ref === ref("#break"))?.kind).toBe(
		"break",
	);
	for (const target of ["#image", "#object", "#button"])
		expect(result.nodes.some((node) => node.ref === ref(target))).toBe(false);
	expect(textOrder(result)).toBe("beforeafterkept");
	expect(result.issues).toEqual({});
});

it.each(["flex", "grid", "table", "inline-table", "inline-flex"])(
	"retains the width-only guard for %s without fabricating block flow",
	(display) => {
		const { tree, ref } = fixture(
			`<div id="outer" style="display:${display}"><span id="inside">inside</span></div>`,
		);
		const result = buildFormattingTree(tree);
		expect(
			result.nodes.find((node) => node.ref === ref("#outer")),
		).toMatchObject({
			kind: "deferred",
			deferredReason: "display-layout-not-supported",
		});
		const container = result.nodes.find((node) => node.ref === ref("#outer"));
		const child = result.nodes.find((node) => node.ref === ref("#inside"));
		if (display === "flex" || display === "inline-flex") {
			expect(container?.contentMode).toBe("flex");
			expect(container?.children).toEqual([child?.id]);
			expect(child).toMatchObject({ kind: "block", flexItem: true });
		} else if (display === "grid") {
			expect(container?.contentMode).toBe("grid");
			expect(container?.children).toEqual([child?.id]);
			expect(child).toMatchObject({ kind: "block", gridItem: true });
		} else {
			expect(container?.children).toEqual([]);
			expect(child).toBeUndefined();
		}
		expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	},
);

it.each([
	["ul", "inline <span>content</span>", "inline"],
	["ol", "<div>block</div><p>content</p>", "blocks"],
	["ul", "before<div>block</div>after", "blocks"],
])("formats marker-free %s items with %s", (tag, content, contentMode) => {
	const { tree, ref } = fixture(
		`<style>html,body,ul,ol,li,div,p{margin:0;padding:0}li{width:80px}</style><${tag} style="list-style-type:none"><li id="item">${content}</li></${tag}>`,
	);
	const before = snapshotDocument(tree);
	const result = buildFormattingTree(tree);
	verifyTree(result);
	expect(result.issues).toEqual({});
	expect(result.nodes.find((node) => node.ref === ref("#item"))).toMatchObject({
		kind: "block",
		display: "list-item",
		contentMode,
	});
	expect(result.nodes.some((node) => node.marker)).toBe(false);
	expect(textOrder(result)).toBe(content.replace(/<[^>]*>/g, ""));
	expect(
		resolveDocumentBlockWidths(tree).widths.find(
			(node) => node.ref === ref("#item"),
		)?.contentWidth,
	).toBe(80);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("inherits and overrides symbolic markers through contents and nested lists", () => {
	const { tree, ref, styles, id } = fixture(
		'<ul style="list-style-type:square;list-style-position:inside"><li id="outer">Outer<ul style="display:contents;list-style-type:circle"><li id="inner">Inner</li><li id="override" style="list-style-type:disc">Override</li><li id="none" style="list-style-type:none"><div>None</div></li></ul></li></ul>',
	);
	const result = buildFormattingTree(tree);
	verifyTree(result);
	expect(result.issues).toEqual({});
	for (const [selector, type] of [
		["#outer", "square"],
		["#inner", "circle"],
		["#override", "disc"],
	]) {
		expect(styles.list(id(selector))["list-style-type"]).toBe(type);
		expect(
			result.nodes.find((node) => node.ref === ref(selector) && node.marker)
				?.marker?.type,
		).toBe(type);
	}
	expect(result.nodes.filter((node) => node.marker)).toHaveLength(3);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(3);
});

it.each(["disc", "circle", "square", "disclosure-open", "disclosure-closed"])(
	"paints an ordinary %s marker with native geometry and hit targeting",
	(type) => {
		const { tree, id, ref, styles } = fixture(
			`<style>html,body{margin:0}body{padding-left:20px}li{font-size:16px;line-height:20px;color:red;list-style-type:${type};list-style-position:inside}</style><li id="item">Item</li>`,
		);
		styles.setViewport(120, 80);
		const geometry = documentGeometry(tree);
		const itemRect = geometry.getBoundingClientRect(id("#item"));
		expect(itemRect).toMatchObject({ x: 20, width: 100, height: 20 });
		expect(geometry.getClientRects(id("#item"))).toHaveLength(1);
		const firstGlyph = () =>
			layoutDocument(tree).contexts.flatMap((context) => context.glyphs)[0];
		expect(firstGlyph().x).toBe(36);
		const image = rasterizeDocument(tree, {
			clip: { x: 20, y: 0, width: 16, height: 20 },
		});
		expect(image.metrics.paintedMarkers).toBe(1);
		let redPixels = 0;
		for (let offset = 0; offset < image.image.pixels.length; offset += 4)
			if (
				image.image.pixels[offset] === 255 &&
				image.image.pixels[offset + 1] === 0 &&
				image.image.pixels[offset + 2] === 0 &&
				image.image.pixels[offset + 3] === 255
			)
				redPixels++;
		expect(redPixels).toBeGreaterThan(0);
		expect(documentHitTesting(tree).elementFromPoint(23, 7)).toBe(id("#item"));
		tree.setAttribute(id("#item"), "style", "list-style-position:outside");
		expect(firstGlyph().x).toBe(20);
		expect(geometry.getBoundingClientRect(id("#item"))).toEqual(itemRect);
		expect(geometry.getClientRects(id("#item"))).toHaveLength(1);
		expect(documentHitTesting(tree).elementFromPoint(7, 7)).toBe(id("#item"));
		expect(
			buildFormattingTree(tree).nodes.find((node) => node.outsideMarker)
				?.outsideMarker,
		).toEqual({ type });
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
		expect(tree.textContent(id("#item"))).toBe("Item");
		expect(
			buildFormattingTree(tree).nodes.find((node) => node.outsideMarker)?.ref,
		).toBe(ref("#item"));
	},
);

it.each(["flex", "grid"])(
	"retains %s item flags and contents flattening for ordinary lists",
	(display) => {
		const { tree, ref } = fixture(
			`<style>html,body{margin:0}#container{display:${display};width:120px}li{width:40px;list-style-position:inside}</style><div id="container"><ul id="contents" style="display:contents;list-style-type:square"><li id="first">One</li><li id="second" style="list-style-type:none"><div>Two</div></li></ul></div>`,
		);
		const result = buildFormattingTree(tree);
		verifyTree(result);
		const items = ["#first", "#second"].map((selector) =>
			result.nodes.find((node) => node.ref === ref(selector)),
		);
		expect(result.nodes.some((node) => node.ref === ref("#contents"))).toBe(
			false,
		);
		expect(
			result.nodes.find((node) => node.ref === ref("#container"))?.children,
		).toEqual(items.map((node) => node?.id));
		for (const item of items)
			expect(item).toMatchObject({
				kind: "block",
				display: "list-item",
				independentContext: true,
				[`${display}Item`]: true,
			});
		expect(result.issues).toEqual({ "display-layout-not-supported": 1 });
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	},
);

it("does not grant ordinary li or div markers summary activation", () => {
	const { tree, id, ref } = fixture(
		'<details open><summary id="summary">More</summary><li id="item">Item</li><div id="div" style="display:list-item;list-style-type:disclosure-closed">Div</div></details>',
	);
	const actions = documentInteractions(tree);
	const markers = () =>
		buildFormattingTree(tree).nodes.filter(
			(node) => node.marker || node.outsideMarker,
		);
	expect(
		markers().map((node) => (node.marker ?? node.outsideMarker)?.type),
	).toEqual(["disclosure-open", "disc", "disclosure-closed"]);
	for (const selector of ["#item", "#div"]) {
		actions.click(ref(selector));
		expect(tree.get(id("details")).attributes.open).toBe("");
	}
	actions.click(ref("#summary"));
	expect(tree.get(id("details")).attributes.open).toBeUndefined();
	expect(markers()).toHaveLength(1);
	expect(markers()[0]).toMatchObject({
		ref: ref("#summary"),
		marker: { type: "disclosure-closed" },
	});
});

it.each([
	"<div>Block</div>",
	'<span style="display:contents"><div>Flattened block</div></span>',
	"<span>Before<div>Split inline</div>After</span>",
])("coordinates outside ordinary markers with block content: %s", (content) => {
	const { tree, id } = fixture(
		`<style>body{padding-left:20px}</style><li id="item">${content}</li>`,
	);
	verifyTree(buildFormattingTree(tree));
	expect(layoutDocument(tree).outsideMarkers).toHaveLength(1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	tree.setAttribute(id("#item"), "style", "list-style-position:inside");
	verifyTree(buildFormattingTree(tree));
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	tree.setAttribute(id("#item"), "style", "list-style-type:none");
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
});

it.each([
	"list-style-type:decimal",
	"list-style-type:lower-roman",
	"list-style-type:symbols('*')",
	"list-style-image:url(marker.png)",
	"counter-reset:item",
	"counter-increment:item",
	"list-style:none",
])("retains CSS diagnostics and the rendering guard for %s", (declaration) => {
	const { tree } = fixture(`<li style="${declaration}">Item</li>`);
	const result = buildFormattingTree(tree);
	expect(
		Object.keys(result.issues).some((code) => code.startsWith("css:")),
	).toBe(true);
	expect(
		result.nodes.find((node) => node.outsideMarker)?.outsideMarker?.type,
	).toBe("disc");
	expect(() => rasterizeDocument(tree)).toThrow();
});

it("charges ordinary markers to existing box and work budgets without DOM mutations", () => {
	const { tree } = fixture("<ul><li>One</li><li>Two</li></ul>");
	const before = snapshotDocument(tree);
	const result = buildFormattingTree(tree);
	for (const options of [
		{ maxBoxes: result.metrics.boxes - 1 },
		{ maxWork: result.metrics.work - 1 },
	])
		expect(() => buildFormattingTree(tree, options)).toThrow(/limit/i);
	expect(
		buildFormattingTree(tree, {
			maxBoxes: result.metrics.boxes,
			maxWork: result.metrics.work,
		}),
	).toEqual(result);
	expect(() => rasterizeDocument(tree, { maxWork: 10 })).toThrow(/work limit/i);
	expect(snapshotDocument(tree)).toEqual(before);
});

it.each([
	'<ol><li id="item">Numbered</li></ol>',
	'<ol start="3" reversed><li id="item" value="7">Numbered</li></ol>',
	'<ol><div style="display:contents"><li id="item">Numbered</li></div></ol>',
	'<ol style="list-style-type:disc"><li id="item">Ambiguous disc</li></ol>',
])(
	"does not silently replace unrepresented ordered-list counters with discs: %s",
	(markup) => {
		const { tree, id } = fixture(
			`<style>body{padding-left:20px}</style>${markup}`,
		);
		expect(
			buildFormattingTree(tree).issues["ordered-list-marker-not-supported"],
		).toBe(1);
		expect(() => rasterizeDocument(tree)).toThrow();
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
		tree.setAttribute(id("#item"), "style", "list-style-type:square");
		expect(buildFormattingTree(tree).issues).toEqual({});
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	},
);

it("supports unordered descendants of a marker-free ordered list", () => {
	const { tree } = fixture(
		'<style>body{padding-left:20px}</style><ol style="list-style-type:none"><li><ul style="list-style-type:disc"><li>Unordered</li></ul></li></ol>',
	);
	expect(buildFormattingTree(tree).issues).toEqual({});
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
});

it.each(["block", "inline", "inline-block", "contents", "none"])(
	"does not generate an ordinary marker after display:%s overrides list-item",
	(display) => {
		const { tree } = fixture(`<li style="display:${display}">Item</li>`);
		expect(buildFormattingTree(tree).nodes.some((node) => node.marker)).toBe(
			false,
		);
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
	},
);

it("preserves ordinary marker visibility and zero-size suppression", () => {
	const { tree, id } = fixture(
		'<li id="item" style="visibility:hidden"><span style="visibility:visible">Visible</span></li>',
	);
	expect(
		buildFormattingTree(tree).nodes.find((node) => node.outsideMarker)?.visible,
	).toBe(false);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBeGreaterThan(0);
	tree.setAttribute(id("#item"), "style", "font-size:0");
	expect(buildFormattingTree(tree).nodes.some((node) => node.marker)).toBe(
		false,
	);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
});

it.each(["img", "button", "input", "select", "textarea", "meter", "progress"])(
	"keeps special %s list-item boxes deferred rather than dropping their marker",
	(tag) => {
		const { tree, id, ref } = fixture("<main></main>");
		tree.append(
			id("main"),
			tree.createElement(tag, {
				id: "special",
				style: "display:list-item",
			}),
		);
		const result = buildFormattingTree(tree);
		expect(
			result.nodes.find((node) => node.ref === ref("#special")),
		).toMatchObject({
			kind: "deferred",
			deferredReason: "element-layout-not-supported",
		});
		expect(result.issues["element-layout-not-supported"]).toBe(1);
		expect(() => rasterizeDocument(tree)).toThrow();
	},
);

it.each(["img", "dialog", "fieldset", "svg", "math"])(
	"defers special %s element layout without pretending to know intrinsic size",
	(tag) => {
		const { tree, id } = fixture("<main></main>");
		tree.append(id("main"), tree.createElement(tag, { id: "special" }));
		const result = buildFormattingTree(tree);
		expect(result.metrics.deferredSubtrees).toBe(1);
		expect(result.issues["element-layout-not-supported"]).toBe(1);
		expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	},
);

it.each([
	'style="position:absolute"',
	'style="float:left"',
	'style="filter:blur(1px)"',
	'dir="rtl"',
	'dir="auto"',
	'align="center"',
])(
	"refuses document width inference with unresolved styling or hints: %s",
	(attributes) => {
		const { tree } = fixture(`<main ${attributes}>text</main>`);
		expect(
			Object.keys(buildFormattingTree(tree).issues).length,
		).toBeGreaterThan(0);
		expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
	},
);

it("keeps global CSS diagnostics conservative even for unsupported declarations on hidden content", () => {
	const { tree } = fixture(
		'<style>#hidden{filter:blur(1px);display:none}</style><div id="hidden">hidden</div><main>text</main>',
	);
	expect(
		buildFormattingTree(tree).issues["css:unimplemented-css-property"],
	).toBe(1);
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("issue-free");
});

it("derives block containing widths through anonymous wrappers and inline ancestors", () => {
	const { tree, ref, styles } = fixture(
		'<main style="width:50%;padding:10px;margin:auto"><span style="width:1px">before<div id="child" style="width:50%;margin:auto">inside</div>after</span></main>',
	);
	styles.setViewport(800, 600);
	const result = resolveDocumentBlockWidths(tree);
	verifyTree(result.formatting);
	const main = result.widths.find((node) => node.ref === ref("main"));
	const child = result.widths.find((node) => node.ref === ref("#child"));
	expect(main).toMatchObject({
		contentWidth: 400,
		borderBoxWidth: 420,
		borderX: 190,
		contentX: 200,
	});
	expect(child).toMatchObject({
		containingWidth: 400,
		contentWidth: 200,
		borderX: 300,
		contentX: 300,
		containingBlock: main?.id,
	});
	expect(
		result.widths.filter((node) => !node.ref).map((node) => node.contentWidth),
	).toEqual([400, 400]);
});

it("rebuilds for resize and display mutation while saved results stay immutable", () => {
	const { tree, ref, id, styles } = fixture(
		'<main style="width:50%;margin:auto"><div id="child" style="width:50%"></div></main>',
	);
	styles.setViewport(800, 600);
	const saved = resolveDocumentBlockWidths(tree);
	styles.setViewport(400, 600);
	const resized = resolveDocumentBlockWidths(tree);
	expect(
		saved.widths.find((node) => node.ref === ref("#child"))?.contentWidth,
	).toBe(200);
	expect(
		resized.widths.find((node) => node.ref === ref("#child"))?.contentWidth,
	).toBe(100);
	tree.setAttribute(id("#child"), "style", "display:inline");
	expect(
		resolveDocumentBlockWidths(tree).widths.some(
			(node) => node.ref === ref("#child"),
		),
	).toBe(false);
});

it("bounds accumulated positions independently of each local width calculation", () => {
	const { tree, id } = fixture(
		'<main style="width:200px;margin-left:100px"><div id="child" style="width:1px;margin-left:16777216px"></div></main>',
	);
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("length limit");
	tree.setAttribute(id("#child"), "style", "width:1px");
	expect(() => resolveDocumentBlockWidths(tree)).not.toThrow();
});

it("enforces owned-node, box, depth, text and work limits without mutating the DOM", () => {
	const { tree } = fixture("<main><div>four</div></main>");
	const revision = tree.revision;
	for (const options of [
		{ maxOwnedNodes: 1 },
		{ maxBoxes: 2 },
		{ maxDepth: 1 },
		{ maxTextCodeUnits: 3 },
		{ maxWork: 1 },
	])
		expect(() => buildFormattingTree(tree, options)).toThrow("limit");
	expect(tree.revision).toBe(revision);
	const count = tree.nodeCount;
	tree.createElement("aside");
	expect(() => buildFormattingTree(tree, { maxOwnedNodes: count })).toThrow(
		"owned-node",
	);
	expect(() => buildFormattingTree(tree, { maxBoxes: 50_001 })).toThrow(
		"Invalid",
	);
	expect(() => buildFormattingTree(tree, { maxBoxes: 0 })).toThrow("Invalid");
	expect(() => buildFormattingTree(tree, { unknown: 1 } as never)).toThrow(
		"Invalid",
	);
});

it("bounds multiplicative inline fragment expansion", () => {
	const { tree, id } = fixture('<main id="target"></main>');
	let parent = id("#target");
	for (let depth = 0; depth < 12; depth++) {
		const child = tree.createElement("span");
		tree.append(parent, child);
		parent = child;
	}
	for (let index = 0; index < 12; index++)
		tree.append(parent, tree.createElement("div"));
	const revision = tree.revision;
	expect(() => buildFormattingTree(tree, { maxBoxes: 100 })).toThrow(
		"box limit",
	);
	expect(tree.revision).toBe(revision);
});

it("rejects closed owners without revoking already returned immutable data", () => {
	const { tree } = fixture("<main>saved</main>");
	const saved = buildFormattingTree(tree);
	tree.close();
	expect(() => buildFormattingTree(tree)).toThrow("closed");
	expect(() => resolveDocumentBlockWidths(tree)).toThrow("closed");
	expect(textOrder(saved)).toBe("saved");
});

it("preserves ownership, ordering and normalization across 60 generated mixed-flow documents", () => {
	let seed = 20260902;
	const next = (maximum: number) => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed % maximum;
	};
	for (let trial = 0; trial < 60; trial++) {
		const { tree, id, styles } = fixture("<main></main>");
		const parents = [id("main")];
		for (let index = 0; index < 45; index++) {
			const parent = parents[next(parents.length)];
			const display = ["block", "inline", "contents", "none"][next(4)];
			const child = tree.createElement("span", { style: `display:${display}` });
			tree.append(parent, child);
			tree.append(child, tree.createText(`t${index};`));
			parents.push(child);
		}
		const expected = [...tree.walk()]
			.filter(
				({ node }) => node.kind === "text" && styles.get(node.id).displayed,
			)
			.map(({ node }) => node.data)
			.join("");
		const formatting = buildFormattingTree(tree);
		verifyTree(formatting);
		expect(textOrder(formatting)).toBe(expected);
		for (const width of resolveDocumentBlockWidths(tree).widths)
			expect(
				width.marginLeft + width.borderBoxWidth + width.marginRight,
			).toBeCloseTo(width.containingWidth, 8);
	}
});
