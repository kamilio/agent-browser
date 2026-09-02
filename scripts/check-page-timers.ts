import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { AgentBrowserError } from "../src/errors.js";
import { BrowserSessionProcess } from "../src/node-session-process.js";
import type { PageConsoleSnapshot } from "../src/page-console.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import type { NavigationResult } from "../src/session.js";
import type { SemanticSnapshot } from "../src/snapshot.js";

const startedAt = new Date().toISOString();
const checks: { label: string; passed: boolean; error?: string }[] = [];
const actors: BrowserSessionProcess[] = [];
const sites: {
	url: string;
	controlledTimerEvaluation: boolean;
	fullTextIncludesMarker: boolean;
	fullTextTruncated: boolean;
}[] = [];
let stage = "fixture startup";
const website = createServer((request, response) => {
	response.setHeader("content-type", "text/html; charset=utf-8");
	if (request.url === "/limit") {
		response.end(`<h1 id="status">0</h1><script>
let ticks = 0;
setInterval(function() { ticks++; document.getElementById("status").textContent = "ticks=" + ticks; }, 1);
</script>`);
	} else if (request.url === "/pending") {
		response.end(`<h1>Pending callbacks fixture</h1><script>
setInterval(async function() { await new Promise(function() {}); }, 1);
</script>`);
	} else if (request.url === "/clean") response.end("<h1>Clean document</h1>");
	else
		response.end(`<h1 id="status">Before timer</h1><script>
let argument = { count: 1 }; let sameArgument = false; let windowThis = false; let timerCurrentNull = false;
let canceledRan = false;
let canceledTimeout = setTimeout(function() { canceledRan = true; }, 10);
window.clearInterval(canceledTimeout);
let canceledInterval = window.setInterval(function() { canceledRan = true; }, 10);
clearTimeout(canceledInterval);
window.setTimeout(function(value, suffix) {
  sameArgument = value === argument;
  value.count++;
  windowThis = this === window;
  timerCurrentNull = document.currentScript === null;
  document.getElementById("status").textContent = "Automatic timer " + suffix;
  console.info("timer-fired", value.count);
}, 15, argument, "ready");
argument.count = 4;
</script>`);
});

function check(label: string, passed: boolean) {
	checks.push({ label, passed });
	if (process.argv.includes("--trace"))
		console.error(`${passed ? "PASS" : "FAIL"} ${label}`);
	if (!passed) throw new Error("Timer probe assertion failed");
}

async function evaluate(actor: BrowserSessionProcess, source: string) {
	const result = (await actor.execute(["eval", source]))
		.data as ScriptEvaluation;
	if (!result.ok) throw new Error(`Evaluation failed: ${result.error?.code}`);
	return result;
}

try {
	const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
	if (!packageRoot)
		throw new AgentBrowserError(
			"invalid-input",
			"Select the compiled extended SafeJS package explicitly",
		);
	await new Promise<void>((resolve, reject) => {
		website.once("error", reject);
		website.listen(0, "127.0.0.1", resolve);
	});
	const address = website.address();
	if (!address || typeof address === "string")
		throw new Error("Missing fixture listener");
	const origin = `http://127.0.0.1:${address.port}`;
	const actor = await BrowserSessionProcess.create({
		packageRoot,
		websiteScripts: "classic",
		network: { allowPrivateOrigins: [origin] },
	});
	actors.push(actor);
	const opened = (await actor.execute(["open", origin])).data as {
		navigation: NavigationResult;
	};
	check(
		"Automatic page script schedules timers during real owned-process HTML loading",
		opened.navigation.scripts?.executed === 1 &&
			!opened.navigation.scripts.halted,
	);
	await evaluate(
		actor,
		"await new Promise(resolve => setTimeout(resolve, 40))",
	);
	check(
		"Timer callbacks preserve extra argument identity and post-scheduling mutations",
		(await evaluate(actor, "sameArgument && argument.count === 5")).value ===
			true,
	);
	check(
		"Timer callbacks receive Window this and no parser currentScript",
		(await evaluate(actor, "windowThis && timerCurrentNull")).value === true,
	);
	check(
		"Timeout and interval share cancellation IDs across global and Window methods",
		(await evaluate(actor, "!canceledRan")).value === true,
	);
	check(
		"Semantic text exposes DOM changes made by an automatic timer",
		((await actor.execute(["text"])).data as { text: string }).text.includes(
			"Automatic timer ready",
		),
	);
	check(
		"Actual timer console diagnostics are retained on the shared document",
		(
			(await actor.execute(["console"])).data as PageConsoleSnapshot
		).entries.some((entry) => entry.text === "timer-fired 5"),
	);
	await evaluate(
		actor,
		`let cycle = {}; cycle.self = cycle; let extraFunction = () => 42; let extraIdentity = false;
await new Promise(resolve => {
  setTimeout(function(object, callable, node) {
    extraIdentity = object === cycle && object.self === cycle && callable === extraFunction && callable() === 42 && node === document.body;
    resolve();
  }, 0, cycle, extraFunction, document.body);
});`,
	);
	check(
		"Deferred arguments preserve cycles, closures and live DOM capabilities",
		(await evaluate(actor, "extraIdentity")).value === true,
	);
	await evaluate(
		actor,
		`let intervalStarts = 0; let intervalEnds = 0;
let interval = setInterval(async function() {
  intervalStarts++;
  if (intervalStarts === 3) clearTimeout(interval);
  await new Promise(resolve => setTimeout(resolve, 10));
  intervalEnds++;
}, 2);
await new Promise(resolve => setTimeout(resolve, 60));`,
	);
	check(
		"Async intervals re-arm after their synchronous prefix and allow nested awaited timers",
		(await evaluate(actor, "intervalStarts === 3 && intervalEnds === 3"))
			.value === true,
	);
	await evaluate(
		actor,
		`setTimeout(function() { throw new Error("timer guest failure"); }, 0);
await new Promise(resolve => setTimeout(resolve, 20));`,
	);
	check(
		"Ordinary timer callback failure is sanitized without killing a healthy realm",
		(
			(await actor.execute(["console", "error"])).data as PageConsoleSnapshot
		).entries.some(
			(entry) =>
				entry.source === "callback" &&
				entry.text === "Page callback failed: script-error",
		) && (await evaluate(actor, "1 + 1")).value === 2,
	);
	await evaluate(
		actor,
		`let refusedString = false;
try { setTimeout("throw new Error('must not evaluate')", 0); } catch (error) { refusedString = true; }`,
	);
	check(
		"Source-string handlers fail explicitly rather than executing a hidden evaluator",
		(await evaluate(actor, "refusedString")).value === true,
	);
	const settled = await evaluate(actor, "true");
	check(
		"Timer metrics expose cumulative work and no retained active timers after completion",
		settled.metrics.timers?.active === 0 && settled.metrics.timers.fired >= 10,
	);
	await actor.execute(["goto", `${origin}/clean`]);
	check(
		"Navigation owns a fresh realm and timer ID space",
		(
			await evaluate(
				actor,
				"let firstTimer = setTimeout(function() {}, 1000); clearInterval(firstTimer);",
			)
		).metrics.timers?.scheduled === 1,
	);
	await actor.close();
	const limited = await BrowserSessionProcess.create({
		packageRoot,
		websiteScripts: "classic",
		scripts: { timerLimits: { maxCallbacks: 3 } },
		network: { allowPrivateOrigins: [origin] },
	});
	actors.push(limited);
	await limited.execute(["open", `${origin}/limit`]);
	await delay(80);
	check(
		"A recurring timer stops at the configured cumulative callback limit",
		((await limited.execute(["text"])).data as { text: string }).text.includes(
			"ticks=3",
		),
	);
	check(
		"Timer limit failure leaves readable diagnostics instead of silently dropping work",
		(
			(await limited.execute(["console", "error"])).data as PageConsoleSnapshot
		).entries.some(
			(entry) => entry.text === "Page callback failed: resource-limit",
		),
	);
	await limited.close();
	const pending = await BrowserSessionProcess.create({
		packageRoot,
		websiteScripts: "classic",
		scripts: { maxPendingCallbacks: 2 },
		network: { allowPrivateOrigins: [origin] },
	});
	actors.push(pending);
	await pending.execute(["open", `${origin}/pending`]);
	await delay(80);
	const errors = (
		(await pending.execute(["console", "error"])).data as PageConsoleSnapshot
	).entries;
	check(
		"Unsettled timer callbacks hit the shared pending-callback bound once",
		errors.length === 1 &&
			errors[0].text === "Page callback failed: resource-limit",
	);
	await pending.close();
	if (process.argv.includes("--sites"))
		for (const url of ["https://example.com/", "https://books.toscrape.com/"]) {
			stage = `public navigation: ${url}`;
			if (process.argv.includes("--trace")) console.error(stage);
			const live = await BrowserSessionProcess.create({ packageRoot });
			actors.push(live);
			try {
				await live.execute(["open", url]);
				stage = `controlled timer evaluation: ${url}`;
				if (process.argv.includes("--trace")) console.error(stage);
				await evaluate(
					live,
					`let liveArgument = { value: "controlled timer marker" }; let liveSame = false;
await new Promise(resolve => { setTimeout(function(value) {
  liveSame = value === liveArgument;
  let marker = document.createElement("p");
  marker.id = "controlled-timer-marker";
  marker.textContent = value.value;
  document.body.appendChild(marker);
  console.info("public-document-timer");
  resolve();
}, 5, liveArgument); });`,
				);
				const fullText = (await live.execute(["text"])).data as {
					text: string;
					truncated: boolean;
				};
				const passed =
					(await evaluate(live, "liveSame")).value === true &&
					(
						(
							await live.execute([
								"snapshot",
								"#controlled-timer-marker",
								"--observe",
							])
						).data as SemanticSnapshot
					).entries.some((entry) => entry.name === "controlled timer marker");
				sites.push({
					url,
					controlledTimerEvaluation: passed,
					fullTextIncludesMarker: fullText.text.includes(
						"controlled timer marker",
					),
					fullTextTruncated:
						fullText.truncated ||
						fullText.text.includes("… snapshot truncated"),
				});
				check(
					`${url}: controlled timer evaluation mutates the real parsed document`,
					passed,
				);
			} finally {
				await live.close();
			}
		}
} catch (error) {
	checks.push({
		label: `Owned-process timer probe: ${stage}`,
		passed: false,
		error: error instanceof AgentBrowserError ? error.code : "probe-failed",
	});
	if (process.argv.includes("--trace"))
		console.error(error instanceof Error ? error.message : "Probe failed");
} finally {
	await Promise.all(actors.map((actor) => actor.close()));
	website.closeAllConnections();
	await new Promise<void>((resolve) => website.close(() => resolve()));
}

console.log(
	JSON.stringify(
		{
			startedAt,
			finishedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Actual extended SafeJS in owned browser processes. Fixture source schedules timers automatically. Optional public documents use manually injected, controlled evaluation; this is not automatic real-site JavaScript compatibility. Public requests are read-only. No credentials or raw public page bodies retained.",
			checks,
			sites,
			ownedProcessesClosed: true,
			parentRssBytes: process.memoryUsage().rss,
		},
		null,
		2,
	),
);
if (checks.some((check) => !check.passed)) process.exitCode = 1;
