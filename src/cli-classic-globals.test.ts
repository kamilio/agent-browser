import { afterEach, beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	connection: undefined as object | undefined,
	configured: vi.fn(),
	closed: vi.fn(async () => {}),
	request: vi.fn(() => {
		throw new Error("Unexpected network request");
	}),
	listen: vi.fn(() => {
		throw new Error("Unexpected socket listener");
	}),
	spawn: vi.fn(() => {
		throw new Error("Unexpected process launch");
	}),
}));
vi.mock("node:child_process", () => ({ spawn: runtime.spawn }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: runtime.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: runtime.listen,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => {
		if (runtime.connection) return runtime.connection;
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("not-found", "No fixture connection");
	},
	writeCommandConnection: vi.fn(),
}));
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor(private readonly options: unknown) {
			runtime.configured(options);
		}
		async execute() {
			return { schemaVersion: 1, data: { configured: this.options } };
		}
		close = runtime.closed;
	},
}));

const previousArgs = process.argv;
const previousCode = process.exitCode;
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	runtime.connection = undefined;
	for (const name of [
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
		"AGENT_BROWSER_PAGE_GLOBALS",
		"AGENT_BROWSER_CALLBACK_SCHEDULING",
		"AGENT_BROWSER_LANGUAGES",
		"AGENT_BROWSER_DOCUMENT_PROFILE",
		"AGENT_BROWSER_RESOURCE_CACHE",
		"AGENT_BROWSER_SECRET_CONFIG",
		"AGENT_BROWSER_SESSION",
		"PLAYWRIGHT_CLI_SESSION",
	])
		vi.stubEnv(name, undefined);
	process.exitCode = 0;
	process.argv = ["node", "agent-browser", "capabilities"];
});
afterEach(() => {
	process.argv = previousArgs;
	process.exitCode = previousCode;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	expect(runtime.request).not.toHaveBeenCalled();
	expect(runtime.listen).not.toHaveBeenCalled();
	expect(runtime.spawn).not.toHaveBeenCalled();
});

async function invoke() {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(() =>
		expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
	);
	return { log, error };
}

it.each([
	["classic", undefined, { classicScripts: true }],
	[undefined, "after-prefix", { callbackScheduling: "after-prefix" }],
	[
		"classic",
		"after-prefix",
		{ classicScripts: true, callbackScheduling: "after-prefix" },
	],
] as const)(
	"propagates exact explicit semantics without enabling website scripts %#",
	async (globals, scheduling, runtimeOptions) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_PAGE_GLOBALS", globals);
		vi.stubEnv("AGENT_BROWSER_CALLBACK_SCHEDULING", scheduling);
		const { error } = await invoke();
		expect(error).not.toHaveBeenCalled();
		expect(runtime.configured).toHaveBeenCalledExactlyOnceWith({
			process: {
				packageRoot: "/trusted/fixture",
				runtimeAdapter: "extension",
				websiteScripts: undefined,
				identity: { languages: ["en-US"] },
				runtimeOptions,
			},
		});
		expect(runtime.closed).toHaveBeenCalledOnce();
	},
);

it("keeps automatic classic website loading distinct from classic global semantics", async () => {
	vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
	vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
	const { error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(runtime.configured.mock.calls[0][0].process).not.toHaveProperty(
		"runtimeOptions",
	);
});

it("keeps the default process option shape unchanged", async () => {
	vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
	const { error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(runtime.configured).toHaveBeenCalledExactlyOnceWith({
		process: {
			packageRoot: "/trusted/fixture",
			runtimeAdapter: "legacy",
			websiteScripts: undefined,
			identity: { languages: ["en-US"] },
		},
	});
});

it("keeps no-SDK native operation unchanged", async () => {
	const { error, log } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(JSON.parse(log.mock.calls[0][0]).data.websiteJavaScript).toBe(false);
	expect(runtime.configured).not.toHaveBeenCalled();
});

it.each(["", "true", "false", "Classic", "classic ", "module"])(
	"rejects invalid globals strings %s",
	async (value) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_PAGE_GLOBALS", value);
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "invalid-input",
				message: expect.stringContaining("AGENT_BROWSER_PAGE_GLOBALS"),
			},
		});
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it.each(["", "true", "false", "immediate", "after-prefix "])(
	"rejects invalid scheduling strings %s",
	async (value) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_CALLBACK_SCHEDULING", value);
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "invalid-input",
				message: expect.stringContaining("AGENT_BROWSER_CALLBACK_SCHEDULING"),
			},
		});
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it.each([
	["AGENT_BROWSER_PAGE_GLOBALS", "classic"],
	["AGENT_BROWSER_CALLBACK_SCHEDULING", "after-prefix"],
])(
	"requires a package root for %s before reusing a connection",
	async (name, value) => {
		runtime.connection = {
			schemaVersion: 1,
			origin: "http://127.0.0.1:12345",
			token: "fixture",
		};
		vi.stubEnv(name, value);
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "invalid-input",
				message: expect.stringContaining("explicit SafeJS package root"),
			},
		});
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it.each([undefined, "legacy"])(
	"rejects runtime semantics with adapter %s",
	async (adapter) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", adapter);
		vi.stubEnv("AGENT_BROWSER_PAGE_GLOBALS", "classic");
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "unsupported",
				message: expect.stringContaining("extension"),
			},
		});
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it.each([
	["AGENT_BROWSER_PAGE_GLOBALS", "classic"],
	["AGENT_BROWSER_CALLBACK_SCHEDULING", "after-prefix"],
])("rejects reader profile conflicts for %s", async (name, value) => {
	vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
	vi.stubEnv(name, value);
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: {
			code: "invalid-input",
			message: `Reader document profile is incompatible with ${name}`,
		},
	});
	expect(runtime.configured).not.toHaveBeenCalled();
});
