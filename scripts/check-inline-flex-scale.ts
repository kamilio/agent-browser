import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { AgentBrowserError } from "../src/errors.js";
import { layoutDocument } from "../src/document-layout.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const count of [64, 256, 512, 1024, 2048, 4096]) {
	const document = parseHtmlDocument(
		`<style>html{font-size:8px}main{width:270px}.atom{display:inline-flex;gap:3px}</style><main>${'<span class="atom"><div>aa</div><div>bb</div></span>'.repeat(count)}</main>`,
		"https://fixture.invalid/inline-flex-scale",
	);
	try {
		const references = new DocumentQueries(document)
			.querySelectorAll(".atom")
			.map((id) => document.reference(id));
		const passes = [];
		let rejection:
			| { code: string; message: string; milliseconds: number }
			| undefined;
		for (let pass = 0; pass < 3; pass++) {
			const start = performance.now();
			try {
				const result = layoutDocument(document);
				const milliseconds = performance.now() - start;
				const boxes = new Map(result.boxes.map((box) => [box.ref, box]));
				for (const [index, reference] of references.entries()) {
					const box = boxes.get(reference);
					if (
						!box ||
						box.borderX !== (index % 10) * 27 ||
						box.borderY !== Math.floor(index / 10) * 10 ||
						box.borderBoxWidth !== 27 ||
						box.borderBoxHeight !== 10
					)
						throw Error("Incorrect atomic geometry");
				}
				if (
					result.metrics.glyphs !== count * 4 ||
					result.boxes.length !== count * 3 + 3 ||
					new Set(result.boxes.map((box) => box.id)).size !==
						result.boxes.length ||
					result.text.horizontal.atomicLayouts
				)
					throw Error("Incorrect output ownership");
				passes.push({
					pass,
					milliseconds,
					work: result.metrics.work,
					boxes: result.boxes.length,
					glyphs: result.metrics.glyphs,
				});
			} catch (error) {
				if (
					!(error instanceof AgentBrowserError) ||
					error.code !== "resource-limit"
				)
					throw error;
				rejection = {
					code: error.code,
					message: error.message,
					milliseconds: performance.now() - start,
				};
				break;
			}
		}
		workloads.push({
			count,
			accepted: !rejection,
			passes,
			...(rejection
				? { rejection }
				: {
						medianMs: passes
							.map((pass) => pass.milliseconds)
							.sort((left, right) => left - right)[1],
					}),
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
			acceptedAll: workloads.every((workload) => workload.accepted),
			workloads,
			peakRssKiB: resourceUsage().maxRSS,
			limitations:
				"Synthetic used geometry only. Resource rejections are not acceptance passes. Parsing and verification excluded; warmed styles reused. RSS spans all workloads. No released SafeJS throughput, pixels, real-site or deployment acceptance.",
		},
		null,
		2,
	),
);
