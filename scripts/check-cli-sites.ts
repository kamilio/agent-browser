import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { CommandResult } from "../src/command-host.js";
import { readCommandConnection } from "../src/node-runtime.js";
import type { SemanticSnapshot } from "../src/snapshot.js";

const execute = promisify(execFile);
const binary = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "agent-browser-cli-probe-"));
const environment = { AGENT_BROWSER_RUNTIME_DIR: directory };
const startedAt = new Date().toISOString();
const checks: Record<string, unknown>[] = [];
const service = spawn(process.execPath, [binary, "serve", "--json"], {
	env: environment,
	stdio: ["ignore", "pipe", "pipe"],
});
const exited = new Promise<number | null>((resolve) =>
	service.once("exit", resolve),
);
let startupOutput = "";
let startupError = false;
service.stderr.on("data", () => {
	startupError = true;
});

async function command(argv: string[]) {
	const result = await execute(process.execPath, [binary, ...argv, "--json"], {
		env: environment,
		encoding: "utf8",
		timeout: 35_000,
		maxBuffer: 1_048_576,
	});
	return JSON.parse(result.stdout) as CommandResult;
}

function check(
	label: string,
	passed: boolean,
	details: Record<string, unknown> = {},
) {
	checks.push({ label, passed, ...details });
}

try {
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("startup-timeout")),
			10_000,
		);
		service.once("error", () => {
			clearTimeout(timer);
			reject(new Error("startup-error"));
		});
		service.once("exit", () => {
			clearTimeout(timer);
			if (!startupOutput.includes("connectionFile"))
				reject(new Error("startup-exit"));
		});
		service.stdout.on("data", (chunk: Buffer) => {
			startupOutput += chunk.toString();
			if (startupOutput.length > 16_384) {
				clearTimeout(timer);
				reject(new Error("startup-output-limit"));
				return;
			}
			try {
				if (JSON.parse(startupOutput).connectionFile) {
					clearTimeout(timer);
					resolve();
				}
			} catch {}
		});
	});
	const connection = await readCommandConnection(directory);
	check(
		"foreground service starts without printing its auth token",
		!startupError && !startupOutput.includes(connection.token),
	);
	const open = await command(["-s=main", "open", "https://httpbingo.org/json"]);
	check(
		"open public JSON through CLI",
		(open.data as { navigation?: { kind?: string } }).navigation?.kind ===
			"document",
	);
	const first = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"snapshot sees real JSON document",
		first.entries.some((entry) => entry.name.includes("slideshow")),
		{
			entries: first.entries.length,
			snapshotBytes: Buffer.byteLength(JSON.stringify(first)),
		},
	);
	await command([
		"-s=main",
		"localstorage-set",
		"probe",
		"synthetic-cli-value",
	]);
	check(
		"separate CLI invocation preserves local storage",
		(
			(await command(["-s=main", "localstorage-get", "probe"])).data as {
				value: unknown;
			}
		).value === "synthetic-cli-value",
	);
	await command(["-s=isolated", "open", "https://httpbingo.org/json"]);
	check(
		"named sessions isolate local storage",
		(
			(await command(["-s=isolated", "localstorage-get", "probe"])).data as {
				value: unknown;
			}
		).value === null,
	);
	await command([
		"-s=main",
		"goto",
		"https://www.rfc-editor.org/rfc/rfc9110.txt",
	]);
	const rfc = (await command(["-s=main", "snapshot"])).data as SemanticSnapshot;
	check(
		"goto public text replaces the document",
		rfc.document !== first.document &&
			rfc.entries.some((entry) => entry.name.includes("HTTP Semantics")),
	);
	let formatRejected = false;
	try {
		await command(["-s=main", "goto", "https://httpbingo.org/xml"]);
	} catch (error) {
		try {
			formatRejected =
				JSON.parse((error as { stderr: string }).stderr).error?.code ===
				"unsupported";
		} catch {}
	}
	const afterUnsupported = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"unsupported XML fails without replacing the current document",
		formatRejected && afterUnsupported.document === rfc.document,
	);
	const reload = await command(["-s=main", "reload"]);
	check(
		"reload invalidates previous document references",
		(reload.data as { documentRef: string }).documentRef !== rfc.document,
	);
	const back = await command(["-s=main", "go-back"]);
	const restored = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"CLI back reloads the prior real JSON document without appending history",
		(back.data as { history: { index: number; length: number } }).history
			.index === 0 &&
			(back.data as { history: { length: number } }).history.length === 2 &&
			restored.entries.some((entry) => entry.name.includes("WonderWidgets")),
	);
	const forward = await command(["-s=main", "go-forward"]);
	const forwardSnapshot = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"CLI forward reloads real RFC text with fresh references",
		(forward.data as { history: { index: number } }).history.index === 1 &&
			forwardSnapshot.document !== rfc.document &&
			forwardSnapshot.entries.some((entry) =>
				entry.name.includes("HTTP Semantics"),
			),
	);
	await command(["-s=main", "goto", "https://example.com/"]);
	const example = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"real HTML produces semantic headings and links with explicit partial/JS-disabled metadata",
		example.html?.partial === true &&
			example.html.scripting === false &&
			example.entries.some(
				(entry) => entry.role === "heading" && entry.name === "Example Domain",
			) &&
			example.entries.some(
				(entry) => entry.role === "link" && entry.href?.startsWith("https://"),
			),
	);
	await command(["-s=main", "goto", "https://news.ycombinator.com/"]);
	const news = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"real table-based news HTML exposes parsed link references without running its script",
		news.html?.scripting === false &&
			news.entries.filter((entry) => entry.role === "link").length > 20,
		{
			entries: news.entries.length,
			truncated: news.truncated,
			issues: news.html?.issues,
		},
	);
	await command(["-s=main", "goto", "https://books.toscrape.com/"]);
	const books = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	const css = (await command(["-s=main", "styles"])).data as {
		externalSheets?: number;
		partial?: boolean;
		layout?: boolean;
	};
	check(
		"public catalog loads external stylesheets with explicit partial/no-layout diagnostics",
		(css.externalSheets ?? 0) > 0 &&
			css.partial === true &&
			css.layout === false,
		{ css },
	);
	const thumbnail = (
		await command([
			"-s=main",
			"styles",
			"ol.row > li:first-child img.thumbnail",
		])
	).data as { display?: string; visible?: boolean };
	check(
		"actual public stylesheet makes the first product thumbnail block-level",
		thumbnail.display === "block" && thumbnail.visible === true,
		{ style: thumbnail },
	);
	const product = books.entries.find(
		(entry) =>
			entry.role === "link" &&
			/catalogue\/[^/]+_\d+\/index\.html$/.test(entry.href ?? ""),
	);
	if (!product) throw new Error("Missing parsed product link");
	const productNavigation = (await command(["-s=main", "click", product.ref]))
		.data as { navigation?: { url?: string } };
	const book = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"CLI clicks a real book link by parsed ref and reads the product HTML",
		productNavigation.navigation?.url === product.href &&
			book.document !== books.document &&
			book.html?.partial === true &&
			book.entries.some((entry) => entry.role === "heading"),
		{
			listingEntries: books.entries.length,
			productEntries: book.entries.length,
		},
	);
	await command(["-s=main", "go-back"]);
	const restoredBooks = (await command(["-s=main", "snapshot"]))
		.data as SemanticSnapshot;
	check(
		"HTML back traversal reloads the listing with fresh references",
		restoredBooks.document !== books.document &&
			restoredBooks.entries.some((entry) => entry.href === product.href),
	);
	await command(["close-all"]);
	const listed = (await command(["list"])).data;
	check(
		"close-all removes only the service's named sessions",
		Array.isArray(listed) && listed.length === 0,
	);
	await command(["stop-server"]);
	check("stop-server exits cleanly", (await exited) === 0);
	let removed = false;
	try {
		await stat(join(directory, "connection.json"));
	} catch (error) {
		removed = (error as NodeJS.ErrnoException).code === "ENOENT";
	}
	check("private connection file is removed on shutdown", removed);
} catch {
	check("CLI verification pipeline completed", false, {
		error:
			"A CLI operation or assertion setup failed; no credentials or raw output retained",
	});
} finally {
	if (service.exitCode === null && service.signalCode === null) {
		service.kill("SIGTERM");
		const force = setTimeout(() => service.kill("SIGKILL"), 5000);
		await exited;
		clearTimeout(force);
	}
	await rm(directory, { recursive: true, force: true });
}

const allPassed =
	checks.length === 19 && checks.every((result) => result.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "real-cli-html-css-subsets-text-json-navigation",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			checks,
			allPassed,
			limitations: [
				"A package-owned foreground service and separate CLI processes are exercised, not a Chromium/Firefox engine.",
				"Public JSON/plain text and a bounded HTML parser are exercised. HTML semantics are partial; website JavaScript is disabled.",
				"The visibility cascade loads public stylesheets and checks a computed display value; no full CSS layout, image rendering, script or screenshot equivalence is claimed.",
				"Parsed HTML link traversal and text/JSON history are exercised. No website JavaScript, BFCache, full history lifecycle, artifact rendering, automatic launch or playground UI is exercised by this CLI probe.",
				"Only synthetic local in-memory storage is mutated; authentication tokens, page bodies and process output are not retained.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
