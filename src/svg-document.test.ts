import { afterEach, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { documentStyles } from "./styles.js";
import { DocumentQueries } from "./selectors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentGeometry } from "./document-geometry.js";
import { documentHitTesting } from "./hit-testing.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentImages } from "./document-images.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}${css}</style>${markup}`,
		"https://fixture.invalid/svg",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(400, 240);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const node = queries.querySelector(selector);
		if (node === null) throw new Error(`Missing SVG fixture ${selector}`);
		return node;
	};
	const rect = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const pixel = (across: number, down: number) => {
		const image = rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 200, height: 200 },
		}).image;
		const offset = (down * image.width + across) * 4;
		return Array.from(image.pixels.slice(offset, offset + 4));
	};
	return { tree, id, rect, pixel };
}

it.each(["inline", "inline-block", "block"])(
	"lays out, paints and hit-tests an actual native %s SVG rectangle",
	(display) => {
		const test = fixture(
			"<svg id=svg width=100 height=60><rect id=rect x=10 y=10 width=30 height=20 fill=red /></svg>",
			`svg{display:${display}}`,
		);
		expect(buildFormattingTree(test.tree).issues).toEqual({});
		expect(test.rect("#svg")).toMatchObject({
			x: 0,
			y: 0,
			width: 100,
			height: 60,
		});
		expect(test.rect("#rect")).toMatchObject({
			x: 10,
			y: 10,
			width: 30,
			height: 20,
		});
		expect(test.pixel(20, 20)).toEqual([255, 0, 0, 255]);
		expect(test.pixel(50, 20)).toEqual([255, 255, 255, 255]);
		expect(documentHitTesting(test.tree).elementFromPoint(20, 20)).toBe(
			test.id("#rect"),
		);
		expect(documentHitTesting(test.tree).elementFromPoint(50, 20)).toBe(
			test.id("#svg"),
		);
		expect(documentImages(test.tree).metrics().requests).toBe(0);
	},
);

it.each(["inline", "block"])(
	"offsets %s SVG content through native borders and padding",
	(display) => {
		const test = fixture(
			"<svg id=svg width=100 height=60><rect id=rect x=10 y=10 width=30 height=20 fill=red /></svg>",
			`svg{display:${display};border:2px solid blue;padding:3px}`,
		);
		expect(test.rect("#rect")).toMatchObject({
			x: 15,
			y: 15,
			width: 30,
			height: 20,
		});
		expect(test.pixel(1, 1)).toEqual([0, 0, 255, 255]);
		expect(test.pixel(15, 15)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(test.tree).elementFromPoint(15, 15)).toBe(
			test.id("#rect"),
		);
	},
);

it("keeps SVG attribute dimensions below authored CSS priority", () => {
	const test = fixture(
		"<svg id=svg width=100 height=60><rect id=rect width=30 height=20 fill=red /></svg>",
		"svg{width:120px;height:80px}rect{width:40px}",
	);
	expect(test.rect("#svg")).toMatchObject({ width: 120, height: 80 });
	expect(test.rect("#rect")).toMatchObject({ width: 40, height: 20 });
});

it.each([
	["", { x: 25, y: 0, width: 50, height: 50 }],
	['preserveAspectRatio="none"', { x: 0, y: 0, width: 100, height: 50 }],
	[
		'preserveAspectRatio="xMaxYMax meet"',
		{ x: 50, y: 0, width: 50, height: 50 },
	],
	[
		'preserveAspectRatio="xMidYMid slice"',
		{ x: 0, y: -25, width: 100, height: 100 },
	],
] as const)("projects viewBox with %s", (attributes, expected) => {
	const test = fixture(
		`<svg id=svg width=100 height=50 viewBox="0 0 10 10" ${attributes}><rect id=rect width=10 height=10 fill=red /></svg>`,
	);
	expect(test.rect("#rect")).toMatchObject(expected);
	expect(test.pixel(75, 60)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(75, 60)).not.toBe(
		test.id("#rect"),
	);
});

it("composes group transforms and exposes group descendant bounds", () => {
	const test = fixture(
		'<svg width=100 height=60><g id=group transform="translate(10 5) scale(2)"><rect id=rect width=10 height=5 fill=red /></g></svg>',
	);
	expect(test.rect("#rect")).toMatchObject({
		x: 10,
		y: 5,
		width: 20,
		height: 10,
	});
	expect(test.rect("#group")).toEqual(test.rect("#rect"));
	expect(documentHitTesting(test.tree).elementFromPoint(15, 10)).toBe(
		test.id("#rect"),
	);
});

it("uses path fill geometry, not its bounding rectangle, for hit testing", () => {
	const test = fixture(
		'<svg id=svg width=100 height=60><path id=path fill=red fill-rule=evenodd d="M0 0H60V60H0Z M20 20H40V40H20Z" /></svg>',
	);
	expect(test.rect("#path")).toMatchObject({
		x: 0,
		y: 0,
		width: 60,
		height: 60,
	});
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).toBe(
		test.id("#path"),
	);
	expect(documentHitTesting(test.tree).elementFromPoint(30, 30)).toBe(
		test.id("#svg"),
	);
	expect(test.pixel(30, 30)).toEqual([255, 255, 255, 255]);
});

it("supports analytic curved-path client bounds", () => {
	const test = fixture(
		'<svg width=100 height=100><path id=path d="M0 0Q50 100 100 0Z" fill=red /></svg>',
	);
	expect(test.rect("#path")).toMatchObject({
		x: 0,
		y: 0,
		width: 100,
		height: 50,
	});
	expect(test.pixel(50, 20)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(5, 45)).not.toBe(
		test.id("#path"),
	);
});

it("inherits currentColor through native SVG presentation and CSS", () => {
	const test = fixture(
		"<svg width=100 height=50 color=red><g fill=currentColor><rect id=first width=20 height=20 /><rect id=second x=30 width=20 height=20 color=blue /></g></svg>",
	);
	expect(test.pixel(10, 10)).toEqual([255, 0, 0, 255]);
	expect(test.pixel(40, 10)).toEqual([0, 0, 255, 255]);
	test.tree.setAttribute(test.id("#second"), "style", "color:green");
	expect(test.pixel(40, 10)).toEqual([0, 128, 0, 255]);
});

it("preserves visibility overrides and pointer-events inheritance", () => {
	const test = fixture(
		"<svg id=svg width=100 height=50 visibility=hidden pointer-events=none><rect id=rect width=20 height=20 fill=red visibility=visible pointer-events=auto /></svg>",
	);
	expect(test.pixel(10, 10)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).toBe(
		test.id("#rect"),
	);
	test.tree.setAttribute(test.id("#rect"), "pointer-events", "none");
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).not.toBe(
		test.id("#rect"),
	);
});

it("keeps transparent painted fills hit-testable and none fills untargetable", () => {
	const test = fixture(
		"<svg id=svg width=100 height=50><rect id=rect width=20 height=20 fill=transparent /></svg>",
	);
	expect(test.pixel(10, 10)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).toBe(
		test.id("#rect"),
	);
	test.tree.setAttribute(test.id("#rect"), "fill", "none");
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).toBe(
		test.id("#svg"),
	);
});

it("invalidates native paint, geometry, hit regions and prepared rasters after mutation", () => {
	const test = fixture(
		"<svg width=100 height=60><rect id=rect width=20 height=20 fill=red /></svg>",
	);
	const prepared = prepareDocumentRaster(test.tree);
	expect(test.rect("#rect").width).toBe(20);
	expect(documentHitTesting(test.tree).elementFromPoint(30, 10)).not.toBe(
		test.id("#rect"),
	);
	test.tree.setAttribute(test.id("#rect"), "width", "40");
	test.tree.setAttribute(test.id("#rect"), "fill", "blue");
	expect(test.rect("#rect").width).toBe(40);
	expect(test.pixel(30, 10)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(30, 10)).toBe(
		test.id("#rect"),
	);
	expect(() => prepared.rasterize()).toThrow("stale");
});

it.each([
	["<svg id=svg></svg>", 300, 150],
	["<svg id=svg width=100></svg>", 100, 150],
	['<svg id=svg viewBox="0 0 40 10"></svg>', 300, 75],
	['<svg id=svg height=100 viewBox="0 0 20 10"></svg>', 200, 100],
] as const)("resolves intrinsic SVG viewport %s", (markup, width, height) => {
	const test = fixture(markup);
	expect(test.rect("#svg")).toMatchObject({ width, height });
});

it.each(["block", "flex", "grid"])(
	"keeps non-ratio SVG height independent in %s layout",
	(display) => {
		const test = fixture(
			"<main><svg id=svg width=100></svg></main>",
			`main{display:${display};width:300px;align-items:start}`,
		);
		expect(test.rect("#svg")).toMatchObject({ width: 100, height: 150 });
	},
);

it("disables graphics for a zero-sized viewBox without manufacturing pixels", () => {
	const test = fixture(
		'<svg id=svg width=100 height=50 viewBox="0 0 0 10"><rect id=rect width=20 height=20 fill=red /></svg>',
	);
	expect(test.rect("#svg")).toMatchObject({ width: 100, height: 50 });
	expect(test.pixel(10, 10)).toEqual([255, 255, 255, 255]);
	expect(documentHitTesting(test.tree).elementFromPoint(10, 10)).not.toBe(
		test.id("#rect"),
	);
});

it.each([
	"<text>Hello</text>",
	'<path d="M0 0H20V20Z" marker-end="url(#marker)" />',
	'<rect width=20 height=20 transform="scale(2)" transform-origin="20px 20px" />',
	'<use href="#other" />',
	'<image href="/image.png" />',
	"<foreignObject><p>HTML</p></foreignObject>",
	"<svg></svg>",
	'<a href="/next"><rect width=10 height=10 /></a>',
	"<rect width=10 height=10 stroke=red />",
	'<g opacity="0.5"><rect width=10 height=10 /></g>',
	'<rect width=10 height=10 fill="url(#gradient)" />',
])("preserves the unsupported SVG guard for %s", (content) => {
	const test = fixture(`<svg id=svg width=100 height=50>${content}</svg>`);
	expect(
		buildFormattingTree(test.tree).issues["svg-layout-not-supported"],
	).toBe(1);
	expect(() => test.rect("#svg")).toThrow("issue-free");
});

it("does not hide unsupported SVG CSS or visible-overflow declarations", () => {
	const styled = fixture(
		"<svg id=svg width=100 height=50><rect width=20 height=20 /></svg>",
		"rect{fill:red}",
	);
	expect(() => styled.rect("#svg")).toThrow("issue-free");
	const overflow = fixture(
		"<svg id=svg width=100 height=50 overflow=visible></svg>",
	);
	expect(
		buildFormattingTree(overflow.tree).issues[
			"svg-viewport-overflow-not-supported"
		],
	).toBe(1);
	expect(() => overflow.rect("#svg")).toThrow("issue-free");
});
