import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

it.each([
	{ name: "positive", value: "8px", left: 8 },
	{ name: "negative", value: "-4px", left: -4 },
])("coordinates a $name first-line indent", ({ value, left }) => {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body,div,span{margin:0;padding:0;border:0;font-size:0;line-height:0}#parent{width:24px;background:white;text-indent:${value}}#child{display:inline-block;width:12px;height:8px;background:red}</style><div id="parent"><span id="child"></span></div>`,
		"https://fixture.invalid/text-indent",
	);
	const queries = new DocumentQueries(tree);
	try {
		documentStyles(tree).setViewport(64, 64);
		const container = queries.querySelector("#parent");
		const child = queries.querySelector("#child");
		if (container === null || child === null)
			throw new Error("Missing indent fixture");
		const before = snapshotDocument(tree);
		const revision = tree.revision;
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(container)).toMatchObject({
			x: 0,
			y: 0,
			width: 24,
			height: 8,
		});
		expect(geometry.getBoundingClientRect(child)).toMatchObject({
			x: left,
			y: 0,
			width: 12,
			height: 8,
		});
		const sampleX = Math.max(1, left + 1);
		expect(documentHitTesting(tree).elementFromPoint(sampleX, 1)).toBe(child);
		expect(documentHitTesting(tree).elementFromPoint(23, 1)).toBe(container);
		const image = rasterizeDocument(tree).image;
		const pixel = (image.width + sampleX) * 4;
		expect([...image.pixels.slice(pixel, pixel + 4)]).toEqual([255, 0, 0, 255]);
		expect(tree.revision).toBe(revision);
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		queries.close();
		tree.close();
	}
});

it("reserves indent space before wrapping and leaves the next soft line unindented", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body,div,span{margin:0;padding:0;border:0;font-size:0;line-height:0}#parent{width:24px;text-indent:8px;background:white}span{display:inline-block;width:12px;height:8px;background:red}</style><div id="parent"><span id="first"></span> <span id="second"></span></div>',
		"https://fixture.invalid/text-indent-wrap",
	);
	const queries = new DocumentQueries(tree);
	try {
		documentStyles(tree).setViewport(64, 64);
		const container = queries.querySelector("#parent");
		const first = queries.querySelector("#first");
		const second = queries.querySelector("#second");
		if (container === null || first === null || second === null)
			throw new Error("Missing wrapped indent fixture");
		const before = snapshotDocument(tree);
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(container)).toMatchObject({
			x: 0,
			y: 0,
			width: 24,
			height: 16,
		});
		expect(geometry.getBoundingClientRect(first)).toMatchObject({
			x: 8,
			y: 0,
			width: 12,
			height: 8,
		});
		expect(geometry.getBoundingClientRect(second)).toMatchObject({
			x: 0,
			y: 8,
			width: 12,
			height: 8,
		});
		expect(documentHitTesting(tree).elementFromPoint(9, 1)).toBe(first);
		expect(documentHitTesting(tree).elementFromPoint(1, 9)).toBe(second);
		const image = rasterizeDocument(tree).image;
		for (const [left, top] of [
			[9, 1],
			[1, 9],
		]) {
			const pixel = (top * image.width + left) * 4;
			expect([...image.pixels.slice(pixel, pixel + 4)]).toEqual([
				255, 0, 0, 255,
			]);
		}
		expect(snapshotDocument(tree)).toEqual(before);
	} finally {
		queries.close();
		tree.close();
	}
});
