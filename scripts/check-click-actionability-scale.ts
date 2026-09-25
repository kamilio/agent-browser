import { findClickPoint } from "../src/click-target.js";
import { documentGeometry } from "../src/document-geometry.js";
import { documentScroll } from "../src/document-scroll.js";
import { documentHitTesting } from "../src/hit-testing.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads: unknown[] = [];
for (const count of [64, 512, 4096]) {
	for (const covered of [false, true]) {
		const passes = [];
		for (let pass = 0; pass < 3; pass++) {
			const content = Array.from(
				{ length: count },
				(_value, index) => `<div${index === 0 ? ' id="target"' : ""}></div>`,
			).join("");
			const source = `<style>html,body{margin:0;padding:0}main>div{width:40px;height:2px}#cover{position:relative;top:-${count * 2}px;width:40px;height:${count * 2}px;z-index:1}</style><main>${content}</main>${covered ? '<div id="cover"></div>' : ""}`;
			const tree = parseHtmlDocument(
				source,
				"https://fixture.invalid/click-scale",
			);
			const queries = new DocumentQueries(tree);
			documentStyles(tree).setViewport(100, 80);
			try {
				const target = queries.querySelector("#target");
				if (target === null) throw new Error("Missing scale target");
				const scrollOwner = documentScroll(tree);
				const expected = (result: ReturnType<typeof findClickPoint>) =>
					covered
						? result.blocked === "covered" && result.points === 3
						: result.point?.x === 20 &&
							result.point.y === 1 &&
							result.points === 1;
				const start = performance.now();
				const first = findClickPoint(tree, target);
				const firstMs = performance.now() - start;
				if (!expected(first))
					throw new Error("Incorrect initial receiving-point result");
				const geometry = documentGeometry(tree).metrics();
				const hits = documentHitTesting(tree).metrics();
				const scroll = scrollOwner.metrics();
				const cachedStart = performance.now();
				for (let read = 0; read < 2; read++)
					if (!expected(findClickPoint(tree, target)))
						throw new Error("Incorrect cached receiving-point result");
				const cachedMs = performance.now() - cachedStart;
				if (
					documentGeometry(tree).metrics().builds !== geometry.builds ||
					documentHitTesting(tree).metrics().builds !== hits.builds ||
					documentScroll(tree).metrics().builds !== scroll.builds
				)
					throw new Error("Cached receiving-point reads rebuilt layout owners");
				passes.push({
					firstMs,
					twoCachedReadsMs: cachedMs,
					points: first.points,
					geometry,
					hits,
					scroll,
				});
			} finally {
				queries.close();
				tree.close();
			}
		}
		const ordered = passes
			.map((pass) => pass.firstMs)
			.sort((left, right) => left - right);
		workloads.push({ count, covered, medianFirstMs: ordered[1], passes });
	}
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
				"Native receiving-point lookup over empty block boxes; three fresh documents per workload and two cached reads per pass",
			exclusions:
				"Parsing and viewport setup excluded from first-read timings. Cold reads include style/layout/geometry/hit/root-scroll work. No SafeJS, pointer dispatch, network, rasterization, real sites or retained-page memory claim",
		},
		null,
		2,
	),
);
