import { expect, it, vi } from "vitest";
import { ContentSecurityPolicy } from "./content-security-policy.js";
import { DocumentTree } from "./document.js";
import {
	type ScriptCspPolicyLimits,
	type ScriptCspRequest,
	createNativeDocumentScriptCspPolicy,
	createScriptCspPolicy,
	scriptCspPolicyLimits,
} from "./script-csp-policy.js";

const documentUrl = "https://example.com/document/index.html";
const nonce = "AbC09+/_-==";
const source = `'nonce-${nonce}'`;

function headers(...values: string[]) {
	return { "content-security-policy": values };
}

function request(changes: Partial<ScriptCspRequest> = {}): ScriptCspRequest {
	return {
		kind: "inline",
		nonce: "",
		parserInserted: true,
		nonceable: true,
		...changes,
	};
}

function policy(value: string, limits?: Partial<ScriptCspPolicyLimits>) {
	return createScriptCspPolicy(documentUrl, headers(value), limits);
}

function external(
	url: string,
	redirectCount = 0,
	changes: Partial<ScriptCspRequest> = {},
): ScriptCspRequest {
	return request({ kind: "external", url, redirectCount, ...changes });
}

it("ignores frame ancestors only for exact true native top-level compilation", () => {
	const tree = new DocumentTree(documentUrl);
	try {
		const input = headers(
			`script-src ${source} 'unsafe-eval'; frame-ancestors 'none'; base-uri 'none'; report-to fixture`,
			`FRAME-ANCESTORS 'self', script-src ${source}`,
		);
		for (const context of [true, false, undefined, null, "true", 1, {}, []]) {
			const result = createNativeDocumentScriptCspPolicy(
				tree,
				input,
				context as boolean,
			);
			expect(result.unsupported).toBe(context !== true);
			expect(result.allowsScript(request({ nonce }))).toBe(context === true);
			expect(result.allowsScript(request())).toBe(false);
			expect(result.allowsScript(external("https://example.com/app.js"))).toBe(
				false,
			);
			expect(result.allowsBase(documentUrl)).toBe(false);
			expect(result.stringCompilation).toBe("deny");
			expect(result.policyCount).toBe(3);
		}
		const generic = Reflect.apply(createScriptCspPolicy, undefined, [
			documentUrl,
			input,
			{},
			true,
		]);
		expect(generic.unsupported).toBe(true);
		expect(generic.allowsScript(request({ nonce }))).toBe(false);
	} finally {
		tree.close();
	}
});

it("does not derive native top-level privileges from getters or mutable objects", () => {
	const tree = new DocumentTree(documentUrl);
	const read = vi.fn(() => true);
	const mutable = { topLevelDocument: false };
	try {
		for (const context of [
			mutable,
			Object.defineProperty({}, "topLevelDocument", { get: read }),
			{ valueOf: read, [Symbol.toPrimitive]: read },
			new Boolean(true),
		]) {
			const result = createNativeDocumentScriptCspPolicy(
				tree,
				headers(`script-src ${source}; frame-ancestors 'none'`),
				context as unknown as boolean,
			);
			mutable.topLevelDocument = true;
			expect(result.unsupported).toBe(true);
			expect(result.allowsScript(request({ nonce }))).toBe(false);
		}
		expect(read).not.toHaveBeenCalled();
	} finally {
		tree.close();
	}
});

it.each(["worker-src", "form-action", "unknown-directive", "img-src"])(
	"does not grant unbacked %s enforcement through top-level compilation",
	(directive) => {
		const tree = new DocumentTree(documentUrl);
		try {
			const result = createNativeDocumentScriptCspPolicy(
				tree,
				headers(
					`script-src ${source}; frame-ancestors 'none'; ${directive} 'none'`,
				),
				true,
			);
			expect(result.issues).toContainEqual({
				code: "unsupported-directive",
				directive,
			});
			expect(result.allowsScript(request({ nonce }))).toBe(false);
		} finally {
			tree.close();
		}
	},
);

it("retains malformed input and hard limits when ignoring top-level frame ancestors", () => {
	const tree = new DocumentTree(documentUrl);
	const read = vi.fn(() => true);
	try {
		const inputs = [
			null,
			Object.defineProperty({}, "content-security-policy", { get: read }),
			{
				"content-security-policy": Object.defineProperty([""], "0", {
					get: read,
				}),
			},
			...["\0", "\n", "\r", "\x7f", "\u0100", "frame_ancestors 'none'"].map(
				(value) =>
					headers(`script-src ${source}; frame-ancestors 'none'; ${value}`),
			),
			headers(...Array(65).fill("frame-ancestors 'none'")),
			headers("frame-ancestors 'none',".repeat(64)),
			headers("frame-ancestors;".repeat(1024)),
			headers(`frame-ancestors ${"* ".repeat(4097)}`),
			headers(`frame-ancestors ${"*".repeat(32768)}`),
			headers(`frame-ancestors 'none'; script-src 'nonce-${"a".repeat(1025)}'`),
			Object.fromEntries([
				["content-security-policy", ["frame-ancestors 'none'"]],
				...Array.from({ length: 64 }, (_, index) => [`x-${index}`, []]),
			]),
		];
		for (const input of inputs) {
			const result = createNativeDocumentScriptCspPolicy(tree, input, true);
			expect(result.unsupported).toBe(true);
			expect(result.issues).toEqual(
				createScriptCspPolicy(documentUrl, input).issues.filter(
					(issue) => issue.directive !== "frame-ancestors",
				),
			);
			expect(result.allowsScript(request({ nonce }))).toBe(false);
		}
		expect(read).not.toHaveBeenCalled();
	} finally {
		tree.close();
	}
});

it("admits valid script metadata without enforced CSP and keeps report-only inert", () => {
	const read = vi.fn(() => {
		throw new Error("Do not read ignored fields");
	});
	for (const input of [
		{},
		Object.create(null),
		headers(""),
		headers(" ; , ;; "),
		{ "Content-Security-Policy-Report-Only": ["script-src 'none'"] },
		Object.defineProperties(
			{},
			{
				"content-security-policy-report-only": { get: read },
				"content-type": { get: read },
			},
		),
		headers("report-uri /report; report-to group"),
	]) {
		const result = createScriptCspPolicy(documentUrl, input);
		expect(result.unsupported).toBe(false);
		expect(result.allowsScript(request())).toBe(true);
		expect(result.allowsScript(request({ kind: "external" }))).toBe(true);
	}
	expect(read).not.toHaveBeenCalled();
});

it.each(["inline", "external"] as const)(
	"requires an exact nonce for parser-inserted %s scripts",
	(kind) => {
		const result = policy(`script-src ${source}`);
		expect(result.unsupported).toBe(false);
		expect(result.allowsScript(request({ kind, nonce }))).toBe(true);
		for (const supplied of [
			"",
			"abc09+/_-==",
			"AbC09+/_-",
			"AbC09+/_-===",
			` ${nonce}`,
			`${nonce} `,
			source,
		])
			expect(
				result.allowsScript(request({ kind, nonce: supplied })),
				supplied,
			).toBe(false);
		expect(
			result.allowsScript(request({ kind, nonce, nonceable: false })),
		).toBe(false);
	},
);

it("does not infer nonceability when trusted native metadata is missing", () => {
	const result = policy(`script-src ${source}`);
	const input = { kind: "inline", nonce, parserInserted: true };
	expect(result.allowsScript(input as ScriptCspRequest)).toBe(false);
});

it.each(["inline", "external"] as const)(
	"distinguishes parser-inserted and non-parser %s under strict-dynamic",
	(kind) => {
		const result = policy(
			`script-src 'strict-dynamic' ${source} 'unsafe-inline'`,
		);
		expect(result.unsupported).toBe(false);
		expect(result.allowsScript(request({ kind }))).toBe(false);
		expect(result.allowsScript(request({ kind, nonce }))).toBe(true);
		expect(
			result.allowsScript(
				request({
					kind,
					nonce: "wrong",
					parserInserted: false,
					nonceable: false,
				}),
			),
		).toBe(kind === "external");
		expect(
			policy(`script-src ${source}`).allowsScript(
				request({ kind, parserInserted: false }),
			),
		).toBe(false);
	},
);

it.each([
	{ label: "absent", suppliedNonce: "", nonceable: true },
	{ label: "wrong", suppliedNonce: "wrong", nonceable: true },
	{ label: "absent and non-nonceable", suppliedNonce: "", nonceable: false },
	{
		label: "wrong and non-nonceable",
		suppliedNonce: "wrong",
		nonceable: false,
	},
	{
		label: "matching but non-nonceable",
		suppliedNonce: nonce,
		nonceable: false,
	},
])(
	"blocks dynamic inline scripts with $label nonce under strict-dynamic",
	({ suppliedNonce, nonceable }) => {
		const result = policy(
			`script-src ${source} 'strict-dynamic' 'unsafe-inline'`,
		);
		expect(result.unsupported).toBe(false);
		expect(
			result.allowsScript(
				request({
					kind: "inline",
					nonce: suppliedNonce,
					parserInserted: false,
					nonceable,
				}),
			),
		).toBe(false);
	},
);

it.each(["'strict-dynamic'", "'strict-dynamic' 'unsafe-inline'"])(
	"does not authorize dynamic inline scripts from %s without a nonce source",
	(expressions) => {
		const result = policy(`script-src ${expressions}`);
		expect(result.unsupported).toBe(false);
		for (const suppliedNonce of ["", "wrong", nonce])
			for (const nonceable of [false, true])
				expect(
					result.allowsScript(
						request({
							kind: "inline",
							nonce: suppliedNonce,
							parserInserted: false,
							nonceable,
						}),
					),
				).toBe(false);
	},
);

it("retains valid dynamic inline nonce and independent unsafe-inline admission", () => {
	const dynamic = request({ kind: "inline", nonce, parserInserted: false });
	expect(
		policy(`script-src ${source} 'strict-dynamic'`).allowsScript(dynamic),
	).toBe(true);
	expect(policy(`script-src ${source}`).allowsScript(dynamic)).toBe(true);
	expect(
		policy("script-src 'unsafe-inline'").allowsScript(
			request({
				kind: "inline",
				parserInserted: false,
				nonceable: false,
			}),
		),
	).toBe(true);
});

it("requires every enforced policy to authorize a dynamic inline script independently", () => {
	const result = createScriptCspPolicy(
		documentUrl,
		headers(
			`script-src ${source} 'strict-dynamic'`,
			"script-src 'strict-dynamic'",
		),
	);
	expect(result.unsupported).toBe(false);
	expect(
		result.allowsScript(
			request({
				kind: "inline",
				nonce,
				parserInserted: false,
			}),
		),
	).toBe(false);
});

it("suppresses unsafe-inline for nonces, hashes and strict-dynamic without granting eval", () => {
	const inline = request();
	expect(policy("script-src 'unsafe-inline'").allowsScript(inline)).toBe(true);
	expect(policy("script-src 'unsafe-inline'").stringCompilation).toBe("deny");
	expect(
		policy("script-src 'unsafe-inline'").allowsScript(
			request({ kind: "external" }),
		),
	).toBe(false);
	for (const expression of [source, "'strict-dynamic'", "'sha256-YWJj'"])
		expect(
			policy(`script-src 'unsafe-inline' ${expression}`).allowsScript(inline),
		).toBe(false);
	for (const expression of ["'trusted-types-eval'"]) {
		const result = policy(
			`script-src ${source} 'strict-dynamic' ${expression}`,
		);
		expect(result.unsupported).toBe(true);
		expect(result.allowsScript(request({ nonce, parserInserted: false }))).toBe(
			false,
		);
	}
});

it("intersects every enforced policy including comma lists and case-insensitive header aliases", () => {
	for (const input of [
		headers(`script-src ${source}`, "script-src 'none'"),
		headers(`script-src ${source}, script-src 'none'`),
		{
			"Content-Security-Policy": [`script-src ${source}`],
			"CONTENT-SECURITY-POLICY": ["script-src 'none'"],
		},
		Object.defineProperty(
			headers(`script-src ${source}`),
			"Content-Security-Policy",
			{ value: ["script-src 'none'"] },
		),
	]) {
		const result = createScriptCspPolicy(documentUrl, input);
		expect(result.unsupported).toBe(false);
		expect(result.policyCount).toBe(2);
		expect(result.allowsScript(request({ nonce }))).toBe(false);
	}
	const disjoint = createScriptCspPolicy(
		documentUrl,
		headers("script-src 'nonce-first'", "script-src 'nonce-second'"),
	);
	for (const value of ["first", "second"])
		expect(disjoint.allowsScript(request({ nonce: value }))).toBe(false);
	const shared = createScriptCspPolicy(
		documentUrl,
		headers(`script-src ${source}`, `script-src 'strict-dynamic' ${source}`),
	);
	expect(shared.allowsScript(request({ nonce }))).toBe(true);
	expect(shared.allowsScript(request({ parserInserted: false }))).toBe(false);
});

it("selects script-src-elem then script-src then default-src without supplementing the selected list", () => {
	for (const directive of ["default-src", "script-src", "script-src-elem"])
		expect(
			policy(`${directive} ${source}`).allowsScript(request({ nonce })),
		).toBe(true);
	for (const value of [
		`default-src 'none'; script-src ${source}`,
		`script-src 'none'; script-src-elem ${source}`,
		`script-src-elem ${source}; script-src 'none'; default-src 'none'`,
	])
		expect(policy(value).allowsScript(request({ nonce }))).toBe(true);
	for (const value of [
		`default-src ${source}; script-src 'none'`,
		`script-src ${source}; script-src-elem 'none'`,
		`script-src ${source}; script-src-elem`,
	])
		expect(policy(value).allowsScript(request({ nonce }))).toBe(false);
});

it("uses the first case-insensitive duplicate directive even when a later value is unsupported", () => {
	const first = policy(
		` SCRIPT-SRC\t${source}; script-src 'sha256-YWJj'; BASE-URI 'self'; base-uri *`,
	);
	expect(first.unsupported).toBe(false);
	expect(first.allowsScript(request({ nonce }))).toBe(true);
	expect(first.allowsBase("https://example.com/base/")).toBe(true);
	expect(first.allowsBase("https://other.example/base/")).toBe(false);
	expect(
		policy(`script-src 'none'; SCRIPT-SRC ${source}`).allowsScript(
			request({ nonce }),
		),
	).toBe(false);
	expect(policy(`script-src https:; script-src ${source}`).unsupported).toBe(
		false,
	);
});

it("treats none and empty lists as denial, while none does not override other recognized expressions", () => {
	for (const value of ["script-src", "script-src 'none'", "ScRiPt-SrC 'NoNe'"])
		expect(policy(value).allowsScript(request())).toBe(false);
	expect(
		policy(`script-src 'none' ${source}`).allowsScript(request({ nonce })),
	).toBe(true);
	expect(
		policy("script-src 'none' 'UNSAFE-INLINE'").allowsScript(request()),
	).toBe(true);
});

it("enforces base-uri independently, intersects base policies and never falls back to default-src", () => {
	const unrestrictedBase = policy("default-src 'none'");
	expect(unrestrictedBase.allowsScript(request())).toBe(false);
	expect(unrestrictedBase.allowsBase("https://other.example/base/")).toBe(true);
	const restrictedBase = policy("base-uri 'none'");
	expect(restrictedBase.allowsScript(request())).toBe(true);
	expect(restrictedBase.allowsBase("https://example.com/base/")).toBe(false);
	const self = policy("base-uri 'self'");
	expect(self.allowsBase("https://EXAMPLE.com:443/base/")).toBe(true);
	for (const candidate of [
		"https://example.com:444/",
		"http://example.com/",
		"https://example.com.evil/",
		"https://other.example/",
	])
		expect(self.allowsBase(candidate)).toBe(false);
	const intersection = createScriptCspPolicy(
		documentUrl,
		headers("base-uri 'self'", "base-uri 'none'"),
	);
	expect(intersection.allowsBase("https://example.com/base/")).toBe(false);
	expect(policy("base-uri").allowsBase("https://example.com/base/")).toBe(
		false,
	);
});

it.each([
	"connect-src",
	"img-src",
	"style-src",
	"style-src-elem",
	"font-src",
	"media-src",
	"object-src",
	"child-src",
	"frame-src",
	"worker-src",
	"manifest-src",
	"script-src-attr",
	"frame-ancestors",
	"sandbox",
	"form-action",
	"trusted-types",
	"require-trusted-types-for",
	"upgrade-insecure-requests",
	"block-all-mixed-content",
	"unknown-directive",
	"__proto__",
	"constructor",
])(
	"fails closed on unimplemented directive %s instead of treating a script match as whole-policy support",
	(directive) => {
		const result = policy(`script-src ${source}; ${directive} 'none'`);
		expect(result.unsupported).toBe(true);
		expect(
			result.issues.some(
				({ code }) =>
					code === "unsupported-directive" || code === "invalid-policy",
			),
		).toBe(true);
		expect(result.allowsScript(request({ nonce, parserInserted: false }))).toBe(
			false,
		);
		expect(result.allowsBase("https://example.com/")).toBe(false);
	},
);

it.each([
	"'sha256-YWJj'",
	"'sha384-YWJj'",
	"'sha512-YWJj'",
	"'unsafe-hashes'",
	"'report-sample'",
	"'nonce-'",
	"'nonce-bad!'",
])(
	"flags unsupported script expression %s even alongside a correct nonce and strict-dynamic",
	(expression) => {
		const result = policy(
			`script-src ${source} 'strict-dynamic' ${expression}`,
		);
		expect(result.unsupported).toBe(true);
		expect(result.issues).toContainEqual({
			code: "unsupported-script-source",
			directive: "script-src",
		});
		expect(result.allowsScript(request({ nonce, parserInserted: false }))).toBe(
			false,
		);
	},
);

it.each(["*", "https:", "https://example.com", source, "'unsafe-inline'"])(
	"flags unsupported base expression %s separately",
	(expression) => {
		const result = policy(`base-uri ${expression}`);
		expect(result.issues).toContainEqual({
			code: "unsupported-base-source",
			directive: "base-uri",
		});
		expect(result.allowsBase("https://example.com/")).toBe(false);
	},
);

it("rejects malformed header containers and values without conversion", () => {
	const coerce = vi.fn(() => "script-src 'unsafe-inline'");
	const object = { toString: coerce, [Symbol.toPrimitive]: coerce };
	for (const input of [
		null,
		undefined,
		false,
		1,
		"",
		[],
		() => ({}),
		Object.create(headers("script-src 'none'")),
	])
		expect(createScriptCspPolicy(documentUrl, input).unsupported).toBe(true);
	for (const value of [
		undefined,
		null,
		false,
		1,
		"script-src 'none'",
		{},
		[],
		[undefined],
		[null],
		[false],
		[1],
		[object],
		[Object("script-src 'none'")],
	]) {
		const result = createScriptCspPolicy(documentUrl, {
			"content-security-policy": value,
		});
		expect(result.unsupported).toBe(true);
		expect(result.allowsScript(request())).toBe(false);
	}
	expect(coerce).not.toHaveBeenCalled();
});

it("does not invoke header/entry accessors or consume inherited array slots", () => {
	const read = vi.fn(() => `script-src ${source}`);
	const inherited = new Array(1);
	Object.setPrototypeOf(inherited, ["script-src 'unsafe-inline'"]);
	for (const input of [
		Object.defineProperty({}, "Content-Security-Policy", { get: read }),
		Object.defineProperty({}, "content-security-policy", { set: read }),
		{
			"content-security-policy": Object.defineProperty([""], "0", {
				get: read,
			}),
		},
		{ "content-security-policy": new Array(1) },
		{ "content-security-policy": inherited },
	])
		expect(createScriptCspPolicy(documentUrl, input).unsupported).toBe(true);
	expect(read).not.toHaveBeenCalled();
});

it("reads frozen header arrays through descriptors, not iteration hooks", () => {
	const read = vi.fn(() => {
		throw new Error("Unexpected hook");
	});
	const values = Object.freeze(
		Object.defineProperties([`script-src ${source}`], {
			[Symbol.iterator]: { get: read },
			toString: { get: read },
		}),
	);
	const result = createScriptCspPolicy(
		documentUrl,
		Object.freeze({ "CONTENT-SECURITY-POLICY": values }),
	);
	expect(result.unsupported).toBe(false);
	expect(result.allowsScript(request({ nonce }))).toBe(true);
	expect(read).not.toHaveBeenCalled();
});

it("fails closed on throwing or revoked inspection proxies", () => {
	const fail = () => {
		throw new Error("Cannot inspect");
	};
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	for (const input of [
		revoked.proxy,
		new Proxy({}, { ownKeys: fail }),
		new Proxy({}, { getPrototypeOf: fail }),
		new Proxy(headers(""), { getOwnPropertyDescriptor: fail }),
		{
			"content-security-policy": new Proxy([""], {
				getOwnPropertyDescriptor: fail,
			}),
		},
	]) {
		const result = createScriptCspPolicy(documentUrl, input);
		expect(result.unsupported).toBe(true);
		expect(result.allowsScript(request())).toBe(false);
	}
});

it("rejects control characters, non-byte headers and malformed directive names", () => {
	for (const value of [
		"\0",
		"\n",
		"\r",
		"\f",
		"\x7f",
		"\u0100",
		"\ud800",
		"script_src 'none'",
	])
		expect(policy(`script-src ${source}; ${value}`).unsupported).toBe(true);
	expect(policy("report-uri /opaque-\x80\xff").unsupported).toBe(false);
});

it("rejects spoofed script metadata without invoking getters or coercion", () => {
	const result = policy(`script-src ${source} 'strict-dynamic'`);
	const read = vi.fn(() => nonce);
	const coerce = vi.fn(() => nonce);
	const spoof = { toString: coerce, [Symbol.toPrimitive]: coerce };
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	const inputs: unknown[] = [
		null,
		undefined,
		[],
		{},
		Object.create(request({ nonce })),
		revoked.proxy,
		{ ...request({ nonce }), extra: true },
		{ ...request({ nonce }), [Symbol("nonce")]: nonce },
	];
	for (const name of ["kind", "nonce", "parserInserted", "nonceable"])
		inputs.push(Object.defineProperty(request({ nonce }), name, { get: read }));
	for (const changes of [
		{ nonce: spoof },
		{ nonce: Object(nonce) },
		{ parserInserted: "false" },
		{ parserInserted: 0 },
		{ nonceable: "true" },
		{ kind: "module" },
		{ kind: "event-handler" },
	])
		inputs.push({ ...request({ nonce }), ...changes });
	for (const input of inputs)
		expect(result.allowsScript(input as ScriptCspRequest)).toBe(false);
	expect(read).not.toHaveBeenCalled();
	expect(coerce).not.toHaveBeenCalled();
});

it("rejects malformed or non-network document/base URLs without coercion", () => {
	const coerce = vi.fn(() => documentUrl);
	const object = { toString: coerce };
	const result = createScriptCspPolicy(documentUrl, {});
	for (const value of [
		null,
		undefined,
		false,
		object,
		"relative",
		"data:text/html,",
		"file:///tmp/base",
		"javascript:void(0)",
		"https://user:secret@example.com/",
		" https://example.com/",
		"https://example.com/\n",
		"http://[bad",
	]) {
		expect(createScriptCspPolicy(value as string, {}).unsupported).toBe(true);
		expect(result.allowsBase(value as string)).toBe(false);
	}
	expect(coerce).not.toHaveBeenCalled();
});

it("validates limits as finite positive own data values within hard ceilings", () => {
	const read = vi.fn(() => 1);
	for (const overrides of [
		null,
		[],
		{ unknown: 1 },
		{ maxPolicies: 0 },
		{ maxPolicies: -1 },
		{ maxPolicies: 1.5 },
		{ maxPolicies: Number.POSITIVE_INFINITY },
		{ maxPolicies: Number.NaN },
		{ maxPolicies: "1" },
		{ maxPolicies: Number.MAX_SAFE_INTEGER },
		{ maxPolicies: 65 },
		Object.create({ maxPolicies: 1 }),
		Object.defineProperty({}, "maxPolicies", { get: read }),
		{ [Symbol("limit")]: 1 },
	]) {
		const result = createScriptCspPolicy(
			documentUrl,
			{},
			overrides as Partial<ScriptCspPolicyLimits>,
		);
		expect(result.issues).toContainEqual({ code: "invalid-limits" });
		expect(result.allowsScript(request())).toBe(false);
	}
	expect(read).not.toHaveBeenCalled();
	for (const limit of Object.values(scriptCspPolicyLimits)) {
		expect(Number.isSafeInteger(limit)).toBe(true);
		expect(limit).toBeGreaterThan(0);
	}
});

it("enforces cumulative field, value, policy, directive, source and code-unit limits", () => {
	const fixtures: [unknown, Partial<ScriptCspPolicyLimits>][] = [
		[{ "content-type": ["text/html"], ...headers("") }, { maxHeaderFields: 1 }],
		[headers("", ""), { maxHeaderValues: 1 }],
		[headers(","), { maxPolicies: 1 }],
		[headers(";"), { maxDirectives: 1 }],
		[headers("script-src 'none' 'none'"), { maxSources: 1 }],
		[headers("script-src 'none'"), { maxPolicyCodeUnits: 1 }],
		[headers(`script-src ${source}`), { maxNonceCodeUnits: 1 }],
	];
	for (const [input, limits] of fixtures) {
		const result = createScriptCspPolicy(documentUrl, input, limits);
		expect(result.issues).toContainEqual({ code: "resource-limit" });
		expect(result.allowsScript(request({ nonce }))).toBe(false);
	}
	expect(
		policy("script-src 'none'", {
			maxDirectives: 1,
			maxSources: 1,
			maxPolicies: 1,
		}).unsupported,
	).toBe(false);
	expect(
		policy("script-src 'none'; SCRIPT-SRC 'none'", { maxSources: 1 })
			.unsupported,
	).toBe(true);
	expect(
		createScriptCspPolicy(documentUrl, headers("", ""), { maxPolicies: 1 })
			.unsupported,
	).toBe(true);
});

it("bounds per-admission matching and rejects oversized nonce/URL input", () => {
	const bounded = policy(`script-src ${source}`, { maxMatchWork: 1 });
	expect(bounded.unsupported).toBe(false);
	expect(bounded.allowsScript(request({ nonce }))).toBe(false);
	expect(
		policy("base-uri 'self'", { maxMatchWork: 1 }).allowsBase(documentUrl),
	).toBe(false);
	expect(
		policy("script-src 'unsafe-inline'").allowsScript(
			request({
				nonce: "a".repeat(scriptCspPolicyLimits.maxNonceCodeUnits + 1),
			}),
		),
	).toBe(false);
	expect(
		policy("base-uri 'self'").allowsBase(
			`${documentUrl}${"a".repeat(scriptCspPolicyLimits.maxUrlCodeUnits)}`,
		),
	).toBe(false);
	expect(
		createScriptCspPolicy(documentUrl, {}, { maxUrlCodeUnits: 1 }).unsupported,
	).toBe(true);
});

it("snapshots headers/limits and exposes a frozen capability with detached methods", () => {
	const input = headers(`script-src ${source}; base-uri 'self'`);
	const limits = { maxPolicies: 1 };
	const result = createScriptCspPolicy(documentUrl, input, limits);
	input["content-security-policy"][0] = "script-src 'none'";
	limits.maxPolicies = 0;
	const { allowsScript, allowsBase } = result;
	expect(allowsScript(request({ nonce }))).toBe(true);
	expect(allowsBase(documentUrl)).toBe(true);
	expect(result.scope).toBe("script-elements-and-base");
	for (const object of [
		result,
		result.issues,
		result.allowsScript,
		result.allowsBase,
		scriptCspPolicyLimits,
	])
		expect(Object.isFrozen(object)).toBe(true);
	const unsupported = policy("img-src *");
	expect(Object.isFrozen(unsupported.issues[0])).toBe(true);
	expect(Reflect.set(unsupported, "unsupported", false)).toBe(false);
	expect(Reflect.set(unsupported.issues[0], "code", "allowed")).toBe(false);
});

it.each([
	["'self'", "https://example.com/app.js", true],
	["'self'", "https://example.com:443/app.js", true],
	["'self'", "https://sub.example.com/app.js", false],
	["'self'", "https://example.com:444/app.js", false],
	["'self'", "http://example.com/app.js", false],
	["https:", "https://other.example/app.js", true],
	["https:", "http://other.example/app.js", false],
	["http:", "https://other.example/app.js", true],
	["*", "https://other.example:8443/app.js", true],
	["https://*.cdn.example", "https://a.cdn.example/app.js", true],
	["https://*.cdn.example", "https://cdn.example/app.js", false],
	["https://*.cdn.example", "https://notcdn.example/app.js", false],
	["https://cdn.example:443", "https://cdn.example/app.js", true],
	["http://cdn.example:80", "http://cdn.example/app.js", true],
	["https://cdn.example:8443", "https://cdn.example/app.js", false],
	["https://cdn.example:8443", "https://cdn.example:8443/app.js", true],
	["https://cdn.example:*", "https://cdn.example:8443/app.js", true],
	["cdn.example", "https://cdn.example/app.js", true],
	["HTTP://CDN.EXAMPLE", "https://cdn.example/app.js", true],
	["https://cdn.example/scripts/", "https://cdn.example/scripts/app.js", true],
	[
		"https://cdn.example/scripts/",
		"https://cdn.example/scripts-other/app.js",
		false,
	],
	[
		"https://cdn.example/app.js",
		"https://cdn.example/app.js?v=1#fragment",
		true,
	],
	["https://cdn.example/app.js", "https://cdn.example/app.js/extra", false],
	["https://cdn.example/app.js", "https://cdn.example/APP.js", false],
	["https://cdn.example/%61pp.js", "https://cdn.example/app.js", true],
	["https://cdn.example/a%2fb", "https://cdn.example/a/b", false],
] as const)(
	"matches bounded external source %s against %s",
	(expression, url, allowed) => {
		const result = policy(`script-src ${expression}`);
		expect(result.unsupported).toBe(false);
		expect(result.allowsScript(external(url))).toBe(allowed);
		expect(result.allowsScript(request())).toBe(false);
	},
);

it("reuses normalized self origins and scheme upgrades without dropping nondefault ports", () => {
	for (const [document, url, allowed] of [
		["http://example.com:80/doc", "https://example.com:443/app.js", true],
		["http://example.com:8080/doc", "https://example.com:8080/app.js", true],
		["http://example.com:8080/doc", "https://example.com:8081/app.js", false],
		["https://example.com:443/doc", "http://example.com:80/app.js", false],
	] as const) {
		const result = createScriptCspPolicy(
			document,
			headers("script-src 'self'"),
		);
		expect(result.allowsScript(external(url))).toBe(allowed);
	}
});

it("discards only path restrictions after redirects, retaining host, scheme and port checks", () => {
	const result = policy("script-src https://cdn.example/scripts/");
	const redirected = "https://cdn.example/elsewhere/app.js";
	expect(result.allowsScript(external(redirected))).toBe(false);
	for (const redirects of [1, 2, Number.MAX_SAFE_INTEGER]) {
		expect(result.allowsScript(external(redirected, redirects))).toBe(true);
		for (const url of [
			"https://other.example/scripts/app.js",
			"http://cdn.example/scripts/app.js",
			"https://cdn.example:8443/scripts/app.js",
		])
			expect(result.allowsScript(external(url, redirects))).toBe(false);
	}
	expect(result.allowsScript(external(redirected))).toBe(false);
});

it("keeps nonce, unsafe-inline and external URL alternatives distinct", () => {
	const url = "https://cdn.example/app.js";
	const result = policy(
		`script-src ${source} 'unsafe-inline' https://cdn.example`,
	);
	expect(result.allowsScript(request())).toBe(false);
	expect(result.allowsScript(request({ nonce }))).toBe(true);
	expect(result.allowsScript(external(url, 0, { nonce: "wrong" }))).toBe(true);
	expect(
		result.allowsScript(
			external("https://other.example/app.js", 0, { nonce: "wrong" }),
		),
	).toBe(false);
	expect(
		result.allowsScript(external("https://other.example/app.js", 0, { nonce })),
	).toBe(true);
	expect(
		result.allowsScript(
			external("https://other.example/app.js", 0, { nonce, nonceable: false }),
		),
	).toBe(false);
	const inline = policy("script-src 'unsafe-inline' https://cdn.example");
	expect(inline.allowsScript(request())).toBe(true);
	expect(inline.allowsScript(external("https://other.example/app.js"))).toBe(
		false,
	);
});

it("makes strict-dynamic external-only and discards URL and unsafe-inline allowances", () => {
	const result = policy(
		`script-src ${source} 'strict-dynamic' 'unsafe-inline' https: * 'self'`,
	);
	expect(result.unsupported).toBe(false);
	expect(result.allowsScript(external(documentUrl))).toBe(false);
	expect(
		result.allowsScript(external(documentUrl, 0, { nonce: "wrong" })),
	).toBe(false);
	expect(result.allowsScript(external(documentUrl, 0, { nonce }))).toBe(true);
	expect(
		result.allowsScript(
			external("https://other.example/app.js", 0, {
				parserInserted: false,
				nonceable: false,
			}),
		),
	).toBe(true);
	expect(result.allowsScript(request({ parserInserted: false }))).toBe(false);
	expect(result.allowsScript(request({ nonce, parserInserted: false }))).toBe(
		true,
	);
});

it("uses element fallback without unioning lists and intersects independent nonce/URL policies", () => {
	for (const directive of ["script-src-elem", "script-src", "default-src"])
		expect(
			policy(`${directive} 'self'`).allowsScript(external(documentUrl)),
		).toBe(true);
	for (const serialized of [
		"default-src *; script-src 'none'",
		"script-src *; script-src-elem 'none'",
		"default-src *; script-src-elem",
	])
		expect(policy(serialized).allowsScript(external(documentUrl))).toBe(false);
	const result = createScriptCspPolicy(
		documentUrl,
		headers(`script-src ${source}`, "script-src https://cdn.example"),
	);
	expect(
		result.allowsScript(external("https://cdn.example/app.js", 0, { nonce })),
	).toBe(true);
	expect(result.allowsScript(external(documentUrl, 0, { nonce }))).toBe(false);
	expect(
		result.allowsScript(
			external("https://cdn.example/app.js", 0, { nonce: "wrong" }),
		),
	).toBe(false);
	expect(
		policy("script-src https:, script-src 'none'").allowsScript(
			external(documentUrl),
		),
	).toBe(false);
});

it("retains legacy metadata only when a decision does not require an external URL", () => {
	const legacy = request({ kind: "external" });
	expect(createScriptCspPolicy(documentUrl, {}).allowsScript(legacy)).toBe(
		true,
	);
	expect(policy("script-src *").allowsScript(legacy)).toBe(false);
	expect(
		policy(`script-src ${source} *`).allowsScript({ ...legacy, nonce }),
	).toBe(true);
	expect(
		policy("script-src 'strict-dynamic'").allowsScript({
			...legacy,
			parserInserted: false,
		}),
	).toBe(true);
	expect(policy("script-src 'none'").allowsScript(legacy)).toBe(false);
});

it.each([
	["", "allow"],
	["base-uri 'none'", "allow"],
	["script-src", "deny"],
	["script-src 'none'", "deny"],
	["script-src 'unsafe-inline'", "deny"],
	[`script-src ${source}`, "deny"],
	["script-src https:", "deny"],
	["script-src 'unsafe-eval'", "allow"],
	["script-src 'UNSAFE-EVAL' 'strict-dynamic'", "allow"],
	["default-src 'unsafe-eval'", "allow"],
	["default-src 'unsafe-eval'; script-src 'none'", "deny"],
	["default-src 'none'; script-src 'unsafe-eval'", "allow"],
	["script-src-elem 'none'", "allow"],
	["script-src-elem 'unsafe-eval'; script-src 'none'", "deny"],
	["script-src 'unsafe-eval'; script-src-elem 'none'", "allow"],
	["default-src 'none'; script-src-elem 'unsafe-eval'", "deny"],
	["default-src 'unsafe-eval'; script-src-elem 'none'", "allow"],
	["script-src 'unsafe-eval'; SCRIPT-SRC 'none'", "allow"],
] as const)(
	"computes separate immutable string compilation for %s",
	(serialized, expected) => {
		const result = policy(serialized);
		expect(result.unsupported).toBe(false);
		expect(result.stringCompilation).toBe(expected);
		expect(Reflect.set(result, "stringCompilation", "other")).toBe(false);
	},
);

it("intersects eval independently without letting a valid nonce or elem list grant it", () => {
	const result = createScriptCspPolicy(
		documentUrl,
		headers(`script-src 'unsafe-eval' ${source}`, `script-src ${source}`),
	);
	expect(result.allowsScript(request({ nonce }))).toBe(true);
	expect(result.stringCompilation).toBe("deny");
	expect(
		policy("script-src 'unsafe-eval', default-src 'unsafe-eval'")
			.stringCompilation,
	).toBe("allow");
	expect(policy("script-src 'unsafe-eval'").allowsScript(request())).toBe(
		false,
	);
	const input = headers("default-src 'unsafe-eval'; script-src-elem 'none'");
	const snapshot = createScriptCspPolicy(documentUrl, input);
	input["content-security-policy"][0] = "script-src 'none'";
	expect(snapshot.stringCompilation).toBe("allow");
	expect(snapshot.allowsScript(request())).toBe(false);
});

it.each([
	"https://cdn.example/é",
	"https://cdn.example/\u00a0",
	"https://cdn.example/%xx",
	"https://cdn.example/app.js?query",
	"https://cdn.example/app.js#fragment",
	"https://user@cdn.example",
	"https://cdn.example:65536",
	"https://cdn.example:-1",
	"https://127.0.0.1/app.js",
	"https://[::1]/app.js",
	"'sha256-YWJj'",
	"'unknown'",
	"'nonce-'",
	"ftp:",
	"data:",
])(
	"rejects unsupported or unsafe source tokens %s before synthesizing a matcher",
	(expression) => {
		const result = policy(
			`script-src ${source} 'strict-dynamic' 'unsafe-eval' ${expression}`,
		);
		expect(result.unsupported).toBe(true);
		expect(result.stringCompilation).toBe("deny");
		expect(result.allowsScript(external(documentUrl, 0, { nonce }))).toBe(
			false,
		);
		expect(result.allowsBase(documentUrl)).toBe(false);
	},
);

it("does not ignore unknown resource directives or malformed policy boundaries", () => {
	for (const serialized of [
		"script-src 'unsafe-eval'; img-src *",
		"script-src 'unsafe-eval'; connect-src *",
		"script-src https:\n'unsafe-eval'",
		"script-src https:\f'unsafe-eval'",
		"script-src 'unsafe-eval'; bad/name *",
	])
		expect(policy(serialized).stringCompilation).toBe("deny");
	expect(
		createScriptCspPolicy(documentUrl, {
			"content-security-policy": "script-src 'unsafe-eval'",
		}).stringCompilation,
	).toBe("deny");
	expect(
		createScriptCspPolicy(documentUrl, {
			"content-security-policy-report-only": ["script-src 'none'"],
		}).stringCompilation,
	).toBe("allow");
});

it("rejects malformed extended metadata without reading getters or coercing inputs", () => {
	const result = policy(`script-src ${source} * 'strict-dynamic'`);
	const read = vi.fn(() => documentUrl);
	const inputs: unknown[] = [
		{ ...request({ kind: "external" }), url: documentUrl },
		{ ...request({ kind: "external" }), redirectCount: 0 },
		{ ...external(documentUrl), kind: "inline" },
		{ ...external(documentUrl), extra: true },
		{ ...external(documentUrl), [Symbol("url")]: documentUrl },
		Object.create(external(documentUrl)),
	];
	for (const url of [
		undefined,
		null,
		1,
		{ toString: read },
		"/app.js",
		"data:text/javascript,1",
		"file:///app.js",
		"https://user:password@example.com/app.js",
		"https://example.com/\napp.js",
		"x".repeat(4097),
	])
		inputs.push({ ...external(documentUrl), url });
	for (const redirectCount of [
		undefined,
		null,
		-1,
		0.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.MAX_SAFE_INTEGER + 1,
		"0",
		{ valueOf: read },
	])
		inputs.push({ ...external(documentUrl), redirectCount });
	for (const name of ["url", "redirectCount"])
		inputs.push(
			Object.defineProperty(external(documentUrl), name, { get: read }),
		);
	for (const input of inputs)
		expect(result.allowsScript(input as ScriptCspRequest)).toBe(false);
	expect(read).not.toHaveBeenCalled();
});

it("bounds total URL matching work across policies and resets it between admissions", () => {
	const url = new URL(documentUrl);
	const bound =
		1 +
		url.href.length +
		"'self'".length +
		url.hostname.length +
		url.pathname.length +
		1;
	const one = policy("script-src 'self'", { maxMatchWork: bound });
	const two = createScriptCspPolicy(
		documentUrl,
		headers("script-src 'self'", "script-src 'self'"),
		{ maxMatchWork: bound * 2 - 1 },
	);
	for (let iteration = 0; iteration < 3; iteration++) {
		expect(one.allowsScript(external(documentUrl))).toBe(true);
		expect(two.allowsScript(external(documentUrl))).toBe(false);
	}
	const matcher = vi.spyOn(ContentSecurityPolicy.prototype, "allows");
	try {
		expect(
			policy("script-src *", { maxMatchWork: 1 }).allowsScript(
				external(documentUrl),
			),
		).toBe(false);
		expect(matcher).not.toHaveBeenCalled();
		matcher.mockImplementation(() => {
			throw new Error("Matcher refused");
		});
		expect(one.allowsScript(external(documentUrl))).toBe(false);
	} finally {
		matcher.mockRestore();
	}
});

it.each([
	["script-src 'wasm-unsafe-eval'", "deny"],
	["default-src 'wasm-unsafe-eval'", "deny"],
	["script-src 'WASM-UNSAFE-EVAL' 'unsafe-eval'", "allow"],
	["script-src 'wasm-unsafe-eval'; script-src-elem 'unsafe-eval'", "deny"],
	["script-src 'unsafe-eval'; script-src-elem 'wasm-unsafe-eval'", "allow"],
] as const)(
	"recognizes the element-inert WASM keyword without granting JS eval in %s",
	(serialized, expected) => {
		const result = policy(serialized);
		expect(result.unsupported).toBe(false);
		expect(result.stringCompilation).toBe(expected);
		expect(result.allowsScript(request())).toBe(false);
		expect(result.allowsScript(external(documentUrl))).toBe(false);
	},
);

it("does not turn the WASM keyword into an inline or external authorization", () => {
	const result = policy("script-src 'unsafe-inline' 'wasm-unsafe-eval'");
	expect(result.unsupported).toBe(false);
	expect(result.allowsScript(request())).toBe(true);
	expect(result.allowsScript(external(documentUrl))).toBe(false);
	expect(result.stringCompilation).toBe("deny");
	const intersected = createScriptCspPolicy(
		documentUrl,
		headers("script-src 'unsafe-eval'", "script-src 'wasm-unsafe-eval'"),
	);
	expect(intersected.stringCompilation).toBe("deny");
});

it("recognizes blob sources without admitting blob requests or HTTP URLs from them", () => {
	const result = policy("script-src blob: 'unsafe-eval'");
	expect(result.unsupported).toBe(false);
	expect(result.stringCompilation).toBe("allow");
	expect(result.allowsScript(request())).toBe(false);
	expect(result.allowsScript(external(documentUrl))).toBe(false);
	expect(
		result.allowsScript(external("blob:https://example.com/native-test")),
	).toBe(false);
	expect(
		policy("script-src blob: 'self'").allowsScript(external(documentUrl)),
	).toBe(true);
});

it("recognizes the supplied script-policy shape while keeping eval, elements, base and resource directives separate", () => {
	const serialized = `script-src 'self' 'wasm-unsafe-eval' 'strict-dynamic' ${source} blob: https: 'unsafe-eval'; base-uri 'none'`;
	const result = policy(serialized);
	expect(result.unsupported).toBe(false);
	expect(result.stringCompilation).toBe("allow");
	expect(result.allowsBase(documentUrl)).toBe(false);
	expect(result.allowsScript(request({ nonce }))).toBe(true);
	expect(
		result.allowsScript(request({ nonce: "wrong", parserInserted: false })),
	).toBe(false);
	expect(result.allowsScript(external(documentUrl))).toBe(false);
	expect(result.allowsScript(external(documentUrl, 0, { nonce }))).toBe(true);
	expect(
		result.allowsScript(external(documentUrl, 0, { parserInserted: false })),
	).toBe(true);
	expect(
		result.allowsScript(
			external("blob:https://example.com/native-test", 0, {
				nonce,
				parserInserted: false,
			}),
		),
	).toBe(false);
	expect(
		policy(serialized.replace("'unsafe-eval'", "")).stringCompilation,
	).toBe("deny");
	for (const directive of [
		"img-src *",
		"connect-src *",
		"style-src *",
		"worker-src blob:",
	]) {
		const unsupported = policy(`${serialized}; ${directive}`);
		expect(unsupported.unsupported).toBe(true);
		expect(unsupported.stringCompilation).toBe("deny");
		expect(unsupported.allowsScript(request({ nonce }))).toBe(false);
	}
});
