import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { initialFlowStyle } from "../src/css-flow.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const mode of ["implicit", "neutral", "non-neutral"] as const) {
	for (const count of [64, 512, 4096]) {
		const rule =
			mode === "implicit"
				? ""
				: mode === "neutral"
					? ".target{position:static;float:none;clear:none;overflow:visible}"
					: ".target{position:absolute;overflow:hidden}";
		const document = parseHtmlDocument(
			`<style>${rule}</style><main id="root">${'<div class="target">A</div>'.repeat(count)}</main>`,
			"https://fixture.invalid/flow-style-scale",
		);
		try {
			const queries = new DocumentQueries(document);
			const targets = queries.querySelectorAll(".target");
			const root = queries.querySelector("#root");
			if (targets.length !== count || root === null)
				throw Error("Missing scale nodes");
			const styles = documentStyles(document);
			const passes = [];
			for (let pass = 0; pass < 3; pass++) {
				document.setAttribute(root, "data-pass", String(pass));
				const start = performance.now();
				const values = targets.map((target) => styles.flow(target));
				const milliseconds = performance.now() - start;
				for (const value of values) {
					if (
						value.position !==
							(mode === "non-neutral" ? "absolute" : "static") ||
						value.float !== "none" ||
						value.clear !== "none" ||
						value["overflow-x"] !==
							(mode === "non-neutral" ? "hidden" : "visible") ||
						value["overflow-y"] !==
							(mode === "non-neutral" ? "hidden" : "visible") ||
						!Object.isFrozen(value)
					)
						throw Error("Incorrect computed flow values");
					if (mode === "implicit" && value !== initialFlowStyle)
						throw Error("Implicit defaults were unnecessarily copied");
				}
				const metrics = styles.metrics();
				if (Object.keys(metrics.issues).length)
					throw Error("Known declarations produced parser diagnostics");
				passes.push({
					pass,
					milliseconds,
					work: metrics.work,
					declarations: metrics.declarations,
				});
			}
			workloads.push({
				mode,
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
				"Native cascade and computed-value reads only, with a fresh document revision per pass. Parsing, ID lookup and value verification excluded. Non-neutral cases measure values, not unsupported layout. Sequence RSS is not retained-page memory. No SafeJS throughput, real-site, rendering or deployment acceptance.",
		},
		null,
		2,
	),
);
