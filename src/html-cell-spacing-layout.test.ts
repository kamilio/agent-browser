import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { prepareDocumentRaster, rasterizeDocument } from "./document-raster.js";
import {
	htmlNamespace,
	mathmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";
import { documentElementSizes } from "./element-sizes.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { DocumentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const baseCss =
	"html,body{margin:0;font-size:8px;line-height:8px}td,th{vertical-align:top;text-align:left;background:red}.chip{display:block;width:13px;height:9px;background:blue}.wide{width:17px}.narrow{width:11px}";
const grid =
	'<table id="table"><tbody id="group"><tr id="row"><td id="first"><div id="chip" class="chip"></div></td><td id="second"><div class="chip wide"></div></td><td id="third"><div class="chip narrow"></div></td></tr><tr id="row2"><th id="lower"><div class="chip"></div></th><td><div class="chip wide"></div></td><td><div class="chip narrow"></div></td></tr></tbody></table>';
const selectors = [
	"#table",
	"#group",
	"#row",
	"#row2",
	"#first",
	"#second",
	"#third",
	"#lower",
	"#chip",
];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(markup = grid, css = "", standards = true) {
	const tree = parseHtmlDocument(
		`${standards ? "<!doctype html>" : ""}<style id="author">${css}</style><style>${baseCss}</style><main id="parent">${markup}</main>`,
		"https://fixture.invalid/cell-spacing-layout",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	styles.setViewport(180, 160);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null)
			throw new Error(`Missing cellspacing fixture ${selector}`);
		return found;
	};
	const rectangle = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	return { tree, styles, id, rectangle };
}

function hinted(value: string) {
	return grid.replace(
		'<table id="table">',
		`<table id="table" cellspacing="${value}">`,
	);
}

function expectSpacing(
	test: ReturnType<typeof fixture>,
	value: string,
	selector = "#table",
) {
	expect(test.styles.table(test.id(selector))["border-spacing"]).toBe(value);
	expect(
		resolvedStyleValue(test.tree, test.id(selector), "border-spacing"),
	).toBe(value);
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
	}
	expect(buildFormattingTree(actual.tree).issues).toEqual(
		buildFormattingTree(control.tree).issues,
	);
	expect(rasterizeDocument(actual.tree).image.pixels).toEqual(
		rasterizeDocument(control.tree).image.pixels,
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

it.each([
	{ raw: "0", spacing: 0 },
	{ raw: "-000", spacing: 0 },
	{ raw: "+3", spacing: 3 },
	{ raw: "0004", spacing: 4 },
	{ raw: " \t\n\f\r+5tail", spacing: 5 },
	{ raw: "3.75", spacing: 3 },
	{ raw: "4%", spacing: 4 },
	{ raw: "3e2", spacing: 3 },
	{ raw: "0x10", spacing: 0 },
	{ raw: "6 9", spacing: 6 },
	{ raw: "-0.7", spacing: 0 },
	{ raw: "", spacing: 2 },
	{ raw: " \t\n\f\r", spacing: 2 },
	{ raw: "-1", spacing: 2 },
	{ raw: "-0003junk", spacing: 2 },
	{ raw: "+ 3", spacing: 2 },
	{ raw: "++3", spacing: 2 },
	{ raw: "--0", spacing: 2 },
	{ raw: ".5", spacing: 2 },
	{ raw: "\u00a03", spacing: 2 },
	{ raw: "\v3", spacing: 2 },
	{ raw: "\u20033", spacing: 2 },
	{ raw: "\uff13", spacing: 2 },
	{ raw: "\u0663", spacing: 2 },
])(
	"maps the integer prefix $raw to $spacing px without a formatting guard",
	({ raw, spacing }) => {
		const actual = fixture(hinted(raw));
		const control = fixture(grid, `#table{border-spacing:${spacing}px}`);
		expectSpacing(actual, `${spacing}px ${spacing}px`);
		expect(
			buildFormattingTree(actual.tree).issues[
				"html-table-presentation-hint-not-supported"
			] ?? 0,
		).toBe(0);
		expectEquivalent(actual, control);
	},
);

it.each([false, true])(
	"preserves six-cell literal geometry and UA defaults in standards=%s",
	(standards) => {
		for (const spacing of [0, 3, 5]) {
			const actual = fixture(hinted(String(spacing)), "", standards);
			expect(actual.rectangle("#table")).toMatchObject({
				x: 0,
				y: 0,
				width: 47 + 4 * spacing,
				height: 22 + 3 * spacing,
			});
			expect(actual.rectangle("#first")).toMatchObject({
				x: spacing,
				y: spacing,
				width: 15,
				height: 11,
			});
			expect(actual.rectangle("#second")).toMatchObject({
				x: 15 + 2 * spacing,
				y: spacing,
				width: 19,
				height: 11,
			});
			expect(actual.rectangle("#third")).toMatchObject({
				x: 34 + 3 * spacing,
				y: spacing,
				width: 13,
				height: 11,
			});
			expect(actual.rectangle("#lower")).toMatchObject({
				x: spacing,
				y: 11 + 2 * spacing,
				width: 15,
				height: 11,
			});
			expect(actual.rectangle("#chip")).toMatchObject({
				x: spacing + 1,
				y: spacing + 1,
				width: 13,
				height: 9,
			});
		}
		const absent = fixture(grid, "", standards);
		expectSpacing(absent, "2px 2px");
		expect(absent.rectangle("#table")).toMatchObject({ width: 55, height: 28 });
	},
);

it.each([
	{ css: "*{border-spacing:1px 4px}", inline: "", expected: "1px 4px" },
	{ css: "table{border-spacing:3px}", inline: "", expected: "3px 3px" },
	{
		css: "#table{border-spacing:4px}table{border-spacing:3px}",
		inline: "",
		expected: "4px 4px",
	},
	{
		css: "table{border-spacing:3px}table{border-spacing:4px}",
		inline: "",
		expected: "4px 4px",
	},
	{
		css: "#table{border-spacing:3px}",
		inline: "border-spacing:4px 1px",
		expected: "4px 1px",
	},
	{
		css: "*{border-spacing:3px!important}",
		inline: "border-spacing:4px",
		expected: "3px 3px",
	},
	{
		css: "#table{border-spacing:3px!important}",
		inline: "border-spacing:4px!important",
		expected: "4px 4px",
	},
	{ css: "#table{border-spacing:initial}", inline: "", expected: "0px 0px" },
	{
		css: "#parent{border-spacing:7px 9px}#table{border-spacing:inherit}",
		inline: "",
		expected: "7px 9px",
	},
	{
		css: "#parent{border-spacing:7px 9px}#table{border-spacing:unset}",
		inline: "",
		expected: "7px 9px",
	},
	{
		css: "#parent{border-spacing:7px 9px}#table{border-spacing:revert}",
		inline: "",
		expected: "2px 2px",
	},
	{
		css: "#parent{--space:3px 1px}#table{border-spacing:var(--space)}",
		inline: "",
		expected: "3px 1px",
	},
	{
		css: "#table{border-spacing:var(--missing, 4px 1px)}",
		inline: "",
		expected: "4px 1px",
	},
	{
		css: "#parent{border-spacing:7px 9px}#table{border-spacing:var(--missing)}",
		inline: "",
		expected: "7px 9px",
	},
	{
		css: "#parent{border-spacing:7px 9px}#table{--space:red;border-spacing:var(--space)}",
		inline: "",
		expected: "7px 9px",
	},
	{ css: "#table{border:3px solid green}", inline: "", expected: "5px 5px" },
])(
	"cascades a zero-specificity hint beneath $css / $inline",
	({ css, inline, expected }) => {
		const actual = fixture(
			hinted("5").replace('id="table"', `id="table" style="${inline}"`),
			css,
		);
		const control = fixture(
			grid,
			`${css}#table{border-spacing:${expected}!important}`,
		);
		expectSpacing(actual, expected);
		expectEquivalent(actual, control);
	},
);

it.each([
	{ keyword: "initial", expected: "0px 0px" },
	{ keyword: "inherit", expected: "7px 9px" },
	{ keyword: "unset", expected: "7px 9px" },
	{ keyword: "revert", expected: "2px 2px" },
])(
	"resolves the all:$keyword shorthand without reviving the hint",
	({ keyword, expected }) => {
		const css = `#parent{border-spacing:7px 9px}#table{all:${keyword};display:table}`;
		const actual = fixture(hinted("5"), css);
		expectSpacing(actual, expected);
		expectEquivalent(
			actual,
			fixture(grid, `${css}#table{border-spacing:${expected}}`),
		);
	},
);

it.each(["separate", "collapse"])(
	"preserves independent border, padding, percentage and fixed-size rules in %s mode",
	(mode) => {
		for (const extra of [
			"",
			"#table{padding:4px;border:3px solid green}td,th{border:2px solid black}",
			"#table{width:120px;height:70px}",
			"#table{width:120px}td,th{width:33%}",
		]) {
			const css = `#table{border-collapse:${mode}}${extra}`;
			const actual = fixture(hinted("4"), css);
			const control = fixture(grid, `${css}#table{border-spacing:4px}`);
			expectSpacing(actual, "4px 4px");
			expectEquivalent(actual, control);
		}
	},
);

it("ignores spacing in collapsed used geometry while retaining its computed value", () => {
	const actual = fixture(
		hinted("7"),
		"#table{border-collapse:collapse}td,th{border:2px solid black}",
	);
	const control = fixture(
		grid,
		"#table{border-collapse:collapse;border-spacing:0}td,th{border:2px solid black}",
	);
	expectSpacing(actual, "7px 7px");
	expectEquivalent(actual, control);
});

it("discards invalid author spacing without removing existing CSS diagnostic guards", () => {
	const css =
		"#table{border-spacing:-1px;border-spacing:3%;border-spacing:1px 2px 3px}";
	const actual = fixture(hinted("5"), css);
	const control = fixture(grid, `${css}#table{border-spacing:5px}`);
	expect(actual.styles.table(actual.id("#table"))["border-spacing"]).toBe(
		"5px 5px",
	);
	expect(buildFormattingTree(actual.tree).issues).toEqual(
		buildFormattingTree(control.tree).issues,
	);
	expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
	expectErrorCode(() => layoutDocument(control.tree), "unsupported");
	actual.tree.remove(actual.id("#author"));
	expectEquivalent(actual, fixture(grid, "#table{border-spacing:5px}"));
});

it.each(["0", "3", "invalid"])(
	"keeps cellpadding and cell borders independent of cellspacing=%s",
	(value) => {
		const actual = fixture(
			hinted(value).replace("<table ", '<table cellpadding="4" '),
			"td,th{border:2px solid black}",
		);
		const spacing = value === "invalid" ? 2 : Number(value);
		const control = fixture(
			grid,
			`#table{border-spacing:${spacing}px}td,th{padding:4px!important;border:2px solid black}`,
		);
		expectSpacing(actual, `${spacing}px ${spacing}px`);
		expectEquivalent(actual, control);
		expect(actual.styles.box(actual.id("#table"))["padding-left"]).toBe("0px");
	},
);

it.each([undefined, "0", "3", "invalid"])(
	"does not borrow outer hints across nested table UA defaults, inner=%s",
	(inner) => {
		const markup =
			'<table id="outer" cellspacing="6"><tr><td id="outer-cell">' +
			grid.replace(
				'<table id="table">',
				`<table id="table"${inner === undefined ? "" : ` cellspacing="${inner}"`}>`,
			) +
			"</td></tr></table>";
		const actual = fixture(markup);
		const expected =
			inner === undefined || inner === "invalid" ? 2 : Number(inner);
		expectSpacing(actual, "6px 6px", "#outer");
		expectSpacing(actual, "6px 6px", "#outer-cell");
		expectSpacing(actual, `${expected}px ${expected}px`);
		const control = fixture(
			markup.replace(/ cellspacing="[^"]*"/g, ""),
			`#outer{border-spacing:6px}#table{border-spacing:${expected}px}`,
		);
		expectEquivalent(actual, control, ["#outer", "#outer-cell", ...selectors]);
	},
);

it.each(["thead", "tbody", "tfoot"])(
	"inherits spacing through HTML %s without turning it into padding",
	(tag) => {
		const actual = fixture(hinted("4").replaceAll("tbody", tag));
		for (const selector of ["#table", "#group", "#row", "#first", "#lower"])
			expectSpacing(actual, "4px 4px", selector);
		for (const side of ["top", "right", "bottom", "left"] as const) {
			expect(actual.styles.box(actual.id("#first"))[`padding-${side}`]).toBe(
				"1px",
			);
			expect(actual.styles.box(actual.id("#table"))[`padding-${side}`]).toBe(
				"0px",
			);
		}
		expectEquivalent(
			actual,
			fixture(grid.replaceAll("tbody", tag), "#table{border-spacing:4px}"),
		);
	},
);

it.each(["table", "block", "none"])(
	"recognizes the HTML table independently of display:%s",
	(display) => {
		const actual = fixture(
			hinted("4"),
			`#table,#group,#row,#row2,td,th{display:${display === "table" ? "block" : display}}#table{display:${display}}`,
		);
		expect(actual.styles.table(actual.id("#table"))["border-spacing"]).toBe(
			"4px 4px",
		);
		expect(
			buildFormattingTree(actual.tree).issues[
				"html-table-presentation-hint-not-supported"
			] ?? 0,
		).toBe(0);
	},
);

it.each(["table", "table-cell", "table-row-group"])(
	"does not infer HTML hint eligibility from a div displayed as %s",
	(display) => {
		const actual = fixture(
			`<div id="target" cellspacing="8" style="display:${display}"></div>`,
			"#parent{border-spacing:3px 4px}",
		);
		expect(actual.styles.table(actual.id("#target"))["border-spacing"]).toBe(
			"3px 4px",
		);
	},
);

it.each(["thead", "tbody", "tfoot", "tr", "td", "th", "col", "colgroup"])(
	"does not remove the cellspacing guard from a non-table HTML %s",
	(tag) => {
		const actual = fixture();
		const target = actual.tree.createParserElement(
			tag,
			{ cellspacing: "8" },
			htmlNamespace,
		);
		actual.tree.append(actual.id("#table"), target);
		expect(actual.styles.table(target)["border-spacing"]).toBe("2px 2px");
		expect(
			buildFormattingTree(actual.tree).issues[
				"html-table-presentation-hint-not-supported"
			],
		).toBeGreaterThan(0);
		expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
	},
);

it.each([svgNamespace, mathmlNamespace])(
	"never supplies HTML spacing to foreign table names in %s",
	(namespaceURI) => {
		const actual = fixture("", "#parent{border-spacing:3px 4px}");
		for (const tag of ["table", "tbody", "tr", "td"]) {
			const target = actual.tree.createParserElement(
				tag,
				{ cellspacing: "8", style: "display:table" },
				namespaceURI,
			);
			actual.tree.append(actual.id("#parent"), target);
			expect(actual.styles.table(target)["border-spacing"]).toBe("3px 4px");
		}
		expect(
			buildFormattingTree(actual.tree).issues["element-layout-not-supported"],
		).toBe(4);
		expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
	},
);

it.each(["rules", "frame", "background", "border"])(
	"does not remove independent %s presentation guards",
	(attribute) => {
		const actual = fixture(hinted("4"));
		actual.tree.setAttribute(actual.id("#table"), attribute, "1");
		expect(actual.styles.table(actual.id("#table"))["border-spacing"]).toBe(
			"4px 4px",
		);
		expectErrorCode(() => layoutDocument(actual.tree), "unsupported");
		actual.tree.removeAttribute(actual.id("#table"), attribute);
		expectEquivalent(actual, fixture(grid, "#table{border-spacing:4px}"));
	},
);

it("invalidates cached geometry, inherited styles and prepared rasters after hint mutations", () => {
	const actual = fixture();
	const reference = actual.tree.reference(actual.id("#table"));
	for (const raw of ["4", "0", "invalid", "3", undefined]) {
		const prepared = prepareDocumentRaster(actual.tree);
		prepared.rasterize();
		const cached = actual.styles.table(actual.id("#table"));
		expect(actual.styles.table(actual.id("#table"))).toBe(cached);
		if (raw === undefined)
			actual.tree.removeAttribute(actual.id("#table"), "cellspacing");
		else actual.tree.setAttribute(actual.id("#table"), "cellspacing", raw);
		expect(() => prepared.rasterize()).toThrow(/stale/);
		const spacing = raw === undefined || raw === "invalid" ? 2 : Number(raw);
		for (const selector of ["#table", "#group", "#row", "#first"])
			expectSpacing(actual, `${spacing}px ${spacing}px`, selector);
		expect(actual.tree.reference(actual.id("#table"))).toBe(reference);
		expectEquivalent(
			actual,
			fixture(grid, `#table{border-spacing:${spacing}px}`),
		);
	}
});

it("restores hints after inline and stylesheet overrides, including variable updates", () => {
	const actual = fixture(
		hinted("4"),
		"#table{--space:3px;border-spacing:var(--space)}",
	);
	expectSpacing(actual, "3px 3px");
	actual.tree.setAttribute(actual.id("#table"), "style", "--space:6px");
	expectSpacing(actual, "6px 6px");
	actual.tree.setAttribute(
		actual.id("#table"),
		"style",
		"border-spacing:1px 2px",
	);
	expectSpacing(actual, "1px 2px");
	actual.tree.setAttribute(actual.id("#table"), "cellspacing", "5");
	expectSpacing(actual, "1px 2px");
	actual.tree.removeAttribute(actual.id("#table"), "style");
	expectSpacing(actual, "3px 3px");
	actual.tree.remove(actual.id("#author"));
	expectSpacing(actual, "5px 5px");
	expectEquivalent(actual, fixture(grid, "#table{border-spacing:5px}"));
});

it("recomputes inherited spacing when a row moves to another table", () => {
	const actual = fixture(
		hinted("4") +
			'<table id="other" cellspacing="7"><tbody id="other-group"></tbody></table>',
	);
	const prepared = prepareDocumentRaster(actual.tree);
	expectSpacing(actual, "4px 4px", "#first");
	actual.tree.append(actual.id("#other-group"), actual.id("#row"));
	expectSpacing(actual, "7px 7px", "#first");
	expectSpacing(actual, "4px 4px", "#lower");
	expect(() => prepared.rasterize()).toThrow(/stale/);
	actual.tree.append(actual.id("#group"), actual.id("#row"));
	expectSpacing(actual, "4px 4px", "#first");
	expect(actual.rectangle("#first").width).toBe(15);
});

it.each(["", "invalid", "4"])(
	"charges raw length plus one even for %s and author-overridden hints",
	(raw) => {
		const actual = fixture(grid, "#table{border-spacing:1px!important}");
		const baseline = actual.styles.metrics().work;
		actual.tree.setAttribute(actual.id("#table"), "cellspacing", raw);
		const required = actual.styles.metrics().work;
		expect(required - baseline).toBe(raw.length + 1);
		expectSpacing(actual, "1px 1px");
		const exact = new DocumentStyles(actual.tree, { maxWork: required });
		const insufficient = new DocumentStyles(actual.tree, {
			maxWork: required - 1,
		});
		try {
			expect(exact.metrics().work).toBe(required);
			expectErrorCode(() => insufficient.metrics(), "resource-limit");
			actual.tree.removeAttribute(actual.id("#table"), "cellspacing");
			expect(insufficient.metrics().work).toBe(baseline);
		} finally {
			exact.close();
			insufficient.close();
		}
	},
);

it.each(["zeros", "invalid", "trailing"])(
	"charges long %s input once per table without an arbitrary raw-length cap",
	(kind) => {
		const short = kind === "invalid" ? "!" : "3";
		const raw =
			kind === "zeros" ? `${"0".repeat(5000)}3` : `${short}${"x".repeat(5000)}`;
		const actual = fixture(hinted(short));
		const baseline = actual.styles.metrics().work;
		actual.tree.setAttribute(actual.id("#table"), "cellspacing", raw);
		expect(actual.styles.metrics().work - baseline).toBe(5000);
		const spacing = kind === "invalid" ? 2 : 3;
		expectSpacing(actual, `${spacing}px ${spacing}px`);
		expectEquivalent(
			actual,
			fixture(grid, `#table{border-spacing:${spacing}px}`),
		);
	},
);

it.each([
	"9007199254740992",
	"999999999999999999999999999999",
	"+9007199254740992suffix",
])("does not round or suppress unsafe positive integer %s", (raw) => {
	const actual = fixture(
		hinted(raw),
		"#table{display:none;border-spacing:0!important}",
	);
	expectErrorCode(() => actual.styles.metrics(), "resource-limit");
	actual.tree.setAttribute(actual.id("#table"), "cellspacing", "3");
	expect(actual.styles.table(actual.id("#table"))["border-spacing"]).toBe(
		"0px 0px",
	);
	actual.tree.remove(actual.id("#author"));
	expectEquivalent(actual, fixture(grid, "#table{border-spacing:3px}"));
});

it("rejects negative huge integers as invalid rather than imposing positive precision failure", () => {
	const actual = fixture(hinted("-999999999999999999999999999999"));
	expectSpacing(actual, "2px 2px");
	expectEquivalent(actual, fixture());
});

it("charges raw input before attempting the precision-limited integer parse", () => {
	const actual = fixture();
	const baseline = actual.styles.metrics().work;
	actual.tree.setAttribute(
		actual.id("#table"),
		"cellspacing",
		"9".repeat(5000),
	);
	const limited = new DocumentStyles(actual.tree, { maxWork: baseline });
	try {
		expect(() => limited.metrics()).toThrow("CSS cascade work limit exceeded");
		expect(() => actual.styles.metrics()).toThrow(
			"HTML pixel length integer precision limit exceeded",
		);
	} finally {
		limited.close();
	}
});

it("counts raw UTF-16 code units on each table without charging inherited cells again", () => {
	const actual = fixture(
		grid + '<table id="other"><tr><td></td></tr></table>',
		"table{border-spacing:1px!important}",
	);
	const baseline = actual.styles.metrics().work;
	const raw = "3😀";
	actual.tree.setAttribute(actual.id("#table"), "cellspacing", raw);
	expect(actual.styles.metrics().work - baseline).toBe(raw.length + 1);
	actual.tree.setAttribute(actual.id("#other"), "cellspacing", raw);
	expect(actual.styles.metrics().work - baseline).toBe(2 * (raw.length + 1));
});

it.each([layoutValueLimits.maxAbsoluteLength + 1, Number.MAX_SAFE_INTEGER])(
	"retains used-magnitude failure and recovery for representable spacing=%s",
	(value) => {
		const actual = fixture(hinted(String(value)));
		expect(actual.styles.table(actual.id("#table"))["border-spacing"]).toBe(
			`${value}px ${value}px`,
		);
		expectErrorCode(() => actual.rectangle("#table"), "resource-limit");
		actual.tree.setAttribute(actual.id("#table"), "cellspacing", "3");
		expectEquivalent(actual, fixture(grid, "#table{border-spacing:3px}"));
	},
);

it("preserves fail-closed layout, paint and hit work bounds", () => {
	const actual = fixture(hinted("3"));
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
	expectEquivalent(actual, fixture(grid, "#table{border-spacing:3px}"));
});

it("keeps source attributes and revisions read-only and rejects closed prepared ownership", () => {
	const actual = fixture(hinted("+003tail"));
	const html = serializeHtml(actual.tree, actual.tree.root);
	const revision = actual.tree.revision;
	const prepared = prepareDocumentRaster(actual.tree);
	expectSpacing(actual, "3px 3px");
	expectEquivalent(actual, fixture(grid, "#table{border-spacing:3px}"));
	expect(actual.tree.get(actual.id("#table")).attributes.cellspacing).toBe(
		"+003tail",
	);
	expect(serializeHtml(actual.tree, actual.tree.root)).toBe(html);
	expect(actual.tree.revision).toBe(revision);
	actual.tree.close();
	expect(() => prepared.rasterize()).toThrow();
	expect(actual.tree.nodeCount).toBe(0);
});
