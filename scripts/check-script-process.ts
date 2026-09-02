import { SafeJsProcess } from "../src/node-script-process.js";

const startedAt = new Date().toISOString();
const checks: Record<string, unknown>[] = [];
const root = process.env.AGENT_BROWSER_SAFEJS_ROOT;
if (!root)
	throw new Error(
		"AGENT_BROWSER_SAFEJS_ROOT must select an existing compatible SDK",
	);
let child: SafeJsProcess | undefined;
try {
	child = await SafeJsProcess.create({ packageRoot: root });
	const info = child.info();
	checks.push({
		label: "Installed SafeJS starts with restricted Node flags",
		passed:
			info.permissions.enabled &&
			!info.permissions.filesystemWrite &&
			!info.permissions.childProcess &&
			!info.permissions.worker &&
			!info.permissions.addons &&
			!info.permissions.wasi &&
			info.permissions.stringCodeGenerationDisabled,
		info,
	});
	const value = await child.evaluate("return [1,2,3].map(value => value * 3);");
	checks.push({
		label: "Real SafeJS evaluates across the bounded process protocol",
		passed: value.ok && JSON.stringify(value.value) === "[3,6,9]",
		metrics: value.metrics,
	});
	const secret = await child.evaluate(
		"return { process: typeof process, fetch: typeof fetch, require: typeof require };",
	);
	checks.push({
		label: "Child does not expose host process, network or module globals",
		passed:
			secret.ok &&
			JSON.stringify(secret.value) ===
				JSON.stringify({
					process: "undefined",
					fetch: "undefined",
					require: "undefined",
				}),
	});
	const loop = await child.evaluate("while (true) {}");
	checks.push({
		label: "Real infinite guest loop is interrupted by the interpreter budget",
		passed:
			!loop.ok &&
			loop.error?.code === "budgetExceeded" &&
			loop.error.budget === "steps",
	});
	const after = await child.evaluate("return 7;");
	checks.push({
		label: "A bounded guest failure does not corrupt the next independent run",
		passed: after.ok && after.value === 7,
	});
	await child.close();
	let absent = false;
	try {
		process.kill(info.pid, 0);
	} catch (error) {
		absent =
			!!error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ESRCH";
	}
	checks.push({
		label: "Close confirms owned child exit without leaving a process",
		passed: child.metrics().closed && absent,
	});
} catch (error) {
	checks.push({
		label: "Script process workflow",
		passed: false,
		error:
			error && typeof error === "object" && "code" in error
				? error.code
				: "unexpected",
	});
} finally {
	await child?.close();
}
const allPassed = checks.length === 6 && checks.every((check) => check.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "real-safejs-child-process",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			checks,
			allPassed,
			limitations: [
				"These are independent evaluations, not a persistent page realm or website script integration.",
				"Node permission flags and an empty environment are defense in depth, not an OS sandbox. Node 22 does not provide a network permission here.",
				"No DOM, filesystem or network capability is granted to guest code; no browser engine is used.",
				"The V8 old-space setting is not a whole-process RSS limit.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
