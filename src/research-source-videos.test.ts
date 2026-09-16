import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import {
	ResearchSourceVideosCollector,
	fitResearchSourceVideos,
	researchSourceVideos,
	setResearchSourceVideos,
	youtubeSearchRoute,
	type ResearchSourceVideo,
	type ResearchSourceVideos,
} from "./research-source-videos.js";

const searchUrl =
	"https://www.youtube.com/results?search_query=local+llm+hardware";
const query = "local llm hardware";
const videoId = "AbCdEf012_-";
const otherVideoId = "ZyXwVu987_-";
const encoder = new TextEncoder();
const trees: DocumentTree[] = [];
const optionalFields = [
	{ output: "authorText", input: "ownerText", limit: 256 },
	{ output: "durationText", input: "lengthText", limit: 64 },
	{ output: "publishedText", input: "publishedTimeText", limit: 128 },
	{ output: "viewsText", input: "viewCountText", limit: 128 },
	{ output: "snippetText", input: "detailedMetadataSnippets", limit: 2048 },
] as const;

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
});

function renderer(overrides: Record<string, unknown> = {}) {
	return {
		videoId,
		title: { runs: [{ text: "Source café " }, { text: "😀 video" }] },
		navigationEndpoint: { watchEndpoint: { videoId } },
		...overrides,
	};
}

function item(overrides: Record<string, unknown> = {}) {
	return { videoRenderer: renderer(overrides) };
}

function section(items: unknown[] = [item()]) {
	return { itemSectionRenderer: { contents: items } };
}

function payload(sections: unknown[] = [section()]) {
	return {
		contents: {
			twoColumnSearchResultsRenderer: {
				primaryContents: { sectionListRenderer: { contents: sections } },
			},
		},
	};
}

function script(data: unknown = payload()) {
	return `var ytInitialData = ${JSON.stringify(data)};`;
}

function collect(source = script()) {
	const collector = new ResearchSourceVideosCollector({ query });
	collector.add(source, 0, source.length, 0);
	return collector.finish();
}

function collectItems(items: unknown[]) {
	return collect(script(payload([section(items)])));
}

function required(data: ResearchSourceVideos | undefined) {
	expect(data).toBeDefined();
	if (!data) throw new Error("Missing source videos");
	return data;
}

function bytes(value: unknown) {
	return encoder.encode(JSON.stringify(value)).byteLength;
}

function sourcePath(sectionIndex = 0, itemIndex = 0) {
	return `$.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[${sectionIndex}].itemSectionRenderer.contents[${itemIndex}].videoRenderer`;
}

function expectFrozen(data: ResearchSourceVideos) {
	expect(Object.isFrozen(data)).toBe(true);
	expect(Object.isFrozen(data.entries)).toBe(true);
	for (const entry of data.entries) {
		expect(Object.isFrozen(entry)).toBe(true);
		expect(Object.isFrozen(entry.source)).toBe(true);
	}
}

function optional(input: string, value: unknown) {
	return {
		[input]:
			input === "detailedMetadataSnippets" ? [{ snippetText: value }] : value,
	};
}

function numberedItem(index: number, overrides: Record<string, unknown> = {}) {
	const identifier = `video${String(index).padStart(6, "0")}`;
	return item({
		videoId: identifier,
		navigationEndpoint: { watchEndpoint: { videoId: identifier } },
		...overrides,
	});
}

describe("YouTube search route admission", () => {
	it.each([
		"https://www.youtube.com/results?search_query=local+llm+hardware",
		"https://youtube.com/results?search_query=local%20llm%20hardware",
		"https://www.youtube.com:443/results?search_query=local+llm+hardware",
		"https://www.youtube.com/results?other=1&search_query=local+llm+hardware#top",
	])("accepts the exact public HTTPS search route: %s", (url) => {
		expect(youtubeSearchRoute(url)).toEqual({ query });
	});

	it.each([
		"not a URL",
		"/results?search_query=video",
		"http://www.youtube.com/results?search_query=video",
		"https://www.youtube.com:444/results?search_query=video",
		"https://youtube.com:8443/results?search_query=video",
		"https://user@www.youtube.com/results?search_query=video",
		"https://:secret@www.youtube.com/results?search_query=video",
		"https://user:secret@www.youtube.com/results?search_query=video",
		"https://www.youtube.com.example.invalid/results?search_query=video",
		"https://example.invalid/results?search_query=video",
		"https://m.youtube.com/results?search_query=video",
		"https://youtu.be/results?search_query=video",
		"https://www.youtube.com./results?search_query=video",
		"https://www.youtube.com/?search_query=video",
		"https://www.youtube.com/results/?search_query=video",
		"https://www.youtube.com/Results?search_query=video",
		"https://www.youtube.com/%72esults?search_query=video",
		"https://www.youtube.com/results/more?search_query=video",
		"https://www.youtube.com/watch?search_query=video",
		"https://www.youtube.com/results",
		"https://www.youtube.com/results?Search_Query=video",
		"https://www.youtube.com/results?search_query=",
		"https://www.youtube.com/results?search_query=++%20",
		"https://www.youtube.com/results?search_query=%C2%A0",
		"https://www.youtube.com/results?search_query=one&search_query=two",
		"https://www.youtube.com/results?search_query=one&search_query=one",
		"https://www.youtube.com/results?search_query=one&%73earch_query=one",
		"https://www.youtube.com/results?search_query=&search_query=one",
	])("rejects an ineligible or ambiguous route: %s", (url) => {
		expect(youtubeSearchRoute(url)).toBeUndefined();
	});

	it.each([
		"\u0000",
		"\t",
		"\n",
		"\r",
		"\u001b",
		"\u007f",
		"\u0085",
		"\u200b",
		"\u202e",
		"\u2066",
	])("rejects query control or format character %j", (character) => {
		expect(
			youtubeSearchRoute(
				`https://www.youtube.com/results?search_query=left${encodeURIComponent(character)}right`,
			),
		).toBeUndefined();
	});

	it("preserves decoded query text without trimming, entity decoding or date inference", () => {
		const text = "  café 😀 + &amp; 3 years ago  ";
		expect(
			youtubeSearchRoute(
				`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`,
			),
		).toEqual({ query: text });
	});

	it("bounds queries at 256 UTF-16 units rather than code points or UTF-8 bytes", () => {
		for (const text of ["x", "x".repeat(256), "😀".repeat(128)]) {
			expect(
				youtubeSearchRoute(
					`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`,
				),
			).toEqual({ query: text });
		}
		for (const text of ["x".repeat(257), `${"😀".repeat(128)}x`]) {
			expect(
				youtubeSearchRoute(
					`https://www.youtube.com/results?search_query=${encodeURIComponent(text)}`,
				),
			).toBeUndefined();
		}
	});

	it("accepts exactly 4096 URL units and rejects one additional unit", () => {
		const prefix = `${searchUrl}&padding=`;
		const exact = prefix + "x".repeat(4096 - prefix.length);
		expect(youtubeSearchRoute(exact)).toEqual({ query });
		expect(youtubeSearchRoute(`${exact}x`)).toBeUndefined();
	});
});

describe("inert assignment and source-span admission", () => {
	it.each([
		["var ytInitialData=", ""],
		["var ytInitialData = ", ";"],
		[" \t\r\nvar\tytInitialData\t=\n", " \r\n;\t "],
		[`${" ".repeat(96)}var ytInitialData = `, ";"],
	])(
		"accepts bounded classic assignment %j with strict JSON",
		(prefix, suffix) => {
			const result = required(
				collect(`${prefix}${JSON.stringify(payload())}${suffix}`),
			);
			expect(result.entries).toHaveLength(1);
			expect(result.truncated).toBe(false);
		},
	);

	it.each([
		"ytInitialData = ",
		"let ytInitialData = ",
		"const ytInitialData = ",
		"window.ytInitialData = ",
		'window["ytInitialData"] = ',
		"var ytInitialDataOther = ",
		"var yTInitialData = ",
		"var ytInitialData == ",
		"var ytInitialData += ",
		"var ytInitialData ||= ",
		"var ytInitialData = /* comment */ ",
		"/* comment */ var ytInitialData = ",
		"\u00a0var ytInitialData = ",
		"\ufeffvar ytInitialData = ",
		`${" ".repeat(128)}var ytInitialData = `,
	])("does not reinterpret unsupported assignment syntax %j", (prefix) => {
		expect(collect(`${prefix}${JSON.stringify(payload())};`)).toBeUndefined();
	});

	it.each([
		"",
		"undefined",
		"null",
		"[]",
		"true",
		"1",
		'"text"',
		"{not JSON}",
		"{'contents': {}}",
		'{"contents": {},}',
		'{"contents": NaN}',
		'{"contents": Infinity}',
	])("ignores malformed JSON or an unsupported root %j", (json) => {
		expect(collect(`var ytInitialData = ${json};`)).toBeUndefined();
	});

	it.each([
		";;",
		"; // trailing comment",
		"; /* trailing comment */",
		", other = 1;",
		" {}",
		"\u00a0",
	])("requires strict JSON followed by at most one semicolon: %j", (suffix) => {
		expect(
			collect(`var ytInitialData = ${JSON.stringify(payload())}${suffix}`),
		).toBeUndefined();
	});

	it("never invokes eval or Function for valid JSON or executable lookalikes", () => {
		const json = JSON.stringify(payload());
		const evalSpy = vi.spyOn(globalThis, "eval").mockImplementation(() => {
			throw new Error("Source eval must not run");
		});
		const functionSpy = vi
			.spyOn(globalThis, "Function")
			.mockImplementation(() => {
				throw new Error("Source Function must not run");
			});
		try {
			expect(
				required(collect(`var ytInitialData = ${json};`)).entries,
			).toHaveLength(1);
			for (const source of [
				`var ytInitialData = (${json});`,
				`var ytInitialData = (() => (${json}))();`,
				`var ytInitialData = JSON.parse(${JSON.stringify(json)});`,
				`var ytInitialData = ${json}; globalThis.sourceVideoExecuted = true;`,
			])
				expect(collect(source)).toBeUndefined();
			expect(evalSpy).not.toHaveBeenCalled();
			expect(functionSpy).not.toHaveBeenCalled();
		} finally {
			evalSpy.mockRestore();
			functionSpy.mockRestore();
		}
	});

	it("does not parse or copy an entire unrelated script when its prefix cannot match", () => {
		const source = `unrelated(${" ".repeat(1_048_576)})`;
		const collector = new ResearchSourceVideosCollector({ query });
		const parseSpy = vi.spyOn(JSON, "parse");
		const sliceSpy = vi.spyOn(String.prototype, "slice");
		const substringSpy = vi.spyOn(String.prototype, "substring");
		sliceSpy.mockClear();
		substringSpy.mockClear();
		collector.add(source, 0, source.length, 0);
		const parseCalls = parseSpy.mock.calls.length;
		const largeCopy = [...sliceSpy.mock.calls, ...substringSpy.mock.calls].some(
			([start, end]) => (end ?? source.length) - (start ?? 0) > 128,
		);
		vi.restoreAllMocks();
		expect(parseCalls).toBe(0);
		expect(largeCopy).toBe(false);
		expect(collector.finish()).toBeUndefined();
	});

	it.each([" ", "\t", "\n", "\r"])(
		"handles long internal %j whitespace without scanning it as trailing padding",
		(character) => {
			const source = script({
				...payload(),
				ignored: `${character.repeat(200_000)}x`,
			});
			const result = required(collect(source));
			expect(result.entries).toHaveLength(1);
			expect(result.truncated).toBe(false);
			expect(JSON.stringify(result)).not.toContain("ignored");
		},
	);

	it("handles large internal legal JSON whitespace and trailing padding", () => {
		const json = JSON.stringify(payload());
		const source = `var ytInitialData = {${" \t\n\r".repeat(150_000)}${json.slice(1)};${" \t\n\r".repeat(50_000)}`;
		const result = required(collect(source));
		expect(result.entries).toHaveLength(1);
		expect(result.truncated).toBe(false);
	});

	it("retains caller-provided LF-normalized UTF-16 script offsets and only parses the span", () => {
		const prefix = "<p>café 😀</p>\n<script>";
		const body = script();
		const source = `${prefix}${body}</script>${script(payload([section([numberedItem(2)])]))}`;
		const offset = prefix.indexOf("<script>");
		const collector = new ResearchSourceVideosCollector({ query });
		collector.add(source, prefix.length, prefix.length + body.length, offset);
		const data = required(collector.finish());
		expect(encoder.encode(prefix.slice(0, offset)).byteLength).toBeGreaterThan(
			offset,
		);
		expect(data.entries).toHaveLength(1);
		expect(data.entries[0].source).toEqual({
			offset,
			offsetBasis: "lf-normalized-utf16",
			path: sourcePath(),
		});
	});

	it.each([
		[-1, 1, 0],
		[0, -1, 0],
		[2, 1, 0],
		[0, 10_000, 0],
		[0, 1, -1],
		[0, 1, 1],
		[0.5, 1, 0],
		[0, 1.5, 0],
		[0, 1, 0.5],
		[Number.NaN, 1, 0],
		[0, Number.POSITIVE_INFINITY, 0],
		[0, 1, Number.MAX_SAFE_INTEGER + 1],
	])("rejects invalid source span (%s, %s, %s)", (start, end, offset) => {
		const collector = new ResearchSourceVideosCollector({ query });
		expect(() => collector.add(script(), start, end, offset)).toThrow();
		expect(collector.finish()).toBeUndefined();
	});

	it("accepts empty spans without spending the recognized-assignment budget", () => {
		const collector = new ResearchSourceVideosCollector({ query });
		collector.add("", 0, 0, 0);
		expect(collector.finish()).toBeUndefined();
		const source = script();
		collector.add(source, 0, source.length, 0);
		expect(required(collector.finish()).entries).toHaveLength(1);
	});

	it("counts only recognized assignments, not unrelated scripts", () => {
		const collector = new ResearchSourceVideosCollector({ query });
		for (const source of [
			"const unrelated = {};",
			script(),
			"var another = {}; ",
		]) {
			collector.add(source, 0, source.length, 0);
		}
		const data = required(collector.finish());
		expect(data.entries).toHaveLength(1);
		expect(data.truncated).toBe(false);
	});

	it.each(["same", "different", "malformed", "empty"])(
		"suppresses duplicate recognized assignments, including a %s second block",
		(kind) => {
			const second =
				kind === "same"
					? script()
					: kind === "different"
						? script(payload([section([numberedItem(2)])]))
						: kind === "malformed"
							? "var ytInitialData = {broken};"
							: "var ytInitialData = {};";
			for (const sources of [
				[script(), second],
				[second, script()],
			]) {
				const collector = new ResearchSourceVideosCollector({ query });
				for (const source of sources)
					collector.add(source, 0, source.length, 0);
				expect(collector.finish()).toBeUndefined();
			}
		},
	);

	it("conservatively bounds the whole recognized span at 1048576 UTF-16 units, including wrapper and semicolon", () => {
		const base = { ...payload(), padding: "" };
		const baseLength = JSON.stringify(base).length;
		const wrapper = "var ytInitialData = ";
		const jsonLimit = 1_048_576 - wrapper.length - 1;
		for (const extra of [0, 1]) {
			const json = JSON.stringify({
				...base,
				padding: "é".repeat(jsonLimit + extra - baseLength),
			});
			expect(json.length).toBe(jsonLimit + extra);
			expect(encoder.encode(json).byteLength).toBeGreaterThan(1_048_576);
			const source = `${wrapper}${json};`;
			expect(source.length).toBe(1_048_576 + extra);
			const parseSpy = vi.spyOn(JSON, "parse");
			const data = collect(source);
			const parseCalls = parseSpy.mock.calls.length;
			parseSpy.mockRestore();
			if (extra === 0) {
				expect(required(data).truncated).toBe(false);
				expect(parseCalls).toBe(1);
			} else {
				expect(data).toBeUndefined();
				expect(parseCalls).toBe(0);
				const collector = new ResearchSourceVideosCollector({ query });
				collector.add(source, 0, source.length, 0);
				const valid = script();
				collector.add(valid, 0, valid.length, 0);
				expect(collector.finish()).toBeUndefined();
			}
		}
	});
});

describe("primary source records and canonical video identity", () => {
	it("returns explicitly unverified document-source records and only declared fields", () => {
		const data = required(
			collectItems([
				item({
					ownerText: {
						runs: [
							{
								text: "Source author",
								navigationEndpoint: { url: "PRIVATE_AUTHOR" },
							},
						],
					},
					lengthText: { simpleText: "12:34" },
					publishedTimeText: { simpleText: "3 years ago" },
					viewCountText: { simpleText: "1.2M views" },
					detailedMetadataSnippets: [
						{
							snippetText: {
								runs: [{ text: "Literal &amp; " }, { text: "<b>snippet</b>" }],
							},
						},
					],
					trackingParams: "PRIVATE_TRACKING",
					thumbnail: { thumbnails: [{ url: "PRIVATE_THUMBNAIL" }] },
					streamingData: { formats: [{ url: "PRIVATE_PLAYBACK" }] },
					accessibility: { label: "PRIVATE_ACCESSIBILITY" },
				}),
			]),
		);
		expect(data).toEqual({
			kind: "youtube-search-video-results-v1",
			scope: "document-source",
			partial: true,
			rendered: false,
			verified: false,
			textFormat: "plain-text",
			query,
			entries: [
				{
					source: {
						offset: 0,
						offsetBasis: "lf-normalized-utf16",
						path: sourcePath(),
					},
					videoId,
					url: `https://www.youtube.com/watch?v=${videoId}`,
					title: "Source café 😀 video",
					authorText: "Source author",
					durationText: "12:34",
					publishedText: "3 years ago",
					viewsText: "1.2M views",
					snippetText: "Literal &amp; <b>snippet</b>",
					truncated: false,
				},
			],
			truncated: false,
		});
		expect(JSON.stringify(data)).not.toContain("PRIVATE_");
		expectFrozen(data);
	});

	it("walks only direct primary videoRenderer items in source order", () => {
		const privateItem = item({ title: { simpleText: "PRIVATE_NONPRIMARY" } });
		const data = payload([
			{ shelfRenderer: { contents: [privateItem] } },
			section([
				{ adSlotRenderer: { content: privateItem } },
				{ richItemRenderer: { content: privateItem } },
				{ reelItemRenderer: renderer() },
				{ playlistRenderer: renderer() },
				{ channelRenderer: renderer() },
				{ continuationItemRenderer: { contents: [privateItem] } },
				numberedItem(1),
			]),
			section([numberedItem(2)]),
		]);
		Object.assign(data, {
			videoRenderer: renderer(),
			onResponseReceivedCommands: [privateItem],
			ytcfg: {
				token: "PRIVATE_TOKEN",
				cookie: "PRIVATE_COOKIE",
				contents: [privateItem],
			},
		});
		Object.assign(data.contents.twoColumnSearchResultsRenderer, {
			secondaryContents: { contents: [privateItem] },
		});
		const result = required(collect(script(data)));
		expect(result.entries.map((entry) => entry.videoId)).toEqual([
			"video000001",
			"video000002",
		]);
		expect(result.entries.map((entry) => entry.source.path)).toEqual([
			sourcePath(1, 6),
			sourcePath(2, 0),
		]);
		expect(result.truncated).toBe(false);
		expect(JSON.stringify(result)).not.toContain("PRIVATE_");
	});

	it.each([
		{ videoRenderer: renderer() },
		{ contents: [item()] },
		{
			contents: {
				singleColumnSearchResultsRenderer: { contents: [section()] },
			},
		},
		{
			contents: {
				twoColumnSearchResultsRenderer: { primaryContents: section() },
			},
		},
		payload([{ contents: [item()] }]),
		payload([section([{ wrapper: item() }])]),
		payload([section([{ ["__proto__"]: item() }])]),
		payload([section([{ constructor: { prototype: item() } }])]),
	])("does not discover renderers through an unsupported path %#", (data) => {
		expect(collect(script(data))).toBeUndefined();
	});

	it("does not recursively search deep unknown data for video renderers", () => {
		const json = JSON.stringify(payload());
		const nested = `${"[".repeat(512)}${JSON.stringify(item({ title: { simpleText: "PRIVATE_DEEP" } }))}${"]".repeat(512)}`;
		const result = required(
			collect(`var ytInitialData = ${json.slice(0, -1)},"unknown":${nested}};`),
		);
		expect(result.entries).toHaveLength(1);
		expect(result.truncated).toBe(false);
		expect(JSON.stringify(result)).not.toContain("PRIVATE_DEEP");
	});

	it.each([
		"",
		"short",
		"AbCdEf012_",
		"AbCdEf012_--",
		"AbCdEf012/!",
		"AbCdEf012é-",
		"AbCdEf012\n-",
		null,
		123,
	])("requires an eleven-character ASCII video ID: %j", (identifier) => {
		expect(
			collectItems([
				item({
					videoId: identifier,
					navigationEndpoint: { watchEndpoint: { videoId: identifier } },
				}),
			]),
		).toBeUndefined();
	});

	it.each([
		null,
		{},
		{ watchEndpoint: {} },
		{ watchEndpoint: { videoId: otherVideoId } },
		{ watchEndpoint: { videoId: 123 } },
		{ browseEndpoint: { videoId } },
		{ commandMetadata: { webCommandMetadata: { url: `/watch?v=${videoId}` } } },
	])(
		"requires an agreeing watch endpoint independently of URL metadata: %#",
		(navigationEndpoint) => {
			expect(collectItems([item({ navigationEndpoint })])).toBeUndefined();
		},
	);

	it.each([
		`/watch?v=${videoId}`,
		`watch?v=${videoId}`,
		`/watch?feature=share&v=${videoId}&t=42&tracking=PRIVATE_TRACKING#chapter`,
		`https://www.youtube.com/watch?v=${videoId}&list=PRIVATE_PLAYLIST`,
		`https://www.youtube.com:443/watch?v=${videoId}`,
	])("canonicalizes an agreeing watch URL without tracking: %s", (url) => {
		const data = required(
			collectItems([
				item({
					navigationEndpoint: {
						watchEndpoint: {
							videoId,
							params: "PRIVATE_PARAMS",
							playlistId: "PRIVATE_PLAYLIST",
						},
						commandMetadata: {
							webCommandMetadata: { url, apiUrl: "PRIVATE_INTERNAL_ENDPOINT" },
						},
					},
				}),
			]),
		);
		expect(data.entries[0].url).toBe(
			`https://www.youtube.com/watch?v=${videoId}`,
		);
		expect(data.truncated).toBe(false);
		expect(JSON.stringify(data)).not.toContain("PRIVATE_");
	});

	it.each([
		`/watch?v=${otherVideoId}`,
		"/watch",
		"/watch?v=",
		`/watch?v=${videoId}&v=${videoId}`,
		`/watch?v=${videoId}&%76=${otherVideoId}`,
		`/watch/?v=${videoId}`,
		`/shorts/${videoId}`,
		`/embed/${videoId}`,
		`http://www.youtube.com/watch?v=${videoId}`,
		`https://www.youtube.com:444/watch?v=${videoId}`,
		`https://user:secret@www.youtube.com/watch?v=${videoId}`,
		`https://example.invalid/watch?v=${videoId}`,
		`https://youtube.com/watch?v=${videoId}`,
		`//example.invalid/watch?v=${videoId}`,
		`https://www.youtube.com.example.invalid/watch?v=${videoId}`,
		`https://youtu.be/${videoId}`,
		`javascript:watch?v=${videoId}`,
		"",
		null,
		123,
	])(
		"rejects disagreeing, malformed or noncanonical watch admission: %j",
		(url) => {
			expect(
				collectItems([
					item({
						navigationEndpoint: {
							watchEndpoint: { videoId },
							commandMetadata: { webCommandMetadata: { url } },
						},
					}),
				]),
			).toBeUndefined();
		},
	);

	it("skips malformed identities without marking otherwise complete data truncated", () => {
		const data = required(collectItems([item({ videoId: "invalid" }), item()]));
		expect(data.entries).toHaveLength(1);
		expect(data.entries[0].source.path).toBe(sourcePath(0, 1));
		expect(data.truncated).toBe(false);
	});

	it("preserves repeated primary video IDs as distinct source records", () => {
		const data = required(
			collect(
				script(
					payload([
						section([
							item(),
							item({ title: { simpleText: "Repeated primary result" } }),
						]),
						section([item()]),
					]),
				),
			),
		);
		expect(data.entries.map((entry) => entry.videoId)).toEqual([
			videoId,
			videoId,
			videoId,
		]);
		expect(data.entries.map((entry) => entry.source.path)).toEqual([
			sourcePath(0, 0),
			sourcePath(0, 1),
			sourcePath(1, 0),
		]);
		expect(data.entries[1].title).toBe("Repeated primary result");
		expect(data.truncated).toBe(false);
	});
});

describe("bounded text and primary traversal", () => {
	it("preserves literal markup, whitespace and run concatenation while escaping controls", () => {
		const literal =
			' <img onerror="inert()"> &amp; café 😀\n\t\r\u0000\u001b\u007f\u0085\u200b\u202e ';
		const escaped =
			' <img onerror="inert()"> &amp; café 😀\n\t\\u{d}\\u{0}\\u{1b}\\u{7f}\\u{85}\\u{200b}\\u{202e} ';
		const data = required(
			collectItems([
				item({
					title: {
						runs: [{ text: literal }, { text: "No inserted separator" }],
					},
					detailedMetadataSnippets: [{ snippetText: { simpleText: literal } }],
				}),
			]),
		);
		expect(data.entries[0].title).toBe(`${escaped}No inserted separator`);
		expect(data.entries[0].snippetText).toBe(escaped);
		expect(data.entries[0].truncated).toBe(false);
	});

	it.each([
		undefined,
		null,
		"not a text object",
		123,
		{},
		{ simpleText: 123 },
		{ runs: "bad" },
		{ runs: [null] },
		{ runs: [{ text: 123 }] },
	])("does not fabricate a mandatory title from malformed text %#", (title) => {
		expect(collectItems([item({ title })])).toBeUndefined();
	});

	it("accepts exactly 32 runs and rejects an oversized mandatory run list", () => {
		const runs = Array.from({ length: 32 }, (_, index) => ({
			text: `${index}:`,
		}));
		const exact = required(collectItems([item({ title: { runs } })]));
		expect(exact.entries[0].title).toBe(runs.map((run) => run.text).join(""));
		expect(exact.truncated).toBe(false);
		const overflow = required(
			collectItems([
				item({ title: { runs: [...runs, { text: "extra" }] } }),
				numberedItem(1),
			]),
		);
		expect(overflow.entries.map((entry) => entry.videoId)).toEqual([
			"video000001",
		]);
		expect(overflow.truncated).toBe(true);
		expect(overflow.entries[0].truncated).toBe(false);
	});

	it.each(["simpleText", "runs"] as const)(
		"bounds mandatory %s titles at 1024 raw and escaped units",
		(kind) => {
			for (const title of [
				"é".repeat(1024),
				"😀".repeat(512),
				"\u202e".repeat(128),
			]) {
				const text =
					kind === "simpleText"
						? { simpleText: title }
						: {
								runs: [{ text: title.slice(0, 64) }, { text: title.slice(64) }],
							};
				const data = required(collectItems([item({ title: text })]));
				expect(data.entries[0].title.length).toBe(1024);
				expect(data.truncated).toBe(false);
			}
			for (const title of ["x".repeat(1025), "\u202e".repeat(129)]) {
				const text =
					kind === "simpleText"
						? { simpleText: title }
						: {
								runs: [{ text: title.slice(0, 64) }, { text: title.slice(64) }],
							};
				const data = required(
					collectItems([item({ title: text }), numberedItem(1)]),
				);
				expect(data.entries.map((entry) => entry.videoId)).toEqual([
					"video000001",
				]);
				expect(data.truncated).toBe(true);
			}
		},
	);

	it.each(optionalFields)(
		"bounds $output at $limit units, omitting rather than clipping oversize text",
		({ input, output, limit }) => {
			const text = "é".repeat(limit);
			const exact = required(
				collectItems([item(optional(input, { simpleText: text }))]),
			);
			expect(exact.entries[0][output]).toBe(text);
			expect(exact.truncated).toBe(false);
			for (const oversized of [
				"x".repeat(limit + 1),
				"\u202e".repeat(Math.floor(limit / 8) + 1),
			]) {
				const data = required(
					collectItems([item(optional(input, { simpleText: oversized }))]),
				);
				expect(data.entries[0]).not.toHaveProperty(output);
				expect(data.entries[0].title).toBe("Source café 😀 video");
				expect(data.entries[0].truncated).toBe(true);
				expect(data.truncated).toBe(true);
			}
		},
	);

	it.each(optionalFields)(
		"handles malformed, overlong and excessive runs in $output",
		({ input, output, limit }) => {
			for (const value of [
				undefined,
				null,
				123,
				"not text",
				{},
				{ simpleText: false },
				{ runs: [{ text: "prefix" }, {}] },
				{ runs: [{ text: 123 }] },
			]) {
				const data = required(collectItems([item(optional(input, value))]));
				expect(data.entries[0]).not.toHaveProperty(output);
				expect(data.entries[0].truncated).toBe(false);
				expect(data.truncated).toBe(false);
			}
			const runs = Array.from({ length: 32 }, () => ({ text: "x" }));
			const exact = required(collectItems([item(optional(input, { runs }))]));
			expect(exact.entries[0][output]).toBe("x".repeat(32));
			expect(exact.truncated).toBe(false);
			for (const value of [
				{ runs: [...runs, { text: "x" }] },
				{ runs: [{ text: "x".repeat(limit) }, { text: "x" }] },
			]) {
				const data = required(collectItems([item(optional(input, value))]));
				expect(data.entries[0]).not.toHaveProperty(output);
				expect(data.entries[0].truncated).toBe(true);
				expect(data.truncated).toBe(true);
			}
		},
	);

	it("captures only the first detailed snippet, without falling back to later or unrelated text", () => {
		const later = { snippetText: { simpleText: "PRIVATE_LATER_SNIPPET" } };
		const data = required(
			collectItems([
				item({
					detailedMetadataSnippets: [
						{ snippetText: { simpleText: "First snippet" } },
						later,
					],
					descriptionSnippet: { simpleText: "PRIVATE_OTHER_SNIPPET" },
				}),
			]),
		);
		expect(data.entries[0].snippetText).toBe("First snippet");
		expect(data.truncated).toBe(false);
		expect(JSON.stringify(data)).not.toContain("PRIVATE_");
		for (const first of [
			null,
			{},
			{ snippetText: { simpleText: "x".repeat(2049) } },
		]) {
			const result = required(
				collectItems([item({ detailedMetadataSnippets: [first, later] })]),
			);
			expect(result.entries[0]).not.toHaveProperty("snippetText");
			expect(result.truncated).toBe(first !== null && "snippetText" in first);
		}
	});

	it("counts all section positions against the eight-section bound", () => {
		const sections: unknown[] = Array.from({ length: 7 }, () => ({
			continuationItemRenderer: {},
		}));
		sections.push(section([numberedItem(7)]));
		const exact = required(collect(script(payload(sections))));
		expect(exact.entries[0].source.path).toBe(sourcePath(7, 0));
		expect(exact.truncated).toBe(false);
		const overflow = required(
			collect(script(payload([...sections, section([numberedItem(8)])]))),
		);
		expect(overflow.entries).toEqual(exact.entries);
		expect(overflow.truncated).toBe(true);
	});

	it("counts all item positions against the per-section 64-item bound", () => {
		const items: unknown[] = Array.from({ length: 63 }, () => ({
			channelRenderer: {},
		}));
		items.push(numberedItem(63));
		const exact = required(collectItems(items));
		expect(exact.entries[0].source.path).toBe(sourcePath(0, 63));
		expect(exact.truncated).toBe(false);
		const overflow = required(
			collect(
				script(
					payload([
						section([...items, numberedItem(64)]),
						section([numberedItem(65)]),
					]),
				),
			),
		);
		expect(overflow.entries.map((entry) => entry.videoId)).toEqual([
			"video000063",
			"video000065",
		]);
		expect(overflow.entries[1].source.path).toBe(sourcePath(1, 0));
		expect(overflow.truncated).toBe(true);
	});

	it("retains at most twenty complete result entries across sections", () => {
		const first = Array.from({ length: 10 }, (_, index) => numberedItem(index));
		const second = Array.from({ length: 10 }, (_, index) =>
			numberedItem(index + 10),
		);
		const exact = required(
			collect(script(payload([section(first), section(second)]))),
		);
		expect(exact.entries).toHaveLength(20);
		expect(exact.truncated).toBe(false);
		const overflow = required(
			collect(
				script(
					payload([section(first), section([...second, numberedItem(20)])]),
				),
			),
		);
		expect(overflow.entries).toEqual(exact.entries);
		expect(overflow.truncated).toBe(true);
		expect(overflow.entries.every((entry) => !entry.truncated)).toBe(true);
	});
});

describe("UTF-8 whole-entry fitting and immutable storage", () => {
	function fittingFixture() {
		return required(
			collectItems([
				numberedItem(1, {
					detailedMetadataSnippets: [
						{ snippetText: { simpleText: "é😀".repeat(200) } },
					],
				}),
				numberedItem(2, { title: { simpleText: "Small second entry" } }),
				numberedItem(3, { title: { simpleText: "Third entry" } }),
			]),
		);
	}

	it("fits by exact serialized UTF-8 bytes including metadata and preserves fitting content", () => {
		const data = fittingFixture();
		const limit = bytes(data);
		expect(limit).toBeGreaterThan(JSON.stringify(data).length);
		expect(fitResearchSourceVideos(data, limit)).toEqual(data);
		expect(fitResearchSourceVideos(data, limit + 1)).toEqual(data);
		const smaller = required(fitResearchSourceVideos(data, limit - 1));
		expect(smaller.entries).toEqual(data.entries.slice(0, 2));
		expect(smaller.truncated).toBe(true);
		expect(bytes(smaller)).toBeLessThanOrEqual(limit - 1);
		expectFrozen(smaller);
		expect(fitResearchSourceVideos(smaller, bytes(smaller))).toEqual(smaller);
		expect(data.truncated).toBe(false);
	});

	it("keeps whole-entry prefixes without stripping optional text or skipping a large first entry", () => {
		const data = fittingFixture();
		const prefix = {
			...data,
			entries: data.entries.slice(0, 1),
			truncated: true,
		};
		const limit = bytes(prefix);
		const fitted = required(fitResearchSourceVideos(data, limit));
		expect(fitted).toEqual(prefix);
		expect(bytes(fitted)).toBe(limit);
		expect(fitted.entries[0].snippetText).toBe(data.entries[0].snippetText);
		expect(fitted.entries[0].truncated).toBe(false);
		expectFrozen(fitted);
		expect(fitResearchSourceVideos(data, limit - 1)).toBeUndefined();
		const laterOnly = {
			...data,
			entries: data.entries.slice(1),
			truncated: true,
		};
		expect(bytes(laterOnly)).toBeLessThan(limit - 1);
		expect(fitResearchSourceVideos(data, bytes(laterOnly))).toBeUndefined();
		expect(data.entries).toHaveLength(3);
	});

	it("returns undefined when there is no complete entry rather than an empty truncation marker", () => {
		const data = required(collect());
		expect(fitResearchSourceVideos(data, bytes(data))).toEqual(data);
		expect(fitResearchSourceVideos(data, bytes(data) - 1)).toBeUndefined();
		expect(fitResearchSourceVideos(data, 0)).toBeUndefined();
		expect(
			fitResearchSourceVideos({ ...data, entries: [] }, 32768),
		).toBeUndefined();
	});

	it.each([
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
	])("rejects an invalid fitter byte budget %s", (limit) => {
		expect(() => fitResearchSourceVideos(required(collect()), limit)).toThrow();
	});

	it("preserves pre-existing per-entry and aggregate truncation during fitting", () => {
		const data = required(
			collectItems([
				numberedItem(1, { lengthText: { simpleText: "x".repeat(65) } }),
				numberedItem(2),
			]),
		);
		const prefix = {
			...data,
			entries: data.entries.slice(0, 1),
			truncated: true,
		};
		const fitted = required(fitResearchSourceVideos(data, bytes(prefix)));
		expect(fitted).toEqual(prefix);
		expect(fitted.entries[0].truncated).toBe(true);
		expect(fitted.entries[0]).not.toHaveProperty("durationText");
		expectFrozen(fitted);
	});

	it("caps finish and fitter at 32768 UTF-8 bytes even when a larger budget is requested", () => {
		const snippet = "😀".repeat(1024);
		const items = Array.from({ length: 20 }, (_, index) =>
			numberedItem(index, {
				detailedMetadataSnippets: [{ snippetText: { simpleText: snippet } }],
			}),
		);
		const finished = required(collectItems(items));
		expect(finished.truncated).toBe(true);
		expect(finished.entries.length).toBeGreaterThan(0);
		expect(finished.entries.length).toBeLessThan(20);
		expect(bytes(finished)).toBeLessThanOrEqual(32768);
		const first = finished.entries[0];
		const entries: ResearchSourceVideo[] = items.map((sourceItem, index) => ({
			...first,
			videoId: sourceItem.videoRenderer.videoId,
			url: `https://www.youtube.com/watch?v=video${String(index).padStart(6, "0")}`,
			source: { ...first.source, path: sourcePath(0, index) },
		}));
		const full = { ...finished, entries, truncated: false };
		expect(bytes(full)).toBeGreaterThan(32768);
		for (const limit of [32768, 32769, Number.MAX_SAFE_INTEGER]) {
			const fitted = required(fitResearchSourceVideos(full, limit));
			expect(fitted).toEqual(finished);
			expect(fitted.entries).toEqual(entries.slice(0, fitted.entries.length));
			expect(
				fitted.entries.every(
					(entry) => entry.snippetText === snippet && !entry.truncated,
				),
			).toBe(true);
			expect(
				bytes({
					...fitted,
					entries: entries.slice(0, fitted.entries.length + 1),
				}),
			).toBeGreaterThan(32768);
			expectFrozen(fitted);
		}
	});

	it("finishes with immutable snapshots that survive later ambiguity and route mutation", () => {
		const route = { query };
		const collector = new ResearchSourceVideosCollector(route);
		expect(collector.finish()).toBeUndefined();
		const source = script();
		collector.add(source, 0, source.length, 0);
		const first = required(collector.finish());
		expect(collector.finish()).toEqual(first);
		expectFrozen(first);
		expect(() =>
			Object.assign(first.entries[0], { title: "changed" }),
		).toThrow();
		expect(() =>
			Object.assign(first.entries[0].source, { offset: 99 }),
		).toThrow();
		expect(() => Object.assign(first.entries, { 0: null })).toThrow();
		route.query = "changed";
		expect(required(collector.finish()).query).toBe(query);
		collector.add(source, 0, source.length, 0);
		expect(collector.finish()).toBeUndefined();
		expect(first.entries).toHaveLength(1);
		expect(first.entries[0].title).toBe("Source café 😀 video");
		expect(first.truncated).toBe(false);
	});

	it("stores defensive known-field snapshots, registers cleanup once and removes data on close", () => {
		const tree = new DocumentTree(searchUrl);
		const otherTree = new DocumentTree(searchUrl);
		trees.push(tree, otherTree);
		expect(researchSourceVideos(tree)).toBeUndefined();
		const original = required(collect());
		const mutable = JSON.parse(JSON.stringify(original));
		mutable.trackingParams = "PRIVATE_TOP";
		mutable.entries[0].trackingParams = "PRIVATE_ENTRY";
		mutable.entries[0].source.token = "PRIVATE_SOURCE";
		const cleanupSpy = vi.spyOn(tree, "onClose");
		setResearchSourceVideos(tree, mutable);
		const stored = required(researchSourceVideos(tree));
		expect(stored).toEqual(original);
		expect(stored).not.toBe(mutable);
		expect(stored.entries[0]).not.toBe(mutable.entries[0]);
		expect(stored.entries[0].source).not.toBe(mutable.entries[0].source);
		expectFrozen(stored);
		mutable.query = "changed";
		mutable.entries[0].title = "changed";
		mutable.entries[0].source.offset = 999;
		mutable.entries.length = 0;
		expect(stored).toEqual(original);
		setResearchSourceVideos(tree, original);
		setResearchSourceVideos(tree, original);
		expect(cleanupSpy).toHaveBeenCalledTimes(1);
		setResearchSourceVideos(otherTree, original);
		tree.close();
		expect(researchSourceVideos(tree)).toBeUndefined();
		expect(researchSourceVideos(otherTree)).toEqual(original);
		expect(() => setResearchSourceVideos(tree, original)).toThrow(/closed/i);
		expect(researchSourceVideos(tree)).toBeUndefined();
		expect(stored).toEqual(original);
	});
});
