import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { resolveDocumentBlockWidths } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import {
	layoutFormattingText,
	measureFormattingText,
	type TextFloatLayout,
	type TextLayoutLimits,
} from "./text-layout.js";

type LayoutInput = Parameters<typeof layoutFormattingText>[0];

const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(siblings = 0, css = "") {
	const tree = parseHtmlDocument(
		`<!doctype html><style>*{margin:0;padding:0;border:0}html,body{font-size:8px;line-height:10px}${css}</style><main id="blocks"><p id="empty"></p><p id="word">ab</p><p id="plain">cd</p></main><aside>${"<div></div>".repeat(siblings)}</aside>`,
		"https://fixture.invalid/text-transform-scan",
	);
	documents.push(tree);
	documentStyles(tree).setViewport(200, 100);
	const queries = new DocumentQueries(tree);
	const horizontal = resolveDocumentBlockWidths(tree);
	const select = (...selectors: string[]): LayoutInput => ({
		...horizontal,
		widths: selectors.map((selector) => {
			const id = queries.querySelector(selector);
			if (id === null) throw new Error(`Missing fixture ${selector}`);
			const ref = tree.reference(id);
			const width = horizontal.widths.find((entry) => entry.ref === ref);
			if (!width) throw new Error(`Missing width ${selector}`);
			return width;
		}),
	});
	return { horizontal, select };
}

function observe(input: LayoutInput) {
	const counts = { calls: 0, visits: 0 };
	let indexedReads = 0;
	const nodes = new Proxy(input.formatting.nodes, {
		get(target, property, receiver) {
			if (typeof property === "string" && /^\d+$/.test(property))
				indexedReads++;
			if (property !== "some") return Reflect.get(target, property, receiver);
			return (
				predicate: Parameters<typeof target.some>[0],
				thisArgument?: unknown,
			) => {
				counts.calls++;
				return target.some((node, index, values) => {
					counts.visits++;
					return predicate.call(thisArgument, node, index, values);
				});
			};
		},
	});
	return {
		counts,
		indexedReads: () => indexedReads,
		input: { ...input, formatting: { ...input.formatting, nodes } },
	};
}

const constraints = ["used", "min-content", "max-content"] as const;
function measure(
	input: LayoutInput,
	constraint: (typeof constraints)[number],
	limits?: Partial<TextLayoutLimits>,
) {
	if (constraint !== "used")
		return measureFormattingText(input, constraint, limits);
	const { contexts, metrics } = layoutFormattingText(input, limits);
	return { contexts, metrics };
}

for (const scope of [
	"no widths",
	"block-only widths",
	"empty inline",
	"empty inline with unrelated transform",
] as const) {
	it.each(constraints)(
		`avoids the full-node scan for ${scope} in %s`,
		(mode) => {
			const page = fixture(
				100,
				scope === "empty inline with unrelated transform"
					? "#word{text-transform:uppercase}"
					: "",
			);
			const selected =
				scope === "no widths"
					? page.select()
					: page.select(scope === "block-only widths" ? "#blocks" : "#empty");
			const observed = observe(selected);
			expect(measure(observed.input, mode)).toEqual(measure(selected, mode));
			expect(observed.counts).toEqual({ calls: 0, visits: 0 });
		},
	);
}

it.each(
	constraints.flatMap((mode) =>
		["none", "uppercase"].map((transform) => [mode, transform] as const),
	),
)(
	"scans only selected inline contexts after empty contexts in %s with %s",
	(mode, transform) => {
		const page = fixture(20, `#word{text-transform:${transform}}`);
		const selected = page.select("#empty", "#word", "#plain");
		const observed = observe(selected);
		expect(measure(observed.input, mode)).toEqual(measure(selected, mode));
		expect(observed.counts).toEqual({ calls: 0, visits: 0 });
		expect(observed.indexedReads()).toBeGreaterThan(0);
		if (mode === "used")
			expect(
				layoutFormattingText(selected)
					.contexts.flatMap((context) => context.glyphs)
					.map((glyph) => glyph.character)
					.join(""),
			).toBe(transform === "none" ? "abcd" : "ABcd");
	},
);

it.each(constraints)(
	"retains float coordinator validation with no contexts in %s",
	(mode) => {
		const page = fixture();
		expect(() =>
			measure(
				{ ...page.select(), floatLayout: null as unknown as TextFloatLayout },
				mode,
			),
		).toThrow("Invalid text float coordinator");
	},
);

it.each(constraints)("retains custom work limits in %s", (mode) => {
	const page = fixture(0, "#word{text-transform:uppercase}");
	expect(() => measure(page.select("#word"), mode, { maxWork: 1 })).toThrow(
		"Text layout work limit exceeded",
	);
});

it("does not retain the transform decision across calls with caller-owned input", () => {
	const page = fixture();
	const selected = page.select("#word");
	const nodes = selected.formatting.nodes.map((node) => ({ ...node }));
	const supplied = {
		...selected,
		formatting: { ...selected.formatting, nodes },
	};
	const observed = observe(supplied);
	const text = () =>
		layoutFormattingText(observed.input)
			.contexts.flatMap((context) => context.glyphs)
			.map((glyph) => glyph.character)
			.join("");
	expect(text()).toBe("ab");
	for (const [index, node] of nodes.entries()) {
		if (node.typography)
			nodes[index] = {
				...node,
				typography: { ...node.typography, "text-transform": "uppercase" },
			};
	}
	expect(text()).toBe("AB");
	expect(observed.counts).toEqual({ calls: 0, visits: 0 });
});

it.each(constraints)(
	"keeps local text feature reads and charged work independent of unrelated nodes in %s",
	(mode) => {
		const measurements = [20, 1_000].map((siblings) => {
			const page = fixture(
				siblings,
				"#word{text-transform:uppercase;letter-spacing:2px}",
			);
			const observed = observe(page.select("#empty", "#word", "#plain"));
			const result = measure(observed.input, mode);
			expect(observed.counts).toEqual({ calls: 0, visits: 0 });
			return { work: result.metrics.work, reads: observed.indexedReads() };
		});
		expect(measurements[0].reads).toBeGreaterThan(0);
		expect(measurements[1]).toEqual(measurements[0]);
	},
);

it.each([100, 1_000])(
	"does not rescan unrelated nodes across %s empty-context measurements",
	(count) => {
		const page = fixture(count);
		const selected = page.select("#empty");
		const observed = observe(selected);
		const control = measureFormattingText(selected, "max-content");
		for (let index = 0; index < count; index++)
			expect(measureFormattingText(observed.input, "max-content")).toEqual(
				control,
			);
		expect(selected.formatting.nodes.length).toBeGreaterThan(count);
		expect(observed.counts).toEqual({ calls: 0, visits: 0 });
	},
);
