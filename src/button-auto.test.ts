import { afterEach, expect, it } from "vitest";
import { buttonType, isSubmitButton } from "./button-type.js";
import { controlValue, formOwner, isControlDisabled } from "./controls.js";
import type { DocumentTree } from "./document.js";
import { isValidationCandidate } from "./form-validation.js";
import { prepareFormSubmission, resolveFormSubmitter } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentInteractions } from "./interactions.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";

const trees: DocumentTree[] = [];
afterEach(() => {
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
	return { tree, find, ref, actions };
}

function hostDom(tree: DocumentTree) {
	return new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const host = Object.create(null);
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(host, name, descriptor);
			Object.assign(host, definition.methods);
			return host;
		},
	});
}

it("reflects an Auto select-child button as button rather than submit", () => {
	const { tree, find } = fixture("<select><button>Label</button></select>");
	const button = hostDom(tree).node(find("button")) as { type: string };
	expect(button.type).toBe("button");
});

it("does not submit an Auto command button on activation", () => {
	const { actions, ref } = fixture(
		"<form><button command=unknown>Command</button></form>",
	);
	expect(actions.click(ref("button")).defaultAction).toBeUndefined();
});

it("skips Auto select-child buttons when finding the implicit submitter", () => {
	const { actions, ref } = fixture(
		"<form><input><select><button id=label>Label</button></select><button id=send>Send</button></form>",
	);
	actions.focus.focus(ref("input"));
	expect(actions.keyboard.press("Enter").defaultAction).toMatchObject({
		kind: "submit",
		submitterRef: ref("#send"),
	});
});

it.each([
	["<button>Send</button>", "submit"],
	["<button type=''>Send</button>", "submit"],
	["<button type=unknown>Send</button>", "submit"],
	["<button type=' reset '>Send</button>", "submit"],
	["<button type=SuBmIt>Send</button>", "submit"],
	["<button type=ReSeT>Reset</button>", "reset"],
	["<button type=BuTtOn>Button</button>", "button"],
	["<button command>Command</button>", "button"],
	["<button commandfor>Command</button>", "button"],
	["<button command=unknown>Command</button>", "button"],
	["<button commandfor=missing>Command</button>", "button"],
	["<button type=invalid command=--custom>Command</button>", "button"],
	["<button type=' submit ' commandfor=missing>Command</button>", "button"],
	["<button type=SuBmIt command commandfor>Send</button>", "submit"],
	["<button type=ReSeT command commandfor>Reset</button>", "reset"],
	["<select><button>Label</button></select>", "button"],
	["<select><button type=invalid>Label</button></select>", "button"],
	["<select><span>First</span><button>Label</button></select>", "button"],
	["<select><button type=submit>Send</button></select>", "submit"],
	["<select><button type=reset>Reset</button></select>", "reset"],
	["<select><div><button>Send</button></div></select>", "submit"],
	["<select><optgroup><button>Send</button></optgroup></select>", "submit"],
])("agrees across form APIs and host properties for %s", (source, expected) => {
	const { tree, find, ref, actions } = fixture(`<form>${source}</form>`);
	const id = find("button");
	const node = tree.get(id);
	const button = hostDom(tree).node(id) as {
		type: string;
		willValidate: boolean;
	};
	expect(buttonType(tree, node)).toBe(expected);
	expect(button.type).toBe(expected);
	expect(isSubmitButton(tree, node)).toBe(expected === "submit");
	expect(isValidationCandidate(tree, id)).toBe(expected === "submit");
	expect(button.willValidate).toBe(expected === "submit");
	if (expected === "submit") {
		expect(
			resolveFormSubmitter(tree, ref("form"), ref("button")).submitter?.id,
		).toBe(id);
		expect(
			actions.forms.requestSubmit(ref("form"), { submitter: ref("button") })
				.submission?.submitterRef,
		).toBe(ref("button"));
	} else {
		expect(() =>
			resolveFormSubmitter(tree, ref("form"), ref("button")),
		).toThrow("Invalid form submitter");
		expect(() =>
			actions.forms.requestSubmit(ref("form"), {
				submitter: ref("button"),
			}),
		).toThrow("Invalid form submitter");
	}
});

it("recomputes Auto type after command attribute changes without rewriting it", () => {
	const { tree, find } = fixture(
		"<form><button type=invalid>Send</button></form>",
	);
	const id = find("button");
	const button = hostDom(tree).node(id) as {
		type: string;
		willValidate: boolean;
	};
	expect(button.type).toBe("submit");
	for (const name of ["command", "commandfor"]) {
		tree.setAttribute(id, name, "");
		expect(button.type).toBe("button");
		expect(button.willValidate).toBe(false);
		tree.removeAttribute(id, name);
		expect(button.type).toBe("submit");
		expect(button.willValidate).toBe(true);
	}
	expect(tree.get(id).attributes.type).toBe("invalid");
});

it("reflects current parentage through moves, removal and cloning", () => {
	const { tree, find } = fixture(
		"<form><button>Send</button><select><div></div></select></form>",
	);
	const id = find("button");
	const button = hostDom(tree).node(id) as { type: string };
	tree.append(find("select"), id);
	expect(button.type).toBe("button");
	tree.append(find("div"), id);
	expect(button.type).toBe("submit");
	tree.append(find("select"), id);
	const clone = tree.clone(id, true);
	expect(buttonType(tree, tree.get(clone))).toBe("submit");
	tree.append(find("select"), clone);
	expect(buttonType(tree, tree.get(clone))).toBe("button");
	tree.remove(id);
	expect(button.type).toBe("submit");
	tree.append(find("form"), id);
	expect(button.type).toBe("submit");
});

it("preserves the raw host type setter and returns its computed state", () => {
	const { tree, find } = fixture("<select><button></button></select>");
	const id = find("button");
	const button = hostDom(tree).node(id) as { type: string };
	for (const [value, expected] of [
		["SuBmIt", "submit"],
		["ReSeT", "reset"],
		["BuTtOn", "button"],
		[" submit ", "button"],
		["invalid", "button"],
		["", "button"],
	]) {
		button.type = value;
		expect(tree.get(id).attributes.type).toBe(value);
		expect(button.type).toBe(expected);
	}
});

it("keeps explicit form ownership independent from direct select parentage", () => {
	const { tree, find, ref } = fixture(
		"<form id=owner></form><select><button form=owner name=choice value=yes>Send</button></select>",
	);
	const id = find("button");
	expect(formOwner(tree, id)).toBe(find("form"));
	expect(() =>
		prepareFormSubmission(tree, ref("form"), { submitter: ref("button") }),
	).toThrow("Invalid form submitter");
	tree.setAttribute(id, "type", "submit");
	expect(
		prepareFormSubmission(tree, ref("form"), { submitter: ref("button") })
			.request.url,
	).toBe("https://example.test/?choice=yes");
});

it("omits non-submitting buttons from successful form entries", () => {
	const { tree, ref } = fixture(
		"<form><input name=query value=ok><select><button name=label value=wrong>Label</button></select><button command name=command value=wrong>Command</button><button type=submit command name=send value=yes>Send</button></form>",
	);
	expect(
		prepareFormSubmission(tree, ref("form"), { submitter: ref("[name=send]") })
			.request.url,
	).toBe("https://example.test/?query=ok&send=yes");
	expect(prepareFormSubmission(tree, ref("form")).request.url).toBe(
		"https://example.test/?query=ok",
	);
});

it.each(["submit", "image", "reset", "button", "text"])(
	"keeps input %s classification independent of command attributes",
	(type) => {
		const { tree, find } = fixture(
			`<form><input type=${type} command commandfor></form>`,
		);
		expect(isSubmitButton(tree, tree.get(find("input")))).toBe(
			type === "submit" || type === "image",
		);
	},
);

it("does not change submit-button classification for disabled or inert buttons", () => {
	const { tree, find, ref } = fixture(
		"<form><button type=submit disabled inert>Send</button></form>",
	);
	const id = find("button");
	expect(isSubmitButton(tree, tree.get(id))).toBe(true);
	expect(isControlDisabled(tree, id)).toBe(true);
	expect(isValidationCandidate(tree, id)).toBe(false);
	expect(() => resolveFormSubmitter(tree, ref("form"), ref("button"))).toThrow(
		"Invalid form submitter",
	);
	tree.removeAttribute(id, "disabled");
	expect(isControlDisabled(tree, id)).toBe(false);
	expect(isValidationCandidate(tree, id)).toBe(true);
	expect(
		resolveFormSubmitter(tree, ref("form"), ref("button")).submitter?.id,
	).toBe(id);
});

it.each(["command", "commandfor", "command=unknown", "type=invalid command"])(
	"skips an Auto %s button during implicit submission",
	(attributes) => {
		const { actions, ref } = fixture(
			`<form><input><button ${attributes}>Command</button><button id=send>Send</button></form>`,
		);
		actions.focus.focus(ref("input"));
		expect(actions.keyboard.press("Enter").defaultAction).toMatchObject({
			kind: "submit",
			submitterRef: ref("#send"),
		});
	},
);

it("implicitly submits a single input without a submitter when only Auto command buttons remain", () => {
	const { actions, ref } = fixture(
		"<form><input><button command>Command</button></form>",
	);
	actions.focus.focus(ref("input"));
	expect(actions.keyboard.press("Enter").defaultAction).toEqual({
		kind: "submit",
		formRef: ref("form"),
	});
});

it("still blocks implicit submission with multiple blocking fields and no submitter", () => {
	const { actions, ref } = fixture(
		"<form><input id=first><input><button command>Command</button></form>",
	);
	actions.focus.focus(ref("#first"));
	expect(actions.keyboard.press("Enter").defaultAction).toBeUndefined();
});

it("does not skip a disabled real default button for a later enabled button", () => {
	const { actions, ref } = fixture(
		"<form><input><button command>Command</button><button disabled>Send</button><button>Later</button></form>",
	);
	actions.focus.focus(ref("input"));
	expect(actions.keyboard.press("Enter").defaultAction).toBeUndefined();
});

it("uses post-click command attributes for the default submit intent", () => {
	const { tree, find, ref, actions } = fixture(
		"<form><button>Send</button></form>",
	);
	const id = find("button");
	let suppress = true;
	actions.events.addEventListener(id, "click", () => {
		if (suppress) tree.setAttribute(id, "commandfor", "missing");
		else tree.removeAttribute(id, "commandfor");
	});
	expect(actions.click(ref("button")).defaultAction).toBeUndefined();
	suppress = false;
	expect(actions.click(ref("button")).defaultAction).toMatchObject({
		kind: "submit",
		submitterRef: ref("button"),
	});
});

it("uses post-click parentage instead of a cached Auto submit state", () => {
	const { tree, find, ref, actions } = fixture(
		"<form><button>Send</button><select></select></form>",
	);
	const id = find("button");
	actions.events.addEventListener(id, "click", () =>
		tree.append(find("select"), id),
	);
	expect(actions.click(ref("button")).defaultAction).toBeUndefined();
});

it("retains explicit reset activation with command attributes", () => {
	const { tree, find, ref, actions } = fixture(
		"<form><input value=initial><button type=reset command>Reset</button></form>",
	);
	tree.setControl(find("input"), { value: "edited" });
	expect(actions.click(ref("button")).reset?.reset).toBe(true);
	expect(controlValue(tree, find("input"))).toBe("initial");
});

it("retains explicit submit activation with command attributes", () => {
	const { ref, actions } = fixture(
		"<form><button type=submit command commandfor>Send</button></form>",
	);
	expect(actions.click(ref("button")).defaultAction).toMatchObject({
		kind: "submit",
		submitterRef: ref("button"),
	});
});

it("does not return cached button types after the owning tree closes", () => {
	const { tree, find } = fixture("<button>Send</button>");
	const button = hostDom(tree).node(find("button")) as { type: string };
	expect(button.type).toBe("submit");
	tree.close();
	expect(() => button.type).toThrow();
});
