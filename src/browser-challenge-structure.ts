import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { htmlParseInfo } from "./html-info.js";
import { sourceInlineDisplayHidden } from "./research-inline-visibility.js";

const maxNodes = 512;
const maxDepth = 32;
const maxDocumentUnits = 1_000_000;
const maxInspectedUnits = 32_768;
const maxAttributes = 32;
const maxAttributeUnits = 1024;
const whitespace = /^[\t\n\f\r ]*$/;
const hiddenStyle =
	/^[\t\n\f\r ]*display[\t\n\f\r ]*:[\t\n\f\r ]*none[\t\n\f\r ]*(?:![\t\n\f\r ]*important[\t\n\f\r ]*)?;?[\t\n\f\r ]*$/i;
const markerIds = new Set([
	"sec-if-cpt-container",
	"sec-bc-text-container",
	"sec-bc-tile-parent",
	"sec-bc-tile-container",
	"progress-button",
]);
const markerClasses = new Set([
	"behavioral-content",
	"behavioral-button",
	"progress",
]);
const metadataTags = new Set(["base", "link", "meta", "script", "style"]);
const rejectedIssues = [
	"duplicate-attribute",
	"unterminated-tag",
	"unterminated-raw-element",
	"unterminated-comment",
	"unterminated-cdata",
	"unterminated-declaration",
	"bogus-declaration",
	"eof-in-text",
	"eof-in-doctype",
	"abrupt-doctype-public-identifier",
	"abrupt-doctype-system-identifier",
	"unterminated-script-not-executed",
	"unclosed-template",
	"unclosed-head-noscript",
];

function continueShoppingChallenge(
	nodes: ReadonlyMap<number, Readonly<DocumentNode>>,
	root: number,
	url: string,
): boolean {
	const destination = new URL(url);
	const region = /^(?:www\.)?amazon\.(com|co\.uk)$/.exec(
		destination.hostname,
	)?.[1];
	if (
		!region ||
		destination.protocol !== "https:" ||
		destination.port ||
		destination.username ||
		destination.password
	)
		return false;
	const elements = [...nodes.values()].filter(
		(node) => node.kind === "element",
	);
	const allowed = new Set([
		"html",
		"head",
		"body",
		"title",
		"meta",
		"link",
		"script",
		"style",
		"div",
		"span",
		"i",
		"h4",
		"form",
		"input",
		"button",
		"a",
	]);
	if (
		elements.some((node) => !isHtmlElement(node) || !allowed.has(node.tagName))
	)
		return false;
	const named = (tag: string) =>
		elements.filter((node) => node.tagName === tag);
	const single = (tag: string) => {
		const matches = named(tag);
		return matches.length === 1 ? matches[0] : undefined;
	};
	const html = single("html");
	const head = single("head");
	const body = single("body");
	const title = single("title");
	const form = single("form");
	const heading = single("h4");
	const button = single("button");
	if (
		!html ||
		!head ||
		!body ||
		!title ||
		!form ||
		!heading ||
		!button ||
		html.parent !== root ||
		head.parent !== html.id ||
		body.parent !== html.id ||
		title.parent !== head.id
	)
		return false;
	for (const parent of [nodes.get(root), html, head]) {
		if (!parent) return false;
		for (const child of parent.children) {
			const node = nodes.get(child);
			if (!node) return false;
			if (
				node.kind === "comment" ||
				(node.kind === "text" && whitespace.test(node.data))
			)
				continue;
			if (
				parent.id === root &&
				(node.id === html.id || node.kind === "doctype")
			)
				continue;
			if (parent.id === html.id && (node.id === head.id || node.id === body.id))
				continue;
			if (
				parent.id === head.id &&
				(node.id === title.id || metadataTags.has(node.tagName))
			)
				continue;
			return false;
		}
	}
	const within = (node: Readonly<DocumentNode>, ancestor: number): boolean => {
		let parent = node.parent;
		for (let depth = 0; parent !== null && depth < maxDepth; depth++) {
			if (parent === ancestor) return true;
			const owner = nodes.get(parent);
			if (!owner) return false;
			parent = owner.parent;
		}
		return false;
	};
	const text = (ancestor: number): string =>
		[...nodes.values()]
			.filter(
				(node) =>
					node.kind === "text" &&
					within(node, ancestor) &&
					!metadataTags.has(nodes.get(node.parent ?? root)?.tagName ?? ""),
			)
			.map((node) => node.data)
			.join(" ")
			.replace(/[\t\n\f\r ]+/g, " ")
			.trim();
	const formOverrides = [
		"form",
		"formaction",
		"formmethod",
		"formenctype",
		"formtarget",
		"formnovalidate",
	];
	if (
		text(title.id) !== `Amazon.${region}` ||
		!within(form, body.id) ||
		!within(heading, body.id) ||
		!within(button, form.id) ||
		form.attributes.method?.trim().toLowerCase() !== "get" ||
		form.attributes.action !== "/errors_page/validateCaptcha" ||
		button.attributes.type?.trim().toLowerCase() !== "submit" ||
		text(heading.id) !== "Click the button below to continue shopping" ||
		text(button.id) !== "Continue shopping" ||
		elements.some(
			(node) =>
				(within(node, body.id) || node.id === body.id || node.id === html.id) &&
				node.tagName !== "input" &&
				(Object.hasOwn(node.attributes, "hidden") ||
					Object.hasOwn(node.attributes, "inert") ||
					node.attributes["aria-hidden"]?.trim().toLowerCase() === "true" ||
					sourceInlineDisplayHidden(node.attributes.style)),
		) ||
		[body, button].some(
			(node) =>
				Object.hasOwn(node.attributes, "disabled") ||
				Object.hasOwn(node.attributes, "hidden") ||
				Object.hasOwn(node.attributes, "inert") ||
				node.attributes["aria-hidden"]?.trim().toLowerCase() === "true",
		) ||
		formOverrides.some((attribute) =>
			Object.hasOwn(button.attributes, attribute),
		)
	)
		return false;
	const inputs = named("input");
	if (
		inputs.length !== 3 ||
		new Set(inputs.map((node) => node.attributes.name)).size !== 3 ||
		inputs.some(
			(node) =>
				!within(node, form.id) ||
				node.attributes.type?.trim().toLowerCase() !== "hidden" ||
				!["amzn", "amzn-r", "field-keywords"].includes(node.attributes.name) ||
				Object.hasOwn(node.attributes, "disabled") ||
				formOverrides.some((attribute) =>
					Object.hasOwn(node.attributes, attribute),
				),
		)
	)
		return false;
	const links = named("a");
	const terms =
		region === "com" ? "Conditions of Use" : "Conditions of Use & Sale";
	const privacy = region === "com" ? "Privacy Policy" : "Privacy Notice";
	if (
		links.length !== 2 ||
		links.some((node) => !within(node, body.id) || !node.attributes.href) ||
		text(links[0].id) !== terms ||
		text(links[1].id) !== privacy
	)
		return false;
	const expected = `Click the button below to continue shopping Continue shopping ${terms} ${privacy} `;
	const bodyText = text(body.id);
	return (
		bodyText.startsWith(expected) &&
		/^© 1996-\d{4}, Amazon\.com, Inc\. or its affiliates$/.test(
			bodyText.slice(expected.length),
		)
	);
}

export function browserChallengeStructure(
	tree: DocumentTree,
):
	| "behavioral-challenge-shell-v1"
	| "continue-shopping-challenge-v1"
	| undefined {
	try {
		const usage = tree.resourceUsage();
		const issues = htmlParseInfo(tree)?.issues;
		if (
			!Number.isSafeInteger(usage.nodes) ||
			usage.nodes < 1 ||
			usage.nodes > maxNodes ||
			!Number.isSafeInteger(usage.textCodeUnits) ||
			usage.textCodeUnits < 0 ||
			usage.textCodeUnits > maxDocumentUnits ||
			rejectedIssues.some((issue) => (issues?.[issue] ?? 0) > 0)
		)
			return undefined;
		const nodes = new Map<number, Readonly<DocumentNode>>();
		const ids = new Map<string, number>();
		const classes = new Map<string, number>();
		const pending: { id: number; parent: number | null; depth: number }[] = [
			{ id: tree.root, parent: null, depth: 0 },
		];
		let scheduled = 1;
		let inspectedUnits = 0;
		while (pending.length) {
			const entry = pending.pop();
			if (!entry) return undefined;
			if (
				entry.depth > maxDepth ||
				!Number.isSafeInteger(entry.id) ||
				nodes.has(entry.id)
			)
				return undefined;
			const node = tree.get(entry.id);
			if (
				node.id !== entry.id ||
				node.parent !== entry.parent ||
				!Array.isArray(node.children) ||
				node.children.length > maxNodes ||
				(entry.parent === null
					? node.kind !== "document"
					: !["element", "text", "comment", "doctype"].includes(node.kind)) ||
				(node.kind === "doctype" && entry.parent !== tree.root) ||
				(!["element", "document"].includes(node.kind) && node.children.length)
			)
				return undefined;
			nodes.set(node.id, node);
			inspectedUnits += node.tagName.length;
			const names = Object.keys(node.attributes);
			if (names.length > maxAttributes) return undefined;
			for (const name of names) {
				const value = node.attributes[name];
				if (
					typeof value !== "string" ||
					name.length + value.length > maxAttributeUnits
				)
					return undefined;
				inspectedUnits += name.length + value.length;
			}
			const parent =
				entry.parent === null ? undefined : nodes.get(entry.parent);
			if (node.kind === "text") {
				if (typeof node.data !== "string") return undefined;
				if (
					!parent ||
					(!isHtmlElement(parent, "script") && !isHtmlElement(parent, "style"))
				)
					inspectedUnits += node.data.length;
			}
			if (inspectedUnits > maxInspectedUnits) return undefined;
			if (
				parent &&
				(isHtmlElement(parent, "script") || isHtmlElement(parent, "style")) &&
				node.kind !== "text"
			)
				return undefined;
			if (node.kind === "element") {
				if (isHtmlElement(node, "template") || isHtmlElement(node, "noscript"))
					return undefined;
				const marker = node.attributes.id;
				if (markerIds.has(marker)) {
					if (
						ids.has(marker) ||
						(!isHtmlElement(node, "div") &&
							!(marker === "progress-button" && isHtmlElement(node, "button")))
					)
						return undefined;
					ids.set(marker, node.id);
				}
				const tokens = new Set(
					(node.attributes.class ?? "").split(/[\t\n\f\r ]+/),
				);
				for (const token of tokens) {
					if (!markerClasses.has(token)) continue;
					if (classes.has(token) || !isHtmlElement(node, "div"))
						return undefined;
					classes.set(token, node.id);
				}
			}
			scheduled += node.children.length;
			if (scheduled > maxNodes || scheduled > usage.nodes) return undefined;
			for (let index = node.children.length - 1; index >= 0; index--)
				pending.push({
					id: node.children[index],
					parent: node.id,
					depth: entry.depth + 1,
				});
		}
		if (continueShoppingChallenge(nodes, tree.root, tree.url))
			return "continue-shopping-challenge-v1";
		if (ids.size !== markerIds.size || classes.size !== markerClasses.size)
			return undefined;
		const root = ids.get("sec-if-cpt-container");
		const content = classes.get("behavioral-content");
		const text = ids.get("sec-bc-text-container");
		const tileParent = ids.get("sec-bc-tile-parent");
		const tiles = ids.get("sec-bc-tile-container");
		const buttonContainer = classes.get("behavioral-button");
		const button = ids.get("progress-button");
		const progress = classes.get("progress");
		if (
			root === undefined ||
			content === undefined ||
			text === undefined ||
			tileParent === undefined ||
			tiles === undefined ||
			buttonContainer === undefined ||
			button === undefined ||
			progress === undefined ||
			new Set([...ids.values(), ...classes.values()]).size !== 8
		)
			return undefined;
		const beneath = (child: number, ancestor: number): boolean => {
			let parent = nodes.get(child)?.parent;
			for (
				let depth = 0;
				parent !== null && parent !== undefined && depth < maxDepth;
				depth++
			) {
				if (parent === ancestor) return true;
				const node = nodes.get(parent);
				if (!node || (!isHtmlElement(node, "div") && parent !== button))
					return false;
				parent = node.parent;
			}
			return false;
		};
		const shell = nodes.get(root);
		const control = nodes.get(button);
		if (
			!shell ||
			!control ||
			shell.attributes.role !== "main" ||
			!hiddenStyle.test(shell.attributes.style ?? "") ||
			control.attributes.role !== "button" ||
			!Object.hasOwn(control.attributes, "disabled") ||
			!beneath(content, root) ||
			!beneath(text, content) ||
			!beneath(tileParent, content) ||
			!beneath(tiles, tileParent) ||
			!beneath(buttonContainer, content) ||
			!beneath(button, buttonContainer) ||
			!beneath(progress, buttonContainer)
		)
			return undefined;
		const body = shell.parent === null ? undefined : nodes.get(shell.parent);
		const html =
			body?.parent === null || body?.parent === undefined
				? undefined
				: nodes.get(body.parent);
		if (
			!body ||
			!html ||
			!isHtmlElement(body, "body") ||
			!isHtmlElement(html, "html") ||
			html.parent !== tree.root
		)
			return undefined;
		let title: number | undefined;
		let head: number | undefined;
		for (const node of nodes.values()) {
			if (isHtmlElement(node, "head")) {
				if (head !== undefined || node.parent !== html.id) return undefined;
				head = node.id;
			} else if (isHtmlElement(node, "title")) {
				if (title !== undefined) return undefined;
				title = node.id;
			} else if (isHtmlElement(node, "body") && node.id !== body.id)
				return undefined;
			else if (isHtmlElement(node, "html") && node.id !== html.id)
				return undefined;
		}
		if (head === undefined) return undefined;
		if (title !== undefined) {
			const titleNode = nodes.get(title);
			if (!titleNode || titleNode.parent !== head) return undefined;
			for (const child of titleNode.children) {
				const node = nodes.get(child);
				if (!node || node.kind !== "text" || !whitespace.test(node.data))
					return undefined;
			}
		}
		const blank = (node: Readonly<DocumentNode>) =>
			node.kind === "comment" ||
			(node.kind === "text" && whitespace.test(node.data));
		for (const parentId of [tree.root, html.id, head, body.id]) {
			const parent = nodes.get(parentId);
			if (!parent) return undefined;
			for (const child of parent.children) {
				const node = nodes.get(child);
				if (!node) return undefined;
				if (blank(node)) continue;
				if (
					parentId === tree.root &&
					(node.id === html.id || node.kind === "doctype")
				)
					continue;
				if (parentId === html.id && (node.id === head || node.id === body.id))
					continue;
				if (parentId === head && node.id === title) continue;
				if (parentId === body.id && node.id === root) continue;
				if (
					(parentId === head || parentId === body.id) &&
					isHtmlElement(node) &&
					metadataTags.has(node.tagName)
				) {
					if (
						!["script", "style"].includes(node.tagName) &&
						node.children.length
					)
						return undefined;
					continue;
				}
				return undefined;
			}
		}
		return "behavioral-challenge-shell-v1";
	} catch {
		return undefined;
	}
}
