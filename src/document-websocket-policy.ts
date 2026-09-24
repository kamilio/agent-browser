import { ContentSecurityPolicy } from "./content-security-policy.js";
import { documentResourceCsp } from "./document-resource-csp.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentChange, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";

const maxUrlUnits = 4096;
const maxScanWork = 2_000_000;
const metaPolicyName = "content-security-policy";

function boundedUrl(value: string, base?: string): URL {
	if (value.length > maxUrlUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"WebSocket URL exceeds the length limit",
		);
	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		throw new AgentBrowserError("invalid-input", "Invalid WebSocket URL");
	}
	if (url.href.length > maxUrlUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Normalized WebSocket URL exceeds the length limit",
		);
	return url;
}

// Shared by document and Worker sockets; CSP remains owned by each context.
export function resolveWebSocketUrl(
	input: unknown,
	base: string,
	secure: boolean,
): URL {
	if (typeof input !== "string")
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket URL must be a string",
		);
	const url = boundedUrl(input, base);
	if (url.protocol === "http:") url.protocol = "ws:";
	else if (url.protocol === "https:") url.protocol = "wss:";
	if (url.protocol !== "ws:" && url.protocol !== "wss:")
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket URL must use ws or wss",
		);
	if (url.username || url.password || url.href.includes("#"))
		throw new AgentBrowserError(
			"invalid-input",
			"WebSocket URLs cannot contain credentials or fragments",
		);
	if (secure && url.protocol !== "wss:")
		throw new AgentBrowserError(
			"policy-denied",
			"HTTPS documents require secure WebSocket connections",
		);
	return url;
}

export class DocumentWebSocketPolicy {
	private readonly origin: string;
	private readonly secure: boolean;
	private policy?: ContentSecurityPolicy;
	private unregisterChange?: () => void;
	private unregisterClose?: () => unknown;
	private scanWork = 0;
	private failure?: AgentBrowserError;
	private closed = false;

	constructor(
		private readonly tree: DocumentTree,
		headerValues: readonly string[] = [],
	) {
		const owner = boundedUrl(tree.url);
		if (owner.protocol !== "http:" && owner.protocol !== "https:")
			throw new AgentBrowserError(
				"policy-denied",
				"WebSocket document must have an HTTP(S) origin",
			);
		this.origin = owner.origin;
		this.secure = owner.protocol === "https:";
		this.policy = new ContentSecurityPolicy(
			owner.href,
			headerValues,
			"connect",
		);
		try {
			this.scan(tree.root);
			if (this.failure) return;
			this.unregisterChange = tree.onChange((change) => this.changed(change));
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unregister();
			throw error;
		}
	}

	resolve(input: unknown): Readonly<{ url: string; origin: string }> {
		if (this.closed)
			throw new AgentBrowserError(
				"closed",
				"WebSocket document policy is closed",
			);
		this.tree.get(this.tree.root);
		if (this.failure) throw this.failure;
		if (typeof input !== "string")
			throw new AgentBrowserError(
				"invalid-input",
				"WebSocket URL must be a string",
			);
		if (input.length > maxUrlUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket URL exceeds the length limit",
			);
		const url = resolveWebSocketUrl(input, this.baseUrl(), this.secure);
		let allowed: boolean;
		documentResourceCsp(this.tree)?.check("connect", url.href);
		try {
			allowed = this.policy?.allows(url.href) === true;
		} catch (error) {
			this.fail(error);
			throw this.failure;
		}
		if (!allowed)
			throw new AgentBrowserError(
				"policy-denied",
				"WebSocket blocked by Content Security Policy",
			);
		return Object.freeze({ url: url.href, origin: this.origin });
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.unregister();
		this.policy = undefined;
	}

	private unregister(): void {
		this.unregisterChange?.();
		this.unregisterChange = undefined;
		this.unregisterClose?.();
		this.unregisterClose = undefined;
	}

	private fail(error: unknown): void {
		this.failure ??=
			error instanceof AgentBrowserError
				? error
				: new AgentBrowserError(
						"policy-denied",
						"WebSocket document policy processing failed",
					);
		this.unregister();
		this.policy = undefined;
	}

	private debit(): void {
		if (++this.scanWork > maxScanWork)
			throw new AgentBrowserError(
				"resource-limit",
				"WebSocket policy scan work limit exceeded",
			);
	}

	private baseUrl(): string {
		if (documentResourceCsp(this.tree))
			return boundedUrl(documentBaseUrl(this.tree)).href;
		try {
			const fallback = boundedUrl(this.tree.url).href;
			for (const { node } of this.tree.walk()) {
				this.debit();
				if (
					!isHtmlElement(node, "base") ||
					!Object.hasOwn(node.attributes, "href")
				)
					continue;
				try {
					const base = boundedUrl(node.attributes.href, fallback);
					return base.protocol === "data:" || base.protocol === "javascript:"
						? fallback
						: base.href;
				} catch (error) {
					if (
						error instanceof AgentBrowserError &&
						error.code === "invalid-input"
					)
						return fallback;
					throw error;
				}
			}
			return fallback;
		} catch (error) {
			this.fail(error);
			throw this.failure;
		}
	}

	private scan(start: number): void {
		let ancestor = start;
		let parent = this.tree.parentOf(ancestor);
		while (parent !== null) {
			this.debit();
			ancestor = parent;
			parent = this.tree.parentOf(ancestor);
		}
		if (ancestor !== this.tree.root) return;
		for (const { node } of this.tree.walk(start)) {
			this.debit();
			if (
				isHtmlElement(node, "meta") &&
				node.attributes["http-equiv"]?.length === metaPolicyName.length &&
				node.attributes["http-equiv"]?.toLowerCase() === metaPolicyName
			) {
				this.fail(
					new AgentBrowserError(
						"policy-denied",
						"Meta WebSocket CSP enforcement is not implemented",
					),
				);
				return;
			}
		}
	}

	private changed(change: Readonly<DocumentChange>): void {
		if (
			this.closed ||
			this.failure ||
			(change.kind !== "insert" && change.kind !== "attribute")
		)
			return;
		try {
			if (
				change.kind === "attribute" &&
				!isHtmlElement(this.tree.get(change.target), "meta")
			)
				return;
			this.scan(change.target);
		} catch (error) {
			this.fail(error);
		}
	}
}
