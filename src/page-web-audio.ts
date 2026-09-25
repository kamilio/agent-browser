import {
	type AudioValue,
	NativeAudioContext,
	type NativeAudioNode,
} from "./audio-graph.js";
import { AgentBrowserError } from "./errors.js";
import type {
	PageBindingContext,
	PageBindingLifecycle,
} from "./page-bindings.js";
import type { PageMediaStreams } from "./page-media-streams.js";

export const pageAudioConstructorNames = [
	"AudioContext",
	"AudioNode",
	"AudioParam",
	"OscillatorNode",
	"GainNode",
	"MediaStreamAudioDestinationNode",
] as const;
export const pageWebAudioBootstrapGlobal = "__agentBrowserWebAudioBootstrap";
interface Owner {
	graph: NativeAudioContext;
	sources: { close(): Promise<void> }[];
	closing?: Promise<void>;
}
interface NodeRecord {
	owner: Owner;
	node: NativeAudioNode;
}
export class PageWebAudio {
	readonly bootstrap: () => object;
	private readonly owners = new Set<Owner>();
	private readonly nodes = new Map<string, NodeRecord>();
	private readonly constructors: unknown[] = [];
	private claimed = false;
	private closed = false;
	private closing?: Promise<void>;
	constructor(
		private readonly context: PageBindingContext,
		private readonly lifecycle: PageBindingLifecycle,
		private readonly streams: PageMediaStreams,
	) {
		const publish = context.retainGuestArguments((...values: unknown[]) => {
			this.ensureOpen();
			if (
				this.constructors.length ||
				values.length !== pageAudioConstructorNames.length ||
				!values.every(reference)
			) {
				for (const value of values)
					if (reference(value) && !this.constructors.includes(value))
						context.releaseGuestReference(value);
				throw new TypeError("Invalid audio constructor publication");
			}
			this.constructors.push(...values);
		}, 0);
		this.bootstrap = () => {
			this.ensureOpen();
			if (this.claimed)
				throw new TypeError("Audio bootstrap is available once");
			this.claimed = true;
			return context.createHostObject({
				methods: { publish, create: (sampleRate) => this.create(sampleRate) },
			});
		};
	}
	constructorValue(name: (typeof pageAudioConstructorNames)[number]): unknown {
		this.ensureOpen();
		return this.constructors[pageAudioConstructorNames.indexOf(name)];
	}
	private create(sampleRate: unknown): object {
		this.ensureOpen();
		if (this.owners.size >= 4)
			throw new AgentBrowserError(
				"resource-limit",
				"Audio context limit exceeded",
			);
		if (sampleRate !== undefined && typeof sampleRate !== "number")
			throw new TypeError("Invalid sample rate");
		const owner: Owner = {
			graph: new NativeAudioContext(sampleRate),
			sources: [],
		};
		this.owners.add(owner);
		const graph = owner.graph;
		try {
			return this.context.createHostObject({
				properties: {
					sampleRate: {
						get: () => {
							this.ensureOpen();
							return graph.sampleRate;
						},
					},
					currentTime: {
						get: () => {
							this.ensureOpen();
							return graph.currentTime;
						},
					},
					state: {
						get: () => {
							this.ensureOpen();
							return graph.state;
						},
					},
				},
				methods: {
					oscillator: () => this.node(owner, graph.createOscillator()),
					gain: () => this.node(owner, graph.createGain()),
					destination: (id) => {
						this.ensureOpen();
						if (typeof id !== "string")
							throw new TypeError("Invalid destination stream");
						const destination = graph.createDestination();
						try {
							const handle = this.streams.attachAudioSource(
								id,
								destination.source,
								{
									sampleRate: graph.sampleRate,
									channels: 2,
									label: "Web Audio destination",
								},
							);
							owner.sources.push(handle);
							return this.node(owner, destination.node);
						} catch (error) {
							destination.source.close();
							throw error;
						}
					},
					resume: async () => {
						this.ensureOpen();
						graph.resume();
					},
					suspend: async () => {
						this.ensureOpen();
						graph.suspend();
					},
					close: () => {
						this.ensureOpen();
						return this.closeOwner(owner);
					},
				},
			});
		} catch (error) {
			graph.close();
			throw error;
		}
	}
	private node(owner: Owner, node: NativeAudioNode): object {
		this.ensureOpen();
		const id = crypto.randomUUID();
		this.nodes.set(id, { owner, node });
		const graph = owner.graph;
		const param =
			node.parameter === undefined
				? undefined
				: this.parameter(owner, node.parameter);
		return this.context.createHostObject({
			properties: {
				id: { get: () => id },
				parameter: { get: () => param },
			},
			methods: {
				connect: (target, input, output) => {
					this.ensureOpen();
					ports(input, output);
					const record =
						typeof target === "string" ? this.nodes.get(target) : undefined;
					if (!record) throw new TypeError("Invalid audio destination");
					graph.connect(node, record.node);
				},
				disconnect: (target) => {
					this.ensureOpen();
					const record =
						typeof target === "string" ? this.nodes.get(target) : undefined;
					if (target !== undefined && !record)
						throw new TypeError("Invalid audio destination");
					graph.disconnect(node, record?.node);
				},
				start: (when) => {
					this.ensureOpen();
					graph.start(node, time(when));
				},
				stop: (when) => {
					this.ensureOpen();
					graph.stop(node, time(when));
				},
			},
		});
	}
	private parameter(owner: Owner, parameter: AudioValue): object {
		return this.context.createHostObject({
			properties: {
				value: {
					get: () => {
						this.ensureOpen();
						return parameter.at(owner.graph.currentTime);
					},
					set: (value) => {
						this.ensureOpen();
						parameter.set(number(value), owner.graph.currentTime);
					},
				},
				minValue: { get: () => parameter.min },
				maxValue: { get: () => parameter.max },
			},
			methods: {
				set: (value, at) => {
					this.ensureOpen();
					const requested = time(at);
					if (requested < 0)
						throw new RangeError("Audio time must not be negative");
					parameter.set(
						number(value),
						Math.max(owner.graph.currentTime, requested),
					);
				},
			},
		});
	}
	private closeOwner(owner: Owner): Promise<void> {
		if (owner.closing) return owner.closing;
		owner.graph.close();
		for (const [id, record] of this.nodes)
			if (record.owner === owner) this.nodes.delete(id);
		owner.closing = Promise.allSettled(
			owner.sources.splice(0).map((source) => source.close()),
		).then((results) => {
			const errors = results.flatMap((result) =>
				result.status === "rejected" ? [result.reason] : [],
			);
			if (errors.length)
				throw new AggregateError(errors, "Audio context cleanup failed");
		});
		void owner.closing.catch(() => {});
		return owner.closing;
	}
	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		const errors: unknown[] = [];
		for (const value of this.constructors.splice(0)) {
			try {
				this.context.releaseGuestReference(value);
			} catch (error) {
				errors.push(error);
			}
		}
		this.nodes.clear();
		this.closing = Promise.resolve().then(async () => {
			const results = await Promise.allSettled(
				[...this.owners].map((owner) => this.closeOwner(owner)),
			);
			errors.push(
				...results.flatMap((result) =>
					result.status === "rejected" ? [result.reason] : [],
				),
			);
			if (errors.length)
				throw new AggregateError(errors, "Web Audio cleanup failed");
		});
		// Wake source reads immediately; completion is acknowledged by closeOwner.
		for (const owner of this.owners) owner.graph.close();
		void this.closing.catch(() => {});
		return this.closing;
	}
	metrics() {
		return {
			closed: this.closed,
			contexts: this.owners.size,
			nodes: this.nodes.size,
			guestReferences: this.constructors.length,
			graphs: [...this.owners].map((owner) => owner.graph.metrics()),
		};
	}
	private ensureOpen(): void {
		if (this.closed || this.lifecycle.isClosed())
			throw new AgentBrowserError("closed", "Page audio is closed");
	}
}
function reference(value: unknown): value is object {
	return (
		value !== null && (typeof value === "object" || typeof value === "function")
	);
}
function number(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new TypeError("Invalid audio value");
	return value;
}
function time(value: unknown): number {
	return value === undefined ? 0 : number(value);
}
function ports(input: unknown, output: unknown): void {
	if (
		(input !== undefined && input !== 0) ||
		(output !== undefined && output !== 0)
	)
		throw new RangeError("Audio port index is out of range");
}
