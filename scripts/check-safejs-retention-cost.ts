import { loadPageScriptCore } from "../src/node-page-core.js";

const packageRoot = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!packageRoot)
	throw new Error("Select the compiled public SafeJS package explicitly");
const { core } = await loadPageScriptCore(packageRoot);
const cases: Record<string, unknown>[] = [];
for (const count of [0, 10, 30]) {
	let getterCalls = 0;
	const objects = Array.from({ length: count }, () =>
		core.createHostObject({
			properties: Object.fromEntries(
				Array.from({ length: 10 }, (_, index) => [
					`field${index}`,
					{
						get: () => {
							getterCalls++;
							return index;
						},
					},
				]),
			),
		}),
	);
	const budget = new core.Budget({
		maxSteps: 50_000,
		dataSize: 2_000_000,
		arrayLength: 4096,
		stringLength: 65_536,
	});
	const controller = new AbortController();
	const realm = core.createRealm({
		bindings: { objects },
		budget,
		signal: controller.signal,
		maxSourceLength: 4096,
		maxEvaluations: 2,
		sink: { log() {}, error() {} },
	});
	let timerFired = false;
	const timer = setTimeout(() => {
		timerFired = true;
	}, 0);
	const started = performance.now();
	const cpuStarted = process.cpuUsage();
	try {
		await realm.evaluate(
			"let total = 0; for (let index = 0; index < 80; index++) total += index; total;",
		);
		const cpu = process.cpuUsage(cpuStarted);
		const elapsedMs = Math.round(performance.now() - started);
		const steps = budget.stepsUsed;
		const timerFiredDuringEvaluation = timerFired;
		const result = await realm.evaluate("total");
		cases.push({
			hostObjects: count,
			propertiesPerObject: 10,
			elapsedMs,
			cpuMs: Math.round((cpu.user + cpu.system) / 1000),
			steps,
			timerFiredDuringEvaluation,
			getterCalls,
			correct: result.returnValue === 3160,
		});
		if (result.returnValue !== 3160 || getterCalls !== 0) process.exitCode = 1;
	} finally {
		clearTimeout(timer);
		controller.abort();
		await realm.close();
	}
}
console.log(
	JSON.stringify(
		{
			checkedAt: new Date().toISOString(),
			runtime: process.version,
			scope:
				"Bounded diagnostic of identical arithmetic with unused live host capabilities through the compiled public core. No browser DOM, network, native evaluator, relaxed production limits or disabled accounting checks. Run under an external process timeout; timing is evidence, not a fixed wall-clock unit-test assertion.",
			cases,
		},
		null,
		2,
	),
);
