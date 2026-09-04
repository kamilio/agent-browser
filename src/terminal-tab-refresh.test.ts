import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { describe, expect, it, vi } from "vitest";
import type { CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import { runTerminal } from "./node-terminal.js";

function fixture() {
	const input = Object.assign(new PassThrough(), {
		isTTY: true,
		isRaw: false,
		setRawMode: vi.fn(function (this: { isRaw: boolean }, raw: boolean) {
			this.isRaw = raw;
		}),
	});
	input.pause();
	const output = Object.assign(new PassThrough(), {
		isTTY: true,
		columns: 140,
		rows: 12,
	});
	let frame = "";
	output.on("data", (chunk) => {
		const text = chunk.toString();
		if (text.startsWith("\x1b[1;1H")) frame = text;
	});
	let key = "epoch:tab-1";
	let document = "doc1";
	let phase = 0;
	let intercept: ((phase: number) => void | Promise<void>) | undefined;
	const tabs = () => [
		{
			index: 0,
			id: "tab-1",
			key,
			selected: true,
			loading: false,
			url: `https://fixture.invalid/${document}`,
			documentRef: document,
		},
	];
	const execute = vi.fn(
		async (
			argv: readonly string[],
			_signal: AbortSignal,
		): Promise<CommandResult> => {
			await intercept?.(++phase);
			return {
				schemaVersion: 1,
				command: argv[0],
				session: "shared",
				data:
					argv[0] === "snapshot"
						? {
								document,
								scope: "root",
								revision: 1,
								truncated: false,
								entries: [
									{
										ref: `${document}:1`,
										role: "link",
										name: `Private ${document} content`,
										href: "/next",
										depth: 0,
									},
								],
							}
						: tabs(),
			};
		},
	);
	const running = runTerminal({
		input: input as unknown as ReadStream,
		output: output as unknown as WriteStream,
		execute,
		session: "shared",
		pollMs: 60_000,
	});
	return {
		input,
		execute,
		frame: () => frame,
		ready: () =>
			vi.waitFor(() => expect(frame).toContain("Private doc1 content")),
		intercept(callback?: typeof intercept) {
			phase = 0;
			intercept = callback;
		},
		replace(nextKey: string, nextDocument = document) {
			key = nextKey;
			document = nextDocument;
		},
		async stop() {
			input.emit("keypress", "", { name: "c", ctrl: true });
			await running;
		},
	};
}

describe("terminal tab refresh ownership", () => {
	for (const phase of [1, 2, 3]) {
		it.each(["network-error", "not-found", "resource-limit"] as const)(
			`clears unusable page actions after %s at refresh phase ${phase}`,
			async (code) => {
				const test = fixture();
				try {
					await test.ready();
					test.intercept((current) => {
						if (current === phase)
							throw new AgentBrowserError(code, "hidden details");
					});
					test.input.write("u");
					await vi.waitFor(() => expect(test.frame()).toContain(`${code}:`));
					expect(test.frame()).not.toContain("Private doc1 content");
					expect(test.frame()).not.toContain("fixture.invalid/doc1");
					expect(test.frame()).not.toContain("hidden details");
					const calls = test.execute.mock.calls.length;
					test.input.emit("keypress", "", { name: "return" });
					expect(test.execute).toHaveBeenCalledTimes(calls);
					test.intercept();
					test.replace("epoch:tab-2", "doc2");
					test.input.write("u");
					await vi.waitFor(() =>
						expect(test.frame()).toContain("Private doc2 content"),
					);
				} finally {
					await test.stop();
				}
			},
		);
	}

	it.each([1, 3])(
		"clears old actions when metadata fails validation at phase %s",
		async (phase) => {
			const test = fixture();
			try {
				await test.ready();
				test.intercept((current) => {
					if (current === phase) test.replace("");
				});
				test.input.write("u");
				await vi.waitFor(() =>
					expect(test.frame()).toContain("invalid-input:"),
				);
				expect(test.frame()).not.toContain("Private doc1 content");
			} finally {
				await test.stop();
			}
		},
	);

	it("rejects changed tab identity even if document text and references are unchanged", async () => {
		const test = fixture();
		try {
			await test.ready();
			test.intercept((phase) => {
				if (phase === 3) test.replace("replacement:tab-1");
			});
			test.input.write("u");
			await vi.waitFor(() =>
				expect(test.frame()).toContain("stale-reference:"),
			);
			expect(test.frame()).not.toContain("Private doc1 content");
		} finally {
			await test.stop();
		}
	});

	it("keeps same-tab page actions after a verified unchanged refresh", async () => {
		const test = fixture();
		try {
			await test.ready();
			const calls = test.execute.mock.calls.length;
			test.input.write("u");
			await vi.waitFor(() =>
				expect(test.execute).toHaveBeenCalledTimes(calls + 3),
			);
			expect(test.frame()).toContain("Private doc1 content");
			test.input.emit("keypress", "", { name: "return" });
			await vi.waitFor(() =>
				expect(test.execute.mock.calls.map(([argv]) => argv)).toContainEqual([
					"click",
					"doc1:1",
				]),
			);
		} finally {
			await test.stop();
		}
	});

	it.each(["return", "close"])(
		"detaches during guarded %s without publishing a late reply",
		async (action) => {
			const test = fixture();
			let release = () => {};
			const pending = new Promise<void>((resolve) => {
				release = resolve;
			});
			try {
				await test.ready();
				test.input.write("T");
				await vi.waitFor(() => expect(test.frame()).toContain("1 tabs"));
				test.intercept(() => pending);
				if (action === "close") test.input.write("xy");
				else test.input.emit("keypress", "", { name: "return" });
				const command = action === "close" ? "tab-close" : "tab-select";
				await vi.waitFor(() =>
					expect(test.execute.mock.calls.at(-1)?.[0]).toEqual([
						command,
						"0",
						"--expected-key=epoch:tab-1",
					]),
				);
				const calls = test.execute.mock.calls.length;
				test.input.write("txy");
				expect(test.execute).toHaveBeenCalledTimes(calls);
				await test.stop();
				expect(test.execute.mock.calls.at(-1)?.[1].aborted).toBe(true);
				const frame = test.frame();
				release();
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(test.execute).toHaveBeenCalledTimes(calls);
				expect(test.frame()).toBe(frame);
				expect(test.input.isRaw).toBe(false);
				expect(test.input.isPaused()).toBe(true);
				expect(test.input.listenerCount("keypress")).toBe(0);
			} finally {
				release();
				await test.stop();
			}
		},
	);
});
