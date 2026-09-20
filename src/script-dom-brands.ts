import type { DocumentNode } from "./document.js";
import {
	elementNamespace,
	htmlNamespace,
	svgNamespace,
} from "./dom-namespaces.js";

const brands = new WeakMap<object, { owner: object; read(): DocumentNode }>();

export function registerScriptNodeBrand(
	value: object,
	owner: object,
	read: () => DocumentNode,
): void {
	brands.set(value, { owner, read });
}

export function scriptNodeHasInstance(
	value: unknown,
	owner: object,
	name: unknown,
): boolean {
	if (value === null || typeof value !== "object") return false;
	const brand = brands.get(value);
	if (!brand || brand.owner !== owner) return false;
	const node = brand.read();
	switch (name) {
		case "Node":
			return true;
		case "Element":
			return node.kind === "element";
		case "HTMLElement":
			return (
				node.kind === "element" && elementNamespace(node) === htmlNamespace
			);
		case "SVGElement":
			return node.kind === "element" && elementNamespace(node) === svgNamespace;
		case "Document":
			return node.kind === "document";
		case "DocumentFragment":
			return node.kind === "fragment";
		case "CharacterData":
			return node.kind === "text" || node.kind === "comment";
		case "Text":
			return node.kind === "text";
		case "Comment":
			return node.kind === "comment";
		case "DocumentType":
			return node.kind === "doctype";
		default:
			return false;
	}
}
