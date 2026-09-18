import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(object, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
};

function fixture(withWindow = true) {
	const tree = new DocumentTree("https://example.com/");
	const window = {};
	const interactions = new DocumentInteractions(tree);
	const dom = new ScriptDom(tree, factory, {
		events: interactions.events,
		callbacks: {
			isClosed: () => false,
			startCallback() {
				throw new Error("Unexpected callback");
			},
		},
		...(withWindow ? { window } : {}),
	});
	return { tree, dom, window };
}

it.each([
	["https://app.example.com/join", "app.example.com"],
	["https://Example.COM:8443/join?query=fixture", "example.com"],
	["https://xn--bcher-kva.example/", "xn--bcher-kva.example"],
	["http://127.0.0.1:8080/", "127.0.0.1"],
])("exposes a read-only document hostname for %s", (url, hostname) => {
	const tree = new DocumentTree(url);
	const dom = new ScriptDom(tree, factory);
	try {
		expect(Reflect.get(dom.document, "domain")).toBe(hostname);
		expect(Reflect.set(dom.document, "domain", "example.com")).toBe(false);
		expect(Reflect.get(dom.document, "domain")).toBe(hostname);
	} finally {
		tree.close();
	}
	expect(() => Reflect.get(dom.document, "domain")).toThrow();
});

it("exposes the browsing context's stable readonly defaultView", () => {
	const { tree, dom, window } = fixture();
	try {
		expect(Reflect.get(dom.document, "defaultView")).toBe(window);
		expect(Reflect.get(dom.document, "defaultView")).toBe(window);
		expect(Reflect.set(dom.document, "defaultView", {})).toBe(false);
	} finally {
		tree.close();
	}
});

it("has a null defaultView without a browsing context", () => {
	const { tree, dom } = fixture(false);
	try {
		expect(Reflect.get(dom.document, "defaultView")).toBeNull();
	} finally {
		tree.close();
	}
});

it("does not expose the parent window on an inert created document", () => {
	const { tree, dom } = fixture();
	try {
		const implementation = Reflect.get(dom.document, "implementation");
		const foreign = implementation.createHTMLDocument("detached");
		expect(Reflect.get(foreign, "defaultView")).toBeNull();
	} finally {
		tree.close();
	}
});

it("revokes defaultView reads when the document closes", () => {
	const { tree, dom } = fixture();
	tree.close();
	expect(() => Reflect.get(dom.document, "defaultView")).toThrow(/closed/);
});
