import { expect, it } from "vitest";
import {
	computeGridStyle,
	cssGridLimits,
	cssGridProperties,
	gridShorthandComponents,
	gridStyleCapabilities,
	initialGridStyle,
	isCssGridProperty,
	isGridDisplay,
	parseGridDeclarations,
	parseGridValue,
	serializeGridShorthand,
	type GridSpecifiedStyle,
} from "./css-grid.js";

const viewport = { width: 1000, height: 500 };
const fonts = { fontSize: 12, rootFontSize: 20 };
function shorthand(property: string, value: string) {
	return parseGridDeclarations(property, value)?.map((entry) => entry.value);
}

it("exports exactly the ten non-inherited longhands and frozen defaults", () => {
	expect(cssGridProperties).toHaveLength(10);
	expect(new Set(cssGridProperties).size).toBe(10);
	expect(Object.keys(initialGridStyle)).toEqual(cssGridProperties);
	expect(Object.isFrozen(cssGridProperties)).toBe(true);
	expect(Object.isFrozen(initialGridStyle)).toBe(true);
	expect(Object.isFrozen(cssGridLimits)).toBe(true);
	expect(computeGridStyle({}, initialGridStyle, viewport)).toEqual(
		initialGridStyle,
	);
	for (const property of cssGridProperties) {
		expect(isCssGridProperty(property)).toBe(true);
		expect(parseGridValue(property, initialGridStyle[property])).toBe(
			initialGridStyle[property],
		);
	}
	expect(isCssGridProperty("grid")).toBe(false);
	expect(isCssGridProperty("toString")).toBe(false);
	expect(gridStyleCapabilities.layout).toBe(true);
});

it.each([
	["NONE", "none"],
	["AUTO Min-Content MAX-content", "auto min-content max-content"],
	["0 25% 1FR .5fr +2px", "0px 25% 1fr 0.5fr 2px"],
	["1e2PX 2E-1fr", "100px 0.2fr"],
	[
		"[Left LEFT] MINMAX(0, 1FR) [Right]",
		"[Left LEFT] minmax(0px, 1fr) [Right]",
	],
	["[START] FIT-CONTENT(50%) [End]", "[START] fit-content(50%) [End]"],
	["MINMAX(min-content, MAX-content)", "minmax(min-content, max-content)"],
	["minmax(auto, 0fr)", "minmax(auto, 0fr)"],
	["minmax(50%, 10px)", "minmax(50%, 10px)"],
	["[] 1fr []", "[] 1fr []"],
	["[--Line _Line éLine None] 1px", "[--Line _Line éLine None] 1px"],
	[
		"REPEAT(+2, [Top] MINMAX(1em,2FR) [Bottom])",
		"repeat(2, [Top] minmax(1em, 2fr) [Bottom])",
	],
	[
		"[First] repeat(2, [A] 1fr [B] 2fr [C]) [Last] 5px",
		"[First] repeat(2, [A] 1fr [B] 2fr [C]) [Last] 5px",
	],
	["1fr/**/2fr", "1fr 2fr"],
	["/* leading */ minmax(0,/* gap */ 1fr) /* end */", "minmax(0px, 1fr)"],
])("parses bounded track syntax %s", (source, expected) => {
	for (const property of [
		"grid-template-columns",
		"grid-template-rows",
	] as const) {
		expect(parseGridValue(property, source)).toBe(expected);
		expect(parseGridValue(property, expected)).toBe(expected);
	}
});

it("parses the captured MDN two-sidebar template without folding names", () => {
	const source =
		"[Full-start Left-start] minmax(15rem,1fr) [Left-end] 2rem [Content-start] minmax(0,48rem) [Content-end] 2rem [Right-start] minmax(15rem,1fr) [Full-end Right-end]";
	expect(parseGridValue("grid-template-columns", source)).toBe(
		"[Full-start Left-start] minmax(15rem, 1fr) [Left-end] 2rem [Content-start] minmax(0px, 48rem) [Content-end] 2rem [Right-start] minmax(15rem, 1fr) [Full-end Right-end]",
	);
	expect(
		computeGridStyle(
			{ "grid-template-columns": source },
			initialGridStyle,
			viewport,
			fonts,
		)["grid-template-columns"],
	).toBe(
		"[Full-start Left-start] minmax(300px, 1fr) [Left-end] 40px [Content-start] minmax(0px, 960px) [Content-end] 40px [Right-start] minmax(300px, 1fr) [Full-end Right-end]",
	);
});

it.each([
	"",
	" ",
	"none 1fr",
	"1",
	"-1px",
	"-1%",
	"-0.1fr",
	"1e999px",
	"1e999fr",
	"1fr, 2fr",
	"10px / 2px",
	"auto auto)",
	"[Left]",
	"[auto] 1fr",
	"[SPAN] 1fr",
	"[initial] 1fr",
	"[default] 1fr",
	"[revert-layer] 1fr",
	"[1Line] 1fr",
	"[a] [b] 1fr",
	"[a 1fr",
	"1fr ]",
	"minmax(1fr, 10px)",
	"minmax(-1px, 1fr)",
	"minmax(0, -1fr)",
	"minmax(0)",
	"minmax(0, 1fr, 2fr)",
	"minmax(auto auto)",
	"minmax (0, 1fr)",
	"minmax(minmax(0, 1fr), 2fr)",
	"minmax(0, fit-content(1px))",
	"fit-content(auto)",
	"fit-content(1fr)",
	"fit-content(-1px)",
	"fit-content(10px, 20px)",
	"fit-content",
	"repeat(0, 1fr)",
	"repeat(-2, 1fr)",
	"repeat(1.5, 1fr)",
	"repeat(1e2, 1fr)",
	"repeat(2)",
	"repeat(2,)",
	"repeat(2, [line])",
	"repeat(2, repeat(2, 1fr))",
	"repeat(2, 1fr",
	"repeat(2, 1fr))",
	"repeat(auto-fill, 1fr)",
	"repeat(auto-fit, 10px)",
	"subgrid",
	"masonry",
	"calc(20px + 1%)",
	"var(--Tracks)",
	"1svh",
	"10ch",
	"[\\41] 1fr",
	"\\61 uto",
	"1px/*",
	"1px /*",
	"1px\u0000",
	"1px;",
	"1px!important",
])("rejects invalid or unsupported track syntax %s", (source) => {
	expect(parseGridValue("grid-template-columns", source)).toBeUndefined();
});

it.each([
	"auto",
	"min-content max-content",
	"1fr minmax(0, 2fr)",
	"fit-content(30%) 1em",
])("accepts an implicit-track size list %s", (source) => {
	for (const property of ["grid-auto-columns", "grid-auto-rows"] as const)
		expect(parseGridValue(property, source)).toBeDefined();
});
it.each(["none", "[Name] auto", "repeat(2, auto)", "1px, 2px"])(
	"rejects explicit-only syntax in implicit tracks %s",
	(source) => {
		expect(parseGridValue("grid-auto-rows", source)).toBeUndefined();
	},
);

it.each([
	["ROW", "row"],
	["column", "column"],
	["dense", "row dense"],
	["DENSE ROW", "row dense"],
	["COLUMN Dense", "column dense"],
	["dense column", "column dense"],
])("parses grid-auto-flow %s", (source, expected) => {
	expect(parseGridValue("grid-auto-flow", source)).toBe(expected);
});
it.each([
	"",
	"row column",
	"row row",
	"dense dense",
	"row dense dense",
	"row / dense",
	"sparse",
	'"row"',
])("rejects malformed auto-flow %s", (source) => {
	expect(parseGridValue("grid-auto-flow", source)).toBeUndefined();
});

it.each([
	['"Header Header" "Body Sidebar"', '"Header Header" "Body Sidebar"'],
	[
		'"Left . Header . Right" "Left . Body . Right"',
		'"Left . Header . Right" "Left . Body . Right"',
	],
	["'Top Top' 'Body Side'", '"Top Top" "Body Side"'],
	['"Top...Side"', '"Top . Side"'],
	['"... ...."', '". ."'],
	['"A A a" "A A a"', '"A A a" "A A a"'],
	['"1 2 -- _ é"', '"1 2 -- _ é"'],
	['"initial Auto Span"', '"initial Auto Span"'],
	['"  A\tA  "', '"A A"'],
])("validates and preserves case in template areas %s", (source, expected) => {
	expect(parseGridValue("grid-template-areas", source)).toBe(expected);
	expect(parseGridValue("grid-template-areas", expected)).toBe(expected);
});
it.each([
	'""',
	'" "',
	'"A B" "A"',
	'"A A" "A ."',
	'"A ." ". A"',
	'"A B A"',
	'"A B" "C A"',
	'"A A A" "A B A" "A A A"',
	'"A\\42"',
	'"A\nB"',
	'"A\rB"',
	'"A\fB"',
	'"A/B"',
	'"A#B"',
	'"A,B"',
	'"A" none',
	'"A" "B',
	"Area",
])("rejects nonrectangular or malformed areas %s", (source) => {
	expect(parseGridValue("grid-template-areas", source)).toBeUndefined();
});

it.each([
	["AUTO", "auto"],
	["Name", "Name"],
	["name", "name"],
	["None", "None"],
	["+02", "2"],
	["-3", "-3"],
	["End -2", "-2 End"],
	["2 End", "2 End"],
	["SPAN 2", "span 2"],
	["2 span", "span 2"],
	["Name span", "span Name"],
	["span Name 2", "span 2 Name"],
	["Name 2 span", "span 2 Name"],
	["--Line", "--Line"],
	["éLine", "éLine"],
])(
	"normalizes placement while preserving identifiers %s",
	(source, expected) => {
		for (const property of [
			"grid-row-start",
			"grid-row-end",
			"grid-column-start",
			"grid-column-end",
		] as const) {
			expect(parseGridValue(property, source)).toBe(expected);
			expect(parseGridValue(property, expected)).toBe(expected);
		}
	},
);
it.each([
	"",
	"0",
	"-0",
	"+0",
	"0 Name",
	"1.0",
	"1e2",
	"1px",
	"span",
	"span 0",
	"span -2",
	"span span 2",
	"span Auto",
	"2 3",
	"Name Other",
	"auto 2",
	"Auto Name",
	"2 initial",
	"span default",
	"default",
	"revert-layer",
	"2 Name Other",
	"1 / 2",
	"\\4e ame",
	'"Name"',
])("rejects invalid grid placement %s", (source) => {
	expect(parseGridValue("grid-row-start", source)).toBeUndefined();
});

it.each([
	["grid-row", "Name", ["Name", "Name"]],
	["grid-column", "2", ["2", "auto"]],
	["grid-column", "span Name", ["span Name", "auto"]],
	["grid-row", "Name / Other", ["Name", "Other"]],
	["grid-area", "Name", ["Name", "Name", "Name", "Name"]],
	["grid-area", "2", ["2", "auto", "auto", "auto"]],
	["grid-area", "Name / Other", ["Name", "Other", "Name", "Other"]],
	["grid-area", "2 / Other", ["2", "Other", "auto", "Other"]],
	["grid-area", "Name / 2", ["Name", "2", "Name", "auto"]],
	["grid-area", "Name / Other / span 2", ["Name", "Other", "span 2", "Other"]],
	["grid-area", "1 / 2 / 3 / 4", ["1", "2", "3", "4"]],
	["grid-area", "auto", ["auto", "auto", "auto", "auto"]],
])(
	"expands %s:%s with CSS omitted-value rules",
	(property, source, expected) => {
		expect(shorthand(property as string, source as string)).toEqual(expected);
		const values = expected as string[];
		const serialized = serializeGridShorthand(property as string, values);
		expect(shorthand(property as string, serialized)).toEqual(values);
	},
);

it.each([
	"/ Name",
	"Name /",
	"Name // Other",
	"1 / 2 / 3 / 4 / 5",
	"initial / initial",
	"Name / inherit",
	"span 0",
])("rejects malformed placement shorthand %s", (source) => {
	expect(parseGridDeclarations("grid-area", source)).toBeUndefined();
});
it("does not advertise incomplete shorthands or prototype members", () => {
	for (const property of ["grid", "grid-template", "toString", "constructor"]) {
		expect(gridShorthandComponents(property)).toBeUndefined();
		expect(parseGridDeclarations(property, "auto")).toBeUndefined();
		expect(serializeGridShorthand(property, ["auto"])).toBe("");
	}
	expect(parseGridDeclarations("grid-row", "1 / 2 / 3")).toBeUndefined();
	expect(serializeGridShorthand("grid-row", ["Name"])).toBe("");
	expect(gridShorthandComponents("grid-area")).toEqual([
		"grid-row-start",
		"grid-column-start",
		"grid-row-end",
		"grid-column-end",
	]);
});

it.each(["INITIAL", "inherit", "Unset", "revert"])(
	"supports standalone CSS-wide keyword %s",
	(source) => {
		const expected = source.toLowerCase();
		for (const property of cssGridProperties)
			expect(parseGridValue(property, source)).toBe(expected);
		for (const property of ["grid-row", "grid-column", "grid-area"]) {
			const values = shorthand(property, source)!;
			expect(values.every((value) => value === expected)).toBe(true);
			expect(serializeGridShorthand(property, values)).toBe(expected);
		}
		expect(serializeGridShorthand("grid-row", [expected, "auto"])).toBe("");
	},
);

it("computes only length tokens, not named lines, strings or placement names", () => {
	const computed = computeGridStyle(
		{
			"grid-template-columns":
				"[EM rem VW AUTO-start] minmax(2em, 1fr) fit-content(2rem) repeat(2, [PX] 10vw 20vh 25% 1in)",
			"grid-template-areas": '"EM rem"',
			"grid-row-start": "EM",
			"grid-auto-rows": "1vmin 1vmax 2pt 1pc 0",
		},
		initialGridStyle,
		viewport,
		fonts,
	);
	expect(computed["grid-template-columns"]).toBe(
		"[EM rem VW AUTO-start] minmax(24px, 1fr) fit-content(40px) repeat(2, [PX] 100px 100px 25% 96px)",
	);
	expect(computed["grid-template-areas"]).toBe('"EM rem"');
	expect(computed["grid-row-start"]).toBe("EM");
	expect(computed["grid-auto-rows"]).toBe(
		"5px 10px 2.6666666666666665px 16px 0px",
	);
	expect(Object.isFrozen(computed)).toBe(true);
});
it("inherits computed values without recomputing font or viewport lengths", () => {
	const parent = computeGridStyle(
		{ "grid-template-columns": "2em 1rem 10vw", "grid-row-start": "Name" },
		initialGridStyle,
		viewport,
		fonts,
	);
	const inherited: GridSpecifiedStyle = Object.fromEntries(
		cssGridProperties.map((property) => [property, "inherit"]),
	);
	expect(
		computeGridStyle(
			inherited,
			parent,
			{ width: 5, height: 10 },
			{ fontSize: 1, rootFontSize: 2 },
		),
	).toEqual(parent);
	expect(computeGridStyle({}, parent, viewport, fonts)).toEqual(
		initialGridStyle,
	);
	for (const keyword of ["initial", "unset", "revert"])
		expect(
			computeGridStyle(
				Object.fromEntries(
					cssGridProperties.map((property) => [property, keyword]),
				),
				parent,
				viewport,
				fonts,
			),
		).toEqual(initialGridStyle);
});
it("does not invent font metrics or retain non-finite computed lengths", () => {
	expect(() =>
		computeGridStyle(
			{ "grid-template-columns": "1em" },
			initialGridStyle,
			viewport,
		),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
	expect(() =>
		computeGridStyle({ "grid-auto-rows": "1rem" }, initialGridStyle, viewport),
	).toThrowError(expect.objectContaining({ code: "unsupported" }));
	expect(() =>
		computeGridStyle({ "grid-auto-rows": "1px" }, initialGridStyle, viewport, {
			fontSize: -1,
		}),
	).toThrowError(expect.objectContaining({ code: "invalid-input" }));
	expect(() =>
		computeGridStyle(
			{ "grid-auto-rows": "1e308in" },
			initialGridStyle,
			viewport,
		),
	).toThrowError(expect.objectContaining({ code: "resource-limit" }));
});

it("bounds explicit and repeated track counts before layout or expansion", () => {
	const property = "grid-template-columns";
	expect(
		parseGridValue(property, `repeat(${cssGridLimits.maxRepeatCount}, 1fr)`),
	).toBeDefined();
	expect(
		parseGridValue(
			property,
			`repeat(${cssGridLimits.maxRepeatCount + 1}, 1fr)`,
		),
	).toBeUndefined();
	expect(parseGridValue(property, "repeat(128, 1fr 1fr)")).toBeDefined();
	expect(parseGridValue(property, "repeat(129, 1fr 1fr)")).toBeUndefined();
	expect(
		parseGridValue(property, "repeat(128, 1fr) repeat(128, 1fr)"),
	).toBeDefined();
	expect(
		parseGridValue(property, "repeat(128, 1fr) repeat(129, 1fr)"),
	).toBeUndefined();
	expect(
		parseGridValue(
			property,
			Array(cssGridLimits.maxTracks).fill("auto").join(" "),
		),
	).toBeDefined();
	expect(
		parseGridValue(
			property,
			Array(cssGridLimits.maxTracks + 1)
				.fill("auto")
				.join(" "),
		),
	).toBeUndefined();
});
it("bounds repeated line-name expansion separately from the track count", () => {
	const names = Array(14).fill("Name").join(" ");
	expect(
		parseGridValue("grid-template-columns", `repeat(256, [${names}] 1fr)`),
	).toBeDefined();
	expect(
		parseGridValue("grid-template-columns", `repeat(256, [${names} More] 1fr)`),
	).toBeUndefined();
	expect(
		parseGridValue(
			"grid-template-columns",
			`[${Array(cssGridLimits.maxLineNames).fill("Name").join(" ")}] 1fr`,
		),
	).toBeDefined();
	expect(
		parseGridValue(
			"grid-template-columns",
			`[${Array(cssGridLimits.maxLineNames + 1)
				.fill("Name")
				.join(" ")}] 1fr`,
		),
	).toBeUndefined();
});
it("bounds source, token and identifier retention", () => {
	expect(
		parseGridValue(
			"grid-row-start",
			`Name${" ".repeat(cssGridLimits.maxSourceCodeUnits - 4)}`,
		),
	).toBe("Name");
	expect(
		parseGridValue(
			"grid-row-start",
			`Name${" ".repeat(cssGridLimits.maxSourceCodeUnits - 3)}`,
		),
	).toBeUndefined();
	expect(
		parseGridValue(
			"grid-row-start",
			"N".repeat(cssGridLimits.maxIdentifierCodeUnits),
		),
	).toBeDefined();
	expect(
		parseGridValue(
			"grid-row-start",
			"N".repeat(cssGridLimits.maxIdentifierCodeUnits + 1),
		),
	).toBeUndefined();
	const size = `"${"N".repeat(cssGridLimits.maxIdentifierCodeUnits + 1)}"`;
	expect(parseGridValue("grid-template-areas", size)).toBeUndefined();
	const component = `[${Array(13).fill("N").join(" ")}] 0`;
	expect(
		parseGridValue(
			"grid-template-columns",
			Array(256).fill(component).join(" "),
		),
	).toBeDefined();
	expect(
		parseGridValue(
			"grid-template-columns",
			`${Array(256).fill(component).join(" ")} []`,
		),
	).toBeUndefined();
});
it("bounds grid area dimensions and total cells", () => {
	const row = '"' + Array(64).fill(".").join(" ") + '"';
	expect(
		parseGridValue("grid-template-areas", Array(64).fill(row).join(" ")),
	).toBeDefined();
	expect(
		parseGridValue("grid-template-areas", Array(65).fill(row).join(" ")),
	).toBeUndefined();
	expect(
		parseGridValue(
			"grid-template-areas",
			Array(cssGridLimits.maxAreaRows).fill('"A"').join(" "),
		),
	).toBeDefined();
	expect(
		parseGridValue(
			"grid-template-areas",
			Array(cssGridLimits.maxAreaRows + 1)
				.fill('"A"')
				.join(" "),
		),
	).toBeUndefined();
	const columns = (count: number) => `"${Array(count).fill("A").join(" ")}"`;
	expect(
		parseGridValue(
			"grid-template-areas",
			columns(cssGridLimits.maxAreaColumns),
		),
	).toBeDefined();
	expect(
		parseGridValue(
			"grid-template-areas",
			columns(cssGridLimits.maxAreaColumns + 1),
		),
	).toBeUndefined();
});
it("rejects serialization growth before accepting a non-round-trippable value", () => {
	const source = Array(126)
		.fill(`[${"N".repeat(125)}]0`)
		.join(" ");
	expect(source.length).toBeLessThan(cssGridLimits.maxSourceCodeUnits);
	expect(parseGridValue("grid-template-columns", source)).toBeUndefined();
	const fitting = Array(123)
		.fill(`[${"N".repeat(125)}]0`)
		.join(" ");
	const normalized = parseGridValue("grid-template-columns", fitting);
	expect(normalized).toBeDefined();
	expect(parseGridValue("grid-template-columns", normalized!)).toBe(normalized);
});
it("bounds positive, negative and span line indexes", () => {
	for (const prefix of ["", "-", "span "]) {
		expect(
			parseGridValue(
				"grid-row-start",
				`${prefix}${cssGridLimits.maxLineIndex}`,
			),
		).toBeDefined();
		expect(
			parseGridValue(
				"grid-row-start",
				`${prefix}${cssGridLimits.maxLineIndex + 1}`,
			),
		).toBeUndefined();
	}
});

it.each(["grid", "inline-grid", "block grid", "inline grid"])(
	"recognizes grid display %s",
	(value) => expect(isGridDisplay(value)).toBe(true),
);
it.each(["block", "flex", "inline", "grid inline", "grid flow", "GRID"])(
	"does not invent a grid formatting context for %s",
	(value) => expect(isGridDisplay(value)).toBe(false),
);
