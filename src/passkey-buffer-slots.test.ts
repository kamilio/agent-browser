import { afterEach, expect, it, vi } from "vitest";
import {
	type PasskeyAssertion,
	type PasskeyAuthenticator,
	PasskeyBroker,
	type PasskeyContext,
	type PasskeyCreationOptions,
	type PasskeyRegistration,
	type PasskeyRequestOptions,
	passkeyLimits,
} from "./passkeys.js";

type ViewKind = "Uint8Array" | "Uint16Array" | "DataView";
type Metadata = "buffer" | "byteOffset" | "byteLength";
type NativeView =
	| Uint8Array<ArrayBuffer>
	| Uint16Array<ArrayBuffer>
	| DataView<ArrayBuffer>;
const viewKinds: readonly ViewKind[] = [
	"Uint8Array",
	"Uint16Array",
	"DataView",
];
const metadata: readonly Metadata[] = ["buffer", "byteOffset", "byteLength"];
const brokers: PasskeyBroker[] = [];
const expectedBytes = new Uint8Array([251, 255, 0, 7]);
const fixedError = { name: "TypeError", message: "Invalid passkey options" };

afterEach(() => {
	for (const broker of brokers.splice(0)) broker.close();
	vi.restoreAllMocks();
});

function context(): PasskeyContext {
	return {
		origin: "https://login.fixture.invalid",
		topLevel: true,
		isCurrent: () => true,
	};
}

function creation(): PasskeyCreationOptions {
	return {
		challenge: new Uint8Array([1]),
		rp: { name: "Synthetic RP" },
		user: {
			id: new Uint8Array([2]),
			name: "synthetic",
			displayName: "Synthetic",
		},
		pubKeyCredParams: [{ type: "public-key", alg: -7 }],
	};
}

function request(): PasskeyRequestOptions {
	return {
		challenge: new Uint8Array([1]),
		allowCredentials: [{ type: "public-key", id: new Uint8Array([7, 8]) }],
	};
}

function registration(): PasskeyRegistration {
	return {
		credentialId: new Uint8Array([7, 8]),
		attestationObject: new Uint8Array([0xa0]),
		algorithm: -7,
		residentKey: false,
		userConsented: true,
		userPresent: true,
		userVerified: false,
	};
}

async function assertion(): Promise<PasskeyAssertion> {
	const authenticatorData = new Uint8Array(37);
	authenticatorData.set(
		new Uint8Array(
			await crypto.subtle.digest(
				"SHA-256",
				new TextEncoder().encode("login.fixture.invalid"),
			),
		),
	);
	authenticatorData[32] = 1;
	return {
		credentialId: new Uint8Array([7, 8]),
		authenticatorData,
		signature: new Uint8Array([9]),
		userHandle: new Uint8Array([1, 2]),
		userConsented: true,
		userPresent: true,
		userVerified: false,
	};
}

function fixture() {
	const create = vi.fn<PasskeyAuthenticator["create"]>(async () =>
		registration(),
	);
	const get = vi.fn<PasskeyAuthenticator["get"]>(async () => assertion());
	const broker = new PasskeyBroker({
		capabilities: {
			algorithms: [-7],
			userVerification: false,
			residentKey: false,
			attachment: "cross-platform",
		},
		create,
		get,
	});
	brokers.push(broker);
	return { broker, create, get };
}

function span(kind: ViewKind, bytes = expectedBytes) {
	const backing = new Uint8Array(bytes.byteLength + 4);
	backing.fill(99);
	backing.set(bytes, 2);
	const view: NativeView =
		kind === "DataView"
			? new DataView(backing.buffer, 2, bytes.byteLength)
			: kind === "Uint16Array"
				? new Uint16Array(backing.buffer, 2, bytes.byteLength / 2)
				: new Uint8Array(backing.buffer, 2, bytes.byteLength);
	return { backing, view };
}

function shadow(
	view: object,
	field: Metadata,
	descriptor: PropertyDescriptor,
	inherited = false,
) {
	if (inherited) {
		Object.setPrototypeOf(
			view,
			Object.create(Object.getPrototypeOf(view), {
				[field]: descriptor,
			}),
		);
	} else Object.defineProperty(view, field, descriptor);
}

function poisonMetadata(view: object) {
	const touched = vi.fn(() => {
		throw new Error("PRIVATE_METADATA");
	});
	for (const field of metadata) shadow(view, field, { get: touched });
	return touched;
}

function rejected(operation: () => unknown) {
	return expect(Promise.resolve().then(operation)).rejects.toMatchObject(
		fixedError,
	);
}

it.each(
	viewKinds.flatMap((kind) =>
		metadata.flatMap((field) =>
			["own data", "own accessor", "prototype data", "prototype accessor"].map(
				(mode) => ({ kind, field, mode }),
			),
		),
	),
)(
	"copies native $kind challenge bytes despite $mode $field",
	async ({ kind, field, mode }) => {
		const { broker, create } = fixture();
		const { backing, view } = span(kind);
		const touched = vi.fn(() => {
			throw new Error("PRIVATE_METADATA");
		});
		const value =
			field === "buffer"
				? new Uint8Array(12).fill(42).buffer
				: field === "byteOffset"
					? 0
					: 1;
		shadow(
			view,
			field,
			mode.endsWith("accessor") ? { get: touched } : { value },
			mode.startsWith("prototype"),
		);
		const options = creation();
		options.challenge = view;
		const pending = broker.create(options, context());
		backing.fill(0);
		const result = await pending;
		const delivered = create.mock.calls[0][0];
		expect(delivered.options.challenge).toEqual(expectedBytes);
		expect(new Uint8Array(result.response.clientDataJSON)).toEqual(
			delivered.clientDataJSON,
		);
		expect(
			JSON.parse(new TextDecoder().decode(result.response.clientDataJSON)),
		).toEqual({
			type: "webauthn.create",
			challenge: "-_8ABw",
			origin: context().origin,
			crossOrigin: false,
		});
		expect(delivered.clientDataHash).toEqual(
			new Uint8Array(
				await crypto.subtle.digest("SHA-256", result.response.clientDataJSON),
			),
		);
		expect(touched).not.toHaveBeenCalled();
		expect(create).toHaveBeenCalledOnce();
	},
);

it.each([Number.NaN, 0, -1, Number.POSITIVE_INFINITY, "4", undefined, null])(
	"ignores shadowed user ID byteLength %s and keeps the actual nonempty span",
	async (value) => {
		const { broker, create } = fixture();
		const { view } = span("Uint16Array");
		shadow(view, "byteLength", { value });
		await broker.create(
			{ ...creation(), user: { ...creation().user, id: view } },
			context(),
		);
		expect(create.mock.calls[0][0].options.user.id).toEqual(expectedBytes);
	},
);

it.each(metadata)("does not coerce an object shadowing %s", async (field) => {
	const { broker, create } = fixture();
	const { view } = span("DataView");
	const touched = vi.fn(() => {
		throw new Error("PRIVATE_COERCION");
	});
	shadow(view, field, {
		value: {
			[Symbol.toPrimitive]: touched,
			valueOf: touched,
			toString: touched,
		},
	});
	await broker.create({ ...creation(), challenge: view }, context());
	expect(create.mock.calls[0][0].options.challenge).toEqual(expectedBytes);
	expect(touched).not.toHaveBeenCalled();
});

const inputSlots = [
	{ field: "create challenge", maximum: passkeyLimits.challengeBytes },
	{ field: "get challenge", maximum: passkeyLimits.challengeBytes },
	{ field: "user id", maximum: 64 },
	{ field: "exclude id", maximum: passkeyLimits.credentialIdBytes },
	{ field: "allow id", maximum: passkeyLimits.credentialIdBytes },
] as const;
type InputSlot = (typeof inputSlots)[number]["field"];

function inputOperation(
	broker: PasskeyBroker,
	field: InputSlot,
	value: BufferSource,
) {
	if (field === "get challenge")
		return broker.get({ ...request(), challenge: value }, context());
	if (field === "allow id")
		return broker.get(
			{ ...request(), allowCredentials: [{ type: "public-key", id: value }] },
			context(),
		);
	const options = creation();
	if (field === "create challenge") options.challenge = value;
	if (field === "user id") options.user.id = value;
	if (field === "exclude id")
		options.excludeCredentials = [{ type: "public-key", id: value }];
	return broker.create(options, context());
}

it.each(inputSlots)(
	"snapshots $field without invoking any metadata getters",
	async ({ field }) => {
		const { broker, create, get } = fixture();
		const { backing, view } = span("DataView");
		const touched = poisonMetadata(view);
		if (field === "allow id")
			get.mockResolvedValueOnce({
				...(await assertion()),
				credentialId: expectedBytes.slice(),
			});
		const pending = inputOperation(broker, field, view);
		backing.fill(0);
		await pending;
		const delivered =
			field === "get challenge" || field === "allow id"
				? get.mock.calls[0][0].options
				: create.mock.calls[0][0].options;
		const captured =
			field === "user id"
				? (delivered as PasskeyCreationOptions).user.id
				: field === "exclude id"
					? (delivered as PasskeyCreationOptions).excludeCredentials?.[0].id
					: field === "allow id"
						? (delivered as PasskeyRequestOptions).allowCredentials?.[0].id
						: delivered.challenge;
		expect(captured).toEqual(expectedBytes);
		expect(touched).not.toHaveBeenCalled();
	},
);

it.each(
	inputSlots.flatMap((slot) =>
		["empty", "oversized"].map((size) => ({ ...slot, size })),
	),
)(
	"rejects actual $size $field even when byteLength claims one byte",
	async ({ field, maximum, size }) => {
		const { broker, create, get } = fixture();
		const { view } = span(
			"Uint8Array",
			new Uint8Array(size === "empty" ? 0 : maximum + 1),
		);
		shadow(view, "byteLength", { value: 1 });
		await rejected(() => inputOperation(broker, field, view));
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	},
);

it.each(viewKinds.flatMap((kind) => [0, 1026].map((size) => ({ kind, size }))))(
	"rejects actual $kind challenge length $size without reading metadata getters",
	async ({ kind, size }) => {
		const { broker, create, get } = fixture();
		const { view } = span(kind, new Uint8Array(size));
		const touched = poisonMetadata(view);
		await rejected(() =>
			broker.create({ ...creation(), challenge: view }, context()),
		);
		expect(touched).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	},
);

it.each(["data", "accessor"])(
	"uses the native ArrayBuffer length despite a %s shadow",
	async (mode) => {
		const { broker, create } = fixture();
		const raw = expectedBytes.slice().buffer;
		const touched = vi.fn(() => {
			throw new Error("PRIVATE_METADATA");
		});
		shadow(
			raw,
			"byteLength",
			mode === "data" ? { value: Number.NaN } : { get: touched },
		);
		const pending = broker.create({ ...creation(), challenge: raw }, context());
		new Uint8Array(raw).fill(0);
		await pending;
		expect(create.mock.calls[0][0].options.challenge).toEqual(expectedBytes);
		expect(touched).not.toHaveBeenCalled();
	},
);

const responseSlots = [
	{
		method: "create",
		field: "credentialId",
		minimum: 1,
		maximum: passkeyLimits.credentialIdBytes,
	},
	{
		method: "create",
		field: "attestationObject",
		minimum: 1,
		maximum: passkeyLimits.responseBytes,
	},
	{
		method: "get",
		field: "credentialId",
		minimum: 1,
		maximum: passkeyLimits.credentialIdBytes,
	},
	{
		method: "get",
		field: "authenticatorData",
		minimum: 37,
		maximum: passkeyLimits.responseBytes,
	},
	{
		method: "get",
		field: "signature",
		minimum: 1,
		maximum: passkeyLimits.responseBytes,
	},
	{ method: "get", field: "userHandle", minimum: 1, maximum: 64 },
] as const;

it.each(responseSlots)(
	"copies actual provider $method $field bytes without getters or aliases",
	async ({ method, field }) => {
		const { broker, create, get } = fixture();
		const response = method === "create" ? registration() : await assertion();
		const expected = new Uint8Array(
			(response as unknown as Record<string, Uint8Array>)[field],
		);
		const { backing, view } = span("DataView", expected);
		const touched = poisonMetadata(view);
		Object.assign(response, { [field]: view });
		if (method === "create")
			create.mockResolvedValueOnce(response as PasskeyRegistration);
		else get.mockResolvedValueOnce(response as PasskeyAssertion);
		const result =
			method === "create"
				? await broker.create(creation(), context())
				: await broker.get(request(), context());
		const returned =
			field === "credentialId"
				? result.rawId
				: (result.response as unknown as Record<string, ArrayBuffer>)[field];
		expect(returned).toBeInstanceOf(ArrayBuffer);
		expect(returned).not.toBe(backing.buffer);
		backing.fill(42);
		expect(new Uint8Array(returned)).toEqual(expected);
		new Uint8Array(returned).fill(43);
		expect(Array.from(backing)).toEqual(Array(backing.length).fill(42));
		expect(touched).not.toHaveBeenCalled();
	},
);

it.each(
	responseSlots.flatMap((slot) =>
		["undersized", "oversized"].map((size) => ({ ...slot, size })),
	),
)(
	"rejects actual $size provider $method $field hidden by a valid shadow length",
	async ({ method, field, minimum, maximum, size }) => {
		const { broker, create, get } = fixture();
		const response = method === "create" ? registration() : await assertion();
		const { view } = span(
			"Uint8Array",
			new Uint8Array(size === "undersized" ? minimum - 1 : maximum + 1),
		);
		shadow(view, "byteLength", { value: minimum });
		Object.assign(response, { [field]: view });
		if (method === "create")
			create.mockResolvedValueOnce(response as PasskeyRegistration);
		else get.mockResolvedValueOnce(response as PasskeyAssertion);
		await rejected(() =>
			method === "create"
				? broker.create(creation(), context())
				: broker.get(request(), context()),
		);
		expect(method === "create" ? create : get).toHaveBeenCalledOnce();
	},
);

it("preserves a null user handle rather than treating it as an empty BufferSource", async () => {
	const { broker, get } = fixture();
	get.mockResolvedValueOnce({ ...(await assertion()), userHandle: null });
	expect(
		(await broker.get(request(), context())).response.userHandle,
	).toBeNull();
});

type ResizableBuffer = ArrayBuffer & { resize(length: number): void };
const ResizableArrayBuffer = ArrayBuffer as unknown as new (
	length: number,
	options: { maxByteLength: number },
) => ResizableBuffer;

it.each([
	"fake buffer",
	"proxy view",
	"proxy buffer",
	"shared buffer",
	"shared typed view",
	"shared DataView",
	"detached buffer",
	"detached typed view",
	"detached DataView",
	"out-of-bounds typed view",
	"out-of-bounds DataView",
])(
	"rejects %s storage with fixed errors and no guest getters or provider work",
	async (kind) => {
		const { broker, create, get } = fixture();
		const touched = vi.fn(() => {
			throw new Error("PRIVATE_STORAGE");
		});
		let value: unknown;
		if (kind === "fake buffer") {
			value = {
				[Symbol.toStringTag]: "ArrayBuffer",
				[Symbol.toPrimitive]: touched,
			};
			for (const field of metadata)
				shadow(value as object, field, { get: touched });
		} else if (kind.startsWith("proxy")) {
			value = new Proxy(
				kind === "proxy view" ? new Uint8Array([1]) : new ArrayBuffer(1),
				{ get: touched },
			);
		} else if (kind.startsWith("shared")) {
			const shared = new SharedArrayBuffer(4);
			value =
				kind === "shared buffer"
					? shared
					: kind === "shared typed view"
						? new Uint8Array(shared)
						: new DataView(shared);
			for (const field of metadata)
				shadow(value as object, field, { get: touched });
		} else if (kind.startsWith("detached")) {
			const backing = new ArrayBuffer(8);
			value =
				kind === "detached buffer"
					? backing
					: kind === "detached typed view"
						? new Uint8Array(backing, 2, 4)
						: new DataView(backing, 2, 4);
			structuredClone(backing, { transfer: [backing] });
			for (const field of metadata)
				shadow(value as object, field, { get: touched });
		} else {
			const backing = new ResizableArrayBuffer(8, { maxByteLength: 16 });
			value =
				kind === "out-of-bounds typed view"
					? new Uint8Array(backing, 4, 4)
					: new DataView(backing, 4, 4);
			backing.resize(3);
			for (const field of metadata)
				shadow(value as object, field, { get: touched });
		}
		await rejected(() =>
			broker.create(
				{ ...creation(), challenge: value as BufferSource },
				context(),
			),
		);
		expect(touched).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
		expect(get).not.toHaveBeenCalled();
	},
);
