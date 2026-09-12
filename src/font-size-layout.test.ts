import { afterEach, expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { controlChecked } from "./controls.js";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const sessions: BrowserSession[] = [];
const pageUrl = "https://fixture.invalid/font-size-layout";
const base =
	"html,body{margin:0;padding:0}html{font-size:8px;line-height:1}main{width:120px}#target{display:inline-block;background:red}";

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const query of queries.splice(0)) query.close();
	for (const tree of documents.splice(0)) tree.close();
});

function markup(css: string, content = '<span id="target">AA</span>') {
	return `<!doctype html><style>${base}</style><style id="sheet">${css}</style><main id="main">${content}</main>`;
}

function fixture(css: string, content?: string) {
	const tree = parseHtmlDocument(markup(css, content), pageUrl);
	documents.push(tree);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const styles = documentStyles(tree);
	styles.setViewport(128, 96);
	const id = (selector = "#target") => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		styles,
		id,
		text: (selector = "#target") => styles.text(id(selector)),
		rect: (selector = "#target") =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
	};
}

function pixel(tree: DocumentTree, horizontal: number, vertical: number) {
	const image = rasterizeDocument(tree, {
		clip: { x: 0, y: 0, width: 128, height: 96 },
	}).image;
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each([
	["x-small", 12, 18],
	["x-large", 24, 36],
] as const)(
	"uses %s pixels for actual atomic text geometry, raster and hits",
	(keyword, size, width) => {
		const { tree, styles, id, text, rect } = fixture(
			`#target{font-size:${keyword}}`,
		);
		expect(text()["font-size"]).toBe(`${size}px`);
		expect(resolvedStyleValue(tree, id(), "font-size")).toBe(`${size}px`);
		expect(rect()).toMatchObject({ x: 0, y: 0, width, height: size });
		const context = layoutDocument(tree).contexts.find(
			(entry) => entry.ref === tree.reference(id()),
		);
		expect(
			context?.glyphs.map((glyph) => [
				glyph.character,
				glyph.fontSize,
				glyph.x,
				glyph.y,
			]),
		).toEqual([
			["A", size, 0, 0],
			["A", size, width / 2, 0],
		]);
		expect(pixel(tree, 1, size - 1)).toEqual([255, 0, 0, 255]);
		expect(documentHitTesting(tree).elementFromPoint(1, size - 1)).toBe(id());
		expect(styles.metrics().issues).toEqual({});
		expect(buildFormattingTree(tree).issues).toEqual({});
	},
);

it("uses keyword pixels for ordinary inline text without requiring an atomic box", () => {
	const { tree, id, rect } = fixture(
		"#target{display:inline;font-size:x-large}",
	);
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 36, height: 24 });
	expect(
		layoutDocument(tree)
			.contexts.flatMap((context) => context.glyphs)
			.map((glyph) => [glyph.x, glyph.y, glyph.fontSize]),
	).toEqual([
		[0, 0, 24],
		[18, 0, 24],
	]);
	expect(documentHitTesting(tree).elementFromPoint(1, 23)).toBe(id());
});

it.each([
	["normal", 30],
	["1.5", 36],
	["2", 48],
] as const)(
	"uses computed keyword pixels for line-height %s",
	(lineHeight, height) => {
		const { rect, text } = fixture(
			`#target{font-size:x-large;line-height:${lineHeight}}`,
		);
		expect(text()["font-size"]).toBe("24px");
		expect(text()["line-height"]).toBe(lineHeight);
		expect(rect()).toMatchObject({ width: 36, height });
	},
);

it("resolves root rem line height using the absolute keyword root size", () => {
	const { text, rect } = fixture(
		"html{font-size:x-large;line-height:2rem}#target{font-size:larger}",
	);
	expect(text("html")).toMatchObject({
		"font-size": "24px",
		"line-height": "48px",
	});
	expect(Number.parseFloat(text()["font-size"])).toBeCloseTo(28.8, 12);
	expect(text()["line-height"]).toBe("48px");
	expect(rect().width).toBeCloseTo(43.2, 12);
	expect(rect().height).toBe(48);
});

it("resolves a root relative keyword from the initial size before descendant rem units", () => {
	const { text, rect } = fixture(
		"html{font-size:larger;line-height:1rem}#target{font-size:1rem}",
	);
	expect(text("html")).toMatchObject({
		"font-size": "19.2px",
		"line-height": "19.2px",
	});
	expect(text()["font-size"]).toBe("19.2px");
	expect(rect().width).toBeCloseTo(28.8, 12);
	expect(rect().height).toBeCloseTo(19.2, 12);
});

it.each([
	["2", "2", 40],
	["200%", "48px", 48],
] as const)(
	"preserves the inheritance distinction for line-height %s",
	(specified, computed, height) => {
		const { text, rect } = fixture(
			`main{font-size:x-large;line-height:${specified}}#target{font-size:smaller}`,
		);
		expect(text()["font-size"]).toBe("20px");
		expect(text()["line-height"]).toBe(computed);
		expect(rect()).toMatchObject({ width: 30, height });
	},
);

it("shares inherited relative-size snapshots without applying the ratio to text descendants again", () => {
	const { tree, styles, id, text, rect } = fixture(
		"main{font-size:20px}#target{font-size:larger}",
		'<span id="target"><span id="child">AA</span></span>',
	);
	const before = text();
	expect(before["font-size"]).toBe("24px");
	expect(text("#child")).toBe(before);
	expect(styles.text(tree.get(id("#child")).children[0])).toBe(before);
	expect(rect().width).toBe(36);
	tree.setAttribute(id("#main"), "style", "font-size:40px");
	expect(text()["font-size"]).toBe("48px");
	expect(text("#child")).toBe(text());
	expect(rect().width).toBe(72);
	expect(before["font-size"]).toBe("24px");
	expect(Object.isFrozen(before)).toBe(true);
});

it("resolves absolute and relative keywords through custom properties and invalidates their dependents", () => {
	const { tree, id, text, rect } = fixture(
		"html{--size:x-large}main{font-size:20px}#target{font-size:var(--size)}",
	);
	const before = text();
	expect(before["font-size"]).toBe("24px");
	expect(rect().width).toBe(36);
	tree.setAttribute(id("#main"), "style", "--size:smaller");
	expect(Number.parseFloat(text()["font-size"])).toBeCloseTo(20 / 1.2, 12);
	expect(rect().width).toBeCloseTo(25, 12);
	expect(before["font-size"]).toBe("24px");
});

it("activates supported keyword feature queries without exposing inactive unsupported declarations", () => {
	const { tree, styles, text, rect } = fixture(
		"@supports (font-size:x-large){#target{font-size:x-large}}@supports (font-size:math){#target{animation-name:spin}}",
	);
	expect(text()["font-size"]).toBe("24px");
	expect(rect()).toMatchObject({ width: 36, height: 24 });
	expect(styles.metrics().issues).toEqual({});
	expect(buildFormattingTree(tree).issues).toEqual({});
});

it("retains raw invalid typography diagnostics while scoping their applicability to media", () => {
	const { tree, styles, text, rect } = fixture(
		"#target{font-size:x-large}@media print{#target{font-size:math}}@media (min-width:200px){#target{font-style:italic}}",
	);
	expect(styles.metrics().issues).toEqual({
		"unimplemented-or-invalid-css-value": 1,
		"unimplemented-css-property": 1,
	});
	expect(styles.metrics().applicableIssues).toEqual({});
	expect(rect().width).toBe(36);
	styles.setViewport(256, 96);
	expect(text()["font-size"]).toBe("24px");
	expect(styles.metrics().applicableIssues).toEqual({
		"unimplemented-css-property": 1,
	});
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each([
	["font-family:serif", "unimplemented-or-invalid-css-value"],
	["font-style:italic", "unimplemented-css-property"],
	["font:small monospace", "unimplemented-css-property"],
	["font-size:math", "unimplemented-or-invalid-css-value"],
	["font-size:calc(1px + 1px)", "unimplemented-or-invalid-css-value"],
	["animation-name:spin", "unimplemented-css-property"],
])(
	"does not mask the independent %s guard with a supported keyword",
	(declaration, issue) => {
		const { tree, styles } = fixture(
			`#target{font-size:x-large;${declaration}}`,
		);
		expect(styles.metrics().issues[issue]).toBe(1);
		expect(styles.metrics().applicableIssues[issue]).toBe(1);
		expect(buildFormattingTree(tree).issues[`css:${issue}`]).toBe(1);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(() => rasterizeDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("sizes an atomic box beside a float from keyword-sized glyph advances", () => {
	const { tree, id, rect } = fixture(
		"main{width:60px}#float{float:left;width:12px;height:48px;background:blue}#target{font-size:x-large}",
		'<span id="float"></span><span id="target">AA</span>',
	);
	expect(rect("#float")).toMatchObject({ x: 0, y: 0, width: 12, height: 48 });
	expect(rect()).toMatchObject({ x: 12, y: 0, width: 36, height: 24 });
	expect(pixel(tree, 13, 23)).toEqual([255, 0, 0, 255]);
	expect(documentHitTesting(tree).elementFromPoint(13, 23)).toBe(id());
});

it("uses keyword glyph sizes for an auto-width float rather than the inherited medium size", () => {
	const { rect } = fixture(
		"main{width:60px}#target{float:left;font-size:x-large}",
	);
	expect(rect()).toMatchObject({ x: 0, y: 0, width: 36, height: 24 });
	expect(rect("#main").height).toBe(0);
});

it("invalidates keyword-sized geometry, raster and hits after stylesheet replacement", () => {
	const { tree, id, text, rect } = fixture("#target{font-size:x-large}");
	const original = rect();
	const before = text();
	const hits = documentHitTesting(tree);
	expect(original).toMatchObject({ width: 36, height: 24 });
	expect(hits.elementFromPoint(30, 23)).toBe(id());
	tree.setTextContent(id("#sheet"), "#target{font-size:x-small}");
	expect(rect()).toMatchObject({ width: 18, height: 12 });
	expect(hits.elementFromPoint(30, 23)).not.toBe(id());
	expect(pixel(tree, 1, 11)).toEqual([255, 0, 0, 255]);
	expect(pixel(tree, 30, 23)).toEqual([255, 255, 255, 255]);
	expect(original).toMatchObject({ width: 36, height: 24 });
	expect(before["font-size"]).toBe("24px");
});

it("keeps absolute keyword pixels fixed while viewport width changes atomic wrapping", () => {
	const { styles, text, rect } = fixture(
		"main{width:auto}#target{font-size:x-large}",
		'<span id="target">AA BB</span>',
	);
	expect(text()["font-size"]).toBe("24px");
	expect(rect()).toMatchObject({ width: 90, height: 24 });
	styles.setViewport(64, 96);
	expect(text()["font-size"]).toBe("24px");
	expect(rect()).toMatchObject({ width: 64, height: 48 });
	styles.setViewport(128, 96);
	expect(rect()).toMatchObject({ width: 90, height: 24 });
});

it("keeps native font limits distinct from CSS parsing diagnostics", () => {
	const { tree, styles, text } = fixture(
		"main{font-size:500px}#target{font-size:larger}",
	);
	expect(text()["font-size"]).toBe("600px");
	expect(styles.metrics().issues).toEqual({});
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(() => rasterizeDocument(tree)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("activates a native control inside a keyword-sized label and closes its owners", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				if (request.url !== pageUrl)
					throw new Error(`Unexpected in-memory request: ${request.url}`);
				requests.push(request);
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				markup(
					"#target{font-size:x-large}#control{width:12px;height:12px;margin:0;padding:0;border:0}",
					'<label id="target">AA<input id="control" type="checkbox"></label>',
				),
				response.url,
			),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, pageUrl);
	const page = session.page(tab.id);
	const tree = page.document;
	const styles = documentStyles(tree);
	styles.setViewport(128, 96);
	const target = page.queries.querySelector("#target");
	const control = page.queries.querySelector("#control");
	if (target === null || control === null)
		throw new Error("Missing native control fixture");
	const geometry = documentGeometry(tree);
	const hits = documentHitTesting(tree);
	expect(styles.text(target)["font-size"]).toBe("24px");
	expect(geometry.getBoundingClientRect(target).width).toBe(48);
	expect(geometry.getBoundingClientRect(control)).toMatchObject({
		x: 36,
		width: 12,
		height: 12,
	});
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(control, type, () =>
			events.push(type),
		);
	expect(controlChecked(tree, control)).toBe(false);
	await session.click(tab.id, tree.reference(control));
	expect(controlChecked(tree, control)).toBe(true);
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([pageUrl]);
	expect(closed).toBe(false);
	session.close();
	expect(closed).toBe(true);
	expect(hits.metrics()).toMatchObject({ closed: true, regions: 0 });
	expect(() => geometry.getBoundingClientRect(control)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => styles.metrics()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => tree.get(control)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(requests).toHaveLength(1);
});
