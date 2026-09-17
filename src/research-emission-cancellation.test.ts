import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import {
	researchLongAdmissionProvenance,
	serializeResearchReport,
} from "../scripts/research-admission-evidence.js";
import {
	type ResearchNavigationReport,
	emitResearchReport,
	researchBatch,
} from "../scripts/research-browser.js";
import { NodeNetworkTransport } from "./node-transport.js";
import type { ResearchDocumentProfileId } from "./research-admission.js";

const outputs: Writable[] = [];
const cleanupCallbacks: (() => void)[] = [];

function report(profile?: ResearchDocumentProfileId): ResearchNavigationReport {
	return {
		requestedUrl: "https://emission.fixture.invalid/document",
		finalUrl: null,
		startedAt: "2026-09-17T00:00:00.000Z",
		finishedAt: "2026-09-17T00:00:00.000Z",
		elapsedMs: 0,
		profile: profile === "long-v1" ? "native-semantic-reader-v1" : "native",
		partial: true,
		contentSuccess: false,
		classification: {
			classifier: "browser-challenges",
			barrier: null,
			diagnostic: null,
		},
		primaryResponse: null,
		outcome: "failure",
		failure: { category: "network-error", stage: "request" },
		...(profile === "long-v1"
			? { admission: researchLongAdmissionProvenance }
			: {}),
	};
}

function heldOutput() {
	let acknowledge: ((error?: Error | null) => void) | undefined;
	let acknowledged = false;
	let began: (() => void) | undefined;
	const writing = new Promise<void>((resolve) => {
		began = resolve;
	});
	const chunks: Buffer[] = [];
	const output = new Writable({
		highWaterMark: 1,
		autoDestroy: false,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			acknowledge = callback;
			began?.();
		},
	});
	outputs.push(output);
	const complete = (error?: Error) => {
		if (!acknowledged && acknowledge) {
			acknowledged = true;
			acknowledge(error);
		}
	};
	cleanupCallbacks.push(() => complete());
	return { output, chunks, writing, acknowledge: complete };
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const output of outputs) output.on("error", () => undefined);
	for (const cleanup of cleanupCallbacks.splice(0)) cleanup();
	for (const output of outputs.splice(0)) output.destroy();
});

it.each([undefined, "default", "long-v1"] as const)(
	"preserves serialized bytes and exit state with profile %s",
	async (profile) => {
		const input = report(profile);
		const before = JSON.stringify(input);
		const expected = serializeResearchReport(input, profile);
		const target = heldOutput();
		let resolved = false;
		const pending = emitResearchReport(target.output, input, profile).then(
			(result) => {
				resolved = true;
				return result;
			},
		);
		await target.writing;
		expect(resolved).toBe(false);
		expect(target.output.writableNeedDrain).toBe(true);
		expect(target.chunks).toEqual([Buffer.from(expected.jsonl)]);
		target.acknowledge();
		await expect(pending).resolves.toEqual(expected.exitReport);
		expect(JSON.stringify(input)).toBe(before);
		expect(target.output.destroyed).toBe(false);
		expect(target.output.writableEnded).toBe(false);
		expect(target.output.listenerCount("error")).toBe(0);
	},
);

it.each([undefined, "default", "long-v1"] as const)(
	"rejects pre-aborted emission without a write with profile %s",
	async (profile) => {
		const target = heldOutput();
		const controller = new AbortController();
		controller.abort(new Error("private reason"));
		await expect(
			emitResearchReport(
				target.output,
				report(profile),
				profile,
				controller.signal,
			),
		).rejects.toMatchObject({
			code: "aborted",
			message: "Research output was cancelled",
		});
		expect(target.chunks).toEqual([]);
		expect(target.output.listenerCount("error")).toBe(0);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
	},
);

it.each([undefined, "default", "long-v1"] as const)(
	"cancels an outstanding emission and protects its late error with profile %s",
	async (profile) => {
		const target = heldOutput();
		const controller = new AbortController();
		const pending = emitResearchReport(
			target.output,
			report(profile),
			profile,
			controller.signal,
		);
		const rejected = expect(pending).rejects.toMatchObject({
			code: "aborted",
			message: "Research output was cancelled",
		});
		await target.writing;
		controller.abort("private cancellation");
		await rejected;
		expect(target.output.listenerCount("error")).toBe(1);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		target.acknowledge(new Error("private late write"));
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(target.output.listenerCount("error")).toBe(0);
		expect(target.output.listenerCount("close")).toBe(0);
		expect(target.output.destroyed).toBe(false);
	},
);

it("cancels while waiting only for drain and does not return a successful exit state", async () => {
	const target = heldOutput();
	vi.spyOn(target.output, "write").mockImplementation(((
		_chunk: unknown,
		callback: () => void,
	) => {
		callback();
		return false;
	}) as typeof target.output.write);
	const controller = new AbortController();
	const pending = emitResearchReport(
		target.output,
		report(),
		undefined,
		controller.signal,
	);
	const rejected = expect(pending).rejects.toMatchObject({ code: "aborted" });
	controller.abort();
	await rejected;
	expect(target.output.listenerCount("error")).toBe(0);
	expect(target.output.listenerCount("drain")).toBe(0);
});

it("stops a native batch before its second URL when the first output is cancelled", async () => {
	const urls = [
		"https://emission.fixture.invalid/first",
		"https://emission.fixture.invalid/second",
	];
	const calls: string[] = [];
	const routed = NodeNetworkTransport.prototype.requestWithRoutes;
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockImplementation(
		function (this: NodeNetworkTransport, input) {
			calls.push(input.url);
			return routed.call(this, input, () => ({
				url: input.url,
				status: 200,
				headers: { "content-type": ["text/html; charset=utf-8"] },
				body: Buffer.from(
					"<main><h1>Owned source</h1><p>Only the first fixture response is supplied.</p></main>",
				),
				encodedBytes: 0,
				redirects: [],
				elapsedMs: 0,
			}));
		},
	);
	const controller = new AbortController();
	const target = heldOutput();
	const states: unknown[] = [];
	const operation = (async () => {
		for await (const item of researchBatch(
			["--reader", ...urls],
			controller.signal,
		)) {
			expect(item.metrics).toMatchObject({
				closed: true,
				active: 0,
				mockedRequests: 1,
			});
			states.push(
				await emitResearchReport(
					target.output,
					item,
					undefined,
					controller.signal,
				),
			);
		}
	})();
	const rejected = expect(operation).rejects.toMatchObject({ code: "aborted" });
	await target.writing;
	controller.abort();
	await rejected;
	target.acknowledge();
	expect(calls).toEqual([urls[0]]);
	expect(states).toEqual([]);
	expect(target.output.listenerCount("error")).toBe(0);
});
