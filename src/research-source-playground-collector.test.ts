import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourcePlaygroundsCollector,
	fitResearchSourcePlaygrounds,
	reactPlaygroundRoute,
	researchSourcePlaygrounds,
	setResearchSourcePlaygrounds,
	type ReactPlaygroundRoute,
	type ResearchSourcePlaygrounds,
} from "./research-source-playgrounds.js";

const route: ReactPlaygroundRoute = {
	pathname: "/learn",
	markdownPath: ["learn"],
};
const trees: DocumentTree[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function element(
	tag: string,
	children: unknown,
	props: Record<string, unknown> = {},
) {
	return ["$r", tag, null, { ...props, children }];
}

function pre(code: unknown, props: Record<string, unknown> = {}) {
	return element("pre", element("code", code, props));
}

function sandpack(children: unknown = pre("const count = 1;\n")) {
	return element("Sandpack", children);
}

function payload(content: unknown = [sandpack()]) {
	return {
		page: "/[[...markdownPath]]",
		query: { markdownPath: ["learn"] },
		props: { pageProps: { content: JSON.stringify(content) } },
	};
}

function collectSource(source: string, checkpoint?: () => void) {
	const collector = new ResearchSourcePlaygroundsCollector(route, checkpoint);
	collector.add(source, 0, source.length, 0);
	return collector.finish();
}

function collect(content: unknown = [sandpack()]) {
	return collectSource(JSON.stringify(payload(content)));
}

function required(
	data: ResearchSourcePlaygrounds | undefined,
): ResearchSourcePlaygrounds {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing playground source metadata");
	return data;
}

function bytes(value: unknown) {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function frozen(data: ResearchSourcePlaygrounds) {
	expect(Object.isFrozen(data)).toBe(true);
	expect(Object.isFrozen(data.entries)).toBe(true);
	for (const entry of data.entries) {
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.source)).toBe(true);
	}
}

describe("React playground routes and source binding", () => {
	it.each([
		["https://react.dev/learn", "/learn", ["learn"]],
		["https://react.dev/learn/", "/learn", ["learn"]],
		[
			"https://react.dev/reference/react/use-state/?view=source#example",
			"/reference/react/use-state",
			["reference", "react", "use-state"],
		],
		[
			"https://react.dev/learn/example-2",
			"/learn/example-2",
			["learn", "example-2"],
		],
	])("accepts and normalizes %s", (value, pathname, markdownPath) => {
		expect(reactPlaygroundRoute(value as string)).toEqual({
			pathname,
			markdownPath,
		});
	});

	it.each([
		"http://react.dev/learn",
		"https://www.react.dev/learn",
		"https://react.dev.evil.test/learn",
		"https://react.dev@evil.test/learn",
		"https://user:password@react.dev/learn",
		"https://@react.dev/learn",
		"https://react.dev:443/learn",
		"https://react.dev:8443/learn",
		"https://react.dev/",
		"https://react.dev/blog",
		"https://react.dev/learning",
		"https://react.dev/learn//",
		"https://react.dev/learn/a//b",
		"https://react.dev/learn/Uppercase",
		"https://react.dev/learn/under_score",
		"https://react.dev/learn/café",
		"https://react.dev/learn/%61",
		"https://react.dev/learn/%2fhidden",
		"https://react.dev/learn/../reference",
		"https://react.dev/learn/./example",
		"https://react.dev/learn\\example",
		"https:\\react.dev/learn",
		" https://react.dev/learn",
		"https://react.dev/learn\n",
		"https://react.dev/lea\trn",
		"https://react.dev/learn?value=\u0000",
		"https://react.dev/learn#\u007f",
	])("rejects ambiguous or unrelated route %j", (value) => {
		expect(reactPlaygroundRoute(value)).toBeUndefined();
	});

	it("validates and snapshots the constructor route", () => {
		for (const candidate of [
			null,
			{},
			{ pathname: "/learn/", markdownPath: ["learn"] },
			{ pathname: "/learn", markdownPath: ["reference"] },
			{ pathname: "/learn", markdownPath: "learn" },
		])
			expect(
				() =>
					new ResearchSourcePlaygroundsCollector(
						candidate as ReactPlaygroundRoute,
					),
			).toThrow("Invalid playground source route");
		const mutable = { pathname: "/learn", markdownPath: ["learn"] };
		const collector = new ResearchSourcePlaygroundsCollector(mutable);
		mutable.pathname = "/reference";
		mutable.markdownPath[0] = "reference";
		const source = JSON.stringify(payload());
		collector.add(source, 0, source.length, 0);
		expect(required(collector.finish()).routePathname).toBe("/learn");
	});

	it("requires exact page and query binding including all segments", () => {
		for (const replacement of [
			{ page: "/learn" },
			{ page: "/[...markdownPath]" },
			{ query: {} },
			{ query: { markdownPath: "learn" } },
			{ query: { markdownPath: ["reference"] } },
			{ query: { markdownPath: ["learn", "extra"] } },
			{ query: { markdownPath: [] } },
		])
			expect(
				collectSource(JSON.stringify({ ...payload(), ...replacement })),
			).toBeUndefined();
		const collector = new ResearchSourcePlaygroundsCollector({
			pathname: "/reference/react/hooks",
			markdownPath: ["reference", "react", "hooks"],
		});
		const data = payload();
		data.query.markdownPath = ["reference", "react", "hooks"];
		const source = JSON.stringify(data);
		collector.add(source, 0, source.length, 0);
		expect(required(collector.finish()).routePathname).toBe(
			"/reference/react/hooks",
		);
	});
});

describe("bounded serialized Sandpack collection", () => {
	it("preserves literal code and source attributes without rendering or inference", () => {
		const literal =
			"<script>throw 'inert'</script>\r\n`backticks` &amp; café 😀\t\u0000\u001b\u202e\ud800";
		const data = required(
			collect([
				sandpack(
					pre(literal, {
						className: "language-js\u0000",
						meta: '``` title="literal.ts" hidden\n',
					}),
				),
			]),
		);
		expect(data).toEqual({
			kind: "react-sandpack-source-code-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "code-source",
			routePathname: "/learn",
			truncated: false,
			entries: [
				{
					source: {
						offset: 0,
						offsetBasis: "lf-normalized-utf16",
						path: "content[0].children.children",
						playgroundPath: "content[0]",
					},
					code: literal,
					className: "language-js\u0000",
					meta: '``` title="literal.ts" hidden\n',
				},
			],
		});
		frozen(data);
	});

	it("associates single/list children and nested owners in occurrence order", () => {
		const data = required(
			collect([
				sandpack([
					pre("outer first"),
					element("section", sandpack(pre("inner"))),
					pre("outer last", { className: "language-css" }),
				]),
				sandpack(pre("next")),
			]),
		);
		expect(
			data.entries.map((entry) => [
				entry.code,
				entry.source.path,
				entry.source.playgroundPath,
			]),
		).toEqual([
			["outer first", "content[0].children[0].children", "content[0]"],
			[
				"inner",
				"content[0].children[1].children.children.children",
				"content[0].children[1].children",
			],
			["outer last", "content[0].children[2].children", "content[0]"],
			["next", "content[1].children.children", "content[1]"],
		]);
		expect(data.truncated).toBe(false);
		expect(
			required(collect(sandpack(element("pre", [element("code", "")]))))
				.entries[0].code,
		).toBe("");
	});

	it("ignores arbitrary objects, attributes, malformed tuples and non-pre code", () => {
		const data = required(
			collect([
				pre("outside"),
				element("sandpack", pre("wrong component")),
				{ children: sandpack(pre("object")) },
				element("div", null, { example: sandpack(pre("attribute")) }),
				["$r", "Sandpack", null, { children: pre("extra tuple") }, "extra"],
				sandpack([
					element("code", "inline"),
					element("pre", element("span", element("code", "not direct"))),
					pre(["not", "a string"]),
					pre({ children: "not a string" }),
					element("pre", "plain text"),
					element("script", "inert()"),
					pre("kept", { hidden: true, filename: "invented.js" }),
				]),
			]),
		);
		expect(data.entries.map((entry) => entry.code)).toEqual(["kept"]);
		expect(data.entries[0]).not.toHaveProperty("filename");
		expect(data.entries[0]).not.toHaveProperty("visible");
		expect(data.entries[0]).not.toHaveProperty("supporting");
		expect(data.truncated).toBe(false);
	});

	it("requires own object fields rather than inherited payload data", () => {
		const ownPayload = payload();
		for (const decoded of [
			Object.create(ownPayload),
			{ ...ownPayload, query: Object.create(ownPayload.query) },
			{ ...ownPayload, props: Object.create(ownPayload.props) },
			{
				...ownPayload,
				props: { pageProps: Object.create(ownPayload.props.pageProps) },
			},
		]) {
			const parse = vi.spyOn(JSON, "parse").mockReturnValueOnce(decoded);
			expect(collectSource("{}")).toBeUndefined();
			parse.mockRestore();
		}
		const inheritedChildren = [
			"$r",
			"Sandpack",
			null,
			Object.create({ children: pre("hidden") }),
		];
		const parse = vi
			.spyOn(JSON, "parse")
			.mockReturnValueOnce(ownPayload)
			.mockReturnValueOnce(inheritedChildren);
		expect(collectSource("{}")).toBeUndefined();
		parse.mockRestore();
	});

	it("ignores malformed outer or nested JSON, missing content and unrelated roots", () => {
		for (const source of ["", "{", "null", "[]", "42", "{}", "{} trailing"])
			expect(collectSource(source)).toBeUndefined();
		for (const content of [
			"{",
			"null",
			"{}",
			"42",
			'"text"',
			"[]",
			"[] trailing",
			null,
			[],
		]) {
			const data = { ...payload(), props: { pageProps: { content } } };
			expect(collectSource(JSON.stringify(data))).toBeUndefined();
		}
		expect(
			collectSource(JSON.stringify({ ...payload(), props: {} })),
		).toBeUndefined();
	});

	it("validates source spans and records the caller's normalized source offset", () => {
		const collector = new ResearchSourcePlaygroundsCollector(route);
		const raw = JSON.stringify(payload());
		const prefix = '\n<script id="__NEXT_DATA__">';
		const source = `${prefix}${raw}</script>`;
		for (const [start, end, offset] of [
			[-1, 1, 0],
			[1, 0, 0],
			[0, source.length + 1, 0],
			[0, 1, -1],
			[0, 1, 1],
			[0.5, 1, 0],
			[0, Number.NaN, 0],
			[0, 1, Number.POSITIVE_INFINITY],
			[0, Number.MAX_SAFE_INTEGER + 1, 0],
		])
			expect(() => collector.add(source, start, end, offset)).toThrow(
				"Invalid playground source span",
			);
		collector.add(source, prefix.length, prefix.length + raw.length, 1);
		expect(required(collector.finish()).entries[0].source.offset).toBe(1);
	});

	it("decodes at most one eligible block and snapshots finish results", () => {
		const checkpoint = vi.fn();
		const source = JSON.stringify(payload());
		const collector = new ResearchSourcePlaygroundsCollector(route, checkpoint);
		collector.add(source, 0, source.length, 0);
		const first = required(collector.finish());
		const calls = checkpoint.mock.calls.length;
		collector.add(source, 0, source.length, 0);
		expect(checkpoint).toHaveBeenCalledTimes(calls);
		expect(required(collector.finish()).truncated).toBe(true);
		expect(first.truncated).toBe(false);
		expect(first.entries).toHaveLength(1);
		const malformed = new ResearchSourcePlaygroundsCollector(route);
		malformed.add("{", 0, 1, 0);
		malformed.add(source, 0, source.length, 0);
		expect(malformed.finish()).toBeUndefined();
	});

	it("enforces raw and nested JSON limits before their decoding", () => {
		const raw = JSON.stringify(payload());
		const exactRaw = raw.padEnd(1_048_576, " ");
		expect(required(collectSource(exactRaw)).truncated).toBe(false);
		const checkpoint = vi.fn();
		expect(collectSource(`${exactRaw} `, checkpoint)).toBeUndefined();
		expect(checkpoint).not.toHaveBeenCalled();
		const data = payload();
		data.props.pageProps.content = data.props.pageProps.content.padEnd(
			524_288,
			" ",
		);
		expect(required(collectSource(JSON.stringify(data))).truncated).toBe(false);
		data.props.pageProps.content += " ";
		expect(collectSource(JSON.stringify(data), checkpoint)).toBeUndefined();
		expect(checkpoint).toHaveBeenCalledTimes(2);
	});

	it("retains whole entries up to 32 and drops excess candidates", () => {
		const entries = Array.from({ length: 32 }, (_, index) =>
			pre(`entry ${index}`),
		);
		expect(required(collect(sandpack(entries))).truncated).toBe(false);
		const data = required(collect(sandpack([...entries, pre("dropped")])));
		expect(data.entries.map((entry) => entry.code)).toEqual(
			entries.map((_, index) => `entry ${index}`),
		);
		expect(data.truncated).toBe(true);
	});

	it("skips oversized complete code and drops only oversized optional attributes", () => {
		const data = required(
			collect(
				sandpack([
					pre("😀".repeat(8192), {
						className: "c".repeat(256),
						meta: "m".repeat(512),
					}),
					pre("x".repeat(16_385)),
					pre("kept", { className: "c".repeat(257), meta: "m".repeat(513) }),
					pre("also kept", { className: false, meta: {} }),
				]),
			),
		);
		expect(data.entries.map((entry) => entry.code)).toEqual([
			"😀".repeat(8192),
			"kept",
			"also kept",
		]);
		expect(data.entries[0].className).toHaveLength(256);
		expect(data.entries[0].meta).toHaveLength(512);
		expect(data.entries[1]).not.toHaveProperty("className");
		expect(data.entries[1]).not.toHaveProperty("meta");
		expect(data.entries[2]).not.toHaveProperty("className");
		expect(data.truncated).toBe(true);
	});

	it("bounds retained code and serialized UTF-8 output without clipping", () => {
		const code = "x".repeat(16_384);
		const data = required(
			collect(sandpack(Array.from({ length: 5 }, () => pre(code)))),
		);
		expect(data.entries).toHaveLength(3);
		expect(data.entries.every((entry) => entry.code === code)).toBe(true);
		expect(bytes(data)).toBeLessThanOrEqual(65_536);
		expect(data.truncated).toBe(true);
		const escaped = "\u0000".repeat(16_384);
		expect(collect(sandpack([pre(escaped), pre("later")]))).toBeUndefined();
	});

	it("bounds visited nodes to 10,000 and does not walk large attributes", () => {
		const exact = [
			sandpack(pre("kept")),
			...Array.from({ length: 9996 }, () => null),
		];
		const checkpoint = vi.fn();
		const data = required(
			collectSource(JSON.stringify(payload(exact)), checkpoint),
		);
		expect(data.truncated).toBe(false);
		expect(checkpoint).toHaveBeenCalledTimes(10_004);
		const bounded = required(collect([...exact, sandpack(pre("unvisited"))]));
		expect(bounded.entries.map((entry) => entry.code)).toEqual(["kept"]);
		expect(bounded.truncated).toBe(true);
		const ignored = required(
			collect(
				element("div", sandpack(pre("kept")), {
					irrelevant: Array.from({ length: 10_001 }, () => null),
				}),
			),
		);
		expect(ignored.truncated).toBe(false);
	});

	it("bounds traversal depth at 64 and resumes shallower siblings", () => {
		let nested: unknown = sandpack(pre("boundary"));
		for (let depth = 0; depth < 62; depth++) nested = element("div", nested);
		expect(required(collect(nested)).entries[0].code).toBe("boundary");
		expect(collect(element("div", nested))).toBeUndefined();
		const data = required(
			collect([element("div", nested), sandpack(pre("shallow"))]),
		);
		expect(data.entries.map((entry) => entry.code)).toEqual(["shallow"]);
		expect(data.truncated).toBe(true);
	});

	it.each([1, 2, 3, 4, 5, 7])(
		"propagates cancellation at checkpoint %i",
		(stop) => {
			const cancellation = new Error("cancelled playground collection");
			let calls = 0;
			const checkpoint = () => {
				if (++calls === stop) throw cancellation;
			};
			expect(() =>
				collectSource(JSON.stringify(payload()), checkpoint),
			).toThrow(cancellation);
			expect(calls).toBe(stop);
		},
	);

	it("does not swallow cancellation after malformed JSON decoding", () => {
		const cancellation = new Error("cancelled after decoding");
		for (const source of [
			"{",
			JSON.stringify({ ...payload(), props: { pageProps: { content: "{" } } }),
		]) {
			const stop = source === "{" ? 2 : 4;
			let calls = 0;
			expect(() =>
				collectSource(source, () => {
					if (++calls === stop) throw cancellation;
				}),
			).toThrow(cancellation);
		}
	});
});

describe("playground output fitting and document metadata", () => {
	it("fits exact JSON-UTF8 boundaries using immutable whole-entry prefixes", () => {
		const original = required(
			collect(sandpack([pre("😀\u0000`<b>`"), pre("second")])),
		);
		const exact = required(
			fitResearchSourcePlaygrounds(original, bytes(original)),
		);
		expect(exact).toEqual(original);
		expect(exact).not.toBe(original);
		frozen(exact);
		const expected = {
			...original,
			entries: original.entries.slice(0, 1),
			truncated: true,
		};
		const prefix = required(
			fitResearchSourcePlaygrounds(original, bytes(expected)),
		);
		expect(prefix).toEqual(expected);
		expect(
			fitResearchSourcePlaygrounds(original, bytes(expected) - 1),
		).toBeUndefined();
		expect(original.truncated).toBe(false);
		expect(original.entries).toHaveLength(2);
		expect(fitResearchSourcePlaygrounds(original, 0)).toBeUndefined();
		expect(
			fitResearchSourcePlaygrounds({ ...original, entries: [] }, 65_536),
		).toBeUndefined();
	});

	it("clamps requested output to 64KiB and rejects invalid limits", () => {
		const original = required(collect());
		const large = {
			...original,
			entries: Array.from({ length: 8 }, () => ({
				...original.entries[0],
				code: "😀".repeat(8192),
			})),
		};
		const fitted = required(fitResearchSourcePlaygrounds(large, 1_048_576));
		expect(fitted.entries).toHaveLength(1);
		expect(fitted.entries[0].code).toBe(large.entries[0].code);
		expect(fitted.truncated).toBe(true);
		expect(bytes(fitted)).toBeLessThanOrEqual(65_536);
		for (const limit of [
			-1,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		])
			expect(() => fitResearchSourcePlaygrounds(original, limit)).toThrow(
				"Invalid playground source byte limit",
			);
	});

	it("snapshots mutable inputs even when no output reduction is needed", () => {
		const original = required(collect());
		const mutable = {
			...original,
			entries: original.entries.map((entry) => ({
				...entry,
				source: { ...entry.source },
			})),
		};
		const copied = required(fitResearchSourcePlaygrounds(mutable, 65_536));
		mutable.entries[0].code = "changed";
		mutable.entries[0].source.path = "changed";
		mutable.entries.length = 0;
		expect(copied).toEqual(original);
		frozen(copied);
	});

	it("replaces metadata without accumulating handlers and clears it on close", () => {
		const tree = new DocumentTree("https://react.dev/learn");
		trees.push(tree);
		const onClose = vi.spyOn(tree, "onClose");
		const first = required(collect());
		expect(researchSourcePlaygrounds(tree)).toBeUndefined();
		setResearchSourcePlaygrounds(tree, first);
		const previous = required(researchSourcePlaygrounds(tree));
		expect(previous).not.toBe(first);
		const replacement = {
			...first,
			entries: [
				{
					...first.entries[0],
					code: "replacement",
					source: { ...first.entries[0].source },
				},
			],
		};
		for (let index = 0; index < 100; index++) {
			setResearchSourcePlaygrounds(tree, { ...first, entries: [] });
			expect(researchSourcePlaygrounds(tree)).toBeUndefined();
			setResearchSourcePlaygrounds(tree, replacement);
		}
		expect(onClose).toHaveBeenCalledTimes(1);
		replacement.entries[0].code = "mutation";
		replacement.entries[0].source.path = "mutation";
		const stored = required(researchSourcePlaygrounds(tree));
		expect(stored.entries[0].code).toBe("replacement");
		expect(stored.entries[0].source.path).toBe(first.entries[0].source.path);
		expect(previous).toEqual(first);
		frozen(stored);
		tree.close();
		expect(researchSourcePlaygrounds(tree)).toBeUndefined();
		expect(() => setResearchSourcePlaygrounds(tree, first)).toThrow("closed");
		expect(researchSourcePlaygrounds(tree)).toBeUndefined();
	});
});
