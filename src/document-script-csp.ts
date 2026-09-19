import { documentNonce } from "./document-nonce.js";
import type { DocumentMutation, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import { hasUnsupportedExecutionCsp } from "./execution-content-security-policy.js";
import type { NetworkResponse } from "./network.js";
import {
	type ScriptCspPolicy,
	createNativeDocumentScriptCspPolicy,
	createScriptCspPolicy,
	scriptCspPolicyLimits,
} from "./script-csp-policy.js";
import { scriptElementState } from "./script-element-state.js";

export interface DocumentScriptCspLimits {
	readonly maxScanWork: number;
	readonly maxMutationWork: number;
	readonly maxScriptWork: number;
}

export interface DocumentScriptCsp {
	readonly enforced: boolean;
	readonly stringCompilation: "allow" | "deny" | undefined;
	readonly unsupported: boolean;
	readonly version: number;
	readonly reason: string | undefined;
	allowsScript(id: number): boolean;
	prepareScript(id: number): DocumentScriptAdmission | undefined;
	allowsRequest(
		admission: DocumentScriptAdmission,
		url: string,
		redirectCount: number,
	): boolean;
	allowsBase(url: string): boolean;
	onInvalidated(listener: () => void): () => void;
	close(): void;
}

export interface DocumentScriptAdmission {
	allows(url?: string, redirectCount?: number): boolean;
}

const owners = new WeakMap<DocumentTree, DocumentScriptCsp>();
const ownerInputs = new WeakMap<
	DocumentTree,
	{ url: string; headers: string; topLevelDocument: boolean }
>();

export function snapshotDocumentScriptCspHeaders(headers: unknown): unknown {
	try {
		if (!headers || typeof headers !== "object" || Array.isArray(headers))
			return null;
		const prototype = Object.getPrototypeOf(headers);
		if (prototype !== null && prototype !== Object.prototype) return null;
		if (
			"content-security-policy" in headers &&
			!Object.hasOwn(headers, "content-security-policy")
		)
			return null;
		const names = Object.getOwnPropertyNames(headers);
		if (names.length > scriptCspPolicyLimits.maxHeaderFields) return null;
		const snapshot = Object.create(null);
		let values = 0;
		let units = 0;
		for (const name of names) {
			const descriptor = Object.getOwnPropertyDescriptor(headers, name);
			if (!descriptor) return null;
			if (
				name.length !== 23 ||
				name.toLowerCase() !== "content-security-policy"
			) {
				Object.defineProperty(snapshot, name, descriptor);
				continue;
			}
			if (
				!Object.hasOwn(descriptor, "value") ||
				!Array.isArray(descriptor.value)
			)
				return null;
			const entries = descriptor.value;
			const length = Object.getOwnPropertyDescriptor(entries, "length")?.value;
			if (
				!Number.isSafeInteger(length) ||
				length < 1 ||
				length > scriptCspPolicyLimits.maxHeaderValues - values
			)
				return null;
			values += length;
			const copied: string[] = [];
			for (let index = 0; index < length; index++) {
				const item = Object.getOwnPropertyDescriptor(entries, String(index));
				if (
					!item ||
					!Object.hasOwn(item, "value") ||
					typeof item.value !== "string"
				)
					return null;
				units += item.value.length;
				if (units > scriptCspPolicyLimits.maxPolicyCodeUnits) return null;
				copied.push(item.value);
			}
			Object.defineProperty(snapshot, name, {
				value: Object.freeze(copied),
				enumerable: descriptor.enumerable,
			});
		}
		return Object.freeze(snapshot);
	} catch {
		return null;
	}
}

function headerKey(headers: unknown): string {
	return JSON.stringify(
		headers === null
			? null
			: Object.getOwnPropertyNames(headers)
					.filter(
						(name) =>
							name.length === 23 &&
							name.toLowerCase() === "content-security-policy",
					)
					.map((name) => [
						name,
						Object.getOwnPropertyDescriptor(headers, name)?.value,
					]),
	);
}

export function initializeDocumentScriptCsp(
	tree: DocumentTree,
	headers: unknown,
	topLevelDocument = false,
): DocumentScriptCsp | undefined {
	const topLevel = topLevelDocument === true;
	const snapshot = snapshotDocumentScriptCspHeaders(headers);
	const key = headerKey(snapshot);
	const existing = owners.get(tree);
	if (existing) {
		const input = ownerInputs.get(tree);
		if (
			!input ||
			input.url !== tree.url ||
			input.headers !== key ||
			(input.topLevelDocument !== topLevel &&
				createNativeDocumentScriptCspPolicy(tree, snapshot).unsupported)
		)
			throw new AgentBrowserError(
				"policy-denied",
				"Document script policy does not match the response",
			);
		return existing;
	}
	const parsed = createNativeDocumentScriptCspPolicy(tree, snapshot, topLevel);
	const enforced = hasUnsupportedExecutionCsp(
		snapshot as NetworkResponse["headers"],
		topLevel,
	);
	return bindPolicy(
		tree,
		parsed,
		{},
		enforced || parsed.unsupported,
		key,
		topLevel,
	);
}
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
	const snapshot = snapshotDocumentScriptCspHeaders(headers);
	return bindPolicy(
		tree,
		createScriptCspPolicy(tree.url, snapshot),
		limitOverrides,
		true,
		headerKey(snapshot),
	);
}

function bindPolicy(
	tree: DocumentTree,
	parsed: ScriptCspPolicy,
	limitOverrides: Partial<DocumentScriptCspLimits>,
	enforced: boolean,
	headers: string,
	topLevelDocument = false,
): DocumentScriptCsp {
	tree.get(tree.root);
	if (owners.has(tree))
		throw new AgentBrowserError(
			"invalid-input",
			"Document CSP is already bound",
		);
	const admissions = new WeakSet<DocumentScriptAdmission>();
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
	const listeners = new Set<() => void>();
	const invalidate = () => {
		const pending = [...listeners];
		listeners.clear();
		for (const listener of pending) {
			try {
				listener();
			} catch {}
		}
	};
	const fail = (reason: string) => {
		if (failure) return;
		failure = reason;
		version++;
		invalidate();
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
		invalidate();
	};
	const prepareScript = (id: number): DocumentScriptAdmission | undefined => {
		if (!current() || !Number.isSafeInteger(id) || id < 1) return undefined;
		try {
			const node = tree.get(id);
			if (!isHtmlElement(node, "script")) return undefined;
			let work = 0;
			let ancestor: number | null = id;
			while (ancestor !== tree.root) {
				if (ancestor === null || ++work > limits.maxScriptWork)
					return undefined;
				ancestor = tree.parentOf(ancestor);
			}
			const state = scriptElementState(tree, id);
			if (state.alreadyStarted || state.parserNonceEligibility === "cloned")
				return undefined;
			if (
				state.origin !== "dynamic" &&
				!(
					state.origin === "parser" &&
					state.parserNonceEligibility === "eligible"
				)
			)
				return undefined;
			for (const [name, value] of Object.entries(node.attributes)) {
				work += name.length + value.length;
				if (
					work > limits.maxScriptWork ||
					/<script|<style/i.test(name) ||
					/<script|<style/i.test(value)
				)
					return undefined;
			}
			const type = (node.attributes.type ?? "").trim().toLowerCase();
			if (
				!["", "text/javascript", "application/javascript", "module"].includes(
					type,
				)
			)
				return undefined;
			const nonce = documentNonce(tree, id);
			if (
				work + nonce.length > limits.maxScriptWork ||
				/<script|<style/i.test(nonce)
			)
				return undefined;
			const metadata = Object.freeze({
				kind: Object.hasOwn(node.attributes, "src")
					? ("external" as const)
					: ("inline" as const),
				nonce,
				parserInserted: state.origin === "parser",
				nonceable: true,
			});
			const admission = Object.freeze({
				allows: Object.freeze(
					(url?: string, redirectCount?: number) =>
						current() &&
						parsed.allowsScript({
							...metadata,
							...(type === "module" && url !== undefined
								? { kind: "external" as const }
								: {}),
							...(url === undefined && redirectCount === undefined
								? {}
								: { url, redirectCount }),
						}),
				),
			});
			admissions.add(admission);
			return admission;
		} catch {
			return undefined;
		}
	};
	const owner: DocumentScriptCsp = Object.freeze({
		enforced,
		stringCompilation: enforced ? parsed.stringCompilation : undefined,
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
		prepareScript: Object.freeze(prepareScript),
		allowsScript: Object.freeze(
			(id: number) => prepareScript(id)?.allows() ?? false,
		),
		allowsRequest: Object.freeze(
			(
				admission: DocumentScriptAdmission,
				url: string,
				redirectCount: number,
			) => admissions.has(admission) && admission.allows(url, redirectCount),
		),
		allowsBase: Object.freeze(
			(url: string) => current() && parsed.allowsBase(url),
		),
		onInvalidated: Object.freeze((listener: () => void) => {
			if (typeof listener !== "function")
				throw new AgentBrowserError("invalid-input", "Invalid CSP listener");
			if (listeners.size >= 64) fail("listener-limit");
			if (current()) listeners.add(listener);
			else listener();
			return () => {
				listeners.delete(listener);
			};
		}),
		close: Object.freeze(close),
	});
	owners.set(tree, owner);
	ownerInputs.set(tree, { url: tree.url, headers, topLevelDocument });
	try {
		unregisterMutation = tree.onMutation(changed);
		unregisterClose = tree.onClose(close);
		if (!failure) scan(tree.root);
	} catch {
		fail("owner-setup-or-scan-limit");
		unregisterMutation?.();
		unregisterClose?.();
	}
	if (enforced) tree.bindNonceHiding(limits.maxScanWork);
	return owner;
}
