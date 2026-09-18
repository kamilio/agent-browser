import { expect, it, vi } from "vitest";
import {
	type ScriptCspPolicyLimits,
	type ScriptCspRequest,
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
	expect(
		policy("script-src 'unsafe-inline'").allowsScript(
			request({ kind: "external" }),
		),
	).toBe(false);
	for (const expression of [source, "'strict-dynamic'", "'sha256-YWJj'"])
		expect(
			policy(`script-src 'unsafe-inline' ${expression}`).allowsScript(inline),
		).toBe(false);
	for (const expression of [
		"'unsafe-eval'",
		"'wasm-unsafe-eval'",
		"'trusted-types-eval'",
	]) {
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
		true,
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
	"'self'",
	"*",
	"https:",
	"https://example.com/",
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
