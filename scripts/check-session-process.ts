import { AgentBrowserError } from "../src/errors.js";
import { BrowserSessionProcess } from "../src/node-session-process.js";
import type { ScriptEvaluation } from "../src/safejs.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean; error?: string }[] = [];
const actors: BrowserSessionProcess[] = [];
const processes: ReturnType<BrowserSessionProcess["info"]>[] = [];
function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Probe assertion failed");
}
async function evaluate(actor: BrowserSessionProcess, source: string) {
	const result = (await actor.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error(`Evaluation failed: ${result.error?.code}`);
	return result.value;
}
function absent(pid: number) {
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		return (
			!!error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

try {
	const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
	if (!packageRoot)
		throw new Error(
			"An explicit compiled extended SafeJS package root is required",
		);
	const healthy = await BrowserSessionProcess.create({
		packageRoot,
		session: "healthy",
	});
	actors.push(healthy);
	processes.push(healthy.info());
	for (const url of ["https://example.com/", "https://books.toscrape.com/"]) {
		const actor = await BrowserSessionProcess.create({
			packageRoot,
			scripts: { limits: { timeoutMs: 2000, maxRuns: 32 } },
		});
		actors.push(actor);
		processes.push(actor.info());
		await actor.execute(["open", url]);
		check(
			`${url}: actual SDK realm and Window aliases`,
			(await evaluate(
				actor,
				"window.document === document && window.self === window && self === window",
			)) === true,
		);
		await evaluate(actor, "let counter = 1;");
		check(
			`${url}: persistent lexical state`,
			(await evaluate(actor, "++counter")) === 2 &&
				(await evaluate(actor, "++counter")) === 3,
		);
		await evaluate(
			actor,
			'document.querySelector("h1").textContent = "Owned session probe"',
		);
		check(
			`${url}: live DOM capability and JSON projection`,
			await evaluate(
				actor,
				'({title:document.querySelector("h1").textContent, counter})',
			).then(
				(value) =>
					JSON.stringify(value) ===
					'{"title":"Owned session probe","counter":3}',
			),
		);
		const text = (await actor.execute(["text"])).data as { text: string };
		check(
			`${url}: native text snapshot observes the same document`,
			text.text.includes("Owned session probe"),
		);
		await evaluate(
			actor,
			'let anchor = document.querySelector("a"); anchor.id = "owned-session-link"; let clicks = 0; let windowClicks = 0; function cancel(event) { clicks++; event.preventDefault(); } anchor.addEventListener("click", cancel); window.addEventListener("click", function(event) { windowClicks++; }); true',
		);
		await actor.execute(["click", "#owned-session-link"]);
		check(
			`${url}: native click and Window callbacks cancel navigation`,
			(await evaluate(
				actor,
				`clicks === 1 && windowClicks === 1 && document.URL === ${JSON.stringify(url)}`,
			)) === true,
		);
		await evaluate(
			actor,
			'anchor.removeEventListener("click", cancel); anchor.setAttribute("href", "#owned-session-probe"); true',
		);
		await actor.execute(["click", "#owned-session-link"]);
		check(
			`${url}: fragment navigation preserves the realm and DOM identity`,
			(await evaluate(
				actor,
				'counter === 3 && anchor === document.querySelector("#owned-session-link") && windowClicks === 2 && document.URL.endsWith("#owned-session-probe")',
			)) === true,
		);
		await actor.execute(["reload"]);
		check(
			`${url}: replacement document receives a fresh realm`,
			(await evaluate(
				actor,
				'typeof counter === "undefined" && document.querySelector("h1").textContent !== "Owned session probe"',
			)) === true,
		);
		await actor.close();
		check(
			`${url}: owned process termination confirmed`,
			absent(actor.info().pid),
		);
	}
	const runaway = await BrowserSessionProcess.create({
		packageRoot,
		commandTimeoutMs: 2000,
		scripts: { limits: { maxSteps: 1_000_000, timeoutMs: 10_000 } },
	});
	actors.push(runaway);
	processes.push(runaway.info());
	await runaway.execute(["open", "https://example.com/"]);
	let code: string | undefined;
	try {
		await runaway.execute(["eval", "while (true) {}"]);
	} catch (error) {
		if (error instanceof AgentBrowserError) code = error.code;
	}
	check(
		"Actual guest infinite loop is terminated by the external command deadline",
		code === "timeout" && absent(runaway.info().pid),
	);
	check(
		"Another owned session remains responsive",
		(await healthy.execute(["capabilities"])).session === "healthy",
	);
} catch (error) {
	checks.push({
		label: "Owned session real-site probe",
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
	if (process.argv.includes("--trace"))
		console.error(error instanceof Error ? error.message : "Probe failed");
} finally {
	await Promise.all(actors.map((actor) => actor.close()));
}
console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Actual locally extended SafeJS public core in an owned process containing the entire browser session, document model and native actions. Public website requests are read-only GETs. Probe scripts are explicit, not automatically loaded website JavaScript. Link cancellation and fragment navigation make no remote mutations. No credentials or raw page responses retained. Parent RSS is not child or peak memory.",
			processes,
			checks,
			parentRssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
