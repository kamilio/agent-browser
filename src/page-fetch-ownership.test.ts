import { Buffer } from "node:buffer";
import { afterEach, expect, it } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkResponse } from "./network.js";
import {
	PageFetch,
	type PageFetchLimits,
	type PageFetchTransport,
} from "./page-fetch.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

interface ResponseView {
	status: number;
	url: string;
	bodyUsed: boolean;
	headers: { get(name: string): string | null; has(name: string): boolean };
	text(): Promise<string>;
	json(): Promise<unknown>;
	clone(): ResponseView;
}

const trees: DocumentTree[] = [];
afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function hostObject(definition: ScriptHostObjectDefinition): object {
	const capability = Object.create(null);
	for (const [name, property] of Object.entries(definition.properties ?? {}))
		Object.defineProperty(capability, name, property);
	for (const [name, method] of Object.entries(definition.methods ?? {}))
		Object.defineProperty(capability, name, { value: method });
	return capability;
}

function fixture(
	options: {
		body?: Uint8Array;
		limits?: Partial<PageFetchLimits>;
		response?: Partial<NetworkResponse>;
		provide?: (
			definition: ScriptHostObjectDefinition,
			call: number,
			owner: PageFetch,
		) => unknown;
	} = {},
) {
	const tree = new DocumentTree("https://fixture.invalid/page");
	trees.push(tree);
	const body = options.body ?? new TextEncoder().encode("payload");
	let calls = 0;
	const owner: PageFetch = new PageFetch(
		tree,
		{
			createHostObject(definition): object {
				calls++;
				return (
					options.provide
						? options.provide(definition, calls, owner)
						: hostObject(definition)
				) as object;
			},
		},
		async (request) => ({
			url: request.url,
			status: 200,
			headers: { "content-type": ["text/plain"], "x-test": ["retained"] },
			body,
			redirects: [],
			encodedBytes: body.byteLength,
			elapsedMs: 0,
			...options.response,
		}),
		{ limits: options.limits },
	);
	return {
		tree,
		owner,
		body,
		fetch: async (init?: unknown) =>
			(await owner.fetch("/data", init)) as ResponseView,
	};
}

it.each([1, 2])(
	"releases unpublished body storage when capability creation %s fails",
	async (failure) => {
		const { owner, fetch } = fixture({
			provide: (definition, call) => {
				if (call === failure) throw new Error("factory failed");
				return hostObject(definition);
			},
		});
		await expect(fetch()).rejects.toThrow("factory failed");
		expect(owner.metrics()).toMatchObject({
			retainedBytes: 0,
			active: 0,
			closed: false,
		});
	},
);

it.each([1, 2])(
	"does not publish a response after closure in capability creation %s",
	async (stage) => {
		const { owner, fetch } = fixture({
			provide: (definition, call, owner) => {
				if (call === stage) owner.close();
				return hostObject(definition);
			},
		});
		const outcome = await fetch().then(
			() => ({ fulfilled: true }),
			(error: unknown) => ({ fulfilled: false, error }),
		);
		expect(outcome).toMatchObject({
			fulfilled: false,
			error: { code: "closed" },
		});
		expect(owner.metrics()).toMatchObject({
			retainedBytes: 0,
			active: 0,
			closed: true,
		});
	},
);

it("owns a copy of Buffer-backed transport bytes", async () => {
	const body = Buffer.from("payload");
	const { fetch } = fixture({ body });
	const response = await fetch();
	body.fill(120);
	expect(await response.text()).toBe("payload");
});

it("does not invoke a transport byte view's overridable slice method", async () => {
	let calls = 0;
	class ForeignBytes extends Uint8Array {
		override slice(): never {
			calls++;
			throw new Error("foreign slice");
		}
	}
	const { fetch } = fixture({ body: new ForeignBytes([65, 66]) });
	expect(await (await fetch()).text()).toBe("AB");
	expect(calls).toBe(0);
});

it("revokes all partial capabilities if response publication fails", async () => {
	const escaped: object[] = [];
	const { fetch } = fixture({
		provide: (definition, call) => {
			const capability = hostObject(definition);
			escaped.push(capability);
			if (call === 2) throw new Error("publication failed");
			return capability;
		},
	});
	await expect(fetch()).rejects.toThrow("publication failed");
	expect(() => (escaped[0] as ResponseView["headers"]).get("x-test")).toThrow(
		/revoked/,
	);
	expect(() => (escaped[1] as ResponseView).status).toThrow(/revoked/);
	await expect((escaped[1] as ResponseView).text()).rejects.toThrow(/revoked/);
});

it.each([null, 1, "capability", undefined])(
	"rejects invalid response capabilities: %s",
	async (value) => {
		const { owner, fetch } = fixture({ provide: () => value });
		await expect(fetch()).rejects.toThrow(/capability/);
		expect(owner.metrics().retainedBytes).toBe(0);
	},
);

it.each([null, 1, "capability", undefined])(
	"rejects an invalid final response capability: %s",
	async (value) => {
		const { owner, fetch } = fixture({
			provide: (definition, call) =>
				call === 2 ? value : hostObject(definition),
		});
		await expect(fetch()).rejects.toThrow(/capability/);
		expect(owner.metrics()).toMatchObject({ retainedBytes: 0, active: 0 });
	},
);

it("recovers body retention capacity after a failed response construction", async () => {
	const { owner, fetch } = fixture({
		limits: { maxRetainedBytes: 7 },
		provide: (definition, call) => {
			if (call === 2) throw new Error("first response failed");
			return hostObject(definition);
		},
	});
	await expect(fetch()).rejects.toThrow("first response failed");
	const response = await fetch();
	expect(owner.metrics()).toMatchObject({
		responses: 2,
		retainedBytes: 7,
		closed: false,
	});
	expect(await response.text()).toBe("payload");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("keeps failed construction charged to the lifetime response-attempt budget", async () => {
	const { owner, fetch } = fixture({
		limits: { maxResponses: 1 },
		provide: () => {
			throw new Error("factory failed");
		},
	});
	await expect(fetch()).rejects.toThrow("factory failed");
	await expect(fetch()).rejects.toThrow(/retention limit/);
	expect(owner.metrics()).toMatchObject({
		responses: 1,
		retainedBytes: 0,
		closed: false,
	});
});

it.each([3, 4])(
	"preserves the original response when clone capability creation %s fails",
	async (failure) => {
		const { owner, fetch } = fixture({
			provide: (definition, call) => {
				if (call === failure) throw new Error("clone factory failed");
				return hostObject(definition);
			},
		});
		const response = await fetch();
		expect(() => response.clone()).toThrow("clone factory failed");
		expect(owner.metrics()).toMatchObject({
			retainedBytes: 7,
			responses: 2,
			closed: false,
		});
		expect(response.bodyUsed).toBe(false);
		expect(response.headers.get("x-test")).toBe("retained");
		expect(await response.text()).toBe("payload");
		expect(owner.metrics().retainedBytes).toBe(0);
	},
);

it("reserves clone storage before entering a reentrant capability factory", async () => {
	const { owner, fetch } = fixture({
		limits: { maxRetainedBytes: 14 },
		provide: (definition, call) => {
			if (call === 3) expect(() => response.clone()).toThrow(/retention limit/);
			return hostObject(definition);
		},
	});
	const response = await fetch();
	const clone = response.clone();
	expect(owner.metrics()).toMatchObject({ responses: 2, retainedBytes: 14 });
	expect(await clone.text()).toBe("payload");
	expect(await response.text()).toBe("payload");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("rejects capability reuse between headers and the response", async () => {
	let shared: object | undefined;
	const { owner, fetch } = fixture({
		provide: (definition) => {
			shared ??= hostObject(definition);
			return shared;
		},
	});
	await expect(fetch()).rejects.toThrow(/Invalid fetch response capability/);
	expect(owner.metrics().retainedBytes).toBe(0);
	expect(() => (shared as ResponseView["headers"]).get("x-test")).toThrow(
		/revoked/,
	);
});

it("rejects identity reuse from an earlier response without revoking that response", async () => {
	let earlierHeaders: object | undefined;
	const { owner, fetch } = fixture({
		provide: (definition, call) => {
			if (call === 3) return earlierHeaders;
			const capability = hostObject(definition);
			if (call === 1) earlierHeaders = capability;
			return capability;
		},
	});
	const first = await fetch();
	await expect(fetch()).rejects.toThrow(/Invalid fetch response capability/);
	expect(first.headers.has("x-test")).toBe(true);
	expect(await first.text()).toBe("payload");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("blocks reads, consumption and cloning until both capabilities are published", async () => {
	const early: Promise<unknown>[] = [];
	const { owner, fetch } = fixture({
		provide: (definition, call) => {
			if (call === 1)
				expect(() => definition.methods?.get("x-test")).toThrow(
					/not yet published/,
				);
			if (call === 2) {
				expect(() => definition.properties?.status.get()).toThrow(
					/not yet published/,
				);
				expect(() => definition.methods?.clone()).toThrow(/not yet published/);
				const consumed = definition.methods?.text() as Promise<unknown>;
				void consumed.catch(() => {});
				early.push(consumed);
			}
			return hostObject(definition);
		},
	});
	const response = await fetch();
	await expect(early[0]).rejects.toThrow(/not yet published/);
	expect(response.bodyUsed).toBe(false);
	expect(owner.metrics()).toMatchObject({ responses: 1, retainedBytes: 7 });
	expect(await response.text()).toBe("payload");
});

it("copies a subarray's visible bytes, not its entire backing buffer", async () => {
	const bytes = new TextEncoder().encode("prefix-payload-suffix");
	const { owner, fetch } = fixture({ body: bytes.subarray(7, 14) });
	const response = await fetch();
	bytes.fill(120);
	expect(owner.metrics().retainedBytes).toBe(7);
	expect(await response.text()).toBe("payload");
});

it("keeps Buffer-backed clones independent of later source mutation", async () => {
	const bytes = Buffer.from("payload");
	const { owner, fetch } = fixture({ body: bytes });
	const response = await fetch();
	const clone = response.clone();
	bytes.fill(120);
	expect(await response.text()).toBe("payload");
	expect(clone.bodyUsed).toBe(false);
	expect(owner.metrics().retainedBytes).toBe(7);
	expect(await clone.text()).toBe("payload");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("does not consult typed-array species or iteration hooks when copying bytes", async () => {
	let calls = 0;
	class ForeignBytes extends Uint8Array {
		static get [Symbol.species]() {
			calls++;
			throw new Error("species hook");
		}
		override [Symbol.iterator](): ArrayIterator<number> {
			calls++;
			throw new Error("iterator hook");
		}
	}
	const { fetch } = fixture({ body: new ForeignBytes([65, 66]) });
	expect(await (await fetch()).text()).toBe("AB");
	expect(calls).toBe(0);
});

it.each(["HEAD", 204, 205, 304])(
	"preserves reusable null bodies for %s",
	async (kind) => {
		const { owner, fetch } = fixture({
			response: typeof kind === "number" ? { status: kind } : {},
		});
		const response = await fetch(
			kind === "HEAD" ? { method: "HEAD" } : undefined,
		);
		const clone = response.clone();
		expect(await response.text()).toBe("");
		expect(await response.text()).toBe("");
		expect(response.bodyUsed).toBe(false);
		expect(await clone.text()).toBe("");
		expect(owner.metrics().retainedBytes).toBe(0);
	},
);

it("distinguishes an empty non-null body from a reusable null body", async () => {
	const { owner, fetch } = fixture({ body: new Uint8Array() });
	const response = await fetch();
	const clone = response.clone();
	expect(await response.text()).toBe("");
	expect(response.bodyUsed).toBe(true);
	await expect(response.text()).rejects.toThrow(/already consumed/);
	expect(await clone.text()).toBe("");
	expect(owner.metrics().retainedBytes).toBe(0);
});

it("releases bytes even when JSON parsing fails", async () => {
	const { owner, fetch } = fixture();
	const response = await fetch();
	await expect(response.json()).rejects.toBeInstanceOf(SyntaxError);
	expect(response.bodyUsed).toBe(true);
	expect(owner.metrics().retainedBytes).toBe(0);
	expect(() => response.clone()).toThrow(/already consumed/);
});

it("close remains idempotent after failed and successful body releases", async () => {
	const { owner, tree, fetch } = fixture({
		provide: (definition, call) => {
			if (call === 2) throw new Error("first failure");
			return hostObject(definition);
		},
	});
	await expect(fetch()).rejects.toThrow("first failure");
	const response = await fetch();
	const clone = response.clone();
	await response.text();
	tree.close();
	owner.close();
	expect(owner.metrics()).toMatchObject({
		closed: true,
		retainedBytes: 0,
		active: 0,
	});
	expect(() => clone.clone()).toThrow(/closed/);
	await expect(clone.text()).rejects.toThrow(/closed/);
});

it.each([null, {}, { createHostObject: 1 }])(
	"rejects invalid capability providers before subscribing: %j",
	(factory) => {
		const { tree } = fixture();
		expect(
			() =>
				new PageFetch(
					tree,
					factory as unknown as ScriptHostObjectFactory,
					async () => {
						throw new Error("unreachable transport");
					},
				),
		).toThrow(/provider/);
		for (let index = 0; index < 63; index++) tree.onClose(() => {});
	},
);

it.each([null, {}])(
	"rejects invalid transport providers before subscribing: %j",
	(transport) => {
		const { tree } = fixture();
		expect(
			() =>
				new PageFetch(
					tree,
					{ createHostObject: hostObject },
					transport as PageFetchTransport,
				),
		).toThrow(/provider/);
		for (let index = 0; index < 63; index++) tree.onClose(() => {});
	},
);
