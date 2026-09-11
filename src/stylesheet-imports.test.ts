import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	loadStylesheetImports,
	stylesheetImportLimits,
	stylesheetSourceSize,
	type ImportedStylesheet,
	type StylesheetImportOptions,
	type StylesheetInput,
	type StylesheetSource,
} from "./stylesheet-imports.js";

const origin = "https://graph.example/";
const rootUrl = `${origin}root.css`;

function stylesheet(url: string, text = "", encoding = "utf-8") {
	return { url, text, encoding };
}

function options(
	overrides: Partial<StylesheetImportOptions> = {},
): StylesheetImportOptions {
	return {
		signal: new AbortController().signal,
		fetch: async () => {
			throw new Error("Unexpected stylesheet fetch");
		},
		...overrides,
	};
}

function transport(responses: Record<string, StylesheetInput | Error>) {
	const calls: { url: string; parent: Readonly<StylesheetInput> }[] = [];
	const fetch: StylesheetImportOptions["fetch"] = async (url, parent) => {
		calls.push({ url, parent });
		const response = responses[url];
		if (response instanceof Error) throw response;
		if (!response) throw new Error(`Missing stylesheet fixture: ${url}`);
		return response;
	};
	return { calls, fetch };
}

function loaded(entry: ImportedStylesheet): Readonly<StylesheetSource> {
	if (!entry.sheet) throw new Error(`Expected loaded stylesheet: ${entry.url}`);
	return entry.sheet;
}

function applicationTexts(source: Readonly<StylesheetSource>): string[] {
	return [
		...source.imports.flatMap((entry) =>
			entry.sheet ? applicationTexts(entry.sheet) : [],
		),
		source.text,
	];
}

function chain(depth: number) {
	const sources = Array.from({ length: depth + 1 }, (_, index) =>
		stylesheet(
			`${origin}sheet-${index}.css`,
			index < depth ? `@import "sheet-${index + 1}.css";` : "",
		),
	);
	const fetching = transport(
		Object.fromEntries(sources.slice(1).map((source) => [source.url, source])),
	);
	return { root: sources[0], ...fetching };
}

async function expectFailure(result: Promise<unknown>, code: string) {
	await expect(result).rejects.toMatchObject({
		name: "AgentBrowserError",
		code,
	});
}

it("returns a normalized root without requesting or rewriting its text", async () => {
	const fetching = transport({});
	const input = stylesheet(`${rootUrl}#original`, "body { color: red }");
	const result = await loadStylesheetImports(input, options(fetching));
	expect(result.source).toEqual({ ...input, url: rootUrl, imports: [] });
	expect(result.source).not.toBe(input);
	expect(input.url).toBe(`${rootUrl}#original`);
	expect(fetching.calls).toEqual([]);
	expect(result.issues).toEqual({});
	expect(result.metrics).toMatchObject({
		sheets: 1,
		requests: 0,
		cycles: 0,
		imports: 0,
		codeUnits: input.text.length,
	});
});

it("resolves each import against its parent's final URL and retains spans", async () => {
	const prefix = '/* root */@charset "utf-8";';
	const imported = '\n@import "./theme/child.css" screen;';
	const root = stylesheet(
		"https://cdn.example/assets/main.css#root",
		`${prefix}${imported}body{color:red}`,
	);
	const childRequest = "https://cdn.example/assets/theme/child.css";
	const child = stylesheet(
		"https://static.example/releases/child.css#final",
		'@import "../shared/base.css"; .child{color:blue}',
		"windows-1252",
	);
	const baseUrl = "https://static.example/shared/base.css";
	const base = stylesheet(`${baseUrl}#response`, "body{margin:0}");
	const fetching = transport({ [childRequest]: child, [baseUrl]: base });
	const result = await loadStylesheetImports(
		root,
		options({ ...fetching, requestedUrl: "https://origin.example/start.css" }),
	);
	expect(fetching.calls).toEqual([
		{
			url: childRequest,
			parent: { ...root, url: "https://cdn.example/assets/main.css" },
		},
		{
			url: baseUrl,
			parent: { ...child, url: "https://static.example/releases/child.css" },
		},
	]);
	for (const call of fetching.calls)
		expect(Object.isFrozen(call.parent)).toBe(true);
	expect(result.source.text).toBe(root.text);
	expect(result.source.imports[0]).toMatchObject({
		start: prefix.length,
		end: prefix.length + imported.length,
		url: childRequest,
		media: "screen",
		cycle: false,
	});
	const importedChild = loaded(result.source.imports[0]);
	expect(importedChild.url).toBe("https://static.example/releases/child.css");
	expect(importedChild.text).toBe(child.text);
	expect(importedChild.encoding).toBe("windows-1252");
	expect(loaded(importedChild.imports[0]).url).toBe(baseUrl);
	expect(result.metrics).toMatchObject({ sheets: 3, requests: 2, imports: 2 });
});

it("fetches an inline base URL once before a fetched child's self-import cycles", async () => {
	const input = stylesheet(`${rootUrl}#inline`, '@import "#download";');
	const child = stylesheet(`${rootUrl}#response`, '@import "#self";body{}');
	const fetching = transport({ [rootUrl]: child });
	const result = await loadStylesheetImports(
		input,
		options({
			...fetching,
			inline: true,
			requestedUrl: `${rootUrl}#requested`,
		}),
	);
	expect(fetching.calls.map((call) => call.url)).toEqual([rootUrl]);
	expect(result.source.imports).toHaveLength(1);
	expect(result.source.imports[0]).toMatchObject({
		url: rootUrl,
		cycle: false,
	});
	const importedChild = loaded(result.source.imports[0]);
	expect(importedChild.url).toBe(rootUrl);
	expect(importedChild.text).toBe(child.text);
	expect(importedChild.imports).toHaveLength(1);
	expect(importedChild.imports[0]).toMatchObject({
		url: rootUrl,
		sheet: null,
		cycle: true,
	});
	expect(result.issues).toEqual({});
	expect(result.metrics).toMatchObject({
		requests: 1,
		sheets: 2,
		imports: 2,
		cycles: 1,
		codeUnits: input.text.length + child.text.length,
	});
});

it.each([
	`${origin}requested.css`,
	`${origin}requested.css#again`,
	rootUrl,
	`${rootUrl}#again`,
	"#local",
])(
	"cuts requested/final root ancestor cycles before fetch: %s",
	async (target) => {
		const fetching = transport({});
		const result = await loadStylesheetImports(
			stylesheet(`${rootUrl}#root`, `@import "${target}";`),
			options({ ...fetching, requestedUrl: `${origin}requested.css#request` }),
		);
		expect(fetching.calls).toEqual([]);
		expect(result.source.imports).toHaveLength(1);
		expect(result.source.imports[0]).toMatchObject({
			sheet: null,
			cycle: true,
		});
		expect(result.source.imports[0].url).not.toContain("#");
		expect(result.metrics).toMatchObject({
			sheets: 1,
			requests: 0,
			cycles: 1,
			imports: 1,
		});
	},
);

it.each([`${rootUrl}#redirect`, `${origin}requested.css#redirect`])(
	"cuts a child's final redirect to a root ancestor: %s",
	async (finalUrl) => {
		const alias = `${origin}alias.css`;
		const fetching = transport({
			[alias]: stylesheet(finalUrl, '@import "must-not-fetch.css";'),
		});
		const input = stylesheet(rootUrl, '@import "alias.css";');
		const result = await loadStylesheetImports(
			input,
			options({ ...fetching, requestedUrl: `${origin}requested.css` }),
		);
		expect(fetching.calls.map((call) => call.url)).toEqual([alias]);
		expect(result.source.imports[0]).toMatchObject({
			url: alias,
			sheet: null,
			cycle: true,
		});
		expect(result.metrics).toMatchObject({
			sheets: 1,
			requests: 1,
			cycles: 1,
			codeUnits: input.text.length,
		});
	},
);

it.each([`${origin}entry.css#again`, "https://cdn.example/child.css#again"])(
	"retains both requested and final aliases of non-root ancestors: %s",
	async (target) => {
		const request = `${origin}entry.css`;
		const fetching = transport({
			[request]: stylesheet(
				"https://cdn.example/child.css#response",
				`@import "${target}";`,
			),
		});
		const result = await loadStylesheetImports(
			stylesheet(rootUrl, '@import "entry.css";'),
			options(fetching),
		);
		expect(fetching.calls.map((call) => call.url)).toEqual([request]);
		expect(loaded(result.source.imports[0]).imports[0]).toMatchObject({
			sheet: null,
			cycle: true,
		});
		expect(result.metrics).toMatchObject({ sheets: 2, requests: 1, cycles: 1 });
	},
);

it("fetches duplicate siblings independently and retains both application subtrees", async () => {
	const sharedUrl = `${origin}shared.css`;
	const leafUrl = `${origin}leaf.css`;
	const shared = stylesheet(sharedUrl, '@import "leaf.css";.shared{color:red}');
	const leaf = stylesheet(leafUrl, ".leaf{color:blue}");
	const input = stylesheet(
		rootUrl,
		'@import "shared.css#first" screen; @import "shared.css#second" print;',
	);
	const fetching = transport({ [sharedUrl]: shared, [leafUrl]: leaf });
	const result = await loadStylesheetImports(input, options(fetching));
	expect(fetching.calls.map((call) => call.url)).toEqual([
		sharedUrl,
		leafUrl,
		sharedUrl,
		leafUrl,
	]);
	const first = loaded(result.source.imports[0]);
	const second = loaded(result.source.imports[1]);
	expect(first).not.toBe(second);
	expect(loaded(first.imports[0])).not.toBe(loaded(second.imports[0]));
	expect(result.source.imports.map((entry) => entry.media)).toEqual([
		"screen",
		"print",
	]);
	expect(applicationTexts(result.source)).toEqual([
		leaf.text,
		shared.text,
		leaf.text,
		shared.text,
		input.text,
	]);
	expect(result.metrics).toMatchObject({
		sheets: 5,
		requests: 4,
		imports: 4,
		cycles: 0,
		codeUnits: input.text.length + 2 * (shared.text.length + leaf.text.length),
	});
	expect(stylesheetSourceSize(result.source)).toEqual({
		sheets: 5,
		codeUnits: result.metrics.codeUnits,
	});
	for (const source of [first, second]) {
		expect(stylesheetSourceSize(source)).toEqual({
			sheets: 2,
			codeUnits: shared.text.length + leaf.text.length,
		});
		expect(stylesheetSourceSize(loaded(source.imports[0]))).toEqual({
			sheets: 1,
			codeUnits: leaf.text.length,
		});
	}
});

it("does not reuse the first response when the same URL is fetched again", async () => {
	let requests = 0;
	const result = await loadStylesheetImports(
		stylesheet(rootUrl, '@import "shared.css"; @import "shared.css";'),
		options({
			fetch: async (url) => {
				requests++;
				return stylesheet(url, `body{z-index:${requests}}`);
			},
		}),
	);
	expect(requests).toBe(2);
	expect(result.source.imports.map((entry) => loaded(entry).text)).toEqual([
		"body{z-index:1}",
		"body{z-index:2}",
	]);
});

it.each([
	[new Error("Offline fixture"), "css-import-load-failed"],
	[
		new AgentBrowserError("network-error", "Offline"),
		"css-import-network-error",
	],
	[
		new AgentBrowserError("policy-denied", "Denied"),
		"css-import-policy-denied",
	],
	[
		new AgentBrowserError("invalid-input", "Invalid"),
		"css-import-invalid-input",
	],
] as const)(
	"preserves siblings after child failure %s",
	async (error, diagnostic) => {
		const badUrl = `${origin}bad.css`;
		const goodUrl = `${origin}good.css`;
		const fetching = transport({
			[badUrl]: error,
			[goodUrl]: stylesheet(goodUrl, "body{color:green}"),
		});
		const input = stylesheet(rootUrl, '@import "bad.css"; @import "good.css";');
		const result = await loadStylesheetImports(input, options(fetching));
		expect(fetching.calls.map((call) => call.url)).toEqual([badUrl, goodUrl]);
		expect(result.source.imports[0]).toMatchObject({
			sheet: null,
			cycle: false,
		});
		expect(loaded(result.source.imports[1]).url).toBe(goodUrl);
		expect(result.source.text).toBe(input.text);
		expect(result.issues).toEqual({ [diagnostic]: 1 });
		expect(result.metrics).toMatchObject({
			sheets: 2,
			requests: 2,
			imports: 2,
		});
	},
);

it("keeps valid siblings when a fetched child has an invalid source", async () => {
	const badUrl = `${origin}bad.css`;
	const goodUrl = `${origin}good.css`;
	const fetching = transport({
		[badUrl]: stylesheet("relative-final.css"),
		[goodUrl]: stylesheet(goodUrl),
	});
	const result = await loadStylesheetImports(
		stylesheet(rootUrl, '@import "bad.css"; @import "good.css";'),
		options(fetching),
	);
	expect(result.source.imports[0].sheet).toBeNull();
	expect(loaded(result.source.imports[1]).url).toBe(goodUrl);
	expect(result.issues).toEqual({ "css-import-invalid-input": 1 });
});

it("does not fetch when already aborted", async () => {
	const controller = new AbortController();
	controller.abort();
	const fetching = transport({});
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl, '@import "child.css";'),
			options({ ...fetching, signal: controller.signal }),
		),
		"aborted",
	);
	expect(fetching.calls).toEqual([]);
});

it.each([false, true])(
	"propagates abort during fetch, rejecting=%s",
	async (reject) => {
		const controller = new AbortController();
		const calls: string[] = [];
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl, '@import "first.css"; @import "second.css";'),
				options({
					signal: controller.signal,
					fetch: async (url) => {
						calls.push(url);
						controller.abort();
						if (reject) throw new Error("Transport stopped");
						return stylesheet(url);
					},
				}),
			),
			"aborted",
		);
		expect(calls).toEqual([`${origin}first.css`]);
	},
);

it.each(["aborted", "resource-limit"] as const)(
	"propagates a child %s error instead of treating it as recoverable",
	async (code) => {
		const firstUrl = `${origin}first.css`;
		const fetching = transport({
			[firstUrl]: new AgentBrowserError(code, "Stop graph loading"),
		});
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl, '@import "first.css"; @import "second.css";'),
				options(fetching),
			),
			code,
		);
		expect(fetching.calls.map((call) => call.url)).toEqual([firstUrl]);
	},
);

it("settles an abort without waiting for an unresolved fetch callback", async () => {
	const controller = new AbortController();
	let release: (source: StylesheetInput) => void = () => {};
	const pending = new Promise<StylesheetInput>((resolve) => {
		release = resolve;
	});
	let notifyStarted: () => void = () => {};
	const started = new Promise<void>((resolve) => {
		notifyStarted = resolve;
	});
	let settled = false;
	let failure: unknown;
	const result = loadStylesheetImports(
		stylesheet(rootUrl, '@import "pending.css";'),
		options({
			signal: controller.signal,
			fetch: async () => {
				notifyStarted();
				return pending;
			},
		}),
	).then(
		() => {
			settled = true;
		},
		(error: unknown) => {
			settled = true;
			failure = error;
		},
	);
	await started;
	controller.abort();
	for (let turn = 0; turn < 16; turn++) await Promise.resolve();
	const settledBeforeRelease = settled;
	release(stylesheet(`${origin}pending.css`));
	await result;
	expect(settledBeforeRelease).toBe(true);
	expect(failure).toMatchObject({ name: "AgentBrowserError", code: "aborted" });
});

it.each([1, stylesheetImportLimits.maxDepth])(
	"enforces depth %s before fetching an over-depth child",
	async (maxDepth) => {
		const exact = chain(maxDepth);
		const result = await loadStylesheetImports(
			exact.root,
			options({ ...exact, maxDepth }),
		);
		expect(result.metrics.sheets).toBe(maxDepth + 1);
		expect(exact.calls).toHaveLength(maxDepth);
		const over = chain(maxDepth + 1);
		await expectFailure(
			loadStylesheetImports(over.root, options({ ...over, maxDepth })),
			"resource-limit",
		);
		expect(over.calls).toHaveLength(maxDepth);
	},
);

it.each([1, 2, stylesheetImportLimits.maxSheets])(
	"counts the root toward the %s sheet cap and checks before the next fetch",
	async (maxSheets) => {
		const children = Array.from({ length: maxSheets }, (_, index) =>
			stylesheet(`${origin}child-${index}.css`),
		);
		const responses = Object.fromEntries(
			children.map((child) => [child.url, child]),
		);
		const text = children.map((child) => `@import "${child.url}";`);
		const exact = transport(responses);
		const result = await loadStylesheetImports(
			stylesheet(rootUrl, text.slice(0, -1).join("")),
			options({ ...exact, maxSheets }),
		);
		expect(result.metrics.sheets).toBe(maxSheets);
		expect(exact.calls).toHaveLength(maxSheets - 1);
		const over = transport(responses);
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl, text.join("")),
				options({ ...over, maxSheets }),
			),
			"resource-limit",
		);
		expect(over.calls).toHaveLength(maxSheets - 1);
	},
);

it.each([2, stylesheetImportLimits.maxImports])(
	"enforces %s aggregate imports across sheets, counting cycles",
	async (maxImports) => {
		const childUrl = `${origin}child.css`;
		const root = stylesheet(rootUrl, '@import "child.css";');
		const cycles = '@import "#cycle";';
		const exact = transport({
			[childUrl]: stylesheet(childUrl, cycles.repeat(maxImports - 1)),
		});
		const result = await loadStylesheetImports(
			root,
			options({ ...exact, maxImports }),
		);
		expect(result.metrics).toMatchObject({
			imports: maxImports,
			cycles: maxImports - 1,
			requests: 1,
			sheets: 2,
		});
		const over = transport({
			[childUrl]: stylesheet(childUrl, cycles.repeat(maxImports)),
		});
		await expectFailure(
			loadStylesheetImports(root, options({ ...over, maxImports })),
			"resource-limit",
		);
		expect(over.calls).toHaveLength(1);
	},
);

it("bounds failed imports even when no additional sheet is retained", async () => {
	const fetching = transport({});
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl, '@import "first.css"; @import "second.css";'),
			options({ ...fetching, maxImports: 1 }),
		),
		"resource-limit",
	);
	expect(fetching.calls.map((call) => call.url)).toEqual([
		`${origin}first.css`,
	]);
});

it("enforces per-source text and exact UTF-16 code-unit boundaries", async () => {
	const text = "/*🚀*/";
	const exact = await loadStylesheetImports(
		stylesheet(rootUrl, text),
		options({ maxCodeUnits: text.length }),
	);
	expect(exact.metrics.codeUnits).toBe(text.length);
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl, text),
			options({ maxCodeUnits: text.length - 1 }),
		),
		"resource-limit",
	);
	const maximum = " ".repeat(stylesheetImportLimits.maxCodeUnits);
	expect(
		(await loadStylesheetImports(stylesheet(rootUrl, maximum), options()))
			.metrics.codeUnits,
	).toBe(maximum.length);
	await expectFailure(
		loadStylesheetImports(stylesheet(rootUrl, `${maximum} `), options()),
		"resource-limit",
	);
});

it("enforces aggregate text separately from individual source sizes", async () => {
	const root = stylesheet(rootUrl, '@import "child.css";');
	const childUrl = `${origin}child.css`;
	const child = stylesheet(childUrl, "body{color:red}");
	const maxCodeUnits = root.text.length + child.text.length;
	const exact = transport({ [childUrl]: child });
	const result = await loadStylesheetImports(
		root,
		options({ ...exact, maxCodeUnits }),
	);
	expect(result.metrics.codeUnits).toBe(maxCodeUnits);
	const over = transport({ [childUrl]: child });
	await expectFailure(
		loadStylesheetImports(
			root,
			options({ ...over, maxCodeUnits: maxCodeUnits - 1 }),
		),
		"resource-limit",
	);
	expect(over.calls).toHaveLength(1);
});

it("propagates oversized child text instead of treating it as a failed fetch", async () => {
	const firstUrl = `${origin}first.css`;
	const fetching = transport({
		[firstUrl]: stylesheet(firstUrl, " ".repeat(65)),
	});
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl, '@import "first.css"; @import "second.css";'),
			options({ ...fetching, maxCodeUnits: 64 }),
		),
		"resource-limit",
	);
	expect(fetching.calls.map((call) => call.url)).toEqual([firstUrl]);
});

it.each(["", '@import "child.css" screen;'])(
	"enforces exact total work, including parser and graph work: %j",
	async (text) => {
		const childUrl = `${origin}child.css`;
		const fetching = transport({ [childUrl]: stylesheet(childUrl) });
		const input = stylesheet(rootUrl, text);
		const baseline = await loadStylesheetImports(input, options(fetching));
		const maxWork = baseline.metrics.work;
		expect(
			await loadStylesheetImports(input, options({ ...fetching, maxWork })),
		).toEqual(baseline);
		await expectFailure(
			loadStylesheetImports(
				input,
				options({ ...fetching, maxWork: maxWork - 1 }),
			),
			"resource-limit",
		);
	},
);

it("rejects insufficient work before starting import fetches", async () => {
	const fetching = transport({});
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl, '@import "child.css";'),
			options({ ...fetching, maxWork: 3 }),
		),
		"resource-limit",
	);
	expect(fetching.calls).toEqual([]);
});

it.each(
	Object.keys(
		stylesheetImportLimits,
	) as (keyof typeof stylesheetImportLimits)[],
)("rejects invalid %s options before fetching", async (name) => {
	for (const value of [
		0,
		-1,
		1.5,
		Number.NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		stylesheetImportLimits[name] + 1,
		"1",
		null,
		true,
	]) {
		const fetching = transport({});
		const invalid = { ...options(fetching), [name]: value };
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl),
				invalid as StylesheetImportOptions,
			),
			"invalid-input",
		);
		expect(fetching.calls).toEqual([]);
	}
});

it("accepts undefined limits as defaults", async () => {
	const result = await loadStylesheetImports(
		stylesheet(rootUrl),
		options({
			maxSheets: undefined,
			maxImports: undefined,
			maxCodeUnits: undefined,
			maxDepth: undefined,
			maxWork: undefined,
		}),
	);
	expect(result.source.imports).toEqual([]);
});

it("rejects invalid option, signal and fetch shapes", async () => {
	for (const invalid of [
		undefined,
		null,
		1,
		[],
		{},
		options({ signal: {} as AbortSignal }),
		options({ fetch: null as unknown as StylesheetImportOptions["fetch"] }),
	])
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl),
				invalid as StylesheetImportOptions,
			),
			"invalid-input",
		);
});

it("rejects invalid root source fields and oversized encoding labels", async () => {
	for (const invalid of [
		null,
		undefined,
		"stylesheet",
		{},
		{ ...stylesheet(rootUrl), text: 1 },
		{ ...stylesheet(rootUrl), encoding: null },
		stylesheet(rootUrl, "", "x".repeat(129)),
	])
		await expectFailure(
			loadStylesheetImports(invalid as StylesheetInput, options()),
			"invalid-input",
		);
	expect(
		(
			await loadStylesheetImports(
				stylesheet(rootUrl, "", "x".repeat(128)),
				options(),
			)
		).source.encoding,
	).toHaveLength(128);
});

it.each([
	["", "invalid-input"],
	["relative.css", "invalid-input"],
	["https://", "invalid-input"],
	["https://graph.example/a\nb.css", "invalid-input"],
	[`${origin}${"a".repeat(16_384)}`, "invalid-input"],
	["file:///root.css", "policy-denied"],
	["data:text/css,body{}", "policy-denied"],
	["https://user:password@graph.example/root.css", "policy-denied"],
] as const)("validates root and requested URLs: %j", async (url, code) => {
	const fetching = transport({});
	await expectFailure(
		loadStylesheetImports(stylesheet(url), options(fetching)),
		code,
	);
	await expectFailure(
		loadStylesheetImports(
			stylesheet(rootUrl),
			options({ ...fetching, requestedUrl: url }),
		),
		code,
	);
	expect(fetching.calls).toEqual([]);
});

it("rejects non-string root and requested URL values", async () => {
	for (const url of [null, 1, {}]) {
		await expectFailure(
			loadStylesheetImports(stylesheet(url as string), options()),
			"invalid-input",
		);
		await expectFailure(
			loadStylesheetImports(
				stylesheet(rootUrl),
				options({ requestedUrl: url as string }),
			),
			"invalid-input",
		);
	}
});

it("discards invalid import URLs without dropping valid siblings", async () => {
	const goodUrl = `${origin}good.css`;
	const fetching = transport({ [goodUrl]: stylesheet(goodUrl) });
	const targets = [
		"https://[",
		"file:///child.css",
		"data:text/css,body{}",
		"https://user:password@graph.example/private.css",
		"good.css",
	];
	const result = await loadStylesheetImports(
		stylesheet(rootUrl, targets.map((url) => `@import "${url}";`).join("")),
		options(fetching),
	);
	expect(fetching.calls.map((call) => call.url)).toEqual([goodUrl]);
	expect(result.source.imports).toHaveLength(1);
	expect(loaded(result.source.imports[0]).url).toBe(goodUrl);
	expect(result.issues).toEqual({ "css-import-invalid-url": 4 });
	expect(result.metrics.imports).toBe(5);
});

it.each([String.raw`\a `, String.raw`\d `, String.raw`\9 `, String.raw`\1 `])(
	"rejects decoded URL controls before URL normalization: %j",
	async (escapedControl) => {
		const goodUrl = `${origin}good.css`;
		const fetching = transport({ [goodUrl]: stylesheet(goodUrl) });
		const result = await loadStylesheetImports(
			stylesheet(
				rootUrl,
				`@import "ba${escapedControl}se.css"; @import "good.css";`,
			),
			options(fetching),
		);
		expect(fetching.calls.map((call) => call.url)).toEqual([goodUrl]);
		expect(result.source.imports).toHaveLength(1);
		expect(result.issues).toEqual({ "css-import-invalid-url": 1 });
	},
);

it("merges parser diagnostics without fetching rejected or nested imports", async () => {
	const fetching = transport({});
	const result = await loadStylesheetImports(
		stylesheet(
			rootUrl,
			'@import bad; @import "layer.css" layer(theme); body{} @import "late.css"; @media screen { @import "nested.css"; }',
		),
		options(fetching),
	);
	expect(fetching.calls).toEqual([]);
	expect(result.source.imports).toEqual([]);
	expect(result.issues).toEqual({
		"invalid-css-import": 1,
		"unsupported-css-import-modifier": 1,
		"late-css-import": 1,
	});
});

it("deeply freezes outputs and callback parents without freezing caller inputs", async () => {
	const input = stylesheet(`${rootUrl}#root`, '@import "child.css";');
	const childUrl = `${origin}child.css`;
	const child = stylesheet(childUrl, '@import "#cycle";');
	const fetching = transport({ [childUrl]: child });
	const settings = options(fetching);
	const result = await loadStylesheetImports(input, settings);
	const importedChild = loaded(result.source.imports[0]);
	for (const value of [
		result,
		result.source,
		result.source.imports,
		result.source.imports[0],
		importedChild,
		importedChild.imports,
		importedChild.imports[0],
		result.issues,
		result.metrics,
		fetching.calls[0].parent,
		stylesheetSourceSize(result.source),
		stylesheetSourceSize(importedChild),
	])
		expect(Object.isFrozen(value)).toBe(true);
	expect(Object.isFrozen(input)).toBe(false);
	expect(Object.isFrozen(child)).toBe(false);
	expect(Object.isFrozen(settings)).toBe(false);
	expect(input.url).toBe(`${rootUrl}#root`);
	input.text = "changed root";
	child.text = "changed child";
	expect(result.source.text).toBe('@import "child.css";');
	expect(importedChild.text).toBe('@import "#cycle";');
	expect(settings.fetch).toBe(fetching.fetch);
	expect(settings.signal.aborted).toBe(false);
});

it("rejects forged and cloned source objects without loader provenance", async () => {
	const result = await loadStylesheetImports(stylesheet(rootUrl), options());
	for (const source of [
		{ ...stylesheet(rootUrl), imports: [] },
		Object.freeze({ ...result.source }),
	]) {
		let failure: unknown;
		try {
			stylesheetSourceSize(source);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(AgentBrowserError);
		expect(failure).toMatchObject({ code: "invalid-input" });
	}
	expect(stylesheetSourceSize(result.source)).toEqual({
		sheets: 1,
		codeUnits: 0,
	});
});
