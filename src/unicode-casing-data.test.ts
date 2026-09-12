import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
	unicodeCasingVersion,
	unicodeTitleMappings,
	unicodeConditionalCases,
	unicodeCombiningRanges,
} from "./unicode-casing-data.js";

const hex = (value: string) =>
	[...value]
		.map((character) =>
			(character.codePointAt(0) as number)
				.toString(16)
				.toUpperCase()
				.padStart(4, "0"),
		)
		.join(" ");

const titles = {
	"01C4": "01C5",
	"01C5": "01C5",
	"01C6": "01C5",
	"01C7": "01C8",
	"01C8": "01C8",
	"01C9": "01C8",
	"01CA": "01CB",
	"01CB": "01CB",
	"01CC": "01CB",
	"01F1": "01F2",
	"01F2": "01F2",
	"01F3": "01F2",
	"10D0": "10D0",
	"10D1": "10D1",
	"10D2": "10D2",
	"10D3": "10D3",
	"10D4": "10D4",
	"10D5": "10D5",
	"10D6": "10D6",
	"10D7": "10D7",
	"10D8": "10D8",
	"10D9": "10D9",
	"10DA": "10DA",
	"10DB": "10DB",
	"10DC": "10DC",
	"10DD": "10DD",
	"10DE": "10DE",
	"10DF": "10DF",
	"10E0": "10E0",
	"10E1": "10E1",
	"10E2": "10E2",
	"10E3": "10E3",
	"10E4": "10E4",
	"10E5": "10E5",
	"10E6": "10E6",
	"10E7": "10E7",
	"10E8": "10E8",
	"10E9": "10E9",
	"10EA": "10EA",
	"10EB": "10EB",
	"10EC": "10EC",
	"10ED": "10ED",
	"10EE": "10EE",
	"10EF": "10EF",
	"10F0": "10F0",
	"10F1": "10F1",
	"10F2": "10F2",
	"10F3": "10F3",
	"10F4": "10F4",
	"10F5": "10F5",
	"10F6": "10F6",
	"10F7": "10F7",
	"10F8": "10F8",
	"10F9": "10F9",
	"10FA": "10FA",
	"10FD": "10FD",
	"10FE": "10FE",
	"10FF": "10FF",
	"00DF": "0053 0073",
	"0130": "0130",
	FB00: "0046 0066",
	FB01: "0046 0069",
	FB02: "0046 006C",
	FB03: "0046 0066 0069",
	FB04: "0046 0066 006C",
	FB05: "0053 0074",
	FB06: "0053 0074",
	"0587": "0535 0582",
	FB13: "0544 0576",
	FB14: "0544 0565",
	FB15: "0544 056B",
	FB16: "054E 0576",
	FB17: "0544 056D",
	"0149": "02BC 004E",
	"0390": "0399 0308 0301",
	"03B0": "03A5 0308 0301",
	"01F0": "004A 030C",
	"1E96": "0048 0331",
	"1E97": "0054 0308",
	"1E98": "0057 030A",
	"1E99": "0059 030A",
	"1E9A": "0041 02BE",
	"1F50": "03A5 0313",
	"1F52": "03A5 0313 0300",
	"1F54": "03A5 0313 0301",
	"1F56": "03A5 0313 0342",
	"1FB6": "0391 0342",
	"1FC6": "0397 0342",
	"1FD2": "0399 0308 0300",
	"1FD3": "0399 0308 0301",
	"1FD6": "0399 0342",
	"1FD7": "0399 0308 0342",
	"1FE2": "03A5 0308 0300",
	"1FE3": "03A5 0308 0301",
	"1FE4": "03A1 0313",
	"1FE6": "03A5 0342",
	"1FE7": "03A5 0308 0342",
	"1FF6": "03A9 0342",
	"1F80": "1F88",
	"1F81": "1F89",
	"1F82": "1F8A",
	"1F83": "1F8B",
	"1F84": "1F8C",
	"1F85": "1F8D",
	"1F86": "1F8E",
	"1F87": "1F8F",
	"1F88": "1F88",
	"1F89": "1F89",
	"1F8A": "1F8A",
	"1F8B": "1F8B",
	"1F8C": "1F8C",
	"1F8D": "1F8D",
	"1F8E": "1F8E",
	"1F8F": "1F8F",
	"1F90": "1F98",
	"1F91": "1F99",
	"1F92": "1F9A",
	"1F93": "1F9B",
	"1F94": "1F9C",
	"1F95": "1F9D",
	"1F96": "1F9E",
	"1F97": "1F9F",
	"1F98": "1F98",
	"1F99": "1F99",
	"1F9A": "1F9A",
	"1F9B": "1F9B",
	"1F9C": "1F9C",
	"1F9D": "1F9D",
	"1F9E": "1F9E",
	"1F9F": "1F9F",
	"1FA0": "1FA8",
	"1FA1": "1FA9",
	"1FA2": "1FAA",
	"1FA3": "1FAB",
	"1FA4": "1FAC",
	"1FA5": "1FAD",
	"1FA6": "1FAE",
	"1FA7": "1FAF",
	"1FA8": "1FA8",
	"1FA9": "1FA9",
	"1FAA": "1FAA",
	"1FAB": "1FAB",
	"1FAC": "1FAC",
	"1FAD": "1FAD",
	"1FAE": "1FAE",
	"1FAF": "1FAF",
	"1FB3": "1FBC",
	"1FBC": "1FBC",
	"1FC3": "1FCC",
	"1FCC": "1FCC",
	"1FF3": "1FFC",
	"1FFC": "1FFC",
	"1FB2": "1FBA 0345",
	"1FB4": "0386 0345",
	"1FC2": "1FCA 0345",
	"1FC4": "0389 0345",
	"1FF2": "1FFA 0345",
	"1FF4": "038F 0345",
	"1FB7": "0391 0342 0345",
	"1FC7": "0397 0342 0345",
	"1FF7": "03A9 0342 0345",
};

it.each(Object.entries(titles))(
	"preserves captured Unicode16 titlecase U+%s",
	(point, expected) => {
		expect(hex(unicodeTitleMappings[Number.parseInt(point, 16)])).toBe(
			expected,
		);
	},
);

it.each([
	{
		codePoint: 931,
		lower: "03C2",
		title: "03A3",
		upper: "03A3",
		conditions: ["Final_Sigma"],
	},
	{
		codePoint: 775,
		lower: "0307",
		title: "",
		upper: "",
		conditions: ["lt", "After_Soft_Dotted"],
	},
	{
		codePoint: 73,
		lower: "0069 0307",
		title: "0049",
		upper: "0049",
		conditions: ["lt", "More_Above"],
	},
	{
		codePoint: 74,
		lower: "006A 0307",
		title: "004A",
		upper: "004A",
		conditions: ["lt", "More_Above"],
	},
	{
		codePoint: 302,
		lower: "012F 0307",
		title: "012E",
		upper: "012E",
		conditions: ["lt", "More_Above"],
	},
	{
		codePoint: 204,
		lower: "0069 0307 0300",
		title: "00CC",
		upper: "00CC",
		conditions: ["lt"],
	},
	{
		codePoint: 205,
		lower: "0069 0307 0301",
		title: "00CD",
		upper: "00CD",
		conditions: ["lt"],
	},
	{
		codePoint: 296,
		lower: "0069 0307 0303",
		title: "0128",
		upper: "0128",
		conditions: ["lt"],
	},
	{
		codePoint: 304,
		lower: "0069",
		title: "0130",
		upper: "0130",
		conditions: ["tr"],
	},
	{
		codePoint: 304,
		lower: "0069",
		title: "0130",
		upper: "0130",
		conditions: ["az"],
	},
	{
		codePoint: 775,
		lower: "",
		title: "0307",
		upper: "0307",
		conditions: ["tr", "After_I"],
	},
	{
		codePoint: 775,
		lower: "",
		title: "0307",
		upper: "0307",
		conditions: ["az", "After_I"],
	},
	{
		codePoint: 73,
		lower: "0131",
		title: "0049",
		upper: "0049",
		conditions: ["tr", "Not_Before_Dot"],
	},
	{
		codePoint: 73,
		lower: "0131",
		title: "0049",
		upper: "0049",
		conditions: ["az", "Not_Before_Dot"],
	},
	{
		codePoint: 105,
		lower: "0069",
		title: "0130",
		upper: "0130",
		conditions: ["tr"],
	},
	{
		codePoint: 105,
		lower: "0069",
		title: "0130",
		upper: "0130",
		conditions: ["az"],
	},
])("preserves conditional casing $codePoint with $conditions", (expected) => {
	const actual = unicodeConditionalCases.find(
		(row) =>
			row.codePoint === expected.codePoint &&
			row.conditions.join(" ") === expected.conditions.join(" "),
	);
	expect(actual).toBeDefined();
	if (!actual) throw new Error("Missing Unicode conditional case");
	expect(hex(actual.lower)).toBe(expected.lower);
	expect(hex(actual.title)).toBe(expected.title);
	expect(hex(actual.upper)).toBe(expected.upper);
	expect(Object.isFrozen(actual)).toBe(true);
	expect(Object.isFrozen(actual.conditions)).toBe(true);
});

it("pins all compressed combining classes to captured UnicodeData16", () => {
	expect(unicodeCombiningRanges).toHaveLength(323);
	expect(
		createHash("sha256")
			.update(JSON.stringify(unicodeCombiningRanges))
			.digest("hex"),
	).toBe("655a20fd6b3d0f91232d638ffa9f6b702839b4ccaac08a62638a48c21966379f");
	expect(Object.isFrozen(unicodeCombiningRanges)).toBe(true);
	for (const range of unicodeCombiningRanges)
		expect(Object.isFrozen(range)).toBe(true);
});

it("retains the bounded immutable Unicode16 mapping inventory", () => {
	expect(unicodeCasingVersion).toBe("16.0.0");
	expect(Object.keys(unicodeTitleMappings)).toHaveLength(161);
	expect(unicodeConditionalCases).toHaveLength(16);
	expect(Object.isFrozen(unicodeTitleMappings)).toBe(true);
	expect(Object.isFrozen(unicodeConditionalCases)).toBe(true);
});
