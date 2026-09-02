import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { expect, it, vi } from "vitest";
import type { CommandResult } from "./command-host.js";
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
		columns: 100,
		rows: 16,
	});
	let screen = "";
	output.on("data", (chunk) => {
		screen += chunk.toString();
	});
	const execute = vi.fn(
		async (argv: readonly string[]): Promise<CommandResult> => ({
			schemaVersion: 1,
			command: argv[0],
			session: "shared",
			data:
				argv[0] === "tab-list"
					? [
							{
								selected: true,
								url: "https://example.com/",
								documentRef: "doc1",
							},
						]
					: {
							document: "doc1",
							scope: "root",
							revision: 1,
							truncated: false,
							entries: [
								{
									ref: "doc1:2",
									role: "link",
									name: "Real page",
									href: "/next",
									depth: 0,
								},
							],
						},
		}),
	);
	return {
		input,
		output,
		execute,
		screen: () => screen,
		options: {
			input: input as unknown as ReadStream,
			output: output as unknown as WriteStream,
			execute,
			session: "shared",
			pollMs: 20,
		},
	};
}

it("renders and acts through the shared API, observes without consuming diffs and restores the TTY", async () => {
	const test = fixture();
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
		expect(test.execute.mock.calls.map(([argv]) => argv)).toContainEqual([
			"snapshot",
			"--observe",
		]);
		test.input.write("\r");
		await vi.waitFor(() =>
			expect(test.execute.mock.calls.map(([argv]) => argv)).toContainEqual([
				"click",
				"doc1:2",
			]),
		);
		test.output.columns = 50;
		test.output.emit("resize");
	} finally {
		test.input.write("q");
		await running;
	}
	expect(test.input.isRaw).toBe(false);
	expect(test.input.isPaused()).toBe(true);
	expect(test.input.listenerCount("keypress")).toBe(0);
	expect(test.output.listenerCount("resize")).toBe(0);
	expect(test.screen()).toContain("\x1b[?1049l");
	expect(test.execute.mock.calls.some(([argv]) => argv[0] === "close")).toBe(
		false,
	);
});

it("aborts only the attachment's pending request on Ctrl-C without closing the session", async () => {
	const test = fixture();
	let received: AbortSignal | undefined;
	const execute = vi.fn((_argv: readonly string[], signal: AbortSignal) => {
		received = signal;
		return new Promise<CommandResult>((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("cancelled")), {
				once: true,
			});
		});
	});
	const running = runTerminal({ ...test.options, execute });
	await vi.waitFor(() => expect(received).toBeDefined());
	test.input.write("\x03");
	await running;
	expect(received?.aborted).toBe(true);
	expect(test.input.isRaw).toBe(false);
	expect(execute).toHaveBeenCalledTimes(1);
});

it("rejects pipes before enabling raw mode or issuing commands", async () => {
	const test = fixture();
	test.output.isTTY = false;
	await expect(runTerminal(test.options)).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(test.input.setRawMode).not.toHaveBeenCalled();
	expect(test.execute).not.toHaveBeenCalled();
});

it("survives command errors without leaking command arguments and recovers on refresh", async () => {
	const test = fixture();
	test.execute.mockRejectedValueOnce(new Error("private-credential"));
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("network-error"));
		await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
		expect(test.screen()).not.toContain("private-credential");
	} finally {
		test.input.write("q");
		await running;
	}
});

it("restores original raw mode and detaches on input EOF", async () => {
	const test = fixture();
	test.input.isRaw = true;
	const running = runTerminal(test.options);
	test.input.end();
	await running;
	expect(test.input.isRaw).toBe(true);
	expect(test.output.listenerCount("resize")).toBe(0);
});

it("does not display a snapshot beneath a different document's URL during concurrent navigation", async () => {
	const test = fixture();
	const original = test.execute.getMockImplementation();
	test.execute.mockImplementation(async (argv) => {
		const result = await original?.(argv);
		if (!result) throw new Error("Missing fixture result");
		if (argv[0] === "tab-list")
			result.data = [
				{ selected: true, documentRef: "other", url: "https://other.example/" },
			];
		return result;
	});
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("stale-reference"));
		expect(test.screen()).not.toContain("Real page");
		expect(test.screen()).not.toContain("https://other.example/");
	} finally {
		test.input.write("q");
		await running;
	}
});

it("restores raw mode on output failure without leaving refresh listeners behind", async () => {
	const test = fixture();
	const running = runTerminal(test.options);
	const rejection = expect(running).rejects.toThrow("Output failed");
	test.output.destroy(new Error("Output failed"));
	await rejection;
	expect(test.input.isRaw).toBe(false);
	expect(test.input.listenerCount("keypress")).toBe(0);
	expect(test.output.listenerCount("resize")).toBe(0);
});

it("coalesces backpressured output without repainting unchanged frames on every drain", async () => {
	const test = fixture();
	const original = test.output.write.bind(test.output);
	let frames = 0;
	vi.spyOn(test.output, "write").mockImplementation((chunk) => {
		const result = original(chunk);
		if (String(chunk).startsWith("\x1b[1;1H")) {
			frames++;
			return false;
		}
		return result;
	});
	const running = runTerminal({ ...test.options, pollMs: 60_000 });
	try {
		await vi.waitFor(() => expect(frames).toBe(1));
		test.output.emit("drain");
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));
		expect(frames).toBe(1);
		test.output.emit("resize");
		await vi.waitFor(() => expect(frames).toBe(2));
		for (let index = 0; index < 10; index++) test.output.emit("resize");
		expect(frames).toBe(2);
		test.output.emit("drain");
		await vi.waitFor(() => expect(frames).toBe(3));
	} finally {
		test.input.write("q");
		await running;
	}
});
