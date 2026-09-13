import { afterEach, expect, it } from "vitest";
import {
	type DocumentLayout,
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import { type DocumentRaster, rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	type FormattingNode,
	type FormattingTree,
} from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const cell = '<tbody><tr><td id="cell"></td></tr></tbody>';
const table = `<table id="table"><caption id="caption"></caption>${cell}</table>`;
const after = '<div id="after"></div>';
type CaptionNode = FormattingNode & {
	tableGrid?: number;
	tableWrapper?: number;
	tableCaptions?: readonly number[];
};

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(markup = table + after, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0;box-sizing:content-box;font-family:"Agent Mono";font-size:8px;line-height:8px}html,body{background:white}table,.table{width:120px;border-collapse:separate;border-spacing:0}td,.cell{height:20px;vertical-align:top}caption,.caption{height:12px;text-align:left}#after{height:5px}${css}</style><body>${markup}</body>`,
		"https://fixture.invalid/table-caption-layout",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(300, 240);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing caption fixture ${selector}`);
		return found;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const read = () => {
		const layout = layoutDocument(tree);
		const formatting = layout.text.horizontal.formatting as Omit<
			FormattingTree,
			"nodes"
		> & { nodes: readonly CaptionNode[] };
		const node = (selector: string) => {
			const matches = formatting.nodes.filter(
				(entry) => entry.ref === ref(selector),
			);
			expect(matches).toHaveLength(1);
			return matches[0];
		};
		const box = (selector: string) => {
			const matches = layout.boxes.filter(
				(entry) => entry.ref === ref(selector),
			);
			expect(matches).toHaveLength(1);
			return matches[0];
		};
		const wrapper = (selector = "#table") => {
			const wrapperId = node(selector).tableWrapper;
			if (wrapperId === undefined) throw new Error("Missing table wrapper");
			const matches = layout.boxes.filter((entry) => entry.id === wrapperId);
			expect(matches).toHaveLength(1);
			return matches[0];
		};
		return { layout, formatting, node, box, wrapper };
	};
	return { tree, id, ref, read };
}

function pixel(raster: DocumentRaster, horizontal: number, vertical: number) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	expect(column).toBeGreaterThanOrEqual(0);
	expect(column).toBeLessThan(raster.image.width);
	expect(row).toBeGreaterThanOrEqual(0);
	expect(row).toBeLessThan(raster.image.height);
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

function dimensions(layout: DocumentLayout) {
	return layout.boxes
		.filter((box) => box.ref !== undefined)
		.map((box) => ({
			ref: box.ref,
			x: box.borderX,
			y: box.borderY,
			width: box.borderBoxWidth,
			height: box.borderBoxHeight,
		}))
		.sort((first, second) => (first.ref ?? "").localeCompare(second.ref ?? ""));
}

it.each(["top", "bottom"])(
	"places a %s caption outside the real grid and inside following flow",
	(side) => {
		const page = fixture(undefined, `caption{caption-side:${side}}`).read();
		expect(page.box("#table")).toMatchObject({
			borderX: 0,
			borderY: side === "top" ? 12 : 0,
			borderBoxWidth: 120,
			borderBoxHeight: 20,
		});
		expect(page.box("#caption")).toMatchObject({
			borderX: 0,
			borderY: side === "top" ? 0 : 20,
			borderBoxWidth: 120,
			borderBoxHeight: 12,
		});
		expect(page.wrapper()).toMatchObject({
			borderY: 0,
			borderBoxWidth: 120,
			borderBoxHeight: 32,
		});
		expect(page.box("#after").borderY).toBe(32);
	},
);

it("preserves ordinary no-caption grid dimensions and following flow", () => {
	const page = fixture(`<table id="table">${cell}</table>${after}`).read();
	expect(page.box("#table")).toMatchObject({
		borderX: 0,
		borderY: 0,
		borderBoxWidth: 120,
		borderBoxHeight: 20,
	});
	expect(page.box("#cell").borderY).toBe(0);
	expect(page.box("#after").borderY).toBe(20);
});

it("gives the anonymous wrapper no DOM reference or paint ownership", () => {
	const page = fixture(
		undefined,
		"table{background:red;border:2px solid blue}",
	).read();
	const grid = page.node("#table");
	const caption = page.node("#caption");
	const wrapper = page.formatting.nodes[page.wrapper().id];
	expect(wrapper.tableGrid).toBe(grid.id);
	expect(grid.tableWrapper).toBe(wrapper.id);
	expect(wrapper.ref).toBeUndefined();
	expect(wrapper.paint).toBeUndefined();
	expect(page.wrapper().ref).toBeUndefined();
	expect(grid.paint).toBeDefined();
	expect(grid.parent).toBe(wrapper.id);
	expect(caption.parent).toBe(wrapper.id);
	expect(grid.children).not.toContain(caption.id);
	expect(grid.tableCaptions).toEqual([caption.id]);
	expect(wrapper.children).toEqual([caption.id, grid.id]);
	expect(page.wrapper().borderBoxWidth).toBe(page.box("#table").borderBoxWidth);
});

it("orders multiple CSS captions by side while retaining source-order ownership", () => {
	const test = fixture(
		'<div id="table" class="table"><div id="bottom-first" class="caption"></div><div class="row"><div id="cell" class="cell"></div></div><div id="top-first" class="caption"></div><div id="bottom-last" class="caption"></div><div id="top-last" class="caption"></div></div>' +
			after,
		".table{display:table}.row{display:table-row}.cell{display:table-cell}.caption{display:table-caption;height:6px}#bottom-first,#bottom-last{caption-side:bottom}",
	);
	const page = test.read();
	const source = ["#bottom-first", "#top-first", "#bottom-last", "#top-last"];
	expect(page.node("#table").tableCaptions).toEqual(
		source.map((selector) => page.node(selector).id),
	);
	expect(test.tree.get(test.id("#table")).children).toEqual([
		test.id("#bottom-first"),
		test.tree.get(test.id("#cell")).parent,
		test.id("#top-first"),
		test.id("#bottom-last"),
		test.id("#top-last"),
	]);
	for (const [selector, vertical] of [
		["#top-first", 0],
		["#top-last", 6],
		["#table", 12],
		["#bottom-first", 32],
		["#bottom-last", 38],
		["#after", 44],
	] as const)
		expect(page.box(selector).borderY).toBe(vertical);
});

it("puts table margins on the wrapper rather than between caption and grid", () => {
	const page = fixture(
		'<div style="height:7px"></div>' + table + after,
		"table{margin:5px 9px 11px 13px}",
	).read();
	expect(page.wrapper()).toMatchObject({ borderX: 13, borderY: 12 });
	expect(page.box("#caption")).toMatchObject({ borderX: 13, borderY: 12 });
	expect(page.box("#table")).toMatchObject({
		borderX: 13,
		borderY: 24,
		marginLeft: 0,
		marginTop: 0,
		marginBottom: 0,
	});
	expect(page.box("#after").borderY).toBe(55);
});

it("centers the complete wrapper with table auto margins", () => {
	const page = fixture(
		undefined,
		"table{margin-left:auto;margin-right:auto}",
	).read();
	for (const selector of ["#table", "#caption", "#cell"])
		expect(page.box(selector).borderX).toBe(90);
	expect(page.wrapper()).toMatchObject({
		borderX: 90,
		marginLeft: 90,
		marginRight: 90,
		borderBoxWidth: 120,
	});
});

it("keeps separate table padding, solid borders and spacing below the caption", () => {
	const page = fixture(
		undefined,
		"table{box-sizing:border-box;border:4px solid blue;padding:6px;border-spacing:2px}",
	).read();
	expect(page.box("#table")).toMatchObject({
		borderY: 12,
		borderBoxWidth: 120,
		borderBoxHeight: 44,
		contentY: 22,
	});
	expect(page.box("#cell")).toMatchObject({ borderX: 12, borderY: 24 });
	expect(page.box("#caption").borderBoxWidth).toBe(120);
	expect(page.wrapper().borderBoxHeight).toBe(56);
	expect(page.box("#after").borderY).toBe(56);
});

it("keeps collapsed solid grid borders independent of the caption box", () => {
	const css = "table{border-collapse:collapse}td{border:2px solid blue}";
	const control = fixture(
		`<table id="table">${cell}</table>${after}`,
		css,
	).read();
	const page = fixture(undefined, css).read();
	expect(page.box("#table").borderY).toBe(12);
	expect(page.box("#table").borderBoxHeight).toBe(
		control.box("#table").borderBoxHeight,
	);
	expect(page.box("#table").borderBoxWidth).toBe(
		control.box("#table").borderBoxWidth,
	);
	expect(page.box("#cell").borderY).toBe(control.box("#cell").borderY + 12);
	expect(page.box("#caption")).toMatchObject({ borderTop: 0, borderBottom: 0 });
	expect(page.box("#after").borderY).toBe(control.box("#after").borderY + 12);
});

it("lays out caption padding, borders and margins as an ordinary block", () => {
	const page = fixture(
		undefined,
		"caption{padding:4px;border:2px solid red;margin:3px 9px 5px 7px}",
	).read();
	expect(page.box("#caption")).toMatchObject({
		borderX: 7,
		borderY: 3,
		borderBoxWidth: 104,
		borderBoxHeight: 24,
		contentX: 13,
		contentY: 9,
	});
	expect(page.box("#table").borderY).toBe(32);
	expect(page.wrapper().borderBoxHeight).toBe(52);
	expect(page.box("#after").borderY).toBe(52);
});

it("resolves a fixed caption width and auto margins inside the wrapper", () => {
	const page = fixture(
		undefined,
		"caption{width:40px;margin-left:auto;margin-right:auto}",
	).read();
	expect(page.box("#caption")).toMatchObject({
		borderX: 40,
		borderBoxWidth: 40,
		marginLeft: 40,
		marginRight: 40,
	});
	expect(page.wrapper().borderBoxWidth).toBe(120);
});

it("bases percentage caption width and all percentage padding on wrapper width", () => {
	const page = fixture(
		undefined,
		"table{width:200px}caption{width:50%;padding:10%}",
	).read();
	expect(page.box("#caption")).toMatchObject({
		contentWidth: 100,
		paddingLeft: 20,
		paddingRight: 20,
		paddingTop: 20,
		paddingBottom: 20,
		borderBoxWidth: 140,
		borderBoxHeight: 52,
	});
	expect(page.box("#table").borderY).toBe(52);
	expect(page.box("#after").borderY).toBe(72);
});

it.each(["auto", "24px"])(
	"expands a %s table to the caption minimum rather than clipping the word",
	(width) => {
		const page = fixture(
			table.replace(
				'<caption id="caption"></caption>',
				'<caption id="caption">AAAAAAAAAA</caption>',
			) + after,
			`table{width:${width}}caption{height:auto}td{width:24px}`,
		).read();
		expect(page.box("#table").borderBoxWidth).toBe(60);
		expect(page.box("#caption")).toMatchObject({
			borderBoxWidth: 60,
			borderBoxHeight: 8,
		});
		expect(page.wrapper().borderBoxWidth).toBe(60);
	},
);

it.each(["auto", "24px"])(
	"wraps caption max-content without enlarging a %s table unnecessarily",
	(width) => {
		const page = fixture(
			table.replace(
				'<caption id="caption"></caption>',
				'<caption id="caption">AA AA AA AA</caption>',
			) + after,
			`table{width:${width}}caption{height:auto}td{width:24px}`,
		).read();
		expect(page.box("#table").borderBoxWidth).toBe(24);
		expect(page.box("#caption")).toMatchObject({
			borderBoxWidth: 24,
			borderBoxHeight: 32,
		});
		expect(page.box("#table").borderY).toBe(32);
		expect(page.box("#after").borderY).toBe(52);
	},
);

it("includes caption horizontal edges in its minimum intrinsic contribution", () => {
	const page = fixture(
		table.replace(
			'<caption id="caption"></caption>',
			'<caption id="caption">AAAA</caption>',
		) + after,
		"table{width:auto}td{width:12px}caption{height:auto;padding:0 3px;border:2px solid red;margin:0 5px}",
	).read();
	expect(page.box("#table").borderBoxWidth).toBe(44);
	expect(page.box("#caption")).toMatchObject({
		borderX: 5,
		borderBoxWidth: 34,
	});
});

it("retains an empty auto-height caption without creating a phantom line", () => {
	const page = fixture(undefined, "caption{height:auto}").read();
	expect(page.box("#caption").borderBoxHeight).toBe(0);
	expect(page.box("#table").borderY).toBe(0);
	expect(page.wrapper().borderBoxHeight).toBe(20);
	expect(page.box("#after").borderY).toBe(20);
});

it("supports a caption-only table with a zero-height real grid", () => {
	const page = fixture(
		'<table id="table"><caption id="caption"></caption></table>' + after,
	).read();
	expect(page.box("#table")).toMatchObject({
		borderY: 12,
		borderBoxHeight: 0,
		borderBoxWidth: 120,
	});
	expect(page.wrapper().borderBoxHeight).toBe(12);
	expect(page.box("#after").borderY).toBe(12);
});

it("keeps nested table captions owned by their respective wrappers", () => {
	const test = fixture(
		'<table id="table"><caption id="caption"></caption><tr><td id="cell"><table id="inner"><caption id="inner-caption"></caption><tr><td id="inner-cell"></td></tr></table></td></tr></table>' +
			after,
		"#inner{width:60px}#inner-caption{height:6px}#inner-cell{height:10px}",
	);
	const page = test.read();
	expect(page.node("#table").tableCaptions).toEqual([page.node("#caption").id]);
	expect(page.node("#inner").tableCaptions).toEqual([
		page.node("#inner-caption").id,
	]);
	expect(page.wrapper().id).not.toBe(page.wrapper("#inner").id);
	expect(page.box("#inner-caption")).toMatchObject({
		borderY: 12,
		borderBoxWidth: 60,
	});
	expect(page.box("#inner")).toMatchObject({
		borderY: 18,
		borderBoxHeight: 10,
	});
	expect(page.box("#table").borderBoxHeight).toBe(20);
	expect(page.box("#after").borderY).toBe(32);
});

it("offsets both caption and grid by the containing block and preceding flow", () => {
	const page = fixture(
		'<main style="padding:10px"><div style="height:7px"></div>' +
			table +
			after +
			"</main>",
	).read();
	expect(page.box("#caption")).toMatchObject({ borderX: 10, borderY: 17 });
	expect(page.box("#table")).toMatchObject({ borderX: 10, borderY: 29 });
	expect(page.box("#after").borderY).toBe(49);
});

it("invalidates caption placement and hit regions after caption-side changes", () => {
	const test = fixture();
	const hits = documentHitTesting(test.tree);
	expect(hits.elementFromPoint(5, 5)).toBe(test.id("#caption"));
	test.tree.setAttribute(test.id("#caption"), "style", "caption-side:bottom");
	const page = test.read();
	expect(page.box("#table").borderY).toBe(0);
	expect(page.box("#caption").borderY).toBe(20);
	expect(page.box("#after").borderY).toBe(32);
	expect(hits.elementFromPoint(5, 5)).toBe(test.id("#cell"));
	expect(hits.elementFromPoint(5, 25)).toBe(test.id("#caption"));
});

it("removes caption ownership and height after detaching the caption", () => {
	const test = fixture();
	test.read();
	const captionRef = test.ref("#caption");
	test.tree.remove(test.id("#caption"));
	const page = test.read();
	expect(page.formatting.nodes.some((node) => node.ref === captionRef)).toBe(
		false,
	);
	expect(page.layout.boxes.some((box) => box.ref === captionRef)).toBe(false);
	expect(page.node("#table").tableCaptions ?? []).toEqual([]);
	expect(page.box("#table").borderY).toBe(0);
	expect(page.box("#after").borderY).toBe(20);
});

it("moves caption ownership between tables after DOM reparenting", () => {
	const test = fixture(
		table + '<table id="second"><tr><td></td></tr></table>' + after,
	);
	test.read();
	const captionId = test.id("#caption");
	test.tree.append(test.id("#second"), captionId);
	const page = test.read();
	expect(test.tree.get(captionId).parent).toBe(test.id("#second"));
	expect(page.node("#table").tableCaptions ?? []).toEqual([]);
	expect(page.node("#second").tableCaptions).toEqual([
		page.node("#caption").id,
	]);
	expect(page.node("#caption").parent).toBe(page.wrapper("#second").id);
	expect(page.box("#table").borderY).toBe(0);
	expect(page.box("#caption").borderY).toBe(20);
	expect(page.box("#second").borderY).toBe(32);
	expect(page.box("#after").borderY).toBe(52);
});

it("remeasures caption intrinsic width after text mutation", () => {
	const test = fixture(
		undefined,
		"table{width:auto}td{width:24px}caption{height:auto}",
	);
	expect(test.read().box("#table").borderBoxWidth).toBe(24);
	test.tree.setTextContent(test.id("#caption"), "AAAAAAAAAA");
	expect(test.read().box("#table").borderBoxWidth).toBe(60);
	test.tree.setTextContent(test.id("#caption"), "AA AA AA AA");
	const page = test.read();
	expect(page.box("#table").borderBoxWidth).toBe(24);
	expect(page.box("#caption").borderBoxHeight).toBe(32);
});

it("does not mutate DOM, references or revision during formatting, layout and paint", () => {
	const test = fixture();
	const selectors = ["#table", "#caption", "#cell", "#after"];
	const references = selectors.map(test.ref);
	const before = serializeHtml(test.tree);
	const revision = test.tree.revision;
	const count = test.tree.nodeCount;
	const children = test.tree.get(test.id("#table")).children;
	buildFormattingTree(test.tree);
	const first = test.read();
	rasterizeDocument(test.tree);
	documentHitTesting(test.tree).elementFromPoint(5, 5);
	expect(dimensions(test.read().layout)).toEqual(dimensions(first.layout));
	expect(selectors.map(test.ref)).toEqual(references);
	expect(serializeHtml(test.tree)).toBe(before);
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.nodeCount).toBe(count);
	expect(test.tree.get(test.id("#table")).children).toEqual(children);
	expect(test.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
});

it.each(["top", "bottom"])(
	"paints %s caption and separate grid borders at their own locations",
	(side) => {
		const test = fixture(
			undefined,
			`table{background:red;border:2px solid blue}caption{caption-side:${side};background:yellow}`,
		);
		const page = test.read();
		const raster = rasterizeDocument(test.tree);
		const grid = page.box("#table");
		const caption = page.box("#caption");
		expect(pixel(raster, 1, caption.borderY + 1)).toEqual([255, 255, 0, 255]);
		expect(pixel(raster, 1, grid.borderY + 1)).toEqual([0, 0, 255, 255]);
		expect(pixel(raster, 5, grid.borderY + 5)).toEqual([255, 0, 0, 255]);
		expect(pixel(raster, 1, grid.borderY + grid.borderBoxHeight - 1)).toEqual([
			0, 0, 255, 255,
		]);
		expect(pixel(raster, 1, page.box("#after").borderY + 1)).toEqual([
			255, 255, 255, 255,
		]);
	},
);

it("paints collapsed borders below the caption without donating them to it", () => {
	const test = fixture(
		undefined,
		"table{border-collapse:collapse}caption{background:yellow}td{border:4px solid blue;background:red}",
	);
	const page = test.read();
	const raster = rasterizeDocument(test.tree);
	const grid = page.box("#table");
	expect(pixel(raster, 10, 1)).toEqual([255, 255, 0, 255]);
	expect(pixel(raster, 10, 11)).toEqual([255, 255, 0, 255]);
	expect(pixel(raster, grid.borderX + 10, grid.borderY + 1)).toEqual([
		0, 0, 255, 255,
	]);
	expect(pixel(raster, grid.borderX + 10, grid.borderY + 6)).toEqual([
		255, 0, 0, 255,
	]);
});

it("hits caption descendants, caption padding, grid borders and cells by real DOM owner", () => {
	const test = fixture(
		table.replace(
			'<caption id="caption"></caption>',
			'<caption id="caption"><div id="child" style="width:10px;height:6px"></div></caption>',
		) + after,
		"table{border:2px solid blue}caption{padding:4px}",
	);
	const page = test.read();
	const hits = documentHitTesting(test.tree);
	expect(hits.elementFromPoint(1, 1)).toBe(test.id("#caption"));
	expect(hits.elementFromPoint(5, 5)).toBe(test.id("#child"));
	expect(hits.elementFromPoint(1, page.box("#table").borderY + 1)).toBe(
		test.id("#table"),
	);
	expect(hits.elementFromPoint(5, page.box("#cell").borderY + 5)).toBe(
		test.id("#cell"),
	);
});

it.each([
	{ name: "absolute table", css: "table{position:absolute}" },
	{ name: "fixed table", css: "table{position:fixed}" },
	{ name: "inline table", css: "table{display:inline-table}" },
	{ name: "flex-item table", css: "body{display:flex}" },
	{ name: "grid-item table", css: "body{display:grid}" },
])("retains the unsupported guard for $name", ({ css }) => {
	const test = fixture(undefined, css);
	const before = serializeHtml(test.tree);
	for (const operation of [
		() => layoutDocument(test.tree),
		() => rasterizeDocument(test.tree),
		() => documentHitTesting(test.tree).elementFromPoint(1, 1),
	])
		expect(operation).toThrow(expect.objectContaining({ code: "unsupported" }));
	expect(serializeHtml(test.tree)).toBe(before);
});

it.each<{ name: string; options: DocumentLayoutOptions }>([
	{ name: "layout work", options: { maxWork: 1 } },
	{
		name: "formatting boxes",
		options: { text: { formatting: { maxBoxes: 1 } } },
	},
])(
	"fails closed on bounded $name and recovers without DOM mutation",
	({ options }) => {
		const test = fixture();
		const before = serializeHtml(test.tree);
		const revision = test.tree.revision;
		const baseline = dimensions(test.read().layout);
		expect(() => layoutDocument(test.tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(serializeHtml(test.tree)).toBe(before);
		expect(test.tree.revision).toBe(revision);
		expect(dimensions(test.read().layout)).toEqual(baseline);
	},
);

it.each([
	["left", 0],
	["right", 180],
] as const)(
	"floats the %s wrapper with its caption and table together",
	(side, left) => {
		const page = fixture(
			undefined,
			`table{float:${side}}#after{clear:both}`,
		).read();
		expect(page.wrapper()).toMatchObject({
			borderX: left,
			borderY: 0,
			borderBoxWidth: 120,
			borderBoxHeight: 32,
		});
		expect(page.box("#caption")).toMatchObject({
			borderX: left,
			borderY: 0,
			borderBoxWidth: 120,
		});
		expect(page.box("#table")).toMatchObject({
			borderX: left,
			borderY: 12,
			borderBoxHeight: 20,
		});
		expect(page.box("#after").borderY).toBe(32);
	},
);

it("transfers relative offsets to the wrapper without moving subsequent flow", () => {
	const page = fixture(
		undefined,
		"table{position:relative;left:17px;top:9px}",
	).read();
	expect(page.wrapper()).toMatchObject({
		borderX: 17,
		borderY: 9,
		borderBoxHeight: 32,
	});
	expect(page.box("#caption")).toMatchObject({ borderX: 17, borderY: 9 });
	expect(page.box("#table")).toMatchObject({ borderX: 17, borderY: 21 });
	expect(page.box("#after").borderY).toBe(32);
});

it.each(["none", "left", "right"])(
	"resolves a %s table percentage against the wrapper containing block",
	(side) => {
		const page = fixture(
			undefined,
			`table{width:50%;float:${side};padding:0 10%}#after{clear:both}`,
		).read();
		const left = side === "right" ? 90 : 0;
		expect(page.wrapper()).toMatchObject({
			borderX: left,
			borderBoxWidth: 210,
		});
		expect(page.box("#table")).toMatchObject({
			borderX: left,
			contentWidth: 150,
			paddingLeft: 30,
			paddingRight: 30,
			borderBoxWidth: 210,
		});
		expect(page.box("#caption").borderBoxWidth).toBe(210);
	},
);

it.each([
	["center", 15],
	["end", 30],
] as const)(
	"retains caption align-content:%s through normal block layout",
	(alignment, offset) => {
		const page = fixture(
			`<table id="table"><caption id="caption"><div id="aligned"></div></caption>${cell}</table><div id="control"><div id="control-child"></div></div>`,
			`caption,#control{height:40px;align-content:${alignment}}#aligned,#control-child{width:10px;height:10px}`,
		).read();
		expect(page.box("#aligned").borderY - page.box("#caption").contentY).toBe(
			offset,
		);
		expect(
			page.box("#control-child").borderY - page.box("#control").contentY,
		).toBe(offset);
	},
);

it("invalidates caption align-content from center to end", () => {
	const test = fixture(
		`<table id="table"><caption id="caption"><div id="aligned"></div></caption>${cell}</table>`,
		"caption{height:40px;align-content:center}#aligned{width:10px;height:10px}",
	);
	expect(test.read().box("#aligned").borderY).toBe(15);
	test.tree.setAttribute(test.id("#caption"), "style", "align-content:end");
	expect(test.read().box("#aligned").borderY).toBe(30);
});

it("rejects unsupported caption baseline content alignment", () => {
	const test = fixture(undefined, "caption{align-content:baseline}");
	expect(() => test.read()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("bounds caption paint and hit work and recovers with real owners", () => {
	const test = fixture();
	const before = serializeHtml(test.tree);
	const revision = test.tree.revision;
	expect(() => rasterizeDocument(test.tree, { maxWork: 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const limited = new DocumentHitTesting(test.tree, { maxWork: 1 });
	try {
		expect(() => limited.elementFromPoint(1, 1)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	} finally {
		limited.close();
	}
	expect(limited.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(serializeHtml(test.tree)).toBe(before);
	expect(test.tree.revision).toBe(revision);
	expect(rasterizeDocument(test.tree).image.width).toBeGreaterThan(0);
	expect(documentHitTesting(test.tree).elementFromPoint(1, 1)).toBe(
		test.id("#caption"),
	);
});
