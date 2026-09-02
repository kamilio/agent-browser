import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { CommandResult } from "../src/command-host.js";
import { AgentBrowserError } from "../src/errors.js";
import { readCommandConnection } from "../src/node-runtime.js";
import type { ScriptEvaluation } from "../src/safejs.js";

const startedAt = new Date().toISOString();
const execute = promisify(execFile);
const binary = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "agent-browser-process-cli-"));
const environment = { AGENT_BROWSER_RUNTIME_DIR: directory };
const checks: { label: string; passed: boolean; error?: string }[] = [];
const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
const pids: number[] = [];
let service: ReturnType<typeof spawn> | undefined;
let exited: Promise<void> | undefined;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Probe assertion failed");
}
function absent(pid: number) {
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		return (
			!!error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}
async function command(argv: string[]): Promise<CommandResult> {
	try {
		const output = await execute(
			process.execPath,
			[binary, ...argv, "--json"],
			{
				env: environment,
				encoding: "utf8",
				timeout: 35_000,
				maxBuffer: 2_097_152,
			},
		);
		return JSON.parse(output.stdout);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"stderr" in error &&
			typeof error.stderr === "string"
		) {
			let failure: { error?: { code?: string } } = {};
			try {
				failure = JSON.parse(error.stderr);
			} catch {}
			if (failure.error?.code === "timeout")
				throw new AgentBrowserError("timeout", "CLI command timed out");
		}
		throw new AgentBrowserError("network-error", "CLI probe command failed");
	}
}
async function evaluate(session: string, source: string) {
	const result = (await command([`-s=${session}`, "eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok)
		throw new AgentBrowserError("unsupported", "Guest evaluation failed");
	return result.value;
}

try {
	if (!packageRoot)
		throw new AgentBrowserError(
			"invalid-input",
			"Select the compiled extended SafeJS package explicitly",
		);
	service = spawn(process.execPath, [binary, "serve", "--json"], {
		env: { ...environment, AGENT_BROWSER_SAFEJS_ROOT: packageRoot },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const owned = service;
	exited = new Promise<void>((resolve) => owned.once("close", () => resolve()));
	let stderrBytes = 0;
	owned.stderr?.on("data", (chunk: Buffer) => {
		stderrBytes += chunk.length;
	});
	await new Promise<void>((resolve, reject) => {
		let output = "";
		const timer = setTimeout(
			() => reject(new Error("Service startup timeout")),
			10_000,
		);
		owned.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		owned.once("exit", () => {
			clearTimeout(timer);
			if (!output.includes("connectionFile"))
				reject(new Error("Service startup failed"));
		});
		owned.stdout?.on("data", (chunk: Buffer) => {
			output += chunk.toString();
			if (output.length > 16_384) {
				clearTimeout(timer);
				reject(new Error("Service output limit"));
				return;
			}
			if (output.includes("connectionFile")) {
				clearTimeout(timer);
				resolve();
			}
		});
	});
	const capability = (await command(["capabilities"])).data as {
		sessionExecution: string;
		pageEvaluation: boolean;
		websiteJavaScript: boolean;
	};
	check(
		"CLI without runtime-selection environment reads actual service capabilities",
		capability.sessionExecution === "owned-node-process" &&
			capability.pageEvaluation &&
			!capability.websiteJavaScript,
	);
	for (const [session, url] of [
		["first", "https://example.com/"],
		["second", "https://books.toscrape.com/"],
	]) {
		await command([`-s=${session}`, "open", url]);
		await evaluate(
			session,
			'let count = 1; let anchor = document.querySelector("a"); anchor.id = "process-cli-link"; let clicked = 0; anchor.addEventListener("click", function(event) { clicked++; event.preventDefault(); });',
		);
		check(
			`${url}: lexical state survives separate CLI invocations`,
			(await evaluate(session, "++count")) === 2 &&
				(await evaluate(session, "++count")) === 3,
		);
		await command([`-s=${session}`, "click", "#process-cli-link"]);
		check(
			`${url}: native CLI click dispatches guest callback and cancels navigation`,
			(await evaluate(
				session,
				`clicked === 1 && document.URL === ${JSON.stringify(url)}`,
			)) === true,
		);
		await evaluate(
			session,
			'document.querySelector("h1").textContent = "Process CLI shared document"',
		);
		check(
			`${url}: native snapshot sees guest DOM changes`,
			(
				(await command([`-s=${session}`, "text"])).data as { text: string }
			).text.includes("Process CLI shared document"),
		);
		check(
			`${url}: actual CLI HTML extraction reads the changed live tree`,
			(
				(await command([`-s=${session}`, "html", "h1"])).data as {
					html: string;
				}
			).html.includes("Process CLI shared document"),
		);
		await evaluate(
			session,
			'console.log("CLI diagnostic"); console.warn("CLI warning")',
		);
		check(
			`${url}: actual CLI console reads page-owned severity-filtered messages`,
			(
				(await command([`-s=${session}`, "console", "warning"])).data as {
					entries: { text: string }[];
				}
			).entries.some((entry) => entry.text === "CLI warning"),
		);
		await evaluate(
			session,
			'let timerArgument = { value: "observed" }; let timerIdentity = false; await new Promise(resolve => { setTimeout(function(value) { timerIdentity = value === timerArgument; document.querySelector("h1").setAttribute("data-timer", value.value); resolve(); }, 5, timerArgument); });',
		);
		check(
			`${url}: separate CLI commands await a real timer and inspect its live DOM mutation`,
			(await evaluate(session, "timerIdentity")) === true &&
				(
					(await command([`-s=${session}`, "html", "h1"])).data as {
						html: string;
					}
				).html.includes('data-timer="observed"'),
		);
	}
	const listing = (await command(["list"])).data as {
		name: string;
		process: { pid: number };
	}[];
	pids.push(...listing.map((entry) => entry.process.pid));
	check(
		"Named sessions have separate owned process identities",
		listing.length === 2 &&
			new Set(pids).size === 2 &&
			pids.every((pid) => pid !== owned.pid && pid !== process.pid),
	);
	check(
		"Guest lexical globals stay isolated across sessions",
		(await evaluate("first", "let onlyFirst = true;")) === undefined &&
			(await evaluate("second", 'typeof onlyFirst === "undefined"')) === true,
	);
	const connection = await readCommandConnection(directory);
	const headers = {
		origin: connection.origin,
		"content-type": "application/json",
	};
	const start = await fetch(`${connection.origin}/api/pair/start`, {
		method: "POST",
		headers,
		body: "{}",
	});
	const pairing = (await start.json()) as {
		pair: { code: string; id: string };
	};
	await command(["playground", `--pair=${pairing.pair.code}`]);
	const poll = await fetch(`${connection.origin}/api/pair/poll`, {
		method: "POST",
		headers,
		body: JSON.stringify({ id: pairing.pair.id }),
	});
	const credentials = (await poll.json()) as { token: string };
	const response = await fetch(`${connection.origin}/api/command`, {
		method: "POST",
		headers: { ...headers, authorization: `Bearer ${credentials.token}` },
		body: JSON.stringify({
			argv: [
				"eval",
				'document.querySelector("h1").textContent = "Paired client shares the realm"',
			],
			session: "first",
		}),
	});
	const result = (await response.json()) as {
		result: { data: ScriptEvaluation };
	};
	check(
		"Paired playground API evaluates inside the existing CLI page realm",
		result.result.data.ok &&
			result.result.data.value === "Paired client shares the realm",
	);
	check(
		"Separate CLI reads the paired client's live DOM mutation",
		(
			(await command(["-s=first", "text"])).data as { text: string }
		).text.includes("Paired client shares the realm"),
	);
	let timedOut = false;
	try {
		await command(["-s=first", "eval", "while (true) {}", "--timeout=50"]);
	} catch (error) {
		timedOut = error instanceof AgentBrowserError && error.code === "timeout";
	}
	const firstPid = listing.find((entry) => entry.name === "first")?.process.pid;
	check(
		"CLI timeout returns only after the runaway guest process exits",
		timedOut && firstPid !== undefined && absent(firstPid),
	);
	check(
		"Other session remains live after one guest process fails",
		(await evaluate("second", "count")) === 3,
	);
	check(
		"Failed actor is removed without automatic restart",
		((await command(["list"])).data as { name: string }[])
			.map((entry) => entry.name)
			.join() === "second",
	);
	await command(["close-all"]);
	check("close-all waits for all owned process exits", pids.every(absent));
	await command(["stop-server"]);
	await exited;
	check(
		"Owned foreground service exits cleanly",
		owned.exitCode === 0 && stderrBytes === 0,
	);
} catch (error) {
	checks.push({
		label: "Process-backed CLI real-site probe",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
	if (process.argv.includes("--trace"))
		console.error(
			error instanceof AgentBrowserError ? error.code : "Probe failed",
		);
} finally {
	if (service && service.exitCode === null && service.signalCode === null) {
		const owned = service;
		owned.kill("SIGTERM");
		const timer = setTimeout(() => owned.kill("SIGKILL"), 5000);
		await exited;
		clearTimeout(timer);
	}
	await rm(directory, { recursive: true, force: true });
}
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Actual separate CLI invocations, owned session processes and the paired playground API share real parsed public pages and explicit extended-SafeJS evaluations. Public requests are read-only GETs; canceled links make no remote mutations. Website-authored scripts are not automatically loaded. This is not a visual playground UI test. Credentials, raw responses and script results are not retained.",
			checks,
			parentRssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
