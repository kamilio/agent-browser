import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runIsolatedWebSocketCheck } from "./run-isolated-safejs-gate.js";

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const [planFile, flag, approvedDigest, ...extra] = process.argv.slice(2);
	if (
		!planFile ||
		flag !== "--approved-plan-sha256" ||
		!approvedDigest ||
		extra.length
	) {
		console.error(
			"Usage: run-isolated-websocket-check PLAN_JSON --approved-plan-sha256 SHA256",
		);
		process.exitCode = 1;
	} else {
		try {
			const result = await runIsolatedWebSocketCheck(planFile, approvedDigest);
			console.log(JSON.stringify(result, null, 2));
			if (!result.passed) process.exitCode = 1;
		} catch (error) {
			console.error(
				error instanceof Error ? error.message : "Gate prerequisites failed",
			);
			process.exitCode = 1;
		}
	}
}
