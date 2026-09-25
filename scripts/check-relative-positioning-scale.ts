import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { layoutDocument } from "../src/document-layout.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { layoutContentItems } from "../src/layout-paint-order.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const count of [64, 512, 2048, 4096]) {
	const document = parseHtmlDocument(
		`<style>html{font-size:8px}main{width:100px}.target{position:relative;left:3px;top:2px;height:10px;width:20px}</style><main id="root">${'<div class="target">AB</div>'.repeat(count)}</main>`,
		"https://fixture.invalid/relative-scale",
	);
	try {
		documentStyles(document).setViewport(160, 160);
		const queries = new DocumentQueries(document);
		const targets = new Set(
			queries.querySelectorAll(".target").map((id) => document.reference(id)),
		);
		const root = queries.querySelector("#root");
		if (targets.size !== count || root === null)
			throw Error("Missing scale nodes");
		const passes = [];
		for (let pass = 0; pass < 3; pass++) {
			document.setAttribute(root, "data-pass", String(pass));
			const start = performance.now();
			const layout = layoutDocument(document);
			const milliseconds = performance.now() - start;
			let index = 0;
			for (const box of layout.boxes) {
				if (!box.ref || !targets.has(box.ref)) continue;
				if (
					box.borderX !== 3 ||
					box.borderY !== index * 10 + 2 ||
					box.borderBoxWidth !== 20 ||
					box.borderBoxHeight !== 10
				)
					throw Error("Incorrect scaled relative geometry");
				index++;
			}
			if (
				index !== count ||
				layout.relativePositions?.length !== count ||
				layout.flowHeight !== count * 10
			)
				throw Error("Missing scaled boxes or modified normal flow");
			let paintWork = 0;
			let glyphs = 0;
			let paintedBoxes = 0;
			const paintStart = performance.now();
			for (const item of layoutContentItems(layout, (amount = 1) => {
				paintWork += amount;
				if (paintWork > 2_000_000)
					throw Error("Scaled paint work limit exceeded");
			})) {
				if (item.kind === "glyph") glyphs++;
				if (item.kind === "box" && item.box.ref && targets.has(item.box.ref))
					paintedBoxes++;
			}
			const paintMilliseconds = performance.now() - paintStart;
			if (glyphs !== count * 2 || paintedBoxes !== count)
				throw Error("Duplicate or omitted positioned paint records");
			passes.push({
				pass,
				milliseconds,
				paintMilliseconds,
				work: layout.metrics.work,
				paintWork,
				glyphs,
				boxes: layout.boxes.length,
			});
		}
		workloads.push({
			count,
			passes,
			medianMs: passes
				.map((pass) => pass.milliseconds)
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
				"Fresh-revision native layout and paint record enumeration, not rasterization or guest throughput. Parsing, ID lookup and geometry verification excluded from layout timing. Paint enumeration includes counting and budget checks. Sequence peak RSS is not retained-page memory. No real-site or deployment acceptance.",
		},
		null,
		2,
	),
);
