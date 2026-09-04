import type { DocumentNode, DocumentTree } from "./document.js";
import { validateDocumentInsertion as validateDocument } from "./document-hierarchy.js";
import { AgentBrowserError } from "./errors.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";

export const scriptMutationLimits = Object.freeze({ maxArguments: 1024 });

interface MutationBindings {
	read(id: number): Readonly<DocumentNode>;
	identify(value: unknown): number;
	node(id: number): object;
	string(value: unknown): string;
}

export function scriptMutationMethods(
	tree: DocumentTree,
	id: number,
	bindings: MutationBindings,
): NonNullable<ScriptHostObjectDefinition["methods"]> {
	const kind = bindings.read(id).kind;
	const insert = (parent: number, child: number, before?: number) => {
		validateDocument(tree, parent, child, [], before);
		tree.insert(parent, child, before);
	};
	const replace = (parent: number, child: number, previous: number) => {
		validateDocument(tree, parent, child, [previous], previous);
		tree.replace(parent, child, previous);
	};
	const argumentsList = (values: readonly unknown[]) => {
		bindings.read(id);
		if (values.length > scriptMutationLimits.maxArguments)
			throw new AgentBrowserError(
				"resource-limit",
				"DOM mutation argument limit exceeded",
			);
		return values.map((value) =>
			value !== null && typeof value === "object"
				? bindings.identify(value)
				: bindings.string(value),
		);
	};
	const convert = (values: readonly (string | number)[]) => {
		const nodes = values.map((value) =>
			typeof value === "string" ? tree.createText(value) : value,
		);
		if (nodes.length === 1) return nodes[0];
		const fragment = tree.createFragment();
		for (const node of nodes) tree.append(fragment, node);
		return fragment;
	};
	const methods: NonNullable<ScriptHostObjectDefinition["methods"]> = {
		appendChild: (child) => {
			bindings.read(id);
			const childId = bindings.identify(child);
			insert(id, childId);
			return bindings.node(childId);
		},
		insertBefore: (child, before) => {
			bindings.read(id);
			const childId = bindings.identify(child);
			insert(
				id,
				childId,
				before == null ? undefined : bindings.identify(before),
			);
			return bindings.node(childId);
		},
		replaceChild: (child, previous) => {
			bindings.read(id);
			const childId = bindings.identify(child);
			const previousId = bindings.identify(previous);
			replace(id, childId, previousId);
			return bindings.node(previousId);
		},
		removeChild: (child) => {
			bindings.read(id);
			const childId = bindings.identify(child);
			if (bindings.read(childId).parent !== id)
				throw new AgentBrowserError("not-found", "Node is not a child");
			tree.remove(childId);
			return bindings.node(childId);
		},
	};
	if (["document", "fragment", "element"].includes(kind)) {
		methods.append = (...values) => {
			const args = argumentsList(values);
			if (args.length) insert(id, convert(args));
		};
		methods.prepend = (...values) => {
			const args = argumentsList(values);
			if (!args.length) return;
			const child = convert(args);
			insert(id, child, bindings.read(id).children[0]);
		};
		methods.replaceChildren = (...values) => {
			const args = argumentsList(values);
			const child = args.length ? convert(args) : undefined;
			if (child !== undefined)
				validateDocument(tree, id, child, bindings.read(id).children);
			tree.replaceChildren(id, child);
		};
	}
	if (["element", "text", "comment", "doctype"].includes(kind)) {
		for (const operation of ["before", "after", "replaceWith"] as const)
			methods[operation] = (...values) => {
				const args = argumentsList(values);
				const parent = bindings.read(id).parent;
				if (parent === null) return;
				if (!args.length) {
					if (operation === "replaceWith") tree.remove(id);
					return;
				}
				const moving = new Set(
					args.filter((value) => typeof value === "number"),
				);
				const siblings = bindings.read(parent).children;
				const direction = operation === "before" ? -1 : 1;
				let position = siblings.indexOf(id) + direction;
				while (
					position >= 0 &&
					position < siblings.length &&
					moving.has(siblings[position])
				)
					position += direction;
				const viable = siblings[position];
				const child = convert(args);
				if (operation === "before") {
					const current = bindings.read(parent).children;
					insert(
						parent,
						child,
						viable === undefined
							? current[0]
							: current[current.indexOf(viable) + 1],
					);
				} else if (
					operation === "replaceWith" &&
					bindings.read(id).parent === parent
				) {
					replace(parent, child, id);
				} else insert(parent, child, viable);
			};
		methods.remove = () => {
			bindings.read(id);
			tree.remove(id);
		};
	}
	return methods;
}
