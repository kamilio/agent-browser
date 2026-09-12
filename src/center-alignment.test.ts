import { afterEach, describe, expect, it } from "vitest";
import {
	type BlockWidthOptions,
	type BlockWidthStyle,
	resolveBlockWidth,
} from "./block-width.js";
import { initialBoxStyle } from "./css-box.js";
import { parseInlineDeclarations } from "./css-declarations.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { layoutValueLimits } from "./layout-values.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(
	css = "",
	content = '<center id="center"><div id="child">AA</div></center>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:80px}#child{width:20px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/center-alignment",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(96, 64);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	return { tree, queries, styles, id };
}

describe("native center metadata contracts (source-only; parent owns execution)", () => {
	it("gives HTML center a UA block/text fallback without changing source or cache identity", () => {
		const { tree, styles, id } = fixture();
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const center = id("#center");
		const text = styles.text(center);
		const box = styles.box(center);
		const visibility = styles.get(center);
		expect(visibility.display).toBe("block");
		expect(text["text-align"]).toBe("center");
		expect(styles.legacyChildAlignment(center)).toBe("center");
		expect(styles.text(center)).toBe(text);
		expect(styles.box(center)).toBe(box);
		expect(styles.get(center)).toBe(visibility);
		expect(tree.get(center).attributes.style).toBeUndefined();
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	});

	it.each([svgNamespace, mathmlNamespace])(
		"does not apply the HTML center fallback in namespace %s",
		(namespace) => {
			const { tree, styles, id } = fixture("", "");
			const foreign = tree.createParserElement("center", {}, namespace);
			tree.append(id("#host"), foreign);
			expect(styles.get(foreign).display).toBe("inline");
			expect(styles.text(foreign)["text-align"]).toBe("start");
			expect(styles.legacyChildAlignment(foreign)).toBeUndefined();
		},
	);

	it("distinguishes ordinary author text-align:center from legacy alignment", () => {
		const { styles, id } = fixture(
			"#ordinary{text-align:center}",
			'<div id="ordinary"><div id="child">AA</div></div>',
		);
		for (const selector of ["#ordinary", "#child"]) {
			expect(styles.text(id(selector))["text-align"]).toBe("center");
			expect(styles.legacyChildAlignment(id(selector))).toBeUndefined();
		}
	});

	it.each(["inline", "contents", "none"])(
		"honors author display:%s independently of the alignment fallback",
		(display) => {
			const { styles, id } = fixture(`#center{display:${display}}`);
			expect(styles.get(id("#center")).display).toBe(display);
			expect(styles.text(id("#center"))["text-align"]).toBe("center");
			expect(styles.legacyChildAlignment(id("#center"))).toBe("center");
		},
	);

	it("inherits the alignment pair through ordinary and nested center descendants", () => {
		const { styles, id } = fixture(
			"",
			'<center id="center"><section id="middle"><center id="nested"><div id="child">AA</div></center></section></center>',
		);
		for (const selector of ["#center", "#middle", "#nested", "#child"]) {
			expect(styles.text(id(selector))["text-align"]).toBe("center");
			expect(styles.legacyChildAlignment(id(selector))).toBe("center");
		}
	});

	it("clears a child's inherited marker for left text without clearing its parent's marker", () => {
		const { styles, id } = fixture(
			"#child{text-align:left}",
			'<center id="center"><div id="child"><span id="leaf">AA</span></div></center>',
		);
		expect(styles.legacyChildAlignment(id("#center"))).toBe("center");
		for (const selector of ["#child", "#leaf"]) {
			expect(styles.text(id(selector))["text-align"]).toBe("left");
			expect(styles.legacyChildAlignment(id(selector))).toBeUndefined();
		}
	});

	it.each([
		["inherit", "right", undefined],
		["unset", "right", undefined],
		["initial", "start", undefined],
		["revert", "center", "center"],
	] as const)(
		"resolves text-align:%s on center against its nonlegacy parent",
		(value, alignment, marker) => {
			const { styles, id } = fixture(
				`main{text-align:right}#center{text-align:${value}}`,
			);
			expect(styles.text(id("#center"))["text-align"]).toBe(alignment);
			expect(styles.legacyChildAlignment(id("#center"))).toBe(marker);
			expect(styles.legacyChildAlignment(id("#child"))).toBe(marker);
		},
	);

	it.each([
		["inherit", "center", "center"],
		["unset", "center", "center"],
		["initial", "start", undefined],
		["revert", "center", "center"],
	] as const)(
		"resolves text-align:%s on an ordinary descendant of center",
		(value, alignment, marker) => {
			const { styles, id } = fixture(`#child{text-align:${value}}`);
			expect(styles.text(id("#child"))["text-align"]).toBe(alignment);
			expect(styles.legacyChildAlignment(id("#child"))).toBe(marker);
		},
	);

	it("clears legacy metadata even when an author explicitly chooses the same center text value", () => {
		const { styles, id } = fixture("#center{text-align:center}");
		expect(styles.text(id("#center"))["text-align"]).toBe("center");
		expect(styles.legacyChildAlignment(id("#center"))).toBeUndefined();
		expect(styles.legacyChildAlignment(id("#child"))).toBeUndefined();
	});

	it("uses the winning important declaration rather than an overridden inline value", () => {
		const { tree, styles, id } = fixture(
			"#center{text-align:revert!important}",
			'<center id="center" style="text-align:left"><div id="child">AA</div></center>',
		);
		expect(styles.legacyChildAlignment(id("#center"))).toBe("center");
		tree.setAttribute(id("#center"), "style", "text-align:left!important");
		expect(styles.text(id("#center"))["text-align"]).toBe("left");
		expect(styles.legacyChildAlignment(id("#center"))).toBeUndefined();
	});

	it("recomputes text and legacy metadata together after a custom-property mutation", () => {
		const { tree, styles, id } = fixture(
			"#center{text-align:var(--alignment,left)}",
		);
		expect(styles.text(id("#center"))["text-align"]).toBe("left");
		expect(styles.legacyChildAlignment(id("#center"))).toBeUndefined();
		tree.setAttribute(id("#host"), "style", "--alignment:center");
		expect(styles.text(id("#center"))["text-align"]).toBe("center");
		expect(styles.legacyChildAlignment(id("#center"))).toBeUndefined();
		tree.setAttribute(id("#host"), "style", "--alignment:left");
		expect(styles.text(id("#child"))["text-align"]).toBe("left");
		expect(styles.legacyChildAlignment(id("#child"))).toBeUndefined();
	});

	it("restores fallback and descendant caches after removing a matching author class", () => {
		const { tree, styles, id } = fixture(".left{text-align:left}");
		const before = styles.text(id("#child"));
		tree.setAttribute(id("#center"), "class", "left");
		expect(styles.text(id("#child"))).not.toBe(before);
		expect(styles.legacyChildAlignment(id("#child"))).toBeUndefined();
		tree.removeAttribute(id("#center"), "class");
		expect(styles.text(id("#child"))["text-align"]).toBe("center");
		expect(styles.legacyChildAlignment(id("#child"))).toBe("center");
	});

	it("invalidates legacy metadata when stylesheet text changes", () => {
		const { tree, styles, id } = fixture();
		const text = tree.get(id("style")).children[0];
		expect(styles.legacyChildAlignment(id("#child"))).toBe("center");
		tree.setData(text, "#center{text-align:right}");
		expect(styles.text(id("#child"))["text-align"]).toBe("right");
		expect(styles.legacyChildAlignment(id("#child"))).toBeUndefined();
		tree.setData(text, "");
		expect(styles.legacyChildAlignment(id("#child"))).toBe("center");
	});

	it("reparents an ordinary subtree without retaining its previous inherited marker", () => {
		const { tree, styles, id } = fixture(
			"",
			'<center id="center"><div id="child"><span id="leaf">AA</span></div></center><section id="outside"></section>',
		);
		const reference = tree.reference(id("#child"));
		expect(styles.legacyChildAlignment(id("#leaf"))).toBe("center");
		tree.append(id("#outside"), id("#child"));
		expect(styles.text(id("#leaf"))["text-align"]).toBe("start");
		expect(styles.legacyChildAlignment(id("#leaf"))).toBeUndefined();
		tree.append(id("#center"), id("#child"));
		expect(styles.legacyChildAlignment(id("#leaf"))).toBe("center");
		expect(tree.reference(id("#child"))).toBe(reference);
	});

	it("carries parent typography and legacy alignment into anonymous inline-run wrappers", () => {
		const { tree, id } = fixture(
			"",
			'<center id="center">AA<div id="child">BB</div>CC</center>',
		);
		const before = snapshotDocument(tree);
		const formatting = buildFormattingTree(tree);
		const center = formatting.nodes.find(
			(node) => node.ref === tree.reference(id("#center")),
		);
		expect(center?.legacyChildAlignment).toBe("center");
		const wrappers = center?.children
			.map((child) => formatting.nodes[child])
			.filter((node) => node.kind === "anonymous-block");
		expect(wrappers).toHaveLength(2);
		for (const wrapper of wrappers ?? []) {
			expect(wrapper.legacyChildAlignment).toBe("center");
			expect(wrapper.typography).toMatchObject({
				"text-align": "center",
				"font-size": "8px",
				"line-height": "8px",
			});
			expect(Object.isFrozen(wrapper)).toBe(true);
		}
		expect(snapshotDocument(tree)).toEqual(before);
	});

	it("rejects metadata access after close instead of retaining a usable cached marker", () => {
		const { tree, queries, styles, id } = fixture();
		const child = id("#child");
		expect(styles.legacyChildAlignment(child)).toBe("center");
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(queries.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(() => styles.legacyChildAlignment(child)).toThrow(/closed/i);
	});
});

type WidthCase = readonly [
	name: string,
	values: Partial<BlockWidthStyle>,
	contentWidth: number,
	marginLeft: number,
	marginRight: number,
	clampedBy: "none" | "min-width" | "max-width",
];

const widthCases: readonly WidthCase[] = [
	["explicit zero margins", {}, 20, 30, 30, "none"],
	[
		"asymmetric positive margins",
		{ "margin-left": "10px", "margin-right": "20px" },
		20,
		25,
		35,
		"none",
	],
	[
		"asymmetric negative margins",
		{ "margin-left": "-10px", "margin-right": "-20px" },
		20,
		35,
		25,
		"none",
	],
	[
		"fractional width and margins",
		{ width: "20.5px", "margin-left": "1.25px", "margin-right": "2.75px" },
		20.5,
		29,
		30.5,
		"none",
	],
	[
		"percentage width and margins",
		{ width: "25%", "margin-left": "10%", "margin-right": "20%" },
		20,
		26,
		34,
		"none",
	],
	[
		"unclamped auto width",
		{ width: "auto", "margin-left": "10px", "margin-right": "20px" },
		50,
		10,
		20,
		"none",
	],
	[
		"max-clamped auto width with explicit margins",
		{
			width: "auto",
			"max-width": "20px",
			"margin-left": "10px",
			"margin-right": "20px",
		},
		20,
		25,
		35,
		"max-width",
	],
	[
		"max-clamped definite width",
		{ width: "60px", "max-width": "20px" },
		20,
		30,
		30,
		"max-width",
	],
	[
		"minimum winning over maximum",
		{ width: "10px", "min-width": "40px", "max-width": "20px" },
		40,
		20,
		20,
		"min-width",
	],
	[
		"one original auto margin",
		{ "margin-left": "auto", "margin-right": "10px" },
		20,
		50,
		10,
		"none",
	],
	[
		"two original auto margins",
		{ "margin-left": "auto", "margin-right": "auto" },
		20,
		30,
		30,
		"none",
	],
	[
		"overflow with explicit margins",
		{ width: "100px", "margin-left": "10px", "margin-right": "20px" },
		100,
		10,
		-30,
		"none",
	],
	[
		"no remaining space",
		{ width: "50px", "margin-left": "10px", "margin-right": "20px" },
		50,
		10,
		20,
		"none",
	],
	[
		"auto width exhausted by margins",
		{ width: "auto", "margin-left": "60px", "margin-right": "40px" },
		0,
		60,
		20,
		"none",
	],
];

function assertWidthInvariant(result: ReturnType<typeof resolveBlockWidth>) {
	expect(
		result.marginLeft + result.borderBoxWidth + result.marginRight,
	).toBeCloseTo(result.containingWidth, 10);
	expect(result.contentOffset).toBeCloseTo(
		result.marginLeft + result.borderLeft + result.paddingLeft,
		10,
	);
	expect(Object.isFrozen(result)).toBe(true);
}

function widthStyle(values: Partial<BlockWidthStyle> = {}): BlockWidthStyle {
	return { ...initialBoxStyle, width: "20px", ...values };
}

describe("native legacy block-width contracts (not foreign-engine parity)", () => {
	for (const direction of ["ltr", "rtl"] as const) {
		it.each(widthCases)(
			`${direction}: %s preserves computed inputs and the used-width equation`,
			(_name, values, contentWidth, marginLeft, marginRight, clampedBy) => {
				const original = widthStyle(values);
				const input = Object.freeze(
					direction === "ltr"
						? original
						: {
								...original,
								"margin-left": original["margin-right"],
								"margin-right": original["margin-left"],
							},
				);
				const before = { ...input };
				const result = resolveBlockWidth(input, 80, {
					containingDirection: direction,
					legacyAlignment: "center",
				});
				expect(result).toMatchObject({
					contentWidth,
					marginLeft: direction === "ltr" ? marginLeft : marginRight,
					marginRight: direction === "ltr" ? marginRight : marginLeft,
					clampedBy,
				});
				assertWidthInvariant(result);
				expect(input).toEqual(before);
			},
		);
	}

	it("centers content-box edges while leaving declarations and computed margins unchanged", () => {
		const { tree, styles, id } = fixture(
			"",
			'<center id="center"><div id="child" style="width:20px;padding-left:10%;padding-right:5%;margin-left:2px;margin-right:6px">AA</div></center>',
		);
		const source = tree.get(id("#child")).attributes.style;
		const declarations = parseInlineDeclarations(source, 32);
		const before = snapshotDocument(tree);
		const box = styles.box(id("#child"));
		const result = resolveBlockWidth(box, 80, {
			legacyAlignment: "center",
			borderLeft: 3,
			borderRight: 5,
		});
		expect(result).toMatchObject({
			contentWidth: 20,
			borderBoxWidth: 40,
			marginLeft: 18,
			marginRight: 22,
			contentOffset: 29,
		});
		assertWidthInvariant(result);
		expect(styles.box(id("#child"))).toBe(box);
		expect(box).toMatchObject({ "margin-left": "2px", "margin-right": "6px" });
		expect(
			parseInlineDeclarations(tree.get(id("#child")).attributes.style, 32),
		).toEqual(declarations);
		expect(snapshotDocument(tree)).toEqual(before);
	});

	it("floors border-box content below padding and borders before distributing space", () => {
		const result = resolveBlockWidth(
			widthStyle({
				width: "4px",
				"box-sizing": "border-box",
				"padding-left": "8px",
				"padding-right": "4px",
			}),
			80,
			{ legacyAlignment: "center", borderLeft: 3, borderRight: 5 },
		);
		expect(result).toMatchObject({
			contentWidth: 0,
			borderBoxWidth: 20,
			marginLeft: 30,
			marginRight: 30,
			contentOffset: 41,
		});
		assertWidthInvariant(result);
	});

	it("re-solves border-box maximum constraints including percentage padding", () => {
		const result = resolveBlockWidth(
			widthStyle({
				width: "auto",
				"max-width": "40px",
				"box-sizing": "border-box",
				"padding-left": "10%",
				"padding-right": "5%",
				"margin-left": "2px",
				"margin-right": "6px",
			}),
			80,
			{ legacyAlignment: "center", borderLeft: 3, borderRight: 5 },
		);
		expect(result).toMatchObject({
			contentWidth: 20,
			borderBoxWidth: 40,
			marginLeft: 18,
			marginRight: 22,
			clampedBy: "max-width",
		});
		assertWidthInvariant(result);
	});

	it("keeps ordinary directional overconstraint when the legacy option is absent", () => {
		const input = widthStyle({ "margin-left": "10px", "margin-right": "20px" });
		const left = resolveBlockWidth(input, 80);
		const right = resolveBlockWidth(input, 80, { containingDirection: "rtl" });
		expect(left).toMatchObject({ marginLeft: 10, marginRight: 50 });
		expect(right).toMatchObject({ marginLeft: 40, marginRight: 20 });
		assertWidthInvariant(left);
		assertWidthInvariant(right);
	});

	it.each(["left", "CENTER", null])(
		"rejects invalid legacyAlignment %j",
		(value) => {
			expect(() =>
				resolveBlockWidth(widthStyle(), 80, {
					legacyAlignment: value,
				} as unknown as BlockWidthOptions),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		},
	);

	it("retains numeric and length-source limits on the legacy path", () => {
		const maximum = layoutValueLimits.maxAbsoluteLength;
		const options = { legacyAlignment: "center" } as const;
		assertWidthInvariant(
			resolveBlockWidth(
				widthStyle({ width: `${maximum}px` }),
				maximum,
				options,
			),
		);
		for (const width of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
			expect(() =>
				resolveBlockWidth(widthStyle(), width, options),
			).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		}
		expect(() => resolveBlockWidth(widthStyle(), maximum + 1, options)).toThrow(
			/limit/i,
		);
		expect(() =>
			resolveBlockWidth(widthStyle({ width: `${maximum + 1}px` }), 80, options),
		).toThrow(/limit/i);
		expect(() =>
			resolveBlockWidth(
				widthStyle({
					"margin-left": `${"0".repeat(layoutValueLimits.maxLengthCodeUnits)}px`,
				}),
				80,
				options,
			),
		).toThrow(/limit/i);
	});
});
