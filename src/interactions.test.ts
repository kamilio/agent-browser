import { expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { BrowserInputEvent, DocumentInteractions } from "./interactions.js";
import { snapshotDocument } from "./snapshot.js";

function fixture() {
	const tree = new DocumentTree("https://example.com/start");
	const interactions = new DocumentInteractions(tree);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = tree.root,
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		return id;
	};
	return { tree, interactions, events: interactions.events, add };
}

it("fills through cancelable beforeinput and exposes updated values to input listeners", () => {
	const { tree, interactions, events, add } = fixture();
	const input = add("input", { value: "old" });
	const calls: unknown[] = [];
	for (const type of ["beforeinput", "input", "change"])
		events.addEventListener(input, type, (event) => {
			expect(event).toBeInstanceOf(BrowserInputEvent);
			calls.push([
				event.type,
				controlValue(tree, input),
				(event as BrowserInputEvent).data,
				event.composed,
			]);
		});
	interactions.fill(tree.reference(input), "new");
	expect(calls).toEqual([
		["beforeinput", "old", "new", true],
		["input", "new", "new", true],
	]);
	events.addEventListener(input, "beforeinput", (event) =>
		event.preventDefault(),
	);
	expect(
		interactions.fill(tree.reference(input), "canceled").defaultPrevented,
	).toBe(true);
	expect(controlValue(tree, input)).toBe("new");
});

it("validates fill before dispatch and revalidates after listener mutations", () => {
	const { tree, interactions, events, add } = fixture();
	const number = add("input", { type: "number", value: "12" });
	let calls = 0;
	events.addEventListener(number, "beforeinput", () => {
		calls++;
		tree.setAttribute(number, "readonly", "");
	});
	expect(() => interactions.fill(tree.reference(number), "NaN")).toThrow(
		"numeric",
	);
	expect(calls).toBe(0);
	expect(() => interactions.fill(tree.reference(number), "13")).toThrow(
		"readonly",
	);
	expect(calls).toBe(1);
	expect(controlValue(tree, number)).toBe("12");
});

it("lets event handlers modify the document and semantic snapshots reflect the result", () => {
	const { tree, interactions, events, add } = fixture();
	const input = add("input", { "aria-label": "Query" });
	const output = add("p");
	const text = tree.createText("empty");
	tree.append(output, text);
	events.addEventListener(tree.root, "input", (event) =>
		tree.setData(text, `typed: ${controlValue(tree, event.target ?? 0)}`),
	);
	interactions.fill(tree.reference(input), "hello");
	expect(tree.textContent(output)).toBe("typed: hello");
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(input),
		)?.value,
	).toBe("hello");
});

it("selects options before bubbling input/change in order", () => {
	const { tree, interactions, events, add } = fixture();
	const select = add("select");
	add("option", { value: "one" }, select);
	add("option", { value: "two" }, select);
	const calls: unknown[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(tree.root, type, (event) =>
			calls.push([
				type,
				controlValue(tree, select),
				event.composed,
				event.cancelable,
			]),
		);
	interactions.select(tree.reference(select), ["two"]);
	expect(calls).toEqual([
		["input", "two", true, false],
		["change", "two", false, false],
	]);
	expect(() =>
		interactions.select(tree.reference(select), ["missing"]),
	).toThrow("not found");
	expect(calls).toHaveLength(2);
});

it("pre-activates checkbox state before click and restores checked/indeterminate on cancellation", () => {
	const { tree, interactions, events, add } = fixture();
	const input = add("input", { type: "checkbox" });
	tree.setControl(input, { indeterminate: true });
	const calls: unknown[] = [];
	events.addEventListener(input, "click", (event) => {
		calls.push([
			controlChecked(tree, input),
			tree.get(input).control.indeterminate,
		]);
		event.preventDefault();
	});
	events.addEventListener(input, "input", () => calls.push("input"));
	expect(interactions.click(tree.reference(input)).defaultPrevented).toBe(true);
	expect(calls).toEqual([[true, false]]);
	expect(controlChecked(tree, input)).toBe(false);
	expect(tree.get(input).control.indeterminate).toBe(true);
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(input),
		)?.indeterminate,
	).toBe(true);
});

it("successful checkbox clicks emit click, input and change with post-toggle state", () => {
	const { tree, interactions, events, add } = fixture();
	const input = add("input", { type: "checkbox" });
	const calls: unknown[] = [];
	for (const type of ["click", "input", "change"])
		events.addEventListener(input, type, (event) =>
			calls.push([event.type, controlChecked(tree, input)]),
		);
	interactions.click(tree.reference(input));
	expect(calls).toEqual([
		["click", true],
		["input", true],
		["change", true],
	]);
	expect(
		interactions.setChecked(tree.reference(input), true).defaultPrevented,
	).toBe(false);
	expect(calls).toHaveLength(3);
	interactions.setChecked(tree.reference(input), false);
	expect(calls.slice(3)).toEqual([
		["click", false],
		["input", false],
		["change", false],
	]);
});

it("restores the previous radio including a disabled previous selection on canceled click", () => {
	const { tree, interactions, events, add } = fixture();
	const previous = add("input", {
		type: "radio",
		name: "choice",
		checked: "",
		disabled: "",
	});
	const next = add("input", { type: "radio", name: "choice" });
	events.addEventListener(next, "click", (event) => {
		expect(controlChecked(tree, previous)).toBe(false);
		expect(controlChecked(tree, next)).toBe(true);
		event.preventDefault();
	});
	interactions.click(tree.reference(next));
	expect(controlChecked(tree, previous)).toBe(true);
	expect(controlChecked(tree, next)).toBe(false);
});

it("does not revive a previous radio that no longer belongs to the current group", () => {
	const { tree, interactions, events, add } = fixture();
	const previous = add("input", { type: "radio", name: "choice", checked: "" });
	const next = add("input", { type: "radio", name: "choice" });
	events.addEventListener(next, "click", (event) => {
		tree.setAttribute(next, "name", "different");
		event.preventDefault();
	});
	interactions.click(tree.reference(next));
	expect(controlChecked(tree, previous)).toBe(false);
	expect(controlChecked(tree, next)).toBe(false);
});

it("already-checked radios do not emit change and requested check cancellation is an error", () => {
	const { tree, interactions, events, add } = fixture();
	const radio = add("input", { type: "radio", checked: "" });
	let changes = 0;
	events.addEventListener(radio, "change", () => changes++);
	interactions.click(tree.reference(radio));
	expect(changes).toBe(0);
	expect(() => interactions.setChecked(tree.reference(radio), false)).toThrow(
		"cannot be unchecked",
	);
	const checkbox = add("input", { type: "checkbox" });
	events.addEventListener(checkbox, "click", (event) => event.preventDefault());
	expect(() => interactions.setChecked(tree.reference(checkbox), true)).toThrow(
		"requested checked state",
	);
	expect(controlChecked(tree, checkbox)).toBe(false);
	const restored = add("input", { type: "radio" });
	events.addEventListener(restored, "click", () =>
		tree.setControl(restored, { checked: false }),
	);
	events.addEventListener(restored, "change", () => changes++);
	interactions.click(tree.reference(restored));
	expect(changes).toBe(0);
});

it("permits first-legend controls but denies hidden, inert and disabled control descendants", () => {
	const { tree, interactions, events, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const legend = add("legend", {}, fieldset);
	const allowed = add("input", {}, legend);
	interactions.fill(tree.reference(allowed), "allowed");
	expect(controlValue(tree, allowed)).toBe("allowed");
	const denied = add("input", {}, fieldset);
	const button = add("button", { disabled: "" });
	const span = add("span", {}, button);
	const hidden = add("div", { hidden: "" });
	const hiddenInput = add("input", {}, hidden);
	const inert = add("div", { inert: "" });
	const inertInput = add("input", {}, inert);
	let calls = 0;
	events.addEventListener(tree.root, "click", () => calls++);
	for (const id of [denied, span, hiddenInput, inertInput])
		expect(() => interactions.click(tree.reference(id))).toThrow(
			"hidden, inert or disabled",
		);
	expect(calls).toBe(0);
});

it("uses the clicked descendant's event target but the ancestor link's updated destination", () => {
	const { tree, interactions, events, add } = fixture();
	add("base", { href: "/base/", target: "_blank" });
	const link = add("a", { href: "old" });
	const child = add("span", {}, link);
	events.addEventListener(link, "click", (event) => {
		expect(event.target).toBe(child);
		tree.setAttribute(link, "href", "new");
	});
	expect(interactions.click(tree.reference(child)).defaultAction).toEqual({
		kind: "navigate",
		url: "https://example.com/base/new",
		target: "_blank",
	});
	tree.setAttribute(link, "target", "");
	expect(interactions.click(tree.reference(child)).defaultAction).toMatchObject(
		{ target: "_self" },
	);
});

it("does not produce a navigation intent for canceled or disconnected links", () => {
	const { tree, interactions, events, add } = fixture();
	const canceled = add("a", { href: "/canceled" });
	const detached = add("a", { href: "/detached" });
	events.addEventListener(canceled, "click", (event) => event.preventDefault());
	events.addEventListener(detached, "click", () => tree.remove(detached));
	expect(interactions.click(tree.reference(canceled))).toMatchObject({
		defaultPrevented: true,
	});
	expect(
		interactions.click(tree.reference(detached)).defaultAction,
	).toBeUndefined();
	expect(() => interactions.click(tree.reference(detached))).toThrow(
		"no longer",
	);
});

it("fails closed on unsupported download/audit defaults and unsafe navigation protocols", () => {
	const { tree, interactions, add } = fixture();
	const cases: Record<string, string>[] = [
		{ href: "javascript:alert(1)" },
		{ href: "/file", download: "" },
		{ href: "/page", ping: "https://example.com/audit" },
	];
	for (const attributes of cases) {
		const link = add("a", attributes);
		expect(() => interactions.click(tree.reference(link))).toThrow();
	}
});

it("keeps submission and picker pending while executing reset and resolving labels", () => {
	const { tree, interactions, events, add } = fixture();
	const form = add("form", { id: "form" });
	const submit = add("button", { form: "form" });
	const reset = add("input", { type: "reset" }, form);
	const label = add("label");
	const file = add("input", { type: "file" }, form);
	let submits = 0;
	events.addEventListener(form, "submit", () => submits++);
	expect(interactions.click(tree.reference(submit)).defaultAction).toEqual({
		kind: "submit",
		formRef: tree.reference(form),
		submitterRef: tree.reference(submit),
	});
	expect(interactions.click(tree.reference(reset)).reset).toMatchObject({
		reset: true,
		formRef: tree.reference(form),
	});
	expect(interactions.click(tree.reference(label)).label).toEqual({
		reference: tree.reference(label),
		forwarded: false,
	});
	expect(interactions.click(tree.reference(file)).defaultAction).toEqual({
		kind: "picker",
		reference: tree.reference(file),
	});
	expect(submits).toBe(0);
	for (const control of [submit, reset, file]) {
		events.addEventListener(control, "click", () =>
			tree.setAttribute(control, "disabled", ""),
		);
		expect(
			interactions.click(tree.reference(control)).defaultAction,
		).toBeUndefined();
	}
});

it("suppresses recursive clicks on the same element and rolls back preactivation on exhausted budgets", () => {
	const { tree, interactions, events, add } = fixture();
	const checkbox = add("input", { type: "checkbox" });
	let calls = 0;
	events.addEventListener(checkbox, "click", () => {
		calls++;
		interactions.click(tree.reference(checkbox));
	});
	interactions.click(tree.reference(checkbox));
	expect(calls).toBe(1);
	expect(controlChecked(tree, checkbox)).toBe(true);
	const limited = new DocumentInteractions(tree, { maxDispatchDepth: 1 });
	limited.events.addEventListener(checkbox, "click", () =>
		limited.events.dispatchEvent(checkbox, new BrowserEvent("nested")),
	);
	expect(() => limited.click(tree.reference(checkbox))).toThrow("budget");
	expect(controlChecked(tree, checkbox)).toBe(true);
});

it("treats listener exceptions as diagnostics rather than suppressing normal default activation", () => {
	const { tree, interactions, events, add } = fixture();
	const link = add("a", { href: "/next" });
	events.addEventListener(link, "click", () => {
		throw new Error("handler failed");
	});
	expect(interactions.click(tree.reference(link)).defaultAction?.kind).toBe(
		"navigate",
	);
	expect(events.drainErrors()[0].message).toBe("handler failed");
	interactions.close();
	expect(() => interactions.fill(tree.reference(link), "ignored")).toThrow(
		"closed",
	);
	expect(events.metrics().listeners).toBe(0);
});
