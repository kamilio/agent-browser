import { createHash, randomBytes } from "node:crypto";
import { AgentBrowserError } from "./errors.js";

interface Pairing {
	id: string;
	code: string;
	expiresAt: number;
	token?: string;
}

export class PlaygroundAuth {
	private pairs = new Map<string, Pairing>();
	private tokens = new Map<string, number>();
	private closed = false;

	constructor(private readonly now: () => number = Date.now) {}

	start() {
		this.prune();
		if (this.pairs.size >= 8)
			throw new AgentBrowserError(
				"resource-limit",
				"Too many pending playground connections",
			);
		const pair = {
			id: randomBytes(24).toString("base64url"),
			code: randomBytes(4).toString("hex").toUpperCase(),
			expiresAt: this.now() + 90_000,
		};
		if (
			[...this.pairs.values()].some((existing) => existing.code === pair.code)
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Pairing code collision; try again",
			);
		this.pairs.set(pair.id, pair);
		return { ...pair };
	}

	approve(code: unknown) {
		this.prune();
		if (typeof code !== "string" || !/^[a-f0-9]{8}$/i.test(code))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid playground pairing code",
			);
		const pair = [...this.pairs.values()].find(
			(candidate) => candidate.code === code.toUpperCase(),
		);
		if (!pair)
			throw new AgentBrowserError(
				"not-found",
				"Pairing request expired or unknown",
			);
		if (!pair.token) {
			if (this.tokens.size >= 8)
				throw new AgentBrowserError(
					"resource-limit",
					"Too many connected playground windows",
				);
			pair.token = randomBytes(32).toString("base64url");
			this.tokens.set(this.hash(pair.token), this.now() + 1_800_000);
		}
		return { approved: true as const };
	}

	poll(id: unknown) {
		this.prune();
		if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{32}$/.test(id))
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid playground pairing handle",
			);
		const pair = this.pairs.get(id);
		if (!pair)
			throw new AgentBrowserError(
				"not-found",
				"Pairing request expired or unknown",
			);
		if (!pair.token)
			return { approved: false as const, expiresAt: pair.expiresAt };
		this.pairs.delete(id);
		return {
			approved: true as const,
			token: pair.token,
			expiresAt: this.tokens.get(this.hash(pair.token)) as number,
		};
	}

	authorize(token: string) {
		this.prune();
		return (
			/^[a-zA-Z0-9_-]{43}$/.test(token) && this.tokens.has(this.hash(token))
		);
	}

	revoke(token: string) {
		this.prune();
		return this.tokens.delete(this.hash(token));
	}

	metrics() {
		if (!this.closed) this.prune();
		return {
			pending: this.pairs.size,
			connected: this.tokens.size,
			closed: this.closed,
		};
	}

	close() {
		this.closed = true;
		this.pairs.clear();
		this.tokens.clear();
	}

	private hash(token: string) {
		return createHash("sha256").update(token).digest("hex");
	}

	private prune() {
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"Playground authentication is closed",
			);
		const now = this.now();
		for (const [id, pair] of this.pairs)
			if (pair.expiresAt <= now) {
				this.pairs.delete(id);
				if (pair.token) this.tokens.delete(this.hash(pair.token));
			}
		for (const [token, expires] of this.tokens)
			if (expires <= now) this.tokens.delete(token);
	}
}
