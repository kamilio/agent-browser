import { afterEach, expect, it, vi } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import type { HistoryValue } from "./history.js";
import { pageHistoryPort } from "./page-history.js";
import type { ScriptEvaluation } from "./safejs.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { ScriptHistory } from "./script-history.js";
import { ScriptLoader } from "./script-loader.js";
import { ScriptLocation } from "./script-location.js";
import { BrowserSession, type SessionLimits } from "./session.js";

interface HistoryObject {
	readonly length: number;
	readonly state: HistoryValue;
	pushState(data: unknown, unused?: unknown, url?: unknown): void;
	replaceState(data: unknown, unused?: unknown, url?: unknown): void;
	go(delta?: number): void;
	back(): void;
	forward(): void;
}
interface LocationObject {
	href: string;
	hash: string;
	pathname: string;
	search: string;
	host: string;
	protocol: string;
	assign(value?: unknown): void;
	replace(value?: unknown): void;
	reload(): void;
}
const sessions: BrowserSession[] = [];
const scriptFailures: unknown[] = [];
afterEach(() => {
	for (const session of sessions.splice(0)) session.close();
	vi.useRealTimers();
	expect(scriptFailures.splice(0)).toEqual([]);
});
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const target = Object.create(null);
		for (const [name, property] of Object.entries(definition.properties ?? {}))
			Object.defineProperty(target, name, property);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(target, name, { value: method });
		return target;
	},
};
const success: ScriptEvaluation = {
	engine: "poe-safe-js",
	partial: true,
	ok: true,
	metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
};
function fixture(limits: Partial<SessionLimits> = {}) {
	const seen: {
		url: string;
		history: HistoryObject;
		location: LocationObject;
		tree: DocumentTree;
	}[] = [];
	let script: (value: (typeof seen)[number]) => void = () => {};
	const requests: string[] = [];
	const session = new BrowserSession({
		limits,
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
				const body = new TextEncoder().encode(
					'<script>fixture</script><h1 id="initial">Initial</h1><h2 id="later">Later</h2>',
				);
				return {
					url: input.url,
					status: 200,
					headers: { "content-type": ["text/html"] },
					body,
					redirects: [],
					encodedBytes: body.length,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
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
				scripts: new ScriptLoader({
					response,
					signal: context.signal,
					owner: (tree) => {
						const port = pageHistoryPort(tree);
						if (!port)
							throw new Error("History must exist before scripts start");
						const history = new ScriptHistory(tree, factory, port)
							.object as HistoryObject;
						const location = new ScriptLocation(tree, factory, port)
							.object as LocationObject;
						const entry = { url: response.url, history, location, tree };
						seen.push(entry);
						return {
							closed: false,
							evaluate: async () => {
								try {
									script(entry);
								} catch (error) {
									scriptFailures.push(error);
									throw error;
								}
								return success;
							},
						};
					},
				}),
			}),
	});
	sessions.push(session);
	const tab = session.createTab().id;
	return {
		session,
		tab,
		seen,
		requests,
		run: (next: typeof script) => {
			script = next;
		},
	};
}

it("updates Location hashes synchronously and dispatches captured changes later", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const entry = test.seen[0];
	const page = test.session.page(test.tab);
	const target = page.interactions.events.windowTarget;
	if (target === null) throw new Error("Missing Window");
	const events: { oldURL: string; newURL: string }[] = [];
	page.interactions.events.addEventListener(target, "hashchange", (event) => {
		events.push(event as unknown as { oldURL: string; newURL: string });
	});
	entry.location.hash = "initial";
	expect(entry.location.href).toBe("https://example.com/first#initial");
	expect(entry.history.length).toBe(2);
	expect(page.document.targetElement).toBeDefined();
	entry.location.hash = "later";
	expect(entry.location.hash).toBe("#later");
	expect(events).toHaveLength(0);
	await vi.advanceTimersByTimeAsync(5);
	expect(events.map((event) => [event.oldURL, event.newURL])).toEqual([
		["https://example.com/first", "https://example.com/first#initial"],
		["https://example.com/first#initial", "https://example.com/first#later"],
	]);
	expect(test.requests).toHaveLength(1);
	expect(test.session.page(test.tab).document).toBe(entry.tree);
});

it("preserves an empty hash delimiter and ignores repeated fragment writes", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const { location, history } = test.seen[0];
	location.hash = "";
	expect(location.href).toBe("https://example.com/first#");
	expect(history.length).toBe(2);
	location.hash = "#";
	expect(history.length).toBe(2);
	expect(test.session.metrics().pageTraversals[0].accepted).toBe(1);
});

it("checks shared pending limits before applying synchronous fragment changes", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const { location, history } = test.seen[0];
	for (let index = 0; index < 8; index++) location.hash = String(index);
	expect(() => {
		location.hash = "overflow";
	}).toThrow("limit");
	expect(location.hash).toBe("#7");
	expect(history.length).toBe(9);
	test.session.stop(test.tab);
	await vi.advanceTimersByTimeAsync(5);
	expect(location.hash).toBe("#7");
	expect(test.session.metrics().pageTraversals[0].canceled).toBe(8);
});

it("resolves Location assignment at call time and revokes the replaced owner", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const { location, history, tree } = test.seen[0];
	const base = tree.createElement("base", { href: "/directory/" });
	tree.append(tree.root, base);
	expect(location.assign("next")).toBeUndefined();
	tree.setAttribute(base, "href", "/changed/");
	expect(location.pathname).toBe("/first");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.requests).toEqual([
		"https://example.com/first",
		"https://example.com/directory/next",
	]);
	expect(test.session.history(test.tab).length).toBe(2);
	expect(() => location.href).toThrow("closed");
	expect(() => history.state).toThrow("closed");
});

it("replaces only the active entry while preserving earlier and forward documents", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.pushState(1, "", "#one");
	test.seen[0].history.pushState(2, "", "#two");
	await test.session.navigate(test.tab, "https://example.com/last");
	await test.session.go(test.tab, -2);
	vi.useFakeTimers();
	test.seen.at(-1)?.location.replace("/replacement");
	await vi.advanceTimersByTimeAsync(5);
	expect(
		test.session.history(test.tab).entries.map((entry) => entry.url),
	).toEqual([
		"https://example.com/first",
		"https://example.com/replacement",
		"https://example.com/first#two",
		"https://example.com/last",
	]);
	expect(test.seen.at(-1)?.history.state).toBeNull();
	await test.session.forward(test.tab);
	expect(test.seen.at(-1)?.history.state).toBe(2);
	await test.session.back(test.tab);
	expect(test.seen.at(-1)?.location.pathname).toBe("/replacement");
	await test.session.back(test.tab);
	expect(test.seen.at(-1)?.location.pathname).toBe("/first");
});

it("drops forward entries when replacement parsing pushes a new branch", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.pushState(1, "", "#one");
	test.seen[0].history.pushState(2, "", "#two");
	await test.session.back(test.tab);
	test.run(({ url, history }) => {
		if (url.endsWith("/replacement")) history.pushState(3, "", "#branch");
	});
	vi.useFakeTimers();
	test.seen[0].location.replace("/replacement");
	await vi.advanceTimersByTimeAsync(5);
	expect(
		test.session.history(test.tab).entries.map((entry) => entry.url),
	).toEqual([
		"https://example.com/first",
		"https://example.com/replacement",
		"https://example.com/replacement#branch",
	]);
	expect(test.seen.at(-1)?.history.length).toBe(3);
});

it("defers parser Location assignment and replaces the not-yet-loaded entry", async () => {
	const test = fixture();
	test.run(({ url, location }) => {
		if (url.endsWith("/first")) location.assign("/landing");
	});
	vi.useFakeTimers();
	await test.session.navigate(test.tab, "https://example.com/first");
	expect(test.requests).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/landing",
	);
	expect(test.session.history(test.tab).length).toBe(1);
});

it("Location reload preserves state but same-URL assignment creates fresh state", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.replaceState({ saved: true }, "");
	vi.useFakeTimers();
	test.seen[0].location.reload();
	await vi.advanceTimersByTimeAsync(5);
	expect(test.seen.at(-1)?.history.state).toEqual({ saved: true });
	test.seen.at(-1)?.location.assign("/first");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.seen.at(-1)?.history.state).toBeNull();
	expect(test.session.history(test.tab).length).toBe(1);
	expect(test.requests).toHaveLength(3);
});

it("Location replacement within a document preserves forward state", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const { location, history } = test.seen[0];
	history.pushState(1, "", "#one");
	history.pushState(2, "", "#two");
	await test.session.back(test.tab);
	vi.useFakeTimers();
	location.replace("#replacement");
	expect(location.hash).toBe("#replacement");
	expect(history.length).toBe(3);
	expect(history.state).toBeNull();
	await vi.advanceTimersByTimeAsync(5);
	await test.session.forward(test.tab);
	expect(history.state).toBe(2);
	expect(test.requests).toHaveLength(1);
});

it("cancels queued Location navigation on explicit navigation and stop", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	test.seen[0].location.assign("/canceled");
	test.session.stop(test.tab);
	await vi.advanceTimersByTimeAsync(5);
	test.seen[0].location.assign("/superseded");
	await test.session.navigate(test.tab, "https://example.com/manual");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.requests).toEqual([
		"https://example.com/first",
		"https://example.com/manual",
	]);
	expect(test.session.metrics().pageTraversals[0].canceled).toBe(2);
});

it("rejects unsafe Location inputs without coercing guest objects or starting requests", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const { location } = test.seen[0];
	const convert = vi.fn(() => "/hidden");
	expect(() => location.assign({ toString: convert })).toThrow();
	expect(convert).not.toHaveBeenCalled();
	expect(() => location.assign()).toThrow("requires");
	expect(() => location.replace()).toThrow("requires");
	for (const value of [
		"javascript:alert(1)",
		"file:///etc/passwd",
		"https://user:secret@example.com/",
		"http://[",
	])
		expect(() => location.assign(value)).toThrow();
	expect(test.requests).toHaveLength(1);
	expect(test.session.metrics().pageTraversals[0].accepted).toBe(0);
});

it("retains the displayed page when queued Location navigation exceeds session limits", async () => {
	const test = fixture({ maxNavigations: 1 });
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const source = test.seen[0];
	source.location.assign("/blocked?private=secret");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.page(test.tab).document).toBe(source.tree);
	expect(source.location.pathname).toBe("/first");
	expect(test.requests).toHaveLength(1);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		failed: 1,
		last: { kind: "navigate", code: "resource-limit" },
	});
});

it("checks archive limits before committing a Location fragment", async () => {
	const test = fixture({ maxHistoryBytes: 512 });
	await test.session.navigate(test.tab, "https://example.com/first");
	const { location, history } = test.seen[0];
	expect(() => {
		location.hash = "x".repeat(1000);
	}).toThrow("budget");
	expect(location.href).toBe("https://example.com/first");
	expect(history.length).toBe(1);
	expect(test.session.metrics().pageTraversals[0].accepted).toBe(0);
});

it("discards Location work from a parser candidate that fails validation", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	test.run(({ location, tree }) => {
		location.assign("/must-not-run");
		tree.setUrl("https://example.com/untracked");
	});
	await expect(
		test.session.navigate(test.tab, "https://example.com/failed"),
	).rejects.toThrow("outside its history");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.requests).toEqual([
		"https://example.com/first",
		"https://example.com/failed",
	]);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		canceled: 1,
		completed: 0,
	});
});

it("makes history available before parser scripts and commits their same-origin URL changes", async () => {
	const test = fixture();
	test.run(({ history }) => {
		expect(history.length).toBe(1);
		expect(history.state).toBeNull();
		expect(history.pushState({ step: 1 }, "", "/route")).toBeUndefined();
		expect(history.replaceState({ step: 2 }, "", "?query")).toBeUndefined();
		expect(history.length).toBe(2);
	});
	await test.session.navigate(test.tab, "https://example.com/start");
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/route?query",
	);
	expect(test.session.page(test.tab).history.snapshot().state).toEqual({
		step: 2,
	});
	expect(test.session.history(test.tab).length).toBe(2);
	expect(test.requests).toHaveLength(1);
});

it("counts all session documents and restores state before reload scripts run", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.pushState({ saved: 1 }, "", "?saved");
	test.run(({ history }) => {
		expect(history.length).toBe(3);
		expect(history.state).toBeNull();
	});
	await test.session.navigate(test.tab, "https://example.com/second");
	test.seen[1].history.replaceState({ saved: 2 }, "");
	test.run(({ history }) => {
		expect(history.length).toBe(3);
		expect(history.state).toEqual({ saved: 2 });
		history.replaceState({ restored: true }, "", "?restored");
	});
	await test.session.reload(test.tab);
	expect(test.session.page(test.tab).history.snapshot().state).toEqual({
		restored: true,
	});
	expect(test.session.history(test.tab).length).toBe(3);
});

it("restores cross-document state before scripts and drops forward documents on a new parser-time branch", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.replaceState({ first: true }, "");
	await test.session.navigate(test.tab, "https://example.com/second");
	test.run(({ history }) => {
		expect(history.state).toEqual({ first: true });
		expect(history.length).toBe(2);
		history.pushState({ branch: true }, "", "?branch");
		expect(history.length).toBe(2);
	});
	await test.session.go(test.tab, -1);
	expect(
		test.session.history(test.tab).entries.map((entry) => entry.url),
	).toEqual(["https://example.com/first", "https://example.com/first?branch"]);
	expect(test.session.page(test.tab).history.snapshot().state).toEqual({
		branch: true,
	});
});

it("keeps forward documents when reload or restoration only replaces state", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	await test.session.navigate(test.tab, "https://example.com/second");
	await test.session.go(test.tab, -1);
	test.run(({ history }) => history.replaceState({ changed: true }, ""));
	await test.session.reload(test.tab);
	expect(test.session.history(test.tab).length).toBe(2);
	test.run(() => {});
	await test.session.go(test.tab, 1);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/second",
	);
});

it("drops forward documents on a new parser-time branch during reload", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	await test.session.navigate(test.tab, "https://example.com/second");
	await test.session.go(test.tab, -1);
	test.run(({ history }) => history.pushState(null, "", "?new"));
	await test.session.reload(test.tab);
	expect(
		test.session.history(test.tab).entries.map((entry) => entry.url),
	).toEqual(["https://example.com/first", "https://example.com/first?new"]);
});

it("validates session retention limits before changing state or URL", async () => {
	const test = fixture({ maxHistoryBytes: 512 });
	await test.session.navigate(test.tab, "https://example.com/first");
	const history = test.seen[0].history;
	const before = test.session.history(test.tab);
	expect(() =>
		history.pushState({ large: "x".repeat(1024) }, "", "/too-large"),
	).toThrow("budget");
	expect(history.state).toBeNull();
	expect(test.session.history(test.tab)).toEqual(before);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/first",
	);
});

it("retains the old page and archive when a candidate changes URL outside history", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const before = test.session.history(test.tab);
	const original = test.session.page(test.tab).document;
	test.run(({ tree, history }) => {
		history.pushState({ candidate: true }, "", "?candidate");
		tree.setUrl("https://example.com/untracked");
	});
	await expect(
		test.session.navigate(test.tab, "https://example.com/second"),
	).rejects.toThrow("outside its history");
	expect(test.session.page(test.tab).document).toBe(original);
	expect(test.session.history(test.tab)).toEqual(before);
	expect(test.seen[1].tree.nodeCount).toBe(0);
});

it("does not retarget the initial fragment merely because a parser script pushes a hash", async () => {
	const test = fixture();
	test.run(({ history }) => history.pushState(null, "", "#later"));
	await test.session.navigate(test.tab, "https://example.com/first#initial");
	const page = test.session.page(test.tab);
	expect(page.document.targetElement).toBe(
		page.queries.querySelector("#initial"),
	);
	expect(page.document.url).toBe("https://example.com/first#later");
});

it("requires the unused argument, preserves omitted URLs, and rejects unsafe or unsupported state atomically", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const history = test.seen[0].history;
	expect(() => history.pushState(null)).toThrow("arguments");
	history.replaceState({ value: 1 }, "", null);
	expect(() => history.pushState(null, "", "https://other.example/")).toThrow(
		"rewrite",
	);
	const cycle: unknown[] = [];
	cycle.push(cycle);
	expect(() => history.pushState(cycle, "")).toThrow("Cyclic");
	expect(() => history.replaceState(() => {}, "")).toThrow("finite JSON");
	expect(history.state).toEqual({ value: 1 });
	expect(history.length).toBe(1);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/first",
	);
});

it("returns detached JSON state and defers guest traversal", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const history = test.seen[0].history;
	const source = { nested: { value: 1 } };
	history.pushState(source, "");
	source.nested.value = 2;
	(history.state as typeof source).nested.value = 3;
	expect(history.state).toEqual({ nested: { value: 1 } });
	expect(history.go(100)).toBeUndefined();
	test.session.stop(test.tab);
	expect(history.length).toBe(2);
});

it("runs back/forward asynchronously through the owning session without reloading the document", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const history = test.seen[0].history;
	history.pushState({ step: 1 }, "", "#one");
	history.pushState({ step: 2 }, "", "#two");
	expect(history.back()).toBeUndefined();
	expect(history.state).toEqual({ step: 2 });
	await vi.advanceTimersByTimeAsync(5);
	expect(history.state).toEqual({ step: 1 });
	history.forward();
	await vi.advanceTimersByTimeAsync(5);
	expect(history.state).toEqual({ step: 2 });
	expect(test.requests).toHaveLength(1);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		completed: 2,
		failed: 0,
	});
});

it("defers parser-time traversal until commit and restores an earlier document", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	test.seen[0].history.replaceState({ saved: true }, "");
	vi.useFakeTimers();
	test.run(({ url, history }) => {
		if (url.endsWith("/second")) history.back();
	});
	await test.session.navigate(test.tab, "https://example.com/second");
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/second",
	);
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/first",
	);
	expect(test.seen.at(-1)?.history.state).toEqual({ saved: true });
	expect(test.requests).toHaveLength(3);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		completed: 1,
		canceled: 0,
	});
});

it("reloads for go() and retires additional work from the replaced document", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const history = test.seen[0].history;
	history.replaceState({ saved: true }, "");
	history.go();
	history.back();
	await vi.advanceTimersByTimeAsync(5);
	expect(test.requests).toHaveLength(2);
	expect(test.seen.at(-1)?.history.state).toEqual({ saved: true });
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		completed: 1,
		canceled: 1,
	});
	expect(() => history.state).toThrow("closed");
});

it("explicit navigation and stop cancel already queued page traversal", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	test.seen[0].history.go();
	test.session.stop(test.tab);
	await vi.advanceTimersByTimeAsync(5);
	expect(test.requests).toHaveLength(1);
	test.seen[0].history.go();
	await test.session.navigate(test.tab, "https://example.com/manual");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/manual",
	);
	expect(test.requests).toHaveLength(2);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		canceled: 2,
		completed: 0,
	});
});

it("discards traversal requested by a candidate that fails to commit", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	test.run(({ history, tree }) => {
		history.back();
		tree.setUrl("https://example.com/untracked");
	});
	await expect(
		test.session.navigate(test.tab, "https://example.com/failed"),
	).rejects.toThrow("outside its history");
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.page(test.tab).document.url).toBe(
		"https://example.com/first",
	);
	expect(test.requests).toHaveLength(2);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		canceled: 1,
		completed: 0,
	});
});

it("revokes the old History object on document replacement", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	const history = test.seen[0].history;
	await test.session.navigate(test.tab, "https://example.com/second");
	expect(() => history.state).toThrow("closed");
	expect(() => history.pushState(null, "")).toThrow("closed");
});

it("waits for the whole current event dispatch before executing guest traversal", async () => {
	const test = fixture();
	await test.session.navigate(test.tab, "https://example.com/first");
	vi.useFakeTimers();
	const history = test.seen[0].history;
	history.pushState(1, "", "#one");
	history.pushState(2, "", "#two");
	const page = test.session.page(test.tab);
	const target = page.interactions.events.windowTarget;
	if (target === null) throw new Error("Missing Window");
	let release!: () => void;
	const prefix = new Promise<void>((resolve) => {
		release = resolve;
	});
	const trace: string[] = [];
	page.interactions.events.addEventListener(
		target,
		"custom",
		controlledEventListener(async () => {
			history.back();
			await prefix;
			trace.push("prefix");
		}),
	);
	page.interactions.events.addEventListener(target, "custom", () => {
		trace.push("later");
	});
	const dispatch = page.interactions.events.dispatchEventAsync(
		target,
		new BrowserEvent("custom"),
	);
	await vi.advanceTimersByTimeAsync(5);
	expect(history.state).toBe(2);
	test.session.stop(test.tab);
	await vi.advanceTimersByTimeAsync(5);
	expect(test.session.metrics().pageTraversals[0]).toMatchObject({
		canceled: 1,
		active: false,
	});
	release();
	await dispatch;
	history.back();
	await vi.advanceTimersByTimeAsync(5);
	expect(history.state).toBe(1);
	expect(trace).toEqual(["prefix", "later"]);
});

it.each([
	[undefined, 0],
	[null, 0],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[true, 1],
	["-1", -1],
	["bad", 0],
	[1.9, 1],
	[-1.9, -1],
	[4294967297, 1],
	[2147483648, -2147483648],
])("converts primitive history delta %s to %s", (value, expected) => {
	const tree = new DocumentTree("https://example.com/");
	const traverse = vi.fn();
	const binding = new ScriptHistory(tree, factory, {
		snapshot: () => ({ state: null, length: 1 }),
		pushState() {},
		replaceState() {},
		navigate() {},
		traverse,
	});
	const history = binding.object as HistoryObject;
	history.go(value as number);
	expect(traverse).toHaveBeenCalledWith(expected);
	tree.close();
});
