import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { loadSafeJsSdk } from "./node-safejs.js";

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});
async function fixture(manifest: object) {
	const root = await mkdtemp(join(tmpdir(), "browser-safejs-sdk-"));
	directories.push(root);
	await writeFile(join(root, "package.json"), JSON.stringify(manifest));
	return root;
}

it("loads only the manifest-declared public import from an explicitly selected installed package", async () => {
	const root = await fixture({
		name: "poe-code",
		version: "13.0.10",
		type: "module",
		exports: { "./safe-js": { import: "./public/sdk.js" } },
	});
	await mkdir(join(root, "public"));
	await writeFile(
		join(root, "public/sdk.js"),
		"export class Budget {} export class SandboxError extends Error {} export async function run() {} export function deepCopyFromSandbox(value) { return value; }",
	);
	expect((await loadSafeJsSdk(root)).version).toBe("13.0.10");
});

it.each([
	{ name: "wrong-package", exports: { "./safe-js": { import: "./sdk.js" } } },
	{ name: "poe-code" },
	{ name: "poe-code", exports: { "./safe-js": { import: "../outside.js" } } },
	{
		name: "poe-code",
		exports: { "./safe-js": { import: "./../../outside.js" } },
	},
])("rejects undeclared or escaping import targets %j", async (manifest) => {
	await expect(loadSafeJsSdk(await fixture(manifest))).rejects.toMatchObject({
		name: "AgentBrowserError",
	});
});

it("rejects relative roots and absent SDKs without installing anything", async () => {
	await expect(loadSafeJsSdk("relative/path")).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(
		loadSafeJsSdk(
			await fixture({
				name: "poe-code",
				exports: { "./safe-js": { import: "./absent.js" } },
			}),
		),
	).rejects.toMatchObject({ code: "unsupported" });
});
