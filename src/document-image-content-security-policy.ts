import type { DocumentChange, DocumentTree } from "./document.js";
import { ContentSecurityPolicy } from "./content-security-policy.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { ImageContentSecurityPolicy } from "./image-content-security-policy.js";
import type { NetworkResponse } from "./network.js";

export function imageContentSecurityPolicyValues(
	headers: NetworkResponse["headers"],
): string[] {
	return Object.entries(headers)
		.filter(([name]) => name.toLowerCase() === "content-security-policy")
		.flatMap(([, values]) => values);
}

export class DocumentImageContentSecurityPolicy {
	private policy?: ImageContentSecurityPolicy;
	private stylePolicy?: ContentSecurityPolicy;
	private headerValues: readonly string[];
	private readonly unregisterChange: () => void;
	private readonly unregisterClose: () => unknown;
	private metaBlocked = false;
	private scanWork = 0;
	private closed = false;
	private failure?: AgentBrowserError;
	private imageChange?: (change: Readonly<DocumentChange>) => void;

	constructor(
		private readonly tree: DocumentTree,
		headerValues: readonly string[],
	) {
		this.policy = new ImageContentSecurityPolicy(tree.url, headerValues);
		this.stylePolicy = new ContentSecurityPolicy(
			tree.url,
			headerValues,
			"style",
		);
		this.headerValues = Object.freeze([...headerValues]);
		this.scan(tree.root);
		this.unregisterChange = tree.onChange((change) => {
			this.changed(change);
			this.imageChange?.(change);
		});
		try {
			this.unregisterClose = tree.onClose(() => this.close());
		} catch (error) {
			this.unregisterChange();
			throw error;
		}
	}

	matches(headerValues: readonly string[]): boolean {
		this.ensureOpen();
		return (
			Array.isArray(headerValues) &&
			headerValues.length === this.headerValues.length &&
			headerValues.every((value, index) => value === this.headerValues[index])
		);
	}

	watchImages(handler: (change: Readonly<DocumentChange>) => void): () => void {
		this.ensureOpen();
		if (typeof handler !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid image change handler",
			);
		if (this.imageChange) return this.tree.onChange(handler);
		this.imageChange = handler;
		return () => {
			if (this.imageChange === handler) this.imageChange = undefined;
		};
	}

	check(url: string, redirectCount = 0): void {
		this.ensureOpen();
		if (this.failure) throw this.failure;
		if (this.metaBlocked)
			throw new AgentBrowserError(
				"policy-denied",
				"Meta image CSP enforcement is not implemented",
			);
		if (!this.policy?.allows(url, redirectCount))
			throw new AgentBrowserError(
				"policy-denied",
				"Image blocked by Content Security Policy",
			);
	}

	checkStylesheet(url: string, redirectCount = 0): void {
		this.ensureOpen();
		if (this.failure) throw this.failure;
		if (this.metaBlocked)
			throw new AgentBrowserError(
				"policy-denied",
				"Meta stylesheet CSP enforcement is not implemented",
			);
		if (!this.stylePolicy?.allows(url, redirectCount))
			throw new AgentBrowserError(
				"policy-denied",
				"Stylesheet blocked by Content Security Policy",
			);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.unregisterChange();
		this.unregisterClose();
		this.policy = undefined;
		this.stylePolicy = undefined;
		this.headerValues = [];
		this.imageChange = undefined;
	}

	private ensureOpen(): void {
		if (this.closed)
			throw new AgentBrowserError("closed", "Image CSP owner is closed");
	}

	private debit(): void {
		if (++this.scanWork > 2_000_000)
			throw new AgentBrowserError(
				"resource-limit",
				"Image CSP metadata work limit exceeded",
			);
	}

	private scan(start: number): void {
		if (this.metaBlocked) return;
		let ancestor = this.tree.get(start);
		while (ancestor.parent !== null) {
			this.debit();
			ancestor = this.tree.get(ancestor.parent);
		}
		if (ancestor.id !== this.tree.root) return;
		for (const { node } of this.tree.walk(start)) {
			this.debit();
			if (
				isHtmlElement(node, "meta") &&
				node.attributes["http-equiv"]?.length ===
					"content-security-policy".length &&
				node.attributes["http-equiv"]?.toLowerCase() ===
					"content-security-policy"
			) {
				this.metaBlocked = true;
				return;
			}
		}
	}

	private changed(change: Readonly<DocumentChange>): void {
		if (
			this.closed ||
			this.failure ||
			this.metaBlocked ||
			!["insert", "attribute"].includes(change.kind)
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
			this.failure =
				error instanceof AgentBrowserError
					? error
					: new AgentBrowserError(
							"policy-denied",
							"Image CSP metadata processing failed",
						);
		}
	}
}

const owners = new WeakMap<DocumentTree, DocumentImageContentSecurityPolicy>();

export function documentImageContentSecurityPolicy(
	tree: DocumentTree,
	headerValues?: readonly string[],
): DocumentImageContentSecurityPolicy {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentImageContentSecurityPolicy(
			tree,
			headerValues === undefined ? [] : headerValues,
		);
		owners.set(tree, owner);
	} else if (headerValues !== undefined && !owner.matches(headerValues))
		throw new AgentBrowserError(
			"invalid-input",
			"Image CSP owner is already configured",
		);
	return owner;
}
