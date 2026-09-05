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
const routes = ["native", "script"] as const;
type Route = (typeof routes)[number];
type Receiver = "element" | "document" | "fragment";

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
	parts = ["abcd", "EF", "GH"],
	receiver: Receiver = "element",
	attached = true,
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree(
		"https://fixture.invalid/normalize-survivor",
		limits,
	);
	const parent =
		receiver === "document"
			? tree.root
			: receiver === "fragment"
				? tree.createFragment()
				: tree.createElement("main");
	if (receiver === "element" && attached) tree.append(tree.root, parent);
	const ids = parts.map((data) => tree.createText(data));
	for (const id of ids) tree.append(parent, id);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	cleanups.push(() => {
		dom.close();
		tree.close();
	});
	const document = dom.document as Document;
	const nodes = ids.map((id) => dom.node(id) as Text);
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	const range = (start: number, end: number, target: Node = nodes[0]) => {
		const value = document.createRange();
		value.setStart(target, start);
		value.setEnd(target, end);
		return value;
	};
	const normalize = (route: Route, target = parent) =>
		route === "native"
			? tree.normalize(target)
			: (dom.node(target) as Node).normalize();
	return { tree, parent, ids, dom, document, nodes, records, range, normalize };
}

function expectRange(range: Range, node: Node, start: number, end: number) {
	expect(range.startContainer === node).toBe(true);
	expect(range.endContainer === node).toBe(true);
	expect([range.startOffset, range.endOffset]).toEqual([start, end]);
}

it.each(
	routes.flatMap((route) =>
		(["element", "document", "fragment"] as const).map((receiver) => ({
			route,
			receiver,
		})),
	),
)(
	"$route: $receiver normalize retains survivor endpoint tables and independent clones",
	({ route, receiver }) => {
		const test = fixture(undefined, receiver);
		const inside = test.range(1, 3);
		const throughEnd = test.range(2, 4);
		const atEnd = test.range(4, 4);
		const clone = throughEnd.cloneRange();
		const count = test.tree.nodeCount;
		expect(test.normalize(route)).toBeUndefined();
		expect(test.tree.get(test.parent).children).toEqual([test.ids[0]]);
		expect(test.nodes[0].data).toBe("abcdEFGH");
		expect(test.dom.node(test.ids[0]) === test.nodes[0]).toBe(true);
		expect(test.tree.nodeCount).toBe(count);
		expectRange(inside, test.nodes[0], 1, 3);
		expectRange(throughEnd, test.nodes[0], 2, 4);
		expectRange(atEnd, test.nodes[0], 4, 4);
		expectRange(clone, test.nodes[0], 2, 4);
		expect(inside.toString()).toBe("bc");
		expect(throughEnd.toString()).toBe("cd");
		clone.setStart(test.nodes[0], 3);
		expectRange(throughEnd, test.nodes[0], 2, 4);
	},
);

it.each(routes)(
	"%s: singleton and repeated empty appends preserve nonzero ranges without revision changes",
	(route) => {
		const test = fixture(["abcd"]);
		const range = test.range(1, 4);
		const revision = test.tree.revision;
		for (let iteration = 0; iteration < 3; iteration++) {
			test.normalize(route);
			expect(test.tree.revision).toBe(revision);
			expect(test.records).toHaveLength(iteration + 1);
			expectRange(range, test.nodes[0], 1, 4);
		}
		expect(
			test.records.map((record) => [
				record.type,
				record.target,
				record.oldValue,
			]),
		).toEqual([
			["characterData", test.ids[0], "abcd"],
			["characterData", test.ids[0], "abcd"],
			["characterData", test.ids[0], "abcd"],
		]);
	},
);

it.each(routes)(
	"%s: repeated normalize after a merge retains the original selection extent",
	(route) => {
		const test = fixture(["abcd", "EF"]);
		const range = test.range(1, 4);
		test.normalize(route);
		const revision = test.tree.revision;
		test.normalize(route);
		test.normalize(route);
		expect(test.tree.revision).toBe(revision);
		expect(test.nodes[0].data).toBe("abcdEF");
		expectRange(range, test.nodes[0], 1, 4);
		expect(range.toString()).toBe("bcd");
		expect(test.records.map((record) => record.oldValue)).toEqual([
			"abcd",
			null,
			"abcdEF",
			"abcdEF",
		]);
	},
);

it.each(
	routes.flatMap((route) => [
		{ route, parts: ["abcd", "", ""], survivor: 0, expected: "abcd" },
		{
			route,
			parts: ["", "", "abcd", "", "EF", ""],
			survivor: 2,
			expected: "abcdEF",
		},
	]),
)(
	"$route: leading/following empty members preserve survivor $survivor",
	({ route, parts, survivor, expected }) => {
		const test = fixture(parts);
		const node = test.nodes[survivor];
		const range = test.range(1, 4, node);
		test.normalize(route);
		expect(test.tree.get(test.parent).children).toEqual([test.ids[survivor]]);
		expect(node.data).toBe(expected);
		for (const [index, member] of test.nodes.entries()) {
			if (index === survivor) continue;
			expect(member.parentNode === null).toBe(true);
			expect(member.data).toBe(parts[index]);
		}
		expectRange(range, node, 1, 4);
	},
);

it.each(routes)(
	"%s: survivor boundaries remain UTF-16 offsets even within a surrogate pair",
	(route) => {
		const test = fixture(["A😀B", "C😀"]);
		const withinPair = test.range(2, 3);
		const wholePair = test.range(1, 3);
		const end = test.range(4, 4);
		test.normalize(route);
		expect(test.nodes[0].data).toBe("A😀BC😀");
		expectRange(withinPair, test.nodes[0], 2, 3);
		expectRange(wholePair, test.nodes[0], 1, 3);
		expectRange(end, test.nodes[0], 4, 4);
		expect(withinPair.toString()).toBe("\ude00");
		expect(wholePair.toString()).toBe("😀");
	},
);

it.each(routes)(
	"%s: detached element normalization keeps survivor identity and its separate root",
	(route) => {
		const test = fixture(["abcd", "EF"], "element", false);
		const range = test.range(1, 4);
		const other = test.document.createTextNode("other");
		const unrelated = test.range(1, 3, other);
		test.normalize(route);
		expect(test.tree.get(test.parent).parent).toBeNull();
		expect(test.nodes[0].parentNode === test.dom.node(test.parent)).toBe(true);
		expectRange(range, test.nodes[0], 1, 4);
		expectRange(unrelated, other, 1, 3);
	},
);

it.each(routes)(
	"%s: comment and element barriers retain separate survivors throughout a subtree",
	(route) => {
		const test = fixture(["ab", "CD"]);
		const comment = test.tree.createComment("barrier");
		const second = test.tree.createText("ef");
		const secondTail = test.tree.createText("GH");
		const element = test.tree.createElement("i");
		const nested = test.tree.createText("ij");
		const nestedTail = test.tree.createText("KL");
		const last = test.tree.createText("mn");
		for (const id of [comment, second, secondTail, element, last])
			test.tree.append(test.parent, id);
		for (const id of [nested, nestedTail]) test.tree.append(element, id);
		const survivors = [test.ids[0], second, nested, last];
		const nodes = survivors.map((id) => test.dom.node(id) as Text);
		const ranges = nodes.map((node) => test.range(1, 2, node));
		const commentNode = test.dom.node(comment) as Comment;
		const commentRange = test.range(1, 3, commentNode);
		test.normalize(route);
		expect(test.tree.get(test.parent).children).toEqual([
			test.ids[0],
			comment,
			second,
			element,
			last,
		]);
		expect(test.tree.get(element).children).toEqual([nested]);
		expect(nodes.map((node) => node.data)).toEqual([
			"abCD",
			"efGH",
			"ijKL",
			"mn",
		]);
		for (const [index, range] of ranges.entries())
			expectRange(range, nodes[index], 1, 2);
		expectRange(commentRange, commentNode, 1, 3);
	},
);

it.each(routes)(
	"%s: scoped element normalization leaves outside sibling runs untouched",
	(route) => {
		const test = fixture(["abcd", "EF"]);
		const outside = test.tree.createText("outside");
		const outsideTail = test.tree.createText("tail");
		test.tree.append(test.tree.root, outside);
		test.tree.append(test.tree.root, outsideTail);
		const outsideNode = test.dom.node(outside) as Text;
		const outsideRange = test.range(1, 4, outsideNode);
		const range = test.range(1, 4);
		test.records.length = 0;
		test.normalize(route);
		expect(test.tree.get(test.tree.root).children).toEqual([
			test.parent,
			outside,
			outsideTail,
		]);
		expect(outsideNode.data).toBe("outside");
		expect(test.records.map((record) => record.target)).toEqual([
			test.ids[0],
			test.parent,
		]);
		expectRange(outsideRange, outsideNode, 1, 4);
		expectRange(range, test.nodes[0], 1, 4);
	},
);

it.each(routes)(
	"%s: a text-node receiver does not normalize its outside siblings",
	(route) => {
		const test = fixture(["abcd", "EF"]);
		const range = test.range(1, 4);
		const revision = test.tree.revision;
		test.normalize(route, test.ids[0]);
		expect(test.tree.get(test.parent).children).toEqual(test.ids);
		expect(test.nodes.map((node) => node.data)).toEqual(["abcd", "EF"]);
		expect(test.records).toEqual([]);
		expect(test.tree.revision).toBe(revision);
		expectRange(range, test.nodes[0], 1, 4);
	},
);

it.each(routes)(
	"%s: updates native owner ranges without republishing or replacing them",
	(route) => {
		const test = fixture(["abcd", "EF"]);
		const range = domRangeOwner(test.tree).createRange();
		range.setStart(test.ids[0], 1);
		range.setEnd(test.ids[0], 4);
		const clone = range.cloneRange();
		test.normalize(route);
		for (const current of [range, clone]) {
			expect(current.start).toEqual({ node: test.ids[0], offset: 1 });
			expect(current.end).toEqual({ node: test.ids[0], offset: 4 });
		}
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
	"%s: preserves raw mutation payload, order, multiplicity and immutable public shape",
	(route) => {
		const test = fixture(["", "ab", "", "cd"]);
		const parent = test.parent;
		const [leading, survivor, empty, tail] = test.ids;
		test.normalize(route);
		const common = {
			addedNodes: [],
			attributeName: null,
			attributeNamespace: null,
		};
		expect(test.records).toEqual([
			{
				...common,
				type: "childList",
				target: parent,
				ancestors: [parent, test.tree.root],
				removedNodes: [leading],
				previousSibling: null,
				nextSibling: survivor,
				oldValue: null,
			},
			{
				...common,
				type: "characterData",
				target: survivor,
				ancestors: [survivor, parent, test.tree.root],
				removedNodes: [],
				previousSibling: null,
				nextSibling: null,
				oldValue: "ab",
			},
			{
				...common,
				type: "childList",
				target: parent,
				ancestors: [parent, test.tree.root],
				removedNodes: [empty],
				previousSibling: survivor,
				nextSibling: tail,
				oldValue: null,
			},
			{
				...common,
				type: "childList",
				target: parent,
				ancestors: [parent, test.tree.root],
				removedNodes: [tail],
				previousSibling: survivor,
				nextSibling: null,
				oldValue: null,
			},
		]);
		for (const record of test.records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(rawKeys);
			expect(Object.isFrozen(record)).toBe(true);
			expect(Reflect.set(record, "offset", 99)).toBe(false);
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
	observer.observe(test.dom.node(test.parent), {
		subtree: true,
		childList: true,
		characterData: true,
		characterDataOldValue: true,
	});
	return { bindings, callback, observer };
}

it.each(routes)(
	"%s: queues guest observer callbacks until checkpoint with preserved survivor endpoints",
	async (route) => {
		const test = fixture(["abcd", "EF"]);
		const range = test.range(1, 4);
		const { bindings, callback, observer } = observerFixture(test);
		const observed: number[][] = [];
		callback.mockImplementation(() =>
			observed.push([range.startOffset, range.endOffset]),
		);
		test.normalize(route);
		expect(callback).not.toHaveBeenCalled();
		expect(bindings.hasPending()).toBe(true);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.contexts[0] === observer).toBe(true);
		expect(callback.mock.calls[0][1] === observer).toBe(true);
		const records = callback.mock.calls[0][0] as readonly MutationRecord[];
		expect(records.map((record) => [record.type, record.oldValue])).toEqual([
			["characterData", "abcd"],
			["childList", null],
		]);
		expect(records[0].target === test.nodes[0]).toBe(true);
		expect(records[1].target === test.dom.node(test.parent)).toBe(true);
		expect(records[1].removedNodes.item(0) === test.nodes[1]).toBe(true);
		expect(records[1].previousSibling === test.nodes[0]).toBe(true);
		expect(records[1].nextSibling === null).toBe(true);
		expect(Object.isFrozen(records)).toBe(true);
		for (const record of records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(
				rawKeys.filter((key) => key !== "ancestors"),
			);
			expect(Reflect.set(record, "oldValue", "changed")).toBe(false);
		}
		expect(observed).toEqual([[1, 4]]);
		expectRange(range, test.nodes[0], 1, 4);
		expect(observer.takeRecords()).toEqual([]);
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
	},
);

it.each(routes)(
	"%s: drained records stay static and observer disconnect does not stop survivor tracking",
	async (route) => {
		const test = fixture(["abcd", "EF"]);
		const range = test.range(1, 4);
		const { bindings, callback, observer } = observerFixture(test);
		test.normalize(route);
		const records = observer.takeRecords();
		observer.disconnect();
		test.normalize(route);
		expect(records).toHaveLength(2);
		expect(records[0].oldValue).toBe("abcd");
		expect(records[1].removedNodes.item(0) === test.nodes[1]).toBe(true);
		expect(observer.takeRecords()).toEqual([]);
		await bindings.checkpoint();
		expect(callback).not.toHaveBeenCalled();
		expectRange(range, test.nodes[0], 1, 4);
	},
);

it.each(routes)(
	"%s: text quota preflight rejects all runs atomically before any mutation",
	(route) => {
		const test = fixture(["ab", "CD"], "document", true, {
			maxTextCodeUnits: 8,
		});
		const comment = test.tree.createComment("");
		const second = test.tree.createText("ef");
		const secondTail = test.tree.createText("GH");
		for (const id of [comment, second, secondTail])
			test.tree.append(test.parent, id);
		const range = test.range(1, 2);
		const secondNode = test.dom.node(second) as Text;
		const secondRange = test.range(1, 2, secondNode);
		const revision = test.tree.revision;
		const before = test.tree.get(test.parent);
		const count = test.tree.nodeCount;
		test.records.length = 0;
		expect(() => test.normalize(route)).toThrow(/text limit/);
		expect(test.tree.get(test.parent) === before).toBe(true);
		expect(test.tree.revision).toBe(revision);
		expect(test.tree.nodeCount).toBe(count);
		expect(test.records).toEqual([]);
		expect(test.nodes[0].data).toBe("ab");
		expect(secondNode.data).toBe("ef");
		expect(test.nodes[1].parentNode === test.dom.node(test.parent)).toBe(true);
		expect(test.tree.get(secondTail).parent).toBe(test.parent);
		expectRange(range, test.nodes[0], 1, 2);
		expectRange(secondRange, secondNode, 1, 2);
	},
);

it.each(routes)(
	"%s: retained detached suffix data remains charged after survivor growth",
	(route) => {
		const test = fixture(["a", "b"], "document", true, { maxTextCodeUnits: 3 });
		const range = test.range(1, 1);
		test.normalize(route);
		expect(test.nodes[0].data).toBe("ab");
		expect(test.nodes[1].data).toBe("b");
		expect(test.nodes[1].parentNode === null).toBe(true);
		expect(() => test.tree.createText("x")).toThrow(/text limit/);
		test.tree.setData(test.ids[1], "");
		expect(test.tree.get(test.tree.createText("x")).data).toBe("x");
		expectRange(range, test.nodes[0], 1, 1);
	},
);

it.each(routes)(
	"%s: normalization allocates no nodes at the exact node limit",
	(route) => {
		const test = fixture(["abcd", "EF"], "document", true, { maxNodes: 3 });
		const range = test.range(1, 4);
		test.normalize(route);
		expect(test.tree.nodeCount).toBe(3);
		expect(test.tree.get(test.parent).children).toEqual([test.ids[0]]);
		expectRange(range, test.nodes[0], 1, 4);
	},
);

it.each(["binding", "document"] as const)(
	"%s closure revokes normalize and retained ranges and drops queued delivery",
	async (lifetime) => {
		const test = fixture(["abcd", "EF"]);
		const range = test.range(1, 4);
		const receiver = test.dom.node(test.parent) as Node;
		const { bindings, callback, observer } = observerFixture(test);
		test.normalize("native");
		if (lifetime === "binding") test.dom.close();
		else test.tree.close();
		expect(() => receiver.normalize()).toThrow(/closed/);
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
		if (lifetime === "document")
			expect(() => test.tree.normalize(test.parent)).toThrow(/closed/);
	},
);
