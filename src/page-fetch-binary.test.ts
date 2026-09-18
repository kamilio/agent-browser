import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import { PageAbortSignals } from "./page-abort-signals.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface ResponseFixture {
	status: number;
	ok: boolean;
	url: string;
	type: string;
	bodyUsed: boolean;
	headers: { get(name: string): string | null };
	arrayBuffer(): Promise<ArrayBuffer>;
	text(): Promise<string>;
	json(): Promise<unknown>;
	clone(): ResponseFixture;
}

const owners: PageFetch[] = [];
const registries: PageAbortSignals[] = [];
const trees: DocumentTree[] = [];
const consumers = ["arrayBuffer", "text", "json"] as const;

afterEach(() => {
	vi.restoreAllMocks();
	for (const owner of owners.splice(0)) owner.close();
	for (const registry of registries.splice(0)) registry.close();
	for (const tree of trees.splice(0)) tree.close();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const capability = { ...definition.methods };
	for (const [name, descriptor] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(capability, name, descriptor);
	return capability;
}

function response(
	input: NetworkRequest,
	body: Uint8Array,
	overrides: Partial<NetworkResponse> = {},
): NetworkResponse {
	return {
		url: input.url,
		status: 200,
		headers: { "content-type": ["application/octet-stream"] },
		body,
		redirects: [],
		encodedBytes: body.byteLength,
		elapsedMs: 0,
		...overrides,
	};
}

function fixture(
	options: {
		body?: Uint8Array;
		response?: Partial<NetworkResponse>;
		limits?: Partial<PageFetchLimits>;
		handler?: PageFetchTransport;
	} = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/page");
	trees.push(tree);
	const body = options.body ?? new Uint8Array([0, 128, 255]);
	let implementation = hostObject;
	const factory = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			return implementation(definition);
		},
	};
	const signals = new PageAbortSignals(tree, factory);
	registries.push(signals);
	const request = vi.fn(
		options.handler ??
			(async (input: NetworkRequest) =>
				response(input, body, options.response)),
	);
	const owner = new PageFetch(tree, factory, request, {
		limits: options.limits,
		signals,
	});
	owners.push(owner);
	return {
		tree,
		owner,
		signals,
		request,
		fetch: async (input = "/data", init?: unknown) =>
			(await owner.fetch(input, init)) as ResponseFixture,
		setFactory(next: typeof hostObject) {
			implementation = next;
		},
	};
}

it("returns exact arbitrary bytes without decoding NUL, invalid UTF-8 or a BOM", async () => {
	const bytes = new Uint8Array([
		239, 187, 191, 0, 255, 192, 175, 128, 195, 40, 65,
	]);
	const test = fixture({ body: bytes });
	const result = await test.fetch();
	const decode = vi
		.spyOn(TextDecoder.prototype, "decode")
		.mockImplementation(() => {
			throw new Error("binary bodies must not be decoded");
		});
	const buffer = await result.arrayBuffer();
	expect(buffer).toBeInstanceOf(ArrayBuffer);
	expect(buffer.byteLength).toBe(bytes.byteLength);
	expect(new Uint8Array(buffer)).toEqual(bytes);
	expect(decode).not.toHaveBeenCalled();
	expect(result.bodyUsed).toBe(true);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it.each(["Uint8Array", "Buffer"])(
	"copies only a %s transport subarray and isolates mutations in both directions",
	async (kind) => {
		const backing =
			kind === "Buffer"
				? Buffer.from([91, 92, 0, 255, 128, 93, 94])
				: new Uint8Array([91, 92, 0, 255, 128, 93, 94]);
		const source = backing.subarray(2, 5);
		const test = fixture({ body: source });
		const result = await test.fetch();
		backing.fill(17);
		expect(test.owner.metrics().retainedBytes).toBe(3);
		const buffer = await result.arrayBuffer();
		expect(buffer).not.toBe(source.buffer);
		expect(buffer.byteLength).toBe(3);
		expect([...new Uint8Array(buffer)]).toEqual([0, 255, 128]);
		new Uint8Array(buffer).fill(42);
		expect([...backing]).toEqual([17, 17, 17, 17, 17, 17, 17]);
		backing.fill(99);
		expect([...new Uint8Array(buffer)]).toEqual([42, 42, 42]);
	},
);

it("keeps original, clone and later clone buffers independently owned", async () => {
	const test = fixture();
	const result = await test.fetch();
	const clone = result.clone();
	const buffer = await result.arrayBuffer();
	new Uint8Array(buffer).fill(11);
	expect(clone.bodyUsed).toBe(false);
	expect(test.owner.metrics().retainedBytes).toBe(3);
	const laterClone = clone.clone();
	const cloneBuffer = await clone.arrayBuffer();
	expect(cloneBuffer).not.toBe(buffer);
	expect([...new Uint8Array(cloneBuffer)]).toEqual([0, 128, 255]);
	new Uint8Array(cloneBuffer).fill(22);
	const laterBuffer = await laterClone.arrayBuffer();
	expect(laterBuffer).not.toBe(cloneBuffer);
	expect(laterBuffer).not.toBe(buffer);
	expect([...new Uint8Array(laterBuffer)]).toEqual([0, 128, 255]);
	expect([...new Uint8Array(buffer)]).toEqual([11, 11, 11]);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it.each(consumers)(
	"shares one-shot consumption after %s and rejects later reads asynchronously",
	async (first) => {
		const bytes = new TextEncoder().encode('{"answer":42}');
		const test = fixture({ body: bytes });
		const result = await test.fetch();
		expect(result.bodyUsed).toBe(false);
		const value = await result[first]();
		if (first === "arrayBuffer")
			expect(new Uint8Array(value as ArrayBuffer)).toEqual(bytes);
		else
			expect(value).toEqual(
				first === "text" ? '{"answer":42}' : { answer: 42 },
			);
		expect(result.bodyUsed).toBe(true);
		for (const consumer of consumers) {
			let pending: Promise<unknown> | undefined;
			expect(() => {
				pending = result[consumer]();
			}).not.toThrow();
			await expect(pending).rejects.toThrow("already consumed");
		}
		expect(() => result.clone()).toThrow("already consumed");
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);

it.each(consumers)(
	"lets only the first concurrent consumer (%s) succeed",
	async (first) => {
		const test = fixture({ body: new TextEncoder().encode("42") });
		const result = await test.fetch();
		const pending = result[first]();
		expect(result.bodyUsed).toBe(true);
		const outcomes = await Promise.allSettled([
			pending,
			...consumers.map((consumer) => result[consumer]()),
		]);
		expect(outcomes[0].status).toBe("fulfilled");
		for (const outcome of outcomes.slice(1)) {
			expect(outcome.status).toBe("rejected");
			if (outcome.status === "rejected")
				expect(outcome.reason).toBeInstanceOf(TypeError);
		}
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);

it("preserves text BOM handling, replacement decoding and JSON parsing on clones", async () => {
	const bytes = new Uint8Array([239, 187, 191, 65, 0, 255, 195, 40]);
	const textTest = fixture({ body: bytes });
	const text = await textTest.fetch();
	const binary = text.clone();
	expect(await text.text()).toBe("A\0\ufffd\ufffd(");
	expect(new Uint8Array(await binary.arrayBuffer())).toEqual(bytes);
	const jsonBytes = new TextEncoder().encode('\uFEFF{"answer":42}');
	const jsonTest = fixture({ body: jsonBytes });
	const json = await jsonTest.fetch();
	const jsonBinary = json.clone();
	expect(await json.json()).toEqual({ answer: 42 });
	expect(new Uint8Array(await jsonBinary.arrayBuffer())).toEqual(jsonBytes);
	expect(textTest.owner.metrics().retainedBytes).toBe(0);
	expect(jsonTest.owner.metrics().retainedBytes).toBe(0);
});

it("consumes an empty non-null body once, independently of its clone", async () => {
	const test = fixture({ body: new Uint8Array() });
	const result = await test.fetch();
	const clone = result.clone();
	const buffer = await result.arrayBuffer();
	expect(buffer).toBeInstanceOf(ArrayBuffer);
	expect(buffer.byteLength).toBe(0);
	expect(result.bodyUsed).toBe(true);
	for (const consumer of consumers)
		await expect(result[consumer]()).rejects.toThrow("already consumed");
	expect(clone.bodyUsed).toBe(false);
	expect(await clone.arrayBuffer()).not.toBe(buffer);
	expect(clone.bodyUsed).toBe(true);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it.each(["HEAD", "204", "205", "304", "manual"])(
	"keeps a %s null body repeatable across consumers, clones and abort",
	async (kind) => {
		const test = fixture({
			response: {
				status: kind === "HEAD" ? 200 : kind === "manual" ? 302 : Number(kind),
				...(kind === "manual" ? { headers: { location: ["/secret"] } } : {}),
			},
		});
		const controller = new AbortController();
		const result = await test.fetch("/data", {
			signal: test.signals.publish(controller.signal),
			...(kind === "HEAD" ? { method: "HEAD" } : {}),
			...(kind === "manual" ? { redirect: "manual" } : {}),
		});
		expect(test.signals.metrics().subscriptions).toBe(0);
		controller.abort(new Error("no body to cancel"));
		for (const body of [result, result.clone()]) {
			const buffer = await body.arrayBuffer();
			expect(buffer).toBeInstanceOf(ArrayBuffer);
			expect(buffer.byteLength).toBe(0);
			expect(await body.arrayBuffer()).not.toBe(buffer);
			expect(await body.text()).toBe("");
			await expect(body.json()).rejects.toBeInstanceOf(SyntaxError);
			expect((await body.arrayBuffer()).byteLength).toBe(0);
			expect(body.bodyUsed).toBe(false);
		}
		if (kind === "manual") {
			expect(result).toMatchObject({
				status: 0,
				ok: false,
				url: "",
				type: "opaqueredirect",
			});
			expect(result.headers.get("location")).toBeNull();
			expect(test.request).toHaveBeenCalledTimes(1);
		}
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);

it("exposes exact CORS-approved bytes without exposing protected headers", async () => {
	const test = fixture({
		response: {
			headers: {
				"access-control-allow-origin": ["https://fixture.invalid"],
				"access-control-expose-headers": ["x-visible, set-cookie"],
				"x-visible": ["yes"],
				"x-private": ["secret"],
				"set-cookie": ["secret=value"],
			},
		},
	});
	const result = await test.fetch("https://other.invalid/data");
	expect(result.type).toBe("cors");
	expect(result.headers.get("x-visible")).toBe("yes");
	expect(result.headers.get("x-private")).toBeNull();
	expect(result.headers.get("set-cookie")).toBeNull();
	expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([
		0, 128, 255,
	]);
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it("does not publish a binary body when CORS permission is absent", async () => {
	const test = fixture();
	await expect(test.fetch("https://other.invalid/data")).rejects.toThrow();
	expect(test.owner.metrics()).toMatchObject({
		responses: 0,
		retainedBytes: 0,
		active: 0,
	});
});

it("releases retained capacity on binary consumption without refunding response slots", async () => {
	const test = fixture({ limits: { maxRetainedBytes: 6, maxResponses: 3 } });
	const result = await test.fetch();
	const clone = result.clone();
	expect(test.owner.metrics().retainedBytes).toBe(6);
	expect(() => clone.clone()).toThrow("retention");
	await result.arrayBuffer();
	expect(test.owner.metrics().retainedBytes).toBe(3);
	const laterClone = clone.clone();
	await clone.arrayBuffer();
	await laterClone.arrayBuffer();
	expect(test.owner.metrics()).toMatchObject({
		retainedBytes: 0,
		responses: 3,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.owner.metrics().retainedBytes).toBe(0);
});

it.each(["maxResponseBytes", "maxRetainedBytes", "maxTotalBytes"] as const)(
	"enforces %s before publishing binary bytes",
	async (limit) => {
		const test = fixture({ limits: { [limit]: 2 } });
		await expect(test.fetch()).rejects.toMatchObject({
			code: "resource-limit",
		});
		expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
	},
);

it("does not refund cumulative byte charges after consuming binary bodies and clones", async () => {
	const test = fixture({ limits: { maxTotalBytes: 6, maxRetainedBytes: 6 } });
	const result = await test.fetch();
	const clone = result.clone();
	await result.arrayBuffer();
	await clone.arrayBuffer();
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 3,
		retainedBytes: 0,
	});
	await (await test.fetch()).arrayBuffer();
	expect(test.owner.metrics()).toMatchObject({
		totalBytes: 6,
		retainedBytes: 0,
	});
	await expect(test.fetch()).rejects.toMatchObject({ code: "resource-limit" });
	expect(test.request).toHaveBeenCalledTimes(2);
});

it.each([{ cancelled: true }, null, false, 0])(
	"preserves abort reason %j across unread binary bodies and clones",
	async (reason) => {
		const test = fixture();
		const controller = new AbortController();
		const result = await test.fetch("/data", {
			signal: test.signals.publish(controller.signal),
		});
		const clone = result.clone();
		controller.abort(reason);
		expect(test.owner.metrics().retainedBytes).toBe(0);
		expect(test.signals.metrics().subscriptions).toBe(0);
		for (const body of [result, clone, clone.clone()]) {
			expect(body.bodyUsed).toBe(false);
			let pending: Promise<ArrayBuffer> | undefined;
			expect(() => {
				pending = body.arrayBuffer();
			}).not.toThrow();
			await expect(pending).rejects.toBe(reason);
			expect(body.bodyUsed).toBe(true);
			expect(body.status).toBe(200);
			for (const consumer of consumers)
				await expect(body[consumer]()).rejects.toThrow("already consumed");
		}
	},
);

it("aborts an empty non-null binary body rather than treating it as reusable", async () => {
	const test = fixture({ body: new Uint8Array() });
	const controller = new AbortController();
	const reason = new Error("empty but cancellable");
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	controller.abort(reason);
	await expect(result.arrayBuffer()).rejects.toBe(reason);
	expect(result.bodyUsed).toBe(true);
	expect(test.signals.metrics().subscriptions).toBe(0);
});

it("keeps a consumed buffer valid when abort cancels its unread clone", async () => {
	const test = fixture();
	const controller = new AbortController();
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	const pending = result.arrayBuffer();
	expect(test.signals.metrics().subscriptions).toBeGreaterThan(0);
	const reason = new Error("cancel only unread bytes");
	controller.abort(reason);
	expect([...new Uint8Array(await pending)]).toEqual([0, 128, 255]);
	await expect(result.arrayBuffer()).rejects.toThrow("already consumed");
	await expect(clone.arrayBuffer()).rejects.toBe(reason);
	expect(test.owner.metrics().retainedBytes).toBe(0);
	expect(test.signals.metrics().subscriptions).toBe(0);
});

it("releases the signal subscription after all binary clones are consumed", async () => {
	const test = fixture();
	const controller = new AbortController();
	const result = await test.fetch("/data", {
		signal: test.signals.publish(controller.signal),
	});
	const clone = result.clone();
	await result.arrayBuffer();
	expect(test.signals.metrics().subscriptions).toBeGreaterThan(0);
	await clone.arrayBuffer();
	expect(test.signals.metrics().subscriptions).toBe(0);
	controller.abort(new Error("after consumption"));
	await expect(clone.arrayBuffer()).rejects.toThrow("already consumed");
});

it.each(["before", "during"])(
	"preserves cancellation %s transport publication without retaining binary bytes",
	async (stage) => {
		const controller = new AbortController();
		const reason = { cancelled: stage };
		const test = fixture({
			handler: async (input) => {
				controller.abort(reason);
				return response(input, new Uint8Array([0, 255]));
			},
		});
		const signal = test.signals.publish(controller.signal);
		if (stage === "before") controller.abort(reason);
		await expect(test.fetch("/data", { signal })).rejects.toBe(reason);
		expect(test.request).toHaveBeenCalledTimes(stage === "before" ? 0 : 1);
		expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
		expect(test.signals.metrics().subscriptions).toBe(0);
	},
);

it.each(["owner", "tree", "signals"] as const)(
	"rejects binary reads after %s closure while preserving already returned buffers",
	async (kind) => {
		const test = fixture();
		const controller = new AbortController();
		const result = await test.fetch("/data", {
			signal: test.signals.publish(controller.signal),
		});
		const clone = result.clone();
		const buffer = await result.arrayBuffer();
		test[kind].close();
		let pending: Promise<ArrayBuffer> | undefined;
		expect(() => {
			pending = clone.arrayBuffer();
		}).not.toThrow();
		await expect(pending).rejects.toMatchObject({ code: "closed" });
		expect([...new Uint8Array(buffer)]).toEqual([0, 128, 255]);
		expect(test.owner.metrics().retainedBytes).toBe(0);
		expect(test.signals.metrics().subscriptions).toBe(0);
		expect(controller.signal.aborted).toBe(false);
	},
);

it("rejects premature binary reads asynchronously without consuming the published body", async () => {
	const test = fixture();
	const early: Promise<ArrayBuffer>[] = [];
	test.setFactory((definition) => {
		const capability = hostObject(definition);
		if (definition.methods?.arrayBuffer) {
			const pending = (capability as ResponseFixture).arrayBuffer();
			void pending.catch(() => {});
			early.push(pending);
		}
		return capability;
	});
	const result = await test.fetch();
	expect(early).toHaveLength(1);
	await expect(early[0]).rejects.toThrow("not yet published");
	expect(result.bodyUsed).toBe(false);
	expect(test.owner.metrics().retainedBytes).toBe(3);
	expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([
		0, 128, 255,
	]);
});

it("releases storage and revokes escaped binary readers when capability allocation fails", async () => {
	const test = fixture();
	const failure = new RangeError("capability allocation failed");
	let escaped: ResponseFixture | undefined;
	test.setFactory((definition) => {
		const capability = hostObject(definition);
		if (definition.methods?.arrayBuffer) {
			escaped = capability as ResponseFixture;
			throw failure;
		}
		return capability;
	});
	await expect(test.fetch()).rejects.toBe(failure);
	expect(escaped).toBeDefined();
	let pending: Promise<ArrayBuffer> | undefined;
	expect(() => {
		pending = escaped?.arrayBuffer();
	}).not.toThrow();
	await expect(pending).rejects.toThrow("revoked");
	expect(test.owner.metrics()).toMatchObject({ active: 0, retainedBytes: 0 });
	test.setFactory(hostObject);
	expect([...new Uint8Array(await (await test.fetch()).arrayBuffer())]).toEqual(
		[0, 128, 255],
	);
});

it.each(["json", "text"] as const)(
	"keeps shared consumption final after a %s read failure and leaves clones readable",
	async (consumer) => {
		const test = fixture();
		const result = await test.fetch();
		const clone = result.clone();
		const failure = new RangeError("decoder allocation failed");
		if (consumer === "text")
			vi.spyOn(TextDecoder.prototype, "decode").mockImplementationOnce(() => {
				throw failure;
			});
		if (consumer === "text") await expect(result.text()).rejects.toBe(failure);
		else await expect(result.json()).rejects.toBeInstanceOf(SyntaxError);
		expect(result.bodyUsed).toBe(true);
		expect(test.owner.metrics().retainedBytes).toBe(3);
		await expect(result.arrayBuffer()).rejects.toThrow("already consumed");
		expect([...new Uint8Array(await clone.arrayBuffer())]).toEqual([
			0, 128, 255,
		]);
		expect(test.owner.metrics().retainedBytes).toBe(0);
	},
);
