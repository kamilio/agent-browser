import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument, type DocumentLayout } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	isAdvisoryFormattingIssue,
} from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { Rgba } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
const red: Rgba = [255, 0, 0, 255];
const blue: Rgba = [0, 0, 255, 255];
const green: Rgba = [0, 128, 0, 255];
const white: Rgba = [255, 255, 255, 255];
const clip = { x: 0, y: 0, width: 160, height: 160 };
const discarded = "discarded-invalid-nested-css-rule";

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css: string,
	markup = '<div id="parent" class="parent"><div id="target" class="box item"></div></div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><html><head><style>html,body{margin:0;padding:0;font-size:8px;line-height:10px;background:white}pre{margin:0;padding:0}.box{display:block;box-sizing:content-box;width:20px;height:10px;background:white}</style><style id="sheet">${css}</style></head><body>${markup}</body></html>`,
		"https://fixture.invalid/css-nesting-layout",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const styles = documentStyles(tree);
	styles.setViewport(160, 160);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const rect = (selector = "#target") =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	return { tree, queries, styles, id, rect };
}

function pixel(
	image: ReturnType<typeof rasterizeDocument>["image"],
	column: number,
	row: number,
) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function expectBox(
	page: ReturnType<typeof fixture>,
	selector: string,
	width: number,
	color: Rgba,
	height = 10,
) {
	const rect = page.rect(selector);
	expect(rect).toMatchObject({ width, height });
	const { image } = rasterizeDocument(page.tree, { clip });
	expect(pixel(image, rect.x + 1, rect.y + 1)).toEqual(color);
}

function pseudoBox(
	layout: DocumentLayout,
	owner: number,
	name: "before" | "after",
) {
	const node = layout.text.horizontal.formatting.nodes.find(
		(node) =>
			node.generatedContent?.owner === owner &&
			node.generatedContent.name === name &&
			node.kind !== "text",
	);
	if (!node) throw new Error(`Missing ::${name} formatting node`);
	const box = layout.boxes.find((box) => box.id === node.id);
	if (!box) throw new Error(`Missing ::${name} layout box`);
	return box;
}

function expectPseudo(
	page: ReturnType<typeof fixture>,
	selector: string,
	name: "before" | "after",
	width: number,
	color: Rgba,
) {
	const { layout, image } = rasterizeDocument(page.tree, { clip });
	const box = pseudoBox(layout, page.id(selector), name);
	expect(box).toMatchObject({ borderBoxWidth: width, borderBoxHeight: 6 });
	expect(pixel(image, box.borderX + width - 1, box.borderY + 5)).toEqual(color);
	return box;
}

it("paints the motivating nested pre borders without touching outside classes", () => {
	const source = `div.body {
		--good-border:red;
		.good pre {border-left:3px solid var(--good-border)}
		.bad pre {border-left:3px solid blue}
		.maybe pre {border-left:3px solid green}
	}`;
	const page = fixture(
		source,
		'<div class="body"><div class="good"><pre id="good" class="box"></pre></div><div class="bad"><pre id="bad" class="box"></pre></div><div class="maybe"><pre id="maybe" class="box"></pre></div><pre id="neutral" class="box"></pre></div><div class="good"><pre id="outside-good" class="box"></pre></div><div class="bad"><pre id="outside-bad" class="box"></pre></div><div class="maybe"><pre id="outside-maybe" class="box"></pre></div>',
	);
	for (const [selector, color] of [
		["#good", red],
		["#bad", blue],
		["#maybe", green],
	] as const) {
		expectBox(page, selector, 23, color);
		const rect = page.rect(selector);
		const { image } = rasterizeDocument(page.tree, { clip });
		expect(pixel(image, rect.x + 2, rect.y + 4)).toEqual(color);
		expect(pixel(image, rect.x + 3, rect.y + 4)).toEqual(white);
	}
	for (const selector of [
		"#neutral",
		"#outside-good",
		"#outside-bad",
		"#outside-maybe",
	])
		expectBox(page, selector, 20, white);
	expect(page.styles.custom(page.id("#good"), "--good-border")).toBe("red");
	expect(page.styles.custom(page.id("#outside-good"), "--good-border")).toBe(
		"",
	);
	expect(page.tree.textContent(page.id("#sheet"))).toBe(source);
	expect(page.styles.metrics().issues).toEqual({});
});

it("treats a bare nested type selector as a descendant rather than the parent", () => {
	const page = fixture(
		".parent{div{width:32px;background:red}}",
		'<div id="parent" class="parent box"><div id="target" class="box"></div></div><div id="outside" class="box"></div>',
	);
	expect(page.rect("#parent").width).toBe(20);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#outside", 20, white);
});

it("limits a leading child combinator to immediate children", () => {
	const page = fixture(
		".parent{> .item{width:32px;background:red}}",
		'<div class="parent"><div id="target" class="box item"></div><section><div id="deep" class="box item"></div></section></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#deep", 20, white);
});

it("paints a relative adjacent sibling outside the parent subtree", () => {
	const page = fixture(
		".parent{+ .item{width:32px;background:red}}",
		'<div class="parent"><div id="inside" class="box item"></div></div><div id="target" class="box item"></div><div id="later" class="box item"></div>',
	);
	expectBox(page, "#inside", 20, white);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#later", 20, white);
});

it("paints relative general siblings but not preceding siblings or descendants", () => {
	const page = fixture(
		".parent{~ .item{width:32px;background:red}}",
		'<div id="before" class="box item"></div><div class="parent"><div id="inside" class="box item"></div></div><div id="target" class="box item"></div><section></section><div id="later" class="box item"></div>',
	);
	expectBox(page, "#before", 20, white);
	expectBox(page, "#inside", 20, white);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#later", 32, red);
});

it("retains the implicit parent before a leading combinator with a later ampersand", () => {
	const page = fixture(
		".item{+ .group &{width:32px;background:red}}",
		'<div class="item"></div><section class="group"><div id="target" class="box item"></div></section><section class="group"><div id="outside" class="box item"></div></section>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#outside", 20, white);
});

it("allows an ancestor before ampersand without adding an implicit descendant", () => {
	const page = fixture(
		".item{.theme &{width:32px;background:red}}",
		'<section class="theme"><div id="target" class="box item"></div></section><div id="outside" class="box item"></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#outside", 20, white);
});

it("combines ampersand with a class on the parent element itself", () => {
	const page = fixture(
		".item{&.active{width:32px;background:red}}",
		'<div id="target" class="box item active"></div><div id="inactive" class="box item"></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#inactive", 20, white);
});

it("counts both ampersands in the specificity of a repeated parent compound", () => {
	const page = fixture(
		".item{&&{width:32px;background:red}}div.item{width:24px;background:blue}",
	);
	expectBox(page, "#target", 32, red);
});

it("accepts a type before ampersand and filters the parent selector list", () => {
	const page = fixture(
		".item{div&{width:32px;background:red}}",
		'<div id="target" class="box item"></div><section id="other" class="box item"></section>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#other", 20, white);
});

it("uses an unmatched parent ID branch for nested maximum specificity", () => {
	const page = fixture(
		"#absent,.parent{.item{width:32px;background:red}}.parent > .item{width:24px;background:blue}",
	);
	expect(page.queries.querySelector("#absent")).toBeNull();
	expectBox(page, "#target", 32, red);
});

it("uses the same parent-list maximum on matching high and low branches", () => {
	const page = fixture(
		"#high,.parent{> .item{width:32px;background:red}}.parent > .item{width:24px;background:blue}",
		'<div id="high" class="parent"><div id="first" class="box item"></div></div><div class="parent"><div id="second" class="box item"></div></div>',
	);
	expectBox(page, "#first", 32, red);
	expectBox(page, "#second", 32, red);
});

it("keeps every branch of a nested selector list in its own parent context", () => {
	const page = fixture(
		".parent{> .first,.second,& > .third{width:32px;background:red}}",
		'<div class="parent"><div id="first" class="box first"></div><section><div id="second" class="box second"></div></section><div id="third" class="box third"></div></div><div id="outside" class="box second"></div>',
	);
	for (const selector of ["#first", "#second", "#third"])
		expectBox(page, selector, 32, red);
	expectBox(page, "#outside", 20, white);
});

it("resolves ampersand inside the native is selector function", () => {
	const page = fixture(".parent{:is(&) > .item{width:32px;background:red}}");
	expectBox(page, "#target", 32, red);
});

it("resolves ampersand inside not without confusing the child with its parent", () => {
	const page = fixture(
		".parent{& > .item:not(&){width:32px;background:red}}",
		'<div class="parent"><div id="target" class="box item"></div><div id="excluded" class="box item parent"></div></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#excluded", 20, white);
});

it("uses native relative has matching on a nested parent compound", () => {
	const page = fixture(
		".item{&:has(> .flag){width:32px;background:red}}",
		'<div id="target" class="box item"><span class="flag"></span></div><div id="other" class="box item"><section><span class="flag"></span></section></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#other", 20, white);
});

it("carries the nearest parent context through multiple nested style levels", () => {
	const page = fixture(
		".parent{> .group{> .item{width:32px;background:red}}}",
		'<div class="parent"><div class="group"><div id="target" class="box item"></div></div><div id="direct" class="box item"></div></div><div class="group"><div id="outside" class="box item"></div></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#direct", 20, white);
	expectBox(page, "#outside", 20, white);
});

it("lays out nested before and after boxes owned by the original element", () => {
	const page = fixture(
		'.parent{--tone:red;> .item{height:auto;&::before{content:"";display:block;width:12px;height:6px;background:var(--tone)}&::after{content:"";display:block;width:16px;height:6px;background:blue}}}',
	);
	const before = expectPseudo(page, "#target", "before", 12, red);
	const after = expectPseudo(page, "#target", "after", 16, blue);
	expect(after.borderY).toBe(before.borderY + 6);
	expect(page.rect()).toMatchObject({ width: 20, height: 12 });
	expect(page.tree.textContent(page.id())).toBe("");
	expect(page.queries.querySelectorAll("#target > *")).toEqual([]);
	expect(
		page.styles.generatedContent(page.id("#parent"), "before"),
	).toBeUndefined();
	const generated = buildFormattingTree(page.tree).nodes.filter(
		(node) => node.generatedContent,
	);
	expect(generated.length).toBeGreaterThan(0);
	for (const node of generated)
		expect(node.generatedContent?.owner).toBe(page.id());
});

it("preserves a pseudo parent for declarations after a nested conditional", () => {
	const page = fixture(
		'.item::before{content:"";display:block;width:12px;height:6px;background:blue;@media screen{width:28px;background:green}width:24px;background:red}',
	);
	expectPseudo(page, "#target", "before", 24, red);
	expect(page.rect().width).toBe(20);
	expect(page.styles.paint(page.id())["background-color"]).toEqual(white);
});

it("preserves pseudo targets for declarations inside media and supports", () => {
	const page = fixture(
		'.item::after{content:"";display:block;width:12px;height:6px;background:blue;@media screen{width:24px;@supports (width:1px){width:30px;background:red}}}',
	);
	expectPseudo(page, "#target", "after", 30, red);
	expect(page.rect().width).toBe(20);
	expect(page.styles.generatedContent(page.id(), "before")).toBeUndefined();
});

it("does not let ordinary ampersand match a pseudo-only parent or its origin", () => {
	const page = fixture(
		'.item::before{content:"";display:block;width:12px;height:6px;background:red;&{content:"wrong";width:80px;background:blue}}',
	);
	expectPseudo(page, "#target", "before", 12, red);
	expect(page.styles.generatedContent(page.id(), "before")?.content).toBe("");
	expect(page.rect().width).toBe(20);
	expect(page.styles.paint(page.id())["background-color"]).toEqual(white);
});

it("keeps original branch specificity for conditional and trailing declaration runs", () => {
	const page = fixture(
		".item,#missing::before{width:14px;@media screen{width:26px}&{height:14px}width:30px;background:red}div.item{width:22px;background:blue}",
	);
	expectBox(page, "#target", 22, blue, 14);
});

it("preserves exact source order across several interleaved declaration runs", () => {
	const page = fixture(
		".item{width:12px;background:green;&{width:24px;background:blue}width:32px;background:red;&{height:12px}height:14px}",
	);
	expectBox(page, "#target", 32, red, 14);
});

it("lets a later flat rule beat an equally specific nested self rule", () => {
	const page = fixture(
		".item{&{width:32px;background:red}}.item{width:24px;background:blue}",
	);
	expectBox(page, "#target", 24, blue);
});

it("keeps important parent declarations above normal nested self declarations", () => {
	const page = fixture(
		".item{width:32px!important;background:red!important;&{width:24px;background:blue}}",
	);
	expectBox(page, "#target", 32, red);
});

it("keeps important nested self declarations above later normal parent runs", () => {
	const page = fixture(
		".item{width:12px;&{width:32px!important;background:red!important}width:24px;background:blue}",
	);
	expectBox(page, "#target", 32, red);
});

it("applies specificity then source order among important nested declarations", () => {
	const page = fixture(
		".item{width:12px!important;&&{width:28px!important;background:blue!important}&&{width:32px!important;background:red!important}width:24px!important;background:green!important}",
	);
	expectBox(page, "#target", 32, red);
});

it("invalidates nested media declarations and child geometry on viewport changes", () => {
	const page = fixture(
		".parent{width:60px;@media (min-width:120px){width:80px;> .item{width:32px;background:red}}}",
	);
	expect(page.rect("#parent").width).toBe(80);
	expectBox(page, "#target", 32, red);
	page.styles.setViewport(80, 160);
	expect(page.rect("#parent").width).toBe(60);
	expectBox(page, "#target", 20, white);
	page.styles.setViewport(160, 160);
	expectBox(page, "#target", 32, red);
});

it("applies active supports declaration runs without leaking inactive children", () => {
	const page = fixture(
		".parent{width:60px;@supports (width:1px){width:80px;> .item{width:32px;background:red}}@supports (width:invalid){width:100px;> .item{width:99px;background:blue}}}",
	);
	expect(page.rect("#parent").width).toBe(80);
	expectBox(page, "#target", 32, red);
	expect(page.styles.metrics().applicableIssues).toEqual({});
});

it("finds the nearest style parent through several conditional groups", () => {
	const page = fixture(
		".parent{@media screen{@supports (width:1px){> .group{@media screen{> .item{width:32px;background:red}}}}}}",
		'<div class="parent"><div class="group"><div id="target" class="box item"></div></div><div id="direct" class="box item"></div></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#direct", 20, white);
});

it("does not leak an inactive media branch into its active sibling", () => {
	const page = fixture(
		".parent{@media print{> .item{width:99px;animation-name:spin}}@media screen{> .item{width:32px;background:red}}}",
	);
	expectBox(page, "#target", 32, red);
	expect(page.styles.metrics().issues["unimplemented-css-property"]).toBe(1);
	expect(page.styles.metrics().applicableIssues).toEqual({});
});

it("keeps custom-property brace data separate from subsequent nested rules", () => {
	const page = fixture(
		".parent{--data:{nested:{value};tokens:[a;b]};--size:32px;> .item{width:var(--size);background:red}}",
	);
	expectBox(page, "#target", 32, red);
	expect(page.styles.custom(page.id(), "--data")).toBe(
		"{nested:{value};tokens:[a;b]}",
	);
	expect(page.styles.metrics().issues).toEqual({});
});

it("ignores nesting-looking comments and quoted ampersands while painting strings", () => {
	const markup =
		'<div class="parent"><div id="target" class="box" data-token="&{}"></div></div><div id="outside" class="box" data-token="&{}"></div>';
	const page = fixture(
		'.parent{/* & .ghost { width:99px } */[data-token="&{}"]{width:40px;background:red;&::before{content:"& { ; }";display:block;width:40px;height:10px}}}',
		markup,
	);
	const flat = fixture(
		'.parent [data-token="&{}"]{width:40px;background:red}.parent [data-token="&{}"]::before{content:"& { ; }";display:block;width:40px;height:10px}',
		markup,
	);
	expect(page.rect().width).toBe(40);
	expect(page.styles.generatedContent(page.id(), "before")?.content).toBe(
		"& { ; }",
	);
	expect(page.rect("#outside")).toMatchObject({ width: 20, height: 10 });
	expect(page.styles.paint(page.id("#outside"))["background-color"]).toEqual(
		white,
	);
	expect(rasterizeDocument(page.tree, { clip }).image.pixels).toEqual(
		rasterizeDocument(flat.tree, { clip }).image.pixels,
	);
});

it("treats an escaped ampersand as part of a scoped descendant class name", () => {
	const page = fixture(
		String.raw`.parent{.literal\&{width:32px;background:red}}`,
		'<div class="parent"><div id="target" class="box literal&"></div></div><div id="outside" class="box literal&"></div>',
	);
	expectBox(page, "#target", 32, red);
	expectBox(page, "#outside", 20, white);
});

it("invalidates cached nested styles, geometry and paint after style text mutation", () => {
	const page = fixture(".parent{> .item{width:32px;background:red}}");
	const original = page.rect();
	expectBox(page, "#target", 32, red);
	const replacement = ".parent{> .item{width:40px;background:blue}}";
	page.tree.setTextContent(page.id("#sheet"), replacement);
	expectBox(page, "#target", 40, blue);
	expect(original.width).toBe(32);
	expect(page.tree.textContent(page.id("#sheet"))).toBe(replacement);
	expect(page.styles.metrics().issues).toEqual({});
});

it("invalidates nested ancestor matching after class changes and reparenting", () => {
	const page = fixture(".parent{> .item{width:32px;background:red}}");
	expectBox(page, "#target", 32, red);
	page.tree.setAttribute(page.id("#parent"), "class", "inactive");
	expectBox(page, "#target", 20, white);
	page.tree.setAttribute(page.id("#parent"), "class", "parent");
	expectBox(page, "#target", 32, red);
	page.tree.append(page.id("body"), page.id());
	expectBox(page, "#target", 20, white);
	page.tree.append(page.id("#parent"), page.id());
	expectBox(page, "#target", 32, red);
});

it("invalidates child paint when native hover state changes on the parent", () => {
	const page = fixture(".parent:hover{> .item{width:32px;background:red}}");
	expectBox(page, "#target", 20, white);
	page.tree.setPointerState(page.id("#parent"), null);
	expectBox(page, "#target", 32, red);
	page.tree.setPointerState(null, null);
	expectBox(page, "#target", 20, white);
});

it.each(["&div", ".item,???"])(
	"discards invalid nested selector %s while preserving parent and later geometry",
	(selector) => {
		const page = fixture(
			`.parent{width:26px;${selector}{width:90px;animation-name:spin}> .item{width:32px;background:red}height:20px}`,
		);
		expect(page.rect("#parent")).toMatchObject({ width: 26, height: 20 });
		expectBox(page, "#target", 32, red);
		expect(page.styles.metrics().issues).toEqual({ [discarded]: 1 });
		expect(page.styles.metrics().applicableIssues).toEqual({ [discarded]: 1 });
		expect(buildFormattingTree(page.tree).issues).toEqual({
			[`css:${discarded}`]: 1,
		});
		expect(isAdvisoryFormattingIssue(`css:${discarded}`)).toBe(true);
	},
);

it("keeps unsupported native nested selectors nonadvisory and blocks rasterization", () => {
	const page = fixture(
		".parent{&:lang(en){width:90px}> .item{width:32px;background:red}}",
	);
	const issue = "unimplemented-nested-css-selector";
	expect(page.styles.box(page.id()).width).toBe("32px");
	expect(page.styles.metrics().issues[issue]).toBe(1);
	expect(page.styles.metrics().issues[discarded]).toBeUndefined();
	expect(buildFormattingTree(page.tree).issues[`css:${issue}`]).toBe(1);
	expect(isAdvisoryFormattingIssue(`css:${issue}`)).toBe(false);
	expect(() => layoutDocument(page.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() => rasterizeDocument(page.tree, { clip })).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each(["@layer demo", "@scope (.parent)", "@container (width > 1px)"])(
	"keeps independently unsupported nested group %s explicit",
	(group) => {
		const page = fixture(
			`.parent{> .item{width:32px;background:red}${group}{> .item{width:90px}}}`,
		);
		const issue = "unimplemented-css-at-rule";
		expect(page.styles.box(page.id()).width).toBe("32px");
		expect(page.styles.metrics().issues[issue]).toBe(1);
		expect(page.styles.metrics().issues[discarded]).toBeUndefined();
		expect(buildFormattingTree(page.tree).issues[`css:${issue}`]).toBe(1);
		expect(isAdvisoryFormattingIssue(`css:${issue}`)).toBe(false);
		expect(() => layoutDocument(page.tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(page.tree, { clip })).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("does not drop unsupported selectors that can match outside an absent parent", () => {
	const page = fixture(
		".missing{:not(&):lang(en){width:40px}}",
		'<div id="target" class="box" lang="en"></div>',
	);
	expect(
		page.styles.metrics().applicableIssues["unimplemented-nested-css-selector"],
	).toBe(1);
	expect(() => rasterizeDocument(page.tree, { clip })).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("keeps unknown nesting applicability media-scoped rather than parent-scoped", () => {
	const page = fixture(".missing{@media print{:not(&):lang(en){width:40px}}}");
	expectBox(page, "#target", 20, white);
	expect(
		page.styles.metrics().issues["unimplemented-nested-css-selector"],
	).toBe(1);
	expect(page.styles.metrics().applicableIssues).toEqual({});
});

it("does not drop unknown grouping rules merely because their parent is absent", () => {
	const page = fixture(".missing{@layer theme{:not(&){width:40px}}}");
	expect(
		page.styles.metrics().applicableIssues["unimplemented-css-at-rule"],
	).toBe(1);
	expect(() => rasterizeDocument(page.tree, { clip })).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each(["[*|href]", "[|href]", "[svg|href]"])(
	"keeps unsupported namespace selector %s nonadvisory",
	(selector) => {
		const page = fixture(
			`.parent{${selector}{width:40px}}`,
			'<div class="parent"><a id="target" class="box" href="/">link</a></div>',
		);
		expect(page.styles.metrics().issues[discarded]).toBeUndefined();
		expect(
			page.styles.metrics().applicableIssues[
				"unimplemented-nested-css-selector"
			],
		).toBe(1);
		expect(() => rasterizeDocument(page.tree, { clip })).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("rejects unsafe nesting specificity instead of choosing a rounded cascade winner", () => {
	const source =
		"#target{" +
		"&&&&&&&&&&&&&&&&{".repeat(13) +
		"&&{#target#target&{background:red}&#target#target{background:blue}}" +
		"}".repeat(14);
	const page = fixture(source);
	expect(() => page.styles.paint(page.id())).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it.each(["@media print", "@supports (width:invalid)"])(
	"charges rule and declaration budgets inside inactive nested group %s",
	(group) => {
		const children = Array.from(
			{ length: 12 },
			(_entry, index) =>
				`.child-${index}{width:32px;height:10px;background:red}`,
		).join("");
		const page = fixture(`.parent{width:60px;${group}{${children}}}`);
		for (const limits of [{ maxRules: 8 }, { maxDeclarations: 40 }]) {
			const limited = new DocumentStyles(page.tree, limits);
			try {
				expect(() => limited.metrics()).toThrow(
					expect.objectContaining({ code: "resource-limit" }),
				);
			} finally {
				limited.close();
			}
		}
	},
);
