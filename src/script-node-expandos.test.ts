import { expect, it, vi } from "vitest";
import { parseHtmlDocument } from "./html-parser.js";
import {
	ScriptDom,
	type ScriptHostObjectDefinition,
	type ScriptHostObjectFactory,
} from "./script-dom.js";
import { ScriptNodePublications } from "./script-node-publications.js";

function publications(domExpandos?: "bounded-v1") {
	const definitions: ScriptHostObjectDefinition[] = [];
	const factory: ScriptHostObjectFactory = {
		...(domExpandos ? { domExpandos } : {}),
		createHostObject: vi.fn((definition: ScriptHostObjectDefinition) => {
			definitions.push(definition);
			return {};
		}),
	};
	const assertOwner = vi.fn(() => "owner stays native");
	return {
		factory,
		definitions,
		assertOwner,
		owner: new ScriptNodePublications(factory, assertOwner),
	};
}

it.each(["node", "attribute", "attribute-map", "implementation"] as const)(
	"omits expando metadata by default for %s even if a definition requests it",
	(kind) => {
		const test = publications();
		test.owner.publish(
			kind,
			1,
			{ expandos: { maxKeys: 1, maxKeyCodeUnits: 1 } },
			vi.fn(),
		);
		expect(Object.hasOwn(test.definitions[0], "expandos")).toBe(false);
	},
);

it.each(["attribute", "attribute-map", "implementation"] as const)(
	"keeps opted-in %s publications fixed",
	(kind) => {
		const test = publications("bounded-v1");
		test.owner.publish(
			kind,
			1,
			{ expandos: { maxKeys: 1, maxKeyCodeUnits: 1 } },
			vi.fn(),
		);
		expect(Object.hasOwn(test.definitions[0], "expandos")).toBe(false);
	},
);

it("publishes exact node bounds with a synchronous undefined-returning ready guard", () => {
	const test = publications("bounded-v1");
	const get = vi.fn(() => "native");
	const set = vi.fn();
	const method = vi.fn((value: unknown) => value);
	const definition = {
		properties: { value: { get, set } },
		methods: { method },
	};
	test.factory.createHostObject = vi.fn((guarded) => {
		test.definitions.push(guarded);
		expect(() => guarded.expandos?.assertActive?.()).toThrow(/not published/);
		expect(() => guarded.properties?.value.get()).toThrow(/not published/);
		return {};
	});
	const commit = vi.fn(() => {
		expect(() => test.definitions[0].expandos?.assertActive?.()).toThrow(
			/not published/,
		);
	});
	const result = test.owner.publish("node", 1, definition, commit);
	const guarded = test.definitions[0];
	expect(guarded.expandos).toEqual({
		maxKeys: 64,
		maxKeyCodeUnits: 4096,
		assertActive: expect.any(Function),
	});
	const assertActive = guarded.expandos?.assertActive;
	expect(assertActive?.constructor).toBe(Function);
	expect(assertActive?.length).toBe(0);
	test.assertOwner.mockClear();
	expect(assertActive?.()).toBeUndefined();
	expect(test.assertOwner).toHaveBeenCalledExactlyOnceWith();
	expect(guarded.properties?.value.get()).toBe("native");
	guarded.properties?.value.set?.("changed");
	expect(set).toHaveBeenCalledExactlyOnceWith("changed");
	expect(guarded.methods?.method(42)).toBe(42);
	expect(method).toHaveBeenCalledExactlyOnceWith(42);
	expect(commit).toHaveBeenCalledExactlyOnceWith(result);
	expect(definition.properties.value.get).toBe(get);
	expect(definition).not.toHaveProperty("expandos");
	expect(test.owner.metrics()).toEqual({
		pending: 0,
		published: 1,
		failed: 0,
		closed: false,
	});
});

it.each([undefined, "bounded-v1"] as const)(
	"snapshots internal node opt-in %s",
	(domExpandos) => {
		const test = publications(domExpandos);
		Object.assign(test.factory, {
			domExpandos: domExpandos ? undefined : "bounded-v1",
		});
		test.owner.publish("node", 1, {}, vi.fn());
		expect(Object.hasOwn(test.definitions[0], "expandos")).toBe(
			domExpandos !== undefined,
		);
	},
);

it.each(["publication", "owner"])(
	"denies node guard and declared operations after %s closure",
	(closure) => {
		const test = publications("bounded-v1");
		const get = vi.fn();
		const set = vi.fn();
		const method = vi.fn();
		test.owner.publish(
			"node",
			1,
			{ properties: { value: { get, set } }, methods: { method } },
			vi.fn(),
		);
		const guarded = test.definitions[0];
		expect(guarded.expandos?.assertActive?.()).toBeUndefined();
		if (closure === "publication") test.owner.close();
		else
			test.assertOwner.mockImplementation(() => {
				throw new Error("owner closed");
			});
		expect(() => guarded.expandos?.assertActive?.()).toThrow(/closed/);
		expect(() => guarded.properties?.value.get()).toThrow(/closed/);
		expect(() => guarded.properties?.value.set?.(1)).toThrow(/closed/);
		expect(() => guarded.methods?.method()).toThrow(/closed/);
		expect(get).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
		expect(method).not.toHaveBeenCalled();
	},
);

it.each(["provider", "commit"])(
	"does not publish or retain pending slots when %s rejects metadata",
	(phase) => {
		const test = publications("bounded-v1");
		const failure = new Error("unsupported expandos");
		const create = test.factory.createHostObject;
		test.factory.createHostObject = (definition) => {
			const capability = create(definition);
			if (phase === "provider") throw failure;
			return capability;
		};
		const commit = vi.fn(() => {
			throw failure;
		});
		expect(() => test.owner.publish("node", 1, {}, commit)).toThrow(failure);
		if (phase === "provider") expect(commit).not.toHaveBeenCalled();
		expect(test.owner.metrics()).toMatchObject({
			pending: 0,
			published: 0,
			failed: 1,
		});
		const rejected = test.definitions[0].expandos?.assertActive;
		expect(() => rejected?.()).toThrow(/not published/);
		test.factory.createHostObject = create;
		test.owner.publish("node", 1, {}, vi.fn());
		expect(test.definitions[1].expandos?.assertActive?.()).toBeUndefined();
		expect(() => rejected?.()).toThrow(/not published/);
	},
);

it.each(["tree", "dom"])(
	"preserves DOM identity, fixed non-nodes and %s close guards",
	(closure) => {
		const tree = parseHtmlDocument(
			'<html><body><div id="target" title="value">text</div></body></html>',
			"https://example.com/",
		);
		const definitions = new Map<object, ScriptHostObjectDefinition>();
		const definitionFor = (capability: object) => {
			const definition = definitions.get(capability);
			if (!definition) throw new Error("Missing native host definition");
			return definition;
		};
		const factory: ScriptHostObjectFactory = {
			domExpandos: "bounded-v1",
			createHostObject(definition) {
				const capability = Object.create(null);
				definitions.set(capability, definition);
				return capability;
			},
		};
		const dom = new ScriptDom(tree, factory);
		try {
			const document = definitionFor(dom.document);
			const element = document.methods?.getElementById("target") as object;
			expect(document.methods?.getElementById("target")).toBe(element);
			const node = definitionFor(element);
			const text = node.properties?.firstChild.get() as object;
			expect(node.properties?.childNodes.get()).toEqual([text]);
			const fragment = document.methods?.createDocumentFragment() as object;
			const nodes = [dom.document, element, text, fragment];
			const fixed = [
				node.properties?.attributes.get(),
				node.methods?.getAttributeNode("title"),
				node.properties?.children.get(),
				document.methods?.getElementsByTagName("div"),
				document.properties?.implementation.get(),
			];
			for (const capability of nodes) {
				const definition = definitionFor(capability);
				expect(definition.expandos).toMatchObject({
					maxKeys: 64,
					maxKeyCodeUnits: 4096,
				});
				expect(definition.expandos?.assertActive?.()).toBeUndefined();
				expect(definition).not.toHaveProperty("named");
				expect(definition).not.toHaveProperty("indexed");
			}
			for (const capability of fixed) {
				expect(definitions.has(capability as object)).toBe(true);
				expect(
					Object.hasOwn(definitionFor(capability as object), "expandos"),
				).toBe(false);
			}
			if (closure === "tree") tree.close();
			else dom.close();
			for (const capability of nodes) {
				expect(() =>
					definitionFor(capability).expandos?.assertActive?.(),
				).toThrow();
			}
			expect(() => node.properties?.nodeType.get()).toThrow();
		} finally {
			dom.close();
			tree.close();
		}
	},
);
