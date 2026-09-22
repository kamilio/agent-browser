import { EOL } from "node:os";
import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { PageBlobs, pageBlobLimits } from "./page-blobs.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls } from "./page-urls.js";
import type { ReleasedHostDefinition } from "./safejs-extension-types.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanups.splice(0)) close();
});
function fixture(
	limits: Partial<typeof pageBlobLimits> = {},
	origin = "https://user:pass@example.test:443/path",
) {
	const controller = new AbortController();
	let fail = false;
	const context = {
		signal: controller.signal,
		createHostObject(definition: ReleasedHostDefinition) {
			if (fail) throw new Error("Factory failed");
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	};
	const owner = new PageBlobs(context, () => origin, limits);
	const urls = new PageUrls(context);
	const vm = createContext({
		__agentBrowserWindowGlobal: { urls: urls.port, blobs: owner.port },
	});
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(pageUrlBootstrapSource + pageBlobBootstrapSource);
	const close = () => {
		controller.abort();
		owner.close();
		urls.close();
	};
	cleanups.push(close);
	return {
		owner,
		evaluate,
		close,
		controller,
		failFactory: () => {
			fail = true;
		},
	};
}

it("encodes Unicode, replaces lone surrogates, normalizes type and supports native endings", async () => {
	const test = fixture();
	expect(
		await test.evaluate(
			`new Blob(['雪', '\\ud800', 'a\\r\\nb\\rc\\nd'], {type: 'TEXT/PLAIN', endings: 'native'}).text()`,
		),
	).toBe(`雪�a${EOL}b${EOL}c${EOL}d`);
	expect(
		test.evaluate(
			`var blob = new Blob(['雪', '\\ud800'], {type: 'TEXT/PLAIN'}); [blob.size, blob.type, Object.keys(blob), Object.prototype.toString.call(blob)]`,
		),
	).toEqual([6, "text/plain", [], "[object Blob]"]);
	expect(test.evaluate(`new Blob([], {type: 'bad\\nvalue'}).type`)).toBe("");
});

it("copies buffer views and blobs, and never exposes retained bytes", async () => {
	const test = fixture();
	test.evaluate(
		`var bytes = new Uint8Array([10,20,30,40]); var view = new DataView(bytes.buffer, 1, 2); var blob = new Blob([view, bytes.subarray(2,3)]); bytes.fill(99); var copy = new Blob([blob, 'x']);`,
	);
	expect([...(await test.evaluate("blob.bytes()"))]).toEqual([20, 30, 30]);
	const array = await test.evaluate("blob.bytes()");
	array.fill(0);
	const buffer = await test.evaluate("blob.arrayBuffer()");
	new Uint8Array(buffer).fill(0);
	expect([...(await test.evaluate("copy.bytes()"))]).toEqual([20, 30, 30, 120]);
});

it.each([
	[-3, undefined, "def"],
	[1, -1, "bcde"],
	[4, 1, ""],
	[Infinity, undefined, "abcdef"],
	[NaN, 2, "ab"],
	[1.9, 4.8, "bcd"],
	[2 ** 64, 2, "ab"],
])(
	"slices using signed integer conversion %s %s",
	async (start, end, expected) => {
		const test = fixture();
		const literal = (n: unknown) => (n === undefined ? "undefined" : String(n));
		expect(
			await test.evaluate(
				`new Blob(['abcdef'], {type:'text/html'}).slice(${literal(start)}, ${literal(end)}, 'TEXT/PLAIN').text()`,
			),
		).toBe(expected);
		expect(
			test.evaluate(`new Blob(['x'], {type:'text/html'}).slice().type`),
		).toBe("");
	},
);

it("performs iteration, string conversion and options getters in the guest in order", async () => {
	const test = fixture();
	test.evaluate(
		`var calls = []; var blob = new Blob({*[Symbol.iterator]() { calls.push('iterate'); yield {toString() {calls.push('string'); return 'ok';}};}}, {get endings() {calls.push('endings'); return 'transparent';}, get type() {calls.push('type'); return 'TEXT/PLAIN';}});`,
	);
	expect(test.evaluate("calls")).toEqual([
		"iterate",
		"string",
		"endings",
		"type",
	]);
	expect(await test.evaluate("blob.text()")).toBe("ok");
});

it.each([
	"Blob()",
	"new Blob(null)",
	"new Blob('text')",
	"new Blob({})",
	"new Blob([Symbol()])",
	"new Blob([], 1)",
	"new Blob([], {endings:'other'})",
	"new Blob([], {type:Symbol()})",
	"new Blob().slice(1n)",
	"URL.createObjectURL({})",
	"URL.createObjectURL()",
	"URL.revokeObjectURL()",
	"URL.revokeObjectURL(Symbol())",
])("rejects malformed input %s", (source) => {
	const test = fixture();
	expect(() => test.evaluate(source)).toThrow();
});

it("brands methods and keeps captured intrinsics working after prototype tampering", async () => {
	const test = fixture();
	for (const source of [
		"Blob.prototype.slice.call({})",
		"Object.getOwnPropertyDescriptor(Blob.prototype,'size').get.call({})",
	])
		expect(() => test.evaluate(source)).toThrow();
	await expect(test.evaluate("Blob.prototype.text.call({})")).rejects.toThrow();
	test.evaluate(
		`var SavedBlob = Blob, create = URL.createObjectURL; WeakMap.prototype.get = () => ({}); WeakMap.prototype.set = () => {}; Array.prototype.push = () => {throw Error('tampered');}; Reflect.apply = () => {throw Error('tampered');}; ArrayBuffer.isView = () => false; globalThis.String = () => 'wrong'; globalThis.Blob = function() {throw Error('tampered');}; var blob = new SavedBlob([new Uint8Array([65]), 'B']);`,
	);
	expect(await test.evaluate("blob.slice().text()")).toBe("AB");
	expect(test.evaluate("create(blob)")).toMatch(
		/^blob:https:\/\/example.test\//,
	);
});

it("creates unpredictable page-local URLs, resolves snapshots, ignores fragments and revokes without invalidating blobs", async () => {
	const test = fixture(),
		other = fixture();
	const url = test.evaluate(
		"var blob = new Blob(['ok'], {type:'TEXT/PLAIN'}); var url = URL.createObjectURL(blob); url",
	);
	expect(url).toMatch(/^blob:https:\/\/example.test\/[0-9a-f-]{36}$/);
	expect(test.evaluate("URL.createObjectURL(blob)")).not.toBe(url);
	expect(other.owner.resolveObjectUrl(url)).toBeUndefined();
	const snapshot = test.owner.resolveObjectUrl(`${url}#fragment`);
	expect(snapshot?.type).toBe("text/plain");
	snapshot?.bytes.fill(0);
	expect(test.owner.resolveObjectUrl(url)?.bytes).toEqual(
		new Uint8Array([111, 107]),
	);
	test.evaluate(
		"URL.revokeObjectURL(url+'#fragment'); URL.revokeObjectURL('not a URL')",
	);
	expect(test.owner.resolveObjectUrl(url)).toBeUndefined();
	expect(await test.evaluate("blob.text()")).toBe("ok");
	expect(
		fixture({}, "data:text/plain,opaque").evaluate(
			"URL.createObjectURL(new Blob())",
		),
	).toMatch(/^blob:null\//);
});

it("enforces byte, retained storage, blob, URL and lifetime URL quotas atomically", () => {
	const test = fixture({
		maxBlobBytes: 6,
		maxRetainedBytes: 8,
		maxBlobs: 2,
		maxObjectUrls: 1,
		maxCreatedUrls: 2,
	});
	test.evaluate("var blob = new Blob(['abc'])");
	for (const source of [
		"new Blob(['雪雪雪'])",
		"new Blob([new Uint8Array(7)])",
		"new Blob(['abcdef'])",
	])
		expect(() => test.evaluate(source)).toThrow(/limit/i);
	expect(test.owner.metrics()).toMatchObject({ blobs: 1, retainedBytes: 3 });
	test.evaluate("new Blob(['de'])");
	expect(() => test.evaluate("new Blob()")).toThrow(/limit/i);
	test.evaluate("var url = URL.createObjectURL(blob)");
	expect(() => test.evaluate("URL.createObjectURL(blob)")).toThrow(/limit/i);
	test.evaluate(
		"URL.revokeObjectURL(url); url = URL.createObjectURL(blob); URL.revokeObjectURL(url)",
	);
	expect(() => test.evaluate("URL.createObjectURL(blob)")).toThrow(/limit/i);
});

it("closes iterators on part limits, bounds work and rolls back failed publication", () => {
	const test = fixture({ maxParts: 2 });
	expect(() =>
		test.evaluate(
			`var closed = false; new Blob({*[Symbol.iterator]() {try {while(true) yield 'x';} finally {closed = true;}}})`,
		),
	).toThrow(/limit/i);
	expect(test.evaluate("closed")).toBe(true);
	const work = fixture({ maxWork: 8 });
	expect(() => work.evaluate("new Blob(['abcdef'])")).toThrow(/limit/i);
	expect(work.owner.metrics()).toMatchObject({ blobs: 0, retainedBytes: 0 });
	const failed = fixture();
	failed.failFactory();
	expect(() => failed.evaluate("new Blob(['x'])")).toThrow(/factory/i);
	expect(failed.owner.metrics()).toMatchObject({ blobs: 0, retainedBytes: 0 });
});

it("rejects native accessor/proxy ingress without invoking it", () => {
	const test = fixture();
	const trap = vi.fn(() => "text");
	const api = test.owner.port as {
		create(parts: unknown, type: unknown, endings: unknown): unknown;
	};
	for (const parts of [
		[
			{
				get kind() {
					return trap();
				},
				value: "x",
			},
		],
		new Proxy([], { get: trap }),
		[{ kind: "bytes", value: [256] }],
	])
		expect(() => api.create(parts, "", "transparent")).toThrow();
	expect(trap).not.toHaveBeenCalled();
	expect(test.owner.metrics().blobs).toBe(0);
});

it.each([0, -1, 1.5, NaN, Infinity, pageBlobLimits.maxBlobs + 1])(
	"rejects invalid limit %s",
	(maxBlobs) => {
		expect(() => fixture({ maxBlobs })).toThrow(/limits/i);
	},
);

it.each(["close", "abort"])(
	"revokes saved capabilities and releases storage on %s",
	async (kind) => {
		const test = fixture();
		test.evaluate(
			"var blob = new Blob(['x']), SavedBlob = Blob, create = URL.createObjectURL, url = create(blob)",
		);
		if (kind === "abort") test.controller.abort();
		else test.owner.close();
		for (const source of [
			"blob.size",
			"blob.type",
			"blob.slice()",
			"new SavedBlob()",
			"create(blob)",
			"URL.revokeObjectURL(url)",
		])
			expect(() => test.evaluate(source)).toThrow(/closed/i);
		await expect(test.evaluate("blob.text()")).rejects.toThrow(/closed/i);
		expect(() => test.owner.resolveObjectUrl(test.evaluate("url"))).toThrow(
			/closed/i,
		);
		expect(test.owner.metrics()).toMatchObject({
			closed: true,
			blobs: 0,
			objectUrls: 0,
			retainedBytes: 0,
		});
	},
);

it("bounds type and generated URL lengths without publishing unusable URLs", () => {
	const test = fixture({ maxTypeCodeUnits: 4, maxUrlCodeUnits: 32 });
	expect(() => test.evaluate("new Blob([], {type: 'long/type'})")).toThrow(
		/limit/i,
	);
	expect(test.owner.metrics().blobs).toBe(0);
	test.evaluate("var blob = new Blob(['x'])");
	expect(() => test.evaluate("blob.slice(0, 1, 'long/type')")).toThrow(
		/limit/i,
	);
	expect(() => test.evaluate("URL.createObjectURL(blob)")).toThrow(/limit/i);
	expect(test.owner.metrics()).toMatchObject({
		blobs: 1,
		objectUrls: 0,
		createdUrls: 0,
		retainedBytes: 1,
	});
});
