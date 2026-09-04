import { afterEach, expect, it } from "vitest";
import { DocumentTree, type DocumentLimits } from "./document.js";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { NodeRelations } from "./node-relations.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

interface NodeFixture {
	importNode(...args: unknown[]): NodeFixture;
	nodeType: number;
	nodeName: string;
	ownerDocument: NodeFixture;
	ownerElement: NodeFixture | null;
	parentNode: NodeFixture | null;
	firstChild: NodeFixture | null;
	nextSibling: NodeFixture | null;
	textContent: string;
	baseURI: string;
	href: string;
	value: string;
	checked: boolean;
	selected: boolean;
	isConnected: boolean;
	appendChild(node: NodeFixture): NodeFixture;
	getAttribute(name: string): string | null;
	getAttributeNode(name: string): NodeFixture;
	setAttributeNode(node: NodeFixture): NodeFixture | null;
	setAttribute(name: string, value: string): void;
	createAttribute(name: string): NodeFixture;
	setCustomValidity(value: string): void;
	validationMessage: string;
}

const trees: DocumentTree[] = [];
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
function fixture(
	limits: Partial<DocumentLimits> = {},
	url = "https://example.com/page",
) {
	const tree = new DocumentTree(url, limits);
	trees.push(tree);
	const dom = new ScriptDom(tree, factory);
	return {
		tree,
		dom,
		document: dom.document as NodeFixture,
		node: (id: number) => dom.node(id) as NodeFixture,
	};
}
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

it("imports a deep subtree into the destination without moving its source", () => {
	const source = fixture();
	const target = fixture();
	const root = source.tree.createElement("section", {
		id: "source",
		title: "hello",
	});
	const text = source.tree.createText("a😀b");
	source.tree.append(source.tree.root, root);
	source.tree.append(root, text);
	const original = source.node(root);
	const imported = target.document.importNode(original, true);
	expect(imported).not.toBe(original);
	expect(imported.ownerDocument).toBe(target.document);
	expect(imported.firstChild?.ownerDocument).toBe(target.document);
	expect(imported.parentNode).toBeNull();
	expect(imported.isConnected).toBe(false);
	expect(imported.textContent).toBe("a😀b");
	expect(imported.getAttribute("title")).toBe("hello");
	expect(original.parentNode).toBe(source.document);
	expect(source.tree.nodeCount).toBe(3);
	target.document.appendChild(imported);
	expect(imported.isConnected).toBe(true);
	const importedText = imported.firstChild;
	if (!importedText) throw new Error("Missing imported text");
	importedText.textContent = "changed";
	expect(original.textContent).toBe("a😀b");
});

it("defaults to shallow and supports a same-document import", () => {
	const { tree, node, document } = fixture();
	const root = tree.createElement("main", { id: "example" });
	tree.append(root, tree.createText("child"));
	const imported = document.importNode(node(root));
	expect(imported.ownerDocument).toBe(document);
	expect(imported.firstChild).toBeNull();
	expect(imported.getAttribute("id")).toBe("example");
	expect(imported).not.toBe(node(root));
});

it("imports attached Attr nodes as independent detached attributes", () => {
	const source = fixture();
	const target = fixture();
	const root = source.tree.createElement("main", { title: "initial" });
	const attribute = source.node(root).getAttributeNode("title");
	const imported = target.document.importNode(attribute, true);
	expect(imported.nodeType).toBe(2);
	expect(imported.nodeName).toBe("title");
	expect(imported.ownerDocument).toBe(target.document);
	expect(imported.ownerElement).toBeNull();
	expect(imported.value).toBe("initial");
	imported.value = "changed";
	expect(attribute.value).toBe("initial");
	const destination = target.node(target.tree.createElement("main"));
	expect(destination.setAttributeNode(imported)).toBeNull();
	expect(imported.ownerElement).toBe(destination);
});

it("rejects document imports with NotSupportedError before allocation", () => {
	const source = fixture();
	const target = fixture();
	expect(() => target.document.importNode(source.document)).toThrow(
		expect.objectContaining({ name: "NotSupportedError" }),
	);
	expect(target.tree.nodeCount).toBe(1);
});

it("preflights destination node quota without partial copies", () => {
	const source = fixture();
	const target = fixture({ maxNodes: 2 });
	const root = source.tree.createElement("main");
	source.tree.append(root, source.tree.createText("child"));
	expect(() => target.document.importNode(source.node(root), true)).toThrow(
		"node limit",
	);
	expect(target.tree.nodeCount).toBe(1);
});

it.each([
	[undefined, false],
	[false, false],
	[true, true],
	[0, false],
	[1, true],
	["", false],
	["false", true],
	[null, true],
	[{}, true],
	[{ selfOnly: true }, false],
	[{ selfOnly: false }, true],
	[{ selfOnly: "yes" }, false],
	[{ selfOnly: 0 }, true],
	[Object.create({ selfOnly: true }), false],
	[Object.assign(() => {}, { selfOnly: true }), false],
])("converts import options %j to subtree=%s", (options, deep) => {
	const source = fixture();
	const target = fixture();
	const root = source.tree.createElement("main");
	source.tree.append(root, source.tree.createText("child"));
	const imported = target.document.importNode(source.node(root), options);
	expect(imported.firstChild !== null).toBe(deep);
});

it("converts dictionary members in IDL order without unrelated property reads", () => {
	const source = fixture();
	const target = fixture();
	const reads: string[] = [];
	const options = {
		get customElementRegistry() {
			reads.push("registry");
			return undefined;
		},
		get selfOnly() {
			reads.push("selfOnly");
			return false;
		},
		get ignored() {
			throw new Error("must not read");
		},
	};
	target.document.importNode(
		source.node(source.tree.createText("text")),
		options,
	);
	expect(reads).toEqual(["registry", "selfOnly"]);
});

it.each([null, {}, false])(
	"rejects unimplemented registry %j before allocation",
	(registry) => {
		const source = fixture();
		const target = fixture();
		const root = source.node(source.tree.createElement("main"));
		expect(() =>
			target.document.importNode(root, { customElementRegistry: registry }),
		).toThrow("registry");
		expect(target.tree.nodeCount).toBe(1);
	},
);

it.each([null, undefined, {}, 1, "node", () => {}])(
	"rejects unauthenticated operand %j",
	(value) => {
		const target = fixture();
		expect(() => target.document.importNode(value)).toThrow(TypeError);
		expect(target.tree.nodeCount).toBe(1);
	},
);

it("requires an argument before inspecting options", () => {
	const target = fixture();
	expect(() => target.document.importNode()).toThrow(TypeError);
	expect(() =>
		target.document.importNode(
			{},
			{
				get selfOnly() {
					throw new Error("must not read");
				},
			},
		),
	).toThrow("node capability");
});

it("rejects copied descriptors and proxies without reading operand properties", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createElement("main"));
	const copied = Object.defineProperties(
		{},
		Object.getOwnPropertyDescriptors(original),
	);
	const proxy = new Proxy(original, {
		get() {
			throw new Error("must not read");
		},
	});
	for (const forged of [copied, proxy, Object.create(original)])
		expect(() => target.document.importNode(forged)).toThrow("node capability");
	expect(target.tree.nodeCount).toBe(1);
});

it.each(["source-dom", "source-tree", "target-dom", "target-tree"])(
	"rejects a closed %s owner before copying",
	(which) => {
		const source = fixture();
		const target = fixture();
		const original = source.node(source.tree.createElement("main"));
		if (which === "source-dom") source.dom.close();
		if (which === "source-tree") source.tree.close();
		if (which === "target-dom") target.dom.close();
		if (which === "target-tree") target.tree.close();
		expect(() => target.document.importNode(original, true)).toThrow("closed");
	},
);

it.each(["source", "target"])(
	"revalidates %s ownership after option getters",
	(which) => {
		const source = fixture();
		const target = fixture();
		const original = source.node(source.tree.createElement("main"));
		expect(() =>
			target.document.importNode(original, {
				get selfOnly() {
					(which === "source" ? source : target).dom.close();
					return false;
				},
			}),
		).toThrow("closed");
		expect(target.tree.nodeCount).toBe(1);
	},
);

it("propagates option conversion failures without allocating", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createElement("main"));
	expect(() =>
		target.document.importNode(original, {
			get selfOnly() {
				throw new Error("conversion failed");
			},
		}),
	).toThrow("conversion failed");
	expect(target.tree.nodeCount).toBe(1);
});

it("retains imported copies after the source owner closes", () => {
	const source = fixture();
	const target = fixture();
	const imported = target.document.importNode(
		source.node(source.tree.createText("survives")),
	);
	source.tree.close();
	expect(imported.textContent).toBe("survives");
	imported.textContent = "independent";
	expect(imported.ownerDocument).toBe(target.document);
});

it("revokes imported copies with the destination owner", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createText("source"));
	const imported = target.document.importNode(original);
	target.dom.close();
	expect(() => imported.textContent).toThrow("closed");
	expect(original.textContent).toBe("source");
});

it("imports text and comments with exact UTF-16 data", () => {
	const source = fixture();
	const target = fixture();
	for (const id of [
		source.tree.createText("a😀\ud800b"),
		source.tree.createComment("marker"),
	]) {
		const original = source.node(id);
		const imported = target.document.importNode(original, true);
		expect(imported.nodeType).toBe(original.nodeType);
		expect(imported.textContent).toBe(original.textContent);
		expect(imported.parentNode).toBeNull();
		expect(imported.firstChild).toBeNull();
	}
});

it("imports fragments without consuming their children", () => {
	const source = fixture();
	const target = fixture();
	const fragment = source.tree.createFragment();
	source.tree.append(fragment, source.tree.createText("one"));
	source.tree.append(fragment, source.tree.createComment("marker"));
	const original = source.node(fragment);
	const shallow = target.document.importNode(original);
	const deep = target.document.importNode(original, true);
	expect(shallow.nodeType).toBe(11);
	expect(shallow.firstChild).toBeNull();
	expect(deep.firstChild?.nodeType).toBe(3);
	expect(deep.firstChild?.nextSibling?.nodeType).toBe(8);
	const parent = target.node(target.tree.createElement("main"));
	parent.appendChild(deep);
	expect(deep.firstChild).toBeNull();
	expect(original.firstChild?.textContent).toBe("one");
	expect(parent.firstChild?.ownerDocument).toBe(target.document);
});

it("imports detached attributes with destination ownership", () => {
	const source = fixture();
	const target = fixture();
	const original = source.document.createAttribute("data-key");
	original.value = "a😀b";
	const imported = target.document.importNode(original);
	expect(imported.ownerElement).toBeNull();
	expect(imported.ownerDocument).toBe(target.document);
	expect(imported.value).toBe("a😀b");
	expect(original.ownerDocument).toBe(source.document);
});

it("preserves input value and checkedness dirtiness independently", () => {
	const source = fixture();
	const target = fixture();
	const text = source.node(
		source.tree.createElement("input", { value: "default" }),
	);
	text.value = "edited";
	const importedText = target.document.importNode(text);
	importedText.setAttribute("value", "new default");
	expect(importedText.value).toBe("edited");
	importedText.value = "destination";
	expect(text.value).toBe("edited");
	const checkId = source.tree.createElement("input", {
		type: "checkbox",
		checked: "",
	});
	const check = source.node(checkId);
	check.checked = false;
	source.tree.setControl(checkId, { indeterminate: true });
	const importedCheck = target.document.importNode(check);
	importedCheck.setAttribute("checked", "checked");
	expect(importedCheck.checked).toBe(false);
	const copiedId = new NodeRelations(target.tree).source(importedCheck).id;
	expect(target.tree.get(copiedId).control.indeterminate).toBe(true);
});

it("preserves option selectedness and dirty selection", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(
		source.tree.createElement("option", { selected: "" }),
	);
	original.selected = false;
	const imported = target.document.importNode(original);
	imported.setAttribute("selected", "selected");
	expect(imported.selected).toBe(false);
	imported.selected = true;
	expect(original.selected).toBe(false);
});

it("does not copy custom validity messages", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createElement("input"));
	original.setCustomValidity("source only");
	const imported = target.document.importNode(original);
	expect(imported.validationMessage).toBe("");
	expect(original.validationMessage).toBe("source only");
});

it.each(["depth", "text", "attribute"])(
	"preflights the destination %s budget",
	(budget) => {
		const source = fixture();
		const target = fixture(
			budget === "depth" ? { maxDepth: 1 } : { maxTextCodeUnits: 4 },
		);
		let original: NodeFixture;
		if (budget === "attribute") {
			original = source.document.createAttribute("title");
			original.value = "large attribute";
		} else {
			const root = source.tree.createElement("main");
			const child = source.tree.createElement("span");
			source.tree.append(root, child);
			source.tree.append(child, source.tree.createText("deep text"));
			original = source.node(root);
		}
		const revision = target.tree.revision;
		expect(() => target.document.importNode(original, true)).toThrow("limit");
		expect(target.tree.nodeCount).toBe(1);
		expect(target.tree.revision).toBe(revision);
	},
);

it("does not emit observer records for detached clone construction", () => {
	const source = fixture();
	const target = fixture();
	const root = source.tree.createElement("main");
	source.tree.append(root, source.tree.createText("child"));
	let sourceChanges = 0;
	let targetChanges = 0;
	source.tree.onMutation(() => {
		sourceChanges++;
	});
	target.tree.onMutation(() => {
		targetChanges++;
	});
	const imported = target.document.importNode(source.node(root), true);
	expect(sourceChanges).toBe(0);
	expect(targetChanges).toBe(0);
	target.document.appendChild(imported);
	expect(targetChanges).toBe(1);
});

it("does not expose document import on other node kinds", () => {
	const { tree, node, document } = fixture();
	for (const value of [
		node(tree.createElement("main")),
		node(tree.createText("text")),
		node(tree.createFragment()),
		document.createAttribute("title"),
	])
		expect("importNode" in value).toBe(false);
});

it("does not transfer registered event listeners to the destination", async () => {
	const source = fixture();
	const target = fixture();
	const sourceEvents = new DocumentEvents(source.tree);
	const targetEvents = new DocumentEvents(target.tree);
	const callbacks: ScriptCallbackRuntime = {
		isClosed: () => false,
		startCallback(callback, args, options) {
			if (typeof callback !== "function")
				throw new TypeError("Expected callback");
			const result = Promise.resolve(callback.apply(options.thisValue, args));
			return { synchronous: Promise.resolve(), result };
		},
	};
	const sourceDom = new ScriptDom(source.tree, factory, {
		events: sourceEvents,
		callbacks,
	});
	const id = source.tree.createElement("button");
	const original = sourceDom.node(id) as NodeFixture & {
		addEventListener(type: string, callback: () => void): void;
	};
	let calls = 0;
	original.addEventListener("click", () => {
		calls++;
	});
	const imported = target.document.importNode(original, true);
	const copiedId = new NodeRelations(target.tree).source(imported).id;
	await targetEvents.dispatchEventAsync(copiedId, new BrowserEvent("click"));
	expect(calls).toBe(0);
	await sourceEvents.dispatchEventAsync(id, new BrowserEvent("click"));
	expect(calls).toBe(1);
	expect(sourceEvents.metrics().listeners).toBe(1);
	expect(targetEvents.metrics().listeners).toBe(0);
});

it("accepts another ScriptDom wrapper around the same document", () => {
	const { tree, document } = fixture();
	const second = new ScriptDom(tree, factory);
	const original = second.node(tree.createText("shared tree"));
	const imported = document.importNode(original);
	expect(imported.ownerDocument).toBe(document);
	expect(imported).not.toBe(original);
	expect(imported.textContent).toBe("shared tree");
});

it("takes the source snapshot after option conversion", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createText("before"));
	const imported = target.document.importNode(original, {
		get selfOnly() {
			original.textContent = "after";
			return true;
		},
	});
	expect(imported.textContent).toBe("after");
});

it("keeps ordinary append authentication unchanged for foreign nodes", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.tree.createElement("main"));
	expect(() => target.document.appendChild(original)).toThrow(
		"this script document",
	);
	const imported = target.document.importNode(original);
	expect(target.document.appendChild(imported)).toBe(imported);
	expect(original.parentNode).toBeNull();
});

it("resolves copied relative URLs against the destination document", () => {
	const source = fixture({}, "https://source.example/old/page");
	const target = fixture({}, "https://target.example/new/page");
	const original = source.node(
		source.tree.createElement("a", { href: "next" }),
	);
	const imported = target.document.importNode(original);
	expect(imported.getAttribute("href")).toBe("next");
	expect(imported.baseURI).toBe("https://target.example/new/page");
	expect(imported.href).toBe("https://target.example/new/next");
	expect(original.href).toBe("https://source.example/old/next");
});

it("copies textarea current value independently of default text", () => {
	const source = fixture();
	const target = fixture();
	const id = source.tree.createElement("textarea");
	source.tree.append(id, source.tree.createText("default"));
	const original = source.node(id);
	original.value = "edited";
	const imported = target.document.importNode(original, true);
	expect(imported.value).toBe("edited");
	expect(imported.textContent).toBe("default");
	imported.value = "destination edit";
	expect(original.value).toBe("edited");
});
