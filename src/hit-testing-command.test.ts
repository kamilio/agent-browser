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
function fixture() {
	const session = new BrowserSession({
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
				'<style>html,body{margin:0}#target{width:40px;height:30px}</style><div id="target"></div>',
				response.url,
			),
	});
	return {
		session,
		host: new BrowserCommandHost({ createSession: () => session }),
	};
}
it("advertises honest hit-testing capabilities and returns reference stacks without focus or mutation", async () => {
	const { host, session } = fixture();
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			hitTesting: {
				partial: true,
				methods: ["elementFromPoint", "elementsFromPoint"],
				pointerEventsCss: true,
			},
			actionWaiting: {
				hitTesting: true,
				hitTestCommands: ["click", "hover"],
				stableLayout: false,
			},
			clickActionability: {
				partial: true,
				rootScroll: true,
				pointerSequence: true,
				stableAnimationFrames: false,
			},
		});
		await host.execute(["open", "https://fixture.invalid/"]);
		const page = session.page(session.tabs()[0].id);
		const revision = page.document.revision;
		const geometry = (await host.execute(["geometry", "#target"])).data as {
			reference: string;
		};
		expect((await host.execute(["hit-test", "1.5", "2"])).data).toMatchObject({
			x: 1.5,
			y: 2,
			reference: geometry.reference,
			references: [geometry.reference, expect.any(String), expect.any(String)],
			revision,
			partial: true,
		});
		expect((await host.execute(["hit-test", "-1", "0"])).data).toMatchObject({
			reference: null,
			references: [],
		});
		expect(page.document.revision).toBe(revision);
		expect(page.interactions.focus.active()).toBeNull();
	} finally {
		host.close();
	}
});
it.each(["NaN", "Infinity", "", "invalid"])(
	"rejects invalid command coordinate %s",
	async (coordinate) => {
		const { host } = fixture();
		try {
			await host.execute(["open", "https://fixture.invalid/"]);
			await expect(
				host.execute(["hit-test", coordinate, "0"]),
			).rejects.toMatchObject({ code: "invalid-input" });
		} finally {
			host.close();
		}
	},
);
it("executes the actual CLI hit-test entry against an injected in-memory service", async () => {
	const { host } = fixture();
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await host.execute(["open", "https://fixture.invalid/"], {
			session: "hit-test",
		});
		const geometry = (
			await host.execute(["geometry", "#target"], { session: "hit-test" })
		).data as { reference: string };
		connection.request.mockImplementation(async (_connection, body) =>
			host.execute(body.argv, { session: body.session }),
		);
		process.argv = [
			"node",
			"agent-browser",
			"-s=hit-test",
			"hit-test",
			"1",
			"2",
			"--json",
		];
		vi.resetModules();
		await import("./cli.js");
		await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
		expect(error).not.toHaveBeenCalled();
		expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
			command: "hit-test",
			data: { reference: geometry.reference, x: 1, y: 2, partial: true },
		});
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		log.mockRestore();
		error.mockRestore();
		host.close();
	}
});
