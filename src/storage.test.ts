import { expect, it } from "vitest";
import { BrowserStorage } from "./storage.js";

function profile() {
	const storage = new BrowserStorage();
	storage.openTab("first");
	storage.openTab("second");
	return storage;
}

it("shares local storage by canonical origin while isolating profiles and session storage by tab", () => {
	const storage = profile();
	storage
		.localStorage("first", "https://EXAMPLE.com:443/path")
		.setItem("theme", "dark");
	expect(
		storage
			.localStorage("second", "https://example.com/other")
			.getItem("theme"),
	).toBe("dark");
	for (const url of [
		"http://example.com",
		"https://example.com:444",
		"https://other.example.com",
	])
		expect(storage.localStorage("first", url).getItem("theme")).toBeNull();
	storage
		.sessionStorage("first", "https://example.com")
		.setItem("draft", "mine");
	expect(
		storage.sessionStorage("second", "https://example.com").getItem("draft"),
	).toBeNull();
	expect(
		profile().localStorage("first", "https://example.com").getItem("theme"),
	).toBeNull();
});

it("handles empty strings, ordered keys and prototype-like keys as data", () => {
	const storage = profile();
	const area = storage.localStorage("first", "https://example.com");
	area.setItem("", "");
	area.setItem("__proto__", "safe");
	area.setItem("constructor", "value");
	expect(area.length).toBe(3);
	expect(area.key(0)).toBe("");
	expect(area.key(3)).toBeNull();
	expect(area.key(-1)).toBeNull();
	expect(area.getItem("__proto__")).toBe("safe");
	expect(area.getItem("missing")).toBeNull();
	const revision = storage.metrics().revision;
	area.setItem("", "");
	area.removeItem("missing");
	expect(storage.metrics().revision).toBe(revision);
	expect(Object.isFrozen(area.entries())).toBe(true);
	expect(Object.isFrozen(area.entries()[0])).toBe(true);
	area.removeItem("__proto__");
	expect(area.key(1)).toBe("constructor");
	area.clear();
	expect(area.length).toBe(0);
	expect(storage.metrics().areas).toBe(0);
});

it("copies opener session storage once and keeps subsequent tab writes independent", () => {
	const storage = new BrowserStorage();
	storage.openTab("parent");
	const original = storage.sessionStorage("parent", "https://example.com");
	original.setItem("draft", "initial");
	storage.openTab("child", "parent");
	const child = storage.sessionStorage("child", "https://example.com");
	expect(child.getItem("draft")).toBe("initial");
	child.setItem("draft", "edited");
	expect(original.getItem("draft")).toBe("initial");
	original.setItem("another", "parent");
	expect(child.getItem("another")).toBeNull();
});

it("revokes stale handles on tab closure and never revives them when an ID is reused", () => {
	const storage = profile();
	const local = storage.localStorage("first", "https://example.com");
	const session = storage.sessionStorage("first", "https://example.com");
	local.setItem("persist", "local");
	session.setItem("ephemeral", "session");
	storage.closeTab("first");
	storage.openTab("first");
	expect(() => local.getItem("persist")).toThrow("tab is closed");
	expect(() => session.clear()).toThrow("tab is closed");
	expect(
		storage.localStorage("first", "https://example.com").getItem("persist"),
	).toBe("local");
	expect(storage.sessionStorage("first", "https://example.com").length).toBe(0);
	storage.close();
	storage.close();
	expect(storage.metrics()).toMatchObject({
		tabs: 0,
		areas: 0,
		entries: 0,
		bytes: 0,
		closed: true,
	});
	expect(() => storage.openTab("third")).toThrow("closed");
});

it("enforces UTF-16 byte quotas atomically including updates and all storage areas", () => {
	const storage = new BrowserStorage({ maxAreaBytes: 12, maxTotalBytes: 16 });
	storage.openTab("tab");
	const area = storage.localStorage("tab", "https://example.com");
	area.setItem("key", "😀");
	expect(storage.metrics().bytes).toBe(10);
	const revision = storage.metrics().revision;
	expect(() => area.setItem("key", "😀😀")).toThrow("byte limit");
	expect(area.getItem("key")).toBe("😀");
	expect(storage.metrics().revision).toBe(revision);
	const session = storage.sessionStorage("tab", "https://example.com");
	session.setItem("a", "bc");
	expect(storage.metrics().bytes).toBe(16);
	expect(() => session.setItem("a", "bcd")).toThrow("byte limit");
	area.removeItem("key");
	session.setItem("a", "bcd");
	expect(storage.metrics().bytes).toBe(8);
});

it("bounds tabs, areas and entries and does not allocate storage for empty reads or failed writes", () => {
	const storage = new BrowserStorage({
		maxTabs: 2,
		maxAreas: 1,
		maxEntriesPerArea: 1,
		maxTotalEntries: 1,
	});
	storage.openTab("first");
	storage.openTab("second");
	expect(() => storage.openTab("third")).toThrow("tab limit");
	const area = storage.localStorage("first", "https://example.com");
	expect(area.getItem("empty")).toBeNull();
	expect(storage.metrics().areas).toBe(0);
	area.setItem("one", "value");
	expect(() => area.setItem("two", "value")).toThrow("entry limit");
	expect(() =>
		storage
			.localStorage("second", "https://other.example")
			.setItem("one", "value"),
	).toThrow("entry limit");
	expect(storage.metrics()).toMatchObject({ areas: 1, entries: 1 });
});

it("fails an over-budget opener copy without creating a partial tab", () => {
	const storage = new BrowserStorage({ maxTotalBytes: 8 });
	storage.openTab("parent");
	storage.sessionStorage("parent", "https://example.com").setItem("a", "bc");
	expect(() => storage.openTab("child", "parent")).toThrow("profile limit");
	expect(storage.metrics().tabs).toBe(1);
	expect(() => storage.sessionStorage("child", "https://example.com")).toThrow(
		"does not exist",
	);
});

it("replaces local state atomically, preserves session state and updates existing views", () => {
	const storage = profile();
	const local = storage.localStorage("first", "https://example.com");
	local.setItem("old", "remove");
	const session = storage.sessionStorage("first", "https://example.com");
	session.setItem("draft", "keep");
	storage.replaceLocalState({
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "new", value: "value" }],
			},
		],
	});
	expect(local.getItem("old")).toBeNull();
	expect(local.getItem("new")).toBe("value");
	expect(session.getItem("draft")).toBe("keep");
	const exported = storage.exportLocalState();
	exported.origins[0].localStorage[0].value = "tampered";
	expect(local.getItem("new")).toBe("value");
	const copy = profile();
	copy.replaceLocalState(storage.exportLocalState());
	expect(
		copy.localStorage("second", "https://example.com").getItem("new"),
	).toBe("value");
	storage.replaceLocalState({ origins: [] });
	expect(local.length).toBe(0);
});

it("counts preserved session data when replacing local state and revokes every stale accessor", () => {
	const storage = new BrowserStorage({ maxTotalBytes: 12 });
	storage.openTab("tab");
	const local = storage.localStorage("tab", "https://example.com");
	local.setItem("a", "b");
	storage.sessionStorage("tab", "https://example.com").setItem("a", "bc");
	const before = storage.metrics();
	expect(() =>
		storage.replaceLocalState({
			origins: [
				{
					origin: "https://example.com",
					localStorage: [{ name: "a", value: "1234" }],
				},
			],
		}),
	).toThrow("profile limit");
	expect(local.getItem("a")).toBe("b");
	expect(storage.metrics()).toEqual(before);
	storage.closeTab("tab");
	expect(() => local.key(-1)).toThrow("closed");
});

it("rejects malformed, duplicate, opaque and oversized imported state without losing prior values", () => {
	const storage = new BrowserStorage({ maxAreaBytes: 20 });
	storage.openTab("tab");
	const area = storage.localStorage("tab", "https://example.com");
	area.setItem("old", "keep");
	for (const input of [
		null,
		{},
		{ origins: [{ origin: "file:///tmp/private", localStorage: [] }] },
		{ origins: [{ origin: "https://example.com/path", localStorage: [] }] },
		{
			origins: [
				{
					origin: "https://example.com",
					localStorage: [
						{ name: "a", value: "x" },
						{ name: "a", value: "y" },
					],
				},
			],
		},
		{
			origins: [
				{
					origin: "https://example.com",
					localStorage: [{ name: "a", value: "x".repeat(20) }],
				},
			],
		},
	]) {
		expect(() => storage.replaceLocalState(input)).toThrow();
		expect(area.getItem("old")).toBe("keep");
	}
	expect(() => storage.localStorage("tab", "about:blank")).toThrow();
	expect(() => area.setItem("bad", undefined as unknown as string)).toThrow(
		"must be strings",
	);
	expect(() => storage.openTab("bad/id")).toThrow("Invalid storage tab ID");
	expect(() => storage.openTab("tab")).toThrow("already exists");
});
