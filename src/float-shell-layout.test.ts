import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const shells = [
	{
		kind: "flex",
		css: "#shell{display:flex}#content{width:36px;flex-shrink:0}",
		markup: (content: string) =>
			`<div id="shell"><div id="content">${content}</div></div>`,
	},
	{
		kind: "grid",
		css: "#shell{display:grid;grid-template-columns:36px}",
		markup: (content: string) =>
			`<div id="shell"><div id="content">${content}</div></div>`,
	},
	{
		kind: "table",
		css: "#shell{border-spacing:0}td{padding:0;vertical-align:top}",
		markup: (content: string) =>
			`<table id="shell"><tr><td id="content">${content}</td></tr></table>`,
	},
];

afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(content: string, css = "", width = 36) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;background:white;font-size:8px;line-height:8px}main{width:${width}px}#float{float:left;width:8px;height:16px;background:blue}#shell{width:36px}#content{background:red}#after{height:4px;background:lime}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/float-shell-layout",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(96, 96);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const context = (selector: string, layout = layoutDocument(tree)) => {
		const found = layout.contexts.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing context ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		context,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	const image = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 96, height: 96 },
	}).image;
	const offset =
		(Math.floor(vertical) * image.width + Math.floor(horizontal)) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

function expectOwnership(layout: Readonly<DocumentLayout>) {
	for (const entries of [
		layout.boxes,
		layout.text.horizontal.widths,
		layout.contexts,
		layout.text.contexts,
	])
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
	for (const box of layout.boxes) {
		expect(box.ref).toBe(layout.text.horizontal.formatting.nodes[box.id].ref);
		expect(
			layout.text.horizontal.widths.find((entry) => entry.id === box.id),
		).toMatchObject({
			id: box.id,
			borderX: box.borderX,
			contentX: box.contentX,
			contentWidth: box.contentWidth,
		});
	}
	const glyphs = layout.contexts.reduce(
		(total, context) => total + context.glyphs.length,
		0,
	);
	const lines = layout.contexts.reduce(
		(total, context) => total + context.lines.length,
		0,
	);
	const fragments = layout.contexts.reduce(
		(total, context) => total + context.fragments.length,
		0,
	);
	expect(layout.metrics).toMatchObject({
		boxes: layout.boxes.length,
		glyphs,
		lines,
	});
	expect(layout.text.metrics).toMatchObject({ glyphs, lines, fragments });
	expect(layout.text.contexts.map((context) => context.id).sort()).toEqual(
		layout.contexts.map((context) => context.id).sort(),
	);
}

it.each(
	shells.flatMap((shell) =>
		["left", "right"].map((side) => ({ ...shell, side })),
	),
)(
	"uses the actual auto height and text of a $kind shell after a $side float",
	({ css, markup, side }) => {
		const page = fixture(
			`<div id="float"></div>${markup("AA BB CC")}<div id="after"></div>`,
			`${css}#float{float:${side}}`,
		);
		const layout = layoutDocument(page.tree);
		expect(page.rect("#float")).toMatchObject({
			x: side === "left" ? 0 : 28,
			y: 0,
			width: 8,
			height: 16,
		});
		expect(page.rect("#shell")).toMatchObject({
			x: 0,
			y: 16,
			width: 36,
			height: 16,
		});
		expect(page.rect("#content")).toMatchObject({
			x: 0,
			y: 16,
			width: 36,
			height: 16,
		});
		expect(page.rect("#after").y).toBe(32);
		expect(
			page
				.context("#content", layout)
				.glyphs.filter((glyph) => glyph.character !== " ")
				.map((glyph) => [glyph.character, glyph.x, glyph.y]),
		).toEqual([
			["A", 0, 16],
			["A", 6, 16],
			["B", 18, 16],
			["B", 24, 16],
			["C", 0, 24],
			["C", 6, 24],
		]);
		expect(pixel(page.tree, 35, 17)).toEqual([255, 0, 0, 255]);
		expect(pixel(page.tree, 35, 33)).toEqual([0, 255, 0, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(35, 17)).toBe(
			page.id("#content"),
		);
		expectOwnership(layout);
	},
);

it.each(shells)(
	"advances following flow by an explicit $kind shell height",
	({ css, markup }) => {
		const page = fixture(
			`<div id="float"></div>${markup("AA")}<div id="after"></div>`,
			`${css}#shell{height:24px}`,
		);
		expect(page.rect("#shell")).toMatchObject({ y: 16, width: 36, height: 24 });
		expect(page.rect("#after")).toMatchObject({ y: 40, height: 4 });
		expect(page.context("#content").glyphs.map((glyph) => glyph.y)).toEqual([
			16, 16,
		]);
		expectOwnership(layoutDocument(page.tree));
	},
);

it.each(shells)(
	"does not apply a future float retroactively to a preceding $kind shell",
	({ css, markup }) => {
		const page = fixture(
			`${markup("AA")}<div id="float"></div><div id="text">BB CC DD</div><div id="after"></div>`,
			`${css}#float{width:18px}`,
		);
		expect(page.rect("#shell")).toMatchObject({ y: 0, height: 8 });
		expect(page.rect("#float")).toMatchObject({ x: 0, y: 8, height: 16 });
		expect(page.rect("#text")).toMatchObject({
			x: 0,
			y: 8,
			width: 36,
			height: 24,
		});
		expect(page.context("#text").lines.map((line) => line.top)).toEqual([
			8, 16, 24,
		]);
		expect(
			page
				.context("#text")
				.glyphs.filter((glyph) => glyph.character !== " ")
				.map((glyph) => glyph.x),
		).toEqual([18, 24, 18, 24, 0, 6]);
		expect(page.rect("#after").y).toBe(32);
		expectOwnership(layoutDocument(page.tree));
	},
);

it.each(["left", "right"])(
	"retains actual outer text wrapping beside a %s float when merging a grid shell",
	(side) => {
		const shell = shells[1];
		const page = fixture(
			`<div id="float"></div><div id="text">AA BB CC DD</div>${shell.markup("EE")}<div id="after"></div>`,
			`${shell.css}#float{float:${side};width:18px}`,
		);
		const layout = layoutDocument(page.tree);
		const context = page.context("#text", layout);
		expect(context.lines.map((line) => line.top)).toEqual([0, 8, 16]);
		expect(
			context.glyphs
				.filter((glyph) => glyph.character !== " ")
				.map((glyph) => glyph.x),
		).toEqual(
			side === "left"
				? [18, 24, 18, 24, 0, 6, 18, 24]
				: [0, 6, 0, 6, 0, 6, 18, 24],
		);
		expect(page.rect("#shell")).toMatchObject({
			x: 0,
			y: 24,
			width: 36,
			height: 8,
		});
		expect(page.rect("#after").y).toBe(32);
		expect(layout.metrics.lines).toBe(4);
		expectOwnership(layout);
	},
);

it("lowers an intersecting shell instead of moving or narrowing it into spare beside-float space", () => {
	const shell = shells[0];
	const page = fixture(
		`<div id="float"></div>${shell.markup("AA")}<div id="after"></div>`,
		`${shell.css}#float{width:12px}`,
		64,
	);
	expect(page.rect("#float")).toMatchObject({
		x: 0,
		y: 0,
		width: 12,
		height: 16,
	});
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 16,
		width: 36,
		height: 8,
	});
	expect(page.rect("#after").y).toBe(24);
	expectOwnership(layoutDocument(page.tree));
});

it("lowers a full-width shell below both opposing floats without narrowing its track", () => {
	const shell = shells[1];
	const page = fixture(
		`<div id="float"></div><div id="right"></div>${shell.markup("AA")}<div id="after"></div>`,
		`${shell.css}#float{width:12px}#right{float:right;width:12px;height:24px}#shell{width:64px;grid-template-columns:64px}`,
		64,
	);
	expect(page.rect("#right")).toMatchObject({
		x: 52,
		y: 0,
		width: 12,
		height: 24,
	});
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 24,
		width: 64,
		height: 8,
	});
	expect(page.rect("#content").width).toBe(64);
	expect(page.rect("#after").y).toBe(32);
	expectOwnership(layoutDocument(page.tree));
});

it.each(shells)(
	"translates a $kind shell once inside an auto-height ordinary right float",
	({ css, markup }) => {
		const page = fixture(
			`<div id="float">${markup("AA")}</div><div id="after"></div>`,
			`${css}#float{float:right;width:36px;height:auto;padding:2px;margin-top:4px;margin-right:3px}#after{clear:both}`,
			64,
		);
		expect(page.rect("#float")).toMatchObject({
			x: 21,
			y: 4,
			width: 40,
			height: 12,
		});
		expect(page.rect("#shell")).toMatchObject({
			x: 23,
			y: 6,
			width: 36,
			height: 8,
		});
		expect(
			page.context("#content").glyphs.map((glyph) => [glyph.x, glyph.y]),
		).toEqual([
			[23, 6],
			[29, 6],
		]);
		expect(page.rect("#after").y).toBe(16);
		expect(pixel(page.tree, 58, 7)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(58, 7)).toBe(
			page.id("#content"),
		);
		expectOwnership(layoutDocument(page.tree));
	},
);

it.each(shells.filter((shell) => shell.kind !== "grid"))(
	"retains a $kind shell in an ordinary inline-block beside a page float",
	({ css, markup }) => {
		const page = fixture(
			`<div id="float"></div><div id="atom">${markup("AA")}</div>`,
			`${css}#atom{display:inline-block;width:36px}`,
			64,
		);
		const layout = layoutDocument(page.tree);
		expect(page.rect("#atom")).toMatchObject({
			x: 8,
			y: 0,
			width: 36,
			height: 8,
		});
		expect(page.rect("#shell")).toMatchObject({
			x: 8,
			y: 0,
			width: 36,
			height: 8,
		});
		expect(
			page
				.context("#content", layout)
				.glyphs.map((glyph) => [glyph.x, glyph.y]),
		).toEqual([
			[8, 0],
			[14, 0],
		]);
		expect(
			layout.contexts
				.flatMap((context) => context.fragments)
				.filter(
					(fragment) =>
						fragment.atomic &&
						fragment.ref === page.tree.reference(page.id("#atom")),
				),
		).toHaveLength(1);
		expectOwnership(layout);
	},
);

it("preserves the unsupported grid-shell atomic baseline inside an ordinary inline-block beside a page float", () => {
	const shell = shells[1];
	const page = fixture(
		`<div id="float"></div><div id="atom">${shell.markup("AA")}</div>`,
		`${shell.css}#atom{display:inline-block;width:36px}`,
		64,
	);
	const revision = page.tree.revision;
	const failure = expect.objectContaining({
		code: "unsupported",
		message: "Atomic inline baseline is not supported",
	});
	expect(() => layoutDocument(page.tree)).toThrow(failure);
	expect(() => page.rect("#atom")).toThrow(failure);
	expect(() => rasterizeDocument(page.tree)).toThrow(failure);
	expect(() => documentHitTesting(page.tree).elementFromPoint(9, 1)).toThrow(
		failure,
	);
	expect(page.tree.revision).toBe(revision);
});

it("coordinates a float and its table shell inside two nested inline-blocks", () => {
	const shell = shells[2];
	const page = fixture(
		`<div id="outer"><div id="inner"><div id="float">${shell.markup("AA")}</div></div></div>`,
		`${shell.css}#outer,#inner{display:inline-block;padding:2px}#outer{width:44px}#inner{width:40px}#float{float:right;width:36px;height:auto}`,
		64,
	);
	expect(page.rect("#outer")).toMatchObject({
		x: 0,
		y: 0,
		width: 48,
		height: 17,
	});
	expect(page.rect("#inner")).toMatchObject({
		x: 2,
		y: 2,
		width: 44,
		height: 12,
	});
	expect(page.rect("#float")).toMatchObject({
		x: 8,
		y: 4,
		width: 36,
		height: 8,
	});
	expect(page.rect("#shell")).toMatchObject({
		x: 8,
		y: 4,
		width: 36,
		height: 8,
	});
	expect(
		page.context("#content").glyphs.map((glyph) => [glyph.x, glyph.y]),
	).toEqual([
		[8, 4],
		[14, 4],
	]);
	expect(pixel(page.tree, 43, 5)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(43, 5)).toBe(
		page.id("#content"),
	);
	expectOwnership(layoutDocument(page.tree));
});

it("keeps shell-child atomics and outer atomics under unique owners", () => {
	const shell = shells[1];
	const page = fixture(
		`<div id="float"></div><span id="outer-atom" class="atom">OO</span>${shell.markup('<span id="inner-atom" class="atom">AA</span>BB')}<div id="after"></div>`,
		`${shell.css}.atom{display:inline-block;width:12px;height:8px;background:yellow}`,
	);
	const layout = layoutDocument(page.tree);
	expect(page.rect("#outer-atom")).toMatchObject({
		x: 8,
		y: 0,
		width: 12,
		height: 8,
	});
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 16,
		width: 36,
		height: 8,
	});
	expect(page.rect("#inner-atom")).toMatchObject({
		x: 0,
		y: 16,
		width: 12,
		height: 8,
	});
	for (const selector of ["#outer-atom", "#inner-atom"]) {
		const reference = page.tree.reference(page.id(selector));
		expect(
			layout.contexts.filter((context) => context.ref === reference),
		).toHaveLength(1);
		expect(
			layout.contexts
				.flatMap((context) => context.fragments)
				.filter((fragment) => fragment.atomic && fragment.ref === reference),
		).toHaveLength(1);
	}
	expect(
		page
			.context("#inner-atom", layout)
			.glyphs.map((glyph) => [glyph.x, glyph.y]),
	).toEqual([
		[0, 16],
		[6, 16],
	]);
	expect(
		page
			.context("#content", layout)
			.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
	).toEqual([
		["B", 12, 16],
		["B", 18, 16],
	]);
	expect(pixel(page.tree, 1, 23)).toEqual([255, 255, 0, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(1, 23)).toBe(
		page.id("#inner-atom"),
	);
	expectOwnership(layout);
});

it.each([1, 2])(
	"retains shell-child atomic metrics through %i ordinary float owners",
	(depth) => {
		const shell = shells[0];
		const nested =
			depth === 2 ? '<div id="nested-float" class="float-owner">' : "";
		const page = fixture(
			`<div id="float" class="float-owner">${nested}${shell.markup('A<br>B<span id="inner-atom" class="atom">C</span>')}${depth === 2 ? "</div>" : ""}</div><span id="outer-atom" class="atom">D</span>`,
			`${shell.css}.float-owner{float:left;width:32px}#float{width:32px;height:auto}#shell,#content{width:32px}.atom{display:inline-block;width:8px;height:8px;background:yellow}`,
			64,
		);
		const layout = layoutDocument(page.tree);
		expect(page.rect("#float")).toMatchObject({
			x: 0,
			y: 0,
			width: 32,
			height: 16,
		});
		expect(page.rect("#shell")).toMatchObject({
			x: 0,
			y: 0,
			width: 32,
			height: 16,
		});
		if (depth === 2)
			expect(page.rect("#nested-float")).toMatchObject({
				x: 0,
				y: 0,
				width: 32,
				height: 16,
			});
		const context = page.context("#content", layout);
		expect(context.lines.map((line) => line.top)).toEqual([0, 8]);
		expect(
			context.glyphs.map((glyph) => [glyph.character, glyph.x, glyph.y]),
		).toEqual([
			["A", 0, 0],
			["B", 0, 8],
		]);
		expect(page.rect("#inner-atom")).toMatchObject({
			x: 6,
			y: 8,
			width: 8,
			height: 8,
		});
		expect(page.rect("#outer-atom")).toMatchObject({
			x: 32,
			y: 0,
			width: 8,
			height: 8,
		});
		for (const selector of ["#inner-atom", "#outer-atom"]) {
			const reference = page.tree.reference(page.id(selector));
			const formatting = layout.text.horizontal.formatting.nodes.find(
				(node) => node.ref === reference,
			);
			if (!formatting) throw new Error(`Missing formatting node ${selector}`);
			const rectangle = page.rect(selector);
			expect(
				layout.boxes.filter((box) => box.id === formatting.id),
			).toHaveLength(1);
			const fragments = layout.contexts
				.flatMap((entry) => entry.fragments)
				.filter(
					(fragment) =>
						fragment.atomic && fragment.formattingId === formatting.id,
				);
			expect(fragments).toHaveLength(1);
			expect(fragments[0]).toMatchObject({
				ref: reference,
				x: rectangle.x,
				y: rectangle.y,
				width: rectangle.width,
				height: rectangle.height,
			});
			const metrics = (layout.text.horizontal.atomics ?? []).filter(
				(atomic) => atomic.id === formatting.id,
			);
			expect(metrics).toHaveLength(1);
			expect(metrics[0]).toMatchObject({
				borderBoxWidth: rectangle.width,
				block: { borderBoxHeight: rectangle.height },
			});
		}
		expect(pixel(page.tree, 7, 15)).toEqual([255, 255, 0, 255]);
		expect(documentHitTesting(page.tree).elementFromPoint(7, 15)).toBe(
			page.id("#inner-atom"),
		);
		expectOwnership(layout);
	},
);

it("retains collapsed table metadata, shared-border paint and physical hit halves below a float", () => {
	const page = fixture(
		'<div id="float"></div><table id="shell"><tr><td id="first"></td><td id="second"></td></tr></table><div id="after"></div>',
		"#shell{border-collapse:collapse;width:60px}td{padding:0;height:12px;border:2px solid red;background:white}#second{border-left:8px solid blue}",
		60,
	);
	const layout = layoutDocument(page.tree);
	const table = page.rect("#shell");
	const first = page.rect("#first");
	const second = page.rect("#second");
	const vertical = first.top + first.height / 2;
	const owner = layout.boxes.find(
		(box) => box.ref === page.tree.reference(page.id("#shell")),
	);
	if (!owner) throw new Error("Missing collapsed table box");
	expect(owner).toMatchObject({
		contentWidth: 60,
		paddingLeft: 0,
		paddingRight: 0,
		borderLeft: 1,
		borderRight: 1,
		borderBoxWidth: 62,
	});
	expect(table).toMatchObject({ x: 0, y: 16, width: 62 });
	expect(table.width).toBe(
		owner.contentWidth + owner.borderLeft + owner.borderRight,
	);
	expect(first.left - table.left).toBe(owner.borderLeft);
	expect(table.right - second.right).toBe(owner.borderRight);
	expect(first.right).toBe(second.left);
	expect(page.rect("#after").y).toBe(table.bottom);
	expect(
		layout.boxes.filter((box) => box.collapsedTableBorders !== undefined),
	).toHaveLength(1);
	expect(owner.collapsedTableBorders?.length).toBeGreaterThan(0);
	for (const selector of ["#first", "#second"]) {
		const box = layout.boxes.find(
			(entry) => entry.ref === page.tree.reference(page.id(selector)),
		);
		expect(box?.[selector === "#first" ? "borderRight" : "borderLeft"]).toBe(4);
	}
	expect(pixel(page.tree, first.right - 1, vertical)).toEqual([0, 0, 255, 255]);
	expect(pixel(page.tree, second.left + 1, vertical)).toEqual([0, 0, 255, 255]);
	expect(pixel(page.tree, table.left, vertical)).toEqual([255, 0, 0, 255]);
	const hits = documentHitTesting(page.tree);
	expect(hits.elementFromPoint(first.right - 0.25, vertical)).toBe(
		page.id("#first"),
	);
	expect(hits.elementFromPoint(second.left + 0.25, vertical)).toBe(
		page.id("#second"),
	);
	expect(hits.elementFromPoint(table.left + 0.25, vertical)).toBe(
		page.id("#shell"),
	);
	expectOwnership(layout);
});

it("invalidates float exclusions, shell text and used widths without changing old snapshots", () => {
	const shell = shells[1];
	const page = fixture(
		`<div id="float"></div>${shell.markup("AA")}<div id="after"></div>`,
		shell.css,
	);
	const original = layoutDocument(page.tree);
	const originalRect = page.rect("#shell");
	const hits = documentHitTesting(page.tree);
	expect(originalRect).toMatchObject({ x: 0, y: 16, width: 36, height: 8 });
	expect(hits.elementFromPoint(35, 17)).toBe(page.id("#content"));
	const builds = hits.metrics().builds;
	page.tree.setAttribute(
		page.id("#float"),
		"style",
		"float:right;width:12px;height:24px",
	);
	expect(page.rect("#float")).toMatchObject({
		x: 24,
		y: 0,
		width: 12,
		height: 24,
	});
	expect(page.rect("#shell").y).toBe(24);
	expect(hits.elementFromPoint(35, 17)).toBe(page.id("#float"));
	expect(pixel(page.tree, 35, 17)).toEqual([0, 0, 255, 255]);
	page.tree.setTextContent(page.id("#content"), "AA BB");
	page.tree.setAttribute(
		page.id("#shell"),
		"style",
		"width:26px;grid-template-columns:26px",
	);
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 24,
		width: 26,
		height: 16,
	});
	expect(page.rect("#after").y).toBe(40);
	page.tree.setAttribute(
		page.id("#shell"),
		"style",
		"width:36px;grid-template-columns:36px",
	);
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 24,
		width: 36,
		height: 8,
	});
	page.tree.setAttribute(
		page.id("#float"),
		"style",
		"float:none;width:12px;height:8px",
	);
	expect(page.rect("#shell")).toMatchObject({
		x: 0,
		y: 8,
		width: 36,
		height: 8,
	});
	expect(page.rect("#after").y).toBe(16);
	expect(hits.elementFromPoint(35, 9)).toBe(page.id("#content"));
	expect(hits.metrics().builds).toBeGreaterThan(builds);
	expect(pixel(page.tree, 35, 25)).toEqual([255, 255, 255, 255]);
	expect(originalRect).toMatchObject({ x: 0, y: 16, width: 36, height: 8 });
	expect(
		page
			.context("#content", original)
			.glyphs.map((glyph) => [glyph.character, glyph.y]),
	).toEqual([
		["A", 16],
		["A", 16],
	]);
	expectOwnership(original);
	expectOwnership(layoutDocument(page.tree));
});

it("clicks the empty center of a deferred grid anchor through a mocked session and closes its owners", async () => {
	const pageUrl = "https://fixture.invalid/float-shell-click";
	const destination = "https://fixture.invalid/float-shell-click-done";
	const requests: NetworkRequest[] = [];
	const loaded: DocumentTree[] = [];
	let closed = false;
	let releasedBySession = false;
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
		loadDocument: (response) => {
			const tree = parseHtmlDocument(
				response.url === pageUrl
					? '<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:16px}#target{display:grid;width:32px;grid-template-columns:32px;grid-template-rows:16px;background:red}</style><main><div id="float"></div><a id="target" href="/float-shell-click-done">Go</a></main>'
					: '<!doctype html><title>Done</title><p id="done">Done</p>',
				response.url,
			);
			loaded.push(tree);
			return tree;
		},
	});
	try {
		const tab = session.createTab();
		await session.navigate(tab.id, pageUrl);
		const page = session.page(tab.id);
		const source = page.document;
		documentStyles(source).setViewport(64, 64);
		const target = page.queries.querySelector("#target");
		const floated = page.queries.querySelector("#float");
		if (target === null || floated === null)
			throw new Error("Missing deferred grid click fixture");
		const reference = source.reference(target);
		expect(source.resolve(reference).id).toBe(target);
		const geometry = documentGeometry(source);
		const hits = documentHitTesting(source);
		expect(geometry.getBoundingClientRect(floated)).toMatchObject({
			x: 0,
			y: 0,
			width: 8,
			height: 16,
		});
		const rectangle = geometry.getBoundingClientRect(target);
		expect(rectangle).toMatchObject({
			x: 0,
			y: 16,
			width: 32,
			height: 16,
		});
		const center = {
			x: rectangle.x + rectangle.width / 2,
			y: rectangle.y + rectangle.height / 2,
		};
		const glyphs = layoutDocument(source).contexts.flatMap(
			(context) => context.glyphs,
		);
		expect(glyphs.map((glyph) => glyph.character).join("")).toBe("Go");
		for (const glyph of glyphs)
			expect(glyph.x + glyph.advance).toBeLessThan(center.x);
		expect(hits.elementFromPoint(center.x, center.y)).toBe(target);
		expect(pixel(source, center.x, center.y)).toEqual([255, 0, 0, 255]);
		const events: string[] = [];
		for (const type of ["mousedown", "mouseup", "click"])
			page.interactions.events.addEventListener(target, type, () =>
				events.push(type),
			);
		expect(session.history(tab.id)).toMatchObject({ index: 0, length: 1 });
		const clicked = await session.click(tab.id, reference);
		expect(clicked.mouse).toMatchObject({ reference, ...center });
		expect(clicked.interaction).toMatchObject({
			reference,
			defaultPrevented: false,
			defaultAction: { kind: "navigate", url: destination },
		});
		expect(clicked.navigation?.kind).toBe("document");
		expect(events).toEqual(["mousedown", "mouseup", "click"]);
		const current = session.page(tab.id);
		expect(current.document).not.toBe(source);
		expect(current.document.url).toBe(destination);
		const done = current.queries.querySelector("#done");
		if (done === null) throw new Error("Missing destination content");
		const currentReference = current.document.reference(done);
		expect(current.document.resolve(currentReference).id).toBe(done);
		expect(session.history(tab.id)).toMatchObject({
			index: 1,
			length: 2,
			entries: [
				{ url: pageUrl, active: false, requiresResubmission: false },
				{ url: destination, active: true, requiresResubmission: false },
			],
		});
		expect(requests.map((request) => request.url)).toEqual([
			pageUrl,
			destination,
		]);
		expect(session.metrics().commits).toBe(2);
		expect(source.nodeCount).toBe(0);
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
		expect(closed).toBe(false);
	} finally {
		session.close();
		releasedBySession = loaded.every((tree) => tree.nodeCount === 0);
		for (const tree of loaded) tree.close();
	}
	expect(loaded).toHaveLength(2);
	expect(releasedBySession).toBe(true);
	for (const tree of loaded) expect(tree.nodeCount).toBe(0);
	expect(closed).toBe(true);
	expect(session.metrics()).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
	});
});
