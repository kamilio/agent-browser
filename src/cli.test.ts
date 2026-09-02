import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { listenCommandServer } from "./node-command-server.js";
import {
	readCommandConnection,
	writeCommandConnection,
} from "./node-runtime.js";
import { NodeNetworkTransport } from "./node-transport.js";
import { BrowserSession } from "./session.js";
import { loadTextDocument } from "./text-loader.js";

const execute = promisify(execFile);
const binary = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
const directories: string[] = [];
const children = new Set<ChildProcess>();
const servers: Awaited<ReturnType<typeof listenCommandServer>>[] = [];
let site = "";
const website = createServer((_request, response) => {
	response.setHeader("content-type", "text/plain");
	response.end("CLI local document fixture");
});

async function directory() {
	const root = await mkdtemp(join(tmpdir(), "agent-browser-cli-test-"));
	directories.push(root);
	return root;
}
function cli(root: string, argv: string[]) {
	return execute(process.execPath, [binary, ...argv], {
		env: { AGENT_BROWSER_RUNTIME_DIR: root },
		encoding: "utf8",
		timeout: 10_000,
		maxBuffer: 1_048_576,
	});
}

beforeAll(async () => {
	await execute(process.execPath, [
		fileURLToPath(
			new URL("../../../node_modules/typescript/bin/tsc", import.meta.url),
		),
		"-p",
		fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
		"--outDir",
		fileURLToPath(new URL("../dist", import.meta.url)),
	]);
	await new Promise<void>((resolve) => website.listen(0, "127.0.0.1", resolve));
	const address = website.address();
	if (!address || typeof address === "string")
		throw new Error("Missing CLI fixture address");
	site = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
	for (const server of servers.splice(0)) await server.close();
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) {
			const exited = new Promise<void>((resolve) =>
				child.once("exit", () => resolve()),
			);
			child.kill("SIGTERM");
			await exited;
		}
	}
	children.clear();
	for (const root of directories.splice(0))
		await rm(root, { recursive: true, force: true });
});
afterAll(async () => {
	website.closeAllConnections();
	await new Promise<void>((resolve) => website.close(() => resolve()));
});

it("supports help and version without a service or exposing host execution", async () => {
	const root = await directory();
	expect(JSON.parse((await cli(root, ["--version"])).stdout)).toMatchObject({
		data: { version: "0.1.0" },
	});
	expect(JSON.parse((await cli(root, ["capabilities"])).stdout)).toMatchObject({
		data: {
			websiteJavaScript: false,
			fullPlaywrightCliSuperset: false,
			documentFormats: expect.arrayContaining([
				"text/html",
				"text/plain",
				"application/json",
			]),
		},
	});
	await expect(
		cli(root, ["open", "https://example.com"]),
	).rejects.toMatchObject({ code: 1 });
});

it("uses the actual CLI across separate invocations for named sessions, navigation, snapshots and storage", async () => {
	const root = await directory();
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: (cookieJar) =>
					new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [site] }),
				loadDocument: loadTextDocument,
			}),
	});
	const server = await listenCommandServer(host);
	servers.push(server);
	const owned = await writeCommandConnection(
		{ schemaVersion: 1, origin: server.origin, token: server.token },
		root,
	);
	await cli(root, ["-s=work", "open", site, "--json"]);
	const snapshot = await cli(root, ["-s=work", "snapshot"]);
	expect(snapshot.stdout).toContain("CLI local document fixture");
	expect(snapshot.stdout).toContain("[ref=e");
	const html = JSON.parse((await cli(root, ["-s=work", "html"])).stdout);
	expect(html.data).toMatchObject({
		partial: true,
		html: expect.stringContaining("CLI local document fixture"),
	});
	await expect(
		cli(root, ["-s=work", "html", "--max-code-units=2"]),
	).rejects.toMatchObject({ code: 1 });
	await cli(root, ["-s=work", "localstorage-set", "key", "value"]);
	expect(
		JSON.parse(
			(await cli(root, ["-s=work", "localstorage-get", "key", "--json"]))
				.stdout,
		),
	).toMatchObject({ data: { value: "value" } });
	await cli(root, ["-s=other", "open", site]);
	expect(
		JSON.parse(
			(await cli(root, ["-s=other", "localstorage-get", "key"])).stdout,
		),
	).toMatchObject({ data: { value: null } });
	await expect(
		cli(root, ["-s=work", "eval", "process.env"]),
	).rejects.toMatchObject({ code: 1 });
	await cli(root, ["close-all"]);
	expect(host.metrics().sessions).toBe(0);
	await owned.remove();
});

it("preserves focused editing across CLI processes and executes fill --submit", async () => {
	const root = await directory();
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: (cookieJar) =>
					new NodeNetworkTransport({ cookieJar, allowPrivateOrigins: [site] }),
				loadDocument: (response, context) => {
					const tree = loadTextDocument(response, context);
					const form = tree.createElement("form", { action: "/result" });
					const field = tree.createElement("input", {
						id: "field",
						name: "query",
						"aria-label": "Query",
					});
					tree.append(tree.root, form);
					tree.append(form, field);
					tree.append(form, tree.createElement("button"));
					return tree;
				},
			}),
	});
	const server = await listenCommandServer(host);
	servers.push(server);
	const owned = await writeCommandConnection(
		{ schemaVersion: 1, origin: server.origin, token: server.token },
		root,
	);
	await cli(root, ["-s=keys", "open", site]);
	await cli(root, ["-s=keys", "click", "#field"]);
	await cli(root, ["-s=keys", "type", "typed"]);
	await cli(root, ["-s=keys", "press", "Shift+ArrowLeft"]);
	await cli(root, ["-s=keys", "type", "X"]);
	const snapshot = JSON.parse(
		(await cli(root, ["-s=keys", "snapshot", "--json"])).stdout,
	);
	expect(snapshot.data.entries).toContainEqual(
		expect.objectContaining({ value: "typeX", focused: true }),
	);
	const submitted = JSON.parse(
		(await cli(root, ["-s=keys", "press", "Enter"])).stdout,
	);
	expect(submitted.data.navigation).toMatchObject({
		kind: "document",
		url: `${site}/result?query=typeX`,
	});
	const filled = JSON.parse(
		(await cli(root, ["-s=keys", "fill", "#field", "filled", "--submit"]))
			.stdout,
	);
	expect(filled.data.navigation).toMatchObject({
		kind: "document",
		url: `${site}/result?query=filled`,
	});
	await cli(root, ["close-all"]);
	await owned.remove();
});

it("runs and stops only its own foreground service without printing its auth token", async () => {
	const root = await directory();
	const child = spawn(process.execPath, [binary, "serve", "--json"], {
		env: { AGENT_BROWSER_RUNTIME_DIR: root },
		stdio: ["ignore", "pipe", "pipe"],
	});
	children.add(child);
	let output = "";
	const ready = new Promise<string>((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => {
			if (!output.includes("connectionFile"))
				reject(new Error(`Service exited before ready: ${code}`));
		});
		child.stdout?.on("data", (chunk: Buffer) => {
			output += chunk.toString();
			try {
				const metadata = JSON.parse(output);
				if (metadata.connectionFile) resolve(output);
			} catch {}
		});
	});
	await ready;
	const connection = await readCommandConnection(root);
	expect(output).not.toContain(connection.token);
	const page = await fetch(connection.origin);
	expect(await page.text()).toContain("Agent Browser");
	const script = await fetch(`${connection.origin}/playground.js`);
	expect(await script.text()).toContain("startPlayground");
	const info = (await cli(root, ["playground"])).stdout;
	expect(info).not.toContain(connection.token);
	expect(JSON.parse(info)).toMatchObject({ url: connection.origin });
	const start = await fetch(`${connection.origin}/api/pair/start`, {
		method: "POST",
		headers: { origin: connection.origin, "content-type": "application/json" },
		body: "{}",
	});
	const { pair } = (await start.json()) as { pair: { code: string } };
	const approval = (await cli(root, ["playground", `--pair=${pair.code}`]))
		.stdout;
	expect(JSON.parse(approval)).toEqual({
		approved: true,
		url: connection.origin,
	});
	expect(approval).not.toContain(connection.token);
	await cli(root, ["open"]);
	const exited = new Promise<number | null>((resolve) =>
		child.once("exit", resolve),
	);
	expect(JSON.parse((await cli(root, ["stop-server"])).stdout)).toEqual({
		closed: true,
	});
	expect(await exited).toBe(0);
	await expect(stat(join(root, "connection.json"))).rejects.toMatchObject({
		code: "ENOENT",
	});
});

it.each([undefined, "classic"])(
	"reports process mode %s and reaps its owned actor on shutdown",
	async (websiteScripts) => {
		const root = await directory();
		const sdk = await directory();
		await writeFile(
			join(sdk, "package.json"),
			JSON.stringify({
				name: "@poe-code/safe-js",
				version: "0.0.1-fixture",
				type: "module",
				exports: { "./core": { import: "./core.js" } },
			}),
		);
		await writeFile(
			join(sdk, "core.js"),
			"export class Budget {} export class SandboxError extends Error {} export function createRealm() {} export function createHostObject() {} export function startCallback() {} export function deepCopyFromSandbox() {} export function retainGuestArguments(operation) { return operation; } export function releaseGuestReference() { return false; }",
		);
		const child = spawn(process.execPath, [binary, "serve", "--json"], {
			env: {
				AGENT_BROWSER_RUNTIME_DIR: root,
				AGENT_BROWSER_SAFEJS_ROOT: sdk,
				AGENT_BROWSER_PAGE_SCRIPTS: websiteScripts,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		children.add(child);
		let output = "";
		await new Promise<void>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", () => {
				if (!output.includes("connectionFile"))
					reject(new Error("Service did not start"));
			});
			child.stdout?.on("data", (chunk: Buffer) => {
				output += chunk.toString();
				if (output.includes("connectionFile")) resolve();
			});
		});
		expect(
			JSON.parse((await cli(root, ["capabilities"])).stdout).data,
		).toMatchObject({
			sessionExecution: "owned-node-process",
			pageEvaluation: true,
			websiteJavaScript: websiteScripts === "classic",
		});
		expect(
			JSON.parse((await cli(root, ["help", "eval"])).stdout).data.commands[0],
		).toMatchObject({ status: "partial" });
		await cli(root, ["-s=owned", "open"]);
		const listing = JSON.parse((await cli(root, ["list"])).stdout).data;
		expect(listing).toHaveLength(1);
		const pid = listing[0].process.pid as number;
		expect(pid).not.toBe(child.pid);
		expect(() => process.kill(pid, 0)).not.toThrow();
		const exited = new Promise<number | null>((resolve) =>
			child.once("exit", resolve),
		);
		await cli(root, ["stop-server"]);
		expect(await exited).toBe(0);
		expect(() => process.kill(pid, 0)).toThrow();
	},
);
