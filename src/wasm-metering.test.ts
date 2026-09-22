import { expect, it } from "vitest";
import { WasmCallDepth, meterWasmModule } from "./wasm-metering.js";

const unsigned = (input: number): number[] => {
	let value = input;
	const bytes: number[] = [];
	do {
		const byte = value % 128;
		value = Math.floor(value / 128);
		bytes.push(byte | (value ? 128 : 0));
	} while (value);
	return bytes;
};
const string = (value: string): number[] => {
	const bytes = new TextEncoder().encode(value);
	return [...unsigned(bytes.length), ...bytes];
};
const section = (id: number, bytes: number[]): number[] => [
	id,
	...unsigned(bytes.length),
	...bytes,
];
const moduleBytes = (...sections: number[][]): Uint8Array =>
	Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0, ...sections.flat()]);
const types = section(1, [1, 0x60, 0, 1, 0x7f]);
function fixture(
	bodies: number[][],
	extras: {
		imports?: number[];
		table?: number[];
		start?: number[];
		elements?: number[];
		exportIndex?: number;
		result?: boolean;
	} = {},
): Uint8Array {
	return moduleBytes(
		extras.result === false ? section(1, [1, 0x60, 0, 0]) : types,
		...(extras.imports ? [extras.imports] : []),
		section(3, [...unsigned(bodies.length), ...bodies.map(() => 0)]),
		...(extras.table ? [extras.table] : []),
		section(7, [1, ...string("run"), 0, ...unsigned(extras.exportIndex ?? 0)]),
		...(extras.start ? [extras.start] : []),
		...(extras.elements ? [extras.elements] : []),
		section(10, [
			...unsigned(bodies.length),
			...bodies.flatMap((body) => [...unsigned(body.length + 1), 0, ...body]),
		]),
	);
}
function instantiate(
	bytes: Uint8Array,
	step: () => void,
	imports: WebAssembly.Imports = {},
	depth?: WasmCallDepth,
) {
	expect(WebAssembly.validate(bytes as BufferSource)).toBe(true);
	const metered = meterWasmModule(bytes, { guardMemoryGrowth: true });
	expect(WebAssembly.validate(metered.originalBytes as BufferSource)).toBe(
		true,
	);
	expect(WebAssembly.validate(metered.bytes as BufferSource)).toBe(true);
	const create = () =>
		new WebAssembly.Instance(
			new WebAssembly.Module(metered.bytes as BufferSource),
			{
				...imports,
				[metered.importModule]: {
					[metered.importName]: step,
					[metered.enterImportName]: () => depth?.enter(),
					[metered.leaveImportName]: () => depth?.leave(),
					[metered.memoryGrowImportName ?? "missing_growth_hook"]: () => {
						throw new Error("Unadmitted memory growth");
					},
				},
			},
		);
	const instance = depth ? depth.run(create) : create();
	const entry = instance.exports.run as (...args: number[]) => number;
	return {
		...metered,
		instance,
		run: (...args: number[]) =>
			depth ? depth.run(() => entry(...args)) : entry(...args),
	};
}

it("preserves arithmetic, exported indices and operand-stack values across checks", () => {
	let steps = 0;
	const test = instantiate(fixture([[0x41, 6, 0x41, 7, 0x6c, 0x0b]]), () => {
		steps++;
	});
	expect(test.run()).toBe(42);
	expect(steps).toBe(4);
	expect(test.checkpoints).toBe(4);
});
it("terminates an infinite loop at the metered back edge with the original thrown value", () => {
	const stop = new Error("budget");
	let steps = 0;
	const test = instantiate(
		fixture([[0x03, 0x40, 0x0c, 0, 0x0b, 0x0b]], { result: false }),
		() => {
			if (++steps > 20) throw stop;
		},
	);
	expect(() => test.run()).toThrow(stop);
	expect(steps).toBe(21);
});
it("checks recursive function entries and preserves direct function calls", () => {
	let steps = 0;
	const test = instantiate(fixture([[0x10, 0, 0x0b]]), () => {
		if (++steps > 30) throw new Error("recursive budget");
	});
	expect(() => test.run()).toThrow("recursive budget");
	expect(steps).toBe(31);
	const direct = instantiate(
		fixture([
			[0x10, 1, 0x0b],
			[0x41, 42, 0x0b],
		]),
		() => {},
	);
	expect(direct.run()).toBe(42);
});
it("preserves imported function indices when the meter is appended after other imports", () => {
	let calls = 0;
	const imports = section(2, [1, ...string("env"), ...string("value"), 0, 0]);
	const test = instantiate(
		fixture([[0x10, 0, 0x0b]], { imports, exportIndex: 1 }),
		() => {},
		{
			env: {
				value: () => {
					calls++;
					return 42;
				},
			},
		},
	);
	expect(test.run()).toBe(42);
	expect(calls).toBe(1);
});
it("rewrites active element indices for indirect calls", () => {
	const test = instantiate(
		fixture(
			[
				[0x41, 42, 0x0b],
				[0x41, 0, 0x11, 0, 0, 0x0b],
			],
			{
				table: section(4, [1, 0x70, 0, 1]),
				elements: section(9, [1, 0, 0x41, 0, 0x0b, 1, 0]),
				exportIndex: 1,
			},
		),
		() => {},
	);
	expect(test.run()).toBe(42);
});
it("rewrites reference element expressions, globals and ref.func instruction indices", () => {
	const bytes = moduleBytes(
		types,
		section(3, [1, 0]),
		section(4, [1, 0x70, 0, 1]),
		section(6, [1, 0x70, 0, 0xd2, 0, 0x0b]),
		section(7, [1, ...string("run"), 0, 0]),
		section(9, [1, 4, 0x41, 0, 0x0b, 1, 0xd2, 0, 0x0b]),
		section(10, [1, 7, 0, 0xd2, 0, 0x1a, 0x41, 42, 0x0b]),
	);
	const test = instantiate(bytes, () => {});
	expect(test.run()).toBe(42);
});
it("meters start execution before instantiation returns", () => {
	let steps = 0;
	const bytes = fixture([[0x03, 0x40, 0x0c, 0, 0x0b, 0x0b]], {
		result: false,
		start: section(8, [0]),
	});
	expect(() =>
		instantiate(bytes, () => {
			if (++steps > 10) throw new Error("start budget");
		}),
	).toThrow("start budget");
	expect(steps).toBe(11);
});
it("handles missing type/import sections and preserves unrelated custom bytes", () => {
	const bytes = moduleBytes(section(0, [...string("custom"), 10, 20, 30]));
	const test = instantiate(bytes, () => {});
	expect(
		WebAssembly.Module.customSections(
			new WebAssembly.Module(test.bytes as BufferSource),
			"custom",
		).map((bytes) => [...new Uint8Array(bytes)]),
	).toEqual([[10, 20, 30]]);
});
it("removes stale optional function debug names", () => {
	const bytes = moduleBytes(
		section(0, [...string("name"), 1, 4, 1, 0, 1, 120]),
	);
	const test = instantiate(bytes, () => {});
	expect(
		WebAssembly.Module.customSections(
			new WebAssembly.Module(test.bytes as BufferSource),
			"name",
		),
	).toEqual([]);
});
it.each([0xfd, 0xfe, 0x06, 0x12, 0xfb])(
	"rejects unsupported instruction family %s",
	(opcode) => {
		expect(() =>
			meterWasmModule(fixture([[opcode, 0x0b]], { result: false })),
		).toThrow(/Unsupported/);
	},
);
it("rejects shared memories, reserved imports, truncation and invalid function indices", () => {
	expect(() =>
		meterWasmModule(moduleBytes(section(5, [1, 3, 1, 1]))),
	).toThrow();
	const imports = section(2, [
		1,
		...string("agent_browser_meter_v1"),
		...string("step"),
		0,
		0,
	]);
	expect(() =>
		meterWasmModule(fixture([[0x41, 0, 0x0b]], { imports })),
	).toThrow();
	const bytes = fixture([[0x41, 42, 0x0b]]);
	for (let length = 0; length < bytes.length; length++) {
		const prefix = bytes.subarray(0, length);
		if (!WebAssembly.validate(prefix as BufferSource))
			expect(() => meterWasmModule(prefix)).toThrow();
	}
	expect(() => meterWasmModule(fixture([[0x10, 1, 0x0b]]))).toThrow();
});
it("bounds source size, section order, LEB widths and nesting before native compilation", () => {
	expect(() => meterWasmModule(new Uint8Array(1_048_577))).toThrow();
	expect(() => meterWasmModule(moduleBytes(types, types))).toThrow();
	expect(() =>
		meterWasmModule(moduleBytes([1, 0xff, 0xff, 0xff, 0xff, 0x1f])),
	).toThrow();
	expect(() =>
		meterWasmModule(
			fixture(
				[
					[
						...Array.from({ length: 1025 }, () => [0x02, 0x40]).flat(),
						...Array(1026).fill(0x0b),
					],
				],
				{ result: false },
			),
		),
	).toThrow();
});

it("preserves conditional loop arithmetic, locals and fallthrough", () => {
	const body = [
		1, 1, 0x7f, 0x41, 3, 0x21, 0, 0x03, 0x40, 0x20, 0, 0x41, 1, 0x6b, 0x22, 0,
		0x0d, 0, 0x0b, 0x20, 0, 0x0b,
	];
	const bytes = moduleBytes(
		types,
		section(3, [1, 0]),
		section(7, [1, ...string("run"), 0, 0]),
		section(10, [1, ...unsigned(body.length), ...body]),
	);
	let steps = 0;
	const test = instantiate(bytes, () => {
		steps++;
	});
	expect(test.run()).toBe(0);
	expect(steps).toBeGreaterThan(15);
});
it("meters branches from inner loops to outer loop targets", () => {
	let steps = 0;
	const test = instantiate(
		fixture([[0x03, 0x40, 0x03, 0x40, 0x0c, 1, 0x0b, 0x0b, 0x0b]], {
			result: false,
		}),
		() => {
			if (++steps > 20) throw new Error("nested loop budget");
		},
	);
	expect(() => test.run()).toThrow("nested loop budget");
	expect(steps).toBe(21);
});
it("uses independent input/output snapshots without invoking subclass parser hooks", () => {
	let hooks = 0;
	class Source extends Uint8Array {
		get length() {
			hooks++;
			return 0;
		}
		subarray(): Uint8Array<ArrayBuffer> {
			hooks++;
			throw new Error("subclass hook");
		}
	}
	const source = new Source(fixture([[0x41, 42, 0x0b]]));
	const metered = meterWasmModule(source);
	expect(hooks).toBe(0);
	source.fill(0);
	expect(WebAssembly.validate(metered.originalBytes as BufferSource)).toBe(
		true,
	);
	expect(WebAssembly.validate(metered.bytes as BufferSource)).toBe(true);
	expect(() => meterWasmModule(new Proxy(new Uint8Array(), {}))).toThrow();
	expect(() => meterWasmModule(new Source(1_048_577))).toThrow();
});

function depthOwner(limit = 8, initial = 2) {
	let current = initial;
	let peak = initial;
	const releases: number[] = [];
	const depth = new WasmCallDepth({
		enterCall() {
			if (current === limit) throw new Error("call depth budget");
			const entered = ++current;
			peak = Math.max(peak, current);
			return () => {
				releases.push(entered);
				current--;
			};
		},
	});
	return {
		depth,
		releases,
		get current() {
			return current;
		},
		get peak() {
			return peak;
		},
	};
}
it.each([
	["fallthrough", [0x41, 42, 0x0b], 42],
	["return", [0x41, 42, 0x0f, 0x0b], 42],
	["function branch", [0x41, 42, 0x0c, 0, 0x0b], 42],
	["taken conditional function branch", [0x41, 42, 0x41, 1, 0x0d, 0, 0x0b], 42],
	[
		"untaken conditional function branch",
		[0x41, 42, 0x41, 0, 0x0d, 0, 0x0b],
		42,
	],
	["function branch table", [0x41, 42, 0x41, 0, 0x0e, 1, 0, 0, 0x0b], 42],
	["nested return", [0x02, 0x40, 0x41, 42, 0x0f, 0x0b, 0x41, 3, 0x0b], 42],
	["then", [0x41, 1, 0x04, 0x7f, 0x41, 42, 0x05, 0x41, 3, 0x0b, 0x0b], 42],
	["else", [0x41, 0, 0x04, 0x7f, 0x41, 42, 0x05, 0x41, 3, 0x0b, 0x0b], 3],
] as const)(
	"releases the call-depth lease on %s while preserving results",
	(_name, body, result) => {
		const owner = depthOwner();
		const test = instantiate(fixture([[...body]]), () => {}, {}, owner.depth);
		expect(test.run()).toBe(result);
		expect(owner.current).toBe(2);
		expect(owner.depth.depth).toBe(0);
		expect(owner.releases).toEqual([3]);
	},
);
it("stops recursive WASM at the shared call-depth limit and restores the caller depth", () => {
	const owner = depthOwner(8, 2);
	const test = instantiate(
		fixture([[0x10, 0, 0x0b]]),
		() => {},
		{},
		owner.depth,
	);
	expect(() => test.run()).toThrow("call depth budget");
	expect(owner.peak).toBe(8);
	expect(owner.current).toBe(2);
	expect(owner.depth.depth).toBe(0);
	expect(owner.releases).toEqual([8, 7, 6, 5, 4, 3]);
	const normal = instantiate(
		fixture([[0x41, 42, 0x0b]]),
		() => {},
		{},
		owner.depth,
	);
	expect(normal.run()).toBe(42);
	expect(owner.current).toBe(2);
});
it.each(["native trap", "meter error", "import error", "start error"])(
	"unwinds owned depths on %s",
	(kind) => {
		const owner = depthOwner();
		const stop = new Error("owned failure");
		if (kind === "start error") {
			expect(() =>
				instantiate(
					fixture([[0x00, 0x0b]], { result: false, start: section(8, [0]) }),
					() => {},
					{},
					owner.depth,
				),
			).toThrow();
		} else {
			const imports =
				kind === "import error"
					? section(2, [1, ...string("env"), ...string("fail"), 0, 0])
					: undefined;
			const body =
				kind === "native trap"
					? [0x00, 0x0b]
					: kind === "import error"
						? [0x10, 0, 0x0b]
						: [0x41, 42, 0x0b];
			const test = instantiate(
				fixture([body], { imports, exportIndex: imports ? 1 : 0 }),
				() => {
					if (kind === "meter error") throw stop;
				},
				{
					env: {
						fail: () => {
							throw stop;
						},
					},
				},
				owner.depth,
			);
			expect(() => test.run()).toThrow();
		}
		expect(owner.current).toBe(2);
		expect(owner.depth.depth).toBe(0);
		expect(owner.releases).toEqual([3]);
	},
);
it("preserves caller frames across nested host-to-WASM entry and caught inner traps", () => {
	const owner = depthOwner();
	const inner = instantiate(fixture([[0x00, 0x0b]]), () => {}, {}, owner.depth);
	const imports = section(2, [1, ...string("env"), ...string("nested"), 0, 0]);
	const outer = instantiate(
		fixture([[0x10, 0, 0x0b]], { imports, exportIndex: 1 }),
		() => {},
		{
			env: {
				nested: () => {
					expect(owner.current).toBe(3);
					expect(() => inner.run()).toThrow();
					expect(owner.current).toBe(3);
					expect(owner.depth.depth).toBe(1);
					return 42;
				},
			},
		},
		owner.depth,
	);
	expect(outer.run()).toBe(42);
	expect(owner.current).toBe(2);
	expect(owner.peak).toBe(4);
	expect(owner.releases).toEqual([4, 3]);
});
it("wraps multi-value functions with parameters using correctly signed block type indices", () => {
	const signature = [0x60, 1, 0x7f, 2, 0x7f, 0x7e];
	const body = [0, 0x20, 0, 0x42, 7, 0x0f, 0x0b];
	const bytes = moduleBytes(
		section(1, [64, ...Array.from({ length: 64 }, () => signature).flat()]),
		section(3, [1, 0]),
		section(7, [1, ...string("run"), 0, 0]),
		section(10, [1, ...unsigned(body.length), ...body]),
	);
	const owner = depthOwner();
	const test = instantiate(bytes, () => {}, {}, owner.depth);
	const entry = test.instance.exports.run as (
		value: number,
	) => [number, bigint];
	expect(owner.depth.run(() => entry(42))).toEqual([42, 7n]);
	expect(owner.current).toBe(2);
});
it("rejects unowned entries and prevents nested entry from releasing a caller lease", () => {
	const owner = depthOwner();
	expect(() => owner.depth.enter()).toThrow(/Unowned/);
	expect(() => owner.depth.leave()).toThrow(/Unbalanced/);
	owner.depth.run(() => {
		owner.depth.enter();
		owner.depth.run(() =>
			expect(() => owner.depth.leave()).toThrow(/Unbalanced/),
		);
		expect(owner.current).toBe(3);
		owner.depth.leave();
	});
	expect(owner.current).toBe(2);
});

it("holds WASM depth leases until an asynchronous entry settles", async () => {
	const owner = depthOwner();
	let finish!: () => void;
	const pause = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const pending = owner.depth.runAsync(async () => {
		owner.depth.enter();
		await pause;
		owner.depth.leave();
		return 42;
	});
	expect(owner.current).toBe(3);
	expect(owner.depth.depth).toBe(1);
	finish();
	expect(await pending).toBe(42);
	expect(owner.current).toBe(2);
	expect(owner.depth.depth).toBe(0);
});
it("unwinds asynchronous rejection and refuses overlapping entries on one depth owner", async () => {
	const owner = depthOwner();
	let fail!: (error: Error) => void;
	const pause = new Promise<void>((_resolve, reject) => {
		fail = reject;
	});
	const pending = owner.depth.runAsync(async () => {
		owner.depth.enter();
		await pause;
	});
	await expect(owner.depth.runAsync(async () => 42)).rejects.toThrow(
		/Overlapping/,
	);
	expect(owner.depth.depth).toBe(1);
	const error = new Error("suspended import failed");
	fail(error);
	await expect(pending).rejects.toBe(error);
	expect(owner.current).toBe(2);
	expect(owner.depth.depth).toBe(0);
	expect(owner.depth.run(() => 42)).toBe(42);
});

it("routes memory.grow through the guarded import without invoking native growth", () => {
	const input = moduleBytes(
		section(1, [1, 0x60, 1, 0x7f, 1, 0x7f]),
		section(2, [1, ...string("env"), ...string("m"), 2, 1, 1, 3]),
		section(3, [1, 0]),
		section(7, [1, ...string("run"), 0, 0]),
		section(10, [1, 6, 0, 0x20, 0, 0x40, 0, 0x0b]),
	);
	expect(WebAssembly.validate(input as BufferSource)).toBe(true);
	const metered = meterWasmModule(input, { guardMemoryGrowth: true });
	expect(metered.memoryGrowImportName).toBe("memory_grow");
	expect(metered.memoryGrowInstructions).toBe(1);
	expect(WebAssembly.validate(metered.bytes as BufferSource)).toBe(true);
	const memory = new WebAssembly.Memory({ initial: 1, maximum: 3 });
	const received: number[] = [];
	const instance = new WebAssembly.Instance(
		new WebAssembly.Module(metered.bytes as BufferSource),
		{
			env: { m: memory },
			[metered.importModule]: {
				[metered.importName]: () => {},
				[metered.enterImportName]: () => {},
				[metered.leaveImportName]: () => {},
				[metered.memoryGrowImportName ?? "missing_growth_hook"]: (
					delta: number,
				) => {
					received.push(delta);
					return 42;
				},
			},
		},
	);
	expect((instance.exports.run as (delta: number) => number)(1)).toBe(42);
	expect(received).toEqual([1]);
	expect(memory.buffer.byteLength).toBe(65536);
	const native = meterWasmModule(input);
	expect(native.memoryGrowImportName).toBeUndefined();
	const unguarded = new WebAssembly.Instance(
		new WebAssembly.Module(native.bytes as BufferSource),
		{
			env: { m: memory },
			[native.importModule]: {
				[native.importName]: () => {},
				[native.enterImportName]: () => {},
				[native.leaveImportName]: () => {},
			},
		},
	);
	expect((unguarded.exports.run as (delta: number) => number)(1)).toBe(1);
	expect(memory.buffer.byteLength).toBe(131072);
});
it("shifts calls and function references correctly with a fourth guarded import", () => {
	const input = fixture([
		[0x10, 1, 0x0b],
		[0x41, 42, 0x0b],
	]);
	const metered = meterWasmModule(input, { guardMemoryGrowth: true });
	const instance = new WebAssembly.Instance(
		new WebAssembly.Module(metered.bytes as BufferSource),
		{
			[metered.importModule]: {
				[metered.importName]: () => {},
				[metered.enterImportName]: () => {},
				[metered.leaveImportName]: () => {},
				[metered.memoryGrowImportName ?? "missing_growth_hook"]: () => -1,
			},
		},
	);
	expect((instance.exports.run as () => number)()).toBe(42);
	expect(metered.memoryGrowInstructions).toBe(0);
});

it("rejects multiple memories when one guarded growth hook cannot identify them", () => {
	const bytes = moduleBytes(
		section(2, [
			2,
			...string("env"),
			...string("a"),
			2,
			0,
			0,
			...string("env"),
			...string("b"),
			2,
			0,
			0,
		]),
	);
	expect(() => meterWasmModule(bytes, { guardMemoryGrowth: true })).toThrow(
		/Unsupported/,
	);
});

it("reports original imports, signatures, allocations and exports for admission", () => {
	const bytes = moduleBytes(
		section(1, [1, 0x60, 1, 0x7f, 1, 0x7f]),
		section(2, [
			2,
			...string("env"),
			...string("f"),
			0,
			0,
			...string("env"),
			...string("memory"),
			2,
			1,
			1,
			3,
		]),
		section(3, [1, 0]),
		section(4, [1, 0x70, 1, 1, 2]),
		section(6, [1, 0x7f, 0, 0x41, 0, 0x0b]),
		section(7, [
			3,
			...string("run"),
			0,
			1,
			...string("memory"),
			2,
			0,
			...string("g"),
			3,
			0,
		]),
		section(10, [1, 6, 0, 0x20, 0, 0x10, 0, 0x0b]),
	);
	expect(WebAssembly.validate(bytes as BufferSource)).toBe(true);
	const result = meterWasmModule(bytes, { guardMemoryGrowth: true });
	expect(result.declarations).toMatchObject({
		imports: [
			{
				module: "env",
				name: "f",
				kind: "function",
				signature: { parameters: [0x7f], results: [0x7f] },
			},
			{ module: "env", name: "memory", kind: "memory", minimum: 1, maximum: 3 },
		],
		exports: [
			{
				name: "run",
				kind: "function",
				index: 1,
				signature: { parameters: [0x7f], results: [0x7f] },
			},
			{ name: "memory", kind: "memory", index: 0 },
			{ name: "g", kind: "global", index: 0 },
		],
		memories: [],
		tables: [{ element: 0x70, minimum: 1, maximum: 2 }],
		globals: [{ valueType: 0x7f, mutable: false }],
		tableGrowInstructions: 0,
	});
});
