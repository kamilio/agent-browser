import { expect, it } from "vitest";
import { compileSearchPattern } from "./search-pattern.js";

const cases: [string, string, boolean][] = [
	["cart", "Add to cart", true],
	["Cart", "Add to cart", false],
	["/cart/i", "Add to CART", true],
	["/sign (in|up)/i", "button SIGN UP", true],
	["\\$[0-9]+\\.[0-9]{2}", "Price $12.34", true],
	["^a+$", "aaaa", true],
	["^a+$", "baa", false],
	["a?b", "b", true],
	["a*b", "aaab", true],
	["a{2,4}", "a", false],
	["a{2,4}", "aaa", true],
	["a{2,}", "aaaaa", true],
	["(?:ab|cd)+", "abcd", true],
	["(a|)b", "b", true],
	["(a?)*b", "aaab", true],
	["a+?b", "aaab", true],
	["[A-Z]+", "abc", false],
	["/[A-Z]+/i", "abc", true],
	["[^a-c]+", "abc", false],
	["[a-z-]+", "-", true],
	["[\\d]+", "123", true],
	["[\\D]", "9", false],
	["\\w+\\s\\d+", "abc_ 123", true],
	["\\bcat\\b", "cat!", true],
	["\\bcat\\b", "scatter", false],
	["\\Bcat", "scatter", true],
	["[]", "a", false],
	["[^]", "\n", true],
	["/a.b/s", "a\nb", true],
	["a.b", "a\nb", false],
	["/^b/m", "a\nb", true],
	["a$", "a\r\n", false],
	["/a$/m", "a\r\n", true],
	["\\x41\\u0042", "AB", true],
	["\\[x\\]", "[x]", true],
	["", "", true],
	["a{0}", "", true],
];
it.each(cases)("matches %s against %s", (pattern, text, expected) => {
	expect(compileSearchPattern(pattern).test(text)).toBe(expected);
});

it("agrees with native RegExp on a bounded, trusted regular-language corpus", () => {
	const patterns = [
		"a",
		"a|b",
		"ab*",
		"a+b?",
		"(a|b){1,3}",
		"(?:a?)*",
		"^ab$",
		"a$",
		"[^ab]",
		"[A-z]",
		"[\\w-]+",
		"\\b(a|b)\\b",
		"\\Ba",
		"a.*b",
		"a{0,2}b",
	];
	const texts = [
		"",
		"a",
		"b",
		"ab",
		"aaa",
		"ababa",
		"bba",
		"c",
		"AB",
		"[",
		"_",
		"a b",
		"\na",
		"a\n",
		"a\r\n",
	];
	for (const pattern of patterns)
		for (const flags of ["", "i", "m", "s"]) {
			const matcher = compileSearchPattern(`/${pattern}/${flags}`);
			const reference = new RegExp(pattern, flags);
			for (const text of texts)
				expect(
					matcher.test(text),
					`${pattern}/${flags}: ${JSON.stringify(text)}`,
				).toBe(reference.test(text));
		}
});

it("does not backtrack exponentially on nested ambiguous repetition", () => {
	const work = { remaining: 500_000 };
	expect(compileSearchPattern("(a+)+b").test("a".repeat(10_000), work)).toBe(
		false,
	);
	expect(work.remaining).toBeGreaterThan(0);
});

it("shares and enforces work limits across calls", () => {
	const matcher = compileSearchPattern("absent");
	const work = { remaining: 20 };
	expect(matcher.test("short", work)).toBe(false);
	expect(() => matcher.test("x".repeat(50), work)).toThrow(/work limit/);
});

it.each(["[", "(", "a{2,1}", "a**", "[z-a]", "\\x1", "a{", "a{2", "\\"])(
	"rejects malformed pattern %s",
	(pattern) => {
		expect(() => compileSearchPattern(pattern)).toThrow(/Invalid/);
	},
);

it.each([
	"(a)\\1",
	"(?=a)",
	"(?<=a)b",
	"(?<name>a)",
	"\\p{L}",
	"/x/u",
	"/x/g",
	"/x/ii",
])("rejects unsupported pattern %s", (pattern) => {
	expect(() => compileSearchPattern(pattern)).toThrow(
		/not implemented|supports only/,
	);
});

it("bounds source length, recursion, repetition expansion and automaton states", () => {
	expect(() => compileSearchPattern("a".repeat(1025))).toThrow(/1024/);
	expect(() =>
		compileSearchPattern(`${"(".repeat(33)}a${")".repeat(33)}`),
	).toThrow(/nesting/);
	expect(() => compileSearchPattern("a{129}")).toThrow(/repetition/);
	expect(() => compileSearchPattern("(a{128}){128}")).toThrow(/state limit/);
	expect(() => compileSearchPattern("((?:){128}){128}")).toThrow(
		/compilation work/,
	);
});
