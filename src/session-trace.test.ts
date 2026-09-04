import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost, type CommandHostOptions } from "./command-host.js";
import { readTrace } from "./capture-client.js";
import { AgentBrowserError } from "./errors.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";
import { SessionTrace, sessionTraceLimits } from "./session-trace.js";

const hosts: BrowserCommandHost[] = [];
const traces: SessionTrace[] = [];
afterEach(() => {
	for (const trace of traces.splice(0)) trace.close();
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
});
async function fixture(
	markup = '<main><h1>First page</h1><input id="field" aria-label="Name"><input type="password" value="password-secret"><a href="/next?secret=link-secret">Next</a></main>',
	options: Pick<CommandHostOptions, "evaluatePage"> = {},
) {
	const sessions = new Map<string, BrowserSession>();
	const requests: string[] = [];
	const host = new BrowserCommandHost({
		...options,
		createSession: (name) => {
			const browser = new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input.url);
						if (input.url.includes("/failure"))
							throw new AgentBrowserError(
								"network-error",
								"private-error-secret",
							);
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
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
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
	await host.execute([
		"open",
		"https://fixture.invalid/start?token=url-secret",
	]);
	const browser = sessions.get("default");
	if (!browser) throw new Error("Missing default session");
	return { host, browser, sessions, requests };
}
async function exported(host: BrowserCommandHost, session?: string) {
	const artifact = (await host.execute(["tracing-stop"], { session })).data;
	let text = "";
	await readTrace(
		(argv) => host.execute(argv, { session }),
		artifact,
		(bytes) => {
			text = new TextDecoder().decode(bytes);
		},
	);
	return { artifact, text, trace: JSON.parse(text) };
}

it.each(["bigint", "cycle", "throwing-serializer"])(
	"keeps successful actions intact when %s prevents trace serialization",
	async (fault) => {
		const { host, browser } = await fixture();
		await host.execute(["tracing-start"]);
		const snapshot = browser.snapshot.bind(browser);
		const extra: Record<string, unknown> = {};
		if (fault === "cycle") extra.self = extra;
		if (fault === "throwing-serializer")
			extra.toJSON = () => {
				throw new Error("private-serialization-error");
			};
		const injected = vi
			.spyOn(browser, "snapshot")
			.mockImplementation((...args) => ({
				...snapshot(...args),
				extra: fault === "bigint" ? 1n : extra,
			}));
		await expect(
			host.execute(["fill", "#field", "committed"]),
		).resolves.toMatchObject({ command: "fill" });
		expect((await host.execute(["tracing-status"])).data).toMatchObject({
			frames: 1,
			droppedFrames: 1,
			truncated: true,
			recording: true,
		});
		injected.mockRestore();
		const current = (await host.execute(["snapshot"])).data as {
			entries: { value?: string }[];
		};
		expect(current.entries.some((entry) => entry.value === "committed")).toBe(
			true,
		);
		const { trace, text } = await exported(host);
		expect(
			trace.frames.map((frame: { sequence: number }) => frame.sequence),
		).toEqual([0, 2, 3]);
		expect(trace.droppedFrames).toBe(1);
		expect(trace.truncated).toBe(true);
		expect(text).not.toContain("private-serialization-error");
	},
);

it.each(["bigint", "cycle", "throwing-serializer"])(
	"preserves the original action error when %s prevents trace serialization",
	async (fault) => {
		const { host, browser } = await fixture();
		await host.execute(["tracing-start"]);
		const snapshot = browser.snapshot.bind(browser);
		const extra: Record<string, unknown> = {};
		if (fault === "cycle") extra.self = extra;
		if (fault === "throwing-serializer")
			extra.toJSON = () => {
				throw new Error("private-serialization-error");
			};
		const injected = vi
			.spyOn(browser, "snapshot")
			.mockImplementation((...args) => ({
				...snapshot(...args),
				extra: fault === "bigint" ? 1n : extra,
			}));
		await expect(
			host.execute(["goto", "https://fixture.invalid/failure"]),
		).rejects.toMatchObject({
			code: "network-error",
			message: "private-error-secret",
		});
		injected.mockRestore();
		const { trace } = await exported(host);
		expect(
			trace.frames.map((frame: { sequence: number }) => frame.sequence),
		).toEqual([0, 2]);
		expect(trace.droppedFrames).toBe(1);
	},
);

it("counts an unserializable initial frame without preventing trace startup", async () => {
	const { host, browser } = await fixture();
	const snapshot = browser.snapshot.bind(browser);
	const injected = vi
		.spyOn(browser, "snapshot")
		.mockImplementation((...args) => ({ ...snapshot(...args), extra: 1n }));
	await expect(host.execute(["tracing-start"])).resolves.toMatchObject({
		data: { recording: true, frames: 0, droppedFrames: 1 },
	});
	injected.mockRestore();
	const { trace, artifact } = await exported(host);
	expect(trace.frames[0].sequence).toBe(1);
	expect(artifact).toMatchObject({
		frames: 1,
		droppedFrames: 1,
		truncated: true,
	});
});

it("exports the trace recorder and reader through the public module", async () => {
	const api = await import("./index.js");
	expect(api.SessionTrace).toBe(SessionTrace);
	expect(api.readTrace).toBe(readTrace);
	expect(api.sessionTraceLimits).toBe(sessionTraceLimits);
});

it("records initial, action and final semantic/network frames in command order", async () => {
	const { host } = await fixture();
	expect((await host.execute(["tracing-status"])).data).toMatchObject({
		recording: false,
	});
	await host.execute(["tracing-start"]);
	await host.execute(["fill", "#field", "typed-secret"]);
	await host.execute([
		"goto",
		"https://fixture.invalid/next?token=next-secret",
	]);
	const { trace, text, artifact } = await exported(host);
	expect(
		trace.frames.map(
			(frame: { action: { command: string } }) => frame.action.command,
		),
	).toEqual(["tracing-start", "fill", "goto", "tracing-stop"]);
	expect(trace.frames[0].snapshot.document).not.toBe(
		trace.frames[2].snapshot.document,
	);
	expect(trace.frames[0].network.entries[0].state).toBe("complete");
	expect(trace.frames[2].network.entries[0].url).toBe(
		"https://fixture.invalid/next?redacted",
	);
	expect(
		trace.frames[1].snapshot.entries.some(
			(entry: { focused?: boolean }) => entry.focused,
		),
	).toBe(true);
	for (const secret of [
		"typed-secret",
		"password-secret",
		"url-secret",
		"next-secret",
		"link-secret",
	])
		expect(text).not.toContain(secret);
	expect(artifact).toMatchObject({
		frames: 4,
		truncated: false,
		mediaType: "application/json",
	});
	expect((await host.execute(["tracing-status"])).data).toMatchObject({
		recording: false,
	});
	expect(trace.privacy.containsPageText).toBe(true);
	expect(text).toContain("First page");
});

it("records a failed navigation without replacing the displayed document or leaking error messages", async () => {
	const { host } = await fixture();
	await host.execute(["tracing-start"]);
	await expect(
		host.execute([
			"goto",
			"https://fixture.invalid/failure?token=failed-secret",
		]),
	).rejects.toMatchObject({ code: "network-error" });
	const { trace, text } = await exported(host);
	expect(trace.frames[1].action).toMatchObject({
		command: "goto",
		outcome: "threw",
		error: "network-error",
	});
	expect(trace.frames[1].snapshot.document).toBe(
		trace.frames[0].snapshot.document,
	);
	expect(trace.frames[1].network.entries[0].state).toBe("failed");
	expect(text).not.toContain("private-error-secret");
	expect(text).not.toContain("failed-secret");
});

it("keeps recordings, artifacts and active-tab context isolated by named session", async () => {
	const { host } = await fixture();
	await host.execute(["open", "https://fixture.invalid/other"], {
		session: "other",
	});
	await host.execute(["tracing-start"]);
	await host.execute(["tracing-start"], { session: "other" });
	await host.execute(["tab-new", "https://fixture.invalid/second"]);
	await host.execute(["tab-select", "0"]);
	const first = await exported(host);
	const second = await exported(host, "other");
	expect(first.trace.frames).toHaveLength(4);
	expect(second.trace.frames).toHaveLength(2);
	expect(first.trace.frames[1].activeTab).not.toBe(
		first.trace.frames[2].activeTab,
	);
	expect(first.trace.frames[2].tabs).toHaveLength(2);
	await expect(
		host.execute(["artifact-read", (first.artifact as { id: string }).id], {
			session: "other",
		}),
	).rejects.toMatchObject({ code: "not-found" });
});

it("does not consume snapshot diffs or add tracing/artifact inspection commands to the timeline", async () => {
	const { host } = await fixture();
	await host.execute(["snapshot", "--diff"]);
	await host.execute(["tracing-start"]);
	await host.execute(["tracing-status"]);
	await host.execute(["artifact-list"]);
	await host.execute(["fill", "#field", "new"]);
	const delta = (await host.execute(["snapshot", "--diff"])).data;
	expect(delta).toMatchObject({ reset: false });
	const { trace } = await exported(host);
	expect(
		trace.frames.map(
			(frame: { action: { command: string } }) => frame.action.command,
		),
	).toEqual(["tracing-start", "fill", "snapshot", "tracing-stop"]);
});

it("rejects duplicate starts and missing stops without losing the recording", async () => {
	const { host } = await fixture();
	await expect(host.execute(["tracing-stop"])).rejects.toMatchObject({
		code: "invalid-input",
	});
	await host.execute(["tracing-start"]);
	await expect(host.execute(["tracing-start"])).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect((await exported(host)).trace.frames).toHaveLength(2);
	await host.execute(["tracing-start"]);
	expect((await exported(host)).trace.frames).toHaveLength(2);
});

it("keeps recording when a full artifact store prevents stop, then exports after deletion", async () => {
	const { host } = await fixture();
	const artifacts: string[] = [];
	for (let index = 0; index < 8; index++) {
		await host.execute(["tracing-start"]);
		artifacts.push(
			((await host.execute(["tracing-stop"])).data as { id: string }).id,
		);
	}
	await host.execute(["tracing-start"]);
	await expect(host.execute(["tracing-stop"])).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect((await host.execute(["tracing-status"])).data).toMatchObject({
		recording: true,
	});
	await host.execute(["artifact-delete", artifacts[0]]);
	expect((await exported(host)).trace.frames).toHaveLength(2);
});

it("releases recordings and artifacts on session closure without affecting another session", async () => {
	const { host } = await fixture();
	await host.execute(["tracing-start"]);
	const first = await exported(host);
	await host.execute(["tracing-start"]);
	await host.execute(["close"]);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	await host.execute(["open", "https://fixture.invalid/new"]);
	expect((await host.execute(["tracing-status"])).data).toMatchObject({
		recording: false,
	});
	await expect(
		host.execute(["artifact-read", (first.artifact as { id: string }).id]),
	).rejects.toMatchObject({ code: "not-found" });
});

it("preserves a frame with component errors instead of making an action fail", async () => {
	const { host, browser } = await fixture();
	await host.execute(["tracing-start"]);
	const snapshot = vi.spyOn(browser, "snapshot").mockImplementation(() => {
		throw new Error("private snapshot failure");
	});
	await host.execute(["fill", "#field", "edited"]);
	snapshot.mockRestore();
	const { trace, text } = await exported(host);
	expect(trace.frames[1]).toMatchObject({
		action: { outcome: "returned" },
		snapshotError: "unavailable",
	});
	expect(text).not.toContain("private snapshot failure");
});

it("handles a session with no remaining tab without fabricating a document", async () => {
	const { host } = await fixture();
	await host.execute(["tracing-start"]);
	await host.execute(["tab-close"]);
	const { trace } = await exported(host);
	expect(trace.frames[1]).toMatchObject({ activeTab: null, tabs: [] });
	expect(trace.frames[1].snapshot).toBeUndefined();
});

it("bounds frame storage, counts omissions and stops collecting after the limit", async () => {
	const { browser } = await fixture();
	const trace = new SessionTrace(browser, { maxFrames: 2 });
	traces.push(trace);
	trace.record("snapshot");
	const snapshot = vi.spyOn(browser, "snapshot");
	trace.record("fill");
	trace.record("goto");
	const exported = trace.finish();
	expect(exported.details).toMatchObject({
		frames: 2,
		droppedFrames: 3,
		truncated: true,
	});
	expect(snapshot).not.toHaveBeenCalled();
	snapshot.mockRestore();
	expect(trace.status()).toMatchObject({ recording: false, frames: 2 });
	expect(exported.bytes.length).toBeLessThanOrEqual(
		sessionTraceLimits.maxBytes,
	);
	const original = trace.finish().bytes;
	exported.bytes.fill(0);
	expect(trace.finish().bytes).toEqual(original);
	trace.close();
	expect(trace.status()).toMatchObject({
		closed: true,
		retainedBytes: 0,
		frames: 0,
	});
	expect(() => trace.finish()).toThrow("Trace is closed");
});

it("bounds serialized bytes and does not repeatedly collect an oversized frame", async () => {
	const markup = Array.from(
		{ length: 40 },
		(_, index) => `<p>${index} ${"long content ".repeat(20)}</p>`,
	).join("");
	const { browser } = await fixture(markup);
	const snapshot = vi.spyOn(browser, "snapshot");
	const trace = new SessionTrace(browser, { maxBytes: 4096 });
	traces.push(trace);
	trace.record("snapshot");
	const result = trace.finish();
	expect(snapshot).toHaveBeenCalledTimes(1);
	expect(result.details).toMatchObject({
		frames: 0,
		droppedFrames: 3,
		truncated: true,
	});
	expect(result.bytes.length).toBeLessThanOrEqual(4096);
	snapshot.mockRestore();
});

it.each([
	{ maxFrames: 0 },
	{ maxFrames: 129 },
	{ maxBytes: 4095 },
	{ maxBytes: 2_097_153 },
	{ maxFrames: Number.NaN },
])("rejects invalid trace limits %j", async (limits) => {
	const { browser } = await fixture();
	expect(() => new SessionTrace(browser, limits)).toThrow(
		"Invalid trace limit",
	);
});

it("rejects undeclared limit keys rather than overriding internal snapshot quotas", async () => {
	const { browser } = await fixture();
	const limits = { maxFrames: 2, maxSnapshotBytes: 1_000_000 };
	expect(() => new SessionTrace(browser, limits)).toThrow(
		"Invalid trace limit",
	);
});

it("uses only error codes and refuses invalid action metadata", async () => {
	const { browser } = await fixture();
	const trace = new SessionTrace(browser);
	traces.push(trace);
	trace.record("eval", 1, "threw", new Error("private-source"));
	expect(() => trace.record("unsafe\ncommand")).toThrow();
	expect(() => trace.record("fill", Number.POSITIVE_INFINITY)).toThrow();
	const result = new TextDecoder().decode(trace.finish().bytes);
	expect(result).not.toContain("private-source");
	expect(JSON.parse(result).frames[1].action.error).toBe("unavailable");
});

it("records settled interrupted commands without retaining their source or claiming success", async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const evaluatePage = vi.fn(async () => {
		await gate;
		return {
			engine: "poe-safe-js" as const,
			partial: true as const,
			ok: true,
			value: true,
			metrics: { steps: 1, peakCallDepth: 1, peakDataSize: 1, consoleCalls: 0 },
		};
	});
	const { host } = await fixture(undefined, { evaluatePage });
	await host.execute(["tracing-start"]);
	const controller = new AbortController();
	const pending = host.execute(["eval", "private-source"], {
		signal: controller.signal,
	});
	await vi.waitFor(() => expect(evaluatePage).toHaveBeenCalledOnce());
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	release();
	const { trace, text } = await exported(host);
	expect(trace.frames[1].action).toMatchObject({
		command: "eval",
		outcome: "interrupted",
		error: "aborted",
	});
	expect(text).not.toContain("private-source");
});

it("does not record requests aborted before entering the session queue", async () => {
	const { host } = await fixture();
	await host.execute(["tracing-start"]);
	const controller = new AbortController();
	controller.abort();
	await expect(
		host.execute(["fill", "#field", "secret"], { signal: controller.signal }),
	).rejects.toMatchObject({ code: "aborted" });
	expect((await exported(host)).trace.frames).toHaveLength(2);
});

it("caps per-frame network evidence and makes omissions explicit", async () => {
	const { browser } = await fixture();
	const tab = browser.tabs()[0];
	const original = browser.requests(tab.id);
	const requests = vi.spyOn(browser, "requests").mockReturnValue({
		...original,
		dropped: 2,
		entries: Array.from({ length: 70 }, (_, index) => ({
			index,
			kind: "fetch" as const,
			method: "GET",
			url: "https://user:password@fixture.invalid/data?secret=omitted#private",
			state: "complete" as const,
			status: 200,
			elapsedMs: 1,
		})),
	});
	const trace = new SessionTrace(browser);
	traces.push(trace);
	const exported = JSON.parse(new TextDecoder().decode(trace.finish().bytes));
	expect(exported.frames[0].network.entries).toHaveLength(64);
	expect(exported.frames[0].network.dropped).toBe(8);
	expect(exported.frames[0].network.entries[0].url).toBe(
		"https://fixture.invalid/data?redacted",
	);
	requests.mockRestore();
});

it("keeps serialized frames immutable after later native mutations", async () => {
	const { browser } = await fixture();
	const trace = new SessionTrace(browser);
	traces.push(trace);
	const page = browser.page(browser.tabs()[0].id);
	const heading = page.queries.querySelector("h1");
	if (heading === null) throw new Error("Missing heading");
	page.document.setTextContent(heading, "Changed heading");
	trace.record("eval");
	const exported = JSON.parse(new TextDecoder().decode(trace.finish().bytes));
	expect(JSON.stringify(exported.frames[0])).toContain("First page");
	expect(JSON.stringify(exported.frames[0])).not.toContain("Changed heading");
	expect(JSON.stringify(exported.frames[1])).toContain("Changed heading");
});
