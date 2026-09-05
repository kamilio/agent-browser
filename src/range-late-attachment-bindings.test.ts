import { afterEach, expect, it, vi } from "vitest";
import {
	type DocumentLimits,
	type DocumentMutation,
	DocumentTree,
} from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

const routes = ["native", "script"] as const;
type Route = (typeof routes)[number];
const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.useRealTimers();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const result = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(result, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(result, name, { value: method });
	if (definition.indexed) {
		const indexed = definition.indexed;
		Object.defineProperty(result, "length", { get: () => indexed.length() });
		return new Proxy(result, {
			get(target, key, receiver) {
				return typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key)
					? indexed.get(Number(key))
					: Reflect.get(target, key, receiver);
			},
		});
	}
	return result;
}

function fixture(
	kind: "text" | "comment" | "subtree" | "fragment" | "details" = "text",
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/late-range", limits);
	const text =
		kind === "comment"
			? tree.createComment("abcdef")
			: tree.createText("abcdef");
	const seed =
		kind === "subtree"
			? tree.createElement("b")
			: kind === "fragment"
				? tree.createFragment()
				: kind === "details"
					? tree.createElement("details", { name: "group", open: "" })
					: text;
	if (seed !== text) tree.append(seed, text);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	cleanups.push(() => {
		dom.close();
		tree.close();
	});
	const document = dom.document as Document;
	const node = (id: number) => dom.node(id) as Node;
	const makeRange = (id: number, start: number, end: number) => {
		const range = document.createRange();
		range.setStart(node(id), start);
		range.setEnd(node(id), end);
		return range;
	};
	const range = makeRange(text, 2, 5);
	const clone = range.cloneRange();
	const second = makeRange(text, 1, 3);
	const append = (
		route: Route,
		parent: number,
		child: number,
		before?: number,
	) => {
		if (route === "native") tree.insert(parent, child, before);
		else
			node(parent).insertBefore(
				node(child),
				before === undefined ? null : node(before),
			);
	};
	const remove = (route: Route, parent: number, child: number) => {
		if (route === "native") tree.remove(child);
		else node(parent).removeChild(node(child));
	};
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	return {
		tree,
		text,
		seed,
		dom,
		document,
		node,
		makeRange,
		range,
		clone,
		second,
		append,
		remove,
		records,
	};
}

function expectRange(range: Range, node: Node, start: number, end: number) {
	expect(range.startContainer === node).toBe(true);
	expect(range.endContainer === node).toBe(true);
	expect([range.startOffset, range.endOffset]).toEqual([start, end]);
}

function expectCollapsed(
	test: ReturnType<typeof fixture>,
	parent: number,
	offset: number,
) {
	for (const range of [test.range, test.clone, test.second]) {
		expectRange(range, test.node(parent), offset, offset);
		expect(range.collapsed).toBe(true);
	}
}

it.each(["removeChild", "replaceChild", "replaceChildren"] as const)(
	"script %s retains detached-created range/clone identities and correct sibling positions",
	(operation) => {
		const test = fixture();
		const unrelated = test.tree.createText("unrelated");
		const otherRange = test.makeRange(unrelated, 1, 4);
		const parent = test.tree.createElement("main");
		const prefix = test.tree.createComment("prefix");
		const suffix = test.tree.createComment("suffix");
		const replacement = test.tree.createText("new");
		test.append("script", parent, prefix);
		test.append("script", parent, test.text);
		test.append("script", parent, suffix);
		test.append("script", test.tree.root, parent);
		const retained = test.range;
		if (operation === "removeChild")
			test.node(parent).removeChild(test.node(test.text));
		else if (operation === "replaceChild")
			test
				.node(parent)
				.replaceChild(test.node(replacement), test.node(test.text));
		else (test.node(parent) as Element).replaceChildren(test.node(replacement));
		expect(test.tree.get(test.text).parent).toBeNull();
		expect(test.range === retained).toBe(true);
		expectRange(otherRange, test.node(unrelated), 1, 4);
		expectCollapsed(test, parent, operation === "replaceChildren" ? 0 : 1);
	},
);

it.each(routes)(
	"%s: moves a tracked subtree through three new wrappers without following the moved subtree",
	(route) => {
		const test = fixture("subtree");
		const native = domRangeOwner(test.tree).createRange();
		native.setStart(test.text, 2);
		native.setEnd(test.text, 5);
		const nativeClone = native.cloneRange();
		const first = test.tree.createElement("section");
		const second = test.tree.createElement("article");
		const outer = test.tree.createElement("main");
		const before = test.tree.createComment("before");
		const destination = test.tree.createElement("aside");
		test.append(route, first, test.seed);
		test.append(route, second, first);
		test.append(route, outer, second);
		test.append(route, test.tree.root, before);
		test.append(route, test.tree.root, outer);
		test.append(route, destination, outer);
		expect(test.tree.get(outer).parent).toBe(destination);
		expectCollapsed(test, test.tree.root, 1);
		for (const range of [native, nativeClone]) {
			expect(range.start).toEqual({ node: test.tree.root, offset: 1 });
			expect(range.end).toEqual({ node: test.tree.root, offset: 1 });
		}
		test.remove(route, test.tree.root, before);
		expectCollapsed(test, test.tree.root, 0);
	},
);

it.each(routes)(
	"%s: late-attached comment boundaries collapse on ancestor replacement",
	(route) => {
		const test = fixture("comment");
		const parent = test.tree.createElement("section");
		const outer = test.tree.createElement("main");
		const prefix = test.tree.createComment("prefix");
		const replacement = test.tree.createElement("i");
		test.append(route, parent, test.text);
		test.append(route, outer, prefix);
		test.append(route, outer, parent);
		if (route === "native") test.tree.replace(outer, replacement, parent);
		else
			test.node(outer).replaceChild(test.node(replacement), test.node(parent));
		expect(test.tree.get(test.text).data).toBe("abcdef");
		expectCollapsed(test, outer, 1);
	},
);

it.each(
	routes.flatMap((route) =>
		(["text", "subtree"] as const).map((kind) => ({ route, kind })),
	),
)(
	"$route: late fragment attachment of $kind collapses moved ranges to the source fragment",
	({ route, kind }) => {
		const test = fixture(kind);
		const fragment = test.tree.createFragment();
		const prefix = test.tree.createComment("prefix");
		const destination = test.tree.createElement("main");
		test.append(route, fragment, prefix);
		test.append(route, fragment, test.seed);
		test.append(route, destination, fragment);
		expect(test.tree.get(fragment).children).toEqual([]);
		expect(test.tree.get(destination).children).toEqual([prefix, test.seed]);
		expectCollapsed(test, fragment, 0);
		test.append(route, destination, fragment);
		expectCollapsed(test, fragment, 0);
	},
);

it.each(routes)(
	"%s: already-tracked source fragment remains a passing removal-before-insertion control",
	(route) => {
		const test = fixture("fragment");
		const destination = test.tree.createElement("main");
		test.append(route, destination, test.seed);
		expectCollapsed(test, test.seed, 0);
		expect(test.tree.get(destination).children).toEqual([test.text]);
	},
);

it.each(routes)(
	"%s: container endpoints retain cached sibling order before their late parent is removed",
	(route) => {
		const test = fixture("subtree");
		const containerRange = test.makeRange(test.seed, 1, 1);
		const containerClone = containerRange.cloneRange();
		const parent = test.tree.createElement("main");
		const before = test.tree.createComment("before");
		const inserted = test.tree.createComment("inserted");
		test.append(route, parent, before);
		test.append(route, parent, test.seed);
		test.append(route, test.seed, inserted, test.text);
		expectRange(containerRange, test.node(test.seed), 2, 2);
		expectRange(containerClone, test.node(test.seed), 2, 2);
		test.remove(route, parent, test.seed);
		expectRange(containerRange, test.node(parent), 1, 1);
		expectRange(containerClone, test.node(parent), 1, 1);
		expectCollapsed(test, parent, 1);
	},
);

it.each(
	routes.flatMap((route) =>
		[false, true].map((fragment) => ({ route, fragment })),
	),
)(
	"$route: details-group batched insertion with fragment=$fragment tracks ancestry without dispatching fake timers",
	({ route, fragment }) => {
		vi.useFakeTimers();
		const test = fixture("details");
		const existing = test.tree.createElement("details", {
			name: "group",
			open: "",
		});
		const destination = test.tree.createElement("main");
		test.append(route, destination, existing);
		test.append(route, test.tree.root, destination);
		const documentRange = test.makeRange(test.tree.root, 1, 1);
		const source = fragment ? test.tree.createFragment() : test.seed;
		if (fragment) test.append(route, source, test.seed);
		test.records.length = 0;
		test.append(route, destination, source);
		expect(Object.hasOwn(test.tree.get(existing).attributes, "open")).toBe(
			true,
		);
		expect(Object.hasOwn(test.tree.get(test.seed).attributes, "open")).toBe(
			false,
		);
		expect(test.records.map((record) => [record.type, record.target])).toEqual(
			fragment
				? [
						["attributes", test.seed],
						["childList", source],
						["childList", destination],
					]
				: [
						["attributes", test.seed],
						["childList", destination],
					],
		);
		expect(test.tree.detailsToggleTasks.metrics().delivered).toBe(0);
		expectRange(documentRange, test.node(test.tree.root), 1, 1);
		if (fragment) expectCollapsed(test, source, 0);
		else {
			test.remove(route, destination, test.seed);
			expectCollapsed(test, destination, 1);
		}
		test.tree.close();
		expect(vi.getTimerCount()).toBe(0);
	},
);

it.each(routes)(
	"%s: depth rejection leaves detached endpoints atomic and later legal attachment trackable",
	(route) => {
		const test = fixture("text", { maxDepth: 2 });
		const outer = test.tree.createElement("main");
		const inner = test.tree.createElement("section");
		test.append(route, test.tree.root, outer);
		test.append(route, outer, inner);
		const revision = test.tree.revision;
		test.records.length = 0;
		expect(() => test.append(route, inner, test.text)).toThrow(/depth limit/);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.get(test.text).parent).toBeNull();
		expect(test.records).toEqual([]);
		expectRange(test.range, test.node(test.text), 2, 5);
		test.append(route, outer, test.text);
		test.remove(route, outer, test.text);
		expectCollapsed(test, outer, 1);
	},
);

it.each(routes)(
	"%s: ancestry tracking uses no new document nodes at the exact node limit",
	(route) => {
		const test = fixture("text", { maxNodes: 3 });
		const parent = test.tree.createElement("main");
		expect(() => test.tree.createText("excess")).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		test.append(route, parent, test.text);
		test.remove(route, parent, test.text);
		expect(test.tree.nodeCount).toBe(3);
		expectCollapsed(test, parent, 0);
	},
);

it.each(routes)(
	"%s: rejected cyclic insertion does not corrupt late tracked ancestry",
	(route) => {
		const test = fixture("subtree");
		const parent = test.tree.createElement("main");
		test.append(route, parent, test.seed);
		const revision = test.tree.revision;
		test.records.length = 0;
		expect(() => test.append(route, test.seed, parent)).toThrow();
		expect(test.tree.revision).toBe(revision);
		expect(test.records).toEqual([]);
		expectRange(test.range, test.node(test.text), 2, 5);
		test.remove(route, parent, test.seed);
		expectCollapsed(test, parent, 0);
	},
);

const rawKeys = [
	"type",
	"target",
	"ancestors",
	"addedNodes",
	"removedNodes",
	"previousSibling",
	"nextSibling",
	"attributeName",
	"attributeNamespace",
	"oldValue",
].sort();

it.each(routes)(
	"%s: public late-attachment records keep their frozen exact shape and logical order",
	(route) => {
		const test = fixture();
		const parent = test.tree.createElement("main");
		test.append(route, parent, test.text);
		test.append(route, test.tree.root, parent);
		test.remove(route, parent, test.text);
		const common = {
			type: "childList",
			previousSibling: null,
			nextSibling: null,
			attributeName: null,
			attributeNamespace: null,
			oldValue: null,
		};
		expect(test.records).toEqual([
			{
				...common,
				target: parent,
				ancestors: [parent],
				addedNodes: [test.text],
				removedNodes: [],
			},
			{
				...common,
				target: test.tree.root,
				ancestors: [test.tree.root],
				addedNodes: [parent],
				removedNodes: [],
			},
			{
				...common,
				target: parent,
				ancestors: [parent, test.tree.root],
				addedNodes: [],
				removedNodes: [test.text],
			},
		]);
		for (const record of test.records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(rawKeys);
			expect(Object.isFrozen(record)).toBe(true);
			expect(Reflect.set(record, "parents", new Map())).toBe(false);
			for (const list of [
				record.ancestors,
				record.addedNodes,
				record.removedNodes,
			])
				expect(Object.isFrozen(list)).toBe(true);
		}
	},
);

interface ObserverView {
	observe(target: object, options: object): void;
	takeRecords(): readonly MutationRecord[];
	disconnect(): void;
}

function observerFixture(test: ReturnType<typeof fixture>, target: number) {
	const callback = vi.fn();
	const startCallback: ScriptCallbackRuntime["startCallback"] = (
		handler,
		args,
		options,
	) => ({
		synchronous: Promise.resolve(),
		result: Promise.resolve(
			Reflect.apply(
				handler as (...args: unknown[]) => unknown,
				options.thisValue,
				args,
			),
		),
	});
	const bindings = test.dom.mutationObservers({
		isClosed: () => false,
		startCallback,
	});
	const observer = bindings.create(callback) as ObserverView;
	observer.observe(test.node(target), { subtree: true, childList: true });
	return { bindings, callback, observer };
}

it.each(routes)(
	"%s: queued guest observers see collapsed live ranges and stable node capabilities",
	async (route) => {
		const test = fixture();
		const parent = test.tree.createElement("main");
		const { bindings, callback, observer } = observerFixture(test, parent);
		const snapshots: boolean[][] = [];
		callback.mockImplementation(() =>
			snapshots.push([
				test.range.startContainer === test.node(parent),
				test.range.endContainer === test.node(parent),
				test.range.startOffset === 0,
				test.range.endOffset === 0,
			]),
		);
		test.append(route, parent, test.text);
		test.append(route, test.tree.root, parent);
		test.remove(route, parent, test.text);
		expect(callback).not.toHaveBeenCalled();
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.contexts[0] === observer).toBe(true);
		const records = callback.mock.calls[0][0] as readonly MutationRecord[];
		expect(records).toHaveLength(2);
		expect(records[0].addedNodes.item(0) === test.node(test.text)).toBe(true);
		expect(records[1].removedNodes.item(0) === test.node(test.text)).toBe(true);
		expect(records.every((record) => record.target === test.node(parent))).toBe(
			true,
		);
		expect(snapshots).toEqual([[true, true, true, true]]);
		expectCollapsed(test, parent, 0);
		expect(observer.takeRecords()).toEqual([]);
	},
);

it.each(routes)(
	"%s: unrelated untracked subtree edits leave a detached range and its clone untouched",
	(route) => {
		const test = fixture();
		const parent = test.tree.createElement("main");
		const child = test.tree.createElement("section");
		const unrelated = test.tree.createText("unrelated");
		test.append(route, child, unrelated);
		test.append(route, parent, child);
		test.append(route, test.tree.root, parent);
		test.remove(route, parent, child);
		expectRange(test.range, test.node(test.text), 2, 5);
		expectRange(test.clone, test.node(test.text), 2, 5);
		expectRange(test.second, test.node(test.text), 1, 3);
	},
);

it.each(["binding", "document"] as const)(
	"%s closure revokes late-attached range capabilities and queued observers",
	async (lifetime) => {
		const test = fixture();
		const parent = test.tree.createElement("main");
		const { bindings, callback, observer } = observerFixture(test, parent);
		test.append("native", parent, test.text);
		const capability = test.node(parent);
		if (lifetime === "binding") test.dom.close();
		else test.tree.close();
		expect(() => test.range.startContainer).toThrow(/closed/);
		expect(() => test.clone.endOffset).toThrow(/closed/);
		expect(() => capability.removeChild(capability)).toThrow(/closed/);
		expect(() => observer.takeRecords()).toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		await expect(bindings.checkpoint()).rejects.toThrow(
			expect.objectContaining({ code: "closed" }),
		);
		expect(callback).not.toHaveBeenCalled();
		expect(bindings.metrics()).toMatchObject({
			closed: true,
			pendingCallbacks: 0,
		});
	},
);
