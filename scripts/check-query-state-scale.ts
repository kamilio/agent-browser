import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";

const startedAt = new Date().toISOString();
const workloads: unknown[] = [];
for (const count of [64, 512, 4096]) {
	for (const labels of [false, true]) {
		const passes: {
			milliseconds: number;
			oracleComparisons: number;
			metrics: ReturnType<DocumentQueries["metrics"]>;
		}[] = [];
		for (let pass = 0; pass < 3; pass++) {
			const first = labels
				? '<label id="target" for="control"></label>'
				: '<div id="target"></div>';
			const content = `${first}<div id="other"></div>${"<div></div>".repeat(count - 2)}${labels ? '<input id="control">' : ""}`;
			const tree = parseHtmlDocument(
				`<main>${content}</main>`,
				"https://fixture.invalid/query-state-scale",
			);
			const queries = new DocumentQueries(tree);
			try {
				const target = queries.querySelector("#target");
				const other = queries.querySelector("#other");
				if (target === null || other === null)
					throw new Error("Missing scale targets");
				let milliseconds = 0;
				let oracleComparisons = 0;
				for (let turn = 0; turn < 32; turn++) {
					tree.setPointerState(
						turn % 2 ? other : target,
						turn % 3 ? target : null,
					);
					tree.setTargetElement(turn % 5 ? target : other);
					const start = performance.now();
					const actual = queries.querySelectorAll(":hover, :active, :target");
					milliseconds += performance.now() - start;
					const fresh = new DocumentQueries(tree);
					try {
						const expected = fresh.querySelectorAll(":hover, :active, :target");
						if (
							actual.length !== expected.length ||
							actual.some((value, index) => value !== expected[index])
						)
							throw new Error("Cached query differs from full rebuild");
						oracleComparisons++;
					} finally {
						fresh.close();
					}
				}
				passes.push({
					milliseconds,
					oracleComparisons,
					metrics: queries.metrics(),
				});
			} finally {
				queries.close();
				tree.close();
			}
		}
		const ordered = passes
			.map((pass) => pass.milliseconds)
			.sort((left, right) => left - right);
		workloads.push({ count, labels, median32QueriesMs: ordered[1], passes });
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
				"32 interaction-state query transitions per fresh document; three runs at each size, with/without label forwarding, each compared with a fresh query owner",
			exclusions:
				"Native selector-only measurement, no events/layout/raster/SafeJS/network. Parsing, setup, state mutation and fresh-oracle time excluded. Timed work includes matching and any index/state/control-owner refresh it requires. Peak RSS includes oracle work and is not retained-page memory",
		},
		null,
		2,
	),
);
