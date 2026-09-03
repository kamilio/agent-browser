import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { deflateLimits } from "../src/deflate.js";

const paths = process.argv.slice(2);
if (paths.length !== 2)
	throw new Error("Provide baseline and compressed PNG paths");
const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
async function decode(path: string) {
	const bytes = await readFile(path);
	if (
		bytes.length > 33_554_432 ||
		bytes.subarray(0, 8).join(",") !== "137,80,78,71,13,10,26,10"
	)
		throw new Error("Invalid PNG file");
	let cursor = 8;
	let header: Buffer | undefined;
	const data: Buffer[] = [];
	while (cursor < bytes.length) {
		if (cursor + 12 > bytes.length) throw new Error("Truncated PNG chunk");
		const length = bytes.readUInt32BE(cursor);
		if (cursor + 12 + length > bytes.length)
			throw new Error("Truncated PNG data");
		const type = bytes.toString("ascii", cursor + 4, cursor + 8);
		if (type === "IHDR")
			header = bytes.subarray(cursor + 8, cursor + 8 + length);
		if (type === "IDAT")
			data.push(bytes.subarray(cursor + 8, cursor + 8 + length));
		cursor += length + 12;
	}
	if (
		!header ||
		header.length !== 13 ||
		header[8] !== 8 ||
		header[9] !== 6 ||
		header[12] !== 0
	)
		throw new Error("Unsupported validation PNG");
	const pixels = inflateSync(Buffer.concat(data), {
		maxOutputLength: deflateLimits.maxInputBytes,
	});
	const width = header.readUInt32BE(0);
	const height = header.readUInt32BE(4);
	if (pixels.length !== (width * 4 + 1) * height)
		throw new Error("Unexpected PNG scanline length");
	return { path, bytes, header, pixels, width, height };
}
let completed = false;
let measurement: Record<string, unknown> | undefined;
try {
	const [baseline, compressed] = await Promise.all(paths.map(decode));
	check(
		"Image dimensions, color type and interlace metadata are unchanged",
		baseline.header.equals(compressed.header),
	);
	check(
		"Independent native inflate yields byte-identical filtered RGBA scanlines",
		baseline.pixels.equals(compressed.pixels),
	);
	check(
		"Compression reduces this actual exported document by at least 90 percent",
		compressed.bytes.length < baseline.bytes.length / 10,
	);
	measurement = {
		width: compressed.width,
		height: compressed.height,
		baselineBytes: baseline.bytes.length,
		compressedBytes: compressed.bytes.length,
		reductionPercent:
			100 * (1 - compressed.bytes.length / baseline.bytes.length),
		ratio: baseline.bytes.length / compressed.bytes.length,
		baselineSha256: createHash("sha256").update(baseline.bytes).digest("hex"),
		compressedSha256: createHash("sha256")
			.update(compressed.bytes)
			.digest("hex"),
		filteredPixelsSha256: createHash("sha256")
			.update(compressed.pixels)
			.digest("hex"),
		baseline: baseline.path,
		compressed: compressed.path,
	};
	completed = true;
} finally {
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"local-native-PNG-artifact-byte-and-independent-inflate-comparison",
				realWebsite: false,
				completed,
				passed: checks.filter((check) => check.passed).length,
				checks,
				measurement,
			},
			null,
			2,
		),
	);
}
