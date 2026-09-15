import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ResearchMimeInterpretation,
	ResearchReaderMimePolicy,
} from "./research-mime-policy.js";

export const researchReaderProfile = "native-semantic-reader-v1";

export type ResearchReaderRawPolicy = "separate-omitted-raw-v1";

export type ResearchReaderVisibilityPolicy =
	| "source-hidden-v1"
	| "source-hidden-inline-v1";

export function validateResearchReaderVisibilityPolicy(
	value: unknown,
): ResearchReaderVisibilityPolicy | undefined {
	if (
		value === undefined ||
		value === "source-hidden-v1" ||
		value === "source-hidden-inline-v1"
	)
		return value;
	throw new AgentBrowserError(
		"invalid-input",
		"Invalid reader visibility policy",
	);
}

export function researchReaderHiddenContentSemantics(
	policy: ResearchReaderVisibilityPolicy | undefined,
) {
	if (policy === "source-hidden-inline-v1")
		return "source-attributes-and-inline-display" as const;
	return policy === "source-hidden-v1" ? ("source-attributes" as const) : false;
}

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
	hiddenContentSemantics:
		| false
		| "source-attributes"
		| "source-attributes-and-inline-display";
	visibilityPolicy?: ResearchReaderVisibilityPolicy;
	mimePolicy?: ResearchReaderMimePolicy;
	readonly mimeInterpretation?: Readonly<ResearchMimeInterpretation>;
	sourceHiddenSubtrees?: number;
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

export function researchReaderNoticeFor(
	report?: Readonly<ResearchReaderReport>,
) {
	if (
		report?.visibilityPolicy === "source-hidden-inline-v1" &&
		report.hiddenContentSemantics === "source-attributes-and-inline-display"
	)
		return "# Partial research reader: scripts/styles/SVG/MathML omitted; forms inert; source-hidden and simple inline display:none subtrees omitted; computed CSS visibility ignored";
	return report?.visibilityPolicy === "source-hidden-v1" &&
		report.hiddenContentSemantics === "source-attributes"
		? "# Partial research reader: scripts/styles/SVG/MathML omitted; forms inert; source-hidden subtrees omitted; CSS visibility ignored"
		: researchReaderNotice;
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
			...(report.mimeInterpretation
				? {
						mimeInterpretation: Object.freeze({ ...report.mimeInterpretation }),
					}
				: {}),
			...(report.mathAlternatives
				? { mathAlternatives: Object.freeze({ ...report.mathAlternatives }) }
				: {}),
			...(report.omittedRaw
				? { omittedRaw: Object.freeze({ ...report.omittedRaw }) }
				: {}),
		}),
	);
}
