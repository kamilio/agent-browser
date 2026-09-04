import { PassThrough } from "node:stream";
import type { ReadStream, WriteStream } from "node:tty";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost, type CommandResult } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { runTerminal } from "./node-terminal.js";
import { playgroundText } from "./playground.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { findInDocument } from "./snapshot-search.js";
import type { SemanticSnapshot } from "./snapshot.js";
import { TerminalView } from "./terminal-view.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});
async function fixture(attributes = "", authored = false) {
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
				requests: 1,
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
				`<style>details{width:160px;font-size:16px;line-height:16px}</style><details id="disclosure" ${attributes}>${authored ? "<summary>Authored</summary>" : ""}<button>Body action</button></details>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/generated-interface"]);
	const page = session.page(session.tabs()[0].id);
	const snapshot = () => session.snapshot(session.tabs()[0].id);
	const target = snapshot().entries.find((entry) => entry.role === "button");
	if (!target) throw new Error("Missing disclosure entry");
	const owner = new DocumentQueries(page.document).querySelector("#disclosure");
	if (owner === null) throw new Error("Missing disclosure host");
	const view = new TerminalView("native");
	const refresh = () => view.update(snapshot(), page.document.url);
	refresh();
	const frame = (width = 100, height = 16) =>
		view.render(width, height).join("\n");
	return { host, session, page, owner, target, snapshot, view, refresh, frame };
}

it.each([false, true])(
	"shows actual disclosure expansion and focus state, authored=%s",
	async (authored) => {
		const { host, target, snapshot, refresh, frame } = await fixture(
			"",
			authored,
		);
		expect(frame()).toContain("collapsed");
		expect(frame()).not.toContain("focused");
		await host.execute(["press", "Enter", "--target", target.ref]);
		refresh();
		expect(frame()).toContain("expanded focused");
		expect(playgroundText(snapshot())).toContain("[expanded=true]");
		expect(playgroundText(snapshot())).toContain("[focused=true]");
	},
);

it("retains the generated selection as its body enters and leaves the snapshot", async () => {
	const { host, target, view, refresh, frame } = await fixture();
	for (const state of ["expanded", "collapsed", "expanded"]) {
		const command = view.key("", { name: "return" });
		expect(command).toEqual(["click", target.ref]);
		await host.execute(command as string[]);
		refresh();
		expect(frame()).toContain(state);
	}
});

it("renders disabled disclosure state without offering an activation", async () => {
	const { view, frame } = await fixture('aria-disabled="true"');
	expect(frame()).toContain("disabled collapsed");
	expect(view.key("", { name: "return" })).toBeUndefined();
	expect(view.status).toContain("disabled");
});

it("keeps state visible through narrow terminal reflow and removes stale focus", async () => {
	const { target, page, refresh, frame } = await fixture();
	page.interactions.focus.focus(target.ref);
	refresh();
	const narrow = frame(28, 20);
	expect(narrow).toContain("focused");
	expect(
		narrow
			.split("\n")
			.every((line) => line.length <= 28 && /^[\x20-\x7e]*$/.test(line)),
	).toBe(true);
	page.interactions.focus.focus(null);
	refresh();
	expect(frame()).not.toContain("focused");
	expect(frame()).toContain("collapsed");
});

it("routes a generated backend search match to scoped inspection before activation", async () => {
	const { host, target, page, view, frame } = await fixture();
	view.showSearch(findInDocument(page.document, "Details"), "Details");
	expect(view.key("", { name: "return" })).toEqual({
		kind: "inspect",
		ref: target.ref,
		document: page.document.reference(page.document.root),
	});
	const scoped = (await host.execute(["snapshot", target.ref]))
		.data as SemanticSnapshot;
	view.dismissSearch();
	view.update(scoped, page.document.url);
	expect(frame()).toContain("collapsed");
	expect(frame()).not.toContain("Body action");
	expect(view.key("", { name: "return" })).toEqual(["click", target.ref]);
});

it("cancels a targeted key draft when authored summary replacement removes its generated ref", async () => {
	const { page, owner, view, refresh, frame } = await fixture();
	view.key("p");
	view.key("Enter");
	const summary = page.document.createElement("summary");
	page.document.append(summary, page.document.createText("Replacement"));
	page.document.append(owner, summary);
	refresh();
	expect(view.status).toContain("cancelled");
	expect(frame()).toContain("Replacement");
	expect(frame()).toContain("collapsed");
	expect(view.key("", { name: "return" })).toEqual([
		"click",
		page.document.reference(summary),
	]);
});

it("does not leak arbitrary page control characters into terminal state rows", async () => {
	const { page, owner, view, refresh, frame } = await fixture();
	page.document.setAttribute(owner, "role", "group");
	page.document.setAttribute(owner, "aria-label", "Host\u001b[2J\nlabel");
	refresh();
	expect(
		frame()
			.split("\n")
			.every((line) => /^[\x20-\x7e]*$/.test(line)),
	).toBe(true);
	view.key("", { name: "tab" });
	expect(frame()).toContain("collapsed");
});

async function terminalFixture() {
	const native = await fixture();
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
		columns: 110,
		rows: 18,
	});
	let screen = "";
	output.on("data", (chunk) => {
		screen += chunk.toString();
	});
	const execute = vi.fn(
		(argv: readonly string[], signal?: AbortSignal): Promise<CommandResult> =>
			native.host.execute(argv, { signal }),
	);
	const running = runTerminal({
		input: input as unknown as ReadStream,
		output: output as unknown as WriteStream,
		execute,
		session: "native",
		pollMs: 20,
	});
	return {
		...native,
		input,
		running,
		execute,
		screen: () => screen,
		terminalFrame: () => screen.split("\x1b[1;1H").at(-1) ?? "",
	};
}

it("activates and refreshes generated controls through mocked terminal streams", async () => {
	const test = await terminalFixture();
	try {
		await vi.waitFor(() => expect(test.terminalFrame()).toContain("collapsed"));
		test.input.write("\r");
		await vi.waitFor(() =>
			expect(test.terminalFrame()).toContain("expanded focused"),
		);
		expect(
			test.execute.mock.calls.some(
				([args]) => args[0] === "click" && args[1] === test.target.ref,
			),
		).toBe(true);
		test.input.write("pSpace\r");
		await vi.waitFor(() =>
			expect(test.terminalFrame()).toContain("collapsed focused"),
		);
		expect(
			test.execute.mock.calls.some(
				([args]) =>
					args[0] === "press" && args[1] === `--target=${test.target.ref}`,
			),
		).toBe(true);
	} finally {
		test.input.write("q");
		await test.running;
	}
	expect(test.input.isRaw).toBe(false);
	expect(test.input.listenerCount("keypress")).toBe(0);
	expect(test.screen()).toContain("\x1b[?1049l");
});

it("returns a removed generated search scope to the root in the terminal loop", async () => {
	const test = await terminalFixture();
	try {
		await vi.waitFor(() => expect(test.terminalFrame()).toContain("collapsed"));
		test.input.write("sDetails\r");
		await vi.waitFor(() =>
			expect(test.terminalFrame()).toContain("partial backend search"),
		);
		test.input.write("\r");
		await vi.waitFor(() =>
			expect(test.terminalFrame()).toContain("Scoped inspection"),
		);
		const summary = test.page.document.createElement("summary");
		test.page.document.append(
			summary,
			test.page.document.createText("Authored replacement"),
		);
		test.page.document.append(test.owner, summary);
		await vi.waitFor(() =>
			expect(test.terminalFrame()).toContain("Authored replacement"),
		);
		expect(test.terminalFrame()).toContain("returned to document root");
		expect(test.terminalFrame()).toContain("collapsed");
	} finally {
		test.input.write("q");
		await test.running;
	}
});
