import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { loadBrowserDocument } from "./document-loader.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import type {
	StylesheetFetchPolicy,
	StylesheetFetchResult,
} from "./stylesheet-fetch.js";
import {
	loadStylesheetImports,
	stylesheetImportLimits,
} from "./stylesheet-imports.js";
import { documentStyles } from "./styles.js";

const pageUrl = "https://page.example/docs/index.html";
const rootUrl = "https://page.example/styles/root.css";
const childUrl = "https://page.example/styles/child.css";
const grandchildUrl = "https://page.example/styles/grandchild.css";
const rootLink = '<link rel="stylesheet" href="/styles/root.css" crossorigin>';
const target = '<div id="target">Target</div>';
const documents = new Set<DocumentTree>();
const controllers = new Set<AbortController>();

afterEach(() => {
	for (const controller of controllers) controller.abort();
	for (const tree of documents) tree.close();
	controllers.clear();
	documents.clear();
});

function response(
	url: string,
	text: string,
	type = "text/css",
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url,
		status: 200,
		headers: { "content-type": [type] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
		...overrides,
	};
}

function harness(
	sheets: Readonly<Record<string, NetworkResponse | Error>> = {},
	overrides: Partial<DocumentLoaderContext> = {},
) {
	const controller = new AbortController();
	controllers.add(controller);
	const calls: { url: string; policy: StylesheetFetchPolicy }[] = [];
	const legacyCalls: string[] = [];
	const initialized: DocumentTree[] = [];
	const lookup = (url: string) => {
		const sheet = sheets[url];
		if (sheet instanceof Error) throw sheet;
		if (!sheet) throw new Error(`Unexpected stylesheet request: ${url}`);
		return sheet;
	};
	const context: DocumentLoaderContext = {
		tabId: "stylesheet-import-loading",
		signal: controller.signal,
		limits: {
			maxNodes: 50_000,
			maxDepth: 256,
			maxTextCodeUnits: 2_000_000,
			maxChanges: 1024,
		},
		fetchStylesheet: async (url) => {
			legacyCalls.push(url);
			return lookup(url);
		},
		fetchStylesheetWithPolicy: async (url, policy) => {
			calls.push({ url, policy: { ...policy } });
			return { response: lookup(url), type: "basic" };
		},
		...overrides,
		initializeDocument: (tree) => {
			documents.add(tree);
			initialized.push(tree);
			overrides.initializeDocument?.(tree);
		},
	};
	const load = async (
		html: string,
		headers: NetworkResponse["headers"] = {},
	) => {
		const tree = await loadBrowserDocument(
			response(pageUrl, html, "text/html; charset=utf-8", {
				headers: { "content-type": ["text/html; charset=utf-8"], ...headers },
			}),
			context,
		);
		const queries = new DocumentQueries(tree);
		const id = (selector: string) => {
			const found = queries.querySelector(selector);
			if (found === null) throw new Error(`Missing ${selector}`);
			return found;
		};
		return { tree, styles: documentStyles(tree), id };
	};
	return { load, calls, legacyCalls, controller, initialized };
}

it("keeps nested and repeated imports at their own cascade positions", async () => {
	const firstUrl = "https://page.example/styles/first.css";
	const secondUrl = "https://page.example/styles/second.css";
	const fixture = harness({
		[rootUrl]: response(
			rootUrl,
			'@import "first.css"; @import "second.css"; @import "first.css"; .parent{display:block}',
		),
		[firstUrl]: response(
			firstUrl,
			'@import "grandchild.css"; .nested{display:block} .repeated{visibility:hidden} .after{display:none}',
		),
		[secondUrl]: response(
			secondUrl,
			".repeated{visibility:visible} .parent{display:none}",
		),
		[grandchildUrl]: response(grandchildUrl, ".nested,.leaf{display:none}"),
	});
	const { styles, id } = await fixture.load(
		`${rootLink}<style>.after{display:block}</style><div class="parent">Parent</div><div class="nested">Nested</div><div class="repeated">Repeated</div><div class="leaf">Leaf</div><div class="after">After</div>`,
	);
	expect(styles.get(id(".parent")).visible).toBe(true);
	expect(styles.get(id(".nested")).visible).toBe(true);
	expect(styles.get(id(".repeated")).visibility).toBe("hidden");
	expect(styles.get(id(".leaf")).visible).toBe(false);
	expect(styles.get(id(".after")).visible).toBe(true);
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		firstUrl,
		grandchildUrl,
		secondUrl,
		firstUrl,
		grandchildUrl,
	]);
	expect(styles.metrics().importedSheets).toBe(5);
	expect(fixture.legacyCalls).toEqual([]);
});

it.each(["linked", "inline"] as const)(
	"conjoins %s parent, import and child media across viewport changes",
	async (kind) => {
		const rootText = '@import "/styles/child.css" (max-width: 1000px);';
		const fixture = harness({
			[rootUrl]: response(rootUrl, rootText),
			[childUrl]: response(
				childUrl,
				'@import "grandchild.css" (min-height: 600px); #child{display:none}',
			),
			[grandchildUrl]: response(
				grandchildUrl,
				"@media (max-height: 900px){#target{display:none}}",
			),
		});
		const root =
			kind === "linked"
				? '<link rel="stylesheet" href="/styles/root.css" crossorigin media="(min-width: 600px)">'
				: `<style media="(min-width: 600px)">${rootText}</style>`;
		const { tree, styles, id } = await fixture.load(
			`${root}${target}<div id="child">Child</div>`,
		);
		for (const [width, height, targetVisible, childVisible] of [
			[800, 700, false, false],
			[500, 700, true, true],
			[1100, 700, true, true],
			[800, 500, true, false],
			[800, 1000, true, false],
			[800, 700, false, false],
		] as const) {
			styles.setViewport(width, height);
			expect(styles.get(id("#target")).visible).toBe(targetVisible);
			expect(styles.get(id("#child")).visible).toBe(childVisible);
		}
		expect(fixture.calls.map((call) => call.url)).toEqual(
			kind === "linked"
				? [rootUrl, childUrl, grandchildUrl]
				: [childUrl, grandchildUrl],
		);
		if (kind === "inline") expect(tree.textContent(id("style"))).toBe(rootText);
	},
);

it("uses the draft no-cors/include import policy without inheriting root CORS", async () => {
	const fixture = harness({
		[rootUrl]: response(rootUrl, '@import "child.css";'),
		[childUrl]: response(childUrl, "#target{display:none}"),
	});
	const { styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(styles.get(id("#target")).visible).toBe(false);
	expect(fixture.calls).toEqual([
		{ url: rootUrl, policy: { mode: "cors", credentials: "same-origin" } },
		{ url: childUrl, policy: { mode: "no-cors", credentials: "include" } },
	]);
	expect(fixture.legacyCalls).toEqual([]);
});

it("resolves every child against its importing stylesheet's final response URL", async () => {
	const finalRoot = "https://cdn.example/assets/root.css";
	const requestedChild = "https://cdn.example/assets/child.css";
	const finalChild = "https://static.example/redirected/child.css";
	const finalGrandchild = "https://static.example/redirected/grandchild.css";
	const fixture = harness({
		[rootUrl]: response(finalRoot, '@import "child.css";'),
		[requestedChild]: response(finalChild, '@import "grandchild.css";'),
		[finalGrandchild]: response(finalGrandchild, "#target{display:none}"),
	});
	const { tree, styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(styles.get(id("#target")).visible).toBe(false);
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		requestedChild,
		finalGrandchild,
	]);
	expect(tree.get(id("link")).attributes.href).toBe("/styles/root.css");
});

it("retains inline source text while resolving imports from the document base", async () => {
	const url = "https://page.example/assets/child.css";
	const text =
		'/* retain me */\n@import "child.css";\n#parent { display: none }';
	const fixture = harness({
		[url]: response(url, "#target{visibility:hidden}"),
	});
	const { tree, styles, id } = await fixture.load(
		`<base href="/assets/"><style id="sheet">${text}</style>${target}<div id="parent">Parent</div>`,
	);
	expect(tree.textContent(id("#sheet"))).toBe(text);
	expect(styles.get(id("#target")).visibility).toBe("hidden");
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().externalSheets).toBe(0);
	expect(styles.metrics().importedSheets).toBe(1);
	expect(fixture.calls.map((call) => call.url)).toEqual([url]);
});

it("fetches an inline import of the current document URL and rejects HTML rather than treating it as a cycle", async () => {
	const text = `@import "${pageUrl}"; #parent{display:none}`;
	const fixture = harness({
		[pageUrl]: response(
			pageUrl,
			"<style>#target{display:none}</style>",
			"text/html",
		),
	});
	const { tree, styles, id } = await fixture.load(
		`<style>${text}</style>${target}<div id="parent">Parent</div>`,
	);
	expect(fixture.calls).toEqual([
		{ url: pageUrl, policy: { mode: "no-cors", credentials: "include" } },
	]);
	expect(fixture.legacyCalls).toEqual([]);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().issues["css-import-unsupported"]).toBe(1);
	expect(styles.metrics().importedSheets).toBe(0);
	expect(tree.textContent(id("style"))).toBe(text);
});

it.each([
	["late", '#target{display:none} @import "child.css";'],
	[
		"nested media",
		'@media screen { @import "child.css"; } #target{display:none}',
	],
	[
		"nested supports",
		'@supports (display:block) { @import "child.css"; } #target{display:none}',
	],
	["layer modifier", '@import "child.css" layer(theme); #target{display:none}'],
	["anonymous layer", '@import "child.css" layer; #target{display:none}'],
	[
		"supports modifier",
		'@import "child.css" supports(display:block); #target{display:none}',
	],
	[
		"layer block",
		'@layer theme { @import "child.css"; } #target{display:none}',
	],
])(
	"does not fetch %s imports while preserving ordinary rules",
	async (_name, text) => {
		const fixture = harness({
			[rootUrl]: response(rootUrl, text),
			[childUrl]: response(childUrl, "#target{display:block!important}"),
		});
		const { styles, id } = await fixture.load(`${rootLink}${target}`);
		expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl]);
		expect(styles.get(id("#target")).visible).toBe(false);
		expect(styles.metrics().importedSheets).toBe(0);
	},
);

it("cuts self and ancestor cycles without discarding successful child rules", async () => {
	const fixture = harness({
		[rootUrl]: response(
			rootUrl,
			'@import "root.css#self"; @import "child.css";',
		),
		[childUrl]: response(
			childUrl,
			'@import "root.css#ancestor"; #target{display:none}',
		),
	});
	const { styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
	expect(styles.get(id("#target")).visible).toBe(false);
	expect(styles.metrics().importedSheets).toBe(1);
});

it("recognizes redirect aliases as cycles and ignores the cyclic response body", async () => {
	const finalRoot = "https://cdn.example/root.css";
	const aliasUrl = "https://cdn.example/alias.css";
	const fixture = harness({
		[rootUrl]: response(
			finalRoot,
			`@import "${rootUrl}"; @import "alias.css"; #target{display:none}`,
		),
		[aliasUrl]: response(finalRoot, "#target{display:block!important}"),
	});
	const { styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, aliasUrl]);
	expect(styles.get(id("#target")).visible).toBe(false);
	expect(styles.metrics().importedSheets).toBe(0);
});

it.each([
	[
		"transport failure",
		new Error("synthetic transport failure"),
		"css-import-load-failed",
	],
	[
		"policy denial",
		new AgentBrowserError("policy-denied", "synthetic denial"),
		"css-import-policy-denied",
	],
] as const)(
	"preserves parent and sibling rules after %s",
	async (_name, failure, issue) => {
		const fixture = harness({
			[rootUrl]: response(
				rootUrl,
				'@import "child.css"; @import "grandchild.css"; #parent{display:none}',
			),
			[childUrl]: failure,
			[grandchildUrl]: response(grandchildUrl, "#target{display:none}"),
		});
		const { styles, id } = await fixture.load(
			`${rootLink}${target}<div id="parent">Parent</div>`,
		);
		expect(styles.get(id("#target")).visible).toBe(false);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(fixture.calls.map((call) => call.url)).toEqual([
			rootUrl,
			childUrl,
			grandchildUrl,
		]);
		expect(styles.metrics().issues[issue]).toBe(1);
		expect(styles.metrics().importedSheets).toBe(1);
	},
);

it.each(["header", "meta"] as const)(
	"fails inline imports closed for a CSP %s",
	async (kind) => {
		const fixture = harness({
			[childUrl]: response(childUrl, "#target{display:none}"),
		});
		const meta =
			kind === "meta"
				? '<meta http-equiv="Content-Security-Policy" content="style-src *">'
				: "";
		const { styles, id } = await fixture.load(
			`${meta}<style>@import "/styles/child.css"; #parent{display:none}</style>${target}<div id="parent">Parent</div>`,
			kind === "header" ? { "Content-Security-Policy": ["style-src *"] } : {},
		);
		expect(fixture.calls).toEqual([]);
		expect(fixture.legacyCalls).toEqual([]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(styles.metrics().issues["css-import-policy-denied"]).toBe(1);
	},
);

it.each(["header", "meta"] as const)(
	"fails policy-aware roots closed for a CSP %s",
	async (kind) => {
		const fixture = harness({
			[rootUrl]: response(
				rootUrl,
				'@import "child.css"; #target{display:none}',
			),
			[childUrl]: response(childUrl, "#target{display:none}"),
		});
		const meta =
			kind === "meta"
				? '<meta http-equiv="content-security-policy" content="style-src *">'
				: "";
		const { styles, id } = await fixture.load(
			`${meta}${rootLink}${target}`,
			kind === "header" ? { "content-security-policy": ["style-src *"] } : {},
		);
		expect(fixture.calls).toEqual([]);
		expect(fixture.legacyCalls).toEqual([]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.metrics().issues["stylesheet-csp-not-implemented"]).toBe(1);
	},
);

it.each(["linked", "inline"] as const)(
	"never falls back to legacy transport for %s imports",
	async (kind) => {
		const text = '@import "/styles/child.css"; #parent{display:none}';
		const fixture = harness(
			{
				[rootUrl]: response(rootUrl, text),
				[childUrl]: response(childUrl, "#target{display:none}"),
			},
			{ fetchStylesheetWithPolicy: undefined },
		);
		const root =
			kind === "linked"
				? '<link rel="stylesheet" href="/styles/root.css">'
				: `<style>${text}</style>`;
		const { styles, id } = await fixture.load(
			`${root}${target}<div id="parent">Parent</div>`,
		);
		expect(fixture.legacyCalls).toEqual(kind === "linked" ? [rootUrl] : []);
		expect(fixture.calls).toEqual([]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(styles.metrics().issues["css-import-unsupported"]).toBe(1);
	},
);

it.each([
	["wrong MIME", { "content-type": ["text/html"] }, 200],
	["missing MIME", {}, 200],
	["duplicate MIME", { "content-type": ["text/css", "text/css"] }, 200],
	["failed status", { "content-type": ["text/css"] }, 404],
] satisfies [string, NetworkResponse["headers"], number][])(
	"rejects imported %s before following its imports",
	async (_name, headers, status) => {
		const fixture = harness({
			[rootUrl]: response(
				rootUrl,
				'@import "child.css"; #parent{display:none}',
			),
			[childUrl]: response(
				childUrl,
				'@import "grandchild.css"; #target{display:none}',
				"text/css",
				{ headers, status },
			),
			[grandchildUrl]: response(grandchildUrl, "#target{display:none}"),
		});
		const { styles, id } = await fixture.load(
			`${rootLink}${target}<div id="parent">Parent</div>`,
		);
		expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(styles.metrics().issues["css-import-unsupported"]).toBe(1);
	},
);

it.each(["error", "opaqueredirect", "unknown"])(
	"rejects imported response type %s before parsing",
	async (type) => {
		const calls: string[] = [];
		const fixture = harness(
			{},
			{
				fetchStylesheetWithPolicy: async (url) => {
					calls.push(url);
					return {
						response: response(
							url,
							url === rootUrl
								? '@import "child.css"; #parent{display:none}'
								: '@import "grandchild.css"; #target{display:none}',
						),
						type:
							url === rootUrl
								? "basic"
								: (type as StylesheetFetchResult["type"]),
					};
				},
			},
		);
		const { styles, id } = await fixture.load(
			`${rootLink}${target}<div id="parent">Parent</div>`,
		);
		expect(calls).toEqual([rootUrl, childUrl]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(styles.metrics().issues["css-import-policy-denied"]).toBe(1);
	},
);

it.each(["basic", "cors", "opaque"] as const)(
	"accepts imported %s responses under the draft native policy",
	async (type) => {
		const calls: string[] = [];
		const fixture = harness(
			{},
			{
				fetchStylesheetWithPolicy: async (url) => {
					calls.push(url);
					return {
						response: response(
							url,
							url === rootUrl
								? '@import "child.css";'
								: "#target{display:none}",
						),
						type: url === rootUrl ? "basic" : type,
					};
				},
			},
		);
		const { styles, id } = await fixture.load(`${rootLink}${target}`);
		expect(calls).toEqual([rootUrl, childUrl]);
		expect(styles.get(id("#target")).visible).toBe(false);
	},
);

it.each([true, false])(
	"verifies root response bytes before any imports (matching: %s)",
	async (matching) => {
		const text = '@import "child.css"; #parent{display:none}';
		const body = new Uint8Array([
			0xef,
			0xbb,
			0xbf,
			...new TextEncoder().encode(text),
		]);
		const sheet = response(rootUrl, text, "text/css; charset=windows-1252", {
			body,
			encodedBytes: body.byteLength,
		});
		const digest = createHash("sha256")
			.update(matching ? body : new TextEncoder().encode(text))
			.digest("base64");
		const fixture = harness({
			[rootUrl]: sheet,
			[childUrl]: response(childUrl, "#target{display:none}"),
		});
		const { styles, id } = await fixture.load(
			`<link rel="stylesheet" href="/styles/root.css" crossorigin integrity="sha256-${digest}">${target}<div id="parent">Parent</div>`,
		);
		expect(fixture.calls.map((call) => call.url)).toEqual(
			matching ? [rootUrl, childUrl] : [rootUrl],
		);
		expect(styles.get(id("#target")).visible).toBe(!matching);
		expect(styles.get(id("#parent")).visible).toBe(!matching);
		if (!matching)
			expect(styles.metrics().issues["stylesheet-integrity-mismatch"]).toBe(1);
	},
);

it("decodes imported bytes with the importing encoding through multiple levels", async () => {
	const childText = '@import "grandchild.css"; .café{display:none}';
	const grandchildText = ".piñata{visibility:hidden}";
	const childBody = Uint8Array.from(childText, (character) =>
		character.charCodeAt(0),
	);
	const grandchildBody = Uint8Array.from(grandchildText, (character) =>
		character.charCodeAt(0),
	);
	const fixture = harness({
		[rootUrl]: response(
			rootUrl,
			'@import "child.css";',
			"text/css; charset=windows-1252",
		),
		[childUrl]: response(childUrl, "", "text/css", {
			body: childBody,
			encodedBytes: childBody.byteLength,
		}),
		[grandchildUrl]: response(grandchildUrl, "", "text/css", {
			body: grandchildBody,
			encodedBytes: grandchildBody.byteLength,
		}),
	});
	const { styles, id } = await fixture.load(
		`${rootLink}<div class="café">Cafe</div><div class="piñata">Pinata</div>`,
	);
	expect(styles.get(id(".café")).visible).toBe(false);
	expect(styles.get(id(".piñata")).visibility).toBe("hidden");
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		childUrl,
		grandchildUrl,
	]);
});

it.each(["charset", "BOM"] as const)(
	"lets an imported %s override the importing encoding",
	async (kind) => {
		const encoded = new TextEncoder().encode(".café{display:none}");
		const body =
			kind === "BOM" ? new Uint8Array([0xef, 0xbb, 0xbf, ...encoded]) : encoded;
		const fixture = harness({
			[rootUrl]: response(
				rootUrl,
				'@import "child.css";',
				"text/css; charset=windows-1252",
			),
			[childUrl]: response(
				childUrl,
				"",
				kind === "charset" ? "text/css; charset=utf-8" : "text/css",
				{ body, encodedBytes: body.byteLength },
			),
		});
		const { styles, id } = await fixture.load(
			`${rootLink}<div class="café">Cafe</div>`,
		);
		expect(styles.get(id(".café")).visible).toBe(false);
		expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
	},
);

it("invalidates the cascade when a child source changes under identical root text", async () => {
	const text = '@import "child.css";';
	const fixture = harness({
		[rootUrl]: response(rootUrl, text),
		[childUrl]: response(childUrl, "#target{display:none}"),
	});
	const { styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(styles.get(id("#target")).visible).toBe(false);
	const replacementCalls: string[] = [];
	const loaded = await loadStylesheetImports(
		{ url: rootUrl, text, encoding: "utf-8" },
		{
			signal: fixture.controller.signal,
			fetch: async (url) => {
				replacementCalls.push(url);
				return { url, text: "#target{display:block}", encoding: "utf-8" };
			},
		},
	);
	styles.setStylesheetSource(id("link"), rootUrl, loaded.source);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(loaded.source.text).toBe(text);
	expect(styles.metrics().importedSheets).toBe(1);
	expect(replacementCalls).toEqual([childUrl]);
	expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
});

it("replaces a root graph and drops old imports when replaced with plain text", async () => {
	const fixture = harness({
		[rootUrl]: response(rootUrl, '@import "child.css";'),
		[childUrl]: response(childUrl, "#target{display:none}"),
	});
	const { styles, id } = await fixture.load(`${rootLink}${target}`);
	expect(styles.get(id("#target")).visible).toBe(false);
	const replacementCalls: string[] = [];
	const loaded = await loadStylesheetImports(
		{
			url: rootUrl,
			text: '@import "grandchild.css"; #target{visibility:hidden}',
			encoding: "utf-8",
		},
		{
			signal: fixture.controller.signal,
			fetch: async (url) => {
				replacementCalls.push(url);
				return { url, text: "#target{display:block}", encoding: "utf-8" };
			},
		},
	);
	styles.setStylesheetSource(id("link"), rootUrl, loaded.source);
	expect(styles.get(id("#target"))).toMatchObject({
		display: "block",
		visibility: "hidden",
		visible: false,
	});
	expect(replacementCalls).toEqual([grandchildUrl]);
	styles.setExternalSheet(
		id("link"),
		rootUrl,
		"#target{display:block;visibility:visible}",
	);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.metrics().importedSheets).toBe(0);
	expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
});

it("invalidates inline import graphs on text mutation without fetching new imports", async () => {
	const text = '@import "/styles/child.css";';
	const fixture = harness({
		[childUrl]: response(childUrl, "#target{display:none}"),
	});
	const { tree, styles, id } = await fixture.load(
		`<style>${text}</style>${target}`,
	);
	expect(styles.get(id("#target")).visible).toBe(false);
	const replacement =
		'@import "/styles/grandchild.css"; #target{visibility:hidden}';
	tree.setTextContent(id("style"), replacement);
	expect(tree.textContent(id("style"))).toBe(replacement);
	expect(styles.get(id("#target"))).toMatchObject({
		display: "block",
		visibility: "hidden",
	});
	expect(styles.metrics().issues["changed-stylesheet-needs-reload"]).toBe(1);
	expect(fixture.calls.map((call) => call.url)).toEqual([childUrl]);
});

it.each(["inline", "linked"] as const)(
	"invalidates %s import graphs after a base URL mutation",
	async (kind) => {
		const text = '@import "child.css";';
		const fixture = harness({
			[rootUrl]: response(rootUrl, text),
			[childUrl]: response(childUrl, "#target{display:none}"),
		});
		const root =
			kind === "inline"
				? `<style>${text}</style>`
				: '<link rel="stylesheet" href="root.css" crossorigin>';
		const { tree, styles, id } = await fixture.load(
			`<base href="/styles/">${root}${target}`,
		);
		expect(styles.get(id("#target")).visible).toBe(false);
		tree.setAttribute(id("base"), "href", "/replacement/");
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.metrics().issues["changed-stylesheet-needs-reload"]).toBe(1);
		expect(fixture.calls.map((call) => call.url)).toEqual(
			kind === "inline" ? [childUrl] : [rootUrl, childUrl],
		);
		if (kind === "inline") expect(tree.textContent(id("style"))).toBe(text);
	},
);

it("stops at the document sheet budget without installing a partial graph", async () => {
	const urls = Array.from(
		{ length: 32 },
		(_, index) => `https://page.example/styles/import-${index}.css`,
	);
	const text = `${urls.map((url) => `@import "${url}";`).join("")}#parent{display:none}`;
	const fixture = harness({
		[rootUrl]: response(rootUrl, text),
		...Object.fromEntries(
			urls.map((url) => [url, response(url, "#target{display:none}")]),
		),
	});
	const { styles, id } = await fixture.load(
		`${rootLink}${target}<div id="parent">Parent</div>`,
	);
	expect(styles.limits.maxSheets).toBe(32);
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		...urls.slice(0, 31),
	]);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().issues["stylesheet-resource-limit"]).toBe(1);
	expect(styles.metrics().importedSheets).toBe(0);
});

it("bounds import depth before requesting a deeper child", async () => {
	const urls = Array.from(
		{ length: stylesheetImportLimits.maxDepth + 1 },
		(_, index) => `https://page.example/styles/depth-${index}.css`,
	);
	const sheets = Object.fromEntries(
		urls.map((url, index) => [
			url,
			response(
				url,
				index + 1 < urls.length
					? `@import "${urls[index + 1]}"; #target{display:none}`
					: "#target{display:none}",
			),
		]),
	);
	const fixture = harness({
		[rootUrl]: response(rootUrl, `@import "${urls[0]}"; #parent{display:none}`),
		...sheets,
	});
	const { styles, id } = await fixture.load(
		`${rootLink}${target}<div id="parent">Parent</div>`,
	);
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		...urls.slice(0, stylesheetImportLimits.maxDepth),
	]);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().issues["stylesheet-resource-limit"]).toBe(1);
});

it("shares the import request budget across roots even when every child fails", async () => {
	const text = `${'@import "child.css";'.repeat(33)}#parent{display:none}`;
	const fixture = harness({
		[rootUrl]: response(rootUrl, text),
		[grandchildUrl]: response(grandchildUrl, text),
		[childUrl]: new Error("synthetic missing child"),
	});
	const { styles, id } = await fixture.load(
		`${rootLink}<link rel="stylesheet" href="/styles/grandchild.css" crossorigin>${target}<div id="parent">Parent</div>`,
	);
	expect(fixture.calls.filter((call) => call.url === childUrl)).toHaveLength(
		stylesheetImportLimits.maxImports,
	);
	expect(
		fixture.calls
			.filter((call) => call.url !== childUrl)
			.map((call) => call.url),
	).toEqual([rootUrl, grandchildUrl]);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().issues["stylesheet-resource-limit"]).toBe(1);
});

it.each(["decoded text", "encoded body"] as const)(
	"bounds imported %s before following grandchildren",
	async (kind) => {
		const maximum = stylesheetImportLimits.maxCodeUnits;
		const text = `@import "grandchild.css"; /*${"x".repeat(maximum)}*/`;
		const body =
			kind === "encoded body"
				? new Uint8Array(maximum * 4 + 4)
				: new TextEncoder().encode(text);
		const fixture = harness({
			[rootUrl]: response(
				rootUrl,
				'@import "child.css"; #parent{display:none}',
			),
			[childUrl]: response(childUrl, "", "text/css", {
				body,
				encodedBytes: body.byteLength,
			}),
		});
		const { styles, id } = await fixture.load(
			`${rootLink}${target}<div id="parent">Parent</div>`,
		);
		expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
		expect(styles.get(id("#target")).visible).toBe(true);
		expect(styles.get(id("#parent")).visible).toBe(false);
		expect(styles.metrics().issues["stylesheet-resource-limit"]).toBe(1);
		expect(styles.metrics().importedSheets).toBe(0);
	},
);

it("charges all imported text against one graph budget", async () => {
	const text = `/*${"x".repeat(Math.floor(stylesheetImportLimits.maxCodeUnits / 2))}*/#target{display:none}`;
	const fixture = harness({
		[rootUrl]: response(
			rootUrl,
			'@import "child.css"; @import "grandchild.css"; #parent{display:none}',
		),
		[childUrl]: response(childUrl, text),
		[grandchildUrl]: response(grandchildUrl, text),
	});
	const { styles, id } = await fixture.load(
		`${rootLink}${target}<div id="parent">Parent</div>`,
	);
	expect(fixture.calls.map((call) => call.url)).toEqual([
		rootUrl,
		childUrl,
		grandchildUrl,
	]);
	expect(styles.get(id("#target")).visible).toBe(true);
	expect(styles.get(id("#parent")).visible).toBe(false);
	expect(styles.metrics().issues["stylesheet-resource-limit"]).toBe(1);
	expect(styles.metrics().importedSheets).toBe(0);
});

it.each(["response", "error"] as const)(
	"propagates abort during a child %s and closes the partial document",
	async (kind) => {
		const controller = new AbortController();
		controllers.add(controller);
		const calls: string[] = [];
		const fixture = harness(
			{},
			{
				signal: controller.signal,
				fetchStylesheetWithPolicy: async (url) => {
					calls.push(url);
					if (url === childUrl) {
						controller.abort();
						if (kind === "error") throw new Error("synthetic cancellation");
					}
					return {
						response: response(
							url,
							url === rootUrl
								? '@import "child.css"; @import "grandchild.css";'
								: '@import "grandchild.css"; #target{display:none}',
						),
						type: "basic",
					};
				},
			},
		);
		await expect(fixture.load(`${rootLink}${target}`)).rejects.toMatchObject({
			code: "aborted",
		});
		expect(calls).toEqual([rootUrl, childUrl]);
		expect(fixture.initialized).toHaveLength(1);
		expect(fixture.initialized[0].mutationMetrics().closed).toBe(true);
	},
);

it("does not turn an explicit child abort into a recoverable import failure", async () => {
	const fixture = harness({
		[rootUrl]: response(
			rootUrl,
			'@import "child.css"; @import "grandchild.css";',
		),
		[childUrl]: new AgentBrowserError("aborted", "synthetic child abort"),
	});
	await expect(fixture.load(`${rootLink}${target}`)).rejects.toMatchObject({
		code: "aborted",
	});
	expect(fixture.calls.map((call) => call.url)).toEqual([rootUrl, childUrl]);
	expect(fixture.initialized).toHaveLength(1);
	expect(fixture.initialized[0].mutationMetrics().closed).toBe(true);
});
