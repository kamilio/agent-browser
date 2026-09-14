import { afterEach, expect, it } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentGeometry } from "./document-geometry.js";
import { documentHitTesting } from "./hit-testing.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentElementScroll } from "./element-scroll.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(markup = "", css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0}#target{width:40px;height:20px;background:red}${css}</style><main><div id=before></div><div id=target></div><div id=after></div>${markup}</main>`,
		"https://fixture.invalid/clear",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(100, 100);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing clear fixture ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		rectangle: (selector: string) =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

it.each(["left", "right", "both", "inline-start", "inline-end"])(
	"preserves native geometry, paint and hit ownership for clear:%s without floats",
	(value) => {
		const test = fixture();
		const before = test.rectangle("#target");
		const pixels = rasterizeDocument(test.tree).image.pixels;
		test.tree.setAttribute(test.id("#target"), "style", `clear:${value}`);
		expect(documentStyles(test.tree).flow(test.id("#target")).clear).toBe(
			value,
		);
		expect(buildFormattingTree(test.tree).issues).toEqual({});
		expect(test.rectangle("#target")).toEqual(before);
		expect(rasterizeDocument(test.tree).image.pixels).toEqual(pixels);
		expect(
			documentHitTesting(test.tree).elementFromPoint(
				before.x + 10,
				before.y + 10,
			),
		).toBe(test.id("#target"));
	},
);

it("does not introduce clearance into an empty block's collapsing margins without floats", () => {
	const test = fixture(
		"",
		"#before{height:10px;margin-bottom:20px}#target{height:0;margin-top:7px;margin-bottom:4px}#after{height:10px;margin-top:12px}",
	);
	const before = test.rectangle("#after");
	expect(before.y).toBe(30);
	test.tree.setAttribute(test.id("#target"), "style", "clear:both");
	expect(test.rectangle("#after")).toEqual(before);
	expect(documentStyles(test.tree).flow(test.id("#target")).clear).toBe("both");
});

it.each(["before", "target", "after"])(
	"retains raw float and clear diagnostics with coordinated geometry at #%s",
	(selector) => {
		const test = fixture(
			"",
			`#before,#target,#after{clear:both}#${selector}{float:left}`,
		);
		const issues = buildFormattingTree(test.tree).issues;
		expect(issues["float-layout-not-supported"]).toBe(1);
		expect(issues["clear-layout-not-supported"]).toBe(3);
		expect(test.rectangle("#target")).toMatchObject({
			x: 0,
			y: 0,
			width: 40,
			height: 20,
		});
	},
);

it("does not count a display-none float as a clearance dependency", () => {
	const test = fixture(
		"",
		"#before{float:left;display:none}#target{clear:both}",
	);
	expect(buildFormattingTree(test.tree).issues).toEqual({});
	expect(test.rectangle("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 40,
		height: 20,
	});
});

it("does not count overridden or unmatched float declarations", () => {
	const test = fixture(
		"",
		".missing{float:left}#before{float:left;float:none}#target{clear:both}",
	);
	expect(buildFormattingTree(test.tree).issues).toEqual({});
	expect(test.rectangle("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 40,
		height: 20,
	});
});

it("invalidates clearance admission when a float is revealed and hidden again", () => {
	const test = fixture(
		"",
		"#before{float:left;display:none;height:24px}#target{clear:both}",
	);
	const before = test.rectangle("#target");
	test.tree.setAttribute(test.id("#before"), "style", "display:block");
	expect(buildFormattingTree(test.tree).issues).toMatchObject({
		"float-layout-not-supported": 1,
		"clear-layout-not-supported": 1,
	});
	expect(test.rectangle("#target")).toMatchObject({ y: 24, height: 20 });
	test.tree.setAttribute(test.id("#before"), "style", "display:none");
	expect(buildFormattingTree(test.tree).issues).toEqual({});
	expect(test.rectangle("#target")).toEqual(before);
});

it("preserves float clearance while clipping and scrolling overflow:hidden content", () => {
	const test = fixture(
		"",
		"#before{float:left;width:12px;height:24px}#target{clear:both;overflow:hidden}",
	);
	const child = test.tree.createElement("div", {
		id: "content",
		style: "width:80px;height:40px;background:blue",
	});
	test.tree.append(test.id("#target"), child);
	const issues = buildFormattingTree(test.tree).issues;
	expect(issues["overflow-layout-not-supported"]).toBeUndefined();
	expect(issues).toMatchObject({
		"float-layout-not-supported": 1,
		"clear-layout-not-supported": 1,
	});
	expect(test.rectangle("#target")).toMatchObject({ y: 24, height: 20 });
	const scroll = documentElementScroll(test.tree);
	expect(scroll.get(test.id("#target"))).toMatchObject({
		scrollWidth: 80,
		scrollHeight: 40,
	});
	scroll.to(test.id("#target"), 10, 10);
	expect(test.rectangle("#target")).toMatchObject({ y: 24, height: 20 });
	const rectangle = test.rectangle("#content");
	expect(rectangle).toMatchObject({ x: -10, y: 14, width: 80, height: 40 });
	expect(
		documentGeometry(test.tree).clipClientRect(child, rectangle),
	).toMatchObject({ x: 0, y: 24, width: 40, height: 20 });
	expect(documentHitTesting(test.tree).elementFromPoint(1, 25)).toBe(child);
	expect(documentHitTesting(test.tree).elementsFromPoint(41, 25)).not.toContain(
		child,
	);
});

it.each([["filter:blur(2px)", "css:unimplemented-css-property"]])(
	"retains independent unsupported %s diagnostics alongside clear",
	(declaration, issue) => {
		const test = fixture("", `#target{clear:both;${declaration}}`);
		const issues = buildFormattingTree(test.tree).issues;
		expect(issues[issue]).toBe(1);
		expect(issues["clear-layout-not-supported"]).toBeUndefined();
		expect(() => test.rectangle("#target")).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);
