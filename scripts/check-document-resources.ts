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
const profile = process.argv[2] ?? "small";
if (!Object.hasOwn(profiles, profile) || process.argv.length !== 3)
	throw new Error("Choose small, medium or large");
const rows = profiles[profile];
const startedAt = new Date().toISOString();
const started = performance.now();
const cpu = process.cpuUsage();
const samples: {
	stage: string;
	rss: number;
	heapUsed: number;
	arrayBuffers: number;
}[] = [];
const sample = (stage: string) => {
	const memory = process.memoryUsage();
	samples.push({
		stage,
		rss: memory.rss,
		heapUsed: memory.heapUsed,
		arrayBuffers: memory.arrayBuffers,
	});
};
const checks: { label: string; passed: boolean }[] = [];
const check = (label: string, passed: boolean) => {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
};
sample("start");
const markup = `<main style="display:flow-root;width:432px;font-size:8px">${Array.from({ length: rows }, (_, index) => `<p style="margin:2px 0 4px">Row ${index} alpha <span style="font-size:12px">beta</span> gamma delta.</p>`).join("")}</main>`;
const parseStarted = performance.now();
const tree = parseHtmlDocument(
	markup,
	"https://fixture.invalid/document-resources",
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
	const occupied = result.layout.contexts.filter(({ glyphs }) => glyphs.length);
	check(
		"Every paragraph retains one positioned text line",
		occupied.length === rows &&
			occupied.every(({ lines }) => lines.length === 1),
	);
	check(
		"Sibling margins collapse to the expected document height",
		result.layout.flowHeight === rows * 19 + 2,
	);
	check(
		"Absolute first and last paragraph positions follow the same flow",
		occupied[0].contentY === 2 &&
			occupied.at(-1)?.contentY === 2 + (rows - 1) * 19,
	);
	check(
		"Only viewport-intersecting glyphs are painted",
		result.metrics.paintedGlyphs > 100 &&
			result.metrics.clippedGlyphs > result.metrics.paintedGlyphs,
	);
	check(
		"No supported source glyph needs replacement",
		result.layout.text.metrics.unsupportedGlyphs === 0,
	);
	const encodeStarted = performance.now();
	const png = encodePng(result.image);
	const encodeMs = performance.now() - encodeStarted;
	sample("retained-png");
	check(
		"The image has bounded opaque RGBA viewport storage",
		result.image.pixels.length === 640 * 480 * 4 &&
			result.image.pixels.every(
				(value, index) => index % 4 !== 3 || value === 255,
			),
	);
	measurement = {
		parseMs,
		renderMs,
		encodeMs,
		nativeNodes: tree.nodeCount,
		boxes: result.layout.metrics.boxes,
		text: result.layout.text.metrics,
		document: result.layout.metrics,
		paint: result.metrics,
		flowHeight: result.layout.flowHeight,
		pngBytes: png.length,
		pngSha256: createHash("sha256").update(png).digest("hex"),
	};
	tree.close();
	let revoked = false;
	try {
		rasterizeDocument(tree);
	} catch {
		revoked = true;
	}
	check("Closing the source revokes new rendering", revoked);
	check(
		"Retained geometry and pixels remain readable after close",
		occupied[0].glyphs[0].character === "R" && result.image.width === 640,
	);
	sample("closed-source-retained-output");
	completed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope:
					"native-synthetic-normal-flow-document-layout-text-paint-and-png",
				javascriptRuntime: false,
				network: false,
				fullCssPainting: false,
				profile,
				rows,
				htmlCodeUnits: markup.length,
				node: process.version,
				platform: process.platform,
				arch: process.arch,
				cpuModel: cpus()[0]?.model,
				completed,
				checks,
				passed: checks.filter(({ passed }) => passed).length,
				measurement,
				samples,
				elapsedMs: performance.now() - started,
				cpuMicroseconds: process.cpuUsage(cpu),
				peakRssBytes: process.resourceUsage().maxRSS * 1024,
			},
			null,
			2,
		),
	);
}
