import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { layoutDocument } from "../src/document-layout.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentStyles } from "../src/styles.js";

const startedAt = new Date().toISOString();
const workloads = [];
for (const count of [64, 512, 4096]) {
	for (const direction of ["column", "column-reverse"]) {
		for (const sizing of ["definite", "auto"]) {
			const height = count * 24 - 4;
			const document = parseHtmlDocument(
				`<!doctype html><style>html{font-size:8px}main{display:flex;flex-direction:${direction};width:18px;${sizing === "definite" ? `height:${height}px;` : ""}gap:4px;padding:2px;border:1px solid black}main>div{flex:1;min-height:0;background:red}.blue{background:blue}</style><main>${Array.from({ length: count }, (_, index) => `<div${index % 2 ? ' class="blue"' : ""}>ab cd</div>`).join("")}</main>`,
				"https://fixture.invalid/flex-column-scale",
			);
			documentStyles(document).setViewport(64, 80);
			const passes = [];
			try {
				for (let pass = 0; pass < 3; pass++) {
					const start = performance.now();
					const layout = layoutDocument(document);
					const milliseconds = performance.now() - start;
					const items = layout.boxes.filter((box) => box.id > 3);
					if (items.length !== count) throw new Error("Missing column items");
					for (const [index, box] of items.entries()) {
						const position = direction === "column" ? index : count - 1 - index;
						if (
							box.borderX !== 3 ||
							box.borderY !== 3 + position * 24 ||
							box.contentWidth !== 18 ||
							box.contentHeight !== 20
						)
							throw new Error(`Incorrect column item ${index}`);
					}
					const glyphs = layout.contexts.reduce(
						(total, context) => total + context.glyphs.length,
						0,
					);
					if (glyphs !== count * 4 || layout.boxes[2].contentHeight !== height)
						throw new Error("Incorrect column text or container height");
					const raster = rasterizeDocument(document).image;
					const offset = (4 * raster.width + 20) * 4;
					const expected =
						direction === "column" ? "255,0,0,255" : "0,0,255,255";
					if (
						Array.from(raster.pixels.subarray(offset, offset + 4)).join(",") !==
						expected
					)
						throw new Error("Incorrect reversed viewport pixel");
					passes.push({
						pass,
						milliseconds,
						work: layout.metrics.work,
						boxes: layout.boxes.length,
						glyphs,
					});
				}
			} finally {
				document.close();
			}
			workloads.push({
				count,
				direction,
				sizing,
				passes,
				medianMs: passes
					.map((pass) => pass.milliseconds)
					.sort((left, right) => left - right)[1],
			});
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
				"Native synthetic layout only; parsing and verification are excluded from timings, later passes reuse warmed style state. Peak RSS spans sequential workloads. No released SafeJS throughput, real-site, browser resource target, or deployment acceptance.",
		},
		null,
		2,
	),
);
