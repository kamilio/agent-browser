import { afterEach, expect, it, vi } from "vitest";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { commands } from "./commands.js";
import { controlValue } from "./controls.js";
import { AgentBrowserError } from "./errors.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { PageConsole } from "./page-console.js";
import { SecretBroker, type SecretProvider } from "./secret-providers.js";
import { BrowserSession } from "./session.js";

const sentinel = "SYNTHETIC_ONLY_secret_9zQ7";
const transformed = [...sentinel].reverse().join("");
const origin = "https://fixture.invalid";
const hosts: BrowserCommandHost[] = [];
const fixed = { completed: true, confidential: true };
const markup =
	'<title>Public</title><main><input id="password" type="password"><input id="text"><input id="readonly" type="password" readonly><input id="disabled" type="password" disabled><input id="check" type="checkbox"><select id="select"><option value="one">One</option></select><button id="button">Continue</button><a id="link" href="/public">Navigate</a><p id="copy">Public</p></main>';

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<Value>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return { promise, resolve, reject };
}

function noSecret(value: unknown) {
	const serialized =
		value instanceof Error
			? `${value.name}: ${value.message} ${value.stack} ${JSON.stringify(value)}`
			: JSON.stringify(value);
	expect(serialized).not.toContain(sentinel);
	expect(serialized).not.toContain(transformed);
}

async function fixture(
	provider: SecretProvider = { resolve: async () => sentinel },
	options: { url?: string; unavailable?: boolean } = {},
) {
	const resolve = vi.fn(provider.resolve.bind(provider));
	const sessions = new Map<string, BrowserSession>();
	const requests: string[] = [];
	const evaluatePage = vi.fn(async () => ({
		engine: "poe-safe-js" as const,
		partial: true as const,
		ok: true,
		value: sentinel,
		metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
	}));
	const host = new BrowserCommandHost({
		timeoutMs: 500,
		evaluatePage,
		secrets: options.unavailable
			? undefined
			: new SecretBroker({
					providers: { synthetic: { resolve } },
					bindings: {
						PASSWORD: {
							provider: "synthetic",
							key: "synthetic-key",
							origins: [origin],
						},
					},
				}),
		createSession: (name) => {
			const browser = new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input.url);
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
					close() {},
				}),
				loadDocument: (response) => parseHtmlDocument(markup, response.url),
			});
			sessions.set(name, browser);
			return browser;
		},
	});
	hosts.push(host);
	await host.execute(["open", options.url ?? `${origin}/login`]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing synthetic session");
	const page = browser.page(browser.tabs()[0].id);
	const password = page.queries.querySelector("#password");
	if (password === null) throw new Error("Missing synthetic password input");
	return {
		host,
		browser,
		page,
		password,
		resolve,
		sessions,
		requests,
		evaluatePage,
	};
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
});

it("parses only the reference command and does not need a live provider", async () => {
	expect(
		parseInvocation(["fill-secret", "#password", "secret:PASSWORD"]).arguments,
	).toEqual(["#password", "secret:PASSWORD"]);
	const { host, resolve } = await fixture(undefined, { unavailable: true });
	await expect(
		host.execute(["fill-secret", "#password", "secret:PASSWORD"]),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(resolve).not.toHaveBeenCalled();
});

it.each([
	[`${origin}/login`, "#text", "secret:PASSWORD"],
	[`${origin}/login`, "#readonly", "secret:PASSWORD"],
	[`${origin}/login`, "#disabled", "secret:PASSWORD"],
	[`${origin}/login`, "#password", "secret:UNKNOWN"],
	[`${origin}/login`, "#password", "PASSWORD"],
	["https://other.invalid/login", "#password", "secret:PASSWORD"],
	["http://fixture.invalid/login", "#password", "secret:PASSWORD"],
	["https://fixture.invalid:444/login", "#password", "secret:PASSWORD"],
	["https://sub.fixture.invalid/login", "#password", "secret:PASSWORD"],
])("rejects %s %s %s before resolving", async (url, target, reference) => {
	const { host, resolve } = await fixture(undefined, { url });
	const result = await host
		.execute(["fill-secret", target, reference, "--timeout=40"])
		.catch((error: unknown) => error);
	expect(result).toBeInstanceOf(Error);
	noSecret(result);
	expect(resolve).not.toHaveBeenCalled();
});

it("seals before resolution, clears retained outputs, and blocks queued reads", async () => {
	const started = deferred<void>();
	const secret = deferred<string>();
	const { host, page, password } = await fixture({
		resolve: async () => {
			started.resolve();
			return secret.promise;
		},
	});
	await host.execute(["snapshot"]);
	await host.execute(["screenshot", "#password"]);
	await host.execute(["state-export"]);
	await host.execute(["tracing-start"]);
	expect(host.metrics().cachedSnapshotBytes).toBeGreaterThan(0);
	expect(host.metrics().captureArtifacts.artifacts).toBeGreaterThan(0);
	expect(host.metrics().stateTransfers.transfers).toBeGreaterThan(0);
	const fill = host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
	const queued = [
		"html",
		"snapshot",
		"tracing-stop",
		"artifact-list",
		"state-export",
	].map((command) => host.execute([command]).catch((error: unknown) => error));
	await started.promise;
	expect((await host.execute(["list"])).data).toEqual([
		{ name: "default", confidential: true },
	]);
	expect(host.metrics()).toMatchObject({
		cachedSnapshotBytes: 0,
		captureArtifacts: { artifacts: 0, bytes: 0 },
		stateTransfers: { transfers: 0, bytes: 0 },
	});
	secret.resolve(sentinel);
	expect((await fill).data).toEqual(fixed);
	expect(controlValue(page.document, password)).toBe(sentinel);
	for (const result of await Promise.all(queued)) {
		expect(result).toMatchObject({ code: "policy-denied" });
		noSecret(result);
	}
});

it("blocks every non-action command after a malicious input listener copies and transforms the value", async () => {
	const { host, page, password, evaluatePage } = await fixture();
	const pageConsole = new PageConsole(
		page.document,
		{ createHostObject: (definition) => ({ ...definition.methods }) },
		{ isClosed: () => false },
	);
	let copied = false;
	page.interactions.events.addEventListener(password, "input", () => {
		const value = controlValue(page.document, password);
		const copy = page.queries.querySelector("#copy");
		const title = page.queries.querySelector("title");
		if (copy === null || title === null)
			throw new Error("Missing synthetic copy targets");
		page.document.setTextContent(copy, value);
		page.document.setTextContent(title, [...value].reverse().join(""));
		page.document.setUrl(`${origin}/${value}?copy=${transformed}`);
		pageConsole.buffer.write("error", [value, transformed], "callback");
		copied = true;
	});
	expect(
		(await host.execute(["fill-secret", "#password", "secret:PASSWORD"])).data,
	).toEqual(fixed);
	expect(copied).toBe(true);
	expect(page.document.url).toContain(sentinel);
	expect(JSON.stringify(pageConsole.buffer.read())).toContain(sentinel);
	const actions = new Set([
		"fill-secret",
		"fill",
		"type",
		"click",
		"press",
		"check",
		"uncheck",
		"select",
		"hover",
		"goto",
		"go-back",
		"go-forward",
		"reload",
	]);
	const globals = new Set([
		"help",
		"capabilities",
		"list",
		"close",
		"close-all",
	]);
	for (const command of commands.values()) {
		if (actions.has(command.name) || globals.has(command.name)) continue;
		const argv = [
			command.name,
			...Array.from({ length: command.minimumArguments }, () => "synthetic"),
		];
		const result = await host.execute(argv).catch((error: unknown) => error);
		expect(result, command.name).toBeInstanceOf(Error);
		noSecret(result);
	}
	for (const command of ["list", "capabilities", "help"])
		noSecret(await host.execute([command]));
	expect((await host.execute(["list"])).data).toEqual([
		{ name: "default", confidential: true },
	]);
	expect(evaluatePage).not.toHaveBeenCalled();
});

it.each([
	["fill", "#text", "public"],
	["type", "public"],
	["click", "#button"],
	["press", "Tab"],
	["check", "#check"],
	["uncheck", "#check"],
	["select", "#select", "one"],
	["hover", "#button"],
	["fill-secret", "#password", "secret:PASSWORD"],
	["goto", `${origin}/next`],
	["reload"],
])("returns only the fixed acknowledgment for %s", async (...argv) => {
	const { host } = await fixture();
	await host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
	expect((await host.execute(argv)).data).toEqual(fixed);
});

it("sanitizes page event failures after the secret reaches the page", async () => {
	const { host, page, password } = await fixture();
	page.interactions.events.addEventListener(
		password,
		"input",
		controlledEventListener(async () => {
			throw new Error(`${sentinel}:${transformed}`);
		}),
	);
	const result = await host
		.execute(["fill-secret", "#password", "secret:PASSWORD"])
		.catch((error: unknown) => error);
	noSecret(result);
	expect(controlValue(page.document, password)).toBe(sentinel);
	await expect(host.execute(["html"])).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it("keeps the session sealed when the provider fails with private details", async () => {
	const { host } = await fixture({
		resolve: async () => {
			throw new Error(`${sentinel}:${transformed}`);
		},
	});
	const result = await host
		.execute(["fill-secret", "#password", "secret:PASSWORD"])
		.catch((error: unknown) => error);
	expect(result).toMatchObject({ code: "policy-denied" });
	noSecret(result);
	expect((await host.execute(["list"])).data).toEqual([
		{ name: "default", confidential: true },
	]);
	await expect(host.execute(["html"])).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it.each(["abort", "close", "timeout"])(
	"does not deliver a late provider result after %s",
	async (action) => {
		const started = deferred<void>();
		const secret = deferred<string>();
		const { host, page, password, sessions } = await fixture({
			resolve: async () => {
				started.resolve();
				return secret.promise;
			},
		});
		const controller = new AbortController();
		let delivered = false;
		page.interactions.events.addEventListener(password, "input", () => {
			delivered = true;
		});
		const fill = host
			.execute(
				["fill-secret", "#password", "secret:PASSWORD", "--timeout=100"],
				{ signal: controller.signal },
			)
			.catch((error: unknown) => error);
		await started.promise;
		if (action === "abort") controller.abort(new Error(sentinel));
		if (action === "close") await host.execute(["close"]);
		const result = await fill;
		expect(result).toBeInstanceOf(Error);
		noSecret(result);
		if (action !== "close") {
			await expect(host.execute(["html"])).rejects.toMatchObject({
				code: "policy-denied",
			});
			expect(controlValue(page.document, password)).toBe("");
			await host.execute(["close"]);
		}
		await host.execute(["open", `${origin}/fresh`]);
		const fresh = sessions.get("default");
		if (!fresh) throw new Error("Missing recreated synthetic session");
		expect(fresh.page(fresh.tabs()[0].id).document).not.toBe(page.document);
		secret.resolve(sentinel);
		noSecret(await host.execute(["html"]));
		expect(delivered).toBe(false);
		expect((await host.execute(["list"])).data).not.toEqual([
			{ name: "default", confidential: true },
		]);
	},
);

it.each(["navigate", "text", "readonly", "disabled", "remove"])(
	"revalidates the target after asynchronous provider resolution: %s",
	async (mutation) => {
		const started = deferred<void>();
		const secret = deferred<string>();
		const { host, browser, page, password } = await fixture({
			resolve: async () => {
				started.resolve();
				return secret.promise;
			},
		});
		let delivered = false;
		page.interactions.events.addEventListener(password, "input", () => {
			delivered = true;
		});
		const fill = host
			.execute(["fill-secret", "#password", "secret:PASSWORD"])
			.catch((error: unknown) => error);
		await started.promise;
		if (mutation === "navigate")
			await browser.navigate(
				browser.tabs()[0].id,
				"https://other.invalid/replaced",
			);
		else if (mutation === "remove") page.document.remove(password);
		else
			page.document.setAttribute(
				password,
				mutation === "text" ? "type" : mutation,
				mutation === "text" ? "text" : "",
			);
		secret.resolve(sentinel);
		const result = await fill;
		expect(result).toMatchObject({ code: "policy-denied" });
		noSecret(result);
		expect(delivered).toBe(false);
	},
);

it.each(["focus", "beforeinput"])(
	"does not commit a secret to an input retyped during %s",
	async (event) => {
		const { host, page, password } = await fixture();
		page.interactions.events.addEventListener(password, event, () => {
			page.document.setAttribute(password, "type", "text");
		});
		const result = await host
			.execute(["fill-secret", "#password", "secret:PASSWORD"])
			.catch((error: unknown) => error);
		noSecret(result);
		expect(controlValue(page.document, password)).toBe("");
		expect(result).toMatchObject({ code: "policy-denied" });
	},
);

it("does not resolve a pre-aborted secret command", async () => {
	const { host, resolve } = await fixture();
	const result = await host
		.execute(["fill-secret", "#password", "secret:PASSWORD"], {
			signal: AbortSignal.abort(new Error(sentinel)),
		})
		.catch((error: unknown) => error);
	expect(result).toMatchObject({ code: "aborted" });
	noSecret(result);
	expect(resolve).not.toHaveBeenCalled();
});

it("keeps all tabs sealed across navigation and preserves independent public sessions", async () => {
	const { host, browser, page, password } = await fixture();
	await host.execute(["tab-new", `${origin}/other-tab`]);
	await host.execute(["tab-select", "0"]);
	await host.execute(["open", `${origin}/public`], { session: "public" });
	page.interactions.events.addEventListener(password, "input", () => {
		const sibling = browser.page(browser.tabs()[1].id);
		sibling.document.setUrl(`${origin}/${sentinel}`);
	});
	await host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
	noSecret(await host.execute(["list"]));
	await expect(host.execute(["tab-select", "1"])).rejects.toMatchObject({
		code: "policy-denied",
	});
	for (const argv of [
		["goto", `${origin}/next`],
		["go-back"],
		["go-forward"],
		["reload"],
	]) {
		expect((await host.execute(argv)).data).toEqual(fixed);
		await expect(host.execute(["html"])).rejects.toMatchObject({
			code: "policy-denied",
		});
	}
	noSecret(await host.execute(["html"], { session: "public" }));
	expect((await host.execute(["close-all"])).data).toEqual({ closed: true });
	expect((await host.execute(["list"])).data).toEqual([]);
});

it("revokes pre-fill artifact and transfer handles even after reopening the name", async () => {
	const { host } = await fixture();
	const artifact = (await host.execute(["screenshot", "#password"])).data as {
		id: string;
	};
	const transfer = (await host.execute(["state-export"])).data as {
		id: string;
	};
	expect(artifact.id).toEqual(expect.any(String));
	expect(transfer.id).toEqual(expect.any(String));
	await host.execute(["tracing-start"]);
	await host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
	const reads = [
		["artifact-read", artifact.id],
		["state-transfer-read", transfer.id, "0"],
	];
	for (const argv of reads)
		await expect(host.execute(argv)).rejects.toMatchObject({
			code: "policy-denied",
		});
	await host.execute(["close"]);
	await host.execute(["open", `${origin}/fresh`]);
	for (const argv of reads)
		await expect(host.execute(argv)).rejects.toMatchObject({
			code: "not-found",
		});
	expect((await host.execute(["artifact-list"])).data).toEqual([]);
	noSecret(await host.execute(["tracing-status"]));
});

it.each([
	{ argv: ["fill", "#text", "public"], target: "#text", event: "input" },
	{ argv: ["type", "public"], target: "#password", event: "input" },
	{ argv: ["click", "#button"], target: "#button", event: "click" },
	{ argv: ["press", "Tab"], target: "#password", event: "keydown" },
	{ argv: ["hover", "#button"], target: "#button", event: "mouseover" },
])(
	"withholds secret-bearing listener failures during $argv",
	async ({ argv, target, event }) => {
		for (const propagated of [false, true]) {
			const { host, page } = await fixture();
			await host.execute(["open", `${origin}/public`], { session: "public" });
			const before = await host.execute(["list"]);
			await host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
			const node = page.queries.querySelector(target);
			if (node === null) throw new Error("Missing synthetic action target");
			const listener = vi.fn(async () => {
				page.document.setUrl(`${origin}/${sentinel}?copy=${transformed}`);
				if (propagated)
					throw new AgentBrowserError("closed", `${sentinel}:${transformed}`);
				throw new Error(`${sentinel}:${transformed}`);
			});
			page.interactions.events.addEventListener(
				node,
				event,
				controlledEventListener(listener),
			);
			const result = await host.execute(argv).catch((error: unknown) => error);
			expect(listener).toHaveBeenCalled();
			expect(page.document.url).toContain(sentinel);
			if (propagated)
				expect(result).toMatchObject({
					code: "policy-denied",
					message: "Confidential command did not complete; details withheld",
				});
			else expect(result).toMatchObject({ data: fixed });
			noSecret(result);
			noSecret(before);
			const aggregate = await host.execute(["list"], { session: "public" });
			noSecret(aggregate);
			expect(aggregate.data).toEqual([
				{ name: "default", confidential: true },
				expect.objectContaining({ name: "public", tabs: expect.any(Array) }),
			]);
			await expect(host.execute(["html"])).rejects.toMatchObject({
				code: "policy-denied",
			});
		}
	},
);

it("withholds secret-derived link destinations across click and reload", async () => {
	const { host, page, password, requests } = await fixture();
	const link = page.queries.querySelector("#link");
	if (link === null) throw new Error("Missing synthetic navigation link");
	page.interactions.events.addEventListener(password, "input", () => {
		const value = controlValue(page.document, password);
		page.document.setAttribute(link, "href", `${origin}/${value}`);
	});
	await host.execute(["fill-secret", "#password", "secret:PASSWORD"]);
	for (const argv of [["click", "#link"], ["reload"]]) {
		const result = await host.execute(argv);
		expect(result.data).toEqual(fixed);
		noSecret(result);
		expect(requests.at(-1)).toBe(`${origin}/${sentinel}`);
		noSecret(await host.execute(["list"]));
	}
});

it.each(["getter", "reject"])(
	"sanitizes a provider thenable's secret-bearing %s failure",
	async (failure) => {
		const then = vi.fn(
			(_resolve: unknown, reject: (reason: unknown) => void) => {
				reject(new Error(`${sentinel}:${transformed}`));
			},
		);
		const getter = vi.fn(() => {
			if (failure === "getter") throw new Error(`${sentinel}:${transformed}`);
			return then;
		});
		const { host, page, password, resolve } = await fixture({
			resolve: () =>
				Object.defineProperty({}, "then", { get: getter }) as Promise<string>,
		});
		const result = await host
			.execute(["fill-secret", "#password", "secret:PASSWORD"])
			.catch((error: unknown) => error);
		expect(resolve).toHaveBeenCalledOnce();
		expect(getter).toHaveBeenCalledOnce();
		expect(then).toHaveBeenCalledTimes(failure === "getter" ? 0 : 1);
		expect(result).toMatchObject({ code: "policy-denied" });
		noSecret(result);
		expect(controlValue(page.document, password)).toBe("");
		expect((await host.execute(["list"])).data).toEqual([
			{ name: "default", confidential: true },
		]);
		await expect(host.execute(["html"])).rejects.toMatchObject({
			code: "policy-denied",
		});
	},
);

it.each([origin, "https://other.invalid", "http://fixture.invalid"])(
	"preserves the authorized origin during a pending provider and URL rewrite to %s",
	async (nextOrigin) => {
		const started = deferred<void>();
		const secret = deferred<string>();
		const { host, browser, page, password } = await fixture({
			resolve: async () => {
				started.resolve();
				return secret.promise;
			},
		});
		const fill = host
			.execute(["fill-secret", "#password", "secret:PASSWORD"])
			.catch((error: unknown) => error);
		await started.promise;
		if (nextOrigin === origin) page.document.setUrl(`${nextOrigin}/changed`);
		else
			expect(() => page.document.setUrl(`${nextOrigin}/changed`)).toThrow(
				"Document URL rewrite is not permitted",
			);
		expect(browser.page(browser.tabs()[0].id).document).toBe(page.document);
		expect(new URL(page.document.url).origin).toBe(origin);
		secret.resolve(sentinel);
		const result = await fill;
		expect(result).toMatchObject({ data: fixed });
		expect(controlValue(page.document, password)).toBe(sentinel);
		noSecret(result);
		expect((await host.execute(["list"])).data).toEqual([
			{ name: "default", confidential: true },
		]);
	},
);

it.each(["resolve", "reject"])(
	"isolates queued commands across alias close/reopen and late provider %s",
	async (settlement) => {
		const started = deferred<void>();
		const secret = deferred<string>();
		const { host, page, password, sessions } = await fixture({
			resolve: async () => {
				started.resolve();
				return secret.promise;
			},
		});
		const delivered = vi.fn();
		page.interactions.events.addEventListener(password, "input", delivered);
		const fill = host
			.execute(["-s=default", "fill-secret", "#password", "secret:PASSWORD"])
			.catch((error: unknown) => error);
		await started.promise;
		const queued = [
			["--session=default", "html"],
			["-s", "default", "fill", "#text", "old-queued-write"],
		].map((argv) => host.execute(argv).catch((error: unknown) => error));
		expect((await host.execute(["list"])).data).toEqual([
			{ name: "default", confidential: true },
		]);
		expect(
			(await host.execute(["--session", "default", "close"])).data,
		).toEqual({
			closed: true,
		});
		await host.execute(["open", `${origin}/fresh`], { session: "default" });
		if (settlement === "resolve") secret.resolve(sentinel);
		else secret.reject(new Error(`${sentinel}:${transformed}`));
		for (const result of await Promise.all([fill, ...queued])) {
			expect(result).toBeInstanceOf(Error);
			noSecret(result);
		}
		const fresh = sessions.get("default");
		if (!fresh) throw new Error("Missing reopened synthetic session");
		const freshPage = fresh.page(fresh.tabs()[0].id);
		expect(freshPage.document).not.toBe(page.document);
		const text = freshPage.queries.querySelector("#text");
		if (text === null) throw new Error("Missing reopened synthetic input");
		expect(controlValue(freshPage.document, text)).toBe("");
		const html = await host.execute(["html"]);
		noSecret(html);
		expect(JSON.stringify(html)).not.toContain("old-queued-write");
		expect(delivered).not.toHaveBeenCalled();
		const aggregate = await host.execute(["list"]);
		noSecret(aggregate);
		expect(aggregate.data).toEqual([
			expect.objectContaining({ name: "default", tabs: expect.any(Array) }),
		]);
	},
);
