import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { NodeRelations } from "./node-relations.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

interface NodeView {
	nodeName: string;
	textContent: string;
	ownerDocument: NodeView;
	attributes: object;
	getAttributeNode(name: string): NodeView;
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	createAttribute(name: string): NodeView;
	importNode(node: object, deep?: boolean): NodeView;
	value: string;
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});
function hostObject(definition: ScriptHostObjectDefinition): object {
	const object = Object.create(null);
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(object, name, descriptor);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(object, name, { value: method });
	return object;
}

function fixture() {
	const tree = new DocumentTree("https://example.com/page");
	trees.push(tree);
	let provide: (definition: ScriptHostObjectDefinition) => unknown = hostObject;
	const dom = new ScriptDom(tree, {
		createHostObject: (definition) => provide(definition) as object,
	});
	const root = tree.createElement("main", { title: "original" });
	const other = tree.createElement("section", { title: "second" });
	const document = dom.document as NodeView;
	return {
		tree,
		dom,
		root,
		other,
		document,
		node: (id: number) => dom.node(id) as NodeView,
		provider: (value: typeof provide) => {
			provide = value;
		},
	};
}

it("rejects a reused node capability without rewriting its identity", () => {
	const data = fixture();
	const original = data.node(data.root);
	data.provider(() => original);
	expect(() => data.node(data.other)).toThrow("identity");
	expect(new NodeRelations(data.tree).source(original).id).toBe(data.root);
	expect(data.dom.consoleLabel(original)).toBe("<main>");
});

it("does not authenticate stale node results after provider-triggered closure", () => {
	const data = fixture();
	let leaked: object | undefined;
	data.provider((definition) => {
		leaked = hostObject(definition);
		data.dom.close();
		return leaked;
	});
	expect(() => data.node(data.root)).toThrow("closed");
	if (!leaked) throw new Error("Missing captured capability");
	expect(data.dom.consoleLabel(leaked)).toBeUndefined();
});

it("rejects reentrant construction of the same node without caching the inner result", () => {
	const data = fixture();
	let entered = false;
	data.provider((definition) => {
		if (!entered) {
			entered = true;
			expect(() => data.node(data.root)).toThrow("Reentrant");
		}
		return hostObject(definition);
	});
	const capability = data.node(data.root);
	expect(data.node(data.root)).toBe(capability);
});

it("revokes callbacks captured by a failed node factory", () => {
	const data = fixture();
	let leaked: NodeView | undefined;
	data.provider((definition) => {
		leaked = hostObject(definition) as NodeView;
		throw new Error("provider failed");
	});
	expect(() => data.node(data.root)).toThrow("provider failed");
	if (!leaked) throw new Error("Missing captured capability");
	const captured = leaked;
	expect(() => captured.setAttribute("title", "changed")).toThrow(
		"not published",
	);
	expect(data.tree.get(data.root).attributes.title).toBe("original");
});

it("rejects a reused attribute capability without rebranding it", () => {
	const data = fixture();
	const first = data.node(data.root);
	const second = data.node(data.other);
	const original = first.getAttributeNode("title");
	const identity = new NodeRelations(data.tree).source(original);
	data.provider(() => original);
	expect(() => second.getAttributeNode("title")).toThrow("identity");
	expect(new NodeRelations(data.tree).source(original)).toEqual(identity);
});

it("rejects map publication after owner closure", () => {
	const data = fixture();
	const node = data.node(data.root);
	data.provider((definition) => {
		data.dom.close();
		return hostObject(definition);
	});
	expect(() => node.attributes).toThrow("closed");
});

it("rejects attribute-map identity reuse", () => {
	const data = fixture();
	const first = data.node(data.root);
	const second = data.node(data.other);
	const original = first.attributes;
	data.provider(() => original);
	expect(() => second.attributes).toThrow("identity");
});

for (const kind of ["node", "attribute", "attribute-map"] as const) {
	it.each([null, undefined, 0, false, "invalid", () => {}])(
		`rejects invalid ${kind} provider result %s without poisoning retry`,
		(result) => {
			const data = fixture();
			const original = data.node(data.root);
			const create = () =>
				kind === "node"
					? data.node(data.other)
					: kind === "attribute"
						? original.getAttributeNode("title")
						: original.attributes;
			data.provider(() => result);
			expect(create).toThrow("Invalid script node capability");
			expect(data.dom.metrics().publications.pending).toBe(0);
			data.provider(hostObject);
			const capability = create();
			expect(create()).toBe(capability);
			expect(original.getAttribute("title")).toBe("original");
		},
	);
}

it("rejects returning another document's node without changing either identity", () => {
	const first = fixture();
	const second = fixture();
	const original = first.node(first.root);
	second.provider(() => original);
	expect(() => second.node(second.root)).toThrow("identity");
	expect(first.dom.consoleLabel(original)).toBe("<main>");
	expect(second.dom.consoleLabel(original)).toBeUndefined();
	expect(new NodeRelations(second.tree).source(original).tree).toBe(first.tree);
});

it("does not resurrect an identity from a closed script owner", () => {
	const first = fixture();
	const second = fixture();
	const original = first.node(first.root);
	first.dom.close();
	second.provider(() => original);
	expect(() => second.node(second.root)).toThrow("identity");
	expect(() => second.document.importNode(original)).toThrow("closed");
});

it("rejects attribute/node/map identity substitution within an owner", () => {
	const data = fixture();
	const node = data.node(data.root);
	const map = node.attributes;
	const attribute = node.getAttributeNode("title");
	data.provider(() => map);
	expect(() => data.node(data.other)).toThrow("identity");
	data.provider(() => node);
	expect(() => data.document.createAttribute("fresh")).toThrow("identity");
	data.provider(hostObject);
	const other = data.node(data.other);
	data.provider(() => attribute);
	expect(() => other.attributes).toThrow("identity");
	expect(new NodeRelations(data.tree).source(attribute).attribute).toBe(true);
});

it("does not let a failed attribute factory mutate through captured setters", () => {
	const data = fixture();
	const node = data.node(data.root);
	let captured: ScriptHostObjectDefinition | undefined;
	data.provider((definition) => {
		captured = definition;
		throw new Error("attribute failed");
	});
	expect(() => node.getAttributeNode("title")).toThrow("attribute failed");
	if (!captured) throw new Error("Missing attribute definition");
	const setter = captured.properties?.value.set;
	if (!setter) throw new Error("Missing attribute setter");
	expect(() => setter("mutated")).toThrow("not published");
	data.provider(hostObject);
	expect(node.getAttributeNode("title").value).toBe("original");
	expect(() => setter("mutated again")).toThrow("not published");
});

it("revokes failed map named/indexed/method callbacks", () => {
	const data = fixture();
	const node = data.node(data.root);
	let captured: ScriptHostObjectDefinition | undefined;
	data.provider((definition) => {
		captured = definition;
		throw new Error("map failed");
	});
	expect(() => node.attributes).toThrow("map failed");
	if (!captured) throw new Error("Missing map definition");
	const definition = captured;
	for (const operation of [
		() => definition.indexed?.length(),
		() => definition.indexed?.get(0),
		() => definition.named?.keys(),
		() => definition.named?.get("title"),
		() => definition.methods?.removeNamedItem("title"),
	])
		expect(operation).toThrow("not published");
	expect(node.getAttribute("title")).toBe("original");
	data.provider(hostObject);
	expect(node.attributes).toBe(node.attributes);
});

it.each(["attribute", "attribute-map"])(
	"rejects reentrant %s creation",
	(kind) => {
		const data = fixture();
		const node = data.node(data.root);
		const create = () =>
			kind === "attribute" ? node.getAttributeNode("title") : node.attributes;
		let entered = false;
		data.provider((definition) => {
			if (!entered) {
				entered = true;
				expect(create).toThrow("Reentrant");
			}
			return hostObject(definition);
		});
		const capability = create();
		expect(create()).toBe(capability);
		expect(data.dom.metrics().publications.pending).toBe(0);
	},
);

it.each(["node", "attribute", "attribute-map"])(
	"rejects %s publication when the document closes",
	(kind) => {
		const data = fixture();
		const node = data.node(data.root);
		const create = () =>
			kind === "node"
				? data.node(data.other)
				: kind === "attribute"
					? node.getAttributeNode("title")
					: node.attributes;
		data.provider((definition) => {
			data.tree.close();
			return hostObject(definition);
		});
		expect(create).toThrow("closed");
		expect(data.dom.metrics().publications).toMatchObject({
			pending: 0,
			closed: true,
		});
	},
);

it("reserves pending map capacity before reentering the provider", () => {
	const data = fixture();
	const nodes = Array.from({ length: 257 }, () =>
		data.node(data.tree.createElement("div")),
	);
	for (const node of nodes.slice(0, 255)) void node.attributes;
	let reentered = false;
	data.provider((definition) => {
		if (!reentered) {
			reentered = true;
			expect(() => nodes[256].attributes).toThrow("map limit");
		}
		return hostObject(definition);
	});
	const last = nodes[255].attributes;
	expect(nodes[255].attributes).toBe(last);
	expect(() => nodes[256].attributes).toThrow("map limit");
	expect(data.dom.metrics().publications.pending).toBe(0);
});

it("reserves pending attribute capacity before allocating a nested attribute", () => {
	const data = fixture();
	for (let index = 0; index < 4095; index++)
		data.document.createAttribute("data-entry");
	let reentered = false;
	data.provider((definition) => {
		if (!reentered) {
			reentered = true;
			const before = data.tree.nodeCount;
			expect(() => data.document.createAttribute("blocked")).toThrow(
				"attribute object limit",
			);
			expect(data.tree.nodeCount).toBe(before);
		}
		return hostObject(definition);
	});
	const last = data.document.createAttribute("last");
	expect(last.nodeName).toBe("last");
	expect(() => data.document.createAttribute("blocked")).toThrow(
		"attribute object limit",
	);
	expect(data.dom.metrics().publications.pending).toBe(0);
});

it("cleans up failed root publication without consuming document cleanup slots", () => {
	const tree = new DocumentTree("https://example.com");
	trees.push(tree);
	for (let index = 0; index < 70; index++)
		expect(
			() =>
				new ScriptDom(tree, {
					createHostObject() {
						throw new Error("root failed");
					},
				}),
		).toThrow("root failed");
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	expect((dom.document as NodeView).nodeName).toBe("#document");
});

it("does not retain stale import capabilities after destination closure", () => {
	const source = fixture();
	const target = fixture();
	const original = source.node(source.root);
	let captured: NodeView | undefined;
	target.provider((definition) => {
		captured = hostObject(definition) as NodeView;
		target.dom.close();
		return captured;
	});
	expect(() => target.document.importNode(original, true)).toThrow("closed");
	if (!captured) throw new Error("Missing imported capability");
	const imported = captured;
	expect(target.dom.consoleLabel(imported)).toBeUndefined();
	expect(() => imported.setAttribute("title", "leaked")).toThrow("closed");
	expect(original.getAttribute("title")).toBe("original");
});

it("keeps registered identities immutable even outside publication helpers", () => {
	const first = fixture();
	const second = fixture();
	const original = {};
	const registry = new NodeRelations(first.tree);
	const other = new NodeRelations(second.tree);
	registry.register(original, first.root);
	registry.register(original, first.root);
	expect(() => registry.register(original, first.other)).toThrow("identity");
	expect(() => other.register(original, second.root)).toThrow("identity");
	const attribute = first.tree.createAttribute("title");
	expect(() => registry.register(original, attribute, true)).toThrow(
		"identity",
	);
	expect(registry.source(original)).toMatchObject({
		tree: first.tree,
		id: first.root,
		attribute: false,
	});
	registry.close();
	expect(() => other.register(original, second.root)).toThrow("identity");
	expect(() => other.source(original)).toThrow("closed");
});
