import type { AudioRecordingSource } from "./audio-recording.js";
import type { DocumentTree } from "./document.js";
import type {
	PageBindingContext,
	PageBindingLifecycle,
} from "./page-bindings.js";
import type {
	PageAudioSourceSettings,
	PageMediaStreams,
} from "./page-media-streams.js";

/** Registration explicitly grants this page access to a supplied audio input.
 * open must settle after cancellation. close must acknowledge source shutdown.
 */
export interface PageAudioInput extends PageAudioSourceSettings {
	deviceId: string;
	groupId: string;
	open(
		signal: AbortSignal,
	): AudioRecordingSource | Promise<AudioRecordingSource>;
}
type Device = Readonly<PageAudioInput>;
type Failure = { error: string; constraint?: string };
interface Lease {
	id: string;
	device: Device;
	controller: AbortController;
	timer?: ReturnType<typeof setTimeout>;
	source?: AudioRecordingSource;
	cancelled: boolean;
	resolve(value: { lease: string } | Failure): void;
}
const keys = ["deviceId", "groupId", "sampleRate", "channelCount"] as const;
type Key = (typeof keys)[number];
type Constraint = {
	exact?: string[] | number;
	ideal?: string[] | number;
	min?: number;
	max?: number;
};
type Constraints = Partial<Record<Key, Constraint>>;

export function supportsPageMediaDevices(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" ||
			(url.protocol === "http:" &&
				(url.hostname === "localhost" ||
					url.hostname.endsWith(".localhost") ||
					url.hostname === "[::1]" ||
					/^127\.\d+\.\d+\.\d+$/.test(url.hostname)))
		);
	} catch {
		return false;
	}
}

/** Partial MediaDevices backed exclusively by page-owned registered sources. */
export class PageMediaDevices {
	readonly bootstrap: () => object;
	private readonly devices = new Map<string, Device>();
	private readonly leases = new Map<string, Lease>();
	private readonly tasks = new Set<Promise<void>>();
	private readonly cleanupErrors: unknown[] = [];
	private facade?: object;
	private claimed = false;
	private closed = false;
	private closing?: Promise<void>;
	private readonly unregister: () => unknown;
	private readonly origin: string;

	constructor(
		private readonly tree: DocumentTree,
		private readonly context: PageBindingContext,
		private readonly lifecycle: PageBindingLifecycle,
		private readonly streams: PageMediaStreams,
	) {
		if (!supportsPageMediaDevices(tree.url))
			throw new TypeError("Media devices require a trustworthy origin");
		this.origin = new URL(tree.url).origin;
		const publish = context.retainGuestArguments((...values: unknown[]) => {
			if (
				this.closed ||
				this.facade ||
				values.length !== 1 ||
				!values[0] ||
				typeof values[0] !== "object"
			) {
				for (const value of new Set(values))
					if (
						value &&
						(typeof value === "object" || typeof value === "function") &&
						value !== this.facade
					)
						context.releaseGuestReference(value);
				throw new TypeError("Invalid media devices publication");
			}
			this.facade = values[0];
		}, 0);
		this.bootstrap = () => {
			this.ensureOpen();
			if (this.claimed)
				throw new TypeError("Media devices bootstrap is available once");
			this.claimed = true;
			return context.createHostObject({
				methods: {
					publish,
					enumerate: () =>
						this.available()
							? {
									devices: [...this.devices.values()].map(
										({ deviceId, groupId, label }) => ({
											deviceId,
											groupId,
											label: label ?? "",
											kind: "audioinput",
										}),
									),
								}
							: { error: "InvalidStateError" },
					acquire: (constraints) => this.acquire(constraints),
					attach: (id, stream) => this.attach(id, stream),
					cancel: (id) => {
						const lease =
							typeof id === "string" ? this.leases.get(id) : undefined;
						if (lease) this.cancel(lease, "AbortError");
					},
					check: () => this.available(),
				},
			});
		};
		this.unregister = tree.onClose(() => {
			void this.close().catch(() => {});
		});
	}

	facadeValue(): unknown {
		this.ensureOpen();
		return this.facade;
	}

	/** Removing a registration cancels acquisitions, but does not stop live tracks. */
	registerAudioInput(input: PageAudioInput): { unregister(): void } {
		this.ensureOpen();
		if (
			!input ||
			typeof input.open !== "function" ||
			!validText(input.deviceId) ||
			!input.deviceId ||
			!validText(input.groupId) ||
			(input.label !== undefined && !validText(input.label)) ||
			!Number.isInteger(input.sampleRate) ||
			input.sampleRate < 8000 ||
			input.sampleRate > 96000 ||
			(input.channels !== 1 && input.channels !== 2)
		)
			throw new TypeError("Invalid audio input registration");
		if (this.devices.has(input.deviceId) || this.devices.size >= 16)
			throw new RangeError("Audio input registration limit or duplicate ID");
		const device = Object.freeze({
			deviceId: input.deviceId,
			groupId: input.groupId,
			label: input.label ?? "",
			sampleRate: input.sampleRate,
			channels: input.channels,
			open: input.open.bind(input),
		});
		this.devices.set(device.deviceId, device);
		return {
			unregister: () => {
				if (this.devices.get(device.deviceId) !== device) return;
				this.devices.delete(device.deviceId);
				for (const lease of this.leases.values())
					if (lease.device === device) this.cancel(lease, "AbortError");
			},
		};
	}

	metrics() {
		return Object.freeze({
			partial: true,
			closed: this.closed,
			devices: this.devices.size,
			pendingAcquisitions: this.leases.size,
			pendingCleanup: this.tasks.size,
			timers: [...this.leases.values()].filter(
				(lease) => lease.timer !== undefined,
			).length,
			guestReferences: this.facade ? 1 : 0,
			cleanupFailures: this.cleanupErrors.length,
			cleanupVerified:
				this.closed &&
				!this.facade &&
				!this.leases.size &&
				!this.tasks.size &&
				!this.cleanupErrors.length,
		});
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.closing = Promise.resolve().then(async () => {
			while (this.tasks.size) await Promise.allSettled([...this.tasks]);
			if (this.cleanupErrors.length)
				throw new AggregateError(
					this.cleanupErrors,
					"Media device cleanup failed",
				);
		});
		void this.closing.catch(() => {});
		this.unregister?.();
		this.devices.clear();
		for (const lease of this.leases.values()) this.cancel(lease, "AbortError");
		if (this.facade) {
			try {
				this.context.releaseGuestReference(this.facade);
			} catch (error) {
				this.cleanupErrors.push(error);
			}
			this.facade = undefined;
		}
		return this.closing;
	}

	private acquire(value: unknown): Promise<{ lease: string } | Failure> {
		if (!this.available())
			return Promise.resolve({ error: "InvalidStateError" });
		let constraints: Constraints;
		try {
			constraints = parseConstraints(value);
		} catch {
			return Promise.resolve({ error: "TypeError" });
		}
		if (!this.devices.size) return Promise.resolve({ error: "NotFoundError" });
		let candidates = [...this.devices.values()];
		for (const key of keys) {
			candidates = candidates.filter((device) =>
				matches(device, key, constraints[key]),
			);
			if (!candidates.length)
				return Promise.resolve({
					error: "OverconstrainedError",
					constraint: key,
				});
		}
		candidates.sort(
			(a, b) => fitness(a, constraints) - fitness(b, constraints),
		);
		if (this.leases.size >= 8)
			return Promise.resolve({ error: "NotReadableError" });
		return new Promise((resolve) => {
			const lease: Lease = {
				id: crypto.randomUUID(),
				device: candidates[0],
				controller: new AbortController(),
				cancelled: false,
				resolve,
			};
			this.leases.set(lease.id, lease);
			lease.timer = setTimeout(() => this.cancel(lease, "AbortError"), 10000);
			this.observe(
				Promise.resolve()
					.then(() => {
						if (lease.cancelled) return;
						return lease.device.open(lease.controller.signal);
					})
					.then((source) => {
						if (!source) {
							if (lease.cancelled) return;
							throw new TypeError("Invalid audio input source");
						}
						lease.source = ownedSource(source, lease.controller);
						if (lease.cancelled) {
							this.observe(
								Promise.resolve()
									.then(() => lease.source?.close())
									.finally(() => {
										this.leases.delete(lease.id);
									}),
							);
						} else if (!this.available()) this.cancel(lease, "AbortError");
						else if (typeof source.read !== "function")
							this.cancel(lease, "NotReadableError");
						else resolve({ lease: lease.id });
					})
					.catch(() => {
						this.cancel(lease, "NotReadableError");
					})
					.finally(() => {
						if (lease.cancelled && !lease.source) this.leases.delete(lease.id);
					}),
			);
		});
	}

	private attach(id: unknown, stream: unknown): Failure | { ok: true } {
		const lease = typeof id === "string" ? this.leases.get(id) : undefined;
		if (
			!this.available() ||
			!lease ||
			lease.cancelled ||
			!lease.source ||
			typeof stream !== "string"
		)
			return { error: "AbortError" };
		try {
			this.streams.attachAudioSource(stream, lease.source, lease.device);
			clearTimeout(lease.timer);
			lease.timer = undefined;
			this.leases.delete(lease.id);
			return { ok: true };
		} catch {
			this.cancel(lease, "NotReadableError");
			return { error: "NotReadableError" };
		}
	}

	private cancel(lease: Lease, error: string): void {
		if (lease.cancelled) return;
		lease.cancelled = true;
		clearTimeout(lease.timer);
		lease.timer = undefined;
		lease.controller.abort();
		lease.resolve({ error });
		if (lease.source)
			this.observe(
				Promise.resolve()
					.then(() => lease.source?.close())
					.finally(() => {
						this.leases.delete(lease.id);
					}),
			);
	}
	private observe(task: Promise<void>): void {
		this.tasks.add(task);
		void task.then(
			() => {
				this.tasks.delete(task);
			},
			(error) => {
				this.tasks.delete(task);
				this.cleanupErrors.push(error);
			},
		);
	}
	private available(): boolean {
		return (
			!this.closed &&
			!this.lifecycle.isClosed() &&
			this.cleanupErrors.length === 0 &&
			new URL(this.tree.url).origin === this.origin
		);
	}
	private ensureOpen(): void {
		if (!this.available())
			throw new Error("Page media devices are unavailable");
	}
}

function ownedSource(
	source: AudioRecordingSource,
	controller: AbortController,
): AudioRecordingSource {
	if (typeof source.close !== "function")
		throw new TypeError("Invalid audio input source");
	let closing: Promise<void> | undefined;
	return {
		read: (signal) => source.read(signal),
		close: () => {
			if (!closing) {
				closing = Promise.resolve().then(() => source.close());
				controller.abort();
			}
			return closing;
		},
	};
}
function validText(value: unknown): value is string {
	return typeof value === "string" && value.length <= 256;
}
function parseConstraints(value: unknown): Constraints {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new TypeError();
	const result: Constraints = {};
	for (const key of keys) {
		const raw = (value as Record<string, unknown>)[key];
		if (raw === undefined) continue;
		if (!raw || typeof raw !== "object" || Array.isArray(raw))
			throw new TypeError();
		const constraint: Constraint = {};
		for (const field of ["exact", "ideal", "min", "max"] as const) {
			const item = (raw as Record<string, unknown>)[field];
			if (item === undefined) continue;
			if (key === "deviceId" || key === "groupId") {
				if (
					(field !== "exact" && field !== "ideal") ||
					!Array.isArray(item) ||
					item.length > 16 ||
					!item.every(validText)
				)
					throw new TypeError();
				constraint[field] = [...item];
			} else {
				if (
					typeof item !== "number" ||
					!Number.isInteger(item) ||
					item < 0 ||
					item > 1000000
				)
					throw new TypeError();
				constraint[field] = item;
			}
		}
		result[key] = constraint;
	}
	return result;
}
function setting(device: Device, key: Key): string | number {
	return key === "channelCount" ? device.channels : device[key];
}
function matches(device: Device, key: Key, value?: Constraint): boolean {
	if (!value) return true;
	const actual = setting(device, key);
	if (
		value.exact !== undefined &&
		(Array.isArray(value.exact)
			? value.exact.length > 0 && !value.exact.includes(String(actual))
			: actual !== value.exact)
	)
		return false;
	return !(
		typeof actual === "number" &&
		((value.min !== undefined && actual < value.min) ||
			(value.max !== undefined && actual > value.max))
	);
}
function fitness(device: Device, constraints: Constraints): number {
	let total = 0;
	for (const key of keys) {
		const ideal = constraints[key]?.ideal;
		const actual = setting(device, key);
		if (Array.isArray(ideal))
			total += ideal.length && !ideal.includes(String(actual)) ? 1 : 0;
		else if (
			typeof ideal === "number" &&
			typeof actual === "number" &&
			ideal !== actual
		)
			total += Math.abs(ideal - actual) / Math.max(ideal, actual);
	}
	return total;
}
