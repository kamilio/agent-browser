import { describe, expect, it } from "vitest";
import { AgentBrowserError } from "./errors.js";
import { PageClock, createPagePerformance } from "./page-performance.js";
import { PageUserTiming, userTimingLimits } from "./page-user-timing.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

interface EntrySnapshot {
	name: string;
	entryType: string;
	startTime: number;
	duration: number;
	detail: unknown;
}

interface TimingEntry extends Readonly<EntrySnapshot> {
	toJSON(): EntrySnapshot;
}

interface TimingMethods {
	mark(...args: unknown[]): TimingEntry;
	measure(...args: unknown[]): TimingEntry;
	getEntries(...args: unknown[]): TimingEntry[];
	getEntriesByType(...args: unknown[]): TimingEntry[];
	getEntriesByName(...args: unknown[]): TimingEntry[];
	clearMarks(...args: unknown[]): void;
	clearMeasures(...args: unknown[]): void;
}

interface PerformanceCapability extends TimingMethods {
	readonly timeOrigin: number;
	now(): number;
	toJSON(): { timeOrigin: number };
}

type TimingLimitOverrides = Partial<
	Record<keyof typeof userTimingLimits, number>
>;

const reservedTimingNames = [
	"navigationStart",
	"unloadEventStart",
	"unloadEventEnd",
	"redirectStart",
	"redirectEnd",
	"fetchStart",
	"domainLookupStart",
	"domainLookupEnd",
	"connectStart",
	"connectEnd",
	"secureConnectionStart",
	"requestStart",
	"responseStart",
	"responseEnd",
	"domLoading",
	"domInteractive",
	"domContentLoadedEventStart",
	"domContentLoadedEventEnd",
	"domComplete",
	"loadEventStart",
	"loadEventEnd",
];

function materialize(definition: ScriptHostObjectDefinition): object {
	const capability = {};
	for (const [name, property] of Object.entries(definition.properties ?? {})) {
		Object.defineProperty(capability, name, {
			get: property.get,
			set: property.set,
			enumerable: true,
			configurable: false,
		});
	}
	for (const [name, method] of Object.entries(definition.methods ?? {})) {
		Object.defineProperty(capability, name, {
			value: method,
			writable: false,
			enumerable: true,
			configurable: false,
		});
	}
	return capability;
}

const ordinaryFactory: ScriptHostObjectFactory = {
	createHostObject: materialize,
};

describe("timing clock cleanup registration", () => {
	it.each([undefined, null, 4, {}].map((value) => ({ value })))(
		"rejects invalid clock unregister values %j",
		({ value }) => {
			const clock = {
				timeOrigin: 1000,
				now: () => 0,
				onClose: () => value,
			} as unknown as ConstructorParameters<typeof PageUserTiming>[0];
			expectCode(
				() => new PageUserTiming(clock, ordinaryFactory),
				"invalid-input",
			);
		},
	);
	it.each([null, 4].map((value) => ({ value })))(
		"rejects invalid clock registration callbacks %j",
		({ value }) => {
			const clock = {
				timeOrigin: 1000,
				now: () => 0,
				onClose: value,
			} as unknown as ConstructorParameters<typeof PageUserTiming>[0];
			expectCode(
				() => new PageUserTiming(clock, ordinaryFactory),
				"invalid-input",
			);
		},
	);
	it("releases a registration that closes the timeline synchronously", () => {
		let released = 0;
		const timing = new PageUserTiming(
			{
				timeOrigin: 1000,
				now: () => 0,
				onClose(listener) {
					listener();
					return () => {
						released++;
					};
				},
			},
			ordinaryFactory,
		);
		expect(timing.metrics()).toMatchObject({ closed: true, active: 0 });
		expect(released).toBe(1);
		timing.close();
		expect(released).toBe(1);
	});
	it("revokes entries and releases accounting before a failing unregister", () => {
		const timing = new PageUserTiming(
			{
				timeOrigin: 1000,
				now: () => 0,
				onClose: () => () => {
					throw new Error("UNREGISTER_PRIVATE");
				},
			},
			ordinaryFactory,
		);
		const entry = timing.methods.mark("kept", {
			detail: { value: 1 },
		}) as TimingEntry;
		const error = expectCode(() => timing.close(), "unsupported");
		expect(error.message).not.toContain("UNREGISTER_PRIVATE");
		expect(timing.metrics()).toMatchObject({
			closed: true,
			active: 0,
			retainedUnits: 0,
		});
		expectCode(() => entry.detail, "closed");
		timing.close();
	});
	it("does not starve other clock owners when one close callback fails", () => {
		const clock = new PageClock({ timeOrigin: 1000, now: () => 0 });
		clock.onClose(() => {
			throw new Error("CLOSE_PRIVATE");
		});
		const independent = new PageUserTiming(clock, ordinaryFactory);
		const cached = clock.userTiming(ordinaryFactory);
		const entry = independent.methods.mark("independent") as TimingEntry;
		cached.methods.mark("cached");
		const error = expectCode(() => clock.close(), "unsupported");
		expect(error.message).not.toContain("CLOSE_PRIVATE");
		for (const timing of [independent, cached])
			expect(timing.metrics()).toMatchObject({
				closed: true,
				active: 0,
				retainedUnits: 0,
			});
		expectCode(() => entry.name, "closed");
		clock.close();
	});
	it("sanitizes raw registration errors", () => {
		const error = expectCode(
			() =>
				new PageUserTiming(
					{
						timeOrigin: 1000,
						now: () => 0,
						onClose() {
							throw new Error("REGISTER_PRIVATE");
						},
					},
					ordinaryFactory,
				),
			"invalid-input",
		);
		expect(error.message).not.toContain("REGISTER_PRIVATE");
	});
	it("validates listeners and safely invokes registrations after clock close", () => {
		const clock = new PageClock({ timeOrigin: 1000, now: () => 0 });
		expectCode(
			() => clock.onClose(null as unknown as () => void),
			"invalid-input",
		);
		clock.close();
		let called = 0;
		const release = clock.onClose(() => {
			called++;
		});
		release();
		expect(called).toBe(1);
		const error = expectCode(
			() =>
				clock.onClose(() => {
					throw new Error("LATE_PRIVATE");
				}),
			"unsupported",
		);
		expect(error.message).not.toContain("LATE_PRIVATE");
	});
});

function fixture(
	limits: TimingLimitOverrides = {},
	factory: ScriptHostObjectFactory = ordinaryFactory,
) {
	let reading = 0;
	const clock = new PageClock({ timeOrigin: 1000, now: () => reading });
	const timing = new PageUserTiming(clock, factory, limits);
	const methods = timing.methods as unknown as TimingMethods;
	return {
		clock,
		timing,
		methods,
		setTime(value: number) {
			reading = value;
		},
	};
}

function caught(action: () => unknown): Error {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		return error as Error;
	}
	throw new Error("Expected the timing operation to reject");
}

function expectCode(action: () => unknown, code: string) {
	const error = caught(action);
	expect(error).toBeInstanceOf(AgentBrowserError);
	expect((error as AgentBrowserError).code).toBe(code);
	return error;
}

function expectUnchanged(timing: PageUserTiming, action: () => unknown) {
	const before = timing.metrics();
	const error = caught(action);
	const after = timing.metrics();
	expect(after.active).toBe(before.active);
	expect(after.created).toBe(before.created);
	expect(after.retainedUnits).toBe(before.retainedUnits);
	return error;
}

describe("bounded User Timing marks", () => {
	it("publishes default marks from the owned monotonic clock", () => {
		const { clock, timing, methods, setTime } = fixture();
		setTime(12.39);
		const entry = methods.mark("work");
		expect(entry.toJSON()).toEqual({
			name: "work",
			entryType: "mark",
			startTime: 12.3,
			duration: 0,
			detail: null,
		});
		expect(clock.metrics().reads).toBe(1);
		expect(timing.metrics()).toMatchObject({
			partial: true,
			profile: "bounded-user-timing-json-snapshots",
			active: 1,
			created: 1,
			closed: false,
		});
		expect(methods.getEntries()[0]).toBe(entry);
	});

	it("does not read or coarsen the clock for an explicit startTime", () => {
		const { clock, methods, setTime } = fixture();
		setTime(99);
		expect(methods.mark("explicit", { startTime: 0.125 }).startTime).toBe(
			0.125,
		);
		expect(methods.mark("zero", { startTime: 0 }).startTime).toBe(0);
		expect(clock.metrics().reads).toBe(0);
	});

	it.each([undefined, null, {}, { startTime: undefined, detail: undefined }])(
		"treats empty mark options as defaults: %j",
		(options) => {
			const { methods, setTime } = fixture();
			setTime(3);
			expect(methods.mark("default", options).toJSON()).toEqual({
				name: "default",
				entryType: "mark",
				startTime: 3,
				duration: 0,
				detail: null,
			});
		},
	);

	it.each([
		["", ""],
		[null, "null"],
		[undefined, "undefined"],
		[true, "true"],
		[false, "false"],
		[17, "17"],
		[-0, "0"],
		[42n, "42"],
		["作業🚀", "作業🚀"],
		["__proto__", "__proto__"],
		["constructor", "constructor"],
	])(
		"converts a supplied primitive name %s without object coercion",
		(name, expected) => {
			const { methods } = fixture();
			expect(methods.mark(name, { startTime: 0 }).name).toBe(expected);
		},
	);

	it("distinguishes missing names from explicit undefined", () => {
		const { timing, methods } = fixture();
		expect(expectUnchanged(timing, () => methods.mark())).toBeInstanceOf(
			TypeError,
		);
		expect(expectUnchanged(timing, () => methods.measure())).toBeInstanceOf(
			TypeError,
		);
		expect(methods.measure(undefined).name).toBe("undefined");
	});

	it("rejects Symbol names and never calls object coercion hooks", () => {
		const { timing, methods } = fixture();
		let calls = 0;
		const name = {
			toString() {
				calls++;
				return "private-name";
			},
			[Symbol.toPrimitive]() {
				calls++;
				return "private-name";
			},
		};
		expectUnchanged(timing, () => methods.mark(name));
		expectUnchanged(timing, () => methods.measure(() => "private-name"));
		expect(
			expectUnchanged(timing, () => methods.mark(Symbol("private-name"))),
		).toBeInstanceOf(TypeError);
		expect(calls).toBe(0);
	});

	it.each(reservedTimingNames)(
		"rejects reserved mark %s without reserving it as a user timestamp",
		(name) => {
			const { timing, methods } = fixture();
			expect(expectUnchanged(timing, () => methods.mark(name)).name).toBe(
				"SyntaxError",
			);
			expectCode(() => methods.measure("legacy", name), "unsupported");
			expectCode(() => methods.measure("legacy", { end: name }), "unsupported");
			expectCode(
				() => methods.measure("legacy", undefined, name),
				"unsupported",
			);
			expect(methods.mark(`${name}-user`, { startTime: 1 }).name).toBe(
				`${name}-user`,
			);
			expect(methods.measure(name, { start: 0, end: 1 }).name).toBe(name);
		},
	);

	it.each([
		-1,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		"1",
		true,
		1n,
	])(
		"rejects invalid explicit startTime %s without publication",
		(startTime) => {
			const { timing, methods } = fixture();
			expectUnchanged(timing, () => methods.mark("bad", { startTime }));
			expect(methods.getEntries()).toEqual([]);
		},
	);

	it("allows null-prototype dictionaries and ignores unknown getter values", () => {
		const { methods } = fixture();
		let getterCalls = 0;
		const options = Object.create(null);
		Object.defineProperty(options, "startTime", { value: 4, enumerable: true });
		Object.defineProperty(options, "unknown", {
			get() {
				getterCalls++;
				throw new Error("private-unknown-value");
			},
		});
		expect(methods.mark("plain", options).startTime).toBe(4);
		expect(methods.measure("empty", options).startTime).toBe(0);
		expect(getterCalls).toBe(0);
	});

	it.each(["startTime", "detail"])(
		"rejects known %s accessors without calling them or clearing marks",
		(field) => {
			const { timing, methods } = fixture();
			const kept = methods.mark("kept", { startTime: 2 });
			let getterCalls = 0;
			const options = Object.defineProperty({}, field, {
				get() {
					getterCalls++;
					methods.clearMarks();
					throw new Error("private-accessor-value");
				},
			});
			const error = expectUnchanged(timing, () =>
				methods.mark("rejected", options),
			);
			expect(error.message).not.toContain("private-accessor-value");
			expect(getterCalls).toBe(0);
			expect(methods.getEntries()).toEqual([kept]);
		},
	);

	it.each(
		[
			[],
			new Date(0),
			Object.create({ startTime: 1 }),
			() => 1,
			"options",
			1,
		].map((options) => ({ options })),
	)("rejects unsupported mark option shapes: %s", ({ options }) => {
		const { timing, methods } = fixture();
		expectUnchanged(timing, () => methods.mark("bad", options));
	});

	it("bounds an oversized dictionary even when all members are unknown", () => {
		const { timing, methods } = fixture();
		const options = Object.fromEntries(
			Array.from({ length: 20000 }, (_, index) => [`unknown-${index}`, 0]),
		);
		expectUnchanged(timing, () => methods.mark("bad", options));
	});
});

describe("bounded User Timing measure algorithm", () => {
	it.each([
		[undefined, 0, 20],
		[null, 0, 20],
		[{}, 0, 20],
		[{ start: 5 }, 5, 15],
		[{ end: 12 }, 0, 12],
		[{ start: 5, end: 12 }, 5, 7],
		[{ start: 5, duration: 3 }, 5, 3],
		[{ end: 12, duration: 3 }, 9, 3],
		[{ start: 0, end: 0 }, 0, 0],
		[{ start: 5, duration: 0 }, 5, 0],
		[{ end: 2, duration: 5 }, -3, 5],
		[{ start: 12, end: 5 }, 12, -7],
		[
			{
				start: undefined,
				end: undefined,
				duration: undefined,
				detail: undefined,
			},
			0,
			20,
		],
	])("computes options %j", (options, startTime, duration) => {
		const { methods, setTime } = fixture();
		setTime(20);
		expect(methods.measure("work", options).toJSON()).toEqual({
			name: "work",
			entryType: "measure",
			startTime,
			duration,
			detail: null,
		});
	});

	it("supports legacy names, an omitted start, and empty options with endMark", () => {
		const { methods, clock, setTime } = fixture();
		methods.mark("begin", { startTime: 3 });
		methods.mark("end", { startTime: 11 });
		setTime(20);
		expect(methods.measure("legacy", "begin", "end").duration).toBe(8);
		expect(methods.measure("default-start", undefined, "end").duration).toBe(
			11,
		);
		expect(methods.measure("empty-options", {}, "end").duration).toBe(11);
		expect(methods.measure("null-options", null, "end").duration).toBe(11);
		expect(
			methods.measure("ignored-options", { ignored: true }, "end").duration,
		).toBe(11);
		expect(clock.metrics().reads).toBe(0);
		expect(methods.measure("default-end", "begin").duration).toBe(17);
		expect(clock.metrics().reads).toBe(1);
	});

	it("resolves default end from the clock before failing an absent start mark", () => {
		const { timing, methods, clock, setTime } = fixture();
		setTime(9);
		expect(
			expectUnchanged(timing, () => methods.measure("bad", "missing")).name,
		).toBe("SyntaxError");
		expect(clock.metrics().reads).toBe(1);
		expect(
			expectUnchanged(timing, () =>
				methods.measure("bad", { start: "missing" }),
			).name,
		).toBe("SyntaxError");
		expect(clock.metrics().reads).toBe(2);
	});

	it("fails an unresolved end before validating a negative start timestamp", () => {
		const { timing, methods, clock } = fixture();
		expect(
			expectUnchanged(timing, () =>
				methods.measure("bad", { start: -1, end: "missing" }),
			).name,
		).toBe("SyntaxError");
		expect(clock.metrics().reads).toBe(0);
	});

	it("uses the latest inserted matching mark, even after sorted queries", () => {
		const { methods } = fixture();
		const first = methods.mark("begin", { startTime: 40 });
		const latest = methods.mark("begin", { startTime: 3 });
		methods.mark("end", { startTime: 12 });
		expect(methods.getEntriesByName("begin")).toEqual([latest, first]);
		expect(methods.measure("legacy", "begin", "end").duration).toBe(9);
		expect(
			methods.measure("options", { start: "begin", end: "end" }).duration,
		).toBe(9);
		expect(
			methods.measure("duration", { start: "begin", duration: 2 }).startTime,
		).toBe(3);
		expect(
			methods.measure("backward", { end: "end", duration: 2 }).startTime,
		).toBe(10);
	});

	it("never resolves a measure as a mark reference", () => {
		const { timing, methods } = fixture();
		methods.measure("only-measure", { start: 0, end: 4 });
		expect(
			expectUnchanged(timing, () => methods.measure("bad", "only-measure"))
				.name,
		).toBe("SyntaxError");
	});

	it.each([
		{ duration: 2 },
		{ detail: null },
		{ detail: { payload: true } },
		{ start: 1, end: 2, duration: 1 },
	])("rejects conflicting or incomplete options %j", (options) => {
		const { timing, methods, clock } = fixture();
		expect(
			expectUnchanged(timing, () => methods.measure("bad", options)),
		).toBeInstanceOf(TypeError);
		expect(clock.metrics().reads).toBe(0);
	});

	it.each([{ start: 0 }, { end: 1 }, { start: 0, detail: null }])(
		"rejects nonempty options alongside third endMark: %j",
		(options) => {
			const { timing, methods } = fixture();
			methods.mark("end", { startTime: 10 });
			expect(
				expectUnchanged(timing, () => methods.measure("bad", options, "end")),
			).toBeInstanceOf(TypeError);
			expect(methods.measure("allowed", options, undefined).entryType).toBe(
				"measure",
			);
		},
	);

	it.each(["start", "end", "duration"])(
		"rejects invalid %s values",
		(field) => {
			const { timing, methods } = fixture();
			for (const value of [
				-1,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				true,
				null,
				1n,
				{},
				Symbol("private-reference"),
			]) {
				const options =
					field === "start"
						? { end: 3, [field]: value }
						: { start: 1, [field]: value };
				expectUnchanged(timing, () => methods.measure("bad", options));
			}
		},
	);

	it("does not treat string duration as a mark or coerce it to a number", () => {
		const { timing, methods } = fixture();
		methods.mark("2", { startTime: 2 });
		expectUnchanged(timing, () =>
			methods.measure("bad", { start: 0, duration: "2" }),
		);
	});

	it("rejects overflow in derived end without discarding prior entries", () => {
		const { timing, methods } = fixture();
		const kept = methods.mark("kept", { startTime: 1 });
		expectUnchanged(timing, () =>
			methods.measure("bad", {
				start: Number.MAX_VALUE,
				duration: Number.MAX_VALUE,
			}),
		);
		expect(methods.getEntries()).toEqual([kept]);
	});

	it.each(["start", "end", "duration", "detail"])(
		"rejects recognized %s accessors without invoking them",
		(field) => {
			const { timing, methods } = fixture();
			let calls = 0;
			const options = Object.defineProperty({ start: 0 }, field, {
				get() {
					calls++;
					throw new Error("private-measure-getter");
				},
			});
			const error = expectUnchanged(timing, () =>
				methods.measure("bad", options),
			);
			expect(error.message).not.toContain("private-measure-getter");
			expect(calls).toBe(0);
		},
	);
});

describe("timeline queries, clearing, and entry capabilities", () => {
	it("sorts by startTime with stable insertion ties and fresh query arrays", () => {
		const { methods } = fixture();
		const late = methods.mark("same", { startTime: 10 });
		const first = methods.mark("same", { startTime: 2 });
		const second = methods.measure("same", { start: 2, end: 3 });
		const third = methods.mark("other", { startTime: 2 });
		const snapshot = methods.getEntries();
		expect(snapshot).toEqual([first, second, third, late]);
		expect(methods.getEntries()).not.toBe(snapshot);
		expect(methods.getEntries()[0]).toBe(first);
		snapshot.reverse();
		snapshot.pop();
		expect(methods.getEntries()).toEqual([first, second, third, late]);
		expect(methods.getEntriesByType("mark")).toEqual([first, third, late]);
		expect(methods.getEntriesByName("same")).toEqual([first, second, late]);
		expect(methods.getEntriesByName("same", undefined)).toEqual([
			first,
			second,
			late,
		]);
		expect(methods.getEntriesByName("same", "measure")).toEqual([second]);
		expect(methods.getEntriesByName("same", "mark")).toEqual([first, late]);
	});

	it("keeps filters exact, case-sensitive, and safe for prototype-like names", () => {
		const { methods } = fixture();
		const entry = methods.mark("__proto__", { startTime: 1 });
		methods.mark("Name", { startTime: 2 });
		for (const type of ["Mark", "MARK", "resource", "navigation", "", null]) {
			expect(methods.getEntriesByType(type)).toEqual([]);
		}
		expect(methods.getEntriesByName("name")).toEqual([]);
		expect(methods.getEntriesByName("__proto__", "mark")).toEqual([entry]);
		expect(methods.getEntriesByName("__proto__", "unknown")).toEqual([]);
	});

	it("requires query arguments without coercing object filters", () => {
		const { methods } = fixture();
		expect(() => methods.getEntriesByType()).toThrow(TypeError);
		expect(() => methods.getEntriesByName()).toThrow(TypeError);
		let calls = 0;
		const filter = {
			toString: () => {
				calls++;
				return "mark";
			},
		};
		expect(() => methods.getEntriesByType(filter)).toThrow();
		expect(() => methods.getEntriesByName(filter)).toThrow();
		expect(() => methods.getEntriesByName("name", filter)).toThrow();
		expect(() => methods.getEntriesByName(Symbol("private-filter"))).toThrow(
			TypeError,
		);
		expect(calls).toBe(0);
		expect(methods.getEntriesByType(undefined)).toEqual([]);
	});

	it("clears only the exact name and type while preserving old snapshots", () => {
		const { timing, methods } = fixture();
		const mark = methods.mark("same", { startTime: 1, detail: { kept: true } });
		const other = methods.mark("Same", { startTime: 2 });
		const measure = methods.measure("same", { start: 0, end: 3 });
		const snapshot = methods.getEntries();
		const retained = timing.metrics().retainedUnits;
		expect(methods.clearMarks("same")).toBeUndefined();
		expect(methods.getEntries()).toEqual([measure, other]);
		expect(snapshot).toEqual([measure, mark, other]);
		expect(mark.detail).toEqual({ kept: true });
		expect(mark.toJSON().startTime).toBe(1);
		expect(timing.metrics()).toMatchObject({
			active: 2,
			created: 3,
			retainedUnits: retained,
		});
		expect(caught(() => methods.measure("missing", "same")).name).toBe(
			"SyntaxError",
		);
		methods.clearMeasures("same");
		expect(methods.getEntries()).toEqual([other]);
		methods.clearMarks("absent");
		expect(methods.getEntries()).toEqual([other]);
		methods.clearMarks(undefined);
		expect(methods.getEntries()).toEqual([]);
		expect(measure.duration).toBe(3);
	});

	it("clear with no name clears only its type; explicit null is a name", () => {
		const { methods } = fixture();
		const kept = methods.mark("kept");
		methods.mark(null);
		methods.measure("kept");
		methods.clearMarks(null);
		expect(methods.getEntriesByType("mark")).toEqual([kept]);
		methods.clearMeasures();
		expect(methods.getEntries()).toEqual([kept]);
		methods.clearMarks();
		expect(methods.getEntries()).toEqual([]);
	});

	it("exposes readonly fields and independent complete JSON records", () => {
		const { methods } = fixture();
		const entry = methods.mark("immutable", {
			startTime: 4,
			detail: { nested: [1] },
		});
		for (const field of [
			"name",
			"entryType",
			"startTime",
			"duration",
			"detail",
		]) {
			const descriptor = Object.getOwnPropertyDescriptor(entry, field);
			expect(descriptor?.get).toBeTypeOf("function");
			expect(descriptor?.set).toBeUndefined();
			expect(Reflect.set(entry, field, "changed")).toBe(false);
		}
		const first = entry.toJSON();
		const second = entry.toJSON();
		expect(first).not.toBe(second);
		expect(first).toEqual(second);
		first.name = "changed";
		(first.detail as { nested: number[] }).nested.push(2);
		expect(entry.name).toBe("immutable");
		expect(entry.detail).toEqual({ nested: [1] });
		expect(entry.toJSON().detail).toEqual({ nested: [1] });
	});
});

describe("finite JSON detail snapshots", () => {
	it.each(
		[
			null,
			true,
			false,
			0,
			1.25,
			"",
			"雪🚀",
			[1, null, "two"],
			{ nested: [true, { value: 3 }] },
		].map((detail) => ({ detail })),
	)("round-trips supported detail %j", ({ detail }) => {
		const { methods } = fixture();
		expect(methods.mark("detail", { detail }).detail).toEqual(detail);
		expect(
			methods.measure("detail", { start: 0, detail }).toJSON().detail,
		).toEqual(detail);
	});

	it("copies input and every detail access instead of leaking mutable identity", () => {
		const { methods } = fixture();
		const detail = { nested: [{ value: 1 }] };
		const mark = methods.mark("detail", { detail });
		const measure = methods.measure("detail", { start: 0, detail });
		detail.nested[0].value = 2;
		for (const entry of [mark, measure]) {
			const first = entry.detail as typeof detail;
			const second = entry.detail as typeof detail;
			expect(first).not.toBe(second);
			expect(first.nested).not.toBe(second.nested);
			expect(first).toEqual({ nested: [{ value: 1 }] });
			first.nested[0].value = 9;
			expect(entry.detail).toEqual({ nested: [{ value: 1 }] });
		}
	});

	it("preserves Unicode and own prototype-named keys without pollution", () => {
		const { methods } = fixture();
		const detail = Object.create(null);
		Object.defineProperty(detail, "__proto__", {
			value: { polluted: "no" },
			enumerable: true,
		});
		detail.constructor = "constructor-value";
		detail.prototype = "prototype-value";
		detail["雪🚀"] = "\u0000\ud800";
		const output = methods.mark("detail", { detail }).detail as Record<
			string,
			unknown
		>;
		expect(Object.hasOwn(output, "__proto__")).toBe(true);
		expect(output.__proto__).toEqual({ polluted: "no" });
		expect(output.constructor).toBe("constructor-value");
		expect(output.prototype).toBe("prototype-value");
		expect(output["雪🚀"]).toBe("\u0000\ud800");
		expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
	});

	it.each(
		[
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			1n,
			Symbol("private-detail"),
			() => "private-detail",
			new Date(0),
			new Map([["key", 1]]),
			new Set([1]),
			new Uint8Array([1]),
			new ArrayBuffer(1),
			/unsupported/,
			{ nested: undefined },
			[undefined],
			new Array(1),
			Object.create({ inherited: 1 }),
		].map((detail) => ({ detail })),
	)(
		"rejects unsupported detail rather than lossy JSON coercion: %s",
		({ detail }) => {
			const { timing, methods } = fixture();
			expectUnchanged(timing, () => methods.mark("bad", { detail }));
			expectUnchanged(timing, () =>
				methods.measure("bad", { start: 0, detail }),
			);
		},
	);

	it("rejects cycles, symbol keys, hidden fields and array expandos", () => {
		const { timing, methods } = fixture();
		const cycle: Record<string, unknown> = {};
		cycle.self = cycle;
		const array = [1];
		Object.defineProperty(array, "extra", { value: 2, enumerable: true });
		const hidden = Object.defineProperty({}, "hidden", { value: 1 });
		for (const detail of [cycle, { [Symbol("hidden")]: 1 }, hidden, array]) {
			expectUnchanged(timing, () => methods.mark("bad", { detail }));
		}
	});

	it("never invokes nested accessors or custom toJSON during detail validation", () => {
		const { timing, methods } = fixture();
		const kept = methods.mark("kept");
		let calls = 0;
		const accessor = Object.defineProperty({}, "secret", {
			enumerable: true,
			get() {
				calls++;
				methods.clearMarks();
				throw new Error("private-detail-getter");
			},
		});
		const custom = {
			toJSON() {
				calls++;
				return "private-toJSON";
			},
		};
		for (const detail of [{ nested: accessor }, custom]) {
			const error = expectUnchanged(timing, () =>
				methods.mark("bad", { detail }),
			);
			expect(error.message).not.toContain("private-");
		}
		expect(calls).toBe(0);
		expect(methods.getEntries()).toEqual([kept]);
	});

	it("copies repeated acyclic references without treating them as cycles", () => {
		const { methods } = fixture();
		const shared = { value: 1 };
		const detail = { first: shared, second: shared };
		const output = methods.mark("shared", { detail }).detail as typeof detail;
		expect(output).toEqual(detail);
		expect(output.first).not.toBe(shared);
		expect(output.second).not.toBe(output.first);
		output.first.value = 2;
		expect(output.second.value).toBe(1);
	});

	it("rejects excessive depth and node count without consuming entry quota", () => {
		const { timing, methods } = fixture();
		let nested: unknown = null;
		for (let depth = 0; depth < 32; depth++) nested = { child: nested };
		for (const detail of [nested, Array.from({ length: 2048 }, () => 0)]) {
			expectUnchanged(timing, () => methods.mark("too-large", { detail }));
		}
		expect(methods.mark("valid", { detail: [1] }).detail).toEqual([1]);
	});
});

describe("timeline quotas and lifecycle", () => {
	it("reports the bounded profile and default limits without payload data", () => {
		const { timing, methods } = fixture();
		expect(userTimingLimits).toEqual({
			maxEntries: 256,
			maxCreated: 1024,
			maxNameCodeUnits: 1024,
			maxDetailBytes: 8192,
			maxRetainedUnits: 262144,
			maxOperations: 8192,
		});
		methods.mark("private-name-value", { detail: "private-detail-value" });
		const metrics = timing.metrics();
		expect(metrics.limits).toEqual(userTimingLimits);
		expect(JSON.stringify(metrics)).not.toContain("private-");
		expect(metrics.retainedUnits).toBeGreaterThan(0);
	});

	it.each([
		"maxEntries",
		"maxCreated",
		"maxNameCodeUnits",
		"maxDetailBytes",
		"maxRetainedUnits",
		"maxOperations",
	] as const)("validates configured %s without reading its accessor", (key) => {
		for (const value of [
			0,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			userTimingLimits[key] * 16 + 1,
		]) {
			expectCode(() => fixture({ [key]: value }), "invalid-input");
		}
		expect(() => fixture({ [key]: userTimingLimits[key] * 16 })).not.toThrow();
		let calls = 0;
		const limits = Object.defineProperty({}, key, {
			get() {
				calls++;
				throw new Error("private-limit-getter");
			},
		});
		expectCode(() => fixture(limits), "invalid-input");
		expect(calls).toBe(0);
	});

	it("rejects unknown or inherited custom limits", () => {
		expectCode(
			() => fixture({ unknown: 1 } as TimingLimitOverrides),
			"invalid-input",
		);
		expectCode(
			() => fixture(Object.create({ maxEntries: 1 })),
			"invalid-input",
		);
	});

	it("rejects non-record and symbol-keyed limit overrides with safe errors", () => {
		for (const limits of [
			null,
			[],
			1,
			"private-limits",
			{ [Symbol("private-key")]: 1 },
		]) {
			const error = expectCode(
				() => fixture(limits as TimingLimitOverrides),
				"invalid-input",
			);
			expect(error.message).not.toContain("private-");
		}
	});

	it("snapshots configured limits instead of retaining the caller's record", () => {
		const limits = { maxEntries: 1 };
		const { timing, methods } = fixture(limits);
		limits.maxEntries = 10;
		methods.mark("first");
		expectCode(() => methods.mark("second"), "resource-limit");
		expect(timing.metrics().limits.maxEntries).toBe(1);
	});

	it("bounds active entries but clearing restores only active capacity", () => {
		const { timing, methods } = fixture({ maxEntries: 1, maxCreated: 2 });
		const retained = methods.mark("first", { startTime: 1 });
		expectCode(() => methods.measure("full"), "resource-limit");
		expect(timing.metrics()).toMatchObject({ active: 1, created: 1 });
		methods.clearMarks();
		methods.measure("second");
		methods.clearMeasures();
		expectCode(() => methods.mark("cumulative-full"), "resource-limit");
		expect(timing.metrics()).toMatchObject({ active: 0, created: 2 });
		expect(retained.startTime).toBe(1);
	});

	it("counts name code units rather than Unicode code points", () => {
		const { timing, methods } = fixture({ maxNameCodeUnits: 2 });
		expect(methods.mark("🚀").name).toBe("🚀");
		expect(methods.mark("ab").name).toBe("ab");
		expectUnchanged(timing, () => methods.mark("🚀x"));
		expectUnchanged(timing, () => methods.getEntriesByName("abc"));
		expectUnchanged(timing, () => methods.clearMarks("abc"));
	});

	it("bounds UTF-8 detail bytes rather than only string code units", () => {
		const { timing, methods } = fixture({ maxDetailBytes: 8 });
		expect(methods.mark("fits", { detail: "aaaaaa" }).detail).toBe("aaaaaa");
		expectUnchanged(timing, () =>
			methods.mark("too-large", { detail: "雪雪雪" }),
		);
		expectUnchanged(timing, () =>
			methods.mark("too-large", { detail: "aaaaaaa" }),
		);
	});

	it("retains cleared name/detail capacity and enforces its exact observed bound", () => {
		const sample = fixture();
		sample.methods.mark("retained", { detail: { payload: "sample" } });
		const cost = sample.timing.metrics().retainedUnits;
		expect(cost).toBeGreaterThan(0);
		const { timing, methods } = fixture({ maxRetainedUnits: cost });
		const entry = methods.mark("retained", { detail: { payload: "sample" } });
		methods.clearMarks();
		expect(timing.metrics().retainedUnits).toBe(cost);
		expectCode(
			() => methods.mark("retained", { detail: { payload: "sample" } }),
			"resource-limit",
		);
		expect(entry.detail).toEqual({ payload: "sample" });
		expect(timing.metrics()).toMatchObject({
			active: 0,
			created: 1,
			retainedUnits: cost,
		});
	});

	it("charges failed attempts, queries, and clears to the operation ceiling", () => {
		const { timing, methods } = fixture({ maxOperations: 3 });
		expect(() => methods.mark()).toThrow();
		expect(methods.getEntries()).toEqual([]);
		methods.clearMeasures();
		expect(timing.metrics().operations).toBe(3);
		const before = timing.metrics();
		expectCode(() => methods.mark("exhausted"), "resource-limit");
		expectCode(() => methods.getEntriesByType("mark"), "resource-limit");
		expectCode(() => methods.clearMarks(), "resource-limit");
		expect(timing.metrics()).toMatchObject({
			active: before.active,
			created: before.created,
			retainedUnits: before.retainedUnits,
		});
		timing.close();
		expect(timing.metrics().closed).toBe(true);
	});

	it("does not revoke already published entry reads at the operation ceiling", () => {
		const { methods } = fixture({ maxOperations: 1 });
		const entry = methods.mark("kept", { detail: { value: 1 } });
		expectCode(() => methods.getEntries(), "resource-limit");
		expect(entry.name).toBe("kept");
		expect(entry.detail).toEqual({ value: 1 });
		expect(entry.toJSON().entryType).toBe("mark");
	});

	it("close is idempotent and revokes active and cleared capabilities", () => {
		const { timing, methods } = fixture();
		const cleared = methods.mark("cleared", { detail: { value: 1 } });
		methods.clearMarks();
		const active = methods.measure("active");
		timing.close();
		timing.close();
		expect(timing.metrics()).toMatchObject({ closed: true, active: 0 });
		for (const action of [
			() => methods.mark("new"),
			() => methods.measure("new"),
			() => methods.getEntries(),
			() => methods.getEntriesByType("mark"),
			() => methods.getEntriesByName("cleared"),
			() => methods.clearMarks(),
			() => methods.clearMeasures(),
		]) {
			expectCode(action, "closed");
		}
		for (const entry of [cleared, active]) {
			for (const field of [
				"name",
				"entryType",
				"startTime",
				"duration",
				"detail",
			] as const) {
				expectCode(() => entry[field], "closed");
			}
			expectCode(() => entry.toJSON(), "closed");
		}
	});

	it("owner clock close also revokes explicit-time operations and entry views", () => {
		const { clock, timing, methods } = fixture();
		const entry = methods.mark("kept", { startTime: 1 });
		clock.close();
		expectCode(() => methods.mark("explicit", { startTime: 2 }), "closed");
		expectCode(
			() => methods.measure("explicit", { start: 1, end: 2 }),
			"closed",
		);
		expectCode(() => methods.getEntries(), "closed");
		expectCode(() => entry.name, "closed");
		expectCode(() => entry.toJSON(), "closed");
		expect(timing.metrics()).toMatchObject({ closed: true, active: 0 });
	});

	it("sanitizes later clock failures for all saved entry views without charging operations", () => {
		const sentinel = new Error("private-clock-origin-sentinel");
		let broken = false;
		const clock = {
			get timeOrigin() {
				if (broken) throw sentinel;
				return 1000;
			},
			now: () => 4,
		};
		const timing = new PageUserTiming(clock, ordinaryFactory);
		const methods = timing.methods as unknown as TimingMethods;
		const entry = methods.mark("saved", {
			startTime: 4,
			detail: { value: 1 },
		});
		const operations = timing.metrics().operations;
		const expected = {
			name: "saved",
			entryType: "mark",
			startTime: 4,
			duration: 0,
			detail: { value: 1 },
		};
		const fields = [
			"name",
			"entryType",
			"startTime",
			"duration",
			"detail",
		] as const;
		const reads = [
			...fields.map((field) => () => entry[field]),
			() => entry.toJSON(),
		];
		for (const field of fields) expect(entry[field]).toEqual(expected[field]);
		expect(entry.toJSON()).toEqual(expected);
		expect(timing.metrics().operations).toBe(operations);
		broken = true;
		for (const read of reads) {
			const error = expectCode(read, "unsupported");
			expect(error).not.toBe(sentinel);
			expect(error.message).not.toContain("private-clock-origin-sentinel");
			expect(timing.metrics().operations).toBe(operations);
		}
		broken = false;
		for (const field of fields) expect(entry[field]).toEqual(expected[field]);
		expect(entry.toJSON()).toEqual(expected);
		expect(timing.metrics().operations).toBe(operations);
		timing.close();
		for (const read of reads) {
			expectCode(read, "closed");
			expect(timing.metrics().operations).toBe(operations);
		}
	});
});

describe("transactional factory publication", () => {
	it("keeps capabilities captured during failed publication permanently revoked", () => {
		let escaped: TimingEntry | undefined;
		let reject = true;
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				const capability = materialize(definition) as TimingEntry;
				if (reject) {
					escaped = capability;
					throw new Error("private-factory-failure");
				}
				return capability;
			},
		};
		const { timing, methods } = fixture({}, factory);
		expectUnchanged(timing, () => methods.mark("unpublished"));
		expect(escaped).toBeDefined();
		expectCode(() => escaped?.name, "closed");
		expectCode(() => escaped?.detail, "closed");
		expectCode(() => escaped?.toJSON(), "closed");
		reject = false;
		methods.mark("published");
		expectCode(() => escaped?.name, "closed");
	});

	it("does not inspect thrown factory objects while sanitizing failure", () => {
		let reads = 0;
		const thrown = Object.defineProperty({}, "message", {
			get() {
				reads++;
				return "private-factory-object";
			},
		});
		const factory: ScriptHostObjectFactory = {
			createHostObject() {
				throw thrown;
			},
		};
		const { timing, methods } = fixture({}, factory);
		const error = expectUnchanged(timing, () => methods.mark("rejected"));
		expect(error.message).not.toContain("private-");
		expect(reads).toBe(0);
	});

	it("rolls back a thrown publication, hides raw errors, and keeps unrelated entries", () => {
		let shouldThrow = false;
		const raw = new Error("private-factory-error");
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				if (shouldThrow) throw raw;
				return materialize(definition);
			},
		};
		const { timing, methods } = fixture(
			{ maxEntries: 2, maxCreated: 2 },
			factory,
		);
		const kept = methods.mark("kept", { startTime: 1 });
		shouldThrow = true;
		const error = expectUnchanged(timing, () =>
			methods.mark("private-name", { detail: "private-detail" }),
		);
		expect(error).not.toBe(raw);
		expect(error.message).not.toContain("private-");
		expect(methods.getEntries()).toEqual([kept]);
		shouldThrow = false;
		const next = methods.mark("next", { startTime: 2 });
		expect(methods.getEntries()).toEqual([kept, next]);
		expect(timing.metrics().created).toBe(2);
	});

	it.each([
		null,
		undefined,
		1,
		"private-capability",
		true,
		Symbol("private-capability"),
	])("rejects a non-object factory result and restores quota: %s", (result) => {
		let invalid = true;
		const factory: ScriptHostObjectFactory = {
			createHostObject: (definition) =>
				invalid ? (result as unknown as object) : materialize(definition),
		};
		const { timing, methods } = fixture(
			{ maxEntries: 1, maxCreated: 1 },
			factory,
		);
		const error = expectUnchanged(timing, () => methods.mark("private-name"));
		expect(error.message).not.toContain("private-");
		invalid = false;
		expect(methods.mark("valid").name).toBe("valid");
		expect(timing.metrics()).toMatchObject({ active: 1, created: 1 });
	});

	it("rejects an aliased entry capability even after the first entry is cleared", () => {
		let previous: object | undefined;
		let alias = false;
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				if (alias && previous) return previous;
				previous = materialize(definition);
				return previous;
			},
		};
		const { timing, methods } = fixture({}, factory);
		const kept = methods.mark("kept", { startTime: 1 });
		alias = true;
		expectUnchanged(timing, () => methods.mark("aliased", { startTime: 2 }));
		expect(methods.getEntries()).toEqual([kept]);
		methods.clearMarks();
		expectUnchanged(timing, () => methods.mark("aliased-after-clear"));
		expect(methods.getEntries()).toEqual([]);
		expect(kept.name).toBe("kept");
		alias = false;
		expect(methods.mark("new").name).toBe("new");
	});

	it.each([{ maxEntries: 1 }, { maxCreated: 1 }])(
		"reserves publication capacity against reentrant creation: %j",
		(limits) => {
			let inside = false;
			let nestedError: Error | undefined;
			let publications = 0;
			const factory: ScriptHostObjectFactory = {
				createHostObject(definition) {
					publications++;
					if (!inside) {
						inside = true;
						nestedError = caught(() => methods.mark("nested"));
						inside = false;
					}
					return materialize(definition);
				},
			};
			const setup = fixture(limits, factory);
			const methods = setup.methods;
			const outer = methods.mark("outer");
			expect(nestedError).toBeInstanceOf(Error);
			expect(publications).toBe(1);
			expect(methods.getEntries()).toEqual([outer]);
			expect(setup.timing.metrics()).toMatchObject({ active: 1, created: 1 });
		},
	);

	it("reserves name/detail retention before calling a reentrant factory", () => {
		const sample = fixture();
		sample.methods.mark("entry", { detail: "payload" });
		const cost = sample.timing.metrics().retainedUnits;
		let inside = false;
		let nestedError: Error | undefined;
		let publications = 0;
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				publications++;
				if (!inside) {
					inside = true;
					nestedError = caught(() =>
						methods.mark("entry", { detail: "payload" }),
					);
					inside = false;
				}
				return materialize(definition);
			},
		};
		const setup = fixture({ maxRetainedUnits: cost }, factory);
		const methods = setup.methods;
		methods.mark("entry", { detail: "payload" });
		expect(nestedError).toBeInstanceOf(Error);
		expect(publications).toBe(1);
		expect(setup.timing.metrics()).toMatchObject({
			active: 1,
			created: 1,
			retainedUnits: cost,
		});
	});

	it("does not expose an entry through queries before publication succeeds", () => {
		let observed: TimingEntry[] | undefined;
		let queryError: Error | undefined;
		const factory: ScriptHostObjectFactory = {
			createHostObject(definition) {
				try {
					observed = methods.getEntries();
				} catch (error) {
					queryError = error as Error;
				}
				return materialize(definition);
			},
		};
		const setup = fixture({}, factory);
		const methods = setup.methods;
		const entry = methods.mark("pending");
		if (queryError) expect(queryError).toBeInstanceOf(Error);
		else expect(observed).toEqual([]);
		expect(methods.getEntries()).toEqual([entry]);
	});

	it.each(["timeline", "clock"])(
		"rechecks %s closure after factory publication and never commits the entry",
		(owner) => {
			let closeOwner = () => {};
			const factory: ScriptHostObjectFactory = {
				createHostObject(definition) {
					const capability = materialize(definition);
					closeOwner();
					return capability;
				},
			};
			const { clock, timing, methods } = fixture({}, factory);
			closeOwner =
				owner === "clock" ? () => clock.close() : () => timing.close();
			expectCode(() => methods.mark("never-published"), "closed");
			expect(timing.metrics()).toMatchObject({
				closed: true,
				active: 0,
				created: 0,
			});
		},
	);
});

describe("shared page performance integration", () => {
	it("reuses one timeline for multiple capabilities belonging to the same clock", () => {
		const clock = new PageClock({ timeOrigin: 1000, now: () => 0 });
		const first = createPagePerformance(
			ordinaryFactory,
			clock,
		) as PerformanceCapability;
		const second = createPagePerformance(
			ordinaryFactory,
			clock,
		) as PerformanceCapability;
		const entry = first.mark("shared", { startTime: 1 });
		expect(second.getEntries()[0]).toBe(entry);
		expect(
			second.measure("duration", { start: "shared", end: 3 }).duration,
		).toBe(2);
		second.clearMarks("shared");
		expect(first.getEntriesByType("mark")).toEqual([]);
		expect(clock.metrics().timeline).toMatchObject({ active: 1, created: 2 });
		clock.close();
		expectCode(() => first.getEntries(), "closed");
		expectCode(() => second.getEntries(), "closed");
		expectCode(() => entry.name, "closed");
	});

	it("exposes real timing methods alongside the existing shared clock", () => {
		let reading = 5;
		const clock = new PageClock({ timeOrigin: 1000, now: () => reading });
		const performance = createPagePerformance(
			ordinaryFactory,
			clock,
		) as PerformanceCapability;
		expect(performance.timeOrigin).toBe(1005);
		expect(Reflect.set(performance, "timeOrigin", 0)).toBe(false);
		reading = 8.29;
		expect(performance.now()).toBe(3.2);
		const begin = performance.mark("begin");
		expect(begin.startTime).toBe(3.2);
		reading = 10.59;
		const measure = performance.measure("elapsed", "begin");
		expect(measure.startTime).toBe(3.2);
		expect(measure.duration).toBeCloseTo(2.3);
		expect(performance.getEntries()).toEqual([begin, measure]);
		expect(performance.getEntriesByType("mark")[0]).toBe(begin);
		expect(performance.getEntriesByName("elapsed", "measure")[0]).toBe(measure);
		const snapshot = performance.toJSON();
		expect(snapshot).toEqual({ timeOrigin: 1005 });
		snapshot.timeOrigin = 0;
		expect(performance.toJSON()).toEqual({ timeOrigin: 1005 });
		performance.clearMarks();
		performance.clearMeasures();
		expect(performance.getEntries()).toEqual([]);
		expect(begin.name).toBe("begin");
		clock.close();
		for (const action of [
			() => performance.timeOrigin,
			() => performance.now(),
			() => performance.toJSON(),
			() => performance.mark("new", { startTime: 0 }),
			() => performance.measure("new", { start: 0, end: 1 }),
			() => performance.getEntries(),
			() => performance.clearMarks(),
			() => begin.detail,
			() => measure.toJSON(),
		]) {
			expectCode(action, "closed");
		}
	});

	it("keeps independently owned page timelines isolated", () => {
		const firstClock = new PageClock({ timeOrigin: 1000, now: () => 0 });
		const secondClock = new PageClock({ timeOrigin: 2000, now: () => 0 });
		const first = createPagePerformance(
			ordinaryFactory,
			firstClock,
		) as PerformanceCapability;
		const second = createPagePerformance(
			ordinaryFactory,
			secondClock,
		) as PerformanceCapability;
		const entry = first.mark("private-to-first", { startTime: 4 });
		expect(second.getEntries()).toEqual([]);
		expect(
			caught(() => second.measure("missing", "private-to-first")).name,
		).toBe("SyntaxError");
		second.clearMarks();
		expect(first.getEntries()).toEqual([entry]);
		secondClock.close();
		expect(entry.startTime).toBe(4);
		expect(first.getEntries()).toEqual([entry]);
	});
});
