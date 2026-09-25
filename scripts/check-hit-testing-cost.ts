import { createHash } from "node:crypto";
import { documentHitTesting } from "../src/hit-testing.js";
import { parseHtmlDocument } from "../src/html-parser.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { documentStyles } from "../src/styles.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

if (process.argv.length !== 2) throw new Error("No arguments are supported");
const startedAt = new Date().toISOString();
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const fixture =
	'<!doctype html><style>html,body{margin:0;padding:0}main{width:100%;font-size:8px;line-height:12px}#first,#last{width:50%;height:20px}#last{margin-top:-20px;background:blue}</style><main><div id="first">A</div><div id="last"></div></main>';
const setup =
	'var first = document.getElementById("first"); var last = document.getElementById("last"); var sequence = document.elementsFromPoint(20, 3); sequence.pop(); sequence[0] = null; return document.elementFromPoint(20, 3) === last;';
const cases = [
	{
		name: "arithmetic-no-host-calls",
		source:
			"var total = 0; for (var index = 0; index < 256; index++) total += index; return total === 32640;",
	},
	{
		name: "identity-no-host-calls",
		source:
			"for (var index = 0; index < 256; index++) if (last !== last) return false; return true;",
	},
	{
		name: "element-getter-no-hit-calls",
		source:
			'for (var index = 0; index < 256; index++) if (last.tagName !== "DIV") return false; return true;',
	},
	{
		name: "element-from-point",
		source:
			"for (var index = 0; index < 256; index++) if (document.elementFromPoint(20, 3) !== last) return false; return true;",
	},
];
const results: Record<string, unknown>[] = [];
for (const scenario of cases) {
	const tree = parseHtmlDocument(fixture, "https://fixture.invalid/hit-cost");
	documentStyles(tree).setViewport(100, 80);
	const hits = documentHitTesting(tree);
	const page = new PageScripts(
		{ document: tree, interactions: documentInteractions(tree) },
		core,
	);
	const record: Record<string, unknown> = { ...scenario, passed: false };
	results.push(record);
	try {
		const initialized = await page.evaluate(setup);
		if (!initialized.ok || initialized.value !== true)
			throw new Error("Common guest setup failed");
		const expected = hits.elementFromPoint(20, 3);
		const nativeBefore = hits.metrics();
		const nativeStarted = performance.now();
		let nativeCorrect = expected !== null;
		for (let index = 0; index < 256; index++)
			nativeCorrect =
				hits.elementFromPoint(20, 3) === expected && nativeCorrect;
		record.native = {
			correct: nativeCorrect,
			elapsedMs: performance.now() - nativeStarted,
			before: nativeBefore,
			after: hits.metrics(),
		};
		record.before = { hits: hits.metrics(), page: page.metrics() };
		const started = performance.now();
		const cpuStarted = process.cpuUsage();
		try {
			const evaluated = await page.evaluate(scenario.source);
			record.result = evaluated;
			record.passed = evaluated.ok && evaluated.value === true && nativeCorrect;
		} finally {
			const cpu = process.cpuUsage(cpuStarted);
			record.elapsedMs = performance.now() - started;
			record.cpuMs = (cpu.user + cpu.system) / 1000;
		}
	} catch (error) {
		record.error = {
			code:
				error instanceof Error && "code" in error
					? String(error.code)
					: "unknown",
			message: error instanceof Error ? error.message : String(error),
		};
	} finally {
		await page.close();
		tree.close();
		record.after = { hits: hits.metrics(), page: page.metrics() };
	}
}
const passed = results.every((result) => result.passed === true);
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			passed,
			runtime: "existing experimental SafeJS core, not released-SDK acceptance",
			node: process.version,
			iterations: 256,
			fixtureSha256: createHash("sha256").update(fixture).digest("hex"),
			setup,
			results,
			limitations:
				"Independent fresh production PageScripts owners with identical fixtures/setup and unchanged budgets. Native queries run before each guest loop. Samples are observational, not a timing threshold or full-browser acceptance. No network, sockets, timer scheduler probes, interpreter changes or disabled accounting. The original stress probe remains separate.",
		},
		null,
		2,
	),
);
if (!passed) process.exitCode = 1;
