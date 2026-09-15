import { afterEach, expect, it, vi } from "vitest";
import { utf8ByteLength } from "./utf8-byte-length.js";

const encoder = new TextEncoder();
const examples = [
	["empty text", ""],
	["ASCII", "Hello, world! 0123456789"],
	[
		"all ASCII code units",
		String.fromCharCode(...Array.from({ length: 128 }, (_, index) => index)),
	],
	["controls", "\0\x01\b\t\n\v\f\r\x1f\x7f"],
	["quotes and backslashes", "\"'`\\</script>"],
	["two-byte boundaries", "\u0080\u07ff"],
	["two-byte text", "café Ελληνικά Привет"],
	["three-byte boundaries", "\u0800\ud7ff\ue000\uffff"],
	["three-byte text", "中文 日本語 한국어 हन"],
	["combining marks", "e\u0301 a\u0308\u0301"],
	["byte order mark", "\ufefftext\ufeff"],
	["lowest surrogate pair", "\ud800\udc00"],
	["highest surrogate pair", "\udbff\udfff"],
	["crossed surrogate boundaries", "\ud800\udfff\udbff\udc00"],
	["emoji pairs", "😀🚀🌍"],
	["emoji sequences", "👩 🇵 ❤"],
	["lone lowest high surrogate", "\ud800"],
	["lone highest high surrogate", "\udbff"],
	["lone lowest low surrogate", "\udc00"],
	["lone highest low surrogate", "\udfff"],
	["reversed surrogates", "\udc00\ud800"],
	["reversed boundary surrogates", "\udfff\udbff"],
	["consecutive high surrogates", "\ud800\udbff\ud800"],
	["consecutive low surrogates", "\udc00\udfff\udc00"],
	["high surrogate before a pair", "\ud800\ud800\udc00"],
	["low surrogate after a pair", "\ud800\udc00\udfff"],
	["pair between lone surrogates", "\udfff\ud800\udc00\udbff"],
	["ASCII between surrogates", "\ud800A\udc00"],
	["Unicode between surrogates", "\ud800é\udc00中\udbff"],
	["surrogates at text boundaries", "\udc00text\ud800"],
	["CRLF", "\r\n"],
	["mixed line endings", "first\r\nsecond\nthird\rlast\r\n"],
	["CRLF between surrogates", "\ud800\r\n\udc00"],
	[
		"multilingual mixed text",
		"Hello café Ελληνικά Привет 中文 日本語 한국어 العربية हन 😀👩\r\n\0\ud800end\udfff",
	],
] as const;

const longExamples = [
	["ASCII", "plain ASCII 0123456789\t\r\n".repeat(16384)],
	["two-byte text", "éΩЖ\u0080\u07ff".repeat(16384)],
	["three-byte text", "中文한\u0800\uffff".repeat(16384)],
	["surrogate pairs", "😀\ud800\udc00\udbff\udfff".repeat(16384)],
	["lone high surrogates", "\ud800".repeat(65536)],
	["lone low surrogates", "\udfff".repeat(65536)],
	["pairs across repeated chunks", "\udc00\ud800".repeat(32768)],
	["mixed text", "ASCII café 中文 👩\r\n\0\ud800x\udfff".repeat(8192)],
	["trailing high surrogate", `${"a".repeat(65535)}\ud800`],
] as const;

afterEach(() => {
	vi.restoreAllMocks();
});

it.each(examples)("counts UTF-8 bytes for %s", (_name, value) => {
	expect(utf8ByteLength(value)).toBe(encoder.encode(value).byteLength);
});

it("matches TextEncoder for every individual UTF-16 code unit", () => {
	for (let codeUnit = 0; codeUnit <= 0xffff; codeUnit++) {
		const value = String.fromCharCode(codeUnit);
		expect(utf8ByteLength(value), `code unit 0x${codeUnit.toString(16)}`).toBe(
			encoder.encode(value).byteLength,
		);
	}
});

it("handles every pairing of UTF-8 and surrogate boundary code units", () => {
	const boundaries = [
		0x0000, 0x007f, 0x0080, 0x07ff, 0x0800, 0xd7ff, 0xd800, 0xdbff, 0xdc00,
		0xdfff, 0xe000, 0xffff,
	];
	for (const first of boundaries) {
		for (const second of boundaries) {
			const value = String.fromCharCode(first, second);
			expect(
				utf8ByteLength(value),
				`code units 0x${first.toString(16)}, 0x${second.toString(16)}`,
			).toBe(encoder.encode(value).byteLength);
		}
	}
});

it("matches TextEncoder for deterministic mixed generated sequences", () => {
	let state = 0x15_09_2026;
	function next() {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state >>> 8;
	}
	const fragments = [
		"\0",
		"\r\n",
		"\"'\\",
		"é",
		"Ω",
		"中",
		"e\u0301",
		"😀",
		"👩",
		"\ud800",
		"\udbff",
		"\udc00",
		"\udfff",
		"\udc00\ud800",
	];
	for (let sample = 0; sample < 512; sample++) {
		let value = "";
		const length = next() % 257;
		for (let index = 0; index < length; index++) {
			if (index % 3 === 0) value += String.fromCharCode(next() & 0xffff);
			else if (index % 3 === 1) value += fragments[next() % fragments.length];
			else value += String.fromCodePoint(next() % 0x110000);
		}
		expect(utf8ByteLength(value), `generated sample ${sample}`).toBe(
			encoder.encode(value).byteLength,
		);
	}
});

it.each(longExamples)("counts UTF-8 bytes for long %s", (_name, value) => {
	expect(utf8ByteLength(value)).toBe(encoder.encode(value).byteLength);
});

it("counts bytes without calling TextEncoder encoding methods", () => {
	const expected = [...examples, ...longExamples].map(([name, value]) => ({
		name,
		value,
		bytes: encoder.encode(value).byteLength,
	}));
	const encode = vi
		.spyOn(TextEncoder.prototype, "encode")
		.mockImplementation(() => {
			throw new Error("utf8ByteLength must not allocate an encoded byte array");
		});
	const encodeInto = vi
		.spyOn(TextEncoder.prototype, "encodeInto")
		.mockImplementation(() => {
			throw new Error("utf8ByteLength must not encode into a byte array");
		});
	for (const { name, value, bytes } of expected) {
		expect(utf8ByteLength(value), name).toBe(bytes);
	}
	expect(encode).not.toHaveBeenCalled();
	expect(encodeInto).not.toHaveBeenCalled();
});
