import { createHash } from "node:crypto";
import { decodeUrlFragment, urlFragment } from "../src/document-url.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";

export interface ResearchFragmentIdentity {
	readonly codeUnits: number;
	readonly sha256: string;
	readonly digestEncoding: "utf8-serialized-fragment";
}

export interface ResearchFragmentReport {
	readonly schemaVersion: 1;
	readonly requested: ResearchFragmentIdentity | null;
	readonly effective?: ResearchFragmentIdentity | null;
	readonly resolution:
		| "pending"
		| "absent"
		| "element"
		| "unmatched"
		| "document-top"
		| "unsupported-directive";
	readonly target?: string;
	readonly semantics: "native-dom-target-no-scroll-or-script";
}

function validatedFragment(value: string): string | null {
	if (typeof value !== "string" || value.length > 16_384)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research fragment URL",
		);
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research fragment URL",
		);
	}
	if (parsed.href.length > 16_384)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid research fragment URL",
		);
	return urlFragment(parsed);
}

function fragmentIdentity(
	fragment: string | null,
): ResearchFragmentIdentity | null {
	return fragment === null
		? null
		: {
				codeUnits: fragment.length,
				sha256: createHash("sha256").update(fragment, "utf8").digest("hex"),
				digestEncoding: "utf8-serialized-fragment",
			};
}

export function researchFragmentReport(
	requestedUrl: string,
	effectiveUrl?: string,
	tree?: DocumentTree,
): ResearchFragmentReport | undefined {
	const requested = validatedFragment(requestedUrl);
	const effective =
		effectiveUrl === undefined ? undefined : validatedFragment(effectiveUrl);
	if (requested === null && (effective === undefined || effective === null))
		return undefined;
	const report: ResearchFragmentReport = {
		schemaVersion: 1,
		requested: fragmentIdentity(requested),
		...(effective === undefined
			? {}
			: { effective: fragmentIdentity(effective) }),
		resolution: "pending",
		semantics: "native-dom-target-no-scroll-or-script",
	};
	if (tree) tree.reference(tree.root);
	if (!tree || effective === undefined) return report;
	if (effective === null) return { ...report, resolution: "absent" };
	if (effective === "") return { ...report, resolution: "document-top" };
	if (effective.includes(":~:"))
		return { ...report, resolution: "unsupported-directive" };
	const target = tree.targetElement;
	if (target !== null)
		return { ...report, resolution: "element", target: tree.reference(target) };
	return {
		...report,
		resolution: /^[tT][oO][pP]$/.test(decodeUrlFragment(effective))
			? "document-top"
			: "unmatched",
	};
}
