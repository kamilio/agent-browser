import type { ExtractedNode } from "./extraction.js";
import { imageSourceText } from "./image-source.js";
import type { ResourceLimitDiagnostic } from "./resource-limit.js";

export interface ExtractionContentFallback {
	readonly policy: "text-prefix-v1";
	readonly representation: "indented-plain-text";
	readonly sourceCodeUnits: number;
	readonly retainedCodeUnits: number;
	readonly truncated: boolean;
	readonly trigger: Readonly<ResourceLimitDiagnostic>;
}

const blockTypes = new Set<ExtractedNode["type"]>([
	"container",
	"paragraph",
	"heading",
	"list",
	"list-item",
	"blockquote",
	"pre",
	"table",
	"row",
	"cell",
]);
const encoder = new TextEncoder();

function plainText(root: ExtractedNode): string {
	const pieces: string[] = [];
	const pending: (
		| { node: ExtractedNode; literal?: boolean }
		| { separator: true }
	)[] = [{ node: root }];
	let separator = false;
	const append = (text: string) => {
		if (!text) return;
		if (
			separator &&
			pieces.length &&
			!pieces[pieces.length - 1].endsWith("\n") &&
			!text.startsWith("\n")
		)
			pieces.push("\n");
		pieces.push(text);
		separator = false;
	};
	while (pending.length) {
		const current = pending.pop();
		if (!current) break;
		if ("separator" in current) {
			separator = true;
			continue;
		}
		const { node } = current;
		if (node.type === "separator") separator = true;
		const block = blockTypes.has(node.type);
		if (block) {
			separator = true;
			pending.push({ separator: true });
		}
		if (node.imageSource && !current.literal)
			append(`${imageSourceText(node.imageSource)} `);
		if (node.text !== undefined) append(node.text);
		if (node.type === "break") append("\n");
		if (node.children)
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push({
					node: node.children[index],
					literal:
						current.literal || node.type === "pre" || node.type === "code",
				});
	}
	return pieces.join("");
}

function safePrefixLength(source: string, length: number): number {
	if (length > 0 && length < source.length) {
		const previous = source.charCodeAt(length - 1);
		const next = source.charCodeAt(length);
		if (
			previous >= 0xd800 &&
			previous <= 0xdbff &&
			next >= 0xdc00 &&
			next <= 0xdfff
		)
			return length - 1;
	}
	return length;
}

export function boundedExtractionTextPrefix(
	root: ExtractedNode,
	metadata: object,
	maxBytes: number,
	trigger: Readonly<ResourceLimitDiagnostic>,
):
	| { content: string; contentFallback: Readonly<ExtractionContentFallback> }
	| undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return undefined;
	const source = plainText(root);
	const firstMeaningful = source.search(/\S/u);
	if (firstMeaningful === -1) return undefined;
	const snapshot = Object.freeze({ ...trigger });
	let lower = 0;
	let upper = Math.min(source.length, maxBytes);
	let best:
		| { content: string; contentFallback: Readonly<ExtractionContentFallback> }
		| undefined;
	while (lower <= upper) {
		const midpoint = lower + Math.floor((upper - lower) / 2);
		const retainedCodeUnits = safePrefixLength(source, midpoint);
		const content = `    ${source.slice(0, retainedCodeUnits).replace(/\n/g, "\n    ")}\n`;
		const contentFallback: Readonly<ExtractionContentFallback> = Object.freeze({
			policy: "text-prefix-v1",
			representation: "indented-plain-text",
			sourceCodeUnits: source.length,
			retainedCodeUnits,
			truncated: retainedCodeUnits < source.length,
			trigger: snapshot,
		});
		const bytes = encoder.encode(
			JSON.stringify({
				...metadata,
				format: "markdown",
				content,
				contentFallback,
			}),
		).byteLength;
		if (bytes <= maxBytes) {
			best = { content, contentFallback };
			lower = midpoint + 1;
		} else upper = midpoint - 1;
	}
	return best && best.contentFallback.retainedCodeUnits > firstMeaningful
		? best
		: undefined;
}
