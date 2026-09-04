import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
	DocumentFileSelections,
	type FileSelectionTarget,
} from "./control-files.js";
import { DocumentTree } from "./document.js";
import { runEventAction } from "./event-actions.js";
import { DocumentEvents } from "./events.js";
import { type FormUpload, prepareFormSubmission } from "./forms.js";
import {
	type UploadTransferRequest,
	readPrivateUploadFiles,
	uploadClientLimits,
	uploadPrivateFiles,
} from "./node-upload-client.js";

vi.mock("node:fs/promises", async (importOriginal) => ({
	...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const directories: string[] = [];
const trees: DocumentTree[] = [];
const target: FileSelectionTarget = {
	documentId: "synthetic-document",
	reference: "e1",
	version: 0,
};

async function fixture(data: Uint8Array | string = "private contents") {
	const directory = await fs.mkdtemp(
		join(tmpdir(), "agent-browser-upload-test-"),
	);
	directories.push(directory);
	const path = join(directory, "sample.bin");
	await fs.writeFile(path, data, { mode: 0o600 });
	return { directory, path };
}

function transport() {
	return {
		begin: vi.fn(async (_request: UploadTransferRequest) => "transfer-1"),
		write: vi.fn(
			async (
				_id: string,
				_file: number,
				_offset: number,
				_base64: string,
			) => {},
		),
		commit: vi.fn(async (_id: string) => ({ selected: true })),
		cancel: vi.fn(async (_id: string) => {}),
	};
}

afterEach(async () => {
	vi.restoreAllMocks();
	for (const tree of trees.splice(0)) tree.close();
	for (const directory of directories.splice(0))
		await fs.rm(directory, { recursive: true, force: true });
});

it("reads private binary bytes and transfers only basenames, metadata and bounded chunks", async () => {
	const bytes = Uint8Array.from({ length: 100_003 }, (_, index) => index % 256);
	const { path } = await fixture(bytes);
	const remote = transport();
	const result = await uploadPrivateFiles(
		target,
		[{ path, type: "application/octet-stream" }],
		remote,
	);
	expect(result).toEqual({
		result: { selected: true },
		files: 1,
		bytes: bytes.length,
	});
	expect(remote.begin).toHaveBeenCalledWith({
		target,
		files: [
			{
				name: "sample.bin",
				type: "application/octet-stream",
				bytes: bytes.length,
			},
		],
	});
	const chunks = remote.write.mock.calls.map(
		([id, file, offset, base64], index) => {
			expect([id, file, offset]).toEqual([
				"transfer-1",
				0,
				index * uploadClientLimits.transferChunkBytes,
			]);
			const chunk = Buffer.from(base64, "base64");
			expect(chunk.length).toBeLessThanOrEqual(
				uploadClientLimits.transferChunkBytes,
			);
			return chunk;
		},
	);
	expect(new Uint8Array(Buffer.concat(chunks))).toEqual(bytes);
	expect(JSON.stringify(remote.begin.mock.calls)).not.toContain(path);
	expect(remote.cancel).not.toHaveBeenCalled();
});

it("uses no-follow/nonblocking flags, bounded reads and closes the handle", async () => {
	const { path } = await fixture(new Uint8Array(150_000));
	const originalOpen = fs.open;
	const lengths: number[] = [];
	let closed = false;
	vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
		expect(flags).toBe(
			constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
		);
		const handle = await originalOpen(filename, flags, mode);
		const read = handle.read.bind(handle);
		const close = handle.close.bind(handle);
		handle.read = (async (
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number,
		) => {
			lengths.push(length);
			return read(buffer, offset, Math.min(length, 10_000), position);
		}) as typeof handle.read;
		handle.close = async () => {
			closed = true;
			await close();
		};
		return handle;
	});
	expect((await readPrivateUploadFiles([{ path }]))[0].data.length).toBe(
		150_000,
	);
	expect(Math.max(...lengths)).toBeLessThanOrEqual(
		uploadClientLimits.readChunkBytes,
	);
	expect(lengths.at(-1)).toBe(1);
	expect(closed).toBe(true);
});

it.each([
	"directory",
	"symlink",
	"hardlink",
	"public-file",
	"public-parent",
	"symlink-parent",
])("rejects unsafe private upload locations: %s", async (kind) => {
	const { path, directory } = await fixture();
	let requested = path;
	if (kind === "directory") requested = directory;
	if (kind === "symlink") {
		requested = join(directory, "link");
		await fs.symlink(path, requested);
	}
	if (kind === "hardlink") await fs.link(path, join(directory, "link"));
	if (kind === "public-file") await fs.chmod(path, 0o644);
	if (kind === "public-parent") await fs.chmod(directory, 0o777);
	if (kind === "symlink-parent") {
		const nested = join(directory, "nested");
		await fs.mkdir(nested, { mode: 0o700 });
		await fs.writeFile(join(nested, "file"), "private", { mode: 0o600 });
		await fs.symlink(nested, join(directory, "alias"));
		requested = join(directory, "alias", "file");
	}
	const remote = transport();
	await expect(
		uploadPrivateFiles(target, [{ path: requested }], remote),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(remote.begin).not.toHaveBeenCalled();
});

it("rejects relative, noncanonical, missing and overlong paths without leaking them", async () => {
	const { directory } = await fixture();
	for (const path of [
		"sample.bin",
		`${directory}/../sample.bin`,
		`${directory}//sample.bin`,
		`${directory}/${"a".repeat(4100)}`,
	])
		await expect(readPrivateUploadFiles([{ path }])).rejects.toMatchObject({
			code: "invalid-input",
		});
	const missing = join(directory, "private-secret-name");
	const error = await readPrivateUploadFiles([{ path: missing }]).catch(
		(error: unknown) => error,
	);
	expect(error).toMatchObject({ code: "not-found" });
	expect(String(error)).not.toContain(missing);
});

it("rejects oversized files before reading, and aggregate/count overflow before transport", async () => {
	const { path } = await fixture("12345");
	const originalOpen = fs.open;
	let reads = 0;
	let closes = 0;
	vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
		const handle = await originalOpen(filename, flags, mode);
		const read = handle.read.bind(handle);
		const close = handle.close.bind(handle);
		handle.read = (async (...args: Parameters<typeof read>) => {
			reads++;
			return read(...args);
		}) as typeof handle.read;
		handle.close = async () => {
			closes++;
			await close();
		};
		return handle;
	});
	await expect(
		readPrivateUploadFiles([{ path }], { limits: { maxFileBytes: 4 } }),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(reads).toBe(0);
	expect(closes).toBe(1);
	const remote = transport();
	await expect(
		uploadPrivateFiles(target, [{ path }, { path }], remote, {
			limits: { maxTotalBytes: 9 },
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
	await expect(
		uploadPrivateFiles(target, [{ path }, { path }], remote, {
			limits: { maxFiles: 1 },
		}),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(remote.begin).not.toHaveBeenCalled();
});

it.each(["grow", "truncate", "same-size", "replace", "chmod"])(
	"rejects mutation while reading and closes the descriptor: %s",
	async (kind) => {
		const { path, directory } = await fixture("old contents");
		const originalOpen = fs.open;
		let closed = false;
		vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
			const handle = await originalOpen(filename, flags, mode);
			const read = handle.read.bind(handle);
			const close = handle.close.bind(handle);
			let changed = false;
			handle.read = (async (
				buffer: Uint8Array,
				offset: number,
				length: number,
				position: number,
			) => {
				const result = await read(buffer, offset, length, position);
				if (!changed) {
					changed = true;
					if (kind === "grow") await fs.appendFile(path, " extra");
					if (kind === "truncate") await fs.truncate(path, 0);
					if (kind === "same-size") {
						await fs.writeFile(path, "new contents");
						await fs.utimes(path, 0, 0);
					}
					if (kind === "replace") {
						await fs.rename(path, join(directory, "old"));
						await fs.writeFile(path, "replacement", { mode: 0o600 });
					}
					if (kind === "chmod") await fs.chmod(path, 0o644);
				}
				return result;
			}) as typeof handle.read;
			handle.close = async () => {
				closed = true;
				await close();
			};
			return handle;
		});
		const remote = transport();
		await expect(
			uploadPrivateFiles(target, [{ path }], remote),
		).rejects.toMatchObject({
			code: kind === "chmod" ? "policy-denied" : "invalid-input",
		});
		expect(remote.begin).not.toHaveBeenCalled();
		expect(closed).toBe(true);
	},
);

it("transfers empty files and an empty clearing selection without chunks", async () => {
	const { path } = await fixture("");
	const remote = transport();
	expect(await uploadPrivateFiles(target, [{ path }], remote)).toMatchObject({
		files: 1,
		bytes: 0,
	});
	expect(remote.write).not.toHaveBeenCalled();
	expect(await uploadPrivateFiles(target, [], remote)).toMatchObject({
		files: 0,
		bytes: 0,
	});
	expect(remote.begin.mock.calls[1][0].files).toEqual([]);
	expect(remote.commit).toHaveBeenCalledTimes(2);
});

it("never begins transfer when a later local file is rejected", async () => {
	const { path, directory } = await fixture();
	const remote = transport();
	await expect(
		uploadPrivateFiles(
			target,
			[{ path }, { path: join(directory, "missing") }],
			remote,
		),
	).rejects.toMatchObject({ code: "not-found" });
	expect(remote.begin).not.toHaveBeenCalled();
});

it.each(["before-read", "during-read", "after-begin", "after-write"])(
	"cancels without committing: %s",
	async (phase) => {
		const { path } = await fixture("private");
		const controller = new AbortController();
		const remote = transport();
		if (phase === "before-read") controller.abort();
		if (phase === "during-read") {
			const originalOpen = fs.open;
			vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
				const handle = await originalOpen(filename, flags, mode);
				controller.abort();
				return handle;
			});
		}
		if (phase === "after-begin")
			remote.begin.mockImplementation(async () => {
				controller.abort();
				return "transfer-1";
			});
		if (phase === "after-write")
			remote.write.mockImplementation(async () => {
				controller.abort();
			});
		await expect(
			uploadPrivateFiles(target, [{ path }], remote, {
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ code: "aborted" });
		expect(remote.commit).not.toHaveBeenCalled();
		expect(remote.cancel).toHaveBeenCalledTimes(
			phase.startsWith("after") ? 1 : 0,
		);
	},
);

it.each(["write", "commit"] as const)(
	"cancels after transport %s failure and reports failed cleanup truthfully",
	async (phase) => {
		const { path } = await fixture();
		const remote = transport();
		remote[phase].mockRejectedValue(new Error("sensitive transport details"));
		await expect(
			uploadPrivateFiles(target, [{ path }], remote),
		).rejects.toMatchObject({
			code: "network-error",
			message: "File upload operation failed",
			remoteCleanupConfirmed: true,
		});
		remote.cancel.mockRejectedValue(new Error("cleanup failed"));
		await expect(
			uploadPrivateFiles(target, [{ path }], remote),
		).rejects.toMatchObject({ remoteCleanupConfirmed: false });
	},
);

it("reports unconfirmed cleanup for failed begin or malformed identity", async () => {
	const remote = transport();
	remote.begin.mockRejectedValueOnce(new Error("disconnected"));
	await expect(uploadPrivateFiles(target, [], remote)).rejects.toMatchObject({
		remoteCleanupConfirmed: false,
	});
	remote.begin.mockResolvedValueOnce("");
	await expect(uploadPrivateFiles(target, [], remote)).rejects.toMatchObject({
		code: "invalid-input",
		remoteCleanupConfirmed: false,
	});
	expect(remote.cancel).not.toHaveBeenCalled();
});

it("does not report success or leak raw errors when descriptor close fails", async () => {
	const { path } = await fixture();
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
		const handle = await originalOpen(filename, flags, mode);
		const close = handle.close.bind(handle);
		handle.close = async () => {
			await close();
			throw new Error("private descriptor details");
		};
		return handle;
	});
	await expect(readPrivateUploadFiles([{ path }])).rejects.toMatchObject({
		code: "network-error",
		message: "File upload operation failed",
	});
});

it("rejects a replaced file between path inspection and descriptor open", async () => {
	const { path, directory } = await fixture();
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
		await fs.rename(path, join(directory, "original"));
		await fs.writeFile(path, "replacement", { mode: 0o600 });
		return originalOpen(filename, flags, mode);
	});
	await expect(readPrivateUploadFiles([{ path }])).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it("rechecks the protected directory chain after reading", async () => {
	const { path, directory } = await fixture();
	const originalOpen = fs.open;
	vi.spyOn(fs, "open").mockImplementation(async (filename, flags, mode) => {
		const handle = await originalOpen(filename, flags, mode);
		await fs.chmod(directory, 0o777);
		return handle;
	});
	await expect(readPrivateUploadFiles([{ path }])).rejects.toMatchObject({
		code: "policy-denied",
	});
});

it("connects the private client to real document selection and multipart preparation through an injected transport, not command dispatch", async () => {
	const bytes = Uint8Array.from([0, 255, 65, 13, 10]);
	const { path } = await fixture(bytes);
	const tree = new DocumentTree("https://example.com/upload");
	trees.push(tree);
	const form = tree.createElement("form", {
		method: "post",
		enctype: "multipart/form-data",
	});
	const input = tree.createElement("input", {
		type: "file",
		name: "attachment",
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	const owner = new DocumentFileSelections(tree);
	const events = new DocumentEvents(tree);
	const calls: string[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(input, type, () => calls.push(type));
	let request: UploadTransferRequest;
	let uploads: FormUpload[];
	const remote = {
		begin: async (value: UploadTransferRequest) => {
			request = value;
			uploads = value.files.map((file) => ({
				name: file.name,
				type: file.type,
				data: new Uint8Array(file.bytes),
			}));
			return "injected-transfer";
		},
		write: async (
			_id: string,
			index: number,
			offset: number,
			base64: string,
		) => {
			uploads[index].data.set(Buffer.from(base64, "base64"), offset);
		},
		commit: async () =>
			runEventAction(events, owner.replaceAction(request.target, uploads)),
		cancel: vi.fn(async () => {}),
	};
	await uploadPrivateFiles(
		owner.capture(tree.reference(input)),
		[{ path, type: "application/octet-stream" }],
		remote,
	);
	expect(owner.files(tree.reference(input))[0].data).toEqual(bytes);
	expect(calls).toEqual(["input", "change"]);
	const submission = prepareFormSubmission(tree, tree.reference(form), {
		files: owner.filesForSubmission(),
		boundary: "private-upload",
	});
	const body = submission.request.body as Uint8Array;
	const header = new TextEncoder().encode(
		'--private-upload\r\nContent-Disposition: form-data; name="attachment"; filename="sample.bin"\r\nContent-Type: application/octet-stream\r\n\r\n',
	);
	expect(body.slice(header.length, header.length + bytes.length)).toEqual(
		bytes,
	);
	const stale = owner.capture(tree.reference(input));
	owner.resetForm(tree.reference(form));
	await expect(
		uploadPrivateFiles(stale, [{ path }], remote),
	).rejects.toMatchObject({
		code: "stale-reference",
		remoteCleanupConfirmed: true,
	});
	expect(owner.files(tree.reference(input))).toHaveLength(0);
	expect(remote.cancel).toHaveBeenCalledOnce();
});
