import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { auditPortableCore } from "../scripts/check-portable-core.js";

function audit(source: string, others: Record<string, string> = {}) {
	const sources: Record<string, string> = { "src/index.ts": source, ...others };
	return auditPortableCore((module) => {
		if (!Object.hasOwn(sources, module))
			throw new Error("Missing fixture module");
		return sources[module];
	});
}

it("keeps the actual public runtime closure within the portable core", () => {
	const result = auditPortableCore((module) =>
		readFileSync(new URL(`../${module}`, import.meta.url), "utf8"),
	);
	expect(result.violations).toEqual([]);
	expect(result.passed).toBe(true);
	for (const module of [
		"src/document.ts",
		"src/session.ts",
		"src/network.ts",
		"src/script-dom.ts",
		"src/extension-page-runtime.ts",
		"src/document-layout.ts",
		"src/stacking-order.ts",
		"src/document-raster.ts",
		"src/document-pdf.ts",
		"src/snapshot.ts",
	])
		expect(result.modules).toContain(module);
}, 30_000);

it("follows imports, side effects, re-exports and literal dynamic imports through cycles", () => {
	const result = audit(
		'import "./side.js"; export * from "./nested/child.js"; void import(`./lazy.js`);',
		{
			"src/side.ts": 'import "./index.js";',
			"src/nested/child.ts": 'export { value } from "../lazy.js";',
			"src/lazy.ts": "export const value = 1;",
		},
	);
	expect(result.passed).toBe(true);
	expect(result.modules).toEqual([
		"src/index.ts",
		"src/lazy.ts",
		"src/nested/child.ts",
		"src/side.ts",
	]);
	expect(result.edges).toHaveLength(5);
	expect(result.edges.map((edge) => edge.kind)).toContain("dynamic");
});

it("reports the path that leaked a platform adapter", () => {
	const result = audit('export * from "./owner.js";', {
		"src/owner.ts": 'import "./node-adapter.js";',
		"src/node-adapter.ts": 'import { readFile } from "node:fs/promises";',
	});
	expect(result.passed).toBe(false);
	expect(result.violations).toEqual([
		{
			module: "src/node-adapter.ts",
			reason: "External runtime import: node:fs/promises",
			path: ["src/index.ts", "src/owner.ts", "src/node-adapter.ts"],
		},
	]);
});

it.each([
	'export * from "node:fs";',
	'import "fs";',
	'import "bun";',
	'import "cloudflare:workers";',
	'import "some-package";',
	'void import("node:child_process");',
	'void import("https://example.com/module.js");',
	'import "/outside.js";',
])("rejects external runtime edges: %s", (source) => {
	const result = audit(source);
	expect(result.passed).toBe(false);
	expect(result.violations[0].reason).toContain("External runtime import");
});

it("ignores erased type-only dependencies and type import expressions", () => {
	const result = audit(`
		import type { Stats } from "node:fs";
		export type { Stats } from "node:fs";
		export type Owner = import("outside-package").Owner;
		export function size(value: Stats) { return value.size; }
	`);
	expect(result.passed).toBe(true);
	expect(result.edges).toEqual([]);
});

it.each([
	'import { type Stats } from "node:fs";',
	'export { type Stats } from "node:fs";',
	'import {} from "node:fs";',
])("retains empty runtime imports under verbatim emit: %s", (source) => {
	expect(audit(source).passed).toBe(false);
});

it.each([
	"void import(moduleName);",
	"void import(`./${moduleName}.js`);",
	'void import("./" + moduleName);',
])("rejects unresolved dynamic imports: %s", (source) => {
	expect(audit(source).violations[0].reason).toBe(
		"Unresolved dynamic module expression",
	);
});

it.each([
	'import "../../outside.js";',
	'import "./file.json";',
	'import "./file.js?query";',
	'import "./file#fragment.js";',
	'import "./extensionless";',
])("fails closed on unsupported local resolution: %s", (source) => {
	expect(audit(source).passed).toBe(false);
});

it("rejects missing files instead of treating them as dependency-free leaves", () => {
	const result = audit('import "./missing.js";');
	expect(result.violations[0]).toEqual({
		module: "src/missing.ts",
		reason: "Cannot read runtime module",
		path: ["src/index.ts", "src/missing.ts"],
	});
});

it("does not scan comments, strings or property methods as imports", () => {
	const result = audit(
		'export const text = "import(unknown)"; const owner = { require() {} }; owner.require();',
	);
	expect(result.passed).toBe(true);
	expect(result.edges).toEqual([]);
});

it("rejects direct CommonJS loading", () => {
	expect(
		audit('const native = require("node:fs");').violations[0].reason,
	).toContain("CommonJS require");
});

it("rejects source syntax errors rather than approving recovered output", () => {
	expect(audit("export const = ;").passed).toBe(false);
});

it("rejects a root outside src without reading it", () => {
	let reads = 0;
	const result = auditPortableCore(() => {
		reads++;
		return "";
	}, "../outside.ts");
	expect(result.passed).toBe(false);
	expect(reads).toBe(0);
});
