import { expect, it } from "vitest";
import { meterWasmModule } from "./wasm-metering.js";

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
) {
	expect(WebAssembly.validate(bytes as BufferSource)).toBe(true);
	const metered = meterWasmModule(bytes);
	expect(WebAssembly.validate(metered.originalBytes as BufferSource)).toBe(
		true,
	);
	expect(WebAssembly.validate(metered.bytes as BufferSource)).toBe(true);
	const instance = new WebAssembly.Instance(
		new WebAssembly.Module(metered.bytes as BufferSource),
		{
			...imports,
			[metered.importModule]: { [metered.importName]: step },
		},
	);
	return { ...metered, instance, run: instance.exports.run as () => number };
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
