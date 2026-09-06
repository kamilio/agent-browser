import { afterEach, expect, it } from "vitest";
import {
	type CtapMakeCredentialRequest,
	encodeCtapMakeCredentialRequest,
} from "./ctap-make-credential-request.js";
import {
	type CtapRegistrationTransactionOptions,
	makeCtapCredential,
} from "./ctap-registration-transaction.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import {
	FidoHidCborConnection,
	type FidoHidReportTransport,
} from "./fido-hid-connection.js";
import { FidoHidMessageAssembler } from "./fido-hid-message.js";
import { encodeFidoHidMessage } from "./fido-hid-packets.js";

const channel = new Uint8Array([0x12, 0x34, 0xab, 0xcd]);
const rpHash = new Uint8Array([
	0xca, 0x97, 0x81, 0x12, 0xca, 0x1b, 0xbd, 0xca, 0xfa, 0xc2, 0x31, 0xb3, 0x9a,
	0x23, 0xdc, 0x4d, 0xa7, 0x86, 0xef, 0xf8, 0x14, 0x7c, 0x4e, 0x72, 0xb9, 0x80,
	0x77, 0x85, 0xaf, 0xee, 0x48, 0xbb,
]);
const credentialId = new Uint8Array([0x91, 0x92, 0x93]);
const privateText = "SYNTHETIC_PRIVATE_REGISTRATION";
const connections: FidoHidCborConnection[] = [];
type RegistrationResult = Awaited<ReturnType<typeof makeCtapCredential>>;

function header(major: number, length: number): number[] {
	if (length < 24) return [major | length];
	if (length < 256) return [major | 24, length];
	return [major | 25, length >>> 8, length & 255];
}

function bytes(value: readonly number[] | Uint8Array): number[] {
	return [...header(0x40, value.length), ...value];
}

function text(value: string): number[] {
	const encoded = new TextEncoder().encode(value);
	return [...header(0x60, encoded.length), ...encoded];
}

function map(entries: readonly (readonly number[])[]): number[] {
	return [...header(0xa0, entries.length), ...entries.flat()];
}

function publicKey(algorithm = -7): number[] {
	const coordinate = new Uint8Array(32).fill(0x53);
	if (algorithm === -8)
		return map([
			[0x01, 0x01],
			[0x03, 0x27],
			[0x20, 0x06],
			[0x21, ...bytes(coordinate)],
		]);
	return map([
		[0x01, 0x02],
		[0x03, 0x26],
		[0x20, 0x01],
		[0x21, ...bytes(coordinate)],
		[0x22, ...bytes(new Uint8Array(32).fill(0x67))],
	]);
}

interface ReplyOptions {
	flags?: number;
	hash?: Uint8Array;
	algorithm?: number;
	identifier?: Uint8Array;
	tail?: readonly number[];
	statementData?: Uint8Array;
}

function authenticatorData(options: ReplyOptions = {}): Uint8Array {
	const identifier = options.identifier ?? credentialId;
	return new Uint8Array([
		...(options.hash ?? rpHash),
		options.flags ?? 0x41,
		0x12,
		0x34,
		0x56,
		0x78,
		...new Uint8Array(16).fill(0x81),
		identifier.length >>> 8,
		identifier.length & 255,
		...identifier,
		...publicKey(options.algorithm),
		...(options.tail ?? []),
	]);
}

function reply(options: ReplyOptions = {}): Uint8Array {
	return new Uint8Array([
		0,
		...map([
			[0x01, ...text("synthetic")],
			[0x02, ...bytes(authenticatorData(options))],
			[
				0x03,
				...map([
					[
						...text("sig"),
						...bytes(options.statementData ?? new Uint8Array([0x71, 0x72])),
					],
				]),
			],
		]),
	]);
}

function request(): CtapMakeCredentialRequest {
	return {
		clientDataHash: Uint8Array.from({ length: 32 }, (_value, index) => index),
		rp: { id: "a" },
		user: { id: new Uint8Array([0x41, 0x42]) },
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}

function expectedRequest(): Uint8Array {
	return new Uint8Array([
		0x01,
		0xa5,
		0x01,
		0x58,
		0x20,
		...Array.from({ length: 32 }, (_value, index) => index),
		0x02,
		0xa1,
		0x62,
		0x69,
		0x64,
		0x61,
		0x61,
		0x03,
		0xa1,
		0x62,
		0x69,
		0x64,
		0x42,
		0x41,
		0x42,
		0x04,
		0x81,
		0xa2,
		0x63,
		0x61,
		0x6c,
		0x67,
		0x26,
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
		0x07,
		0xa2,
		0x62,
		0x72,
		0x6b,
		0xf4,
		0x62,
		0x75,
		0x76,
		0xf4,
	]);
}

class MemoryTransport implements FidoHidReportTransport {
	readonly reports: Uint8Array[] = [];
	readonly incoming: Uint8Array[] = [];
	readCalls = 0;
	closeCalls = 0;

	write(report: Uint8Array): Promise<number> {
		this.reports.push(report.slice());
		return Promise.resolve(report.length);
	}

	read(): Promise<Uint8Array> {
		this.readCalls++;
		const report = this.incoming.shift();
		return report
			? Promise.resolve(report)
			: Promise.reject(new Error("Synthetic registration reports exhausted."));
	}

	close(): Promise<void> {
		this.closeCalls++;
		return Promise.resolve();
	}

	deliver(payload: Uint8Array, command = 0x10): void {
		this.incoming.push(...encodeFidoHidMessage(channel, command, payload, 64));
	}
}

function create(...payloads: Uint8Array[]) {
	const transport = new MemoryTransport();
	for (const payload of payloads) transport.deliver(payload);
	const connection = new FidoHidCborConnection(channel, transport);
	connections.push(connection);
	return { connection, transport };
}

function messages(transport: MemoryTransport) {
	const output: Array<{ command: number; payload: Uint8Array }> = [];
	let assembler = new FidoHidMessageAssembler(channel, 64);
	try {
		for (const report of transport.reports) {
			const message = assembler.accept(report);
			if (message) {
				output.push({ command: message.command, payload: message.payload });
				assembler = new FidoHidMessageAssembler(channel, 64);
			}
		}
	} finally {
		assembler.close();
	}
	return output;
}

function oneExchange(transport: MemoryTransport, wire?: Uint8Array) {
	const sent = messages(transport);
	expect(sent).toHaveLength(1);
	expect(sent[0].command).toBe(0x10);
	expect(sent[0].payload[0]).toBe(0x01);
	if (wire !== undefined) expect(sent[0].payload).toEqual(wire);
	return sent[0].payload;
}

function created(result: RegistrationResult) {
	expect(result.kind).toBe("credential");
	if (result.kind !== "credential")
		throw new Error("Expected a synthetic created credential.");
	return result.credential;
}

async function rejects(operation: Promise<unknown>, code: ErrorCode) {
	let caught: unknown;
	try {
		await operation;
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(AgentBrowserError);
	if (!(caught instanceof AgentBrowserError))
		throw new Error("Expected a synthetic registration rejection.");
	expect(caught.code).toBe(code);
	expect(caught.message).toBe("CTAP registration transaction failed.");
	expect(caught.cause).toBeUndefined();
	expect(caught.stack).not.toContain(privateText);
	expect(JSON.stringify(caught)).not.toContain(privateText);
}

function untouched(
	connection: FidoHidCborConnection,
	transport: MemoryTransport,
) {
	expect(connection.state).toBe("idle");
	expect(transport.reports).toHaveLength(0);
	expect(transport.readCalls).toBe(0);
	expect(transport.closeCalls).toBe(0);
}

async function quarantined(
	connection: FidoHidCborConnection,
	transport: MemoryTransport,
) {
	expect(["closing", "closed"]).toContain(connection.state);
	const reportCount = transport.reports.length;
	await rejects(makeCtapCredential(connection, request()), "closed");
	expect(transport.reports).toHaveLength(reportCount);
	expect(transport.closeCalls).toBe(1);
}

async function denied(
	supplied: CtapMakeCredentialRequest,
	payload: Uint8Array,
	code: ErrorCode = "policy-denied",
) {
	const { connection, transport } = create(payload);
	const wire = encodeCtapMakeCredentialRequest(supplied);
	await rejects(makeCtapCredential(connection, supplied), code);
	oneExchange(transport, wire);
	await quarantined(connection, transport);
}

afterEach(async () => {
	try {
		await Promise.all(connections.map((connection) => connection.close()));
	} finally {
		connections.length = 0;
	}
});

it("binds the known SHA256 of RP a to one independent MakeCredential wire", async () => {
	const supplied = request();
	const sourceHash = supplied.clientDataHash.slice();
	const sourceUser = supplied.user.id.slice();
	const sourceReply = reply();
	const replyBefore = sourceReply.slice();
	const { connection, transport } = create(sourceReply);
	const credential = created(await makeCtapCredential(connection, supplied));
	expect(credential).toEqual({
		format: "synthetic",
		authenticatorData: authenticatorData(),
		attestationStatement: {
			kind: "map",
			entries: [
				[
					{ kind: "text", value: "sig" },
					{ kind: "bytes", value: new Uint8Array([0x71, 0x72]) },
				],
			],
		},
		attestedCredentialData: {
			rpIdHash: rpHash,
			flags: 0x41,
			signatureCounter: 0x12345678,
			aaguid: new Uint8Array(16).fill(0x81),
			credentialId,
			credentialPublicKey: {
				kind: "ec2",
				algorithm: -7,
				curve: 1,
				x: new Uint8Array(32).fill(0x53),
				y: new Uint8Array(32).fill(0x67),
			},
			credentialPublicKeyBytes: new Uint8Array(publicKey()),
		},
		userPresent: true,
		userVerified: false,
		residentKeyRequested: false,
	});
	for (const claim of [
		"userConsented",
		"registered",
		"residentKeyConfirmed",
		"attestationObject",
	])
		expect(credential).not.toHaveProperty(claim);
	expect(supplied.clientDataHash).toEqual(sourceHash);
	expect(supplied.user.id).toEqual(sourceUser);
	expect(sourceReply).toEqual(replyBefore);
	oneExchange(transport, expectedRequest());
	expect(transport.reports.length).toBeGreaterThan(1);
	expect(transport.incoming).toHaveLength(0);
	expect(connection.state).toBe("idle");
	expect(transport.closeCalls).toBe(0);
});

it.each([
	{ requested: false, flags: 0x41, verified: false },
	{ requested: false, flags: 0x45, verified: true },
	{ requested: true, flags: 0x45, verified: true },
])(
	"reports actual UV for request $requested and flags $flags",
	async (entry) => {
		const supplied = { ...request(), userVerification: entry.requested };
		const { connection, transport } = create(reply({ flags: entry.flags }));
		const credential = created(await makeCtapCredential(connection, supplied));
		expect(credential.userPresent).toBe(true);
		expect(credential.userVerified).toBe(entry.verified);
		oneExchange(transport, encodeCtapMakeCredentialRequest(supplied));
	},
);

it.each([undefined, false, true])(
	"reports rk %s as a request rather than a confirmed resident credential",
	async (residentKey) => {
		const supplied = { ...request(), residentKey };
		const { connection, transport } = create(reply());
		const credential = created(await makeCtapCredential(connection, supplied));
		expect(credential.residentKeyRequested).toBe(residentKey === true);
		expect(credential).not.toHaveProperty("residentKey");
		expect(credential).not.toHaveProperty("residentKeyConfirmed");
		oneExchange(transport, encodeCtapMakeCredentialRequest(supplied));
	},
);

it.each([0, 31])("quarantines a mismatching RP hash byte %s", async (index) => {
	const hash = rpHash.slice();
	hash[index] ^= 1;
	await denied(request(), reply({ hash }));
});

it.each([0x40, 0x44])(
	"requires UP even with authenticator flags %s",
	async (flags) => {
		await denied(request(), reply({ flags }));
	},
);

it("requires UV when the canonical request asks for it", async () => {
	await denied({ ...request(), userVerification: true }, reply());
});

it("rejects a structurally supported but unoffered key algorithm", async () => {
	await denied(request(), reply({ algorithm: -8 }));
});

it("accepts an offered algorithm after the first parameter", async () => {
	const supplied: CtapMakeCredentialRequest = {
		...request(),
		pubKeyCredParams: [
			{ type: "public-key", alg: -7 },
			{ type: "public-key", alg: -8 },
		],
	};
	const { connection, transport } = create(reply({ algorithm: -8 }));
	const credential = created(await makeCtapCredential(connection, supplied));
	expect(credential.attestedCredentialData.credentialPublicKey).toMatchObject({
		kind: "okp",
		algorithm: -8,
	});
	oneExchange(transport, encodeCtapMakeCredentialRequest(supplied));
});

it.each([0, 1])(
	"rejects an excluded identifier at position %s",
	async (position) => {
		const identifiers = [new Uint8Array([0x71]), new Uint8Array([0x72])];
		identifiers[position] = credentialId.slice();
		await denied(
			{
				...request(),
				excludeList: identifiers.map((id) => ({ type: "public-key", id })),
			},
			reply(),
		);
	},
);

it("compares complete excluded IDs rather than prefixes or shared backing bytes", async () => {
	const backing = new Uint8Array([0x00, ...credentialId, 0x00]);
	const identifiers = [
		credentialId.slice(0, 2),
		new Uint8Array([...credentialId, 0x94]),
		new Uint8Array([0x91, 0x92, 0x94]),
		backing.subarray(0, 3),
	];
	const supplied: CtapMakeCredentialRequest = {
		...request(),
		excludeList: identifiers.map((id) => ({ type: "public-key", id })),
	};
	const { connection, transport } = create(reply());
	expect(
		created(await makeCtapCredential(connection, supplied))
			.attestedCredentialData.credentialId,
	).toEqual(credentialId);
	oneExchange(transport, encodeCtapMakeCredentialRequest(supplied));
});

it.each([
	{ name: "empty", tail: [0xa0] },
	{ name: "nonempty", tail: map([[...text("uvm"), 0xf5]]) },
])("rejects unsolicited $name ED extension data", async ({ tail }) => {
	await denied(request(), reply({ flags: 0xc1, tail }));
});

it("snapshots nested request values before caller mutation", async () => {
	const supplied = request();
	const parameter = { type: "public-key" as const, alg: -7 };
	const excluded = { type: "public-key" as const, id: new Uint8Array([0x71]) };
	supplied.pubKeyCredParams = [parameter];
	supplied.excludeList = [excluded];
	supplied.rp.name = privateText;
	supplied.user.name = privateText;
	supplied.user.displayName = privateText;
	supplied.residentKey = true;
	const wire = encodeCtapMakeCredentialRequest(supplied);
	const { connection, transport } = create(reply());
	const operation = makeCtapCredential(connection, supplied);
	supplied.rp.id = "changed.invalid";
	supplied.rp.name = "changed RP metadata";
	supplied.clientDataHash.fill(0xee);
	supplied.user.id.fill(0xdd);
	supplied.user.name = "changed user metadata";
	supplied.user.displayName = "changed display metadata";
	parameter.alg = -8;
	excluded.id = credentialId.slice();
	supplied.userVerification = true;
	supplied.residentKey = false;
	const credential = created(await operation);
	expect(credential.attestedCredentialData.rpIdHash).toEqual(rpHash);
	expect(credential.residentKeyRequested).toBe(true);
	expect(credential.userVerified).toBe(false);
	oneExchange(transport, wire);
});

it.each(["rp", "uv", "algorithm", "exclusion"])(
	"does not let a later %s mutation relax the encoded request policy",
	async (field) => {
		const supplied = request();
		const parameter = { type: "public-key" as const, alg: -8 };
		const excluded = { type: "public-key" as const, id: credentialId.slice() };
		if (field === "rp") supplied.rp.id = privateText;
		if (field === "uv") supplied.userVerification = true;
		if (field === "algorithm") supplied.pubKeyCredParams = [parameter];
		if (field === "exclusion") supplied.excludeList = [excluded];
		const wire = encodeCtapMakeCredentialRequest(supplied);
		const { connection, transport } = create(reply());
		const operation = makeCtapCredential(connection, supplied);
		supplied.rp.id = "a";
		supplied.userVerification = false;
		parameter.alg = -7;
		excluded.id.fill(0x71);
		await rejects(operation, "policy-denied");
		oneExchange(transport, wire);
		await quarantined(connection, transport);
	},
);

it("releases successful ownership for another registration without command 08", async () => {
	const secondId = new Uint8Array([0x81, 0x82]);
	const { connection, transport } = create(
		reply(),
		reply({ identifier: secondId }),
	);
	const first = created(await makeCtapCredential(connection, request()));
	expect(connection.state).toBe("idle");
	const second = created(await makeCtapCredential(connection, request()));
	expect(first.attestedCredentialData.credentialId).toEqual(credentialId);
	expect(second.attestedCredentialData.credentialId).toEqual(secondId);
	expect(messages(transport)).toEqual([
		{ command: 0x10, payload: expectedRequest() },
		{ command: 0x10, payload: expectedRequest() },
	]);
	expect(transport.incoming).toHaveLength(0);
	expect(transport.closeCalls).toBe(0);
	expect(connection.state).toBe("idle");
});

it("accepts an exact encoded request limit and maximum transaction timeout", async () => {
	const { connection, transport } = create(reply());
	created(
		await makeCtapCredential(connection, request(), {
			maxMessageSize: BigInt(expectedRequest().length),
			timeoutMs: 120_000,
		}),
	);
	oneExchange(transport, expectedRequest());
});

it("rejects a request one byte over its limit before transport I/O", async () => {
	const { connection, transport } = create();
	await rejects(
		makeCtapCredential(connection, request(), {
			maxMessageSize: BigInt(expectedRequest().length - 1),
		}),
		"resource-limit",
	);
	untouched(connection, transport);
});

function largeRequest(): CtapMakeCredentialRequest {
	return {
		...request(),
		excludeList: [{ type: "public-key", id: new Uint8Array(1023).fill(0x71) }],
	};
}

it("uses the default 1024-byte MakeCredential request cap", async () => {
	const supplied = largeRequest();
	expect(
		encodeCtapMakeCredentialRequest(supplied, 2048n).length,
	).toBeGreaterThan(1024);
	const { connection, transport } = create();
	await rejects(makeCtapCredential(connection, supplied), "resource-limit");
	untouched(connection, transport);
});

it("delegates an explicitly larger request budget to the real encoder", async () => {
	const supplied = largeRequest();
	const wire = encodeCtapMakeCredentialRequest(supplied, 2048n);
	const { connection, transport } = create(reply());
	created(
		await makeCtapCredential(connection, supplied, { maxMessageSize: 2048n }),
	);
	oneExchange(transport, wire);
});

it("keeps the whole-wire request cap despite the maximum uint64 budget", async () => {
	const supplied: CtapMakeCredentialRequest = {
		...request(),
		excludeList: Array.from({ length: 8 }, (_value, index) => ({
			type: "public-key" as const,
			id: new Uint8Array(1023).fill(index + 1),
		})),
	};
	const { connection, transport } = create();
	await rejects(
		makeCtapCredential(connection, supplied, {
			maxMessageSize: (1n << 64n) - 1n,
		}),
		"resource-limit",
	);
	untouched(connection, transport);
});

it("accepts an exact response byte budget including status", async () => {
	const payload = reply();
	const { connection, transport } = create(payload);
	created(
		await makeCtapCredential(connection, request(), {
			maxResponseBytes: payload.length,
		}),
	);
	oneExchange(transport, expectedRequest());
});

it("quarantines a response one byte beyond its tighter budget", async () => {
	const payload = reply();
	const { connection, transport } = create(payload);
	await rejects(
		makeCtapCredential(connection, request(), {
			maxResponseBytes: payload.length - 1,
		}),
		"resource-limit",
	);
	oneExchange(transport, expectedRequest());
	await quarantined(connection, transport);
});

it("accepts a 7609-byte response under the default response budget", async () => {
	const baseline = reply({ statementData: new Uint8Array(256) });
	const statementData = new Uint8Array(256 + 7609 - baseline.length).fill(0x71);
	const payload = reply({ statementData });
	expect(payload).toHaveLength(7609);
	const { connection, transport } = create(payload);
	const credential = created(await makeCtapCredential(connection, request()));
	expect(credential.attestationStatement.entries).toEqual([
		[
			{ kind: "text", value: "sig" },
			{ kind: "bytes", value: statementData },
		],
	]);
	oneExchange(transport, expectedRequest());
	expect(transport.incoming).toHaveLength(0);
});

it.each([
	{
		name: "status-only with the minimum response budget",
		payload: [0x2e],
		limit: 1,
	},
	{
		name: "status with a canonical map",
		payload: [0x27, 0xa1, 0x01, 0xf5],
		limit: 4,
	},
])("preserves a typed CTAP terminal: $name", async ({ payload, limit }) => {
	const { connection, transport } = create(new Uint8Array(payload));
	expect(
		await makeCtapCredential(connection, request(), {
			maxResponseBytes: limit,
		}),
	).toEqual({
		kind: "ctap-error",
		status: payload[0],
	});
	oneExchange(transport, expectedRequest());
	await quarantined(connection, transport);
});

it.each([
	{ code: 0x06, error: "ERR_CHANNEL_BUSY" },
	{ code: 0xee, error: "unknown" },
])(
	"preserves typed HID terminal $error and quarantines",
	async ({ code, error }) => {
		const { connection, transport } = create();
		transport.deliver(new Uint8Array([code]), 0x3f);
		expect(await makeCtapCredential(connection, request())).toEqual({
			kind: "hid-error",
			code,
			error,
		});
		oneExchange(transport, expectedRequest());
		await quarantined(connection, transport);
	},
);

it.each([
	{ name: "missing required fields", payload: new Uint8Array([0, 0xa0]) },
	{ name: "trailing CBOR", payload: new Uint8Array([...reply(), 0xa0]) },
	{ name: "missing attested data flag", payload: reply({ flags: 0x01 }) },
])(
	"quarantines a malformed registration response: $name",
	async ({ payload }) => {
		await denied(request(), payload, "invalid-input");
	},
);

it.each([
	{
		field: "timeoutMs",
		values: [
			0,
			-1,
			1.5,
			120_001,
			Number.MAX_SAFE_INTEGER + 1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1",
			1n,
			null,
		],
	},
	{
		field: "maxResponseBytes",
		values: [
			0,
			-1,
			1.5,
			7610,
			Number.MAX_SAFE_INTEGER + 1,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1",
			1n,
			null,
		],
	},
	{
		field: "maxMessageSize",
		values: [0n, -1n, 1n << 64n, 1024, "1024", null],
	},
])(
	"rejects invalid $field options without I/O or quarantine",
	async ({ field, values }) => {
		for (const value of values) {
			const { connection, transport } = create();
			await rejects(
				makeCtapCredential(connection, request(), {
					[field]: value,
				} as CtapRegistrationTransactionOptions),
				"invalid-input",
			);
			untouched(connection, transport);
		}
	},
);

it("rejects null, primitive, function and array option records before I/O", async () => {
	for (const options of [null, 1, true, "options", () => undefined, []]) {
		const { connection, transport } = create();
		await rejects(
			makeCtapCredential(
				connection,
				request(),
				options as unknown as CtapRegistrationTransactionOptions,
			),
			"invalid-input",
		);
		untouched(connection, transport);
	}
});

it.each(["unknown", "accessor", "symbol"])(
	"rejects %s option properties without invoking getters",
	async (kind) => {
		let getterCalls = 0;
		const property =
			kind === "symbol"
				? Symbol("option")
				: kind === "accessor"
					? "timeoutMs"
					: "unrecognized";
		const descriptors: PropertyDescriptor[] = [
			{
				get() {
					getterCalls++;
					throw new Error(privateText);
				},
			},
		];
		if (kind !== "accessor") descriptors.push({ value: privateText });
		for (const descriptor of descriptors) {
			const options = Object.defineProperty({}, property, descriptor);
			const { connection, transport } = create();
			await rejects(
				makeCtapCredential(connection, request(), options),
				"invalid-input",
			);
			expect(getterCalls).toBe(0);
			untouched(connection, transport);
		}
	},
);

it("reads only own data options and ignores inherited getters", async () => {
	let getterCalls = 0;
	const prototype = Object.defineProperty({}, "timeoutMs", {
		get() {
			getterCalls++;
			throw new Error(privateText);
		},
	});
	const options = Object.create(
		prototype,
	) as CtapRegistrationTransactionOptions;
	Object.defineProperty(options, "maxMessageSize", {
		value: BigInt(expectedRequest().length),
	});
	const { connection, transport } = create(reply());
	created(await makeCtapCredential(connection, request(), options));
	expect(getterCalls).toBe(0);
	oneExchange(transport, expectedRequest());
});

it("sanitizes invalid request preflight without taking or closing the connection", async () => {
	const supplied = request();
	let getterCalls = 0;
	Object.defineProperty(supplied.rp, "id", {
		get() {
			getterCalls++;
			throw new Error(privateText);
		},
	});
	const { connection, transport } = create();
	await rejects(makeCtapCredential(connection, supplied), "invalid-input");
	expect(getterCalls).toBe(0);
	untouched(connection, transport);
});
