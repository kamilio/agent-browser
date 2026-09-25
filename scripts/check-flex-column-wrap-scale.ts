import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { layoutDocument } from "../src/document-layout.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { measureIntrinsicWidths } from "../src/intrinsic-widths.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const count of [64, 512, 4096]) {
	for (const direction of ["column", "column-reverse"]) {
		for (const wrap of ["wrap", "wrap-reverse"]) {
			const document = parseHtmlDocument(
				`<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:${direction};flex-wrap:${wrap};width:640px;height:92px;gap:4px 2px;align-content:flex-start;padding:2px;border:1px solid black}main>div{width:18px;height:20px;flex:none;background:red}.blue{background:blue}</style><main>${Array.from({ length: count }, (_, index) => `<div${index % 2 ? ' class="blue"' : ""}>ab cd</div>`).join("")}</main>`,
				"https://fixture.invalid/flex-column-wrap-scale",
			);
			documentStyles(document).setViewport(128, 128);
			const passes = [];
			try {
				const intrinsicStart = performance.now();
				const intrinsic = measureIntrinsicWidths(document);
				const intrinsicMs = performance.now() - intrinsicStart;
				const container = intrinsic.widths.find((entry) => entry.id === 3);
				if (
					container?.minContent !== 18 ||
					container.maxContent !== (count / 4) * 20 - 2
				)
					throw new Error("Incorrect multi-column intrinsic measurement");
				for (let pass = 0; pass < 3; pass++) {
					const start = performance.now();
					const layout = layoutDocument(document);
					const milliseconds = performance.now() - start;
					const items = layout.boxes.filter((box) => box.id > 3);
					if (items.length !== count) throw new Error("Missing wrapped items");
					for (const [index, box] of items.entries()) {
						const column = Math.floor(index / 4);
						const row = index % 4;
						const x = 3 + (wrap === "wrap" ? column * 20 : 622 - column * 20);
						const y = 3 + (direction === "column" ? row * 24 : 72 - row * 24);
						if (
							box.borderX !== x ||
							box.borderY !== y ||
							box.contentWidth !== 18 ||
							box.contentHeight !== 20
						)
							throw new Error(`Incorrect wrapped item ${index}`);
					}
					const glyphs = layout.contexts.reduce(
						(total, context) => total + context.glyphs.length,
						0,
					);
					if (glyphs !== count * 4 || layout.boxes[2].contentHeight !== 92)
						throw new Error("Incorrect wrapped text or container height");
					const image = rasterizeDocument(document).image;
					const sample = items.findIndex(
						(box) => box.borderX >= 0 && box.borderX + 18 < image.width,
					);
					if (sample >= 0) {
						const box = items[sample];
						const offset =
							((box.borderY + 1) * image.width + box.borderX + 17) * 4;
						const expected = sample % 2 ? "0,0,255,255" : "255,0,0,255";
						if (
							[...image.pixels.subarray(offset, offset + 4)].join(",") !==
							expected
						)
							throw new Error("Incorrect wrapped viewport pixel");
					} else if (wrap !== "wrap-reverse" || count !== 64)
						throw new Error("Unexpectedly empty viewport");
					passes.push({
						pass,
						milliseconds,
						work: layout.metrics.work,
						boxes: layout.boxes.length,
						glyphs,
						viewportSample: sample,
					});
				}
				workloads.push({
					count,
					direction,
					wrap,
					intrinsic: {
						milliseconds: intrinsicMs,
						work: intrinsic.metrics.work,
						minContent: container.minContent,
						maxContent: container.maxContent,
					},
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
				"Synthetic native layout and intrinsic sizing, not released SafeJS throughput. Parsing and verification are outside timings. Layout runs after intrinsic measurement with warmed styles; later passes also reuse style state. Peak RSS spans sequential workloads, not per-document retained memory. No public-site, resource-target or deployment acceptance.",
		},
		null,
		2,
	),
);
