import { expect, it, vi } from "vitest";
import { exportBrowserState, replaceBrowserState } from "./browser-state.js";
import { CookieJar } from "./cookies.js";
import { BrowserStorage, type StorageLimits } from "./storage.js";

const url = "https://example.com/account";
const now = Date.UTC(2026, 8, 3);

function profile(limits: Partial<StorageLimits> = {}) {
	const cookies = new CookieJar({}, () => now);
	const onMutation = vi.fn();
	const storage = new BrowserStorage(limits, onMutation);
	storage.openTab("first");
	cookies.setCookie(url, "old=synthetic; Path=/; Secure; HttpOnly", {
		siteUrl: url,
	});
	storage.localStorage("first", url).setItem("old", "local");
	storage.sessionStorage("first", url).setItem("draft", "session");
	onMutation.mockClear();
	return { cookies, storage, onMutation };
}

function state() {
	return {
		schemaVersion: 1,
		cookies: [
			{
				name: "new",
				value: "synthetic",
				host: "example.com",
				path: "/",
				secure: true,
				httpOnly: true,
				sameSite: "lax",
				expires: now + 60_000,
			},
		],
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "new", value: "local" }],
			},
		],
	};
}

function unchangedAfter(input: unknown, limits: Partial<StorageLimits> = {}) {
	const owner = profile(limits);
	const before = exportBrowserState(owner);
	const metrics = owner.storage.metrics();
	expect(() => replaceBrowserState(owner, input)).toThrow();
	expect(exportBrowserState(owner)).toEqual(before);
	expect(owner.storage.metrics()).toEqual(metrics);
	expect(owner.onMutation).not.toHaveBeenCalled();
}

it("round-trips both owners through JSON without replacing owner identities or session storage", () => {
	const owner = profile();
	const local = owner.storage.localStorage("first", url);
	const session = owner.storage.sessionStorage("first", url);
	const revision = owner.storage.metrics().revision;
	const cookies = owner.cookies;
	const storage = owner.storage;
	replaceBrowserState(owner, JSON.parse(JSON.stringify(state())));
	expect(exportBrowserState(owner)).toEqual(state());
	expect(owner.cookies).toBe(cookies);
	expect(owner.storage).toBe(storage);
	expect(local.entries()).toEqual([["new", "local"]]);
	expect(session.entries()).toEqual([["draft", "session"]]);
	expect(owner.storage.metrics().revision).toBe(revision + 1);
	expect(owner.cookies.cookieHeader(url, { siteUrl: url })).toBe(
		"new=synthetic",
	);
	expect(owner.cookies.documentCookie(url, url)).toBe("");
	expect(owner.onMutation).not.toHaveBeenCalled();
});

it("replaces rather than merges and leaves other profiles and tab session areas isolated", () => {
	const owner = profile();
	const other = profile();
	owner.storage.openTab("second", "first");
	replaceBrowserState(owner, state());
	expect(owner.storage.localStorage("second", url).entries()).toEqual([
		["new", "local"],
	]);
	expect(owner.storage.sessionStorage("second", url).entries()).toEqual([
		["draft", "session"],
	]);
	expect(other.storage.localStorage("first", url).getItem("old")).toBe("local");
	expect(other.cookies.exportState().cookies[0].name).toBe("old");
	replaceBrowserState(owner, { schemaVersion: 1, cookies: [], origins: [] });
	expect(exportBrowserState(owner)).toEqual({
		schemaVersion: 1,
		cookies: [],
		origins: [],
	});
	expect(owner.storage.sessionStorage("first", url).getItem("draft")).toBe(
		"session",
	);
});

it("detaches imports and exports while preserving Unicode, empty keys and entry order", () => {
	const owner = profile();
	const input = state();
	input.origins[0].localStorage = [
		{ name: "__proto__", value: "😀" },
		{ name: "", value: "" },
		{ name: "constructor", value: "last" },
	];
	replaceBrowserState(owner, input);
	input.cookies[0].value = "changed";
	input.origins[0].localStorage[0].value = "changed";
	const saved = exportBrowserState(owner);
	saved.origins[0].localStorage[0].value = "changed-again";
	expect(owner.storage.localStorage("first", url).entries()).toEqual([
		["__proto__", "😀"],
		["", ""],
		["constructor", "last"],
	]);
	expect(owner.cookies.exportState().cookies[0].value).toBe("synthetic");
});

it("filters expired cookies without renewing the lifetime of saved cookies", () => {
	const owner = profile();
	const input = state();
	input.cookies.push({ ...input.cookies[0], name: "expired", expires: now });
	replaceBrowserState(owner, input);
	expect(owner.cookies.exportState().cookies).toEqual([input.cookies[0]]);
});

it.each([
	null,
	[],
	{},
	{ ...state(), schemaVersion: 2 },
	{ cookies: [], origins: [] },
	{ ...state(), extra: "unexpected" },
	{ ...state(), cookies: null },
	{ ...state(), origins: null },
	{ ...state(), origins: [null] },
	{
		...state(),
		origins: [{ origin: "https://example.com/path", localStorage: [] }],
	},
	{ ...state(), origins: [{ origin: "file:///private", localStorage: [] }] },
	{
		...state(),
		origins: [{ origin: "https://example.com", localStorage: [{}] }],
	},
	{
		...state(),
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "key", value: 42 }],
			},
		],
	},
	{ ...state(), origins: [{ ...state().origins[0], extra: true }] },
	{
		...state(),
		origins: [
			{
				origin: "https://example.com",
				localStorage: [{ name: "key", value: "value", extra: true }],
			},
		],
	},
	{
		...state(),
		origins: [
			state().origins[0],
			{ origin: "https://EXAMPLE.com:443/", localStorage: [] },
		],
	},
	{
		...state(),
		origins: [
			{
				origin: "https://example.com",
				localStorage: [
					{ name: "key", value: "one" },
					{ name: "key", value: "two" },
				],
			},
		],
	},
])("rejects malformed state atomically, case %#", (input) => {
	unchangedAfter(input);
});

it("does not replace local storage when a late cookie entry is invalid", () => {
	const input = state();
	input.cookies.push({ ...input.cookies[0], name: "invalid name" });
	unchangedAfter(input);
});

it.each([
	{ maxAreas: 1 },
	{ maxEntriesPerArea: 1 },
	{ maxTotalEntries: 2 },
	{ maxAreaBytes: 24 },
	{ maxTotalBytes: 44 },
])(
	"counts retained session data and rejects quota failures atomically: %j",
	(limits) => {
		const input = state();
		input.origins[0].localStorage.push({ name: "second", value: "value" });
		if (limits.maxAreas) {
			const owner = profile();
			const before = exportBrowserState(owner);
			const constrained = new BrowserStorage({ maxAreas: 1 });
			constrained.openTab("first");
			constrained.sessionStorage("first", url).setItem("draft", "session");
			expect(() =>
				replaceBrowserState(
					{ cookies: owner.cookies, storage: constrained },
					input,
				),
			).toThrow("profile limit");
			expect(owner.cookies.exportState().cookies).toEqual(before.cookies);
			expect(constrained.exportLocalState()).toEqual({ origins: [] });
		} else {
			unchangedAfter(input, limits);
		}
	},
);

it.each(["envelope", "origin", "entry", "origins-array", "entries-array"])(
	"rejects %s accessors without executing them",
	(location) => {
		const input = state();
		const getter = vi.fn(() => {
			throw new Error("synthetic-secret");
		});
		const targets = {
			envelope: [input, "origins"],
			origin: [input.origins[0], "origin"],
			entry: [input.origins[0].localStorage[0], "value"],
			"origins-array": [input.origins, "0"],
			"entries-array": [input.origins[0].localStorage, "0"],
		} as const;
		const [target, key] = targets[location as keyof typeof targets];
		Object.defineProperty(target, key, { get: getter, enumerable: true });
		unchangedAfter(input);
		expect(getter).not.toHaveBeenCalled();
	},
);

it.each(["hole", "extra", "prototype"])(
	"rejects malformed storage containers: %s",
	(kind) => {
		const input = state();
		if (kind === "hole") input.origins.length = 2;
		if (kind === "extra") Object.assign(input.origins, { extra: true });
		if (kind === "prototype")
			Object.setPrototypeOf(input.origins[0], { inherited: true });
		unchangedAfter(input);
	},
);

it.each(["cookies", "storage"] as const)(
	"rejects closed %s without changing the other owner",
	(kind) => {
		const owner = profile();
		owner[kind].close();
		const before =
			kind === "cookies"
				? owner.storage.exportLocalState()
				: owner.cookies.exportState();
		expect(() => replaceBrowserState(owner, state())).toThrow("closed");
		expect(
			kind === "cookies"
				? owner.storage.exportLocalState()
				: owner.cookies.exportState(),
		).toEqual(before);
	},
);

it("rechecks owner lifetime after a host clock callback closes the cookie jar", () => {
	const owner = profile();
	const cookies = new CookieJar({}, () => {
		cookies.close();
		return now;
	});
	const before = owner.storage.exportLocalState();
	expect(() =>
		replaceBrowserState({ cookies, storage: owner.storage }, state()),
	).toThrow("closed");
	expect(owner.storage.exportLocalState()).toEqual(before);
});

it("does not call clock hooks or storage observers during commit", () => {
	const owner = profile();
	const clock = vi.fn(() => now);
	const cookies = new CookieJar({}, clock);
	replaceBrowserState({ cookies, storage: owner.storage }, state());
	expect(clock).toHaveBeenCalledTimes(1);
	expect(owner.onMutation).not.toHaveBeenCalled();
});

it("does not echo cookie or storage credentials in validation errors", () => {
	const input = state();
	input.cookies[0].value = "synthetic-cookie-secret";
	input.origins[0].localStorage[0].value = "synthetic-storage-secret";
	input.origins.push({
		origin: "https://user:synthetic-url-secret@example.com",
		localStorage: [],
	});
	try {
		replaceBrowserState(profile(), input);
		throw new Error("Expected state rejection");
	} catch (error) {
		expect(error).toHaveProperty("code", "policy-denied");
		expect(String(error)).not.toContain("synthetic-");
	}
});
