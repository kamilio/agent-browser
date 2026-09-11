import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";
import {
	outsideMarkerRects,
	coordinateOutsideMarkers,
} from "./outside-markers.js";
import { documentScroll } from "./document-scroll.js";
import { layoutContentItems } from "./layout-paint-order.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	css = "",
	markup = '<details><summary id="summary">More</summary><p>Body</p></details>',
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}body{padding-left:20px}summary{color:red;font-size:16px} ${css}</style>${markup}`,
		"https://fixture.invalid/markers",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(120, 80);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing marker fixture node");
		return found;
	};
	const markers = () =>
		buildFormattingTree(tree).nodes.filter(
			(node) => node.marker || node.outsideMarker,
		);
	return { tree, queries, id, markers };
}
function firstGlyph(tree: ReturnType<typeof parseHtmlDocument>) {
	const glyph = layoutDocument(tree).contexts.flatMap(
		(context) => context.glyphs,
	)[0];
	if (!glyph) throw new Error("Missing marker fixture glyph");
	return glyph;
}

function outsideFixture(content: string, css = "") {
	const result = fixture(
		`body{padding-left:40px}li{margin:0;width:120px;font-size:16px;line-height:20px;color:red;list-style-type:square;list-style-position:outside}${css}`,
		`<li id="item">${content}</li>`,
	);
	documentStyles(result.tree).setViewport(240, 180);
	return result;
}

function outsideState(
	tree: ReturnType<typeof parseHtmlDocument>,
	ref?: string,
) {
	const layout = layoutDocument(tree);
	const marker = [...outsideMarkerRects(layout, () => {})].find(
		(entry) =>
			ref === undefined ||
			layout.text.horizontal.formatting.nodes[entry.id].ref === ref,
	);
	if (!marker) throw new Error("Missing outside marker fixture box");
	const box = layout.boxes.find((entry) => entry.id === marker.id);
	if (!box) throw new Error("Missing outside marker principal box");
	return { layout, marker, box };
}

function pixel(
	tree: ReturnType<typeof parseHtmlDocument>,
	x: number,
	y: number,
) {
	const image = rasterizeDocument(tree).image;
	const start = (Math.floor(y) * image.width + Math.floor(x)) * 4;
	return [...image.pixels.slice(start, start + 4)];
}

it("renders a generated closed marker while leaving DOM text, children and semantic names unchanged", () => {
	const { tree, id, markers } = fixture();
	const summary = id("#summary");
	const before = {
		nodes: tree.nodeCount,
		children: tree.get(summary).children,
		text: tree.textContent(summary),
		revision: tree.revision,
	};
	expect(resolvedStyleValue(tree, summary, "display")).toBe("list-item");
	expect(resolvedStyleValue(tree, summary, "list-style-type")).toBe(
		"disclosure-closed",
	);
	expect(resolvedStyleValue(tree, summary, "list-style-position")).toBe(
		"inside",
	);
	expect(markers()).toHaveLength(1);
	expect(firstGlyph(tree).x).toBe(36);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	expect({
		nodes: tree.nodeCount,
		children: tree.get(summary).children,
		text: tree.textContent(summary),
		revision: tree.revision,
	}).toEqual(before);
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(summary),
		)?.name,
	).toBe("More");
});

it("changes the marker pixels on open without shifting the label or adding client rectangles", () => {
	const { tree, id, markers } = fixture();
	const summary = id("#summary");
	const closed = rasterizeDocument(tree, { element: tree.reference(summary) });
	const geometry = documentGeometry(tree);
	const before = geometry.getBoundingClientRect(summary);
	const position = firstGlyph(tree).x;
	tree.setAttribute(id("details"), "open", "");
	expect(markers()[0].marker?.type).toBe("disclosure-open");
	const opened = rasterizeDocument(tree, { element: tree.reference(summary) });
	expect(opened.image.pixels).not.toEqual(closed.image.pixels);
	expect(firstGlyph(tree).x).toBe(position);
	expect(geometry.getBoundingClientRect(summary)).toEqual(before);
	expect(geometry.getClientRects(summary)).toHaveLength(1);
});

it("routes marker hits and clicks to the authored summary", () => {
	const { tree, id } = fixture();
	const summary = id("#summary");
	expect(documentHitTesting(tree).elementFromPoint(23, 7)).toBe(summary);
	documentInteractions(tree).click(tree.reference(summary));
	expect(tree.get(id("details")).attributes.open).toBe("");
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
});

it.each(["block", "inline", "inline-block", "contents", "none"])(
	"suppresses marker generation with display:%s",
	(display) => {
		const { tree, id, markers } = fixture(`summary{display:${display}}`);
		expect(markers()).toEqual([]);
		expect(resolvedStyleValue(tree, id("summary"), "list-style-type")).toBe(
			"disclosure-closed",
		);
	},
);

it.each([
	"none",
	"disc",
	"circle",
	"square",
	"disclosure-open",
	"disclosure-closed",
])("renders the supported author list-style-type:%s", (type) => {
	const { tree, id, markers } = fixture(`summary{list-style-type:${type}}`);
	expect(resolvedStyleValue(tree, id("summary"), "list-style-type")).toBe(type);
	expect(markers()).toHaveLength(type === "none" ? 0 : 1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(
		type === "none" ? 0 : 1,
	);
});

it("inherits explicit list values without confusing unset, initial and UA revert", () => {
	const { tree, id } = fixture(
		"details{list-style-type:square;list-style-position:outside}summary{list-style-type:inherit;list-style-position:unset}",
	);
	const summary = id("summary");
	expect(resolvedStyleValue(tree, summary, "list-style-type")).toBe("square");
	expect(resolvedStyleValue(tree, summary, "list-style-position")).toBe(
		"outside",
	);
	tree.setAttribute(
		summary,
		"style",
		"list-style-type:initial;list-style-position:revert",
	);
	expect(resolvedStyleValue(tree, summary, "list-style-type")).toBe("disc");
	expect(resolvedStyleValue(tree, summary, "list-style-position")).toBe(
		"inside",
	);
	tree.setAttribute(summary, "style", "list-style-type:revert");
	expect(resolvedStyleValue(tree, summary, "list-style-type")).toBe(
		"disclosure-closed",
	);
});

it("keeps outside markers out of the label advance and the element's DOM geometry", () => {
	const { tree, id, markers } = fixture("summary{list-style-position:outside}");
	expect(markers()).toHaveLength(1);
	expect(firstGlyph(tree).x).toBe(20);
	expect(documentGeometry(tree).getBoundingClientRect(id("summary")).left).toBe(
		20,
	);
	expect(documentGeometry(tree).getClientRects(id("summary"))).toHaveLength(1);
	expect(documentHitTesting(tree).elementFromPoint(7, 7)).toBe(id("summary"));
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
});

it("respects variable substitution, important cascade and all resets", () => {
	const { tree, id, markers } = fixture(
		"summary{--marker:none;list-style-type:var(--marker)!important}",
	);
	expect(markers()).toHaveLength(0);
	tree.setAttribute(id("summary"), "style", "list-style-type:square");
	expect(markers()).toHaveLength(0);
	tree.setAttribute(id("summary"), "style", "--marker:circle");
	expect(markers()[0].marker?.type).toBe("circle");
	tree.setAttribute(id("summary"), "style", "all:revert!important");
	expect(markers()[0].marker?.type).toBe("disclosure-closed");
});

it("updates marker ownership when the first summary changes", () => {
	const { tree, id, markers } = fixture(
		"",
		'<details open><summary id="summary">First</summary><summary id="second">Second</summary></details>',
	);
	expect(markers().map((node) => node.ref)).toEqual([
		tree.reference(id("#summary")),
	]);
	tree.insert(id("details"), id("#second"), id("#summary"));
	expect(markers().map((node) => node.ref)).toEqual([
		tree.reference(id("#second")),
	]);
	expect(resolvedStyleValue(tree, id("#summary"), "display")).toBe("block");
});

it.each([8, 16, 32])(
	"scales marker layout and inherited color at %spx",
	(size) => {
		const { tree, markers } = fixture(
			`summary{font-size:${size}px;color:rgb(0,128,0);white-space:nowrap}`,
		);
		expect(markers()[0].intrinsic?.width).toBe(size);
		expect(firstGlyph(tree).x).toBe(20 + size);
		const image = rasterizeDocument(tree).image;
		let green = 0;
		for (let offset = 0; offset < image.pixels.length; offset += 4)
			if (
				image.pixels[offset] === 0 &&
				image.pixels[offset + 1] === 128 &&
				image.pixels[offset + 2] === 0 &&
				image.pixels[offset + 3]
			)
				green++;
		expect(green).toBeGreaterThan(0);
	},
);

it("does not paint hidden markers, but keeps visibility overrides on descendants", () => {
	const { tree, markers } = fixture(
		"summary{visibility:hidden}span{visibility:visible}",
		'<details><summary id="summary"><span>More</span></summary></details>',
	);
	expect(markers()).toHaveLength(1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBeGreaterThan(0);
});

it("charges generated marker boxes and raster work to the existing budgets", () => {
	const { tree } = fixture();
	const total = buildFormattingTree(tree).metrics.boxes;
	expect(() => buildFormattingTree(tree, { maxBoxes: total - 1 })).toThrow(
		/box limit/i,
	);
	expect(() => rasterizeDocument(tree, { maxWork: 10 })).toThrow(/work limit/i);
	const styles = new DocumentStyles(tree, { maxWork: 10 });
	try {
		expect(() => styles.get(tree.root)).toThrow(/work limit/i);
	} finally {
		styles.close();
	}
});

it("keeps rich inside content and coordinates outside block placement", () => {
	const { tree, id, markers } = fixture(
		"",
		'<details><summary id="summary"><div>More</div></summary></details>',
	);
	expect(markers()).toHaveLength(1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	tree.setAttribute(id("summary"), "style", "list-style-position:outside");
	expect(layoutDocument(tree).outsideMarkers).toHaveLength(1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	tree.setAttribute(
		id("summary"),
		"style",
		"list-style-position:outside;list-style-type:none",
	);
	expect(markers()).toHaveLength(0);
});

it.each(["decimal", "url(image.png)", "symbols('*')"])(
	"does not advertise unsupported marker type %s",
	(type) => {
		const { tree, id, markers } = fixture(`summary{list-style-type:${type}}`);
		expect(resolvedStyleValue(tree, id("summary"), "list-style-type")).toBe(
			"disclosure-closed",
		);
		expect(markers()[0].marker?.type).toBe("disclosure-closed");
	},
);

it("supports live inline longhands and retained computed values without guest execution", () => {
	const { tree, id, markers } = fixture();
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const result = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(result, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(result, name, { value: method });
			return result;
		},
	});
	const element = dom.node(id("summary")) as {
		style: {
			setProperty(name: string, value: string): void;
			getPropertyValue(name: string): string;
		};
	};
	element.style.setProperty("list-style-type", "none");
	expect(element.style.getPropertyValue("list-style-type")).toBe("none");
	expect(markers()).toHaveLength(0);
	element.style.setProperty("list-style-type", "square");
	expect(markers()[0].marker?.type).toBe("square");
	dom.close();
	expect(() => element.style.getPropertyValue("list-style-type")).toThrow(
		/closed/i,
	);
});

it.each([
	"<div>First block</div>",
	"<div><p>Nested block</p></div>",
	"Before<div>Block</div>After",
	"<div>Many words to wrap over multiple lines of content</div>",
	"",
	"<div style='height:30px'></div>",
])(
	"coordinates outside block markers without changing principal geometry: %s",
	(content) => {
		const { tree, id } = fixture(
			"li{font-size:16px;line-height:20px;width:80px;margin:12px 0;padding:3px;border:2px solid blue}p{margin:9px 0}",
			`<li id="item">${content}</li><div id="after">After</div>`,
		);
		const before = snapshotDocument(tree);
		const marked = layoutDocument(tree);
		expect(marked.outsideMarkers).toHaveLength(1);
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
		const geometry = documentGeometry(tree);
		const rects = ["#item", "#after"].map((selector) =>
			geometry.getBoundingClientRect(id(selector)),
		);
		expect(geometry.getClientRects(id("#item"))).toHaveLength(1);
		expect(snapshotDocument(tree)).toEqual(before);
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		const unmarked = layoutDocument(tree);
		expect(unmarked.flowHeight).toBe(marked.flowHeight);
		expect(
			["#item", "#after"].map((selector) =>
				geometry.getBoundingClientRect(id(selector)),
			),
		).toEqual(rects);
		expect(marked.boxes).toEqual(unmarked.boxes);
	},
);

it.each([
	'<div id="line">First block</div>',
	'<div><section><p id="line">Nested block</p></section></div>',
	'<div style="height:11px"></div><div id="line">After a no-line block</div>',
	'<span style="display:contents"><div id="line">Flattened block</div></span>',
	'<div id="line">Long long long long long text that wraps repeatedly</div><p>Later</p>',
])(
	"uses the first in-flow descendant baseline and the principal gutter: %s",
	(content) => {
		const { tree, id } = outsideFixture(
			content,
			"li{padding:5px;border:2px solid blue}p{margin:9px 0}",
		);
		const { layout, marker, box } = outsideState(tree);
		const context = layout.contexts.find(
			(entry) => entry.ref === tree.reference(id("#line")),
		);
		expect(context?.lines.length).toBeGreaterThan(0);
		expect(marker.baselineOwner).toBe(context?.id);
		expect(marker.y + marker.height).toBe(context?.lines[0].baseline);
		expect(marker.x).toBe(box.borderX - 16);
		expect(marker.x + marker.width).toBe(box.borderX);
		expect(marker.width).toBe(16);
		expect(marker.height).toBe(14);
		expect(
			documentHitTesting(tree).elementFromPoint(marker.x + 3, marker.y + 5),
		).toBe(id("#item"));
		expect(pixel(tree, marker.x + 3, marker.y + 5)).toEqual([255, 0, 0, 255]);
		expect(
			layout.text.horizontal.formatting.nodes[marker.id].position,
		).toBeUndefined();
	},
);

it("keeps mixed content on its existing first line and creates no marker text context", () => {
	const { tree, id } = outsideFixture('Before<div id="block">Block</div>After');
	const { layout, marker } = outsideState(tree);
	const first = layout.contexts.find((context) =>
		context.glyphs.some((glyph) => glyph.character === "B"),
	);
	expect(marker.baselineOwner).toBe(first?.id);
	expect(marker.y + marker.height).toBe(first?.lines[0].baseline);
	tree.setAttribute(id("#item"), "style", "list-style-type:none");
	const unmarked = layoutDocument(tree);
	expect(layout.contexts).toEqual(unmarked.contexts);
	expect(layout.boxes).toEqual(unmarked.boxes);
});

it.each(["", "<div style='height:30px'></div>", "<div><div></div></div>"])(
	"uses principal typography when no in-flow line exists: %s",
	(content) => {
		const { tree, id } = outsideFixture(
			content,
			"li{padding:5px;border:2px solid blue;line-height:24px}",
		);
		const { layout, marker, box } = outsideState(tree);
		expect(marker.baselineOwner).toBeNull();
		expect(marker.y).toBe(box.contentY + 4);
		expect(marker.offsetY).toBe(11);
		expect(layout.contexts.every((context) => context.lines.length === 0)).toBe(
			true,
		);
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		expect(layoutDocument(tree).boxes).toEqual(layout.boxes);
	},
);

it.each([
	"<div style='margin:20px 0 30px'>Block</div>",
	"<div style='margin:20px 0 30px'></div>",
	"",
])(
	"preserves collapsed and through margins without a zero-height shim: %s",
	(content) => {
		const { tree, id } = fixture(
			"body{padding-left:40px}li{margin:12px 0 17px;font-size:16px;line-height:20px}",
			`<div style="height:8px;margin-bottom:11px"></div><li id="item">${content}</li><div id="after" style="height:12px;margin-top:23px"></div>`,
		);
		const marked = layoutDocument(tree);
		expect(marked.outsideMarkers).toHaveLength(1);
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		const unmarked = layoutDocument(tree);
		expect(marked.boxes).toEqual(unmarked.boxes);
		expect(marked.flowHeight).toBe(unmarked.flowHeight);
		expect(marked.contexts).toEqual(unmarked.contexts);
	},
);

it.each(["absolute", "fixed"])(
	"ignores %s descendant lines without inventing a containing block",
	(position) => {
		const { tree, id } = fixture(
			"body{padding-left:40px}#ancestor{position:relative;margin-top:13px}li{font-size:16px;line-height:20px}",
			`<div id="ancestor"><li id="item"><div id="detached" style="position:${position};left:3px;top:40px;width:40px">Detached</div><div id="line">Flow</div></li></div>`,
		);
		const { layout, marker } = outsideState(tree);
		const line = layout.contexts.find(
			(context) => context.ref === tree.reference(id("#line")),
		);
		expect(marker.baselineOwner).toBe(line?.id);
		expect(marker.y + marker.height).toBe(line?.lines[0].baseline);
		const principal = layout.text.horizontal.formatting.nodes[marker.id];
		expect(principal.position).toBeUndefined();
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		expect(layoutDocument(tree).boxes).toEqual(layout.boxes);
	},
);

it("uses the fallback for only out-of-flow contents", () => {
	const { tree } = outsideFixture(
		'<div style="position:absolute;left:90px;top:60px;width:50px">Detached</div>',
	);
	const { marker, box } = outsideState(tree);
	expect(marker.baselineOwner).toBeNull();
	expect(marker.y).toBe(box.contentY + 2);
});

it("follows the principal shift but not independently shifted block and inline descendants", () => {
	const { tree, id } = outsideFixture(
		'<div id="child"><span id="inline">Text</span></div>',
	);
	const initial = outsideState(tree);
	tree.setAttribute(
		id("#child"),
		"style",
		"position:relative;left:30px;top:50px",
	);
	tree.setAttribute(
		id("#inline"),
		"style",
		"position:relative;left:10px;top:12px",
	);
	const descendantShift = outsideState(tree);
	expect(descendantShift.marker).toEqual(initial.marker);
	expect(
		descendantShift.layout.contexts.flatMap((context) => context.glyphs)[0].y,
	).toBe(
		initial.layout.contexts.flatMap((context) => context.glyphs)[0].y + 62,
	);
	tree.setAttribute(
		id("#item"),
		"style",
		"position:relative;left:11px;top:17px",
	);
	const ownerShift = outsideState(tree);
	expect(ownerShift.marker.x).toBe(initial.marker.x + 11);
	expect(ownerShift.marker.y).toBe(initial.marker.y + 17);
	expect(ownerShift.marker.offsetY).toBe(initial.marker.offsetY);
	expect(
		documentHitTesting(tree).elementFromPoint(
			ownerShift.marker.x + 3,
			ownerShift.marker.y + 5,
		),
	).toBe(id("#item"));
});

it.each(["absolute", "fixed"])(
	"coordinates a %s list principal after positioning",
	(position) => {
		const { tree, id } = outsideFixture(
			'<div id="line">Line</div>',
			`li{position:${position};left:70px;top:25px;width:60px}`,
		);
		const { marker, box } = outsideState(tree);
		expect(box.borderX).toBe(70);
		expect(box.borderY).toBe(25);
		expect(marker.x).toBe(54);
		expect(marker.y).toBe(27);
		expect(pixel(tree, 57, 32)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(tree).elementFromPoint(57, 32)).toBe(id("#item"));
	},
);

it.each(["static", "fixed"])(
	"keeps %s outside markers attached during viewport scrolling",
	(position) => {
		const { tree, id } = fixture(
			`body{padding-left:40px}li{position:${position};left:60px;top:20px;margin-top:40px;width:60px;font-size:16px;line-height:20px;list-style-type:square;color:red}`,
			'<li id="item"><div>Line</div></li><div style="height:400px"></div>',
		);
		documentStyles(tree).setViewport(200, 160);
		const { marker } = outsideState(tree);
		const point = { x: marker.x + 3, y: marker.y + 5 };
		expect(pixel(tree, point.x, point.y)).toEqual([255, 0, 0, 255]);
		expect(documentScroll(tree).to(0, 20)).toBe(true);
		const expectedY = position === "fixed" ? point.y : point.y - 20;
		expect(pixel(tree, point.x, expectedY)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(tree).elementFromPoint(point.x, expectedY)).toBe(
			id("#item"),
		);
		expect(documentGeometry(tree).getClientRects(id("#item"))).toHaveLength(1);
	},
);

it("includes ordinary marker overflow but excludes fixed marker overflow from root scrolling", () => {
	const { tree, id } = outsideFixture(
		"",
		"li{font-size:64px;line-height:100px;width:30px;margin-top:150px}",
	);
	const { marker } = outsideState(tree);
	expect(documentScroll(tree).bounds().y).toBe(marker.y + marker.height - 180);
	tree.setAttribute(
		id("#item"),
		"style",
		"position:fixed;left:100px;top:150px;margin-top:0",
	);
	expect(documentScroll(tree).bounds().y).toBe(0);
});

it("places markers in the principal stacking context rather than a descendant context", () => {
	const { tree, id } = fixture(
		"body{padding-left:40px}li{position:relative;z-index:1;width:80px;font-size:16px;line-height:20px;list-style-type:square;color:red}#cover{position:absolute;z-index:2;left:24px;top:2px;width:16px;height:14px;background:blue}",
		'<li id="item"><div style="position:relative;z-index:10;left:60px">Text</div></li><div id="cover"></div>',
	);
	expect(pixel(tree, 27, 7)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(27, 7)).toBe(id("#cover"));
	tree.setAttribute(id("#item"), "style", "z-index:3");
	expect(pixel(tree, 27, 7)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(27, 7)).toBe(id("#item"));
	const items = [...layoutContentItems(layoutDocument(tree), () => {})];
	const markerIndex = items.findIndex((item) => item.kind === "marker");
	expect(markerIndex).toBeGreaterThan(
		items.findIndex(
			(item) =>
				item.kind === "box" && item.box.ref === tree.reference(id("#cover")),
		),
	);
});

it.each([8, 16, 32])(
	"uses principal marker color and font size %s independently of its first block",
	(size) => {
		const { tree, id } = outsideFixture(
			'<div style="color:blue;font-size:24px;line-height:30px">Text</div>',
			`li{font-size:${size}px;color:rgb(0,128,0)}`,
		);
		const { layout, marker } = outsideState(tree);
		expect(marker.width).toBe(size);
		expect(marker.height).toBe((size * 7) / 8);
		expect(marker.y + marker.height).toBe(
			layout.contexts.find((context) => context.lines.length)?.lines[0]
				.baseline,
		);
		expect(
			pixel(tree, marker.x + size * 0.2, marker.y + marker.height / 2),
		).toEqual([0, 128, 0, 255]);
		tree.setAttribute(id("#item"), "style", "visibility:hidden");
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
		expect(
			documentHitTesting(tree).elementFromPoint(marker.x + 1, marker.y + 1),
		).not.toBe(id("#item"));
	},
);

it("allows visible descendants without painting a hidden outside marker", () => {
	const { tree } = outsideFixture(
		'<div style="visibility:visible">Visible</div>',
		"li{visibility:hidden}",
	);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
	expect(rasterizeDocument(tree).metrics.paintedGlyphs).toBeGreaterThan(0);
});

it.each(["disc", "circle", "square", "disclosure-open", "disclosure-closed"])(
	"paints supported outside %s markers with block content",
	(type) => {
		const { tree } = outsideFixture(
			"<div>Block</div>",
			`li{list-style-type:${type}}`,
		);
		const { marker } = outsideState(tree);
		const image = rasterizeDocument(tree, {
			clip: {
				x: marker.x,
				y: marker.y,
				width: marker.width,
				height: marker.height,
			},
		});
		expect(image.metrics.paintedMarkers).toBe(1);
		expect(image.metrics.paintedGlyphs).toBe(0);
		expect(
			image.image.pixels.some((value, index) => index % 4 === 1 && value === 0),
		).toBe(true);
	},
);

it("routes outside block-marker clicks to summaries only when they own disclosure activation", () => {
	const { tree, id } = fixture(
		"li,div#ordinary{font-size:16px;line-height:20px;list-style-type:disclosure-closed}summary{list-style-position:outside}",
		'<details open><summary id="summary"><div>More</div></summary><li id="item"><div>Item</div></li><div id="ordinary" style="display:list-item"><div>Ordinary</div></div></details>',
	);
	documentStyles(tree).setViewport(200, 160);
	for (const selector of ["#item", "#ordinary", "#summary"]) {
		const { marker } = outsideState(tree, tree.reference(id(selector)));
		const hit = documentHitTesting(tree).elementFromPoint(
			marker.x + 3,
			marker.y + 5,
		);
		expect(hit).toBe(id(selector));
		documentInteractions(tree).click(tree.reference(hit as number));
		if (selector !== "#summary")
			expect(tree.get(id("details")).attributes.open).toBe("");
	}
	expect(tree.get(id("details")).attributes.open).toBeUndefined();
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	expect(
		buildFormattingTree(tree).nodes.find((node) => node.outsideMarker)
			?.outsideMarker?.type,
	).toBe("disclosure-closed");
});

it.each(["grid", "flex"])(
	"coordinates outside markers in nested %s items through contents",
	(display) => {
		const { tree, id } = fixture(
			`body{padding-left:40px}#container{display:${display};width:150px}li{width:60px;font-size:16px;line-height:20px;list-style-type:square;color:red}`,
			'<div id="container"><ul style="display:contents"><li id="item"><div>Block</div></li><li><div>Next</div></li></ul></div>',
		);
		documentStyles(tree).setViewport(240, 180);
		const { layout, marker } = outsideState(tree, tree.reference(id("#item")));
		expect(layout.outsideMarkers).toHaveLength(2);
		expect(
			layout.text.horizontal.formatting.nodes[marker.id][
				display === "grid" ? "gridItem" : "flexItem"
			],
		).toBe(true);
		expect(
			documentHitTesting(tree).elementFromPoint(marker.x + 3, marker.y + 5),
		).toBe(id("#item"));
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(2);
	},
);

it("charges marker coordination, painting and hit regions to existing work limits", () => {
	const { tree } = outsideFixture("<div><div>Text</div></div>");
	const { layout } = outsideState(tree);
	expect(() => coordinateOutsideMarkers(layout, layout.metrics.work)).toThrow(
		/outside marker layout work limit/i,
	);
	expect(() =>
		layoutDocument(tree, { maxWork: layout.metrics.work - 1 }),
	).toThrow(/work limit/i);
	expect(layoutDocument(tree, { maxWork: layout.metrics.work })).toEqual(
		layout,
	);
	expect(() => rasterizeDocument(tree, { maxWork: 10 })).toThrow(/work limit/i);
	const hits = new DocumentHitTesting(tree, { maxRegions: 1 });
	try {
		expect(() => hits.elementFromPoint(27, 7)).toThrow(/region limit/i);
		expect(hits.metrics().regions).toBe(0);
	} finally {
		hits.close();
	}
	expect(Object.isFrozen(layout.outsideMarkers)).toBe(true);
	expect(Object.isFrozen(layout.outsideMarkers?.[0])).toBe(true);
});

it.each(["", "<div>Block</div>"])(
	"dispatches native mouse activation from an outside summary marker: %s",
	(content) => {
		const { tree, id } = fixture(
			"summary{list-style-position:outside}",
			`<details><summary id="summary">${content}</summary><div>Body</div></details>`,
		);
		const { marker } = outsideState(tree);
		const mouse = documentInteractions(tree).mouse;
		mouse.move(marker.x + 3, marker.y + 5);
		mouse.down();
		mouse.up();
		expect(tree.get(id("details")).attributes.open).toBe("");
		expect(
			buildFormattingTree(tree).nodes.find((node) => node.outsideMarker)
				?.outsideMarker?.type,
		).toBe("disclosure-open");
	},
);

it.each(["inline-block", "flex", "grid"])(
	"excludes outside markers from intrinsic %s sizing",
	(display) => {
		const { tree, id } = fixture(
			`body{padding-left:40px}#container{display:${display}}li{font-size:16px;line-height:20px}`,
			'<div id="container"><li id="item"><div>Content</div></li></div>',
		);
		const marked = layoutDocument(tree);
		expect(marked.outsideMarkers).toHaveLength(1);
		tree.setAttribute(id("#item"), "style", "list-style-type:none");
		const unmarked = layoutDocument(tree);
		expect(marked.boxes).toEqual(unmarked.boxes);
		expect(marked.flowHeight).toBe(unmarked.flowHeight);
	},
);

it("retains distinct owner boxes for nested outside lists", () => {
	const { tree, id } = outsideFixture(
		'<ul style="margin:0;padding-left:24px"><li id="nested"><div>Nested</div></li></ul>',
	);
	const outer = outsideState(tree, tree.reference(id("#item")));
	const nested = outsideState(tree, tree.reference(id("#nested")));
	expect(outer.layout.outsideMarkers).toHaveLength(2);
	expect(outer.marker.y).toBe(nested.marker.y);
	expect(nested.marker.x - outer.marker.x).toBe(24);
	expect(
		documentHitTesting(tree).elementFromPoint(
			outer.marker.x + 3,
			outer.marker.y + 5,
		),
	).toBe(id("#item"));
	expect(
		documentHitTesting(tree).elementFromPoint(
			nested.marker.x + 3,
			nested.marker.y + 5,
		),
	).toBe(id("#nested"));
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(2);
});

it("enforces the marker font ceiling even when the principal has no line", () => {
	const { tree, id } = outsideFixture("", "li{font-size:513px}");
	expect(() => layoutDocument(tree)).toThrow(/font size limit/i);
	tree.setAttribute(id("#item"), "style", "font-size:16px");
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
});

it("charges the final outside-marker raster and recovers after work exhaustion", () => {
	const { tree } = outsideFixture("");
	const options = { clip: { x: 24, y: 0, width: 16, height: 20 } };
	const raster = rasterizeDocument(tree, options);
	expect(raster.metrics.paintedMarkers).toBe(1);
	expect(() =>
		rasterizeDocument(tree, { ...options, maxWork: raster.metrics.work - 1 }),
	).toThrow(/raster work limit/i);
	expect(
		rasterizeDocument(tree, { ...options, maxWork: raster.metrics.work }).image
			.pixels,
	).toEqual(raster.image.pixels);
});

it.each(["direction:rtl", "float:left", "list-style-type:decimal"])(
	"retains the existing unsupported boundary for %s",
	(declaration) => {
		const { tree } = outsideFixture("<div>Block</div>", `li{${declaration}}`);
		expect(
			Object.keys(buildFormattingTree(tree).issues).length,
		).toBeGreaterThan(0);
		expect(() => rasterizeDocument(tree)).toThrow();
	},
);

it("retains pointer-events and inert filtering for outside marker hits", () => {
	const { tree, id } = outsideFixture("<div>Block</div>");
	const { marker } = outsideState(tree);
	const hits = documentHitTesting(tree);
	tree.setAttribute(id("#item"), "style", "pointer-events:none");
	expect(hits.elementFromPoint(marker.x + 3, marker.y + 5)).not.toBe(
		id("#item"),
	);
	tree.setAttribute(id("#item"), "style", "pointer-events:auto");
	tree.setAttribute(id("#item"), "inert", "");
	expect(hits.elementFromPoint(marker.x + 3, marker.y + 5)).not.toBe(
		id("#item"),
	);
	tree.removeAttribute(id("#item"), "inert");
	expect(hits.elementFromPoint(marker.x + 3, marker.y + 5)).toBe(id("#item"));
});
