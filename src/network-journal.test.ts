import { expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkCorsResult,
	NetworkJournal,
	diagnosticUrl,
} from "./network-journal.js";
import type { NetworkResponse } from "./network.js";

function response(overrides: Partial<NetworkResponse> = {}): NetworkResponse {
	return {
		url: "https://example.com/final?token=secret#hidden",
		status: 200,
		headers: { "set-cookie": ["secret"] },
		body: new Uint8Array([1, 2]),
		redirects: [],
		encodedBytes: 1,
		elapsedMs: 3,
		...overrides,
	};
}

it("redacts credentials, queries and fragments, bounds URLs and rejects non-http data", () => {
	expect(
		diagnosticUrl("https://user:secret@example.com/path?secret=value#hidden"),
	).toBe("https://example.com/path?redacted");
	expect(diagnosticUrl("data:text/plain,secret")).toBe("[unavailable]");
	expect(diagnosticUrl("not a URL secret")).toBe("[unavailable]");
	expect(diagnosticUrl(`https://example.com/${"a".repeat(4000)}`)).toHaveLength(
		2048,
	);
});

it("associates one-shot CORS results with exact request records rather than URLs", async () => {
	const journal = new NetworkJournal();
	const reporters: ((result: NetworkCorsResult) => void)[] = [];
	for (let index = 0; index < 2; index++)
		await journal.run(
			"fetch",
			"https://example.com/",
			"GET",
			async () => response(),
			(report) => {
				reporters.push(report);
			},
		);
	expect(journal.snapshot().entries.map((entry) => entry.cors)).toEqual([
		"pending",
		"pending",
	]);
	reporters[1]("blocked");
	reporters[0]("allowed");
	reporters[1]("allowed");
	expect(journal.snapshot().entries.map((entry) => entry.cors)).toEqual([
		"allowed",
		"blocked",
	]);
	expect(journal.snapshot().retainedBytes).toBe(
		journal
			.snapshot()
			.entries.reduce(
				(bytes, entry) =>
					bytes + new TextEncoder().encode(JSON.stringify(entry)).byteLength,
				0,
			),
	);
});

it("preserves a reported CORS result across transport settlement and rejects invalid diagnostic values", async () => {
	const journal = new NetworkJournal();
	await journal.run(
		"fetch",
		"https://example.com/",
		"GET",
		async () => response(),
		(report) => {
			report("secret" as NetworkCorsResult);
			report("not-checked");
		},
	);
	expect(journal.detail(0)).toMatchObject({
		state: "complete",
		cors: "not-checked",
	});
});

it("does not resurrect evicted or closed entries when CORS validation finishes", async () => {
	const journal = new NetworkJournal({ maxEntries: 1 });
	const reporters: ((result: NetworkCorsResult) => void)[] = [];
	for (let index = 0; index < 2; index++)
		await journal.run(
			"fetch",
			"https://example.com/",
			"GET",
			async () => response(),
			(report) => {
				reporters.push(report);
			},
		);
	const retained = journal.snapshot();
	reporters[0]("blocked");
	expect(journal.snapshot()).toEqual(retained);
	journal.close();
	reporters[1]("allowed");
	expect(journal.snapshot()).toMatchObject({
		entries: [],
		retainedBytes: 0,
		closed: true,
	});
});

it("enforces byte retention when a CORS result expands an entry", async () => {
	const url = `https://example.com/${"path".repeat(25)}`;
	const operation = async () => response({ url });
	const now = () => 0;
	const sample = new NetworkJournal({ now });
	await sample.run("fetch", url, "GET", operation, () => {});
	const journal = new NetworkJournal({
		now,
		maxBytes: sample.snapshot().retainedBytes,
	});
	let report!: (result: NetworkCorsResult) => void;
	await journal.run("fetch", url, "GET", operation, (callback) => {
		report = callback;
	});
	expect(journal.snapshot().entries).toHaveLength(1);
	report("not-checked");
	expect(journal.snapshot()).toMatchObject({
		entries: [],
		retainedBytes: 0,
		dropped: 1,
	});
});

it("does not let failed diagnostic registration interrupt the request", async () => {
	const journal = new NetworkJournal();
	await journal.run(
		"fetch",
		"https://example.com/",
		"GET",
		async () => response(),
		() => {
			throw new Error("observer failed");
		},
	);
	expect(journal.detail(0)).toMatchObject({
		state: "complete",
		cors: "not-checked",
	});
});

it("records pending requests without retaining or exposing headers and bodies", async () => {
	let now = 10;
	const journal = new NetworkJournal({ now: () => now });
	let resolve!: (value: NetworkResponse) => void;
	const result = response();
	const task = journal.run(
		"document",
		"https://example.com/?secret",
		"GET",
		() =>
			new Promise<NetworkResponse>((done) => {
				resolve = done;
			}),
	);
	expect(journal.snapshot().entries[0]).toMatchObject({
		index: 0,
		state: "pending",
		method: "GET",
	});
	now = 25;
	resolve(result);
	expect(await task).toBe(result);
	expect(journal.detail(0)).toMatchObject({
		state: "complete",
		status: 200,
		elapsedMs: 15,
		encodedBytes: 1,
		decodedBytes: 2,
		finalUrl: "https://example.com/final?redacted",
	});
	expect(JSON.stringify(journal.snapshot())).not.toMatch(
		/secret|set-cookie|headers|body/,
	);
});

it("records policy errors without leaking messages and preserves the original rejection", async () => {
	const journal = new NetworkJournal();
	const error = new AgentBrowserError("policy-denied", "secret token");
	await expect(
		journal.run("script", "http://example.com/", "GET", () => {
			throw error;
		}),
	).rejects.toBe(error);
	expect(journal.detail(0)).toMatchObject({
		state: "blocked",
		error: "policy-denied",
	});
	await expect(
		journal.run("stylesheet", "https://example.com/", "GET", async () => {
			throw Error("secret");
		}),
	).rejects.toThrow("secret");
	expect(journal.detail(1)).toMatchObject({
		state: "failed",
		error: "network-error",
	});
	expect(JSON.stringify(journal.snapshot())).not.toContain("secret");
});

it("keeps HTTP error responses as complete and bounds redirect metadata", async () => {
	const journal = new NetworkJournal();
	await journal.run("document", "https://example.com/", "POST", async () =>
		response({
			status: 503,
			redirects: Array.from({ length: 20 }, () => ({
				url: "https://user:secret@example.com/?secret",
				status: 302,
				location: "/next?secret#secret",
			})),
		}),
	);
	const entry = journal.detail(0);
	expect(entry).toMatchObject({
		state: "complete",
		status: 503,
		redirectCount: 20,
		redirectsTruncated: true,
	});
	expect(entry.redirects).toHaveLength(8);
	expect(entry.redirects?.[0]).toEqual({
		url: "https://example.com/?redacted",
		status: 302,
		location: "https://example.com/next?redacted",
	});
});

it("evicts oldest records and never reintroduces a late completion", async () => {
	const journal = new NetworkJournal({ maxEntries: 1 });
	let resolve!: (value: NetworkResponse) => void;
	const task = journal.run(
		"document",
		"https://example.com/old",
		"GET",
		() =>
			new Promise<NetworkResponse>((done) => {
				resolve = done;
			}),
	);
	await journal.run("script", "https://example.com/new", "GET", async () =>
		response(),
	);
	resolve(response());
	await task;
	expect(journal.snapshot()).toMatchObject({
		dropped: 1,
		entries: [{ index: 1 }],
	});
	expect(() => journal.detail(0)).toThrow("not retained");
});

it("enforces entry payload bytes even when completion expands a pending entry", async () => {
	const journal = new NetworkJournal({ maxBytes: 1024 });
	await journal.run("document", "https://example.com/", "GET", async () =>
		response({ url: `https://example.com/${"a".repeat(4000)}` }),
	);
	expect(journal.snapshot()).toMatchObject({
		entries: [],
		retainedBytes: 0,
		dropped: 1,
	});
});

it("returns detached copies and releases retained entries on close", async () => {
	const journal = new NetworkJournal();
	await journal.run("document", "https://example.com/", "GET", async () =>
		response(),
	);
	const entry = journal.detail(0);
	(entry as { url: string }).url = "changed";
	expect(journal.detail(0).url).toBe("https://example.com/");
	journal.close();
	expect(journal.snapshot()).toMatchObject({
		entries: [],
		retainedBytes: 0,
		closed: true,
	});
	await expect(
		journal.run("document", "https://example.com/", "GET", async () =>
			response(),
		),
	).resolves.toMatchObject({ status: 200 });
	expect(journal.snapshot().entries).toEqual([]);
});

it("validates retention limits and indices", () => {
	for (const options of [
		{ maxBytes: 0 },
		{ maxEntries: 0 },
		{ maxEntries: 129 },
		{ maxBytes: 262145 },
	])
		expect(() => new NetworkJournal(options)).toThrow(
			"Invalid network journal limits",
		);
	const journal = new NetworkJournal();
	for (const index of [-1, Number.NaN, 0.5, Number.POSITIVE_INFINITY])
		expect(() => journal.detail(index)).toThrow("Invalid request index");
});

it("does not resurrect a closed journal when pending requests complete", async () => {
	const journal = new NetworkJournal();
	let resolve!: (value: NetworkResponse) => void;
	const task = journal.run(
		"document",
		"https://example.com/",
		"GET",
		() =>
			new Promise<NetworkResponse>((done) => {
				resolve = done;
			}),
	);
	journal.close();
	resolve(response());
	await task;
	expect(journal.snapshot()).toMatchObject({
		entries: [],
		retainedBytes: 0,
		closed: true,
	});
});

it("keeps exact retained entry byte accounting and detached redirect details", async () => {
	const journal = new NetworkJournal({ maxEntries: 2 });
	for (let index = 0; index < 4; index++)
		await journal.run("document", "https://example.com/", "GET", async () =>
			response({
				redirects: [
					{ url: "https://example.com/", status: 302, location: "/next" },
				],
			}),
		);
	const snapshot = journal.snapshot();
	expect(snapshot.dropped).toBe(2);
	expect(snapshot.entries.map((entry) => entry.index)).toEqual([2, 3]);
	expect(snapshot.retainedBytes).toBe(
		snapshot.entries.reduce(
			(bytes, entry) =>
				bytes + new TextEncoder().encode(JSON.stringify(entry)).length,
			0,
		),
	);
	const entry = journal.detail(2);
	if (!entry.redirects?.[0]) throw Error("Missing redirect");
	entry.redirects[0].url = "changed";
	expect(journal.detail(2).redirects?.[0].url).toBe("https://example.com/");
});
