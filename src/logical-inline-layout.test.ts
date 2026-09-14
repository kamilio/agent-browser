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
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-family:'Agent Mono';font-size:8px;line-height:8px;background:white}#host{display:flow-root;box-sizing:content-box;width:100px}#target{display:block;box-sizing:content-box;width:auto;background:red}#child{width:20px;height:10px;background:blue}#after{height:5px;background:black}${css}</style><main id="host">${markup}</main>`,
		"https://fixture.invalid/logical-inline-layout",
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
		id,
		rect: (selector = "#target") =>
			geometry.getBoundingClientRect(id(selector)),
	};
}

function hitPath(tree: DocumentTree, id: number | null) {
	if (id === null) return null;
	const path: number[] = [];
	let node = tree.get(id);
	while (node.parent !== null) {
		const parent = tree.get(node.parent);
		const index = parent.children.indexOf(node.id);
		if (index < 0) throw new Error("Hit node is not in its parent");
		path.unshift(index);
		node = parent;
	}
	return path;
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
	const logicalHits = documentHitTesting(logical.tree);
	const physicalHits = documentHitTesting(physical.tree);
	for (const horizontal of [1, 6, 9, 25, 40, 60, 90, 99, 110]) {
		for (const vertical of [1, 5, 11, 25, 50, 90]) {
			expect(
				hitPath(
					logical.tree,
					logicalHits.elementFromPoint(horizontal, vertical),
				),
			).toEqual(
				hitPath(
					physical.tree,
					physicalHits.elementFromPoint(horizontal, vertical),
				),
			);
			expect(
				logicalHits
					.elementsFromPoint(horizontal, vertical)
					.map((id) => hitPath(logical.tree, id)),
			).toEqual(
				physicalHits
					.elementsFromPoint(horizontal, vertical)
					.map((id) => hitPath(physical.tree, id)),
			);
		}
	}
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
		name: "one-value shorthands",
		logical: "margin-inline:5px;padding-inline:3px",
		physical:
			"margin-left:5px;margin-right:5px;padding-left:3px;padding-right:3px",
		width: 90,
		contentWidth: 84,
	},
	{
		name: "two-value shorthands",
		logical: "margin-inline:5px 9px;padding-inline:3px 7px",
		physical:
			"margin-left:5px;margin-right:9px;padding-left:3px;padding-right:7px",
		width: 86,
		contentWidth: 76,
	},
	{
		name: "all four start/end longhands",
		logical:
			"margin-inline-start:5px;margin-inline-end:9px;padding-inline-start:3px;padding-inline-end:7px",
		physical:
			"margin-left:5px;margin-right:9px;padding-left:3px;padding-right:7px",
		width: 86,
		contentWidth: 76,
	},
])(
	"changes used widths, pixels and hit ownership for $name",
	({ logical, physical, width, contentWidth }) => {
		const baseline = fixture();
		const page = fixture(`#target{${logical}}`);
		const canonical = fixture(`#target{${physical}}`);
		expect(baseline.rect()).toMatchObject({ x: 0, width: 100, height: 10 });
		expect(baseline.rect("#child").x).toBe(0);
		expect(page.rect()).toMatchObject({ x: 5, y: 0, width, height: 10 });
		expect(page.rect("#child")).toMatchObject({ x: 8, y: 0, width: 20 });
		expect(page.rect("#after").y).toBe(10);
		const { image, layout } = parity(page, canonical);
		expect(
			layout.boxes.find((box) => box.ref === page.tree.reference(page.id())),
		).toMatchObject({ contentWidth, paddingLeft: 3, marginLeft: 5 });
		for (const current of [page, canonical]) {
			const hits = documentHitTesting(current.tree);
			expect(hits.elementFromPoint(1, 1)).toBe(current.id("#host"));
			expect(hits.elementFromPoint(6, 1)).toBe(current.id());
			expect(hits.elementFromPoint(9, 1)).toBe(current.id("#child"));
			expect(hits.elementFromPoint(4 + width, 1)).toBe(current.id());
			expect(hits.elementFromPoint(99, 1)).toBe(current.id("#host"));
		}
		expect(pixel(rasterizeDocument(baseline.tree).image, 1, 1)).toEqual([
			0, 0, 255, 255,
		]);
		expect(pixel(image, 1, 1)).toEqual([255, 255, 255, 255]);
		expect(pixel(image, 6, 1)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, 9, 1)).toEqual([0, 0, 255, 255]);
		expect(pixel(image, 4 + width, 1)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, 99, 1)).toEqual([255, 255, 255, 255]);
	},
);

it.each([
	{
		name: "percentages against the containing width",
		logical: "margin-inline:10% 20%;padding-inline:5% 10%",
		physical:
			"margin-left:10%;margin-right:20%;padding-left:5%;padding-right:10%",
		left: 10,
		width: 70,
		childLeft: 15,
		contentWidth: 55,
	},
	{
		name: "em and rem against element and root fonts",
		logical: "margin-inline:1em .5rem;padding-inline:.5em .25rem",
		physical:
			"margin-left:1em;margin-right:.5rem;padding-left:.5em;padding-right:.25rem",
		left: 10,
		width: 80,
		childLeft: 15,
		contentWidth: 70,
	},
	{
		name: "supported calc expressions on both edges",
		logical:
			"margin-inline:calc(10% + 2px) calc(20% - 3px);padding-inline:calc(5% + 1px) calc(10% - 2px)",
		physical:
			"margin-left:calc(10% + 2px);margin-right:calc(20% - 3px);padding-left:calc(5% + 1px);padding-right:calc(10% - 2px)",
		left: 12,
		width: 71,
		childLeft: 18,
		contentWidth: 57,
	},
])(
	"resolves $name into actual geometry",
	({ logical, physical, left, width, childLeft, contentWidth }) => {
		const common = "html{font-size:20px}#target{font-size:10px}";
		const baseline = fixture(common);
		const page = fixture(`${common}#target{${logical}}`);
		const canonical = fixture(`${common}#target{${physical}}`);
		expect(baseline.rect()).toMatchObject({ x: 0, width: 100 });
		expect(page.rect()).toMatchObject({ x: left, width });
		expect(page.rect("#child").x).toBe(childLeft);
		const { layout } = parity(page, canonical);
		expect(
			layout.boxes.find((box) => box.ref === page.tree.reference(page.id())),
		).toMatchObject({ contentWidth });
	},
);

it("invalidates percentage spacing when the containing width changes", () => {
	const page = fixture("#target{margin-inline:10% 20%;padding-inline:5% 10%}");
	const canonical = fixture(
		"#target{margin-left:10%;margin-right:20%;padding-left:5%;padding-right:10%}",
	);
	const hits = documentHitTesting(page.tree);
	expect(page.rect()).toMatchObject({ x: 10, width: 70 });
	expect(page.rect("#child").x).toBe(15);
	expect(hits.elementFromPoint(25, 1)).toBe(page.id("#child"));
	expect(pixel(parity(page, canonical).image, 25, 1)).toEqual([0, 0, 255, 255]);
	for (const current of [page, canonical])
		current.tree.setAttribute(current.id("#host"), "style", "width:200px");
	expect(page.rect()).toMatchObject({ x: 20, width: 140 });
	expect(page.rect("#child").x).toBe(30);
	expect(hits.elementFromPoint(25, 1)).toBe(page.id());
	expect(pixel(parity(page, canonical).image, 25, 1)).toEqual([255, 0, 0, 255]);
});

it("uses negative inline-start margin without losing padding paint or hit ownership", () => {
	const page = fixture(
		"#target{margin-inline-start:-6px;margin-inline-end:10px;padding-inline:8px 2px}",
	);
	const canonical = fixture(
		"#target{margin-left:-6px;margin-right:10px;padding-left:8px;padding-right:2px}",
	);
	expect(page.rect()).toMatchObject({ x: -6, width: 96, height: 10 });
	expect(page.rect("#child")).toMatchObject({ x: 2, width: 20 });
	const { image } = parity(page, canonical);
	expect(pixel(image, 1, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 3, 1)).toEqual([0, 0, 255, 255]);
	const hits = documentHitTesting(page.tree);
	expect(hits.elementFromPoint(1, 1)).toBe(page.id());
	expect(hits.elementFromPoint(3, 1)).toBe(page.id("#child"));
});

it("centers the padded border box with automatic inline margins", () => {
	const common = "#target{width:40px}";
	const baseline = fixture(common);
	const page = fixture(
		`${common}#target{margin-inline:auto;padding-inline:3px 7px}`,
	);
	const canonical = fixture(
		`${common}#target{margin-left:auto;margin-right:auto;padding-left:3px;padding-right:7px}`,
	);
	expect(baseline.rect()).toMatchObject({ x: 0, width: 40 });
	expect(page.rect()).toMatchObject({ x: 25, width: 50 });
	expect(page.rect("#child").x).toBe(28);
	const { image, layout } = parity(page, canonical);
	expect(
		layout.boxes.find((box) => box.ref === page.tree.reference(page.id())),
	).toMatchObject({ marginLeft: 25, marginRight: 25, contentWidth: 40 });
	expect(pixel(image, 24, 1)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 26, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 29, 1)).toEqual([0, 0, 255, 255]);
	for (const current of [page, canonical]) {
		const hits = documentHitTesting(current.tree);
		expect(hits.elementFromPoint(24, 1)).toBe(current.id("#host"));
		expect(hits.elementFromPoint(26, 1)).toBe(current.id());
		expect(hits.elementFromPoint(29, 1)).toBe(current.id("#child"));
	}
});

it.each([
	{ sizing: "content-box", baselineWidth: 44, width: 54, contentWidth: 40 },
	{ sizing: "border-box", baselineWidth: 40, width: 40, contentWidth: 26 },
])(
	"keeps inline padding inside the correct $sizing boundary",
	({ sizing, baselineWidth, width, contentWidth }) => {
		const common = `#target{box-sizing:${sizing};width:40px;border:2px solid black}`;
		const baseline = fixture(common);
		const page = fixture(
			`${common}#target{margin-inline:5px 9px;padding-inline:3px 7px}`,
		);
		const canonical = fixture(
			`${common}#target{margin-left:5px;margin-right:9px;padding-left:3px;padding-right:7px}`,
		);
		expect(baseline.rect()).toMatchObject({ x: 0, width: baselineWidth });
		expect(baseline.rect("#child").x).toBe(2);
		expect(page.rect()).toMatchObject({ x: 5, width, height: 14 });
		expect(page.rect("#child")).toMatchObject({ x: 10, y: 2 });
		const { image, layout } = parity(page, canonical);
		expect(
			layout.boxes.find((box) => box.ref === page.tree.reference(page.id())),
		).toMatchObject({ contentWidth, paddingLeft: 3, paddingRight: 7 });
		expect(pixel(image, 5, 3)).toEqual([0, 0, 0, 255]);
		expect(pixel(image, 8, 3)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, 11, 3)).toEqual([0, 0, 255, 255]);
	},
);

it("advances real inline text and the following sibling across both logical edges", () => {
	const markup =
		'<div id="target"><span id="child">a</span><span id="tail">b</span></div><div id="after"></div>';
	const common = "#child{width:auto;height:auto}";
	const baseline = fixture(common, markup);
	const page = fixture(
		`${common}#child{margin-inline:3px 4px;padding-inline:5px 6px}`,
		markup,
	);
	const canonical = fixture(
		`${common}#child{margin-left:3px;margin-right:4px;padding-left:5px;padding-right:6px}`,
		markup,
	);
	expect(baseline.rect("#child")).toMatchObject({ x: 0, width: 6 });
	expect(baseline.rect("#tail").x).toBe(6);
	expect(page.rect("#child")).toMatchObject({ x: 3, width: 17 });
	expect(page.rect("#tail").x).toBe(24);
	const { image, layout } = parity(page, canonical, [
		"#host",
		"#target",
		"#child",
		"#tail",
		"#after",
	]);
	const context = layout.contexts.find(
		(entry) => entry.ref === page.tree.reference(page.id()),
	);
	expect(context?.glyphs.map((glyph) => glyph.x)).toEqual([8, 24]);
	expect(pixel(image, 4, 3)).toEqual([0, 0, 255, 255]);
	for (const current of [page, canonical]) {
		const hits = documentHitTesting(current.tree);
		expect(hits.elementFromPoint(4, 3)).toBe(current.id("#child"));
		expect(hits.elementFromPoint(21, 3)).toBe(current.id());
	}
});

it("retains centered rich-button children and button-owned inline padding", () => {
	const markup =
		'<button id="target"><span id="child"></span></button><div id="after"></div>';
	const common =
		"#target{box-sizing:border-box;width:80px;height:50px;border:2px solid red;background:white;padding-top:3px;padding-bottom:11px;font-size:0;line-height:0}#child{display:inline-block}";
	const baseline = fixture(common, markup);
	const page = fixture(
		`${common}#target{margin-inline:5px 9px;padding-inline:5px 7px}`,
		markup,
	);
	const canonical = fixture(
		`${common}#target{margin-left:5px;margin-right:9px;padding-left:5px;padding-right:7px}`,
		markup,
	);
	const before = snapshotDocument(page.tree);
	const revision = page.tree.revision;
	expect(baseline.rect("#child").x).toBe(30);
	expect(page.rect()).toMatchObject({ x: 5, y: 0, width: 80, height: 50 });
	expect(page.rect("#child")).toMatchObject({
		x: 34,
		y: 16,
		width: 20,
		height: 10,
	});
	const { image, layout } = parity(page, canonical);
	expect(
		layout.boxes.find((box) => box.ref === page.tree.reference(page.id())),
	).toMatchObject({ paddingLeft: 5, paddingRight: 7, contentWidth: 64 });
	for (const current of [page, canonical]) {
		const hits = documentHitTesting(current.tree);
		expect(hits.elementFromPoint(35, 17)).toBe(current.id("#child"));
		expect(hits.elementFromPoint(8, 6)).toBe(current.id());
		expect(hits.elementsFromPoint(35, 17).slice(0, 2)).toEqual([
			current.id("#child"),
			current.id(),
		]);
	}
	expect(pixel(image, 5, 0)).toEqual([255, 0, 0, 255]);
	expect(pixel(image, 8, 6)).toEqual([255, 255, 255, 255]);
	expect(pixel(image, 35, 17)).toEqual([0, 0, 255, 255]);
	expect(page.tree.revision).toBe(revision);
	expect(snapshotDocument(page.tree)).toEqual(before);
});

it.each(["before", "after"] as const)(
	"lays out and paints ::%s inline spacing like physical edges",
	(name) => {
		const common = `#target::${name}{content:"";display:block;box-sizing:content-box;width:20px;height:6px;background:green}`;
		const baseline = fixture(common);
		const page = fixture(
			`${common}#target::${name}{margin-inline:5px 9px;padding-inline:3px 7px}`,
		);
		const canonical = fixture(
			`${common}#target::${name}{margin-left:5px;margin-right:9px;padding-left:3px;padding-right:7px}`,
		);
		const { image, layout } = parity(page, canonical);
		const generated = layout.text.horizontal.formatting.nodes.find(
			(node) =>
				node.generatedContent?.owner === page.id() &&
				node.generatedContent.name === name &&
				node.kind !== "text",
		);
		expect(generated).toBeDefined();
		const box = layout.boxes.find((entry) => entry.id === generated?.id);
		expect(box).toMatchObject({
			borderX: 5,
			contentX: 8,
			paddingLeft: 3,
			paddingRight: 7,
			borderBoxWidth: 30,
			borderBoxHeight: 6,
		});
		const vertical = name === "before" ? 1 : 11;
		expect(pixel(rasterizeDocument(baseline.tree).image, 1, vertical)).toEqual([
			0, 128, 0, 255,
		]);
		expect(pixel(image, 1, vertical)).toEqual([255, 0, 0, 255]);
		expect(pixel(image, 6, vertical)).toEqual([0, 128, 0, 255]);
		for (const current of [page, canonical])
			expect(
				documentHitTesting(current.tree).elementFromPoint(6, vertical),
			).toBe(current.id());
	},
);

it("invalidates rectangle, raster and hit caches after inherited variable and inline mutations", () => {
	const page = fixture(
		"#host{--space:2px 4px}#target{width:40px;padding-inline:var(--space)}",
	);
	const hits = documentHitTesting(page.tree);
	expect(page.rect()).toMatchObject({ width: 46 });
	expect(page.rect("#child").x).toBe(2);
	expect(hits.elementFromPoint(3, 1)).toBe(page.id("#child"));
	expect(pixel(rasterizeDocument(page.tree).image, 3, 1)).toEqual([
		0, 0, 255, 255,
	]);
	parity(
		page,
		fixture("#target{width:40px;padding-left:2px;padding-right:4px}"),
	);
	page.tree.setAttribute(page.id("#host"), "style", "--space:6px 8px");
	expect(page.rect()).toMatchObject({ width: 54 });
	expect(page.rect("#child").x).toBe(6);
	expect(hits.elementFromPoint(3, 1)).toBe(page.id());
	expect(pixel(rasterizeDocument(page.tree).image, 3, 1)).toEqual([
		255, 0, 0, 255,
	]);
	parity(
		page,
		fixture("#target{width:40px;padding-left:6px;padding-right:8px}"),
	);
	page.tree.setAttribute(
		page.id(),
		"style",
		"padding-left:1px;padding-inline-end:3px",
	);
	expect(page.rect()).toMatchObject({ width: 44 });
	expect(page.rect("#child").x).toBe(1);
	expect(hits.elementFromPoint(3, 1)).toBe(page.id("#child"));
	expect(pixel(rasterizeDocument(page.tree).image, 3, 1)).toEqual([
		0, 0, 255, 255,
	]);
	parity(
		page,
		fixture("#target{width:40px;padding-left:1px;padding-right:3px}"),
	);
});

it("reflows inherited logical padding when the parent's physical edges change", () => {
	const common =
		"#host{padding-left:3px;padding-right:7px}#target{width:40px;margin-left:5px;margin-right:9px}";
	const baseline = fixture(common);
	const page = fixture(`${common}#target{padding-inline:inherit}`);
	const canonical = fixture(
		`${common}#target{padding-left:inherit;padding-right:inherit}`,
	);
	expect(baseline.rect()).toMatchObject({ x: 8, width: 40 });
	expect(baseline.rect("#child").x).toBe(8);
	expect(page.rect()).toMatchObject({ x: 8, width: 50 });
	expect(page.rect("#child").x).toBe(11);
	parity(page, canonical);
	const hits = documentHitTesting(page.tree);
	expect(hits.elementFromPoint(12, 1)).toBe(page.id("#child"));
	for (const current of [page, canonical])
		current.tree.setAttribute(
			current.id("#host"),
			"style",
			"padding-left:7px;padding-right:9px",
		);
	expect(page.rect()).toMatchObject({ x: 12, width: 56 });
	expect(page.rect("#child").x).toBe(19);
	expect(hits.elementFromPoint(12, 1)).toBe(page.id());
	const { image } = parity(page, canonical);
	expect(pixel(image, 12, 1)).toEqual([255, 0, 0, 255]);
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
		const page = fixture(
			"#target{margin-inline:5px 9px;padding-inline:3px 7px}",
		);
		page.tree.setAttribute(page.id(), attribute, value);
		const before = snapshotDocument(page.tree);
		const revision = page.tree.revision;
		expect(buildFormattingTree(page.tree).issues[issue]).toBeGreaterThan(0);
		for (const operation of [
			() => layoutDocument(page.tree),
			() => page.rect(),
			() => rasterizeDocument(page.tree),
			() => documentHitTesting(page.tree).elementFromPoint(9, 1),
		])
			expect(operation).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
		expect(page.tree.revision).toBe(revision);
		expect(snapshotDocument(page.tree)).toEqual(before);
		page.tree.removeAttribute(page.id(), attribute);
		expect(page.rect()).toMatchObject({ x: 5, width: 86, height: 10 });
		parity(
			page,
			fixture(
				"#target{margin-left:5px;margin-right:9px;padding-left:3px;padding-right:7px}",
			),
		);
	},
);
