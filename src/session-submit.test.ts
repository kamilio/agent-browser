import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { BrowserSession } from "./session.js";

const sessions: BrowserSession[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const session of sessions.splice(0)) session.close();
});

async function fixture(
	method = "post",
	handler?: (request: NetworkRequest) => Promise<Partial<NetworkResponse>>,
) {
	const requests: NetworkRequest[] = [];
	const session = new BrowserSession({
		createTransport: () => ({
			request: async (input) => {
				requests.push(input);
				return {
					url: input.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
					...(await handler?.(input)),
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				closed: false,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
			}),
			close: () => {},
		}),
		loadDocument: (response, context) =>
			new DocumentTree(response.url, context.limits),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://example.com/start");
	const page = session.page(tab.id);
	const tree = page.document;
	const form = tree.createElement("form", {
		id: "form",
		method,
		action: "/echo?old=1#fragment",
	});
	const input = tree.createElement("input", {
		id: "field",
		name: "name",
		value: "before",
		required: "",
	});
	const button = tree.createElement("button", {
		id: "send",
		name: "action",
		value: "send",
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	tree.append(form, button);
	return { session, tab, page, tree, form, input, button, requests };
}

it("awaits controlled submit listeners before preparing session navigation", async () => {
	const { session, tab, page, tree, form, input, button, requests } =
		await fixture("get");
	page.interactions.events.addEventListener(
		form,
		"submit",
		controlledEventListener(async () => {
			await Promise.resolve();
			tree.setControl(input, { value: "from listener" });
		}),
	);
	await session.click(tab.id, tree.reference(button));
	expect(requests).toHaveLength(2);
	expect(new URL(requests[1].url).searchParams.get("name")).toBe(
		"from listener",
	);
});

it("routes keyboard activation through controlled click and submit phases", async () => {
	const { session, tab, page, tree, form, input, button, requests } =
		await fixture();
	page.interactions.focus.focus(tree.reference(input));
	const trace: string[] = [];
	for (const [target, type] of [
		[input, "keydown"],
		[button, "click"],
		[form, "submit"],
	] as const)
		page.interactions.events.addEventListener(
			target,
			type,
			controlledEventListener(async () => {
				await Promise.resolve();
				trace.push(type);
			}),
		);
	await session.press(tab.id, "Enter");
	expect(trace).toEqual(["keydown", "click", "submit"]);
	expect(requests).toHaveLength(2);
});

it("does not send a request when aborted during a controlled submit prefix", async () => {
	const { session, tab, page, tree, form, requests } = await fixture();
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	page.interactions.events.addEventListener(
		form,
		"submit",
		controlledEventListener(() => pending),
	);
	const controller = new AbortController();
	const submission = session.requestSubmit(
		tab.id,
		tree.reference(form),
		{},
		{ signal: controller.signal },
	);
	controller.abort();
	release();
	await expect(submission).rejects.toMatchObject({ code: "aborted" });
	expect(requests).toHaveLength(1);
});

it("does not silently resubmit a stopped POST document during same-document history traversal", async () => {
	const { session, tab, tree, button, requests } = await fixture();
	await session.click(tab.id, tree.reference(button));
	const page = session.page(tab.id);
	page.history.pushState(null, "#next");
	page.interactions.close();
	await expect(session.back(tab.id)).rejects.toMatchObject({
		code: "unsupported",
	});
	expect(requests).toHaveLength(2);
});

it.each(["get", "post"])(
	"click executes %s form navigation with cookies, origin and current values",
	async (method) => {
		const { session, tab, page, tree, form, input, button, requests } =
			await fixture(method);
		page.interactions.events.addEventListener(form, "submit", () =>
			tree.setControl(input, { value: "after event" }),
		);
		const formRef = tree.reference(form);
		const result = await session.click(tab.id, tree.reference(button));
		expect(result.navigation?.kind).toBe("document");
		expect(result.form).toEqual({
			formRef,
			canceled: false,
			recursive: false,
			invalid: [],
		});
		expect(requests[1]).toMatchObject({
			method: method.toUpperCase(),
			cookieContext: {
				siteUrl: "https://example.com/start",
				credentials: "include",
				topLevelNavigation: true,
			},
		});
		if (method === "get")
			expect(requests[1].url).toBe(
				"https://example.com/echo?name=after+event&action=send#fragment",
			);
		else {
			expect(new TextDecoder().decode(requests[1].body as Uint8Array)).toBe(
				"name=after+event&action=send",
			);
			expect(requests[1].headers).toMatchObject({
				origin: "https://example.com",
			});
		}
		expect(tree.nodeCount).toBe(0);
	},
);

it("POST to the same fragment URL performs a request instead of a history-only change", async () => {
	const { session, tab, tree, form, button, requests } = await fixture();
	tree.setAttribute(form, "action", "#next");
	expect(
		(await session.click(tab.id, tree.reference(button))).navigation?.kind,
	).toBe("document");
	expect(requests[1].method).toBe("POST");
});

it.each(["invalid", "canceled"])(
	"%s submissions retain the page and perform no network request",
	async (mode) => {
		const { session, tab, page, tree, form, input, button, requests } =
			await fixture();
		if (mode === "invalid") tree.setControl(input, { value: "" });
		else
			page.interactions.events.addEventListener(form, "submit", (event) =>
				event.preventDefault(),
			);
		const result = await session.click(tab.id, tree.reference(button));
		expect(result.navigation).toBeUndefined();
		expect(
			mode === "invalid" ? result.form?.invalid.length : result.form?.canceled,
		).toBeTruthy();
		expect(session.page(tab.id)).toBe(page);
		expect(requests).toHaveLength(1);
	},
);

it("submitter target overrides cannot silently navigate another tab", async () => {
	const { session, tab, tree, button, requests } = await fixture();
	tree.setAttribute(button, "formtarget", "_blank");
	await expect(
		session.click(tab.id, tree.reference(button)),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(requests).toHaveLength(1);
});

it("POST results require explicit resubmission rather than replaying or silently changing to GET", async () => {
	const { session, tab, tree, button, requests } = await fixture();
	await session.click(tab.id, tree.reference(button));
	expect(() => session.reload(tab.id)).toThrow(/resubmission/);
	expect(requests).toHaveLength(2);
	await session.navigate(tab.id, "#same-document");
	expect(() => session.reload(tab.id)).toThrow(/resubmission/);
});

it.each([301, 302, 303, 307, 308])(
	"tracks POST reload semantics after redirect %s",
	async (status) => {
		const { session, tab, tree, button, requests } = await fixture(
			"post",
			async (request) =>
				request.method === "POST"
					? {
							url: "https://example.com/result",
							redirects: [
								{
									url: request.url,
									status,
									location: "https://example.com/result",
								},
							],
						}
					: {},
		);
		await session.click(tab.id, tree.reference(button));
		if ([301, 302, 303].includes(status)) {
			await session.reload(tab.id);
			expect(requests).toHaveLength(3);
			expect(requests[2].body).toBeUndefined();
		} else expect(() => session.reload(tab.id)).toThrow(/resubmission/);
	},
);

it("HTTP 204 submission preserves the prior document and its reload method", async () => {
	const { session, tab, page, tree, button, requests } = await fixture(
		"post",
		async (request) => (request.method === "POST" ? { status: 204 } : {}),
	);
	expect(
		(await session.click(tab.id, tree.reference(button))).navigation?.kind,
	).toBe("no-content");
	expect(session.page(tab.id)).toBe(page);
	await session.reload(tab.id);
	expect(requests[2].method).toBeUndefined();
});

it("does not overwrite a newer navigation started in submit listeners", async () => {
	const { session, tab, page, tree, form, button, requests } = await fixture();
	let nested: Promise<unknown> | undefined;
	page.interactions.events.addEventListener(form, "submit", () => {
		nested = session.navigate(tab.id, "/newer");
	});
	await expect(
		session.click(tab.id, tree.reference(button)),
	).rejects.toMatchObject({ code: "aborted" });
	await nested;
	expect(requests).toHaveLength(2);
	expect(session.page(tab.id).document.url).toBe("https://example.com/newer");
});

it("pre-aborted submissions dispatch no submit events or requests", async () => {
	const { session, tab, page, tree, form, button, requests } = await fixture();
	let calls = 0;
	page.interactions.events.addEventListener(form, "submit", () => calls++);
	await expect(
		session.click(tab.id, tree.reference(button), {
			signal: AbortSignal.abort(),
		}),
	).rejects.toMatchObject({ code: "aborted" });
	expect(calls).toBe(0);
	expect(requests).toHaveLength(1);
});

it("stops an in-flight submission and rejects its late response without replacing the page", async () => {
	let release!: (value: Partial<NetworkResponse>) => void;
	const delayed = new Promise<Partial<NetworkResponse>>((resolve) => {
		release = resolve;
	});
	const { session, tab, page, tree, button, requests } = await fixture(
		"post",
		async (request) => (request.method === "POST" ? delayed : {}),
	);
	const pending = session.click(tab.id, tree.reference(button));
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await vi.waitFor(() => expect(requests).toHaveLength(2));
	session.stop(tab.id);
	await rejected;
	expect(session.page(tab.id)).toBe(page);
	release({});
	await vi.waitFor(() => expect(session.metrics().pendingLoads).toBe(0));
	expect(session.page(tab.id)).toBe(page);
});

it("CLI click reports validation failure without mislabeling it unsupported or submitting", async () => {
	const { session, tree, input, requests } = await fixture();
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open"]);
	await host.execute(["tab-select", "0"]);
	tree.setControl(input, { value: "" });
	expect((await host.execute(["click", "#send"])).data).toMatchObject({
		form: { invalid: [{ reason: "value-missing" }] },
	});
	expect(requests).toHaveLength(1);
	await host.execute(["fill", "#field", "new value"]);
	expect((await host.execute(["click", "#send"])).data).toMatchObject({
		navigation: { kind: "document" },
	});
});

it.each(["get", "post"])(
	"typing and Enter execute %s form navigation with the default submitter",
	async (method) => {
		const { session, tab, page, tree, input, requests } = await fixture(method);
		await session.click(tab.id, tree.reference(input));
		page.interactions.keyboard.press("Control+A");
		page.interactions.keyboard.type("typed 🙂");
		const result = await session.press(tab.id, "Enter");
		expect(result.navigation?.kind).toBe("document");
		expect(result.form?.invalid).toEqual([]);
		if (method === "get")
			expect(new URL(requests[1].url).searchParams.get("name")).toBe(
				"typed 🙂",
			);
		else
			expect(
				new URLSearchParams(
					new TextDecoder().decode(requests[1].body as Uint8Array),
				).get("name"),
			).toBe("typed 🙂");
		expect(requests).toHaveLength(2);
	},
);

it.each(["hidden", "disabled"])(
	"uses the first %s submit button without falling through",
	async (attribute) => {
		const { session, tab, page, tree, input, button, form, requests } =
			await fixture();
		tree.setAttribute(button, attribute, "");
		const other = tree.createElement("button", {
			name: "action",
			value: "wrong",
		});
		tree.append(form, other);
		page.interactions.focus.focus(tree.reference(input));
		const result = await session.press(tab.id, "Enter");
		if (attribute === "disabled") {
			expect(result.navigation).toBeUndefined();
			expect(requests).toHaveLength(1);
		} else {
			expect(result.navigation?.kind).toBe("document");
			expect(
				new TextDecoder().decode(requests[1].body as Uint8Array),
			).toContain("action=send");
		}
	},
);

it.each([1, 2])(
	"allows implicit submission without a button only with one blocking input (%s)",
	async (count) => {
		const { session, tab, page, tree, input, button, form, requests } =
			await fixture();
		tree.remove(button);
		if (count === 2)
			tree.append(form, tree.createElement("input", { name: "second" }));
		page.interactions.focus.focus(tree.reference(input));
		const result = await session.press(tab.id, "Enter");
		expect(!!result.navigation).toBe(count === 1);
		expect(requests).toHaveLength(count === 1 ? 2 : 1);
	},
);

it("Enter validates required fields and honors canceled submit events", async () => {
	const { session, tab, page, tree, input, form, requests } = await fixture();
	page.interactions.fill(tree.reference(input), "");
	expect((await session.press(tab.id, "Enter")).form?.invalid).toEqual([
		expect.objectContaining({ reason: "value-missing" }),
	]);
	page.interactions.fill(tree.reference(input), "ready");
	page.interactions.events.addEventListener(form, "submit", (event) =>
		event.preventDefault(),
	);
	expect((await session.press(tab.id, "Enter")).form?.canceled).toBe(true);
	expect(page.interactions.focus.active()).toBe(input);
	expect(requests).toHaveLength(1);
});

it("textarea Enter inserts a line break without submitting its form", async () => {
	const { session, tab, page, tree, form, requests } = await fixture();
	const textarea = tree.createElement("textarea", { name: "message" });
	tree.append(form, textarea);
	page.interactions.fill(tree.reference(textarea), "one");
	expect((await session.press(tab.id, "Enter")).navigation).toBeUndefined();
	expect(tree.get(textarea).control?.value).toBe("one\n");
	expect(requests).toHaveLength(1);
});

it("Enter follows focused links through the session navigation pipeline", async () => {
	const { session, tab, page, tree, requests } = await fixture();
	const link = tree.createElement("a", { href: "/next" });
	tree.append(tree.root, link);
	page.interactions.focus.focus(tree.reference(link));
	expect((await session.press(tab.id, "Enter")).navigation?.kind).toBe(
		"document",
	);
	expect(requests[1].url).toBe("https://example.com/next");
});

it("preaborted keyboard actions dispatch no events or requests", async () => {
	const { session, tab, page, tree, input, requests } = await fixture();
	page.interactions.focus.focus(tree.reference(input));
	let events = 0;
	page.interactions.events.addEventListener(input, "keydown", () => events++);
	await expect(
		session.press(tab.id, "Enter", { signal: AbortSignal.abort() }),
	).rejects.toMatchObject({ code: "aborted" });
	expect(events).toBe(0);
	expect(requests).toHaveLength(1);
});

it.each(["fill-submit", "type-press"])(
	"executes CLI %s through actual form and keyboard behavior",
	async (workflow) => {
		const { session, requests } = await fixture();
		const host = new BrowserCommandHost({ createSession: () => session });
		hosts.push(host);
		await host.execute(["open"]);
		await host.execute(["tab-select", "0"]);
		let result: unknown;
		if (workflow === "fill-submit")
			result = (await host.execute(["fill", "#field", "cli typed", "--submit"]))
				.data;
		else {
			await host.execute(["click", "#field"]);
			await host.execute(["press", "Control+A"]);
			await host.execute(["type", "cli typed"]);
			result = (await host.execute(["press", "Enter"])).data;
		}
		expect(result).toMatchObject({ navigation: { kind: "document" } });
		expect(new TextDecoder().decode(requests[1].body as Uint8Array)).toBe(
			"name=cli+typed&action=send",
		);
	},
);

it("fill --submit respects beforeinput cancellation without sending Enter", async () => {
	const { session, page, input, requests } = await fixture();
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open"]);
	await host.execute(["tab-select", "0"]);
	let keys = 0;
	page.interactions.events.addEventListener(input, "beforeinput", (event) =>
		event.preventDefault(),
	);
	page.interactions.events.addEventListener(input, "keydown", () => keys++);
	expect(
		(await host.execute(["fill", "#field", "canceled", "--submit"])).data,
	).toMatchObject({ interaction: { defaultPrevented: true } });
	expect(keys).toBe(0);
	expect(requests).toHaveLength(1);
});
