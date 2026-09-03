import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { controlValue } from "./controls.js";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { inputNumberValue, inputValueAsNumber } from "./input-value-number.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(
	type: string,
	attributes: Record<string, string> = {},
	maxTextCodeUnits?: number,
) {
	const tree = new DocumentTree("https://fixture.invalid/", {
		maxTextCodeUnits,
	});
	documents.push(tree);
	const id = tree.createElement("input", { type, ...attributes });
	tree.append(tree.root, id);
	const events = new DocumentEvents(tree);
	const dom = new ScriptDom(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const target = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(target, name, property);
				Object.assign(target, definition.methods);
				return target;
			},
		},
		{
			events,
			callbacks: {
				isClosed: () => false,
				startCallback(callback, args, options) {
					if (typeof callback !== "function")
						throw new Error("Expected callback");
					const result = Promise.resolve(
						callback.apply(options.thisValue, args),
					);
					return { synchronous: Promise.resolve(), result };
				},
			},
		},
	);
	return {
		tree,
		id,
		dom,
		events,
		page: dom.node(id) as {
			value: string;
			valueAsNumber: number;
			type: string;
			validity: Record<string, boolean>;
			addEventListener(type: string, callback: () => void): void;
		},
	};
}

it.each<[string, string, number]>([
	["number", "12.5", 12.5],
	["range", "75", 75],
	["date", "1970-01-02", 86400000],
	["month", "1970-02", 1],
	["week", "1970-W01", -259200000],
	["time", "01:00", 3600000],
	["datetime-local", "1970-01-01T01:00", 3600000],
])("exposes numeric values for %s", (type, value, expected) => {
	const { page } = fixture(type, { value });
	expect(page.valueAsNumber).toBe(expected);
});

it.each<[string, number, string]>([
	["number", -12.5, "-12.5"],
	["number", -0, "0"],
	["number", Number.MIN_VALUE, "5e-324"],
	["number", Number.MAX_VALUE, String(Number.MAX_VALUE)],
	["range", 200, "100"],
	["range", -1, "0"],
	["range", 7.5, "8"],
	["date", 0, "1970-01-01"],
	["date", -1, "1969-12-31"],
	["date", 86400001, "1970-01-02"],
	["date", Date.UTC(2000, 1, 29), "2000-02-29"],
	["month", -1, "1969-12"],
	["month", 12, "1971-01"],
	["month", 0.5, "1970-02"],
	["month", -0.5, "1969-12"],
	["week", 0, "1970-W01"],
	["week", Date.UTC(2021, 0, 1), "2020-W53"],
	["week", Date.UTC(2021, 0, 4), "2021-W01"],
	["time", 0, "00:00"],
	["time", -1, "23:59:59.999"],
	["time", 86400000 + 12340, "00:00:12.34"],
	["time", 0.5, "00:00:00.001"],
	["time", -0.5, "23:59:59.999"],
	["time", Number("2.7343337071894478e26"), "10:54:10.944"],
	["datetime-local", -86400000, "1969-12-31T00:00"],
	["datetime-local", 1100, "1970-01-01T00:00:01.1"],
	["datetime-local", Number("2.7343337071894478e26"), ""],
])("serializes %s numeric assignment %s", (type, number, expected) => {
	const { page } = fixture(type);
	page.valueAsNumber = number;
	expect(page.value).toBe(expected);
});

const types = [
	"number",
	"range",
	"date",
	"month",
	"week",
	"time",
	"datetime-local",
];
it.each(types)("clears %s with NaN through its sanitizer", (type) => {
	const { page } = fixture(type);
	page.valueAsNumber = 1;
	page.valueAsNumber = Number.NaN;
	expect(page.value).toBe(type === "range" ? "50" : "");
	expect(page.valueAsNumber).toBe(type === "range" ? 50 : Number.NaN);
});

it.each([...types, "text", "checkbox", "file"])(
	"rejects infinity before applicability for %s",
	(type) => {
		const { tree, page } = fixture(type);
		const revision = tree.revision;
		for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
			expect(() => {
				page.valueAsNumber = value;
			}).toThrow(TypeError);
		expect(tree.revision).toBe(revision);
	},
);

it.each([
	"text",
	"email",
	"url",
	"checkbox",
	"radio",
	"file",
	"color",
	"hidden",
	"button",
])("rejects nonnumeric setters for %s", (type) => {
	const { tree, page } = fixture(type);
	const revision = tree.revision;
	expect(page.valueAsNumber).toBeNaN();
	for (const value of [1, Number.NaN])
		expect(() => {
			page.valueAsNumber = value;
		}).toThrow(expect.objectContaining({ name: "InvalidStateError" }));
	expect(tree.revision).toBe(revision);
});

it.each<[unknown, string]>([
	[null, "0"],
	[false, "0"],
	[true, "1"],
	["0x10", "16"],
	[" 2.5 ", "2.5"],
	["", "0"],
	[undefined, ""],
	["bad", ""],
])("converts primitive %s without callbacks", (raw, expected) => {
	const { page } = fixture("number");
	Reflect.set(page, "valueAsNumber", raw);
	expect(page.value).toBe(expected);
});

it("rejects unsupported coercion without executing guest callbacks", () => {
	let calls = 0;
	const object = {
		valueOf() {
			calls++;
			return 12;
		},
		toString() {
			calls++;
			return "12";
		},
	};
	const { tree, page } = fixture("number", { value: "3" });
	const revision = tree.revision;
	for (const raw of [1n, Symbol("number"), object, () => 1, new Number(1)])
		expect(() => Reflect.set(page, "valueAsNumber", raw)).toThrow(TypeError);
	expect(calls).toBe(0);
	expect(page.value).toBe("3");
	expect(tree.revision).toBe(revision);
});

it.each<[string, number, string]>([
	["date", -62135596800000, "0001-01-01"],
	["week", -62135596800000, "0001-W01"],
	["datetime-local", -62135596800000, "0001-01-01T00:00"],
	["month", (1 - 1970) * 12, "0001-01"],
	["date", 8640000000000000, "275760-09-13"],
	["datetime-local", 8640000000000000, "275760-09-13T00:00"],
	["month", (275760 - 1970) * 12 + 8, "275760-09"],
])(
	"round trips the supported %s numeric boundary %s",
	(type, number, expected) => {
		const { page } = fixture(type);
		page.valueAsNumber = number;
		expect(page.value).toBe(expected);
		expect(page.valueAsNumber).toBe(number);
	},
);

it.each<[string, number]>([
	["date", -62135596800001],
	["week", -62135596800001],
	["datetime-local", -62135596800001],
	["month", (1 - 1970) * 12 - 1],
	["date", 8640000000000001],
	["week", 8640000000000001],
	["datetime-local", 8640000000000001],
	["month", (275760 - 1970) * 12 + 9],
])(
	"clears numeric %s assignments outside the calendar profile",
	(type, number) => {
		const { page } = fixture(type);
		page.valueAsNumber = number;
		expect(page.value).toBe("");
		expect(page.valueAsNumber).toBeNaN();
	},
);

it.each(["date", "month", "week", "datetime-local"])(
	"does not mutate an out-of-profile %s string getter",
	(type) => {
		const suffix =
			type === "date"
				? "-01-01"
				: type === "month"
					? "-01"
					: type === "week"
						? "-W01"
						: "-01-01T00:00";
		const value = `${"1".repeat(100000)}${suffix}`;
		const { tree, page } = fixture(type, { value });
		const revision = tree.revision;
		expect(page.valueAsNumber).toBeNaN();
		expect(page.value).toBe(value);
		expect(tree.revision).toBe(revision);
	},
);

it("preserves dirty/default ownership and reset behavior", () => {
	const { tree, id, page } = fixture("number", { value: "1" });
	page.valueAsNumber = 3;
	tree.setAttribute(id, "value", "2");
	expect(page.value).toBe("3");
	const clone = tree.clone(id);
	const importedTree = new DocumentTree("about:blank");
	documents.push(importedTree);
	const imported = importedTree.copyFrom(tree, id);
	expect(controlValue(tree, clone)).toBe("3");
	expect(controlValue(importedTree, imported)).toBe("3");
	tree.clearControl(id, ["value"]);
	expect(page.valueAsNumber).toBe(2);
	tree.clearControl(clone, ["value"]);
	expect(controlValue(tree, clone)).toBe("2");
});

it("clears user-edit provenance even on a same-value assignment", () => {
	const { tree, id, page } = fixture("number");
	tree.setControl(id, { value: "4" }, "user");
	page.valueAsNumber = 4;
	expect(tree.wasUserEditedValue(id)).toBe(false);
});

it("updates live validity without dispatching edit events", async () => {
	const {
		page,
		events: dispatcher,
		id,
	} = fixture("number", { min: "0", max: "10", step: "2" });
	const events: string[] = [];
	for (const type of ["beforeinput", "input", "change"])
		page.addEventListener(type, () => events.push(type));
	const validity = page.validity;
	page.valueAsNumber = 11;
	expect(validity.rangeOverflow).toBe(true);
	expect(validity.stepMismatch).toBe(true);
	page.valueAsNumber = 4;
	expect(validity.valid).toBe(true);
	expect(events).toEqual([]);
	await dispatcher.dispatchEventAsync(id, new BrowserEvent("input"));
	expect(events).toEqual(["input"]);
});

it("applies range bounds to NaN and numeric writes", () => {
	const { page } = fixture("range", { min: "10", max: "20", step: "2" });
	page.valueAsNumber = Number.NaN;
	expect(page.valueAsNumber).toBe(16);
	page.valueAsNumber = -100;
	expect(page.valueAsNumber).toBe(10);
});

it("allows script changes to readonly disabled controls", () => {
	const { page } = fixture("date", { disabled: "", readonly: "" });
	page.valueAsNumber = 0;
	expect(page.value).toBe("1970-01-01");
});

it("uses the live type on every property access", () => {
	const { page } = fixture("number", { value: "4" });
	page.type = "text";
	expect(page.valueAsNumber).toBeNaN();
	expect(() => {
		page.valueAsNumber = 1;
	}).toThrow();
	page.type = "time";
	page.valueAsNumber = 60000;
	expect(page.value).toBe("00:01");
});

it("preflights quota failure without changing values or origin", () => {
	const { tree, id, page } = fixture("number", {}, 24);
	tree.setControl(id, { value: "1" }, "user");
	const revision = tree.revision;
	expect(() => {
		page.valueAsNumber = Number.MAX_VALUE;
	}).toThrow("text limit");
	expect(page.valueAsNumber).toBe(1);
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(tree.revision).toBe(revision);
});

it("revokes numeric reads and writes when the document closes", () => {
	const { tree, page } = fixture("number");
	tree.close();
	expect(() => page.valueAsNumber).toThrow();
	expect(() => {
		page.valueAsNumber = 1;
	}).toThrow();
});

it("does not add the input property to textarea", () => {
	const { tree, dom } = fixture("number");
	const textarea = dom.node(tree.createElement("textarea"));
	expect(Object.hasOwn(textarea, "valueAsNumber")).toBe(false);
});

it("matches independent UTC dates across a Gregorian cycle", () => {
	for (let year = 1800; year < 2200; year++) {
		for (let month = 0; month < 12; month++) {
			const timestamp = Date.UTC(year, month, 28, 12, 34, 56, 789);
			const date = new Date(timestamp).toISOString();
			expect(inputValueAsNumber("date", date.slice(0, 10))).toBe(
				Date.UTC(year, month, 28),
			);
			expect(inputValueAsNumber("datetime-local", date.slice(0, -1))).toBe(
				timestamp,
			);
			expect(inputNumberValue("datetime-local", timestamp)).toBe(
				date.slice(0, -1),
			);
			const week = inputNumberValue("week", timestamp);
			const monday = inputValueAsNumber("week", week);
			expect(new Date(monday).getUTCDay()).toBe(1);
			expect(timestamp - monday).toBeGreaterThanOrEqual(0);
			expect(timestamp - monday).toBeLessThan(7 * 86400000);
			const weekYear = Number(week.split("-")[0]);
			expect(new Date(monday + 3 * 86400000).getUTCFullYear()).toBe(weekYear);
		}
	}
});
