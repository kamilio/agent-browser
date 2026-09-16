import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type JsonSourceSelection,
	jsonSourceSelectionLimits,
	selectJsonSource,
	validateJsonSourcePointer,
} from "./json-source-selection.js";

function errorCode(action: () => unknown, code: string) {
	expect(action).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
}

it("selects exact UTF-16 spans with frozen metadata and internal whitespace intact", () => {
	const literal =
		'{ "requires_python" : ">=3.8",\n "count": 9007199254740993 }';
	const source = ` \r\n{ "before":"😀", "info" : \t${literal} , "after":null }\t`;
	const result = selectJsonSource(source, "/info");
	const start = source.indexOf(literal);
	expect(result.text).toBe(literal);
	expect(result.metadata).toEqual({
		kind: "json-source-selection-v1",
		method: "json-pointer",
		pointer: "/info",
		start,
		end: start + literal.length,
		sourceCodeUnits: source.length,
		selectedCodeUnits: literal.length,
		offsetBasis: "document-text-utf16",
		valueKind: "object",
		duplicateMembers: "rejected",
	});
	expect(Object.isFrozen(result.metadata)).toBe(true);
	expect(source.slice(result.metadata.start, result.metadata.end)).toBe(
		literal,
	);
	expect(selectJsonSource(source, "/info/requires_python").text).toBe(
		'">=3.8"',
	);
});

it("selects every value kind at the root and inside objects and arrays", () => {
	const cases: [string, JsonSourceSelection["valueKind"]][] = [
		['{ "nested": [1, 2] }', "object"],
		["[ 0,\ttrue, null ]", "array"],
		['""', "string"],
		['"escaped\\ntext"', "string"],
		["-12.3400e+05", "number"],
		["true", "boolean"],
		["false", "boolean"],
		["null", "null"],
	];
	for (const [literal, valueKind] of cases) {
		for (const [source, pointer] of [
			[` \t\r\n${literal}\r\n `, ""],
			[`{"value": ${literal} }`, "/value"],
			[`[false, ${literal}, true]`, "/1"],
		]) {
			const result = selectJsonSource(source, pointer);
			expect(result.text).toBe(literal);
			expect(result.metadata.valueKind).toBe(valueKind);
			expect(source.slice(result.metadata.start, result.metadata.end)).toBe(
				literal,
			);
		}
	}
});

it("preserves unsafe integers, signed zero, precision and out-of-range exponents", () => {
	const literals = [
		"0",
		"-0",
		"-0.0000E-000",
		"9007199254740993",
		"-1234567890123456789012345678901234567890",
		"0.123456789012345678901234567890",
		"1e999999",
		"1E+00000999",
		"1e-999999",
	];
	const source = `[${literals.join(", ")}]`;
	for (const [index, literal] of literals.entries()) {
		expect(selectJsonSource(source, `/${index}`).text).toBe(literal);
	}
});

it("unescapes pointer segments once and treats Unicode, empty and percent keys literally", () => {
	const source = String.raw`{"":{"":0},"a/b":1,"m~n":2,"~1":3,"%2F":4,"é😀":5,"\u0061":6,"a\u0000b":7,"e":8}`;
	for (const [pointer, literal] of [
		["//", "0"],
		["/a~1b", "1"],
		["/m~0n", "2"],
		["/~01", "3"],
		["/%2F", "4"],
		["/é😀", "5"],
		["/a", "6"],
		["/a\0b", "7"],
		["/e", "8"],
	]) {
		expect(selectJsonSource(source, pointer).text).toBe(literal);
	}
	expect(selectJsonSource(source, "/").text).toBe('{"":0}');
	errorCode(() => selectJsonSource(source, "/%C3%A9%F0%9F%98%80"), "not-found");
});

it("matches only canonical array indices while object member names remain literal", () => {
	const source = '{"items":[0,{"01":[true]}],"01":1,"-":2,"/":3,"~":4}';
	expect(selectJsonSource(source, "/items/1/01/0").text).toBe("true");
	for (const [pointer, literal] of [
		["/01", "1"],
		["/-", "2"],
		["/~1", "3"],
		["/~0", "4"],
	]) {
		expect(selectJsonSource(source, pointer).text).toBe(literal);
	}
	for (const index of [
		"",
		"-",
		"00",
		"01",
		"-0",
		"+0",
		"1.0",
		"1e0",
		" 0",
		"０",
		"2",
		"999999999999999999999999",
	]) {
		errorCode(() => selectJsonSource(source, `/items/${index}`), "not-found");
	}
});

it("never looks up inherited properties or traverses primitive values", () => {
	const source =
		'{"__proto__":{"constructor":1},"toString":2,"hasOwnProperty":3}';
	expect(selectJsonSource(source, "/__proto__/constructor").text).toBe("1");
	expect(selectJsonSource(source, "/toString").text).toBe("2");
	expect(selectJsonSource(source, "/hasOwnProperty").text).toBe("3");
	for (const document of ["{}", "[]", '"text"', "1", "true", "false", "null"]) {
		for (const pointer of [
			"/__proto__",
			"/constructor",
			"/toString",
			"/length",
			"/0",
			"/",
		]) {
			errorCode(() => selectJsonSource(document, pointer), "not-found");
		}
	}
});

it("rejects duplicate decoded keys anywhere, including unselected sibling objects", () => {
	const duplicates = [
		'{"same":1,"same":2}',
		String.raw`{"a":1,"\u0061":2}`,
		String.raw`{"/":1,"\/":2}`,
		String.raw`{"😀":1,"\ud83d\ude00":2}`,
		`{"\ud800":1,"\\ud800":2}`,
		String.raw`{"\n":1,"\u000a":2}`,
		'{"":1,"":2}',
		'{"__proto__":1,"__proto__":2}',
	];
	for (const duplicate of duplicates) {
		for (const [source, pointer] of [
			[duplicate, ""],
			[`{"selected":true,"other":[${duplicate}]}`, "/selected"],
			[`{"other":${duplicate},"selected":true}`, "/selected"],
			[duplicate, "/absent"],
		]) {
			errorCode(() => selectJsonSource(source, pointer), "invalid-input");
		}
	}
	expect(selectJsonSource('{"a":{"a":1},"b":{"a":2}}', "/b/a").text).toBe("2");
});

it("validates malformed data before and after a selected value or an absent path", () => {
	const malformed = [
		"",
		" \t\r\n",
		"\ufeffnull",
		"\u00a0null",
		"null\v",
		"null\f",
		"null\u2028",
		"null\u2029",
		"/* comment */null",
		"null// comment",
		"true false",
		"undefined",
		"NaN",
		"Infinity",
		"-Infinity",
		"True",
		"nul",
		"[",
		"{",
		"[1,]",
		"[,1]",
		"[1 2]",
		"[1}",
		'{"a":1,}',
		'{"a" 1}',
		'{"a":}',
		"{a:1}",
		"{'a':1}",
		'{"a":1 "b":2}',
		"+1",
		"01",
		"-01",
		".1",
		"1.",
		"-",
		"--1",
		"1e",
		"1E+",
		"1e-",
		"0x10",
		"1_000",
	];
	for (const source of malformed) {
		for (const pointer of ["", "/missing"]) {
			errorCode(() => selectJsonSource(source, pointer), "invalid-input");
		}
	}
	for (const source of [
		'{"selected":true,"bad":[1,]}',
		'{"bad":[1,],"selected":true}',
		'{"selected":true} false',
		'{"selected":true',
		'{"selected":true,"bad":01}',
		'{"selected":true,"bad":"\\uXYZZ"}',
	]) {
		errorCode(() => selectJsonSource(source, "/selected"), "invalid-input");
	}
});

it("preserves valid escapes and paired or unpaired surrogates without string decoding", () => {
	const literals = [
		String.raw`"\"\\\/\b\f\n\r\t\u0000\u001F"`,
		String.raw`"\ud83d\uDE00\uD800\udfff"`,
		'"😀\ud800\udfff\u2028\u2029\ufeff"',
	];
	for (const literal of literals) {
		expect(selectJsonSource(literal, "").text).toBe(literal);
	}
	expect(
		selectJsonSource(String.raw`{"\ud800":1,"\udfff":2}`, "/\ud800").text,
	).toBe("1");
	expect(selectJsonSource(String.raw`{"\ud83d\ude00":3}`, "/😀").text).toBe(
		"3",
	);
});

it("rejects invalid escapes, truncated strings and every raw JSON control character", () => {
	const malformed = [
		'"',
		'"unterminated',
		'"\\',
		String.raw`"\x20"`,
		String.raw`"\v"`,
		String.raw`"\0"`,
		String.raw`"\'"`,
		String.raw`"\U0000"`,
		String.raw`"\u"`,
		String.raw`"\u0"`,
		String.raw`"\u00"`,
		String.raw`"\u000"`,
		String.raw`"\uGGGG"`,
		String.raw`"\u{0041}"`,
		'"\\\n"',
	];
	for (let code = 0; code < 0x20; code++) {
		malformed.push(`"${String.fromCharCode(code)}"`);
	}
	for (const literal of malformed) {
		errorCode(() => selectJsonSource(literal, ""), "invalid-input");
		errorCode(() => selectJsonSource(`{${literal}:0}`, ""), "invalid-input");
	}
});

it("validates pointer types and escapes without URI-fragment or percent decoding", () => {
	for (const pointer of [
		"",
		"/",
		"//",
		"/~0",
		"/~1",
		"/~01",
		"/%2F",
		"/#",
		"/\0",
		"/😀",
		"/01",
		"/-",
	]) {
		expect(validateJsonSourcePointer(pointer)).toBe(pointer);
	}
	for (const pointer of [
		undefined,
		null,
		false,
		0,
		[],
		{},
		new String("/a"),
		"#",
		"#/a",
		"a",
		"/~",
		"/~2",
		"/~~0",
		"/~00~",
	]) {
		errorCode(() => validateJsonSourcePointer(pointer), "invalid-input");
		errorCode(() => selectJsonSource("null", pointer), "invalid-input");
	}
	for (const source of [undefined, null, 1, {}, new String("null")]) {
		errorCode(() => selectJsonSource(source as string, ""), "invalid-input");
	}
	errorCode(
		() => selectJsonSource("null", "", null as unknown as () => void),
		"invalid-input",
	);
});

it("publishes frozen limits and enforces exact pointer code-unit and segment bounds", () => {
	expect(jsonSourceSelectionLimits).toEqual({
		maxSourceCodeUnits: 2_000_000,
		maxPointerCodeUnits: 4096,
		maxPointerSegments: 128,
		maxNodes: 100_000,
		maxDepth: 128,
	});
	expect(Object.isFrozen(jsonSourceSelectionLimits)).toBe(true);
	const key = "a".repeat(jsonSourceSelectionLimits.maxPointerCodeUnits - 1);
	expect(validateJsonSourcePointer(`/${key}`)).toBe(`/${key}`);
	expect(selectJsonSource(`{"${key}":0}`, `/${key}`).text).toBe("0");
	for (const pointer of [
		`/${key}a`,
		`/${"😀".repeat(jsonSourceSelectionLimits.maxPointerCodeUnits / 2)}`,
		"/".repeat(jsonSourceSelectionLimits.maxPointerSegments + 1),
	]) {
		errorCode(() => validateJsonSourcePointer(pointer), "resource-limit");
		errorCode(() => selectJsonSource("null", pointer), "resource-limit");
	}
	const segments = jsonSourceSelectionLimits.maxPointerSegments;
	const pointer = "/".repeat(segments);
	const source = `${'{"":'.repeat(segments)}0${"}".repeat(segments)}`;
	expect(validateJsonSourcePointer(pointer)).toBe(pointer);
	expect(selectJsonSource(source, pointer).text).toBe("0");
});

it("bounds source length in UTF-16 code units including surrounding whitespace", () => {
	const source = `${" ".repeat(jsonSourceSelectionLimits.maxSourceCodeUnits - 1)}0`;
	const result = selectJsonSource(source, "");
	expect(result.text).toBe("0");
	expect(result.metadata.sourceCodeUnits).toBe(
		jsonSourceSelectionLimits.maxSourceCodeUnits,
	);
	errorCode(() => selectJsonSource(`${source} `, ""), "resource-limit");
	const astral = `"${"😀".repeat(jsonSourceSelectionLimits.maxSourceCodeUnits / 2 - 1)}"`;
	expect(selectJsonSource(astral, "").metadata.selectedCodeUnits).toBe(
		jsonSourceSelectionLimits.maxSourceCodeUnits,
	);
	errorCode(() => selectJsonSource(`${astral} `, ""), "resource-limit");
});

it("counts every value node even after a match without charging object keys as nodes", () => {
	const values = Array(jsonSourceSelectionLimits.maxNodes - 1).fill("0");
	const source = `[${values.join(",")}]`;
	expect(selectJsonSource(source, "/0").text).toBe("0");
	errorCode(
		() => selectJsonSource(`[0,${values.join(",")}]`, "/0"),
		"resource-limit",
	);
	errorCode(
		() => selectJsonSource(`[0,${values.join(",")}]`, "/absent"),
		"resource-limit",
	);
	const members = values.map((value, index) => `"${index}":${value}`).join(",");
	expect(selectJsonSource(`{${members}}`, "/0").text).toBe("0");
	errorCode(
		() => selectJsonSource(`{"extra":0,${members}}`, "/extra"),
		"resource-limit",
	);
});

it("allows 128 nested containers and rejects deeper containers anywhere in the source", () => {
	const depth = jsonSourceSelectionLimits.maxDepth;
	const arrays = `${"[".repeat(depth)}0${"]".repeat(depth)}`;
	expect(selectJsonSource(arrays, "/0".repeat(depth)).text).toBe("0");
	const empty = `${"[".repeat(depth)}${"]".repeat(depth)}`;
	expect(selectJsonSource(empty, "").text).toBe(empty);
	errorCode(() => selectJsonSource(`[${arrays}]`, ""), "resource-limit");
	errorCode(() => selectJsonSource(`[${empty}]`, ""), "resource-limit");
	errorCode(
		() => selectJsonSource(`{"selected":0,"deep":${arrays}}`, "/selected"),
		"resource-limit",
	);
	const objects = `${'{"a":'.repeat(depth)}null${"}".repeat(depth)}`;
	expect(selectJsonSource(objects, "/a".repeat(depth)).text).toBe("null");
	errorCode(() => selectJsonSource(`{"a":${objects}}`, ""), "resource-limit");
});

it("uses JSON.parse only for validated object keys, never values of any kind", () => {
	const literals = [
		'"\\u0061"',
		'""',
		"9007199254740993",
		"-0",
		"1e999999",
		"true",
		"false",
		"null",
		"[1,2]",
		"{}",
	];
	const nativeParse = JSON.parse;
	const parsed: string[] = [];
	const parse = vi.spyOn(JSON, "parse").mockImplementation((text: string) => {
		parsed.push(text);
		if (text !== '"value"' && text !== String.raw`"\u006bey"`) {
			throw new Error("Unexpected JSON.parse input");
		}
		return nativeParse(text);
	});
	const stringify = vi.spyOn(JSON, "stringify").mockImplementation(() => {
		throw new Error("Unexpected JSON.stringify call");
	});
	const selections: string[] = [];
	try {
		for (const literal of literals) {
			selections.push(selectJsonSource(literal, "").text);
			selections.push(selectJsonSource(`{"value":${literal}}`, "/value").text);
		}
		selections.push(selectJsonSource(String.raw`{"\u006bey":-0}`, "/key").text);
	} finally {
		parse.mockRestore();
		stringify.mockRestore();
	}
	expect(selections).toEqual([
		...literals.flatMap((literal) => [literal, literal]),
		"-0",
	]);
	expect(parsed).toEqual([
		...literals.map(() => '"value"'),
		String.raw`"\u006bey"`,
	]);
});

it("propagates cancellation before validating inputs and immediately before returning", () => {
	const cancellation = new AgentBrowserError("aborted", "Cancelled selection");
	expect(() =>
		selectJsonSource("not JSON", null, () => {
			throw cancellation;
		}),
	).toThrow(cancellation);
	let calls = 0;
	selectJsonSource("null", "", () => {
		calls++;
	});
	expect(calls).toBeGreaterThanOrEqual(3);
	let repeatedCalls = 0;
	expect(() =>
		selectJsonSource("null", "", () => {
			if (++repeatedCalls === calls) throw cancellation;
		}),
	).toThrow(cancellation);
});

it("checkpoints inside long whitespace, strings, keys and every numeric component", () => {
	const longDigits = "7".repeat(100_000);
	const sources = [
		`${" ".repeat(100_000)}null`,
		`null${"\t".repeat(100_000)}`,
		`"${"a".repeat(100_000)}"`,
		`"${"\\u0041".repeat(20_000)}"`,
		`{"${"k".repeat(100_000)}":0}`,
		longDigits,
		`0.${longDigits}`,
		`1e+${longDigits}`,
		`{"selected":0,"later":"${"a".repeat(100_000)}"}`,
	];
	for (const source of sources) {
		let calls = 0;
		const cancellation = new Error("Stop scanning long token");
		expect(() =>
			selectJsonSource(source, "/selected", () => {
				if (++calls === 20) throw cancellation;
			}),
		).toThrow(cancellation);
		expect(calls).toBe(20);
	}
});

it("keeps cancellation exceptions unchanged during traversal even after a match", () => {
	const source = `{"selected":0,"later":[${Array(1000).fill("true").join(",")}]}`;
	const cancellation = { cancelled: true };
	let calls = 0;
	let caught: unknown;
	try {
		selectJsonSource(source, "/selected", () => {
			if (++calls === 50) throw cancellation;
		});
	} catch (error) {
		caught = error;
	}
	expect(caught).toBe(cancellation);
	expect(calls).toBe(50);
});

it("does not include arbitrary source or pointer content in errors", () => {
	const secret = "private-fixture-content";
	for (const [source, pointer, code] of [
		[`{"${secret}":1,"${secret}":2}`, "", "invalid-input"],
		[`{"${secret}":undefined}`, "", "invalid-input"],
		["{}", `/${secret}`, "not-found"],
		["{}", `${secret}~2`, "invalid-input"],
	]) {
		let caught: unknown;
		try {
			selectJsonSource(source, pointer);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(AgentBrowserError);
		expect(caught).toMatchObject({ code });
		expect((caught as Error).message).not.toContain(secret);
	}
});
