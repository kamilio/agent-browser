import type { AudioRecordingSource } from "./audio-recording.js";
import { AudioSourceHub } from "./audio-source-hub.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { BrowserEvent, type DocumentEvents } from "./events.js";
import type {
	PageBindingContext,
	PageBindingLifecycle,
} from "./page-bindings.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import type { ScriptEventBindings } from "./script-events.js";

export interface PageAudioSourceSettings {
	sampleRate: number;
	channels: 1 | 2;
	label?: string;
}
interface Target {
	id: string;
	target: number;
	port: object;
	receiver?: object;
}
interface Track extends Target {
	family?: Family;
	settings: Readonly<PageAudioSourceSettings>;
	enabled: boolean;
	ended: boolean;
	stopped: boolean;
	contentHint: string;
	readers: Set<AudioRecordingSource>;
}
interface Stream extends Target {
	tracks: Track[];
}
interface Family {
	hub: AudioSourceHub;
	hold: { close(): Promise<void> };
	tracks: Set<Track>;
}
const limits = Object.freeze({
	tracks: 128,
	streams: 128,
	sources: 16,
	tracksPerStream: 64,
});

/** Page MediaStream/MediaStreamTrack ownership for explicitly supplied audio.
 * Device acquisition, Web Audio, video and WebRTC remain separate capabilities.
 */
export class PageMediaStreams {
	readonly bootstrap: () => object;
	private readonly tracks = new Map<string, Track>();
	private readonly streams = new Set<Stream>();
	private readonly families = new Set<Family>();
	private readonly references = new Set<object>();
	private readonly cleanupTasks = new Set<Promise<void>>();
	private readonly cleanupErrors: unknown[] = [];
	private readonly endedQueue = new Set<Track>();
	private readonly controller = new AbortController();
	private constructors: unknown[] = [];
	private wrapStream?: unknown;
	private claimed = false;
	private closed = false;
	private closing?: Promise<void>;
	private timer?: ReturnType<typeof setTimeout>;
	private delivering?: Promise<void>;
	private readonly unregister: () => unknown;

	constructor(
		tree: DocumentTree,
		private readonly context: PageBindingContext,
		private readonly lifecycle: PageBindingLifecycle,
		private readonly events: DocumentEvents,
		private readonly bindings: ScriptEventBindings,
	) {
		if (events.documentRoot !== tree.root)
			throw new TypeError("Media events belong to another document");
		const publish = context.retainGuestArguments((...values: unknown[]) => {
			this.ensureOpen();
			if (
				this.constructors.length ||
				values.length !== 2 ||
				!values.every(reference)
			) {
				for (const value of new Set(values))
					if (reference(value) && !this.references.has(value))
						context.releaseGuestReference(value);
				throw new TypeError("Invalid media constructor publication");
			}
			for (const value of values) this.references.add(value as object);
			this.constructors = values;
		}, 0);
		const setFactory = (factory: unknown) => {
			this.ensureOpen();
			if (this.wrapStream || typeof factory !== "function")
				throw new TypeError("Invalid media stream factory");
			this.wrapStream = factory;
		};
		const publishFactory =
			context.retainCallbackArguments?.(setFactory) ?? setFactory;
		const bind = context.retainGuestArguments(
			(id: unknown, receiver: unknown) => {
				try {
					this.ensureOpen();
					const record =
						typeof id === "string"
							? (this.tracks.get(id) ??
								[...this.streams].find((stream) => stream.id === id))
							: undefined;
					if (
						!record ||
						!reference(receiver) ||
						record.receiver ||
						this.references.has(receiver)
					)
						throw new TypeError("Invalid media facade binding");
					this.bindings.bindIndependentTarget(record.target, receiver);
					record.receiver = receiver;
					this.references.add(receiver);
				} catch (error) {
					if (reference(receiver) && !this.references.has(receiver))
						context.releaseGuestReference(receiver);
					throw error;
				}
			},
			1,
		);
		this.bootstrap = () => {
			this.ensureOpen();
			if (this.claimed)
				throw new TypeError("Media bootstrap is available once");
			this.claimed = true;
			return context.createHostObject({
				properties: {
					maxTracksPerStream: { get: () => limits.tracksPerStream },
				},
				methods: {
					publish,
					publishFactory,
					bind,
					createStream: (ids) => this.createStream(this.selectTracks(ids)).port,
				},
			});
		};
		this.unregister = tree.onClose(() => {
			void this.close().catch(() => {});
		});
	}

	constructorValue(name: "MediaStream" | "MediaStreamTrack"): unknown {
		this.ensureOpen();
		return this.constructors[name === "MediaStream" ? 0 : 1];
	}

	async createAudioStream(
		source: AudioRecordingSource,
		settings: PageAudioSourceSettings,
	): Promise<unknown> {
		this.checkCapacity(1, 1);
		const { family, selected } = this.createAudioFamily(source, settings);
		try {
			const track = this.createTrack(selected, family);
			const stream = this.createStream([track]);
			const invocation = this.lifecycle.startCallback(
				this.wrapStream,
				[stream.port],
				{ thisValue: undefined },
			);
			// Observe both phases even if one rejects.
			await Promise.all([invocation.synchronous, invocation.result]);
			this.ensureOpen();
			if (!stream.receiver)
				throw new TypeError("Media stream factory did not bind its facade");
			return stream.receiver;
		} catch (error) {
			for (const track of family.tracks) this.stopTrack(track);
			try {
				await family.hub.close();
			} catch (cleanup) {
				if (cleanup !== error)
					throw new AggregateError(
						[error, cleanup],
						"Media construction and source cleanup failed",
					);
			}
			throw error;
		}
	}

	/** Adds a native producer to an existing empty stream without reentering guest code. */
	attachAudioSource(
		id: string,
		source: AudioRecordingSource,
		settings: PageAudioSourceSettings,
	): { close(): Promise<void> } {
		this.ensureOpen();
		const stream = [...this.streams].find((stream) => stream.id === id);
		if (!stream || !stream.receiver || stream.tracks.length)
			throw new TypeError("Audio destination requires an owned empty stream");
		this.checkCapacity(1, 0);
		const { family, selected } = this.createAudioFamily(source, settings);
		try {
			stream.tracks = [this.createTrack(selected, family)];
		} catch (error) {
			this.observeCleanup(family.hub.close());
			throw error;
		}
		return {
			close: () => {
				this.sourceEnded(family);
				return family.hub.close();
			},
		};
	}

	private createAudioFamily(
		source: AudioRecordingSource,
		settings: PageAudioSourceSettings,
	) {
		this.ensureOpen();
		if (
			!source ||
			typeof source.read !== "function" ||
			typeof source.close !== "function"
		)
			throw new TypeError("Invalid audio source");
		if (!this.wrapStream)
			throw new TypeError("Media constructors are not initialized");
		if (
			!settings ||
			!Number.isInteger(settings.sampleRate) ||
			settings.sampleRate < 8000 ||
			settings.sampleRate > 96000 ||
			(settings.channels !== 1 && settings.channels !== 2) ||
			(settings.label !== undefined &&
				(typeof settings.label !== "string" || settings.label.length > 256))
		)
			throw new TypeError("Invalid audio source settings");
		if (this.families.size >= limits.sources) throw this.limit();
		const selected = Object.freeze({
			sampleRate: settings.sampleRate,
			channels: settings.channels,
			label: settings.label ?? "",
		});
		let sourceEnded = false;
		const hub = new AudioSourceHub(
			{
				read: async (signal) => {
					try {
						const packet = await source.read(signal);
						if (packet === null) sourceEnded = true;
						return packet;
					} catch (error) {
						sourceEnded = true;
						throw error;
					}
				},
				close: async () => {
					try {
						await source.close();
					} finally {
						if (sourceEnded) this.sourceEnded(family);
					}
				},
			},
			{
				channels: selected.channels,
				maxPacketFrames: 4096,
				maxSourceFrames: selected.sampleRate * 3600,
				maxReaders: 16,
				maxCreatedReaders: 256,
				maxQueuedFrames: 8192,
			},
		);
		const family: Family = { hub, hold: hub.retain(), tracks: new Set() };
		this.families.add(family);
		return { family, selected };
	}

	/** Opens a recorder subscription to a track owned by this document. */
	openAudioReader(id: string): AudioRecordingSource {
		this.ensureOpen();
		const track = this.tracks.get(id);
		if (!track) throw new TypeError("Unknown audio track");
		if (track.ended || !track.family)
			return { read: async () => null, close() {} };
		const input = track.family.hub.open();
		let closed = false;
		const reader: AudioRecordingSource = {
			read: async (signal) => {
				if (closed || track.stopped || this.closed) return null;
				const packet = await input.read(signal);
				if (closed || track.stopped || this.closed) return null;
				if (packet && !track.enabled)
					for (const channel of packet.channels) channel.fill(0);
				return packet;
			},
			close: () => {
				closed = true;
				track.readers.delete(reader);
				return input.close();
			},
		};
		track.readers.add(reader);
		return reader;
	}

	metrics() {
		const hubs = [...this.families].map((family) => family.hub.metrics());
		return Object.freeze({
			partial: true,
			closed: this.closed,
			tracks: this.tracks.size,
			streams: this.streams.size,
			liveTracks: [...this.tracks.values()].filter((track) => !track.ended)
				.length,
			sources: hubs.length,
			pendingCleanup: this.cleanupTasks.size,
			pendingEvents: this.endedQueue.size,
			pendingDispatch: Boolean(this.delivering),
			guestReferences: this.references.size,
			cleanupFailures: this.cleanupErrors.length,
			retainedBytes: hubs.reduce((total, hub) => total + hub.retainedBytes, 0),
			cleanupVerified:
				this.closed &&
				!this.timer &&
				!this.delivering &&
				this.cleanupTasks.size === 0 &&
				this.references.size === 0 &&
				this.cleanupErrors.length === 0 &&
				hubs.every((hub) => hub.cleanupVerified),
		});
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.closing = Promise.resolve().then(async () => {
			const results = await Promise.allSettled([
				...this.cleanupTasks,
				...[...this.families].map((family) => family.hub.close()),
				this.delivering,
			]);
			const errors = [
				...this.cleanupErrors,
				...results.flatMap((result) =>
					result.status === "rejected" ? [result.reason] : [],
				),
			];
			if (errors.length)
				throw new AggregateError(
					[...new Set(errors)],
					"Media source cleanup failed",
				);
		});
		void this.closing.catch(() => {});
		this.controller.abort();
		if (this.timer !== undefined) clearTimeout(this.timer);
		this.timer = undefined;
		this.endedQueue.clear();
		this.unregister?.();
		for (const track of this.tracks.values()) this.stopTrack(track, true);
		for (const record of [...this.tracks.values(), ...this.streams])
			this.bindings.unbindIndependentTarget(record.target);
		for (const value of this.references) {
			try {
				this.context.releaseGuestReference(value);
			} catch (error) {
				this.cleanupErrors.push(error);
			}
		}
		this.references.clear();
		this.constructors = [];
		if (this.wrapStream) {
			try {
				this.context.releaseCallback?.(this.wrapStream);
			} catch (error) {
				this.cleanupErrors.push(error);
			}
		}
		this.wrapStream = undefined;
		for (const record of [...this.tracks.values(), ...this.streams])
			record.receiver = undefined;
		for (const stream of this.streams) stream.tracks = [];
		return this.closing;
	}

	private createTrack(
		settings: Readonly<PageAudioSourceSettings>,
		family?: Family,
		original?: Track,
	): Track {
		this.ensureOpen();
		this.checkCapacity(1, 0);
		const track: Track = {
			id: crypto.randomUUID(),
			target: this.events.createIndependentTarget(),
			port: {},
			settings,
			family,
			enabled: original?.enabled ?? true,
			ended: original?.ended ?? false,
			stopped: false,
			contentHint: original?.contentHint ?? "",
			readers: new Set(),
		};
		const properties = this.eventProperties(track, ["ended", "mute", "unmute"]);
		const reads: Record<string, () => unknown> = {
			id: () => track.id,
			kind: () => "audio",
			label: () => settings.label ?? "",
			readyState: () => (track.ended ? "ended" : "live"),
			muted: () => false,
		};
		for (const [name, read] of Object.entries(reads))
			properties[name] = {
				get: () => {
					this.ensureOpen();
					return read();
				},
			};
		properties.enabled = {
			get: () => {
				this.ensureOpen();
				return track.enabled;
			},
			set: (value) => {
				this.ensureOpen();
				track.enabled = Boolean(value);
			},
		};
		properties.contentHint = {
			get: () => {
				this.ensureOpen();
				return track.contentHint;
			},
			set: (value) => {
				this.ensureOpen();
				if (
					["", "speech", "speech-recognition", "music"].includes(
						value as string,
					)
				)
					track.contentHint = value as string;
			},
		};
		try {
			track.port = this.context.createHostObject({
				properties,
				methods: {
					...this.eventMethods(track),
					settings: () => {
						this.ensureOpen();
						return {
							sampleRate: settings.sampleRate,
							channelCount: settings.channels,
						};
					},
					capabilities: () => {
						this.ensureOpen();
						return {
							sampleRate: {
								min: settings.sampleRate,
								max: settings.sampleRate,
							},
							channelCount: { min: settings.channels, max: settings.channels },
						};
					},
					clone: () =>
						this.createTrack(settings, track.ended ? undefined : family, track)
							.port,
					stop: () => {
						this.ensureOpen();
						this.stopTrack(track);
					},
				},
			});
		} catch (error) {
			this.events.releaseIndependentTarget(track.target);
			throw error;
		}
		this.tracks.set(track.id, track);
		if (!track.ended) family?.tracks.add(track);
		return track;
	}

	private createStream(tracks: Track[]): Stream {
		this.ensureOpen();
		this.checkCapacity(0, 1);
		const stream: Stream = {
			id: crypto.randomUUID(),
			target: this.events.createIndependentTarget(),
			port: {},
			tracks: [...new Set(tracks)],
		};
		try {
			stream.port = this.context.createHostObject({
				properties: {
					...this.eventProperties(stream, ["addtrack", "removetrack"]),
					id: {
						get: () => {
							this.ensureOpen();
							return stream.id;
						},
					},
					active: {
						get: () => {
							this.ensureOpen();
							return stream.tracks.some((track) => !track.ended);
						},
					},
				},
				methods: {
					...this.eventMethods(stream),
					ids: () => {
						this.ensureOpen();
						return stream.tracks.map((track) => track.id);
					},
					tracks: () => {
						this.ensureOpen();
						return stream.tracks.map((track) => track.port);
					},
					find: (id) => {
						this.ensureOpen();
						return stream.tracks.find((track) => track.id === id)?.port ?? null;
					},
					add: (id) => {
						this.ensureOpen();
						const [track] = this.selectTracks([id]);
						if (stream.tracks.includes(track)) return;
						if (stream.tracks.length >= limits.tracksPerStream)
							throw this.limit();
						stream.tracks.push(track);
					},
					remove: (id) => {
						this.ensureOpen();
						const [track] = this.selectTracks([id]);
						stream.tracks = stream.tracks.filter((value) => value !== track);
					},
					clone: () => {
						this.ensureOpen();
						this.checkCapacity(stream.tracks.length, 1);
						const clones: Track[] = [];
						try {
							for (const track of stream.tracks)
								clones.push(
									this.createTrack(
										track.settings,
										track.ended ? undefined : track.family,
										track,
									),
								);
							return this.createStream(clones).port;
						} catch (error) {
							for (const track of clones) this.stopTrack(track);
							throw error;
						}
					},
				},
			});
		} catch (error) {
			this.events.releaseIndependentTarget(stream.target);
			throw error;
		}
		this.streams.add(stream);
		return stream;
	}

	private eventProperties(
		record: Target,
		names: string[],
	): NonNullable<ScriptHostObjectDefinition["properties"]> {
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of names)
			properties[`on${name}`] = {
				get: () => {
					this.ensureOpen();
					return this.bindings.getHandler(record.target, name);
				},
				set: (value) => {
					this.ensureOpen();
					this.bindings.setHandler(record.target, name, value);
				},
			};
		return properties;
	}

	private eventMethods(
		record: Target,
	): NonNullable<ScriptHostObjectDefinition["methods"]> {
		return {
			addEventListener: (type, callback, options) => {
				this.ensureOpen();
				this.bindings.add(record.target, eventName(type), callback, options);
			},
			removeEventListener: (type, callback, options) => {
				this.ensureOpen();
				this.bindings.remove(record.target, eventName(type), callback, options);
			},
		};
	}

	private stopTrack(track: Track, closing = false): void {
		if (track.stopped || (track.ended && !closing)) return;
		track.stopped = true;
		track.ended = true;
		for (const reader of [...track.readers])
			this.observeCleanup(Promise.resolve(reader.close()));
		track.family?.tracks.delete(track);
		if (track.family && track.family.tracks.size === 0)
			this.observeCleanup(track.family.hold.close());
	}

	private sourceEnded(family: Family): void {
		if (this.closed) return;
		for (const track of family.tracks)
			if (!track.ended) {
				track.ended = true;
				this.endedQueue.add(track);
			}
		family.tracks.clear();
		void family.hold.close().catch(() => {});
		if (!this.timer && !this.delivering && this.endedQueue.size)
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.delivering = this.deliverEnded()
					.catch((error) => {
						if (!this.closed) this.lifecycle.fail(error);
					})
					.finally(() => {
						this.delivering = undefined;
					});
			}, 0);
	}

	private async deliverEnded(): Promise<void> {
		while (!this.closed && this.endedQueue.size) {
			const track = this.endedQueue.values().next().value as Track;
			this.endedQueue.delete(track);
			if (!track.receiver || track.stopped) continue;
			await this.events.whenIdle(this.controller.signal);
			await this.events.dispatchEventAsync(
				track.target,
				new BrowserEvent("ended"),
				this.controller.signal,
			);
		}
	}

	private observeCleanup(task: Promise<void>): void {
		this.cleanupTasks.add(task);
		void task.then(
			() => {
				this.cleanupTasks.delete(task);
			},
			(error) => {
				this.cleanupTasks.delete(task);
				if (!this.cleanupErrors.includes(error)) this.cleanupErrors.push(error);
			},
		);
	}
	private selectTracks(ids: unknown): Track[] {
		this.ensureOpen();
		if (!Array.isArray(ids) || ids.length > limits.tracksPerStream)
			throw new TypeError("Invalid media track list");
		const result: Track[] = [];
		for (let i = 0; i < ids.length; i++) {
			const track = this.tracks.get(ids[i]);
			if (!track) throw new TypeError("Foreign or unknown media track");
			result.push(track);
		}
		return result;
	}
	private checkCapacity(tracks: number, streams: number): void {
		if (
			this.tracks.size + tracks > limits.tracks ||
			this.streams.size + streams > limits.streams
		)
			throw this.limit();
	}
	private limit(): AgentBrowserError {
		return new AgentBrowserError(
			"resource-limit",
			"Page media resource limit exceeded",
		);
	}
	private ensureOpen(): void {
		if (this.closed || this.lifecycle.isClosed())
			throw new AgentBrowserError("closed", "Page media streams are closed");
	}
}
function reference(value: unknown): value is object {
	return (
		value !== null && (typeof value === "object" || typeof value === "function")
	);
}
function eventName(value: unknown): string {
	if (typeof value !== "string" || value.length > 256)
		throw new TypeError("Invalid media event type");
	return value;
}
