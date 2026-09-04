import type { DocumentTree } from "./document.js";
import { firstDetailsSummary } from "./details.js";
import { AgentBrowserError } from "./errors.js";

export interface GeneratedControlTarget {
	readonly kind: "details-summary";
	readonly ref: string;
	readonly owner: number;
	readonly label: string;
}

export const generatedControlLimits = Object.freeze({ maxTargets: 4096 });

export class DocumentGeneratedControls {
	private readonly targets = new Map<number, GeneratedControlTarget>();
	private readonly references = new Map<string, GeneratedControlTarget>();
	private closed = false;
	private readonly unregisterClose: () => void;

	constructor(
		private readonly tree: DocumentTree,
		private readonly maxTargets: number = generatedControlLimits.maxTargets,
	) {
		if (
			!Number.isSafeInteger(maxTargets) ||
			maxTargets < 1 ||
			maxTargets > generatedControlLimits.maxTargets
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid generated control limit",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	detailsSummary(owner: number): GeneratedControlTarget | undefined {
		this.ensureOpen();
		const node = this.tree.get(owner);
		if (
			node.tagName !== "details" ||
			!this.tree.isConnected(owner) ||
			firstDetailsSummary(this.tree, node) !== null
		)
			return;
		let target = this.targets.get(owner);
		if (!target) {
			if (this.targets.size >= this.maxTargets)
				throw new AgentBrowserError(
					"resource-limit",
					"Generated control target limit exceeded",
				);
			target = Object.freeze({
				kind: "details-summary",
				ref: `u${this.tree.root}-details-${owner}`,
				owner,
				label: "Details",
			});
			this.targets.set(owner, target);
			this.references.set(target.ref, target);
		}
		return target;
	}

	resolve(reference: string): GeneratedControlTarget {
		this.ensureOpen();
		if (
			typeof reference !== "string" ||
			reference.length > 80 ||
			!/^u[1-9][0-9]*-details-[1-9][0-9]*$/.test(reference)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid generated control reference",
			);
		const target = this.references.get(reference);
		if (!target || this.detailsSummary(target.owner) !== target)
			throw new AgentBrowserError(
				"stale-reference",
				"Generated control is no longer available",
			);
		return target;
	}

	metrics() {
		return Object.freeze({
			targets: this.targets.size,
			maxTargets: this.maxTargets,
			closed: this.closed,
		});
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		this.targets.clear();
		this.references.clear();
		this.unregisterClose();
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Generated controls are closed");
		this.tree.get(this.tree.root);
	}
}

const owners = new WeakMap<DocumentTree, DocumentGeneratedControls>();
export function documentGeneratedControls(tree: DocumentTree) {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentGeneratedControls(tree);
		owners.set(tree, owner);
	}
	return owner;
}
