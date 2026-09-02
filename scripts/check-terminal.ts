import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserCommandHost } from "../src/command-host.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { listenCommandServer } from "../src/node-command-server.js";
import { writeCommandConnection } from "../src/node-runtime.js";
import { NodeNetworkTransport } from "../src/node-transport.js";
import { BrowserSession } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const directory = await mkdtemp(join(tmpdir(), "agent-browser-terminal-"));
const binary = fileURLToPath(new URL("../src/cli.js", import.meta.url));
let origin = "";
const fixture = createServer((request, response) => {
	response.setHeader("content-type", "text/html; charset=utf-8");
	response.end(
		request.url === "/next"
			? "<!doctype html><title>Next</title><h1>Arrived through terminal link</h1>"
			: '<!doctype html><title>Terminal fixture</title><h1>Terminal fixture</h1><a href="/next">Next document</a><form action="/submitted"><label>Name <input name="name" value="Before"></label><label><input type="checkbox" name="enabled">Enabled</label><label>Choice <select name="choice"><option value="one">One</option><option value="two">Two</option></select></label><button>Submit</button></form>',
	);
});
const host = new BrowserCommandHost({
	createSession: () =>
		new BrowserSession({
			createTransport: (cookieJar) =>
				new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [origin] }),
			loadDocument: loadBrowserDocument,
		}),
});
let service: Awaited<ReturnType<typeof listenCommandServer>> | undefined;
let connection: Awaited<ReturnType<typeof writeCommandConnection>> | undefined;
let terminal: ReturnType<typeof attach> | undefined;

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error(label);
}

async function until(
	predicate: () => boolean | Promise<boolean>,
	description: string,
) {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Timed out: ${description}`);
}

function quote(value: string) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function attach(url?: string) {
	const argv = [
		process.execPath,
		binary,
		"-s=terminal-probe",
		"terminal",
		...(url ? [url] : []),
	];
	const child = spawn(
		"script",
		[
			"-qefc",
			`stty cols 100 rows 24; ${argv.map(quote).join(" ")}; result=$?; stty -a; exit "$result"`,
			"/dev/null",
		],
		{
			env: { ...process.env, AGENT_BROWSER_RUNTIME_DIR: directory },
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	let output = "";
	let failure = "";
	let status: number | null | undefined;
	child.stdout.on("data", (chunk) => {
		output = (output + chunk.toString()).slice(-2_097_152);
	});
	child.stderr.on("data", (chunk) => {
		failure = (failure + chunk.toString()).slice(-4096);
	});
	const done = new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code) => {
			status = code;
			resolve();
		});
	});
	return {
		keys: (value: string) => child.stdin.write(value),
		screen: () =>
			output
				.slice(output.lastIndexOf("\x1b[1;1H"))
				.split("\x1b")
				.map((part) => part.replace(/^\[[0-9;?]*[a-zA-Z]/, ""))
				.join("\n"),
		async close() {
			if (status === undefined) child.stdin.write("\x03");
			await done;
			check(
				"PTY command exits successfully and restores alternate-screen and canonical input",
				status === 0 &&
					output.includes("\x1b[?1049l") &&
					/(?:^|\s)icanon(?:\s|;)/.test(output) &&
					!failure,
			);
		},
	};
}

async function snapshot() {
	return (
		await host.execute(["snapshot", "--observe"], { session: "terminal-probe" })
	).data as SemanticSnapshot;
}

try {
	await new Promise<void>((resolve, reject) => {
		fixture.once("error", reject);
		fixture.listen(0, "127.0.0.1", resolve);
	});
	const address = fixture.address();
	if (!address || typeof address === "string")
		throw new Error("Fixture failed to bind");
	origin = `http://127.0.0.1:${address.port}`;
	service = await listenCommandServer(host);
	connection = await writeCommandConnection(
		{ schemaVersion: 1, origin: service.origin, token: service.token },
		directory,
	);
	terminal = attach(origin);
	await until(
		() => terminal?.screen().includes("Terminal fixture") ?? false,
		"initial terminal document",
	);
	check("Actual CLI enters a PTY and renders the parsed HTML document", true);
	terminal.keys("\t\r");
	await until(
		() => terminal?.screen().includes("Arrived through terminal link") ?? false,
		"native link navigation",
	);
	check("Tab and Enter perform a native link navigation", true);
	terminal.keys("b");
	await until(
		() => terminal?.screen().includes("Terminal fixture") ?? false,
		"back navigation",
	);
	check("History hotkey returns to the fixture", true);
	terminal.keys("\t\t\re\x15Terminal name\r");
	await until(
		async () =>
			(await snapshot()).entries.some(
				(entry) => entry.role === "textbox" && entry.value === "Terminal name",
			),
		"terminal field edit",
	);
	check("Terminal input updates the same live control seen by agents", true);
	await until(
		() => terminal?.screen().includes("fill completed") ?? false,
		"completed field refresh",
	);
	terminal.keys("\t\r");
	await until(
		async () =>
			(await snapshot()).entries.some(
				(entry) => entry.role === "checkbox" && entry.checked,
			),
		"checkbox action",
	);
	check("Terminal checkbox action changes live checked state", true);
	await until(
		() => terminal?.screen().includes("check completed") ?? false,
		"checkbox refresh",
	);
	terminal.keys("\t\r\x15two\r");
	await until(
		async () =>
			(await snapshot()).entries.some(
				(entry) => entry.role === "combobox" && entry.value === "two",
			),
		"select action",
	);
	check("Terminal select prompt updates the real selected option", true);
	await until(
		() => terminal?.screen().includes("select completed") ?? false,
		"select refresh",
	);
	const field = (await snapshot()).entries.find(
		(entry) => entry.role === "textbox",
	);
	if (!field) throw new Error("Missing fixture control");
	await host.execute(["snapshot"], { session: "terminal-probe" });
	await host.execute(["fill", field.ref, "Agent update"], {
		session: "terminal-probe",
	});
	await until(
		() => terminal?.screen().includes("Agent update") ?? false,
		"agent update observed in terminal",
	);
	const diff = (
		await host.execute(["snapshot", "--diff"], { session: "terminal-probe" })
	).data as { updated?: { value?: string }[] };
	check(
		"Observer refresh shows agent changes without consuming agent snapshot diffs",
		diff.updated?.some((entry) => entry.value === "Agent update") === true,
	);
	terminal.keys("\t\r");
	await until(async () => {
		const result = await host.execute(["tab-list"], {
			session: "terminal-probe",
		});
		return (result.data as { url: string }[]).some(
			(tab) =>
				tab.url.includes("/submitted?") &&
				tab.url.includes("name=Agent+update") &&
				tab.url.includes("choice=two"),
		);
	}, "GET form submission");
	check("Terminal submit button follows the real local GET form action", true);
	await terminal.close();
	terminal = undefined;
	check(
		"Detaching does not close the shared browser session",
		(await snapshot()).entries.length > 0,
	);
	for (const [url, marker] of [
		["https://example.com/", "Example Domain"],
		["https://books.toscrape.com/", "All products"],
	]) {
		terminal = attach();
		await until(
			() => terminal?.screen().includes("Terminal fixture") ?? false,
			"reattach existing document",
		);
		terminal.keys(`g\x1b[200~${url}\x1b[201~\r`);
		await until(
			() =>
				(terminal?.screen().includes(url) &&
					terminal.screen().includes("open completed")) ??
				false,
			`public terminal navigation ${url}`,
		);
		terminal.keys(`/${marker}\r`);
		await until(
			() => terminal?.screen().includes(marker) ?? false,
			`public terminal document ${url}`,
		);
		check(
			`${url}: URL prompt navigates and literal search reveals real public HTML in the PTY`,
			true,
		);
		await terminal.close();
		terminal = undefined;
		await host.execute(["open", origin], { session: "terminal-probe" });
	}
} catch (error) {
	checks.push({
		label: error instanceof Error ? error.message : "Terminal probe failed",
		passed: false,
	});
} finally {
	try {
		await terminal?.close();
	} finally {
		await service?.close();
		host.close();
		await connection?.remove();
		fixture.closeAllConnections();
		await new Promise<void>((resolve) => fixture.close(() => resolve()));
		await rm(directory, { recursive: true, force: true });
	}
}

console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			scope:
				"Actual CLI in util-linux script PTYs, shared native HTML session, fixture controls and read-only public navigation. No automatic website JavaScript or pixel-renderer compatibility is inferred. No new runtime dependencies.",
			checks,
		},
		null,
		2,
	),
);
if (checks.some((item) => !item.passed)) process.exitCode = 1;
