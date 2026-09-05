import { expect, it } from "vitest";
import {
	type PublicSuffixResult,
	createPublicSuffixMatcher,
	publicSuffixLimits,
} from "./public-suffix.js";

const fixtureSource = `
// ===BEGIN ICANN DOMAINS===
ac
biz
com
cn
com.cn
公司.cn
中国
jp
ac.jp
kyoto.jp
ide.kyoto.jp
*.kobe.jp
!city.kobe.jp
*.ck
!www.ck
*.mm
us
ak.us
k12.ak.us
// ===END ICANN DOMAINS===
// ===BEGIN PRIVATE DOMAINS===
uk.com
blogspot.com
github.io
*.platform.test
!reserved.platform.test
// ===END PRIVATE DOMAINS===
`;

const matcher = createPublicSuffixMatcher(fixtureSource);

it.each([false, true])(
	"does not certify PRIVATE completeness from exact matches or markers: %s",
	(markers) => {
		const source = markers
			? "// ===BEGIN ICANN DOMAINS===\ncom\n// ===END ICANN DOMAINS===\n// ===BEGIN PRIVATE DOMAINS===\n// ===END PRIVATE DOMAINS==="
			: "com";
		const sparse = createPublicSuffixMatcher(source);
		const completeForFixture = createPublicSuffixMatcher(
			`${source}\nblogspot.com`,
		);
		for (const tenant of ["alice", "bob"]) {
			const domain = `${tenant}.blogspot.com`;
			expect(sparse.match(domain)).toMatchObject({
				ruleType: "exact",
				publicSuffix: "com",
				registrableDomain: "blogspot.com",
			});
			expect(completeForFixture.match(domain)).toMatchObject({
				ruleType: "exact",
				publicSuffix: "blogspot.com",
				registrableDomain: domain,
			});
		}
	},
);

it.each<[string, string | null]>([
	["COM", null],
	["example.COM", "example.com"],
	["WwW.example.COM", "example.com"],
	["example", null],
	["example.example", "example.example"],
	["b.example.example", "example.example"],
	["a.b.example.example", "example.example"],
	["biz", null],
	["domain.biz", "domain.biz"],
	["b.domain.biz", "domain.biz"],
	["a.b.domain.biz", "domain.biz"],
	["com", null],
	["example.com", "example.com"],
	["b.example.com", "example.com"],
	["a.b.example.com", "example.com"],
	["uk.com", null],
	["example.uk.com", "example.uk.com"],
	["b.example.uk.com", "example.uk.com"],
	["a.b.example.uk.com", "example.uk.com"],
	["test.ac", "test.ac"],
	["mm", null],
	["c.mm", null],
	["b.c.mm", "b.c.mm"],
	["a.b.c.mm", "b.c.mm"],
	["jp", null],
	["test.jp", "test.jp"],
	["www.test.jp", "test.jp"],
	["ac.jp", null],
	["test.ac.jp", "test.ac.jp"],
	["www.test.ac.jp", "test.ac.jp"],
	["kyoto.jp", null],
	["test.kyoto.jp", "test.kyoto.jp"],
	["ide.kyoto.jp", null],
	["b.ide.kyoto.jp", "b.ide.kyoto.jp"],
	["a.b.ide.kyoto.jp", "b.ide.kyoto.jp"],
	["c.kobe.jp", null],
	["b.c.kobe.jp", "b.c.kobe.jp"],
	["a.b.c.kobe.jp", "b.c.kobe.jp"],
	["city.kobe.jp", "city.kobe.jp"],
	["www.city.kobe.jp", "city.kobe.jp"],
	["ck", null],
	["test.ck", null],
	["b.test.ck", "b.test.ck"],
	["a.b.test.ck", "b.test.ck"],
	["www.ck", "www.ck"],
	["www.www.ck", "www.ck"],
	["us", null],
	["test.us", "test.us"],
	["www.test.us", "test.us"],
	["ak.us", null],
	["test.ak.us", "test.ak.us"],
	["www.test.ak.us", "test.ak.us"],
	["k12.ak.us", null],
	["test.k12.ak.us", "test.k12.ak.us"],
	["www.test.k12.ak.us", "test.k12.ak.us"],
	["食狮.com.cn", "xn--85x722f.com.cn"],
	["食狮.公司.cn", "xn--85x722f.xn--55qx5d.cn"],
	["www.食狮.公司.cn", "xn--85x722f.xn--55qx5d.cn"],
	["shishi.公司.cn", "shishi.xn--55qx5d.cn"],
	["公司.cn", null],
	["食狮.中国", "xn--85x722f.xn--fiqs8s"],
	["www.食狮.中国", "xn--85x722f.xn--fiqs8s"],
	["shishi.中国", "shishi.xn--fiqs8s"],
	["中国", null],
	["xn--85x722f.com.cn", "xn--85x722f.com.cn"],
	["xn--85x722f.xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn"],
	["www.xn--85x722f.xn--55qx5d.cn", "xn--85x722f.xn--55qx5d.cn"],
	["shishi.xn--55qx5d.cn", "shishi.xn--55qx5d.cn"],
	["xn--55qx5d.cn", null],
	["xn--85x722f.xn--fiqs8s", "xn--85x722f.xn--fiqs8s"],
	["www.xn--85x722f.xn--fiqs8s", "xn--85x722f.xn--fiqs8s"],
	["shishi.xn--fiqs8s", "shishi.xn--fiqs8s"],
	["xn--fiqs8s", null],
])("matches official PSL registrable-domain vector %s", (domain, expected) => {
	expect(matcher.match(domain).registrableDomain).toBe(expected);
});

it.each<[string, string, string | null, string, string]>([
	["a.b.example.com", "com", "example.com", "com", "exact"],
	["a.b.example.unknown", "unknown", "example.unknown", "*", "default"],
	["unknown", "unknown", null, "*", "default"],
	["a.b.test.ck", "test.ck", "b.test.ck", "*.ck", "wildcard"],
	["www.ck", "ck", "www.ck", "!www.ck", "exception"],
	["a.www.ck", "ck", "www.ck", "!www.ck", "exception"],
	["a.b.k12.ak.us", "k12.ak.us", "b.k12.ak.us", "k12.ak.us", "exact"],
	["x.blogspot.com", "blogspot.com", "x.blogspot.com", "blogspot.com", "exact"],
	["a.b.github.io", "github.io", "b.github.io", "github.io", "exact"],
	["github.io", "github.io", null, "github.io", "exact"],
	[
		"a.b.platform.test",
		"b.platform.test",
		"a.b.platform.test",
		"*.platform.test",
		"wildcard",
	],
	[
		"a.reserved.platform.test",
		"platform.test",
		"reserved.platform.test",
		"!reserved.platform.test",
		"exception",
	],
])(
	"returns complete rule metadata for %s",
	(domain, publicSuffix, registrableDomain, rule, ruleType) => {
		expect(matcher.match(domain)).toEqual({
			domain,
			publicSuffix,
			registrableDomain,
			rule,
			ruleType,
		});
	},
);

it("does not invent exact parents for wildcard-only sparse lists", () => {
	const sparse = createPublicSuffixMatcher("*.foo.bar");
	expect(sparse.match("foo.bar")).toEqual({
		domain: "foo.bar",
		publicSuffix: "bar",
		registrableDomain: "foo.bar",
		rule: "*",
		ruleType: "default",
	});
	expect(sparse.match("a.foo.bar").registrableDomain).toBeNull();
	expect(sparse.match("b.a.foo.bar").registrableDomain).toBe("b.a.foo.bar");
	expect(sparse.match("notfoo.bar").ruleType).toBe("default");
});

it("uses label boundaries, longest matches and exact metadata on wildcard ties", () => {
	const rules = createPublicSuffixMatcher(
		"com\nfoo.com\n*.foo.com\nx.foo.com\ny.x.foo.com",
	);
	expect(rules.match("foo.com.evil").publicSuffix).toBe("evil");
	expect(rules.match("notfoo.com").publicSuffix).toBe("com");
	expect(rules.match("a.x.foo.com").rule).toBe("x.foo.com");
	expect(rules.match("a.y.x.foo.com").rule).toBe("y.x.foo.com");
	expect(rules.match("a.z.foo.com").rule).toBe("*.foo.com");
});

it("prioritizes exceptions over longer exact and wildcard rules, independent of order", () => {
	const lines = [
		"!city.kobe.jp",
		"www.city.kobe.jp",
		"*.city.kobe.jp",
		"*.kobe.jp",
	];
	const forward = createPublicSuffixMatcher(lines.join("\n"));
	const reverse = createPublicSuffixMatcher([...lines].reverse().join("\n"));
	for (const domain of [
		"city.kobe.jp",
		"www.city.kobe.jp",
		"deep.www.city.kobe.jp",
	]) {
		expect(forward.match(domain).rule).toBe("!city.kobe.jp");
		expect(forward.match(domain).publicSuffix).toBe("kobe.jp");
		expect(reverse.match(domain)).toEqual(forward.match(domain));
	}
});

it("supports an explicit universal rule without changing default semantics", () => {
	const universal = createPublicSuffixMatcher("*\ncom");
	expect(universal.match("a.unknown")).toEqual({
		domain: "a.unknown",
		publicSuffix: "unknown",
		registrableDomain: "a.unknown",
		rule: "*",
		ruleType: "wildcard",
	});
	expect(universal.match("com").ruleType).toBe("exact");
});

it.each<[string, string]>([
	["WWW.食狮.公司.CN", "www.xn--85x722f.xn--55qx5d.cn"],
	["ＷＷＷ．ＥＸＡＭＰＬＥ．ＣＯＭ", "www.example.com"],
	["www。example｡com", "www.example.com"],
	["cafe\u0301.com", "xn--caf-dma.com"],
	["café.com", "xn--caf-dma.com"],
	["faß.com", "xn--fa-hia.com"],
	["a\u00adb.com", "ab.com"],
	["💩.com", "xn--ls8h.com"],
	["ab--cd.com", "ab--cd.com"],
])("uses platform URL IDNA normalization for %s", (input, domain) => {
	expect(matcher.match(input).domain).toBe(domain);
	expect(matcher.match(input)).toEqual(matcher.match(domain));
});

it.each([".", "。", "．", "｡"])(
	"preserves one terminal root separator %s in domain-valued results",
	(dot) => {
		expect(matcher.match(`EXAMPLE.COM${dot}`)).toEqual({
			domain: "example.com.",
			publicSuffix: "com.",
			registrableDomain: "example.com.",
			rule: "com",
			ruleType: "exact",
		});
		expect(matcher.match(`com${dot}`).registrableDomain).toBeNull();
		expect(matcher.match(`a.test.ck${dot}`).publicSuffix).toBe("test.ck.");
		expect(matcher.match(`a.www.ck${dot}`).registrableDomain).toBe("www.ck.");
		expect(matcher.match(`x.unknown${dot}`).publicSuffix).toBe("unknown.");
	},
);

it("normalizes rules as well as domains including Unicode wildcards and exceptions", () => {
	const unicode = createPublicSuffixMatcher(
		"*.公司.cn\n!食狮.公司.cn\nCAFÉ.COM",
	);
	expect(unicode.match("a.食狮.公司.cn").rule).toBe(
		"!xn--85x722f.xn--55qx5d.cn",
	);
	expect(unicode.match("a.other.公司.cn").rule).toBe("*.xn--55qx5d.cn");
	expect(unicode.match("a.cafe\u0301.com").publicSuffix).toBe(
		"xn--caf-dma.com",
	);
});

it.each([
	"",
	".",
	"。",
	"..",
	".com",
	".example",
	".example.com",
	".example.example",
	"a..com",
	"example.com..",
	"example.com.。",
	"。com",
	"a。．com",
	" example.com",
	"example.com ",
	"example.com\n",
	"ex\tample.com",
	"ex\u0085ample.com",
	"a\0.com",
	"https://example.com",
	"//example.com",
	"example.com/",
	"example.com:443",
	"user@example.com",
	"example.com?x",
	"example.com#x",
	"example.com\\other",
	"%65xample.com",
	"example%2ecom",
	"*.com",
	"!example.com",
	"_tcp.example.com",
	"-example.com",
	"example-.com",
	"a+b.com",
	"a,b.com",
	"xn--.com",
	"xn--a.com",
	"xn--hello-.com",
	"\ud800.com",
	"\udfff.com",
	"fa\u200css.com",
	"\u00ad.com",
	"a.\u00ad",
	"a.\u00ad.",
	"a.1",
	"a.0x10",
	"a.99999999999",
])("rejects malformed domain %j", (domain) => {
	expect(() => matcher.match(domain)).toThrow(TypeError);
});

it.each([
	"127.0.0.1",
	"127.1",
	"127.0.1",
	"2130706433",
	"0x7f000001",
	"0X7F000001",
	"0177.0.0.1",
	"017700000001",
	"0x7f.1",
	"0x7f.0.0.01",
	"127.0.0.1.",
	"127.1.",
	"0",
	"0.0.0.0",
	"4294967295",
	"4294967296",
	"1.2.3.256",
	"１２７.１",
	"０Ｘ７ｆ０００００１",
	"１２７。０。０。１。",
	"[::1]",
	"::1",
	"[2001:db8::1]",
	"2001:db8::1",
	"[::ffff:127.0.0.1]",
	"[fe80::1%25eth0]",
])(
	"rejects IP addresses and URL numeric aliases in domains and rules: %s",
	(input) => {
		expect(() => matcher.match(input)).toThrow(TypeError);
		expect(() => createPublicSuffixMatcher(input)).toThrow(TypeError);
	},
);

it("permits numeric labels when the hostname is not interpreted as an IP address", () => {
	expect(matcher.match("127.0.0.1.com").registrableDomain).toBe("1.com");
	expect(matcher.match("0x7f000001.com").registrableDomain).toBe(
		"0x7f000001.com",
	);
});

it.each([
	"",
	"\n \t\r\n",
	"// comment only",
	"\ufeff",
	"// ===BEGIN PRIVATE DOMAINS===\n// ===END PRIVATE DOMAINS===",
	" com",
	"\tcom",
	" // indented",
	".com",
	"com.",
	"*.com.",
	"!www.com.",
	"a..com",
	"*.*.com",
	"foo.*.com",
	"foo*.com",
	"*com",
	"!",
	"!*",
	"!*.com",
	"!!foo.com",
	"*\n!com",
	"*.com\n!www.net",
	"!www.com",
	"foo。com",
	"foo．com",
	"foo｡com",
	"＊.com",
	"！www.com",
	"com//comment",
	"_com",
	"-com",
	"com-",
	"xn--a.com",
	"https://com",
	"\ud800.com",
])("rejects empty, malformed or orphan rule data %j", (source) => {
	expect(() => createPublicSuffixMatcher(source)).toThrow(TypeError);
});

it("reads LF/CRLF, comments, BOM, blank lines and only the first token", () => {
	const source =
		"\ufeff// header\r\n\r\n \t\r\nCOM ignored tokens\r\nnet\t// annotation\n*.org\n!www.org\n// ===BEGIN PRIVATE DOMAINS===\nprivate.com\n// ===END PRIVATE DOMAINS===";
	const rules = createPublicSuffixMatcher(source);
	expect(rules.ruleCount).toBe(5);
	expect(rules.match("a.com").rule).toBe("com");
	expect(rules.match("a.net").rule).toBe("net");
	expect(rules.match("a.private.com").publicSuffix).toBe("private.com");
	expect(rules.match("www.org").rule).toBe("!www.org");
});

it.each([
	"com\ncom",
	"com\nCOM",
	"*.com\n*.COM",
	"*\n*",
	"*.com\n!www.com\n!WWW.COM",
	"公司.cn\nxn--55qx5d.cn",
	"café.com\ncafe\u0301.com",
	"foo.com\nＦＯＯ.com",
	"ab.com\na\u00adb.com",
	"*.公司.cn\n*.xn--55qx5d.cn",
	"*.公司.cn\n!食狮.公司.cn\n!xn--85x722f.xn--55qx5d.cn",
	"// ===BEGIN ICANN DOMAINS===\ncom\n// ===BEGIN PRIVATE DOMAINS===\nCOM",
])("rejects duplicate and canonical-collision rules %j", (source) => {
	expect(() => createPublicSuffixMatcher(source)).toThrow(
		"Duplicate canonical PSL rule",
	);
});

it("rejects simultaneous matching exceptions rather than inventing precedence", () => {
	const source = ["*.com", "!foo.com", "*.foo.com", "!bar.foo.com"];
	expect(() => createPublicSuffixMatcher(source.join("\n"))).toThrow(
		"Overlapping PSL exceptions",
	);
	expect(() => createPublicSuffixMatcher(source.reverse().join("\n"))).toThrow(
		"Overlapping PSL exceptions",
	);
});

it("accepts sibling exceptions and the defined exception-over-exact priority", () => {
	const rules = createPublicSuffixMatcher("*.com\n!foo.com\n!bar.com\nfoo.com");
	expect(rules.match("a.foo.com").rule).toBe("!foo.com");
	expect(rules.match("a.bar.com").rule).toBe("!bar.com");
});

it.each([
	null,
	undefined,
	1,
	true,
	{},
	["com"],
	new Array(2),
	new String("com"),
])("rejects non-string / sparse input without coercion: %j", (input) => {
	expect(() => createPublicSuffixMatcher(input as string)).toThrow(TypeError);
	expect(() => matcher.match(input as string)).toThrow(TypeError);
});

it("never invokes caller string coercion", () => {
	let calls = 0;
	const input = {
		toString() {
			calls++;
			return "com";
		},
	};
	expect(() => createPublicSuffixMatcher(input as unknown as string)).toThrow(
		TypeError,
	);
	expect(() => matcher.match(input as unknown as string)).toThrow(TypeError);
	expect(calls).toBe(0);
});

it("bounds source before parsing and accepts its exact ceiling", () => {
	const source = `com\n//${"x".repeat(publicSuffixLimits.maxSourceCodeUnits - 6)}`;
	expect(source.length).toBe(publicSuffixLimits.maxSourceCodeUnits);
	expect(createPublicSuffixMatcher(source).ruleCount).toBe(1);
	expect(() => createPublicSuffixMatcher(`${source}x`)).toThrow(RangeError);
	expect(() =>
		createPublicSuffixMatcher(
			"\n".repeat(publicSuffixLimits.maxSourceCodeUnits + 1),
		),
	).toThrow(RangeError);
});

it("bounds admitted rules at the exact ceiling, independently of source size", () => {
	const source = Array.from(
		{ length: publicSuffixLimits.maxRules },
		(_, index) => `rule${index}.test`,
	).join("\n");
	expect(source.length).toBeLessThan(publicSuffixLimits.maxSourceCodeUnits);
	const large = createPublicSuffixMatcher(source);
	expect(large.ruleCount).toBe(publicSuffixLimits.maxRules);
	expect(large.match("a.rule99999.test").publicSuffix).toBe("rule99999.test");
	expect(() => createPublicSuffixMatcher(`${source}\nextra.test`)).toThrow(
		RangeError,
	);
});

it("bounds raw domain/rule/label admission even when IDNA would shrink it", () => {
	const label = `a${"\u00ad".repeat(publicSuffixLimits.maxLabelCodeUnits - 1)}`;
	const domain = [label, label, label, label.slice(0, -3)].join(".");
	expect(domain.length).toBe(publicSuffixLimits.maxDomainCodeUnits);
	expect(matcher.match(domain).domain).toBe("a.a.a.a");
	expect(createPublicSuffixMatcher(domain).match("a.a.a.a").rule).toBe(
		"a.a.a.a",
	);
	expect(() => matcher.match(`${domain}.`)).toThrow(RangeError);
	expect(() => createPublicSuffixMatcher(`!${domain}`)).toThrow(RangeError);
	expect(matcher.match(`${label}.com`).domain).toBe("a.com");
	expect(() => matcher.match(`${label}\u00ad.com`)).toThrow(RangeError);
	expect(() => createPublicSuffixMatcher(`${label}\u00ad.com`)).toThrow(
		RangeError,
	);
});

it("enforces canonical label, domain and label-count ceilings, including wildcards", () => {
	const label = "a".repeat(63);
	const longest = [label, label, label, "a".repeat(61)].join(".");
	const mostLabels = Array.from({ length: 127 }, () => "a").join(".");
	for (const domain of [longest, mostLabels]) {
		expect(domain.length).toBe(253);
		expect(matcher.match(domain).domain).toBe(domain);
		expect(matcher.match(`${domain}.`).domain).toBe(`${domain}.`);
		expect(
			createPublicSuffixMatcher(domain).match(domain).registrableDomain,
		).toBeNull();
		expect(() => createPublicSuffixMatcher(`*.${domain}`)).toThrow(RangeError);
	}
	for (const domain of [
		`${label}a.com`,
		`${longest}a`,
		`a.${mostLabels}`,
		`${"é".repeat(58)}.com`,
	]) {
		expect(() => matcher.match(domain)).toThrow(RangeError);
		expect(() => createPublicSuffixMatcher(domain)).toThrow(RangeError);
	}
	expect(
		matcher.match(`${"é".repeat(57)}.com`).domain.split(".")[0].length,
	).toBe(63);
	const wildcard = createPublicSuffixMatcher(`*.${mostLabels.slice(2)}`);
	expect(wildcard.match(mostLabels).registrableDomain).toBeNull();
});

it("is immutable across caller mutation, detached calls, failures and repeated lifetimes", () => {
	const lines = ["com", "blogspot.com"];
	let source = lines.join("\n");
	const rules = createPublicSuffixMatcher(source);
	const { match } = rules;
	const result = match("x.blogspot.com");
	lines.splice(0, lines.length, "net");
	source = "org";
	expect(source).toBe("org");
	expect(Object.isFrozen(rules)).toBe(true);
	expect(Object.isFrozen(match)).toBe(true);
	expect(Object.isFrozen(result)).toBe(true);
	expect(Object.isFrozen(publicSuffixLimits)).toBe(true);
	expect(Reflect.set(rules, "ruleCount", 99)).toBe(false);
	expect(Reflect.set(rules, "match", () => null)).toBe(false);
	expect(Reflect.set(result, "publicSuffix", "com")).toBe(false);
	expect(
		Reflect.set(publicSuffixLimits, "maxRules", Number.POSITIVE_INFINITY),
	).toBe(false);
	expect(Reflect.set(rules, "private", false)).toBe(false);
	expect(Object.keys(rules).sort()).toEqual(["match", "ruleCount"]);
	for (let index = 0; index < 1000; index++) {
		expect(() => match("127.1")).toThrow(TypeError);
		expect(
			createPublicSuffixMatcher("net").match("x.blogspot.com").publicSuffix,
		).toBe("com");
		expect(match("x.blogspot.com")).toEqual(result);
	}
	expect(match("x.blogspot.com")).not.toBe(result);
	expect(rules.ruleCount).toBe(2);
});

it("agrees with an independent all-rules reference for bounded generated domains", () => {
	const source =
		"*\ncom\n*.com\nfoo.com\n!bar.com\n*.foo.com\nx.foo.com\n!city.foo.com\na.x.foo.com";
	const rules = source.split("\n");
	const compiled = createPublicSuffixMatcher(source);
	const reference = (
		domain: string,
	): Pick<PublicSuffixResult, "publicSuffix" | "registrableDomain"> => {
		const labels = domain.split(".");
		const matches = rules.filter((rule) => {
			const parts = rule.replace(/^!/, "").split(".");
			return (
				parts.length <= labels.length &&
				parts.every(
					(part, index) =>
						part === "*" ||
						part === labels[labels.length - parts.length + index],
				)
			);
		});
		const prevailing =
			matches.find((rule) => rule.startsWith("!")) ??
			matches.sort(
				(left, right) => right.split(".").length - left.split(".").length,
			)[0] ??
			"*";
		const count =
			prevailing.split(".").length - Number(prevailing.startsWith("!"));
		return {
			publicSuffix: labels.slice(-count).join("."),
			registrableDomain:
				labels.length > count ? labels.slice(-count - 1).join(".") : null,
		};
	};
	let domains = ["com", "unknown"];
	for (let depth = 0; depth < 4; depth++) {
		for (const domain of domains)
			expect(compiled.match(domain)).toMatchObject(reference(domain));
		domains = domains.flatMap((domain) =>
			["foo", "bar", "city", "x", "a"].map((label) => `${label}.${domain}`),
		);
	}
});
