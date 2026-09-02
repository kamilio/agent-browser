import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { BrowserSession, type SessionLimits } from "./session.js";

const sessions: BrowserSession[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const session of sessions.splice(0)) session.close();
});
function fixture(
	limits: Partial<SessionLimits> = {},
	handler?: (request: NetworkRequest) => Promise<Partial<NetworkResponse>>,
) {
	const requests: NetworkRequest[] = [];
	const session = new BrowserSession({
		limits,
		createTransport: () => ({
			request: async (input) => {
				requests.push(input);
				return {
					url: input.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
					...(await handler?.(input)),
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed: false,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {},
		}),
		loadDocument: (response, context) => {
			const tree = new DocumentTree(response.url, context.limits);
			tree.append(tree.root, tree.createText("fixture"));
			return tree;
		},
	});
	sessions.push(session);
	return { session, tab: session.createTab(), requests };
}
const first = "https://example.com/a";
const second = "https://example.com/b";

it("navigates away from a stopped event runtime and restores its retained history in a fresh document", async () => {
	const { session, tab } = fixture();
	await session.navigate(tab.id, first);
	const original = session.page(tab.id);
	original.history.pushState({ beforeStop: true }, "#next");
	original.interactions.close();
	await session.navigate(tab.id, second);
	expect(session.history(tab.id).length).toBe(3);
	expect((await session.back(tab.id)).kind).toBe("document");
	expect(session.page(tab.id)).not.toBe(original);
	expect(session.page(tab.id).history.snapshot().state).toEqual({
		beforeStop: true,
	});
});

it("replaces a stopped runtime rather than taking the fragment fast path", async () => {
	const { session, tab, requests } = fixture();
	await session.navigate(tab.id, first);
	const previous = session.page(tab.id);
	previous.interactions.close();
	expect((await session.navigate(tab.id, `${first}#next`)).kind).toBe(
		"document",
	);
	expect(session.page(tab.id)).not.toBe(previous);
	expect(requests).toHaveLength(2);
});

it("can reload a stopped runtime from its retained archive", async () => {
	const { session, tab, requests } = fixture();
	await session.navigate(tab.id, first);
	const previous = session.page(tab.id);
	previous.history.replaceState({ value: "retained" });
	previous.interactions.close();
	expect((await session.reload(tab.id)).kind).toBe("document");
	expect(session.page(tab.id).history.snapshot().state).toEqual({
		value: "retained",
	});
	expect(requests).toHaveLength(2);
});

it("walks across document and same-document entries with restored state and fresh refs", async () => {
	const { session, tab, requests } = fixture();
	await session.navigate(tab.id, first);
	const original = session.page(tab.id);
	original.history.pushState({ step: 1 }, "?one");
	original.history.pushState({ step: 2 }, "?two");
	const key = original.history.snapshot().key;
	await session.navigate(tab.id, second);
	expect(session.history(tab.id)).toMatchObject({ index: 3, length: 4 });
	expect((await session.back(tab.id)).kind).toBe("document");
	const restored = session.page(tab.id);
	expect(restored.history.snapshot()).toMatchObject({
		key,
		index: 2,
		length: 3,
		state: { step: 2 },
	});
	expect(original.document.nodeCount).toBe(0);
	expect((await session.back(tab.id)).kind).toBe("same-document");
	expect(session.page(tab.id)).toBe(restored);
	expect(restored.history.snapshot().state).toEqual({ step: 1 });
	await session.forward(tab.id);
	await session.forward(tab.id);
	expect(session.page(tab.id).document.url).toBe(second);
	expect(requests).toHaveLength(4);
});
it("new navigation after back discards local and later-document forward entries", async () => {
	const { session, tab } = fixture();
	await session.navigate(tab.id, first);
	session.page(tab.id).history.pushState(null, "?one");
	session.page(tab.id).history.pushState(null, "?two");
	await session.navigate(tab.id, second);
	await session.go(tab.id, -2);
	await session.navigate(tab.id, "/new");
	expect(session.history(tab.id).entries.map((entry) => entry.url)).toEqual([
		first,
		`${first}?one`,
		"https://example.com/new",
	]);
	const page = session.page(tab.id);
	await session.forward(tab.id);
	expect(session.page(tab.id)).toBe(page);
});
it("pushState invalidates later branches even when local history moves back before synchronization", async () => {
	const { session, tab } = fixture();
	await session.navigate(tab.id, first);
	await session.navigate(tab.id, second);
	await session.back(tab.id);
	const history = session.page(tab.id).history;
	history.pushState(null, "?new");
	await history.back();
	expect(session.history(tab.id).entries.map((entry) => entry.url)).toEqual([
		first,
		`${first}?new`,
	]);
	await session.forward(tab.id);
	expect(session.page(tab.id).document.url).toBe(`${first}?new`);
});
it("reload preserves state, keys and forward entries without appending", async () => {
	const { session, tab } = fixture();
	await session.navigate(tab.id, first);
	session.page(tab.id).history.replaceState({ saved: true });
	await session.navigate(tab.id, second);
	await session.back(tab.id);
	const before = session.history(tab.id);
	const page = session.page(tab.id);
	await session.reload(tab.id);
	expect(session.history(tab.id).entries).toEqual(before.entries);
	expect(session.page(tab.id).history.snapshot().state).toEqual({
		saved: true,
	});
	expect(page.document.nodeCount).toBe(0);
	await session.forward(tab.id);
	expect(session.page(tab.id).document.url).toBe(second);
});
it.each(["failure", "no-content", "cross-origin"])(
	"failed %s traversal preserves page and history position",
	async (mode) => {
		let fail = false;
		const { session, tab } = fixture({}, async (request) => {
			if (fail && request.url === first) {
				if (mode === "failure") throw new Error("fixture network failure");
				if (mode === "no-content") return { status: 204 };
				return {
					url: "https://different.example/",
					redirects: [
						{ url: first, status: 302, location: "https://different.example/" },
					],
				};
			}
			return {};
		});
		await session.navigate(tab.id, first);
		await session.navigate(tab.id, second);
		const page = session.page(tab.id);
		const before = session.history(tab.id);
		fail = true;
		if (mode === "no-content")
			expect((await session.back(tab.id)).kind).toBe("no-content");
		else await expect(session.back(tab.id)).rejects.toThrow();
		expect(session.page(tab.id)).toBe(page);
		expect(session.history(tab.id).entries).toEqual(before.entries);
		fail = false;
		await session.back(tab.id);
		expect(session.page(tab.id).document.url).toBe(first);
	},
);
it.each(["mutation", "stop", "supersede"])(
	"%s during loading prevents stale traversal commits",
	async (mode) => {
		let delay = false;
		let release!: (value: Partial<NetworkResponse>) => void;
		const delayed = new Promise<Partial<NetworkResponse>>((resolve) => {
			release = resolve;
		});
		const { session, tab, requests } = fixture({}, async (request) =>
			delay && request.url === first ? delayed : {},
		);
		await session.navigate(tab.id, first);
		await session.navigate(tab.id, second);
		delay = true;
		const pending = session.back(tab.id);
		const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
		await vi.waitFor(() => expect(requests).toHaveLength(3));
		if (mode === "mutation")
			session.page(tab.id).history.pushState({ newer: true }, "?newer");
		else if (mode === "stop") session.stop(tab.id);
		else await session.navigate(tab.id, "/newer");
		release({});
		await rejected;
		expect(session.page(tab.id).document.url).toBe(
			mode === "mutation"
				? `${second}?newer`
				: mode === "stop"
					? second
					: "https://example.com/newer",
		);
		expect(session.history(tab.id).index).toBe(mode === "stop" ? 1 : 2);
	},
);
it("bounded history evicts inactive documents and isolates tabs", async () => {
	const { session, tab } = fixture({ maxHistoryDocuments: 2 });
	for (const url of [first, second, "https://example.com/c"])
		await session.navigate(tab.id, url);
	expect(session.history(tab.id)).toMatchObject({
		length: 2,
		evictedDocuments: 1,
	});
	const other = session.createTab();
	expect(session.history(other.id).length).toBe(0);
	await session.back(tab.id);
	await session.back(tab.id);
	expect(session.page(tab.id).document.url).toBe(second);
});
it("oversized archives reject replacement without corrupting the live document", async () => {
	const { session, tab } = fixture({ maxHistoryBytes: 100 });
	await session.navigate(tab.id, first);
	const page = session.page(tab.id);
	page.history.replaceState("x".repeat(200));
	await expect(session.navigate(tab.id, second)).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(session.page(tab.id)).toBe(page);
	page.history.replaceState(null);
	expect(session.history(tab.id).length).toBe(1);
});
it("POST entries reject replay while same-document movement remains available", async () => {
	const { session, tab, requests } = fixture();
	await session.navigate(tab.id, first);
	const tree = session.page(tab.id).document;
	const form = tree.createElement("form", { method: "post", action: second });
	tree.append(tree.root, form);
	await session.requestSubmit(tab.id, tree.reference(form));
	await session.navigate(tab.id, "#fragment");
	await session.back(tab.id);
	expect(() => session.reload(tab.id)).toThrow(/resubmission/);
	await session.navigate(tab.id, "/c");
	const count = requests.length;
	await expect(session.back(tab.id)).rejects.toThrow(/resubmission/);
	expect(requests).toHaveLength(count);
	await session.go(tab.id, -2);
	expect(session.page(tab.id).document.url).toBe(first);
});
it("CLI go-back/go-forward execute actual session traversal", async () => {
	const { session, requests } = fixture();
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", first]);
	await host.execute(["goto", second]);
	expect((await host.execute(["go-back"])).data).toMatchObject({
		navigation: { url: first },
		history: { index: 0, length: 2 },
	});
	expect((await host.execute(["go-forward"])).data).toMatchObject({
		navigation: { url: second },
		history: { index: 1, length: 2 },
	});
	expect(requests).toHaveLength(4);
});

it("invalid or aborted traversal and out-of-bounds requests do not mutate or fetch", async () => {
	const { session, tab, requests } = fixture();
	await session.navigate(tab.id, first);
	const before = session.history(tab.id);
	await expect(session.go(tab.id, 1.5)).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(
		session.go(tab.id, -1, { signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "aborted" });
	await session.go(tab.id, Number.MAX_SAFE_INTEGER);
	await session.back(tab.id);
	expect(session.history(tab.id).entries).toEqual(before.entries);
	expect(requests).toHaveLength(1);
});

it("history metadata is detached from retained state", async () => {
	const { session, tab } = fixture();
	await session.navigate(tab.id, first);
	const metadata = session.history(tab.id);
	metadata.entries[0].url = "https://evil.example/";
	expect(session.history(tab.id).entries[0].url).toBe(first);
});
