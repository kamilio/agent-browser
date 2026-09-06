import { expect, it, vi } from "vitest";
import { type CtapCborValue, decodeCtapCbor } from "./ctap-cbor.js";
import { decodeCtapGetInfoResponse } from "./ctap-get-info.js";
import {
	type CtapMakeCredentialRequest,
	encodeCtapMakeCredentialRequest,
} from "./ctap-make-credential-request.js";
import { FidoHidCborConnection } from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";
import {
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyCreationOptions,
} from "./passkeys.js";

const channel = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
const clientDataHash = Uint8Array.from(
	{ length: 32 },
	(_value, index) => index,
);
const expectedRequest = new Uint8Array([
	0x01, 0xa5, 0x01, 0x58, 0x20, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
	0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14,
	0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x02, 0xa1,
	0x62, 0x69, 0x64, 0x61, 0x61, 0x03, 0xa1, 0x62, 0x69, 0x64, 0x42, 0x07, 0x08,
	0x04, 0x81, 0xa2, 0x63, 0x61, 0x6c, 0x67, 0x26, 0x64, 0x74, 0x79, 0x70, 0x65,
	0x6a, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0x2d, 0x6b, 0x65, 0x79, 0x07, 0xa2,
	0x62, 0x72, 0x6b, 0xf4, 0x62, 0x75, 0x76, 0xf4,
]);

function request(rpId = "a"): CtapMakeCredentialRequest {
	return {
		clientDataHash,
		rp: { id: rpId },
		user: { id: new Uint8Array([7, 8]) },
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}

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
	"frames exact creation bytes over synthetic $inputReportBytes/$outputReportBytes reports",
	async ({ inputReportBytes, outputReportBytes }) => {
		const encoded = encodeCtapMakeCredentialRequest(request());
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
			for (const report of writes) {
				expect(report).toHaveLength(outputReportBytes);
				assembled = assembler.accept(report);
			}
			expect(writes.length).toBeGreaterThan(1);
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

it.each([undefined, 1024, 1499, 1500, 2048])(
	"maps GetInfo maxMsgSize %s to the complete creation command limit",
	(maximum) => {
		const response = new Uint8Array([
			0,
			maximum === undefined ? 0xa2 : 0xa3,
			1,
			0x81,
			0x68,
			0x46,
			0x49,
			0x44,
			0x4f,
			0x5f,
			0x32,
			0x5f,
			0x30,
			3,
			0x50,
			...new Uint8Array(16),
			...(maximum === undefined ? [] : [5, 0x19, maximum >> 8, maximum & 255]),
		]);
		const result = decodeCtapGetInfoResponse(response);
		if (result.kind !== "info") throw new Error("Expected fixture info");
		expect(result.info.maxMessageSize).toBe(
			maximum === undefined ? undefined : BigInt(maximum),
		);
		expect(
			encodeCtapMakeCredentialRequest(request(), result.info.maxMessageSize),
		).toEqual(expectedRequest);
		const encode = () =>
			encodeCtapMakeCredentialRequest(
				request("a".repeat(1413)),
				result.info.maxMessageSize,
			);
		if (maximum !== undefined && maximum >= 1500) {
			const encoded = encode();
			expect(encoded).toHaveLength(1500);
			expect(encoded[0]).toBe(1);
		} else {
			expect(encode).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		}
	},
);

it.each([
	{ label: "short hash", hashBytes: 31, rpChars: 1, code: "invalid-input" },
	{ label: "long hash", hashBytes: 33, rpChars: 1, code: "invalid-input" },
	{
		label: "default wire cap",
		hashBytes: 32,
		rpChars: 1413,
		code: "resource-limit",
	},
])(
	"rejects $label before synthetic I/O",
	async ({ hashBytes, rpChars, code }) => {
		const read = vi.fn(async () => {
			throw new Error("Unexpected fixture read");
		});
		const write = vi.fn(async (report: Uint8Array) => report.length);
		const close = vi.fn(async () => undefined);
		const connection = new FidoHidCborConnection(channel, {
			read,
			write,
			close,
		});
		const exchange = async () =>
			connection.exchange(
				encodeCtapMakeCredentialRequest({
					...request("a".repeat(rpChars)),
					clientDataHash: new Uint8Array(hashBytes),
				}),
			);
		try {
			await expect(exchange()).rejects.toMatchObject({ code });
			expect(read).not.toHaveBeenCalled();
			expect(write).not.toHaveBeenCalled();
			expect(close).not.toHaveBeenCalled();
			expect(connection.state).toBe("idle");
		} finally {
			await connection.close();
		}
		expect(close).toHaveBeenCalledTimes(1);
	},
);

it("enforces the smaller output report ceiling before synthetic I/O", async () => {
	const encoded = encodeCtapMakeCredentialRequest(request("a".repeat(170)));
	const larger = encodeCtapMakeCredentialRequest(request("a".repeat(171)));
	expect(encoded).toHaveLength(256);
	expect(larger).toHaveLength(257);
	const read = vi.fn(async () => {
		throw new Error("Unexpected fixture read");
	});
	const write = vi.fn(async (report: Uint8Array) => report.length);
	const close = vi.fn(async () => undefined);
	const connection = new FidoHidCborConnection(
		channel,
		{ read, write, close },
		{ inputReportBytes: 64, outputReportBytes: 7 },
	);
	try {
		await expect(connection.exchange(larger)).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(read).not.toHaveBeenCalled();
		expect(write).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		expect(connection.state).toBe("idle");
	} finally {
		await connection.close();
	}
	expect(close).toHaveBeenCalledTimes(1);
});

it.each([
	{
		resident: false,
		verified: false,
		exclusions: "omitted",
		explicitRp: false,
	},
	{ resident: true, verified: false, exclusions: "empty", explicitRp: true },
	{ resident: false, verified: true, exclusions: "present", explicitRp: false },
	{ resident: true, verified: true, exclusions: "present", explicitRp: true },
])(
	"captures exact-host broker creation with RK=$resident UV=$verified exclusions=$exclusions then rejects synthetically",
	async ({ resident, verified, exclusions, explicitRp }) => {
		const host = "login.fixture.invalid";
		const challenge = new Uint8Array([251, 255, 0]);
		const userId = new Uint8Array([99, 7, 8, 99]);
		const excludedId = new Uint8Array([99, 9, 10, 99]);
		const requests: Uint8Array[] = [];
		const syntheticError = new Error(
			"Synthetic creation stopped after encoding.",
		);
		const create = vi.fn(
			async (context: Parameters<PasskeyAuthenticator["create"]>[0]) => {
				const user = context.options.user;
				if (!(user.id instanceof Uint8Array))
					throw new Error("Expected broker-normalized user ID");
				const excludeList = context.options.excludeCredentials?.map(
					(credential) => {
						if (!(credential.id instanceof Uint8Array))
							throw new Error("Expected broker-normalized exclusion ID");
						return { type: credential.type, id: credential.id };
					},
				);
				requests.push(
					encodeCtapMakeCredentialRequest({
						clientDataHash: context.clientDataHash,
						rp: { id: context.rpId, name: context.options.rp.name },
						user: {
							id: user.id,
							name: user.name,
							displayName: user.displayName,
						},
						pubKeyCredParams: context.options.pubKeyCredParams,
						...(excludeList?.length ? { excludeList } : {}),
						residentKey:
							context.options.authenticatorSelection?.residentKey ===
							"required",
						userVerification:
							context.options.authenticatorSelection?.userVerification ===
							"required",
					}),
				);
				throw syntheticError;
			},
		);
		const get = vi.fn(async () => {
			throw new Error("Unexpected fixture assertion");
		});
		const provider: PasskeyAuthenticator = {
			capabilities: {
				algorithms: [-7, -8],
				userVerification: true,
				residentKey: true,
				attachment: "cross-platform",
			},
			create,
			get,
		};
		const broker = new PasskeyBroker(provider);
		const options: PasskeyCreationOptions = {
			challenge: new DataView(challenge.buffer),
			rp: { name: "Fixture RP", ...(explicitRp ? { id: host } : {}) },
			user: {
				id: new DataView(userId.buffer, 1, 2),
				name: "fixture-user",
				displayName: "Fixture User",
			},
			pubKeyCredParams: [-257, -7, -8, -7].map((alg) => ({
				type: "public-key",
				alg,
			})),
			authenticatorSelection: {
				residentKey: resident ? "required" : "discouraged",
				userVerification: verified ? "required" : "discouraged",
			},
			...(exclusions === "omitted"
				? {}
				: {
						excludeCredentials:
							exclusions === "empty"
								? []
								: [
										{
											type: "public-key" as const,
											id: new DataView(excludedId.buffer, 1, 2),
											transports: ["usb" as const],
										},
									],
					}),
		};
		try {
			await expect(
				broker.create(options, {
					origin: `https://${host}`,
					topLevel: true,
					isCurrent: () => true,
				}),
			).rejects.toMatchObject({
				name: "UnknownError",
				message: "Passkey authenticator failed",
			});
			expect(create).toHaveBeenCalledTimes(1);
			expect(get).not.toHaveBeenCalled();
			await expect(create.mock.results[0].value).rejects.toBe(syntheticError);
			const context = create.mock.calls[0][0];
			const parameters = [-7, -8, -7].map((alg) => ({
				type: "public-key",
				alg,
			}));
			expect(context.rpId).toBe(host);
			expect(context.options).toMatchObject({
				challenge,
				rp: { id: host, name: "Fixture RP" },
				user: {
					id: new Uint8Array([7, 8]),
					name: "fixture-user",
					displayName: "Fixture User",
				},
				pubKeyCredParams: parameters,
				authenticatorSelection: {
					residentKey: resident ? "required" : "discouraged",
					requireResidentKey: resident,
					userVerification: verified ? "required" : "discouraged",
				},
				attestation: "none",
			});
			expect(context.options.user.id).not.toBe(options.user.id);
			const expectedClientData = new TextEncoder().encode(
				JSON.stringify({
					type: "webauthn.create",
					challenge: "-_8A",
					origin: `https://${host}`,
					crossOrigin: false,
				}),
			);
			expect(context.clientDataJSON).toEqual(expectedClientData);
			const digest = new Uint8Array(
				await crypto.subtle.digest("SHA-256", expectedClientData),
			);
			expect(context.clientDataHash).toEqual(digest);
			expect(digest).not.toEqual(
				new Uint8Array(await crypto.subtle.digest("SHA-256", challenge)),
			);
			expect(requests).toHaveLength(1);
			expect(requests[0][0]).toBe(1);
			const decoded = decodeCtapCbor(requests[0].subarray(1));
			if (decoded.kind !== "map") throw new Error("Expected fixture map");
			expect(decoded.entries.map(([key]) => key)).toEqual(
				[1n, 2n, 3n, 4n, ...(exclusions === "present" ? [5n] : []), 7n].map(
					(value) => ({ kind: "unsigned", value }),
				),
			);
			expect(field(decoded, 1n)).toEqual({ kind: "bytes", value: digest });
			expect(field(field(decoded, 2n), "id")).toEqual({
				kind: "text",
				value: host,
			});
			expect(field(field(decoded, 2n), "name")).toEqual({
				kind: "text",
				value: "Fixture RP",
			});
			expect(field(field(decoded, 3n), "id")).toEqual({
				kind: "bytes",
				value: new Uint8Array([7, 8]),
			});
			expect(field(field(decoded, 3n), "name")).toEqual({
				kind: "text",
				value: "fixture-user",
			});
			expect(field(field(decoded, 3n), "displayName")).toEqual({
				kind: "text",
				value: "Fixture User",
			});
			const algorithms = field(decoded, 4n);
			if (algorithms.kind !== "array")
				throw new Error("Expected fixture array");
			expect(algorithms.items.map((item) => field(item, "alg"))).toEqual(
				[-7n, -8n, -7n].map((value) => ({ kind: "negative", value })),
			);
			expect(algorithms.items.map((item) => field(item, "type"))).toEqual(
				parameters.map(() => ({ kind: "text", value: "public-key" })),
			);
			expect(field(decoded, 7n)).toEqual({
				kind: "map",
				entries: [
					[
						{ kind: "text", value: "rk" },
						{ kind: "simple", value: resident ? 21 : 20 },
					],
					[
						{ kind: "text", value: "uv" },
						{ kind: "simple", value: verified ? 21 : 20 },
					],
				],
			});
			if (exclusions === "present") {
				expect(field(decoded, 5n)).toEqual({
					kind: "array",
					items: [
						{
							kind: "map",
							entries: [
								[
									{ kind: "text", value: "id" },
									{ kind: "bytes", value: new Uint8Array([9, 10]) },
								],
								[
									{ kind: "text", value: "type" },
									{ kind: "text", value: "public-key" },
								],
							],
						},
					],
				});
			} else {
				expect(context.options.excludeCredentials).toEqual([]);
				expect(() => field(decoded, 5n)).toThrow("Missing fixture field");
			}
			expect(challenge).toEqual(new Uint8Array([251, 255, 0]));
			expect(userId).toEqual(new Uint8Array([99, 7, 8, 99]));
			expect(excludedId).toEqual(new Uint8Array([99, 9, 10, 99]));
		} finally {
			broker.close();
		}
	},
);
