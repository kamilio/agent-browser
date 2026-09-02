import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	BrowserEvent,
	DocumentEvents,
	controlledEventListener,
} from "./events.js";
import {
	type BrowserStorageEvent,
	PageStorageEvents,
} from "./storage-events.js";
import { BrowserStorage, type StorageMutation } from "./storage.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.useRealTimers();
});

function fixture(
	limits: ConstructorParameters<typeof PageStorageEvents>[0] = {},
) {
	vi.useFakeTimers();
	const hub = new PageStorageEvents(limits);
	const mutations: StorageMutation[] = [];
	const storage = new BrowserStorage({}, (mutation) => {
		mutations.push(mutation);
		hub.publish(mutation);
	});
	const documents: DocumentTree[] = [];
	const tabs = new Set<string>();
	cleanups.push(() => {
		for (const tree of documents) tree.close();
		hub.close();
		storage.close();
	});
	const page = (
		tabId: string,
		url = "https://example.com/start",
		active = true,
	) => {
		if (!tabs.has(tabId)) {
			storage.openTab(tabId);
			tabs.add(tabId);
		}
		const tree = new DocumentTree(url);
		documents.push(tree);
		const events = new DocumentEvents(tree, {}, { window: true });
		const target = events.windowTarget;
		if (target === null) throw new Error("Missing window");
		const received: BrowserStorageEvent[] = [];
		events.addEventListener(target, "storage", (event) => {
			received.push(event as BrowserStorageEvent);
		});
		const area = (kind: "local" | "session" = "local") =>
			kind === "local"
				? storage.localStorage(tabId, tree.url, tree)
				: storage.sessionStorage(tabId, tree.url, tree);
		hub.register(tree, tabId, events, area);
		if (active) hub.activate(tree);
		return { tree, events, target, received, area };
	};
	return { hub, storage, page, mutations };
}

it("captures changes synchronously but delivers only to other same-origin documents later", async () => {
	const test = fixture();
	const source = test.page("source");
	const other = test.page("other");
	const foreign = test.page("foreign", "https://other.example/");
	source.area().setItem("theme", "dark");
	expect(other.area().getItem("theme")).toBe("dark");
	expect(other.received).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(5);
	expect(source.received).toHaveLength(0);
	expect(foreign.received).toHaveLength(0);
	expect(other.received).toHaveLength(1);
	expect(other.received[0]).toMatchObject({
		type: "storage",
		key: "theme",
		oldValue: null,
		newValue: "dark",
		url: "https://example.com/start",
		bubbles: false,
		cancelable: false,
	});
	expect(other.received[0].storageArea.getItem("theme")).toBe("dark");
	expect(test.hub.metrics()).toMatchObject({
		accepted: 1,
		delivered: 1,
		pending: 0,
		retainedBytes: 0,
	});
});

it("preserves update/remove/clear snapshots and suppresses mutations that do not change data", async () => {
	const test = fixture();
	const source = test.page("source");
	const other = test.page("other");
	const area = source.area();
	area.removeItem("missing");
	area.clear();
	area.setItem("key", "one");
	area.setItem("key", "one");
	area.setItem("key", "two");
	area.removeItem("key");
	area.setItem("other", "value");
	area.clear();
	await vi.advanceTimersByTimeAsync(10);
	expect(
		other.received.map((event) => [event.key, event.oldValue, event.newValue]),
	).toEqual([
		["key", null, "one"],
		["key", "one", "two"],
		["key", "two", null],
		["other", null, "value"],
		[null, null, null],
	]);
});

it("session events stay within one tab and do not notify their originating document", async () => {
	const test = fixture();
	const source = test.page("source");
	const sameTab = test.page("source", "https://example.com/other");
	const otherTab = test.page("other");
	source.area("session").setItem("draft", "saved");
	await vi.advanceTimersByTimeAsync(5);
	expect(source.received).toHaveLength(0);
	expect(otherTab.received).toHaveLength(0);
	expect(sameTab.received[0].storageKind).toBe("session");
	expect(sameTab.received[0].storageArea.getItem("draft")).toBe("saved");
});

it("holds candidate events until activation without blocking active recipients", async () => {
	const test = fixture();
	const source = test.page("source");
	const candidate = test.page("candidate", undefined, false);
	const active = test.page("active");
	source.area().setItem("key", "value");
	await vi.advanceTimersByTimeAsync(5);
	expect(candidate.received).toHaveLength(0);
	expect(active.received).toHaveLength(1);
	expect(test.hub.metrics().pending).toBe(1);
	test.hub.activate(candidate.tree);
	await vi.advanceTimersByTimeAsync(5);
	expect(candidate.received).toHaveLength(1);
});

it("retiring recipients cancels queued work without retaining mutation values", async () => {
	const test = fixture();
	const source = test.page("source");
	const candidate = test.page("candidate", undefined, false);
	source.area().setItem("private-key", "private-value");
	candidate.tree.close();
	await vi.advanceTimersByTimeAsync(5);
	expect(test.hub.metrics()).toMatchObject({
		canceled: 1,
		pending: 0,
		retainedBytes: 0,
	});
	expect(JSON.stringify(test.hub.metrics())).not.toContain("private");
});

it("waits for the receiving document's current dispatch before running storage listeners", async () => {
	const test = fixture();
	const source = test.page("source");
	const other = test.page("other");
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	other.events.addEventListener(
		other.target,
		"custom",
		controlledEventListener(() => waiting),
	);
	const dispatch = other.events.dispatchEventAsync(
		other.target,
		new BrowserEvent("custom"),
	);
	source.area().setItem("key", "value");
	await vi.advanceTimersByTimeAsync(5);
	expect(other.received).toHaveLength(0);
	release();
	await dispatch;
	await vi.advanceTimersByTimeAsync(5);
	expect(other.received).toHaveLength(1);
});

it("cancels an active event prefix on recipient close and continues other queued deliveries", async () => {
	const test = fixture();
	const source = test.page("source");
	const blocked = test.page("blocked");
	const other = test.page("other");
	let release!: () => void;
	const waiting = new Promise<void>((resolve) => {
		release = resolve;
	});
	blocked.events.addEventListener(
		blocked.target,
		"storage",
		controlledEventListener(() => waiting),
	);
	source.area().setItem("key", "value");
	await vi.advanceTimersByTimeAsync(1);
	expect(test.hub.metrics().active).toBe(true);
	blocked.tree.close();
	await vi.advanceTimersByTimeAsync(5);
	expect(other.received).toHaveLength(1);
	expect(test.hub.metrics()).toMatchObject({
		delivered: 1,
		canceled: 1,
		retainedBytes: 0,
		active: false,
	});
	release();
});

it("bounds pending events while keeping committed storage mutations intact", async () => {
	const test = fixture({ maxPending: 1 });
	const source = test.page("source");
	const other = test.page("other");
	source.area().setItem("key", "one");
	source.area().setItem("key", "two");
	expect(other.area().getItem("key")).toBe("two");
	expect(test.hub.metrics()).toMatchObject({ accepted: 1, dropped: 1 });
	await vi.advanceTimersByTimeAsync(5);
	expect(other.received[0].newValue).toBe("one");
	expect(other.received[0].storageArea.getItem("key")).toBe("two");
});

it("bounds retained data and lifetime deliveries without resetting on cancellation", async () => {
	const test = fixture({ maxPendingBytes: 200, maxEvents: 1 });
	const source = test.page("source");
	const other = test.page("other");
	source.area().setItem("large", "x".repeat(200));
	expect(test.hub.metrics()).toMatchObject({
		accepted: 0,
		dropped: 1,
		retainedBytes: 0,
	});
	source.area().setItem("small", "yes");
	other.tree.close();
	test.page("next");
	source.area().setItem("small", "again");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.hub.metrics()).toMatchObject({
		accepted: 1,
		canceled: 1,
		dropped: 2,
		retainedBytes: 0,
	});
});

it("treats unowned native writes as external changes and suppresses administrative imports", async () => {
	const test = fixture();
	const page = test.page("tab");
	test.storage
		.localStorage("tab", "https://example.com/native")
		.setItem("key", "native");
	await vi.advanceTimersByTimeAsync(5);
	expect(page.received[0].url).toBe("https://example.com/native");
	test.storage.replaceLocalState({
		origins: [{ origin: "https://example.com", localStorage: [] }],
	});
	page.area().clear();
	await vi.advanceTimersByTimeAsync(5);
	expect(page.received).toHaveLength(1);
});

it("rejects invalid configuration and repeated registration; close prevents future work", async () => {
	const test = fixture({ maxDocuments: 1 });
	const source = test.page("source");
	expect(() =>
		test.hub.register(source.tree, "source", source.events, source.area),
	).toThrow("Invalid");
	expect(() => test.page("other")).toThrow("limit");
	expect(() => new PageStorageEvents({ maxPending: 129 })).toThrow("limits");
	expect(
		() => new PageStorageEvents(Object.fromEntries([["__proto__", 1]])),
	).toThrow("limits");
	test.hub.close();
	expect(() => test.hub.activate(source.tree)).toThrow("closed");
	source.area().setItem("key", "value");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.hub.metrics()).toMatchObject({
		closed: true,
		documents: 0,
		accepted: 0,
	});
});

it("isolates synchronous and asynchronous observer errors from committed data", async () => {
	const observer = vi
		.fn()
		.mockImplementationOnce(() => {
			throw new Error("private");
		})
		.mockImplementationOnce(() => Promise.reject(new Error("private")));
	const storage = new BrowserStorage({}, observer);
	storage.openTab("tab");
	const area = storage.localStorage("tab", "https://example.com/");
	area.setItem("key", "one");
	area.setItem("key", "two");
	await Promise.resolve();
	expect(area.getItem("key")).toBe("two");
	expect(storage.metrics().notificationFailures).toBe(2);
	storage.close();
});

it("emits frozen canonical metadata only after successful mutation commits", () => {
	const observer = vi.fn();
	const storage = new BrowserStorage({ maxAreaBytes: 8 }, observer);
	storage.openTab("tab");
	const source = {};
	const area = storage.localStorage(
		"tab",
		"HTTPS://EXAMPLE.COM:443/path#source",
		source,
	);
	area.setItem("key", "a");
	expect(() => area.setItem("key", "oversized")).toThrow("limit");
	expect(observer).toHaveBeenCalledTimes(1);
	const change = observer.mock.calls[0][0];
	expect(Object.isFrozen(change)).toBe(true);
	expect(change).toMatchObject({
		source,
		url: "https://example.com/path#source",
		origin: "https://example.com",
		key: "key",
		oldValue: null,
		newValue: "a",
	});
	expect(area.getItem("key")).toBe("a");
	storage.close();
});
