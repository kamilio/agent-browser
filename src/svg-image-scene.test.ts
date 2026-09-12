import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { svgNamespace } from "./dom-namespaces.js";
import { documentStyles } from "./styles.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene, imageSvgScene } from "./svg-scene.js";

const documents: DocumentTree[] = [];

afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture() {
	const tree = new DocumentTree("about:blank");
	documents.push(tree);
	const root = tree.createParserElement(
		"svg",
		{ width: "8", height: "4", viewBox: "0 0 8 4" },
		svgNamespace,
	);
	tree.append(tree.root, root);
	const shape = tree.createParserElement(
		"rect",
		{ x: "2", y: "1", width: "4", height: "2", fill: "red" },
		svgNamespace,
	);
	tree.append(root, shape);
	let work = 0;
	const charge = (amount: number) => {
		expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
		work += amount;
		if (work > 100_000) throw new Error("Image scene fixture work limit");
	};
	return { tree, root, shape, charge, work: () => work };
}

it("constructs and rasterizes a document-root SVG without an HTML wrapper", () => {
	const test = fixture();
	const scene = imageSvgScene(test.tree, test.root, test.charge);
	expect(scene.shapes).toHaveLength(1);
	expect(scene.shapes[0].fill).toEqual([255, 0, 0, 255]);
	const image = rasterizeSvgScene(scene, 8, 4, test.charge);
	expect(image.width).toBe(8);
	expect(image.height).toBe(4);
	const pixel = (across: number, down: number) => {
		const offset = (down * image.width + across) * 4;
		return Array.from(image.pixels.slice(offset, offset + 4));
	};
	expect(pixel(0, 0)).toEqual([0, 0, 0, 0]);
	expect(pixel(2, 1)).toEqual([255, 0, 0, 255]);
	expect(pixel(5, 2)).toEqual([255, 0, 0, 255]);
	expect(pixel(6, 2)).toEqual([0, 0, 0, 0]);
	expect(test.tree.get(test.root).parent).toBe(test.tree.root);
	expect(test.work()).toBeGreaterThan(0);
});

it("does not weaken the original inline SVG parent requirement", () => {
	const test = fixture();
	expect(() => documentSvgScene(test.tree, test.root, test.charge)).toThrow(
		"root must be embedded in HTML",
	);
});

it("rejects an embedded HTML SVG through the image-document entry point", () => {
	const test = fixture();
	const parent = test.tree.createElement("div");
	test.tree.append(test.tree.root, parent);
	test.tree.append(parent, test.root);
	expect(() => imageSvgScene(test.tree, test.root, test.charge)).toThrow(
		"image root must be a document child",
	);
});

it.each(["svg", "div"])("rejects a sibling %s root", (tagName) => {
	const test = fixture();
	const sibling = test.tree.createParserElement(tagName, {}, svgNamespace);
	test.tree.append(test.tree.root, sibling);
	expect(() => imageSvgScene(test.tree, test.root, test.charge)).toThrow(
		"exactly one SVG root",
	);
});

it("allows surrounding comments and XML whitespace without discarding content", () => {
	const test = fixture();
	const comment = test.tree.createComment("Nonrendering comment");
	const whitespace = test.tree.createText("\n\t \r");
	test.tree.append(test.tree.root, comment);
	test.tree.append(test.tree.root, whitespace);
	const count = test.tree.nodeCount;
	expect(imageSvgScene(test.tree, test.root, test.charge).shapes).toHaveLength(
		1,
	);
	expect(test.tree.nodeCount).toBe(count);
	expect(test.tree.get(comment).data).toBe("Nonrendering comment");
});

it.each(["not XML whitespace", "\u00a0"])(
	"rejects surrounding content %j",
	(text) => {
		const test = fixture();
		test.tree.append(test.tree.root, test.tree.createText(text));
		expect(() => imageSvgScene(test.tree, test.root, test.charge)).toThrow(
			"exactly one SVG root",
		);
	},
);

it("does not silently render an image with unsupported author CSS", () => {
	const test = fixture();
	test.tree.setAttribute(test.shape, "style", "filter: blur(1px)");
	expect(
		Object.keys(documentStyles(test.tree).metrics().issues).length,
	).toBeGreaterThan(0);
	expect(() => imageSvgScene(test.tree, test.root, test.charge)).toThrow(
		"image styles require an issue-free supported profile",
	);
});

it("propagates scene work exhaustion without installing an HTML parent", () => {
	const test = fixture();
	const failure = new Error("Caller work exhausted");
	expect(() =>
		imageSvgScene(test.tree, test.root, () => {
			throw failure;
		}),
	).toThrow(failure);
	expect(test.tree.get(test.root).parent).toBe(test.tree.root);
});
