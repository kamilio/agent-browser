import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type {
	SafeJsProcess,
	ScriptProcessOptions,
} from "./node-script-process.js";

const execute = promisify(execFile);
const directories: string[] = [];
const children: SafeJsProcess[] = [];
let Process: typeof import("./node-script-process.js").SafeJsProcess;

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
	Process = (
		await import(
			new URL("../dist/src/node-script-process.js", import.meta.url).href
		)
	).SafeJsProcess;
});
afterEach(async () => {
	for (const child of children.splice(0)) await child.close();
	for (const root of directories.splice(0))
		await rm(root, { recursive: true, force: true });
	vi.unstubAllEnvs();
});
async function directory() {
	const root = await mkdtemp(join(tmpdir(), "browser-script-process-"));
	directories.push(root);
	return root;
}
async function fixture(
	body = "return {ok:true,returnValue:23};",
	options: Partial<ScriptProcessOptions> = {},
	imports = "",
) {
	const root = await directory();
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({
			name: "poe-code",
			version: "13.0.10-fixture",
			type: "module",
			exports: { "./safe-js": { import: "./sdk.js" } },
		}),
	);
	await writeFile(
		join(root, "sdk.js"),
		`${imports}\nexport class Budget { stepsUsed=1; peakCallDepth=0; peakDataSize=1; } export class SandboxError extends Error {} export function deepCopyFromSandbox(value) { return value; } export async function run() { ${body} }`,
	);
	const child = await Process.create({ packageRoot: root, ...options });
	children.push(child);
	return { child, root };
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

it("starts an owned child and awaits its confirmed exit", async () => {
	const { child } = await fixture();
	expect(child.info()).toMatchObject({
		permissions: {
			enabled: true,
			filesystemWrite: false,
			childProcess: false,
			worker: false,
			addons: false,
			wasi: false,
			stringCodeGenerationDisabled: true,
		},
	});
	expect(await child.evaluate("fixture")).toMatchObject({
		ok: true,
		value: 23,
	});
	const pid = child.info().pid;
	await child.close();
	expect(absent(pid)).toBe(true);
	expect(child.metrics()).toMatchObject({
		closed: true,
		active: false,
		runs: 1,
	});
	await expect(child.evaluate("after close")).rejects.toMatchObject({
		code: "closed",
	});
});

it("proves native filesystem, subprocess and code-generation denials in the child fixture", async () => {
	const forbidden = await directory();
	const secret = join(forbidden, "synthetic.txt");
	const output = join(forbidden, "must-not-exist.txt");
	await writeFile(secret, "synthetic fixture only");
	vi.stubEnv("AGENT_BROWSER_PARENT_ENV_PROBE", "synthetic");
	const { child } = await fixture(
		`const attempt=(action)=>{try{action();return "allowed";}catch(error){return error.code??error.name;}};return {ok:true,returnValue:{read:attempt(()=>readFileSync(${JSON.stringify(secret)})),write:attempt(()=>writeFileSync(${JSON.stringify(output)},"not allowed")),spawn:attempt(()=>spawnSync(process.execPath,["--version"])),code:attempt(()=>Function("return 1")()),env:Object.keys(process.env)}};`,
		{},
		'import {readFileSync,writeFileSync} from "node:fs"; import {spawnSync} from "node:child_process";',
	);
	expect((await child.evaluate("native capability fixture")).value).toEqual({
		read: "ERR_ACCESS_DENIED",
		write: "ERR_ACCESS_DENIED",
		spawn: "ERR_ACCESS_DENIED",
		code: "EvalError",
		env: [],
	});
	expect(await readFile(secret, "utf8")).toBe("synthetic fixture only");
	await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("hard-kills a noncooperative interpreter without killing another owned child", async () => {
	const { child: healthy } = await fixture();
	const { child } = await fixture("while(true) {}", { hardTimeoutMs: 50 });
	const pid = child.info().pid;
	await expect(
		child.evaluate("uncooperative native SDK fixture"),
	).rejects.toMatchObject({ code: "timeout" });
	expect(absent(pid)).toBe(true);
	expect(child.metrics().closed).toBe(true);
	expect((await healthy.evaluate("still healthy")).value).toBe(23);
});

it("cancels a pending evaluation and waits for child exit", async () => {
	const { child } = await fixture("await new Promise(()=>{});");
	const controller = new AbortController();
	const pending = child.evaluate("pending", { signal: controller.signal });
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	controller.abort();
	await rejected;
	expect(absent(child.info().pid)).toBe(true);
});

it("rejects overlap, then closes a pending run and clears its timer", async () => {
	const { child } = await fixture("await new Promise(()=>{});");
	const pending = child.evaluate("pending");
	const rejected = expect(pending).rejects.toMatchObject({ code: "closed" });
	await expect(child.evaluate("overlap")).rejects.toMatchObject({
		code: "invalid-input",
	});
	await child.close();
	await rejected;
	expect(child.metrics()).toMatchObject({
		closed: true,
		active: false,
		terminating: false,
	});
});

it("enforces source and run bounds before sending another request", async () => {
	const { child } = await fixture(undefined, {
		limits: { maxSourceCodeUnits: 1, maxRuns: 1 },
	});
	await expect(child.evaluate("too long")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(child.metrics().runs).toBe(0);
	await child.evaluate("1");
	await expect(child.evaluate("2")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(child.metrics().runs).toBe(1);
});

it("kills a child emitting a mismatched protocol response", async () => {
	const { child } = await fixture(
		'process.stdout.write(JSON.stringify({schemaVersion:1,type:"result",id:999,result:{}})+"\\n"); await new Promise(()=>{});',
	);
	await expect(child.evaluate("protocol fixture")).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(child.metrics().closed).toBe(true);
});

it("kills excessive stdout and stderr without retaining their contents", async () => {
	for (const stream of ["stdout", "stderr"]) {
		const { child } = await fixture(
			`process.${stream}.write("x".repeat(${stream === "stdout" ? 2_097_153 : 16_385})); await new Promise(()=>{});`,
		);
		await expect(child.evaluate("output fixture")).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(child.metrics().closed).toBe(true);
	}
});

it("rejects unsafe roots and invalid process settings", async () => {
	await expect(Process.create({ packageRoot: "/" })).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(Process.create({ packageRoot: "/tmp/*" })).rejects.toMatchObject(
		{ code: "invalid-input" },
	);
	const root = await directory();
	await expect(
		Process.create({ packageRoot: root, hardTimeoutMs: 0 }),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(
		Process.create({ packageRoot: root, maxOldSpaceMiB: 1000 }),
	).rejects.toMatchObject({ code: "invalid-input" });
	await expect(Process.create({ packageRoot: root })).rejects.toMatchObject({
		code: "unsupported",
	});
});
