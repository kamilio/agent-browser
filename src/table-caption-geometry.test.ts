import { afterEach, expect, it } from "vitest";
import {
	documentGeometry,
	geometryLimits,
	LayoutGeometry,
} from "./document-geometry.js";
import { type DocumentLayout, layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import type { FormattingNode } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const content =
	"<table id=table><caption id=caption></caption><tbody id=group><tr id=row><td id=cell></td></tr></tbody></table>";
const baseCss =
	"html,body{margin:0;padding:0;font-family:Agent Mono;font-size:8px;line-height:8px}#host{display:flow-root;width:200px}table,.table{width:80px;margin:0;padding:0;border:none;border-collapse:separate;border-spacing:0}caption,.caption{height:10px;margin:0;padding:0;border:none}tr,.row{height:20px}td,.cell{padding:0;border:none;vertical-align:top}";

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(css = "", markup = content) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}${css}</style><main id=host>${markup}</main>`,
		"https://fixture.invalid/table-caption-geometry",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(240, 160);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing caption fixture ${selector}`);
		return found;
	};
	const reference = (selector: string) => tree.reference(id(selector));
	const geometry = documentGeometry(tree);
	const rects = (selector: string) => geometry.getClientRects(id(selector));
	const bounds = (selector: string) =>
		geometry.getBoundingClientRect(id(selector));
	const coordinates = (selector: string) =>
		rects(selector).map(({ x, y, width, height }) => [x, y, width, height]);
	return { tree, styles, id, reference, geometry, rects, bounds, coordinates };
}

function grid(page: ReturnType<typeof fixture>, selector = "#table") {
	const layout = layoutDocument(page.tree);
	const box = layout.boxes.find(
		(entry) => entry.ref === page.reference(selector),
	);
	if (!box) throw new Error(`Missing table grid ${selector}`);
	const formatting = layout.text.horizontal.formatting;
	const node = formatting.nodes[box.id] as FormattingNode & {
		tableWrapper?: number;
		tableCaptions?: readonly number[];
	};
	return { layout, formatting, node, box };
}

it("returns the actual grid before the top caption and unions their border boxes", () => {
	const page = fixture();
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 80, 20],
		[0, 0, 80, 10],
	]);
	expect(page.bounds("#table")).toMatchObject({
		x: 0,
		y: 0,
		width: 80,
		height: 30,
	});
	expect(page.coordinates("#caption")).toEqual([[0, 0, 80, 10]]);
	expect(grid(page).box).toMatchObject({
		borderX: 0,
		borderY: 10,
		borderBoxWidth: 80,
		borderBoxHeight: 20,
	});
});

it("includes a bottom caption without expanding the real grid border box", () => {
	const page = fixture("#caption{caption-side:bottom}");
	expect(page.coordinates("#table")).toEqual([
		[0, 0, 80, 20],
		[0, 20, 80, 10],
	]);
	expect(page.coordinates("#caption")).toEqual([[0, 20, 80, 10]]);
	expect(page.bounds("#table")).toMatchObject({ width: 80, height: 30 });
	expect(grid(page).box).toMatchObject({
		borderY: 0,
		borderBoxWidth: 80,
		borderBoxHeight: 20,
	});
});

it("includes caption overflow only in table geometry, not cells or ordinary ancestors", () => {
	const page = fixture("#host{width:40px}#caption{width:150%}");
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 80, 20],
		[0, 0, 120, 10],
	]);
	expect(page.bounds("#table")).toMatchObject({ width: 120, height: 30 });
	expect(page.coordinates("#host")).toEqual([[0, 0, 40, 30]]);
	expect(page.coordinates("#cell")).toEqual([[0, 10, 80, 20]]);
	expect(grid(page).box.borderBoxWidth).toBe(80);
});

it("keeps CSS caption rectangles in content order rather than top-to-bottom layout order", () => {
	const page = fixture(
		".table{display:table}.caption{display:table-caption}.row{display:table-row}.cell{display:table-cell}#bottom{caption-side:bottom;height:6px}#top{height:4px}",
		"<div id=table class=table><div id=bottom class=caption></div><div id=top class=caption></div><div class=row><div id=cell class=cell></div></div></div>",
	);
	expect(page.coordinates("#table")).toEqual([
		[0, 4, 80, 20],
		[0, 24, 80, 6],
		[0, 0, 80, 4],
	]);
	expect(page.coordinates("#bottom")).toEqual([[0, 24, 80, 6]]);
	expect(page.coordinates("#top")).toEqual([[0, 0, 80, 4]]);
	expect(page.bounds("#table")).toMatchObject({ width: 80, height: 30 });
	const { node, formatting } = grid(page);
	expect(
		node.tableCaptions?.map((captionId) => formatting.nodes[captionId].ref),
	).toEqual([page.reference("#bottom"), page.reference("#top")]);
});

it("omits a hidden caption and includes it after its display changes", () => {
	const page = fixture("#caption{display:none}");
	expect(page.coordinates("#table")).toEqual([[0, 0, 80, 20]]);
	expect(page.rects("#caption")).toEqual([]);
	page.tree.setAttribute(page.id("#caption"), "style", "display:table-caption");
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 80, 20],
		[0, 0, 80, 10],
	]);
});

it("retains layout rectangles for a visibility-hidden caption", () => {
	const page = fixture("#caption{visibility:hidden}");
	expect(page.coordinates("#caption")).toEqual([[0, 0, 80, 10]]);
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 80, 20],
		[0, 0, 80, 10],
	]);
});

it("keeps inner captions attached to their own table rather than every table ancestor", () => {
	const page = fixture(
		"#inner{width:40px}#inner tr{height:8px}#innerCaption{caption-side:bottom;height:6px}",
		"<table id=table><caption id=caption></caption><tr><td id=cell><table id=inner><caption id=innerCaption></caption><tr><td></td></tr></table></td></tr></table>",
	);
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 80, 20],
		[0, 0, 80, 10],
	]);
	expect(page.coordinates("#inner")).toEqual([
		[0, 10, 40, 8],
		[0, 18, 40, 6],
	]);
	expect(page.bounds("#inner")).toMatchObject({
		x: 0,
		y: 10,
		width: 40,
		height: 14,
	});
	expect(page.coordinates("#innerCaption")).toEqual([[0, 18, 40, 6]]);
	expect(page.coordinates("#cell")).toEqual([[0, 10, 80, 20]]);
});

it.each(["content-box", "border-box"])(
	"reads wrapper margins but grid dimensions, padding and borders for %s used styles",
	(sizing) => {
		const page = fixture(
			`#table{box-sizing:${sizing};width:100px;margin:7px 13px 9px 11px;padding:3px;border:2px solid red}`,
		);
		const { box, node, layout, formatting } = grid(page);
		const width = sizing === "border-box" ? 100 : 110;
		const marginRight = 200 - 11 - width;
		expect(box).toMatchObject({
			borderX: 11,
			borderY: 17,
			borderBoxWidth: width,
			borderBoxHeight: 30,
			marginTop: 0,
			marginBottom: 0,
			marginLeft: 0,
			marginRight: 0,
		});
		expect(page.geometry.getUsedStyle(page.id("#table"))).toMatchObject({
			width: 100,
			height: sizing === "border-box" ? 30 : 20,
			"margin-top": 7,
			"margin-right": marginRight,
			"margin-bottom": 9,
			"margin-left": 11,
			"padding-top": 3,
			"padding-right": 3,
			"padding-bottom": 3,
			"padding-left": 3,
			"border-top-width": 2,
			"border-right-width": 2,
			"border-bottom-width": 2,
			"border-left-width": 2,
		});
		expect(page.bounds("#table")).toMatchObject({
			x: 11,
			y: 7,
			width,
			height: 40,
		});
		const wrapper = layout.boxes.find(
			(entry) => entry.id === node.tableWrapper,
		);
		expect(wrapper).toMatchObject({
			borderBoxWidth: width,
			marginTop: 7,
			marginRight,
			marginBottom: 9,
			marginLeft: 11,
		});
		if (node.tableWrapper === undefined)
			throw new Error("Missing table wrapper");
		expect(formatting.nodes[node.tableWrapper].ref).toBeUndefined();
		expect(page.geometry.getUsedStyle(page.id("#caption"))).toMatchObject({
			width,
			height: 10,
			"margin-top": 0,
			"padding-left": 0,
			"border-left-width": 0,
		});
	},
);

it("exposes resolved auto margins from the wrapper instead of zero grid margins", () => {
	const page = fixture("#table{margin:0 auto}");
	expect(page.coordinates("#table")).toEqual([
		[60, 10, 80, 20],
		[60, 0, 80, 10],
	]);
	expect(page.geometry.getUsedStyle(page.id("#table"))).toMatchObject({
		width: 80,
		height: 20,
		"margin-left": 60,
		"margin-right": 60,
	});
});

it("counts caption inclusion once without exposing or duplicating the anonymous wrapper", () => {
	const page = fixture();
	const revision = page.tree.revision;
	const source = serializeHtml(page.tree);
	const { layout, formatting, node } = grid(page);
	const geometry = new LayoutGeometry(layout, true);
	const ownedBoxes = layout.boxes.filter((box) => box.ref !== undefined);
	expect(geometry.metrics().rectangles).toBe(ownedBoxes.length + 1);
	expect(geometry.getClientRects(page.reference("#table"))).toHaveLength(2);
	expect(geometry.getClientRects(page.reference("#caption"))).toHaveLength(1);
	expect(
		formatting.nodes.filter((entry) => entry.ref === page.reference("#table")),
	).toHaveLength(1);
	expect(
		ownedBoxes.filter((entry) => entry.ref === page.reference("#table")),
	).toHaveLength(1);
	if (node.tableWrapper === undefined) throw new Error("Missing table wrapper");
	expect(formatting.nodes[node.tableWrapper]).toMatchObject({
		tableGrid: node.id,
	});
	expect(formatting.nodes[node.tableWrapper].ref).toBeUndefined();
	expect(page.tree.revision).toBe(revision);
	expect(serializeHtml(page.tree)).toBe(source);
});

it("caches immutable table snapshots and invalidates them after caption-side and height mutations", () => {
	const page = fixture();
	const previous = page.rects("#table");
	const previousBounds = page.bounds("#table");
	expect(page.rects("#table")).toBe(previous);
	expect(page.geometry.metrics().builds).toBe(1);
	expect(Object.isFrozen(previous)).toBe(true);
	expect(previous.every(Object.isFrozen)).toBe(true);
	page.tree.setAttribute(
		page.id("#caption"),
		"style",
		"caption-side:bottom;height:16px",
	);
	expect(page.coordinates("#table")).toEqual([
		[0, 0, 80, 20],
		[0, 20, 80, 16],
	]);
	expect(page.bounds("#table").height).toBe(36);
	expect(previousBounds.height).toBe(30);
	expect(previous.map(({ y, height }) => [y, height])).toEqual([
		[10, 20],
		[0, 10],
	]);
	expect(page.geometry.metrics().builds).toBe(2);
});

it("recomputes caption and grid rectangles when viewport-dependent table width changes", () => {
	const page = fixture("#table{width:50vw}");
	page.styles.setViewport(200, 160);
	const previous = page.rects("#table");
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 100, 20],
		[0, 0, 100, 10],
	]);
	page.styles.setViewport(400, 160);
	expect(page.coordinates("#table")).toEqual([
		[0, 10, 200, 20],
		[0, 0, 200, 10],
	]);
	expect(previous.map((rect) => rect.width)).toEqual([100, 100]);
	expect(page.geometry.metrics().builds).toBe(2);
});

it("counts repeated caption references against the retained rectangle ceiling", () => {
	const page = fixture();
	const { layout, formatting, node } = grid(page);
	const captionId = node.tableCaptions?.[0];
	if (captionId === undefined) throw new Error("Missing caption metadata");
	const overBudget: DocumentLayout = {
		...layout,
		text: {
			...layout.text,
			horizontal: {
				...layout.text.horizontal,
				formatting: {
					...formatting,
					nodes: formatting.nodes.map((entry) =>
						entry.id === node.id
							? {
									...entry,
									tableCaptions: Array<number>(
										geometryLimits.maxRectangles,
									).fill(captionId),
								}
							: entry,
					),
				},
			},
		},
	};
	expect(() => new LayoutGeometry(overBudget)).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Client geometry rectangle limit exceeded",
		}),
	);
	expect(
		new LayoutGeometry(layout).getClientRects(page.reference("#table")),
	).toHaveLength(2);
});

it("charges wrapper-box indexing against the geometry work ceiling", () => {
	const page = fixture();
	const { layout, node } = grid(page);
	const wrapper = layout.boxes.find((entry) => entry.id === node.tableWrapper);
	if (!wrapper) throw new Error("Missing wrapper layout");
	const overBudget: DocumentLayout = {
		...layout,
		boxes: Array<DocumentLayout["boxes"][number]>(
			geometryLimits.maxWork + 1,
		).fill(wrapper),
	};
	expect(() => new LayoutGeometry(overBudget)).toThrow(
		expect.objectContaining({
			code: "resource-limit",
			message: "Client geometry work limit exceeded",
		}),
	);
	expect(page.bounds("#table")).toMatchObject({ width: 80, height: 30 });
});

it("fails closed if used margins are requested without the retained wrapper", () => {
	const page = fixture();
	const { layout, node } = grid(page);
	if (node.tableWrapper === undefined) throw new Error("Missing table wrapper");
	expect(
		() =>
			new LayoutGeometry(
				{
					...layout,
					boxes: layout.boxes.filter((box) => box.id !== node.tableWrapper),
				},
				true,
			),
	).toThrow(
		expect.objectContaining({
			code: "unsupported",
			message: "Used table margins require a retained table wrapper",
		}),
	);
});

it("preserves ordinary no-caption table rectangles and grid used styles", () => {
	const page = fixture(
		"",
		"<table id=table><tbody id=group><tr id=row><td id=cell></td></tr></tbody></table>",
	);
	expect(page.coordinates("#table")).toEqual([[0, 0, 80, 20]]);
	expect(page.coordinates("#row")).toEqual([[0, 0, 80, 20]]);
	expect(page.coordinates("#cell")).toEqual([[0, 0, 80, 20]]);
	expect(page.geometry.getUsedStyle(page.id("#table"))).toMatchObject({
		width: 80,
		height: 20,
		"margin-top": 0,
		"padding-left": 0,
		"border-left-width": 0,
	});
});
