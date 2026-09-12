import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import { domRangeOwner } from "./dom-range.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { rangeBoundingClientRect } from "./range-geometry.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

function fixture(content: string, transform: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0;font-size:8px;line-height:8px;color:black;background:white}main{width:96px;text-transform:${transform}}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/text-transform",
	);
	const queries = new DocumentQueries(tree);
	documentStyles(tree).setViewport(128, 32);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing transformation ${selector}`);
		return found;
	};
	return {
		tree,
		queries,
		id,
		context: () => {
			const found = layoutDocument(tree).contexts.find(
				(context) => context.ref === tree.reference(id("#main")),
			);
			if (!found) throw new Error("Missing transformation text context");
			return found;
		},
		close: () => {
			queries.close();
			tree.close();
		},
	};
}

it("expands uppercase glyphs while preserving original range and copy source", () => {
	const page = fixture('<span id="text">aßb</span>', "uppercase");
	const control = fixture('<span id="text">ASSB</span>', "none");
	try {
		const before = snapshotDocument(page.tree);
		const context = page.context();
		expect(context.glyphs.map((glyph) => glyph.character).join("")).toBe(
			"ASSB",
		);
		expect(
			context.glyphs.map((glyph) => [glyph.offset, glyph.codeUnits]),
		).toEqual([
			[0, 1],
			[1, 1],
			[1, 1],
			[2, 1],
		]);
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.id("#text")),
		).toMatchObject({ x: 0, y: 0, width: 24, height: 8 });
		const range = domRangeOwner(page.tree).createRange();
		const text = page.tree.get(page.id("#text")).children[0];
		range.setStart(text, 1);
		range.setEnd(text, 2);
		expect(range.toString()).toBe("ß");
		expect(rangeBoundingClientRect(range)).toMatchObject({
			x: 6,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(documentHitTesting(page.tree).elementFromPoint(13, 1)).toBe(
			page.id("#text"),
		);
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		expect(snapshotDocument(page.tree)).toEqual(before);
	} finally {
		page.close();
		control.close();
	}
});

it("applies contextual final sigma across inline source boundaries", () => {
	const page = fixture(
		'<span id="first">Ο</span><span id="last">Σ</span>',
		"lowercase",
	);
	try {
		const before = snapshotDocument(page.tree);
		expect(
			page
				.context()
				.glyphs.map((glyph) => glyph.character)
				.join(""),
		).toBe("ος");
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.id("#last")),
		).toMatchObject({ x: 6, y: 0, width: 6, height: 8 });
		expect(page.tree.textContent(page.id("#main"))).toBe("ΟΣ");
		expect(snapshotDocument(page.tree)).toEqual(before);
	} finally {
		page.close();
	}
});

it("capitalizes words without treating inline boundaries as word starts", () => {
	const page = fixture(
		'<span id="first">foo</span><span id="last">bar</span> baz',
		"capitalize",
	);
	const control = fixture(
		'<span id="first">Foo</span><span id="last">bar</span> Baz',
		"none",
	);
	try {
		const before = snapshotDocument(page.tree);
		expect(
			page
				.context()
				.glyphs.map((glyph) => glyph.character)
				.join(""),
		).toBe("Foobar Baz");
		expect(
			documentGeometry(page.tree).getBoundingClientRect(page.id("#last")),
		).toMatchObject({ x: 18, y: 0, width: 18, height: 8 });
		expect(rasterizeDocument(page.tree).image.pixels).toEqual(
			rasterizeDocument(control.tree).image.pixels,
		);
		expect(snapshotDocument(page.tree)).toEqual(before);
	} finally {
		page.close();
		control.close();
	}
});
