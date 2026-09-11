import { documentBody } from "../src/document-elements.js";
import type { DocumentTree } from "../src/document.js";
import type { DocumentExtraction } from "../src/extraction.js";
import { htmlParseInfo } from "../src/html-info.js";
import { documentStyles } from "../src/styles.js";

export const researchDiagnosticTextLimit = 8192;

const diagnosticOmissions = new Set(
	"head script style template iframe noembed noframes object embed canvas input textarea select datalist".split(
		" ",
	),
);

export function researchDocumentDiagnosticText(tree: DocumentTree): string {
	const styles = documentStyles(tree);
	const pending: (number | null)[] = [documentBody(tree) ?? tree.root];
	const scripting = htmlParseInfo(tree)?.scripting ?? false;
	const limit = researchDiagnosticTextLimit + 1;
	let text = "";
	while (pending.length && text.length < limit) {
		const id = pending.pop();
		if (id === null) {
			text += " ";
			continue;
		}
		if (id === undefined) break;
		const node = tree.get(id);
		if (
			node.kind === "comment" ||
			node.kind === "doctype" ||
			diagnosticOmissions.has(node.tagName) ||
			Object.hasOwn(node.attributes, "hidden") ||
			Object.hasOwn(node.attributes, "inert") ||
			node.attributes["aria-hidden"]?.toLowerCase() === "true" ||
			(node.tagName === "noscript" && scripting)
		)
			continue;
		const style = styles.get(id);
		if (!style.displayed) continue;
		if (node.tagName === "br") {
			if (style.visible) text += " ";
			continue;
		}
		const content =
			node.kind === "text"
				? node.data
				: node.tagName === "img"
					? ` ${node.attributes.alt ?? ""} `
					: undefined;
		if (content !== undefined) {
			if (style.visible) text += content.slice(0, limit - text.length);
			continue;
		}
		if (!style.display.startsWith("inline")) {
			text += " ";
			pending.push(null);
		}
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push(node.children[index]);
	}
	return text;
}

export function hasResearchExtractionContent(
	extraction: DocumentExtraction,
): boolean {
	if (extraction.format === "markdown") return !!extraction.content.trim();
	const pending = [extraction.content];
	while (pending.length) {
		const node = pending.pop();
		if (!node) break;
		if (
			node.text?.trim() ||
			node.type === "image" ||
			node.type === "separator" ||
			node.type === "table" ||
			node.tableSource !== undefined
		)
			return true;
		for (const child of node.children ?? []) pending.push(child);
	}
	return false;
}

export function researchExtractionDiagnosticText(
	extraction: DocumentExtraction,
): string {
	if (extraction.format === "markdown") return extraction.content;
	const pending = [extraction.content];
	const limit = researchDiagnosticTextLimit + 1;
	let text = "";
	while (pending.length && text.length < limit) {
		const node = pending.pop();
		if (!node) break;
		if (node.text) {
			if (text) text += " ";
			text += node.text.slice(0, limit - text.length);
		}
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
	}
	return text;
}
