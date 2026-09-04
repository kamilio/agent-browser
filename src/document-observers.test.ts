import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import {
	DocumentObservers,
	type DocumentObserverOptions,
} from "./document-observers.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	limits: ConstructorParameters<typeof DocumentObservers>[1] = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/");
	trees.push(tree);
	const parent = tree.createElement("main");
	const child = tree.createElement("section");
	const text = tree.createText("before");
	tree.append(tree.root, parent);
	tree.append(parent, child);
	tree.append(child, text);
	const owner = new DocumentObservers(tree, limits);
	const observer = owner.create();
	return { tree, parent, child, text, owner, observer };
}

it("captures filtered records without native callback delivery", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, {
		attributeFilter: ["title"],
		subtree: true,
	});
	tree.setAttribute(child, "id", "ignored");
	tree.setAttribute(child, "title", "first");
	tree.setAttribute(child, "title", "second");
	expect(owner.takeRecords(observer)).toMatchObject([
		{ target: child, attributeName: "title", oldValue: null },
		{ target: child, attributeName: "title", oldValue: null },
	]);
	expect(owner.takeRecords(observer)).toEqual([]);
});

it("keeps observing removed descendants until notification", () => {
	const { tree, parent, child, text, owner, observer } = fixture();
	owner.observe(observer, parent, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	tree.remove(child);
	tree.setData(text, "detached");
	expect(owner.beginDelivery()).toBe(true);
	expect(owner.nextDelivery()?.records).toMatchObject([
		{ type: "childList", removedNodes: [child] },
		{ type: "characterData", target: text },
	]);
	expect(owner.nextDelivery()).toBeNull();
	tree.setData(text, "not observed");
	expect(owner.takeRecords(observer)).toEqual([]);
});

it("surfaces queue overflow without interrupting a document mutation", () => {
	const { tree, parent, owner, observer } = fixture({
		maxRecordsPerObserver: 1,
	});
	owner.observe(observer, parent, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	expect(() => tree.setAttribute(parent, "title", "second")).not.toThrow();
	expect(owner.metrics()).toMatchObject({ failed: true, records: 0 });
	expect(() => owner.takeRecords(observer)).toThrow(/limit/);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it.each([
	{},
	{ subtree: true },
	{ attributes: false, attributeOldValue: true, childList: true },
	{ attributes: false, attributeFilter: [], childList: true },
	{ characterData: false, characterDataOldValue: true, childList: true },
])("rejects inconsistent options atomically: %j", (options) => {
	const { tree, parent, owner, observer } = fixture();
	owner.observe(observer, parent, { attributes: true });
	expect(() => owner.observe(observer, parent, options)).toThrow(TypeError);
	tree.setAttribute(parent, "title", "still observed");
	expect(owner.takeRecords(observer)).toHaveLength(1);
	expect(owner.metrics().registrations).toBe(1);
});

it.each(["attributeOldValue", "characterDataOldValue"] as const)(
	"enables the mutation type when %s is explicitly false",
	(option) => {
		const { tree, parent, text, owner, observer } = fixture();
		owner.observe(observer, parent, { [option]: false, subtree: true });
		tree.setAttribute(parent, "title", "value");
		tree.setData(text, "after");
		expect(owner.takeRecords(observer)).toMatchObject([
			{
				type: option === "attributeOldValue" ? "attributes" : "characterData",
				oldValue: null,
			},
		]);
	},
);

it.each([
	"childList",
	"attributes",
	"characterData",
	"subtree",
	"attributeOldValue",
	"characterDataOldValue",
] as const)("requires already-converted native boolean %s", (option) => {
	const { parent, owner, observer } = fixture();
	expect(() =>
		owner.observe(observer, parent, {
			attributes: true,
			[option]: 1,
		} as DocumentObserverOptions),
	).toThrow(TypeError);
	expect(owner.metrics().registrations).toBe(0);
});

it.each([
	null,
	1,
	"title",
	{ attributes: true, attributeFilter: "title" },
	{ attributeFilter: [1] },
])("rejects unsupported native option values: %j", (options) => {
	const { parent, owner, observer } = fixture();
	expect(() =>
		owner.observe(observer, parent, options as DocumentObserverOptions),
	).toThrow(TypeError);
});

it("copies filters without case folding and treats an empty filter as matching nothing", () => {
	const { tree, parent, owner, observer } = fixture();
	const filter = ["title", "title", "ID"];
	owner.observe(observer, parent, { attributeFilter: filter });
	filter[0] = "id";
	tree.setAttribute(parent, "TITLE", "yes");
	tree.setAttribute(parent, "id", "no");
	expect(owner.takeRecords(observer)).toMatchObject([
		{ attributeName: "title" },
	]);
	owner.observe(observer, parent, { attributeFilter: [] });
	tree.setAttribute(parent, "title", "ignored");
	expect(owner.takeRecords(observer)).toEqual([]);
});

it("defaults to target-only observation for each mutation type", () => {
	const { tree, parent, child, text, owner, observer } = fixture();
	owner.observe(observer, parent, {
		childList: true,
		attributes: true,
		characterData: true,
	});
	tree.setAttribute(child, "title", "ignored");
	tree.setData(text, "ignored");
	tree.append(child, tree.createText("ignored"));
	tree.setAttribute(parent, "title", "observed");
	tree.remove(child);
	expect(owner.takeRecords(observer).map((record) => record.type)).toEqual([
		"attributes",
		"childList",
	]);
});

it("observes detached text directly and retains requested old strings", () => {
	const { tree, text, owner, observer } = fixture();
	tree.remove(text);
	owner.observe(observer, text, { characterDataOldValue: true });
	tree.setData(text, "after");
	tree.setData(text, "after");
	expect(owner.takeRecords(observer)).toMatchObject([
		{ target: text, oldValue: "before" },
		{ target: text, oldValue: "after" },
	]);
});

it.each([true, false])(
	"deduplicates overlapping registrations and unions old-value requests (%s)",
	(reverse) => {
		const { tree, parent, child, owner, observer } = fixture();
		const registrations = [parent, child];
		if (reverse) registrations.reverse();
		for (const target of registrations)
			owner.observe(observer, target, {
				attributes: true,
				subtree: true,
				attributeOldValue: target === parent,
			});
		tree.setAttribute(child, "title", "first");
		tree.setAttribute(child, "title", "second");
		expect(owner.takeRecords(observer)).toMatchObject([
			{ oldValue: null },
			{ oldValue: "first" },
		]);
	},
);

it("does not leak old values through a nonmatching registration", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, {
		subtree: true,
		attributeFilter: ["id"],
		attributeOldValue: true,
	});
	owner.observe(observer, child, { attributes: true });
	tree.setAttribute(child, "title", "secret");
	tree.setAttribute(child, "title", "next");
	expect(owner.takeRecords(observer).map((record) => record.oldValue)).toEqual([
		null,
		null,
	]);
});

it("reobservation replaces options without rewriting queued records", () => {
	const { tree, parent, owner, observer } = fixture();
	owner.observe(observer, parent, { attributeOldValue: true });
	tree.setAttribute(parent, "title", "first");
	tree.setAttribute(parent, "title", "second");
	owner.observe(observer, parent, { childList: true });
	tree.setAttribute(parent, "title", "ignored");
	tree.append(parent, tree.createText("added"));
	expect(owner.takeRecords(observer)).toMatchObject([
		{ type: "attributes", oldValue: null },
		{ type: "attributes", oldValue: "first" },
		{ type: "childList" },
	]);
	expect(owner.metrics().registrations).toBe(1);
});

it("preserves removal tracking when childList is disabled", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, { attributes: true, subtree: true });
	tree.remove(child);
	expect(owner.takeRecords(observer)).toEqual([]);
	expect(owner.hasPending()).toBe(false);
	expect(owner.metrics().registrations).toBe(2);
	tree.setAttribute(child, "title", "detached");
	expect(owner.hasPending()).toBe(true);
	owner.beginDelivery();
	expect(owner.nextDelivery()?.records).toMatchObject([{ target: child }]);
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.metrics().registrations).toBe(1);
});

it("tracks repeated removals within a detached subtree", () => {
	const { tree, parent, child, text, owner, observer } = fixture();
	owner.observe(observer, parent, { characterData: true, subtree: true });
	tree.remove(child);
	tree.remove(text);
	tree.setData(text, "twice detached");
	expect(owner.takeRecords(observer)).toMatchObject([{ target: text }]);
	expect(owner.metrics().registrations).toBe(3);
	owner.beginDelivery();
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.metrics().registrations).toBe(1);
});

it("takeRecords does not discard pending notification or transient registrations", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, {
		childList: true,
		attributes: true,
		subtree: true,
	});
	tree.remove(child);
	expect(owner.takeRecords(observer)).toHaveLength(1);
	expect(owner.hasPending()).toBe(true);
	tree.setAttribute(child, "title", "after drain");
	expect(owner.takeRecords(observer)).toHaveLength(1);
	owner.beginDelivery();
	expect(owner.nextDelivery()).toBeNull();
	tree.setAttribute(child, "title", "after notification");
	expect(owner.takeRecords(observer)).toEqual([]);
});

it("reobservation removes only transients sourced from the updated registration", () => {
	const { tree, parent, child, text, owner, observer } = fixture();
	owner.observe(observer, parent, { characterData: true, subtree: true });
	owner.observe(observer, child, { characterData: true, subtree: true });
	tree.remove(child);
	tree.remove(text);
	owner.observe(observer, parent, { childList: true });
	tree.setData(text, "still observed by child and its transient");
	expect(owner.takeRecords(observer)).toHaveLength(1);
	owner.disconnect(observer);
	expect(owner.metrics().registrations).toBe(0);
});

it("invalid reobservation preserves transients", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, { attributes: true, subtree: true });
	tree.remove(child);
	expect(() => owner.observe(observer, parent, {})).toThrow(TypeError);
	tree.setAttribute(child, "title", "observed");
	expect(owner.takeRecords(observer)).toHaveLength(1);
});

it.each(["replaceChildren", "textContent", "replace"])(
	"tracks descendants detached through %s",
	(operation) => {
		const { tree, parent, child, text, owner, observer } = fixture();
		owner.observe(observer, parent, { characterData: true, subtree: true });
		if (operation === "replaceChildren") tree.replaceChildren(parent);
		else if (operation === "textContent")
			tree.setTextContent(parent, "replacement");
		else tree.replace(parent, tree.createText("replacement"), child);
		tree.setData(text, "observed");
		expect(owner.takeRecords(observer)).toMatchObject([{ target: text }]);
	},
);

it("preserves an explicit detached registration after transient cleanup", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, child, { attributes: true });
	owner.observe(observer, parent, { childList: true, subtree: true });
	tree.remove(child);
	owner.beginDelivery();
	expect(owner.nextDelivery()?.records).toHaveLength(1);
	expect(owner.nextDelivery()).toBeNull();
	tree.setAttribute(child, "title", "still observed");
	expect(owner.takeRecords(observer)).toHaveLength(1);
});

it("clears registrations and queued payloads on disconnect, and permits reuse", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, {
		childList: true,
		attributes: true,
		subtree: true,
	});
	tree.remove(child);
	owner.disconnect(observer);
	owner.disconnect(observer);
	expect(owner.metrics()).toMatchObject({
		observers: 1,
		registrations: 0,
		records: 0,
		codeUnits: 0,
		nodeReferences: 0,
	});
	tree.setAttribute(child, "title", "not observed");
	owner.observe(observer, child, { attributes: true });
	tree.setAttribute(child, "title", "observed again");
	owner.beginDelivery();
	expect(owner.nextDelivery()?.records).toHaveLength(1);
	expect(owner.nextDelivery()).toBeNull();
});

it("delivers in first-enqueue order, using target-to-ancestor registration order", () => {
	const { tree, parent, child, owner, observer } = fixture();
	const second = owner.create();
	owner.observe(observer, parent, { attributes: true, subtree: true });
	owner.observe(second, child, { attributes: true });
	tree.setAttribute(child, "title", "value");
	owner.beginDelivery();
	expect(owner.nextDelivery()?.observer).toBe(second);
	expect(owner.nextDelivery()?.observer).toBe(observer);
	expect(owner.nextDelivery()).toBeNull();
});

it("drains each observer immediately before its delivery, not all at checkpoint start", () => {
	const { tree, parent, owner, observer } = fixture();
	const second = owner.create();
	owner.observe(observer, parent, { attributes: true });
	owner.observe(second, parent, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	owner.beginDelivery();
	expect(owner.nextDelivery()?.records).toHaveLength(1);
	tree.setAttribute(parent, "title", "during first callback");
	expect(owner.nextDelivery()).toMatchObject({
		observer: second,
		records: [{}, {}],
	});
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.beginDelivery()).toBe(true);
	expect(owner.nextDelivery()).toMatchObject({ observer, records: [{}] });
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.hasPending()).toBe(false);
});

it("does not add newly pending observers to the active notification set", () => {
	const { tree, parent, child, owner, observer } = fixture();
	const second = owner.create();
	owner.observe(observer, parent, { attributes: true });
	owner.observe(second, child, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	owner.beginDelivery();
	owner.nextDelivery();
	tree.setAttribute(child, "title", "new observer");
	expect(owner.nextDelivery()).toBeNull();
	owner.beginDelivery();
	expect(owner.nextDelivery()?.observer).toBe(second);
	expect(owner.nextDelivery()).toBeNull();
});

it("skips disconnected or released observers in an active notification set", () => {
	const { tree, parent, owner, observer } = fixture();
	const second = owner.create();
	const third = owner.create();
	for (const id of [observer, second, third])
		owner.observe(id, parent, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	owner.beginDelivery();
	expect(owner.nextDelivery()?.observer).toBe(observer);
	owner.disconnect(second);
	owner.release(third);
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.metrics()).toMatchObject({
		observers: 2,
		records: 0,
		registrations: 1,
	});
});

it("cleans transients separately for each observer, just before its delivery", () => {
	const { tree, parent, child, owner, observer } = fixture();
	const second = owner.create();
	for (const id of [observer, second])
		owner.observe(id, parent, {
			childList: true,
			attributes: true,
			subtree: true,
		});
	tree.remove(child);
	owner.beginDelivery();
	expect(owner.nextDelivery()?.observer).toBe(observer);
	tree.setAttribute(child, "title", "between callbacks");
	expect(owner.nextDelivery()?.records).toHaveLength(2);
	expect(owner.takeRecords(observer)).toEqual([]);
	expect(owner.nextDelivery()).toBeNull();
});

it("rejects overlapping checkpoints and permits empty polling", () => {
	const { tree, parent, owner, observer } = fixture();
	expect(owner.beginDelivery()).toBe(false);
	expect(owner.nextDelivery()).toBeNull();
	owner.observe(observer, parent, { attributes: true });
	tree.setAttribute(parent, "title", "queued");
	owner.beginDelivery();
	expect(() => owner.beginDelivery()).toThrow(/active/);
	owner.nextDelivery();
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.beginDelivery()).toBe(false);
});

it("freezes transferred records and lists without retaining capture-only ancestry", () => {
	const { tree, parent, owner, observer } = fixture();
	owner.observe(observer, parent, { childList: true });
	const child = tree.createElement("aside");
	tree.append(parent, child);
	const records = owner.takeRecords(observer);
	expect(Object.isFrozen(records)).toBe(true);
	expect(Object.isFrozen(records[0])).toBe(true);
	expect(Object.isFrozen(records[0].addedNodes)).toBe(true);
	expect(Object.isFrozen(records[0].removedNodes)).toBe(true);
	expect(records[0]).not.toHaveProperty("ancestors");
	tree.remove(child);
	expect(records[0].addedNodes).toEqual([child]);
});

it.each([
	0,
	-1,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid limits before subscribing: %s", (maxRecords) => {
	const { tree } = fixture();
	const before = tree.mutationMetrics().collectors;
	expect(() => new DocumentObservers(tree, { maxRecords })).toThrow(/Invalid/);
	expect(tree.mutationMetrics().collectors).toBe(before);
});

it("bounds observer handles without poisoning existing registrations", () => {
	const { owner, observer } = fixture({ maxObservers: 1 });
	expect(() => owner.create()).toThrow(/limit/);
	expect(owner.metrics().failed).toBe(false);
	owner.release(observer);
	const next = owner.create();
	expect(next).not.toBe(observer);
	expect(() => owner.takeRecords(observer)).toThrow(/Unknown/);
});

it("bounds registrations atomically and allows replacement at capacity", () => {
	const { tree, parent, child, owner, observer } = fixture({
		maxRegistrations: 1,
	});
	owner.observe(observer, parent, { attributes: true });
	expect(() => owner.observe(observer, child, { attributes: true })).toThrow(
		/limit/,
	);
	owner.observe(observer, parent, { childList: true });
	tree.setAttribute(parent, "title", "ignored");
	expect(owner.takeRecords(observer)).toEqual([]);
	expect(owner.metrics()).toMatchObject({ failed: false, registrations: 1 });
});

it.each([{ maxFilterNames: 1 }, { maxFilterCodeUnits: 2 }])(
	"rejects oversized filters without altering the registration: %j",
	(limits) => {
		const { tree, parent, owner, observer } = fixture(limits);
		owner.observe(observer, parent, { attributes: true });
		expect(() =>
			owner.observe(observer, parent, { attributeFilter: ["id", "title"] }),
		).toThrow(/limit/);
		tree.setAttribute(parent, "title", "observed");
		expect(owner.takeRecords(observer)).toHaveLength(1);
		expect(owner.metrics().failed).toBe(false);
	},
);

it("fails closed if transient registration fanout exceeds its budget", () => {
	const { tree, parent, child, owner, observer } = fixture({
		maxRegistrations: 1,
	});
	owner.observe(observer, parent, { attributes: true, subtree: true });
	expect(() => tree.remove(child)).not.toThrow();
	expect(tree.get(child).parent).toBeNull();
	expect(owner.metrics()).toMatchObject({
		failed: true,
		observers: 0,
		registrations: 0,
		pending: 0,
	});
	expect(() => owner.hasPending()).toThrow(/limit/);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("bounds all observer queues together and discards partial fanout on overflow", () => {
	const { tree, parent, owner, observer } = fixture({ maxRecords: 1 });
	const second = owner.create();
	for (const id of [observer, second])
		owner.observe(id, parent, { attributes: true });
	tree.setAttribute(parent, "title", "overflow");
	expect(owner.metrics()).toMatchObject({
		failed: true,
		records: 0,
		codeUnits: 0,
		nodeReferences: 0,
	});
	for (const operation of [
		() => owner.takeRecords(observer),
		() => owner.create(),
		() => owner.beginDelivery(),
		() => owner.nextDelivery(),
		() => owner.disconnect(observer),
		() => owner.assertHealthy(),
	])
		expect(operation).toThrow(/limit/);
	expect(tree.mutationMetrics().collectors).toBe(0);
});

it("counts retained old values and attribute names, without sensitive error payloads", () => {
	const { tree, parent, owner, observer } = fixture({ maxRecordCodeUnits: 8 });
	owner.observe(observer, parent, { attributeOldValue: true });
	tree.setAttribute(parent, "id", "secret!");
	expect(owner.metrics().codeUnits).toBe(2);
	owner.takeRecords(observer);
	tree.setAttribute(parent, "id", "next");
	expect(owner.metrics().failed).toBe(true);
	expect(() => owner.takeRecords(observer)).toThrow(
		"Document observer limit exceeded",
	);
	expect(JSON.stringify(owner.metrics())).not.toContain("secret");
});

it("does not charge old values that no registration requested", () => {
	const { tree, parent, owner, observer } = fixture({ maxRecordCodeUnits: 4 });
	tree.setAttribute(parent, "id", "long discarded old string");
	owner.observe(observer, parent, { attributes: true });
	tree.setAttribute(parent, "id", "next");
	tree.setAttribute(parent, "id", "again");
	expect(owner.metrics()).toMatchObject({
		records: 2,
		codeUnits: 4,
		failed: false,
	});
});

it("counts node IDs in target, node lists and sibling fields", () => {
	const { tree, parent, owner, observer } = fixture({
		maxRecordNodeReferences: 3,
	});
	owner.observe(observer, parent, { childList: true });
	tree.append(parent, tree.createText("first"));
	expect(owner.metrics().nodeReferences).toBe(3);
	tree.append(parent, tree.createText("overflow"));
	expect(owner.metrics()).toMatchObject({ failed: true, nodeReferences: 0 });
});

it.each(["takeRecords", "disconnect", "delivery"])(
	"returns queue budgets after %s",
	(operation) => {
		const { tree, parent, owner, observer } = fixture({
			maxRecords: 1,
			maxRecordCodeUnits: 2,
			maxRecordNodeReferences: 1,
		});
		owner.observe(observer, parent, { attributes: true });
		tree.setAttribute(parent, "id", "first");
		if (operation === "takeRecords") owner.takeRecords(observer);
		else if (operation === "disconnect") owner.disconnect(observer);
		else {
			owner.beginDelivery();
			owner.nextDelivery();
			owner.nextDelivery();
		}
		expect(owner.metrics()).toMatchObject({
			records: 0,
			codeUnits: 0,
			nodeReferences: 0,
		});
		owner.observe(observer, parent, { attributes: true });
		tree.setAttribute(parent, "id", "second");
		expect(owner.metrics()).toMatchObject({
			failed: false,
			records: 1,
			codeUnits: 2,
			nodeReferences: 1,
		});
	},
);

it.each(["owner", "document"])(
	"releases subscriptions and all retained state on %s closure",
	(source) => {
		const { tree, parent, child, owner, observer } = fixture();
		owner.observe(observer, parent, { childList: true, subtree: true });
		tree.remove(child);
		owner.beginDelivery();
		if (source === "owner") owner.close();
		else tree.close();
		owner.close();
		expect(owner.metrics()).toEqual({
			observers: 0,
			registrations: 0,
			records: 0,
			codeUnits: 0,
			nodeReferences: 0,
			pending: 0,
			delivering: false,
			closed: true,
			failed: false,
		});
		expect(() => owner.takeRecords(observer)).toThrow(/closed/);
		expect(tree.mutationMetrics().collectors).toBe(0);
	},
);

it("unsubscribes capture if cleanup-hook admission fails", () => {
	const { tree, owner } = fixture();
	owner.close();
	for (let index = 0; index < 64; index++) tree.onClose(() => {});
	expect(() => new DocumentObservers(tree)).toThrow(/limit/);
	expect(tree.mutationMetrics().collectors).toBe(0);
});

it("uses one native capture subscription for many observers", () => {
	const { tree, owner } = fixture();
	for (let index = 0; index < 100; index++) owner.create();
	expect(tree.mutationMetrics().collectors).toBe(1);
});

it("isolates separate owners and preserves healthy capture after another overflows", () => {
	const { tree, parent, owner, observer } = fixture({ maxRecords: 1 });
	const other = new DocumentObservers(tree);
	const otherObserver = other.create();
	owner.observe(observer, parent, { attributes: true });
	other.observe(otherObserver, parent, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	tree.setAttribute(parent, "title", "second");
	expect(owner.metrics().failed).toBe(true);
	expect(other.takeRecords(otherObserver)).toHaveLength(2);
	expect(tree.mutationMetrics().collectorFailures).toBe(0);
});

it("rejects missing nodes without registering and handles document closure at construction", () => {
	const { tree, owner, observer } = fixture();
	expect(() => owner.observe(observer, -1, { attributes: true })).toThrow();
	expect(owner.metrics().registrations).toBe(0);
	tree.close();
	expect(() => new DocumentObservers(tree)).toThrow(/closed/);
});

it("valid reobservation of the source stops observing its detached subtree", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, { attributes: true, subtree: true });
	tree.remove(child);
	owner.observe(observer, parent, { attributes: true, subtree: true });
	tree.setAttribute(child, "title", "no longer observed");
	expect(owner.takeRecords(observer)).toEqual([]);
	expect(owner.metrics().registrations).toBe(1);
});

it("retains exact transient source identity across nested removals", () => {
	const { tree, parent, child, text, owner, observer } = fixture();
	owner.observe(observer, parent, { characterData: true, subtree: true });
	tree.remove(child);
	tree.remove(text);
	owner.observe(observer, parent, { childList: true });
	tree.setData(text, "nested transient has a different source");
	expect(owner.takeRecords(observer)).toMatchObject([{ target: text }]);
	expect(owner.metrics().registrations).toBe(2);
	owner.beginDelivery();
	expect(owner.nextDelivery()).toBeNull();
	expect(owner.metrics().registrations).toBe(1);
});

it("updates a transient registration on its target without making it permanent", () => {
	const { tree, parent, child, owner, observer } = fixture();
	owner.observe(observer, parent, { attributes: true, subtree: true });
	tree.remove(child);
	owner.observe(observer, child, { attributeFilter: ["id"] });
	tree.setAttribute(child, "title", "ignored");
	tree.setAttribute(child, "id", "observed");
	expect(owner.metrics().registrations).toBe(2);
	owner.beginDelivery();
	expect(owner.nextDelivery()?.records).toMatchObject([
		{ attributeName: "id" },
	]);
	expect(owner.nextDelivery()).toBeNull();
	tree.setAttribute(child, "id", "not observed after cleanup");
	expect(owner.takeRecords(observer)).toEqual([]);
});

it("keeps old-value visibility and record identities separate between observers", () => {
	const { tree, parent, owner, observer } = fixture();
	const second = owner.create();
	owner.observe(observer, parent, { attributeOldValue: true });
	owner.observe(second, parent, { attributes: true });
	tree.setAttribute(parent, "title", "first");
	tree.setAttribute(parent, "title", "second");
	const firstRecords = owner.takeRecords(observer);
	const secondRecords = owner.takeRecords(second);
	expect(firstRecords[1].oldValue).toBe("first");
	expect(secondRecords[1].oldValue).toBeNull();
	expect(firstRecords[0]).not.toBe(secondRecords[0]);
});
