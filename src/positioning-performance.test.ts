import { afterEach, expect, it, vi } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import * as staticPositioning from "./static-positioning.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(html: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}body{font-size:8px;line-height:10px}.target{position:absolute;width:20px;height:10px}${css}</style>${html}`,
		"https://fixture.invalid/positioning-performance",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function withoutReuse<Result>(callback: () => Result): Result {
	const resolver = vi
		.spyOn(staticPositioning, "createFlowStaticPositionResolver")
		.mockImplementation(
			(formatting, boxes, options) => (id, maxWork) =>
				staticPositioning.flowStaticPosition(
					formatting,
					id,
					boxes,
					maxWork,
					options,
				),
		);
	try {
		return callback();
	} finally {
		resolver.mockRestore();
	}
}

function geometry(layout: Readonly<DocumentLayout>) {
	return {
		boxes: layout.boxes,
		contexts: layout.contexts,
		flowHeight: layout.flowHeight,
		fixedIds: layout.fixedIds,
		positionedInsets: layout.positionedInsets,
		relativePositions: layout.relativePositions,
	};
}

function equivalent(tree: DocumentTree) {
	const optimized = layoutDocument(tree);
	const original = withoutReuse(() => layoutDocument(tree));
	expect(geometry(optimized)).toEqual(geometry(original));
	return { optimized, original };
}

it.each(["absolute", "fixed"])(
	"bounds work for 100 and 1,000 fixed-size bare %s siblings",
	(position) => {
		const layouts = [100, 1_000].map((count) => {
			const { tree } = fixture(
				'<div class="target"></div>'.repeat(count),
				`.target{position:${position}}`,
			);
			const layout = layoutDocument(tree);
			expect(layout.positionedInsets).toHaveLength(count);
			expect(layout.boxes.slice(2)).toHaveLength(count);
			for (const box of layout.boxes.slice(2))
				expect(box).toMatchObject({
					borderX: 0,
					borderY: 0,
					contentWidth: 20,
					contentHeight: 10,
				});
			expect(layout.flowHeight).toBe(0);
			return layout;
		});
		expect(layouts[1].metrics.work).toBeLessThan(400_000);
		expect(layouts[1].metrics.work).toBeLessThan(layouts[0].metrics.work * 11);
	},
);

it("reduces the diagnosed 100-sibling reflow without changing geometry", () => {
	const { tree } = fixture('<div class="target"></div>'.repeat(100));
	const { optimized, original } = equivalent(tree);
	expect(optimized.metrics.work).toBeLessThan(original.metrics.work * 0.8);
});

it.each(["div", "span"])(
	"reuses equivalent text-only %s targets with bounded sibling scaling",
	(tag) => {
		const layouts = [100, 1_000].map((count) => {
			const { tree } = fixture(
				`<main>AB${`<${tag} class="target">XY</${tag}>`.repeat(count)}CD</main>`,
				"main{width:24px}",
			);
			const layout = layoutDocument(tree);
			expect(layout.positionedInsets).toHaveLength(count);
			return layout;
		});
		expect(layouts[1].metrics.work).toBeLessThan(1_000_000);
		expect(layouts[1].metrics.work).toBeLessThan(layouts[0].metrics.work * 11);
	},
);

it.each([
	["block", '<div class="target">X</div>', ""],
	["inline", '<span class="target">XY</span>', ""],
	[
		"inline-block",
		'<span class="target">XY</span>',
		".target{display:inline-block}",
	],
	[
		"auto-sized",
		'<span class="target">XY</span>',
		".target{width:auto;height:auto}",
	],
])(
	"preserves source-order %s geometry and inline wrapping",
	(_name, target, css) => {
		const { tree } = fixture(
			`<main>AB<br>C ${target.repeat(12)} D<div style="height:7px"></div>${target.repeat(12)}EF</main>`,
			`main{width:24px}${css}`,
		);
		const { optimized, original } = equivalent(tree);
		expect(optimized.metrics.work).toBeLessThan(original.metrics.work);
	},
);

it.each(["3px 0 4px 7px", "-8px 2px -4px -3px", "auto", "10%"])(
	"preserves hypothetical sibling and parent margin behavior for %s",
	(margin) => {
		const { tree } = fixture(
			`<main><div style="height:10px;margin-bottom:8px"></div>${'<div class="target"></div>'.repeat(16)}<div style="height:10px;margin-top:12px"></div></main>`,
			`main{width:80px}.target{margin:${margin}}`,
		);
		equivalent(tree);
	},
);

it("does not reuse across normal-flow siblings or different parents", () => {
	const targets = '<div class="target"></div>'.repeat(30);
	const { tree, rect } = fixture(
		`<main><div style="height:13px"></div><div id="first" class="target"></div>${targets}<div style="height:17px"></div><div id="second" class="target"></div>${targets}</main><section><div class="target" id="third"></div>${targets}</section>`,
		"main{padding:5px}section{padding:9px}",
	);
	const { optimized, original } = equivalent(tree);
	expect(optimized.metrics.work).toBeLessThan(original.metrics.work);
	expect(rect("#first")).toMatchObject({ x: 5, y: 18 });
	expect(rect("#second")).toMatchObject({ x: 5, y: 35 });
	expect(rect("#third")).toMatchObject({ x: 9, y: 49 });
});

it("uses separate actual roots for nested positioned and relatively shifted contexts", () => {
	const children = '<span class="target">XY</span>'.repeat(8);
	const { tree } = fixture(
		`<main><div style="height:7px"></div><section class="outer"><div style="position:relative;top:3px;left:4px">AB${children}</div></section><section class="outer">${children}</section></main>`,
		"main{padding:5px}.outer{position:absolute;width:80px;padding:3px}.target{margin:2px}",
	);
	equivalent(tree);
});

it.each(["row", "row-reverse", "column", "column-reverse"])(
	"preserves the existing direct-flex %s path without reuse overhead",
	(direction) => {
		const { tree } = fixture(
			`<main>AB<div style="order:-1">CD</div>${'<div class="target"></div>'.repeat(20)}</main>`,
			`main{display:flex;width:100px;height:50px;justify-content:center;align-items:center;flex-direction:${direction}}`,
		);
		const { optimized, original } = equivalent(tree);
		expect(optimized.metrics.work).toBe(original.metrics.work);
	},
);

it("preserves reflow inside independent flex-item roots", () => {
	const { tree } = fixture(
		`<main>AB<section><div style="height:8px"></div>${'<span class="target">X</span>'.repeat(10)}</section></main>`,
		"main{display:flex;justify-content:center;align-items:center;width:150px;height:60px}section{display:inline-block;width:30px;height:20px;padding:2px}",
	);
	equivalent(tree);
});

it("does not reuse anchors for changed sizes, typography, text or descendant structure", () => {
	const { tree } = fixture(
		'<main>AB<span class="target">X</span><span class="target" style="width:30px">X</span><span class="target" style="font-size:14px">X</span><span class="target">LONG WORD</span><span class="target"><b>X</b></span><span class="target">X</span></main>',
		"main{width:30px}.target{display:inline-block}",
	);
	equivalent(tree);
});

it("retains actual layout of differently painted and stacked equivalent boxes", () => {
	const { tree } = fixture(
		`<main>AB${'<span class="target" style="background:red;z-index:2">X</span><span class="target" style="background:blue;z-index:3">X</span>'.repeat(8)}</main>`,
		"main{width:30px}",
	);
	equivalent(tree);
	const optimized = rasterizeDocument(tree);
	const original = withoutReuse(() => rasterizeDocument(tree));
	expect(optimized.image).toEqual(original.image);
});

it("keeps explicit insets on the existing fast path", () => {
	const { tree } = fixture(
		'<div class="target"></div>'.repeat(1_000),
		".target{left:3px;top:4px}",
	);
	const { optimized, original } = equivalent(tree);
	expect(optimized.metrics.work).toBe(original.metrics.work);
	expect(optimized.metrics.work).toBeLessThan(200_000);
});

it("rebuilds reuse state for revisions and viewport changes", () => {
	const { tree, id } = fixture(
		`<main>AB<span id="target" class="target">XY</span>${'<span class="target">XY</span>'.repeat(8)}</main>`,
		"main{width:100%}",
	);
	equivalent(tree);
	tree.setAttribute(id("#target"), "style", "margin:4px;display:inline-block");
	documentStyles(tree).setViewport(30, 100);
	equivalent(tree);
	tree.setAttribute(
		id("main"),
		"style",
		"padding:3px;position:relative;top:7px",
	);
	equivalent(tree);
});

it("retains resource limits instead of raising the budget", () => {
	const { tree } = fixture('<div class="target"></div>'.repeat(100));
	expect(() => layoutDocument(tree, { maxWork: 1_000 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => layoutDocument(tree)).not.toThrow();
});

it("charges sibling indexing and equivalence checks even on cache hits", () => {
	const { tree } = fixture('<div class="target"></div>'.repeat(100));
	const formatting = buildFormattingTree(tree);
	const layout = layoutDocument(tree);
	const resolver = staticPositioning.createFlowStaticPositionResolver(
		formatting,
		new Map(layout.boxes.map((box) => [box.id, box])),
		{},
	);
	const targets = formatting.nodes.filter(
		(node) => node.position === "absolute",
	);
	const first = resolver(targets[0].id, 2_000_000);
	expect(() => resolver(targets[1].id, 1)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	const second = resolver(targets[1].id, 2_000_000);
	expect(second).toMatchObject({ left: first.left, top: first.top });
	expect(second.work).toBeGreaterThan(0);
	expect(second.work).toBeLessThan(first.work);
});

it("retains unsupported static block-in-inline and flex-baseline checks", () => {
	const block = fixture(
		'<span>A<div class="target"></div><div class="target"></div>B</span>',
	);
	expect(() => layoutDocument(block.tree)).toThrow("block-in-inline");
	const flex = fixture(
		'<main><div class="target"></div><div class="target"></div></main>',
		"main{display:flex;align-items:baseline}",
	);
	expect(() => layoutDocument(flex.tree)).toThrow("static flex alignment");
});
