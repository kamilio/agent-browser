import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type {
	BrowserSessionProcess,
	SessionProcessOptions,
} from "./node-session-process.js";

const execute = promisify(execFile);
const roots: string[] = [];
type OwnedProcess = Pick<BrowserSessionProcess, keyof BrowserSessionProcess>;
const children: OwnedProcess[] = [];
let Process: { create(options: SessionProcessOptions): Promise<OwnedProcess> };

beforeAll(async () => {
	await execute(process.execPath, [
		fileURLToPath(
			new URL("../node_modules/typescript/bin/tsc", import.meta.url),
		),
		"-p",
		fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
		"--outDir",
		fileURLToPath(new URL("../dist", import.meta.url)),
	]);
	Process = (await import("../dist/src/node-session-process.js"))
		.BrowserSessionProcess;
});

afterEach(async () => {
	for (const child of children.splice(0)) await child.close();
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

async function fixture(
	body = "",
	options: Partial<SessionProcessOptions> = {},
) {
	const root = await mkdtemp(join(tmpdir(), "browser-session-process-"));
	roots.push(root);
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({
			name: "@poe-code/safe-js",
			version: "0.0.1-fixture",
			type: "module",
			exports: { "./core": { import: "./core.js" } },
		}),
	);
	await writeFile(
		join(root, "core.js"),
		`${body}\nexport class Budget {} export class SandboxError extends Error {} export function createHostObject() {} export function createRealm() {} export function startCallback() {} export function deepCopyFromSandbox(value) { return value; } export function retainGuestArguments(operation) { return operation; } export function releaseGuestReference() { return false; }`,
	);
	const child = await Process.create({ packageRoot: root, ...options });
	children.push(child);
	return child;
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

it("hosts the command API in a restricted owned process with no inherited environment", async () => {
	vi.stubEnv("BROWSER_PARENT_SECRET_FIXTURE", "synthetic-only");
	const child = await fixture(
		'if (process.env.BROWSER_PARENT_SECRET_FIXTURE || process.env.NODE_OPTIONS) throw new Error("inherited environment");',
	);
	const info = child.info();
	expect(info.pid).not.toBe(process.pid);
	expect(info.permissions).toMatchObject({
		enabled: true,
		filesystemWrite: false,
		childProcess: false,
		worker: false,
		stringCodeGenerationDisabled: true,
	});
	expect((await child.execute(["capabilities"])).data).toMatchObject({
		pageEvaluation: true,
		websiteJavaScript: false,
	});
	await child.close();
	expect(absent(info.pid)).toBe(true);
});

it("bounds a session actor to one name before routing a command", async () => {
	const child = await fixture("", { session: "owned" });
	expect((await child.execute(["capabilities"])).session).toBe("owned");
	await expect(
		child.execute(["-s=other", "capabilities"]),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(child.metrics().commands).toBe(1);
});

it("hard-kills a noncooperative native command without affecting a second actor", async () => {
	const healthy = await fixture();
	const child = await fixture(
		'process.stdin.on("data", chunk => { if (chunk.includes("command")) { while (true) {} } });',
		{ commandTimeoutMs: 80 },
	);
	await expect(child.execute(["capabilities"])).rejects.toMatchObject({
		code: "timeout",
	});
	expect(absent(child.info().pid)).toBe(true);
	expect((await healthy.execute(["capabilities"])).data).toMatchObject({
		pageEvaluation: true,
	});
});

it("detects idle event-loop starvation independently of pending commands", async () => {
	const child = await fixture("setTimeout(() => { while (true) {} }, 200);", {
		heartbeatTimeoutMs: 250,
	});
	await vi.waitFor(() => expect(child.metrics().closed).toBe(true), {
		timeout: 3000,
	});
	expect(absent(child.info().pid)).toBe(true);
	expect(child.metrics().failure).toBe("timeout");
});

it("cancels an active noncooperative actor and settles only after exit", async () => {
	const child = await fixture(
		'process.stdin.on("data", chunk => { if (chunk.includes("command")) { while (true) {} } });',
	);
	const controller = new AbortController();
	const pending = child.execute(["capabilities"], {
		signal: controller.signal,
	});
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(child.metrics().closed).toBe(true);
	expect(absent(child.info().pid)).toBe(true);
});

it("does not terminate an actor for a pre-aborted command", async () => {
	const child = await fixture();
	await expect(
		child.execute(["capabilities"], { signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(child.metrics().commands).toBe(0);
	expect((await child.execute(["capabilities"])).data).toBeDefined();
});

it("enforces a shorter CLI timeout outside noncooperative native code", async () => {
	const child = await fixture(
		'process.stdin.on("data", chunk => { if (chunk.includes("command")) { while (true) {} } });',
		{ commandTimeoutMs: 1000, heartbeatTimeoutMs: 10_000 },
	);
	const started = performance.now();
	await expect(
		child.execute(["capabilities", "--timeout=50"]),
	).rejects.toMatchObject({ code: "timeout" });
	expect(performance.now() - started).toBeLessThan(750);
	expect(absent(child.info().pid)).toBe(true);
});

it("rejects invalid CLI timeout bounds without killing the actor", async () => {
	const child = await fixture();
	await expect(
		child.execute(["capabilities", "--timeout=0"]),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(child.metrics().commands).toBe(0);
	expect((await child.execute(["capabilities"])).data).toBeDefined();
});

it("rejects unsolicited protocol output and waits for termination", async () => {
	const child = await fixture(
		'process.stdin.on("data", chunk => { if (chunk.includes("command")) process.stdout.write(JSON.stringify({schemaVersion:1,type:"result",id:999,result:{}})+"\\n"); });',
	);
	await expect(child.execute(["capabilities"])).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(absent(child.info().pid)).toBe(true);
});

it("rejects unsafe roots, session names and process bounds", async () => {
	await expect(Process.create({ packageRoot: "/" })).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(Process.create({ packageRoot: "/tmp/*" })).rejects.toMatchObject(
		{ code: "invalid-input" },
	);
	await expect(fixture("", { session: "../wrong" })).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(fixture("", { heartbeatTimeoutMs: 0 })).rejects.toMatchObject({
		code: "invalid-input",
	});
});
