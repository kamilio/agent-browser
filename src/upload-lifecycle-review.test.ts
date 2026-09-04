import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import {
	DocumentFileSelections,
	type FileSelectionTarget,
} from "./control-files.js";
import { documentFiles } from "./document-files.js";
import { DocumentTree } from "./document.js";
import { runEventActionAsync } from "./event-actions.js";
import { DocumentEvents } from "./events.js";
import { parseHtmlDocument } from "./html-parser.js";
import { BrowserSession } from "./session.js";
import { UploadTransfers } from "./upload-transfers.js";

const trees: DocumentTree[] = [];
const managers: UploadTransfers[] = [];
const hosts: BrowserCommandHost[] = [];

afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
	for (const manager of managers.splice(0)) manager.close();
	for (const tree of trees.splice(0)) tree.close();
});

function documentOwner() {
	const tree = new DocumentTree("https://fixture.invalid/upload");
	trees.push(tree);
	const owner = new DocumentFileSelections(tree, { maxTotalBytes: 32 });
	const events = new DocumentEvents(tree);
	const run: Parameters<UploadTransfers["attach"]>[2] = (action, signal) =>
		runEventActionAsync(events, action, signal);
	return { owner, run, tree };
}

it.each(["new", "retained"])(
	"does not revive a closed manager during %s document activation",
	(kind) => {
		const manager = new UploadTransfers();
		managers.push(manager);
		const first = documentOwner();
		const next = documentOwner();
		manager.attach("default", first.owner, first.run);
		if (kind === "retained") {
			manager.attach("default", next.owner, next.run);
			manager.attach("default", first.owner, first.run);
		}
		first.owner.onInvalidate(() => manager.close());
		expect
			.soft(() => manager.attach("default", next.owner, next.run))
			.toThrow(/closed/);
		expect(manager.metrics()).toMatchObject({
			closed: true,
			sessions: 0,
			documents: 0,
			selectedReservationBytes: 0,
			stagedBytes: 0,
			residentReservationBytes: 0,
		});
		if (kind === "new") {
			expect(next.owner.metrics().closed).toBe(false);
			const subscriptions = Array.from({ length: 16 }, () =>
				next.owner.onInvalidate(() => {}),
			);
			for (const unsubscribe of subscriptions) unsubscribe();
		} else expect(next.owner.metrics().closed).toBe(true);
	},
);

it("keeps the previous binding when the retained target closes during activation", () => {
	const manager = new UploadTransfers();
	managers.push(manager);
	const first = documentOwner();
	const next = documentOwner();
	const input = first.tree.createElement("input", { type: "file" });
	first.tree.append(first.tree.root, input);
	const reference = first.tree.reference(input);
	manager.attach("default", first.owner, first.run);
	manager.attach("default", next.owner, next.run);
	manager.attach("default", first.owner, first.run);
	first.owner.onInvalidate(() => next.owner.close());
	expect
		.soft(() => manager.attach("default", next.owner, next.run))
		.toThrow(/closed/);
	expect(next.owner.metrics().closed).toBe(true);
	expect(first.owner.metrics().closed).toBe(false);
	expect(manager.metrics()).toMatchObject({
		closed: false,
		sessions: 1,
		documents: 1,
		selectedReservationBytes: 32,
	});
	expect(manager.capture("default", reference).documentId).toBe(
		first.owner.documentId,
	);
});

it("does not restore a session reservation after begin is invalidated before acknowledgement", async () => {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
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
				requests: 0,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument('<input id="file" type="file">', response.url),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		uploadSessionLimits: { maxTransfers: 1, maxStagedBytes: 1 },
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/upload"]);
	const capture = async () =>
		(await host.execute(["upload-target", "#file"])).data as {
			target: FileSelectionTarget;
		};
	const begin = (target: FileSelectionTarget) =>
		host.execute([
			"upload-begin",
			JSON.stringify({ target, files: [{ name: "file", bytes: 1 }] }),
		]);
	const { target } = await capture();
	const page = session.page(session.tabs()[0].id);
	const owner = documentFiles(page.document);
	let stagedBeforeClear = 0;
	const pending = begin(target);
	queueMicrotask(() => {
		stagedBeforeClear = host.metrics().uploads.stagedBytes;
		owner.clear(target.reference);
	});
	await expect.soft(pending).rejects.toMatchObject({ code: "stale-reference" });
	expect(stagedBeforeClear).toBe(1);
	expect(host.metrics().uploads).toMatchObject({
		transfers: 0,
		stagedBytes: 0,
	});
	await expect(begin((await capture()).target)).resolves.toMatchObject({
		command: "upload-begin",
	});
});
