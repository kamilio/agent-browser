import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { DocumentEvents, controlledEventListener } from "./events.js";
import {
	type BrowserHashChangeEvent,
	type BrowserPopStateEvent,
	DocumentHistory,
	type HistoryLimits,
	type HistoryValue,
} from "./history.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";

it("aborts history event waits without blocking the next traversal", async () => {
	const { tree, history, events, windowTarget } = fixture();
	history.pushState(1, "#one");
	history.pushState(2, "#two");
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		windowTarget,
		"popstate",
		controlledEventListener(() => prefix),
		{ once: true },
	);
	const controller = new AbortController();
	const back = history.go(-1, controller.signal);
	await Promise.resolve();
	controller.abort();
	await expect(back).rejects.toMatchObject({ code: "aborted" });
	expect(history.snapshot().state).toBe(1);
	expect((await history.forward()).state).toBe(2);
	expect(events.metrics().activeDispatches).toBe(0);
	release();
	tree.close();
});

it("awaits controlled popstate prefixes before hashchange and the next traversal", async () => {
	const { tree, history, events, windowTarget } = fixture();
	history.pushState({ entry: 1 }, "#one");
	history.pushState({ entry: 2 }, "#two");
	const trace: string[] = [];
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	events.addEventListener(
		windowTarget,
		"popstate",
		controlledEventListener(async () => {
			trace.push("prefix");
			await prefix;
			trace.push("complete");
		}),
		{ once: true },
	);
	events.addEventListener(windowTarget, "hashchange", () => {
		trace.push("hash");
	});
	const back = history.back();
	await Promise.resolve();
	expect(trace).toEqual(["prefix"]);
	const forward = history.forward();
	expect(history.metrics()).toMatchObject({ running: true, pending: 1 });
	release();
	await Promise.all([back, forward]);
	expect(trace).toEqual(["prefix", "complete", "hash", "hash"]);
	expect(history.snapshot().state).toEqual({ entry: 2 });
	tree.close();
});

function fixture(limits: Partial<HistoryLimits> = {}) {
	const tree = new DocumentTree("https://example.com/start?base=1");
	const actions = new DocumentInteractions(tree);
	const events = actions.events;
	const windowTarget = events.windowTarget;
	if (windowTarget === null) throw new Error("Missing Window");
	return {
		tree,
		actions,
		events,
		windowTarget,
		history: new DocumentHistory(tree, events, limits),
	};
}

it("rejects aborted fragment jobs before mutating URL, history or target state", async () => {
	const { tree, history } = fixture();
	const before = history.snapshot();
	const controller = new AbortController();
	const pending = history.navigateFragment("#later", false, controller.signal);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(history.snapshot()).toEqual(before);
	expect(tree.url).toBe(before.url);
	expect(tree.targetElement).toBeNull();
});

it("pushes and replaces cloned JSON state while keeping refs stable and not dispatching history events", () => {
	const { tree, history, events, windowTarget } = fixture();
	const input = tree.createElement("input");
	tree.append(tree.root, input);
	const ref = tree.reference(input);
	const state = { page: 1, nested: ["original"] };
	let calls = 0;
	for (const type of ["popstate", "hashchange"])
		events.addEventListener(windowTarget, type, () => calls++);
	const first = history.pushState(state, "/one#first");
	state.nested[0] = "changed";
	(first.state as typeof state).nested[0] = "caller changed";
	expect(history.snapshot().state).toEqual({ page: 1, nested: ["original"] });
	const replaced = history.replaceState({ page: 2 }, "/two");
	expect(replaced.key).toBe(first.key);
	expect(replaced).toMatchObject({
		url: "https://example.com/two",
		length: 2,
		index: 1,
	});
	expect(tree.resolve(ref).id).toBe(input);
	expect(calls).toBe(0);
});

it("resolves state URLs against the document base but retains the current URL when omitted or empty", () => {
	const { tree, history } = fixture();
	const base = tree.createElement("base", { href: "/base/" });
	tree.append(tree.root, base);
	expect(history.pushState(null, "next").url).toBe(
		"https://example.com/base/next",
	);
	expect(history.replaceState(null, "").url).toBe(
		"https://example.com/base/next",
	);
	expect(history.replaceState(null).url).toBe("https://example.com/base/next");
	tree.setAttribute(base, "href", "https://other.test/");
	expect(() => history.pushState(null, "next")).toThrow("cannot rewrite");
	expect(history.snapshot().length).toBe(2);
});

it("rejects cross-origin, scheme, credentials and malformed URL changes atomically", () => {
	const { history, tree } = fixture();
	const original = history.snapshot();
	for (const url of [
		"https://other.test/path",
		"http://example.com/path",
		"https://user:secret@example.com/path",
		"javascript:void(0)",
		"http://[",
	])
		expect(() => history.pushState(null, url)).toThrow();
	expect(history.snapshot()).toEqual(original);
	expect(tree.url).toBe(original.url);
});

it("serializes prototype-like keys as data and does not invoke getters or toJSON", () => {
	const { history } = fixture();
	const state = JSON.parse(
		'{"__proto__":{"polluted":true},"constructor":"data"}',
	) as HistoryValue;
	expect(history.pushState(state).state).toEqual(state);
	expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
	let calls = 0;
	const getter = Object.defineProperty({}, "value", {
		enumerable: true,
		get() {
			calls++;
			return "secret";
		},
	});
	const toJSON = {
		toJSON() {
			calls++;
			return "secret";
		},
	};
	for (const value of [getter, toJSON])
		expect(() => history.pushState(value as HistoryValue)).toThrow(
			"History state",
		);
	expect(calls).toBe(0);
});

it("rejects unsupported structured-clone values and sparse/extended arrays rather than dropping them", () => {
	const { history } = fixture();
	const cycle: unknown[] = [];
	cycle.push(cycle);
	const disguised = new Array(1);
	Object.defineProperty(disguised, "4294967295", {
		value: "extra",
		enumerable: true,
	});
	const values: unknown[] = [
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		1n,
		new Date(),
		new Map(),
		() => 1,
		Symbol("x"),
		{ value: undefined },
		{ [Symbol("key")]: "value" },
		cycle,
		new Array(1),
		disguised,
	];
	for (const value of values)
		expect(() => history.pushState(value as HistoryValue)).toThrow();
	expect(history.snapshot().length).toBe(1);
});

it("bounds individual state bytes, total retained bytes and recursive complexity", () => {
	const { history } = fixture({
		maxStateBytes: 8,
		maxTotalStateBytes: 12,
		maxStateDepth: 2,
		maxStateNodes: 5,
	});
	expect(() => history.pushState("😀😀")).toThrow("byte limit");
	expect(() => history.pushState([[[null]]])).toThrow("complexity");
	expect(() => history.pushState([null, null, null, null, null])).toThrow();
	history.pushState("12345");
	expect(history.metrics().stateBytes).toBe(11);
	const before = history.snapshot();
	expect(() => history.pushState(null)).toThrow("Total history");
	expect(history.snapshot()).toEqual(before);
	history.replaceState(null);
	expect(history.metrics().stateBytes).toBe(8);
});

it("evicts oldest added entries at the length cap, preserves the initial entry and truncates forward history", async () => {
	const { history } = fixture({ maxEntries: 3 });
	const initial = history.snapshot();
	history.pushState(1, "/one");
	const second = history.pushState(2, "/two");
	history.pushState(3, "/three");
	expect(history.list().map((entry) => entry.key)).toEqual([
		initial.key,
		second.key,
		history.snapshot().key,
	]);
	expect(history.metrics().evictions).toBe(1);
	expect((await history.back()).state).toBe(2);
	expect((await history.back()).state).toBeNull();
	await history.forward();
	history.pushState(4, "/four");
	expect(history.list().map((entry) => entry.url)).toEqual([
		initial.url,
		"https://example.com/two",
		"https://example.com/four",
	]);
	expect((await history.forward()).state).toBe(4);
});

it("traverses asynchronously with popstate before hashchange and isolated event state", async () => {
	const { history, events, windowTarget, tree } = fixture();
	history.pushState({ page: 1 }, "/one#first");
	history.pushState({ page: 2 }, "/two#second");
	const calls: unknown[] = [];
	events.addEventListener(windowTarget, "popstate", (event) => {
		const state = (event as BrowserPopStateEvent).state as { page: number };
		calls.push([event.type, tree.url, state.page, event.target]);
		state.page = 999;
	});
	events.addEventListener(windowTarget, "hashchange", (event) => {
		const change = event as BrowserHashChangeEvent;
		calls.push([event.type, change.oldURL, change.newURL]);
	});
	const back = history.back();
	expect(tree.url).toBe("https://example.com/two#second");
	expect((await back).state).toEqual({ page: 1 });
	expect(calls).toEqual([
		["popstate", "https://example.com/one#first", 1, windowTarget],
		[
			"hashchange",
			"https://example.com/two#second",
			"https://example.com/one#first",
		],
	]);
	expect(events.drainErrors()).toEqual([]);
});

it("creates fragment history entries with null state and treats empty fragments distinctly", async () => {
	const { tree, history, events, windowTarget } = fixture();
	history.replaceState({ custom: true });
	const types: string[] = [];
	for (const type of ["popstate", "hashchange"])
		events.addEventListener(windowTarget, type, (event) =>
			types.push(event.type),
		);
	expect((await history.navigateFragment("#")).state).toBeNull();
	expect(tree.url.endsWith("#")).toBe(true);
	expect(types).toEqual(["popstate", "hashchange"]);
	await history.navigateFragment("#");
	expect(types).toHaveLength(2);
	expect(history.snapshot().length).toBe(2);
	await history.back();
	expect(types).toEqual(["popstate", "hashchange", "popstate", "hashchange"]);
	expect(history.snapshot().state).toEqual({ custom: true });
});

it("queues ordered traversals, preserves forward entries on replace and does not fake reload or cross-document navigation", async () => {
	const { history, events, windowTarget } = fixture();
	history.pushState(1, "/one");
	history.pushState(2, "/two");
	const states: HistoryValue[] = [];
	events.addEventListener(windowTarget, "popstate", (event) =>
		states.push((event as BrowserPopStateEvent).state),
	);
	const first = history.back();
	const second = history.back();
	expect((await first).state).toBe(1);
	expect((await second).state).toBeNull();
	history.replaceState("initial");
	expect(history.snapshot().length).toBe(3);
	expect((await history.forward()).state).toBe(1);
	expect(states).toEqual([1, null, 1]);
	await expect(history.go(0)).rejects.toThrow("Reload");
	await expect(history.go(0.5)).rejects.toThrow("safe integer");
	await expect(
		history.navigateFragment("https://other.test/#x"),
	).rejects.toThrow("Cross-document");
	await expect(history.navigateFragment("/different#x")).rejects.toThrow(
		"Cross-document",
	);
	await expect(history.navigateFragment("http://[")).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect((await history.go(1000)).state).toBe(1);
});

it("bounds queued operations and total operation count", async () => {
	const { history } = fixture({ maxPending: 1, maxOperations: 3 });
	history.pushState(1, "/one");
	const back = history.back();
	await expect(history.forward()).rejects.toThrow("Pending history");
	await back;
	await history.forward();
	await expect(history.back()).rejects.toThrow("operation limit");
	expect(() => history.pushState(null)).toThrow("operation limit");
	expect(history.metrics()).toMatchObject({
		pending: 0,
		running: false,
		operations: 3,
	});
});

it("rejects pending jobs and releases state when the document closes", async () => {
	const { history, tree } = fixture();
	history.pushState({ value: "private" });
	const pending = Promise.allSettled([history.back(), history.forward()]);
	tree.close();
	expect((await pending).map((result) => result.status)).toEqual([
		"rejected",
		"rejected",
	]);
	expect(history.metrics()).toMatchObject({
		entries: 0,
		stateBytes: 0,
		pending: 0,
		closed: true,
	});
	expect(() => history.snapshot()).toThrow("closed");
	history.close();
});

it("stops events when a listener closes the document and reports ordinary listener errors without canceling traversal", async () => {
	const first = fixture();
	first.history.pushState(1, "/one#x");
	first.events.addEventListener(first.windowTarget, "popstate", () => {
		throw new Error("handler failed");
	});
	let hashes = 0;
	first.events.addEventListener(
		first.windowTarget,
		"hashchange",
		() => hashes++,
	);
	await first.history.back();
	expect(hashes).toBe(1);
	expect(first.events.drainErrors()[0].message).toBe("handler failed");
	const second = fixture();
	second.history.pushState(1, "/one#x");
	second.events.addEventListener(second.windowTarget, "popstate", () =>
		second.tree.close(),
	);
	second.events.addEventListener(
		second.windowTarget,
		"hashchange",
		() => hashes++,
	);
	await expect(second.history.back()).rejects.toThrow("closed");
	expect(hashes).toBe(1);
	expect(second.history.metrics()).toMatchObject({
		closed: true,
		running: false,
	});
});

it("requires a matching active Window, one history owner and a supported document origin", () => {
	const { tree, history, events } = fixture();
	expect(() => new DocumentHistory(tree, events)).toThrow("already has");
	expect(() => new DocumentHistory(tree, new DocumentEvents(tree))).toThrow(
		"Window",
	);
	const other = new DocumentTree("https://other.test/");
	expect(() => new DocumentHistory(other, events)).toThrow("Window");
	const opaque = new DocumentTree("about:blank");
	expect(
		() =>
			new DocumentHistory(
				opaque,
				new DocumentEvents(opaque, {}, { window: true }),
			),
	).toThrow("HTTP(S)");
	const key = history.snapshot().key;
	history.close();
	const replacement = new DocumentHistory(tree, events);
	expect(replacement.snapshot().key).not.toBe(key);
	tree.setUrl("https://example.com/outside");
	expect(() => replacement.snapshot()).toThrow("outside its history");
});

it("supports selector-driven same-document routing without claiming page script execution", async () => {
	const { tree, history, events, windowTarget, actions } = fixture();
	const queries = new DocumentQueries(tree);
	const section = tree.createElement("section", {
		id: "section",
		role: "region",
		"aria-label": "Target",
	});
	const link = tree.createElement("a", { href: "#section" });
	const text = tree.createText("initial");
	tree.append(tree.root, link);
	tree.append(tree.root, section);
	tree.append(section, text);
	const reference = tree.reference(section);
	events.addEventListener(windowTarget, "popstate", () =>
		tree.setData(
			text,
			queries.querySelector(":target") === section ? "selected" : "initial",
		),
	);
	const intent = actions.click(tree.reference(link)).defaultAction;
	if (intent?.kind !== "navigate")
		throw new Error("Expected navigation intent");
	await history.navigateFragment(intent.url);
	expect(queries.querySelector(":target")).toBe(section);
	expect(tree.textContent(section)).toBe("selected");
	expect(
		snapshotDocument(tree).entries.find((entry) => entry.ref === reference)
			?.targeted,
	).toBe(true);
	await history.back();
	expect(queries.querySelector(":target")).toBeNull();
	expect(tree.textContent(section)).toBe("initial");
	expect(tree.resolve(reference).id).toBe(section);
	expect(events.drainErrors()).toEqual([]);
});

it("bounds asynchronous listener-triggered traversal loops", async () => {
	const { history, events, windowTarget } = fixture({ maxOperations: 4 });
	history.pushState(1, "/one");
	const failures: unknown[] = [];
	events.addEventListener(windowTarget, "popstate", (event) => {
		void history
			.go((event as BrowserPopStateEvent).state === null ? 1 : -1)
			.catch((error) => failures.push(error));
	});
	await history.back();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(failures).toHaveLength(1);
	expect(String(failures[0])).toContain("operation limit");
	expect(history.metrics()).toMatchObject({
		operations: 4,
		pending: 0,
		running: false,
	});
});

it("does not truncate forward history on a failed push and permits synchronous state updates in popstate handlers", async () => {
	const { history, events, windowTarget } = fixture({ maxStateBytes: 16 });
	history.pushState(1, "/one");
	history.pushState(2, "/two");
	await history.back();
	const before = history.list();
	expect(() => history.pushState("x".repeat(100))).toThrow("state string");
	expect(history.list()).toEqual(before);
	events.addEventListener(
		windowTarget,
		"popstate",
		() => {
			history.replaceState("handler");
		},
		{ once: true },
	);
	expect((await history.forward()).state).toBe("handler");
	expect(history.snapshot().length).toBe(3);
});

it("enforces initial-state and node-count limits and supports a one-entry replace-only history", () => {
	const tree = new DocumentTree("https://example.com");
	const events = new DocumentEvents(tree, {}, { window: true });
	expect(() => new DocumentHistory(tree, events, { maxStateBytes: 3 })).toThrow(
		"state byte",
	);
	expect(
		() => new DocumentHistory(tree, events, { maxTotalStateBytes: 3 }),
	).toThrow("Total history");
	const history = new DocumentHistory(tree, events, {
		maxEntries: 1,
		maxStateNodes: 3,
	});
	expect(() => history.replaceState([1, 2, 3])).toThrow("complexity");
	expect(() => history.pushState(null)).toThrow("entry limit");
	expect(history.replaceState({ value: 1 }, "/replacement")).toMatchObject({
		length: 1,
		url: "https://example.com/replacement",
	});
});

it("does not change the fragment target merely because pushState or replaceState changes the URL", async () => {
	const { tree, history } = fixture();
	const first = tree.createElement("div", { id: "first" });
	const second = tree.createElement("div", { id: "second" });
	tree.append(tree.root, first);
	tree.append(tree.root, second);
	const queries = new DocumentQueries(tree);
	await history.navigateFragment("#first");
	expect(queries.querySelector(":target")).toBe(first);
	history.pushState(null, "#second");
	expect(queries.querySelector(":target")).toBe(first);
	history.replaceState(null, "#missing");
	expect(queries.querySelector(":target")).toBe(first);
	await history.navigateFragment("#second");
	expect(queries.querySelector(":target")).toBe(second);
});
