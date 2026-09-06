import { afterEach, expect, it, vi } from "vitest";
import * as ctapCborEncoder from "./ctap-cbor-encoder.js";
import * as ctapCbor from "./ctap-cbor.js";
import type { CtapCborValue } from "./ctap-cbor.js";
import {
	type CtapMakeCredentialDescriptor,
	type CtapMakeCredentialParameter,
	type CtapMakeCredentialRequest,
	encodeCtapMakeCredentialRequest,
} from "./ctap-make-credential-request.js";
import { AgentBrowserError } from "./errors.js";

const hashBytes = [
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
	0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
	0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
];
const minimalWire = new Uint8Array([
	0x01, 0xa5, 0x01, 0x58, 0x20, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
	0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
	0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x02, 0xa1,
	0x62, 0x69, 0x64, 0x6b, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x2e, 0x63,
	0x6f, 0x6d, 0x03, 0xa1, 0x62, 0x69, 0x64, 0x42, 0x41, 0x42, 0x04, 0x81, 0xa2,
	0x63, 0x61, 0x6c, 0x67, 0x26, 0x64, 0x74, 0x79, 0x70, 0x65, 0x6a, 0x70, 0x75,
	0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x07, 0xa2, 0x62, 0x72, 0x6b,
	0xf4, 0x62, 0x75, 0x76, 0xf4,
]);
const fullWire = new Uint8Array([
	0x01, 0xa6, 0x01, 0x58, 0x20, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
	0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
	0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x02, 0xa2,
	0x62, 0x69, 0x64, 0x6b, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65, 0x2e, 0x63,
	0x6f, 0x6d, 0x64, 0x6e, 0x61, 0x6d, 0x65, 0x62, 0x52, 0x50, 0x03, 0xa3, 0x62,
	0x69, 0x64, 0x42, 0x41, 0x42, 0x64, 0x6e, 0x61, 0x6d, 0x65, 0x61, 0x75, 0x6b,
	0x64, 0x69, 0x73, 0x70, 0x6c, 0x61, 0x79, 0x4e, 0x61, 0x6d, 0x65, 0x61, 0x55,
	0x04, 0x81, 0xa2, 0x63, 0x61, 0x6c, 0x67, 0x26, 0x64, 0x74, 0x79, 0x70, 0x65,
	0x6a, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x05, 0x81,
	0xa2, 0x62, 0x69, 0x64, 0x42, 0x07, 0x08, 0x64, 0x74, 0x79, 0x70, 0x65, 0x6a,
	0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x07, 0xa2, 0x62,
	0x72, 0x6b, 0xf5, 0x62, 0x75, 0x76, 0xf5,
]);
const maximumUnsigned = (1n << 64n) - 1n;

afterEach(() => {
	vi.restoreAllMocks();
});

function descriptor(): CtapMakeCredentialDescriptor {
	return { type: "public-key", id: new Uint8Array([7, 8]) };
}

function parameter(alg = -7): CtapMakeCredentialParameter {
	return { type: "public-key", alg };
}

function request(): CtapMakeCredentialRequest {
	return {
		clientDataHash: new Uint8Array(hashBytes),
		rp: { id: "example.com" },
		user: { id: new Uint8Array([0x41, 0x42]) },
		pubKeyCredParams: [parameter()],
	};
}

function fullRequest(): CtapMakeCredentialRequest {
	return {
		...request(),
		rp: { name: "RP", id: "example.com" },
		user: { displayName: "U", name: "u", id: new Uint8Array([0x41, 0x42]) },
		excludeList: [descriptor()],
		residentKey: true,
		userVerification: true,
	};
}

function failure(input: unknown, maximum?: unknown): AgentBrowserError {
	let caught: unknown;
	try {
		encodeCtapMakeCredentialRequest(
			input as CtapMakeCredentialRequest,
			maximum as bigint | undefined,
		);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	return caught as AgentBrowserError;
}

function rejects(
	input: unknown,
	code: "invalid-input" | "resource-limit" = "invalid-input",
	maximum?: unknown,
): AgentBrowserError {
	const expected = failure(code === "invalid-input" ? null : request(), 1n);
	const caught = failure(input, maximum);
	expect(caught).toMatchObject({ name: "AgentBrowserError", code });
	expect(caught).not.toBe(expected);
	expect(caught.message).toBe(expected.message);
	expect(caught.message).not.toContain("SYNTHETIC_PRIVATE");
	expect(caught).not.toHaveProperty("cause");
	expect(caught).not.toHaveProperty("path");
	expect(Reflect.ownKeys(caught).sort()).toEqual([
		"code",
		"message",
		"name",
		"stack",
	]);
	return caught;
}

function parameters(wire: Uint8Array): CtapCborValue {
	expect(wire[0]).toBe(0x01);
	return ctapCbor.decodeCtapCbor(wire.subarray(1));
}

function field(value: CtapCborValue, key: bigint | string): CtapCborValue {
	if (value.kind !== "map") throw new Error("Expected synthetic map");
	const entry = value.entries.find(
		([candidate]) =>
			(candidate.kind === "unsigned" || candidate.kind === "text") &&
			candidate.value === key,
	);
	if (!entry) throw new Error("Expected synthetic field");
	return entry[1];
}

function keys(value: CtapCborValue): (bigint | string)[] {
	if (value.kind !== "map") throw new Error("Expected synthetic map");
	return value.entries.map(([key]) => {
		if (key.kind !== "unsigned" && key.kind !== "text")
			throw new Error("Expected synthetic key");
		return key.value;
	});
}

function items(value: CtapCborValue): readonly CtapCborValue[] {
	if (value.kind !== "array") throw new Error("Expected synthetic array");
	return value.items;
}

it("matches an independent literal minimal command and canonical CBOR fixture", () => {
	expect(encodeCtapMakeCredentialRequest(request())).toEqual(minimalWire);
});

it("matches an independent literal fixture with every supported optional field", () => {
	expect(encodeCtapMakeCredentialRequest(fullRequest())).toEqual(fullWire);
});

it.each([
	[false, false],
	[false, true],
	[true, false],
	[true, true],
])(
	"encodes explicit rk=%s uv=%s without up, PIN or extensions",
	(residentKey, userVerification) => {
		const decoded = parameters(
			encodeCtapMakeCredentialRequest({
				...request(),
				residentKey,
				userVerification,
			}),
		);
		expect(keys(decoded)).toEqual([1n, 2n, 3n, 4n, 7n]);
		const options = field(decoded, 7n);
		expect(keys(options)).toEqual(["rk", "uv"]);
		expect(field(options, "rk")).toEqual({
			kind: "simple",
			value: residentKey ? 21 : 20,
		});
		expect(field(options, "uv")).toEqual({
			kind: "simple",
			value: userVerification ? 21 : 20,
		});
	},
);

it("omits private optional metadata rather than synthesizing account labels", () => {
	const decoded = parameters(encodeCtapMakeCredentialRequest(request()));
	expect(keys(field(decoded, 2n))).toEqual(["id"]);
	expect(keys(field(decoded, 3n))).toEqual(["id"]);
	expect(field(decoded, 1n)).toEqual({
		kind: "bytes",
		value: new Uint8Array(hashBytes),
	});
	expect(
		keys(parameters(encodeCtapMakeCredentialRequest(fullRequest()))),
	).toEqual([1n, 2n, 3n, 4n, 5n, 7n]);
});

it("preserves supplied empty metadata instead of treating it as absent", () => {
	const input = request();
	input.rp.name = "";
	input.user.name = "";
	input.user.displayName = "";
	const decoded = parameters(encodeCtapMakeCredentialRequest(input));
	expect(field(field(decoded, 2n), "name")).toEqual({
		kind: "text",
		value: "",
	});
	for (const name of ["name", "displayName"])
		expect(field(field(decoded, 3n), name)).toEqual({
			kind: "text",
			value: "",
		});
});

it("preserves algorithm preference, duplicates and signed safe-integer boundaries", () => {
	const algorithms = [
		-7,
		257,
		-7,
		-1,
		1,
		Number.MIN_SAFE_INTEGER,
		Number.MAX_SAFE_INTEGER,
	];
	const decoded = parameters(
		encodeCtapMakeCredentialRequest({
			...request(),
			pubKeyCredParams: algorithms.map((alg) => parameter(alg)),
		}),
	);
	expect(items(field(decoded, 4n)).map((entry) => field(entry, "alg"))).toEqual(
		[
			{ kind: "negative", value: -7n },
			{ kind: "unsigned", value: 257n },
			{ kind: "negative", value: -7n },
			{ kind: "negative", value: -1n },
			{ kind: "unsigned", value: 1n },
			{ kind: "negative", value: -9007199254740991n },
			{ kind: "unsigned", value: 9007199254740991n },
		],
	);
	for (const entry of items(field(decoded, 4n))) {
		expect(keys(entry)).toEqual(["alg", "type"]);
		expect(field(entry, "type")).toEqual({ kind: "text", value: "public-key" });
	}
});

it.each([
	0,
	-0,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	Number.NEGATIVE_INFINITY,
	Number.MAX_SAFE_INTEGER + 1,
	Number.MIN_SAFE_INTEGER - 1,
	-7n,
	"-7",
	null,
])(
	"rejects invalid algorithm %# without registry lookup or coercion",
	(alg) => {
		rejects({ ...request(), pubKeyCredParams: [{ type: "public-key", alg }] });
	},
);

it("accepts sixteen algorithm entries and rejects seventeen", () => {
	const pubKeyCredParams = Array.from({ length: 16 }, () => parameter());
	expect(
		items(
			field(
				parameters(
					encodeCtapMakeCredentialRequest({
						...request(),
						pubKeyCredParams,
					}),
				),
				4n,
			),
		),
	).toHaveLength(16);
	rejects(
		{ ...request(), pubKeyCredParams: [...pubKeyCredParams, parameter()] },
		"resource-limit",
	);
});

it("preserves all 64 exclusion descriptors in order including duplicates", () => {
	const excludeList = Array.from({ length: 64 }, (_value, index) => ({
		type: "public-key" as const,
		id: new Uint8Array([index % 32]),
	}));
	const decoded = parameters(
		encodeCtapMakeCredentialRequest({ ...request(), excludeList }, 2048n),
	);
	expect(items(field(decoded, 5n)).map((entry) => field(entry, "id"))).toEqual(
		excludeList.map((entry) => ({ kind: "bytes", value: entry.id })),
	);
	rejects(
		{ ...request(), excludeList: [...excludeList, descriptor()] },
		"resource-limit",
		maximumUnsigned,
	);
});

it.each([
	{ target: "user", minimum: 1, maximum: 64 },
	{ target: "exclude", minimum: 1, maximum: 1023 },
])("enforces $target ID byte boundaries", ({ target, minimum, maximum }) => {
	for (const length of [0, minimum, maximum, maximum + 1, 7610]) {
		const input = request();
		const identifier = new Uint8Array(length).fill(0x91);
		if (target === "user") input.user.id = identifier;
		else input.excludeList = [{ type: "public-key", id: identifier }];
		if (length === 0) rejects(input);
		else if (length > maximum)
			rejects(input, "resource-limit", maximumUnsigned);
		else {
			const decoded = parameters(encodeCtapMakeCredentialRequest(input, 2048n));
			const owner =
				target === "user" ? field(decoded, 3n) : items(field(decoded, 5n))[0];
			expect(field(owner, "id")).toEqual({ kind: "bytes", value: identifier });
		}
	}
});

it.each([0, 1, 31, 33, 7610])(
	"requires exactly 32 hash bytes, not %i",
	(length) => {
		rejects({ ...request(), clientDataHash: new Uint8Array(length) });
	},
);

it.each([null, false, 0, "SYNTHETIC_PRIVATE", [], {}])(
	"rejects invalid record shapes %# at every record boundary",
	(value) => {
		rejects(value);
		rejects({ ...request(), rp: value });
		rejects({ ...request(), user: value });
		rejects({ ...request(), pubKeyCredParams: [value] });
		rejects({ ...request(), excludeList: [value] });
	},
);

it.each(["", null, 7, true, new String("example.com")])(
	"rejects invalid required RP text %# without string coercion",
	(id) => {
		rejects({ ...request(), rp: { id } });
	},
);

it.each(["rpName", "userName", "displayName"] as const)(
	"bounds optional %s to 256 UTF-16 units including astral text",
	(target) => {
		for (const value of [
			"n".repeat(256),
			"😀".repeat(128),
			"n".repeat(257),
			"😀".repeat(129),
			null,
			7,
		]) {
			const input = request();
			const owner = target === "rpName" ? input.rp : input.user;
			const name = target === "displayName" ? "displayName" : "name";
			Object.defineProperty(owner, name, { value });
			if (typeof value !== "string") rejects(input);
			else if (value.length > 256)
				rejects(input, "resource-limit", maximumUnsigned);
			else {
				const decoded = parameters(
					encodeCtapMakeCredentialRequest(input, 2048n),
				);
				expect(
					field(field(decoded, target === "rpName" ? 2n : 3n), name),
				).toEqual({ kind: "text", value });
			}
		}
	},
);

it.each(["\ud800", "\udc00", "host\ud800.invalid", "\udc00\ud800"])(
	"rejects malformed UTF-16 %# in every supported text field",
	(value) => {
		rejects({ ...request(), rp: { id: value } });
		rejects({ ...request(), rp: { id: "example.com", name: value } });
		rejects({ ...request(), user: { id: new Uint8Array([1]), name: value } });
		rejects({
			...request(),
			user: { id: new Uint8Array([1]), displayName: value },
		});
	},
);

it("preserves valid Unicode, combining sequences and BOM without normalization", () => {
	const input = request();
	input.rp = { id: "é.😀", name: "e\u0301" };
	input.user.name = "é";
	input.user.displayName = "\ufeff";
	const decoded = parameters(encodeCtapMakeCredentialRequest(input));
	expect(field(field(decoded, 2n), "id")).toEqual({
		kind: "text",
		value: "é.😀",
	});
	expect(field(field(decoded, 2n), "name")).toEqual({
		kind: "text",
		value: "e\u0301",
	});
	expect(field(field(decoded, 3n), "name")).toEqual({
		kind: "text",
		value: "é",
	});
	expect(field(field(decoded, 3n), "displayName")).toEqual({
		kind: "text",
		value: "\ufeff",
	});
});

it.each([null, 0, 1, "true", {}])(
	"rejects nonboolean rk and uv policy %#",
	(value) => {
		rejects({ ...request(), residentKey: value });
		rejects({ ...request(), userVerification: value });
	},
);

const recordTargets = [
	"request",
	"rp",
	"user",
	"parameter",
	"descriptor",
] as const;
type RecordTarget = (typeof recordTargets)[number];

function recordCase(target: RecordTarget) {
	const input = fullRequest();
	const algorithm = parameter();
	const excluded = descriptor();
	input.pubKeyCredParams = [algorithm];
	input.excludeList = [excluded];
	const records = {
		request: input,
		rp: input.rp,
		user: input.user,
		parameter: algorithm,
		descriptor: excluded,
	};
	const required = {
		request: ["clientDataHash", "rp", "user", "pubKeyCredParams"],
		rp: ["id"],
		user: ["id"],
		parameter: ["type", "alg"],
		descriptor: ["type", "id"],
	};
	return { input, record: records[target], required: required[target] };
}

it.each(recordTargets)(
	"rejects unknown, symbol and accessor own fields on %s",
	(target) => {
		const unsupported =
			target === "request"
				? [
						"userPresence",
						"up",
						"options",
						"extensions",
						"pinAuth",
						"pinProtocol",
						"pinUvAuthParam",
						"pinUvAuthProtocol",
						"transports",
					]
				: ["icon", "transports", "SYNTHETIC_PRIVATE"];
		for (const name of [...unsupported, Symbol("SYNTHETIC_PRIVATE")]) {
			const { input, record } = recordCase(target);
			Object.defineProperty(record, name, { value: "SYNTHETIC_PRIVATE" });
			rejects(input);
		}
		for (const name of Object.keys(recordCase(target).record)) {
			const { input, record } = recordCase(target);
			const getter = vi.fn(() => {
				throw new Error("SYNTHETIC_PRIVATE");
			});
			Object.defineProperty(record, name, { get: getter });
			rejects(input);
			expect(getter).not.toHaveBeenCalled();
		}
		const { input, record } = recordCase(target);
		const setter = vi.fn();
		Object.defineProperty(record, "SYNTHETIC_PRIVATE", { set: setter });
		rejects(input);
		expect(setter).not.toHaveBeenCalled();
	},
);

it.each(recordTargets)(
	"requires own data fields and ignores inherited fields on %s",
	(target) => {
		for (const name of recordCase(target).required) {
			const { input, record } = recordCase(target);
			const own = Object.getOwnPropertyDescriptor(record, name);
			if (!own) throw new Error("Expected synthetic own field");
			Reflect.deleteProperty(record, name);
			rejects(input);
			Object.setPrototypeOf(record, Object.create(null, { [name]: own }));
			rejects(input);
			const getter = vi.fn(() => own.value);
			Object.setPrototypeOf(
				record,
				Object.create(null, { [name]: { get: getter } }),
			);
			rejects(input);
			expect(getter).not.toHaveBeenCalled();
		}
		const { input, record } = recordCase(target);
		const getter = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		Object.setPrototypeOf(
			record,
			Object.create(null, {
				icon: { get: getter },
				[Symbol("SYNTHETIC_PRIVATE")]: { get: getter },
			}),
		);
		expect(encodeCtapMakeCredentialRequest(input)).toEqual(fullWire);
		expect(getter).not.toHaveBeenCalled();
	},
);

it("accepts nonenumerable own data and null prototypes throughout frozen records", () => {
	const input = fullRequest();
	const records = [
		input,
		input.rp,
		input.user,
		...input.pubKeyCredParams,
		...(input.excludeList ?? []),
	];
	for (const record of records) {
		Object.setPrototypeOf(record, null);
		for (const name of Object.keys(record))
			Object.defineProperty(record, name, { enumerable: false });
		Object.freeze(record);
	}
	Object.freeze(input.pubKeyCredParams);
	Object.freeze(input.excludeList);
	expect(encodeCtapMakeCredentialRequest(input)).toEqual(fullWire);
});

it("does not inherit optional metadata, exclusions or verification policies", () => {
	const input = request();
	const getter = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	Object.setPrototypeOf(
		input,
		Object.create(null, {
			excludeList: { get: getter },
			residentKey: { get: getter },
			userVerification: { get: getter },
		}),
	);
	Object.setPrototypeOf(
		input.rp,
		Object.create(null, { name: { get: getter } }),
	);
	Object.setPrototypeOf(
		input.user,
		Object.create(null, {
			name: { get: getter },
			displayName: { get: getter },
		}),
	);
	expect(encodeCtapMakeCredentialRequest(input)).toEqual(minimalWire);
	expect(getter).not.toHaveBeenCalled();
});

it("requires public-key type for both algorithm and exclusion records", () => {
	for (const type of ["password", "PUBLIC-KEY", undefined, null, 1]) {
		rejects({ ...request(), pubKeyCredParams: [{ type, alg: -7 }] });
		rejects({ ...request(), excludeList: [{ type, id: new Uint8Array([1]) }] });
	}
});

it.each([
	"nonarray",
	"empty",
	"hole",
	"own-getter",
	"inherited-data",
	"inherited-getter",
])(
	"rejects %s algorithm and exclusion lists without invoking slot accessors",
	(shape) => {
		for (const target of ["pubKeyCredParams", "excludeList"] as const) {
			const entry = target === "pubKeyCredParams" ? parameter() : descriptor();
			const getter = vi.fn(() => entry);
			if (shape === "nonarray") {
				for (const value of [
					null,
					{ 0: entry, length: 1 },
					new Set([entry]),
					new Uint8Array([1]),
				])
					rejects({ ...request(), [target]: value });
				continue;
			}
			const list = shape === "empty" ? [] : new Array(1);
			if (shape === "own-getter")
				Object.defineProperty(list, "0", { get: getter });
			if (shape.startsWith("inherited")) {
				const prototype = Object.create(Array.prototype);
				Object.defineProperty(
					prototype,
					"0",
					shape === "inherited-data" ? { value: entry } : { get: getter },
				);
				Object.setPrototypeOf(list, prototype);
			}
			rejects({ ...request(), [target]: list });
			expect(getter).not.toHaveBeenCalled();
		}
	},
);

it("reads own array slots without invoking custom iteration, map or slice", () => {
	const input = fullRequest();
	const hook = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const list of [input.pubKeyCredParams, input.excludeList]) {
		if (!list) throw new Error("Expected synthetic list");
		for (const property of [Symbol.iterator, "map", "slice"])
			Object.defineProperty(list, property, { get: hook });
	}
	expect(encodeCtapMakeCredentialRequest(input)).toEqual(fullWire);
	expect(hook).not.toHaveBeenCalled();
});

const invalidBytes: { name: string; make: (length: number) => unknown }[] = [
	{ name: "array", make: (length) => Array<number>(length).fill(1) },
	{ name: "ArrayBuffer", make: (length) => new ArrayBuffer(length) },
	{ name: "DataView", make: (length) => new DataView(new ArrayBuffer(length)) },
	{ name: "Uint16Array", make: (length) => new Uint16Array(length) },
	{ name: "Int8Array", make: (length) => new Int8Array(length) },
	{
		name: "Uint8ClampedArray",
		make: (length) => new Uint8ClampedArray(length),
	},
	{
		name: "shared view",
		make: (length) => new Uint8Array(new SharedArrayBuffer(length)),
	},
	{
		name: "proxy view",
		make: (length) => new Proxy(new Uint8Array(length), {}),
	},
	{
		name: "detached view",
		make: (length) => {
			const buffer = new ArrayBuffer(length);
			const view = new Uint8Array(buffer);
			structuredClone(buffer, { transfer: [buffer] });
			return view;
		},
	},
];

it.each(invalidBytes)(
	"rejects $name for hash, user ID and exclusion ID",
	({ make }) => {
		rejects({ ...request(), clientDataHash: make(32) });
		rejects({ ...request(), user: { id: make(2) } });
		rejects({
			...request(),
			excludeList: [{ type: "public-key", id: make(2) }],
		});
	},
);

it.each(["hash", "user", "exclude"])(
	"copies %s bytes through intrinsic slots without user hooks",
	(target) => {
		const input = fullRequest();
		const excluded = descriptor();
		input.excludeList = [excluded];
		const view =
			target === "hash"
				? input.clientDataHash
				: target === "user"
					? input.user.id
					: excluded.id;
		const hook = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		for (const name of [
			"length",
			"byteLength",
			"byteOffset",
			"buffer",
			"constructor",
			"slice",
			"subarray",
			Symbol.iterator,
			Symbol.toStringTag,
		])
			Object.defineProperty(view, name, { get: hook });
		expect(encodeCtapMakeCredentialRequest(input)).toEqual(fullWire);
		expect(hook).not.toHaveBeenCalled();
	},
);

it("owns offset-view snapshots and fresh results without changing frozen caller containers", () => {
	const hashBacking = new Uint8Array([0xee, ...hashBytes, 0xff]);
	const userBacking = new Uint8Array([0xee, 0x41, 0x42, 0xff]);
	const excludedBacking = new Uint8Array([0xee, 7, 8, 0xff]);
	const input = fullRequest();
	input.clientDataHash = hashBacking.subarray(1, 33);
	input.user.id = userBacking.subarray(1, 3);
	input.excludeList = Object.freeze([
		Object.freeze({ type: "public-key", id: excludedBacking.subarray(1, 3) }),
	]);
	Object.freeze(input.rp);
	Object.freeze(input.user);
	for (const entry of input.pubKeyCredParams) Object.freeze(entry);
	Object.freeze(input.pubKeyCredParams);
	Object.freeze(input);
	const first = encodeCtapMakeCredentialRequest(input);
	const second = encodeCtapMakeCredentialRequest(input);
	expect(first).toEqual(fullWire);
	expect(second).toEqual(fullWire);
	expect(first.buffer).not.toBe(second.buffer);
	for (const backing of [hashBacking, userBacking, excludedBacking])
		expect(first.buffer).not.toBe(backing.buffer);
	expect(hashBacking).toEqual(new Uint8Array([0xee, ...hashBytes, 0xff]));
	expect(userBacking).toEqual(new Uint8Array([0xee, 0x41, 0x42, 0xff]));
	expect(excludedBacking).toEqual(new Uint8Array([0xee, 7, 8, 0xff]));
	first.fill(0);
	expect(second).toEqual(fullWire);
	expect(input.user.id).toEqual(new Uint8Array([0x41, 0x42]));
	for (const backing of [hashBacking, userBacking, excludedBacking])
		backing.fill(0);
	expect(second).toEqual(fullWire);
});

it("captures owned byte snapshots before calling the canonical encoder", () => {
	const input = fullRequest();
	const excluded = descriptor();
	input.excludeList = [excluded];
	const callerBytes = [input.clientDataHash, input.user.id, excluded.id];
	const encode = ctapCborEncoder.encodeCtapCbor;
	const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
	const encoded = vi
		.spyOn(ctapCborEncoder, "encodeCtapCbor")
		.mockImplementation((value) => {
			for (const bytes of callerBytes) bytes.fill(0);
			return encode(value);
		});
	const wire = encodeCtapMakeCredentialRequest(input);
	expect(wire).toEqual(fullWire);
	expect(encoded).toHaveBeenCalledTimes(1);
	const owned = copied.mock.results.filter(
		(result) => result.type === "return",
	);
	expect(owned.length).toBeGreaterThanOrEqual(3);
	for (const result of owned) {
		expect(result.value).toEqual(new Uint8Array(result.value.length));
		expect(result.value.buffer).not.toBe(wire.buffer);
		for (const bytes of callerBytes)
			expect(result.value.buffer).not.toBe(bytes.buffer);
	}
	for (const result of encoded.mock.results) {
		if (result.type !== "return")
			throw new Error("Expected synthetic encoding");
		expect(result.value).toEqual(new Uint8Array(result.value.length));
		expect(result.value.buffer).not.toBe(wire.buffer);
	}
});

it.each([
	{ name: "default", maximum: undefined, size: 1024 },
	{ name: "negotiated", maximum: 2048n, size: 2048 },
	{ name: "global", maximum: maximumUnsigned, size: 7609 },
])(
	"counts the command byte at the exact $name ceiling and one byte over",
	({ maximum, size }) => {
		const input = request();
		input.rp.id = "r".repeat(size - 87);
		const wire = encodeCtapMakeCredentialRequest(input, maximum);
		expect(wire).toHaveLength(size);
		expect(field(field(parameters(wire), 2n), "id")).toEqual({
			kind: "text",
			value: input.rp.id,
		});
		rejects(
			{ ...input, rp: { id: `${input.rp.id}r` } },
			"resource-limit",
			maximum,
		);
		rejects(input, "resource-limit", BigInt(size - 1));
	},
);

it("accepts the literal minimal length and rejects a parameters-only budget", () => {
	expect(minimalWire).toHaveLength(96);
	expect(encodeCtapMakeCredentialRequest(request(), 96n)).toEqual(minimalWire);
	rejects(request(), "resource-limit", 95n);
	rejects(request(), "resource-limit", 1n);
});

it("allows negotiated larger messages but retains the default 1024-byte ceiling", () => {
	const input = request();
	input.rp.id = "r".repeat(938);
	rejects(input, "resource-limit");
	expect(encodeCtapMakeCredentialRequest(input, 1025n)).toHaveLength(1025);
});

it("uses UTF-8 byte length, not UTF-16 units, for message limits", () => {
	const input = request();
	input.rp.id = "é".repeat(468);
	expect(encodeCtapMakeCredentialRequest(input)).toHaveLength(1023);
	input.rp.id += "r";
	expect(encodeCtapMakeCredentialRequest(input)).toHaveLength(1024);
	input.rp.id += "r";
	rejects(input, "resource-limit");
});

it("bounds RP text allocation independently of negotiated uint64 message size", () => {
	for (const length of [7609, 7610])
		rejects(
			{ ...request(), rp: { id: "r".repeat(length) } },
			"resource-limit",
			maximumUnsigned,
		);
});

it.each([
	0n,
	-1n,
	1n << 64n,
	1024,
	1.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"1024",
	null,
	true,
])("rejects non-positive-uint64-bigint message limit %#", (maximum) => {
	rejects(request(), "invalid-input", maximum);
});

it("does not coerce boxed limits, algorithms or text", () => {
	const coercion = vi.fn(() => {
		throw new Error("SYNTHETIC_PRIVATE");
	});
	for (const value of [Object(1024n), Object(-7), Object("example.com")]) {
		Object.defineProperty(value, Symbol.toPrimitive, { value: coercion });
		rejects(request(), "invalid-input", value);
		rejects({
			...request(),
			pubKeyCredParams: [{ type: "public-key", alg: value }],
		});
		rejects({ ...request(), rp: { id: value } });
	}
	expect(coercion).not.toHaveBeenCalled();
});

it.each([
	"success",
	"wire-limit",
	"empty-user",
	"oversized-user",
	"bad-algorithm",
	"empty-later-exclusion",
	"oversized-later-exclusion",
	"accessor-later-exclusion",
	"bad-unicode",
])(
	"wipes owned copies and encoded parameters on %s without wiping caller bytes",
	(outcome) => {
		const input = fullRequest();
		const first = descriptor();
		const second = descriptor();
		input.excludeList = [first, second];
		if (outcome === "empty-user") input.user.id = new Uint8Array(0);
		if (outcome === "oversized-user")
			input.user.id = new Uint8Array(65).fill(0x71);
		if (outcome === "bad-algorithm") input.pubKeyCredParams = [parameter(0)];
		if (outcome === "empty-later-exclusion") second.id = new Uint8Array(0);
		if (outcome === "oversized-later-exclusion")
			second.id = new Uint8Array(1024).fill(0x72);
		if (outcome === "bad-unicode") input.user.displayName = "\ud800";
		const hook = vi.fn(() => {
			throw new Error("SYNTHETIC_PRIVATE");
		});
		if (outcome === "accessor-later-exclusion")
			Object.defineProperty(second, "type", { get: hook });
		const callerBytes = [
			input.clientDataHash,
			input.user.id,
			first.id,
			second.id,
		];
		const before = callerBytes.map((bytes) => bytes.slice());
		const expectedError =
			outcome === "wire-limit" || outcome.startsWith("oversized")
				? "resource-limit"
				: "invalid-input";
		const copied = vi.spyOn(ctapCbor, "copyCtapBytes");
		const encoded = vi.spyOn(ctapCborEncoder, "encodeCtapCbor");
		if (outcome === "success") {
			const wire = encodeCtapMakeCredentialRequest(input);
			expect(wire[0]).toBe(0x01);
			expect(wire).toContain(0x41);
			expect(
				copied.mock.results.filter((result) => result.type === "return").length,
			).toBeGreaterThanOrEqual(4);
		} else {
			const caught = failure(input, outcome === "wire-limit" ? 1n : 2048n);
			expect(caught.code).toBe(expectedError);
		}
		const owned = copied.mock.results.filter(
			(result) => result.type === "return",
		);
		expect(owned.length).toBeGreaterThanOrEqual(
			outcome.includes("later-exclusion") ? 3 : 1,
		);
		for (const result of owned) {
			expect(result.value).toEqual(new Uint8Array(result.value.length));
			for (const bytes of callerBytes)
				expect(result.value.buffer).not.toBe(bytes.buffer);
		}
		if (outcome === "success" || outcome === "wire-limit") {
			expect(encoded).toHaveBeenCalledTimes(1);
			expect(encoded.mock.results[0].type).toBe("return");
		}
		if (outcome === "bad-unicode") {
			expect(encoded).toHaveBeenCalledTimes(1);
			expect(encoded.mock.results[0].type).toBe("throw");
		}
		for (const result of encoded.mock.results)
			if (result.type === "return")
				expect(result.value).toEqual(new Uint8Array(result.value.length));
		expect(callerBytes).toEqual(before);
		expect(hook).not.toHaveBeenCalled();
	},
);

it.each(["ownKeys", "getOwnPropertyDescriptor"])(
	"redacts host Proxy %s trap failures into fresh fixed errors",
	(trap) => {
		const coercion = vi.fn(() => "SYNTHETIC_PRIVATE");
		const thrown = {
			message: "SYNTHETIC_PRIVATE",
			path: "SYNTHETIC_PRIVATE",
			[Symbol.toPrimitive]: coercion,
		};
		for (const target of recordTargets) {
			const { input, record } = recordCase(target);
			const hook = vi.fn(() => {
				throw thrown;
			});
			const proxy = new Proxy(record, { [trap]: hook });
			let candidate: unknown = input;
			if (target === "request") candidate = proxy;
			else if (target === "parameter")
				input.pubKeyCredParams = [proxy as CtapMakeCredentialParameter];
			else if (target === "descriptor")
				input.excludeList = [proxy as CtapMakeCredentialDescriptor];
			else Object.defineProperty(input, target, { value: proxy });
			const first = rejects(candidate);
			const second = rejects(candidate);
			expect(hook).toHaveBeenCalledTimes(2);
			expect(first).not.toBe(thrown);
			expect(second).not.toBe(first);
			expect(first.message).toBe(second.message);
		}
		expect(coercion).not.toHaveBeenCalled();
	},
);
