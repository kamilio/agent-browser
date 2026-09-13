import { expect, it } from "vitest";
import { controlChecked } from "./controls.js";
import {
	type CssParseBudget,
	cssMediaMatches,
	parseCssDeclarations,
	parseCssRules,
} from "./css-parser.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { renderSnapshot, snapshotDocument } from "./snapshot.js";
import { DocumentStyles, documentStyles } from "./styles.js";

function fixture(
	css: string,
	html = '<div id=target class="box">Visible text</div>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>${css}</style><body>${html}`,
		"https://example.com/page",
	);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	const id = (selector: string) => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing ${selector}`);
		return target;
	};
	return { tree, styles, queries, id, actions: new DocumentInteractions(tree) };
}

it.each([
	["div { display:none } .box { display:block }", true],
	["#target {display:none} .box {display:block}", false],
	[".box {display:none} .box {display:block}", true],
	["#target {display:block} .box {display:none !important}", false],
	["div {display:none!important; display:block}", false],
	[":where(#target) {display:none} div {display:block}", true],
	[":is(#missing, .box) {display:none} .box {display:block}", false],
	["#missing, .box {display:none} div.box {display:block}", true],
])("cascades author selectors and importance: %s", (css, visible) => {
	const { styles, id } = fixture(css);
	expect(styles.get(id("#target")).visible).toBe(visible);
});

it("gives inline styles appropriate precedence without defeating stylesheet importance", () => {
	const { tree, styles, id } = fixture(
		"#target {display:none!important}",
		'<div id=target style="display:block">text</div>',
	);
	expect(styles.get(id("#target")).visible).toBe(false);
	tree.setAttribute(id("#target"), "style", "display:block!important");
	expect(styles.get(id("#target")).visible).toBe(true);
});

it("excludes display:none subtrees even if descendants declare display:block", () => {
	const { tree, styles, id } = fixture(
		"#outer{display:none} #inner{display:block}",
		"<div id=outer><button id=inner>Private hidden text</button></div><p>Shown</p>",
	);
	expect(styles.get(id("#inner"))).toMatchObject({
		display: "block",
		displayed: false,
		visible: false,
	});
	const text = renderSnapshot(snapshotDocument(tree));
	expect(text).not.toContain("Private hidden text");
	expect(text).toContain("Shown");
});

it("allows visibility:visible descendants through a visibility:hidden ancestor", () => {
	const { tree, styles, id } = fixture(
		"#outer{visibility:hidden} #inner{visibility:visible}",
		"<div id=outer>Hidden text<button id=inner>Shown button</button><span>Also hidden</span></div>",
	);
	expect(styles.get(id("#outer"))).toMatchObject({
		displayed: true,
		visible: false,
	});
	expect(styles.get(id("#inner")).visible).toBe(true);
	const text = renderSnapshot(snapshotDocument(tree));
	expect(text).toContain("Shown button");
	expect(text).not.toContain("Hidden text");
	expect(text).not.toContain("Also hidden");
});

it("resolves inherit, initial, unset, revert and all for supported properties", () => {
	const { tree, styles, id } = fixture(
		"#outer{visibility:hidden} #target{all:initial; display:inherit}",
		"<div id=outer><p id=target>text</p></div>",
	);
	expect(styles.get(id("#target"))).toMatchObject({
		display: "block",
		visibility: "visible",
	});
	tree.setAttribute(id("#target"), "style", "all:unset");
	expect(styles.get(id("#target"))).toMatchObject({
		display: "inline",
		visibility: "hidden",
	});
	tree.setAttribute(id("#target"), "style", "all:revert");
	expect(styles.get(id("#target"))).toMatchObject({
		display: "block",
		visibility: "hidden",
	});
});

it("uses the most specific matching list branch and handles nth/of specificity", () => {
	const { queries, id } = fixture(
		"",
		"<main><p id=target class=box>text</p></main>",
	);
	expect(
		queries.matchingSpecificities("#missing, p.box").get(id("#target")),
	).toEqual([0, 1, 1]);
	expect(
		queries.matchingSpecificities(":is(#missing, .box)").get(id("#target")),
	).toEqual([1, 0, 0]);
	expect(
		queries.matchingSpecificities(":where(#target)").get(id("#target")),
	).toEqual([0, 0, 0]);
	expect(
		queries
			.matchingSpecificities("p:nth-child(1 of #target)")
			.get(id("#target")),
	).toEqual([1, 1, 1]);
	expect(() => queries.matchingSpecificities("*", 1)).toThrow("work limit");
	expect(() => queries.matchingSpecificities("*", 0)).toThrow("Invalid");
});

it("does not count the implicit scope of a relative has selector", () => {
	const { queries, id } = fixture(
		"",
		"<div id=parent><p class=child>text</p></div>",
	);
	expect(
		queries.matchingSpecificities("div:has(> p)").get(id("#parent")),
	).toEqual([0, 0, 2]);
	expect(
		queries
			.matchingSpecificities("div:has(.child, #missing)")
			.get(id("#parent")),
	).toEqual([1, 0, 1]);
});

it("reevaluates embedded styles, inline attributes, checked state and focus state", () => {
	const { tree, styles, id, actions } = fixture(
		"input:checked + p {display:none} input:focus {visibility:hidden}",
		"<input type=checkbox id=check><p id=target>text</p>",
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	tree.setControl(id("#check"), { checked: true });
	expect(styles.get(id("#target")).visible).toBe(false);
	const style = id("style");
	const text = tree.get(style).children[0];
	tree.setData(text, "#target {display:block}");
	expect(styles.get(id("#target")).visible).toBe(true);
	tree.setData(text, "input:focus {visibility:hidden}");
	expect(actions.focus.focus(tree.reference(id("#check")))).toBeNull();
	expect(actions.focus.active()).toBeNull();
});

it("keeps CSS computed values cached through text-value edits but not relevant mutations", () => {
	const { tree, styles, id, actions } = fixture(
		"input{display:block}",
		"<input id=target>",
	);
	actions.focus.focus(tree.reference(id("#target")));
	const before = styles.get(id("#target"));
	actions.keyboard.type("typed");
	expect(styles.get(id("#target"))).toBe(before);
	tree.setAttribute(id("#target"), "style", "display:none");
	expect(styles.get(id("#target")).visible).toBe(false);
});

it("blocks hidden actions, skips hidden tab stops and still permits label forwarding", () => {
	const { tree, id, actions } = fixture(
		".hidden{display:none}",
		"<input id=hidden class=hidden><input id=shown><input id=check type=checkbox class=hidden><label for=check id=label>Toggle</label>",
	);
	expect(() => actions.fill(tree.reference(id("#hidden")), "bad")).toThrow(
		"hidden by CSS",
	);
	expect(actions.focus.move()).toBe(id("#shown"));
	actions.click(tree.reference(id("#label")));
	expect(controlChecked(tree, id("#check"))).toBe(true);
	expect(actions.focus.active()).toBe(id("#shown"));
});

it("applies width/height media rules and invalidates presentation on resize", () => {
	const { tree, styles, id } = fixture(
		"@media screen and (max-width:600px){#target{display:none}} @media print{body{display:none}}",
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	const revision = tree.revision;
	styles.setViewport(390, 844);
	expect(tree.revision).toBeGreaterThan(revision);
	expect(styles.get(id("#target")).visible).toBe(false);
	styles.setViewport(1200, 800);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(() => styles.setViewport(0, 800)).toThrow("Invalid");
});

it.each([5000, 8192])(
	"cascades a bounded %s-rule utility stylesheet with default limits",
	(count) => {
		const css =
			Array.from(
				{ length: count - 1 },
				(_, index) => `#unused${index}{display:block}`,
			).join("") + "#target{display:none}";
		const { tree, styles, id } = fixture(css);
		try {
			expect(css.length).toBeLessThan(styles.limits.maxCodeUnits);
			expect(styles.get(id("#target")).displayed).toBe(false);
			expect(styles.metrics()).toMatchObject({
				rules: count,
				declarations: count,
				codeUnits: css.length,
				issues: {},
			});
			expect(styles.metrics().work).toBeLessThan(styles.limits.maxWork);
			const builds = styles.metrics().cascadeBuilds;
			expect(styles.get(id("#target")).displayed).toBe(false);
			expect(styles.metrics().cascadeBuilds).toBe(builds);
		} finally {
			tree.close();
		}
	},
);

it("still rejects utility stylesheets beyond the default rule ceiling", () => {
	const { tree, styles } = fixture("#target{display:none}".repeat(8193));
	try {
		expect(() => styles.metrics()).toThrow("CSS rule limit exceeded");
		expect(() => styles.metrics()).toThrow("CSS rule limit exceeded");
	} finally {
		tree.close();
	}
});

it("honors document order, disabled sheets and changed links without stale CSS", () => {
	const { tree, styles, id } = fixture(
		"#target{display:block}",
		"<link id=sheet rel=stylesheet href=/sheet.css><p id=target>text</p>",
	);
	styles.setExternalSheet(
		id("#sheet"),
		"https://example.com/sheet.css",
		"#target{display:none}",
	);
	expect(styles.get(id("#target")).visible).toBe(false);
	tree.setAttribute(id("#sheet"), "disabled", "");
	expect(styles.get(id("#target")).visible).toBe(true);
	tree.removeAttribute(id("#sheet"), "disabled");
	tree.setAttribute(id("#sheet"), "href", "/other.css");
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.metrics().issues["changed-stylesheet-needs-reload"]).toBe(1);
});

it("reports unsupported selectors, values, imports and properties without executing them", () => {
	const { styles, id } = fixture(
		'@import url("/never.css"); #target{filter:blur(1px);display:var(--unknown)} #target:user-valid{display:none} @unknown-native(display:grid){#target{display:none}}',
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#target")).display).toBe("inline");
	expect(styles.metrics()).toMatchObject({
		partial: true,
		layout: false,
		issues: {
			"css-import-not-loaded": 1,
			"unimplemented-css-property": 1,
			"unimplemented-or-invalid-css-selector": 1,
			"unimplemented-css-at-rule": 1,
		},
	});
});

it.each([
	{ maxCodeUnits: 4 },
	{ maxRules: 1 },
	{ maxDeclarations: 1 },
	{ maxWork: 2 },
])("enforces style budgets %j", (limits) => {
	const { tree } = fixture("p{display:none} div{visibility:hidden}");
	const styles = new DocumentStyles(tree, limits);
	expect(() => styles.metrics()).toThrow("limit");
	expect(() => styles.metrics()).toThrow("limit");
	tree.close();
	expect(() => styles.metrics()).toThrow("closed");
});

it("closes style instances with their document and does not retain an external sheet", () => {
	const { tree, styles } = fixture("div{display:none}");
	styles.metrics();
	tree.close();
	expect(() => styles.metrics()).toThrow("closed");
});

it.each([
	["screen and (min-width: 800px)", true],
	["print", false],
	["not print", true],
	["(max-width:600px), screen and (min-height:700px)", true],
	["not (unknown: yes)", false],
	["screen and", false],
	["(min-width:800)", false],
	["only (min-width:800px)", false],
	["only screen and (min-width:800px)", true],
	["not\tprint", true],
	["not\tscreen", false],
	["only\t(min-width:800px)", false],
])("evaluates bounded screen media: %s", (media, expected) => {
	expect(cssMediaMatches(media, { width: 1280, height: 720 }, () => {})).toBe(
		expected,
	);
});

it("scans CSS strings/comments/blocks without turning embedded punctuation into declarations", () => {
	const budget: CssParseBudget = {
		rules: 0,
		declarations: 0,
		maxRules: 10,
		maxDeclarations: 20,
	};
	const issues: string[] = [];
	const rules = parseCssRules(
		'p { content:"}; display:none"; /* } */ display:block; visibility:hidden!important } @media screen { p { visibility:visible } }',
		budget,
		(code) => issues.push(code),
	);
	expect(rules).toHaveLength(2);
	expect(rules[0].declarations).toEqual([
		{ property: "display", value: "block", important: false },
		{ property: "visibility", value: "hidden", important: true },
	]);
	expect(rules[1].media).toEqual(["screen"]);
	expect(
		parseCssDeclarations(
			"dis/**/play:none; display: n/**/one; display: none !/**/important",
			budget,
			() => {},
		),
	).toEqual([{ property: "display", value: "none", important: true }]);
});

it("applies a late branch in a 120-branch stylesheet selector list without weakening full matching", () => {
	const selector = Array.from(
		{ length: 120 },
		(_value, index) => `.group-${index} > p.leaf`,
	).join(", ");
	const { tree, styles, queries, id } = fixture(
		`${selector}{display:none} p.leaf{display:block}`,
		"<main class=group-119><p id=target class=leaf>Hidden</p><section><p id=nested class=leaf>Nested</p></section><span id=wrong-tag class=leaf>Span</span></main><p id=outside class=leaf>Outside</p>",
	);
	try {
		for (let repeat = 0; repeat < 2; repeat++) {
			expect(styles.get(id("#target"))).toMatchObject({
				display: "none",
				visible: false,
			});
			for (const unaffected of ["#nested", "#wrong-tag", "#outside"])
				expect(styles.get(id(unaffected)).visible).toBe(true);
			expect(() => queries.querySelectorAll(selector)).toThrow(
				"component limit",
			);
		}
		tree.setAttribute(id("main"), "class", "unmatched");
		expect(styles.get(id("#target"))).toMatchObject({
			display: "block",
			visible: true,
		});
		tree.setAttribute(id("main"), "class", "group-119");
		expect(styles.get(id("#target")).visible).toBe(false);
		expect(
			styles.metrics().issues["unimplemented-or-invalid-css-selector"] ?? 0,
		).toBe(0);
	} finally {
		tree.close();
	}
});

it.each([":unsupported-native-pseudo", "::before"])(
	"ignores an entire over-aggregate stylesheet list with unsupported suffix %s",
	(suffix) => {
		const selector = Array.from(
			{ length: 120 },
			(_value, index) => `.group-${index} > p.leaf`,
		).join(", ");
		const { tree, styles, id } = fixture(
			`${selector}, ${suffix}{display:none} p.leaf{display:block}`,
			"<main class=group-0><p id=target class=leaf>Visible</p></main>",
		);
		try {
			expect(styles.get(id("#target"))).toMatchObject({
				display: "block",
				visible: true,
			});
			expect(
				styles.metrics().issues["unimplemented-or-invalid-css-selector"],
			).toBe(1);
		} finally {
			tree.close();
		}
	},
);

it.each([
	"p",
	".box/**/.active",
	"di/**/v",
	'p[data-label="/*not trivia*/"]',
	String.raw`.a\,b, p:not(.skip, .absent)`,
])(
	"excludes leading stylesheet trivia without rewriting selector tokens: %s",
	(selector) => {
		const prefix = ` \n\t/*${"documentation ".repeat(900)}*/\n/**/ `;
		const budget: CssParseBudget = {
			rules: 0,
			declarations: 0,
			maxRules: 1,
			maxDeclarations: 1,
		};
		const issues: string[] = [];
		const rules = parseCssRules(
			`${prefix}${selector}{display:none}`,
			budget,
			(issue) => issues.push(issue),
		);
		expect(rules.map((rule) => rule.selector)).toEqual([selector]);
		expect(budget.rules).toBe(1);
		expect(budget.declarations).toBe(1);
		expect(issues).toEqual([]);
	},
);

it("loads a comment-heavy stylesheet while retaining full source-size accounting", () => {
	const prefix = `/*${"documentation ".repeat(900)}*/\n`;
	const css = `${prefix}#target{display:none}`;
	const { tree, styles, queries, id } = fixture(css);
	try {
		expect(styles.get(id("#target")).visible).toBe(false);
		expect(styles.metrics().codeUnits).toBe(css.length);
		expect(
			styles.metrics().issues["unimplemented-or-invalid-css-selector"] ?? 0,
		).toBe(0);
		expect(() => queries.querySelector(`${prefix}#target`)).toThrow(
			"Selector text limit exceeded",
		);
		const limited = new DocumentStyles(tree, { maxCodeUnits: css.length - 1 });
		expect(() => limited.metrics()).toThrow("CSS source text limit exceeded");
	} finally {
		tree.close();
	}
});

it.each([
	["long identifier", `.${"long".repeat(2048)}`],
	["interior comment", `.box/*${"interior ".repeat(1024)}*/.active`],
])(
	"retains the selector text cap after leading trivia is excluded: %s",
	(_description, selector) => {
		const { tree, styles } = fixture(`/* heading */ ${selector}{display:none}`);
		try {
			expect(() => styles.metrics()).toThrow("Selector text limit exceeded");
		} finally {
			tree.close();
		}
	},
);

it("drops leading comments inside media rules without joining interior identifier fragments", () => {
	const { tree, styles, id } = fixture(
		"@media screen { /* heading */ di/**/v{display:none} /* next */ .box/**/.active{visibility:hidden} }",
		'<div id=target class="box active">Text</div>',
	);
	try {
		expect(styles.get(id("#target"))).toMatchObject({
			display: "block",
			visibility: "hidden",
		});
		expect(
			styles.metrics().issues["unimplemented-or-invalid-css-selector"],
		).toBe(1);
	} finally {
		tree.close();
	}
});
