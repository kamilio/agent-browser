import { loadPageRuntime } from "../src/node-page-core.js";
import { pageWasmBootstrapSource } from "../src/page-wasm-bootstrap.js";
import { PageWasm, type PageWasmBudget } from "../src/page-wasm.js";
import type { ReleasedCore } from "../src/safejs-extension-types.js";
// Authorized opt-in offline actual SafeJS + JSPI guest WebAssembly API diagnostic.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js node \
// --experimental-wasm-jspi --max-old-space-size=128 dist/scripts/check-wasm-page.js
// Explicit Node24 JSPI, 32 MiB quotas and 16 s deadline are diagnostic allowances.
// No page/Worker installer, public asset, socket, meeting or media is exercised.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!root) throw new Error("Select the compiled SDK explicitly");
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
if (!core) throw new Error("SDK core unavailable");
const unsigned = (input: number) => {
	const bytes: number[] = [];
	let value = input;
	do {
		const byte = value % 128;
		value = Math.floor(value / 128);
		bytes.push(byte | (value ? 128 : 0));
	} while (value);
	return bytes;
};
const string = (value: string) => [
	value.length,
	...new TextEncoder().encode(value),
];
const section = (id: number, bytes: number[]) => [
	id,
	...unsigned(bytes.length),
	...bytes,
];
const bytes = Uint8Array.from([
	0,
	97,
	115,
	109,
	1,
	0,
	0,
	0,
	...section(1, [2, 96, 0, 1, 127, 96, 1, 127, 1, 127]),
	...section(2, [
		2,
		...string("env"),
		...string("cb"),
		0,
		0,
		...string("env"),
		...string("m"),
		2,
		1,
		192,
		2,
		128,
		4,
	]),
	...section(3, [3, 0, 1, 1]),
	...section(7, [
		4,
		...string("run"),
		0,
		1,
		...string("helper"),
		0,
		2,
		...string("grow"),
		0,
		3,
		...string("memory"),
		2,
		0,
	]),
	...section(
		10,
		[
			3, 17, 0, 65, 0, 16, 0, 58, 0, 0, 65, 0, 45, 0, 0, 65, 1, 106, 11, 7, 0,
			32, 0, 65, 1, 106, 11, 6, 0, 32, 0, 64, 0, 11,
		],
	),
]);
const plain = Uint8Array.from([
	0,
	97,
	115,
	109,
	1,
	0,
	0,
	0,
	...section(1, [1, 96, 1, 127, 1, 127]),
	...section(3, [1, 0]),
	...section(7, [1, ...string("run"), 0, 0]),
	...section(10, [1, 7, 0, 32, 0, 65, 1, 106, 11]),
]);
const trap = Uint8Array.from([
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
	...section(7, [1, ...string("run"), 0, 0]),
	...section(10, [1, 3, 0, 0, 11]),
]);
const controller = new AbortController();
const budget = new core.Budget({
	maxSteps: 100000,
	maxCallDepth: 64,
	arrayLength: 33554432,
	dataSize: 33554432,
	deadline: Date.now() + 16000,
}) as InstanceType<ReleasedCore["Budget"]> &
	PageWasmBudget & { readonly currentDataSize: number };
let bridge: PageWasm | undefined;
const extension = core.defineExtension({
	manifest: {
		version: 1,
		name: "guest-wasm-fixture",
		globals: ["__agentBrowserWasm", "fixture"],
		capabilities: ["source:nested", "array-buffer:share"],
	},
	setup(context) {
		bridge = new PageWasm(context, budget);
		return {
			globals: {
				__agentBrowserWasm: bridge.port,
				fixture: context.createHostObject({
					properties: {
						bytes: { get: () => bytes },
						plain: { get: () => plain },
						trap: { get: () => trap },
					},
				}),
			},
		};
	},
});
const realm = core.createRealm({
	extensions: [extension],
	grants: ["source:nested", "array-buffer:share"],
	budget,
	signal: controller.signal,
});
const timer = setTimeout(
	() => controller.abort(new Error("Guest WASM diagnostic timeout")),
	16000,
);
const reports: unknown[] = [];
function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
try {
	const initialized = await realm.evaluate(pageWasmBootstrapSource);
	check(initialized.ok, "Guest namespace initialization failed");
	const execution = await realm.evaluate(
		"const module=new WebAssembly.Module(fixture.bytes);const memory=new WebAssembly.Memory({initial:320,maximum:512});let instance;let count=0;instance=new WebAssembly.Instance(module,{env:{cb(){count++;new Uint8Array(memory.buffer)[0]=40;instance.exports.grow(1);return instance.exports.helper(40);},m:memory}});const before=new Uint8Array(memory.buffer);const value=instance.exports.run();return [value,new Uint8Array(memory.buffer)[0],value instanceof Promise,count,before.length,instance.exports.memory===memory,Object.isFrozen(instance.exports),WebAssembly.Module.imports(module).length,WebAssembly.Module.exports(module).length,WebAssembly.validate(fixture.bytes)];",
	);
	check(
		execution.ok &&
			JSON.stringify(execution.returnValue) ===
				"[42,41,false,1,0,true,true,2,4,true]",
		"Guest callback/reentry/memory identity failed",
	);
	reports.push({
		case: "guest-constructors-callback-reentry-and-growth",
		passed: true,
		steps: budget.stepsUsed,
		peakCallDepth: budget.peakCallDepth,
		retainedDataSize: budget.currentDataSize,
	});
	const asynchronous = await realm.evaluate(
		"return await(async()=>{const m=await WebAssembly.compile(fixture.plain);const i=await WebAssembly.instantiate(m);const pair=await WebAssembly.instantiate(fixture.plain);return [i.exports.run(41),pair.instance.exports.run(41),i instanceof WebAssembly.Instance,pair.module instanceof WebAssembly.Module];})();",
	);
	check(
		asynchronous.ok &&
			JSON.stringify(asynchronous.returnValue) === "[42,42,true,true]",
		"Guest async compile/instantiate failed",
	);
	reports.push({ case: "async-overloads", passed: true });
	const errors = await realm.evaluate(
		"return (()=>{let compile=false;try{new WebAssembly.Module(new Uint8Array([0,1,2]));}catch(e){compile=e instanceof WebAssembly.CompileError;}let link=false;try{new WebAssembly.Instance(module);}catch(e){link=e instanceof WebAssembly.LinkError;}return [compile,link];})();",
	);
	check(
		errors.ok && JSON.stringify(errors.returnValue) === "[true,true]",
		"Guest compile/link error brands failed",
	);
	reports.push({ case: "compile-link-errors", passed: true });
	const traps = await realm.evaluate(
		"return (()=>{const instance=new WebAssembly.Instance(new WebAssembly.Module(fixture.trap));try{instance.exports.run();}catch(error){return error instanceof WebAssembly.RuntimeError;}return false;})();",
	);
	check(
		traps.ok && traps.returnValue === true,
		"Guest trap error brand failed",
	);
	reports.push({ case: "runtime-trap", passed: true });
} finally {
	await realm.close();
	await bridge?.close();
	clearTimeout(timer);
	const metrics = bridge?.metrics();
	check(
		metrics &&
			metrics.modules.modules === 0 &&
			metrics.modules.leases === 0 &&
			metrics.instances.instances === 0 &&
			metrics.memories.memories === 0 &&
			metrics.depth === 0 &&
			metrics.pending === 0 &&
			budget.currentDataSize === 0,
		"Guest API cleanup leaked",
	);
	console.log(
		JSON.stringify({
			scope: "Offline actual SafeJS/JSPI guest WebAssembly API",
			node: process.version,
			passed: reports.length === 4,
			reports,
			cleanup: { ...metrics, currentDataSize: budget.currentDataSize },
		}),
	);
}
