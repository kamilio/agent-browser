import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { isInertRoot, isInertSubtree } from "./inertness.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(content: string) {
	const tree = parseHtmlDocument(content, "https://fixture.invalid/inert");
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		inert: (selector: string) => isInertSubtree(tree, id(selector)),
	};
}

it.each(["", "inert", "inert=false"])(
	"recognizes select-button roots and descendants with %s",
	(attributes) => {
		const { inert } = fixture(
			`<select><button ${attributes}><span>Choice</span></button><option>One</option></select>`,
		);
		expect(inert("button")).toBe(true);
		expect(inert("span")).toBe(true);
		expect(inert("option")).toBe(false);
		expect(inert("select")).toBe(false);
	},
);

it.each(["<div></div>", "<div hidden></div>", "<option>One</option>"])(
	"does not treat a button after %s as the first element",
	(prefix) => {
		const { inert } = fixture(
			`<select>${prefix}<button><span>Text</span></button></select>`,
		);
		expect(inert("button")).toBe(false);
		expect(inert("span")).toBe(false);
	},
);

it.each(["text", "<!-- comment -->", " \n<!-- comment -->text"])(
	"ignores non-element prefixes: %s",
	(prefix) => {
		const { inert } = fixture(
			`<select>${prefix}<button><span>Text</span></button></select>`,
		);
		expect(inert("span")).toBe(true);
	},
);

it.each([
	"<main inert><div><span>Text</span></div></main>",
	"<select inert><option><span>Text</span></option></select>",
])("retains explicit ancestor inertness: %s", (source) => {
	const { inert } = fixture(source);
	expect(inert("span")).toBe(true);
});

it("does not let pointer-events auto override an inert ancestor", () => {
	const { inert } = fixture(
		'<select><button><span style="pointer-events:auto">Text</span></button></select>',
	);
	expect(inert("span")).toBe(true);
});

it("does not conflate disabled or pointer-events none with inert", () => {
	const { inert } = fixture(
		'<main style="pointer-events:none"><button disabled><span>Text</span></button></main>',
	);
	expect(inert("span")).toBe(false);
});

it("recomputes after first-child insertion and removal", () => {
	const { tree, id, inert } = fixture(
		"<select><button><span>Text</span></button></select>",
	);
	expect(inert("span")).toBe(true);
	const prefix = tree.createElement("div");
	tree.insert(id("select"), prefix, id("button"));
	expect(inert("span")).toBe(false);
	tree.remove(prefix);
	expect(inert("span")).toBe(true);
});

it("recomputes after button moves between owners", () => {
	const { tree, id, inert } = fixture(
		"<main></main><select><button><span>Text</span></button></select>",
	);
	expect(inert("span")).toBe(true);
	tree.append(id("main"), id("button"));
	expect(inert("span")).toBe(false);
	tree.append(id("select"), id("button"));
	expect(inert("span")).toBe(true);
});

it("checks text-node ancestors as well as element ancestors", () => {
	const { tree, id } = fixture("<select><button>Text</button></select>");
	expect(isInertSubtree(tree, tree.get(id("button")).children[0])).toBe(true);
});

it("supports detached native subtrees without assuming connectivity", () => {
	const { tree, id } = fixture(
		"<select><button><span>Text</span></button></select>",
	);
	const descendant = id("span");
	tree.remove(id("select"));
	expect(isInertSubtree(tree, descendant)).toBe(true);
});

it("charges ancestor visits and cold first-element scans", () => {
	const { tree, id } = fixture(
		"<select><!--1--><!--2--><button><span>Text</span></button></select>",
	);
	let work = 0;
	expect(
		isInertSubtree(tree, id("span"), () => {
			work++;
		}),
	).toBe(true);
	expect(work).toBe(5);
	work = 0;
	expect(
		isInertSubtree(tree, id("span"), () => {
			work++;
		}),
	).toBe(true);
	expect(work).toBe(2);
});

it("does not publish a partial first-child cache after a work-limit error", () => {
	const { tree, id } = fixture(
		"<select><!--1--><!--2--><button>Text</button></select>",
	);
	const button = tree.get(id("button"));
	let work = 0;
	expect(() =>
		isInertRoot(tree, button, () => {
			if (++work === 2) throw new Error("budget");
		}),
	).toThrow("budget");
	work = 0;
	expect(
		isInertRoot(tree, button, () => {
			work++;
		}),
	).toBe(true);
	expect(work).toBe(3);
});

it("propagates ancestor work limits without turning them into eligible targets", () => {
	const { tree, id } = fixture("<main><div><span>Text</span></div></main>");
	let work = 0;
	expect(() =>
		isInertSubtree(tree, id("span"), () => {
			if (++work > 1) throw new Error("budget");
		}),
	).toThrow("budget");
});

it("rejects an invalid node or closed owner", () => {
	const { tree, id } = fixture("<main>Text</main>");
	const main = id("main");
	expect(() => isInertSubtree(tree, -1)).toThrow();
	tree.close();
	expect(() => isInertSubtree(tree, main)).toThrow();
});
