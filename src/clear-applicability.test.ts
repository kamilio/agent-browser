import { afterEach, expect, it } from "vitest";
import { buildFormattingTree, type FormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";

const fixtures: {
	tree: ReturnType<typeof parseHtmlDocument>;
	query: DocumentQueries;
}[] = [];
const content = '<span id="float"></span><span id="target">AA</span>';

afterEach(() => {
	for (const { tree, query } of fixtures.splice(0)) {
		query.close();
		tree.close();
		expect(tree.nodeCount).toBe(0);
		expect(query.metrics()).toMatchObject({ closed: true, indexedNodes: 0 });
	}
});

function fixture(css = "", children = content) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px}#target{clear:left}${css}</style><main>${children}</main>`,
		"https://fixture.invalid/clear-applicability",
	);
	const query = new DocumentQueries(tree);
	fixtures.push({ tree, query });
	const styles = documentStyles(tree);
	styles.setViewport(96, 96);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null)
			throw new Error(`Missing applicability fixture ${selector}`);
		return found;
	};
	const formatting = () => {
		const before = snapshotDocument(tree);
		const result = buildFormattingTree(tree);
		expect(snapshotDocument(tree)).toEqual(before);
		expect(Object.isFrozen(result.nodes)).toBe(true);
		return result;
	};
	const owners = (selector: string, result: FormattingTree = formatting()) =>
		result.nodes.filter((node) => node.ref === tree.reference(id(selector)));
	return { tree, query, styles, id, formatting, owners };
}

it.each([
	"inline",
	"inline-block",
	"inline-flex",
	"inline-grid",
	"inline-table",
	"contents",
])("retains computed clear but not an owner for display:%s", (display) => {
	const { styles, id, formatting, owners } = fixture(
		`#target{display:${display}}`,
	);
	const result = formatting();
	expect(styles.flow(id("#target")).clear).toBe("left");
	expect(styles.metrics().issues).toEqual({});
	expect(
		owners("#target", result).every((node) => node.clear === undefined),
	).toBe(true);
	expect(result.nodes.filter((node) => node.clear)).toEqual([]);
	expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	expect(result.issues["float-layout-not-supported"]).toBe(1);
	if (display === "contents") expect(owners("#target", result)).toEqual([]);
	else expect(owners("#target", result)).toHaveLength(1);
});

it.each(["static", "relative"])(
	"retains clear ownership on a normal %s block",
	(position) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{display:block;position:${position}}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("left");
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0]).toMatchObject({
			kind: "block",
			level: "block",
			clear: "left",
		});
		expect(result.issues["clear-layout-not-supported"]).toBe(1);
	},
);

it.each(["absolute", "fixed"])(
	"does not assign clear ownership after %s blockification",
	(position) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{position:${position}}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("left");
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0].position).toBe(position);
		expect(owners("#target", result)[0].clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	},
);

it.each(["left", "right"])(
	"retains clear on an inline element genuinely floated %s",
	(side) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{float:${side};clear:both}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("both");
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0]).toMatchObject({
			kind: "block",
			level: "block",
			floatSide: side,
			clear: "both",
		});
		expect(result.issues["float-layout-not-supported"]).toBe(2);
		expect(result.issues["clear-layout-not-supported"]).toBe(1);
	},
);

it.each([
	["inline", "block"],
	["contents", "block"],
	["inline-block", "flow-root"],
	["inline-flex", "flex"],
	["inline-grid", "grid"],
	["inline-table", "table"],
])(
	"considers root display:%s normalization to %s before clear applicability",
	(authored, normalized) => {
		const { styles, id, formatting, owners } = fixture(
			`html{display:${authored};clear:both}#target{clear:none}`,
		);
		const result = formatting();
		expect(styles.flow(id("html")).clear).toBe("both");
		expect(owners("html", result)).toHaveLength(1);
		expect(owners("html", result)[0]).toMatchObject({
			display: normalized,
			level: "block",
			clear: "both",
		});
		expect(result.nodes.filter((node) => node.clear)).toHaveLength(1);
		expect(result.issues["clear-layout-not-supported"]).toBe(1);
	},
);

it.each(["table", "block table"])(
	"retains clear ownership for display:%s without erasing independent display guards",
	(display) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{display:${display};clear:both}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("both");
		expect(styles.metrics().issues).toEqual({});
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0]).toMatchObject({
			kind: "deferred",
			level: "block",
			clear: "both",
			deferredReason: "display-layout-not-supported",
		});
		expect(result.nodes.filter((node) => node.clear)).toHaveLength(1);
		expect(result.issues["clear-layout-not-supported"]).toBe(1);
		expect(result.issues["float-layout-not-supported"]).toBe(1);
		expect(result.issues["display-layout-not-supported"]).toBeGreaterThan(0);
	},
);

it.each(["flex", "grid"])(
	"does not mistake a normalized %s item for an applicable clear owner",
	(display) => {
		const { styles, id, formatting, owners } = fixture(
			`#container{display:${display}}#target{float:left;clear:both}`,
			'<span id="float"></span><section id="container"><span id="target">AA</span></section>',
		);
		const result = formatting();
		const target = owners("#target", result)[0];
		expect(styles.flow(id("#target")).clear).toBe("both");
		expect(target.level).toBe("block");
		expect(display === "flex" ? target.flexItem : target.gridItem).toBe(true);
		expect(target.floatSide).toBeUndefined();
		expect(target.clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	},
);

it.each(["table-row", "table-cell", "table-row-group", "table-column"])(
	"does not schedule table-internal display:%s for clear",
	(display) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{display:${display}}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("left");
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0].clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	},
);

it("does not duplicate ignored clear across inline fragments split by a block child", () => {
	const { styles, id, formatting, owners } = fixture(
		"#target{clear:both}",
		'<span id="target">A<span id="float"></span>B<div id="child">C</div>D</span>',
	);
	const result = formatting();
	const fragments = owners("#target", result);
	expect(styles.flow(id("#target")).clear).toBe("both");
	expect(fragments).toHaveLength(2);
	expect(fragments.map((node) => node.fragmentIndex)).toEqual([0, 1]);
	for (const fragment of fragments) {
		expect(fragment.fragmentCount).toBe(2);
		expect(fragment.clear).toBeUndefined();
		expect(fragment.floatSide).toBeUndefined();
	}
	expect(owners("#float", result)[0].parent).toBe(fragments[0].id);
	expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
});

it.each(["initial", "unset", "revert"])(
	"resolves clear:%s without retaining an earlier applicable request",
	(keyword) => {
		const { tree, styles, id, formatting, owners } = fixture(
			"#target{display:block}",
		);
		expect(owners("#target")[0].clear).toBe("left");
		tree.setAttribute(id("#target"), "style", `clear:${keyword}`);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("none");
		expect(owners("#target", result)[0].clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
		expect(styles.metrics().issues).toEqual({});
	},
);

it("resolves explicit inherit independently for inline and block descendants", () => {
	const { styles, id, formatting, owners } = fixture(
		"#parent{clear:right}#target,#child{clear:inherit}",
		'<span id="float"></span><section id="parent"><span id="target">AA</span><div id="child">BB</div></section>',
	);
	const result = formatting();
	expect(styles.flow(id("#target")).clear).toBe("right");
	expect(styles.flow(id("#child")).clear).toBe("right");
	expect(owners("#target", result)[0].clear).toBeUndefined();
	expect(owners("#child", result)[0].clear).toBe("right");
	expect(owners("#parent", result)[0].clear).toBe("right");
	expect(result.issues["clear-layout-not-supported"]).toBe(2);
});

it("does not inherit a parent's clear into unstyled inline or block children", () => {
	const { styles, id, formatting, owners } = fixture(
		"#target{clear:both}",
		'<span id="float"></span><section id="target"><span id="inline">AA</span><div id="child">BB</div></section>',
	);
	const result = formatting();
	for (const selector of ["#inline", "#child"]) {
		expect(styles.flow(id(selector)).clear).toBe("none");
		expect(owners(selector, result)[0].clear).toBeUndefined();
	}
	expect(owners("#target", result)[0].clear).toBe("both");
	expect(result.issues["clear-layout-not-supported"]).toBe(1);
});

it.each([
	["image alternative", '<img id="target" alt="AA" width="12" height="8">'],
	["native control", '<input id="target" type="checkbox">'],
])(
	"retains computed clear without scheduling an inline %s",
	(_name, target) => {
		const { styles, id, formatting, owners } = fixture(
			"#target{display:inline;clear:both}",
			`<span id="float"></span>${target}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("both");
		expect(owners("#target", result)).toHaveLength(1);
		expect(owners("#target", result)[0].level).toBe("inline");
		expect(owners("#target", result)[0].clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	},
);

it("retains applicable block metadata without issuing a diagnostic when no float exists", () => {
	const { formatting, owners } = fixture("", '<div id="target">AA</div>');
	const result = formatting();
	expect(owners("#target", result)[0].clear).toBe("left");
	expect(result.issues["float-layout-not-supported"] ?? 0).toBe(0);
	expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
});

it.each(["inline-start", "inline-end"])(
	"retains valid logical clear:%s in styles but not inline metadata",
	(clear) => {
		const { styles, id, formatting, owners } = fixture(
			`#target{clear:${clear}}`,
		);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe(clear);
		expect(styles.metrics().issues).toEqual({});
		expect(owners("#target", result)[0].clear).toBeUndefined();
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
	},
);

it("does not count display:none elements as clear owners", () => {
	const { styles, id, formatting, owners } = fixture("#target{display:none}");
	const result = formatting();
	expect(styles.flow(id("#target")).clear).toBe("left");
	expect(owners("#target", result)).toEqual([]);
	expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(0);
});

it("lets a block explicitly inherit clear through a display:contents parent", () => {
	const { styles, id, formatting, owners } = fixture(
		"#target{display:contents}#child{clear:inherit}",
		'<span id="float"></span><span id="target"><div id="child">AA</div></span>',
	);
	const result = formatting();
	expect(styles.flow(id("#target")).clear).toBe("left");
	expect(styles.flow(id("#child")).clear).toBe("left");
	expect(owners("#target", result)).toEqual([]);
	expect(owners("#child", result)[0].clear).toBe("left");
	expect(result.issues["clear-layout-not-supported"]).toBe(1);
});

it("recomputes applicability after relative, absolute, fixed and static position mutations", () => {
	const { tree, styles, id, formatting, owners } = fixture(
		"#target{display:block}",
	);
	for (const [position, applicable] of [
		["relative", true],
		["absolute", false],
		["fixed", false],
		["static", true],
	] as const) {
		tree.setAttribute(id("#target"), "style", `position:${position}`);
		const result = formatting();
		expect(styles.flow(id("#target")).clear).toBe("left");
		expect(owners("#target", result)[0].clear).toBe(
			applicable ? "left" : undefined,
		);
		expect(result.issues["clear-layout-not-supported"] ?? 0).toBe(
			applicable ? 1 : 0,
		);
	}
});
