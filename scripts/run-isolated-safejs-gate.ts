import { createHash } from "node:crypto";
import {
	constants,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	closeSync,
	fstatSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { launchNodeSafeJsGateProcess } from "../src/node-safejs-gate-process.js";
import { validateSafeJsReleaseEvidence } from "../src/safejs-release-evidence.js";
import {
	runSafeJsGate,
	type SafeJsGateReport,
	type SafeJsGateResult,
} from "./run-safejs-gate.js";

type Pin = { file: string; sha256: string };
type Inventory = { root: string; manifest: Pin; read: boolean };
type InventoryEntry = { sha256: string } | { link: string };
type Stage = "guard" | "core" | "page" | "modules";

export type IsolatedSafeJsGatePlan = {
	format: 1;
	version: string;
	scope: Pin;
	node: Pin;
	python: Pin;
	guard: Pin;
	preload: Pin;
	control: Pin;
	runtimeRoot: string;
	sdkRoot: string;
	inventories: Inventory[];
	prerequisites: Pin;
	outputParent: string;
};

const maximumJsonBytes = 8 * 1024 * 1024;
const maximumFileBytes = 256 * 1024 * 1024;
const systemReads = [
	"/usr/lib",
	"/usr/share/zoneinfo",
	"/lib",
	"/lib64",
	"/etc/ld.so.cache",
];
const guardFlags = [
	"installed",
	"truncateSyscallsAndOpenFlagsDenied",
	"openat2Denied",
	"noNewPrivileges",
	"noTty",
	"inheritedExtraDescriptorsClosed",
];
const controlFlags = [
	"passed",
	"fixtureOnly",
	"readControl",
	"deniedSyntheticRead",
	"deniedReadOnlyWrite",
	"deniedReadOnlyTruncate",
	"deniedCrossDirectoryLink",
	"ownedWrite",
	"spawnDenied",
	"workerDenied",
];

function requireValue(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
	return Object.keys(value).sort().join("\n") === keys.sort().join("\n");
}

function absolute(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 4096 &&
		!value.includes("\0") &&
		isAbsolute(value) &&
		resolve(value) === value
	);
}

function digest(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function pin(value: unknown): value is Pin {
	return (
		record(value) &&
		exactKeys(value, ["file", "sha256"]) &&
		absolute(value.file) &&
		digest(value.sha256)
	);
}

export function parseIsolatedSafeJsGatePlan(
	value: unknown,
): IsolatedSafeJsGatePlan {
	requireValue(record(value), "Gate plan must be an object");
	requireValue(
		exactKeys(value, [
			"format",
			"version",
			"scope",
			"node",
			"python",
			"guard",
			"preload",
			"control",
			"runtimeRoot",
			"sdkRoot",
			"inventories",
			"prerequisites",
			"outputParent",
		]),
		"Unexpected gate plan fields",
	);
	requireValue(value.format === 1, "Unsupported gate plan format");
	requireValue(
		typeof value.version === "string" &&
			value.version.length <= 64 &&
			/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version),
		"Explicit release version required",
	);
	for (const name of [
		"scope",
		"node",
		"python",
		"guard",
		"preload",
		"control",
		"prerequisites",
	])
		requireValue(pin(value[name]), `Invalid ${name} pin`);
	for (const name of ["runtimeRoot", "sdkRoot", "outputParent"])
		requireValue(absolute(value[name]), `Invalid ${name}`);
	requireValue(
		Array.isArray(value.inventories) &&
			value.inventories.length >= 2 &&
			value.inventories.length <= 16,
		"Two to sixteen explicit inventories required",
	);
	for (const inventory of value.inventories)
		requireValue(
			record(inventory) &&
				exactKeys(inventory, ["root", "manifest", "read"]) &&
				absolute(inventory.root) &&
				pin(inventory.manifest) &&
				typeof inventory.read === "boolean",
			"Invalid inventory",
		);
	return value as IsolatedSafeJsGatePlan;
}

function inside(file: string, root: string) {
	return file === root || file.startsWith(root + sep);
}

function readRegular(file: string, maximum: number): Buffer {
	const descriptor = openSync(
		file,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const metadata = fstatSync(descriptor);
		requireValue(
			metadata.isFile() && metadata.size <= maximum,
			`Not a bounded regular file: ${file}`,
		);
		const bytes = readFileSync(descriptor);
		requireValue(bytes.length <= maximum, `File grew beyond limit: ${file}`);
		return bytes;
	} finally {
		closeSync(descriptor);
	}
}

function hash(bytes: Buffer) {
	return createHash("sha256").update(bytes).digest("hex");
}

function verifyPin(input: Pin, maximum = maximumFileBytes) {
	requireValue(realpathSync(input.file) === input.file, "Pin path has aliases");
	const bytes = readRegular(input.file, maximum);
	requireValue(hash(bytes) === input.sha256, `Changed input: ${input.file}`);
	return bytes;
}

function readJson(file: string) {
	return JSON.parse(readRegular(file, maximumJsonBytes).toString("utf8"));
}

function save(file: string, value: unknown) {
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
		flag: "wx",
		mode: 0o600,
	});
}

function parseInventory(value: unknown): Record<string, InventoryEntry> {
	requireValue(record(value), "Inventory must be an object");
	const names = Object.keys(value);
	requireValue(
		names.length > 0 && names.length <= 20_000,
		"Invalid inventory size",
	);
	for (const name of names) {
		requireValue(
			name.length <= 4096 &&
				!isAbsolute(name) &&
				!name.includes("\0") &&
				name.split("/").every((part) => part && part !== "." && part !== ".."),
			"Invalid inventory entry path",
		);
		const entry = value[name];
		requireValue(
			record(entry) &&
				((exactKeys(entry, ["sha256"]) && digest(entry.sha256)) ||
					(exactKeys(entry, ["link"]) &&
						typeof entry.link === "string" &&
						entry.link.length > 0 &&
						entry.link.length <= 4096 &&
						!entry.link.includes("\0"))),
			"Invalid inventory entry",
		);
	}
	return value as Record<string, InventoryEntry>;
}

async function verifyInventory(inventory: Inventory, signal: AbortSignal) {
	requireValue(
		realpathSync(inventory.root) === inventory.root,
		"Aliased inventory root",
	);
	const entries = parseInventory(
		JSON.parse(verifyPin(inventory.manifest).toString("utf8")),
	);
	let visited = 0;
	let inspected = 0;
	const walk = async (directory: string, depth: number) => {
		requireValue(depth <= 64, "Inventory depth limit exceeded");
		for (const name of readdirSync(directory)) {
			inspected++;
			requireValue(inspected <= 40_000, "Inventory entry limit exceeded");
			if (inspected % 32 === 0)
				await new Promise<void>((resolve) => setImmediate(resolve));
			signal.throwIfAborted();
			const file = join(directory, name);
			const metadata = lstatSync(file);
			if (metadata.isDirectory()) {
				await walk(file, depth + 1);
				continue;
			}
			visited++;
			requireValue(visited <= 20_000, "Inventory file limit exceeded");
			const entry = entries[relative(inventory.root, file)];
			requireValue(entry, `Unrecorded inventory file: ${file}`);
			if ("sha256" in entry) {
				requireValue(metadata.isFile(), "Expected regular inventory file");
				requireValue(
					hash(readRegular(file, maximumFileBytes)) === entry.sha256,
					`Changed inventory file: ${file}`,
				);
			} else {
				requireValue(
					metadata.isSymbolicLink() && readlinkSync(file) === entry.link,
					"Changed dependency link",
				);
				requireValue(
					inside(realpathSync(file), inventory.root),
					"Dependency link escapes its inventory",
				);
			}
		}
	};
	await walk(inventory.root, 0);
	requireValue(
		visited === Object.keys(entries).length,
		"Missing inventory files",
	);
}

export function validateIsolatedSafeJsGuardEvidence(
	value: unknown,
	readPaths: readonly string[],
	writePaths: readonly string[],
	streams: readonly string[],
) {
	if (!record(value)) return false;
	const equal = (left: unknown, right: unknown) =>
		JSON.stringify(left) === JSON.stringify(right);
	const deniedSyscalls = value.deniedSyscalls;
	return (
		guardFlags.every((name) => value[name] === true) &&
		value.action === "EPERM" &&
		Number.isSafeInteger(value.landlockAbi) &&
		(value.landlockAbi as number) >= 1 &&
		value.minimumLandlockAbi === 1 &&
		value.handledAccessFs === 8191 &&
		value.openTruncateMask === constants.O_TRUNC &&
		value.coreLimitBytes === 0 &&
		Number.isSafeInteger(value.fileLimitBytes) &&
		(value.fileLimitBytes as number) > 0 &&
		(value.fileLimitBytes as number) <= 16_777_216 &&
		Number.isSafeInteger(value.fileHardLimitBytes) &&
		(value.fileHardLimitBytes as number) >= (value.fileLimitBytes as number) &&
		(value.fileHardLimitBytes as number) <= 16_777_216 &&
		value.socketProbePerformed === false &&
		value.privatePathProbePerformed === false &&
		equal(value.mechanisms, ["landlock", "seccomp"]) &&
		equal(value.readPaths, [...new Set(readPaths)].sort()) &&
		equal(value.executePaths, [...new Set(readPaths)].sort()) &&
		equal(value.writePaths, [...new Set(writePaths)].sort()) &&
		equal(value.standardStreams, streams) &&
		Array.isArray(deniedSyscalls) &&
		[
			"socket",
			"socketpair",
			"connect",
			"bind",
			"listen",
			"io_uring_setup",
			"openat2",
			"truncate",
			"ftruncate",
			"ptrace",
		].every((name) => deniedSyscalls.includes(name)) &&
		Array.isArray(value.limitations) &&
		value.limitations.length > 0
	);
}

async function verifyInputs(
	plan: IsolatedSafeJsGatePlan,
	planPin: Pin,
	signal: AbortSignal,
) {
	for (const input of [
		planPin,
		plan.scope,
		plan.node,
		plan.python,
		plan.guard,
		plan.preload,
		plan.control,
		plan.prerequisites,
	]) {
		signal.throwIfAborted();
		verifyPin(input);
	}
	for (const inventory of plan.inventories)
		await verifyInventory(inventory, signal);
	return true;
}

function validatePrerequisites(plan: IsolatedSafeJsGatePlan) {
	const receipt = JSON.parse(verifyPin(plan.prerequisites).toString("utf8"));
	requireValue(
		record(receipt) &&
			receipt.passed === true &&
			receipt.dependencyClosureVerified === true &&
			receipt.sourceAndBuildVerified === true &&
			receipt.version === plan.version &&
			receipt.scopeSha256 === plan.scope.sha256,
		"Qualified release/build/dependency prerequisites required",
	);
	const manifest = readJson(join(plan.sdkRoot, "package.json"));
	requireValue(
		manifest.name === "@poe-platform/safe-js" &&
			manifest.version === plan.version,
		"Wrong SDK package/version",
	);
	for (const root of [plan.runtimeRoot, plan.sdkRoot])
		requireValue(
			plan.inventories.some((entry) => entry.read && inside(root, entry.root)),
			"Runtime and SDK require read-only inventories",
		);
	for (const inventory of plan.inventories) {
		requireValue(
			!inside(plan.outputParent, inventory.root) &&
				!inside(inventory.root, plan.outputParent),
			"Inputs and output parent must not overlap",
		);
		requireValue(
			inventory.root !== "/" &&
				!["/home", "/root", "/etc", "/proc", "/dev", "/sys"].some(
					(root) =>
						inside(root, inventory.root) || inside(inventory.root, root),
				),
			"Broad or sensitive inventory grant",
		);
	}
	return true;
}

async function runStage(
	stage: Stage,
	plan: IsolatedSafeJsGatePlan,
	planPin: Pin,
	root: string,
	previousPassed: boolean,
) {
	const directory = join(root, stage);
	mkdirSync(directory, { mode: 0o700 });
	const output = join(directory, "output");
	mkdirSync(output, { mode: 0o700 });
	const environmentRoot = join(directory, "environment");
	mkdirSync(environmentRoot, { mode: 0o700 });
	for (const name of ["home", "tmp"])
		mkdirSync(join(environmentRoot, name), { mode: 0o700 });
	const openssl = join(output, "openssl.cnf");
	writeFileSync(openssl, "", { flag: "wx", mode: 0o600 });
	const stdoutFile = join(output, "stdout.json");
	const stderrFile = join(output, "stderr.txt");
	const readPaths = [
		...systemReads.map((file) => realpathSync(file)),
		plan.node.file,
		plan.preload.file,
		...plan.inventories
			.filter((entry) => entry.read)
			.map((entry) => entry.root),
		output,
	];
	const environment: Record<string, string> = {
		PATH: "/usr/bin:/bin",
		LANG: "C.UTF-8",
		LC_ALL: "C",
		TZ: "UTC",
		HOME: join(environmentRoot, "home"),
		TMPDIR: join(environmentRoot, "tmp"),
		SDK_GATE_REPORT: join(output, "preload.json"),
	};
	let script: string;
	const generated: Pin[] = [];
	if (stage === "guard") {
		const readOnly = join(directory, "readonly.txt");
		const denied = join(directory, "denied.txt");
		writeFileSync(readOnly, "read-only synthetic control\n", {
			flag: "wx",
			mode: 0o600,
		});
		writeFileSync(denied, "denied synthetic control\n", {
			flag: "wx",
			mode: 0o600,
		});
		save(join(output, "fixture.json"), { readOnly, denied });
		environment.SDK_GATE_FIXTURE = join(output, "fixture.json");
		readPaths.push(readOnly, plan.control.file);
		script = plan.control.file;
		for (const file of [readOnly, denied, environment.SDK_GATE_FIXTURE])
			generated.push({
				file,
				sha256: hash(readRegular(file, maximumJsonBytes)),
			});
	} else {
		environment.AGENT_BROWSER_SAFEJS_RELEASE_ROOT = plan.sdkRoot;
		environment.AGENT_BROWSER_SAFEJS_RELEASE_VERSION = plan.version;
		script = join(
			plan.runtimeRoot,
			"scripts",
			stage === "core"
				? "check-released-safejs.js"
				: stage === "page"
					? "check-released-page.js"
					: "check-released-html-modules.js",
		);
	}
	const policyFile = join(directory, "POLICY.json");
	const policy = {
		readPaths: [...new Set(readPaths)].sort(),
		writePaths: [output],
	};
	save(policyFile, policy);
	for (const file of [policyFile, openssl])
		generated.push({ file, sha256: hash(readRegular(file, maximumJsonBytes)) });
	const command = {
		command: plan.python.file,
		args: [
			"-B",
			plan.guard.file,
			policyFile,
			plan.node.file,
			`--openssl-config=${openssl}`,
			"--no-addons",
			"--max-old-space-size=384",
			"--require",
			plan.preload.file,
			script,
		],
		cwd: output,
		env: environment,
		stdoutFile,
		stderrFile,
	};
	save(join(directory, "INVOCATION.json"), {
		command,
		policy,
		deadlineMs: 45_000,
		sdkImported: stage !== "guard",
	});
	const controller = new AbortController();
	const deadline = setTimeout(
		() => controller.abort(new Error("Stage deadline exceeded")),
		45_000,
	);
	let result: SafeJsGateResult;
	try {
		result = await runSafeJsGate({
			signal: controller.signal,
			operationTimeoutMs: 45_000,
			cleanupTimeoutMs: 5_000,
			terminalTimeoutMs: 5_000,
			schedule: (milliseconds, expire) => {
				const timer = setTimeout(expire, milliseconds);
				return () => clearTimeout(timer);
			},
			prerequisites: () => previousPassed && validatePrerequisites(plan),
			guard: () => {
				for (const input of generated) verifyPin(input);
				return ["home", "tmp"].every(
					(name) => readdirSync(join(environmentRoot, name)).length === 0,
				);
			},
			pins: (_phase, signal) => verifyInputs(plan, planPin, signal),
			launch: (register) => {
				launchNodeSafeJsGateProcess(command, register);
				return undefined;
			},
			acceptance: (report) => {
				if (
					report.exitCode !== 0 ||
					!report.reaped ||
					!report.groupAbsent ||
					readRegular(stderrFile, maximumJsonBytes).length !== 0
				)
					return false;
				const preload = readJson(environment.SDK_GATE_REPORT);
				const expectedAttempts =
					stage === "guard"
						? ["node:child_process.spawn", "node:worker_threads.Worker"]
						: [];
				if (
					!record(preload) ||
					!exactKeys(preload, ["attempts"]) ||
					JSON.stringify(preload.attempts) !== JSON.stringify(expectedAttempts)
				)
					return false;
				if (
					!validateIsolatedSafeJsGuardEvidence(
						readJson(join(output, "kernel-guard.json")),
						policy.readPaths,
						policy.writePaths,
						["/dev/null", stdoutFile, stderrFile],
					)
				)
					return false;
				const evidence = readJson(stdoutFile);
				return stage === "guard"
					? record(evidence) &&
							controlFlags.every((name) => evidence[name] === true) &&
							evidence.sdkImported === false &&
							evidence.socketProbePerformed === false &&
							evidence.privatePathProbePerformed === false
					: validateSafeJsReleaseEvidence(stage, evidence, plan.version);
			},
			writeTerminal: (report: SafeJsGateReport) =>
				save(join(directory, "TERMINAL.json"), report),
		});
	} finally {
		clearTimeout(deadline);
	}
	save(join(directory, "RESULT.json"), result);
	return result.report.passed && result.terminalWritten;
}

export async function runIsolatedSafeJsGate(
	planFile: string,
	approvedPlanSha256: string,
) {
	requireValue(
		absolute(planFile) && digest(approvedPlanSha256),
		"An absolute plan and explicitly approved SHA256 are required",
	);
	const planPin = { file: planFile, sha256: approvedPlanSha256 };
	const plan = parseIsolatedSafeJsGatePlan(
		JSON.parse(verifyPin(planPin, maximumJsonBytes).toString("utf8")),
	);
	requireValue(
		process.platform === "linux" && process.arch === "x64",
		"Native x86-64 Linux is required",
	);
	requireValue(
		realpathSync(plan.outputParent) === plan.outputParent,
		"Output parent has aliases",
	);
	const metadata = lstatSync(plan.outputParent);
	requireValue(
		metadata.isDirectory() &&
			(metadata.mode & 0o077) === 0 &&
			metadata.uid === process.getuid?.(),
		"Output parent must be an owned private directory",
	);
	validatePrerequisites(plan);
	await verifyInputs(plan, planPin, new AbortController().signal);
	const root = mkdtempSync(join(plan.outputParent, "safejs-gate-"));
	const stages: { stage: Stage; passed: boolean }[] = [];
	let failure: string | undefined;
	try {
		for (const stage of ["guard", "core", "page", "modules"] as const) {
			const passed = await runStage(
				stage,
				plan,
				planPin,
				root,
				stages.every((entry) => entry.passed),
			);
			stages.push({ stage, passed });
			if (!passed) break;
		}
	} catch (error) {
		failure =
			error instanceof Error
				? error.message.slice(0, 1024)
				: "Unknown gate failure";
	}
	const result = {
		root,
		version: plan.version,
		planSha256: approvedPlanSha256,
		scopeSha256: plan.scope.sha256,
		passed:
			stages.length === 4 && stages.every((entry) => entry.passed) && !failure,
		stages,
		failure,
		limitations: [
			"Operator approval and prerequisite receipts are trusted inputs, not proof of user consent.",
			"System libraries are allowed from fixed OS paths and are not content-pinned.",
			"Deadlines are cooperative host timers; synchronous filesystem stalls need an external supervisor.",
			"Guard and child-written reports are not tamper-proof. This is not a hostile-code security boundary.",
			"The historical guard does not filter exec/clone/fork or ioctl; only isolated trusted release fixtures are in scope.",
			"No website, Zoom, audio, passkey, credential, socket, or TTY acceptance is implied.",
			"Only finite synthetic HTML modules are checked, not website scripts or top-level-await timing.",
		],
	};
	save(join(root, "RESULT.json"), result);
	return result;
}

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
			"Usage: run-isolated-safejs-gate PLAN_JSON --approved-plan-sha256 SHA256",
		);
		process.exitCode = 1;
	} else {
		try {
			const result = await runIsolatedSafeJsGate(planFile, approvedDigest);
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
