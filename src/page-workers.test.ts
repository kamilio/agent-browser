import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { PageBlobs } from "./page-blobs.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls } from "./page-urls.js";
import { pageWorkerBootstrapSource } from "./page-worker-bootstrap.js";
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

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of cleanups.splice(0)) await close();
});
function owner(signal = new AbortController().signal, copyArguments = true) {
	const cleanup: (() => void | Promise<void>)[] = [];
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
						(options.args ?? []).map((arg) => structuredClone(arg)),
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
		releaseCallback,
		async close() {
			for (const fn of cleanup.splice(0).reverse()) await fn();
		},
	};
}
function fixture(
	copyArguments = true,
	overrides: Partial<PageWorkerOptions> = {},
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
						return { ok: true };
					} catch (error) {
						return { ok: false, error };
					}
				},
				startCallback: child.context.startCallback,
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
		test.evaluate("worker.postMessage(bytes.buffer,[bytes.buffer])"),
	).toThrow(/transfer/i);
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
