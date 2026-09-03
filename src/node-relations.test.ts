import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	NodeRelations,
	nodePositionConstants,
	nodeRelationLimits,
} from "./node-relations.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface NodeCapability {
	contains(...args: unknown[]): boolean;
	compareDocumentPosition(...args: unknown[]): number;
	isSameNode(...args: unknown[]): boolean;
	isEqualNode(...args: unknown[]): boolean;
	cloneNode(deep?: boolean): NodeCapability;
	getAttributeNode(name: string): NodeCapability;
	removeAttribute(name: string): void;
	setAttribute(name: string, value: string): void;
	setAttributeNode(node: NodeCapability): NodeCapability | null;
	childNodes: NodeCapability[];
	[key: string]: unknown;
}

const trees: DocumentTree[] = [];
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const value = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(value, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(value, name, { value: method });
		return value;
	},
};

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/relations");
	trees.push(tree);
	const root = tree.createElement("main", { id: "root", title: "hello" });
	const first = tree.createElement("section", { "data-key": "first" });
	const text = tree.createText("a😀b");
	const comment = tree.createComment("marker");
	const second = tree.createElement("input", { value: "initial" });
	tree.append(tree.root, root);
	tree.append(root, first);
	tree.append(first, text);
	tree.append(first, comment);
	tree.append(root, second);
	const dom = new ScriptDom(tree, factory);
	return {
		tree,
		dom,
		root,
		first,
		text,
		comment,
		second,
		node: (id: number) => dom.node(id) as NodeCapability,
	};
}

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

describe("live script node relationships", () => {
	const order = [
		"document",
		"root",
		"first",
		"text",
		"comment",
		"second",
	] as const;
	const ancestors: Record<(typeof order)[number], readonly string[]> = {
		document: [],
		root: ["document"],
		first: ["document", "root"],
		text: ["document", "root", "first"],
		comment: ["document", "root", "first"],
		second: ["document", "root"],
	};
	for (const [firstIndex, firstName] of order.entries())
		for (const [secondIndex, secondName] of order.entries())
			it(`${firstName} relative to ${secondName}`, () => {
				const data = fixture();
				const first = data.node(
					firstName === "document" ? data.tree.root : data[firstName],
				);
				const second = data.node(
					secondName === "document" ? data.tree.root : data[secondName],
				);
				const expected =
					firstIndex === secondIndex
						? 0
						: ancestors[firstName].includes(secondName)
							? 10
							: ancestors[secondName].includes(firstName)
								? 20
								: firstIndex < secondIndex
									? 4
									: 2;
				expect(first.compareDocumentPosition(second)).toBe(expected);
				expect(first.contains(second)).toBe(
					first === second || ancestors[secondName].includes(firstName),
				);
				expect(first.isSameNode(second)).toBe(first === second);
			});
	it("reflects sibling moves, detachment and reinsertion without stale caches", () => {
		const { tree, node, root, first, second } = fixture();
		const parent = node(root);
		const before = node(first);
		const after = node(second);
		const revision = tree.revision;
		expect(before.compareDocumentPosition(after)).toBe(4);
		expect(tree.revision).toBe(revision);
		tree.insert(root, second, first);
		expect(before.compareDocumentPosition(after)).toBe(2);
		tree.remove(first);
		expect(parent.contains(before)).toBe(false);
		expect(parent.compareDocumentPosition(before) & 33).toBe(33);
		tree.append(root, first);
		expect(parent.contains(before)).toBe(true);
		expect(parent.compareDocumentPosition(before)).toBe(20);
		expect(before.isSameNode(node(first))).toBe(true);
	});
	it("keeps detached subtrees consistently ordered, including interleaved allocations", () => {
		const { tree, node } = fixture();
		const firstRoot = tree.createElement("aside");
		const secondRoot = tree.createElement("aside");
		const secondChild = tree.createText("later root first child");
		const firstChild = tree.createText("earlier root later child");
		tree.append(firstRoot, firstChild);
		tree.append(secondRoot, secondChild);
		for (const first of [firstRoot, firstChild])
			for (const second of [secondRoot, secondChild]) {
				expect(node(first).compareDocumentPosition(node(second))).toBe(37);
				expect(node(second).compareDocumentPosition(node(first))).toBe(35);
			}
	});
	it("compares fragment contents before and after transfer", () => {
		const { tree, node, root } = fixture();
		const fragment = tree.createFragment();
		const child = tree.createText("fragment");
		tree.append(fragment, child);
		expect(node(fragment).contains(node(child))).toBe(true);
		expect(node(child).compareDocumentPosition(node(fragment))).toBe(10);
		tree.append(root, fragment);
		expect(node(fragment).contains(node(child))).toBe(false);
		expect(node(fragment).compareDocumentPosition(node(child)) & 33).toBe(33);
		expect(node(root).contains(node(child))).toBe(true);
	});
	it("recognizes native identity across two facades, without accepting forged capabilities", () => {
		const data = fixture();
		const second = new ScriptDom(data.tree, factory);
		expect(data.node(data.root).isSameNode(second.node(data.root))).toBe(true);
		expect(
			data.node(data.root).compareDocumentPosition(second.node(data.root)),
		).toBe(0);
		const forged = Object.assign(Object.create(null), {
			nodeType: 1,
			id: data.root,
		});
		expect(() => data.node(data.root).contains(forged)).toThrow(TypeError);
		second.close();
	});
	it("compares separate documents structurally without sharing node identity", () => {
		const first = fixture();
		const second = fixture();
		expect(
			first.node(first.tree.root).isEqualNode(second.node(second.tree.root)),
		).toBe(true);
		expect(first.node(first.root).isSameNode(second.node(second.root))).toBe(
			false,
		);
		expect(first.node(first.root).contains(second.node(second.text))).toBe(
			false,
		);
		expect(
			first.node(first.text).compareDocumentPosition(second.node(second.root)),
		).toBe(37);
		expect(
			second.node(second.root).compareDocumentPosition(first.node(first.text)),
		).toBe(35);
	});
	it("preserves equality across attribute order but observes values, children and text", () => {
		const { tree, node, first } = fixture();
		tree.setAttribute(first, "title", "second");
		const copy = tree.clone(first, true);
		tree.removeAttribute(copy, "data-key");
		tree.setAttribute(copy, "data-key", "first");
		expect(node(first).isEqualNode(node(copy))).toBe(true);
		expect(node(first).isSameNode(node(copy))).toBe(false);
		tree.setAttribute(copy, "title", "changed");
		expect(node(first).isEqualNode(node(copy))).toBe(false);
		tree.setAttribute(copy, "title", "second");
		tree.setData(tree.get(copy).children[0], "a😀c");
		expect(node(first).isEqualNode(node(copy))).toBe(false);
		tree.setData(tree.get(copy).children[0], "a😀b");
		tree.insert(copy, tree.get(copy).children[1], tree.get(copy).children[0]);
		expect(node(first).isEqualNode(node(copy))).toBe(false);
	});
	it("distinguishes kinds, tag names, child counts and attribute sets", () => {
		const { tree, node, first, text, comment } = fixture();
		expect(node(text).isEqualNode(node(comment))).toBe(false);
		expect(
			node(tree.createElement("div")).isEqualNode(
				node(tree.createElement("span")),
			),
		).toBe(false);
		expect(node(tree.createFragment()).isEqualNode(node(tree.root))).toBe(
			false,
		);
		expect(node(first).isEqualNode(node(tree.clone(first, false)))).toBe(false);
		const copy = tree.clone(first, true);
		tree.setAttribute(copy, "extra", "value");
		expect(node(first).isEqualNode(node(copy))).toBe(false);
		tree.removeAttribute(copy, "extra");
		tree.removeAttribute(copy, "data-key");
		expect(node(first).isEqualNode(node(copy))).toBe(false);
	});
	it("ignores runtime form state in structural equality", () => {
		const { tree, node, second } = fixture();
		const copy = tree.clone(second, true);
		tree.setControl(second, { value: "edited", checked: true });
		tree.setControl(copy, { value: "other", checked: false });
		expect(node(second).isEqualNode(node(copy))).toBe(true);
	});
	it("compares dangerous-looking attribute names without prototype lookup", () => {
		const { tree, node, first } = fixture();
		for (const name of ["__proto__", "constructor", "toString"])
			tree.setAttribute(first, name, "safe");
		const copy = tree.clone(first, true);
		expect(node(first).isEqualNode(node(copy))).toBe(true);
		tree.removeAttribute(copy, "__proto__");
		expect(node(first).isEqualNode(node(copy))).toBe(false);
	});
	it.each(["contains", "isSameNode", "isEqualNode"] as const)(
		"%s accepts null/undefined but requires an argument",
		(method) => {
			const { node, root } = fixture();
			expect(node(root)[method](null)).toBe(false);
			expect(node(root)[method](undefined)).toBe(false);
			expect(() => node(root)[method]()).toThrow(TypeError);
		},
	);
	it.each([null, undefined, 0, "node", true, {}, () => 1, Symbol("node")])(
		"rejects a non-node position operand %s",
		(value) => {
			const { node, root } = fixture();
			expect(() => node(root).compareDocumentPosition(value)).toThrow(
				TypeError,
			);
		},
	);
	it.each([
		"contains",
		"isSameNode",
		"isEqualNode",
		"compareDocumentPosition",
	] as const)("revokes %s on either closed owner", (method) => {
		const first = fixture();
		const second = fixture();
		const firstNode = first.node(first.root);
		const secondNode = second.node(second.root);
		second.dom.close();
		expect(() => firstNode[method](secondNode)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		expect(() => secondNode[method](firstNode)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		first.tree.close();
		expect(() => firstNode[method](null)).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
	});
	it("exposes readonly position constants on every supported node kind", () => {
		const data = fixture();
		const values = [
			data.node(data.tree.root),
			data.node(data.root),
			data.node(data.text),
			data.node(data.comment),
			data.node(data.tree.createFragment()),
			data.node(data.root).getAttributeNode("id"),
		];
		for (const value of values)
			for (const [name, expected] of Object.entries(nodePositionConstants)) {
				expect(value[name]).toBe(expected);
				expect(Reflect.set(value, name, 99)).toBe(false);
				expect(value[name]).toBe(expected);
			}
	});
});

describe("attribute node relations", () => {
	it("distinguishes attribute ordering from child containment", () => {
		const { node, root, first } = fixture();
		const owner = node(root);
		const child = node(first);
		const id = owner.getAttributeNode("id");
		const title = owner.getAttributeNode("title");
		const childAttribute = child.getAttributeNode("data-key");
		expect(id.compareDocumentPosition(title)).toBe(36);
		expect(title.compareDocumentPosition(id)).toBe(34);
		expect(owner.compareDocumentPosition(id)).toBe(20);
		expect(id.compareDocumentPosition(owner)).toBe(10);
		expect(id.compareDocumentPosition(child)).toBe(4);
		expect(child.compareDocumentPosition(id)).toBe(2);
		expect(owner.compareDocumentPosition(childAttribute)).toBe(20);
		expect(childAttribute.compareDocumentPosition(owner)).toBe(10);
		expect(id.compareDocumentPosition(childAttribute)).toBe(4);
		expect(childAttribute.compareDocumentPosition(id)).toBe(2);
		expect(owner.contains(id)).toBe(false);
		expect(id.contains(owner)).toBe(false);
		expect(id.contains(id)).toBe(true);
		expect(id.isSameNode(owner.getAttributeNode("id"))).toBe(true);
	});
	it("tracks removed, reattached and replaced attribute ownership", () => {
		const { node, root, first } = fixture();
		const owner = node(root);
		const child = node(first);
		const attribute = owner.getAttributeNode("title");
		owner.removeAttribute("title");
		expect(owner.compareDocumentPosition(attribute) & 33).toBe(33);
		child.setAttributeNode(attribute);
		expect(child.compareDocumentPosition(attribute)).toBe(20);
		expect(owner.compareDocumentPosition(attribute)).toBe(20);
		const clone = attribute.cloneNode();
		expect(attribute.isEqualNode(clone)).toBe(true);
		expect(attribute.isSameNode(clone)).toBe(false);
		expect(child.setAttributeNode(clone)).toBe(attribute);
		expect(child.compareDocumentPosition(attribute) & 33).toBe(33);
		expect(child.compareDocumentPosition(clone)).toBe(20);
	});
	it("compares attribute name/value independent of owner, including cross-document nodes", () => {
		const first = fixture();
		const second = fixture();
		const attribute = first.node(first.root).getAttributeNode("title");
		const other = second.node(second.root).getAttributeNode("title");
		expect(attribute.isEqualNode(other)).toBe(true);
		expect(attribute.isEqualNode(first.node(first.root))).toBe(false);
		expect(
			attribute.isEqualNode(first.node(first.root).getAttributeNode("id")),
		).toBe(false);
		second.node(second.root).setAttribute("title", "different");
		expect(attribute.isEqualNode(other)).toBe(false);
		expect(attribute.compareDocumentPosition(other) & 33).toBe(33);
	});
	it("reorders attached attributes after removal and append", () => {
		const { node, root } = fixture();
		const owner = node(root);
		const id = owner.getAttributeNode("id");
		const title = owner.getAttributeNode("title");
		owner.removeAttribute("id");
		owner.setAttributeNode(id);
		expect(id.compareDocumentPosition(title)).toBe(34);
		expect(title.compareDocumentPosition(id)).toBe(36);
	});
});

describe("node comparison resources", () => {
	function limited(overrides: Partial<typeof nodeRelationLimits>) {
		const data = fixture();
		const relations = new NodeRelations(data.tree, overrides);
		const node = (id: number, attribute = false) => {
			const value = factory.createHostObject(
				relations.definition(id, attribute),
			);
			relations.register(value, id, attribute);
			return value as NodeCapability;
		};
		return { ...data, node, relations };
	}
	it("bounds comparison work with no mutation or persistent failed-operation state", () => {
		const { tree, node, root, text } = limited({ maxWork: 2 });
		const revision = tree.revision;
		expect(() => node(text).contains(node(root))).not.toThrow();
		expect(() => node(root).contains(node(text))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(node(root).contains(node(root))).toBe(true);
		expect(tree.revision).toBe(revision);
	});
	it("bounds path depth before allocating another entry", () => {
		const { node, root, text } = limited({ maxDepth: 2 });
		expect(() => node(root).compareDocumentPosition(node(text))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	});
	it("bounds iterative structural equality depth", () => {
		const { tree, node, root } = limited({ maxDepth: 2 });
		const clone = tree.clone(root, true);
		expect(() => node(root).isEqualNode(node(clone))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	});
	it("bounds character comparison and still short-circuits native identity", () => {
		const { tree, node, text } = limited({ maxCodeUnits: 3 });
		const copy = tree.clone(text, true);
		expect(() => node(text).isEqualNode(node(copy))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(node(text).isEqualNode(node(text))).toBe(true);
	});
	it("bounds attribute-name and value comparison", () => {
		const { tree, node, root } = limited({ maxCodeUnits: 3 });
		const first = tree.getAttributeNode(root, "id") as number;
		const second = tree.getAttributeNode(root, "title") as number;
		expect(() =>
			node(first, true).compareDocumentPosition(node(second, true)),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(() => node(first, true).isEqualNode(node(second, true))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
	});
	it("bounds wide-tree equality work without retaining a partial pair cache", () => {
		const { tree, node, relations } = limited({ maxWork: 12 });
		const root = tree.createElement("div");
		for (let index = 0; index < 20; index++)
			tree.append(root, tree.createText("x"));
		const clone = tree.clone(root, true);
		expect(() => node(root).isEqualNode(node(clone))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(() => node(root).isEqualNode(node(clone))).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(node(root).isEqualNode(node(root))).toBe(true);
		expect(() => relations.register({}, 0)).toThrow();
	});
	it("bounds a wide sibling search independently of path depth", () => {
		const { tree, node } = limited({ maxWork: 12 });
		const root = tree.createElement("div");
		for (let index = 0; index < 20; index++)
			tree.append(root, tree.createText("x"));
		const children = tree.get(root).children;
		expect(() =>
			node(children[18]).compareDocumentPosition(node(children[19])),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	});
	it("walks a deep tree iteratively, without recursive equality", () => {
		const tree = new DocumentTree("https://fixture.invalid/deep", {
			maxDepth: 600,
		});
		trees.push(tree);
		const root = tree.createElement("main");
		let parent = root;
		for (let depth = 0; depth < 500; depth++) {
			const child = tree.createElement("div");
			tree.append(parent, child);
			parent = child;
		}
		const copy = tree.clone(root, true);
		const dom = new ScriptDom(tree, factory);
		expect((dom.node(root) as NodeCapability).isEqualNode(dom.node(copy))).toBe(
			true,
		);
		expect((dom.node(root) as NodeCapability).contains(dom.node(parent))).toBe(
			true,
		);
	});
	it.each([
		0,
		-1,
		1.5,
		Number.POSITIVE_INFINITY,
		Number.NaN,
		nodeRelationLimits.maxWork + 1,
	])("rejects invalid or increased work limit %s", (maxWork) => {
		const { tree } = fixture();
		expect(() => new NodeRelations(tree, { maxWork })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	});
});
