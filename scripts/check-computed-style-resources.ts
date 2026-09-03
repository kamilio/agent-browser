import { cpus } from "node:os";
import { resolvedStyleValue } from "../src/computed-styles.js";
import { documentGeometry } from "../src/document-geometry.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";

const rows = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(rows) || rows < 1 || rows > 5000)
	throw new Error("Expected 1 through 5000 rows");
const startedAt = new Date().toISOString();
const content = Array.from(
	{ length: rows },
	(_value, index) => `<p id="row-${index}">alpha <span>beta</span></p>`,
).join("");
const tree = parseHtmlDocument(
	`<style>main{width:200px;font-size:8px} p{width:50%;padding:5%;margin:0 auto}</style><main>${content}</main>`,
	"https://fixture.invalid/computed-style-resources",
);
const queries = new DocumentQueries(tree);
const geometry = documentGeometry(tree);
const checks: { label: string; passed: boolean }[] = [];
let measurement: unknown;
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
try {
	const id = queries.querySelector(`#row-${rows - 1}`);
	if (id === null) throw new Error("Missing final row");
	const started = performance.now();
	check(
		"Layout-free color resolution",
		resolvedStyleValue(tree, id, "color") === "rgb(0, 0, 0)" &&
			geometry.metrics().builds === 0,
	);
	check(
		"Last row resolves used percentage width",
		resolvedStyleValue(tree, id, "width") === "100px",
	);
	const layoutMs = performance.now() - started;
	const reading = performance.now();
	let correct = 0;
	for (let index = 0; index < 10_000; index++) {
		if (
			resolvedStyleValue(tree, id, "width") === "100px" &&
			resolvedStyleValue(tree, id, "padding-left") === "10px"
		)
			correct++;
	}
	const repeatedReadMs = performance.now() - reading;
	check(
		"Twenty thousand resolved reads retain correct values",
		correct === 10_000,
	);
	check("One layout build for all reads", geometry.metrics().builds === 1);
	check(
		"Used style records are bounded by the owned element tree",
		geometry.metrics().usedStyles <= tree.nodeCount,
	);
	const before = geometry.metrics();
	measurement = {
		rows,
		nodes: tree.nodeCount,
		layoutMs,
		repeatedReadMs,
		geometry: before,
		memory: process.memoryUsage(),
		peakRssKiB: process.resourceUsage().maxRSS,
	};
	tree.close();
	check(
		"Close releases resolved style and rectangle caches",
		geometry.metrics().usedStyles === 0 && geometry.metrics().rectangles === 0,
	);
	passed = true;
} finally {
	tree.close();
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				runtime: process.version,
				cpu: cpus()[0]?.model,
				fixture:
					"native in-memory HTML; no network, SDK, forced GC or Worker acceptance",
				passed,
				checks,
				measurement,
			},
			null,
			2,
		),
	);
}
