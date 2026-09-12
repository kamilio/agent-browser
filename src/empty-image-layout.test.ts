import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import {
	layoutDocument,
	type DocumentLayoutOptions,
} from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentElementSizes } from "./element-sizes.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { measureIntrinsicWidths } from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const alternatives = ["", ' alt=""'] as const;
const displays = ["inline", "block", "inline-block", "flow-root"] as const;
const contexts = [
	{ name: "inline", css: "", target: "" },
	{ name: "block", css: "", target: "display:block" },
	{ name: "inline-block", css: "", target: "display:inline-block" },
	{ name: "flow-root", css: "", target: "display:flow-root" },
	{
		name: "flex row",
		css: "main{display:flex;align-items:flex-start}",
		target: "",
	},
	{
		name: "flex column",
		css: "main{display:flex;flex-direction:column;align-items:flex-start}",
		target: "",
	},
	{
		name: "grid",
		css: "main{display:grid;grid-template-columns:60px 60px;grid-template-rows:40px;align-items:start}",
		target: "",
	},
	{
		name: "table cell",
		css: "table{border-collapse:separate;border-spacing:0}td{padding:0}",
		target: "",
	},
	{ name: "left float", css: "", target: "float:left" },
	{ name: "right float", css: "", target: "float:right" },
	{ name: "relative", css: "", target: "position:relative;left:7px;top:5px" },
	{
		name: "absolute",
		css: "main{position:relative}",
		target: "position:absolute;left:7px;top:5px",
	},
	{ name: "fixed", css: "", target: "position:fixed;left:7px;top:5px" },
] as const;

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:120px}${css}</style><main id="host">${markup}</main>`,
		"https://fixture.invalid/empty-image-layout",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector = "#photo") => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const geometry = documentGeometry(tree);
	const rect = (selector = "#photo") =>
		geometry.getBoundingClientRect(id(selector));
	return { tree, id, geometry, rect };
}

function finite(value: unknown): void {
	if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
	else if (value && typeof value === "object")
		for (const entry of Object.values(value)) finite(entry);
}

function assertEmpty(page: ReturnType<typeof fixture>) {
	expect(documentImages(page.tree).get(page.id())).toMatchObject({
		state: "empty",
		complete: true,
		currentSrc: "",
		naturalWidth: 0,
		naturalHeight: 0,
	});
	expect(documentImages(page.tree).decoded(page.id())).toBeUndefined();
	expect(documentImages(page.tree).metrics().requests).toBe(0);
	const formatting = buildFormattingTree(page.tree);
	finite(layoutDocument(page.tree).metrics);
	expect(
		formatting.nodes.find(
			(node) => node.ref === page.tree.reference(page.id()),
		),
	).toMatchObject({
		kind: "replaced",
		intrinsic: { width: 0, height: 0 },
		intrinsicRatio: false,
		emptyImage: true,
	});
	finite(page.rect());
	finite(page.geometry.getUsedStyle(page.id()));
}

function assertBlank(page: ReturnType<typeof fixture>) {
	const painted = rasterizeDocument(page.tree);
	expect(painted.metrics.paintedImages).toBe(0);
	expect(painted.metrics.paintedGlyphs).toBe(0);
	expect(painted.image.pixels.every((channel) => channel === 255)).toBe(true);
	finite(painted.metrics);
}

for (const alternative of alternatives) {
	it.each(displays)(
		`keeps natural and used dimensions zero for %s with${alternative || " no alt"}`,
		(display) => {
			const page = fixture(
				`<img id="photo"${alternative}>`,
				`#photo{display:${display}}`,
			);
			const before = snapshotDocument(page.tree);
			const revision = page.tree.revision;
			assertEmpty(page);
			expect(page.rect()).toMatchObject({ width: 0, height: 0 });
			expect(page.geometry.getUsedStyle(page.id())).toMatchObject({
				width: 0,
				height: 0,
			});
			expect(documentElementSizes(page.tree).get(page.id())).toMatchObject({
				clientWidth: 0,
				clientHeight: 0,
				offsetWidth: 0,
				offsetHeight: 0,
			});
			assertBlank(page);
			expect(page.tree.revision).toBe(revision);
			expect(snapshotDocument(page.tree)).toEqual(before);
		},
	);

	for (const display of displays) {
		it.each([
			["width only", "width:24px", "", 24, 0],
			["height only", "height:16px", "", 0, 16],
			["both", "width:24px;height:16px", "", 24, 16],
			["minimums", "min-width:12px;min-height:9px", "", 12, 9],
			[
				"maximums cannot invent size",
				"max-width:12px;max-height:9px",
				"",
				0,
				0,
			],
			[
				"clamps",
				"width:24px;height:16px;max-width:12px;max-height:9px",
				"",
				12,
				9,
			],
			[
				"minimums win",
				"width:24px;height:16px;min-width:18px;max-width:12px;min-height:13px;max-height:9px",
				"",
				18,
				13,
			],
			[
				"definite percentages",
				"width:50%;height:25%",
				"main{height:80px}",
				60,
				20,
			],
			["indefinite height percentage", "width:50%;height:25%", "", 60, 0],
			[
				"definite percentage minimums",
				"min-width:25%;min-height:25%",
				"main{height:80px}",
				30,
				20,
			],
			["indefinite percentage minimum", "min-height:25%", "", 0, 0],
			[
				"definite percentage maximums",
				"width:100%;height:100%;max-width:25%;max-height:25%",
				"main{height:80px}",
				30,
				20,
			],
			[
				"fractional independent sizes",
				"width:7.5px;height:3.25px",
				"",
				7.5,
				3.25,
			],
		] as const)(
			`resolves %s independently for ${display} with${alternative || " no alt"}`,
			(_name, declarations, parent, width, height) => {
				const page = fixture(
					`<img id="photo"${alternative}>`,
					`${parent}#photo{display:${display};${declarations}}`,
				);
				assertEmpty(page);
				expect(page.rect()).toMatchObject({ width, height });
				expect(page.geometry.getUsedStyle(page.id())).toMatchObject({
					width,
					height,
				});
				assertBlank(page);
			},
		);
	}

	it.each(contexts)(
		`keeps an unstyled empty replacement zero in $name with${alternative || " no alt"}`,
		(context) => {
			const markup = `<img id="photo"${alternative}>`;
			const page = fixture(
				context.name === "table cell"
					? `<table><tr><td>${markup}</td></tr></table>`
					: markup,
				`${context.css}#photo{${context.target}}`,
			);
			assertEmpty(page);
			expect(page.rect()).toMatchObject({ width: 0, height: 0 });
			assertBlank(page);
		},
	);

	it.each(contexts)(
		`matches an independently sized box's geometry, paint and hit identity in $name with${alternative || " no alt"}`,
		(context) => {
			const css = `${context.css}#photo{width:24px;height:16px;margin:4px;padding:2px;border:1px solid red;outline:2px solid blue;background:lime;${context.target}}`;
			const markup = `<img id="photo"${alternative}>`;
			const controlMarkup =
				'<span id="photo" style="display:inline-block"></span>';
			const wrap = (content: string) =>
				context.name === "table cell"
					? `<table><tr><td>${content}</td></tr></table>`
					: content;
			const page = fixture(wrap(markup), css);
			const control = fixture(wrap(controlMarkup), css);
			const before = snapshotDocument(page.tree);
			assertEmpty(page);
			expect(page.rect()).toMatchObject({ width: 30, height: 22 });
			expect(page.rect()).toEqual(control.rect());
			const painted = rasterizeDocument(page.tree);
			expect(painted.image.pixels).toEqual(
				rasterizeDocument(control.tree).image.pixels,
			);
			expect(painted.metrics.paintedImages).toBe(0);
			expect(painted.metrics.paintedGlyphs).toBe(0);
			const rectangle = page.rect();
			const hits = documentHitTesting(page.tree);
			expect(hits.elementFromPoint(rectangle.x + 0.5, rectangle.y + 0.5)).toBe(
				page.id(),
			);
			expect(hits.elementFromPoint(rectangle.x + 4, rectangle.y + 4)).toBe(
				page.id(),
			);
			expect(
				hits.elementFromPoint(rectangle.right - 0.5, rectangle.bottom - 0.5),
			).toBe(page.id());
			expect(hits.elementFromPoint(rectangle.x - 1, rectangle.y + 4)).not.toBe(
				page.id(),
			);
			expect(snapshotDocument(page.tree)).toEqual(before);
		},
	);
}

it.each([
	["content-box", "width:24px;height:16px", 30, 22, 24, 16],
	["border-box", "width:24px;height:16px", 24, 16, 18, 10],
	["border-box", "width:1px;height:1px", 6, 6, 0, 0],
	["content-box", "min-width:12px;min-height:10px", 18, 16, 12, 10],
	["border-box", "min-width:12px;min-height:10px", 12, 10, 6, 4],
	[
		"border-box",
		"width:80px;height:60px;max-width:20px;max-height:18px",
		20,
		18,
		14,
		12,
	],
] as const)(
	"resolves %s edges and constraints: %s",
	(sizing, declarations, width, height, contentWidth, contentHeight) => {
		const page = fixture(
			'<img id="photo">',
			`#photo{display:block;margin:5px;padding:2px;border:1px solid red;box-sizing:${sizing};${declarations}}`,
		);
		assertEmpty(page);
		expect(page.rect()).toMatchObject({ x: 5, y: 5, width, height });
		expect(page.geometry.getUsedStyle(page.id())).toMatchObject({
			width: sizing === "border-box" ? width : contentWidth,
			height: sizing === "border-box" ? height : contentHeight,
		});
		expect(documentElementSizes(page.tree).get(page.id())).toEqual({
			clientWidth: contentWidth + 4,
			clientHeight: contentHeight + 4,
			clientTop: 1,
			clientLeft: 1,
			offsetWidth: width,
			offsetHeight: height,
		});
	},
);

it.each([
	["row stretch", "display:flex;height:40px", "", "", 0, 40],
	[
		"column stretch",
		"display:flex;flex-direction:column;height:40px",
		"",
		"",
		120,
		0,
	],
	[
		"row shrink",
		"display:flex;align-items:flex-start",
		"width:80px;min-width:0",
		'<span style="width:80px;flex-shrink:1"></span>',
		60,
		0,
	],
	[
		"column shrink",
		"display:flex;flex-direction:column;align-items:flex-start;height:40px",
		"height:30px;min-height:0",
		'<span style="height:30px;flex-shrink:1"></span>',
		0,
		20,
	],
	[
		"row grow",
		"display:flex;align-items:flex-start",
		"flex-grow:1",
		'<span style="width:40px"></span>',
		80,
		0,
	],
	[
		"column grow",
		"display:flex;flex-direction:column;align-items:flex-start;height:40px",
		"flex-grow:1",
		'<span style="height:10px"></span>',
		0,
		30,
	],
] as const)(
	"coordinates no-ratio %s without inventing the other dimension",
	(_name, parent, declarations, sibling, width, height) => {
		const page = fixture(
			`<img id="photo">${sibling}`,
			`main{${parent}}#photo{${declarations}}`,
		);
		assertEmpty(page);
		expect(page.rect()).toMatchObject({ width, height });
		assertBlank(page);
	},
);

it.each([
	["", 0, 0],
	["width:24px", 0, 24],
	["height:16px", 0, 0],
	["min-width:12px", 0, 12],
	["padding:2px;border:1px solid red;margin:4px", 0, 14],
	["width:24px;padding:2px;border:1px solid red;margin:4px", 0, 38],
	[
		"width:24px;box-sizing:border-box;padding:2px;border:1px solid red;margin:4px",
		0,
		32,
	],
] as const)(
	"measures finite native intrinsic widths: %s",
	(declarations, content, contribution) => {
		const page = fixture('<img id="photo">', `#photo{${declarations}}`);
		const before = snapshotDocument(page.tree);
		const measured = measureIntrinsicWidths(page.tree);
		finite(measured);
		expect(
			measured.widths.find(
				(entry) => entry.ref === page.tree.reference(page.id()),
			),
		).toMatchObject({
			minContent: content,
			maxContent: content,
			minContribution: contribution,
			maxContribution: contribution,
		});
		expect(snapshotDocument(page.tree)).toEqual(before);
	},
);

it.each(["fill", "contain", "cover", "none", "scale-down"])(
	"retains the unsupported object-fit:%s and object-position profile guard",
	(fit) => {
		const page = fixture(
			'<img id="photo" alt="">',
			`#photo{width:24px;height:16px;object-fit:${fit};object-position:100% 100%;color:red}`,
		);
		expect(buildFormattingTree(page.tree).issues).toEqual({
			"css:unimplemented-css-property": 2,
		});
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(documentImages(page.tree).metrics()).toMatchObject({
			requests: 0,
			decodedBytes: 0,
		});
	},
);

it("retains the existing explicit replaced-grid-stretch guard for zero intrinsics", () => {
	const page = fixture(
		'<img id="photo">',
		"main{display:grid;grid-template-columns:60px;grid-template-rows:40px;align-items:stretch}",
	);
	const before = snapshotDocument(page.tree);
	expect(() => layoutDocument(page.tree)).toThrow(
		"Stretched replaced Grid items require aspect-ratio track feedback",
	);
	expect(snapshotDocument(page.tree)).toEqual(before);
	expect(documentImages(page.tree).metrics()).toMatchObject({
		requests: 0,
		decodedBytes: 0,
	});
});

it.each(alternatives)(
	"preserves inline neighbors and line geometry with%s",
	(alternative) => {
		const page = fixture(`AA<img id="photo"${alternative}>BB`);
		const control = fixture(
			'AA<span id="photo" style="display:inline-block;width:0;height:0"></span>BB',
		);
		assertEmpty(page);
		expect(page.rect()).toEqual(control.rect());
		expect(page.rect("#host")).toEqual(control.rect("#host"));
		const painted = rasterizeDocument(page.tree);
		expect(painted.image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		expect(painted.metrics.paintedImages).toBe(0);
		expect(painted.metrics.paintedGlyphs).toBe(4);
	},
);

it.each(["visibility:hidden", "display:none"])(
	"suppresses empty image paint and hit identity for %s",
	(declarations) => {
		const page = fixture(
			'<img id="photo">',
			`#photo{display:block;width:24px;height:16px;padding:2px;border:1px solid red;background:lime;outline:2px solid blue;${declarations}}`,
		);
		const before = snapshotDocument(page.tree);
		expect(page.rect()).toMatchObject(
			declarations === "display:none"
				? { width: 0, height: 0 }
				: { width: 30, height: 22 },
		);
		assertBlank(page);
		expect(documentHitTesting(page.tree).elementFromPoint(4, 4)).not.toBe(
			page.id(),
		);
		expect(snapshotDocument(page.tree)).toEqual(before);
	},
);

it.each([
	['width="24"', "", 24, 0],
	['height="16"', "", 0, 16],
	['width="24" height="16"', "", 24, 16],
	['width="24" height="16"', "width:10px;height:6px", 10, 6],
	['width="0" height="0"', "", 0, 0],
] as const)(
	"retains independent authored dimension hints %s with %s",
	(attributes, declarations, width, height) => {
		const page = fixture(
			`<img id="photo" ${attributes}>`,
			`#photo{${declarations}}`,
		);
		assertEmpty(page);
		expect(page.rect()).toMatchObject({ width, height });
		assertBlank(page);
		expect(page.tree.get(page.id()).attributes.src).toBeUndefined();
	},
);

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "document work", options: { maxWork: 1 } },
	{ name: "text work", options: { text: { maxWork: 1 } } },
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])("preserves the $name owner bound and DOM after rejection", ({ options }) => {
	const page = fixture(
		'<img id="photo"><span>AA</span>',
		"#photo{float:left;width:24px;height:16px}",
	);
	const before = snapshotDocument(page.tree);
	const revision = page.tree.revision;
	expect(() => layoutDocument(page.tree, options)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(page.tree.revision).toBe(revision);
	expect(snapshotDocument(page.tree)).toEqual(before);
	expect(page.rect()).toMatchObject({ width: 24, height: 16 });
});

it("does not bypass the dimension source cap for an empty image", () => {
	const page = fixture(`<img id="photo" width="${"1".repeat(4097)}">`);
	const before = JSON.stringify(page.tree.get(page.id()));
	const revision = page.tree.revision;
	expect(() => buildFormattingTree(page.tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(page.tree.revision).toBe(revision);
	expect(JSON.stringify(page.tree.get(page.id()))).toBe(before);
});

it("closes empty-image geometry, hit and image owners without retaining decoded data", () => {
	const page = fixture('<img id="photo">', "#photo{width:24px;height:16px}");
	const images = documentImages(page.tree);
	const hits = documentHitTesting(page.tree);
	const imageId = page.id();
	assertEmpty(page);
	expect(hits.elementFromPoint(4, 4)).toBe(imageId);
	page.tree.close();
	expect(images.metrics()).toMatchObject({
		closed: true,
		requests: 0,
		decodedBytes: 0,
	});
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => page.geometry.getBoundingClientRect(imageId)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});
