import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import type { DocumentTree } from "./document.js";
import { documentInteractions } from "./interactions.js";
import { pageStoragePort } from "./page-storage.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptStorage } from "./script-storage.js";
import { BrowserSession, type BrowserSessionOptions } from "./session.js";
import type { BrowserStorageEvent } from "./storage-events.js";

interface StorageObject {
	length: number;
	key(...args: unknown[]): string | null;
	getItem(...args: unknown[]): string | null;
	setItem(...args: unknown[]): void;
	removeItem(...args: unknown[]): void;
	clear(): void;
}
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(target, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		return target;
	},
};
interface Entry {
	tree: DocumentTree;
	binding: ScriptStorage;
	local: StorageObject;
	session: StorageObject;
	document: { cookie: unknown };
}
const sessions: BrowserSession[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	vi.useRealTimers();
});
function fixture(
	options: Pick<BrowserSessionOptions, "storageLimits" | "cookieLimits"> = {},
) {
	const entries: Entry[] = [];
	let initialize: (entry: Entry) => void = () => {};
	const browser = new BrowserSession({
		...options,
		createTransport: () => ({
			async request(input) {
				const body = new TextEncoder().encode(
					'<base href="https://unrelated.example/"><p>Storage</p>',
				);
				return {
					url: input.url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					encodedBytes: body.length,
					elapsedMs: 0,
					redirects: [],
				};
			},
			metrics: () => ({
				requests: entries.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response, context) =>
			loadBrowserDocument(response, {
				...context,
				initializeDocument: (tree) => {
					context.initializeDocument?.(tree);
					const port = pageStoragePort(tree);
					if (!port) throw new Error("Missing pre-parser storage port");
					const binding = new ScriptStorage(tree, factory, port);
					const entry = {
						tree,
						binding,
						local: binding.localStorage as StorageObject,
						session: binding.sessionStorage as StorageObject,
						document: new ScriptDom(
							tree,
							factory,
							undefined,
							undefined,
							binding,
						).document as Entry["document"],
					};
					entries.push(entry);
					initialize(entry);
				},
			}),
	});
	sessions.push(browser);
	const tab = browser.createTab().id;
	return {
		browser,
		tab,
		entries,
		onInitialize: (next: typeof initialize) => {
			initialize = next;
		},
	};
}

it("provides storage before parsing and shares the native session store", async () => {
	const test = fixture();
	test.onInitialize(({ local, session }) => {
		local.setItem("theme", "dark");
		session.setItem("draft", "initial");
	});
	await test.browser.navigate(test.tab, "https://example.com/start");
	expect(
		test.browser.storage
			.localStorage(test.tab, "https://example.com/")
			.getItem("theme"),
	).toBe("dark");
	expect(
		test.browser.storage
			.sessionStorage(test.tab, "https://example.com/")
			.getItem("draft"),
	).toBe("initial");
	test.browser.storage
		.localStorage(test.tab, "https://example.com/")
		.setItem("theme", "light");
	expect(test.entries[0].local.getItem("theme")).toBe("light");
});

it("persists same-tab state across reload and revokes old capabilities", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	const first = test.entries[0];
	first.local.setItem("saved", "local");
	first.session.setItem("saved", "session");
	await test.browser.reload(test.tab);
	expect(test.entries[1].local.getItem("saved")).toBe("local");
	expect(test.entries[1].session.getItem("saved")).toBe("session");
	expect(() => first.local.getItem("saved")).toThrow("closed");
	expect(() => first.session.setItem("saved", "stale")).toThrow("closed");
	expect(() => first.document.cookie).toThrow("closed");
	expect(pageStoragePort(first.tree)).toBeUndefined();
});

it("shares local storage across same-origin tabs but isolates session storage", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	test.entries[0].local.setItem("saved", "shared");
	test.entries[0].session.setItem("saved", "private");
	const other = test.browser.createTab().id;
	await test.browser.navigate(other, "https://example.com/other");
	expect(test.entries[1].local.getItem("saved")).toBe("shared");
	expect(test.entries[1].session.getItem("saved")).toBeNull();
	test.entries[1].local.setItem("saved", "updated");
	expect(test.entries[0].local.getItem("saved")).toBe("updated");
});

it("clones opener session storage once without aliasing the two tabs", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	test.entries[0].session.setItem("draft", "parent");
	const other = test.browser.createTab({ opener: test.tab }).id;
	await test.browser.navigate(other, "https://example.com/other");
	expect(test.entries[1].session.getItem("draft")).toBe("parent");
	test.entries[1].session.setItem("draft", "child");
	expect(test.entries[0].session.getItem("draft")).toBe("parent");
});

it.each([
	"http://example.com/",
	"https://other.example.com/",
	"https://example.com:444/",
])("isolates storage from %s and restores it when returning", async (url) => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	test.entries[0].local.setItem("saved", "local");
	test.entries[0].session.setItem("saved", "session");
	await test.browser.navigate(test.tab, url);
	expect(test.entries[1].local.getItem("saved")).toBeNull();
	expect(test.entries[1].session.getItem("saved")).toBeNull();
	await test.browser.back(test.tab);
	expect(test.entries[2].local.getItem("saved")).toBe("local");
	expect(test.entries[2].session.getItem("saved")).toBe("session");
});

it("isolates independent browser sessions", async () => {
	const first = fixture();
	const second = fixture();
	await first.browser.navigate(first.tab, "https://example.com/");
	first.entries[0].local.setItem("saved", "private");
	first.entries[0].document.cookie = "saved=private; Path=/; Secure";
	await second.browser.navigate(second.tab, "https://example.com/");
	expect(second.entries[0].local.getItem("saved")).toBeNull();
	expect(second.entries[0].document.cookie).toBe("");
});

it("uses the document origin rather than baseURI for storage and cookies", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/directory/start");
	test.entries[0].local.setItem("saved", "own-origin");
	test.entries[0].document.cookie = "saved=own-origin";
	expect(
		test.browser.storage
			.localStorage(test.tab, "https://unrelated.example/")
			.getItem("saved"),
	).toBeNull();
	expect(
		test.browser.cookies.documentCookie(
			"https://example.com/directory/next",
			"https://example.com/",
		),
	).toBe("saved=own-origin");
	expect(
		test.browser.cookies.documentCookie(
			"https://unrelated.example/",
			"https://unrelated.example/",
		),
	).toBe("");
});

it("accepts primitive strings and treats prototype-like keys as data", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const { local } = test.entries[0];
	expect(local.setItem("", "")).toBeUndefined();
	local.setItem(null, undefined);
	local.setItem("__proto__", 42);
	local.setItem("getItem", true);
	expect(local.length).toBe(4);
	expect(local.getItem(null)).toBe("undefined");
	expect(local.getItem("__proto__")).toBe("42");
	expect(local.getItem("getItem")).toBe("true");
	expect(local.getItem("missing")).toBeNull();
	expect(local.key(0)).toBe("");
	expect(local.key(10)).toBeNull();
	local.removeItem("getItem");
	expect(local.getItem("getItem")).toBeNull();
	local.clear();
	expect(local.length).toBe(0);
});

it.each([
	[undefined, "first"],
	[null, "first"],
	[Number.NaN, "first"],
	[Number.POSITIVE_INFINITY, "first"],
	[4294967296, "first"],
	[-1, null],
	[1.9, "second"],
	["1", "second"],
])("converts primitive key index %s", async (input, expected) => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const { local } = test.entries[0];
	local.setItem("first", "1");
	local.setItem("second", "2");
	expect(local.key(input)).toBe(expected);
});

it("requires arguments and rejects host-side guest conversion hooks", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const { local, document } = test.entries[0];
	for (const call of [
		() => local.getItem(),
		() => local.setItem("key"),
		() => local.removeItem(),
		() => local.key(),
	])
		expect(call).toThrow("arguments");
	const convert = vi.fn(() => "converted");
	const input = { toString: convert, valueOf: convert };
	expect(() => local.setItem("key", input)).toThrow("conversion");
	expect(() => local.getItem(input)).toThrow("conversion");
	expect(() => local.key(input)).toThrow("conversion");
	expect(() => {
		document.cookie = input;
	}).toThrow("conversion");
	expect(convert).not.toHaveBeenCalled();
	expect(local.length).toBe(0);
});

it("enforces atomic native storage quotas without exposing values in diagnostics", async () => {
	const test = fixture({ storageLimits: { maxAreaBytes: 20 } });
	await test.browser.navigate(test.tab, "https://example.com/");
	const { local } = test.entries[0];
	local.setItem("key", "safe");
	expect(() => local.setItem("key", "private-secret-value")).toThrow("limit");
	expect(local.getItem("key")).toBe("safe");
	expect(JSON.stringify(test.browser.metrics().storage)).not.toContain("safe");
});

it("does not expose, overwrite or delete HttpOnly cookies through document.cookie", async () => {
	const test = fixture();
	test.browser.cookies.setCookie(
		"https://example.com/",
		"token=server; Path=/; HttpOnly; Secure",
		{ siteUrl: "https://example.com/" },
	);
	await test.browser.navigate(test.tab, "https://example.com/");
	const { document } = test.entries[0];
	expect(document.cookie).toBe("");
	document.cookie = "token=script; Path=/; Secure";
	document.cookie = "token=; Path=/; Max-Age=0; Secure";
	document.cookie = "injected=hidden; Path=/; HttpOnly; Secure";
	expect(document.cookie).toBe("");
	expect(
		test.browser.cookies.cookieHeader("https://example.com/", {
			siteUrl: "https://example.com/",
		}),
	).toBe("token=server");
	expect(test.browser.cookies.metrics().rejections["http-only"]).toBe(3);
});

it("reflects path changes and script cookie deletion without changing storage origin", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/directory/start");
	const { document, local } = test.entries[0];
	document.cookie = "scoped=present";
	local.setItem("saved", "persistent");
	test.browser
		.page(test.tab)
		.history.pushState(null, "https://example.com/elsewhere");
	expect(document.cookie).toBe("");
	expect(local.getItem("saved")).toBe("persistent");
	test.browser
		.page(test.tab)
		.history.replaceState(null, "https://example.com/directory/next");
	expect(document.cookie).toBe("scoped=present");
	document.cookie = "scoped=; Max-Age=0";
	expect(document.cookie).toBe("");
});

it("silently rejects unsupported cookie attributes and insecure secure cookies", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "http://example.com/");
	const { document } = test.entries[0];
	for (const value of [
		"secure=blocked; Secure",
		"domain=blocked; Domain=example.com",
		"partition=blocked; Partitioned",
		"bad\r\nheader=value",
	])
		document.cookie = value;
	expect(document.cookie).toBe("");
	expect(test.browser.cookies.metrics().rejected).toBe(4);
});

it("closing a binding revokes it without deleting persistent storage", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const { binding, local, document } = test.entries[0];
	local.setItem("saved", "persistent");
	binding.close();
	expect(() => local.length).toThrow("closed");
	expect(() => {
		document.cookie = "blocked=value";
	}).toThrow("closed");
	expect(
		test.browser.storage
			.localStorage(test.tab, "https://example.com/")
			.getItem("saved"),
	).toBe("persistent");
});

it("importing local storage state updates live bindings without changing session data", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const entry = test.entries[0];
	entry.local.setItem("old", "discarded");
	entry.session.setItem("draft", "retained");
	test.browser.storage.replaceLocalState({
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "imported", value: "new" }],
			},
		],
	});
	expect(entry.local.getItem("old")).toBeNull();
	expect(entry.local.getItem("imported")).toBe("new");
	expect(entry.session.getItem("draft")).toBe("retained");
});

it("closing a tab revokes its bindings and removes only that tab's session storage", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const entry = test.entries[0];
	entry.local.setItem("saved", "local");
	entry.session.setItem("saved", "session");
	test.browser.closeTab(test.tab);
	expect(() => entry.local.getItem("saved")).toThrow("closed");
	const next = test.browser.createTab().id;
	await test.browser.navigate(next, "https://example.com/");
	expect(test.entries[1].local.getItem("saved")).toBe("local");
	expect(test.entries[1].session.getItem("saved")).toBeNull();
});

it("rejects origin tampering without redirecting existing storage capabilities", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/");
	const { tree, local, document } = test.entries[0];
	expect(() => tree.setUrl("https://other.example/")).toThrow("not permitted");
	local.setItem("saved", "own-origin");
	document.cookie = "saved=own-origin";
	expect(
		test.browser.storage
			.localStorage(test.tab, "https://other.example/")
			.getItem("saved"),
	).toBeNull();
	expect(
		test.browser.cookies.documentCookie(
			"https://other.example/",
			"https://other.example/",
		),
	).toBe("");
});

it("publishes session-owned storage changes using the current document URL", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	const other = test.browser.createTab().id;
	await test.browser.navigate(other, "https://example.com/other");
	const page = test.browser.page(other);
	const target = page.interactions.events.windowTarget;
	if (target === null) throw new Error("Missing window");
	const received: BrowserStorageEvent[] = [];
	page.interactions.events.addEventListener(target, "storage", (event) => {
		received.push(event as BrowserStorageEvent);
	});
	vi.useFakeTimers();
	test.browser
		.page(test.tab)
		.history.replaceState(null, "https://example.com/updated#source");
	test.entries[0].local.setItem("key", "value");
	expect(received).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(5);
	expect(received[0].url).toBe("https://example.com/updated#source");
	expect(received[0].storageArea.getItem("key")).toBe("value");
});

it("holds storage notifications for parsing candidates until successful commit", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	const other = test.browser.createTab().id;
	const received: BrowserStorageEvent[] = [];
	test.onInitialize(({ tree }) => {
		const events = documentInteractions(tree).events;
		const target = events.windowTarget;
		if (target === null) throw new Error("Missing window");
		events.addEventListener(target, "storage", (event) => {
			received.push(event as BrowserStorageEvent);
		});
		test.entries[0].local.setItem("key", "during-parser");
		expect(received).toHaveLength(0);
	});
	vi.useFakeTimers();
	await test.browser.navigate(other, "https://example.com/other");
	expect(received).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(5);
	expect(received[0].newValue).toBe("during-parser");
	expect(test.browser.metrics().storageEvents).toMatchObject({
		delivered: 1,
		pending: 0,
	});
});

it("failed candidates discard queued storage notifications without reverting authorized data writes", async () => {
	const test = fixture();
	await test.browser.navigate(test.tab, "https://example.com/start");
	const other = test.browser.createTab().id;
	test.onInitialize(({ tree }) => {
		test.entries[0].local.setItem("key", "retained");
		tree.setUrl("https://example.com/untracked");
	});
	vi.useFakeTimers();
	await expect(
		test.browser.navigate(other, "https://example.com/failed"),
	).rejects.toThrow("outside its history");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.entries[0].local.getItem("key")).toBe("retained");
	expect(test.browser.metrics().storageEvents).toMatchObject({
		canceled: 1,
		pending: 0,
		retainedBytes: 0,
	});
});
