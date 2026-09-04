import { afterEach, expect, it, vi } from "vitest";
import { buttonType } from "./button-type.js";
import { controlValue, isControlDisabled } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { BrowserEvent } from "./events.js";
import { extractDocument } from "./extraction.js";
import { focusTabIndex } from "./focus.js";
import { isValidationCandidate } from "./form-validation.js";
import { prepareFormSubmission } from "./forms.js";
import { setInnerHtml } from "./html-content.js";
import { parseHtmlDocument } from "./html-parser.js";
import { isInertRoot } from "./inertness.js";
import { DocumentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { scanSnapshotEntries, snapshotDocument } from "./snapshot.js";

const trees: DocumentTree[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(source: string) {
	const tree = parseHtmlDocument(
		`<!doctype html>${source}`,
		"https://example.test/",
	);
	trees.push(tree);
	const queries = new DocumentQueries(tree);
	const find = (selector: string) => {
		const id = queries.querySelector(selector);
		if (id === null) throw new Error(`Missing ${selector}`);
		return id;
	};
	const ref = (selector: string) => tree.reference(find(selector));
	const actions = new DocumentInteractions(tree);
	return { tree, find, ref, queries, actions };
}

it("excludes the first select button and its descendants from focus", () => {
	const { tree, find } = fixture(
		"<select><button><a href=/next>Inner link</a></button></select>",
	);
	expect(focusTabIndex(tree, find("button"))).toBeNull();
	expect(focusTabIndex(tree, find("a"))).toBeNull();
	expect(focusTabIndex(tree, find("select"))).toBe(0);
});

it("blocks targeted activation of an implicitly inert select button", () => {
	const { actions, ref } = fixture(
		"<select><button>Inner button</button></select>",
	);
	expect(() => actions.click(ref("button"))).toThrow("inert");
});

it("omits implicitly inert content from the semantic snapshot", () => {
	const { tree, ref } = fixture(
		"<select><button>Inner button</button><option>Choice</option></select>",
	);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.ref === ref("button")),
	).toBe(false);
});

it("omits implicitly inert content from scoped extraction", () => {
	const { tree, ref } = fixture(
		"<select><button><a href=/next>Inner link</a></button></select>",
	);
	expect(extractDocument(tree, { root: ref("a") }).content).toBe("");
});

it.each([
	["", true],
	["text before", true],
	[" \n<!--before-->", true],
	["<span></span>", false],
	["<span hidden></span>", false],
	["<span style='display:none'></span>", false],
	["<option>First</option>", false],
	["<hr>", false],
	["<template></template>", false],
	["<button>First</button>", false],
])("uses the first element child after %j", (prefix, expected) => {
	const { tree, find } = fixture(
		`<select>${prefix}<button id=target>Target</button></select>`,
	);
	expect(isInertRoot(tree, tree.get(find("#target")))).toBe(expected);
	expect(focusTabIndex(tree, find("#target"))).toBe(expected ? null : 0);
});

it.each([
	"",
	"type=submit",
	"type=reset",
	"type=button",
	"type=invalid",
	"inert=false",
	"tabindex=4",
	"tabindex=-1",
])(
	"does not let %s opt a select button out of implicit inertness",
	(attributes) => {
		const { tree, find, actions, ref } = fixture(
			`<select><button ${attributes}>Label</button></select>`,
		);
		expect(isInertRoot(tree, tree.get(find("button")))).toBe(true);
		expect(focusTabIndex(tree, find("button"))).toBeNull();
		expect(actions.actionability(ref("button"), true).blocked).toBe(
			"hidden-inert-disabled",
		);
	},
);

it.each(["div", "optgroup", "option"])(
	"does not treat a button below a %s wrapper as a select child",
	(tag) => {
		const { tree, find } = fixture(
			`<select><${tag}><button>Nested</button></${tag}></select>`,
		);
		expect(isInertRoot(tree, tree.get(find("button")))).toBe(false);
		expect(focusTabIndex(tree, find("button"))).toBe(0);
	},
);

it("inherits inertness through descendants without manufacturing inert attributes", () => {
	const { tree, find, ref, actions } = fixture(
		"<select><button><span tabindex=0><a href=/next>Link</a></span><textarea>initial</textarea></button></select>",
	);
	for (const selector of ["button", "span", "a", "textarea"]) {
		expect(Object.hasOwn(tree.get(find(selector)).attributes, "inert")).toBe(
			false,
		);
		expect(focusTabIndex(tree, find(selector))).toBeNull();
		expect(actions.actionability(ref(selector)).blocked).toBe(
			"hidden-inert-disabled",
		);
	}
	expect(() => actions.fill(ref("textarea"), "edited")).toThrow("inert");
	expect(controlValue(tree, find("textarea"))).toBe("initial");
});

it("leaves the select and later options actionable", () => {
	const { tree, find, ref, actions } = fixture(
		"<select><button>Label</button><option value=a>A</option><option value=b>B</option></select>",
	);
	expect(actions.actionability(ref("select")).blocked).toBeUndefined();
	actions.select(ref("select"), ["b"]);
	expect(controlValue(tree, find("select"))).toBe("b");
	expect(isInertRoot(tree, tree.get(find("option")))).toBe(false);
});

it("does not dispatch focus or click events for blocked user targets", () => {
	const { find, ref, actions } = fixture(
		"<select><button>Label</button></select>",
	);
	const events: string[] = [];
	for (const type of ["click", "focus", "focusin"])
		actions.events.addEventListener(find("button"), type, () =>
			events.push(type),
		);
	expect(() => actions.focus.focus(ref("button"))).toThrow(
		"cannot receive focus",
	);
	expect(() => actions.click(ref("button"))).toThrow("inert");
	expect(events).toEqual([]);
});

it("applies the same gates to asynchronous focus and click actions", async () => {
	const { ref, actions } = fixture(
		"<select><button><a href=/next>Link</a></button></select>",
	);
	await expect(actions.focus.focusAsync(ref("a"))).rejects.toThrow(
		"cannot receive focus",
	);
	await expect(actions.clickAsync(ref("a"))).rejects.toThrow("inert");
});

it("skips the inert subtree in sequential focus navigation", () => {
	const { find, ref, actions } = fixture(
		"<button id=before>Before</button><select><button><a href=/next>Link</a></button><option>A</option></select><button id=after>After</button>",
	);
	actions.focus.focus(ref("#before"));
	actions.keyboard.press("Tab");
	expect(actions.focus.active()).toBe(find("select"));
	actions.keyboard.press("Tab");
	expect(actions.focus.active()).toBe(find("#after"));
	actions.keyboard.press("Shift+Tab");
	expect(actions.focus.active()).toBe(find("select"));
});

it("clears a previously focused button after moving it to the first select position", () => {
	const { tree, find, ref, actions } = fixture(
		"<button>Move</button><select></select>",
	);
	const button = find("button");
	actions.focus.focus(ref("button"));
	tree.append(find("select"), button);
	expect(actions.focus.active()).toBeNull();
	expect(tree.activeElement).toBeNull();
});

it("rechecks implicit inertness when blur handlers move the next focus target", () => {
	const { tree, find, ref, actions } = fixture(
		"<button id=before>Before</button><button id=target>Target</button><select></select>",
	);
	actions.focus.focus(ref("#before"));
	actions.events.addEventListener(find("#before"), "blur", () => {
		tree.append(find("select"), find("#target"));
	});
	expect(() => actions.focus.focus(ref("#target"))).toThrow(
		"Focus target changed",
	);
	expect(actions.focus.active()).toBeNull();
});

it("rechecks implicit inertness before click dispatch after focus handlers run", () => {
	const { tree, find, ref, actions } = fixture(
		"<button id=target>Target</button><select></select>",
	);
	const click = vi.fn();
	actions.events.addEventListener(find("#target"), "click", click);
	actions.events.addEventListener(find("#target"), "focus", () => {
		tree.append(find("select"), find("#target"));
	});
	expect(() => actions.click(ref("#target"))).toThrow("inert");
	expect(click).not.toHaveBeenCalled();
	expect(actions.focus.active()).toBeNull();
});

it("updates inertness after sibling insertion, removal and reordering", () => {
	const { tree, find } = fixture(
		"<select><button id=first>First</button><button id=second>Second</button></select>",
	);
	const select = find("select");
	const first = find("#first");
	const second = find("#second");
	const inert = (id: number) => isInertRoot(tree, tree.get(id));
	expect(inert(first)).toBe(true);
	expect(inert(second)).toBe(false);
	const prefix = tree.createElement("span");
	tree.insert(select, prefix, first);
	expect(inert(first)).toBe(false);
	tree.remove(prefix);
	expect(inert(first)).toBe(true);
	tree.insert(select, second, first);
	expect(inert(first)).toBe(false);
	expect(inert(second)).toBe(true);
	tree.remove(second);
	expect(inert(second)).toBe(false);
	expect(inert(first)).toBe(true);
});

it("does not let text or comment insertions displace the first element", () => {
	const { tree, find } = fixture("<select><button>Label</button></select>");
	const button = find("button");
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
	tree.insert(find("select"), tree.createText("prefix"), button);
	tree.insert(find("select"), tree.createComment("prefix"), button);
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
});

it("keeps implicit and explicit inertness independent through moves", () => {
	const { tree, find } = fixture(
		"<select><button inert>Label</button></select><div></div>",
	);
	const button = find("button");
	tree.append(find("div"), button);
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
	tree.removeAttribute(button, "inert");
	expect(isInertRoot(tree, tree.get(button))).toBe(false);
	tree.append(find("select"), button);
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
});

it("recomputes first-child inertness after replacing select contents", () => {
	const { tree, find } = fixture("<select><button>Old</button></select>");
	const select = find("select");
	expect(isInertRoot(tree, tree.get(find("button")))).toBe(true);
	setInnerHtml(tree, select, "<span>First</span><button>Next</button>");
	expect(isInertRoot(tree, tree.get(find("button")))).toBe(false);
	setInnerHtml(tree, select, "<!--first--><button>Current</button>");
	expect(isInertRoot(tree, tree.get(find("button")))).toBe(true);
});

it("derives inertness from clone parentage instead of copying a cached flag", () => {
	const { tree, find } = fixture("<select><button>Label</button></select>");
	const button = find("button");
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
	const clone = tree.clone(button, true);
	expect(isInertRoot(tree, tree.get(clone))).toBe(false);
	tree.insert(find("select"), clone, button);
	expect(isInertRoot(tree, tree.get(clone))).toBe(true);
	expect(isInertRoot(tree, tree.get(button))).toBe(false);
	const selectClone = tree.clone(find("select"), true);
	const first = tree
		.get(selectClone)
		.children.find((id) => tree.get(id).kind === "element");
	if (first === undefined) throw new Error("Missing clone button");
	expect(isInertRoot(tree, tree.get(first))).toBe(true);
});

it("does not turn inert controls into disabled or invalid form submitters", () => {
	const { tree, find, ref } = fixture(
		"<form><select><button type=submit name=send value=yes>Send</button></select></form>",
	);
	const button = find("button");
	expect(isControlDisabled(tree, button)).toBe(false);
	expect(buttonType(tree, tree.get(button))).toBe("submit");
	expect(isValidationCandidate(tree, button)).toBe(true);
	expect(
		prepareFormSubmission(tree, ref("form"), { submitter: ref("button") })
			.request.url,
	).toBe("https://example.test/?send=yes");
});

it("blocks user label forwarding to an implicitly inert control", () => {
	const { actions, find, ref } = fixture(
		"<label for=target>Outside label</label><select><button id=target>Label</button></select>",
	);
	const click = vi.fn();
	actions.events.addEventListener(find("button"), "click", click);
	expect(actions.click(ref("label")).label?.forwarded).toBe(false);
	expect(click).not.toHaveBeenCalled();
});

it("does not suppress explicit synthetic event dispatch into an inert subtree", () => {
	const { actions, find } = fixture(
		"<select><button><a href=/next>Link</a></button></select>",
	);
	const targets: number[] = [];
	for (const selector of ["a", "button", "select"])
		actions.events.addEventListener(find(selector), "click", (event) => {
			if (event.currentTarget !== null) targets.push(event.currentTarget);
		});
	expect(
		actions.events.dispatchEvent(
			find("a"),
			new BrowserEvent("click", { bubbles: true }),
		),
	).toBe(true);
	expect(targets).toEqual([find("a"), find("button"), find("select")]);
});

it("excludes descendants from expanded locator snapshots and scoped snapshots", () => {
	const { tree, ref } = fixture(
		"<select><button><a href=/next>Link</a></button><option>Choice</option></select>",
	);
	const refs: string[] = [];
	scanSnapshotEntries(tree, (entry) => refs.push(entry.ref));
	expect(refs).not.toContain(ref("button"));
	expect(refs).not.toContain(ref("a"));
	expect(refs).toContain(ref("select"));
	expect(snapshotDocument(tree, { root: ref("a") }).entries).toEqual([]);
});

it("updates semantic output when a preceding element removes implicit inertness", () => {
	const { tree, find, ref } = fixture(
		"<select><button>Label</button></select>",
	);
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.ref === ref("button")),
	).toBe(false);
	tree.insert(find("select"), tree.createElement("span"), find("button"));
	expect(
		snapshotDocument(tree).entries.some((entry) => entry.ref === ref("button")),
	).toBe(true);
});

it("shares the first-element scan across buttons without retaining a document cache", () => {
	const { tree, find } = fixture("<select></select>");
	const select = find("select");
	for (let index = 0; index < 200; index++)
		tree.append(select, tree.createComment("prefix"));
	const buttons: number[] = [];
	for (let index = 0; index < 200; index++) {
		const button = tree.createElement("button");
		tree.append(select, button);
		buttons.push(button);
	}
	const get = vi.spyOn(tree, "get");
	for (const [index, button] of buttons.entries())
		expect(isInertRoot(tree, tree.get(button))).toBe(index === 0);
	expect(get.mock.calls.length).toBeLessThanOrEqual(601);
	get.mockClear();
	for (const button of buttons) isInertRoot(tree, tree.get(button));
	expect(get.mock.calls.length).toBe(400);
});

it("does not let a cached parent view bypass closed-document focus checks", () => {
	const { tree, find, ref, actions } = fixture(
		"<select><button>Label</button></select>",
	);
	const button = find("button");
	const reference = ref("button");
	expect(isInertRoot(tree, tree.get(button))).toBe(true);
	tree.close();
	expect(() => focusTabIndex(tree, button)).toThrow();
	expect(() => actions.actionability(reference)).toThrow();
});
