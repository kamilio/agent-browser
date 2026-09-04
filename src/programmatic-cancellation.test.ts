import { afterEach, expect, it, vi } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { controlledEventListener } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture() {
	const tree = parseHtmlDocument(
		'<form id="form"><input id="field" value="initial"><input id="check" type="checkbox" hidden><input id="previous" type="radio" name="group" checked><input id="radio" type="radio" name="group"><label id="label" for="check">Choice</label><button id="reset" type="reset">Reset</button><button id="submit" type="submit">Submit</button><button id="disabled" disabled>Disabled</button></form><a id="link" href="/next">Next</a>',
		"https://fixture.invalid/programmatic-cancellation",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const id = (name: string) => {
		const target = queries.querySelector(`#${name}`);
		if (target === null) throw new Error(`Missing ${name}`);
		return target;
	};
	const actions = documentInteractions(tree);
	tree.setControl(id("check"), { indeterminate: true });
	tree.setControl(id("field"), { value: "edited" });
	actions.focus.focus(tree.reference(id("field")));
	return { tree, actions, events: actions.events, id };
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

it.each([
	"check",
	"radio",
	"label",
	"reset",
	"submit",
	"disabled",
	"link",
	"field",
])(
	"rejects a pre-aborted %s activation before events, state changes or no-op success",
	(name) => {
		const { tree, actions, events, id } = fixture();
		const revision = tree.revision;
		const listener = vi.fn();
		for (const type of ["click", "input", "change", "reset"])
			events.addEventListener(tree.root, type, listener);
		return expect(actions.programmaticClickAsync(id(name), AbortSignal.abort()))
			.rejects.toMatchObject({ code: "aborted" })
			.then(() => {
				expect(tree.revision).toBe(revision);
				expect(listener).not.toHaveBeenCalled();
				expect(controlChecked(tree, id("check"))).toBe(false);
				expect(tree.get(id("check")).control.indeterminate).toBe(true);
				expect(controlChecked(tree, id("previous"))).toBe(true);
				expect(controlValue(tree, id("field"))).toBe("edited");
			});
	},
);

it.each([
	["check", "check", "click"],
	["check", "check", "input"],
	["check", "check", "change"],
	["radio", "radio", "click"],
	["label", "label", "click"],
	["label", "check", "click"],
	["reset", "form", "reset"],
	["submit", "submit", "click"],
	["link", "link", "click"],
])(
	"interrupts %s while %s %s is pending and releases its activation guard",
	async (name, listenerTarget, type) => {
		const { tree, actions, events, id } = fixture();
		const entered = gate();
		const waiting = gate();
		const trace: string[] = [];
		for (const eventType of ["click", "input", "change", "reset"])
			events.addEventListener(
				tree.root,
				eventType,
				() => trace.push(eventType),
				true,
			);
		events.addEventListener(
			id(listenerTarget),
			type,
			controlledEventListener(() => {
				entered.release();
				return waiting.pending;
			}),
			{ once: true },
		);
		actions.keyboard.down("ShiftLeft");
		const pointer = actions.mouse.metrics();
		const controller = new AbortController();
		const operation = observe(
			actions.programmaticClickAsync(id(name), controller.signal),
		);
		await entered.pending;
		const observed = [...trace];
		controller.abort();
		try {
			await vi.waitFor(
				() => expect(operation.state.error).toMatchObject({ code: "aborted" }),
				{ timeout: 300 },
			);
			expect(events.metrics().activeDispatches).toBe(0);
			expect(trace).toEqual(observed);
			const committed = type === "input" || type === "change";
			expect(controlChecked(tree, id("check"))).toBe(committed);
			expect(tree.get(id("check")).control.indeterminate).toBe(!committed);
			expect(controlChecked(tree, id("radio"))).toBe(false);
			expect(controlChecked(tree, id("previous"))).toBe(true);
			expect(controlValue(tree, id("field"))).toBe("edited");
			expect(tree.activeElement).toBe(id("field"));
			expect(actions.keyboard.modifiers().shift).toBe(true);
			expect(actions.mouse.metrics()).toEqual(pointer);
		} finally {
			waiting.release();
			await operation.done;
		}
		expect(trace).toEqual(observed);
		trace.length = 0;
		await actions.programmaticClickAsync(id(name));
		expect(trace[0]).toBe("click");
		if (name === "label") {
			expect(trace.filter((event) => event === "click")).toHaveLength(2);
			expect(controlChecked(tree, id("check"))).toBe(true);
		}
		if (name === "reset")
			expect(controlValue(tree, id("field"))).toBe("initial");
	},
);

it.each(["check", "radio", "reset", "link"])(
	"honors a microtask abort before %s activation commits its default",
	async (name) => {
		const { tree, actions, events, id } = fixture();
		const controller = new AbortController();
		events.addEventListener(
			id(name),
			"click",
			() => {
				queueMicrotask(() => controller.abort());
			},
			{ once: true },
		);
		await expect(
			actions.programmaticClickAsync(id(name), controller.signal),
		).rejects.toMatchObject({ code: "aborted" });
		expect(controlChecked(tree, id("check"))).toBe(false);
		expect(tree.get(id("check")).control.indeterminate).toBe(true);
		expect(controlChecked(tree, id("previous"))).toBe(true);
		expect(controlChecked(tree, id("radio"))).toBe(false);
		expect(controlValue(tree, id("field"))).toBe("edited");
		expect(events.metrics().activeDispatches).toBe(0);
	},
);

it("a pre-aborted recursive call cannot clear another activation's guard", async () => {
	const { tree, actions, events, id } = fixture();
	const entered = gate();
	const waiting = gate();
	let calls = 0;
	events.addEventListener(
		id("check"),
		"click",
		controlledEventListener(() => {
			calls++;
			entered.release();
			return waiting.pending;
		}),
		{ once: true },
	);
	const original = actions.programmaticClickAsync(id("check"));
	await entered.pending;
	try {
		await expect(
			actions.programmaticClickAsync(id("check"), AbortSignal.abort()),
		).rejects.toMatchObject({ code: "aborted" });
		await actions.programmaticClickAsync(id("check"));
		expect(calls).toBe(1);
		expect(controlChecked(tree, id("check"))).toBe(true);
	} finally {
		waiting.release();
		await original;
	}
	await actions.programmaticClickAsync(id("check"));
	expect(controlChecked(tree, id("check"))).toBe(false);
});
