import type { CssDeclaration } from "./css-parser.js";
import { cssVariableLimits, resolveCustomProperties } from "./css-variables.js";

interface ResolutionNode {
	children: Map<CssDeclaration, ResolutionNode>;
	value?: ReadonlyMap<string, string | null>;
}

export class CustomPropertyResolutionCache {
	private readonly roots = new WeakMap<
		ReadonlyMap<string, string | null>,
		ResolutionNode
	>();
	private retainedNodes = 0;

	constructor(private readonly charge: (work: number) => void) {}

	resolve(
		declarations: readonly CssDeclaration[],
		parent: ReadonlyMap<string, string | null>,
	): ReadonlyMap<string, string | null> {
		if (!declarations.length) return parent;
		this.charge(1);
		let node = this.roots.get(parent);
		let index = 0;
		if (node) {
			while (index < declarations.length) {
				this.charge(1);
				const child: ResolutionNode | undefined = node.children.get(
					declarations[index],
				);
				if (!child) break;
				node = child;
				index++;
			}
			if (index === declarations.length && node.value !== undefined)
				return node.value;
		}

		const specified = new Map<string, string>();
		for (const declaration of declarations) {
			this.charge(1);
			specified.set(declaration.property, declaration.value);
		}
		const value = resolveCustomProperties(specified, parent, this.charge);
		const missingNodes = declarations.length - index + (node ? 0 : 1);
		if (
			this.retainedNodes + missingNodes >
			cssVariableLimits.maxRetainedBindings
		)
			return value;

		if (!node) {
			this.charge(1);
			node = { children: new Map() };
			this.roots.set(parent, node);
			this.retainedNodes++;
		}
		for (; index < declarations.length; index++) {
			this.charge(1);
			const child: ResolutionNode = { children: new Map() };
			node.children.set(declarations[index], child);
			node = child;
			this.retainedNodes++;
		}
		node.value = value;
		return value;
	}
}
