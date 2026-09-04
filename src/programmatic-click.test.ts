import { afterEach, expect, it } from "vitest";
import { controlChecked, controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { BrowserEvent, controlledEventListener } from "./events.js";
import { DocumentInteractions } from "./interactions.js";
import { BrowserMouseEvent } from "./mouse.js";

const trees: DocumentTree[] = [];
const owners: DocumentInteractions[] = [];
afterEach(() => {
	const errors = owners
		.splice(0)
		.flatMap((owner) => owner.events.drainErrors());
	for (const tree of trees.splice(0)) tree.close();
	expect(errors).toEqual([]);
});

function fixture() {
	const tree = new DocumentTree("https://example.com/start");
	trees.push(tree);
	const actions = new DocumentInteractions(tree);
	owners.push(actions);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent: number | null = tree.root,
	) => {
		const target = tree.createElement(tag, attributes);
		if (parent !== null) tree.append(parent, target);
		return target;
	};
	return { tree, actions, events: actions.events, add };
}

function gate() {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release: () => release() };
}

it("dispatches one untrusted bubbling cancelable click without a mouse sequence", () => {
	const { tree, actions, events, add } = fixture();
	const button = add("button");
	const calls: string[] = [];
	for (const type of ["mousedown", "mouseup", "click"])
		events.addEventListener(tree.root, type, () => calls.push(type));
	events.addEventListener(
		tree.root,
		"click",
		() => calls.push("capture"),
		true,
	);
	events.addEventListener(button, "click", (event) => {
		expect(event).toBeInstanceOf(BrowserMouseEvent);
		expect(event).toMatchObject({
			target: button,
			currentTarget: button,
			bubbles: true,
			cancelable: true,
			composed: true,
			isTrusted: false,
			clientX: 0,
			clientY: 0,
			button: 0,
			buttons: 0,
			detail: 0,
			movementX: 0,
			movementY: 0,
		});
		calls.push("target");
	});
	expect(actions.programmaticClick(button).reference).toBe(
		tree.reference(button),
	);
	expect(calls).toEqual(["capture", "target", "click"]);
});

it("does not move focus or synthesize focus and blur events", () => {
	const { tree, actions, events, add } = fixture();
	const original = add("input");
	const button = add("button");
	actions.focus.focus(tree.reference(original));
	const calls: string[] = [];
	for (const type of ["focus", "blur", "focusin", "focusout"])
		events.addEventListener(tree.root, type, () => calls.push(type), true);
	actions.programmaticClick(button);
	expect(tree.activeElement).toBe(original);
	expect(calls).toEqual([]);
});

const renderingPolicies: Record<string, string>[] = [
	{ hidden: "" },
	{ inert: "" },
	{ style: "display:none" },
	{ style: "visibility:hidden" },
	{ style: "pointer-events:none" },
	{ style: "float:left" },
];
it.each(renderingPolicies)(
	"does not consult hit testing or rendering policy: %j",
	(attributes) => {
		const { actions, events, add } = fixture();
		const parent = add("div", attributes);
		const button = add("button", {}, parent);
		let calls = 0;
		events.addEventListener(button, "click", () => calls++);
		actions.programmaticClick(button);
		expect(calls).toBe(1);
	},
);

it.each([
	"button",
	"input",
	"select",
	"textarea",
	"fieldset",
	"option",
	"optgroup",
])("does not dispatch to a disabled %s target", (tag) => {
	const { tree, actions, events, add } = fixture();
	const target = add(tag, { disabled: "" });
	let calls = 0;
	events.addEventListener(target, "click", () => calls++);
	const revision = tree.revision;
	expect(actions.programmaticClick(target)).toEqual({
		reference: tree.reference(target),
		defaultPrevented: false,
		revision,
	});
	expect(calls).toBe(0);
});

it("dispatches from a non-control descendant of a disabled button without a submit intent", () => {
	const { actions, events, add } = fixture();
	const form = add("form");
	const button = add("button", { disabled: "" }, form);
	const child = add("span", {}, button);
	const calls: string[] = [];
	events.addEventListener(child, "click", () => calls.push("child"));
	events.addEventListener(button, "click", () => calls.push("button"));
	expect(actions.programmaticClick(child).defaultAction).toBeUndefined();
	expect(calls).toEqual(["child", "button"]);
});

it("honors fieldset disabling and the first-legend exception", () => {
	const { actions, events, add } = fixture();
	const fieldset = add("fieldset", { disabled: "" });
	const legend = add("legend", {}, fieldset);
	const enabled = add("button", {}, legend);
	const disabled = add("button", {}, fieldset);
	const calls: number[] = [];
	for (const target of [enabled, disabled])
		events.addEventListener(target, "click", () => calls.push(target));
	actions.programmaticClick(enabled);
	actions.programmaticClick(disabled);
	expect(calls).toEqual([enabled]);
});

it("ignores disabled on generic elements and allows hidden input click events", () => {
	const { actions, events, add } = fixture();
	const calls: number[] = [];
	for (const target of [
		add("div", { disabled: "" }),
		add("input", { type: "hidden" }),
	]) {
		events.addEventListener(target, "click", () => calls.push(target));
		actions.programmaticClick(target);
	}
	expect(calls).toHaveLength(2);
});

it("preactivates a hidden readonly checkbox and emits input then change", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox", hidden: "", readonly: "" });
	tree.setControl(target, { indeterminate: true });
	const calls: unknown[] = [];
	for (const type of ["click", "input", "change"])
		events.addEventListener(target, type, (event) =>
			calls.push([
				type,
				controlChecked(tree, target),
				tree.get(target).control.indeterminate,
				event.bubbles,
				event.composed,
				event.cancelable,
			]),
		);
	actions.programmaticClick(target);
	expect(calls).toEqual([
		["click", true, false, true, true, true],
		["input", true, false, true, true, false],
		["change", true, false, true, false, false],
	]);
});

it("restores checked and indeterminate state when canceled", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox", checked: "" });
	tree.setControl(target, { indeterminate: true });
	const calls: string[] = [];
	events.addEventListener(target, "click", (event) => {
		calls.push("click");
		event.preventDefault();
	});
	events.addEventListener(target, "input", () => calls.push("input"));
	expect(actions.programmaticClick(target).defaultPrevented).toBe(true);
	expect(controlChecked(tree, target)).toBe(true);
	expect(tree.get(target).control.indeterminate).toBe(true);
	expect(calls).toEqual(["click"]);
});

it("updates radio groups before click and restores them on cancellation", () => {
	const { tree, actions, events, add } = fixture();
	const previous = add("input", { type: "radio", name: "group", checked: "" });
	const next = add("input", { type: "radio", name: "group", readonly: "" });
	events.addEventListener(
		next,
		"click",
		(event) => {
			expect([
				controlChecked(tree, previous),
				controlChecked(tree, next),
			]).toEqual([false, true]);
			event.preventDefault();
		},
		{ once: true },
	);
	actions.programmaticClick(next);
	expect([controlChecked(tree, previous), controlChecked(tree, next)]).toEqual([
		true,
		false,
	]);
	const calls: string[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(next, type, () => calls.push(type));
	actions.programmaticClick(next);
	actions.programmaticClick(next);
	expect(calls).toEqual(["input", "change"]);
});

it("allows detached checkbox clicks without connected-only change events", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" }, null);
	const calls: string[] = [];
	for (const type of ["click", "input", "change"])
		events.addEventListener(target, type, () => calls.push(type));
	events.addEventListener(tree.root, "click", () => calls.push("document"));
	actions.programmaticClick(target);
	expect(controlChecked(tree, target)).toBe(true);
	expect(calls).toEqual(["click"]);
	expect(() => actions.click(tree.reference(target))).toThrow("no longer");
});

it("keeps detached radio groups separate from connected groups", () => {
	const { tree, actions, events, add } = fixture();
	const connected = add("input", { type: "radio", name: "same", checked: "" });
	const root = add("div", {}, null);
	const first = add(
		"input",
		{ type: "radio", name: "same", checked: "" },
		root,
	);
	const second = add("input", { type: "radio", name: "same" }, root);
	events.addEventListener(second, "click", (event) => event.preventDefault(), {
		once: true,
	});
	actions.programmaticClick(second);
	expect(
		[connected, first, second].map((target) => controlChecked(tree, target)),
	).toEqual([true, true, false]);
	actions.programmaticClick(second);
	expect(
		[connected, first, second].map((target) => controlChecked(tree, target)),
	).toEqual([true, false, true]);
});

it("keeps the computed event path while detachment suppresses subsequent change events", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const calls: string[] = [];
	events.addEventListener(target, "click", () => {
		calls.push("target");
		tree.remove(target);
	});
	events.addEventListener(tree.root, "click", () => calls.push("document"));
	events.addEventListener(target, "input", () => calls.push("input"));
	actions.programmaticClick(target);
	expect(calls).toEqual(["target", "document"]);
	expect(controlChecked(tree, target)).toBe(true);
});

it("forwards hidden inert labels to their controls without moving focus", () => {
	const { tree, actions, events, add } = fixture();
	const original = add("input");
	actions.focus.focus(tree.reference(original));
	const parent = add("div", { inert: "", hidden: "" });
	const label = add("label", { for: "check" }, parent);
	const control = add("input", { id: "check", type: "checkbox" }, parent);
	const calls: string[] = [];
	events.addEventListener(label, "click", () => calls.push("label"));
	events.addEventListener(control, "click", () => calls.push("control"));
	expect(actions.programmaticClick(label).label?.forwarded).toBe(true);
	expect(controlChecked(tree, control)).toBe(true);
	expect(tree.activeElement).toBe(original);
	expect(calls).toEqual(["label", "control"]);
});

it("does not forward canceled labels or clicks on their interactive descendants", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label");
	const control = add("input", { type: "checkbox" }, label);
	const button = add("button", {}, label);
	const child = add("span", {}, button);
	events.addEventListener(label, "click", (event) => event.preventDefault(), {
		once: true,
	});
	expect(actions.programmaticClick(label).defaultPrevented).toBe(true);
	actions.programmaticClick(child);
	expect(controlChecked(tree, control)).toBe(false);
});

it("preserves forwarded-control cancellation and detached label ownership", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label", {}, null);
	const control = add("input", { type: "checkbox" }, label);
	events.addEventListener(control, "click", (event) => event.preventDefault(), {
		once: true,
	});
	expect(actions.programmaticClick(label).label).toMatchObject({
		forwarded: true,
		controlDefaultPrevented: true,
	});
	expect(controlChecked(tree, control)).toBe(false);
	actions.programmaticClick(label);
	expect(controlChecked(tree, control)).toBe(true);
});

it("derives link intents from post-listener attributes, including detached anchors", () => {
	const { tree, actions, events, add } = fixture();
	const link = add("a", { href: "/before" }, null);
	events.addEventListener(link, "click", () =>
		tree.setAttribute(link, "href", "/after"),
	);
	expect(actions.programmaticClick(link).defaultAction).toEqual({
		kind: "navigate",
		url: "https://example.com/after",
		target: "_self",
	});
	events.addEventListener(link, "click", (event) => event.preventDefault());
	expect(actions.programmaticClick(link).defaultAction).toBeUndefined();
});

it("produces submit and picker intents and performs connected reset defaults", () => {
	const { tree, actions, add } = fixture();
	const form = add("form");
	const input = add("input", { value: "default" }, form);
	const submit = add("button", {}, form);
	const reset = add("button", { type: "reset" }, form);
	const file = add("input", { type: "file" });
	tree.setControl(input, { value: "edited" });
	expect(actions.programmaticClick(submit).defaultAction).toEqual({
		kind: "submit",
		formRef: tree.reference(form),
		submitterRef: tree.reference(submit),
	});
	expect(actions.programmaticClick(file).defaultAction).toEqual({
		kind: "picker",
		reference: tree.reference(file),
	});
	expect(actions.programmaticClick(reset).reset?.reset).toBe(true);
	expect(controlValue(tree, input)).toBe("default");
});

it("holds the per-element recursion guard through click, input and change", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const calls: string[] = [];
	for (const type of ["click", "input", "change"])
		events.addEventListener(target, type, () => {
			calls.push(type);
			actions.programmaticClick(target);
		});
	actions.programmaticClick(target);
	expect(calls).toEqual(["click", "input", "change"]);
	expect(controlChecked(tree, target)).toBe(true);
	actions.programmaticClick(target);
	expect(calls).toHaveLength(6);
	expect(controlChecked(tree, target)).toBe(false);
});

it("allows nested activation on other elements without a global lock", () => {
	const { actions, events, add } = fixture();
	const first = add("button");
	const second = add("button");
	const calls: number[] = [];
	events.addEventListener(first, "click", () => {
		calls.push(first);
		actions.programmaticClick(second);
	});
	events.addEventListener(second, "click", () => {
		calls.push(second);
		actions.programmaticClick(first);
	});
	actions.programmaticClick(first);
	expect(calls).toEqual([first, second]);
});

it("does not confuse agent activation with the programmatic recursion flag", () => {
	const { tree, actions, events, add } = fixture();
	const button = add("button");
	let calls = 0;
	events.addEventListener(button, "click", () => {
		calls++;
		actions.programmaticClick(button);
	});
	actions.click(tree.reference(button));
	expect(calls).toBe(2);
});

it("does not weaken agent hidden or inert actionability", () => {
	const { tree, actions, add } = fixture();
	for (const attributes of renderingPolicies.slice(0, 4)) {
		const button = add("button", attributes);
		expect(() => actions.click(tree.reference(button))).toThrow();
		expect(() => actions.programmaticClick(button)).not.toThrow();
	}
});

it("rejects non-element and closed targets even when the target is disabled", () => {
	const { tree, actions, add } = fixture();
	expect(() => actions.programmaticClick(tree.root)).toThrow("element target");
	expect(() => actions.programmaticClick(tree.createText("text"))).toThrow(
		"element target",
	);
	const button = add("button", { disabled: "" });
	actions.close();
	expect(() => actions.programmaticClick(button)).toThrow("closed");
});

it("restores preactivation when synchronous dispatch encounters a controlled listener", async () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const listener = controlledEventListener(async () => {});
	events.addEventListener(target, "click", listener);
	expect(() => actions.programmaticClick(target)).toThrow(
		"asynchronous dispatch",
	);
	expect(controlChecked(tree, target)).toBe(false);
	events.removeEventListener(target, "click", listener);
	await actions.programmaticClickAsync(target);
	expect(controlChecked(tree, target)).toBe(true);
});

it("awaits controlled listener prefixes before defaults and honors cancellation", async () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const waiting = gate();
	const calls: string[] = [];
	events.addEventListener(
		target,
		"click",
		controlledEventListener(async (_target, event) => {
			calls.push("prefix-start");
			await waiting.pending;
			event.preventDefault();
			calls.push("prefix-end");
		}),
	);
	events.addEventListener(target, "input", () => calls.push("input"));
	const pending = actions.programmaticClickAsync(target);
	expect(controlChecked(tree, target)).toBe(true);
	expect(calls).toEqual(["prefix-start"]);
	await actions.programmaticClickAsync(target);
	expect(calls).toEqual(["prefix-start"]);
	waiting.release();
	expect((await pending).defaultPrevented).toBe(true);
	expect(controlChecked(tree, target)).toBe(false);
	expect(calls).toEqual(["prefix-start", "prefix-end"]);
});

it("waits for controlled prefixes in forwarded control and reset events", async () => {
	const { tree, actions, events, add } = fixture();
	const form = add("form");
	const input = add("input", { value: "before" }, form);
	const label = add("label", {}, form);
	const reset = add("button", { type: "reset" }, label);
	const calls: string[] = [];
	events.addEventListener(
		reset,
		"click",
		controlledEventListener(async () => {
			await Promise.resolve();
			calls.push("control");
		}),
	);
	events.addEventListener(
		form,
		"reset",
		controlledEventListener(async () => {
			await Promise.resolve();
			tree.setAttribute(input, "value", "after");
			calls.push("reset");
		}),
	);
	tree.setControl(input, { value: "edited" });
	await actions.programmaticClickAsync(label);
	expect(calls).toEqual(["control", "reset"]);
	expect(controlValue(tree, input)).toBe("after");
});

it("rolls back activation when the event budget is exhausted", () => {
	const { tree, add } = fixture();
	const actions = new DocumentInteractions(tree, { maxDispatchDepth: 1 });
	const target = add("input", { type: "checkbox" });
	tree.setControl(target, { indeterminate: true });
	actions.events.addEventListener(target, "click", () =>
		actions.events.dispatchEvent(target, new BrowserEvent("nested")),
	);
	expect(() => actions.programmaticClick(target)).toThrow("budget");
	expect(controlChecked(tree, target)).toBe(false);
	expect(tree.get(target).control.indeterminate).toBe(true);
});

it("uses current held-key modifiers without claiming a physical mouse click", () => {
	const { actions, events, add } = fixture();
	const target = add("button");
	const observations: unknown[] = [];
	events.addEventListener(target, "click", (event) => {
		const mouse = event as BrowserMouseEvent;
		observations.push([
			mouse.shiftKey,
			mouse.ctrlKey,
			mouse.getModifierState("Shift"),
			mouse.buttons,
			mouse.detail,
		]);
	});
	actions.keyboard.down("Shift");
	actions.keyboard.down("Control");
	actions.programmaticClick(target);
	actions.keyboard.up("Shift");
	actions.keyboard.up("Control");
	actions.programmaticClick(target);
	expect(observations).toEqual([
		[true, true, true, 0, 0],
		[false, false, false, 0, 0],
	]);
});

it("resolves explicit detached labels only within the same root", () => {
	const { tree, actions, add } = fixture();
	const connected = add("input", { id: "shared", type: "checkbox" });
	const root = add("div", {}, null);
	const label = add("label", { for: "shared" }, root);
	const detached = add("input", { id: "shared", type: "checkbox" }, root);
	actions.programmaticClick(label);
	expect(controlChecked(tree, connected)).toBe(false);
	expect(controlChecked(tree, detached)).toBe(true);
	tree.append(tree.root, root);
	actions.programmaticClick(label);
	expect(controlChecked(tree, connected)).toBe(true);
});

it("releases a pending controlled dispatch when its owner closes", async () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const waiting = gate();
	events.addEventListener(
		target,
		"click",
		controlledEventListener(async () => {
			await waiting.pending;
		}),
	);
	const pending = actions.programmaticClickAsync(target);
	const rejected = expect(pending).rejects.toThrow("closed");
	actions.close();
	await rejected;
	expect(controlChecked(tree, target)).toBe(false);
	expect(events.metrics()).toMatchObject({
		activeDispatches: 0,
		listeners: 0,
		closed: true,
	});
	waiting.release();
});

it("does not restore a radio selection into a group it left during the click", () => {
	const { tree, actions, events, add } = fixture();
	const previous = add("input", { type: "radio", name: "before", checked: "" });
	const target = add("input", { type: "radio", name: "before" });
	events.addEventListener(target, "click", (event) => {
		tree.setAttribute(target, "name", "after");
		event.preventDefault();
	});
	actions.programmaticClick(target);
	expect([previous, target].map((id) => controlChecked(tree, id))).toEqual([
		false,
		false,
	]);
});

it("finishes checkbox activation when a listener disables the already-clicked control", () => {
	const { tree, actions, events, add } = fixture();
	const target = add("input", { type: "checkbox" });
	const calls: string[] = [];
	events.addEventListener(target, "click", () =>
		tree.setAttribute(target, "disabled", ""),
	);
	for (const type of ["input", "change"])
		events.addEventListener(target, type, () => calls.push(type));
	actions.programmaticClick(target);
	actions.programmaticClick(target);
	expect(controlChecked(tree, target)).toBe(true);
	expect(calls).toEqual(["input", "change"]);
});

it("releases its guard when a default action rejects an unsafe URL", () => {
	const { tree, actions, add } = fixture();
	const link = add("a", { href: "javascript:alert(1)" });
	expect(() => actions.programmaticClick(link)).toThrow();
	tree.setAttribute(link, "href", "/safe");
	expect(actions.programmaticClick(link).defaultAction).toEqual({
		kind: "navigate",
		url: "https://example.com/safe",
		target: "_self",
	});
});
