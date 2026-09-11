import { afterEach, expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { BrowserSession, type BrowserSessionOptions } from "./session.js";
import { documentStyles } from "./styles.js";

const initialUrl = "https://fixture.invalid/start";
const sessions: BrowserSession[] = [];
const documents: DocumentTree[] = [];

afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

function response(url: string): NetworkResponse {
	const body = new TextEncoder().encode(
		"<!doctype html><p>Color preference</p>",
	);
	return {
		url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
	};
}

function fixture(options: Partial<BrowserSessionOptions> = {}) {
	const requests: NetworkRequest[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request);
				return response(request.url);
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: loadBrowserDocument,
		...options,
	});
	sessions.push(session);
	return { session, requests };
}

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

it.each([undefined, null, "light", "dark"] as const)(
	"applies the session default %s before and after navigation",
	async (preference) => {
		const { session } = fixture({ colorSchemePreference: preference });
		const tab = session.createTab().id;
		expect(session.colorSchemePreference(tab)).toBe(preference ?? null);
		await session.navigate(tab, initialUrl);
		expect(
			documentStyles(session.page(tab).document).colorSchemePreference,
		).toBe(preference ?? null);
	},
);

it("keeps tabs independent and initializes opener tabs from the session default", async () => {
	const { session } = fixture({ colorSchemePreference: "dark" });
	const first = session.createTab().id;
	const second = session.createTab().id;
	expect(session.setColorSchemePreference(first, "light")).toBe("light");
	const child = session.createTab({ opener: first }).id;
	for (const tab of [first, second, child])
		await session.navigate(tab, initialUrl);
	expect(session.colorSchemePreference(first)).toBe("light");
	for (const tab of [second, child]) {
		expect(session.colorSchemePreference(tab)).toBe("dark");
		expect(
			documentStyles(session.page(tab).document).colorSchemePreference,
		).toBe("dark");
	}
	expect(session.setColorSchemePreference(first, null)).toBeNull();
	expect(
		documentStyles(session.page(first).document).colorSchemePreference,
	).toBeNull();
	expect(
		documentStyles(session.page(second).document).colorSchemePreference,
	).toBe("dark");
});

it("retains the current tab preference across resize, reload, navigation and history", async () => {
	const { session } = fixture({ colorSchemePreference: "dark" });
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	session.resize(tab, 640, 480);
	expect(documentStyles(session.page(tab).document).mediaEnvironment).toEqual({
		width: 640,
		height: 480,
		colorSchemePreference: "dark",
	});
	await session.navigate(tab, "https://fixture.invalid/next");
	session.setColorSchemePreference(tab, "light");
	for (const navigate of [
		() => session.reload(tab),
		() => session.back(tab),
		() => session.forward(tab),
		() => session.navigate(tab, "https://fixture.invalid/next#fragment"),
	]) {
		await navigate();
		expect(session.colorSchemePreference(tab)).toBe("light");
		expect(documentStyles(session.page(tab).document).mediaEnvironment).toEqual(
			{ width: 640, height: 480, colorSchemePreference: "light" },
		);
	}
});

it.each(["", "LIGHT", "system", 1, false, {}])(
	"rejects invalid initial preference %j",
	(value) => {
		expect(() => fixture({ colorSchemePreference: value as never })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
	},
);

it.each([undefined, "system", false])(
	"rejects invalid update %j without mutating the tab or page",
	async (value) => {
		const { session } = fixture({ colorSchemePreference: "dark" });
		const tab = session.createTab().id;
		await session.navigate(tab, initialUrl);
		const tree = session.page(tab).document;
		const styles = documentStyles(tree);
		const environment = styles.mediaEnvironment;
		const revision = tree.revision;
		expect(() => session.setColorSchemePreference(tab, value as never)).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(session.colorSchemePreference(tab)).toBe("dark");
		expect(styles.mediaEnvironment).toBe(environment);
		expect(tree.revision).toBe(revision);
		session.setColorSchemePreference(tab, "dark");
		expect(tree.revision).toBe(revision);
	},
);

it("applies preference synchronously before initializeDocument returns to the loader", async () => {
	const observed: unknown[] = [];
	const { session } = fixture({
		colorSchemePreference: "dark",
		loadDocument: (result, context) => {
			const tree = new DocumentTree(result.url, context.limits);
			documents.push(tree);
			context.initializeDocument?.(tree);
			const styles = documentStyles(tree);
			observed.push(styles.colorSchemePreference);
			const revision = tree.revision;
			context.initializeDocument?.(tree);
			observed.push(styles.colorSchemePreference);
			expect(tree.revision).toBe(revision);
			return tree;
		},
	});
	await session.navigate(session.createTab().id, initialUrl);
	expect(observed).toEqual(["dark", "dark"]);
});

it("updates the displayed page and the current initialized loading document together", async () => {
	const initialized = gate();
	const resume = gate();
	let loading: DocumentTree | undefined;
	const { session } = fixture({
		colorSchemePreference: "light",
		loadDocument: async (result, context) => {
			const tree = new DocumentTree(result.url, context.limits);
			documents.push(tree);
			context.initializeDocument?.(tree);
			if (result.url.endsWith("/next")) {
				loading = tree;
				initialized.release();
				await resume.promise;
			}
			return tree;
		},
	});
	const tab = session.createTab().id;
	await session.navigate(tab, initialUrl);
	const displayed = session.page(tab).document;
	const navigation = session.navigate(tab, "https://fixture.invalid/next");
	try {
		await initialized.promise;
		if (!loading) throw new Error("Missing initialized loading document");
		expect(documentStyles(loading).colorSchemePreference).toBe("light");
		expect(session.setColorSchemePreference(tab, "dark")).toBe("dark");
		expect(documentStyles(displayed).colorSchemePreference).toBe("dark");
		expect(documentStyles(loading).colorSchemePreference).toBe("dark");
		expect(session.colorSchemePreference(tab)).toBe("dark");
	} finally {
		resume.release();
		await navigation;
	}
	expect(session.page(tab).document).toBe(loading);
	expect(documentStyles(session.page(tab).document).colorSchemePreference).toBe(
		"dark",
	);
});
