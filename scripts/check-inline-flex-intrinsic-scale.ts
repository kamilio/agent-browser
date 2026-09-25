import { performance } from "node:perf_hooks";
import { resourceUsage } from "node:process";
import { parseHtmlDocument } from "../src/html-parser.js";
import { measureIntrinsicWidths } from "../src/intrinsic-widths.js";
import { DocumentQueries } from "../src/selectors.js";

const startedAt = new Date().toISOString();
const workloads = [];
function nested(depth: number, branches: number): string {
	return `<span class="atom" data-depth="${depth}">${Array.from({ length: branches }, () => `<div>${depth === 1 ? "ab cd" : nested(depth - 1, branches)}</div>`).join("")}</span>`;
}
const shapes = [
	...[64, 512, 4096].map((count) => ({
		name: `flat-${count}`,
		content: '<span class="atom"><div>ab cd</div><div>ef</div></span>'.repeat(
			count,
		),
		minimum: 27,
		maximum: count * 45,
		branches: 0,
	})),
	...[
		{ depth: 8, branches: 1 },
		{ depth: 4, branches: 3 },
		{ depth: 3, branches: 8 },
	].map(({ depth, branches }) => ({
		name: `nested-${branches}-${depth}`,
		content: nested(depth, branches),
		minimum: 15 * branches ** depth - 3,
		maximum: 33 * branches ** depth - 3,
		branches,
	})),
];
for (const shape of shapes) {
	const document = parseHtmlDocument(
		`<!doctype html><style>html{font-size:8px}.atom{display:inline-flex;gap:3px}</style><main id="host">${shape.content}</main>`,
		"https://fixture.invalid/inline-flex-intrinsic-scale",
	);
	try {
		const query = new DocumentQueries(document);
		const host = query.querySelector("#host");
		if (host === null) throw new Error("Missing host");
		const hostRef = document.reference(host);
		const atoms = query.querySelectorAll(".atom").map((id) => {
			const ref = document.reference(id);
			const depth = Number(document.resolve(ref).attributes["data-depth"] ?? 0);
			return {
				ref,
				minimum: shape.branches ? 15 * shape.branches ** depth - 3 : 27,
				maximum: shape.branches ? 33 * shape.branches ** depth - 3 : 45,
			};
		});
		const passes = [];
		for (let pass = 0; pass < 3; pass++) {
			const start = performance.now();
			const result = measureIntrinsicWidths(document);
			const milliseconds = performance.now() - start;
			const records = new Map(
				result.widths
					.filter((record) => record.ref)
					.map((record) => [record.ref, record]),
			);
			const parent = records.get(hostRef);
			if (
				parent?.minContent !== shape.minimum ||
				parent.maxContent !== shape.maximum
			)
				throw new Error(`Incorrect intrinsic parent ${shape.name}`);
			for (const atom of atoms) {
				const measured = records.get(atom.ref);
				if (
					measured?.minContent !== atom.minimum ||
					measured.maxContent !== atom.maximum
				)
					throw new Error(`Incorrect intrinsic atom ${shape.name}`);
			}
			if (
				new Set(result.widths.map((record) => record.id)).size !==
					result.widths.length ||
				result.metrics.minText.glyphs ||
				result.metrics.maxText.glyphs
			)
				throw new Error("Duplicated boxes or fabricated glyphs");
			passes.push({
				pass,
				milliseconds,
				work: result.metrics.work,
				boxes: result.metrics.boxes,
				minimumTokens: result.metrics.minText.tokens,
				maximumTokens: result.metrics.maxText.tokens,
			});
		}
		workloads.push({
			name: shape.name,
			atoms: atoms.length,
			minimum: shape.minimum,
			maximum: shape.maximum,
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
				"Synthetic intrinsic widths only: no used inline-flex layout, pixels or hit targets are claimed. Parsing and verification are outside timings; repeated passes reuse warmed styles. RSS spans sequential workloads, not retained document memory. No released SafeJS throughput, real-site, browser resource target or deployment acceptance.",
		},
		null,
		2,
	),
);
