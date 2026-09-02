import { expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { BrowserFocusEvent } from "./focus.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";

function fixture() {
	const tree = new DocumentTree("https://example.com/");
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
	return { tree, actions, focus: actions.focus, events: actions.events, add };
}

it("dispatches related focus events and commits changed text before blur", () => {
	const { tree, actions, focus, events, add } = fixture();
	const first = add("input");
	const second = add("input");
	const calls: unknown[] = [];
	for (const id of [first, second])
		for (const type of ["focus", "focusin", "change", "blur", "focusout"])
			events.addEventListener(id, type, (event) =>
				calls.push([
					id,
					type,
					event instanceof BrowserFocusEvent ? event.relatedTarget : null,
					event.bubbles,
					tree.activeElement,
				]),
			);
	expect(focus.active()).toBeNull();
	actions.fill(tree.reference(first), "changed");
	focus.focus(tree.reference(second));
	expect(calls).toEqual([
		[first, "focus", null, false, first],
		[first, "focusin", null, true, first],
		[first, "change", null, true, null],
		[first, "blur", second, false, null],
		[first, "focusout", second, true, null],
		[second, "focus", first, false, second],
		[second, "focusin", first, true, second],
	]);
	expect(events.drainErrors()).toEqual([]);
});

it("does not commit untouched, canceled or restored text on blur", () => {
	const { tree, actions, focus, events, add } = fixture();
	const field = add("input", { value: "start" });
	let changes = 0;
	events.addEventListener(field, "change", () => changes++);
	focus.focus(tree.reference(field));
	focus.focus(null);
	actions.fill(tree.reference(field), "edit");
	actions.fill(tree.reference(field), "start");
	focus.focus(null);
	events.addEventListener(field, "beforeinput", (event) =>
		event.preventDefault(),
	);
	actions.fill(tree.reference(field), "canceled");
	focus.focus(null);
	expect(changes).toBe(0);
});

it("orders tab stops, skips exclusions, and cycles in either direction", () => {
	const { tree, focus, add } = fixture();
	const ordinary = add("input");
	const negative = add("button", { tabindex: "-1" });
	const late = add("button", { tabindex: "2" });
	const early = add("button", { tabindex: "1" });
	add("input", { disabled: "" });
	add("input", { type: "hidden", tabindex: "1" });
	add("input", {}, add("div", { hidden: "" }));
	add("input", {}, add("div", { inert: "" }));
	const readonly = add("input", { readonly: "" });
	expect([
		focus.move(),
		focus.move(),
		focus.move(),
		focus.move(),
		focus.move(),
	]).toEqual([early, late, ordinary, readonly, early]);
	expect(focus.move(true)).toBe(readonly);
	expect(focus.focus(tree.reference(negative))).toBe(negative);
	expect(focus.move()).toBe(early);
});

it("uses one eligible radio stop per group, preferring the checked radio", () => {
	const { focus, add } = fixture();
	add("input", { type: "radio", name: "group" });
	const checked = add("input", { type: "radio", name: "group", checked: "" });
	const next = add("input", { type: "radio", name: "other" });
	add("input", { type: "radio", name: "other" });
	expect([focus.move(), focus.move(), focus.move()]).toEqual([
		checked,
		next,
		checked,
	]);
});

it("honors reentrant focus redirects without emitting stale focusin", () => {
	const { tree, focus, events, add } = fixture();
	const first = add("input");
	const second = add("input");
	const observed: (number | null)[] = [];
	events.addEventListener(first, "focus", () =>
		focus.focus(tree.reference(second)),
	);
	events.addEventListener(tree.root, "focusin", (event) =>
		observed.push(event.target),
	);
	expect(focus.focus(tree.reference(first))).toBe(second);
	expect(observed).toEqual([second]);
	expect(events.drainErrors()).toEqual([]);
});

it("honors a change-handler focus redirect over the pending target", () => {
	const { tree, actions, focus, events, add } = fixture();
	const first = add("input");
	const second = add("input");
	const third = add("input");
	actions.fill(tree.reference(first), "edit");
	events.addEventListener(first, "change", () =>
		focus.focus(tree.reference(third)),
	);
	expect(focus.focus(tree.reference(second))).toBe(third);
});

it("invalidates focus selectors and redacted snapshots after focus and attribute changes", () => {
	const { tree, actions, focus, add } = fixture();
	const parent = add("form");
	const field = add(
		"input",
		{ type: "password", "aria-label": "Secret" },
		parent,
	);
	const queries = new DocumentQueries(tree);
	expect(queries.querySelector(":focus")).toBeNull();
	actions.fill(tree.reference(field), "private-secret");
	expect(queries.querySelector(":focus")).toBe(field);
	expect(queries.querySelectorAll(":focus-within")).toEqual([parent, field]);
	const snapshot = snapshotDocument(tree);
	expect(
		snapshot.entries.find((entry) => entry.ref === tree.reference(field))
			?.focused,
	).toBe(true);
	expect(JSON.stringify(snapshot)).not.toContain("private-secret");
	tree.setAttribute(field, "disabled", "");
	expect(queries.querySelector(":focus")).toBeNull();
	expect(focus.active()).toBeNull();
	expect(tree.activeElement).toBeNull();
});

it("clears detached focus and rejects closed document actions", () => {
	const { tree, focus, add } = fixture();
	const parent = add("div");
	const field = add("input", {}, parent);
	focus.focus(tree.reference(field));
	tree.remove(parent);
	expect(focus.active()).toBeNull();
	tree.close();
	expect(() => focus.move()).toThrow("closed");
});

it("rejects a target hidden by a blur handler", () => {
	const { tree, focus, events, add } = fixture();
	const first = add("input");
	const second = add("input");
	focus.focus(tree.reference(first));
	events.addEventListener(first, "blur", () =>
		tree.setAttribute(second, "hidden", ""),
	);
	expect(() => focus.focus(tree.reference(second))).toThrow(
		"changed during events",
	);
	expect(focus.active()).toBeNull();
});
