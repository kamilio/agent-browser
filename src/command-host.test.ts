import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost, type CommandHostOptions } from "./command-host.js";
import { DocumentTree } from "./document.js";
import type { DomInspection } from "./dom-inspection.js";
import { controlledEventListener } from "./events.js";
import type { DocumentExtraction } from "./extraction.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageConsole } from "./page-console.js";
import { BrowserSession } from "./session.js";
import type { SnapshotSearch } from "./snapshot-search.js";
import type { SemanticSnapshot } from "./snapshot.js";

const hosts: BrowserCommandHost[] = [];
const url = "https://example.com/";

function fixture(
	options: Partial<CommandHostOptions> = {},
	wait?: (input: NetworkRequest) => Promise<void>,
) {
	const sessions = new Map<string, BrowserSession>();
	const requests: NetworkRequest[] = [];
	const host = new BrowserCommandHost({
		createSession: (name) => {
			const browser = new BrowserSession({
				createTransport: () => ({
					request: async (input): Promise<NetworkResponse> => {
						requests.push(input);
						await wait?.(input);
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
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
					for (const [tag, attributes] of [
						["input", { id: "name", "aria-label": "Name" }],
						[
							"input",
							{ id: "enabled", type: "checkbox", "aria-label": "Enabled" },
						],
						["a", { id: "next", href: "/next" }],
					] as [string, Record<string, string>][])
						tree.append(tree.root, tree.createElement(tag, attributes));
					return tree;
				},
			});
			sessions.set(name, browser);
			return browser;
		},
		...options,
	});
	hosts.push(host);
	return { host, sessions, requests };
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	vi.useRealTimers();
});

it("find searches live snapshots without consuming the snapshot diff baseline", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	const baseline = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	const search = (await host.execute(["find", "Name", "--context=0"]))
		.data as SnapshotSearch;
	expect(search.matched).toBe(1);
	await host.execute(["fill", search.matches[0].ref, "edited"]);
	const edited = (await host.execute(["find", "edited", "--max-results=1"]))
		.data as SnapshotSearch;
	expect(edited.matches[0].ref).toBe(search.matches[0].ref);
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		reset: false,
		fromRevision: baseline.revision,
		updated: [
			expect.objectContaining({ ref: search.matches[0].ref, value: "edited" }),
		],
	});
});

it("find supports bounded regex flags but rejects unsupported regular-expression features", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	expect(
		(await host.execute(["find", "--regex", "/name/i"])).data,
	).toMatchObject({ matched: 1 });
	await expect(
		host.execute(["find", "--regex", "(a)\\1"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect((await host.execute(["find", "absent"])).data).toMatchObject({
		matched: 0,
		truncated: false,
	});
});

it("waits for a native target to become enabled and dispatches only once", async () => {
	vi.useFakeTimers();
	const { host, sessions } = fixture();
	await host.execute(["open", url]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const page = browser.page(browser.tabs()[0].id);
	const node = page.document.createElement("button", {
		id: "late",
		disabled: "",
	});
	page.document.append(page.document.root, node);
	const listener = vi.fn();
	page.interactions.events.addEventListener(node, "click", listener);
	const waiting = host.execute(["click", "#late", "--timeout=100"]);
	await vi.advanceTimersByTimeAsync(30);
	expect(listener).not.toHaveBeenCalled();
	page.document.removeAttribute(node, "disabled");
	await vi.advanceTimersByTimeAsync(25);
	await waiting;
	expect(listener).toHaveBeenCalledTimes(1);
	expect(host.metrics().pendingCommands).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});

it("times out pre-action waiting without blocking the queue or dispatching later", async () => {
	vi.useFakeTimers();
	const { host, sessions } = fixture();
	await host.execute(["open", url]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const page = browser.page(browser.tabs()[0].id);
	const node = page.document.get(page.document.root).children[0];
	page.document.setAttribute(node, "readonly", "");
	const listener = vi.fn();
	page.interactions.events.addEventListener(node, "input", listener);
	const waiting = host.execute(["fill", "#name", "late", "--timeout=40"]);
	const rejected = expect(waiting).rejects.toMatchObject({ code: "timeout" });
	const queued = host.execute(["snapshot"]);
	await vi.advanceTimersByTimeAsync(45);
	await rejected;
	await queued;
	page.document.removeAttribute(node, "readonly");
	await vi.advanceTimersByTimeAsync(100);
	expect(listener).not.toHaveBeenCalled();
	expect(host.metrics().pendingCommands).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});

it("closes a session while its native action is waiting", async () => {
	vi.useFakeTimers();
	const { host } = fixture();
	await host.execute(["open", url]);
	const waiting = host.execute(["click", "#missing"]);
	const rejected = expect(waiting).rejects.toMatchObject({ code: "closed" });
	await vi.advanceTimersByTimeAsync(1);
	await host.execute(["close"]);
	await rejected;
	expect(host.metrics().pendingCommands).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});

it("inspects the shared live DOM by selector/ref without consuming snapshot diff baselines", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	const baseline = await host.execute(["snapshot"]);
	const first = (await host.execute(["dom", "#name", "--depth=0"]))
		.data as DomInspection;
	expect(first.nodes).toHaveLength(1);
	expect(first.nodes[0].name).toBe("input");
	await host.execute(["fill", first.root, "edited"]);
	const updated = (await host.execute(["dom", first.root]))
		.data as DomInspection;
	expect(updated.nodes[0].control?.value).toBe("edited");
	expect(updated.revision).toBeGreaterThan(first.revision);
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		reset: false,
		fromRevision: (baseline.data as SemanticSnapshot).revision,
		updated: [expect.objectContaining({ ref: first.root, value: "edited" })],
	});
	await expect(host.execute(["dom", "input"])).rejects.toMatchObject({
		code: "not-actionable",
	});
	await host.execute(["reload"]);
	await expect(host.execute(["dom", first.root])).rejects.toMatchObject({
		code: "stale-reference",
	});
});

it("routes role/test-ID targets through native actions and subtree inspection", async () => {
	const { host, sessions } = fixture();
	await host.execute(["open", url]);
	await host.execute([
		"fill",
		"getByRole('textbox', {name: 'Name', exact: true})",
		"locator value",
	]);
	const node = (
		await host.execute(["dom", "getByRole('textbox', {name: 'Name'})"])
	).data as DomInspection;
	expect(node.nodes[0].control?.value).toBe("locator value");
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const tree = browser.page(browser.tabs()[0].id).document;
	tree.setAttribute(tree.resolve(node.root).id, "data-testid", "name-field");
	await host.execute(["fill", "getByTestId('name-field')", "updated value"]);
	expect((await host.execute(["dom", node.root])).data).toMatchObject({
		nodes: [
			expect.objectContaining({
				control: expect.objectContaining({ value: "updated value" }),
			}),
		],
	});
	await host.execute(["check", "getByRole('checkbox', {name: 'Enabled'})"]);
	expect((await host.execute(["dom", "#enabled"])).data).toMatchObject({
		nodes: [
			expect.objectContaining({
				control: expect.objectContaining({ checked: true }),
			}),
		],
	});
	await expect(
		host.execute(["fill", "getByRole('textbox').first()", "must not apply"]),
	).rejects.toMatchObject({ code: "unsupported" });
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		locators: {
			partial: true,
			methods: [
				"getByRole",
				"getByTestId",
				"getByText",
				"getByLabel",
				"getByPlaceholder",
				"getByAltText",
				"getByTitle",
			],
			autoWait: true,
		},
	});
});

it("routes text, label and attribute locators through native state and observation", async () => {
	const { host, sessions, requests } = fixture();
	await host.execute(["open", url]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const page = browser.page(browser.tabs()[0].id);
	const name = page.queries.querySelector("#name");
	const next = page.queries.querySelector("#next");
	if (name === null || next === null) throw new Error("Missing fixture nodes");
	page.document.setAttribute(name, "placeholder", "Enter name");
	page.document.setAttribute(name, "title", "Name field");
	page.document.setTextContent(next, "Continue");
	await host.execute(["fill", "getByLabel('Name', {exact:true})", "first"]);
	await host.execute(["fill", "getByPlaceholder('enter name')", "second"]);
	expect(
		(await host.execute(["dom", "getByTitle('Name field')"])).data,
	).toMatchObject({
		nodes: [
			expect.objectContaining({
				control: expect.objectContaining({ value: "second" }),
			}),
		],
	});
	expect(
		(await host.execute(["snapshot", "getByText('Continue')"])).data,
	).toMatchObject({ scope: page.document.reference(next) });
	expect(requests).toHaveLength(1);
	await expect(
		host.execute([
			"fill",
			"getByLabel('Name', {exact: String('yes')})",
			"never",
		]),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it("owns route fulfillment in named sessions and exposes registration, use and removal", async () => {
	const { host, requests, sessions } = fixture();
	await host.execute(["-s=mock", "open"]);
	const added = await host.execute([
		"-s=mock",
		"route",
		"**/data",
		"--body=mocked",
		"--content-type=text/html",
	]);
	expect(added.data).toMatchObject({
		pattern: "**/data",
		status: 200,
		bodyBytes: 6,
	});
	expect((await host.execute(["-s=mock", "route-list"])).data).toMatchObject([
		{ pattern: "**/data" },
	]);
	await host.execute(["-s=mock", "goto", "https://example.com/data"]);
	expect(requests).toHaveLength(0);
	expect((await host.execute(["-s=mock", "requests"])).data).toMatchObject({
		entries: [{ routeId: 1, status: 200 }],
	});
	await host.execute(["-s=other", "open", "https://example.com/data"]);
	expect(requests).toHaveLength(1);
	expect((await host.execute(["-s=mock", "unroute", "**/data"])).data).toEqual({
		removed: 1,
	});
	expect((await host.execute(["-s=mock", "route-list"])).data).toEqual([]);
	await host.execute(["-s=mock", "reload"]);
	expect(requests).toHaveLength(2);
	await expect(
		host.execute(["-s=mock", "route", "**/*", "--remove-header=cookie"]),
	).rejects.toMatchObject({ code: "unsupported" });
	await host.execute(["-s=mock", "close"]);
	expect(sessions.get("mock")?.routes.metrics().closed).toBe(true);
});

it("validates route headers atomically and accepts repeated baseline header arguments", async () => {
	const { host, sessions } = fixture();
	await host.execute(["open"]);
	await host.execute([
		"route",
		"**/data",
		"--body={}",
		"--content-type=application/json",
		"--header=Access-Control-Allow-Origin: *",
		"--header=X-Test: first",
		"--header=X-Test: second",
	]);
	const browser = [...sessions.values()][0];
	expect(
		browser.routes.fulfill({ url: "https://example.com/data" })?.headers,
	).toMatchObject({
		"access-control-allow-origin": ["*"],
		"x-test": ["first, second"],
		"content-type": ["application/json"],
	});
	for (const options of [
		["--headers=broken"],
		["--headers=[]"],
		['--headers={"X-Test":false}'],
		["--header=missing-colon"],
		["--header=Transfer-Encoding: chunked"],
		["--header=Set-Cookie: private=1"],
	])
		await expect(
			host.execute(["route", "**/*", "--body=blocked", ...options]),
		).rejects.toBeDefined();
	expect(browser.routes.list()).toHaveLength(1);
	expect((await host.execute(["unroute"])).data).toEqual({ removed: 1 });
});

it("accepts redirect mock headers and rejects duplicate Location declarations atomically", async () => {
	const { host, sessions } = fixture();
	expect(host.capabilities().routing).toMatchObject({
		redirectFulfillment: true,
		transportRedirectHops: "adapter-dependent",
	});
	await host.execute(["open"]);
	await host.execute([
		"route",
		"**/start",
		"--status=302",
		"--header=Location: /next",
	]);
	const browser = [...sessions.values()][0];
	expect(
		browser.routes.fulfill({ url: "https://example.com/start" })?.headers
			.location,
	).toEqual(["/next"]);
	for (const headers of [
		["--header=Location: /one", "--header=location: /two"],
		['--headers={"Location":"/one","location":"/two"}'],
		['--headers={"Location":"/one"}', "--header=location: /two"],
	])
		await expect(
			host.execute(["route", "**/ambiguous", "--status=302", ...headers]),
		).rejects.toMatchObject({ code: "invalid-input" });
	expect(browser.routes.list()).toHaveLength(1);
});

it("reads redacted request diagnostics without fetching or changing the snapshot baseline", async () => {
	const { host, requests } = fixture();
	await host.execute(["open", `${url}?secret=value`]);
	await host.execute(["snapshot"]);
	expect((await host.execute(["requests"])).data).toMatchObject({
		partial: true,
		scope: "latest-network-navigation",
		navigation: 1,
		entries: [{ index: 0, url: `${url}?redacted`, state: "complete" }],
	});
	expect((await host.execute(["request", "0"])).data).toMatchObject({
		entry: { index: 0, kind: "document" },
	});
	for (const index of ["-1", "1.5", "0x0", "NaN", "01", "9007199254740992"])
		await expect(host.execute(["request", index])).rejects.toMatchObject({
			code: "invalid-input",
		});
	await expect(host.execute(["request", "2"])).rejects.toMatchObject({
		code: "not-found",
	});
	expect(requests).toHaveLength(1);
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		reset: false,
		updated: [],
		removed: [],
	});
});

it("does not advertise page fetch for a custom evaluator without an explicit capability", () => {
	expect(fixture().host.capabilities().pageFetch).toMatchObject({
		enabled: false,
	});
	expect(() => fixture({ pageFetch: true })).toThrow("explicit page evaluator");
});

it("provides an empty request journal before a tab has a document", async () => {
	const { host } = fixture();
	await host.execute(["open"]);
	expect((await host.execute(["requests"])).data).toMatchObject({
		document: null,
		entries: [],
	});
});

it("reads page-scoped console diagnostics with severity filtering and explicit availability", async () => {
	const { host, sessions } = fixture({
		evaluatePage: async () => ({
			engine: "poe-safe-js",
			partial: true,
			ok: true,
			metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
		}),
	});
	await host.execute(["open", url]);
	expect((await host.execute(["console"])).data).toMatchObject({
		started: false,
		entries: [],
	});
	const browser = [...sessions.values()][0];
	const page = browser.page(browser.tabs()[0].id);
	const console = new PageConsole(
		page.document,
		{ createHostObject: (definition) => ({ ...definition.methods }) },
		{ isClosed: () => false },
	);
	console.buffer.write("log", ["visible"]);
	console.buffer.write("error", ["failure"]);
	expect((await host.execute(["console", "error"])).data).toMatchObject({
		entries: [{ text: "failure" }],
	});
	await expect(host.execute(["console", "unknown"])).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(fixture().host.execute(["console"])).rejects.toMatchObject({
		code: "unsupported",
	});
});

it("extracts current whole-document and targeted HTML with bounded output", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	expect((await host.execute(["html", "#name"])).data).toMatchObject({
		url,
		partial: true,
		html: '<input id="name" aria-label="Name">',
	});
	expect((await host.execute(["html"])).data).toMatchObject({
		html: expect.stringContaining('id="next"'),
	});
	await expect(host.execute(["html", "input"])).rejects.toMatchObject({
		code: "not-actionable",
	});
	await expect(host.execute(["html", "#missing"])).rejects.toMatchObject({
		code: "not-found",
	});
	await expect(
		host.execute(["html", "#name", "--max-code-units=5"]),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it("reports document-write support separately from general dynamic script insertion", () => {
	const disabled = fixture().host;
	expect(disabled.capabilities().scriptLoading.documentWrite.mode).toBe(
		"disabled",
	);
	const enabled = fixture({
		websiteScripts: true,
		evaluatePage: async () => ({
			engine: "poe-safe-js",
			partial: true,
			ok: true,
			metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
		}),
	}).host;
	expect(enabled.capabilities().scriptLoading).toMatchObject({
		dynamicInsertion: false,
		documentWrite: {
			mode: "parser-blocking-subset",
			nestedInline: false,
			documentReplacement: false,
		},
	});
});

it("exposes manual page evaluation only when a trusted evaluator is supplied", async () => {
	const evaluatePage = vi.fn(async () => ({
		engine: "poe-safe-js" as const,
		partial: true as const,
		ok: true,
		value: 42,
		metrics: { steps: 1, peakCallDepth: 1, peakDataSize: 1, consoleCalls: 0 },
	}));
	const { host, sessions } = fixture({ evaluatePage });
	await host.execute(["open", url]);
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		pageEvaluation: true,
		websiteJavaScript: false,
	});
	expect((await host.execute(["eval", "answer"])).data).toMatchObject({
		ok: true,
		value: 42,
	});
	const browser = [...sessions.values()][0];
	expect(evaluatePage).toHaveBeenCalledWith(
		browser.page(browser.tabs()[0].id),
		"answer",
		expect.any(AbortSignal),
	);
	await expect(host.execute(["eval", "answer", "e1"])).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(evaluatePage).toHaveBeenCalledTimes(1);
});

it("runs fill, type and check commands through controlled native phases", async () => {
	const { host, sessions } = fixture();
	await host.execute(["open", url]);
	const browser = [...sessions.values()][0];
	const page = browser.page(browser.tabs()[0].id);
	const nodes = [...page.document.walk()].map(({ node }) => node);
	const input = nodes.find((node) => node.attributes.id === "name");
	const checkbox = nodes.find((node) => node.attributes.id === "enabled");
	if (!input || !checkbox) throw new Error("Missing controls");
	let edits = 0;
	page.interactions.events.addEventListener(
		input.id,
		"beforeinput",
		controlledEventListener(async () => {
			await Promise.resolve();
			edits++;
		}),
	);
	page.interactions.events.addEventListener(
		checkbox.id,
		"click",
		controlledEventListener(async () => {
			await Promise.resolve();
		}),
	);
	await host.execute(["fill", "#name", "first"]);
	await host.execute(["type", "x"]);
	await host.execute(["check", "#enabled"]);
	expect(edits).toBe(2);
	expect(page.document.get(checkbox.id).control.checked).toBe(true);
});

it("provides honest help/capabilities without opening sessions or executing page code", async () => {
	const { host } = fixture();
	expect((await host.execute(["capabilities"])).data).toMatchObject({
		websiteJavaScript: false,
		fullPlaywrightCliSuperset: false,
		snapshotSearch: {
			streaming: true,
			maxDocumentNodes: 50_000,
			maxStringLength: 4096,
			maxWork: 4_000_000,
		},
		domMutations: {
			partial: true,
			parentNode: ["append", "prepend", "replaceChildren"],
			childNode: ["before", "after", "replaceWith", "remove"],
			replaceChild: true,
			maxArguments: 1024,
			objectStringCoercion: false,
			crossDocumentAdoption: false,
			mutationObservers: false,
		},
		htmlInsertion: {
			partial: true,
			innerHTML: true,
			outerHTML: true,
			insertAdjacentHTML: [
				"beforebegin",
				"afterbegin",
				"beforeend",
				"afterend",
			],
			insertedScripts: "inert",
			trustedTypes: false,
			sanitization: false,
		},
	});
	expect((await host.execute(["--version"])).data).toMatchObject({
		version: "0.1.0",
	});
	expect((await host.execute(["fill", "--help"])).data).toMatchObject({
		commands: [expect.objectContaining({ name: "fill" })],
	});
	await expect(host.execute(["eval", "process.exit()"])).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(host.metrics().sessions).toBe(0);
});

it.each([
	["open", url, "--browser=firefox"],
	["open", "--persistent"],
	["open", "--config=fixture.json"],
	["snapshot", "--filename=fixture.yaml"],
	["snapshot", "--boxes"],
	["fill", "#name", "value", "--unsupported"],
	["click", "#name", "right"],
	["text", "--columns=80"],
	["open", "--timeout=0"],
])(
	"rejects unsupported semantics before creating state: %j",
	async (...argv) => {
		const { host } = fixture();
		await expect(host.execute(argv)).rejects.toThrow();
		expect(host.metrics().sessions).toBe(0);
	},
);

it("runs named-session workflows using stable references and strict CSS targets", async () => {
	const { host, sessions } = fixture();
	await host.execute(["-s=work", "open", url]);
	const snapshot = (await host.execute(["-s=work", "snapshot"]))
		.data as SemanticSnapshot;
	const field = snapshot.entries.find((entry) => entry.name === "Name");
	if (!field) throw new Error("Missing input");
	await host.execute(["-s=work", "fill", field.ref, "agent value"]);
	await host.execute(["-s=work", "check", "#enabled"]);
	const diff = (await host.execute(["-s=work", "snapshot", "--diff"])).data;
	expect(diff).toMatchObject({
		reset: false,
		updated: expect.arrayContaining([
			expect.objectContaining({ value: "agent value" }),
			expect.objectContaining({ checked: true }),
		]),
	});
	await expect(
		host.execute(["-s=work", "click", "input"]),
	).rejects.toMatchObject({ code: "not-actionable" });
	await host.execute(["-s=work", "click", "#next"]);
	expect(sessions.get("work")?.tabs()[0].url).toBe("https://example.com/next");
	await expect(
		host.execute(["-s=work", "fill", field.ref, "stale"]),
	).rejects.toThrow();
});

it("maintains indexed tabs and isolated storage across named sessions", async () => {
	const { host } = fixture();
	await host.execute(["open", url], { session: "one" });
	await host.execute(["localstorage-set", "key", "local"], { session: "one" });
	await host.execute(["sessionstorage-set", "key", "tab-only"], {
		session: "one",
	});
	await host.execute(["tab-new", url], { session: "one" });
	expect(
		(await host.execute(["localstorage-get", "key"], { session: "one" })).data,
	).toEqual({ value: "local" });
	expect(
		(await host.execute(["sessionstorage-get", "key"], { session: "one" }))
			.data,
	).toEqual({ value: null });
	await host.execute(["tab-select", "0"], { session: "one" });
	expect(
		(await host.execute(["sessionstorage-get", "key"], { session: "one" }))
			.data,
	).toEqual({ value: "tab-only" });
	await host.execute(["open", url], { session: "two" });
	expect(
		(await host.execute(["localstorage-get", "key"], { session: "two" })).data,
	).toEqual({ value: null });
	await host.execute(["tab-close", "1"], { session: "one" });
	expect(
		(await host.execute(["tab-list"], { session: "one" })).data,
	).toHaveLength(1);
});

it("observer snapshots do not consume CLI diff baselines", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	await host.execute(["snapshot"]);
	await host.execute(["fill", "#name", "observed"]);
	await host.execute(["snapshot", "--observe"]);
	await expect(
		host.execute(["snapshot", "--observe", "--diff"]),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		updated: [expect.objectContaining({ value: "observed" })],
	});
});

it("extracts live scoped content without fetching again or consuming snapshot diffs", async () => {
	const { host, sessions, requests } = fixture();
	await host.execute(["open", url]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const tree = browser.page(browser.tabs()[0].id).document;
	const article = tree.createElement("article", { id: "article" });
	const heading = tree.createElement("h2");
	tree.append(tree.root, article);
	tree.append(article, heading);
	tree.setTextContent(heading, "Before");
	await host.execute(["snapshot"]);
	tree.setTextContent(heading, "After");
	const result = (await host.execute(["extract", "#article"]))
		.data as DocumentExtraction;
	expect(result).toMatchObject({
		format: "markdown",
		scope: tree.reference(article),
		content: "## After\n",
	});
	const structured = (
		await host.execute(["extract", tree.reference(article), "--format=json"])
	).data as DocumentExtraction;
	expect(structured.format).toBe("json");
	expect(JSON.stringify(structured.content)).toContain(tree.reference(heading));
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		updated: [expect.objectContaining({ name: "After" })],
	});
	expect(requests).toHaveLength(1);
});

it("rejects unsupported extraction formats, excess output and stale roots", async () => {
	const { host, sessions } = fixture();
	await host.execute(["open", url]);
	await expect(host.execute(["extract", "--format=pdf"])).rejects.toMatchObject(
		{ code: "unsupported" },
	);
	await expect(
		host.execute(["extract", "--max-nodes=1"]),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(host.execute(["extract", "--depth=1025"])).rejects.toMatchObject(
		{ code: "invalid-input" },
	);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing fixture session");
	const tree = browser.page(browser.tabs()[0].id).document;
	const paragraph = tree.createElement("p");
	tree.append(tree.root, paragraph);
	tree.setTextContent(paragraph, "wide ".repeat(1000));
	await expect(
		host.execute(["extract", "--max-bytes=256"]),
	).rejects.toMatchObject({ code: "resource-limit" });
	const ref = tree.reference(paragraph);
	tree.remove(paragraph);
	await expect(host.execute(["extract", ref])).rejects.toMatchObject({
		code: "stale-reference",
	});
});

it("does not let returned snapshot mutation corrupt cached diffs", async () => {
	const { host } = fixture();
	await host.execute(["open", url]);
	const snapshot = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	snapshot.entries[0].name = "tampered";
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		reset: false,
		updated: [],
	});
	await host.execute(["close"]);
	expect(host.metrics().cachedSnapshotBytes).toBe(0);
});

it("bounds snapshot caching and resets diffs when no prior snapshot can be retained", async () => {
	const { host } = fixture({ maxSnapshotCacheBytes: 1 });
	await host.execute(["open", url]);
	await host.execute(["snapshot"]);
	expect(host.metrics().cachedSnapshotBytes).toBe(0);
	expect((await host.execute(["snapshot", "--diff"])).data).toMatchObject({
		reset: true,
	});
});

it("serializes commands per session and cancels queued mutations when their deadlines expire", async () => {
	let release = () => {};
	let start = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		start = resolve;
	});
	const { host } = fixture({}, async () => {
		start();
		await gate;
	});
	const opening = host.execute(["open", url, "--timeout=1000"]);
	await started;
	await expect(
		host.execute(["fill", "#name", "must-not-run", "--timeout=10"]),
	).rejects.toMatchObject({ code: "timeout" });
	release();
	await opening;
	const snapshot = (await host.execute(["snapshot"])).data as SemanticSnapshot;
	expect(snapshot.entries.find((entry) => entry.name === "Name")?.value).toBe(
		"",
	);
	expect(host.metrics().pendingCommands).toBe(0);
});

it("close cancels active work out of band and only affects the designated session", async () => {
	let release = () => {};
	let start = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		start = resolve;
	});
	const { host } = fixture({}, async (request) => {
		if (request.url.endsWith("/slow")) {
			start();
			await gate;
		}
	});
	await host.execute(["-s=other", "open"]);
	const opening = host.execute(["open", `${url}slow`]);
	const rejection = expect(opening).rejects.toMatchObject({ code: "closed" });
	await started;
	await host.execute(["close"]);
	await rejection;
	release();
	expect((await host.execute(["list"])).data).toEqual([
		expect.objectContaining({ name: "other" }),
	]);
	await vi.waitFor(() => expect(host.metrics().pendingCommands).toBe(0));
});

it("prevents shared browser instances from violating named-session isolation", async () => {
	const first = fixture();
	await first.host.execute(["open"]);
	const browser = first.sessions.get("default");
	if (!browser) throw new Error("Missing session");
	const second = fixture({ createSession: () => browser });
	await expect(second.host.execute(["open"])).rejects.toThrow("already owned");
	expect(browser.metrics().closed).toBe(false);
});

it("bounds named sessions and pending work, and does not leak credentials through metrics", async () => {
	const { host } = fixture({ maxSessions: 1, maxCommands: 2 });
	await host.execute(["open", url]);
	await expect(host.execute(["-s=other", "open"])).rejects.toMatchObject({
		code: "resource-limit",
	});
	await host.execute(["localstorage-set", "private", "synthetic-secret"]);
	await expect(host.execute(["snapshot"])).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(JSON.stringify(host.metrics())).not.toContain("synthetic-secret");
	await host.execute(["close-all"]);
	expect(host.metrics().sessions).toBe(0);
});
