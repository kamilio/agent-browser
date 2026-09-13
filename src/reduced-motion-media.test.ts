import { afterEach, expect, it } from "vitest";
import { compileCssMedia } from "./css-media.js";
import { cssMediaMatches } from "./css-parser.js";
import type { DocumentTree } from "./document.js";
import { parseHtmlDocument } from "./html-parser.js";
import { nativeMotionPreference } from "./native-motion-preference.js";
import { documentStyles } from "./styles.js";

const viewport = { width: 1280, height: 720 };
const documents: DocumentTree[] = [];
afterEach(() => {
	for (const tree of documents.splice(0)) tree.close();
});

it("documents a fixed native preference without OS or site integration", () => {
	expect(nativeMotionPreference).toEqual({
		profile: "native-ua-motion-preference",
		preference: "no-preference",
		systemIntegration: false,
		siteOverrides: false,
	});
	expect(Object.isFrozen(nativeMotionPreference)).toBe(true);
});

it.each([
	["(prefers-reduced-motion: no-preference)", true],
	["(prefers-reduced-motion: reduce)", false],
	["(prefers-reduced-motion)", false],
	["not (prefers-reduced-motion)", true],
	["not (prefers-reduced-motion: reduce)", true],
	["not (prefers-reduced-motion: no-preference)", false],
	["screen and (prefers-reduced-motion: no-preference)", true],
	["print and (prefers-reduced-motion: no-preference)", false],
	["(width >= 1200px) and (prefers-reduced-motion: no-preference)", true],
	["(max-width: 1399.98px) and (prefers-reduced-motion: reduce)", false],
	["(prefers-reduced-motion: reduce), (width: 1280px)", true],
	["(prefers-reduced-motion: reduce) or (height: 720px)", true],
	["(prefers-reduced-motion: reduce) and (unknown: value)", false],
	["(PREFERS-REDUCED-MOTION: NO-PREFERENCE)", true],
	["(prefers-reduced-motion/**/:/**/no-preference)", true],
])("evaluates native no-preference media %s", (query, expected) => {
	const compiled = compileCssMedia(query as string);
	expect(compiled.unsupported).toBe(query.includes("unknown"));
	expect(compiled.matches(viewport)).toBe(expected);
	const issues: string[] = [];
	expect(
		cssMediaMatches(query as string, viewport, (code) => issues.push(code)),
	).toBe(expected);
	expect(issues).toEqual(
		query.includes("unknown") ? ["unimplemented-or-invalid-media-query"] : [],
	);
});

it.each([
	"(prefers-reduced-motion: none)",
	"(prefers-reduced-motion: normal)",
	"(prefers-reduced-motion: true)",
	"(prefers-reduced-motion: 0)",
	"(prefers-reduced-motion:)",
	"(prefers-reduced-motion: reduce no-preference)",
	"(min-prefers-reduced-motion: reduce)",
	"(max-prefers-reduced-motion: no-preference)",
	"(prefers-reduced-motion > reduce)",
	"(prefers-reduced-motion = no-preference)",
	"(reduce < prefers-reduced-motion < no-preference)",
	"not (prefers-reduced-motion: unknown)",
])("keeps malformed and range motion queries unsupported: %s", (query) => {
	const compiled = compileCssMedia(query);
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(viewport)).toBe(false);
	expect(compiled.media).toBe("not all");
});

it("keeps the valid alternative of an invalid motion query", () => {
	const compiled = compileCssMedia(
		"(prefers-reduced-motion: unknown), (prefers-reduced-motion: no-preference)",
	);
	expect(compiled.unsupported).toBe(true);
	expect(compiled.matches(viewport)).toBe(true);
});

it("uses the same native motion preference in stylesheets", () => {
	const tree = parseHtmlDocument(
		`<style>
		div { color: black; }
		@media (prefers-reduced-motion: no-preference) { div { color: red; } }
		@media (prefers-reduced-motion: reduce) { div { color: blue; } }
		@media (prefers-reduced-motion) { div { color: green; } }
	</style><div>Motion preference</div>`,
		"https://fixture.invalid/motion",
	);
	documents.push(tree);
	const styles = documentStyles(tree);
	const target = [...tree.walk()].find(
		({ node }) => node.kind === "element" && node.tagName === "div",
	);
	expect(target).toBeDefined();
	expect(styles.paint(target!.node.id).color).toEqual([255, 0, 0, 255]);
	expect(
		styles.metrics().issues["unimplemented-or-invalid-media-query"],
	).toBeUndefined();
});

it("does not infer motion preference from viewport size", () => {
	const compiled = compileCssMedia("(prefers-reduced-motion: no-preference)");
	for (const size of [1, 320, 1280, 4096]) {
		expect(compiled.matches({ width: size, height: size })).toBe(true);
	}
});
