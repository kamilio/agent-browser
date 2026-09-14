import type { DocumentNode } from "./document.js";
import { elementNamespace, svgNamespace } from "./dom-namespaces.js";
import {
	parseCssDeclarations,
	type CssDeclaration,
	type CssProperty,
} from "./css-parser.js";
import { AgentBrowserError } from "./errors.js";

export function svgPresentationDeclarations(
	node: Readonly<DocumentNode>,
	charge: (amount: number) => void,
): readonly CssDeclaration[] {
	if (node.kind !== "element" || elementNamespace(node) !== svgNamespace)
		return [];
	const result: CssDeclaration[] = [];
	if (node.tagName === "svg" && node.attributes.overflow === undefined)
		result.push(
			{ property: "overflow-x", value: "hidden", important: false },
			{ property: "overflow-y", value: "hidden", important: false },
		);
	const properties = [
		"color",
		"display",
		"visibility",
		"pointer-events",
		"opacity",
		"overflow",
		"stop-color",
		"stop-opacity",
		"fill",
		"fill-opacity",
		"fill-rule",
		"clip-path",
		"clip-rule",
		"stroke",
		"stroke-opacity",
		"stroke-width",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
	];
	if (node.tagName === "svg" || node.tagName === "rect")
		properties.push("width", "height");
	for (const property of properties) {
		if (
			property === "fill" &&
			[
				"animate",
				"animateColor",
				"animateMotion",
				"animateTransform",
				"set",
			].includes(node.tagName)
		)
			continue;
		const source = node.attributes[property];
		if (source === undefined) continue;
		if (source.length > 4096)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG presentation attribute limit exceeded",
			);
		charge(source.length * 3 + 1);
		const svgPaint =
			["fill", "fill-opacity", "fill-rule", "clip-path", "clip-rule"].includes(
				property,
			) ||
			property === "stroke" ||
			property.startsWith("stroke-");
		let value = svgPaint
			? source.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			: source.trim();
		if (
			property === "opacity" &&
			/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$/.test(value)
		) {
			const percentage = value.endsWith("%");
			const number = Number(percentage ? value.slice(0, -1) : value);
			if (Number.isFinite(number)) value = `${number}${percentage ? "%" : ""}`;
		}
		if (
			(property === "width" || property === "height") &&
			/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
		) {
			const number = Number(value);
			if (!Number.isFinite(number) || Math.abs(number) > 1e9)
				throw new AgentBrowserError(
					"resource-limit",
					"SVG dimension magnitude limit exceeded",
				);
			value = `${number}px`;
		}
		let invalid = /[;!]/.test(value);
		const declarations = parseCssDeclarations(
			`${property}:${value}`,
			{ rules: 0, declarations: 0, maxRules: 1, maxDeclarations: 2 },
			() => {
				invalid = true;
			},
		);
		const expected: CssProperty[] =
			property === "overflow"
				? ["overflow-x", "overflow-y"]
				: [property as CssProperty];
		if (
			invalid ||
			declarations.length !== expected.length ||
			declarations.some(
				(declaration, index) =>
					declaration.property !== expected[index] ||
					declaration.important ||
					declaration.substitution,
			)
		) {
			if (svgPaint || property === "opacity") {
				result.push({
					property: property as CssProperty,
					value,
					important: false,
				});
				continue;
			}
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG presentation attribute",
			);
		}
		for (const declaration of declarations) result.push(declaration);
	}
	return Object.freeze(result.map((declaration) => Object.freeze(declaration)));
}
