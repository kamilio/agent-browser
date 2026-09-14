import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { layoutDocument } from "./document-layout.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";
import { loadStylesheetImports } from "./stylesheet-imports.js";

const documents: DocumentTree[] = [];
const queries: DocumentQueries[] = [];
const propertyIssue = "unimplemented-css-property";

afterEach(() => {
	for (const owner of queries.splice(0)) owner.close();
	for (const tree of documents.splice(0)) tree.close();
});

function fixture(css: string, markup = '<main id="target">Text</main>') {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${css}</style>${markup}`,
		"https://fixture.invalid/css-diagnostic-details",
	);
	documents.push(tree);
	const owner = new DocumentQueries(tree);
	queries.push(owner);
	const id = (selector: string) => {
		const found = owner.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	styles.setViewport(800, 700);
	return { tree, styles, id };
}

it.each([
	["#target", true, "matched"],
	[".missing", false, "unmatched"],
	["#target::before", true, "matched"],
	["#target::after", true, "matched"],
] as const)(
	"attributes declaration rejection under %s",
	(selector, applicable, state) => {
		const { tree, styles } = fixture(
			`${selector}{animation-name:Spin!important}`,
		);
		const before = styles.metrics();
		const snapshot = styles.diagnostics();
		expect(snapshot.samples).toHaveLength(1);
		expect(snapshot.samples[0]).toMatchObject({
			code: { value: propertyIssue, truncated: false },
			authoredProperty: { value: "animation-name" },
			property: { value: "animation-name" },
			value: { value: "Spin!important" },
			important: true,
			scope: "rule",
			sheet: 0,
			importDepth: 0,
			selectors: [{ value: selector }],
			applicable,
			selectorState: state,
			mediaState: "active",
		});
		expect(snapshot.issues).toEqual(before.issues);
		expect(snapshot.applicableIssues).toEqual(before.applicableIssues);
		expect(styles.metrics()).toEqual(before);
		expect(styles.diagnostics()).toBe(snapshot);
		expect(buildFormattingTree(tree).issues[`css:${propertyIssue}`] ?? 0).toBe(
			applicable ? 1 : 0,
		);
	},
);

it.each([
	["print", false, "inactive", "not-evaluated"],
	["screen", true, "active", "matched"],
	["(unknown-diagnostic-feature:1)", true, "uncertain", "matched"],
] as const)(
	"preserves diagnostic media scope for %s",
	(media, applicable, state, selectorState) => {
		const { styles } = fixture(`@media ${media}{#target{animation-name:spin}}`);
		const snapshot = styles.diagnostics();
		expect(snapshot.samples[0]).toMatchObject({
			applicable,
			mediaState: state,
			selectorState,
		});
		expect(snapshot.issues[propertyIssue]).toBe(1);
		expect(snapshot.applicableIssues[propertyIssue] ?? 0).toBe(
			applicable ? 1 : 0,
		);
	},
);

it.each([".missing:unknown-diagnostic-pseudo", "[data-state=]"])(
	"retains conservative unresolved selector details for %s",
	(selector) => {
		const { styles } = fixture(`${selector}{animation-name:spin}`);
		const snapshot = styles.diagnostics();
		expect(snapshot.samples).toHaveLength(2);
		for (const sample of snapshot.samples)
			expect(sample).toMatchObject({
				applicable: true,
				selectorState: "unresolved",
				selectors: [{ value: selector }],
				sheet: 0,
				importDepth: 0,
			});
		expect(snapshot.samples.map((sample) => sample.code.value)).toEqual([
			propertyIssue,
			"unimplemented-or-invalid-css-selector",
		]);
	},
);

it("records source identity for selector errors without rejected declarations", () => {
	const { styles } = fixture(".missing:unknown-diagnostic-pseudo{color:red}");
	expect(styles.diagnostics().samples).toMatchObject([
		{
			code: { value: "unimplemented-or-invalid-css-selector" },
			sheet: 0,
			importDepth: 0,
			selectorState: "unresolved",
		},
	]);
});

async function importedFixture(css: string, sheets: Record<string, string>) {
	const page = fixture(css);
	const url = "https://fixture.invalid/css-diagnostic-details";
	const controller = new AbortController();
	const requests: string[] = [];
	try {
		const result = await loadStylesheetImports(
			{ url, text: css, encoding: "utf-8" },
			{
				inline: true,
				signal: controller.signal,
				fetch: async (requested) => {
					requests.push(requested);
					if (!Object.hasOwn(sheets, requested))
						throw new Error("Missing synthetic stylesheet");
					return { url: requested, text: sheets[requested], encoding: "utf-8" };
				},
			},
		);
		page.styles.setStylesheetSource(page.id("#sheet"), url, result.source);
		return { ...page, requests, imports: result.metrics };
	} finally {
		controller.abort();
	}
}

it("preserves root/import/grandchild provenance, inactive media and cycle suppression", async () => {
	const selector = ".missing:unknown-diagnostic-pseudo";
	const { styles, requests, imports } = await importedFixture(
		`@import "child.css"; ${selector}{color:red}`,
		{
			"https://fixture.invalid/child.css": `@import "leaf.css" print; @import "child.css"; ${selector}{color:blue} #target{animation-name:child}`,
			"https://fixture.invalid/leaf.css": "#target{animation-name:leaf}",
		},
	);
	expect(requests).toEqual([
		"https://fixture.invalid/child.css",
		"https://fixture.invalid/leaf.css",
	]);
	expect(imports.cycles).toBe(1);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(4);
	expect(
		snapshot.samples.filter((sample) => sample.code.value === propertyIssue),
	).toMatchObject([
		{
			sheet: 2,
			importDepth: 2,
			value: { value: "leaf" },
			applicable: false,
			mediaState: "inactive",
		},
		{
			sheet: 1,
			importDepth: 1,
			value: { value: "child" },
			applicable: true,
			mediaState: "active",
		},
	]);
	expect(
		snapshot.samples.filter(
			(sample) => sample.code.value === "unimplemented-or-invalid-css-selector",
		),
	).toMatchObject([
		{ sheet: 1, importDepth: 1, selectorState: "unresolved" },
		{ sheet: 0, importDepth: 0, selectorState: "unresolved" },
	]);
	expect(snapshot.issues[propertyIssue]).toBe(2);
	expect(snapshot.applicableIssues[propertyIssue]).toBe(1);
});

it("shares the retention cap across imported and root sources", async () => {
	const { styles } = await importedFixture(
		'@import "child.css"; #target{animation-name:root}',
		{
			"https://fixture.invalid/child.css": `.missing{${"animation-name:child;".repeat(128)}}`,
		},
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(128);
	expect(
		snapshot.samples.every(
			(sample) =>
				sample.sheet === 1 &&
				sample.importDepth === 1 &&
				sample.applicable === false,
		),
	).toBe(true);
	expect(snapshot.omittedOccurrences).toBe(1);
	expect(snapshot.issues[propertyIssue]).toBe(129);
	expect(snapshot.applicableIssues[propertyIssue]).toBe(1);
});

it("invalidates details when a viewport crosses a media threshold", () => {
	const { styles } = fixture(
		"@media (min-width:900px){#target{animation-name:spin}}",
	);
	const before = styles.diagnostics();
	expect(before.samples[0]).toMatchObject({
		applicable: false,
		mediaState: "inactive",
	});
	styles.setViewport(1000, 700);
	const after = styles.diagnostics();
	expect(after.samples[0]).toMatchObject({
		applicable: true,
		mediaState: "active",
	});
	expect(after.issues).toEqual(before.issues);
	expect(after.cascadeBuild).toBe(before.cascadeBuild + 1);
	expect(before.samples[0].applicable).toBe(false);
	styles.setViewport(1000, 700);
	expect(styles.diagnostics()).toBe(after);
});

it("counts a rejected rule once while exposing all target-kind counts", () => {
	const { styles } = fixture(
		".matched,.matched::before,.matched::after{animation-name:spin}",
		'<div class="matched"></div><div class="matched"></div>',
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(1);
	expect(snapshot.samples[0].matches).toEqual({
		elements: 2,
		before: 2,
		after: 2,
	});
	expect(snapshot.issues[propertyIssue]).toBe(1);
	expect(snapshot.applicableIssues[propertyIssue]).toBe(1);
});

it("does not relabel hidden or overridden rejection samples as invisible-safe", () => {
	const { tree, styles } = fixture(
		"#target{display:none;animation-name:spin;animation-name:none!important}",
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(2);
	expect(snapshot.samples.every((sample) => sample.applicable === true)).toBe(
		true,
	);
	expect(() => layoutDocument(tree)).toThrow(
		expect.objectContaining({ code: "unsupported" }),
	);
});

it("attributes inline rejection samples to their owner without a selector", () => {
	const { styles, id } = fixture(
		"",
		'<main id="target" style="display:none;animation-name:spin;width:wat"></main>',
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(2);
	for (const sample of snapshot.samples)
		expect(sample).toMatchObject({
			scope: "inline",
			owner: id("#target"),
			selectors: [],
			applicable: true,
			selectorState: "not-evaluated",
			mediaState: "not-evaluated",
		});
});

it("keeps nested selectors attached to their declaration segment", () => {
	const { styles } = fixture(
		"#target{animation-name:outer; & span {width:wat}}",
		'<main id="target"><span>Child</span></main>',
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples).toHaveLength(2);
	expect(
		snapshot.samples[0].selectors.map((selector) => selector.value),
	).toEqual(["#target"]);
	expect(
		snapshot.samples[1].selectors.map((selector) => selector.value),
	).toEqual(["& span", "#target"]);
	expect(snapshot.samples.every((sample) => sample.applicable === true)).toBe(
		true,
	);
});

it("does not turn uninstrumented global counts into fabricated properties", () => {
	const { styles } = fixture(
		"@unknown-diagnostic-rule {value:1} #target{animation-name:spin}",
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.issues["unimplemented-css-at-rule"]).toBe(1);
	expect(snapshot.samples).toHaveLength(1);
	expect(snapshot.exhaustive).toBe(false);
	expect(snapshot.instrumentedCodes).not.toContain("unimplemented-css-at-rule");
});

it.each([127, 128, 129])(
	"bounds %i rejected occurrences without losing count totals",
	(count) => {
		const { styles } = fixture(
			`#target{${"animation-name:spin;".repeat(count)}}`,
		);
		const snapshot = styles.diagnostics();
		expect(snapshot.samples).toHaveLength(Math.min(count, 128));
		expect(snapshot.sampledOccurrences).toBe(Math.min(count, 128));
		expect(snapshot.omittedOccurrences).toBe(Math.max(0, count - 128));
		expect(snapshot.truncated).toBe(count > 128);
		expect(snapshot.issues[propertyIssue]).toBe(count);
		expect(snapshot.applicableIssues[propertyIssue]).toBe(count);
	},
);

it("reports saturation before a later applicable rule rather than claiming absence", () => {
	const { styles } = fixture(
		`.missing{${"animation-name:spin;".repeat(128)}} #target{animation-name:last}`,
	);
	const snapshot = styles.diagnostics();
	expect(snapshot.samples.every((sample) => sample.applicable === false)).toBe(
		true,
	);
	expect(snapshot.omittedOccurrences).toBe(1);
	expect(snapshot.truncated).toBe(true);
	expect(snapshot.issues[propertyIssue]).toBe(129);
	expect(snapshot.applicableIssues[propertyIssue]).toBe(1);
});

it("rebuilds details once after mutations and leaves earlier snapshots immutable", () => {
	const { tree, styles, id } = fixture(".matched{animation-name:spin}");
	const before = styles.diagnostics();
	expect(before.samples[0].applicable).toBe(false);
	tree.setAttribute(id("#target"), "class", "matched");
	const after = styles.diagnostics();
	expect(after.cascadeBuild).toBe(before.cascadeBuild + 1);
	expect(after.samples[0].applicable).toBe(true);
	expect(before.samples[0].applicable).toBe(false);
	expect(styles.diagnostics()).toBe(after);
	expect(Object.isFrozen(after)).toBe(true);
	expect(Object.isFrozen(after.samples[0])).toBe(true);
	tree.setTextContent(id("#sheet"), "#target{width:20px}");
	const repaired = styles.diagnostics();
	expect(repaired.samples).toEqual([]);
	expect(repaired.cascadeBuild).toBe(after.cascadeBuild + 1);
	styles.close();
	expect(() => styles.diagnostics()).toThrow(
		expect.objectContaining({ code: "closed" }),
	);
	expect(after.samples[0].applicable).toBe(true);
});

it("reuses the diagnostic snapshot across benign control-value changes", () => {
	const { tree, styles, id } = fixture(
		"#target{animation-name:spin}",
		'<input id="target">',
	);
	const before = styles.diagnostics();
	tree.setControl(id("#target"), { value: "changed" });
	expect(styles.diagnostics()).toBe(before);
	expect(styles.metrics().cascadeBuilds).toBe(before.cascadeBuild);
});

it.each(["maxRules", "maxDeclarations", "maxCodeUnits", "maxWork"] as const)(
	"keeps %s failures enforced by diagnostic reads",
	(limit) => {
		const { tree } = fixture(".missing{animation-name:spin}.absent{width:wat}");
		const limited = new DocumentStyles(tree, { [limit]: 1 });
		expect(() => limited.diagnostics()).toThrow(
			expect.objectContaining({ code: "resource-limit" }),
		);
		limited.close();
	},
);

it("does not publish partial details after an unsuccessful rebuild", () => {
	const { tree, id } = fixture("#target{animation-name:spin}");
	const limited = new DocumentStyles(tree, { maxDeclarations: 1 });
	const before = limited.diagnostics();
	tree.setTextContent(
		id("#sheet"),
		"#target{animation-name:one;animation-name:two}",
	);
	expect(() => limited.diagnostics()).toThrow(/declaration limit/);
	expect(before.samples).toHaveLength(1);
	tree.setTextContent(id("#sheet"), "#target{animation-name:recovered}");
	const recovered = limited.diagnostics();
	expect(recovered.samples[0].value?.value).toBe("recovered");
	expect(recovered.cascadeBuild).toBe(before.cascadeBuild + 1);
	limited.close();
});
