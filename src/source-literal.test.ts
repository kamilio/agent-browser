import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { parseSourceLiteral, sourceLiteralLimits } from "./source-literal.js";

function expectFailure(
	source: unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
) {
	let caught: unknown;
	try {
		parseSourceLiteral(source);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	expect(caught).toMatchObject({ code });
}

function expectFrozenTree(value: unknown) {
	if (value === null || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	if (!Array.isArray(value)) expect(Object.getPrototypeOf(value)).toBe(null);
	for (const child of Object.values(value)) expectFrozenTree(child);
}

function containerSource(
	kind: "array" | "object",
	entries: number,
	trailing = "",
	value = "0",
) {
	const contents = Array.from({ length: entries }, (_, index) =>
		kind === "object" ? `key${index}:${value}` : value,
	).join(",");
	return kind === "object"
		? `{${contents}${trailing}}`
		: `[${contents}${trailing}]`;
}

it("publishes the exact frozen resource limits", () => {
	expect(sourceLiteralLimits).toEqual({
		inputCodeUnits: 65_536,
		depth: 16,
		values: 4_096,
		entries: 256,
		stringCodeUnits: 4_096,
		outputBytes: 65_536,
	});
	expect(Object.isFrozen(sourceLiteralLimits)).toBe(true);
});

it.each([
	["null", null],
	["true", true],
	["false", false],
	["0", 0],
	["-0", -0],
	["-0e12", -0],
	["42", 42],
	["-12.5", -12.5],
	["1.25e+2", 125],
	["1E-3", 0.001],
	["5e-324", Number.MIN_VALUE],
	["1e-400", 0],
	["9007199254740991", Number.MAX_SAFE_INTEGER],
	["-9007199254740991", Number.MIN_SAFE_INTEGER],
	["9.007199254740991e15", Number.MAX_SAFE_INTEGER],
	['"9007199254740993"', "9007199254740993"],
	["'0000123'", "0000123"],
	['""', ""],
	["''", ""],
	['"it\'s data"', "it's data"],
	["'say \"hello\"'", 'say "hello"'],
])("preserves the scalar value of %s", (source, expected) => {
	expect(parseSourceLiteral(source)).toBe(expected);
});

it("accepts JSON containers, ASCII identifier keys and one trailing comma", () => {
	const source = ` \t\r\n {
		$: [], _: {}, $a_9: true, Aa0$: false,
		true: null, null: 'null', default: 1, class: 2,
		"string-id": "9007199254740993",
		items: [1, 'two', {nested: [null,],},],
	} \r\n\t `;
	const result = parseSourceLiteral(source);
	expect(result).toEqual({
		$: [],
		_: {},
		$a_9: true,
		Aa0$: false,
		true: null,
		null: "null",
		default: 1,
		class: 2,
		"string-id": "9007199254740993",
		items: [1, "two", { nested: [null] }],
	});
	expectFrozenTree(result);
});

it.each(["[]", "{}", '[{}, [], {items: [{value: "data"}]}]'])(
	"recursively freezes containers and gives every object a null prototype: %s",
	(source) => {
		const result = parseSourceLiteral(source);
		expectFrozenTree(result);
		expect(Reflect.set(result as object, "added", true)).toBe(false);
		expect(() =>
			Object.defineProperty(result, "added", { value: true }),
		).toThrow(TypeError);
	},
);

it.each([
	[String.raw`\"`, '"'],
	[String.raw`\'`, "'"],
	[String.raw`\\`, "\\"],
	[String.raw`\/`, "/"],
	[String.raw`\b`, "\b"],
	[String.raw`\f`, "\f"],
	[String.raw`\n`, "\n"],
	[String.raw`\r`, "\r"],
	[String.raw`\t`, "\t"],
	[String.raw`\u0041`, "A"],
	[String.raw`\u00e9`, "é"],
	[String.raw`\uD83D\ude00`, "😀"],
	[String.raw`\uD800x\uDC00`, "\ud800x\udc00"],
	[String.raw`\u00410`, "A0"],
	[String.raw`\u0041F`, "AF"],
])("decodes %s in both quote forms and in keys", (escaped, decoded) => {
	for (const quote of ['"', "'"]) {
		expect(parseSourceLiteral(`${quote}${escaped}${quote}`)).toBe(decoded);
		expect(parseSourceLiteral(`{${quote}${escaped}${quote}:0}`)).toEqual({
			[decoded]: 0,
		});
	}
});

it("preserves raw Unicode and lone surrogates without normalization", () => {
	for (const quote of ['"', "'"]) {
		const value = "é e\u0301 中文 😀 \ud800x\udc00 \u2028\u2029";
		expect(parseSourceLiteral(`${quote}${value}${quote}`)).toBe(value);
		expect(parseSourceLiteral(`{${quote}${value}${quote}:0}`)).toEqual({
			[value]: 0,
		});
	}
	expect(parseSourceLiteral('{"é":1,"e\\u0301":2}')).toEqual({
		é: 1,
		"e\u0301": 2,
	});
});

it("accepts escaped controls but rejects every raw U+0000 through U+001F", () => {
	for (let codeUnit = 0; codeUnit < 32; codeUnit++) {
		const control = String.fromCharCode(codeUnit);
		const escapedControl = `\\u${codeUnit.toString(16).padStart(4, "0")}`;
		for (const quote of ['"', "'"]) {
			expect(parseSourceLiteral(`${quote}${escapedControl}${quote}`)).toBe(
				control,
			);
			expect(
				parseSourceLiteral(`{${quote}${escapedControl}${quote}:0}`),
			).toEqual({
				[control]: 0,
			});
			expectFailure(`${quote}${control}${quote}`);
			expectFailure(`{${quote}${control}${quote}:0}`);
		}
	}
});

it.each([
	undefined,
	null,
	true,
	false,
	0,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	1n,
	Symbol("source"),
	[],
	{},
	() => "null",
])("rejects nonstring input without accepting coercion: %s", (source) => {
	expectFailure(source);
});

it("does not read or coerce nonstring objects", () => {
	let reads = 0;
	const source = new Proxy(
		{},
		{
			get() {
				reads++;
				throw new Error("Input properties must not be read");
			},
		},
	);
	expectFailure(source);
	expectFailure(Object("null"));
	expect(reads).toBe(0);
});

it.each([
	"",
	" \t\r\n",
	"[",
	"{",
	"'",
	'"',
	"'unterminated",
	'"unterminated',
	"'mismatched\"",
	"'ends with a backslash\\",
	"[0",
	"{key:0",
	"{key}",
	"{key:}",
	"{key=0}",
	"{key 0}",
	"{key:0 other:1}",
	"{key:0;other:1}",
	"[0 1]",
	"[,]",
	"[,,]",
	"[0,,1]",
	"[0,,]",
	"{,}",
	"{,key:0}",
	"{key:0,,}",
	"{1:0}",
	"{-1:0}",
	"{a-b:0}",
	"{é:0}",
	"{aé:0}",
	String.raw`{\u0061:0}`,
	"null false",
	"truefalse",
	"nullx",
	"false0",
	"0 1",
	"0x",
	"[]{}",
	"{};",
	"'value' trailing",
	"[0]]",
	"{key:0}}",
])("rejects malformed, sparse or partially consumed source: %s", (source) => {
	expectFailure(source);
});

it.each([
	"+1",
	"01",
	"-01",
	"00",
	".5",
	"-.5",
	"1.",
	"1.e2",
	"1e",
	"1e+",
	"1e-",
	"--1",
	"0x10",
	"0X10",
	"0o10",
	"0b10",
	"1_000",
	"1n",
	"NaN",
	"Infinity",
	"-Infinity",
	"1e309",
	"-1e309",
	"9007199254740992",
	"-9007199254740992",
	"9007199254740993",
	"9007199254740992.0",
	"9.007199254740992e15",
	"90071992547409920e-1",
	"1e20",
	"1e308",
])("rejects non-JSON, nonfinite or unsafe integer numbers: %s", (source) => {
	expectFailure(source);
	expectFailure(`[${source}]`);
	expectFailure(`{value:${source}}`);
});

it.each([
	String.raw`\x41`,
	String.raw`\v`,
	String.raw`\0`,
	String.raw`\01`,
	String.raw`\a`,
	String.raw`\ `,
	String.raw`\U0041`,
	String.raw`\u`,
	String.raw`\u123`,
	String.raw`\u12xz`,
	String.raw`\u{0041}`,
	"\\\n",
	"\\\r",
	"\\\r\n",
	"\\\u2028",
	"\\\u2029",
])("rejects unsupported escapes in both quote forms: %j", (escaped) => {
	for (const quote of ['"', "'"]) {
		expectFailure(`${quote}${escaped}${quote}`);
		expectFailure(`{${quote}${escaped}${quote}:0}`);
	}
});

it.each([
	"\u000b",
	"\u000c",
	"\u00a0",
	"\u1680",
	"\u2000",
	"\u2028",
	"\u2029",
	"\u202f",
	"\u205f",
	"\u3000",
	"\ufeff",
])("rejects non-JSON whitespace outside strings: %j", (whitespace) => {
	for (const source of [
		`${whitespace}0`,
		`0${whitespace}`,
		`[0,${whitespace}1]`,
		`{key${whitespace}:0}`,
	])
		expectFailure(source);
});

it.each([
	"undefined",
	"identifier",
	"globalThis",
	"globalThis.value",
	"Math.abs(-1)",
	"new Date()",
	"(0)",
	"({key:0})",
	"1+2",
	"-true",
	"!false",
	"true?1:0",
	"/pattern/",
	"`template`",
	"`${1+2}`",
	"function(){}",
	"()=>0",
	"class {}",
	"[...[]]",
	"{...{key:0}}",
	"{key}",
	'{["key"]:0}',
	"{key(){return 0}}",
	"{get key(){return 0}}",
	"{set key(value){}}",
	"{async key(){}}",
	"{*key(){}}",
	"{key:Math.abs(-1)}",
	"[identifier]",
	"// comment\n0",
	"/* comment */0",
	"[0/* comment */]",
	"{key:0,// comment\n}",
	"0// comment",
	"0/* comment */",
])("rejects executable JavaScript and comments: %s", (source) => {
	expectFailure(source);
});

it("does not resolve references, invoke calls or mutate globals", () => {
	const name = "__sourceLiteralProbe__";
	const previous = Object.getOwnPropertyDescriptor(globalThis, name);
	let reads = 0;
	let writes = 0;
	let calls = 0;
	Object.defineProperty(globalThis, name, {
		configurable: true,
		get() {
			reads++;
			return () => calls++;
		},
		set() {
			writes++;
		},
	});
	try {
		for (const source of [
			name,
			`globalThis.${name}`,
			`${name}()`,
			`globalThis["${name}"]()`,
			`globalThis.${name}=1`,
			`[globalThis.${name}()]`,
			`{value:globalThis.${name}()}`,
			`{[globalThis.${name}()]:0}`,
			`(()=>{globalThis.${name}=1;return 0})()`,
			`Function("globalThis.${name}=1")()`,
			`({}).constructor.constructor("globalThis.${name}=1")()`,
			`0;globalThis.${name}=1`,
		]) {
			expectFailure(source);
			expect({ reads, writes, calls }).toEqual({
				reads: 0,
				writes: 0,
				calls: 0,
			});
		}
		expect(parseSourceLiteral(`'globalThis.${name}()'`)).toBe(
			`globalThis.${name}()`,
		);
		expect({ reads, writes, calls }).toEqual({ reads: 0, writes: 0, calls: 0 });
	} finally {
		if (previous) Object.defineProperty(globalThis, name, previous);
		else Reflect.deleteProperty(globalThis, name);
	}
});

it.each([
	"{key:1,key:2}",
	'{key:1,"key":2}',
	"{\"key\":1,'key':2}",
	String.raw`{a:1,"\u0061":2}`,
	String.raw`{"\u0061":1,'a':2}`,
	String.raw`{"\u0061":1,"\u0061":2}`,
	String.raw`{"ab":1,"a\u0062":2}`,
	String.raw`{'it\'s':1,"it's":2}`,
	String.raw`{"a/b":1,"a\/b":2}`,
	String.raw`{"é":1,"\u00e9":2}`,
	String.raw`{"😀":1,"\uD83D\uDE00":2}`,
	String.raw`{"1":1,"\u0031":2}`,
	String.raw`{"":1,'':2}`,
	String.raw`[{nested:{key:1,"\u006bey":2}}]`,
])("rejects duplicate decoded keys: %s", (source) => {
	expectFailure(source);
});

it.each(["__proto__", "prototype", "constructor"])(
	"rejects the forbidden key %s in every supported spelling",
	(key) => {
		const escaped = `\\u${key.charCodeAt(0).toString(16).padStart(4, "0")}${key.slice(1)}`;
		for (const spelling of [
			key,
			`"${key}"`,
			`'${key}'`,
			`"${escaped}"`,
			`'${escaped}'`,
		]) {
			expectFailure(`{${spelling}:0}`);
			expectFailure(`[{nested:{${spelling}:0}}]`);
		}
		expect(parseSourceLiteral(`'${key}'`)).toBe(key);
	},
);

it("allows safe lookalike keys and the same key in independent objects", () => {
	const source = `{
		__proto__x: 0, Prototype: 1, Constructor: 2,
		toString: 3, valueOf: 4, hasOwnProperty: 5,
		items: [{key: 1}, {key: 2}], key: {key: 3},
	}`;
	const result = parseSourceLiteral(source);
	expect(result).toEqual({
		__proto__x: 0,
		Prototype: 1,
		Constructor: 2,
		toString: 3,
		valueOf: 4,
		hasOwnProperty: 5,
		items: [{ key: 1 }, { key: 2 }],
		key: { key: 3 },
	});
	expectFrozenTree(result);
});

it.each([
	["0", 0],
	["'😀'", "😀"],
])("bounds the complete input at 65536 code units: %s", (value, expected) => {
	const source = `${value}${" ".repeat(65_536 - String(value).length)}`;
	expect(source.length).toBe(65_536);
	expect(parseSourceLiteral(source)).toBe(expected);
	expectFailure(`${source} `, "resource-limit");
});

it.each(["array", "object", "mixed"] as const)(
	"accepts depth 16 and rejects depth 17 with root depth zero: %s",
	(kind) => {
		for (const leaf of ["0", "[]", "{}"]) {
			let source = leaf;
			for (let depth = 0; depth < 16; depth++) {
				source =
					kind === "object" || (kind === "mixed" && depth % 2 === 0)
						? `{child:${source}}`
						: `[${source}]`;
			}
			expectFrozenTree(parseSourceLiteral(source));
			expectFailure(`[${source}]`, "resource-limit");
			expectFailure(`{child:${source}}`, "resource-limit");
		}
	},
);

it.each(["array", "object"] as const)(
	"bounds each %s at 256 entries, excluding a trailing comma",
	(kind) => {
		for (const trailing of ["", ","]) {
			const source = containerSource(kind, 256, trailing);
			const result = parseSourceLiteral(source);
			expect(Object.keys(result as object)).toHaveLength(256);
			expectFrozenTree(result);
			expectFailure(containerSource(kind, 257, trailing), "resource-limit");
		}
	},
);

it.each(["array", "object"] as const)(
	"counts the root, nested %s containers and each value toward 4096, but not keys",
	(kind) => {
		for (const leaf of ["0", "{}"]) {
			const groups = Array.from({ length: 15 }, () =>
				containerSource(kind, 256, "", leaf),
			);
			const source = `[${[...groups, containerSource(kind, 239, "", leaf)].join(",")}]`;
			const result = parseSourceLiteral(source);
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(16);
			expectFailure(
				`[${[...groups, containerSource(kind, 240, "", leaf)].join(",")}]`,
				"resource-limit",
			);
		}
	},
);

it.each([
	{ name: "raw ASCII", body: "a".repeat(4_096), decoded: "a".repeat(4_096) },
	{
		name: "raw astral Unicode",
		body: "😀".repeat(2_048),
		decoded: "😀".repeat(2_048),
	},
	{
		name: "escaped ASCII",
		body: String.raw`\u0061`.repeat(4_096),
		decoded: "a".repeat(4_096),
	},
	{
		name: "escaped lone surrogates",
		body: String.raw`\uD800`.repeat(4_096),
		decoded: "\ud800".repeat(4_096),
	},
])("bounds decoded keys and strings at 4096 code units: $name", (fixture) => {
	expect(fixture.decoded.length).toBe(4_096);
	for (const quote of ['"', "'"]) {
		expect(parseSourceLiteral(`${quote}${fixture.body}${quote}`)).toBe(
			fixture.decoded,
		);
		expect(parseSourceLiteral(`{${quote}${fixture.body}${quote}:0}`)).toEqual({
			[fixture.decoded]: 0,
		});
		expectFailure(`${quote}${fixture.body}a${quote}`, "resource-limit");
		expectFailure(`{${quote}${fixture.body}a${quote}:0}`, "resource-limit");
	}
});

it.each([
	{ name: "UTF-8", unit: "€", full: 5, tail: 1_359, suffix: "" },
	{
		name: "lone surrogate escaping",
		unit: "\ud800",
		full: 2,
		tail: 2_729,
		suffix: "",
	},
	{ name: "JSON quote escaping", unit: '"', full: 7, tail: 4_083, suffix: "a" },
])("bounds serialized JSON output at 65536 bytes: $name", (fixture) => {
	const values = Array.from({ length: fixture.full }, () =>
		fixture.unit.repeat(4_096),
	);
	values.push(fixture.unit.repeat(fixture.tail) + fixture.suffix);
	const source = `[${values.map((value) => `'${value}'`).join(",")}]`;
	expect(source.length).toBeLessThan(65_536);
	expect(new TextEncoder().encode(JSON.stringify(values))).toHaveLength(65_536);
	expect(parseSourceLiteral(source)).toEqual(values);
	values[values.length - 1] += "a";
	const oversized = `[${values.map((value) => `'${value}'`).join(",")}]`;
	expect(oversized.length).toBeLessThan(65_536);
	expect(new TextEncoder().encode(JSON.stringify(values))).toHaveLength(65_537);
	expectFailure(oversized, "resource-limit");
});

it("includes object keys and punctuation in the serialized JSON byte bound", () => {
	const keys = Array.from(
		{ length: 5 },
		(_, index) => `${index}${"€".repeat(4_095)}`,
	);
	keys.push(`5${"€".repeat(1_358)}`);
	const value = Object.fromEntries(keys.map((key) => [key, 0]));
	const source = JSON.stringify(value);
	expect(source.length).toBeLessThan(65_536);
	expect(new TextEncoder().encode(source)).toHaveLength(65_536);
	expect(parseSourceLiteral(source)).toEqual(value);
	keys[keys.length - 1] += "a";
	const oversized = JSON.stringify(
		Object.fromEntries(keys.map((key) => [key, 0])),
	);
	expect(oversized.length).toBeLessThan(65_536);
	expect(new TextEncoder().encode(oversized)).toHaveLength(65_537);
	expectFailure(oversized, "resource-limit");
});
