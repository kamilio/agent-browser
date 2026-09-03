import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { controlValue } from "./controls.js";
import { BrowserEvent, DocumentEvents } from "./events.js";
import { stepInputValue } from "./input-stepping.js";
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
				const object = Object.create(null);
				for (const [name, property] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(object, name, property);
				Object.assign(object, definition.methods);
				return object;
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
			stepUp(count?: unknown): void;
			stepDown(count?: unknown): void;
			validity: Record<string, boolean>;
			addEventListener(type: string, listener: () => void): void;
		},
	};
}

it.each<[string, string, string]>([
	["number", "1", "2"],
	["range", "50", "51"],
	["date", "2024-02-28", "2024-02-29"],
	["month", "2024-12", "2025-01"],
	["week", "2020-W53", "2021-W01"],
	["time", "12:00", "12:01"],
	["datetime-local", "2024-12-31T23:59", "2025-01-01T00:00"],
])("steps %s up and down through page methods", (type, before, after) => {
	const { page } = fixture(type, { value: before });
	expect(page.stepUp()).toBeUndefined();
	expect(page.value).toBe(after);
	expect(page.stepDown()).toBeUndefined();
	expect(page.value).toBe(before);
});

it.each<[unknown, number]>([
	[undefined, 1],
	[null, 0],
	[true, 1],
	[false, 0],
	["3", 3],
	["", 0],
	[2.9, 2],
	[-2.9, -2],
	[Number.NaN, 0],
	[Number.POSITIVE_INFINITY, 0],
	[Number.NEGATIVE_INFINITY, 0],
	[4294967296, 0],
	[4294967297, 1],
	[4294967295, -1],
	[-4294967297, -1],
	[2147483648, -2147483648],
])(
	"converts primitive step counts %s as signed 32-bit integers",
	(count, increment) => {
		const { page } = fixture("number", { value: "0" });
		page.stepUp(count);
		expect(page.valueAsNumber).toBe(increment);
		page.value = "0";
		page.stepDown(count);
		expect(page.valueAsNumber).toBe(increment === 0 ? 0 : -increment);
	},
);

it("does not invoke object count coercion and fails before input type checks", () => {
	const { tree, page } = fixture("text", { value: "unchanged" });
	let calls = 0;
	const object = {
		valueOf() {
			calls++;
			return 1;
		},
	};
	const revision = tree.revision;
	for (const value of [object, 1n, Symbol("step"), () => 1]) {
		expect(() => page.stepUp(value)).toThrow(TypeError);
		expect(() => page.stepDown(value)).toThrow(TypeError);
	}
	expect(calls).toBe(0);
	expect(page.value).toBe("unchanged");
	expect(tree.revision).toBe(revision);
});

it.each([
	"text",
	"email",
	"password",
	"url",
	"checkbox",
	"radio",
	"file",
	"hidden",
	"submit",
	"color",
])("rejects stepping on %s inputs even with zero count", (type) => {
	const { tree, page } = fixture(type);
	const revision = tree.revision;
	for (const count of [0, 1]) {
		expect(() => page.stepUp(count)).toThrow(
			expect.objectContaining({ name: "InvalidStateError" }),
		);
		expect(() => page.stepDown(count)).toThrow(
			expect.objectContaining({ name: "InvalidStateError" }),
		);
	}
	expect(tree.revision).toBe(revision);
});

it.each(["number", "range", "date", "month", "week", "time", "datetime-local"])(
	"rejects any-step %s methods without mutation",
	(type) => {
		const { tree, page } = fixture(type, { step: "AnY" });
		const revision = tree.revision;
		expect(() => page.stepUp(0)).toThrow(
			expect.objectContaining({ name: "InvalidStateError" }),
		);
		expect(() => page.stepDown()).toThrow(
			expect.objectContaining({ name: "InvalidStateError" }),
		);
		expect(tree.revision).toBe(revision);
	},
);

it.each<
	[
		string,
		Record<string, string>,
		string,
		"stepUp" | "stepDown",
		number,
		string,
	]
>([
	["number", { step: "0.1" }, "0.2", "stepUp", 1, "0.3"],
	["number", { step: "0.1" }, "0.2", "stepDown", 3, "-0.1"],
	["number", { step: "2", min: "1" }, "2", "stepUp", 3, "7"],
	["number", { step: "2", min: "-10" }, "1", "stepDown", 3, "-4"],
	["number", { step: "2", min: "-10" }, "1", "stepUp", -3, "-4"],
	["number", { step: "2" }, "1", "stepUp", 0, "1"],
	["number", { min: "0", max: "5", step: "2" }, "2", "stepUp", 100, "4"],
	["number", { min: "0", max: "5", step: "2" }, "8", "stepDown", 1, "4"],
	["number", { min: "0", max: "5", step: "2" }, "-3", "stepUp", 1, "0"],
	["number", { min: "0", max: "5", step: "2" }, "-3", "stepDown", 1, "-3"],
	["number", { min: "0", max: "5", step: "2" }, "8", "stepUp", 1, "8"],
	["number", { min: "7" }, "", "stepDown", 1, "7"],
	["number", { max: "-7" }, "", "stepUp", 1, "-7"],
	["number", {}, "", "stepDown", 1, "-1"],
	["range", {}, "50", "stepUp", 1000, "100"],
	["range", {}, "50", "stepDown", 1000, "0"],
	["date", { step: "2" }, "2024-02-28", "stepUp", 2, "2024-03-02"],
	["month", { step: "3" }, "2024-12", "stepUp", 2, "2025-04"],
	["week", { step: "2" }, "2020-W53", "stepUp", 2, "2021-W03"],
	["time", { step: "0.001" }, "23:59:59.999", "stepUp", 1, "00:00"],
	["time", { step: "0.1" }, "00:00", "stepDown", 1, "23:59:59.9"],
	["time", { max: "17:00" }, "", "stepDown", 1, "23:59"],
	[
		"datetime-local",
		{ step: "0.001" },
		"1970-01-01T00:00",
		"stepDown",
		1,
		"1969-12-31T23:59:59.999",
	],
])(
	"steps %s with constraints %j from %s using %s(%s)",
	(type, attributes, before, method, count, after) => {
		const { page } = fixture(type, attributes);
		page.value = before;
		page[method](count);
		expect(page.value).toBe(after);
	},
);

it.each(["", "0", "-2", "no", "Infinity", "1e999"])(
	"falls back to the default for invalid step %s",
	(step) => {
		const { page } = fixture("number", { value: "1", step });
		page.stepUp();
		expect(page.value).toBe("2");
	},
);

it("shares numeric attribute-prefix parsing with existing constraints", () => {
	const { page } = fixture("number", {
		min: " 1junk",
		max: "7junk",
		step: "2junk",
	});
	page.value = "1";
	page.stepUp(2);
	expect(page.value).toBe("5");
	expect(page.validity.valid).toBe(true);
});

it("reads live constraints and uses the default value, not current value, as step base", () => {
	const { tree, id, page } = fixture("number", { value: "1", step: "2" });
	page.value = "2";
	page.stepUp();
	expect(page.value).toBe("3");
	tree.setAttribute(id, "min", "0");
	page.stepDown();
	expect(page.value).toBe("2");
	tree.removeAttribute(id, "min");
	tree.setAttribute(id, "value", "0");
	page.stepUp();
	expect(page.value).toBe("4");
	tree.setAttribute(id, "step", "any");
	expect(() => page.stepUp()).toThrow();
});

it.each<[string, Record<string, string>]>([
	["number", { min: "2", max: "1", value: "3" }],
	["time", { min: "23:00", max: "01:00", value: "00:00" }],
	["range", { value: "2", max: "1", step: "3" }],
])(
	"does not mutate impossible or reversed %s step ranges",
	(type, attributes) => {
		const { tree, id, page } = fixture(type, attributes);
		tree.setControl(id, { value: page.value }, "user");
		const before = page.value;
		const revision = tree.revision;
		page.stepUp();
		page.stepDown();
		expect(page.value).toBe(before);
		expect(tree.wasUserEditedValue(id)).toBe(true);
		expect(tree.revision).toBe(revision);
	},
);

it("keeps script stepping silent but updates live validity and default ownership", async () => {
	const { tree, id, page, events } = fixture("number", {
		value: "1",
		step: "2",
	});
	const seen: string[] = [];
	for (const type of ["beforeinput", "input", "change"])
		page.addEventListener(type, () => seen.push(type));
	tree.setControl(id, { value: "2" }, "user");
	const validity = page.validity;
	expect(validity.stepMismatch).toBe(true);
	page.stepUp();
	expect(validity.valid).toBe(true);
	expect(tree.wasUserEditedValue(id)).toBe(false);
	expect(seen).toEqual([]);
	tree.setAttribute(id, "value", "5");
	expect(page.value).toBe("3");
	const clone = tree.clone(id);
	expect(controlValue(tree, clone)).toBe("3");
	tree.clearControl(clone, ["value"]);
	expect(controlValue(tree, clone)).toBe("5");
	tree.clearControl(id, ["value"]);
	expect(page.value).toBe("5");
	await events.dispatchEventAsync(id, new BrowserEvent("input"));
	expect(seen).toEqual(["input"]);
});

it("marks successful zero-count writes dirty and clears user-edit provenance", () => {
	const { tree, id, page } = fixture("number", { value: "4" });
	tree.setControl(id, { value: "4" }, "user");
	page.stepUp(0);
	expect(tree.wasUserEditedValue(id)).toBe(false);
	tree.setAttribute(id, "value", "5");
	expect(page.value).toBe("4");
});

it("supports disabled, readonly and detached inputs using current type", () => {
	const { tree, id, page } = fixture("number", {
		readonly: "",
		disabled: "",
		value: "1",
	});
	tree.remove(id);
	page.stepUp();
	expect(page.value).toBe("2");
	page.type = "text";
	expect(() => page.stepDown()).toThrow();
	page.type = "month";
	page.value = "2024-12";
	page.stepUp();
	expect(page.value).toBe("2025-01");
});

it("preflights quota allocation before dirty/current value changes", () => {
	const { tree, id, page } = fixture("number", {}, 16);
	tree.setControl(id, { value: "9" }, "user");
	const revision = tree.revision;
	expect(() => page.stepUp()).toThrow("text limit");
	expect(page.value).toBe("9");
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(tree.revision).toBe(revision);
});

it("revokes retained stepping methods on document closure", () => {
	const { tree, page } = fixture("number");
	const up = page.stepUp;
	const down = page.stepDown;
	tree.close();
	expect(() => up()).toThrow();
	expect(() => down()).toThrow();
});

it("does not expose input stepping on other element kinds", () => {
	const { tree, dom } = fixture("number");
	for (const tag of ["textarea", "select", "button", "div"]) {
		const page = dom.node(tree.createElement(tag));
		expect(Object.hasOwn(page, "stepUp")).toBe(false);
		expect(Object.hasOwn(page, "stepDown")).toBe(false);
	}
});

it.each<[string, string, string]>([
	["0", "5e-324", "5e-324"],
	["1e-323", "5e-324", "1.5e-323"],
	["1e308", "1e308", "1e308"],
	["10000000000000000", "1", "10000000000000000"],
])(
	"bounds exact stepping for numeric %s with step %s",
	(before, step, after) => {
		const { page } = fixture("number", { step });
		page.value = before;
		page.stepUp();
		expect(page.value).toBe(after);
	},
);

it("does not loop for the largest signed count and smallest finite step", () => {
	expect(
		stepInputValue("number", "0", { step: "5e-324" }, 1, 2147483647),
	).toBeUndefined();
	expect(stepInputValue("number", "0", { step: "1e-300" }, 1, 2147483647)).toBe(
		"2.147483647e-291",
	);
});

it.each<[string, string, string, string]>([
	["date", "2024-01-01", "0.5", "2024-01-01"],
	["month", "2024-01", "0.5", "2024-02"],
	["time", "00:00", "0.0005", "00:00:00.001"],
	["datetime-local", "1970-01-01T00:00", "0.0005", "1970-01-01T00:00:00.001"],
])(
	"uses the numeric serializer's fractional %s policy",
	(type, before, step, after) => {
		const { page } = fixture(type, { value: before, step });
		page.stepUp();
		expect(page.value).toBe(after);
	},
);

it.each<[string, string]>([
	["date", "275760-09-13"],
	["month", "275760-09"],
	["datetime-local", "275760-09-13T00:00"],
])(
	"uses numeric conversion limits rather than overflow fallback for %s",
	(type, before) => {
		const { page } = fixture(type, { value: before });
		page.stepUp();
		expect(page.value).toBe("");
	},
);

it("preserves provenance and revision when the double cannot represent the exact target", () => {
	const { tree, id, page } = fixture("number", { step: "1" });
	tree.setControl(id, { value: "10000000000000000" }, "user");
	const revision = tree.revision;
	page.stepUp();
	expect(tree.wasUserEditedValue(id)).toBe(true);
	expect(tree.revision).toBe(revision);
	expect(page.value).toBe("10000000000000000");
});

it.each(["date", "month", "week", "time", "datetime-local"])(
	"bounds scaled finite-overflow stepping for %s",
	(type) => {
		const { tree, page } = fixture(type, { step: "1e308" });
		page.valueAsNumber = 0;
		const before = page.value;
		const revision = tree.revision;
		page.stepUp(2147483647);
		expect(page.value).toBe(before);
		expect(tree.revision).toBe(revision);
	},
);

it("matches an independent integer grid oracle across signed counts and bounds", () => {
	for (let initial = -12; initial <= 12; initial++) {
		for (let count = -4; count <= 4; count++) {
			const grid = Array.from(
				{ length: 41 },
				(_, index) => -7 + (index - 20) * 3,
			);
			let expected = initial;
			if (count > 0) {
				const next = grid.find((value) => value > initial);
				expected = next === undefined ? 8 : Math.min(8, next + (count - 1) * 3);
			} else if (count < 0) {
				const previous = [...grid].reverse().find((value) => value < initial);
				expected =
					previous === undefined
						? -7
						: Math.max(-7, previous + (count + 1) * 3);
			}
			expected = Math.max(-7, Math.min(8, expected));
			if (
				(count > 0 && expected < initial) ||
				(count < 0 && expected > initial)
			)
				expected = initial;
			if (count === 0) expected = Math.max(-7, Math.min(8, initial));
			const value = stepInputValue(
				"number",
				String(initial),
				{ min: "-7", max: "8", step: "3" },
				1,
				count,
			);
			expect(value ?? String(initial)).toBe(String(expected));
		}
	}
});
