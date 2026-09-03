import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { documentImageLimits } from "../src/document-images.js";
import { AgentBrowserError } from "../src/errors.js";
import { decodeJpeg } from "../src/jpeg-decoder.js";

const [root, beforeFilename, beforeDirectory] = process.argv.slice(2);
if (!root || !beforeFilename || !beforeDirectory || process.argv.length !== 5)
	throw new Error(
		"Provide the independent fixture directory, before report and before pixel directory",
	);
const startedAt = new Date().toISOString();
const before = JSON.parse(await readFile(beforeFilename, "utf8")) as {
	results: { file: string; sha256: string; work: number }[];
	benchmark: {
		work: number;
		medianMs: number;
		workingBytes: number;
		sha256: string;
		runs: number[];
	};
};
if (before.results.length !== 252)
	throw new Error("Expected the complete pre-optimization fixture evidence");
const results: Record<string, unknown>[] = [];
let passed = false;
let benchmark: Record<string, unknown> | undefined;
try {
	for (const fixture of before.results) {
		const old = await readFile(join(beforeDirectory, `${fixture.file}.rgba`));
		if (createHash("sha256").update(old).digest("hex") !== fixture.sha256)
			throw new Error(`Before artifact hash mismatch: ${fixture.file}`);
		const decoded = decodeJpeg(await readFile(join(root, fixture.file)));
		const identical = old.equals(decoded.image.pixels);
		results.push({
			file: fixture.file,
			identicalPixels: identical,
			previousWork: fixture.work,
			work: decoded.work,
		});
		if (!identical)
			throw new Error(`Optimization changed fixture pixels: ${fixture.file}`);
	}
	const input = await readFile(join(root, "benchmark.jpg"));
	const old = await readFile(join(beforeDirectory, "benchmark.rgba"));
	if (
		createHash("sha256").update(old).digest("hex") !== before.benchmark.sha256
	)
		throw new Error("Before benchmark artifact hash mismatch");
	const runs: number[] = [];
	let latest: ReturnType<typeof decodeJpeg> | undefined;
	for (let index = 0; index < 5; index++) {
		const started = performance.now();
		latest = decodeJpeg(input, { maxWork: documentImageLimits.maxDecodeWork });
		runs.push(performance.now() - started);
		if (!old.equals(latest.image.pixels))
			throw new Error("Optimization changed benchmark pixels");
	}
	if (
		!latest ||
		documentImageLimits.maxDecodeWork !== 33554432 ||
		before.benchmark.work <= documentImageLimits.maxDecodeWork ||
		latest.work > documentImageLimits.maxDecodeWork
	)
		throw new Error("Default-budget performance gate was not met");
	let bounded = false;
	try {
		decodeJpeg(input, { maxWorkingBytes: latest.workingBytes - 1 });
	} catch (error) {
		if (
			!(error instanceof AgentBrowserError) ||
			error.code !== "resource-limit"
		)
			throw error;
		bounded = true;
	}
	if (!bounded)
		throw new Error("Resampling working buffers are not covered by preflight");
	const medianMs = [...runs].sort((left, right) => left - right)[2];
	benchmark = {
		width: latest.image.width,
		height: latest.image.height,
		inputBytes: input.length,
		identicalPixels: true,
		sha256: before.benchmark.sha256,
		beforeRuns: before.benchmark.runs,
		runs,
		beforeMedianMs: before.benchmark.medianMs,
		medianMs,
		medianSpeedup: before.benchmark.medianMs / medianMs,
		beforeWork: before.benchmark.work,
		work: latest.work,
		defaultPageDecodeWorkLimit: documentImageLimits.maxDecodeWork,
		beforeWorkingBytes: before.benchmark.workingBytes,
		workingBytes: latest.workingBytes,
		workingBudgetPreflight: bounded,
		maximumRssKiB: process.resourceUsage().maxRSS,
	};
	passed = true;
} finally {
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				fixtures: results.length,
				results,
				benchmark,
				limitations:
					"Paired local five-run timings over the same fixture set are not a browser/Worker benchmark or a universal speed guarantee. Work counts reflect changed algorithms, not processor instructions. Pixel identity is checked on these 252 fixtures and one photo, not all possible JPEGs.",
			},
			null,
			2,
		),
	);
}
