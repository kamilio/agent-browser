import { afterEach, expect, it } from "vitest";
import { initialBoxStyle } from "./css-box.js";
import { initialFlexStyle } from "./css-flex.js";
import { initialTextStyle } from "./css-text.js";
import type { DocumentTree } from "./document.js";
import { mathmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { DocumentStyles, documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const querySets: DocumentQueries[] = [];

afterEach(() => {
	for (const queries of querySets.splice(0)) queries.close();
	for (const tree of documents.splice(0)) tree.close();
});

const uaContent = {
	"box-sizing": "border-box",
	"text-align": "center",
	"align-content": "center",
	"line-height": "normal",
	"text-indent": "0px",
	"text-transform": "none",
};
const initialContent = {
	...uaContent,
	"box-sizing": "content-box",
	"text-align": "start",
	"align-content": "normal",
};
const parentContent = {
	"box-sizing": "content-box",
	"text-align": "end",
	"align-content": "space-between",
	"line-height": "40px",
	"text-indent": "12px",
	"text-transform": "uppercase",
};
const authorContent = {
	"box-sizing": "content-box",
	"text-align": "right",
	"align-content": "flex-end",
	"line-height": "24px",
	"text-indent": "8px",
	"text-transform": "lowercase",
};
const inheritedContent = {
	...parentContent,
	"box-sizing": initialContent["box-sizing"],
	"align-content": initialContent["align-content"],
};
const richContent =
	'<span id="child">Save <strong id="grandchild">changes</strong></span>';

function declarations(values: Record<string, string>, important = false) {
	return Object.entries(values)
		.map(([name, value]) => `${name}:${value}${important ? "!important" : ""}`)
		.join(";");
}

function contentStyle(styles: DocumentStyles, node: number) {
	const text = styles.text(node);
	return {
		"box-sizing": styles.box(node)["box-sizing"],
		"text-align": text["text-align"],
		"align-content": styles.flex(node)["align-content"],
		"line-height": text["line-height"],
		"text-indent": text["text-indent"],
		"text-transform": text["text-transform"],
	};
}

function fixture(
	css = "",
	content = `<button id="target">${richContent}</button>`,
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style id="sheet">${css}</style><main id="parent">${content}</main>`,
		"https://fixture.invalid/button-content-style",
	);
	documents.push(tree);
	const queries = new DocumentQueries(tree);
	querySets.push(queries);
	const id = (selector = "#target") => {
		const found = queries.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture node: ${selector}`);
		return found;
	};
	const styles = documentStyles(tree);
	const read = (selector = "#target") => contentStyle(styles, id(selector));
	return { tree, styles, id, read };
}

it.each([
	["plain", "Save changes"],
	["rich", richContent],
])(
	"applies HTML button UA content defaults to %s content",
	(_kind, content) => {
		const { styles, id, read } = fixture(
			"",
			`<button id="target">${content}</button>`,
		);
		expect(read()).toEqual(uaContent);
		expect(styles.text(id())).toEqual({
			...initialTextStyle,
			"text-align": "center",
		});
		expect(styles.box(id())).toEqual({
			...initialBoxStyle,
			"box-sizing": "border-box",
		});
		expect(styles.flex(id())).toEqual({
			...initialFlexStyle,
			"align-content": "center",
		});
	},
);

it("inherits button text defaults through rich children without inheriting box alignment", () => {
	const { styles, id, read } = fixture();
	for (const selector of ["#child", "#grandchild"]) {
		expect(read(selector)).toEqual({
			...uaContent,
			"box-sizing": "content-box",
			"align-content": "normal",
		});
		expect(styles.box(id(selector))).toEqual(initialBoxStyle);
		expect(styles.flex(id(selector))).toEqual(initialFlexStyle);
	}
});

it("preserves inherited typography outside the button UA declarations", () => {
	const { styles, id, read } = fixture(
		"#parent{font-family:serif;font-size:20px;font-style:italic;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}",
	);
	const expected = {
		"font-family": "serif",
		"font-size": "20px",
		"font-style": "italic",
		"font-weight": "700",
		"white-space": "pre-wrap",
		"overflow-wrap": "anywhere",
	};
	expect(styles.text(id())).toMatchObject(expected);
	expect(styles.text(id("#child"))).toMatchObject(expected);
	expect(read()).toEqual(uaContent);
});

it("does not let inherited parent declarations override button UA declarations", () => {
	const { read } = fixture(`#parent{${declarations(parentContent, true)}}`);
	expect(read("#parent")).toEqual(parentContent);
	expect(read()).toEqual(uaContent);
	expect(read("#child")).toEqual({
		...initialContent,
		"text-align": "center",
	});
});

it("lets normal author declarations override all six button UA properties", () => {
	const { read } = fixture(`button{${declarations(authorContent)}}`);
	expect(read()).toEqual(authorContent);
	expect(read("#child")).toEqual({
		...authorContent,
		"align-content": "normal",
	});
});

const wideCases = [
	["initial", initialContent],
	["unset", inheritedContent],
	["inherit", parentContent],
	["revert", uaContent],
] as const;

it.each(wideCases)(
	"resolves explicit %s longhands against the correct origin and inheritance",
	(keyword, expected) => {
		const wide = Object.fromEntries(
			Object.keys(uaContent).map((property) => [property, keyword]),
		);
		const { read } = fixture(
			`#parent{${declarations(parentContent)}}button{${declarations(authorContent)}}#target{${declarations(wide)}}`,
		);
		expect(read()).toEqual(expected);
		expect(read("#child")).toEqual({
			...expected,
			"box-sizing": "content-box",
			"align-content": "normal",
		});
	},
);

it.each(wideCases)(
	"resolves inline all:%s without confusing UA defaults and CSS initial values",
	(keyword, expected) => {
		const { tree, id, read } = fixture(
			`#parent{${declarations(parentContent)}}#target{${declarations(authorContent)}}`,
		);
		expect(read()).toEqual(authorContent);
		tree.setAttribute(id(), "style", `all:${keyword}`);
		expect(read()).toEqual(expected);
	},
);

it.each([
	[
		"normal inline over normal sheet",
		false,
		false,
		authorContent,
		authorContent,
	],
	[
		"important sheet over normal inline",
		true,
		false,
		authorContent,
		parentContent,
	],
	[
		"important inline over important sheet",
		true,
		true,
		authorContent,
		authorContent,
	],
	[
		"important inline revert over important sheet",
		true,
		true,
		Object.fromEntries(Object.keys(uaContent).map((name) => [name, "revert"])),
		uaContent,
	],
] as const)(
	"preserves cascade priority: %s",
	(_name, sheetImportant, inlineImportant, inlineValues, expected) => {
		const { tree, id, read } = fixture(
			`#target{${declarations(parentContent, sheetImportant)}}`,
		);
		tree.setAttribute(
			id(),
			"style",
			declarations(inlineValues, inlineImportant),
		);
		expect(read()).toEqual(expected);
	},
);

it("invalidates button and descendant styles after inline replacement and removal", () => {
	const { tree, id, read } = fixture();
	expect(read()).toEqual(uaContent);
	expect(read("#child")["text-align"]).toBe("center");
	const revision = tree.revision;
	tree.setAttribute(id(), "style", declarations(authorContent));
	expect(tree.revision).toBeGreaterThan(revision);
	expect(read()).toEqual(authorContent);
	expect(read("#child")["text-align"]).toBe("right");
	tree.setAttribute(id(), "style", "all:initial");
	expect(read()).toEqual(initialContent);
	tree.removeAttribute(id(), "style");
	expect(read()).toEqual(uaContent);
	expect(read("#child")["text-align"]).toBe("center");
});

it("refreshes selector winners after class changes, sheet replacement and removal", () => {
	const { tree, id, read } = fixture(`.active{${declarations(authorContent)}}`);
	expect(read()).toEqual(uaContent);
	tree.setAttribute(id(), "class", "active");
	expect(read()).toEqual(authorContent);
	tree.removeAttribute(id(), "class");
	expect(read()).toEqual(uaContent);
	tree.setTextContent(id("#sheet"), `button{${declarations(parentContent)}}`);
	expect(read()).toEqual(parentContent);
	tree.remove(id("#sheet"));
	expect(read()).toEqual(uaContent);
	expect(read("#child")["line-height"]).toBe("normal");
});

it("refreshes inherited typography but preserves UA declarations when the parent changes", () => {
	const { tree, styles, id, read } = fixture();
	expect(read()).toEqual(uaContent);
	expect(styles.text(id())["font-size"]).toBe("16px");
	tree.setAttribute(
		id("#parent"),
		"style",
		`${declarations(parentContent)};font-size:30px`,
	);
	expect(read()).toEqual(uaContent);
	expect(styles.text(id())["font-size"]).toBe("30px");
	expect(styles.text(id("#child"))["font-size"]).toBe("30px");
	tree.setAttribute(id(), "style", "all:inherit");
	expect(read()).toEqual(parentContent);
	tree.setAttribute(id("#parent"), "style", declarations(authorContent));
	expect(read()).toEqual(authorContent);
});

it("keeps UA styles stable when button content changes from rich to plain and back", () => {
	const { tree, styles, id, read } = fixture();
	const target = id();
	expect(read()).toEqual(uaContent);
	tree.setTextContent(target, "Plain");
	expect(read()).toEqual(uaContent);
	const child = tree.createElement("span");
	tree.setTextContent(child, "Rich again");
	tree.append(target, child);
	expect(read()).toEqual(uaContent);
	expect(contentStyle(styles, child)).toEqual({
		...initialContent,
		"text-align": "center",
	});
});

it("recomputes a moved child's inheritance without leaking button defaults to its new parent", () => {
	const { tree, id, read } = fixture(
		`#other{${declarations(parentContent)}}`,
		`<button id="target">${richContent}</button><div id="other"></div>`,
	);
	const child = id("#child");
	expect(read("#child")["text-align"]).toBe("center");
	tree.append(id("#other"), child);
	expect(read("#child")).toEqual(inheritedContent);
	expect(read()).toEqual(uaContent);
	tree.append(id(), child);
	expect(read("#child")).toEqual({
		...initialContent,
		"text-align": "center",
	});
});

it.each(["attribute", "stylesheet"])(
	"computes hidden button styles without a formatting box: %s",
	(mode) => {
		const { tree, styles, id, read } = fixture(
			mode === "stylesheet" ? "#target{display:none}" : "",
		);
		if (mode === "attribute") tree.setAttribute(id(), "hidden", "");
		expect(styles.get(id()).displayed).toBe(false);
		expect(read()).toEqual(uaContent);
		expect(read("#child")["text-align"]).toBe("center");
		if (mode === "attribute") tree.removeAttribute(id(), "hidden");
		else tree.setTextContent(id("#sheet"), "");
		expect(styles.get(id()).displayed).toBe(true);
		expect(read()).toEqual(uaContent);
	},
);

it("gives a DOM-nested button its own UA declarations instead of its outer button's values", () => {
	const { tree, styles, id, read } = fixture(
		`#target{${declarations(parentContent)}}`,
	);
	const inner = tree.createElement("button");
	tree.append(id("#child"), inner);
	expect(read()).toEqual(parentContent);
	expect(contentStyle(styles, inner)).toEqual(uaContent);
	tree.setAttribute(inner, "style", "all:inherit");
	expect(contentStyle(styles, inner)).toEqual(inheritedContent);
	tree.removeAttribute(inner, "style");
	expect(contentStyle(styles, inner)).toEqual(uaContent);
});

it.each([svgNamespace, mathmlNamespace])(
	"does not apply HTML button defaults to same-name elements in %s",
	(namespace) => {
		const { tree, styles, id, read } = fixture(
			`#parent{${declarations(parentContent)}}`,
		);
		const foreign = tree.createParserElement("button", {}, namespace);
		tree.append(id("#parent"), foreign);
		expect(contentStyle(styles, foreign)).toEqual(inheritedContent);
		expect(styles.box(foreign)).toEqual(initialBoxStyle);
		expect(styles.flex(foreign)).toEqual(initialFlexStyle);
		tree.setAttribute(foreign, "style", declarations(authorContent));
		expect(contentStyle(styles, foreign)).toEqual(authorContent);
		tree.setAttribute(foreign, "style", "all:revert");
		expect(contentStyle(styles, foreign)).toEqual(inheritedContent);
		expect(read()).toEqual(uaContent);
	},
);

it("keeps repeated reads revision-neutral, avoids recascading and preserves prior style snapshots", () => {
	const { tree, styles, id, read } = fixture();
	const target = id();
	const revision = tree.revision;
	const beforeText = styles.text(target);
	const beforeBox = styles.box(target);
	const beforeFlex = styles.flex(target);
	const snapshot = {
		text: { ...beforeText },
		box: { ...beforeBox },
		flex: { ...beforeFlex },
	};
	const builds = styles.metrics().cascadeBuilds;
	for (let iteration = 0; iteration < 20; iteration++) {
		expect(read()).toEqual(uaContent);
		expect(read("#child")["text-align"]).toBe("center");
	}
	expect(tree.revision).toBe(revision);
	expect(styles.metrics().cascadeBuilds).toBe(builds);
	expect(styles.metrics().layout).toBe(false);
	tree.setAttribute(target, "style", declarations(authorContent));
	expect(read()).toEqual(authorContent);
	expect(beforeText).toEqual(snapshot.text);
	expect(beforeBox).toEqual(snapshot.box);
	expect(beforeFlex).toEqual(snapshot.flex);
	expect(styles.metrics().cascadeBuilds).toBeGreaterThan(builds);
});

it.each([{ maxWork: 1 }, { maxDeclarations: 1 }])(
	"does not bypass style budgets for rich buttons: %j",
	(limits) => {
		const { tree, id, read } = fixture(
			`#target{${declarations(authorContent)}}`,
		);
		const target = id();
		const revision = tree.revision;
		const limited = new DocumentStyles(tree, limits);
		for (let attempt = 0; attempt < 2; attempt++)
			expect(() => contentStyle(limited, target)).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		expect(tree.revision).toBe(revision);
		expect(read()).toEqual(authorContent);
	},
);

it("ignores invalid declarations without erasing valid author winners or missing-property UA defaults", () => {
	const invalid = Object.fromEntries(
		Object.keys(uaContent).map((name) => [name, "not-a-value"]),
	);
	const { tree, id, read } = fixture(
		`#target{${declarations(authorContent)};${declarations(invalid)}}`,
	);
	expect(read()).toEqual(authorContent);
	tree.setTextContent(id("#sheet"), `#target{${declarations(invalid)}}`);
	expect(read()).toEqual(uaContent);
});
