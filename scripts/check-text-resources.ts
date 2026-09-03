import { cpus } from "node:os";
import { parseHtmlDocument } from "../src/html-parser.js";
import { layoutDocumentText } from "../src/text-layout.js";

const profiles: Readonly<Record<string, number>> = Object.freeze({
	small: 100,
	medium: 1000,
	large: 5000,
});
const profile = process.argv[2] ?? "small";
if (!Object.hasOwn(profiles, profile) || process.argv.length > 3)
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
const markup = `<main style="width:432px;font-size:8px">${Array.from({ length: rows }, (_, index) => `<p>Row ${index} alpha <span style="font-size:12px">beta</span> gamma delta.</p>`).join("")}</main>`;
const parseStart = performance.now();
const tree = parseHtmlDocument(
	markup,
	"https://fixture.invalid/text-resources",
);
const parseMs = performance.now() - parseStart;
sample("parsed");
let completed = false;
let measurement: Record<string, unknown> | undefined;
try {
	const layoutStart = performance.now();
	const layout = layoutDocumentText(tree);
	const layoutMs = performance.now() - layoutStart;
	sample("retained-layout");
	const occupied = layout.contexts.filter(({ glyphs }) => glyphs.length);
	check(
		"Every input paragraph produces one measured line",
		occupied.length === rows &&
			occupied.every(({ lines }) => lines.length === 1),
	);
	check(
		"Inline size changes affect glyph advances in every paragraph",
		occupied.every(({ glyphs }) =>
			glyphs.some(({ fontSize, advance }) => fontSize === 12 && advance === 9),
		),
	);
	check(
		"No source glyph is lost or replaced",
		occupied.every(
			({ glyphs }, index) =>
				glyphs.map(({ character }) => character).join("") ===
				`Row ${index} alpha beta gamma delta.`,
		) && layout.metrics.unsupportedGlyphs === 0,
	);
	check(
		"Line baselines and extents include the mixed-size inline font",
		occupied.every(
			({ lines, textHeight }) => lines[0].baseline === 12 && textHeight === 15,
		),
	);
	check(
		"No context exceeds its containing width",
		occupied.every(({ lines, contentWidth }) =>
			lines.every(
				({ width, overflow }) => width <= contentWidth && overflow === 0,
			),
		),
	);
	check(
		"The last source reference resolves to the original text node",
		tree.resolve(occupied.at(-1)?.glyphs.at(-1)?.ref ?? "").data ===
			" gamma delta.",
	);
	measurement = {
		parseMs,
		layoutMs,
		nativeNodes: tree.nodeCount,
		formattingRecords: layout.horizontal.formatting.nodes.length,
		contexts: layout.contexts.length,
		metrics: layout.metrics,
	};
	tree.close();
	let revoked = false;
	try {
		layoutDocumentText(tree);
	} catch {
		revoked = true;
	}
	check("Closing the source revokes fresh layout", revoked);
	check(
		"The immutable retained result remains readable after close",
		occupied.length === rows && occupied[0].glyphs[0].character === "R",
	);
	sample("closed-source-retained-layout");
	completed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				scope: "native-synthetic-formatting-and-block-relative-text-layout",
				javascriptRuntime: false,
				network: false,
				pageRendering: false,
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
