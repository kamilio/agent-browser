import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree, formattingLimits } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import {
	createFlowStaticPositionResolver,
	flowStaticPosition,
} from "./static-positioning.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px}main{position:relative;width:60px;margin-left:7px;padding:5px}#float{float:left;width:12px;height:20px}${css}</style>${markup}`,
		"https://fixture.invalid/float-static-position",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(200, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		rect: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

for (const position of ["absolute", "fixed"]) {
	it.each([
		'A<span id="target">X</span><i id="float"></i>B',
		'A<i id="float"></i><span id="target">X</span>B',
		'<i id="float"></i>A<span id="target">X</span>B',
	])(
		`places a hypothetical ${position} inline sibling in its actual float-shortened line: %s`,
		(content) => {
			const test = fixture(
				`<main>${content}</main>`,
				`#target{position:${position};float:right}`,
			);
			expect(test.rect("#target")).toMatchObject({
				x: 30,
				y: 5,
				width: 6,
				height: 10,
			});
			expect(test.rect("#float")).toMatchObject({
				x: 12,
				y: 5,
				width: 12,
				height: 20,
			});
			expect(test.styles.flow(test.id("#target")).float).toBe("none");
			const target = buildFormattingTree(test.tree).nodes.find(
				(node) => node.ref === test.tree.reference(test.id("#target")),
			);
			expect(target?.floatSide).toBeUndefined();
		},
	);

	it(`keeps a ${position} source anchor above a later float that cannot fit its hypothetical content`, () => {
		const test = fixture(
			'<main>A<span id="target">XX</span><i id="float"></i>B</main>',
			`main{width:30px}#float{width:18px}#target{position:${position}}`,
		);
		expect(test.rect("#target")).toMatchObject({
			x: 18,
			y: 5,
			width: 12,
			height: 10,
		});
		expect(test.rect("#float")).toMatchObject({ x: 12, y: 5 });
	});

	it(`uses successive shortened lines to locate a ${position} anchor after source text`, () => {
		const test = fixture(
			'<main><i id="float"></i>AB CD <span id="target">EF</span></main>',
			`main{width:30px}#target{position:${position}}`,
		);
		expect(test.rect("#target")).toMatchObject({
			x: 12,
			y: 25,
			width: 12,
			height: 10,
		});
		expect(test.rect("main")).toMatchObject({ x: 7, y: 0, height: 30 });
	});

	it(`includes an earlier external same-BFC float in a ${position} anchor`, () => {
		const test = fixture(
			'<div id="before"></div><i id="float"></i><main>A<span id="target">X</span>B</main>',
			`#before{height:12px}#float{width:24px;height:30px}#target{position:${position}}`,
		);
		expect(test.rect("#float")).toMatchObject({ x: 0, y: 12, width: 24 });
		expect(test.rect("main")).toMatchObject({ x: 7, y: 12 });
		expect(test.rect("#target")).toMatchObject({
			x: 30,
			y: 17,
			width: 6,
			height: 10,
		});
		if (position === "absolute") {
			expect(resolvedStyleValue(test.tree, test.id("#target"), "left")).toBe(
				"23px",
			);
			expect(resolvedStyleValue(test.tree, test.id("#target"), "top")).toBe(
				"5px",
			);
		}
	});
}

it("preserves nested inline source ancestry around a real float during normalization", () => {
	const test = fixture(
		'<main><span id="outer">A<i id="float"></i><span><span id="target">X</span>B</span></span></main>',
		"#target{position:absolute}",
	);
	expect(test.rect("#target")).toMatchObject({
		x: 30,
		y: 5,
		width: 6,
		height: 10,
	});
	expect(test.rect("#outer")).toMatchObject({
		x: 24,
		y: 6,
		width: 12,
		height: 8,
	});
	expect(test.rect("#float")).toMatchObject({ x: 12, y: 5 });
});

it("restores a block target without treating the adjacent float as an in-flow block", () => {
	const test = fixture(
		'<main><i id="float"></i>A<div id="target">X</div>B</main>',
		"#target{position:absolute}",
	);
	expect(test.rect("#target")).toMatchObject({
		x: 12,
		y: 15,
		width: 6,
		height: 10,
	});
	expect(test.rect("main")).toMatchObject({ height: 20 });
	expect(test.rect("#float")).toMatchObject({ x: 12, y: 5 });
});

it("keeps positioned sibling-run reuse on the correct side of a source float", () => {
	const test = fixture(
		'<main><span id="first" class="target">X</span><span id="second" class="target">X</span><i id="float"></i><span id="third" class="target">X</span></main>',
		"#float{width:60px}.target{position:absolute}",
	);
	expect(test.rect("#first")).toMatchObject({
		x: 12,
		y: 5,
		width: 6,
		height: 10,
	});
	expect(test.rect("#second")).toEqual(test.rect("#first"));
	expect(test.rect("#third")).toMatchObject({
		x: 12,
		y: 25,
		width: 6,
		height: 10,
	});
	expect(test.rect("#float")).toMatchObject({ x: 12, y: 5, height: 20 });
});

it("invalidates native static-anchor geometry when float width and side change", () => {
	const test = fixture(
		'<main><i id="float"></i><span id="first">X</span><span id="second">X</span></main>',
		"#first,#second{position:absolute}",
	);
	expect(test.rect("#first").x).toBe(24);
	expect(test.rect("#second")).toEqual(test.rect("#first"));
	test.tree.setAttribute(test.id("#float"), "style", "width:24px");
	expect(test.rect("#first").x).toBe(36);
	expect(test.rect("#second")).toEqual(test.rect("#first"));
	test.tree.setAttribute(test.id("#float"), "style", "width:24px;float:right");
	expect(test.rect("#first").x).toBe(12);
	expect(test.rect("#second")).toEqual(test.rect("#first"));
});

it.each([
	["", 27, 33, "3px", "10px"],
	["left:7px;top:8px", 31, 31, "7px", "8px"],
] as const)(
	"translates an absolute descendant against its relatively positioned float padding box: %s",
	(insets, expectedX, expectedY, left, top) => {
		const test = fixture(
			'<div id="before"></div><main><div id="float"><div id="prefix"></div><span id="target">X</span></div></main>',
			`#before{height:12px}#float{position:relative;left:6px;top:4px;width:40px;height:30px;margin-left:4px;padding:3px;border:2px solid black}#prefix{height:7px}#target{position:absolute;float:left;${insets}}`,
		);
		expect(test.rect("#float")).toMatchObject({
			x: 22,
			y: 21,
			width: 50,
			height: 40,
		});
		expect(test.rect("#target")).toMatchObject({
			x: expectedX,
			y: expectedY,
			width: 6,
			height: 10,
		});
		expect(resolvedStyleValue(test.tree, test.id("#target"), "left")).toBe(
			left,
		);
		expect(resolvedStyleValue(test.tree, test.id("#target"), "top")).toBe(top);
		expect(test.styles.flow(test.id("#target")).float).toBe("none");
	},
);

it("keeps fixed explicit insets viewport-relative despite float geometry and root scrolling", () => {
	const test = fixture(
		'<main><i id="float"></i><span id="target">X</span><div id="long"></div></main>',
		"#target{position:fixed;left:9px;top:7px;width:6px;height:10px;float:right}#long{height:200px}",
	);
	const before = test.rect("#target");
	expect(before).toMatchObject({ x: 9, y: 7, width: 6, height: 10 });
	documentScroll(test.tree).to(0, 40);
	expect(test.rect("#target")).toEqual(before);
	expect(test.rect("#float").y).toBe(-35);
	expect(test.styles.flow(test.id("#target")).float).toBe("none");
});

it.each([
	["<main><span id='target'>X</span></main>", "main{display:grid}", /Grid/],
	[
		"<main><span id='containing'><span id='target'>X</span></span></main>",
		"#containing{position:relative}",
		/inline containing blocks/,
	],
])(
	"preserves existing unsupported containing-block guards: %s",
	(markup, css, error) => {
		const test = fixture(
			`<i id="float"></i>${markup}`,
			`${css}#target{position:absolute}`,
		);
		expect(() => layoutDocument(test.tree)).toThrow(error);
	},
);

it("keeps nonfloating clearance explicit rather than erasing float diagnostics", () => {
	const test = fixture(
		'<main><i id="float"></i><div id="clear"></div><span id="target">X</span></main>',
		"#clear{clear:both;height:10px}#target{position:absolute}",
	);
	expect(() => layoutDocument(test.tree)).toThrow(/Non-floating clearance/);
});

it("rejects hypothetical float coordination inside a positioned reflow root explicitly", () => {
	const test = fixture(
		'<main><i id="float"></i><span id="target">X</span></main>',
		"main{position:absolute;left:0;top:0}#target{position:absolute}",
	);
	const formatting = buildFormattingTree(test.tree);
	const target = formatting.nodes.find(
		(node) => node.ref === test.tree.reference(test.id("#target")),
	);
	if (!target) throw new Error("Missing formatting target");
	expect(() =>
		flowStaticPosition(
			formatting,
			target.id,
			new Map(),
			formattingLimits.maxWork,
			{},
		),
	).toThrow(/inside positioned reflow roots/);
});

it("charges static source traversal and retains the anonymous-box cap", () => {
	const test = fixture(
		'<main>A<div id="target">X</div>B<i id="float"></i></main>',
		"#target{position:absolute}",
	);
	const formatting = buildFormattingTree(test.tree);
	const target = formatting.nodes.find(
		(node) => node.ref === test.tree.reference(test.id("#target")),
	);
	if (!target) throw new Error("Missing formatting target");
	expect(() =>
		flowStaticPosition(formatting, target.id, new Map(), 1, {}),
	).toThrow(/work limit/);
	const resolve = createFlowStaticPositionResolver(formatting, new Map(), {});
	expect(() => resolve(target.id, 1)).toThrow(/work limit/);
	expect(() =>
		flowStaticPosition(
			formatting,
			target.id,
			new Map(),
			formattingLimits.maxWork,
			{
				formatting: { maxBoxes: formatting.nodes.length },
			},
		),
	).toThrow(/formatting box limit/);
});
