import { afterEach, expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import { layoutDocument } from "./document-layout.js";
import { loadBrowserDocument } from "./document-loader.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import {
	buildFormattingTree,
	resolveDocumentBlockWidths,
} from "./formatting-tree.js";
import { layoutFormattingGridContainer } from "./grid-layout.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";
import { documentStyles } from "./styles.js";

const trees: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	css = "",
	content = '<div id="first">A</div><div id="second">B</div>',
	after = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}main{display:grid;width:120px;grid-template-columns:40px 80px} ${css}</style><main id="container">${content}</main>${after}`,
		"https://fixture.invalid/grid",
	);
	trees.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing Grid fixture ${selector}`);
		return found;
	};
	const box = (selector: string, layout = layoutDocument(tree)) => {
		const found = layout.boxes.find(
			(entry) => entry.ref === tree.reference(id(selector)),
		);
		if (!found) throw new Error(`Missing Grid box ${selector}`);
		return found;
	};
	return { tree, id, box };
}

it("lays out actual Grid items, glyphs and the following block", () => {
	const { tree, box, id } = fixture(
		"main{grid-template-rows:20px}footer{height:7px}",
		undefined,
		'<footer id="after"></footer>',
	);
	const layout = layoutDocument(tree);
	expect(box("#container", layout)).toMatchObject({
		contentWidth: 120,
		contentHeight: 20,
	});
	expect(box("#first", layout)).toMatchObject({
		borderX: 0,
		borderY: 0,
		borderBoxWidth: 40,
		borderBoxHeight: 20,
	});
	expect(box("#second", layout)).toMatchObject({
		borderX: 40,
		borderY: 0,
		borderBoxWidth: 80,
		borderBoxHeight: 20,
	});
	expect(box("#after", layout).borderY).toBe(20);
	expect(
		layout.contexts.find((context) => context.id === box("#second", layout).id)
			?.glyphs[0].x,
	).toBe(40);
	expect(
		documentGeometry(tree).getBoundingClientRect(id("#second")),
	).toMatchObject({ x: 40, y: 0, width: 80, height: 20 });
	expect(documentHitTesting(tree).elementFromPoint(45, 5)).toBe(id("#second"));
});

it("places two rows with independent row/column gaps and a spanning item", () => {
	const { tree, box } = fixture(
		'main{width:130px;grid-template-columns:40px 80px;grid-template-rows:20px 30px;gap:5px 10px;grid-template-areas:"side top" "side bottom"}#first{grid-area:side}#second{grid-area:top}#third{grid-area:bottom}',
		'<div id="first">A</div><div id="second">B</div><div id="third">C</div>',
	);
	const layout = layoutDocument(tree);
	expect(box("#first", layout)).toMatchObject({
		borderX: 0,
		borderY: 0,
		borderBoxWidth: 40,
		borderBoxHeight: 55,
	});
	expect(box("#second", layout)).toMatchObject({
		borderX: 50,
		borderY: 0,
		borderBoxWidth: 80,
		borderBoxHeight: 20,
	});
	expect(box("#third", layout)).toMatchObject({
		borderX: 50,
		borderY: 25,
		borderBoxWidth: 80,
		borderBoxHeight: 30,
	});
	expect(box("#container", layout).contentHeight).toBe(55);
});

it.each(["space-around", "space-evenly", "space-between"])(
	"keeps overflowing %s tracks at the safe start edge in both axes",
	(alignment) => {
		const { tree, box } = fixture(
			`main{width:100px;height:20px;grid-template-columns:200px;grid-template-rows:40px;justify-content:${alignment};align-content:${alignment}}`,
			'<div id="first">A</div>',
		);
		expect(box("#first", layoutDocument(tree))).toMatchObject({
			borderX: 0,
			borderY: 0,
			borderBoxWidth: 200,
			borderBoxHeight: 40,
		});
	},
);

it.each([
	["space-around", 20, 80],
	["space-evenly", 80 / 3, 220 / 3],
	["space-between", 0, 100],
] as const)(
	"distributes positive track space for %s",
	(alignment, first, second) => {
		const { tree, box } = fixture(
			`main{width:120px;grid-template-columns:20px 20px;justify-content:${alignment}}`,
		);
		const layout = layoutDocument(tree);
		expect(box("#first", layout).borderX).toBeCloseTo(first);
		expect(box("#second", layout).borderX).toBeCloseTo(second);
	},
);

it.each([
	["margin-top:auto", "unsafe end", -20],
	["margin-bottom:auto", "unsafe center", -10],
	["margin-top:auto;margin-bottom:auto", "unsafe end", -20],
	["margin-top:auto", "safe end", 0],
	["margin-bottom:auto", "start", 0],
] as const)(
	"aligns overflowing items with %s and %s",
	(margins, alignment, top) => {
		const { tree, box } = fixture(
			`main{grid-template-rows:20px}#first{height:40px;${margins};align-self:${alignment}}`,
			'<div id="first">A</div>',
		);
		expect(box("#first", layoutDocument(tree))).toMatchObject({
			borderY: top,
			borderBoxHeight: 40,
			marginTop: 0,
			marginBottom: 0,
		});
	},
);

it("lets auto margins absorb positive area space before self-alignment", () => {
	const { tree, box } = fixture(
		"main{grid-template-rows:40px}#first{height:20px;margin-top:auto;align-self:unsafe start}",
		'<div id="first">A</div>',
	);
	expect(box("#first", layoutDocument(tree))).toMatchObject({
		borderY: 20,
		borderBoxHeight: 20,
		marginTop: 20,
	});
});

it("flattens contents without a synthetic box and retains anonymous text items", () => {
	const { tree, id, box } = fixture(
		"#flat{display:contents}",
		'<section id="flat"><div id="first">A</div><div id="second">B</div></section>tail',
	);
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find(
		(node) => node.ref === tree.reference(id("#container")),
	)!;
	expect(container.contentMode).toBe("grid");
	expect(container.children).toHaveLength(3);
	expect(
		container.children.map((child) => formatting.nodes[child].gridItem),
	).toEqual([true, true, true]);
	expect(
		container.children.map((child) => formatting.nodes[child].flexItem),
	).not.toContain(true);
	const layout = layoutDocument(tree);
	expect(
		layout.boxes.some((entry) => entry.ref === tree.reference(id("#flat"))),
	).toBe(false);
	expect(box("#second", layout).borderX).toBe(40);
	expect(box("#container", layout).contentHeight).toBe(20);
	expect(layout.contexts.flatMap((context) => context.glyphs).length).toBe(6);
});

it("reflows nested Grids rather than substituting Flex or block widths", () => {
	const { tree, box } = fixture(
		"main{grid-template-columns:30px 90px}#second{display:grid;grid-template-columns:1fr 2fr}",
		'<div id="first">A</div><div id="second"><div id="inner1">B</div><div id="inner2">C</div></div>',
	);
	const layout = layoutDocument(tree);
	expect(box("#inner1", layout)).toMatchObject({
		borderX: 30,
		borderBoxWidth: 30,
	});
	expect(box("#inner2", layout)).toMatchObject({
		borderX: 60,
		borderBoxWidth: 60,
	});
	expect(new Set(layout.boxes.map((entry) => entry.id)).size).toBe(
		layout.boxes.length,
	);
});

it("coordinates Flex inside Grid and Grid inside Flex", () => {
	const { tree, box } = fixture(
		"main{display:flex}#first{display:grid;flex:0 0 60px;grid-template-columns:20px 40px}#second{display:flex;flex:0 0 60px}#second>div{flex:1;min-width:0}",
		'<div id="first"><div id="left1">A</div><div id="left2">B</div></div><div id="second"><div id="right1">C</div><div id="right2">D</div></div>',
	);
	const layout = layoutDocument(tree);
	expect(box("#left2", layout)).toMatchObject({
		borderX: 20,
		borderBoxWidth: 40,
	});
	expect(box("#right2", layout)).toMatchObject({
		borderX: 90,
		borderBoxWidth: 30,
	});
});

it("uses content for indefinite flexible rows rather than viewport height", () => {
	const { box } = fixture(
		"main{grid-template-columns:1fr;grid-template-rows:min-content 1fr}#first{height:10px}#second{height:30px}",
	);
	expect(box("#container").contentHeight).toBe(40);
	expect(box("#second")).toMatchObject({ borderY: 10, borderBoxHeight: 30 });
});

it("applies the minimum-height constraint when expanding flexible rows", () => {
	const { box } = fixture(
		"main{grid-template-columns:1fr;grid-template-rows:1fr;min-height:100px}",
		'<div id="first">A</div>',
	);
	expect(box("#container").contentHeight).toBe(100);
	expect(box("#first").borderBoxHeight).toBe(100);
});

it("caps flexible row expansion at a definite maximum without shrinking item boxes", () => {
	const { box } = fixture(
		"main{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr);max-height:40px}main>div{height:50px}",
	);
	expect(box("#container").contentHeight).toBe(40);
	expect(box("#second")).toMatchObject({ borderY: 20, borderBoxHeight: 50 });
});

it("distributes definite row space by fractional track ratios", () => {
	const { box } = fixture(
		"main{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,3fr);height:80px}",
	);
	expect(box("#first")).toMatchObject({ borderY: 0, borderBoxHeight: 20 });
	expect(box("#second")).toMatchObject({ borderY: 20, borderBoxHeight: 60 });
});

it("paints overlapping explicit items and hit-tests order-modified subtrees", () => {
	const { tree, id } = fixture(
		"main{grid-template-columns:40px;grid-template-rows:20px}main>div{grid-area:1 / 1}#first{background:red}#second{background:blue}",
	);
	const image = rasterizeDocument(tree).image;
	const offset = (15 * image.width + 30) * 4;
	expect([...image.pixels.slice(offset, offset + 4)]).toEqual([0, 0, 255, 255]);
	expect(documentHitTesting(tree).elementFromPoint(30, 15)).toBe(id("#second"));
	tree.setAttribute(id("#first"), "style", "order:2");
	expect(documentHitTesting(tree).elementFromPoint(30, 15)).toBe(id("#first"));
});

it("recomputes Grid after viewport and placement mutations", () => {
	const { tree, id, box } = fixture(
		"main{width:auto;grid-template-columns:minmax(0,1fr) minmax(0,3fr)}",
	);
	expect(box("#first").borderBoxWidth).toBe(40);
	documentStyles(tree).setViewport(240, 120);
	expect(box("#first").borderBoxWidth).toBe(60);
	tree.setAttribute(id("#second"), "style", "grid-column:1;grid-row:2");
	expect(box("#second").borderX).toBe(0);
	expect(box("#second").borderY).toBe(10);
});

it("resolves item percentages against its Grid area rather than the container", () => {
	const { box } = fixture(
		"main{height:100px;grid-template-rows:20px}#first{height:50%}",
	);
	expect(box("#first").borderBoxHeight).toBe(10);
});

it("makes a stretched item definite for percentage descendants even at its natural height", () => {
	const { box } = fixture(
		"main{grid-template-columns:1fr;grid-template-rows:20px}#inner{height:50%}",
		'<div id="first"><div style="height:20px"></div><div id="inner"></div></div>',
	);
	expect(box("#first").borderBoxHeight).toBe(20);
	expect(box("#inner").borderBoxHeight).toBe(10);
});

it("retains natural replaced-item dimensions and paints its actual image box", async () => {
	const { tree, box } = fixture(
		"main{grid-template-rows:20px}",
		'<img id="first" src="/image.png"><div id="second">B</div>',
	);
	const bytes = encodePng(createRaster(10, 6, [0, 255, 0, 255]));
	await documentImages(tree, {
		fetch: async (url) => ({
			url,
			status: 200,
			headers: { "content-type": ["image/png"] },
			body: bytes,
			redirects: [],
			encodedBytes: 0,
			elapsedMs: 0,
		}),
	}).settle();
	const result = rasterizeDocument(tree);
	expect(box("#first", result.layout)).toMatchObject({
		borderBoxWidth: 10,
		borderBoxHeight: 6,
	});
	expect(result.metrics.paintedImages).toBe(1);
	const pixel = (5 * result.image.width + 5) * 4;
	expect([...result.image.pixels.slice(pixel, pixel + 4)]).toEqual([
		0, 255, 0, 255,
	]);
});

it.each(["100%", "auto"])(
	"resolves nested percentage rows after a %s item receives its definite area",
	(height) => {
		const { tree, box } = fixture(
			`main{height:100px;grid-template-rows:100px}#first{display:grid;height:${height};grid-template-rows:50%}`,
			'<div id="first"><div id="nested">A</div></div>',
		);
		const layout = layoutDocument(tree);
		expect(box("#first", layout).contentHeight).toBe(100);
		expect(box("#nested", layout)).toMatchObject({
			borderY: 0,
			borderBoxHeight: 50,
		});
	},
);

it("resolves cyclic percentage rows against intrinsic container height without resizing the container", () => {
	const { tree, box } = fixture(
		"main{grid-template-rows:50%}footer{height:5px}",
		undefined,
		'<footer id="after"></footer>',
	);
	const layout = layoutDocument(tree);
	expect(box("#container", layout).contentHeight).toBe(10);
	expect(box("#first", layout).contentHeight).toBe(5);
	expect(box("#after", layout).borderY).toBe(10);
});

it("retains overflow when cyclic percentage tracks exceed the resolved container", () => {
	const { tree, box } = fixture(
		"main{grid-template-columns:120px;grid-template-rows:100% 100%}#first{height:10px}#second{height:20px}",
	);
	const layout = layoutDocument(tree);
	expect(box("#container", layout).contentHeight).toBe(30);
	expect(box("#second", layout)).toMatchObject({
		borderY: 30,
		borderBoxHeight: 20,
	});
});

it.each([
	["min-height:100px", 100, 50],
	["max-height:6px", 6, 3],
] as const)(
	"uses %s before resolving cyclic percentages",
	(constraint, height, row) => {
		const { tree, box } = fixture(`main{grid-template-rows:50%;${constraint}}`);
		const layout = layoutDocument(tree);
		expect(box("#container", layout).contentHeight).toBe(height);
		expect(box("#first", layout).contentHeight).toBe(row);
	},
);

it("resolves cyclic percentage gaps after intrinsic sizing without consuming the container twice", () => {
	const { tree, box } = fixture(
		"main{grid-template-columns:120px;row-gap:10%}#first{height:10px}#second{height:20px}",
	);
	const layout = layoutDocument(tree);
	expect(box("#container", layout).contentHeight).toBe(30);
	expect(box("#second", layout).borderY).toBe(13);
});

it("caps automatic item minima against the final percentage maximum track", () => {
	const { tree, box } = fixture(
		"main{grid-template-columns:120px;grid-template-rows:minmax(auto,50%) 0px}#first{height:30px}",
	);
	const layout = layoutDocument(tree);
	expect(box("#container", layout).contentHeight).toBe(30);
	expect(box("#second", layout).borderY).toBe(15);
});

it("keeps horizontal-only and baseline profile restrictions explicit", () => {
	const { tree } = fixture();
	expect(() => resolveDocumentBlockWidths(tree)).toThrowError(
		expect.objectContaining({ code: "unsupported" }),
	);
	expect(() =>
		layoutDocument(fixture("main{align-items:baseline}").tree),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
	const formatting = buildFormattingTree(tree);
	const container = formatting.nodes.find(
		(node) => node.contentMode === "grid",
	)!;
	expect(() =>
		layoutFormattingGridContainer(
			formatting,
			container.id,
			{ contentWidth: 120, containingWidth: 160, containingHeight: 120 },
			{ maxWork: 1 },
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("completes a genuine native click using Grid geometry and fixture transport", async () => {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const markup =
		'<!doctype html><style>html,body{margin:0;font-size:10px;line-height:10px}main{display:grid;grid-template-columns:40px 80px;grid-template-rows:20px;width:120px}</style><main><div>First</div><a id="target" href="/destination">Next</a></main>';
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				const body = new TextEncoder().encode(
					request.url.endsWith("/destination")
						? "<!doctype html><h1>Destination</h1>"
						: markup,
				);
				return {
					url: request.url,
					status: 200,
					headers: { "content-type": ["text/html; charset=utf-8"] },
					body,
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/start");
	const page = session.page(tab.id);
	const target = page.queries.querySelector("#target")!;
	const events: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		page.interactions.events.addEventListener(target, type, () =>
			events.push(type),
		);
	await session.click(tab.id, page.document.reference(target));
	expect(events).toEqual(["mousedown", "mouseup", "click"]);
	expect(requests.map((request) => request.url)).toEqual([
		"https://fixture.invalid/start",
		"https://fixture.invalid/destination",
	]);
	expect(session.page(tab.id).queries.querySelector("h1")).not.toBeNull();
	session.close();
	expect(session.metrics()).toMatchObject({
		closed: true,
		tabs: 0,
		pendingLoads: 0,
		cleanupErrors: 0,
	});
	expect(closed).toBe(true);
});
