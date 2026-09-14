import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentElementSizes } from "./element-sizes.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting, documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queryOwners: DocumentQueries[] = [];
const sides = ["left", "right", "inline-start", "inline-end"] as const;
const modes = ["flex", "grid"] as const;
const items =
	'<div id="first" class="item"><div id="chip" class="chip"></div></div><div id="second" class="item"><div id="chip2" class="chip"></div></div><div id="third" class="item"><div id="chip3" class="chip"></div></div>';
const baseCss =
	"html,body{margin:0;font-size:8px;line-height:8px}#container{width:150px;height:70px;background:yellow}.item{display:block;width:24px;height:18px;margin:2px;border:1px solid black;background:red}.chip{width:8px;height:6px;background:blue}#after{width:20px;height:7px;background:green}";
const selectors = [
	"#container",
	"#first",
	"#second",
	"#third",
	"#chip",
	"#after",
];

afterEach(() => {
	for (const queries of queryOwners.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

function containerCss(mode: "flex" | "grid") {
	return mode === "flex"
		? "#container{display:flex;gap:6px;align-items:center;justify-content:space-between}.item{flex:none}#first{order:2}#second{order:-1}"
		: "#container{display:grid;grid-template-columns:60px 80px;grid-template-rows:28px 32px;gap:6px;align-items:center}#first{grid-column:2;grid-row:2;order:2}#second{grid-column:1;grid-row:1;order:-1}#third{grid-column:2;grid-row:1}";
}

function fixture(css = "", children = items, standards = true) {
	const tree = parseHtmlDocument(
		`${standards ? "<!doctype html>" : ""}<style id="sheet">${baseCss}${css}</style><main id="container">${children}</main><footer id="after"></footer>`,
		"https://fixture.invalid/float-applicability-layout",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(200, 160);
	const queries = new DocumentQueries(tree);
	queryOwners.push(queries);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing float applicability fixture ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const matches = (formatting: FormattingTree, selector: string) =>
		formatting.nodes.filter(
			(node) => node.ref === tree.reference(id(selector)),
		);
	return { tree, styles, id, rectangle, matches };
}

function expectOwnership(formatting: FormattingTree) {
	const seen = new Set<number>();
	const pending = [formatting.root];
	while (pending.length) {
		const target = pending.pop();
		if (target === undefined) throw new Error("Missing formatting owner");
		expect(seen.has(target)).toBe(false);
		seen.add(target);
		const node = formatting.nodes[target];
		for (const child of node.children) {
			expect(formatting.nodes[child].parent).toBe(target);
			pending.push(child);
		}
	}
	expect(seen.size).toBe(formatting.nodes.length);
}

function expectAnchors(
	test: ReturnType<typeof fixture>,
	expected: readonly string[],
) {
	const formatting = buildFormattingTree(test.tree);
	expectOwnership(formatting);
	expect(
		formatting.nodes
			.filter((node) => node.floatSide !== undefined)
			.map((node) => node.ref)
			.sort(),
	).toEqual(
		expected.map((selector) => test.tree.reference(test.id(selector))).sort(),
	);
	expect(formatting.issues["float-layout-not-supported"] ?? 0).toBe(
		expected.length,
	);
	return formatting;
}

function expectEquivalent(
	actual: ReturnType<typeof fixture>,
	control: ReturnType<typeof fixture>,
	targets = selectors,
) {
	for (const selector of targets) {
		expect(actual.rectangle(selector), selector).toEqual(
			control.rectangle(selector),
		);
		expect(documentElementSizes(actual.tree).get(actual.id(selector))).toEqual(
			documentElementSizes(control.tree).get(control.id(selector)),
		);
		const rect = actual.rectangle(selector);
		if (rect.width <= 0 || rect.height <= 0) continue;
		const horizontal = rect.left + rect.width / 2;
		const vertical = rect.top + rect.height / 2;
		const actualHit = documentHitTesting(actual.tree).elementFromPoint(
			horizontal,
			vertical,
		);
		const controlHit = documentHitTesting(control.tree).elementFromPoint(
			horizontal,
			vertical,
		);
		expect(actualHit).not.toBeNull();
		expect(controlHit).not.toBeNull();
		if (actualHit === null || controlHit === null)
			throw new Error("Missing native control hit");
		expect(actual.tree.get(actualHit).attributes.id).toBe(
			control.tree.get(controlHit).attributes.id,
		);
	}
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		rasterizeDocument(control.tree).image.pixels,
	);
	expect(buildFormattingTree(actual.tree).issues).toEqual(
		buildFormattingTree(control.tree).issues,
	);
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

it.each(
	modes.flatMap((mode) =>
		sides.flatMap((side) =>
			["static", "relative"].map((position) => ({ mode, side, position })),
		),
	),
)(
	"ignores $side placement on $position direct $mode items without changing computed float",
	({ mode, side, position }) => {
		const css = `${containerCss(mode)}.item{float:${side};position:${position};clear:both}`;
		const actual = fixture(css);
		const control = fixture(`${css}.item{float:none}`);
		const formatting = expectAnchors(actual, []);
		for (const selector of ["#first", "#second", "#third"]) {
			expect(actual.styles.flow(actual.id(selector)).float).toBe(side);
			expect(
				resolvedStyleValue(actual.tree, actual.id(selector), "float"),
			).toBe(side);
			expect(actual.matches(formatting, selector)).toHaveLength(1);
			expect(actual.matches(formatting, selector)[0]).toMatchObject({
				[mode === "flex" ? "flexItem" : "gridItem"]: true,
				independentContext: true,
			});
			expect(actual.matches(formatting, selector)[0].clear).toBeUndefined();
		}
		expectEquivalent(actual, control);
	},
);

it.each(modes.flatMap((mode) => sides.map((side) => ({ mode, side }))))(
	"flattens nested contents wrappers without floating $mode items or inheriting $side",
	({ mode, side }) => {
		const children =
			'<div id="wrapper"><section id="inner-wrapper">' +
			items.replace('<div id="third"', '</section></div><div id="third"');
		const css = `${containerCss(mode)}#wrapper,#inner-wrapper{display:contents;float:${side};clear:both}.item{float:${side}}`;
		const actual = fixture(css, children);
		const control = fixture(
			`${css}#wrapper,#inner-wrapper,.item{float:none}`,
			children,
		);
		const formatting = expectAnchors(actual, []);
		for (const selector of ["#wrapper", "#inner-wrapper"]) {
			expect(actual.matches(formatting, selector)).toEqual([]);
			expect(actual.styles.get(actual.id(selector)).display).toBe("contents");
			expect(actual.styles.flow(actual.id(selector)).float).toBe(side);
		}
		for (const selector of ["#first", "#second", "#third"])
			expect(
				actual.matches(formatting, selector)[0][
					mode === "flex" ? "flexItem" : "gridItem"
				],
			).toBe(true);
		expect(actual.styles.flow(actual.id("#chip")).float).toBe("none");
		expectEquivalent(actual, control);
	},
);

it.each(
	modes.flatMap((mode) => ["left", "right"].map((side) => ({ mode, side }))),
)(
	"preserves real $side descendant float ownership and the existing $mode coordination guard",
	({ mode, side }) => {
		const children = items.replace(
			'<div id="chip" class="chip"></div>',
			'<div id="real" class="chip"></div><div id="cleared" class="chip"></div>',
		);
		const css = `${containerCss(mode)}.item{float:inline-end;width:38px;height:28px}#real{float:${side};height:10px}#cleared{clear:both}`;
		const actual = fixture(css, children);
		const control = fixture(`${css}.item{float:none}`, children);
		const formatting = expectAnchors(actual, ["#real"]);
		expect(actual.matches(formatting, "#real")[0].floatSide).toBe(side);
		expect(actual.matches(formatting, "#cleared")[0].clear).toBe("both");
		expect(formatting.issues).toEqual(buildFormattingTree(control.tree).issues);
		for (const test of [actual, control]) {
			expectErrorCode(() => layoutDocument(test.tree), "unsupported");
			expect(() => layoutDocument(test.tree)).toThrow(
				"Float content requires coordinated page layout",
			);
		}
	},
);

it.each(sides)(
	"keeps multiple ordinary contents wrappers boxless for float:%s",
	(side) => {
		const children =
			'<div id="wrapper"><div id="inner-wrapper"><div id="first" class="item"></div></div><div id="second" class="item"></div></div><div id="third" class="item"></div>';
		const css = `#wrapper,#inner-wrapper{display:contents;float:${side};clear:both}`;
		const actual = fixture(css, children);
		const control = fixture(
			`${css}#wrapper,#inner-wrapper{float:none}`,
			children,
		);
		const formatting = expectAnchors(actual, []);
		for (const selector of ["#wrapper", "#inner-wrapper"])
			expect(actual.matches(formatting, selector)).toEqual([]);
		for (const selector of ["#first", "#second", "#third"]) {
			expect(actual.styles.flow(actual.id(selector)).float).toBe("none");
			expect(actual.matches(formatting, selector)[0].clear).toBeUndefined();
		}
		expectEquivalent(actual, control, [
			"#container",
			"#first",
			"#second",
			"#third",
			"#after",
		]);
	},
);

it.each(modes.flatMap((mode) => sides.map((side) => ({ mode, side }))))(
	"omits display:none $side subtrees from $mode placement and diagnostics",
	({ mode, side }) => {
		const css = `${containerCss(mode)}#first{display:none;float:${side}}#chip{float:${side}}`;
		const actual = fixture(css);
		const control = fixture(`${css}#first,#chip{float:none}`);
		const formatting = expectAnchors(actual, []);
		expect(actual.matches(formatting, "#first")).toEqual([]);
		expect(actual.matches(formatting, "#chip")).toEqual([]);
		expect(actual.styles.flow(actual.id("#first")).float).toBe(side);
		expectEquivalent(actual, control);
	},
);

it.each(
	modes.flatMap((mode) =>
		["inline", "inline-block", "inline-flex", "inline-grid"].map((display) => ({
			mode,
			display,
		})),
	),
)(
	"preserves computed $display item blockification while ignoring a $mode float",
	({ mode, display }) => {
		const css = `${containerCss(mode)}#first{display:${display};float:right}`;
		const actual = fixture(css);
		const expected =
			display === "inline-flex"
				? "flex"
				: display === "inline-grid"
					? "grid"
					: "block";
		expect(actual.styles.get(actual.id("#first")).display).toBe(expected);
		expect(
			resolvedStyleValue(actual.tree, actual.id("#first"), "display"),
		).toBe(expected);
		expect(actual.styles.flow(actual.id("#first")).float).toBe("right");
		expectAnchors(actual, []);
		expectEquivalent(
			actual,
			fixture(`${css}#first{display:${expected};float:none}`),
		);
	},
);

it.each(modes)(
	"keeps none unchanged under %s order, alignment, gaps and margins",
	(mode) => {
		const actual = fixture(`${containerCss(mode)}.item{float:none}`);
		expectAnchors(actual, []);
		expectEquivalent(actual, fixture(containerCss(mode)));
		const formatting = buildFormattingTree(actual.tree);
		const container = actual.matches(formatting, "#container")[0];
		expect(container.orderModifiedChildren).toEqual(
			["#second", "#third", "#first"].map(
				(selector) => actual.matches(formatting, selector)[0].id,
			),
		);
	},
);

it.each([false, true])(
	"keeps ignored float geometry stable in standards=%s",
	(standards) => {
		const actual = fixture(
			`${containerCss("flex")}.item{float:left}`,
			items,
			standards,
		);
		expectAnchors(actual, []);
		expectEquivalent(actual, fixture(containerCss("flex"), items, standards));
	},
);

it.each(modes)(
	"rebuilds anchors and prepared ownership when a %s container becomes ordinary flow",
	(mode) => {
		const css = `${containerCss(mode)}.item{float:right}`;
		const actual = fixture(css);
		const original = expectAnchors(actual, []);
		const prepared = prepareDocumentRaster(actual.tree);
		actual.tree.setAttribute(actual.id("#container"), "style", "display:block");
		expect(() => prepared.rasterize()).toThrow(/stale/);
		expectAnchors(actual, ["#first", "#second", "#third"]);
		expect(
			original.nodes.filter((node) => node.floatSide !== undefined),
		).toEqual([]);
		expectEquivalent(actual, fixture(`${css}#container{display:block}`));
		actual.tree.removeAttribute(actual.id("#container"), "style");
		expectAnchors(actual, []);
		expectEquivalent(actual, fixture(`${css}.item{float:none}`));
	},
);

it.each(modes)(
	"reclassifies a moved %s item as a real float and back",
	(mode) => {
		const children = items + '<div id="holder"></div>';
		const css = `${containerCss(mode)}.item{float:left}#holder{width:44px;height:34px;display:block;flex:none}`;
		const actual = fixture(css, children);
		expectAnchors(actual, []);
		const prepared = prepareDocumentRaster(actual.tree);
		actual.tree.append(actual.id("#holder"), actual.id("#first"));
		expect(() => prepared.rasterize()).toThrow(/stale/);
		const formatting = expectAnchors(actual, ["#first"]);
		expect(
			actual.matches(formatting, "#first")[0][
				mode === "flex" ? "flexItem" : "gridItem"
			],
		).toBeUndefined();
		const nestedControl = fixture(`${css}#second,#third{float:none}`, children);
		nestedControl.tree.append(
			nestedControl.id("#holder"),
			nestedControl.id("#first"),
		);
		for (const test of [actual, nestedControl]) {
			expectErrorCode(() => layoutDocument(test.tree), "unsupported");
			expect(() => layoutDocument(test.tree)).toThrow(
				"Float content requires coordinated page layout",
			);
		}
		actual.tree.append(actual.id("#container"), actual.id("#first"));
		expectAnchors(actual, []);
		const control = fixture(`${css}.item{float:none}`, children);
		control.tree.append(control.id("#container"), control.id("#first"));
		expectEquivalent(actual, control);
	},
);

it("reclassifies boxless wrappers without transferring their computed float to descendants", () => {
	const children =
		'<div id="wrapper"><div id="first" class="chip"></div><div id="second" class="chip"></div></div><div id="third" class="chip"></div>';
	const css = "#wrapper{display:contents;float:right;width:32px;height:20px}";
	const actual = fixture(css, children);
	expectAnchors(actual, []);
	const prepared = prepareDocumentRaster(actual.tree);
	actual.tree.setAttribute(actual.id("#wrapper"), "style", "display:block");
	expect(() => prepared.rasterize()).toThrow(/stale/);
	expectAnchors(actual, ["#wrapper"]);
	expect(actual.styles.flow(actual.id("#first")).float).toBe("none");
	expectEquivalent(actual, fixture(`${css}#wrapper{display:block}`, children), [
		"#container",
		"#wrapper",
		"#first",
		"#second",
		"#third",
		"#after",
	]);
	actual.tree.removeAttribute(actual.id("#wrapper"), "style");
	expectAnchors(actual, []);
	expectEquivalent(actual, fixture(`${css}#wrapper{float:none}`, children), [
		"#container",
		"#first",
		"#second",
		"#third",
		"#after",
	]);
});

it.each(modes)(
	"invalidates ignored %s float style changes without changing current geometry",
	(mode) => {
		const css = `${containerCss(mode)}#first{float:var(--side,left)}`;
		const actual = fixture(css);
		const before = actual.rectangle("#first");
		for (const side of sides) {
			const prepared = prepareDocumentRaster(actual.tree);
			actual.tree.setAttribute(actual.id("#first"), "style", `--side:${side}`);
			expect(() => prepared.rasterize()).toThrow(/stale/);
			expect(actual.styles.flow(actual.id("#first")).float).toBe(side);
			expectAnchors(actual, []);
			expect(actual.rectangle("#first")).toEqual(before);
		}
		actual.tree.setTextContent(
			actual.id("#sheet"),
			`${baseCss}#first{float:left}`,
		);
		expectAnchors(actual, ["#first"]);
		expectEquivalent(actual, fixture("#first{float:left}"));
	},
);

it.each([
	{ mode: "flex", position: "absolute" },
	{ mode: "flex", position: "fixed" },
	{ mode: "grid", position: "fixed" },
] as const)(
	"keeps $position children genuinely positioned rather than ignored $mode floats",
	({ mode, position }) => {
		const css = `${containerCss(mode)}#container{position:relative}#first{position:${position};left:4px;top:3px;float:right;z-index:2}`;
		const actual = fixture(css);
		const formatting = expectAnchors(actual, []);
		expect(actual.styles.flow(actual.id("#first")).float).toBe("none");
		expect(actual.matches(formatting, "#first")[0].position).toBe(position);
		expect(
			actual.matches(formatting, "#first")[0][
				mode === "flex" ? "flexItem" : "gridItem"
			],
		).toBeUndefined();
		expectEquivalent(actual, fixture(`${css}#first{float:none}`));
	},
);

it("does not suppress the existing absolute Grid-area coordination guard", () => {
	const css = `${containerCss("grid")}#container{position:relative}#first{position:absolute;left:4px;top:3px;float:right;z-index:2}`;
	const actual = fixture(css);
	const control = fixture(`${css}#first{float:none}`);
	const formatting = expectAnchors(actual, []);
	expect(actual.styles.flow(actual.id("#first")).float).toBe("none");
	expect(actual.matches(formatting, "#first")[0].position).toBe("absolute");
	expect(formatting.issues).toEqual(buildFormattingTree(control.tree).issues);
	for (const test of [actual, control]) {
		expectErrorCode(() => layoutDocument(test.tree), "unsupported");
		expect(() => layoutDocument(test.tree)).toThrow(
			"Positioned Grid boxes require Grid-area coordination",
		);
	}
});

it.each(["inline-start", "inline-end"])(
	"does not admit an actual unsupported logical float:%s",
	(side) => {
		const actual = fixture(`#first{float:${side}}`);
		expectAnchors(actual, ["#first"]);
		expect(actual.styles.flow(actual.id("#first")).float).toBe(side);
		expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
		actual.tree.setAttribute(actual.id("#container"), "style", "display:flex");
		expectAnchors(actual, []);
		expectEquivalent(
			actual,
			fixture(`#container{display:flex}#first{float:none}`),
		);
	},
);

it.each(modes)(
	"retains unsupported logical descendant floats inside %s items",
	(mode) => {
		const actual = fixture(
			`${containerCss(mode)}.item{float:right}#chip{float:inline-start}`,
		);
		expectAnchors(actual, ["#chip"]);
		expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
		actual.tree.setAttribute(actual.id("#chip"), "style", "float:left");
		expectAnchors(actual, ["#chip"]);
		const control = fixture(`${containerCss(mode)}#chip{float:left}`);
		for (const test of [actual, control]) {
			expectErrorCode(() => layoutDocument(test.tree), "unsupported");
			expect(() => layoutDocument(test.tree)).toThrow(
				"Float content requires coordinated page layout",
			);
		}
	},
);

it.each([
	{ css: "#first{overflow:auto}", issue: "overflow-layout-not-supported" },
	{
		css: "#first{position:sticky;overflow:hidden}",
		issue: "overflow-layout-not-supported",
	},
	{ css: "#first{display:table}", issue: "table-item-layout-not-supported" },
	{
		css: "#container{justify-items:center}",
		issue: "css:unimplemented-css-property",
	},
])(
	"retains independent $issue for otherwise ignored item floats",
	({ css, issue }) => {
		for (const mode of modes) {
			const actual = fixture(`${containerCss(mode)}.item{float:right}${css}`);
			const control = fixture(`${containerCss(mode)}${css}`);
			const formatting = expectAnchors(actual, []);
			expect(formatting.issues[issue]).toBeGreaterThan(0);
			expect(formatting.issues).toEqual(
				buildFormattingTree(control.tree).issues,
			);
			expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
			expectErrorCode(() => layoutDocument(control.tree), "unsupported");
		}
	},
);

it.each(["left", "right"])(
	"preserves actual %s float and clear ownership in ordinary flow",
	(side) => {
		const actual = fixture(
			`.item{margin:0}#first{float:${side}}#second{clear:both}`,
		);
		const formatting = expectAnchors(actual, ["#first"]);
		expect(actual.matches(formatting, "#second")[0].clear).toBe("both");
		expect(formatting.issues["clear-layout-not-supported"]).toBeGreaterThan(0);
		expect(actual.rectangle("#second").top).toBeGreaterThanOrEqual(
			actual.rectangle("#first").bottom,
		);
		expect(actual.rectangle("#first").width).toBe(26);
	},
);

it.each(modes)(
	"preserves layout, formatting, raster and hit work limits for ignored %s floats",
	(mode) => {
		const actual = fixture(`${containerCss(mode)}.item{float:inline-end}`);
		expectErrorCode(
			() => buildFormattingTree(actual.tree, { maxWork: 1 }),
			"resource-limit",
		);
		expectErrorCode(
			() => layoutDocument(actual.tree, { maxWork: 1 }),
			"resource-limit",
		);
		expectErrorCode(
			() => rasterizeDocument(actual.tree, { maxWork: 1 }),
			"resource-limit",
		);
		const hits = new DocumentHitTesting(actual.tree, { maxWork: 1 });
		try {
			expectErrorCode(() => hits.elementFromPoint(6, 6), "resource-limit");
		} finally {
			hits.close();
		}
		expectEquivalent(actual, fixture(containerCss(mode)));
	},
);

it("does not mutate source, references or revisions and releases prepared ownership on close", () => {
	const actual = fixture(`${containerCss("grid")}.item{float:left}`);
	const source = serializeHtml(actual.tree, actual.tree.root);
	const revision = actual.tree.revision;
	const reference = actual.tree.reference(actual.id("#first"));
	const prepared = prepareDocumentRaster(actual.tree);
	expectAnchors(actual, []);
	expectEquivalent(actual, fixture(containerCss("grid")));
	expect(serializeHtml(actual.tree, actual.tree.root)).toBe(source);
	expect(actual.tree.revision).toBe(revision);
	expect(actual.tree.reference(actual.id("#first"))).toBe(reference);
	actual.tree.close();
	expect(() => prepared.rasterize()).toThrow();
	expect(actual.tree.nodeCount).toBe(0);
});
