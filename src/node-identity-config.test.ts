import { describe, expect, it, vi } from "vitest";
import { browserIdentityLimits } from "./browser-identity.js";
import {
	identityFromEnvironment,
	maxLanguagesEnvironmentCodeUnits,
	sessionIdentityOptions,
} from "./node-identity-config.js";

describe("pure identity configuration; no runtime or process probes", () => {
	it("uses explicit defaults and exports only frozen language options", () => {
		for (const value of [undefined, {}, { languages: undefined }]) {
			const options = sessionIdentityOptions(value);
			expect(options).toEqual({ languages: ["en-US"] });
			expect(Object.isFrozen(options)).toBe(true);
			expect(Object.isFrozen(options.languages)).toBe(true);
		}
		expect(identityFromEnvironment(undefined)).toEqual({
			languages: ["en-US"],
		});
	});

	it("canonicalizes and detaches preferences without mutating the caller", () => {
		const languages = ["pl-pl", "en-us", "iw"];
		const options = sessionIdentityOptions({ languages });
		expect(languages).toEqual(["pl-pl", "en-us", "iw"]);
		expect(options).toEqual({ languages: ["pl-PL", "en-US", "he"] });
		expect(options.languages).not.toBe(languages);
		languages[0] = "fr";
		expect(options.languages?.[0]).toBe("pl-PL");
	});

	it("accepts strict JSON with whitespace and escaped tags", () => {
		expect(identityFromEnvironment(' ["pl-pl", "\\u0065n-us"] \n')).toEqual({
			languages: ["pl-PL", "en-US"],
		});
	});

	it.each([
		"",
		" ",
		"null",
		"true",
		"1",
		'"en-US"',
		"{}",
		'{"languages":["en-US"]}',
		"[]",
		'["en-US",]',
		'["en-US"] trailing',
		"['en-US']",
		'[/*comment*/"en-US"]',
		'["en-US", "en-us"]',
		'["iw", "he"]',
		'["en_US"]',
		'["en-US\\r\\nInjected"]',
		"[null]",
		"[1]",
	])("rejects malformed or invalid JSON languages: %s", (value) => {
		expect(() => identityFromEnvironment(value)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
	});

	it("bounds the raw environment before parsing and the parsed language list", () => {
		const boundary = '["en-US"]'.padEnd(maxLanguagesEnvironmentCodeUnits);
		expect(identityFromEnvironment(boundary)).toEqual({ languages: ["en-US"] });
		expect(() => identityFromEnvironment(`${boundary} `)).toThrowError(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(() =>
			identityFromEnvironment(
				JSON.stringify([
					"a".repeat(browserIdentityLimits.languageTagCodeUnits + 1),
				]),
			),
		).toThrow();
		const languages = [
			"en",
			"pl",
			"fr",
			"de",
			"es",
			"it",
			"pt",
			"nl",
			"ja",
			"ko",
		];
		expect(sessionIdentityOptions({ languages }).languages).toHaveLength(10);
		expect(() =>
			identityFromEnvironment(JSON.stringify([...languages, "zh"])),
		).toThrow();
	});

	it("rejects accessors without invoking them, sparse/decorated arrays and spoofing", () => {
		const getter = vi.fn(() => ["en-US"]);
		const accessorOptions = Object.defineProperty({}, "languages", {
			get: getter,
		});
		const accessorArray = Object.defineProperty(["en-US"], "0", {
			get: getter,
		});
		const decorated = Object.assign(["en-US"], { extra: true });
		const symbolic = Object.assign(["en-US"], { [Symbol("extra")]: true });
		for (const value of [
			null,
			[],
			{ userAgent: "Chrome" },
			{ languages: ["en-US"], userAgent: "Chrome" },
			Object.create({ languages: ["en-US"] }),
			accessorOptions,
			{ languages: accessorArray },
			{ languages: new Array(1) },
			{ languages: decorated },
			{ languages: symbolic },
			{ languages: [""] },
			{ languages: ["en-US", "en-us"] },
		]) {
			expect(() => sessionIdentityOptions(value)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(getter).not.toHaveBeenCalled();
	});
});
