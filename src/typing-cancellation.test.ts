import { afterEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { controlValue } from "./controls.js";
import { type EventAction, runEventActionAsync } from "./event-actions.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserKeyboardEvent } from "./keyboard.js";
import { BrowserSession } from "./session.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});

async function fixture() {
	const session = new BrowserSession({
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
			parseHtmlDocument('<input id="field">', response.url),
	});
	const host = new BrowserCommandHost({ createSession: () => session });
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/typing-cancellation"]);
	await host.execute(["fill", "#field", ""]);
	const tab = session.tabs()[0].id;
	const page = session.page(tab);
	const target = page.queries.querySelector("#field");
	if (target === null) throw new Error("Missing field");
	return {
		host,
		session,
		tab,
		page,
		target,
		keyboard: page.interactions.keyboard,
		events: page.interactions.events,
		value: () => controlValue(page.document, target),
	};
}

function gate() {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}

function observe(pending: Promise<unknown>) {
	const state = { settled: false, error: undefined as unknown };
	const done = pending.then(
		() => {
			state.settled = true;
		},
		(error) => {
			state.error = error;
			state.settled = true;
		},
	);
	return { state, done };
}

const phases = ["keydown", "keypress", "beforeinput", "input", "keyup"];

it.each(phases)(
	"observes cancellation queued by %s before advancing the typing generator",
	async (phase) => {
		const { keyboard, events, target, value } = await fixture();
		const controller = new AbortController();
		events.addEventListener(
			target,
			phase,
			() => {
				queueMicrotask(() => controller.abort());
			},
			{ once: true },
		);
		await expect(
			keyboard.typeAsync("a", controller.signal),
		).rejects.toMatchObject({
			code: "aborted",
		});
		expect(value()).toBe(["input", "keyup"].includes(phase) ? "a" : "");
		expect(events.metrics().activeDispatches).toBe(0);
	},
);

it("does not start an event-action generator for an already aborted signal", async () => {
	const { events, target } = await fixture();
	const trace: string[] = [];
	function* action(): EventAction<void> {
		trace.push("started");
		yield { target, event: new BrowserEvent("probe") };
		trace.push("default");
	}
	await expect(
		runEventActionAsync(events, action(), AbortSignal.abort()),
	).rejects.toMatchObject({ code: "aborted" });
	expect(trace).toEqual([]);
});

it("unwinds an event action when cancellation runs between dispatch and its default", async () => {
	const { events, target } = await fixture();
	const controller = new AbortController();
	const trace: string[] = [];
	events.addEventListener(target, "probe", () => {
		trace.push("event");
		queueMicrotask(() => controller.abort());
	});
	function* action(): EventAction<void> {
		try {
			yield { target, event: new BrowserEvent("probe") };
			trace.push("default");
		} finally {
			trace.push("cleanup");
		}
	}
	await expect(
		runEventActionAsync(events, action(), controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(trace).toEqual(["event", "cleanup"]);
	expect(events.metrics().activeDispatches).toBe(0);
});

it.each(["abc", "", "+"])(
	"rejects pre-aborted native typing of %j without touching held keys or values",
	async (text) => {
		const { keyboard, events, page, target, value } = await fixture();
		keyboard.down("ShiftLeft");
		const revision = page.document.revision;
		const listener = vi.fn();
		for (const phase of phases)
			events.addEventListener(target, phase, listener);
		await expect(
			keyboard.typeAsync(text, AbortSignal.abort()),
		).rejects.toMatchObject({ code: "aborted" });
		expect(value()).toBe("");
		expect(page.document.revision).toBe(revision);
		expect(keyboard.modifiers().shift).toBe(true);
		expect(listener).not.toHaveBeenCalled();
	},
);

it.each(
	["native", "command"].flatMap((scope) =>
		phases.map((phase) => [scope, phase] as const),
	),
)("interrupts %s typing during a pending %s prefix", async (scope, phase) => {
	const { keyboard, events, host, target, value } = await fixture();
	keyboard.down("ShiftLeft");
	const entered = gate();
	const waiting = gate();
	const trace: string[] = [];
	for (const type of phases)
		events.addEventListener(target, type, () => trace.push(type));
	events.addEventListener(
		target,
		phase,
		controlledEventListener(() => {
			entered.release();
			return waiting.pending;
		}),
		{ once: true },
	);
	const controller = new AbortController();
	const operation = observe(
		scope === "native"
			? keyboard.typeAsync("ab", controller.signal)
			: host.execute(["type", "ab"], { signal: controller.signal }),
	);
	await entered.pending;
	const observed = [...trace];
	controller.abort();
	try {
		await vi.waitFor(
			() => {
				expect(operation.state.error).toMatchObject({ code: "aborted" });
				expect(events.metrics().activeDispatches).toBe(0);
			},
			{ timeout: 300 },
		);
		expect(value()).toBe(["input", "keyup"].includes(phase) ? "a" : "");
		expect(trace).toEqual(observed);
		expect(keyboard.modifiers().shift).toBe(true);
	} finally {
		waiting.release();
		await operation.done;
	}
	await host.execute(["snapshot"]);
	expect(trace).toEqual(observed);
	const repeats: boolean[] = [];
	events.addEventListener(target, "keydown", (event) => {
		if (event instanceof BrowserKeyboardEvent) repeats.push(event.repeat);
	});
	keyboard.press("a");
	expect(repeats).toEqual([false]);
	expect(keyboard.modifiers().shift).toBe(true);
});

it.each(phases)(
	"stops native typing when a synchronous %s listener aborts",
	async (phase) => {
		const { keyboard, events, target, value } = await fixture();
		const controller = new AbortController();
		events.addEventListener(target, phase, () => controller.abort(), {
			once: true,
		});
		await expect(
			keyboard.typeAsync("ab", controller.signal),
		).rejects.toMatchObject({
			code: "aborted",
		});
		expect(value()).toBe(["input", "keyup"].includes(phase) ? "a" : "");
		expect(events.metrics().activeDispatches).toBe(0);
	},
);

it.each(["native", "command"])(
	"keeps earlier characters but suppresses later defaults after %s typing aborts",
	async (scope) => {
		const { keyboard, events, host, target, value } = await fixture();
		const controller = new AbortController();
		let count = 0;
		events.addEventListener(target, "beforeinput", () => {
			if (++count === 2) controller.abort();
		});
		await expect(
			scope === "native"
				? keyboard.typeAsync("abc", controller.signal)
				: host.execute(["type", "abc"], { signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
		await host.execute(["snapshot"]);
		expect(value()).toBe("a");
		expect(count).toBe(2);
	},
);

it.each(["abort", "deadline"])(
	"releases the named-session queue on typing %s before its listener settles",
	async (mode) => {
		const { host, events, target, value } = await fixture();
		const entered = gate();
		const waiting = gate();
		events.addEventListener(
			target,
			"beforeinput",
			controlledEventListener(() => {
				entered.release();
				return waiting.pending;
			}),
			{ once: true },
		);
		const controller = new AbortController();
		const operation = observe(
			host.execute(
				["type", "ab", `--timeout=${mode === "deadline" ? 80 : 1000}`],
				{
					signal: controller.signal,
				},
			),
		);
		await entered.pending;
		const queued = observe(
			host.execute(["fill", "#field", "recovered", "--timeout=2000"]),
		);
		if (mode === "abort") controller.abort();
		try {
			await vi.waitFor(
				() => {
					expect(operation.state.error).toMatchObject({
						code: mode === "deadline" ? "timeout" : "aborted",
					});
					expect(queued.state.settled).toBe(true);
					expect(queued.state.error).toBeUndefined();
					expect(host.metrics().pendingCommands).toBe(0);
				},
				{ timeout: 400 },
			);
			expect(value()).toBe("recovered");
			expect(events.metrics().activeDispatches).toBe(0);
		} finally {
			waiting.release();
			await operation.done;
			await queued.done;
		}
		expect(value()).toBe("recovered");
	},
);

it.each(["native", "session"])(
	"preserves raw held-key state while %s down and up dispatch are interrupted",
	async (scope) => {
		const { keyboard, events, session, tab, target, value } = await fixture();
		for (const action of ["keydown", "keyup"] as const) {
			const entered = gate();
			const waiting = gate();
			events.addEventListener(
				target,
				action,
				controlledEventListener(() => {
					entered.release();
					return waiting.pending;
				}),
				{ once: true },
			);
			const controller = new AbortController();
			const operation = observe(
				scope === "session"
					? session[action](tab, "Shift", { signal: controller.signal })
					: keyboard[action === "keydown" ? "downAsync" : "upAsync"](
							"Shift",
							controller.signal,
						),
			);
			await entered.pending;
			controller.abort();
			try {
				await vi.waitFor(() =>
					expect(operation.state.error).toMatchObject({ code: "aborted" }),
				);
				expect(keyboard.modifiers().shift).toBe(action === "keydown");
				expect(value()).toBe("");
				expect(events.metrics().activeDispatches).toBe(0);
			} finally {
				waiting.release();
				await operation.done;
			}
		}
	},
);
