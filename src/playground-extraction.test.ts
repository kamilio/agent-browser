import { writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost, type CommandResult } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { playgroundHtml } from "./playground-assets.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";

class ElementFixture {
	textContent = "";
	value = "";
	hidden = false;
	disabled = false;
	checked = false;
	selected = false;
	href = "";
	download = "";
	removed = false;
	children: ElementFixture[] = [];
	readonly listeners = new Map<string, (() => void)[]>();
	readonly dataset: Record<string, string> = {};
	readonly classList = { toggle() {}, add() {}, remove() {} };
	constructor(
		readonly id: string,
		readonly attributes: Record<string, string> = {},
	) {
		this.value = attributes.value ?? "";
		this.disabled = "disabled" in attributes;
		this.hidden = "hidden" in attributes;
		this.checked = "checked" in attributes;
		for (const [name, value] of Object.entries(attributes))
			if (name.startsWith("data-")) this.dataset[name.slice(5)] = value;
	}
	addEventListener(name: string, callback: (event: unknown) => void) {
		this.listeners.set(name, [
			...(this.listeners.get(name) ?? []),
			callback as () => void,
		]);
	}
	removeEventListener(name: string, callback: (event: unknown) => void) {
		this.listeners.set(
			name,
			(this.listeners.get(name) ?? []).filter((entry) => entry !== callback),
		);
	}
	setAttribute(name: string, value: string) {
		this.attributes[name] = value;
	}
	removeAttribute(name: string) {
		delete this.attributes[name];
	}
	replaceChildren(...children: ElementFixture[]) {
		this.children = children;
	}
	append(...children: ElementFixture[]) {
		this.children.push(...children);
	}
	remove() {
		this.removed = true;
	}
	click() {
		if (!this.disabled) this.dispatch("click");
	}
	dispatch(name: string) {
		for (const listener of this.listeners.get(name) ?? [])
			(listener as (event: unknown) => void)({ preventDefault() {} });
	}
}

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0).reverse()) dispose();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function settle() {
	for (let index = 0; index < 160; index++) await Promise.resolve();
}

async function fixture(
	content = "<h1>Hello café</h1><p>Native <strong>bytes</strong>.</p>",
) {
	vi.useFakeTimers();
	const source = parseHtmlDocument(
		playgroundHtml,
		"https://playground.invalid/",
	);
	cleanup.push(() => source.close());
	const queries = new DocumentQueries(source);
	const elements = new Map<number, ElementFixture>();
	const wrap = (id: number) => {
		let element = elements.get(id);
		if (!element) {
			const node = source.get(id);
			element = new ElementFixture(node.attributes.id ?? "", {
				...node.attributes,
			});
			element.textContent = source.textContent(id);
			elements.set(id, element);
		}
		return element;
	};
	const get = (id: string) => {
		const found = queries.querySelector(`#${id}`);
		if (found === null) throw new Error(`Missing ${id}`);
		return wrap(found);
	};
	const body = new ElementFixture("body");
	const windowEvents = new Map<string, () => void>();
	vi.stubGlobal("document", {
		getElementById: get,
		querySelectorAll: (selector: string) =>
			queries.querySelectorAll(selector).map(wrap),
		createElement: () => new ElementFixture("created"),
		body,
		activeElement: null,
		hidden: false,
	});
	vi.stubGlobal("window", {
		addEventListener: (name: string, callback: () => void) =>
			windowEvents.set(name, callback),
	});
	vi.stubGlobal(
		"Option",
		class extends ElementFixture {
			constructor(
				label: string,
				value: string,
				_default?: boolean,
				selected?: boolean,
			) {
				super("");
				this.textContent = label;
				this.value = value;
				this.selected = selected ?? false;
			}
		},
	);
	const blobs: Blob[] = [];
	vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
		blobs.push(blob as Blob);
		return `blob:fixture/${blobs.length}`;
	});
	const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
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
						requests: 0,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) =>
					parseHtmlDocument(
						`<title>Export --&gt; &lt;script&gt;</title><main>${content}</main>`,
						response.url,
					),
			}),
	});
	cleanup.push(() => host.close());
	await host.execute(["open", "https://fixture.invalid/default"]);
	await host.execute([
		"-s=research.v2_1",
		"open",
		"https://fixture.invalid/research",
	]);
	const calls: { argv: string[]; session: string; signal: AbortSignal }[] = [];
	const replies: CommandResult[] = [];
	let intercept: ((result: CommandResult) => Promise<CommandResult>) | null =
		null;
	vi.stubGlobal(
		"fetch",
		async (path: string, options: { body: string; signal: AbortSignal }) => {
			const input = JSON.parse(options.body);
			let payload: unknown;
			try {
				if (path === "/api/pair/start")
					payload = {
						ok: true,
						pair: {
							id: "a".repeat(32),
							code: "ABCD1234",
							expiresAt: Date.now() + 60_000,
						},
					};
				else if (path === "/api/pair/poll")
					payload = {
						ok: true,
						approved: true,
						token: "secret-pairing-token".padEnd(43, "x"),
					};
				else if (path === "/api/pair/revoke") payload = { ok: true };
				else {
					calls.push({ ...input, signal: options.signal });
					let result = await host.execute(input.argv, {
						session: input.session,
					});
					if (input.argv.includes("--max-bytes=65536")) {
						replies.push(result);
						if (intercept) result = await intercept(result);
					}
					payload = { ok: true, result };
				}
				return {
					ok: true,
					status: 200,
					json: async () => JSON.parse(JSON.stringify(payload)),
				};
			} catch (error) {
				return {
					ok: false,
					status: 422,
					json: async () => ({
						ok: false,
						error: { code: "native-error", message: (error as Error).message },
					}),
				};
			}
		},
	);
	vi.resetModules();
	await import("./playground.js");
	cleanup.push(() => windowEvents.get("pagehide")?.());
	expect(get("download-markdown").disabled).toBe(true);
	get("connect").click();
	await vi.advanceTimersByTimeAsync(1001);
	await settle();
	expect(get("download-markdown").disabled).toBe(false);
	return {
		get,
		source,
		host,
		calls,
		replies,
		blobs,
		revoked,
		body,
		examples: () => queries.querySelectorAll("[data-url]").map(wrap),
		frameworks: () => queries.querySelectorAll("[data-framework]").map(wrap),
		closePage: () => windowEvents.get("pagehide")?.(),
		intercept: (callback: typeof intercept) => {
			intercept = callback;
		},
		select: async (name: string) => {
			get("session-name").value = name;
			get("session-form").dispatch("submit");
			await settle();
		},
	};
}

it("downloads exact native Markdown bytes after an inert metadata comment for the selected session", async () => {
	const test = await fixture();
	await test.select("research.v2_1");
	test.get("download-markdown").click();
	await settle();
	expect(test.blobs).toHaveLength(1);
	const blob = test.blobs[0];
	expect(blob.type).toBe("text/markdown;charset=utf-8");
	const output = await blob.text();
	const end = output.indexOf(" -->\n\n");
	const header = JSON.parse(output.slice("<!-- agent-browser ".length, end));
	expect(header).toMatchObject({
		session: "research.v2_1",
		kind: "markdown",
		limits: { maxBytes: 65536, maxNodes: 2000, maxDepth: 64 },
		data: { partial: true, title: "Export --> <script>" },
	});
	expect(header.data).not.toHaveProperty("content");
	expect(output.slice(0, end)).not.toContain("-->");
	expect(output.slice(end + " -->\n\n".length)).toBe(
		(test.replies[0].data as { content: string }).content,
	);
	expect(output).toContain("Hello café");
	expect(test.calls.at(-1)).toMatchObject({
		session: "research.v2_1",
		argv: [
			"extract",
			"--format=markdown",
			"--max-nodes=2000",
			"--max-bytes=65536",
			"--depth=64",
			"--",
			header.data.document,
		],
	});
	expect(test.body.children.at(-1)).toMatchObject({
		download: "agent-browser-research.v2_1-markdown.md",
		removed: true,
	});
	expect(test.get("export-state").textContent).toContain(
		"partial native interpretation",
	);
	expect(test.revoked).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1000);
	expect(test.revoked).toHaveBeenCalledExactlyOnceWith("blob:fixture/1");
});

it.each(["json", "snapshot"])(
	"downloads parseable %s preserving all native metadata and safe filenames",
	async (kind) => {
		const test = await fixture();
		await test.select("research.v2_1");
		test.get(`download-${kind}`).click();
		await settle();
		expect(test.blobs).toHaveLength(1);
		expect(test.blobs[0].type).toBe("application/json;charset=utf-8");
		const output = JSON.parse(await test.blobs[0].text());
		expect(output).toMatchObject({
			schemaVersion: 1,
			session: "research.v2_1",
			kind,
		});
		expect(output.data).toEqual(test.replies[0].data);
		expect(test.calls.at(-1)?.session).toBe("research.v2_1");
		if (kind === "snapshot") {
			expect(test.calls.at(-1)?.argv).toContain("--observe");
			expect(output.data).toMatchObject({
				truncated: false,
				html: { partial: true, scripting: false },
			});
		} else
			expect(output.data).toMatchObject({
				format: "json",
				partial: true,
				content: { type: "container" },
			});
		expect(test.body.children.at(-1)?.download).toBe(
			`agent-browser-research.v2_1-${kind}.json`,
		);
		test.closePage();
		expect(test.revoked).toHaveBeenCalledExactlyOnceWith("blob:fixture/1");
		await vi.advanceTimersByTimeAsync(1100);
		expect(test.revoked).toHaveBeenCalledTimes(1);
	},
);

it("retains native snapshot truncation instead of slicing JSON or claiming complete output", async () => {
	const test = await fixture(`<p>${"é".repeat(1000)}</p>`);
	test.get("download-snapshot").click();
	await settle();
	const output = JSON.parse(await test.blobs[0].text());
	expect(output.data.truncated).toBe(true);
	expect(output.data).toEqual(test.replies[0].data);
	expect(test.get("export-state").textContent).toContain("TRUNCATED");
	expect(test.blobs[0].size).toBeLessThanOrEqual(262144);
});

it.each(["markdown", "json"])(
	"reports native %s byte-limit errors without creating a substitute",
	async (kind) => {
		const test = await fixture(`<p>${"é".repeat(40000)}</p>`);
		test.get(`download-${kind}`).click();
		await settle();
		expect(test.blobs).toHaveLength(0);
		expect(test.get("error").hidden).toBe(false);
		expect(test.get("error").textContent).toContain("limit exceeded");
		expect(test.get("export-state").textContent).toContain("no substitute");
		expect(test.get(`download-${kind}`).disabled).toBe(false);
	},
);

it("rejects oversized responses without cutting a JSON document", async () => {
	const test = await fixture();
	test.intercept(async (result) => ({
		...result,
		data: { ...(result.data as object), title: "é".repeat(140000) },
	}));
	test.get("download-json").click();
	await settle();
	expect(test.blobs).toHaveLength(0);
	expect(test.get("error").textContent).toContain("download limit");
});

it.each([
	["nodes", "<span>Text</span>".repeat(2001)],
	["depth", `${"<div>".repeat(70)}Deep${"</div>".repeat(70)}`],
])("keeps native %s limits fail-closed", async (_limit, content) => {
	const test = await fixture(content);
	test.get("download-json").click();
	await settle();
	expect(test.blobs).toHaveLength(0);
	expect(test.get("error").textContent).toContain(
		"Extraction structure limit exceeded",
	);
	expect(test.get("export-state").textContent).toContain("export failed");
});

it("clears completed exports on a selection change and disables downloads for an unopened session", async () => {
	const test = await fixture();
	test.get("download-json").click();
	await settle();
	expect(test.blobs).toHaveLength(1);
	await test.select("unopened");
	expect(test.revoked).toHaveBeenCalledExactlyOnceWith("blob:fixture/1");
	expect(test.get("export-state").textContent).toBe(
		"No extraction downloaded for this selection.",
	);
	for (const kind of ["markdown", "json", "snapshot"])
		expect(test.get(`download-${kind}`).disabled).toBe(true);
	expect(test.get("export-commands").textContent).toContain("-s=unopened");
	expect(test.get("export-commands").textContent).not.toContain(" -- ");
});

it("clears completed export status when refresh discovers an external navigation", async () => {
	const test = await fixture();
	test.get("download-json").click();
	await settle();
	await test.host.execute(["goto", "https://fixture.invalid/new"]);
	test.get("refresh").click();
	await settle();
	expect(test.get("export-state").textContent).toBe(
		"No extraction downloaded for this selection.",
	);
	expect(test.revoked).toHaveBeenCalledExactlyOnceWith("blob:fixture/1");
});

it("ignores rejected exports from an old session without overwriting the new session state", async () => {
	const test = await fixture();
	let reject!: (error: Error) => void;
	test.intercept(
		() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
	);
	test.get("download-markdown").click();
	await settle();
	await test.select("research.v2_1");
	reject(new Error("Old session error"));
	await settle();
	expect(test.get("error").hidden).toBe(true);
	expect(test.get("export-state").textContent).not.toContain("failed");
	expect(test.blobs).toHaveLength(0);
});

it("drops an old session response even when the transport ignores abort, and allows a new export", async () => {
	const test = await fixture();
	let resolve!: (result: CommandResult) => void;
	test.intercept(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	test.get("download-json").click();
	await settle();
	expect(test.get("export-state").textContent).toContain("Downloading");
	expect(test.get("download-snapshot").disabled).toBe(true);
	expect(test.get("session-apply").disabled).toBe(false);
	const oldCall = test.calls.at(-1);
	test.get("download-json").dispatch("click");
	expect(test.replies).toHaveLength(1);
	await test.select("research.v2_1");
	expect(oldCall?.signal.aborted).toBe(true);
	test.intercept(null);
	test.get("download-json").click();
	await settle();
	const status = test.get("export-state").textContent;
	resolve(test.replies[0]);
	await settle();
	expect(test.blobs).toHaveLength(1);
	expect(JSON.parse(await test.blobs[0].text()).session).toBe("research.v2_1");
	expect(test.get("export-state").textContent).toBe(status);
	expect(test.get("error").hidden).toBe(true);
});

it.each(["disconnect", "pagehide", "navigation"])(
	"drops pending exports on %s without leaking Blob URLs",
	async (action) => {
		const test = await fixture();
		let resolve!: (result: CommandResult) => void;
		test.intercept(
			() =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		test.get("download-markdown").click();
		await settle();
		if (action === "pagehide") test.closePage();
		else if (action === "disconnect") test.get("disconnect").click();
		else {
			test.get("url").value = "https://fixture.invalid/new";
			test.get("navigate-form").dispatch("submit");
		}
		await settle();
		resolve(test.replies[0]);
		await settle();
		expect(test.blobs).toHaveLength(0);
		expect(test.get("export-state").textContent).not.toContain("Downloading");
		expect(test.get("error").hidden).toBe(true);
	},
);

it.each(["session", "document", "format"])(
	"fails closed for mismatched %s metadata",
	async (mismatch) => {
		const test = await fixture();
		test.intercept(async (result) =>
			mismatch === "session"
				? { ...result, session: "other" }
				: {
						...result,
						data: { ...(result.data as object), [mismatch]: "wrong" },
					},
		);
		test.get("download-json").click();
		await settle();
		expect(test.blobs).toHaveLength(0);
		expect(test.get("error").hidden).toBe(false);
		expect(test.get("export-state").textContent).toContain("export failed");
	},
);

it.each(["markdown", "json", "snapshot"])(
	"rejects corrupted %s root scope before creating a Blob URL or download",
	async (kind) => {
		const test = await fixture();
		test.intercept(async (result) => ({
			...result,
			data: { ...(result.data as object), scope: "wrong-root" },
		}));
		const anchorsBefore = test.body.children.length;
		test.get(`download-${kind}`).click();
		await settle();
		expect(test.blobs).toHaveLength(0);
		expect(URL.createObjectURL).not.toHaveBeenCalled();
		expect(test.body.children).toHaveLength(anchorsBefore);
		expect(test.get("error").hidden).toBe(false);
		expect(test.get("error").textContent).toContain("scope changed");
		expect(test.get("export-state").textContent).toContain("no substitute");
	},
);

it("rejects stale document roots after an external native navigation", async () => {
	const test = await fixture();
	await test.host.execute(["goto", "https://fixture.invalid/replaced"]);
	test.get("download-json").click();
	await settle();
	expect(test.blobs).toHaveLength(0);
	expect(test.get("error").hidden).toBe(false);
});

it("clears backend errors after a successful retry and cleans up when anchor activation fails", async () => {
	const test = await fixture();
	test.intercept(async () => {
		throw new Error("Backend denied extraction");
	});
	test.get("download-json").click();
	await settle();
	expect(test.get("error").textContent).toContain("Backend denied");
	expect(test.blobs).toHaveLength(0);
	test.intercept(null);
	test.get("download-json").click();
	await settle();
	expect(test.get("error").hidden).toBe(true);
	const create = vi.spyOn(document, "createElement").mockImplementation(() => {
		const anchor = new ElementFixture("failing");
		anchor.click = () => {
			throw new Error("Activation failed");
		};
		return anchor as unknown as HTMLElement;
	});
	test.get("download-json").click();
	await settle();
	expect(test.get("error").textContent).toContain("Activation failed");
	expect(test.body.children.at(-1)?.removed).toBe(true);
	create.mockRestore();
	await vi.advanceTimersByTimeAsync(1000);
	expect(test.revoked.mock.calls).toEqual([
		["blob:fixture/1"],
		["blob:fixture/2"],
	]);
});

it("routes every established example and every copyable export command to the selected native session", async () => {
	const test = await fixture();
	await test.select("research.v2_1");
	for (const example of test.examples()) {
		expect(example.disabled).toBe(false);
		expect(example.listeners.has("click")).toBe(true);
		example.click();
		await settle();
		expect(
			test.calls.filter((call) => call.argv[0] === "goto").at(-1),
		).toMatchObject({
			session: "research.v2_1",
			argv: ["goto", example.dataset.url],
		});
	}
	expect(test.frameworks()).toHaveLength(5);
	for (const framework of test.frameworks()) {
		expect(framework.disabled).toBe(false);
		expect(framework.textContent).toContain("UNVERIFIED");
	}
	const hints = test.get("export-commands").textContent;
	expect(hints).not.toMatch(/secret-pairing-token|ABCD1234|Bearer/);
	const { parsePlaygroundCommand } = await import("./playground.js");
	for (const line of hints.split("\n")) {
		expect(line.startsWith("agent-browser -s=research.v2_1 ")).toBe(true);
		const result = await test.host.execute(
			parsePlaygroundCommand(line.slice("agent-browser ".length)),
		);
		expect(result.session).toBe("research.v2_1");
	}
	test.get("download-snapshot").click();
	await settle();
	if (process.env.PLAYGROUND_EXTRACTION_EVIDENCE) {
		writeFileSync(
			process.env.PLAYGROUND_EXTRACTION_EVIDENCE,
			JSON.stringify(
				{
					basis:
						"Native HTML parser semantic snapshot plus mounted in-memory element state; not a browser screenshot or live website run",
					baseline: "c4cf3d9",
					staticDom: snapshotDocument(test.source, { maxBytes: 65536 }),
					examples: test.examples().map((example) => ({
						framework: example.dataset.framework ?? null,
						url: example.dataset.url,
						source: example.dataset.source ?? null,
						disabled: example.disabled,
						text: example.textContent,
					})),
					exampleNavigation: test.calls
						.filter((call) => call.argv[0] === "goto")
						.map(({ argv, session }) => ({ argv, session })),
					mounted: [
						"download-markdown",
						"download-json",
						"download-snapshot",
						"export-state",
						"export-commands",
					].map((id) => {
						const element = test.get(id);
						return {
							id,
							text: element.textContent,
							disabled: element.disabled,
							attributes: element.attributes,
						};
					}),
					download: JSON.parse(await test.blobs[0].text()),
				},
				null,
				2,
			),
		);
	}
});
