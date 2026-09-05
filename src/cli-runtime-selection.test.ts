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
	vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", undefined);
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", undefined);
	vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", undefined);
	vi.stubEnv("AGENT_BROWSER_LANGUAGES", undefined);
	vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", undefined);
	vi.stubEnv("AGENT_BROWSER_SESSION", undefined);
	vi.stubEnv("PLAYWRIGHT_CLI_SESSION", undefined);
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

it("keeps the native no-runtime path when no SafeJS configuration is present", async () => {
	const { log, error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(JSON.parse(log.mock.calls[0][0]).data).toMatchObject({
		websiteJavaScript: false,
	});
	expect(runtime.configured).not.toHaveBeenCalled();
});

it("forwards legacy by default without enabling website scripts", async () => {
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
	expect(runtime.closed).toHaveBeenCalledOnce();
});

it.each([undefined, "classic"])(
	"forwards explicit extension selection with script setting %s",
	async (websiteScripts) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", websiteScripts);
		const { error } = await invoke();
		expect(error).not.toHaveBeenCalled();
		expect(runtime.configured).toHaveBeenCalledExactlyOnceWith({
			process: {
				packageRoot: "/trusted/fixture",
				runtimeAdapter: "extension",
				websiteScripts,
				identity: { languages: ["en-US"] },
			},
		});
	},
);

it.each([
	["extension", undefined],
	["extension", ""],
	["legacy", undefined],
])(
	"rejects explicit %s configuration without a usable configured root (%s)",
	async (adapter, root) => {
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", adapter);
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", root);
		const { error, log } = await invoke();
		expect(log).not.toHaveBeenCalled();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			ok: false,
			error: {
				code: "invalid-input",
				message: expect.stringContaining(
					"requires an explicit SafeJS package root",
				),
			},
		});
		expect(process.exitCode).toBe(1);
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it.each(["auto", "", "released"])(
	"rejects unknown runtime setting %s without fallback",
	async (adapter) => {
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", adapter);
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: { code: "invalid-input" },
		});
		expect(runtime.configured).not.toHaveBeenCalled();
	},
);

it("preserves the website-script root requirement when no adapter is configured", async () => {
	vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: { code: "unsupported" },
	});
	expect(runtime.configured).not.toHaveBeenCalled();
});

it("does not bypass adapter root validation through an existing connection", async () => {
	runtime.connection = {
		schemaVersion: 1,
		origin: "http://127.0.0.1:12345",
		token: "fixture-token",
	};
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: { code: "invalid-input" },
	});
	expect(runtime.request).not.toHaveBeenCalled();
	expect(runtime.configured).not.toHaveBeenCalled();
});

it("preserves rejection of unsupported website-script modes", async () => {
	vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
	vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "module");
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: { code: "invalid-input" },
	});
	expect(runtime.configured).not.toHaveBeenCalled();
});
