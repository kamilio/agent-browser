import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { encodePng } from "../src/png.js";
import { DocumentQueries } from "../src/selectors.js";
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
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const markup = `<style>main{display:flow-root;width:432px;font-size:8px}p{margin:2px 0 4px}span{background-color:navy;color:white}</style><main>${Array.from({ length: rows }, (_, index) => `<p>Row ${index} alpha <span${index === rows - 1 ? ' id="target"' : ""}>BETA</span> gamma delta.</p>`).join("")}</main>`;
const parseStart = performance.now();
const tree = parseHtmlDocument(
	markup,
	"https://fixture.invalid/inline-capture-resources",
);
documentStyles(tree).setViewport(640, 480);
const queries = new DocumentQueries(tree);
const id = queries.querySelector("#target");
if (id === null) throw new Error("Missing final-row target");
const ref = tree.reference(id);
const parseMs = performance.now() - parseStart;
let completed = false;
let measurement: Record<string, unknown> | undefined;
try {
	const revision = tree.revision;
	const renderStart = performance.now();
	const result = rasterizeDocument(tree, { element: ref });
	const renderMs = performance.now() - renderStart;
	const retainedMemory = process.memoryUsage();
	check(
		"The last row produces its actual 24 by 8 inline crop",
		result.image.width === 24 && result.image.height === 8,
	);
	check(
		"The target remains outside the unchanged viewport",
		result.clip.y > 480 &&
			documentStyles(tree).viewport.width === 640 &&
			documentStyles(tree).viewport.height === 480,
	);
	check(
		"The full source layout is retained without viewport reflow",
		result.layout.metrics.lines === rows,
	);
	check(
		"Raster painting culls unrelated glyphs",
		result.metrics.paintedGlyphs === 4 &&
			result.metrics.clippedGlyphs > rows * 20,
	);
	check(
		"The capture contains both native ink and its actual background",
		result.image.pixels.some(
			(value, index) => index % 4 === 0 && value === 255,
		) &&
			result.image.pixels.some(
				(value, index) => index % 4 === 2 && value === 128,
			),
	);
	check("Capture is observational", tree.revision === revision);
	const encodeStart = performance.now();
	const png = encodePng(result.image);
	const encodeMs = performance.now() - encodeStart;
	check(
		"Small target exports a valid bounded compressed PNG",
		png.length < 1000 &&
			png.subarray(0, 8).join(",") === "137,80,78,71,13,10,26,10",
	);
	measurement = {
		parseMs,
		renderMs,
		encodeMs,
		clip: result.clip,
		layout: result.layout.metrics,
		paint: result.metrics,
		pngBytes: png.length,
		sha256: createHash("sha256").update(png).digest("hex"),
		retainedMemory,
		peakRssKiB: process.resourceUsage().maxRSS,
	};
	completed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				profile,
				rows,
				runtime: process.version,
				cpu: cpus()[0]?.model,
				fixture:
					"in-memory native offscreen inline capture; no network, SDK, forced GC or Worker acceptance",
				completed,
				checks,
				measurement,
			},
			null,
			2,
		),
	);
}
