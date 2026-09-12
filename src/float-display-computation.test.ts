import { expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";

it("baseline: a floated inline span resolves to block", () => {
	const tree = parseHtmlDocument(
		'<span id="target" style="display:inline;float:left">Float</span>',
		"https://fixture.invalid/float-display-baseline",
	);
	try {
		const target = new DocumentQueries(tree).querySelector("#target");
		if (target === null) throw new Error("Missing floated span");
		expect(resolvedStyleValue(tree, target, "display")).toBe("block");
		expect(documentStyles(tree).flow(target).float).toBe("left");
		expect(tree.get(target).attributes.style).toBe("display:inline;float:left");
	} finally {
		tree.close();
	}
});
