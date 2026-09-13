import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { isControlDisabled } from "./controls.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";
import type { NetworkRequest } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";
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
const markup =
	'<fieldset id="target"><legend id="caption">AB</legend><div id="child"></div></fieldset>';
type LegendFormattingTree = Omit<FormattingTree, "nodes"> & {
	nodes: readonly (FormattingTree["nodes"][number] & {
		fieldsetLegend?: number;
		legendOwner?: number;
	})[];
};
function fixture(css = "", content = markup) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0;padding:0;font-size:8px;line-height:8px;background:white}main{width:200px}fieldset{width:100px;margin:0;padding:3px 7px 11px 5px;border:2px solid red;background:yellow}#child{width:20px;height:10px;background:blue}${css}</style><main>${content}</main>`,
		"https://fixture.invalid/fieldset-legend",
	);
	const queries = new DocumentQueries(tree);
	owners.push({ tree, queries });
	documentStyles(tree).setViewport(240, 160);
	const id = (selector: string) => {
		const result = queries.querySelector(selector);
		if (result === null) throw new Error(`Missing ${selector}`);
		return result;
	};
	const rect = (selector: string) =>
		documentGeometry(tree).getBoundingClientRect(id(selector));
	const formatting = () => buildFormattingTree(tree) as LegendFormattingTree;
	const rendered = () => {
		const result = formatting();
		const fieldset = result.nodes.find(
			(node) => node.ref === tree.reference(id("#target")),
		);
		return fieldset?.fieldsetLegend === undefined
			? null
			: result.nodes[fieldset.fieldsetLegend].ref;
	};
	return { tree, queries, id, rect, formatting, rendered };
}

it("keeps rendered legend and anonymous content as distinct owned child boxes", () => {
	const page = fixture();
	const revision = page.tree.revision,
		source = serializeHtml(page.tree);
	const formatting = page.formatting();
	expect(formatting.issues).toEqual({});
	const outer = formatting.nodes.find(
		(node) => node.ref === page.tree.reference(page.id("#target")),
	)!;
	const legend = formatting.nodes[outer.fieldsetLegend as number];
	const content = formatting.nodes[outer.fieldsetContent as number];
	expect(outer.children).toEqual([legend.id, content.id]);
	expect(legend).toMatchObject({
		ref: page.tree.reference(page.id("#caption")),
		parent: outer.id,
		legendOwner: outer.id,
		level: "block",
		display: "flow-root",
		independentContext: true,
	});
	expect(content).toMatchObject({
		parent: outer.id,
		fieldsetOwner: outer.id,
		display: "flow-root",
	});
	expect(content.ref).toBeUndefined();
	expect(
		formatting.nodes.filter((node) => node.ref === legend.ref),
	).toHaveLength(1);
	expect(documentStyles(page.tree).get(page.id("#caption")).display).toBe(
		"inline",
	);
	expect(page.tree.revision).toBe(revision);
	expect(serializeHtml(page.tree)).toBe(source);
});

it("reserves legend height, constrains width by fieldset padding and interrupts actual border pixels", () => {
	const page = fixture();
	expect(page.rect("#target")).toMatchObject({
		x: 0,
		y: 0,
		width: 104,
		height: 34,
	});
	expect(page.rect("#caption")).toMatchObject({
		x: 7,
		y: 0,
		width: 16,
		height: 8,
	});
	expect(page.rect("#child")).toMatchObject({
		x: 7,
		y: 11,
		width: 20,
		height: 10,
	});
	const image = rasterizeDocument(page.tree).image;
	const pixel = (column: number, row: number) =>
		Array.from(
			image.pixels.slice(
				(row * image.width + column) * 4,
				(row * image.width + column) * 4 + 4,
			),
		);
	expect(pixel(6, 3)).toEqual([255, 0, 0, 255]);
	expect(pixel(7, 3)).toEqual([255, 255, 0, 255]);
	expect(pixel(23, 3)).toEqual([255, 0, 0, 255]);
	expect(pixel(0, 2)).toEqual([255, 255, 255, 255]);
	expect(pixel(0, 3)).toEqual([255, 0, 0, 255]);
	expect(pixel(0, 33)).toEqual([255, 0, 0, 255]);
	expect(pixel(7, 11)).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(page.tree).elementFromPoint(8, 1)).toBe(
		page.id("#caption"),
	);
	expect(documentHitTesting(page.tree).elementFromPoint(8, 12)).toBe(
		page.id("#child"),
	);
});

it.each(["inline", "inline-block", "block", "flow-root"])(
	"blockifies a rendered %s legend without changing computed display",
	(display) => {
		const page = fixture(`legend{display:${display}}`);
		expect(page.formatting().issues).toEqual({});
		expect(page.rect("#caption")).toMatchObject({
			x: 7,
			y: 0,
			width: 16,
			height: 8,
		});
		expect(documentStyles(page.tree).get(page.id("#caption")).display).toBe(
			display,
		);
	},
);

it.each([
	["legend{width:40px}", 7, 44],
	["legend{width:40px;margin-left:auto}", 51, 44],
	["legend{width:40px;margin-left:auto;margin-right:auto}", 29, 44],
	["legend{width:40px;box-sizing:border-box}", 7, 40],
	["legend{min-width:30px}", 7, 34],
])("uses block inline-axis sizing for %s", (css, x, width) => {
	const page = fixture(css as string);
	expect(page.rect("#caption")).toMatchObject({ x, width });
});

it.each([
	[
		'<legend id="caption">AB</legend><legend id="later">CD</legend>',
		"#caption",
	],
	['before<legend id="caption">AB</legend><div id="child"></div>', "#caption"],
	[
		'<legend style="display:none">Hidden</legend><legend id="caption">AB</legend>',
		"#caption",
	],
	[
		'<div style="display:contents"><legend id="caption">AB</legend></div>',
		"#caption",
	],
	[
		'<legend style="display:contents">Plain</legend><legend id="caption">AB</legend>',
		"#caption",
	],
	[
		'<div><legend id="nested">Plain</legend></div><legend id="caption">AB</legend>',
		"#caption",
	],
])("selects the first qualifying child box in %s", (children, selected) => {
	const page = fixture("", `<fieldset id="target">${children}</fieldset>`);
	expect(page.rendered()).toBe(page.tree.reference(page.id(selected)));
	expect(page.formatting().issues).toEqual({});
	expect(() => layoutDocument(page.tree)).not.toThrow();
});

it("keeps a visibility-hidden legend's box and selection", () => {
	const page = fixture("legend{visibility:hidden}");
	expect(page.rendered()).toBe(page.tree.reference(page.id("#caption")));
	expect(page.rect("#target").height).toBe(34);
	expect(page.rect("#child").y).toBe(11);
});

it("resolves fieldset percentage padding against its containing block", () => {
	const page = fixture("fieldset{padding:10%}");
	expect(page.rect("#caption")).toMatchObject({
		x: 22,
		y: 0,
		width: 16,
		height: 8,
	});
	expect(page.rect("#child")).toMatchObject({ x: 22, y: 28 });
	expect(page.rect("#target").height).toBe(60);
});

it("wraps fit-content legend text within the padded available width", () => {
	const page = fixture(
		"fieldset{width:40px;min-width:0}",
		markup.replace(">AB<", ">AB CD<"),
	);
	expect(page.rect("#caption")).toMatchObject({
		x: 7,
		y: 0,
		width: 28,
		height: 16,
	});
	expect(page.rect("#child").y).toBe(19);
	expect(page.rect("#target")).toMatchObject({ width: 44, height: 42 });
});

it.each([
	{
		display: "block",
		width: "0px",
		legendWidth: 100,
		content: "",
		expected: 100,
	},
	{
		display: "inline-block",
		width: "auto",
		legendWidth: 100,
		content: "",
		expected: 100,
	},
	{
		display: "block",
		width: "0px",
		legendWidth: 100,
		content: '<div style="width:120px;height:10px"></div>',
		expected: 160,
	},
	{
		display: "inline-block",
		width: "auto",
		legendWidth: 100,
		content: '<div style="width:120px;height:10px"></div>',
		expected: 160,
	},
	{
		display: "block",
		width: "0px",
		legendWidth: 80,
		content: "ABC DEFG",
		expected: 80,
	},
	{
		display: "inline-block",
		width: "auto",
		legendWidth: 80,
		content: "ABC DEFG",
		expected: 88,
	},
])(
	"corrects anonymous percentage padding before choosing intrinsic contributions: $display/$expected",
	({ display, width, legendWidth, content, expected }) => {
		const page = fixture(
			`fieldset{display:${display};width:${width};border:0;padding:0 10%}legend{width:${legendWidth}px;min-width:0;margin:0;padding:0;border:0}`,
			`<fieldset id="target"><legend id="caption">AB</legend>${content}</fieldset>`,
		);
		expect(page.rect("#target").width).toBe(expected);
	},
);

it("charges both legend search and suffix movement before extracting a child", () => {
	const siblings = Array.from({ length: 32 }, () => "<div>child</div>").join(
		"",
	);
	const first = fixture(
		"",
		`<fieldset id="target"><legend id="caption">AB</legend>${siblings}</fieldset>`,
	);
	const last = fixture(
		"",
		`<fieldset id="target">${siblings}<legend id="caption">AB</legend></fieldset>`,
	);
	const firstWork = first.formatting().metrics.work;
	const lastWork = last.formatting().metrics.work;
	expect(firstWork).toBe(lastWork);
	for (const page of [first, last]) {
		expect(() =>
			buildFormattingTree(page.tree, { maxWork: firstWork }),
		).not.toThrow();
		expect(() =>
			buildFormattingTree(page.tree, { maxWork: firstWork - 1 }),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	}
});

it("centers a shorter legend inside a thicker block-start border", () => {
	const page = fixture("fieldset{border-width:12px}");
	expect(page.rect("#caption")).toMatchObject({
		x: 17,
		y: 2,
		width: 16,
		height: 8,
	});
	expect(page.rect("#child")).toMatchObject({ x: 17, y: 15 });
	expect(page.rect("#target")).toMatchObject({ width: 124, height: 48 });
});

it.each(["inline-block", "inline", "flow-root"])(
	"keeps legend geometry in an %s fieldset",
	(display) => {
		const page = fixture(`fieldset{display:${display}}`);
		const outer = page.rect("#target"),
			caption = page.rect("#caption"),
			child = page.rect("#child");
		expect(outer).toMatchObject({ width: 104, height: 34 });
		expect(caption.x - outer.x).toBe(7);
		expect(caption.y - outer.y).toBe(0);
		expect(child.y - outer.y).toBe(11);
		expect(() => rasterizeDocument(page.tree)).not.toThrow();
	},
);

it.each(["float:left", "position:absolute"])(
	"skips a %s legend when choosing the rendered box",
	(declaration) => {
		const page = fixture(
			"",
			`<fieldset id="target"><legend id="first" style="${declaration}">X</legend><legend id="caption">AB</legend><div id="child"></div></fieldset>`,
		);
		expect(page.rendered()).toBe(page.tree.reference(page.id("#caption")));
		expect(() => layoutDocument(page.tree)).not.toThrow();
	},
);

it("does not change the first-DOM-legend disabled exception when rendered selection differs", () => {
	const page = fixture(
		"",
		'<fieldset id="target" disabled><legend hidden><input id="exempt"></legend><legend id="caption">AB<input id="disabled"></legend><div id="child"></div></fieldset>',
	);
	expect(page.rendered()).toBe(page.tree.reference(page.id("#caption")));
	expect(isControlDisabled(page.tree, page.id("#exempt"))).toBe(false);
	expect(isControlDisabled(page.tree, page.id("#disabled"))).toBe(true);
});

it("retains fieldset generated content inside the anonymous box", () => {
	const page = fixture(
		'fieldset::before{content:"before";display:block}fieldset::after{content:"after";display:block}',
	);
	const formatting = page.formatting();
	const outer = formatting.nodes.find(
		(node) => node.ref === page.tree.reference(page.id("#target")),
	)!;
	expect(outer.children[0]).toBe(outer.fieldsetLegend);
	const generated = formatting.nodes.filter(
		(node) => node.generatedContent?.owner === page.id("#target"),
	);
	expect(generated.length).toBeGreaterThan(0);
	for (const node of generated) {
		let current = node;
		for (
			let depth = 0;
			depth < 10 && current.id !== outer.fieldsetContent;
			depth++
		) {
			expect(current.parent).toBeTypeOf("number");
			current = formatting.nodes[current.parent as number];
		}
		expect(current.id).toBe(outer.fieldsetContent);
	}
	expect(() => rasterizeDocument(page.tree)).not.toThrow();
});

it.each(["work", "boxes", "depth"])(
	"retains formatting %s bounds and DOM state",
	(kind) => {
		const page = fixture();
		const source = serializeHtml(page.tree),
			revision = page.tree.revision;
		const limits =
			kind === "work"
				? { maxWork: 1 }
				: kind === "boxes"
					? { maxBoxes: 1 }
					: { maxDepth: 1 };
		expect(() => buildFormattingTree(page.tree, limits)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(page.tree.revision).toBe(revision);
		expect(serializeHtml(page.tree)).toBe(source);
		expect(() => layoutDocument(page.tree)).not.toThrow();
	},
);

it.each([
	"fieldset{height:50px}",
	"fieldset{min-height:50px}",
	"fieldset{max-height:50px}",
	"legend{margin-top:2px}",
	"legend{margin-bottom:2px}",
	"legend{position:relative;top:2px}",
	"legend{display:flex}",
])("keeps the unimplemented legend profile %s explicit", (css) => {
	const page = fixture(css);
	expect(page.formatting().issues["fieldset-legend-layout-not-supported"]).toBe(
		1,
	);
	expect(() => page.rect("#child")).toThrow(
		"fieldset-legend-layout-not-supported",
	);
});

it("reselects a legend on display mutation without changing DOM ownership", () => {
	const page = fixture(
		"",
		'<fieldset id="target"><legend id="caption">AB</legend><legend id="later">CD</legend><div id="child"></div></fieldset>',
	);
	const parent = page.tree.get(page.id("#caption")).parent;
	expect(page.rendered()).toBe(page.tree.reference(page.id("#caption")));
	page.tree.setAttribute(page.id("#caption"), "style", "display:none");
	expect(page.rendered()).toBe(page.tree.reference(page.id("#later")));
	expect(page.tree.get(page.id("#caption")).parent).toBe(parent);
	page.tree.removeAttribute(page.id("#caption"), "style");
	expect(page.rendered()).toBe(page.tree.reference(page.id("#caption")));
	expect(() => rasterizeDocument(page.tree)).not.toThrow();
});

it("uses real pointer activation after two default legends and a time control", async () => {
	const captured: NetworkRequest[] = [];
	let transport: NodeNetworkTransport | undefined;
	const content =
		'<style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}fieldset{width:200px}</style><form action="/done" method="post"><fieldset><legend>Size</legend><input name="size" value="medium"></fieldset><fieldset><legend>Toppings</legend><input type="checkbox" name="topping" value="cheese" checked></fieldset><input type="time" name="delivery" value="12:30"><button>Send</button></form>';
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
							route.method === "POST" ? "unit response" : content,
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
			"size=medium&topping=cheese&delivery=12%3A30",
		);
		expect(session.page(tab.id).document.url).toBe(
			"https://fixture.invalid/done",
		);
		expect(transport?.metrics().mockedRequests).toBe(2);
	} finally {
		session.close();
		expect(transport?.metrics()).toMatchObject({ closed: true, active: 0 });
	}
});
