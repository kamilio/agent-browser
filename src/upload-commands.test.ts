import { afterEach, expect, it, vi } from "vitest";
import { DocumentFileSelections } from "./control-files.js";
import { DocumentTree } from "./document.js";
import { runEventActionAsync } from "./event-actions.js";
import { DocumentEvents, controlledEventListener } from "./events.js";
import { prepareFormSubmission } from "./forms.js";
import { encodeStateChunk } from "./state-transfer.js";
import {
	captureUploadTarget,
	createUploadTransport,
	executeUploadCommand,
} from "./upload-commands.js";
import {
	type UploadCommandResult,
	type UploadExecutor,
	uploadCommandSummary,
} from "./upload-protocol.js";
import { UploadTransfers } from "./upload-transfers.js";

const trees: DocumentTree[] = [];
const managers: UploadTransfers[] = [];

function fixture(ttlMs = 300_000) {
	const tree = new DocumentTree("https://example.com/upload");
	trees.push(tree);
	const form = tree.createElement("form", {
		method: "post",
		enctype: "multipart/form-data",
	});
	const input = tree.createElement("input", {
		type: "file",
		multiple: "",
		name: "attachment",
	});
	tree.append(tree.root, form);
	tree.append(form, input);
	const owner = new DocumentFileSelections(tree);
	const events = new DocumentEvents(tree);
	const transfers = new UploadTransfers({ ttlMs }, () => Date.now());
	managers.push(transfers);
	transfers.attach("testing", owner, (action, signal) =>
		runEventActionAsync(events, action, signal),
	);
	const execute = vi.fn((argv: readonly string[]) =>
		executeUploadCommand(transfers, "testing", argv),
	);
	const reference = tree.reference(input);
	const target = owner.capture(reference);
	const request = (bytes = 3) => ({
		target,
		files: [{ name: "private.bin", type: "application/octet-stream", bytes }],
	});
	return {
		tree,
		form,
		input,
		owner,
		events,
		transfers,
		execute,
		reference,
		target,
		request,
	};
}

afterEach(() => {
	for (const transfers of managers.splice(0)) transfers.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.useRealTimers();
});

it("runs capture/begin/write/commit through injected command dispatch with exact 32KiB chunks and multipart effects", async () => {
	const { transfers, execute, owner, reference, tree, form } = fixture();
	const target = await captureUploadTarget(execute, "testing", reference);
	const client = createUploadTransport(execute, "testing", target);
	const bytes = Uint8Array.from({ length: 65_537 }, (_, index) => index % 256);
	const id = await client.begin({
		target,
		files: [{ name: "private.bin", bytes: bytes.length }],
	});
	for (let offset = 0; offset < bytes.length; offset += 32_768)
		await client.write(
			id,
			0,
			offset,
			encodeStateChunk(bytes.subarray(offset, offset + 32_768)),
		);
	const result = await client.commit(id);
	expect(result).toMatchObject({
		id,
		documentId: target.documentId,
		bytes: bytes.length,
		files: 1,
		committed: true,
		stagingReleased: true,
	});
	expect(owner.files(reference)[0].data).toEqual(bytes);
	expect(transfers.metrics()).toMatchObject({ stagedBytes: 0, transfers: 0 });
	expect(execute.mock.calls.map(([argv]) => argv[0])).toEqual([
		"upload-target",
		"upload-begin",
		"upload-write",
		"upload-write",
		"upload-write",
		"upload-commit",
	]);
	const prepared = prepareFormSubmission(tree, tree.reference(form), {
		files: owner.filesForSubmission(),
		boundary: "command-adapter",
	});
	const prefix = new TextEncoder().encode(
		'--command-adapter\r\nContent-Disposition: form-data; name="attachment"; filename="private.bin"\r\nContent-Type: application/octet-stream\r\n\r\n',
	);
	expect(
		(prepared.request.body as Uint8Array).slice(
			prefix.length,
			prefix.length + bytes.length,
		),
	).toEqual(bytes);
	expect(
		JSON.stringify(
			execute.mock.calls.map(([argv]) => uploadCommandSummary(argv)),
		),
	).not.toMatch(/private\.bin|AAECAw|documentId/);
});

it("supports empty selections and empty files through the full adapter", async () => {
	const { execute, owner, reference } = fixture();
	for (const files of [[{ name: "empty", bytes: 0 }], []]) {
		const target = await captureUploadTarget(execute, "testing", reference);
		const client = createUploadTransport(execute, "testing", target);
		const id = await client.begin({ target, files });
		await client.commit(id);
		expect(owner.files(reference)).toHaveLength(files.length);
	}
	expect(execute.mock.calls.some(([argv]) => argv[0] === "upload-write")).toBe(
		false,
	);
});

it.each([
	[],
	["upload"],
	["upload-target"],
	["upload-target", "e1", "extra"],
	["upload-target", "/local/path"],
	["upload-begin", "{"],
	["upload-begin", " ".repeat(65_537)],
	["upload-write"],
	["upload-commit"],
	["upload-cancel", "bad", "bad"],
])("rejects invalid internal command schemas: %s", async (...argv) => {
	const { transfers } = fixture();
	await expect(
		executeUploadCommand(transfers, "testing", argv),
	).rejects.toBeInstanceOf(Error);
	expect(transfers.metrics().transfers).toBe(0);
});

it.each(["01", "+1", "1.0", "-1", "NaN", "9007199254740992", "1e0"])(
	"rejects noncanonical integer argv %s without touching another transfer",
	async (value) => {
		const { transfers, execute, request } = fixture();
		const info = transfers.begin("testing", request());
		await expect(
			execute(["upload-write", info.documentId, info.id, value, "0", "AA=="]),
		).rejects.toBeInstanceOf(Error);
		expect(transfers.metrics().transfers).toBe(1);
	},
);

it("never treats a path in begin metadata as permission to read it", async () => {
	const { execute, target, transfers } = fixture();
	for (const request of [
		{ target, files: [], path: "/private/file" },
		{ target, files: [{ name: "local", bytes: 1, path: "/private/file" }] },
		{ target, files: [{ name: "local", bytes: 1, data: "AA==" }] },
	])
		await expect(
			execute(["upload-begin", JSON.stringify(request)]),
		).rejects.toMatchObject({ code: "invalid-input" });
	expect(transfers.metrics().stagedBytes).toBe(0);
});

it.each(["session", "command", "schema", "extra", "reference", "document"])(
	"validates authenticated capture response: %s",
	async (kind) => {
		const { execute, reference } = fixture();
		const changed: UploadExecutor = async (argv) => {
			const result = await execute(argv);
			if (kind === "session") return { ...result, session: "other" };
			if (kind === "command") return { ...result, command: "upload-begin" };
			if (kind === "schema")
				return {
					...result,
					schemaVersion: 2,
				} as unknown as UploadCommandResult;
			if (kind === "extra") return { ...result, path: "/private" };
			const data = result.data as { target: Record<string, unknown> };
			return {
				...result,
				data: {
					target: {
						...data.target,
						[kind === "reference" ? "reference" : "documentId"]:
							kind === "reference" ? "e999" : "bad",
					},
				},
			};
		};
		await expect(
			captureUploadTarget(changed, "testing", reference),
		).rejects.toMatchObject({ code: "invalid-input" });
	},
);

it.each([
	"session",
	"command",
	"id",
	"documentId",
	"reference",
	"version",
	"files",
	"bytes",
	"receivedBytes",
	"fileIndex",
	"fileOffset",
	"expiresAt",
])("rejects mismatched begin acknowledgement %s", async (field) => {
	const { execute, target, request } = fixture();
	const changed: UploadExecutor = async (argv) => {
		const result = await execute(argv);
		if (field === "session" || field === "command")
			return { ...result, [field]: "other" };
		const data = result.data as Record<string, unknown>;
		const value =
			field === "id"
				? "bad"
				: field === "documentId"
					? crypto.randomUUID()
					: field === "reference"
						? "e999"
						: field === "expiresAt"
							? -1
							: Number(data[field]) + 1;
		return { ...result, data: { ...data, [field]: value } };
	};
	await expect(
		createUploadTransport(changed, "testing", target).begin(request()),
	).rejects.toMatchObject({ code: "invalid-input" });
});

it.each([
	"id",
	"documentId",
	"reference",
	"version",
	"files",
	"bytes",
	"receivedBytes",
	"fileIndex",
	"fileOffset",
	"expiresAt",
])("rejects mismatched write acknowledgement %s", async (field) => {
	const { execute, target, request } = fixture();
	const changed: UploadExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] !== "upload-write") return result;
		const data = result.data as Record<string, unknown>;
		const value =
			field === "id"
				? `upload-${crypto.randomUUID()}`
				: field === "documentId"
					? crypto.randomUUID()
					: field === "reference"
						? "e999"
						: Number(data[field]) + 1;
		return { ...result, data: { ...data, [field]: value } };
	};
	const client = createUploadTransport(changed, "testing", target);
	const id = await client.begin(request());
	await expect(client.write(id, 0, 0, "AA==")).rejects.toMatchObject({
		code: "invalid-input",
	});
	await client.cancel(id);
});

it.each([
	"id",
	"documentId",
	"reference",
	"version",
	"files",
	"bytes",
	"committed",
	"stagingReleased",
])("rejects mismatched commit acknowledgement %s", async (field) => {
	const { execute, target, request, transfers } = fixture();
	const changed: UploadExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] !== "upload-commit") return result;
		const data = result.data as Record<string, unknown>;
		return {
			...result,
			data: {
				...data,
				[field]:
					typeof data[field] === "number" ? Number(data[field]) + 1 : "wrong",
			},
		};
	};
	const client = createUploadTransport(changed, "testing", target);
	const id = await client.begin(request(0));
	await expect(client.commit(id)).rejects.toMatchObject({
		code: "invalid-input",
	});
	expect(transfers.metrics().transfers).toBe(0);
	await client.cancel(id);
});

it.each(["id", "documentId", "canceled", "stagingReleased"])(
	"does not confirm cleanup on a mismatched cancel acknowledgement %s",
	async (field) => {
		const { execute, target, request } = fixture();
		const changed: UploadExecutor = async (argv) => {
			const result = await execute(argv);
			return argv[0] === "upload-cancel"
				? { ...result, data: { ...(result.data as object), [field]: "wrong" } }
				: result;
		};
		const client = createUploadTransport(changed, "testing", target);
		const id = await client.begin(request());
		await expect(client.cancel(id)).rejects.toMatchObject({
			code: "invalid-input",
		});
	},
);

it("expires server staging even if begin's response is lost", async () => {
	vi.useFakeTimers();
	const { execute, target, request, transfers } = fixture(20);
	const lost: UploadExecutor = async (argv) => {
		await execute(argv);
		throw new Error("lost response");
	};
	await expect(
		createUploadTransport(lost, "testing", target).begin(request()),
	).rejects.toMatchObject({
		code: "network-error",
		message: "Upload command request failed",
	});
	expect(transfers.metrics().stagedBytes).toBe(3);
	await vi.advanceTimersByTimeAsync(20);
	expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
});

it("rejects stale local target substitution, incomplete commit, unknown IDs and overlapping client operations", async () => {
	const { execute, target, request } = fixture();
	const client = createUploadTransport(execute, "testing", target);
	await expect(
		client.begin({ ...request(), target: { ...target, version: 1 } }),
	).rejects.toMatchObject({ code: "stale-reference" });
	const id = await client.begin(request());
	await expect(client.begin(request())).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(client.commit(id)).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(
		client.write(`upload-${crypto.randomUUID()}`, 0, 0, "AA=="),
	).rejects.toMatchObject({ code: "not-found" });
	await expect(client.write(id, 1, 0, "AA==")).rejects.toMatchObject({
		code: "invalid-input",
	});
	await expect(
		client.cancel(`upload-${crypto.randomUUID()}`),
	).rejects.toMatchObject({ code: "not-found" });
	await client.cancel(id);
	await client.cancel(id);
});

it("cancels while a write response is delayed and rejects the stale acknowledgement", async () => {
	const { execute, target, request, transfers } = fixture();
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const delayed: UploadExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] === "upload-write") await gate;
		return result;
	};
	const client = createUploadTransport(delayed, "testing", target);
	const id = await client.begin(request());
	const write = client.write(id, 0, 0, "AA==");
	const rejected = expect(write).rejects.toMatchObject({ code: "aborted" });
	await expect(client.write(id, 0, 1, "AA==")).rejects.toMatchObject({
		code: "invalid-input",
	});
	await client.cancel(id);
	resume();
	await rejected;
	expect(transfers.metrics().stagedBytes).toBe(0);
});

it("cancels during an asynchronous native input event without pretending the committed selection rolled back", async () => {
	const {
		execute,
		target,
		request,
		events,
		input,
		owner,
		reference,
		transfers,
	} = fixture();
	events.addEventListener(
		input,
		"input",
		controlledEventListener(async () => new Promise<void>(() => {})),
	);
	const client = createUploadTransport(execute, "testing", target);
	const id = await client.begin(request(1));
	await client.write(id, 0, 0, "CQ==");
	const committing = client.commit(id);
	const rejected = expect(committing).rejects.toBeInstanceOf(Error);
	expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(9));
	await client.cancel(id);
	await rejected;
	expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(9));
	expect(transfers.metrics().transfers).toBe(0);
});

it("honors command abort before begin while allowing cancellation cleanup", async () => {
	const { transfers, request } = fixture();
	const info = transfers.begin("testing", request());
	const controller = new AbortController();
	controller.abort();
	await expect(
		executeUploadCommand(
			transfers,
			"testing",
			["upload-begin", JSON.stringify(request())],
			controller.signal,
		),
	).rejects.toMatchObject({ code: "aborted" });
	await executeUploadCommand(
		transfers,
		"testing",
		["upload-cancel", info.documentId, info.id],
		controller.signal,
	);
	expect(transfers.metrics().transfers).toBe(0);
});

it("does not let a delayed duplicate cancel discard a newer client transfer", async () => {
	const { execute, target, request, transfers } = fixture();
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	let cancellations = 0;
	const delayed: UploadExecutor = async (argv) => {
		const result = await execute(argv);
		if (argv[0] === "upload-cancel" && ++cancellations === 1) await gate;
		return result;
	};
	const client = createUploadTransport(delayed, "testing", target);
	const first = await client.begin(request(0));
	const earlierCancel = client.cancel(first);
	await client.cancel(first);
	const second = await client.begin(request(0));
	resume();
	await earlierCancel;
	await expect(client.commit(second)).resolves.toMatchObject({
		committed: true,
		id: second,
	});
	expect(transfers.metrics().transfers).toBe(0);
});
