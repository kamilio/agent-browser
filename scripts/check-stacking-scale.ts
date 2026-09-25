import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { layoutDocument } from "../src/document-layout.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { layoutContentItems } from "../src/layout-paint-order.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const workload of [
	{ count: 64, nested: false },
	{ count: 512, nested: false },
	{ count: 2048, nested: false },
	{ count: 4096, nested: false },
	{ count: 64, nested: true },
]) {
	const { count, nested } = workload;
	const levels = Array.from({ length: count }, (_, index) => (index % 9) - 4);
	const content =
		levels
			.map(
				(level) =>
					`<div class="target" style="z-index:${level}">AB${nested ? "" : "</div>"}`,
			)
			.join("") + (nested ? "</div>".repeat(count) : "");
	const document = parseHtmlDocument(
		`<style>html{font-size:8px}main{position:relative;z-index:0;width:100px}.target{position:relative;left:1px;top:1px;height:10px;width:20px}</style><main id="root">${content}</main>`,
		"https://fixture.invalid/stacking-scale",
	);
	try {
		documentStyles(document).setViewport(160, 160);
		const queries = new DocumentQueries(document);
		const targets = queries.querySelectorAll(".target");
		const indices = new Map(
			targets.map((id, index) => [document.reference(id), index]),
		);
		const root = queries.querySelector("#root");
		if (indices.size !== count || root === null)
			throw Error("Missing scale nodes");
		const expected = Array.from({ length: count }, (_, index) => index);
		if (!nested)
			expected.sort(
				(left, right) => levels[left] - levels[right] || left - right,
			);
		const passes = [];
		for (let pass = 0; pass < 3; pass++) {
			document.setAttribute(root, "data-pass", String(pass));
			const layoutStart = performance.now();
			const layout = layoutDocument(document);
			const layoutMilliseconds = performance.now() - layoutStart;
			let work = 0;
			let glyphs = 0;
			const actual: number[] = [];
			const paintStart = performance.now();
			for (const item of layoutContentItems(layout, (amount = 1) => {
				work += amount;
				if (work > 2_000_000) throw Error("Stacking paint work limit exceeded");
			})) {
				if (item.kind === "glyph") glyphs++;
				if (item.kind === "box" && item.box.ref) {
					const index = indices.get(item.box.ref);
					if (index !== undefined) actual.push(index);
				}
			}
			const paintMilliseconds = performance.now() - paintStart;
			if (
				glyphs !== count * 2 ||
				actual.length !== count ||
				actual.some((index, position) => index !== expected[position])
			)
				throw Error(
					"Incorrect stacking order or duplicate/missing paint records",
				);
			passes.push({
				pass,
				layoutMilliseconds,
				paintMilliseconds,
				layoutWork: layout.metrics.work,
				paintWork: work,
				boxes: layout.boxes.length,
				glyphs,
			});
		}
		workloads.push({
			...workload,
			passes,
			medianLayoutMs: passes
				.map((pass) => pass.layoutMilliseconds)
				.sort((left, right) => left - right)[1],
			medianPaintMs: passes
				.map((pass) => pass.paintMilliseconds)
				.sort((left, right) => left - right)[1],
		});
	} finally {
		document.close();
	}
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			passed: true,
			workloads,
			peakRssKiB: resourceUsage().maxRSS,
			limitations:
				"Native fresh-revision layout and stacking record enumeration. Parsing and ID lookup excluded; paint timing includes counting and budget checks but not final sequence verification or rasterization. Layout work is not aggregate parser/style CPU work. Sequence peak RSS is not retained-page memory. No SafeJS throughput, real-site, live UI or deployment acceptance.",
		},
		null,
		2,
	),
);
