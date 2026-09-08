import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	NodePasskeyAuthenticator,
	type NodePasskeyAuthenticatorOptions,
	type NodePasskeyPersistentAuthenticatorOptions,
} from "./node-passkey-authenticator.js";
import { NodePasskeyCheckpointFile } from "./node-passkey-checkpoint-file.js";
import type {
	PasskeyAssertion,
	PasskeyCreationOptions,
	PasskeyProviderContext,
	PasskeyRegistration,
	PasskeyRequestOptions,
} from "./passkeys.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const authenticators: NodePasskeyAuthenticator[] = [];
const releases: (() => void)[] = [];
const denial = {
	name: "UnknownError",
	message: "Ephemeral authenticator operation denied",
};

function deferred<Value>() {
	let resolve!: (value: Value) => void;
	const promise = new Promise<Value>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function required<Value>(value: Value | undefined | null): Value {
	if (value === undefined || value === null)
		throw new Error("Missing synthetic fixture value");
	return value;
}

async function fixture() {
	const directory = await fs.mkdtemp("/tmp/agent-browser-persistent-passkeys-");
	directories.push(directory);
	expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
	return {
		directory,
		path: join(directory, "checkpoint.bin"),
		key: randomBytes(32),
	};
}

const approval = () =>
	vi.fn<NonNullable<NodePasskeyAuthenticatorOptions["approve"]>>(async () => ({
		approved: true,
	}));

async function opened(options: NodePasskeyPersistentAuthenticatorOptions) {
	const authenticator = await NodePasskeyAuthenticator.open(options);
	authenticators.push(authenticator);
	return authenticator;
}

function context(): PasskeyProviderContext {
	return {
		rpId: "login.fixture.invalid",
		clientDataHash: new Uint8Array(
			createHash("sha256").update("synthetic client data").digest(),
		),
		signal: new AbortController().signal,
	};
}

function creation(): PasskeyProviderContext & {
	options: PasskeyCreationOptions;
} {
	return {
		...context(),
		options: {
			challenge: new Uint8Array([1, 2, 3]),
			rp: { name: "Synthetic RP" },
			user: {
				id: new Uint8Array([11, 22]),
				name: "synthetic-private-name",
				displayName: "Synthetic account",
			},
			pubKeyCredParams: [{ type: "public-key", alg: -7 }],
		},
	};
}

function assertion(
	id?: BufferSource,
): PasskeyProviderContext & { options: PasskeyRequestOptions } {
	return {
		...context(),
		options: {
			challenge: new Uint8Array([4, 5, 6]),
			...(id ? { allowCredentials: [{ type: "public-key", id }] } : {}),
		},
	};
}

function buffer(value: BufferSource): Buffer {
	return ArrayBuffer.isView(value)
		? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
		: Buffer.from(value);
}

type Decoded = number | string | Buffer | Map<Decoded, Decoded>;
function decode(
	encoded: Buffer,
	start = 0,
): { value: Decoded; offset: number } {
	let offset = start;
	const header = encoded[offset++];
	const major = header >>> 5;
	let count = header & 31;
	if (count === 24) count = encoded[offset++];
	else if (count === 25) {
		count = encoded.readUInt16BE(offset);
		offset += 2;
	} else if (count >= 26) throw new Error("Unexpected synthetic CBOR length");
	if (major === 0) return { value: count, offset };
	if (major === 1) return { value: -1 - count, offset };
	if (major === 2 || major === 3) {
		const value = encoded.subarray(offset, offset + count);
		expect(value.length).toBe(count);
		return {
			value: major === 2 ? value : value.toString("utf8"),
			offset: offset + count,
		};
	}
	if (major !== 5) throw new Error("Unexpected synthetic CBOR type");
	const value = new Map<Decoded, Decoded>();
	for (let index = 0; index < count; index++) {
		const key = decode(encoded, offset);
		const entry = decode(encoded, key.offset);
		expect(value.has(key.value)).toBe(false);
		value.set(key.value, entry.value);
		offset = entry.offset;
	}
	return { value, offset };
}

function publicKey(registration: PasskeyRegistration) {
	const encoded = buffer(registration.attestationObject);
	const decoded = decode(encoded);
	expect(decoded.offset).toBe(encoded.length);
	const attestation = decoded.value as Map<string, Decoded>;
	expect(attestation.get("fmt")).toBe("none");
	expect(attestation.get("attStmt")).toEqual(new Map());
	const data = attestation.get("authData") as Buffer;
	expect(data[32]).toBe(0x41);
	expect(data.readUInt32BE(33)).toBe(0);
	expect(data.readUInt16BE(53)).toBe(32);
	expect(data.subarray(55, 87)).toEqual(buffer(registration.credentialId));
	const decodedCose = decode(data, 87);
	expect(decodedCose.offset).toBe(data.length);
	const cose = decodedCose.value as Map<number, Decoded>;
	expect([cose.get(1), cose.get(3), cose.get(-1)]).toEqual([2, -7, 1]);
	return createPublicKey({
		format: "jwk",
		key: {
			kty: "EC",
			crv: "P-256",
			x: (cose.get(-2) as Buffer).toString("base64url"),
			y: (cose.get(-3) as Buffer).toString("base64url"),
		},
	});
}

function counter(result: PasskeyAssertion) {
	return buffer(result.authenticatorData).readUInt32BE(33);
}

type Phase = "file-sync" | "rename" | "directory-sync" | "verification";
function filesystem(directory: string, path: string) {
	const originalOpen = fs.open;
	const originalRename = fs.rename;
	const state = {
		published: false,
		hook: undefined as ((phase: Phase) => Promise<void>) | undefined,
	};
	vi.spyOn(fs, "open").mockImplementation(async (...args) => {
		if (String(args[0]) === path && state.published)
			await state.hook?.("verification");
		const handle = await originalOpen(...args);
		const location = String(args[0]);
		if (location === directory || location.endsWith(".part")) {
			const originalSync = handle.sync.bind(handle);
			vi.spyOn(handle, "sync").mockImplementation(async () => {
				await state.hook?.(
					location === directory ? "directory-sync" : "file-sync",
				);
				await originalSync();
			});
		}
		return handle;
	});
	vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
		await state.hook?.("rename");
		await originalRename(...args);
		state.published = true;
	});
	return state;
}

function barrier(state: ReturnType<typeof filesystem>, phase: Phase) {
	const reached = deferred<void>();
	const release = deferred<void>();
	releases.push(() => release.resolve());
	state.hook = async (current) => {
		if (current !== phase) return;
		reached.resolve();
		await release.promise;
	};
	return { reached: reached.promise, release: () => release.resolve() };
}

afterEach(async () => {
	for (const release of releases.splice(0)) release();
	vi.restoreAllMocks();
	for (const authenticator of authenticators.splice(0))
		await authenticator.close().catch(() => {});
	let bytes = 0;
	for (const directory of directories.splice(0)) {
		for (const name of await fs.readdir(directory))
			bytes += (await fs.lstat(join(directory, name))).size;
		await fs.rm(directory, { recursive: true, force: true });
	}
	expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
});

describe("persistent passkey authenticator", () => {
	it("roundtrips genuine keys and independently verifies assertions across sequential reopens", async () => {
		const { path, key, directory } = await fixture();
		let authenticator = await opened({ path, key, approve: approval() });
		const registration = await authenticator.create(creation());
		const verificationKey = publicKey(registration);
		expect(authenticator.capabilities.userVerification).toBe(false);
		await authenticator.close();
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin"]);
		expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
		expect(
			(await fs.readFile(path)).includes(Buffer.from("synthetic-private-name")),
		).toBe(false);
		for (let expected = 1; expected <= 3; expected++) {
			authenticator = await opened({ path, key, approve: approval() });
			const request = assertion(
				expected === 2 ? undefined : registration.credentialId,
			);
			const result = await authenticator.get(request);
			expect(counter(result)).toBe(expected);
			expect(buffer(result.authenticatorData)[32]).toBe(1);
			expect(buffer(result.authenticatorData).subarray(0, 32)).toEqual(
				createHash("sha256").update(request.rpId).digest(),
			);
			expect(result.userVerified).toBe(false);
			expect(result.userHandle).toEqual(new Uint8Array([11, 22]));
			expect(
				verify(
					"sha256",
					Buffer.concat([
						buffer(result.authenticatorData),
						Buffer.from(request.clientDataHash),
					]),
					verificationKey,
					buffer(result.signature),
				),
			).toBe(true);
			expect(
				verify(
					"sha256",
					Buffer.concat([buffer(result.authenticatorData), Buffer.alloc(32)]),
					verificationKey,
					buffer(result.signature),
				),
			).toBe(false);
			await authenticator.close();
		}
	});

	it("restores exclude, allow, exact RP and discoverable account selection", async () => {
		const { path, key } = await fixture();
		let authenticator = await opened({ path, key, approve: approval() });
		const first = await authenticator.create(creation());
		const second = await authenticator.create(creation());
		await authenticator.close();
		const approve = approval();
		authenticator = await opened({ path, key, approve });
		const excluded = creation();
		excluded.options.excludeCredentials = [
			{ type: "public-key", id: first.credentialId },
		];
		await expect(authenticator.create(excluded)).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		await expect(
			authenticator.get(assertion(new Uint8Array(randomBytes(32)))),
		).rejects.toMatchObject({ name: "NotAllowedError" });
		await expect(
			authenticator.get({
				...assertion(first.credentialId),
				rpId: "other.fixture.invalid",
			}),
		).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(approve).toHaveBeenCalledTimes(1);
		await expect(authenticator.get(assertion())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		approve.mockImplementation(async (request) => {
			if (request.operation !== "get") throw new Error("Unexpected operation");
			expect(request.credentials).toHaveLength(2);
			return { approved: true, credentialId: second.credentialId };
		});
		expect((await authenticator.get(assertion())).credentialId).toEqual(
			second.credentialId,
		);
	});

	it("enforces capacity and restored assertion limits without rewriting the checkpoint", async () => {
		const { path, key } = await fixture();
		let authenticator = await opened({
			path,
			key,
			approve: approval(),
			maxCredentials: 2,
		});
		const registration = await authenticator.create(creation());
		await authenticator.create(creation());
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		await authenticator.get(assertion(registration.credentialId));
		await authenticator.close();
		const saved = await fs.readFile(path);
		await expect(
			opened({ path, key, approve: approval(), maxCredentials: 1 }),
		).rejects.toMatchObject(denial);
		authenticator = await opened({
			path,
			key,
			approve: approval(),
			maxAssertionsPerCredential: 1,
		});
		await expect(
			authenticator.get(assertion(registration.credentialId)),
		).rejects.toMatchObject({ name: "NotAllowedError" });
		expect(await fs.readFile(path)).toEqual(saved);
	});

	it("never falls back on malformed, wrong-key or locked checkpoints and releases failed initialization", async () => {
		const { path, key, directory } = await fixture();
		const authenticator = await opened({ path, key, approve: approval() });
		await authenticator.create(creation());
		await expect(
			opened({ path, key, approve: approval() }),
		).rejects.toMatchObject(denial);
		await authenticator.close();
		await expect(
			opened({ path, key: randomBytes(32), approve: approval() }),
		).rejects.toMatchObject(denial);
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin"]);
		await (await opened({ path, key, approve: approval() })).close();
		await fs.writeFile(path, "synthetic malformed checkpoint");
		await expect(
			opened({ path, key, approve: approval() }),
		).rejects.toMatchObject(denial);
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin"]);
	});

	it("requires approval and creates no checkpoint for missing or denied consent", async () => {
		const { path, key, directory } = await fixture();
		let authenticator = await opened({ path, key });
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		await expect(authenticator.get(assertion())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		await authenticator.close();
		authenticator = await opened({
			path,
			key,
			approve: async () => ({ approved: false }),
		});
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin.lock"]);
	});

	it("does not regain automatic consent when reopening populated storage", async () => {
		const { path, key } = await fixture();
		let authenticator = await opened({ path, key, approve: approval() });
		await authenticator.create(creation());
		await authenticator.close();
		const saved = await fs.readFile(path);
		authenticator = await opened({ path, key });
		await expect(authenticator.get(assertion())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		expect(await fs.readFile(path)).toEqual(saved);
	});

	it.each(["file-sync", "rename", "directory-sync", "verification"] as const)(
		"does not publish creations before %s completes",
		async (phase) => {
			const { path, key, directory } = await fixture();
			const state = filesystem(directory, path);
			const approve = approval();
			const authenticator = await opened({ path, key, approve });
			const gate = barrier(state, phase);
			let published = false;
			const pending = authenticator.create(creation()).then((result) => {
				published = true;
				return result;
			});
			await gate.reached;
			expect(published).toBe(false);
			await expect(authenticator.create(creation())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			await expect(authenticator.get(assertion())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			expect(approve).toHaveBeenCalledTimes(1);
			gate.release();
			expect((await pending).userVerified).toBe(false);
			expect(published).toBe(true);
		},
	);

	it("does not publish incremented assertions before directory fsync", async () => {
		const { path, key, directory } = await fixture();
		const state = filesystem(directory, path);
		const authenticator = await opened({ path, key, approve: approval() });
		const registration = await authenticator.create(creation());
		const gate = barrier(state, "directory-sync");
		let published = false;
		const pending = authenticator
			.get(assertion(registration.credentialId))
			.then((result) => {
				published = true;
				return result;
			});
		await gate.reached;
		expect(published).toBe(false);
		gate.release();
		expect(counter(await pending)).toBe(1);
	});

	it.each(["file-sync", "rename", "directory-sync", "verification"] as const)(
		"poisons after %s failure and never retries stale memory",
		async (phase) => {
			const { path, key, directory } = await fixture();
			const state = filesystem(directory, path);
			const approve = approval();
			const authenticator = await opened({ path, key, approve });
			const registration = await authenticator.create(creation());
			state.published = false;
			state.hook = async (current) => {
				if (current === phase)
					throw new Error(`private ${path} ${key.toString("hex")}`);
			};
			await expect(
				authenticator.get(assertion(registration.credentialId)),
			).rejects.toMatchObject(denial);
			state.hook = undefined;
			await expect(
				authenticator.get(assertion(registration.credentialId)),
			).rejects.toMatchObject({ name: "InvalidStateError" });
			expect(approve).toHaveBeenCalledTimes(2);
			await expect(
				opened({ path, key, approve: approval() }),
			).rejects.toMatchObject(denial);
			await authenticator.close();
			const reopened = await opened({ path, key, approve: approval() });
			expect(
				counter(await reopened.get(assertion(registration.credentialId))),
			).toBe(phase === "file-sync" || phase === "rename" ? 1 : 2);
		},
	);

	it.each(["abort", "deadline", "close"] as const)(
		"revokes on %s during uncertain IO and waits for cleanup before releasing ownership",
		async (reason) => {
			const { path, key, directory } = await fixture();
			const state = filesystem(directory, path);
			const approve = approval();
			const authenticator = await opened({ path, key, approve });
			const registration = await authenticator.create(creation());
			const gate = barrier(state, "directory-sync");
			const controller = new AbortController();
			const request = {
				...assertion(registration.credentialId),
				signal: controller.signal,
			};
			if (reason === "deadline") request.options.timeout = 150;
			const pending = authenticator.get(request);
			const rejected = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			await gate.reached;
			let closed = false;
			let closing: Promise<void> | undefined;
			if (reason === "abort") controller.abort();
			if (reason === "close")
				closing = authenticator.close().then(() => {
					closed = true;
				});
			await rejected;
			await expect(
				authenticator.get(assertion(registration.credentialId)),
			).rejects.toMatchObject({ name: "InvalidStateError" });
			await expect(
				opened({ path, key, approve: approval() }),
			).rejects.toMatchObject(denial);
			closing ??= authenticator.close().then(() => {
				closed = true;
			});
			await Promise.resolve();
			expect(closed).toBe(false);
			expect(await fs.readdir(directory)).toContain("checkpoint.bin.lock");
			gate.release();
			await closing;
			expect(closed).toBe(true);
			expect(approve).toHaveBeenCalledTimes(2);
			const reopened = await opened({ path, key, approve: approval() });
			expect(
				counter(await reopened.get(assertion(registration.credentialId))),
			).toBe(2);
		},
	);

	it("cancellation before persistence does not write or poison and late consent cannot publish", async () => {
		const { path, key, directory } = await fixture();
		const decision = deferred<{ approved: boolean }>();
		const reached = deferred<void>();
		const approve = approval().mockImplementationOnce(async () => {
			reached.resolve();
			return decision.promise;
		});
		const authenticator = await opened({ path, key, approve });
		const controller = new AbortController();
		const pending = authenticator.create({
			...creation(),
			signal: controller.signal,
		});
		const rejected = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		await reached.promise;
		controller.abort();
		await rejected;
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin.lock"]);
		decision.resolve({ approved: true });
		await authenticator.create(creation());
		expect(approve).toHaveBeenCalledTimes(2);
		await authenticator.close();
		const reopened = await opened({ path, key, approve: approval() });
		expect(counter(await reopened.get(assertion()))).toBe(1);
	});

	it.each([
		["create", "resolve"],
		["create", "reject"],
		["get", "resolve"],
		["get", "reject"],
	] as const)(
		"never recovers stale memory after cancelled %s and late save %s",
		async (operation, outcome) => {
			const { path, key, directory } = await fixture();
			const state = filesystem(directory, path);
			const approve = approval();
			const authenticator = await opened({ path, key, approve });
			if (operation === "get") await authenticator.create(creation());
			const reached = deferred<void>();
			const release = deferred<void>();
			const settled = deferred<void>();
			releases.push(() => release.resolve());
			const nativeSave = NodePasskeyCheckpointFile.prototype.save;
			vi.spyOn(NodePasskeyCheckpointFile.prototype, "save").mockImplementation(
				function (this: NodePasskeyCheckpointFile, records) {
					const pending = nativeSave.call(this, records);
					void pending.then(
						() => settled.resolve(),
						() => settled.resolve(),
					);
					return pending;
				},
			);
			state.hook = async (phase) => {
				if (phase !== "directory-sync") return;
				reached.resolve();
				await release.promise;
				if (outcome === "reject") throw new Error(`private ${path}`);
			};
			const controller = new AbortController();
			const pending =
				operation === "get"
					? authenticator.get({ ...assertion(), signal: controller.signal })
					: authenticator.create({ ...creation(), signal: controller.signal });
			const rejected = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			await reached.promise;
			controller.abort();
			await rejected;
			release.resolve();
			await settled.promise;
			state.hook = undefined;
			await expect(authenticator.create(creation())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			await expect(authenticator.get(assertion())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			expect(approve).toHaveBeenCalledTimes(operation === "get" ? 2 : 1);
			await expect(
				opened({ path, key, approve: approval() }),
			).rejects.toMatchObject(denial);
			await authenticator.close();
			const reopened = await opened({ path, key, approve: approval() });
			expect(counter(await reopened.get(assertion()))).toBe(
				operation === "get" ? 2 : 1,
			);
		},
	);

	it.each(["create", "get"] as const)(
		"checks revocation again at successful save acknowledgment for %s",
		async (operation) => {
			const { path, key } = await fixture();
			const authenticator = await opened({ path, key, approve: approval() });
			if (operation === "get") await authenticator.create(creation());
			const controller = new AbortController();
			const nativeSave = NodePasskeyCheckpointFile.prototype.save;
			vi.spyOn(
				NodePasskeyCheckpointFile.prototype,
				"save",
			).mockImplementationOnce(async function (
				this: NodePasskeyCheckpointFile,
				records,
			) {
				await nativeSave.call(this, records);
				controller.abort();
			});
			const pending =
				operation === "get"
					? authenticator.get({ ...assertion(), signal: controller.signal })
					: authenticator.create({ ...creation(), signal: controller.signal });
			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
			await expect(authenticator.get(assertion())).rejects.toMatchObject({
				name: "InvalidStateError",
			});
			await authenticator.close();
			const reopened = await opened({ path, key, approve: approval() });
			expect(counter(await reopened.get(assertion()))).toBe(
				operation === "get" ? 2 : 1,
			);
		},
	);

	it("checks deadlines at acknowledgment even when the timeout callback has not run", async () => {
		const { path, key } = await fixture();
		const authenticator = await opened({ path, key, approve: approval() });
		const nativeSave = NodePasskeyCheckpointFile.prototype.save;
		const now = performance.now.bind(performance);
		vi.spyOn(
			NodePasskeyCheckpointFile.prototype,
			"save",
		).mockImplementationOnce(async function (
			this: NodePasskeyCheckpointFile,
			records,
		) {
			await nativeSave.call(this, records);
			vi.spyOn(performance, "now").mockReturnValue(now() + 1_000_000);
		});
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "NotAllowedError",
		});
		vi.restoreAllMocks();
		await expect(authenticator.get(assertion())).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		await authenticator.close();
		const reopened = await opened({ path, key, approve: approval() });
		expect(counter(await reopened.get(assertion()))).toBe(1);
	});

	it("rejects unsupported or revoked ceremonies without saving and remains usable", async () => {
		const { path, key, directory } = await fixture();
		const approve = approval();
		const authenticator = await opened({ path, key, approve });
		const revoked = new AbortController();
		revoked.abort();
		await expect(
			authenticator.create({ ...creation(), signal: revoked.signal }),
		).rejects.toMatchObject({ name: "AbortError" });
		const requiredVerification = creation();
		requiredVerification.options.authenticatorSelection = {
			userVerification: "required",
		};
		await expect(
			authenticator.create(requiredVerification),
		).rejects.toMatchObject({ name: "NotSupportedError" });
		const noChallenge = creation();
		noChallenge.options.challenge = new Uint8Array();
		await expect(authenticator.create(noChallenge)).rejects.toMatchObject({
			name: "TypeError",
		});
		expect(approve).not.toHaveBeenCalled();
		expect(await fs.readdir(directory)).toEqual(["checkpoint.bin.lock"]);
		await authenticator.create(creation());
	});

	it("returns an idempotent sanitized close rejection without an unhandled ignored promise", async () => {
		const { path, key, directory } = await fixture();
		const state = filesystem(directory, path);
		const authenticator = await opened({ path, key, approve: approval() });
		state.hook = async (phase) => {
			if (phase === "directory-sync")
				throw new Error(`private ${path} ${key.toString("hex")}`);
		};
		const closing = authenticator.close();
		expect(authenticator.close()).toBe(closing);
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		await expect(closing).rejects.toMatchObject(denial);
		state.hook = undefined;
		await expect(authenticator.create(creation())).rejects.toMatchObject({
			name: "InvalidStateError",
		});
		await (await opened({ path, key, approve: approval() })).close();
	});

	it("copies caller key synchronously and isolates request, approval and result buffers", async () => {
		const { path, key } = await fixture();
		const originalKey = Buffer.from(key);
		const approve = approval();
		const opening = opened({ path, key, approve });
		key.fill(0);
		const authenticator = await opening;
		const request = creation();
		const creating = authenticator.create(request);
		buffer(request.options.user.id).fill(99);
		const registration = await creating;
		const originalId = new Uint8Array(buffer(registration.credentialId));
		buffer(registration.credentialId).fill(0);
		const approvalRequest = approve.mock.calls[0][0];
		if (approvalRequest.operation === "create") approvalRequest.user.id.fill(0);
		await authenticator.close();
		expect(key).toEqual(Buffer.alloc(32));
		const selecting = approval().mockImplementation(async (request) => {
			if (request.operation === "get") {
				request.credentials[0].credentialId.fill(0);
				request.credentials[0].user.id.fill(0);
			}
			return { approved: true };
		});
		const reopened = await opened({
			path,
			key: originalKey,
			approve: selecting,
		});
		const result = await reopened.get(assertion(originalId));
		expect(result.credentialId).toEqual(originalId);
		expect(result.userHandle).toEqual(new Uint8Array([11, 22]));
		buffer(required(result.userHandle)).fill(0);
		expect((await reopened.get(assertion(originalId))).userHandle).toEqual(
			new Uint8Array([11, 22]),
		);
	});

	it("keeps state private under reflection and the default constructor entirely ephemeral", async () => {
		const { path, key, directory } = await fixture();
		const openSpy = vi.spyOn(fs, "open");
		const ephemeral = new NodePasskeyAuthenticator({ approve: approval() });
		authenticators.push(ephemeral);
		await ephemeral.create(creation());
		await ephemeral.close();
		expect(openSpy).not.toHaveBeenCalled();
		expect(await fs.readdir(directory)).toEqual([]);
		const authenticator = await opened({ path, key, approve: approval() });
		await authenticator.create(creation());
		expect(Reflect.ownKeys(authenticator)).toEqual([]);
		expect(JSON.stringify(authenticator)).toBe("{}");
		for (const secret of [
			path,
			key.toString("hex"),
			"synthetic-private-name",
			"privateKey",
			"#store",
		])
			expect(inspect(authenticator, { showHidden: true })).not.toContain(
				secret,
			);
		expect(
			Object.getOwnPropertyNames(NodePasskeyAuthenticator.prototype).sort(),
		).toEqual(["capabilities", "close", "constructor", "create", "get"]);
	});

	it.each([
		{ maxCredentials: 0 },
		{ maxCredentials: 65 },
		{ maxAssertionsPerCredential: 0 },
		{ approve: true },
		{ path: "relative" },
		{ key: new Uint8Array(31) },
		{ extra: true },
	])("validates explicit options before opening files: %j", async (invalid) => {
		const { path, key, directory } = await fixture();
		const openSpy = vi.spyOn(fs, "open");
		await expect(
			opened({
				path,
				key,
				...invalid,
			} as NodePasskeyPersistentAuthenticatorOptions),
		).rejects.toMatchObject(denial);
		expect(openSpy).not.toHaveBeenCalled();
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it("rejects accessors and proxies without executing them or disclosing errors", async () => {
		const { path, key } = await fixture();
		const getter = vi.fn(() => {
			throw new Error(path);
		});
		const options = Object.defineProperty({ path, key }, "approve", {
			get: getter,
		});
		await expect(opened(options)).rejects.toMatchObject(denial);
		const proxy = new Proxy({ path, key }, { ownKeys: getter });
		await expect(opened(proxy)).rejects.toMatchObject(denial);
		expect(getter).not.toHaveBeenCalled();
	});

	it("requires own path and key data instead of discovering inherited options", async () => {
		const { path, key, directory } = await fixture();
		await expect(
			opened({ key } as unknown as NodePasskeyPersistentAuthenticatorOptions),
		).rejects.toMatchObject(denial);
		await expect(
			opened({ path } as NodePasskeyPersistentAuthenticatorOptions),
		).rejects.toMatchObject(denial);
		await expect(opened(Object.create({ path, key }))).rejects.toMatchObject(
			denial,
		);
		expect(await fs.readdir(directory)).toEqual([]);
	});

	it("demonstrates sequential counter persistence is not authenticated-checkpoint anti-rollback", async () => {
		const { path, key } = await fixture();
		let authenticator = await opened({ path, key, approve: approval() });
		await authenticator.create(creation());
		const oldCheckpoint = await fs.readFile(path);
		expect(counter(await authenticator.get(assertion()))).toBe(1);
		await authenticator.close();
		await fs.writeFile(path, oldCheckpoint);
		authenticator = await opened({ path, key, approve: approval() });
		expect(counter(await authenticator.get(assertion()))).toBe(1);
	});

	it("does not expose loaded record buffers through the authenticator", async () => {
		const { path, key } = await fixture();
		const authenticator = await opened({ path, key, approve: approval() });
		const registration = await authenticator.create(creation());
		await authenticator.close();
		const nativeLoad = NodePasskeyCheckpointFile.prototype.load;
		let loaded: Awaited<ReturnType<typeof nativeLoad>>;
		vi.spyOn(NodePasskeyCheckpointFile.prototype, "load").mockImplementation(
			async function (this: NodePasskeyCheckpointFile) {
				loaded = await nativeLoad.call(this);
				return loaded;
			},
		);
		const reopened = await opened({ path, key, approve: approval() });
		expect(loaded?.[0].id).toEqual(new Uint8Array(32));
		required(loaded)[0].id.fill(88);
		required(loaded)[0].user.id.fill(88);
		required(loaded)[0].counter = 77;
		const result = await reopened.get(assertion(registration.credentialId));
		expect(counter(result)).toBe(1);
		expect(result.userHandle).toEqual(new Uint8Array([11, 22]));
	});
});
