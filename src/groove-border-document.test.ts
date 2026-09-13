import { afterEach, expect, it } from "vitest";
import { borderCapabilities, resolveBorders } from "./border-box.js";
import { findClickPoint } from "./click-target.js";
import { resolvedStyleValue } from "./computed-styles.js";
import {
	borderSides,
	normalizeBorderStyle,
	parseBorderShorthand,
} from "./css-border.js";
import { initialBoxStyle } from "./css-box.js";
import { cssSupportsDeclaration } from "./css-parser.js";
import { documentGeometry } from "./document-geometry.js";
import { loadBrowserDocument } from "./document-loader.js";
import { layoutDocument } from "./document-layout.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkRequest } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { RasterImage } from "./raster.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const owners: { tree: DocumentTree; queries: DocumentQueries }[] = [];
afterEach(() => {
	for (const { tree, queries } of owners.splice(0)) {
		queries.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(css = "", markup = '<div id="target"></div>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;background:white;font-size:8px;line-height:8px}${css}</style>${markup}`,
		"https://fixture.invalid/groove",
	);
	const queries = new DocumentQueries(tree);
	owners.push({ tree, queries });
	const styles = documentStyles(tree);
	styles.setViewport(120, 100);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		queries,
		styles,
		id,
		rect: (selector = "#target") =>
			documentGeometry(tree).getBoundingClientRect(id(selector)),
		image: () =>
			rasterizeDocument(tree, { clip: { x: 0, y: 0, width: 120, height: 100 } })
				.image,
	};
}

function pixel(image: RasterImage, horizontal: number, vertical: number) {
	const offset = (vertical * image.width + horizontal) * 4;
	return [...image.pixels.slice(offset, offset + 4)];
}

it.each(["border", ...borderSides.map((side) => `border-${side}`)])(
	"parses an authored %s groove shorthand without filtering diagnostics",
	(property) => {
		const declarations = parseBorderShorthand(
			property,
			"4px groove rgb(100,150,200)",
		);
		expect(declarations).toHaveLength(property === "border" ? 12 : 3);
		expect(
			declarations
				?.filter((entry) => entry.property.endsWith("-style"))
				.every((entry) => entry.value === "groove"),
		).toBe(true);
		expect(
			cssSupportsDeclaration(property, "4px groove rgb(100,150,200)"),
		).toBe(true);
	},
);

it.each(borderSides)(
	"retains canonical computed %s groove style and real width",
	(side) => {
		const page = fixture(
			`#target{width:20px;height:10px;border-${side}:4px groove rgb(100,150,200)}`,
		);
		expect(page.styles.metrics().issues).toEqual({});
		expect(
			resolvedStyleValue(page.tree, page.id(), `border-${side}-style`),
		).toBe("groove");
		expect(
			resolvedStyleValue(page.tree, page.id(), `border-${side}-width`),
		).toBe("4px");
		expect(page.rect()).toMatchObject({
			width: side === "left" || side === "right" ? 24 : 20,
			height: side === "top" || side === "bottom" ? 14 : 10,
		});
	},
);

it("resolves groove geometry without replacing its style with solid", () => {
	expect(borderCapabilities.styles).toContain("groove");
	expect(
		resolveBorders({
			...initialBoxStyle,
			"border-top-style": "groove",
			"border-top-width": "2.5px",
		}),
	).toEqual({ borderTop: 2.5, borderRight: 0, borderBottom: 0, borderLeft: 0 });
});

it.each(["ridge", "inset", "outset", "double", "dotted"])(
	"does not extend authored border admission to %s",
	(style) => {
		expect(normalizeBorderStyle(style)).toBeUndefined();
		expect(parseBorderShorthand("border", `2px ${style} red`)).toBeUndefined();
		expect(cssSupportsDeclaration("border-top-style", style)).toBe(false);
	},
);

it("paints a recessed border rather than a solid rectangle", () => {
	const page = fixture(
		"#target{width:20px;height:10px;border:4px groove rgb(100,150,200)}",
	);
	expect(page.rect()).toMatchObject({ x: 0, y: 0, width: 28, height: 18 });
	const image = page.image();
	expect(pixel(image, 10, 0)).toEqual([50, 75, 100, 255]);
	expect(pixel(image, 10, 2)).toEqual([177, 202, 227, 255]);
	expect(pixel(image, 10, 17)).toEqual([177, 202, 227, 255]);
	expect(pixel(image, 10, 15)).toEqual([50, 75, 100, 255]);
	expect(pixel(image, 0, 8)).toEqual([50, 75, 100, 255]);
	expect(pixel(image, 2, 8)).toEqual([177, 202, 227, 255]);
	expect(pixel(image, 27, 8)).toEqual([177, 202, 227, 255]);
	expect(pixel(image, 25, 8)).toEqual([50, 75, 100, 255]);
	expect(pixel(image, 10, 8)).toEqual([255, 255, 255, 255]);
});

it("keeps border-box dimensions and DOM hit ownership under groove paint", () => {
	const page = fixture(
		"#target{box-sizing:border-box;width:40px;height:30px;padding:3px;border:4px groove red}",
	);
	expect(page.rect()).toMatchObject({ width: 40, height: 30 });
	expect(documentHitTesting(page.tree).elementFromPoint(1, 1)).toBe(page.id());
	expect(findClickPoint(page.tree, page.id()).point).toBeDefined();
	expect(
		layoutDocument(page.tree).boxes.filter(
			(box) => box.ref === page.tree.reference(page.id()),
		),
	).toHaveLength(1);
});

it("renders a legend-free fieldset with its unchanged UA groove defaults", () => {
	const page = fixture(
		"#child{width:20px;height:10px;background:blue}",
		'<fieldset id="target"><div id="child"></div></fieldset>',
	);
	const source = serializeHtml(page.tree),
		revision = page.tree.revision;
	expect(page.styles.box(page.id())["border-top-style"]).toBe("groove");
	expect(buildFormattingTree(page.tree).issues).toEqual({});
	expect(page.rect()).toMatchObject({ x: 2, y: 0, width: 116 });
	expect(page.rect().height).toBeCloseTo(21.8);
	expect(page.rect("#child").x).toBe(10);
	expect(page.rect("#child").y).toBeCloseTo(4.8);
	const image = page.image();
	expect(pixel(image, 40, 0)).toEqual([120, 120, 120, 255]);
	expect(pixel(image, 40, 1)).toEqual([247, 247, 247, 255]);
	expect(pixel(image, 2, 10)).toEqual([120, 120, 120, 255]);
	expect(pixel(image, 3, 10)).toEqual([247, 247, 247, 255]);
	expect(pixel(image, 117, 10)).toEqual([247, 247, 247, 255]);
	expect(pixel(image, 116, 10)).toEqual([120, 120, 120, 255]);
	expect(pixel(image, 12, 8)).toEqual([0, 0, 255, 255]);
	expect(page.tree.revision).toBe(revision);
	expect(serializeHtml(page.tree)).toBe(source);
});

it("retains anonymous content ownership and a unique real fieldset reference", () => {
	const page = fixture(
		"#target{width:80px;margin:0;padding:4px;border-width:2px}#child{height:10px}",
		'<fieldset id="target"><div id="child"></div></fieldset>',
	);
	const layout = layoutDocument(page.tree),
		formatting = layout.text.horizontal.formatting;
	const outer = formatting.nodes.find(
		(node) => node.ref === page.tree.reference(page.id()),
	);
	expect(outer?.fieldsetContent).toBeTypeOf("number");
	const content = formatting.nodes[outer?.fieldsetContent as number];
	expect(content.fieldsetOwner).toBe(outer?.id);
	expect(content.ref).toBeUndefined();
	expect(
		layout.boxes.filter((box) => box.ref === page.tree.reference(page.id())),
	).toHaveLength(1);
	expect(page.rect()).toMatchObject({ width: 84, height: 22 });
});

it("does not conceal visible legends behind the newly admitted groove fieldset", () => {
	const page = fixture(
		"",
		'<fieldset id="target"><legend id="legend">Visible</legend><input></fieldset>',
	);
	const formatting = buildFormattingTree(page.tree);
	expect(
		formatting.nodes.find((node) => node.ref === page.tree.reference(page.id()))
			?.fieldsetContent,
	).toBeTypeOf("number");
	expect(
		formatting.nodes.find(
			(node) => node.ref === page.tree.reference(page.id("#legend")),
		)?.deferredReason,
	).toBe("element-layout-not-supported");
	expect(() => layoutDocument(page.tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("updates shaded currentcolor through native style mutation without stale pixels", () => {
	const page = fixture(
		"#target{width:20px;height:10px;color:rgb(100,150,200);border:4px groove}",
	);
	expect(pixel(page.image(), 10, 0)).toEqual([50, 75, 100, 255]);
	page.tree.setAttribute(page.id(), "style", "color:rgb(200,100,50)");
	expect(pixel(page.image(), 10, 0)).toEqual([100, 50, 25, 255]);
	expect(pixel(page.image(), 10, 2)).toEqual([227, 177, 152, 255]);
});

it("accepts variables and inherited groove declarations as the same native border", () => {
	const page = fixture(
		"#parent{border-top:2px groove blue;--style:groove}#target{width:20px;height:10px;border-top:inherit;border-bottom:2px var(--style) red}",
		'<div id="parent"><div id="target"></div></div>',
	);
	expect(page.styles.metrics().issues).toEqual({});
	expect(page.styles.box(page.id())["border-top-style"]).toBe("groove");
	expect(page.styles.box(page.id())["border-bottom-style"]).toBe("groove");
	expect(page.rect()).toMatchObject({ width: 20, height: 14 });
});

it("uses real pointer form activation inside a default legend-free fieldset", async () => {
	const captured: NetworkRequest[] = [];
	let transport: NodeNetworkTransport | undefined;
	const markup =
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}fieldset{width:200px}</style><form action="/done" method="post"><fieldset><input name="query" value="native"><button>Send</button></fieldset></form>';
	const session = new BrowserSession({
		createTransport: (cookieJar) => {
			transport = new NodeNetworkTransport({
				cookieJar,
				allowedOrigins: ["https://fixture.invalid"],
			});
			const owner = transport;
			return {
				limits: owner.limits,
				metrics: () => owner.metrics(),
				close: () => owner.close(),
				request: (request) => {
					captured.push(request);
					return owner.requestWithRoutes(request, (route) => ({
						url: route.url,
						status: 200,
						headers: {
							"content-type": [
								route.method === "POST" ? "text/plain" : "text/html",
							],
						},
						body: new TextEncoder().encode(
							route.method === "POST" ? "unit response" : markup,
						),
						encodedBytes: 0,
						elapsedMs: 0,
						redirects: [],
					}));
				},
			};
		},
		loadDocument: loadBrowserDocument,
	});
	try {
		const tab = session.createTab();
		await session.navigate(tab.id, "https://fixture.invalid/form");
		const page = session.page(tab.id),
			button = page.queries.querySelector("button");
		expect(button).not.toBeNull();
		const clicked = await session.click(
			tab.id,
			page.document.reference(button as number),
		);
		expect(clicked.navigation?.kind).toBe("document");
		expect(captured.map((request) => request.method ?? "GET")).toEqual([
			"GET",
			"POST",
		]);
		expect(new TextDecoder().decode(captured[1].body as Uint8Array)).toBe(
			"query=native",
		);
		expect(session.page(tab.id).document.url).toBe(
			"https://fixture.invalid/done",
		);
	} finally {
		session.close();
		expect(transport?.metrics()).toMatchObject({
			mockedRequests: 2,
			closed: true,
			active: 0,
		});
	}
});
