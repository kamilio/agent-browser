import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PageBindingContext } from "./page-bindings.js";
import type { PageRuntimeFactory, PageRuntimeOptions } from "./page-runtime.js";

const fixtureState = vi.hoisted(() => ({
	load: vi.fn(),
	spawn: vi.fn(() => {
		throw new Error("Unexpected subprocess");
	}),
	requests: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: fixtureState.spawn }));
vi.mock("./node-page-core.js", () => ({ loadPageRuntime: fixtureState.load }));
vi.mock("./node-process-boundary.js", () => ({
	processPermissions: () => ({
		enabled: true,
		filesystemWrite: false,
		childProcess: false,
		worker: false,
		addons: false,
		wasi: false,
		stringCodeGenerationDisabled: true,
	}),
}));
vi.mock("./node-transport.js", () => ({
	NodeNetworkTransport: class {
		async request(input: { url: string }) {
			fixtureState.requests(input);
			const body = new TextEncoder().encode("<p>Native transport fixture</p>");
			return {
				url: input.url,
				status: 200,
				headers: { "content-type": ["text/html"] },
				body,
				redirects: [],
				encodedBytes: body.byteLength,
				elapsedMs: 0,
			};
		}
		metrics() {
			return {
				requests: 0,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			};
		}
		close() {}
	},
}));

let input: EventEmitter | undefined;
const messages: Record<string, unknown>[] = [];
const exit = vi.fn();
const context: PageBindingContext = {
	createHostObject(definition) {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, method] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value: method });
		return object;
	},
	retainGuestArguments: (operation) => operation,
	releaseGuestReference() {},
};

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	fixtureState.load.mockReset();
	messages.length = 0;
	input = new EventEmitter();
	const output = Object.assign(new EventEmitter(), {
		write(data: string, callback?: (error?: Error) => void) {
			messages.push(JSON.parse(data));
			callback?.();
			return true;
		},
	});
	vi.spyOn(process, "stdin", "get").mockReturnValue(input as never);
	vi.spyOn(process, "stdout", "get").mockReturnValue(output as never);
	vi.spyOn(process, "exit").mockImplementation((code) => {
		exit(code);
		return undefined as never;
	});
});

afterEach(async () => {
	try {
		if (messages.some((message) => message.type === "fatal")) {
			await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
		} else {
			input?.emit("end");
			await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
		}
		expect(fixtureState.spawn).not.toHaveBeenCalled();
	} finally {
		vi.restoreAllMocks();
	}
});

function fakeFactory() {
	const runtimes: ReturnType<typeof makeRuntime>[] = [];
	function makeRuntime(options: PageRuntimeOptions) {
		const runtime = {
			budget: { stepsUsed: 0, peakCallDepth: 0, peakDataSize: 0 },
			closed: false,
			initialize: vi.fn(async () => {
				options.setup(context);
			}),
			evaluate: vi.fn(async (_source: string) => ({
				ok: true as const,
				returnValue: { selectedFactory: true },
			})),
			copyResult: (value: unknown) => value,
			startCallback: () => ({
				synchronous: Promise.resolve(),
				result: Promise.resolve(undefined),
			}),
			errorDetails: () => ({ code: "fixture-error" }),
			close: vi.fn(async () => {
				runtime.closed = true;
			}),
		};
		return runtime;
	}
	const factory = {
		createPageRuntime: vi.fn((options: PageRuntimeOptions) => {
			const runtime = makeRuntime(options);
			runtimes.push(runtime);
			return runtime;
		}),
	} satisfies PageRuntimeFactory;
	return { factory, runtimes };
}

function send(message: Record<string, unknown>) {
	input?.emit(
		"data",
		Buffer.from(`${JSON.stringify({ schemaVersion: 1, ...message })}\n`),
	);
}

async function waitMessage(type: string, id?: number) {
	await vi.waitFor(() =>
		expect(
			messages.some(
				(message) =>
					message.type === type && (id === undefined || message.id === id),
			),
		).toBe(true),
	);
	return messages.find(
		(message) =>
			message.type === type && (id === undefined || message.id === id),
	);
}

async function initialize(overrides: Record<string, unknown> = {}) {
	const test = fakeFactory();
	fixtureState.load.mockImplementation(async (_root, options) => ({
		factory: test.factory,
		adapter: options.adapter,
		packageName: "@poe-platform/safe-js",
		version: "0.1.40-fixture",
		publicExport: "./core",
		validation: "contract-shape-only",
	}));
	await import("./node-session-child.js");
	send({
		type: "initialize",
		packageRoot: "/trusted/fixture",
		session: "runtime",
		heartbeatMs: 250,
		...overrides,
	});
	return test;
}

it("uses the legacy default and reports shape-only readiness without evaluating a page", async () => {
	const { factory } = await initialize();
	expect(await waitMessage("ready")).toMatchObject({
		runtimeAdapter: "legacy",
		runtimeValidation: "contract-shape-only",
		publicExport: "./core",
		packageName: "@poe-platform/safe-js",
	});
	expect(fixtureState.load).toHaveBeenCalledExactlyOnceWith(
		"/trusted/fixture",
		{ adapter: "legacy" },
	);
	expect(factory.createPageRuntime).not.toHaveBeenCalled();
	expect(fixtureState.requests).not.toHaveBeenCalled();
});

it("passes the selected factory into real PageScripts and executes through the command path", async () => {
	const { factory, runtimes } = await initialize({
		runtimeAdapter: "extension",
	});
	await waitMessage("ready");
	expect(fixtureState.load).toHaveBeenCalledWith("/trusted/fixture", {
		adapter: "extension",
	});
	send({ type: "command", id: 1, argv: ["open", "https://fixture.invalid/"] });
	await waitMessage("result", 1);
	expect(factory.createPageRuntime).not.toHaveBeenCalled();
	send({ type: "command", id: 2, argv: ["eval", "fixture-source"] });
	expect(await waitMessage("result", 2)).toMatchObject({
		result: { data: { ok: true, value: { selectedFactory: true } } },
	});
	expect(factory.createPageRuntime).toHaveBeenCalledOnce();
	expect(runtimes[0].initialize).toHaveBeenCalledOnce();
	expect(runtimes[0].evaluate).toHaveBeenCalledWith(
		"fixture-source",
		expect.anything(),
	);
	send({ type: "command", id: 3, argv: ["eval", "second-source"] });
	await waitMessage("result", 3);
	expect(factory.createPageRuntime).toHaveBeenCalledOnce();
	input?.emit("end");
	await vi.waitFor(() => expect(exit).toHaveBeenCalled());
	expect(runtimes[0].close).toHaveBeenCalled();
});

it.each([undefined, "classic"])(
	"keeps website script capability opt-in independent (%s)",
	async (websiteScripts) => {
		await initialize({ runtimeAdapter: "extension", websiteScripts });
		await waitMessage("ready");
		send({ type: "command", id: 1, argv: ["capabilities"] });
		expect(await waitMessage("result", 1)).toMatchObject({
			result: { data: { websiteJavaScript: websiteScripts === "classic" } },
		});
	},
);

it.each([null, false, "auto", ""])(
	"rejects invalid child adapter %s before module loading",
	async (runtimeAdapter) => {
		await initialize({ runtimeAdapter });
		expect(await waitMessage("fatal")).toMatchObject({ code: "invalid-input" });
		expect(fixtureState.load).not.toHaveBeenCalled();
		expect(messages.some((message) => message.type === "ready")).toBe(false);
	},
);

it("rejects invalid website script mode before module loading", async () => {
	await initialize({ runtimeAdapter: "extension", websiteScripts: "modules" });
	expect(await waitMessage("fatal")).toMatchObject({ code: "invalid-input" });
	expect(fixtureState.load).not.toHaveBeenCalled();
});

it("does not emit ready or fall back when explicit runtime loading fails", async () => {
	await import("./node-session-child.js");
	fixtureState.load.mockImplementation(async () => {
		const { AgentBrowserError } = await import("./errors.js");
		throw new AgentBrowserError("unsupported", "fixture contract mismatch");
	});
	send({
		type: "initialize",
		packageRoot: "/trusted/fixture",
		session: "runtime",
		heartbeatMs: 250,
		runtimeAdapter: "extension",
	});
	expect(await waitMessage("fatal")).toMatchObject({ code: "unsupported" });
	expect(fixtureState.load).toHaveBeenCalledOnce();
	expect(messages.some((message) => message.type === "ready")).toBe(false);
});
