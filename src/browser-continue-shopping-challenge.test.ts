import { afterEach, describe, expect, it, vi } from "vitest";
import { browserChallengeStructure } from "./browser-challenge-structure.js";
import {
	type BrowserChallengeResponse,
	classifyBrowserChallenge,
} from "./browser-challenges.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo } from "./html-info.js";
import { parseHtmlDocument } from "./html-parser.js";
import { serializeHtml } from "./html-serialization.js";

const marker = "continue-shopping-challenge-v1";
const url = "https://www.amazon.com/";
const documents: DocumentTree[] = [];
const instruction = "Click the button below to continue shopping";
const hiddenInputs = [
	'<input type="hidden" name="amzn" value="synthetic-amzn-only">',
	'<input type="hidden" name="amzn-r" value="synthetic-return-only">',
	'<input type="hidden" name="field-keywords" value="synthetic-keywords-only">',
];
const button = '<button type="submit">Continue shopping</button>';
const form = `<form method="get" action="/errors_page/validateCaptcha">${hiddenInputs.join("")}${button}</form>`;
const conditions =
	'<a href="/gp/help/customer/display.html?nodeId=508088">Conditions of Use</a>';
const privacy =
	'<a href="/gp/help/customer/display.html?nodeId=468496">Privacy Policy</a>';
const copyright = "© 1996-2025, Amazon.com, Inc. or its affiliates";
const shell = `<div><h4>${instruction}</h4>${form}<div>${conditions} ${privacy}</div><span>${copyright}</span></div>`;
const expected = {
	kind: "challenge",
	provider: "unspecified",
	confidence: "possible",
	evidence: ["html-continue-shopping-challenge"],
	action: "stop-and-request-user-handoff",
};

function parse(source: string, sourceUrl = url) {
	const tree = parseHtmlDocument(source, sourceUrl);
	documents.push(tree);
	return tree;
}

function fixture(
	body = shell,
	sourceUrl = url,
	head = "<title>Amazon.com</title>",
) {
	return parse(
		`<!doctype html><html><head>${head}</head><body>${body}</body></html>`,
		sourceUrl,
	);
}

function response(tree: DocumentTree): BrowserChallengeResponse {
	return {
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		structure: browserChallengeStructure(tree),
	};
}

function reject(tree: DocumentTree) {
	expect(browserChallengeStructure(tree)).toBeUndefined();
	expect(classifyBrowserChallenge(response(tree))).toBeNull();
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const tree of documents.splice(0)) tree.close();
});

describe("bounded continue-shopping source shell", () => {
	it.each([
		["https://amazon.com/", "Amazon.com"],
		["https://www.amazon.com/", "Amazon.com"],
		["https://amazon.co.uk/", "Amazon.co.uk"],
		["https://www.amazon.co.uk/", "Amazon.co.uk"],
		["https://www.amazon.com:443/cart", "Amazon.com"],
	])("recognizes the supported source %s", (sourceUrl, title) => {
		const body =
			title === "Amazon.co.uk"
				? shell
						.replace("Conditions of Use", "Conditions of Use &amp; Sale")
						.replace("Privacy Policy", "Privacy Notice")
				: shell;
		const tree = fixture(body, sourceUrl, `<title>${title}</title>`);
		expect(browserChallengeStructure(tree)).toBe(marker);
		expect(classifyBrowserChallenge(response(tree))).toEqual(expected);
	});

	it("accepts neutral wrappers and keeps the instruction outside the form", () => {
		const body = shell
			.replace(instruction, `<span>${instruction}</span>`)
			.replace(
				button,
				`<div>${button.replace("Continue shopping", "<i>Continue shopping</i>")}</div>`,
			)
			.replace(conditions, `<span>${conditions}</span>`);
		expect(browserChallengeStructure(fixture(body))).toBe(marker);
	});

	it("does not depend on synthetic hidden input values", () => {
		const body = shell.replace(/value="synthetic-[^"]*"/g, 'value=""');
		expect(browserChallengeStructure(fixture(body))).toBe(marker);
	});

	it.each([
		"http://www.amazon.com/",
		"https://amazon.ca/",
		"https://smile.amazon.com/",
		"https://www.amazon.com.fixture.invalid/",
		"https://notamazon.com/",
		"https://fixture.invalid/amazon.com",
		"https://synthetic-user@www.amazon.com/",
		"https://synthetic-user:synthetic-password@www.amazon.com/",
		"https://www.amazon.com:444/",
		"https://www.amazon.co.uk:8443/",
	])("rejects unsupported source authority %s", (sourceUrl) => {
		const uk = sourceUrl.includes("amazon.co.uk");
		const body = uk
			? shell
					.replace("Conditions of Use", "Conditions of Use &amp; Sale")
					.replace("Privacy Policy", "Privacy Notice")
			: shell;
		reject(
			fixture(
				body,
				sourceUrl,
				`<title>${uk ? "Amazon.co.uk" : "Amazon.com"}</title>`,
			),
		);
	});

	it.each([
		"",
		"<title></title>",
		"<title>Amazon</title>",
		"<title>Amazon.co.uk</title>",
		"<title>Amazon.com shopping cart</title>",
		"<title>Amazon.com</title><title>Amazon.com</title>",
	])("rejects an absent, wrong or duplicate title %#", (head) => {
		reject(fixture(shell, url, head));
	});

	it.each([
		["instruction", `<h4>${instruction}</h4>`, ""],
		[
			"instruction heading level",
			`<h4>${instruction}</h4>`,
			`<p>${instruction}</p>`,
		],
		["instruction text", instruction, "Click below to shop"],
		[
			"duplicate instruction",
			`<h4>${instruction}</h4>`,
			`<h4>${instruction}</h4><h4>${instruction}</h4>`,
		],
		["form", form, button],
		["method", ' method="get"', ""],
		["post method", 'method="get"', 'method="post"'],
		["action", ' action="/errors_page/validateCaptcha"', ""],
		["wrong action", "/errors_page/validateCaptcha", "/cart"],
		[
			"absolute action",
			"/errors_page/validateCaptcha",
			"https://www.amazon.com/errors_page/validateCaptcha",
		],
		[
			"action query",
			"/errors_page/validateCaptcha",
			"/errors_page/validateCaptcha?extra=1",
		],
		["amzn input", hiddenInputs[0], ""],
		["amzn-r input", hiddenInputs[1], ""],
		["field-keywords input", hiddenInputs[2], ""],
		["input name", 'name="amzn"', 'name="unexpected"'],
		["duplicate input name", 'name="amzn-r"', 'name="amzn"'],
		["hidden input type", 'type="hidden"', 'type="text"'],
		["submit", button, ""],
		["submit type", 'type="submit"', 'type="button"'],
		["submit text", button, '<button type="submit">Continue to cart</button>'],
		["submit outside form", `${button}</form>`, `</form>${button}`],
		[
			"input outside form",
			`${hiddenInputs[0]}${hiddenInputs[1]}`,
			hiddenInputs[1],
		],
		["conditions", conditions, ""],
		["privacy", privacy, ""],
		[
			"conditions href",
			' href="/gp/help/customer/display.html?nodeId=508088"',
			"",
		],
		[
			"privacy href",
			' href="/gp/help/customer/display.html?nodeId=468496"',
			"",
		],
		["conditions label", "Conditions of Use", "Terms"],
		["privacy label", "Privacy Policy", "Privacy Notice"],
		["conditions anchor", conditions, "Conditions of Use"],
		["copyright", copyright, ""],
		["copyright owner", "Amazon.com, Inc.", "Unrelated Store, Inc."],
	])("rejects missing or altered conjunction part: %s", (name, from, to) => {
		const body = shell.replace(from, to);
		reject(
			fixture(
				name === "input outside form" ? `${body}${hiddenInputs[0]}` : body,
			),
		);
	});

	it.each([
		[
			"https://www.amazon.com/",
			"Amazon.com",
			"Conditions of Use &amp; Sale",
			"Privacy Notice",
		],
		[
			"https://www.amazon.co.uk/",
			"Amazon.co.uk",
			"Conditions of Use",
			"Privacy Policy",
		],
		[
			"https://www.amazon.co.uk/",
			"Amazon.com",
			"Conditions of Use &amp; Sale",
			"Privacy Notice",
		],
	])(
		"rejects mismatched regional labels or title %#",
		(sourceUrl, title, terms, policy) => {
			reject(
				fixture(
					shell
						.replace("Conditions of Use", terms)
						.replace("Privacy Policy", policy),
					sourceUrl,
					`<title>${title}</title>`,
				),
			);
		},
	);

	it.each([
		"Unrelated visible text",
		"<div>Recommended products</div>",
		"<form></form>",
		hiddenInputs[0],
		button,
		conditions,
		"<a href='/extra'>Extra link</a>",
		"<template></template>",
		"<noscript></noscript>",
		"<svg></svg>",
		"<math></math>",
	])("rejects additional shell content %#", (extra) => {
		reject(fixture(`${shell}${extra}`));
	});

	it.each([hiddenInputs[0], button])(
		"rejects extra controls inside the form %#",
		(extra) => {
			reject(fixture(shell.replace("</form>", `${extra}</form>`)));
		},
	);

	it.each([
		'<base href="https://www.amazon.com/">',
		"<template></template>",
		"<noscript></noscript>",
	])("rejects disallowed head content %#", (extra) => {
		reject(fixture(shell, url, `<title>Amazon.com</title>${extra}`));
	});

	it.each([
		[
			"shopping",
			"<main><h1>Today's products</h1><a href='/cart'>Continue shopping</a></main>",
		],
		[
			"cart",
			"<h1>Your cart</h1><form method='get' action='/cart'><button type='submit'>Continue shopping</button></form>",
		],
		[
			"article",
			`<article><h1>Shopping help</h1><h4>${instruction}</h4><p>Continue shopping</p>${conditions}${privacy}${copyright}</article>`,
		],
		[
			"article around a complete shell",
			`<article><h1>How the shopping page works</h1>${shell}</article>`,
		],
	])("does not mistake a normal %s for a challenge", (_name, body) => {
		reject(fixture(body));
	});

	it.each(["button", "input"])("rejects disabled %s controls", (tag) => {
		reject(fixture(shell.replace(`<${tag} `, `<${tag} disabled `)));
	});

	it("rejects controls disabled through a fieldset", () => {
		reject(
			fixture(shell.replace(form, `<fieldset disabled>${form}</fieldset>`)),
		);
	});

	it.each(["button", "input"])("rejects form overrides on %s", (tag) => {
		for (const attribute of [
			'form="external"',
			'formaction="/errors_page/validateCaptcha"',
			'formmethod="get"',
			'formenctype="application/x-www-form-urlencoded"',
			'formtarget="_self"',
			"formnovalidate",
		]) {
			reject(fixture(shell.replace(`<${tag} `, `<${tag} ${attribute} `)));
		}
	});

	it.each(["hidden", "inert", 'aria-hidden="true"'])(
		"rejects invisible shell content via %s",
		(attribute) => {
			for (const tag of ["div", "h4", "form", "button", "a", "span"]) {
				reject(fixture(shell.replace(`<${tag}`, `<${tag} ${attribute}`)));
			}
			reject(
				parse(
					`<!doctype html><html><head><title>Amazon.com</title></head><body ${attribute}>${shell}</body></html>`,
				),
			);
			reject(
				parse(
					`<!doctype html><html ${attribute}><head><title>Amazon.com</title></head><body>${shell}</body></html>`,
				),
			);
		},
	);

	it.each([
		"display:none",
		"display: none !important",
		"color: red; display: none; padding: 0",
		"color: red; display: none !important; padding: 0",
	])("rejects explicit inline hiding on shell ancestors: %s", (style) => {
		const source = `<!doctype html><html><head><title>Amazon.com</title></head><body>${shell}</body></html>`;
		for (const tag of ["html", "body", "div", "form"]) {
			reject(parse(source.replace(`<${tag}`, `<${tag} style="${style}"`)));
		}
	});

	it("rejects nonblank text appended directly to the native head", () => {
		const tree = fixture();
		expect(browserChallengeStructure(tree)).toBe(marker);
		const head = [...tree.walk()].find(({ node }) => node.tagName === "head");
		if (!head) throw new Error("Missing synthetic fixture head");
		tree.append(head.node.id, tree.createText("Unrelated synthetic head text"));
		const before = serializeHtml(tree);
		reject(tree);
		expect(serializeHtml(tree)).toBe(before);
	});

	it.each([svgNamespace, mathmlNamespace])(
		"rejects same-named foreign elements in %s",
		(namespaceURI) => {
			for (const tag of [
				"title",
				"h4",
				"form",
				"input",
				"button",
				"a",
				"span",
			]) {
				const tree = fixture();
				const read = tree.get.bind(tree);
				const mocked = vi.spyOn(tree, "get").mockImplementation((id) => {
					const node = read(id);
					return node.tagName === tag ? { ...node, namespaceURI } : node;
				});
				try {
					reject(tree);
				} finally {
					mocked.mockRestore();
				}
			}
		},
	);

	it("rejects an HTML shell beneath a foreign integration point", () => {
		reject(fixture(`<svg><foreignObject>${shell}</foreignObject></svg>`));
	});

	it.each([
		'<div title="',
		"<!--unfinished",
		"<!unfinished",
		"<style>unfinished",
		"<script>unfinished",
		"<template>",
	])("rejects malformed source after a complete shell %#", (tail) => {
		reject(
			parse(
				`<!doctype html><html><head><title>Amazon.com</title></head><body>${shell}${tail}`,
			),
		);
	});

	it("rejects duplicate source attributes rather than trusting parser recovery", () => {
		reject(
			fixture(shell.replace('method="get"', 'method="get" method="post"')),
		);
	});

	it.each([false, true])(
		"leaves the DOM and synthetic values unchanged (negative: %s)",
		(negative) => {
			const tree = fixture(negative ? `${shell}<p>Not a challenge</p>` : shell);
			const changed = vi.fn();
			const mutated = vi.fn();
			const unsubscribeChange = tree.onChange(changed);
			const unsubscribeMutation = tree.onMutation(mutated);
			const before = {
				markup: serializeHtml(tree),
				revision: tree.revision,
				usage: tree.resourceUsage(),
				metrics: tree.mutationMetrics(),
				info: htmlParseInfo(tree),
			};
			try {
				for (let repeat = 0; repeat < 3; repeat++) {
					const input = response(tree);
					expect(input.structure).toBe(negative ? undefined : marker);
					const diagnostic = classifyBrowserChallenge(input);
					expect(diagnostic).toEqual(negative ? null : expected);
					expect(JSON.stringify(diagnostic)).not.toContain("synthetic-");
				}
				expect(serializeHtml(tree)).toBe(before.markup);
				expect(tree.revision).toBe(before.revision);
				expect(tree.changesSince(before.revision).changes).toEqual([]);
				expect(tree.resourceUsage()).toEqual(before.usage);
				expect(tree.mutationMetrics()).toEqual(before.metrics);
				expect(htmlParseInfo(tree)).toBe(before.info);
				expect(changed).not.toHaveBeenCalled();
				expect(mutated).not.toHaveBeenCalled();
			} finally {
				unsubscribeChange();
				unsubscribeMutation();
			}
		},
	);
});

describe("continue-shopping resource bounds", () => {
	it.each([
		{ nodes: 513 },
		{ nodes: Number.NaN },
		{ nodes: -1 },
		{ textCodeUnits: 1_000_001 },
		{ textCodeUnits: Number.POSITIVE_INFINITY },
	])(
		"rejects over-budget or invalid accounting before reading nodes %#",
		(usage) => {
			const tree = fixture();
			vi.spyOn(tree, "resourceUsage").mockReturnValue({
				...tree.resourceUsage(),
				...usage,
			});
			const read = vi.spyOn(tree, "get");
			expect(browserChallengeStructure(tree)).toBeUndefined();
			expect(read).not.toHaveBeenCalled();
		},
	);

	it.each([
		`${shell}${"<span></span>".repeat(513)}`,
		`${"<div>".repeat(33)}${shell}${"</div>".repeat(33)}`,
		shell.replace(instruction, `${" ".repeat(32_769)}${instruction}`),
		shell.replace("synthetic-amzn-only", "x".repeat(1025)),
	])(
		"rejects bounded synthetic node, depth, text or attribute overflow %#",
		(body) => {
			reject(fixture(body));
		},
	);

	it.each(["resourceUsage", "get"] as const)(
		"fails closed on a %s resource exception",
		(method) => {
			const tree = fixture();
			vi.spyOn(tree, method).mockImplementation(() => {
				throw new AgentBrowserError(
					"resource-limit",
					"Synthetic inspection limit",
				);
			});
			reject(tree);
		},
	);
});

describe("continue-shopping diagnostic response gates", () => {
	it.each([200, 201, 202, 206, 400, 403, 429, 500, 503])(
		"classifies eligible HTML status %i without vendor attribution",
		(status) => {
			expect(
				classifyBrowserChallenge({ ...response(fixture()), status }),
			).toEqual(expected);
		},
	);

	it.each([
		0,
		99,
		100,
		199,
		204,
		205,
		300,
		302,
		307,
		399,
		600,
		200.5,
		Number.NaN,
	])("rejects ineligible status %s", (status) => {
		expect(
			classifyBrowserChallenge({ ...response(fixture()), status }),
		).toBeNull();
	});

	const invalidHeaders: BrowserChallengeResponse["headers"][] = [
		{},
		{ "content-type": "application/json" },
		{ "content-type": "text/plain" },
		{ "content-type": "application/xhtml+xml" },
		{ "content-type": ["text/html", "application/json"] },
		{ "content-type": [] },
		{ "content-type": "text/html\r\nX-Extra: true" },
		{ "content-type": "text/html", "bad header": "value" },
	];
	it.each(invalidHeaders)(
		"retains MIME and header validation %#",
		(headers) => {
			expect(
				classifyBrowserChallenge({ ...response(fixture()), headers }),
			).toBeNull();
		},
	);

	it("does not classify shopping wording without the structural conjunction", () => {
		expect(
			classifyBrowserChallenge({
				status: 200,
				headers: { "content-type": "text/html" },
				url,
				title: "Amazon.com",
				text: `${instruction} Continue shopping ${copyright}`,
			}),
		).toBeNull();
	});

	it("does not invoke a structure accessor", () => {
		const input = response(fixture());
		const getter = vi.fn(() => marker);
		Object.defineProperty(input, "structure", { get: getter });
		expect(classifyBrowserChallenge(input)).toBeNull();
		expect(getter).not.toHaveBeenCalled();
	});

	it.each([
		[200, "text/html"],
		[204, "application/json"],
	])(
		"retains cf-mitigated precedence for status %i and MIME %s",
		(status, mime) => {
			expect(
				classifyBrowserChallenge({
					...response(fixture()),
					status,
					headers: { "content-type": mime, "cf-mitigated": ["challenge"] },
				}),
			).toEqual({
				...expected,
				provider: "cloudflare",
				confidence: "confirmed",
				evidence: ["cf-mitigated-challenge"],
			});
		},
	);

	it("retains bounded retry advice without leaking synthetic inputs", () => {
		expect(
			classifyBrowserChallenge({
				...response(fixture()),
				headers: { "content-type": "text/html", "retry-after": ["120"] },
			}),
		).toEqual({ ...expected, retryAfterSeconds: 120 });
	});
});
