import {
	flexLineLimits,
	resolveFlexLines,
	type FlexLineItemInput,
	type FlexLineOptions,
} from "../src/index.js";

const startedAt = new Date().toISOString();
const workloads: {
	name: string;
	items: FlexLineItemInput[];
	mainSize: number;
	options?: FlexLineOptions;
}[] = [
	{
		name: "maximum-count growth",
		items: Array.from({ length: 4096 }, () => ({
			baseSize: 1,
			minSize: 0,
			grow: 1,
		})),
		mainSize: 8192,
	},
	{
		name: "maximum-count wrapping",
		items: Array.from({ length: 4096 }, () => ({
			baseSize: 25,
			minSize: 0,
			grow: 1,
		})),
		mainSize: 100,
		options: { wrap: true, gap: 1 },
	},
	{
		name: "maximum-count constrained growth",
		items: Array.from({ length: 4096 }, (_, index) => ({
			baseSize: 10,
			minSize: 0,
			maxSize: 10 + (index % 101),
			grow: 1,
		})),
		mainSize: 4096 * 55,
	},
	{
		name: "maximum-count scaled shrink",
		items: Array.from({ length: 4096 }, (_, index) => ({
			baseSize: 10 + (index % 101),
			minSize: index % 10,
			shrink: 1 + (index % 5),
		})),
		mainSize: 4096 * 20,
	},
];
let passed = false;
const measurements: {
	name: string;
	items: number;
	lines: number;
	iterations: number;
	work: number;
	timingsMs: number[];
	medianMs: number;
}[] = [];
try {
	for (const workload of workloads) {
		const timingsMs: number[] = [];
		let fingerprint: string | undefined;
		for (let repeat = 0; repeat < 5; repeat++) {
			const started = performance.now();
			const result = resolveFlexLines(
				workload.items,
				workload.mainSize,
				workload.options,
			);
			timingsMs.push(performance.now() - started);
			const seen = new Set<number>();
			for (const line of result.lines) {
				let occupied = (line.items.length - 1) * result.gap;
				for (const item of line.items) {
					const source = workload.items[item.index];
					if (
						seen.has(item.index) ||
						item.contentSize < source.minSize ||
						item.contentSize > (source.maxSize ?? Number.POSITIVE_INFINITY) ||
						!Number.isFinite(item.mainOffset)
					)
						throw new Error("Invalid flex item allocation");
					seen.add(item.index);
					occupied += item.outerSize;
				}
				if (
					Math.abs(occupied + line.remainingFreeSpace - workload.mainSize) >
						0.000001 ||
					line.iterations > line.items.length
				)
					throw new Error("Invalid flex line conservation/progress");
			}
			if (
				seen.size !== workload.items.length ||
				result.metrics.work > flexLineLimits.maxWork
			)
				throw new Error("Incomplete or unbounded flex layout");
			const serialized = JSON.stringify(result);
			if (fingerprint !== undefined && fingerprint !== serialized)
				throw new Error("Nondeterministic flex allocation");
			fingerprint = serialized;
			if (repeat === 4)
				measurements.push({
					name: workload.name,
					items: result.metrics.items,
					lines: result.lines.length,
					iterations: result.metrics.iterations,
					work: result.metrics.work,
					timingsMs,
					medianMs: [...timingsMs].sort((first, second) => first - second)[2],
				});
		}
	}
	passed = true;
} finally {
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				measurements,
				limits: flexLineLimits,
				runtime:
					"Native TypeScript main-line solver only; no SafeJS page execution",
				limitations:
					"Not DOM flexbox rendering, intrinsic sizing, cross-axis layout, WPT browser acceptance, real-site or Worker testing; no network or sockets",
			},
			null,
			2,
		),
	);
}
