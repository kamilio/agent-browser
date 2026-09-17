import { expect, it, vi } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type SourceIndexSearchOptions,
	searchSourceIndex,
	sourceSearchIndexLimits,
} from "./source-search-index.js";

function index(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		docnames: ["guide/start", "reference", "tutorial", "appendix"],
		titles: ["Getting started", "Reference", "Tutorial", "Appendix"],
		terms: { alpha: [0, 1, 2], beta: [0, 2] },
		titleterms: { alpha: [1, 3], beta: [1, 3] },
		...overrides,
	});
}

function envelope(json = index()): string {
	return `Search.setIndex(${json});`;
}

function errorCode(action: () => unknown, code = "invalid-input") {
	expect(action).toThrowError(
		expect.objectContaining({ name: "AgentBrowserError", code }),
	);
}

it("unions title/body membership, intersects distinct terms and orders deterministically", () => {
	const result = searchSourceIndex(envelope(), ["alpha", "beta", "alpha"]);
	expect(result).toMatchObject({
		kind: "source-index-search-v1",
		semantics: "source-only-literal-term-intersection",
		semanticValidation: "selected-fields-only",
		titleFormat: "index-source",
		profile: "default",
		terms: ["alpha", "beta"],
		totalMatches: 4,
		truncated: false,
	});
	expect(result.documents).toEqual([
		{ docId: 1, docname: "reference", title: "Reference", titleMatches: 2 },
		{ docId: 3, docname: "appendix", title: "Appendix", titleMatches: 2 },
		{
			docId: 0,
			docname: "guide/start",
			title: "Getting started",
			titleMatches: 0,
		},
		{ docId: 2, docname: "tutorial", title: "Tutorial", titleMatches: 0 },
	]);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(result.documents)).toBe(true);
	expect(Object.isFrozen(result.documents[0])).toBe(true);
});

it.each([1, 2, 4, 20, 100])(
	"reports totals independently of limit %i",
	(limit) => {
		const result = searchSourceIndex(envelope(), ["alpha", "beta"], { limit });
		expect(result.totalMatches).toBe(4);
		expect(result.documents.map((document) => document.docId)).toEqual(
			[1, 3, 0, 2].slice(0, limit),
		);
		expect(result.truncated).toBe(limit < 4);
	},
);

it("defaults to twenty results without modifying inputs", () => {
	const docnames = Array.from(
		{ length: 25 },
		(_, docId) => `document-${docId}`,
	);
	const source = envelope(
		index({
			docnames,
			titles: docnames,
			terms: { alpha: docnames.map((_, docId) => docId) },
		}),
	);
	const terms = Object.freeze(["alpha"]);
	const options = Object.freeze({});
	const result = searchSourceIndex(source, terms, options);
	expect(result.documents).toHaveLength(20);
	expect(result.totalMatches).toBe(25);
	expect(result.truncated).toBe(true);
	expect(terms).toEqual(["alpha"]);
});

it.each([
	[{}, {}, []],
	[{ alpha: [] }, {}, []],
	[{ alpha: 0 }, {}, [0]],
	[{}, { alpha: 0 }, [0]],
	[{ alpha: 0 }, { alpha: 0 }, [0]],
	[{ alpha: [0, 2] }, { alpha: [2, 3] }, [2, 3, 0]],
])(
	"handles missing, empty and scalar postings: %j / %j",
	(terms, titleterms, expected) => {
		const result = searchSourceIndex(envelope(index({ terms, titleterms })), [
			"alpha",
		]);
		expect(result.documents.map((document) => document.docId)).toEqual(
			expected,
		);
		expect(result.totalMatches).toBe(expected.length);
		expect(result.truncated).toBe(false);
	},
);

it("does not treat missing terms as optional", () => {
	expect(searchSourceIndex(envelope(), ["alpha", "missing"]).documents).toEqual(
		[],
	);
	expect(
		searchSourceIndex(
			envelope(index({ terms: { alpha: 0, beta: 1 }, titleterms: {} })),
			["alpha", "beta"],
		).totalMatches,
	).toBe(0);
});

it.each([1, 2, 7, 20])(
	"agrees with independent full JSON parsing at limit %i",
	(limit) => {
		const docnames = Array.from({ length: 40 }, (_, docId) => `page-${docId}`);
		const query = ["red", "green", "blue"];
		const terms = Object.fromEntries(
			query.map((term, termIndex) => [
				term,
				docnames.flatMap((_, docId) =>
					docId % (termIndex + 2) === 0 ? [docId] : [],
				),
			]),
		);
		const titleterms = Object.fromEntries(
			query.map((term, termIndex) => [
				term,
				docnames.flatMap((_, docId) =>
					(docId + termIndex) % 3 === 0 ? [docId] : [],
				),
			]),
		);
		const json = index({ docnames, titles: docnames, terms, titleterms });
		const parsed = JSON.parse(json) as {
			docnames: string[];
			titles: string[];
			terms: Record<string, number[]>;
			titleterms: Record<string, number[]>;
		};
		for (const selected of [
			["red"],
			["green", "blue"],
			query,
			["blue", "red"],
			["missing", "red"],
		]) {
			const expected = parsed.docnames
				.flatMap((docname, docId) =>
					selected.every(
						(term) =>
							(parsed.terms[term] ?? []).includes(docId) ||
							(parsed.titleterms[term] ?? []).includes(docId),
					)
						? [
								{
									docId,
									docname,
									title: parsed.titles[docId],
									titleMatches: selected.filter((term) =>
										(parsed.titleterms[term] ?? []).includes(docId),
									).length,
								},
							]
						: [],
				)
				.sort(
					(left, right) =>
						right.titleMatches - left.titleMatches || left.docId - right.docId,
				);
			const result = searchSourceIndex(envelope(json), selected, { limit });
			expect(result.documents).toEqual(expected.slice(0, limit));
			expect(result.totalMatches).toBe(expected.length);
			expect(result.truncated).toBe(expected.length > limit);
		}
	},
);

it.each([
	"a/b",
	"m~n",
	"~1",
	"%2F",
	"é😀",
	"a\0b",
	"__proto__",
	"constructor",
	"toString",
	" ",
	'quote"',
	"line\nbreak",
])("escapes pointer segments and matches literal term %j", (term) => {
	const source = envelope(
		index({ terms: { [term]: 0 }, titleterms: { [term]: 0 } }),
	);
	const result = searchSourceIndex(source, [term]);
	expect(result.documents).toEqual([
		{
			docId: 0,
			docname: "guide/start",
			title: "Getting started",
			titleMatches: 1,
		},
	]);
	expect(result.provenance.selections[5]?.pointer).toBe(
		`/terms/${term.replace(/~/g, "~0").replace(/\//g, "~1")}`,
	);
});

it.each([
	"Alpha",
	"ALPHA",
	"alphas",
	" alpha",
	"alpha ",
	"alp",
	"constructor",
	"toString",
])("does not normalize, stem, fuzzy match or inherit %j", (term) => {
	expect(searchSourceIndex(envelope(), [term]).totalMatches).toBe(0);
});

it("preserves source strings without constructing URLs or parsing title markup", () => {
	const title =
		'<code class="docutils literal"><span class="pre">json</span></code> 😀 <script>throw new Error("inert")</script>';
	const result = searchSourceIndex(
		envelope(
			index({
				docnames: ["../chapter#literal"],
				titles: [title],
				terms: { alpha: 0 },
				titleterms: {},
			}),
		),
		["alpha"],
	);
	expect(result.documents).toEqual([
		{
			docId: 0,
			docname: "../chapter#literal",
			title,
			titleMatches: 0,
		},
	]);
	expect(result.titleFormat).toBe("index-source");
});

it.each([
	["", ""],
	[" \t\r\n", ";\n\t "],
	["\r", " \t; \r\n"],
])(
	"accepts JSON envelope whitespace and a single optional semicolon",
	(before, after) => {
		const json = ` \n${index({ unused: "😀" })}\t `;
		const source = `${before}Search.setIndex(${json})${after}`;
		const result = searchSourceIndex(source, ["alpha", "absent"]);
		expect(result.jsonRange).toEqual({
			start: before.length + "Search.setIndex(".length,
			end: before.length + "Search.setIndex(".length + json.length,
			offsetBasis: "document-text-utf16",
		});
		expect(source.slice(result.jsonRange.start, result.jsonRange.end)).toBe(
			json,
		);
		expect(result.provenance.offsetBasis).toBe("json-text-utf16");
		expect(result.provenance.selections).toHaveLength(9);
		expect(result.provenance.selections.slice(7)).toEqual([null, null]);
		for (const selection of result.provenance.selections) {
			if (!selection) continue;
			expect(selection.sourceCodeUnits).toBe(json.length);
			expect(selection.offsetBasis).toBe("document-text-utf16");
			expect(selection.duplicateMembers).toBe("rejected");
			expect(selection.selectedCodeUnits).toBe(selection.end - selection.start);
			expect(
				source.slice(
					result.jsonRange.start + selection.start,
					result.jsonRange.start + selection.end,
				),
			).toBe(json.slice(selection.start, selection.end));
		}
		const docnamesSelection = result.provenance.selections[1];
		if (!docnamesSelection) throw new Error("Missing docnames provenance");
		expect(
			JSON.parse(json.slice(docnamesSelection.start, docnamesSelection.end)),
		).toEqual(["guide/start", "reference", "tutorial", "appendix"]);
	},
);

it.each([
	"",
	"{}",
	"search.setIndex({})",
	"Search.setIndex ({})",
	"Search .setIndex({})",
	"Search['setIndex']({})",
	"new Search.setIndex({})",
	"Search.setIndex({});;",
	"Search.setIndex({});alert(1)",
	"alert(1);Search.setIndex({})",
	"/* comment */Search.setIndex({})",
	"Search.setIndex({})// comment",
	"Search.setIndex(({}))",
	"Search.setIndex({}, {})",
	"Search.setIndex()",
	"Search.setIndex({)",
	"Search.setIndex({}",
	"Search.setIndex({}));",
	"\ufeffSearch.setIndex({})",
	"\u00a0Search.setIndex({})",
	"Search.setIndex({})\v",
	"Search.setIndex(undefined)",
	"Search.setIndex(()=>({}))",
])("rejects malformed or executable envelope %j", (source) => {
	errorCode(() => searchSourceIndex(source, ["alpha"]));
});

it.each([
	'"unused":undefined',
	'"unused":NaN',
	'"unused":Infinity',
	'"unused":[1,,2]',
	'"unused":[1,]',
	'"unused":{"field":1,}',
	'"unused":01',
	'"unused":"\\x41"',
	'"unused":/* comment */0',
	'"unused":{"same":0,"same":1}',
	String.raw`"unused":{"a":0,"\u0061":1}`,
	'"terms":{}',
	'"unused":true trailing',
])(
	"validates all JSON syntax and duplicate keys before selecting: %s",
	(member) => {
		const json = `${index().slice(0, -1)},${member}}`;
		errorCode(() => searchSourceIndex(envelope(json), ["missing"]));
	},
);

it.each(["null", "[]", "true", "1", '"text"'])(
	"requires an object root: %s",
	(json) => {
		errorCode(() => searchSourceIndex(envelope(json), ["alpha"]));
	},
);

it.each(["terms", "titleterms"])(
	"requires the %s object even for an absent query",
	(field) => {
		for (const value of [undefined, null, [], 1, "", false]) {
			errorCode(() =>
				searchSourceIndex(envelope(index({ [field]: value })), ["missing"]),
			);
		}
	},
);

it.each(["docnames", "titles"])("validates every entry in %s", (field) => {
	for (const value of [
		undefined,
		null,
		{},
		"",
		[""],
		[1],
		[null],
		[false],
		[{}],
		[[]],
		["valid", null],
	]) {
		errorCode(() =>
			searchSourceIndex(envelope(index({ [field]: value })), ["missing"]),
		);
	}
	errorCode(() =>
		searchSourceIndex(envelope(index({ [field]: ["valid"] })), ["alpha"]),
	);
});

it("accepts an empty document collection only with empty or absent selected postings", () => {
	const empty = { docnames: [], titles: [], terms: {}, titleterms: {} };
	expect(
		searchSourceIndex(envelope(index(empty)), ["alpha"]).totalMatches,
	).toBe(0);
	errorCode(() =>
		searchSourceIndex(envelope(index({ ...empty, terms: { alpha: 0 } })), [
			"alpha",
		]),
	);
});

it.each(["terms", "titleterms"])(
	"rejects invalid selected %s posting shapes, IDs and duplicates",
	(field) => {
		for (const posting of [
			null,
			true,
			false,
			"0",
			{},
			{ "0": 0 },
			[[0]],
			[null],
			["0"],
			[false],
			-1,
			4,
			0.5,
			Number.MAX_SAFE_INTEGER,
			Number.MAX_SAFE_INTEGER + 1,
			[0, 0],
			[0, -0],
			[0, 4],
		]) {
			errorCode(() =>
				searchSourceIndex(envelope(index({ [field]: { alpha: posting } })), [
					"alpha",
				]),
			);
		}
	},
);

it.each([
	"1e999",
	"9007199254740993",
	"[0,,1]",
	"[0,]",
	"[-1]",
	"[1.25]",
	"[{}]",
])("rejects invalid raw posting %s", (posting) => {
	const json = index({ terms: {}, titleterms: {} }).replace(
		'"terms":{}',
		`"terms":{"alpha":${posting}}`,
	);
	errorCode(() => searchSourceIndex(envelope(json), ["alpha"]));
});

it("checks every selected posting even after an empty intersection", () => {
	errorCode(() =>
		searchSourceIndex(
			envelope(index({ terms: { beta: null }, titleterms: {} })),
			["missing", "beta"],
		),
	);
	errorCode(() =>
		searchSourceIndex(
			envelope(index({ terms: {}, titleterms: { alpha: null } })),
			["alpha"],
		),
	);
});

it("does not claim semantic validation of unselected index fields", () => {
	const source = envelope(
		index({
			terms: { alpha: 0, unused: { arbitrary: [null, -9, "not a posting"] } },
			titleterms: { unused: false },
			filenames: false,
			objects: [null],
			envversion: "unknown",
		}),
	);
	const result = searchSourceIndex(source, ["alpha"]);
	expect(result.totalMatches).toBe(1);
	expect(result.semanticValidation).toBe("selected-fields-only");
	errorCode(() => searchSourceIndex(source, ["unused"]));
});

it("does not materialize selected arrays until the entire JSON validates", () => {
	const json = `${index().slice(0, -1)},"unused":[1,]}`;
	const source = envelope(json);
	const parse = vi.spyOn(JSON, "parse");
	try {
		errorCode(() => searchSourceIndex(source, ["alpha"]));
		expect(parse.mock.calls.every(([text]) => text.startsWith('"'))).toBe(true);
	} finally {
		parse.mockRestore();
	}
});

it.each([[], [""], ["alpha", ""], [null], [1], [undefined], "alpha", null, {}])(
	"rejects invalid query terms %j",
	(terms) => {
		errorCode(() => searchSourceIndex(envelope(), terms as readonly string[]));
	},
);

it("rejects sparse term lists instead of silently skipping holes", () => {
	errorCode(() => searchSourceIndex(envelope(), new Array<string>(1)));
});

it("bounds input terms before deduplication and counts each distinct title term once", () => {
	const source = envelope();
	const terms = Array.from(
		{ length: sourceSearchIndexLimits.maxInputTerms },
		() => "alpha",
	);
	const result = searchSourceIndex(source, terms);
	expect(result.terms).toEqual(["alpha"]);
	expect(result.documents.map((document) => document.titleMatches)).toEqual([
		1, 1, 0, 0,
	]);
	for (const count of [9, 100_000]) {
		const checkpoint = vi.fn();
		errorCode(
			() =>
				searchSourceIndex(
					source,
					Array.from({ length: count }, () => "alpha"),
					{ checkpoint },
				),
			"resource-limit",
		);
		expect(checkpoint).toHaveBeenCalledTimes(1);
	}
});

it("enforces eight distinct terms and UTF-16 limits", () => {
	const terms = Array.from(
		{ length: 8 },
		(_, termIndex) => `term-${termIndex}`,
	);
	const postings = Object.fromEntries(terms.map((term) => [term, 0]));
	expect(
		searchSourceIndex(
			envelope(index({ terms: postings, titleterms: postings })),
			terms,
		).documents[0].titleMatches,
	).toBe(8);
	errorCode(
		() => searchSourceIndex(envelope(), [...terms, "ninth"]),
		"resource-limit",
	);
	for (const term of ["a".repeat(128), "😀".repeat(64)]) {
		expect(
			searchSourceIndex(envelope(index({ terms: { [term]: 0 } })), [term])
				.totalMatches,
		).toBe(1);
		errorCode(
			() => searchSourceIndex(envelope(), [`${term}a`]),
			"resource-limit",
		);
	}
});

it.each([
	0,
	-1,
	101,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	null,
	"1",
	true,
])("rejects invalid result limit %j", (limit) => {
	errorCode(() =>
		searchSourceIndex(envelope(), ["alpha"], {
			limit,
		} as SourceIndexSearchOptions),
	);
});

it.each([null, [], true, "options", 1])(
	"rejects invalid options %j",
	(options) => {
		errorCode(() =>
			searchSourceIndex(
				envelope(),
				["alpha"],
				options as SourceIndexSearchOptions,
			),
		);
	},
);

it.each([null, "long", "", true])(
	"rejects unsupported profile %j",
	(profile) => {
		errorCode(() =>
			searchSourceIndex(envelope(), ["alpha"], {
				profile,
			} as SourceIndexSearchOptions),
		);
	},
);

it.each([null, 0, "source", {}])(
	"rejects non-function checkpoint %j",
	(checkpoint) => {
		errorCode(() =>
			searchSourceIndex(envelope(), ["alpha"], {
				checkpoint,
			} as SourceIndexSearchOptions),
		);
	},
);

it.each([null, undefined, 1, {}, []])(
	"rejects non-string source %j",
	(source) => {
		errorCode(() => searchSourceIndex(source as string, ["alpha"]));
	},
);

it.each(["docnames", "titles"])(
	"bounds %s length and string code units",
	(field) => {
		const max = sourceSearchIndexLimits.maxDocuments;
		const docnames = Array.from(
			{ length: max },
			(_, docId) => `document-${docId}`,
		);
		const valid = {
			docnames,
			titles: docnames,
			terms: { alpha: max - 1 },
			titleterms: {},
		};
		expect(
			searchSourceIndex(envelope(index(valid)), ["alpha"]).documents[0].docId,
		).toBe(max - 1);
		errorCode(
			() =>
				searchSourceIndex(
					envelope(index({ ...valid, [field]: [...docnames, "overflow"] })),
					["alpha"],
				),
			"resource-limit",
		);
		for (const value of ["x".repeat(4096), "😀".repeat(2048)]) {
			const bounded = {
				docnames: ["doc"],
				titles: ["Title"],
				terms: { alpha: 0 },
				titleterms: {},
				[field]: [value],
			};
			expect(
				searchSourceIndex(envelope(index(bounded)), ["alpha"]).totalMatches,
			).toBe(1);
			errorCode(
				() =>
					searchSourceIndex(
						envelope(index({ ...bounded, [field]: [`${value}x`] })),
						["alpha"],
					),
				"resource-limit",
			);
		}
	},
);

it.each(["default", "long-v1"] as const)(
	"bounds the complete %s envelope, not merely its JSON",
	(profile) => {
		const max = profile === "default" ? 2_000_000 : 4_000_000;
		const minimal = envelope();
		const padded = `${" ".repeat(max - minimal.length)}${minimal}`;
		expect(searchSourceIndex(padded, ["alpha"], { profile }).profile).toBe(
			profile,
		);
		errorCode(
			() => searchSourceIndex(` ${padded}`, ["alpha"], { profile }),
			"resource-limit",
		);
		const json = index({ unused: "x".repeat(max) });
		errorCode(
			() => searchSourceIndex(envelope(json), ["alpha"], { profile }),
			"resource-limit",
		);
	},
);

it("requires an explicit long profile for larger payloads and node counts", () => {
	for (const source of [
		envelope(index({ unused: "x".repeat(2_000_000) })),
		envelope(index({ unused: Array.from({ length: 100_001 }, () => 0) })),
	]) {
		errorCode(() => searchSourceIndex(source, ["alpha"]), "resource-limit");
		errorCode(
			() => searchSourceIndex(source, ["alpha"], { profile: "default" }),
			"resource-limit",
		);
		expect(
			searchSourceIndex(source, ["alpha"], { profile: "long-v1" }).totalMatches,
		).toBe(4);
	}
});

it("retains the long-profile node and both profiles' depth bounds", () => {
	const many = envelope(
		index({ unused: Array.from({ length: 1_000_001 }, () => 0) }),
	);
	errorCode(
		() => searchSourceIndex(many, ["alpha"], { profile: "long-v1" }),
		"resource-limit",
	);
	const nested = `${index().slice(0, -1)},"unused":${"[".repeat(130)}0${"]".repeat(130)}}`;
	for (const profile of ["default", "long-v1"] as const) {
		errorCode(
			() => searchSourceIndex(envelope(nested), ["alpha"], { profile }),
			"resource-limit",
		);
	}
});

it("propagates cancellation without translating the thrown value", () => {
	const failure = new AgentBrowserError("aborted", "stop query");
	const checkpoint = vi.fn(() => {
		throw failure;
	});
	expect(() =>
		searchSourceIndex(envelope(), ["alpha"], { checkpoint }),
	).toThrow(failure);
	expect(checkpoint).toHaveBeenCalledTimes(1);
});

it.each(["leading", "trailing", "json"])(
	"checks cancellation during long %s scanning",
	(location) => {
		const padding = " ".repeat(10_000);
		const source =
			location === "leading"
				? padding + envelope()
				: location === "trailing"
					? envelope() + padding
					: envelope(index({ unused: padding }));
		const failure = new Error("cancel scanning");
		let calls = 0;
		const checkpoint = () => {
			if (++calls === 5) throw failure;
		};
		expect(() => searchSourceIndex(source, ["alpha"], { checkpoint })).toThrow(
			failure,
		);
		expect(calls).toBe(5);
	},
);

it("propagates cancellation from every checkpoint including result processing", () => {
	const checkpoint = vi.fn();
	searchSourceIndex(envelope(), ["alpha", "beta"], { checkpoint });
	const total = checkpoint.mock.calls.length;
	expect(total).toBeGreaterThan(20);
	for (let stop = 1; stop <= total; stop++) {
		const failure = new Error(`cancel at ${stop}`);
		let calls = 0;
		expect(() =>
			searchSourceIndex(envelope(), ["alpha", "beta"], {
				checkpoint: () => {
					if (++calls === stop) throw failure;
				},
			}),
		).toThrow(failure);
		expect(calls).toBe(stop);
	}
});

it("parses only selected document arrays and present postings after validation", () => {
	const source = envelope(
		index({ unused: { arbitrary: ["large", "unselected"] } }),
	);
	const parse = vi.spyOn(JSON, "parse");
	try {
		searchSourceIndex(source, ["alpha", "missing"]);
		const calls = parse.mock.calls.map(([text]) => text);
		expect(calls).toContain(
			'["guide/start","reference","tutorial","appendix"]',
		);
		expect(calls).toContain(
			'["Getting started","Reference","Tutorial","Appendix"]',
		);
		expect(calls).toContain("[0,1,2]");
		expect(calls).toContain("[1,3]");
		expect(calls.every((text) => !text.startsWith("{"))).toBe(true);
	} finally {
		parse.mockRestore();
	}
});
