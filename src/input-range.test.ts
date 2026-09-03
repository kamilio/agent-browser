import { afterEach, expect, it } from "vitest";
import { controlValidity } from "./control-validity.js";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { sanitizeRangeInput } from "./input-range.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement("input", { type: "range", ...attributes });
	tree.append(tree.root, id);
	return { tree, id, value: () => controlValue(tree, id) };
}

it("defaults a range to its midpoint", () => {
	expect(fixture().value()).toBe("50");
});

it("clamps and aligns range values", () => {
	expect(fixture({ value: "100", min: "0", max: "9", step: "2" }).value()).toBe(
		"8",
	);
});

it("preserves the current value when an unedited range expands", () => {
	const { tree, id, value } = fixture();
	tree.setAttribute(id, "max", "200");
	expect(value()).toBe("50");
});

it.each<[string, Record<string, string>, string]>([
	["", {}, "50"],
	["invalid", {}, "50"],
	["NaN", {}, "50"],
	["Infinity", {}, "50"],
	["+1", {}, "50"],
	[" 1 ", {}, "50"],
	["1.", {}, "50"],
	["1e999", {}, "50"],
	["12\n", {}, "50"],
	["-1", {}, "0"],
	["101", {}, "100"],
	["1e1", {}, "1e1"],
	["01.0", {}, "01.0"],
	["-0", {}, "-0"],
	["4", { min: "0", max: "10", step: "3" }, "3"],
	["4.5", { min: "0", max: "10", step: "3" }, "6"],
	["-5.5", { min: "-10", max: "10", step: "3" }, "-4"],
	["10", { min: "0", max: "10", step: "3" }, "9"],
	["", { min: "0", max: "3", step: "2" }, "2"],
	["", { min: "0", max: "9", step: "2" }, "4"],
	["0.25", { min: "0.1", max: "1", step: "0.1" }, "0.3"],
	["0.26", { min: "0.1", max: "1", step: "0.1" }, "0.3"],
	["0.24", { min: "0.1", max: "1", step: "0.1" }, "0.2"],
	["0.25", { max: "0.4", value: "0.5", step: "1" }, "0.25"],
	["", { min: "10", max: "0" }, "10"],
	["5", { min: "10", max: "0" }, "10"],
	["12", { min: "10", max: "0", step: "3" }, "13"],
	["0.25", { step: "any" }, "0.25"],
	["0.25", { step: "ANY" }, "0.25"],
	["0.25", { step: "invalid" }, "0"],
	["0.25", { step: "0" }, "0"],
	["0.25", { step: "-1" }, "0"],
	["0.25", { step: "1e999" }, "0"],
	["2", { min: " +1tail", max: "10", step: " +2tail" }, "3"],
	["", { min: "invalid", max: "invalid" }, "50"],
	["", { min: "-1e308", max: "1e308", step: "any" }, "0"],
	["", { min: "5e-324", max: "5e-324", step: "any" }, "5e-324"],
	["1", { step: "5e-324" }, "1"],
	["1", { step: "1e308" }, "0"],
])("sanitizes %j under %j to %s", (raw, attributes, expected) => {
	expect(sanitizeRangeInput(raw, attributes)).toBe(expected);
	expect(sanitizeRangeInput(expected, attributes)).toBe(expected);
});

it("matches a finite integer-grid oracle including positive tie breaking", () => {
	for (const min of [-20, 0, 10]) {
		for (const max of [min, min + 1, min + 11]) {
			for (const step of [1, 2, 3, 7]) {
				const allowed: number[] = [];
				for (let value = min; value <= max; value += step) allowed.push(value);
				for (let raw = min - 5; raw <= max + 5; raw += 0.5) {
					const clamped = Math.max(min, Math.min(max, raw));
					const expected = [...allowed].sort(
						(left, right) =>
							Math.abs(left - clamped) - Math.abs(right - clamped) ||
							right - left,
					)[0];
					expect(
						Number(
							sanitizeRangeInput(String(raw), {
								min: String(min),
								max: String(max),
								step: String(step),
							}),
						),
					).toBe(expected);
				}
			}
		}
	}
});

it("bounds arithmetic by canonical finite numbers, not literal size", () => {
	const raw = `${"0".repeat(100_000)}1`;
	expect(sanitizeRangeInput(raw, {})).toBe(raw);
	expect(sanitizeRangeInput("9".repeat(100_000), {})).toBe("50");
});

it.each([false, true])(
	"clamps without resurrecting an older value when dirty=%s",
	(dirty) => {
		const { tree, id, value } = fixture({ value: "80" });
		if (dirty) tree.setControl(id, { value: "80" }, "user");
		tree.setAttribute(id, "max", "60");
		expect(value()).toBe("60");
		tree.removeAttribute(id, "max");
		expect(value()).toBe("60");
		tree.setAttribute(id, "value", "90");
		expect(value()).toBe(dirty ? "60" : "90");
	},
);

it("does not resurrect a pre-step value after the step changes again", () => {
	const { tree, id, value } = fixture({ value: "5" });
	tree.setAttribute(id, "step", "2");
	expect(value()).toBe("5");
	tree.setAttribute(id, "min", "0");
	expect(value()).toBe("6");
	tree.setAttribute(id, "step", "any");
	expect(value()).toBe("6");
	tree.removeAttribute(id, "min");
	expect(value()).toBe("6");
});

it("updates a dirty range when a changed value attribute moves the step base", () => {
	const { tree, id, value } = fixture({ step: "2", value: "0" });
	tree.setControl(id, { value: "4" }, "user");
	tree.setAttribute(id, "value", "1");
	expect(value()).toBe("5");
	expect(tree.wasUserEditedValue(id)).toBe(false);
	tree.removeAttribute(id, "value");
	expect(value()).toBe("6");
});

it("preserves user origin when constraint edits do not change the current value", () => {
	const { tree, id, value } = fixture();
	tree.setControl(id, { value: "4" }, "user");
	tree.setAttribute(id, "max", "200");
	expect(value()).toBe("4");
	expect(tree.wasUserEditedValue(id)).toBe(true);
});

it("normalizes current values on range/text type transitions", () => {
	const { tree, id, value } = fixture({ value: "invalid" });
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("50");
	tree.setAttribute(id, "type", "range");
	expect(value()).toBe("50");
	tree.setControl(id, { value: "200" });
	tree.setAttribute(id, "type", "text");
	expect(value()).toBe("100");
});

it("copies current range ownership through clone/import without coupling defaults", () => {
	const { tree, id, value } = fixture();
	tree.setAttribute(id, "max", "200");
	const clone = tree.clone(id);
	const other = new DocumentTree("about:blank");
	documents.push(other);
	const imported = other.copyFrom(tree, id);
	expect(controlValue(tree, clone)).toBe("50");
	expect(controlValue(other, imported)).toBe("50");
	tree.setAttribute(id, "value", "150");
	expect(value()).toBe("150");
	expect(controlValue(tree, clone)).toBe("50");
	tree.clearControl(clone, ["value"]);
	expect(controlValue(tree, clone)).toBe("100");
});

it("uses current range values for submission and reset restores sanitized defaults", () => {
	const { tree, id, value } = fixture({
		name: "range",
		value: "80",
		required: "",
		pattern: "(",
		minlength: "999",
		maxlength: "0",
	});
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	tree.append(form, id);
	tree.setAttribute(id, "max", "60");
	tree.removeAttribute(id, "max");
	const forms = new DocumentForms(tree, new DocumentEvents(tree));
	expect(forms.checkValidity(tree.reference(form))).toBe(true);
	expect(
		new URL(
			prepareFormSubmission(tree, tree.reference(form)).request.url,
		).searchParams.get("range"),
	).toBe("60");
	forms.reset(tree.reference(form));
	expect(value()).toBe("80");
});

it("keeps impossible ranges and unrepresentable step grids invalid", () => {
	const reversed = fixture({ min: "10", max: "0" });
	expect(controlValidity(reversed.tree, reversed.id)).toMatchObject({
		rangeOverflow: true,
		rangeUnderflow: false,
		valid: false,
	});
	const gap = fixture({ value: "0.5", max: "0.4", step: "1" });
	expect(gap.value()).toBe("0.4");
	expect(controlValidity(gap.tree, gap.id).stepMismatch).toBe(true);
});

it("reflects page value writes and constraint mutations through a held validity object", () => {
	const { tree, id, value } = fixture();
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
		validity: Record<string, boolean>;
		defaultValue: string;
		min: string;
		max: string;
		step: string;
	};
	const state = page.validity;
	expect([page.min, page.max, page.step]).toEqual(["", "", ""]);
	expect(page.value).toBe("50");
	page.value = "200";
	expect(value()).toBe("100");
	page.max = "200";
	expect(tree.get(id).attributes.max).toBe("200");
	expect(value()).toBe("100");
	page.defaultValue = "150";
	expect(value()).toBe("100");
	page.value = "bad";
	expect(value()).toBe("100");
	page.min = "300";
	expect(page.value).toBe("300");
	expect(page.validity).toBe(state);
	expect(state.rangeOverflow).toBe(true);
	page.min = "0";
	page.step = "7";
	expect(page.value).toBe("196");
	expect(state.valid).toBe(true);
	tree.removeAttribute(id, "step");
	expect(page.step).toBe("");
});

it.each(["value", "replace", "remove"])(
	"updates ranges through attached Attr %s operations",
	(operation) => {
		const { tree, id, value } = fixture({ max: "100", value: "80" });
		const attribute = tree.getAttributeNode(id, "max") as number;
		if (operation === "value") tree.setAttributeValue(attribute, "60");
		else if (operation === "replace")
			tree.setAttributeNode(id, tree.createAttribute("max", "60"));
		else {
			tree.setAttributeValue(attribute, "60");
			tree.removeAttributeNode(id, attribute);
		}
		expect(value()).toBe("60");
		tree.setAttribute(id, "max", "200");
		expect(value()).toBe("60");
	},
);

it("preflights current-value allocation on same-attribute writes", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 19 });
	documents.push(tree);
	const id = tree.createElement("input", { type: "range", min: "0" });
	tree.setControl(id, { value: "" }, "user");
	const revision = tree.revision;
	expect(() => tree.setAttribute(id, "min", "0")).toThrow("text limit");
	expect(tree.get(id).control.value).toBe("");
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(tree.revision).toBe(revision);
});

it("rejects combined bound/current allocation atomically", () => {
	const tree = new DocumentTree("about:blank", { maxTextCodeUnits: 21 });
	documents.push(tree);
	const id = tree.createElement("input", { type: "range" });
	const revision = tree.revision;
	expect(() => tree.setAttribute(id, "max", "200")).toThrow("text limit");
	expect(tree.get(id).attributes.max).toBeUndefined();
	expect(controlValue(tree, id)).toBe("50");
	expect(tree.revision).toBe(revision);
});

it("retains unrelated numeric/calendar values on bound changes", () => {
	const { tree } = fixture();
	for (const [type, original] of [
		["number", "80"],
		["date", "2024-02-29"],
		["text", "abc"],
	]) {
		const id = tree.createElement("input", { type });
		tree.setControl(id, { value: original }, "user");
		tree.setAttribute(id, "max", "0");
		expect(controlValue(tree, id)).toBe(original);
		expect(tree.wasUserEditedValue(id)).toBe(true);
	}
});
