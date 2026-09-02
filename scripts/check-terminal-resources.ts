import { performance } from "node:perf_hooks";
import type { SemanticSnapshot } from "../src/snapshot.js";
import { TerminalView } from "../src/terminal-view.js";

const startedAt = new Date().toISOString();
const results: {
	entries: number;
	nameCodeUnits: number;
	columns: number;
	projectionMs: number;
	scrollFrames: number;
	scrollMs: number;
	searchMs: number;
	cpuMs: number;
	heapDeltaBytes: number;
	maxFrameCodeUnits: number;
	bounded: boolean;
	tailReadable: boolean;
	searchFound: boolean;
}[] = [];

for (const [entries, nameCodeUnits, columns] of [
	[1, 1_000_000, 1],
	[1, 1_000_000, 80],
	[1000, 1000, 80],
]) {
	const snapshot: SemanticSnapshot = {
		document: "fixture",
		scope: "fixture",
		revision: 1,
		truncated: false,
		entries: Array.from({ length: entries }, (_, index) => ({
			ref: `fixture:${index}`,
			role: "text",
			name: `${"Readable text ".repeat(Math.ceil(nameCodeUnits / 14)).slice(0, nameCodeUnits)} FINAL_MARKER`,
			depth: 0,
		})),
	};
	const beforeHeap = process.memoryUsage().heapUsed;
	const beforeCpu = process.cpuUsage();
	const started = performance.now();
	const view = new TerminalView("resource-probe");
	view.update(snapshot, "https://fixture.invalid/");
	view.render(columns, 24);
	const projectionMs = performance.now() - started;
	let bounded = true;
	let maxFrameCodeUnits = 0;
	const scrolling = performance.now();
	for (let frame = 0; frame < 1000; frame++) {
		view.key(" ");
		const output = view.render(columns, 24);
		bounded &&=
			output.length === 24 && output.every((line) => line.length <= columns);
		maxFrameCodeUnits = Math.max(
			maxFrameCodeUnits,
			output.reduce((total, line) => total + line.length, 0),
		);
	}
	const scrollMs = performance.now() - scrolling;
	view.key("", { name: "end" });
	const prefix = columns > 2 ? 2 : 0;
	const tailReadable = view
		.render(columns, 24)
		.slice(3, -2)
		.map((line) => line.slice(prefix))
		.join("")
		.includes("FINAL_MARKER");
	view.key("", { name: "home" });
	const searching = performance.now();
	view.key("/");
	view.key("FINAL_MARKER");
	view.key("", { name: "return" });
	const searchMs = performance.now() - searching;
	const cpu = process.cpuUsage(beforeCpu);
	results.push({
		entries,
		nameCodeUnits,
		columns,
		projectionMs,
		scrollFrames: 1000,
		scrollMs,
		searchMs,
		cpuMs: (cpu.user + cpu.system) / 1000,
		heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
		maxFrameCodeUnits,
		bounded,
		tailReadable,
		searchFound: view.status.startsWith("Found"),
	});
}

console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Synthetic in-memory terminal projection, scrolling and literal search only. No real website, PTY, JavaScript-engine throughput or whole-browser RSS claim. Heap deltas are unforced-GC observations, not peaks or retained sizes. The one-column fixture exercises a million-row logical document.",
			results,
		},
		null,
		2,
	),
);
if (
	results.some(
		(result) => !result.bounded || !result.tailReadable || !result.searchFound,
	)
)
	process.exitCode = 1;
