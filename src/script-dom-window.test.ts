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
