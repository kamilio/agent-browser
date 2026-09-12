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
		"overflow",
		"stop-color",
		"stop-opacity",
		"fill",
		"fill-opacity",
		"fill-rule",
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
		let value = ["fill", "fill-opacity", "fill-rule"].includes(property)
			? source.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")
			: source.trim();
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
			if (["fill", "fill-opacity", "fill-rule"].includes(property)) {
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
