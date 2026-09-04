import { expect, it, vi } from "vitest";
import { readTrace } from "./capture-client.js";
import { BrowserCommandHost } from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
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

it("runs the actual CLI entry through production cookie dispatch and real session jars", async () => {
	const sessions = new Map<string, BrowserSession>();
	const requests: { session: string; url: string; cookie: string }[] = [];
	const host = new BrowserCommandHost({
		createSession: (name) => {
			const browser = new BrowserSession({
				createTransport: (cookies) => ({
					async request(input) {
						requests.push({
							session: name,
							url: input.url,
							cookie: cookies.cookieHeader(input.url, { siteUrl: input.url }),
						});
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
					parseHtmlDocument("<p>Cookie fixture</p>", response.url),
			});
			sessions.set(name, browser);
			return browser;
		},
	});
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await host.execute(["open", "https://example.com/"], { session: "empty" });
		await host.execute(["tab-close"], { session: "empty" });
		expect(
			(await host.execute(["cookie-list"], { session: "empty" })).data,
		).toEqual({ cookies: [] });
		expect(
			(await host.execute(["cookie-delete", "missing"], { session: "empty" }))
				.data,
		).toEqual({ deleted: 0 });
		await expect(
			host.execute(["cookie-set", "secret", "private"], { session: "empty" }),
		).rejects.toMatchObject({ code: "not-found" });
		await host.execute(["open", "https://example.com/account/page"], {
			session: "alpha",
		});
		await host.execute(["open", "https://example.com/account/page"], {
			session: "beta",
		});
		await host.execute(["tracing-start"], { session: "alpha" });
		connection.request.mockImplementation(async (_connection, body) => {
			try {
				return await host.execute(body.argv, { session: body.session });
			} catch (cause) {
				if (!(cause instanceof AgentBrowserError)) throw cause;
				const { AgentBrowserError: ClientError } = await import("./errors.js");
				throw new ClientError(cause.code, cause.message);
			}
		});
		const invoke = async (session: string, argv: string[], json = true) => {
			log.mockClear();
			error.mockClear();
			process.exitCode = undefined;
			process.argv = [
				"node",
				"agent-browser",
				`-s=${session}`,
				...argv,
				...(json ? ["--json"] : []),
			];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(
				() => expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
				{ timeout: 2000 },
			);
			expect(connection.request.mock.calls.at(-1)?.[1]).toEqual({
				argv: process.argv.slice(2),
				session,
			});
			return JSON.parse((log.mock.calls[0] ?? error.mock.calls[0])[0]);
		};
		expect(
			await invoke("alpha", [
				"cookie-set",
				"session",
				"PRIVATE",
				"--path=/",
				"--httpOnly",
				"--secure",
				"--sameSite=Lax",
			]),
		).toEqual({
			schemaVersion: 1,
			command: "cookie-set",
			session: "alpha",
			data: { set: true, deleted: false },
		});
		expect(error).not.toHaveBeenCalled();
		expect(
			await invoke("alpha", ["cookie-set", "session", "deep"]),
		).toMatchObject({ data: { set: true } });
		expect(
			await invoke("beta", ["cookie-set", "session", "beta"]),
		).toMatchObject({ session: "beta", data: { set: true } });
		expect(await invoke("alpha", ["cookie-get", "session"])).toMatchObject({
			data: {
				cookies: [
					{
						name: "session",
						value: "PRIVATE",
						path: "/",
						httpOnly: true,
						secure: true,
						sameSite: "lax",
						expires: null,
					},
					{
						name: "session",
						value: "deep",
						path: "/account",
						httpOnly: false,
						secure: false,
					},
				],
			},
		});
		expect(
			await invoke("alpha", ["cookie-list", "--domain=other.example"], false),
		).toMatchObject({ data: { cookies: [] } });
		await invoke("alpha", ["goto", "https://example.com/account/next"]);
		expect(requests.at(-1)).toEqual({
			session: "alpha",
			url: "https://example.com/account/next",
			cookie: "session=deep; session=PRIVATE",
		});
		expect(
			sessions
				.get("alpha")
				?.cookies.documentCookie(
					"https://example.com/account/next",
					"https://example.com/",
				),
		).toBe("session=deep");
		expect(
			await invoke("alpha", ["cookie-set", "session", "PRIVATE; HttpOnly"]),
		).toEqual({
			ok: false,
			error: { code: "invalid-input", message: "Invalid cookie value" },
		});
		expect(log).not.toHaveBeenCalled();
		expect(JSON.stringify(error.mock.calls)).not.toContain("PRIVATE");
		expect(process.exitCode).toBe(1);
		expect(await invoke("alpha", ["cookie-delete", "session"])).toMatchObject({
			data: { deleted: 2 },
		});
		await invoke("alpha", ["goto", "https://example.com/account/final"]);
		expect(requests.at(-1)?.cookie).toBe("");
		expect(await invoke("beta", ["cookie-get", "session"])).toMatchObject({
			data: { cookies: [{ value: "beta" }] },
		});
		expect(await invoke("alpha", ["cookie-get", "session"])).toEqual({
			ok: false,
			error: { code: "not-found", message: "Cookie not found" },
		});
		const artifact = (
			await host.execute(["tracing-stop"], { session: "alpha" })
		).data;
		let trace = "";
		await readTrace(
			(argv) => host.execute(argv, { session: "alpha" }),
			artifact,
			(bytes) => {
				trace = new TextDecoder().decode(bytes);
			},
		);
		expect(trace).toContain("cookie-set");
		expect(trace).not.toContain("PRIVATE");
		await host.execute(["tab-close"], { session: "beta" });
		expect(
			(await host.execute(["cookie-get", "session"], { session: "beta" })).data,
		).toMatchObject({ cookies: [{ value: "beta" }] });
		expect(
			(await host.execute(["cookie-delete", "session"], { session: "beta" }))
				.data,
		).toEqual({ deleted: 1 });
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		log.mockRestore();
		error.mockRestore();
		connection.request.mockReset();
		host.close();
	}
});
