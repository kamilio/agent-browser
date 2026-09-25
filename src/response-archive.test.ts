import { expect, it } from "vitest";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { ResponseArchive, responseArchiveLimits } from "./response-archive.js";

const request: NetworkRequest = { url: "https://fixture.invalid/page" };
function response(body = "page"): NetworkResponse {
	const bytes = new TextEncoder().encode(body);
	return {
		url: request.url,
		status: 200,
		headers: { "content-type": ["text/html"] },
		body: bytes,
		redirects: [],
		encodedBytes: bytes.length,
		elapsedMs: 1.5,
	};
}
function fixture() {
	const archive = new ResponseArchive();
	archive.record(request, response());
	return archive;
}
function errorCode(action: () => unknown, code: string) {
	expect(action).toThrowError(expect.objectContaining({ code }));
}
type StoredEntry = {
	request: Record<string, unknown>;
	response: Record<string, unknown>;
};
function alter(
	action: (entry: StoredEntry, root: Record<string, unknown>) => void,
) {
	const root = JSON.parse(fixture().serialize());
	action(root.entries[0], root);
	return JSON.stringify(root);
}

it("round trips exact response bytes, metadata and redirects without a network port", () => {
	const archive = new ResponseArchive();
	const input = response();
	input.body = new Uint8Array([0, 128, 255, 10]);
	input.redirects = [{ url: request.url, status: 302, location: "/final" }];
	input.url = "https://fixture.invalid/final";
	input.routeId = 7;
	archive.record(request, input);
	const replay = ResponseArchive.parse(archive.serialize());
	expect(replay.take(request)).toEqual(input);
	expect(replay.metrics()).toMatchObject({
		entries: 1,
		remaining: 0,
		reads: 1,
		closed: false,
	});
	errorCode(() => replay.take(request), "not-found");
});

it("normalizes URL, method and header name/order but preserves header values", () => {
	const archive = new ResponseArchive();
	archive.record(
		{
			url: "https://FIXTURE.invalid:443/page",
			method: "get",
			headers: { Zebra: "z", ACCEPT: "a" },
		},
		response(),
	);
	errorCode(
		() => archive.take({ ...request, headers: { accept: "A", zebra: "z" } }),
		"not-found",
	);
	expect(
		archive.take({ ...request, headers: { accept: "a", zebra: "z" } }).status,
	).toBe(200);
});

it("consumes repeated matching responses in record-call order independently of other keys", () => {
	const archive = new ResponseArchive();
	archive.record(request, response("first"));
	archive.record({ url: `${request.url}?other` }, response("other"));
	archive.record(request, response("second"));
	expect(
		new TextDecoder().decode(
			archive.take({ url: `${request.url}?other` }).body,
		),
	).toBe("other");
	expect(new TextDecoder().decode(archive.take(request).body)).toBe("first");
	expect(new TextDecoder().decode(archive.take(request).body)).toBe("second");
});

it.each(["text", "bytes"])(
	"round trips %s request bodies including non-ASCII and BOM",
	(kind) => {
		const archive = new ResponseArchive();
		const source = "\ufeffhéllo\0";
		const input: NetworkRequest = {
			...request,
			method: "POST",
			body: kind === "text" ? source : new TextEncoder().encode(source),
		};
		archive.record(input, response());
		const replay = ResponseArchive.parse(archive.serialize());
		errorCode(() => replay.take({ ...input, body: "different" }), "not-found");
		expect(replay.take(input).status).toBe(200);
	},
);

it("distinguishes text/bytes and absent/empty bodies", () => {
	const archive = new ResponseArchive();
	const post = { ...request, method: "POST" };
	archive.record({ ...post, body: "" }, response());
	errorCode(() => archive.take(post), "not-found");
	errorCode(
		() => archive.take({ ...post, body: new Uint8Array() }),
		"not-found",
	);
	expect(archive.take({ ...post, body: "" }).status).toBe(200);
});

it("matches explicit cookie context without claiming cookie-jar replay", () => {
	const archive = new ResponseArchive();
	const input: NetworkRequest = {
		...request,
		cookieContext: {
			siteUrl: null,
			credentials: "include",
			topLevelNavigation: true,
		},
	};
	archive.record(input, {
		...response(),
		headers: { "set-cookie": ["example=1; Secure"] },
	});
	const replay = ResponseArchive.parse(archive.serialize());
	errorCode(() => replay.take(request), "not-found");
	errorCode(
		() =>
			replay.take({
				...input,
				cookieContext: {
					siteUrl: null,
					topLevelNavigation: true,
					credentials: "omit",
				},
			}),
		"not-found",
	);
	expect(replay.take(input).headers["set-cookie"]).toEqual([
		"example=1; Secure",
	]);
});

it("matches redirect policy and URL query exactly", () => {
	const archive = fixture();
	errorCode(
		() => archive.take({ ...request, redirect: "manual" }),
		"not-found",
	);
	errorCode(() => archive.take({ url: `${request.url}?next=1` }), "not-found");
	expect(archive.take({ ...request, redirect: "follow" }).status).toBe(200);
});

it("copies both input and output and does not export consumption cursors", () => {
	const archive = new ResponseArchive();
	const input = response();
	archive.record(request, input);
	input.body.fill(0);
	(input.headers["content-type"] as string[])[0] = "changed";
	const serialized = archive.serialize();
	const output = archive.take(request);
	output.body.fill(255);
	(output.headers["content-type"] as string[])[0] = "changed-again";
	expect(archive.serialize()).toBe(serialized);
	expect(ResponseArchive.parse(serialized).take(request)).toEqual(response());
});

it("rejects an already aborted read without consuming it", () => {
	const archive = fixture();
	const controller = new AbortController();
	controller.abort();
	errorCode(
		() => archive.take({ ...request, signal: controller.signal }),
		"aborted",
	);
	expect(archive.metrics().remaining).toBe(1);
	expect(
		archive.take({ ...request, signal: new AbortController().signal }).status,
	).toBe(200);
});

it("closes idempotently and drops retained data", () => {
	const archive = fixture();
	archive.close();
	archive.close();
	expect(archive.metrics()).toEqual({
		entries: 0,
		remaining: 0,
		reads: 0,
		retainedUnits: 0,
		closed: true,
	});
	errorCode(() => archive.take(request), "closed");
	errorCode(() => archive.record(request, response()), "closed");
	errorCode(() => archive.serialize(), "closed");
});

it("rejects overflowing entries atomically", () => {
	const archive = new ResponseArchive({ maxEntries: 1 });
	archive.record(request, response());
	const before = archive.serialize();
	errorCode(() => archive.record(request, response("next")), "resource-limit");
	expect(archive.serialize()).toBe(before);
});

it.each(["request", "response"])(
	"bounds %s bytes before retaining an entry",
	(side) => {
		const archive = new ResponseArchive({ maxBodyBytes: 2 });
		errorCode(
			() =>
				archive.record(
					side === "request"
						? { ...request, method: "POST", body: "€" }
						: request,
					response(side === "response" ? "€" : "a"),
				),
			"resource-limit",
		);
		expect(archive.metrics().entries).toBe(0);
	},
);

it("bounds aggregate bytes and metadata atomically", () => {
	const first = fixture();
	const archive = new ResponseArchive({
		maxTotalUnits: first.metrics().retainedUnits,
	});
	archive.record(request, response());
	errorCode(() => archive.record(request, response()), "resource-limit");
	expect(archive.metrics().entries).toBe(1);
});

it("bounds metadata and serialized input/output", () => {
	errorCode(
		() =>
			new ResponseArchive({ maxMetadataChars: 5 }).record(request, response()),
		"resource-limit",
	);
	const archive = new ResponseArchive({ maxSerializedChars: 5 });
	errorCode(() => archive.serialize(), "resource-limit");
	errorCode(
		() => ResponseArchive.parse(" ".repeat(6), { maxSerializedChars: 5 }),
		"resource-limit",
	);
});

it.each([
	0,
	-1,
	Number.NaN,
	Number.POSITIVE_INFINITY,
	1.5,
	responseArchiveLimits.maxEntries + 1,
])("rejects invalid or raised limits: %s", (value) => {
	errorCode(() => new ResponseArchive({ maxEntries: value }), "invalid-input");
});

it("rejects unknown limits and getters without invoking them", () => {
	let invoked = false;
	errorCode(
		() => new ResponseArchive({ unknown: 1 } as never),
		"invalid-input",
	);
	errorCode(
		() =>
			new ResponseArchive({
				get maxEntries() {
					invoked = true;
					return 1;
				},
			}),
		"invalid-input",
	);
	expect(invoked).toBe(false);
});

it.each([
	(entry: StoredEntry) => {
		entry.response.body = "0";
	},
	(entry: StoredEntry) => {
		entry.response.body = "FF";
	},
	(entry: StoredEntry) => {
		entry.response.status = 600;
	},
	(entry: StoredEntry) => {
		entry.response.elapsedMs = -1;
	},
	(entry: StoredEntry) => {
		entry.response.encodedBytes = 1.2;
	},
	(entry: StoredEntry) => {
		entry.response.extra = true;
	},
	(entry: StoredEntry) => {
		Reflect.deleteProperty(entry.request, "url");
	},
	(entry: StoredEntry) => {
		entry.request.method = null;
	},
	(entry: StoredEntry) => {
		entry.request.headers = null;
	},
	(entry: StoredEntry) => {
		entry.request.bodyKind = {};
	},
	(entry: StoredEntry) => {
		entry.request.body = "00";
	},
	(entry: StoredEntry) => {
		entry.request.bodyKind = "text";
		entry.request.body = "ff";
	},
	(entry: StoredEntry) => {
		entry.response.headers = { location: "not-an-array" };
	},
	(entry: StoredEntry) => {
		entry.response.redirects = [
			{ url: request.url, status: 200, location: "/" },
		];
	},
	(_entry: StoredEntry, root: Record<string, unknown>) => {
		root.version = 2;
	},
	(_entry: StoredEntry, root: Record<string, unknown>) => {
		root.format = "something-else";
	},
	(_entry: StoredEntry, root: Record<string, unknown>) => {
		root.entries = {};
	},
])("rejects malformed stored data %#", (change) => {
	errorCode(() => ResponseArchive.parse(alter(change)), "invalid-input");
});

it.each(["not-json", "null", "[]", "{}"])(
	"rejects malformed archive root %s",
	(source) => {
		errorCode(() => ResponseArchive.parse(source), "invalid-input");
	},
);

it("applies lower limits when importing an otherwise valid archive", () => {
	const archive = fixture();
	archive.record(request, response());
	errorCode(
		() => ResponseArchive.parse(archive.serialize(), { maxEntries: 1 }),
		"resource-limit",
	);
	errorCode(
		() => ResponseArchive.parse(archive.serialize(), { maxBodyBytes: 1 }),
		"resource-limit",
	);
});

it("rejects duplicate-case, line-breaking or invalid headers", () => {
	const cases: Record<string, string>[] = [
		{ Accept: "a", accept: "b" },
		{ accept: "a\r\nb" },
		{ "bad name": "value" },
	];
	for (const headers of cases)
		errorCode(
			() => new ResponseArchive().record({ ...request, headers }, response()),
			"invalid-input",
		);
});

it("does not include private URLs or bodies in a missing-match error", () => {
	const archive = fixture();
	try {
		archive.take({ url: "https://fixture.invalid/?token=private-value" });
	} catch (error) {
		expect(String(error)).not.toContain("private-value");
	}
});

it("handles prototype-looking header names as ordinary own data", () => {
	const archive = new ResponseArchive();
	const input = {
		...request,
		headers: JSON.parse('{"__proto__":"safe","constructor":"also-safe"}'),
	};
	archive.record(input, response());
	expect(ResponseArchive.parse(archive.serialize()).take(input).status).toBe(
		200,
	);
	expect(Object.prototype).not.toHaveProperty("safe");
});

it("bounds nesting and structure before JSON.parse allocations", () => {
	errorCode(
		() => ResponseArchive.parse(`${"[".repeat(9)}0${"]".repeat(9)}`),
		"resource-limit",
	);
	errorCode(
		() => ResponseArchive.parse("[0,0,0,0]", { maxStructuralTokens: 3 }),
		"resource-limit",
	);
});

it("accounts aggregate structure atomically on record and import", () => {
	const source = fixture().serialize();
	const tokens = [...source.replace(/"(?:[^"\\]|\\.)*"/g, '""')].filter(
		(value) => "{}[],:".includes(value),
	).length;
	const archive = new ResponseArchive({ maxStructuralTokens: tokens });
	archive.record(request, response());
	expect(archive.serialize()).toBe(source);
	errorCode(() => archive.record(request, response()), "resource-limit");
	expect(archive.metrics().entries).toBe(1);
	errorCode(
		() => ResponseArchive.parse(source, { maxStructuralTokens: tokens - 1 }),
		"resource-limit",
	);
	expect(
		ResponseArchive.parse(source, { maxStructuralTokens: tokens }).metrics()
			.entries,
	).toBe(1);
});

it("does not confuse quoted punctuation, escape characters or Unicode with structure", () => {
	const archive = new ResponseArchive();
	const input = response();
	input.headers = { unusual: ['"\\{}[],:é'] };
	archive.record(request, input);
	expect(ResponseArchive.parse(archive.serialize()).take(request)).toEqual(
		input,
	);
});

it.each([new Uint8Array([0]), "a"])("rejects GET request bodies %#", (body) => {
	errorCode(
		() => new ResponseArchive().record({ ...request, body }, response()),
		"invalid-input",
	);
});

it("rejects invalid signals, response bodies and cookie contexts without retaining partial data", () => {
	const archive = new ResponseArchive();
	errorCode(
		() => archive.record({ ...request, signal: {} as AbortSignal }, response()),
		"invalid-input",
	);
	errorCode(
		() =>
			archive.record(request, {
				...response(),
				body: [] as unknown as Uint8Array,
			}),
		"invalid-input",
	);
	errorCode(
		() =>
			archive.record(
				{
					...request,
					cookieContext: { siteUrl: null, credentials: "invalid" as "omit" },
				},
				response(),
			),
		"invalid-input",
	);
	expect(archive.metrics().entries).toBe(0);
});

it("allows new entries after consuming a queue without rewinding it", () => {
	const archive = fixture();
	archive.take(request);
	archive.record(request, response("next"));
	expect(new TextDecoder().decode(archive.take(request).body)).toBe("next");
	expect(archive.metrics()).toMatchObject({
		entries: 2,
		reads: 2,
		remaining: 0,
	});
});

it("bounds header cardinality and redirect count", () => {
	const archive = new ResponseArchive();
	errorCode(
		() =>
			archive.record(request, {
				...response(),
				headers: { accept: Array(257).fill("") },
			}),
		"resource-limit",
	);
	errorCode(
		() =>
			archive.record(
				{
					...request,
					headers: Object.fromEntries(
						Array.from({ length: 257 }, (_, index) => [`header-${index}`, ""]),
					),
				},
				response(),
			),
		"resource-limit",
	);
	errorCode(
		() =>
			archive.record(request, {
				...response(),
				redirects: Array(33).fill({
					url: request.url,
					status: 302,
					location: "/next",
				}),
			}),
		"resource-limit",
	);
	expect(archive.metrics().entries).toBe(0);
});

it("does not expose captured content through ordinary object serialization", () => {
	const archive = new ResponseArchive();
	archive.record(
		{ url: "https://fixture.invalid/?token=private-value" },
		response("private-body"),
	);
	expect(JSON.stringify(archive)).not.toContain("private-value");
	expect(JSON.stringify(archive)).not.toContain("private-body");
	expect(Object.keys(archive)).not.toContain("entries");
	expect(Object.keys(archive)).not.toContain("queues");
	expect(archive.serialize()).toContain("private-value");
});
