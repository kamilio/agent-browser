import { afterEach, expect, it } from "vitest";
import { parseLengthLimit } from "./control-length.js";
import { controlValidity } from "./control-validity.js";
import { controlValue, fillTextControl } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentInteractions } from "./interactions.js";
import { invalidControl, validationMessage } from "./form-validation.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(attributes: Record<string, string> = {}, tag = "input") {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement(tag, attributes);
	tree.append(tree.root, id);
	return {
		tree,
		id,
		fill: (value: string) => fillTextControl(tree, tree.reference(id), value),
		validity: () => controlValidity(tree, id),
	};
}

it("ignores text lengths on programmatic values", () => {
	const { tree, id, validity } = fixture({ maxlength: "2", minlength: "5" });
	tree.setControl(id, { value: "abc" });
	expect(validity()).toMatchObject({
		tooLong: false,
		tooShort: false,
		valid: true,
	});
});

it.each(["input", "textarea"])("validates user-edited %s lengths", (tag) => {
	const { fill, validity } = fixture({ maxlength: "2", minlength: "5" }, tag);
	fill("abc");
	expect(validity()).toMatchObject({
		tooLong: true,
		tooShort: true,
		valid: false,
	});
});

it("honors HTML integer prefixes during keyboard insertion", () => {
	const { tree, id } = fixture({ maxlength: " +2tail" });
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	actions.keyboard.type("abc");
	expect(controlValue(tree, id)).toBe("ab");
});

it.each<[string | undefined, number | undefined]>([
	[undefined, undefined],
	["", undefined],
	[" ", undefined],
	["+", undefined],
	["-1", undefined],
	["-01tail", undefined],
	["\u00a02", undefined],
	["１２", undefined],
	[".3", undefined],
	["0", 0],
	["-0", 0],
	["-000tail", 0],
	["+2tail", 2],
	["\t\n\f\r 3", 3],
	["2.5", 2],
	["1e2", 1],
	["0x20", 0],
	["004", 4],
])("parses length bound %j as %s", (raw, expected) => {
	expect(parseLengthLimit(raw)).toBe(expected);
});

it("bounds giant positive limits without allocating arbitrary precision numbers", () => {
	const large = "9".repeat(100_000);
	expect(parseLengthLimit(large)).toBe(Number.MAX_SAFE_INTEGER);
	expect(parseLengthLimit(`-${large}`)).toBeUndefined();
	expect(parseLengthLimit(`-${"0".repeat(100_000)}`)).toBe(0);
	const { fill, validity } = fixture({ minlength: large, maxlength: large });
	fill("abc");
	expect(validity()).toMatchObject({ tooLong: false, tooShort: true });
});

it.each(["text", "search", "tel", "url", "email", "password"])(
	"applies length constraints to user-edited %s",
	(type) => {
		const { fill, validity } = fixture({
			type,
			minlength: "9",
			maxlength: "2",
		});
		fill("a@b");
		expect(validity()).toMatchObject({ tooLong: true, tooShort: true });
	},
);

it.each([
	"number",
	"checkbox",
	"radio",
	"hidden",
	"button",
	"submit",
	"reset",
	"image",
	"file",
])("ignores inapplicable length attributes on %s", (type) => {
	const { tree, id, validity } = fixture({
		type,
		minlength: "9",
		maxlength: "0",
	});
	tree.setControl(id, { value: "1" }, "user");
	expect(validity()).toMatchObject({ tooLong: false, tooShort: false });
});

it.each(["select", "button"])("ignores lengths on %s", (tag) => {
	const { validity } = fixture({ minlength: "9", maxlength: "0" }, tag);
	expect(validity()).toMatchObject({ tooLong: false, tooShort: false });
});

it.each(["input", "textarea"])("counts UTF-16 units on %s", (tag) => {
	const { fill, validity } = fixture({ minlength: "2", maxlength: "2" }, tag);
	fill("😀");
	expect(validity()).toMatchObject({ tooLong: false, tooShort: false });
	fill("😀a");
	expect(validity().tooLong).toBe(true);
});

it("counts textarea API newlines, not raw CRLF or wrapping", () => {
	const { fill, validity, tree, id } = fixture(
		{ maxlength: "5", wrap: "hard", cols: "1" },
		"textarea",
	);
	fill("a\r\nb\rc");
	expect(controlValue(tree, id)).toBe("a\nb\nc");
	expect(validity().tooLong).toBe(false);
	fill("a\r\nb\rcd");
	expect(validity().tooLong).toBe(true);
});

it("counts sanitized email values without repairing multiple-token interior newlines", () => {
	const { fill, validity, tree, id } = fixture({
		type: "email",
		maxlength: "3",
	});
	fill(" a@b ");
	expect(controlValue(tree, id)).toBe("a@b");
	expect(validity()).toMatchObject({ tooLong: false, typeMismatch: false });
	tree.setAttribute(id, "multiple", "");
	fill(" a@b, c\nd@e ");
	expect(controlValue(tree, id)).toBe("a@b,c\nd@e");
	expect(validity()).toMatchObject({ tooLong: true, typeMismatch: true });
});

it.each(["input", "textarea"])(
	"does not make optional empty %s too short",
	(tag) => {
		const { fill, validity, tree, id } = fixture({ minlength: "3" }, tag);
		fill("");
		expect(validity()).toMatchObject({ tooShort: false, valid: true });
		tree.setAttribute(id, "required", "");
		expect(validity()).toMatchObject({ tooShort: false, valueMissing: true });
	},
);

it.each(["input", "textarea"])(
	"clears %s provenance on same-string page assignment",
	(tag) => {
		const { fill, tree, id } = fixture({ maxlength: "2" }, tag);
		const dom = new ScriptDom(tree, {
			createHostObject(definition: ScriptHostObjectDefinition) {
				const target = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(target, name, property);
				Object.assign(target, definition.methods);
				return target;
			},
		});
		const page = dom.node(id) as {
			value: string;
			validity: { tooLong: boolean };
		};
		fill("abc");
		const state = page.validity;
		expect(state.tooLong).toBe(true);
		const sameValue = page.value;
		page.value = sameValue;
		expect(page.validity).toBe(state);
		expect(state.tooLong).toBe(false);
		expect(tree.wasUserEditedValue(id)).toBe(false);
	},
);

it.each(["input", "textarea"])(
	"preserves %s provenance over default updates and clears on reset",
	(tag) => {
		const { fill, tree, id, validity } = fixture({ maxlength: "2" }, tag);
		fill("abc");
		if (tag === "input") tree.setAttribute(id, "value", "def");
		else tree.setTextContent(id, "def");
		expect(validity().tooLong).toBe(true);
		tree.setControl(id, { checked: false });
		expect(validity().tooLong).toBe(true);
		tree.clearControl(id, ["value"]);
		expect(controlValue(tree, id)).toBe("def");
		expect(validity().tooLong).toBe(false);
	},
);

it.each(["input", "textarea"])(
	"copies %s edit metadata without coupling clones or imports",
	(tag) => {
		const { fill, tree, id } = fixture({ maxlength: "2" }, tag);
		fill("abc");
		const other = new DocumentTree("about:blank");
		documents.push(other);
		const imported = other.copyFrom(tree, id);
		const clone = tree.clone(id);
		expect(controlValidity(other, imported).tooLong).toBe(true);
		expect(controlValidity(tree, clone).tooLong).toBe(true);
		tree.setControl(id, { value: "abc" });
		expect(controlValidity(tree, clone).tooLong).toBe(true);
		other.clearControl(imported, ["value"]);
		expect(controlValidity(other, imported).tooLong).toBe(false);
	},
);

it("preserves unchanged type transitions and clears programmatic sanitization", () => {
	const { fill, tree, id, validity } = fixture({ maxlength: "2" });
	fill(" abc ");
	tree.setAttribute(id, "type", "password");
	expect(validity().tooLong).toBe(true);
	tree.setAttribute(id, "type", "email");
	expect(controlValue(tree, id)).toBe("abc");
	expect(validity().tooLong).toBe(false);
	fill("abc");
	tree.setAttribute(id, "type", "hidden");
	tree.setAttribute(id, "type", "text");
	expect(validity().tooLong).toBe(false);
});

it("clears origin when multiple-attribute sanitization changes email value", () => {
	const { fill, tree, id, validity } = fixture({
		type: "email",
		maxlength: "2",
	});
	fill("a@b, c@d");
	expect(validity().tooLong).toBe(true);
	tree.setAttribute(id, "multiple", "");
	expect(controlValue(tree, id)).toBe("a@b,c@d");
	expect(validity().tooLong).toBe(false);
});

it("does not mark canceled native fills as user edits", () => {
	const { tree, id, validity } = fixture({ minlength: "3" });
	tree.setControl(id, { value: "a" });
	const actions = new DocumentInteractions(tree);
	actions.events.addEventListener(id, "beforeinput", (event) =>
		event.preventDefault(),
	);
	actions.fill(tree.reference(id), "b");
	expect(controlValue(tree, id)).toBe("a");
	expect(validity().tooShort).toBe(false);
});

it("exposes user origin to input listeners and clears it on their script rewrites", () => {
	const { tree, id, validity } = fixture({ minlength: "3" });
	const actions = new DocumentInteractions(tree);
	const seen: boolean[] = [];
	actions.events.addEventListener(id, "input", () => {
		seen.push(validity().tooShort);
		tree.setControl(id, { value: controlValue(tree, id) });
	});
	actions.fill(tree.reference(id), "a");
	expect(seen).toEqual([true]);
	expect(validity().tooShort).toBe(false);
});

it("does not mark blocked keyboard insertion or no-op deletion as user editing", () => {
	const { tree, id, validity } = fixture({ maxlength: "-0", minlength: "3" });
	tree.setControl(id, { value: "a" });
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	actions.keyboard.type("b");
	actions.keyboard.press("Delete");
	expect(controlValue(tree, id)).toBe("a");
	expect(validity()).toMatchObject({ tooLong: false, tooShort: false });
});

it("marks real deletion while preserving the unsupported number-keyboard gate", () => {
	const { tree, id, validity } = fixture({ minlength: "3", value: "ab" });
	const actions = new DocumentInteractions(tree);
	actions.focus.focus(tree.reference(id));
	actions.keyboard.press("Backspace");
	expect(validity().tooShort).toBe(true);
	tree.setAttribute(id, "type", "number");
	tree.setAttribute(id, "maxlength", "0");
	expect(() => actions.keyboard.type("12")).toThrow(
		"Keyboard editing for this control is not implemented",
	);
});

it.each(["script", "user"] as const)(
	"preserves value, origin and revision on rejected %s quota write",
	(origin) => {
		const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 48 });
		documents.push(tree);
		const id = tree.createElement("input", { maxlength: "2" });
		tree.setControl(id, { value: "abc" }, "user");
		const revision = tree.revision;
		expect(() =>
			tree.setControl(id, { value: "x".repeat(49) }, origin),
		).toThrow();
		expect(controlValue(tree, id)).toBe("abc");
		expect(tree.wasUserEditedValue(id)).toBe(true);
		expect(tree.revision).toBe(revision);
	},
);

it("rejects malformed origin and reset fields without mutation", () => {
	const { tree, id, fill } = fixture();
	fill("abc");
	const revision = tree.revision;
	expect(() =>
		tree.setControl(id, { value: "x" }, "unknown" as "user"),
	).toThrow();
	expect(() => tree.setControl(id, { checked: true }, "user")).toThrow();
	expect(() =>
		tree.clearControl(id, ["value", "unknown" as "value"]),
	).toThrow();
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(controlValue(tree, id)).toBe("abc");
	expect(tree.revision).toBe(revision);
});

it("retains origin on detach but releases it on close", () => {
	const { tree, id, fill, validity } = fixture({ maxlength: "2" });
	fill("abc");
	tree.remove(id);
	expect(validity().tooLong).toBe(true);
	tree.close();
	expect(
		(tree as unknown as { userEditedValues: Set<number> }).userEditedValues
			.size,
	).toBe(0);
	expect(() => tree.wasUserEditedValue(id)).toThrow();
});

it("shares length reasons, candidacy and custom-error priority with submission", () => {
	const { tree, id, fill, validity } = fixture({
		maxlength: "2",
		minlength: "5",
	});
	const actions = new DocumentInteractions(tree);
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	tree.append(form, id);
	fill("abc");
	expect(invalidControl(tree, id)?.reason).toBe("too-long");
	expect(validationMessage(tree, id)).toContain("shorten");
	expect(actions.forms.requestSubmit(tree.reference(form)).invalid).toEqual([
		{ reference: tree.reference(id), reason: "too-long" },
	]);
	tree.removeAttribute(id, "maxlength");
	expect(invalidControl(tree, id)?.reason).toBe("too-short");
	expect(validationMessage(tree, id)).toContain("lengthen");
	tree.setCustomValidity(id, "custom");
	expect(invalidControl(tree, id)?.reason).toBe("custom-error");
	tree.setAttribute(id, "disabled", "");
	expect(validity().tooShort).toBe(true);
	expect(validationMessage(tree, id)).toBe("");
	tree.removeAttribute(id, "disabled");
	tree.setCustomValidity(id, "");
	expect(actions.forms.checkValidity(tree.reference(form))).toBe(false);
	actions.forms.reset(tree.reference(form));
	expect(actions.forms.checkValidity(tree.reference(form))).toBe(true);
});
