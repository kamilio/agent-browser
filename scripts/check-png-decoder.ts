import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, pngDecodeLimits } from "../src/png-decoder.js";
import { encodePng } from "../src/png.js";
import { createRaster } from "../src/raster.js";
import { pngFixture } from "./png-fixtures.js";

const startedAt = new Date().toISOString();
const directory = await mkdtemp(join(tmpdir(), "agent-browser-png-"));
const checks: { label: string; passed: boolean }[] = [];
const fixtures: {
	file: string;
	width: number;
	height: number;
	sha256: string;
}[] = [];
let passed = false;
let referenceVersion: string | undefined;
let resourceSample: unknown;
function hash(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}
function check(label: string, valid: boolean) {
	checks.push({ label, passed: valid });
	if (!valid) throw new Error(label);
}
try {
	for (const [color, depth] of [
		[0, 1],
		[0, 2],
		[0, 4],
		[0, 8],
		[2, 8],
		[3, 1],
		[3, 2],
		[3, 4],
		[3, 8],
		[4, 8],
		[6, 8],
	])
		for (const interlaced of [false, true])
			for (const filter of [0, 1, 2, 3, 4]) {
				const channels =
					color === 0 || color === 3
						? 1
						: color === 2
							? 3
							: color === 4
								? 2
								: 4;
				const width = 17;
				const height = 13;
				const samples = Array.from(
					{ length: width * height * channels },
					(_, index) => (index * 173 + (index >>> 2) * 7919) % 2 ** depth,
				);
				const palette =
					color === 3
						? Array.from(
								{ length: 2 ** depth * 3 },
								(_, index) => (index * 43) & 255,
							)
						: undefined;
				const transparency = color === 3 ? [31, 167] : undefined;
				const fixture = pngFixture({
					width,
					height,
					color,
					depth,
					samples,
					interlaced,
					filter,
					palette,
					transparency,
				});
				const decoded = decodePng(fixture.bytes);
				const file = `fixture-${color}-${depth}-${interlaced}-${filter}.png`;
				await writeFile(join(directory, file), fixture.bytes, { mode: 0o600 });
				fixtures.push({
					file,
					width,
					height,
					sha256: hash(decoded.image.pixels),
				});
			}
	await writeFile(join(directory, "manifest.json"), JSON.stringify(fixtures), {
		mode: 0o600,
	});
	const reference = spawnSync(
		"python3",
		[
			fileURLToPath(new URL("../../scripts/png-reference.py", import.meta.url)),
			directory,
		],
		{ encoding: "utf8", timeout: 30000, maxBuffer: 1_048_576 },
	);
	if (reference.status !== 0)
		throw new Error(
			`Independent PNG reference failed: ${reference.error?.message ?? reference.stderr}`,
		);
	const result = JSON.parse(reference.stdout) as {
		pillowVersion: string;
		verified: typeof fixtures;
		generated: typeof fixtures;
	};
	referenceVersion = result.pillowVersion;
	check(
		"Independent Pillow decoder verifies every generated filter, palette, packed-sample and Adam7 fixture",
		result.verified.length === fixtures.length &&
			result.verified.every(
				(entry, index) =>
					JSON.stringify(entry) === JSON.stringify(fixtures[index]),
			),
	);
	for (const generated of result.generated) {
		const decoded = decodePng(
			new Uint8Array(await readFile(join(directory, generated.file))),
		);
		check(
			`Native decoder reads independently encoded ${generated.file}`,
			decoded.image.width === generated.width &&
				decoded.image.height === generated.height &&
				hash(decoded.image.pixels) === generated.sha256,
		);
		check(
			`Native PNG re-encoding preserves ${generated.file} pixels`,
			hash(decodePng(encodePng(decoded.image)).image.pixels) ===
				generated.sha256,
		);
	}
	const image = createRaster(1024, 1024);
	for (let index = 0; index < image.pixels.length; index++)
		image.pixels[index] = (index * 31 + (index >>> 12)) & 255;
	const encoded = encodePng(image);
	const start = performance.now();
	const decoded = decodePng(encoded);
	const elapsedMs = performance.now() - start;
	check(
		"One-megapixel decode reproduces every independently retained source byte",
		hash(decoded.image.pixels) === hash(image.pixels),
	);
	let refused = false;
	try {
		decodePng(encoded, { maxWork: 1000 });
	} catch (error) {
		refused =
			error instanceof Error &&
			"code" in error &&
			error.code === "resource-limit";
	}
	check(
		"The same image is refused under a smaller explicit work budget",
		refused,
	);
	resourceSample = {
		width: image.width,
		height: image.height,
		encodedBytes: encoded.length,
		inflatedBytes: decoded.inflatedBytes,
		work: decoded.work,
		elapsedMs,
		maximumRssKiB: process.resourceUsage().maxRSS,
		limits: pngDecodeLimits,
	};
	passed = true;
} finally {
	await rm(directory, { recursive: true, force: true });
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				fixture:
					"local native PNG decoding and already-installed Pillow reference; no network, page runtime or image loading",
				referenceVersion,
				independentlyVerifiedFixtures: fixtures.length,
				checks,
				resourceSample,
				limitations:
					"Codec prerequisite only; no HTML image layout/loading, color management, animation, Worker or browser-wide performance acceptance",
			},
			null,
			2,
		),
	);
}
