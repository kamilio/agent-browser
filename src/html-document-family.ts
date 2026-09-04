import { DocumentResources } from "./document-resources.js";
import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface DocumentOrigin {
	readonly serialized: string;
	readonly opaque: boolean;
}

const origins = new WeakMap<DocumentTree, DocumentOrigin>();
const templateFamilies = new WeakMap<DocumentTree, HtmlDocumentFamily>();
const contexts = new WeakMap<
	DocumentTree,
	Readonly<{
		family: HtmlDocumentFamily;
		origin: DocumentOrigin;
		contentType: "text/html";
		encoding: "UTF-8";
		compatMode: "CSS1Compat";
	}>
>();

export function documentOrigin(tree: DocumentTree): DocumentOrigin {
	tree.get(tree.root);
	let origin = origins.get(tree);
	if (!origin) {
		const serialized = new URL(tree.url).origin;
		origin = Object.freeze({ serialized, opaque: serialized === "null" });
		origins.set(tree, origin);
	}
	return origin;
}

export function htmlDocumentContext(tree: DocumentTree) {
	return contexts.get(tree);
}

export function htmlDocumentFamily(tree: DocumentTree) {
	return contexts.get(tree)?.family ?? templateFamilies.get(tree);
}

export class HtmlDocumentFamily {
	private readonly resources: DocumentResources;
	private readonly unregisterClose: () => void;
	private attempts = 0;
	private closed = false;

	constructor(private readonly creator: DocumentTree) {
		if (htmlDocumentFamily(creator))
			throw new AgentBrowserError(
				"invalid-input",
				"Auxiliary documents must share their existing family",
			);
		documentOrigin(creator);
		this.resources = new DocumentResources({
			maxNodes: creator.limits.maxNodes,
			maxTextCodeUnits: creator.limits.maxTextCodeUnits,
		});
		this.unregisterClose = creator.onClose(() => this.close());
	}

	attachTemplate(creator: DocumentTree, template: number): DocumentTree {
		this.ensureCaller(creator);
		const owner = creator.templateContent(template).tree;
		const existing = htmlDocumentFamily(owner);
		if (existing && existing !== this)
			throw new AgentBrowserError(
				"invalid-input",
				"Template contents already belong to another family",
			);
		if (!existing) {
			templateFamilies.set(owner, this);
			owner.onClose(() => templateFamilies.delete(owner));
		}
		return owner;
	}

	create(
		title: string | undefined,
		publish: (tree: DocumentTree) => object,
		creator = this.creator,
	): object {
		this.ensureCaller(creator);
		if (
			(title !== undefined && typeof title !== "string") ||
			typeof publish !== "function"
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid HTML document creation arguments",
			);
		if (this.attempts >= 16)
			throw new AgentBrowserError(
				"resource-limit",
				"HTML document creation limit exceeded",
			);
		this.attempts++;
		const origin = documentOrigin(creator);
		const titled = title !== undefined;
		if (this.creator.limits.maxDepth < (titled ? 4 : 2))
			throw new AgentBrowserError(
				"resource-limit",
				"HTML document depth limit exceeded",
			);
		this.resources.check(titled ? 7 : 5, titled ? 21 + title.length : 16);
		const tree = new DocumentTree(
			"about:blank",
			this.creator.limits,
			this.resources,
		);
		try {
			tree.append(tree.root, tree.createDocumentType("html"));
			const html = tree.createElement("html");
			tree.append(tree.root, html);
			const head = tree.createElement("head");
			tree.append(html, head);
			if (title !== undefined) {
				const element = tree.createElement("title");
				tree.append(head, element);
				tree.append(element, tree.createText(title));
			}
			tree.append(html, tree.createElement("body"));
			origins.set(tree, origin);
			contexts.set(
				tree,
				Object.freeze({
					family: this,
					origin,
					contentType: "text/html",
					encoding: "UTF-8",
					compatMode: "CSS1Compat",
				}),
			);
			tree.onClose(() => {
				contexts.delete(tree);
				origins.delete(tree);
			});
			const capability = publish(tree);
			this.ensureCaller(creator);
			tree.get(tree.root);
			if (capability === null || typeof capability !== "object")
				throw new AgentBrowserError(
					"unsupported",
					"HTML document publication requires an object",
				);
			return capability;
		} catch (error) {
			try {
				tree.close();
			} catch (cleanup) {
				throw new AggregateError(
					[error, cleanup],
					"HTML document creation cleanup failed",
				);
			}
			throw error;
		}
	}

	metrics() {
		return Object.freeze({
			attempts: this.attempts,
			...this.resources.metrics(),
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
		this.resources.close();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "HTML document family is closed");
		this.creator.get(this.creator.root);
	}

	private ensureCaller(creator: DocumentTree) {
		this.ensureOpen();
		creator.get(creator.root);
		if (creator !== this.creator && htmlDocumentFamily(creator) !== this)
			throw new AgentBrowserError(
				"invalid-input",
				"HTML document caller is outside this family",
			);
	}
}
