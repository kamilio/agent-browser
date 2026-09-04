import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { expect, it, vi } from "vitest";
import { BrowserCommandHost, type CommandResult } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import { runTerminal } from "./node-terminal.js";
import { BrowserSession } from "./session.js";
import { parseHtmlDocument } from "./html-parser.js";

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
								index: 0,
								id: "tab-1",
								key: "session:tab-1",
								loading: false,
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

function nativeTabFixture() {
	const test = fixture();
	let requests = 0;
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests++;
						if (input.url.endsWith("/fail"))
							throw new AgentBrowserError(
								"network-error",
								"Synthetic navigation failure",
							);
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
						requests,
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
						`<h1>Page ${new URL(response.url).pathname}</h1><input value="private draft">`,
						response.url,
					),
			}),
	});
	const execute = vi.fn((argv: readonly string[], signal?: AbortSignal) =>
		host.execute(argv, { session: "shared", signal }),
	);
	return {
		...test,
		execute,
		host,
		requests: () => requests,
		frame: () => test.screen().split("\x1b[1;1H").at(-1) ?? "",
		tabs: async () =>
			(await host.execute(["tab-list"], { session: "shared" })).data as {
				id: string;
				key: string;
				index: number;
				selected: boolean;
				documentRef: string | null;
			}[],
		options: { ...test.options, execute },
	};
}

it("manages real native session tabs through mocked terminal streams", async () => {
	const test = nativeTabFixture();
	await test.execute(["open", "https://fixture.invalid/first"]);
	await test.execute(["tab-new", "https://fixture.invalid/second"]);
	const initial = await test.tabs();
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.frame()).toContain("Page /second"));
		test.input.write("T");
		await vi.waitFor(() => expect(test.frame()).toContain("| Tabs"));
		const calls = test.execute.mock.calls.length;
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(test.execute.mock.calls).toHaveLength(calls);
		test.input.emit("keypress", "", { name: "home" });
		test.input.write("\r");
		await vi.waitFor(() => expect(test.frame()).toContain("Page /first"));
		expect(
			test.execute.mock.calls.some(
				([args]) =>
					args[0] === "tab-select" &&
					args[1] === "0" &&
					args[2] === `--expected-key=${initial[0].key}`,
			),
		).toBe(true);
		test.input.write("thttps://fixture.invalid/third\r");
		await vi.waitFor(() => expect(test.frame()).toContain("Page /third"));
		const beforeBlank = test.execute.mock.calls.length;
		test.input.write("t\r");
		await vi.waitFor(() => expect(test.frame()).toContain("Blank tab"));
		expect(test.frame()).not.toContain("Page /third");
		expect(
			test.execute.mock.calls
				.slice(beforeBlank)
				.some(([args]) => args[0] === "snapshot"),
		).toBe(false);
		test.input.write("T");
		await vi.waitFor(() => expect(test.frame()).toContain("4 tabs"));
		test.input.write("x");
		await vi.waitFor(() => expect(test.frame()).toContain("y confirms"));
		test.input.write("n");
		expect(
			test.execute.mock.calls.some(([args]) => args[0] === "tab-close"),
		).toBe(false);
		test.input.write("xy");
		await vi.waitFor(() => expect(test.frame()).toContain("3 tabs"));
		test.input.emit("keypress", "", { name: "escape" });
		await vi.waitFor(() => expect(test.frame()).toContain("Page /first"));
		expect(test.requests()).toBe(3);
	} finally {
		test.input.emit("keypress", "", { name: "c", ctrl: true });
		try {
			await running;
			expect(await test.tabs()).toHaveLength(3);
		} finally {
			await test.host.close();
		}
	}
});

it("refuses stale menu indices and refreshes by tab identity before closing", async () => {
	const test = nativeTabFixture();
	await test.execute(["open", "https://fixture.invalid/first"]);
	await test.execute(["tab-new", "https://fixture.invalid/middle"]);
	await test.execute(["tab-new", "https://fixture.invalid/last"]);
	const initial = await test.tabs();
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.frame()).toContain("Page /last"));
		test.input.write("T");
		await vi.waitFor(() => expect(test.frame()).toContain("3 tabs"));
		test.input.emit("keypress", "", { name: "home" });
		test.input.write("j");
		await test.host.execute(["tab-close", "0"], { session: "shared" });
		test.input.write("xy");
		await vi.waitFor(() => expect(test.frame()).toContain("stale-reference"));
		expect((await test.tabs()).map((tab) => tab.key)).toEqual([
			initial[1].key,
			initial[2].key,
		]);
		test.input.write("u");
		await vi.waitFor(() => expect(test.frame()).toContain("2 tabs"));
		test.input.write("xy");
		await vi.waitFor(() => expect(test.frame()).toContain("1 tabs"));
		expect((await test.tabs())[0].key).toBe(initial[2].key);
	} finally {
		test.input.emit("keypress", "", { name: "c", ctrl: true });
		try {
			await running;
		} finally {
			await test.host.close();
		}
	}
});

it("clears stale page data when a new tab's navigation fails without retrying it", async () => {
	const test = nativeTabFixture();
	await test.execute(["open", "https://fixture.invalid/private"]);
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.frame()).toContain("Page /private"));
		test.input.write("thttps://fixture.invalid/fail\r");
		await vi.waitFor(() => expect(test.frame()).toContain("network-error"));
		expect(test.frame()).not.toContain("Page /private");
		expect(test.frame()).not.toContain("private draft");
		expect(await test.tabs()).toHaveLength(2);
		test.input.write("u");
		await vi.waitFor(() => expect(test.frame()).toContain("Blank tab"));
		expect(test.requests()).toBe(2);
	} finally {
		test.input.emit("keypress", "", { name: "c", ctrl: true });
		try {
			await running;
		} finally {
			await test.host.close();
		}
	}
});

it("closes the last tab and creates a blank replacement without asking for nonexistent snapshots", async () => {
	const test = nativeTabFixture();
	await test.execute(["open", "https://fixture.invalid/last"]);
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.frame()).toContain("Page /last"));
		test.input.write("T");
		await vi.waitFor(() => expect(test.frame()).toContain("1 tabs"));
		test.input.write("xy");
		await vi.waitFor(() => expect(test.frame()).toContain("0 tabs"));
		const calls = test.execute.mock.calls.length;
		test.input.emit("keypress", "", { name: "escape" });
		await vi.waitFor(() => expect(test.frame()).toContain("No tabs"));
		test.input.write("t\r");
		await vi.waitFor(() => expect(test.frame()).toContain("Blank tab"));
		expect(
			test.execute.mock.calls
				.slice(calls)
				.some(([args]) => args[0] === "snapshot"),
		).toBe(false);
		expect(test.requests()).toBe(1);
	} finally {
		test.input.emit("keypress", "", { name: "c", ctrl: true });
		try {
			await running;
		} finally {
			await test.host.close();
		}
	}
});

function searchFixture() {
	const test = fixture();
	const original = test.execute.getMockImplementation();
	if (!original) throw new Error("Missing fixture implementation");
	let document = "doc1";
	let removed = false;
	let clicked = false;
	const execute = vi.fn(
		async (argv: readonly string[]): Promise<CommandResult> => {
			const result = await original(argv);
			if (argv[0] === "tab-list")
				result.data = [
					{
						index: 0,
						id: "tab-1",
						key: "session:tab-1",
						loading: false,
						selected: true,
						url: "https://example.com/",
						documentRef: document,
					},
				];
			if (argv[0] === "find")
				result.data = {
					partial: true,
					document: "doc1",
					revision: 1,
					matched: 1,
					scannedEntries: 300,
					matches: [
						{
							ref: "doc1:900",
							line: 300,
							path: [],
							context: [{ ref: "doc1:900", line: 300, text: "button Remote" }],
						},
					],
					truncated: false,
					resultsTruncated: false,
					snapshotTruncated: false,
					workUsed: 1,
					limits: { maxResults: 100, context: 1, maxBytes: 32768 },
				};
			if (argv[0] === "click") clicked = true;
			if (argv[0] === "snapshot" && argv[1] === "doc1:900") {
				if (removed) throw new AgentBrowserError("not-found", "removed");
				result.data = {
					document: "doc1",
					scope: "doc1:900",
					revision: 2,
					truncated: false,
					entries: [
						{
							ref: "doc1:900",
							role: "button",
							name: clicked ? "Purchased" : "Remote",
							depth: 0,
						},
					],
				};
			}
			return result;
		},
	);
	return {
		...test,
		execute,
		options: { ...test.options, execute, pollMs: 60_000 },
		navigate: () => {
			document = "doc2";
		},
		remove: () => {
			removed = true;
		},
	};
}

async function searchRemote(test: ReturnType<typeof searchFixture>) {
	await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
	test.input.write("sRemote\r");
	await vi.waitFor(() => expect(test.screen()).toContain("1 matches in 300"));
}

it("sends targeted key requests from a stream-backed terminal without a PTY", async () => {
	const test = fixture();
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
		test.input.write("pEnter\r");
		await vi.waitFor(() =>
			expect(test.execute.mock.calls.map(([argv]) => argv)).toContainEqual([
				"press",
				"--target=doc1:2",
				"--",
				"Enter",
			]),
		);
	} finally {
		test.input.write("\u0003");
		await running;
	}
});

it("searches beyond the root projection, inspects before acting, refreshes scope and returns to root", async () => {
	const test = searchFixture();
	const running = runTerminal(test.options);
	try {
		await searchRemote(test);
		expect(test.execute.mock.calls.some(([argv]) => argv[0] === "click")).toBe(
			false,
		);
		test.input.write("\r");
		await vi.waitFor(() =>
			expect(test.screen()).toContain("Scoped inspection"),
		);
		expect(test.execute.mock.calls.some(([argv]) => argv[0] === "click")).toBe(
			false,
		);
		test.input.write("\r");
		await vi.waitFor(() => expect(test.screen()).toContain("Purchased"));
		expect(test.execute.mock.calls.map(([argv]) => argv)).toContainEqual([
			"click",
			"doc1:900",
		]);
		expect(
			test.execute.mock.calls.filter(
				([argv]) => argv[0] === "snapshot" && argv[1] === "doc1:900",
			),
		).toHaveLength(2);
		test.input.write("U");
		await vi.waitFor(() =>
			expect(
				test.execute.mock.calls.filter(
					([argv]) => argv[0] === "snapshot" && argv[1] === "--observe",
				),
			).toHaveLength(2),
		);
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
});

it("rejects inspection after navigation without requesting the stale node or clicking", async () => {
	const test = searchFixture();
	const running = runTerminal(test.options);
	try {
		await searchRemote(test);
		test.navigate();
		test.input.write("\r");
		await vi.waitFor(() => expect(test.screen()).toContain("stale-reference"));
		expect(
			test.execute.mock.calls.some(([argv]) => argv.includes("doc1:900")),
		).toBe(false);
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
});

it("falls back to root if an inspected node disappears during refresh", async () => {
	const test = searchFixture();
	const running = runTerminal(test.options);
	try {
		await searchRemote(test);
		test.input.write("\r");
		await vi.waitFor(() =>
			expect(test.screen()).toContain("Scoped inspection"),
		);
		test.remove();
		test.input.write("u");
		await vi.waitFor(() =>
			expect(test.screen()).toContain("Inspected node disappeared"),
		);
		expect(
			test.execute.mock.calls.filter(
				([argv]) => argv[0] === "snapshot" && argv[1] === "--observe",
			),
		).toHaveLength(2);
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
});

it("rejects search results if the selected document changed while searching", async () => {
	const test = searchFixture();
	const running = runTerminal(test.options);
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
		test.navigate();
		test.input.write("sRemote\r");
		await vi.waitFor(() => expect(test.screen()).toContain("stale-reference"));
		expect(test.screen()).not.toContain("1 matches in 300");
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
});

it("rejects inspection if navigation happens between its two document checks", async () => {
	const test = searchFixture();
	const original = test.execute.getMockImplementation();
	if (!original) throw new Error("Missing fixture implementation");
	test.execute.mockImplementation(async (argv) => {
		const result = await original(argv);
		if (argv[0] === "snapshot" && argv[1] === "doc1:900") test.navigate();
		return result;
	});
	const running = runTerminal(test.options);
	try {
		await searchRemote(test);
		test.input.write("\r");
		await vi.waitFor(() => expect(test.screen()).toContain("stale-reference"));
		expect(test.screen()).not.toContain("Scoped inspection");
		expect(test.execute.mock.calls.some(([argv]) => argv[0] === "click")).toBe(
			false,
		);
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
});

it("cancels a pending backend search and restores mock terminal state", async () => {
	const test = searchFixture();
	let received: AbortSignal | undefined;
	const execute = async (argv: readonly string[], signal: AbortSignal) => {
		if (argv[0] !== "find") return test.execute(argv);
		received = signal;
		return new Promise<CommandResult>((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("cancelled")), {
				once: true,
			});
		});
	};
	const running = runTerminal({ ...test.options, execute });
	try {
		await vi.waitFor(() => expect(test.screen()).toContain("Real page"));
		test.input.write("sRemote\r");
		await vi.waitFor(() => expect(received).toBeDefined());
	} finally {
		test.input.emit("keypress", "", { ctrl: true, name: "c" });
		await running;
	}
	expect(received?.aborted).toBe(true);
	expect(test.input.isRaw).toBe(false);
	expect(test.input.listenerCount("keypress")).toBe(0);
	expect(test.execute.mock.calls.some(([argv]) => argv[0] === "close")).toBe(
		false,
	);
});

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
				{
					index: 0,
					id: "tab-1",
					key: "session:tab-1",
					loading: false,
					selected: true,
					documentRef: "other",
					url: "https://other.example/",
				},
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
