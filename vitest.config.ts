import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const files: unknown = JSON.parse(
	readFileSync(new URL("./native-tests.json", import.meta.url), "utf8"),
);
if (
	!Array.isArray(files) ||
	!files.length ||
	new Set(files).size !== files.length ||
	!files.every(
		(file): file is string =>
			typeof file === "string" && /^src\/[a-z0-9-]+\.test\.ts$/.test(file),
	)
)
	throw new Error("Invalid explicit native test list");

export default defineConfig({
	test: { include: files, maxWorkers: 1 },
});
