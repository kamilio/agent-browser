import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandHostOptions } from "./command-host.js";
import { CookieJar } from "./cookies.js";
import { resourceCacheFromEnvironment } from "./node-resource-cache-config.js";
import type { NodeTransportOptions } from "./node-transport.js";
import type { BrowserSessionOptions } from "./session.js";

const fixture = vi.hoisted(() => ({
	connection: undefined as object | undefined,
	response: { schemaVersion: 1, data: { synthetic: true } },
	onRead: () => {},
	read: vi.fn(),
	request: vi.fn(),
	host: vi.fn<(options: CommandHostOptions) => void>(),
	session: vi.fn<(options: BrowserSessionOptions) => void>(),
	transport: vi.fn<(options: NodeTransportOptions) => void>(),
	execute: vi.fn(),
	close: vi.fn(async () => {}),
	secrets: vi.fn(async () => undefined),
	identity: vi.fn(() => ({ languages: ["en-US"] })),
	nativeLoader: vi.fn(),
	readerLoader: vi.fn(),
	forbidden: vi.fn(() => {
		throw new Error("Forbidden CLI resource boundary");
	}),
}));

vi.mock("node:child_process", () => ({
	spawn: fixture.forbidden,
	execFile: fixture.forbidden,
	fork: fixture.forbidden,
}));
vi.mock("./document-loader.js", () => ({
	loadBrowserDocument: fixture.nativeLoader,
}));
vi.mock("./research-loader.js", () => ({
	loadResearchDocument: fixture.readerLoader,
}));
vi.mock("./node-identity-config.js", () => ({
	identityFromEnvironment: fixture.identity,
}));
vi.mock("./node-secret-config.js", () => ({
	loadSecretConfig: fixture.secrets,
}));
vi.mock("./command-host.js", () => ({
	BrowserCommandHost: class {
		constructor(options: CommandHostOptions) {
			fixture.host(options);
		}
		async execute(...args: unknown[]) {
			fixture.execute(...args);
			return fixture.response;
		}
		close = fixture.close;
	},
}));
vi.mock("./session.js", () => ({
	BrowserSession: class {
		constructor(options: BrowserSessionOptions) {
			fixture.session(options);
		}
	},
}));
vi.mock("./node-transport.js", () => ({
	NodeNetworkTransport: class {
		constructor(options: NodeTransportOptions) {
			fixture.transport(options);
		}
	},
}));
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor() {
			fixture.forbidden();
		}
	},
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async (...args: unknown[]) => {
		fixture.read(...args);
		fixture.onRead();
		if (fixture.connection) return fixture.connection;
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("not-found", "No synthetic service");
	},
	writeCommandConnection: fixture.forbidden,
}));
vi.mock("./node-command-client.js", () => ({
	requestCommand: async (...args: unknown[]) => {
		fixture.request(...args);
		return fixture.response;
	},
	approvePlayground: fixture.forbidden,
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: fixture.forbidden,
}));
vi.mock("./node-playground-assets.js", () => ({
	loadPlaygroundAssets: fixture.forbidden,
}));
vi.mock("./node-terminal.js", () => ({ runTerminal: fixture.forbidden }));
vi.mock("./node-capture.js", () => ({ saveCapture: fixture.forbidden }));
vi.mock("./node-state-client.js", () => ({
	runStateFileCommand: fixture.forbidden,
}));
vi.mock("./cli-upload.js", () => ({
	runCliUpload: fixture.forbidden,
	UploadClientError: class extends Error {},
}));
vi.mock("./snapshot.js", () => ({ renderSnapshot: fixture.forbidden }));
vi.mock("./snapshot-search.js", () => ({
	renderSnapshotSearch: fixture.forbidden,
}));

const enabledSetting = "public-anonymous-v1";
const invalidSettings = [
	"",
	"true",
	"1",
	" ",
	"\t",
	"null",
	"PUBLIC-ANONYMOUS-V1",
	" public-anonymous-v1",
	"public-anonymous-v1 ",
];
const contexts = [
	{ documentProfile: "native", processRuntime: false },
	{ documentProfile: "native", processRuntime: true },
	{ documentProfile: "reader", processRuntime: false },
	{ documentProfile: "reader", processRuntime: true },
] as const;
const previousArgs = process.argv;
const previousCode = process.exitCode;
const cookieJars: CookieJar[] = [];

function createCookieJar() {
	const cookieJar = new CookieJar();
	cookieJars.push(cookieJar);
	return cookieJar;
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	for (const setting of [
		"AGENT_BROWSER_RESOURCE_CACHE",
		"AGENT_BROWSER_DOCUMENT_PROFILE",
		"AGENT_BROWSER_SAFEJS_ROOT",
		"AGENT_BROWSER_PAGE_RUNTIME",
		"AGENT_BROWSER_PAGE_SCRIPTS",
		"AGENT_BROWSER_SECRET_CONFIG",
		"AGENT_BROWSER_LANGUAGES",
		"AGENT_BROWSER_SESSION",
		"PLAYWRIGHT_CLI_SESSION",
		"AGENT_BROWSER_RUNTIME_DIR",
	])
		vi.stubEnv(setting, undefined);
	vi.stubGlobal("fetch", fixture.forbidden);
	fixture.connection = undefined;
	fixture.onRead = () => {};
	process.exitCode = 0;
});

afterEach(() => {
	for (const cookieJar of cookieJars.splice(0)) cookieJar.close();
	process.argv = previousArgs;
	process.exitCode = previousCode;
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	expect(fixture.forbidden).not.toHaveBeenCalled();
	expect(fixture.nativeLoader).not.toHaveBeenCalled();
	expect(fixture.readerLoader).not.toHaveBeenCalled();
});

async function invoke() {
	process.argv = ["node", "agent-browser", "capabilities"];
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(() =>
		expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
	);
	return { log, error };
}

function expectNoLocalResources() {
	for (const boundary of [
		fixture.secrets,
		fixture.host,
		fixture.session,
		fixture.transport,
		fixture.execute,
		fixture.close,
		fixture.forbidden,
	])
		expect(boundary).not.toHaveBeenCalled();
}

async function expectRejected(code: string, message?: string) {
	const { log, error } = await invoke();
	expect(log).not.toHaveBeenCalled();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		ok: false,
		error: {
			code,
			...(message ? { message: expect.stringContaining(message) } : {}),
		},
	});
	expect(process.exitCode).toBe(1);
	expect(fixture.read).not.toHaveBeenCalled();
	expect(fixture.request).not.toHaveBeenCalled();
	expectNoLocalResources();
}

describe("pure resource cache configuration", () => {
	it.each(contexts)("keeps unset configuration disabled for %j", (context) => {
		expect(resourceCacheFromEnvironment(undefined, context)).toBe(false);
	});
	it("enables only the explicit native anonymous resource setting", () => {
		expect(resourceCacheFromEnvironment(enabledSetting, contexts[0])).toBe(
			true,
		);
	});
	it.each([...invalidSettings, null as unknown as string])(
		"rejects invalid setting %j before compatibility checks",
		(setting) => {
			for (const context of contexts)
				expect(() =>
					resourceCacheFromEnvironment(setting, context),
				).toThrowError(expect.objectContaining({ code: "invalid-input" }));
		},
	);
	it.each(contexts.slice(1))(
		"rejects enabled incompatible context %j",
		(context) => {
			expect(() =>
				resourceCacheFromEnvironment(enabledSetting, context),
			).toThrowError(expect.objectContaining({ code: "unsupported" }));
		},
	);
});

describe("synthetic CLI resource cache startup", () => {
	it.each([undefined, enabledSetting])(
		"preserves exact session and transport options for setting %j",
		async (setting) => {
			vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", setting);
			const { log, error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(0);
			expect(log).toHaveBeenCalledExactlyOnceWith(
				JSON.stringify(fixture.response, null, 2),
			);
			expect(fixture.host).toHaveBeenCalledExactlyOnceWith({
				secrets: undefined,
				documentFormats: [
					"text/html",
					"text/plain",
					"application/json",
					"application/*+json",
					"text/xml",
					"application/xml",
					"application/rss+xml",
					"application/atom+xml",
				],
				createSession: expect.any(Function),
			});
			fixture.host.mock.calls[0][0].createSession("synthetic");
			expect(fixture.session).toHaveBeenCalledOnce();
			const sessionOptions = fixture.session.mock.calls[0][0];
			expect(sessionOptions).toStrictEqual({
				identity: { languages: ["en-US"] },
				createTransport: expect.any(Function),
				loadDocument: fixture.nativeLoader,
				...(setting === undefined ? {} : { resourceCredentials: "omit" }),
			});
			expect(sessionOptions.identity).toBe(
				fixture.identity.mock.results[0].value,
			);
			const cookieJar = createCookieJar();
			sessionOptions.createTransport(cookieJar);
			expect(fixture.transport).toHaveBeenCalledOnce();
			expect(fixture.transport.mock.calls[0][0]).toStrictEqual({
				cookieJar,
				...(setting === undefined ? {} : { resourceCache: {} }),
			});
			expect(fixture.transport.mock.calls[0][0].cookieJar).toBe(cookieJar);
			expect(fixture.secrets).toHaveBeenCalledExactlyOnceWith(undefined, {
				processRuntime: false,
			});
			expect(fixture.execute).toHaveBeenCalledExactlyOnceWith(
				["capabilities"],
				{ session: "default" },
			);
			expect(fixture.close).toHaveBeenCalledOnce();
			expect(fixture.request).not.toHaveBeenCalled();
		},
	);

	it.each(invalidSettings)(
		"rejects invalid CLI setting %j before IO",
		async (setting) => {
			vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", setting);
			vi.stubEnv("AGENT_BROWSER_SECRET_CONFIG", "/synthetic/private-config");
			fixture.connection = { synthetic: "existing-service" };
			await expectRejected("invalid-input", "AGENT_BROWSER_RESOURCE_CACHE");
		},
	);

	it.each([
		["AGENT_BROWSER_DOCUMENT_PROFILE", "reader"],
		["AGENT_BROWSER_SAFEJS_ROOT", "/synthetic/root"],
		["AGENT_BROWSER_SAFEJS_ROOT", ""],
		["AGENT_BROWSER_PAGE_SCRIPTS", "classic"],
		["AGENT_BROWSER_PAGE_SCRIPTS", ""],
		["AGENT_BROWSER_PAGE_SCRIPTS", "module"],
		["AGENT_BROWSER_PAGE_SCRIPTS", " "],
	])("rejects enabled reuse with %s=%j before IO", async (name, value) => {
		vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", enabledSetting);
		vi.stubEnv(name, value);
		fixture.connection = { synthetic: "existing-service" };
		await expectRejected("unsupported", "Resource reuse requires");
	});

	it.each(["legacy", "extension"])(
		"preserves explicit %s adapter root validation first",
		async (adapter) => {
			vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", "");
			vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", adapter);
			vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
			fixture.connection = { synthetic: "existing-service" };
			await expectRejected(
				"invalid-input",
				"requires an explicit SafeJS package root",
			);
		},
	);

	it.each([undefined, enabledSetting])(
		"captures setting %j before connection reading",
		async (setting) => {
			vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", setting);
			fixture.onRead = () =>
				vi.stubEnv(
					"AGENT_BROWSER_RESOURCE_CACHE",
					setting === undefined ? enabledSetting : undefined,
				);
			const { error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			fixture.host.mock.calls[0][0].createSession("synthetic");
			const options = fixture.session.mock.calls[0][0];
			expect(Object.hasOwn(options, "resourceCredentials")).toBe(
				setting !== undefined,
			);
			options.createTransport(createCookieJar());
			expect(
				Object.hasOwn(fixture.transport.mock.calls[0][0], "resourceCache"),
			).toBe(setting !== undefined);
		},
	);

	it.each([undefined, enabledSetting])(
		"forwards unchanged to an existing daemon with client setting %j",
		async (setting) => {
			vi.stubEnv("AGENT_BROWSER_RESOURCE_CACHE", setting);
			fixture.connection = { synthetic: "existing-service" };
			const { log, error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(0);
			expect(fixture.read).toHaveBeenCalledExactlyOnceWith(undefined);
			expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
				fixture.connection,
				{
					argv: ["capabilities"],
					session: "default",
				},
			);
			expect(log).toHaveBeenCalledExactlyOnceWith(
				JSON.stringify(fixture.response, null, 2),
			);
			expectNoLocalResources();
		},
	);
});
