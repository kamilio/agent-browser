import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandHostOptions } from "./command-host.js";
import type { DocumentExtraction } from "./extraction.js";
import {
	type DocumentProfileEnvironment,
	documentProfileFromEnvironment,
} from "./node-document-profile.js";
import {
	type ResearchReaderReport,
	researchReaderNotice,
	researchReaderProfile,
} from "./research-reader-info.js";
import type { BrowserSessionOptions } from "./session.js";

const fixture = vi.hoisted(() => ({
	connection: undefined as object | undefined,
	response: {} as object,
	onRead: () => {},
	read: vi.fn(),
	request: vi.fn(),
	host: vi.fn<(options: CommandHostOptions) => void>(),
	session: vi.fn<(options: BrowserSessionOptions) => void>(),
	processHost: vi.fn(),
	close: vi.fn(async () => {}),
	secrets: vi.fn(async () => undefined),
	identity: vi.fn(() => ({ languages: ["en-US"] })),
	nativeLoader: vi.fn(),
	readerLoader: vi.fn(),
	renderSnapshot: vi.fn(),
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
		async execute() {
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
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor(options: unknown) {
			fixture.processHost(options);
		}
		async execute() {
			return fixture.response;
		}
		close = fixture.close;
	},
}));
vi.mock("./node-transport.js", () => ({
	NodeNetworkTransport: fixture.forbidden,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => {
		fixture.read();
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
vi.mock("./snapshot.js", () => ({ renderSnapshot: fixture.renderSnapshot }));
vi.mock("./snapshot-search.js", () => ({
	renderSnapshotSearch: fixture.forbidden,
}));

const incompatibleSettings = [
	"AGENT_BROWSER_SAFEJS_ROOT",
	"AGENT_BROWSER_SECRET_CONFIG",
	"AGENT_BROWSER_PAGE_RUNTIME",
	"AGENT_BROWSER_PAGE_SCRIPTS",
] as const;
const invalidProfiles = ["", "Reader", "READER", " reader", "reader ", "auto"];
const reader: Readonly<ResearchReaderReport> = Object.freeze({
	profile: researchReaderProfile,
	partial: true,
	scripting: false,
	styling: false,
	hiddenContentSemantics: false,
	sourceCodeUnits: 10,
	textCodeUnits: 4,
	outputCodeUnits: 4,
	tokens: 1,
	omittedTokens: 0,
	omittedSubtrees: Object.freeze({ script: 1 }),
	ignoredAttributes: 0,
	unwrappedElements: 0,
	tokenizerIssues: 0,
});

function extraction(withReader: boolean): DocumentExtraction {
	return {
		document: "synthetic-document",
		scope: "synthetic-scope",
		url: "https://fixture.invalid/",
		title: "Synthetic",
		revision: 0,
		partial: true,
		format: "markdown",
		content: "Synthetic content\n",
		...(withReader ? { reader } : {}),
	};
}

const previousArgs = process.argv;
const previousCode = process.exitCode;
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	for (const setting of [
		...incompatibleSettings,
		"AGENT_BROWSER_DOCUMENT_PROFILE",
		"AGENT_BROWSER_LANGUAGES",
		"AGENT_BROWSER_SESSION",
		"PLAYWRIGHT_CLI_SESSION",
		"AGENT_BROWSER_RUNTIME_DIR",
	])
		vi.stubEnv(setting, undefined);
	fixture.connection = undefined;
	fixture.response = { schemaVersion: 1, data: { synthetic: true } };
	fixture.onRead = () => {};
	process.exitCode = 0;
});
afterEach(() => {
	process.argv = previousArgs;
	process.exitCode = previousCode;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	expect(fixture.forbidden).not.toHaveBeenCalled();
	expect(fixture.nativeLoader).not.toHaveBeenCalled();
	expect(fixture.readerLoader).not.toHaveBeenCalled();
});

async function invoke(argv = ["capabilities"]) {
	process.argv = ["node", "agent-browser", ...argv];
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(() =>
		expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
	);
	return { log, error };
}

describe("pure document profile configuration", () => {
	it.each([undefined, "native", "reader"])("selects %s exactly", (profile) => {
		expect(
			documentProfileFromEnvironment({
				AGENT_BROWSER_DOCUMENT_PROFILE: profile,
			}),
		).toBe(profile ?? "native");
	});
	it.each(invalidProfiles)("rejects invalid profile %j", (profile) => {
		expect(() =>
			documentProfileFromEnvironment({
				AGENT_BROWSER_DOCUMENT_PROFILE: profile,
			}),
		).toThrow("AGENT_BROWSER_DOCUMENT_PROFILE must be native or reader");
	});
	it.each(incompatibleSettings)(
		"rejects explicit reader setting %s",
		(setting) => {
			for (const value of ["", "synthetic-private-value"]) {
				const environment: DocumentProfileEnvironment = {
					AGENT_BROWSER_DOCUMENT_PROFILE: "reader",
					[setting]: value,
				};
				expect(() => documentProfileFromEnvironment(environment)).toThrow(
					`Reader document profile is incompatible with ${setting}`,
				);
				for (const profile of [undefined, "native"])
					expect(
						documentProfileFromEnvironment({
							...environment,
							AGENT_BROWSER_DOCUMENT_PROFILE: profile,
						}),
					).toBe("native");
			}
		},
	);
});

describe("mocked CLI document profile boundaries", () => {
	it.each([undefined, "native", "reader"])(
		"keeps the %s loader across sessions and later environment changes",
		async (profile) => {
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", profile);
			const { error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(0);
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
			const createSession = fixture.host.mock.calls[0][0].createSession;
			expect(createSession).toBeTypeOf("function");
			createSession?.("first");
			vi.stubEnv(
				"AGENT_BROWSER_DOCUMENT_PROFILE",
				profile === "reader" ? "native" : "reader",
			);
			createSession?.("second");
			expect(fixture.session).toHaveBeenCalledTimes(2);
			for (const [options] of fixture.session.mock.calls)
				expect(options).toEqual({
					identity: { languages: ["en-US"] },
					createTransport: expect.any(Function),
					loadDocument:
						profile === "reader" ? fixture.readerLoader : fixture.nativeLoader,
				});
			expect(fixture.secrets).toHaveBeenCalledExactlyOnceWith(undefined, {
				processRuntime: false,
			});
			expect(fixture.processHost).not.toHaveBeenCalled();
			expect(fixture.close).toHaveBeenCalledOnce();
		},
	);

	it("chooses the profile before reading connections or constructing resources", async () => {
		vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
		fixture.onRead = () =>
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "native");
		const { error } = await invoke();
		expect(error).not.toHaveBeenCalled();
		fixture.host.mock.calls[0][0].createSession?.("synthetic");
		expect(fixture.session.mock.calls[0][0].loadDocument).toBe(
			fixture.readerLoader,
		);
	});

	it("does not import later secret or script settings into a validated reader configuration", async () => {
		vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
		fixture.onRead = () => {
			vi.stubEnv(
				"AGENT_BROWSER_SECRET_CONFIG",
				"/synthetic/later-secret-config",
			);
			vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/synthetic/later-runtime");
			vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
		};
		const { error } = await invoke();
		expect(fixture.secrets).toHaveBeenCalledExactlyOnceWith(undefined, {
			processRuntime: false,
		});
		expect(error).not.toHaveBeenCalled();
		expect(fixture.processHost).not.toHaveBeenCalled();
		fixture.host.mock.calls[0][0].createSession?.("synthetic");
		expect(fixture.session.mock.calls[0][0].loadDocument).toBe(
			fixture.readerLoader,
		);
	});

	it("retains native secret configuration selected before connection lookup", async () => {
		vi.stubEnv(
			"AGENT_BROWSER_SECRET_CONFIG",
			"/synthetic/original-secret-config",
		);
		fixture.onRead = () => {
			vi.stubEnv(
				"AGENT_BROWSER_SECRET_CONFIG",
				"/synthetic/later-secret-config",
			);
			vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
		};
		const { error } = await invoke();
		expect(fixture.secrets).toHaveBeenCalledExactlyOnceWith(
			"/synthetic/original-secret-config",
			{ processRuntime: false },
		);
		expect(error).not.toHaveBeenCalled();
	});

	it.each([
		...invalidProfiles.map((value) => [
			"AGENT_BROWSER_DOCUMENT_PROFILE",
			value,
		]),
		...incompatibleSettings.flatMap((setting) => [
			[setting, ""],
			[setting, "synthetic-private-value"],
		]),
	])(
		"rejects %s=%j before all CLI resource boundaries",
		async (setting, value) => {
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
			vi.stubEnv(setting, value);
			fixture.connection = { synthetic: "existing-service" };
			const { log, error } = await invoke();
			expect(log).not.toHaveBeenCalled();
			expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
				ok: false,
				error: { code: "invalid-input" },
			});
			expect(error.mock.calls[0][0]).not.toContain("synthetic-private-value");
			expect(process.exitCode).toBe(1);
			for (const boundary of [
				fixture.identity,
				fixture.read,
				fixture.request,
				fixture.secrets,
				fixture.host,
				fixture.processHost,
				fixture.session,
			])
				expect(boundary).not.toHaveBeenCalled();
		},
	);

	it.each([undefined, "native"])(
		"preserves exact native process options for %s",
		async (profile) => {
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", profile);
			vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/synthetic/root");
			vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
			vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", "classic");
			const { error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			expect(fixture.processHost).toHaveBeenCalledExactlyOnceWith({
				process: {
					packageRoot: "/synthetic/root",
					runtimeAdapter: "extension",
					websiteScripts: "classic",
					identity: { languages: ["en-US"] },
				},
			});
			expect(fixture.secrets).toHaveBeenCalledExactlyOnceWith(undefined, {
				processRuntime: true,
			});
			expect(fixture.host).not.toHaveBeenCalled();
		},
	);

	it.each([undefined, "native", "reader"])(
		"does not reconfigure an existing service from client profile %s",
		async (profile) => {
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", profile);
			fixture.connection = { synthetic: "existing-service" };
			const { error } = await invoke();
			expect(error).not.toHaveBeenCalled();
			expect(fixture.request).toHaveBeenCalledExactlyOnceWith(
				fixture.connection,
				{
					argv: ["capabilities"],
					session: "default",
				},
			);
			expect(fixture.host).not.toHaveBeenCalled();
			expect(fixture.processHost).not.toHaveBeenCalled();
			expect(fixture.secrets).not.toHaveBeenCalled();
		},
	);
});

describe("synthetic CLI reader output", () => {
	beforeEach(() => {
		fixture.connection = { synthetic: "existing-service" };
	});
	it.each([undefined, "native", "reader"])(
		"uses returned extraction provenance, not client profile %s",
		async (profile) => {
			vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", profile);
			fixture.response = { schemaVersion: 1, data: extraction(true) };
			const { log, error } = await invoke(["extract"]);
			expect(error).not.toHaveBeenCalled();
			expect(log).toHaveBeenCalledExactlyOnceWith(
				`${researchReaderNotice}\nSynthetic content\n`,
			);
		},
	);
	it("does not label an extraction lacking reader metadata", async () => {
		vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
		fixture.response = { schemaVersion: 1, data: extraction(false) };
		const { log, error } = await invoke(["extract"]);
		expect(error).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledExactlyOnceWith("Synthetic content\n");
	});
	it.each([true, false])(
		"preserves the entire JSON report (reader=%s)",
		async (withReader) => {
			fixture.response = { schemaVersion: 1, data: extraction(withReader) };
			const before = JSON.stringify(fixture.response, null, 2);
			const { log, error } = await invoke(["extract", "--json"]);
			expect(error).not.toHaveBeenCalled();
			expect(log).toHaveBeenCalledExactlyOnceWith(before);
			expect(JSON.stringify(fixture.response, null, 2)).toBe(before);
		},
	);
	it("preserves structured extraction JSON without a plaintext notice", async () => {
		fixture.response = {
			schemaVersion: 1,
			data: {
				...extraction(true),
				format: "json",
				content: { ref: "e1", type: "text", text: "Synthetic" },
			},
		};
		const { log, error } = await invoke(["extract", "--format=json"]);
		expect(error).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify(fixture.response, null, 2),
		);
	});
	it("delegates the snapshot notice to the snapshot renderer", async () => {
		fixture.response = {
			schemaVersion: 1,
			data: {
				document: "synthetic",
				scope: "synthetic",
				revision: 0,
				entries: [],
				truncated: false,
				reader,
			},
		};
		fixture.renderSnapshot.mockReturnValue(
			`${researchReaderNotice}\nSynthetic snapshot`,
		);
		const { log, error } = await invoke(["snapshot"]);
		expect(error).not.toHaveBeenCalled();
		expect(fixture.renderSnapshot).toHaveBeenCalledExactlyOnceWith(
			(fixture.response as { data: unknown }).data,
		);
		expect(log).toHaveBeenCalledExactlyOnceWith(
			`${researchReaderNotice}\nSynthetic snapshot`,
		);
	});
	it("does not annotate a synthetic confidential command response", async () => {
		vi.stubEnv("AGENT_BROWSER_DOCUMENT_PROFILE", "reader");
		fixture.response = {
			schemaVersion: 1,
			data: { filled: true, confidential: true },
		};
		const { log, error } = await invoke([
			"fill-secret",
			"e1",
			"synthetic-reference",
		]);
		expect(error).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledExactlyOnceWith(
			JSON.stringify(fixture.response, null, 2),
		);
	});
});
