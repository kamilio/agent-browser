import { constants, type BigIntStats } from "node:fs";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	EnvFileSecretProvider,
	type PassRunner,
	type PassRunnerOptions,
	PassSecretProvider,
	nodeSecretProviderLimits,
} from "./node-secret-providers.js";

vi.mock("node:fs/promises", () => ({ lstat: vi.fn(), open: vi.fn() }));
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		throw new Error("Real process execution forbidden");
	}),
}));

const path = "/synthetic-private/secrets.fixture";
const signal = () => new AbortController().signal;

function fixture(text = "PASSWORD=synthetic-password\n") {
	const source = Buffer.from(text);
	const uid = BigInt(process.getuid?.() ?? 0);
	const info = {
		dev: 1n,
		ino: 2n,
		uid,
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
	const read = vi.fn(
		async (
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number,
		) => {
			buffers.push(buffer);
			const bytesRead = Math.min(length, Math.max(0, source.length - position));
			buffer.set(source.subarray(position, position + bytesRead), offset);
			return { bytesRead, buffer };
		},
	);
	const handle = {
		stat: vi.fn(async () => ({ ...info })),
		read,
		close: vi.fn(async () => {}),
	};
	vi.mocked(fs.lstat).mockImplementation(
		async (filename) =>
			({ ...(filename === path ? info : directory) }) as Awaited<
				ReturnType<typeof fs.lstat>
			>,
	);
	vi.mocked(fs.open).mockResolvedValue(handle as unknown as fs.FileHandle);
	return {
		provider: new EnvFileSecretProvider({ path }),
		info,
		directory,
		handle,
		buffers,
		source,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

async function genericFailure(operation: Promise<unknown>) {
	const error = await operation.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).toBe("Secret operation failed");
	expect((error as Error).cause).toBeUndefined();
}

it("reads only the explicit key with private no-follow flags, bounded reads, cleanup, and no cache", async () => {
	const { provider, handle, buffers } = fixture(
		"OTHER=synthetic-other\nPASSWORD=synthetic-password\n",
	);
	await expect(provider.resolve("PASSWORD", signal())).resolves.toBe(
		"synthetic-password",
	);
	await expect(provider.resolve("PASSWORD", signal())).resolves.toBe(
		"synthetic-password",
	);
	expect(fs.open).toHaveBeenCalledWith(
		path,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	expect(fs.open).toHaveBeenCalledTimes(2);
	expect(handle.close).toHaveBeenCalledTimes(2);
	expect(buffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(
		true,
	);
	expect(JSON.stringify(provider)).toBe("{}");
});

it.each([
	["PASSWORD=synthetic # comment\n", "synthetic"],
	[
		"# comment\n\n PASSWORD = 'synthetic # literal' # tail\r\n",
		"synthetic # literal",
	],
	['PASSWORD="synthetic\\nline\\t\\\\\\"" # tail\n', 'synthetic\nline\t\\"'],
	[
		"PASSWORD='${SYNTHETIC} $(not-executed) `literal`'\n",
		"${SYNTHETIC} $(not-executed) `literal`",
	],
	["PASSWORD=synthetic#literal", "synthetic#literal"],
	["PASSWORD=synthetic\nEMPTY=# comment", "synthetic"],
])("parses bounded env subset case %#", async (text, expected) => {
	await expect(
		fixture(text).provider.resolve("PASSWORD", signal()),
	).resolves.toBe(expected);
});

it.each([
	"PASSWORD=first\nPASSWORD=second",
	"PASSWORD=synthetic\nOTHER=first\nOTHER=second",
	"PASSWORD='unclosed",
	'PASSWORD="bad\\q"',
	"PASSWORD='synthetic' trailing",
	"export PASSWORD=synthetic",
	"PASSWORD=two words",
	"PASSWORD=",
	"PASSWORD=''",
	"PASSWORD=\0",
	"PASSWORD=synthetic\nmalformed",
	"PASSWORD=synthetic\rbroken",
	"OTHER=synthetic",
	'PASSWORD="multiline\ntext"',
	`PASSWORD=${"é".repeat(2049)}`,
])("rejects malformed or unusable env case %# safely", async (text) => {
	await genericFailure(fixture(text).provider.resolve("PASSWORD", signal()));
});

it.each([
	"relative",
	"/synthetic/../secret",
	"/synthetic/secret\n",
	"/synthetic/secret\0",
	"",
	"x".repeat(4097),
])("rejects configured path case %#", (invalid) => {
	expect(() => new EnvFileSecretProvider({ path: invalid })).toThrow(
		"Secret operation failed",
	);
	expect(() => new PassSecretProvider({ executable: invalid })).toThrow(
		"Secret operation failed",
	);
});

it.each(["PASSWORD\n", "PASSWORD\0", "../PASSWORD", "A".repeat(129), ""])(
	"rejects env key case %# before filesystem access",
	async (key) => {
		const { provider } = fixture();
		await genericFailure(provider.resolve(key, signal()));
		expect(fs.lstat).not.toHaveBeenCalled();
		expect(fs.open).not.toHaveBeenCalled();
	},
);

it.each([0o640n, 0o604n, 0o620n, 0o601n])(
	"rejects nonprivate file mode case %#",
	async (mode) => {
		const { provider, info } = fixture();
		info.mode = mode;
		await genericFailure(provider.resolve("PASSWORD", signal()));
		expect(fs.open).not.toHaveBeenCalled();
	},
);

it("rejects foreign owners, hardlinks, nonregular files, and symlink ancestors", async () => {
	for (const mutate of [
		(info: BigIntStats) => {
			info.uid += 1n;
		},
		(info: BigIntStats) => {
			info.nlink = 2n;
		},
		(info: BigIntStats) => {
			info.isFile = () => false;
		},
	]) {
		const { provider, info } = fixture();
		mutate(info);
		await genericFailure(provider.resolve("PASSWORD", signal()));
	}
	const { provider, directory } = fixture();
	directory.isSymbolicLink = () => true;
	await genericFailure(provider.resolve("PASSWORD", signal()));
	expect(fs.open).not.toHaveBeenCalled();
});

it("fails closed without ownership support", async () => {
	const { provider } = fixture();
	vi.spyOn(process, "geteuid").mockReturnValue((process.getuid?.() ?? 0) + 1);
	await genericFailure(provider.resolve("PASSWORD", signal()));
	expect(fs.open).not.toHaveBeenCalled();
});

it("rejects no-follow failures, swapped files, oversized files, and changed metadata", async () => {
	const first = fixture();
	vi.mocked(fs.open).mockRejectedValueOnce(
		new Error("synthetic-private-path ELOOP"),
	);
	await genericFailure(first.provider.resolve("PASSWORD", signal()));
	const second = fixture();
	second.handle.stat.mockResolvedValueOnce({ ...second.info, ino: 3n });
	await genericFailure(second.provider.resolve("PASSWORD", signal()));
	expect(second.handle.read).not.toHaveBeenCalled();
	expect(second.handle.close).toHaveBeenCalledOnce();
	const third = fixture();
	third.info.size = BigInt(nodeSecretProviderLimits.maxFileBytes + 1);
	await genericFailure(third.provider.resolve("PASSWORD", signal()));
	expect(third.handle.read).not.toHaveBeenCalled();
	const fourth = fixture();
	fourth.handle.stat
		.mockResolvedValueOnce({ ...fourth.info })
		.mockResolvedValueOnce({ ...fourth.info, mtimeNs: 2n });
	await genericFailure(fourth.provider.resolve("PASSWORD", signal()));
	expect(
		fourth.buffers.every((buffer) => buffer.every((byte) => byte === 0)),
	).toBe(true);
});

it("rejects growth beyond stat size and invalid UTF-8", async () => {
	const growth = fixture();
	growth.info.size -= 1n;
	await genericFailure(growth.provider.resolve("PASSWORD", signal()));
	const invalid = fixture();
	invalid.source[0] = 0xff;
	await genericFailure(invalid.provider.resolve("PASSWORD", signal()));
});

it("handles abort before access and during read without leaking errors or retaining buffers", async () => {
	const { provider, handle, buffers } = fixture();
	await genericFailure(
		provider.resolve("PASSWORD", AbortSignal.abort("synthetic-reason")),
	);
	expect(fs.open).not.toHaveBeenCalled();
	const controller = new AbortController();
	const originalRead = handle.read.getMockImplementation();
	handle.read.mockImplementationOnce(async (...args) => {
		controller.abort("synthetic-reason");
		if (!originalRead) throw new Error("Missing fixture implementation");
		return originalRead(...args);
	});
	await genericFailure(provider.resolve("PASSWORD", controller.signal));
	expect(handle.close).toHaveBeenCalledOnce();
	expect(buffers.every((buffer) => buffer.every((byte) => byte === 0))).toBe(
		true,
	);
});

function outputRunner(
	text = "synthetic-password\nmetadata: synthetic\n",
	exitCode = 0,
) {
	return vi.fn<PassRunner>(async (_executable, _args, options) => {
		options.stdout(Buffer.from(text));
		return exitCode;
	});
}

it("uses the exact executable and fixed show arguments, selecting only the first line", async () => {
	const runner = outputRunner("synthetic-password\r\nmetadata: synthetic\n");
	const provider = new PassSecretProvider({ runner });
	await expect(provider.resolve("accounts/login", signal())).resolves.toBe(
		"synthetic-password",
	);
	await expect(provider.resolve("accounts/login", signal())).resolves.toBe(
		"synthetic-password",
	);
	expect(runner).toHaveBeenCalledTimes(2);
	expect(runner).toHaveBeenCalledWith(
		"/usr/bin/pass",
		["show", "accounts/login"],
		expect.objectContaining({
			signal: expect.any(AbortSignal),
			stdout: expect.any(Function),
			stderr: expect.any(Function),
		}),
	);
	expect(JSON.stringify(provider)).toBe("{}");
});

it.each([
	"-c",
	"/absolute",
	"../entry",
	"folder/../entry",
	"./entry",
	"folder//entry",
	"entry/",
	"entry\n",
	"entry\0",
	"entry\\bad",
	"entry;command",
	"",
	"x".repeat(1025),
])("rejects pass entry case %# before runner invocation", async (key) => {
	const runner = outputRunner();
	await genericFailure(
		new PassSecretProvider({ runner }).resolve(key, signal()),
	);
	expect(runner).not.toHaveBeenCalled();
});

it.each(["", "\nmetadata", "synthetic\0password\n", `${"é".repeat(2049)}\n`])(
	"rejects invalid pass output case %#",
	async (text) => {
		await genericFailure(
			new PassSecretProvider({ runner: outputRunner(text) }).resolve(
				"entry",
				signal(),
			),
		);
	},
);

it("supports chunked UTF-8 first lines and never returns metadata", async () => {
	const data = Buffer.from("é-synthetic\nmetadata");
	const runner: PassRunner = async (_executable, _args, options) => {
		for (const byte of data) options.stdout(Uint8Array.of(byte));
		return 0;
	};
	await expect(
		new PassSecretProvider({ runner }).resolve("entry", signal()),
	).resolves.toBe("é-synthetic");
});

it("scrubs runner errors, nonzero exit status, and stderr", async () => {
	const runner: PassRunner = async (_executable, _args, options) => {
		options.stderr(Buffer.from("synthetic-private-stderr"));
		throw new Error("synthetic-private-error", {
			cause: "synthetic-private-cause",
		});
	};
	await genericFailure(
		new PassSecretProvider({ runner }).resolve("entry", signal()),
	);
	await genericFailure(
		new PassSecretProvider({ runner: outputRunner("synthetic\n", 1) }).resolve(
			"entry",
			signal(),
		),
	);
});

it.each(["stdout", "stderr"] as const)(
	"bounds %s cumulatively and cancels the runner",
	async (stream) => {
		let received: PassRunnerOptions | undefined;
		const limit =
			stream === "stdout"
				? nodeSecretProviderLimits.maxStdoutBytes
				: nodeSecretProviderLimits.maxStderrBytes;
		const runner: PassRunner = async (_executable, _args, options) => {
			received = options;
			options[stream](new Uint8Array(limit));
			options[stream](Uint8Array.of(1));
			return 0;
		};
		await genericFailure(
			new PassSecretProvider({ runner }).resolve("entry", signal()),
		);
		expect(received?.signal.aborted).toBe(true);
	},
);

it("times out an uncooperative runner and ignores late callbacks", async () => {
	vi.useFakeTimers();
	let received: PassRunnerOptions | undefined;
	const runner: PassRunner = (_executable, _args, options) => {
		received = options;
		return new Promise(() => {});
	};
	const pending = genericFailure(
		new PassSecretProvider({ runner, timeoutMs: 5 }).resolve("entry", signal()),
	);
	await vi.advanceTimersByTimeAsync(5);
	await pending;
	expect(received?.signal.aborted).toBe(true);
	expect(() => received?.stdout(Buffer.from("late-synthetic"))).not.toThrow();
	expect(vi.getTimerCount()).toBe(0);
});

it("checks cancellation before running and after completion", async () => {
	const runner = outputRunner();
	await genericFailure(
		new PassSecretProvider({ runner }).resolve(
			"entry",
			AbortSignal.abort("synthetic-reason"),
		),
	);
	expect(runner).not.toHaveBeenCalled();
	const controller = new AbortController();
	const aborting: PassRunner = async (_executable, _args, options) => {
		options.stdout(Buffer.from("synthetic\n"));
		controller.abort("synthetic-reason");
		return 0;
	};
	await genericFailure(
		new PassSecretProvider({ runner: aborting }).resolve(
			"entry",
			controller.signal,
		),
	);
});

it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 30_001])(
	"rejects invalid pass timeout case %#",
	(timeoutMs) => {
		expect(
			() => new PassSecretProvider({ timeoutMs, runner: outputRunner() }),
		).toThrow("Secret operation failed");
	},
);

it("accepts exact file and selected-secret byte limits", async () => {
	const head = `PASSWORD=${"x".repeat(4096)}\n#`;
	const text =
		head + "c".repeat(nodeSecretProviderLimits.maxFileBytes - head.length);
	await expect(
		fixture(text).provider.resolve("PASSWORD", signal()),
	).resolves.toHaveLength(4096);
});

it("fails safely on empty files, short reads, permission changes after open, and read or close errors", async () => {
	await genericFailure(fixture("").provider.resolve("PASSWORD", signal()));
	const short = fixture();
	short.handle.read.mockImplementationOnce(async (buffer) => ({
		bytesRead: 0,
		buffer,
	}));
	await genericFailure(short.provider.resolve("PASSWORD", signal()));
	const permissions = fixture();
	permissions.handle.stat.mockResolvedValueOnce({
		...permissions.info,
		mode: 0o644n,
	});
	await genericFailure(permissions.provider.resolve("PASSWORD", signal()));
	expect(permissions.handle.read).not.toHaveBeenCalled();
	const readError = fixture();
	readError.handle.read.mockRejectedValueOnce(
		new Error("synthetic-private-read-error"),
	);
	await genericFailure(readError.provider.resolve("PASSWORD", signal()));
	expect(readError.handle.close).toHaveBeenCalledOnce();
	const closeError = fixture();
	closeError.handle.close.mockRejectedValueOnce(
		new Error("synthetic-private-close-error"),
	);
	await genericFailure(closeError.provider.resolve("PASSWORD", signal()));
	expect(
		closeError.buffers.every((buffer) => buffer.every((byte) => byte === 0)),
	).toBe(true);
});

it("rejects symlink files and writable or changed ancestor directories", async () => {
	const symlink = fixture();
	symlink.info.isFile = () => false;
	symlink.info.isSymbolicLink = () => true;
	await genericFailure(symlink.provider.resolve("PASSWORD", signal()));
	const writable = fixture();
	writable.directory.mode = 0o777n;
	await genericFailure(writable.provider.resolve("PASSWORD", signal()));
	const changed = fixture();
	const originalRead = changed.handle.read.getMockImplementation();
	changed.handle.read.mockImplementationOnce(async (...args) => {
		changed.directory.ino = 999n;
		if (!originalRead) throw new Error("Missing fixture implementation");
		return originalRead(...args);
	});
	await genericFailure(changed.provider.resolve("PASSWORD", signal()));
});

it("copies env and pass constructor configuration", async () => {
	fixture();
	const envOptions = { path };
	const env = new EnvFileSecretProvider(envOptions);
	envOptions.path = "/other-private/secrets.fixture";
	await expect(env.resolve("PASSWORD", signal())).resolves.toBe(
		"synthetic-password",
	);
	const runner = outputRunner();
	const passOptions = {
		executable: "/trusted/bin/pass",
		timeoutMs: 10,
		runner,
	};
	const pass = new PassSecretProvider(passOptions);
	passOptions.executable = "/other/bin/pass";
	passOptions.runner = outputRunner("changed");
	await expect(pass.resolve("entry", signal())).resolves.toBe(
		"synthetic-password",
	);
	expect(runner.mock.calls[0]?.[0]).toBe("/trusted/bin/pass");
});

it("accepts bounded metadata and stderr, preserves a password BOM, and rejects invalid password UTF-8", async () => {
	const runner: PassRunner = async (_executable, _args, options) => {
		options.stdout(
			Buffer.from(
				`synthetic\n${"m".repeat(nodeSecretProviderLimits.maxStdoutBytes - 10)}`,
			),
		);
		options.stderr(new Uint8Array(nodeSecretProviderLimits.maxStderrBytes));
		return 0;
	};
	await expect(
		new PassSecretProvider({ runner }).resolve("entry", signal()),
	).resolves.toBe("synthetic");
	await expect(
		new PassSecretProvider({
			runner: outputRunner("\ufeffsynthetic\n"),
		}).resolve("entry", signal()),
	).resolves.toBe("\ufeffsynthetic");
	const invalid: PassRunner = async (_executable, _args, options) => {
		options.stdout(Uint8Array.of(0xff));
		return 0;
	};
	await genericFailure(
		new PassSecretProvider({ runner: invalid }).resolve("entry", signal()),
	);
});

it("cancels a pending pass runner without exposing the abort reason", async () => {
	const controller = new AbortController();
	let received: PassRunnerOptions | undefined;
	const runner: PassRunner = (_executable, _args, options) => {
		received = options;
		return new Promise(() => {});
	};
	const pending = genericFailure(
		new PassSecretProvider({ runner }).resolve("entry", controller.signal),
	);
	await Promise.resolve();
	controller.abort("synthetic-private-reason");
	await pending;
	expect(received?.signal.aborted).toBe(true);
});
