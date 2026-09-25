import { describe, expect, it } from "vitest";
import { pageAtob, pageBtoa, pageBase64Limits } from "./page-base64.js";

describe("HTML binary-string base64", () => {
	it.each([
		["", ""],
		["f", "Zg=="],
		["fo", "Zm8="],
		["foo", "Zm9v"],
		["foob", "Zm9vYg=="],
		["fooba", "Zm9vYmE="],
		["foobar", "Zm9vYmFy"],
		["\0\xff\x80", "AP+A"],
		["\xff\xff", "//8="],
	])("encodes and decodes %j", (plain, encoded) => {
		expect(pageBtoa(plain)).toBe(encoded);
		expect(pageAtob(encoded)).toBe(plain);
	});

	it.each(["Zg", "Zh", "Zg==", "Zh==", " Z\tg\n=\f=\r "])(
		"accepts forgiving encoding %j",
		(encoded) => {
			expect(pageAtob(encoded)).toBe("f");
		},
	);

	it.each(["Zm8", "Zm9", "Zm+", "Zm/", "Zm8=", "Zm9=", "Zm+=", "Zm/="])(
		"discards unused bits in %j",
		(encoded) => {
			expect(pageAtob(encoded)).toBe("fo");
		},
	);

	it.each([
		"=",
		"==",
		"===",
		"====",
		"A",
		"A=",
		"A===",
		"AA=",
		"AA===",
		"A=A=",
		"AAAA=",
		"AA-_",
		"Zg\v==",
		"Zg\u00a0==",
		"Zg\u2003==",
		"Zg\ufeff==",
		"ＡＡ==",
		"😀",
	])("rejects invalid encoding %j", (encoded) => {
		expect(() => pageAtob(encoded)).toThrow(DOMException);
		try {
			pageAtob(encoded);
		} catch (error) {
			expect(error).toMatchObject({ name: "InvalidCharacterError", code: 5 });
		}
	});

	it.each(["\u0100", "🌊", "\ud800", "\udfff", "prefix\u20ac"])(
		"does not silently UTF-8 encode %j",
		(input) => {
			expect(() => pageBtoa(input)).toThrow(DOMException);
		},
	);

	it("accepts ASCII whitespace alone", () => {
		expect(pageAtob("\t\n\f\r ")).toBe("");
	});

	it("matches the native oracle across every byte and deterministic lengths", () => {
		for (let length = 0; length <= 513; length++) {
			const plain = Array.from({ length }, (_, index) =>
				String.fromCharCode((index * 73 + length) & 255),
			).join("");
			const encoded = globalThis.btoa(plain);
			expect(pageBtoa(plain)).toBe(encoded);
			expect(pageAtob(encoded)).toBe(globalThis.atob(encoded));
			expect(pageAtob(encoded.replace(/=/g, ""))).toBe(plain);
		}
	});

	it("matches all two-sextet strings, including noncanonical padding bits", () => {
		const alphabet =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		for (const first of alphabet)
			for (const second of alphabet) {
				const encoded = first + second;
				expect(pageAtob(encoded)).toBe(globalThis.atob(encoded));
				expect(pageAtob(`${encoded}==`)).toBe(globalThis.atob(encoded));
			}
	});

	it.each([
		undefined,
		null,
		true,
		false,
		123,
		-0,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		123n,
	])("converts primitive input %s", (input) => {
		expect(pageBtoa(input)).toBe(globalThis.btoa(String(input)));
		const encoded = pageBtoa(input);
		expect(pageAtob(encoded)).toBe(String(input));
	});

	it("requires an argument but ignores extra arguments", () => {
		expect(() => pageAtob()).toThrow(TypeError);
		expect(() => pageBtoa()).toThrow(TypeError);
		expect(pageAtob("Zg==", "ignored")).toBe("f");
		expect(pageBtoa("f", "ignored")).toBe("Zg==");
	});

	it.each([null, true, 123, Number.NaN, Number.POSITIVE_INFINITY])(
		"decodes converted primitive %s",
		(input) => {
			expect(pageAtob(input)).toBe(globalThis.atob(String(input)));
		},
	);

	it.each([undefined, false, -0])(
		"rejects invalid converted primitive %s",
		(input) => {
			expect(() => pageAtob(input)).toThrow(DOMException);
			expect(() => globalThis.atob(String(input))).toThrow(DOMException);
		},
	);

	it("rejects symbols and does not invoke host object conversion hooks", () => {
		let converted = false;
		const input = {
			toString() {
				converted = true;
				return "f";
			},
		};
		for (const operation of [pageAtob, pageBtoa]) {
			expect(() => operation(Symbol("x"))).toThrow(TypeError);
			expect(() => operation(input)).toThrow(/conversion is not implemented/);
		}
		expect(converted).toBe(false);
	});

	it("bounds input before whitespace removal and output before allocation", () => {
		const maximumPlain = "a".repeat((pageBase64Limits.outputCodeUnits / 4) * 3);
		const encoded = pageBtoa(maximumPlain);
		expect(encoded.length).toBe(pageBase64Limits.outputCodeUnits);
		expect(encoded).toBe(globalThis.btoa(maximumPlain));
		expect(pageAtob(encoded)).toBe(maximumPlain);
		expect(() => pageBtoa(`${maximumPlain}a`)).toThrow(/output exceeds/);
		for (const operation of [pageAtob, pageBtoa])
			expect(() =>
				operation(" ".repeat(pageBase64Limits.inputCodeUnits + 1)),
			).toThrow(/input exceeds/);
		expect(pageAtob(" ".repeat(pageBase64Limits.inputCodeUnits))).toBe("");
	});
});
