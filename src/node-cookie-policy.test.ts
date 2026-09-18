import { constants, readFileSync } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
	read: vi.fn(),
	unbounded: vi.fn(),
	open: vi.fn(),
	lstat: vi.fn(),
	realpath: vi.fn(),
	root: vi.fn(async () => "/trusted/fixture"),
	secrets: vi.fn(async () => undefined),
	host: vi.fn(),
	process: vi.fn(),
	spawn: vi.fn(() => {
		throw new Error("Unexpected subprocess");
	}),
	request: vi.fn(() => {
		throw new Error("Unexpected request");
	}),
	listen: vi.fn(() => {
		throw new Error("Unexpected listener");
	}),
}));
vi.mock("node:fs/promises", async (original) => ({
	...(await original<typeof import("node:fs/promises")>()),
	readFile: boundary.unbounded,
	open: boundary.open,
	lstat: boundary.lstat,
	realpath: boundary.realpath,
}));
vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("./node-process-boundary.js", async (original) => ({
	...(await original<typeof import("./node-process-boundary.js")>()),
	processReadRoot: boundary.root,
}));
vi.mock("./node-secret-config.js", () => ({
	loadSecretConfig: boundary.secrets,
}));
vi.mock("./node-command-client.js", () => ({
	requestCommand: boundary.request,
	approvePlayground: vi.fn(),
}));
vi.mock("./node-command-server.js", () => ({
	listenCommandServer: boundary.listen,
}));
vi.mock("./node-runtime.js", () => ({
	readCommandConnection: async () => {
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("not-found", "No fixture connection");
	},
	writeCommandConnection: vi.fn(),
}));
vi.mock("./command-host.js", () => ({
	BrowserCommandHost: class {
		constructor(options: unknown) {
			boundary.host(options);
		}
		async execute() {
			return { schemaVersion: 1, data: {} };
		}
		async close() {}
	},
}));
vi.mock("./node-session-host.js", () => ({
	SessionProcessHost: class {
		constructor(options: unknown) {
			boundary.process(options);
		}
		async execute() {
			return { schemaVersion: 1, data: {} };
		}
		async close() {}
	},
}));

const source = readFileSync(
	new URL("../vendor/public-suffix/public_suffix_list.dat", import.meta.url),
);
function fileInfo() {
	return {
		dev: 1n,
		ino: 2n,
		size: 335592n,
		mtimeNs: 3n,
		ctimeNs: 4n,
		isFile: () => true,
		isSymbolicLink: () => false,
	};
}
let content = source;
function readChunk(
	buffer: Uint8Array,
	offset: number,
	length: number,
	position: number,
) {
	const chunk = content.subarray(position, position + length);
	buffer.set(chunk, offset);
	return { bytesRead: chunk.length, buffer };
}
const handle = {
	stat: vi.fn(),
	read: vi.fn(),
	close: vi.fn(),
};
const previousArgs = process.argv;
const previousCode = process.exitCode;
beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	boundary.read.mockReset().mockImplementation(async () => Buffer.from(source));
	boundary.unbounded
		.mockReset()
		.mockImplementation((path) => boundary.read(path));
	boundary.lstat.mockReset().mockImplementation(async () => fileInfo());
	boundary.realpath
		.mockReset()
		.mockImplementation(async (path: URL) => fileURLToPath(path));
	boundary.open.mockReset().mockImplementation(async (path) => {
		content = await boundary.read(path);
		return handle;
	});
	handle.stat.mockReset().mockImplementation(async () => fileInfo());
	handle.read
		.mockReset()
		.mockImplementation(async (...args: Parameters<typeof readChunk>) =>
			readChunk(...args),
		);
	handle.close.mockReset().mockResolvedValue(undefined);
	for (const name of Object.keys(process.env))
		if (name.startsWith("AGENT_BROWSER_") || name === "PLAYWRIGHT_CLI_SESSION")
			vi.stubEnv(name, undefined);
	process.exitCode = 0;
	process.argv = ["node", "agent-browser", "capabilities"];
});
afterEach(() => {
	process.argv = previousArgs;
	process.exitCode = previousCode;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	expect(boundary.spawn).not.toHaveBeenCalled();
	expect(boundary.request).not.toHaveBeenCalled();
	expect(boundary.listen).not.toHaveBeenCalled();
});

async function invoke() {
	const log = vi.spyOn(console, "log").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await import("./cli.js");
	await vi.waitFor(() =>
		expect(log.mock.calls.length + error.mock.calls.length).toBe(1),
	);
	return { log, error };
}

it("keeps the default selector allocation and PSL IO free", async () => {
	const {
		cookiePolicySelection,
		loadNodeCookiePolicy,
		cookiePolicyFromInitialize,
	} = await import("./node-cookie-policy.js");
	expect(cookiePolicySelection({})).toBeUndefined();
	expect(cookiePolicySelection({ cookiePolicy: undefined })).toBeUndefined();
	expect(await loadNodeCookiePolicy(undefined)).toBeUndefined();
	expect(await cookiePolicyFromInitialize({})).toBeUndefined();
	expect(boundary.read).not.toHaveBeenCalled();
	for (const operation of [
		boundary.open,
		boundary.lstat,
		boundary.realpath,
		boundary.unbounded,
	])
		expect(operation).not.toHaveBeenCalled();
});

it.each([
	"",
	"host-only",
	"pinned-psl-v1 ",
	"PINNED-PSL-V1",
	null,
	false,
	1,
	{},
	[],
])("rejects malformed selector %j", async (cookiePolicy) => {
	const { cookiePolicySelection } = await import("./node-cookie-policy.js");
	expect(() => cookiePolicySelection({ cookiePolicy })).toThrowError(
		expect.objectContaining({ code: "invalid-input" }),
	);
	expect(boundary.read).not.toHaveBeenCalled();
});

it.each(["cookiePolicy", "AGENT_BROWSER_COOKIE_POLICY"] as const)(
	"rejects inherited, hidden and accessor %s without invoking getters",
	async (key) => {
		const { cookiePolicySelection } = await import("./node-cookie-policy.js");
		const getter = vi.fn(() => "pinned-psl-v1");
		for (const options of [
			Object.create({ [key]: "pinned-psl-v1" }),
			Object.create({ [key]: undefined }),
			Object.defineProperty({}, key, { enumerable: true, get: getter }),
			Object.defineProperty({}, key, { value: "pinned-psl-v1" }),
		])
			expect(() => cookiePolicySelection(options, key)).toThrowError(
				expect.objectContaining({ code: "invalid-input" }),
			);
		expect(getter).not.toHaveBeenCalled();
	},
);

it("loads only the fixed repository fixture and reconstructs a branded policy across JSON", async () => {
	const { loadNodeCookiePolicy, cookiePolicyFromInitialize } = await import(
		"./node-cookie-policy.js"
	);
	const { isPinnedPublicSuffixSnapshot } = await import(
		"./pinned-public-suffix.js"
	);
	const selected = await loadNodeCookiePolicy("pinned-psl-v1");
	expect(boundary.read).toHaveBeenCalledExactlyOnceWith(
		new URL("../vendor/public-suffix/public_suffix_list.dat", import.meta.url),
	);
	expect(selected?.cookiePolicySource).toBe(source.toString("utf8"));
	expect(
		isPinnedPublicSuffixSnapshot(selected?.options.publicSuffixSnapshot),
	).toBe(true);
	expect(Object.isFrozen(selected?.options)).toBe(true);
	const restored = await cookiePolicyFromInitialize(
		JSON.parse(
			JSON.stringify({
				cookiePolicy: selected?.cookiePolicy,
				cookiePolicySource: selected?.cookiePolicySource,
			}),
		),
	);
	expect(
		isPinnedPublicSuffixSnapshot(restored?.options.publicSuffixSnapshot),
	).toBe(true);
	expect(restored?.options.publicSuffixSnapshot).not.toBe(
		selected?.options.publicSuffixSnapshot,
	);
	expect(boundary.read).toHaveBeenCalledTimes(1);
});

it.each(["missing", "changed"])(
	"fails closed on %s vendored bytes",
	async (mode) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		if (mode === "missing")
			boundary.read.mockRejectedValueOnce(new Error("absent"));
		else {
			const changed = Buffer.from(source);
			changed[0] ^= 1;
			boundary.read.mockResolvedValueOnce(changed);
		}
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
	},
);

it.each([
	{ cookiePolicySource: source.toString("utf8") },
	{ cookiePolicy: "pinned-psl-v1" },
	{ cookiePolicy: "pinned-psl-v1", cookiePolicySource: {} },
	{ cookiePolicy: "pinned-psl-v1", cookiePolicySource: "x".repeat(335593) },
	{ cookiePolicy: "pinned-psl-v1", cookiePolicySource: "x".repeat(335592) },
	{ cookiePolicy: "pinned-psl-v1", cookiePolicySource: "é".repeat(335592) },
	{ cookiePolicy: { match: "serialized matcher" } },
])(
	"rejects unverified initialize payload %# without file IO",
	async (message) => {
		const { cookiePolicyFromInitialize } = await import(
			"./node-cookie-policy.js"
		);
		await expect(cookiePolicyFromInitialize(message)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(boundary.read).not.toHaveBeenCalled();
	},
);

it("rejects accessor and inherited initialize sources without reading them", async () => {
	const { cookiePolicyFromInitialize } = await import(
		"./node-cookie-policy.js"
	);
	const getter = vi.fn(() => source.toString("utf8"));
	const message = Object.defineProperty(
		{ cookiePolicy: "pinned-psl-v1" },
		"cookiePolicySource",
		{ get: getter, enumerable: true },
	);
	await expect(cookiePolicyFromInitialize(message)).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(
		cookiePolicyFromInitialize(
			Object.assign(
				Object.create({ cookiePolicySource: source.toString("utf8") }),
				{ cookiePolicy: "pinned-psl-v1" },
			),
		),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(getter).not.toHaveBeenCalled();
});

it("keeps default CLI PSL and credential IO free", async () => {
	const { error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(boundary.read).not.toHaveBeenCalled();
	for (const operation of [
		boundary.open,
		boundary.lstat,
		boundary.realpath,
		boundary.unbounded,
	])
		expect(operation).not.toHaveBeenCalled();
	expect(boundary.secrets).toHaveBeenCalledWith(undefined, {
		processRuntime: false,
	});
	const session = boundary.host.mock.calls[0][0].createSession();
	try {
		session.cookies.setCookie(
			"https://app.zoom.us/",
			"shared=yes; Domain=zoom.us; Secure; SameSite=None",
			{ siteUrl: "https://app.zoom.us/" },
		);
		expect(
			session.cookies.cookieHeader("https://other.zoom.us/", {
				siteUrl: "https://other.zoom.us/",
			}),
		).toBe("");
	} finally {
		await session.close();
	}
});

it("rejects corrupted local policy bytes before process spawn", async () => {
	const { BrowserSessionProcess } = await import("./node-session-process.js");
	boundary.read.mockResolvedValueOnce(Buffer.alloc(335592));
	await expect(
		BrowserSessionProcess.create({
			packageRoot: "/trusted/fixture",
			cookiePolicy: "pinned-psl-v1",
		}),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(boundary.spawn).not.toHaveBeenCalled();
});

it("rejects corrupted CLI policy bytes before credential or session allocation", async () => {
	vi.stubEnv("AGENT_BROWSER_COOKIE_POLICY", "pinned-psl-v1");
	boundary.read.mockResolvedValueOnce(Buffer.alloc(335592));
	const { error } = await invoke();
	expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
		error: { code: "invalid-input" },
	});
	expect(boundary.secrets).not.toHaveBeenCalled();
	expect(boundary.host).not.toHaveBeenCalled();
});

it.each(["", "auto", "pinned-psl-v1 "])(
	"rejects invalid CLI selection %j before host or credentials",
	async (selection) => {
		vi.stubEnv("AGENT_BROWSER_COOKIE_POLICY", selection);
		const { error } = await invoke();
		expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
			error: {
				code: "invalid-input",
				message: expect.stringContaining("AGENT_BROWSER_COOKIE_POLICY"),
			},
		});
		expect(boundary.host).not.toHaveBeenCalled();
		expect(boundary.process).not.toHaveBeenCalled();
		expect(boundary.secrets).not.toHaveBeenCalled();
		expect(boundary.read).not.toHaveBeenCalled();
	},
);

it("installs one verified native CLI policy for all sessions", async () => {
	vi.stubEnv("AGENT_BROWSER_COOKIE_POLICY", "pinned-psl-v1");
	boundary.read.mockImplementationOnce(async () => {
		vi.stubEnv("AGENT_BROWSER_COOKIE_POLICY", "invalid-later-value");
		return Buffer.from(source);
	});
	const { error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(boundary.read).toHaveBeenCalledTimes(1);
	const { createSession } = boundary.host.mock.calls[0][0];
	const first = createSession();
	const second = createSession();
	try {
		for (const session of [first, second]) {
			session.cookies.setCookie(
				"https://app.zoom.us/",
				"domain=yes; Domain=zoom.us; Secure; SameSite=None",
				{ siteUrl: "https://app.zoom.us/" },
			);
			expect(
				session.cookies.cookieHeader("https://other.zoom.us/", {
					siteUrl: "https://other.zoom.us/",
				}),
			).toBe("domain=yes");
		}
	} finally {
		await first.close();
		await second.close();
	}
	expect(boundary.read).toHaveBeenCalledTimes(1);
});

it("forwards CLI selection while retaining package root and runtime semantics", async () => {
	vi.stubEnv("AGENT_BROWSER_COOKIE_POLICY", "pinned-psl-v1");
	vi.stubEnv("AGENT_BROWSER_SAFEJS_ROOT", "/trusted/fixture");
	vi.stubEnv("AGENT_BROWSER_PAGE_RUNTIME", "extension");
	vi.stubEnv("AGENT_BROWSER_PAGE_GLOBALS", "classic");
	const { error } = await invoke();
	expect(error).not.toHaveBeenCalled();
	expect(boundary.process).toHaveBeenCalledExactlyOnceWith({
		process: {
			packageRoot: "/trusted/fixture",
			cookiePolicy: "pinned-psl-v1",
			runtimeAdapter: "extension",
			runtimeOptions: { classicScripts: true },
			websiteScripts: undefined,
			identity: { languages: ["en-US"] },
		},
	});
	expect(boundary.read).not.toHaveBeenCalled();
});

it("bounds allocation and reads to pinned bytes plus one EOF byte, then closes before hashing", async () => {
	const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
	const digest = vi.spyOn(crypto.subtle, "digest");
	expect(await loadNodeCookiePolicy("pinned-psl-v1")).toHaveProperty(
		"cookiePolicy",
		"pinned-psl-v1",
	);
	expect(boundary.unbounded).not.toHaveBeenCalled();
	expect(boundary.open).toHaveBeenCalledExactlyOnceWith(
		new URL("../vendor/public-suffix/public_suffix_list.dat", import.meta.url),
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	expect(handle.read).toHaveBeenCalledTimes(2);
	for (const [buffer, offset, length, position] of handle.read.mock.calls) {
		expect(buffer.byteLength).toBe(335593);
		expect(offset).toBe(position);
		expect(offset + length).toBeLessThanOrEqual(335593);
	}
	expect(handle.read.mock.calls[1].slice(1)).toEqual([335592, 1, 335592]);
	expect(handle.close).toHaveBeenCalledOnce();
	expect(handle.close.mock.invocationCallOrder[0]).toBeLessThan(
		digest.mock.invocationCallOrder[0],
	);
});

it("handles short reads without growing the buffer or missing the EOF check", async () => {
	const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
	handle.read.mockImplementation(async (buffer, offset, length, position) =>
		readChunk(buffer, offset, Math.min(length, 32768), position),
	);
	expect(await loadNodeCookiePolicy("pinned-psl-v1")).toHaveProperty(
		"cookiePolicy",
		"pinned-psl-v1",
	);
	expect(new Set(handle.read.mock.calls.map(([buffer]) => buffer)).size).toBe(
		1,
	);
	expect(handle.read.mock.calls.at(-1)?.slice(1)).toEqual([335592, 1, 335592]);
	expect(handle.close).toHaveBeenCalledOnce();
});

it.each([-1n, 0n, 335591n, 335593n, 2n ** 60n])(
	"rejects asset size %s before open or buffer reads",
	async (size) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		boundary.lstat.mockResolvedValueOnce({ ...fileInfo(), size });
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(boundary.open).not.toHaveBeenCalled();
		expect(handle.read).not.toHaveBeenCalled();
	},
);

it.each(["directory", "fifo", "symlink"])(
	"rejects %s asset without opening it",
	async (kind) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		boundary.lstat.mockResolvedValueOnce({
			...fileInfo(),
			isFile: () => false,
			isSymbolicLink: () => kind === "symlink",
		});
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(boundary.open).not.toHaveBeenCalled();
	},
);

it.each(["before open", "during read"])(
	"rejects symlink ancestor escape %s",
	async (stage) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		if (stage === "during read")
			boundary.realpath.mockResolvedValueOnce(
				fileURLToPath(
					new URL(
						"../vendor/public-suffix/public_suffix_list.dat",
						import.meta.url,
					),
				),
			);
		boundary.realpath.mockResolvedValueOnce(
			"/outside-repository/public_suffix_list.dat",
		);
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
		if (stage === "before open") expect(boundary.open).not.toHaveBeenCalled();
		else expect(handle.close).toHaveBeenCalledOnce();
	},
);

it.each(["truncated", "oversized"])(
	"rejects %s bytes despite initially correct metadata",
	async (kind) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		boundary.read.mockResolvedValueOnce(
			kind === "truncated"
				? source.subarray(0, -1)
				: Buffer.concat([source, Buffer.of(0)]),
		);
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(handle.read).toHaveBeenCalled();
		for (const [buffer, offset, length] of handle.read.mock.calls) {
			expect(buffer.byteLength).toBe(335593);
			expect(offset + length).toBeLessThanOrEqual(335593);
		}
		expect(handle.close).toHaveBeenCalledOnce();
	},
);

it.each(["dev", "ino", "size", "mtimeNs", "ctimeNs", "isFile"] as const)(
	"rejects changed %s at open, after read and at the pathname",
	async (field) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		const changed = {
			...fileInfo(),
			[field]: field === "isFile" ? () => false : 99n,
		};
		for (const stage of ["open", "after", "path"]) {
			handle.stat.mockReset().mockImplementation(async () => fileInfo());
			boundary.lstat.mockReset().mockImplementation(async () => fileInfo());
			handle.read.mockClear();
			handle.close.mockClear();
			if (stage === "open") handle.stat.mockResolvedValueOnce(changed);
			else if (stage === "after")
				handle.stat
					.mockResolvedValueOnce(fileInfo())
					.mockResolvedValueOnce(changed);
			else
				boundary.lstat
					.mockResolvedValueOnce(fileInfo())
					.mockResolvedValueOnce(changed);
			await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject(
				{ code: "invalid-input" },
			);
			expect(handle.close).toHaveBeenCalledOnce();
			if (stage === "open") expect(handle.read).not.toHaveBeenCalled();
		}
	},
);

it.each([
	"realpath",
	"lstat",
	"open",
	"stat",
	"read",
	"after stat",
	"current lstat",
	"current realpath",
	"close",
])(
	"fails closed on %s errors and closes every acquired handle",
	async (stage) => {
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		const failure = new Error("synthetic asset failure");
		if (stage === "realpath") boundary.realpath.mockRejectedValueOnce(failure);
		if (stage === "lstat") boundary.lstat.mockRejectedValueOnce(failure);
		if (stage === "open") boundary.open.mockRejectedValueOnce(failure);
		if (stage === "stat") handle.stat.mockRejectedValueOnce(failure);
		if (stage === "read") handle.read.mockRejectedValueOnce(failure);
		if (stage === "after stat")
			handle.stat
				.mockResolvedValueOnce(fileInfo())
				.mockRejectedValueOnce(failure);
		if (stage === "current lstat")
			boundary.lstat
				.mockResolvedValueOnce(fileInfo())
				.mockRejectedValueOnce(failure);
		if (stage === "current realpath")
			boundary.realpath
				.mockResolvedValueOnce(
					fileURLToPath(
						new URL(
							"../vendor/public-suffix/public_suffix_list.dat",
							import.meta.url,
						),
					),
				)
				.mockRejectedValueOnce(failure);
		if (stage === "close") handle.close.mockRejectedValueOnce(failure);
		await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
			code: "invalid-input",
		});
		if (["realpath", "lstat", "open"].includes(stage))
			expect(handle.close).not.toHaveBeenCalled();
		else expect(handle.close).toHaveBeenCalledOnce();
	},
);

it("closes before rejecting corrupt bytes or unavailable hashing", async () => {
	const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
	vi.spyOn(crypto.subtle, "digest").mockRejectedValueOnce(
		new Error("synthetic hash failure"),
	);
	await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(handle.close).toHaveBeenCalledOnce();
	handle.close.mockClear();
	boundary.read.mockResolvedValueOnce(Buffer.alloc(335592));
	await expect(loadNodeCookiePolicy("pinned-psl-v1")).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(handle.close).toHaveBeenCalledOnce();
});

it.each([
	"regular",
	"oversized",
	"truncated",
	"symlink",
	"symlink-race",
	"replaced-during-read",
])(
	"uses bounded native filesystem operations on a synthetic %s public-asset copy",
	async (kind) => {
		const fs =
			await vi.importActual<typeof import("node:fs/promises")>(
				"node:fs/promises",
			);
		const { loadNodeCookiePolicy } = await import("./node-cookie-policy.js");
		const directory = await fs.mkdtemp(join(tmpdir(), "cookie-policy-copy-"));
		const copy = join(directory, "public_suffix_list.dat");
		const replacement = join(directory, "replacement.dat");
		let opened: FileHandle | undefined;
		try {
			await fs.copyFile(
				new URL(
					"../vendor/public-suffix/public_suffix_list.dat",
					import.meta.url,
				),
				copy,
			);
			if (kind === "oversized") await fs.appendFile(copy, "x");
			if (kind === "truncated") await fs.truncate(copy, 335591);
			if (["symlink", "symlink-race", "replaced-during-read"].includes(kind))
				await fs.copyFile(copy, replacement);
			if (kind === "symlink") {
				await fs.unlink(copy);
				await fs.symlink(replacement, copy);
			}
			boundary.lstat.mockImplementation(() => fs.lstat(copy, { bigint: true }));
			boundary.realpath.mockImplementation(async (asset: URL) => {
				const resolved = await fs.realpath(copy);
				return resolved === copy ? fileURLToPath(asset) : resolved;
			});
			boundary.open.mockImplementation(async (_asset: URL, flags: number) => {
				if (kind === "symlink-race") {
					await fs.unlink(copy);
					await fs.symlink(replacement, copy);
				}
				opened = await fs.open(copy, flags);
				const read = opened.read.bind(opened);
				const readSpy = vi.fn(
					async (
						buffer: Uint8Array,
						offset: number,
						length: number,
						position: number,
					) => read(buffer, offset, length, position),
				);
				vi.spyOn(opened, "close");
				if (kind === "replaced-during-read")
					readSpy.mockImplementationOnce(
						async (
							buffer: Uint8Array,
							offset: number,
							length: number,
							position: number,
						) => {
							const result = await read(buffer, offset, length, position);
							await fs.rename(replacement, copy);
							return result;
						},
					);
				return {
					stat: opened.stat.bind(opened),
					read: readSpy,
					close: opened.close.bind(opened),
				};
			});
			if (kind === "regular")
				expect(await loadNodeCookiePolicy("pinned-psl-v1")).toHaveProperty(
					"cookiePolicySource",
					source.toString("utf8"),
				);
			else
				await expect(
					loadNodeCookiePolicy("pinned-psl-v1"),
				).rejects.toMatchObject({ code: "invalid-input" });
			expect(boundary.unbounded).not.toHaveBeenCalled();
			if (opened) {
				expect(opened.close).toHaveBeenCalledOnce();
				expect(opened.fd).toBe(-1);
			} else if (kind !== "symlink-race")
				expect(boundary.open).not.toHaveBeenCalled();
		} finally {
			if (opened && opened.fd >= 0) await opened.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	},
);
