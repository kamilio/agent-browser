import { documentNonce } from "./document-nonce.js";
import type { DocumentMutation, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { createScriptCspPolicy } from "./script-csp-policy.js";
import { scriptElementState } from "./script-element-state.js";

export interface DocumentScriptCspLimits {
	readonly maxScanWork: number;
	readonly maxMutationWork: number;
	readonly maxScriptWork: number;
}

export interface DocumentScriptCsp {
	readonly unsupported: boolean;
	readonly version: number;
	readonly reason: string | undefined;
	allowsScript(id: number): boolean;
	allowsBase(url: string): boolean;
	close(): void;
}

const owners = new WeakMap<DocumentTree, DocumentScriptCsp>();
const defaultLimits: DocumentScriptCspLimits = Object.freeze({
	maxScanWork: 2_000_000,
	maxMutationWork: 100_000,
	maxScriptWork: 32768,
});

function readLimits(value: unknown): DocumentScriptCspLimits | undefined {
	try {
		if (typeof value !== "object" || value === null || Array.isArray(value))
			return undefined;
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== null && prototype !== Object.prototype) return undefined;
		if (Object.getOwnPropertySymbols(value).length) return undefined;
		const names = Object.getOwnPropertyNames(value);
		if (names.length > 3) return undefined;
		const result = { ...defaultLimits };
		for (const name of names) {
			if (!Object.hasOwn(result, name)) return undefined;
			const descriptor = Object.getOwnPropertyDescriptor(value, name);
			if (!descriptor || !Object.hasOwn(descriptor, "value")) return undefined;
			const limit: unknown = descriptor.value;
			const key = name as keyof DocumentScriptCspLimits;
			if (
				typeof limit !== "number" ||
				!Number.isSafeInteger(limit) ||
				limit < 1 ||
				limit > defaultLimits[key]
			)
				return undefined;
			result[key] = limit;
		}
		return Object.freeze(result);
	} catch {
		return undefined;
	}
}

export function documentScriptCsp(
	tree: DocumentTree,
): DocumentScriptCsp | undefined {
	return owners.get(tree);
}

export function bindDocumentScriptCsp(
	tree: DocumentTree,
	headers: unknown,
	limitOverrides: Partial<DocumentScriptCspLimits> = {},
): DocumentScriptCsp {
	tree.get(tree.root);
	if (owners.has(tree))
		throw new AgentBrowserError(
			"invalid-input",
			"Document CSP is already bound",
		);
	const parsed = createScriptCspPolicy(tree.url, headers);
	const configured = readLimits(limitOverrides);
	const limits = configured ?? defaultLimits;
	let failure = !configured
		? "invalid-limits"
		: parsed.unsupported
			? "unsupported-headers"
			: undefined;
	let closed = false;
	let version = 0;
	let scanWork = 0;
	let mutationWork = 0;
	let observed = tree.mutationMetrics().notifications;
	let unregisterMutation: (() => void) | undefined;
	let unregisterClose: (() => unknown) | undefined;
	const fail = (reason: string) => {
		if (failure) return;
		failure = reason;
		version++;
	};
	const current = () => {
		if (closed || failure) return false;
		try {
			tree.get(tree.root);
			if (tree.nonceHidingFailed) fail("nonce-work-limit");
			if (tree.mutationMetrics().notifications !== observed)
				fail("unobserved-mutation");
		} catch {
			fail("closed-document");
		}
		return !failure;
	};
	const debit = (amount: number) => {
		scanWork += amount;
		if (scanWork > limits.maxScanWork)
			throw new AgentBrowserError(
				"resource-limit",
				"Document CSP scan work exceeded",
			);
	};
	const scan = (start: number) => {
		for (const { node } of tree.walk(start)) {
			debit(1);
			if (!isHtmlElement(node, "meta")) continue;
			const pragma = node.attributes["http-equiv"] ?? "";
			debit(pragma.length);
			if (pragma.trim().toLowerCase() === "content-security-policy") {
				fail("meta-policy");
				return;
			}
		}
	};
	const changed = (record: DocumentMutation) => {
		if (closed || failure) return;
		try {
			const notifications = tree.mutationMetrics().notifications;
			if (notifications !== observed + 1) {
				fail("mutation-order");
				return;
			}
			observed = notifications;
			if (++mutationWork > limits.maxMutationWork) {
				fail("mutation-limit");
				return;
			}
			debit(record.ancestors.length);
			if (!record.ancestors.includes(tree.root)) return;
			if (record.type === "childList") {
				for (const id of record.addedNodes) {
					scan(id);
					if (failure) return;
				}
			} else if (
				record.type === "attributes" &&
				isHtmlElement(tree.get(record.target), "meta")
			)
				scan(record.target);
		} catch {
			fail("scan-limit-or-metadata-error");
		}
	};
	const close = () => {
		if (closed) return;
		closed = true;
		version++;
		unregisterMutation?.();
		unregisterClose?.();
	};
	const owner: DocumentScriptCsp = Object.freeze({
		get unsupported() {
			return !current();
		},
		get version() {
			current();
			return version;
		},
		get reason() {
			current();
			return closed ? "closed" : failure;
		},
		allowsScript: Object.freeze((id: number) => {
			if (!current() || !Number.isSafeInteger(id) || id < 1) return false;
			try {
				const node = tree.get(id);
				if (!isHtmlElement(node, "script")) return false;
				let work = 0;
				let ancestor: number | null = id;
				while (ancestor !== tree.root) {
					if (ancestor === null || ++work > limits.maxScriptWork) return false;
					ancestor = tree.parentOf(ancestor);
				}
				const state = scriptElementState(tree, id);
				if (state.alreadyStarted || state.parserNonceEligibility === "cloned")
					return false;
				if (
					state.origin !== "dynamic" &&
					!(
						state.origin === "parser" &&
						state.parserNonceEligibility === "eligible"
					)
				)
					return false;
				for (const [name, value] of Object.entries(node.attributes)) {
					work += name.length + value.length;
					if (
						work > limits.maxScriptWork ||
						/<script|<style/i.test(name) ||
						/<script|<style/i.test(value)
					)
						return false;
				}
				const type = (node.attributes.type ?? "").trim().toLowerCase();
				if (!["", "text/javascript", "application/javascript"].includes(type))
					return false;
				const nonce = documentNonce(tree, id);
				if (
					work + nonce.length > limits.maxScriptWork ||
					/<script|<style/i.test(nonce)
				)
					return false;
				return parsed.allowsScript({
					kind: Object.hasOwn(node.attributes, "src") ? "external" : "inline",
					nonce,
					parserInserted: state.origin === "parser",
					nonceable: true,
				});
			} catch {
				return false;
			}
		}),
		allowsBase: Object.freeze(
			(url: string) => current() && parsed.allowsBase(url),
		),
		close: Object.freeze(close),
	});
	owners.set(tree, owner);
	try {
		unregisterMutation = tree.onMutation(changed);
		unregisterClose = tree.onClose(close);
		if (!failure) scan(tree.root);
	} catch {
		fail("owner-setup-or-scan-limit");
		unregisterMutation?.();
		unregisterClose?.();
	}
	tree.bindNonceHiding(limits.maxScanWork);
	return owner;
}
