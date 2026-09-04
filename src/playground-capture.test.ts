import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { parseHtmlDocument } from "./html-parser.js";
import { playgroundHtml } from "./playground-assets.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import type { TerminalTab } from "./terminal-tabs.js";

class ElementFixture {
	textContent = "";
	value = "";
	hidden = false;
	disabled = false;
	checked = false;
	src = "";
	href = "";
	download = "";
	selected = false;
	children: ElementFixture[] = [];
	readonly listeners = new Map<
		string,
		((event: { preventDefault(): void; key?: string }) => void)[]
	>();
	readonly dataset: Record<string, string> = {};
	readonly attributes: Record<string, string>;
	readonly classList = { toggle: () => {}, add: () => {}, remove: () => {} };
	constructor(
		readonly id: string,
		attributes: Record<string, string> = {},
	) {
		this.attributes = { ...attributes };
		this.value = attributes.value ?? "";
		for (const [name, value] of Object.entries(attributes))
			if (name.startsWith("data-")) this.dataset[name.slice(5)] = value;
	}
	addEventListener(
		name: string,
		callback: (event: { preventDefault(): void; key?: string }) => void,
	) {
		this.listeners.set(name, [...(this.listeners.get(name) ?? []), callback]);
	}
	setAttribute(name: string, value: string) {
		this.attributes[name] = value;
	}
	removeAttribute(name: string) {
		delete this.attributes[name];
		if (name === "src") this.src = "";
	}
	replaceChildren(...children: ElementFixture[]) {
		this.children = children;
	}
	append(...children: ElementFixture[]) {
		this.children.push(...children);
	}
	remove() {}
	click() {
		this.dispatch("click");
	}
	dispatch(name: string) {
		for (const listener of this.listeners.get(name) ?? [])
			listener({ preventDefault() {} });
	}
}
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0).reverse()) dispose();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
async function fixture(unsupported = false, content = "Hello") {
	vi.useFakeTimers();
	const source = parseHtmlDocument(
		playgroundHtml,
		"https://playground.invalid/",
	);
	cleanup.push(() => source.close());
	const queries = new DocumentQueries(source);
	const elements = new Map<number, ElementFixture>();
	const wrap = (id: number) => {
		let result = elements.get(id);
		if (!result) {
			const node = source.get(id);
			result = new ElementFixture(node.attributes.id ?? "", {
				...node.attributes,
			});
			elements.set(id, result);
		}
		return result;
	};
	const get = (id: string) => {
		const found = queries.querySelector(`#${id}`);
		if (found === null) throw new Error(`Missing ${id}`);
		return wrap(found);
	};
	const body = new ElementFixture("body");
	const documentFixture = {
		getElementById: get,
		querySelectorAll: (selector: string) =>
			queries.querySelectorAll(selector).map(wrap),
		createElement: () => new ElementFixture("created"),
		body,
		activeElement: null,
		hidden: false,
	};
	const windowEvents = new Map<string, () => void>();
	vi.stubGlobal("document", documentFixture);
	vi.stubGlobal("window", {
		addEventListener: (name: string, callback: () => void) =>
			windowEvents.set(name, callback),
	});
	vi.stubGlobal(
		"Option",
		class extends ElementFixture {
			constructor(
				label: string,
				value: string,
				_default?: boolean,
				selected?: boolean,
			) {
				super("");
				this.textContent = label;
				this.value = value;
				this.selected = selected ?? false;
			}
		},
	);
	const blobs: Blob[] = [];
	vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
		blobs.push(blob as Blob);
		return `blob:fixture/${blobs.length}`;
	});
	const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
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
						`<main style="height:20px;background-color:navy;color:aquamarine${unsupported ? ";position:absolute" : ""}">${content}</main>`,
						response.url,
					),
			}),
	});
	cleanup.push(() => host.close());
	await host.execute(["open", "https://fixture.invalid/"]);
	await host.execute(["resize", "40", "40"]);
	const calls: string[][] = [];
	vi.stubGlobal("fetch", async (path: string, options: { body: string }) => {
		const input = JSON.parse(options.body);
		let payload: unknown;
		try {
			if (path === "/api/pair/start")
				payload = {
					ok: true,
					pair: {
						id: "a".repeat(32),
						code: "ABCD1234",
						expiresAt: Date.now() + 60_000,
					},
				};
			else if (path === "/api/pair/poll")
				payload = { ok: true, approved: true, token: "a".repeat(43) };
			else if (path === "/api/pair/revoke") payload = { ok: true };
			else {
				calls.push(input.argv);
				payload = {
					ok: true,
					result: await host.execute(input.argv, { session: input.session }),
				};
			}
			return {
				ok: true,
				status: 200,
				json: async () => JSON.parse(JSON.stringify(payload)),
			};
		} catch (error) {
			return {
				ok: false,
				status: 422,
				json: async () => ({
					ok: false,
					error: { code: "unsupported", message: (error as Error).message },
				}),
			};
		}
	});
	vi.resetModules();
	await import("./playground.js");
	cleanup.push(() => windowEvents.get("pagehide")?.());
	get("connect").click();
	await vi.advanceTimersByTimeAsync(1001);
	await settle();
	expect(get("capture-render").disabled).toBe(false);
	return { get, host, calls, blobs, revoked, body };
}
async function settle() {
	for (let index = 0; index < 120; index++) await Promise.resolve();
}

it("guards displayed tab selection and closes the displayed tab rather than another client's active tab", async () => {
	const { get, host, calls } = await fixture();
	await host.execute(["tab-new"]);
	get("refresh").click();
	await settle();
	const tabs = (await host.execute(["tab-list"])).data as TerminalTab[];
	get("tabs").value = "0";
	get("tabs").dispatch("change");
	get("close-tab").click();
	await settle();
	expect(calls.filter((argv) => argv[0] === "tab-select")).toEqual([
		["tab-select", "0", `--expected-key=${tabs[0].key}`],
	]);
	expect(calls.some((argv) => argv[0] === "tab-close")).toBe(false);
	await host.execute(["tab-select", "1"]);
	get("close-tab").click();
	await settle();
	expect(calls.filter((argv) => argv[0] === "tab-close")).toEqual([
		["tab-close", "0", `--expected-key=${tabs[0].key}`],
	]);
	expect((await host.execute(["tab-list"])).data).toMatchObject([
		{ index: 0, key: tabs[1].key, selected: true, documentRef: null },
	]);
	expect(get("tabs").children.map((option) => option.textContent)).toEqual([
		"0 · Empty tab",
	]);
	get("close-tab").click();
	await settle();
	expect((await host.execute(["tab-list"])).data).toEqual([]);
	expect(get("tabs").disabled).toBe(true);
	expect(get("close-tab").disabled).toBe(true);
	const count = calls.length;
	get("tabs").dispatch("change");
	get("close-tab").click();
	await settle();
	expect(calls).toHaveLength(count);
});

it.each(["tab-select", "tab-close"] as const)(
	"rejects %s when another client shifts displayed indices, without retrying on a different tab",
	async (action) => {
		const { get, host, calls } = await fixture();
		await host.execute(["tab-new"]);
		await host.execute(["tab-new"]);
		await host.execute(["tab-select", "1"]);
		get("refresh").click();
		await settle();
		const tabs = (await host.execute(["tab-list"])).data as TerminalTab[];
		await host.execute(["tab-close", "0"]);
		get("tabs").value = "1";
		if (action === "tab-select") get("tabs").dispatch("change");
		else get("close-tab").click();
		await settle();
		expect(get("error").textContent).toContain(
			"Tab or session changed before the operation",
		);
		expect(calls.filter((argv) => argv[0] === action)).toEqual([
			[action, "1", `--expected-key=${tabs[1].key}`],
		]);
		expect((await host.execute(["tab-list"])).data).toMatchObject([
			{ index: 0, key: tabs[1].key, selected: true },
			{ index: 1, key: tabs[2].key, selected: false },
		]);
		get("tabs").value = "0";
		get("tabs").dispatch("change");
		await settle();
		expect(calls.filter((argv) => argv[0] === "tab-select").at(-1)).toEqual([
			"tab-select",
			"0",
			`--expected-key=${tabs[1].key}`,
		]);
	},
);

it.each(["tab-select", "tab-close"] as const)(
	"rejects %s after a named session is recreated with the same tab ID",
	async (action) => {
		const { get, host, calls } = await fixture();
		const original = (
			(await host.execute(["tab-list"])).data as TerminalTab[]
		)[0];
		await host.execute(["close"]);
		await host.execute(["open", "https://fixture.invalid/recreated"]);
		get("tabs").value = "0";
		if (action === "tab-select") get("tabs").dispatch("change");
		else get("close-tab").click();
		await settle();
		expect(calls.filter((argv) => argv[0] === action)).toEqual([
			[action, "0", `--expected-key=${original.key}`],
		]);
		expect(get("error").textContent).toContain("Tab or session changed");
		const remaining = (await host.execute(["tab-list"])).data as TerminalTab[];
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe(original.id);
		expect(remaining[0].key).not.toBe(original.key);
		expect(remaining[0].url).toBe("https://fixture.invalid/recreated");
	},
);

it("keeps tab guards attached to displayed options while a newer refresh waits on viewport data", async () => {
	const { get, host, calls } = await fixture();
	const originalTab = (
		(await host.execute(["tab-list"])).data as TerminalTab[]
	)[0];
	await host.execute(["close"]);
	await host.execute(["open", "https://fixture.invalid/recreated"]);
	const originalFetch = globalThis.fetch;
	let release: (() => void) | undefined;
	let held = false;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
		const response = await originalFetch(input, options);
		if (!held && JSON.parse(String(options?.body)).argv?.[0] === "viewport") {
			held = true;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		}
		return response;
	});
	get("refresh").click();
	await settle();
	expect(release).toBeTypeOf("function");
	expect(get("tabs").children[0].textContent).toBe(
		"0 · https://fixture.invalid/",
	);
	get("close-tab").click();
	await settle();
	expect(calls.filter((argv) => argv[0] === "tab-close")).toEqual([
		["tab-close", "0", `--expected-key=${originalTab.key}`],
	]);
	expect(get("error").textContent).toContain("Tab or session changed");
	release?.();
	await settle();
	expect(get("tabs").children[0].textContent).toBe(
		"0 · https://fixture.invalid/recreated",
	);
	expect((await host.execute(["tab-list"])).data).toHaveLength(1);
});

it("disables old tab actions immediately during a session switch", async () => {
	const { get, host, calls } = await fixture();
	await host.execute(["-s=other", "open", "https://fixture.invalid/other"]);
	get("session-name").value = "other";
	get("session-form").dispatch("submit");
	expect(get("tabs").disabled).toBe(true);
	expect(get("close-tab").disabled).toBe(true);
	get("tabs").value = "0";
	get("tabs").dispatch("change");
	get("close-tab").click();
	await settle();
	expect(
		calls.some((argv) => argv[0] === "tab-select" || argv[0] === "tab-close"),
	).toBe(false);
	const other = (
		(await host.execute(["-s=other", "tab-list"])).data as TerminalTab[]
	)[0];
	get("close-tab").click();
	await settle();
	expect(calls.filter((argv) => argv[0] === "tab-close")).toEqual([
		["tab-close", "0", `--expected-key=${other.key}`],
	]);
	expect((await host.execute(["-s=other", "tab-list"])).data).toEqual([]);
	expect((await host.execute(["tab-list"])).data).toHaveLength(1);
});

it("does not restore displayed tab guards from a delayed list after disconnect", async () => {
	const { get, calls } = await fixture();
	const originalFetch = globalThis.fetch;
	let release: (() => void) | undefined;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
		const response = await originalFetch(input, options);
		if (JSON.parse(String(options?.body)).argv?.[0] === "list") {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		}
		return response;
	});
	get("refresh").click();
	await settle();
	expect(release).toBeTypeOf("function");
	get("disconnect").click();
	await settle();
	release?.();
	await settle();
	expect(get("tabs").disabled).toBe(true);
	expect(get("close-tab").disabled).toBe(true);
	expect(get("tabs").children[0].textContent).toBe("No open tabs");
	get("tabs").value = "0";
	get("tabs").dispatch("change");
	get("close-tab").click();
	await settle();
	expect(
		calls.some((argv) => argv[0] === "tab-select" || argv[0] === "tab-close"),
	).toBe(false);
});

it.each([undefined, null, "", "x".repeat(257)])(
	"fails closed on malformed tab key %j and recovers only from a validated refresh",
	async (key) => {
		const { get, calls } = await fixture();
		const originalFetch = globalThis.fetch;
		const intercepted = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input, options) => {
				const response = await originalFetch(input, options);
				if (JSON.parse(String(options?.body)).argv?.[0] !== "list")
					return response;
				const payload = await response.json();
				payload.result.data[0].tabs[0].key = key;
				return new Response(JSON.stringify(payload), { status: 200 });
			});
		get("refresh").click();
		await settle();
		expect(get("tabs").disabled).toBe(true);
		expect(get("close-tab").disabled).toBe(true);
		get("tabs").value = "0";
		get("tabs").dispatch("change");
		get("close-tab").click();
		await settle();
		expect(
			calls.some((argv) => argv[0] === "tab-select" || argv[0] === "tab-close"),
		).toBe(false);
		intercepted.mockRestore();
		get("refresh").click();
		await settle();
		expect(get("tabs").disabled).toBe(false);
		expect(get("close-tab").disabled).toBe(false);
	},
);

it("rejects noncanonical or absent option indices without sending a tab mutation", async () => {
	const { get, calls } = await fixture();
	for (const value of ["", "00", "-1", "1", "0 --expected-key=fake"]) {
		get("tabs").value = value;
		get("tabs").dispatch("change");
		await settle();
		expect(get("error").textContent).toContain("Refresh the tab list");
	}
	expect(calls.some((argv) => argv[0] === "tab-select")).toBe(false);
});

describe("playground tab refresh consistency", () => {
	it.each(["other-tab", "navigation", "closed"])(
		"discards projections when %s changes the selected document during snapshot retrieval",
		async (change) => {
			const { get, host, revoked } = await fixture();
			get("capture-render").click();
			await settle();
			expect(get("render-image").hidden).toBe(false);
			const originalFetch = globalThis.fetch;
			let changed = false;
			const intercepted = vi
				.spyOn(globalThis, "fetch")
				.mockImplementation(async (input, options) => {
					if (
						!changed &&
						JSON.parse(String(options?.body)).argv?.[0] === "snapshot"
					) {
						changed = true;
						await host.execute(
							change === "other-tab"
								? ["tab-new", "https://fixture.invalid/replacement"]
								: change === "navigation"
									? ["open", "https://fixture.invalid/replacement"]
									: ["tab-close"],
						);
					}
					return originalFetch(input, options);
				});
			get("refresh").click();
			await settle();
			expect(changed).toBe(true);
			expect(get("error").hidden).toBe(false);
			expect(get("tabs").disabled).toBe(true);
			expect(get("close-tab").disabled).toBe(true);
			expect(get("capture-render").disabled).toBe(true);
			expect(get("viewport-apply").disabled).toBe(true);
			expect(get("text-output").textContent).not.toContain("Hello");
			expect(get("snapshot-output").textContent).not.toContain('"entries"');
			expect(get("document-state").textContent).toBe("No verified document");
			expect(get("render-image").hidden).toBe(true);
			expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
			intercepted.mockRestore();
			get("refresh").click();
			await settle();
			expect(get("tabs").disabled).toBe(change === "closed");
			expect(get("capture-render").disabled).toBe(change === "closed");
		},
	);

	it.each(["list", "snapshot"])(
		"clears old inspection data when %s transport fails",
		async (command) => {
			const { get, calls } = await fixture();
			get("target").value = "old:1";
			get("value").value = "private draft";
			const originalFetch = globalThis.fetch;
			vi.spyOn(globalThis, "fetch").mockImplementation(
				async (input, options) => {
					if (JSON.parse(String(options?.body)).argv?.[0] === command)
						throw new Error("Synthetic inspection failure");
					return originalFetch(input, options);
				},
			);
			get("refresh").click();
			await settle();
			expect(get("error").textContent).toContain(
				"Synthetic inspection failure",
			);
			expect(get("capture-render").disabled).toBe(true);
			expect(get("text-output").textContent).not.toContain("Hello");
			expect(get("target").value).toBe("");
			expect(get("value").value).toBe("");
			const count = calls.length;
			get("action-form").dispatch("submit");
			get("fill").click();
			get("close-tab").click();
			await settle();
			expect(calls).toHaveLength(count);
		},
	);

	it.each(["missing-key", "duplicate-key", "no-selection"])(
		"clears document controls after %s metadata",
		async (invalid) => {
			const { get } = await fixture();
			const originalFetch = globalThis.fetch;
			vi.spyOn(globalThis, "fetch").mockImplementation(
				async (input, options) => {
					const response = await originalFetch(input, options);
					if (JSON.parse(String(options?.body)).argv?.[0] !== "list")
						return response;
					const payload = await response.json();
					const tabs = payload.result.data[0].tabs;
					if (invalid === "missing-key") tabs[0].key = undefined;
					else if (invalid === "no-selection") tabs[0].selected = false;
					else
						tabs.push({ ...tabs[0], index: 1, id: "other", selected: false });
					return new Response(JSON.stringify(payload), { status: 200 });
				},
			);
			get("refresh").click();
			await settle();
			expect(get("tabs").disabled).toBe(true);
			expect(get("capture-render").disabled).toBe(true);
			expect(get("viewport-apply").disabled).toBe(true);
			expect(get("document-state").textContent).toBe("No verified document");
		},
	);

	it("rejects a recreated blank session before reading its snapshot under old metadata", async () => {
		const { get, host, calls } = await fixture();
		const originalFetch = globalThis.fetch;
		let changed = false;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
			if (
				!changed &&
				JSON.parse(String(options?.body)).argv?.[0] === "viewport"
			) {
				changed = true;
				await host.execute(["close"]);
				await host.execute(["open"]);
			}
			return originalFetch(input, options);
		});
		const count = calls.length;
		get("refresh").click();
		await settle();
		expect(get("error").textContent).toContain("Tab changed during inspection");
		expect(calls.slice(count).some((argv) => argv[0] === "snapshot")).toBe(
			false,
		);
		expect(get("tabs").disabled).toBe(true);
		expect(get("capture-render").disabled).toBe(true);
	});

	it("does not clear a newer session when an old snapshot request rejects late", async () => {
		const { get, host } = await fixture();
		await host.execute(["-s=other", "open", "https://fixture.invalid/other"]);
		const originalFetch = globalThis.fetch;
		let rejectOld: ((error: Error) => void) | undefined;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
			const request = JSON.parse(String(options?.body));
			if (request.session === "default" && request.argv?.[0] === "snapshot")
				await new Promise<void>((_resolve, reject) => {
					rejectOld = reject;
				});
			return originalFetch(input, options);
		});
		get("refresh").click();
		await settle();
		expect(rejectOld).toBeTypeOf("function");
		get("session-name").value = "other";
		get("session-form").dispatch("submit");
		await settle();
		expect(get("capture-render").disabled).toBe(false);
		const snapshot = get("snapshot-output").textContent;
		rejectOld?.(new Error("Old session request failed"));
		await settle();
		expect(get("snapshot-output").textContent).toBe(snapshot);
		expect(get("capture-render").disabled).toBe(false);
		expect(get("close-tab").disabled).toBe(false);
	});
});

it("sends guarded wheel input, moves native geometry and replaces stale captures", async () => {
	const { get, host, calls, blobs, revoked } = await fixture(
		false,
		'<div style="height:100px;width:100px;background:red"></div><div id="below" style="height:100px;width:100px;background:blue"></div>',
	);
	expect(get("wheel-apply").disabled).toBe(false);
	get("capture-render").click();
	await settle();
	const before = (await host.execute(["geometry", "#below"])).data as {
		bounds: { x: number; y: number };
	};
	get("wheel-x").value = "10.5";
	get("wheel-y").value = "100";
	get("wheel-form").dispatch("submit");
	expect(get("wheel-apply").disabled).toBe(true);
	get("wheel-form").dispatch("submit");
	await settle();
	expect(calls.filter((argv) => argv[0] === "mousewheel")).toEqual([
		[
			"mousewheel",
			"10.5",
			"100",
			expect.stringMatching(/^--expected-viewport=/),
			expect.stringMatching(/^--expected-document=/),
		],
	]);
	expect((await host.execute(["geometry", "#below"])).data).toMatchObject({
		bounds: { x: before.bounds.x - 10.5, y: before.bounds.y - 100 },
		scroll: { x: 10.5, y: 100 },
	});
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
	get("capture-render").click();
	await settle();
	expect(blobs).toHaveLength(2);
	expect(new Uint8Array(await blobs[1].arrayBuffer())).not.toEqual(
		new Uint8Array(await blobs[0].arrayBuffer()),
	);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	get("disconnect").click();
	await settle();
	expect(get("wheel-apply").disabled).toBe(true);
	get("wheel-form").dispatch("submit");
	await settle();
	expect(calls.filter((argv) => argv[0] === "mousewheel")).toHaveLength(1);
});

it.each(["", "NaN", "Infinity", "1000001", "-1000001"])(
	"rejects wheel delta %s locally and retains a valid capture",
	async (delta) => {
		const { get, calls } = await fixture();
		get("capture-render").click();
		await settle();
		get("wheel-y").value = delta;
		get("wheel-form").dispatch("submit");
		await settle();
		expect(get("error").hidden).toBe(false);
		expect(get("render-image").hidden).toBe(false);
		expect(calls.some((argv) => argv[0] === "mousewheel")).toBe(false);
	},
);

it.each(["tab", "navigation", "session"])(
	"refuses stale playground wheel input after external %s change",
	async (replacement) => {
		const { get, host } = await fixture(
			false,
			'<div id="tall" style="height:200px"></div>',
		);
		if (replacement === "tab")
			await host.execute(["tab-new", "https://fixture.invalid/new"]);
		else if (replacement === "navigation")
			await host.execute(["goto", "https://fixture.invalid/new"]);
		else {
			await host.execute(["close"]);
			await host.execute(["open", "https://fixture.invalid/new"]);
			await host.execute(["resize", "40", "40"]);
		}
		get("wheel-form").dispatch("submit");
		await settle();
		expect(get("error").textContent).toContain("changed before wheel input");
		expect((await host.execute(["geometry", "#tall"])).data).toMatchObject({
			scroll: { x: 0, y: 0 },
		});
	},
);

it("retains shared-pointer semantics rather than synthesizing a mouse move", async () => {
	const { get, host, calls } = await fixture(
		false,
		'<div id="tall" style="height:200px"></div>',
	);
	await host.execute(["mousemove", "-1", "-1"]);
	get("wheel-form").dispatch("submit");
	await settle();
	expect(get("error").hidden).toBe(true);
	expect(calls.some((argv) => argv[0] === "mousemove")).toBe(false);
	expect((await host.execute(["geometry", "#tall"])).data).toMatchObject({
		scroll: { x: 0, y: 0 },
	});
});

describe("playground targeted key ownership", () => {
	it.each(["tab", "navigation", "session"])(
		"does not send keys to a replacement %s with the same selector",
		async (change) => {
			const { get, host, calls } = await fixture(
				false,
				'<select id="pick"><option>Alpha</option><option>Beta</option></select>',
			);
			get("target").value = "#pick";
			get("value").value = "ArrowDown";
			if (change === "session") await host.execute(["close"]);
			await host.execute([
				change === "tab" ? "tab-new" : "open",
				"https://fixture.invalid/replacement",
			]);
			get("press-target").click();
			await settle();
			expect(get("error").textContent).toContain(
				"changed before keyboard input",
			);
			const snapshot = (await host.execute(["snapshot"])).data as {
				entries: { role: string; value?: string }[];
			};
			expect(
				snapshot.entries.find((entry) => entry.role === "combobox")?.value,
			).toBe("Alpha");
			expect(calls.filter((argv) => argv[0] === "press")).toHaveLength(1);
		},
	);

	it("ignores key activation after a failed inspection clears its owner", async () => {
		const { get, calls } = await fixture(false, '<input id="field">');
		const originalFetch = globalThis.fetch;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
			if (JSON.parse(String(options?.body)).argv?.[0] === "list")
				throw new Error("Synthetic failure");
			return originalFetch(input, options);
		});
		get("refresh").click();
		await settle();
		const count = calls.length;
		get("press-target").click();
		await settle();
		expect(calls).toHaveLength(count);
	});

	it("disables key submission immediately while switching sessions", async () => {
		const { get, host, calls } = await fixture(false, '<input id="field">');
		await host.execute(["-s=other", "open", "https://fixture.invalid/other"]);
		get("target").value = "#field";
		get("value").value = "Enter";
		get("session-name").value = "other";
		get("session-form").dispatch("submit");
		expect(get("press-target").disabled).toBe(true);
		get("press-target").click();
		await settle();
		expect(calls.some((argv) => argv[0] === "press")).toBe(false);
	});

	it("drops selector and key drafts when a refresh observes a different document", async () => {
		const { get, host } = await fixture(false, '<input id="field">');
		get("target").value = "#field";
		get("value").value = "private draft";
		await host.execute(["open", "https://fixture.invalid/new"]);
		get("refresh").click();
		await settle();
		expect(get("target").value).toBe("");
		expect(get("value").value).toBe("");
	});
});

it("presses a key on the chosen control through the real host and invalidates old pixels", async () => {
	const { get, host, calls, revoked } = await fixture(
		false,
		'<select id="pick"><option>Alpha</option><option>Beta</option></select>',
	);
	expect(get("press-target").disabled).toBe(false);
	const owner = ((await host.execute(["tab-list"])).data as TerminalTab[])[0];
	get("capture-render").click();
	await settle();
	get("target").value = "#pick";
	get("value").value = "ArrowDown";
	get("press-target").click();
	await settle();
	expect(calls).toContainEqual([
		"press",
		"--target=#pick",
		`--expected-viewport=${owner.key}`,
		`--expected-document=${owner.documentRef}`,
		"--",
		"ArrowDown",
	]);
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
	const snapshot = (await host.execute(["snapshot"])).data as {
		entries: { role: string; value?: string }[];
	};
	expect(
		snapshot.entries.find((entry) => entry.role === "combobox")?.value,
	).toBe("Beta");
	get("disconnect").click();
	await settle();
	expect(get("press-target").disabled).toBe(true);
});

it("surfaces targeted-key failure without substituting a click or fill", async () => {
	const { get, calls } = await fixture();
	get("target").value = "#missing";
	get("value").value = "Enter";
	get("press-target").click();
	await settle();
	expect(get("error").hidden).toBe(false);
	expect(calls.filter((argv) => ["click", "fill"].includes(argv[0]))).toEqual(
		[],
	);
});

it("does not interpret an option-looking key as a frontend command flag", async () => {
	const { get, host, calls } = await fixture(false, '<input id="field">');
	const owner = ((await host.execute(["tab-list"])).data as TerminalTab[])[0];
	get("target").value = "#field";
	get("value").value = "--help";
	get("press-target").click();
	await settle();
	expect(calls).toContainEqual([
		"press",
		"--target=#field",
		`--expected-viewport=${owner.key}`,
		`--expected-document=${owner.documentRef}`,
		"--",
		"--help",
	]);
	expect(get("error").hidden).toBe(false);
});

it("loads confirmed viewport dimensions and applies a guarded draft through the real command host", async () => {
	const { get, host, calls, blobs, revoked } = await fixture();
	expect(get("viewport-width").value).toBe("40");
	expect(get("viewport-height").value).toBe("40");
	expect(get("viewport-state").textContent).toContain("not device emulation");
	expect(get("viewport-apply").disabled).toBe(false);
	get("capture-render").click();
	await settle();
	get("viewport-width").value = "64";
	get("viewport-width").dispatch("input");
	get("viewport-height").value = "32";
	get("viewport-height").dispatch("input");
	get("refresh").click();
	await settle();
	expect(get("viewport-width").value).toBe("64");
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 40,
		height: 40,
	});
	get("viewport-form").dispatch("submit");
	await settle();
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 64,
		height: 32,
	});
	expect(calls.find((argv) => argv[0] === "resize")).toEqual([
		"resize",
		"64",
		"32",
		expect.stringMatching(/^--expected-viewport=/),
	]);
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
	expect(get("viewport-state").textContent).toContain("64 × 32");
	get("capture-render").click();
	await settle();
	const bytes = new Uint8Array(await blobs[1].arrayBuffer());
	const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	expect([header.getUint32(16), header.getUint32(20)]).toEqual([64, 32]);
});

it("keeps presets and swapped sizes as drafts and restores confirmed values without mutations", async () => {
	const { get, calls, host } = await fixture();
	get("viewport-preset").value = "390x844";
	get("viewport-preset").dispatch("change");
	expect([get("viewport-width").value, get("viewport-height").value]).toEqual([
		"390",
		"844",
	]);
	get("viewport-swap").click();
	expect([get("viewport-width").value, get("viewport-height").value]).toEqual([
		"844",
		"390",
	]);
	get("viewport-restore").click();
	expect([get("viewport-width").value, get("viewport-height").value]).toEqual([
		"40",
		"40",
	]);
	expect(calls.some((argv) => argv[0] === "resize")).toBe(false);
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 40,
		height: 40,
	});
});

it("rejects invalid size drafts locally without discarding valid captures", async () => {
	const { get, calls } = await fixture();
	get("capture-render").click();
	await settle();
	get("viewport-width").value = "2e3";
	get("viewport-form").dispatch("submit");
	await settle();
	expect(calls.some((argv) => argv[0] === "resize")).toBe(false);
	expect(get("error").textContent).toContain("whole CSS pixels");
	expect(get("render-image").hidden).toBe(false);
});

it("observes external resize, invalidates stale captures and preserves a local draft", async () => {
	const { get, host, revoked } = await fixture();
	get("capture-render").click();
	await settle();
	get("viewport-width").value = "50";
	get("viewport-width").dispatch("input");
	await host.execute(["resize", "80", "60"]);
	get("refresh").click();
	await settle();
	expect(get("viewport-state").textContent).toContain("80 × 60");
	expect(get("viewport-width").value).toBe("50");
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
	get("viewport-restore").click();
	expect([get("viewport-width").value, get("viewport-height").value]).toEqual([
		"80",
		"60",
	]);
});

it("refuses an apply when another client changed the selected tab", async () => {
	const { get, host } = await fixture();
	get("viewport-width").value = "60";
	get("viewport-width").dispatch("input");
	await host.execute(["tab-new"]);
	get("viewport-form").dispatch("submit");
	await settle();
	expect(get("error").textContent).toContain("Selected tab or session changed");
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 1280,
		height: 720,
	});
	expect(get("viewport-width").value).toBe("1280");
	expect(get("viewport-apply").disabled).toBe(false);
	await host.execute(["tab-select", "0"]);
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 40,
		height: 40,
	});
});

it("clears confirmed and draft viewport state on disconnect", async () => {
	const { get, calls } = await fixture();
	get("viewport-width").value = "60";
	get("viewport-width").dispatch("input");
	get("disconnect").click();
	await settle();
	expect(get("viewport-width").value).toBe("");
	expect(get("viewport-height").value).toBe("");
	expect(get("viewport-apply").disabled).toBe(true);
	get("viewport-form").dispatch("submit");
	await settle();
	expect(calls.some((argv) => argv[0] === "resize")).toBe(false);
});

it("does not restore viewport controls from a delayed response after disconnect", async () => {
	const { get } = await fixture();
	const original = globalThis.fetch;
	let release: (() => void) | undefined;
	let held = false;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
		const response = await original(input, options);
		const body = JSON.parse(String(options?.body));
		if (!held && body.argv?.[0] === "viewport") {
			held = true;
			await new Promise<void>((resolve) => {
				release = resolve;
			});
		}
		return response;
	});
	get("refresh").click();
	await settle();
	expect(release).toBeTypeOf("function");
	get("disconnect").click();
	await settle();
	release?.();
	await settle();
	expect(get("viewport-apply").disabled).toBe(true);
	expect(get("viewport-width").value).toBe("");
	expect(get("viewport-state").textContent).toBe("No confirmed viewport.");
});

it("clears a draft immediately when switching to a session with the same tab ID", async () => {
	const { get, host, calls } = await fixture();
	await host.execute(["-s=other", "open", "https://fixture.invalid/other"]);
	get("viewport-width").value = "60";
	get("viewport-width").dispatch("input");
	get("session-name").value = "other";
	get("session-form").dispatch("submit");
	expect(get("viewport-apply").disabled).toBe(true);
	expect(get("viewport-width").value).toBe("");
	get("viewport-form").dispatch("submit");
	await settle();
	expect(get("viewport-width").value).toBe("1280");
	expect(calls.some((argv) => argv[0] === "resize")).toBe(false);
	expect((await host.execute(["-s=other", "viewport"])).data).toMatchObject({
		width: 1280,
		height: 720,
	});
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 40,
		height: 40,
	});
});

it("refuses a stale draft after the service recreates the same named session and tab ID", async () => {
	const { get, host } = await fixture();
	get("viewport-width").value = "60";
	get("viewport-width").dispatch("input");
	await host.execute(["close"]);
	await host.execute(["open", "https://fixture.invalid/reopened"]);
	get("viewport-form").dispatch("submit");
	await settle();
	expect(get("error").textContent).toContain("Selected tab or session changed");
	expect(get("viewport-width").value).toBe("1280");
	expect((await host.execute(["viewport"])).data).toMatchObject({
		width: 1280,
		height: 720,
	});
});

it("disables viewport mutations on malformed server state while keeping other inspectors available", async () => {
	const { get, calls } = await fixture();
	const original = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
		const response = await original(input, options);
		const body = JSON.parse(String(options?.body));
		if (body.argv?.[0] !== "viewport") return response;
		const payload = await response.json();
		payload.result.data.width = "40";
		return new Response(JSON.stringify(payload), { status: 200 });
	});
	get("refresh").click();
	await settle();
	expect(get("viewport-apply").disabled).toBe(true);
	expect(get("viewport-state").textContent).toBe("Invalid viewport response");
	expect(get("wheel-apply").disabled).toBe(true);
	expect(get("capture-render").disabled).toBe(false);
	get("viewport-form").dispatch("submit");
	get("wheel-form").dispatch("submit");
	await settle();
	expect(calls.some((argv) => argv[0] === "resize")).toBe(false);
	expect(calls.some((argv) => argv[0] === "mousewheel")).toBe(false);
});

it("renders actual PNG bytes through the UI command flow and revokes the preview on disconnect", async () => {
	const { get, host, calls, blobs, revoked } = await fixture();
	get("capture-render").click();
	await settle();
	expect(get("render-image").src).toBe("blob:fixture/1");
	expect(get("render-image").hidden).toBe(false);
	expect(get("render-state").textContent).toContain("40 × 40");
	expect(get("render-state").textContent).toContain("not a live view");
	expect([
		...new Uint8Array(await blobs[0].arrayBuffer()).subarray(0, 8),
	]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	expect(calls.some((argv) => argv[0] === "artifact-read")).toBe(true);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	get("disconnect").click();
	await settle();
	expect(get("render-image").src).toBe("");
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
});

it("downloads a fresh PNG using a separate short-lived blob URL", async () => {
	const { get, body, blobs, revoked } = await fixture();
	get("download-png").click();
	await settle();
	expect(blobs).toHaveLength(2);
	expect(body.children.at(-1)?.download).toBe("agent-browser.png");
	expect(body.children.at(-1)?.href).toBe("blob:fixture/2");
	await vi.advanceTimersByTimeAsync(1001);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/2");
	expect(get("render-image").src).toBe("blob:fixture/1");
});

it("downloads actual PDF bytes and releases its blob and remote artifact", async () => {
	const { get, host, calls, body, blobs, revoked } = await fixture();
	expect(get("download-pdf").disabled).toBe(false);
	get("download-pdf").click();
	await settle();
	expect(calls).toContainEqual(["pdf"]);
	expect(blobs).toHaveLength(1);
	expect(blobs[0].type).toBe("application/pdf");
	expect(
		new TextDecoder().decode(
			new Uint8Array(await blobs[0].arrayBuffer()).subarray(0, 9),
		),
	).toBe("%PDF-1.4\n");
	expect(body.children.at(-1)?.download).toBe("agent-browser.pdf");
	expect(get("render-state").textContent).toContain("not print media");
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
	await vi.advanceTimersByTimeAsync(1001);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
});

it("does not download a substitute PDF when native layout is unsupported", async () => {
	const { get, host, blobs } = await fixture(true);
	get("download-pdf").click();
	await settle();
	expect(get("error").hidden).toBe(false);
	expect(get("render-state").textContent).toContain("no substitute");
	expect(blobs).toHaveLength(0);
	expect(host.metrics().captureArtifacts.bytes).toBe(0);
});

it("displays native unsupported-layout errors without fabricating a PNG", async () => {
	const { get, host, blobs } = await fixture(true);
	get("capture-render").click();
	await settle();
	expect(get("render-state").textContent).toContain("no placeholder");
	expect(get("error").hidden).toBe(false);
	expect(get("render-image").hidden).toBe(true);
	expect(blobs).toHaveLength(0);
	expect(host.metrics().captureArtifacts.artifacts).toBe(0);
});

it.each(["capture-render", "download-png"])(
	"captures a wrapped inline selection with matching dimensions and explicit scope: %s",
	async (action) => {
		const { get, calls, blobs } = await fixture(
			false,
			'<span id="selected">ab cd</span>',
		);
		get("capture-target").value = "#selected";
		get(action).click();
		await settle();
		expect(calls).toContainEqual(["screenshot", "--", "#selected"]);
		expect(get("render-state").textContent).toContain("24 × 36");
		expect(get("render-state").textContent).toContain("element ");
		const header = new DataView(await blobs[0].arrayBuffer());
		expect([header.getUint32(16), header.getUint32(20)]).toEqual([24, 36]);
	},
);

it("supports Enter and invalidates the old preview when the target changes", async () => {
	const { get, blobs, revoked } = await fixture(
		false,
		'<span id="selected">ab cd</span>',
	);
	get("capture-render").click();
	await settle();
	get("capture-target").value = "#selected";
	for (const listener of get("capture-target").listeners.get("input") ?? [])
		listener({ preventDefault() {} });
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
	for (const listener of get("capture-target").listeners.get("keydown") ?? [])
		listener({ preventDefault() {}, key: "Enter" });
	await settle();
	expect(blobs).toHaveLength(2);
	expect(get("render-state").textContent).toContain("24 × 36");
	get("disconnect").click();
	await settle();
	expect(get("capture-target").value).toBe("");
	expect(get("capture-target").disabled).toBe(true);
});

it("does not render or download a substitute viewport for a missing target", async () => {
	const { get, calls, blobs } = await fixture();
	get("capture-target").value = "#missing";
	get("download-png").click();
	await settle();
	expect(calls).toContainEqual(["screenshot", "--", "#missing"]);
	expect(blobs).toHaveLength(0);
	expect(get("render-state").textContent).toContain("no placeholder");
	expect(get("error").hidden).toBe(false);
});

it("clears the selected target and capture when the observed document changes", async () => {
	const { get, host, revoked } = await fixture(
		false,
		'<span id="selected">ab cd</span>',
	);
	get("capture-target").value = "#selected";
	get("capture-render").click();
	await settle();
	await host.execute(["goto", "https://fixture.invalid/next"]);
	get("refresh").click();
	await settle();
	expect(get("capture-target").value).toBe("");
	expect(get("render-image").hidden).toBe(true);
	expect(revoked).toHaveBeenCalledWith("blob:fixture/1");
});
