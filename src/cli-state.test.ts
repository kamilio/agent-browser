import {
	lstat,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { exportBrowserState } from "./browser-state.js";
import { parseInvocation } from "./cli-parser.js";
import { BrowserCommandHost } from "./command-host.js";
import { runStateFileCommand } from "./node-state-client.js";
import { writeStateFile } from "./node-state-file.js";
import { BrowserSession } from "./session.js";

const connection = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: connection.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => ({
		schemaVersion: 1,
		origin: "http://127.0.0.1:34567",
		token: "a".repeat(43),
	}),
	writeCommandConnection: vi.fn(),
}));

const directories: string[] = [];
const hosts: BrowserCommandHost[] = [];
const originalArgv = process.argv;
const originalExit = process.exitCode;

afterEach(async () => {
	process.argv = originalArgv;
	process.exitCode = originalExit;
	vi.restoreAllMocks();
	connection.request.mockReset();
	for (const host of hosts.splice(0)) host.close();
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), "agent-browser-cli-state-"));
	directories.push(directory);
	let browser: BrowserSession | undefined;
	const host = new BrowserCommandHost({
		createSession: () => {
			browser = new BrowserSession({
				createTransport: () => ({
					request: async () => {
						throw new Error("Unexpected network request");
					},
					metrics: () => ({
						requests: 0,
						active: 0,
						closed: false,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
					}),
					close: () => {},
				}),
				loadDocument: () => {
					throw new Error("Unexpected document load");
				},
			});
			return browser;
		},
	});
	hosts.push(host);
	await host.execute(["open"], { session: "state-test" });
	const owner = browser as unknown as BrowserSession;
	const tab = owner.tabs()[0].id;
	const url = "https://example.com/";
	owner.cookies.setCookie(
		url,
		"session=synthetic-secret; HttpOnly; Secure; Path=/",
		{ siteUrl: url },
	);
	owner.storage
		.localStorage(tab, url)
		.setItem("name", "synthetic-storage-secret");
	owner.storage.sessionStorage(tab, url).setItem("draft", "retained");
	const execute = vi.fn((argv: readonly string[]) =>
		host.execute(argv, { session: "state-test" }),
	);
	return {
		directory,
		filename: join(directory, "state.json"),
		host,
		owner,
		tab,
		url,
		execute,
	};
}

it("runs actual CLI save/load for a state larger than a protocol frame without printing credentials", async () => {
	const { filename, host, owner, tab, url } = await fixture();
	owner.storage.localStorage(tab, url).setItem("large", "x".repeat(2_200_000));
	const before = exportBrowserState(owner);
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	connection.request.mockImplementation(async (_connection, body) => {
		expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(65_536);
		return host.execute(body.argv, { session: body.session });
	});
	for (const command of ["state-save", "state-load"]) {
		process.argv = [
			"node",
			"agent-browser",
			"-s=state-test",
			command,
			filename,
			"--json",
		];
		log.mockClear();
		vi.resetModules();
		await import("./cli.js");
		await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1), {
			timeout: 5000,
		});
		expect(error).not.toHaveBeenCalled();
		const report = JSON.parse(log.mock.calls[0][0]);
		expect(report).toMatchObject({
			schemaVersion: 1,
			command,
			session: "state-test",
			data: { filename },
		});
		expect(JSON.stringify(report)).not.toContain("synthetic-secret");
		expect(JSON.stringify(report)).not.toContain("synthetic-storage-secret");
		if (command === "state-save") {
			expect(report.data).toMatchObject({
				cleanupConfirmed: true,
				remoteCleanupConfirmed: true,
			});
			expect((await lstat(filename)).mode & 0o077).toBe(0);
			expect(JSON.parse(await readFile(filename, "utf8"))).toEqual(before);
			owner.cookies.clear();
			owner.storage.localStorage(tab, url).clear();
		} else {
			expect(report.data.loaded).toBe(true);
			expect(exportBrowserState(owner)).toEqual(before);
		}
	}
	expect(owner.storage.sessionStorage(tab, url).getItem("draft")).toBe(
		"retained",
	);
	expect(host.metrics().stateTransfers).toMatchObject({
		bytes: 0,
		transfers: 0,
	});
});

it("saves relative/default filenames privately and requires explicit overwrite", async () => {
	const { directory, filename, execute } = await fixture();
	const invoke = (argv: string[]) =>
		runStateFileCommand(
			parseInvocation(["-s=state-test", ...argv]),
			execute,
			directory,
		);
	await invoke(["state-save", "state.json"]);
	const before = await readFile(filename, "utf8");
	await expect(invoke(["state-save", "state.json"])).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(await readFile(filename, "utf8")).toBe(before);
	await invoke(["state-save", "state.json", "--overwrite"]);
	const result = await invoke(["state-save"]);
	expect(result.filename).toMatch(/agent-browser-state-[a-f0-9-]+\.json$/);
	expect(await readdir(directory)).toHaveLength(2);
});

it("does not contact the service for unreadable or malformed input files", async () => {
	const { filename, execute } = await fixture();
	const invocation = parseInvocation(["-s=state-test", "state-load", filename]);
	await expect(runStateFileCommand(invocation, execute)).rejects.toMatchObject({
		code: "not-found",
	});
	await writeFile(filename, '{"synthetic-secret":', { mode: 0o600 });
	await expect(runStateFileCommand(invocation, execute)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(execute).not.toHaveBeenCalled();
});

it("preserves both owners on a late invalid state row from a private file", async () => {
	const { filename, owner, execute, host } = await fixture();
	const before = exportBrowserState(owner);
	await writeStateFile(
		filename,
		JSON.stringify({
			schemaVersion: 1,
			cookies: [],
			origins: [
				{
					origin: "https://example.com",
					localStorage: [{ name: "bad", value: 42 }],
				},
			],
		}),
	);
	await expect(
		runStateFileCommand(
			parseInvocation(["-s=state-test", "state-load", filename]),
			execute,
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(exportBrowserState(owner)).toEqual(before);
	expect(host.metrics().stateTransfers.bytes).toBe(0);
});

it("refuses an unexpected response session before writing an output file", async () => {
	const { filename, execute, directory } = await fixture();
	await expect(
		runStateFileCommand(
			parseInvocation(["-s=state-test", "state-save", filename]),
			async (argv) => ({ ...(await execute(argv)), session: "wrong" }),
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(await readdir(directory)).toEqual([]);
});

it("rejects unsupported file options without silently ignoring them", async () => {
	const { filename, execute } = await fixture();
	await expect(
		runStateFileCommand(
			parseInvocation(["-s=state-test", "state-save", filename, "--raw"]),
			execute,
		),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(execute).not.toHaveBeenCalled();
});
