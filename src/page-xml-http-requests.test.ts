import { afterEach, expect, it, vi } from "vitest";
import { DocumentTree } from "./document.js";
import type { NetworkRequest, NetworkResponse } from "./network.js";
import type { PageBindingContext } from "./page-bindings.js";
import { PageFetch } from "./page-fetch.js";
import {
	PageXmlHttpRequests,
	pageXmlHttpRequestLimits,
} from "./page-xml-http-requests.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

interface RequestCapability {
	readyState: number;
	generation: number;
	status: number;
	statusText: string;
	responseURL: string;
	responseText: string;
	failure: string;
	timeout: number;
	withCredentials: boolean;
	responseType: string;
	open(method: unknown, url: unknown, async: unknown): void;
	setRequestHeader(name: unknown, value: unknown): void;
	getResponseHeader(name: unknown): string | null;
	getAllResponseHeaders(): string;
	prepare(body?: unknown): number;
	advance(generation: number, state: number): boolean;
	abort(): boolean;
	resetAbort(generation: number): void;
}
interface Bootstrap {
	publish(value: unknown): void;
	create(): RequestCapability;
	sendSync(request: unknown): Promise<number>;
	sendAsync(request: unknown): Promise<number>;
}

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const document of documents.splice(0)) document.close();
	vi.useRealTimers();
});

function response(url: string): NetworkResponse {
	return {
		url,
		status: 200,
		headers: {
			"content-type": ["text/plain"],
			"x-result": ["yes"],
			"set-cookie": ["private=fixture"],
		},
		body: new TextEncoder().encode("answer:42"),
		redirects: [],
		encodedBytes: 9,
		elapsedMs: 0,
	};
}

function fixture(
	provider: (input: NetworkRequest) => Promise<NetworkResponse> = async (
		input,
	) => response(input.url),
) {
	const tree = new DocumentTree("https://example.com/join");
	documents.push(tree);
	const context: PageBindingContext = {
		createHostObject(definition: ScriptHostObjectDefinition) {
			const object = { ...definition.methods };
			for (const [name, descriptor] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, descriptor);
			return object;
		},
		retainGuestArguments: (operation) => operation,
		releaseGuestReference: vi.fn(),
		nestedOperation: vi.fn((operation) => operation),
	};
	const transport = vi.fn(provider);
	const network = new PageFetch(tree, context, transport);
	const owner = new PageXmlHttpRequests(tree, context, network);
	const port = owner.bootstrap() as Bootstrap;
	const xhrConstructor = function XMLHttpRequest() {};
	port.publish(xhrConstructor);
	const request = port.create();
	return {
		tree,
		context,
		network,
		owner,
		port,
		request,
		transport,
		xhrConstructor,
	};
}

it("registers one await-result operation and retains only the constructor", () => {
	const { owner, port, context, xhrConstructor } = fixture();
	expect(context.nestedOperation).toHaveBeenCalledTimes(1);
	expect(context.nestedOperation).toHaveBeenCalledWith(port.sendSync);
	expect(owner.constructorValue).toBe(xhrConstructor);
	expect(() => owner.bootstrap()).toThrow();
	expect(() => port.publish({})).toThrow();
	owner.close();
	owner.close();
	expect(context.releaseGuestReference).toHaveBeenCalledWith(xhrConstructor);
	expect(owner.metrics()).toMatchObject({
		closed: true,
		objects: 0,
		pending: 0,
	});
	expect(() => port.create()).toThrow();
});

it("uses same-origin native fetch for a synchronous text request and filters cookies", async () => {
	const { request, port, network, transport } = fixture();
	request.open("post", "/csrf#fragment", false);
	request.setRequestHeader("X-CSRF", "first");
	request.setRequestHeader("x-csrf", "second");
	request.setRequestHeader("Cookie", "must-not-send");
	const generation = request.prepare("sample");
	expect(request.readyState).toBe(1);
	await port.sendSync(request);
	expect(request.readyState).toBe(2);
	expect(request.status).toBe(200);
	expect(request.responseText).toBe("");
	expect(request.advance(generation, 3)).toBe(true);
	expect(request.responseText).toBe("answer:42");
	expect(request.advance(generation, 4)).toBe(true);
	expect(request.responseURL).toBe("https://example.com/csrf");
	expect(request.getResponseHeader("SET-cookie")).toBeNull();
	expect(request.getAllResponseHeaders()).toBe(
		"content-type: text/plain\r\nx-result: yes\r\n",
	);
	expect(transport.mock.calls[0][0]).toMatchObject({
		method: "POST",
		body: "sample",
		headers: { "x-csrf": "first, second" },
		cookieContext: { credentials: "same-origin", topLevelNavigation: false },
	});
	expect(transport.mock.calls[0][0].headers).not.toHaveProperty("cookie");
	expect(network.metrics().retainedBytes).toBeGreaterThan(0);
	request.open("GET", "/next", true);
	expect(network.metrics().retainedBytes).toBe(0);
});

it("drops GET bodies and honors explicit cross-origin credentials only with CORS", async () => {
	const { request, port, transport } = fixture(async (input) => ({
		...response(input.url),
		headers: {
			"access-control-allow-origin": ["https://example.com"],
			"access-control-allow-credentials": ["true"],
			"x-private": ["hidden"],
		},
	}));
	request.withCredentials = true;
	request.open("GET", "https://other.example/data", true);
	request.prepare("ignored");
	const generation = await port.sendAsync(request);
	request.advance(generation, 3);
	request.advance(generation, 4);
	expect(transport.mock.calls[0][0].body).toBeUndefined();
	expect(transport.mock.calls[0][0].cookieContext?.credentials).toBe("include");
	expect(request.getResponseHeader("x-private")).toBeNull();
});

it.each(["TRACE", "TRACK", "CONNECT", "", "BAD METHOD"])(
	"rejects invalid method %s before transport",
	(method) => {
		const { request, transport } = fixture();
		expect(() => request.open(method, "/", true)).toThrow();
		expect(transport).not.toHaveBeenCalled();
	},
);

it("rejects out-of-order mutation and unsupported response types", async () => {
	const { request, port } = fixture();
	expect(() => request.prepare()).toThrow();
	expect(() => request.setRequestHeader("x", "y")).toThrow();
	expect(() => {
		request.responseType = "blob";
	}).toThrow();
	request.open("GET", "/", false);
	expect(() => {
		request.timeout = 1;
	}).toThrow();
	expect(() => {
		request.responseType = "text";
	}).toThrow();
	request.prepare();
	expect(() => request.prepare()).toThrow();
	expect(() => request.setRequestHeader("x", "y")).toThrow();
	expect(() => {
		request.withCredentials = true;
	}).toThrow();
	expect(() => port.sendAsync(request)).toThrow();
	const generation = await port.sendSync(request);
	expect(() => request.advance(generation, 4)).toThrow();
	request.advance(generation, 3);
	request.advance(generation, 4);
	expect(() => request.prepare()).toThrow();
});

it("rejects ambiguous URLs, oversized headers and forged capabilities", () => {
	const { request, port } = fixture();
	expect(() =>
		request.open("GET", "https://user:secret@example.com", true),
	).toThrow();
	expect(() => request.open("GET", "\n/", true)).toThrow();
	expect(() => port.sendSync({})).toThrow();
	request.open("GET", "/", true);
	expect(() => request.setRequestHeader("bad:name", "x")).toThrow();
	expect(() => request.setRequestHeader("x", "value\nother")).toThrow();
	expect(() => request.setRequestHeader("x", "x".repeat(16_384))).toThrow();
	request.setRequestHeader("x", "ok");
});

it("cancels a pending request without allowing stale completion to replace a reopened request", async () => {
	let settle!: (response: NetworkResponse) => void;
	let delivered!: () => void;
	const started = new Promise<void>((resolve) => {
		delivered = resolve;
	});
	const { request, port, network } = fixture((input) => {
		delivered();
		return new Promise((resolve) => {
			settle = resolve;
		});
	});
	request.open("GET", "/old", true);
	const generation = request.prepare();
	const pending = port.sendAsync(request);
	const rejection = expect(pending).rejects.toBeDefined();
	await started;
	request.open("GET", "/new", true);
	await rejection;
	settle(response("https://example.com/old"));
	await Promise.resolve();
	expect(request.readyState).toBe(1);
	expect(request.responseText).toBe("");
	expect(request.advance(generation, 3)).toBe(false);
	expect(network.metrics().retainedBytes).toBe(0);
});

it("exposes network failure without inventing success", async () => {
	const { request, port } = fixture();
	request.open("GET", "http://example.com/insecure", true);
	request.prepare();
	await expect(port.sendAsync(request)).rejects.toMatchObject({
		code: "policy-denied",
	});
	expect(request.readyState).toBe(4);
	expect(request.status).toBe(0);
	expect(request.responseText).toBe("");
	expect(request.failure).toBe("error");
});

it("supports abort reset and preserves reentrant open", async () => {
	const { request, port } = fixture();
	request.open("GET", "/", true);
	request.prepare();
	await port.sendAsync(request);
	expect(request.abort()).toBe(true);
	const abortedGeneration = request.generation;
	expect(request.status).toBe(0);
	expect(request.readyState).toBe(4);
	request.open("GET", "/replacement", true);
	request.resetAbort(abortedGeneration);
	expect(request.readyState).toBe(1);
	expect(request.abort()).toBe(false);
	expect(request.readyState).toBe(0);
});

it("closes outstanding transport and rejects subsequent use", async () => {
	let delivered!: () => void;
	const started = new Promise<void>((resolve) => {
		delivered = resolve;
	});
	const { tree, request, port, owner, transport } = fixture(() => {
		delivered();
		return new Promise(() => {});
	});
	request.open("GET", "/", false);
	request.prepare();
	const result = expect(port.sendSync(request)).rejects.toBeDefined();
	await started;
	tree.close();
	await result;
	expect(transport.mock.calls[0][0].signal?.aborted).toBe(true);
	expect(owner.metrics().pending).toBe(0);
	expect(() => request.responseText).toThrow();
	expect(() => request.open("GET", "/", true)).toThrow();
});

it("bounds native object creation without relying on guest garbage collection", () => {
	const { port } = fixture();
	for (let index = 1; index < pageXmlHttpRequestLimits.maxObjects; index++)
		port.create();
	expect(() => port.create()).toThrow();
});

it("cancels only the timed-out asynchronous request", async () => {
	vi.useFakeTimers();
	const { request, port } = fixture(() => new Promise(() => {}));
	request.open("GET", "/", true);
	request.timeout = 10;
	request.prepare();
	const result = expect(port.sendAsync(request)).rejects.toMatchObject({
		code: "timeout",
	});
	await vi.advanceTimersByTimeAsync(10);
	await result;
	expect(request.failure).toBe("timeout");
	expect(request.status).toBe(0);
});

it.each(["abort", "open"])(
	"keeps a replacement request cancellable after reentrant %s",
	async (operation) => {
		let request!: RequestCapability;
		let port!: Bootstrap;
		let replacementStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			replacementStarted = resolve;
		});
		const pending: Promise<unknown>[] = [];
		const test = fixture(async (input) => {
			if (input.url.endsWith("/old")) {
				input.signal?.addEventListener(
					"abort",
					() => {
						request.open("GET", "/replacement", true);
						request.prepare();
						pending.push(port.sendAsync(request).catch(() => undefined));
					},
					{ once: true },
				);
			} else replacementStarted();
			return new Promise(() => {});
		});
		request = test.request;
		port = test.port;
		request.open("GET", "/old", true);
		request.prepare();
		pending.push(port.sendAsync(request).catch(() => undefined));
		for (
			let index = 0;
			index < 20 && test.transport.mock.calls.length === 0;
			index++
		)
			await Promise.resolve();
		expect(test.transport).toHaveBeenCalledTimes(1);
		if (operation === "abort") request.abort();
		else request.open("GET", "/outer", true);
		await started;
		const replacementSignal = test.transport.mock.calls[1][0].signal;
		try {
			expect(replacementSignal?.aborted).toBe(false);
			request.abort();
			expect(replacementSignal?.aborted).toBe(true);
		} finally {
			test.tree.close();
			await Promise.all(pending);
		}
	},
);

it("does not repopulate a closed owner after reentrant capability creation", () => {
	const { owner, context, port } = fixture();
	const create = context.createHostObject;
	context.createHostObject = (definition) => {
		const capability = create(definition);
		owner.close();
		return capability;
	};
	expect(() => port.create()).toThrow();
	expect(owner.metrics()).toMatchObject({ closed: true, objects: 0 });
});

it("rechecks the object bound after a reentrant factory admission", () => {
	const { context, port, owner } = fixture();
	for (let index = 1; index < pageXmlHttpRequestLimits.maxObjects - 1; index++)
		port.create();
	const create = context.createHostObject;
	let reenter = true;
	context.createHostObject = (definition) => {
		if (reenter) {
			reenter = false;
			port.create();
		}
		return create(definition);
	};
	expect(() => port.create()).toThrow();
	expect(owner.metrics().objects).toBe(pageXmlHttpRequestLimits.maxObjects);
});

it("does not publish a bootstrap port after reentrant owner closure", () => {
	const { tree, context, network } = fixture();
	const owner = new PageXmlHttpRequests(tree, context, network);
	const create = context.createHostObject;
	context.createHostObject = (definition) => {
		const capability = create(definition);
		owner.close();
		return capability;
	};
	expect(() => owner.bootstrap()).toThrow();
});
