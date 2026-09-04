import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import type { IncomingMessage, RequestOptions } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readTrace } from "./capture-client.js";
import { BrowserCommandHost, type CommandResult } from "./command-host.js";
import { documentFiles } from "./document-files.js";
import { AgentBrowserError } from "./errors.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";

const injected = vi.hoisted(() => ({
	request: vi.fn(),
	read: vi.fn(),
	spawn: vi.fn(() => {
		throw new Error("Unexpected subprocess");
	}),
	createServer: vi.fn(() => {
		throw new Error("Unexpected socket server");
	}),
}));
vi.mock("node:http", async (original) => ({
	...(await original<typeof import("node:http")>()),
	request: injected.request,
	createServer: injected.createServer,
}));
vi.mock("node:child_process", () => ({ spawn: injected.spawn }));
vi.mock("node:fs/promises", async (original) => ({
	...(await original<typeof import("node:fs/promises")>()),
}));
vi.mock("./errors.js", async (original) => original());
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: injected.read,
	writeCommandConnection: vi.fn(),
}));

const connection = {
	schemaVersion: 1,
	origin: "http://127.0.0.1:23456",
	token: "h".repeat(43),
};
const hosts: BrowserCommandHost[] = [];
const directories: string[] = [];
const deliveries: Promise<void>[] = [];
const releases: (() => void)[] = [];
const previousArgs = process.argv;
const previousCode = process.exitCode;
let initialInt: NodeJS.SignalsListener[] = [];
let initialTerm: NodeJS.SignalsListener[] = [];

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	injected.request.mockReset();
	injected.read.mockReset().mockResolvedValue(connection);
	for (const name of [
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
		"AGENT_BROWSER_SESSION",
		"PLAYWRIGHT_CLI_SESSION",
	])
		vi.stubEnv(name, undefined);
	process.exitCode = 0;
	initialInt = process.listeners("SIGINT");
	initialTerm = process.listeners("SIGTERM");
});

afterEach(async () => {
	try {
		for (const release of releases.splice(0)) release();
		for (const host of hosts.splice(0)) host.close();
		await Promise.all(deliveries.splice(0));
		for (const directory of directories.splice(0))
			await fs.rm(directory, { recursive: true, force: true });
		expect(injected.spawn).not.toHaveBeenCalled();
		expect(injected.createServer).not.toHaveBeenCalled();
		expect(process.listeners("SIGINT")).toEqual(initialInt);
		expect(process.listeners("SIGTERM")).toEqual(initialTerm);
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	}
});

function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	releases.push(release);
	return { pending, release };
}

async function privateFile(name: string, data: string | Uint8Array) {
	const directory = await fs.mkdtemp(
		join(tmpdir(), "agent-browser-cli-host-upload-"),
	);
	directories.push(directory);
	const path = join(directory, name);
	await fs.writeFile(path, data, { mode: 0o600 });
	return path;
}

interface WireBody {
	argv: string[];
	session: string;
}
interface WireHooks {
	before?: (body: WireBody) => Promise<void>;
	dispatched?: (body: WireBody, signal: AbortSignal) => void;
	after?: (body: WireBody, result: CommandResult) => Promise<void>;
	disconnectAfter?: (body: WireBody) => boolean;
}

function wire(host: BrowserCommandHost) {
	const calls: WireBody[] = [];
	const hooks: WireHooks = {};
	injected.request.mockImplementation(
		(
			url: string,
			options: RequestOptions,
			callback: (response: IncomingMessage) => void,
		) => {
			expect(url).toBe(`${connection.origin}/api/command`);
			expect(options.method).toBe("POST");
			expect(options.agent).toBe(false);
			expect(options.headers).toMatchObject({
				authorization: `Bearer ${connection.token}`,
				"content-type": "application/json",
			});
			const signal = options.signal;
			if (!signal) throw new Error("Missing request cancellation");
			const operation = new EventEmitter();
			let closed = false;
			const close = () => {
				closed = true;
				signal.removeEventListener("abort", abort);
				operation.emit("close");
			};
			const abort = () => {
				if (closed) return;
				operation.emit("error", new Error("Injected HTTP disconnect"));
				close();
			};
			signal.addEventListener("abort", abort, { once: true });
			const respond = (statusCode: number, envelope: unknown) => {
				if (closed) return;
				const response = Object.assign(new EventEmitter(), { statusCode });
				callback(response as IncomingMessage);
				response.emit("data", Buffer.from(JSON.stringify(envelope)));
				response.emit("end");
				close();
			};
			return Object.assign(operation, {
				destroy: abort,
				end(data: string) {
					expect(Buffer.byteLength(data)).toBeLessThanOrEqual(65_536);
					expect(options.headers).toMatchObject({
						"content-length": Buffer.byteLength(data),
					});
					const body = JSON.parse(data) as WireBody;
					expect(Object.keys(body).sort()).toEqual(["argv", "session"]);
					calls.push(body);
					const delivery = (async () => {
						try {
							await hooks.before?.(body);
							const pending = host.execute(body.argv, {
								session: body.session,
								signal,
							});
							hooks.dispatched?.(body, signal);
							const result = await pending;
							await hooks.after?.(body, result);
							if (hooks.disconnectAfter?.(body)) {
								abort();
								return;
							}
							respond(200, { ok: true, result });
						} catch (error) {
							if (!(error instanceof AgentBrowserError)) {
								abort();
								throw error;
							}
							respond(400, {
								ok: false,
								error: { code: error.code, message: error.message },
							});
						}
					})();
					deliveries.push(delivery);
				},
			});
		},
	);
	return { calls, hooks };
}

async function fixture() {
	const sessions = new Map<string, BrowserSession>();
	const requests: NetworkRequest[] = [];
	const host = new BrowserCommandHost({
		createSession(name) {
			const session = new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input);
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
				loadDocument: (response) =>
					parseHtmlDocument(
						'<style>html,body{margin:0;padding:0}button{display:block;width:80px;height:25px}</style><form action="/sent" method="post" enctype="multipart/form-data"><input id="file" type="file" name="attachment" multiple><button id="send">Send</button><button id="block" type="button">Block</button></form>',
						response.url,
					),
			});
			sessions.set(name, session);
			return session;
		},
	});
	hosts.push(host);
	const execute = (argv: readonly string[], session = "chosen") =>
		host.execute(argv, { session });
	await execute(["open", "https://fixture.invalid/start"]);
	const context = (name = "chosen") => {
		const session = sessions.get(name);
		const tab = session?.tabs().find((entry) => entry.selected);
		if (!session || !tab) throw new Error("Missing native session/tab");
		const page = session.page(tab.id);
		const file = page.queries.querySelector("#file");
		if (file === null) throw new Error("Missing native file input");
		return {
			session,
			tab,
			page,
			file,
			owner: documentFiles(page.document),
			reference: page.document.reference(file),
		};
	};
	return { host, execute, context, requests, ...wire(host) };
}

async function runCli(argv: string[]) {
	process.argv = ["node", "agent-browser", ...argv];
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(
		() => expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
		{ timeout: 5000 },
	);
	const output = String(log.mock.calls[0]?.[0] ?? error.mock.calls[0]?.[0]);
	return { output, report: JSON.parse(output), error };
}

function interrupt() {
	const listener = process
		.listeners("SIGINT")
		.find((entry) => !initialInt.includes(entry));
	expect(listener).toBeDefined();
	listener?.("SIGINT");
}

it("runs selector capture, private reads, named-session commit, trace and real multipart submission across CLI and host", async () => {
	const test = await fixture();
	await test.execute(["open", "https://fixture.invalid/other"], "other");
	await test.execute(["tracing-start"]);
	const small = "PRIVATE-UPLOAD-CONTENT-27b1";
	const large = new Uint8Array(70_000).fill(87);
	const paths = [
		await privateFile("small-private.bin", small),
		await privateFile("empty-private.bin", ""),
		await privateFile("large-private.bin", large),
	];
	let captured = false;
	test.hooks.after = async (body, result) => {
		if (body.argv[0] === "upload-target") {
			expect(body.argv).toEqual(["upload-target", "#file"]);
			expect(result.data).toEqual({
				target: test.context().owner.capture(test.context().reference),
			});
			captured = true;
		}
	};
	const originalStat = fs.lstat;
	vi.spyOn(fs, "lstat").mockImplementation(
		(...args: Parameters<typeof fs.lstat>) => {
			expect(captured).toBe(true);
			return originalStat(...args);
		},
	);
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation((...args) => {
		expect(captured).toBe(true);
		return originalOpen(...args);
	});
	const current = test.context();
	const events: string[] = [];
	for (const type of ["input", "change"])
		current.page.interactions.events.addEventListener(
			current.file,
			type,
			() => {
				events.push(type);
			},
		);
	const result = await runCli([
		"-s=chosen",
		"upload",
		"#file",
		...paths,
		"--json",
	]);
	expect(result.error).not.toHaveBeenCalled();
	expect(result.report).toMatchObject({
		command: "upload",
		session: "chosen",
		data: {
			committed: true,
			stagingReleased: true,
			files: 3,
			bytes: small.length + large.length,
		},
	});
	expect(events).toEqual(["input", "change"]);
	expect(
		current.owner
			.selectionMetadata(current.file)
			.map(({ name, bytes }) => ({ name, bytes })),
	).toEqual([
		{ name: "small-private.bin", bytes: small.length },
		{ name: "empty-private.bin", bytes: 0 },
		{ name: "large-private.bin", bytes: large.length },
	]);
	expect(
		current.owner.files(current.reference).map((file) => file.data),
	).toEqual([new TextEncoder().encode(small), new Uint8Array(), large]);
	expect(test.context("other").owner.metrics().files).toBe(0);
	expect(test.calls.every((body) => body.session === "chosen")).toBe(true);
	for (const path of paths)
		expect(JSON.stringify(test.calls)).not.toContain(path);
	const artifact = (await test.execute(["tracing-stop"])).data;
	let trace = "";
	await readTrace(test.execute, artifact, (bytes) => {
		trace = new TextDecoder().decode(bytes);
	});
	expect(trace).toContain('"command":"upload-commit"');
	for (const secret of [
		...paths,
		small,
		Buffer.from(small).toString("base64"),
		"small-private.bin",
		connection.token,
	])
		expect(
			result.output + trace + JSON.stringify(test.host.metrics()),
		).not.toContain(secret);
	await test.execute(["click", "#send"]);
	const submitted = test.requests.at(-1);
	expect(submitted).toMatchObject({
		url: "https://fixture.invalid/sent",
		method: "POST",
	});
	const multipart = Buffer.from(submitted?.body as Uint8Array);
	for (const name of [
		"small-private.bin",
		"empty-private.bin",
		"large-private.bin",
	])
		expect(multipart.toString()).toContain(`filename="${name}"`);
	expect(multipart.includes(Buffer.from(small))).toBe(true);
	expect(multipart.includes(Buffer.from(large))).toBe(true);
	expect(
		JSON.stringify(current.session.requests(current.tab.id)),
	).not.toContain(small);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
});

it.each(["navigation", "tab change"])(
	"rejects CLI capture invalidated by actual host %s without retargeting",
	async (change) => {
		const test = await fixture();
		const path = await privateFile("stale.bin", "PRIVATE-STALE");
		test.hooks.after = async (body) => {
			if (body.argv[0] === "upload-target")
				await test.execute([
					change === "navigation" ? "goto" : "tab-new",
					"https://fixture.invalid/next",
				]);
		};
		const result = await runCli(["-s=chosen", "upload", "#file", path]);
		expect(result.report).toMatchObject({
			ok: false,
			error: { code: "stale-reference" },
		});
		expect(test.calls.map((body) => body.argv[0])).toEqual([
			"upload-target",
			"upload-begin",
		]);
		expect(test.context().owner.metrics().files).toBe(0);
		expect(test.host.metrics().uploads).toMatchObject({
			transfers: 0,
			stagedBytes: 0,
		});
		expect(result.output).not.toContain(path);
	},
);

it("aborts a CLI commit queued behind another host command and confirms cleanup only after the queue advances", async () => {
	const test = await fixture();
	const path = await privateFile("queued.bin", "QUEUED-PRIVATE");
	const current = test.context();
	const entered = gate();
	const waiting = gate();
	const block = current.page.queries.querySelector("#block");
	if (block === null) throw new Error("Missing blocking button");
	current.page.interactions.events.addEventListener(
		block,
		"click",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	let blocking: Promise<CommandResult> | undefined;
	test.hooks.before = async (body) => {
		if (body.argv[0] === "upload-commit") {
			blocking = test.execute(["click", "#block"]);
			await entered.pending;
		}
	};
	test.hooks.dispatched = (body, signal) => {
		if (body.argv[0] === "upload-commit") {
			expect(test.host.metrics().pendingCommands).toBeGreaterThanOrEqual(2);
			interrupt();
		}
		if (body.argv[0] === "upload-cancel") {
			expect(signal.aborted).toBe(false);
			expect(test.host.metrics().pendingCommands).toBeGreaterThanOrEqual(3);
			expect(current.owner.metrics().files).toBe(0);
			expect(test.host.metrics().uploads.stagedBytes).toBeGreaterThan(0);
			waiting.release();
		}
	};
	const result = await runCli(["-s=chosen", "upload", "#file", path]);
	await blocking;
	expect(result.report).toMatchObject({
		ok: false,
		error: { code: "aborted", remoteCleanupConfirmed: true },
	});
	expect(test.calls.at(-1)?.argv[0]).toBe("upload-cancel");
	expect(current.owner.metrics().files).toBe(0);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
});

it("propagates CLI interruption during actual native commit events without claiming selection rollback", async () => {
	const test = await fixture();
	const path = await privateFile("committing.bin", "COMMITTING-PRIVATE");
	const current = test.context();
	const waiting = gate();
	let changes = 0;
	current.page.interactions.events.addEventListener(
		current.file,
		"input",
		controlledEventListener(async () => {
			expect(current.owner.metrics().files).toBe(1);
			interrupt();
			await waiting.pending;
		}),
	);
	current.page.interactions.events.addEventListener(
		current.file,
		"change",
		() => {
			changes++;
		},
	);
	const result = await runCli(["-s=chosen", "upload", "#file", path]);
	expect(result.report).toMatchObject({
		ok: false,
		error: { code: "aborted", remoteCleanupConfirmed: true },
	});
	expect(current.owner.files(current.reference)[0].data).toEqual(
		new TextEncoder().encode("COMMITTING-PRIVATE"),
	);
	expect(changes).toBe(0);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	expect(result.output).not.toContain("COMMITTING-PRIVATE");
	waiting.release();
});

it("reports a lost real commit acknowledgement as uncertain even after host cancellation confirms staging cleanup", async () => {
	const test = await fixture();
	const path = await privateFile("acknowledged.bin", "ACK-PRIVATE");
	const current = test.context();
	test.hooks.disconnectAfter = (body) => body.argv[0] === "upload-commit";
	const result = await runCli(["-s=chosen", "upload", "#file", path]);
	expect(result.report).toMatchObject({
		ok: false,
		error: { code: "network-error", remoteCleanupConfirmed: true },
	});
	expect(current.owner.files(current.reference)[0].data).toEqual(
		new TextEncoder().encode("ACK-PRIVATE"),
	);
	expect(test.calls.at(-1)?.argv[0]).toBe("upload-cancel");
	expect(result.output).toContain("inspect document state before retrying");
	expect(result.output).not.toContain(path);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
});
