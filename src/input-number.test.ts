import { afterEach, expect, it } from "vitest";
import { controlValue, fillTextControl } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import {
	type NumberConstraintFailure,
	numberConstraintFailure,
	parseNumberAttribute,
	validNumberValue,
} from "./input-number.js";
import { sanitizeInputValue } from "./input-values.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(value: string, attributes: Record<string, string> = {}) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const form = tree.createElement("form");
	const input = tree.createElement("input", {
		type: "number",
		name: "number",
		...attributes,
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	tree.setControl(input, { value });
	const events = new DocumentEvents(tree);
	const forms = new DocumentForms(tree, events);
	return {
		tree,
		form,
		input,
		events,
		forms,
		submit: () => forms.requestSubmit(tree.reference(form)),
	};
}

it.each<[string, Record<string, string>]>([
	["12", {}],
	["0.3", { step: "0.1" }],
	["3.6", { step: "0.003" }],
])("submits valid numeric value %s", (value, attributes) => {
	const { submit } = fixture(value, attributes);
	expect(submit().invalid).toEqual([]);
	expect(submit().submission).toBeDefined();
});

it.each<[string, Record<string, string>, NumberConstraintFailure]>([
	["0.5", {}, "step-mismatch"],
	["17", { step: "3e-15" }, "step-mismatch"],
	["-1", { min: "0" }, "range-underflow"],
	["11", { max: "10" }, "range-overflow"],
])("reports numeric constraint failure for %s", (value, attributes, reason) => {
	const { tree, input, submit } = fixture(value, attributes);
	expect(submit().invalid).toEqual([
		{ reference: tree.reference(input), reason },
	]);
});

it("rejects a trailing newline in a number value", () => {
	expect(sanitizeInputValue("number", "12\n", {})).toBe("");
});

it("rejects numeric fill newlines before mutating control state", () => {
	const { tree, input } = fixture("7");
	const revision = tree.revision;
	expect(() => fillTextControl(tree, tree.reference(input), "12\n")).toThrow(
		/numeric/,
	);
	expect(controlValue(tree, input)).toBe("7");
	expect(tree.revision).toBe(revision);
});

it.each<[string, number]>([
	[" \t\f\r\n+12.5tail", 12.5],
	["-.5", -0.5],
	["1.", 1],
	["1.e2", 100],
	["1e+", 1],
	["1e-", 1],
	["1e", 1],
	["1.5.2", 1.5],
	["1,5", 1],
	["0x10", 0],
	["-0", 0],
	["1e-9999", 0],
	["0e99999", 0],
	["1.7976931348623157e308", Number.MAX_VALUE],
	["5e-324", Number.MIN_VALUE],
])("parses numeric attribute prefix %s", (raw, expected) => {
	expect(parseNumberAttribute(raw)).toBe(expected);
});

it.each([
	undefined,
	"",
	" \t\n",
	"+",
	"-",
	".",
	".e2",
	"+.e2",
	"Infinity",
	"NaN",
	"1e309",
	"-1e309",
	"\u00a012",
	"１２",
])("ignores unparseable numeric attribute %s", (raw) =>
	expect(parseNumberAttribute(raw)).toBeUndefined(),
);

it.each([
	"0",
	"-0",
	"00012",
	"-.5",
	".25",
	"1E+2",
	"1e-9999",
	"0e99999",
	"5e-324",
	"1.7976931348623157e308",
])("preserves valid finite numeric spelling %s", (raw) => {
	expect(validNumberValue(raw)).toBe(true);
	expect(sanitizeInputValue("number", raw, {})).toBe(raw);
});

it.each([
	"+1",
	"1.",
	"1.e2",
	"1e+",
	"0x10",
	"Infinity",
	"NaN",
	"1e309",
	" 1",
	"1 ",
	"1\n",
	"１",
	".",
	"-",
	"1tail",
])(
	"keeps value syntax stricter than numeric-attribute prefixes for %s",
	(raw) => {
		expect(validNumberValue(raw)).toBe(false);
		expect(sanitizeInputValue("number", raw, {})).toBe("");
	},
);

it.each<[string, Record<string, string>, NumberConstraintFailure | undefined]>([
	["1.2", { min: "0.2" }, undefined],
	["1.2", { value: "0.2" }, undefined],
	["1.2", { min: "0.2", value: "0.3" }, undefined],
	["1.2", { min: "invalid", value: "0.2" }, undefined],
	["1.2", { value: " \t+.2tail" }, undefined],
	["1.2", { value: "invalid" }, "step-mismatch"],
	["1", { value: "3", step: "2" }, undefined],
	["0.5", { step: "any" }, undefined],
	["0.5", { step: "AnY" }, undefined],
	["0.5", { step: " any" }, "step-mismatch"],
	["0.5", { step: "any\n" }, "step-mismatch"],
	["0.5", { step: "-1" }, "step-mismatch"],
	["0.5", { step: "0" }, "step-mismatch"],
	["0.5", { step: "1e-9999" }, "step-mismatch"],
	["0.5", { step: "1e309" }, "step-mismatch"],
	["0.5", { step: "garbage" }, "step-mismatch"],
	["0.5", { step: " \t+.5tail" }, undefined],
	["-12345678.9", { step: "1e-12" }, undefined],
	["0.30000000000000004", { step: "0.1" }, "step-mismatch"],
	["0.9999999999999999", {}, "step-mismatch"],
	["1e308", { min: "-1e308", step: "1e307" }, undefined],
	["1e-323", { step: "5e-324" }, undefined],
	["1e308", { step: "3e-324" }, undefined],
	["9007199254740993", { step: "2" }, undefined],
	["0", { min: "0", max: "0" }, undefined],
	["1", { min: "2", step: "any" }, "range-underflow"],
	["2", { max: "1", step: "any" }, "range-overflow"],
	["5", { min: "10", max: "0" }, "range-underflow"],
	["11", { min: "10", max: "0" }, "range-overflow"],
	["2", { min: "\u00a03", max: "garbage" }, undefined],
	["2", { min: " +3junk" }, "range-underflow"],
	["2", { max: "1e+" }, "range-overflow"],
])("checks numeric value %s against %o", (value, attributes, expected) => {
	expect(numberConstraintFailure(value, attributes)).toBe(expected);
	const { submit } = fixture(value, attributes);
	expect(submit().invalid[0]?.reason).toBe(expected);
});

it.each(["pattern", "minlength", "maxlength"])(
	"ignores inapplicable number constraint %s",
	(attribute) => {
		expect(
			fixture("12", { [attribute]: "1" }).submit().submission,
		).toBeDefined();
	},
);

it.each(["", "invalid", "1e309"])(
	"applies required to sanitized empty number %s",
	(value) => {
		const { tree, input, submit } = fixture(value, {
			min: "100",
			max: "-100",
			step: "2",
		});
		expect(submit().invalid).toEqual([]);
		tree.setAttribute(input, "required", "");
		expect(submit().invalid).toEqual([
			{ reference: tree.reference(input), reason: "value-missing" },
		]);
	},
);

it.each(["readonly", "disabled"])(
	"excludes %s numeric controls from constraints",
	(attribute) => {
		expect(
			fixture("-1", { [attribute]: "", min: "0" }).submit().invalid,
		).toEqual([]);
	},
);

it("recomputes numeric constraints after direct and attached-Attr mutations without clamping", () => {
	const { tree, input, submit } = fixture("4", {
		min: "1",
		max: "9",
		step: "2",
	});
	expect(submit().invalid[0]?.reason).toBe("step-mismatch");
	tree.setAttribute(input, "min", "0");
	expect(submit().invalid).toEqual([]);
	const attribute = tree.getAttributeNode(input, "max");
	if (attribute === null) throw new Error("Missing max attribute");
	tree.setAttributeValue(attribute, "3");
	expect(submit().invalid[0]?.reason).toBe("range-overflow");
	tree.removeAttributeNode(input, attribute);
	expect(submit().invalid).toEqual([]);
	expect(controlValue(tree, input)).toBe("4");
});

it("uses the content default rather than the current value as the fallback step base", () => {
	const { tree, form, input, forms, submit } = fixture("1.2", { value: "0.2" });
	expect(submit().invalid).toEqual([]);
	tree.setAttribute(input, "value", "0.3");
	expect(controlValue(tree, input)).toBe("1.2");
	expect(submit().invalid[0]?.reason).toBe("step-mismatch");
	forms.reset(tree.reference(form));
	expect(controlValue(tree, input)).toBe("0.3");
	expect(submit().invalid).toEqual([]);
});

it("allows out-of-range fills while blocking submission until an invalid listener's next attempt", () => {
	const { tree, form, input, events, submit } = fixture("0", { min: "0" });
	fillTextControl(tree, tree.reference(input), "-1");
	expect(controlValue(tree, input)).toBe("-1");
	const calls: string[] = [];
	events.addEventListener(input, "invalid", (event) => {
		calls.push("invalid");
		event.preventDefault();
		tree.setControl(input, { value: "1" });
	});
	events.addEventListener(form, "submit", () => calls.push("submit"));
	expect(submit().submission).toBeUndefined();
	expect(calls).toEqual(["invalid"]);
	expect(submit().submission).toBeDefined();
	expect(calls).toEqual(["invalid", "submit"]);
});

it("supports native asynchronous numeric submission and explicit validation bypass", async () => {
	const { tree, form, forms, submit } = fixture("0.5");
	expect(
		(await forms.requestSubmitAsync(tree.reference(form))).invalid[0]?.reason,
	).toBe("step-mismatch");
	tree.setAttribute(form, "novalidate", "");
	expect(submit().submission).toBeDefined();
});

it("connects page numeric values and defaultValue with shared submission constraints", () => {
	const { tree, input, submit } = fixture("0");
	const dom = new ScriptDom(tree, {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const target = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(target, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(target, name, { value: method });
			return target;
		},
	});
	const page = dom.node(input) as { value: string; defaultValue: string };
	page.value = "1.2";
	expect(submit().invalid[0]?.reason).toBe("step-mismatch");
	page.defaultValue = "0.2";
	expect(submit().invalid).toEqual([]);
	page.value = "not a number";
	expect(page.value).toBe("");
	expect(submit().invalid).toEqual([]);
	dom.close();
});

it("agrees with an independent integer lattice over decimal fractions and signed bases", () => {
	for (let base = -7; base <= 7; base++)
		for (let step = 1; step <= 9; step++)
			for (let value = -19; value <= 19; value++) {
				const expected = (value - base) % step !== 0;
				expect(
					numberConstraintFailure(String(value / 10), {
						value: String(base / 10),
						step: String(step / 10),
					}),
				).toBe(expected ? "step-mismatch" : undefined);
			}
});

it("bounds arithmetic independently of authored digit and exponent lengths", () => {
	const zeros = "0".repeat(100_000);
	expect(
		numberConstraintFailure(`${zeros}12`, { step: `${zeros}2` }),
	).toBeUndefined();
	expect(
		numberConstraintFailure("1", { step: `1e-${"9".repeat(100_000)}` }),
	).toBeUndefined();
	expect(
		numberConstraintFailure("1e308", { min: "-1e308", step: "5e-324" }),
	).toBeUndefined();
	expect(parseNumberAttribute(`1e${"9".repeat(100_000)}`)).toBeUndefined();
	expect(validNumberValue(`${zeros}1junk`)).toBe(false);
});
