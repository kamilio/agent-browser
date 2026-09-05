import { afterEach, expect, it, vi } from "vitest";
import {
	type DocumentLimits,
	type DocumentMutation,
	DocumentTree,
	documentCharacterDataEdit,
} from "./document.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptCallbackRuntime } from "./script-events.js";

const routes = ["native", "script"] as const;
type Route = (typeof routes)[number];
type Receiver = "element" | "document" | "fragment";
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
	parts = ["ab", "cde", "f"],
	receiver: Receiver = "element",
	attached = true,
	limits: Partial<DocumentLimits> = {},
) {
	const tree = new DocumentTree(
		"https://fixture.invalid/normalize-ranges",
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
	const node = (id: number) => dom.node(id) as Node;
	const range = (
		startNode: number,
		start: number,
		endNode = startNode,
		end = start,
	) => {
		const value = document.createRange();
		value.setStart(node(startNode), start);
		value.setEnd(node(endNode), end);
		return value;
	};
	const normalize = (route: Route, target = parent) =>
		route === "native" ? tree.normalize(target) : node(target).normalize();
	const records: DocumentMutation[] = [];
	tree.onMutation((record) => records.push(record));
	return { tree, parent, ids, dom, document, node, range, normalize, records };
}

function expectRange(range: Range, node: Node, start: number, end: number) {
	expect(range.startContainer === node).toBe(true);
	expect(range.endContainer === node).toBe(true);
	expect([range.startOffset, range.endOffset]).toEqual([start, end]);
}

it.each(routes)(
	"%s: transfers static member endpoint tables and independent clones to the survivor",
	(route) => {
		const test = fixture();
		const cases = [
			{ member: 1, start: 0, end: 0, expected: [2, 2], text: "" },
			{ member: 1, start: 1, end: 3, expected: [3, 5], text: "de" },
			{ member: 1, start: 3, end: 3, expected: [5, 5], text: "" },
			{ member: 2, start: 0, end: 1, expected: [5, 6], text: "f" },
			{ member: 2, start: 1, end: 1, expected: [6, 6], text: "" },
		];
		const ranges = cases.map((entry) =>
			test.range(
				test.ids[entry.member],
				entry.start,
				test.ids[entry.member],
				entry.end,
			),
		);
		const clones = ranges.map((range) => range.cloneRange());
		const across = test.range(test.ids[1], 1, test.ids[2], 1);
		const count = test.tree.nodeCount;
		test.normalize(route);
		expect(test.tree.get(test.parent).children).toEqual([test.ids[0]]);
		expect(test.tree.get(test.ids[0]).data).toBe("abcdef");
		expect(test.tree.nodeCount).toBe(count);
		for (const [index, entry] of cases.entries()) {
			expectRange(
				ranges[index],
				test.node(test.ids[0]),
				entry.expected[0],
				entry.expected[1],
			);
			expectRange(
				clones[index],
				test.node(test.ids[0]),
				entry.expected[0],
				entry.expected[1],
			);
			expect(ranges[index] === clones[index]).toBe(false);
			expect(ranges[index].toString()).toBe(entry.text);
		}
		expectRange(across, test.node(test.ids[0]), 3, 6);
		expect(across.toString()).toBe("def");
	},
);

it.each(routes)(
	"%s: maps parent-before-member points while preserving before/after-run parent containers",
	(route) => {
		const test = fixture();
		const ranges = [0, 1, 2, 3].map((offset) =>
			test.range(test.parent, offset),
		);
		const across = test.range(test.parent, 1, test.parent, 2);
		const whole = test.range(test.parent, 0, test.parent, 3);
		test.normalize(route);
		expectRange(ranges[0], test.node(test.parent), 0, 0);
		expectRange(ranges[1], test.node(test.ids[0]), 2, 2);
		expectRange(ranges[2], test.node(test.ids[0]), 5, 5);
		expectRange(ranges[3], test.node(test.parent), 1, 1);
		expectRange(across, test.node(test.ids[0]), 2, 5);
		expect(across.toString()).toBe("cde");
		expectRange(whole, test.node(test.parent), 0, 1);
		expect(whole.toString()).toBe("abcdef");
	},
);

const selections = [
	{
		name: "following",
		startMember: 1,
		start: 1,
		endMember: 1,
		end: 3,
		expected: [3, 5],
		text: "de",
	},
	{
		name: "cross-node",
		startMember: 0,
		start: 1,
		endMember: 2,
		end: 1,
		expected: [1, 6],
		text: "bcdef",
	},
	{
		name: "adjacent-empty-span",
		startMember: 1,
		start: 3,
		endMember: 2,
		end: 0,
		expected: [5, 5],
		text: "",
	},
	{
		name: "parent-before-member",
		startMember: -1,
		start: 1,
		endMember: 2,
		end: 1,
		expected: [2, 6],
		text: "cdef",
	},
];

it.each(
	routes.flatMap((route) =>
		["forward", "backward"].flatMap((direction) =>
			selections.map((entry) => ({ route, direction, ...entry })),
		),
	),
)(
	"$route: $direction $name selection keeps range identity and direction after transfer",
	({
		route,
		direction,
		startMember,
		start,
		endMember,
		end,
		expected,
		text,
	}) => {
		const test = fixture();
		const selection = test.document.getSelection() as Selection;
		const first = test.node(
			startMember === -1 ? test.parent : test.ids[startMember],
		);
		const last = test.node(test.ids[endMember]);
		const backward = direction === "backward";
		selection.setBaseAndExtent(
			backward ? last : first,
			backward ? end : start,
			backward ? first : last,
			backward ? start : end,
		);
		const range = selection.getRangeAt(0);
		const clone = range.cloneRange();
		test.normalize(route);
		expect(selection.getRangeAt(0) === range).toBe(true);
		expectRange(range, test.node(test.ids[0]), expected[0], expected[1]);
		expectRange(clone, test.node(test.ids[0]), expected[0], expected[1]);
		expect(selection.anchorNode === test.node(test.ids[0])).toBe(true);
		expect(selection.focusNode === test.node(test.ids[0])).toBe(true);
		expect(selection.anchorOffset).toBe(backward ? expected[1] : expected[0]);
		expect(selection.focusOffset).toBe(backward ? expected[0] : expected[1]);
		expect(Reflect.get(selection, "direction")).toBe(direction);
		expect(selection.isCollapsed).toBe(expected[0] === expected[1]);
		expect(selection.toString()).toBe(text);
	},
);

it.each(routes)(
	"%s: empty following and trailing members transfer at their accumulated prefixes",
	(route) => {
		const test = fixture(["ab", "", "cd", ""]);
		const empty = test.range(test.ids[1], 0);
		const middle = test.range(test.ids[2], 1);
		const trailing = test.range(test.ids[3], 0);
		const parents = [1, 2, 3, 4].map((offset) =>
			test.range(test.parent, offset),
		);
		const across = test.range(test.ids[1], 0, test.ids[3], 0);
		test.normalize(route);
		expectRange(empty, test.node(test.ids[0]), 2, 2);
		expectRange(middle, test.node(test.ids[0]), 3, 3);
		expectRange(trailing, test.node(test.ids[0]), 4, 4);
		expectRange(parents[0], test.node(test.ids[0]), 2, 2);
		expectRange(parents[1], test.node(test.ids[0]), 2, 2);
		expectRange(parents[2], test.node(test.ids[0]), 4, 4);
		expectRange(parents[3], test.node(test.parent), 1, 1);
		expectRange(across, test.node(test.ids[0]), 2, 4);
		expect(across.toString()).toBe("cd");
	},
);

it.each(routes)(
	"%s: leading empties remove normally while later members and logical parent indices transfer",
	(route) => {
		const test = fixture(["", "", "ab", "cd", ""]);
		const leading = [0, 1].map((index) => test.range(test.ids[index], 0));
		const member = test.range(test.ids[3], 1);
		const trailing = test.range(test.ids[4], 0);
		const parents = [0, 1, 2, 3, 4, 5].map((offset) =>
			test.range(test.parent, offset),
		);
		test.normalize(route);
		for (const range of leading)
			expectRange(range, test.node(test.parent), 0, 0);
		for (const range of parents.slice(0, 3))
			expectRange(range, test.node(test.parent), 0, 0);
		expectRange(member, test.node(test.ids[2]), 3, 3);
		expectRange(trailing, test.node(test.ids[2]), 4, 4);
		expectRange(parents[3], test.node(test.ids[2]), 2, 2);
		expectRange(parents[4], test.node(test.ids[2]), 4, 4);
		expectRange(parents[5], test.node(test.parent), 1, 1);
		expect(test.tree.get(test.parent).children).toEqual([test.ids[2]]);
	},
);

it.each(routes)(
	"%s: all-empty runs have only normal removals and no survivor transfer",
	(route) => {
		const test = fixture(["", "", ""]);
		const members = test.ids.map((id) => test.range(id, 0));
		const parents = [0, 1, 2, 3].map((offset) =>
			test.range(test.parent, offset),
		);
		test.normalize(route);
		for (const range of [...members, ...parents])
			expectRange(range, test.node(test.parent), 0, 0);
		expect(test.tree.get(test.parent).children).toEqual([]);
		expect(test.records.map((record) => record.type)).toEqual([
			"childList",
			"childList",
			"childList",
		]);
		const revision = test.tree.revision;
		test.normalize(route);
		expect(test.tree.revision).toBe(revision);
		expect(test.records).toHaveLength(3);
	},
);

it.each(routes)(
	"%s: surviving singleton ranges and after-run parent boundaries remain no-op controls",
	(route) => {
		const test = fixture(["abcd"]);
		const survivor = test.range(test.ids[0], 1, test.ids[0], 4);
		const parent = test.range(test.parent, 1);
		const revision = test.tree.revision;
		test.normalize(route);
		test.normalize(route);
		expectRange(survivor, test.node(test.ids[0]), 1, 4);
		expectRange(parent, test.node(test.parent), 1, 1);
		expect(test.tree.revision).toBe(revision);
		expect(test.records.map((record) => record.oldValue)).toEqual([
			"abcd",
			"abcd",
		]);
	},
);

it.each(routes)(
	"%s: transfer prefixes and offsets use UTF-16 units across split surrogate members",
	(route) => {
		const test = fixture(["A😀", "\ud83d", "\ude00B"]);
		const high = test.range(test.ids[1], 0, test.ids[1], 1);
		const low = test.range(test.ids[2], 0, test.ids[2], 1);
		const end = test.range(test.ids[2], 2);
		const parents = [1, 2].map((offset) => test.range(test.parent, offset));
		test.normalize(route);
		expect(test.tree.get(test.ids[0]).data).toBe("A😀😀B");
		expectRange(high, test.node(test.ids[0]), 3, 4);
		expectRange(low, test.node(test.ids[0]), 4, 5);
		expectRange(end, test.node(test.ids[0]), 6, 6);
		expectRange(parents[0], test.node(test.ids[0]), 3, 3);
		expectRange(parents[1], test.node(test.ids[0]), 4, 4);
		expect(high.toString()).toBe("\ud83d");
		expect(low.toString()).toBe("\ude00");
	},
);

it.each(
	routes.flatMap((route) =>
		(["element", "document", "fragment"] as const).map((receiver) => ({
			route,
			receiver,
		})),
	),
)(
	"$route: transfers ordinary ranges in detached $receiver receiver scope",
	({ route, receiver }) => {
		const test = fixture(undefined, receiver, false);
		const range = test.range(test.ids[1], 1, test.ids[2], 1);
		const parent = test.range(test.parent, 2);
		test.normalize(route);
		expectRange(range, test.node(test.ids[0]), 3, 6);
		expectRange(parent, test.node(test.ids[0]), 5, 5);
		expect(test.tree.get(test.ids[1]).parent).toBeNull();
		expect(test.tree.get(test.ids[1]).data).toBe("cde");
		expect(test.tree.get(test.ids[2]).data).toBe("f");
	},
);

it.each(routes)(
	"%s: multiple runs and nested elements keep independent member and parent indices",
	(route) => {
		const test = fixture(["ab", "cd"]);
		const comment = test.tree.createComment("barrier");
		const second = test.tree.createText("EF");
		const secondTail = test.tree.createText("GH");
		const nestedParent = test.tree.createElement("b");
		const nested = test.tree.createText("ij");
		const nestedTail = test.tree.createText("kl");
		const last = test.tree.createText("MN");
		const lastTail = test.tree.createText("OP");
		for (const id of [
			comment,
			second,
			secondTail,
			nestedParent,
			last,
			lastTail,
		])
			test.tree.append(test.parent, id);
		for (const id of [nested, nestedTail]) test.tree.append(nestedParent, id);
		const members = [test.ids[1], secondTail, nestedTail, lastTail].map((id) =>
			test.range(id, 0, id, 2),
		);
		const parents = [1, 4, 7].map((offset) => test.range(test.parent, offset));
		const nestedBoundary = test.range(nestedParent, 1);
		const afterFirst = test.range(test.parent, 2);
		const afterAll = test.range(test.parent, 8);
		test.normalize(route);
		for (const [index, id] of [test.ids[0], second, nested, last].entries())
			expectRange(members[index], test.node(id), 2, 4);
		for (const [index, id] of [test.ids[0], second, last].entries())
			expectRange(parents[index], test.node(id), 2, 2);
		expectRange(nestedBoundary, test.node(nested), 2, 2);
		expectRange(afterFirst, test.node(test.parent), 1, 1);
		expectRange(afterAll, test.node(test.parent), 5, 5);
		expect(test.tree.get(test.parent).children).toEqual([
			test.ids[0],
			comment,
			second,
			nestedParent,
			last,
		]);
	},
);

it.each(routes)(
	"%s: normalizing one subtree leaves outside adjacent members and their ranges untouched",
	(route) => {
		const test = fixture(["out", "side"]);
		const target = test.tree.createElement("b");
		const survivor = test.tree.createText("ab");
		const member = test.tree.createText("cd");
		test.tree.append(test.parent, target);
		test.tree.append(target, survivor);
		test.tree.append(target, member);
		const outside = test.range(test.ids[1], 1, test.ids[1], 3);
		const inside = test.range(member, 1, member, 2);
		test.normalize(route, target);
		expectRange(outside, test.node(test.ids[1]), 1, 3);
		expectRange(inside, test.node(survivor), 3, 4);
		expect(test.tree.get(test.parent).children).toEqual([...test.ids, target]);
	},
);

it.each(routes)(
	"%s: a text-node receiver does not normalize or transfer its siblings",
	(route) => {
		const test = fixture();
		const member = test.range(test.ids[1], 1, test.ids[1], 3);
		const parent = test.range(test.parent, 1);
		const revision = test.tree.revision;
		test.normalize(route, test.ids[1]);
		expectRange(member, test.node(test.ids[1]), 1, 3);
		expectRange(parent, test.node(test.parent), 1, 1);
		expect(test.tree.revision).toBe(revision);
		expect(test.records).toEqual([]);
	},
);

it.each(routes)(
	"%s: ranges created on detached following text transfer after late ordinary attachment",
	(route) => {
		const test = fixture([]);
		const survivor = test.tree.createText("ab");
		const member = test.tree.createText("cd");
		const range = test.range(member, 1, member, 2);
		const clone = range.cloneRange();
		test.tree.append(test.parent, survivor);
		test.tree.append(test.parent, member);
		test.normalize(route);
		expectRange(range, test.node(survivor), 3, 4);
		expectRange(clone, test.node(survivor), 3, 4);
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

function expectFrozenMetadata(value: unknown) {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const nested of Object.values(value)) expectFrozenMetadata(nested);
}

it.each(routes)(
	"%s: raw payload and order remain invariant while private edit metadata is deeply immutable",
	(route) => {
		const test = fixture(["", "ab", "", "cd"]);
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
				target: test.parent,
				ancestors: [test.parent, test.tree.root],
				removedNodes: [leading],
				previousSibling: null,
				nextSibling: survivor,
				oldValue: null,
			},
			{
				...common,
				type: "characterData",
				target: survivor,
				ancestors: [survivor, test.parent, test.tree.root],
				removedNodes: [],
				previousSibling: null,
				nextSibling: null,
				oldValue: "ab",
			},
			{
				...common,
				type: "childList",
				target: test.parent,
				ancestors: [test.parent, test.tree.root],
				removedNodes: [empty],
				previousSibling: survivor,
				nextSibling: tail,
				oldValue: null,
			},
			{
				...common,
				type: "childList",
				target: test.parent,
				ancestors: [test.parent, test.tree.root],
				removedNodes: [tail],
				previousSibling: survivor,
				nextSibling: null,
				oldValue: null,
			},
		]);
		for (const record of test.records) {
			expect(Reflect.ownKeys(record).sort()).toEqual(rawKeys);
			expect(Object.isFrozen(record)).toBe(true);
			expect(
				Reflect.defineProperty(record, "normalization", { value: "forged" }),
			).toBe(false);
			for (const list of [
				record.ancestors,
				record.addedNodes,
				record.removedNodes,
			])
				expect(Object.isFrozen(list)).toBe(true);
		}
		const edit = documentCharacterDataEdit(test.records[1]);
		expect(edit).toMatchObject({ offset: 2, count: 0, length: 2 });
		expectFrozenMetadata(edit);
		if (!edit) throw new Error("Missing append metadata");
		expect(Reflect.set(edit, "offset", 99)).toBe(false);
		expect(Reflect.set(edit, "normalization", "forged")).toBe(false);
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
	observer.observe(test.node(test.parent), {
		subtree: true,
		childList: true,
		characterData: true,
		characterDataOldValue: true,
	});
	return { bindings, callback, observer };
}

it.each(routes)(
	"%s: queued observer callbacks see final transfers and repeated normalization preserves them",
	async (route) => {
		const test = fixture(["ab", "cd"]);
		const range = test.range(test.ids[1], 1, test.ids[1], 2);
		const { bindings, callback, observer } = observerFixture(test);
		const snapshots: (number | boolean)[][] = [];
		callback.mockImplementation(() =>
			snapshots.push([
				range.startContainer === test.node(test.ids[0]),
				range.startOffset,
				range.endContainer === test.node(test.ids[0]),
				range.endOffset,
			]),
		);
		test.normalize(route);
		test.normalize(route);
		expect(callback).not.toHaveBeenCalled();
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
		expect(callback.mock.contexts[0] === observer).toBe(true);
		const records = callback.mock.calls[0][0] as readonly MutationRecord[];
		expect(records.map((record) => [record.type, record.oldValue])).toEqual([
			["characterData", "ab"],
			["childList", null],
			["characterData", "abcd"],
		]);
		expect(records[0].target === test.node(test.ids[0])).toBe(true);
		expect(records[1].removedNodes.item(0) === test.node(test.ids[1])).toBe(
			true,
		);
		for (const record of records)
			expect(Reflect.ownKeys(record).sort()).toEqual(
				rawKeys.filter((key) => key !== "ancestors"),
			);
		expect(Object.isFrozen(records)).toBe(true);
		expect(snapshots).toEqual([[true, 3, true, 4]]);
		expectRange(range, test.node(test.ids[0]), 3, 4);
		expect(observer.takeRecords()).toEqual([]);
		observer.disconnect();
		await bindings.checkpoint();
		expect(callback).toHaveBeenCalledOnce();
	},
);

it.each(routes)(
	"%s: failed text-budget preflight leaves member/parent ranges and all records unchanged",
	(route) => {
		const test = fixture(["ab", "cd"], "document", true, {
			maxTextCodeUnits: 4,
		});
		const member = test.range(test.ids[1], 1, test.ids[1], 2);
		const parent = test.range(test.parent, 1);
		const revision = test.tree.revision;
		expect(() => test.normalize(route)).toThrow(/text limit/);
		expectRange(member, test.node(test.ids[1]), 1, 2);
		expectRange(parent, test.node(test.parent), 1, 1);
		expect(test.tree.get(test.parent).children).toEqual(test.ids);
		expect(test.tree.get(test.ids[0]).data).toBe("ab");
		expect(test.records).toEqual([]);
		expect(test.tree.revision).toBe(revision);
	},
);

it.each(routes)(
	"%s: bounded 128-member runs transfer all member/parent offsets without allocating nodes",
	(route) => {
		const test = fixture(
			Array.from({ length: 128 }, () => "xy"),
			"document",
			true,
			{ maxNodes: 129, maxTextCodeUnits: 510 },
		);
		const members = test.ids.map((id) => test.range(id, 1, id, 2));
		const parents = Array.from({ length: 127 }, (_value, index) =>
			test.range(test.parent, index + 1),
		);
		const after = test.range(test.parent, 128);
		const clone = members[127].cloneRange();
		test.normalize(route);
		expect(test.tree.nodeCount).toBe(129);
		expect(test.tree.get(test.parent).children).toEqual([test.ids[0]]);
		expect(test.tree.get(test.ids[0]).data).toBe("xy".repeat(128));
		for (const [index, range] of members.entries())
			expectRange(range, test.node(test.ids[0]), index * 2 + 1, index * 2 + 2);
		for (const [index, range] of parents.entries())
			expectRange(
				range,
				test.node(test.ids[0]),
				(index + 1) * 2,
				(index + 1) * 2,
			);
		expectRange(after, test.node(test.parent), 1, 1);
		expectRange(clone, test.node(test.ids[0]), 255, 256);
	},
);

it.each(["binding", "document"] as const)(
	"%s closure revokes transferred range/observer capabilities without queued delivery",
	async (lifetime) => {
		const test = fixture(["ab", "cd"]);
		const range = test.range(test.ids[1], 1, test.ids[1], 2);
		const { bindings, callback, observer } = observerFixture(test);
		test.normalize("native");
		if (lifetime === "binding") test.dom.close();
		else test.tree.close();
		expect(() => range.startContainer).toThrow(/closed/);
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
