import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
	type ResearchBodyCapture,
	captureResearchBody,
	decodeResearchBodyCapture,
	researchBodyCaptureLimit,
} from "../scripts/research-body-capture.js";
import { AgentBrowserError } from "./errors.js";
import {
	type ResearchDocumentProfileId,
	researchLongDocumentAdmission,
} from "./research-admission.js";

const privateSentinel = "SYNTHETIC_CAPTURE_PRIVATE";
const profiles = [undefined, "default", "long-v1"] as const;
const fields = ["encoding", "decodedBytes", "sha256", "data"] as const;

afterEach(() => {
	vi.restoreAllMocks();
});

function fixtureCapture(
	bytes: Uint8Array = Uint8Array.of(0),
): ResearchBodyCapture {
	return {
		encoding: "base64",
		decodedBytes: bytes.byteLength,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		data: Buffer.from(bytes).toString("base64"),
	};
}

function rejects(
	action: () => unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
	message = "Invalid research body capture",
): void {
	let caught: unknown;
	try {
		action();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected synthetic capture rejection");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe(message);
	expect(Object.hasOwn(caught, "cause")).toBe(false);
	expect(caught.message).not.toContain(privateSentinel);
}

function rejectsCapture(
	value: unknown,
	profile?: ResearchDocumentProfileId,
): void {
	rejects(() => decodeResearchBodyCapture(value, profile));
}

function expectBytes(actual: Uint8Array, expected: Uint8Array): void {
	expect(actual.byteLength).toBe(expected.byteLength);
	expect(createHash("sha256").update(actual).digest("hex")).toBe(
		createHash("sha256").update(expected).digest("hex"),
	);
}

it("keeps the default ceiling and exact four-field schema unchanged", () => {
	expect(researchBodyCaptureLimit).toBe(2_000_000);
	expect(researchLongDocumentAdmission.maxCaptureBytes).toBe(4_000_000);
	const source = Uint8Array.of(0, 255, 128);
	const expected = fixtureCapture(source);
	const omitted = captureResearchBody(source);
	expect(omitted).toEqual(expected);
	for (const profile of profiles) {
		const capture = captureResearchBody(source, profile);
		expect(capture).toEqual(omitted);
		expect(Reflect.ownKeys(capture).sort()).toEqual([...fields].sort());
		expect(decodeResearchBodyCapture(capture, profile)).toEqual(source);
	}
	expect(decodeResearchBodyCapture(omitted)).toEqual(source);
});

it("enforces exact 2m and 2m+1 defaults while admitting 2m+1 only with long-v1", () => {
	const source = new Uint8Array(2_000_001).fill(173);
	source[0] = 0;
	source[source.length - 1] = 255;
	const exact = source.subarray(0, 2_000_000);
	const exactCapture = fixtureCapture(exact);
	const oversizedCapture = fixtureCapture(source);
	for (const profile of [undefined, "default"] as const) {
		expect(captureResearchBody(exact, profile)).toEqual(exactCapture);
		expectBytes(decodeResearchBodyCapture(exactCapture, profile), exact);
		rejects(
			() => captureResearchBody(source, profile),
			"resource-limit",
			"Research body capture limit exceeded",
		);
		rejectsCapture(oversizedCapture, profile);
		rejectsCapture(
			{ ...oversizedCapture, decodedBytes: exact.length },
			profile,
		);
	}
	expect(captureResearchBody(source, "long-v1")).toEqual(oversizedCapture);
	expectBytes(decodeResearchBodyCapture(oversizedCapture, "long-v1"), source);
	expectBytes(decodeResearchBodyCapture(exactCapture, "long-v1"), exact);
	expect(fixtureCapture(source)).toEqual(oversizedCapture);
	rejectsCapture(oversizedCapture);
});

it("admits exact 4m and rejects real 4m+1 capture and decode inputs", () => {
	const source = new Uint8Array(4_000_001).fill(91);
	source[0] = 255;
	source[source.length - 1] = 128;
	const exact = source.subarray(0, 4_000_000);
	const exactCapture = fixtureCapture(exact);
	const oversizedCapture = fixtureCapture(source);
	expect(captureResearchBody(exact, "long-v1")).toEqual(exactCapture);
	expectBytes(decodeResearchBodyCapture(exactCapture, "long-v1"), exact);
	rejects(
		() => captureResearchBody(source, "long-v1"),
		"resource-limit",
		"Research body capture limit exceeded",
	);
	rejectsCapture(oversizedCapture, "long-v1");
	rejectsCapture(
		{ ...oversizedCapture, decodedBytes: exact.length },
		"long-v1",
	);
	for (const profile of [undefined, "default"] as const) {
		rejectsCapture(exactCapture, profile);
		rejects(
			() => captureResearchBody(exact, profile),
			"resource-limit",
			"Research body capture limit exceeded",
		);
	}
	expect(fixtureCapture(source)).toEqual(oversizedCapture);
});

it("rejects invalid profiles before inspecting hostile inputs or coercing profiles", () => {
	const trap = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	const hostileProfile = {
		toString: trap,
		valueOf: trap,
		[Symbol.toPrimitive]: trap,
	};
	const body = new Proxy(Uint8Array.of(0), {
		get: trap,
		getPrototypeOf: trap,
		getOwnPropertyDescriptor: trap,
	});
	const record = new Proxy(fixtureCapture(), {
		get: trap,
		getPrototypeOf: trap,
		getOwnPropertyDescriptor: trap,
		ownKeys: trap,
	});
	const accessor = Object.defineProperty(fixtureCapture(), "data", {
		get: trap,
	});
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	for (const profile of [
		null,
		false,
		0,
		1n,
		"",
		"long",
		"LONG-V1",
		"long-v1 ",
		" default",
		Symbol("long-v1"),
		{},
		[],
		new String("long-v1"),
		hostileProfile,
		new Proxy({}, { get: trap, getPrototypeOf: trap }),
		revoked.proxy,
	]) {
		const invalidProfile = profile as ResearchDocumentProfileId;
		rejects(
			() => captureResearchBody(body, invalidProfile),
			"invalid-input",
			"Invalid research document profile",
		);
		for (const input of [record, accessor, revoked.proxy])
			rejects(
				() => decodeResearchBodyCapture(input, invalidProfile),
				"invalid-input",
				"Invalid research document profile",
			);
	}
	expect(trap).not.toHaveBeenCalled();
});

it.each(profiles)(
	"rejects embedded profiles and extra fields with host profile %s",
	(profile) => {
		const trap = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		for (const property of [
			"profile",
			"documentProfile",
			"extra",
			Symbol("profile"),
		]) {
			for (const enumerable of [true, false]) {
				rejectsCapture(
					Object.defineProperty(fixtureCapture(), property, {
						value: "long-v1",
						enumerable,
					}),
					profile,
				);
				rejectsCapture(
					Object.defineProperty(fixtureCapture(), property, {
						get: trap,
						enumerable,
					}),
					profile,
				);
			}
		}
		expect(trap).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"does not infer admission from byte content with host profile %s",
	(profile) => {
		const source = new TextEncoder().encode(
			'<meta name="profile" content="long-v1">{"profile":"long-v1"}',
		);
		const captured = captureResearchBody(source, profile);
		expect(captured).toEqual(fixtureCapture(source));
		expect(Reflect.ownKeys(captured).sort()).toEqual([...fields].sort());
		expect(decodeResearchBodyCapture(captured, profile)).toEqual(source);
	},
);

it.each(profiles)(
	"roundtrips finite binary fixtures under host profile %s",
	(profile) => {
		for (const source of [
			new Uint8Array(),
			Uint8Array.of(0),
			Uint8Array.of(0, 255),
			Uint8Array.of(0, 255, 128),
			Uint8Array.of(255, 192, 175, 237, 160, 128),
			Uint8Array.from({ length: 256 }, (_value, index) => index),
		]) {
			const captured = captureResearchBody(source, profile);
			expect(captured).toEqual(fixtureCapture(source));
			expect(decodeResearchBodyCapture(captured, profile)).toEqual(source);
			expect(
				decodeResearchBodyCapture(
					JSON.parse(JSON.stringify(captured)),
					profile,
				),
			).toEqual(source);
		}
	},
);

it("keeps caller storage intact and owns each decoded result across profiles", () => {
	const backing = Uint8Array.of(99, 0, 255, 128, 98);
	const original = backing.slice();
	const source = backing.subarray(1, 4);
	const captured = captureResearchBody(source, "long-v1");
	const expected = fixtureCapture(source);
	expect(backing).toEqual(original);
	const decoded = profiles.map((profile) =>
		decodeResearchBodyCapture(captured, profile),
	);
	expect(new Set(decoded.map((bytes) => bytes.buffer)).size).toBe(
		decoded.length,
	);
	for (const bytes of decoded) expect(bytes.buffer).not.toBe(backing.buffer);
	backing.fill(42);
	expect(captured).toEqual(expected);
	for (const bytes of decoded)
		expect(bytes).toEqual(Uint8Array.of(0, 255, 128));
	decoded[0].fill(91);
	expect(decoded[1]).toEqual(Uint8Array.of(0, 255, 128));
	expect(decoded[2]).toEqual(Uint8Array.of(0, 255, 128));
	expect(decodeResearchBodyCapture(captured, "long-v1")).toEqual(decoded[1]);
	expect(captured).toEqual(expected);
});

it("uses intrinsic view metadata and copies only an offset Buffer or Uint8Array", () => {
	const hook = vi.fn(() => {
		throw new Error(privateSentinel);
	});
	for (const backing of [
		Uint8Array.of(99, 0, 255, 128, 98),
		Buffer.from([99, 0, 255, 128, 98]),
	]) {
		const source = backing.subarray(1, 4);
		for (const property of [
			"buffer",
			"byteLength",
			"byteOffset",
			"length",
			"constructor",
			"slice",
			"subarray",
			"fill",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(source, property, { get: hook });
		for (const profile of profiles)
			expect(captureResearchBody(source, profile)).toEqual(
				fixtureCapture(Uint8Array.of(0, 255, 128)),
			);
		expect([...backing]).toEqual([99, 0, 255, 128, 98]);
	}
	expect(hook).not.toHaveBeenCalled();
});

it.each(profiles)(
	"rejects nonintrinsic, shared and detached sources under %s",
	(profile) => {
		const detached = Uint8Array.of(0);
		structuredClone(detached.buffer, { transfer: [detached.buffer] });
		const source = Uint8Array.of(0);
		const trap = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		const revoked = Proxy.revocable(source, {});
		revoked.revoke();
		for (const input of [
			null,
			undefined,
			[],
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
			new Proxy(source, { get: trap, getPrototypeOf: trap }),
			revoked.proxy,
		])
			rejects(() => captureResearchBody(input as Uint8Array, profile));
		expect(trap).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"accepts exact frozen and null-prototype records under %s",
	(profile) => {
		const captured = fixtureCapture();
		for (const record of [
			Object.freeze({ ...captured }),
			Object.assign(Object.create(null), captured),
			{
				data: captured.data,
				sha256: captured.sha256,
				decodedBytes: captured.decodedBytes,
				encoding: captured.encoding,
			},
		])
			expect(decodeResearchBodyCapture(record, profile)).toEqual(
				Uint8Array.of(0),
			);
	},
);

it.each(profiles)(
	"rejects accessors, missing fields and custom prototypes under %s",
	(profile) => {
		const hook = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		for (const field of fields) {
			for (const enumerable of [false, true])
				rejectsCapture(
					Object.defineProperty(fixtureCapture(), field, {
						get: hook,
						set: hook,
						enumerable,
					}),
					profile,
				);
			const incomplete: Partial<ResearchBodyCapture> = fixtureCapture();
			delete incomplete[field];
			rejectsCapture(incomplete, profile);
			rejectsCapture(
				Object.assign(Object.create(fixtureCapture()), incomplete),
				profile,
			);
		}
		const prototype = Object.defineProperty({}, "data", { get: hook });
		rejectsCapture(
			Object.create(
				prototype,
				Object.getOwnPropertyDescriptors(fixtureCapture()),
			),
			profile,
		);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"rejects proxy records without reflection traps under %s",
	(profile) => {
		const trap = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		const source = fixtureCapture();
		const revoked = Proxy.revocable(source, {});
		revoked.revoke();
		for (const input of [
			new Proxy(source, {}),
			new Proxy(source, {
				get: trap,
				getPrototypeOf: trap,
				getOwnPropertyDescriptor: trap,
				ownKeys: trap,
				has: trap,
			}),
			revoked.proxy,
		])
			rejectsCapture(input, profile);
		expect(trap).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"rejects forged lengths, hashes and encoding without coercion under %s",
	(profile) => {
		const hook = vi.fn(() => {
			throw new Error(privateSentinel);
		});
		const hostile = {
			toString: hook,
			valueOf: hook,
			[Symbol.toPrimitive]: hook,
		};
		const capture = fixtureCapture();
		for (const decodedBytes of [
			-1,
			0,
			2,
			0.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.MAX_SAFE_INTEGER,
			researchLongDocumentAdmission.maxCaptureBytes + 1,
			"1",
			null,
			undefined,
			true,
			1n,
			hostile,
		])
			rejectsCapture({ ...capture, decodedBytes }, profile);
		for (const sha256 of [
			"",
			"0".repeat(63),
			"0".repeat(65),
			"g".repeat(64),
			"0".repeat(64),
			capture.sha256.toUpperCase(),
			`${capture.sha256}\n`,
			null,
			1,
			hostile,
		])
			rejectsCapture({ ...capture, sha256 }, profile);
		for (const encoding of ["BASE64", "hex", "base64url", null, 1, hostile])
			rejectsCapture({ ...capture, encoding }, profile);
		for (const data of [null, undefined, 1, [], Uint8Array.of(0), hostile])
			rejectsCapture({ ...capture, data }, profile);
		for (const input of [
			null,
			undefined,
			false,
			42,
			"base64",
			{},
			[],
			new Date(0),
		])
			rejectsCapture(input, profile);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each(profiles)(
	"requires canonical base64 and matching content under %s",
	(profile) => {
		for (const data of [
			"",
			"A",
			"AA",
			"AA=",
			"AA===",
			"=AA=",
			"A=A=",
			"AAAA=",
			"AA==\n",
			" AA==",
			"AA==\0",
			"AA==AA==",
			"AB==",
			"AQ==",
			"_w==",
			"-w==",
			"ＡＡ==",
		])
			rejectsCapture({ ...fixtureCapture(), data }, profile);
		rejectsCapture(
			{ ...fixtureCapture(Uint8Array.of(0, 0)), data: "AAB=" },
			profile,
		);
		const extraByte = fixtureCapture(Uint8Array.of(0, 0, 0));
		expect(extraByte.data.length).toBe(
			fixtureCapture(Uint8Array.of(0, 0)).data.length,
		);
		rejectsCapture({ ...extraByte, decodedBytes: 2 }, profile);
	},
);

it.each(profiles)(
	"rejects over-ceiling declarations before base64 allocation under %s",
	(profile) => {
		const ceiling =
			profile === "long-v1"
				? researchLongDocumentAdmission.maxCaptureBytes
				: researchBodyCaptureLimit;
		const capture = { ...fixtureCapture(), decodedBytes: ceiling + 1 };
		const allocate = vi.spyOn(Buffer, "from");
		let caught: unknown;
		let allocations: number;
		try {
			try {
				decodeResearchBodyCapture(capture, profile);
			} catch (error) {
				caught = error;
			}
			allocations = allocate.mock.calls.length;
		} finally {
			allocate.mockRestore();
		}
		expect(allocations).toBe(0);
		rejects(() => {
			throw caught;
		});
	},
);
