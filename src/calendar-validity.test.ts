import { afterEach, expect, it } from "vitest";
import { calendarValidity } from "./calendar-validity.js";
import { controlValidity } from "./control-validity.js";
import { DocumentTree } from "./document.js";
import { DocumentEvents } from "./events.js";
import { DocumentForms } from "./form-actions.js";
import { validationMessage } from "./form-validation.js";
import { ScriptDom, type ScriptHostObjectDefinition } from "./script-dom.js";

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it.each([
	["date", "2024-03-01", "2024-02-29"],
	["month", "2024-03", "2024-02"],
	["week", "2021-W01", "2020-W53"],
	["time", "12:00:00.001", "12:00"],
	["datetime-local", "2024-02-29T12:00:00.001", "2024-02-29T12:00"],
])("compares %s upper bounds and inclusive endpoints", (type, value, max) => {
	const { tree, id, validity } = fixture(type, value, { max, step: "any" });
	expect(validity()).toMatchObject({
		rangeOverflow: true,
		rangeUnderflow: false,
	});
	tree.setControl(id, { value: max });
	tree.setAttribute(id, "min", max);
	expect(validity().valid).toBe(true);
});

it.each<[string, string, string, string, boolean]>([
	["date", "1970-01-01", "", "2", false],
	["date", "1970-01-02", "", "2", true],
	["date", "1969-12-31", "", "2", true],
	["date", "1969-12-30", "", "2", false],
	["date", "2024-03-01", "2024-02-28", "2", false],
	["date", "2023-03-01", "2023-02-28", "2", true],
	["date", "2000-03-01", "2000-02-28", "2", false],
	["date", "1900-03-01", "1900-02-28", "2", true],
	["date", "1970-01-02", "", "0.5", false],
	["date", "1970-01-02", "", "1.5", true],
	["date", "1970-01-04", "", "1.5", false],
	["month", "1970-01", "", "2", false],
	["month", "1969-12", "", "2", true],
	["month", "1969-11", "", "2", false],
	["month", "2025-01", "2024-11", "2", false],
	["month", "2025-02", "2024-11", "2", true],
	["month", "1970-02", "", "0.5", false],
	["month", "1970-02", "", "1.5", true],
	["week", "1970-W01", "", "2", false],
	["week", "1970-W02", "", "2", true],
	["week", "1969-W52", "", "2", true],
	["week", "2021-W01", "2020-W53", "2", true],
	["week", "2021-W02", "2020-W53", "2", false],
	["time", "00:01", "", "", false],
	["time", "00:01:01", "", "", true],
	["time", "00:00:00.001", "", "0.001", false],
	["time", "00:00:00.001", "", "0.002", true],
	["time", "00:00:00.003", "", "0.0015", false],
	["time", "00:00:00.001", "", "0.0015", true],
	["time", "00:00:00.300", "00:00:00.100", "0.1", false],
	["time", "12:00", "11:00", "900", false],
	["time", "12:01", "11:00", "900", true],
	["datetime-local", "1970-01-01T00:00", "", "", false],
	["datetime-local", "1970-01-01T00:00:01", "", "", true],
	["datetime-local", "1969-12-31T23:59:59.999", "", "0.001", false],
	["datetime-local", "2024-03-01T00:00", "2024-02-29T23:59", "120", true],
	["datetime-local", "2024-03-01T00:01", "2024-02-29T23:59", "120", false],
])("checks %s value %s min %s step %s", (type, value, min, step, mismatch) => {
	expect(fixture(type, value, { min, step }).validity().stepMismatch).toBe(
		mismatch,
	);
});

it.each(["date", "month", "week", "time", "datetime-local"])(
	"uses min then default value then the epoch as the %s step base",
	(type) => {
		const values: Record<string, [string, string, string]> = {
			date: ["1970-01-01", "1970-01-02", "1970-01-03"],
			month: ["1970-01", "1970-02", "1970-03"],
			week: ["1970-W01", "1970-W02", "1970-W03"],
			time: ["00:00:00", "00:00:01", "00:00:02"],
			"datetime-local": [
				"1970-01-01T00:00:00",
				"1970-01-01T00:00:01",
				"1970-01-01T00:00:02",
			],
		};
		const [first, second, third] = values[type];
		const { tree, id, validity } = fixture(type, second, { step: "2" });
		expect(validity().stepMismatch).toBe(true);
		tree.setAttribute(id, "value", second);
		expect(validity().stepMismatch).toBe(false);
		tree.setAttribute(id, "min", first);
		expect(validity().stepMismatch).toBe(true);
		tree.setAttribute(id, "min", "invalid");
		expect(validity().stepMismatch).toBe(false);
		tree.setAttribute(id, "value", "invalid");
		expect(validity().stepMismatch).toBe(true);
		tree.setControl(id, { value: third });
		expect(validity().stepMismatch).toBe(false);
	},
);

it.each(["00:00", "02:00", "22:00", "23:59:59.999"])(
	"accepts %s inside a midnight-spanning time range",
	(value) => {
		expect(
			fixture("time", value, {
				min: "22:00",
				max: "02:00",
				step: "any",
			}).validity().valid,
		).toBe(true);
	},
);

it.each(["02:00:00.001", "12:00", "21:59:59.999"])(
	"sets both time range flags for %s outside a reversed range",
	(value) => {
		expect(
			fixture("time", value, {
				min: "22:00",
				max: "02:00",
				step: "any",
			}).validity(),
		).toMatchObject({ rangeUnderflow: true, rangeOverflow: true });
	},
);

it("does not wrap the step lattice at midnight", () => {
	expect(
		fixture("time", "01:00", {
			min: "23:00",
			max: "03:00",
			step: "18000",
		}).validity(),
	).toMatchObject({
		rangeUnderflow: false,
		rangeOverflow: false,
		stepMismatch: true,
	});
});

it.each([
	["date", "2024-02-29", "2024-03-01", "2024-02-28"],
	["month", "2024-02", "2024-03", "2024-01"],
	["week", "2024-W02", "2024-W03", "2024-W01"],
	[
		"datetime-local",
		"2024-01-02T00:00",
		"2024-01-03T00:00",
		"2024-01-01T00:00",
	],
])("does not wrap contradictory %s bounds", (type, value, min, max) => {
	expect(
		fixture(type, value, { min, max, step: "any" }).validity(),
	).toMatchObject({ rangeUnderflow: true, rangeOverflow: true });
});

it.each([
	["date", "2024-02-29", "2023-02-29"],
	["month", "2024-02", "2024-13"],
	["week", "2024-W01", "2021-W53"],
	["time", "12:00", "24:00"],
	["datetime-local", "2024-02-29T12:00", "2024-02-29T12:00Z"],
])(
	"ignores invalid %s bounds and inapplicable pattern/length constraints",
	(type, value, invalid) => {
		const { tree, id, validity } = fixture(type, value, {
			min: invalid,
			max: invalid,
			pattern: "(",
			minlength: "999",
			maxlength: "0",
		});
		expect(validity().valid).toBe(true);
		tree.setControl(id, { value: invalid });
		expect(validity().valid).toBe(true);
		tree.setAttribute(id, "required", "");
		expect(validity().valueMissing).toBe(true);
	},
);

it.each(["any", "ANY", "AnY"])("disables stepping for %s", (step) => {
	expect(
		fixture("time", "00:00:00.001", { step }).validity().stepMismatch,
	).toBe(false);
});

it.each(["", "0", "-1", "invalid", "Infinity", "1e999", "1e-999", " any "])(
	"defaults invalid time step %j to sixty seconds",
	(step) => {
		expect(fixture("time", "00:00:01", { step }).validity().stepMismatch).toBe(
			true,
		);
	},
);

it.each([" +1tail", "1.", "1e0", "01"])(
	"parses numeric step prefix %j",
	(step) => {
		expect(fixture("time", "00:00:01", { step }).validity().stepMismatch).toBe(
			false,
		);
	},
);

it.each(["5e-324", "1e-300", "1e300", "1.7976931348623157e308"])(
	"handles extreme finite step %s without overflowing intermediate arithmetic",
	(step) => {
		expect(fixture("time", "00:00", { step }).validity().stepMismatch).toBe(
			false,
		);
		expect(
			fixture("time", "00:00:00.001", { step }).validity().stepMismatch,
		).toBe(Number(step) > 1);
	},
);

it.each(["date", "month", "week", "datetime-local"])(
	"orders large and leading-zero %s years without numeric rounding",
	(type) => {
		const suffix =
			type === "date"
				? "-01-01"
				: type === "month"
					? "-01"
					: type === "week"
						? "-W01"
						: "-01-01T00:00";
		const { tree, id, validity } = fixture(type, `10000${suffix}`, {
			min: `9999${suffix}`,
			step: "any",
		});
		expect(validity().valid).toBe(true);
		tree.setAttribute(id, "max", `010000${suffix}`);
		expect(validity().valid).toBe(true);
		tree.setControl(id, { value: `10001${suffix}` });
		expect(validity().rangeOverflow).toBe(true);
	},
);

it("reduces enormous years in bounded chunks for exact day and month stepping", () => {
	const hugeYear = `1${"0".repeat(99_999)}`;
	expect(
		calendarValidity("date", `${hugeYear}-03-01`, {
			min: `${hugeYear}-02-28`,
			step: "2",
		})?.stepMismatch,
	).toBe(false);
	expect(
		calendarValidity("month", `${hugeYear}-03`, {
			min: `${hugeYear}-01`,
			step: "2",
		})?.stepMismatch,
	).toBe(false);
	expect(
		calendarValidity("date", `${hugeYear}-01-01`, {
			step: "any",
			max: "999999999999999999999-12-31",
		})?.rangeOverflow,
	).toBe(true);
});

it("matches an independent UTC day oracle across two Gregorian cycles", () => {
	for (let year = 1600; year < 2400; year++) {
		for (const month of [1, 3, 12]) {
			const value = `${year}-${String(month).padStart(2, "0")}-01`;
			const milliseconds = Date.UTC(year, month - 1, 1);
			for (const step of [2, 7, 31, 365]) {
				expect(
					calendarValidity("date", value, { step: String(step) })?.stepMismatch,
					`${value}/${step}`,
				).toBe(milliseconds % (step * 86_400_000) !== 0);
			}
		}
	}
});

it.each(["date", "month", "week", "datetime-local"])(
	"matches full-integer arithmetic for a 513-digit %s year",
	(type) => {
		const year = "9".repeat(513);
		const previous = BigInt(year) - 1n;
		const days =
			previous * 365n + previous / 4n - previous / 100n + previous / 400n;
		const weekOffset = 3n - ((days + 3n) % 7n);
		const values = {
			date: {
				value: `${year}-03-01`,
				units: (days + 59n - 719162n) * 86400000n,
				scale: 86400000n,
			},
			month: {
				value: `${year}-03`,
				units: (BigInt(year) - 1970n) * 12n + 2n,
				scale: 1n,
			},
			week: {
				value: `${year}-W01`,
				units: (days + weekOffset - 719162n + 3n) * 86400000n,
				scale: 604800000n,
			},
			"datetime-local": {
				value: `${year}-03-01T12:00:00.123`,
				units: (days + 59n - 719162n) * 86400000n + 43200123n,
				scale: 1000n,
			},
		};
		const entry = values[type as keyof typeof values];
		for (const step of [1n, 2n, 13n, 37n, 365n])
			expect(
				calendarValidity(type, entry.value, { step: String(step) })
					?.stepMismatch,
			).toBe(entry.units % (step * entry.scale) !== 0n);
	},
);

it("matches an independent ISO week oracle across two Gregorian cycles", () => {
	for (let year = 1600; year < 2400; year++) {
		const januaryFourth = new Date(Date.UTC(year, 0, 4));
		const monday =
			januaryFourth.getTime() -
			((januaryFourth.getUTCDay() + 6) % 7) * 86_400_000;
		for (const week of [1, 2, 52]) {
			const value = `${year}-W${String(week).padStart(2, "0")}`;
			const milliseconds = monday + (week - 1) * 604_800_000;
			expect(
				calendarValidity("week", value, { step: "3" })?.stepMismatch,
				value,
			).toBe((milliseconds + 259_200_000) % (3 * 604_800_000) !== 0);
		}
	}
});

it("does not apply a time zone or DST offset to local datetime stepping", () => {
	for (const day of ["2024-03-10", "2024-11-03"])
		expect(
			fixture("datetime-local", `${day}T03:00`, {
				min: `${day}T01:00`,
				step: "7200",
			}).validity().stepMismatch,
		).toBe(false);
	expect(
		fixture("datetime-local", "2024-03-10 03:00:00.000", {
			min: "2024-03-10 01:00",
			step: "7200",
		}).validity().stepMismatch,
	).toBe(false);
});

it("shares live page flags, custom priority and native submission events", () => {
	const { tree, id } = fixture("time", "12:00:01", {
		min: "22:00",
		max: "02:00",
	});
	const form = tree.createElement("form");
	tree.append(tree.root, form);
	tree.append(form, id);
	const events = new DocumentEvents(tree);
	const forms = new DocumentForms(tree, events);
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
	};
	const state = page.validity;
	expect([
		state.rangeUnderflow,
		state.rangeOverflow,
		state.stepMismatch,
	]).toEqual([true, true, true]);
	const seen: string[] = [];
	events.addEventListener(id, "invalid", () => seen.push("invalid"));
	events.addEventListener(form, "submit", () => seen.push("submit"));
	expect(forms.requestSubmit(tree.reference(form)).invalid).toEqual([
		{ reference: tree.reference(id), reason: "range-underflow" },
	]);
	expect(seen).toEqual(["invalid"]);
	tree.setCustomValidity(id, "custom");
	expect(validationMessage(tree, id)).toBe("custom");
	tree.setCustomValidity(id, "");
	page.value = "23:00";
	expect(state.valid).toBe(true);
	expect(page.validity).toBe(state);
	expect(forms.requestSubmit(tree.reference(form)).submission).toBeDefined();
	expect(seen).toEqual(["invalid", "submit"]);
	page.value = "12:00:01";
	tree.setAttribute(id, "disabled", "");
	expect(state.rangeUnderflow).toBe(true);
	expect(forms.checkValidity(tree.reference(form))).toBe(true);
});

function fixture(
	type: string,
	value: string,
	attributes: Record<string, string> = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/");
	documents.push(tree);
	const id = tree.createElement("input", { type, ...attributes });
	tree.append(tree.root, id);
	tree.setControl(id, { value });
	return { tree, id, validity: () => controlValidity(tree, id) };
}

it.each([
	["date", "2024-02-29", "2024-03-01"],
	["month", "2024-02", "2024-03"],
	["week", "2024-W01", "2024-W02"],
	["time", "12:00", "13:00"],
	["datetime-local", "2024-02-29T12:00", "2024-03-01T12:00"],
])("validates %s range constraints", (type, value, min) => {
	const { validity } = fixture(type, value, { min, step: "any" });
	expect(validity()).toMatchObject({
		rangeUnderflow: true,
		rangeOverflow: false,
		stepMismatch: false,
	});
});
