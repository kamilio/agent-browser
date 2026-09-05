import { isAbsolute } from "node:path";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { DocumentInteractions } from "../src/interactions.js";
import { loadPageRuntime } from "../src/node-page-core.js";
import type { PageRuntime } from "../src/page-runtime.js";
import { PageScripts } from "../src/page-scripts.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean }[] = [];
const runtimes: PageRuntime[] = [];
let stage = "authorization";
let errorClassification: string | undefined;
let completed = false;
let cleanupComplete = false;
let factoryLoaded = false;
let selectedAdapter: "legacy" | "extension" | undefined;
let runtimeIdentity:
	| { packageName: string; version: string; publicExport: string }
	| undefined;
let owner: PageScripts | undefined;
let document: DocumentTree | undefined;
let interactions: DocumentInteractions | undefined;
let sourceCodeUnits = 0;
let evaluations = 0;
let beforeClose: ReturnType<typeof timelineCounters>;
let afterClose: ReturnType<typeof timelineCounters>;

function check(label: string, passed: boolean): void {
	checks.push({ label, passed });
	if (!passed) throw new AgentBrowserError("unsupported", "Probe check failed");
}

function classify(error: unknown): string {
	return error instanceof AgentBrowserError &&
		[
			"aborted",
			"closed",
			"timeout",
			"invalid-input",
			"unsupported",
			"resource-limit",
		].includes(error.code)
		? error.code
		: "unclassified-error";
}

async function bounded<Value>(
	operation: Promise<Value>,
	timeoutMs = 3500,
): Promise<Value> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(
					() => reject(new AgentBrowserError("timeout", "Probe deadline")),
					timeoutMs,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function timelineCounters() {
	const timeline = owner?.metrics().performance.timeline;
	return timeline
		? {
				partial: timeline.partial,
				profile: timeline.profile,
				active: timeline.active,
				created: timeline.created,
				retainedUnits: timeline.retainedUnits,
				operations: timeline.operations,
				closed: timeline.closed,
			}
		: undefined;
}

function reserveSource(source: string): void {
	sourceCodeUnits += source.length;
	evaluations++;
	if (sourceCodeUnits > 16_384 || evaluations > 16)
		throw new AgentBrowserError("resource-limit", "Probe source budget");
}

async function evaluate(
	label: string,
	source: string,
	labels: readonly string[],
): Promise<void> {
	stage = label;
	if (!owner) throw new AgentBrowserError("closed", "Missing page owner");
	reserveSource(source);
	const result = await bounded(
		owner.evaluate(source, { filename: `${label}.js` }),
	);
	check(`${label}:evaluation`, result.ok);
	const flags = result.value;
	check(
		`${label}:bounded-boolean-result`,
		Array.isArray(flags) &&
			flags.length === labels.length &&
			flags.every((flag) => typeof flag === "boolean"),
	);
	const values = flags as boolean[];
	for (const [index, name] of labels.entries())
		checks.push({ label: `${label}:${name}`, passed: values[index] === true });
	check(
		`${label}:all`,
		values.every((flag) => flag),
	);
}

function summary(status: string): void {
	process.stdout.write(
		`${JSON.stringify({
			probe: "synthetic-user-timing-native-factory",
			startedAt,
			finishedAt: new Date().toISOString(),
			status,
			stage,
			factoryLoaded,
			selectedAdapter,
			runtimeIdentity,
			profile: "bounded-user-timing-json-snapshots",
			runtimeVerified: completed && cleanupComplete,
			cleanupComplete,
			sourceCodeUnits,
			evaluations,
			beforeClose,
			afterClose,
			checks,
			...(errorClassification ? { errorClassification } : {}),
		})}\n`,
	);
}

const watchdog = setTimeout(() => {
	errorClassification = "timeout";
	summary("watchdog-incomplete-cleanup");
	process.exit(1);
}, 20_000);

try {
	const args = process.argv.slice(2);
	const root = args[1];
	const adapter = args[3];
	if (
		args.length !== 5 ||
		args[0] !== "--runtime-root" ||
		typeof root !== "string" ||
		!isAbsolute(root) ||
		root.length > 16_384 ||
		args[2] !== "--adapter" ||
		(adapter !== "legacy" && adapter !== "extension") ||
		args[4] !== "--authorize-synthetic-user-timing-runtime"
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Explicit authorization and runtime selection required",
		);

	stage = "load-native-factory";
	const loaded = await bounded(loadPageRuntime(root, { adapter }), 4000);
	factoryLoaded = true;
	selectedAdapter = loaded.adapter;
	runtimeIdentity = {
		packageName: loaded.packageName,
		version: loaded.version,
		publicExport: loaded.publicExport,
	};
	document = parseHtmlDocument(
		'<!doctype html><html><head><title>Timing fixture</title></head><body><p id="timing-output">before</p></body></html>',
		"https://timing.fixture.invalid/",
		{
			limits: {
				maxNodes: 32,
				maxDepth: 8,
				maxTextCodeUnits: 1024,
				maxChanges: 64,
			},
		},
	);
	interactions = new DocumentInteractions(document);
	owner = new PageScripts(
		{ document, interactions },
		{
			createPageRuntime(options) {
				const runtime = loaded.factory.createPageRuntime(options);
				runtimes.push(runtime);
				return runtime;
			},
		},
		{
			limits: {
				maxSourceCodeUnits: 16_384,
				maxSteps: 100_000,
				maxCallDepth: 48,
				maxStringLength: 16_384,
				maxArrayLength: 8192,
				maxDataSize: 524_288,
				timeoutMs: 3000,
				maxRuns: 16,
				maxResultBytes: 32_768,
			},
			maxPendingCallbacks: 4,
		},
	);

	await evaluate(
		"shared-clock",
		`
		var initialNow = performance.now();
		var initialOrigin = performance.timeOrigin;
		var defaultMark = performance.mark("default-mark");
		document.getElementById("timing-output").textContent = "timing-shared";
		return [
			performance === window.performance && performance === self.performance,
			Number.isFinite(initialOrigin) && initialOrigin > 0,
			Number.isFinite(initialNow) && initialNow >= 0 && performance.now() >= initialNow,
			defaultMark.startTime >= initialNow && defaultMark.startTime <= performance.now(),
			defaultMark.duration === 0 && defaultMark.entryType === "mark" && defaultMark.detail === null,
			performance.toJSON().timeOrigin === initialOrigin
		];
		`,
		[
			"global-alias-identity",
			"finite-time-origin",
			"monotonic-clock",
			"default-mark-clock",
			"default-mark-fields",
			"existing-clock-json",
		],
	);
	check(
		"shared-dom:native-tree-observes-guest-write",
		document.textContent(document.root).includes("timing-shared") &&
			!document.textContent(document.root).includes("before"),
	);

	await evaluate(
		"explicit-marks",
		`
		performance.clearMarks();
		var detailInput = { nested: { value: 7 }, list: [1, true, null] };
		var highMark = performance.mark("repeat", { startTime: 90, detail: detailInput });
		var lowMark = performance.mark("repeat", { startTime: 10 });
		var tieMark = performance.mark("tie", { startTime: 10 });
		var edgeMark = performance.mark("edge", { startTime: 30 });
		detailInput.nested.value = 99;
		var sortedMarks = performance.getEntriesByType("mark");
		return [
			document.getElementById("timing-output").textContent === "timing-shared",
			performance.timeOrigin === initialOrigin && performance.now() >= initialNow,
			sortedMarks.length === 4 && sortedMarks[0] === lowMark && sortedMarks[1] === tieMark && sortedMarks[2] === edgeMark && sortedMarks[3] === highMark,
			performance.getEntries() !== performance.getEntries() && performance.getEntries()[0] === lowMark,
			performance.getEntriesByName("repeat").length === 2 && performance.getEntriesByName("repeat", "mark")[1] === highMark,
			performance.getEntriesByType("MARK").length === 0 && performance.getEntriesByName("Repeat").length === 0 && performance.getEntriesByName("repeat", "measure").length === 0,
			highMark.detail.nested.value === 7 && highMark.detail.list[2] === null
		];
		`,
		[
			"persistent-dom",
			"persistent-clock",
			"ascending-stable-query-identity",
			"fresh-query-arrays",
			"exact-name-type-query",
			"case-sensitive-filters",
			"detail-publication-copy",
		],
	);

	await evaluate(
		"measure-forms",
		`
		var legacyMeasure = performance.measure("legacy", "repeat", "edge");
		var negativeDuration = performance.measure("negative-duration", { start: 30, end: 10 });
		var negativeStart = performance.measure("negative-start", { end: 5, duration: 10 });
		var durationMeasure = performance.measure("duration", { start: "repeat", duration: 4, detail: { kind: "duration" } });
		var emptyMeasure = performance.measure("empty", {});
		var endMeasure = performance.measure("legacy-end", undefined, "edge");
		var measureEntries = performance.getEntriesByType("measure");
		var allEntries = performance.getEntries();
		return [
			legacyMeasure.startTime === 10 && legacyMeasure.duration === 20 && legacyMeasure.entryType === "measure",
			negativeDuration.startTime === 30 && negativeDuration.duration === -20,
			negativeStart.startTime === -5 && negativeStart.duration === 10,
			durationMeasure.startTime === 10 && durationMeasure.duration === 4 && durationMeasure.detail.kind === "duration",
			emptyMeasure.startTime === 0 && emptyMeasure.duration >= 0 && emptyMeasure.duration <= performance.now(),
			endMeasure.startTime === 0 && endMeasure.duration === 30,
			measureEntries.length === 6 && measureEntries[0] === negativeStart && allEntries.length === 10 && allEntries[0] === negativeStart,
			allEntries.every(function(entry, index) { return index === 0 || allEntries[index - 1].startTime <= entry.startTime; })
		];
		`,
		[
			"legacy-latest-inserted-mark",
			"negative-derived-duration",
			"negative-derived-start",
			"start-duration-options",
			"empty-options-clock",
			"legacy-end-only",
			"mixed-timeline-query",
			"mixed-timeline-order",
		],
	);

	await evaluate(
		"entry-snapshots",
		`
		var firstDetail = highMark.detail;
		firstDetail.nested.value = 101;
		firstDetail.list[0] = 202;
		var firstJson = highMark.toJSON();
		firstJson.detail.nested.value = 303;
		firstJson.name = "json-only";
		try { highMark.name = "changed"; } catch (error) {}
		try { highMark.entryType = "measure"; } catch (error) {}
		try { highMark.startTime = 1000; } catch (error) {}
		try { highMark.duration = 1000; } catch (error) {}
		try { highMark.detail = { replaced: true }; } catch (error) {}
		var cleanJson = highMark.toJSON();
		return [
			highMark.detail !== highMark.detail && highMark.detail.nested.value === 7 && highMark.detail.list[0] === 1,
			cleanJson !== highMark.toJSON() && cleanJson.detail !== highMark.detail && cleanJson.detail.nested.value === 7,
			highMark.name === "repeat" && highMark.entryType === "mark" && highMark.startTime === 90 && highMark.duration === 0 && highMark.detail.nested.value === 7,
			Object.keys(cleanJson).sort().join(",") === "detail,duration,entryType,name,startTime" && cleanJson.name === "repeat" && cleanJson.startTime === 90 && cleanJson.duration === 0,
			JSON.parse(JSON.stringify(highMark)).detail.nested.value === 7
		];
		`,
		[
			"per-access-detail-copy",
			"per-access-json-copy",
			"readonly-entry-properties",
			"json-entry-fields",
			"json-stringify-entry",
		],
	);

	await evaluate(
		"invalid-inputs",
		`
		var activeBeforeInvalid = performance.getEntries().length;
		function timingRejects(operation) {
			try { operation(); return false; } catch (error) { return true; }
		}
		var cyclicDetail = {};
		cyclicDetail.self = cyclicDetail;
		var invalidFlags = [
			timingRejects(function() { performance.mark(); }),
			timingRejects(function() { performance.mark("x".repeat(1025)); }),
			timingRejects(function() { performance.mark({ name: "object" }); }),
			timingRejects(function() { performance.mark("navigationStart"); }),
			timingRejects(function() { performance.mark("negative", { startTime: -1 }); }),
			timingRejects(function() { performance.mark("infinite", { startTime: Infinity }); }),
			timingRejects(function() { performance.mark("array-options", []); }),
			timingRejects(function() { performance.measure("unknown", "missing-mark"); }),
			timingRejects(function() { performance.measure("overdefined", { start: 1, end: 2, duration: 1 }); }),
			timingRejects(function() { performance.measure("duration-only", { duration: 1 }); }),
			timingRejects(function() { performance.measure("negative-option", { start: 1, duration: -1 }); }),
			timingRejects(function() { performance.measure("third-argument", { start: 1 }, "edge"); }),
			timingRejects(function() { performance.mark("function-detail", { detail: function() {} }); }),
			timingRejects(function() { performance.mark("cyclic-detail", { detail: cyclicDetail }); }),
			timingRejects(function() { performance.mark("undefined-detail", { detail: { missing: undefined } }); }),
			timingRejects(function() { performance.mark("oversized-detail", { detail: "x".repeat(8193) }); }),
			timingRejects(function() { performance.getEntriesByName(); }),
			timingRejects(function() { performance.getEntriesByType(); })
		];
		invalidFlags.push(performance.getEntries().length === activeBeforeInvalid);
		return invalidFlags;
		`,
		[
			"missing-name",
			"oversized-name",
			"object-name",
			"reserved-name",
			"negative-mark-time",
			"nonfinite-mark-time",
			"array-options",
			"unknown-mark",
			"overdefined-measure",
			"duration-without-anchor",
			"negative-duration-option",
			"options-and-third-argument",
			"function-detail",
			"cyclic-detail",
			"nested-undefined-detail",
			"oversized-detail",
			"missing-query-name",
			"missing-query-type",
			"failed-creation-preserves-timeline",
		],
	);

	await evaluate(
		"clear-and-retain",
		`
		performance.clearMarks("repeat");
		var clearedName = performance.getEntriesByName("repeat").length === 0;
		var clearedNotResolvable = timingRejects(function() { performance.measure("cleared-reference", "repeat", "edge"); });
		var oldHandleReadable = highMark.startTime === 90 && lowMark.startTime === 10 && highMark.detail.nested.value === 7;
		performance.clearMeasures("legacy");
		var targetedMeasureClear = performance.getEntriesByName("legacy").length === 0 && performance.getEntriesByType("measure").length === 5;
		performance.clearMarks();
		var onlyMeasuresRemain = performance.getEntriesByType("mark").length === 0 && performance.getEntriesByType("measure").length === 5;
		performance.clearMeasures();
		return [clearedName, clearedNotResolvable, oldHandleReadable, targetedMeasureClear,
			onlyMeasuresRemain, performance.getEntries().length === 0,
			legacyMeasure.toJSON().duration === 20 && highMark.toJSON().detail.nested.value === 7,
			defaultMark.name === "default-mark" && edgeMark.startTime === 30];
		`,
		[
			"all-exact-name-marks-cleared",
			"cleared-mark-not-resolvable",
			"old-mark-handles-readable",
			"targeted-measure-clear",
			"type-specific-clear",
			"empty-active-timeline",
			"cleared-entry-json-readable",
			"earlier-evaluation-handles-retained",
		],
	);

	await evaluate(
		"retained-after-clear",
		`
		var finalMark = performance.mark("final-mark", { startTime: 2 });
		return [
			highMark.name === "repeat" && highMark.detail.nested.value === 7 && legacyMeasure.duration === 20,
			performance.getEntries().length === 1 && performance.getEntries()[0] === finalMark,
			performance.timeOrigin === initialOrigin && performance.now() >= initialNow,
			document.getElementById("timing-output").textContent === "timing-shared"
		];
		`,
		[
			"cleared-handles-survive-next-evaluation",
			"new-timeline-entry",
			"clock-remains-available",
			"dom-remains-shared",
		],
	);
	beforeClose = timelineCounters();
	check("factory:single-native-runtime", runtimes.length === 1);
	check(
		"timeline:bounded-cumulative-publications",
		beforeClose?.active === 1 &&
			beforeClose.created === 12 &&
			beforeClose.retainedUnits > 0 &&
			beforeClose.operations > 0 &&
			beforeClose.operations <= 8192 &&
			beforeClose.closed === false,
	);
	check(
		"page:no-background-work",
		!owner.metrics().active && owner.metrics().pendingCallbacks === 0,
	);

	stage = "close-page";
	await bounded(owner.close(), 2000);
	await bounded(owner.close(), 2000);
	afterClose = timelineCounters();
	check(
		"timeline:close-clears-active-releases-retention",
		afterClose?.closed === true &&
			afterClose.active === 0 &&
			afterClose.created === beforeClose?.created &&
			afterClose.retainedUnits === 0,
	);
	check("page:idempotent-close", owner.closed && runtimes[0]?.closed === true);
	stage = "closed-page-rejection";
	const closedSource = "return highMark.name;";
	reserveSource(closedSource);
	let closedRejected = false;
	try {
		await bounded(
			owner.evaluate(closedSource, { filename: "closed-page-rejection.js" }),
		);
	} catch (error) {
		closedRejected = classify(error) === "closed";
	}
	check("page:closed-owner-rejects-guest-evaluation", closedRejected);
	completed = true;
} catch (error) {
	errorClassification = classify(error);
} finally {
	stage = completed ? "cleanup" : stage;
	const cleanup: Promise<unknown>[] = [];
	for (const close of [
		() => owner?.close(),
		() => interactions?.close(),
		() => document?.close(),
		...runtimes.map((runtime) => () => runtime.close()),
	]) {
		try {
			cleanup.push(Promise.resolve(close()));
		} catch {
			cleanup.push(Promise.reject(new Error("Cleanup failed")));
		}
	}
	try {
		const settled = await bounded(Promise.allSettled(cleanup), 2000);
		cleanupComplete =
			settled.every((result) => result.status === "fulfilled") &&
			runtimes.every((runtime) => runtime.closed) &&
			(!owner || owner.closed) &&
			(!document || document.mutationMetrics().closed) &&
			(!interactions || interactions.events.metrics().closed);
		afterClose = timelineCounters();
		if (!cleanupComplete) errorClassification ??= "cleanup-incomplete";
	} catch {
		cleanupComplete = false;
		errorClassification ??= "cleanup-timeout";
	}
	clearTimeout(watchdog);
	const passed =
		completed && cleanupComplete && checks.every((entry) => entry.passed);
	summary(passed ? "passed" : "failed");
	process.exitCode = passed ? 0 : 1;
}
