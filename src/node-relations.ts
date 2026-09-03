import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export const nodePositionConstants = Object.freeze({
	DOCUMENT_POSITION_DISCONNECTED: 1,
	DOCUMENT_POSITION_PRECEDING: 2,
	DOCUMENT_POSITION_FOLLOWING: 4,
	DOCUMENT_POSITION_CONTAINS: 8,
	DOCUMENT_POSITION_CONTAINED_BY: 16,
	DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32,
});

export interface NodeRelationLimits {
	maxWork: number;
	maxDepth: number;
	maxCodeUnits: number;
}

export const nodeRelationLimits: Readonly<NodeRelationLimits> = Object.freeze({
	maxWork: 100_000,
	maxDepth: 1024,
	maxCodeUnits: 8_000_000,
});

export const nodeRelationCapabilities = Object.freeze({
	partial: true,
	methods: ["contains", "compareDocumentPosition", "isSameNode", "isEqualNode"],
	attributeNodes: true,
	constantExposure: "node-instances",
	namespaces: false,
	shadowTrees: false,
	...nodeRelationLimits,
});

interface Identity {
	owner: NodeRelations;
	id: number;
	attribute: boolean;
}

const identities = new WeakMap<object, Identity>();

class Budget {
	private work = 0;
	private codeUnits = 0;
	constructor(private readonly limits: typeof nodeRelationLimits) {}
	visit(count = 1) {
		this.work += count;
		if (this.work > this.limits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Node comparison work limit exceeded",
			);
	}
	depth(value: number) {
		if (value > this.limits.maxDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Node comparison depth limit exceeded",
			);
	}
	text(first: string, second: string) {
		this.codeUnits += first.length + second.length;
		if (this.codeUnits > this.limits.maxCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Node comparison text limit exceeded",
			);
		return first === second;
	}
}

function same(first: Identity, second: Identity) {
	return (
		first.owner.tree === second.owner.tree &&
		first.id === second.id &&
		first.attribute === second.attribute
	);
}

function path(identity: Identity, id: number, budget: Budget) {
	const result: number[] = [];
	let current: number | null = id;
	while (current !== null) {
		budget.visit();
		budget.depth(result.length + 1);
		result.push(current);
		current = identity.owner.tree.get(current).parent;
	}
	return result;
}

function compare(first: Identity, second: Identity, budget: Budget): number {
	if (same(first, second)) return 0;
	const firstAttribute = first.attribute
		? first.owner.tree.getAttributeRecord(first.id)
		: null;
	const secondAttribute = second.attribute
		? second.owner.tree.getAttributeRecord(second.id)
		: null;
	const firstId = firstAttribute ? firstAttribute.ownerElement : first.id;
	const secondId = secondAttribute ? secondAttribute.ownerElement : second.id;
	const sameDocument = first.owner.tree === second.owner.tree;
	if (
		sameDocument &&
		firstId !== null &&
		firstId === secondId &&
		firstAttribute &&
		secondAttribute
	) {
		for (const name in first.owner.tree.get(firstId).attributes) {
			budget.visit();
			if (budget.text(name, secondAttribute.name)) return 34;
			if (budget.text(name, firstAttribute.name)) return 36;
		}
	}
	const firstPath =
		firstId === null ? [first.id] : path(first, firstId, budget);
	const secondPath =
		secondId === null ? [second.id] : path(second, secondId, budget);
	if (firstPath.at(-1) !== secondPath.at(-1))
		return (
			33 |
			((secondPath.at(-1) as number) < (firstPath.at(-1) as number) ? 2 : 4)
		);
	let firstIndex = firstPath.length - 1;
	let secondIndex = secondPath.length - 1;
	while (
		firstIndex >= 0 &&
		secondIndex >= 0 &&
		firstPath[firstIndex] === secondPath[secondIndex]
	) {
		budget.visit();
		firstIndex--;
		secondIndex--;
	}
	if (firstIndex === -1 && secondIndex === -1) return firstAttribute ? 10 : 20;
	if (secondIndex === -1) return secondAttribute ? 2 : 10;
	if (firstIndex === -1) return firstAttribute ? 4 : 20;
	const siblings = first.owner.tree.get(firstPath[firstIndex + 1]).children;
	for (const sibling of siblings) {
		budget.visit();
		if (sibling === secondPath[secondIndex]) return 2;
		if (sibling === firstPath[firstIndex]) return 4;
	}
	throw new AgentBrowserError(
		"invalid-input",
		"Inconsistent node comparison tree",
	);
}

function equal(first: Identity, second: Identity, budget: Budget): boolean {
	if (same(first, second)) return true;
	if (first.attribute !== second.attribute) return false;
	if (first.attribute) {
		const firstValue = first.owner.tree.getAttributeRecord(first.id);
		const secondValue = second.owner.tree.getAttributeRecord(second.id);
		return (
			budget.text(firstValue.name, secondValue.name) &&
			budget.text(firstValue.value, secondValue.value)
		);
	}
	const stack: { firstId: number; secondId: number; child: number }[] = [
		{ firstId: first.id, secondId: second.id, child: -1 },
	];
	while (stack.length) {
		budget.visit();
		const frame = stack[stack.length - 1];
		const firstNode = first.owner.tree.get(frame.firstId);
		const secondNode = second.owner.tree.get(frame.secondId);
		if (frame.child === -1) {
			if (
				firstNode.kind !== secondNode.kind ||
				firstNode.children.length !== secondNode.children.length
			)
				return false;
			if (firstNode.kind === "element") {
				if (!budget.text(firstNode.tagName, secondNode.tagName)) return false;
				let firstCount = 0;
				let secondCount = 0;
				for (const name in firstNode.attributes) {
					budget.visit();
					firstCount++;
					budget.text(name, name);
					if (
						!Object.hasOwn(secondNode.attributes, name) ||
						!budget.text(
							firstNode.attributes[name],
							secondNode.attributes[name],
						)
					)
						return false;
				}
				for (const name in secondNode.attributes) {
					budget.visit();
					if (Object.hasOwn(secondNode.attributes, name)) secondCount++;
				}
				if (firstCount !== secondCount) return false;
			} else if (
				(firstNode.kind === "text" || firstNode.kind === "comment") &&
				!budget.text(firstNode.data, secondNode.data)
			)
				return false;
			frame.child = 0;
		}
		if (frame.child === firstNode.children.length) stack.pop();
		else {
			budget.depth(stack.length + 1);
			stack.push({
				firstId: firstNode.children[frame.child],
				secondId: secondNode.children[frame.child],
				child: -1,
			});
			frame.child++;
		}
	}
	return true;
}

export class NodeRelations {
	private closed = false;
	readonly limits: typeof nodeRelationLimits;
	constructor(
		readonly tree: DocumentTree,
		limits: Partial<typeof nodeRelationLimits> = {},
	) {
		this.limits = Object.freeze({ ...nodeRelationLimits, ...limits });
		for (const name of Object.keys(
			nodeRelationLimits,
		) as (keyof typeof nodeRelationLimits)[]) {
			const value = this.limits[name];
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value > nodeRelationLimits[name]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid node comparison limits",
				);
		}
	}
	register(object: object, id: number, attribute = false) {
		this.ensureOpen();
		if (attribute) this.tree.getAttributeRecord(id);
		else this.tree.get(id);
		identities.set(object, { owner: this, id, attribute });
	}
	close() {
		this.closed = true;
	}
	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Node comparisons are closed");
		this.tree.get(this.tree.root);
	}
	definition(
		id: number,
		attribute = false,
	): Required<Pick<ScriptHostObjectDefinition, "properties" | "methods">> {
		const self: Identity = { owner: this, id, attribute };
		const operand = (args: readonly unknown[], nullable: boolean) => {
			this.ensureOpen();
			if (args.length === 0)
				throw new TypeError("Node comparison requires an argument");
			if (nullable && args[0] == null) return null;
			const other =
				args[0] !== null && typeof args[0] === "object"
					? identities.get(args[0])
					: undefined;
			if (!other) throw new TypeError("Node comparison requires a node");
			other.owner.ensureOpen();
			return other;
		};
		return {
			properties: Object.fromEntries(
				Object.entries(nodePositionConstants).map(([name, value]) => [
					name,
					{
						get: () => {
							this.ensureOpen();
							return value;
						},
					},
				]),
			),
			methods: {
				isSameNode: (...args) => {
					const other = operand(args, true);
					return other !== null && same(self, other);
				},
				isEqualNode: (...args) => {
					const other = operand(args, true);
					return other !== null && equal(self, other, new Budget(this.limits));
				},
				compareDocumentPosition: (...args) =>
					compare(
						self,
						operand(args, false) as Identity,
						new Budget(this.limits),
					),
				contains: (...args) => {
					const other = operand(args, true);
					if (other === null) return false;
					if (same(self, other)) return true;
					if (attribute || other.attribute || other.owner.tree !== this.tree)
						return false;
					const budget = new Budget(this.limits);
					let current: number | null = other.id;
					while (current !== null) {
						budget.visit();
						if (current === id) return true;
						current = this.tree.get(current).parent;
					}
					return false;
				},
			},
		};
	}
}
