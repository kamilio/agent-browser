import { documentBaseUrl } from "./document-url.js";
import { imageContentSecurityPolicyValues } from "./document-image-content-security-policy.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { documentImages } from "./document-images.js";
import { AgentBrowserError } from "./errors.js";
import { htmlParseInfo, setHtmlParseInfo } from "./html-info.js";
import { parseHtmlDocument, parseHtmlDocumentAsync } from "./html-parser.js";
import { HtmlTokenizer } from "./html-tokenizer.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import { resourceLimitError } from "./resource-limit.js";
import type { DocumentLoaderContext } from "./session.js";
import { documentStyles } from "./styles.js";
import type { StylesheetFetchPolicy } from "./stylesheet-fetch.js";
import {
	loadStylesheetImports,
	stylesheetImportLimits,
	type StylesheetInput,
} from "./stylesheet-imports.js";
import {
	parseIntegrityMetadata,
	verifyIntegrityMetadata,
} from "./subresource-integrity.js";
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
		throw resourceLimitError(
			"html.encoded",
			context.limits.maxTextCodeUnits * 4 + 3,
			response.body.byteLength,
			"Encoded HTML document limit exceeded",
		);
	const decoded = decodeResponseText(response, prescanEncoding(response.body));
	const parseContext = {
		...context,
		initializeDocument: (tree: import("./document.js").DocumentTree) => {
			context.initializeDocument?.(tree);
			documentImages(tree, {
				fetch: context.fetchImage,
				contentSecurityPolicy: imageContentSecurityPolicyValues(
					response.headers,
				),
			});
		},
	};
	const tree = context.scripts
		? await parseHtmlDocumentAsync(
				decoded.text,
				parseNetworkUrl(response.url).href,
				parseContext,
				context.scripts,
			)
		: parseHtmlDocument(
				decoded.text,
				parseNetworkUrl(response.url).href,
				parseContext,
			);
	const info = htmlParseInfo(tree);
	if (info) setHtmlParseInfo(tree, { ...info, encoding: decoded.encoding });
	try {
		const styles = documentStyles(tree);
		let stylesheetCspBlocked = Object.keys(response.headers).some(
			(name) => name.toLowerCase() === "content-security-policy",
		);
		if (!stylesheetCspBlocked) {
			for (const { node } of tree.walk()) {
				if (
					isHtmlElement(node, "meta") &&
					node.attributes["http-equiv"]?.toLowerCase() ===
						"content-security-policy"
				) {
					stylesheetCspBlocked = true;
					break;
				}
			}
		}
		let importRequests = 0;
		const decodeStylesheet = (
			sheet: NetworkResponse,
			encoding: string,
		): Readonly<StylesheetInput> => {
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
			return {
				url: parseNetworkUrl(sheet.url).href,
				...decodeResponseText(sheet, encoding),
			};
		};
		const installImports = async (
			id: number,
			requestedUrl: string,
			input: Readonly<StylesheetInput>,
		) => {
			const loaded = await loadStylesheetImports(input, {
				signal: context.signal,
				requestedUrl,
				inline: isHtmlElement(tree.get(id), "style"),
				maxSheets: Math.min(
					styles.limits.maxSheets,
					stylesheetImportLimits.maxSheets,
				),
				maxCodeUnits: Math.min(
					styles.limits.maxCodeUnits,
					stylesheetImportLimits.maxCodeUnits,
				),
				fetch: async (url, parent) => {
					if (stylesheetCspBlocked)
						throw new AgentBrowserError(
							"policy-denied",
							"Stylesheet import CSP enforcement is not implemented",
						);
					if (!context.fetchStylesheetWithPolicy)
						throw new AgentBrowserError(
							"unsupported",
							"Stylesheet import policy transport is unavailable",
						);
					if (++importRequests > stylesheetImportLimits.maxImports)
						throw new AgentBrowserError(
							"resource-limit",
							"Document stylesheet import request limit exceeded",
						);
					const result = await context.fetchStylesheetWithPolicy(url, {
						mode: "no-cors",
						credentials: "include",
					});
					if (!["basic", "cors", "opaque"].includes(result.type))
						throw new AgentBrowserError(
							"policy-denied",
							"Invalid imported stylesheet response type",
						);
					return decodeStylesheet(result.response, parent.encoding);
				},
			});
			for (const [code, count] of Object.entries(loaded.issues))
				for (let occurrence = 0; occurrence < count; occurrence++)
					styles.noteLoadIssue(code);
			if (loaded.source.imports.length)
				styles.setStylesheetSource(id, requestedUrl, loaded.source);
		};
		for (const { node } of tree.walk()) {
			if (
				isHtmlElement(node, "style") &&
				(!node.attributes.type ||
					node.attributes.type.trim().toLowerCase() === "text/css")
			) {
				try {
					const url = documentBaseUrl(tree);
					await installImports(node.id, url, {
						url,
						text: tree.textContent(node.id),
						encoding: decoded.encoding,
					});
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
				continue;
			}
			if (
				!isHtmlElement(node, "link") ||
				Object.hasOwn(node.attributes, "disabled")
			)
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
			const requiresPolicy =
				Object.hasOwn(node.attributes, "integrity") ||
				Object.hasOwn(node.attributes, "crossorigin");
			if (requiresPolicy && !context.fetchStylesheetWithPolicy) {
				styles.noteLoadIssue("stylesheet-integrity-or-cors-not-implemented");
				continue;
			}
			if (!requiresPolicy && !context.fetchStylesheet) {
				styles.noteLoadIssue("stylesheet-fetch-unavailable");
				continue;
			}
			try {
				const url = parseNetworkUrl(
					new URL(node.attributes.href ?? "", documentBaseUrl(tree)).href,
				).href;
				const integrity = requiresPolicy
					? parseIntegrityMetadata(node.attributes.integrity ?? "")
					: null;
				let sheet: NetworkResponse;
				if (requiresPolicy) {
					if (stylesheetCspBlocked) {
						styles.noteLoadIssue("stylesheet-csp-not-implemented");
						continue;
					}
					const crossorigin = node.attributes.crossorigin;
					const policy: StylesheetFetchPolicy = {
						mode: crossorigin === undefined ? "no-cors" : "cors",
						credentials:
							crossorigin === undefined ||
							crossorigin.toLowerCase() === "use-credentials"
								? "include"
								: "same-origin",
					};
					const result = await context.fetchStylesheetWithPolicy!(url, policy);
					if (context.signal.aborted)
						throw new AgentBrowserError(
							"aborted",
							"Stylesheet loading aborted",
						);
					if (!["basic", "cors", "opaque"].includes(result.type))
						throw new AgentBrowserError(
							"policy-denied",
							"Invalid stylesheet response type",
						);
					if (result.type === "opaque" && policy.mode === "cors") {
						styles.noteLoadIssue("stylesheet-cors-response-not-readable");
						continue;
					}
					if (result.type === "opaque" && integrity) {
						styles.noteLoadIssue("stylesheet-integrity-response-not-readable");
						continue;
					}
					sheet = result.response;
					parseNetworkUrl(sheet.url);
				} else {
					sheet = await context.fetchStylesheet!(url);
				}
				const input = decodeStylesheet(sheet, decoded.encoding);
				if (
					integrity &&
					!verifyIntegrityMetadata(
						sheet.body,
						integrity,
						styles.limits.maxCodeUnits * 4 + 3,
					)
				) {
					styles.noteLoadIssue("stylesheet-integrity-mismatch");
					continue;
				}
				styles.setExternalSheet(node.id, url, input.text);
				await installImports(node.id, url, input);
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
		await documentImages(tree).settle(context.signal);
		return tree;
	} catch (error) {
		tree.close();
		throw error;
	}
}
