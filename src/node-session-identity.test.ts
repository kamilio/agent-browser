import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserIdentityOptions } from "./browser-identity.js";
import type { BrowserSessionProcess } from "./node-session-process.js";

const fixture = vi.hoisted(() => ({
	spawn: vi.fn(),
	readRoot: vi.fn(),
	load: vi.fn(),
	host: vi.fn(),
	session: vi.fn(),
	processHost: vi.fn(),
	secrets: vi.fn(),
	forbidden: vi.fn(() => {
		throw new Error("Synthetic configuration tests forbid resource access");
	}),
}));
vi.mock("node:child_process", () => ({ spawn: fixture.spawn }));
vi.mock("./node-page-core.js", () => ({ loadPageRuntime: fixture.load }));
vi.mock("./node-process-boundary.js", () => ({
	processReadRoot: fixture.readRoot,
	processArguments: () => ["synthetic-child-not-executed"],
	processPermissions: () => ({}),
	hasRestrictedPermissions: () => true,
}));
vi.mock("./session.js", () => ({
	BrowserSession: class {
		constructor(options: unknown) {
			fixture.session(options);
		}
	},
}));
vi.mock("./command-host.js", () => ({
	BrowserCommandHost: class {
		constructor(private readonly options: { createSession(): unknown }) {
			fixture.host(options);
		}
		async execute() {
			this.options.createSession();
			return { schemaVersion: 1, data: {} };
		}
		close() {}
	},
}));
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor(options: unknown) {
			fixture.processHost(options);
		}
		async execute() {
			return { schemaVersion: 1, data: {} };
		}
		close() {}
	},
}));
vi.mock("./node-secret-config.js", () => ({
	loadSecretConfig: fixture.secrets,
}));
vi.mock("./node-transport.js", () => ({
	NodeNetworkTransport: fixture.forbidden,
}));
vi.mock("./document-loader.js", () => ({
	loadBrowserDocument: fixture.forbidden,
}));
vi.mock("./page-scripts.js", () => ({ PageScripts: fixture.forbidden }));
vi.mock("./script-loader.js", () => ({ ScriptLoader: fixture.forbidden }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: fixture.forbidden,
	approvePlayground: fixture.forbidden,
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: fixture.forbidden,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => {
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("not-found", "No synthetic connection");
	},
	writeCommandConnection: fixture.forbidden,
}));
vi.mock("./node-capture.js", () => ({ saveCapture: fixture.forbidden }));
vi.mock("./node-playground-assets.js", () => ({
	loadPlaygroundAssets: fixture.forbidden,
}));
vi.mock("./node-state-client.js", () => ({
	runStateFileCommand: fixture.forbidden,
}));
vi.mock("./node-terminal.js", () => ({ runTerminal: fixture.forbidden }));
vi.mock("./cli-upload.js", () => ({
	UploadClientError: class extends Error {},
	runCliUpload: fixture.forbidden,
}));

const actors: BrowserSessionProcess[] = [];
const previousArgs = process.argv;
const previousCode = process.exitCode;
let childInput: EventEmitter | undefined;
const childExit = vi.fn();
const childMessages: Record<string, unknown>[] = [];

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	fixture.spawn.mockReset().mockImplementation(fixture.forbidden);
	fixture.readRoot.mockReset().mockResolvedValue("/synthetic/root");
	fixture.load.mockReset().mockResolvedValue({
		version: "0.0.0-synthetic",
		packageName: "@poe-platform/safe-js",
		adapter: "legacy",
		validation: "contract-shape-only",
		publicExport: "./core",
	});
	childMessages.length = 0;
	childInput = undefined;
	for (const key of [
		"AGENT_BROWSER_LANGUAGES",
		"AGENT_BROWSER_DOCUMENT_PROFILE",
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
		"AGENT_BROWSER_SECRET_CONFIG",
		"AGENT_BROWSER_SESSION",
		"PLAYWRIGHT_CLI_SESSION",
	])
		vi.stubEnv(key, undefined);
	vi.stubEnv("LANG", "fr_FR.UTF-8");
	vi.stubEnv("LC_ALL", "de_DE.UTF-8");
	vi.stubEnv("LANGUAGE", "ja:ko");
});

afterEach(async () => {
	try {
		for (const actor of actors.splice(0)) await actor.close();
		if (childInput) {
			if (childMessages.some((message) => message.type === "fatal")) {
				await vi.waitFor(() => expect(childExit).toHaveBeenCalledWith(1));
			} else {
				childInput.emit("end");
				await vi.waitFor(() => expect(childExit).toHaveBeenCalledWith(0));
			}
		}
		expect(fixture.forbidden).not.toHaveBeenCalled();
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	}
});

class SyntheticChild extends EventEmitter {
	readonly pid = 12345;
	readonly frames: Record<string, unknown>[] = [];
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly stdin = Object.assign(new EventEmitter(), {
		write: (frame: string) => {
			const message = JSON.parse(frame);
			this.frames.push(message);
			queueMicrotask(() =>
				this.stdout.emit(
					"data",
					Buffer.from(
						`${JSON.stringify({
							schemaVersion: 1,
							type: "ready",
							pid: this.pid,
							session: message.session,
							version: "0.0.0-synthetic",
							packageName: "@poe-platform/safe-js",
							runtimeAdapter: "legacy",
							runtimeValidation: "contract-shape-only",
							publicExport: "./core",
							permissions: {},
						})}\n`,
					),
				),
			);
			return true;
		},
	});
	readonly kill = vi.fn(() => {
		queueMicrotask(() => this.emit("close"));
		return true;
	});
}

async function parent(identity?: BrowserIdentityOptions) {
	const child = new SyntheticChild();
	fixture.spawn.mockReturnValue(child);
	const { BrowserSessionProcess } = await import("./node-session-process.js");
	const actor = await BrowserSessionProcess.create({
		packageRoot: "/synthetic/root",
		identity,
	});
	actors.push(actor);
	return child;
}

function send(message: Record<string, unknown>) {
	childInput?.emit(
		"data",
		Buffer.from(`${JSON.stringify({ schemaVersion: 1, ...message })}\n`),
	);
}

async function child(identity?: unknown) {
	childInput = new EventEmitter();
	const output = Object.assign(new EventEmitter(), {
		write(frame: string, callback?: (error?: Error) => void) {
			childMessages.push(JSON.parse(frame));
			callback?.();
			return true;
		},
	});
	vi.spyOn(process, "stdin", "get").mockReturnValue(childInput as never);
	vi.spyOn(process, "stdout", "get").mockReturnValue(output as never);
	vi.spyOn(process, "exit").mockImplementation((code) => {
		childExit(code);
		return undefined as never;
	});
	await import("./node-session-child.js");
	send({
		type: "initialize",
		packageRoot: "/synthetic/root",
		session: "identity",
		heartbeatMs: 250,
		identity,
	});
	await vi.waitFor(() => expect(childMessages.length).toBeGreaterThan(0));
}

async function cli() {
	process.argv = ["node", "agent-browser", "capabilities"];
	process.exitCode = 0;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(() =>
		expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
	);
	return { log, error };
}

describe("synthetic identity plumbing only; no SDK, runtime, process or network probes", () => {
	it("preserves the custom user agent through the parent frame and child session options", async () => {
		const identity = {
			userAgent: "Compatibility/1 AgentBrowser/0.1",
			languages: ["pl-pl"],
		};
		const created = await parent(identity);
		const serialized = created.frames[0].identity;
		expect(serialized).toEqual({
			userAgent: identity.userAgent,
			languages: ["pl-PL"],
		});
		await child(serialized);
		expect(childMessages[0].type).toBe("ready");
		send({ type: "command", id: 1, argv: ["capabilities"] });
		await vi.waitFor(() => expect(fixture.session).toHaveBeenCalledOnce());
		expect(fixture.session.mock.calls[0][0].identity).toEqual(serialized);
	});

	it.each([undefined, { languages: ["pl-pl", "en-us"] }])(
		"parent serializes only canonical language options (%j)",
		async (identity) => {
			const created = await parent(identity);
			expect(created.frames[0].identity).toEqual({
				languages: identity ? ["pl-PL", "en-US"] : ["en-US"],
			});
			expect(fixture.spawn).toHaveBeenCalledExactlyOnceWith(
				process.execPath,
				["synthetic-child-not-executed"],
				{
					cwd: "/synthetic/root",
					env: {},
					stdio: ["pipe", "pipe", "pipe"],
				},
			);
			expect(fixture.load).not.toHaveBeenCalled();
		},
	);

	it("parent snapshots canonical options before asynchronous root resolution", async () => {
		const identity = { languages: ["pl-pl", "en-us"] };
		fixture.readRoot.mockImplementation(async () => {
			identity.languages[0] = "fr";
			identity.languages = ["de"];
			return "/synthetic/root";
		});
		const created = await parent(identity);
		expect(created.frames[0].identity).toEqual({
			languages: ["pl-PL", "en-US"],
		});
	});

	it.each([
		null,
		{ languages: [] },
		{ languages: ["en", "EN"] },
		{ platform: "Chrome" },
	])(
		"parent rejects invalid identity before root access or mocked spawn (%j)",
		async (identity) => {
			const { BrowserSessionProcess } = await import(
				"./node-session-process.js"
			);
			await expect(
				BrowserSessionProcess.create({
					packageRoot: "/synthetic/root",
					identity: identity as BrowserIdentityOptions,
				}),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(fixture.readRoot).not.toHaveBeenCalled();
			expect(fixture.spawn).not.toHaveBeenCalled();
		},
	);

	it("parent rejects accessor options without invoking the accessor or spawning", async () => {
		const getter = vi.fn(() => ["en-US"]);
		const identity = Object.defineProperty({}, "languages", { get: getter });
		const { BrowserSessionProcess } = await import("./node-session-process.js");
		await expect(
			BrowserSessionProcess.create({
				packageRoot: "/synthetic/root",
				identity,
			}),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(getter).not.toHaveBeenCalled();
		expect(fixture.spawn).not.toHaveBeenCalled();
	});

	it.each([undefined, { languages: ["pl-pl", "en-us"] }])(
		"child reconstructs frozen options for the mocked BrowserSession (%j)",
		async (identity) => {
			await child(identity);
			expect(childMessages[0].type).toBe("ready");
			send({ type: "command", id: 1, argv: ["capabilities"] });
			await vi.waitFor(() => expect(fixture.session).toHaveBeenCalledOnce());
			const options = fixture.session.mock.calls[0][0].identity;
			expect(options).toEqual({
				languages: identity ? ["pl-PL", "en-US"] : ["en-US"],
			});
			expect(Object.isFrozen(options)).toBe(true);
			expect(Object.isFrozen(options.languages)).toBe(true);
			expect(fixture.spawn).not.toHaveBeenCalled();
		},
	);

	it.each(
		[
			null,
			[],
			{ languages: [] },
			{ languages: ["en-us", "en-US"] },
			{ languages: ["en_US"] },
			{ languages: [null] },
			{ languages: ["en"], platform: "Chrome" },
		].map((identity) => [identity]),
	)(
		"child rejects invalid serialized identity before mocked runtime loading (%j)",
		async (identity) => {
			await child(identity);
			expect(childMessages[0]).toMatchObject({
				type: "fatal",
				code: "invalid-input",
			});
			expect(fixture.load).not.toHaveBeenCalled();
			expect(fixture.host).not.toHaveBeenCalled();
			expect(fixture.session).not.toHaveBeenCalled();
			expect(fixture.spawn).not.toHaveBeenCalled();
		},
	);

	it.each([undefined, '["pl-pl","en-us"]'])(
		"CLI forwards identical explicit options to both mocked host paths (%s)",
		async (languages) => {
			vi.stubEnv("AGENT_BROWSER_LANGUAGES", languages);
			expect((await cli()).error).not.toHaveBeenCalled();
			const native = fixture.session.mock.calls[0][0].identity;
			expect(native).toEqual({
				languages: languages ? ["pl-PL", "en-US"] : ["en-US"],
			});
			vi.resetModules();
			vi.restoreAllMocks();
			vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/synthetic/root");
			expect((await cli()).error).not.toHaveBeenCalled();
			const forwarded = fixture.processHost.mock.calls[0][0].process.identity;
			expect(forwarded).toEqual(native);
			expect(Object.isFrozen(native.languages)).toBe(true);
			expect(Object.isFrozen(forwarded.languages)).toBe(true);
			expect(fixture.spawn).not.toHaveBeenCalled();
			expect(fixture.load).not.toHaveBeenCalled();
		},
	);

	it.each([undefined, "/synthetic/root"])(
		"CLI rejects invalid languages before any host or secret loading (root %s)",
		async (root) => {
			vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", root);
			vi.stubEnv("AGENT_BROWSER_LANGUAGES", '["en-US","en-us"]');
			const { log, error } = await cli();
			expect(log).not.toHaveBeenCalled();
			expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
				error: { code: "invalid-input" },
			});
			expect(process.exitCode).toBe(1);
			expect(fixture.secrets).not.toHaveBeenCalled();
			expect(fixture.host).not.toHaveBeenCalled();
			expect(fixture.processHost).not.toHaveBeenCalled();
			expect(fixture.spawn).not.toHaveBeenCalled();
		},
	);
});
