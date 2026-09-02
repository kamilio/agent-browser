import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import { NetworkJournal } from "./network-journal.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageFetch, type PageFetchTransport } from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanup.splice(0)) close();
});

function response(
	input: NetworkRequest,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: { "access-control-allow-origin": ["https://example.com"] },
		body: new Uint8Array(),
		encodedBytes: 0,
		elapsedMs: 0,
		redirects: [],
		...overrides,
	};
}

function fixture(
	handler: PageFetchTransport = async (input) => response(input),
	options: ConstructorParameters<typeof PageFetch>[3] = {},
) {
	const tree = new DocumentTree("https://example.com/page");
	const journal = new NetworkJournal();
	const requests: NetworkRequest[] = [];
	const transports: Promise<NetworkResponse>[] = [];
	const owner = new PageFetch(
		tree,
		{
			createHostObject(definition: ScriptHostObjectDefinition) {
				const object = { ...definition.methods };
				for (const [name, descriptor] of Object.entries(
					definition.properties ?? {},
				))
					Object.defineProperty(object, name, descriptor);
				return object;
			},
		},
		(input, context) => {
			const transport = journal.run(
				context?.preflight ? "preflight" : "fetch",
				input.url,
				input.method ?? "GET",
				async () => {
					requests.push(input);
					return handler(input, context);
				},
				context?.observeCorsResult,
			);
			transports.push(transport);
			return transport;
		},
		options,
	);
	cleanup.push(() => {
		owner.close();
		tree.close();
		journal.close();
	});
	return { owner, journal, requests, transports };
}

it("records CORS denial separately from a completed HTTP response without leaking headers", async () => {
	const { owner, journal } = fixture(async (input) =>
		response(input, {
			headers: {
				"access-control-allow-origin": ["https://secret.invalid"],
				"set-cookie": ["secret=value"],
			},
		}),
	);
	await expect(
		owner.fetch("https://other.example/data?secret=value"),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(journal.detail(0)).toMatchObject({
		state: "complete",
		status: 200,
		cors: "blocked",
	});
	expect(JSON.stringify(journal.snapshot())).not.toContain("secret");
});

it("records a rejected HTTP-successful preflight without inventing the unsent actual request", async () => {
	const { owner, journal, requests } = fixture(async (input) =>
		response(input, { status: 204 }),
	);
	await expect(
		owner.fetch("https://other.example/data", { method: "DELETE" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(requests.map((request) => request.method)).toEqual(["OPTIONS"]);
	expect(journal.snapshot().entries).toMatchObject([
		{ kind: "preflight", state: "complete", status: 204, cors: "blocked" },
	]);
});

it("records preflight and actual CORS decisions independently", async () => {
	const { owner, journal } = fixture(async (input) =>
		response(input, {
			headers:
				input.method === "OPTIONS"
					? {
							"access-control-allow-origin": ["https://example.com"],
							"access-control-allow-methods": ["DELETE"],
						}
					: {},
		}),
	);
	await expect(
		owner.fetch("https://other.example/data", { method: "DELETE" }),
	).rejects.toMatchObject({ code: "policy-denied" });
	expect(journal.snapshot().entries).toMatchObject([
		{ kind: "preflight", cors: "allowed" },
		{ kind: "fetch", cors: "blocked" },
	]);
});

it("records allowed redirect hops independently and does not annotate same-origin responses", async () => {
	const { owner, journal } = fixture(async (input) =>
		response(
			input,
			input.url.endsWith("/redirect")
				? {
						status: 302,
						headers: {
							"access-control-allow-origin": ["https://example.com"],
							location: ["/final"],
						},
					}
				: {},
		),
	);
	await owner.fetch("https://other.example/redirect");
	await owner.fetch("/local");
	expect(journal.snapshot().entries.map((entry) => entry.cors)).toEqual([
		"allowed",
		"allowed",
		undefined,
	]);
});

it("does not label transport or body-limit failures as CORS rejection", async () => {
	const failed = fixture(async () => {
		throw new Error("private failure");
	});
	await expect(
		failed.owner.fetch("https://other.example/data"),
	).rejects.toThrow("private failure");
	expect(failed.journal.detail(0)).toMatchObject({
		state: "failed",
		cors: "not-checked",
	});
	const oversized = fixture(
		async (input) => response(input, { body: new Uint8Array(2) }),
		{ limits: { maxResponseBytes: 1 } },
	);
	await expect(
		oversized.owner.fetch("https://other.example/data"),
	).rejects.toMatchObject({ code: "resource-limit" });
	expect(oversized.journal.detail(0)).toMatchObject({
		state: "complete",
		cors: "not-checked",
	});
});

it("settles CORS diagnostics on owner cancellation and ignores late transport completion", async () => {
	let resolve!: (response: NetworkResponse) => void;
	let started!: () => void;
	const ready = new Promise<void>((done) => {
		started = done;
	});
	const { owner, journal, requests, transports } = fixture(async () => {
		started();
		return new Promise((done) => {
			resolve = done;
		});
	});
	const pending = owner.fetch("https://other.example/data");
	const rejected = expect(pending).rejects.toMatchObject({ code: "closed" });
	await ready;
	expect(journal.detail(0)).toMatchObject({
		state: "pending",
		cors: "pending",
	});
	owner.close();
	await rejected;
	expect(journal.detail(0).cors).toBe("not-checked");
	resolve(response(requests[0]));
	await transports[0];
	expect(journal.detail(0)).toMatchObject({
		state: "complete",
		cors: "not-checked",
	});
});

it("does not let a failing diagnostic observer alter CORS enforcement or a successful fetch", async () => {
	for (const allowed of [true, false]) {
		const tree = new DocumentTree("https://example.com/page");
		const owner = new PageFetch(
			tree,
			{
				createHostObject: (definition) =>
					Object.defineProperties(
						{ ...definition.methods },
						definition.properties ?? {},
					),
			},
			async (input, context) => {
				context?.observeCorsResult?.(() => {
					throw new Error("observer failed");
				});
				return response(input, {
					headers: allowed
						? { "access-control-allow-origin": ["https://example.com"] }
						: {},
				});
			},
		);
		cleanup.push(() => {
			owner.close();
			tree.close();
		});
		if (allowed)
			await expect(
				owner.fetch("https://other.example/data"),
			).resolves.toHaveProperty("status", 200);
		else
			await expect(
				owner.fetch("https://other.example/data"),
			).rejects.toMatchObject({ code: "policy-denied" });
	}
});

it("does not expose CORS diagnostic registration through guest fetch options", async () => {
	const { owner, requests, journal } = fixture();
	await expect(
		owner.fetch("https://other.example/data", { observeCorsResult: () => {} }),
	).rejects.toMatchObject({ code: "unsupported" });
	expect(requests).toHaveLength(0);
	expect(journal.snapshot().entries).toHaveLength(0);
});
