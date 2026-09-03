import { afterEach, expect, it, vi } from "vitest";
import { runWhenActionable } from "./action-wait.js";
import { BrowserCommandHost } from "./command-host.js";
import { prepareControlFill } from "./control-fill.js";
import { controlValidity } from "./control-validity.js";
import { controlValue, isTextControl } from "./controls.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { snapshotDocument } from "./snapshot.js";

const documents: DocumentTree[] = [];
const hosts: BrowserCommandHost[] = [];
const calendarValues = [
	["date", "2024-02-29"],
	["month", "2024-02"],
	["week", "2020-W53"],
	["time", "12:34:56.789"],
	["datetime-local", "2024-02-29T12:34"],
];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const tree of documents.splice(0)) tree.close();
	vi.useRealTimers();
});

it.each(calendarValues)(
	"clears %s and keeps required validation independent",
	(type, value) => {
		const { document, id, interactions, reference } = fixture(type, {
			required: "",
			step: "any",
		});
		interactions.fill(reference, value);
		expect(controlValidity(document, id).valid).toBe(true);
		interactions.fill(reference, "");
		expect(controlValue(document, id)).toBe("");
		expect(controlValidity(document, id).valueMissing).toBe(true);
	},
);

it.each([
	["date", "2023-02-29"],
	["date", "0000-01-01"],
	["date", "2024-2-29"],
	["month", "2024-13"],
	["week", "2021-W53"],
	["time", "24:00"],
	["time", "12:34:56.1234"],
	["datetime-local", "2024-02-29T12:00Z"],
	["date", "2024-02-29\nother"],
])("rejects malformed %s fill %j before focus or mutation", (type, value) => {
	const { document, id, interactions, reference } = fixture(type);
	const revision = document.revision;
	const seen: string[] = [];
	for (const name of ["focus", "beforeinput", "input", "change"])
		interactions.events.addEventListener(id, name, () => seen.push(name));
	expect(() => interactions.fill(reference, value)).toThrow("Invalid calendar");
	expect(document.revision).toBe(revision);
	expect(controlValue(document, id)).toBe("");
	expect(document.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("trims surrounding fill whitespace and normalizes local datetime", () => {
	const { document, id, interactions, reference } = fixture("datetime-local");
	interactions.fill(reference, "\t 2024-02-29 12:34:00.000 \n");
	expect(controlValue(document, id)).toBe("2024-02-29T12:34");
	interactions.fill(reference, " \t ");
	expect(controlValue(document, id)).toBe("");
});

it("emits generic noncancelable input/change with the committed value", () => {
	const { document, id, interactions, reference } = fixture();
	const seen: unknown[] = [];
	for (const name of ["input", "change"])
		interactions.events.addEventListener(document.root, name, (event) => {
			expect(event.constructor).toBe(BrowserEvent);
			event.preventDefault();
			seen.push([
				event.type,
				event.bubbles,
				event.composed,
				event.cancelable,
				controlValue(document, id),
			]);
		});
	expect(interactions.fill(reference, "2024-02-29").defaultPrevented).toBe(
		false,
	);
	expect(seen).toEqual([
		["input", true, true, false, "2024-02-29"],
		["change", true, false, false, "2024-02-29"],
	]);
});

it("keeps calendar fill separate from text and character-edit support", () => {
	const { document, id, interactions, reference } = fixture("date");
	expect(isTextControl(document.get(id))).toBe(false);
	interactions.fill(reference, "2024-02-29");
	expect(() => interactions.keyboard.type("a")).toThrow("not implemented");
});

it.each(["readonly", "disabled", "hidden", "inert"])(
	"rejects %s calendar controls",
	(attribute) => {
		const { document, id, interactions, reference } = fixture("date", {
			[attribute]: "",
		});
		expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
		expect(controlValue(document, id)).toBe("");
	},
);

it("respects inherited fieldset disabling", () => {
	const { document, id, interactions, reference } = fixture();
	const fieldset = document.createElement("fieldset", { disabled: "" });
	document.append(document.root, fieldset);
	document.append(fieldset, id);
	expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
	expect(controlValue(document, id)).toBe("");
});

it.each(["readonly", "disabled", "hidden", "inert"])(
	"rechecks %s after focus listeners",
	(attribute) => {
		const { document, id, interactions, reference } = fixture();
		interactions.events.addEventListener(id, "focus", () =>
			document.setAttribute(id, attribute, ""),
		);
		expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
		expect(controlValue(document, id)).toBe("");
		expect(document.wasUserEditedValue(id)).toBe(false);
	},
);

it.each(["text", "month", "checkbox"])(
	"rejects calendar-to-%s retargeting during focus",
	(type) => {
		const { document, id, interactions, reference } = fixture();
		const seen: string[] = [];
		interactions.events.addEventListener(id, "focus", () =>
			document.setAttribute(id, "type", type),
		);
		interactions.events.addEventListener(id, "input", () => seen.push("input"));
		expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
		expect(seen).toEqual([]);
		expect(document.wasUserEditedValue(id)).toBe(false);
	},
);

it("does not write a calendar target removed by focus listeners", () => {
	const { document, id, interactions, reference } = fixture();
	interactions.events.addEventListener(id, "focus", () => document.remove(id));
	expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
	expect(controlValue(document, id)).toBe("");
});

it("does not write after focus is redirected", () => {
	const { document, id, interactions, reference } = fixture();
	const other = document.createElement("input");
	document.append(document.root, other);
	interactions.events.addEventListener(id, "focus", () =>
		interactions.focus.focus(document.reference(other)),
	);
	expect(() => interactions.fill(reference, "2024-02-29")).toThrow(
		"Focus changed",
	);
	expect(controlValue(document, id)).toBe("");
});

it("retains calendar values that fail min/max/step for normal validation", () => {
	const { document, id, interactions, reference } = fixture("date", {
		min: "2024-03-01",
		step: "2",
	});
	interactions.fill(reference, "2024-02-29");
	expect(controlValidity(document, id)).toMatchObject({
		rangeUnderflow: true,
		stepMismatch: true,
	});
	expect(
		snapshotDocument(document).entries.find((entry) => entry.ref === reference)
			?.value,
	).toBe("2024-02-29");
	const form = document.createElement("form");
	document.append(document.root, form);
	document.append(form, id);
	expect(
		interactions.forms.requestSubmit(document.reference(form)).invalid[0]
			.reason,
	).toBe("range-underflow");
});

it("commits earlier dirty text history when the same node becomes a calendar", () => {
	const { document, id, interactions, reference } = fixture("text");
	const seen: string[] = [];
	interactions.events.addEventListener(id, "change", () =>
		seen.push(controlValue(document, id)),
	);
	interactions.fill(reference, "2024-02-28");
	document.setAttribute(id, "type", "date");
	interactions.fill(reference, "2024-02-29");
	interactions.focus.focus(null);
	expect(seen).toEqual(["2024-02-29"]);
});

it("does not erase a new text edit made by a calendar input listener", () => {
	const { document, id, interactions, reference } = fixture();
	let rewrite = true;
	let changes = 0;
	interactions.events.addEventListener(id, "input", () => {
		if (!rewrite) return;
		rewrite = false;
		document.setAttribute(id, "type", "text");
		interactions.fill(reference, "new text");
	});
	interactions.events.addEventListener(id, "change", () => changes++);
	interactions.fill(reference, "2024-02-29");
	expect(changes).toBe(1);
	interactions.focus.focus(null);
	expect(changes).toBe(2);
	expect(controlValue(document, id)).toBe("new text");
});

it("preserves input-listener rewrites and emits change on the same element", () => {
	const { document, id, interactions, reference } = fixture();
	const seen: string[] = [];
	interactions.events.addEventListener(id, "input", () =>
		document.setControl(id, { value: "2025-01-01" }),
	);
	interactions.events.addEventListener(id, "change", () =>
		seen.push(controlValue(document, id)),
	);
	interactions.fill(reference, "2024-02-29");
	expect(seen).toEqual(["2025-01-01"]);
	expect(document.wasUserEditedValue(id)).toBe(false);
});

it("revalidates after an asynchronous focus prefix", async () => {
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
			document.setAttribute(id, "readonly", "");
		}),
	);
	const filling = interactions.fillAsync(reference, "2024-02-29");
	expect(controlValue(document, id)).toBe("");
	release();
	await expect(filling).rejects.toThrow("readonly");
	expect(controlValue(document, id)).toBe("");
});

it("awaits the input prefix before dispatching committed change", async () => {
	const { document, id, interactions, reference } = fixture();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const seen: string[] = [];
	interactions.events.addEventListener(
		id,
		"input",
		controlledEventListener(async () => {
			seen.push("input");
			await gate;
			document.setControl(id, { value: "2025-01-01" });
		}),
	);
	interactions.events.addEventListener(id, "change", () =>
		seen.push(controlValue(document, id)),
	);
	const filling = interactions.fillAsync(reference, "2024-02-29");
	await vi.waitFor(() => expect(seen).toEqual(["input"]));
	expect(controlValue(document, id)).toBe("2024-02-29");
	release();
	await filling;
	expect(seen).toEqual(["input", "2025-01-01"]);
});

it.each(["readonly", "disabled", "hidden"])(
	"waits for %s calendar inputs to become ready",
	async (attribute) => {
		vi.useFakeTimers();
		const page = fixture("date", { [attribute]: "" });
		const perform = vi.fn((current, reference: string) =>
			current.interactions.fillAsync(reference, "2024-02-29"),
		);
		const filling = runWhenActionable(
			() => page,
			"#target",
			{ kind: "fill", value: "2024-02-29" },
			new AbortController().signal,
			perform,
			{ intervalMs: 5, maxPolls: 10 },
		);
		expect(perform).not.toHaveBeenCalled();
		page.document.removeAttribute(page.id, attribute);
		await vi.advanceTimersByTimeAsync(5);
		await filling;
		expect(perform).toHaveBeenCalledTimes(1);
		expect(controlValue(page.document, page.id)).toBe("2024-02-29");
		expect(vi.getTimerCount()).toBe(0);
	},
);

it("rejects malformed ready calendar fills without entering the action callback", async () => {
	const page = fixture();
	const perform = vi.fn();
	await expect(
		runWhenActionable(
			() => page,
			"#target",
			{ kind: "fill", value: "invalid" },
			new AbortController().signal,
			perform,
		),
	).rejects.toThrow("Invalid calendar");
	expect(perform).not.toHaveBeenCalled();
});

it("rejects detached, closed and non-string fill plans", () => {
	const { document, id, interactions, reference } = fixture();
	expect(() =>
		prepareControlFill(document, reference, 1 as unknown as string),
	).toThrow("string");
	document.remove(id);
	expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
	document.close();
	expect(() => interactions.fill(reference, "2024-02-29")).toThrow();
});

it("keeps quota failures atomic for value and origin", () => {
	const document = new DocumentTree("about:blank", { maxTextCodeUnits: 40 });
	documents.push(document);
	const id = document.createElement("input", { type: "date" });
	document.append(document.root, id);
	const interactions = new DocumentInteractions(document);
	const reference = document.reference(id);
	const seen: string[] = [];
	interactions.events.addEventListener(id, "input", () => seen.push("input"));
	expect(() => interactions.fill(reference, `${"1".repeat(40)}-01-01`)).toThrow(
		"text limit",
	);
	expect(controlValue(document, id)).toBe("");
	expect(document.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
});

it("keeps text fill cancellation and delayed change unchanged", () => {
	const { document, id, interactions, reference } = fixture("text");
	const cancel = (event: BrowserEvent) => event.preventDefault();
	interactions.events.addEventListener(id, "beforeinput", cancel);
	expect(interactions.fill(reference, "new").defaultPrevented).toBe(true);
	expect(controlValue(document, id)).toBe("");
	interactions.events.removeEventListener(id, "beforeinput", cancel);
	const changes: string[] = [];
	interactions.events.addEventListener(id, "change", () =>
		changes.push("change"),
	);
	interactions.fill(reference, "new");
	expect(changes).toEqual([]);
	interactions.focus.focus(null);
	expect(changes).toEqual(["change"]);
});

it("fills through the command host without a live network or runtime", async () => {
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
		type: "date",
		id: "calendar",
	});
	page.document.append(page.document.root, id);
	const result = await host.execute(["fill", "#calendar", "2024-02-29"]);
	expect(result.data).toMatchObject({
		reference: page.document.reference(id),
		defaultPrevented: false,
	});
	expect(controlValue(page.document, id)).toBe("2024-02-29");
});

function fixture(type = "date", attributes: Record<string, string> = {}) {
	const document = new DocumentTree("https://fixture.invalid/");
	documents.push(document);
	const id = document.createElement("input", {
		type,
		id: "target",
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

it.each(calendarValues)("fills and commits %s", (type, value) => {
	const { document, id, interactions, reference } = fixture(type);
	const seen: string[] = [];
	for (const name of ["beforeinput", "input", "change"])
		interactions.events.addEventListener(id, name, () => seen.push(name));
	interactions.fill(reference, value);
	expect(controlValue(document, id)).toBe(value);
	expect(seen).toEqual(["input", "change"]);
	interactions.focus.focus(null);
	expect(seen).toEqual(["input", "change"]);
});

it("admits calendar fill through the command action-wait gate", async () => {
	const page = fixture();
	await runWhenActionable(
		() => page,
		"#target",
		{ kind: "fill", value: "2024-02-29" },
		new AbortController().signal,
		(current, reference) =>
			current.interactions.fillAsync(reference, "2024-02-29"),
	);
	expect(controlValue(page.document, page.id)).toBe("2024-02-29");
});
