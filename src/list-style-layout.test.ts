import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { disclosureMarkerText } from "./disclosure-marker.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { outsideMarkerRects } from "./outside-markers.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
const queryOwners: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	markup = '<ul id="list"><li id="item"><a id="link" href="/next">AA</a></li></ul>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}body{padding-left:64px}ol,ul,li{margin:0;padding:0}li{color:red}</style><style id="sheet">${css}</style>${markup}`,
		"https://fixture.invalid/list-style-layout",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(240, 120);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing list-style fixture ${selector}`);
		return found;
	};
	const markers = () =>
		buildFormattingTree(tree).nodes.filter(
			(node) => node.marker || node.outsideMarker,
		);
	const values = (selector = "#item") => ({
		type: resolvedStyleValue(tree, id(selector), "list-style-type"),
		position: resolvedStyleValue(tree, id(selector), "list-style-position"),
		image: resolvedStyleValue(tree, id(selector), "list-style-image"),
	});
	return { tree, queries, styles, geometry, hits, id, markers, values };
}

function firstGlyph(tree: ReturnType<typeof parseHtmlDocument>) {
	const glyph = layoutDocument(tree).contexts.flatMap(
		(context) => context.glyphs,
	)[0];
	if (!glyph) throw new Error("Missing list-style fixture glyph");
	return glyph;
}

function outsideState(tree: ReturnType<typeof parseHtmlDocument>) {
	const layout = layoutDocument(tree);
	const marker = [...outsideMarkerRects(layout, () => {})][0];
	if (!marker) throw new Error("Missing list-style outside marker");
	const box = layout.boxes.find((entry) => entry.id === marker.id);
	if (!box) throw new Error("Missing list-style marker principal box");
	return { marker, box };
}

function expectLinkHit(test: ReturnType<typeof fixture>, expectedX: number) {
	const link = test.id("#link");
	const rect = test.geometry.getBoundingClientRect(link);
	expect(rect).toMatchObject({ x: expectedX, width: 12, height: 8 });
	expect(
		test.hits.elementFromPoint(
			rect.x + rect.width / 2,
			rect.y + rect.height / 2,
		),
	).toBe(link);
}

it("removes navigation markers with source list-style:none while preserving link hits", () => {
	const test = fixture("ul{list-style:none}");
	expect(test.values()).toEqual({
		type: "none",
		position: "outside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expect(buildFormattingTree(test.tree).issues).toEqual({});
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
	expectLinkHit(test, 64);
});

it("does not reserve inside advance for list-style:inside none", () => {
	const test = fixture("li{list-style:inside none}");
	expect(test.values()).toEqual({
		type: "none",
		position: "inside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expect(firstGlyph(test.tree).x).toBe(64);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
	expectLinkHit(test, 64);
});

it("places a shorthand disc outside the principal rectangle and assigns its hit to the item", () => {
	const test = fixture("li{list-style:disc outside}");
	expect(test.markers()[0].outsideMarker).toEqual({ type: "disc" });
	const { marker, box } = outsideState(test.tree);
	expect(marker.width).toBe(8);
	expect(marker.x + marker.width).toBe(box.borderX);
	expect(test.geometry.getBoundingClientRect(test.id("#item")).x).toBe(64);
	expect(test.geometry.getClientRects(test.id("#item"))).toHaveLength(1);
	expect(test.hits.elementFromPoint(marker.x + 4, marker.y + 3)).toBe(
		test.id("#item"),
	);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 64);
});

it("advances link geometry by the inside disc width", () => {
	const test = fixture("li{list-style:inside disc}");
	expect(test.markers()[0].marker).toEqual({ type: "disc" });
	expect(test.markers()[0].intrinsic).toEqual({ width: 8, height: 7 });
	expect([
		...outsideMarkerRects(layoutDocument(test.tree), () => {}),
	]).toHaveLength(0);
	expect(firstGlyph(test.tree).x).toBe(72);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 72);
});

it("uses multi-digit shorthand decimal widths without moving outside list content", () => {
	const test = fixture(
		"ol{list-style:outside decimal}",
		'<ol start="10"><li id="item"><a id="link" href="/next">AA</a></li></ol>',
	);
	expect(test.markers()[0].outsideMarker).toEqual({
		type: "decimal",
		ordinal: 10,
	});
	const { marker, box } = outsideState(test.tree);
	expect(marker.width).toBe(24);
	expect(marker.x + marker.width).toBe(box.borderX);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 64);
});

it("uses multi-digit shorthand decimal advance for inside content", () => {
	const test = fixture(
		"ol{list-style:decimal inside none}",
		'<ol start="10"><li id="item"><a id="link" href="/next">AA</a></li></ol>',
	);
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 10 });
	expect(test.markers()[0].intrinsic).toEqual({ width: 24, height: 7 });
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 88);
});

it("renders a shorthand leading-zero marker with its numeric suffix", () => {
	const test = fixture("li{list-style:none inside decimal-leading-zero}");
	const marker = test.markers()[0].marker;
	expect(marker).toEqual({ type: "decimal-leading-zero", ordinal: 1 });
	if (!marker) throw new Error("Missing numeric marker");
	expect(disclosureMarkerText(marker)).toBe("01. ");
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 88);
});

it("keeps shorthand markerless items in ordered-list numbering", () => {
	const test = fixture(
		"ol{list-style:decimal}#middle{list-style:none}",
		'<ol start="9"><li>AA</li><li id="middle">BB</li><li>CC</li></ol>',
	);
	expect(test.markers().map((node) => node.outsideMarker)).toEqual([
		{ type: "decimal", ordinal: 9 },
		{ type: "decimal", ordinal: 11 },
	]);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(2);
});

it("inherits a markerless shorthand through an intervening element", () => {
	const test = fixture(
		"#list{list-style:inside none}.item{display:list-item}",
		'<div id="list"><section><div class="item" id="item">AA</div></section></div>',
	);
	expect(test.values()).toEqual({
		type: "none",
		position: "inside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
});

it.each(["inherit", "unset"])(
	"expands list-style:%s to inherited type, position and image",
	(keyword) => {
		const test = fixture(
			`ul{list-style:inside decimal}li{list-style:${keyword}}`,
		);
		expect(test.values()).toEqual({
			type: "decimal",
			position: "inside",
			image: "none",
		});
		expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
		expectLinkHit(test, 82);
	},
);

it("resets all shorthand components to initial rather than inheriting the parent", () => {
	const test = fixture("ul{list-style:inside decimal}li{list-style:initial}");
	expect(test.values()).toEqual({
		type: "disc",
		position: "outside",
		image: "none",
	});
	expect(test.markers()[0].outsideMarker).toEqual({ type: "disc" });
	expectLinkHit(test, 64);
});

it("reverts ordered-list shorthand declarations to the native decimal default", () => {
	const test = fixture(
		"ol{list-style:inside none;list-style:revert}",
		'<ol><li id="item">AA</li></ol>',
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "outside",
		image: "none",
	});
	expect(test.markers()[0].outsideMarker).toEqual({
		type: "decimal",
		ordinal: 1,
	});
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
});

it("reverts summary shorthand declarations to the native inside disclosure marker", () => {
	const test = fixture(
		"summary{list-style:none;list-style:revert}",
		'<details><summary id="item">AA</summary></details>',
	);
	expect(test.values()).toEqual({
		type: "disclosure-closed",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "disclosure-closed" });
	expect(firstGlyph(test.tree).x).toBe(72);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
});

it("resets an omitted position when a type-only shorthand follows an inside longhand", () => {
	const test = fixture("li{list-style-position:inside;list-style:decimal}");
	expect(test.values()).toEqual({
		type: "decimal",
		position: "outside",
		image: "none",
	});
	expect(test.markers()[0].outsideMarker).toEqual({
		type: "decimal",
		ordinal: 1,
	});
	expectLinkHit(test, 64);
});

it("resets an omitted type when a position-only shorthand follows marker suppression", () => {
	const test = fixture("li{list-style-type:none;list-style:inside}");
	expect(test.values()).toEqual({
		type: "disc",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "disc" });
	expectLinkHit(test, 72);
});

it("includes list image and marker position in an all:initial reset", () => {
	const test = fixture(
		"li{list-style:inside none;all:initial;display:list-item;font-size:8px;line-height:12px}",
	);
	expect(test.values()).toEqual({
		type: "disc",
		position: "outside",
		image: "none",
	});
	expect(test.markers()[0].outsideMarker).toEqual({ type: "disc" });
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
});

it("uses inherited list components after all:unset", () => {
	const test = fixture(
		"ul{list-style:inside decimal}li{list-style:none;all:unset;display:list-item}",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("lets later longhands override individual shorthand components", () => {
	const test = fixture(
		"li{list-style:none;list-style-type:decimal;list-style-position:inside}",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("lets a later shorthand replace earlier type and position longhands", () => {
	const test = fixture(
		"li{list-style-type:decimal;list-style-position:inside;list-style:none}",
	);
	expect(test.values()).toEqual({
		type: "none",
		position: "outside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expectLinkHit(test, 64);
});

it("preserves a more-specific longhand against a later shorthand rule", () => {
	const test = fixture(
		"#item{list-style-type:decimal}li{list-style:inside none}",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("keeps important shorthand components above normal inline longhands", () => {
	const test = fixture("li{list-style:none!important}");
	test.tree.setAttribute(
		test.id("#item"),
		"style",
		"list-style-type:decimal;list-style-position:inside",
	);
	expect(test.values()).toEqual({
		type: "none",
		position: "outside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
});

it("keeps an important type longhand while accepting a normal shorthand position", () => {
	const test = fixture(
		"li{list-style-type:decimal!important;list-style:inside none}",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("lets an important inline shorthand replace an important author shorthand", () => {
	const test = fixture("#item{list-style:none!important}");
	test.tree.setAttribute(
		test.id("#item"),
		"style",
		"list-style:inside decimal!important",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("substitutes an inherited custom property before shorthand expansion", () => {
	const test = fixture(
		"ul{--marker:inside decimal}li{list-style:var(--marker)}",
	);
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expect(buildFormattingTree(test.tree).issues).toEqual({});
	expectLinkHit(test, 82);
});

it("invalidates geometry and hit caches after inline shorthand mutation without rewriting retained results", () => {
	const test = fixture("li{list-style:inside disc}");
	const item = test.id("#item");
	const beforeStyle = test.styles.list(item);
	const beforeLayout = layoutDocument(test.tree);
	const beforeRect = test.geometry.getBoundingClientRect(test.id("#link"));
	expectLinkHit(test, 72);
	const geometryBuilds = test.geometry.metrics().builds;
	const hitBuilds = test.hits.metrics().builds;
	test.tree.setAttribute(item, "style", "list-style:none");
	expectLinkHit(test, 64);
	expect(test.geometry.metrics().builds).toBeGreaterThan(geometryBuilds);
	expect(test.hits.metrics().builds).toBeGreaterThan(hitBuilds);
	expect(test.markers()).toHaveLength(0);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
	expect(beforeStyle["list-style-type"]).toBe("disc");
	expect(beforeStyle["list-style-position"]).toBe("inside");
	expect(beforeRect.x).toBe(72);
	expect(
		beforeLayout.text.horizontal.formatting.nodes.some(
			(node) => node.marker?.type === "disc",
		),
	).toBe(true);
});

it("rebuilds shorthand styles, raster and hits after stylesheet text replacement", () => {
	const test = fixture("li{list-style:none}");
	expectLinkHit(test, 64);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(0);
	const builds = test.styles.metrics().cascadeBuilds;
	test.tree.setTextContent(test.id("#sheet"), "li{list-style:inside decimal}");
	expectLinkHit(test, 82);
	expect(test.styles.metrics().cascadeBuilds).toBeGreaterThan(builds);
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
});

it("invalidates substituted shorthand components after custom-property mutation", () => {
	const test = fixture(
		"ul{--marker:inside decimal}li{list-style:var(--marker)}",
	);
	expectLinkHit(test, 82);
	test.tree.setAttribute(test.id("#list"), "style", "--marker:none");
	expect(test.values()).toEqual({
		type: "none",
		position: "outside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expectLinkHit(test, 64);
	test.tree.removeAttribute(test.id("#list"), "style");
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
});

it("recomputes selector-controlled shorthand markers after class changes", () => {
	const test = fixture("li{list-style:inside disc}.plain{list-style:none}");
	expectLinkHit(test, 72);
	test.tree.setAttribute(test.id("#item"), "class", "plain");
	expect(test.markers()).toHaveLength(0);
	expectLinkHit(test, 64);
	test.tree.removeAttribute(test.id("#item"), "class");
	expect(test.markers()[0].marker).toEqual({ type: "disc" });
	expectLinkHit(test, 72);
});

it("refreshes shorthand numeric widths after source ordinal mutation", () => {
	const test = fixture("li{list-style:inside decimal}");
	expectLinkHit(test, 82);
	test.tree.setAttribute(test.id("#item"), "value", "100");
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 100 });
	expect(test.markers()[0].intrinsic).toEqual({ width: 30, height: 7 });
	expectLinkHit(test, 94);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
});

it("drops removed stylesheet ownership and restores the inherited native marker", () => {
	const test = fixture("li{list-style:none}");
	expect(test.markers()).toHaveLength(0);
	expectLinkHit(test, 64);
	test.tree.remove(test.id("#sheet"));
	expect(test.values()).toEqual({
		type: "disc",
		position: "outside",
		image: "none",
	});
	expect(test.markers()[0].outsideMarker).toEqual({ type: "disc" });
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expectLinkHit(test, 64);
});

it("preserves source declarations, references and DOM snapshots across marker rendering", () => {
	const source = "li{list-style:none inside decimal}";
	const test = fixture(source);
	const item = test.id("#item");
	const before = {
		snapshot: snapshotDocument(test.tree),
		revision: test.tree.revision,
		count: test.tree.nodeCount,
		children: [...test.tree.get(item).children],
		text: test.tree.textContent(test.tree.root),
		ref: test.tree.reference(item),
	};
	expect(test.values()).toEqual({
		type: "decimal",
		position: "inside",
		image: "none",
	});
	expect(test.markers()[0].marker).toEqual({ type: "decimal", ordinal: 1 });
	expectLinkHit(test, 82);
	expect(rasterizeDocument(test.tree).metrics.paintedMarkers).toBe(1);
	expect(test.tree.textContent(test.id("#sheet"))).toBe(source);
	expect({
		snapshot: snapshotDocument(test.tree),
		revision: test.tree.revision,
		count: test.tree.nodeCount,
		children: [...test.tree.get(item).children],
		text: test.tree.textContent(test.tree.root),
		ref: test.tree.reference(item),
	}).toEqual(before);
});

it("releases geometry, hit regions and selector ownership on document close", () => {
	const test = fixture("li{list-style:inside decimal}");
	const item = test.id("#item");
	expectLinkHit(test, 82);
	const retained = rasterizeDocument(test.tree);
	expect(test.geometry.metrics().rectangles).toBeGreaterThan(0);
	expect(test.hits.metrics().regions).toBeGreaterThan(0);
	test.queries.close();
	test.tree.close();
	expect(test.tree.nodeCount).toBe(0);
	expect(test.queries.metrics()).toMatchObject({
		closed: true,
		indexedNodes: 0,
		cachedSelectors: 0,
	});
	expect(test.geometry.metrics()).toMatchObject({
		closed: true,
		rectangles: 0,
		usedStyles: 0,
	});
	expect(test.hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => test.geometry.getBoundingClientRect(item)).toThrow();
	expect(() => test.hits.elementFromPoint(82, 4)).toThrow();
	expect(() => layoutDocument(test.tree)).toThrow();
	expect(retained.metrics.paintedMarkers).toBe(1);
});

it.each([
	'list-style:url("marker.png") inside disc',
	'list-style:"custom marker" inside',
	"list-style:counter(item) outside",
	'list-style-image:url("marker.png")',
])(
	"retains unsupported diagnostics for image/string/counter source %s",
	(declaration) => {
		const source = `li{list-style:none;${declaration}}`;
		const test = fixture(source);
		const before = snapshotDocument(test.tree);
		expect(
			test.styles.metrics().applicableIssues[
				"unimplemented-or-invalid-css-value"
			],
		).toBeGreaterThan(0);
		expect(
			buildFormattingTree(test.tree).issues[
				"css:unimplemented-or-invalid-css-value"
			],
		).toBeGreaterThan(0);
		expect(() => layoutDocument(test.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(test.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(test.tree.textContent(test.id("#sheet"))).toBe(source);
		expect(snapshotDocument(test.tree)).toEqual(before);
	},
);

it("does not hide independent formatting failures behind a supported markerless shorthand", () => {
	const test = fixture("li{list-style:none;direction:rtl}");
	expect(test.values()).toEqual({
		type: "none",
		position: "outside",
		image: "none",
	});
	expect(test.markers()).toHaveLength(0);
	expect(
		Object.keys(buildFormattingTree(test.tree).issues).length,
	).toBeGreaterThan(0);
	expect(() => layoutDocument(test.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => rasterizeDocument(test.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});
