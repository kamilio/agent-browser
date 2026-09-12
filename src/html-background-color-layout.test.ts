import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const green = [0, 128, 0, 255];
const white = [255, 255, 255, 255];
const black = [0, 0, 0, 255];
const transparent = "rgba(0, 0, 0, 0)";
const baseCss =
	"html,body{margin:0;padding:0;font-size:8px;line-height:8px}table{width:120px;border-spacing:3px}tr{height:18px}td,th{padding:0;vertical-align:top}";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup: string, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${baseCss}</style><style id="author">${css}</style>${markup}`,
		"https://fixture.invalid/background-color",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(160, 128);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing background fixture ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	return { tree, styles, id, rectangle };
}

function pixel(
	raster: ReturnType<typeof rasterizeDocument>,
	horizontal: number,
	vertical: number,
) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	if (
		column < 0 ||
		column >= raster.image.width ||
		row < 0 ||
		row >= raster.image.height
	)
		throw new Error("Background sample outside raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

function center(test: ReturnType<typeof fixture>, selector: string) {
	const rectangle = test.rectangle(selector);
	expect(rectangle.width).toBeGreaterThan(0);
	expect(rectangle.height).toBeGreaterThan(0);
	return {
		x: rectangle.x + rectangle.width / 2,
		y: rectangle.y + rectangle.height / 2,
	};
}

function expectPaintAndHit(
	test: ReturnType<typeof fixture>,
	selector: string,
	color: number[],
) {
	const point = center(test, selector);
	expect(pixel(rasterizeDocument(test.tree), point.x, point.y)).toEqual(color);
	expect(documentHitTesting(test.tree).elementFromPoint(point.x, point.y)).toBe(
		test.id(selector),
	);
}

function expectNoHintGuards(tree: DocumentTree) {
	const issues = buildFormattingTree(tree).issues;
	expect(issues["html-presentation-hint-not-supported"] ?? 0).toBe(0);
	expect(issues["html-table-presentation-hint-not-supported"] ?? 0).toBe(0);
}

function expectErrorCode(action: () => unknown, code: string) {
	let failure: unknown;
	try {
		action();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AgentBrowserError);
	expect(failure).toMatchObject({ code });
}

function cssEquivalent(markup: string) {
	return markup.replace(/ bgcolor="([^"]*)"/g, ' style="background-color:$1"');
}

it.each(["table", "thead", "tbody", "tfoot", "tr", "td", "th"])(
	"cascades, lays out, paints and hit-tests a %s hint like equivalent CSS",
	(role) => {
		const group = ["thead", "tbody", "tfoot"].includes(role) ? role : "tbody";
		const cell = role === "th" ? "th" : "td";
		const attributes = (tag: string) =>
			tag === role ? ' id="target" bgcolor="#123"' : ` id="${tag}"`;
		const markup = `<table${attributes("table")}><${group}${attributes(group)}><tr${attributes("tr")}><${cell}${attributes(cell)}></${cell}></tr></${group}></table>`;
		const actual = fixture(markup);
		const expected = fixture(cssEquivalent(markup));
		const cellSelector = role === cell ? "#target" : `#${cell}`;
		expectNoHintGuards(actual.tree);
		expect(actual.styles.metrics().issues).toEqual({});
		expect(
			resolvedStyleValue(actual.tree, actual.id("#target"), "background-color"),
		).toBe("rgb(17, 34, 51)");
		for (const selector of ["#target", cellSelector, "table"])
			expect(actual.rectangle(selector)).toEqual(expected.rectangle(selector));
		expect(actual.rectangle("table").width).toBe(120);
		expect(actual.rectangle(cellSelector).height).toBe(18);
		expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
			rasterizeDocument(expected.tree).image.pixels,
		);
		expectPaintAndHit(actual, cellSelector, [17, 34, 51, 255]);
		if (role !== cell)
			expect(
				resolvedStyleValue(
					actual.tree,
					actual.id(cellSelector),
					"background-color",
				),
			).toBe(transparent);
		if (role === "table") {
			expect(pixel(rasterizeDocument(actual.tree), 1, 1)).toEqual([
				17, 34, 51, 255,
			]);
			expect(documentHitTesting(actual.tree).elementFromPoint(1, 1)).toBe(
				actual.id("#target"),
			);
		}
	},
);

it.each([false, true])(
	"paints a body hint with opaque-root=%s without inheriting it into children",
	(opaqueRoot) => {
		const markup =
			'<body id="body" bgcolor="red"><div id="child"></div></body>';
		const css = `body{height:24px}#child{height:12px}${opaqueRoot ? "html{background:blue}" : ""}`;
		const actual = fixture(markup, css);
		const expected = fixture(cssEquivalent(markup), css);
		const raster = rasterizeDocument(actual.tree);
		expectNoHintGuards(actual.tree);
		expect(
			resolvedStyleValue(actual.tree, actual.id("#body"), "background-color"),
		).toBe("rgb(255, 0, 0)");
		expect(
			resolvedStyleValue(actual.tree, actual.id("#child"), "background-color"),
		).toBe(transparent);
		expect(raster.image.pixels).toEqual(
			rasterizeDocument(expected.tree).image.pixels,
		);
		expect(raster.canvasBackground).toEqual({
			sourceRef: actual.tree.reference(
				actual.id(opaqueRoot ? "html" : "#body"),
			),
			color: opaqueRoot ? blue : red,
		});
		expect(pixel(raster, 159, 127)).toEqual(opaqueRoot ? blue : red);
		expectPaintAndHit(actual, "#child", red);
	},
);

it.each(["separate", "collapse"])(
	"preserves table, group, row and transparent/opaque cell layers with %s borders",
	(collapse) => {
		const markup =
			'<table id="table" bgcolor="yellow"><tbody bgcolor="green"><tr bgcolor="red"><td id="opaque" bgcolor="white"></td><td id="transparent" bgcolor="transparent"></td></tr><tr><td id="group"></td><td></td></tr></tbody></table>';
		const css = `table{border-collapse:${collapse}}`;
		const actual = fixture(markup, css);
		const expected = fixture(cssEquivalent(markup), css);
		expectNoHintGuards(actual.tree);
		expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
			rasterizeDocument(expected.tree).image.pixels,
		);
		for (const selector of ["#table", "#opaque", "#transparent", "#group"])
			expect(actual.rectangle(selector)).toEqual(expected.rectangle(selector));
		expectPaintAndHit(actual, "#opaque", white);
		expectPaintAndHit(actual, "#transparent", red);
		expectPaintAndHit(actual, "#group", green);
		expect(
			resolvedStyleValue(
				actual.tree,
				actual.id("#transparent"),
				"background-color",
			),
		).toBe(transparent);
		if (collapse === "separate") {
			expect(pixel(rasterizeDocument(actual.tree), 1, 1)).toEqual([
				255, 255, 0, 255,
			]);
			expect(documentHitTesting(actual.tree).elementFromPoint(1, 1)).toBe(
				actual.id("#table"),
			);
		}
	},
);

it.each(["separate", "collapse"])(
	"keeps hinted rowspan cells above later rows and colspan cells above groups in %s tables",
	(collapse) => {
		const markup =
			'<table id="table"><tbody id="group" bgcolor="green"><tr bgcolor="yellow"><td id="tall" rowspan="2" bgcolor="red"></td><td id="first"></td></tr><tr bgcolor="blue"><td id="second"></td></tr><tr><td id="wide" colspan="2" bgcolor="white"></td></tr></tbody></table>';
		const css = `table{border-collapse:${collapse}}`;
		const actual = fixture(markup, css);
		const expected = fixture(cssEquivalent(markup), css);
		const tall = actual.rectangle("#tall");
		const second = actual.rectangle("#second");
		expectNoHintGuards(actual.tree);
		expect(tall.height).toBe(collapse === "separate" ? 39 : 36);
		expect(tall.bottom).toBe(second.bottom);
		expect(actual.rectangle("#wide").width).toBe(
			actual.rectangle("#group").width,
		);
		for (const selector of ["#table", "#group", "#tall", "#second", "#wide"])
			expect(actual.rectangle(selector)).toEqual(expected.rectangle(selector));
		expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
			rasterizeDocument(expected.tree).image.pixels,
		);
		const horizontal = tall.x + tall.width / 2;
		const vertical = second.y + second.height / 2;
		expect(pixel(rasterizeDocument(actual.tree), horizontal, vertical)).toEqual(
			red,
		);
		expect(
			documentHitTesting(actual.tree).elementFromPoint(horizontal, vertical),
		).toBe(actual.id("#tall"));
		expectPaintAndHit(actual, "#first", [255, 255, 0, 255]);
		expectPaintAndHit(actual, "#second", blue);
		expectPaintAndHit(actual, "#wide", white);
	},
);

it("keeps a zero rowspan and its background inside its original row group", () => {
	const test = fixture(
		'<table><tbody><tr><td id="tall" rowspan="0" bgcolor="red"></td><td></td></tr><tr bgcolor="blue"><td id="second"></td></tr></tbody><tbody bgcolor="green"><tr><td id="next" colspan="2"></td></tr></tbody></table>',
	);
	expect(test.rectangle("#tall").bottom).toBe(test.rectangle("#second").bottom);
	expect(test.rectangle("#next").top).toBe(test.rectangle("#tall").bottom + 3);
	expectPaintAndHit(test, "#tall", red);
	expectPaintAndHit(test, "#second", blue);
	expectPaintAndHit(test, "#next", green);
});

it("retains differently colored empty rows, their group bounds and following flow", () => {
	const markup =
		'<table id="table"><tbody id="group" bgcolor="green"><tr id="first" bgcolor="red"></tr><tr id="second" bgcolor="blue"></tr></tbody></table><div id="after"></div>';
	const actual = fixture(markup, "#after{height:7px}");
	const expected = fixture(cssEquivalent(markup), "#after{height:7px}");
	expectNoHintGuards(actual.tree);
	expect(actual.rectangle("#first")).toMatchObject({
		x: 0,
		y: 3,
		width: 120,
		height: 18,
	});
	expect(actual.rectangle("#second")).toMatchObject({
		x: 0,
		y: 24,
		width: 120,
		height: 18,
	});
	expect(actual.rectangle("#group")).toMatchObject({
		x: 0,
		y: 3,
		width: 120,
		height: 39,
	});
	expect(actual.rectangle("#after")).toMatchObject({ y: 45, height: 7 });
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
	expectPaintAndHit(actual, "#first", red);
	expectPaintAndHit(actual, "#second", blue);
});

it("paints collapsed shared borders above hints without transferring physical cell hits", () => {
	const test = fixture(
		'<table bgcolor="green"><tr bgcolor="blue"><td id="first" bgcolor="red"></td><td id="second" bgcolor="white"></td></tr></table>',
		"table{border-collapse:collapse}td{border:2px solid black}#second{border-left:6px solid blue}",
	);
	const first = test.rectangle("#first");
	const second = test.rectangle("#second");
	const vertical = first.y + first.height / 2;
	expect(first.right).toBe(second.left);
	expect(pixel(rasterizeDocument(test.tree), first.right, vertical)).toEqual(
		blue,
	);
	expect(
		documentHitTesting(test.tree).elementFromPoint(
			first.right - 0.25,
			vertical,
		),
	).toBe(test.id("#first"));
	expect(
		documentHitTesting(test.tree).elementFromPoint(
			second.left + 0.25,
			vertical,
		),
	).toBe(test.id("#second"));
	expectPaintAndHit(test, "#first", red);
	expectPaintAndHit(test, "#second", white);
});

it.each([
	{
		css: "*{background-color:lime}",
		inline: "",
		computed: "rgb(0, 255, 0)",
		paint: [0, 255, 0, 255],
	},
	{
		css: "",
		inline: "background-color:blue",
		computed: "rgb(0, 0, 255)",
		paint: blue,
	},
	{
		css: "*{background-color:blue!important}",
		inline: "background-color:red",
		computed: "rgb(0, 0, 255)",
		paint: blue,
	},
	{
		css: "#target{background-color:red!important}",
		inline: "background:blue!important",
		computed: "rgb(0, 0, 255)",
		paint: blue,
	},
	{
		css: "*{background:lime}",
		inline: "",
		computed: "rgb(0, 255, 0)",
		paint: [0, 255, 0, 255],
	},
	{
		css: "#target{background:none}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{background-color:inherit}",
		inline: "",
		computed: "rgb(0, 0, 255)",
		paint: blue,
	},
	{
		css: "#target{background-color:initial}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{background-color:unset}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{background-color:revert}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{all:initial;display:table-cell}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{all:unset;display:table-cell}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{all:revert;display:table-cell}",
		inline: "",
		computed: transparent,
		paint: blue,
	},
	{
		css: "#target{color:lime;background-color:currentcolor}",
		inline: "",
		computed: "rgb(0, 255, 0)",
		paint: [0, 255, 0, 255],
	},
	{
		css: "#target{background:rgba(255,255,255,0.5)}",
		inline: "",
		computed: "rgba(255, 255, 255, 0.502)",
		paint: [128, 128, 255, 255],
	},
])(
	"author cascade overrides a cell hint: $css / $inline",
	({ css, inline, computed, paint }) => {
		const test = fixture(
			`<table><tr bgcolor="blue"><td id="target" bgcolor="red" style="${inline}"></td></tr></table>`,
			css,
		);
		expectNoHintGuards(test.tree);
		expect(
			resolvedStyleValue(test.tree, test.id("#target"), "background-color"),
		).toBe(computed);
		expectPaintAndHit(test, "#target", paint);
	},
);

it("invalidates cached cascade and pixels on hint and inline-style mutation without moving cells", () => {
	const test = fixture(
		'<table><tr bgcolor="blue"><td id="target" bgcolor="red"></td></tr></table>',
	);
	const target = test.id("#target");
	const before = test.rectangle("#target");
	const ref = test.tree.reference(target);
	expectPaintAndHit(test, "#target", red);
	for (const [value, computed, paint] of [
		["#abc", "rgb(170, 187, 204)", [170, 187, 204, 255]],
		["chucknorris", "rgb(192, 0, 0)", [192, 0, 0, 255]],
		[" \t\r\n\f", "rgb(0, 0, 0)", black],
		["", transparent, blue],
		[" \tTrAnSpArEnT\n", transparent, blue],
		[undefined, transparent, blue],
		["red", "rgb(255, 0, 0)", red],
	] as const) {
		const builds = test.styles.metrics().cascadeBuilds;
		if (value === undefined) test.tree.removeAttribute(target, "bgcolor");
		else test.tree.setAttribute(target, "bgcolor", value);
		expect(resolvedStyleValue(test.tree, target, "background-color")).toBe(
			computed,
		);
		expect(test.styles.metrics().cascadeBuilds).toBe(builds + 1);
		expectPaintAndHit(test, "#target", [...paint]);
		expect(test.rectangle("#target")).toEqual(before);
		expect(test.tree.reference(target)).toBe(ref);
		expectNoHintGuards(test.tree);
	}
	test.tree.setAttribute(target, "style", "background:white!important");
	expectPaintAndHit(test, "#target", white);
	test.tree.setAttribute(target, "bgcolor", "green");
	expectPaintAndHit(test, "#target", white);
	test.tree.removeAttribute(target, "style");
	expectPaintAndHit(test, "#target", green);
	test.tree.removeAttribute(target, "bgcolor");
	expectPaintAndHit(test, "#target", blue);
});

it("rebuilds paint and hit geometry for stylesheet-owner replacement and restores the hint on removal", () => {
	const test = fixture(
		'<link id="sheet" rel="stylesheet" href="/owned.css"><table><tr><td id="target" bgcolor="red"></td></tr></table>',
	);
	const sheet = test.id("#sheet");
	test.styles.setExternalSheet(
		sheet,
		"https://fixture.invalid/owned.css",
		"#target{background:blue}tr{height:26px}",
	);
	expect(test.rectangle("#target").height).toBe(26);
	expectPaintAndHit(test, "#target", blue);
	test.styles.setExternalSheet(
		sheet,
		"https://fixture.invalid/owned.css",
		"#target{background:white}tr{height:38px}",
	);
	expect(test.rectangle("#target").height).toBe(38);
	expectPaintAndHit(test, "#target", white);
	const point = center(test, "#target");
	const oldBottom = test.rectangle("#target").bottom - 1;
	expect(
		documentHitTesting(test.tree).elementFromPoint(point.x, oldBottom),
	).toBe(test.id("#target"));
	test.tree.remove(sheet);
	expect(test.rectangle("#target").height).toBe(18);
	expectPaintAndHit(test, "#target", red);
	expect(
		documentHitTesting(test.tree).elementFromPoint(point.x, oldBottom),
	).not.toBe(test.id("#target"));
	const author = test.id("#author");
	const text = test.tree.createText("#target{background:green}");
	test.tree.append(author, text);
	expectPaintAndHit(test, "#target", green);
	test.tree.setData(text, "#target{background:blue}");
	expectPaintAndHit(test, "#target", blue);
	test.tree.remove(author);
	expectPaintAndHit(test, "#target", red);
});

it.each([
	"width",
	"height",
	"align",
	"valign",
	"hspace",
	"vspace",
	"border",
	"nowrap",
])(
	"does not remove the independent generic %s presentation guard",
	(attribute) => {
		const test = fixture(
			`<table id="target" bgcolor="red" ${attribute}="1"><tr><td></td></tr></table>`,
		);
		expect(
			buildFormattingTree(test.tree).issues[
				"html-presentation-hint-not-supported"
			],
		).toBeGreaterThan(0);
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
		test.tree.removeAttribute(test.id("#target"), attribute);
		expectNoHintGuards(test.tree);
		expect(test.rectangle("#target").width).toBe(120);
		expectPaintAndHit(test, "td", red);
	},
);

it.each(["cellpadding", "cellspacing", "rules", "frame", "background"])(
	"does not remove the independent table %s presentation guard",
	(attribute) => {
		const test = fixture(
			`<table id="target" bgcolor="red" ${attribute}="legacy"><tr><td></td></tr></table>`,
		);
		expect(
			buildFormattingTree(test.tree).issues[
				"html-table-presentation-hint-not-supported"
			],
		).toBeGreaterThan(0);
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
		test.tree.removeAttribute(test.id("#target"), attribute);
		expectNoHintGuards(test.tree);
		expectPaintAndHit(test, "td", red);
	},
);

it.each(["col", "colgroup"])(
	"does not implement a %s bgcolor hint or alter existing column guards",
	(role) => {
		const markup =
			role === "col"
				? '<table><colgroup><col id="target" bgcolor="red"></colgroup><tr><td></td></tr></table>'
				: '<table><colgroup id="target" bgcolor="red"><col></colgroup><tr><td></td></tr></table>';
		const test = fixture(markup);
		expect(
			resolvedStyleValue(test.tree, test.id("#target"), "background-color"),
		).toBe(transparent);
		const issues = buildFormattingTree(test.tree).issues;
		if (role === "colgroup")
			expect(
				issues["html-table-presentation-hint-not-supported"],
			).toBeGreaterThan(0);
		else {
			const baseline = fixture(markup.replace(' bgcolor="red"', ""));
			expect(issues).toEqual(buildFormattingTree(baseline.tree).issues);
			expect(issues["html-table-presentation-hint-not-supported"] ?? 0).toBe(0);
			expectErrorCode(() => layoutDocument(baseline.tree), "unsupported");
		}
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
	},
);

it.each(["div", "span", "a"])(
	"does not create a bgcolor hint for %s",
	(role) => {
		const test = fixture(
			`<${role} id="target" bgcolor="red"></${role}>`,
			"#target{display:block;width:24px;height:18px}",
		);
		expect(
			resolvedStyleValue(test.tree, test.id("#target"), "background-color"),
		).toBe(transparent);
		expectPaintAndHit(test, "#target", white);
	},
);

it("preserves marquee's static fallback like equivalent CSS without claiming animation support", () => {
	const markup = '<marquee id="target" bgcolor="red">Static fallback</marquee>';
	const test = fixture(markup);
	const expected = fixture(cssEquivalent(markup));
	expect(
		resolvedStyleValue(test.tree, test.id("#target"), "background-color"),
	).toBe("rgb(255, 0, 0)");
	expect(buildFormattingTree(test.tree).issues).toEqual(
		buildFormattingTree(expected.tree).issues,
	);
	expect(
		buildFormattingTree(test.tree).issues["element-layout-not-supported"] ?? 0,
	).toBe(0);
	expect(test.rectangle("#target")).toEqual(expected.rectangle("#target"));
	const point = center(test, "#target");
	expect(documentHitTesting(test.tree).elementFromPoint(point.x, point.y)).toBe(
		test.id("#target"),
	);
	expect(rasterizeDocument(test.tree).image.pixels).toEqual(
		rasterizeDocument(expected.tree).image.pixels,
	);
});

it.each([svgNamespace, mathmlNamespace])(
	"excludes foreign-namespace backgrounds from native hint layout: %s",
	(namespace) => {
		const test = fixture("<body></body>");
		const target = test.tree.createParserElement(
			"table",
			{ bgcolor: "red" },
			namespace,
		);
		test.tree.append(test.id("body"), target);
		expect(resolvedStyleValue(test.tree, target, "background-color")).toBe(
			transparent,
		);
		expect(
			buildFormattingTree(test.tree).issues["element-layout-not-supported"],
		).toBeGreaterThan(0);
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
	},
);

it("leaves source attributes, DOM, refs, revision and mutation journals unchanged during native reads", () => {
	const test = fixture(
		'<body bgcolor="navy"><table><tbody bgcolor="#123"><tr bgcolor="chucknorris"><td id="target" bgcolor="  #abc  "><a id="link" href="#target">Next</a></td></tr></tbody></table></body>',
	);
	const source = serializeHtml(test.tree);
	const revision = test.tree.revision;
	const nodes = () =>
		[...test.tree.walk()].map(({ node }) => ({
			id: node.id,
			ref: test.tree.reference(node.id),
			attributes: { ...node.attributes },
			children: [...node.children],
			data: node.data,
		}));
	const retained = nodes();
	const mutations: unknown[] = [];
	const changes: unknown[] = [];
	test.tree.onMutation((record) => mutations.push(record));
	test.tree.onChange((change) => changes.push(change));
	const before = snapshotDocument(test.tree);
	for (let iteration = 0; iteration < 3; iteration++) {
		expectNoHintGuards(test.tree);
		expect(
			resolvedStyleValue(test.tree, test.id("#target"), "background-color"),
		).toBe("rgb(170, 187, 204)");
		expect(layoutDocument(test.tree).boxes.length).toBeGreaterThan(0);
		const point = center(test, "#link");
		expect(
			documentHitTesting(test.tree).elementFromPoint(point.x, point.y),
		).toBe(test.id("#link"));
		expect(rasterizeDocument(test.tree).metrics.paintedGlyphs).toBeGreaterThan(
			0,
		);
		expect(snapshotDocument(test.tree)).toEqual(before);
	}
	expect(serializeHtml(test.tree)).toBe(source);
	expect(nodes()).toEqual(retained);
	expect(test.tree.get(test.id("#target")).attributes).toMatchObject({
		bgcolor: "  #abc  ",
	});
	expect(test.tree.get(test.id("#target")).attributes.style).toBeUndefined();
	expect(test.tree.revision).toBe(revision);
	expect(test.tree.changesSince(revision)).toEqual({
		revision,
		reset: false,
		changes: [],
	});
	expect(changes).toEqual([]);
	expect(mutations).toEqual([]);
});

it.each(["", "transparent", " \t\r\n\f", "chucknorris", "f".repeat(5000)])(
	"charges the full raw hint once even when author styling hides and overrides it: %#",
	(value) => {
		const test = fixture(
			'<table><tr><td id="target" style="display:none;background:blue!important"></td></tr></table>',
		);
		const baseline = test.styles.metrics().work;
		test.tree.setAttribute(test.id("#target"), "bgcolor", value);
		const required = baseline + value.length + 1;
		expect(test.styles.metrics().work).toBe(required);
		expect(test.styles.metrics().work).toBe(required);
		const exact = new DocumentStyles(test.tree, { maxWork: required });
		const insufficient = new DocumentStyles(test.tree, {
			maxWork: required - 1,
		});
		try {
			expect(exact.paint(test.id("#target"))["background-color"]).toEqual(blue);
			expect(exact.metrics().work).toBe(required);
			expectErrorCode(() => insufficient.metrics(), "resource-limit");
			test.tree.removeAttribute(test.id("#target"), "bgcolor");
			expect(insufficient.metrics().work).toBe(baseline);
		} finally {
			exact.close();
			insufficient.close();
		}
	},
);

it("keeps layout, raster and hit work limits fail-closed without poisoning later native reads", () => {
	const test = fixture(
		'<table><tr bgcolor="red"><td id="target"></td></tr></table>',
	);
	const source = serializeHtml(test.tree);
	const revision = test.tree.revision;
	expectErrorCode(
		() => layoutDocument(test.tree, { maxWork: 1 }),
		"resource-limit",
	);
	expectErrorCode(
		() => rasterizeDocument(test.tree, { maxWork: 1 }),
		"resource-limit",
	);
	const limited = new DocumentHitTesting(test.tree, { maxWork: 1 });
	try {
		expectErrorCode(() => limited.elementFromPoint(10, 10), "resource-limit");
	} finally {
		limited.close();
	}
	expectPaintAndHit(test, "#target", red);
	expect(serializeHtml(test.tree)).toBe(source);
	expect(test.tree.revision).toBe(revision);
});

it("hits and activates a hinted-row anchor through native pointer events with only exact in-memory routes", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const start = "https://fixture.invalid/background-start";
	const destination = "https://fixture.invalid/background-destination";
	const startMarkup = `<!doctype html><style>${baseCss}a{display:block;height:18px}</style><table><tr bgcolor="red"><td bgcolor="transparent"><a id="target" href="/background-destination">Next</a></td></tr></table>`;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				const method = request.method ?? "GET";
				if (
					method !== "GET" ||
					request.body !== undefined ||
					![start, destination].includes(request.url)
				)
					throw new Error(
						`Unexpected in-memory request: ${method} ${request.url}`,
					);
				requests.push(request);
				const body = new TextEncoder().encode(
					request.url === start
						? startMarkup
						: "<!doctype html><h1 id=destination>Arrived</h1>",
				);
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, start);
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target");
	if (target === null) throw new Error("Missing hinted-row anchor");
	const rectangle = documentGeometry(page.document).getBoundingClientRect(
		target,
	);
	expect(rectangle.width).toBeGreaterThan(0);
	expect(rectangle.height).toBe(18);
	const horizontal = rectangle.right - 1;
	const vertical = rectangle.bottom - 1;
	expect(
		documentHitTesting(page.document).elementFromPoint(horizontal, vertical),
	).toBe(target);
	expect(pixel(rasterizeDocument(page.document), horizontal, vertical)).toEqual(
		red,
	);
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	expect(requests.map((request) => request.url)).toEqual([start]);
	await session.click(tab.id, page.document.reference(target));
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([start, destination]);
	expect(
		session.page(tab.id).queries.querySelector("#destination"),
	).not.toBeNull();
	session.close();
	expect(closed).toBe(true);
	expect(session.metrics()).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
	});
});
