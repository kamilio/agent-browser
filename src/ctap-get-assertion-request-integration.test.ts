import { expect, it, vi } from "vitest";
import { type CtapCborValue, decodeCtapCbor } from "./ctap-cbor.js";
import { encodeCtapGetAssertionRequest } from "./ctap-get-assertion-request.js";
import { decodeCtapGetInfoResponse } from "./ctap-get-info.js";
import { FidoHidCborConnection } from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyRequestOptions,
} from "./passkeys.js";

const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
const clientDataHash = Uint8Array.from(
	{ length: 32 },
	(_value, index) => index,
);
const expectedRequest = new Uint8Array([
	0x02,
	0xa4,
	0x01,
	0x61,
	0x61,
	0x02,
	0x58,
	0x20,
	...clientDataHash,
	0x03,
	0x81,
	0xa2,
	0x62,
	0x69,
	0x64,
	0x42,
	0x07,
	0x08,
	0x64,
	0x74,
	0x79,
	0x70,
	0x65,
	0x6a,
	0x70,
	0x75,
	0x62,
	0x6c,
	0x69,
	0x63,
	0x2d,
	0x6b,
	0x65,
	0x79,
	0x05,
	0xa2,
	0x62,
	0x75,
	0x70,
	0xf5,
	0x62,
	0x75,
	0x76,
	0xf4,
]);

function field(value: CtapCborValue, key: bigint | string): CtapCborValue {
	if (value.kind !== "map") throw new Error("Expected fixture map");
	const entry = value.entries.find(
		([candidate]) =>
			(candidate.kind === "unsigned" || candidate.kind === "text") &&
			candidate.value === key,
	);
	if (!entry) throw new Error("Missing fixture field");
	return entry[1];
}

it.each([
	{ inputReportBytes: 64, outputReportBytes: 64 },
	{ inputReportBytes: 7, outputReportBytes: 32 },
	{ inputReportBytes: 32, outputReportBytes: 7 },
])(
	"frames exact assertion bytes over synthetic $inputReportBytes/$outputReportBytes reports",
	async ({ inputReportBytes, outputReportBytes }) => {
		const encoded = encodeCtapGetAssertionRequest({
			rpId: "a",
			clientDataHash,
			allowList: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
		});
		expect(encoded).toEqual(expectedRequest);
		const incoming = [
			...encodeFidoHidMessage(
				channel,
				0x10,
				new Uint8Array([0x2e]),
				inputReportBytes,
			),
		];
		const writes: Uint8Array[] = [];
		const read = vi.fn(async () => {
			const report = incoming.shift();
			if (!report) throw new Error("Unexpected fixture read");
			return report;
		});
		const close = vi.fn(async () => undefined);
		const connection = new FidoHidCborConnection(
			channel,
			{
				read,
				async write(report) {
					writes.push(report.slice());
					return report.length;
				},
				close,
			},
			{ inputReportBytes, outputReportBytes },
		);
		try {
			expect(await connection.exchange(encoded)).toEqual({
				kind: "response",
				payload: new Uint8Array([0x2e]),
			});
			const assembler = new FidoHidMessageAssembler(channel, outputReportBytes);
			let assembled: ReturnType<FidoHidMessageAssembler["accept"]>;
			for (const report of writes) assembled = assembler.accept(report);
			expect(assembled).toMatchObject({
				command: 0x10,
				payload: expectedRequest,
			});
			expect(encoded).toEqual(expectedRequest);
			expect(incoming).toHaveLength(0);
			expect(connection.state).toBe("idle");
			expect(close).not.toHaveBeenCalled();
		} finally {
			await connection.close();
		}
		expect(close).toHaveBeenCalledTimes(1);
	},
);

it.each([undefined, 1024, 2048])(
	"uses decoded GetInfo maxMsgSize %s without assuming the HID ceiling is negotiated",
	(maximum) => {
		const response = new Uint8Array([
			0,
			maximum === undefined ? 0xa2 : 0xa3,
			1,
			0x81,
			0x68,
			...new TextEncoder().encode("FIDO_2_0"),
			3,
			0x50,
			...new Uint8Array(16),
			...(maximum === undefined ? [] : [5, 0x19, maximum >> 8, maximum & 255]),
		]);
		const result = decodeCtapGetInfoResponse(response);
		if (result.kind !== "info") throw new Error("Expected fixture info");
		const encode = () =>
			encodeCtapGetAssertionRequest(
				{
					rpId: "a".repeat(1449),
					clientDataHash,
				},
				result.info.maxMessageSize,
			);
		if (maximum === 2048) expect(encode()).toHaveLength(1500);
		else
			expect(encode).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
	},
);

it("keeps smaller report capacity enforcement before any synthetic I/O", async () => {
	const encoded = encodeCtapGetAssertionRequest({
		rpId: "a".repeat(206),
		clientDataHash,
	});
	expect(encoded).toHaveLength(256);
	const larger = encodeCtapGetAssertionRequest({
		rpId: "a".repeat(207),
		clientDataHash,
	});
	expect(larger).toHaveLength(257);
	const read = vi.fn(async () => {
		throw new Error("Unexpected fixture read");
	});
	const write = vi.fn(async (report: Uint8Array) => report.length);
	const close = vi.fn(async () => undefined);
	const connection = new FidoHidCborConnection(
		channel,
		{ read, write, close },
		{ outputReportBytes: 7 },
	);
	try {
		await expect(connection.exchange(larger)).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(connection.state).toBe("idle");
	} finally {
		await connection.close();
	}
	expect(close).toHaveBeenCalledTimes(1);
});

it.each([
	{ discoverable: false, verified: false },
	{ discoverable: false, verified: true },
	{ discoverable: true, verified: false },
	{ discoverable: true, verified: true },
])(
	"encodes broker-bound data with discoverable=$discoverable and UV=$verified",
	async ({ discoverable, verified }) => {
		const host = "login.fixture.invalid";
		const challenge = new Uint8Array([251, 255, 0]);
		const requests: Uint8Array[] = [];
		const provider: PasskeyAuthenticator = {
			capabilities: {
				algorithms: [-7],
				userVerification: true,
				residentKey: true,
				attachment: "cross-platform",
			},
			async create() {
				throw new Error("Unexpected fixture creation");
			},
			async get(context) {
				const allowList = context.options.allowCredentials?.map(
					(credential) => {
						if (!(credential.id instanceof Uint8Array))
							throw new Error("Expected broker-normalized ID");
						return { type: credential.type, id: credential.id };
					},
				);
				requests.push(
					encodeCtapGetAssertionRequest({
						rpId: context.rpId,
						clientDataHash: context.clientDataHash,
						allowList: allowList?.length ? allowList : undefined,
						userVerification: context.options.userVerification === "required",
					}),
				);
				const authenticatorData = new Uint8Array(37);
				authenticatorData.set(
					new Uint8Array(
						await crypto.subtle.digest(
							"SHA-256",
							new TextEncoder().encode(context.rpId),
						),
					),
				);
				authenticatorData[32] = verified ? 5 : 1;
				return {
					credentialId: new Uint8Array([7, 8]),
					authenticatorData,
					signature: new Uint8Array([9]),
					userHandle: discoverable ? new Uint8Array([10]) : null,
					userConsented: true,
					userPresent: true,
					userVerified: verified,
				};
			},
		};
		const broker = new PasskeyBroker(provider);
		const options: PasskeyRequestOptions = {
			challenge,
			userVerification: verified ? "required" : "discouraged",
			...(discoverable
				? {}
				: {
						allowCredentials: [
							{
								type: "public-key" as const,
								id: new Uint8Array([7, 8]),
								transports: ["usb" as const],
							},
						],
					}),
		};
		try {
			const result = await broker.get(options, {
				origin: `https://${host}`,
				topLevel: true,
				isCurrent: () => true,
			});
			expect(requests).toHaveLength(1);
			expect(requests[0][0]).toBe(2);
			const decoded = decodeCtapCbor(requests[0].subarray(1));
			expect(field(decoded, 1n)).toEqual({ kind: "text", value: host });
			const digest = new Uint8Array(
				await crypto.subtle.digest("SHA-256", result.response.clientDataJSON),
			);
			expect(field(decoded, 2n)).toEqual({ kind: "bytes", value: digest });
			expect(digest).not.toEqual(
				new Uint8Array(await crypto.subtle.digest("SHA-256", challenge)),
			);
			expect(field(field(decoded, 5n), "up")).toEqual({
				kind: "simple",
				value: 21,
			});
			expect(field(field(decoded, 5n), "uv")).toEqual({
				kind: "simple",
				value: verified ? 21 : 20,
			});
			if (discoverable)
				expect(() => field(decoded, 3n)).toThrow("Missing fixture field");
			else
				expect(field(decoded, 3n)).toEqual({
					kind: "array",
					items: [
						{
							kind: "map",
							entries: [
								[
									{ kind: "text", value: "id" },
									{ kind: "bytes", value: new Uint8Array([7, 8]) },
								],
								[
									{ kind: "text", value: "type" },
									{ kind: "text", value: "public-key" },
								],
							],
						},
					],
				});
			expect(
				JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
			).toMatchObject({
				type: "webauthn.get",
				origin: `https://${host}`,
				challenge: "-_8A",
			});
		} finally {
			broker.close();
		}
	},
);
