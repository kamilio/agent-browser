import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

export interface GithubSourceBlock {
	readonly gutter: number | null;
	readonly lines: ReadonlyMap<number, string>;
}

function classes(node: Readonly<DocumentNode>, ...required: string[]): boolean {
	const value = node.attributes.class ?? "";
	if (!isHtmlElement(node, "div") || value.length > 1024) return false;
	const tokens = value.split(/[\t\n\f\r ]+/);
	return required.every((token) => tokens.includes(token));
}

export function githubSourceBlock(
	tree: DocumentTree,
	source: Readonly<DocumentNode>,
	readable: (node: Readonly<DocumentNode>) => boolean,
	limits: { maxNodes: number; maxDepth: number },
): GithubSourceBlock | undefined {
	if (limits.maxNodes <= 0 || limits.maxDepth <= 0) return;
	const scoped = classes(source, "react-code-lines");
	if (!scoped && !classes(source, "react-code-file-contents")) return;
	if (scoped && source.parent === null) return;
	const file =
		scoped && source.parent !== null ? tree.get(source.parent) : source;
	if (!classes(file, "react-code-file-contents") || !readable(file)) return;
	let work = 0;
	let includedWork = 0;
	let codeUnits = 0;
	const maxWork = Math.min(
		50_000,
		limits.maxNodes * (scoped ? 4 : 1) + (scoped ? 2 : 0),
	);
	const maxDepth = Math.min(128, limits.maxDepth + (scoped ? 1 : 0));
	const read = (id: number, depth: number, included = true) => {
		if (++work > maxWork || depth > maxDepth) return;
		if (included && ++includedWork > limits.maxNodes) return;
		const node = tree.get(id);
		if (node.kind !== "comment" && !readable(node)) return;
		if (node.kind === "text") {
			codeUnits += node.data.length;
			if (codeUnits > 1_000_000) return;
		}
		return node;
	};
	const elements = (
		node: Readonly<DocumentNode>,
		depth: number,
		included = true,
	) => {
		const children: Readonly<DocumentNode>[] = [];
		for (const id of node.children) {
			const child = read(id, depth, included);
			if (!child) return;
			if (child.kind === "comment") continue;
			if (child.kind === "text" && /^[\t\n\f\r ]*$/.test(child.data)) continue;
			if (!isHtmlElement(child, "div")) return;
			if ((child.attributes.class?.length ?? 0) > 1024) return;
			children.push(child);
		}
		return children;
	};

	const parts = elements(file, 1, !scoped);
	if (
		parts?.length !== 2 ||
		!classes(parts[0], "react-line-numbers") ||
		!classes(parts[1], "react-code-lines") ||
		(scoped && parts[1].id !== source.id)
	)
		return;
	const rows = elements(parts[1], 2);
	if (!rows) return;
	const gutters = elements(parts[0], 2, !scoped);
	if (
		!gutters ||
		!rows ||
		rows.length === 0 ||
		rows.length > 10_000 ||
		rows.length !== gutters.length
	)
		return;
	const lines = new Map<number, string>();
	for (let index = 0; index < rows.length; index++) {
		const gutter = gutters[index];
		if (
			!classes(gutter, "react-line-number", "react-code-text") ||
			(gutter.children.length !== 1 && gutter.children.length !== 2)
		)
			return;
		const label = read(gutter.children[0], 3, !scoped);
		if (label?.kind !== "text" || label.data !== String(index + 1)) return;
		if (gutter.children.length === 2) {
			const decoration = read(gutter.children[1], 3, !scoped);
			if (
				!decoration ||
				!isHtmlElement(decoration, "span") ||
				decoration.children.length !== 0
			)
				return;
		}
		const row = rows[index];
		if (!classes(row, "react-code-text", "react-code-line-contents")) return;
		const wrappers = elements(row, 3);
		if (wrappers?.length !== 1) return;
		const cells = elements(wrappers[0], 4);
		if (cells?.length !== 1) return;
		const cell = cells[0];
		if (
			!classes(cell, "react-file-line") ||
			cell.attributes.id !== `LC${index + 1}`
		)
			return;
		const fragments: string[] = [];
		const pending = [{ parent: cell, index: 0, depth: 5 }];
		while (pending.length) {
			const current = pending.at(-1);
			if (!current) break;
			if (current.index >= current.parent.children.length) {
				pending.pop();
				continue;
			}
			const node = read(
				current.parent.children[current.index++],
				current.depth,
			);
			if (!node) return;
			if (node.kind === "text") {
				fragments.push(node.data);
			} else if (node.kind !== "comment") {
				if (!isHtmlElement(node, "span")) return;
				if (node.children.length) {
					if (current.depth >= maxDepth) return;
					pending.push({ parent: node, index: 0, depth: current.depth + 1 });
				}
			}
		}
		let text = fragments.join("");
		if (text === "\n") text = "";
		else if (/[\r\n]/.test(text)) return;
		lines.set(cell.id, text + (index + 1 < rows.length ? "\n" : ""));
	}
	return { gutter: scoped ? null : parts[0].id, lines };
}
