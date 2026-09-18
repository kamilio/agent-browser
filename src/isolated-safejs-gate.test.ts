import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseIsolatedSafeJsGatePlan,
	runIsolatedSafeJsGate,
	validateIsolatedSafeJsGuardEvidence,
	type IsolatedSafeJsGatePlan,
} from "../scripts/run-isolated-safejs-gate.js";

const fixture = vi.hoisted(() => ({
	files: new Map<string, Buffer>(),
	directories: new Set<string>(),
	descriptors: new Map<number, string>(),
	openFlags: [] as number[],
	nonregular: new Set<string>(),
	serial: 10,
	launches: [] as string[],
	terminated: [] as string[],
	reaped: [] as string[],
	failStage: "",
	contaminateHome: false,
	changeInput: false,
	releaseEvidence: true,
	preloadAttempts: [] as string[],
}));

vi.mock("node:fs", async (original) => {
	const actual = await original<typeof import("node:fs")>();
	const metadata = (path: string) => ({
		isFile: () => fixture.files.has(path) && !fixture.nonregular.has(path),
		isDirectory: () => fixture.directories.has(path),
		isSymbolicLink: () => false,
		size: fixture.files.get(path)?.length ?? 0,
		mode: 0o700,
		uid: process.getuid?.(),
	});
	return {
		constants: actual.constants,
		openSync: (path: string, flags: number) => {
			fixture.openFlags.push(flags);
			if (!fixture.files.has(path)) throw new Error(`Missing fixture: ${path}`);
			const descriptor = ++fixture.serial;
			fixture.descriptors.set(descriptor, path);
			return descriptor;
		},
		closeSync: (descriptor: number) => fixture.descriptors.delete(descriptor),
		fstatSync: (descriptor: number) =>
			metadata(fixture.descriptors.get(descriptor) ?? ""),
		lstatSync: metadata,
		readFileSync: (descriptor: number) =>
			Buffer.from(
				fixture.files.get(fixture.descriptors.get(descriptor) ?? "") ?? [],
			),
		realpathSync: (path: string) => path,
		readlinkSync: () => {
			throw new Error("No links in this fixture");
		},
		mkdirSync: (path: string) => {
			if (fixture.directories.has(path)) throw new Error("Directory exists");
			fixture.directories.add(path);
		},
		mkdtempSync: (prefix: string) => {
			const path = `${prefix}${fixture.serial++}`;
			fixture.directories.add(path);
			return path;
		},
		readdirSync: (path: string) => [
			...new Set(
				[...fixture.directories, ...fixture.files.keys()]
					.filter((name) => dirname(name) === path && name !== path)
					.map((name) => name.slice(path.length + 1)),
			),
		],
		writeFileSync: (path: string, contents: string) => {
			if (fixture.files.has(path)) throw new Error(`Output exists: ${path}`);
			fixture.files.set(path, Buffer.from(contents));
		},
	};
});

vi.mock("./safejs-release-evidence.js", () => ({
	validateSafeJsReleaseEvidence: () => fixture.releaseEvidence,
}));

vi.mock("./node-safejs-gate-process.js", () => ({
	launchNodeSafeJsGateProcess: (
		command: {
			args: string[];
			cwd: string;
			stdoutFile: string;
			stderrFile: string;
			env: Record<string, string>;
		},
		register: (value: unknown) => undefined,
	) => {
		const stage = dirname(command.cwd).split("/").at(-1) ?? "";
		fixture.launches.push(stage);
		const policy = JSON.parse(
			fixture.files.get(command.args[2])?.toString() ?? "{}",
		);
		fixture.files.set(
			join(command.cwd, "kernel-guard.json"),
			Buffer.from(
				JSON.stringify(
					kernelEvidence(policy.readPaths, policy.writePaths, [
						"/dev/null",
						command.stdoutFile,
						command.stderrFile,
					]),
				),
			),
		);
		fixture.files.set(
			join(command.cwd, "preload.json"),
			Buffer.from(
				JSON.stringify({
					attempts:
						stage === "guard"
							? ["node:child_process.spawn", "node:worker_threads.Worker"]
							: fixture.preloadAttempts,
				}),
			),
		);
		fixture.files.set(command.stderrFile, Buffer.from(""));
		fixture.files.set(
			command.stdoutFile,
			Buffer.from(
				JSON.stringify({
					passed: true,
					fixtureOnly: true,
					readControl: true,
					deniedSyntheticRead: true,
					deniedReadOnlyWrite: true,
					deniedReadOnlyTruncate: true,
					deniedCrossDirectoryLink: true,
					ownedWrite: true,
					spawnDenied: true,
					workerDenied: true,
					sdkImported: false,
					socketProbePerformed: false,
					privatePathProbePerformed: false,
				}),
			),
		);
		if (fixture.contaminateHome)
			fixture.files.set(join(command.env.HOME, "leak"), Buffer.from("fixture"));
		if (fixture.changeInput)
			fixture.files.set(
				"/fixture/runtime/scripts/check-released-safejs.js",
				Buffer.from("changed"),
			);
		register({
			wait: () => (stage === fixture.failStage ? 1 : 0),
			terminateGroup: () => {
				fixture.terminated.push(stage);
			},
			reap: () => {
				fixture.reaped.push(stage);
			},
			waitForGroupAbsent: () => true,
		});
	},
}));

function kernelEvidence(
	readPaths: string[],
	writePaths: string[],
	streams: string[],
) {
	return {
		installed: true,
		mechanisms: ["landlock", "seccomp"],
		landlockAbi: 1,
		minimumLandlockAbi: 1,
		handledAccessFs: 8191,
		truncateSyscallsAndOpenFlagsDenied: true,
		openTruncateMask: constants.O_TRUNC,
		openat2Denied: true,
		readPaths: [...new Set(readPaths)].sort(),
		writePaths: [...new Set(writePaths)].sort(),
		executePaths: [...new Set(readPaths)].sort(),
		deniedSyscalls: [
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
		],
		action: "EPERM",
		noNewPrivileges: true,
		fileLimitBytes: 16_777_216,
		fileHardLimitBytes: 16_777_216,
		coreLimitBytes: 0,
		noTty: true,
		standardStreams: streams,
		inheritedExtraDescriptorsClosed: true,
		socketProbePerformed: false,
		privatePathProbePerformed: false,
		limitations: ["Synthetic fixture, not isolation evidence"],
	};
}

function addFile(file: string, contents: string) {
	const bytes = Buffer.from(contents);
	fixture.files.set(file, bytes);
	let directory = dirname(file);
	while (directory !== "/") {
		fixture.directories.add(directory);
		directory = dirname(directory);
	}
	return { file, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function makePlan(): IsolatedSafeJsGatePlan {
	const scope = addFile(
		"/metadata/scope.md",
		"explicit synthetic fixture authorization",
	);
	const node = addFile("/tools/node", "node fixture");
	const python = addFile("/tools/python", "python fixture");
	const guard = addFile("/tools/guard.py", "guard fixture");
	const preload = addFile("/tools/preload.cjs", "preload fixture");
	const control = addFile("/tools/control.mjs", "control fixture");
	const core = addFile(
		"/fixture/runtime/scripts/check-released-safejs.js",
		"core fixture",
	);
	const page = addFile(
		"/fixture/runtime/scripts/check-released-page.js",
		"page fixture",
	);
	const modules = addFile(
		"/fixture/runtime/scripts/check-released-html-modules.js",
		"modules fixture",
	);
	const sdk = addFile(
		"/fixture/deps/sdk/package.json",
		JSON.stringify({ name: "@poe-platform/safe-js", version: "0.1.640" }),
	);
	const runtime = addFile(
		"/metadata/runtime.json",
		JSON.stringify({
			"scripts/check-released-safejs.js": { sha256: core.sha256 },
			"scripts/check-released-page.js": { sha256: page.sha256 },
			"scripts/check-released-html-modules.js": { sha256: modules.sha256 },
		}),
	);
	const dependency = addFile(
		"/metadata/dependencies.json",
		JSON.stringify({ "sdk/package.json": { sha256: sdk.sha256 } }),
	);
	const prerequisites = addFile(
		"/metadata/prerequisites.json",
		JSON.stringify({
			passed: true,
			dependencyClosureVerified: true,
			sourceAndBuildVerified: true,
			version: "0.1.640",
			scopeSha256: scope.sha256,
		}),
	);
	fixture.directories.add("/output-private");
	return {
		format: 1,
		version: "0.1.640",
		scope,
		node,
		python,
		guard,
		preload,
		control,
		runtimeRoot: "/fixture/runtime",
		sdkRoot: "/fixture/deps/sdk",
		inventories: [
			{ root: "/fixture/runtime", manifest: runtime, read: true },
			{ root: "/fixture/deps", manifest: dependency, read: true },
		],
		prerequisites,
		outputParent: "/output-private",
	};
}

function execute(plan = makePlan()) {
	const input = addFile("/metadata/plan.json", JSON.stringify(plan));
	return runIsolatedSafeJsGate(input.file, input.sha256);
}

beforeEach(() => {
	fixture.files.clear();
	fixture.directories.clear();
	fixture.descriptors.clear();
	fixture.openFlags.length = 0;
	fixture.nonregular.clear();
	fixture.launches.length = 0;
	fixture.terminated.length = 0;
	fixture.reaped.length = 0;
	fixture.failStage = "";
	fixture.contaminateHome = false;
	fixture.changeInput = false;
	fixture.releaseEvidence = true;
	fixture.preloadAttempts = [];
});

describe("isolated SafeJS gate plan", () => {
	it("accepts the bounded explicit plan", () =>
		expect(parseIsolatedSafeJsGatePlan(makePlan()).version).toBe("0.1.640"));
	it.each([
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
	])("rejects missing %s", (name) => {
		const plan = { ...makePlan() } as Record<string, unknown>;
		delete plan[name];
		expect(() => parseIsolatedSafeJsGatePlan(plan)).toThrow();
	});
	it.each([null, [], "plan", 1])("rejects non-object %j", (value) =>
		expect(() => parseIsolatedSafeJsGatePlan(value)).toThrow(),
	);
	it("rejects unknown command injection fields", () =>
		expect(() =>
			parseIsolatedSafeJsGatePlan({
				...makePlan(),
				args: ["--eval", "fixture"],
			}),
		).toThrow());
	it.each(["relative", "/fixture/../other", "/fixture\0bad"])(
		"rejects noncanonical path %j",
		(path) =>
			expect(() =>
				parseIsolatedSafeJsGatePlan({ ...makePlan(), sdkRoot: path }),
			).toThrow(),
	);
	it("rejects unpinned inputs", () =>
		expect(() =>
			parseIsolatedSafeJsGatePlan({
				...makePlan(),
				node: { file: "/node", sha256: "missing" },
			}),
		).toThrow());
});

describe("isolated SafeJS gate stages without real processes", () => {
	it("keeps HOME and TMP outside every granted policy tree", async () => {
		const result = await execute();
		expect(result.passed).toBe(true);
		for (const stage of fixture.launches) {
			const invocation = JSON.parse(
				fixture.files
					.get(join(result.root, stage, "INVOCATION.json"))
					?.toString() ?? "{}",
			);
			for (const location of [
				invocation.command.env.HOME,
				invocation.command.env.TMPDIR,
			])
				for (const grant of [
					...invocation.policy.readPaths,
					...invocation.policy.writePaths,
				])
					expect(location === grant || location.startsWith(`${grant}/`)).toBe(
						false,
					);
		}
	});
	it("opens inspected files nonblocking so a substituted FIFO cannot hang open", async () => {
		await execute();
		expect(fixture.openFlags.length).toBeGreaterThan(0);
		expect(
			fixture.openFlags.every((flags) => (flags & constants.O_NONBLOCK) !== 0),
		).toBe(true);
	});
	it("rejects a nonregular opened input and closes its descriptor without launch", async () => {
		const plan = makePlan();
		fixture.nonregular.add(plan.node.file);
		await expect(execute(plan)).rejects.toThrow("Not a bounded regular file");
		expect(fixture.launches).toEqual([]);
		expect(fixture.descriptors.size).toBe(0);
	});
	it("runs guard, core, page and modules with independent cleanup and terminal records", async () => {
		const result = await execute();
		expect(result.passed).toBe(true);
		expect(fixture.launches).toEqual(["guard", "core", "page", "modules"]);
		expect(fixture.terminated).toEqual(fixture.launches);
		expect(fixture.reaped).toEqual(fixture.launches);
		expect(fixture.descriptors.size).toBe(0);
		for (const stage of fixture.launches) {
			const terminal = JSON.parse(
				fixture.files
					.get(join(result.root, stage, "TERMINAL.json"))
					?.toString() ?? "{}",
			);
			expect(terminal.passed).toBe(true);
		}
	});
	it.each(["guard", "core", "page", "modules"])(
		"stops after failed %s without retries",
		async (stage) => {
			fixture.failStage = stage;
			const result = await execute();
			expect(result.passed).toBe(false);
			expect(fixture.launches.at(-1)).toBe(stage);
			expect(new Set(fixture.launches).size).toBe(fixture.launches.length);
			expect(fixture.reaped).toEqual(fixture.launches);
		},
	);
	it("requires matching explicit plan approval before launch", async () => {
		const input = addFile("/metadata/plan.json", JSON.stringify(makePlan()));
		await expect(
			runIsolatedSafeJsGate(input.file, "0".repeat(64)),
		).rejects.toThrow("Changed input");
		expect(fixture.launches).toEqual([]);
	});
	it("rejects stale dependencies before launch", async () => {
		const plan = makePlan();
		fixture.files.set(
			"/fixture/deps/sdk/package.json",
			Buffer.from(
				'{"name":"@poe-platform/safe-js","version":"0.1.640","changed":true}',
			),
		);
		await expect(execute(plan)).rejects.toThrow("Changed inventory file");
		expect(fixture.launches).toEqual([]);
	});
	it("rejects newly inserted dependency files", async () => {
		const plan = makePlan();
		addFile("/fixture/deps/injected.js", "fixture");
		await expect(execute(plan)).rejects.toThrow("Unrecorded inventory file");
		expect(fixture.launches).toEqual([]);
	});
	it("rejects missing inventory files", async () => {
		const plan = makePlan();
		fixture.files.delete("/fixture/runtime/scripts/check-released-page.js");
		await expect(execute(plan)).rejects.toThrow("Missing inventory files");
	});
	it("fails post-launch pin mutation and still cleans up", async () => {
		fixture.changeInput = true;
		expect((await execute()).passed).toBe(false);
		expect(fixture.launches).toEqual(["guard"]);
		expect(fixture.reaped).toEqual(["guard"]);
	});
	it("rejects nonempty isolated HOME after execution", async () => {
		fixture.contaminateHome = true;
		expect((await execute()).passed).toBe(false);
		expect(fixture.launches).toEqual(["guard"]);
	});
	it("requires release evidence before progressing to page", async () => {
		fixture.releaseEvidence = false;
		expect((await execute()).passed).toBe(false);
		expect(fixture.launches).toEqual(["guard", "core"]);
	});
	it("rejects attempted forbidden operations during core checks", async () => {
		fixture.preloadAttempts = ["fetch"];
		expect((await execute()).passed).toBe(false);
		expect(fixture.launches).toEqual(["guard", "core"]);
	});
	it("rejects overlapping outputs and read-only inputs", async () => {
		const plan = makePlan();
		plan.outputParent = "/fixture";
		await expect(execute(plan)).rejects.toThrow("must not overlap");
		expect(fixture.launches).toEqual([]);
	});
});

describe("kernel installation evidence is not optional", () => {
	const reads = ["/fixture/read"];
	const writes = ["/fixture/output"];
	const streams = [
		"/dev/null",
		"/fixture/output/stdout",
		"/fixture/output/stderr",
	];
	it("accepts the exact synthetic installation report", () =>
		expect(
			validateIsolatedSafeJsGuardEvidence(
				kernelEvidence(reads, writes, streams),
				reads,
				writes,
				streams,
			),
		).toBe(true));
	it.each([
		"installed",
		"noNewPrivileges",
		"noTty",
		"openat2Denied",
		"truncateSyscallsAndOpenFlagsDenied",
		"inheritedExtraDescriptorsClosed",
	])("rejects missing %s", (field) => {
		const evidence = kernelEvidence(reads, writes, streams) as Record<
			string,
			unknown
		>;
		delete evidence[field];
		expect(
			validateIsolatedSafeJsGuardEvidence(evidence, reads, writes, streams),
		).toBe(false);
	});
	it.each([
		["writePaths", ["/"]],
		["readPaths", ["/"]],
		["executePaths", ["/"]],
		["landlockAbi", 0],
		["coreLimitBytes", 1],
		["fileLimitBytes", 32_000_000],
		["deniedSyscalls", []],
		["standardStreams", ["pipe", "pipe", "pipe"]],
		["socketProbePerformed", true],
		["privatePathProbePerformed", true],
		["limitations", []],
	])("rejects changed %s", (field, value) => {
		expect(
			validateIsolatedSafeJsGuardEvidence(
				{ ...kernelEvidence(reads, writes, streams), [field as string]: value },
				reads,
				writes,
				streams,
			),
		).toBe(false);
	});
});
