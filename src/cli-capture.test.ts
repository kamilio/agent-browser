import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";

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

it.each(["screenshot", "pdf"])(
	"runs the actual CLI entry point against an injected in-memory service: %s",
	async (command) => {
		const directory = await mkdtemp(
			join(tmpdir(), "agent-browser-cli-capture-"),
		);
		const output = join(directory, command === "pdf" ? "cli.pdf" : "cli.png");
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
						parseHtmlDocument(
							'<main style="background-color:navy;color:aquamarine;font-size:8px">CLI capture</main>',
							response.url,
						),
				}),
		});
		const previousArgs = process.argv;
		const previousCode = process.exitCode;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await host.execute(["open", "https://fixture.invalid/"], {
				session: "capture-test",
			});
			await host.execute(["resize", "80", "40"], { session: "capture-test" });
			connection.request.mockImplementation(async (_connection, body) =>
				host.execute(body.argv, { session: body.session }),
			);
			const firstRequest = connection.request.mock.calls.length;
			process.argv = [
				"node",
				"agent-browser",
				"-s=capture-test",
				command,
				`--filename=${output}`,
				"--json",
			];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
			expect(error).not.toHaveBeenCalled();
			const report = JSON.parse(log.mock.calls[0][0]);
			expect(report).toMatchObject({
				command,
				session: "capture-test",
				data: {
					filename: output,
					remoteCleanupConfirmed: true,
					temporaryCleanupConfirmed: true,
					artifact: { width: 80, height: 40, partial: true },
				},
			});
			if (command === "screenshot")
				expect([...(await readFile(output)).subarray(0, 8)]).toEqual([
					137, 80, 78, 71, 13, 10, 26, 10,
				]);
			else
				expect((await readFile(output)).subarray(0, 9).toString()).toBe(
					"%PDF-1.4\n",
				);
			expect(host.metrics().captureArtifacts.bytes).toBe(0);
			expect(connection.request.mock.calls[firstRequest][1].argv).toEqual([
				command,
			]);
		} finally {
			process.argv = previousArgs;
			process.exitCode = previousCode;
			log.mockRestore();
			error.mockRestore();
			host.close();
			await rm(directory, { recursive: true, force: true });
		}
	},
);
