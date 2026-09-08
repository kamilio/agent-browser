import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type NodePasskeyApprovalDecision,
	type NodePasskeyApprovalRequest,
	NodePasskeyAuthenticator,
	type NodePasskeyAuthenticatorOptions,
} from "./node-passkey-authenticator.js";
import { NodePasskeyCheckpointFile } from "./node-passkey-checkpoint-file.js";
import {
	PasskeyBroker,
	type PasskeyCreationOptions,
	type PasskeyProviderContext,
	type PasskeyRegistration,
} from "./passkeys.js";

const effects = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock("node:crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:crypto")>();
	return {
		...actual,
		generateKeyPairSync: vi.fn(
			(type: "ec", options: { namedCurve: string }) => {
				effects.events.push("generate");
				return actual.generateKeyPairSync(type, options);
			},
		),
	};
});

const authenticators: NodePasskeyAuthenticator[] = [];
const brokers: PasskeyBroker[] = [];
const controllers: AbortController[] = [];
const directories: string[] = [];
const releases: (() => void)[] = [];
const rpId = "login.fixture.invalid";
const backendSecret = "synthetic-private-approval-failure";

afterEach(async () => {
	for (const controller of controllers.splice(0)) controller.abort();
	for (const broker of brokers.splice(0)) broker.close();
	for (const release of releases.splice(0)) release();
	for (const authenticator of authenticators.splice(0))
		await authenticator.close().catch(() => {});
	if (vi.isFakeTimers()) vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	effects.events.length = 0;
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Value>((accept, deny) => {
		resolve = accept;
		reject = deny;
	});
	return { promise, resolve, reject };
}

function creation(): PasskeyProviderContext & {
	options: PasskeyCreationOptions;
} {
	const controller = new AbortController();
	controllers.push(controller);
	return {
		rpId,
		clientDataHash: new Uint8Array(
			createHash("sha256").update("synthetic approval ordering").digest(),
		),
		signal: controller.signal,
		options: {
			challenge: new Uint8Array([1, 2, 3]),
			rp: { name: "Synthetic RP" },
			user: {
				id: new Uint8Array([11, 22]),
				name: "synthetic",
				displayName: "Synthetic account",
			},
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		},
	};
}

function excluded(registration: PasskeyRegistration, matching: boolean) {
	const original = registration.credentialId;
	const bytes = ArrayBuffer.isView(original)
		? new Uint8Array(original.buffer, original.byteOffset, original.byteLength)
		: new Uint8Array(original);
	const id = new Uint8Array(bytes);
	expect(id.length).toBe(32);
	if (!matching) id[0] = (id[0] ?? 0) ^ 0xff;
	const request = creation();
	request.options.excludeCredentials = [{ type: "public-key", id }];
	return request;
}

function approval() {
	return vi.fn<NonNullable<NodePasskeyAuthenticatorOptions["approve"]>>(
		async () => ({ approved: true }),
	);
}

async function seeded(persistent = false) {
	const approve = approval();
	let storage: { path: string; key: Buffer } | undefined;
	if (persistent) {
		const directory = await fs.mkdtemp(
			"/tmp/agent-browser-exclusion-approval-",
		);
		directories.push(directory);
		expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
		storage = { path: join(directory, "checkpoint.bin"), key: randomBytes(32) };
	}
	const authenticator = storage
		? await NodePasskeyAuthenticator.open({
				...storage,
				approve,
				maxCredentials: 4,
			})
		: new NodePasskeyAuthenticator({ approve, maxCredentials: 4 });
	authenticators.push(authenticator);
	const registration = await authenticator.create(creation());
	approve.mockClear();
	vi.mocked(generateKeyPairSync).mockClear();
	effects.events.length = 0;
	return { authenticator, approve, registration, storage };
}

function watchPersistence() {
	const original = NodePasskeyCheckpointFile.prototype.save;
	return vi
		.spyOn(NodePasskeyCheckpointFile.prototype, "save")
		.mockImplementation(function (this: NodePasskeyCheckpointFile, records) {
			effects.events.push("persist");
			return original.call(this, records);
		});
}

function observe<Value>(promise: Promise<Value>) {
	let settled = false;
	const result = promise.then(
		(value) => {
			settled = true;
			effects.events.push("settled");
			return { status: "fulfilled" as const, value };
		},
		(error: unknown) => {
			settled = true;
			effects.events.push("settled");
			return { status: "rejected" as const, error };
		},
	);
	return {
		result,
		get settled() {
			return settled;
		},
	};
}

async function drainMicrotasks() {
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

async function held<Value>(
	approve: ReturnType<typeof approval>,
	invoke: () => Promise<Value>,
) {
	const decision = deferred<NodePasskeyApprovalDecision>();
	const entered = deferred<NodePasskeyApprovalRequest>();
	releases.push(() => decision.resolve({ approved: false }));
	approve.mockImplementationOnce((request) => {
		effects.events.push("approval");
		entered.resolve(request);
		return decision.promise;
	});
	const pending = observe(invoke());
	const consent = await Promise.race([
		entered.promise,
		pending.result.then(() => {
			throw new Error("Synthetic ceremony settled before host approval");
		}),
	]);
	await drainMicrotasks();
	expect(consent.operation).toBe("create");
	expect(consent.signal.aborted).toBe(false);
	expect(approve).toHaveBeenCalledTimes(1);
	expect(pending.settled).toBe(false);
	expect(effects.events).toEqual(["approval"]);
	expect(generateKeyPairSync).not.toHaveBeenCalled();
	return { decision, pending, consent };
}

async function rejection<Value>(
	pending: ReturnType<typeof observe<Value>>,
	name: string,
) {
	const result = await pending.result;
	expect(result.status).toBe("rejected");
	if (result.status !== "rejected")
		throw new Error("Expected synthetic rejection");
	expect(result.error).toBeInstanceOf(Error);
	expect(result.error).toMatchObject({ name });
	const error = result.error as Error;
	expect(error.message).not.toContain(backendSecret);
	expect(Object.hasOwn(error, "cause")).toBe(false);
	return error;
}

function requiredStorage(value: Awaited<ReturnType<typeof seeded>>) {
	if (!value.storage) throw new Error("Missing owned synthetic checkpoint");
	return value.storage;
}

describe("software creation approval precedes credential exclusion", () => {
	it.each([true, false])(
		"holds same-RP matching=%s until approval and orders the actual result",
		async (matching) => {
			const { authenticator, approve, registration } = await seeded();
			const save = watchPersistence();
			const gate = await held(approve, () =>
				authenticator.create(excluded(registration, matching)),
			);
			expect(gate.consent.rpId).toBe(rpId);
			expect(save).not.toHaveBeenCalled();
			effects.events.push("decision");
			gate.decision.resolve({ approved: true });
			if (matching) {
				await rejection(gate.pending, "InvalidStateError");
				expect(generateKeyPairSync).not.toHaveBeenCalled();
				expect(effects.events).toEqual(["approval", "decision", "settled"]);
			} else {
				const result = await gate.pending.result;
				expect(result.status).toBe("fulfilled");
				if (result.status !== "fulfilled")
					throw new Error("Expected native registration");
				expect(result.value.algorithm).toBe(-7);
				expect(result.value.credentialId).not.toEqual(
					registration.credentialId,
				);
				expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
				expect(effects.events).toEqual([
					"approval",
					"decision",
					"generate",
					"settled",
				]);
			}
			expect(save).not.toHaveBeenCalled();
		},
	);

	it("keeps exact RP scoping after approval for an ID stored only under another RP", async () => {
		const { authenticator, approve, registration } = await seeded();
		const request = excluded(registration, true);
		request.rpId = "other.fixture.invalid";
		const gate = await held(approve, () => authenticator.create(request));
		expect(gate.consent.rpId).toBe("other.fixture.invalid");
		effects.events.push("decision");
		gate.decision.resolve({ approved: true });
		const result = await gate.pending.result;
		expect(result.status).toBe("fulfilled");
		expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
		expect(effects.events).toEqual([
			"approval",
			"decision",
			"generate",
			"settled",
		]);
	});

	it("rejects approved exclusion without generating, inserting or rewriting restored credentials", async () => {
		const seededValue = await seeded(true);
		const storage = requiredStorage(seededValue);
		await seededValue.authenticator.close();
		const approve = approval();
		const authenticator = await NodePasskeyAuthenticator.open({
			...storage,
			approve,
			maxCredentials: 4,
		});
		authenticators.push(authenticator);
		const before = await fs.readFile(storage.path);
		const save = watchPersistence();
		const gate = await held(approve, () =>
			authenticator.create(excluded(seededValue.registration, true)),
		);
		effects.events.push("decision");
		gate.decision.resolve({ approved: true });
		await rejection(gate.pending, "InvalidStateError");
		expect(generateKeyPairSync).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect(await fs.readFile(storage.path)).toEqual(before);
		approve.mockImplementationOnce(async (request) => {
			expect(request.operation).toBe("get");
			if (request.operation !== "get")
				throw new Error("Expected actual account selection");
			expect(
				request.credentials.map((credential) => credential.credentialId),
			).toEqual([seededValue.registration.credentialId]);
			return { approved: true };
		});
		const actual = await authenticator.get({
			...creation(),
			options: { challenge: new Uint8Array([4, 5, 6]) },
		});
		expect(actual.credentialId).toEqual(seededValue.registration.credentialId);
		expect(generateKeyPairSync).not.toHaveBeenCalled();
		expect(save).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ matching: true, decision: "refuse" },
		{ matching: false, decision: "refuse" },
		{ matching: true, decision: "reject" },
		{ matching: false, decision: "reject" },
	])(
		"uses host $decision rather than exclusion membership matching=$matching",
		async ({ matching, decision }) => {
			const { authenticator, approve, registration } = await seeded();
			const save = watchPersistence();
			const gate = await held(approve, () =>
				authenticator.create(excluded(registration, matching)),
			);
			effects.events.push("decision");
			if (decision === "refuse") gate.decision.resolve({ approved: false });
			else gate.decision.reject(new Error(backendSecret));
			const error = await rejection(gate.pending, "NotAllowedError");
			expect(error.message).toBe("Ephemeral authenticator operation denied");
			expect(generateKeyPairSync).not.toHaveBeenCalled();
			expect(save).not.toHaveBeenCalled();
			expect(effects.events).toEqual(["approval", "decision", "settled"]);
		},
	);

	it.each([true, false])(
		"denies absent approval with a real restored credential matching=%s",
		async (matching) => {
			const seededValue = await seeded(true);
			const storage = requiredStorage(seededValue);
			await seededValue.authenticator.close();
			const authenticator = await NodePasskeyAuthenticator.open({
				...storage,
				maxCredentials: 4,
			});
			authenticators.push(authenticator);
			const before = await fs.readFile(storage.path);
			const save = watchPersistence();
			await rejection(
				observe(
					authenticator.create(excluded(seededValue.registration, matching)),
				),
				"NotAllowedError",
			);
			expect(seededValue.approve).not.toHaveBeenCalled();
			expect(generateKeyPairSync).not.toHaveBeenCalled();
			expect(save).not.toHaveBeenCalled();
			expect(await fs.readFile(storage.path)).toEqual(before);
			expect(effects.events).toEqual(["settled"]);
		},
	);

	it.each([
		{ matching: true, action: "abort" },
		{ matching: false, action: "abort" },
		{ matching: true, action: "timeout" },
		{ matching: false, action: "timeout" },
		{ matching: true, action: "close" },
		{ matching: false, action: "close" },
	])(
		"rejects $action during approval and ignores late approval matching=$matching",
		async ({ matching, action }) => {
			const seededValue = await seeded(true);
			const { authenticator, approve, registration } = seededValue;
			const storage = requiredStorage(seededValue);
			const before = await fs.readFile(storage.path);
			const save = watchPersistence();
			const controller = new AbortController();
			controllers.push(controller);
			const request = {
				...excluded(registration, matching),
				signal: controller.signal,
			};
			if (action === "timeout") {
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
				request.options.timeout = 10;
			}
			const gate = await held(approve, () => authenticator.create(request));
			effects.events.push("cancel");
			if (action === "abort") controller.abort(backendSecret);
			else if (action === "close") await authenticator.close();
			else await vi.advanceTimersByTimeAsync(10);
			await rejection(gate.pending, "AbortError");
			expect(gate.consent.signal.aborted).toBe(true);
			effects.events.push("late-decision");
			gate.decision.resolve({ approved: true });
			await drainMicrotasks();
			expect(generateKeyPairSync).not.toHaveBeenCalled();
			expect(save).not.toHaveBeenCalled();
			expect(await fs.readFile(storage.path)).toEqual(before);
			expect(effects.events).toEqual([
				"approval",
				"cancel",
				"settled",
				"late-decision",
			]);
			if (action === "timeout") expect(vi.getTimerCount()).toBe(0);
		},
	);

	it.each([true, false])(
		"checks liveness after approval resolves before exclusion matching=%s",
		async (matching) => {
			const { authenticator, approve, registration } = await seeded();
			const controller = new AbortController();
			controllers.push(controller);
			const gate = await held(approve, () =>
				authenticator.create({
					...excluded(registration, matching),
					signal: controller.signal,
				}),
			);
			effects.events.push("decision");
			gate.decision.resolve({ approved: true });
			controller.abort(backendSecret);
			await rejection(gate.pending, "AbortError");
			await drainMicrotasks();
			expect(generateKeyPairSync).not.toHaveBeenCalled();
			expect(effects.events).toEqual(["approval", "decision", "settled"]);
		},
	);

	it.each([true, false])(
		"holds the actual broker promise at provider approval matching=%s",
		async (matching) => {
			const { authenticator, approve, registration } = await seeded();
			const broker = new PasskeyBroker(authenticator);
			brokers.push(broker);
			const trusted = {
				origin: `https://${rpId}`,
				topLevel: true,
				isCurrent: () => true,
			};
			const gate = await held(approve, () =>
				broker.create(excluded(registration, matching).options, trusted),
			);
			expect(gate.consent.rpId).toBe(rpId);
			effects.events.push("decision");
			gate.decision.resolve({ approved: true });
			if (matching) {
				const error = await rejection(gate.pending, "UnknownError");
				expect(error.message).toBe("Passkey authenticator failed");
				expect(generateKeyPairSync).not.toHaveBeenCalled();
				expect(effects.events).toEqual(["approval", "decision", "settled"]);
			} else {
				const result = await gate.pending.result;
				expect(result.status).toBe("fulfilled");
				if (result.status !== "fulfilled")
					throw new Error("Expected actual broker registration");
				expect(result.value.type).toBe("public-key");
				expect(generateKeyPairSync).toHaveBeenCalledTimes(1);
				expect(effects.events).toEqual([
					"approval",
					"decision",
					"generate",
					"settled",
				]);
			}
		},
	);
});
