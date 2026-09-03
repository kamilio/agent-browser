import { cpus } from "node:os";
import { documentGeometry } from "../src/document-geometry.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";

const profiles: Readonly<Record<string, number>> = Object.freeze({
	small: 100,
	medium: 1000,
	large: 5000,
});
const profile = process.argv[2];
if (!Object.hasOwn(profiles, profile) || process.argv.length !== 3)
	throw new Error("Choose small, medium or large");
const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (!passed) throw new Error(label);
}
const tree = parseHtmlDocument(
	`<main style="width:18px;font-size:8px"><span id="target">${"ab cd ".repeat(profiles[profile])}</span></main>`,
	"https://fixture.invalid/geometry-resources",
);
const queries = new DocumentQueries(tree);
const id = queries.querySelector("#target");
if (id === null) throw new Error("Missing fixture target");
const geometry = documentGeometry(tree);
let passed = false;
let measurement: Record<string, unknown> | undefined;
try {
	const start = performance.now();
	const rects = geometry.getClientRects(id);
	const bounds = geometry.getBoundingClientRect(id);
	const buildMs = performance.now() - start;
	const retained = process.memoryUsage();
	check(
		"Every wrapped word has a line fragment",
		rects.length === profiles[profile] * 2,
	);
	check(
		"Bounding geometry spans the complete wrapped inline",
		bounds.width === 12 && bounds.height === rects.length * 10 - 2,
	);
	const readsStarted = performance.now();
	let reused = true;
	for (let index = 0; index < 10_000; index++)
		reused &&= geometry.getBoundingClientRect(id) === bounds;
	const readsMs = performance.now() - readsStarted;
	check(
		"Ten thousand bounds reads reuse the cached union",
		reused && geometry.metrics().builds === 1,
	);
	const initial = geometry.metrics();
	tree.setTextContent(id, "a");
	check(
		"Mutation rebuilds exactly one fresh snapshot",
		geometry.getBoundingClientRect(id).width === 6 &&
			geometry.metrics().builds === 2,
	);
	check(
		"Old snapshots remain independent values",
		rects.length === profiles[profile] * 2 && bounds.width === 12,
	);
	measurement = {
		buildMs,
		readsMs,
		reads: 10_000,
		initial,
		retainedMemory: retained,
		final: geometry.metrics(),
		peakRssKiB: process.resourceUsage().maxRSS,
	};
	tree.close();
	check(
		"Close clears native retained rectangles",
		geometry.metrics().closed && geometry.metrics().rectangles === 0,
	);
	passed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				profile,
				rows: profiles[profile],
				runtime: process.version,
				cpu: cpus()[0]?.model,
				fixture:
					"in-memory native geometry; no network, guest SDK, forced GC, or Worker acceptance",
				checks,
				passed,
				measurement,
			},
			null,
			2,
		),
	);
}
