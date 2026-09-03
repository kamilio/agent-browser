import { compileCssMedia, cssMediaLimits } from "../src/css-media.js";

const startedAt = new Date().toISOString();
const source =
	"(0px < width <= 48px) and ((orientation: portrait) or (resolution >= 2dppx))";
const evaluations = 20000;
const compiled = compileCssMedia(source);
function measure(recompile: boolean) {
	const start = performance.now();
	let matched = 0;
	for (let index = 0; index < evaluations; index++) {
		const query = recompile ? compileCssMedia(source) : compiled;
		if (query.matches({ width: index % 2 === 0 ? 40 : 80, height: 80 }))
			matched++;
	}
	return {
		matched,
		evaluations,
		elapsedMs: performance.now() - start,
		compilations: recompile ? evaluations : 1,
	};
}
const reused = measure(false);
const reparsed = measure(true);
function refuses(source: string) {
	try {
		compileCssMedia(source);
		return false;
	} catch (error) {
		return (
			error instanceof Error &&
			"code" in error &&
			error.code === "resource-limit"
		);
	}
}
const checks = [
	{
		label:
			"Reused and per-evaluation compilation produce identical viewport results",
		passed:
			reused.matched === evaluations / 2 && reparsed.matched === reused.matched,
	},
	{
		label: "Compiled query state is immutable and bounded",
		passed:
			Object.isFrozen(compiled) &&
			compiled.conditions > 0 &&
			compiled.conditions < cssMediaLimits.maxConditions,
	},
	{
		label:
			"Input source limit rejects before building an oversized condition graph",
		passed: refuses("x".repeat(cssMediaLimits.maxCodeUnits + 1)),
	},
	{
		label: "Nesting limit rejects deeply recursive input",
		passed: refuses(`${"(".repeat(33)}width${")".repeat(33)}`),
	},
	{
		label: "Condition limit includes constant media-type branches",
		passed: refuses(Array.from({ length: 1025 }, () => "screen").join(",")),
	},
];
const passed = checks.every((check) => check.passed);
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			fixture:
				"native compiled media queries only; no page runtime, network or sockets",
			passed,
			checks,
			reused,
			reparsed,
			conditions: compiled.conditions,
			maximumRssKiB: process.resourceUsage().maxRSS,
			limitations:
				"Local single-sample comparison of two current APIs, not a before/after browser benchmark or Worker/realm memory acceptance",
		},
		null,
		2,
	),
);
if (!passed) process.exitCode = 1;
