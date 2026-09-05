import { describe, expect, it, vi } from "vitest";
import {
	type BrowserIdentity,
	type BrowserIdentityOptions,
	browserIdentityHeaders,
	browserIdentityLimits,
	createBrowserIdentity,
	defaultBrowserIdentity,
} from "./browser-identity.js";

function create(options: unknown) {
	return createBrowserIdentity(options as BrowserIdentityOptions);
}

function headers(input: unknown, identity: unknown = defaultBrowserIdentity) {
	return browserIdentityHeaders(
		identity as BrowserIdentity,
		input as Record<string, string>,
	);
}

describe("native browser identity", () => {
	it("uses one frozen explicit English default, not host locale", () => {
		const canonicalize = vi.spyOn(Intl, "getCanonicalLocales");
		try {
			for (const options of [undefined, {}, { languages: undefined }]) {
				expect(create(options)).toBe(defaultBrowserIdentity);
			}
			expect(canonicalize).not.toHaveBeenCalled();
		} finally {
			canonicalize.mockRestore();
		}
		expect(defaultBrowserIdentity).toEqual({
			userAgent: "AgentBrowser/0.1",
			language: "en-US",
			languages: ["en-US"],
			acceptLanguage: "en-US",
		});
		expect(Object.isFrozen(defaultBrowserIdentity)).toBe(true);
		expect(Object.isFrozen(defaultBrowserIdentity.languages)).toBe(true);
		expect(Object.isFrozen(browserIdentityLimits)).toBe(true);
	});

	it("canonicalizes aliases, casing and Unicode extensions without sorting preferences", () => {
		const identity = createBrowserIdentity({
			languages: ["iw-il", "EN-us", "de-de-u-co-phonebk-ca-gregory"],
		});
		expect(identity.languages).toEqual([
			"he-IL",
			"en-US",
			"de-DE-u-ca-gregory-co-phonebk",
		]);
		expect(identity.language).toBe("he-IL");
		expect(identity.acceptLanguage).toBe(
			"he-IL, en-US;q=0.9, de-DE-u-ca-gregory-co-phonebk;q=0.8",
		);
	});

	it("preserves ten preferences with deterministic weights down to 0.1", () => {
		const languages = [
			"en",
			"fr",
			"de",
			"es",
			"it",
			"pl",
			"ja",
			"ko",
			"zh",
			"ar",
		];
		expect(createBrowserIdentity({ languages }).acceptLanguage).toBe(
			"en, fr;q=0.9, de;q=0.8, es;q=0.7, it;q=0.6, pl;q=0.5, ja;q=0.4, ko;q=0.3, zh;q=0.2, ar;q=0.1",
		);
	});

	it("copies caller data and keeps a stable deeply frozen profile", () => {
		const languages = ["fr", "en"];
		const options = { languages };
		const identity = createBrowserIdentity(options);
		const stable = identity.languages;
		languages[0] = "de";
		languages.push("pl");
		options.languages = ["ar"];
		expect(identity.languages).toBe(stable);
		expect(identity.languages).toEqual(["fr", "en"]);
		expect(identity.acceptLanguage).toBe("fr, en;q=0.9");
		expect(Object.isFrozen(identity)).toBe(true);
		expect(Object.isFrozen(stable)).toBe(true);
		expect(Reflect.set(identity, "language", "de")).toBe(false);
		expect(Reflect.set(stable, "0", "de")).toBe(false);
	});

	it.each([
		null,
		false,
		"en",
		[],
		() => undefined,
		{ userAgent: "Chrome" },
		{ platform: "Linux" },
		{ languages: ["en"], extra: true },
		{ constructor: undefined },
		{ prototype: undefined },
		JSON.parse('{"__proto__":null}'),
		{ [Symbol("languages")]: ["en"] },
		Object.create({ languages: ["en"] }),
		new Date(),
	])("rejects options outside the exact own-data schema %#", (options) => {
		expect(() => create(options)).toThrow(TypeError);
	});

	it("accepts null-prototype records and frozen own-data arrays", () => {
		const options = Object.create(null);
		Object.defineProperty(options, "languages", {
			value: Object.freeze(["pl-pl"]),
		});
		expect(create(options).language).toBe("pl-PL");
	});

	it("never calls option or array accessors, including hidden properties", () => {
		const getter = vi.fn(() => ["en"]);
		const options = Object.defineProperty({}, "languages", { get: getter });
		const languages = Object.defineProperty(["en"], "0", { get: getter });
		const custom = Object.defineProperty(["en"], "extra", { get: getter });
		for (const input of [options, { languages }, { languages: custom }])
			expect(() => create(input)).toThrow(TypeError);
		expect(getter).not.toHaveBeenCalled();
	});

	it.each([
		null,
		"en",
		[],
		[undefined],
		[42],
		[new String("en")],
		[""],
		[" en"],
		["en "],
		["en\t"],
		["en\r\nInjected: yes"],
		["en\0"],
		["en\u007f"],
		["en\u00a0"],
		["en,fr"],
		["en;q=1"],
		["en_US"],
		["en--US"],
		["x-private"],
		["a".repeat(65)],
		["en", "EN"],
		["iw", "he"],
		["en-u-nu-latn-ca-gregory", "en-u-ca-gregory-nu-latn"],
		Array(1),
		Object.assign(Array(1), { extra: "en" }),
		Object.assign(["en"], { extra: true }),
		Object.assign(["en"], { "01": "fr" }),
		Object.assign(["en"], { [Symbol.iterator]: undefined }),
		Object.setPrototypeOf(["en"], null),
	])(
		"rejects malformed, duplicate or nonstandard language arrays %#",
		(languages) => {
			expect(() => create({ languages })).toThrow();
		},
	);

	it("rejects oversized shapes and tags before canonicalization", () => {
		const canonicalize = vi.spyOn(Intl, "getCanonicalLocales");
		try {
			for (const languages of [
				Array(11).fill("en"),
				Array(2 ** 32 - 1),
				["en", "a".repeat(65)],
			])
				expect(() => create({ languages })).toThrow(TypeError);
			expect(canonicalize).not.toHaveBeenCalled();
		} finally {
			canonicalize.mockRestore();
		}
	});

	it("accepts the tag length boundary but rejects canonical expansion beyond it", () => {
		const tag = `en-x-${"abcdefgh-".repeat(6)}abcde`;
		expect(tag.length).toBe(browserIdentityLimits.languageTagCodeUnits);
		expect(createBrowserIdentity({ languages: [tag] }).language).toBe(tag);
		expect(() => create({ languages: [tag.replace(/^en/, "sh")] })).toThrow(
			TypeError,
		);
	});

	it("serializes only public identity data and reconstructs the brand from languages", () => {
		const identity = createBrowserIdentity({ languages: ["fr", "en"] });
		const serialized = JSON.stringify(identity);
		expect(serialized).toBe(
			'{"userAgent":"AgentBrowser/0.1","language":"fr","languages":["fr","en"],"acceptLanguage":"fr, en;q=0.9"}',
		);
		expect(Reflect.ownKeys(identity)).toEqual([
			"userAgent",
			"language",
			"languages",
			"acceptLanguage",
		]);
		const parsed = JSON.parse(serialized);
		expect(() => headers(undefined, parsed)).toThrow(TypeError);
		const reconstructed = createBrowserIdentity({
			languages: parsed.languages,
		});
		expect(reconstructed).toEqual(identity);
		expect(headers(undefined, reconstructed)["Accept-Language"]).toBe(
			"fr, en;q=0.9",
		);
	});
});

describe("native identity request defaults", () => {
	it("returns fresh frozen own-data headers for absent or empty input", () => {
		const first = headers(undefined);
		expect(first).toEqual({
			"User-Agent": "AgentBrowser/0.1",
			"Accept-Language": "en-US",
		});
		for (const input of [{}, Object.create(null)]) {
			const result = headers(input);
			expect(result).toEqual(first);
			expect(result).not.toBe(first);
			expect(Object.isFrozen(result)).toBe(true);
			expect(Object.getPrototypeOf(result)).toBeNull();
			for (const key of Reflect.ownKeys(result)) {
				expect(typeof key).toBe("string");
				expect(Object.getOwnPropertyDescriptor(result, key)).toMatchObject({
					enumerable: true,
					writable: false,
					configurable: false,
				});
			}
		}
	});

	it("preserves explicit casing and values even when they differ from the profile", () => {
		const input = Object.freeze({
			"uSeR-aGeNt": "Explicit/2",
			"accept-LANGUAGE": "",
			"X-Custom": " preserved ",
		});
		const result = headers(input);
		expect(result).toEqual(input);
		expect(Object.keys(result)).toEqual(Object.keys(input));
		expect(result).not.toBe(input);
		expect(defaultBrowserIdentity.userAgent).toBe("AgentBrowser/0.1");
	});

	it("copies hidden own data and does not mutate input or fabricate transport headers", () => {
		const input = Object.defineProperty({ "User-Agent": "Override" }, "X-Own", {
			value: "value",
		});
		const result = headers(input);
		input["User-Agent"] = "Changed";
		expect(result).toEqual({
			"User-Agent": "Override",
			"X-Own": "value",
			"Accept-Language": "en-US",
		});
		expect(Object.hasOwn(input, "Accept-Language")).toBe(false);
		expect(headers({ "accept-language": "fr" })).toEqual({
			"accept-language": "fr",
			"User-Agent": "AgentBrowser/0.1",
		});
	});

	it.each([
		null,
		[],
		"headers",
		new Map(),
		Object.create({ "User-Agent": "inherited" }),
		{ "User-Agent": "one", "user-agent": "two" },
		{ "Accept-Language": "en", "ACCEPT-LANGUAGE": "fr" },
		{ "X-Test": "same", "x-test": "same" },
		{ [Symbol("header")]: "value" },
		{ "": "value" },
		{ "X\rInjected": "value" },
		{ "X\nInjected": "value" },
		{ "X\0Injected": "value" },
		{ Test: "value\rInjected" },
		{ Test: "value\nInjected" },
		{ Test: "value\0Injected" },
		{ Test: undefined },
		{ Test: null },
		{ Test: 42 },
		{ Test: new String("value") },
	])("rejects hostile or unsupported header input %#", (input) => {
		expect(() => headers(input)).toThrow(TypeError);
	});

	it("never invokes header accessors or unbranded identity getters", () => {
		const getter = vi.fn(() => "secret");
		expect(() =>
			headers(Object.defineProperty({}, "Test", { get: getter })),
		).toThrow(TypeError);
		for (const identity of [
			null,
			undefined,
			42,
			{},
			Object.freeze({ ...defaultBrowserIdentity }),
			Object.defineProperty({}, "userAgent", { get: getter }),
			new Proxy(defaultBrowserIdentity, { get: getter }),
		]) {
			if (identity === undefined)
				expect(() => browserIdentityHeaders(identity as never)).toThrow(
					TypeError,
				);
			else expect(() => headers(undefined, identity)).toThrow(TypeError);
		}
		expect(getter).not.toHaveBeenCalled();
	});

	it("handles pollution-looking own header names without prototype mutation", () => {
		const result = headers(
			JSON.parse('{"__proto__":"data","constructor":"data"}'),
		);
		expect(Object.getPrototypeOf(result)).toBeNull();
		expect(Object.hasOwn(result, "__proto__")).toBe(true);
		expect(result.__proto__).toBe("data");
	});

	it("bounds final header count including defaults before reading oversized records", () => {
		const input = Object.fromEntries(
			Array.from(
				{ length: browserIdentityLimits.headerCount - 2 },
				(_, index) => [`X-${index}`, ""],
			),
		);
		expect(Object.keys(headers(input))).toHaveLength(
			browserIdentityLimits.headerCount,
		);
		expect(() => headers({ ...input, Extra: "" })).toThrow(TypeError);
		expect(
			Object.keys(
				headers({ ...input, "User-Agent": "", "Accept-Language": "" }),
			),
		).toHaveLength(browserIdentityLimits.headerCount);
		const getter = vi.fn();
		const oversized = Object.fromEntries(
			Array.from({ length: browserIdentityLimits.headerCount }, (_, index) => [
				`X-${index}`,
				"",
			]),
		);
		Object.defineProperty(oversized, "Hidden", { get: getter });
		expect(() => headers(oversized)).toThrow(TypeError);
		expect(getter).not.toHaveBeenCalled();
	});

	it("bounds UTF-8 header bytes including names, framing and defaults", () => {
		const defaults = headers(undefined);
		const defaultBytes = Object.entries(defaults).reduce(
			(total, [name, value]) => total + name.length + value.length + 4,
			0,
		);
		const available = browserIdentityLimits.headerBytes - defaultBytes - 5;
		expect(headers({ X: "a".repeat(available) }).X).toHaveLength(available);
		expect(() => headers({ X: "a".repeat(available + 1) })).toThrow(TypeError);
		const unicode =
			"😀".repeat(Math.floor(available / 4)) + "a".repeat(available % 4);
		expect(headers({ X: unicode }).X).toBe(unicode);
		expect(() => headers({ X: `${unicode}a` })).toThrow(TypeError);
		expect(() =>
			headers({ X: "a".repeat(browserIdentityLimits.headerBytes) }),
		).toThrow(TypeError);
		expect(() =>
			headers({ ["X".repeat(browserIdentityLimits.headerBytes)]: "" }),
		).toThrow(TypeError);
	});
});
