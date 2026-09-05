import { afterEach, expect, it, vi } from "vitest";
import {
	type DocumentLimits,
	type DocumentMutation,
	DocumentTree,
} from "./document.js";
import { domRangeOwner } from "./dom-range.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

const cleanups: (() => void)[] = [];
const routes = ["native", "owner", "script"] as const;
type Route = (typeof routes)[number];

afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
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
	data = "abcdef",
	attached = true,
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/split", limits);
	const parent = tree.createElement("main");
	tree.append(tree.root, parent);
	const id = tree.createText(data);
	if (attached) tree.append(parent, id);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	cleanups.push(() => {
		dom.close();
		tree.close();
	});
	const document = dom.document as Document;
	const node = dom.node(id) as Text;
	const parentNode = dom.node(parent) as Element;
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	const range = (start: number, end: number, target: Node = node) => {
		const value = document.createRange();
		value.setStart(target, start);
		value.setEnd(target, end);
		return value;
	};
	const split = (route: Route, offset: number) => {
		if (route === "script") return node.splitText(offset);
		const tail =
			route === "native"
				? tree.splitText(id, offset)
				: domRangeOwner(tree).splitText(id, offset);
		return dom.node(tail) as Text;
	};
	return {
		tree,
		parent,
		id,
		dom,
		document,
		node,
		parentNode,
		records,
		range,
		split,
	};
}

function boundary(range: Range) {
	return [
		range.startContainer,
		range.startOffset,
		range.endContainer,
		range.endOffset,
	];
}

it.each(routes)(
	"%s: transfers all endpoint positions, multiple ranges and clones",
	(route) => {
		const test = fixture();
		const cases = [
			{ start: 0, end: 1, tailStart: false, tailEnd: false, offsets: [0, 1] },
			{ start: 2, end: 2, tailStart: false, tailEnd: false, offsets: [2, 2] },
			{ start: 1, end: 5, tailStart: false, tailEnd: true, offsets: [1, 3] },
			{ start: 3, end: 6, tailStart: true, tailEnd: true, offsets: [1, 4] },
			{ start: 6, end: 6, tailStart: true, tailEnd: true, offsets: [4, 4] },
		];
		const ranges = cases.map(({ start, end }) => test.range(start, end));
		const clone = ranges[3].cloneRange();
		const tail = test.split(route, 2);
		for (const [index, entry] of cases.entries()) {
			expect
				.soft(boundary(ranges[index]))
				.toEqual([
					entry.tailStart ? tail : test.node,
					entry.offsets[0],
					entry.tailEnd ? tail : test.node,
					entry.offsets[1],
				]);
			expect
				.soft(ranges[index].toString())
				.toBe("abcdef".slice(entry.start, entry.end));
		}
		expect(boundary(clone)).toEqual([tail, 1, tail, 4]);
		clone.setStart(tail, 2);
		expect(boundary(ranges[3])).toEqual([tail, 1, tail, 4]);
		expect(test.dom.node(test.id)).toBe(test.node);
		expect(test.node.nextSibling).toBe(tail);
		expect(tail.previousSibling).toBe(test.node);
		expect(tail.parentNode).toBe(test.parentNode);
		expect(test.parentNode.textContent).toBe("abcdef");
	},
);

it.each(routes)(
	"%s: increments immediate and later parent boundaries exactly once",
	(route) => {
		const test = fixture();
		const before = test.tree.createElement("i");
		const after = test.tree.createElement("b");
		test.tree.insert(test.parent, before, test.id);
		test.tree.append(test.parent, after);
		const ranges = [0, 1, 2, 3].map((offset) =>
			test.range(offset, offset, test.parentNode),
		);
		const contents = test.range(0, 3, test.parentNode);
		test.split(route, 2);
		expect(ranges.map((range) => [range.startOffset, range.endOffset])).toEqual(
			[
				[0, 0],
				[1, 1],
				[3, 3],
				[4, 4],
			],
		);
		expect(boundary(contents)).toEqual([
			test.parentNode,
			0,
			test.parentNode,
			4,
		]);
	},
);

it.each(
	routes.flatMap((route) => [
		{
			route,
			data: "abcdef",
			split: 0,
			point: 6,
			prefix: "",
			suffix: "abcdef",
			offset: 6,
			transferred: true,
		},
		{
			route,
			data: "abcdef",
			split: 6,
			point: 6,
			prefix: "abcdef",
			suffix: "",
			offset: 6,
			transferred: false,
		},
		{
			route,
			data: "",
			split: 0,
			point: 0,
			prefix: "",
			suffix: "",
			offset: 0,
			transferred: false,
		},
		{
			route,
			data: "A😀BC",
			split: 2,
			point: 5,
			prefix: "A\ud83d",
			suffix: "\ude00BC",
			offset: 3,
			transferred: true,
		},
	]),
)(
	"$route: split $data at UTF-16 offset $split",
	({ route, data, split, point, prefix, suffix, offset, transferred }) => {
		const test = fixture(data);
		const edge = test.range(split, split);
		const end = test.range(point, point);
		const parentEnd = test.range(1, 1, test.parentNode);
		const tail = test.split(route, split);
		expect(test.node.data).toBe(prefix);
		expect(tail.data).toBe(suffix);
		expect(boundary(edge)).toEqual([test.node, split, test.node, split]);
		const target = transferred ? tail : test.node;
		expect(boundary(end)).toEqual([target, offset, target, offset]);
		expect(boundary(parentEnd)).toEqual([
			test.parentNode,
			2,
			test.parentNode,
			2,
		]);
	},
);

it.each(routes)(
	"%s: detached endpoints clamp to the prefix, never the new root",
	(route) => {
		const test = fixture("abcdef", false);
		const ranges = [
			test.range(0, 1),
			test.range(2, 2),
			test.range(1, 6),
			test.range(3, 6),
		];
		const unrelated = test.document.createTextNode("other");
		const otherRange = test.range(1, 4, unrelated);
		const tail = test.split(route, 2);
		expect(ranges.map(boundary)).toEqual([
			[test.node, 0, test.node, 1],
			[test.node, 2, test.node, 2],
			[test.node, 1, test.node, 2],
			[test.node, 2, test.node, 2],
		]);
		expect(boundary(otherRange)).toEqual([unrelated, 1, unrelated, 4]);
		expect(test.node.parentNode).toBeNull();
		expect(tail.parentNode).toBeNull();
		expect(tail.data).toBe("cdef");
		expect(test.records.map((record) => record.type)).toEqual([
			"characterData",
		]);
	},
);

it.each(
	routes.flatMap((route) =>
		["forward", "backward"].map((direction) => ({ route, direction })),
	),
)(
	"$route: retains selected range identity and $direction direction",
	({ route, direction }) => {
		const test = fixture();
		const selection = test.document.getSelection() as Selection;
		const backward = direction === "backward";
		selection.setBaseAndExtent(
			test.node,
			backward ? 5 : 1,
			test.node,
			backward ? 1 : 5,
		);
		const selected = selection.getRangeAt(0);
		const tail = test.split(route, 2);
		expect(selection.getRangeAt(0)).toBe(selected);
		expect(boundary(selected)).toEqual([test.node, 1, tail, 3]);
		expect(selection.anchorNode).toBe(backward ? tail : test.node);
		expect(selection.anchorOffset).toBe(backward ? 3 : 1);
		expect(selection.focusNode).toBe(backward ? test.node : tail);
		expect(selection.focusOffset).toBe(backward ? 1 : 3);
		expect(Reflect.get(selection, "direction")).toBe(direction);
		expect(selection.toString()).toBe("bcde");
	},
);

it.each(routes)(
	"%s: tracks transferred native boundaries through tail edit and removal",
	(route) => {
		const test = fixture();
		const owner = domRangeOwner(test.tree);
		const range = owner.createRange();
		range.setStart(test.id, 3);
		range.setEnd(test.id, 6);
		const clone = range.cloneRange();
		test.split(route, 2);
		const tail = test.tree.get(test.parent).children[1];
		expect(range.start).toEqual({ node: tail, offset: 1 });
		expect(range.end).toEqual({ node: tail, offset: 4 });
		test.tree.replaceData(tail, 0, 0, "!");
		expect(range.start).toEqual({ node: tail, offset: 2 });
		expect(range.end).toEqual({ node: tail, offset: 5 });
		test.tree.replaceData(tail, 1, 2, "");
		expect(range.start).toEqual({ node: tail, offset: 1 });
		expect(range.end).toEqual({ node: tail, offset: 3 });
		test.tree.remove(tail);
		for (const current of [range, clone]) {
			expect(current.start).toEqual({ node: test.parent, offset: 1 });
			expect(current.end).toEqual({ node: test.parent, offset: 1 });
		}
	},
);

it.each(routes)(
	"%s: moving the split tail leaves endpoints at its old parent position",
	(route) => {
		const test = fixture();
		const destination = test.tree.createElement("aside");
		test.tree.append(test.tree.root, destination);
		const range = test.range(3, 6);
		test.split(route, 2);
		const tail = test.tree.get(test.parent).children[1];
		test.tree.append(destination, tail);
		expect(range.startContainer === test.parentNode).toBe(true);
		expect(range.startOffset).toBe(1);
		expect(range.endContainer === test.parentNode).toBe(true);
		expect(range.endOffset).toBe(1);
		expect(test.tree.get(tail).parent).toBe(destination);
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
	"%s: preserves public payload shape, immutable privacy and notification order",
	(route) => {
		const test = fixture();
		const after = test.tree.createElement("b");
		test.tree.append(test.parent, after);
		test.records.length = 0;
		const attempts: boolean[] = [];
		test.tree.onMutation((record) => {
			attempts.push(Reflect.set(record, "splitText", { offset: 99 }));
			attempts.push(Reflect.defineProperty(record, "offset", { value: 99 }));
			attempts.push(Reflect.set(record.addedNodes, "0", test.id));
		});
		const range = test.range(3, 6);
		const tail = test.split(route, 2);
		const tailId = test.tree.get(test.parent).children[1];
		expect(test.records).toEqual([
			{
				type: "childList",
				target: test.parent,
				ancestors: [test.parent, test.tree.root],
				addedNodes: [tailId],
				removedNodes: [],
				previousSibling: test.id,
				nextSibling: after,
				attributeName: null,
				attributeNamespace: null,
				oldValue: null,
			},
			{
				type: "characterData",
				target: test.id,
				ancestors: [test.id, test.parent, test.tree.root],
				addedNodes: [],
				removedNodes: [],
				previousSibling: null,
				nextSibling: null,
				attributeName: null,
				attributeNamespace: null,
				oldValue: "abcdef",
			},
		]);
		for (const record of test.records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(rawKeys);
			expect(Object.isFrozen(record)).toBe(true);
			for (const list of [
				record.ancestors,
				record.addedNodes,
				record.removedNodes,
			])
				expect(Object.isFrozen(list)).toBe(true);
		}
		expect(attempts).toEqual([false, false, false, false, false, false]);
		expect(test.tree.mutationMetrics().collectorFailures).toBe(0);
		expect(boundary(range)).toEqual([tail, 1, tail, 4]);
	},
);

interface ObserverView {
	observe(target: object, options: object): void;
	takeRecords(): readonly MutationRecord[];
	disconnect(): void;
}

function observerFixture(test: ReturnType<typeof fixture>) {
	const callback = vi.fn();
	const startCallback: ScriptCallbackRuntime["startCallback"] = (
		target,
		args,
		options,
	) => ({
		synchronous: Promise.resolve(),
		result: Promise.resolve(
			Reflect.apply(
				target as (...args: unknown[]) => unknown,
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
	observer.observe(test.parentNode, {
		subtree: true,
		childList: true,
		characterData: true,
		characterDataOldValue: true,
	});
	return { bindings, callback, observer };
}

it.each(routes)(
	"%s: queues guest observer delivery until checkpoint with already-live ranges",
	async (route) => {
		const test = fixture();
		const range = test.range(3, 6);
		const { bindings, callback, observer } = observerFixture(test);
		const delivered: unknown[][] = [];
		callback.mockImplementation(() => delivered.push(boundary(range)));
		const tail = test.split(route, 2);
		expect(callback).not.toHaveBeenCalled();
		expect(bindings.hasPending()).toBe(true);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.contexts[0]).toBe(observer);
		expect(callback.mock.calls[0][1]).toBe(observer);
		const records = callback.mock.calls[0][0] as readonly MutationRecord[];
		expect(
			records.map((record) => [record.type, record.target, record.oldValue]),
		).toEqual([
			["childList", test.parentNode, null],
			["characterData", test.node, "abcdef"],
		]);
		expect(records[0].addedNodes.item(0)).toBe(tail);
		expect(records[0].previousSibling).toBe(test.node);
		expect(records[0].nextSibling).toBeNull();
		for (const record of records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(
				rawKeys.filter((key) => key !== "ancestors"),
			);
			expect(Reflect.set(record, "oldValue", "changed")).toBe(false);
		}
		expect(Object.isFrozen(records)).toBe(true);
		expect(delivered).toEqual([[tail, 1, tail, 4]]);
		expect(observer.takeRecords()).toEqual([]);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
	},
);

it("drains static observer records and disconnects without stopping native range tracking", async () => {
	const test = fixture();
	const range = test.range(3, 6);
	const { bindings, callback, observer } = observerFixture(test);
	const tail = test.split("native", 2);
	const records = observer.takeRecords();
	expect(records).toHaveLength(2);
	observer.disconnect();
	tail.data = "xy";
	expect(records[1].oldValue).toBe("abcdef");
	expect(records[0].addedNodes.item(0)).toBe(tail);
	expect(boundary(range)).toEqual([tail, 0, tail, 0]);
	await bindings.checkpoint();
	expect(callback).not.toHaveBeenCalled();
});

it.each(
	routes.flatMap((route) => [0, 2, 6].map((offset) => ({ route, offset }))),
)(
	"$route: splitting at $offset leaves total text quota unchanged",
	({ route, offset }) => {
		const test = fixture("abcdef", true, { maxTextCodeUnits: 10 });
		test.split(route, offset);
		expect(test.parentNode.textContent).toBe("abcdef");
		expect(() => test.tree.createText("!")).toThrow(/text limit/);
		expect(test.tree.createText("")).toBeTypeOf("number");
	},
);

it.each(routes)(
	"%s: node exhaustion is atomic for data, ranges, records and revisions",
	(route) => {
		const test = fixture("abcdef", true, { maxNodes: 3 });
		const range = test.range(3, 6);
		const revision = test.tree.revision;
		expect(() => test.split(route, 2)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		expect(test.tree.revision).toBe(revision);
		expect(test.node.data).toBe("abcdef");
		expect(test.tree.get(test.parent).children).toEqual([test.id]);
		expect(boundary(range)).toEqual([test.node, 3, test.node, 6]);
		expect(test.records).toEqual([]);
	},
);

it.each(routes)(
	"%s: rejects invalid offsets atomically and recovers for a valid split",
	(route) => {
		const test = fixture();
		const range = test.range(3, 6);
		const revision = test.tree.revision;
		for (const offset of [-1, 7])
			expect(() => test.split(route, offset)).toThrow();
		if (route !== "script") {
			for (const offset of [Number.NaN, Number.POSITIVE_INFINITY, 1.5])
				expect(() => test.split(route, offset)).toThrow();
		}
		expect(test.tree.revision).toBe(revision);
		expect(test.records).toEqual([]);
		expect(test.node.data).toBe("abcdef");
		expect(boundary(range)).toEqual([test.node, 3, test.node, 6]);
		expect(test.split(route, 2).data).toBe("cdef");
	},
);

it.each([
	{ value: "2", prefix: "ab", suffix: "cdef" },
	{ value: 2.9, prefix: "ab", suffix: "cdef" },
	{ value: 4_294_967_298, prefix: "ab", suffix: "cdef" },
	{ value: true, prefix: "a", suffix: "bcdef" },
	{ value: null, prefix: "", suffix: "abcdef" },
	{ value: undefined, prefix: "", suffix: "abcdef" },
	{ value: Number.NaN, prefix: "", suffix: "abcdef" },
	{ value: Number.POSITIVE_INFINITY, prefix: "", suffix: "abcdef" },
])(
	"script scalar conversion of $value retains existing unsigned semantics",
	({ value, prefix, suffix }) => {
		const test = fixture();
		const tail = Reflect.apply(test.node.splitText, test.node, [value]) as Text;
		expect(test.node.data).toBe(prefix);
		expect(tail.data).toBe(suffix);
	},
);

it("script rejects missing/coercive offsets without invoking conversion or allocating nodes", () => {
	const test = fixture();
	const conversion = vi.fn(() => 2);
	const object = {
		valueOf: conversion,
		toString: conversion,
		[Symbol.toPrimitive]: conversion,
	};
	const revision = test.tree.revision;
	expect(() => Reflect.apply(test.node.splitText, test.node, [])).toThrow(
		TypeError,
	);
	for (const offset of [object, Symbol("offset"), 2n, conversion])
		expect(() =>
			Reflect.apply(test.node.splitText, test.node, [offset]),
		).toThrow();
	expect(conversion).not.toHaveBeenCalled();
	expect(test.records).toEqual([]);
	expect(test.tree.revision).toBe(revision);
	expect(test.node.data).toBe("abcdef");
});

it.each(routes)(
	"%s: tracks a late-attached parent and the new tail without republishing ranges",
	(route) => {
		const test = fixture("abcdef", false);
		const range = test.range(3, 6);
		test.tree.append(test.parent, test.id);
		const tail = test.split(route, 2);
		expect(boundary(range)).toEqual([tail, 1, tail, 4]);
		test.tree.remove(test.tree.get(test.parent).children[1]);
		expect(boundary(range)).toEqual([test.parentNode, 1, test.parentNode, 1]);
	},
);

it.each(routes)(
	"%s: split metadata does not suppress a later whole prefix assignment",
	(route) => {
		const test = fixture();
		const prefix = test.range(1, 2);
		const suffix = test.range(3, 6);
		const tail = test.split(route, 2);
		test.node.data = "ab";
		expect(boundary(prefix)).toEqual([test.node, 0, test.node, 0]);
		expect(boundary(suffix)).toEqual([tail, 1, tail, 4]);
		expect(test.records.map((record) => record.oldValue)).toEqual([
			null,
			"abcdef",
			"ab",
		]);
	},
);

it("rejects native non-text split and exposes no script comment split capability", () => {
	const test = fixture();
	const comment = test.tree.createComment("abcdef");
	const revision = test.tree.revision;
	for (const id of [comment, test.parent])
		expect(() => test.tree.splitText(id, 2)).toThrow();
	expect(Reflect.get(test.dom.node(comment), "splitText")).toBeUndefined();
	expect(test.tree.revision).toBe(revision);
	expect(test.records).toEqual([]);
});

it.each(["binding", "document"] as const)(
	"%s closure revokes retained split/range capabilities and queued observers",
	async (lifetime) => {
		const test = fixture();
		const range = test.range(3, 6);
		const owner = domRangeOwner(test.tree);
		const { bindings, callback, observer } = observerFixture(test);
		const tail = test.split("script", 2);
		if (lifetime === "binding") test.dom.close();
		else test.tree.close();
		expect(() => test.node.splitText(1)).toThrow(/closed/);
		expect(() => tail.splitText(1)).toThrow(/closed/);
		expect(() => range.startOffset).toThrow(/closed/);
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
		if (lifetime === "document") {
			expect(() => test.tree.splitText(test.id, 1)).toThrow(/closed/);
			expect(() => owner.splitText(test.id, 1)).toThrow(/closed/);
		}
	},
);
