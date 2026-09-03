import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeJpeg } from "../src/jpeg-decoder.js";
import { documentImageLimits } from "../src/document-images.js";
import { AgentBrowserError } from "../src/errors.js";

const root = process.argv[2];
if (!root || process.argv.length !== 3)
	throw new Error("Provide the jpeg-reference.py output directory");
const startedAt = new Date().toISOString();
const reference = JSON.parse(
	await readFile(join(root, "reference.json"), "utf8"),
) as { pillowVersion: string; jpegVersion: string; fixtures: number };
const manifest = JSON.parse(
	await readFile(join(root, "manifest.json"), "utf8"),
) as {
	file: string;
	pixels: string;
	width: number;
	height: number;
	mode: string;
	subsampling: number;
	progressive: boolean;
	restart: number;
	sha256: string;
}[];
if (!Array.isArray(manifest) || manifest.length !== 252)
	throw new Error("Expected the complete 252-fixture independent matrix");
const results: Record<string, unknown>[] = [];
let passed = false;
let benchmark: Record<string, unknown> | undefined;
try {
	for (const fixture of manifest) {
		const encoded = await readFile(join(root, fixture.file));
		const expected = await readFile(join(root, fixture.pixels));
		if (createHash("sha256").update(expected).digest("hex") !== fixture.sha256)
			throw new Error(`Independent reference hash mismatch: ${fixture.file}`);
		const decoded = decodeJpeg(encoded);
		if (
			decoded.image.width !== fixture.width ||
			decoded.image.height !== fixture.height ||
			decoded.progressive !== fixture.progressive ||
			decoded.image.pixels.length !== expected.length
		)
			throw new Error(`JPEG structure mismatch: ${fixture.file}`);
		let maximum = 0;
		let total = 0;
		for (let index = 0; index < expected.length; index++) {
			const error = Math.abs(decoded.image.pixels[index] - expected[index]);
			if (index % 4 === 3 && error) throw new Error("JPEG alpha is not opaque");
			maximum = Math.max(maximum, error);
			total += error;
		}
		const tolerance =
			fixture.mode === "L" || fixture.mode === "stored-rgb"
				? 1
				: fixture.subsampling === 0
					? 2
					: 3;
		const valid = maximum <= tolerance;
		results.push({
			file: fixture.file,
			passed: valid,
			maximumChannelError: maximum,
			meanChannelError: total / expected.length,
			tolerance,
			scans: decoded.scans,
			restartMarkers: decoded.restartMarkers,
			work: decoded.work,
			workingBytes: decoded.workingBytes,
		});
		if (!valid)
			throw new Error(
				`JPEG pixels exceed independent tolerance: ${fixture.file}: ${maximum}`,
			);
	}
	const encoded = await readFile(join(root, "benchmark.jpg"));
	const started = performance.now();
	const decoded = decodeJpeg(encoded);
	const elapsedMs = performance.now() - started;
	let fitsDefaultPageDecodeBudget = true;
	try {
		decodeJpeg(encoded, { maxWork: documentImageLimits.maxDecodeWork });
	} catch (error) {
		if (
			!(error instanceof AgentBrowserError) ||
			error.code !== "resource-limit"
		)
			throw error;
		fitsDefaultPageDecodeBudget = false;
	}
	benchmark = {
		width: decoded.image.width,
		height: decoded.image.height,
		encodedBytes: encoded.length,
		decodedBytes: decoded.image.pixels.length,
		elapsedMs,
		work: decoded.work,
		workingBytes: decoded.workingBytes,
		maximumRssKiB: process.resourceUsage().maxRSS,
		defaultPageDecodeWorkLimit: documentImageLimits.maxDecodeWork,
		fitsDefaultPageDecodeBudget,
		sha256: createHash("sha256").update(decoded.image.pixels).digest("hex"),
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
				reference: {
					pillowVersion: reference.pillowVersion,
					jpegVersion: reference.jpegVersion,
					method: "independently encoded JPEG and decoded RGBA",
				},
				limitations:
					"Numerical pixel tolerance is measured on this fixture matrix, not complete JPEG conformance or a browser/Worker benchmark. Color management, EXIF orientation, CMYK/YCCK, arithmetic/lossless JPEG and 12-bit samples are not implemented.",
			},
			null,
			2,
		),
	);
}
