import { expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession, type SessionMouseResult } from "./session.js";
import { controlledEventListener } from "./events.js";
import { DocumentQueries } from "./selectors.js";
import { controlChecked } from "./controls.js";

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
	const requests: string[] = [];
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				requests.push(input.url);
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
				requests: requests.length,
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
				'<style>html,body{margin:0}a,label{display:block;width:40px;height:20px;font-size:8px}</style><a id="link" href="/next">Next</a><input id="check" type="checkbox" style="display:none"><label for="check">Check</label>',
				response.url,
			),
	});
	return {
		session,
		requests,
		host: new BrowserCommandHost({ createSession: () => session }),
	};
}
it("advertises mouse commands while keeping pointer/scroll/OS defaults explicitly partial", async () => {
	const { host } = fixture();
	try {
		expect((await host.execute(["capabilities"])).data).toMatchObject({
			mouse: {
				commands: ["mousemove", "mousedown", "mouseup", "mousewheel"],
				stateScope: "document",
				pointerEvents: false,
				scrolling: "root-viewport-pixel-wheel",
				nativeMenus: false,
				partial: true,
			},
		});
	} finally {
		host.close();
	}
});
it("navigates through a coordinate click and disposes the old mouse state", async () => {
	const { host, session, requests } = fixture();
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		const old = session.page(session.tabs()[0].id);
		await host.execute(["mousemove", "5", "5"]);
		expect((await host.execute(["mousedown"])).data).toMatchObject({
			mouse: { buttons: 1 },
		});
		const result = (await host.execute(["mouseup"])).data as SessionMouseResult;
		expect(result.navigation?.url).toBe("https://fixture.invalid/next");
		expect(requests).toEqual([
			"https://fixture.invalid/",
			"https://fixture.invalid/next",
		]);
		expect(old.interactions.mouse.metrics()).toMatchObject({
			closed: true,
			buttons: 0,
		});
		expect(
			session.page(session.tabs()[0].id).interactions.mouse.metrics(),
		).toMatchObject({ buttons: 0, x: 0, y: 0 });
	} finally {
		host.close();
	}
});
it("awaits controlled click cancellation before choosing navigation", async () => {
	const { host, session, requests } = fixture();
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		const page = session.page(session.tabs()[0].id);
		const link = new DocumentQueries(page.document).querySelector(
			"#link",
		) as number;
		page.interactions.events.addEventListener(
			link,
			"click",
			controlledEventListener(async (_target, event) => {
				await Promise.resolve();
				event.preventDefault();
			}),
		);
		await host.execute(["mousemove", "5", "5"]);
		await host.execute(["mousedown"]);
		expect((await host.execute(["mouseup"])).data).toMatchObject({
			mouse: { canceled: true, buttons: 0 },
		});
		expect(requests).toHaveLength(1);
	} finally {
		host.close();
	}
});

it("submits a form through a coordinate-activated label and its native submitter", async () => {
	const { host, session, requests } = fixture();
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		const page = session.page(session.tabs()[0].id);
		const tree = page.document;
		const form = tree.createElement("form", { action: "/submit" });
		const submit = tree.createElement("input", {
			id: "submit",
			type: "submit",
			name: "which",
			value: "mouse",
			style: "display:none",
		});
		const label = tree.createElement("label", { for: "submit" });
		tree.append(form, submit);
		tree.append(form, label);
		tree.append(label, tree.createText("Send"));
		tree.append(
			new DocumentQueries(tree).querySelector("body") as number,
			form,
		);
		await host.execute(["mousemove", "5", "45"]);
		await host.execute(["mousedown"]);
		const result = (await host.execute(["mouseup"])).data as SessionMouseResult;
		expect(result).toHaveProperty("form");
		expect(result.navigation?.url).toBe(
			"https://fixture.invalid/submit?which=mouse",
		);
		expect(requests).toHaveLength(2);
	} finally {
		host.close();
	}
});
it("rejects pre-aborted actions and keeps held buttons isolated between tabs", async () => {
	const { host, session } = fixture();
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		const first = session.tabs()[0].id;
		await expect(
			session.mousedown(first, "left", { signal: AbortSignal.abort() }),
		).rejects.toMatchObject({ code: "aborted" });
		expect(session.page(first).interactions.mouse.metrics().buttons).toBe(0);
		await session.mousemove(first, 5, 5);
		await session.mousedown(first);
		const second = session.createTab().id;
		await session.navigate(second, "https://fixture.invalid/second");
		expect(session.page(second).interactions.mouse.metrics().buttons).toBe(0);
		expect(session.page(first).interactions.mouse.metrics().buttons).toBe(1);
	} finally {
		host.close();
	}
});
it.each([
	["mousemove", "NaN", "0"],
	["mousemove", "", "0"],
	["mousedown", "back"],
	["mouseup", "__proto__"],
])("rejects malformed mouse command %j", async (...argv) => {
	const { host } = fixture();
	try {
		await host.execute(["open", "https://fixture.invalid/"]);
		await expect(host.execute(argv)).rejects.toMatchObject({
			code: "invalid-input",
		});
	} finally {
		host.close();
	}
});
it("executes the actual CLI gesture across imports against an injected in-memory service", async () => {
	const { host, session } = fixture();
	const previousArgs = process.argv;
	const previousCode = process.exitCode;
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await host.execute(["open", "https://fixture.invalid/"], {
			session: "mouse-test",
		});
		connection.request.mockImplementation(async (_connection, body) =>
			host.execute(body.argv, { session: body.session }),
		);
		for (const argv of [["mousemove", "5", "25"], ["mousedown"], ["mouseup"]]) {
			log.mockClear();
			process.argv = [
				"node",
				"agent-browser",
				"-s=mouse-test",
				...argv,
				"--json",
			];
			vi.resetModules();
			await import("./cli.js");
			await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: 2000 });
			expect(error).not.toHaveBeenCalled();
			expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
				command: argv[0],
				data: { mouse: { x: 5, y: 25 } },
			});
		}
		const page = session.page(session.tabs()[0].id);
		const check = new DocumentQueries(page.document).querySelector(
			"#check",
		) as number;
		expect(controlChecked(page.document, check)).toBe(true);
		expect(page.interactions.mouse.metrics().buttons).toBe(0);
	} finally {
		process.argv = previousArgs;
		process.exitCode = previousCode;
		log.mockRestore();
		error.mockRestore();
		host.close();
	}
});
