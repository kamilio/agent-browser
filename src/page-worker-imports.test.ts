import { createContext, runInContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { pageBlobBootstrapSource } from "./page-blob-bootstrap.js";
import { PageBlobs } from "./page-blobs.js";
import { pageUrlBootstrapSource } from "./page-url-bootstrap.js";
import { PageUrls } from "./page-urls.js";
import { PageWorkerImports } from "./page-worker-imports.js";
import type { WorkerImportOptions } from "./page-worker-imports.js";
import type { WorkerBudget } from "./page-workers.js";
import type {
	ReleasedContext,
	ReleasedHostDefinition,
} from "./safejs-extension-types.js";
import { scriptLimits } from "./safejs.js";
import type { WorkerImportFetch } from "./worker-fetch.js";
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const close of cleanups.splice(0)) close();
});
function fixture(overrides: Partial<WorkerImportOptions> = {}) {
	const controller = new AbortController();
	const credits = new Map<object, number>();
	const evaluateNested = vi.fn(async (_source: string) => {});
	const register = vi.fn(
		(operation: (...args: readonly unknown[]) => unknown) => operation,
	);
	const context = {
		signal: controller.signal,
		evaluateNested,
		nestedOperation: register,
		createHostObject(definition: ReleasedHostDefinition) {
			const object = Object.create(null);
			for (const [name, property] of Object.entries(
				definition.properties ?? {},
			))
				Object.defineProperty(object, name, property);
			for (const [name, method] of Object.entries(definition.methods ?? {}))
				Object.defineProperty(object, name, { value: method });
			return object;
		},
	} as unknown as ReleasedContext;
	const blobs = new PageBlobs(context, () => "https://example.test");
	const urls = new PageUrls(context);
	const vm = createContext({
		__agentBrowserWindowGlobal: { blobs: blobs.port, urls: urls.port },
	});
	runInContext(pageUrlBootstrapSource + pageBlobBootstrapSource, vm);
	const budget = {
		setRetainedDataUsage(owner: object, usage: number) {
			if (usage) credits.set(owner, usage);
			else credits.delete(owner);
		},
	} as WorkerBudget;
	const policy = vi.fn();
	const fetch = vi.fn<WorkerImportFetch>(async (url: string) => ({
		url,
		source: "var loaded=true;",
	}));
	const imports = new PageWorkerImports(context, [blobs], {
		url: "https://example.test/dir/worker.js",
		documentUrl: "https://example.test/page",
		budget,
		limits: scriptLimits(),
		policy,
		fetch,
		isClosed: () => false,
		...overrides,
	});
	cleanups.push(() => {
		imports.close();
		controller.abort();
		blobs.close();
		urls.close();
	});
	return {
		imports,
		policy,
		fetch,
		credits,
		evaluateNested,
		register,
		controller,
		blobUrl: (source: string, type = "text/javascript") =>
			runInContext(
				`URL.createObjectURL(new Blob([${JSON.stringify(source)}],{type:${JSON.stringify(type)}}))`,
				vm,
			) as string,
		revoke: (url: string) =>
			runInContext(`URL.revokeObjectURL(${JSON.stringify(url)})`, vm),
	};
}
it("registers an await-result host operation and completes each source before the next fetch", async () => {
	const test = fixture();
	const order: string[] = [];
	test.fetch.mockImplementation(async (url) => {
		order.push(url);
		return { url, source: url };
	});
	test.evaluateNested.mockImplementation(async (source) => {
		await Promise.resolve();
		order.push(`execute:${source}`);
	});
	await test.imports.operation(["a.js", "https://cdn.test/b.js"]);
	expect(order).toEqual([
		"https://example.test/dir/a.js",
		"execute:https://example.test/dir/a.js",
		"https://cdn.test/b.js",
		"execute:https://cdn.test/b.js",
	]);
	expect(test.register).toHaveBeenCalledOnce();
	expect(test.register.mock.results[0].value).toBe(test.imports.operation);
	expect(test.imports.metrics()).toMatchObject({
		calls: 1,
		scripts: 2,
		depth: 0,
		pending: 0,
	});
	expect(test.credits.size).toBe(0);
});
it("resolves all arguments before any fetch and rejects native accessors/proxies without invoking them", async () => {
	const test = fixture();
	const getter = vi.fn(() => "/secret.js");
	for (const input of [
		["valid.js", "data:text/javascript,x"],
		["valid.js", "http://example.test/x.js"],
		Object.defineProperty([], "0", { get: getter }),
		new Proxy([], { get: getter }),
	])
		await expect(test.imports.operation(input)).rejects.toThrow();
	expect(getter).not.toHaveBeenCalled();
	expect(test.fetch).not.toHaveBeenCalled();
	expect(test.imports.metrics().calls).toBe(0);
});
it("loads owned JavaScript Blob snapshots and rejects revoked/foreign or non-JavaScript imports", async () => {
	const test = fixture();
	const url = test.blobUrl("var value=7");
	await test.imports.operation([url]);
	expect(test.evaluateNested).toHaveBeenCalledWith("var value=7");
	await test.imports.operation([
		test.blobUrl("var legacy=8", "text/javascript1.5; charset=utf-8"),
	]);
	expect(test.evaluateNested).toHaveBeenCalledWith("var legacy=8");
	test.revoke(url);
	await expect(test.imports.operation([url])).rejects.toThrow(/revoked/i);
	await expect(
		test.imports.operation(["blob:https://other.test/foreign"]),
	).rejects.toThrow();
	await expect(test.imports.operation([test.blobUrl("x", "")])).rejects.toThrow(
		/MIME/i,
	);
	expect(test.fetch).not.toHaveBeenCalled();
});
it("keeps native source credits until nested execution finishes, including rejected execution", async () => {
	const test = fixture();
	let finish!: () => void;
	test.evaluateNested.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const pending = test.imports.operation(["a.js"]);
	await vi.waitFor(() => expect(test.evaluateNested).toHaveBeenCalledOnce());
	expect(test.credits.size).toBe(1);
	expect(test.imports.metrics().pending).toBe(1);
	finish();
	await pending;
	expect(test.credits.size).toBe(0);
	test.evaluateNested.mockRejectedValueOnce(Error("script error"));
	await expect(test.imports.operation(["b.js"])).rejects.toThrow(
		"script error",
	);
	expect(test.credits.size).toBe(0);
	expect(test.imports.metrics().depth).toBe(0);
});
it.each(["close", "owner-abort", "timeout"] as const)(
	"cancels pending imported source on %s and discards late results",
	async (action) => {
		let release!: (value: { url: string; source: string }) => void;
		let signal!: AbortSignal;
		const test = fixture({
			limits: scriptLimits({ timeoutMs: 20 }),
			fetch: async (url, input) => {
				signal = input;
				return new Promise((resolve) => {
					release = resolve;
				});
			},
		});
		const pending = test.imports.operation(["a.js"]);
		void pending.catch(() => {});
		await vi.waitFor(() => expect(signal).toBeDefined(), { interval: 1 });
		if (action === "close") test.imports.close();
		if (action === "owner-abort") test.controller.abort();
		await expect(pending).rejects.toThrow();
		expect(signal.aborted).toBe(true);
		release({ url: "https://example.test/dir/a.js", source: "var late=true" });
		await Promise.resolve();
		expect(test.evaluateNested).not.toHaveBeenCalled();
		expect(test.credits.size).toBe(0);
		expect(test.imports.metrics().depth).toBe(0);
	},
);
it("checks child CSP before fetching and again at the adapter's final URL", async () => {
	const test = fixture();
	test.policy.mockImplementation((url) => {
		if (url.includes("denied")) throw Error("policy denied");
	});
	await expect(test.imports.operation(["denied.js"])).rejects.toThrow(
		"policy denied",
	);
	expect(test.fetch).not.toHaveBeenCalled();
	test.fetch.mockResolvedValueOnce({
		url: "https://cdn.test/denied.js",
		source: "var forbidden=true",
	});
	await expect(test.imports.operation(["a.js"])).rejects.toThrow(
		"policy denied",
	);
	expect(test.evaluateNested).not.toHaveBeenCalled();
});
it("bounds lifetime calls and nested import depth without leaving credits", async () => {
	const test = fixture();
	for (let i = 0; i < 128; i++) await test.imports.operation([]);
	await expect(test.imports.operation([])).rejects.toThrow(/limit/i);
	const recursive = fixture();
	recursive.evaluateNested.mockImplementation(() =>
		recursive.imports.operation(["a.js"]),
	);
	await expect(recursive.imports.operation(["a.js"])).rejects.toThrow(/limit/i);
	expect(recursive.imports.metrics()).toMatchObject({
		scripts: 8,
		depth: 0,
		pending: 0,
	});
	expect(recursive.credits.size).toBe(0);
});
it("bounds individual and accumulated imported source before nested compilation", async () => {
	const test = fixture();
	test.fetch.mockResolvedValueOnce({
		url: "https://example.test/dir/a.js",
		source: "x".repeat(262145),
	});
	await expect(test.imports.operation(["a.js"])).rejects.toThrow(/limit/i);
	expect(test.evaluateNested).not.toHaveBeenCalled();
	const accumulated = fixture({ limits: scriptLimits({}, "large-source-v1") });
	accumulated.fetch.mockResolvedValue({
		url: "https://example.test/dir/a.js",
		source: "x".repeat(4194304),
	});
	await accumulated.imports.operation(["a.js", "a.js"]);
	await expect(accumulated.imports.operation(["a.js"])).rejects.toThrow(
		/limit/i,
	);
	expect(accumulated.imports.metrics()).toMatchObject({
		sourceCodeUnits: 8388608,
		depth: 0,
		pending: 0,
	});
});

it("keeps redirect provenance when checking path-restricted import sources", async () => {
	const test = fixture();
	test.policy.mockImplementation((url, redirects) => {
		if (url.endsWith("final.js") && redirects === 0)
			throw Error("path mismatch");
	});
	test.fetch.mockResolvedValueOnce({
		url: "https://example.test/final.js",
		source: "var loaded=true;",
		redirectCount: 1,
	});
	await test.imports.operation(["a.js"]);
	expect(test.policy).toHaveBeenLastCalledWith(
		"https://example.test/final.js",
		1,
	);
	expect(test.evaluateNested).toHaveBeenCalledOnce();
});
