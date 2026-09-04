import { afterEach, expect, it } from "vitest";
import { DocumentObservers } from "./document-observers.js";
import { DocumentTree } from "./document.js";
import {
	ScriptMutationRecords,
	type ScriptMutationRecordLimits,
} from "./script-mutation-records.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
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

function fixture() {
	const tree = new DocumentTree("https://fixture.invalid/");
	trees.push(tree);
	const parent = tree.createElement("main");
	tree.append(tree.root, parent);
	const dom = new ScriptDom(tree, { createHostObject: hostObject });
	const observers = new DocumentObservers(tree);
	const observer = observers.create();
	observers.observe(observer, parent, {
		childList: true,
		attributeOldValue: true,
		characterDataOldValue: true,
		subtree: true,
	});
	return { tree, parent, dom, observers, observer };
}

interface RecordView {
	type: string;
	target: object;
	oldValue: string | null;
	attributeName: string | null;
	attributeNamespace: null;
	previousSibling: object | null;
	nextSibling: object | null;
	addedNodes: ListView;
	removedNodes: ListView;
}
interface ListView {
	[index: number]: object | undefined;
	length: number;
	item(...args: unknown[]): object | null;
}

it("maps native record IDs to the same ScriptDom node capabilities", () => {
	const { tree, parent, dom, observers, observer } = fixture();
	const child = tree.createElement("section");
	tree.append(parent, child);
	const [record] = dom.mutationRecords(
		observers.takeRecords(observer),
	) as readonly RecordView[];
	expect(record.type).toBe("childList");
	expect(record.target).toBe(dom.node(parent));
	expect(record.addedNodes.item(0)).toBe(dom.node(child));
	expect(record.addedNodes).toBe(record.addedNodes);
	expect(record.removedNodes.length).toBe(0);
});

function recordFixture(
	limits: Partial<ScriptMutationRecordLimits> = {},
	createHostObject = hostObject,
) {
	const test = fixture();
	test.tree.setAttribute(test.parent, "id", "first");
	const records = test.observers.takeRecords(test.observer);
	const owner = new ScriptMutationRecords(
		test.tree,
		{ createHostObject },
		(id) => test.dom.node(id),
		limits,
	);
	return { ...test, records, owner };
}

it("preserves old strings and null fields without exposing internal IDs", () => {
	const { tree, parent, dom, observers, observer } = fixture();
	tree.setAttribute(parent, "title", "first");
	tree.setAttribute(parent, "title", "second");
	const records = dom.mutationRecords(
		observers.takeRecords(observer),
	) as readonly RecordView[];
	expect(Object.isFrozen(records)).toBe(true);
	expect(records[0].oldValue).toBeNull();
	expect(records[1].oldValue).toBe("first");
	expect(records[1].attributeName).toBe("title");
	expect(records[1].attributeNamespace).toBeNull();
	expect(records[1].previousSibling).toBeNull();
	expect(records[1].nextSibling).toBeNull();
	expect(records[1]).not.toHaveProperty("ancestors");
	expect(records[1]).not.toHaveProperty("id");
	expect(() => {
		records[1].oldValue = "changed";
	}).toThrow();
});

it("keeps static node lists and logical sibling identities after later mutations", () => {
	const { tree, parent, dom, observers, observer } = fixture();
	const first = tree.createElement("a");
	const middle = tree.createText("middle");
	const last = tree.createElement("b");
	for (const child of [first, middle, last]) tree.append(parent, child);
	observers.takeRecords(observer);
	tree.remove(middle);
	const [record] = dom.mutationRecords(
		observers.takeRecords(observer),
	) as readonly RecordView[];
	const list = record.removedNodes;
	tree.remove(first);
	tree.remove(last);
	tree.append(parent, middle);
	expect(record.previousSibling).toBe(dom.node(first));
	expect(record.nextSibling).toBe(dom.node(last));
	expect(list.length).toBe(1);
	expect(list[0]).toBe(dom.node(middle));
	expect(list[1]).toBeUndefined();
	expect(list.item(1)).toBeNull();
	expect(record.removedNodes).toBe(list);
	expect(record.addedNodes).not.toBe(list);
});

it("preserves character data old values on detached text capabilities", () => {
	const { tree, parent, dom, observers, observer } = fixture();
	const text = tree.createText("before");
	tree.append(parent, text);
	observers.takeRecords(observer);
	tree.setData(text, "after");
	const [record] = dom.mutationRecords(
		observers.takeRecords(observer),
	) as readonly RecordView[];
	tree.remove(text);
	expect(record.type).toBe("characterData");
	expect(record.oldValue).toBe("before");
	expect(record.target).toBe(dom.node(text));
	expect(record.attributeName).toBeNull();
});

it("allocates each record independently and lazily creates at most two lists", () => {
	const { owner, records } = recordFixture();
	const first = owner.wrap(records) as readonly RecordView[];
	const second = owner.wrap(records) as readonly RecordView[];
	expect(first[0]).not.toBe(second[0]);
	expect(owner.metrics()).toMatchObject({ records: 2, capabilities: 2 });
	const added = first[0].addedNodes;
	const removed = first[0].removedNodes;
	expect(first[0].addedNodes).toBe(added);
	expect(first[0].removedNodes).toBe(removed);
	expect(owner.metrics()).toMatchObject({ records: 2, capabilities: 4 });
	expect(second[0].addedNodes).not.toBe(added);
});

it.each([
	0,
	0.9,
	null,
	false,
	undefined,
	"0",
	Number.NaN,
	Number.POSITIVE_INFINITY,
	4_294_967_296,
])("converts primitive item index %s to zero", (value) => {
	const { tree, parent, dom, observers, observer } = fixture();
	const child = tree.createText("child");
	tree.append(parent, child);
	const [record] = dom.mutationRecords(
		observers.takeRecords(observer),
	) as readonly RecordView[];
	expect(record.addedNodes.item(value)).toBe(dom.node(child));
});

it.each([-1, 1, true, "2", 4_294_967_295])(
	"returns null for out-of-range item index %s",
	(value) => {
		const { tree, parent, dom, observers, observer } = fixture();
		tree.append(parent, tree.createText("child"));
		const [record] = dom.mutationRecords(
			observers.takeRecords(observer),
		) as readonly RecordView[];
		expect(record.addedNodes.item(value)).toBeNull();
	},
);

it("requires an item argument and never invokes object coercion", () => {
	const { owner, records } = recordFixture();
	const [record] = owner.wrap(records) as readonly RecordView[];
	const list = record.addedNodes;
	let calls = 0;
	expect(() => list.item()).toThrow(TypeError);
	expect(() =>
		list.item({
			valueOf() {
				calls++;
				return 0;
			},
		}),
	).toThrow(TypeError);
	expect(calls).toBe(0);
	for (const value of [1n, Symbol("index"), () => 0])
		expect(() => list.item(value)).toThrow(TypeError);
	expect(() => list.item("0".repeat(4097))).toThrow(/limit/);
	expect(owner.metrics().closed).toBe(false);
});

it("bounds issued records across batches instead of reclaiming them after delivery", () => {
	let calls = 0;
	const { owner, records } = recordFixture({ maxRecords: 1 }, (definition) => {
		calls++;
		return hostObject(definition);
	});
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => owner.wrap(records)).toThrow(/limit/);
	expect(calls).toBe(1);
	expect(record.type).toBe("attributes");
	expect(owner.metrics()).toMatchObject({ records: 1, closed: false });
});

it.each([{ maxCodeUnits: 1 }, { maxNodeReferences: 1 }, { maxRecords: 1 }])(
	"preflights an entire batch before capability allocation: %j",
	(limits) => {
		let calls = 0;
		const { owner, records } = recordFixture(limits, (definition) => {
			calls++;
			return hostObject(definition);
		});
		expect(() => owner.wrap([...records, ...records])).toThrow(/limit/);
		expect(calls).toBe(0);
		expect(owner.metrics()).toEqual({
			records: 0,
			codeUnits: 0,
			nodeReferences: 0,
			capabilities: 0,
			closed: false,
		});
	},
);

it("accounts for old strings, names, targets, siblings and list IDs", () => {
	const { owner, parent, records } = recordFixture();
	owner.wrap([
		{
			...records[0],
			oldValue: "😀",
			addedNodes: [parent],
			removedNodes: [parent],
			previousSibling: parent,
			nextSibling: parent,
		},
	]);
	expect(owner.metrics()).toMatchObject({
		records: 1,
		codeUnits: 4,
		nodeReferences: 5,
	});
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	"rejects invalid retention limits: %s",
	(maxRecords) => {
		expect(() => recordFixture({ maxRecords })).toThrow(/Invalid/);
	},
);

it("rejects cross-document IDs before allocating any part of the batch", () => {
	let calls = 0;
	const { owner, records } = recordFixture({}, (definition) => {
		calls++;
		return hostObject(definition);
	});
	const other = fixture();
	expect(() =>
		owner.wrap([...records, { ...records[0], target: other.parent }]),
	).toThrow(/Unknown/);
	expect(calls).toBe(0);
	expect(owner.metrics().records).toBe(0);
});

it.each([
	"addedNodes",
	"removedNodes",
	"previousSibling",
	"nextSibling",
] as const)("validates every %s reference before materialization", (name) => {
	const { owner, records } = recordFixture();
	const value = name === "addedNodes" || name === "removedNodes" ? [-1] : -1;
	expect(() => owner.wrap([{ ...records[0], [name]: value }])).toThrow(
		/Unknown/,
	);
	expect(owner.metrics().records).toBe(0);
});

it("copies input fields and node lists before returning capabilities", () => {
	const { owner, parent, records } = recordFixture();
	const input = { ...records[0], addedNodes: [parent] };
	const [record] = owner.wrap([input]) as readonly RecordView[];
	input.addedNodes.length = 0;
	input.oldValue = "changed";
	expect(record.addedNodes.length).toBe(1);
	expect(record.oldValue).toBeNull();
});

it("snapshots every batch member before a factory can mutate later inputs", () => {
	let mutate = () => {};
	const { owner, records } = recordFixture(
		{ maxCodeUnits: 4 },
		(definition) => {
			mutate();
			return hostObject(definition);
		},
	);
	const input = records.map((record) => ({ ...record }));
	input.push({ ...input[0] });
	mutate = () => {
		input[1].oldValue = "unbudgeted later payload";
	};
	const result = owner.wrap(input) as readonly RecordView[];
	expect(result[1].oldValue).toBeNull();
	expect(owner.metrics().codeUnits).toBe(4);
});

it("reserves batch admission before reentering capability creation", () => {
	let reenter = () => {};
	const { owner, records } = recordFixture({ maxRecords: 1 }, (definition) => {
		reenter();
		return hostObject(definition);
	});
	reenter = () => {
		expect(() => owner.wrap(records)).toThrow(/limit/);
	};
	expect(owner.wrap(records)).toHaveLength(1);
	expect(owner.metrics()).toMatchObject({ records: 1, closed: false });
});

it.each(["document", "script document"])(
	"revokes record and list access on %s closure",
	(source) => {
		const { tree, parent, dom, observers, observer } = fixture();
		tree.append(parent, tree.createText("child"));
		const [record] = dom.mutationRecords(
			observers.takeRecords(observer),
		) as readonly RecordView[];
		const list = record.addedNodes;
		if (source === "document") tree.close();
		else dom.close();
		expect(() => record.type).toThrow(/closed/);
		expect(() => record.target).toThrow(/closed/);
		expect(() => record.addedNodes).toThrow(/closed/);
		expect(() => list.length).toThrow(/closed/);
		expect(() => list[0]).toThrow(/closed/);
		expect(() => list.item(0)).toThrow(/closed/);
		expect(() => dom.mutationRecords([])).toThrow(/closed/);
	},
);

it("close clears retained payload metrics and is idempotent", () => {
	const { owner, records } = recordFixture();
	const [record] = owner.wrap(records) as readonly RecordView[];
	const list = record.removedNodes;
	owner.close();
	owner.close();
	expect(owner.metrics()).toEqual({
		records: 0,
		codeUnits: 0,
		nodeReferences: 0,
		capabilities: 0,
		closed: true,
	});
	expect(() => list.length).toThrow(/closed/);
	expect(() => owner.wrap([])).toThrow(/closed/);
});

it("revokes earlier capabilities after a partial factory failure", () => {
	let calls = 0;
	const { owner, records } = recordFixture({}, (definition) => {
		if (++calls === 2) throw new Error("factory failed");
		return hostObject(definition);
	});
	const [first] = owner.wrap(records) as readonly RecordView[];
	expect(() => owner.wrap(records)).toThrow("factory failed");
	expect(() => first.type).toThrow(/closed/);
	expect(owner.metrics()).toMatchObject({ records: 0, closed: true });
});

it("revokes the owner when a lazy list factory fails", () => {
	const { owner, records } = recordFixture({}, (definition) => {
		if (definition.indexed) throw new Error("list failed");
		return hostObject(definition);
	});
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => record.addedNodes).toThrow("list failed");
	expect(() => record.type).toThrow(/closed/);
});

it("rejects invalid or reused factory capability identities", () => {
	const shared = {};
	const { owner, records } = recordFixture({}, () => shared);
	owner.wrap(records);
	expect(() => owner.wrap(records)).toThrow(/Invalid/);
	expect(owner.metrics().closed).toBe(true);
	const other = recordFixture({}, () => null as unknown as object);
	expect(() => other.owner.wrap(other.records)).toThrow(/Invalid/);
	expect(other.owner.metrics().closed).toBe(true);
});

it("does not publish a capability after reentrant closure", () => {
	let close = () => {};
	const { owner, records } = recordFixture({}, (definition) => {
		close();
		return hostObject(definition);
	});
	close = () => owner.close();
	expect(() => owner.wrap(records)).toThrow(/closed/);
	expect(owner.metrics().capabilities).toBe(0);
});

it("rejects recursive lazy-list construction without retaining partial state", () => {
	const { owner, records } = recordFixture({}, (definition) => {
		if (definition.indexed) return record.addedNodes;
		return hostObject(definition);
	});
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => record.addedNodes).toThrow(/Reentrant/);
	expect(owner.metrics()).toMatchObject({
		records: 0,
		capabilities: 0,
		closed: true,
	});
});

it("preserves observer queues and DOM semantics when merely wrapping drained records", () => {
	const { tree, parent, dom, observers, observer } = fixture();
	tree.setAttribute(parent, "id", "before");
	const revision = tree.revision;
	dom.mutationRecords(observers.takeRecords(observer));
	expect(tree.revision).toBe(revision);
	expect(observers.takeRecords(observer)).toEqual([]);
	tree.setAttribute(parent, "id", "after");
	expect(observers.takeRecords(observer)).toHaveLength(1);
});

it("does not return a node capability after the resolver closes its owner", () => {
	const { tree, records } = recordFixture();
	let revoke = () => {};
	const owner = new ScriptMutationRecords(
		tree,
		{ createHostObject: hostObject },
		() => {
			revoke();
			return {};
		},
	);
	revoke = () => owner.close();
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => record.target).toThrow(/closed/);
});

it("revokes record access after node resolver failure", () => {
	const { tree, records } = recordFixture();
	const owner = new ScriptMutationRecords(
		tree,
		{ createHostObject: hostObject },
		() => {
			throw new Error("node provider failed");
		},
	);
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => record.target).toThrow("node provider failed");
	expect(() => record.type).toThrow(/closed/);
});

it("rejects invalid node resolver results instead of leaking primitives", () => {
	const { tree, records } = recordFixture();
	const owner = new ScriptMutationRecords(
		tree,
		{ createHostObject: hostObject },
		() => 123 as unknown as object,
	);
	const [record] = owner.wrap(records) as readonly RecordView[];
	expect(() => record.target).toThrow(/Invalid/);
	expect(owner.metrics().closed).toBe(true);
});
