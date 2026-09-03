import { cpus } from "node:os";
import { documentGeometry } from "../src/document-geometry.js";
import { documentElementSizes } from "../src/element-sizes.js";
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
	`<!doctype html><style>main{width:200px;font-size:8px}p{width:50%;padding:5%;margin:0 auto}</style><main>${content}</main>`,
	"https://fixture.invalid/element-size-resources",
);
const queries = new DocumentQueries(tree);
const geometry = documentGeometry(tree);
const sizes = documentElementSizes(tree);
const checks: { label: string; passed: boolean }[] = [];
let measurement: unknown;
let passed = false;
function check(label: string, value: boolean) {
	checks.push({ label, passed: value });
	if (!value) throw new Error(label);
}
try {
	const targets = queries.querySelectorAll("p");
	check("All fixture rows are present", targets.length === rows);
	const started = performance.now();
	let correct = 0;
	for (const id of targets) {
		const value = sizes.get(id);
		if (
			value.clientWidth === 120 &&
			value.offsetWidth === 120 &&
			value.clientHeight === 30
		)
			correct++;
	}
	const layoutAndReadMs = performance.now() - started;
	check("Every row has actual padding-box dimensions", correct === rows);
	const before = sizes.metrics();
	const reading = performance.now();
	const last = targets[targets.length - 1];
	let total = 0;
	for (let index = 0; index < 100_000; index++)
		total += sizes.get(last).offsetWidth;
	const repeatedReadMs = performance.now() - reading;
	check(
		"One hundred thousand cached reads retain correct values",
		total === 12_000_000,
	);
	check(
		"Cached reads do not rescan or remeasure",
		sizes.metrics().work === before.work &&
			sizes.metrics().measurements === before.measurements,
	);
	check(
		"One shared layout snapshot serves all rows",
		geometry.metrics().builds === 1,
	);
	check(
		"Only requested elements acquire size records",
		sizes.metrics().retained === rows,
	);
	measurement = {
		rows,
		nodes: tree.nodeCount,
		layoutAndReadMs,
		repeatedReadMs,
		sizes: sizes.metrics(),
		geometry: geometry.metrics(),
		memory: process.memoryUsage(),
		peakRssKiB: process.resourceUsage().maxRSS,
	};
	tree.close();
	check(
		"Close releases all cached size records",
		sizes.metrics().retained === 0 && geometry.metrics().rectangles === 0,
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
					"native in-memory HTML; no SDK, network, forced GC or Worker acceptance",
				passed,
				checks,
				measurement,
			},
			null,
			2,
		),
	);
}
