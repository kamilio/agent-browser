import { expect, it } from "vitest";
import { parseCssContent } from "./css-content.js";

it.each([
	["normal", "normal"],
	["NONE", "none"],
	["NoRmAl", "normal"],
	["\t\r\n\f none \t", "none"],
	["/* before */NORMAL/**/", "normal"],
	[String.raw`n\6f ne`, "none"],
	[String.raw`\4e ORMAL`, "normal"],
	[String.raw`\00006eone`, "none"],
])("normalizes the entire keyword %j", (source, value) => {
	expect(parseCssContent(source)).toEqual({ value, text: null });
	expect(Object.isFrozen(parseCssContent(source))).toBe(true);
});

it.each([
	['""', ""],
	["''", ""],
	["\"\" /**/ ''", ""],
	['"Hello"', "Hello"],
	["'MiXeD CaSe'", "MiXeD CaSe"],
	['" a  b\t c "', " a  b\t c "],
	["\"a\"'B'", "aB"],
	['"a" \t\r\n\f "b" \' c\'', "ab c"],
	['/* before */"a"/* between */"B"/* after */', "aB"],
	['"/* literal */ // text"', "/* literal */ // text"],
	['"unterminated /* inside string"', "unterminated /* inside string"],
	['"a"/* " \\ \n \' */"b"', "ab"],
	['"none" "normal" "var(--x)"', "nonenormalvar(--x)"],
	['"!important / attr(title)"', "!important / attr(title)"],
	['"É 中 😀 e\u0301"', "É 中 😀 e\u0301"],
	['"\u00a0\u2028\u2029\ufeff"', "\u00a0\u2028\u2029\ufeff"],
	['"\0"', "\ufffd"],
	['"\ud800x\udfff"', "\ufffdx\ufffd"],
	['"\\\0\\\ud800"', "\ufffd\ufffd"],
	['"\\😀"', "😀"],
])("preserves generated text from %j", (source, text) => {
	const parsed = parseCssContent(source);
	expect(parsed?.text).toBe(text);
	expect(Object.isFrozen(parsed)).toBe(true);
	expect(parseCssContent(parsed?.value ?? "")).toEqual(parsed);
});

it.each([
	[String.raw`"\41\042\0043\00044\000045\000046"`, "ABCDEF"],
	[String.raw`"\000041B"`, "AB"],
	[String.raw`"\41 B"`, "AB"],
	[String.raw`"\41  B"`, "A B"],
	['"\\41\tB"', "AB"],
	['"\\41\nB"', "AB"],
	['"\\41\rB"', "AB"],
	['"\\41\r\nB"', "AB"],
	['"\\41\fB"', "AB"],
	[String.raw`"\1f600 \10FFFF"`, "😀\u{10ffff}"],
	[String.raw`"\0\d800\DFFF\110000\ffffff"`, "\ufffd".repeat(5)],
	[String.raw`"\0000000"`, "\ufffd0"],
	[String.raw`"\a \d \c "`, "\n\r\f"],
	[String.raw`"\n\r\t\g"`, "nrtg"],
	[String.raw`"\"\\\'"`, "\"\\'"],
	[String.raw`'\'\"\\'`, "'\"\\"],
	[String.raw`"\/* literal */"`, "/* literal */"],
	['"a\\\nb"', "ab"],
	['"a\\\rb"', "ab"],
	['"a\\\r\nb"', "ab"],
	['"a\\\fb"', "ab"],
	['"\\\n"', ""],
])("decodes CSS string escapes in %j", (source, text) => {
	const parsed = parseCssContent(source);
	expect(parsed?.text).toBe(text);
	expect(parseCssContent(parsed?.value ?? "")).toEqual(parsed);
});

it.each([
	"",
	" \n\t\r\f ",
	"/**/",
	"/* unterminated",
	"normal /* unterminated",
	'"valid" /* unterminated',
	'"valid" /* closed */ /* unterminated',
	'"unterminated',
	"'unterminated",
	'"trailing\\',
	'"escaped closing quote\\"',
	'"valid" "unterminated',
	'"a\nb"',
	'"a\rb"',
	'"a\r\nb"',
	'"a\fb"',
	'"\\41\r\n\nb"',
	'"\\\\\n"',
	"normal\\",
	"no\\\nne",
	"no/**/ne",
	"nor mal",
	"normal none",
	'none "text"',
	'"text" normal',
	'"text" none',
	'"text" trailing',
	'"text";',
	'"text" !important',
	"normal!important",
	"inherit",
	"initial",
	"unset",
	"revert",
	"revert-layer",
	"var(--content)",
	'"text" var(--content)',
	"url(image.png)",
	"attr(title)",
	"counter(item)",
	'counters(item, ".")',
	"open-quote",
	"close-quote",
	"no-open-quote",
	"no-close-quote",
	'"text" open-quote',
	'"text" / "alternative"',
	'"text", "more"',
	'("text")',
	'"text"{}',
	"123",
	"normal()",
	"normality",
	"none-",
	"\\6e one extra",
	'\u00a0"text"',
	'"text"\u00a0',
	'"a"\u2028"b"',
	'"a"\v"b"',
	'"a"\0',
	'"a"\\',
	'"a"//comment',
])("rejects malformed or unsupported whole values %j", (source) => {
	expect(parseCssContent(source)).toBeUndefined();
});

it.each([
	["'a' 'B'", '"aB"'],
	[String.raw`'"\'\\'`, String.raw`"\"'\\"`],
	[String.raw`"\a a"`, String.raw`"\a a"`],
	[String.raw`"\a  a"`, String.raw`"\a  a"`],
	[String.raw`"\d \c \9 \7f "`, String.raw`"\d \c \9 \7f "`],
	['"a\tb"', String.raw`"a\9 b"`],
])("serializes %j as canonical CSS, not JSON", (source, value) => {
	const parsed = parseCssContent(source);
	expect(parsed?.value).toBe(value);
	expect(parseCssContent(value)).toEqual(parsed);
});

it("round-trips every ASCII code point through CSS serialization", () => {
	for (let code = 0; code <= 0x7f; code++) {
		const source = `"\\${code.toString(16)} "`;
		const parsed = parseCssContent(source);
		expect(parsed?.text).toBe(String.fromCodePoint(code || 0xfffd));
		expect(parseCssContent(parsed?.value ?? "")).toEqual(parsed);
	}
});

it("handles long strings and many tokens without recursive parsing", () => {
	const text = "a😀".repeat(20_000);
	expect(parseCssContent(`"${text}"`)?.text).toBe(text);
	expect(parseCssContent('"a"/**/'.repeat(20_000))?.text).toBe(
		"a".repeat(20_000),
	);
	expect(
		parseCssContent(`${'"a"/**/'.repeat(20_000)}attr(title)`),
	).toBeUndefined();
});
