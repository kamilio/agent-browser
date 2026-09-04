import { expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./node-command-client.js", () => ({
	requestCommand: connection.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => ({
		schemaVersion: 1,
		origin: "http://127.0.0.1:34567",
		token: "a".repeat(43),
	}),
	writeCommandConnection: vi.fn(),
}));

it.each(
	["tab-select", "tab-close"].flatMap((command) =>
		["matching", "stale"].map((state) => [command, state] as const),
	),
)(
	"runs CLI %s with a %s key through the injected command service",
	async (command, state) => {
		vi.resetModules();
		connection.request.mockReset();
		const { BrowserCommandHost } = await import("./command-host.js");
		const { BrowserSession } = await import("./session.js");
		const { parseHtmlDocument } = await import("./html-parser.js");
		const host = new BrowserCommandHost({
			createSession: () =>
				new BrowserSession({
					createTransport: () => ({
						async request(request) {
							return {
								url: request.url,
								status: 200,
								headers: {},
								body: new Uint8Array(),
								redirects: [],
								encodedBytes: 0,
								elapsedMs: 0,
							};
						},
						metrics: () => ({
							requests: 0,
							active: 0,
							redirects: 0,
							encodedBytes: 0,
							decodedBytes: 0,
							closed: false,
						}),
						close() {},
					}),
					loadDocument: (response) =>
						parseHtmlDocument("<h1>Tab</h1>", response.url),
				}),
		});
		const previousArgs = process.argv;
		const previousCode = process.exitCode;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await host.execute(["open", "https://fixture.invalid/cli-tabs"], {
				session: "tabs",
			});
			await host.execute(["tab-new"], { session: "tabs" });
			await host.execute(["tab-new"], { session: "tabs" });
			const original = (await host.execute(["tab-list"], { session: "tabs" }))
				.data as { key: string; selected: boolean }[];
			if (state === "stale")
				await host.execute(["tab-close", "0"], { session: "tabs" });
			const before = (await host.execute(["tab-list"], { session: "tabs" }))
				.data;
			connection.request.mockImplementation(async (_connection, body) =>
				host.execute(body.argv, { session: body.session }),
			);
			const argv = [
				"-s=tabs",
				command,
				"1",
				"--expected-key",
				original[1].key,
				"--json",
			];
			process.argv = ["node", "agent-browser", ...argv];
			process.exitCode = undefined;
			await import("./cli.js");
			await vi.waitFor(
				() => expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
				{ timeout: 2000 },
			);
			expect(connection.request).toHaveBeenCalledTimes(1);
			expect(connection.request.mock.calls[0][1]).toEqual({
				argv,
				session: "tabs",
			});
			const after = (await host.execute(["tab-list"], { session: "tabs" }))
				.data as { key: string; selected: boolean }[];
			if (state === "stale") {
				expect(log).not.toHaveBeenCalled();
				expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
					ok: false,
					error: { code: "stale-reference" },
				});
				expect(process.exitCode).toBe(1);
				expect(after).toEqual(before);
			} else {
				expect(error).not.toHaveBeenCalled();
				expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
					command,
					session: "tabs",
					data: after,
				});
				if (command === "tab-select")
					expect(after.find((tab) => tab.selected)?.key).toBe(original[1].key);
				else
					expect(after.map((tab) => tab.key)).toEqual([
						original[0].key,
						original[2].key,
					]);
			}
		} finally {
			process.argv = previousArgs;
			process.exitCode = previousCode;
			log.mockRestore();
			error.mockRestore();
			host.close();
		}
	},
);
