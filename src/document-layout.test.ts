import { afterEach, expect, it } from "vitest";
import {
	type DocumentBox,
	type DocumentLayoutOptions,
	layoutDocument,
} from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
function fixture(content: string, css = "") {
	const tree = parseHtmlDocument(
		`<style>main{display:flow-root;width:200px;font-size:8px}${css}</style><main id="container">${content}</main>`,
		"https://example.com/",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const layout = (options?: DocumentLayoutOptions) =>
		layoutDocument(tree, options);
	const box = (selector: string) =>
		layout().boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		) as DocumentBox;
	return { tree, id, layout, box };
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("positions document blocks, lines and source glyphs without manual panel placement", () => {
	const { tree, id, box, layout } = fixture(
		'<p id="first">ab cd</p><p id="second">next</p>',
		"#first{width:18px;padding:2px;margin:10px 0 20px} #second{margin-top:30px}",
	);
	expect(box("#first")).toMatchObject({
		borderY: 10,
		contentY: 12,
		naturalContentHeight: 20,
		contentHeight: 20,
		borderBoxHeight: 24,
	});
	expect(box("#second").borderY).toBe(64);
	expect(box("#container").contentHeight).toBe(74);
	const result = layout();
	const first = result.contexts.find(
		(context) => context.ref === tree.reference(id("#first")),
	);
	expect(first?.lines.map(({ top, baseline }) => [top, baseline])).toEqual([
		[12, 20],
		[22, 30],
	]);
	expect(
		first?.glyphs.map(({ x: positionX, y: positionY }) => [
			positionX,
			positionY,
		]),
	).toEqual([
		[2, 13],
		[8, 13],
		[2, 23],
		[8, 23],
	]);
	expect(result.flowHeight).toBe(74);
	expect(result.stage).toBe("normal-flow-document-layout");
	expect(
		Object.isFrozen(result) &&
			Object.isFrozen(first?.glyphs) &&
			Object.isFrozen(box("#first").marginCollapse.top),
	).toBe(true);
});

it.each([
	[30, 20, 30],
	[-10, -20, -20],
	[30, -20, 10],
	[-30, 20, -10],
	[0, 0, 0],
])("collapses sibling margins %s and %s to %s", (bottom, top, gap) => {
	const { box } = fixture(
		'<div id="first"></div><div id="second"></div>',
		`#first{height:20px;margin-top:10px;margin-bottom:${bottom}px} #second{height:15px;margin-top:${top}px;margin-bottom:5px}`,
	);
	expect(box("#first").borderY).toBe(10);
	expect(box("#second").borderY).toBe(30 + gap);
	expect(box("#container").contentHeight).toBe(Math.max(0, 50 + gap));
});

it("collapses parent/child margins without counting escaped margins in content height", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child"></div></section>',
		"#parent{margin:5px 0 7px} #child{height:10px;margin:10px 0 20px}",
	);
	expect(box("#parent")).toMatchObject({
		borderY: 10,
		contentHeight: 10,
		marginCollapse: {
			top: { value: 10 },
			bottom: { value: 20 },
			withFirstChild: true,
			withLastChild: true,
		},
	});
	expect(box("#child").borderY).toBe(10);
	expect(box("#container").contentHeight).toBe(40);
});

it("combines signed margins transitively instead of summing pairwise collapsed results", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child"><div id="grandchild"></div></div></section>',
		"#parent{margin-top:20px} #child{margin-top:-10px} #grandchild{height:10px;margin-top:15px}",
	);
	expect(box("#parent").marginCollapse.top).toEqual({
		positive: 20,
		negative: -10,
		value: 10,
	});
	expect(
		["#parent", "#child", "#grandchild"].map(
			(selector) => box(selector).borderY,
		),
	).toEqual([10, 10, 10]);
});

it.each([
	["padding-top:2px", 0, 12, 20, 22],
	["padding-bottom:2px", 10, 10, 30, 32],
	["padding:2px", 0, 12, 40, 44],
])(
	"padding %s forms the expected collapse barrier",
	(padding, parentY, childY, contentHeight, borderHeight) => {
		const { box } = fixture(
			'<section id="parent"><div id="child"></div></section>',
			`#parent{${padding}} #child{height:10px;margin:10px 0 20px}`,
		);
		expect(box("#parent")).toMatchObject({
			borderY: parentY,
			contentHeight,
			borderBoxHeight: borderHeight,
		});
		expect(box("#child").borderY).toBe(childY);
	},
);

it("keeps flow-root margins separate from descendants and prevents empty self-collapse", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child"></div></section><div id="next"></div>',
		"#parent{display:flow-root;margin-top:5px;margin-bottom:7px} #child{height:10px;margin:10px 0 20px} #next{height:10px;margin-top:3px}",
	);
	expect(box("#parent")).toMatchObject({
		borderY: 5,
		contentHeight: 40,
		marginCollapse: {
			through: false,
			withFirstChild: false,
			withLastChild: false,
		},
	});
	expect(box("#child").borderY).toBe(15);
	expect(box("#next").borderY).toBe(52);
	const empty = fixture(
		'<div id="first"></div><div id="second"></div>',
		"#first{display:flow-root;margin:10px 0 20px} #second{height:10px;margin-top:30px}",
	);
	expect(empty.box("#first").marginCollapse.through).toBe(false);
	expect(empty.box("#second").borderY).toBe(40);
});

it("uses hypothetical nonzero-bottom-border positions for collapse-through siblings", () => {
	const { box } = fixture(
		'<div id="first"></div><div id="empty"></div><div id="last"></div>',
		"#first{height:20px;margin-bottom:5px} #empty{margin:10px 0 100px} #last{height:10px;margin-top:30px}",
	);
	expect(box("#empty")).toMatchObject({
		borderY: 30,
		contentHeight: 0,
		marginCollapse: {
			through: true,
			top: { value: 100 },
			bottom: { value: 100 },
		},
	});
	expect(box("#last").borderY).toBe(120);
	expect(box("#container").contentHeight).toBe(130);
});

it("positions every leading collapsed-through descendant at the parent's border edge", () => {
	const { box } = fixture(
		'<section id="parent"><div id="empty"></div><div id="child"></div></section>',
		"#parent{margin-top:5px} #empty{margin:10px 0 100px} #child{height:10px;margin-top:30px}",
	);
	expect(
		["#parent", "#empty", "#child"].map((selector) => box(selector).borderY),
	).toEqual([100, 100, 100]);
	expect(box("#parent").contentHeight).toBe(10);
});

it("does not let trailing collapsed-through border positions inflate an auto parent", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child"></div><div id="empty"></div></section><div id="next"></div>',
		"#parent{margin-top:5px;margin-bottom:7px} #child{height:20px;margin-bottom:10px} #empty{margin:30px 0 50px} #next{height:10px}",
	);
	expect(box("#parent")).toMatchObject({
		borderY: 5,
		contentHeight: 20,
		marginCollapse: { bottom: { value: 50 } },
	});
	expect(box("#empty").borderY).toBe(55);
	expect(box("#next").borderY).toBe(75);
});

it("positions nested through boxes using their internal leading strut and preserves negative positions", () => {
	const { box } = fixture(
		'<section id="outer"><div id="inner"></div></section><div id="next"></div>',
		"#outer{margin:10px 0 100px} #inner{margin:20px 0 200px} #next{height:10px}",
	);
	expect(box("#outer").borderY).toBe(200);
	expect(box("#inner").borderY).toBe(200);
	expect(box("#next").borderY).toBe(200);
	const negative = fixture(
		'<div id="empty"></div><div id="next"></div>',
		"#empty{margin:-20px 0 100px} #next{height:10px}",
	);
	expect(negative.box("#empty").borderY).toBe(-20);
	expect(negative.box("#next").borderY).toBe(80);
});

it("handles the nonzero-min-height exception for child margins connected through to parent top", () => {
	const { box } = fixture(
		'<section id="parent"><div id="empty"></div></section>',
		"#parent{min-height:100px;margin:5px 0 7px} #empty{margin:10px 0 50px}",
	);
	expect(box("#parent")).toMatchObject({
		borderY: 50,
		contentHeight: 100,
		heightClampedBy: "min-height",
		marginCollapse: {
			through: false,
			withFirstChild: true,
			withLastChild: false,
			bottom: { value: 7 },
		},
	});
	expect(box("#empty").borderY).toBe(50);
	expect(box("#container").contentHeight).toBe(157);
});

it("keeps ordinary child bottom margins adjoining an auto min-height parent", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child"></div></section>',
		"#parent{min-height:100px} #child{height:10px;margin:10px 0 50px}",
	);
	expect(box("#parent")).toMatchObject({
		borderY: 10,
		contentHeight: 100,
		naturalContentHeight: 10,
		marginCollapse: { withLastChild: true, bottom: { value: 50 } },
	});
	expect(box("#container").contentHeight).toBe(160);
});

it.each([
	["height:0px", true],
	["height:auto", true],
	["height:1px", false],
	["min-height:1px", false],
	["padding-bottom:1px", false],
	["display:flow-root", false],
])("applies self-collapse prerequisites for %s", (style, through) => {
	expect(
		fixture(
			'<div id="target"></div>',
			`#target{${style};margin:10px 0 20px}`,
		).box("#target").marginCollapse.through,
	).toBe(through);
});

it("distinguishes real zero-height text lines from ignored whitespace-only content", () => {
	const { box } = fixture(
		'<div id="text">a</div><div id="space"> \n </div><div id="break"><br></div>',
		"#text,#space,#break{line-height:0}",
	);
	expect(box("#text").marginCollapse.through).toBe(false);
	expect(box("#space").marginCollapse.through).toBe(true);
	expect(box("#break").marginCollapse.through).toBe(false);
});

it("resolves vertical percentage padding and margins against containing width, and auto margins to zero", () => {
	const { box } = fixture(
		'<div id="target"></div>',
		"#target{height:10px;padding:10% 0 5%;margin:5% 0 auto}",
	);
	expect(box("#target")).toMatchObject({
		paddingTop: 20,
		paddingBottom: 10,
		marginTop: 10,
		marginBottom: 0,
		borderY: 10,
		contentY: 30,
		contentHeight: 10,
		borderBoxHeight: 40,
	});
	expect(box("#container").contentHeight).toBe(50);
});

it.each([
	["content-box", 100, 130],
	["border-box", 70, 100],
])("resolves explicit %s height", (sizing, contentHeight, borderBoxHeight) => {
	expect(
		fixture(
			'<div id="target"></div>',
			`#target{height:100px;padding:10px 0 20px;box-sizing:${sizing}}`,
		).box("#target"),
	).toMatchObject({
		contentHeight,
		borderBoxHeight,
		definiteHeight: contentHeight,
	});
});

it("floors border-box content size at zero and lets padding exceed a smaller specified height", () => {
	expect(
		fixture(
			'<div id="target"></div>',
			"#target{height:10px;padding:20px 0;box-sizing:border-box}",
		).box("#target"),
	).toMatchObject({
		preferredHeight: 0,
		contentHeight: 0,
		borderBoxHeight: 40,
	});
});

it.each([
	["height:100px;max-height:60px", 60, "max-height"],
	["height:10px;min-height:30px", 30, "min-height"],
	["height:100px;min-height:80px;max-height:60px", 80, "min-height"],
	["height:auto;max-height:5px", 5, "max-height"],
])("enforces height constraints %s", (style, height, clampedBy) => {
	expect(
		fixture('<div id="target">Text</div>', `#target{${style}}`).box("#target"),
	).toMatchObject({ contentHeight: height, heightClampedBy: clampedBy });
});

it("resolves percentages top-down using explicitly sized and clamped containing content heights", () => {
	const { box } = fixture(
		'<div id="parent"><div id="child"><div id="grandchild"></div></div></div>',
		"#parent{height:200px;max-height:120px;padding:10px;box-sizing:border-box} #child{height:50%;padding:5px;box-sizing:border-box} #grandchild{height:50%}",
	);
	expect(box("#parent").definiteHeight).toBe(100);
	expect(box("#child")).toMatchObject({
		containingHeight: 100,
		preferredHeight: 40,
		contentHeight: 40,
		borderBoxHeight: 50,
	});
	expect(box("#grandchild")).toMatchObject({
		containingHeight: 40,
		contentHeight: 20,
	});
});

it("treats unresolved height/min/max percentages as auto/zero/none without circular sizing", () => {
	const { box } = fixture(
		'<section id="parent"><div id="child">Text</div></section>',
		"#parent{min-height:100px;max-height:200px} #child{height:50%;min-height:50%;max-height:10%}",
	);
	expect(box("#parent")).toMatchObject({
		definiteHeight: null,
		contentHeight: 100,
	});
	expect(box("#child")).toMatchObject({
		containingHeight: null,
		preferredHeight: null,
		minimumHeight: 0,
		maximumHeight: null,
		contentHeight: 10,
	});
});

it("resolves root percentages against the viewport and propagates through an explicit body height", () => {
	const { tree, box } = fixture(
		'<div id="child"></div>',
		"html{height:50%} body{height:50%} main{height:50%} #child{height:50%}",
	);
	documentStyles(tree).setViewport(400, 800);
	expect(box("html")).toMatchObject({
		containingHeight: 800,
		contentHeight: 400,
	});
	expect(box("body").contentHeight).toBe(200);
	expect(box("#container").contentHeight).toBe(100);
	expect(box("#child").contentHeight).toBe(50);
	documentStyles(tree).setViewport(400, 400);
	expect(box("#child").contentHeight).toBe(25);
});

it("positions overflow without enlarging fixed-height boxes or clipping text", () => {
	const { tree, id, layout, box } = fixture(
		'<div id="first">a<br>b<br>c</div><div id="second">next</div>',
		"#first{height:5px}",
	);
	expect(box("#first")).toMatchObject({
		naturalContentHeight: 30,
		contentHeight: 5,
	});
	expect(box("#second").borderY).toBe(5);
	const context = layout().contexts.find(
		(entry) => entry.ref === tree.reference(id("#first")),
	);
	expect(context?.glyphs.at(-1)?.y).toBe(21);
	expect(box("#container").contentHeight).toBe(15);
});

it("uses anonymous text blocks as real flow participants around split inline descendants", () => {
	const { layout } = fixture(
		'<span>before<div id="inside">inside</div>after</span>',
	);
	const result = layout();
	expect(
		result.contexts
			.filter(({ glyphs }) => glyphs.length)
			.map(({ contentY }) => contentY),
	).toEqual([0, 10, 20]);
	expect(result.boxes.filter(({ ref }) => !ref)).toHaveLength(2);
	expect(result.flowHeight).toBe(30);
});

it("keeps hidden boxes in flow, omits display:none, and treats the root as a collapse barrier", () => {
	const { box } = fixture(
		'<div id="hidden"></div><div id="gone"></div><div id="visible"></div>',
		"html{margin-top:5px} body{margin-top:10px} #hidden{height:20px;visibility:hidden} #gone{height:100px;display:none} #visible{height:10px}",
	);
	expect(box("html").borderY).toBe(5);
	expect(box("body").borderY).toBe(15);
	expect(box("#visible").borderY).toBe(35);
	expect(box("#gone")).toBeUndefined();
});

it("recomputes after text/style mutations without invalidating retained results or source refs", () => {
	const { tree, id, layout } = fixture(
		'<div id="first">a</div><div id="second">b</div>',
	);
	const before = layout();
	const secondRef = tree.reference(id("#second"));
	tree.setAttribute(id("#first"), "style", "height:100px");
	const after = layout();
	expect(before.boxes.find(({ ref }) => ref === secondRef)?.borderY).toBe(10);
	expect(after.boxes.find(({ ref }) => ref === secondRef)?.borderY).toBe(100);
	expect(tree.resolve(secondRef).attributes.id).toBe("second");
	tree.close();
	expect(() => layout()).toThrow();
	expect(after.flowHeight).toBe(110);
});

it("enforces inherited compatibility and work/numeric limits instead of guessing geometry", () => {
	const { layout } = fixture('<div style="height:10px">Text</div>');
	expect(() => layout({ maxWork: 1 })).toThrow("work limit");
	expect(() => layout({ maxWork: 2_000_001 })).toThrow(
		"Invalid document layout work limit",
	);
	expect(() =>
		layout({ maxWork: null } as unknown as DocumentLayoutOptions),
	).toThrow("Invalid document layout work limit");
	expect(() => layout({ text: { maxTokens: 1 } })).toThrow("token limit");
	expect(() => layout({ unexpected: 1 } as DocumentLayoutOptions)).toThrow(
		"Invalid document layout options",
	);
	expect(() =>
		fixture(
			'<div style="height:16777216px"></div><div style="height:1px"></div>',
		).layout(),
	).toThrow("length limit");
	expect(() =>
		fixture('<div style="position:absolute">Text</div>').layout(),
	).toThrow();
	expect(() =>
		fixture(
			'<div style="display:flex;flex-direction:column;flex-wrap:wrap;position:absolute">Text</div>',
		).layout(),
	).toThrow();
	expect(() =>
		fixture(
			'<div style="height:16777200px"></div><div style="height:0;line-height:20px">Text</div>',
		).layout(),
	).toThrow("length limit");
});

it("matches an independent flat-chain margin oracle including through boxes", () => {
	for (let sample = 0; sample < 100; sample++) {
		const definitions = Array.from({ length: 12 }, (_, index) => ({
			height: (sample + index) % 3 === 0 ? 0 : 5 + ((sample * 7 + index) % 17),
			top: ((sample * 13 + index * 5) % 41) - 20,
			bottom: ((sample * 3 + index * 11) % 51) - 25,
		}));
		const { box } = fixture(
			definitions
				.map(
					(value, index) =>
						`<div id="row${index}" style="height:${value.height}px;margin:${value.top}px 0 ${value.bottom}px"></div>`,
				)
				.join(""),
		);
		let cursor = 0;
		let adjoining: number[] = [];
		for (let index = 0; index < definitions.length; index++) {
			const value = definitions[index];
			const position =
				cursor +
				Math.max(0, ...adjoining, value.top) +
				Math.min(0, ...adjoining, value.top);
			expect(box(`#row${index}`).borderY).toBe(position);
			if (value.height === 0) adjoining.push(value.top, value.bottom);
			else {
				cursor = position + value.height;
				adjoining = [value.bottom];
			}
		}
		expect(box("#container").contentHeight).toBe(
			Math.max(
				0,
				cursor + Math.max(0, ...adjoining) + Math.min(0, ...adjoining),
			),
		);
	}
});
