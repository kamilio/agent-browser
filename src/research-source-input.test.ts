import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
	type ResearchHtmlSourceIdentity,
	admitResearchHtmlSource,
} from "../scripts/research-source-input.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { htmlEncoding } from "./html-encoding.js";
import { type NetworkResponse, decodeResponseText } from "./network.js";
import { loadResearchDocument, researchReaderInfo } from "./research-loader.js";
import { resourceLimitDiagnostic } from "./resource-limit.js";

const finalUrl = "https://research.example/source.html";
const privateSentinel = "SYNTHETIC_SOURCE_INPUT_PRIVATE";
const encoder = new TextEncoder();
const maximum = 4_000_000;
const inputFields = ["finalUrl", "contentType", "body"] as const;

function fixture(
	body: Uint8Array = encoder.encode("<h1>Source</h1>"),
	contentType = "text/html; charset=utf-8",
) {
	return { finalUrl, contentType, body };
}

function admit(input: unknown, checkpoint: () => void = () => undefined) {
	return admitResearchHtmlSource(input, maximum, maximum, checkpoint);
}

function sha256(bytes: Uint8Array) {
	return createHash("sha256").update(bytes).digest("hex");
}

function failure(action: () => unknown, code: ErrorCode = "invalid-input") {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(AgentBrowserError);
		if (!(error instanceof AgentBrowserError)) throw error;
		expect(error.code).toBe(code);
		expect(error.message).not.toContain(privateSentinel);
		expect(Object.hasOwn(error, "cause")).toBe(false);
		return error;
	}
	throw new Error("Expected synthetic source admission failure");
}

function identityFor(
	body: Uint8Array,
	text: string,
	contentType: string,
	encoding: string,
	bomConsumed = false,
): ResearchHtmlSourceIdentity {
	return {
		kind: "decoded-html-source-v1",
		reportedFinalUrl: finalUrl,
		contentType,
		bytes: { length: body.byteLength, sha256: sha256(body) },
		decoder: {
			policy: "native-research-html-v1",
			encoding,
			bomConsumed,
		},
		text: {
			codeUnits: text.length,
			sha256: sha256(encoder.encode(text)),
			digestEncoding: "utf-8",
			coordinates: "decoder-output-utf16-before-parser-normalization",
		},
	};
}

function utf16(text: string, bigEndian: boolean, bom = true) {
	const prefix = bom ? 2 : 0;
	const bytes = new Uint8Array(prefix + text.length * 2);
	if (bom) {
		bytes[0] = bigEndian ? 0xfe : 0xff;
		bytes[1] = bigEndian ? 0xff : 0xfe;
	}
	for (let index = 0; index < text.length; index++) {
		const unit = text.charCodeAt(index);
		bytes[prefix + index * 2] = bigEndian ? unit >>> 8 : unit & 255;
		bytes[prefix + index * 2 + 1] = bigEndian ? unit & 255 : unit >>> 8;
	}
	return bytes;
}

it("returns exact immutable identities with known empty and abc SHA256 values", () => {
	for (const [text, digest] of [
		["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
		["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
	]) {
		const input = fixture(encoder.encode(text));
		const result = admit(input);
		expect(result).toEqual({
			text,
			identity: identityFor(input.body, text, input.contentType, "utf-8"),
		});
		expect(result.identity.bytes.sha256).toBe(digest);
		expect(result.identity.text.sha256).toBe(digest);
		for (const record of [
			result,
			result.identity,
			result.identity.bytes,
			result.identity.decoder,
			result.identity.text,
		]) {
			expect(Object.isFrozen(record)).toBe(true);
			expect(Reflect.set(record, "extra", privateSentinel)).toBe(false);
		}
		expect(Reflect.set(result.identity.bytes, "length", 999)).toBe(false);
		expect(Reflect.set(result.identity.decoder, "encoding", "other")).toBe(
			false,
		);
		expect(Reflect.set(result.identity.text, "sha256", "other")).toBe(false);
		expect(Reflect.ownKeys(result).sort()).toEqual(["identity", "text"]);
		expect(Object.hasOwn(result.identity, "body")).toBe(false);
		expect(Object.hasOwn(result.identity.decoder, "replacementCount")).toBe(
			false,
		);
	}
});

it("accepts frozen, null-prototype, reordered and nonenumerable own-data records", () => {
	const input = fixture();
	const hidden = Object.create(null);
	for (const field of inputFields)
		Object.defineProperty(hidden, field, { value: input[field] });
	for (const record of [
		Object.freeze({ ...input }),
		Object.assign(Object.create(null), input),
		{ body: input.body, contentType: input.contentType, finalUrl },
		hidden,
	])
		expect(admit(record)).toEqual(admit(input));
});

const invalidCaps: readonly (readonly [string, unknown])[] = [
	["zero", 0],
	["negative", -1],
	["fraction", 1.5],
	["NaN", Number.NaN],
	["positive infinity", Number.POSITIVE_INFINITY],
	["negative infinity", Number.NEGATIVE_INFINITY],
	["above maximum", 4_000_001],
	["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
	["undefined", undefined],
	["null", null],
	["boolean", true],
	["string", "1"],
	["boxed number", new Number(1)],
	["bigint", 1n],
	["symbol", Symbol("limit")],
];

it.each(invalidCaps)(
	"validates both caps before input inspection: %s",
	(_name, cap) => {
		let calls = 0;
		const trap = () => {
			calls++;
			throw new Error(privateSentinel);
		};
		const input = new Proxy(fixture(), {
			get: trap,
			getPrototypeOf: trap,
			ownKeys: trap,
			getOwnPropertyDescriptor: trap,
		});
		for (const [byteCap, textCap] of [
			[cap, maximum],
			[maximum, cap],
		]) {
			const error = failure(() =>
				admitResearchHtmlSource(
					input,
					byteCap as number,
					textCap as number,
					() => undefined,
				),
			);
			expect(resourceLimitDiagnostic(error)).toBeUndefined();
		}
		expect(calls).toBe(0);
	},
);

it("does not coerce hostile cap objects", () => {
	let calls = 0;
	const cap = {
		[Symbol.toPrimitive]() {
			calls++;
			throw new Error(privateSentinel);
		},
	};
	for (const limits of [
		[cap, maximum],
		[maximum, cap],
	])
		failure(() =>
			admitResearchHtmlSource(
				fixture(),
				limits[0] as number,
				limits[1] as number,
				() => undefined,
			),
		);
	expect(calls).toBe(0);
});

it("admits exact byte and decoded limits and rejects one less with trusted diagnostics", () => {
	const body = encoder.encode("é😀");
	const input = fixture(body);
	expect(admitResearchHtmlSource(input, 6, 3, () => undefined).text).toBe(
		"é😀",
	);
	const byteError = failure(
		() => admitResearchHtmlSource(input, 5, 3, () => undefined),
		"resource-limit",
	);
	expect(resourceLimitDiagnostic(byteError)).toEqual({
		kind: "source.input",
		unit: "bytes",
		limit: 5,
		observed: 6,
	});
	const textError = failure(
		() => admitResearchHtmlSource(input, 6, 2, () => undefined),
		"resource-limit",
	);
	expect(resourceLimitDiagnostic(textError)).toEqual({
		kind: "source.decoded",
		unit: "code-units",
		limit: 2,
		observed: 3,
	});
	expect(
		admitResearchHtmlSource(fixture(Uint8Array.of(97)), 1, 1, () => undefined)
			.text,
	).toBe("a");
});

it("enforces the input byte cap before sniffing or unsupported charset decoding", () => {
	const input = fixture(
		encoder.encode("abc"),
		`text/html; charset=${privateSentinel}`,
	);
	const error = failure(
		() => admitResearchHtmlSource(input, 2, maximum, () => undefined),
		"resource-limit",
	);
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "source.input",
		unit: "bytes",
		limit: 2,
		observed: 3,
	});
});

it("validates the decoded cap before admitting an oversized or undecodable input", () => {
	const input = fixture(
		encoder.encode("abc"),
		`text/html; charset=${privateSentinel}`,
	);
	const error = failure(() =>
		admitResearchHtmlSource(input, 1, 0, () => undefined),
	);
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it("admits the exact four-million-byte ceiling and rejects its immediate successor", () => {
	const backing = new Uint8Array(maximum + 1).fill(97);
	const exact = backing.subarray(0, maximum);
	const result = admit(fixture(exact));
	expect(result.text.length).toBe(maximum);
	expect(result.identity.bytes).toEqual({
		length: maximum,
		sha256: sha256(exact),
	});
	expect(result.identity.text.codeUnits).toBe(maximum);
	expect(result.identity.text.sha256).toBe(result.identity.bytes.sha256);
	const error = failure(() => admit(fixture(backing)), "resource-limit");
	expect(resourceLimitDiagnostic(error)).toEqual({
		kind: "source.input",
		unit: "bytes",
		limit: maximum,
		observed: maximum + 1,
	});
});

it.each(inputFields)(
	"rejects missing, inherited and accessor input field %s",
	(field) => {
		const input = fixture();
		const incomplete: Partial<typeof input> = { ...input };
		delete incomplete[field];
		failure(() => admit(incomplete));
		failure(() => admit(Object.assign(Object.create(input), incomplete)));
		let calls = 0;
		for (const enumerable of [false, true]) {
			const accessor = Object.defineProperty({ ...input }, field, {
				enumerable,
				get() {
					calls++;
					throw new Error(privateSentinel);
				},
			});
			failure(() => admit(accessor));
			failure(() =>
				admit(
					Object.defineProperty({ ...input }, field, {
						enumerable,
						set() {
							calls++;
						},
					}),
				),
			);
		}
		expect(calls).toBe(0);
	},
);

it("rejects extra own strings, symbols and accessors without invoking them", () => {
	let calls = 0;
	for (const key of ["extra", "admission", "toJSON", Symbol("extra")]) {
		for (const enumerable of [true, false]) {
			failure(() =>
				admit(
					Object.defineProperty(fixture(), key, {
						value: privateSentinel,
						enumerable,
					}),
				),
			);
			failure(() =>
				admit(
					Object.defineProperty(fixture(), key, {
						enumerable,
						get() {
							calls++;
							throw new Error(privateSentinel);
						},
					}),
				),
			);
		}
	}
	expect(calls).toBe(0);
});

it("rejects nonrecords, exotic prototypes and old capture envelopes", () => {
	for (const input of [
		undefined,
		null,
		true,
		1,
		"html",
		[],
		() => fixture(),
		new Date(0),
		new String("html"),
		Object.create(fixture()),
		Object.assign(Object.create({ extra: true }), fixture()),
		{ encoding: "base64", decodedBytes: 3, sha256: "unused", data: "YWJj" },
		{ ...fixture(), bodyCapture: { encoding: "base64", data: "YWJj" } },
	])
		failure(() => admit(input));
});

it("rejects live and revoked proxy records and proxy prototypes without traps", () => {
	let calls = 0;
	const trap = () => {
		calls++;
		throw new Error(privateSentinel);
	};
	const proxy = new Proxy(fixture(), {
		get: trap,
		getPrototypeOf: trap,
		ownKeys: trap,
		getOwnPropertyDescriptor: trap,
	});
	const revoked = Proxy.revocable(fixture(), {});
	revoked.revoke();
	for (const input of [
		proxy,
		revoked.proxy,
		Object.assign(Object.create(proxy), fixture()),
	])
		failure(() => admit(input));
	expect(calls).toBe(0);
});

it.each(["finalUrl", "contentType"] as const)(
	"does not coerce metadata field %s",
	(field) => {
		let calls = 0;
		const hostile = {
			[Symbol.toPrimitive]() {
				calls++;
				throw new Error(privateSentinel);
			},
			toString() {
				calls++;
				throw new Error(privateSentinel);
			},
		};
		for (const value of [
			undefined,
			null,
			false,
			1,
			[],
			new String(fixture()[field]),
			hostile,
		])
			failure(() => admit({ ...fixture(), [field]: value }));
		expect(calls).toBe(0);
	},
);

it.each([
	"https://research.example",
	"HTTPS://research.example/",
	"https://RESEARCH.example/",
	"https://research.example:443/",
	"https://research.example/one/../two",
	" https://research.example/",
	"https://research.example/ ",
	"https://research.example/#fragment",
	"https://research.example/#",
	"https://user:secret@research.example/",
	"https://research.example/\npath",
	"https://research.example/\u0000path",
	"https://research.example/\u007fpath",
	"https://research.example/\u0085path",
	"file:///tmp/source.html",
	"data:text/html,source",
	"/source.html",
	"not-a-url",
])("rejects noncanonical or forbidden reported URL %j", (reportedFinalUrl) => {
	failure(() => admit({ ...fixture(), finalUrl: reportedFinalUrl }));
});

it.each([
	"http://localhost/",
	"http://127.0.0.1/",
	"http://10.0.0.1/",
	"http://[::1]/",
	"https://research.example:8443/source?version=one",
])(
	"treats reported URL as identity, not transport authorization: %s",
	(reportedFinalUrl) => {
		const result = admit({ ...fixture(), finalUrl: reportedFinalUrl });
		expect(result.identity.reportedFinalUrl).toBe(reportedFinalUrl);
	},
);

it("enforces exact URL and MIME code-unit boundaries without truncation", () => {
	const prefix = "https://research.example/";
	const admittedUrl = prefix + "a".repeat(8192 - prefix.length);
	const mimePrefix = "text/html; note=";
	const admittedMime = mimePrefix + "a".repeat(1024 - mimePrefix.length);
	const input = {
		...fixture(),
		finalUrl: admittedUrl,
		contentType: admittedMime,
	};
	const result = admit(input);
	expect(result.identity.reportedFinalUrl).toBe(admittedUrl);
	expect(result.identity.contentType).toBe(admittedMime);
	failure(() => admit({ ...input, finalUrl: `${admittedUrl}a` }));
	failure(() => admit({ ...input, contentType: `${admittedMime}a` }));
});

it.each([
	"",
	"text/plain",
	"application/xhtml+xml",
	"application/json",
	"text/htmlx",
	"text/html,text/html",
	"text/html, application/json",
	"text/html\r\nX: value",
	"text/html\u0000",
	"text/html\t",
	"text/html\u007f",
	"text/html\u0085",
])("rejects unsupported or ambiguous MIME metadata %j", (contentType) => {
	failure(() => admit(fixture(undefined, contentType)));
});

it("preserves exact admitted MIME spelling while reporting canonical decoder encoding", () => {
	const contentType = 'Text/HTML; Charset="UTF-8"; note=synthetic';
	const input = fixture(encoder.encode("é"), contentType);
	const result = admit(input);
	expect(result.identity.contentType).toBe(contentType);
	expect(result.identity.decoder.encoding).toBe("utf-8");
	expect(result.text).toBe("é");
	failure(() => admit({ ...input, contentType: [contentType] }));
});

it("keeps malformed-input and unsupported-encoding messages static and private", () => {
	const first = failure(() =>
		admit({ ...fixture(), finalUrl: `file:///${privateSentinel}` }),
	);
	const second = failure(() =>
		admit({ ...fixture(), finalUrl: "file:///different" }),
	);
	expect(first.message).toBe(second.message);
	const unsupported = failure(
		() => admit(fixture(undefined, `text/html; charset=${privateSentinel}`)),
		"unsupported",
	);
	expect(unsupported.message).toBe(
		failure(
			() =>
				admit(
					fixture(undefined, "text/html; charset=synthetic-unknown-charset"),
				),
			"unsupported",
		).message,
	);
	expect(resourceLimitDiagnostic(unsupported)).toBeUndefined();
});

it("rejects non-Uint8Array bodies, shared storage, detached storage and byte proxies", () => {
	const source = Uint8Array.of(97);
	const detached = Uint8Array.of(97);
	structuredClone(detached.buffer, { transfer: [detached.buffer] });
	const revoked = Proxy.revocable(source, {});
	revoked.revoke();
	let calls = 0;
	const trap = () => {
		calls++;
		throw new Error(privateSentinel);
	};
	for (const body of [
		null,
		undefined,
		"YWJj",
		[97],
		{},
		source.buffer,
		new DataView(source.buffer),
		new Int8Array(1),
		new Uint16Array(1),
		new Uint8ClampedArray(1),
		new Uint8Array(new SharedArrayBuffer(1)),
		detached,
		Object.create(Uint8Array.prototype),
		{
			[Symbol.toStringTag]: "Uint8Array",
			get buffer() {
				return trap();
			},
		},
		new Proxy(source, { get: trap, getPrototypeOf: trap, ownKeys: trap }),
		revoked.proxy,
	])
		failure(() => admit({ ...fixture(), body }));
	expect(calls).toBe(0);
});

it("owns only the actual view and ignores poisoned properties, iteration and methods", () => {
	const backing = Uint8Array.of(120, 97, 98, 99, 121);
	const body = backing.subarray(1, 4);
	let calls = 0;
	for (const property of [
		"buffer",
		"byteLength",
		"byteOffset",
		"length",
		"constructor",
		"slice",
		"subarray",
		"values",
		"entries",
		"toString",
		Symbol.iterator,
		Symbol.toStringTag,
	])
		Object.defineProperty(body, property, {
			get() {
				calls++;
				throw new Error(privateSentinel);
			},
		});
	const result = admit(fixture(body));
	expect(result.text).toBe("abc");
	expect(result.identity).toEqual(
		identityFor(
			Uint8Array.of(97, 98, 99),
			"abc",
			fixture().contentType,
			"utf-8",
		),
	);
	expect([...backing]).toEqual([120, 97, 98, 99, 121]);
	expect(calls).toBe(0);
	backing.fill(122);
	expect(result.text).toBe("abc");
	expect(result.identity.bytes.sha256).toBe(
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
});

it("snapshots a valid nonzero-offset view over a resized ordinary ArrayBuffer", () => {
	type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
	const ResizableArrayBuffer = ArrayBuffer as unknown as new (
		length: number,
		options: { maxByteLength: number },
	) => ResizableBuffer;
	const backing = new ResizableArrayBuffer(8, { maxByteLength: 16 });
	new Uint8Array(backing).fill(120);
	const body = new Uint8Array(backing, 2, 3);
	body.set([97, 98, 99]);
	backing.resize(6);
	expect(body.byteOffset).toBe(2);
	expect(body.byteLength).toBe(3);
	const input = fixture(body);
	const result = admit(input);
	const expectedIdentity = identityFor(
		Uint8Array.of(97, 98, 99),
		"abc",
		input.contentType,
		"utf-8",
	);
	expect(result).toEqual({ text: "abc", identity: expectedIdentity });
	backing.resize(0);
	expect(result).toEqual({ text: "abc", identity: expectedIdentity });
});

it("rejects an out-of-bounds resizable view instead of admitting an empty identity", () => {
	type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
	const ResizableArrayBuffer = ArrayBuffer as unknown as new (
		length: number,
		options: { maxByteLength: number },
	) => ResizableBuffer;
	const backing = new ResizableArrayBuffer(8, { maxByteLength: 16 });
	const body = new Uint8Array(backing, 4, 3);
	body.set([97, 98, 99]);
	backing.resize(2);
	expect(backing.byteLength).toBe(2);
	expect(new Uint8Array(backing).byteLength).toBe(2);
	expect(body.byteOffset).toBe(0);
	expect(body.byteLength).toBe(0);
	const error = failure(() => admit(fixture(body)));
	expect(resourceLimitDiagnostic(error)).toBeUndefined();
});

it("does not consult caller species when snapshotting an ordinary byte view", () => {
	const body = encoder.encode("abc");
	let calls = 0;
	Object.defineProperty(body, "constructor", {
		value: {
			get [Symbol.species]() {
				calls++;
				throw new Error(privateSentinel);
			},
		},
	});
	expect(admit(fixture(body)).text).toBe("abc");
	expect(calls).toBe(0);
});

it("keeps byte and decoded identities coherent across alias mutation at every checkpoint", () => {
	let checkpoints = 0;
	admit(fixture(encoder.encode("abc")), () => checkpoints++);
	expect(checkpoints).toBeGreaterThanOrEqual(5);
	for (let target = 1; target <= checkpoints; target++) {
		const body = encoder.encode("abc");
		let current = 0;
		const result = admit(fixture(body), () => {
			if (++current === target) body.set(encoder.encode("xyz"));
		});
		expect(["abc", "xyz"]).toContain(result.text);
		expect(result.identity).toEqual(
			identityFor(
				encoder.encode(result.text),
				result.text,
				fixture().contentType,
				"utf-8",
			),
		);
		if (target === checkpoints) expect(result.text).toBe("abc");
	}
});

it("keeps owned bytes and metadata after caller detachment at the final checkpoint", () => {
	let checkpoints = 0;
	admit(fixture(), () => checkpoints++);
	const input = fixture();
	const expected = admit(input);
	let current = 0;
	const result = admit(input, () => {
		if (++current !== checkpoints) return;
		structuredClone(input.body.buffer, { transfer: [input.body.buffer] });
		input.finalUrl = "https://changed.example/";
		input.contentType = "text/plain";
	});
	expect(input.body.byteLength).toBe(0);
	expect(result).toEqual(expected);
});

it("preserves exact trusted checkpoint failures at every admission phase and before success", () => {
	let checkpoints = 0;
	admit(fixture(), () => checkpoints++);
	expect(checkpoints).toBeGreaterThanOrEqual(5);
	for (let target = 1; target <= checkpoints; target++) {
		const sentinel = new Error(`Synthetic checkpoint ${target}`);
		let current = 0;
		let caught: unknown;
		try {
			admit(fixture(), () => {
				if (++current === target) throw sentinel;
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(sentinel);
		expect(current).toBe(target);
	}
});

it("does not wrap non-Error exceptions from trusted checkpoints", () => {
	for (const sentinel of [
		null,
		undefined,
		Symbol("checkpoint"),
		privateSentinel,
	]) {
		let thrown = false;
		let caught: unknown;
		try {
			admit(fixture(), () => {
				throw sentinel;
			});
		} catch (error) {
			thrown = true;
			caught = error;
		}
		expect(thrown).toBe(true);
		expect(caught).toBe(sentinel);
	}
});

interface DecodeCase {
	name: string;
	body: Uint8Array;
	contentType: string;
	text: string;
	encoding: string;
	bomConsumed: boolean;
}

const decoderCases: DecodeCase[] = [
	{
		name: "native windows-1252 fallback and C1 mapping",
		body: Uint8Array.of(0x80, 0x81, 0x91, 0x9f, 0xe9),
		contentType: "text/html",
		text: "€\u0081‘Ÿé",
		encoding: "windows-1252",
		bomConsumed: false,
	},
	{
		name: "header charset alias",
		body: Uint8Array.of(0x80, 0xe9),
		contentType: "text/html; charset=iso-8859-1",
		text: "€é",
		encoding: "windows-1252",
		bomConsumed: false,
	},
	{
		name: "UTF8 meta",
		body: encoder.encode("<meta charset=utf-8><h1>é😀</h1>"),
		contentType: "text/html",
		text: "<meta charset=utf-8><h1>é😀</h1>",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "http-equiv meta",
		body: encoder.encode(
			'<meta http-equiv="Content-Type" content="text/html; charset=utf-8">é',
		),
		contentType: "text/html",
		text: '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">é',
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "header wins over meta",
		body: encoder.encode("<meta charset=windows-1252>é"),
		contentType: "text/html; charset=utf-8",
		text: "<meta charset=windows-1252>é",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "UTF8 BOM wins over unsupported header and meta",
		body: Uint8Array.of(
			0xef,
			0xbb,
			0xbf,
			...encoder.encode("<meta charset=windows-1252>é"),
		),
		contentType: "text/html; charset=synthetic-unknown-charset",
		text: "<meta charset=windows-1252>é",
		encoding: "utf-8",
		bomConsumed: true,
	},
	{
		name: "UTF16LE BOM",
		body: utf16("<h1>é😀</h1>", false),
		contentType: "text/html; charset=utf-8",
		text: "<h1>é😀</h1>",
		encoding: "utf-16le",
		bomConsumed: true,
	},
	{
		name: "UTF16BE BOM",
		body: utf16("<h1>é😀</h1>", true),
		contentType: "text/html; charset=windows-1252",
		text: "<h1>é😀</h1>",
		encoding: "utf-16be",
		bomConsumed: true,
	},
	{
		name: "UTF16 header without BOM",
		body: utf16("<h1>Ω</h1>", false, false),
		contentType: "text/html; charset=utf-16le",
		text: "<h1>Ω</h1>",
		encoding: "utf-16le",
		bomConsumed: false,
	},
	{
		name: "meta UTF16 remaps to UTF8",
		body: encoder.encode("<meta charset=utf-16le>é"),
		contentType: "text/html",
		text: "<meta charset=utf-16le>é",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "unknown meta is ignored before a supported declaration",
		body: encoder.encode(
			"<meta charset=synthetic-unknown><meta charset=utf-8>é",
		),
		contentType: "text/html",
		text: "<meta charset=synthetic-unknown><meta charset=utf-8>é",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "nonfatal UTF8 replacement",
		body: Uint8Array.of(0xc3, 0x28, 0xff),
		contentType: "text/html; charset=utf-8",
		text: "�(�",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "nonfatal odd UTF16 byte",
		body: Uint8Array.of(0xff, 0xfe, 0x61, 0, 0x62),
		contentType: "text/html",
		text: "a�",
		encoding: "utf-16le",
		bomConsumed: true,
	},
	{
		name: "nonfatal unpaired UTF16 surrogate",
		body: utf16("\ud800", false),
		contentType: "text/html",
		text: "�",
		encoding: "utf-16le",
		bomConsumed: true,
	},
	{
		name: "incomplete UTF8 BOM is data",
		body: Uint8Array.of(0xef, 0xbb),
		contentType: "text/html; charset=utf-8",
		text: "�",
		encoding: "utf-8",
		bomConsumed: false,
	},
	{
		name: "only the leading BOM is consumed",
		body: Uint8Array.of(
			0xef,
			0xbb,
			0xbf,
			...encoder.encode("\ufeff<h1>Text</h1>"),
		),
		contentType: "text/html",
		text: "\ufeff<h1>Text</h1>",
		encoding: "utf-8",
		bomConsumed: true,
	},
];

it.each(decoderCases)(
	"matches actual native decoding and reader defaults: $name",
	(testCase) => {
		const response: NetworkResponse = {
			url: finalUrl,
			status: 200,
			headers: { "content-type": [testCase.contentType] },
			body: testCase.body,
			encodedBytes: testCase.body.byteLength,
			redirects: [],
			elapsedMs: 0,
		};
		const native = decodeResponseText(response, htmlEncoding(testCase.body));
		expect(native).toEqual({
			text: testCase.text,
			encoding: testCase.encoding,
		});
		const result = admit(fixture(testCase.body, testCase.contentType));
		expect(result).toEqual({
			text: native.text,
			identity: identityFor(
				testCase.body,
				testCase.text,
				testCase.contentType,
				testCase.encoding,
				testCase.bomConsumed,
			),
		});
		const tree = loadResearchDocument(response, {
			tabId: "synthetic-source-input",
			signal: new AbortController().signal,
			limits: {
				maxNodes: 50_000,
				maxDepth: 128,
				maxTextCodeUnits: 2_000_000,
				maxChanges: 1024,
			},
		});
		try {
			expect(researchReaderInfo(tree)?.encoding).toBe(
				result.identity.decoder.encoding,
			);
			expect(researchReaderInfo(tree)?.sourceCodeUnits).toBe(
				result.text.length,
			);
		} finally {
			tree.close();
		}
	},
);

it.each([
	"script",
	"style",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"title",
	"textarea",
])(
	"keeps charset-looking markup inside native raw %s out of sniffing",
	(tag) => {
		const text = `<${tag}><meta charset=utf-8></${tag}><h1>é</h1>`;
		const body = encoder.encode(text);
		expect(htmlEncoding(body)).toBe("windows-1252");
		expect(admit(fixture(body, "text/html")).text).toBe(
			text.replace("é", "Ã©"),
		);
		const later = encoder.encode(
			`<${tag}><meta charset=windows-1252></${tag}><meta charset=utf-8>é`,
		);
		expect(htmlEncoding(later)).toBe("utf-8");
		expect(admit(fixture(later, "text/html")).identity.decoder.encoding).toBe(
			"utf-8",
		);
	},
);

it("keeps comment charset markers out of native encoding sniffing", () => {
	const text = "<!-- <meta charset=utf-8> --><h1>é</h1>";
	const body = encoder.encode(text);
	expect(htmlEncoding(body)).toBe("windows-1252");
	expect(admit(fixture(body, "text/html")).text).toBe(text.replace("é", "Ã©"));
});

it("sniffs only the first 1024 bytes using native meta tokenization", () => {
	const meta = "<meta charset=utf-8>";
	const inside = `${" ".repeat(1024 - meta.length)}${meta}é`;
	const outside = `${" ".repeat(1024)}${meta}é`;
	expect(htmlEncoding(encoder.encode(inside))).toBe("utf-8");
	expect(admit(fixture(encoder.encode(inside), "text/html")).text).toBe(inside);
	expect(htmlEncoding(encoder.encode(outside))).toBe("windows-1252");
	expect(admit(fixture(encoder.encode(outside), "text/html")).text).toBe(
		outside.replace("é", "Ã©"),
	);
});

it("preserves CRLF, nulls, entities and UTF16 positions before parser normalization", () => {
	const text = "\r\n<h1>😀&amp;\u0000X</h1>\r";
	const body = Uint8Array.of(0xef, 0xbb, 0xbf, ...encoder.encode(text));
	const result = admit(fixture(body));
	expect(result.text).toBe(text);
	expect(result.text.indexOf("<h1>")).toBe(2);
	expect(result.text.indexOf("&amp;")).toBe(8);
	expect(result.text.slice(6, 8)).toBe("😀");
	expect(result.identity.text).toEqual({
		codeUnits: text.length,
		sha256: sha256(encoder.encode(text)),
		digestEncoding: "utf-8",
		coordinates: "decoder-output-utf16-before-parser-normalization",
	});
	expect(result.identity.bytes.sha256).not.toBe(result.identity.text.sha256);
	expect(result.identity.text.sha256).not.toBe(
		sha256(encoder.encode(text.replace(/\r\n?/g, "\n"))),
	);
});

it("separates byte identity from equal decoded text and does not infer replacement counts", () => {
	const valid = admit(fixture(encoder.encode("�")));
	const replaced = admit(fixture(Uint8Array.of(0xff)));
	expect(valid.text).toBe(replaced.text);
	expect(valid.identity.text).toEqual(replaced.identity.text);
	expect(valid.identity.bytes.sha256).not.toBe(replaced.identity.bytes.sha256);
	expect(Reflect.ownKeys(replaced.identity.decoder).sort()).toEqual([
		"bomConsumed",
		"encoding",
		"policy",
	]);
	const first = admit(fixture(encoder.encode("é")));
	const second = admit(fixture(utf16("é", true), "text/html"));
	expect(first.identity.text).toEqual(second.identity.text);
	expect(first.identity.bytes.sha256).not.toBe(second.identity.bytes.sha256);
});
