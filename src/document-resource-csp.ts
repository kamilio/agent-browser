import { ContentSecurityPolicy } from "./content-security-policy.js";
import type { DocumentScriptCsp } from "./document-script-csp.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

const resourceDirectives = new Set([
	"default-src",
	"img-src",
	"style-src",
	"style-src-elem",
	"style-src-attr",
	"connect-src",
	"font-src",
	"media-src",
	"frame-src",
	"object-src",
	"upgrade-insecure-requests",
]);
const owners = new WeakMap<DocumentTree, DocumentResourceCsp>();

function supportedSource(source: string, style: boolean): boolean {
	if (source.length > 4096) return false;
	const folded = source.toLowerCase();
	if (
		["'self'", "'none'", "*"].includes(folded) ||
		(style && folded === "'unsafe-inline'")
	)
		return true;
	if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return true;
	const host =
		/^(?:(?:https?|wss?):\/\/)?(?:\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\*|[0-9]+))?(\/[a-z0-9._~!$&'()*+=:@%/-]*)?$/i.exec(
			source,
		);
	return (
		!!host &&
		(host[1] === undefined || host[1] === "*" || Number(host[1]) <= 65535) &&
		!(host[2] && /%(?![0-9a-f]{2})/i.test(host[2]))
	);
}

function valuesFrom(headers: unknown): string[] {
	if (!headers || typeof headers !== "object" || Array.isArray(headers))
		throw new AgentBrowserError(
			"policy-denied",
			"Invalid resource CSP headers",
		);
	const values: string[] = [];
	const names = Object.getOwnPropertyNames(headers);
	if (names.length > 64)
		throw new AgentBrowserError("resource-limit", "CSP header limit");
	let units = 0;
	for (const name of names) {
		if (name.length !== 23 || name.toLowerCase() !== "content-security-policy")
			continue;
		const descriptor = Object.getOwnPropertyDescriptor(headers, name);
		const entries: unknown = descriptor?.value;
		if (
			!descriptor ||
			!Object.hasOwn(descriptor, "value") ||
			!Array.isArray(entries) ||
			!entries.length ||
			entries.length > 64 - values.length
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Invalid resource CSP values",
			);
		for (let index = 0; index < entries.length; index++) {
			const entry = Object.getOwnPropertyDescriptor(entries, String(index));
			if (
				!entry ||
				!Object.hasOwn(entry, "value") ||
				typeof entry.value !== "string"
			)
				throw new AgentBrowserError(
					"policy-denied",
					"Invalid resource CSP value",
				);
			units += entry.value.length;
			if (units > 32768)
				throw new AgentBrowserError("resource-limit", "CSP text limit");
			values.push(entry.value);
		}
	}
	return values;
}

export class DocumentResourceCsp {
	readonly signal: AbortSignal;
	readonly secureOnly: boolean;
	readonly supported: boolean;
	readonly present: boolean;
	private readonly controller = new AbortController();
	private readonly values: readonly string[];
	private readonly matchers: Record<
		"image" | "style" | "connect",
		ContentSecurityPolicy
	>;
	private policy?: DocumentScriptCsp;
	private readonly inline = { element: true, attribute: true };
	private unsubscribe?: () => void;

	constructor(
		private readonly tree: DocumentTree,
		headers: unknown,
	) {
		this.values = Object.freeze(valuesFrom(headers));
		this.signal = this.controller.signal;
		let secureOnly = false;
		let supported = true;
		let present = false;
		let directives = 0;
		let policies = 0;
		let sources = 0;
		for (const value of this.values) {
			if (/[^\t\x20-\xff]|\x7f/.test(value)) supported = false;
			for (const serialized of value.split(",")) {
				if (++policies > 64)
					throw new AgentBrowserError("resource-limit", "CSP policy limit");
				const names = new Map<string, string[]>();
				for (const token of serialized.split(";")) {
					if (++directives > 1024)
						throw new AgentBrowserError(
							"resource-limit",
							"CSP directive limit",
						);
					const trimmed = token.replace(/^[\t ]+|[\t ]+$/g, "");
					if (!trimmed) continue;
					const [raw, ...expressions] = trimmed.split(/[\t ]+/);
					sources += expressions.length;
					if (sources > 4096)
						throw new AgentBrowserError("resource-limit", "CSP source limit");
					const name = raw.toLowerCase();
					if (names.has(name)) continue;
					names.set(name, expressions);
					if (!resourceDirectives.has(name)) continue;
					present = true;
					if (name === "upgrade-insecure-requests") {
						secureOnly = true;
						if (expressions.length) supported = false;
					} else if (
						name === "object-src" &&
						(expressions.length !== 1 ||
							expressions[0].toLowerCase() !== "'none'")
					)
						supported = false;
					else if (
						name !== "default-src" &&
						expressions.some(
							(source) =>
								!supportedSource(source, name.startsWith("style-src")),
						)
					)
						supported = false;
				}
				for (const [destination, kind] of [
					["style-src-elem", "element"],
					["style-src-attr", "attribute"],
				] as const) {
					const effective =
						names.get(destination) ??
						names.get("style-src") ??
						names.get("default-src");
					if (effective) {
						if (
							effective.some((source) =>
								/^'(?:nonce-|sha(?:256|384|512)-)/i.test(source),
							)
						)
							supported = false;
						if (
							!effective.some(
								(source) => source.toLowerCase() === "'unsafe-inline'",
							)
						)
							this.inline[kind] = false;
					}
				}
			}
		}
		this.secureOnly = secureOnly;
		this.supported = supported;
		this.present = present;
		this.matchers = {
			image: new ContentSecurityPolicy(tree.url, this.values, "image"),
			style: new ContentSecurityPolicy(tree.url, this.values, "style"),
			connect: new ContentSecurityPolicy(tree.url, this.values, "connect"),
		};
		tree.onClose(() => this.close());
	}

	matches(headers: unknown): boolean {
		const values = valuesFrom(headers);
		return (
			values.length === this.values.length &&
			values.every((value, index) => value === this.values[index])
		);
	}

	supportsDirective(name: string): boolean {
		return (
			this.supported && !this.signal.aborted && resourceDirectives.has(name)
		);
	}

	attach(policy: DocumentScriptCsp): void {
		if (this.policy)
			throw new AgentBrowserError(
				"policy-denied",
				"Resource CSP already attached",
			);
		this.policy = policy;
		this.unsubscribe = policy.onInvalidated(() => this.close());
	}

	get active(): boolean {
		return (
			this.supported &&
			!this.signal.aborted &&
			this.policy !== undefined &&
			!this.policy.unsupported
		);
	}

	allowsInline(kind: "element" | "attribute"): boolean {
		return this.active && this.inline[kind];
	}

	checkSecure(url: string): void {
		if (url.length > 4096)
			throw new AgentBrowserError("resource-limit", "CSP URL limit");
		const target = new URL(url);
		if (
			this.secureOnly &&
			target.protocol !== "https:" &&
			target.protocol !== "wss:"
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Resource CSP requires a secure URL; upgrading is not implemented",
			);
	}

	check(
		destination: "image" | "style" | "connect" | "script",
		url: string,
		redirects = 0,
	): void {
		if (
			!this.supported ||
			this.signal.aborted ||
			!this.policy ||
			this.policy.unsupported
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Document resource CSP is unavailable",
			);
		this.tree.get(this.tree.root);
		if (!Number.isSafeInteger(redirects) || redirects < 0 || redirects > 20)
			throw new AgentBrowserError(
				"policy-denied",
				"Invalid resource redirect count",
			);
		this.checkSecure(url);
		if (
			destination !== "script" &&
			!this.matchers[destination].allows(url, redirects)
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Resource blocked by Content Security Policy",
			);
	}

	close(): void {
		if (this.signal.aborted) return;
		this.controller.abort(
			new AgentBrowserError(
				"policy-denied",
				"Document resource CSP invalidated",
			),
		);
		this.unsubscribe?.();
		try {
			this.tree.invalidatePresentation();
		} catch {}
	}
}

export function bindDocumentResourceCsp(
	tree: DocumentTree,
	headers: unknown,
): DocumentResourceCsp | undefined {
	const existing = owners.get(tree);
	if (existing) {
		if (!existing.matches(headers))
			throw new AgentBrowserError(
				"policy-denied",
				"Document resource CSP does not match headers",
			);
		return existing;
	}
	const policy = new DocumentResourceCsp(tree, headers);
	if (!policy.present) return undefined;
	owners.set(tree, policy);
	return policy;
}

export function documentResourceCsp(
	tree: DocumentTree,
): DocumentResourceCsp | undefined {
	return owners.get(tree);
}
