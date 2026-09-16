import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	extractResearchAssetLiterals,
	parseResearchAssetLiteralArguments,
	researchAssetLiteralLimits,
	runResearchAssetLiteralCli,
} from "../scripts/research-asset-literal.js";
import { AgentBrowserError } from "./errors.js";
import type { NetworkResponse } from "./network.js";
import { NodeNetworkTransport } from "./node-transport.js";

const transportCreated = vi.hoisted(() => vi.fn());

vi.mock("./node-transport.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("./node-transport.js")>();
	return {
		...original,
		NodeNetworkTransport: class extends original.NodeNetworkTransport {
			constructor(
				options?: ConstructorParameters<
					typeof original.NodeNetworkTransport
				>[0],
			) {
				super(options);
				transportCreated(options);
			}
		},
	};
});

const url = "https://asset-literals.fixture.invalid/pinned.mjs";
const rawMarker = "RAW_SOURCE_MUST_NOT_LEAK";
const literalMarker = "SELECTED_LITERAL_MUST_NOT_LEAK_ON_FAILURE";
const outputs: Writable[] = [];

function hash(body: Uint8Array): string {
	return createHash("sha256").update(body).digest("hex");
}

function fixture(sources = [`{ label: '${literalMarker}' }`]) {
	let source = "/* café */globalThis.__assetLiteralExecuted = true;\n";
	const ranges = sources.map((literal) => {
		const startByte = Buffer.byteLength(source);
		source += literal;
		const endByte = Buffer.byteLength(source);
		source += ";\n";
		return { startByte, endByte };
	});
	source += `throw new Error('${rawMarker}');`;
	const body = new TextEncoder().encode(source);
	return {
		url,
		contentType: "application/javascript; charset=utf-8",
		body,
		expectedSha256: hash(body),
		ranges,
	};
}

type Fixture = ReturnType<typeof fixture>;

function argumentsFor(input: Fixture): string[] {
	return [
		"--sha256",
		input.expectedSha256,
		...input.ranges.flatMap(({ startByte, endByte }) => [
			"--range",
			`${startByte}:${endByte}`,
		]),
		input.url,
	];
}

function expectedExtraction(input: Fixture, values: readonly unknown[]) {
	return {
		kind: "script-asset-literals-v1",
		partial: true,
		rendered: false,
		source: {
			url: input.url,
			contentType: input.contentType,
			decodedBytes: input.body.byteLength,
			sha256: hash(input.body),
		},
		literals: input.ranges.map((range, index) => ({
			...range,
			sha256: hash(input.body.subarray(range.startByte, range.endByte)),
			value: values[index],
		})),
	};
}

function deeplyFrozen(value: unknown): void {
	if (!value || typeof value !== "object") return;
	expect(Object.isFrozen(value)).toBe(true);
	for (const child of Object.values(value)) deeplyFrozen(child);
}

function enqueue(input: Fixture, overrides: Partial<NetworkResponse> = {}) {
	vi.mocked(NodeNetworkTransport.prototype.request).mockResolvedValueOnce({
		url: input.url,
		status: 200,
		headers: { "content-type": [input.contentType] },
		body: input.body,
		encodedBytes: input.body.byteLength,
		redirects: [],
		elapsedMs: 0,
		...overrides,
	});
}

function sink(held = false) {
	const chunks: Buffer[] = [];
	const callbacks: Array<(error?: Error | null) => void> = [];
	let markWriting!: () => void;
	const writing = new Promise<void>((resolve) => {
		markWriting = resolve;
	});
	const output = new Writable({
		highWaterMark: 1,
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk));
			callbacks.push(callback);
			markWriting();
			if (!held) callback();
		},
	});
	outputs.push(output);
	return {
		output,
		chunks,
		callbacks,
		writing,
		text: () => Buffer.concat(chunks).toString("utf8"),
	};
}

function listeners(output: Writable) {
	return {
		error: output.listeners("error"),
		close: output.listeners("close"),
		drain: output.listeners("drain"),
	};
}

function observe(operation: Promise<number>) {
	return operation.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
}

function streamTurn() {
	return new Promise<void>((resolve) => setImmediate(resolve));
}

function noTransport() {
	expect(transportCreated).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.request).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.close).not.toHaveBeenCalled();
	expect(NodeNetworkTransport.prototype.metrics).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
}

function closedOnce() {
	expect(transportCreated).toHaveBeenCalledTimes(1);
	expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledTimes(1);
	expect(NodeNetworkTransport.prototype.close).toHaveBeenCalledTimes(1);
	expect(NodeNetworkTransport.prototype.metrics).toHaveBeenCalledTimes(1);
	expect(
		vi.mocked(NodeNetworkTransport.prototype.metrics).mock.results[0].value,
	).toMatchObject({ active: 0, closed: true, redirects: 0 });
	expect(vi.getTimerCount()).toBe(0);
}

function oneReport(target: ReturnType<typeof sink>) {
	const text = target.text();
	expect(text.endsWith("\n")).toBe(true);
	expect(text.split("\n")).toHaveLength(2);
	expect(Buffer.byteLength(text)).toBeLessThanOrEqual(256_000);
	expect(text).not.toContain(rawMarker);
	return JSON.parse(text);
}

function largeFixture(outputBytes?: number) {
	const values = Array.from({ length: 4 }, () =>
		Array.from({ length: 16 }, () => "x".repeat(4000)),
	);
	let input = fixture(values.map((value) => JSON.stringify(value)));
	if (outputBytes !== undefined) {
		const excess =
			Buffer.byteLength(JSON.stringify(expectedExtraction(input, values))) -
			outputBytes;
		expect(excess).toBeGreaterThan(0);
		expect(excess).toBeLessThan(4000);
		values[3][15] = values[3][15].slice(excess);
		input = fixture(values.map((value) => JSON.stringify(value)));
	}
	return { input, values };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	transportCreated.mockClear();
	vi.spyOn(NodeNetworkTransport.prototype, "request").mockRejectedValue(
		new Error(`Unconfigured synthetic request: ${rawMarker}`),
	);
	vi.spyOn(NodeNetworkTransport.prototype, "close");
	vi.spyOn(NodeNetworkTransport.prototype, "metrics");
	vi.stubGlobal("__assetLiteralExecuted", false);
	vi.stubGlobal(
		"fetch",
		vi.fn(() => {
			throw new Error("Unexpected fetch; every request must be mocked");
		}),
	);
});

afterEach(async () => {
	for (const output of outputs) output.destroy();
	await streamTurn();
	for (const output of outputs) output.removeAllListeners();
	outputs.length = 0;
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("pinned asset API", () => {
	it("publishes frozen, bounded limits", () => {
		expect(researchAssetLiteralLimits).toEqual({
			maxBodyBytes: 2_000_000,
			maxRangeBytes: 65_536,
			maxRanges: 8,
			maxOutputBytes: 256_000,
			timeoutMs: 30_000,
		});
		deeplyFrozen(researchAssetLiteralLimits);
	});

	it("returns only deeply frozen literal values and exact byte identities", () => {
		const input = fixture([
			"{label:'café', nested:[null, true, {count:-2.5}]}",
			"[false, '\\uFEFF', 42]",
		]);
		const before = input.body.slice();
		const result = extractResearchAssetLiterals(input);
		expect(result).toEqual(
			expectedExtraction(input, [
				{ label: "café", nested: [null, true, { count: -2.5 }] },
				[false, "\uFEFF", 42],
			]),
		);
		deeplyFrozen(result);
		expect(Object.getPrototypeOf(result.literals[0].value)).toBeNull();
		expect(input.body).toEqual(before);
		input.body.fill(0);
		input.ranges[0].startByte = 0;
		expect(result.source.sha256).toBe(hash(before));
		expect(result.literals[0].startByte).toBeGreaterThan(0);
		expect(Reflect.get(globalThis, "__assetLiteralExecuted")).toBe(false);
		noTransport();
	});

	it("accepts null-prototype envelopes and ranges without inferring exports", () => {
		const input = fixture(["{ok:true}"]);
		const envelope = Object.assign(Object.create(null), input, {
			ranges: input.ranges.map((range) =>
				Object.assign(Object.create(null), range),
			),
		});
		expect(extractResearchAssetLiterals(envelope)).toEqual(
			expectedExtraction(input, [{ ok: true }]),
		);
		expect(() =>
			extractResearchAssetLiterals(fixture(["export default {ok:true}"])),
		).toThrow(AgentBrowserError);
	});

	it.each([null, undefined, false, 1, "asset", [], new Date()])(
		"rejects a non-envelope %j",
		(input) => {
			expect(() => extractResearchAssetLiterals(input)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		},
	);

	it("rejects missing, inherited, extra, symbol and nonenumerable fields", () => {
		const input = fixture();
		const before = input.body.slice();
		for (const field of Object.keys(input)) {
			const missing: Record<string, unknown> = { ...input };
			delete missing[field];
			expect(() => extractResearchAssetLiterals(missing)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		for (const envelope of [
			Object.create(input),
			{ ...input, extra: true },
			{ ...input, [Symbol("extra")]: true },
			Object.defineProperty({ ...input }, "hidden", { value: true }),
		]) {
			expect(() => extractResearchAssetLiterals(envelope)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(input.body).toEqual(before);
	});

	it("rejects accessor envelopes and ranges without invoking getters", () => {
		const getter = vi.fn(() => {
			throw new Error("Getter must not run");
		});
		const input = fixture();
		for (const field of Object.keys(input)) {
			const envelope = Object.defineProperty({ ...input }, field, {
				get: getter,
			});
			expect(() => extractResearchAssetLiterals(envelope)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		for (const field of ["startByte", "endByte"]) {
			const range = Object.defineProperty({ ...input.ranges[0] }, field, {
				get: getter,
			});
			expect(() =>
				extractResearchAssetLiterals({ ...input, ranges: [range] }),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
		}
		const ranges = Object.defineProperty([...input.ranges], "0", {
			get: getter,
		});
		expect(() => extractResearchAssetLiterals({ ...input, ranges })).toThrow(
			expect.objectContaining({ code: "invalid-input" }),
		);
		expect(getter).not.toHaveBeenCalled();
	});

	it("rejects proxies at every envelope boundary without invoking traps", () => {
		const trap = vi.fn(() => {
			throw new Error("Proxy trap must not run");
		});
		const proxy = <Value extends object>(value: Value) =>
			new Proxy(value, {
				get: trap,
				getPrototypeOf: trap,
				getOwnPropertyDescriptor: trap,
				ownKeys: trap,
			});
		const input = fixture();
		const revoked = Proxy.revocable(input, {});
		revoked.revoke();
		for (const envelope of [
			proxy(input),
			revoked.proxy,
			{ ...input, body: proxy(input.body) },
			{ ...input, ranges: proxy(input.ranges) },
			{ ...input, ranges: [proxy(input.ranges[0])] },
		]) {
			expect(() => extractResearchAssetLiterals(envelope)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(trap).not.toHaveBeenCalled();
	});

	it.each(["Uint8Array", "Buffer"])(
		"copies intrinsic %s subarray bytes without consulting overrides",
		(kind) => {
			const input = fixture();
			const storage =
				kind === "Buffer"
					? Buffer.alloc(input.body.length + 8, 123)
					: new Uint8Array(input.body.length + 8).fill(123);
			storage.set(input.body, 4);
			const before = Uint8Array.from(storage);
			const body = storage.subarray(4, storage.length - 4);
			const getter = vi.fn(() => {
				throw new Error("Overridden byte-array property must not run");
			});
			for (const field of [
				"buffer",
				"byteOffset",
				"byteLength",
				"length",
				"at",
				"slice",
				"subarray",
				"fill",
				Symbol.iterator,
			]) {
				Object.defineProperty(body, field, { get: getter });
			}
			expect(extractResearchAssetLiterals({ ...input, body })).toEqual(
				expectedExtraction(input, [{ label: literalMarker }]),
			);
			expect(() =>
				extractResearchAssetLiterals({
					...input,
					body,
					expectedSha256: "0".repeat(64),
				}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
			expect(Uint8Array.from(storage)).toEqual(before);
			expect(getter).not.toHaveBeenCalled();
		},
	);

	it("rejects shared, detached and non-Uint8Array bodies", () => {
		const input = fixture();
		const detached = new Uint8Array(input.body);
		structuredClone(detached.buffer, { transfer: [detached.buffer] });
		const shared = new Uint8Array(new SharedArrayBuffer(input.body.length));
		shared.set(input.body);
		for (const body of [
			shared,
			detached,
			input.body.buffer,
			new DataView(input.body.buffer),
			new Uint16Array(4),
			Array.from(input.body),
			"0",
		]) {
			expect(() => extractResearchAssetLiterals({ ...input, body })).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
		expect(shared).toEqual(input.body);
	});

	it.each([
		"http://asset-literals.fixture.invalid/pinned.js",
		"HTTPS://asset-literals.fixture.invalid/pinned.js",
		"https://ASSET-LITERALS.fixture.invalid/pinned.js",
		"https://asset-literals.fixture.invalid:443/pinned.js",
		"https://asset-literals.fixture.invalid/dir/../pinned.js",
		"https://asset-literals.fixture.invalid/pinned.json",
		`${url}?`,
		`${url}?query=secret`,
		`${url}#`,
		`${url}#fragment`,
		url.replace("https://", "https://user:password@"),
		` ${url}`,
		`${url}\n`,
		url.replace("pinned", "pin\tned"),
		url.replace("pinned", "pin\u0000ned"),
		url.replace("pinned", "pin\u200bned"),
		url.replace("/pinned", "\\pinned"),
	])("rejects noncanonical or decorated asset URL %j", (candidate) => {
		expect(() =>
			extractResearchAssetLiterals({ ...fixture(), url: candidate }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});

	it.each([".js", ".mjs"])("accepts canonical HTTPS %s assets", (suffix) => {
		const input = { ...fixture(), url: url.replace(".mjs", suffix) };
		expect(extractResearchAssetLiterals(input).source.url).toBe(input.url);
	});

	it.each([
		"",
		"a".repeat(63),
		"a".repeat(65),
		"A".repeat(64),
		"g".repeat(64),
		`${"a".repeat(64)}\n`,
		42,
		null,
	])("rejects malformed digest %j", (expectedSha256) => {
		expect(() =>
			extractResearchAssetLiterals({ ...fixture(), expectedSha256 }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});

	it.each([
		"text/javascript",
		"application/javascript",
		"text/ecmascript",
		"application/ecmascript",
		'TEXT/JAVASCRIPT; CHARSET="UTF-8"',
		"\tApplication/ECMAScript ; charset = utf-8 \t",
	])("accepts explicit JavaScript MIME %j verbatim", (contentType) => {
		expect(
			extractResearchAssetLiterals({ ...fixture(), contentType }).source
				.contentType,
		).toBe(contentType);
	});

	it.each([
		"",
		"text/plain",
		"application/json",
		"application/x-javascript",
		"text/javascript; charset=latin1",
		"text/javascript; charset='utf-8'",
		"text/javascript; charset=utf-8; charset=utf-8",
		"text/javascript; version=1",
		"text/javascript; charset=utf-8; extra=yes",
		"text/javascript, application/javascript",
		"text/javascript\r\nX-Secret: value",
		"text/javascript\n",
	])("rejects unsupported or ambiguous MIME %j", (contentType) => {
		expect(() =>
			extractResearchAssetLiterals({ ...fixture(), contentType }),
		).toThrow(expect.objectContaining({ code: "unsupported" }));
	});

	it("requires ordinary own-element arrays and exact range records", () => {
		const input = fixture();
		class RangeArray extends Array {}
		for (const ranges of [
			[],
			new Array(1),
			RangeArray.from(input.ranges),
			Object.assign([...input.ranges], { extra: true }),
			Object.assign([...input.ranges], { [Symbol("extra")]: true }),
			[{ ...input.ranges[0], extra: true }],
			[Object.create(input.ranges[0])],
			[{ startByte: input.ranges[0].startByte }],
			{ 0: input.ranges[0], length: 1 },
		]) {
			expect(() => extractResearchAssetLiterals({ ...input, ranges })).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
		}
	});

	it.each([
		[{ startByte: -1, endByte: 1 }],
		[{ startByte: 1, endByte: 1 }],
		[{ startByte: 2, endByte: 1 }],
		[{ startByte: 0.5, endByte: 1 }],
		[{ startByte: 0, endByte: 1.5 }],
		[{ startByte: Number.NaN, endByte: 1 }],
		[{ startByte: 0, endByte: Number.POSITIVE_INFINITY }],
		[{ startByte: "0", endByte: 1 }],
		[{ startByte: 1_999_999, endByte: 2_000_001 }],
		[
			{ startByte: 0, endByte: 2 },
			{ startByte: 1, endByte: 3 },
		],
		[
			{ startByte: 2, endByte: 3 },
			{ startByte: 0, endByte: 1 },
		],
	])("rejects invalid byte range ordering or endpoints %j", (...ranges) => {
		expect(() =>
			extractResearchAssetLiterals({ ...fixture(), ranges }),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
	});

	it("enforces actual body length, range count and inclusive size limits", () => {
		const input = fixture();
		expect(() =>
			extractResearchAssetLiterals({
				...input,
				ranges: [
					{ startByte: input.body.length, endByte: input.body.length + 1 },
				],
			}),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		expect(
			extractResearchAssetLiterals(fixture(Array(8).fill("0"))).literals,
		).toHaveLength(8);
		expect(() =>
			extractResearchAssetLiterals(fixture(Array(9).fill("0"))),
		).toThrow(expect.objectContaining({ code: "invalid-input" }));
		const body = new Uint8Array(2_000_000).fill(32);
		body[body.length - 65_536] = 48;
		expect(
			extractResearchAssetLiterals({
				...input,
				body,
				expectedSha256: hash(body),
				ranges: [{ startByte: body.length - 65_536, endByte: body.length }],
			}).literals[0].value,
		).toBe(0);
		expect(body[body.length - 65_536]).toBe(48);
		const oversized = new Uint8Array(2_000_001);
		expect(() =>
			extractResearchAssetLiterals({
				...input,
				body: oversized,
				expectedSha256: hash(oversized),
			}),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
		expect(() =>
			extractResearchAssetLiterals(fixture(["0".padEnd(65_537)])),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	});

	it("accepts adjacent ordered ranges without evaluating their surroundings", () => {
		const body = new TextEncoder().encode("01");
		const result = extractResearchAssetLiterals({
			...fixture(),
			body,
			expectedSha256: hash(body),
			ranges: [
				{ startByte: 0, endByte: 1 },
				{ startByte: 1, endByte: 2 },
			],
		});
		expect(result.literals.map((literal) => literal.value)).toEqual([0, 1]);
	});

	it.each([[0xc3, 0x28], [0xef, 0xbb], [0xff], [0xef, 0xbb, 0xbf, 0x30]])(
		"rejects malformed UTF-8 or a preserved leading BOM %j",
		(...bytes) => {
			const body = Uint8Array.from(bytes);
			const before = body.slice();
			expect(() =>
				extractResearchAssetLiterals({
					...fixture(),
					body,
					expectedSha256: hash(body),
					ranges: [{ startByte: 0, endByte: body.length }],
				}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
			expect(body).toEqual(before);
		},
	);

	it("decodes only audited bytes and rejects malformed UTF-8 inside strings", () => {
		const input = fixture();
		const body = Uint8Array.from([0xff, 0x27, 0xc3, 0xa9, 0x27, 0xff]);
		const before = body.slice();
		expect(
			extractResearchAssetLiterals({
				...input,
				body,
				expectedSha256: hash(body),
				ranges: [{ startByte: 1, endByte: 5 }],
			}).literals[0].value,
		).toBe("é");
		expect(body).toEqual(before);
		for (const bytes of [
			[0x27, 0xff, 0x27],
			[0x27, 0xc3, 0x28, 0x27],
			[0x27, 0xed, 0xa0, 0x80, 0x27],
		]) {
			const malformed = Uint8Array.from(bytes);
			expect(() =>
				extractResearchAssetLiterals({
					...input,
					body: malformed,
					expectedSha256: hash(malformed),
					ranges: [{ startByte: 0, endByte: malformed.length }],
				}),
			).toThrow(expect.objectContaining({ code: "invalid-input" }));
			expect(Array.from(malformed)).toEqual(bytes);
		}
	});

	it("preserves input on hash mismatch, parser failure and aggregate overflow", () => {
		const wrongHash = { ...fixture(), expectedSha256: "0".repeat(64) };
		for (const [input, code] of [
			[wrongHash, "invalid-input"],
			[fixture(["callMe()"]), "invalid-input"],
			[largeFixture().input, "resource-limit"],
		] as const) {
			const before = input.body.slice();
			expect(() => extractResearchAssetLiterals(input)).toThrow(
				expect.objectContaining({ code }),
			);
			expect(input.body).toEqual(before);
		}
	});

	it("allows exactly 256000 serialized API bytes but not one byte more", () => {
		const { input, values } = largeFixture(256_000);
		const result = extractResearchAssetLiterals(input);
		expect(result).toEqual(expectedExtraction(input, values));
		expect(Buffer.byteLength(JSON.stringify(result))).toBe(256_000);
		expect(() =>
			extractResearchAssetLiterals(largeFixture(256_001).input),
		).toThrow(expect.objectContaining({ code: "resource-limit" }));
	});
});

describe("asset CLI arguments", () => {
	it("accepts flag ordering, freezes options and supports eight ranges", () => {
		const input = fixture(Array(8).fill("0"));
		const args = argumentsFor(input);
		for (const permutation of [
			args,
			[input.url, ...args.slice(2, -1), ...args.slice(0, 2)],
			[...args.slice(2, -1), input.url, ...args.slice(0, 2)],
		]) {
			const result = parseResearchAssetLiteralArguments(permutation);
			expect(result).toEqual({
				url: input.url,
				expectedSha256: input.expectedSha256,
				ranges: input.ranges,
			});
			deeplyFrozen(result);
		}
		noTransport();
	});

	const digest = hash(new TextEncoder().encode("0"));
	const valid = ["--sha256", digest, "--range", "0:1", url];
	const invalidArguments = [
		[],
		[url],
		["--sha256", digest, url],
		["--range", "0:1", url],
		valid.slice(0, -1),
		[...valid, "--sha256", digest],
		[...valid, "--sha256"],
		[...valid, "--range"],
		[...valid, "--unknown"],
		[...valid, url],
		[...valid, "--range", "0:1"],
		["--sha256", digest, ...Array(9).fill(["--range", "0:1"]).flat(), url],
		["--sha256", `${digest}\n`, "--range", "0:1", url],
		["--sha256", digest.toUpperCase(), "--range", "0:1", url],
		["--sha256", digest, "--range", "0:1", `${url}\n`],
		["--sha256", digest, "--range", "0:1", `${url}?`],
		["--sha256", digest, "--range", "0:1", `${url}#`],
		...[
			"00:1",
			"0:01",
			"0.0:1",
			"0:1.0",
			"-1:1",
			"+0:1",
			"1e0:2",
			"0:1\n",
			"0:1\r\n",
			" 0:1",
			"0:1 ",
			"0:0",
			"2:1",
			"0:2000001",
		].map((range) => ["--sha256", digest, "--range", range, url]),
	];

	it.each(invalidArguments.map((args) => ({ args })))(
		"rejects malformed arguments before transport construction: $args",
		async ({ args }) => {
			const target = sink();
			expect(() => parseResearchAssetLiteralArguments(args)).toThrow(
				expect.objectContaining({ code: "invalid-input" }),
			);
			await expect(
				runResearchAssetLiteralCli(args, target.output),
			).rejects.toMatchObject({ code: "invalid-input" });
			expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual({
				error: [],
				close: [],
				drain: [],
			});
			noTransport();
		},
	);
});

describe("mocked native asset CLI", () => {
	it("issues one bounded credentialless GET and emits one unverified JSONL", async () => {
		const input = fixture();
		const before = input.body.slice();
		enqueue(input);
		const target = sink();
		const baseline = listeners(target.output);
		const controller = new AbortController();
		expect(
			await runResearchAssetLiteralCli(
				argumentsFor(input),
				target.output,
				controller.signal,
			),
		).toBe(0);
		expect(transportCreated).toHaveBeenCalledWith({
			cookieJar: expect.any(Object),
			allowedOrigins: [new URL(url).origin],
			limits: {
				timeoutMs: 15_000,
				maxResponseBytes: 2_000_000,
				maxTotalBytes: 2_000_000,
				maxRequestBytes: 1,
				maxHeaderBytes: 16_384,
				maxRequests: 1,
				maxConcurrent: 1,
				maxRedirects: 0,
			},
		});
		expect(NodeNetworkTransport.prototype.request).toHaveBeenCalledWith({
			url,
			method: "GET",
			redirect: "error",
			signal: expect.any(AbortSignal),
			headers: { "User-Agent": "AgentBrowser/0.1", "Accept-Language": "en-US" },
			cookieContext: { credentials: "omit", siteUrl: null },
		});
		expect(oneReport(target)).toEqual({
			outcome: "extracted-unverified",
			contentSuccess: null,
			status: 200,
			extraction: expectedExtraction(input, [{ label: literalMarker }]),
			metrics: expect.objectContaining({
				active: 0,
				closed: true,
				redirects: 0,
			}),
		});
		expect(input.body).toEqual(before);
		expect(Reflect.get(globalThis, "__assetLiteralExecuted")).toBe(false);
		expect(target.output.writableEnded).toBe(false);
		expect(listeners(target.output)).toEqual(baseline);
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		closedOnce();
	});

	it.each<{
		name: string;
		overrides: Partial<NetworkResponse>;
		category: string;
		stage: string;
	}>([
		{
			name: "HTTP 204",
			overrides: { status: 204 },
			category: "network-error",
			stage: "response",
		},
		{
			name: "HTTP 302",
			overrides: { status: 302 },
			category: "network-error",
			stage: "response",
		},
		{
			name: "HTTP 404",
			overrides: { status: 404 },
			category: "network-error",
			stage: "response",
		},
		{
			name: "HTTP 500",
			overrides: { status: 500 },
			category: "network-error",
			stage: "response",
		},
		{
			name: "changed URL",
			overrides: { url: url.replace("pinned", "changed") },
			category: "network-error",
			stage: "response",
		},
		{
			name: "redirect history",
			overrides: { redirects: [{ url, status: 302, location: url }] },
			category: "network-error",
			stage: "response",
		},
		{
			name: "missing MIME",
			overrides: { headers: {} },
			category: "invalid-input",
			stage: "response",
		},
		{
			name: "empty MIME list",
			overrides: { headers: { "content-type": [] } },
			category: "invalid-input",
			stage: "response",
		},
		{
			name: "duplicate MIME",
			overrides: {
				headers: { "content-type": ["text/javascript", "text/javascript"] },
			},
			category: "invalid-input",
			stage: "response",
		},
		{
			name: "unsupported MIME",
			overrides: { headers: { "content-type": ["text/plain"] } },
			category: "unsupported",
			stage: "extract",
		},
		{
			name: "duplicate charset",
			overrides: {
				headers: {
					"content-type": ["text/javascript; charset=utf-8; charset=utf-8"],
				},
			},
			category: "unsupported",
			stage: "extract",
		},
		{
			name: "MIME header injection",
			overrides: {
				headers: { "content-type": ["text/javascript\r\nX-Secret: value"] },
			},
			category: "unsupported",
			stage: "extract",
		},
	])(
		"sanitizes $name without emitting content or retrying",
		async ({ overrides, category, stage }) => {
			const input = fixture();
			const before = input.body.slice();
			enqueue(input, overrides);
			const target = sink();
			expect(
				await runResearchAssetLiteralCli(argumentsFor(input), target.output),
			).toBe(1);
			expect(oneReport(target)).toEqual({
				outcome: "failure",
				contentSuccess: false,
				status: overrides.status ?? 200,
				failure: { category, stage },
				metrics: expect.objectContaining({ active: 0, closed: true }),
			});
			expect(target.text()).not.toContain(literalMarker);
			expect(input.body).toEqual(before);
			expect(listeners(target.output)).toEqual({
				error: [],
				close: [],
				drain: [],
			});
			closedOnce();
		},
	);

	it.each(["hash mismatch", "unsupported expression", "aggregate overflow"])(
		"closes and reports sanitized extraction failure for %s",
		async (mode) => {
			const input =
				mode === "aggregate overflow"
					? largeFixture().input
					: fixture(
							mode === "unsupported expression"
								? [`execute('${rawMarker}')`]
								: undefined,
						);
			const before = input.body.slice();
			enqueue(input);
			const target = sink();
			const args = argumentsFor(
				mode === "hash mismatch"
					? { ...input, expectedSha256: "0".repeat(64) }
					: input,
			);
			expect(await runResearchAssetLiteralCli(args, target.output)).toBe(1);
			expect(oneReport(target)).toEqual({
				outcome: "failure",
				contentSuccess: false,
				status: 200,
				failure: {
					category:
						mode === "aggregate overflow" ? "resource-limit" : "invalid-input",
					stage: "extract",
				},
				metrics: expect.objectContaining({ active: 0, closed: true }),
			});
			expect(target.text()).not.toContain(literalMarker);
			expect(input.body).toEqual(before);
			closedOnce();
		},
	);

	it.each([new Error(rawMarker), new AgentBrowserError("timeout", rawMarker)])(
		"sanitizes request rejection %j and closes without retry",
		async (error) => {
			vi.mocked(NodeNetworkTransport.prototype.request).mockRejectedValueOnce(
				error,
			);
			const target = sink();
			expect(
				await runResearchAssetLiteralCli(
					argumentsFor(fixture()),
					target.output,
				),
			).toBe(1);
			expect(oneReport(target)).toEqual({
				outcome: "failure",
				contentSuccess: false,
				failure: {
					category:
						error instanceof AgentBrowserError ? error.code : "network-error",
					stage: "request",
				},
				metrics: expect.objectContaining({ active: 0, closed: true }),
			});
			closedOnce();
		},
	);

	it("rejects CLI wrapper overflow even when the extraction fits exactly", async () => {
		const { input } = largeFixture(256_000);
		expect(
			Buffer.byteLength(JSON.stringify(extractResearchAssetLiterals(input))),
		).toBe(256_000);
		enqueue(input);
		const target = sink();
		await expect(
			runResearchAssetLiteralCli(argumentsFor(input), target.output),
		).rejects.toMatchObject({ code: "resource-limit" });
		expect(target.text()).toBe("");
		expect(listeners(target.output)).toEqual({
			error: [],
			close: [],
			drain: [],
		});
		closedOnce();
	});

	it("rejects pre-abort before transport construction or output", async () => {
		const controller = new AbortController();
		controller.abort(new Error(rawMarker));
		const target = sink();
		await expect(
			runResearchAssetLiteralCli(
				argumentsFor(fixture()),
				target.output,
				controller.signal,
			),
		).rejects.toMatchObject({ code: "aborted" });
		expect(target.text()).toBe("");
		expect(getEventListeners(controller.signal, "abort")).toEqual([]);
		noTransport();
	});

	it.each(["destroyed", "ended", "errored"])(
		"rejects already %s output before transport construction",
		async (mode) => {
			const target = sink();
			target.output.on("error", () => {});
			if (mode === "ended") target.output.end();
			else
				target.output.destroy(
					mode === "errored" ? new Error(rawMarker) : undefined,
				);
			await streamTurn();
			const baseline = listeners(target.output);
			await expect(
				runResearchAssetLiteralCli(argumentsFor(fixture()), target.output),
			).rejects.toMatchObject({ code: "closed" });
			expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual(baseline);
			noTransport();
		},
	);

	it.each(["external abort", "deadline"])(
		"cleans up a pending request after %s without writing a report",
		async (mode) => {
			vi.mocked(NodeNetworkTransport.prototype.request).mockImplementationOnce(
				({ signal }) =>
					new Promise((_resolve, reject) => {
						if (!signal) throw new Error("Missing request signal");
						signal.addEventListener("abort", () => reject(signal.reason), {
							once: true,
						});
					}),
			);
			const target = sink();
			const controller = new AbortController();
			const result = observe(
				runResearchAssetLiteralCli(
					argumentsFor(fixture()),
					target.output,
					controller.signal,
				),
			);
			const requestSignal = vi.mocked(NodeNetworkTransport.prototype.request)
				.mock.calls[0][0].signal;
			if (mode === "external abort") controller.abort(new Error(rawMarker));
			else await vi.advanceTimersByTimeAsync(30_000);
			expect(await result).toMatchObject({
				error: { code: mode === "external abort" ? "aborted" : "timeout" },
			});
			if (!requestSignal) throw new Error("Missing request signal");
			expect(requestSignal.aborted).toBe(true);
			expect(getEventListeners(requestSignal, "abort")).toEqual([]);
			expect(getEventListeners(controller.signal, "abort")).toEqual([]);
			expect(target.text()).toBe("");
			expect(listeners(target.output)).toEqual({
				error: [],
				close: [],
				drain: [],
			});
			closedOnce();
		},
	);

	it("waits for a backpressured Writable callback before reporting success", async () => {
		const input = fixture();
		enqueue(input);
		const target = sink(true);
		let settled = false;
		const result = observe(
			runResearchAssetLiteralCli(argumentsFor(input), target.output),
		).then((outcome) => {
			settled = true;
			return outcome;
		});
		await target.writing;
		expect(settled).toBe(false);
		expect(target.output.writableNeedDrain).toBe(true);
		expect(vi.getTimerCount()).toBe(1);
		target.callbacks[0]();
		expect(await result).toEqual({ value: 0 });
		expect(oneReport(target).outcome).toBe("extracted-unverified");
		expect(listeners(target.output)).toEqual({
			error: [],
			close: [],
			drain: [],
		});
		closedOnce();
	});

	it.each([
		{ mode: "external abort", settlement: "callback success" },
		{ mode: "external abort", settlement: "callback error" },
		{ mode: "external abort", settlement: "caller close" },
		{ mode: "deadline", settlement: "callback success" },
		{ mode: "deadline", settlement: "callback error" },
		{ mode: "deadline", settlement: "caller close" },
	])(
		"retains pending-write guards after $mode until $settlement",
		async ({ mode, settlement }) => {
			const input = fixture();
			enqueue(input);
			const target = sink(true);
			const callerError = vi.fn();
			if (mode === "deadline") target.output.on("error", callerError);
			const baseline = listeners(target.output);
			const controller = new AbortController();
			const callerAbort = vi.fn();
			controller.signal.addEventListener("abort", callerAbort);
			const abortBaseline = getEventListeners(controller.signal, "abort");
			let writeAcknowledged = false;
			const result = observe(
				runResearchAssetLiteralCli(
					argumentsFor(input),
					target.output,
					controller.signal,
				),
			);
			try {
				await target.writing;
				if (mode === "external abort") controller.abort(new Error(rawMarker));
				else await vi.advanceTimersByTimeAsync(30_000);
				const outcome = await result;
				expect(outcome).toMatchObject({
					error: { code: mode === "external abort" ? "aborted" : "timeout" },
				});
				expect(getEventListeners(controller.signal, "abort")).toEqual(
					abortBaseline,
				);
				expect(callerAbort).toHaveBeenCalledTimes(
					mode === "external abort" ? 1 : 0,
				);
				const requestSignal = vi.mocked(NodeNetworkTransport.prototype.request)
					.mock.calls[0][0].signal;
				if (!requestSignal) throw new Error("Missing request signal");
				expect(getEventListeners(requestSignal, "abort")).toEqual([]);
				expect(target.output.destroyed).toBe(false);
				expect(target.output.writableEnded).toBe(false);
				const guarded = listeners(target.output);
				expect(guarded.error).toHaveLength(baseline.error.length + 1);
				expect(guarded.close).toHaveLength(baseline.close.length + 1);
				expect(guarded.error.slice(0, baseline.error.length)).toEqual(
					baseline.error,
				);
				expect(guarded.drain).toEqual(baseline.drain);
				await streamTurn();
				expect(listeners(target.output)).toEqual(guarded);
				closedOnce();
				if (settlement === "caller close") target.output.destroy();
				else {
					writeAcknowledged = true;
					target.callbacks[0](
						settlement === "callback error" ? new Error(rawMarker) : undefined,
					);
				}
				await streamTurn();
				expect(await result).toBe(outcome);
				expect(listeners(target.output)).toEqual(baseline);
				expect(getEventListeners(controller.signal, "abort")).toEqual(
					abortBaseline,
				);
				if (settlement === "callback error" && mode === "deadline") {
					expect(callerError).toHaveBeenCalledTimes(1);
					expect(callerError.mock.calls[0][0]).toMatchObject({
						message: rawMarker,
					});
				} else expect(callerError).not.toHaveBeenCalled();
				if (settlement === "callback success") {
					expect(target.output.destroyed).toBe(false);
					expect(target.output.writableEnded).toBe(false);
				}
				expect(target.chunks).toHaveLength(1);
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				controller.signal.removeEventListener("abort", callerAbort);
				if (!writeAcknowledged) target.callbacks[0]?.();
				target.output.destroy();
				await streamTurn();
			}
		},
	);

	it.each(["synchronous", "callback", "error event", "close"])(
		"rejects %s output failure with cleanup and no retry",
		async (mode) => {
			const input = fixture();
			enqueue(input);
			const target = sink(true);
			const baseline = listeners(target.output);
			const controller = new AbortController();
			if (mode === "synchronous") {
				vi.spyOn(target.output, "write").mockImplementation(() => {
					throw new Error(rawMarker);
				});
			}
			const result = observe(
				runResearchAssetLiteralCli(
					argumentsFor(input),
					target.output,
					controller.signal,
				),
			);
			try {
				if (mode !== "synchronous") {
					await target.writing;
					if (mode === "callback") target.callbacks[0](new Error(rawMarker));
					else
						target.output.destroy(
							mode === "error event" ? new Error(rawMarker) : undefined,
						);
				}
				expect(await result).toMatchObject({
					error: { code: "closed", message: "Source asset output failed" },
				});
				await streamTurn();
				expect(listeners(target.output)).toEqual(baseline);
				expect(getEventListeners(controller.signal, "abort")).toEqual([]);
				expect(target.chunks.length).toBeLessThanOrEqual(1);
				closedOnce();
			} finally {
				if (mode !== "callback") target.callbacks[0]?.();
				target.output.destroy();
			}
		},
	);
});
