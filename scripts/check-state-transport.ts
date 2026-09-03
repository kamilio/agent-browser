import { spawn } from "node:child_process";
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { BrowserState } from "../src/browser-state.js";
import { requestCommand } from "../src/node-command-client.js";
import { readCommandConnection } from "../src/node-runtime.js";

if (
	process.argv.length !== 3 ||
	process.argv[2] !== "--allow-loopback-processes"
) {
	console.error(
		"Separate loopback socket and Node process authorization required; see STATE-TRANSPORT.md.",
	);
	process.exit(2);
}

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const operations: {
	command: string;
	code: number | null;
	milliseconds: number;
	outputBytes: number;
}[] = [];
const binary = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const directory = await mkdtemp(
	join(tmpdir(), "agent-browser-state-transport-"),
);
const runtime = join(directory, "runtime");
const stateDirectory = join(directory, "state");
const environment = { AGENT_BROWSER_RUNTIME_DIR: runtime };
const children = new Set<ReturnType<typeof launch>>();
let stage = "setup";
let passed = false;
let cleanupConfirmed = false;
const secret = "synthetic-state-probe-secret";
const state: BrowserState = {
	schemaVersion: 1,
	cookies: [
		{
			name: "session",
			value: secret,
			host: "state.invalid",
			path: "/",
			secure: true,
			httpOnly: true,
			sameSite: "lax",
			expires: null,
		},
	],
	origins: [
		{
			origin: "https://state.invalid",
			localStorage: [{ name: "payload", value: "雪😀".repeat(320_000) }],
		},
	],
};
const stateBytes = Buffer.byteLength(JSON.stringify(state));

function check(label: string, condition: boolean) {
	checks.push({ label, passed: condition });
	if (!condition) throw new Error("Probe assertion failed");
}

function launch(argv: string[]) {
	const child = spawn(
		process.execPath,
		["--max-old-space-size=128", binary, ...argv, "--json"],
		{
			env: environment,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	let outputBytes = 0;
	let limited = false;
	const started = performance.now();
	const timer = setTimeout(
		() => {
			limited = true;
			child.kill("SIGKILL");
		},
		argv[0] === "serve" ? 60_000 : 20_000,
	);
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		outputBytes += Buffer.byteLength(chunk);
		if (outputBytes > 262_144) {
			limited = true;
			child.kill("SIGKILL");
		} else stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		outputBytes += Buffer.byteLength(chunk);
		if (outputBytes > 262_144) {
			limited = true;
			child.kill("SIGKILL");
		} else stderr += chunk;
	});
	let spawnFailed = false;
	child.on("error", () => {
		spawnFailed = true;
	});
	const closed = new Promise<{
		code: number | null;
		stdout: string;
		stderr: string;
		limited: boolean;
	}>((resolve) => {
		child.once("close", (code) => {
			clearTimeout(timer);
			operations.push({
				command: argv.find((arg) => !arg.startsWith("-")) ?? "unknown",
				code,
				milliseconds: Math.round(performance.now() - started),
				outputBytes,
			});
			resolve({ code, stdout, stderr, limited: limited || spawnFailed });
		});
	});
	return { child, closed };
}

async function command(
	argv: string[],
	expectedError?: string,
	session = "state-gate",
) {
	const process = launch([`-s=${session}`, ...argv]);
	children.add(process);
	const result = await process.closed;
	children.delete(process);
	check(
		`${argv[0]} exits within bounds`,
		!result.limited && result.code === (expectedError ? 1 : 0),
	);
	check(
		`${argv[0]} output omits state contents`,
		!`${result.stdout}${result.stderr}`.includes(secret) &&
			!`${result.stdout}${result.stderr}`.includes("雪😀"),
	);
	const parsed = JSON.parse(expectedError ? result.stderr : result.stdout);
	if (expectedError)
		check(
			`${argv[0]} rejects with ${expectedError}`,
			parsed.error?.code === expectedError,
		);
	return parsed;
}

async function start() {
	const service = launch(["serve"]);
	children.add(service);
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline) {
		try {
			return { service, connection: await readCommandConnection(runtime) };
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		if (service.child.exitCode !== null || service.child.signalCode !== null)
			break;
	}
	throw new Error("Service startup failed");
}

async function stop(service: ReturnType<typeof launch>) {
	await command(["stop-server"]);
	const result = await service.closed;
	children.delete(service);
	check(
		"foreground service exits cleanly",
		result.code === 0 && !result.limited,
	);
	check(
		"service omits synthetic credentials",
		!`${result.stdout}${result.stderr}`.includes(secret),
	);
	check(
		"service removes private discovery file",
		!(await readdir(runtime)).includes("connection.json"),
	);
}

async function savedState(filename: string) {
	const result = await command(["state-save", filename]);
	check(
		"remote and temporary-file cleanup confirmed",
		result.data.remoteCleanupConfirmed === true &&
			result.data.cleanupConfirmed === true,
	);
	const info = await lstat(filename);
	check(
		"saved state remains private and singly linked",
		(info.mode & 0o777) === 0o600 && info.nlink === 1,
	);
	return JSON.parse(await readFile(filename, "utf8"));
}

try {
	await mkdir(runtime, { mode: 0o700 });
	await mkdir(stateDirectory, { mode: 0o700 });
	const seed = join(stateDirectory, "seed.json");
	const saved = join(stateDirectory, "saved.json");
	await writeFile(seed, JSON.stringify(state), { mode: 0o600, flag: "wx" });
	check("fixture exceeds single response frame", stateBytes > 2_097_152);
	stage = "first-service";
	const first = await start();
	await command(["open"]);
	stage = "authentication";
	let rejected = false;
	try {
		await requestCommand(
			{
				...first.connection,
				token: `${first.connection.token[0] === "a" ? "b" : "a"}${first.connection.token.slice(1)}`,
			},
			{ argv: ["list"] },
			3000,
		);
	} catch (error) {
		rejected = (error as { code?: string }).code === "policy-denied";
	}
	check("wrong bearer token rejected", rejected);
	stage = "large-roundtrip";
	await command(["state-load", seed]);
	check(
		"large Unicode cookie/storage round trip",
		isDeepStrictEqual(await savedState(saved), state),
	);
	await command(["state-save", saved], "policy-denied");
	check(
		"no-clobber preserves destination",
		isDeepStrictEqual(JSON.parse(await readFile(saved, "utf8")), state),
	);
	await command(["state-save", saved, "--overwrite"]);
	check(
		"explicit overwrite preserves state",
		isDeepStrictEqual(JSON.parse(await readFile(saved, "utf8")), state),
	);
	stage = "atomic-failure";
	const invalid = join(stateDirectory, "invalid.json");
	await writeFile(
		invalid,
		JSON.stringify({
			schemaVersion: 1,
			cookies: [],
			origins: [{ origin: "invalid", localStorage: [] }],
		}),
		{ mode: 0o600, flag: "wx" },
	);
	await command(["state-load", invalid], "invalid-input");
	check(
		"invalid storage leaves cookies and storage unchanged",
		isDeepStrictEqual(
			await savedState(join(stateDirectory, "after-failure.json")),
			state,
		),
	);
	stage = "session-isolation";
	await command(["open"], undefined, "other-gate");
	const isolated = join(stateDirectory, "isolated.json");
	await command(["state-save", isolated], undefined, "other-gate");
	check(
		"named sessions isolate persisted owners",
		isDeepStrictEqual(JSON.parse(await readFile(isolated, "utf8")), {
			schemaVersion: 1,
			cookies: [],
			origins: [],
		}),
	);
	const transfer = await command(["state-export"]);
	await command(["close"]);
	await command(["open"]);
	await command(["state-transfer-read", transfer.data.id, "0"], "not-found");
	await stop(first.service);
	stage = "restart";
	const second = await start();
	check(
		"service restart rotates bearer token",
		second.connection.token !== first.connection.token,
	);
	await command(["open"]);
	check(
		"restarted service begins without persisted owners",
		isDeepStrictEqual(await savedState(join(stateDirectory, "empty.json")), {
			schemaVersion: 1,
			cookies: [],
			origins: [],
		}),
	);
	await command(["state-load", saved]);
	check(
		"state restores across foreground service restart",
		isDeepStrictEqual(
			await savedState(join(stateDirectory, "restarted.json")),
			state,
		),
	);
	await stop(second.service);
	check(
		"private file writes leave no temporary siblings",
		(await readdir(stateDirectory)).every((name) => name.endsWith(".json")),
	);
	passed = true;
} catch {
	process.exitCode = 1;
} finally {
	for (const owned of children) owned.child.kill("SIGKILL");
	await Promise.all([...children].map((owned) => owned.closed));
	try {
		await rm(directory, { recursive: true, force: true });
		cleanupConfirmed = true;
	} catch {
		process.exitCode = 1;
	}
	console.log(
		JSON.stringify(
			{
				schemaVersion: 1,
				startedAt,
				finishedAt: new Date().toISOString(),
				node: process.version,
				platform: process.platform,
				source: "working-tree",
				scope: {
					loopback: true,
					cliProcesses: true,
					foregroundServiceProcesses: true,
					safejs: false,
					externalSites: false,
					tty: false,
					websiteAuthenticationReuse: false,
				},
				limits: {
					childHeapMiB: 128,
					commandTimeoutMs: 20_000,
					serviceTimeoutMs: 60_000,
					childOutputBytes: 262_144,
				},
				passed: passed && cleanupConfirmed,
				failureStage: !cleanupConfirmed ? "cleanup" : passed ? null : stage,
				stateBytes,
				cleanupConfirmed,
				checks,
				operations,
			},
			null,
			2,
		),
	);
}
