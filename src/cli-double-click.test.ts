import { expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlChecked } from "./controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { BrowserMouseEvent } from "./mouse.js";
import { BrowserSession } from "./session.js";

const connection = vi.hoisted(() => ({ request: vi.fn(), configure: vi.fn() }));
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
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor() {
			connection.configure();
			throw new Error("Unexpected local runtime configuration");
		}
	},
}));

it.each([undefined, "legacy", "extension"] as const)(
	"routes actual CLI dblclick through the existing host without reconfiguring runtime %s",
	async (adapter) => {
		connection.request.mockReset();
		connection.configure.mockClear();
		vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", adapter);
		vi.stubEnv(
			"AGENT_BROWSER_SAFEJS_ROOT",
			adapter === undefined ? undefined : "/configured-but-not-loaded",
		);
		vi.stubEnv("AGENT_BROWSER_PAGE_SCRIPTS", undefined);
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
					'<style>html,body{margin:0;padding:0}#target{display:block;width:40px;height:20px}</style><input id="target" type="checkbox">',
					response.url,
				),
		});
		const host = new BrowserCommandHost({ createSession: () => session });
		const previousArgs = process.argv;
		const previousCode = process.exitCode;
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const dispatch = vi.spyOn(host, "execute");
		const native = vi.spyOn(session, "dblclick");
		try {
			await host.execute(["open", "https://fixture.invalid/"], {
				session: "double-click-cli",
			});
			const page = session.page(session.tabs()[0].id);
			const target = page.queries.querySelector("#target");
			if (target === null) throw new Error("Missing target");
			const events: string[] = [];
			for (const type of ["mousedown", "mouseup", "click", "dblclick"])
				page.interactions.events.addEventListener(target, type, (event) =>
					events.push(`${event.type}:${(event as BrowserMouseEvent).detail}`),
				);
			connection.request.mockImplementation(async (_connection, body) =>
				host.execute(body.argv, { session: body.session }),
			);
			process.argv = [
				"node",
				"agent-browser",
				"-s=double-click-cli",
				"dblclick",
				"#target",
				"left",
				"--json",
			];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
			expect(error).not.toHaveBeenCalled();
			expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
				command: "dblclick",
				session: "double-click-cli",
				data: {
					completed: true,
					canceled: false,
					clicks: [
						{ interaction: { defaultPrevented: false } },
						{ interaction: { defaultPrevented: false } },
					],
				},
			});
			expect(connection.request).toHaveBeenCalledTimes(1);
			expect(connection.request.mock.calls[0][1]).toEqual({
				argv: ["-s=double-click-cli", "dblclick", "#target", "left", "--json"],
				session: "double-click-cli",
			});
			expect(connection.configure).not.toHaveBeenCalled();
			expect(log.mock.calls[0][0]).not.toContain("configured-but-not-loaded");
			expect(dispatch).toHaveBeenLastCalledWith(
				["-s=double-click-cli", "dblclick", "#target", "left", "--json"],
				{ session: "double-click-cli" },
			);
			expect(native).toHaveBeenCalledTimes(1);
			expect(events).toEqual([
				"mousedown:1",
				"mouseup:1",
				"click:1",
				"mousedown:2",
				"mouseup:2",
				"click:2",
				"dblclick:2",
			]);
			expect(controlChecked(page.document, target)).toBe(false);
			expect(page.interactions.mouse.metrics()).toMatchObject({
				busy: false,
				buttons: 0,
			});
		} finally {
			process.argv = previousArgs;
			process.exitCode = previousCode;
			vi.unstubAllEnvs();
			vi.restoreAllMocks();
			host.close();
		}
	},
);
