import { AgentBrowserError } from "./errors.js";
import { HtmlTokenizer } from "./html-tokenizer.js";

export type ResearchReaderMimePolicy = "markdown-html-document-v1";

export function validateResearchReaderMimePolicy(
	value: unknown,
): ResearchReaderMimePolicy | undefined {
	if (value === undefined || value === "markdown-html-document-v1")
		return value;
	throw new AgentBrowserError("invalid-input", "Invalid reader MIME policy");
}

export const researchMimePrefixLimits = Object.freeze({
	maxCodeUnits: 4096,
	maxTokens: 64,
});

export interface ResearchMimeInterpretation {
	readonly policy: ResearchReaderMimePolicy;
	readonly declaredMime: "text/markdown";
	readonly effectiveMime: "text/html";
	readonly basis: "html5-doctype-root-prefix";
	readonly prefixCodeUnits: number;
}

function completeStartTag(source: string, name: string) {
	const attribute =
		/[^\t\n\f\r "'<>/=\0]+(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"[^"\0]*"|'[^'\0]*'|[^\t\n\f\r "'`=<>\0]+))?/y;
	let position = name.length + 1;
	while (position < source.length - 1) {
		const before = position;
		while (/[\t\n\f\r ]/.test(source[position] ?? "")) position++;
		if (position === source.length - 1) break;
		if (position === before) return false;
		attribute.lastIndex = position;
		if (!attribute.exec(source)) return false;
		position = attribute.lastIndex;
	}
	return position === source.length - 1 && source[position] === ">";
}

export function markdownHtmlDocumentPrefix(source: string): number | undefined {
	const prefix = source.slice(0, researchMimePrefixLimits.maxCodeUnits);
	const bomCodeUnits = prefix.startsWith("\uFEFF") ? 1 : 0;
	const input = prefix.slice(bomCodeUnits);
	let start = 0;
	let indentation = 0;
	while (start < input.length) {
		const character = input[start];
		if (character === " ") indentation++;
		else if (character === "\t") indentation = Math.max(indentation, 4);
		else if (character === "\r" || character === "\n") indentation = 0;
		else break;
		start++;
	}
	if (
		indentation > 3 ||
		!/^<!doctype(?=[\t\n\f\r ])/i.test(input.slice(start, start + 10))
	)
		return undefined;
	const tokenizer = new HtmlTokenizer(input, () => {}, 0);
	let stage: "doctype" | "html" | "content" = "doctype";
	try {
		for (let count = 0; count < researchMimePrefixLimits.maxTokens; count++) {
			const start = tokenizer.position;
			const token = tokenizer.next();
			if (!token) return undefined;
			const raw = input.slice(start, tokenizer.position);
			if (token.kind === "text" && /^[\t\n\f\r ]*$/.test(raw)) continue;
			if (token.kind === "comment" && stage !== "doctype") continue;
			if (stage === "doctype") {
				if (
					token.kind !== "doctype" ||
					token.name !== "html" ||
					token.publicId !== null ||
					token.systemId !== null ||
					token.forceQuirks ||
					!/^<!doctype[\t\n\f\r ]+html[\t\n\f\r ]*>$/i.test(raw)
				)
					return undefined;
				stage = "html";
				continue;
			}
			if (
				token.kind !== "start" ||
				token.selfClosing ||
				(stage === "html"
					? token.name !== "html"
					: token.name !== "head" && token.name !== "body") ||
				!completeStartTag(raw, token.name)
			)
				return undefined;
			if (stage === "content") return bomCodeUnits + tokenizer.position;
			stage = "content";
		}
	} catch (error) {
		if (
			!(error instanceof AgentBrowserError) ||
			(error.code !== "resource-limit" && error.code !== "unsupported")
		)
			throw error;
	}
	return undefined;
}
