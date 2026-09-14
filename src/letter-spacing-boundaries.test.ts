import { afterEach, expect, it } from "vitest";
import { layoutDocument } from "./document-layout.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const diagnostic = "letter-spacing-atomic-boundary-not-supported";
const atomic = '<span class="atomic"></span>';

afterEach(() => {
	for (const tree of documents.splice(0)) {
		tree.close();
		expect(tree.nodeCount).toBe(0);
	}
});

function fixture(content: string, spacing = "4px", whiteSpace = "nowrap") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-family:'Agent Mono';font-size:8px;line-height:8px}main{width:100px;letter-spacing:${spacing};white-space:${whiteSpace}}.zero{letter-spacing:0}.atomic{display:inline-block;width:8px;height:8px;letter-spacing:0}</style><main>${content}</main>`,
		"https://fixture.invalid/letter-spacing-boundaries",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(160, 96);
	return tree;
}

function adjacency(suppressed: string, side: string) {
	return side === "before"
		? `A<span class="zero">${suppressed}${atomic}</span>`
		: `<span class="zero">${atomic}${suppressed}</span>A`;
}

it.each(
	["\u00ad", "\u200b", "\u2060", "\ufeff", "\u00ad\u200b\u2060\ufeff"].flatMap(
		(suppressed) => [
			["before", suppressed],
			["after", suppressed],
		],
	),
)(
	"rejects %s atomic tracking across suppressed text %j",
	(side, suppressed) => {
		const tree = fixture(adjacency(suppressed, side));
		expect(buildFormattingTree(tree).issues[diagnostic]).toBeGreaterThan(0);
		expect(() => layoutDocument(tree)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each(["normal", "0", "0px"])(
	"allows both suppressed soft-hyphen boundaries with %s tracking",
	(spacing) => {
		for (const side of ["before", "after"]) {
			const tree = fixture(adjacency("\u00ad", side), spacing);
			expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
			expect(() => layoutDocument(tree)).not.toThrow();
		}
	},
);

it.each([" ", "\n", "\t"])(
	"retains zero-spaced normal whitespace %j as a real boundary",
	(whitespace) => {
		for (const side of ["before", "after"]) {
			const text =
				side === "before" ? `${whitespace}\u00ad` : `\u00ad${whitespace}`;
			const tree = fixture(adjacency(text, side), "4px", "normal");
			expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
			expect(() => layoutDocument(tree)).not.toThrow();
		}
	},
);

it("does not let a collapsed zero-spaced whitespace node hide tracked whitespace", () => {
	const tree = fixture(
		`A <span class="zero"> ${atomic}</span>`,
		"4px",
		"normal",
	);
	expect(buildFormattingTree(tree).issues[diagnostic]).toBeGreaterThan(0);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("does not treat a skipped cross-node LF as a new preserved break", () => {
	const tree = fixture(
		`A&#13;<span class="zero" style="white-space:pre">&#10;${atomic}</span>`,
		"4px",
		"normal",
	);
	expect(buildFormattingTree(tree).issues[diagnostic]).toBeGreaterThan(0);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it.each(["pre", "pre-wrap", "pre-line"])(
	"resets effective adjacency at preserved %s line breaks",
	(whiteSpace) => {
		for (const content of [`A\u00ad\n${atomic}`, `${atomic}\n\u00adA`]) {
			const tree = fixture(content, "4px", whiteSpace);
			expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
			expect(() => layoutDocument(tree)).not.toThrow();
		}
	},
);

it.each(["pre", "pre-wrap"])(
	"keeps preserved %s tabs as tracking boundaries",
	(whiteSpace) => {
		const tree = fixture(`A\u00ad\t${atomic}`, "4px", whiteSpace);
		expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
		expect(() => layoutDocument(tree)).not.toThrow();
	},
);

it("resets effective adjacency at explicit breaks and independent blocks", () => {
	for (const content of [
		`A\u00ad<br>${atomic}`,
		`${atomic}<br>\u00adA`,
		`<div>A\u00ad</div><div>${atomic}</div>`,
	]) {
		const tree = fixture(content);
		expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
		expect(() => layoutDocument(tree)).not.toThrow();
	}
});

it("keeps tracking inside a detached atomic's independent text context", () => {
	const tree = fixture('<span style="display:inline-block">AB\u00adC</span>');
	expect(buildFormattingTree(tree).issues[diagnostic]).toBeUndefined();
	expect(
		layoutDocument(tree).contexts.some(
			(context) => context.lines[0]?.width === 26,
		),
	).toBe(true);
});

it("charges suppressed-text scans against the unchanged formatting budget", () => {
	const tree = fixture(`A${"\u00ad".repeat(256)}`);
	const complete = buildFormattingTree(tree);
	expect(() =>
		buildFormattingTree(tree, { maxWork: complete.metrics.work - 1 }),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
	expect(
		buildFormattingTree(tree, { maxWork: complete.metrics.work }).metrics.work,
	).toBe(complete.metrics.work);
});
