import { afterEach, expect, it } from "vitest";
import { controlValue } from "./controls.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { prepareFormSubmission } from "./forms.js";
import { serializeHtml } from "./html-serialization.js";
import { sanitizeInputValue } from "./input-values.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(type: string, initial = "") {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement("input", {
		type,
		value: initial,
		name: "field",
	});
	tree.append(tree.root, id);
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
	return {
		tree,
		id,
		dom,
		input: dom.node(id) as {
			type: string;
			value: unknown;
			defaultValue: unknown;
		},
	};
}

it.each([
	["date", "2023-02-29"],
	["date", "1900-02-29"],
	["date", "0000-01-01"],
	["date", "2024-04-31"],
	["month", "2024-13"],
	["month", "2024-00"],
	["week", "2021-W53"],
	["week", "2024-W00"],
	["time", "24:00"],
	["time", "12:34:60"],
	["time", "12:34:00.0000"],
	["datetime-local", "2024-02-30T12:00"],
	["datetime-local", "2024-01-01t12:00"],
	["datetime-local", "2024-01-01T12:00+01:00"],
	["date", "2024-2-01"],
	["date", "2024-02-1"],
	["date", "024-02-01"],
	["date", "+2024-02-01"],
	["date", "２０２４-02-01"],
	["date", "2024-01-00"],
	["date", "2024-01-01\n"],
	["month", "0000-01"],
	["month", "2024-01\n"],
	["week", "2024-w01"],
	["week", "2020-W54"],
	["week", "2024-W1"],
	["week", "0000-W01"],
	["week", "2020-W53\n"],
	["time", "1:00"],
	["time", "12:3"],
	["time", "12:34.123"],
	["time", "12:34:00."],
	["time", "12:34:00.123\n"],
	["time", "12:60"],
	["datetime-local", "2024-01-01  12:00"],
	["datetime-local", "2024-01-01\t12:00"],
	["datetime-local", "2024-01-01T12:00Z"],
	["datetime-local", "2024-01-01T12:00\n"],
])("clears invalid %s input %s", (type, raw) => {
	expect(sanitizeInputValue(type, raw, {})).toBe("");
});

it.each([
	["2024-02-29 12:30:00.000", "2024-02-29T12:30"],
	["2024-02-29T12:30:05.120", "2024-02-29T12:30:05.12"],
	["2024-02-29T00:00:00.100", "2024-02-29T00:00:00.1"],
	["2024-02-29T00:00:00.010", "2024-02-29T00:00:00.01"],
	["2024-02-29T00:00:00.001", "2024-02-29T00:00:00.001"],
	["2024-02-29T00:00:01.000", "2024-02-29T00:00:01"],
	["00002024-03-10 02:30:00", "00002024-03-10T02:30"],
])("normalizes local datetime %s", (raw, expected) => {
	expect(sanitizeInputValue("datetime-local", raw, {})).toBe(expected);
});

it.each([
	["date", "2024-02-29"],
	["month", "2024-02"],
	["week", "2020-W53"],
	["time", "12:30:05.12"],
	["datetime-local", "2024-02-29T12:30"],
])("allows native page value assignment for %s", (type, value) => {
	const { tree, id, input } = fixture(type);
	input.value = value;
	expect(input.value).toBe(value);
	expect(controlValue(tree, id)).toBe(value);
});

it.each([
	["date", "0001-01-01"],
	["date", "0004-02-29"],
	["date", "2000-02-29"],
	["date", "00002024-02-29"],
	["month", "12345678901234567890-12"],
	["week", "0001-W01"],
	["week", "2004-W53"],
	["time", "00:00"],
	["time", "23:59:59.999"],
	["time", "12:34:00.000"],
])("preserves valid %s spelling %s", (type, raw) => {
	expect(sanitizeInputValue(type, raw, {})).toBe(raw);
});

it.each(["date", "month", "week", "time", "datetime-local"])(
	"rejects surrounding whitespace and accepts empty %s values",
	(type) => {
		expect(sanitizeInputValue(type, "", {})).toBe("");
		const valid = {
			date: "2024-02-29",
			month: "2024-02",
			week: "2020-W53",
			time: "12:30",
			"datetime-local": "2024-02-29T12:30",
		}[type];
		for (const whitespace of [" ", "\t", "\r", "\n", "\u00a0"])
			for (const raw of [`${whitespace}${valid}`, `${valid}${whitespace}`])
				expect(sanitizeInputValue(type, raw, {})).toBe("");
	},
);

it("matches UTC calendar boundaries throughout an independent 400-year cycle", () => {
	let longWeeks = 0;
	for (let year = 2001; year <= 2400; year++) {
		for (let month = 1; month <= 12; month++) {
			const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
			for (let day = 28; day <= 32; day++) {
				const raw = `${year}-${String(month).padStart(2, "0")}-${day}`;
				expect(sanitizeInputValue("date", raw, {})).toBe(
					day <= lastDay ? raw : "",
				);
			}
		}
		const weekday = new Date(Date.UTC(year, 0, 1)).getUTCDay();
		const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
		const long = weekday === 4 || (weekday === 3 && leap);
		if (long) longWeeks++;
		const raw = `${year}-W53`;
		expect(sanitizeInputValue("week", raw, {})).toBe(long ? raw : "");
		expect(sanitizeInputValue("week", `${year}-W52`, {})).toBe(`${year}-W52`);
	}
	expect(longWeeks).toBe(71);
});

it("handles large and padded years without numeric overflow or Date limits", () => {
	const prefix = "9".repeat(100_000);
	for (const [type, raw, valid] of [
		["date", `${prefix}2000-02-29`, true],
		["date", `${prefix}1900-02-29`, false],
		["week", `${prefix}2020-W53`, true],
		["week", `${prefix}2021-W53`, false],
		["month", `${"0".repeat(100_000)}-01`, false],
		["date", `${"0".repeat(100_000)}2024-02-29`, true],
	] as const)
		expect(sanitizeInputValue(type, raw, {})).toBe(valid ? raw : "");
});

it("keeps invalid edits dirty until reset while serializing raw defaults", () => {
	const { tree, id, input } = fixture("date", "2023-02-29");
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	tree.append(form, id);
	expect(input.value).toBe("");
	expect(serializeHtml(tree, id, { includeSelf: true })).toContain(
		'value="2023-02-29"',
	);
	input.value = "invalid";
	input.defaultValue = "2024-02-29";
	expect(input.value).toBe("");
	const submitted = () =>
		new URL(
			prepareFormSubmission(tree, tree.reference(form)).request.url,
		).searchParams.get("field");
	expect(submitted()).toBe("");
	new DocumentForms(tree, new DocumentEvents(tree)).reset(tree.reference(form));
	expect(input.value).toBe("2024-02-29");
	expect(submitted()).toBe("2024-02-29");
});

it("normalizes direct defaults and never resurrects invalid type-transition text", () => {
	const { tree, id, input } = fixture("text", "invalid");
	input.type = "date";
	input.type = "text";
	expect(input.value).toBe("");
	input.type = "datetime-local";
	tree.setAttribute(id, "value", "2024-02-29 12:30:00.000");
	expect(input.value).toBe("2024-02-29T12:30");
	input.type = "text";
	expect(input.value).toBe("2024-02-29T12:30");
});

it.each([false, true])(
	"copies calendar state and dirtiness when dirty=%s",
	(dirty) => {
		const source = fixture("datetime-local", "2024-02-29 12:30:00.000");
		if (dirty) source.input.value = "invalid";
		const target = fixture("text");
		for (const [tree, id] of [
			[source.tree, source.tree.clone(source.id)],
			[target.tree, target.tree.copyFrom(source.tree, source.id)],
		] as const) {
			expect(controlValue(tree, id)).toBe(dirty ? "" : "2024-02-29T12:30");
			tree.setAttribute(id, "value", "2024-03-01 00:00:00");
			expect(controlValue(tree, id)).toBe(dirty ? "" : "2024-03-01T00:00");
		}
	},
);

it.each([
	["date", "2024-02-\n29"],
	["time", "12:\r30"],
	["number", "12\n3"],
])(
	"does not repair invalid %s page values by deleting newlines",
	(type, raw) => {
		const { tree, id, input } = fixture(type);
		input.value = raw;
		expect(input.value).toBe("");
		expect(tree.get(id).control.value).toBe("");
	},
);

it("rejects retained calendar text over quota without changing value state", () => {
	const { tree, id, input } = fixture("date", "2024-02-29");
	const before = tree.get(id);
	const revision = tree.revision;
	expect(() => {
		input.value = `${"9".repeat(tree.limits.maxTextCodeUnits)}2024-02-29`;
	}).toThrow(/text limit/);
	expect(tree.get(id)).toBe(before);
	expect(tree.revision).toBe(revision);
	input.defaultValue = "2024-03-01";
	expect(input.value).toBe("2024-03-01");
});
