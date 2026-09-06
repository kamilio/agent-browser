import { afterEach, expect, it, vi } from "vitest";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyRequestOptions,
} from "./passkeys.js";

const host = "login.fixture.invalid";
const brokers: PasskeyBroker[] = [];
const counter = [0x12, 0x34, 0x56, 0x78];
const emptyMap = [0xa0];
const nonemptyMap = [0xa1, 0x63, 0x66, 0x6f, 0x6f, 0xf5];

interface LayoutCase {
	name: string;
	flags: number;
	tail: readonly number[];
}

afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
});

function context(): PasskeyContext {
	return {
		origin: `https://${host}`,
		topLevel: true,
		isCurrent: () => true,
	};
}

function request(): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([251, 255, 0]),
		rpId: host,
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
	};
}

async function assertion(
	flags = 1,
	tail: readonly number[] = [],
): Promise<PasskeyAssertion & { authenticatorData: Uint8Array<ArrayBuffer> }> {
	const authenticatorData = new Uint8Array(37 + tail.length);
	authenticatorData.set(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(host)),
		),
	);
	authenticatorData[32] = flags;
	authenticatorData.set(counter, 33);
	authenticatorData.set(tail, 37);
	return {
		credentialId: new Uint8Array([7, 8]),
		authenticatorData,
		signature: new Uint8Array([9]),
		userHandle: null,
		userConsented: true,
		userPresent: true,
		userVerified: (flags & 4) !== 0,
	};
}

function fixture(signed: PasskeyAssertion) {
	const get = vi.fn<PasskeyAuthenticator["get"]>(async () => signed);
	const provider: PasskeyAuthenticator = {
		capabilities: {
			algorithms: [-7],
			userVerification: true,
			residentKey: false,
			attachment: "cross-platform",
		},
		create: vi.fn<PasskeyAuthenticator["create"]>(async () => {
			throw new Error("Unexpected registration in assertion fixture");
		}),
		get,
	};
	const broker = new PasskeyBroker(provider);
	brokers.push(broker);
	return { broker, get };
}

const rejectedLayouts: LayoutCase[] = [
	{ name: "AT without ED or tail", flags: 0x41, tail: [] },
	{ name: "AT without ED but with tail", flags: 0x41, tail: emptyMap },
	{ name: "AT with ED but without tail", flags: 0xc1, tail: [] },
	{ name: "AT with ED and tail", flags: 0xc1, tail: nonemptyMap },
	{ name: "one-byte tail without ED", flags: 1, tail: emptyMap },
	{ name: "longer tail without ED", flags: 1, tail: nonemptyMap },
	{ name: "ED without tail", flags: 0x81, tail: [] },
];

it.each(rejectedLayouts)(
	"rejects $name and allows a later valid request",
	async ({ flags, tail }) => {
		const signed = await assertion(flags, tail);
		const original = signed.authenticatorData.slice();
		const { broker, get } = fixture(signed);
		await expect(broker.get(request(), context())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		expect(get).toHaveBeenCalledTimes(1);
		expect(signed.authenticatorData).toEqual(original);
		const valid = await assertion();
		get.mockResolvedValueOnce(valid);
		const result = await broker.get(request(), context());
		expect(get).toHaveBeenCalledTimes(2);
		expect(new Uint8Array(result.response.authenticatorData)).toEqual(
			valid.authenticatorData,
		);
	},
);

const acceptedLayouts: LayoutCase[] = [
	{ name: "37-byte UP prefix", flags: 1, tail: [] },
	{ name: "37-byte UP+UV prefix", flags: 5, tail: [] },
	{ name: "ED with an empty CBOR map", flags: 0x81, tail: emptyMap },
	{ name: "ED with a nonempty CBOR map", flags: 0x81, tail: nonemptyMap },
];

it.each(acceptedLayouts)("accepts $name", async ({ flags, tail }) => {
	const signed = await assertion(flags, tail);
	const { broker, get } = fixture(signed);
	const result = await broker.get(
		{
			...request(),
			userVerification: signed.userVerified ? "required" : "discouraged",
		},
		context(),
	);
	expect(get).toHaveBeenCalledTimes(1);
	expect(get.mock.calls[0][0].rpId).toBe(host);
	expect(result.response.authenticatorData.byteLength).toBe(37 + tail.length);
	expect(new Uint8Array(result.response.authenticatorData)).toEqual(
		signed.authenticatorData,
	);
});

it("preserves an opaque nonempty ED tail without claiming CBOR validation", async () => {
	const signed = await assertion(0x81, [0xff]);
	const { broker } = fixture(signed);
	const result = await broker.get(request(), context());
	expect(new Uint8Array(result.response.authenticatorData)).toEqual(
		signed.authenticatorData,
	);
	expect(Object.keys(result.response).sort()).toEqual([
		"authenticatorData",
		"clientDataJSON",
		"signature",
		"userHandle",
	]);
});

it.each([0, 8, 24])(
	"preserves modern backup bits %i without exposing trust claims",
	async (backupBits) => {
		const signed = await assertion(1 | backupBits);
		const { broker } = fixture(signed);
		const result = await broker.get(request(), context());
		expect(new Uint8Array(result.response.authenticatorData)).toEqual(
			signed.authenticatorData,
		);
		expect(Object.keys(result).sort()).toEqual([
			"id",
			"rawId",
			"response",
			"type",
		]);
		expect(Object.keys(result.response).sort()).toEqual([
			"authenticatorData",
			"clientDataJSON",
			"signature",
			"userHandle",
		]);
	},
);

it.each([2, 32, 34])(
	"leaves reserved bits %i uninterpreted",
	async (reservedBits) => {
		const signed = await assertion(1 | reservedBits);
		const { broker } = fixture(signed);
		const result = await broker.get(request(), context());
		expect(new Uint8Array(result.response.authenticatorData)).toEqual(
			signed.authenticatorData,
		);
	},
);

const copiedLayouts: LayoutCase[] = [
	{ name: "prefix without tail", flags: 5, tail: [] },
	{ name: "prefix and empty CBOR map", flags: 0x85, tail: emptyMap },
	{ name: "prefix and nonempty CBOR map", flags: 0x85, tail: nonemptyMap },
];

it.each(copiedLayouts)(
	"copies $name from a bounded provider view",
	async ({ flags, tail }) => {
		const signed = await assertion(flags, tail);
		const expected = signed.authenticatorData.slice();
		const backing = new Uint8Array(expected.length + 8).fill(0xee);
		backing.set(expected, 4);
		signed.authenticatorData = backing.subarray(4, 4 + expected.length);
		const { broker } = fixture(signed);
		const result = await broker.get(request(), context());
		const returned = new Uint8Array(result.response.authenticatorData);
		expect(returned.buffer).not.toBe(backing.buffer);
		expect(returned).toEqual(expected);
		expect(returned.subarray(0, 32)).toEqual(expected.subarray(0, 32));
		expect(returned[32]).toBe(flags);
		expect(returned.subarray(33, 37)).toEqual(new Uint8Array(counter));
		expect(new DataView(returned.buffer).getUint32(33)).toBe(0x12345678);
		expect(returned.subarray(37)).toEqual(new Uint8Array(tail));
		returned.fill(0);
		expect(signed.authenticatorData).toEqual(expected);
		returned.set(expected);
		backing.fill(0xff);
		expect(returned).toEqual(expected);
	},
);

interface BackupConsentCase {
	backupBits: number;
	field: "userConsented" | "userPresent" | "userVerified";
}

const backupConsentCases: BackupConsentCase[] = [
	{ backupBits: 8, field: "userConsented" },
	{ backupBits: 8, field: "userPresent" },
	{ backupBits: 8, field: "userVerified" },
	{ backupBits: 24, field: "userConsented" },
	{ backupBits: 24, field: "userPresent" },
	{ backupBits: 24, field: "userVerified" },
];

it.each(backupConsentCases)(
	"does not let backup bits $backupBits substitute for $field",
	async ({ backupBits, field }) => {
		const signed = await assertion(1 | backupBits);
		signed[field] = false;
		const { broker, get } = fixture(signed);
		await expect(
			broker.get(
				{
					...request(),
					userVerification:
						field === "userVerified" ? "required" : "discouraged",
				},
				context(),
			),
		).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(get).toHaveBeenCalledTimes(1);
	},
);
