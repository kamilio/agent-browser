import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export interface DocumentResourceLimits {
	maxDocuments: number;
	maxNodes: number;
	maxTextCodeUnits: number;
}

export class DocumentResources {
	readonly limits: Readonly<DocumentResourceLimits>;
	private readonly documents = new Set<DocumentTree>();
	private closed = false;

	constructor(limits: Partial<DocumentResourceLimits> = {}) {
		this.limits = Object.freeze({
			maxDocuments: limits.maxDocuments ?? 16,
			maxNodes: limits.maxNodes ?? 50_000,
			maxTextCodeUnits: limits.maxTextCodeUnits ?? 2_000_000,
		});
		for (const value of Object.values(this.limits))
			if (!Number.isSafeInteger(value) || value < 1)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid document resource limit",
				);
		if (this.limits.maxDocuments > 16)
			throw new AgentBrowserError(
				"invalid-input",
				"At most 16 documents may share resources",
			);
	}

	register(tree: DocumentTree): () => void {
		this.ensureOpen();
		if (this.documents.has(tree))
			throw new AgentBrowserError(
				"invalid-input",
				"Document already shares resources",
			);
		if (this.documents.size >= this.limits.maxDocuments)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared document count limit exceeded",
			);
		const usage = tree.resourceUsage();
		this.check(usage.nodes, usage.textCodeUnits);
		this.documents.add(tree);
		return () => {
			this.documents.delete(tree);
		};
	}

	check(nodes = 0, textCodeUnits = 0) {
		this.ensureOpen();
		if (
			!Number.isSafeInteger(nodes) ||
			nodes < 0 ||
			!Number.isSafeInteger(textCodeUnits)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document resource change",
			);
		const usage = this.metrics();
		if (nodes > this.limits.maxNodes - usage.nodes)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared document node limit exceeded",
			);
		if (textCodeUnits > this.limits.maxTextCodeUnits - usage.textCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Shared document text limit exceeded",
			);
	}

	metrics() {
		let nodes = 0;
		let textCodeUnits = 0;
		for (const document of this.documents) {
			const usage = document.resourceUsage();
			nodes += usage.nodes;
			textCodeUnits += usage.textCodeUnits;
		}
		return Object.freeze({
			documents: this.documents.size,
			nodes,
			textCodeUnits,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		const documents = [...this.documents];
		this.documents.clear();
		const failures: unknown[] = [];
		for (const document of documents) {
			try {
				document.close();
			} catch (error) {
				failures.push(error);
			}
		}
		if (failures.length)
			throw new AggregateError(failures, "Shared document cleanup failed");
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document resources are closed");
	}
}
