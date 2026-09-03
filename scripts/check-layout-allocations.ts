import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { encodePng } from "../src/png.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const expectation = process.argv[2];
const rows = Number(process.argv[3]);
if (
	!["eager", "lazy"].includes(expectation) ||
	!Number.isSafeInteger(rows) ||
	rows < 1 ||
	rows > 5000 ||
	process.argv.length !== 4
)
	throw new Error("Provide eager or lazy and a row count from 1 to 5000");
const startedAt = new Date().toISOString();
const digest = (value: Uint8Array) =>
	createHash("sha256").update(value).digest("hex");
const moduleHashes = {
	layout: digest(
		await readFile(new URL("../src/document-layout.js", import.meta.url)),
	),
	raster: digest(
		await readFile(new URL("../src/document-raster.js", import.meta.url)),
	),
};
const markup = `<style>main{display:flow-root;width:432px;font-size:8px}p{margin:2px 0 4px}span{background-color:navy;color:white}</style><main>${Array.from({ length: rows }, (_, index) => `<p>Row ${index} alpha <span${index === rows - 1 ? ' id="target"' : ""}>BETA</span> gamma delta.</p>`).join("")}</main>`;
const tree = parseHtmlDocument(
	markup,
	"https://fixture.invalid/layout-allocations",
);
documentStyles(tree).setViewport(640, 480);
const id = new DocumentQueries(tree).querySelector("#target");
if (id === null) throw new Error("Missing allocation fixture target");
const counts = { glyphRecords: 0, glyphArrays: 0 };
function glyph(value: unknown) {
	return (
		typeof value === "object" &&
		value !== null &&
		Object.hasOwn(value, "formattingId") &&
		Object.hasOwn(value, "character") &&
		Object.hasOwn(value, "line")
	);
}
const freeze = Object.freeze;
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
let completed = false;
let measurement: Record<string, unknown> | undefined;
Object.freeze = ((value: unknown) => {
	if (glyph(value)) counts.glyphRecords++;
	if (Array.isArray(value) && value.length && glyph(value[0]))
		counts.glyphArrays++;
	return freeze(value);
}) as typeof Object.freeze;
try {
	const result = rasterizeDocument(tree, { element: tree.reference(id) });
	const before = { ...counts };
	const glyphs = result.layout.metrics.glyphs;
	const contexts = result.layout.contexts.length;
	check(
		"Capture allocates the explicitly expected number of frozen glyph records",
		before.glyphRecords === glyphs * (expectation === "eager" ? 2 : 1),
	);
	check(
		"Capture allocates the explicitly expected number of glyph vectors",
		before.glyphArrays === contexts * (expectation === "eager" ? 2 : 1),
	);
	const snapshots = result.layout.contexts.map((context) => context.glyphs);
	const after = { ...counts };
	check(
		"Explicit absolute snapshots contain every glyph and remain frozen",
		snapshots.reduce((total, entries) => total + entries.length, 0) ===
			glyphs && snapshots.every(Object.isFrozen),
	);
	check(
		"Full absolute inspection retains the same complete two-vector representation",
		after.glyphRecords === glyphs * 2 && after.glyphArrays === contexts * 2,
	);
	check(
		"Repeated inspection reuses stable snapshot identities",
		result.layout.contexts.every(
			(context, index) => context.glyphs === snapshots[index],
		) && counts.glyphRecords === after.glyphRecords,
	);
	const png = encodePng(result.image);
	check(
		"The inspected capture still has actual target dimensions",
		result.image.width === 24 && result.image.height === 8,
	);
	measurement = {
		glyphs,
		contexts,
		before,
		after,
		pngBytes: png.length,
		pngSha256: digest(png),
	};
	completed = true;
} finally {
	Object.freeze = freeze;
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				expectation,
				rows,
				moduleHashes,
				instrumentation:
					"Trusted native-only Object.freeze counter, restored in finally; not a timing/RSS benchmark, network run or SDK test",
				completed,
				checks,
				measurement,
			},
			null,
			2,
		),
	);
}
