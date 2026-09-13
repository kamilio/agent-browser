import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const pageUrl = "https://fixture.invalid/nonfloating-clearance";
const base =
	"html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px;background:blue}#cleared{clear:both;background:red}#after{background:green}";
const content =
	'<div id="before"><span id="float"></span>AA</div><div id="cleared">BB</div><div id="after">CC</div>';
const fixtures: {
	tree: ReturnType<typeof parseHtmlDocument>;
	query: DocumentQueries;
	geometry: ReturnType<typeof documentGeometry>;
	hits: ReturnType<typeof documentHitTesting>;
}[] = [];
const sessions: BrowserSession[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const { tree, query, geometry, hits } of fixtures.splice(0)) {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(query.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	}
});

function markup(css = "", children = content) {
	return `<!doctype html><style>${base}${css}</style><main id="main">${children}</main>`;
}

function fixture(css = "", children = content) {
	const tree = parseHtmlDocument(markup(css, children), pageUrl);
	documentStyles(tree).setViewport(96, 160);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null)
			throw new Error(`Missing clearance fixture ${selector}`);
		return found;
	};
	const context = (
		selector: string,
		layout: DocumentLayout = layoutDocument(tree),
	) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing clearance context ${selector}`);
		return found;
	};
	const result = {
		tree,
		query,
		geometry,
		hits,
		id,
		context,
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
		box: (selector: string) => {
			const found = layoutDocument(tree).boxes.find(
				(entry) => entry.ref === tree.reference(id(selector)),
			);
			if (!found) throw new Error(`Missing clearance box ${selector}`);
			return found;
		},
		pixel: (horizontal: number, vertical: number) => [
			...rasterizeDocument(tree, {
				clip: { x: horizontal, y: vertical, width: 1, height: 1 },
			}).image.pixels,
		],
	};
	fixtures.push(result);
	return result;
}

it.each([
	["left", 16],
	["right", 32],
	["both", 32],
] as const)(
	"clears a normal block past only the earlier %s floats",
	(clear, top) => {
		const { rect, context, hits, id } = fixture(
			`#float{height:12px;margin-bottom:4px}#right{float:right;width:8px;height:28px;margin-bottom:4px}#cleared{clear:${clear}}`,
			'<div id="before"><span id="float"></span><span id="right"></span>AA</div><div id="cleared">BB</div><div id="after">CC</div>',
		);
		expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 8, height: 12 });
		expect(rect("#right")).toMatchObject({ x: 24, y: 0, width: 8, height: 28 });
		expect(rect("#cleared")).toMatchObject({
			x: 0,
			y: top,
			width: 32,
			height: 8,
		});
		expect(rect("#after").y).toBe(top + 8);
		expect(
			context("#before").glyphs.map((glyph) => [glyph.x, glyph.y]),
		).toEqual([
			[8, 0],
			[14, 0],
		]);
		expect(hits.elementFromPoint(20, top + 1)).toBe(id("#cleared"));
	},
);

it("uses the float margin-box bottom including padding and borders", () => {
	const { rect, pixel, hits, id } = fixture(
		"#float{height:8px;padding:2px;border:1px solid blue;margin-top:3px;margin-bottom:4px}",
	);
	expect(rect("#float")).toMatchObject({ x: 0, y: 3, width: 14, height: 14 });
	expect(rect("#cleared")).toMatchObject({ x: 0, y: 21, width: 32, height: 8 });
	expect(rect("#after").y).toBe(29);
	expect(pixel(30, 22)).toEqual([255, 0, 0, 255]);
	expect(hits.elementFromPoint(30, 22)).toBe(id("#cleared"));
});

it.each([
	["left", "right"],
	["right", "left"],
] as const)(
	"keeps normal collapsed margins when %s does not match clear:%s",
	(side, clear) => {
		const { rect, hits, id } = fixture(
			`#float{float:${side};height:32px}#before{margin-bottom:6px}#cleared{clear:${clear};margin-top:4px}`,
		);
		expect(rect("#cleared")).toMatchObject({
			x: 0,
			y: 14,
			width: 32,
			height: 8,
		});
		expect(rect("#after").y).toBe(22);
		expect(hits.elementFromPoint(16, 15)).toBe(id("#cleared"));
	},
);

it.each([28, 46])(
	"keeps hypothetical Y46 and collapsed margins at or below float bottom %i",
	(bottom) => {
		const { rect } = fixture(
			`#float{height:${bottom}px}#before{height:40px;margin-bottom:4px}#cleared{margin-top:6px}`,
		);
		expect(rect("#cleared")).toMatchObject({ y: 46, height: 8 });
		expect(rect("#after").y).toBe(54);
		expect(rect("#before")).toMatchObject({ y: 0, height: 40 });
	},
);

it.each([
	{ bottom: 20, clearance: -4 },
	{ bottom: 24, clearance: 0 },
	{ bottom: 32, clearance: 8 },
])(
	"positions positive sibling margins with derived clearance $clearance at Y$bottom",
	({ bottom }) => {
		const { rect, box, context } = fixture(
			`#float{height:${bottom}px}#before{margin-bottom:8px}#cleared{margin-top:8px}`,
		);
		expect(rect("#cleared")).toMatchObject({
			x: 0,
			y: bottom,
			width: 32,
			height: 8,
		});
		expect(box("#cleared").marginTop).toBe(8);
		expect(box("#before").marginBottom).toBe(8);
		expect(
			context("#cleared").lines.map((line) => [line.top, line.height]),
		).toEqual([[bottom, 8]]);
		expect(rect("#after").y).toBe(bottom + 8);
	},
);

it("accepts simple signed sibling margins when actual clearance is needed", () => {
	const { rect, box, context, hits, id } = fixture(
		"#before{margin-bottom:-4px}#cleared{margin-top:8px}",
	);
	expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(box("#before").marginBottom).toBe(-4);
	expect(box("#cleared").marginTop).toBe(8);
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
	expect(context("#cleared").lines.map((line) => line.top)).toEqual([24]);
	expect(rect("#after").y).toBe(32);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#cleared"));
});

it("preserves signed collapsed sibling margins when clearance has no matching float", () => {
	const { rect, box, hits, id } = fixture(
		"#float{float:right;height:32px}#before{margin-bottom:-4px}#cleared{clear:left;margin-top:8px}",
	);
	expect(box("#before").marginBottom).toBe(-4);
	expect(box("#cleared").marginTop).toBe(8);
	expect(rect("#cleared")).toMatchObject({ y: 12, height: 8 });
	expect(rect("#after").y).toBe(20);
	expect(hits.elementFromPoint(16, 13)).toBe(id("#cleared"));
});

it("collapses outgoing margins after breaking the incoming clearance boundary", () => {
	const { rect, box } = fixture(
		"#float{height:20px}#before{margin-bottom:8px}#cleared{margin-top:8px;margin-bottom:5px}#after{margin-top:3px}",
	);
	expect(rect("#cleared")).toMatchObject({ y: 20, height: 8 });
	expect(rect("#after")).toMatchObject({ y: 33, height: 8 });
	expect(rect("#main").height).toBe(41);
	expect(box("#cleared").marginBottom).toBe(5);
	expect(box("#after").marginTop).toBe(3);
});

it("turns a zero-strut empty cleared block into a flow-advancing boundary", () => {
	const { id, rect, box, context, hits, pixel } = fixture(
		"",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared"></div><div id="after">CC</div>',
	);
	expect(rect("#cleared")).toMatchObject({ x: 0, y: 24, width: 32, height: 0 });
	expect(box("#cleared").marginCollapse).toMatchObject({
		top: { value: 0 },
		bottom: { value: 0 },
		through: false,
	});
	expect(context("#cleared").lines).toEqual([]);
	expect(context("#cleared").glyphs).toEqual([]);
	expect(context("#before").lines.map((line) => line.top)).toEqual([0]);
	expect(rect("#after")).toMatchObject({ y: 24, height: 8 });
	expect(rect("#main").height).toBe(32);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#after"));
	expect(pixel(30, 25)).toEqual([0, 128, 0, 255]);
});

it("recomputes ancestor height and outgoing bottom struts after empty clearance", () => {
	const { rect, box, context, hits, id } = fixture(
		"#before{margin-bottom:8px}",
		'<section id="wrapper"><div id="before"><span id="float"></span>AA</div><div id="cleared"></div></section><div id="after">CC</div>',
	);
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
	expect(box("#before").marginBottom).toBe(8);
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 0 });
	expect(box("#cleared").marginCollapse.through).toBe(false);
	expect(rect("#wrapper")).toMatchObject({ y: 0, height: 24 });
	expect(box("#wrapper").marginCollapse.bottom.value).toBe(0);
	expect(rect("#after")).toMatchObject({ y: 24, height: 8 });
	expect(context("#after").lines.map((line) => line.top)).toEqual([24]);
	expect(rect("#main").height).toBe(32);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#after"));
});

it("clears a fixed-height empty leaf without inventing a text line", () => {
	const { tree, id, rect, pixel } = fixture(
		"#cleared{height:10px;padding-top:2px;border-top:1px solid red}",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared"></div><div id="after">CC</div>',
	);
	expect(rect("#cleared")).toMatchObject({ y: 24, width: 32, height: 13 });
	expect(rect("#after").y).toBe(37);
	const context = layoutDocument(tree).contexts.find(
		(entry) => entry.ref === tree.reference(id("#cleared")),
	);
	expect(context?.lines.length ?? 0).toBe(0);
	expect(pixel(30, 25)).toEqual([255, 0, 0, 255]);
});

it("rewraps cleared text at full width without translating the earlier narrow lines", () => {
	const { rect, context } = fixture(
		"#float{width:18px;height:32px}",
		'<div id="before"><span id="float"></span>AA BB</div><div id="cleared">AA BB</div><div id="after">CC</div>',
	);
	expect(context("#before").lines.map((line) => line.top)).toEqual([0, 8]);
	expect(
		context("#before")
			.glyphs.filter((glyph) => glyph.character !== " ")
			.map((glyph) => glyph.x),
	).toEqual([18, 24, 18, 24]);
	expect(
		context("#cleared").lines.map((line) => [line.top, line.height]),
	).toEqual([[32, 8]]);
	expect(
		context("#cleared")
			.glyphs.filter((glyph) => glyph.character !== " ")
			.map((glyph) => glyph.x),
	).toEqual([0, 6, 18, 24]);
	expect(rect("#cleared")).toMatchObject({ x: 0, y: 32, width: 32, height: 8 });
	expect(rect("#after").y).toBe(40);
});

it("positions ordinary descendants from their parent's cleared content origin", () => {
	const { rect, context, hits, id } = fixture(
		"",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared"><div id="child">BB</div></div><div id="after">CC</div>',
	);
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
	expect(rect("#child")).toMatchObject({ x: 0, y: 24, width: 32, height: 8 });
	expect(context("#child").glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
		[0, 24],
		[6, 24],
	]);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#child"));
	expect(rect("#after").y).toBe(32);
});

it("places a float inside the cleared block only after resolving its origin", () => {
	const { tree, id, rect, context, hits } = fixture(
		"#inner{float:right;width:8px;height:16px;background:green}",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared"><span id="inner"></span>BB</div><div id="after">CC</div>',
	);
	expect(rect("#float")).toMatchObject({ x: 0, y: 0, height: 24 });
	expect(rect("#inner")).toMatchObject({ x: 24, y: 24, width: 8, height: 16 });
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
	expect(rect("#after").y).toBe(32);
	expect(context("#cleared").glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual(
		[
			[0, 24],
			[6, 24],
		],
	);
	expect(hits.elementFromPoint(25, 25)).toBe(id("#inner"));
	expect(
		layoutDocument(tree).boxes.filter(
			(box) => box.ref === tree.reference(id("#inner")),
		),
	).toHaveLength(1);
});

it("does not consult later source floats when clearing an earlier block", () => {
	const { rect } = fixture(
		"#later{float:left;width:8px;height:100px}",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared">BB</div><div id="after"><span id="later"></span>CC</div>',
	);
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
	expect(rect("#later")).toMatchObject({ x: 0, y: 32, width: 8, height: 100 });
	expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
});

it("does not import an independent sibling's overflowing float into clearance", () => {
	const { rect } = fixture(
		"#island{display:flow-root;height:8px}",
		'<section id="island"><div id="before"><span id="float"></span>AA</div></section><div id="cleared">BB</div><div id="after">CC</div>',
	);
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(rect("#island")).toMatchObject({ y: 0, height: 8 });
	expect(rect("#cleared")).toMatchObject({ y: 8, height: 8 });
	expect(rect("#after").y).toBe(16);
});

it("converts an offset float owner's bottom to document coordinates exactly once", () => {
	const { rect, hits, id } = fixture(
		"main{display:flow-root;border-top:1px solid black;padding-top:3px;border-left:2px solid black}#float{margin-bottom:4px}",
	);
	expect(rect("#float")).toMatchObject({ x: 2, y: 4, width: 8, height: 24 });
	expect(rect("#cleared")).toMatchObject({ x: 2, y: 32, width: 32, height: 8 });
	expect(rect("#after")).toMatchObject({ x: 2, y: 40, height: 8 });
	expect(hits.elementFromPoint(31, 33)).toBe(id("#cleared"));
});

it("reuses geometry identities and hit regions across unchanged clearance queries", () => {
	const { tree, id, geometry, hits, rect } = fixture();
	const target = id("#cleared");
	const rectangle = rect("#cleared");
	const rectangles = geometry.getClientRects(target);
	const geometryBuilds = geometry.metrics().builds;
	expect(hits.elementFromPoint(30, 25)).toBe(target);
	const hitBuilds = hits.metrics().builds;
	expect(documentGeometry(tree)).toBe(geometry);
	expect(documentHitTesting(tree)).toBe(hits);
	expect(rect("#cleared")).toBe(rectangle);
	expect(geometry.getClientRects(target)).toBe(rectangles);
	expect(hits.elementFromPoint(30, 25)).toBe(target);
	expect(geometry.metrics().builds).toBe(geometryBuilds);
	expect(hits.metrics().builds).toBe(hitBuilds);
	expect(rectangle).toMatchObject({ y: 24, height: 8 });
});

it("invalidates clearance geometry, paint and hits when a float grows", () => {
	const { tree, id, rect, hits, pixel } = fixture();
	const original = rect("#cleared");
	expect(original.y).toBe(24);
	tree.setAttribute(id("#float"), "style", "height:32px");
	expect(rect("#cleared")).toMatchObject({ y: 32, height: 8 });
	expect(rect("#after").y).toBe(40);
	expect(hits.elementFromPoint(30, 33)).toBe(id("#cleared"));
	expect(hits.elementFromPoint(30, 41)).toBe(id("#after"));
	expect(pixel(30, 33)).toEqual([255, 0, 0, 255]);
	expect(original).toMatchObject({ y: 24, height: 8 });
});

it("reselects the physical floor after mutating clear without moving floats", () => {
	const { tree, id, rect } = fixture(
		"#float{height:16px}#right{float:right;width:8px;height:32px}",
		'<div id="before"><span id="float"></span><span id="right"></span>AA</div><div id="cleared">BB</div><div id="after">CC</div>',
	);
	expect(rect("#cleared").y).toBe(32);
	tree.setAttribute(id("#cleared"), "style", "clear:left");
	expect(rect("#cleared").y).toBe(16);
	expect(rect("#after").y).toBe(24);
	tree.setAttribute(id("#cleared"), "style", "clear:right");
	expect(rect("#cleared").y).toBe(32);
	expect(rect("#float")).toMatchObject({ y: 0, height: 16 });
	expect(rect("#right")).toMatchObject({ y: 0, height: 32 });
});

it("drops a removed float's clearance and detached hit ownership", () => {
	const { tree, id, rect, geometry, hits } = fixture();
	const floated = id("#float");
	expect(rect("#cleared").y).toBe(24);
	tree.remove(floated);
	expect(rect("#cleared")).toMatchObject({ y: 8, height: 8 });
	expect(rect("#after").y).toBe(16);
	expect(geometry.getClientRects(floated)).toEqual([]);
	expect(hits.elementFromPoint(1, 1)).toBe(id("#before"));
	expect(hits.elementFromPoint(30, 9)).toBe(id("#cleared"));
});

it("retains one immutable source owner per box and closes all document caches", () => {
	const { tree, query, geometry, hits, id, rect } = fixture();
	const before = snapshotDocument(tree);
	const revision = tree.revision;
	const layout = layoutDocument(tree);
	const rectangle = rect("#cleared");
	for (const selector of ["#main", "#before", "#float", "#cleared", "#after"])
		expect(
			layout.boxes.filter((box) => box.ref === tree.reference(id(selector))),
		).toHaveLength(1);
	for (const selector of ["#before", "#cleared", "#after"])
		expect(
			layout.contexts.filter(
				(context) => context.ref === tree.reference(id(selector)),
			),
		).toHaveLength(1);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#cleared"));
	expect(Object.isFrozen(layout.boxes)).toBe(true);
	expect(Object.isFrozen(rectangle)).toBe(true);
	expect(tree.revision).toBe(revision);
	expect(snapshotDocument(tree)).toEqual(before);
	tree.close();
	expect(tree.nodeCount).toBe(0);
	expect(query.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(rectangle).toMatchObject({ y: 24, height: 8 });
});

it("keeps raw float and clear diagnostics inspectable after supported layout", () => {
	const { tree, rect } = fixture();
	const formatting = buildFormattingTree(tree);
	const issues = { ...formatting.issues };
	expect(issues["float-layout-not-supported"]).toBe(1);
	expect(issues["clear-layout-not-supported"]).toBe(1);
	expect(rect("#cleared").y).toBe(24);
	expect(formatting.issues).toEqual(issues);
	expect(buildFormattingTree(tree).issues).toEqual(issues);
});

it("does not guard a no-op clear merely because an ancestor margin escaped", () => {
	const { rect } = fixture(
		"#float{float:right}#cleared{clear:left;margin-top:12px}",
		'<div id="before"><span id="float"></span>AA</div><section id="wrapper"><div id="cleared">BB</div></section><div id="after">CC</div>',
	);
	expect(rect("#wrapper")).toMatchObject({ y: 20, height: 8 });
	expect(rect("#cleared")).toMatchObject({ y: 20, height: 8 });
	expect(rect("#after").y).toBe(28);
});

it("admits clearance when the parent's own margin dominates its escaped top strut", () => {
	const { rect, box, context, hits, id } = fixture(
		"#float{height:48px}#wrapper{margin-top:16px}#cleared{margin-top:12px}",
		'<div id="before"><span id="float"></span>AA</div><section id="wrapper"><div id="cleared">BB</div></section><div id="after">CC</div>',
	);
	expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
	expect(rect("#float")).toMatchObject({ y: 0, height: 48 });
	expect(rect("#wrapper")).toMatchObject({ y: 24, height: 32 });
	expect(box("#wrapper").marginTop).toBe(16);
	expect(box("#wrapper").marginCollapse.top.value).toBe(16);
	expect(box("#cleared").marginTop).toBe(12);
	expect(rect("#cleared")).toMatchObject({ y: 48, height: 8 });
	expect(context("#cleared").lines.map((line) => line.top)).toEqual([48]);
	expect(rect("#after").y).toBe(56);
	expect(rect("#main").height).toBe(64);
	expect(hits.elementFromPoint(30, 49)).toBe(id("#cleared"));
});

it("prepares contributing first-child clearance before positioning its ancestor", () => {
	const { tree, rect, box, context, hits, id } = fixture(
		"#cleared{margin-top:12px}",
		'<div id="before"><span id="float"></span>AA</div><section id="wrapper"><div id="cleared">BB</div></section><div id="after">CC</div>',
	);
	const before = snapshotDocument(tree);
	expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(rect("#wrapper")).toMatchObject({ y: 8, height: 24 });
	expect(box("#wrapper").marginCollapse.top.value).toBe(0);
	expect(box("#cleared").marginTop).toBe(12);
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
	expect(context("#cleared").lines.map((line) => line.top)).toEqual([24]);
	expect(rect("#after").y).toBe(32);
	expect(rect("#main").height).toBe(40);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#cleared"));
	expect(snapshotDocument(tree)).toEqual(before);
});

it("retains the actual-clearance guard on a nonzero-through cleared empty block", () => {
	const { tree } = fixture(
		"#cleared{margin-top:4px;margin-bottom:6px}",
		'<div id="before"><span id="float"></span>AA</div><div id="cleared"></div><div id="after">CC</div>',
	);
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("retains the actual-clearance guard across an adjoining empty-margin chain", () => {
	const { tree } = fixture(
		"#empty{margin-top:4px;margin-bottom:6px}",
		'<div id="before"><span id="float"></span>AA</div><div id="empty"></div><div id="cleared">BB</div><div id="after">CC</div>',
	);
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it.each([
	["flex", "#after{display:flex}", ""],
	["grid", "#after{display:grid}", ""],
	["table", "", "<table><tr><td>DD</td></tr></table>"],
])(
	"retains clearance with supported %s shell ownership",
	(name, css, extra) => {
		const { tree, id, rect, hits, pixel } = fixture(css, content + extra);
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const layout = layoutDocument(tree);
		expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 8, height: 24 });
		expect(rect("#before")).toMatchObject({ x: 0, y: 0, width: 32, height: 8 });
		expect(rect("#cleared")).toMatchObject({
			x: 0,
			y: 24,
			width: 32,
			height: 8,
		});
		expect(rect("#after")).toMatchObject({ x: 0, y: 32, width: 32, height: 8 });
		const glyphs = layout.contexts.flatMap((context) => context.glyphs);
		for (const [character, left, top] of [
			["A", 8, 0],
			["B", 0, 24],
			["C", 0, 32],
		] as const)
			expect(
				glyphs
					.filter((glyph) => glyph.character === character)
					.map((glyph) => [glyph.x, glyph.y]),
			).toEqual([
				[left, top],
				[left + 6, top],
			]);
		if (name === "table") {
			expect(rect("table")).toMatchObject({
				x: 0,
				y: 40,
				width: 18,
				height: 14,
			});
			expect(rect("td")).toMatchObject({
				x: 2,
				y: 42,
				width: 14,
				height: 10,
			});
			expect(
				glyphs
					.filter((glyph) => glyph.character === "D")
					.map((glyph) => [glyph.x, glyph.y]),
			).toEqual([
				[3, 43],
				[9, 43],
			]);
			expect(hits.elementFromPoint(1, 41)).toBe(id("table"));
			expect(hits.elementFromPoint(3, 43)).toBe(id("td"));
		}
		expect(glyphs).toHaveLength(name === "table" ? 8 : 6);
		expect(rect("#main").height).toBe(name === "table" ? 54 : 40);
		const shell = name === "table" ? "table" : "#after";
		expect(
			layout.boxes.filter((box) => box.ref === tree.reference(id(shell))),
		).toHaveLength(1);
		expect(hits.elementFromPoint(1, 1)).toBe(id("#float"));
		expect(hits.elementFromPoint(30, 25)).toBe(id("#cleared"));
		expect(hits.elementFromPoint(30, 33)).toBe(id("#after"));
		expect(pixel(1, 1)).toEqual([0, 0, 255, 255]);
		expect(pixel(30, 25)).toEqual([255, 0, 0, 255]);
		expect(pixel(30, 33)).toEqual([0, 128, 0, 255]);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it.each([
	["logical clear", "#cleared{clear:inline-start}", ""],
	["unrelated CSS", "#cleared{animation-name:spin}", ""],
	[
		"deferred relative legend",
		"",
		'<fieldset><legend style="position:relative;top:2px">Label</legend>DD</fieldset>',
	],
])("preserves the independent %s guard", (_name, css, extra) => {
	const { tree, rect, hits } = fixture(css, content + extra);
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => rect("#cleared")).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => hits.elementFromPoint(30, 25)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("preserves the document work cap without mutating source or poisoning later queries", () => {
	const { tree, rect } = fixture();
	const before = snapshotDocument(tree);
	expect(() => layoutDocument(tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(snapshotDocument(tree)).toEqual(before);
	expect(rect("#cleared")).toMatchObject({ y: 24, height: 8 });
});

it("clicks a genuinely laid-out cleared link using only native in-memory responses", async () => {
	const destination = "https://fixture.invalid/nonfloating-clearance-done";
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				if (![pageUrl, destination].includes(request.url))
					throw new Error(`Unexpected in-memory request: ${request.url}`);
				requests.push(request);
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				response.url === pageUrl
					? markup(
							"",
							`<div id="before"><span id="float"></span>AA</div><div id="cleared"><a id="target" href="${destination}">BB</a></div><div id="after">CC</div>`,
						)
					: "<!doctype html><title>Done</title><p id=done>Done</p>",
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, pageUrl);
	const page = session.page(tab.id);
	const source = page.document;
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing cleared native link");
	const geometry = documentGeometry(source);
	const hits = documentHitTesting(source);
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 0,
		y: 24,
		width: 12,
		height: 8,
	});
	expect(hits.elementFromPoint(1, 25)).toBe(target);
	const clicked = await session.click(tab.id, source.reference(target));
	expect(clicked.navigation?.kind).toBe("document");
	expect(session.page(tab.id).document.url).toBe(destination);
	expect(requests.map((request) => request.url)).toEqual([
		pageUrl,
		destination,
	]);
	expect(session.metrics().commits).toBe(2);
	expect(source.nodeCount).toBe(0);
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	session.close();
	expect(closed).toBe(true);
	expect(session.metrics()).toMatchObject({ closed: true, pendingLoads: 0 });
});
