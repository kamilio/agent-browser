import type { DocumentTree } from "./document.js";

export interface ScriptLoadReport {
	mode: "classic";
	partial: true;
	discovered: number;
	executed: number;
	skipped: number;
	failed: number;
	external: number;
	sourceBytes: number;
	halted: boolean;
	complete: boolean;
	issues: Readonly<Record<string, number>>;
}

export interface DocumentScriptState {
	readyState: "loading" | "interactive" | "complete";
	currentScript: number | null;
	report?: Readonly<ScriptLoadReport>;
}

const states = new WeakMap<DocumentTree, Readonly<DocumentScriptState>>();

export function documentScriptState(tree: DocumentTree) {
	return states.get(tree);
}

export function updateDocumentScriptState(
	tree: DocumentTree,
	update: Partial<DocumentScriptState>,
) {
	if (!states.has(tree)) tree.onClose(() => states.delete(tree));
	const value = {
		readyState: "loading" as const,
		currentScript: null,
		...states.get(tree),
		...update,
	};
	states.set(
		tree,
		Object.freeze({
			...value,
			...(value.report
				? {
						report: Object.freeze({
							...value.report,
							issues: Object.freeze({ ...value.report.issues }),
						}),
					}
				: {}),
		}),
	);
}
