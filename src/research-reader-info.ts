import type { DocumentTree } from "./document.js";

export const researchReaderProfile = "native-semantic-reader-v1";

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
	outputCodeUnits: number;
	tokens: number;
	omittedTokens: number;
	omittedSubtrees: Readonly<Record<string, number>>;
	ignoredAttributes: number;
	unwrappedElements: number;
	tokenizerIssues: number;
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
		}),
	);
}
