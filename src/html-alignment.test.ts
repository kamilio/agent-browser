import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import {
	htmlTextAlignment,
	supportsTextAlignmentHint,
} from "./html-alignment.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const tags = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	content = '<p id="target" align="center"><span id="child">AA</span></p>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body,p,h1,h2,h3,h4,h5,h6{margin:0;padding:0;font-size:8px;font-weight:400;line-height:8px}main{width:80px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/html-alignment",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const styles = documentStyles(tree);
	styles.setViewport(96, 64);
	const id = (selector = "#target") => {
		const target = queries.querySelector(selector);
		if (target === null) throw new Error(`Missing fixture ${selector}`);
		return target;
	};
	return { tree, queries, styles, id };
}

it.each(
	tags.flatMap((tag) =>
		["left", "center", "right"].flatMap((value) =>
			[value, value.toUpperCase()].map((raw) => ({ tag, value, raw })),
		),
	),
)(
	"applies $tag align=$raw as inherited text alignment",
	({ tag, value, raw }) => {
		const { tree, styles, id } = fixture(
			`<${tag} id="target" align="${raw}"><span id="child">AA</span></${tag}>`,
		);
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		for (const target of [id(), id("#child")]) {
			const text = styles.text(target);
			expect(text["text-align"]).toBe(value);
			expect(styles.text(target)).toBe(text);
			expect(styles.legacyChildAlignment(target)).toBeUndefined();
		}
		expect(buildFormattingTree(tree).issues).toEqual({});
		const glyphs = layoutDocument(tree).contexts.flatMap(
			(context) => context.glyphs,
		);
		expect(glyphs.map((glyph) => glyph.x)).toEqual(
			value === "left" ? [0, 6] : value === "center" ? [34, 40] : [68, 74],
		);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	},
);

it.each([
	["*{text-align:left}", "left"],
	["p{text-align:right}", "right"],
	["#target{text-align:left!important}", "left"],
	["#target{text-align:initial}", "start"],
	["#target{text-align:inherit}", "right"],
	["#target{text-align:unset}", "right"],
	["#target{text-align:revert}", "right"],
	["#target{text-align:var(--missing)}", "right"],
	["#target{--value:invalid;text-align:var(--value)}", "right"],
	["#target{text-align:var(--missing,left)}", "left"],
	["#target{--value:initial;text-align:var(--value,left)}", "left"],
	["#target{text-align:invalid}", "center"],
])("honors author cascade %s", (css, expected) => {
	const { styles, id } = fixture(undefined, `main{text-align:right}${css}`);
	expect(styles.text(id())["text-align"]).toBe(expected);
	expect(styles.text(id("#child"))["text-align"]).toBe(expected);
});

it("honors inline styles and important rules before the attribute hint", () => {
	const { tree, styles, id } = fixture(
		'<p id="target" align="center" style="text-align:right">AA</p>',
		"#target{text-align:left!important}",
	);
	expect(styles.text(id())["text-align"]).toBe("left");
	tree.setAttribute(id(), "style", "text-align:right!important");
	expect(styles.text(id())["text-align"]).toBe("right");
});

it("updates descendants and geometry after changing or removing the hint", () => {
	const { tree, styles, id } = fixture();
	const geometry = documentGeometry(tree);
	const before = styles.text(id("#child"));
	expect(geometry.getBoundingClientRect(id("#child")).x).toBe(34);
	tree.setAttribute(id(), "align", "right");
	expect(styles.text(id("#child"))).not.toBe(before);
	expect(styles.text(id("#child"))["text-align"]).toBe("right");
	expect(geometry.getBoundingClientRect(id("#child")).x).toBe(68);
	tree.removeAttribute(id(), "align");
	expect(styles.text(id("#child"))["text-align"]).toBe("start");
	expect(geometry.getBoundingClientRect(id("#child")).x).toBe(0);
});

it("restores a hint after removing author CSS and tracks inherited variables", () => {
	const { tree, styles, id } = fixture(
		undefined,
		".override{text-align:var(--alignment,left)}",
	);
	tree.setAttribute(id(), "class", "override");
	expect(styles.text(id("#child"))["text-align"]).toBe("left");
	tree.setAttribute(id("#host"), "style", "--alignment:right");
	expect(styles.text(id("#child"))["text-align"]).toBe("right");
	tree.removeAttribute(id(), "class");
	expect(styles.text(id("#child"))["text-align"]).toBe("center");
});

it("does not retain a hint inherited from a previous parent", () => {
	const { tree, styles, id } = fixture();
	tree.append(id("#host"), id("#child"));
	expect(styles.text(id("#child"))["text-align"]).toBe("start");
	tree.append(id(), id("#child"));
	expect(styles.text(id("#child"))["text-align"]).toBe("center");
});

it.each(tags)("does not center fixed-width block descendants of %s", (tag) => {
	const { tree, styles, id } = fixture(
		`<${tag} id="target" align="center"></${tag}>`,
	);
	const child = tree.createElement("section", {
		style: "width:20px;height:8px",
	});
	tree.append(id(), child);
	expect(styles.text(child)["text-align"]).toBe("center");
	expect(styles.legacyChildAlignment(child)).toBeUndefined();
	expect(documentGeometry(tree).getBoundingClientRect(child)).toMatchObject({
		x: 0,
		y: 0,
		width: 20,
		height: 8,
	});
});

it("excludes an applicable alignment hint from ancestor legacy positioning", () => {
	const { tree, styles, id } = fixture(
		'<center><h3 id="target" align="center" style="width:40px"><section id="child" style="width:20px;height:8px"></section></h3></center>',
	);
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(id()).x).toBe(0);
	expect(geometry.getBoundingClientRect(id("#child")).x).toBe(0);
	expect(styles.legacyChildAlignment(id())).toBeUndefined();
});

it.each(["left", "center", "right", "RIGHT"])(
	"retains the %s hint boundary when author CSS changes text alignment",
	(value) => {
		const { tree, id } = fixture(
			`<center><h3 id="target" align="${value}" style="width:40px;text-align:left"><span id="child">AA</span></h3></center>`,
		);
		expect(documentGeometry(tree).getBoundingClientRect(id()).x).toBe(0);
		expect(documentGeometry(tree).getBoundingClientRect(id("#child")).x).toBe(
			0,
		);
	},
);

it("updates legacy positioning when a hint is removed or becomes inapplicable", () => {
	const { tree, id } = fixture(
		'<center><h3 id="target" align="center" style="width:40px">AA</h3></center>',
	);
	const geometry = documentGeometry(tree);
	expect(geometry.getBoundingClientRect(id()).x).toBe(0);
	tree.setAttribute(id(), "align", "middle");
	expect(geometry.getBoundingClientRect(id()).x).toBe(20);
	tree.setAttribute(id(), "align", "left");
	expect(geometry.getBoundingClientRect(id()).x).toBe(0);
	tree.removeAttribute(id(), "align");
	expect(geometry.getBoundingClientRect(id()).x).toBe(20);
});

it("still honors auto margins on an element with an alignment hint", () => {
	const { tree, id } = fixture(
		'<center><h3 id="target" align="center" style="width:40px;margin-left:auto;margin-right:auto">AA</h3></center>',
	);
	expect(documentGeometry(tree).getBoundingClientRect(id()).x).toBe(20);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not install HTML hints on foreign elements in %s",
	(namespace) => {
		const { tree, styles, id } = fixture("");
		for (const tag of tags) {
			const child = tree.createParserElement(
				tag,
				{ align: "center" },
				namespace,
			);
			tree.append(id("#host"), child);
			expect(styles.text(child)["text-align"]).toBe("start");
			expect(styles.legacyChildAlignment(child)).toBeUndefined();
		}
	},
);

it("closes cached text, geometry, and selector owners with the document", () => {
	const { tree, styles, queries, id } = fixture();
	const target = id();
	const geometry = documentGeometry(tree);
	geometry.getBoundingClientRect(target);
	expect(styles.text(target)["text-align"]).toBe("center");
	tree.close();
	expect(tree.nodeCount).toBe(0);
	expect(queries.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
	expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
	expect(() => styles.text(target)).toThrow(/closed/i);
});

it.each([
	"",
	"middle",
	"start",
	"end",
	" center",
	"center ",
	"center\n",
	"left\r",
	"\tcenter",
	"center right",
	"center!important",
	"inherit",
	"unset",
	"initial",
	"revert",
	"var(--alignment)",
	"\u00a0center",
	"ｃｅｎｔｅｒ",
])("leaves unmatched paragraph alignment %j inert", (value) => {
	const { tree, styles, id } = fixture(undefined, "main{text-align:right}");
	tree.setAttribute(id(), "align", value);
	expect(htmlTextAlignment(tree.get(id()))).toBeUndefined();
	expect(supportsTextAlignmentHint(tree.get(id()))).toBe(true);
	expect(styles.text(id())["text-align"]).toBe("right");
	expect(buildFormattingTree(tree).issues).toEqual({});
});

it.each(tags)("keeps unimplemented %s justification explicit", (tag) => {
	const { tree, id } = fixture(
		`<${tag} id="target" align="JuStIfY">AA</${tag}>`,
	);
	expect(htmlTextAlignment(tree.get(id()))).toBe("justify");
	expect(supportsTextAlignmentHint(tree.get(id()))).toBe(false);
	expect(buildFormattingTree(tree).issues).toHaveProperty(
		"html-presentation-hint-not-supported",
	);
	expect(() => layoutDocument(tree)).toThrow(/supported formatting profile/);
});

it.each(["div", "section", "center", "table", "td", "th", "img", "input"])(
	"does not reinterpret %s alignment as a paragraph hint",
	(tag) => {
		const { tree, id } = fixture("");
		const child = tree.createElement(tag, { align: "center" });
		tree.append(id("#host"), child);
		expect(htmlTextAlignment(tree.get(child))).toBeUndefined();
		expect(supportsTextAlignmentHint(tree.get(child))).toBe(false);
		expect(buildFormattingTree(tree).issues).toHaveProperty(
			"html-presentation-hint-not-supported",
		);
	},
);

it("accepts the bounded inert attribute without normalizing source", () => {
	const { tree, styles, id } = fixture();
	const value = "x".repeat(4096);
	tree.setAttribute(id(), "align", value);
	expect(styles.text(id())["text-align"]).toBe("start");
	expect(tree.get(id()).attributes.align).toBe(value);
});

it("rejects oversized alignment before computing an unbounded hint", () => {
	const { tree, styles, id } = fixture();
	tree.setAttribute(id(), "align", "x".repeat(4097));
	expect(() => styles.text(id())).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});
