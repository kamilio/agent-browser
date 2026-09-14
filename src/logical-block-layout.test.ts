import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const content =
	'<div id="target"><div id="child"></div></div><div id="after"></div>';

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(css = "", markup = content) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-family:'Agent Mono';font-size:8px;line-height:8px;background:white}#host{display:flow-root;width:100px}#target{display:block;width:40px;background:red}#child{width:20px;height:10px;background:blue}#after{height:5px;background:black}${css}</style><main id="host">${markup}</main>`,
		"https://fixture.invalid/logical-block-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(128, 128);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing logical layout ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	return {
		tree,
		styles,
		id,
		rect: (selector = "#target") =>
			geometry.getBoundingClientRect(id(selector)),
	};
}

function parity(
	logical: ReturnType<typeof fixture>,
	physical: ReturnType<typeof fixture>,
	selectors = ["#host", "#target", "#child", "#after"],
) {
	for (const selector of selectors)
		expect(logical.rect(selector), selector).toEqual(physical.rect(selector));
	const actual = rasterizeDocument(logical.tree);
	const expected = rasterizeDocument(physical.tree);
	expect(actual.layout.text.horizontal.formatting.issues).toEqual({});
	expect(expected.layout.text.horizontal.formatting.issues).toEqual({});
	expect(actual.layout.flowHeight).toBe(expected.layout.flowHeight);
	expect(actual.image.width).toBe(expected.image.width);
	expect(actual.image.height).toBe(expected.image.height);
	expect(actual.image.pixels).toEqual(expected.image.pixels);
	return actual;
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	horizontal: number,
	vertical: number,
) {
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each([
	{
		name: "shorthands",
		css: "margin-block:5px 9px;padding-block:3px 7px",
	},
	{
		name: "start/end longhands",
		css: "margin-block-start:5px;margin-block-end:9px;padding-block-start:3px;padding-block-end:7px",
	},
	{
		name: "mixed logical and physical cascade winners",
		css: "margin-block:1px 2px;margin-top:5px;margin-block-end:9px;padding-top:1px;padding-block:3px 4px;padding-bottom:7px",
	},
])("moves real boxes and matches physical spacing for $name", ({ css }) => {
	const logical = fixture(`#target{${css}}`);
	const physical = fixture(
		"#target{margin-top:5px;margin-bottom:9px;padding-top:3px;padding-bottom:7px}",
	);
	const baseline = fixture();
	expect(baseline.rect()).toMatchObject({ y: 0, height: 10 });
	expect(baseline.rect("#after").y).toBe(10);
	expect(logical.rect()).toMatchObject({ x: 0, y: 5, width: 40, height: 20 });
	expect(logical.rect("#child")).toMatchObject({
		x: 0,
		y: 8,
		width: 20,
		height: 10,
	});
	expect(logical.rect("#after").y).toBe(34);
	const { image } = parity(logical, physical);
	for (const page of [logical, physical]) {
		const hits = documentHitTesting(page.tree);
		expect(hits.elementFromPoint(1, 6)).toBe(page.id());
		expect(hits.elementFromPoint(1, 9)).toBe(page.id("#child"));
		expect(hits.elementFromPoint(1, 21)).toBe(page.id());
		expect(hits.elementFromPoint(1, 28)).toBe(page.id("#host"));
		expect(hits.elementFromPoint(1, 35)).toBe(page.id("#after"));
	}
	expect(pixel(image, 1, 6)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 1, 9)).toEqual([0, 0, 255, 255]);
	expect(pixel(image, 1, 21)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 1, 28)).toEqual([255, 255, 255, 255]);
});

it.each([
	{
		name: "percentages use containing width on both block edges",
		logical: "margin-block:10% 20%;padding-block:5% 10%",
		physical:
			"margin-top:10%;margin-bottom:20%;padding-top:5%;padding-bottom:10%",
		top: 10,
		childTop: 15,
		height: 25,
		afterTop: 55,
	},
	{
		name: "em and rem use the element and root font sizes",
		logical: "margin-block:1em .5rem;padding-block:.5em .25rem",
		physical:
			"margin-top:1em;margin-bottom:.5rem;padding-top:.5em;padding-bottom:.25rem",
		top: 10,
		childTop: 15,
		height: 20,
		afterTop: 40,
	},
])(
	"resolves real geometry when $name",
	({ logical, physical, top, childTop, height, afterTop }) => {
		const common = "html{font-size:20px}#target{font-size:10px}";
		const page = fixture(`${common}#target{${logical}}`);
		const canonical = fixture(`${common}#target{${physical}}`);
		expect(page.rect()).toMatchObject({ y: top, height });
		expect(page.rect("#child").y).toBe(childTop);
		expect(page.rect("#after").y).toBe(afterTop);
		parity(page, canonical);
	},
);

it("collapses adjacent positive logical margins rather than adding them", () => {
	const markup =
		'<div id="before"></div><div id="target"><div id="child"></div></div><div id="after"></div>';
	const common = "#before{height:10px}#after{margin-top:3px}";
	const page = fixture(
		`${common}#before{margin-block-end:12px}#target{margin-block:8px 5px}`,
		markup,
	);
	const canonical = fixture(
		`${common}#before{margin-bottom:12px}#target{margin-top:8px;margin-bottom:5px}`,
		markup,
	);
	expect(page.rect("#before")).toMatchObject({ y: 0, height: 10 });
	expect(page.rect()).toMatchObject({ y: 22, height: 10 });
	expect(page.rect("#after").y).toBe(37);
	parity(page, canonical, ["#before", "#target", "#child", "#after"]);
});

it.each([
	{ overflow: "clip", top: 20, height: 10 },
	{ overflow: "hidden", top: 0, height: 60 },
])(
	"preserves existing child-margin collapse boundaries with overflow:$overflow",
	({ overflow, top, height }) => {
		const common = `#target{overflow:${overflow}}`;
		const page = fixture(`${common}#child{margin-block:20px 30px}`);
		const canonical = fixture(
			`${common}#child{margin-top:20px;margin-bottom:30px}`,
		);
		expect(page.rect()).toMatchObject({ y: top, height });
		expect(page.rect("#child")).toMatchObject({ y: 20, height: 10 });
		expect(page.rect("#after").y).toBe(60);
		parity(page, canonical);
	},
);

it("pads actual text lines rather than only accepting logical syntax", () => {
	const markup =
		'<div id="target"><span id="child">AB</span></div><div id="after"></div>';
	const common = "#child{width:auto;height:auto;background:transparent}";
	const baseline = fixture(common, markup);
	const page = fixture(`${common}#target{padding-block:3px 7px}`, markup);
	const canonical = fixture(
		`${common}#target{padding-top:3px;padding-bottom:7px}`,
		markup,
	);
	expect(baseline.rect().height).toBe(8);
	expect(page.rect().height).toBe(18);
	expect(page.rect("#child").y - baseline.rect("#child").y).toBe(3);
	expect(page.rect("#after").y).toBe(18);
	const result = parity(page, canonical);
	expect(
		result.layout.text.horizontal.formatting.nodes.some(
			(node) => node.kind === "text",
		),
	).toBe(true);
});

it("retains rich button children, padding ownership, hit targets and raster parity", () => {
	const markup =
		'<button id="target"><span id="child"></span></button><div id="after"></div>';
	const common =
		"#target{width:100px;height:50px;border:2px solid red;background:white;padding-left:5px;padding-right:7px;font-size:0;line-height:0}#child{display:inline-block}";
	const page = fixture(
		`${common}#target{margin-block:5px 9px;padding-block:3px 11px}`,
		markup,
	);
	const canonical = fixture(
		`${common}#target{margin-top:5px;margin-bottom:9px;padding-top:3px;padding-bottom:11px}`,
		markup,
	);
	const before = snapshotDocument(page.tree);
	const revision = page.tree.revision;
	expect(page.rect()).toMatchObject({ x: 0, y: 5, width: 100, height: 50 });
	expect(page.rect("#child")).toMatchObject({
		x: 39,
		y: 21,
		width: 20,
		height: 10,
	});
	expect(page.rect("#after").y).toBe(64);
	const { image, layout } = parity(page, canonical);
	const reference = page.tree.reference(page.id());
	expect(layout.boxes.find((box) => box.ref === reference)).toMatchObject({
		paddingTop: 3,
		paddingRight: 7,
		paddingBottom: 11,
		paddingLeft: 5,
		contentWidth: 84,
		contentHeight: 32,
	});
	for (const current of [page, canonical]) {
		const hits = documentHitTesting(current.tree);
		expect(hits.elementFromPoint(40, 22)).toBe(current.id("#child"));
		expect(hits.elementFromPoint(8, 11)).toBe(current.id());
		expect(hits.elementsFromPoint(40, 22).slice(0, 2)).toEqual([
			current.id("#child"),
			current.id(),
		]);
	}
	expect(pixel(image, 0, 5)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 8, 11)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 40, 22)).toEqual([0, 0, 255, 255]);
	expect(page.tree.revision).toBe(revision);
	expect(snapshotDocument(page.tree)).toEqual(before);
});

it.each(["before", "after"] as const)(
	"lays out ::%s logical padding and margins like physical edges",
	(name) => {
		const common = `#target::${name}{content:"";display:block;width:20px;height:6px;background:green}`;
		const page = fixture(
			`${common}#target::${name}{margin-block:4px 8px;padding-block:2px 3px}`,
		);
		const canonical = fixture(
			`${common}#target::${name}{margin-top:4px;margin-bottom:8px;padding-top:2px;padding-bottom:3px}`,
		);
		const baseline = fixture(common);
		const { layout } = parity(page, canonical);
		const generated = layout.text.horizontal.formatting.nodes.find(
			(node) =>
				node.generatedContent?.owner === page.id() &&
				node.generatedContent.name === name &&
				node.kind !== "text",
		);
		expect(generated).toBeDefined();
		const box = layout.boxes.find((entry) => entry.id === generated?.id);
		expect(box).toMatchObject({
			paddingTop: 2,
			paddingBottom: 3,
			marginTop: 4,
			marginBottom: 8,
			borderBoxHeight: 11,
		});
		expect(page.rect("#after").y).toBeGreaterThan(baseline.rect("#after").y);
	},
);

it("invalidates real layout, paint and hit caches after inherited variable changes", () => {
	const page = fixture(
		"#host{--space:2px 4px}#target{padding-block:var(--space)}",
	);
	const hits = documentHitTesting(page.tree);
	expect(page.rect()).toMatchObject({ height: 16 });
	expect(page.rect("#child").y).toBe(2);
	expect(hits.elementFromPoint(1, 3)).toBe(page.id("#child"));
	expect(pixel(rasterizeDocument(page.tree).image, 1, 3)).toEqual([
		0, 0, 255, 255,
	]);
	page.tree.setAttribute(page.id("#host"), "style", "--space:6px 8px");
	expect(page.rect()).toMatchObject({ height: 24 });
	expect(page.rect("#child").y).toBe(6);
	expect(page.rect("#after").y).toBe(24);
	expect(hits.elementFromPoint(1, 3)).toBe(page.id());
	expect(pixel(rasterizeDocument(page.tree).image, 1, 3)).toEqual([
		255, 0, 0, 255,
	]);
	parity(page, fixture("#target{padding-top:6px;padding-bottom:8px}"));
	page.tree.setAttribute(
		page.id(),
		"style",
		"padding-top:1px;padding-block-end:3px",
	);
	expect(page.rect()).toMatchObject({ height: 14 });
	expect(page.rect("#child").y).toBe(1);
	parity(page, fixture("#target{padding-top:1px;padding-bottom:3px}"));
});

it("recomputes percentage block spacing when the containing width changes", () => {
	const page = fixture("#target{margin-block:10% 20%;padding-block:5% 10%}");
	expect(page.rect()).toMatchObject({ y: 10, height: 25 });
	page.tree.setAttribute(page.id("#host"), "style", "width:200px");
	expect(page.rect()).toMatchObject({ y: 20, height: 40 });
	expect(page.rect("#child").y).toBe(30);
	expect(page.rect("#after").y).toBe(100);
	const canonical = fixture(
		"#host{width:200px}#target{margin-top:10%;margin-bottom:20%;padding-top:5%;padding-bottom:10%}",
	);
	parity(page, canonical);
});

it.each([
	{
		attribute: "style",
		value: "writing-mode:vertical-rl",
		issue: "css:unimplemented-css-property",
	},
	{
		attribute: "style",
		value: "writing-mode:vertical-lr",
		issue: "css:unimplemented-css-property",
	},
	{
		attribute: "style",
		value: "direction:rtl",
		issue: "css:unimplemented-css-property",
	},
	{ attribute: "dir", value: "rtl", issue: "html-direction-not-supported" },
	{ attribute: "dir", value: "auto", issue: "html-direction-not-supported" },
])(
	"does not bypass the existing $attribute=$value guard",
	({ attribute, value, issue }) => {
		const page = fixture("#target{margin-block:5px 9px;padding-block:3px 7px}");
		page.tree.setAttribute(page.id(), attribute, value);
		const before = snapshotDocument(page.tree);
		const revision = page.tree.revision;
		expect(buildFormattingTree(page.tree).issues[issue]).toBeGreaterThan(0);
		for (const operation of [
			() => layoutDocument(page.tree),
			() => page.rect(),
			() => rasterizeDocument(page.tree),
			() => documentHitTesting(page.tree).elementFromPoint(1, 9),
		])
			expect(operation).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
		expect(page.tree.revision).toBe(revision);
		expect(snapshotDocument(page.tree)).toEqual(before);
		page.tree.removeAttribute(page.id(), attribute);
		expect(page.rect()).toMatchObject({ y: 5, height: 20 });
		parity(
			page,
			fixture(
				"#target{margin-top:5px;margin-bottom:9px;padding-top:3px;padding-bottom:7px}",
			),
		);
	},
);
