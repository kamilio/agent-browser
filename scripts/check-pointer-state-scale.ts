import { documentGeometry } from "../src/document-geometry.js";
import { documentHitTesting } from "../src/hit-testing.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads: unknown[] = [];
interface ScalePass {
	firstHoverMs: number;
	sameTargetMs: number;
	downMs: number;
	upMs: number;
	leaveMs: number;
	geometry: ReturnType<ReturnType<typeof documentGeometry>["metrics"]>;
	hits: ReturnType<ReturnType<typeof documentHitTesting>["metrics"]>;
}
for (const count of [64, 512, 4096]) {
	const passes: ScalePass[] = [];
	for (let pass = 0; pass < 3; pass++) {
		const content = Array.from(
			{ length: count },
			(_value, index) => `<div${index === 0 ? ' id="target"' : ""}></div>`,
		).join("");
		const tree = parseHtmlDocument(
			`<style>html,body{margin:0;padding:0}main>div{width:40px;height:2px}#target:hover{width:60px;background:red}#target:active{background:green}</style><main>${content}</main>`,
			"https://fixture.invalid/pointer-state-scale",
		);
		const queries = new DocumentQueries(tree);
		documentStyles(tree).setViewport(100, 80);
		const mouse = documentInteractions(tree).mouse;
		try {
			const target = queries.querySelector("#target");
			if (target === null) throw new Error("Missing scale target");
			const measure = (action: () => unknown) => {
				const start = performance.now();
				action();
				documentGeometry(tree).getBoundingClientRect(target);
				documentHitTesting(tree).elementFromPoint(10, 1);
				return performance.now() - start;
			};
			const firstHoverMs = measure(() => mouse.move(10, 1));
			if (
				!queries.matches(target, ":hover") ||
				documentGeometry(tree).getBoundingClientRect(target).width !== 60
			)
				throw new Error("Hover did not update geometry");
			const before = {
				revision: tree.revision,
				geometry: documentGeometry(tree).metrics().builds,
				hits: documentHitTesting(tree).metrics().builds,
			};
			const sameTargetMs = measure(() => mouse.move(15, 1));
			if (
				tree.revision !== before.revision ||
				documentGeometry(tree).metrics().builds !== before.geometry ||
				documentHitTesting(tree).metrics().builds !== before.hits
			)
				throw new Error("Unchanged pointer state rebuilt owners");
			const downMs = measure(() => mouse.down());
			if (!queries.matches(target, ":active"))
				throw new Error("Primary press did not activate");
			const upMs = measure(() => mouse.up());
			if (queries.matches(target, ":active"))
				throw new Error("Release retained activation");
			const leaveMs = measure(() => mouse.move(90, 70));
			if (
				queries.matches(target, ":hover") ||
				documentGeometry(tree).getBoundingClientRect(target).width !== 40
			)
				throw new Error("Leave did not restore geometry");
			passes.push({
				firstHoverMs,
				sameTargetMs,
				downMs,
				upMs,
				leaveMs,
				geometry: documentGeometry(tree).metrics(),
				hits: documentHitTesting(tree).metrics(),
			});
		} finally {
			queries.close();
			tree.close();
		}
	}
	const median = (
		key: "firstHoverMs" | "sameTargetMs" | "downMs" | "upMs" | "leaveMs",
	) => passes.map((pass) => pass[key]).sort((left, right) => left - right)[1];
	workloads.push({
		count,
		medianFirstHoverMs: median("firstHoverMs"),
		medianSameTargetMs: median("sameTargetMs"),
		medianDownMs: median("downMs"),
		medianUpMs: median("upMs"),
		medianLeaveMs: median("leaveMs"),
		passes,
	});
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			passed: true,
			workloads,
			peakRssKiB: process.resourceUsage().maxRSS,
			profile:
				"Native CSS pointer-state transitions over empty block boxes; three fresh documents per workload, conservative shared-owner invalidation, no guest runtime",
			exclusions:
				"Parsing, viewport setup and assertions excluded. Each action timing includes a native geometry/hit read barrier so deferred style/layout work is consumed. First hover includes cold geometry and style recomputation. Peak RSS is process-wide, not retained-page memory. No raster, network, sites or runtime-throughput claim",
		},
		null,
		2,
	),
);
