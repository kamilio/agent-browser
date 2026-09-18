import { afterEach, beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
	configured: vi.fn(),
	closed: vi.fn(async () => {}),
	connection: vi.fn(),
	secrets: vi.fn(async () => undefined),
	request: vi.fn(() => {
		throw new Error("Unexpected network request");
	}),
	listen: vi.fn(() => {
		throw new Error("Unexpected socket listener");
	}),
	spawn: vi.fn(() => {
		throw new Error("Unexpected process launch");
	}),
	load: vi.fn(() => {
		throw new Error("Unexpected SDK loading");
	}),
}));
vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("./node-page-core.js", () => ({ loadPageRuntime: boundary.load }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: boundary.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: boundary.listen,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: boundary.connection,
	writeCommandConnection: vi.fn(),
}));
vi.mock("./node-secret-config.js", () => ({
	loadSecretConfig: boundary.secrets,
}));
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor(options: unknown) {
			boundary.configured(options);
		}
		async execute() {
			return { schemaVersion: 1, data: {} };
		}
		close = boundary.closed;
	},
}));

const previousArgs = process.argv;
const previousCode = process.exitCode;
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	boundary.connection.mockImplementation(async () => {
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("not-found", "No fixture connection");
	});
	for (const name of [
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
		"AGENT_BROWSER_SECRET_CONFIG",
		"AGENT_BROWSER_LANGUAGES",
		"AGENT_BROWSER_DOCUMENT_PROFILE",
		"AGENT_BROWSER_RESOURCE_CACHE",
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
	expect(boundary.request).not.toHaveBeenCalled();
	expect(boundary.listen).not.toHaveBeenCalled();
	expect(boundary.spawn).not.toHaveBeenCalled();
	expect(boundary.load).not.toHaveBeenCalled();
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

it.each([undefined, "classic", "module"])(
	"forwards extension website script mode %s without executing a runtime",
	async (websiteScripts) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", websiteScripts);
		const { error } = await invoke();
		expect(error).not.toHaveBeenCalled();
		expect(boundary.configured).toHaveBeenCalledExactlyOnceWith({
			process: {
				packageRoot: "/trusted/fixture",
				runtimeAdapter: "extension",
				websiteScripts,
				identity: { languages: ["en-US"] },
			},
		});
		expect(boundary.closed).toHaveBeenCalledOnce();
	},
);

it.each([undefined, "legacy"])(
	"rejects module mode with adapter %s before discovery or secret loading",
	async (runtimeAdapter) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", runtimeAdapter);
		vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "module");
		boundary.connection.mockResolvedValue({ origin: "fixture", token: "test" });
		const { error, log } = await invoke();
		expect(log).not.toHaveBeenCalled();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "unsupported",
				message: expect.stringContaining("PAGE_RUNTIME=extension"),
			},
		});
		expect(boundary.connection).not.toHaveBeenCalled();
		expect(boundary.secrets).not.toHaveBeenCalled();
		expect(boundary.configured).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	},
);

it.each(["", "modules", "auto", "MODULE"])(
	"rejects invalid script mode %s before discovery",
	async (websiteScripts) => {
		vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
		vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", websiteScripts);
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: { code: "invalid-input" },
		});
		expect(boundary.connection).not.toHaveBeenCalled();
		expect(boundary.secrets).not.toHaveBeenCalled();
		expect(boundary.configured).not.toHaveBeenCalled();
	},
);

it("requires an explicit root for extension module mode", async () => {
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
	vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "module");
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: { code: "invalid-input" },
	});
	expect(boundary.connection).not.toHaveBeenCalled();
	expect(boundary.configured).not.toHaveBeenCalled();
});

it("keeps native website scripts disabled without runtime configuration", async () => {
	const { log, error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(JSON.parse(log.mock.calls[0][0]).data).toMatchObject({
		websiteJavaScript: false,
		scriptLoading: { mode: "disabled", modules: false },
	});
	expect(boundary.configured).not.toHaveBeenCalled();
});
