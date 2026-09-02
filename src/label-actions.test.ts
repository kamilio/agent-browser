import { expect, it } from "vitest";
import { controlChecked, controlValue, labelControl } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { snapshotDocument } from "./snapshot.js";

function fixture() {
	const tree = new DocumentTree("https://example.com");
	const actions = new DocumentInteractions(tree);
	const add = (
		tag: string,
		attributes: Record<string, string> = {},
		parent = tree.root,
	) => {
		const id = tree.createElement(tag, attributes);
		tree.append(parent, id);
		return id;
	};
	return { tree, actions, events: actions.events, add };
}

it("forwards a visible label click to its hidden checkbox without allowing direct hidden clicks", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label", { for: "control" });
	const control = add("input", { id: "control", type: "checkbox", hidden: "" });
	const calls: unknown[] = [];
	for (const type of ["click", "input", "change"])
		events.addEventListener(tree.root, type, (event) =>
			calls.push([type, event.target]),
		);
	expect(() => actions.click(tree.reference(control))).toThrow("hidden");
	const result = actions.click(tree.reference(label));
	expect(result.label).toEqual({
		reference: tree.reference(label),
		controlRef: tree.reference(control),
		forwarded: true,
		controlDefaultPrevented: false,
	});
	expect(controlChecked(tree, control)).toBe(true);
	expect(calls).toEqual([
		["click", label],
		["click", control],
		["input", control],
		["change", control],
	]);
});

it("uses the same first-control association for implicit label activation and snapshot names", () => {
	const { tree, actions, add } = fixture();
	const label = add("label");
	tree.append(label, tree.createText("Choice"));
	const first = add("input", { type: "checkbox" }, label);
	const second = add("input", { type: "checkbox" }, label);
	expect(labelControl(tree, label)).toBe(first);
	actions.click(tree.reference(label));
	expect(controlChecked(tree, first)).toBe(true);
	expect(controlChecked(tree, second)).toBe(false);
	const snapshot = snapshotDocument(tree);
	expect(
		snapshot.entries.find((entry) => entry.ref === tree.reference(first))?.name,
	).toBe("Choice");
	expect(
		snapshot.entries.find((entry) => entry.ref === tree.reference(second))
			?.name,
	).toBe("");
});

it("explicit for overrides nested controls, and the first duplicate ID can prevent association", () => {
	const { tree, actions, add } = fixture();
	const label = add("label", { for: "external" });
	tree.append(label, tree.createText("Name"));
	const internal = add("input", { type: "checkbox" }, label);
	const external = add("input", { id: "external", type: "checkbox" });
	expect(labelControl(tree, label)).toBe(external);
	actions.click(tree.reference(label));
	expect(controlChecked(tree, internal)).toBe(false);
	expect(controlChecked(tree, external)).toBe(true);
	const blocker = add("div", { id: "external" });
	tree.insert(tree.root, blocker, external);
	expect(labelControl(tree, label)).toBeUndefined();
	expect(
		snapshotDocument(tree).entries.find(
			(entry) => entry.ref === tree.reference(external),
		)?.name,
	).toBe("");
	tree.setAttribute(label, "for", "");
	expect(labelControl(tree, label)).toBeUndefined();
});

it("does not forward to disabled, inert or hidden-type controls", () => {
	const { tree, actions, add } = fixture();
	const label = add("label", { for: "control" });
	const container = add("div", { inert: "" });
	const control = add("input", { id: "control", type: "checkbox" }, container);
	expect(actions.click(tree.reference(label)).label?.forwarded).toBe(false);
	tree.removeAttribute(container, "inert");
	tree.setAttribute(control, "disabled", "");
	expect(actions.click(tree.reference(label)).label?.forwarded).toBe(false);
	tree.removeAttribute(control, "disabled");
	tree.setAttribute(control, "type", "hidden");
	expect(labelControl(tree, label)).toBeUndefined();
	expect(actions.click(tree.reference(label)).label?.forwarded).toBe(false);
});

it.each([
	["a", { href: "/link" }],
	["button", { type: "button" }],
	["select", {}],
	["textarea", {}],
	["details", {}],
	["video", { controls: "" }],
	["img", { usemap: "#map" }],
] as [string, Record<string, string>][])(
	"does not activate a labeled checkbox when clicking interactive %s descendants",
	(tag, attributes) => {
		const { tree, actions, add } = fixture();
		const label = add("label", { for: "control" });
		const interactive = add(tag, attributes, label);
		const descendant = add("span", {}, interactive);
		const control = add("input", { id: "control", type: "checkbox" });
		actions.click(tree.reference(descendant));
		expect(controlChecked(tree, control)).toBe(false);
	},
);

it("resolves changed label associations after listeners and cancels at either activation stage", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label", { for: "first" });
	const first = add("input", { id: "first", type: "checkbox" });
	const second = add("input", { id: "second", type: "checkbox" });
	events.addEventListener(
		label,
		"click",
		() => tree.setAttribute(label, "for", "second"),
		{ once: true },
	);
	events.addEventListener(second, "click", (event) => event.preventDefault(), {
		once: true,
	});
	const result = actions.click(tree.reference(label));
	expect(result.defaultPrevented).toBe(false);
	expect(result.label?.controlDefaultPrevented).toBe(true);
	expect(controlChecked(tree, first)).toBe(false);
	expect(controlChecked(tree, second)).toBe(false);
	events.addEventListener(label, "click", (event) => event.preventDefault(), {
		once: true,
	});
	expect(actions.click(tree.reference(label)).defaultPrevented).toBe(true);
	expect(controlChecked(tree, second)).toBe(false);
});

it("does not double-toggle wrapped controls or recurse through forwarded label clicks", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label");
	const control = add("input", { type: "checkbox" }, label);
	let calls = 0;
	events.addEventListener(label, "click", () => {
		calls++;
		actions.click(tree.reference(label));
	});
	actions.click(tree.reference(label));
	expect(calls).toBe(2);
	expect(controlChecked(tree, control)).toBe(true);
	expect(events.drainErrors()).toEqual([]);
});

it("can forward to a reset button and propagate its completed reset result", () => {
	const { tree, actions, add } = fixture();
	const form = add("form");
	const control = add("input", { value: "default" }, form);
	tree.setControl(control, { value: "edited" });
	const reset = add("button", { id: "reset", type: "reset" }, form);
	const label = add("label", { for: "reset" });
	const result = actions.click(tree.reference(label));
	expect(result.label?.controlRef).toBe(tree.reference(reset));
	expect(result.reset?.reset).toBe(true);
	expect(result.defaultAction).toBeUndefined();
	expect(controlValue(tree, control)).toBe("default");
});

it("rejects detached label queries and does not forward after a click listener removes the label", () => {
	const { tree, actions, events, add } = fixture();
	const label = add("label", { for: "control" });
	const control = add("input", { id: "control", type: "checkbox" });
	events.addEventListener(label, "click", () => tree.remove(label));
	expect(actions.click(tree.reference(label)).defaultAction).toBeUndefined();
	expect(controlChecked(tree, control)).toBe(false);
	expect(() => labelControl(tree, label)).toThrow("Detached");
});
