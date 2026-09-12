import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { layoutFormattingFloatDocument } from "./float-document.js";
import { buildFormattingTree, formattingLimits } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const pageUrl = "https://fixture.invalid/clear-applicability-layout";
const base =
	"html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px;background:blue}#target{clear:left;background:red}#cleared{clear:both}#after{background:green}";
const content =
	'<span id="float"></span><a id="target" href="/next">AA</a><div id="cleared">BB</div><div id="after">CC</div>';
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
	documentStyles(tree).setViewport(96, 96);
	const query = new DocumentQueries(tree);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	fixtures.push({ tree, query, geometry, hits });
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null)
			throw new Error(`Missing applicability layout ${selector}`);
		return found;
	};
	return {
		tree,
		query,
		geometry,
		hits,
		id,
		rect: (selector: string) => geometry.getBoundingClientRect(id(selector)),
		pixel: (horizontal: number, vertical: number) => [
			...rasterizeDocument(tree, {
				clip: { x: horizontal, y: vertical, width: 1, height: 1 },
			}).image.pixels,
		],
	};
}

it.each(["left", "right", "both", "inline-start", "inline-end"])(
	"keeps inline clear:%s beside the float while a later block genuinely clears",
	(clear) => {
		const { tree, id, rect, hits, pixel } = fixture(`#target{clear:${clear}}`);
		const before = snapshotDocument(tree);
		expect(documentStyles(tree).flow(id("#target")).clear).toBe(clear);
		expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 8, height: 24 });
		expect(rect("#target")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
		expect(rect("#cleared")).toMatchObject({
			x: 0,
			y: 24,
			width: 32,
			height: 8,
		});
		expect(rect("#after").y).toBe(32);
		expect(
			layoutDocument(tree)
				.contexts.flatMap((context) => context.glyphs)
				.filter((glyph) => glyph.character === "A")
				.map((glyph) => [glyph.x, glyph.y]),
		).toEqual([
			[8, 0],
			[14, 0],
		]);
		expect(hits.elementFromPoint(9, 1)).toBe(id("#target"));
		expect(pixel(9, 1)).toEqual([255, 0, 0, 255]);
		expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
			1,
		);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it.each(["left", "inline-start"])(
	"lays out an inline-block with ignored clear:%s as an atomic inline box",
	(clear) => {
		const { tree, id, rect, hits, pixel } = fixture(
			`#target{display:inline-block;width:12px;clear:${clear}}`,
		);
		expect(rect("#target")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
		expect(rect("#cleared").y).toBe(24);
		expect(rect("#after").y).toBe(32);
		const context = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id("#target")),
		);
		expect(context?.glyphs.map((glyph) => [glyph.x, glyph.y])).toEqual([
			[8, 0],
			[14, 0],
		]);
		expect(hits.elementFromPoint(9, 7)).toBe(id("#target"));
		expect(pixel(9, 7)).toEqual([255, 0, 0, 255]);
	},
);

it.each([
	["left", 24],
	["right", 16],
	["both", 24],
] as const)(
	"still applies physical clear:%s after a link becomes block-level",
	(clear, top) => {
		const { tree, id, rect, hits } = fixture(
			`#target{display:block;clear:${clear}}#right{float:right;width:8px;height:16px}`,
			'<div id="before"><span id="float"></span><span id="right"></span>BB</div><a id="target" href="/next">AA</a><div id="after">CC</div>',
		);
		expect(rect("#target")).toMatchObject({
			x: 0,
			y: top,
			width: 32,
			height: 8,
		});
		expect(rect("#before")).toMatchObject({ y: 0, height: 8 });
		expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
		expect(rect("#right")).toMatchObject({ y: 0, height: 16 });
		expect(rect("#after").y).toBe(top + 8);
		expect(hits.elementFromPoint(16, top + 1)).toBe(id("#target"));
		expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
			1,
		);
	},
);

it("physically clears a floated inline link and advances the following clearing block", () => {
	const { tree, id, rect, hits } = fixture(
		"#target{float:right;clear:both;width:12px;height:8px}",
	);
	expect(rect("#float")).toMatchObject({ y: 0, height: 24 });
	expect(rect("#target")).toMatchObject({ x: 20, y: 24, width: 12, height: 8 });
	expect(rect("#cleared").y).toBe(32);
	expect(rect("#after").y).toBe(40);
	expect(hits.elementFromPoint(21, 25)).toBe(id("#target"));
	expect(buildFormattingTree(tree).issues).toMatchObject({
		"float-layout-not-supported": 2,
		"clear-layout-not-supported": 2,
	});
});

it("invalidates geometry and hit caches when display toggles clear applicability", () => {
	const { tree, id, rect, hits, pixel } = fixture();
	const original = rect("#target");
	expect(original).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	expect(hits.elementFromPoint(9, 1)).toBe(id("#target"));
	tree.setAttribute(id("#target"), "style", "display:block");
	expect(rect("#target")).toMatchObject({ x: 0, y: 24, width: 32, height: 8 });
	expect(rect("#cleared").y).toBe(32);
	expect(rect("#after").y).toBe(40);
	expect(hits.elementFromPoint(30, 25)).toBe(id("#target"));
	expect(pixel(30, 25)).toEqual([255, 0, 0, 255]);
	tree.setAttribute(id("#target"), "style", "display:inline");
	expect(rect("#target")).toEqual(original);
	expect(rect("#cleared").y).toBe(24);
	expect(hits.elementFromPoint(9, 1)).toBe(id("#target"));
	expect(original.y).toBe(0);
});

it("adds and removes genuine float clearance ownership after float mutations", () => {
	const { tree, id, rect } = fixture();
	expect(rect("#target")).toMatchObject({ x: 8, y: 0 });
	tree.setAttribute(id("#target"), "style", "float:left;width:12px;height:8px");
	expect(rect("#target")).toMatchObject({ x: 0, y: 24, width: 12, height: 8 });
	expect(rect("#cleared").y).toBe(32);
	expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
		2,
	);
	tree.setAttribute(id("#target"), "style", "float:none");
	expect(rect("#target")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	expect(rect("#cleared").y).toBe(24);
	expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
		1,
	);
});

it("reuses unchanged inline geometry and reflows text without reviving ignored clear", () => {
	const { tree, id, geometry, hits, rect } = fixture();
	const original = rect("#target");
	const fragments = geometry.getClientRects(id("#target"));
	const builds = geometry.metrics().builds;
	expect(rect("#target")).toBe(original);
	expect(geometry.getClientRects(id("#target"))).toBe(fragments);
	expect(geometry.metrics().builds).toBe(builds);
	tree.setTextContent(id("#target"), "AAAA");
	expect(rect("#target")).toMatchObject({ x: 8, y: 0, width: 24, height: 8 });
	expect(hits.elementFromPoint(30, 1)).toBe(id("#target"));
	expect(rect("#cleared").y).toBe(24);
	expect(original).toMatchObject({ width: 12, y: 0 });
});

it("positions both ignored-clear inline fragments around an ordinary block child", () => {
	const { tree, id, geometry } = fixture(
		"",
		'<span id="float"></span><span id="target">AA<div id="inside">BB</div>CC</span><div id="cleared">DD</div><div id="after">EE</div>',
	);
	const before = snapshotDocument(tree);
	const reference = tree.reference(id("#target"));
	const layout = layoutDocument(tree);
	const formatting = buildFormattingTree(tree);
	expect(documentStyles(tree).flow(id("#target")).clear).toBe("left");
	const owners = formatting.nodes.filter((node) => node.ref === reference);
	expect(owners).toHaveLength(2);
	for (const owner of owners) expect(owner.clear).toBeUndefined();
	expect(
		layout.contexts
			.flatMap((context) => context.fragments)
			.filter((fragment) => fragment.ref === reference),
	).toMatchObject([
		{ x: 8, y: 0, width: 12, height: 8 },
		{ x: 8, y: 16, width: 12, height: 8 },
	]);
	expect(
		layout.contexts
			.flatMap((context) => context.glyphs)
			.filter((glyph) => ["A", "B", "C"].includes(glyph.character))
			.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["A", 8, 0],
		["A", 14, 0],
		["B", 8, 8],
		["B", 14, 8],
		["C", 8, 16],
		["C", 14, 16],
	]);
	for (const [selector, top] of [
		["#inside", 8],
		["#cleared", 24],
		["#after", 32],
	] as const)
		expect(
			layout.boxes.find((box) => box.ref === tree.reference(id(selector))),
		).toMatchObject({
			borderX: 0,
			borderY: top,
			borderBoxWidth: 32,
			borderBoxHeight: 8,
		});
	expect(formatting.issues["clear-layout-not-supported"]).toBe(1);
	expect(() => geometry.getClientRects(id("#target"))).toThrow(
		expect.objectContaining({
			code: "unsupported",
			message: "Client geometry for block-in-inline splits is not implemented",
		}),
	);
	expect(snapshotDocument(tree)).toEqual(before);
});

it("lays out display:contents descendants without applying their parent's clear", () => {
	const { tree, id, rect, hits } = fixture(
		"#target{display:contents}",
		'<span id="float"></span><span id="target"><span id="child">AA</span></span><div id="cleared">BB</div><div id="after">CC</div>',
	);
	expect(documentStyles(tree).flow(id("#target")).clear).toBe("left");
	expect(documentStyles(tree).flow(id("#child")).clear).toBe("none");
	expect(rect("#child")).toMatchObject({ x: 8, y: 0, width: 12, height: 8 });
	expect(rect("#cleared").y).toBe(24);
	expect(hits.elementFromPoint(9, 1)).toBe(id("#child"));
});

it("does not move a native inline control when its ignored clear changes", () => {
	const { tree, id, rect, hits } = fixture(
		"#target{display:inline;clear:none;width:12px;height:8px;padding:0;border:0;margin:0}",
		'<span id="float"></span><input id="target" type="checkbox"><div id="cleared">BB</div><div id="after">CC</div>',
	);
	const original = rect("#target");
	expect(original).toMatchObject({ x: 8, width: 12, height: 8 });
	tree.setAttribute(id("#target"), "style", "clear:both");
	expect(documentStyles(tree).flow(id("#target")).clear).toBe("both");
	expect(rect("#target")).toEqual(original);
	expect(rect("#cleared").y).toBe(24);
	expect(hits.elementFromPoint(original.x + 2, original.y + 2)).toBe(
		id("#target"),
	);
	expect(buildFormattingTree(tree).issues["clear-layout-not-supported"]).toBe(
		1,
	);
});

it.each(["inline-start", "inline-end"])(
	"keeps applicable logical clear:%s guarded on a block",
	(clear) => {
		const { tree } = fixture(`#target{display:block;clear:${clear}}`);
		const before = snapshotDocument(tree);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it.each([
	["flex", "#after{display:flex}", ""],
	["grid", "#after{display:grid}", ""],
	["table", "", "<table><tr><td>DD</td></tr></table>"],
])(
	"does not erase the independent %s guard when inline clear is ignored",
	(_name, css, extra) => {
		const { tree, id } = fixture(css, content + extra);
		const formatting = buildFormattingTree(tree);
		expect(
			formatting.nodes.find(
				(node) => node.ref === tree.reference(id("#target")),
			)?.clear,
		).toBeUndefined();
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each([
	{ kind: "inline", level: "block" },
	{ kind: "block", level: "inline" },
	{ kind: "replaced", level: "inline" },
] as const)(
	"rejects forged clear ownership on kind:$kind level:$level",
	({ kind, level }) => {
		const { tree, id } = fixture("#target{display:block}");
		const original = buildFormattingTree(tree);
		const reference = tree.reference(id("#target"));
		const forged = {
			...original,
			nodes: original.nodes.map((node) =>
				node.ref === reference ? { ...node, kind, level } : node,
			),
		};
		expect(() =>
			layoutFormattingFloatDocument(forged, formattingLimits.maxWork),
		).toThrow(
			expect.objectContaining({
				code: "unsupported",
				message: "Clearance requires a supported block owner",
			}),
		);
		expect(original.nodes.find((node) => node.ref === reference)).toMatchObject(
			{ kind: "block", level: "block", clear: "left" },
		);
	},
);

it("activates an ignored-logical-clear inline link using only native in-memory responses", async () => {
	const destination = "https://fixture.invalid/next";
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				if (![pageUrl, destination].includes(request.url))
					throw new Error(`Unexpected mock request ${request.url}`);
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
					? markup("#target{clear:inline-start}")
					: "<!doctype html><title>Done</title><p>Done</p>",
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, pageUrl);
	const page = session.page(tab.id);
	const source = page.document;
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing inline activation target");
	const geometry = documentGeometry(source);
	const hits = documentHitTesting(source);
	expect(page.styles.flow(target).clear).toBe("inline-start");
	expect(geometry.getBoundingClientRect(target)).toMatchObject({
		x: 8,
		y: 0,
		width: 12,
		height: 8,
	});
	expect(hits.elementFromPoint(9, 1)).toBe(target);
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
