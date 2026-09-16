import { documentBody } from "../src/document-elements.js";
import type { DocumentTree } from "../src/document.js";
import type {
	DocumentExtraction,
	DocumentLinkDiscovery,
} from "../src/extraction.js";
import { htmlParseInfo } from "../src/html-info.js";
import { imageSourceText } from "../src/image-source.js";
import { documentStyles } from "../src/styles.js";

export const researchDiagnosticTextLimit = 8192;

export function researchLinkDiagnosticText(
	links: DocumentLinkDiscovery,
): string {
	return [
		...links.entries.map((entry) =>
			entry.sourceLabel
				? `${entry.label}\n${entry.sourceLabel.text}`
				: entry.label,
		),
		...(links.sourceMarkdown?.entries.map((entry) => entry.label) ?? []),
	].join("\n");
}

const diagnosticOmissions = new Set(
	"head script style template iframe noembed noframes object embed canvas input textarea select datalist".split(
		" ",
	),
);

export function researchDocumentDiagnosticText(
	tree: DocumentTree,
	options: { collapseWhitespace?: boolean } = {},
): string {
	const styles = documentStyles(tree);
	const pending: (number | null)[] = [documentBody(tree) ?? tree.root];
	const scripting = htmlParseInfo(tree)?.scripting ?? false;
	const limit = researchDiagnosticTextLimit + 1;
	let text = "";
	const append = (value: string) => {
		let selected = options.collapseWhitespace
			? value.replace(/\s+/g, " ")
			: value;
		if (
			options.collapseWhitespace &&
			text.endsWith(" ") &&
			selected.startsWith(" ")
		)
			selected = selected.slice(1);
		text += selected.slice(0, limit - text.length);
	};
	while (pending.length && text.length < limit) {
		const id = pending.pop();
		if (id === null) {
			append(" ");
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
			if (style.visible) append(" ");
			continue;
		}
		const content =
			node.kind === "text"
				? node.data
				: node.tagName === "img"
					? ` ${node.attributes.alt ?? ""} `
					: undefined;
		if (content !== undefined) {
			if (style.visible) append(content);
			continue;
		}
		if (!style.display.startsWith("inline")) {
			append(" ");
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
	for (const table of extraction.sourceChartTables?.tables ?? []) {
		for (let rowIndex = 1; rowIndex < table.rows.length; rowIndex++) {
			const row = table.rows[rowIndex];
			for (let columnIndex = 1; columnIndex < row.length; columnIndex++) {
				const cell = row[columnIndex];
				if (cell.kind !== "value-cell") continue;
				if (
					(typeof cell.value === "string" && cell.value.trim().length > 0) ||
					(typeof cell.value === "number" && Number.isFinite(cell.value)) ||
					typeof cell.value === "boolean"
				)
					return true;
			}
		}
	}
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
			node.tableSource !== undefined ||
			node.ariaTableSource !== undefined ||
			node.imageSource !== undefined ||
			!!node.dateTimeSource?.value.trim()
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
		for (const value of [
			node.imageSource ? imageSourceText(node.imageSource) : undefined,
			node.text,
		])
			if (value && text.length < limit) {
				if (text) text += " ";
				text += value.slice(0, limit - text.length);
			}
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push(node.children[index]);
	}
	return text;
}
