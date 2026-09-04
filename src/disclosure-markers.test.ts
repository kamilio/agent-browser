import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";

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
		buildFormattingTree(tree).nodes.filter((node) =>
			Reflect.get(node, "marker"),
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

it("keeps rich inside content but rejects unsupported outside block placement explicitly", () => {
	const { tree, id, markers } = fixture(
		"",
		'<details><summary id="summary"><div>More</div></summary></details>',
	);
	expect(markers()).toHaveLength(1);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	tree.setAttribute(id("summary"), "style", "list-style-position:outside");
	expect(() => buildFormattingTree(tree)).toThrow(
		/outside disclosure markers/i,
	);
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
