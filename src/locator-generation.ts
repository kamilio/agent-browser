import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type { DocumentQueries } from "./selectors.js";
import { snapshotElementRole, snapshotRoleCandidates } from "./snapshot.js";
import { resolveBrowserTarget } from "./target-locator.js";

export const locatorGenerationLimits = Object.freeze({
	maxDocumentNodes: 50_000,
	maxSourceCodeUnits: 8192,
	maxPathDepth: 64,
	maxPathWork: 100_000,
});

export interface GeneratedLocator {
	ref: string;
	revision: number;
	locator: string;
	strategy:
		| "test-id"
		| "role"
		| "id"
		| "placeholder"
		| "alt-text"
		| "title"
		| "path";
	structural: boolean;
	partial: true;
}

function quote(value: string) {
	return JSON.stringify(value).replace(
		/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
		(character) =>
			Array.from(
				{ length: character.length },
				(_, index) =>
					`\\u${character.charCodeAt(index).toString(16).padStart(4, "0")}`,
			).join(""),
	);
}

function cssQuote(value: string) {
	return `"${value.replace(
		/["\\\p{Cc}\p{Cf}]/gu,
		(character) => `\\${character.codePointAt(0)?.toString(16)} `,
	)}"`;
}

export function generateLocator(
	tree: DocumentTree,
	queries: DocumentQueries,
	target: string,
): GeneratedLocator {
	const ref = resolveBrowserTarget(tree, queries, target);
	const node = tree.resolve(ref);
	if (node.kind !== "element")
		throw new AgentBrowserError(
			"invalid-input",
			"Locator generation requires an element",
		);
	if (tree.nodeCount > locatorGenerationLimits.maxDocumentNodes)
		throw new AgentBrowserError(
			"resource-limit",
			"Locator generation document limit exceeded",
		);
	const candidate = (
		locator: string,
		strategy: GeneratedLocator["strategy"],
	): GeneratedLocator | undefined => {
		if (locator.length > locatorGenerationLimits.maxSourceCodeUnits) return;
		try {
			if (resolveBrowserTarget(tree, queries, locator) !== ref) return;
		} catch (error) {
			if (
				error instanceof AgentBrowserError &&
				["not-found", "not-actionable"].includes(error.code)
			)
				return;
			throw error;
		}
		return {
			ref,
			revision: tree.revision,
			locator,
			strategy,
			structural: strategy === "path",
			partial: true,
		};
	};

	const testId = node.attributes["data-testid"];
	if (testId !== undefined) {
		const result = candidate(`getByTestId(${quote(testId)})`, "test-id");
		if (result) return result;
	}
	const role = snapshotElementRole(tree, node.id);
	if (role) {
		const entry = snapshotRoleCandidates(tree, role).find(
			(entry) => entry.ref === ref,
		);
		if (entry) {
			const result = candidate(
				`getByRole(${quote(role)}, {name: ${quote(entry.name)}, exact: true})`,
				"role",
			);
			if (result) return result;
		}
	}
	const identifier = node.attributes.id;
	if (identifier !== undefined && !identifier.includes("\0")) {
		const result = candidate(
			`locator(${quote(`[id=${cssQuote(identifier)}]`)})`,
			"id",
		);
		if (result) return result;
	}
	for (const [attribute, method, strategy] of [
		["placeholder", "getByPlaceholder", "placeholder"],
		["alt", "getByAltText", "alt-text"],
		["title", "getByTitle", "title"],
	] as const) {
		const value = node.attributes[attribute];
		if (value !== undefined) {
			const result = candidate(
				`${method}(${quote(value)}, {exact: true})`,
				strategy,
			);
			if (result) return result;
		}
	}

	const path: string[] = [];
	let current = node;
	let work = 0;
	while (current.parent !== null) {
		if (path.length >= locatorGenerationLimits.maxPathDepth)
			throw new AgentBrowserError(
				"resource-limit",
				"Locator generation path depth exceeded",
			);
		const parent = tree.get(current.parent);
		let position = 0;
		for (const child of parent.children) {
			if (++work > locatorGenerationLimits.maxPathWork)
				throw new AgentBrowserError(
					"resource-limit",
					"Locator generation path work exceeded",
				);
			if (tree.get(child).kind === "element") position++;
			if (child === current.id) break;
		}
		path.unshift(
			`:nth-child(${position})${parent.id === tree.root ? ":not(* *)" : ""}`,
		);
		if (parent.id === tree.root) break;
		current = parent;
	}
	const result = candidate(`locator(${quote(path.join(" > "))})`, "path");
	if (!result)
		throw new AgentBrowserError(
			"resource-limit",
			"No unique locator fits the generation limits",
		);
	return result;
}
