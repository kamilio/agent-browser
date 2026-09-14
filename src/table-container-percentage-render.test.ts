import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { type DocumentRaster, rasterizeDocument } from "./document-raster.js";
import { documentHitTesting } from "./hit-testing.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const yellow = [255, 255, 0, 255];
const lime = [0, 255, 0, 255];
const cyan = [0, 255, 255, 255];
const black = [0, 0, 0, 255];

afterEach(() => {
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function tableStyle(width: string, extra = "") {
	return `width:${width};margin:0;padding:0;border:0;box-sizing:content-box;border-collapse:separate;border-spacing:0;${extra}`;
}

function fixture(
	width: string,
	options: {
		hostWidth?: string;
		tableCss?: string;
		cellCss?: string;
		rowHeight?: number;
	} = {},
) {
	const tree = new DocumentTree("about:blank");
	documents.push(tree);
	const ids = new Map<string, number>();
	const append = (parent: number, tag: string, name: string, style: string) => {
		const node = tree.createElement(tag, { id: name, style });
		tree.append(parent, node);
		ids.set(name, node);
		return node;
	};
	const id = (name: string) => {
		const found = ids.get(name);
		if (found === undefined) throw new Error(`Missing render fixture ${name}`);
		return found;
	};
	tree.append(tree.root, tree.createDocumentType("html"));
	const html = append(
		tree.root,
		"html",
		"html",
		"margin:0;padding:0;background:white;font-size:8px;line-height:8px",
	);
	const body = append(html, "body", "body", "margin:0;padding:0");
	const host = append(
		body,
		"main",
		"host",
		`display:flow-root;box-sizing:content-box;width:${options.hostWidth ?? "120px"};padding:4px;border:2px solid green`,
	);
	const table = append(
		host,
		"table",
		"table",
		tableStyle(width, options.tableCss),
	);
	const group = append(table, "tbody", "group", "");
	const row = append(group, "tr", "row", `height:${options.rowHeight ?? 12}px`);
	const cellStyle = `padding:0;border:0;box-sizing:border-box;vertical-align:top;${options.cellCss ?? ""}`;
	append(row, "td", "first", `${cellStyle};width:50%;background:red`);
	append(row, "td", "second", `${cellStyle};background:blue`);
	append(host, "div", "after", "height:4px;background:lime");
	const styles = documentStyles(tree);
	styles.setViewport(144, 64);
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	const rectangle = (name: string) => geometry.getBoundingClientRect(id(name));
	const box = (name: string) => {
		const found = layoutDocument(tree).boxes.find(
			(entry) => entry.ref === tree.reference(id(name)),
		);
		if (!found) throw new Error(`Missing render box ${name}`);
		return found;
	};
	return { tree, styles, geometry, hits, id, append, rectangle, box };
}

function pixel(raster: DocumentRaster, horizontal: number, vertical: number) {
	const column = Math.floor(horizontal - raster.clip.x);
	const row = Math.floor(vertical - raster.clip.y);
	if (
		column < 0 ||
		column >= raster.image.width ||
		row < 0 ||
		row >= raster.image.height
	)
		throw new Error("Sample outside table container raster");
	const offset = (row * raster.image.width + column) * 4;
	return [...raster.image.pixels.slice(offset, offset + 4)];
}

it.each([
	{
		model: "separate",
		sizing: "content-box",
		contentWidth: 60,
		tableWidth: 68,
		tableLeft: 32,
		cellLeft: 38,
		cellWidth: 27,
	},
	{
		model: "separate",
		sizing: "border-box",
		contentWidth: 52,
		tableWidth: 60,
		tableLeft: 36,
		cellLeft: 42,
		cellWidth: 23,
	},
	{
		model: "collapse",
		sizing: "content-box",
		contentWidth: 60,
		tableWidth: 62,
		tableLeft: 35,
		cellLeft: 36,
		cellWidth: 30,
	},
	{
		model: "collapse",
		sizing: "border-box",
		contentWidth: 58,
		tableWidth: 60,
		tableLeft: 36,
		cellLeft: 37,
		cellWidth: 29,
	},
])(
	"matches centered pixel geometry, paint and hits for $model $sizing percentage tables",
	({
		model,
		sizing,
		contentWidth,
		tableWidth,
		tableLeft,
		cellLeft,
		cellWidth,
	}) => {
		const options = {
			tableCss: `border-collapse:${model};box-sizing:${sizing};padding:2px;border:2px solid black;border-spacing:2px;margin-left:auto;margin-right:auto;background:yellow`,
			cellCss: "padding:1px;border:2px solid black",
		};
		const percentage = fixture("50%", options);
		const fixed = fixture("60px", options);
		const separated = model === "separate";
		const spacing = separated ? 2 : 0;
		const cellTop = separated ? 12 : 7;
		const tableHeight = separated ? 24 : 14;
		const secondLeft = cellLeft + cellWidth + spacing;
		for (const page of [percentage, fixed]) {
			expect(page.rectangle("host")).toMatchObject({ x: 0, width: 132 });
			expect(page.box("host").contentWidth).toBe(120);
			expect(page.box("table").containingWidth).toBe(120);
			expect(page.box("table").contentWidth).toBe(contentWidth);
			expect(page.rectangle("table")).toMatchObject({
				x: tableLeft,
				y: 6,
				width: tableWidth,
				height: tableHeight,
			});
			expect(page.rectangle("first")).toMatchObject({
				x: cellLeft,
				y: cellTop,
				width: cellWidth,
				height: 12,
			});
			expect(page.rectangle("second")).toMatchObject({
				x: secondLeft,
				y: cellTop,
				width: cellWidth,
				height: 12,
			});
			expect(page.box("first").contentWidth).toBe(
				cellWidth - (separated ? 6 : 4),
			);
			for (const name of ["row", "group"])
				expect(page.rectangle(name)).toMatchObject({
					x: cellLeft,
					y: cellTop,
					width: 2 * cellWidth + spacing,
					height: 12,
				});
			expect(page.rectangle("after")).toMatchObject({
				x: 6,
				y: 6 + tableHeight,
				width: 120,
				height: 4,
			});
			const raster = rasterizeDocument(page.tree);
			for (const [horizontal, vertical, color, target] of [
				[cellLeft + 4, cellTop + 6, red, "first"],
				[secondLeft + 4, cellTop + 6, blue, "second"],
				[tableLeft, cellTop + 6, black, "table"],
				[8, 7 + tableHeight, lime, "after"],
			] as const) {
				expect(pixel(raster, horizontal, vertical)).toEqual(color);
				expect(page.hits.elementFromPoint(horizontal + 0.25, vertical)).toBe(
					page.id(target),
				);
			}
			if (separated) {
				expect(pixel(raster, secondLeft - 1, cellTop + 6)).toEqual(yellow);
				expect(page.hits.elementFromPoint(secondLeft - 1, cellTop + 6)).toBe(
					page.id("row"),
				);
			}
		}
		expect(rasterizeDocument(percentage.tree).image.pixels).toEqual(
			rasterizeDocument(fixed.tree).image.pixels,
		);
	},
);

it.each(["separate", "collapse"])(
	"resolves nested %s percentage widths against cells rather than the viewport",
	(model) => {
		const percentage = fixture("80%", { tableCss: `border-collapse:${model}` });
		const fixed = fixture("96px", { tableCss: `border-collapse:${model}` });
		for (const [page, nestedWidth] of [
			[percentage, "50%"],
			[fixed, "24px"],
		] as const) {
			const nested = page.append(
				page.id("first"),
				"table",
				"nested",
				tableStyle(nestedWidth, `border-collapse:${model};margin-left:auto`),
			);
			const group = page.append(nested, "tbody", "nested-group", "");
			const row = page.append(group, "tr", "nested-row", "height:8px");
			page.append(
				row,
				"td",
				"inner-first",
				"padding:0;width:25%;background:yellow",
			);
			page.append(row, "td", "inner-second", "padding:0;background:cyan");
			expect(page.box("host").contentWidth).toBe(120);
			expect(page.rectangle("host").width).toBe(132);
			expect(page.box("table").containingWidth).toBe(120);
			expect(page.box("nested").containingWidth).toBe(48);
			for (const [name, horizontal, width, height] of [
				["table", 6, 96, 12],
				["first", 6, 48, 12],
				["second", 54, 48, 12],
				["nested", 30, 24, 8],
				["inner-first", 30, 6, 8],
				["inner-second", 36, 18, 8],
			] as const)
				expect(page.rectangle(name)).toMatchObject({
					x: horizontal,
					y: 6,
					width,
					height,
				});
			expect(page.rectangle("after")).toMatchObject({ y: 18, width: 120 });
			const raster = rasterizeDocument(page.tree);
			for (const [horizontal, color, target] of [
				[10, red, "first"],
				[32, yellow, "inner-first"],
				[40, cyan, "inner-second"],
				[60, blue, "second"],
			] as const) {
				expect(pixel(raster, horizontal, 10)).toEqual(color);
				expect(page.hits.elementFromPoint(horizontal, 10)).toBe(
					page.id(target),
				);
			}
			expect(pixel(raster, 8, 20)).toEqual(lime);
			expect(page.hits.elementFromPoint(8, 20)).toBe(page.id("after"));
		}
		expect(rasterizeDocument(percentage.tree).image.pixels).toEqual(
			rasterizeDocument(fixed.tree).image.pixels,
		);
	},
);

it("invalidates percentage geometry, paint, hits and following flow after resize and mutation", () => {
	const page = fixture("50%", { hostWidth: "50vw" });
	const oldRectangle = page.rectangle("table");
	const oldLayout = layoutDocument(page.tree);
	const oldRaster = rasterizeDocument(page.tree);
	const oldPixels = oldRaster.image.pixels.slice();
	expect(page.box("host").contentWidth).toBe(72);
	expect(page.rectangle("host").width).toBe(84);
	expect(oldRectangle).toMatchObject({ x: 6, y: 6, width: 36, height: 12 });
	expect(page.rectangle("first").width).toBe(18);
	expect(page.hits.elementFromPoint(27, 10)).toBe(page.id("second"));
	expect(pixel(oldRaster, 27, 10)).toEqual(blue);
	expect(pixel(oldRaster, 8, 20)).toEqual(lime);
	const builds = {
		geometry: page.geometry.metrics().builds,
		hits: page.hits.metrics().builds,
	};

	page.styles.setViewport(192, 64);
	expect(page.box("host").contentWidth).toBe(96);
	expect(page.rectangle("host").width).toBe(108);
	expect(page.rectangle("table")).toMatchObject({ width: 48, height: 12 });
	expect(page.rectangle("first").width).toBe(24);
	expect(page.hits.elementFromPoint(27, 10)).toBe(page.id("first"));
	const resizedRaster = rasterizeDocument(page.tree);
	expect(pixel(resizedRaster, 27, 10)).toEqual(red);
	expect(page.rectangle("after").y).toBe(18);
	const resizedControl = fixture("48px", { hostWidth: "96px" });
	resizedControl.styles.setViewport(192, 64);
	expect(resizedRaster.image.pixels).toEqual(
		rasterizeDocument(resizedControl.tree).image.pixels,
	);

	page.tree.setAttribute(page.id("table"), "style", tableStyle("75%"));
	page.tree.setAttribute(page.id("row"), "style", "height:20px");
	expect(page.box("table").containingWidth).toBe(96);
	expect(page.rectangle("table")).toMatchObject({
		x: 6,
		y: 6,
		width: 72,
		height: 20,
	});
	expect(page.rectangle("first")).toMatchObject({ width: 36, height: 20 });
	expect(page.rectangle("second")).toMatchObject({
		x: 42,
		width: 36,
		height: 20,
	});
	expect(page.rectangle("after")).toMatchObject({
		x: 6,
		y: 26,
		width: 96,
		height: 4,
	});
	expect(page.hits.elementFromPoint(36, 10)).toBe(page.id("first"));
	expect(page.hits.elementFromPoint(8, 20)).toBe(page.id("first"));
	expect(page.hits.elementFromPoint(8, 28)).toBe(page.id("after"));
	const mutatedRaster = rasterizeDocument(page.tree);
	expect(pixel(mutatedRaster, 36, 10)).toEqual(red);
	expect(pixel(mutatedRaster, 8, 20)).toEqual(red);
	expect(pixel(mutatedRaster, 8, 28)).toEqual(lime);
	const mutatedControl = fixture("72px", { hostWidth: "96px", rowHeight: 20 });
	mutatedControl.styles.setViewport(192, 64);
	expect(mutatedRaster.image.pixels).toEqual(
		rasterizeDocument(mutatedControl.tree).image.pixels,
	);
	expect(page.geometry.metrics().builds).toBeGreaterThan(builds.geometry);
	expect(page.hits.metrics().builds).toBeGreaterThan(builds.hits);
	expect(oldRectangle).toMatchObject({ width: 36, height: 12 });
	expect(
		oldLayout.boxes.find(
			(box) => box.ref === page.tree.reference(page.id("table")),
		),
	).toMatchObject({ borderBoxWidth: 36, borderBoxHeight: 12 });
	expect(oldRaster.image.pixels).toEqual(oldPixels);
	expect(pixel(oldRaster, 27, 10)).toEqual(blue);
	expect(pixel(oldRaster, 8, 20)).toEqual(lime);
});
