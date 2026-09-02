import { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	type NetworkResponse,
	decodeResponseText,
	parseNetworkUrl,
} from "./network.js";
import type { DocumentLoaderContext } from "./session.js";

export function loadTextDocument(
	response: NetworkResponse,
	context: DocumentLoaderContext,
): DocumentTree {
	if (context.signal.aborted)
		throw new AgentBrowserError("aborted", "Text document loading aborted");
	const contentTypes = response.headers["content-type"];
	if (contentTypes?.length !== 1)
		throw new AgentBrowserError(
			"unsupported",
			"Text loading requires one explicit Content-Type",
		);
	const mime = contentTypes[0].split(";", 1)[0].trim().toLowerCase();
	if (
		mime !== "text/plain" &&
		mime !== "application/json" &&
		!/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mime)
	)
		throw new AgentBrowserError(
			"unsupported",
			"This loader supports plain text and JSON, not HTML or executable documents",
		);
	if (response.body.byteLength > context.limits.maxTextCodeUnits * 4 + 3)
		throw new AgentBrowserError(
			"resource-limit",
			"Encoded text document limit exceeded",
		);
	const text = decodeResponseText(response).text;
	if (text.length > context.limits.maxTextCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Decoded text document limit exceeded",
		);
	const tree = new DocumentTree(
		parseNetworkUrl(response.url).href,
		context.limits,
	);
	try {
		const pre = tree.createElement("pre");
		tree.append(tree.root, pre);
		tree.append(pre, tree.createText(text));
		return tree;
	} catch (error) {
		tree.close();
		throw error;
	}
}
