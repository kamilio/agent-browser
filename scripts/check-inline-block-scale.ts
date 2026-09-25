import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { AgentBrowserError } from "../src/errors.js";
import { layoutDocument } from "../src/document-layout.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentQueries } from "../src/selectors.js";

const startedAt = new Date().toISOString();
function nested(depth: number, branches: number, start = 0): string {
	return `<span class="atom" data-height="${20 * branches ** depth}" data-y="${20 * start}">${Array.from({ length: branches }, (_, index) => `<div>${depth === 1 ? "ab<br>cd" : nested(depth - 1, branches, start + index * branches ** (depth - 1))}</div>`).join("")}</span>`;
}
const shapes = [
	...[64, 512, 2048, 4096].map((count) => ({
		name: `flat-${count}`,
		content: '<span class="atom">ab<br>cd</span>'.repeat(count),
		glyphs: count * 4,
		nested: false,
	})),
	...[
		{ depth: 8, branches: 1 },
		{ depth: 3, branches: 3 },
	].map(({ depth, branches }) => ({
		name: `nested-${branches}-${depth}`,
		content: nested(depth, branches),
		glyphs: 4 * branches ** depth,
		nested: true,
	})),
];
const workloads = [];
for (const shape of shapes) {
	const document = parseHtmlDocument(
		`<style>html{font-size:8px}main{width:120px}.atom{display:inline-block}</style><main>${shape.content}</main>`,
		"https://fixture.invalid/inline-block-scale",
	);
	try {
		const atoms = new DocumentQueries(document)
			.querySelectorAll(".atom")
			.map((id, index) => ({
				ref: document.reference(id),
				x: shape.nested ? 0 : (index % 10) * 12,
				y: shape.nested
					? Number(document.get(id).attributes["data-y"])
					: Math.floor(index / 10) * 20,
				height: shape.nested
					? Number(document.get(id).attributes["data-height"])
					: 20,
			}));
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
				for (const atom of atoms) {
					const box = boxes.get(atom.ref);
					if (
						!box ||
						box.borderX !== atom.x ||
						box.borderY !== atom.y ||
						box.borderBoxWidth !== 12 ||
						box.borderBoxHeight !== atom.height
					)
						throw Error(`Incorrect atomic geometry ${shape.name}`);
				}
				if (
					result.metrics.glyphs !== shape.glyphs ||
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
			name: shape.name,
			atoms: atoms.length,
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
