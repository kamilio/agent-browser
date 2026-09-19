import { expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { loadBrowserDocument } from "./document-loader.js";
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

function partialStylesFixture(markup: string) {
	const requests: string[] = [];
	let closed = false;
	const host = new BrowserCommandHost({
		createSession: () =>
			new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input.url);
						const html =
							requests.length === 1
								? `<style>@unimplemented {}</style>${markup}`
								: "<h1>Destination content</h1>";
						const body = new TextEncoder().encode(html);
						return {
							url: input.url,
							status: 200,
							headers: { "content-type": ["text/html; charset=utf-8"] },
							body,
							redirects: [],
							encodedBytes: body.length,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: requests.length,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed,
					}),
					close() {
						closed = true;
					},
				}),
				loadDocument: loadBrowserDocument,
			}),
	});
	return { host, requests };
}

it("activates links by explicit keyboard input when unsupported CSS blocks pointer geometry", async () => {
	const { host, requests } = partialStylesFixture(
		'<a id="next" href="/page-2">Next page</a>',
	);
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		await expect(host.execute(["click", "#next"])).rejects.toMatchObject({
			code: "unsupported",
		});
		expect(requests).toHaveLength(1);
		const result = await host.execute(["press", "Enter", "--target=#next"]);
		expect(result.data).toMatchObject({
			keyboard: { canceled: false, key: "Enter" },
			navigation: { url: "https://fixture.invalid/page-2" },
		});
		expect(requests).toEqual([
			"https://fixture.invalid/",
			"https://fixture.invalid/page-2",
		]);
		expect(JSON.stringify((await host.execute(["snapshot"])).data)).toContain(
			"Destination content",
		);
	} finally {
		host.close();
	}
});

it("submits GET search forms without requiring supported pointer layout", async () => {
	const { host, requests } = partialStylesFixture(
		'<form action="/search/"><input id="query" name="q"><button name="submit">Search</button></form>',
	);
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		const result = await host.execute([
			"fill",
			"#query",
			"asyncio & tasks",
			"--submit",
		]);
		expect(result.data).toMatchObject({
			form: { canceled: false, invalid: [] },
			navigation: {
				url: "https://fixture.invalid/search/?q=asyncio+%26+tasks&submit=",
			},
		});
		expect(requests).toHaveLength(2);
	} finally {
		host.close();
	}
});

it.each([
	'<a id="target" href="/next" hidden>Hidden link</a>',
	'<button id="target" disabled>Disabled button</button>',
])(
	"keeps focus restrictions for explicit keyboard activation: %s",
	async (markup) => {
		const { host, requests } = partialStylesFixture(markup);
		try {
			await host.execute(["open", "https://fixture.invalid/"]);
			await expect(
				host.execute(["press", "Enter", "--target=#target"]),
			).rejects.toMatchObject({ code: "not-actionable" });
			expect(requests).toHaveLength(1);
		} finally {
			host.close();
		}
	},
);

it("executes held-key commands through the actual CLI entry with an injected service", async () => {
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
					parseHtmlDocument('<input id="text">', response.url),
			}),
	});
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await host.execute(["open", "https://fixture.invalid/"], {
			session: "keys",
		});
		await host.execute(["fill", "#text", "abcd"], { session: "keys" });
		connection.request.mockImplementation(async (_connection, body) =>
			host.execute(body.argv, { session: body.session }),
		);
		const keys = [
			["keydown", "Shift"],
			["press", "ArrowLeft"],
			["keyup", "Shift"],
			["press", "Backspace"],
			["press", "Home", "--target", "#text"],
		];
		for (const argv of keys) {
			log.mockClear();
			process.argv = ["node", "agent-browser", "-s=keys", ...argv, "--json"];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
			expect(error).not.toHaveBeenCalled();
			expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
				command: argv[0],
				session: "keys",
				data: { keyboard: { canceled: false } },
			});
		}
		expect(connection.request.mock.calls.map((call) => call[1].argv)).toEqual(
			keys.map((argv) => ["-s=keys", ...argv, "--json"]),
		);
		const snapshot = await host.execute(["snapshot"], { session: "keys" });
		expect(JSON.stringify(snapshot.data)).toContain("abc");
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		log.mockRestore();
		error.mockRestore();
		host.close();
	}
});
