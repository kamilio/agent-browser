import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import type { DocumentTree } from "./document.js";
import { type SessionActor, SessionProcessHost } from "./node-session-host.js";
import {
	BrowserSessionProcess,
	type SessionProcessOptions,
} from "./node-session-process.js";
import type { PageScriptOptions } from "./page-scripts.js";
import type { ScriptLoader } from "./script-loader.js";

const boundary = vi.hoisted(() => ({
	spawn: vi.fn((): unknown => {
		throw new Error("Unexpected subprocess");
	}),
	readRoot: vi.fn(async () => "/trusted/fixture"),
	load: vi.fn(),
	requests: vi.fn(),
	loader: vi.fn(),
	owner: vi.fn(),
	evaluate: vi.fn(async () => ({
		engine: "poe-safe-js",
		partial: true,
		ok: true,
		metrics: { steps: 0, peakCallDepth: 0, peakDataSize: 0, consoleCalls: 0 },
	})),
	permissions: {
		enabled: true,
		filesystemWrite: false,
		childProcess: false,
		worker: false,
		addons: false,
		wasi: false,
		stringCodeGenerationDisabled: true,
	},
}));
vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("./node-process-boundary.js", async (original) => ({
	...(await original<typeof import("./node-process-boundary.js")>()),
	processReadRoot: boundary.readRoot,
	processPermissions: () => boundary.permissions,
}));
vi.mock("./node-page-core.js", () => ({ loadPageRuntime: boundary.load }));
vi.mock("./page-scripts.js", () => ({
	PageScripts: class {
		closed = false;
		constructor(page: unknown, factory: unknown, options: PageScriptOptions) {
			boundary.owner(page, factory, options);
		}
		evaluate = boundary.evaluate;
		async close() {
			this.closed = true;
		}
	},
}));
vi.mock("./script-loader.js", () => ({
	ScriptLoader: class {
		constructor(
			private readonly options: ConstructorParameters<typeof ScriptLoader>[0],
		) {
			boundary.loader(options);
		}
		start(document: DocumentTree) {
			this.options.owner(document);
		}
		async script() {}
		async finish() {}
	},
}));
vi.mock("./node-transport.js", () => ({
	NodeNetworkTransport: class {
		async request(input: { url: string }) {
			boundary.requests(input);
			const body = new TextEncoder().encode("<p>Module wiring fixture</p>");
			return {
				url: input.url,
				status: 200,
				headers: { "content-type": ["text/html"] },
				body,
				redirects: [],
				encodedBytes: body.byteLength,
				elapsedMs: 0,
			};
		}
		metrics() {
			return {
				requests: 0,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			};
		}
		close() {}
	},
}));

const processes: BrowserSessionProcess[] = [];
const hosts: SessionProcessHost[] = [];
const messages: Record<string, unknown>[] = [];
const exit = vi.fn();
let input: EventEmitter | undefined;

class FakeChild extends EventEmitter {
	readonly pid = 42123;
	readonly stdout = new EventEmitter();
	readonly stderr = new EventEmitter();
	readonly frames: Record<string, unknown>[] = [];
	readonly stdin = Object.assign(new EventEmitter(), {
		write: (frame: string) => {
			const message = JSON.parse(frame);
			this.frames.push(message);
			if (message.type === "initialize")
				queueMicrotask(() =>
					this.stdout.emit(
						"data",
						Buffer.from(
							`${JSON.stringify({
								schemaVersion: 1,
								type: "ready",
								pid: this.pid,
								session: message.session,
								version: "0.1.40-fixture",
								packageName: "@poe-platform/safe-js",
								runtimeAdapter: message.runtimeAdapter,
								runtimeValidation: "contract-shape-only",
								publicExport: "./core",
								permissions: boundary.permissions,
							})}\n`,
						),
					),
				);
			return true;
		},
	});
	kill() {
		queueMicrotask(() => this.emit("close"));
		return true;
	}
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	boundary.spawn.mockReset();
	boundary.spawn.mockImplementation(() => {
		throw new Error("Unexpected subprocess");
	});
	boundary.load.mockImplementation(async (_root, options) => ({
		factory: {},
		adapter: options.adapter,
		packageName: "@poe-platform/safe-js",
		version: "0.1.40-fixture",
		publicExport: "./core",
		validation: "contract-shape-only",
	}));
	messages.length = 0;
	input = undefined;
});
afterEach(async () => {
	try {
		for (const host of hosts.splice(0)) await host.close();
		for (const process of processes.splice(0)) await process.close();
		if (input) {
			if (messages.some((message) => message.type === "fatal"))
				await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
			else {
				input.emit("end");
				await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
			}
			expect(boundary.spawn).not.toHaveBeenCalled();
		}
	} finally {
		vi.restoreAllMocks();
	}
});

it.each([undefined, "classic", "module"] as const)(
	"forwards %s in the restricted process initialization frame",
	async (websiteScripts) => {
		const child = new FakeChild();
		boundary.spawn.mockReturnValue(child);
		const process = await BrowserSessionProcess.create({
			packageRoot: "/trusted/fixture",
			runtimeAdapter: "extension",
			websiteScripts,
			scripts: { limits: { maxSteps: 100 } },
		});
		processes.push(process);
		expect(child.frames[0]).toMatchObject({
			runtimeAdapter: "extension",
			scripts: { limits: { maxSteps: 100 } },
		});
		expect(child.frames[0].websiteScripts).toBe(websiteScripts);
		expect(boundary.load).not.toHaveBeenCalled();
		expect(boundary.requests).not.toHaveBeenCalled();
	},
);

it.each([undefined, "legacy"] as const)(
	"rejects process and host module mode with %s before root resolution",
	async (runtimeAdapter) => {
		const options = {
			packageRoot: "/trusted/fixture",
			runtimeAdapter,
			websiteScripts: "module" as const,
		};
		await expect(BrowserSessionProcess.create(options)).rejects.toMatchObject({
			code: "unsupported",
		});
		expect(() => new SessionProcessHost({ process: options })).toThrow(
			"require the extension page runtime",
		);
		expect(boundary.readRoot).not.toHaveBeenCalled();
		expect(boundary.spawn).not.toHaveBeenCalled();
		expect(boundary.load).not.toHaveBeenCalled();
	},
);

it.each([null, false, "", "modules", "auto"])(
	"rejects invalid process and host script mode %s before any boundary work",
	async (websiteScripts) => {
		const options = {
			packageRoot: "/trusted/fixture",
			runtimeAdapter: "extension",
			websiteScripts,
		} as unknown as SessionProcessOptions;
		await expect(BrowserSessionProcess.create(options)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(() => new SessionProcessHost({ process: options })).toThrow(
			"Invalid website script mode",
		);
		expect(boundary.readRoot).not.toHaveBeenCalled();
		expect(boundary.spawn).not.toHaveBeenCalled();
	},
);

it.each([undefined, "classic", "module"] as const)(
	"reports %s host capabilities and forwards the same mode to its actor",
	async (websiteScripts) => {
		const createProcess = vi.fn(async (options: SessionProcessOptions) => {
			const session = options.session ?? "default";
			let resolveExit = () => {};
			return {
				session,
				exited: new Promise<void>((resolve) => {
					resolveExit = resolve;
				}),
				async execute() {
					return { schemaVersion: 1, command: "open", session, data: {} };
				},
				async close() {
					resolveExit();
				},
				metrics: () => ({ closed: false, terminating: false }),
				info: () => ({ pid: 42, version: "fixture", session }),
			} satisfies SessionActor;
		});
		const host = new SessionProcessHost({
			process: {
				packageRoot: "/trusted/fixture",
				runtimeAdapter: "extension",
				websiteScripts,
			},
			createProcess,
		});
		hosts.push(host);
		expect(host.capabilities()).toMatchObject({
			websiteJavaScript: websiteScripts !== undefined,
			runtimeValidation: "configuration-only",
			scriptLoading: {
				mode: websiteScripts ?? "disabled",
				modules: websiteScripts === "module",
			},
		});
		expect(createProcess).not.toHaveBeenCalled();
		await host.execute(["open"], { session: "selected" });
		expect(createProcess).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				session: "selected",
				runtimeAdapter: "extension",
				websiteScripts,
			}),
		);
		expect(boundary.spawn).not.toHaveBeenCalled();
	},
);

it.each([undefined, false, true, "module"] as const)(
	"preserves the command host boolean API with explicit module value %s",
	(websiteScripts) => {
		const host = new BrowserCommandHost({
			createSession: () => {
				throw new Error("Unexpected session creation");
			},
			evaluatePage: async () => ({
				engine: "poe-safe-js",
				partial: true,
				ok: true,
				metrics: {
					steps: 0,
					peakCallDepth: 0,
					peakDataSize: 0,
					consoleCalls: 0,
				},
			}),
			websiteScripts,
		});
		try {
			expect(host.capabilities()).toMatchObject({
				websiteJavaScript: !!websiteScripts,
				scriptLoading: {
					mode:
						websiteScripts === "module"
							? "module"
							: websiteScripts
								? "classic"
								: "disabled",
					modules: websiteScripts === "module",
				},
			});
			if (websiteScripts === "module")
				expect(host.capabilities().limitations.join(" ")).not.toContain(
					"modules, many DOM APIs",
				);
		} finally {
			host.close();
		}
	},
);

function send(message: Record<string, unknown>) {
	input?.emit(
		"data",
		Buffer.from(`${JSON.stringify({ schemaVersion: 1, ...message })}\n`),
	);
}

async function waitMessage(type: string, id?: number) {
	const matches = (message: Record<string, unknown>) =>
		message.type === type && (id === undefined || message.id === id);
	await vi.waitFor(() => expect(messages.some(matches)).toBe(true));
	return messages.find(matches);
}

async function initialize(overrides: Record<string, unknown> = {}) {
	input = new EventEmitter();
	const output = Object.assign(new EventEmitter(), {
		write(data: string, callback?: (error?: Error) => void) {
			messages.push(JSON.parse(data));
			callback?.();
			return true;
		},
	});
	vi.spyOn(process, "stdin", "get").mockReturnValue(input as never);
	vi.spyOn(process, "stdout", "get").mockReturnValue(output as never);
	vi.spyOn(process, "exit").mockImplementation((code) => {
		exit(code);
		return undefined as never;
	});
	await import("./node-session-child.js");
	send({
		type: "initialize",
		packageRoot: "/trusted/fixture",
		session: "modules",
		heartbeatMs: 250,
		runtimeAdapter: "extension",
		...overrides,
	});
}

it.each([undefined, "legacy"])(
	"rejects child module mode with %s before loading the SDK",
	async (runtimeAdapter) => {
		await initialize({ runtimeAdapter, websiteScripts: "module" });
		expect(await waitMessage("fatal")).toMatchObject({ code: "unsupported" });
		expect(boundary.load).not.toHaveBeenCalled();
		expect(boundary.requests).not.toHaveBeenCalled();
	},
);

it.each([null, false, "modules", "auto", ""])(
	"rejects invalid child script mode %s before loading the SDK",
	async (websiteScripts) => {
		await initialize({ websiteScripts });
		expect(await waitMessage("fatal")).toMatchObject({ code: "invalid-input" });
		expect(boundary.load).not.toHaveBeenCalled();
		expect(boundary.requests).not.toHaveBeenCalled();
	},
);

it.each([undefined, "classic", "module"] as const)(
	"wires child mode %s to the loader, per-document owner and capability label",
	async (websiteScripts) => {
		await initialize({
			websiteScripts,
			scripts: { limits: { maxSteps: 100 } },
		});
		await waitMessage("ready");
		send({ type: "command", id: 1, argv: ["capabilities"] });
		expect(await waitMessage("result", 1)).toMatchObject({
			result: {
				data: {
					websiteJavaScript: websiteScripts !== undefined,
					scriptLoading: {
						mode: websiteScripts ?? "disabled",
						modules: websiteScripts === "module",
					},
				},
			},
		});
		send({
			type: "command",
			id: 2,
			argv: ["open", "https://fixture.invalid/"],
		});
		await waitMessage("result", 2);
		if (websiteScripts === undefined) {
			expect(boundary.loader).not.toHaveBeenCalled();
			expect(boundary.owner).not.toHaveBeenCalled();
		} else {
			expect(boundary.loader).toHaveBeenCalledOnce();
			const loader = boundary.loader.mock.calls[0][0];
			expect(loader.limits).toEqual(
				websiteScripts === "module" ? { modules: true } : undefined,
			);
			expect(boundary.owner).toHaveBeenCalledOnce();
			const options = boundary.owner.mock.calls[0][2];
			expect(options.limits).toEqual({ maxSteps: 100 });
			if (websiteScripts === "module") {
				expect(options.networkSourceModules).toEqual({
					documentUrl: "https://fixture.invalid/",
					entries: [],
					htmlEntries: true,
					fetchWithPolicy: expect.any(Function),
				});
				expect(options.networkSourceModules?.fetchWithPolicy).not.toBe(
					loader.fetchWithPolicy,
				);
				expect(loader.fetchWithPolicy).toEqual(expect.any(Function));
			} else expect(options.networkSourceModules).toBeUndefined();
		}
		send({ type: "command", id: 3, argv: ["eval", "fixture"] });
		await waitMessage("result", 3);
		expect(boundary.owner).toHaveBeenCalledOnce();
		expect(boundary.evaluate).toHaveBeenCalledOnce();
		expect(boundary.requests).toHaveBeenCalledOnce();
		if (websiteScripts === "module") {
			const first = boundary.owner.mock.calls[0][2].networkSourceModules;
			send({
				type: "command",
				id: 4,
				argv: ["goto", "https://fixture.invalid/second"],
			});
			await waitMessage("result", 4);
			expect(boundary.owner).toHaveBeenCalledTimes(2);
			const second = boundary.owner.mock.calls[1][2].networkSourceModules;
			expect(second).not.toBe(first);
			expect(second.documentUrl).toBe("https://fixture.invalid/second");
			expect(second.fetchWithPolicy).not.toBe(first.fetchWithPolicy);
		}
	},
);
