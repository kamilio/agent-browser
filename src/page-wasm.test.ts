import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";
import type { WasmPromiseApi } from "./node-wasm-calls.js";
import { pageWasmBootstrapSource } from "./page-wasm-bootstrap.js";
import { PageWasm } from "./page-wasm.js";
import type { ReleasedHostDefinition } from "./safejs-extension-types.js";
const section = (id: number, bytes: number[]) => [id, bytes.length, ...bytes];
const binary = (...sections: number[][]) =>
	Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...sections.flat()]);
const bytes = binary(
	section(1, [1, 96, 1, 127, 1, 127]),
	section(3, [1, 0]),
	section(7, [1, 3, 114, 117, 110, 0, 0]),
	section(10, [1, 7, 0, 32, 0, 65, 1, 106, 11]),
);
const memoryBytes = binary(
	section(2, [1, 1, 101, 1, 109, 2, 1, 1, 2]),
	section(7, [1, 1, 109, 2, 0]),
);
const api: WasmPromiseApi = {
	Suspending: class {},
	promising:
		(operation) =>
		(...args) =>
			Promise.resolve(operation(...args)),
};
function fixture(compilation: "allow" | "deny" = "allow") {
	const controller = new AbortController();
	const credits = new Map<object, number>();
	const budget = {
		visitNode: vi.fn(),
		allocateArrayLength: vi.fn(),
		provisionDataUsage: () => () => {},
		setRetainedDataUsage(token: object, size: number) {
			if (size) credits.set(token, size);
			else credits.delete(token);
		},
		enterCall: () => () => {},
	};
	const context = {
		signal: controller.signal,
		onCleanup: vi.fn(),
		createHostObject(def: ReleasedHostDefinition) {
			const object = Object.create(null);
			for (const [key, descriptor] of Object.entries(def.properties ?? {}))
				Object.defineProperty(object, key, descriptor);
			for (const [key, method] of Object.entries(def.methods ?? {}))
				Object.defineProperty(object, key, { value: method });
			return object;
		},
		createArrayBufferReference: (value: ArrayBuffer) => value,
		releaseGuestReference: () => {},
		invokeCallback: async () => 0,
		nestedOperation: <T>(value: T) => value,
	};
	const owner = new PageWasm(context, budget, api, compilation);
	const vm = createContext({
		__agentBrowserWasm: owner.port,
		bytes,
		memoryBytes,
	});
	const evaluate = (source: string) =>
		runInContext(source, vm, { timeout: 1000 });
	evaluate(pageWasmBootstrapSource);
	return { owner, context, budget, credits, controller, evaluate };
}
it("constructs branded modules/instances with immutable exports and original reflection", async () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var m=new WebAssembly.Module(bytes);var i=new WebAssembly.Instance(m);[m instanceof WebAssembly.Module,i instanceof WebAssembly.Instance,Object.prototype.toString.call(m),Object.prototype.toString.call(i),Object.getPrototypeOf(i.exports)===null,Object.isFrozen(i.exports),i.exports.run.length,i.exports.run.name,WebAssembly.Module.imports(m),WebAssembly.Module.exports(m)]",
		),
	).toEqual([
		true,
		true,
		"[object WebAssembly.Module]",
		"[object WebAssembly.Instance]",
		true,
		true,
		1,
		"0",
		[],
		[{ name: "run", kind: "function" }],
	]);
	expect(await f.evaluate("i.exports.run(41)")).toBe(42);
	await f.owner.close();
	expect(f.credits.size).toBe(0);
});
it("preserves memory wrapper identity when exporting an imported memory", async () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var memory=new WebAssembly.Memory({initial:1,maximum:2});var m=new WebAssembly.Module(memoryBytes);var i=new WebAssembly.Instance(m,{e:{m:memory}});[i.exports.m===memory,memory.buffer===i.exports.m.buffer,memory.grow(1),memory.buffer.byteLength]",
		),
	).toEqual([true, true, 1, 131072]);
	await f.owner.close();
});
it("preserves configurable export metadata and immutable export bindings", async () => {
	const f = fixture();
	expect(
		f.evaluate(`
			Object.defineProperties=()=>{throw new Error('replaced intrinsic')};
			var i=new WebAssembly.Instance(new WebAssembly.Module(bytes));
			[Object.getOwnPropertyDescriptor(i.exports.run,'length'),
			Object.getOwnPropertyDescriptor(i.exports.run,'name'),
			Object.getOwnPropertyDescriptor(i.exports,'run')]
		`),
	).toEqual([
		{ value: 1, writable: false, enumerable: false, configurable: true },
		{ value: "0", writable: false, enumerable: false, configurable: true },
		{
			value: expect.any(Function),
			writable: false,
			enumerable: true,
			configurable: false,
		},
	]);
	expect(
		f.evaluate(`
			Object.defineProperty(i.exports.run,'name',{value:'renamed'});
			Object.defineProperty(i.exports.run,'length',{value:7});
			[i.exports.run.name,i.exports.run.length]
		`),
	).toEqual(["renamed", 7]);
	expect(await f.evaluate("i.exports.run(41)")).toBe(42);
	await f.owner.close();
	expect(f.credits.size).toBe(0);
});
it("coerces export arguments once, preserves thrown values and revokes retained exports", async () => {
	const f = fixture();
	expect(
		await f.evaluate(`
			var run=new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports.run;
			var reads=0;
			run({valueOf(){reads++;return '41'}}, {valueOf(){throw 'unused'}})
		`),
	).toBe(42);
	expect(f.evaluate("reads")).toBe(1);
	expect(
		f.evaluate(`
			var thrown={};var same=false;
			try{run({valueOf(){throw thrown}})}catch(error){same=error===thrown}
			same
		`),
	).toBe(true);
	await f.owner.close();
	expect(() => f.evaluate("run(41)")).toThrow(/closed/);
	expect(f.credits.size).toBe(0);
});
it("supports async compilation and both instantiate overloads", async () => {
	const f = fixture();
	expect(
		await f.evaluate(
			"(async()=>{const m=await WebAssembly.compile(bytes);const i=await WebAssembly.instantiate(m);const pair=await WebAssembly.instantiate(bytes);return [i instanceof WebAssembly.Instance,pair.module instanceof WebAssembly.Module,pair.instance instanceof WebAssembly.Instance,await pair.instance.exports.run(41)];})()",
		),
	).toEqual([true, true, true, 42]);
	await f.owner.close();
});
it("copies precisely a DataView byte range and validates before constructor compilation", async () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var b=new Uint8Array(bytes.length+8);b.set(bytes,4);var view=new DataView(b.buffer,4,bytes.length);[WebAssembly.validate(view),new WebAssembly.Module(view) instanceof WebAssembly.Module,WebAssembly.validate(new Uint8Array([0,1,2]))]",
		),
	).toEqual([true, true, false]);
	await f.owner.close();
});
it("resolves guest import getters in declaration order once and rejects raw foreign memories", async () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var m=new WebAssembly.Module(memoryBytes);var memory=new WebAssembly.Memory({initial:1,maximum:2});var reads=[];new WebAssembly.Instance(m,{get e(){reads.push('e');return {get m(){reads.push('m');return memory}}}});reads",
		),
	).toEqual(["e", "m"]);
	expect(() => f.evaluate("new WebAssembly.Instance(m,{e:{m:{}}})")).toThrow(
		/memory/,
	);
	await f.owner.close();
});
it("translates compile/link errors and checks private receiver brands", async () => {
	const f = fixture();
	expect(
		f.evaluate(
			"var compile=false;try{new WebAssembly.Module(new Uint8Array([0,1,2]))}catch(e){compile=e instanceof WebAssembly.CompileError}var link=false;try{new WebAssembly.Instance(new WebAssembly.Module(memoryBytes))}catch(e){link=e instanceof WebAssembly.LinkError} [compile,link]",
		),
	).toEqual([true, true]);
	expect(() => f.evaluate("WebAssembly.Module.exports({})")).toThrow();
	expect(() =>
		f.evaluate(
			"Object.getOwnPropertyDescriptor(WebAssembly.Instance.prototype,'exports').get.call({})",
		),
	).toThrow();
	await f.owner.close();
});
it("bounds sources and revokes retained API methods at close", async () => {
	const f = fixture();
	expect(() =>
		f.evaluate("new WebAssembly.Module(new Uint8Array(1048577))"),
	).toThrow(/limit/);
	await f.owner.close();
	expect(() => f.evaluate("new WebAssembly.Module(bytes)")).toThrow(/closed/);
});

it("denies sync and async WASM compilation while retaining validation and memory APIs", async () => {
	const f = fixture("deny");
	expect(f.evaluate("WebAssembly.validate(bytes)")).toBe(true);
	expect(
		f.evaluate(
			"new WebAssembly.Memory({initial:1,maximum:2}).buffer.byteLength",
		),
	).toBe(65536);
	expect(
		f.evaluate(
			"var denied=false;try{new WebAssembly.Module(bytes)}catch(e){denied=e instanceof WebAssembly.CompileError}denied",
		),
	).toBe(true);
	expect(
		await f.evaluate(
			"WebAssembly.compile(bytes).then(()=>false,e=>e instanceof WebAssembly.CompileError)",
		),
	).toBe(true);
	expect(
		await f.evaluate(
			"WebAssembly.instantiate(bytes).then(()=>false,e=>e instanceof WebAssembly.CompileError)",
		),
	).toBe(true);
	expect(f.owner.metrics().modules.compileCalls).toBe(0);
	await f.owner.close();
	expect(f.credits.size).toBe(0);
});
