import { afterEach, expect, it, vi } from "vitest";
import {
	htmlSourceJsonBindingBatchLimits,
	htmlSourceJsonBindingLimits,
	selectHtmlJsonBindingSource,
	selectHtmlJsonBindingSources,
	validateHtmlJsonBindingSourceSelection,
	validateHtmlJsonBindingSourcesSelection,
} from "./html-source-json-binding.js";
import { htmlSourceJsonLimits } from "./html-source-json.js";
import { HtmlTokenCursor } from "./html-token-cursor.js";
import * as jsonSource from "./json-source-selection.js";

const selection = {
	scriptId: "data",
	binding: "payload",
	pointers: ["/first", "/second"],
};
const script = (literal = '{"first":"One","second":"Two"}', trailing = "") =>
	`<script id="data">const payload = ${literal};${trailing}</script>`;

afterEach(() => vi.restoreAllMocks());

it("matches every single result and shared metadata in requested order", () => {
	const literal =
		'{\r\n"first":{"large":900719925474099312345,"escaped":"a\\u0062","decimal":1.2300e+4},"second":[null,true,"😀"]\r\n}';
	const source = `<!doctype html>😀\r\n${script(literal, '\r\npayload.first = "Later value";')}<p>After</p>`;
	const pointers = ["/second/2", "/first", "/second/0", "/first/escaped"];
	const result = selectHtmlJsonBindingSources(source, {
		...selection,
		pointers,
	});
	expect(result.metadata.kind).toBe("html-json-binding-sources-v1");
	expect(result.metadata.pointers).toEqual(pointers);
	expect(result.values.map((value) => value.pointer)).toEqual(pointers);
	const {
		kind: batchKind,
		pointers: admittedPointers,
		...batchShared
	} = result.metadata;
	expect(batchKind).not.toBe("html-json-binding-source-v1");
	expect(admittedPointers).not.toBe(pointers);
	for (const [index, pointer] of pointers.entries()) {
		const single = selectHtmlJsonBindingSource(source, {
			scriptId: selection.scriptId,
			binding: selection.binding,
			pointer,
		});
		const { kind, pointer: admittedPointer, json, ...shared } = single.metadata;
		expect(kind).toBe("html-json-binding-source-v1");
		expect(admittedPointer).toBe(pointer);
		expect(result.values[index]).toEqual({ pointer, text: single.text, json });
		expect(batchShared).toEqual(shared);
		expect(
			source.slice(
				result.metadata.literal.start + json.start,
				result.metadata.literal.start + json.end,
			),
		).toBe(single.text);
	}
	expect(result.values[1].text).toBe(
		'{"large":900719925474099312345,"escaped":"a\\u0062","decimal":1.2300e+4}',
	);
	expect(
		source.slice(result.metadata.literal.start, result.metadata.literal.end),
	).toBe(literal);
	expect(
		source.slice(
			result.metadata.trailingSource.start,
			result.metadata.trailingSource.end,
		),
	).toBe('\r\npayload.first = "Later value";');
	expect(result.metadata).toMatchObject({
		scope: "lexical-html-source",
		valueBasis: "initial-const-json-literal",
		scriptingMode: "disabled",
		rendered: false,
		verified: false,
		offsetBasis: "decoder-output-utf16",
		jsonOffsetBasis: "literal-relative-utf16",
		trailingSource: { evaluated: false, offsetBasis: "decoder-output-utf16" },
	});
	for (const value of [
		result,
		result.values,
		result.metadata,
		result.metadata.pointers,
		result.metadata.literal,
		result.metadata.trailingSource,
		result.metadata.counters,
	])
		expect(Object.isFrozen(value)).toBe(true);
	for (const value of result.values) {
		expect(Object.isFrozen(value)).toBe(true);
		expect(Object.isFrozen(value.json)).toBe(true);
	}
});

it("scans HTML once and validates the entire literal once for all pointers", () => {
	const literal =
		'{"first":1,"second":[true,false],"ignored":{"nested":"Valid"}}';
	const source = `<style>${" ".repeat(70000)}</style>${script(literal)}`;
	const next = vi.spyOn(HtmlTokenCursor.prototype, "next");
	const single = selectHtmlJsonBindingSource(source, {
		scriptId: "data",
		binding: "payload",
		pointer: "/first",
	});
	const nextCalls = next.mock.calls.length;
	next.mockClear();
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	const spans = vi.spyOn(jsonSource, "selectJsonSourceSpans");
	const singleJson = vi.spyOn(jsonSource, "selectJsonSource");
	const pointers = ["/second/1", "/first", "/ignored/nested"];
	const result = selectHtmlJsonBindingSources(source, {
		...selection,
		pointers,
	});
	expect(spans).toHaveBeenCalledTimes(1);
	expect(spans.mock.calls[0][0]).toBe(literal);
	expect(spans.mock.calls[0][1]).toBe(result.metadata.pointers);
	expect(spans.mock.calls[0][1]).toEqual(pointers);
	expect(singleJson).not.toHaveBeenCalled();
	expect(next).toHaveBeenCalledTimes(nextCalls);
	expect(close).toHaveBeenCalledTimes(1);
	expect(result.metadata.counters).toEqual(single.metadata.counters);
});

it("preserves pointer escapes, arrays, exact scalars and overlapping selections", () => {
	const literal =
		'[{"a/b":{"~key":"\\u0061\\n\\uD83D\\uDE00"},"number":-0.00e-2},false,null]';
	const pointers = ["/2", "/0/a~1b/~0key", "", "/0/number", "/1"];
	const result = selectHtmlJsonBindingSources(script(literal), {
		...selection,
		pointers,
	});
	expect(result.values.map((value) => value.text)).toEqual([
		"null",
		'"\\u0061\\n\\uD83D\\uDE00"',
		literal,
		"-0.00e-2",
		"false",
	]);
});

it("snapshots and freezes admitted pointers before invoking checkpoints", () => {
	const pointers = ["/first", "/second"];
	const input = { ...selection, pointers };
	const admitted = validateHtmlJsonBindingSourcesSelection(input);
	expect(Object.isFrozen(admitted)).toBe(true);
	expect(Object.isFrozen(admitted.pointers)).toBe(true);
	expect(admitted.pointers).not.toBe(pointers);
	let changed = false;
	const result = selectHtmlJsonBindingSources(script(), input, () => {
		if (changed) return;
		changed = true;
		pointers[0] = "/missing";
		pointers.push("/third");
		input.scriptId = "changed";
		input.binding = "changed";
	});
	expect(result.values.map((value) => value.text)).toEqual(['"One"', '"Two"']);
	expect(result.metadata.pointers).toEqual(["/first", "/second"]);
	expect(admitted.pointers).toEqual(["/first", "/second"]);
});

it("accepts null-prototype selection and frozen nonenumerable dense arrays", () => {
	const pointers = ["/second", "/first"];
	Object.defineProperty(pointers, "0", { enumerable: false });
	Object.freeze(pointers);
	const input = Object.create(null, {
		scriptId: { value: "data" },
		binding: { value: "payload" },
		pointers: { value: pointers },
	});
	expect(
		selectHtmlJsonBindingSources(script(), input).values.map(
			(value) => value.text,
		),
	).toEqual(['"Two"', '"One"']);
});

it.each(
	[
		null,
		[],
		{},
		"selection",
		{ ...selection, pointer: "/first" },
		{ scriptId: "data", pointers: ["/first"] },
		{ ...selection, [Symbol("extra")]: true },
		{ ...selection, scriptId: "two words" },
		{ ...selection, scriptId: "x".repeat(257) },
		{ ...selection, binding: "é" },
		{ ...selection, binding: "has-dash" },
		{ ...selection, binding: "x".repeat(257) },
		Object.create(selection),
	].map((value) => ({ value })),
)("rejects invalid batch selection data %#", ({ value }) => {
	expect(() => validateHtmlJsonBindingSourcesSelection(value)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it.each(["scriptId", "binding", "pointers"])(
	"rejects a %s accessor without invoking it",
	(field) => {
		const get = vi.fn(() => selection.pointers);
		const input = Object.defineProperty({ ...selection }, field, { get });
		expect(() => validateHtmlJsonBindingSourcesSelection(input)).toThrow();
		expect(() => selectHtmlJsonBindingSources(script(), input)).toThrow();
		expect(get).not.toHaveBeenCalled();
	},
);

it.each([
	{ name: "nonarray", make: () => ({ 0: "/first", length: 1 }) },
	{ name: "empty", make: () => [] },
	{ name: "hole", make: () => new Array(1) },
	{
		name: "trailing hole",
		make: () => {
			const pointers = ["/first"];
			pointers.length = 2;
			return pointers;
		},
	},
	{
		name: "extra property",
		make: () => Object.assign(["/first"], { extra: true }),
	},
	{
		name: "extra symbol",
		make: () => Object.assign(["/first"], { [Symbol("extra")]: true }),
	},
	{
		name: "noncanonical index",
		make: () => Object.assign(["/first"], { "01": "/second" }),
	},
	{
		name: "negative index",
		make: () => Object.assign(["/first"], { "-1": "/second" }),
	},
	{
		name: "null prototype",
		make: () => Object.setPrototypeOf(["/first"], null),
	},
	{
		name: "inherited indices",
		make: () =>
			Object.setPrototypeOf(
				new Array(1),
				Object.assign(Object.create(Array.prototype), { 0: "/first" }),
			),
	},
	{
		name: "subclass",
		make: () => new (class extends Array<string> {})("/first"),
	},
	{ name: "number pointer", make: () => [1] },
	{ name: "invalid escape", make: () => ["/first~2"] },
	{ name: "not a pointer", make: () => ["first"] },
])("rejects pointer array hazard: $name", ({ make }) => {
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({ ...selection, pointers: make() }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each(["index", "iterator getter", "iterator method", "inherited iterator"])(
	"never invokes an executable pointer array %s",
	(kind) => {
		const execute = vi.fn(() => ["/first"][Symbol.iterator]());
		const pointers = ["/first"];
		if (kind === "index")
			Object.defineProperty(pointers, "0", { get: execute });
		else if (kind === "iterator getter")
			Object.defineProperty(pointers, Symbol.iterator, { get: execute });
		else if (kind === "iterator method")
			Object.defineProperty(pointers, Symbol.iterator, { value: execute });
		else
			Object.setPrototypeOf(
				pointers,
				Object.assign(Object.create(Array.prototype), {
					[Symbol.iterator]: execute,
				}),
			);
		expect(() =>
			validateHtmlJsonBindingSourcesSelection({ ...selection, pointers }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(execute).not.toHaveBeenCalled();
	},
);

it("does not coerce source, binding or pointer values", () => {
	const coerce = vi.fn(() => "/first");
	expect(() =>
		selectHtmlJsonBindingSources({ toString: coerce } as never, selection),
	).toThrow();
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({
			...selection,
			binding: { toString: coerce },
		}),
	).toThrow();
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({
			...selection,
			pointers: [{ toString: coerce }],
		}),
	).toThrow();
	expect(coerce).not.toHaveBeenCalled();
	expect(() =>
		selectHtmlJsonBindingSources(script(), selection, true as never),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	"const",
	"default",
	"true",
	"null",
	"let",
	"yield",
	"await",
	"interface",
	"eval",
	"arguments",
])("preserves the parent's restricted binding validation for %s", (binding) => {
	expect(() =>
		validateHtmlJsonBindingSourceSelection({
			scriptId: "data",
			binding,
			pointer: "",
		}),
	).toThrow();
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({ ...selection, binding }),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each(
	[
		["/first", "/first"],
		["", ""],
		["/a~1b", "/a~1b"],
	].map((pointers) => ({ pointers })),
)("explicitly rejects duplicate pointer strings %#", ({ pointers }) => {
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({ ...selection, pointers }),
	).toThrow("Duplicate JSON binding pointers");
});

it.each(
	[["/first", "/missing"], ["/missing", "/second"], ["/missing"]].map(
		(pointers) => ({ pointers }),
	),
)("rejects the whole batch when a pointer is absent %#", ({ pointers }) => {
	expect(() =>
		selectHtmlJsonBindingSources(script(), { ...selection, pointers }),
	).toThrow(expect.objectContaining({ code: "not-found" }));
});

it.each([
	'{"first":1,"second":2,"unused":{"same":0,"same":1}}',
	'{"first":1,"second":2,"unused":{"same":0,"\\u0073ame":1}}',
	'{"first":1,"second":2,"unused":undefined}',
	'{"first":1,"second":2,}',
])("strictly validates nonselected literal content %#", (literal) => {
	expect(() =>
		selectHtmlJsonBindingSources(script(literal), selection),
	).toThrow(expect.objectContaining({ code: "invalid-input" }));
});

it.each([
	`${script()}${script()}`,
	`${script()}<div id="data">Duplicate</div>`,
	`<noscript>${script()}</noscript>${script()}`,
	`<template>${script()}</template>${script()}`,
	'<script id="data" id="other">const payload={"first":1,"second":2};</script>',
	'<script id="data" src="/asset">const payload={"first":1,"second":2};</script>',
	'<script id="data" type="module">const payload={"first":1,"second":2};</script>',
	'<script id="data" type="application/json">{"first":1,"second":2}</script>',
	'<script id="data">const payload={"first":1,"second":2} + call();</script>',
	'<script id="data">const payload={"first":1,"second":2}, other={};</script>',
	'<script id="data">const different={"first":1,"second":2};</script>',
	'<script id="data">const payload={"first":1,"second":2};',
])("retains unique-script and initial-literal grammar %#", (source) => {
	expect(() => selectHtmlJsonBindingSources(source, selection)).toThrow(
		expect.objectContaining({ code: "invalid-input" }),
	);
});

it("uses source-only lexical rules without interpreting trailing code", () => {
	const trailing =
		'payload.first = call(); throw new Error("Do not execute"); {{{';
	const source = `<script>const text='<script id="data">';</script><template hidden><noscript>${script(undefined, trailing)}</noscript></template>`;
	const result = selectHtmlJsonBindingSources(source, selection);
	expect(result.values.map((value) => value.text)).toEqual(['"One"', '"Two"']);
	expect(
		source.slice(
			result.metadata.trailingSource.start,
			result.metadata.trailingSource.end,
		),
	).toBe(trailing);
	expect(result.metadata.trailingSource.evaluated).toBe(false);
	expect(() =>
		selectHtmlJsonBindingSources(`<!--${script()}-->`, selection),
	).toThrow(expect.objectContaining({ code: "not-found" }));
});

it("keeps old limits unchanged and bounds ordered pointer count to 32", () => {
	expect(htmlSourceJsonBindingLimits).toEqual({
		...htmlSourceJsonLimits,
		maxBindingCodeUnits: 256,
	});
	expect(htmlSourceJsonBindingBatchLimits).toEqual({
		maxPointers: 32,
		maxOutputBytes: 65536,
	});
	expect(Object.isFrozen(htmlSourceJsonBindingBatchLimits)).toBe(true);
	const pointers = Array.from({ length: 32 }, (_, index) => `/${index}`);
	const source = script(
		`[${Array.from({ length: 32 }, (_, index) => index).join(",")}]`,
	);
	expect(
		selectHtmlJsonBindingSources(source, { ...selection, pointers }).values,
	).toHaveLength(32);
	expect(() =>
		validateHtmlJsonBindingSourcesSelection({
			...selection,
			pointers: [...pointers, "/32"],
		}),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	for (const pointer of ["/".repeat(129), `/${"x".repeat(4096)}`])
		expect(() =>
			validateHtmlJsonBindingSourcesSelection({
				...selection,
				pointers: [pointer],
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("counts every selected byte including overlapping source spans", () => {
	const source = script(`{"first":"${"x".repeat(40000)}"}`);
	const pointers = ["", "/first"];
	for (const pointer of pointers) {
		const single = selectHtmlJsonBindingSource(source, {
			scriptId: "data",
			binding: "payload",
			pointer,
		});
		expect(single.text.length).toBeLessThan(
			htmlSourceJsonBindingBatchLimits.maxOutputBytes,
		);
	}
	expect(() =>
		selectHtmlJsonBindingSources(source, { ...selection, pointers }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("accepts exactly 65536 aggregate bytes and rejects one more byte", () => {
	const text = "x".repeat(32766);
	const source = script(`{"first":"${text}","second":"${text}"}`);
	const result = selectHtmlJsonBindingSources(source, selection);
	expect(
		result.values.reduce((bytes, value) => bytes + value.text.length, 0),
	).toBe(65536);
	expect(() =>
		selectHtmlJsonBindingSources(
			script(`{"first":"${text}","second":"${text}x"}`),
			selection,
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});

it("charges UTF-8 bytes rather than UTF-16 units across all results", () => {
	const text = "😀".repeat(8192);
	const source = script(`{"first":"${text}","second":"${text}"}`);
	for (const pointer of selection.pointers)
		expect(
			selectHtmlJsonBindingSources(source, {
				...selection,
				pointers: [pointer],
			}).values,
		).toHaveLength(1);
	expect(() => selectHtmlJsonBindingSources(source, selection)).toThrow(
		expect.objectContaining({ code: "resource-limit" }),
	);
});

it("keeps small batch output from large literals within existing parser bounds", () => {
	const source = script(
		`{"first":1,"second":2,"ignored":"${"x".repeat(300000)}"}`,
	);
	expect(
		selectHtmlJsonBindingSources(source, selection).values.map(
			(value) => value.text,
		),
	).toEqual(["1", "2"]);
	const depth = jsonSource.jsonSourceSelectionLimits.maxDepth + 2;
	const nodes = `[${Array(jsonSource.jsonSourceSelectionLimits.maxNodes).fill("0").join(",")}]`;
	for (const input of [
		" ".repeat(htmlSourceJsonBindingLimits.maxSourceCodeUnits + 1),
		script(
			undefined,
			" ".repeat(htmlSourceJsonBindingLimits.maxScriptCodeUnits),
		),
		"<br>".repeat(htmlSourceJsonBindingLimits.maxTokens + 1) + script(),
		script(`${"[".repeat(depth)}0${"]".repeat(depth)}`),
		script(`{"first":1,"second":2,"ignored":${nodes}}`),
	])
		expect(() => selectHtmlJsonBindingSources(input, selection)).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
});

it("closes cursors after success, missing pointers, malformed JSON and cancellation", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	selectHtmlJsonBindingSources(script(), selection);
	expect(() =>
		selectHtmlJsonBindingSources(script('{"first":1}'), selection),
	).toThrow();
	expect(() =>
		selectHtmlJsonBindingSources(script('{"first":1,"first":2}'), selection),
	).toThrow();
	let calls = 0;
	expect(() =>
		selectHtmlJsonBindingSources(script(), selection, () => {
			if (++calls === 3) throw new Error("HTML scan cancelled");
		}),
	).toThrow("HTML scan cancelled");
	expect(close).toHaveBeenCalledTimes(4);
	for (const cursor of close.mock.contexts) {
		expect(cursor).toBeInstanceOf(HtmlTokenCursor);
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
	}
});

it("checks cancellation during the single strict JSON validation", () => {
	const original = jsonSource.selectJsonSourceSpans;
	let validating = false;
	vi.spyOn(jsonSource, "selectJsonSourceSpans").mockImplementation(
		(source, pointers, options) => {
			validating = true;
			try {
				return original(source, pointers, options);
			} finally {
				validating = false;
			}
		},
	);
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	let calls = 0;
	expect(() =>
		selectHtmlJsonBindingSources(
			script(`{"first":1,"second":2,"ignored":"${"x".repeat(10000)}"}`),
			selection,
			() => {
				if (validating && ++calls === 3)
					throw new Error("JSON validation cancelled");
			},
		),
	).toThrow("JSON validation cancelled");
	expect(close).toHaveBeenCalledTimes(1);
	for (const cursor of close.mock.contexts)
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
});

it("checks cancellation before publishing any batch values", () => {
	const original = jsonSource.selectJsonSourceSpans;
	let validated = false;
	vi.spyOn(jsonSource, "selectJsonSourceSpans").mockImplementation(
		(source, pointers, options) => {
			const result = original(source, pointers, options);
			validated = true;
			return result;
		},
	);
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	expect(() =>
		selectHtmlJsonBindingSources(script(), selection, () => {
			if (validated) throw new Error("Output cancelled");
		}),
	).toThrow("Output cancelled");
	expect(close).toHaveBeenCalledTimes(1);
	for (const cursor of close.mock.contexts)
		if (cursor instanceof HtmlTokenCursor) expect(cursor.closed).toBe(true);
});

it("does not create a cursor for rejected input or initial cancellation", () => {
	const close = vi.spyOn(HtmlTokenCursor.prototype, "close");
	expect(() =>
		selectHtmlJsonBindingSources(script(), { ...selection, pointers: [] }),
	).toThrow();
	expect(() =>
		selectHtmlJsonBindingSources(script(), selection, () => {
			throw new Error("Already cancelled");
		}),
	).toThrow("Already cancelled");
	expect(close).not.toHaveBeenCalled();
});
