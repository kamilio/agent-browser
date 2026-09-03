import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { exportBrowserState } from "./browser-state.js";
import { CookieJar } from "./cookies.js";
import {
	loadBrowserStateFile,
	readStateFile,
	saveBrowserStateFile,
	stateFileLimits,
	writeStateFile,
} from "./node-state-file.js";
import { BrowserStorage } from "./storage.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const empty = JSON.stringify({ schemaVersion: 1, cookies: [], origins: [] });
const url = "https://example.com/";

async function fixture() {
	const directory = await fs.mkdtemp(
		join(tmpdir(), "agent-browser-state-test-"),
	);
	directories.push(directory);
	return { directory, filename: join(directory, "state.json") };
}

function profile() {
	const cookies = new CookieJar({}, () => Date.UTC(2026, 8, 3));
	const storage = new BrowserStorage();
	storage.openTab("first");
	cookies.setCookie(url, "session=synthetic; Secure; HttpOnly; Path=/", {
		siteUrl: url,
	});
	storage.localStorage("first", url).setItem("name", "😀\ud800");
	storage.sessionStorage("first", url).setItem("draft", "keep");
	return { cookies, storage };
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

it("round-trips both owners through a private file without persisting session storage or returning credentials", async () => {
	const { directory, filename } = await fixture();
	const owner = profile();
	const saved = await saveBrowserStateFile(owner, filename);
	expect(saved).toEqual({
		filename,
		bytes: Buffer.byteLength(JSON.stringify(exportBrowserState(owner))),
		cleanupConfirmed: true,
	});
	const info = await fs.lstat(filename);
	expect(info.mode & 0o777).toBe(0o600);
	expect(info.nlink).toBe(1);
	expect(info.uid).toBe(process.getuid?.());
	expect(await fs.readdir(directory)).toEqual(["state.json"]);
	const target = profile();
	target.cookies.clear();
	target.storage.localStorage("first", url).clear();
	target.storage.sessionStorage("first", url).setItem("draft", "other");
	const loaded = await loadBrowserStateFile(target, filename);
	expect(loaded).toEqual({ filename, bytes: saved.bytes, loaded: true });
	expect(exportBrowserState(target)).toEqual(exportBrowserState(owner));
	expect(target.storage.sessionStorage("first", url).getItem("draft")).toBe(
		"other",
	);
	expect(JSON.stringify([saved, loaded])).not.toContain("synthetic");
});

it("refuses implicit clobbering and atomically replaces a private file only with explicit overwrite", async () => {
	const { directory, filename } = await fixture();
	await writeStateFile(filename, empty);
	const old = await fs.lstat(filename);
	const replacement = JSON.stringify(exportBrowserState(profile()));
	await expect(writeStateFile(filename, replacement)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(await fs.readFile(filename, "utf8")).toBe(empty);
	await writeStateFile(filename, replacement, { overwrite: true });
	expect(await fs.readFile(filename, "utf8")).toBe(replacement);
	expect((await fs.lstat(filename)).ino).not.toBe(old.ino);
	expect(await fs.readdir(directory)).toEqual(["state.json"]);
});

it("supports ordinary non-writable-by-others parent directories without requiring them to be secret", async () => {
	const { directory, filename } = await fixture();
	await fs.chmod(directory, 0o755);
	await writeStateFile(filename, empty);
	expect((await readStateFile(filename)).json).toBe(empty);
});

it.each([0o644, 0o640, 0o606])(
	"rejects exposed permissions %i for reads and explicit replacement",
	async (mode) => {
		const { filename } = await fixture();
		await fs.writeFile(filename, empty, { mode });
		await fs.chmod(filename, mode);
		await expect(readStateFile(filename)).rejects.toMatchObject({
			code: "policy-denied",
		});
		await expect(
			writeStateFile(filename, empty, { overwrite: true }),
		).rejects.toMatchObject({ code: "policy-denied" });
	},
);

it("rejects hard links, symlink files and symlinked directory components without touching their targets", async () => {
	const { directory, filename } = await fixture();
	const target = join(directory, "target.json");
	await fs.writeFile(target, empty, { mode: 0o600 });
	await fs.link(target, filename);
	await expect(readStateFile(filename)).rejects.toMatchObject({
		code: "policy-denied",
	});
	await expect(
		writeStateFile(filename, empty, { overwrite: true }),
	).rejects.toMatchObject({ code: "policy-denied" });
	await fs.unlink(filename);
	await fs.symlink(target, filename);
	await expect(readStateFile(filename)).rejects.toMatchObject({
		code: "policy-denied",
	});
	await expect(
		writeStateFile(filename, empty, { overwrite: true }),
	).rejects.toMatchObject({ code: "policy-denied" });
	const child = join(directory, "child");
	const alias = join(directory, "alias");
	await fs.mkdir(child, { mode: 0o700 });
	await fs.symlink(child, alias);
	await expect(
		writeStateFile(join(alias, "state.json"), empty),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(await fs.readFile(target, "utf8")).toBe(empty);
	expect(await fs.readdir(child)).toEqual([]);
});

it.each(["parent", "ancestor"])(
	"rejects a group/world-writable %s",
	async (kind) => {
		const { directory } = await fixture();
		const child = join(directory, "child");
		await fs.mkdir(child, { mode: 0o700 });
		await fs.chmod(kind === "parent" ? child : directory, 0o777);
		await expect(
			writeStateFile(join(child, "state.json"), empty),
		).rejects.toMatchObject({ code: "policy-denied" });
	},
);

it.each([
	"relative.json",
	"/tmp/../tmp/state.json",
	"/tmp/state\n.json",
	"/tmp/state\u202e.json",
	"/",
	"",
])(
	"rejects invalid path case %# without filesystem mutation",
	async (filename) => {
		await expect(writeStateFile(filename, empty)).rejects.toMatchObject({
			code: "invalid-input",
		});
	},
);

it("rejects absent parents and non-regular files", async () => {
	const { directory, filename } = await fixture();
	await expect(readStateFile(filename)).rejects.toMatchObject({
		code: "not-found",
	});
	await expect(
		writeStateFile(join(directory, "missing", "state.json"), empty),
	).rejects.toMatchObject({ code: "not-found" });
	await fs.mkdir(filename, { mode: 0o700 });
	await expect(readStateFile(filename)).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it.each([0, -1, 1.5, Number.NaN, stateFileLimits.maxBytes + 1])(
	"rejects invalid byte limit %s",
	async (maxBytes) => {
		const { filename } = await fixture();
		await expect(
			writeStateFile(filename, empty, { maxBytes }),
		).rejects.toMatchObject({ code: "invalid-input" });
	},
);

it("uses UTF-8 byte limits, accepts an exact boundary and refuses oversized reads before reading payloads", async () => {
	const { directory, filename } = await fixture();
	const json = JSON.stringify({ text: "😀" });
	await expect(
		writeStateFile(filename, json, { maxBytes: json.length }),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(await fs.readdir(directory)).toEqual([]);
	const maxBytes = Buffer.byteLength(json);
	await writeStateFile(filename, json, { maxBytes });
	expect((await readStateFile(filename, { maxBytes })).json).toBe(json);
	await expect(
		readStateFile(filename, { maxBytes: maxBytes - 1 }),
	).rejects.toMatchObject({ code: "resource-limit" });
});

it.each(["", "{", '{"synthetic-secret":', '"\ud800"'])(
	"rejects malformed or lossy JSON text case %# before creating a file",
	async (json) => {
		const { directory, filename } = await fixture();
		await expect(writeStateFile(filename, json)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(await fs.readdir(directory)).toEqual([]);
	},
);

it.each([Buffer.from([0xff]), Buffer.from("{"), Buffer.alloc(0)])(
	"rejects malformed stored text case %# without mutating either owner",
	async (bytes) => {
		const { filename } = await fixture();
		await fs.writeFile(filename, bytes, { mode: 0o600 });
		const owner = profile();
		const before = exportBrowserState(owner);
		await expect(loadBrowserStateFile(owner, filename)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(exportBrowserState(owner)).toEqual(before);
	},
);

it("rejects a late semantic error from valid JSON without partially restoring either owner", async () => {
	const { filename } = await fixture();
	const owner = profile();
	const before = exportBrowserState(owner);
	await writeStateFile(
		filename,
		JSON.stringify({
			schemaVersion: 1,
			cookies: [],
			origins: [{ origin: url, localStorage: [{ name: "secret", value: 42 }] }],
		}),
	);
	await expect(loadBrowserStateFile(owner, filename)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(exportBrowserState(owner)).toEqual(before);
});

it("completes short reads and writes and requests nonblocking, no-follow reads", async () => {
	const { filename } = await fixture();
	const original = fs.open;
	const opened = vi
		.spyOn(fs, "open")
		.mockImplementation(async (path, flags, mode) => {
			const handle = await original(path, flags, mode);
			const read = handle.read.bind(handle);
			const write = handle.write.bind(handle);
			handle.read = ((
				buffer: Buffer,
				offset: number,
				length: number,
				position: number,
			) =>
				read(
					buffer,
					offset,
					Math.min(length, 3),
					position,
				)) as typeof handle.read;
			handle.write = ((
				buffer: Buffer,
				offset: number,
				length: number,
				position: number,
			) =>
				write(
					buffer,
					offset,
					Math.min(length, 3),
					position,
				)) as typeof handle.write;
			return handle;
		});
	await writeStateFile(filename, empty);
	expect((await readStateFile(filename)).json).toBe(empty);
	expect(opened).toHaveBeenCalledWith(
		filename,
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
});

it.each(["write", "sync", "rename"])(
	"preserves the previous file and cleans partial output on %s failure",
	async (stage) => {
		const { directory, filename } = await fixture();
		await writeStateFile(filename, empty);
		const original = fs.open;
		vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
			const handle = await original(path, flags, mode);
			if (stage === "write")
				handle.write = ((buffer: Buffer) =>
					Promise.resolve({ bytesWritten: 0, buffer })) as typeof handle.write;
			if (stage === "sync")
				vi.spyOn(handle, "sync").mockRejectedValue(
					new Error("synthetic-secret"),
				);
			return handle;
		});
		if (stage === "rename")
			vi.spyOn(fs, "rename").mockRejectedValue(new Error("synthetic-secret"));
		await expect(
			writeStateFile(filename, "{}", { overwrite: true }),
		).rejects.toThrow("State file");
		expect(await fs.readFile(filename, "utf8")).toBe(empty);
		expect(await fs.readdir(directory)).toEqual(["state.json"]);
	},
);

it("does not clobber a destination created during an exclusive save", async () => {
	const { directory, filename } = await fixture();
	const original = fs.link;
	vi.spyOn(fs, "link").mockImplementation(async (source, destination) => {
		await fs.writeFile(filename, '"other-writer"', { mode: 0o600 });
		return original(source, destination);
	});
	await expect(writeStateFile(filename, empty)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(await fs.readFile(filename, "utf8")).toBe('"other-writer"');
	expect(await fs.readdir(directory)).toEqual(["state.json"]);
});

it("reports unconfirmed temporary cleanup without losing the published file", async () => {
	const { filename } = await fixture();
	vi.spyOn(fs, "unlink").mockRejectedValue(new Error("synthetic-secret"));
	expect((await writeStateFile(filename, empty)).cleanupConfirmed).toBe(false);
	expect(await fs.readFile(filename, "utf8")).toBe(empty);
});

it("sanitizes filesystem and parse errors without leaking paths or credential text", async () => {
	const { filename } = await fixture();
	vi.spyOn(fs, "open").mockRejectedValue(new Error("synthetic-secret"));
	await expect(writeStateFile(filename, empty)).rejects.toThrow(
		"State file write failed",
	);
	await expect(
		writeStateFile(filename, '{"synthetic-secret":'),
	).rejects.toThrow("Invalid state file JSON");
});

it("round-trips multiple I/O chunks without truncating non-ASCII text", async () => {
	const { filename } = await fixture();
	const json = JSON.stringify({
		value: "😀".repeat(stateFileLimits.chunkBytes),
	});
	await writeStateFile(filename, json);
	expect(await readStateFile(filename)).toEqual({
		json,
		bytes: Buffer.byteLength(json),
	});
});

it.each(["truncate", "grow", "replace", "in-place"])(
	"rejects a file that changes during read: %s",
	async (change) => {
		const { filename } = await fixture();
		await writeStateFile(filename, empty);
		const original = fs.open;
		vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
			const handle = await original(path, flags, mode);
			const read = handle.read.bind(handle);
			let changed = false;
			handle.read = (async (
				buffer: Buffer,
				offset: number,
				length: number,
				position: number,
			) => {
				if (!changed) {
					changed = true;
					if (change === "truncate") await fs.truncate(filename, 1);
					if (change === "grow") await fs.appendFile(filename, " ");
					if (change === "replace") {
						await fs.rename(filename, `${filename}.old`);
						await fs.writeFile(filename, empty, { mode: 0o600 });
					}
					if (change === "in-place") {
						await fs.writeFile(filename, empty.replace(":1", ":2"));
						await fs.utimes(filename, 1, 1);
					}
				}
				return read(buffer, offset, length, position);
			}) as typeof handle.read;
			return handle;
		});
		const owner = profile();
		const before = exportBrowserState(owner);
		await expect(loadBrowserStateFile(owner, filename)).rejects.toMatchObject({
			code: "invalid-input",
		});
		expect(exportBrowserState(owner)).toEqual(before);
	},
);

it("rechecks private permissions after reading", async () => {
	const { filename } = await fixture();
	await writeStateFile(filename, empty);
	const original = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
		const handle = await original(path, flags, mode);
		const read = handle.read.bind(handle);
		handle.read = (async (
			buffer: Buffer,
			offset: number,
			length: number,
			position: number,
		) => {
			await fs.chmod(filename, 0o644);
			return read(buffer, offset, length, position);
		}) as typeof handle.read;
		return handle;
	});
	await expect(readStateFile(filename)).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it("does not overwrite a replacement destination installed before the final identity check", async () => {
	const { directory, filename } = await fixture();
	await writeStateFile(filename, empty);
	const original = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
		const handle = await original(path, flags, mode);
		const sync = handle.sync.bind(handle);
		handle.sync = async () => {
			await sync();
			await fs.rename(filename, `${filename}.old`);
			await fs.writeFile(filename, '"replacement"', { mode: 0o600 });
		};
		return handle;
	});
	await expect(
		writeStateFile(filename, "{}", { overwrite: true }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(await fs.readFile(filename, "utf8")).toBe('"replacement"');
	expect((await fs.readdir(directory)).sort()).toEqual([
		"state.json",
		"state.json.old",
	]);
});

it("does not publish or unlink a substituted temporary file", async () => {
	const { directory, filename } = await fixture();
	const original = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
		const handle = await original(path, flags, mode);
		const sync = handle.sync.bind(handle);
		handle.sync = async () => {
			await sync();
			await fs.rename(path, `${path}.owned`);
			await fs.writeFile(path, '"replacement"', { mode: 0o600 });
		};
		return handle;
	});
	await expect(writeStateFile(filename, empty)).rejects.toMatchObject({
		code: "policy-denied",
	});
	const files = await fs.readdir(directory);
	expect(files).toHaveLength(2);
	expect(files).not.toContain("state.json");
	const part = files.find((name) => name.endsWith(".part"));
	expect(part).toBeDefined();
	expect(await fs.readFile(join(directory, part as string), "utf8")).toBe(
		'"replacement"',
	);
});

it("does not publish after the destination directory identity changes", async () => {
	const { directory, filename } = await fixture();
	const moved = `${directory}.moved`;
	directories.push(moved);
	const original = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (path, flags, mode) => {
		const handle = await original(path, flags, mode);
		const sync = handle.sync.bind(handle);
		handle.sync = async () => {
			await sync();
			await fs.rename(directory, moved);
			await fs.mkdir(directory, { mode: 0o700 });
		};
		return handle;
	});
	await expect(writeStateFile(filename, empty)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(await fs.readdir(directory)).toEqual([]);
});
