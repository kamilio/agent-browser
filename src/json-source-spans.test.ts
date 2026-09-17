import { expect, it, vi } from "vitest";
import {
	type JsonSourceSpanOptions,
	jsonSourceSelectionLimits,
	jsonSourceSpanProfiles,
	selectJsonSource,
	selectJsonSourceSpans,
} from "./json-source-selection.js";

function errorCode(action: () => unknown, code: string) {
	expect(action).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
}

it("selects nested and overlapping spans in input order without copying payloads", () => {
	const source =
		' \n{"emoji":"😀","items":[true,{"a/b":{"~":7}}],"empty":null}\t';
	const pointers = [
		"/items/1/a~1b/~0",
		"",
		"/absent",
		"/items",
		"/empty",
		"/emoji",
	];
	const result = selectJsonSourceSpans(source, pointers);
	expect(result.profile).toBe("default");
	expect(
		result.selections.map(
			(selection) => selection && source.slice(selection.start, selection.end),
		),
	).toEqual([
		"7",
		source.trim(),
		null,
		'[true,{"a/b":{"~":7}}]',
		"null",
		'"😀"',
	]);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.selections)).toBe(true);
	for (const [index, selection] of result.selections.entries()) {
		if (!selection) continue;
		expect(selection).toEqual(
			selectJsonSource(source, pointers[index]).metadata,
		);
		expect(Object.isFrozen(selection)).toBe(true);
		expect(selection).not.toHaveProperty("text");
	}
});

it("performs one validation traversal regardless of pointer count", () => {
	const source = JSON.stringify({
		values: Array.from({ length: 500 }, (_, index) => ({
			index,
			name: "entry",
		})),
	});
	const single = vi.fn();
	const multiple = vi.fn();
	selectJsonSource(source, "/values/0/index", single);
	selectJsonSourceSpans(
		source,
		Array.from({ length: 32 }, (_, index) => `/values/${index}/index`),
		{ checkpoint: multiple },
	);
	expect(multiple.mock.calls.length).toBe(single.mock.calls.length);
});

it.each([[], null, {}, "", [null], [undefined], new Array(1)])(
	"rejects invalid pointer lists %j",
	(pointers) => {
		errorCode(
			() =>
				selectJsonSourceSpans("{}", pointers as unknown as readonly unknown[]),
			"invalid-input",
		);
	},
);

it.each([
	["", ""],
	["/a", "/a"],
	["/~0", "/~0"],
])("rejects duplicate pointers %j", (...pointers) => {
	errorCode(() => selectJsonSourceSpans("{}", pointers), "invalid-input");
});

it("bounds pointer count, size and depth for every profile", () => {
	for (const profile of ["default", "long-v1"] as const) {
		errorCode(
			() =>
				selectJsonSourceSpans(
					"{}",
					Array.from({ length: 33 }, (_, index) => `/${index}`),
					{ profile },
				),
			"resource-limit",
		);
		errorCode(
			() =>
				selectJsonSourceSpans("{}", ["", `/${"x".repeat(4096)}`], { profile }),
			"resource-limit",
		);
		errorCode(
			() => selectJsonSourceSpans("{}", ["", "/x".repeat(129)], { profile }),
			"resource-limit",
		);
	}
});

it.each([
	null,
	false,
	"long-v1",
	[],
	{ profile: "toString" },
	{ profile: null },
	{ checkpoint: true },
])("rejects invalid options %j", (options) => {
	errorCode(
		() =>
			selectJsonSourceSpans(
				"{}",
				[""],
				options as unknown as JsonSourceSpanOptions,
			),
		"invalid-input",
	);
});

it("keeps missing paths distinct from null values and does not traverse inherited names", () => {
	const source = '{"null":null,"values":[5],"__proto__":{"constructor":4}}';
	const pointers = [
		"/null",
		"/null/x",
		"/values/01",
		"/values/length",
		"/toString",
		"/__proto__/constructor",
	];
	const { selections } = selectJsonSourceSpans(source, pointers);
	expect(selections.map((selection) => selection?.valueKind ?? null)).toEqual([
		"null",
		null,
		null,
		null,
		null,
		"number",
	]);
});

it.each([
	'{"keep":1,"bad":{"same":1,"same":2}}',
	String.raw`{"keep":1,"bad":{"a":1,"\u0061":2}}`,
	'{"keep":1,"bad":[1,]}',
	'{"keep":1} false',
	'{"keep":1,"bad":01}',
	'{"keep":1,"bad":NaN}',
	'{"keep":1,"bad":"\\uZZZZ"}',
])("rejects malformed unselected content %s", (source) => {
	errorCode(
		() => selectJsonSourceSpans(source, ["/keep", "/absent"]),
		"invalid-input",
	);
});

it("preserves exact default limits and requires explicit opt-in for long data", () => {
	expect(jsonSourceSpanProfiles.default).toBe(jsonSourceSelectionLimits);
	expect(jsonSourceSpanProfiles["long-v1"]).toEqual({
		...jsonSourceSelectionLimits,
		maxSourceCodeUnits: 4_000_000,
		maxNodes: 1_000_000,
	});
	expect(Object.isFrozen(jsonSourceSpanProfiles)).toBe(true);
	expect(Object.isFrozen(jsonSourceSpanProfiles["long-v1"])).toBe(true);
	const source = `{"keep":1}${" ".repeat(2_100_000)}`;
	errorCode(() => selectJsonSourceSpans(source, ["/keep"]), "resource-limit");
	errorCode(() => selectJsonSource(source, "/keep"), "resource-limit");
	const result = selectJsonSourceSpans(source, ["/keep"], {
		profile: "long-v1",
	});
	expect(result.profile).toBe("long-v1");
	expect(result.selections[0]?.sourceCodeUnits).toBe(source.length);
	expect(result.selections[0]?.selectedCodeUnits).toBe(1);
});

it("enforces the exact long code-unit bound including whitespace", () => {
	const source = `0${" ".repeat(3_999_999)}`;
	expect(
		selectJsonSourceSpans(source, [""], { profile: "long-v1" }).selections[0]
			?.end,
	).toBe(1);
	errorCode(
		() => selectJsonSourceSpans(`${source} `, [""], { profile: "long-v1" }),
		"resource-limit",
	);
});

it("enforces value-count limits even for unselected arrays", () => {
	const source = `[${"0,".repeat(99_999)}0]`;
	errorCode(() => selectJsonSourceSpans(source, ["/absent"]), "resource-limit");
	expect(
		selectJsonSourceSpans(source, ["/0"], { profile: "long-v1" }).selections[0]
			?.valueKind,
	).toBe("number");
	const maximum = `[${"0,".repeat(999_998)}0]`;
	expect(
		selectJsonSourceSpans(maximum, ["/999998"], { profile: "long-v1" })
			.selections[0]?.valueKind,
	).toBe("number");
	errorCode(
		() =>
			selectJsonSourceSpans(`[${"0,".repeat(999_999)}0]`, ["/absent"], {
				profile: "long-v1",
			}),
		"resource-limit",
	);
});

it("does not expand the depth limit in long mode", () => {
	const source = `${"[".repeat(128)}0${"]".repeat(128)}`;
	expect(
		selectJsonSourceSpans(source, [""], { profile: "long-v1" }).selections[0]
			?.valueKind,
	).toBe("array");
	errorCode(
		() => selectJsonSourceSpans(`[${source}]`, [""], { profile: "long-v1" }),
		"resource-limit",
	);
});

it.each([1, 2, 7, 100])(
	"propagates cancellation at checkpoint %i without a partial result",
	(stop) => {
		const source = JSON.stringify({
			keep: true,
			entries: Array.from({ length: 1000 }, (_, index) => index),
		});
		const cancellation = new Error("cancelled");
		let calls = 0;
		expect(() =>
			selectJsonSourceSpans(source, ["/keep", "/entries/999"], {
				profile: "long-v1",
				checkpoint: () => {
					if (++calls === stop) throw cancellation;
				},
			}),
		).toThrow(cancellation);
		expect(calls).toBe(stop);
	},
);
