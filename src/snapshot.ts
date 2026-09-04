import {
	controlChecked,
	controlValue,
	isControlDisabled,
	labelControl,
	optionSelected,
} from "./controls.js";
import { documentBaseUrl } from "./document-url.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import { activeFocus } from "./focus.js";
import { htmlParseInfo } from "./html-info.js";
import { isInertRoot } from "./inertness.js";
import { summaryDetails } from "./details.js";
import { documentStyles } from "./styles.js";
import { inheritedAriaDisabled } from "./aria-disabled.js";
import {
	documentGeneratedControls,
	resolveVisualTarget,
	type GeneratedControlTarget,
} from "./generated-controls.js";

export interface SnapshotOptions {
	root?: string;
	maxBytes?: number;
	maxEntries?: number;
	maxDepth?: number;
	maxStringLength?: number;
}

export interface SnapshotEntry {
	ref: string;
	role: string;
	name: string;
	depth: number;
	level?: number;
	value?: string;
	checked?: boolean;
	indeterminate?: boolean;
	targeted?: boolean;
	focused?: boolean;
	expanded?: boolean;
	selected?: boolean;
	disabled?: boolean;
	readonly?: boolean;
	required?: boolean;
	protected?: boolean;
	href?: string;
}

export interface SemanticSnapshot {
	document: string;
	scope: string;
	revision: number;
	entries: SnapshotEntry[];
	truncated: boolean;
	html?: { partial: true; scripting: boolean; issues: number };
}

export type SnapshotDiff =
	| { reset: true; snapshot: SemanticSnapshot }
	| {
			reset: false;
			document: string;
			fromRevision: number;
			revision: number;
			updated: SnapshotEntry[];
			removed: string[];
			order: string[];
	  };

const ignoredTags = new Set([
	"head",
	"script",
	"style",
	"template",
	"iframe",
	"noembed",
	"noframes",
]);
const leafRoles = new Set(["button", "link", "heading", "img", "textbox"]);
const roles = new Set([
	"article",
	"banner",
	"button",
	"checkbox",
	"combobox",
	"complementary",
	"contentinfo",
	"dialog",
	"document",
	"form",
	"generic",
	"group",
	"heading",
	"img",
	"link",
	"list",
	"listbox",
	"listitem",
	"main",
	"navigation",
	"option",
	"progressbar",
	"radio",
	"region",
	"row",
	"rowgroup",
	"search",
	"searchbox",
	"separator",
	"slider",
	"spinbutton",
	"status",
	"switch",
	"table",
	"cell",
	"columnheader",
	"rowheader",
	"textbox",
]);
const tagRoles: Record<string, string> = Object.assign(Object.create(null), {
	a: "link",
	article: "article",
	aside: "complementary",
	button: "button",
	form: "form",
	h1: "heading",
	h2: "heading",
	h3: "heading",
	h4: "heading",
	h5: "heading",
	h6: "heading",
	hr: "separator",
	img: "img",
	li: "listitem",
	main: "main",
	nav: "navigation",
	ol: "list",
	ul: "list",
	option: "option",
	progress: "progressbar",
	table: "table",
	tbody: "rowgroup",
	td: "cell",
	textarea: "textbox",
	th: "columnheader",
	thead: "rowgroup",
	tr: "row",
});
const encoder = new TextEncoder();

function clean(text: string, trim = true) {
	const result = text.replace(/\s+/gu, " ").replace(/[\p{Cc}\p{Cf}]/gu, "");
	return trim ? result.trim() : result;
}

function hidden(tree: DocumentTree, node: DocumentNode) {
	return (
		ignoredTags.has(node.tagName) ||
		Object.hasOwn(node.attributes, "hidden") ||
		isInertRoot(tree, node) ||
		node.attributes["aria-hidden"]?.toLowerCase() === "true" ||
		(node.tagName === "input" &&
			node.attributes.type?.toLowerCase() === "hidden")
	);
}

function roleOf(
	tree: DocumentTree,
	node: DocumentNode,
	locator = false,
): string | undefined {
	if (node.kind === "text") return "text";
	if (node.kind !== "element") return undefined;
	const explicit = node.attributes.role
		?.split(/\s+/)
		.find((role) => roles.has(role));
	if (explicit) return explicit;
	if (
		node.attributes.role === "none" ||
		node.attributes.role === "presentation"
	)
		return undefined;
	if (node.tagName === "a" && !Object.hasOwn(node.attributes, "href"))
		return undefined;
	if (summaryDetails(tree, node) !== undefined) return "button";
	if (node.tagName === "input") {
		const type = node.attributes.type?.toLowerCase() ?? "text";
		if (
			locator &&
			[
				"color",
				"date",
				"datetime-local",
				"file",
				"month",
				"password",
				"time",
				"week",
			].includes(type)
		)
			return undefined;
		if (
			locator &&
			["text", "email", "tel", "url", "search"].includes(type) &&
			Object.hasOwn(node.attributes, "list")
		)
			return "combobox";
		if (["button", "submit", "reset", "image", "file"].includes(type))
			return "button";
		if (type === "checkbox" || type === "radio") return type;
		if (type === "range") return "slider";
		if (type === "number") return "spinbutton";
		if (type === "search") return "searchbox";
		return "textbox";
	}
	if (node.tagName === "select")
		return Object.hasOwn(node.attributes, "multiple") ||
			Number(node.attributes.size) > 1
			? "listbox"
			: "combobox";
	if (
		Object.hasOwn(node.attributes, "contenteditable") &&
		node.attributes.contenteditable !== "false"
	)
		return "textbox";
	return tagRoles[node.tagName];
}

export function snapshotDocument(
	tree: DocumentTree,
	options: SnapshotOptions = {},
): SemanticSnapshot {
	return collectSnapshot(tree, options, false);
}

export function scanSnapshotEntries(
	tree: DocumentTree,
	visit: (entry: SnapshotEntry) => void,
): Omit<SemanticSnapshot, "entries"> & { scannedEntries: number } {
	if (typeof visit !== "function")
		throw new AgentBrowserError(
			"invalid-input",
			"A snapshot visitor is required",
		);
	if (tree.nodeCount > 50_000)
		throw new AgentBrowserError(
			"resource-limit",
			"Snapshot scan document limit exceeded",
		);
	let scannedEntries = 0;
	const snapshot = collectSnapshot(
		tree,
		{
			maxBytes: 1_048_576,
			maxEntries: 10_000,
			maxDepth: 256,
			maxStringLength: 4096,
		},
		false,
		(entry) => {
			scannedEntries++;
			visit(entry);
		},
	);
	return {
		document: snapshot.document,
		scope: snapshot.scope,
		revision: snapshot.revision,
		truncated: snapshot.truncated,
		...(snapshot.html ? { html: snapshot.html } : {}),
		scannedEntries,
	};
}

export function snapshotElementRole(tree: DocumentTree, id: number) {
	const node = tree.get(id);
	return node.kind === "element" ? roleOf(tree, node, true) : undefined;
}

export function snapshotRoleCandidates(
	tree: DocumentTree,
	role: string,
): readonly SnapshotEntry[] {
	if (!roles.has(role))
		throw new AgentBrowserError(
			"unsupported",
			"Role is outside the supported semantic subset",
		);
	if (tree.nodeCount > 50_000)
		throw new AgentBrowserError(
			"resource-limit",
			"Role locator document limit exceeded",
		);
	const snapshot = collectSnapshot(
		tree,
		{
			maxBytes: 1_048_576,
			maxEntries: 10_000,
			maxDepth: 1024,
			maxStringLength: 16_384,
		},
		true,
	);
	if (snapshot.truncated)
		throw new AgentBrowserError(
			"resource-limit",
			"Role locator requires complete, untruncated candidate names",
		);
	return snapshot.entries.filter((entry) => entry.role === role);
}

function collectSnapshot(
	tree: DocumentTree,
	options: SnapshotOptions,
	expandLeafRoles: boolean,
	visit?: (entry: SnapshotEntry) => void,
): SemanticSnapshot {
	const maxBytes = options.maxBytes ?? 16_384;
	const maxEntries = options.maxEntries ?? 1000;
	const maxDepth = options.maxDepth ?? 256;
	const maxStringLength = options.maxStringLength ?? 512;
	for (const [name, value, minimum, maximum] of [
		["maxBytes", maxBytes, 256, 1_048_576],
		["maxEntries", maxEntries, 1, 10_000],
		["maxDepth", maxDepth, 0, 1024],
		["maxStringLength", maxStringLength, 1, 16_384],
	] as const) {
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
			throw new AgentBrowserError(
				"invalid-input",
				`Invalid snapshot limit: ${name}`,
			);
	}
	const rootTarget =
		options.root === undefined
			? undefined
			: resolveVisualTarget(tree, options.root);
	const start = rootTarget?.node.id ?? tree.root;
	const baseUrl = documentBaseUrl(tree);
	const focused = activeFocus(tree);
	const html = htmlParseInfo(tree);
	const result: SemanticSnapshot = {
		document: tree.reference(tree.root),
		scope: rootTarget?.generated?.ref ?? tree.reference(start),
		revision: tree.revision,
		entries: [],
		truncated: false,
		...(html
			? {
					html: {
						partial: true as const,
						scripting: html.scripting,
						issues: Object.values(html.issues).reduce(
							(total, count) => total + count,
							0,
						),
					},
				}
			: {}),
	};
	const nodes = new Map<number, Readonly<DocumentNode>>();
	const included = new Set<number>();
	const visible = new Set<number>();
	const styles = documentStyles(tree);
	const text = new Map<number, string>();
	const incompleteText = new Set<number>();
	const incompleteLabels = new Set<number>();
	const ids = new Map<string, number>();
	const labels = new Map<number, string[]>();
	for (const { node } of tree.walk()) {
		nodes.set(node.id, node);
		if (
			(node.parent === null || included.has(node.parent)) &&
			!hidden(tree, node) &&
			styles.get(node.id).displayed
		) {
			included.add(node.id);
			if (styles.get(node.id).visible) visible.add(node.id);
		}
		if (node.attributes.id && !ids.has(node.attributes.id))
			ids.set(node.attributes.id, node.id);
	}
	for (const node of Array.from(nodes.values()).reverse()) {
		if (!included.has(node.id)) continue;
		let content =
			node.kind === "text" && visible.has(node.id)
				? clean(node.data, false)
				: "";
		if (expandLeafRoles && content.length > maxStringLength)
			incompleteText.add(node.id);
		for (const child of node.children) {
			if (expandLeafRoles && incompleteText.has(child))
				incompleteText.add(node.id);
			content += text.get(child) ?? "";
			if (content.length > maxStringLength) {
				if (expandLeafRoles) incompleteText.add(node.id);
				break;
			}
		}
		text.set(node.id, clean(content, false).slice(0, maxStringLength + 1));
	}
	for (const node of nodes.values()) {
		if (node.tagName !== "label" || !visible.has(node.id)) continue;
		const control = labelControl(tree, node.id);
		if (control === undefined) continue;
		if (incompleteText.has(node.id)) incompleteLabels.add(control);
		const values = labels.get(control) ?? [];
		values.push(text.get(node.id) ?? "");
		labels.set(control, values);
	}
	const limit = (value: string) => {
		const normalized = clean(value);
		if (normalized.length <= maxStringLength) return normalized;
		result.truncated = true;
		let clipped = normalized.slice(0, maxStringLength);
		if (/[\uD800-\uDBFF]$/.test(clipped)) clipped = clipped.slice(0, -1);
		return clipped;
	};
	const nameText = (id: number) => {
		if (incompleteText.has(id)) result.truncated = true;
		return text.get(id) ?? "";
	};
	const nameOf = (node: DocumentNode, role: string) => {
		const references =
			node.attributes["aria-labelledby"]?.trim().split(/\s+/) ?? [];
		const labelled = references
			.map((reference) => nameText(ids.get(reference) ?? -1))
			.filter(Boolean);
		if (labelled.length) return limit(labelled.join(" "));
		if (node.attributes["aria-label"])
			return limit(node.attributes["aria-label"]);
		const associated = labels.get(node.id);
		if (associated?.length) {
			if (incompleteLabels.has(node.id)) result.truncated = true;
			return limit(associated.join(" "));
		}
		if (node.tagName === "img")
			return limit(node.attributes.alt ?? node.attributes.title ?? "");
		if (
			node.tagName === "input" &&
			node.attributes.type?.toLowerCase() === "file"
		)
			return limit(node.attributes.title ?? "Choose files");
		if (node.tagName === "input" && role === "button")
			return limit(
				node.attributes.alt ??
					node.attributes.value ??
					node.attributes.title ??
					"",
			);
		if (
			(leafRoles.has(role) && role !== "textbox") ||
			role === "text" ||
			role === "option"
		)
			return limit(nameText(node.id));
		return limit(node.attributes.title ?? node.attributes.placeholder ?? "");
	};
	let usedBytes = encoder.encode(JSON.stringify(result)).byteLength;
	const append = (entry: SnapshotEntry) => {
		if (entry.depth > maxDepth) {
			result.truncated = true;
			return true;
		}
		if (visit) visit(entry);
		else {
			const entryBytes =
				encoder.encode(JSON.stringify(entry)).byteLength +
				(result.entries.length ? 1 : 0);
			if (
				result.entries.length >= maxEntries ||
				usedBytes + entryBytes > maxBytes
			) {
				result.truncated = true;
				return false;
			}
			usedBytes += entryBytes;
			result.entries.push(entry);
		}
		return true;
	};
	const pending: {
		id: number;
		depth: number;
		generated?: GeneratedControlTarget;
	}[] = [{ id: start, depth: 0, generated: rootTarget?.generated }];
	while (pending.length) {
		const current = pending.pop();
		if (!current || !included.has(current.id)) continue;
		const node = nodes.get(current.id);
		if (!node) continue;
		if (current.generated) {
			if (!visible.has(current.id)) continue;
			const entry: SnapshotEntry = {
				ref: current.generated.ref,
				role: "button",
				name: limit(current.generated.label),
				depth: current.depth,
				expanded: Object.hasOwn(node.attributes, "open"),
			};
			if (focused === node.id && tree.generatedFocusReference === entry.ref)
				entry.focused = true;
			if (inheritedAriaDisabled(tree, node.id)) entry.disabled = true;
			if (!append(entry)) break;
			continue;
		}
		const role = visible.has(current.id)
			? roleOf(tree, node, expandLeafRoles)
			: undefined;
		let nextDepth = current.depth;
		if (role && (role !== "text" || text.get(node.id)?.trim())) {
			if (current.depth > maxDepth) {
				result.truncated = true;
				continue;
			}
			const entry: SnapshotEntry = {
				ref: tree.reference(node.id),
				role,
				name: nameOf(node, role),
				depth: current.depth,
			};
			if (role === "heading") {
				const level = Number(
					node.attributes["aria-level"] ?? node.tagName.slice(1),
				);
				if (Number.isSafeInteger(level) && level > 0) entry.level = level;
			}
			for (const state of ["disabled", "readonly", "required"] as const)
				if (
					Object.hasOwn(node.attributes, state) ||
					node.attributes[`aria-${state}`] === "true"
				)
					entry[state] = true;
			if (isControlDisabled(tree, node.id)) entry.disabled = true;
			if (node.id === tree.targetElement) entry.targeted = true;
			if (node.id === focused && tree.generatedFocusReference === null)
				entry.focused = true;
			const details = summaryDetails(tree, node);
			if (details !== undefined && role === "button")
				entry.expanded = Object.hasOwn(tree.get(details).attributes, "open");
			if (
				node.tagName === "input" &&
				node.attributes.type?.toLowerCase() === "checkbox" &&
				node.control.indeterminate
			)
				entry.indeterminate = true;
			if (["checkbox", "radio", "switch"].includes(role))
				entry.checked =
					node.tagName === "input"
						? controlChecked(tree, node.id)
						: (node.control.checked ??
							(Object.hasOwn(node.attributes, "checked") ||
								node.attributes["aria-checked"] === "true"));
			if (role === "option")
				entry.selected =
					node.tagName === "option"
						? optionSelected(tree, node.id)
						: (node.control.selected ??
							(Object.hasOwn(node.attributes, "selected") ||
								node.attributes["aria-selected"] === "true"));
			if (["input", "textarea", "select"].includes(node.tagName)) {
				const type = node.attributes.type?.toLowerCase();
				if (type === "password" || type === "file") entry.protected = true;
				else if (!["checkbox", "radio", "button"].includes(role))
					entry.value = limit(controlValue(tree, node.id));
			}
			if (role === "link" && node.attributes.href !== undefined) {
				try {
					const url = new URL(node.attributes.href, baseUrl);
					if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) {
						url.username = "";
						url.password = "";
						entry.href = limit(url.href);
					}
				} catch {}
			}
			if (!append(entry)) break;
			nextDepth++;
		}
		if (!expandLeafRoles && role && leafRoles.has(role)) continue;
		for (let index = node.children.length - 1; index >= 0; index--)
			pending.push({ id: node.children[index], depth: nextDepth });
		if (node.tagName === "details" && visible.has(node.id)) {
			const generated = documentGeneratedControls(tree).detailsSummary(node.id);
			if (generated) pending.push({ id: node.id, depth: nextDepth, generated });
		}
	}
	return result;
}

export function diffSnapshots(
	previous: SemanticSnapshot | undefined,
	current: SemanticSnapshot,
): SnapshotDiff {
	if (
		!previous ||
		previous.document !== current.document ||
		previous.scope !== current.scope ||
		previous.truncated ||
		current.truncated ||
		previous.revision > current.revision
	)
		return { reset: true, snapshot: current };
	const prior = new Map(previous.entries.map((entry) => [entry.ref, entry]));
	const next = new Set(current.entries.map((entry) => entry.ref));
	return {
		reset: false,
		document: current.document,
		fromRevision: previous.revision,
		revision: current.revision,
		updated: current.entries.filter(
			(entry) => JSON.stringify(entry) !== JSON.stringify(prior.get(entry.ref)),
		),
		removed: previous.entries
			.filter((entry) => !next.has(entry.ref))
			.map((entry) => entry.ref),
		order: current.entries.map((entry) => entry.ref),
	};
}

export function renderSnapshotEntry(entry: SnapshotEntry): string {
	const states = Object.entries(entry).filter(
		([key]) => !["name", "role", "depth", "ref"].includes(key),
	);
	return `${"  ".repeat(Math.min(1024, Math.max(0, entry.depth)))}- ${clean(entry.role)} ${JSON.stringify(clean(entry.name))} [ref=${clean(entry.ref)}]${states.map(([key, value]) => ` [${key}=${JSON.stringify(typeof value === "string" ? clean(value) : value)}]`).join("")}`;
}

export function renderSnapshot(
	snapshot: SemanticSnapshot,
	maxBytes = 16_384,
): string {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 64 || maxBytes > 1_048_576)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid text snapshot byte limit",
		);
	const marker = "… snapshot truncated\n";
	const lines: string[] = snapshot.html
		? [
				snapshot.html.scripting
					? "# HTML partial; classic JS partial\n"
					: "# HTML partial; JS off\n",
			]
		: [];
	let bytes = lines.length ? encoder.encode(lines[0]).byteLength : 0;
	let truncated = snapshot.truncated;
	for (const entry of snapshot.entries) {
		const line = `${renderSnapshotEntry(entry)}\n`;
		const size = encoder.encode(line).byteLength;
		if (bytes + size + encoder.encode(marker).byteLength > maxBytes) {
			truncated = true;
			break;
		}
		bytes += size;
		lines.push(line);
	}
	if (truncated) lines.push(marker);
	return lines.join("");
}
