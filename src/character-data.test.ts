import { afterEach, describe, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
function fixture(limits = {}) {
	const tree = new DocumentTree(
		"https://fixture.invalid/character-data",
		limits,
	);
	documents.push(tree);
	return tree;
}
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

interface TextCapability {
	data: string;
	length: number;
	wholeText: string;
	nodeValue: string;
	textContent: string;
	parentNode: TextCapability | null;
	nextSibling: TextCapability | null;
	childNodes: TextCapability[];
	substringData(...args: unknown[]): string;
	appendData(...args: unknown[]): void;
	insertData(...args: unknown[]): void;
	deleteData(...args: unknown[]): void;
	replaceData(...args: unknown[]): void;
	splitText(...args: unknown[]): TextCapability;
	normalize(): void;
}
function scriptFixture(tree: DocumentTree) {
	const definitions: ScriptHostObjectDefinition[] = [];
	const dom = new ScriptDom(tree, {
		createHostObject(definition) {
			definitions.push(definition);
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, {
					get: property.get,
					set: property.set,
				});
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	});
	return {
		dom,
		node: (id: number) => dom.node(id) as TextCapability,
		definitions,
	};
}

describe("native character data", () => {
	it.each(["text", "comment"] as const)(
		"edits %s by UTF-16 code units and clips counts",
		(kind) => {
			const tree = fixture();
			const id =
				kind === "text" ? tree.createText("a😀b") : tree.createComment("a😀b");
			expect(tree.get(id).data.length).toBe(4);
			expect(tree.substringData(id, 1, 2)).toBe("😀");
			expect(tree.substringData(id, 2, 1).charCodeAt(0)).toBe(0xde00);
			expect(tree.substringData(id, 4, 4_294_967_295)).toBe("");
			tree.replaceData(id, 1, 2, "xy");
			expect(tree.get(id).data).toBe("axyb");
			tree.replaceData(id, 3, 999, "!");
			expect(tree.get(id).data).toBe("axy!");
			tree.replaceData(id, 4, 1, "z");
			expect(tree.get(id).data).toBe("axy!z");
		},
	);
	it("rejects bad offsets and kinds without mutations", () => {
		const tree = fixture();
		const text = tree.createText("abc");
		const revision = tree.revision;
		expect(() => tree.substringData(text, 4, 0)).toThrow(
			expect.objectContaining({ name: "IndexSizeError" }),
		);
		expect(() => tree.replaceData(text, 4, 1, "x")).toThrow(
			expect.objectContaining({ name: "IndexSizeError" }),
		);
		for (const value of [
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			4_294_967_296,
		]) {
			expect(() => tree.substringData(text, value, 1)).toThrow();
			expect(() => tree.replaceData(text, 0, value, "x")).toThrow();
		}
		expect(() => tree.substringData(tree.root, 0, 0)).toThrow(/text\/comment/);
		expect(tree.get(text).data).toBe("abc");
		expect(tree.revision).toBe(revision);
	});
	it("preflights text growth before changing a node", () => {
		const tree = fixture({ maxTextCodeUnits: 4 });
		const text = tree.createText("abcd");
		const before = tree.get(text);
		expect(() => tree.replaceData(text, 1, 1, "too long")).toThrow(
			/text limit/,
		);
		expect(tree.get(text)).toBe(before);
		tree.replaceData(text, 1, 2, "xy");
		expect(tree.get(text).data).toBe("axyd");
	});
	it("splits adjacent to the original without duplicating the text quota", () => {
		const tree = fixture({ maxTextCodeUnits: 6 });
		const parent = tree.createElement("p");
		const text = tree.createText("abcd");
		const comment = tree.createComment("!");
		tree.append(tree.root, parent);
		tree.append(parent, text);
		tree.append(parent, comment);
		const originalView = tree.get(parent);
		const following = tree.splitText(text, 2);
		expect(tree.get(parent).children).toEqual([text, following, comment]);
		expect(originalView.children).toEqual([text, comment]);
		expect(tree.get(text).data).toBe("ab");
		expect(tree.get(following)).toMatchObject({
			data: "cd",
			kind: "text",
			parent,
		});
		expect(tree.textContent(parent)).toBe("abcd");
		expect(() => tree.createText("x")).toThrow(/text limit/);
	});
	it.each([0, 4])(
		"creates an adjacent empty piece at split boundary %s",
		(offset) => {
			const tree = fixture();
			const text = tree.createText("abcd");
			tree.append(tree.root, text);
			const following = tree.splitText(text, offset);
			expect(tree.get(tree.root).children).toEqual([text, following]);
			expect(tree.get(text).data).toBe("abcd".slice(0, offset));
			expect(tree.get(following).data).toBe("abcd".slice(offset));
		},
	);
	it("splits detached text and preserves UTF-16 halves", () => {
		const tree = fixture();
		const text = tree.createText("😀");
		const following = tree.splitText(text, 1);
		expect(tree.get(text).data.charCodeAt(0)).toBe(0xd83d);
		expect(tree.get(following).data.charCodeAt(0)).toBe(0xde00);
		expect(tree.get(following).parent).toBeNull();
	});
	it("preflights split node limits and offsets before touching data", () => {
		const tree = fixture({ maxNodes: 2 });
		const text = tree.createText("abc");
		const revision = tree.revision;
		expect(() => tree.splitText(text, 1)).toThrow(/node limit/);
		expect(() => tree.splitText(text, 4)).toThrow(
			expect.objectContaining({ name: "IndexSizeError" }),
		);
		expect(tree.get(text).data).toBe("abc");
		expect(tree.nodeCount).toBe(2);
		expect(tree.revision).toBe(revision);
	});
	it("does not split or concatenate comments", () => {
		const tree = fixture();
		const comment = tree.createComment("abc");
		expect(() => tree.splitText(comment, 1)).toThrow(/Only text/);
		expect(() => tree.wholeText(comment)).toThrow(/Only text/);
	});
	it("wholeText joins only contiguous text siblings and remains live", () => {
		const tree = fixture();
		const nodes = [
			tree.createText("a"),
			tree.createText(""),
			tree.createText("b"),
			tree.createComment("break"),
			tree.createText("c"),
		];
		for (const node of nodes) tree.append(tree.root, node);
		for (const node of nodes.slice(0, 3))
			expect(tree.wholeText(node)).toBe("ab");
		expect(tree.wholeText(nodes[4])).toBe("c");
		tree.remove(nodes[3]);
		expect(tree.wholeText(nodes[1])).toBe("abc");
		tree.remove(nodes[2]);
		expect(tree.wholeText(nodes[2])).toBe("b");
		expect(tree.wholeText(nodes[0])).toBe("ac");
	});
});

describe("native normalization", () => {
	it("retains the first nonempty text identity, respects boundaries and recurses", () => {
		const tree = fixture();
		const parent = tree.createElement("main");
		const nested = tree.createElement("span");
		const first = tree.createText("a");
		const removed = tree.createText("b");
		const empty = tree.createText("");
		const separator = tree.createComment("boundary");
		const second = tree.createText("c");
		const nestedFirst = tree.createText("x");
		tree.append(tree.root, parent);
		for (const node of [
			empty,
			first,
			tree.createText(""),
			removed,
			separator,
			second,
			tree.createText("d"),
			nested,
		])
			tree.append(parent, node);
		for (const node of [nestedFirst, tree.createText("y")])
			tree.append(nested, node);
		const before = tree.get(parent);
		const count = tree.nodeCount;
		tree.normalize(parent);
		expect(tree.get(parent).children).toEqual([
			first,
			separator,
			second,
			nested,
		]);
		expect(before.children).toHaveLength(8);
		expect(tree.get(first).data).toBe("ab");
		expect(tree.get(second).data).toBe("cd");
		expect(tree.get(nested).children).toEqual([nestedFirst]);
		expect(tree.get(nestedFirst).data).toBe("xy");
		expect(tree.get(removed)).toMatchObject({ data: "b", parent: null });
		expect(tree.get(empty).parent).toBeNull();
		expect(tree.nodeCount).toBe(count);
		const revision = tree.revision;
		tree.normalize(parent);
		expect(tree.revision).toBe(revision);
	});
	it("normalizes a fragment but not siblings outside a text receiver", () => {
		const tree = fixture();
		const fragment = tree.createFragment();
		const first = tree.createText("a");
		const second = tree.createText("b");
		tree.append(fragment, first);
		tree.append(fragment, second);
		tree.normalize(first);
		expect(tree.get(fragment).children).toEqual([first, second]);
		tree.normalize(fragment);
		expect(tree.get(fragment).children).toEqual([first]);
		expect(tree.get(first).data).toBe("ab");
	});
	it("removes a run made only of empty text nodes", () => {
		const tree = fixture();
		const fragment = tree.createFragment();
		const nodes = [tree.createText(""), tree.createText("")];
		for (const node of nodes) tree.append(fragment, node);
		tree.normalize(fragment);
		expect(tree.get(fragment).children).toEqual([]);
		for (const node of nodes) expect(tree.get(node).parent).toBeNull();
	});
	it("charges retained detached data and rejects the entire operation atomically", () => {
		const tree = fixture({ maxTextCodeUnits: 4 });
		const first = tree.createText("a");
		const second = tree.createText("b");
		const comment = tree.createComment("");
		const third = tree.createText("c");
		const fourth = tree.createText("d");
		for (const node of [first, second, comment, third, fourth])
			tree.append(tree.root, node);
		const before = tree.get(tree.root);
		const revision = tree.revision;
		expect(() => tree.normalize(tree.root)).toThrow(/text limit/);
		expect(tree.get(tree.root)).toBe(before);
		expect(tree.get(first).data).toBe("a");
		expect(tree.get(second).parent).toBe(tree.root);
		expect(tree.revision).toBe(revision);
	});
	it("retains detached data in the quota after a successful merge", () => {
		const tree = fixture({ maxTextCodeUnits: 3 });
		const first = tree.createText("a");
		const second = tree.createText("b");
		tree.append(tree.root, first);
		tree.append(tree.root, second);
		tree.normalize(tree.root);
		expect(tree.get(first).data).toBe("ab");
		expect(tree.get(second).data).toBe("b");
		expect(() => tree.createText("x")).toThrow(/text limit/);
	});
	it("handles thousands of adjacent nodes without argument spreading", () => {
		const tree = fixture();
		let first = 0;
		for (let index = 0; index < 5000; index++) {
			const node = tree.createText("a");
			if (!index) first = node;
			tree.append(tree.root, node);
		}
		tree.normalize(tree.root);
		expect(tree.get(tree.root).children).toEqual([first]);
		expect(tree.get(first).data).toBe("a".repeat(5000));
		expect(tree.nodeCount).toBe(5001);
	});
});

describe("script CharacterData capabilities", () => {
	it.each(["text", "comment"] as const)(
		"exposes live %s data and required editing methods",
		(kind) => {
			const tree = fixture();
			const id =
				kind === "text" ? tree.createText("abc") : tree.createComment("abc");
			const { node } = scriptFixture(tree);
			const value = node(id);
			expect(value.data).toBe("abc");
			value.appendData("d");
			value.insertData(1, "X");
			value.deleteData(2, 1);
			value.replaceData(2, 99, "YZ");
			expect(value.data).toBe("aXYZ");
			expect(value.length).toBe(4);
			expect(value.substringData(1, 2)).toBe("XY");
			expect(value.nodeValue).toBe(value.data);
			expect(value.textContent).toBe(value.data);
			tree.setData(id, "native");
			expect(value.data).toBe("native");
			Reflect.set(value, "data", null);
			expect(value.data).toBe("");
			value.appendData(null);
			expect(value.data).toBe("null");
			expect(() => {
				value.length = 10;
			}).toThrow();
		},
	);
	it("brands text-only methods and shares split identity with the tree", () => {
		const tree = fixture();
		const text = tree.createText("abcd");
		const comment = tree.createComment("comment");
		tree.append(tree.root, text);
		const { node } = scriptFixture(tree);
		const value = node(text);
		const tail = value.splitText(2);
		expect(value.nextSibling).toBe(tail);
		expect(node(tree.root).childNodes[1]).toBe(tail);
		expect(value.wholeText).toBe("abcd");
		expect(tail.wholeText).toBe("abcd");
		expect(node(comment).splitText).toBeUndefined();
		expect(node(comment).wholeText).toBeUndefined();
		expect(node(tree.root).data).toBeUndefined();
		node(tree.root).normalize();
		expect(value.data).toBe("abcd");
		expect(tail.data).toBe("cd");
		expect(tail.parentNode).toBeNull();
	});
	it("applies unsigned-long primitive conversion, required args and clipped counts", () => {
		const tree = fixture();
		const { node } = scriptFixture(tree);
		const value = node(tree.createText("abcd"));
		expect(value.substringData(4_294_967_297.9, "2")).toBe("bc");
		expect(value.substringData(undefined, -1)).toBe("abcd");
		expect(value.substringData(Number.POSITIVE_INFINITY, Number.NaN)).toBe("");
		expect(() => value.substringData(-1, 1)).toThrow(
			expect.objectContaining({ name: "IndexSizeError" }),
		);
		for (const method of [
			value.substringData,
			value.insertData,
			value.deleteData,
			value.replaceData,
			value.appendData,
			value.splitText,
		])
			expect(() => method()).toThrow(TypeError);
		for (const invalid of [{}, () => 1, Symbol(), 1n])
			expect(() => value.substringData(invalid, 1)).toThrow(/coercion/);
		expect(() => value.appendData({})).toThrow(/conversion/);
		value.appendData(undefined);
		expect(value.data).toBe("abcdundefined");
	});
	it("revokes retained getters and methods on owner close", () => {
		const tree = fixture();
		const { node, dom } = scriptFixture(tree);
		const value = node(tree.createText("abc"));
		dom.close();
		for (const read of [
			() => value.data,
			() => value.length,
			() => value.wholeText,
			() => value.substringData(0, 1),
			() => value.appendData("x"),
			() => value.splitText(1),
			() => value.normalize(),
		])
			expect(read).toThrow(/closed/);
		expect(() => {
			value.data = "changed";
		}).toThrow(/closed/);
	});
});
