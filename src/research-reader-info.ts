import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";

export const researchReaderProfile = "native-semantic-reader-v1";

export type ResearchReaderRawPolicy = "separate-omitted-raw-v1";

export function validateResearchReaderRawPolicy(
	value: unknown,
): ResearchReaderRawPolicy | undefined {
	if (value === undefined || value === "separate-omitted-raw-v1") return value;
	throw new AgentBrowserError("invalid-input", "Invalid reader raw policy");
}

export interface ResearchReaderOmittedRawReport {
	readonly codeUnits: number;
	readonly workUnits: number;
	readonly steps: number;
	readonly elements: number;
	readonly maxWorkUnits: number;
	readonly maxWindowCodeUnits: number;
}

export const researchReaderNotice =
	"# Partial research reader: scripts/styles/SVG/MathML omitted; forms inert; hidden-content semantics ignored";

export interface ResearchReaderReport {
	profile: typeof researchReaderProfile;
	partial: true;
	scripting: false;
	styling: false;
	hiddenContentSemantics: false;
	encoding?: string;
	sourceCodeUnits: number;
	textCodeUnits: number;
	mathAlternatives?: Readonly<{ elements: number; codeUnits: number }>;
	outputCodeUnits: number;
	tokens: number;
	omittedTokens: number;
	omittedSubtrees: Readonly<Record<string, number>>;
	ignoredAttributes: number;
	unwrappedElements: number;
	tokenizerIssues: number;
	rawTextPolicy?: ResearchReaderRawPolicy;
	omittedRaw?: Readonly<ResearchReaderOmittedRawReport>;
}

const information = new WeakMap<DocumentTree, Readonly<ResearchReaderReport>>();

export function researchReaderInfo(tree: DocumentTree) {
	return information.get(tree);
}

export function setResearchReaderInfo(
	tree: DocumentTree,
	report: Readonly<ResearchReaderReport>,
) {
	if (!information.has(tree)) tree.onClose(() => information.delete(tree));
	information.set(
		tree,
		Object.freeze({
			...report,
			omittedSubtrees: Object.freeze({ ...report.omittedSubtrees }),
			...(report.mathAlternatives
				? { mathAlternatives: Object.freeze({ ...report.mathAlternatives }) }
				: {}),
			...(report.omittedRaw
				? { omittedRaw: Object.freeze({ ...report.omittedRaw }) }
				: {}),
		}),
	);
}
