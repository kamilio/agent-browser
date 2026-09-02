import { documentBaseUrl } from "./document-url.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument, parseHtmlDocumentAsync } from "./html-parser.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import type { DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";
import { loadTextDocument } from "./text-loader.js";

function prescanEncoding(bytes: Uint8Array) {
	const prefix = String.fromCharCode(...bytes.subarray(0, 1024));
	const tokenizer = new HtmlTokenizer(prefix, () => {});
	try {
		let token = tokenizer.next();
		while (token) {
			if (token.kind === "start") {
				if (["script", "style", "title", "textarea"].includes(token.name))
					tokenizer.raw(token.name);
				if (token.name === "meta") {
					const attributes = token.attributes;
					let encoding: string | undefined = attributes.charset;
					if (
						!encoding &&
						attributes["http-equiv"]?.toLowerCase() === "content-type"
					)
						encoding = /charset\s*=\s*["']?([^\s;"']+)/i.exec(
							attributes.content ?? "",
						)?.[1];
					if (encoding) {
						const name = encoding.trim().toLowerCase();
						if (/^utf-16(?:le|be)?$/.test(name)) return "utf-8";
						if (name === "x-user-defined") return "windows-1252";
						try {
							return new TextDecoder(name).encoding;
						} catch {}
					}
				}
			}
			token = tokenizer.next();
		}
	} catch {}
	return "windows-1252";
}

export async function loadBrowserDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
) {
	if (context.signal.aborted)
		throw new AgentBrowserError("aborted", "Document loading aborted");
	const types = response.headers["content-type"];
	if (types?.length !== 1)
		throw new AgentBrowserError(
			"unsupported",
			"Document loading requires one explicit Content-Type",
		);
	if (types[0].split(";", 1)[0].trim().toLowerCase() !== "text/html")
		return loadTextDocument(response, context);
	if (response.body.byteLength > context.limits.maxTextCodeUnits * 4 + 3)
		throw new AgentBrowserError(
			"resource-limit",
			"Encoded HTML document limit exceeded",
		);
	const decoded = decodeResponseText(response, prescanEncoding(response.body));
	const tree = context.scripts
		? await parseHtmlDocumentAsync(
				decoded.text,
				parseNetworkUrl(response.url).href,
				context,
				context.scripts,
			)
		: parseHtmlDocument(
				decoded.text,
				parseNetworkUrl(response.url).href,
				context,
			);
	const info = htmlParseInfo(tree);
	if (info) setHtmlParseInfo(tree, { ...info, encoding: decoded.encoding });
	try {
		const styles = documentStyles(tree);
		for (const { node } of tree.walk()) {
			if (node.tagName !== "link" || Object.hasOwn(node.attributes, "disabled"))
				continue;
			const rel =
				node.attributes.rel?.toLowerCase().split(/[\t\n\f\r ]+/) ?? [];
			if (!rel.includes("stylesheet") || rel.includes("alternate")) continue;
			if (!node.attributes.href?.trim()) {
				styles.noteLoadIssue("stylesheet-missing-href");
				continue;
			}
			if (
				node.attributes.type &&
				node.attributes.type.trim().toLowerCase() !== "text/css"
			)
				continue;
			if (
				Object.hasOwn(node.attributes, "integrity") ||
				Object.hasOwn(node.attributes, "crossorigin")
			) {
				styles.noteLoadIssue("stylesheet-integrity-or-cors-not-implemented");
				continue;
			}
			if (!context.fetchStylesheet) {
				styles.noteLoadIssue("stylesheet-fetch-unavailable");
				continue;
			}
			try {
				const url = parseNetworkUrl(
					new URL(node.attributes.href ?? "", documentBaseUrl(tree)).href,
				).href;
				const sheet = await context.fetchStylesheet(url);
				if (context.signal.aborted)
					throw new AgentBrowserError("aborted", "Stylesheet loading aborted");
				if (sheet.status < 200 || sheet.status >= 300)
					throw new AgentBrowserError(
						"unsupported",
						"Stylesheet response failed",
					);
				const types = sheet.headers["content-type"];
				if (
					types?.length !== 1 ||
					types[0].split(";", 1)[0].trim().toLowerCase() !== "text/css"
				)
					throw new AgentBrowserError(
						"unsupported",
						"Stylesheet MIME is not text/css",
					);
				if (sheet.body.byteLength > styles.limits.maxCodeUnits * 4 + 3)
					throw new AgentBrowserError(
						"resource-limit",
						"Stylesheet body limit exceeded",
					);
				styles.setExternalSheet(
					node.id,
					url,
					decodeResponseText(sheet, decoded.encoding).text,
				);
			} catch (error) {
				if (
					context.signal.aborted ||
					(error instanceof AgentBrowserError && error.code === "aborted")
				)
					throw error;
				styles.noteLoadIssue(
					error instanceof AgentBrowserError
						? `stylesheet-${error.code}`
						: "stylesheet-load-failed",
				);
				if (
					error instanceof AgentBrowserError &&
					error.code === "resource-limit"
				)
					break;
			}
		}
		await context.scripts?.finish(tree);
		return tree;
	} catch (error) {
		tree.close();
		throw error;
	}
}
