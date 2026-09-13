import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { borderSides } from "./css-border.js";
import { type BoxStyle, initialBoxStyle } from "./css-box.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = '<fieldset id="target"><legend id="legend">Title</legend><span id="child">Content</span></fieldset>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">#parent{font-size:20px}${css}</style><main id="parent">${content}</main>`,
		"https://fixture.invalid/fieldset-style",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture node: ${selector}`);
		return found;
	};
	const read = (property: string, selector = "#target") =>
		resolvedStyleValue(tree, id(selector), property);
	return { tree, styles, id, read };
}

function expectFieldsetDefaults(box: BoxStyle, fontSize = 20) {
	expect(box).toMatchObject({
		"margin-top": "0px",
		"margin-right": "2px",
		"margin-bottom": "0px",
		"margin-left": "2px",
		"min-width": "min-content",
	});
	for (const side of borderSides) {
		expect(box[`border-${side}-width`]).toBe("2px");
		expect(box[`border-${side}-style`]).toBe("groove");
	}
	for (const [property, factor] of [
		["padding-top", 0.35],
		["padding-right", 0.75],
		["padding-bottom", 0.625],
		["padding-left", 0.75],
	] as const) {
		expect(box[property]).toMatch(/px$/);
		expect(Number.parseFloat(box[property])).toBeCloseTo(fontSize * factor, 10);
	}
}

it("exposes fieldset UA box defaults without asking for groove geometry", () => {
	const { styles, id, read } = fixture();
	expectFieldsetDefaults(styles.box(id()));
	for (const side of borderSides)
		expect(read(`border-${side}-color`)).toBe("rgb(240, 240, 240)");
	expect(styles.metrics().layout).toBe(false);
});

it("gives legends only their own horizontal UA padding", () => {
	const { styles, id, read } = fixture("#parent{color:rgb(12,34,56)}");
	expect(styles.box(id("#legend"))).toEqual({
		...initialBoxStyle,
		"padding-right": "2px",
		"padding-left": "2px",
	});
	for (const side of borderSides)
		expect(read(`border-${side}-color`, "#legend")).toBe("rgb(12, 34, 56)");
	expect(styles.box(id("#child"))).toEqual(initialBoxStyle);
});

it.each([10, 16, 20, 32, 40])(
	"resolves fieldset em padding at font-size %ipx but keeps physical defaults fixed",
	(fontSize) => {
		const { styles, id } = fixture(`#target{font-size:${fontSize}px}`);
		expectFieldsetDefaults(styles.box(id()), fontSize);
		expect(styles.box(id("#legend"))["padding-left"]).toBe("2px");
		expect(styles.box(id("#legend"))["padding-right"]).toBe("2px");
	},
);

it("invalidates font-relative defaults after inherited and own font changes", () => {
	const { tree, styles, id } = fixture();
	expectFieldsetDefaults(styles.box(id()));
	tree.setAttribute(id("#parent"), "style", "font-size:40px");
	expectFieldsetDefaults(styles.box(id()), 40);
	tree.setAttribute(id(), "style", "font-size:10px");
	expectFieldsetDefaults(styles.box(id()), 10);
	tree.removeAttribute(id(), "style");
	expectFieldsetDefaults(styles.box(id()), 40);
	tree.removeAttribute(id("#parent"), "style");
	expectFieldsetDefaults(styles.box(id()));
});

it("uses the element font for UA em padding rather than the root font", () => {
	const { styles, id } = fixture("html{font-size:80px}#target{font-size:10px}");
	expectFieldsetDefaults(styles.box(id()), 10);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML fieldset or legend defaults in namespace %s",
	(namespace) => {
		const { tree, styles, id } = fixture("#parent{color:rgb(12,34,56)}");
		for (const tag of ["fieldset", "legend"]) {
			const node = tree.createParserElement(tag, {}, namespace);
			tree.append(id("#parent"), node);
			expect(styles.box(node)).toEqual(initialBoxStyle);
			expect(resolvedStyleValue(tree, node, "border-top-color")).toBe(
				"rgb(12, 34, 56)",
			);
			tree.setAttribute(node, "style", "all:revert");
			expect(styles.box(node)).toEqual(initialBoxStyle);
			tree.setAttribute(node, "style", "padding:9px;border:1px solid red");
			expect(styles.box(node)).toMatchObject({
				"padding-left": "9px",
				"border-top-width": "1px",
				"border-top-style": "solid",
			});
		}
	},
);

it("does not give ordinary block elements fieldset or legend defaults", () => {
	const { styles, id } = fixture(
		"#target{display:block}",
		'<div id="target"><span id="legend">Title</span></div>',
	);
	expect(styles.box(id())).toEqual(initialBoxStyle);
	expect(styles.box(id("#legend"))).toEqual(initialBoxStyle);
});

it.each(["fieldset", "legend"])(
	"preserves author margin, padding and border shorthands on %s",
	(tag) => {
		const { styles, id, read } = fixture(
			"#target{margin:1px 3px 5px 7px;padding:2px 4px 6px 8px;border:9px solid rgb(1,2,3);min-width:31px}",
			`<${tag} id="target">Content</${tag}>`,
		);
		expect(styles.box(id())).toMatchObject({
			"margin-top": "1px",
			"margin-right": "3px",
			"margin-bottom": "5px",
			"margin-left": "7px",
			"padding-top": "2px",
			"padding-right": "4px",
			"padding-bottom": "6px",
			"padding-left": "8px",
			"min-width": "31px",
		});
		for (const side of borderSides) {
			expect(styles.box(id())[`border-${side}-width`]).toBe("9px");
			expect(styles.box(id())[`border-${side}-style`]).toBe("solid");
			expect(read(`border-${side}-color`)).toBe("rgb(1, 2, 3)");
		}
	},
);

it("retains untouched UA sides when only author longhands are present", () => {
	const { styles, id, read } = fixture(
		"#target{margin-left:9px;padding-top:4px;border-right-width:6px;border-bottom-style:solid;border-left-color:red;min-width:0}",
	);
	expect(styles.box(id())).toMatchObject({
		"margin-left": "9px",
		"margin-right": "2px",
		"padding-top": "4px",
		"padding-right": "15px",
		"padding-bottom": "12.5px",
		"padding-left": "15px",
		"border-right-width": "6px",
		"border-left-width": "2px",
		"border-bottom-style": "solid",
		"border-top-style": "groove",
		"min-width": "0px",
	});
	expect(read("border-left-color")).toBe("rgb(255, 0, 0)");
	expect(read("border-right-color")).toBe("rgb(240, 240, 240)");
});

it("lets a partial legend override preserve the other UA padding side", () => {
	const { styles, id } = fixture("#legend{padding-left:9px}");
	expect(styles.box(id("#legend"))).toMatchObject({
		"padding-top": "0px",
		"padding-right": "2px",
		"padding-bottom": "0px",
		"padding-left": "9px",
	});
});

it("honors stylesheet importance over normal inline declarations", () => {
	const { tree, styles, id, read } = fixture(
		"#target{padding:8px!important;border:4px solid red!important;min-width:37px!important}",
	);
	tree.setAttribute(
		id(),
		"style",
		"padding:1px;border:1px solid blue;min-width:2px",
	);
	expect(styles.box(id())).toMatchObject({
		"padding-left": "8px",
		"border-left-width": "4px",
		"min-width": "37px",
	});
	expect(read("border-left-color")).toBe("rgb(255, 0, 0)");
	tree.setAttribute(
		id(),
		"style",
		"padding:1px!important;border:1px solid blue!important;min-width:2px!important",
	);
	expect(styles.box(id())).toMatchObject({
		"padding-left": "1px",
		"border-left-width": "1px",
		"min-width": "2px",
	});
	expect(read("border-left-color")).toBe("rgb(0, 0, 255)");
});

it("keeps native ThreeDFace independent of inherited and changing text color", () => {
	const { tree, id, read } = fixture("#parent{color:red}");
	for (const side of borderSides)
		expect(read(`border-${side}-color`)).toBe("rgb(240, 240, 240)");
	tree.setAttribute(id(), "style", "color:blue");
	expect(read("border-top-color")).toBe("rgb(240, 240, 240)");
	tree.setAttribute(id(), "style", "color:blue;border-color:currentcolor");
	expect(read("border-top-color")).toBe("rgb(0, 0, 255)");
	tree.removeAttribute(id(), "style");
	expect(read("border-top-color")).toBe("rgb(240, 240, 240)");
});

it.each(["border:0", "border:none"])(
	"does not reseed groove or ThreeDFace after author %s",
	(declaration) => {
		const { styles, id, read } = fixture(`#target{color:blue;${declaration}}`);
		for (const side of borderSides) {
			expect(styles.box(id())[`border-${side}-style`]).toBe("none");
			expect(read(`border-${side}-color`)).toBe("rgb(0, 0, 255)");
		}
		expect(styles.box(id())["border-top-width"]).toBe(
			declaration === "border:0" ? "0px" : "3px",
		);
	},
);

const wideCases = ["initial", "unset", "inherit", "revert"] as const;

it.each(
	wideCases.flatMap((value) =>
		["stylesheet", "inline"].map((origin) => ({ value, origin })),
	),
)("respects $value box and border resets from $origin", ({ value, origin }) => {
	const declaration = `margin:${value};padding:${value};border:${value};min-width:${value}`;
	const { tree, styles, id, read } = fixture(
		`#parent{margin:9px;padding:11px;border:5px solid rgb(1,2,3);min-width:31px;color:rgb(12,34,56)}${origin === "stylesheet" ? `#target{${declaration}}` : ""}`,
	);
	if (origin === "inline") tree.setAttribute(id(), "style", declaration);
	const box = styles.box(id());
	if (value === "revert") expectFieldsetDefaults(box);
	else if (value === "inherit") {
		for (const side of borderSides) {
			expect(box[`margin-${side}`]).toBe("9px");
			expect(box[`padding-${side}`]).toBe("11px");
			expect(box[`border-${side}-width`]).toBe("5px");
			expect(box[`border-${side}-style`]).toBe("solid");
		}
		expect(box["min-width"]).toBe("31px");
	} else expect(box).toEqual(initialBoxStyle);
	for (const side of borderSides)
		expect(read(`border-${side}-color`)).toBe(
			value === "revert"
				? "rgb(240, 240, 240)"
				: value === "inherit"
					? "rgb(1, 2, 3)"
					: "rgb(12, 34, 56)",
		);
});

it.each(wideCases)(
	"applies all:%s without resurrecting author resets",
	(value) => {
		const { tree, styles, id } = fixture(
			"#parent{padding:11px;margin:9px;border:5px solid red;min-width:31px}#target{padding:42px;border:7px solid blue}",
		);
		tree.setAttribute(id(), "style", `all:${value}!important`);
		const box = styles.box(id());
		if (value === "revert") expectFieldsetDefaults(box);
		else if (value === "inherit")
			expect(box).toMatchObject({
				"padding-left": "11px",
				"margin-left": "9px",
				"border-left-width": "5px",
				"border-left-style": "solid",
				"min-width": "31px",
			});
		else expect(box).toEqual(initialBoxStyle);
	},
);

it.each(wideCases)(
	"resolves legend padding:%s independently of fieldset defaults",
	(value) => {
		const { styles, id } = fixture(
			`#target{padding:11px}#legend{padding:${value}}`,
		);
		const box = styles.box(id("#legend"));
		for (const side of borderSides)
			expect(box[`padding-${side}`]).toBe(
				value === "inherit"
					? "11px"
					: value === "revert" && (side === "left" || side === "right")
						? "2px"
						: "0px",
			);
	},
);

it("restores UA box and paint defaults after removing inline overrides", () => {
	const { tree, styles, id, read } = fixture();
	tree.setAttribute(
		id(),
		"style",
		"padding:1px;margin:8px;border:6px solid red;min-width:40px",
	);
	expect(styles.box(id())["padding-left"]).toBe("1px");
	expect(read("border-left-color")).toBe("rgb(255, 0, 0)");
	tree.removeAttribute(id(), "style");
	expectFieldsetDefaults(styles.box(id()));
	expect(read("border-left-color")).toBe("rgb(240, 240, 240)");
});

it("invalidates selector-dependent overrides after class removal", () => {
	const { tree, styles, id, read } = fixture(
		".override{padding-left:9px;border-color:red;min-width:50px}",
	);
	expectFieldsetDefaults(styles.box(id()));
	tree.setAttribute(id(), "class", "override");
	expect(styles.box(id())["padding-left"]).toBe("9px");
	expect(styles.box(id())["min-width"]).toBe("50px");
	expect(read("border-top-color")).toBe("rgb(255, 0, 0)");
	tree.removeAttribute(id(), "class");
	expectFieldsetDefaults(styles.box(id()));
	expect(read("border-top-color")).toBe("rgb(240, 240, 240)");
});

it("refreshes fieldset and legend defaults after stylesheet replacement and removal", () => {
	const { tree, styles, id } = fixture(
		"#target{padding:1px}#legend{padding:8px}",
	);
	expect(styles.box(id())["padding-left"]).toBe("1px");
	expect(styles.box(id("#legend"))["padding-left"]).toBe("8px");
	tree.setTextContent(id("#sheet"), "#parent{font-size:40px}");
	expectFieldsetDefaults(styles.box(id()), 40);
	expect(styles.box(id("#legend"))["padding-left"]).toBe("2px");
	tree.remove(id("#sheet"));
	expectFieldsetDefaults(styles.box(id()), 16);
	expect(styles.box(id("#legend"))["padding-left"]).toBe("2px");
});

it("does not substitute UA defaults for invalid-at-computed-value author padding", () => {
	const { styles, id } = fixture("#target{padding:var(--missing)}");
	for (const side of borderSides)
		expect(styles.box(id())[`padding-${side}`]).toBe("0px");
	expect(styles.box(id())["margin-left"]).toBe("2px");
	expect(styles.box(id())["border-left-style"]).toBe("groove");
});

it("retains existing cascade winners when later declarations are invalid", () => {
	const { styles, id, read } = fixture(
		"#target{padding:9px;padding:invalid;border:4px solid red;border:invalid}",
	);
	expect(styles.box(id())).toMatchObject({
		"padding-left": "9px",
		"border-left-width": "4px",
		"border-left-style": "solid",
	});
	expect(read("border-left-color")).toBe("rgb(255, 0, 0)");
});

it("computes hidden fieldset defaults without requiring a formatting box", () => {
	const { tree, styles, id } = fixture("#target{display:none}");
	expect(styles.get(id()).displayed).toBe(false);
	expectFieldsetDefaults(styles.box(id()));
	tree.setAttribute(id(), "style", "display:block");
	expect(styles.get(id()).displayed).toBe(true);
	expectFieldsetDefaults(styles.box(id()));
	tree.setAttribute(id(), "hidden", "");
	expectFieldsetDefaults(styles.box(id()));
});

it("keeps nested fieldset and legend defaults independent of parent box styling", () => {
	const { tree, styles, id, read } = fixture(
		"#target{font-size:20px;padding:40px;border:8px solid red}#inner{font-size:10px}",
		'<fieldset id="target"><legend id="legend">Outer</legend><fieldset id="inner"><legend id="inner-legend">Inner</legend><div id="plain">Text</div></fieldset></fieldset>',
	);
	expectFieldsetDefaults(styles.box(id("#inner")), 10);
	expect(read("border-top-color", "#inner")).toBe("rgb(240, 240, 240)");
	for (const selector of ["#legend", "#inner-legend"])
		expect(styles.box(id(selector))["padding-left"]).toBe("2px");
	expect(styles.box(id("#plain"))).toEqual(initialBoxStyle);
	tree.setAttribute(id("#inner"), "style", "padding:inherit;border:inherit");
	expect(styles.box(id("#inner"))).toMatchObject({
		"padding-left": "40px",
		"border-left-width": "8px",
		"border-left-style": "solid",
	});
	expect(read("border-left-color", "#inner")).toBe("rgb(255, 0, 0)");
});

it("recomputes explicit inherited padding after moving between fieldsets", () => {
	const { tree, styles, id } = fixture(
		"#target{padding:10px}#other{padding:30px}#legend{padding:inherit}",
		'<fieldset id="target"><legend id="legend">Moved</legend></fieldset><fieldset id="other"></fieldset>',
	);
	const legend = id("#legend");
	expect(styles.box(legend)["padding-left"]).toBe("10px");
	tree.append(id("#other"), legend);
	expect(styles.box(legend)["padding-left"]).toBe("30px");
	tree.setAttribute(legend, "style", "padding:revert");
	expect(styles.box(legend)["padding-left"]).toBe("2px");
	expect(styles.box(legend)["padding-top"]).toBe("0px");
});
