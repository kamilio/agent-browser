import { afterEach, expect, it, vi } from "vitest";
import { runWhenActionable } from "./action-wait.js";
import { BrowserCommandHost } from "./command-host.js";
import { isFillReadOnly, prepareControlFill } from "./control-fill.js";
import { controlValidity } from "./control-validity.js";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";

const documents: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const document of documents.splice(0)) document.close();
	vi.useRealTimers();
});

function fixture(attributes: Record<string, string> = {}) {
	const document = new DocumentTree("https://fixture.invalid/");
	documents.push(document);
	const id = document.createElement("input", {
		id: "slider",
		type: "range",
		...attributes,
	});
	document.append(document.root, id);
	const interactions = new DocumentInteractions(document);
	const queries = new DocumentQueries(document);
	return {
		document,
		id,
		interactions,
		queries,
		reference: document.reference(id),
	};
}

it("fills a range with input/change instead of text editing events", () => {
	const { document, id, interactions, reference } = fixture();
	const seen: string[] = [];
	for (const name of ["beforeinput", "input", "change"])
		interactions.events.addEventListener(id, name, () => seen.push(name));
	interactions.fill(reference, "75");
	expect(controlValue(document, id)).toBe("75");
	expect(seen).toEqual(["input", "change"]);
	interactions.focus.focus(null);
	expect(seen).toEqual(["input", "change"]);
});

it("does not treat readonly as applicable to range fills", () => {
	const { document, id, interactions, reference } = fixture({ readonly: "" });
	interactions.fill(reference, "75");
	expect(controlValue(document, id)).toBe("75");
});

it("passes readonly ranges through the command action-wait gate", async () => {
	const page = fixture({ readonly: "" });
	await runWhenActionable(
		() => page,
		"#slider",
		{ kind: "fill", value: "75" },
		new AbortController().signal,
		(current, reference) => current.interactions.fillAsync(reference, "75"),
	);
	expect(controlValue(page.document, page.id)).toBe("75");
});

it.each(["0", "100", "01.0", "1e1", "-0", "\t75\n"])(
	"preserves a representable request %j",
	(requested) => {
		const { document, id, interactions, reference } = fixture();
		interactions.fill(reference, requested);
		expect(controlValue(document, id)).toBe(requested.trim());
		expect(document.wasUserEditedValue(id)).toBe(true);
	},
);

it.each(["", " ", "invalid", "Infinity", "1e999", "NaN", "+1", "1."])(
	"rejects nonnumeric range fill %j before focus",
	(requested) => {
		const { document, id, interactions, reference } = fixture();
		const revision = document.revision;
		expect(() => interactions.fill(reference, requested)).toThrow(
			"finite numeric",
		);
		expect(controlValue(document, id)).toBe("50");
		expect(interactions.focus.active()).toBeNull();
		expect(document.revision).toBe(revision);
	},
);

it.each(["-1", "101", "0.5", "74.9"])(
	"rejects a request requiring adjustment: %s",
	(requested) => {
		const { document, id, interactions, reference } = fixture();
		const events: string[] = [];
		for (const type of ["focus", "input", "change"])
			interactions.events.addEventListener(id, type, () => events.push(type));
		expect(() => interactions.fill(reference, requested)).toThrow(
			"clamp or round",
		);
		expect(controlValue(document, id)).toBe("50");
		expect(document.wasUserEditedValue(id)).toBe(false);
		expect(events).toEqual([]);
	},
);

it("accepts fractional steps and any without changing requested values", () => {
	const { document, id, interactions, reference } = fixture({
		min: "0.1",
		max: "1",
		step: "0.1",
	});
	interactions.fill(reference, "0.3");
	expect(controlValue(document, id)).toBe("0.3");
	expect(() => interactions.fill(reference, "0.25")).toThrow("clamp or round");
	document.setAttribute(id, "step", "any");
	interactions.fill(reference, "0.25");
	expect(controlValue(document, id)).toBe("0.25");
});

it("does not manufacture valid flags for an impossible author constraint", () => {
	const { document, id, interactions, reference } = fixture({
		max: "0.4",
		value: "0.5",
		step: "1",
	});
	interactions.fill(reference, "0.25");
	expect(controlValue(document, id)).toBe("0.25");
	expect(controlValidity(document, id).stepMismatch).toBe(true);
});

it.each(["text", "number", "date", "time"])(
	"keeps readonly applicable to %s fill",
	(type) => {
		const { document, id } = fixture({ type, readonly: "" });
		expect(isFillReadOnly(document.get(id))).toBe(true);
		expect(() =>
			prepareControlFill(document, document.reference(id), "75"),
		).toThrow("readonly");
	},
);

it("dispatches generic noncancelable committed events even for a repeated value", () => {
	const { interactions, id, reference } = fixture();
	const seen: unknown[] = [];
	for (const type of ["input", "change"])
		interactions.events.addEventListener(id, type, (event) => {
			expect(event.constructor).toBe(BrowserEvent);
			event.preventDefault();
			seen.push([type, event.bubbles, event.composed, event.cancelable]);
		});
	expect(interactions.fill(reference, "75").defaultPrevented).toBe(false);
	expect(interactions.fill(reference, "75").defaultPrevented).toBe(false);
	expect(seen).toEqual([
		["input", true, true, false],
		["change", true, false, false],
		["input", true, true, false],
		["change", true, false, false],
	]);
});

it.each<[string, string, string]>([
	["min", "80", "80"],
	["max", "60", "50"],
	["step", "2", "50"],
])(
	"rechecks changed %s after focus without undoing the callback mutation",
	(attribute, setting, expected) => {
		const { document, id, interactions, reference } = fixture();
		const seen: string[] = [];
		interactions.events.addEventListener(id, "focus", () =>
			document.setAttribute(id, attribute, setting),
		);
		interactions.events.addEventListener(id, "input", () => seen.push("input"));
		expect(() => interactions.fill(reference, "75")).toThrow("clamp or round");
		expect(controlValue(document, id)).toBe(expected);
		expect(document.wasUserEditedValue(id)).toBe(false);
		expect(seen).toEqual([]);
	},
);

it("accepts readonly added by focus but rejects disabled added by focus", () => {
	const accepted = fixture();
	accepted.interactions.events.addEventListener(accepted.id, "focus", () =>
		accepted.document.setAttribute(accepted.id, "readonly", ""),
	);
	accepted.interactions.fill(accepted.reference, "75");
	expect(controlValue(accepted.document, accepted.id)).toBe("75");
	const rejected = fixture();
	rejected.interactions.events.addEventListener(rejected.id, "focus", () =>
		rejected.document.setAttribute(rejected.id, "disabled", ""),
	);
	expect(() => rejected.interactions.fill(rejected.reference, "75")).toThrow();
	expect(controlValue(rejected.document, rejected.id)).toBe("50");
});

it.each(["text", "number", "date"])(
	"rejects a type change to %s during focus",
	(type) => {
		const { document, id, interactions, reference } = fixture();
		interactions.events.addEventListener(id, "focus", () =>
			document.setAttribute(id, "type", type),
		);
		expect(() => interactions.fill(reference, "75")).toThrow();
		expect(document.wasUserEditedValue(id)).toBe(false);
	},
);

it("waits for controlled focus callbacks before final range admission", async () => {
	const { document, id, interactions, reference } = fixture();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	interactions.events.addEventListener(
		id,
		"focus",
		controlledEventListener(async () => {
			await gate;
			document.setAttribute(id, "max", "60");
		}),
	);
	const pending = interactions.fillAsync(reference, "75");
	expect(controlValue(document, id)).toBe("50");
	release();
	await expect(pending).rejects.toThrow("clamp or round");
	expect(controlValue(document, id)).toBe("50");
});

it("preserves listener rewrites without a duplicate blur commit", () => {
	const { document, id, interactions, reference } = fixture();
	const changes: string[] = [];
	interactions.events.addEventListener(id, "input", () =>
		document.setControl(id, { value: "80" }),
	);
	interactions.events.addEventListener(id, "change", () =>
		changes.push(controlValue(document, id)),
	);
	interactions.fill(reference, "75");
	interactions.focus.focus(null);
	expect(changes).toEqual(["80"]);
	expect(document.wasUserEditedValue(id)).toBe(false);
});

it("waits for disabled ranges while ignoring their readonly attribute", async () => {
	vi.useFakeTimers();
	const page = fixture({ disabled: "", readonly: "" });
	const perform = vi.fn((current, reference: string) =>
		current.interactions.fillAsync(reference, "75"),
	);
	const pending = runWhenActionable(
		() => page,
		"#slider",
		{ kind: "fill", value: "75" },
		new AbortController().signal,
		perform,
		{ intervalMs: 5, maxPolls: 10 },
	);
	expect(perform).not.toHaveBeenCalled();
	page.document.removeAttribute(page.id, "disabled");
	await vi.advanceTimersByTimeAsync(5);
	await pending;
	expect(perform).toHaveBeenCalledTimes(1);
	expect(controlValue(page.document, page.id)).toBe("75");
	expect(vi.getTimerCount()).toBe(0);
});

it("does not call the command action when the requested range value needs adjustment", async () => {
	const page = fixture();
	const perform = vi.fn();
	await expect(
		runWhenActionable(
			() => page,
			"#slider",
			{ kind: "fill", value: "101" },
			new AbortController().signal,
			perform,
		),
	).rejects.toThrow("clamp or round");
	expect(perform).not.toHaveBeenCalled();
});

it("keeps quota rejection atomic even for long valid numeric spellings", () => {
	const document = new DocumentTree("about:blank", { maxTextCodeUnits: 64 });
	documents.push(document);
	const id = document.createElement("input", { type: "range" });
	document.append(document.root, id);
	const interactions = new DocumentInteractions(document);
	const seen: string[] = [];
	interactions.events.addEventListener(id, "input", () => seen.push("input"));
	expect(() =>
		interactions.fill(document.reference(id), `${"0".repeat(64)}75`),
	).toThrow("text limit");
	expect(controlValue(document, id)).toBe("50");
	expect(document.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("keeps calendar normalization and text beforeinput semantics unchanged", () => {
	const calendar = fixture({ type: "datetime-local" });
	calendar.interactions.fill(calendar.reference, "2024-02-29 12:00:00.000");
	expect(controlValue(calendar.document, calendar.id)).toBe("2024-02-29T12:00");
	const text = fixture({ type: "text" });
	text.interactions.events.addEventListener(text.id, "beforeinput", (event) =>
		event.preventDefault(),
	);
	expect(
		text.interactions.fill(text.reference, "canceled").defaultPrevented,
	).toBe(true);
	expect(controlValue(text.document, text.id)).toBe("");
});

it("fills a readonly range through the injected command host", async () => {
	let browser!: BrowserSession;
	const host = new BrowserCommandHost({
		createSession: () => {
			browser = new BrowserSession({
				loadDocument: (response) => new DocumentTree(response.url),
				createTransport: () => ({
					request: async (request) => ({
						url: request.url,
						status: 200,
						headers: {},
						body: new Uint8Array(),
						redirects: [],
						encodedBytes: 0,
						elapsedMs: 0,
					}),
					metrics: () => ({
						requests: 0,
						active: 0,
						closed: false,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
					}),
					close: () => {},
				}),
			});
			return browser;
		},
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/"]);
	const page = browser.page(browser.tabs()[0].id);
	const id = page.document.createElement("input", {
		id: "slider",
		type: "range",
		readonly: "",
	});
	page.document.append(page.document.root, id);
	const result = await host.execute(["fill", "#slider", "75"]);
	expect(result.data).toMatchObject({
		reference: page.document.reference(id),
		defaultPrevented: false,
	});
	expect(controlValue(page.document, id)).toBe("75");
});
