import { expect, it } from "vitest";
import {
	computeListStyle,
	cssListProperties,
	initialListStyle,
	isCssListProperty,
	markerTypes,
	parseListDeclarations,
	parseListValue,
	serializeListStyle,
	type CssListProperty,
	type ListStyle,
} from "./css-list.js";

function listStyle(
	type = "disc",
	position = "outside",
	image = "none",
): ListStyle {
	return {
		"list-style-type": type,
		"list-style-position": position,
		"list-style-image": image,
	};
}

function declarations(style: ListStyle) {
	return cssListProperties.map((property) => ({
		property,
		value: style[property],
	}));
}

function specified(value: string): Partial<ListStyle> {
	const parsed = parseListDeclarations("list-style", value);
	expect(parsed).toBeDefined();
	return Object.fromEntries(
		parsed!.map(({ property, value }) => [property, value]),
	);
}

it("appends the inherited image property without reordering existing properties", () => {
	expect(cssListProperties).toEqual([
		"list-style-type",
		"list-style-position",
		"list-style-image",
	]);
	expect(initialListStyle).toEqual(listStyle());
	expect(Object.isFrozen(cssListProperties)).toBe(true);
	expect(Object.isFrozen(initialListStyle)).toBe(true);
	for (const property of cssListProperties)
		expect(isCssListProperty(property)).toBe(true);
	expect(isCssListProperty("list-style")).toBe(false);
});

it.each(markerTypes)(
	"expands and round-trips the single marker type %s",
	(type) => {
		const style = listStyle(type);
		expect(parseListDeclarations("list-style", type)).toEqual(
			declarations(style),
		);
		expect(serializeListStyle(style)).toBe(`outside none ${type}`);
		expect(
			parseListDeclarations("list-style", serializeListStyle(style)),
		).toEqual(declarations(style));
		expect(parseListValue("list-style-type", type)).toBe(type);
		expect(parseListDeclarations("list-style-type", type)).toEqual([
			{ property: "list-style-type", value: type },
		]);
	},
);

it.each([
	["inside", "disc", "inside"],
	["outside", "disc", "outside"],
	["none none", "none", "outside"],
	["inside none", "none", "inside"],
	["none inside", "none", "inside"],
	["outside none", "none", "outside"],
	["none outside", "none", "outside"],
	["inside none none", "none", "inside"],
	["none inside none", "none", "inside"],
	["none none inside", "none", "inside"],
	["none none outside", "none", "outside"],
	["circle inside", "circle", "inside"],
	["inside circle", "circle", "inside"],
	["square none", "square", "outside"],
	["none square", "square", "outside"],
	["decimal inside none", "decimal", "inside"],
	["decimal none inside", "decimal", "inside"],
	["inside decimal none", "decimal", "inside"],
	["inside none decimal", "decimal", "inside"],
	["none decimal inside", "decimal", "inside"],
	["none inside decimal", "decimal", "inside"],
	["\t\n DISC\r\f NONE  INSIDE \t", "disc", "inside"],
	["\r\n none\t\f", "none", "outside"],
])(
	"expands %j with initial resets and explicit serialization",
	(value, type, position) => {
		const style = listStyle(type, position);
		expect(parseListDeclarations("list-style", value)).toEqual(
			declarations(style),
		);
		expect(serializeListStyle(style)).toBe(`${position} none ${type}`);
		expect(
			parseListDeclarations("list-style", serializeListStyle(style)),
		).toEqual(declarations(style));
	},
);

it.each(["initial", "inherit", "unset", "revert"])(
	"expands, delegates and round-trips the CSS-wide keyword %s",
	(value) => {
		const style = listStyle(value, value, value);
		expect(parseListDeclarations("list-style", value)).toEqual(
			declarations(style),
		);
		expect(
			parseListDeclarations("list-style", `\t${value.toUpperCase()}\n`),
		).toEqual(declarations(style));
		expect(serializeListStyle(style)).toBe(value);
		expect(
			parseListDeclarations("list-style", serializeListStyle(style)),
		).toEqual(declarations(style));
		for (const property of cssListProperties) {
			expect(parseListValue(property, value)).toBe(value);
			expect(parseListDeclarations(property, value)).toEqual([
				{ property, value },
			]);
		}
	},
);

it.each([
	["list-style-position", "inside"],
	["list-style-position", "outside"],
	["list-style-image", "none"],
] as const)(
	"delegates %s:%s without resetting other longhands",
	(property, value) => {
		expect(parseListValue(property, value)).toBe(value);
		expect(parseListDeclarations(property, value)).toEqual([
			{ property, value },
		]);
	},
);

it.each([
	["list-style-type", "inside"],
	["list-style-type", "upper-roman"],
	["list-style-type", '"marker"'],
	["list-style-position", "none"],
	["list-style-position", "disc"],
	["list-style-image", "disc"],
	["list-style-image", "url(marker.png)"],
	["list-style-image", "linear-gradient(red, blue)"],
	["list-style-image", "revert-layer"],
] as const)("rejects unsupported longhand %s:%s", (property, value) => {
	expect(parseListValue(property, value)).toBeUndefined();
	expect(parseListDeclarations(property, value)).toBeUndefined();
});

it.each(["color", "list-style-color", "LIST-STYLE"])(
	"leaves unknown or unnormalized property %s to the declaration owner",
	(property) => {
		expect(isCssListProperty(property)).toBe(false);
		expect(parseListDeclarations(property, "none")).toBeUndefined();
	},
);

it.each([
	"",
	" \t\r\n\f",
	"disc circle",
	"disc disc",
	"inside outside",
	"inside inside",
	"none none none",
	"disc none none",
	"none disc none",
	"none none disc",
	"inside none none disc",
	"inherit disc",
	"none initial",
	"unset outside",
	"revert none",
	"inherit inherit",
	"revert-layer",
	"url(marker.png)",
	"inside url(marker.png) disc",
	'"marker"',
	"custom-counter",
	"symbols(cyclic disc)",
	"var(--marker)",
	"none !important",
	"inside,disc",
	"inside\u00a0disc",
	"\u00a0none",
	"inside\vdisc",
	"none/*comment*/inside",
])("rejects invalid or unsupported shorthand %j atomically", (value) => {
	expect(parseListDeclarations("list-style", value)).toBeUndefined();
});

it.each([
	["list-style-type", "unknown"],
	["list-style-position", "none"],
	["list-style-image", "url(marker.png)"],
	["list-style-type", "inherit"],
	["list-style-position", "initial"],
	["list-style-image", "unset"],
	["list-style-image", "revert"],
] as const)(
	"refuses invalid or mixed-wide serialization for %s:%s",
	(property, value) => {
		expect(serializeListStyle({ ...initialListStyle, [property]: value })).toBe(
			"",
		);
	},
);

it("refuses different CSS-wide keywords and incomplete style records", () => {
	expect(serializeListStyle(listStyle("inherit", "unset", "revert"))).toBe("");
	for (const property of cssListProperties) {
		const style: Partial<Record<CssListProperty, string>> = {
			...initialListStyle,
		};
		delete style[property];
		expect(serializeListStyle(style as ListStyle)).toBe("");
	}
});

const parentStyle: ListStyle = Object.freeze(listStyle("square", "inside"));
const defaultStyle: ListStyle = Object.freeze(listStyle("decimal", "outside"));

it.each(["none", "disc", "outside", "circle inside"])(
	"resets omitted components of %s instead of inheriting parent or defaults",
	(value) => {
		const supplied = specified(value);
		const result = computeListStyle(supplied, parentStyle, defaultStyle);
		expect(result).toEqual(supplied);
		expect(Object.isFrozen(result)).toBe(true);
	},
);

it.each(["inherit", "unset"])(
	"inherits every component and reuses parent identity for %s",
	(value) => {
		expect(computeListStyle(specified(value), parentStyle, defaultStyle)).toBe(
			parentStyle,
		);
	},
);

it("resolves initial across all components without using defaults", () => {
	const result = computeListStyle(
		specified("initial"),
		parentStyle,
		defaultStyle,
	);
	expect(result).toEqual(initialListStyle);
	expect(Object.isFrozen(result)).toBe(true);
});

it("resolves revert through defaults with per-component inherited fallback", () => {
	expect(
		computeListStyle(specified("revert"), parentStyle, defaultStyle),
	).toEqual(defaultStyle);
	expect(computeListStyle(specified("revert"), parentStyle)).toBe(parentStyle);
	expect(
		computeListStyle(specified("revert"), parentStyle, {
			"list-style-type": "decimal",
		}),
	).toEqual(listStyle("decimal", "inside"));
});

it("inherits absent components and applies available defaults", () => {
	expect(computeListStyle({}, parentStyle)).toBe(parentStyle);
	expect(computeListStyle({}, parentStyle, defaultStyle)).toEqual(defaultStyle);
	expect(
		computeListStyle({ "list-style-type": "circle" }, parentStyle),
	).toEqual(listStyle("circle", "inside"));
});

it("preserves frozen inputs and parent reuse when explicit values match", () => {
	const supplied = Object.freeze(specified("inside none square"));
	expect(computeListStyle(supplied, parentStyle, defaultStyle)).toBe(
		parentStyle,
	);
	expect(serializeListStyle(parentStyle)).toBe("inside none square");
	expect(supplied).toEqual(listStyle("square", "inside"));
	expect(parentStyle).toEqual(listStyle("square", "inside"));
	expect(defaultStyle).toEqual(listStyle("decimal", "outside"));
	expect(initialListStyle).toEqual(listStyle());
});
