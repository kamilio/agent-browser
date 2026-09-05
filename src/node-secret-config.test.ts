import { spawn } from "node:child_process";
import { constants, type BigIntStats } from "node:fs";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import {
	loadSecretConfig,
	nodeSecretConfigLimits,
} from "./node-secret-config.js";
import {
	EnvFileSecretProvider,
	PassSecretProvider,
} from "./node-secret-providers.js";
import { SecretBroker } from "./secret-providers.js";

vi.mock("node:fs/promises", () => ({ lstat: vi.fn(), open: vi.fn() }));
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		throw new Error("Real execution forbidden");
	}),
}));

const filename = "/synthetic-private/config.json";
const origin = "https://example.com";

function configuration() {
	return {
		providers: {
			local: { type: "env", path: "/synthetic-credentials/app.env" },
			vault: {
				type: "pass",
				executable: "/synthetic-bin/pass",
				timeoutMs: 10000,
			},
		},
		bindings: {
			LOGIN_PASSWORD: {
				provider: "local",
				key: "LOGIN_PASSWORD",
				origins: [origin],
			},
			VAULT_PASSWORD: {
				provider: "vault",
				key: "web/example/login",
				origins: [origin],
			},
		},
	};
}

function fixture(input: string | Uint8Array = JSON.stringify(configuration())) {
	const source = Buffer.from(input);
	const info = {
		dev: 1n,
		ino: 2n,
		uid: 1000n,
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
	} as BigIntStats;
	const buffers: Uint8Array[] = [];
	const handle = {
		stat: vi.fn(async () => ({ ...info })),
		read: vi.fn(
			async (
				buffer: Uint8Array,
				offset: number,
				length: number,
				position: number,
			) => {
				buffers.push(buffer);
				const bytesRead = Math.min(
					length,
					Math.max(0, source.length - position),
				);
				buffer.set(source.subarray(position, position + bytesRead), offset);
				return { bytesRead, buffer };
			},
		),
		close: vi.fn(async () => {}),
	};
	vi.mocked(fs.lstat).mockImplementation(
		async (path) =>
			({ ...(path === filename ? info : directory) }) as Awaited<
				ReturnType<typeof fs.lstat>
			>,
	);
	vi.mocked(fs.open).mockResolvedValue(handle as unknown as fs.FileHandle);
	return { source, info, directory, buffers, handle };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.spyOn(process, "getuid").mockReturnValue(1000);
	vi.spyOn(process, "geteuid").mockReturnValue(1000);
	vi.spyOn(EnvFileSecretProvider.prototype, "resolve").mockRejectedValue(
		new Error("Resolution forbidden"),
	);
	vi.spyOn(PassSecretProvider.prototype, "resolve").mockRejectedValue(
		new Error("Resolution forbidden"),
	);
});

afterEach(() => {
	expect(EnvFileSecretProvider.prototype.resolve).not.toHaveBeenCalled();
	expect(PassSecretProvider.prototype.resolve).not.toHaveBeenCalled();
	expect(spawn).not.toHaveBeenCalled();
	vi.restoreAllMocks();
});

async function invalid(operation = loadSecretConfig(filename)) {
	const error = await operation.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(Error);
	expect(error).toMatchObject({
		code: "invalid-input",
		message: "Invalid secret configuration",
	});
	expect((error as Error).cause).toBeUndefined();
}

it("no configuration preserves both host modes without discovery or resolution", async () => {
	await expect(loadSecretConfig(undefined)).resolves.toBeUndefined();
	await expect(
		loadSecretConfig(undefined, { processRuntime: true }),
	).resolves.toBeUndefined();
	expect(fs.lstat).not.toHaveBeenCalled();
	expect(fs.open).not.toHaveBeenCalled();
});

it.each([filename, "", "relative.json"])(
	"process runtime rejects configured path %s before access",
	async (path) => {
		await expect(
			loadSecretConfig(path, { processRuntime: true }),
		).rejects.toMatchObject({
			code: "unsupported",
			message:
				"Secret configuration is unsupported with the SafeJS process runtime",
		});
		expect(fs.lstat).not.toHaveBeenCalled();
		expect(fs.open).not.toHaveBeenCalled();
	},
);

it("loads only synthetic configuration with private flags, cleanup, and no provider resolution", async () => {
	const { handle, buffers } = fixture();
	const broker = await loadSecretConfig(filename);
	expect(broker).toBeInstanceOf(SecretBroker);
	expect(broker?.allows("secret:LOGIN_PASSWORD", origin)).toBe(true);
	expect(broker?.allows("secret:VAULT_PASSWORD", origin)).toBe(true);
	expect(
		broker?.allows("secret:LOGIN_PASSWORD", "https://other.example.com"),
	).toBe(false);
	expect(fs.open).toHaveBeenCalledExactlyOnceWith(
		filename,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	expect(
		vi
			.mocked(fs.lstat)
			.mock.calls.every(([path]) =>
				[filename, "/synthetic-private", "/"].includes(String(path)),
			),
	).toBe(true);
	expect(handle.close).toHaveBeenCalledOnce();
	expect(buffers.length).toBeGreaterThan(0);
	expect(buffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(
		true,
	);
});

it("accepts pass defaults without invoking its executable", async () => {
	fixture(
		'{"providers":{"vault":{"type":"pass"}},"bindings":{"LOGIN_PASSWORD":{"provider":"vault","key":"web/login","origins":["https://example.com"]}}}',
	);
	expect(
		(await loadSecretConfig(filename))?.allows("secret:LOGIN_PASSWORD", origin),
	).toBe(true);
});

it.each(["help", "capabilities"])(
	"native host %s uses the configured broker without sessions or resolution",
	async (command) => {
		fixture();
		const createSession = vi.fn(() => {
			throw new Error("Session creation forbidden");
		});
		const host = new BrowserCommandHost({
			secrets: await loadSecretConfig(filename),
			createSession,
		});
		try {
			expect(host.capabilities().secretReferences.enabled).toBe(true);
			await expect(host.execute([command])).resolves.toMatchObject({ command });
			expect(createSession).not.toHaveBeenCalled();
		} finally {
			await host.close();
		}
	},
);

it.each([
	"",
	"relative.json",
	"/",
	"/private/../config.json",
	"/private//config.json",
	"/private/./config.json",
	"/private/config\n.json",
	"/private/\u200bconfig.json",
	`/${"x".repeat(4096)}`,
])("rejects noncanonical config path %j before access", async (path) => {
	fixture();
	await invalid(loadSecretConfig(path));
	expect(fs.lstat).not.toHaveBeenCalled();
	expect(fs.open).not.toHaveBeenCalled();
});

it("rejects mismatched effective ownership before access", async () => {
	fixture();
	vi.spyOn(process, "geteuid").mockReturnValue(2000);
	await invalid();
	expect(fs.lstat).not.toHaveBeenCalled();
});

it.each([
	["world-readable", { mode: 0o604n }],
	["group-readable", { mode: 0o640n }],
	["other owner", { uid: 2000n }],
	["hard link", { nlink: 2n }],
	["symlink", { isFile: (): boolean => false, isSymbolicLink: () => true }],
	["directory", { isFile: (): boolean => false, isDirectory: () => true }],
	["special file", { isFile: (): boolean => false }],
])("rejects %s config file without opening it", async (_name, changes) => {
	const { info } = fixture();
	Object.assign(info, changes);
	await invalid();
	expect(fs.open).not.toHaveBeenCalled();
});

it.each([
	["writable parent", { mode: 0o770n }],
	["sticky immediate parent", { mode: 0o1777n }],
	["foreign owner", { uid: 2000n }],
	["root-owned immediate parent", { uid: 0n }],
	["symlink parent", { isSymbolicLink: () => true }],
	["nondirectory", { isDirectory: () => false }],
])("rejects unsafe directory chain: %s", async (_name, changes) => {
	const { directory } = fixture();
	Object.assign(directory, changes);
	await invalid();
	expect(fs.open).not.toHaveBeenCalled();
});

it.each(["ino", "dev"] as const)(
	"rejects replacement during open by %s",
	async (field) => {
		const { info, handle } = fixture();
		handle.stat.mockResolvedValue({ ...info, [field]: 9n });
		await invalid();
		expect(handle.read).not.toHaveBeenCalled();
		expect(handle.close).toHaveBeenCalledOnce();
	},
);

it.each([
	"ino",
	"dev",
	"size",
	"mtimeNs",
	"ctimeNs",
	"uid",
	"mode",
	"nlink",
] as const)("rejects descriptor changes during read: %s", async (field) => {
	const { info, handle, buffers } = fixture();
	handle.stat
		.mockResolvedValueOnce({ ...info })
		.mockResolvedValue({ ...info, [field]: 9n });
	await invalid();
	expect(handle.close).toHaveBeenCalledOnce();
	expect(buffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(
		true,
	);
});

it("rejects path replacement after reading", async () => {
	const { info, directory } = fixture();
	let fileStats = 0;
	vi.mocked(fs.lstat).mockImplementation(async (path) => {
		if (path !== filename)
			return { ...directory } as Awaited<ReturnType<typeof fs.lstat>>;
		fileStats++;
		return { ...info, ino: fileStats === 1 ? 2n : 3n } as Awaited<
			ReturnType<typeof fs.lstat>
		>;
	});
	await invalid();
});

it.each(["ino", "mode", "uid"] as const)(
	"rejects ancestor race: %s",
	async (field) => {
		const { info, directory } = fixture();
		let parentStats = 0;
		vi.mocked(fs.lstat).mockImplementation(async (path) => {
			if (path === filename)
				return { ...info } as Awaited<ReturnType<typeof fs.lstat>>;
			if (path === "/synthetic-private") parentStats++;
			return {
				...directory,
				...(parentStats > 1 ? { [field]: 9n } : {}),
			} as Awaited<ReturnType<typeof fs.lstat>>;
		});
		await invalid();
	},
);

it.each([-1n, BigInt(nodeSecretConfigLimits.maxFileBytes + 1)])(
	"rejects file size %s before reading",
	async (size) => {
		const { info, handle } = fixture();
		info.size = size;
		await invalid();
		expect(handle.read).not.toHaveBeenCalled();
		expect(handle.close).toHaveBeenCalledOnce();
	},
);

it.each([-1, 1])(
	"rejects growth or truncation relative to declared size (%s)",
	async (difference) => {
		const { info } = fixture();
		info.size += BigInt(difference);
		await invalid();
	},
);

it("accepts exactly 64 KiB and partial reads", async () => {
	const text = JSON.stringify(configuration());
	const { handle, source } = fixture(
		text.padEnd(nodeSecretConfigLimits.maxFileBytes, " "),
	);
	handle.read.mockImplementation(async (buffer, offset, length, position) => {
		const bytesRead = Math.min(17, length, source.length - position);
		buffer.set(source.subarray(position, position + bytesRead), offset);
		return { bytesRead, buffer };
	});
	expect(await loadSecretConfig(filename)).toBeInstanceOf(SecretBroker);
});

it.each(["lstat", "open", "read", "stat", "close"] as const)(
	"sanitizes %s failures without content, path, or cause",
	async (operation) => {
		const { handle } = fixture();
		const error = new Error(
			"/synthetic-credentials/private synthetic-sensitive-content",
		);
		if (operation === "lstat" || operation === "open")
			vi.mocked(fs[operation]).mockRejectedValue(error);
		else handle[operation].mockRejectedValue(error);
		await invalid();
	},
);

it.each([
	"",
	"null",
	"[]",
	"true",
	"1",
	'"secret"',
	"{}",
	'{"providers":{},"bindings":{},}',
	'{"providers":{},"bindings":{}} trailing',
	'{"providers":{},"bindings":{},"providers":{}}',
	'{"providers":{},"bindings":{},"provi\\u0064ers":{}}',
	'{"providers":{"local":{"type":"env","type":"pass","path":"/x"}},"bindings":{}}',
	'{"providers":{},"bindings":{"NAME":{"provider":"local","key":"one","key":"two","origins":[]}}}',
	'{"providers":{},"bindings":{},"__proto__":{}}',
	'{"providers":{"constructor":{"type":"pass"}},"bindings":{}}',
	'{"providers":{},"bindings":{"prototype":{}}}',
	'{"providers":{"\\u005f_proto__":{"type":"pass"}},"bindings":{}}',
	'{"providers":{},"bindings":{},"password":"synthetic-only"}',
	'\ufeff{"providers":{},"bindings":{}}',
	`{"providers":${"[".repeat(9)}0${"]".repeat(9)},"bindings":{}}`,
])(
	"rejects malformed, duplicate, pollution, or unknown JSON: %s",
	async (text) => {
		fixture(text);
		await invalid();
	},
);

it("rejects invalid UTF-8 without replacement decoding", async () => {
	fixture(Buffer.from([0xff, 0xfe]));
	await invalid();
});

it.each([
	null,
	[],
	"env",
	{},
	{ type: "keyring" },
	{ type: "env" },
	{ type: "env", path: null },
	{ type: "env", path: "relative.env" },
	{ type: "env", path: "/x/../app.env" },
	{ type: "env", path: "/x\n" },
	{ type: "env", path: `/${"x".repeat(4096)}` },
	{ type: "env", path: "/x", value: "synthetic-only" },
	{ type: "env", path: "/x", runner: "injected" },
	{ type: "pass", runner: "injected" },
	{ type: "pass", path: "/x" },
	{ type: "pass", executable: null },
	{ type: "pass", executable: "pass" },
	{ type: "pass", timeoutMs: null },
	{ type: "pass", timeoutMs: "1000" },
	{ type: "pass", timeoutMs: 0 },
	{ type: "pass", timeoutMs: 1.5 },
	{ type: "pass", timeoutMs: 30001 },
])("rejects provider shape or unknown fields: %j", async (provider) => {
	fixture(JSON.stringify({ providers: { local: provider }, bindings: {} }));
	await invalid();
});

it.each([
	null,
	[],
	{},
	{
		provider: "local",
		key: "NAME",
		origins: [origin],
		value: "synthetic-only",
	},
	{ provider: "missing", key: "NAME", origins: [origin] },
	{ provider: "local", key: "", origins: [origin] },
	{ provider: "local", key: "bad\nkey", origins: [origin] },
	{ provider: "local", key: "x".repeat(1025), origins: [origin] },
	{ provider: "local", key: "NAME", origins: [] },
	{ provider: "local", key: "NAME", origins: [null] },
	{ provider: "local", key: "NAME", origins: Array(65).fill(origin) },
	{ provider: "local", key: "NAME", origins: ["http://example.com"] },
	{ provider: "local", key: "NAME", origins: ["https://example.com/"] },
	{ provider: "local", key: "NAME", origins: ["https://*.example.com"] },
	{
		provider: "local",
		key: "NAME",
		origins: ["https://user:password@example.com"],
	},
])("rejects binding shape and broker-invalid bindings: %j", async (binding) => {
	fixture(
		JSON.stringify({
			providers: configuration().providers,
			bindings: { LOGIN_PASSWORD: binding },
		}),
	);
	await invalid();
});

it.each(["providers", "bindings"])(
	"rejects nonobject %s maps",
	async (field) => {
		for (const value of [null, [], "invalid"]) {
			fixture(JSON.stringify({ ...configuration(), [field]: value }));
			await invalid();
		}
	},
);

it.each(["providers", "bindings"])(
	"rejects invalid names in %s",
	async (field) => {
		const config = configuration();
		const value =
			field === "providers" ? { type: "pass" } : config.bindings.LOGIN_PASSWORD;
		fixture(JSON.stringify({ ...config, [field]: { "invalid name": value } }));
		await invalid();
	},
);

it.each(["providers", "bindings"])(
	"rejects overlimit %s maps within the byte limit",
	async (field) => {
		const entries = Object.fromEntries(
			Array.from({ length: 1025 }, (_, index) => [`N${index}`, {}]),
		);
		fixture(JSON.stringify({ ...configuration(), [field]: entries }));
		await invalid();
	},
);

it("accepts an empty explicit broker without resolving anything", async () => {
	fixture('{"providers":{},"bindings":{}}');
	expect(await loadSecretConfig(filename)).toBeInstanceOf(SecretBroker);
});
