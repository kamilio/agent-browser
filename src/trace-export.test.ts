import {
	lstat,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
	CaptureArtifacts,
	type TraceDetails,
	validateTraceArtifact,
} from "./capture-artifacts.js";
import { type CaptureExecutor, readTrace } from "./capture-client.js";
import { parseInvocation } from "./cli-parser.js";
import { saveCapture } from "./node-capture.js";

const directories: string[] = [];
afterEach(async () => {
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});
async function directory() {
	const path = await mkdtemp(join(tmpdir(), "agent-browser-trace-"));
	directories.push(path);
	return path;
}
function fixture(
	text = "page text",
	mutate?: (trace: ReturnType<typeof payload>) => void,
	raw?: Uint8Array,
) {
	const trace = payload(text);
	mutate?.(trace);
	const bytes = raw ?? new TextEncoder().encode(JSON.stringify(trace));
	const details: TraceDetails = {
		mediaType: "application/json",
		partial: true,
		profile: "semantic-action-timeline",
		frames: 2,
		droppedFrames: 0,
		truncated: false,
	};
	const store = new CaptureArtifacts();
	const calls: string[][] = [];
	const execute: CaptureExecutor = async (argv) => {
		calls.push([...argv]);
		let data: unknown;
		if (argv[0] === "tracing-stop")
			data = store.addTrace("owner", bytes, details);
		else if (argv[0] === "artifact-read")
			data = store.read("owner", argv[1], Number(argv[2].split("=")[1]));
		else if (argv[0] === "artifact-delete") {
			store.delete("owner", argv[1]);
			data = { deleted: true };
		} else throw new Error("Unexpected command");
		return { schemaVersion: 1, command: argv[0], session: "owner", data };
	};
	return { trace, bytes, details, store, calls, execute };
}
function payload(text: string) {
	return {
		format: "agent-browser-trace-v1",
		schemaVersion: 1,
		partial: true,
		droppedFrames: 0,
		truncated: false,
		frames: ["tracing-start", "tracing-stop"].map((command, index) => ({
			sequence: index,
			atMs: index,
			action: { command, durationMs: 0, outcome: "returned" },
			snapshot: { text },
		})),
	};
}

it.each([false, true])(
	"does not report a completed trace read when its consumer aborts (async=%s)",
	async (asynchronous) => {
		const { execute, store, bytes, details } = fixture();
		const artifact = store.addTrace("owner", bytes, details);
		const controller = new AbortController();
		let delivered = 0;
		await expect(
			readTrace(
				execute,
				artifact,
				async (chunk) => {
					delivered += chunk.length;
					if (asynchronous)
						await new Promise<void>((resolve) => setImmediate(resolve));
					controller.abort();
				},
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(delivered).toBe(bytes.length);
		expect(store.list("owner")).toHaveLength(1);
	},
);

it("saves validated multichunk Unicode JSON privately, then releases its remote artifact", async () => {
	const { execute, store, calls, trace } = fixture("日本語 ".repeat(12_000));
	const root = await directory();
	const result = await saveCapture(
		parseInvocation(["tracing-stop", "--filename=trace.json"]),
		execute,
		root,
	);
	expect(JSON.parse(await readFile(result.filename, "utf8"))).toEqual(trace);
	expect((await lstat(result.filename)).mode & 0o777).toBe(0o600);
	expect(result.remoteCleanupConfirmed).toBe(true);
	expect(store.list("owner")).toEqual([]);
	expect(
		calls.filter((argv) => argv[0] === "artifact-read").length,
	).toBeGreaterThan(1);
	expect(await readdir(root)).toEqual(["trace.json"]);
});

it("does not replace an existing file and retains the trace artifact for recovery", async () => {
	const { execute, store } = fixture();
	const root = await directory();
	await writeFile(join(root, "trace.json"), "original");
	await expect(
		saveCapture(
			parseInvocation(["tracing-stop", "--filename=trace.json"]),
			execute,
			root,
		),
	).rejects.toThrow("trace artifact retained as capture-");
	expect(await readFile(join(root, "trace.json"), "utf8")).toBe("original");
	expect(store.list("owner")).toHaveLength(1);
	expect(await readdir(root)).toEqual(["trace.json"]);
});

it("retains a valid artifact if its destination directory cannot be opened", async () => {
	const { execute, store } = fixture();
	await expect(
		saveCapture(
			parseInvocation(["tracing-stop", "--filename=missing/trace.json"]),
			execute,
			await directory(),
		),
	).rejects.toThrow("trace artifact retained");
	expect(store.list("owner")).toHaveLength(1);
});

it.each(["trace.png", "trace.pdf", "trace.json\n"])(
	"rejects invalid path %j before stopping the recording",
	async (filename) => {
		const { execute, calls } = fixture();
		await expect(
			saveCapture(
				parseInvocation(["tracing-stop", `--filename=${filename}`]),
				execute,
				await directory(),
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(calls).toHaveLength(0);
	},
);

it.each([
	{ mediaType: "image/png" },
	{ profile: "unknown" },
	{ frames: 129 },
	{ frames: -1 },
	{ bytes: 2_097_153 },
	{ droppedFrames: -1 },
	{ truncated: true },
	{ id: "outside" },
])("rejects invalid trace metadata %j", (override) => {
	const { store, bytes, details } = fixture();
	const artifact = store.addTrace("owner", bytes, details);
	expect(() => validateTraceArtifact({ ...artifact, ...override })).toThrow(
		"Invalid trace artifact metadata",
	);
});

it.each([
	(trace: ReturnType<typeof payload>) => {
		trace.format = "unknown";
	},
	(trace: ReturnType<typeof payload>) => {
		trace.frames.pop();
	},
	(trace: ReturnType<typeof payload>) => {
		trace.frames[1].sequence = 0;
	},
	(trace: ReturnType<typeof payload>) => {
		trace.frames[0].action.command = "bad\ncommand";
	},
	(trace: ReturnType<typeof payload>) => {
		trace.frames[0].action.durationMs = -1;
	},
	(trace: ReturnType<typeof payload>) => {
		trace.frames[0].action.outcome = "maybe";
	},
])(
	"validates content before publishing or consuming a trace (%#)",
	async (mutate) => {
		const { execute, store } = fixture("text", mutate);
		const root = await directory();
		await expect(
			saveCapture(
				parseInvocation(["tracing-stop", "--filename=trace.json"]),
				execute,
				root,
			),
		).rejects.toMatchObject({ code: "invalid-input" });
		expect(await readdir(root)).toEqual([]);
		expect(store.list("owner")).toHaveLength(1);
	},
);

it("rejects invalid UTF-8 without delivering bytes to the consumer", async () => {
	const { execute } = fixture("text", undefined, Uint8Array.of(0xff, 0xff));
	const artifact = (await execute(["tracing-stop"])).data;
	const consume = vi.fn();
	await expect(readTrace(execute, artifact, consume)).rejects.toThrow(
		"Invalid trace JSON",
	);
	expect(consume).not.toHaveBeenCalled();
});

it("honors cancellation before artifact reads and does not consume data", async () => {
	const { execute, calls } = fixture();
	const artifact = (await execute(["tracing-stop"])).data;
	const controller = new AbortController();
	controller.abort();
	const consume = vi.fn();
	await expect(
		readTrace(execute, artifact, consume, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(calls).toHaveLength(1);
	expect(consume).not.toHaveBeenCalled();
});

it("reports successful local persistence even if remote cleanup fails", async () => {
	const { execute, store } = fixture();
	const result = await saveCapture(
		parseInvocation(["tracing-stop"]),
		(argv) => {
			if (argv[0] === "artifact-delete") throw new Error("unreachable service");
			return execute(argv);
		},
		await directory(),
	);
	expect(result.filename).toMatch(/\.json$/);
	expect(result.remoteCleanupConfirmed).toBe(false);
	expect(store.list("owner")).toHaveLength(1);
});
