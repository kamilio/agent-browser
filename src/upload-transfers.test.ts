import { afterEach, expect, it, vi } from "vitest";
import { DocumentFileSelections } from "./control-files.js";
import { DocumentTree } from "./document.js";
import { runEventActionAsync } from "./event-actions.js";
import { DocumentEvents, controlledEventListener } from "./events.js";
import { prepareFormSubmission } from "./forms.js";
import { encodeStateChunk } from "./state-transfer.js";
import {
	type UploadActionRunner,
	UploadTransfers,
} from "./upload-transfers.js";

const managers: UploadTransfers[] = [];
const trees: DocumentTree[] = [];

function manager(
	limits: ConstructorParameters<typeof UploadTransfers>[0] = {},
) {
	const transfers = new UploadTransfers(limits, () => Date.now());
	managers.push(transfers);
	return transfers;
}

function fixture(
	transfers = manager(),
	session = "first",
	runner?: UploadActionRunner,
) {
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
	const owner = new DocumentFileSelections(tree, {
		maxFiles: 4,
		maxFileBytes: 16,
		maxTotalBytes: 32,
	});
	const events = new DocumentEvents(tree);
	transfers.attach(
		session,
		owner,
		runner ?? ((action, signal) => runEventActionAsync(events, action, signal)),
	);
	const reference = tree.reference(input);
	const request = (sizes = [3]) => ({
		target: owner.capture(reference),
		files: sizes.map((bytes, index) => ({
			name: `private-${index}.bin`,
			type: "application/octet-stream",
			bytes,
		})),
	});
	const begin = (sizes = [3]) => transfers.begin(session, request(sizes));
	return {
		transfers,
		tree,
		form,
		input,
		owner,
		events,
		session,
		reference,
		request,
		begin,
	};
}

afterEach(() => {
	for (const transfers of managers.splice(0)) transfers.close();
	for (const tree of trees.splice(0)) tree.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it("stages copied metadata, commits atomically, releases staging before input/change and prepares real multipart bytes", async () => {
	const { transfers, owner, events, form, tree, reference, request } =
		fixture();
	const metadata = request();
	const info = transfers.begin("first", metadata);
	metadata.files[0].name = "mutated";
	metadata.files[0].bytes = 999;
	const sibling = transfers.begin("first", request());
	expect(owner.files(reference)).toHaveLength(0);
	const bytes = Uint8Array.of(65, 0, 255);
	const progress = transfers.write(
		"first",
		info.documentId,
		info.id,
		0,
		0,
		encodeStateChunk(bytes),
	);
	bytes.fill(7);
	expect(progress).toMatchObject({
		bytes: 3,
		receivedBytes: 3,
		fileIndex: 1,
		fileOffset: 0,
	});
	const calls: string[] = [];
	for (const type of ["input", "change"])
		events.addEventListener(form, type, () => {
			calls.push(type);
			expect(transfers.metrics().stagedBytes).toBe(0);
			expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(65, 0, 255));
		});
	const committed = await transfers.commit("first", info.documentId, info.id);
	expect(calls).toEqual(["input", "change"]);
	expect(committed).toMatchObject({
		committed: true,
		stagingReleased: true,
		bytes: 3,
		version: info.version + 1,
	});
	expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
	expect(() =>
		transfers.write("first", sibling.documentId, sibling.id, 0, 0, "AA=="),
	).toThrow(/not found/);
	expect(JSON.stringify([info, progress, committed])).not.toMatch(
		/private-|application\/octet|data|base64/,
	);
	const prepared = prepareFormSubmission(tree, tree.reference(form), {
		files: owner.filesForSubmission(),
		boundary: "staging-test",
	});
	const prefix = new TextEncoder().encode(
		'--staging-test\r\nContent-Disposition: form-data; name="attachment"; filename="private-0.bin"\r\nContent-Type: application/octet-stream\r\n\r\n',
	);
	const suffix = new TextEncoder().encode("\r\n--staging-test--\r\n");
	expect(prepared.request.body).toEqual(
		new Uint8Array([...prefix, 65, 0, 255, ...suffix]),
	);
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toMatchObject({ code: "not-found" });
	expect(transfers.cancel("first", info.documentId, info.id)).toMatchObject({
		canceled: true,
		stagingReleased: true,
	});
});

it("accepts contiguous partial chunks and skips empty files without requiring an empty base64 write", async () => {
	const { transfers, begin, owner, reference } = fixture();
	const info = begin([0, 3, 0, 2]);
	expect(info).toMatchObject({ fileIndex: 1, fileOffset: 0 });
	expect(
		transfers.write("first", info.documentId, info.id, 1, 0, "AQ=="),
	).toMatchObject({ fileIndex: 1, fileOffset: 1, receivedBytes: 1 });
	expect(
		transfers.write("first", info.documentId, info.id, 1, 1, "AgM="),
	).toMatchObject({ fileIndex: 3, fileOffset: 0, receivedBytes: 3 });
	transfers.write("first", info.documentId, info.id, 3, 0, "BAU=");
	await transfers.commit("first", info.documentId, info.id);
	expect(owner.files(reference).map((file) => [...file.data])).toEqual([
		[],
		[1, 2, 3],
		[],
		[4, 5],
	]);
	for (const sizes of [[0, 0], []]) {
		const empty = begin(sizes);
		await transfers.commit("first", empty.documentId, empty.id);
		expect(owner.files(reference)).toHaveLength(sizes.length);
	}
});

it.each([
	"",
	"A===",
	"AB==",
	"AA=",
	"AA==\n",
	"____",
	"🌈",
	"====",
	btoa("x".repeat(32_769)),
	null,
	1,
])(
	"rejects noncanonical or oversized chunks and releases that transfer: %s",
	(base64) => {
		const { transfers, begin, owner, reference } = fixture();
		const info = begin();
		expect(() =>
			transfers.write("first", info.documentId, info.id, 0, 0, base64),
		).toThrow();
		expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
		expect(owner.files(reference)).toHaveLength(0);
	},
);

it.each([
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
	[0.5, 0],
	[0, Number.NaN],
	[0, Number.MAX_SAFE_INTEGER + 1],
])("rejects invalid indices or offsets %s %s", (file, offset) => {
	const { transfers, begin } = fixture();
	const info = begin();
	expect(() =>
		transfers.write("first", info.documentId, info.id, file, offset, "AA=="),
	).toThrow();
	expect(transfers.metrics().transfers).toBe(0);
});

it("rejects replay, overlap, chunk beyond the advertised size and extra chunks after completion", () => {
	const { transfers, begin } = fixture();
	for (const kind of ["replay", "overlap", "oversize", "extra"]) {
		const info = begin([2]);
		if (kind !== "oversize")
			transfers.write("first", info.documentId, info.id, 0, 0, "AQI=");
		expect(() =>
			transfers.write(
				"first",
				info.documentId,
				info.id,
				0,
				kind === "overlap" ? 1 : kind === "extra" ? 2 : 0,
				kind === "oversize" ? "AQID" : "AA==",
			),
		).toThrow();
		expect(transfers.metrics().stagedBytes).toBe(0);
	}
});

it("rejects incomplete commit without changing an existing selection", async () => {
	const { transfers, owner, reference, begin } = fixture();
	owner.replace(owner.capture(reference), [
		{ name: "old", data: Uint8Array.of(9) },
	]);
	const info = begin();
	transfers.write("first", info.documentId, info.id, 0, 0, "AA==");
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect([...owner.files(reference)[0].data]).toEqual([9]);
	expect(transfers.metrics().stagedBytes).toBe(0);
});

it("isolates concurrent sessions and rejects cross-document, stolen and unknown live transfer ownership", async () => {
	const transfers = manager();
	const first = fixture(transfers, "first");
	const second = fixture(transfers, "second");
	const info = first.begin();
	const other = second.begin([1]);
	for (const [session, documentId] of [
		["second", info.documentId],
		["first", other.documentId],
	]) {
		expect(() =>
			transfers.write(session, documentId, info.id, 0, 0, "AA=="),
		).toThrow(/not found/);
		expect(() => transfers.cancel(session, documentId, info.id)).toThrow(
			/not found/,
		);
		await expect(
			transfers.commit(session, documentId, info.id),
		).rejects.toMatchObject({ code: "not-found" });
	}
	expect(transfers.metrics().transfers).toBe(2);
	transfers.write("second", other.documentId, other.id, 0, 0, "CQ==");
	await transfers.commit("second", other.documentId, other.id);
	expect(transfers.metrics().transfers).toBe(1);
	expect(first.owner.files(first.reference)).toHaveLength(0);
	expect(second.owner.files(second.reference)[0].data).toEqual(
		Uint8Array.of(9),
	);
	const unknown = `upload-${crypto.randomUUID()}`;
	expect(transfers.cancel("first", info.documentId, unknown).canceled).toBe(
		true,
	);
	expect(transfers.cancel("first", info.documentId, info.id).canceled).toBe(
		true,
	);
	expect(transfers.cancel("first", info.documentId, info.id).canceled).toBe(
		true,
	);
});

it.each([
	"disabled",
	"fieldset",
	"multiple",
	"type",
	"remove",
	"reset",
	"clear",
	"close",
	"navigate",
])("invalidates or revalidates pending work on %s", async (change) => {
	const item = fixture();
	const { transfers, owner, tree, input, form, reference } = item;
	const info = item.begin([1, 1]);
	transfers.write("first", info.documentId, info.id, 0, 0, "AQ==");
	transfers.write("first", info.documentId, info.id, 1, 0, "Ag==");
	if (change === "disabled") tree.setAttribute(input, "disabled", "");
	if (change === "fieldset") {
		const fieldset = tree.createElement("fieldset", { disabled: "" });
		tree.append(form, fieldset);
		tree.append(fieldset, input);
	}
	if (change === "multiple") tree.removeAttribute(input, "multiple");
	if (change === "type") {
		tree.setAttribute(input, "type", "text");
		tree.setAttribute(input, "type", "file");
	}
	if (change === "remove") {
		tree.remove(input);
		tree.append(form, input);
	}
	if (change === "reset") owner.resetForm(tree.reference(form));
	if (change === "clear") owner.clear(reference);
	if (change === "close") tree.close();
	if (change === "navigate") fixture(transfers, "first");
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toBeInstanceOf(Error);
	expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
	expect(owner.metrics().files).toBe(0);
});

it("rejects stale targets at begin and metadata exceeding owner limits or single-file mutability", () => {
	const { transfers, owner, reference, request, tree, input } = fixture();
	const stale = request();
	owner.clear(reference);
	expect(() => transfers.begin("first", stale)).toThrow(/stale/);
	tree.removeAttribute(input, "multiple");
	expect(() => transfers.begin("first", request([1, 1]))).toThrow(/multiple/);
	expect(() => transfers.begin("first", request([17]))).toThrow(/byte limit/);
	expect(() => transfers.begin("first", request([1, 1, 1, 1, 1]))).toThrow(
		/count/,
	);
	tree.setAttribute(input, "disabled", "");
	expect(() =>
		transfers.begin("first", {
			...stale,
			target: { ...stale.target, version: owner.metrics().version },
		}),
	).toThrow(/disabled/);
	expect(transfers.metrics().stagedBytes).toBe(0);
});

it("reserves selected plus staged plus commit-copy memory before allocation and releases budget", async () => {
	const transfers = manager({
		maxResidentBytes: 32_768 + 32 + 16,
		maxStagedBytes: 16,
		maxTransfers: 2,
	});
	const { begin, owner, reference } = fixture(transfers);
	const info = begin([8]);
	expect(transfers.metrics()).toMatchObject({
		selectedReservationBytes: 32,
		stagedBytes: 8,
		commitCopyReservationBytes: 8,
		codecReservationBytes: 32_768,
		residentReservationBytes: 32_816,
	});
	expect(() => begin([1])).toThrow(/capacity/);
	transfers.write(
		"first",
		info.documentId,
		info.id,
		0,
		0,
		encodeStateChunk(new Uint8Array(8)),
	);
	await transfers.commit("first", info.documentId, info.id);
	expect(owner.files(reference)[0].data.length).toBe(8);
	expect(transfers.metrics().residentReservationBytes).toBe(32_800);
	begin([8]);
	const failedOwner = new DocumentFileSelections(
		new DocumentTree("https://example.com"),
	);
	expect(() =>
		transfers.attach("other", failedOwner, async () => {
			throw new Error();
		}),
	).toThrow(/memory reservation/);
	failedOwner.close();
	expect(transfers.metrics().sessions).toBe(1);
});

it("bounds transfer count even for empty files and validates manager limits", () => {
	const transfers = manager({ maxTransfers: 1, maxStagedBytes: 2 });
	const { begin } = fixture(transfers);
	expect(() => begin([3])).toThrow(/capacity/);
	const empty = begin([]);
	expect(() => begin([])).toThrow(/capacity/);
	transfers.cancel("first", empty.documentId, empty.id);
	expect(() => begin([2])).not.toThrow();
	expect(() => new UploadTransfers({ ttlMs: 0 })).toThrow(/limits/);
	expect(() => new UploadTransfers({ maxResidentBytes: 1 })).toThrow(
		/memory budget/,
	);
	expect(() => new UploadTransfers({}, () => Number.NaN)).toThrow(/clock/);
});

it("expires orphaned begin requests on an absolute deadline without another operation", async () => {
	vi.useFakeTimers();
	const transfers = manager({ ttlMs: 20 });
	const { begin, owner, reference } = fixture(transfers);
	const info = begin();
	await vi.advanceTimersByTimeAsync(10);
	transfers.write("first", info.documentId, info.id, 0, 0, "AA==");
	await vi.advanceTimersByTimeAsync(10);
	expect(vi.getTimerCount()).toBe(0);
	expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
	expect(owner.files(reference)).toHaveLength(0);
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toMatchObject({ code: "not-found" });
});

it.each(["cancel", "abort", "reset", "close", "timeout"])(
	"prevents a delayed event runner from committing after %s",
	async (cause) => {
		vi.useFakeTimers();
		let resume: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const transfers = manager({ ttlMs: 20 });
		const item = fixture(transfers, "first", async (action, signal) => {
			await gate;
			return runEventActionAsync(events, action, signal);
		});
		const events = item.events;
		const info = item.begin([1]);
		transfers.write("first", info.documentId, info.id, 0, 0, "AA==");
		const controller = new AbortController();
		const committing = transfers.commit(
			"first",
			info.documentId,
			info.id,
			controller.signal,
		);
		const rejection = expect(committing).rejects.toBeInstanceOf(Error);
		if (cause === "cancel") transfers.cancel("first", info.documentId, info.id);
		if (cause === "abort") controller.abort();
		if (cause === "reset") item.owner.resetForm(item.tree.reference(item.form));
		if (cause === "close") item.tree.close();
		if (cause === "timeout") await vi.advanceTimersByTimeAsync(20);
		resume();
		await rejection;
		expect(item.owner.metrics().files).toBe(0);
		expect(transfers.metrics()).toMatchObject({ transfers: 0, stagedBytes: 0 });
	},
);

it("does not let duplicate commit or write disturb an already scheduled commit", async () => {
	let resume: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const {
		transfers,
		begin,
		owner,
		reference,
		events: actual,
	} = fixture(manager(), "first", async (action, signal) => {
		await gate;
		return runEventActionAsync(events, action, signal);
	});
	const events = actual;
	const info = begin([1]);
	transfers.write("first", info.documentId, info.id, 0, 0, "AQ==");
	const committing = transfers.commit("first", info.documentId, info.id);
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(() =>
		transfers.write("first", info.documentId, info.id, 0, 0, "Ag=="),
	).toThrow(/already running/);
	resume();
	await committing;
	expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(1));
});

it("releases staging before an asynchronous input listener and aborts it at the deadline without undoing committed bytes", async () => {
	vi.useFakeTimers();
	const { transfers, begin, events, input, owner, reference } = fixture(
		manager({ ttlMs: 20 }),
	);
	events.addEventListener(
		input,
		"input",
		controlledEventListener(async () => new Promise<void>(() => {})),
	);
	const info = begin([1]);
	transfers.write("first", info.documentId, info.id, 0, 0, "CQ==");
	const result = transfers.commit("first", info.documentId, info.id);
	const rejected = expect(result).rejects.toBeInstanceOf(Error);
	expect(transfers.metrics()).toMatchObject({ stagedBytes: 0, transfers: 1 });
	expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(9));
	await vi.advanceTimersByTimeAsync(20);
	await rejected;
	expect(owner.files(reference)[0].data).toEqual(Uint8Array.of(9));
	expect(transfers.metrics().transfers).toBe(0);
});

it("handles reset during input dispatch without resurrecting the selection", async () => {
	const { transfers, begin, events, input, owner, reference } = fixture();
	events.addEventListener(input, "input", () => owner.clear(reference));
	const info = begin([1]);
	transfers.write("first", info.documentId, info.id, 0, 0, "AQ==");
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toBeInstanceOf(Error);
	expect(owner.files(reference)).toHaveLength(0);
	expect(transfers.metrics().stagedBytes).toBe(0);
});

it("closes owners and cancels all timers on manager disposal", () => {
	vi.useFakeTimers();
	const { transfers, begin, owner } = fixture();
	begin();
	transfers.close();
	transfers.close();
	expect(vi.getTimerCount()).toBe(0);
	expect(owner.metrics()).toMatchObject({ closed: true, bytes: 0 });
	expect(transfers.metrics()).toEqual({
		sessions: 0,
		documents: 0,
		transfers: 0,
		stagedBytes: 0,
		selectedReservationBytes: 0,
		commitCopyReservationBytes: 0,
		codecReservationBytes: 0,
		residentReservationBytes: 0,
		closed: true,
	});
});

it("preserves inactive document selections while invalidating pending transfers and retains their memory reservation", async () => {
	const transfers = manager();
	const first = fixture(transfers);
	first.owner.replace(first.owner.capture(first.reference), [
		{ name: "kept", data: Uint8Array.of(9) },
	]);
	const oldTarget = first.owner.capture(first.reference);
	const pending = first.begin();
	const second = fixture(transfers);
	expect(first.owner.files(first.reference)[0].data).toEqual(Uint8Array.of(9));
	expect(transfers.metrics()).toMatchObject({
		documents: 2,
		selectedReservationBytes: 64,
		stagedBytes: 0,
	});
	await expect(
		transfers.commit("first", pending.documentId, pending.id),
	).rejects.toMatchObject({ code: "not-found" });
	transfers.attach("first", first.owner, (action, signal) =>
		runEventActionAsync(first.events, action, signal),
	);
	expect(transfers.capture("first", first.reference).documentId).toBe(
		first.owner.documentId,
	);
	expect(() =>
		transfers.begin("first", { target: oldTarget, files: [] }),
	).toThrow(/stale/);
	second.tree.close();
	expect(first.owner.metrics().closed).toBe(false);
	expect(transfers.metrics()).toMatchObject({
		sessions: 1,
		documents: 1,
		selectedReservationBytes: 32,
	});
	transfers.detachDocument("first", first.owner.documentId);
	expect(first.owner.metrics().closed).toBe(true);
	expect(transfers.metrics()).toMatchObject({
		sessions: 0,
		documents: 0,
		selectedReservationBytes: 0,
	});
});

it("bounds all retained documents and sessions and never shares a document owner across sessions", () => {
	const transfers = manager({ maxSessions: 1, maxDocuments: 2 });
	const first = fixture(transfers);
	expect(() =>
		transfers.attach("other", first.owner, async <Result>() => ({}) as Result),
	).toThrow(/already belongs/);
	expect(() => fixture(transfers, "other")).toThrow(/reservation/);
	fixture(transfers);
	expect(() => fixture(transfers)).toThrow(/reservation/);
	expect(transfers.metrics()).toMatchObject({ sessions: 1, documents: 2 });
	transfers.detach("first");
	expect(transfers.metrics().documents).toBe(0);
});

it("requires its real event action to complete rather than trusting a runner's fabricated result", async () => {
	const { transfers, begin, owner } = fixture(
		manager(),
		"first",
		async <Result>() => ({}) as Result,
	);
	const info = begin([]);
	await expect(
		transfers.commit("first", info.documentId, info.id),
	).rejects.toMatchObject({ code: "invalid-input" });
	expect(owner.metrics().version).toBe(0);
	expect(transfers.metrics().transfers).toBe(0);
});

it("rejects identity collisions without overwriting entries or leaking timers", () => {
	vi.useFakeTimers();
	const { begin, transfers } = fixture();
	const info = begin([]);
	vi.spyOn(crypto, "randomUUID").mockReturnValue(
		info.id.slice(7) as ReturnType<Crypto["randomUUID"]>,
	);
	expect(() => begin([])).toThrow(/collision/);
	expect(transfers.metrics().transfers).toBe(1);
	expect(vi.getTimerCount()).toBe(1);
});
