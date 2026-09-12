import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { loadBrowserDocument } from "./document-loader.js";
import { htmlParseInfo } from "./html-info.js";
import type { NetworkResponse } from "./network.js";
import { DocumentQueries } from "./selectors.js";
import type { DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";

const context: DocumentLoaderContext = {
	tabId: "test",
	signal: new AbortController().signal,
	limits: {
		maxNodes: 50_000,
		maxDepth: 256,
		maxTextCodeUnits: 2_000_000,
		maxChanges: 1024,
	},
};
function response(text: string, type = "text/html"): NetworkResponse {
	const body = new TextEncoder().encode(text);
	return {
		url: "https://example.com/",
		status: 200,
		headers: { "content-type": [type] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
}

it("loads explicit HTML through the parser while text and JSON remain literal", async () => {
	for (const type of [
		"text/html",
		"text/plain",
		"application/json",
		"application/problem+json",
	]) {
		const tree = await loadBrowserDocument(
			response("<p>Hello</p>", type),
			context,
		);
		expect(new DocumentQueries(tree).querySelector("p") !== null).toBe(
			type === "text/html",
		);
		expect(!!htmlParseInfo(tree)).toBe(type === "text/html");
		tree.close();
	}
});

it("does not retrieve missing or empty stylesheet hrefs", async () => {
	let requests = 0;
	const tree = await loadBrowserDocument(
		response(
			'<link rel=stylesheet><link rel=stylesheet href=" "><p>Content</p>',
		),
		{
			...context,
			fetchStylesheet: async () => {
				requests++;
				return response("p{display:none}", "text/css");
			},
		},
	);
	expect(requests).toBe(0);
	expect(documentStyles(tree).metrics().issues["stylesheet-missing-href"]).toBe(
		2,
	);
	tree.close();
});

it("discloses when a caller has not supplied a stylesheet transport", async () => {
	const tree = await loadBrowserDocument(
		response("<link rel=stylesheet href=/sheet.css><p>Content</p>"),
		context,
	);
	expect(
		documentStyles(tree).metrics().issues["stylesheet-fetch-unavailable"],
	).toBe(1);
	tree.close();
});

it.each([
	["integrity=''", "no-cors", "include"],
	["crossorigin", "cors", "same-origin"],
	["crossorigin=anonymous", "cors", "same-origin"],
	["crossorigin=invalid", "cors", "same-origin"],
	["crossorigin=use-credentials", "cors", "include"],
	["crossorigin=USE-CREDENTIALS", "cors", "include"],
	["crossorigin=' use-credentials '", "cors", "same-origin"],
])(
	"passes explicit stylesheet policy for %s",
	async (attributes, mode, credentials) => {
		const calls: unknown[] = [];
		const tree = await loadBrowserDocument(
			response(`<link rel=stylesheet href=/sheet.css ${attributes}><p>Content`),
			{
				...context,
				fetchStylesheet: async () => {
					throw new Error("Legacy stylesheet callback must not handle policy");
				},
				fetchStylesheetWithPolicy: async (url, policy) => {
					calls.push({ url, ...policy });
					return {
						response: { ...response("p{color:red}", "text/css"), url },
						type: "basic",
					};
				},
			},
		);
		expect(calls).toEqual([
			{ url: "https://example.com/sheet.css", mode, credentials },
		]);
		expect(documentStyles(tree).metrics().externalSheets).toBe(1);
		tree.close();
	},
);

it("does not silently drop policy into a legacy URL-only callback", async () => {
	let requests = 0;
	const tree = await loadBrowserDocument(
		response("<link rel=stylesheet href=/sheet.css crossorigin>"),
		{
			...context,
			fetchStylesheet: async () => {
				requests++;
				return response("p{color:red}", "text/css");
			},
		},
	);
	expect(requests).toBe(0);
	expect(
		documentStyles(tree).metrics().issues[
			"stylesheet-integrity-or-cors-not-implemented"
		],
	).toBe(1);
	tree.close();
});

it.each([
	["basic", true, undefined],
	["cors", true, undefined],
	["basic", false, "stylesheet-integrity-mismatch"],
	["opaque", true, "stylesheet-integrity-response-not-readable"],
] as const)(
	"checks stylesheet integrity on %s responses (matching %s)",
	async (type, matching, issue) => {
		const sheet = response("p{color:red}", "text/css");
		const digest = createHash("sha256")
			.update(matching ? sheet.body : new Uint8Array())
			.digest("base64");
		const tree = await loadBrowserDocument(
			response(
				`<link rel=stylesheet href=/sheet.css integrity=sha256-${digest}>`,
			),
			{
				...context,
				fetchStylesheetWithPolicy: async () => ({ response: sheet, type }),
			},
		);
		expect(documentStyles(tree).metrics().externalSheets).toBe(issue ? 0 : 1);
		if (issue) expect(documentStyles(tree).metrics().issues[issue]).toBe(1);
		tree.close();
	},
);

it("hashes the response bytes before BOM and charset decoding", async () => {
	const sheet = response("p{color:red}", "text/css; charset=windows-1252");
	sheet.body = new Uint8Array([0xef, 0xbb, 0xbf, ...sheet.body]);
	const digest = createHash("sha384").update(sheet.body).digest("base64");
	const tree = await loadBrowserDocument(
		response(
			`<link rel=stylesheet href=/sheet.css crossorigin integrity=sha384-${digest}>`,
		),
		{
			...context,
			fetchStylesheetWithPolicy: async () => ({
				response: sheet,
				type: "basic",
			}),
		},
	);
	expect(documentStyles(tree).metrics().externalSheets).toBe(1);
	tree.close();
});

it.each(["sha256-", "sha256-malformed", "sha256"])(
	"retains recognized invalid integrity %s as a restriction",
	async (integrity) => {
		const tree = await loadBrowserDocument(
			response(`<link rel=stylesheet href=/sheet.css integrity=${integrity}>`),
			{
				...context,
				fetchStylesheetWithPolicy: async () => ({
					response: response("p{color:red}", "text/css"),
					type: "basic",
				}),
			},
		);
		expect(documentStyles(tree).metrics().externalSheets).toBe(0);
		expect(
			documentStyles(tree).metrics().issues["stylesheet-integrity-mismatch"],
		).toBe(1);
		tree.close();
	},
);

it("does not accept an opaque response from a CORS stylesheet callback", async () => {
	const tree = await loadBrowserDocument(
		response("<link rel=stylesheet href=/sheet.css crossorigin>"),
		{
			...context,
			fetchStylesheetWithPolicy: async () => ({
				response: response("p{color:red}", "text/css"),
				type: "opaque",
			}),
		},
	);
	expect(documentStyles(tree).metrics().externalSheets).toBe(0);
	expect(
		documentStyles(tree).metrics().issues[
			"stylesheet-cors-response-not-readable"
		],
	).toBe(1);
	tree.close();
});

it("bounds integrity metadata before requesting a stylesheet", async () => {
	let requests = 0;
	const tree = await loadBrowserDocument(
		response(
			`<link rel=stylesheet href=/sheet.css integrity='${"x".repeat(16385)}'>`,
		),
		{
			...context,
			fetchStylesheetWithPolicy: async () => {
				requests++;
				return {
					response: response("p{color:red}", "text/css"),
					type: "basic",
				};
			},
		},
	);
	expect(requests).toBe(0);
	expect(
		documentStyles(tree).metrics().issues["stylesheet-resource-limit"],
	).toBe(1);
	tree.close();
});

it.each(["header", "meta"])(
	"evaluates %s CSP without weakening unsupported metadata denial",
	async (source) => {
		let requests = 0;
		const input = response(
			`${source === "meta" ? '<meta http-equiv=Content-Security-Policy content="default-src self">' : ""}<link rel=stylesheet href=/sheet.css crossorigin>`,
		);
		if (source === "header")
			input.headers = {
				...input.headers,
				"content-security-policy": ["default-src 'self'"],
			};
		const tree = await loadBrowserDocument(input, {
			...context,
			fetchStylesheetWithPolicy: async () => {
				requests++;
				return {
					response: response("p{color:red}", "text/css"),
					type: "basic",
				};
			},
		});
		expect(requests).toBe(source === "header" ? 1 : 0);
		expect(documentStyles(tree).metrics().externalSheets).toBe(
			source === "header" ? 1 : 0,
		);
		expect(documentStyles(tree).metrics().issues).toEqual(
			source === "header"
				? {}
				: {
						"stylesheet-policy-denied": 1,
						"external-stylesheet-not-loaded": 1,
					},
		);
		tree.close();
	},
);

it("does not allow a weaker digest match to override a stronger mismatch", async () => {
	const sheet = response("p{color:red}", "text/css");
	const digest = createHash("sha256").update(sheet.body).digest("base64");
	const tree = await loadBrowserDocument(
		response(
			`<link rel=stylesheet href=/sheet.css integrity='sha256-${digest} sha512-malformed'>`,
		),
		{
			...context,
			fetchStylesheetWithPolicy: async () => ({
				response: sheet,
				type: "basic",
			}),
		},
	);
	expect(documentStyles(tree).metrics().externalSheets).toBe(0);
	expect(
		documentStyles(tree).metrics().issues["stylesheet-integrity-mismatch"],
	).toBe(1);
	tree.close();
});

it("permits unsupported-only integrity without claiming a digest match", async () => {
	const tree = await loadBrowserDocument(
		response("<link rel=stylesheet href=/sheet.css integrity=unknown-abc>"),
		{
			...context,
			fetchStylesheetWithPolicy: async () => ({
				response: response("p{color:red}", "text/css"),
				type: "opaque",
			}),
		},
	);
	expect(documentStyles(tree).metrics().externalSheets).toBe(1);
	tree.close();
});

it.each([
	[404, ["text/css"]],
	[200, ["text/html"]],
	[200, ["text/css", "text/css"]],
] as const)(
	"retains status/MIME gates for policy stylesheets (%s %s)",
	async (status, types) => {
		const sheet = response("p{color:red}", "text/css");
		sheet.status = status;
		sheet.headers = { "content-type": [...types] };
		const tree = await loadBrowserDocument(
			response("<link rel=stylesheet href=/sheet.css crossorigin>"),
			{
				...context,
				fetchStylesheetWithPolicy: async () => ({
					response: sheet,
					type: "basic",
				}),
			},
		);
		expect(documentStyles(tree).metrics().externalSheets).toBe(0);
		expect(
			documentStyles(tree).metrics().issues["stylesheet-unsupported"],
		).toBe(1);
		tree.close();
	},
);

it("does not swallow a canceled opaque stylesheet response", async () => {
	const controller = new AbortController();
	await expect(
		loadBrowserDocument(
			response("<link rel=stylesheet href=/sheet.css crossorigin>"),
			{
				...context,
				signal: controller.signal,
				fetchStylesheetWithPolicy: async () => {
					controller.abort();
					return {
						response: response("p{color:red}", "text/css"),
						type: "opaque",
					};
				},
			},
		),
	).rejects.toMatchObject({ code: "aborted" });
});

it.each([
	'<meta charset="utf-8">',
	'<meta content="text/html; charset=utf-8" http-equiv="Content-Type">',
	'<meta charset="utf-16">',
])("prescans supported HTML metadata encoding: %s", async (meta) => {
	const tree = await loadBrowserDocument(
		response(`${meta}<p>日本語 £</p>`),
		context,
	);
	expect(tree.textContent(tree.root)).toContain("日本語 £");
	expect(htmlParseInfo(tree)?.encoding).toBe("utf-8");
});

it("honors HTTP charset over meta, and BOM over HTTP", async () => {
	const header = response(
		"<meta charset=utf-8><p>£</p>",
		"text/html; charset=windows-1252",
	);
	const fromHeader = await loadBrowserDocument(header, context);
	expect(fromHeader.textContent(fromHeader.root)).toContain("Â£");
	expect(htmlParseInfo(fromHeader)?.encoding).toBe("windows-1252");
	header.body = new Uint8Array([0xef, 0xbb, 0xbf, ...header.body]);
	const fromBom = await loadBrowserDocument(header, context);
	expect(fromBom.textContent(fromBom.root)).toContain("£");
	expect(fromBom.textContent(fromBom.root)).not.toContain("Â");
	expect(htmlParseInfo(fromBom)?.encoding).toBe("utf-8");
});

it("uses windows-1252 fallback without treating commented metadata as a declaration", async () => {
	const input = response("<!--<meta charset=utf-8>--><p>");
	input.body = new Uint8Array([...input.body, 0x80]);
	const tree = await loadBrowserDocument(input, context);
	expect(htmlParseInfo(tree)?.encoding).toBe("windows-1252");
	expect(tree.textContent(tree.root)).toContain("€");
});

it("does not allow metadata beyond the prescan window to silently change decoding", async () => {
	const tree = await loadBrowserDocument(
		response(`${" ".repeat(1024)}<meta charset=utf-8><p>£</p>`),
		context,
	);
	expect(htmlParseInfo(tree)?.encoding).toBe("windows-1252");
});

it.each([
	"application/xhtml+xml",
	"image/svg+xml",
	"application/javascript",
	"application/octet-stream",
])("rejects executable/unsupported MIME %s", async (type) => {
	await expect(
		loadBrowserDocument(response("<p>x", type), context),
	).rejects.toThrow("supports plain text");
});

it("refuses missing MIME, oversized input and canceled loads", async () => {
	const missing = response("<p>x");
	missing.headers = {};
	await expect(loadBrowserDocument(missing, context)).rejects.toThrow(
		"explicit Content-Type",
	);
	await expect(
		loadBrowserDocument(response("x".repeat(20)), {
			...context,
			limits: { ...context.limits, maxTextCodeUnits: 1 },
		}),
	).rejects.toThrow("Encoded HTML");
	await expect(
		loadBrowserDocument(response("<p>x"), {
			...context,
			signal: AbortSignal.abort(),
		}),
	).rejects.toThrow("aborted");
});
