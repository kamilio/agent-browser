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
		for (let index = 0; index < indexed.length(); index++)
			Object.defineProperty(result, index, { get: () => indexed.get(index) });
	}
	return result;
}

type EditMethod = "appendData" | "insertData" | "deleteData" | "replaceData";

function fixture(
	kind: "text" | "comment" = "text",
	data = "abcdef",
	attached = true,
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/range-data", limits);
	const parent = tree.createElement("main");
	tree.append(tree.root, parent);
	const id = kind === "text" ? tree.createText(data) : tree.createComment(data);
	if (attached) tree.append(parent, id);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	cleanups.push(() => {
		dom.close();
		tree.close();
	});
	const document = dom.document as Document;
	const node = dom.node(id) as CharacterData;
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	const range = (start: number, end: number, target: Node = node) => {
		const value = document.createRange();
		value.setStart(target, start);
		value.setEnd(target, end);
		return value;
	};
	return { tree, parent, id, dom, document, node, range, records };
}

function offsets(range: Range) {
	return [range.startOffset, range.endOffset];
}

function edit(node: CharacterData, method: EditMethod, args: unknown[]) {
	return Reflect.apply(node[method], node, args);
}

const operations: {
	method: EditMethod;
	args: unknown[];
	data: string;
	expected: number[];
}[] = [
	{ method: "appendData", args: ["XY"], data: "abcdefXY", expected: [3, 6] },
	{ method: "insertData", args: [2, "XY"], data: "abXYcdef", expected: [5, 8] },
	{ method: "deleteData", args: [2, 2], data: "abef", expected: [2, 4] },
	{
		method: "replaceData",
		args: [2, 2, "XYZ"],
		data: "abXYZef",
		expected: [2, 7],
	},
];

it.each(
	(["text", "comment"] as const).flatMap((kind) =>
		operations.map((operation) => ({ kind, ...operation })),
	),
)(
	"updates actual ScriptDom $kind $method ranges without changing node identity",
	({ kind, ...operation }) => {
		const test = fixture(kind);
		const range = test.range(3, 6);
		expect(edit(test.node, operation.method, operation.args)).toBeUndefined();
		expect(test.node.data).toBe(operation.data);
		expect(offsets(range)).toEqual(operation.expected);
		expect(range.startContainer).toBe(test.node);
		expect(range.endContainer).toBe(test.node);
		expect(test.records).toHaveLength(1);
		expect(test.records[0].oldValue).toBe("abcdef");
	},
);

it.each(["text", "comment"] as const)(
	"applies exact edges to multiple and cloned %s ranges",
	(kind) => {
		const test = fixture(kind);
		const before = test.range(0, 1);
		const edge = test.range(2, 2);
		const inside = test.range(3, 4);
		const after = test.range(5, 6);
		const clone = after.cloneRange();
		test.node.replaceData(2, 2, "XYZ");
		expect([before, edge, inside, after, clone].map(offsets)).toEqual([
			[0, 1],
			[2, 2],
			[2, 2],
			[6, 7],
			[6, 7],
		]);
		clone.setStart(test.node, 0);
		expect(offsets(after)).toEqual([6, 7]);
		test.node.insertData(2, "!");
		expect(offsets(edge)).toEqual([2, 2]);
		expect(offsets(after)).toEqual([7, 8]);
		expect(offsets(clone)).toEqual([0, 8]);
	},
);

it.each(["text", "comment"] as const)(
	"clips huge deletion counts for detached %s and preserves another node's range",
	(kind) => {
		const test = fixture(kind, "abcdef", false);
		const range = test.range(3, 6);
		const unrelated = test.document.createTextNode("other");
		const otherRange = test.range(1, 4, unrelated);
		test.node.replaceData(2, 4_294_967_295, "Q");
		expect(test.node.data).toBe("abQ");
		expect(test.node.parentNode).toBeNull();
		expect(offsets(range)).toEqual([2, 2]);
		expect(offsets(otherRange)).toEqual([1, 4]);
	},
);

it.each(["text", "comment"] as const)(
	"uses UTF-16 units, including an edit through a surrogate pair in %s",
	(kind) => {
		const test = fixture(kind, "A😀BC");
		const range = test.range(2, 5);
		test.node.replaceData(2, 1, "XY");
		expect(test.node.data).toBe("A\ud83dXYBC");
		expect(offsets(range)).toEqual([2, 6]);
		test.node.insertData(1, "😀");
		expect(offsets(range)).toEqual([4, 8]);
	},
);

it.each(["data", "nodeValue", "textContent"] as const)(
	"retains whole-assignment semantics for %s, distinct from equal partial replacement",
	(property) => {
		const test = fixture();
		const range = test.range(3, 6);
		test.node.replaceData(2, 2, "cd");
		expect(test.node.data).toBe("abcdef");
		expect(offsets(range)).toEqual([2, 6]);
		test.node[property] = "abcdef";
		expect(offsets(range)).toEqual([0, 0]);
		expect(test.records.map((record) => record.oldValue)).toEqual([
			"abcdef",
			"abcdef",
		]);
	},
);

it.each(
	(["text", "comment"] as const).flatMap((kind) =>
		(["data", "nodeValue", "textContent"] as const).map((property) => ({
			kind,
			property,
		})),
	),
)(
	"preserves whole $kind $property assignment controls",
	({ kind, property }) => {
		const test = fixture(kind);
		const range = test.range(3, 6);
		test.node[property] = "abcdef";
		expect(offsets(range)).toEqual([0, 0]);
		range.setStart(test.node, 2);
		range.setEnd(test.node, 5);
		test.node[property] = "xy";
		expect(offsets(range)).toEqual([0, 0]);
		expect(test.node.data).toBe("xy");
		expect(test.records.map((record) => record.oldValue)).toEqual([
			"abcdef",
			"abcdef",
		]);
	},
);

it("does not guess replacement offsets from identical repeated substrings", () => {
	const test = fixture("text", "aaaaaa");
	const range = test.range(4, 6);
	test.node.replaceData(3, 2, "aa");
	expect(offsets(range)).toEqual([3, 6]);
	expect(test.node.data).toBe("aaaaaa");
});

it.each(operations)(
	"empty $method preserves boundaries but still notifies",
	({ method }) => {
		const test = fixture();
		const range = test.range(3, 6);
		const revision = test.tree.revision;
		const args =
			method === "appendData"
				? [""]
				: method === "insertData"
					? [2, ""]
					: method === "deleteData"
						? [2, 0]
						: [2, 0, ""];
		edit(test.node, method, args);
		expect(offsets(range)).toEqual([3, 6]);
		expect(test.tree.revision).toBe(revision);
		expect(test.records).toHaveLength(1);
		expect(test.records[0].oldValue).toBe("abcdef");
	},
);

it.each([
	{ offset: "2.9", count: "1.8", value: 42, data: "ab42def", expected: [2, 7] },
	{
		offset: 4_294_967_298,
		count: 4_294_967_297,
		value: null,
		data: "abnulldef",
		expected: [2, 9],
	},
	{
		offset: Number.NaN,
		count: Number.POSITIVE_INFINITY,
		value: false,
		data: "falseabcdef",
		expected: [8, 11],
	},
	{
		offset: undefined,
		count: null,
		value: undefined,
		data: "undefinedabcdef",
		expected: [12, 15],
	},
])(
	"converts scalar edit values before precise range adjustment: $data",
	({ offset, count, value, data, expected }) => {
		const test = fixture();
		const range = test.range(3, 6);
		edit(test.node, "replaceData", [offset, count, value]);
		expect(test.node.data).toBe(data);
		expect(offsets(range)).toEqual(expected);
	},
);

it.each(["appendData", "insertData", "deleteData", "replaceData"] as const)(
	"rejects missing %s arguments without changing data, ranges or payloads",
	(method) => {
		const test = fixture();
		const range = test.range(3, 6);
		const revision = test.tree.revision;
		expect(() => edit(test.node, method, [])).toThrow(TypeError);
		expect(test.node.data).toBe("abcdef");
		expect(offsets(range)).toEqual([3, 6]);
		expect(test.records).toEqual([]);
		expect(test.tree.revision).toBe(revision);
	},
);

it("rejects out-of-range and coercive inputs without invoking user conversion", () => {
	const test = fixture();
	const range = test.range(3, 6);
	const convert = vi.fn(() => 1);
	const object = {
		valueOf: convert,
		toString: convert,
		[Symbol.toPrimitive]: convert,
	};
	const revision = test.tree.revision;
	for (const invalid of [object, Symbol("offset"), 1n, () => 1]) {
		expect(() => edit(test.node, "replaceData", [invalid, 1, "x"])).toThrow();
		expect(() => edit(test.node, "replaceData", [1, invalid, "x"])).toThrow();
	}
	expect(() => edit(test.node, "replaceData", [1, 1, object])).toThrow();
	for (const offset of [-1, 7])
		expect(() => edit(test.node, "deleteData", [offset, 0])).toThrow(
			expect.objectContaining({ name: "IndexSizeError" }),
		);
	expect(convert).not.toHaveBeenCalled();
	expect(test.node.data).toBe("abcdef");
	expect(offsets(range)).toEqual([3, 6]);
	expect(test.records).toEqual([]);
	expect(test.tree.revision).toBe(revision);
});

it("preserves detached text accounting and range state across atomic budget failure", () => {
	const test = fixture("text", "abcdef", false, { maxTextCodeUnits: 10 });
	const range = test.range(3, 6);
	const revision = test.tree.revision;
	expect(() => test.node.insertData(1, "!")).toThrow(/text limit/);
	expect(test.node.data).toBe("abcdef");
	expect(offsets(range)).toEqual([3, 6]);
	expect(test.tree.revision).toBe(revision);
	expect(test.records).toEqual([]);
	test.node.deleteData(2, 2);
	expect(offsets(range)).toEqual([2, 4]);
	expect(test.document.createTextNode("xy").data).toBe("xy");
	expect(() => test.document.createTextNode("z")).toThrow(/text limit/);
});

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

it("keeps raw records frozen and exact-shaped, without exposing edit metadata", () => {
	const test = fixture();
	const mutations: boolean[] = [];
	test.tree.onMutation((record) => {
		mutations.push(Reflect.set(record, "offset", 999));
		mutations.push(Reflect.set(record, "oldValue", ""));
		mutations.push(
			Reflect.defineProperty(record, "edit", {
				value: { offset: 0, count: 99, length: 0 },
			}),
		);
	});
	const range = test.range(3, 6);
	test.tree.replaceData(test.id, 2, 2, "XY");
	expect(mutations).toEqual([false, false, false]);
	const record = test.records[0];
	expect(Reflect.ownKeys(record).sort()).toEqual(rawKeys);
	expect(Object.isFrozen(record)).toBe(true);
	for (const list of [record.ancestors, record.addedNodes, record.removedNodes])
		expect(Object.isFrozen(list)).toBe(true);
	expect(record).toEqual({
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
	});
	expect(offsets(range)).toEqual([2, 6]);
});

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
	observer.observe(test.node, {
		characterData: true,
		characterDataOldValue: true,
	});
	return { callback, bindings, observer };
}

it.each(["text", "comment"] as const)(
	"queues %s observer records in order and delivers after ranges have adjusted",
	async (kind) => {
		const test = fixture(kind);
		const range = test.range(3, 6);
		const { callback, bindings, observer } = observerFixture(test);
		const deliveredOffsets: number[][] = [];
		callback.mockImplementation(() => deliveredOffsets.push(offsets(range)));
		test.node.insertData(2, "XY");
		test.node.deleteData(5, 1);
		test.node.appendData("!");
		expect(callback).not.toHaveBeenCalled();
		expect(bindings.hasPending()).toBe(true);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(deliveredOffsets).toEqual([[5, 7]]);
		const records = callback.mock.calls[0][0] as readonly MutationRecord[];
		expect(Object.isFrozen(records)).toBe(true);
		expect(records.map((record) => record.oldValue)).toEqual([
			"abcdef",
			"abXYcdef",
			"abXYcef",
		]);
		for (const record of records) {
			expect(record.target).toBe(test.node);
			expect(record.type).toBe("characterData");
			expect(record.attributeName).toBeNull();
			expect(record.attributeNamespace).toBeNull();
			expect(record.previousSibling).toBeNull();
			expect(record.nextSibling).toBeNull();
			expect(record.addedNodes.length).toBe(0);
			expect(record.removedNodes.length).toBe(0);
			expect(Reflect.ownKeys(record).sort()).toEqual(
				rawKeys.filter((key) => key !== "ancestors"),
			);
			expect(Reflect.set(record, "oldValue", "changed")).toBe(false);
		}
		expect(callback.mock.contexts[0]).toBe(observer);
		expect(callback.mock.calls[0][1]).toBe(observer);
		expect(bindings.hasPending()).toBe(false);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
	},
);

it("keeps drained payloads static while later equal edits and whole assignments have different effects", async () => {
	const test = fixture();
	const range = test.range(3, 6);
	const { bindings, observer, callback } = observerFixture(test);
	test.node.replaceData(2, 2, "cd");
	const records = observer.takeRecords();
	expect(offsets(range)).toEqual([2, 6]);
	test.node.data = "changed";
	expect(offsets(range)).toEqual([0, 0]);
	expect(records).toHaveLength(1);
	expect(records[0].oldValue).toBe("abcdef");
	await bindings.checkpoint();
	expect(callback).toHaveBeenCalledOnce();
	expect(callback.mock.calls[0][0]).toMatchObject([{ oldValue: "abcdef" }]);
});

it("keeps oldValue opt-in independent for multiple observers on detached data", async () => {
	const test = fixture("comment", "abcdef", false);
	const range = test.range(3, 6);
	const { bindings, observer } = observerFixture(test);
	const callback = vi.fn();
	const withoutOld = bindings.create(callback) as ObserverView;
	withoutOld.observe(test.node, { characterData: true });
	test.node.deleteData(2, 2);
	expect(observer.takeRecords()[0].oldValue).toBe("abcdef");
	expect(withoutOld.takeRecords()[0].oldValue).toBeNull();
	expect(offsets(range)).toEqual([2, 4]);
	await bindings.checkpoint();
	expect(callback).not.toHaveBeenCalled();
});

it("handles a callback edit at a later observer checkpoint rather than synchronous delivery", async () => {
	const test = fixture();
	const range = test.range(3, 6);
	const { bindings, callback } = observerFixture(test);
	callback.mockImplementationOnce(() => test.node.insertData(1, "!"));
	test.node.deleteData(2, 2);
	expect(callback).not.toHaveBeenCalled();
	await bindings.checkpoint();
	expect(callback).toHaveBeenCalledOnce();
	expect(offsets(range)).toEqual([3, 5]);
	expect(bindings.hasPending()).toBe(true);
	await bindings.checkpoint();
	expect(callback).toHaveBeenCalledTimes(2);
	expect(callback.mock.calls[1][0]).toMatchObject([{ oldValue: "abef" }]);
});

it("keeps canonical replacement metadata local when a listener edits another node", () => {
	const test = fixture();
	const first = test.range(3, 6);
	const otherId = test.tree.createText("uvwxyz");
	const other = test.dom.node(otherId) as Text;
	const second = test.range(3, 6, other);
	let entered = false;
	test.tree.onMutation((record) => {
		if (record.target === test.id && !entered) {
			entered = true;
			test.tree.replaceData(otherId, 1, 2, "!");
		}
	});
	domRangeOwner(test.tree).replaceText(test.id, 2, 2, "XY");
	expect(entered).toBe(true);
	expect(offsets(first)).toEqual([2, 6]);
	expect(offsets(second)).toEqual([1, 5]);
	expect(other.data).toBe("u!xyz");
});

it("does not reuse precise metadata for a subsequent unrelated whole assignment", () => {
	const test = fixture();
	const range = test.range(3, 6);
	test.node.insertData(2, "XY");
	expect(offsets(range)).toEqual([5, 8]);
	test.tree.setAttribute(test.parent, "title", "x");
	expect(offsets(range)).toEqual([5, 8]);
	test.node.nodeValue = "abXYcdef";
	expect(offsets(range)).toEqual([0, 0]);
	expect(test.records.map((record) => record.type)).toEqual([
		"characterData",
		"attributes",
		"characterData",
	]);
});

it("disconnects observers without stopping live-range adjustment", async () => {
	const test = fixture();
	const range = test.range(3, 6);
	const { bindings, callback, observer } = observerFixture(test);
	test.node.insertData(2, "XY");
	observer.disconnect();
	test.node.deleteData(2, 2);
	expect(offsets(range)).toEqual([3, 6]);
	expect(observer.takeRecords()).toEqual([]);
	await bindings.checkpoint();
	expect(callback).not.toHaveBeenCalled();
});

it.each(["binding", "document"] as const)(
	"revokes %s capabilities and drops queued observer delivery",
	async (owner) => {
		const test = fixture();
		const range = test.range(3, 6);
		const { bindings, callback, observer } = observerFixture(test);
		test.node.appendData("!");
		if (owner === "binding") test.dom.close();
		else test.tree.close();
		expect(() => test.node.replaceData(1, 1, "x")).toThrow(/closed/);
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
	},
);

it.each(
	(["text", "comment"] as const).flatMap((kind) =>
		operations.map((operation) => ({ kind, ...operation })),
	),
)(
	"reflects direct native $kind $method-equivalent edits through script ranges and queued records",
	async ({ kind, method, data, expected }) => {
		const test = fixture(kind);
		const range = test.range(3, 6);
		const clone = range.cloneRange();
		const { bindings, callback } = observerFixture(test);
		if (method === "appendData") test.tree.replaceData(test.id, 6, 0, "XY");
		else if (method === "insertData")
			test.tree.replaceData(test.id, 2, 0, "XY");
		else if (method === "deleteData") test.tree.replaceData(test.id, 2, 2, "");
		else test.tree.replaceData(test.id, 2, 2, "XYZ");
		expect(test.node.data).toBe(data);
		expect(offsets(range)).toEqual(expected);
		expect(offsets(clone)).toEqual(expected);
		expect(range.startContainer).toBe(test.node);
		expect(callback).not.toHaveBeenCalled();
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.calls[0][0]).toMatchObject([
			{ type: "characterData", target: test.node, oldValue: "abcdef" },
		]);
	},
);

it("distinguishes queued direct equal edits, empty edits and whole assignments through bindings", async () => {
	const test = fixture();
	const range = test.range(3, 6);
	const { bindings, callback } = observerFixture(test);
	test.tree.replaceData(test.id, 2, 2, "cd");
	expect(offsets(range)).toEqual([2, 6]);
	test.tree.replaceData(test.id, 1, 0, "");
	expect(offsets(range)).toEqual([2, 6]);
	test.node.textContent = "abcdef";
	expect(offsets(range)).toEqual([0, 0]);
	await bindings.checkpoint();
	const records = callback.mock.calls[0][0] as readonly MutationRecord[];
	expect(records.map((record) => record.oldValue)).toEqual([
		"abcdef",
		"abcdef",
		"abcdef",
	]);
	expect(records.map((record) => record.target)).toEqual([
		test.node,
		test.node,
		test.node,
	]);
});

it("consumes per-record direct details during same-node listener reentrancy inside canonical editing", () => {
	const test = fixture();
	const range = test.range(3, 6);
	let nested = false;
	test.tree.onMutation((record) => {
		if (record.target === test.id && !nested) {
			nested = true;
			test.tree.replaceData(test.id, 1, 0, "!");
		}
	});
	domRangeOwner(test.tree).replaceText(test.id, 2, 2, "XY");
	expect(test.node.data).toBe("a!bXYef");
	expect(offsets(range)).toEqual([3, 7]);
	expect(test.records.map((record) => record.oldValue)).toEqual([
		"abcdef",
		"abXYef",
	]);
});
