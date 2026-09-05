import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
	createPublicSuffixMatcher,
	publicSuffixLimits,
} from "./public-suffix.js";

const directory = new URL("../vendor/public-suffix/", import.meta.url);
const sourceBytes = readFileSync(new URL("public_suffix_list.dat", directory));
const source = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
}).decode(sourceBytes);
const rules = source
	.split("\n")
	.filter((line) => line.trim() && !line.startsWith("//"))
	.map((line) => line.split(/\s/u)[0]);
const matcher = createPublicSuffixMatcher(source);
const vectorSource = readFileSync(new URL("test_psl.txt", directory), "utf8");
const vectors = vectorSource
	.split("\n")
	.filter((line) => line.trim() && !line.startsWith("//"))
	.map((line): [string | null, string | null] => {
		const statement =
			/^checkPublicSuffix\((null|'[^'\\]*'), (null|'[^'\\]*')\);$/u.exec(line);
		if (!statement) throw new Error("Unrecognized pinned vector statement");
		const literal = (value: string) =>
			value === "null" ? null : value.slice(1, -1);
		return [literal(statement[1]), literal(statement[2])];
	});

it.each([
	[
		"public_suffix_list.dat",
		335592,
		"87a80788b0151117c77fa520421c4bed9b7e7c91c6df6ac363bbf2b64fd21291",
	],
	[
		"LICENSE",
		16727,
		"66a3107d5ad6a058aab753eaac2047ccb2ed0e39465dd0fe5844da3e300d5172",
	],
	[
		"test_psl.txt",
		4308,
		"8f50ad958916d6a8f79fba2363501475571acce752757f9126fe9d2f17dd920d",
	],
] as const)("preserves pinned %s bytes and digest", (name, length, digest) => {
	const bytes = readFileSync(new URL(name, directory));
	expect(bytes.byteLength).toBe(length);
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
});

it("preserves complete UTF-8 source framing and upstream notices", () => {
	expect(Buffer.from(source)).toEqual(sourceBytes);
	expect(source.length).toBe(333844);
	expect(source.length).toBeLessThan(publicSuffixLimits.maxSourceCodeUnits);
	expect(source).not.toContain("\r");
	expect(source).not.toContain("\ufeff");
	expect(source.endsWith("\n")).toBe(true);
	expect(source.split("\n")).toHaveLength(16498);
	expect(source.startsWith("// This Source Code Form is subject")).toBe(true);
	expect(source).toContain("https://mozilla.org/MPL/2.0/");
	expect(source).toContain(
		"// Please pull this list from, and only from https://publicsuffix.org/list/public_suffix_list.dat,",
	);
	expect(source).toContain(
		"// rather than any other VCS sites. Pulling from any other URL is not guaranteed to be supported.",
	);
});

it("admits every rule in both complete sections without filtering or deduplication", () => {
	const markers = [
		"// ===BEGIN ICANN DOMAINS===",
		"// ===END ICANN DOMAINS===",
		"// ===BEGIN PRIVATE DOMAINS===",
		"// ===END PRIVATE DOMAINS===",
	];
	const positions = markers.map((marker) => {
		expect(source.split(marker)).toHaveLength(2);
		return source.indexOf(marker);
	});
	expect(positions).toEqual(
		[...positions].sort((first, second) => first - second),
	);
	const countSection = (start: number, end: number) =>
		source
			.slice(start, end)
			.split("\n")
			.filter((line) => line.trim() && !line.startsWith("//")).length;
	expect(countSection(positions[0], positions[1])).toBe(6949);
	expect(countSection(positions[2], positions[3])).toBe(3372);
	expect(rules).toHaveLength(10321);
	expect(new Set(rules).size).toBe(10321);
	expect(rules.filter((rule) => rule.startsWith("*."))).toHaveLength(287);
	expect(rules.filter((rule) => rule.startsWith("!"))).toHaveLength(8);
	expect(matcher.ruleCount).toBe(10321);
	expect(matcher.ruleCount).toBeLessThan(publicSuffixLimits.maxRules);
});

it.each<[string, string, string | null]>([
	["example.com", "com", "example.com"],
	["example.co.uk", "co.uk", "example.co.uk"],
	["alice.blogspot.com", "blogspot.com", "alice.blogspot.com"],
	["bob.blogspot.com", "blogspot.com", "bob.blogspot.com"],
	["a.alice.blogspot.com", "blogspot.com", "alice.blogspot.com"],
	["alice.github.io", "github.io", "alice.github.io"],
	["alice.pages.dev", "pages.dev", "alice.pages.dev"],
	["tenant.azurewebsites.net", "azurewebsites.net", "tenant.azurewebsites.net"],
	[
		"tenant.eastus-01.azurewebsites.net",
		"eastus-01.azurewebsites.net",
		"tenant.eastus-01.azurewebsites.net",
	],
	["foo.ck", "foo.ck", null],
	["a.foo.ck", "foo.ck", "a.foo.ck"],
	["www.ck", "ck", "www.ck"],
	["a.www.ck", "ck", "www.ck"],
	["foo.kawasaki.jp", "foo.kawasaki.jp", null],
	["city.kawasaki.jp", "kawasaki.jp", "city.kawasaki.jp"],
	["a.city.kawasaki.jp", "kawasaki.jp", "city.kawasaki.jp"],
	["example.invalid", "invalid", "example.invalid"],
	["EXAMPLE.COM.", "com.", "example.com."],
])(
	"checks pinned-data boundary %s without granting consumer permissions",
	(domain, publicSuffix, registrableDomain) => {
		expect(matcher.match(domain)).toMatchObject({
			publicSuffix,
			registrableDomain,
		});
	},
);

it("traverses a canonical child query for every admitted rule without retaining query state", () => {
	const first = matcher.match("alice.blogspot.com");
	for (const rule of rules) {
		const body = rule.replace(/^(?:\*\.|!)/u, "");
		const domain = new URL(`https://audit-fixture.${body}/`).hostname;
		const result = matcher.match(domain);
		expect(result.domain, rule).toBe(domain);
		expect(result.ruleType, rule).not.toBe("default");
		expect(
			domain === result.publicSuffix ||
				domain.endsWith(`.${result.publicSuffix}`),
			rule,
		).toBe(true);
		expect(Object.isFrozen(result), rule).toBe(true);
	}
	expect(matcher.ruleCount).toBe(10321);
	expect(matcher.match("alice.blogspot.com")).toEqual(first);
	expect(Object.isFrozen(matcher)).toBe(true);
});

it("recognizes all pinned official vectors without evaluating their source", () => {
	expect(vectors).toHaveLength(78);
	expect(
		vectorSource
			.split("\n")
			.filter((line) => line.startsWith("//checkPublicSuffix(")),
	).toHaveLength(4);
	expect(vectorSource).toContain(
		"// Any copyright is dedicated to the Public Domain.",
	);
	expect(vectorSource).toContain(
		"https://creativecommons.org/publicdomain/zero/1.0/",
	);
});

it.each(vectors)(
	"matches pinned official registrable-domain vector %j => %j",
	(input, expected) => {
		if (input === null || input === "" || input.startsWith(".")) {
			expect(expected).toBeNull();
			expect(() => Reflect.apply(matcher.match, undefined, [input])).toThrow(
				TypeError,
			);
			return;
		}
		const canonicalLabels = new Map([
			["食狮", "xn--85x722f"],
			["公司", "xn--55qx5d"],
			["中国", "xn--fiqs8s"],
		]);
		const canonicalExpected =
			expected === null
				? null
				: expected
						.split(".")
						.map((label) => canonicalLabels.get(label) ?? label)
						.join(".");
		expect(matcher.match(input).registrableDomain).toBe(canonicalExpected);
	},
);
