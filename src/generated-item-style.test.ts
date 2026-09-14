import { afterEach, describe, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { computeGeneratedContentStyle } from "./generated-content-style.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles } from "./styles.js";

const fixtures: { tree: DocumentTree; queries: DocumentQueries }[] = [];
const itemParents = ["flex", "inline-flex", "grid", "inline-grid"] as const;

afterEach(() => {
	for (const { tree, queries } of fixtures.splice(0)) {
		queries.close();
		tree.close();
	}
});

function fixture(
	parentDisplay: string,
	declarations = "",
	markup = '<main id="target"><span id="real"></span></main>',
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>
			#target { display: ${parentDisplay} }
			#target::before, #target::after { content: "" }
			#target::before, #target::after, #real { ${declarations} }
		</style>${markup}`,
		"https://fixture.invalid/generated-item-style",
	);
	const queries = new DocumentQueries(tree);
	fixtures.push({ tree, queries });
	const styles = new DocumentStyles(tree);
	styles.setViewport(200, 120);
	const id = (selector: string) => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return found;
	};
	const target = id("#target");
	const real = id("#real");
	const generated = (name: "before" | "after") => {
		const result = styles.generatedContent(target, name);
		if (!result) throw new Error(`Missing ::${name} style`);
		return result;
	};
	return { tree, styles, target, real, generated, id };
}

function transparentFixture(containerDisplay: string, declarations = "") {
	return fixture(
		"contents",
		declarations,
		`<section id="container" style="display:${containerDisplay}">
			<div id="bridge" style="display:contents">
				<main id="target"><span id="real"></span></main>
			</div>
		</section>`,
	);
}

describe.each(["before", "after"] as const)(
	"generated ::%s item styles",
	(name) => {
		it.each(itemParents)(
			"blockifies display mappings under %s",
			(parentDisplay) => {
				for (const [display, expected] of [
					["inline", "block"],
					["inline flow", "block"],
					["inline-block", "block"],
					["inline flow-root", "block"],
					["inline-flex", "flex"],
					["inline flex", "flex"],
					["inline-grid", "grid"],
					["inline grid", "grid"],
					["inline-table", "table"],
					["inline table", "table"],
					["table", "table"],
					["table-cell", "block"],
					["table-row", "block"],
					["block", "block"],
					["flow-root", "flow-root"],
					["block flow-root", "block flow-root"],
					["block flow", "block flow"],
					["list-item", "list-item"],
				] as const) {
					const { styles, real, generated } = fixture(
						parentDisplay,
						`display:${display}`,
					);
					const result = generated(name);
					expect(result.display, display).toBe(expected);
					expect(result.display, display).toBe(styles.get(real).display);
					expect(result.unpositionedDisplay).toBeUndefined();
					expect(Object.isFrozen(result)).toBe(true);
				}
			},
		);

		it.each(itemParents)(
			"keeps empty content and resolves default and CSS-wide display under %s",
			(parentDisplay) => {
				for (const display of ["", "initial", "unset", "revert", "inherit"]) {
					const { styles, real, generated } = fixture(
						parentDisplay,
						display === "" ? "" : `display:${display}`,
					);
					const expected =
						display === "inherit"
							? parentDisplay.replace("inline-", "")
							: "block";
					expect(generated(name)).toMatchObject({
						content: "",
						display: expected,
					});
					expect(generated(name).display).toBe(styles.get(real).display);
				}
			},
		);

		it.each(itemParents)(
			"preserves none and contents under %s",
			(parentDisplay) => {
				for (const display of ["none", "contents"]) {
					for (const position of ["static", "absolute", "fixed"]) {
						const { styles, target, real } = fixture(
							parentDisplay,
							`display:${display};position:${position};float:right;clear:both`,
						);
						const result = styles.generatedContent(target, name);
						expect(styles.get(real).display).toBe(display);
						if (display === "none") {
							expect(result).toBeUndefined();
						} else {
							expect(result).toMatchObject({
								content: "",
								display: "contents",
								flow: { position, float: "right", clear: "both" },
							});
							expect(result?.unpositionedDisplay).toBeUndefined();
							expect(result?.flow).toEqual(styles.flow(real));
						}
					}
				}
			},
		);

		it.each(itemParents)(
			"retains explicit and inherited flow values under %s",
			(parentDisplay) => {
				for (const position of ["static", "relative", "sticky", "inherit"]) {
					const flowDeclarations =
						position === "inherit"
							? "float:inherit;clear:inherit"
							: "float:right;clear:both";
					const { tree, styles, target, real, generated } = fixture(
						parentDisplay,
						`display:inline;position:${position};${flowDeclarations};
						overflow-x:hidden;overflow-y:visible;z-index:7;vertical-align:middle`,
					);
					tree.setAttribute(
						target,
						"style",
						"position:relative;float:right;clear:both",
					);
					const result = generated(name);
					expect(result.display).toBe("block");
					expect(result.flow).toEqual({
						position: position === "inherit" ? "relative" : position,
						float: "right",
						clear: "both",
						"overflow-x": "hidden",
						"overflow-y": "auto",
						"z-index": "7",
					});
					expect(result.flow).toEqual(styles.flow(real));
					expect(result.table["vertical-align"]).toBe("middle");
					expect(result.unpositionedDisplay).toBeUndefined();
				}
			},
		);

		it.each(["block", ...itemParents])(
			"distinguishes positioned and static display under %s",
			(parentDisplay) => {
				for (const position of ["absolute", "fixed"]) {
					for (const [display, expected] of [
						["inline", "block"],
						["inline-block", "block"],
						["inline-flex", "flex"],
						["inline-grid", "grid"],
						["inline-table", "table"],
					] as const) {
						const { styles, real, generated } = fixture(
							parentDisplay,
							`display:${display};position:${position};float:left;clear:both`,
						);
						const result = generated(name);
						expect(result).toMatchObject({
							display: expected,
							unpositionedDisplay:
								parentDisplay === "block" ? display : expected,
							flow: { position, float: "none", clear: "both" },
						});
						expect(result.display).toBe(styles.get(real).display);
						expect(result.unpositionedDisplay).toBe(
							styles.get(real).unpositionedDisplay,
						);
						expect(result.flow).toEqual(styles.flow(real));
					}
				}
			},
		);

		it.each(itemParents)(
			"does not coerce unsupported helper display values under %s",
			(parentDisplay) => {
				const { generated } = fixture(parentDisplay);
				const result = computeGeneratedContentStyle(
					{ content: '""', display: "unsupported-display" },
					{
						...generated(name),
						display: parentDisplay,
						displayed: true,
						visibility: "visible",
					},
					{ width: 200, height: 120 },
					16,
				);
				expect(result?.display).toBe("unsupported-display");
			},
		);

		it.each(["block", "inline-block"])(
			"does not blockify in-flow pseudo displays under ordinary %s parents",
			(parentDisplay) => {
				for (const display of [
					"inline",
					"inline-block",
					"inline-flex",
					"inline-grid",
				]) {
					const { styles, real, generated } = fixture(
						parentDisplay,
						`display:${display}`,
					);
					expect(generated(name).display).toBe(display);
					expect(generated(name).display).toBe(styles.get(real).display);
				}
			},
		);

		it("invalidates cached pseudo item display when the generating display changes", () => {
			const { tree, styles, target, generated } = fixture("block");
			const initial = generated(name);
			expect(initial.display).toBe("inline");
			expect(generated(name)).toBe(initial);
			for (const display of [...itemParents, "block"]) {
				tree.setAttribute(target, "style", `display:${display}`);
				const result = generated(name);
				expect(result.display).toBe(display === "block" ? "inline" : "block");
				expect(result).not.toBe(initial);
				expect(generated(name)).toBe(result);
			}
			tree.setAttribute(target, "style", "display:none");
			expect(styles.generatedContent(target, name)).toBeUndefined();
			tree.setAttribute(target, "style", "display:flex");
			expect(generated(name).display).toBe("block");
			expect(initial.display).toBe("inline");
		});

		it("does not treat a generating block that is itself an item as a container", () => {
			const { tree, target, generated } = fixture("inline");
			const parent = tree.get(target).parent;
			if (parent === null) throw new Error("Missing generating element parent");
			tree.setAttribute(parent, "style", "display:flex");
			expect(generated(name).display).toBe("inline");
		});

		it.each(["block", ...itemParents])(
			"computes actual and static display through nested contents under %s",
			(containerDisplay) => {
				for (const position of ["static", "absolute", "fixed"]) {
					for (const [display, blockDisplay] of [
						["inline", "block"],
						["inline-flex", "flex"],
					] as const) {
						const { styles, target, real, generated, id } = transparentFixture(
							containerDisplay,
							`display:${display};position:${position}`,
						);
						const staticDisplay =
							containerDisplay === "block" ? display : blockDisplay;
						const result = generated(name);
						expect(styles.get(target).display).toBe("contents");
						expect(styles.get(id("#bridge")).display).toBe("contents");
						expect(result).toMatchObject({
							content: "",
							display: position === "static" ? staticDisplay : blockDisplay,
							flow: { position },
						});
						expect(result.unpositionedDisplay).toBe(
							position === "static" ? undefined : staticDisplay,
						);
						expect(result.display).toBe(styles.get(real).display);
						expect(result.unpositionedDisplay).toBe(
							styles.get(real).unpositionedDisplay,
						);
					}
				}
			},
		);

		it.each(itemParents)(
			"stops transparent ancestry at an intervening block under %s",
			(containerDisplay) => {
				const { tree, styles, real, generated, id } =
					transparentFixture(containerDisplay);
				tree.setAttribute(id("#bridge"), "style", "display:block");
				expect(generated(name).display).toBe("inline");
				expect(generated(name).display).toBe(styles.get(real).display);
			},
		);

		it.each(["block", ...itemParents])(
			"preserves inherited and explicit none/contents through transparent %s ancestry",
			(containerDisplay) => {
				for (const display of ["inherit", "none", "contents"]) {
					for (const position of ["static", "absolute", "fixed"]) {
						const { styles, target, real } = transparentFixture(
							containerDisplay,
							`display:${display};position:${position};float:left;clear:both`,
						);
						const result = styles.generatedContent(target, name);
						if (display === "none") {
							expect(result).toBeUndefined();
							expect(styles.get(real).display).toBe("none");
						} else {
							expect(result).toMatchObject({
								content: "",
								display: "contents",
								flow: { position, float: "left", clear: "both" },
							});
							expect(result?.unpositionedDisplay).toBeUndefined();
							expect(result?.display).toBe(styles.get(real).display);
							expect(result?.flow).toEqual(styles.flow(real));
						}
					}
				}
			},
		);

		it.each([
			["contents", "flex", "block"],
			["contents", "inline-flex", "block"],
			["contents", "grid", "block"],
			["contents", "inline-grid", "block"],
			["contents", "block", "inline"],
			["flex", "block", "inline"],
		] as const)(
			"keeps %s inheritance separate from the optional %s container argument",
			(parentDisplay, containerDisplay, expectedDisplay) => {
				const { generated } = fixture("block");
				const parent = {
					...generated(name),
					display: parentDisplay,
					displayed: true,
					visibility: "visible",
				};
				const viewport = { width: 200, height: 120 };
				const specified = { content: '""', display: "inline" };
				expect(
					computeGeneratedContentStyle(specified, parent, viewport, 16)
						?.display,
				).toBe(parentDisplay === "flex" ? "block" : "inline");
				for (const position of ["static", "absolute", "fixed"]) {
					const result = computeGeneratedContentStyle(
						{ ...specified, position },
						parent,
						viewport,
						16,
						containerDisplay,
					);
					expect(result?.display).toBe(
						position === "static" ? expectedDisplay : "block",
					);
					expect(result?.unpositionedDisplay).toBe(
						position === "static" ? undefined : expectedDisplay,
					);
				}
				expect(
					computeGeneratedContentStyle(
						{ ...specified, display: "inherit" },
						parent,
						viewport,
						16,
						containerDisplay,
					)?.display,
				).toBe(parentDisplay);
			},
		);

		it("invalidates cached pseudo styles when transparent ancestry changes", () => {
			const { tree, styles, target, generated, id } =
				transparentFixture("flex");
			const initial = generated(name);
			expect(initial.display).toBe("block");
			expect(generated(name)).toBe(initial);
			for (const [selector, display, expected] of [
				["#container", "block", "inline"],
				["#container", "grid", "block"],
				["#bridge", "block", "inline"],
				["#bridge", "contents", "block"],
				["#target", "inline-block", "inline"],
				["#target", "contents", "block"],
			] as const) {
				tree.setAttribute(id(selector), "style", `display:${display}`);
				const result = generated(name);
				expect(result.display).toBe(expected);
				expect(result).not.toBe(initial);
				expect(generated(name)).toBe(result);
			}
			tree.setAttribute(id("#container"), "style", "display:none");
			expect(styles.generatedContent(target, name)).toBeUndefined();
			tree.setAttribute(id("#container"), "style", "display:flex");
			expect(generated(name).display).toBe("block");
			expect(initial.display).toBe("block");
		});

		it("charges transparent ancestry within the existing cached work limit", () => {
			const { tree, styles, target, generated } = transparentFixture("flex");
			const baseline = styles.metrics();
			const initial = generated(name);
			const consumed = styles.metrics().generatedContentWork;
			expect(consumed).toBeGreaterThan(0);
			expect(generated(name)).toBe(initial);
			expect(styles.metrics().generatedContentWork).toBe(consumed);
			for (const remaining of [-1, 0]) {
				const limited = new DocumentStyles(tree, {
					maxWork: baseline.work + consumed + remaining,
				});
				try {
					limited.setViewport(200, 120);
					expect(limited.metrics().work).toBe(baseline.work);
					if (remaining < 0)
						expect(() => limited.generatedContent(target, name)).toThrow(
							"CSS generated content work limit exceeded",
						);
					else {
						const result = limited.generatedContent(target, name);
						expect(result?.display).toBe("block");
						expect(limited.generatedContent(target, name)).toBe(result);
						expect(limited.metrics().generatedContentWork).toBe(consumed);
					}
				} finally {
					limited.close();
				}
			}
			const recovered = generated(name);
			expect(recovered).toEqual(initial);
			expect(generated(name)).toBe(recovered);
		});
	},
);
