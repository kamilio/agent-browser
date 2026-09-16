import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { ExtractedNode } from "./extraction.js";
import { utf8ByteLength } from "./utf8-byte-length.js";

export const codeSourceContextLimits = Object.freeze({
	maxBlocks: 128,
	maxVisitedNodes: 50_000,
	maxTextCodeUnits: 1_000_000,
	maxClassCodeUnits: 1024,
	maxAttributesPerBlock: 64,
	maxRangesPerBlock: 256,
	maxRecords: 2048,
	maxTotalClassCodeUnits: 65_536,
});

export interface CodeSourceContexts {
	readonly kind: "native-code-source-context-v1";
	readonly scope: "selected-extracted-pre-text";
	readonly offsetUnit: "utf-16-code-unit";
	readonly partial: true;
	readonly rendered: false;
	readonly verified: false;
	readonly entries: readonly {
		readonly ref: string;
		readonly textCodeUnits: number;
		readonly attributes: readonly {
			readonly tag: "pre" | "code";
			readonly class: string;
			readonly start: number;
			readonly end: number;
		}[];
		readonly ranges: readonly {
			readonly kind: "class" | "emphasis";
			readonly tag: "span" | "strong" | "b" | "em" | "i";
			readonly token?: "boring";
			readonly start: number;
			readonly end: number;
		}[];
		readonly truncated: boolean;
	}[];
	readonly truncated: boolean;
}

type Entry = CodeSourceContexts["entries"][number];
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
type Attribute = Mutable<Entry["attributes"][number]>;
type Range = Mutable<Entry["ranges"][number]>;
type Block = Omit<Mutable<Entry>, "attributes" | "ranges"> & {
	attributes: Attribute[];
	ranges: Range[];
};

interface ScanState {
	visitedNodes: number;
	textCodeUnits: number;
	records: number;
	classCodeUnits: number;
}

interface Frame {
	node: ExtractedNode;
	nextChild: number;
	record?: Attribute | Range;
}

const textSinks = new Set([
	"paragraph",
	"heading",
	"code",
	"strong",
	"emphasis",
]);

function sourceNode(tree: DocumentTree, node: ExtractedNode) {
	return tree.get(Number(node.ref.slice(1)));
}

function qualification(
	source: Readonly<DocumentNode>,
	block: Block,
	state: ScanState,
): Attribute | Range | undefined {
	if (!isHtmlElement(source)) return;
	const tag = source.tagName;
	const start = block.textCodeUnits;
	if (tag === "pre" || tag === "code") {
		if (!Object.hasOwn(source.attributes, "class")) return;
		const className = source.attributes.class;
		if (
			className.length > codeSourceContextLimits.maxClassCodeUnits ||
			state.classCodeUnits + className.length >
				codeSourceContextLimits.maxTotalClassCodeUnits ||
			block.attributes.length >=
				codeSourceContextLimits.maxAttributesPerBlock ||
			state.records >= codeSourceContextLimits.maxRecords
		) {
			block.truncated = true;
			return;
		}
		const attribute: Attribute = { tag, class: className, start, end: start };
		block.attributes.push(attribute);
		state.records++;
		state.classCodeUnits += className.length;
		return attribute;
	}
	let range: Range;
	if (tag === "span") {
		if (!Object.hasOwn(source.attributes, "class")) return;
		const className = source.attributes.class;
		if (className.length > codeSourceContextLimits.maxClassCodeUnits) {
			block.truncated = true;
			return;
		}
		if (!/(?:^|[\t\n\f\r ])boring(?:$|[\t\n\f\r ])/.test(className)) return;
		range = { kind: "class", tag, token: "boring", start, end: start };
	} else if (tag === "strong" || tag === "b" || tag === "em" || tag === "i") {
		range = { kind: "emphasis", tag, start, end: start };
	} else return;
	if (
		block.ranges.length >= codeSourceContextLimits.maxRangesPerBlock ||
		state.records >= codeSourceContextLimits.maxRecords
	) {
		block.truncated = true;
		return;
	}
	block.ranges.push(range);
	state.records++;
	return range;
}

function scanBlock(
	tree: DocumentTree,
	root: ExtractedNode,
	source: Readonly<DocumentNode>,
	state: ScanState,
): Block | undefined {
	const block: Block = {
		ref: root.ref,
		textCodeUnits: 0,
		attributes: [],
		ranges: [],
		truncated: false,
	};
	const pending: Frame[] = [
		{ node: root, nextChild: 0, record: qualification(source, block, state) },
	];
	while (pending.length) {
		const frame = pending[pending.length - 1];
		const children = frame.node.children;
		if (!children || frame.nextChild >= children.length) {
			if (frame.record) frame.record.end = block.textCodeUnits;
			pending.pop();
			continue;
		}
		if (state.visitedNodes >= codeSourceContextLimits.maxVisitedNodes) return;
		const node = children[frame.nextChild++];
		state.visitedNodes++;
		const units =
			node.text !== undefined
				? node.text.length
				: node.type === "break"
					? 1
					: 0;
		if (state.textCodeUnits + units > codeSourceContextLimits.maxTextCodeUnits)
			return;
		const record = qualification(sourceNode(tree, node), block, state);
		block.textCodeUnits += units;
		state.textCodeUnits += units;
		pending.push({ node, nextChild: 0, record });
	}
	return block;
}

function snapshot(
	entries: readonly Entry[],
	truncated: boolean,
): CodeSourceContexts {
	return Object.freeze({
		kind: "native-code-source-context-v1",
		scope: "selected-extracted-pre-text",
		offsetUnit: "utf-16-code-unit",
		partial: true,
		rendered: false,
		verified: false,
		entries: Object.freeze(
			entries.map((entry) =>
				Object.freeze({
					ref: entry.ref,
					textCodeUnits: entry.textCodeUnits,
					attributes: Object.freeze(
						entry.attributes.map((attribute) =>
							Object.freeze({ ...attribute }),
						),
					),
					ranges: Object.freeze(
						entry.ranges.map((range) => Object.freeze({ ...range })),
					),
					truncated: entry.truncated,
				}),
			),
		),
		truncated,
	});
}

export function collectCodeSourceContexts(
	tree: DocumentTree,
	root: ExtractedNode,
): CodeSourceContexts | undefined {
	const state: ScanState = {
		visitedNodes: 0,
		textCodeUnits: 0,
		records: 0,
		classCodeUnits: 0,
	};
	const entries: Entry[] = [];
	const pending = [{ nodes: [root], nextChild: 0 }];
	let blocks = 0;
	let truncated = false;
	while (pending.length) {
		const frame = pending[pending.length - 1];
		if (frame.nextChild >= frame.nodes.length) {
			pending.pop();
			continue;
		}
		if (state.visitedNodes >= codeSourceContextLimits.maxVisitedNodes) {
			truncated = true;
			break;
		}
		const node = frame.nodes[frame.nextChild++];
		state.visitedNodes++;
		if (node.type === "pre") {
			const source = sourceNode(tree, node);
			if (!isHtmlElement(source, "pre")) continue;
			if (blocks >= codeSourceContextLimits.maxBlocks) {
				truncated = true;
				break;
			}
			blocks++;
			const block = scanBlock(tree, node, source, state);
			if (!block) {
				truncated = true;
				break;
			}
			if (block.attributes.length || block.ranges.length || block.truncated)
				entries.push(block);
			truncated ||= block.truncated;
		} else if (!textSinks.has(node.type) && node.children?.length) {
			pending.push({ nodes: node.children, nextChild: 0 });
		}
	}
	if (!entries.length && !truncated) return;
	return snapshot(entries, truncated);
}

export function fitCodeSourceContexts(
	value: CodeSourceContexts,
	maxBytes: number,
): CodeSourceContexts | undefined {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
		throw new AgentBrowserError(
			"resource-limit",
			"Invalid code source context byte limit",
		);
	const complete = snapshot(value.entries, value.truncated);
	const entryBytes = complete.entries.map((entry) =>
		utf8ByteLength(JSON.stringify(entry)),
	);
	const empty = snapshot([], value.truncated);
	let bytes = utf8ByteLength(JSON.stringify(empty));
	for (let index = 0; index < entryBytes.length; index++)
		bytes += entryBytes[index] + (index > 0 ? 1 : 0);
	if (bytes <= maxBytes) return complete;
	const minimal = snapshot([], true);
	bytes = utf8ByteLength(JSON.stringify(minimal));
	if (bytes > maxBytes) return;
	let count = 0;
	while (count < entryBytes.length - 1) {
		const nextBytes = bytes + entryBytes[count] + (count > 0 ? 1 : 0);
		if (nextBytes > maxBytes) break;
		bytes = nextBytes;
		count++;
	}
	return snapshot(complete.entries.slice(0, count), true);
}
