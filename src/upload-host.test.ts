import { afterEach, expect, it, vi } from "vitest";
import { readTrace } from "./capture-client.js";
import { BrowserCommandHost, type CommandHostOptions } from "./command-host.js";
import type { FileSelectionTarget } from "./control-files.js";
import { documentFiles } from "./document-files.js";
import { controlledEventListener } from "./events.js";
import { prepareFormSubmission } from "./forms.js";
import { parseHtmlDocument } from "./html-parser.js";
import type { NetworkRequest } from "./network.js";
import { BrowserSession } from "./session.js";
import { encodeStateChunk } from "./state-transfer.js";
import type {
	UploadCommitResult,
	UploadFileMetadata,
	UploadTransferInfo,
} from "./upload-protocol.js";

const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

async function fixture(
	options: Pick<
		CommandHostOptions,
		"uploadLimits" | "uploadSessionLimits"
	> = {},
) {
	const sessions = new Map<string, BrowserSession>();
	const requests: NetworkRequest[] = [];
	const host = new BrowserCommandHost({
		...options,
		createSession(name) {
			const browser = new BrowserSession({
				createTransport: () => ({
					async request(input) {
						requests.push(input);
						return {
							url: input.url,
							status: 200,
							headers: {},
							body: new Uint8Array(),
							redirects: [],
							encodedBytes: 0,
							elapsedMs: 0,
						};
					},
					metrics: () => ({
						requests: requests.length,
						active: 0,
						redirects: 0,
						encodedBytes: 0,
						decodedBytes: 0,
						closed: false,
					}),
					close() {},
				}),
				loadDocument: (response) =>
					parseHtmlDocument(
						'<style>html,body{margin:0;padding:0}button{display:block;width:40px;height:20px}</style><form id="form" action="/sent" method="post" enctype="multipart/form-data"><input id="file" type="file" name="attachment" multiple style="display:none"><button id="reset" type="reset">Reset</button><button id="send">Send</button></form>',
						response.url,
					),
			});
			sessions.set(name, browser);
			return browser;
		},
	});
	hosts.push(host);
	const execute = (argv: string[], session = "default", signal?: AbortSignal) =>
		host.execute(argv, { session, signal });
	const open = (session = "default") =>
		execute(["open", "https://fixture.invalid/start"], session);
	await open();
	const context = (name = "default") => {
		const session = sessions.get(name);
		if (!session) throw new Error("Missing session");
		const tab = session.tabs().find((tab) => tab.selected);
		if (!tab) throw new Error("Missing selected tab");
		const page = session.page(tab.id);
		const id = (selector: string) => {
			const result = page.queries.querySelector(selector);
			if (result === null) throw new Error(`Missing ${selector}`);
			return result;
		};
		return {
			session,
			tab,
			page,
			id,
			file: id("#file"),
			owner: documentFiles(page.document),
			reference: page.document.reference(id("#file")),
			form: page.document.reference(id("#form")),
		};
	};
	const capture = async (session = "default", selector = "#file") =>
		(
			(await execute(["upload-target", selector], session)).data as {
				target: FileSelectionTarget;
			}
		).target;
	const begin = async (
		target: FileSelectionTarget,
		files: readonly UploadFileMetadata[],
		session = "default",
	) =>
		(
			await execute(
				["upload-begin", JSON.stringify({ target, files })],
				session,
			)
		).data as UploadTransferInfo;
	const write = (
		info: UploadTransferInfo,
		bytes: Uint8Array,
		offset = 0,
		file = 0,
		session = "default",
	) =>
		execute(
			[
				"upload-write",
				info.documentId,
				info.id,
				String(file),
				String(offset),
				encodeStateChunk(bytes),
			],
			session,
		);
	const commit = async (
		info: UploadTransferInfo,
		session = "default",
		signal?: AbortSignal,
	) =>
		(
			await execute(
				["upload-commit", info.documentId, info.id],
				session,
				signal,
			)
		).data as UploadCommitResult;
	const cancel = (info: UploadTransferInfo, session = "default") =>
		execute(["upload-cancel", info.documentId, info.id], session);
	const stage = async (
		session = "default",
		bytes = new TextEncoder().encode("owned bytes"),
		name = "selected.txt",
	) => {
		const info = await begin(
			await capture(session),
			[{ name, type: "text/plain", bytes: bytes.length }],
			session,
		);
		if (bytes.length) await write(info, bytes, 0, 0, session);
		return info;
	};
	return {
		host,
		sessions,
		requests,
		execute,
		open,
		context,
		capture,
		begin,
		write,
		commit,
		cancel,
		stage,
	};
}

function gate() {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}

it("advertises real bounded native transfer commands without guest or live acceptance claims", async () => {
	const { execute } = await fixture();
	expect((await execute(["capabilities"])).data).toMatchObject({
		uploads: {
			partial: true,
			commands: [
				"upload-target",
				"upload-begin",
				"upload-write",
				"upload-commit",
				"upload-cancel",
			],
			chunkBytes: 32768,
			documentOwned: true,
			serverFilesystem: false,
			guestFileFileList: false,
			liveUploadAcceptance: false,
		},
	});
	for (const name of [
		"upload-target",
		"upload-begin",
		"upload-write",
		"upload-commit",
		"upload-cancel",
	])
		expect(JSON.stringify((await execute([name, "--help"])).data)).toContain(
			'"status":"partial"',
		);
});

it("captures a selector once, streams ordered chunks, and commits through real native events", async () => {
	const test = await fixture();
	const { page, owner, file, reference } = test.context();
	const target = await test.capture();
	expect(target).toEqual(owner.capture(reference));
	expect(page.interactions.files).toBe(owner);
	const info = await test.begin(target, [
		{ name: "message.txt", type: "text/plain", bytes: 4 },
	]);
	const states: unknown[] = [];
	for (const type of ["input", "change"])
		page.interactions.events.addEventListener(file, type, (event) =>
			states.push({
				type: event.type,
				bytes: [...owner.files(reference)[0].data],
				staging: test.host.metrics().uploads.stagedBytes,
			}),
		);
	await test.write(info, Uint8Array.of(1, 2));
	await test.write(info, Uint8Array.of(3, 4), 2);
	expect(owner.metrics().files).toBe(0);
	const result = await test.commit(info);
	expect(result).toMatchObject({
		committed: true,
		stagingReleased: true,
		files: 1,
		bytes: 4,
		version: target.version + 1,
	});
	expect(states).toEqual([
		{ type: "input", bytes: [1, 2, 3, 4], staging: 0 },
		{ type: "change", bytes: [1, 2, 3, 4], staging: 0 },
	]);
	expect(test.host.metrics().uploads).toMatchObject({
		documents: 1,
		transfers: 0,
		stagedBytes: 0,
		commitCopyReservationBytes: 0,
		selectedReservationBytes: 33554432,
	});
});

it("accepts full-size canonical chunks and counts zero-byte files without empty writes", async () => {
	const test = await fixture();
	const payload = new Uint8Array(32770).fill(87);
	const info = await test.begin(await test.capture(), [
		{ name: "empty", bytes: 0 },
		{ name: "big", bytes: payload.length },
		{ name: "last", bytes: 0 },
	]);
	expect(info.fileIndex).toBe(1);
	await test.write(info, payload.subarray(0, 32768), 0, 1);
	await test.write(info, payload.subarray(32768), 32768, 1);
	expect(await test.commit(info)).toMatchObject({ files: 3, bytes: 32770 });
	const { owner, reference } = test.context();
	expect(owner.files(reference).map((file) => file.data.length)).toEqual([
		0, 32770, 0,
	]);
});

it("publishes selected bytes through the parent's real multipart preparation and submission", async () => {
	const test = await fixture();
	const { session, tab, page, form } = test.context();
	await test.commit(await test.stage());
	const prepared = prepareFormSubmission(page.document, form, {
		boundary: "fixture-boundary",
	});
	const body = new TextDecoder().decode(prepared.request.body as Uint8Array);
	expect(body).toContain('filename="selected.txt"');
	expect(body).toContain("owned bytes");
	await session.requestSubmit(tab.id, form);
	expect(
		new TextDecoder().decode(test.requests.at(-1)?.body as Uint8Array),
	).toContain("owned bytes");
	expect(JSON.stringify(session.requests(tab.id))).not.toContain("owned bytes");
	expect(test.host.metrics().uploads).toMatchObject({
		documents: 0,
		transfers: 0,
		selectedReservationBytes: 0,
	});
});

it("uses an empty file list as an eventful selection replacement", async () => {
	const test = await fixture();
	await test.commit(await test.stage());
	const info = await test.begin(await test.capture(), []);
	expect(await test.commit(info)).toMatchObject({ files: 0, bytes: 0 });
	expect(test.context().owner.metrics().files).toBe(0);
});

it.each([
	"session",
	"path",
	"data",
	"invalid-name",
	"negative",
	"extra-target",
	"bad-json",
])("rejects invalid metadata %s without allocating staging", async (kind) => {
	const test = await fixture();
	const target = await test.capture();
	const metadata: Record<string, unknown> = {
		target,
		files: [{ name: "valid.txt", bytes: 1 }],
	};
	if (kind === "session") metadata.session = "other";
	if (kind === "path")
		metadata.files = [{ name: "valid.txt", bytes: 1, path: "/private/secret" }];
	if (kind === "data")
		metadata.files = [{ name: "valid.txt", bytes: 1, data: "secret" }];
	if (kind === "invalid-name")
		metadata.files = [{ name: "/private/secret", bytes: 1 }];
	if (kind === "negative") metadata.files = [{ name: "valid.txt", bytes: -1 }];
	if (kind === "extra-target")
		metadata.target = { ...target, session: "other" };
	await expect(
		test.execute([
			"upload-begin",
			kind === "bad-json" ? "{private-secret" : JSON.stringify(metadata),
		]),
	).rejects.toMatchObject({ message: "Upload command failed" });
	expect(test.host.metrics().uploads).toMatchObject({
		stagedBytes: 0,
		transfers: 0,
	});
});

it("rejects unsupported options, malformed arity, and upload session overrides without echoing payloads", async () => {
	const test = await fixture();
	for (const args of [
		["upload-write", "--secret-path=/private/secret"],
		["upload-begin"],
		["upload-target", "#file", "extra"],
	]) {
		const failure = await test.execute(args).catch((error) => error);
		expect(failure.message).not.toContain("/private/secret");
		expect(failure).toBeInstanceOf(Error);
	}
	await expect(
		test.execute(["-s=other", "upload-target", "#file"]),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(test.host.metrics().uploads.documents).toBe(0);
});

it.each(["AQ=", "AQ==\n", "", "--private-secret"])(
	"revokes an owned malformed write without echoing its content: %s",
	async (base64) => {
		const test = await fixture();
		const info = await test.begin(await test.capture(), [
			{ name: "a", bytes: 1 },
		]);
		await expect(
			test.execute([
				"upload-write",
				info.documentId,
				info.id,
				"0",
				"0",
				base64,
			]),
		).rejects.toMatchObject({ message: "Upload command failed" });
		if (!base64.startsWith("--"))
			expect(test.host.metrics().uploads.transfers).toBe(0);
		await test.cancel(info);
	},
);

it.each(["offset", "file", "overrun", "incomplete"])(
	"cleans failed %s transfers and permits a fresh reservation",
	async (kind) => {
		const test = await fixture({ uploadSessionLimits: { maxTransfers: 1 } });
		const info = await test.begin(await test.capture(), [
			{ name: "a", bytes: 2 },
		]);
		const pending =
			kind === "incomplete"
				? test.commit(info)
				: test.write(
						info,
						kind === "overrun" ? Uint8Array.of(1, 2, 3) : Uint8Array.of(1),
						kind === "offset" ? 1 : 0,
						kind === "file" ? 1 : 0,
					);
		await expect(pending).rejects.toBeInstanceOf(Error);
		expect(test.host.metrics().uploads).toMatchObject({
			transfers: 0,
			stagedBytes: 0,
		});
		await test.cancel(
			await test.begin(await test.capture(), [{ name: "new", bytes: 0 }]),
		);
	},
);

it("isolates sessions even when metadata or document/transfer IDs belong to another session", async () => {
	const test = await fixture();
	const info = await test.stage();
	await test.open("second");
	await test.capture("second");
	await expect(
		test.write(info, Uint8Array.of(1), 0, 0, "second"),
	).rejects.toMatchObject({ code: "not-found" });
	await expect(test.commit(info, "second")).rejects.toMatchObject({
		code: "not-found",
	});
	await expect(test.cancel(info, "second")).rejects.toMatchObject({
		code: "not-found",
	});
	await expect(
		test.begin(await test.capture(), [], "second"),
	).rejects.toMatchObject({ code: "stale-reference" });
	expect(test.host.metrics().uploads.transfers).toBe(1);
	await test.commit(info);
	expect(test.context("second").owner.metrics().files).toBe(0);
});

it("revokes old captures and staging on tab changes without deleting inactive selections", async () => {
	const test = await fixture();
	const first = test.context();
	await test.commit(await test.stage());
	const pending = await test.stage();
	const captured = await test.capture();
	await test.execute(["tab-new", "https://fixture.invalid/second"]);
	expect(test.host.metrics().uploads.transfers).toBe(0);
	expect(first.owner.metrics().files).toBe(1);
	const second = test.context();
	await test.commit(await test.stage());
	await test.execute(["tab-select", "0"]);
	await expect(test.begin(captured, [])).rejects.toMatchObject({
		code: "stale-reference",
	});
	await expect(test.commit(pending)).rejects.toMatchObject({
		code: "not-found",
	});
	expect(first.owner.metrics().files).toBe(1);
	expect(second.owner.metrics().files).toBe(1);
	await test.execute(["tab-close", "1"]);
	expect(second.owner.metrics().closed).toBe(true);
	expect(first.owner.metrics().files).toBe(1);
	expect(test.host.metrics().uploads.documents).toBe(1);
});

it("invalidates direct session tab switches as well as host commands", async () => {
	const test = await fixture();
	const first = test.context();
	const info = await test.stage();
	const second = first.session.createTab();
	expect(test.host.metrics().uploads.transfers).toBe(0);
	first.session.selectTab(first.tab.id);
	await expect(test.commit(info)).rejects.toMatchObject({ code: "not-found" });
	first.session.closeTab(second.id);
});

it("does not redirect a captured selector to a replacement file input", async () => {
	const test = await fixture();
	const { page, file } = test.context();
	const target = await test.capture();
	const parent = page.document.get(file).parent;
	if (parent === null) throw new Error("Missing parent");
	page.document.remove(file);
	const replacement = page.document.createElement("input", {
		id: "file",
		type: "file",
		style: "display:none",
	});
	page.document.append(parent, replacement);
	await expect(test.begin(target, [])).rejects.toMatchObject({
		code: "stale-reference",
	});
	expect((await test.capture()).reference).not.toBe(target.reference);
});

it.each([
	"reset",
	"clear",
	"type",
	"remove",
	"navigation",
	"same-document",
	"close",
])("cleans staging on %s without replay", async (kind) => {
	const test = await fixture();
	const current = test.context();
	const info = await test.stage();
	if (kind === "reset")
		await current.page.interactions.forms.resetAsync(current.form);
	if (kind === "clear") current.owner.clear(current.file);
	if (kind === "type")
		current.page.document.setAttribute(current.file, "type", "text");
	if (kind === "remove") current.page.document.remove(current.file);
	if (kind === "navigation")
		await test.execute(["goto", "https://fixture.invalid/next"]);
	if (kind === "same-document") await test.execute(["goto", "#hash"]);
	if (kind === "close") current.session.closeTab(current.tab.id);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
		commitCopyReservationBytes: 0,
	});
	await expect(test.commit(info)).rejects.toBeInstanceOf(Error);
	expect((await test.cancel(info)).data).toMatchObject({ canceled: true });
});

it("keeps a staged transfer and existing selection when native form reset is canceled", async () => {
	const test = await fixture();
	const { page, owner, id, form } = test.context();
	await test.commit(await test.stage());
	const pending = await test.stage();
	page.interactions.events.addEventListener(id("#form"), "reset", (event) =>
		event.preventDefault(),
	);
	await page.interactions.forms.resetAsync(form);
	expect(owner.metrics().files).toBe(1);
	expect(test.host.metrics().uploads.transfers).toBe(1);
	await test.commit(pending);
});

it.each(["switch", "navigation", "reset", "close"])(
	"revalidates ownership after the input event causes %s and suppresses change",
	async (kind) => {
		const test = await fixture();
		const current = test.context();
		const info = await test.stage();
		let changes = 0;
		current.page.interactions.events.addEventListener(
			current.file,
			"change",
			() => {
				changes++;
			},
		);
		current.page.interactions.events.addEventListener(
			current.file,
			"input",
			controlledEventListener(async () => {
				if (kind === "switch") current.session.createTab();
				if (kind === "navigation")
					await current.session.navigate(
						current.tab.id,
						"https://fixture.invalid/next",
					);
				if (kind === "reset")
					await current.page.interactions.forms.resetAsync(current.form);
				if (kind === "close") current.session.closeTab(current.tab.id);
			}),
		);
		await expect(test.commit(info)).rejects.toBeInstanceOf(Error);
		expect(changes).toBe(0);
		expect(test.host.metrics().uploads).toMatchObject({
			transfers: 0,
			stagedBytes: 0,
		});
		if (kind === "switch") expect(current.owner.metrics().files).toBe(1);
	},
);

it("aborts suspended commit dispatch, releases staging before events, and does not promise rollback", async () => {
	const test = await fixture();
	const { page, owner, file } = test.context();
	const info = await test.stage();
	const entered = gate();
	const waiting = gate();
	let changes = 0;
	page.interactions.events.addEventListener(
		file,
		"input",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	page.interactions.events.addEventListener(file, "change", () => {
		changes++;
	});
	const controller = new AbortController();
	const pending = test.commit(info, "default", controller.signal);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered.pending;
	expect(owner.metrics().files).toBe(1);
	expect(test.host.metrics().uploads).toMatchObject({
		stagedBytes: 0,
		commitCopyReservationBytes: 0,
	});
	controller.abort();
	await rejected;
	await test.execute(["metrics"]);
	expect(changes).toBe(0);
	expect(test.host.metrics().uploads.transfers).toBe(0);
	waiting.release();
});

it("uses separate queue turns for chunks rather than locking the host for the transfer", async () => {
	const test = await fixture();
	const info = await test.begin(await test.capture(), [
		{ name: "a", bytes: 2 },
	]);
	await test.write(info, Uint8Array.of(1));
	expect(
		(await test.execute(["localstorage-set", "between", "chunks"])).data,
	).toBeDefined();
	await test.write(info, Uint8Array.of(2), 1);
	await test.commit(info);
	expect(
		(await test.execute(["localstorage-get", "between"])).data,
	).toMatchObject({ value: "chunks" });
});

it("does not invalidate a transfer when selecting the already-active tab", async () => {
	const test = await fixture();
	const info = await test.stage();
	await test.execute(["tab-select", "0"]);
	expect(await test.commit(info)).toMatchObject({ committed: true });
});

it("rechecks a newly disabled file control before replacing its prior selection", async () => {
	const test = await fixture();
	const { page, file, owner, reference } = test.context();
	await test.commit(await test.stage());
	const info = await test.stage("default", Uint8Array.of(9), "replacement.txt");
	page.document.setAttribute(file, "disabled", "");
	await expect(test.commit(info)).rejects.toMatchObject({
		code: "not-actionable",
	});
	expect(owner.files(reference)[0].name).toBe("selected.txt");
	expect(test.host.metrics().uploads.transfers).toBe(0);
});

it("cancels idempotently and releases abandoned staging on absolute TTL", async () => {
	vi.useFakeTimers();
	const test = await fixture({
		uploadLimits: { ttlMs: 50 },
		uploadSessionLimits: { maxTransfers: 1 },
	});
	const info = await test.stage();
	await vi.advanceTimersByTimeAsync(51);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	expect((await test.cancel(info)).data).toMatchObject({
		canceled: true,
		stagingReleased: true,
	});
	expect((await test.cancel(info)).data).toMatchObject({ canceled: true });
	await test.cancel(await test.stage());
});

it("expires a suspended commit without holding the command queue indefinitely", async () => {
	vi.useFakeTimers();
	const test = await fixture({ uploadLimits: { ttlMs: 50 } });
	const { page, file, owner } = test.context();
	const info = await test.stage();
	const entered = gate();
	const waiting = gate();
	page.interactions.events.addEventListener(
		file,
		"input",
		controlledEventListener(async () => {
			entered.release();
			await waiting.pending;
		}),
	);
	const pending = test.commit(info);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	await entered.pending;
	await vi.advanceTimersByTimeAsync(51);
	await rejected;
	await test.execute(["metrics"]);
	expect(owner.metrics().files).toBe(1);
	expect(test.host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	waiting.release();
});

it("enforces per-session staging limits independently of the global staging allowance", async () => {
	const test = await fixture({
		uploadLimits: { maxStagedBytes: 8 },
		uploadSessionLimits: { maxStagedBytes: 2 },
	});
	const first = await test.begin(await test.capture(), [
		{ name: "a", bytes: 2 },
	]);
	await test.open("second");
	const second = await test.begin(
		await test.capture("second"),
		[{ name: "b", bytes: 2 }],
		"second",
	);
	await expect(
		test.begin(await test.capture(), [{ name: "c", bytes: 1 }]),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.host.metrics().uploads.stagedBytes).toBe(4);
	await test.cancel(first);
	await test.cancel(second, "second");
});

it("enforces global staging and commit-copy reservations before allocation", async () => {
	const test = await fixture({ uploadLimits: { maxStagedBytes: 2 } });
	const info = await test.begin(await test.capture(), [
		{ name: "a", bytes: 2 },
	]);
	await expect(
		test.begin(await test.capture(), [{ name: "b", bytes: 1 }]),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.host.metrics().uploads).toMatchObject({
		stagedBytes: 2,
		commitCopyReservationBytes: 2,
		selectedReservationBytes: 33554432,
	});
	await test.cancel(info);
});

it("reserves selected capacity for inactive documents and releases it only on real disposal", async () => {
	const test = await fixture({
		uploadSessionLimits: { maxSelectedBytes: 33554432 },
	});
	const first = test.context();
	await test.commit(await test.stage());
	await test.execute(["tab-new", "https://fixture.invalid/second"]);
	await expect(test.capture()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(first.owner.metrics().files).toBe(1);
	await test.execute(["tab-close", "0"]);
	await test.capture();
	expect(test.host.metrics().uploads).toMatchObject({
		documents: 1,
		selectedReservationBytes: 33554432,
	});
});

it("cannot exceed the combined selected/staging/commit-copy global reservation", async () => {
	const test = await fixture({ uploadLimits: { maxResidentBytes: 67141632 } });
	await test.capture();
	await test.open("second");
	await test.capture("second");
	await expect(
		test.begin(await test.capture(), [{ name: "a", bytes: 1 }]),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.host.metrics().uploads.residentReservationBytes).toBe(67141632);
});

it("enforces the host-wide registered-session ceiling without closing an unadmitted owner", async () => {
	const test = await fixture({ uploadLimits: { maxSessions: 1 } });
	await test.capture();
	await test.open("second");
	const second = test.context("second");
	await expect(test.capture("second")).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(second.owner.metrics().closed).toBe(false);
	expect(test.host.metrics().uploads.sessions).toBe(1);
	await test.execute(["close"]);
	await test.capture("second");
	expect(test.host.metrics().uploads.sessions).toBe(1);
});

it("does not leak a reservation or close the shared owner when invalidation-listener admission fails", async () => {
	const test = await fixture();
	const { owner } = test.context();
	const subscriptions = Array.from({ length: 15 }, () =>
		owner.onInvalidate(() => {}),
	);
	await expect(test.capture()).rejects.toMatchObject({
		code: "resource-limit",
	});
	expect(test.host.metrics().uploads).toMatchObject({
		documents: 0,
		selectedReservationBytes: 0,
	});
	expect(owner.metrics().closed).toBe(false);
	for (const unsubscribe of subscriptions) unsubscribe();
	await test.capture();
	expect(test.host.metrics().uploads.documents).toBe(1);
});

it("closes all upload owners/staging on session or host disposal without affecting another session", async () => {
	const test = await fixture();
	const first = test.context();
	await test.stage();
	await test.open("second");
	const second = test.context("second");
	await test.commit(await test.stage("second"), "second");
	await test.execute(["close"]);
	expect(first.owner.metrics().closed).toBe(true);
	expect(second.owner.metrics().files).toBe(1);
	expect(test.host.metrics().uploads).toMatchObject({
		sessions: 1,
		documents: 1,
		transfers: 0,
	});
	test.host.close();
	expect(second.owner.metrics().closed).toBe(true);
	expect(test.host.metrics().uploads).toMatchObject({
		closed: true,
		documents: 0,
		selectedReservationBytes: 0,
		residentReservationBytes: 0,
	});
});

it("keeps metadata, payloads and local paths out of transfer responses, metrics, journals and traces", async () => {
	const test = await fixture();
	await test.execute(["tracing-start"]);
	const payload = new TextEncoder().encode("PRIVATE-UPLOAD-BYTES-9d83");
	const info = await test.stage("default", payload, "private-name-9d83.txt");
	const result = await test.commit(info);
	const failure = await test
		.execute([
			"upload-begin",
			'{"path":"/private/path-9d83","data":"PRIVATE-UPLOAD-BYTES-9d83"}',
		])
		.catch((error) => ({ message: error.message }));
	const artifact = (await test.execute(["tracing-stop"])).data;
	let trace = "";
	await readTrace(
		(argv) => test.execute([...argv]),
		artifact,
		(bytes) => {
			trace = new TextDecoder().decode(bytes);
		},
	);
	const diagnostics = JSON.stringify({
		info,
		result,
		failure,
		metrics: test.host.metrics(),
		requests: test.context().session.requests(test.context().tab.id),
		trace,
	});
	for (const secret of [
		"PRIVATE-UPLOAD-BYTES-9d83",
		encodeStateChunk(payload),
		"/private/path-9d83",
		"private-name-9d83.txt",
	])
		expect(diagnostics).not.toContain(secret);
	expect(trace).toContain("upload-commit");
});
