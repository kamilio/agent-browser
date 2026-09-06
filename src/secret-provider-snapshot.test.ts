import type { BigIntStats } from "node:fs";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	EnvFileSecretProvider,
	type PassRunner,
	PassSecretProvider,
} from "./node-secret-providers.js";
import { SecretBroker } from "./secret-providers.js";

vi.mock("node:fs/promises", () => ({ lstat: vi.fn(), open: vi.fn() }));
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		throw new Error("Real process execution forbidden");
	}),
}));

const origin = "https://snapshot.fixture.invalid";
const path = "/synthetic-private/snapshot.fixture";
const secret = "SYNTHETIC_SNAPSHOT_PASSWORD_73";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

function envFixture() {
	const source = Buffer.from(`LOGIN=${secret}\nOTHER=SYNTHETIC_WRONG_VALUE\n`);
	const info = {
		dev: 1n,
		ino: 2n,
		uid: BigInt(process.getuid?.() ?? 0),
		nlink: 1n,
		mode: 0o600n,
		size: BigInt(source.length),
		mtimeNs: 1n,
		ctimeNs: 1n,
		isFile: () => true,
		isDirectory: () => false,
		isSymbolicLink: () => false,
	} as BigIntStats;
	const directory = {
		...info,
		ino: 1n,
		mode: 0o700n,
		isFile: () => false,
		isDirectory: () => true,
	};
	const scratch: Uint8Array[] = [];
	const handle = {
		stat: vi.fn(async () => ({ ...info })),
		read: vi.fn(
			async (
				buffer: Uint8Array,
				offset: number,
				length: number,
				position: number,
			) => {
				const bytesRead = Math.min(
					length,
					Math.max(0, source.length - position),
				);
				buffer.set(source.subarray(position, position + bytesRead), offset);
				scratch.push(buffer);
				return { bytesRead, buffer };
			},
		),
		close: vi.fn(async () => {}),
	};
	vi.mocked(fs.lstat).mockImplementation(
		async (filename) =>
			({ ...(filename === path ? info : directory) }) as Awaited<
				ReturnType<typeof fs.lstat>
			>,
	);
	vi.mocked(fs.open).mockResolvedValue(handle as unknown as fs.FileHandle);
	return { provider: new EnvFileSecretProvider({ path }), scratch, handle };
}

it.each(["env", "pass"] as const)(
	"keeps the constant's selected %s provider/key through executable configuration",
	async (kind) => {
		const env = envFixture();
		const runner = vi.fn<PassRunner>(async (_executable, _args, options) => {
			options.stdout(
				new TextEncoder().encode(`${secret}\nSYNTHETIC_METADATA\n`),
			);
			return 0;
		});
		const selected =
			kind === "env" ? env.provider : new PassSecretProvider({ runner });
		const selectedKey = kind === "env" ? "LOGIN" : "web/login";
		const other = { resolve: vi.fn(async () => "SYNTHETIC_WRONG_PROVIDER") };
		const binding = {
			provider: "selected",
			key: selectedKey,
			get origins() {
				binding.provider = "other";
				binding.key = "OTHER";
				return [origin];
			},
		};
		const broker = new SecretBroker({
			providers: { selected, other },
			bindings: { LOGIN: binding },
		});
		const consume = vi.fn();
		const signal = new AbortController().signal;
		expect(broker.allows("secret:LOGIN", origin)).toBe(true);
		await broker.use("secret:LOGIN", origin, signal, consume);
		expect(consume).toHaveBeenCalledExactlyOnceWith(secret);
		expect(other.resolve).not.toHaveBeenCalled();
		if (kind === "env") {
			expect(fs.open).toHaveBeenCalledTimes(1);
			expect(env.handle.close).toHaveBeenCalledTimes(1);
			expect(runner).not.toHaveBeenCalled();
			for (const buffer of env.scratch)
				expect(buffer.every((value) => value === 0)).toBe(true);
		} else {
			expect(fs.open).not.toHaveBeenCalled();
			expect(runner).toHaveBeenCalledExactlyOnceWith(
				"/usr/bin/pass",
				["show", selectedKey],
				expect.objectContaining({ signal: expect.any(AbortSignal) }),
			);
			expect(runner.mock.calls[0][2].signal).not.toBe(signal);
		}
		await expect(
			broker.use(
				"secret:LOGIN",
				"https://other.fixture.invalid",
				signal,
				consume,
			),
		).rejects.toThrow("Secret operation failed");
		expect(consume).toHaveBeenCalledTimes(1);
		expect(other.resolve).not.toHaveBeenCalled();
	},
);
