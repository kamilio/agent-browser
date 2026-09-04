import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentFileSelections } from "./control-files.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { runEventActionAsync } from "./event-actions.js";
import { DocumentEvents } from "./events.js";
import type {
	CommandConnection,
	requestCommand,
} from "./node-command-client.js";
import { executeUploadCommand } from "./upload-commands.js";
import type { UploadCommandResult } from "./upload-protocol.js";
import { UploadTransfers } from "./upload-transfers.js";

const network = vi.hoisted(() => ({
	request: vi.fn<typeof requestCommand>(),
	read: vi.fn<() => Promise<CommandConnection>>(),
	spawn: vi.fn(() => {
		throw new Error("Unexpected subprocess");
	}),
	listen: vi.fn(() => {
		throw new Error("Unexpected socket");
	}),
}));
vi.mock("node:child_process", () => ({ spawn: network.spawn }));
vi.mock("node:fs/promises", async (original) => ({
	...(await original<typeof import("node:fs/promises")>()),
}));
vi.mock("./errors.js", async (original) => original());
vi.mock("./node-command-client.js", () => ({
	requestCommand: network.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: network.listen,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: network.read,
	writeCommandConnection: vi.fn(),
}));

const connection: CommandConnection = {
	schemaVersion: 1,
	origin: "http://127.0.0.1:23456",
	token: "a".repeat(43),
};
const directories: string[] = [];
const resources: { tree: DocumentTree; transfers: UploadTransfers }[] = [];
const previousArgs = process.argv;
const previousCode = process.exitCode;
let initialInt: NodeJS.SignalsListener[] = [];
let initialTerm: NodeJS.SignalsListener[] = [];

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	network.request.mockReset();
	network.read.mockReset().mockResolvedValue(connection);
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
		for (const { tree, transfers } of resources.splice(0)) {
			transfers.close();
			tree.close();
		}
		for (const directory of directories.splice(0))
			await fs.rm(directory, { recursive: true, force: true });
		expect(network.spawn).not.toHaveBeenCalled();
		expect(network.listen).not.toHaveBeenCalled();
		expect(process.listeners("SIGINT")).toEqual(initialInt);
		expect(process.listeners("SIGTERM")).toEqual(initialTerm);
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	}
});

async function privateFile(
	name = "private-name.bin",
	data: Uint8Array | string = "PRIVATE-CONTENT",
) {
	const directory = await fs.mkdtemp(
		join(tmpdir(), "agent-browser-cli-upload-"),
	);
	directories.push(directory);
	const path = join(directory, name);
	await fs.writeFile(path, data, { mode: 0o600 });
	return { directory, path };
}

type RequestHook = (
	argv: readonly string[],
	signal: AbortSignal | undefined,
	next: () => Promise<UploadCommandResult>,
) => Promise<UploadCommandResult | { closed: true }>;

function server(session = "default") {
	const tree = new DocumentTree("https://fixture.invalid/upload");
	const form = tree.createElement("form", {
		method: "post",
		enctype: "multipart/form-data",
	});
	const input = tree.createElement("input", {
		type: "file",
		multiple: "",
		name: "attachment",
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	const owner = new DocumentFileSelections(tree);
	const events = new DocumentEvents(tree);
	const transfers = new UploadTransfers();
	resources.push({ tree, transfers });
	transfers.attach(session, owner, (action, signal) =>
		runEventActionAsync(events, action, signal),
	);
	const state: { hook?: RequestHook } = {};
	network.request.mockImplementation(
		async (received, body, _timeout, signal) => {
			expect(received).toBe(connection);
			if (!body || body.session !== session)
				throw new AgentBrowserError("invalid-input", "Wrong fixture session");
			expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(
				65_536,
			);
			const next = () =>
				executeUploadCommand(transfers, session, body.argv, signal);
			return state.hook ? state.hook(body.argv, signal, next) : next();
		},
	);
	return {
		tree,
		input,
		owner,
		transfers,
		reference: tree.reference(input),
		state,
	};
}

async function invoke(argv: string[]) {
	process.argv = ["node", "agent-browser", ...argv];
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(
		() => expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
		{ timeout: 5000 },
	);
	const output = String(log.mock.calls[0]?.[0] ?? error.mock.calls[0]?.[0]);
	return { log, error, output, report: JSON.parse(output) };
}

function commands() {
	return network.request.mock.calls.map(([, body]) => body?.argv[0]);
}

function interrupt() {
	const listener = process
		.listeners("SIGINT")
		.find((entry) => !initialInt.includes(entry));
	expect(listener).toBeDefined();
	listener?.("SIGINT");
}

it("captures before any private-file access, then commits real staged bytes through the CLI entry", async () => {
	const test = server("chosen");
	const bytes = new Uint8Array(70_000).fill(65);
	const first = await privateFile("private-first.bin", bytes);
	const empty = await privateFile("private-empty.bin", "");
	const last = await privateFile("private-last.bin", "TAIL");
	const originalStat = fs.lstat;
	const originalOpen = fs.open;
	vi.spyOn(fs, "lstat").mockImplementation(
		(...args: Parameters<typeof fs.lstat>) => {
			expect(commands()[0]).toBe("upload-target");
			return originalStat(...args);
		},
	);
	vi.spyOn(fs, "open").mockImplementation((...args) => {
		expect(commands()).toEqual(["upload-target"]);
		return originalOpen(...args);
	});
	const result = await invoke([
		"-s=chosen",
		"upload",
		test.reference,
		first.path,
		empty.path,
		last.path,
		"--json",
	]);
	expect(result.error).not.toHaveBeenCalled();
	expect(result.report).toMatchObject({
		command: "upload",
		session: "chosen",
		data: { committed: true, stagingReleased: true, files: 3, bytes: 70_004 },
	});
	expect(test.owner.files(test.reference).map((file) => file.data)).toEqual([
		bytes,
		new Uint8Array(),
		new TextEncoder().encode("TAIL"),
	]);
	expect(commands()).toEqual([
		"upload-target",
		"upload-begin",
		"upload-write",
		"upload-write",
		"upload-write",
		"upload-write",
		"upload-commit",
	]);
	const writes = network.request.mock.calls.filter(
		([, body]) => body?.argv[0] === "upload-write",
	);
	expect(writes.map(([, body]) => body?.argv.slice(3, 5))).toEqual([
		["0", "0"],
		["0", "32768"],
		["0", "65536"],
		["2", "0"],
	]);
	for (const [, body, timeout, signal] of network.request.mock.calls) {
		expect(body?.session).toBe("chosen");
		expect(timeout).toBe(35_000);
		expect(signal).toBeInstanceOf(AbortSignal);
		for (const file of [first, empty, last])
			expect(JSON.stringify(body)).not.toContain(file.path);
	}
	expect(network.read).toHaveBeenCalledOnce();
	expect(test.transfers.metrics()).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	for (const secret of [
		first.path,
		empty.path,
		"private-first.bin",
		"TAIL",
		connection.token,
	])
		expect(result.output).not.toContain(secret);
});

it.each([
	["explicit", "environment", "fallback", ["-s=explicit"]],
	["environment", "environment", "fallback", []],
	["fallback", undefined, "fallback", []],
	["default", undefined, undefined, []],
] as const)(
	"preserves session precedence for %s and supports relative private paths",
	async (session, environment, fallback, flags) => {
		const test = server(session);
		const file = await privateFile();
		vi.stubEnv("AGENT_BROWSER_SESSION", environment);
		vi.stubEnv("PLAYWRIGHT_CLI_SESSION", fallback);
		const result = await invoke([
			...flags,
			"upload",
			test.reference,
			"--timeout=2000",
			"--",
			relative(process.cwd(), file.path),
		]);
		expect(result.error).not.toHaveBeenCalled();
		expect(result.report).toMatchObject({ session, data: { committed: true } });
		expect(
			network.request.mock.calls.every(
				([, body, timeout]) => body?.session === session && timeout === 7000,
			),
		).toBe(true);
		expect(result.output).not.toContain(file.path);
	},
);

it.each(["session", "command", "schema", "reference"])(
	"rejects wrong capture %s before reading any file",
	async (field) => {
		const test = server();
		test.state.hook = async (_argv, _signal, next) => {
			const result = await next();
			return {
				...result,
				...(field === "session" ? { session: "other" } : {}),
				...(field === "command" ? { command: "upload-begin" } : {}),
				...(field === "schema" ? { schemaVersion: 2 } : {}),
				...(field === "reference"
					? {
							data: {
								target: {
									...test.owner.capture(test.reference),
									reference: "e999",
								},
							},
						}
					: {}),
			} as UploadCommandResult;
		};
		const opened = vi.spyOn(fs, "open");
		const result = await invoke([
			"upload",
			test.reference,
			"/missing/PRIVATE-FILE.bin",
		]);
		expect(result.report).toMatchObject({
			ok: false,
			error: { remoteCleanupConfirmed: true },
		});
		expect(opened).not.toHaveBeenCalled();
		expect(commands()).toEqual(["upload-target"]);
		expect(result.output).not.toContain("PRIVATE-FILE");
	},
);

it("preserves stale-target errors and redacts server error contents before private reads", async () => {
	const test = server();
	test.state.hook = async () => {
		throw new AgentBrowserError(
			"stale-reference",
			"/private/SECRET contents TOKEN",
		);
	};
	const opened = vi.spyOn(fs, "open");
	const result = await invoke([
		"upload",
		test.reference,
		"/missing/private.bin",
	]);
	expect(result.report).toMatchObject({
		error: { code: "stale-reference", remoteCleanupConfirmed: true },
	});
	expect(opened).not.toHaveBeenCalled();
	expect(result.output).not.toMatch(/SECRET|TOKEN|\/private\//);
});

it("passes unresolved target text to the server without inventing a successful selection", async () => {
	server();
	const result = await invoke([
		"upload",
		"#server-owned-target",
		"/missing/private.bin",
	]);
	expect(network.request.mock.calls[0][1]?.argv).toEqual([
		"upload-target",
		"#server-owned-target",
	]);
	expect(result.report.ok).toBe(false);
	expect(commands()).toEqual(["upload-target"]);
});

it.each(["public", "symlink", "hardlink", "directory"])(
	"rejects %s private-file policy violations without beginning staging",
	async (kind) => {
		const test = server();
		const file = await privateFile();
		let path = file.path;
		if (kind === "public") await fs.chmod(path, 0o644);
		if (kind === "symlink") {
			path = join(file.directory, "link.bin");
			await fs.symlink(file.path, path);
		}
		if (kind === "hardlink")
			await fs.link(path, join(file.directory, "hard.bin"));
		if (kind === "directory") path = file.directory;
		const result = await invoke(["upload", test.reference, path]);
		expect(result.report).toMatchObject({
			ok: false,
			error: { code: "policy-denied", remoteCleanupConfirmed: true },
		});
		expect(commands()).toEqual(["upload-target"]);
		expect(result.output).not.toContain(file.directory);
		expect(result.output).not.toContain("PRIVATE-CONTENT");
	},
);

it("rejects a missing file after capture without leaking its path", async () => {
	const test = server();
	const file = await privateFile();
	const missing = join(file.directory, "missing-private.bin");
	const result = await invoke(["upload", test.reference, missing]);
	expect(result.report).toMatchObject({
		error: { code: "not-found", remoteCleanupConfirmed: true },
	});
	expect(commands()).toEqual(["upload-target"]);
	expect(result.output).not.toContain(missing);
});

it("cancels staging after an incorrect chunk acknowledgement", async () => {
	const test = server();
	const file = await privateFile();
	test.state.hook = async (argv, _signal, next) => {
		const result = await next();
		return argv[0] === "upload-write"
			? { ...result, data: { ...(result.data as object), receivedBytes: 0 } }
			: result;
	};
	const result = await invoke(["upload", test.reference, file.path]);
	expect(result.report).toMatchObject({
		error: { code: "invalid-input", remoteCleanupConfirmed: true },
	});
	expect(commands()).toEqual([
		"upload-target",
		"upload-begin",
		"upload-write",
		"upload-cancel",
	]);
	expect(test.transfers.metrics()).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	expect(test.owner.files(test.reference)).toHaveLength(0);
});

it("reports unconfirmed cleanup when the begin response is lost", async () => {
	const test = server();
	const file = await privateFile();
	test.state.hook = async (argv, _signal, next) => {
		const result = await next();
		if (argv[0] === "upload-begin")
			throw new AgentBrowserError("network-error", "PRIVATE-CONTENT");
		return result;
	};
	const result = await invoke(["upload", test.reference, file.path]);
	expect(result.report).toMatchObject({
		error: { code: "network-error", remoteCleanupConfirmed: false },
	});
	expect(commands()).toEqual(["upload-target", "upload-begin"]);
	expect(test.transfers.metrics().transfers).toBe(1);
	expect(result.output).not.toContain("PRIVATE-CONTENT");
});

it.each([true, false])(
	"uses an independent cleanup signal after interruption; cleanup succeeds=%s",
	async (cleanupSucceeds) => {
		const test = server();
		const file = await privateFile();
		test.state.hook = async (argv, signal, next) => {
			if (argv[0] === "upload-write") {
				interrupt();
				expect(signal?.aborted).toBe(true);
				throw new AgentBrowserError("aborted", "PRIVATE-CONTENT");
			}
			if (argv[0] === "upload-cancel") {
				expect(signal?.aborted).toBe(false);
				if (!cleanupSucceeds) throw new Error("SECRET-CLEANUP-ERROR");
			}
			return next();
		};
		const result = await invoke(["upload", test.reference, file.path]);
		expect(result.report).toMatchObject({
			error: { code: "aborted", remoteCleanupConfirmed: cleanupSucceeds },
		});
		expect(commands().at(-1)).toBe("upload-cancel");
		expect(result.output).not.toMatch(/PRIVATE-CONTENT|SECRET-CLEANUP-ERROR/);
	},
);

it("aborts a pending request at the overall timeout and then releases staging", async () => {
	const test = server();
	const file = await privateFile();
	test.state.hook = async (argv, signal, next) => {
		if (argv[0] === "upload-write")
			return new Promise((_, reject) => {
				const rejectAborted = () =>
					reject(new AgentBrowserError("aborted", "Timed out request"));
				if (signal?.aborted) rejectAborted();
				else signal?.addEventListener("abort", rejectAborted, { once: true });
			});
		return next();
	};
	const result = await invoke([
		"upload",
		test.reference,
		file.path,
		"--timeout=250",
	]);
	expect(result.report).toMatchObject({
		error: { code: "timeout", remoteCleanupConfirmed: true },
	});
	expect(commands().at(-1)).toBe("upload-cancel");
	expect(test.transfers.metrics().transfers).toBe(0);
});

it("does not promise rollback when a committed selection's acknowledgement is lost", async () => {
	const test = server();
	const file = await privateFile();
	test.state.hook = async (argv, _signal, next) => {
		const result = await next();
		if (argv[0] === "upload-commit")
			throw new AgentBrowserError("network-error", "PRIVATE-CONTENT");
		return result;
	};
	const result = await invoke(["upload", test.reference, file.path]);
	expect(result.report).toMatchObject({
		error: { code: "network-error", remoteCleanupConfirmed: true },
	});
	expect(test.owner.files(test.reference)).toHaveLength(1);
	expect(result.output).toContain("inspect document state before retrying");
	expect(result.output).not.toContain("PRIVATE-CONTENT");
});

it("rejects stale captured ownership at begin without retargeting", async () => {
	const test = server();
	const file = await privateFile();
	test.state.hook = async (argv, _signal, next) => {
		if (argv[0] === "upload-begin") test.owner.invalidateTargets();
		return next();
	};
	const result = await invoke(["upload", test.reference, file.path]);
	expect(result.report).toMatchObject({ error: { code: "stale-reference" } });
	expect(commands()).toEqual(["upload-target", "upload-begin"]);
	expect(test.owner.files(test.reference)).toHaveLength(0);
});

it("sanitizes connection failures without falling back to local dispatch", async () => {
	const test = server();
	network.read.mockRejectedValue(
		new AgentBrowserError("not-found", "/private/SECRET-connection"),
	);
	const result = await invoke([
		"upload",
		test.reference,
		"/private/SECRET-file",
	]);
	expect(result.report).toMatchObject({
		error: { code: "not-found", remoteCleanupConfirmed: true },
	});
	expect(network.request).not.toHaveBeenCalled();
	expect(result.output).not.toContain("SECRET");
});

it.each([
	{ argv: ["upload", "e1"] },
	{ argv: ["upload", "e1", "\u0000private"] },
	{ argv: ["upload", "e1", "/private/file", "--timeout=0"] },
	{ argv: ["upload", "e1", "--/private/file"] },
])(
	"rejects invalid CLI upload arguments without requests: %j",
	async ({ argv }) => {
		server();
		const result = await invoke(argv);
		expect(result.report).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
		expect(network.request).not.toHaveBeenCalled();
		expect(result.output).not.toContain("/private/file");
	},
);

it.each(["help", "version"])(
	"preserves upload --%s without forwarding private arguments",
	async (option) => {
		server("chosen");
		network.request.mockResolvedValue({
			schemaVersion: 1,
			command: "upload",
			session: "chosen",
			data: { discovery: option },
		});
		const result = await invoke([
			"-s=chosen",
			"upload",
			"PRIVATE-TARGET",
			"/private/file",
			`--${option}`,
			"--json",
		]);
		expect(result.error).not.toHaveBeenCalled();
		expect(network.request).toHaveBeenCalledExactlyOnceWith(connection, {
			argv: ["upload", `--${option}`, "--json"],
			session: "chosen",
		});
		expect(result.output).not.toContain("/private/file");
		expect(result.output).not.toContain("PRIVATE-TARGET");
	},
);
