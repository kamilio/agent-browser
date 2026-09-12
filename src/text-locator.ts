import { controlValue, inputType, labelControl } from "./controls.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { htmlScriptingEnabled } from "./html-info.js";

export interface TextTargetLocator {
	kind: "text" | "label" | "placeholder" | "alt-text" | "title";
	value: string;
	exact: boolean;
}

export const textLocatorLimits = Object.freeze({
	maxNodes: 50_000,
	maxTextCodeUnits: 262_144,
	maxCachedCodeUnits: 4_000_000,
	maxWork: 8_000_000,
	maxLabelReferences: 1024,
	maxLabelReferenceCodeUnits: 16_384,
});

export function textLocatorCandidates(
	tree: DocumentTree,
	locator: TextTargetLocator,
): number[] {
	let work = 0;
	const charge = (units: number) => {
		work += units;
		if (work > textLocatorLimits.maxWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Text locator work limit exceeded",
			);
	};
	const normalize = (value: string) => {
		charge(value.length + 1);
		return value
			.replace(/[\u200b\u00ad]/g, "")
			.replace(/\s+/gu, " ")
			.trim();
	};
	const normalized = locator.kind === "text" || locator.kind === "label";
	const query = normalized ? normalize(locator.value) : locator.value;
	const expected = locator.exact ? query : query.toLowerCase();
	const matches = (value: string) => {
		charge(value.length + expected.length + 1);
		const actual = normalized ? normalize(value) : value;
		return locator.exact
			? actual === expected
			: actual.toLowerCase().includes(expected);
	};
	const nodes: Readonly<DocumentNode>[] = [];
	const excluded = new Set<number>();
	const ids = new Map<string, number>();
	const labels = new Map<number, number[]>();
	const scripting = htmlScriptingEnabled(tree);
	for (const { node, depth } of tree.walk()) {
		charge(1);
		if (nodes.length >= textLocatorLimits.maxNodes)
			throw new AgentBrowserError(
				"resource-limit",
				"Text locator node limit exceeded",
			);
		nodes.push(node);
		if (
			(node.parent !== null && excluded.has(node.parent)) ||
			["head", "script", "style"].includes(node.tagName) ||
			(node.tagName === "noscript" && (!isHtmlElement(node) || scripting))
		)
			excluded.add(node.id);
		if (node.kind !== "element") continue;
		const id = node.attributes.id;
		if (id && !ids.has(id)) ids.set(id, node.id);
		if (locator.kind === "label" && node.tagName === "label") {
			charge(depth + 1);
			const control = labelControl(tree, node.id);
			if (control !== undefined) {
				const values = labels.get(control) ?? [];
				values.push(node.id);
				labels.set(control, values);
			}
		}
	}
	if (!normalized) {
		const attribute = locator.kind === "alt-text" ? "alt" : locator.kind;
		return nodes
			.filter(
				(node) =>
					node.kind === "element" &&
					Object.hasOwn(node.attributes, attribute) &&
					matches(node.attributes[attribute]),
			)
			.map((node) => node.id);
	}
	const labelSources = new Map<number, string | readonly number[]>();
	const neededText = new Set<number>();
	if (locator.kind === "label") {
		for (const node of nodes) {
			if (node.kind !== "element") continue;
			const references = node.attributes["aria-labelledby"] ?? "";
			charge(references.length + 1);
			if (references.length > textLocatorLimits.maxLabelReferenceCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Label reference text limit exceeded",
				);
			const tokens = references.split(/[\t\n\f\r ]+/).filter(Boolean);
			if (tokens.length > textLocatorLimits.maxLabelReferences)
				throw new AgentBrowserError(
					"resource-limit",
					"Label reference count limit exceeded",
				);
			const referenced = [
				...new Set(
					tokens
						.map((id) => ids.get(id))
						.filter((id): id is number => id !== undefined),
				),
			];
			const label = node.attributes["aria-label"];
			charge((label?.length ?? 0) + 1);
			if (!referenced.length && label !== undefined && label.trim()) {
				labelSources.set(node.id, label);
				continue;
			}
			const source = referenced.length ? referenced : labels.get(node.id);
			if (!source) continue;
			labelSources.set(node.id, source);
			for (const id of source) {
				charge(1);
				neededText.add(id);
			}
		}
		for (const node of nodes) {
			charge(1);
			if (node.parent !== null && neededText.has(node.parent))
				neededText.add(node.id);
		}
	}
	const text = new Map<number, string>();
	let cached = 0;
	for (let index = nodes.length - 1; index >= 0; index--) {
		const node = nodes[index];
		if (locator.kind === "label" && !neededText.has(node.id)) continue;
		if (
			excluded.has(node.id) ||
			node.kind === "comment" ||
			node.kind === "document"
		)
			continue;
		let value: string;
		if (node.kind === "text") value = node.data;
		else if (
			node.tagName === "input" &&
			["button", "submit", "reset"].includes(inputType(node))
		)
			value = controlValue(tree, node.id);
		else {
			const parts: string[] = [];
			let length = 0;
			for (const child of node.children) {
				const part = text.get(child) ?? "";
				length += part.length;
				charge(part.length + 1);
				if (length > textLocatorLimits.maxTextCodeUnits)
					throw new AgentBrowserError(
						"resource-limit",
						"Text locator content limit exceeded",
					);
				parts.push(part);
			}
			value = parts.join("");
		}
		if (value.length > textLocatorLimits.maxTextCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Text locator content limit exceeded",
			);
		cached += value.length;
		charge(value.length + 1);
		if (cached > textLocatorLimits.maxCachedCodeUnits)
			throw new AgentBrowserError(
				"resource-limit",
				"Text locator cache limit exceeded",
			);
		text.set(node.id, value);
	}
	const matchedText = new Map<number, boolean>();
	const matchesText = (id: number) => {
		let matched = matchedText.get(id);
		if (matched === undefined) {
			matched = matches(text.get(id) ?? "");
			matchedText.set(id, matched);
		}
		return matched;
	};
	const result: number[] = [];
	for (const node of nodes) {
		if (node.kind !== "element") continue;
		if (locator.kind === "text") {
			if (excluded.has(node.id) || !matchesText(node.id)) continue;
			const childMatch = node.children.some((id) => {
				charge(1);
				return tree.get(id).kind === "element" && matchesText(id);
			});
			if (!childMatch) result.push(node.id);
			continue;
		}
		const source = labelSources.get(node.id);
		if (
			typeof source === "string" ? matches(source) : source?.some(matchesText)
		)
			result.push(node.id);
	}
	return result;
}
