import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeWasmCalls } from "../src/node-wasm-calls.js";
import { NodeWasmInstances } from "../src/node-wasm-instances.js";
import {
	NodeWasmMemories,
	type WasmMemoryBudget,
} from "../src/node-wasm-memories.js";
import { NodeWasmModules } from "../src/node-wasm-modules.js";
import type { ReleasedCore } from "../src/safejs-extension-types.js";
import { meterWasmModule } from "../src/wasm-metering.js";

// Authorized opt-in offline SafeJS + current JSPI diagnostic; not native tests.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
// node --experimental-wasm-jspi --max-old-space-size=128 \
//   dist/scripts/check-wasm-callbacks.js
// Node 24.14.0 is verified with that explicit flag. Node 22's old API is rejected.
// The 20 MiB memory and 32 MiB SDK quotas are diagnostics, not page defaults.
// No page WebAssembly global, meeting, socket or media API is supplied here.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!root) throw new Error("Select the compiled SafeJS package explicitly");
let core: ReleasedCore | undefined;
await loadPageRuntime(
	root,
	{ adapter: "extension" },
	{
		async importModule(specifier) {
			core = (await import(specifier)) as ReleasedCore;
			return core;
		},
	},
);
if (!core) throw new Error("SafeJS core was not loaded");
const sdk = core;
type WasmFunction = (...args: (number | bigint)[]) => unknown;
type ProbeBudget = InstanceType<ReleasedCore["Budget"]> &
	WasmMemoryBudget & {
		visitNode(): void;
		enterCall(): () => void;
		readonly currentDataSize: number;
		setRetainedDataUsage(owner: object, usage: number): void;
	};
function budget(maxSteps = 100000, maxCallDepth = 64): ProbeBudget {
	return new sdk.Budget({
		maxSteps,
		maxCallDepth,
		arrayLength: 33554432,
		dataSize: 33554432,
		deadline: Date.now() + 16000,
	}) as ProbeBudget;
}
function ensure(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
const section = (id: number, bytes: number[]): number[] => [
	id,
	bytes.length,
	...bytes,
];
const original = Uint8Array.from([
	0,
	97,
	115,
	109,
	1,
	0,
	0,
	0,
	...section(1, [2, 96, 0, 1, 127, 96, 1, 127, 1, 127]),
	...section(
		2,
		[
			2, 3, 101, 110, 118, 2, 99, 98, 0, 0, 3, 101, 110, 118, 1, 109, 2, 1, 192,
			2, 128, 4,
		],
	),
	...section(3, [3, 0, 1, 1]),
	...section(
		7,
		[
			3, 3, 114, 117, 110, 0, 1, 6, 104, 101, 108, 112, 101, 114, 0, 2, 4, 103,
			114, 111, 119, 0, 3,
		],
	),
	...section(
		10,
		[
			3, 17, 0, 65, 0, 16, 0, 58, 0, 0, 65, 0, 45, 0, 0, 65, 1, 106, 11, 7, 0,
			32, 0, 65, 1, 106, 11, 6, 0, 32, 0, 64, 0, 11,
		],
	),
]);
const metered = meterWasmModule(original, { guardMemoryGrowth: true });
ensure(
	WebAssembly.validate(metered.originalBytes as BufferSource),
	"Invalid original callback fixture",
);

const reports: unknown[] = [];
for (const cancel of [false, true]) {
	const quota = budget();
	const owner = new AbortController();
	const calls = new NodeWasmCalls(quota, owner.signal);
	const deadline = setTimeout(
		() => owner.abort(new Error("WASM callback diagnostic timed out")),
		16000,
	);
	let instance: object | undefined;
	let instances: NodeWasmInstances | undefined;
	let memory: WebAssembly.Memory | undefined;
	let memories: NodeWasmMemories | undefined;
	let callback: unknown;
	let entered!: () => void;
	const parked = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const extension = sdk.defineExtension({
		manifest: {
			version: 1,
			name: "wasm-callback-fixture",
			globals: ["port"],
			capabilities: ["source:nested", "array-buffer:share"],
		},
		setup(context) {
			const invoke = context.invokeCallback;
			ensure(
				invoke && context.createArrayBufferReference,
				"Selected SDK lacks full callback or live-buffer support",
			);
			context.onCleanup(() => calls.close());
			const modules = new NodeWasmModules(quota, context.signal);
			context.onCleanup(() => modules.close());
			const moduleToken = modules.compileSync(original);
			memories = new NodeWasmMemories(context, quota);
			context.onCleanup(() => memories?.close());
			const handle = memories.createMemory(320, 512);
			memory = memories.nativeMemory(handle);
			ensure(memory, "Missing owned fixture memory");
			instances = new NodeWasmInstances({
				context,
				budget: quota,
				modules,
				memories,
				calls,
			});
			const instanceOwner = instances;
			context.onCleanup(() => instanceOwner.close());
			return {
				globals: {
					port: context.createHostObject({
						properties: { memory: { get: () => handle } },
						methods: {
							install: (value) => {
								ensure(
									!instance && typeof value === "function",
									"Invalid callback fixture installation",
								);
								callback = value;
								instance = instanceOwner.instantiate(moduleToken, [
									callback,
									handle,
								]);
							},
							run: context.nestedOperation(() => {
								ensure(instance, "Callback fixture is not installed");
								return instanceOwner.invoke(instance, "run", []);
							}),
							grow: context.nestedOperation((value) => {
								ensure(
									instance && typeof value === "number",
									"Invalid growth argument",
								);
								return instanceOwner.invoke(instance, "grow", [value]);
							}),
							helper: context.nestedOperation((value) => {
								ensure(
									instance && typeof value === "number",
									"Invalid callback helper argument",
								);
								return instanceOwner.invoke(instance, "helper", [value]);
							}),
							park: context.nestedOperation(() => {
								entered();
								return new Promise(() => {});
							}),
						},
					}),
				},
			};
		},
	});
	const realm = sdk.createRealm({
		extensions: [extension],
		grants: ["source:nested", "array-buffer:share"],
		budget: quota,
		signal: owner.signal,
	});
	let outcome: unknown;
	let failure: unknown;
	try {
		const source = cancel
			? "const bytes=new Uint8Array(port.memory.buffer);port.install(()=>{bytes[0]=40;return port.park();});return port.run();"
			: "const bytes=new Uint8Array(port.memory.buffer);let count=0;port.install(()=>{count++;bytes[0]=40;port.grow(1);return port.helper(40);});const value=port.run();return [value,new Uint8Array(port.memory.buffer)[0],value instanceof Promise,count,bytes.length];";
		const execution = realm.evaluate(source);
		void execution.catch(() => {});
		if (cancel) {
			await parked;
			ensure(calls.callDepth === 1, "Suspended WASM depth was released early");
			owner.abort(new Error("Expected callback cancellation"));
		}
		try {
			outcome = await execution;
		} catch (error) {
			failure = error;
		}
		ensure(memory, "Fixture memory was not initialized");
		if (cancel) {
			ensure(
				failure instanceof Error &&
					failure.message === "Expected callback cancellation",
				"Cancellation did not propagate",
			);
			ensure(
				new Uint8Array(memory.buffer)[0] === 40,
				"Cancelled WASM resumed its store",
			);
		} else {
			const value = outcome as { ok?: boolean; returnValue?: unknown };
			ensure(
				value.ok && JSON.stringify(value.returnValue) === "[42,41,false,1,0]",
				"WASM callback result or guest synchronous return failed",
			);
			ensure(
				new Uint8Array(memory.buffer)[0] === 41,
				"WASM store was not visible to host memory",
			);
			ensure(
				quota.currentDataSize >= 20971520,
				"Live memory was not accounted",
			);
		}
		ensure(
			calls.pendingCalls === 0 && calls.callDepth === 0,
			"WASM call ownership leaked",
		);
		reports.push({
			case: cancel
				? "cancel-suspended-import"
				: "guest-callback-reentry-and-growth",
			bytes: memory.buffer.byteLength,
			growthCalls: memories?.metrics().growCalls,
			passed: true,
			steps: quota.stepsUsed,
			peakCallDepth: quota.peakCallDepth,
			retainedDataSize: quota.currentDataSize,
		});
	} finally {
		await realm.close();
		await calls.close();
		clearTimeout(deadline);
		ensure(
			quota.currentDataSize === 0 &&
				calls.pendingCalls === 0 &&
				calls.callDepth === 0 &&
				instances?.metrics().instances === 0 &&
				memories?.metrics().memories === 0,
			"Callback fixture cleanup leaked",
		);
	}
}
for (const limit of ["steps", "callDepth", "deadline"] as const) {
	const quota =
		limit === "deadline"
			? (new sdk.Budget({
					maxSteps: 100000,
					maxCallDepth: 8,
					dataSize: 33554432,
					deadline: Date.now() - 1,
				}) as ProbeBudget)
			: budget(limit === "steps" ? 25 : 100000, 8);
	const owner = new AbortController();
	const calls = new NodeWasmCalls(quota, owner.signal);
	const body = limit !== "callDepth" ? [3, 64, 12, 0, 11, 11] : [16, 0, 11];
	const source = Uint8Array.from([
		0,
		97,
		115,
		109,
		1,
		0,
		0,
		0,
		...section(1, [1, 96, 0, 0]),
		...section(3, [1, 0]),
		...section(7, [1, 3, 114, 117, 110, 0, 0]),
		...section(10, [1, body.length + 1, 0, ...body]),
	]);
	const metered = meterWasmModule(source);
	ensure(
		WebAssembly.validate(metered.originalBytes as BufferSource),
		"Invalid original budget fixture",
	);
	const instance = calls.instantiate(
		() =>
			new WebAssembly.Instance(
				new WebAssembly.Module(metered.bytes as BufferSource),
				calls.meterImports(metered),
			),
	);
	let failure: unknown;
	try {
		await calls.invoke(instance.exports.run as WasmFunction);
	} catch (error) {
		failure = error;
	} finally {
		await calls.close();
	}
	ensure(
		failure instanceof Error &&
			Object.getOwnPropertyDescriptor(failure, "budget")?.value === limit,
		"Native promise WASM escaped its budget",
	);
	ensure(
		calls.callDepth === 0 && calls.pendingCalls === 0,
		"Native budget failure leaked WASM depth",
	);
	reports.push({
		case: limit,
		passed: true,
		steps: quota.stepsUsed,
		peakCallDepth: quota.peakCallDepth,
	});
}
console.log(
	JSON.stringify({
		scope: "Offline actual JSPI/SafeJS callback and reentry",
		node: process.version,
		initialBytes: 20971520,
		passed: true,
		reports,
		cleanup: { currentDataSize: 0, depth: 0, pending: 0 },
	}),
);
