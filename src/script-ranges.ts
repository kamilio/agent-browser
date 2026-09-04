import type { ClientRectangle } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import {
	type DomRange,
	type DomRangeOwner,
	domRangeOwner,
} from "./dom-range.js";
import { AgentBrowserError } from "./errors.js";
import { rangeBoundingClientRect, rangeClientRects } from "./range-geometry.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";
import { scriptGeometryLimits } from "./script-geometry.js";
import { ScriptNodePublications } from "./script-node-publications.js";

function unsigned(value: unknown, bits = 32): number {
	if (
		(value !== null && typeof value === "object") ||
		["function", "symbol", "bigint"].includes(typeof value)
	)
		throw new AgentBrowserError(
			"unsupported",
			"Range numeric object/symbol/bigint coercion is unsupported",
		);
	const number = Number(value);
	const modulus = 2 ** bits;
	return Number.isFinite(number)
		? ((Math.trunc(number) % modulus) + modulus) % modulus
		: 0;
}

function required(args: readonly unknown[], count: number) {
	if (args.length < count)
		throw new TypeError("Not enough DOM range/selection arguments");
}

export class ScriptRanges {
	readonly owner: DomRangeOwner;
	private readonly publications: ScriptNodePublications;
	private readonly rangeObjects = new WeakMap<DomRange, object>();
	private readonly rangeIds = new WeakMap<DomRange, number>();
	private identities = new WeakMap<object, DomRange>();
	private nextId = 1;
	private geometryObjects = 0;
	private selectionObject?: object;

	constructor(
		tree: DocumentTree,
		factory: ScriptHostObjectFactory,
		private readonly bindings: {
			ensureOpen(): unknown;
			node(id: number): object;
			identify(value: unknown): number;
		},
	) {
		this.owner = domRangeOwner(tree);
		this.publications = new ScriptNodePublications(factory, () => {
			bindings.ensureOpen();
			this.owner.ensureOpen();
		});
	}

	createRange(): object {
		return this.range(this.owner.createRange());
	}

	getSelection(): object {
		this.bindings.ensureOpen();
		if (this.selectionObject) return this.selectionObject;
		const selection = this.owner.selection;
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of ["anchorNode", "focusNode"] as const)
			properties[name] = {
				get: () => {
					const node = selection[name];
					return node === null ? null : this.bindings.node(node);
				},
			};
		for (const name of [
			"anchorOffset",
			"focusOffset",
			"rangeCount",
			"isCollapsed",
			"type",
			"direction",
		] as const)
			properties[name] = { get: () => selection[name] };
		const collapse = (...args: readonly unknown[]) => {
			required(args, 1);
			selection.collapse(
				args[0] === null ? null : this.bindings.identify(args[0]),
				unsigned(args[1]),
			);
		};
		return this.publications.publish(
			"implementation",
			0,
			{
				properties,
				methods: {
					getRangeAt: (...args) => {
						required(args, 1);
						return this.range(selection.getRangeAt(unsigned(args[0])));
					},
					addRange: (...args) => {
						required(args, 1);
						selection.addRange(this.identify(args[0]));
					},
					removeRange: (...args) => {
						required(args, 1);
						selection.removeRange(this.identify(args[0]));
					},
					removeAllRanges: () => selection.removeAllRanges(),
					empty: () => selection.empty(),
					collapse,
					setPosition: collapse,
					collapseToStart: () => selection.collapseToStart(),
					collapseToEnd: () => selection.collapseToEnd(),
					extend: (...args) => {
						required(args, 1);
						selection.extend(
							this.bindings.identify(args[0]),
							unsigned(args[1]),
						);
					},
					setBaseAndExtent: (...args) => {
						required(args, 4);
						selection.setBaseAndExtent(
							this.bindings.identify(args[0]),
							unsigned(args[1]),
							this.bindings.identify(args[2]),
							unsigned(args[3]),
						);
					},
					selectAllChildren: (...args) => {
						required(args, 1);
						selection.selectAllChildren(this.bindings.identify(args[0]));
					},
					deleteFromDocument: () => selection.deleteFromDocument(),
					containsNode: (...args) => {
						required(args, 1);
						return selection.containsNode(
							this.bindings.identify(args[0]),
							Boolean(args[1]),
						);
					},
					toString: () => selection.toString(),
				},
			},
			(capability) => {
				this.selectionObject = capability;
			},
		);
	}

	close() {
		this.publications.close();
		this.selectionObject = undefined;
		this.identities = new WeakMap();
	}

	private identify(value: unknown): DomRange {
		const range =
			value !== null && typeof value === "object"
				? this.identities.get(value)
				: undefined;
		if (!range)
			throw new TypeError("Expected a Range from this script document");
		return range;
	}

	private range(range: DomRange): object {
		this.bindings.ensureOpen();
		const existing = this.rangeObjects.get(range);
		if (existing) return existing;
		let id = this.rangeIds.get(range);
		if (id === undefined) {
			id = this.nextId++;
			this.rangeIds.set(range, id);
		}
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const name of [
			"startContainer",
			"endContainer",
			"commonAncestorContainer",
		] as const)
			properties[name] = { get: () => this.bindings.node(range[name]) };
		for (const name of ["startOffset", "endOffset", "collapsed"] as const)
			properties[name] = { get: () => range[name] };
		for (const [name, value] of Object.entries({
			START_TO_START: 0,
			START_TO_END: 1,
			END_TO_END: 2,
			END_TO_START: 3,
		}))
			properties[name] = { get: () => value };
		const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {
			getClientRects: () => this.rectList(rangeClientRects(range)),
			getBoundingClientRect: () => this.rect(rangeBoundingClientRect(range)),
			collapse: (value) => range.collapse(Boolean(value)),
			cloneRange: () => this.range(range.cloneRange()),
			compareBoundaryPoints: (...args) => {
				required(args, 2);
				return range.compareBoundaryPoints(
					unsigned(args[0], 16),
					this.identify(args[1]),
				);
			},
			cloneContents: () => this.bindings.node(range.cloneContents()),
			extractContents: () => this.bindings.node(range.extractContents()),
			deleteContents: () => range.deleteContents(),
			toString: () => range.toString(),
			detach: () => range.detach(),
		};
		for (const name of [
			"setStart",
			"setEnd",
			"comparePoint",
			"isPointInRange",
		] as const)
			methods[name] = (...args) => {
				required(args, 2);
				return range[name](this.bindings.identify(args[0]), unsigned(args[1]));
			};
		for (const name of [
			"setStartBefore",
			"setStartAfter",
			"setEndBefore",
			"setEndAfter",
			"selectNode",
			"selectNodeContents",
			"intersectsNode",
		] as const)
			methods[name] = (...args) => {
				required(args, 1);
				return range[name](this.bindings.identify(args[0]));
			};
		return this.publications.publish(
			"node",
			id,
			{ properties, methods },
			(capability) => {
				this.rangeObjects.set(range, capability);
				this.identities.set(capability, range);
			},
		);
	}

	private geometry(definition: ScriptHostObjectDefinition): object {
		if (this.geometryObjects >= scriptGeometryLimits.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"Script Range geometry object limit exceeded",
			);
		return this.publications.publish(
			"implementation",
			++this.geometryObjects,
			definition,
			() => {},
		);
	}

	private rect(source: ClientRectangle): object {
		return this.geometry({
			properties: Object.fromEntries(
				Object.entries(source).map(([key, value]) => [
					key,
					{ get: () => value },
				]),
			),
			methods: { toJSON: () => Object.freeze({ ...source }) },
		});
	}

	private rectList(source: readonly ClientRectangle[]): object {
		if (
			source.length > scriptGeometryLimits.maxListLength ||
			this.geometryObjects + source.length + 1 > scriptGeometryLimits.maxObjects
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Script Range geometry list limit exceeded",
			);
		const rects = source.map((rect) => this.rect(rect));
		return this.geometry({
			indexed: {
				maxLength: scriptGeometryLimits.maxListLength,
				length: () => rects.length,
				get: (index) => rects[index],
			},
			methods: {
				item: (...args) => {
					required(args, 1);
					return rects[unsigned(args[0])] ?? null;
				},
			},
		});
	}
}

export function scriptRangeCharacterMethods(
	tree: DocumentTree,
	id: number,
	bindings: {
		ensureOpen(): unknown;
		node(id: number): object;
		string(value: unknown): string;
	},
): NonNullable<ScriptHostObjectDefinition["methods"]> {
	const edit = (args: readonly unknown[], minimum: number) => {
		bindings.ensureOpen();
		required(args, minimum);
		return domRangeOwner(tree);
	};
	const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {
		appendData: (...args) => {
			const owner = edit(args, 1);
			owner.replaceText(id, owner.length(id), 0, bindings.string(args[0]));
		},
		insertData: (...args) => {
			const owner = edit(args, 2);
			owner.replaceText(id, unsigned(args[0]), 0, bindings.string(args[1]));
		},
		deleteData: (...args) => {
			const owner = edit(args, 2);
			owner.replaceText(id, unsigned(args[0]), unsigned(args[1]), "");
		},
		replaceData: (...args) => {
			const owner = edit(args, 3);
			owner.replaceText(
				id,
				unsigned(args[0]),
				unsigned(args[1]),
				bindings.string(args[2]),
			);
		},
	};
	if (tree.get(id).kind === "text")
		methods.splitText = (...args) => {
			const owner = edit(args, 1);
			return bindings.node(owner.splitText(id, unsigned(args[0])));
		};
	return methods;
}
