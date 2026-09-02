import { parseInvocation } from "./cli-parser.js";
import {
	BrowserCommandHost,
	type CommandRequestOptions,
	type CommandResult,
} from "./command-host.js";
import { AgentBrowserError } from "./errors.js";
import {
	BrowserSessionProcess,
	type SessionProcessOptions,
} from "./node-session-process.js";

export interface SessionActor {
	readonly session: string;
	readonly exited: Promise<void>;
	execute(
		argv: readonly string[],
		options?: CommandRequestOptions,
	): Promise<CommandResult>;
	close(): Promise<void>;
	metrics(): { closed: boolean; terminating: boolean };
	info(): { pid: number; version: string; session: string };
}

export interface SessionProcessHostOptions {
	process: Omit<SessionProcessOptions, "session">;
	maxSessions?: number;
	maxPendingCommands?: number;
	maxCommands?: number;
	createProcess?: (options: SessionProcessOptions) => Promise<SessionActor>;
}

interface Entry {
	name: string;
	actor: Promise<SessionActor>;
	closing?: Promise<void>;
}

const ownedActors = new WeakSet<SessionActor>();

export class SessionProcessHost {
	private readonly entries = new Map<string, Entry>();
	private readonly metadata: BrowserCommandHost;
	private readonly createProcess: NonNullable<
		SessionProcessHostOptions["createProcess"]
	>;
	private readonly processOptions: Omit<SessionProcessOptions, "session">;
	private readonly maxSessions: number;
	private readonly maxPending: number;
	private readonly maxCommands: number;
	private pending = 0;
	private executed = 0;
	private closed = false;
	private closing?: Promise<void>;
	private draining?: Promise<void>;

	constructor(options: SessionProcessHostOptions) {
		if (
			!options ||
			!options.process ||
			typeof options.process.packageRoot !== "string" ||
			(options.createProcess !== undefined &&
				typeof options.createProcess !== "function")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid process host options",
			);
		this.maxSessions = options.maxSessions ?? 8;
		this.maxPending = options.maxPendingCommands ?? 64;
		this.maxCommands = options.maxCommands ?? 10_000;
		for (const [value, maximum] of [
			[this.maxSessions, 32],
			[this.maxPending, 256],
			[this.maxCommands, 1_000_000],
		]) {
			if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid process host limits",
				);
		}
		this.processOptions = {
			...options.process,
			...(options.process.scripts
				? {
						scripts: {
							...options.process.scripts,
							limits: { ...options.process.scripts.limits },
						},
					}
				: {}),
		};
		this.createProcess =
			options.createProcess ??
			((options) => BrowserSessionProcess.create(options));
		this.metadata = new BrowserCommandHost({
			pageFetch: true,
			websiteScripts: options.process.websiteScripts === "classic",
			maxSessions: this.maxSessions,
			maxPendingCommands: this.maxPending,
			maxCommands: this.maxCommands,
			documentFormats: [
				"text/html",
				"text/plain",
				"application/json",
				"application/*+json",
			],
			createSession: () => {
				throw new AgentBrowserError(
					"unsupported",
					"Sessions must run in owned processes",
				);
			},
			evaluatePage: async () => {
				throw new AgentBrowserError(
					"unsupported",
					"Evaluation must run in an owned process",
				);
			},
		});
	}

	capabilities() {
		return {
			...this.metadata.capabilities(),
			sessionExecution: "owned-node-process",
			runtimeSelection: "explicit-safejs-package",
			automaticActorRestart: false,
		};
	}

	metrics() {
		return {
			sessions: this.entries.size,
			pendingCommands: this.pending,
			executedCommands: this.executed,
			closed: this.closed,
			draining: !!this.draining,
		};
	}

	async execute(
		argv: readonly string[],
		options: CommandRequestOptions = {},
	): Promise<CommandResult> {
		if (this.closed || this.draining)
			throw new AgentBrowserError(
				"closed",
				"Process host is closed or draining",
			);
		if (
			!Array.isArray(argv) ||
			argv.length > 256 ||
			argv.some((value) => typeof value !== "string") ||
			!options ||
			(options.signal !== undefined &&
				!(options.signal instanceof AbortSignal)) ||
			(options.session !== undefined && typeof options.session !== "string")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid process host command",
			);
		const invocation = parseInvocation(argv, {
			AGENT_BROWSER_SESSION: options.session,
		});
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Command aborted");
		const result = (data: unknown): CommandResult => ({
			schemaVersion: 1,
			command: invocation.command,
			session: invocation.session,
			data,
		});
		if (
			invocation.command === "help" ||
			invocation.options.help ||
			invocation.options.version
		)
			return this.metadata.execute(argv, options);
		this.metadata.validateInvocation(invocation);
		if (invocation.command === "capabilities")
			return result(this.capabilities());
		if (invocation.command === "close-all") {
			await this.drain();
			return result({ closed: true });
		}
		if (invocation.command === "close") {
			const entry = this.entries.get(invocation.session);
			if (entry) await this.closeEntry(entry);
			return result({ closed: true });
		}
		if (this.pending >= this.maxPending || this.executed >= this.maxCommands)
			throw new AgentBrowserError(
				"resource-limit",
				"Process host command limit exceeded",
			);
		this.pending++;
		this.executed++;
		try {
			if (invocation.command === "list") {
				const groups = await Promise.all(
					[...this.entries.values()].map(async (entry) => {
						const actor = await this.ready(entry, options.signal);
						const listArguments = [
							"list",
							...(invocation.options.timeout === undefined
								? []
								: [`--timeout=${invocation.options.timeout}`]),
						];
						const listing = await actor.execute(listArguments, {
							signal: options.signal,
							session: entry.name,
						});
						if (!Array.isArray(listing.data))
							throw new AgentBrowserError(
								"invalid-input",
								"Invalid actor session listing",
							);
						const info = actor.info();
						return listing.data.map((value) => ({
							...value,
							process: { pid: info.pid, version: info.version },
						}));
					}),
				);
				return result(groups.flat());
			}
			let entry = this.entries.get(invocation.session);
			if (!entry && invocation.command === "open") {
				if (this.entries.size >= this.maxSessions)
					throw new AgentBrowserError(
						"resource-limit",
						"Named process session limit exceeded",
					);
				entry = this.start(invocation.session);
			}
			if (!entry)
				throw new AgentBrowserError(
					"not-found",
					"No named session; run open first",
				);
			const actor = await this.ready(entry, options.signal);
			return await actor.execute(argv, {
				session: invocation.session,
				signal: options.signal,
			});
		} finally {
			this.pending--;
		}
	}

	close(): Promise<void> {
		if (this.closing) return this.closing;
		this.closed = true;
		this.metadata.close();
		this.closing = this.drain();
		return this.closing;
	}

	private start(name: string): Entry {
		const entry: Entry = {
			name,
			actor: Promise.resolve().then(async () => {
				const actor = await this.createProcess({
					...this.processOptions,
					session: name,
				});
				if (ownedActors.has(actor))
					throw new AgentBrowserError(
						"invalid-input",
						"Process factory reused an owned actor",
					);
				if (actor.session !== name) {
					await actor.close();
					throw new AgentBrowserError(
						"invalid-input",
						"Process factory returned another session",
					);
				}
				ownedActors.add(actor);
				void actor.exited.then(() => {
					if (this.entries.get(name) === entry) this.entries.delete(name);
				});
				return actor;
			}),
		};
		this.entries.set(name, entry);
		void entry.actor.catch(() => {
			if (this.entries.get(name) === entry) this.entries.delete(name);
		});
		return entry;
	}

	private async ready(entry: Entry, signal?: AbortSignal) {
		const actor = await entry.actor;
		if (signal?.aborted) {
			await this.closeEntry(entry);
			throw new AgentBrowserError(
				"aborted",
				"Command aborted during process startup",
			);
		}
		if (
			this.closed ||
			this.draining ||
			entry.closing ||
			this.entries.get(entry.name) !== entry ||
			actor.metrics().closed ||
			actor.metrics().terminating
		) {
			await this.closeEntry(entry);
			throw new AgentBrowserError("closed", "Named process session is closed");
		}
		return actor;
	}

	private closeEntry(entry: Entry): Promise<void> {
		if (entry.closing) return entry.closing;
		entry.closing = Promise.resolve()
			.then(async () => {
				let actor: SessionActor;
				try {
					actor = await entry.actor;
				} catch {
					return;
				}
				await actor.close();
			})
			.finally(() => {
				if (this.entries.get(entry.name) === entry)
					this.entries.delete(entry.name);
			});
		return entry.closing;
	}

	private drain(): Promise<void> {
		if (this.draining) return this.draining;
		this.draining = Promise.allSettled(
			[...this.entries.values()].map((entry) => this.closeEntry(entry)),
		)
			.then((results) => {
				for (const result of results)
					if (result.status === "rejected") throw result.reason;
			})
			.finally(() => {
				this.draining = undefined;
			});
		return this.draining;
	}
}
