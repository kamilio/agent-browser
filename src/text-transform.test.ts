import { expect, it } from "vitest";
import { planTextTransforms, textTransformLimits } from "./text-transform.js";

function transformed(text: string, transform: string, language?: string) {
	const changes = planTextTransforms(
		[{ id: 0, text, transform, language }],
		() => {},
	).get(0);
	let offset = 0;
	let output = "";
	for (const character of text) {
		output += changes?.get(offset) ?? character;
		offset += character.length;
	}
	return output;
}

it.each([
	["straße", "uppercase", undefined, "STRASSE"],
	["ﬃ", "uppercase", undefined, "FFI"],
	["İ", "lowercase", undefined, "i\u0307"],
	["ΟΣ", "lowercase", undefined, "ος"],
	["ΟΣΑ", "lowercase", undefined, "οσα"],
	["(ΑΣ)", "lowercase", undefined, "(ας)"],
	["Σ", "lowercase", undefined, "σ"],
	["AΣ\u0345", "lowercase", undefined, "aς\u0345"],
	["AΣ'B", "lowercase", undefined, "aσ'b"],
	["Iİiı", "lowercase", "tr", "ıiiı"],
	["Iİiı", "uppercase", "tr-Latn-TR", "IİİI"],
	["Iİiı", "lowercase", "az", "ıiiı"],
	["I\u0307", "lowercase", "tr", "i"],
	["I\u0323\u0307", "lowercase", "tr", "i\u0323"],
	["I\u0301\u0307", "lowercase", "tr", "ı\u0301\u0307"],
	["I\u0301", "lowercase", "lt", "i\u0307\u0301"],
	["J\u0323\u0301", "lowercase", "lt", "j\u0307\u0323\u0301"],
	["ÌÍĨ", "lowercase", "lt", "i\u0307\u0300i\u0307\u0301i\u0307\u0303"],
	["i\u0307", "uppercase", "lt", "I"],
	["i\u0323\u0307", "uppercase", "lt", "I\u0323"],
	["i\u0301\u0307", "uppercase", "lt", "I\u0301\u0307"],
	["I\u0307", "uppercase", "lt", "I\u0307"],
	["I", "lowercase", "", "i"],
	["I", "lowercase", "\u00a0tr", "i"],
	["ß ﬃ ǆ ᾀ", "capitalize", undefined, "Ss Ffi ǅ ᾈ"],
	["hELLO wORLD", "capitalize", undefined, "HELLO WORLD"],
	["3d printer", "capitalize", undefined, "3d Printer"],
	["foo-bar l'amour", "capitalize", undefined, "Foo-Bar L'amour"],
	["i\u0307 j\u0307", "capitalize", "lt", "I J"],
	["istanbul", "capitalize", "tr", "İstanbul"],
	["MiXeD ß", "none", "tr", "MiXeD ß"],
])("maps %s with %s and language %s", (source, mode, language, expected) => {
	expect(transformed(source as string, mode as string, language)).toBe(
		expected,
	);
});

it("keeps contextual casing and capitalized words across input-node boundaries", () => {
	const changes = planTextTransforms(
		[
			{ id: 1, text: "foo", transform: "capitalize" },
			{ id: 2, text: "bar ", transform: "capitalize" },
			{ id: 3, text: "Ο", transform: "lowercase" },
			{ id: 4, text: "Σ", transform: "lowercase" },
		],
		() => {},
	);
	expect(changes.get(1)?.get(0)).toBe("F");
	expect(changes.get(2)).toBeUndefined();
	expect(changes.get(3)?.get(0)).toBe("ο");
	expect(changes.get(4)?.get(0)).toBe("ς");
});

it("retains source offsets for cross-node conditional deletions", () => {
	const changes = planTextTransforms(
		[
			{ id: 1, text: "I", transform: "lowercase", language: "tr" },
			{ id: 2, text: "\u0307", transform: "lowercase", language: "tr" },
		],
		() => {},
	);
	expect(changes.get(1)?.get(0)).toBe("i");
	expect(changes.get(2)?.get(0)).toBe("");
});

it("does not recase transformed output or override a none source run", () => {
	const changes = planTextTransforms(
		[
			{ id: 1, text: "f", transform: "none" },
			{ id: 2, text: "oo ", transform: "capitalize" },
			{ id: 3, text: "ß", transform: "capitalize" },
		],
		() => {},
	);
	expect(changes.get(1)).toBeUndefined();
	expect(changes.get(2)).toBeUndefined();
	expect(changes.get(3)?.get(0)).toBe("Ss");
});

it("resets word and conditional context at explicit in-flow boundaries", () => {
	const changes = planTextTransforms(
		[
			{ id: 1, text: "foo", transform: "capitalize" },
			null,
			{ id: 2, text: "bar", transform: "capitalize" },
			null,
			{ id: 3, text: "Σ", transform: "lowercase" },
		],
		() => {},
	);
	expect(changes.get(2)?.get(0)).toBe("B");
	expect(changes.get(3)?.get(0)).toBe("σ");
});

it.each(["full-width", "full-size-kana", "uppercase full-width", "unknown"])(
	"keeps unsupported rendering mode %s explicit",
	(transform) => {
		expect(() => transformed("text", transform)).toThrow(
			"mode is not supported",
		);
	},
);

it("bounds source size, input count and caller work without retaining failed state", () => {
	expect(() =>
		transformed(
			"a".repeat(textTransformLimits.maxInputCodeUnits + 1),
			"uppercase",
		),
	).toThrow("source limit");
	expect(() =>
		planTextTransforms(
			Array(textTransformLimits.maxInputs + 1).fill(null),
			() => {},
		),
	).toThrow("input limit");
	let work = 0;
	expect(() =>
		planTextTransforms(
			[{ id: 1, text: "capitalize this", transform: "capitalize" }],
			(units = 1) => {
				work += units;
				if (work > 10) throw new Error("bounded work");
			},
		),
	).toThrow("bounded work");
	expect(transformed("ß", "uppercase")).toBe("SS");
});

it("rejects duplicate source owners without changing input objects", () => {
	const input = Object.freeze({ id: 1, text: "ß", transform: "uppercase" });
	expect(() => planTextTransforms([input, input], () => {})).toThrow(
		"Invalid text transformation source",
	);
	expect([...(planTextTransforms([input], () => {}).get(1) ?? [])]).toEqual([
		[0, "SS"],
	]);
	expect(input.text).toBe("ß");
});
