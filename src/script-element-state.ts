import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { consumeHtmlScriptToken } from "./html-tokenizer.js";

export type ScriptElementOrigin = "dynamic" | "parser" | "inert";
export type ParserNonceEligibility =
	| "untrusted"
	| "pending"
	| "eligible"
	| "ineligible"
	| "cloned";

export interface ScriptElementState {
	readonly origin: ScriptElementOrigin | "unknown";
	readonly forceAsync: boolean;
	readonly alreadyStarted: boolean;
	readonly parserNonceEligibility: ParserNonceEligibility;
}

interface MutableScriptElementState {
	origin: ScriptElementState["origin"];
	forceAsync: boolean;
	alreadyStarted: boolean;
	parserNonceEligibility: ParserNonceEligibility;
	parserTokenOwner?: object;
}

const documents = new WeakMap<
	DocumentTree,
	Map<number, MutableScriptElementState>
>();

function state(tree: DocumentTree, id: number): MutableScriptElementState {
	const node = tree.get(id);
	if (!isHtmlElement(node, "script"))
		throw new AgentBrowserError(
			"invalid-input",
			"Expected an HTML script element",
		);
	let elements = documents.get(tree);
	if (!elements) {
		const owned = new Map<number, MutableScriptElementState>();
		const unsubscribe = tree.onMutation((record) => {
			if (
				record.type !== "attributes" ||
				record.attributeName !== "async" ||
				record.attributeNamespace !== null
			)
				return;
			const entry = owned.get(record.target);
			if (entry && Object.hasOwn(tree.get(record.target).attributes, "async"))
				entry.forceAsync = false;
		});
		try {
			tree.onClose(() => {
				unsubscribe();
				owned.clear();
				documents.delete(tree);
			});
		} catch (error) {
			unsubscribe();
			throw error;
		}
		elements = owned;
		documents.set(tree, elements);
	}
	let entry = elements.get(id);
	if (!entry) {
		entry = {
			origin: "unknown",
			forceAsync: !Object.hasOwn(node.attributes, "async"),
			alreadyStarted: false,
			parserNonceEligibility: "untrusted",
		};
		elements.set(id, entry);
	}
	return entry;
}

export function scriptElementState(
	tree: DocumentTree,
	id: number,
): Readonly<ScriptElementState> {
	const entry = state(tree, id);
	return Object.freeze({
		origin: entry.origin,
		forceAsync: entry.forceAsync,
		alreadyStarted: entry.alreadyStarted,
		parserNonceEligibility: entry.parserNonceEligibility,
	});
}

export function initializeParserScriptElement(
	tree: DocumentTree,
	id: number,
	token: unknown,
): void {
	const entry = state(tree, id);
	if (
		entry.origin !== "unknown" ||
		entry.parserNonceEligibility !== "untrusted" ||
		entry.alreadyStarted
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Cannot replace parser script provenance",
		);
	const metadata = consumeHtmlScriptToken(token);
	initializeScriptElement(tree, id, "parser");
	if (!metadata || metadata.kind !== "start") return;
	entry.parserNonceEligibility =
		metadata.duplicateAttribute ||
		metadata.unsafeAttribute ||
		metadata.selfClosing
			? "ineligible"
			: "pending";
	if (entry.parserNonceEligibility === "pending")
		entry.parserTokenOwner = metadata.owner;
}

export function completeParserScriptElement(
	tree: DocumentTree,
	id: number,
	token: unknown,
): void {
	const entry = state(tree, id);
	const metadata = consumeHtmlScriptToken(token);
	if (entry.origin !== "parser" || entry.parserNonceEligibility !== "pending")
		return;
	entry.parserNonceEligibility =
		metadata?.kind === "end" &&
		metadata.owner === entry.parserTokenOwner &&
		!metadata.duplicateAttribute &&
		!metadata.unsafeAttribute &&
		!metadata.selfClosing &&
		!entry.alreadyStarted
			? "eligible"
			: "ineligible";
	entry.parserTokenOwner = undefined;
}

export function initializeScriptElement(
	tree: DocumentTree,
	id: number,
	origin: ScriptElementOrigin,
): void {
	if (!["dynamic", "parser", "inert"].includes(origin))
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid script element origin",
		);
	const entry = state(tree, id);
	if (entry.origin === origin) return;
	if (entry.origin !== "unknown" && origin !== "inert")
		throw new AgentBrowserError(
			"invalid-input",
			"Cannot change script element origin",
		);
	entry.origin = origin;
	if (origin === "inert") {
		entry.parserNonceEligibility = "ineligible";
		entry.parserTokenOwner = undefined;
	}
	if (origin !== "dynamic") entry.forceAsync = false;
}

export function scriptElementAsync(tree: DocumentTree, id: number): boolean {
	return (
		state(tree, id).forceAsync ||
		Object.hasOwn(tree.get(id).attributes, "async")
	);
}

export function setScriptElementAsync(
	tree: DocumentTree,
	id: number,
	value: boolean,
): void {
	if (typeof value !== "boolean")
		throw new AgentBrowserError(
			"invalid-input",
			"Expected a boolean script async value",
		);
	const entry = state(tree, id);
	const previous = entry.forceAsync;
	entry.forceAsync = false;
	try {
		if (value) tree.setAttribute(id, "async", "");
		else tree.removeAttribute(id, "async");
	} catch (error) {
		entry.forceAsync = previous;
		throw error;
	}
}

export function markScriptElementStarted(
	tree: DocumentTree,
	id: number,
): boolean {
	const entry = state(tree, id);
	if (
		entry.alreadyStarted ||
		entry.origin === "unknown" ||
		entry.origin === "inert"
	)
		return false;
	entry.alreadyStarted = true;
	return true;
}

export function cloneScriptElementState(
	sourceTree: DocumentTree,
	sourceId: number,
	targetTree: DocumentTree,
	targetId: number,
): void {
	const source = scriptElementState(sourceTree, sourceId);
	initializeScriptElement(
		targetTree,
		targetId,
		source.origin === "unknown" || source.origin === "inert"
			? "inert"
			: "dynamic",
	);
	const target = state(targetTree, targetId);
	target.parserNonceEligibility = "cloned";
	target.parserTokenOwner = undefined;
	if (source.alreadyStarted) target.alreadyStarted = true;
}
