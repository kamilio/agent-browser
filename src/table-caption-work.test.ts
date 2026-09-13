import { afterEach, expect, it } from "vitest";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const content =
	'<table id="table"><caption id="caption"></caption><tbody><tr><td id="cell"></td></tr></tbody></table><div id="after"></div>';
const baseCss =
	'*{margin:0;padding:0;border:0;font-family:"Agent Mono";font-size:8px;line-height:8px}#host{width:200px}table,.table{width:80px;border-collapse:separate;border-spacing:0}caption,.caption{height:10px}td,.cell{height:20px;vertical-align:top}.table{display:table}.caption{display:table-caption}.row{display:table-row}.cell{display:table-cell}#after{height:5px}';

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(markup = content, css = "", unrelated = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style><main id="host">${markup}</main><aside>${unrelated}</aside>`,
		"https://fixture.invalid/table-caption-work",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	documentStyles(tree).setViewport(240, 160);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing work fixture ${selector}`);
		return found;
	};
	const ref = (selector: string) => tree.reference(id(selector));
	const node = (formatting: FormattingTree, selector: string) => {
		const matches = formatting.nodes.filter(
			(entry) => entry.ref === ref(selector),
		);
		expect(matches).toHaveLength(1);
		return matches[0];
	};
	const box = (layout: DocumentLayout, selector: string) => {
		const matches = layout.boxes.filter((entry) => entry.ref === ref(selector));
		expect(matches).toHaveLength(1);
		return matches[0];
	};
	return { tree, id, ref, node, box };
}

function verifyGraph(formatting: FormattingTree) {
	const visited = new Set<number>();
	const references = new Set<string>();
	const pending = [formatting.root];
	while (pending.length) {
		const current = pending.pop();
		if (current === undefined) throw new Error("Missing pending node");
		expect(visited.has(current)).toBe(false);
		visited.add(current);
		const node = formatting.nodes[current];
		expect(node.id).toBe(current);
		expect(Object.isFrozen(node)).toBe(true);
		expect(Object.isFrozen(node.children)).toBe(true);
		if (node.ref !== undefined) {
			expect(references.has(node.ref)).toBe(false);
			references.add(node.ref);
		}
		for (const child of node.children) {
			expect(formatting.nodes[child].parent).toBe(current);
			pending.push(child);
		}
	}
	expect(visited.size).toBe(formatting.nodes.length);
	expect(formatting.nodes[formatting.root].parent).toBeNull();
}

function verifyCaptionTable(
	formatting: FormattingTree,
	gridId: number,
	captionIds: readonly number[],
) {
	const grid = formatting.nodes[gridId];
	expect(grid.contentMode).toBe("table");
	expect(grid.tableCaptions).toEqual(captionIds);
	expect(Object.isFrozen(grid.tableCaptions)).toBe(true);
	const wrapperId = grid.tableWrapper;
	if (wrapperId === undefined) throw new Error("Missing caption wrapper");
	const wrapper = formatting.nodes[wrapperId];
	expect(wrapper.tableGrid).toBe(grid.id);
	expect(wrapper.ref).toBeUndefined();
	expect(wrapper.paint).toBeUndefined();
	expect(grid.parent).toBe(wrapperId);
	expect(new Set(wrapper.children)).toEqual(new Set([gridId, ...captionIds]));
	for (const captionId of captionIds) {
		expect(formatting.nodes[captionId].parent).toBe(wrapperId);
		expect(grid.children).not.toContain(captionId);
	}
	return wrapper;
}

it.each(["top", "bottom"])(
	"keeps %s caption-only work independent of unrelated formatting nodes",
	(side) => {
		const measure = (count: number) => {
			const test = fixture(
				undefined,
				`caption{caption-side:${side}}`,
				"<div><span>unrelated</span></div>".repeat(count),
			);
			const visible = buildFormattingTree(test.tree);
			verifyCaptionTable(visible, test.node(visible, "#table").id, [
				test.node(visible, "#caption").id,
			]);
			test.tree.setAttribute(test.id("#caption"), "style", "display:none");
			const hidden = buildFormattingTree(test.tree);
			expect(test.node(hidden, "#table").tableWrapper).toBeUndefined();
			expect(
				hidden.nodes.some((node) => node.ref === test.ref("#caption")),
			).toBe(false);
			return {
				visible,
				hidden,
				difference: visible.metrics.work - hidden.metrics.work,
			};
		};
		const small = measure(2);
		const large = measure(256);
		expect(large.hidden.nodes.length).toBeGreaterThan(
			small.hidden.nodes.length,
		);
		expect(large.hidden.metrics.work).toBeGreaterThan(
			small.hidden.metrics.work,
		);
		expect(large.visible.nodes.length - large.hidden.nodes.length).toBe(
			small.visible.nodes.length - small.hidden.nodes.length,
		);
		expect(small.difference).toBeGreaterThan(0);
		expect(large.difference).toBe(small.difference);
	},
);

it("preserves no-caption structure and geometry with absent or hidden captions", () => {
	const absent = fixture(
		content.replace('<caption id="caption"></caption>', ""),
	);
	const hidden = fixture(undefined, "caption{display:none}");
	for (const test of [absent, hidden]) {
		const formatting = buildFormattingTree(test.tree);
		verifyGraph(formatting);
		expect(formatting.nodes.some((node) => node.tableGrid !== undefined)).toBe(
			false,
		);
		const grid = test.node(formatting, "#table");
		expect(grid.tableWrapper).toBeUndefined();
		expect(grid.tableCaptions).toBeUndefined();
		expect(grid.parent).toBe(test.node(formatting, "#host").id);
		const layout = layoutDocument(test.tree);
		expect(test.box(layout, "#table")).toMatchObject({
			borderX: 0,
			borderY: 0,
			borderBoxWidth: 80,
			borderBoxHeight: 20,
		});
		expect(test.box(layout, "#after").borderY).toBe(20);
	}
	expect(buildFormattingTree(absent.tree).issues).toEqual(
		buildFormattingTree(hidden.tree).issues,
	);
});

it("keeps nested table identity when outer and inner caption wrappers are created", () => {
	const test = fixture(
		'<table id="table"><caption id="caption"></caption><tr><td id="cell"><table id="inner"><caption id="inner-caption"></caption><tr><td id="inner-cell"></td></tr></table></td></tr></table><div id="after"></div>',
		"#inner{width:40px}#inner-caption{height:6px;caption-side:bottom}#inner-cell{height:8px}",
	);
	const formatting = buildFormattingTree(test.tree);
	verifyGraph(formatting);
	const outer = verifyCaptionTable(
		formatting,
		test.node(formatting, "#table").id,
		[test.node(formatting, "#caption").id],
	);
	const inner = verifyCaptionTable(
		formatting,
		test.node(formatting, "#inner").id,
		[test.node(formatting, "#inner-caption").id],
	);
	expect(inner.id).not.toBe(outer.id);
	expect(inner.parent).toBe(test.node(formatting, "#cell").id);
	expect(
		formatting.nodes.filter((node) => node.tableGrid !== undefined),
	).toHaveLength(2);
	const layout = layoutDocument(test.tree);
	expect(test.box(layout, "#table").borderY).toBe(10);
	expect(test.box(layout, "#inner")).toMatchObject({
		borderY: 10,
		borderBoxWidth: 40,
		borderBoxHeight: 8,
	});
	expect(test.box(layout, "#inner-caption").borderY).toBe(18);
	expect(test.box(layout, "#after").borderY).toBe(30);
});

it("indexes anonymous grids repaired from orphan caption and cell siblings", () => {
	const test = fixture(
		'<div id="caption" class="caption"></div><div id="cell" class="cell" style="width:40px"></div><div id="after"></div>',
	);
	const formatting = buildFormattingTree(test.tree);
	verifyGraph(formatting);
	const grids = formatting.nodes.filter((node) => node.contentMode === "table");
	expect(grids).toHaveLength(1);
	const grid = grids[0];
	expect(grid.ref).toBeUndefined();
	const wrapper = verifyCaptionTable(formatting, grid.id, [
		test.node(formatting, "#caption").id,
	]);
	expect(wrapper.parent).toBe(test.node(formatting, "#host").id);
	expect(formatting.issues["table-caption-layout-not-supported"] ?? 0).toBe(0);
	const layout = layoutDocument(test.tree);
	expect(test.box(layout, "#caption")).toMatchObject({
		borderY: 0,
		borderBoxWidth: 40,
		borderBoxHeight: 10,
	});
	expect(test.box(layout, "#cell").borderY).toBe(10);
	expect(test.box(layout, "#after").borderY).toBe(30);
});

it("retains real and anonymous grid references through table whitespace compaction", () => {
	const markup =
		'<div id="table" class="table"> \n <div id="caption" class="caption"></div> \n <div class="row"> \n <div id="cell" class="cell"></div> \n </div> \n </div><section id="orphan"><div id="orphan-caption" class="caption"></div> \n <div id="orphan-cell" class="cell" style="width:40px"></div></section><div id="after"></div>';
	for (const source of [markup, markup.replace(/>\s+</g, "><")]) {
		const test = fixture(source);
		const before = serializeHtml(test.tree);
		const revision = test.tree.revision;
		const formatting = buildFormattingTree(test.tree);
		verifyGraph(formatting);
		verifyCaptionTable(formatting, test.node(formatting, "#table").id, [
			test.node(formatting, "#caption").id,
		]);
		const anonymous = formatting.nodes.filter(
			(node) => node.contentMode === "table" && node.ref === undefined,
		);
		expect(anonymous).toHaveLength(1);
		verifyCaptionTable(formatting, anonymous[0].id, [
			test.node(formatting, "#orphan-caption").id,
		]);
		expect(formatting.nodes.some((node) => node.kind === "text")).toBe(false);
		const layout = layoutDocument(test.tree);
		expect(test.box(layout, "#table").borderY).toBe(10);
		expect(test.box(layout, "#orphan-caption").borderY).toBe(30);
		expect(test.box(layout, "#orphan-cell").borderY).toBe(40);
		expect(test.box(layout, "#after").borderY).toBe(60);
		expect(serializeHtml(test.tree)).toBe(before);
		expect(test.tree.revision).toBe(revision);
	}
});

it("keeps caption admission guards when unsupported tables are indexed", () => {
	for (const css of [
		"table{position:absolute}",
		"table{position:fixed}",
		"#host{display:flex}",
		"#host{display:grid}",
	]) {
		const test = fixture(undefined, css);
		const formatting = buildFormattingTree(test.tree);
		verifyGraph(formatting);
		expect(test.node(formatting, "#table").tableWrapper).toBeUndefined();
		expect(
			formatting.issues["table-caption-layout-not-supported"],
		).toBeGreaterThan(0);
		expect(() => layoutDocument(test.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	}
});

it("enforces the charged work boundary and rebuilds without retained partial wrappers", () => {
	const test = fixture();
	const baseline = buildFormattingTree(test.tree);
	const before = serializeHtml(test.tree);
	const revision = test.tree.revision;
	for (const maxWork of [1, baseline.metrics.work - 1]) {
		expect(() => buildFormattingTree(test.tree, { maxWork })).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(buildFormattingTree(test.tree)).toEqual(baseline);
	}
	expect(
		buildFormattingTree(test.tree, { maxWork: baseline.metrics.work }),
	).toEqual(baseline);
	verifyGraph(baseline);
	expect(serializeHtml(test.tree)).toBe(before);
	expect(test.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
});

it("preserves box and depth resource guards with the table index", () => {
	const test = fixture();
	const baseline = buildFormattingTree(test.tree);
	for (const options of [
		{ maxBoxes: baseline.metrics.boxes - 1 },
		{ maxDepth: 1 },
	]) {
		expect(() => buildFormattingTree(test.tree, options)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(buildFormattingTree(test.tree)).toEqual(baseline);
	}
	expect(
		buildFormattingTree(test.tree, { maxBoxes: baseline.metrics.boxes }),
	).toEqual(baseline);
});
