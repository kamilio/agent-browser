import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadPageRuntime } from "../src/node-page-core.js";
import { NodeWasmMemories } from "../src/node-wasm-memories.js";
import { pageWasmMemoryBootstrapSource } from "../src/page-wasm-memory-bootstrap.js";
import type {
	ReleasedCore,
	ReleasedRealm,
} from "../src/safejs-extension-types.js";
import { WasmCallDepth, meterWasmModule } from "../src/wasm-metering.js";

// Opt-in offline SafeJS + native WASM diagnostic, separate from native tests.
// Select the patched compiled SDK explicitly. The default 320 pages matches
// Zoom's 20 MiB initial network memory; it must pass full typed-array views and
// both directions of real WASM access, not merely buffer exposure.
// AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/path/to/safe-js \
//   node --max-old-space-size=128 dist/scripts/check-wasm-memory.js
// AGENT_BROWSER_WASM_MEMORY_PAGES=1 selects a smaller bridge regression fixture;
// that fixture does not clear the Zoom size gate. The 32 MiB SDK array/data and
// 16 s timing allowances are diagnostics, not default page runtime limits.
// The owned 128 MiB child contains native allocation failures; absent a child
// result, tracked-data cleanup is unverified rather than reported as successful.
const root = process.env.AGENT_BROWSER_SAFEJS_SOURCE_ROOT;
if (!root) throw new Error("Select the compiled SafeJS package explicitly");
const pages = Number(process.env.AGENT_BROWSER_WASM_MEMORY_PAGES ?? 320);
if (!Number.isSafeInteger(pages) || pages < 1 || pages > 320)
	throw new Error("Memory fixture must be between 1 and 320 pages");
if (!process.argv.includes("--isolated-probe")) {
	const child = spawn(
		process.execPath,
		[
			"--max-old-space-size=128",
			fileURLToPath(import.meta.url),
			"--isolated-probe",
		],
		{
			env: {
				AGENT_BROWSER_SAFEJS_SOURCE_ROOT: root,
				AGENT_BROWSER_WASM_MEMORY_PAGES: String(pages),
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderrTail = "";
	let heapExceeded = false;
	let deadlineExceeded = false;
	child.stdout.on("data", (chunk: Buffer) => {
		stdout += chunk.toString().slice(0, 8192 - stdout.length);
	});
	child.stderr.on("data", (chunk: Buffer) => {
		const combined = stderrTail + chunk.toString();
		heapExceeded ||= /heap out of memory|Reached heap limit/i.test(combined);
		stderrTail = combined.slice(-2048);
	});
	const timer = setTimeout(() => {
		deadlineExceeded = true;
		child.kill("SIGKILL");
	}, 20000);
	try {
		const result = await new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code, signal) => resolve({ code, signal }));
		});
		let report: Record<string, unknown> | undefined;
		try {
			const parsed: unknown = JSON.parse(stdout);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
				report = parsed as Record<string, unknown>;
		} catch {
			/* A fatal native allocation has no guest cleanup report. */
		}
		if (
			report &&
			report.pages === pages &&
			report.bytes === pages * 65536 &&
			report.passed === true &&
			result.code === 0 &&
			!deadlineExceeded
		) {
			console.log(JSON.stringify(report));
			process.exitCode = 0;
		} else {
			console.log(
				JSON.stringify({
					...report,
					scope: "Offline metered WASM/live SafeJS memory views",
					pages,
					bytes: pages * 65536,
					passed: false,
					process: {
						...result,
						heapLimitMiB: 128,
						heapExceeded,
						deadlineExceeded,
					},
					cleanup:
						result.signal === null && !deadlineExceeded && report
							? report.cleanup
							: { verified: false },
				}),
			);
			process.exitCode = 1;
		}
	} finally {
		clearTimeout(timer);
	}
} else {
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
	const budget = new core.Budget({
		maxSteps: 100000,
		maxCallDepth: 64,
		arrayLength: 33554432,
		dataSize: 33554432,
		deadline: Date.now() + 16000,
	}) as InstanceType<ReleasedCore["Budget"]> & {
		visitNode(): void;
		enterCall(): () => void;
		readonly currentDataSize: number;
		allocateArrayLength(bytes: number): void;
		provisionDataUsage(bytes: number): () => void;
	};
	const depth = new WasmCallDepth(budget);
	let memories: NodeWasmMemories | undefined;
	let wasm: WebAssembly.Instance;
	const section = (id: number, bytes: number[]): number[] => [
		id,
		bytes.length,
		...bytes,
	];
	const input = Uint8Array.from([
		0,
		97,
		115,
		109,
		1,
		0,
		0,
		0,
		...section(1, [3, 96, 0, 1, 127, 96, 1, 127, 0, 96, 1, 127, 1, 127]),
		...section(2, [1, 3, 101, 110, 118, 1, 109, 2, 1, 1, 128, 16]),
		...section(3, [3, 0, 1, 2]),
		...section(
			7,
			[
				3, 4, 108, 111, 97, 100, 0, 0, 4, 115, 97, 118, 101, 0, 1, 4, 103, 114,
				111, 119, 0, 2,
			],
		),
		...section(
			10,
			[
				3, 7, 0, 65, 0, 45, 0, 0, 11, 9, 0, 65, 0, 32, 0, 58, 0, 0, 11, 6, 0,
				32, 0, 64, 0, 11,
			],
		),
	]);
	const metered = meterWasmModule(input, { guardMemoryGrowth: true });
	if (!metered.memoryGrowImportName) throw new Error("Missing growth hook");
	const growthName = metered.memoryGrowImportName;
	if (!WebAssembly.validate(metered.originalBytes as BufferSource))
		throw new Error("Invalid original fixture");
	let realm: ReleasedRealm | undefined;
	let stage = "setup";
	let exposed = false;
	let fullViews = false;
	let retainedDataSize = 0;
	let guestToWasm = false;
	let wasmToGuest = false;
	let failure: unknown;
	let cleanupVerified = false;
	const extension = core.defineExtension({
		manifest: {
			version: 1,
			name: "wasm-memory-fixture",
			globals: ["memory", "__agentBrowserWasmMemories"],
			capabilities: ["array-buffer:share"],
		},
		setup(context) {
			memories = new NodeWasmMemories(context, budget);
			context.onCleanup(() => memories?.close());
			const handle = memories.createMemory(pages, 2048);
			const memory = memories.nativeMemory(handle);
			if (!memory) throw new Error("Missing owned native memory");
			wasm = depth.run(
				() =>
					new WebAssembly.Instance(
						new WebAssembly.Module(metered.bytes as BufferSource),
						{
							env: { m: memory },
							[metered.importModule]: {
								[metered.importName]: () => budget.visitNode(),
								[metered.enterImportName]: () => depth.enter(),
								[metered.leaveImportName]: () => depth.leave(),
								[growthName]: (delta: number) => {
									if (!memories || depth.depth === 0)
										throw new Error("Unowned memory growth");
									return memories.wasmGrow(handle, delta);
								},
							},
						},
					),
			);
			exposed = true;
			return {
				globals: { memory: handle, __agentBrowserWasmMemories: memories.port },
			};
		},
	});
	try {
		realm = core.createRealm({
			extensions: [extension],
			grants: ["array-buffer:share"],
			budget,
			signal: AbortSignal.timeout(16000),
		});
		const installed = await realm.evaluate(pageWasmMemoryBootstrapSource);
		if (!installed.ok) throw new Error("Memory bootstrap failed");
		stage = "full-views";
		const views = await realm.evaluate(
			"const u8=new Uint8Array(memory.buffer);const i32=new Int32Array(memory.buffer);const f64=new Float64Array(memory.buffer);u8[0]=42;return [u8.length,i32.length,f64.length,u8.buffer===i32.buffer,i32.buffer===f64.buffer];",
		);
		const expected = [pages * 65536, pages * 16384, pages * 8192, true, true];
		if (
			!views.ok ||
			JSON.stringify(views.returnValue) !== JSON.stringify(expected)
		)
			throw new Error("Full memory-view fixture failed");
		retainedDataSize = budget.currentDataSize;
		if (retainedDataSize < pages * 65536)
			throw new Error("Shared backing storage is not fully accounted");
		fullViews = true;
		stage = "guest-to-wasm";
		guestToWasm = depth.run(() => (wasm.exports.load as () => number)()) === 42;
		if (!guestToWasm) throw new Error("Guest writes are not visible to WASM");
		stage = "wasm-to-guest";
		depth.run(() => (wasm.exports.save as (value: number) => void)(99));
		const reads = await realm.evaluate("return u8[0];");
		wasmToGuest = reads.ok && reads.returnValue === 99;
		if (!wasmToGuest)
			throw new Error("WASM writes are not visible to guest views");
		stage = "growth";
		const grown = await realm.evaluate(
			"const old=memory.buffer;const previous=memory.grow(1);const next=memory.buffer;return [previous,old.byteLength,u8.length,next.byteLength,new Uint8Array(next)[0],old===next];",
		);
		const expectedGrowth = [pages, 0, 0, (pages + 1) * 65536, 99, false];
		if (
			!grown.ok ||
			JSON.stringify(grown.returnValue) !== JSON.stringify(expectedGrowth)
		)
			throw new Error("Owned memory growth failed");
		if (depth.run(() => (wasm.exports.load as () => number)()) !== 99)
			throw new Error("WASM lost memory after growth");
		stage = "native-growth";
		if (
			depth.run(() => (wasm.exports.grow as (delta: number) => number)(1)) !==
			pages + 1
		)
			throw new Error("Native growth result failed");
		const nativeGrown = await realm.evaluate(
			"return [next.byteLength,memory.buffer.byteLength,new Uint8Array(memory.buffer)[0]];",
		);
		if (
			!nativeGrown.ok ||
			JSON.stringify(nativeGrown.returnValue) !==
				JSON.stringify([0, (pages + 2) * 65536, 99])
		)
			throw new Error("Native growth did not refresh live views");
		if (
			depth.run(() => (wasm.exports.grow as (delta: number) => number)(-1)) !==
			-1
		)
			throw new Error("Native growth maximum failure semantics failed");
		const preserved = await realm.evaluate(
			"return [memory.buffer.byteLength,new Uint8Array(memory.buffer)[0]];",
		);
		if (
			!preserved.ok ||
			JSON.stringify(preserved.returnValue) !==
				JSON.stringify([(pages + 2) * 65536, 99])
		)
			throw new Error("Native failed growth changed storage");
		const wrapped = await realm.evaluate(
			"return (()=>{const m=new WebAssembly.Memory({initial:1,maximum:2});const b=m.buffer;new Uint8Array(b)[0]=42;const p=m.grow(1);const next=m.buffer;const bytes=new Uint8Array(next);const zero=m.grow(0);return [p,b.byteLength,bytes.length,zero,next.byteLength,m.buffer.byteLength,new Uint8Array(m.buffer)[0],m instanceof WebAssembly.Memory];})();",
		);
		if (
			!wrapped.ok ||
			JSON.stringify(wrapped.returnValue) !==
				JSON.stringify([1, 0, 0, 2, 0, 131072, 42, true])
		)
			throw new Error("Actual SafeJS Memory wrapper growth failed");
		retainedDataSize = budget.currentDataSize;
		stage = "complete";
	} catch (error) {
		// Fixed fixture contains no credentials/page data. Bound its error text.
		failure =
			error instanceof Error
				? { name: error.name, message: error.message.slice(0, 256) }
				: error && typeof error === "object"
					? Object.fromEntries(
							["name", "message", "code", "budget", "current", "limit"]
								.map((key) => [
									key,
									Object.getOwnPropertyDescriptor(error, key)?.value,
								])
								.filter(
									([, value]) =>
										typeof value === "string" || typeof value === "number",
								),
						)
					: { name: "UnknownError" };
	} finally {
		const closes = await Promise.allSettled(realm ? [realm.close()] : []);
		cleanupVerified =
			closes.every((result) => result.status === "fulfilled") &&
			budget.currentDataSize === 0 &&
			depth.depth === 0 &&
			memories?.metrics().memories === 0;
		const passed =
			stage === "complete" &&
			exposed &&
			fullViews &&
			guestToWasm &&
			wasmToGuest &&
			cleanupVerified;
		console.log(
			JSON.stringify({
				scope: "Offline metered WASM/live SafeJS memory views",
				pages,
				bytes: pages * 65536,
				stage,
				exposed,
				fullViews,
				retainedDataSize,
				guestToWasm,
				wasmToGuest,
				ownedMemories: memories?.metrics(),
				guardedGrowthInstructions: metered.memoryGrowInstructions,
				failure,
				passed,
				cleanup: {
					verified: cleanupVerified,
					currentDataSize: budget.currentDataSize,
					ownedDepth: depth.depth,
				},
			}),
		);
		process.exitCode = passed ? 0 : 1;
	}
}
