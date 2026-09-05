import {
	createCipheriv,
	createDecipheriv,
	createSecretKey,
	generateKeyPairSync,
	randomBytes,
	sign,
	verify,
} from "node:crypto";
import { inspect } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	NodePasskeyCheckpointCodec,
	type NodePasskeyCheckpointRecord,
} from "./node-passkey-checkpoint.js";

const hooks = vi.hoisted(() => ({
	sealing: [] as Buffer[],
	opening: [] as Buffer[],
	keys: [] as Buffer[],
	imports: [] as Buffer[],
	options: [] as unknown[],
	failSeal: false,
	failImport: false,
	onDecipher: undefined as (() => void) | undefined,
}));

vi.mock("node:crypto", async (importOriginal) => {
	const crypto = await importOriginal<typeof import("node:crypto")>();
	return {
		...crypto,
		createCipheriv: (...args: Parameters<typeof crypto.createCipheriv>) => {
			hooks.keys.push(args[1] as Buffer);
			hooks.options.push(args[3]);
			const cipher = crypto.createCipheriv(...args);
			const update = cipher.update.bind(cipher);
			cipher.update = ((data: Buffer) => {
				hooks.sealing.push(data);
				if (hooks.failSeal) throw new Error("sensitive provider detail");
				return update(data);
			}) as typeof cipher.update;
			return cipher;
		},
		createDecipheriv: (...args: Parameters<typeof crypto.createDecipheriv>) => {
			hooks.onDecipher?.();
			hooks.options.push(args[3]);
			const decipher = crypto.createDecipheriv(...args);
			const update = decipher.update.bind(decipher);
			const final = decipher.final.bind(decipher);
			decipher.update = ((data: Buffer) => {
				const plaintext = update(data);
				hooks.opening.push(plaintext);
				return plaintext;
			}) as typeof decipher.update;
			decipher.final = (() => {
				const plaintext = final();
				hooks.opening.push(plaintext);
				return plaintext;
			}) as typeof decipher.final;
			return decipher;
		},
		createPrivateKey: (...args: Parameters<typeof crypto.createPrivateKey>) => {
			const options = args[0] as { key: Buffer };
			hooks.imports.push(options.key);
			if (hooks.failImport) throw new Error("sensitive provider detail");
			return crypto.createPrivateKey(...args);
		},
	};
});

const codecs: NodePasskeyCheckpointCodec[] = [];
const denied = new Error("Passkey checkpoint operation denied");

beforeEach(() => {
	for (const list of [
		hooks.sealing,
		hooks.opening,
		hooks.keys,
		hooks.imports,
		hooks.options,
	])
		list.length = 0;
	hooks.failSeal = false;
	hooks.failImport = false;
	hooks.onDecipher = undefined;
});

afterEach(() => {
	for (const codec of codecs.splice(0)) codec.close();
	vi.restoreAllMocks();
});

function fixture(key = randomBytes(32)) {
	const codec = new NodePasskeyCheckpointCodec(key);
	codecs.push(codec);
	return { key, codec };
}

function credential(id = randomBytes(32)) {
	const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
	const record: NodePasskeyCheckpointRecord = {
		id,
		rpId: "login.example.test",
		user: {
			id: new Uint8Array([1, 2]),
			name: "synthetic",
			displayName: "测试 😀",
		},
		privateKey: pair.privateKey,
		counter: 19,
	};
	return { record, publicKey: pair.publicKey };
}

function sealUnknown(codec: NodePasskeyCheckpointCodec, value: unknown) {
	return codec.seal(value as NodePasskeyCheckpointRecord[]);
}

function encryptPlaintext(key: Buffer, plaintext: Buffer) {
	const header = Buffer.alloc(24);
	header.set([65, 66, 80, 75, 67, 80, 1, 0]);
	header.writeUInt32BE(plaintext.length, 8);
	header.set(randomBytes(12), 12);
	const cipher = createCipheriv("aes-256-gcm", key, header.subarray(12), {
		authTagLength: 16,
	});
	cipher.setAAD(header);
	return Buffer.concat([
		header,
		cipher.update(plaintext),
		cipher.final(),
		cipher.getAuthTag(),
	]);
}

function decryptPlaintext(key: Buffer, envelope: Buffer) {
	const decipher = createDecipheriv(
		"aes-256-gcm",
		key,
		envelope.subarray(12, 24),
		{
			authTagLength: 16,
		},
	);
	decipher.setAAD(envelope.subarray(0, 24));
	decipher.setAuthTag(envelope.subarray(-16));
	return Buffer.concat([
		decipher.update(envelope.subarray(24, -16)),
		decipher.final(),
	]);
}

function fieldOffsets(plaintext: Buffer) {
	let offset = 2;
	const fields: { prefix: number; start: number; end: number }[] = [];
	for (let index = 0; index < 6; index++) {
		if (index === 5) offset += 4;
		const length = plaintext.readUInt16BE(offset);
		fields.push({
			prefix: offset,
			start: offset + 2,
			end: offset + 2 + length,
		});
		offset += 2 + length;
	}
	return fields;
}

it("roundtrips an empty store and uses a fresh nonce for every sealing", () => {
	const { codec } = fixture();
	const envelopes = Array.from({ length: 32 }, () => codec.seal([]));
	expect(
		new Set(envelopes.map((bytes) => bytes.subarray(12, 24).toString("hex")))
			.size,
	).toBe(32);
	for (const envelope of envelopes) {
		expect(envelope.length).toBe(42);
		expect(codec.open(envelope)).toEqual([]);
	}
	expect(
		hooks.options.every(
			(options) => (options as { authTagLength: number }).authTagLength === 16,
		),
	).toBe(true);
});

it("restores independently verifiable signing keys and canonical credential order", () => {
	const { codec } = fixture();
	const first = credential(Buffer.from([2]));
	const second = credential(Buffer.from([1]));
	const records = [first.record, second.record];
	const envelope = codec.seal(records);
	const restored = codec.open(envelope);
	expect(records[0]).toBe(first.record);
	expect(restored.map((record) => [...record.id])).toEqual([[1], [2]]);
	for (const [index, original] of [second, first].entries()) {
		const result = restored[index];
		expect(result.rpId).toBe(original.record.rpId);
		expect(result.user).toEqual(original.record.user);
		expect(result.counter).toBe(19);
		const message = randomBytes(32);
		expect(
			verify(
				"sha256",
				message,
				original.publicKey,
				sign("sha256", message, result.privateKey),
			),
		).toBe(true);
	}
	expect(envelope.includes(Buffer.from(first.record.user.name))).toBe(false);
	expect(codec.open(codec.seal(restored))).toEqual(restored);
});

it("copies the constructor key and never serializes private class state", () => {
	const { codec, key } = fixture();
	const saved = Buffer.from(key);
	key.fill(0);
	const envelope = codec.seal([]);
	expect(fixture(saved).codec.open(envelope)).toEqual([]);
	expect(JSON.stringify(codec)).toBe("{}");
	expect(Reflect.ownKeys(codec)).toEqual([]);
	expect(inspect(codec, { showHidden: true })).not.toContain(
		saved.toString("hex"),
	);
	expect(hooks.keys[0]).not.toBe(key);
});

it("copies envelope input before crypto and returned metadata before wiping plaintext", () => {
	const { codec } = fixture();
	const { record } = credential();
	const id = Buffer.from(record.id);
	const userId = new Uint8Array(record.user.id);
	const envelope = codec.seal([record]);
	record.id.fill(0);
	record.user.id.fill(0);
	hooks.onDecipher = () => envelope.fill(0);
	const [restored] = codec.open(envelope);
	expect([...restored.id]).toEqual([...id]);
	expect(restored.user.id).toEqual(userId);
	expect(
		hooks.opening.every((bytes) => bytes.every((value) => value === 0)),
	).toBe(true);
});

it("close is idempotent, wipes its owned key, and revokes seal and open", () => {
	const { codec, key } = fixture();
	const saved = Buffer.from(key);
	const envelope = codec.seal([]);
	const ownedKey = hooks.keys[0];
	expect(ownedKey.equals(key)).toBe(true);
	codec.close();
	codec.close();
	expect(ownedKey.equals(Buffer.alloc(32))).toBe(true);
	expect(key.equals(saved)).toBe(true);
	expect(() => codec.seal([])).toThrow(denied);
	expect(() => codec.open(envelope)).toThrow(denied);
});

it("rejects every single-byte envelope mutation, every truncation, trailing data and wrong keys", () => {
	const { codec } = fixture();
	const envelope = codec.seal([credential().record]);
	for (let index = 0; index < envelope.length; index++) {
		const mutated = Buffer.from(envelope);
		mutated[index] ^= 1;
		expect(() => codec.open(mutated)).toThrow(denied);
		expect(() => codec.open(envelope.subarray(0, index))).toThrow(denied);
	}
	expect(() => codec.open(Buffer.concat([envelope, Buffer.from([0])]))).toThrow(
		denied,
	);
	expect(() => fixture().codec.open(envelope)).toThrow(denied);
	expect(hooks.imports).toHaveLength(0);
	expect(
		hooks.opening.every((bytes) => bytes.every((value) => value === 0)),
	).toBe(true);
});

it.each(
	[
		undefined,
		null,
		"secret",
		[],
		{},
		new Uint8Array(31),
		new Uint8Array(33),
		new Uint16Array(16),
		new DataView(new ArrayBuffer(32)),
		new Uint8Array(new SharedArrayBuffer(32)),
	].map((key) => ({ key })),
)("rejects invalid constructor keys: %#", ({ key }) => {
	expect(() => new NodePasskeyCheckpointCodec(key as Uint8Array)).toThrow(
		denied,
	);
});

it("accepts only the selected 32-byte key view, not surrounding bytes", () => {
	const storage = randomBytes(64);
	const { codec } = fixture(storage.subarray(16, 48));
	expect(
		fixture(Buffer.from(storage.subarray(16, 48))).codec.open(codec.seal([])),
	).toEqual([]);
});

it.each(
	[
		null,
		{},
		new Array(1),
		new Array(65),
		{ length: 0 },
		Object.assign([], { extra: true }),
	].map((records) => ({ records })),
)("rejects invalid record arrays: %#", ({ records }) => {
	expect(() => sealUnknown(fixture().codec, records)).toThrow(denied);
});

it.each([
	-1,
	-0,
	0x100000000,
	0.5,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	"1",
	null,
])("rejects invalid counters: %s", (counter) => {
	const { codec } = fixture();
	expect(() =>
		sealUnknown(codec, [{ ...credential().record, counter }]),
	).toThrow(denied);
});

it.each([
	"EXAMPLE.test",
	"localhost",
	"127.0.0.1",
	"0x7f.1",
	"example.test.",
	"https://example.test",
	"a..test",
	"-a.test",
	"a-.test",
	"a_b.test",
	"é.test",
	`${"a".repeat(64)}.test`,
	"x".repeat(254),
	"__proto__",
])("rejects invalid or noncanonical RP IDs: %s", (rpId) => {
	expect(() =>
		fixture().codec.seal([{ ...credential().record, rpId }]),
	).toThrow(denied);
});

it.each([
	"",
	"x".repeat(257),
	"bad\u0000name",
	"bad\u007fname",
	"\ud800",
	"\udfff",
	1,
	null,
])("rejects invalid user text: %s", (value) => {
	const { codec } = fixture();
	const { record } = credential();
	for (const field of ["name", "displayName"]) {
		expect(() =>
			sealUnknown(codec, [
				{ ...record, user: { ...record.user, [field]: value } },
			]),
		).toThrow(denied);
	}
});

it("rejects empty/oversized IDs, duplicate IDs and bad user shapes", () => {
	const { codec } = fixture();
	const { record } = credential();
	for (const id of [Buffer.alloc(0), Buffer.alloc(1024)]) {
		expect(() => codec.seal([{ ...record, id }])).toThrow(denied);
	}
	for (const id of [Buffer.alloc(0), Buffer.alloc(65)]) {
		expect(() =>
			codec.seal([{ ...record, user: { ...record.user, id } }]),
		).toThrow(denied);
	}
	for (const user of [null, {}, { ...record.user, extra: 1 }]) {
		expect(() => sealUnknown(codec, [{ ...record, user }])).toThrow(denied);
	}
	expect(() => codec.seal([record, { ...record, rpId: "other.test" }])).toThrow(
		denied,
	);
});

it("rejects accessors, prototype fields, symbols and proxies without executing traps", () => {
	const { codec } = fixture();
	const { record } = credential();
	const trap = vi.fn(() => {
		throw new Error("must not run");
	});
	const accessor = Object.defineProperty({ ...record }, "id", { get: trap });
	const inherited = Object.assign(Object.create({ secret: true }), record);
	const protoKey = Object.defineProperty({ ...record }, "__proto__", {
		value: null,
	});
	const proxy = new Proxy(record, {
		get: trap,
		ownKeys: trap,
		getPrototypeOf: trap,
	});
	const missing = {
		rpId: record.rpId,
		user: record.user,
		privateKey: record.privateKey,
		counter: record.counter,
	};
	for (const invalid of [
		accessor,
		inherited,
		protoKey,
		proxy,
		missing,
		{ ...record, [Symbol("extra")]: true },
	]) {
		expect(() => sealUnknown(codec, [invalid])).toThrow(denied);
	}
	const list = Object.defineProperty([record], "0", { get: trap });
	expect(() => sealUnknown(codec, list)).toThrow(denied);
	expect(() => sealUnknown(codec, new Proxy([], { get: trap }))).toThrow(
		denied,
	);
	const user = Object.defineProperty({ ...record.user }, "name", { get: trap });
	expect(() => sealUnknown(codec, [{ ...record, user }])).toThrow(denied);
	Object.defineProperty(record.id, "byteLength", { get: trap });
	expect(() => codec.seal([record])).toThrow(denied);
	expect(trap).not.toHaveBeenCalled();
});

it("rejects nonprivate, non-P256, forged and overridden keys", () => {
	const { codec } = fixture();
	const { record, publicKey } = credential();
	const trap = vi.fn(() => {
		throw new Error("must not run");
	});
	const accessorKey = credential().record.privateKey;
	Object.defineProperty(accessorKey, "export", { get: trap });
	const forgedKey = Object.create(Object.getPrototypeOf(record.privateKey));
	const subclassKey = credential().record.privateKey;
	Object.setPrototypeOf(
		subclassKey,
		Object.create(Object.getPrototypeOf(subclassKey)),
	);
	for (const privateKey of [
		publicKey,
		createSecretKey(randomBytes(32)),
		generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey,
		generateKeyPairSync("ed25519").privateKey,
		{},
		forgedKey,
		accessorKey,
		subclassKey,
	]) {
		expect(() => sealUnknown(codec, [{ ...record, privateKey }])).toThrow(
			denied,
		);
	}
	expect(trap).not.toHaveBeenCalled();
});

it("roundtrips 64 records at metadata limits and both counter boundaries", () => {
	const { codec } = fixture();
	const { record } = credential();
	const records = Array.from({ length: 64 }, (_, index) => {
		const id = Buffer.alloc(1023, 1);
		id.writeUInt16BE(index, 0);
		return {
			...record,
			id,
			rpId: `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`,
			user: {
				id: Buffer.alloc(64, 2),
				name: "界".repeat(256),
				displayName: "界".repeat(256),
			},
			counter: index === 0 ? 0 : 0xffffffff,
		};
	});
	const restored = codec.open(codec.seal(records));
	expect(restored).toHaveLength(64);
	expect(restored[0].counter).toBe(0);
	expect(restored[63].counter).toBe(0xffffffff);
	expect(restored[63].user).toEqual({
		...records[63].user,
		id: new Uint8Array(records[63].user.id),
	});
	expect(() => codec.seal([...records, record])).toThrow(denied);
});

it("rejects oversized envelopes and forged lengths before decryption", () => {
	const { codec } = fixture();
	const onDecipher = vi.fn();
	hooks.onDecipher = onDecipher;
	expect(() => codec.open(Buffer.alloc(256 * 1024))).toThrow(denied);
	for (const length of [0, 1, 3, 0xffffffff]) {
		const envelope = codec.seal([]);
		envelope.writeUInt32BE(length, 8);
		expect(() => codec.open(envelope)).toThrow(denied);
	}
	expect(onDecipher).not.toHaveBeenCalled();
});

it("rejects authenticated malformed counts, lengths, UTF8, metadata, keys and trailing plaintext", () => {
	const { codec, key } = fixture();
	const plaintext = decryptPlaintext(key, codec.seal([credential().record]));
	const fields = fieldOffsets(plaintext);
	const variants: Buffer[] = [
		Buffer.from([0, 65]),
		Buffer.from([0, 1]),
		Buffer.concat([plaintext, Buffer.from([0])]),
	];
	const change = (mutate: (bytes: Buffer) => void) => {
		const bytes = Buffer.from(plaintext);
		mutate(bytes);
		variants.push(bytes);
	};
	change((bytes) => bytes.writeUInt16BE(0, 0));
	change((bytes) => bytes.writeUInt16BE(2, 0));
	for (const field of fields) {
		change((bytes) => bytes.writeUInt16BE(0, field.prefix));
		change((bytes) => bytes.writeUInt16BE(0xffff, field.prefix));
	}
	change((bytes) => {
		bytes[fields[1].start] = 65;
	});
	change((bytes) => {
		bytes[fields[3].start] = 0xff;
	});
	change((bytes) => {
		bytes[fields[4].start] = 0;
	});
	change((bytes) => {
		bytes[fields[5].start] = 0;
	});
	const trailingDer = Buffer.concat([plaintext, Buffer.from([0])]);
	trailingDer.writeUInt16BE(
		fields[5].end - fields[5].start + 1,
		fields[5].prefix,
	);
	variants.push(trailingDer);
	try {
		for (const variant of variants) {
			expect(() => codec.open(encryptPlaintext(key, variant))).toThrow(denied);
		}
	} finally {
		plaintext.fill(0);
		for (const variant of variants) variant.fill(0);
	}
});

it("rejects authenticated duplicate IDs and noncanonical record order", () => {
	const { codec, key } = fixture();
	const plaintext = decryptPlaintext(
		key,
		codec.seal([credential(Buffer.from([2])).record]),
	);
	const doubled = Buffer.concat([
		Buffer.from([0, 2]),
		plaintext.subarray(2),
		plaintext.subarray(2),
	]);
	try {
		expect(() => codec.open(encryptPlaintext(key, doubled))).toThrow(denied);
		doubled[plaintext.length + 2] = 1;
		expect(() => codec.open(encryptPlaintext(key, doubled))).toThrow(denied);
	} finally {
		plaintext.fill(0);
		doubled.fill(0);
	}
});

it("wipes observed owned plaintext on success and crypto/import failures with fixed errors", () => {
	const { codec } = fixture();
	const { record } = credential();
	const envelope = codec.seal([record]);
	codec.open(envelope);
	expect(hooks.sealing.length).toBeGreaterThan(0);
	expect(hooks.imports.length).toBeGreaterThan(0);
	for (const bytes of [...hooks.sealing, ...hooks.opening, ...hooks.imports]) {
		expect(bytes.every((value) => value === 0)).toBe(true);
	}
	hooks.failSeal = true;
	expect(() => codec.seal([record])).toThrow(denied);
	hooks.failSeal = false;
	hooks.failImport = true;
	expect(() => codec.open(envelope)).toThrow(denied);
	for (const bytes of [...hooks.sealing, ...hooks.opening, ...hooks.imports]) {
		expect(bytes.every((value) => value === 0)).toBe(true);
	}
});

it("rejects authenticated non-P256/private keys and bounds DER before importing", () => {
	const { codec, key } = fixture();
	const { record, publicKey } = credential();
	const plaintext = decryptPlaintext(key, codec.seal([record]));
	const keyField = fieldOffsets(plaintext)[5];
	const encodings = [
		generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({
			format: "der",
			type: "pkcs8",
		}),
		generateKeyPairSync("ed25519").privateKey.export({
			format: "der",
			type: "pkcs8",
		}),
		publicKey.export({ format: "der", type: "spki" }),
		Buffer.alloc(257),
	];
	try {
		for (const encoded of encodings) {
			const variant = Buffer.concat([
				plaintext.subarray(0, keyField.start),
				encoded,
			]);
			variant.writeUInt16BE(encoded.length, keyField.prefix);
			hooks.imports.length = 0;
			try {
				expect(() => codec.open(encryptPlaintext(key, variant))).toThrow(
					denied,
				);
				if (encoded.length > 256) expect(hooks.imports).toHaveLength(0);
			} finally {
				variant.fill(0);
			}
		}
	} finally {
		plaintext.fill(0);
		for (const encoded of encodings) encoded.fill(0);
	}
});

it("wipes serialization allocations and PKCS8 exports, including partial serialization failure", () => {
	const { codec } = fixture();
	const first = credential(Buffer.from([1])).record;
	const second = credential(Buffer.from([2])).record;
	const allocations: Buffer[] = [];
	const exported: Buffer[] = [];
	const allocate = Buffer.alloc;
	vi.spyOn(Buffer, "alloc").mockImplementation((size, fill, encoding) => {
		const bytes = allocate(size, fill, encoding);
		if (size === 201_474) allocations.push(bytes);
		return bytes;
	});
	const prototype = Object.getPrototypeOf(first.privateKey) as {
		export: (options: { format: "der"; type: "pkcs8" }) => Buffer;
	};
	const exportKey = prototype.export;
	let failSecond = false;
	vi.spyOn(prototype, "export").mockImplementation(function (
		this: typeof first.privateKey,
		options,
	) {
		if (failSecond && this === second.privateKey)
			throw new Error("sensitive provider detail");
		const bytes = exportKey.call(this, options);
		exported.push(bytes);
		return bytes;
	});
	codec.open(codec.seal([first, second]));
	failSecond = true;
	expect(() => codec.seal([first, second])).toThrow(denied);
	expect(() => codec.seal([{ ...first, counter: -1 }])).toThrow(denied);
	expect(allocations).toHaveLength(3);
	expect(exported).toHaveLength(5);
	for (const bytes of [...allocations, ...exported]) {
		expect(bytes.every((value) => value === 0)).toBe(true);
	}
});

it("keeps failures fixed without causes or provider fields", () => {
	const { codec } = fixture();
	hooks.failSeal = true;
	let failure: unknown;
	try {
		codec.seal([credential().record]);
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(Error);
	expect((failure as Error).name).toBe("Error");
	expect((failure as Error).message).toBe(denied.message);
	expect((failure as Error).cause).toBeUndefined();
	expect(JSON.stringify(failure)).toBe("{}");
	expect(String((failure as Error).stack)).not.toContain(
		"sensitive provider detail",
	);
});

it("rejects non-byte, detached, shared and accessor-bearing envelope inputs without invoking getters", () => {
	const { codec } = fixture();
	const detached = new Uint8Array(42);
	structuredClone(detached.buffer, { transfer: [detached.buffer] });
	const trap = vi.fn(() => {
		throw new Error("must not run");
	});
	const accessor = codec.seal([]);
	Object.defineProperty(accessor, "byteLength", { get: trap });
	for (const input of [
		null,
		"input",
		{},
		[],
		new Uint16Array(21),
		new Uint8Array(new SharedArrayBuffer(42)),
		detached,
		accessor,
		new Proxy(codec.seal([]), { get: trap }),
	]) {
		expect(() => codec.open(input as Uint8Array)).toThrow(denied);
	}
	expect(trap).not.toHaveBeenCalled();
});
