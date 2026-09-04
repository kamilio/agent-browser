import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	measureIntrinsicWidths,
	type IntrinsicWidthOptions,
} from "./intrinsic-widths.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
});
function fixture(
	css = "",
	children = '<div id="first">bb cc</div><div id="second">dd</div>',
	content?: string,
) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}#atom{display:inline-flex;gap:3px}${css}</style><main id="host">${content ?? `A<span id="atom">${children}</span>Z`}</main>`,
		"https://fixture.invalid/inline-flex-intrinsic",
	);
	documents.push(document);
	const query = new DocumentQueries(document);
	const id = (selector: string) => {
		const value = query.querySelector(selector);
		if (value === null) throw Error(selector);
		return value;
	};
	const reference = (selector: string) => document.reference(id(selector));
	const measure = (options?: IntrinsicWidthOptions) =>
		measureIntrinsicWidths(document, options);
	const record = (selector = "#host") => {
		const value = measure().widths.find(
			(entry) => entry.ref === reference(selector),
		);
		if (!value) throw Error(selector);
		return value;
	};
	return { document, id, reference, measure, record };
}

it("composes real inline-flex contributions with surrounding text", () => {
	const { record } = fixture();
	expect(record("#atom")).toMatchObject({
		minContent: 27,
		maxContent: 45,
		minContribution: 27,
		maxContribution: 45,
	});
	expect(record()).toMatchObject({ minContent: 27, maxContent: 57 });
});

it.each([
	["#atom{flex-wrap:wrap}", 12, 57],
	["#atom{flex-direction:row-reverse}", 27, 57],
	["#atom{column-gap:calc(10% + 2px)}", 26, 56],
	["#atom{white-space:nowrap}", 45, 57],
	["main{white-space:nowrap}", 57, 57],
	["main{white-space:nowrap}#atom{white-space:normal}", 39, 57],
	["#atom{width:20px}", 20, 32],
	["#atom{min-width:50px}", 50, 62],
	["#atom{max-width:20px}", 20, 32],
	["#atom{min-width:50px;max-width:20px}", 50, 62],
	["#atom{width:50%}", 27, 57],
	["#atom{min-width:calc(10% + 40px)}", 40, 57],
	["#atom{margin-left:calc(10% + 3px)}", 30, 60],
	["#atom{margin-left:auto;margin-right:auto}", 27, 57],
])(
	"uses real intrinsic flex and outer-box rules: %s",
	(css, minimum, maximum) => {
		const { record } = fixture(css);
		expect(record()).toMatchObject({
			minContent: minimum,
			maxContent: maximum,
		});
	},
);

it.each([
	["content-box", 33, 45],
	["border-box", 27, 39],
])(
	"keeps edges and margins outside the %s content contribution",
	(sizing, minimum, maximum) => {
		const { record } = fixture(
			`#atom{width:20px;box-sizing:${sizing};padding:2px;border:1px solid red;margin-left:3px;margin-right:4px}`,
		);
		expect(record()).toMatchObject({
			minContent: minimum,
			maxContent: maximum,
		});
	},
);

it.each([
	["column", "nowrap", 24, 36],
	["column", "wrap", 24, 51],
	["column-reverse", "wrap-reverse", 24, 51],
])("measures %s %s inline containers", (direction, wrap, minimum, maximum) => {
	const { record } = fixture(
		`#atom{flex-direction:${direction};flex-wrap:${wrap};height:10px}`,
		"<div>bb</div><div>cccc</div>",
	);
	expect(record()).toMatchObject({ minContent: minimum, maxContent: maximum });
});

it("resolves wrapped-column percentage height from the real containing height", () => {
	const { document, id, record } = fixture(
		"main{height:20px}#atom{height:50%;flex-direction:column;flex-wrap:wrap}",
		"<div>bb</div><div>cccc</div>",
	);
	expect(record("#atom").maxContent).toBe(39);
	document.setAttribute(id("#host"), "style", "height:46px");
	expect(record("#atom").maxContent).toBe(24);
});

it("recursively measures inline-flex inside a normal-flow flex item", () => {
	const { measure, record } = fixture(
		"#inner{display:inline-flex;gap:2px}",
		'<div>x<span id="inner"><div>B</div><div>C</div></span>y</div><div>d</div>',
	);
	expect(record("#inner")).toMatchObject({ minContent: 14, maxContent: 14 });
	expect(record("#atom")).toMatchObject({ minContent: 23, maxContent: 35 });
	expect(record()).toMatchObject({ minContent: 23, maxContent: 47 });
	const result = measure();
	expect(new Set(result.widths.map((entry) => entry.id)).size).toBe(
		result.widths.length,
	);
});

it("preserves display-contents ancestry and adjacent anonymous text", () => {
	const { record } = fixture(
		"#contents{display:contents}",
		undefined,
		'A<span id="contents"><span id="atom">bb cc<div>dd</div></span></span>Z',
	);
	expect(record()).toMatchObject({ minContent: 27, maxContent: 57 });
});

it("does not count atomic descendants twice as parent text", () => {
	const { measure } = fixture();
	const result = measure();
	expect(result.metrics.minText.tokens).toBe(12);
	expect(result.metrics.maxText.tokens).toBe(12);
	expect(result.metrics.minText.glyphs).toBe(0);
	expect(result.metrics.maxText.glyphs).toBe(0);
});

it("retains immutable measurements across content and style revisions", () => {
	const { document, id, record } = fixture();
	const original = record();
	document.setAttribute(id("#atom"), "style", "width:80px");
	expect(record()).toMatchObject({ minContent: 80, maxContent: 92 });
	expect(original).toMatchObject({ minContent: 27, maxContent: 57 });
	expect(Object.isFrozen(original)).toBe(true);
});

it("does not substitute viewport width for an intrinsic inline contribution", () => {
	const { document, record } = fixture();
	for (const width of [20, 60, 1024]) {
		documentStyles(document).setViewport(width, 100);
		expect(record()).toMatchObject({ minContent: 27, maxContent: 57 });
	}
});

it("charges aggregate work exactly across recursive atomic scopes", () => {
	const { measure } = fixture(
		"#inner{display:inline-flex}",
		'<div>x<span id="inner"><div>yy zz</div></span></div><div>d</div>',
	);
	const work = measure().metrics.work;
	expect(measure({ maxWork: work }).metrics.work).toBe(work);
	expect(() => measure({ maxWork: work - 1 })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("enforces shared token and text-work caps instead of resetting them per atom", () => {
	const { measure } = fixture();
	const result = measure();
	const tokens = Math.max(
		result.metrics.minText.tokens,
		result.metrics.maxText.tokens,
	);
	const work = Math.max(
		result.metrics.minText.work,
		result.metrics.maxText.work,
	);
	expect(
		measure({ text: { maxTokens: tokens, maxWork: work } }).metrics.work,
	).toBe(result.metrics.work);
	expect(() => measure({ text: { maxTokens: tokens - 1 } })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => measure({ text: { maxWork: work - 1 } })).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("limits active atomic recursion before an unbounded stack is created", () => {
	let content = "X";
	for (let depth = 0; depth < 33; depth++)
		content = `<span class="atom"><div>${content}</div></span>`;
	const { measure } = fixture(
		".atom{display:inline-flex}",
		undefined,
		`<span id="atom"></span>${content}`,
	);
	expect(measure).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it.each([
	"#first{display:grid}",
	"#atom{position:absolute}",
	"#host{writing-mode:vertical-rl}",
])("retains unsupported-formatting checks for %s", (css) => {
	expect(fixture(css).measure).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps intrinsic measurement separate from used page geometry", () => {
	const { document, measure } = fixture();
	expect(measure().widths.length).toBeGreaterThan(4);
	expect(measure().metrics.minText.glyphs).toBe(0);
	expect(layoutDocument(document).metrics.glyphs).toBe(9);
});

it("preserves atomic break opportunities around an empty inline flex container", () => {
	const { record } = fixture("", "");
	expect(record("#atom")).toMatchObject({ minContent: 0, maxContent: 0 });
	expect(record()).toMatchObject({ minContent: 6, maxContent: 12 });
});

it("resolves used inline atoms during wrapped-column intrinsic reflow", () => {
	const { record } = fixture(
		"#atom{flex-direction:column;flex-wrap:wrap;height:20px}#inner{display:inline-flex}",
		'<div>x<span id="inner"><div>yy</div></span>z</div><div>q</div>',
	);
	expect(record("#inner")).toMatchObject({ minContent: 12, maxContent: 12 });
	expect(record("#atom")).toMatchObject({ minContent: 12, maxContent: 33 });
});
