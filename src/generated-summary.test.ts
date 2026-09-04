import { afterEach, expect, it } from "vitest";
import { documentGeometry, type ClientRectangle } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import { documentScroll } from "./document-scroll.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

const documents: ReturnType<typeof parseHtmlDocument>[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});
function fixture(
	markup = '<details id="host"><div id="body">Body</div></details>',
	css = "",
) {
	const tree = parseHtmlDocument(
		`<style>html,body{margin:0}details{width:120px;font-size:16px;line-height:16px;color:blue}#body{height:32px}${css}</style>${markup}`,
		"https://fixture.invalid/generated-summary",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 120);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error("Missing fixture element");
		return found;
	};
	const headers = () =>
		buildFormattingTree(tree).nodes.filter(
			(node) => node.kind === "block" && Reflect.get(node, "generated"),
		);
	const target = () => {
		const header = headers()[0];
		if (!header) throw new Error("Missing generated summary header");
		return Reflect.get(header, "generated") as {
			ref: string;
			owner: number;
			kind: string;
			label: string;
		};
	};
	const rectangle = (reference: string) => {
		const geometry = documentGeometry(tree) as unknown as {
			getGeneratedClientRects(reference: string): readonly ClientRectangle[];
		};
		return geometry.getGeneratedClientRects(reference);
	};
	const hit = (x: number, y: number) =>
		(
			documentHitTesting(tree) as unknown as {
				targetFromPoint(
					x: number,
					y: number,
				): { id: number; generated?: string } | null;
			}
		).targetFromPoint(x, y);
	return { tree, queries, id, headers, target, rectangle, hit };
}

it("renders fallback text and marker without adding DOM children, text, attributes or revision changes", () => {
	const { tree, queries, id, headers, target } = fixture();
	const host = id("#host");
	const before = {
		count: tree.nodeCount,
		text: tree.textContent(host),
		children: tree.get(host).children,
		revision: tree.revision,
	};
	expect(headers()).toHaveLength(1);
	expect(target()).toMatchObject({
		owner: host,
		kind: "details-summary",
		label: "Details",
	});
	expect(headers()[0].ref).toBeUndefined();
	const rendered = rasterizeDocument(tree);
	expect(rendered.metrics.paintedMarkers).toBe(1);
	expect(rendered.metrics.paintedGlyphs).toBe(7);
	expect(queries.querySelector("summary")).toBeNull();
	expect({
		count: tree.nodeCount,
		text: tree.textContent(host),
		children: tree.get(host).children,
		revision: tree.revision,
	}).toEqual(before);
});

it("gives the generated header its own geometry rather than the whole open body", () => {
	const { tree, id, target, rectangle, hit } = fixture();
	const control = target();
	expect(rectangle(control.ref)).toHaveLength(1);
	expect(rectangle(control.ref)[0]).toMatchObject({
		x: 0,
		y: 0,
		width: 120,
		height: 16,
	});
	tree.setAttribute(id("#host"), "open", "");
	expect(rectangle(control.ref)[0]).toMatchObject({
		x: 0,
		y: 0,
		width: 120,
		height: 16,
	});
	expect(documentGeometry(tree).getBoundingClientRect(id("#host")).height).toBe(
		48,
	);
	expect(documentGeometry(tree).getBoundingClientRect(id("#body")).y).toBe(16);
	expect(hit(4, 4)).toEqual({ id: id("#host"), generated: control.ref });
	expect(hit(4, 20)).toEqual({ id: id("#body") });
	expect(documentHitTesting(tree).elementFromPoint(4, 4)).toBe(id("#host"));
	expect(documentGeometry(tree).getClientRects(id("#host"))).toHaveLength(1);
});

it("distinguishes header whitespace from direct-text body hits retargeted to the same host", () => {
	const { tree, id, target, hit } = fixture(
		'<details id="host" open>Body</details>',
	);
	const control = target();
	expect(hit(115, 5)).toEqual({ id: id("#host"), generated: control.ref });
	expect(hit(3, 20)).toEqual({ id: id("#host") });
	expect(
		documentHitTesting(tree)
			.elementsFromPoint(4, 5)
			.filter((owner) => owner === id("#host")),
	).toHaveLength(1);
});

it("changes triangle pixels without changing generated target identity or header extent", () => {
	const { tree, id, target, rectangle } = fixture();
	const control = target();
	const before = rectangle(control.ref);
	const closed = rasterizeDocument(tree).image.pixels;
	tree.setAttribute(id("#host"), "open", "");
	expect(target()).toBe(control);
	expect(rectangle(control.ref)).toEqual(before);
	expect(rasterizeDocument(tree).image.pixels).not.toEqual(closed);
});

it("suppresses fallback only for an authored direct summary, including a hidden one", () => {
	const { tree, id, headers, target, rectangle } = fixture();
	const control = target();
	const summary = tree.createElement("summary", { hidden: "" });
	tree.append(id("#host"), summary);
	expect(headers()).toEqual([]);
	expect(() => rectangle(control.ref)).toThrow(/no longer available/i);
	tree.remove(summary);
	expect(target()).toBe(control);
	expect(rectangle(control.ref)).toHaveLength(1);
});

it("does not treat nested summaries as the direct summary", () => {
	const { headers } = fixture(
		'<details id="host"><div><summary>Nested</summary></div></details>',
	);
	expect(headers()).toHaveLength(1);
});

it("inherits typography and color without applying authored summary selectors to generated content", () => {
	const { tree, headers } = fixture(
		undefined,
		"details{color:green;font-size:24px;line-height:24px}summary{display:none;color:red}",
	);
	expect(headers()[0].typography?.["font-size"]).toBe("24px");
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	const pixels = rasterizeDocument(tree).image.pixels;
	let green = 0;
	for (let offset = 0; offset < pixels.length; offset += 4)
		if (
			pixels[offset] === 0 &&
			pixels[offset + 1] === 128 &&
			pixels[offset + 2] === 0 &&
			pixels[offset + 3] !== 0
		)
			green++;
	expect(green).toBeGreaterThan(0);
});

it.each([
	"details{visibility:hidden}",
	"details{pointer-events:none}",
	"details{display:none}",
])("does not expose a generated hit target through %s", (css) => {
	const { tree, id, hit } = fixture(undefined, css);
	expect(hit(4, 4)?.generated).toBeUndefined();
	expect(hit(4, 4)?.id).not.toBe(id("#host"));
	if (!css.includes("pointer-events"))
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(0);
});

it("blocks generated pointer targeting in inert subtrees", () => {
	const { hit } = fixture('<details id="host" inert></details>');
	expect(hit(4, 4)?.generated).toBeUndefined();
});

it("preserves target identity and adjusts header geometry under root scrolling", () => {
	const { tree, target, rectangle, hit } = fixture(
		'<div style="height:150px"></div><details id="host"></details><div style="height:150px"></div>',
	);
	const control = target();
	expect(rectangle(control.ref)[0].top).toBe(150);
	documentScroll(tree).to(0, 100);
	expect(rectangle(control.ref)[0].top).toBe(50);
	expect(hit(4, 55)?.generated).toBe(control.ref);
	expect(target()).toBe(control);
});

it("charges generated text and boxes to the existing formatting limits", () => {
	const { tree } = fixture();
	expect(() => buildFormattingTree(tree, { maxTextCodeUnits: 6 })).toThrow(
		/text limit/i,
	);
	const boxes = buildFormattingTree(tree).metrics.boxes;
	expect(() => buildFormattingTree(tree, { maxBoxes: boxes - 1 })).toThrow(
		/box limit/i,
	);
});

it("separates targets of nested missing-summary disclosures", () => {
	const { tree, headers } = fixture(
		'<details id="host" open><details id="inner"></details></details>',
	);
	expect(headers()).toHaveLength(2);
	const values = headers().map((node) => Reflect.get(node, "generated")?.ref);
	expect(new Set(values).size).toBe(2);
	expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(2);
});

it("revokes geometry and hit queries after document close", () => {
	const { tree, target, rectangle, hit } = fixture();
	const control = target();
	expect(rectangle(control.ref)).toHaveLength(1);
	tree.close();
	expect(() => rectangle(control.ref)).toThrow(/closed/i);
	expect(() => hit(4, 4)).toThrow(/closed/i);
});

it("honors overlapping content rather than selecting an obscured generated header", () => {
	const { id, hit } = fixture(
		'<details id="host"></details><div id="overlay" style="position:relative;top:-16px;height:16px;background:red"></div>',
	);
	expect(hit(4, 4)).toEqual({ id: id("#overlay") });
});

it("keeps generated headers separate across inline, contents and flex host display", () => {
	for (const display of ["inline", "contents", "flex", "inline-block"]) {
		const { tree, target, rectangle, hit } = fixture(
			undefined,
			`details{display:${display}}`,
		);
		const control = target();
		const rect = rectangle(control.ref)[0];
		expect(rect.width).toBeGreaterThan(0);
		expect(rect.height).toBe(16);
		expect(hit(rect.x + 1, rect.y + 1)?.generated).toBe(control.ref);
		expect(rasterizeDocument(tree).metrics.paintedMarkers).toBe(1);
	}
});

it("revokes generated geometry when its geometry owner is closed independently", () => {
	const { tree, target, rectangle } = fixture();
	const control = target();
	documentGeometry(tree).close();
	expect(() => rectangle(control.ref)).toThrow(/closed/i);
});
