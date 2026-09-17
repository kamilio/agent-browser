import { expect, it, vi } from "vitest";
import { hasUnsupportedExecutionCsp } from "./execution-content-security-policy.js";
import type { NetworkResponse } from "./network.js";

const capturedTargetPolicy = "frame-ancestors 'self' https://*.target.com;";

function enforced(values: unknown): NetworkResponse["headers"] {
	return { "content-security-policy": values } as NetworkResponse["headers"];
}

function headerAlias(variant: number): string {
	return `${Array.from("content", (character, position) =>
		variant & (2 ** position) ? character.toUpperCase() : character,
	).join("")}-security-policy`;
}

it("admits the captured September 17 Target policy only for a top-level document", () => {
	const headers = enforced([capturedTargetPolicy]);
	expect(hasUnsupportedExecutionCsp(headers, true)).toBe(false);
	expect(hasUnsupportedExecutionCsp(headers)).toBe(true);
	expect(hasUnsupportedExecutionCsp(headers, false)).toBe(true);
});

it("does not refuse responses without an own enforced header", () => {
	for (const headers of [
		{},
		Object.create(null),
		{ "content-type": ["text/html"] },
		{ "content-security-policy-report-only": ["script-src 'none'"] },
	]) {
		expect(hasUnsupportedExecutionCsp(headers)).toBe(false);
		expect(hasUnsupportedExecutionCsp(headers, false)).toBe(false);
		expect(hasUnsupportedExecutionCsp(headers, true)).toBe(false);
	}
});

it("does not turn inherited policies into an absent-policy exception", () => {
	for (const name of ["content-security-policy", "Content-Security-Policy"])
		for (const topLevel of [false, true])
			expect(
				hasUnsupportedExecutionCsp(
					Object.create({ [name]: ["script-src 'none'"] }),
					topLevel,
				),
			).toBe(true);
});

it("handles long interior and edge whitespace without changing directive names", () => {
	const space = " \t".repeat(8000);
	for (const policy of [
		`${space}frame-ancestors${space}'self'`,
		`frame-ancestors${space}'self'${space}`,
	])
		expect(hasUnsupportedExecutionCsp(enforced([policy]), true)).toBe(false);
	expect(
		hasUnsupportedExecutionCsp(
			enforced([`frame-ancestors${space}'self';script-src 'none'`]),
			true,
		),
	).toBe(true);
});

it.each([
	"",
	" \t ",
	";",
	",",
	" ; , ;; , \t",
	"frame-ancestors",
	"frame-ancestors 'none'",
	"FRAME-ANCESTORS *",
	"\t FrAmE-AnCeStOrS\t'self' \t; ",
	"report-uri /csp-report",
	"REPORT-TO csp-endpoint",
	"frame-ancestors 'none'; report-uri https://reports.example/csp; report-to csp",
	"frame-ancestors 'self'; FRAME-ANCESTORS 'none'; report-to first; report-to last",
	",frame-ancestors 'none';, report-uri /csp; report-to reports,;",
	"report-uri /opaque-\x80\xff",
])("admits empty or framing/reporting-only policy %j", (policy) => {
	expect(hasUnsupportedExecutionCsp(enforced([policy]), true)).toBe(false);
});

it("classifies directive names without claiming source or reporting matching", () => {
	for (const policy of [
		"frame-ancestors not-a-source",
		"frame-ancestors 'self' script-src 'none'",
		"report-uri not-a-url",
		"report-to",
	]) {
		expect(hasUnsupportedExecutionCsp(enforced([policy]), true)).toBe(false);
	}
});

it.each([
	"script-src * 'unsafe-inline' 'unsafe-eval'",
	"SCRIPT-SRC 'none'",
	"script-src-elem *",
	"script-src-attr 'unsafe-inline'",
	"default-src *",
	"connect-src *",
	"img-src *",
	"style-src *",
	"font-src *",
	"media-src *",
	"object-src *",
	"child-src *",
	"frame-src *",
	"worker-src *",
	"manifest-src *",
	"prefetch-src *",
	"sandbox allow-scripts allow-same-origin",
	"base-uri *",
	"form-action *",
	"trusted-types *",
	"require-trusted-types-for 'script'",
	"upgrade-insecure-requests",
	"block-all-mixed-content",
	"navigate-to *",
	"unknown-directive permissive",
])("refuses unsupported directive %j wherever it occurs", (directive) => {
	for (const values of [
		[directive],
		[`${capturedTargetPolicy} ${directive}`],
		[`${directive}; ${capturedTargetPolicy}`],
		[`${capturedTargetPolicy}, ${directive}`],
		[`${directive}, ${capturedTargetPolicy}`],
		[capturedTargetPolicy, directive],
		[directive, capturedTargetPolicy],
	]) {
		expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(true);
	}
});

it("does not mask duplicate source directives with a permissive first directive", () => {
	for (const policy of [
		"script-src *; script-src 'none'",
		"script-src 'none'; script-src *",
		"default-src *; default-src 'none'",
	]) {
		expect(hasUnsupportedExecutionCsp(enforced([policy]), true)).toBe(true);
	}
});

it("checks every case-insensitive own alias and every value", () => {
	const headers = {
		"Content-Security-Policy": [capturedTargetPolicy, "report-to reports"],
		"CONTENT-SECURITY-POLICY": ["", "report-uri /csp"],
		"content-security-policy": ["frame-ancestors 'none'"],
	};
	expect(hasUnsupportedExecutionCsp(headers, true)).toBe(false);
	for (const name of Object.keys(headers)) {
		expect(
			hasUnsupportedExecutionCsp(
				{ ...headers, [name]: ["script-src 'none'"] },
				true,
			),
		).toBe(true);
	}
});

it("includes non-enumerable own enforced fields", () => {
	for (const policy of [capturedTargetPolicy, "script-src 'none'"]) {
		const headers = Object.defineProperty({}, "Content-Security-Policy", {
			value: [policy],
		});
		expect(hasUnsupportedExecutionCsp(headers, true)).toBe(
			policy !== capturedTargetPolicy,
		);
		expect(hasUnsupportedExecutionCsp(headers)).toBe(true);
	}
});

it("ignores report-only and unrelated fields without invoking their getters", () => {
	const read = vi.fn(() => {
		throw new Error("must not read ignored headers");
	});
	const headers = Object.defineProperties(enforced([capturedTargetPolicy]), {
		"content-security-policy-report-only": { get: read },
		"CONTENT-SECURITY-POLICY-REPORT-ONLY": { get: read },
		"content-type": { get: read },
	});
	expect(hasUnsupportedExecutionCsp(headers, true)).toBe(false);
	expect(read).not.toHaveBeenCalled();
	expect(
		hasUnsupportedExecutionCsp(
			{
				...enforced([capturedTargetPolicy]),
				"Content-Security-Policy-Report-Only": [
					`script-src 'none';\n${"x".repeat(32769)}`,
				],
			},
			true,
		),
	).toBe(false);
});

it.each(
	[undefined, false, null, 0, 1, "true", {}, [], Object(true)].map(
		(context) => ({
			context,
		}),
	),
)(
	"does not grant an enforced-header exception for context $context",
	({ context }) => {
		for (const values of [[capturedTargetPolicy], [""], []]) {
			expect(
				hasUnsupportedExecutionCsp(enforced(values), context as boolean),
			).toBe(true);
		}
		expect(hasUnsupportedExecutionCsp({}, context as boolean)).toBe(false);
	},
);

it.each(
	[null, undefined, false, 1, "frame-ancestors 'none'", [], () => ({})].map(
		(headers) => ({ headers }),
	),
)("refuses malformed header containers $headers", ({ headers }) => {
	expect(
		hasUnsupportedExecutionCsp(
			headers as unknown as NetworkResponse["headers"],
			true,
		),
	).toBe(true);
});

it("refuses malformed fields and entries without coercion", () => {
	const coerce = vi.fn(() => {
		throw new Error("must not coerce header values");
	});
	const object = { toString: coerce, [Symbol.toPrimitive]: coerce };
	for (const values of [
		undefined,
		null,
		false,
		1,
		"frame-ancestors 'none'",
		{ 0: capturedTargetPolicy, length: 1 },
		object,
		[],
		[undefined],
		[null],
		[false],
		[1],
		[1n],
		[Symbol("policy")],
		[object],
		[Object(capturedTargetPolicy)],
		[[capturedTargetPolicy]],
		[capturedTargetPolicy, object],
	]) {
		expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(true);
	}
	expect(coerce).not.toHaveBeenCalled();
});

it("refuses own enforced header accessors without invoking them", () => {
	const read = vi.fn(() => [capturedTargetPolicy]);
	for (const descriptor of [{ get: read }, { set: read }]) {
		const headers = Object.defineProperty(
			enforced([capturedTargetPolicy]),
			"Content-Security-Policy",
			descriptor,
		);
		expect(hasUnsupportedExecutionCsp(headers, true)).toBe(true);
		expect(hasUnsupportedExecutionCsp(headers)).toBe(true);
	}
	expect(read).not.toHaveBeenCalled();
});

it("refuses array accessors, holes and inherited slots without invoking getters", () => {
	const read = vi.fn(() => capturedTargetPolicy);
	const accessor = Object.defineProperty([capturedTargetPolicy], "0", {
		get: read,
	});
	const setter = Object.defineProperty([capturedTargetPolicy], "0", {
		set: read,
	});
	const inherited = new Array<string>(1);
	Object.setPrototypeOf(
		inherited,
		Object.defineProperty(Object.create(Array.prototype), "0", { get: read }),
	);
	const inheritedValue = new Array<string>(1);
	Object.setPrototypeOf(inheritedValue, [capturedTargetPolicy]);
	const trailingHole = Object.defineProperty(new Array<string>(2), "0", {
		value: capturedTargetPolicy,
	});
	for (const values of [
		accessor,
		setter,
		new Array<string>(1),
		trailingHole,
		inherited,
		inheritedValue,
	]) {
		expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(true);
	}
	expect(read).not.toHaveBeenCalled();
});

it("reads frozen arrays by descriptors rather than iterator or coercion hooks", () => {
	const read = vi.fn(() => {
		throw new Error("must not read array hooks");
	});
	const values = Object.freeze(
		Object.defineProperties([capturedTargetPolicy, "report-to reports"], {
			[Symbol.iterator]: { get: read },
			toString: { get: read },
		}),
	);
	expect(
		hasUnsupportedExecutionCsp(Object.freeze(enforced(values)), true),
	).toBe(false);
	expect(read).not.toHaveBeenCalled();
});

it("fails closed when property inspection throws", () => {
	const fail = () => {
		throw new Error("uninspectable headers");
	};
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	for (const headers of [
		new Proxy({}, { ownKeys: fail }),
		new Proxy(enforced([capturedTargetPolicy]), {
			getOwnPropertyDescriptor: fail,
		}),
		enforced(
			new Proxy([capturedTargetPolicy], { getOwnPropertyDescriptor: fail }),
		),
		revoked.proxy,
	]) {
		expect(hasUnsupportedExecutionCsp(headers, true)).toBe(true);
	}
});

it("refuses forbidden controls and non-header characters anywhere in a value", () => {
	const codes = [
		...Array.from({ length: 32 }, (_, index) => index).filter(
			(code) => code !== 9,
		),
		127,
		256,
		0x2028,
		0x2029,
		0xd800,
		0xfeff,
	];
	for (const code of codes) {
		const character = String.fromCharCode(code);
		for (const value of [
			character,
			`${character}${capturedTargetPolicy}`,
			`frame-ancestors ${character}`,
			`${capturedTargetPolicy}${character}`,
			`report-uri /report${character}`,
		]) {
			expect(hasUnsupportedExecutionCsp(enforced([value]), true)).toBe(true);
		}
	}
});

it.each([
	"frame-ancestors:none",
	"frame-ancestors='none'",
	"frame-ancestors\u00a0'none'",
	"\u00a0frame-ancestors 'none'",
	"frame-ancestors/ 'none'",
	"report-to-endpoint reports",
	"report-uri /first,/second",
])(
	"does not confuse malformed directive names or policy separators in %j",
	(policy) => {
		expect(hasUnsupportedExecutionCsp(enforced([policy]), true)).toBe(true);
	},
);

it("bounds all enforced fields and values across case aliases at 64", () => {
	const headers = Object.fromEntries(
		Array.from({ length: 64 }, (_, index) => [headerAlias(index), [""]]),
	);
	expect(hasUnsupportedExecutionCsp(headers, true)).toBe(false);
	expect(
		hasUnsupportedExecutionCsp({ ...headers, [headerAlias(64)]: [""] }, true),
	).toBe(true);
	expect(
		hasUnsupportedExecutionCsp(
			{ ...headers, [headerAlias(63)]: ["", ""] },
			true,
		),
	).toBe(true);
	const values = Array.from({ length: 64 }, () => "");
	expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(false);
	expect(hasUnsupportedExecutionCsp(enforced([...values, ""]), true)).toBe(
		true,
	);
	expect(
		hasUnsupportedExecutionCsp(
			enforced([...values, "script-src 'none'"]),
			true,
		),
	).toBe(true);
});

it("rejects oversized arrays before inspecting their slots", () => {
	const read = vi.fn(() => capturedTargetPolicy);
	for (const length of [65, 4294967295]) {
		const values = Object.defineProperty(new Array<string>(length), "0", {
			get: read,
		});
		expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(true);
	}
	expect(read).not.toHaveBeenCalled();
});

it("rejects malformed array length descriptors without reading array properties", () => {
	const read = vi.fn(() => {
		throw new Error("must not read array properties");
	});
	for (const length of [
		undefined,
		null,
		"1",
		-1,
		0,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		65,
	]) {
		const values = new Proxy([capturedTargetPolicy], {
			get: read,
			getOwnPropertyDescriptor(target, name) {
				const descriptor = Object.getOwnPropertyDescriptor(target, name);
				return name === "length"
					? { ...descriptor, value: length }
					: descriptor;
			},
		});
		expect(hasUnsupportedExecutionCsp(enforced(values), true)).toBe(true);
	}
	expect(read).not.toHaveBeenCalled();
});

it("bounds comma-separated policies at 64, including empty policies", () => {
	for (const policy of ["", "frame-ancestors 'none'"]) {
		const values = Array.from({ length: 64 }, () => policy);
		expect(hasUnsupportedExecutionCsp(enforced([values.join(",")]), true)).toBe(
			false,
		);
		expect(
			hasUnsupportedExecutionCsp(enforced([`${values.join(",")},`]), true),
		).toBe(true);
		expect(
			hasUnsupportedExecutionCsp(
				{
					"content-security-policy": [values.slice(0, 32).join(",")],
					"Content-Security-Policy": [values.slice(32).join(","), ""],
				},
				true,
			),
		).toBe(true);
	}
});

it("bounds combined serialized policy code units at 32768", () => {
	const exact = "frame-ancestors ".padEnd(32768, " ");
	expect(hasUnsupportedExecutionCsp(enforced([exact]), true)).toBe(false);
	expect(hasUnsupportedExecutionCsp(enforced([`${exact} `]), true)).toBe(true);
	const first = "frame-ancestors ".padEnd(16384, " ");
	const second = "report-to reports".padEnd(16384, " ");
	for (const suffix of ["", " "]) {
		expect(
			hasUnsupportedExecutionCsp(enforced([first, `${second}${suffix}`]), true),
		).toBe(suffix !== "");
		expect(
			hasUnsupportedExecutionCsp(
				{
					"content-security-policy": [first],
					"Content-Security-Policy": [`${second}${suffix}`],
				},
				true,
			),
		).toBe(suffix !== "");
	}
	expect(
		hasUnsupportedExecutionCsp(enforced([exact, "script-src 'none'"]), true),
	).toBe(true);
});

it("bounds directives at 1024, counting duplicates and empty split tokens", () => {
	for (const directive of ["", "frame-ancestors"]) {
		const exact = Array.from({ length: 1024 }, () => directive).join(";");
		expect(hasUnsupportedExecutionCsp(enforced([exact]), true)).toBe(false);
		expect(hasUnsupportedExecutionCsp(enforced([`${exact};`]), true)).toBe(
			true,
		);
		expect(
			hasUnsupportedExecutionCsp(
				enforced([`${exact}; script-src 'none'`]),
				true,
			),
		).toBe(true);
	}
});

it("counts directive tokens cumulatively across policies, values and aliases", () => {
	const policy = ";".repeat(15);
	const values = Array.from({ length: 64 }, () => policy);
	for (const extra of ["", ";"]) {
		const combined = `${values.join(",")}${extra}`;
		expect(hasUnsupportedExecutionCsp(enforced([combined]), true)).toBe(
			extra !== "",
		);
		const headers = {
			"content-security-policy": values.slice(0, 32),
			"Content-Security-Policy": [...values.slice(32, 63), `${policy}${extra}`],
		};
		expect(hasUnsupportedExecutionCsp(headers, true)).toBe(extra !== "");
	}
});
