import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { encodePng } from "../src/png.js";
import { documentStyles } from "../src/styles.js";

const profiles: Readonly<Record<string, number>> = Object.freeze({
	small: 100,
	medium: 1000,
	large: 5000,
});
const profile = process.argv[2];
if (!Object.hasOwn(profiles, profile) || process.argv.length !== 3)
	throw new Error("Choose small, medium or large");
const rows = profiles[profile];
const startedAt = new Date().toISOString();
const started = performance.now();
const cpu = process.cpuUsage();
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const samples: {
	stage: string;
	rss: number;
	heapUsed: number;
	arrayBuffers: number;
}[] = [];
function sample(stage: string) {
	const { rss, heapUsed, arrayBuffers } = process.memoryUsage();
	samples.push({ stage, rss, heapUsed, arrayBuffers });
}
sample("start");
const markup = `<style>body{background-color:#101827;color:#dce6ff}main{display:flow-root;width:432px;font-size:8px}p{margin:2px 0 4px;background-color:#ffffff20}span{font-size:12px;background-color:#0000ff40;color:aquamarine}</style><main>${Array.from({ length: rows }, (_, index) => `<p>Row ${index} alpha <span>beta</span> gamma delta.</p>`).join("")}</main>`;
const parseStarted = performance.now();
const tree = parseHtmlDocument(
	markup,
	"https://fixture.invalid/paint-resources",
);
const parseMs = performance.now() - parseStarted;
documentStyles(tree).setViewport(640, 480);
sample("parsed");
let completed = false;
let measurement: Record<string, unknown> | undefined;
try {
	const renderStarted = performance.now();
	const result = rasterizeDocument(tree);
	const renderMs = performance.now() - renderStarted;
	sample("retained-document-raster");
	check(
		"All paragraph lines retain normal-flow positions",
		result.layout.metrics.lines === rows &&
			result.layout.flowHeight === rows * 19 + 2,
	);
	check(
		"Every colored inline has a fragment even when outside the clip",
		result.metrics.inlineFragments === rows,
	);
	check(
		"Painting culls offscreen backgrounds and glyphs",
		result.metrics.paintedBackgrounds < 60 &&
			result.metrics.paintedGlyphs < 1000 &&
			result.metrics.clippedGlyphs > 0,
	);
	check(
		"Solid body background reaches outside the main content box",
		JSON.stringify([...result.image.pixels.subarray(639 * 4, 640 * 4)]) ===
			"[16,24,39,255]",
	);
	check(
		"Caller owns bounded viewport pixels",
		result.image.pixels.length === 640 * 480 * 4,
	);
	const encodeStarted = performance.now();
	const png = encodePng(result.image);
	const encodeMs = performance.now() - encodeStarted;
	sample("retained-png");
	check(
		"PNG has a native signature",
		[...png.subarray(0, 8)].join(",") === "137,80,78,71,13,10,26,10",
	);
	const sha256 = createHash("sha256").update(png).digest("hex");
	tree.close();
	let revoked = false;
	try {
		rasterizeDocument(tree);
	} catch {
		revoked = true;
	}
	check("Closing the source prevents fresh rendering", revoked);
	check(
		"Existing pixel and PNG buffers remain caller-owned",
		result.image.pixels.length === 1228800 &&
			png.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10",
	);
	sample("closed-with-results-retained");
	measurement = {
		rows,
		markupBytes: Buffer.byteLength(markup),
		parseMs,
		renderMs,
		encodeMs,
		totalMs: performance.now() - started,
		cpu: process.cpuUsage(cpu),
		peakRssBytes: process.resourceUsage().maxRSS * 1024,
		layout: result.layout.metrics,
		paint: result.metrics,
		png: { bytes: png.length, sha256 },
	};
	completed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "native-in-memory-css-paint-resource-profile",
				profile,
				node: process.version,
				platform: process.platform,
				architecture: process.arch,
				cpuModel: cpus()[0]?.model,
				realWebsite: false,
				safeJs: false,
				fullCssPainting: false,
				retainedResults: true,
				garbageCollectionForced: false,
				completed,
				passed: checks.filter((entry) => entry.passed).length,
				checks,
				measurement,
				samples,
			},
			null,
			2,
		),
	);
}
