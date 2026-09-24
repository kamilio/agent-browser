import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import {
	createBrowserIdentity,
	defaultBrowserIdentity,
} from "./browser-identity.js";
import { DocumentWebSockets } from "./document-websockets.js";
import { parseHtmlDocument } from "./html-parser.js";
import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { PageBlobs } from "./page-blobs.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls } from "./page-urls.js";
import {
	pageWorkerBootstrapSource,
	workerGlobalBootstrapSource,
} from "./page-worker-bootstrap.js";
import {
	type PageWorkerOptions,
	PageWorkers,
	type WorkerBudget,
} from "./page-workers.js";
import type {
	ReleasedContext,
	ReleasedCore,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";
import { scriptLimits } from "./safejs.js";
import type {
	NativeWebSocketMessage,
	WebSocketCloseResult,
	WebSocketConnection,
} from "./websocket-transport.js";
import { workerConnectPolicy } from "./worker-fetch.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});
function owner(signal = new AbortController().signal, copyArguments = true) {
	const cleanup: (() => void | Promise<void>)[] = [];
	const objects: { value: object; definition: ReleasedHostDefinition }[] = [];
	const retained = new WeakMap<object, number>();
	const releaseCallback = vi.fn();
	const context: ReleasedContext = {
		signal,
		onCleanup: (fn) => {
			cleanup.push(fn);
		},
		releaseCallback,
		releaseGuestReference: vi.fn(),
		retainGuestArguments(fn, from) {
			retained.set(fn, from);
			return fn;
		},
		nestedOperation: (fn) => fn,
		evaluateNested: async () => {
			throw Error("Unexpected nested operation");
		},
		createHostObject(definition: ReleasedHostDefinition) {
			const object = Object.create(null);
			objects.push({ value: object, definition });
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, {
					value: (...args: unknown[]) =>
						method(
							...args.map((arg, index) =>
								!copyArguments ||
								typeof arg === "function" ||
								index >= (retained.get(method) ?? Number.POSITIVE_INFINITY)
									? arg
									: structuredClone(arg),
							),
						),
				});
			return object;
		},
		startCallback(callback, options = {}) {
			let finish!: () => void;
			const synchronous = new Promise<void>((resolve) => {
				finish = resolve;
			});
			const result = Promise.resolve().then(() => {
				try {
					return Reflect.apply(
						callback as (...args: unknown[]) => unknown,
						options.thisValue,
						(options.args ?? []).map((arg) =>
							objects.some(({ value }) => value === arg)
								? arg
								: structuredClone(arg),
						),
					);
				} finally {
					finish();
				}
			});
			return { synchronous, result };
		},
	};
	return {
		context,
		objects,
		releaseCallback,
		async close() {
			for (const fn of cleanup.splice(0).reverse()) await fn();
		},
	};
}
function fixture(
	copyArguments = true,
	overrides: Partial<PageWorkerOptions> = {},
	beforeReady?: () => Promise<void>,
) {
	const controller = new AbortController();
	const parent = owner(controller.signal, copyArguments);
	const children: ReturnType<typeof owner>[] = [];
	const units = new Map<object, number>();
	const budget: WorkerBudget = {
		stepsUsed: 0,
		peakCallDepth: 0,
		peakDataSize: 0,
		forkRealm() {
			return this;
		},
		acquireRealmOwner() {},
		setRetainedDataUsage(key, value) {
			if (value) units.set(key, value);
			else units.delete(key);
		},
	};
	const core = {
		defineExtension: (definition: unknown) => definition,
		createRealm(options: Parameters<ReleasedCore["createRealm"]>[0]) {
			const child = owner(options.signal);
			children.push(child);
			const vm = createContext({ structuredClone });
			let initialized = false;
			let closing: Promise<void> | undefined;
			return {
				async evaluate(source: string) {
					if (options.signal.aborted) throw new Error("Closed");
					if (!initialized) {
						for (const extension of options.extensions as Parameters<
							ReleasedCore["defineExtension"]
						>[0][])
							Object.assign(vm, extension.setup(child.context).globals);
						initialized = true;
					}
					try {
						runInContext(source, vm, { timeout: 1000 });
						await beforeReady?.();
						return { ok: true };
					} catch (error) {
						return { ok: false, error };
					}
				},
				startCallback: (
					...args: Parameters<ReleasedContext["startCallback"]>
				) => child.context.startCallback(...args),
				close() {
					closing ??= child.close();
					return closing;
				},
			};
		},
	} as unknown as ReleasedCore;
	const blobs = new PageBlobs(parent.context, () => "https://example.test");
	const urls = new PageUrls(parent.context);
	const policy = vi.fn();
	const report = vi.fn();
	const fail = vi.fn();
	const workers = new PageWorkers(parent.context, blobs, {
		core,
		budget,
		limits: scriptLimits(),
		documentUrl: "https://example.test/page",
		policy,
		report,
		fail,
		...overrides,
	});
	const vm = createContext({
		structuredClone,
		__agentBrowserWindowGlobal: {
			blobs: blobs.port,
			urls: urls.port,
			workers: workers.port,
		},
	});
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(
		pageUrlBootstrapSource +
			pageBlobBootstrapSource +
			pageWorkerBootstrapSource,
	);
	const start = (source: string) =>
		evaluate(
			`var sourceUrl=URL.createObjectURL(new Blob([${JSON.stringify(source)}],{type:'text/javascript'})); var worker=new Worker(sourceUrl,{name:'test-worker'}); worker`,
		);
	const close = async () => {
		controller.abort();
		await workers.close();
		blobs.close();
		urls.close();
	};
	cleanups.push(close);
	return {
		evaluate,
		start,
		close,
		workers,
		blobs,
		policy,
		report,
		fail,
		units,
		budget,
		parent,
		children,
	};
}

it("executes isolated Blob source, preserves queued message order and snapshots revoked URLs", async () => {
	const test = fixture();
	test.start(
		"self.onmessage=e=>postMessage([e.data,name,location.protocol,typeof window,typeof document,typeof process,typeof require,self===globalThis]);",
	);
	test.evaluate(
		"var seen=[];worker.onmessage=e=>seen.push([e.data,e.target===worker,e.currentTarget===worker]);worker.postMessage(1);worker.postMessage(2);URL.revokeObjectURL(sourceUrl);",
	);
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual([
			[
				[
					1,
					"test-worker",
					"blob:",
					"undefined",
					"undefined",
					"undefined",
					"undefined",
					true,
				],
				true,
				true,
			],
			[
				[
					2,
					"test-worker",
					"blob:",
					"undefined",
					"undefined",
					"undefined",
					"undefined",
					true,
				],
				true,
				true,
			],
		]),
	);
	expect(test.policy).toHaveBeenCalledOnce();
	expect(test.workers.metrics()).toMatchObject({
		pending: 0,
		retainedUnits: 0,
	});
});

it("copies typed buffers and cyclic Map/Set graphs without mutating the sender", async () => {
	const test = fixture();
	test.start(
		`self.onmessage=e=>{new Uint8Array(e.data.buffer).fill(9);postMessage([e.data.map.get('self')===e.data,e.data.set.has(e.data),e.data.buffer]);};`,
	);
	test.evaluate(
		`var received;worker.onmessage=e=>{received=[e.data[0],e.data[1],[...new Uint8Array(e.data[2])]];};var bytes=new Uint8Array([65,66]);var data={buffer:bytes.buffer,map:new Map(),set:new Set()};data.map.set('self',data);data.set.add(data);worker.postMessage(data);`,
	);
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([true, true, [9, 9]]),
	);
	expect(test.evaluate("[...bytes]")).toEqual([65, 66]);
});

it("delivers messages posted before self-close and cancels future worker tasks", async () => {
	const test = fixture();
	test.start(
		`self.onmessage=e=>{postMessage('last');close();setTimeout(()=>postMessage('late'),0);};`,
	);
	test.evaluate(
		`var seen=[];worker.onmessage=e=>seen.push(e.data);worker.postMessage('first');worker.postMessage('discard');`,
	);
	await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["last"]));
	await vi.waitFor(() =>
		expect(test.workers.metrics()).toMatchObject({
			active: 0,
			pending: 0,
			retainedUnits: 0,
		}),
	);
	expect(test.units.size).toBe(0);
});

it("runs worker timers with guest self receivers and retained arguments", async () => {
	const test = fixture();
	test.start(
		`setTimeout(function(value) {postMessage([this===self,value]);close();},0,'timer');`,
	);
	test.evaluate("var received;worker.onmessage=e=>{received=e.data;};");
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([true, "timer"]),
	);
});

it("supports listener objects, once, removal during delivery and handler properties", async () => {
	const test = fixture();
	test.start("self.onmessage=e=>postMessage(e.data);");
	test.evaluate(
		`var seen=[];const removed=()=>seen.push('removed');worker.addEventListener('message',()=>{seen.push('once');worker.removeEventListener('message',removed);},{once:true});worker.addEventListener('message',removed);worker.addEventListener('message',{handleEvent(e){seen.push(e.data);}});worker.onmessage=()=>seen.push('handler');worker.postMessage(1);worker.postMessage(2);`,
	);
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual(["once", 1, "handler", 2, "handler"]),
	);
});

it("accounts queued native packets through callback completion and releases all resources on page close", async () => {
	const test = fixture();
	test.start("self.onmessage=e=>postMessage(e.data);");
	test.evaluate(`worker.postMessage('held');`);
	expect(test.workers.metrics().retainedUnits).toBeGreaterThan(0);
	expect(test.units.size).toBe(1);
	await test.close();
	expect(test.units.size).toBe(0);
	expect(test.workers.metrics()).toMatchObject({
		closed: true,
		active: 0,
		pending: 0,
		retainedUnits: 0,
	});
	for (const source of [
		"worker.postMessage('late')",
		"worker.terminate()",
		"new Worker(sourceUrl)",
	])
		expect(() => test.evaluate(source)).toThrow(/closed/i);
});

it("terminates before initialization, discards queued packets and permits later workers within lifetime quotas", async () => {
	const test = fixture();
	test.start(`postMessage('unexpected');`);
	test.evaluate(`worker.postMessage('queued');worker.terminate();`);
	await vi.waitFor(() =>
		expect(test.workers.metrics()).toMatchObject({
			active: 0,
			pending: 0,
			retainedUnits: 0,
		}),
	);
	expect(test.children).toHaveLength(0);
	test.start(`self.onmessage=e=>postMessage('ok');`);
	test.evaluate(
		`var received;worker.onmessage=e=>received=e.data;worker.postMessage('go');`,
	);
	await vi.waitFor(() => expect(test.evaluate("received")).toBe("ok"));
});

it("reports script failures and contains exceptions thrown by parent event listeners", async () => {
	const test = fixture();
	test.start(`throw Error('failure');`);
	test.evaluate(
		`var error;worker.onerror=e=>{error=[e.type,e.message];throw Error('listener');};`,
	);
	await vi.waitFor(() =>
		expect(test.evaluate("error")).toEqual([
			"error",
			"Worker script execution failed",
		]),
	);
	expect(test.report).toHaveBeenCalledWith("Worker event listener failed");
	expect(test.fail).not.toHaveBeenCalled();
});

it("rejects noncloneable messages, oversize graphs and unsupported transfers without detaching inputs", () => {
	const test = fixture();
	test.start("self.onmessage=e=>postMessage(e.data);");
	for (const source of [
		"worker.postMessage(()=>{})",
		"worker.postMessage(Symbol())",
		"worker.postMessage('x'.repeat(65537))",
		"worker.postMessage({get secret(){throw Error('getter');}})",
	])
		expect(() => test.evaluate(source)).toThrow();
	test.evaluate("var bytes=new Uint8Array([1]);");
	expect(() =>
		test.evaluate("worker.postMessage(bytes.buffer,[bytes.buffer,{}])"),
	).toThrow();
	expect(test.evaluate("[bytes.byteLength,bytes[0]]")).toEqual([1, 1]);
	expect(test.workers.metrics().pending).toBe(0);
});

it("bounds aggregate queue storage and active workers with atomic failure", () => {
	const test = fixture();
	test.start("self.onmessage=e=>postMessage(e.data);");
	for (let i = 0; i < 3; i++)
		test.evaluate(`worker.postMessage('x'.repeat(60000));`);
	const before = test.workers.metrics();
	expect(() =>
		test.evaluate(
			`worker.postMessage('x'.repeat(60000));worker.postMessage('x'.repeat(60000));`,
		),
	).toThrow(/limit/i);
	expect(test.workers.metrics().pending).toBe(before.pending + 1);
	for (let i = 0; i < 3; i++) test.start("");
	expect(() => test.start("")).toThrow(/limit/i);
});

it("charges complete backing buffers and regular expression source before queuing", () => {
	const test = fixture();
	test.start("");
	for (const source of [
		"worker.postMessage(new Uint8Array(new ArrayBuffer(65537),0,1))",
		"worker.postMessage(new DataView(new ArrayBuffer(65537),0,1))",
		"worker.postMessage(new RegExp('x'.repeat(65537)))",
	])
		expect(() => test.evaluate(source)).toThrow(/limit/i);
	expect(test.workers.metrics().pending).toBe(0);
});

it("rejects native proxies and accessors without invoking them and pins buffer brand getters", () => {
	const test = fixture(false);
	test.start("");
	const port = (
		test.workers.port as {
			create(
				url: string,
				name: string,
				callback: (packet: unknown) => void,
			): { post(data: unknown): void };
		}
	).create(test.evaluate("sourceUrl"), "", () => {});
	const getter = vi.fn(() => {
		throw Error("Getter invoked");
	});
	const value = Object.defineProperty({}, "secret", {
		enumerable: true,
		get: getter,
	});
	expect(() => port.post(value)).toThrow(/cloneable/i);
	expect(() => port.post(new Proxy({}, { ownKeys: getter }))).toThrow(
		/cloneable/i,
	);
	expect(getter).not.toHaveBeenCalled();
	const buffer = new ArrayBuffer(65537);
	Object.defineProperty(buffer, "byteLength", { get: getter });
	const view = new Uint8Array(buffer, 0, 1);
	Object.defineProperty(view, "buffer", { get: getter });
	expect(() => port.post(view)).toThrow(/limit/i);
	expect(getter).not.toHaveBeenCalled();
	expect(test.units.size).toBe(0);
});

it("retains outgoing packet credits until the owning callback result finishes", async () => {
	const test = fixture();
	let finish!: () => void;
	const held = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const original = test.parent.context.startCallback;
	test.parent.context.startCallback = (callback, options) => {
		const invocation = original(callback, options);
		return { ...invocation, result: invocation.result.then(() => held) };
	};
	test.start("postMessage('held');close();");
	test.evaluate("var received;worker.onmessage=e=>received=e.data;");
	await vi.waitFor(() => expect(test.evaluate("received")).toBe("held"));
	expect(test.workers.metrics()).toMatchObject({ pending: 1, active: 1 });
	expect(test.units.size).toBe(1);
	finish();
	await vi.waitFor(() =>
		expect(test.workers.metrics()).toMatchObject({
			pending: 0,
			active: 0,
			retainedUnits: 0,
		}),
	);
});

it("enforces the lifetime creation quota after terminated workers release their slots", async () => {
	const test = fixture();
	for (let i = 0; i < 16; i++) {
		test.start("");
		test.evaluate("worker.terminate();");
		await vi.waitFor(() => expect(test.workers.metrics().active).toBe(0));
	}
	expect(() => test.start("")).toThrow(/limit/i);
	expect(test.workers.metrics()).toMatchObject({
		created: 16,
		active: 0,
		pending: 0,
		retainedUnits: 0,
	});
});

it("rejects foreign/revoked URLs, disallowed CSP, unavailable network loading and modules", () => {
	const test = fixture();
	for (const source of [
		"new Worker()",
		"Worker('blob:https://example.test/none')",
		"new Worker('https://example.test/worker.js')",
		"new Worker('blob:https://example.test/unknown')",
	])
		expect(() => test.evaluate(source)).toThrow();
	test.evaluate(
		`var url=URL.createObjectURL(new Blob([''],{type:'text/javascript'}));URL.revokeObjectURL(url);`,
	);
	expect(() => test.evaluate("new Worker(url)")).toThrow(/revoked/i);
	expect(() => test.evaluate(`new Worker(url,{type:'module'})`)).toThrow(
		/module/i,
	);
	test.policy.mockImplementation(() => {
		throw Error("CSP denied");
	});
	expect(() => test.start("")).toThrow(/CSP denied/);
	expect(test.workers.metrics().active).toBe(0);
	expect(test.parent.releaseCallback).toHaveBeenCalled();
});

it("brands methods and performs Worker option conversion once in dictionary order", () => {
	const test = fixture();
	for (const source of [
		"Worker.prototype.postMessage.call({},1)",
		"Worker.prototype.terminate.call({})",
	])
		expect(() => test.evaluate(source)).toThrow();
	test.evaluate(
		`var calls=[];var url=URL.createObjectURL(new Blob([''],{type:'text/javascript'}));new Worker(url,{get credentials(){calls.push('credentials');return 'omit';},get name(){calls.push('name');return 'n';},get type(){calls.push('type');return 'classic';}});`,
	);
	expect(test.evaluate("calls")).toEqual(["credentials", "name", "type"]);
});

it("identifies the isolated global as a dedicated worker without exposing constructible global scopes", async () => {
	const test = fixture();
	test.start(
		"postMessage([self instanceof WorkerGlobalScope,self instanceof DedicatedWorkerGlobalScope,Object.prototype.toString.call(self)]);close();",
	);
	test.evaluate("var received;worker.onmessage=e=>received=e.data;");
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([
			true,
			true,
			"[object DedicatedWorkerGlobalScope]",
		]),
	);
});

it("loads same-origin classic source asynchronously and preserves queued messages and final location", async () => {
	let release!: (value: {
		url: string;
		source: string;
		stringCompilation: "allow";
	}) => void;
	const fetch = vi.fn(
		() =>
			new Promise<{ url: string; source: string; stringCompilation: "allow" }>(
				(resolve) => {
					release = resolve;
				},
			),
	);
	const test = fixture(true, { fetch });
	test.evaluate(
		"var worker=new Worker('/worker.js');var received;worker.onmessage=e=>received=e.data;worker.postMessage('queued');",
	);
	await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
	expect(test.children).toHaveLength(0);
	release({
		url: "https://example.test/final.js",
		source: "onmessage=e=>{postMessage([e.data,location.href]);close();};",
		stringCompilation: "allow",
	});
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([
			"queued",
			"https://example.test/final.js",
		]),
	);
	expect(test.policy.mock.calls.map((call) => call[0])).toEqual([
		"https://example.test/worker.js",
		"https://example.test/final.js",
	]);
});

it.each(["terminate", "close", "timeout"] as const)(
	"cancels pending network source on %s and discards late adapter results",
	async (action) => {
		let release!: (value: {
			url: string;
			source: string;
			stringCompilation: "allow";
		}) => void;
		let signal!: AbortSignal;
		const fetch = vi.fn((_url: string, input: AbortSignal) => {
			signal = input;
			return new Promise<{
				url: string;
				source: string;
				stringCompilation: "allow";
			}>((resolve) => {
				release = resolve;
			});
		});
		const test = fixture(true, {
			fetch,
			limits: scriptLimits({ timeoutMs: 25 }),
		});
		test.evaluate(
			"var worker=new Worker('/worker.js');var errors=[];worker.onerror=e=>errors.push(e.message);worker.postMessage('held');",
		);
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce(), {
			interval: 1,
		});
		if (action === "terminate") test.evaluate("worker.terminate();");
		if (action === "close") await test.close();
		await vi.waitFor(() =>
			expect(test.workers.metrics()).toMatchObject({
				active: 0,
				pending: 0,
				retainedUnits: 0,
			}),
		);
		expect(signal.aborted).toBe(true);
		expect(test.evaluate("errors.length")).toBe(action === "timeout" ? 1 : 0);
		release({
			url: "https://example.test/worker.js",
			source: "postMessage('late');",
			stringCompilation: "allow",
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(test.children).toHaveLength(0);
		expect(test.units.size).toBe(0);
	},
);

it.each([
	{
		url: "https://other.test/worker.js",
		source: "",
		stringCompilation: "allow",
	},
	{
		url: "https://example.test/worker.js",
		source: "x".repeat(262144),
		stringCompilation: "allow",
	},
	{
		url: "https://example.test/worker.js",
		source: "",
		stringCompilation: "invalid",
	},
])(
	"contains rejected network loader results before creating a realm: %j",
	async (loaded) => {
		const test = fixture(true, { fetch: vi.fn(async () => loaded as never) });
		test.evaluate(
			"var worker=new Worker('/worker.js');var errors=[];worker.onerror=e=>errors.push(e.type);",
		);
		await vi.waitFor(() => expect(test.evaluate("errors")).toEqual(["error"]));
		await vi.waitFor(() => expect(test.workers.metrics().active).toBe(0));
		expect(test.children).toHaveLength(0);
	},
);

it.each(["", "text/plain"])(
	"runs classic Blob Worker source without HTTP MIME restrictions: %s",
	async (type) => {
		const test = fixture();
		test.evaluate(
			`var worker=new Worker(URL.createObjectURL(new Blob(["postMessage('ready');close();"],{type:${JSON.stringify(type)}})));var received;worker.onmessage=e=>received=e.data;`,
		);
		await vi.waitFor(() => expect(test.evaluate("received")).toBe("ready"));
	},
);

it("delivers a child's outgoing message while that child's incoming task waits on native I/O", async () => {
	const test = fixture();
	test.start("onmessage=e=>postMessage('started');");
	await vi.waitFor(() => expect(test.children).toHaveLength(1));
	const child = test.children[0];
	const original = child.context.startCallback;
	let finish!: () => void;
	const held = new Promise<void>((resolve) => {
		finish = resolve;
	});
	child.context.startCallback = (callback, options) => {
		const invocation = original(callback, options);
		return {
			synchronous: invocation.synchronous.then(() => held),
			result: invocation.result.then(() => held),
		};
	};
	test.evaluate(
		"var seen=[];worker.onmessage=e=>seen.push(e.data);worker.postMessage(1);worker.postMessage(2);",
	);
	try {
		await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["started"]));
		expect(test.workers.metrics().pending).toBe(2);
	} finally {
		finish();
	}
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual(["started", "started"]),
	);
	await vi.waitFor(() => expect(test.workers.metrics().pending).toBe(0));
});

it("publishes the document identity in child Workers without exposing page credentials", async () => {
	const identity = createBrowserIdentity({
		userAgent: "AgentBrowser/custom",
		languages: ["fr-ca", "en"],
	});
	const test = fixture(true, { identity });
	test.evaluate("var received=[];");
	test.start(
		"postMessage([navigator.userAgent,navigator.language,navigator.languages,Object.prototype.toString.call(navigator),typeof navigator.credentials,typeof navigator.mediaDevices]);",
	);
	test.evaluate("worker.onmessage=e=>received.push(e.data);");
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([
			[
				identity.userAgent,
				"fr-CA",
				["fr-CA", "en"],
				"[object WorkerNavigator]",
				"undefined",
				"undefined",
			],
		]),
	);
	expect(identity.languages).toEqual(["fr-CA", "en"]);
});

it("uses isolated frozen Worker identity snapshots and the default profile when no identity is supplied", async () => {
	const test = fixture();
	test.evaluate("var received=[];");
	test.start(
		"try{navigator.languages.push('private');}catch{} try{navigator.userAgent='changed';}catch{} postMessage([navigator.userAgent,navigator.language,navigator.languages,Object.isFrozen(navigator),Object.isFrozen(navigator.languages)]);",
	);
	test.evaluate("worker.onmessage=e=>received.push(e.data);");
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([
			[
				defaultBrowserIdentity.userAgent,
				defaultBrowserIdentity.language,
				[...defaultBrowserIdentity.languages],
				true,
				true,
			],
		]),
	);
	expect(defaultBrowserIdentity.languages).toEqual(["en-US"]);
});

it("rejects a forged Worker identity without invoking native getters", () => {
	const getter = vi.fn(() => "private");
	const identity = Object.defineProperty({}, "userAgent", {
		get: getter,
	}) as ReturnType<typeof createBrowserIdentity>;
	expect(() => fixture(true, { identity })).toThrow(
		"Expected an identity created by this module",
	);
	expect(getter).not.toHaveBeenCalled();
});

it("transfers ArrayBuffer ownership in both directions while preserving view aliases and bytes", async () => {
	const test = fixture();
	test.start(
		"onmessage=e=>{e.data.bytes[0]=9;postMessage({bytes:e.data.bytes,alias:e.data.buffer===e.data.bytes.buffer},{transfer:[e.data.buffer]});postMessage(['detached',e.data.bytes.byteLength]);};",
	);
	test.evaluate(
		"var seen=[];worker.onmessage=e=>seen.push(Array.isArray(e.data)?e.data:[[...e.data.bytes],e.data.alias]);var bytes=new Uint8Array([1,2]);worker.postMessage({buffer:bytes.buffer,bytes},[bytes.buffer]);",
	);
	expect(test.evaluate("[bytes.byteLength,bytes.buffer.byteLength]")).toEqual([
		0, 0,
	]);
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual([
			[[9, 2], true],
			["detached", 0],
		]),
	);
	await vi.waitFor(() => expect(test.workers.metrics().pending).toBe(0));
	expect(test.units.size).toBe(0);
});

it.each([false, true])(
	"delivers a bounded WASM-sized binary in both directions (transfer=%s)",
	async (transfer) => {
		const test = fixture(true, {
			binaryMessages: "bounded-v1",
		});
		test.start(
			"onmessage=e=>{const buffer=e.data.buffer;const bytes=new Uint8Array(buffer);bytes[0]=9;postMessage({buffer,alias:e.data.view.buffer===buffer},[buffer]);};",
		);
		test.evaluate(
			"var received;worker.onmessage=e=>received=[e.data.buffer.byteLength,new Uint8Array(e.data.buffer)[0],new Uint8Array(e.data.buffer)[465601],e.data.alias];var buffer=new ArrayBuffer(465602);var view=new Uint8Array(buffer);view[0]=1;view[465601]=7;",
		);
		test.evaluate(
			`worker.postMessage({buffer,view}${transfer ? ",[buffer]" : ""});`,
		);
		expect(test.evaluate("buffer.byteLength")).toBe(transfer ? 0 : 465602);
		expect(test.workers.metrics().retainedUnits).toBeGreaterThanOrEqual(465602);
		await vi.waitFor(() =>
			expect(test.evaluate("received")).toEqual([465602, 9, 7, true]),
		);
		await vi.waitFor(() => expect(test.workers.metrics().pending).toBe(0));
		expect(test.units.size).toBe(0);
	},
);

it("keeps binary admission separate from graph limits and checks whole backing buffers", () => {
	const test = fixture(true, {
		binaryMessages: "bounded-v1",
	});
	test.start("");
	test.evaluate(
		"var buffer=new ArrayBuffer(1048577);var view=new Uint8Array(buffer,0,1);",
	);
	for (const source of [
		"worker.postMessage(buffer,[buffer])",
		"worker.postMessage(view)",
		"worker.postMessage('x'.repeat(65537))",
		"worker.postMessage([new ArrayBuffer(600000),new ArrayBuffer(500000)])",
	])
		expect(() => test.evaluate(source)).toThrow(/limit/i);
	expect(test.evaluate("buffer.byteLength")).toBe(1048577);
	expect(test.workers.metrics().pending).toBe(0);
});

it("checks native binary arguments against pinned backing-buffer getters", () => {
	const test = fixture(false, { binaryMessages: "bounded-v1" });
	test.start("");
	const port = (
		test.workers.port as {
			create(
				url: string,
				name: string,
				dispatch: (packet: unknown) => void,
			): { post(data: unknown): void };
		}
	).create(test.evaluate("sourceUrl"), "", () => {});
	const getter = vi.fn(() => 0);
	const buffer = new ArrayBuffer(1048577);
	Object.defineProperty(buffer, "byteLength", { get: getter });
	const view = new Uint8Array(buffer, 0, 1);
	Object.defineProperty(view, "buffer", { get: getter });
	expect(() => port.post(view)).toThrow(/limit/i);
	expect(getter).not.toHaveBeenCalled();
	expect(test.units.size).toBe(0);
});

it("requires shared-budget admission before queuing a binary packet", () => {
	const test = fixture(true, { binaryMessages: "bounded-v1" });
	test.start("");
	test.budget.setRetainedDataUsage = (_owner, units) => {
		if (units > 400000) throw new Error("shared quota");
	};
	test.evaluate("var buffer=new ArrayBuffer(465602);");
	expect(() => test.evaluate("worker.postMessage(buffer);")).toThrow(
		/shared quota/,
	);
	expect(test.workers.metrics().pending).toBe(0);
	expect(test.workers.metrics().retainedUnits).toBe(0);
	expect(test.evaluate("buffer.byteLength")).toBe(465602);
});

it("bounds aggregate binary queue storage and releases its credits on termination", async () => {
	const test = fixture(true, {
		binaryMessages: "bounded-v1",
	});
	test.start("");
	for (let index = 0; index < 3; index++)
		test.evaluate("worker.postMessage(new ArrayBuffer(1048576));");
	const before = test.workers.metrics();
	expect(() =>
		test.evaluate("worker.postMessage(new ArrayBuffer(1048576));"),
	).toThrow(/limit/i);
	expect(test.workers.metrics()).toEqual(before);
	test.evaluate("worker.terminate();");
	await vi.waitFor(() => expect(test.workers.metrics().pending).toBe(0));
	expect(test.units.size).toBe(0);
});

it("serializes getters once before transferring the final buffer bytes", async () => {
	const test = fixture();
	test.start(
		"onmessage=e=>postMessage([e.data.self===e.data,[...new Uint8Array(e.data.buffer)]]);",
	);
	test.evaluate(
		"var received;worker.onmessage=e=>received=e.data;var reads=0;var buffer=new ArrayBuffer(2);var value={buffer,get self(){reads++;new Uint8Array(buffer)[1]=7;return this;}};worker.postMessage(value,{transfer:new Set([buffer])});",
	);
	expect(test.evaluate("[reads,buffer.byteLength]")).toEqual([1, 0]);
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([true, [0, 7]]),
	);
});

it("rejects invalid transfer lists and serialization errors before detaching valid buffers", () => {
	const test = fixture();
	test.start("");
	test.evaluate("var buffer=new ArrayBuffer(2);new Uint8Array(buffer)[0]=7;");
	for (const source of [
		"worker.postMessage(buffer,[buffer,buffer])",
		"worker.postMessage(buffer,{transfer:[buffer,new Uint8Array(1)]})",
		"worker.postMessage(buffer,{transfer:[buffer,new SharedArrayBuffer(1)]})",
		"worker.postMessage(buffer,{transfer:null})",
		"worker.postMessage(buffer,{transfer:1})",
		"worker.postMessage(buffer,{transfer:{}})",
		"worker.postMessage(()=>{},{transfer:[buffer]})",
		"worker.postMessage({get secret(){throw Error('getter');}},{transfer:[buffer]})",
	]) {
		expect(() => test.evaluate(source)).toThrow();
		expect(
			test.evaluate("[buffer.byteLength,new Uint8Array(buffer)[0]]"),
		).toEqual([2, 7]);
	}
	expect(test.workers.metrics().pending).toBe(0);
});

it("bounds transferred bytes and list iteration before committing ownership loss", () => {
	const test = fixture();
	test.start("");
	test.evaluate(
		"var buffer=new ArrayBuffer(65537);var small=new ArrayBuffer(1);",
	);
	expect(() => test.evaluate("worker.postMessage(0,[buffer])")).toThrow(
		/limit/i,
	);
	expect(test.evaluate("buffer.byteLength")).toBe(65537);
	expect(() =>
		test.evaluate(
			"worker.postMessage(0,{transfer:{*[Symbol.iterator](){while(true)yield small;}}})",
		),
	).toThrow(/limit/i);
	expect(test.evaluate("small.byteLength")).toBe(1);
	expect(test.workers.metrics().pending).toBe(0);
});

it("exposes an owned monotonic Worker performance clock and cancels it on termination", async () => {
	const test = fixture();
	test.evaluate("var received;");
	test.start(
		"const before=performance.now();setTimeout(()=>{const after=performance.now();postMessage([performance.timeOrigin,performance.toJSON().timeOrigin,before,after]);},5);",
	);
	test.evaluate("worker.onmessage=e=>received=e.data;");
	await vi.waitFor(() => expect(test.evaluate("received")).toBeDefined());
	const received = test.evaluate("received") as number[];
	expect(received[0]).toBeGreaterThan(0);
	expect(received[1]).toBe(received[0]);
	expect(received[2]).toBeGreaterThanOrEqual(0);
	expect(received[3]).toBeGreaterThanOrEqual(received[2]);
	for (const value of received)
		expect(Math.abs(value * 10 - Math.round(value * 10))).toBeLessThan(0.01);
	const capability = test.children[0].objects.find(
		(object) => object.definition.methods?.now,
	)?.value as {
		now(): number;
		readonly timeOrigin: number;
		mark(name: string): unknown;
	};
	expect(capability.now()).toBeGreaterThanOrEqual(received[3]);
	test.evaluate("worker.terminate();");
	await vi.waitFor(() => expect(() => capability.now()).toThrow(/closed/i));
	expect(() => capability.timeOrigin).toThrow(/closed/i);
	expect(() => capability.mark("late")).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
});

it("keeps bounded Worker marks/measures isolated and releases timing entries on page close", async () => {
	const test = fixture();
	test.evaluate("var received;");
	test.start(
		"performance.mark('start',{startTime:2,detail:{value:7}});const span=performance.measure('span',{start:'start',end:5});const entries=performance.getEntriesByName('start');const detail=entries[0].detail;detail.value=9;postMessage([span.toJSON(),performance.getEntriesByName('start')[0].detail,performance.getEntriesByType('navigation').length]);performance.clearMarks();performance.clearMeasures();postMessage(performance.getEntries().length);",
	);
	test.evaluate("var received=[];worker.onmessage=e=>received.push(e.data);");
	await vi.waitFor(() =>
		expect(test.evaluate("received")).toEqual([
			[
				{
					name: "span",
					entryType: "measure",
					startTime: 2,
					duration: 3,
					detail: null,
				},
				{ value: 7 },
				0,
			],
			0,
		]),
	);
	const capability = test.children[0].objects.find(
		(object) => object.definition.methods?.now,
	)?.value as { getEntries(): unknown[] };
	await test.close();
	expect(() => capability.getEntries()).toThrowError(
		expect.objectContaining({ code: "closed" }),
	);
	expect(test.units.size).toBe(0);
});

it("counts the opted-in WASM bootstrap before creating a child", () => {
	const test = fixture(true, {
		webAssembly: "bounded-v1",
		limits: {
			...scriptLimits(),
			maxSourceCodeUnits: workerGlobalBootstrapSource.length + 1,
		},
	});
	expect(() => test.start("")).toThrow(/limit/i);
	expect(test.children).toHaveLength(0);
});

it("rejects enabled network Worker loaders without explicit WASM compilation policy", async () => {
	const test = fixture(true, {
		webAssembly: "bounded-v1",
		fetch: async () => ({
			url: "https://example.test/worker.js",
			source: "",
			stringCompilation: "allow",
		}),
	});
	test.evaluate("var worker=new Worker('/worker.js');");
	await vi.waitFor(() => expect(test.workers.metrics().active).toBe(0));
	expect(test.children).toHaveLength(0);
});

function workerSockets(headers: readonly string[] = [], maxConcurrent = 4) {
	const tree = parseHtmlDocument("", "https://example.test/page");
	const connections: WebSocketConnection[] = [];
	const transport = {
		connect: vi.fn(async (url: string) => {
			let finish!: (result: WebSocketCloseResult) => void;
			const closed = new Promise<WebSocketCloseResult>((resolve) => {
				finish = resolve;
			});
			let deliver:
				| ((value: NativeWebSocketMessage | undefined) => void)
				| undefined;
			const queue: NativeWebSocketMessage[] = [];
			let ended = false;
			const stop = (code: number, reason: string) => {
				ended = true;
				deliver?.(undefined);
				finish({ code, reason, wasClean: code === 1000 });
			};
			const socket: WebSocketConnection = {
				url,
				protocol: "",
				closed,
				read: () =>
					queue.length
						? Promise.resolve(queue.shift())
						: ended
							? Promise.resolve(undefined)
							: new Promise((resolve) => {
									deliver = resolve;
								}),
				send: vi.fn(async (data) => {
					const message = { data };
					if (deliver) {
						const send = deliver;
						deliver = undefined;
						send(message);
					} else queue.push(message);
				}),
				close: async (code = 1000, reason = "") => {
					stop(code, reason);
					return closed;
				},
				abort: vi.fn(() => stop(1006, "")),
			};
			connections.push(socket);
			return socket;
		}),
	};
	const sockets = new DocumentWebSockets(tree, transport, {
		headerValues: headers,
		limits: { maxConcurrent },
	});
	cleanups.push(async () => {
		tree.close();
	});
	return { sockets, transport, connections };
}

it("keeps Worker WebSocket unavailable without an explicit transport", async () => {
	const test = fixture();
	test.start("postMessage(typeof WebSocket)");
	test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["undefined"]));
});

it("delivers Worker socket open, binary message, receiver and close events", async () => {
	const { sockets, connections } = workerSockets();
	const test = fixture(true, { webSockets: sockets });
	test.start(`
		var socket = new WebSocket('wss://example.test/feed');
		socket.binaryType = 'arraybuffer';
		socket.onopen = function(e) { postMessage(['open', this === socket, e.target === socket, socket.readyState === WebSocket.OPEN]); socket.send(new Uint8Array([3,7,11])); };
		socket.onmessage = function(e) { postMessage(['message', Array.from(new Uint8Array(e.data))]); socket.close(1000, 'done'); };
		socket.onclose = e => postMessage(['close', e.code, e.reason, e.wasClean]);
	`);
	test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual([
			["open", true, true, true],
			["message", [3, 7, 11]],
			["close", 1000, "done", true],
		]),
	);
	expect(connections[0].send).toHaveBeenCalledOnce();
	await test.close();
	expect(sockets.metrics()).toMatchObject({
		connecting: 0,
		open: 0,
		closing: 0,
	});
	expect(test.units.size).toBe(0);
});

it("terminates only the selected Worker's sockets and preserves shared limits", async () => {
	const { sockets, connections } = workerSockets([], 2);
	const test = fixture(true, { webSockets: sockets });
	const source =
		"var socket=new WebSocket('wss://example.test/feed'); socket.onopen=()=>postMessage('open')";
	test.start(source);
	test.evaluate(
		"var first=worker; var seen=[]; first.onmessage=e=>seen.push(e.data)",
	);
	test.start(source);
	test.evaluate("worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() =>
		expect(test.evaluate("seen")).toEqual(["open", "open"]),
	);
	expect(() => sockets.start("/feed")).toThrow(/connection limit/);
	test.evaluate("first.terminate()");
	await vi.waitFor(() => expect(sockets.metrics().open).toBe(1));
	expect(connections[0].abort).toHaveBeenCalledOnce();
	expect(connections[1].abort).not.toHaveBeenCalled();
	await test.close();
	expect(sockets.metrics()).toMatchObject({
		connecting: 0,
		open: 0,
		closing: 0,
	});
	expect(connections[1].abort).toHaveBeenCalledOnce();
});

it("aborts a pending Worker handshake on termination and suppresses late callbacks", async () => {
	const tree = parseHtmlDocument("", "https://example.test/page");
	let signal: AbortSignal | undefined;
	const sockets = new DocumentWebSockets(tree, {
		connect: (_url, options) => {
			signal = options.signal;
			return new Promise((_resolve, reject) =>
				signal?.addEventListener("abort", () => reject(Error("aborted")), {
					once: true,
				}),
			);
		},
	});
	cleanups.push(async () => {
		tree.close();
	});
	const test = fixture(true, { webSockets: sockets });
	test.start(
		"var socket=new WebSocket('wss://example.test/feed'); socket.onopen=()=>postMessage('late')",
	);
	test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() => expect(signal).toBeDefined());
	test.evaluate("worker.terminate()");
	expect(signal?.aborted).toBe(true);
	await vi.waitFor(() => expect(sockets.metrics().connecting).toBe(0));
	expect(test.evaluate("seen")).toEqual([]);
});

it.each([true, false])(
	"uses fetched Worker response CSP instead of creator connect-src (allow=%s)",
	async (allowed) => {
		const { sockets, transport } = workerSockets([
			allowed ? "connect-src 'none'" : "connect-src *",
		]);
		const url = "https://example.test/workers/main.js";
		const test = fixture(true, {
			webSockets: sockets,
			fetch: async () => ({
				url,
				stringCompilation: "allow",
				checkConnect: workerConnectPolicy(url, {
					"content-security-policy": [
						allowed ? "connect-src wss://example.test" : "connect-src 'none'",
					],
				}),
				source:
					"try { var socket=new WebSocket('feed'); socket.onopen=()=>postMessage('open'); } catch(e) { postMessage('denied'); }",
			}),
		});
		test.evaluate(
			`var seen=[];var worker=new Worker('${url}');worker.onmessage=e=>seen.push(e.data)`,
		);
		await vi.waitFor(() =>
			expect(test.evaluate("seen")).toEqual([allowed ? "open" : "denied"]),
		);
		expect(transport.connect).toHaveBeenCalledTimes(allowed ? 1 : 0);
	},
);

it("inherits creator connect-src for Blob Workers", async () => {
	const { sockets, transport } = workerSockets(["connect-src 'none'"]);
	const test = fixture(true, { webSockets: sockets });
	test.start(
		"try { new WebSocket('wss://example.test/feed'); } catch(e) { postMessage('denied'); }",
	);
	test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["denied"]));
	expect(transport.connect).not.toHaveBeenCalled();
});

it("holds Worker socket events until initialization completes", async () => {
	let ready!: () => void;
	const gate = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const { sockets, transport } = workerSockets();
	const test = fixture(true, { webSockets: sockets }, () => gate);
	try {
		test.start(
			"var socket=new WebSocket('wss://example.test/feed');socket.onopen=()=>postMessage('open');",
		);
		test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
		await vi.waitFor(() => expect(transport.connect).toHaveBeenCalledOnce());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(test.evaluate("seen")).toEqual([]);
		ready();
		await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["open"]));
	} finally {
		ready();
	}
});

it("closes Worker sockets immediately when the Worker calls self.close", async () => {
	const { sockets, connections } = workerSockets();
	const test = fixture(true, { webSockets: sockets });
	test.start(
		"var socket=new WebSocket('wss://example.test/feed');socket.onopen=()=>{postMessage('open');self.close();};",
	);
	test.evaluate("var seen=[];worker.onmessage=e=>seen.push(e.data)");
	await vi.waitFor(() => expect(test.evaluate("seen")).toEqual(["open"]));
	await vi.waitFor(() => expect(test.workers.metrics().active).toBe(0));
	expect(connections[0].abort).toHaveBeenCalledOnce();
	expect(sockets.metrics()).toMatchObject({
		open: 0,
		connecting: 0,
		closing: 0,
	});
});
