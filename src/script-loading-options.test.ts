import { expect, it, vi } from "vitest";
import { scriptLoadingSelection } from "./script-loading-options.js";

it("preserves omitted loading options and snapshots explicit finite bounds", () => {
	expect(scriptLoadingSelection({})).toBeUndefined();
	expect(scriptLoadingSelection({ scriptLoading: undefined })).toBeUndefined();
	const input = { maxExternal: 32, maxSourceBytes: 4_000_000 };
	const result = scriptLoadingSelection({ scriptLoading: input });
	input.maxExternal = 64;
	expect(result).toEqual({ maxExternal: 32, maxSourceBytes: 4_000_000 });
	expect(Object.isFrozen(result)).toBe(true);
	expect(
		scriptLoadingSelection({ scriptLoading: Object.create(null) }),
	).toEqual({});
});

it.each([
	["maxScripts", 256],
	["maxExternal", 64],
	["maxSourceBytes", 8_388_608],
	["navigationTimeoutMs", 300_000],
] as const)("bounds %s independently", (name, maximum) => {
	for (const value of [1, maximum])
		expect(
			scriptLoadingSelection({ scriptLoading: { [name]: value } }),
		).toEqual({ [name]: value });
	for (const value of [
		0,
		-1,
		1.5,
		maximum + 1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		"16",
		undefined,
		null,
	])
		expect(() =>
			scriptLoadingSelection({ scriptLoading: { [name]: value } }),
		).toThrow(/Invalid script loading/);
});

it.each([
	null,
	[],
	true,
	5,
	"large",
	{ modules: true },
	{ extra: 1 },
	{ [Symbol("hidden")]: 1 },
])("rejects invalid loading shape %#", (scriptLoading) =>
	expect(() => scriptLoadingSelection({ scriptLoading })).toThrow(
		/Invalid script loading/,
	),
);

it("rejects inherited and accessor configuration without evaluating it", () => {
	const getter = vi.fn(() => 32);
	for (const input of [
		Object.create({ scriptLoading: {} }),
		Object.defineProperty({}, "scriptLoading", {
			enumerable: true,
			get: getter,
		}),
		{ scriptLoading: Object.create({ maxExternal: 32 }) },
		{
			scriptLoading: Object.defineProperty({}, "maxExternal", {
				enumerable: true,
				get: getter,
			}),
		},
		{ scriptLoading: Object.defineProperty({}, "maxExternal", { value: 32 }) },
	])
		expect(() => scriptLoadingSelection(input)).toThrow(
			/Invalid script loading/,
		);
	expect(getter).not.toHaveBeenCalled();
});
