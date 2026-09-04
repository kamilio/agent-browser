import { afterEach, expect, it, vi } from "vitest";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { editableCaretLimits, prepareEditableCaret } from "./editable-caret.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import * as rangeGeometry from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	content = '<p id="first"><b id="start">Alpha</b></p><div id="last"><i id="end">Beta</i></div>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}#editor{width:140px;min-height:20px;color:red}#last{color:blue}${css}</style><div id="editor" contenteditable>${content}</div><div style="height:500px"></div>`,
		"https://fixture.invalid/caret-paragraphs",
		{ limits: { maxDepth: 512 } },
	);
	trees.push(tree);
	documentStyles(tree).setViewport(180, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#editor") => {
		const found = queries.querySelector(selector);
		if (found === null) throw Error(`Missing ${selector}`);
		return found;
	};
	const actions = documentInteractions(tree);
	actions.focus.focusElement(id(), { preventScroll: true });
	const owner = domRangeOwner(tree);
	const text = (selector: string) => tree.get(id(selector)).children[0];
	const collapse = (selector = "#editor", end = false) =>
		owner.selection.collapse(
			id(selector),
			end ? tree.get(id(selector)).children.length : 0,
		);
	const textRect = (source: number, end: boolean) =>
		owner.withTemporaryRange(owner.selection.getRangeAt(0), (temporary) => {
			const point = {
				node: source,
				offset: end ? tree.get(source).data.length : 0,
			};
			temporary.update(point, point);
			return rangeGeometry.rangeClientRects(temporary)[0];
		});
	return { tree, id, text, actions, owner, collapse, textRect };
}

it.each([
	["#editor", false, "#start"],
	["#editor", true, "#end"],
	["#first", false, "#start"],
	["#first", true, "#start"],
	["#last", false, "#end"],
	["#last", true, "#end"],
] as const)(
	"maps %s outer edge end=%s to its exact paragraph source %s",
	(container, end, selector) => {
		const { tree, collapse, text, textRect, owner } = fixture();
		collapse(container, end);
		const range = owner.selection.getRangeAt(0);
		const point = range.start;
		const source = text(selector);
		const rect = textRect(source, end);
		expect(rangeGeometry.rangeClientRects(range)).toEqual([]);
		expect(prepareEditableCaret(tree, layoutDocument(tree))).toMatchObject({
			status: "ready",
			anchor: {
				ref: tree.reference(source),
				x: rect.x,
				y: rect.y,
				height: rect.height,
			},
		});
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "painted",
			paintedCarets: 1,
		});
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(range.start).toBe(point);
		expect(range.end).toEqual(point);
		expect(rangeGeometry.rangeClientRects(range)).toEqual([]);
	},
);

it("paints the nonempty direct div container left by native select-all, ArrowLeft, Enter", () => {
	const { tree, actions, owner, id } = fixture("<b>Alpha</b><i>Beta</i>");
	actions.keyboard.press("Control+A");
	actions.keyboard.press("ArrowLeft");
	actions.keyboard.press("Enter");
	const range = owner.selection.getRangeAt(0);
	const point = range.start;
	const paragraph = tree.get(point.node);
	expect(paragraph).toMatchObject({ tagName: "div", parent: id() });
	expect(point.offset).toBe(0);
	expect(tree.textContent(paragraph.id)).toBe("AlphaBeta");
	expect(rangeGeometry.rangeClientRects(range)).toEqual([]);
	expect(rasterizeDocument(tree).metrics).toMatchObject({
		caretStatus: "painted",
		paintedCarets: 1,
	});
	expect(owner.selection.getRangeAt(0)).toBe(range);
	expect(range.start).toBe(point);
});

it.each([false, true])(
	"uses nested inline source geometry and colors inside decorated paragraph boxes, end=%s",
	(end) => {
		const { tree, collapse, owner, text, textRect } = fixture(
			'<p id="first"><b><span id="start">Alpha</span></b></p><div id="last"><i><em id="end">Beta</em></i></div>',
			"#first{margin:3px;padding:4px;border:2px solid green}#last{margin:5px;padding:6px;border:1px solid green;font-size:12px;line-height:16px}",
		);
		collapse(end ? "#last" : "#first", end);
		const source = text(end ? "#end" : "#start");
		const rect = textRect(source, end);
		const range = owner.selection.getRangeAt(0);
		const point = range.start;
		const caret = prepareEditableCaret(tree, layoutDocument(tree));
		expect(caret).toMatchObject({
			status: "ready",
			anchor: {
				ref: tree.reference(source),
				x: rect.x,
				y: rect.y,
				height: rect.height,
				color: end ? [0, 0, 255, 255] : [255, 0, 0, 255],
			},
		});
		const result = rasterizeDocument(tree, {
			clip: { x: rect.x, y: rect.y + 2, width: 1, height: 3 },
		});
		expect(result.metrics.paintedCarets).toBe(1);
		expect([...result.image.pixels]).toEqual(
			Array.from({ length: 3 }, () =>
				end ? [0, 0, 255, 255] : [255, 0, 0, 255],
			).flat(),
		);
		expect(range.start).toBe(point);
	},
);

it.each(["static", "fixed"])(
	"projects the paragraph caret through the %s host under root scrolling",
	(position) => {
		const { tree, collapse, text, textRect } = fixture(
			undefined,
			`#editor{position:${position};margin-top:40px;left:20px;top:10px}`,
		);
		collapse("#last", true);
		documentScroll(tree).to(0, 20);
		const rect = textRect(text("#end"), true);
		const result = rasterizeDocument(tree, {
			clip: { x: rect.x, y: rect.y + 20 + 2, width: 1, height: 3 },
		});
		expect(result.metrics.paintedCarets).toBe(1);
		expect([...result.image.pixels]).toEqual([
			0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255,
		]);
		const outside = rasterizeDocument(tree, {
			clip: { x: rect.x + 2, y: rect.y + 20, width: 2, height: rect.height },
		});
		expect(outside.metrics).toMatchObject({
			paintedCarets: 0,
			clippedCarets: 1,
		});
	},
);

it.each([
	'<p id="first"></p><p>Later</p>',
	'<p id="first"><br>Later</p>',
	'<p id="first"><span></span>Later</p>',
	'<p id="first"><!--edge-->Later</p>',
	'<div id="first"><div>Nested</div></div>',
	'<p id="first"><b style="padding-left:1px">Boxed</b></p>',
	'<p id="first"><b style="border:1px solid red">Boxed</b></p>',
	'<p id="first"><b style="position:relative">Relative</b></p>',
	'<p id="first"><span contenteditable="false">Protected</span></p>',
	'<p id="first"><input value="Control">Later</p>',
	'<p id="first"><span hidden>Hidden</span>Later</p>',
	'<p id="first"><span inert>Inert</span>Later</p>',
	'<p id="first">  Leading</p>',
	'<p id="first">א</p>',
	'<p id="first">a\u0301</p>',
])(
	"does not search past an unsupported direct paragraph starting edge: %s",
	(content) => {
		const { tree, collapse } = fixture(content);
		for (const container of ["#editor", "#first"]) {
			collapse(container);
			expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
		}
	},
);

it.each([
	'<p>Before</p><div id="last"></div>',
	'<div id="last">Before<br></div>',
	'<div id="last">Before<span></span></div>',
	'<div id="last">Before<!--edge--></div>',
	'<div id="last">Before<div>Nested</div></div>',
	'<div id="last">Before<span hidden>Hidden</span></div>',
	'<div id="last">Before  </div>',
])(
	"does not search past an unsupported direct paragraph ending edge: %s",
	(content) => {
		const { tree, collapse } = fixture(content);
		for (const container of ["#editor", "#last"]) {
			collapse(container, true);
			expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
		}
	},
);

it.each([
	'contenteditable="false"',
	'contenteditable="true"',
	'contenteditable="plaintext-only"',
	"inert",
	"hidden",
	'style="visibility:hidden"',
	'style="position:relative"',
	'style="position:absolute"',
	'style="position:fixed"',
	'style="display:flow-root"',
])("keeps ineligible direct paragraphs unsupported: %s", (attributes) => {
	const { tree, collapse } = fixture(
		`<div id="first" ${attributes}>Alpha</div>`,
	);
	for (const container of ["#editor", "#first"]) {
		collapse(container);
		expect(rasterizeDocument(tree).metrics.paintedCarets).toBe(0);
	}
});

it("rejects floating paragraph mapping before requesting unsupported layout geometry", () => {
	const { tree, collapse } = fixture(
		'<div id="first" style="float:left">Alpha</div>',
	);
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	for (const container of ["#editor", "#first"]) {
		collapse(container);
		expect(
			prepareEditableCaret(tree, { contexts: [] } as unknown as ReturnType<
				typeof layoutDocument
			>).status,
		).toBe("unsupported");
	}
	expect(geometry).not.toHaveBeenCalled();
});

it.each(["#editor", "#first"])(
	"does not broaden interior slots of %s",
	(selector) => {
		const { tree, id, owner } = fixture(
			'<p id="first"><b>Alpha</b><i>Beta</i></p><p>Last</p>',
		);
		owner.selection.collapse(id(selector), 1);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it.each(["#nested", "#inline"])(
	"does not broaden arbitrary descendant endpoint %s",
	(selector) => {
		const { tree, collapse } = fixture(
			'<div id="first"><div id="nested"><b id="inline">Text</b></div></div>',
		);
		collapse(selector);
		expect(rasterizeDocument(tree).metrics).toMatchObject({
			caretStatus: "unsupported",
			paintedCarets: 0,
		});
	},
);

it("does not traverse a non-paragraph block or a non-block editing host", () => {
	const other = fixture('<section id="first">Alpha</section>');
	other.collapse();
	expect(rasterizeDocument(other.tree).metrics.paintedCarets).toBe(0);
	const inline = fixture(undefined, "#editor{display:inline}");
	inline.collapse("#first");
	expect(rasterizeDocument(inline.tree).metrics.paintedCarets).toBe(0);
});

it("charges direct paragraph mapping and retains the existing depth limit", () => {
	const { tree, collapse, owner } = fixture();
	collapse("#first");
	const range = owner.selection.getRangeAt(0);
	const point = range.start;
	const layout = layoutDocument(tree);
	expect(prepareEditableCaret(tree, layout, 2)).toMatchObject({
		status: "limited",
		work: 2,
	});
	expect(range.start).toBe(point);
	const deep = fixture(
		`<div id="first">${"<b>".repeat(258)}Text${"</b>".repeat(258)}</div>`,
	);
	deep.collapse();
	const geometry = vi.spyOn(rangeGeometry, "rangeClientRects");
	expect(
		prepareEditableCaret(deep.tree, { contexts: [] } as unknown as ReturnType<
			typeof layoutDocument
		>).status,
	).toBe("limited");
	expect(geometry).not.toHaveBeenCalled();
	expect(editableCaretLimits).toMatchObject({
		maxDepth: 256,
		maxWork: 250000,
		maxPixels: 512,
	});
});

it.each(["resource-limit", "unsupported"] as const)(
	"releases paragraph temporary Ranges after %s without touching public endpoints",
	(code) => {
		const { tree, collapse, owner } = fixture();
		collapse("#first");
		const range = owner.selection.getRangeAt(0);
		const point = range.start;
		const held: unknown[] = [];
		vi.spyOn(rangeGeometry, "rangeClientRects").mockImplementation(
			(temporary) => {
				expect(temporary).not.toBe(range);
				held.push(temporary);
				throw new AgentBrowserError(
					code,
					"Injected paragraph geometry failure",
				);
			},
		);
		const layout = layoutDocument(tree);
		for (let index = 0; index < 4100; index++)
			expect(prepareEditableCaret(tree, layout).status).toBe(
				code === "resource-limit" ? "limited" : "unsupported",
			);
		expect(held).toHaveLength(4100);
		expect(() => owner.createRange()).not.toThrow();
		expect(owner.selection.getRangeAt(0)).toBe(range);
		expect(range.start).toBe(point);
	},
);
