import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages } from "./document-images.js";
import {
	DocumentElementOffsets,
	documentElementOffsets,
} from "./element-offsets.js";
import { parseHtmlDocument } from "./html-parser.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { encodePng } from "./png.js";
import { createRaster } from "./raster.js";

const documents: DocumentTree[] = [];
function fixture(content = '<main><div id="target">a</div></main>', css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0}main{width:100px;font-size:8px}${css}</style>${content}`,
		"https://fixture.invalid/offsets",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const offsets = documentElementOffsets(tree);
	return {
		tree,
		id,
		offsets,
		read: (selector = "#target") => offsets.get(id(selector)),
	};
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("uses the body's padding edge, not the content edge or nearest ordinary parent", () => {
	const { read, id } = fixture(
		undefined,
		"html{padding:1px}body{margin:7px;padding:3px}main{margin:11px 0 0 5px;padding:2px}#target{margin:6px 0 0 4px;width:10px;height:5px;padding:1px}",
	);
	expect(read()).toEqual({
		offsetParent: id("body"),
		offsetTop: 22,
		offsetLeft: 14,
	});
	expect(read("main")).toEqual({
		offsetParent: id("body"),
		offsetTop: 14,
		offsetLeft: 8,
	});
});

it("gives body zero offsets and root/body no offset parent", () => {
	const { read } = fixture(
		undefined,
		"html{padding:2px}body{margin:7px;padding:3px}",
	);
	expect(read("body")).toEqual({
		offsetParent: null,
		offsetTop: 0,
		offsetLeft: 0,
	});
	expect(read("html")).toEqual({
		offsetParent: null,
		offsetTop: 0,
		offsetLeft: 0,
	});
});

it("uses initial-containing-block coordinates when no body/offset ancestor exists", () => {
	const tree = new DocumentTree("https://fixture.invalid/native");
	documents.push(tree);
	const root = tree.createElement("section", { style: "padding:2px" });
	const target = tree.createElement("div", {
		style: "margin-left:3px;margin-top:4px;width:5px;height:6px",
	});
	tree.append(tree.root, root);
	tree.append(root, target);
	expect(documentElementOffsets(tree).get(target)).toEqual({
		offsetParent: null,
		offsetLeft: 5,
		offsetTop: 6,
	});
});

it.each([
	[-1.6, -2],
	[-1.5, -1],
	[-0.1, 0],
	[0, 0],
	[1.49, 1],
	[1.5, 2],
	[2.6, 3],
])(
	"rounds a signed horizontal coordinate %s to %s without negative zero",
	(input, expected) => {
		const { read } = fixture(undefined, `#target{margin-left:${input}px}`);
		expect(read().offsetLeft).toBe(expected);
		if (expected === 0) expect(Object.is(read().offsetLeft, -0)).toBe(false);
	},
);

it("uses the first inline fragment rather than the union of all wrapped boxes", () => {
	const { tree, read, id } = fixture(
		'<main>a <span id="target">b cd ef</span></main>',
		"main{width:24px;line-height:10px}",
	);
	const geometry = documentGeometry(tree);
	const rectangles = geometry.getClientRects(id("#target"));
	expect(rectangles.length).toBeGreaterThan(1);
	expect(rectangles[0].x).toBe(12);
	expect(geometry.getBoundingClientRect(id("#target")).x).toBe(0);
	expect(read().offsetLeft).toBe(12);
	expect(read().offsetTop).toBe(Math.round(rectangles[0].y));
});

it("preserves the position and offset parent of an empty zero-width inline box", () => {
	const { tree, read, id } = fixture(
		'<main>a<span id="target"></span>b</main>',
	);
	expect(documentGeometry(tree).getClientRects(id("#target"))[0].width).toBe(0);
	expect(read()).toEqual({
		offsetParent: id("body"),
		offsetLeft: 6,
		offsetTop: 1,
	});
});

it.each(["table", "td", "th"])(
	"recognizes an HTML %s ancestor even when it is styled as a normal block",
	(tag) => {
		const content =
			tag === "table"
				? '<table id="parent"><caption><div id="target">a</div></caption></table>'
				: `<table><tr><${tag} id="parent"><div id="target">a</div></${tag}></tr></table>`;
		const { read, id } = fixture(
			content,
			"table,tbody,tr,td,th,caption{display:block}",
		);
		expect(read().offsetParent).toBe(id("#parent"));
	},
);

it.each(["display:none", "display:contents"])(
	"returns zero/null for an element without its own box: %s",
	(declaration) => {
		const { read } = fixture(undefined, `#target{${declaration}}`);
		expect(read()).toEqual({ offsetParent: null, offsetTop: 0, offsetLeft: 0 });
	},
);

it("keeps offsets for visibility:hidden boxes, unlike display:none subtrees", () => {
	const { tree, read, id } = fixture(
		undefined,
		"main{padding:2px;visibility:hidden}#target{margin-left:3px}",
	);
	expect(read().offsetLeft).toBe(5);
	tree.setAttribute(id("main"), "style", "display:none");
	expect(read()).toEqual({ offsetParent: null, offsetTop: 0, offsetLeft: 0 });
});

it("invalidates after style changes, reparenting, detach and reattachment", () => {
	const { tree, id, read, offsets } = fixture(
		'<main><div id="target">a</div></main><section style="padding:10px"></section>',
		"main{padding:2px}",
	);
	const original = read();
	expect(original.offsetLeft).toBe(2);
	tree.setAttribute(id("main"), "style", "padding:4px");
	expect(read().offsetLeft).toBe(4);
	tree.append(id("section"), id("#target"));
	expect(read().offsetLeft).toBe(10);
	const target = id("#target");
	tree.remove(target);
	expect(offsets.get(target)).toEqual({
		offsetParent: null,
		offsetTop: 0,
		offsetLeft: 0,
	});
	tree.append(id("main"), target);
	expect(read().offsetLeft).toBe(4);
	expect(original.offsetLeft).toBe(2);
	expect(Object.isFrozen(original)).toBe(true);
});

it("responds to viewport/media changes and keeps repeated reads on one shared layout", () => {
	const { tree, id, offsets, read } = fixture(
		undefined,
		"main{width:50%;padding-left:10%}@media(max-width:100px){main{padding-left:5px}}",
	);
	documentStyles(tree).setViewport(200, 100);
	expect(read().offsetLeft).toBe(20);
	const geometry = documentGeometry(tree);
	const metrics = offsets.metrics();
	const builds = geometry.metrics().builds;
	for (let index = 0; index < 100; index++)
		expect(offsets.get(id("#target"))).toBe(read());
	expect(offsets.metrics()).toEqual(metrics);
	expect(geometry.metrics().builds).toBe(builds);
	documentStyles(tree).setViewport(100, 100);
	expect(read().offsetLeft).toBe(5);
	expect(geometry.metrics().builds).toBe(builds + 1);
});

it("recomputes downstream offsets after loaded image dimensions change", async () => {
	const { tree, id, read } = fixture(
		'<img id="photo" src="/first.png"><div id="target">after</div>',
		"img{display:block}",
	);
	const images = documentImages(tree, {
		fetch: async (url) => {
			const body = encodePng(
				createRaster(3, url.endsWith("second.png") ? 7 : 2, [0, 0, 255, 255]),
			);
			return {
				url,
				status: 200,
				headers: { "content-type": ["image/png"] },
				body,
				encodedBytes: body.length,
				redirects: [],
				elapsedMs: 0,
			};
		},
	});
	await images.settle();
	expect(read().offsetTop).toBe(2);
	tree.setAttribute(id("#photo"), "src", "/second.png");
	await images.settle();
	expect(read().offsetTop).toBe(7);
});

it.each([
	"position:sticky",
	"position:absolute",
	"position:fixed",
	"transform:translateX(2px)",
	"border:1px dashed red",
	"zoom:2",
	"display:grid",
	"display:flex;flex-direction:column;flex-wrap:wrap;position:absolute",
])(
	"refuses unsupported geometry rather than returning plausible offsets for %s",
	(declaration) => {
		const { tree, id, offsets, read } = fixture(
			undefined,
			`main{${declaration}}`,
		);
		expect(() => read()).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(offsets.metrics().retained).toBe(0);
		tree.setAttribute(id("style"), "type", "text/plain");
		expect(() => read()).not.toThrow();
	},
);

it("does not invent a padding edge for a boxless offset parent", () => {
	const { read } = fixture(undefined, "body{display:contents}");
	expect(() => read()).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("bounds cached elements and clears records on document close", () => {
	const { tree, id } = fixture();
	const offsets = new DocumentElementOffsets(tree, { maxElements: 1 });
	offsets.get(id("#target"));
	expect(() => offsets.get(id("body"))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	tree.close();
	expect(offsets.metrics()).toMatchObject({ closed: true, retained: 0 });
	expect(() => offsets.get(1)).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
});

it("bounds ancestor scans and can recover on a new revision", () => {
	const { tree, id } = fixture();
	const offsets = new DocumentElementOffsets(tree, { maxWork: 1 });
	expect(() => offsets.get(id("#target"))).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
	expect(offsets.metrics().retained).toBe(0);
	tree.setAttribute(id("body"), "title", "new revision");
	expect(offsets.get(id("body"))).toEqual({
		offsetParent: null,
		offsetTop: 0,
		offsetLeft: 0,
	});
});

it.each([
	{ maxWork: 0 },
	{ maxWork: 2_000_001 },
	{ maxElements: 0 },
	{ maxElements: 50_001 },
	{ maxWork: 1.5 },
	{ unknown: 1 },
])("rejects invalid native limits %j", (limits) => {
	const { tree } = fixture();
	expect(() => new DocumentElementOffsets(tree, limits)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("exposes readonly scalar getters and the actual offset-parent node capability", () => {
	const { tree, id } = fixture(undefined, "main{padding:2px}");
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	});
	const target = dom.node(id("#target")) as {
		offsetParent: object | null;
		offsetTop: number;
		offsetLeft: number;
	};
	expect(target.offsetParent).toBe(dom.node(id("body")));
	expect(target.offsetLeft).toBe(2);
	expect(Reflect.set(target, "offsetLeft", 99)).toBe(false);
	const text = tree.get(id("#target")).children[0];
	expect(
		(dom.node(text) as { offsetLeft?: number }).offsetLeft,
	).toBeUndefined();
	dom.close();
	expect(() => target.offsetTop).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(() => target.offsetParent).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	tree.close();
	expect(dom.metrics().elementOffsets).toMatchObject({
		closed: true,
		retained: 0,
	});
});
