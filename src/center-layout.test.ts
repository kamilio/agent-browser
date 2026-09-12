import { afterEach, describe, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
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
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:80px}#child{width:20px;height:8px}${css}</style><main id="host">${content}</main>`,
		"https://fixture.invalid/center-layout",
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
	const geometry = documentGeometry(tree);
	const rect = (selector = "#child") =>
		geometry.getBoundingClientRect(id(selector));
	return { tree, queries, styles, id, geometry, rect };
}

function glyphs(tree: DocumentTree) {
	return layoutDocument(tree)
		.contexts.flatMap((context) => context.glyphs)
		.sort((first, second) => first.y - second.y || first.x - second.x)
		.map((glyph) => [glyph.character, glyph.x, glyph.y]);
}

describe("native center layout regressions (source-only; no browser parity or expanded geometry profile)", () => {
	it("centers normal block geometry and inherited text independently", () => {
		const { tree, rect } = fixture();
		expect(rect("#center")).toMatchObject({ x: 0, y: 0, width: 80, height: 8 });
		expect(rect()).toMatchObject({ x: 30, y: 0, width: 20, height: 8 });
		expect(glyphs(tree)).toEqual([
			["A", 34, 0],
			["A", 40, 0],
		]);
	});

	it("centers text in anonymous runs before and after a normal block", () => {
		const { tree, rect } = fixture(
			"",
			'<center id="center">AB<div id="child">CD</div>EF</center>',
		);
		expect(rect()).toMatchObject({ x: 30, y: 8 });
		expect(glyphs(tree)).toEqual([
			["A", 34, 0],
			["B", 40, 0],
			["C", 34, 8],
			["D", 40, 8],
			["E", 34, 16],
			["F", 40, 16],
		]);
	});

	it("uses the centered box for background rasterization and hit ownership", () => {
		const { tree, id, rect } = fixture(
			"#child{background:red}",
			'<center id="center"><div id="child"></div></center>',
		);
		expect(rect()).toMatchObject({ x: 30, width: 20 });
		expect([
			...rasterizeDocument(tree, { clip: { x: 31, y: 1, width: 1, height: 1 } })
				.image.pixels,
		]).toEqual([255, 0, 0, 255]);
		const hits = documentHitTesting(tree);
		expect(hits.elementFromPoint(31, 1)).toBe(id("#child"));
		expect(hits.elementFromPoint(1, 1)).not.toBe(id("#child"));
		expect(hits.elementFromPoint(51, 1)).not.toBe(id("#child"));
	});

	it("places a left-aligned child centrally but leaves its descendants left-aligned", () => {
		const { tree, rect } = fixture(
			"#child{text-align:left}#leaf{width:8px}",
			'<center id="center"><div id="child"><div id="leaf">A</div></div></center>',
		);
		expect(rect().x).toBe(30);
		expect(rect("#leaf").x).toBe(30);
		expect(glyphs(tree)).toEqual([["A", 30, 0]]);
	});

	it("does not position blocks for ordinary CSS text-align:center", () => {
		const { tree, rect } = fixture(
			"#ordinary{text-align:center}",
			'<div id="ordinary"><div id="child">AA</div></div>',
		);
		expect(rect().x).toBe(0);
		expect(glyphs(tree)).toEqual([
			["A", 4, 0],
			["A", 10, 0],
		]);
	});

	it("stops legacy block placement when center explicitly declares author text-align:center", () => {
		const { tree, rect } = fixture("#center{text-align:center}");
		expect(rect().x).toBe(0);
		expect(glyphs(tree)).toEqual([
			["A", 4, 0],
			["A", 10, 0],
		]);
	});

	it("inherits legacy placement through an ordinary intermediate block", () => {
		const { tree, rect } = fixture(
			"#middle{width:40px}",
			'<center id="center"><section id="middle"><div id="child">AA</div></section></center>',
		);
		expect(rect("#middle")).toMatchObject({ x: 20, width: 40 });
		expect(rect().x).toBe(30);
		expect(glyphs(tree)).toEqual([
			["A", 34, 0],
			["A", 40, 0],
		]);
	});

	it("restores nested center fallback below a left-aligned ancestor", () => {
		const { tree, rect } = fixture(
			"#middle{width:60px;text-align:left}#nested{width:40px}",
			'<center id="center"><section id="middle"><center id="nested"><div id="child">AA</div></center></section></center>',
		);
		expect(rect("#middle").x).toBe(10);
		expect(rect("#nested")).toMatchObject({ x: 10, width: 40 });
		expect(rect().x).toBe(20);
		expect(glyphs(tree)).toEqual([
			["A", 24, 0],
			["A", 30, 0],
		]);
	});

	it.each([
		["width:auto", 0, 80],
		["width:auto;max-width:20px", 30, 20],
		["width:10px;min-width:40px;max-width:20px", 20, 40],
	] as const)(
		"uses final constrained width for %s",
		(declarations, left, width) => {
			const { rect } = fixture(`#child{${declarations}}`);
			expect(rect()).toMatchObject({ x: left, width });
		},
	);

	it.each([
		["10px", "20px", 25],
		["-10px", "-20px", 35],
		["10%", "20%", 26],
		["1.25px", "2.75px", 29.25],
	] as const)(
		"includes explicit margins %s / %s in block placement",
		(left, right, expected) => {
			const { styles, id, rect } = fixture(
				`#child{margin-left:${left};margin-right:${right}}`,
			);
			expect(rect()).toMatchObject({ x: expected, width: 20 });
			expect(styles.box(id("#child"))).toMatchObject({
				"margin-left": left,
				"margin-right": right,
			});
		},
	);

	it("keeps one-sided auto-margin resolution instead of applying an additional center offset", () => {
		const { rect } = fixture("#child{margin-left:auto;margin-right:10px}");
		expect(rect()).toMatchObject({ x: 50, width: 20 });
	});

	it("keeps overflowing blocks at the ordinary start instead of centering negative free space", () => {
		const { rect } = fixture("#child{width:100px}");
		expect(rect()).toMatchObject({ x: 0, width: 100 });
	});

	it("applies relative offsets after centering without shifting following flow", () => {
		const { tree, id, rect } = fixture(
			"#child{position:relative;left:5px;top:3px}",
			'<center id="center"><div id="child">AA</div><div id="after">BB</div></center>',
		);
		expect(rect()).toMatchObject({ x: 35, y: 3, width: 20, height: 8 });
		expect(rect("#after")).toMatchObject({ x: 0, y: 8, width: 80 });
		expect(glyphs(tree)).toEqual([
			["A", 39, 3],
			["A", 45, 3],
			["B", 34, 8],
			["B", 40, 8],
		]);
		expect(documentHitTesting(tree).elementFromPoint(36, 4)).toBe(id("#child"));
	});

	it("honors display:inline without making center an implicit block wrapper", () => {
		const { tree } = fixture(
			"#center{display:inline}",
			'A<center id="center">B</center>C',
		);
		expect(glyphs(tree)).toEqual([
			["A", 0, 0],
			["B", 6, 0],
			["C", 12, 0],
		]);
		expect(layoutDocument(tree).flowHeight).toBe(8);
	});

	it("honors display:contents without introducing a centering containing block", () => {
		const { tree, rect } = fixture("#center{display:contents}");
		expect(rect().x).toBe(0);
		expect(glyphs(tree)).toEqual([
			["A", 4, 0],
			["A", 10, 0],
		]);
	});

	it("omits display:none center descendants from paint and geometry", () => {
		const { tree, id, rect } = fixture("#center{display:none}");
		expect(rect()).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
		expect(glyphs(tree)).toEqual([]);
		expect(documentHitTesting(tree).elementFromPoint(31, 1)).not.toBe(
			id("#child"),
		);
	});

	it("invalidates layout and geometry after changing alignment and reparenting", () => {
		const { tree, styles, id, rect } = fixture(
			"",
			'<center id="center"><div id="child">AA</div></center><section id="outside"></section>',
		);
		const reference = tree.reference(id("#child"));
		const box = styles.box(id("#child"));
		expect(rect().x).toBe(30);
		expect(styles.box(id("#child"))).toBe(box);
		tree.setAttribute(id("#center"), "style", "text-align:left");
		expect(rect().x).toBe(0);
		tree.removeAttribute(id("#center"), "style");
		expect(rect().x).toBe(30);
		tree.append(id("#outside"), id("#child"));
		expect(rect().x).toBe(0);
		tree.append(id("#center"), id("#child"));
		expect(rect().x).toBe(30);
		expect(tree.reference(id("#child"))).toBe(reference);
	});

	it("centers a supported block-level native control without double placement", () => {
		const { tree, id, rect } = fixture(
			"#child{display:block;padding:0;border:0;box-sizing:border-box;height:16px}",
			'<center id="center"><button id="child">Go</button></center>',
		);
		expect(rect()).toMatchObject({ x: 30, y: 0, width: 20, height: 16 });
		expect(rasterizeDocument(tree).metrics.paintedControls).toBe(1);
		expect(documentHitTesting(tree).elementFromPoint(31, 1)).toBe(id("#child"));
	});

	it("keeps float placement independent while inheriting centering inside the float", () => {
		const { tree, rect } = fixture(
			"#floating{float:left;width:40px}",
			'<center id="center"><div id="floating"><div id="child">AA</div></div></center>',
		);
		expect(rect("#floating")).toMatchObject({ x: 0, width: 40 });
		expect(rect()).toMatchObject({ x: 10, width: 20 });
		expect(glyphs(tree)).toEqual([
			["A", 14, 0],
			["A", 20, 0],
		]);
	});

	it("places an inline atomic root only once and centers its normal descendants", () => {
		const { rect } = fixture(
			"#atomic{display:inline-block;width:40px}",
			'<center id="center"><span id="atomic"><div id="child">AA</div></span></center>',
		);
		expect(rect("#atomic")).toMatchObject({ x: 20, width: 40 });
		expect(rect()).toMatchObject({ x: 30, width: 20 });
	});

	it("preserves flex item allocation while centering normal descendants inside each item", () => {
		const { rect } = fixture(
			"#center{display:flex}#item{flex:0 0 40px;min-width:0}#sibling{flex:0 0 20px;min-width:0}",
			'<center id="center"><section id="item"><div id="child">AA</div></section><section id="sibling">BB</section></center>',
		);
		expect(rect("#item")).toMatchObject({ x: 0, width: 40 });
		expect(rect("#sibling")).toMatchObject({ x: 40, width: 20 });
		expect(rect()).toMatchObject({ x: 10, width: 20 });
	});

	it("retains the independent presentation guard without treating generic align as legacy metadata", () => {
		const { tree, styles, id } = fixture(
			"",
			'<div id="ordinary" align="center"><div id="child">AA</div></div>',
		);
		expect(styles.legacyChildAlignment(id("#ordinary"))).toBeUndefined();
		expect(styles.legacyChildAlignment(id("#child"))).toBeUndefined();
		expect(buildFormattingTree(tree).issues).toMatchObject({
			"html-presentation-hint-not-supported": 1,
		});
		expect(() => layoutDocument(tree)).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
	});

	it.each([
		{
			label: "supported automatic table coordination",
			markup: '<table id="profile"><tr><td>AA</td></tr></table>',
			issue: "display-layout-not-supported",
			supported: true,
		},
		{
			label: "supported grid coordination",
			markup: '<div id="profile" style="display:grid">AA</div>',
			issue: "display-layout-not-supported",
			supported: true,
		},
		{
			label: "unsupported fixed table layout",
			markup: '<table style="table-layout:fixed"><tr><td>AA</td></tr></table>',
			issue: "table-fixed-layout-not-supported",
			supported: false,
		},
		{
			label: "unsupported writing mode",
			markup: '<div style="writing-mode:vertical-rl">AA</div>',
			issue: "css:unimplemented-css-property",
			supported: false,
		},
		{
			label: "unsupported HTML presentation hint",
			markup: '<div align="center">AA</div>',
			issue: "html-presentation-hint-not-supported",
			supported: false,
		},
		{
			label: "unsupported fieldset layout",
			markup: "<fieldset>AA</fieldset>",
			issue: "element-layout-not-supported",
			supported: false,
		},
	])(
		"preserves paired diagnostics and outcomes for $label",
		({ markup, issue, supported }) => {
			const ordinary = fixture("", `<section>${markup}</section>`);
			const centered = fixture("", `<center>${markup}</center>`);
			expect(buildFormattingTree(centered.tree).issues).toEqual(
				buildFormattingTree(ordinary.tree).issues,
			);
			expect(ordinary.styles.metrics().issues).toEqual(
				centered.styles.metrics().issues,
			);
			expect(ordinary.styles.metrics().applicableIssues).toEqual(
				centered.styles.metrics().applicableIssues,
			);
			for (const current of [ordinary, centered]) {
				expect(buildFormattingTree(current.tree).issues[issue]).toBeGreaterThan(
					0,
				);
				if (supported) {
					const layout = layoutDocument(current.tree);
					expect(
						layout.boxes.some(
							(box) =>
								box.ref === current.tree.reference(current.id("#profile")),
						),
					).toBe(true);
					expect(
						layout.contexts
							.flatMap((context) => context.glyphs)
							.map((glyph) => glyph.character)
							.join(""),
					).toBe("AA");
				} else {
					expect(() => layoutDocument(current.tree)).toThrowError(
						expect.objectContaining({ code: "unsupported" }),
					);
				}
			}
		},
	);

	it("leaves DOM/style observations unchanged and releases geometry and hit ownership on close", () => {
		const { tree, queries, styles, id, geometry, rect } = fixture(
			"#child{background:red}",
		);
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const child = id("#child");
		const text = styles.text(child);
		const box = styles.box(child);
		const hits = documentHitTesting(tree);
		rect();
		glyphs(tree);
		rasterizeDocument(tree);
		expect(hits.elementFromPoint(31, 1)).toBe(child);
		expect(styles.text(child)).toBe(text);
		expect(styles.box(child)).toBe(box);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(queries.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
		expect(geometry.metrics()).toMatchObject({ closed: true, rectangles: 0 });
		expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	});
});
