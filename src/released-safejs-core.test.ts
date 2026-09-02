import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadReleasedCore } from "../scripts/released-safejs-core.js";

const roots: string[] = [];
const declarations =
	"export function Budget() {} export function defineExtension() {} export function createRealm() {}";

async function fixture(
	overrides: Record<string, unknown> = {},
	source = declarations,
) {
	const parent = await mkdtemp(join(tmpdir(), "browser-release-loader-"));
	roots.push(parent);
	const root = join(parent, "package");
	await mkdir(root);
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({
			name: "@poe-platform/safe-js",
			version: "0.1.36",
			type: "module",
			exports: { "./core": { import: "./core.js" } },
			...overrides,
		}),
	);
	await writeFile(join(root, "core.js"), source);
	return { root, parent };
}

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("explicit release loader selection, not SDK conformance", () => {
	it("accepts only the selected named/versioned public module", async () => {
		const { root } = await fixture();
		const loaded = await loadReleasedCore(root, "0.1.36");
		expect(loaded.packageName).toBe("@poe-platform/safe-js");
		expect(loaded.version).toBe("0.1.36");
		expect(typeof loaded.core.defineExtension).toBe("function");
	});

	it.each([
		undefined,
		"",
		"latest",
		"^0.1.36",
		"0.1.36/../../",
		"1".repeat(65),
	])("rejects unpinned release %s before reading files", async (version) => {
		await expect(loadReleasedCore(undefined, version)).rejects.toThrow(
			"explicit SafeJS release version",
		);
	});

	it.each([undefined, "relative/package", "/tmp/*"])(
		"rejects an implicit or unrestricted root %s",
		async (root) => {
			await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
				"explicit restricted package root",
			);
		},
	);

	it.each(["@poe-code/safe-js", "poe-code", "unrelated"])(
		"rejects %s without legacy fallback",
		async (name) => {
			const { root } = await fixture({ name });
			await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
				"package name or release version",
			);
		},
	);

	it("rejects a stale installed version", async () => {
		const { root } = await fixture({ version: "0.1.29" });
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"package name or release version",
		);
	});

	it.each([
		"../core.js",
		"./../outside.js",
		"/tmp/core.js",
		"./core.js?query",
		undefined,
	])("does not guess a missing or escaping public export %s", async (entry) => {
		const { root } = await fixture({
			exports: { "./core": { import: entry } },
		});
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow();
	});

	it("rejects an export symlink outside the selected package", async () => {
		const { root, parent } = await fixture({
			exports: { "./core": { import: "./linked.js" } },
		});
		await writeFile(join(parent, "outside.js"), declarations);
		await symlink(join(parent, "outside.js"), join(root, "linked.js"));
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"escapes its package root",
		);
	});

	it("rejects a manifest symlink outside the selected package", async () => {
		const { root, parent } = await fixture();
		await writeFile(join(parent, "outside.json"), "{}");
		await rm(join(root, "package.json"));
		await symlink(join(parent, "outside.json"), join(root, "package.json"));
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"manifest escapes",
		);
	});

	it("rejects a directory export", async () => {
		const { root } = await fixture({
			exports: { "./core": { import: "./folder" } },
		});
		await mkdir(join(root, "folder"));
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"not a file",
		);
	});

	it("bounds manifest bytes before parsing", async () => {
		const { root } = await fixture({ padding: "x".repeat(65_536) });
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"Invalid SafeJS release manifest",
		);
	});

	it("rejects incomplete extension exports", async () => {
		const { root } = await fixture(
			{},
			"export function Budget() {} export function createRealm() {}",
		);
		await expect(loadReleasedCore(root, "0.1.36")).rejects.toThrow(
			"lacks the public extension API",
		);
	});
});
