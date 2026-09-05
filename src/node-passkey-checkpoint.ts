import {
	type KeyObject,
	createCipheriv,
	createDecipheriv,
	createPrivateKey,
	generateKeyPairSync,
	randomBytes,
} from "node:crypto";
import { types } from "node:util";
import { passkeyLimits } from "./passkeys.js";

export interface NodePasskeyCheckpointRecord {
	id: Uint8Array;
	rpId: string;
	user: { id: Uint8Array; name: string; displayName: string };
	privateKey: KeyObject;
	counter: number;
}

const magic = Buffer.from([65, 66, 80, 75, 67, 80, 1, 0]);
const headerBytes = 24;
const tagBytes = 16;
const privateKeyBytes = 256;
const rpBytes = 253;
const userIdBytes = 64;
const nameBytes = passkeyLimits.nameChars * 3;
const maximumPlaintextBytes =
	2 +
	passkeyLimits.credentialCount *
		(16 +
			passkeyLimits.credentialIdBytes +
			rpBytes +
			userIdBytes +
			nameBytes * 2 +
			privateKeyBytes);
const maximumEnvelopeBytes = headerBytes + maximumPlaintextBytes + tagBytes;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const bufferGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"buffer",
)?.get;
const offsetGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteOffset",
)?.get;
const lengthGetter = Object.getOwnPropertyDescriptor(
	typedArrayPrototype,
	"byteLength",
)?.get;
let privatePrototype: object | undefined;

function deny(): never {
	throw new Error("Passkey checkpoint operation denied");
}

function dictionary(value: unknown, names: readonly string[]) {
	if (
		!value ||
		typeof value !== "object" ||
		types.isProxy(value) ||
		![Object.prototype, null].includes(Object.getPrototypeOf(value))
	)
		deny();
	const keys = Reflect.ownKeys(value);
	if (keys.length !== names.length) deny();
	const result: Record<string, unknown> = Object.create(null);
	for (const name of names) {
		const field = Object.getOwnPropertyDescriptor(value, name);
		if (!field || !Object.hasOwn(field, "value")) deny();
		result[name] = field.value;
	}
	return result;
}

function byteView(value: unknown, maximum: number, minimum = 1): Buffer {
	if (
		types.isProxy(value) ||
		!types.isUint8Array(value) ||
		![Uint8Array.prototype, Buffer.prototype].includes(
			Object.getPrototypeOf(value),
		)
	)
		deny();
	const length = lengthGetter?.call(value) as number;
	if (length < minimum || length > maximum) deny();
	const buffer = bufferGetter?.call(value) as ArrayBuffer;
	if (!types.isArrayBuffer(buffer)) deny();
	if (Reflect.ownKeys(value).length !== length) deny();
	return Buffer.from(buffer, offsetGetter?.call(value) as number, length);
}

function text(value: unknown): string {
	if (
		typeof value !== "string" ||
		!value.length ||
		value.length > passkeyLimits.nameChars
	)
		deny();
	for (const character of value) {
		const code = character.codePointAt(0) as number;
		if (code < 32 || code === 127 || (code >= 0xd800 && code <= 0xdfff)) deny();
	}
	return value;
}

function relyingParty(value: unknown): string {
	if (
		typeof value !== "string" ||
		value.length > rpBytes ||
		!value.includes(".") ||
		/^[0-9.]+$/.test(value) ||
		!value
			.split(".")
			.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
		new URL(`https://${value}`).hostname !== value
	)
		deny();
	return value;
}

function privateKey(value: unknown): KeyObject {
	if (!types.isKeyObject(value) || types.isProxy(value)) deny();
	privatePrototype ??= Object.getPrototypeOf(
		generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey,
	);
	if (Object.getPrototypeOf(value) !== privatePrototype) deny();
	for (const name of Reflect.ownKeys(value)) {
		const field = Object.getOwnPropertyDescriptor(value, name);
		if (typeof name !== "symbol" || !field || !Object.hasOwn(field, "value"))
			deny();
	}
	const key = value as KeyObject;
	if (
		key.type !== "private" ||
		key.asymmetricKeyType !== "ec" ||
		key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
	)
		deny();
	return key;
}

function records(value: unknown): NodePasskeyCheckpointRecord[] {
	if (
		!Array.isArray(value) ||
		types.isProxy(value) ||
		Object.getPrototypeOf(value) !== Array.prototype ||
		value.length > passkeyLimits.credentialCount ||
		Reflect.ownKeys(value).length !== value.length + 1
	)
		deny();
	const result: NodePasskeyCheckpointRecord[] = [];
	for (let index = 0; index < value.length; index++) {
		const field = Object.getOwnPropertyDescriptor(value, String(index));
		if (!field || !Object.hasOwn(field, "value")) deny();
		const record = dictionary(field.value, [
			"id",
			"rpId",
			"user",
			"privateKey",
			"counter",
		]);
		const user = dictionary(record.user, ["id", "name", "displayName"]);
		if (
			typeof record.counter !== "number" ||
			!Number.isInteger(record.counter) ||
			Object.is(record.counter, -0) ||
			record.counter < 0 ||
			record.counter > 0xffffffff
		)
			deny();
		result.push({
			id: byteView(record.id, passkeyLimits.credentialIdBytes),
			rpId: relyingParty(record.rpId),
			user: {
				id: byteView(user.id, userIdBytes),
				name: text(user.name),
				displayName: text(user.displayName),
			},
			privateKey: privateKey(record.privateKey),
			counter: record.counter,
		});
	}
	result.sort((first, second) => Buffer.compare(first.id, second.id));
	for (let index = 1; index < result.length; index++) {
		if (Buffer.compare(result[index - 1].id, result[index].id) === 0) deny();
	}
	return result;
}

function serialize(value: unknown, plaintext: Buffer): number {
	const entries = records(value);
	plaintext.writeUInt16BE(entries.length, 0);
	let offset = 2;
	const write = (bytes: Uint8Array) => {
		plaintext.writeUInt16BE(bytes.length, offset);
		offset += 2;
		plaintext.set(bytes, offset);
		offset += bytes.length;
	};
	const writeText = (value: string) => {
		const length = Buffer.byteLength(value, "utf8");
		plaintext.writeUInt16BE(length, offset);
		offset += 2;
		offset += plaintext.write(value, offset, length, "utf8");
	};
	for (const record of entries) {
		write(record.id);
		writeText(record.rpId);
		write(record.user.id);
		writeText(record.user.name);
		writeText(record.user.displayName);
		plaintext.writeUInt32BE(record.counter, offset);
		offset += 4;
		const encoded = record.privateKey.export({ format: "der", type: "pkcs8" });
		try {
			if (!encoded.length || encoded.length > privateKeyBytes) deny();
			write(encoded);
		} finally {
			encoded.fill(0);
		}
	}
	return offset;
}

function parse(plaintext: Buffer): NodePasskeyCheckpointRecord[] {
	let offset = 0;
	const take = (length: number) => {
		if (length > plaintext.length - offset) deny();
		const bytes = plaintext.subarray(offset, offset + length);
		offset += length;
		return bytes;
	};
	const read = (maximum: number) => {
		const length = take(2).readUInt16BE(0);
		if (!length || length > maximum) deny();
		return take(length);
	};
	const readText = (maximum: number) => {
		const bytes = read(maximum);
		const decoded = bytes.toString("utf8");
		const encoded = Buffer.from(decoded, "utf8");
		try {
			if (!encoded.equals(bytes)) deny();
		} finally {
			encoded.fill(0);
		}
		return decoded;
	};
	const count = take(2).readUInt16BE(0);
	if (count > passkeyLimits.credentialCount) deny();
	const result: NodePasskeyCheckpointRecord[] = [];
	let previousId: Buffer | undefined;
	for (let index = 0; index < count; index++) {
		const id = read(passkeyLimits.credentialIdBytes);
		if (previousId && Buffer.compare(previousId, id) >= 0) deny();
		previousId = id;
		const rpId = relyingParty(readText(rpBytes));
		const userId = read(userIdBytes);
		const name = text(readText(nameBytes));
		const displayName = text(readText(nameBytes));
		const counter = take(4).readUInt32BE(0);
		const encoded = read(privateKeyBytes);
		const key = privateKey(
			createPrivateKey({ key: encoded, format: "der", type: "pkcs8" }),
		);
		const canonical = key.export({ format: "der", type: "pkcs8" });
		try {
			if (!canonical.equals(encoded)) deny();
		} finally {
			canonical.fill(0);
		}
		result.push({
			id,
			rpId,
			user: { id: userId, name, displayName },
			privateKey: key,
			counter,
		});
	}
	if (offset !== plaintext.length) deny();
	return result.map((record) => ({
		...record,
		id: new Uint8Array(record.id),
		user: { ...record.user, id: new Uint8Array(record.user.id) },
	}));
}

export class NodePasskeyCheckpointCodec {
	#key: Buffer;
	#closed = false;

	constructor(key: Uint8Array) {
		try {
			this.#key = Buffer.alloc(32);
			this.#key.set(byteView(key, 32, 32));
		} catch {
			deny();
		}
	}

	close(): void {
		this.#closed = true;
		this.#key.fill(0);
	}

	seal(value: readonly NodePasskeyCheckpointRecord[]): Buffer {
		let plaintext: Buffer | undefined;
		try {
			if (this.#closed) deny();
			plaintext = Buffer.alloc(maximumPlaintextBytes);
			const length = serialize(value, plaintext);
			const header = Buffer.alloc(headerBytes);
			header.set(magic);
			header.writeUInt32BE(length, magic.length);
			header.set(randomBytes(12), 12);
			const cipher = createCipheriv(
				"aes-256-gcm",
				this.#key,
				header.subarray(12),
				{ authTagLength: tagBytes },
			);
			cipher.setAAD(header);
			return Buffer.concat([
				header,
				cipher.update(plaintext.subarray(0, length)),
				cipher.final(),
				cipher.getAuthTag(),
			]);
		} catch {
			return deny();
		} finally {
			plaintext?.fill(0);
		}
	}

	open(value: Uint8Array): NodePasskeyCheckpointRecord[] {
		const owned: Buffer[] = [];
		try {
			if (this.#closed) deny();
			const envelope = Buffer.from(
				byteView(value, maximumEnvelopeBytes, headerBytes + tagBytes + 2),
			);
			const header = envelope.subarray(0, headerBytes);
			if (!header.subarray(0, magic.length).equals(magic)) deny();
			const length = header.readUInt32BE(magic.length);
			if (
				length < 2 ||
				length > maximumPlaintextBytes ||
				envelope.length !== headerBytes + length + tagBytes
			)
				deny();
			const decipher = createDecipheriv(
				"aes-256-gcm",
				this.#key,
				header.subarray(12),
				{ authTagLength: tagBytes },
			);
			decipher.setAAD(header);
			decipher.setAuthTag(envelope.subarray(headerBytes + length));
			owned.push(decipher.update(envelope.subarray(headerBytes, -tagBytes)));
			owned.push(decipher.final());
			const plaintext = Buffer.concat(owned);
			owned.push(plaintext);
			return parse(plaintext);
		} catch {
			return deny();
		} finally {
			for (const bytes of owned) bytes.fill(0);
		}
	}
}
