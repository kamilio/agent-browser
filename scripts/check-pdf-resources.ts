import { renderDocumentPdf } from "../src/document-pdf.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentStyles } from "../src/styles.js";

const count = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(count) || count < 1 || count > 1500)
	throw new Error("Expected 1..1500 rows");
const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const tree = parseHtmlDocument(
	`<main style="font-size:8px;line-height:10px">${Array.from({ length: count }, (_, index) => `<div>Row ${index}: native PDF export</div>`).join("")}</main>`,
	"https://fixture.invalid/pdf-resources",
);
documentStyles(tree).setViewport(512, 512);
const before = process.memoryUsage();
const start = performance.now();
let passed = false;
let metrics: unknown;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
try {
	const pdf = renderDocumentPdf(tree);
	const elapsedMs = performance.now() - start;
	const after = process.memoryUsage();
	check(
		"Export reuses one native layout across every page",
		pdf.metrics.layoutPasses === 1,
	);
	check(
		"Every source glyph is represented once in the text layer",
		pdf.metrics.glyphs ===
			Array.from(
				{ length: count },
				(_, index) => `Row ${index}: native PDF export`.length,
			).reduce((total, length) => total + length, 0),
	);
	check(
		"Page clips cover the complete normal-flow document",
		pdf.clips.reduce((total, clip) => total + clip.height, 0) ===
			Math.max(512, count * 10),
	);
	check(
		"Compression plus text remains below raw page image size",
		pdf.bytes.length < pdf.metrics.pixels * 3,
	);
	check(
		"Bytes, pixels, pages and reported work remain within their quotas",
		pdf.bytes.length <= 33_554_432 &&
			pdf.metrics.pixels <= 16_777_216 &&
			pdf.metrics.pages <= 32 &&
			pdf.metrics.work <= 128_000_000 &&
			pdf.metrics.compressionWork <= 128_000_000,
	);
	metrics = {
		...pdf.metrics,
		elapsedMs,
		before,
		after,
		maxRssKiB: process.resourceUsage().maxRSS,
	};
	tree.close();
	check("Closing the document clears its native arena", tree.nodeCount === 0);
	passed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				fixture:
					"native in-memory article, not guest execution or Worker deployment",
				rows: count,
				passed,
				checks,
				metrics,
			},
			null,
			2,
		),
	);
}
