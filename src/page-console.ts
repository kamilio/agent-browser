import type { DocumentTree } from "./document.js";
import { AgentBrowserError, type ErrorCode } from "./errors.js";
import type { ScriptHostObjectFactory } from "./script-dom.js";

export type ConsoleLevel = "debug" | "log" | "info" | "warning" | "error";
export interface ConsoleLimits {
	maxEntries: number;
	maxCodeUnits: number;
	maxEntryCodeUnits: number;
	maxFormatNodes: number;
	maxDepth: number;
	maxArguments: number;
}
export interface ConsoleEntry {
	sequence: number;
	timeMs: number;
	level: ConsoleLevel;
	source: "console" | "evaluation" | "callback" | "navigation";
	text: string;
	truncated: boolean;
}
const ranks: Readonly<Record<ConsoleLevel, number>> = {
	debug: 0,
	log: 1,
	info: 1,
	warning: 2,
	error: 3,
};
const defaults: ConsoleLimits = {
	maxEntries: 256,
	maxCodeUnits: 65_536,
	maxEntryCodeUnits: 4096,
	maxFormatNodes: 256,
	maxDepth: 4,
	maxArguments: 32,
};
const maxima: ConsoleLimits = {
	maxEntries: 1024,
	maxCodeUnits: 262_144,
	maxEntryCodeUnits: 16_384,
	maxFormatNodes: 4096,
	maxDepth: 16,
	maxArguments: 64,
};

function levelRank(level: string) {
	if (!Object.hasOwn(ranks, level))
		throw new AgentBrowserError("invalid-input", "Invalid console level");
	return ranks[level as ConsoleLevel];
}

export class ConsoleBuffer {
	readonly limits: Readonly<ConsoleLimits>;
	private entries: ConsoleEntry[] = [];
	private sequence = 0;
	private dropped = 0;
	private cleared = 0;
	private codeUnits = 0;
	private closed = false;

	constructor(
		options: Partial<ConsoleLimits> = {},
		private readonly describe?: (value: object) => string | undefined,
	) {
		if (!options || typeof options !== "object" || Array.isArray(options))
			throw new AgentBrowserError("invalid-input", "Invalid console limits");
		this.limits = Object.freeze({ ...defaults, ...options });
		for (const name of Object.keys(defaults) as (keyof ConsoleLimits)[])
			if (
				!Number.isSafeInteger(this.limits[name]) ||
				this.limits[name] < 1 ||
				this.limits[name] > maxima[name]
			)
				throw new AgentBrowserError("invalid-input", "Invalid console limit");
		if (this.limits.maxEntryCodeUnits > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"invalid-input",
				"Console entry limit exceeds retention limit",
			);
	}

	write(
		level: ConsoleLevel,
		args: readonly unknown[],
		source: ConsoleEntry["source"] = "console",
	) {
		this.ensureOpen();
		levelRank(level);
		if (!args.length) return;
		let text = "";
		let truncated = false;
		let visited = 0;
		const seen = new Set<object>();
		const append = (value: string) => {
			const remaining = this.limits.maxEntryCodeUnits - text.length;
			text += value.slice(0, remaining);
			if (value.length > remaining) truncated = true;
		};
		const format = (value: unknown, depth: number, nested = false): void => {
			if (
				++visited > this.limits.maxFormatNodes ||
				depth > this.limits.maxDepth ||
				text.length >= this.limits.maxEntryCodeUnits
			) {
				truncated = true;
				append("[…]");
				return;
			}
			if (
				value === null ||
				value === undefined ||
				typeof value === "boolean" ||
				typeof value === "number" ||
				typeof value === "symbol"
			) {
				append(String(value));
				return;
			}
			if (typeof value === "bigint") {
				append(`${value}n`);
				return;
			}
			if (typeof value === "string") {
				const clipped = value.slice(0, this.limits.maxEntryCodeUnits);
				if (clipped.length !== value.length) truncated = true;
				append(nested ? JSON.stringify(clipped) : clipped);
				return;
			}
			if (typeof value === "function") {
				append("[Function]");
				return;
			}
			if (typeof value !== "object") {
				append("[Unknown]");
				return;
			}
			const description = this.describe?.(value);
			if (description !== undefined) {
				append(description);
				return;
			}
			if (seen.has(value)) {
				append("[Circular]");
				return;
			}
			seen.add(value);
			try {
				const array = Array.isArray(value);
				if (
					!array &&
					![Object.prototype, null].includes(Object.getPrototypeOf(value))
				) {
					append("[Object]");
					return;
				}
				append(array ? "[" : "{");
				const keys = array ? undefined : Object.keys(value);
				const count = array ? value.length : (keys?.length ?? 0);
				for (let index = 0; index < count; index++) {
					if (
						visited >= this.limits.maxFormatNodes ||
						text.length >= this.limits.maxEntryCodeUnits
					) {
						truncated = true;
						append("…");
						break;
					}
					if (index) append(", ");
					const key = keys?.[index] ?? String(index);
					if (!array) {
						append(JSON.stringify(key.slice(0, this.limits.maxEntryCodeUnits)));
						append(": ");
						if (key.length > this.limits.maxEntryCodeUnits) truncated = true;
					}
					const descriptor = Object.getOwnPropertyDescriptor(value, key);
					if (!descriptor) append("[empty]");
					else if ("value" in descriptor)
						format(descriptor.value, depth + 1, true);
					else {
						append("[Getter]");
						visited++;
					}
				}
				append(array ? "]" : "}");
			} finally {
				seen.delete(value);
			}
		};
		for (
			let index = 0;
			index < Math.min(args.length, this.limits.maxArguments);
			index++
		) {
			if (index) append(" ");
			try {
				format(args[index], 0);
			} catch {
				append("[Uninspectable]");
			}
			if (text.length >= this.limits.maxEntryCodeUnits) {
				if (index + 1 < args.length) truncated = true;
				break;
			}
		}
		if (args.length > this.limits.maxArguments) truncated = true;
		if (truncated)
			text = `${text.slice(0, this.limits.maxEntryCodeUnits - 1)}…`;
		const entry = {
			sequence: ++this.sequence,
			timeMs: Date.now(),
			level,
			source,
			text,
			truncated,
		};
		this.entries.push(entry);
		this.codeUnits += text.length;
		while (
			this.entries.length > this.limits.maxEntries ||
			this.codeUnits > this.limits.maxCodeUnits
		) {
			const removed = this.entries.shift();
			if (removed) {
				this.codeUnits -= removed.text.length;
				this.dropped++;
			}
		}
	}

	read(minLevel = "info") {
		this.ensureOpen();
		const rank = levelRank(minLevel);
		return {
			partial: true as const,
			started: true,
			sequence: this.sequence,
			entries: this.entries
				.filter((entry) => ranks[entry.level] >= rank)
				.map((entry) => ({ ...entry })),
			dropped: this.dropped,
			cleared: this.cleared,
			codeUnits: this.codeUnits,
			limits: this.limits,
		};
	}
	clear() {
		this.ensureOpen();
		this.entries = [];
		this.codeUnits = 0;
		this.cleared++;
	}
	close() {
		this.closed = true;
		this.entries = [];
		this.codeUnits = 0;
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Console buffer is closed");
	}
}

const pageConsoles = new WeakMap<DocumentTree, ConsoleBuffer>();

export function recordPageTraversalError(tree: DocumentTree, code: ErrorCode) {
	tree.get(tree.root);
	pageConsoles
		.get(tree)
		?.write("error", [`Page navigation failed: ${code}`], "navigation");
}
export type PageConsoleSnapshot = ReturnType<ConsoleBuffer["read"]> & {
	document: string;
	url: string;
};
export function readPageConsole(
	tree: DocumentTree,
	minLevel = "info",
): PageConsoleSnapshot {
	const document = tree.reference(tree.root);
	const buffer = pageConsoles.get(tree);
	const snapshot = buffer
		? buffer.read(minLevel)
		: { ...new ConsoleBuffer().read(minLevel), started: false };
	return { ...snapshot, document, url: tree.url };
}

export class PageConsole {
	readonly object: object;
	readonly buffer: ConsoleBuffer;
	constructor(
		tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		options: {
			limits?: Partial<ConsoleLimits>;
			isClosed: () => boolean;
			onCall?: () => void;
			describe?: (value: object) => string | undefined;
		},
	) {
		tree.get(tree.root);
		if (pageConsoles.has(tree))
			throw new AgentBrowserError(
				"invalid-input",
				"Document console is already owned",
			);
		this.buffer = new ConsoleBuffer(options.limits, options.describe);
		const ensure = () => {
			tree.get(tree.root);
			if (options.isClosed())
				throw new AgentBrowserError("closed", "Page console is closed");
			options.onCall?.();
		};
		const write = (level: ConsoleLevel, args: readonly unknown[]) => {
			ensure();
			this.buffer.write(level, args);
		};
		this.object = factory.createHostObject({
			methods: {
				log: (...args) => write("log", args),
				info: (...args) => write("info", args),
				debug: (...args) => write("debug", args),
				warn: (...args) => write("warning", args),
				error: (...args) => write("error", args),
				dir: (...args) => write("log", args),
				assert: (condition, ...args) => {
					ensure();
					if (!condition)
						this.buffer.write("error", ["Assertion failed:", ...args]);
				},
				clear: () => {
					ensure();
					this.buffer.clear();
				},
			},
		});
		tree.onClose(() => {
			this.buffer.close();
			pageConsoles.delete(tree);
		});
		pageConsoles.set(tree, this.buffer);
	}
}
