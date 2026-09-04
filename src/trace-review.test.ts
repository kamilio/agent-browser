import { readFile } from "node:fs/promises";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { readTrace } from "./capture-client.js";
import { parseHtmlDocument } from "./html-parser.js";
import {
	loadPlaygroundAssets,
	playgroundDependencyPaths,
} from "./node-playground-assets.js";
import { BrowserSession } from "./session.js";
import {
	describeTraceFrame,
	parseTraceForReview,
	readTraceFile,
} from "./trace-review.js";

function payload() {
	return {
		format: "agent-browser-trace-v1",
		schemaVersion: 1,
		partial: true,
		startedAt: "2026-09-03T12:00:00.000Z",
		endedAt: "2026-09-03T12:00:01.000Z",
		droppedFrames: 0,
		truncated: false,
		frames: [
			{
				sequence: 0,
				atMs: 0,
				action: {
					command: "tracing-start",
					outcome: "returned",
					durationMs: 0,
				},
				tabs: [
					{
						id: "tab-1",
						selected: true,
						loading: false,
						documentRef: "e1",
						url: "https://fixture.invalid/?redacted",
					},
				],
				activeTab: "tab-1",
				snapshot: {
					document: "e1",
					scope: "e1",
					revision: 2,
					truncated: false,
					entries: [{ ref: "e2", role: "heading", name: "Heading", depth: 1 }],
				},
				network: {
					scope: "latest-network-navigation",
					navigation: 1,
					document: "e1",
					displayedDocument: "e1",
					dropped: 0,
					entries: [
						{
							index: 0,
							kind: "document",
							method: "GET",
							url: "https://fixture.invalid/",
							state: "complete",
							status: 200,
							elapsedMs: 1,
						},
					],
				},
			},
		],
	};
}
function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value));
}

it("validates, projects and freezes a native trace without retaining unknown executable fields", () => {
	const source = payload();
	Object.assign(source.frames[0].snapshot.entries[0], {
		value: "secret value",
		onclick: "execute()",
	});
	Object.assign(source.frames[0], {
		source: "private code",
		unrecognized: { huge: "discard" },
	});
	const trace = parseTraceForReview(bytes(source));
	expect(Object.isFrozen(trace.frames[0].snapshot?.entries[0])).toBe(true);
	expect(JSON.stringify(trace)).not.toMatch(
		/secret value|execute\(\)|private code|unrecognized/,
	);
	expect(describeTraceFrame(trace.frames[0]).snapshotText).toContain(
		'e2 heading "Heading"',
	);
	expect(describeTraceFrame(trace.frames[0]).networkText).toContain(
		'"status":200',
	);
});

it.each([
	[
		"format",
		(source: ReturnType<typeof payload>) => {
			source.format = "playwright";
		},
	],
	[
		"version",
		(source: ReturnType<typeof payload>) => {
			source.schemaVersion = 2;
		},
	],
	[
		"timestamp",
		(source: ReturnType<typeof payload>) => {
			source.startedAt = "2026-02-31T12:00:00.000Z";
		},
	],
	[
		"omissions",
		(source: ReturnType<typeof payload>) => {
			source.truncated = true;
		},
	],
	[
		"frame count",
		(source: ReturnType<typeof payload>) => {
			source.frames = Array(129).fill(source.frames[0]);
		},
	],
	[
		"frame ordering",
		(source: ReturnType<typeof payload>) => {
			source.frames.push(source.frames[0]);
		},
	],
	[
		"command",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].action.command = "<script>";
		},
	],
	[
		"outcome",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].action.outcome = "success";
		},
	],
	[
		"negative duration",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].action.durationMs = -1;
		},
	],
	[
		"tabs",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].tabs.push(source.frames[0].tabs[0]);
		},
	],
	[
		"selection",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].activeTab = "other";
		},
	],
	[
		"document",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].snapshot.document = "foreign";
		},
	],
	[
		"duplicate refs",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].snapshot.entries.push(
				source.frames[0].snapshot.entries[0],
			);
		},
	],
	[
		"snapshot entry cap",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].snapshot.entries = Array(257).fill(
				source.frames[0].snapshot.entries[0],
			);
		},
	],
	[
		"name cap",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].snapshot.entries[0].name = "x".repeat(257);
		},
	],
	[
		"depth",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].snapshot.entries[0].depth = 1025;
		},
	],
	[
		"boolean state",
		(source: ReturnType<typeof payload>) => {
			Object.assign(source.frames[0].snapshot.entries[0], { checked: "yes" });
		},
	],
	[
		"component conflict",
		(source: ReturnType<typeof payload>) => {
			Object.assign(source.frames[0], { snapshotError: "unsupported" });
		},
	],
	[
		"network scope",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].network.scope = "all traffic";
		},
	],
	[
		"network bounds",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].network.entries = Array(65).fill(
				source.frames[0].network.entries[0],
			);
		},
	],
	[
		"network ordering",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].network.entries.push(
				source.frames[0].network.entries[0],
			);
		},
	],
	[
		"network state",
		(source: ReturnType<typeof payload>) => {
			source.frames[0].network.entries[0].state = "unknown";
		},
	],
] as const)("rejects invalid %s before rendering", (_label, mutate) => {
	const source = payload();
	mutate(source);
	expect(() => parseTraceForReview(bytes(source))).toThrow(
		"Invalid or unsupported",
	);
});

it("keeps component failures and empty/truncated traces explicit", () => {
	const source = payload();
	const failed = {
		sequence: 0,
		atMs: 0,
		action: source.frames[0].action,
		sessionError: "closed",
	};
	const reviewed = parseTraceForReview(bytes({ ...source, frames: [failed] }));
	expect(describeTraceFrame(reviewed.frames[0]).snapshotText).toContain(
		"unavailable",
	);
	expect(reviewed.frames[0].errors.sessionError).toBe("closed");
	expect(
		parseTraceForReview(
			bytes({ ...source, frames: [], droppedFrames: 2, truncated: true }),
		).frames,
	).toEqual([]);
});

it("retains HTML-looking names and URLs strictly as text and caps indentation", () => {
	const source = payload();
	source.frames[0].snapshot.entries[0].name =
		'<img src="https://evil.invalid/" onerror="steal()">';
	source.frames[0].snapshot.entries[0].depth = 1024;
	const output = describeTraceFrame(
		parseTraceForReview(bytes(source)).frames[0],
	);
	expect(output.snapshotText).toContain("<img");
	expect(output.snapshotText.length).toBeLessThan(500);
});

it("rejects oversize input and invalid UTF-8 before retaining a trace", () => {
	expect(() => parseTraceForReview(new Uint8Array(2_097_153))).toThrow("2 MiB");
	expect(() => parseTraceForReview(Uint8Array.of(0xff, 0xff))).toThrow(
		"Invalid or unsupported",
	);
});

it("reads an actual bounded Blob stream without needing a session", async () => {
	const blob = new Blob([bytes(payload())]);
	const result = await readTraceFile(blob, new AbortController().signal);
	expect(result.frames).toHaveLength(1);
});

it("rejects declared size before opening the stream", async () => {
	const stream = vi.fn();
	await expect(
		readTraceFile({ size: 2_097_153, stream }, new AbortController().signal),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(stream).not.toHaveBeenCalled();
});

it.each([1, 99])(
	"rejects a stream inconsistent with declared size %i",
	async (size) => {
		const file = {
			size,
			stream: () =>
				new ReadableStream<Uint8Array<ArrayBuffer>>({
					start(controller) {
						controller.enqueue(Uint8Array.of(1, 2));
						controller.close();
					},
				}),
		};
		await expect(
			readTraceFile(file, new AbortController().signal),
		).rejects.toThrow();
	},
);

it.each(["pending", "rejected"])(
	"preserves a bounds failure without waiting for %s stream cancellation",
	async (mode) => {
		let finishCancel: (() => void) | undefined;
		const canceled = vi.fn(() =>
			mode === "pending"
				? new Promise<void>((resolve) => {
						finishCancel = resolve;
					})
				: Promise.reject(new Error("cleanup failed")),
		);
		const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
			start(controller) {
				controller.enqueue(Uint8Array.of(1, 2));
			},
			cancel: canceled,
		});
		let result: unknown;
		const pending = readTraceFile(
			{ size: 1, stream: () => stream },
			new AbortController().signal,
		).catch((error: unknown) => {
			result = error;
		});
		try {
			await vi.waitFor(() =>
				expect(result).toMatchObject({ code: "resource-limit" }),
			);
			expect(canceled).toHaveBeenCalledOnce();
			expect(stream.locked).toBe(false);
		} finally {
			finishCancel?.();
			await pending;
		}
	},
);

it.each(["pending", "rejected"])(
	"releases an aborted reader even when underlying cancellation is %s",
	async (mode) => {
		let finishCancel: (() => void) | undefined;
		const canceled = vi.fn(() =>
			mode === "pending"
				? new Promise<void>((resolve) => {
						finishCancel = resolve;
					})
				: Promise.reject(new Error("cleanup failed")),
		);
		const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
			cancel: canceled,
		});
		const controller = new AbortController();
		const pending = readTraceFile(
			{ size: 12, stream: () => stream },
			controller.signal,
		);
		controller.abort();
		try {
			await expect(pending).rejects.toMatchObject({ code: "aborted" });
			expect(canceled).toHaveBeenCalledOnce();
			expect(stream.locked).toBe(false);
		} finally {
			finishCancel?.();
		}
	},
);

it("exports local trace review through the standalone public API", async () => {
	const api = await import("./index.js");
	expect(api.parseTraceForReview).toBe(parseTraceForReview);
	expect(api.readTraceFile).toBe(readTraceFile);
	expect(api.describeTraceFrame).toBe(describeTraceFrame);
});

it("cancels an in-flight file read and releases its reader", async () => {
	const canceled = vi.fn();
	const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
		cancel: canceled,
	});
	const controller = new AbortController();
	const pending = readTraceFile(
		{ size: 12, stream: () => stream },
		controller.signal,
	);
	controller.abort();
	await expect(pending).rejects.toMatchObject({ code: "aborted" });
	expect(canceled).toHaveBeenCalledOnce();
	expect(stream.locked).toBe(false);
});

it("validates actual command-host exports and retained snapshots after session closure", async () => {
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: 1,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) =>
					parseHtmlDocument(
						'<input id="field" aria-label="Name"><h1>Real document</h1>',
						response.url,
					),
			}),
	});
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		await host.execute(["tracing-start"]);
		await host.execute(["fill", "#field", "secret"]);
		const artifact = (await host.execute(["tracing-stop"])).data;
		let output: Uint8Array = new Uint8Array();
		await readTrace(
			(argv) => host.execute(argv),
			artifact,
			(chunk) => {
				output = chunk;
			},
		);
		host.close();
		const trace = parseTraceForReview(output);
		expect(trace.frames).toHaveLength(3);
		expect(describeTraceFrame(trace.frames[1]).snapshotText).toContain(
			"Real document",
		);
		expect(JSON.stringify(trace)).not.toContain("secret");
	} finally {
		host.close();
	}
});

it("packages every browser-side runtime import behind the server's shared asset paths", async () => {
	const assets = await loadPlaygroundAssets(
		async (name) =>
			ts.transpileModule(
				await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8"),
				{
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.ESNext,
						verbatimModuleSyntax: true,
					},
				},
			).outputText,
	);
	const modules = new Map<string, string>([
		["/playground.js", assets.script],
		...playgroundDependencyPaths.map(
			([key, path]) => [path, assets[key]] as [string, string],
		),
	]);
	for (const [path, source] of modules) {
		const parsed = ts.createSourceFile(
			path,
			source,
			ts.ScriptTarget.ES2022,
			true,
			ts.ScriptKind.JS,
		);
		for (const statement of parsed.statements) {
			if (
				(!ts.isImportDeclaration(statement) &&
					!ts.isExportDeclaration(statement)) ||
				!statement.moduleSpecifier
			)
				continue;
			if (!ts.isStringLiteral(statement.moduleSpecifier))
				throw new Error("Unexpected module expression");
			expect(
				modules.has(
					new URL(
						statement.moduleSpecifier.text,
						`https://fixture.invalid${path}`,
					).pathname,
				),
			).toBe(true);
		}
	}
	expect(assets.html).toContain('id="trace-file"');
	expect(modules.has("/trace-review.js")).toBe(true);
	expect(modules.has("/trace-view.js")).toBe(true);
	expect(modules.has("/terminal-tabs.js")).toBe(true);
});
