import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import {
	type PageRuntimeLoadOptions,
	loadPageRuntime,
	loadPageScriptCore,
} from "./node-page-core.js";

const directories: string[] = [];

it("snapshots runtime configuration before awaiting package access and forwards it to selection", async () => {
	const root = await fixture();
	const runtimeOptions = {
		classicScripts: true,
		callbackScheduling: "after-prefix" as const,
	};
	const loader = { importModule: vi.fn(async () => extensionCore()) };
	const loading = loadPageRuntime(
		root,
		{ adapter: "extension", runtimeOptions },
		loader,
	);
	runtimeOptions.classicScripts = false;
	const selected = await loading;
	expect(selected.runtimeOptions).toEqual({
		classicScripts: true,
		callbackScheduling: "after-prefix",
	});
	expect(Object.isFrozen(selected.runtimeOptions)).toBe(true);
	expect(loader.importModule).toHaveBeenCalledOnce();
});

it.each([
	[],
	null,
	{ classicScripts: 1 },
	{ callbackScheduling: "immediate" },
	{ moduleOptions: {} },
])(
	"rejects bad runtime configuration before package access/import %#",
	async (runtimeOptions) => {
		const loader = { importModule: vi.fn() };
		await expect(
			loadPageRuntime(
				"/missing-before-import",
				{ adapter: "extension", runtimeOptions } as PageRuntimeLoadOptions,
				loader,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(loader.importModule).not.toHaveBeenCalled();
	},
);

it("rejects legacy semantics and outer option getters before importing", async () => {
	const loader = { importModule: vi.fn() };
	await expect(
		loadPageRuntime(
			"/missing",
			{ runtimeOptions: { classicScripts: true } },
			loader,
		),
	).rejects.toMatchObject({ code: "unsupported" });
	const getter = vi.fn(() => ({ classicScripts: true }));
	const options = Object.defineProperty(
		{ adapter: "extension" },
		"runtimeOptions",
		{ get: getter },
	);
	await expect(
		loadPageRuntime("/missing", options as PageRuntimeLoadOptions, loader),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(getter).not.toHaveBeenCalled();
	expect(loader.importModule).not.toHaveBeenCalled();
});
afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});

function manifest(name = "poe-code", entry = "./public/core.js") {
	return {
		name,
		version: "1.2.3-fixture",
		exports: {
			[name === "poe-code" ? "./safe-js" : "./core"]: {
				import: entry,
			},
		},
	};
}

async function fixture(metadata: unknown = manifest()) {
	const root = await mkdtemp(join(tmpdir(), "browser-page-core-selection-"));
	directories.push(root);
	await writeFile(join(root, "package.json"), JSON.stringify(metadata));
	await mkdir(join(root, "public"));
	await writeFile(
		join(root, "public/core.js"),
		"throw new Error('must not import fixture file');",
	);
	return root;
}

function legacyCore() {
	return Object.fromEntries(
		[
			"Budget",
			"SandboxError",
			"createRealm",
			"createHostObject",
			"startCallback",
			"deepCopyFromSandbox",
			"retainGuestArguments",
			"releaseGuestReference",
		].map((name) => [name, vi.fn()]),
	);
}

function extensionCore() {
	return {
		Budget: vi.fn(),
		defineExtension: vi.fn(),
		createRealm: vi.fn(),
	};
}

it.each(["poe-code", "@poe-code/safe-js", "@poe-platform/safe-js"])(
	"loads only the declared public export from %s using an injected module",
	async (packageName) => {
		const root = await fixture(manifest(packageName));
		const core = legacyCore();
		const loader = { importModule: vi.fn(async () => core) };
		const selected = await loadPageRuntime(root, {}, loader);
		expect(selected).toMatchObject({
			adapter: "legacy",
			packageName,
			version: "1.2.3-fixture",
			publicExport: packageName === "poe-code" ? "./safe-js" : "./core",
			validation: "contract-shape-only",
		});
		expect(typeof selected.factory.createPageRuntime).toBe("function");
		expect(Object.isFrozen(selected)).toBe(true);
		expect(loader.importModule).toHaveBeenCalledExactlyOnceWith(
			pathToFileURL(join(root, "public/core.js")).href,
		);
		for (const operation of Object.values(core))
			expect(operation).not.toHaveBeenCalled();
	},
);

it("preserves the existing loadPageScriptCore return shape and legacy default", async () => {
	const root = await fixture();
	const core = legacyCore();
	const loader = { importModule: vi.fn(async () => core) };
	const result = await loadPageScriptCore(root, loader);
	expect(result).toEqual({
		core,
		packageName: "poe-code",
		version: "1.2.3-fixture",
	});
	expect(result.core).toBe(core);
	expect(core.createRealm).not.toHaveBeenCalled();
});

it.each(["poe-code", "@poe-code/safe-js", "@poe-platform/safe-js"])(
	"selects extension only on explicit request, independent of package name %s",
	async (packageName) => {
		const root = await fixture(manifest(packageName));
		const core = extensionCore();
		const loader = { importModule: vi.fn(async () => core) };
		await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
			code: "unsupported",
		});
		await expect(loadPageScriptCore(root, loader)).rejects.toMatchObject({
			code: "unsupported",
		});
		await expect(
			loadPageRuntime(root, { adapter: "extension" }, loader),
		).resolves.toMatchObject({
			adapter: "extension",
			packageName,
			validation: "contract-shape-only",
		});
		expect(core.defineExtension).not.toHaveBeenCalled();
		expect(core.createRealm).not.toHaveBeenCalled();
	},
);

it("does not fall back to legacy after an explicit extension mismatch", async () => {
	const root = await fixture();
	const loader = { importModule: vi.fn(async () => legacyCore()) };
	await expect(
		loadPageRuntime(root, { adapter: "extension" }, loader),
	).rejects.toMatchObject({
		code: "unsupported",
		message: expect.stringContaining("extension page runtime"),
	});
	expect(loader.importModule).toHaveBeenCalledOnce();
});

it.each([
	null,
	[],
	"extension",
	{ adapter: null },
	{ adapter: "auto" },
	{ adapter: false },
])(
	"rejects invalid adapter options before filesystem access or import: %j",
	async (input) => {
		const loader = { importModule: vi.fn() };
		await expect(
			loadPageRuntime("not-a-root", input as PageRuntimeLoadOptions, loader),
		).rejects.toMatchObject({
			code: "invalid-input",
			message: expect.stringContaining("page runtime"),
		});
		expect(loader.importModule).not.toHaveBeenCalled();
	},
);

it.each([
	null,
	[],
	42,
	"manifest",
	{},
	manifest("wrong-package"),
	{ ...manifest(), version: "not-a-version" },
	{ ...manifest(), version: "1".repeat(65) },
	{ ...manifest(), exports: { "./safe-js": "./core.js" } },
	{ ...manifest(), exports: { "./safe-js": { require: "./core.js" } } },
	{ ...manifest(), exports: { "./core": { import: "./public/core.js" } } },
	manifest("poe-code", "../outside.js"),
	manifest("poe-code", "/outside.js"),
	manifest("poe-code", "./core\0.js"),
])(
	"rejects malformed manifests or undeclared import entries: %j",
	async (metadata) => {
		const root = await fixture(metadata);
		const loader = { importModule: vi.fn() };
		await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
			name: "AgentBrowserError",
		});
		expect(loader.importModule).not.toHaveBeenCalled();
	},
);

it.each(["./../../outside.js", "./../sibling/core.js", "./"])(
	"rejects escaping or non-file targets before importing: %s",
	async (entry) => {
		const root = await fixture(manifest("poe-code", entry));
		const loader = { importModule: vi.fn() };
		await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(loader.importModule).not.toHaveBeenCalled();
	},
);

it("rejects an export symlink that leaves the explicitly selected package", async () => {
	const outside = await fixture();
	const root = await fixture(manifest("poe-code", "./outside.js"));
	await symlink(join(outside, "public/core.js"), join(root, "outside.js"));
	const loader = { importModule: vi.fn() };
	await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(loader.importModule).not.toHaveBeenCalled();
});

it("rejects a manifest symlink outside the selected package", async () => {
	const outside = await fixture();
	const root = await fixture();
	await rm(join(root, "package.json"));
	await symlink(join(outside, "package.json"), join(root, "package.json"));
	const loader = { importModule: vi.fn() };
	await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(loader.importModule).not.toHaveBeenCalled();
});

it("supports an internal export symlink and imports the resolved public file", async () => {
	const root = await fixture(manifest("poe-code", "./alias.js"));
	await symlink(join(root, "public/core.js"), join(root, "alias.js"));
	const loader = { importModule: vi.fn(async () => legacyCore()) };
	await loadPageRuntime(root, {}, loader);
	expect(loader.importModule).toHaveBeenCalledExactlyOnceWith(
		pathToFileURL(join(root, "public/core.js")).href,
	);
});

it.each(["{", " ".repeat(65_537), "\uFFFD"])(
	"rejects invalid manifest bytes without invoking the importer (case %#)",
	async (source) => {
		const root = await fixture();
		await writeFile(join(root, "package.json"), source);
		const loader = { importModule: vi.fn() };
		await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(loader.importModule).not.toHaveBeenCalled();
	},
);

it("rejects directory manifests and directory import targets", async () => {
	const root = await fixture(manifest("poe-code", "./public"));
	const loader = { importModule: vi.fn() };
	await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
		code: "invalid-input",
	});
	await rm(join(root, "package.json"));
	await mkdir(join(root, "package.json"));
	await expect(loadPageRuntime(root, {}, loader)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(loader.importModule).not.toHaveBeenCalled();
});

it("rejects non-absolute roots without invoking the importer", async () => {
	const loader = { importModule: vi.fn() };
	await expect(loadPageRuntime("relative", {}, loader)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(loader.importModule).not.toHaveBeenCalled();
});

it("does not retry failed module loads or substitute another package or export", async () => {
	const root = await fixture();
	const failure = new Error("fixture import failure");
	const loader = {
		importModule: vi.fn(async () => {
			throw failure;
		}),
	};
	await expect(loadPageRuntime(root, {}, loader)).rejects.toBe(failure);
	expect(loader.importModule).toHaveBeenCalledOnce();
});

it("rejects incomplete module contracts after one import and without initialization", async () => {
	const root = await fixture();
	const core = { ...extensionCore(), createRealm: undefined };
	const loader = { importModule: vi.fn(async () => core) };
	await expect(
		loadPageRuntime(root, { adapter: "extension" }, loader),
	).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(loader.importModule).toHaveBeenCalledOnce();
	expect(core.defineExtension).not.toHaveBeenCalled();
});
