import { afterEach, expect, it } from "vitest";
import {
	DocumentResources,
	type DocumentResourceLimits,
} from "./document-resources.js";
import { DocumentTree, type DocumentLimits } from "./document.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const resources: DocumentResources[] = [];
const trees: DocumentTree[] = [];
afterEach(() => {
	for (const owner of resources.splice(0)) owner.close();
	for (const tree of trees.splice(0)) tree.close();
});
function pool(limits: Partial<DocumentResourceLimits> = {}) {
	const owner = new DocumentResources(limits);
	resources.push(owner);
	return owner;
}
function document(
	owner?: DocumentResources,
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree("about:blank", limits, owner);
	trees.push(tree);
	return tree;
}

it("counts roots, detached nodes, attributes and text across documents", () => {
	const owner = pool();
	const first = document(owner);
	const second = document(owner);
	first.createElement("div", { id: "a" });
	first.createText("🙂");
	second.createAttribute("title", "b");
	expect(owner.metrics()).toEqual({
		documents: 2,
		nodes: 5,
		textCodeUnits: 14,
		closed: false,
	});
	expect(first.resourceUsage()).toEqual({ nodes: 3, textCodeUnits: 8 });
	expect(Object.isFrozen(first.resourceUsage())).toBe(true);
	expect(Object.isFrozen(owner.metrics())).toBe(true);
});

it("enforces a shared node limit before allocating any node kind", () => {
	const owner = pool({ maxNodes: 4 });
	const first = document(owner);
	const second = document(owner);
	first.createElement("p");
	second.createAttribute("id");
	const before = owner.metrics();
	for (const allocate of [
		() => first.createText("text"),
		() => second.createComment("comment"),
		() => first.createFragment(),
		() => second.createDocumentType("html"),
		() => first.createElement("b"),
		() => second.createAttribute("title"),
	]) {
		expect(allocate).toThrow("Shared document node limit");
		expect(owner.metrics()).toEqual(before);
	}
});

it("preflights the full copy before a shared node failure", () => {
	const source = document();
	const parent = source.createElement("p");
	source.append(parent, source.createText("child"));
	const owner = pool({ maxNodes: 3 });
	const first = document(owner);
	document(owner);
	expect(() => first.copyFrom(source, parent)).toThrow(
		"Shared document node limit",
	);
	expect(first.nodeCount).toBe(1);
	expect(owner.metrics().nodes).toBe(2);
});

it("counts closed documents as released resources", () => {
	const owner = pool({ maxDocuments: 1, maxNodes: 2, maxTextCodeUnits: 3 });
	const first = document(owner);
	first.createText("abc");
	first.close();
	expect(first.resourceUsage()).toEqual({ nodes: 0, textCodeUnits: 0 });
	expect(owner.metrics()).toEqual({
		documents: 0,
		nodes: 0,
		textCodeUnits: 0,
		closed: false,
	});
	const second = document(owner);
	second.createText("xyz");
	expect(owner.metrics().textCodeUnits).toBe(3);
});

for (const key of ["maxDocuments", "maxNodes", "maxTextCodeUnits"] as const)
	for (const value of [
		0,
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])
		it(`rejects invalid ${key}: ${String(value)}`, () => {
			expect(() => pool({ [key]: value })).toThrow(
				"Invalid document resource limit",
			);
		});

it("caps scans at sixteen documents and freezes configured limits", () => {
	expect(() => pool({ maxDocuments: 17 })).toThrow("At most 16");
	const owner = pool();
	for (let index = 0; index < 16; index++) document(owner);
	expect(() => document(owner)).toThrow("Shared document count limit");
	expect(owner.metrics().documents).toBe(16);
	expect(Object.isFrozen(owner.limits)).toBe(true);
});

it("does not retain a failed root allocation", () => {
	const owner = pool({ maxNodes: 1 });
	const first = document(owner);
	expect(() => document(owner)).toThrow("Shared document node limit");
	expect(owner.metrics().documents).toBe(1);
	first.close();
	document(owner);
	expect(owner.metrics().nodes).toBe(1);
});

it("validates document arguments before admission", () => {
	const owner = pool();
	expect(() => new DocumentTree("not a URL", {}, owner)).toThrow();
	expect(() => document(owner, { maxDepth: 0 })).toThrow(
		"Invalid document limit",
	);
	expect(owner.metrics().documents).toBe(0);
});

it("rejects duplicate registration without changing usage", () => {
	const owner = pool();
	const tree = document(owner);
	expect(() => owner.register(tree)).toThrow("already shares resources");
	expect(owner.metrics().nodes).toBe(1);
});

it("enforces local limits even when shared limits have space", () => {
	const owner = pool();
	const first = document(owner, { maxNodes: 1 });
	const second = document(owner, { maxTextCodeUnits: 2 });
	expect(() => first.createText("")).toThrow("Document node limit");
	expect(() => second.createText("abc")).toThrow("Document text limit");
	expect(owner.metrics()).toEqual({
		documents: 2,
		nodes: 2,
		textCodeUnits: 0,
		closed: false,
	});
});

it("keeps unpooled documents and independent pools isolated", () => {
	const firstOwner = pool({ maxNodes: 1 });
	const secondOwner = pool({ maxTextCodeUnits: 1 });
	const first = document(firstOwner);
	const second = document(secondOwner);
	const independent = document();
	independent.createText("independent data");
	second.createText("x");
	expect(() => first.createFragment()).toThrow("Shared document node limit");
	firstOwner.close();
	expect(second.get(second.root).kind).toBe("document");
	expect(independent.nodeCount).toBe(2);
});

it("charges UTF-16 units and allows shrinking text to release capacity", () => {
	const owner = pool({ maxTextCodeUnits: 8 });
	const first = document(owner);
	const second = document(owner);
	const text = first.createText("🙂🙂");
	const comment = second.createComment("abcd");
	expect(() => first.setData(text, "🙂🙂x")).toThrow(
		"Shared document text limit",
	);
	expect(first.get(text).data).toBe("🙂🙂");
	second.setData(comment, "ab");
	first.setData(text, "🙂🙂🙂");
	expect(owner.metrics().textCodeUnits).toBe(8);
});

it("preflights attributes and doctype identifiers before node allocation", () => {
	const owner = pool({ maxTextCodeUnits: 10 });
	const first = document(owner);
	const second = document(owner);
	first.createText("abc");
	const before = owner.metrics();
	expect(() => second.createElement("div", { id: "abc" })).toThrow(
		"Shared document text limit",
	);
	expect(() => second.createDocumentType("html", "pub", "sys")).toThrow(
		"Shared document text limit",
	);
	expect(owner.metrics()).toEqual(before);
	second.createDocumentType("html", "pub");
	expect(owner.metrics().textCodeUnits).toBe(10);
});

it("counts captured attributes and preserves values after rejected changes", () => {
	const owner = pool({ maxTextCodeUnits: 20 });
	const first = document(owner);
	const second = document(owner);
	const element = first.createElement("div", { id: "abc" });
	const attribute = first.getAttributeNode(element, "id") as number;
	second.createComment("1234567");
	expect(owner.metrics().textCodeUnits).toBe(20);
	expect(() => first.setAttributeValue(attribute, "abcd")).toThrow(
		"Shared document text limit",
	);
	expect(first.get(element).attributes.id).toBe("abc");
	expect(first.getAttributeRecord(attribute).value).toBe("abc");
	first.removeAttributeNode(element, attribute);
	expect(owner.metrics().textCodeUnits).toBe(15);
	first.setAttributeValue(attribute, "abcdefgh");
	expect(owner.metrics().textCodeUnits).toBe(20);
});

it("checks detached attribute attachment before changing either owner", () => {
	const owner = pool({ maxTextCodeUnits: 10 });
	const tree = document(owner);
	const element = tree.createElement("div");
	const attribute = tree.createAttribute("id", "abc");
	expect(() => tree.setAttributeNode(element, attribute)).toThrow(
		"Shared document text limit",
	);
	expect(tree.getAttributeRecord(attribute).ownerElement).toBeNull();
	expect(tree.get(element).attributes.id).toBeUndefined();
	expect(owner.metrics().textCodeUnits).toBe(8);
});

it("accounts for control values and custom validity messages", () => {
	const owner = pool({ maxTextCodeUnits: 12 });
	const first = document(owner);
	const second = document(owner);
	const input = first.createElement("input");
	first.setControl(input, { value: "abcd" });
	first.setCustomValidity(input, "bad");
	expect(() => second.createText("x")).toThrow("Shared document text limit");
	expect(() => first.setControl(input, { value: "abcde" })).toThrow(
		"Shared document text limit",
	);
	expect(() => first.setCustomValidity(input, "worse")).toThrow(
		"Shared document text limit",
	);
	expect(first.get(input).control.value).toBe("abcd");
	expect(first.getCustomValidity(input)).toBe("bad");
	first.setCustomValidity(input, "");
	second.createText("xyz");
	expect(owner.metrics().textCodeUnits).toBe(12);
});

it("retains detached subtrees in both shared budgets", () => {
	const owner = pool({ maxNodes: 3, maxTextCodeUnits: 4 });
	const tree = document(owner);
	const parent = tree.createElement("p");
	tree.append(parent, tree.createText("abc"));
	tree.append(tree.root, parent);
	tree.remove(parent);
	expect(owner.metrics().nodes).toBe(3);
	expect(owner.metrics().textCodeUnits).toBe(4);
	expect(() => tree.createText("")).toThrow("Shared document node limit");
});

it("splits text without requiring duplicate shared text capacity", () => {
	const owner = pool({ maxTextCodeUnits: 4, maxNodes: 4 });
	const tree = document(owner);
	const parent = tree.createElement("p");
	const text = tree.createText("abc");
	tree.append(parent, text);
	const suffix = tree.splitText(text, 1);
	expect(tree.get(text).data).toBe("a");
	expect(tree.get(suffix).data).toBe("bc");
	expect(owner.metrics().textCodeUnits).toBe(4);
	const before = owner.metrics();
	expect(() => tree.splitText(text, 0)).toThrow("Shared document node limit");
	expect(tree.get(text).data).toBe("a");
	expect(owner.metrics()).toEqual(before);
});

it("preflights normalization while retaining detached text nodes", () => {
	const owner = pool({ maxTextCodeUnits: 5 });
	const tree = document(owner);
	const parent = tree.createElement("p");
	const first = tree.createText("ab");
	const second = tree.createText("cd");
	tree.append(parent, first);
	tree.append(parent, second);
	expect(() => tree.normalize(parent)).toThrow("Shared document text limit");
	expect(tree.get(parent).children).toEqual([first, second]);
	expect(tree.get(first).data).toBe("ab");
});

it("preflights copying all retained payloads from another pool", () => {
	const source = document(pool());
	const parent = source.createElement("input", { id: "a" });
	source.setControl(parent, { value: "value" });
	const owner = pool({ maxTextCodeUnits: 12 });
	const target = document(owner);
	expect(() => target.copyFrom(source, parent)).toThrow(
		"Shared document text limit",
	);
	expect(target.nodeCount).toBe(1);
	expect(owner.metrics().textCodeUnits).toBe(0);
	const doctype = source.createDocumentType("html", "pub", "system");
	expect(() => target.copyFrom(source, doctype)).toThrow(
		"Shared document text limit",
	);
	expect(target.nodeCount).toBe(1);
});

it("charges same-pool copying on top of the original retained nodes", () => {
	const owner = pool({ maxTextCodeUnits: 8, maxNodes: 6 });
	const source = document(owner);
	const target = document(owner);
	const parent = source.createElement("p");
	source.append(parent, source.createText("abc"));
	const copy = target.copyFrom(source, parent);
	expect(target.textContent(copy)).toBe("abc");
	expect(owner.metrics().nodes).toBe(6);
	expect(owner.metrics().textCodeUnits).toBe(8);
	source.close();
	expect(target.textContent(copy)).toBe("abc");
	expect(owner.metrics().textCodeUnits).toBe(4);
});

it("prevents native change callbacks from overcommitting a later copy payload", () => {
	const source = document();
	const fragment = source.createFragment();
	source.append(fragment, source.createElement("p"));
	source.append(fragment, source.createElement("b", { id: "12345" }));
	const owner = pool({ maxTextCodeUnits: 10 });
	const target = document(owner);
	const sibling = document(owner);
	let called = false;
	target.onChange(() => {
		if (called) return;
		called = true;
		sibling.createText("xx");
	});
	expect(() => target.copyFrom(source, fragment)).toThrow(
		"Shared document text limit",
	);
	expect(called).toBe(true);
	expect(owner.metrics().textCodeUnits).toBe(3);
	expect(target.nodeCount).toBe(3);
});

it("rejects invalid resource changes without changing metrics", () => {
	const owner = pool();
	document(owner);
	const before = owner.metrics();
	for (const [nodes, text] of [
		[-1, 0],
		[0.5, 0],
		[0, Number.NaN],
		[0, 0.5],
	])
		expect(() => owner.check(nodes, text)).toThrow(
			"Invalid document resource change",
		);
	expect(owner.metrics()).toEqual(before);
});

it("closes all documents even when multiple cleanup handlers fail", () => {
	const owner = pool();
	const first = document(owner);
	const second = document(owner);
	first.onClose(() => {
		throw new Error("first cleanup");
	});
	second.onClose(() => {
		throw new Error("second cleanup");
	});
	let failure: unknown;
	try {
		owner.close();
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(AggregateError);
	expect((failure as AggregateError).errors).toHaveLength(2);
	expect(() => first.get(first.root)).toThrow("closed");
	expect(() => second.get(second.root)).toThrow("closed");
	expect(owner.metrics()).toEqual({
		documents: 0,
		nodes: 0,
		textCodeUnits: 0,
		closed: true,
	});
	expect(() => owner.close()).not.toThrow();
	expect(() => document(owner)).toThrow("closed");
	expect(() => owner.check()).toThrow("closed");
});

it("releases a document before running its cleanup handlers", () => {
	const owner = pool({ maxDocuments: 1, maxNodes: 1 });
	const first = document(owner);
	let replacement: DocumentTree | undefined;
	first.onClose(() => {
		replacement = document(owner);
	});
	first.close();
	expect(replacement?.nodeCount).toBe(1);
	expect(owner.metrics().documents).toBe(1);
});

it("prevents admissions and sibling allocations during family teardown", () => {
	const owner = pool();
	const first = document(owner);
	const second = document(owner);
	first.onClose(() => {
		expect(() => document(owner)).toThrow("closed");
		expect(() => second.createText("x")).toThrow("closed");
		owner.close();
	});
	owner.close();
	expect(second.nodeCount).toBe(0);
});

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition) {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};
interface ScriptDocument {
	nodeType: number;
	createTextNode(data: string): object;
	importNode(node: object, deep?: boolean): object;
	implementation: { hasFeature(): boolean };
}

it("enforces the shared budget through script creation and importing", () => {
	const owner = pool({ maxNodes: 3 });
	const first = new ScriptDom(document(owner), factory)
		.document as ScriptDocument;
	const second = new ScriptDom(document(owner), factory)
		.document as ScriptDocument;
	const text = first.createTextNode("abc");
	expect(() => second.createTextNode("def")).toThrow(
		"Shared document node limit",
	);
	expect(() => second.importNode(text)).toThrow("Shared document node limit");
	expect(owner.metrics().nodes).toBe(3);
});

it("revokes every script document and retained implementation on pool closure", () => {
	const owner = pool();
	const documents = [document(owner), document(owner)].map(
		(tree) => new ScriptDom(tree, factory).document as ScriptDocument,
	);
	const implementations = documents.map((document) => document.implementation);
	owner.close();
	for (const document of documents) {
		expect(() => document.nodeType).toThrow("closed");
		expect(() => document.createTextNode("x")).toThrow("closed");
	}
	for (const implementation of implementations)
		expect(() => implementation.hasFeature()).toThrow("closed");
});
