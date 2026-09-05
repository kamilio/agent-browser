import { AgentBrowserError, type ErrorCode } from "./errors.js";
import { scriptJsonResult } from "./safejs.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export const userTimingLimits = Object.freeze({
	maxEntries: 256,
	maxCreated: 1024,
	maxNameCodeUnits: 1024,
	maxDetailBytes: 8192,
	maxRetainedUnits: 262_144,
	maxOperations: 8192,
});

type TimingLimits = {
	-readonly [Key in keyof typeof userTimingLimits]: number;
};
type EntryType = "mark" | "measure";
interface Entry {
	name: string;
	entryType: EntryType;
	startTime: number;
	duration: number;
	detailJson: string;
	live: boolean;
	capability?: object;
}
interface TimingClock {
	readonly timeOrigin: number;
	now(): number;
	onClose?(listener: () => void): () => void;
}

const ownErrors = new WeakSet<object>();
const legacyNames = new Set(
	"navigationStart unloadEventStart unloadEventEnd redirectStart redirectEnd fetchStart domainLookupStart domainLookupEnd connectStart connectEnd secureConnectionStart requestStart responseStart responseEnd domLoading domInteractive domContentLoadedEventStart domContentLoadedEventEnd domComplete loadEventStart loadEventEnd".split(
		" ",
	),
);

function fail(code: ErrorCode): never {
	const error = new AgentBrowserError(code, "User timing operation failed");
	ownErrors.add(error);
	throw error;
}

function invalid(): never {
	const error = new TypeError("Invalid user timing arguments");
	ownErrors.add(error);
	throw error;
}

function missingMark(): never {
	const error = new DOMException("Invalid user timing mark", "SyntaxError");
	ownErrors.add(error);
	throw error;
}

function dictionary(value: unknown, fields: readonly string[]) {
	const result: Record<string, unknown> = Object.create(null);
	if (value === undefined || value === null) return result;
	if (typeof value !== "object" || Array.isArray(value)) invalid();
	if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
		fail("unsupported");
	if (Reflect.ownKeys(value).length > 16) fail("resource-limit");
	for (const field of fields) {
		const descriptor = Object.getOwnPropertyDescriptor(value, field);
		if (!descriptor) continue;
		if (!Object.hasOwn(descriptor, "value")) fail("unsupported");
		if (descriptor.value !== undefined) result[field] = descriptor.value;
	}
	return result;
}

function timestamp(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		invalid();
	return value;
}

function detailSnapshot(value: unknown, maxBytes: number): string {
	const ancestors = new Set<object>();
	let nodes = 0;
	const visit = (current: unknown, depth: number): void => {
		if (++nodes > 1024 || depth > 16) fail("resource-limit");
		if (current === null || typeof current === "boolean") return;
		if (typeof current === "number") {
			if (!Number.isFinite(current)) fail("unsupported");
			return;
		}
		if (typeof current === "string") {
			if (current.length > maxBytes) fail("resource-limit");
			return;
		}
		if (typeof current !== "object" || !current) fail("unsupported");
		if (ancestors.has(current)) fail("unsupported");
		const array = Array.isArray(current);
		const prototype = Object.getPrototypeOf(current);
		if (
			array
				? prototype !== Array.prototype
				: prototype !== Object.prototype && prototype !== null
		)
			fail("unsupported");
		const keys = Reflect.ownKeys(current);
		if (keys.length > 1025) fail("resource-limit");
		if (array && (current.length > 1024 || keys.length !== current.length + 1))
			fail("unsupported");
		ancestors.add(current);
		try {
			for (const key of keys) {
				if (array && key === "length") continue;
				if (typeof key !== "string") fail("unsupported");
				if (key.length > maxBytes) fail("resource-limit");
				if (
					array &&
					(!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= current.length)
				)
					fail("unsupported");
				const descriptor = Object.getOwnPropertyDescriptor(current, key);
				if (
					!descriptor ||
					!Object.hasOwn(descriptor, "value") ||
					!descriptor.enumerable
				)
					fail("unsupported");
				visit(descriptor.value, depth + 1);
			}
		} finally {
			ancestors.delete(current);
		}
	};
	visit(value, 0);
	try {
		return JSON.stringify(scriptJsonResult(value, maxBytes));
	} catch (error) {
		if (error instanceof AgentBrowserError && error.code === "resource-limit")
			fail("resource-limit");
		fail("unsupported");
	}
}

export class PageUserTiming {
	readonly limits: Readonly<TimingLimits>;
	readonly methods = {
		mark: (...args: unknown[]) => this.invoke(() => this.mark(args)),
		measure: (...args: unknown[]) => this.invoke(() => this.measure(args)),
		getEntries: () => this.invoke(() => this.query()),
		getEntriesByType: (...args: unknown[]) =>
			this.invoke(() => this.query(undefined, this.requiredName(args))),
		getEntriesByName: (...args: unknown[]) =>
			this.invoke(() =>
				this.query(
					this.requiredName(args),
					args[1] === undefined ? undefined : this.name(args[1]),
				),
			),
		clearMarks: (...args: unknown[]) =>
			this.invoke(() => this.clear("mark", args)),
		clearMeasures: (...args: unknown[]) =>
			this.invoke(() => this.clear("measure", args)),
	};
	private active: Entry[] = [];
	private readonly published = new Set<Entry>();
	private readonly capabilities = new WeakSet<object>();
	private created = 0;
	private pending = 0;
	private retainedUnits = 0;
	private operations = 0;
	private closed = false;
	private unregisterClose: () => void = () => {};

	constructor(
		private readonly clock: TimingClock,
		private readonly factory: ScriptHostObjectFactory,
		limits: Partial<TimingLimits> = {},
	) {
		try {
			if (!limits || typeof limits !== "object" || Array.isArray(limits))
				invalid();
			if (![Object.prototype, null].includes(Object.getPrototypeOf(limits)))
				invalid();
			const overrides: Partial<TimingLimits> = {};
			for (const key of Reflect.ownKeys(limits)) {
				if (typeof key !== "string" || !Object.hasOwn(userTimingLimits, key))
					invalid();
				const descriptor = Object.getOwnPropertyDescriptor(limits, key);
				const name = key as keyof TimingLimits;
				if (
					!descriptor ||
					!Object.hasOwn(descriptor, "value") ||
					!Number.isSafeInteger(descriptor.value) ||
					descriptor.value < 1 ||
					descriptor.value > userTimingLimits[name] * 16
				)
					invalid();
				overrides[name] = descriptor.value;
			}
			this.limits = Object.freeze({ ...userTimingLimits, ...overrides });
		} catch {
			fail("invalid-input");
		}
		try {
			const subscribe = clock.onClose;
			if (subscribe !== undefined) {
				if (typeof subscribe !== "function") fail("invalid-input");
				const unregister = subscribe.call(clock, () => this.close());
				if (typeof unregister !== "function") fail("invalid-input");
				if (this.closed) unregister();
				else this.unregisterClose = unregister;
			}
		} catch {
			fail("invalid-input");
		}
	}

	metrics() {
		return Object.freeze({
			partial: true,
			profile: "bounded-user-timing-json-snapshots",
			active: this.active.length,
			created: this.created,
			retainedUnits: this.retainedUnits,
			operations: this.operations,
			closed: this.closed,
			limits: this.limits,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		const unregister = this.unregisterClose;
		this.unregisterClose = () => {};
		for (const entry of this.published) {
			entry.live = false;
			entry.name = "";
			entry.detailJson = "null";
		}
		this.active = [];
		this.published.clear();
		this.retainedUnits = 0;
		try {
			unregister();
		} catch {
			fail("unsupported");
		}
	}

	private ensureOpen() {
		if (this.closed) fail("closed");
		void this.clock.timeOrigin;
	}

	private invoke<Result>(operation: () => Result): Result {
		return this.guard(() => {
			this.ensureOpen();
			if (this.operations >= this.limits.maxOperations) fail("resource-limit");
			this.operations++;
			return operation();
		});
	}

	private guard<Result>(operation: () => Result): Result {
		try {
			return operation();
		} catch (error) {
			if (error && typeof error === "object" && ownErrors.has(error))
				throw error;
			fail("unsupported");
		}
	}

	private name(value: unknown): string {
		if (typeof value === "symbol") invalid();
		if (
			(typeof value === "object" && value !== null) ||
			typeof value === "function"
		)
			fail("unsupported");
		const name = String(value);
		if (name.length > this.limits.maxNameCodeUnits) fail("resource-limit");
		return name;
	}

	private requiredName(args: unknown[]): string {
		if (!args.length) invalid();
		return this.name(args[0]);
	}

	private resolve(value: unknown): number {
		if (typeof value !== "string") return timestamp(value);
		const name = this.name(value);
		if (legacyNames.has(name)) fail("unsupported");
		for (let index = this.active.length - 1; index >= 0; index--) {
			const entry = this.active[index];
			if (entry.entryType === "mark" && entry.name === name)
				return entry.startTime;
		}
		missingMark();
	}

	private mark(args: unknown[]) {
		const name = this.requiredName(args);
		const options = dictionary(args[1], ["startTime", "detail"]);
		if (legacyNames.has(name)) missingMark();
		const startTime =
			options.startTime === undefined
				? timestamp(this.clock.now())
				: timestamp(options.startTime);
		return this.publish(name, "mark", startTime, 0, options.detail ?? null);
	}

	private measure(args: unknown[]) {
		const name = this.requiredName(args);
		const second = args[1];
		const legacy =
			second !== undefined && second !== null && typeof second !== "object";
		const startMark = legacy ? this.name(second) : undefined;
		const options = legacy
			? Object.create(null)
			: dictionary(second, ["start", "end", "duration", "detail"]);
		const endMark = args[2] === undefined ? undefined : this.name(args[2]);
		const hasStart = options.start !== undefined;
		const hasEnd = options.end !== undefined;
		const hasDuration = options.duration !== undefined;
		if (
			Object.keys(options).length &&
			(endMark !== undefined ||
				(!hasStart && !hasEnd) ||
				(hasStart && hasEnd && hasDuration))
		)
			invalid();
		let end: number;
		if (endMark !== undefined) end = this.resolve(endMark);
		else if (hasEnd) end = this.resolve(options.end);
		else if (hasStart && hasDuration)
			end = this.resolve(options.start) + timestamp(options.duration);
		else end = timestamp(this.clock.now());
		let start = 0;
		if (hasStart) start = this.resolve(options.start);
		else if (hasDuration && hasEnd)
			start = this.resolve(options.end) - timestamp(options.duration);
		else if (startMark !== undefined) start = this.resolve(startMark);
		const duration = end - start;
		if (![start, end, duration].every(Number.isFinite)) invalid();
		return this.publish(
			name,
			"measure",
			start,
			duration,
			options.detail ?? null,
		);
	}

	private query(name?: string, type?: string): object[] {
		return this.active
			.filter(
				(entry) =>
					(name === undefined || entry.name === name) &&
					(type === undefined || entry.entryType === type),
			)
			.sort((left, right) => left.startTime - right.startTime)
			.map((entry) => entry.capability as object);
	}

	private clear(type: EntryType, args: unknown[]) {
		const name = args[0] === undefined ? undefined : this.name(args[0]);
		this.active = this.active.filter(
			(entry) =>
				entry.entryType !== type || (name !== undefined && entry.name !== name),
		);
	}

	private publish(
		name: string,
		entryType: EntryType,
		startTime: number,
		duration: number,
		detail: unknown,
	): object {
		const detailJson = detailSnapshot(detail, this.limits.maxDetailBytes);
		const units = 128 + name.length * 2 + detailJson.length * 2;
		if (
			this.active.length + this.pending >= this.limits.maxEntries ||
			this.created >= this.limits.maxCreated ||
			units > this.limits.maxRetainedUnits - this.retainedUnits
		)
			fail("resource-limit");
		const entry: Entry = {
			name,
			entryType,
			startTime,
			duration,
			detailJson,
			live: false,
		};
		const read = <Value>(value: () => Value): Value => {
			return this.guard(() => {
				this.ensureOpen();
				if (!entry.live) fail("closed");
				return value();
			});
		};
		this.created++;
		this.pending++;
		this.retainedUnits += units;
		try {
			const capability = this.factory.createHostObject({
				properties: {
					name: { get: () => read(() => entry.name) },
					entryType: { get: () => read(() => entry.entryType) },
					startTime: { get: () => read(() => entry.startTime) },
					duration: { get: () => read(() => entry.duration) },
					detail: { get: () => read(() => JSON.parse(entry.detailJson)) },
				},
				methods: {
					toJSON: () =>
						read(() => ({
							name: entry.name,
							entryType: entry.entryType,
							startTime: entry.startTime,
							duration: entry.duration,
							detail: JSON.parse(entry.detailJson),
						})),
				},
			});
			this.ensureOpen();
			if (
				!capability ||
				typeof capability !== "object" ||
				this.capabilities.has(capability)
			)
				fail("unsupported");
			entry.capability = capability;
			entry.live = true;
			this.capabilities.add(capability);
			this.active.push(entry);
			this.published.add(entry);
			return capability;
		} catch {
			this.created--;
			if (!this.closed) this.retainedUnits -= units;
			entry.name = "";
			entry.detailJson = "null";
			fail(this.closed ? "closed" : "unsupported");
		} finally {
			this.pending--;
		}
	}
}
