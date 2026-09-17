import { afterEach, expect, it, vi } from "vitest";
import type { DocumentTree } from "./document.js";
import { rasterizeDocument } from "./document-raster.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { svgPresentationDeclarations } from "./svg-presentation.js";

const documents: DocumentTree[] = [];

function fixture(markup: string) {
	const tree = parseHtmlDocument(markup, "https://example.invalid/svg");
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	const selected = queries.querySelector("#target");
	queries.close();
	if (selected === null) throw new Error("Missing fixture target");
	return { tree, selected };
}

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each(["", " ", "\t", "\n", "\r", "\f", " \t\n\r\f "])(
	"omits empty SVG color %j without losing dimensions or source charging",
	(color) => {
		const { tree, selected } = fixture(
			`<svg id="target" viewBox="0 0 24 24" color="${color}" width="24"></svg>`,
		);
		const charge = vi.fn();
		const original = tree.get(selected);
		const result = svgPresentationDeclarations(original, charge);
		expect(result).toEqual([
			{ property: "overflow-x", value: "hidden", important: false },
			{ property: "overflow-y", value: "hidden", important: false },
			{ property: "width", value: "24px", important: false },
		]);
		expect(charge).toHaveBeenNthCalledWith(1, color.length * 3 + 1);
		expect(charge).toHaveBeenNthCalledWith(2, 7);
		expect(Object.isFrozen(result)).toBe(true);
		expect(result.every(Object.isFrozen)).toBe(true);
		expect(tree.get(selected)).toEqual(original);
		expect(() => buildFormattingTree(tree)).not.toThrow();
	},
);

it.each([
	["", [255, 0, 0, 255]],
	["svg{color:blue}", [0, 0, 255, 255]],
	["svg{color:green!important}", [0, 128, 0, 255]],
] as const)(
	"preserves inherited/currentColor painting with author CSS %j",
	(css, color) => {
		const { tree } = fixture(
			`<!doctype html><style>html,body{margin:0}body{color:red}${css}</style><svg id="target" color="" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"/></svg>`,
		);
		documentStyles(tree).setViewport(100, 100);
		expect(buildFormattingTree(tree).issues).toEqual({});
		const image = rasterizeDocument(tree, {
			clip: { x: 0, y: 0, width: 24, height: 24 },
		}).image;
		const offset = (5 * image.width + 5) * 4;
		expect(Array.from(image.pixels.slice(offset, offset + 4))).toEqual(color);
	},
);

it("invalidates presentation color through empty, valid and removed attributes", () => {
	const { tree, selected } = fixture(
		'<svg id="target" color="" width="24" height="24"><rect width="24" height="24"/></svg>',
	);
	const declarations = () =>
		svgPresentationDeclarations(tree.get(selected), () => {});
	expect(declarations().some((entry) => entry.property === "color")).toBe(
		false,
	);
	tree.setAttribute(selected, "color", "red");
	expect(declarations()).toContainEqual({
		property: "color",
		value: "red",
		important: false,
	});
	tree.setAttribute(selected, "color", " \t ");
	expect(declarations().some((entry) => entry.property === "color")).toBe(
		false,
	);
	tree.removeAttribute(selected, "color");
	expect(declarations().some((entry) => entry.property === "color")).toBe(
		false,
	);
});

it.each(["not-a-color", "red;display:none", "red!important"])(
	"retains rejection of nonempty unsupported color %j",
	(color) => {
		const { tree, selected } = fixture(
			`<svg id="target" color="${color}"></svg>`,
		);
		expect(() =>
			svgPresentationDeclarations(tree.get(selected), () => {}),
		).toThrow("Unsupported SVG presentation attribute");
	},
);

it.each(["width", "height"])(
	"does not suppress malformed %s geometry",
	(dimension) => {
		const { tree, selected } = fixture(
			`<svg id="target" color="" ${dimension}="not-a-length"></svg>`,
		);
		expect(() =>
			svgPresentationDeclarations(tree.get(selected), () => {}),
		).toThrow("Unsupported SVG presentation attribute");
	},
);

it("keeps the source cap and propagates work-budget failures for empty color", () => {
	const { tree, selected } = fixture('<svg id="target"></svg>');
	tree.setAttribute(selected, "color", " ".repeat(4096));
	const charge = vi.fn();
	expect(() =>
		svgPresentationDeclarations(tree.get(selected), charge),
	).not.toThrow();
	expect(charge).toHaveBeenCalledWith(12289);
	tree.setAttribute(selected, "color", " ".repeat(4097));
	expect(() => svgPresentationDeclarations(tree.get(selected), charge)).toThrow(
		"SVG presentation attribute limit exceeded",
	);
	tree.setAttribute(selected, "color", "");
	expect(() =>
		svgPresentationDeclarations(tree.get(selected), () => {
			throw new Error("Synthetic work limit");
		}),
	).toThrow("Synthetic work limit");
});
