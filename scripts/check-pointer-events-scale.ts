import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { documentHitTesting } from "../src/hit-testing.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const mode of ["auto", "none", "override"] as const) {
	for (const count of [64, 512, 4096]) {
		const children = mode === "override" ? '<div class="child"></div>' : "";
		const document = parseHtmlDocument(
			`<style>.target{height:2px;width:20px}.child{height:1px;width:10px;pointer-events:auto}</style><main id="root">${`<div class="target">${children}</div>`.repeat(count)}</main>`,
			"https://fixture.invalid/pointer-scale",
		);
		try {
			documentStyles(document).setViewport(100, count * 2 + 20);
			const queries = new DocumentQueries(document);
			const root = queries.querySelector("#root");
			const body = queries.querySelector("body");
			const targets = queries.querySelectorAll(
				mode === "override" ? ".child" : ".target",
			);
			if (root === null || body === null || targets.length !== count)
				throw Error("Missing scale nodes");
			const hits = documentHitTesting(document);
			const passes = [];
			for (let pass = 0; pass < 3; pass++) {
				document.setAttribute(
					root,
					"style",
					`pointer-events:${mode === "auto" ? "auto" : "none"};--revision:${pass}`,
				);
				const start = performance.now();
				const first = hits.elementFromPoint(5, 0.5);
				const buildMilliseconds = performance.now() - start;
				const initial = hits.metrics();
				if (first !== (mode === "none" ? body : targets[0]))
					throw Error("Incorrect first pointer target");
				const queryStart = performance.now();
				const middle = hits.elementFromPoint(
					5,
					Math.floor(count / 2) * 2 + 0.5,
				);
				const last = hits.elementFromPoint(5, (count - 1) * 2 + 0.5);
				const queryMilliseconds = performance.now() - queryStart;
				if (
					middle !==
						(mode === "none" ? body : targets[Math.floor(count / 2)]) ||
					last !== (mode === "none" ? body : targets[count - 1])
				)
					throw Error("Incorrect cached pointer target");
				const final = hits.metrics();
				if (final.builds !== initial.builds)
					throw Error("Repeated reads rebuilt the hit regions");
				passes.push({
					pass,
					buildMilliseconds,
					queryMilliseconds,
					regions: final.regions,
					work: final.work,
					builds: final.builds,
				});
			}
			workloads.push({
				mode,
				count,
				passes,
				medianBuildMs: passes
					.map((pass) => pass.buildMilliseconds)
					.sort((left, right) => left - right)[1],
			});
		} finally {
			document.close();
		}
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
				"Native first-hit timing includes invalidated style/layout/scroll/region work; root inline style and an inherited custom property change each pass. Parsing and ID lookup excluded. Two cached reads are verified, not a runtime throughput benchmark. Empty boxes isolate region filtering, not text/raster performance. Sequence peak RSS is not retained-page memory. No SafeJS, real-site or deployment acceptance.",
		},
		null,
		2,
	),
);
