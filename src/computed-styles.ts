import { serializeSvgFill } from "./svg-paint-value.js";
import {
	cssRadiusProperties,
	isCssRadiusProperty,
	serializeRadiusStyle,
} from "./css-radius.js";
import {
	initialBackgroundValues,
	isNeutralBackgroundProperty,
} from "./css-background.js";
import { cssBoxProperties, isCssBoxProperty } from "./css-box.js";
import {
	cssLogicalBlockProperties,
	logicalBlockComponents,
	logicalBlockPhysicalProperty,
} from "./css-logical-box.js";
import {
	cssGridProperties,
	isCssGridProperty,
	gridShorthandComponents,
	serializeGridShorthand,
} from "./css-grid.js";
import { cssInteractionProperties } from "./css-interaction.js";
import {
	cssListProperties,
	isCssListProperty,
	serializeListStyle,
} from "./css-list.js";
import { cssTableProperties, isCssTableProperty } from "./css-table.js";
import { cssOutlineProperties, isCssOutlineProperty } from "./css-outline.js";
import {
	cssFlexProperties,
	isCssFlexProperty,
	flexShorthandComponents,
	serializeFlexShorthand,
} from "./css-flex.js";
import {
	cssFlowProperties,
	isCssFlowProperty,
	serializeOverflow,
} from "./css-flow.js";
import {
	borderColorProperties,
	type BorderColorProperty,
} from "./css-border.js";
import {
	cssPaintProperties,
	paintBackground,
	paintCaret,
} from "./css-paint.js";
import {
	canonicalCssProperty,
	cssPropertyAccessors,
	cssPropertyAliases,
} from "./css-property-aliases.js";
import { cssTextProperties, isCssTextProperty } from "./css-text.js";
import {
	cssTextDecorationStyleProperties,
	isCssTextDecorationProperty,
	serializeTextDecoration,
} from "./css-text-decoration.js";
import { documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";
import { documentStyles } from "./styles.js";
import { cssVariableLimits } from "./css-variables.js";

export const computedStyleProperties = Object.freeze(
	[
		...cssBoxProperties,
		...cssLogicalBlockProperties,
		...cssRadiusProperties,
		...cssGridProperties,
		...cssFlexProperties,
		...cssFlowProperties,
		...cssInteractionProperties,
		...cssListProperties,
		...cssTableProperties,
		...cssOutlineProperties,
		...cssTextDecorationStyleProperties,
		...cssPaintProperties,
		...cssTextProperties,
		"display",
		"visibility",
	].sort(),
);
export const computedStyleLimits = Object.freeze({
	maxObjects: 4096,
	maxArgumentCodeUnits: 1024,
});

function scalar(value: unknown): string {
	if (
		(typeof value === "object" && value !== null) ||
		typeof value === "function" ||
		typeof value === "symbol"
	)
		throw new AgentBrowserError(
			"unsupported",
			"CSS object coercion is unsupported",
		);
	const result = String(value);
	if (result.length > computedStyleLimits.maxArgumentCodeUnits)
		throw new AgentBrowserError(
			"resource-limit",
			"Computed style argument limit exceeded",
		);
	return result;
}

export function resolvedStyleValue(
	tree: DocumentTree,
	id: number,
	property: string,
): string {
	if (tree.get(id).kind !== "element")
		throw new TypeError("Computed style requires an element");
	if (!tree.isConnected(id)) return "";
	const name = canonicalCssProperty(property);
	const physical = logicalBlockPhysicalProperty(name);
	if (physical !== undefined) return resolvedStyleValue(tree, id, physical);
	const logical = logicalBlockComponents(name);
	if (logical !== undefined) {
		const values = logical.map((component) =>
			resolvedStyleValue(tree, id, component),
		);
		return values[0] === values[1] ? values[0] : values.join(" ");
	}
	if (isNeutralBackgroundProperty(name)) return initialBackgroundValues[name];
	if (name === "background")
		return `${resolvedStyleValue(tree, id, "background-color")} none repeat scroll 0% 0% / auto padding-box border-box`;
	if (name === "margin" || name === "padding") {
		const values = ["top", "right", "bottom", "left"].map((side) =>
			resolvedStyleValue(tree, id, `${name}-${side}`),
		);
		if (values[3] === values[1]) {
			values.pop();
			if (values[2] === values[0]) {
				values.pop();
				if (values[1] === values[0]) values.pop();
			}
		}
		return values.join(" ");
	}
	const styles = documentStyles(tree);
	if (isCssTextDecorationProperty(name)) return styles.textDecoration(id)[name];
	if (name === "text-decoration") {
		const decoration = styles.textDecoration(id);
		return serializeTextDecoration(decoration);
	}
	if (isCssOutlineProperty(name)) return styles.outline(id)[name];
	if (name === "outline") {
		const outline = styles.outline(id);
		return cssOutlineProperties
			.slice(0, 3)
			.map((property) => outline[property])
			.join(" ");
	}
	if (name === "pointer-events") return styles.pointerEvents(id);
	if (name === "cursor") return styles.cursor(id);
	if (isCssRadiusProperty(name)) return styles.radius(id)[name];
	if (name === "border-radius") return serializeRadiusStyle(styles.radius(id));
	if (isCssListProperty(name)) return styles.list(id)[name];
	if (name === "list-style") return serializeListStyle(styles.list(id));
	if (isCssTableProperty(name)) return styles.table(id)[name];
	if (isCssGridProperty(name)) return styles.grid(id)[name];
	const grid = gridShorthandComponents(name);
	if (grid)
		return serializeGridShorthand(
			name,
			grid.map((property) => styles.grid(id)[property]),
		);
	if (isCssFlexProperty(name)) return styles.flex(id)[name];
	const flex = flexShorthandComponents(name);
	if (flex)
		return serializeFlexShorthand(
			name,
			flex.map((property) => styles.flex(id)[property]),
		);
	if (isCssFlowProperty(name)) return styles.flow(id)[name];
	if (name === "overflow") {
		const flow = styles.flow(id);
		return serializeOverflow(flow["overflow-x"], flow["overflow-y"]);
	}
	if (name.startsWith("--")) return styles.custom(id, name);
	if (name === "display" || name === "visibility") return styles.get(id)[name];
	if (isCssBoxProperty(name)) {
		const computed = styles.box(id)[name];
		if (name.startsWith("border-") && name.endsWith("-width")) {
			const line =
				styles.box(id)[
					name.replace(/width$/, "style") as keyof ReturnType<typeof styles.box>
				];
			return line === "none" || line === "hidden" ? "0px" : computed;
		}
		const visibility = styles.get(id);
		if (!visibility.displayed || visibility.display === "contents")
			return computed;
		if (
			name === "width" ||
			name === "height" ||
			(["top", "right", "bottom", "left"].includes(name) &&
				["relative", "absolute", "fixed"].includes(styles.flow(id).position)) ||
			name.startsWith("margin-") ||
			name.startsWith("padding-")
		) {
			const used = documentGeometry(tree).getUsedStyle(id)?.[name];
			if (used !== undefined) return `${used}px`;
		}
		return computed;
	}
	if (isCssTextProperty(name)) {
		const text = styles.text(id);
		const value = text[name];
		return name === "line-height" && value !== "normal" && !value.endsWith("px")
			? `${Number(value) * Number.parseFloat(text["font-size"])}px`
			: value;
	}
	if (
		(["fill", "fill-opacity", "fill-rule", "stroke"].includes(name) ||
			name.startsWith("stroke-")) &&
		styles.paint(id).svgPaintError
	)
		throw new AgentBrowserError(
			"unsupported",
			"Unsupported SVG paint presentation attribute",
		);
	if (name === "clip-path" || name === "clip-rule") {
		const clip = styles.clip(id);
		if (clip.svgClipError)
			throw new AgentBrowserError(
				"unsupported",
				"Unsupported SVG clip presentation attribute",
			);
		if (name === "clip-rule") return clip["clip-rule"] ?? "nonzero";
		const reference = clip["clip-path"];
		return reference == null ? "none" : `url("#${reference}")`;
	}
	if (
		name === "stop-opacity" ||
		name === "fill-opacity" ||
		name === "stroke-opacity"
	)
		return String(styles.paint(id)[name] ?? 1);
	if (name === "fill-rule") return styles.paint(id)["fill-rule"] ?? "nonzero";
	if (name === "stroke-width") return styles.paint(id)[name] ?? "1px";
	if (name === "stroke-linecap") return styles.paint(id)[name] ?? "butt";
	if (name === "stroke-linejoin") return styles.paint(id)[name] ?? "miter";
	if (name === "stroke-miterlimit") return String(styles.paint(id)[name] ?? 4);
	if (name === "fill" || name === "stroke") {
		const paint = styles.paint(id);
		return serializeSvgFill(
			paint[name] === undefined
				? name === "fill"
					? [0, 0, 0, 255]
					: null
				: paint[name],
			paint.color,
		);
	}
	if (
		name === "color" ||
		name === "caret-color" ||
		name === "accent-color" ||
		name === "background-color" ||
		name === "stop-color" ||
		borderColorProperties.includes(name as BorderColorProperty)
	) {
		const style = styles.paint(id);
		const accent = style["accent-color"];
		if (
			name === "accent-color" &&
			(accent === undefined || typeof accent === "string")
		)
			return accent ?? "auto";
		const color =
			name === "accent-color" &&
			accent !== undefined &&
			typeof accent !== "string"
				? accent
				: name === "color"
					? style.color
					: name === "stop-color"
						? style["stop-color"] === "currentcolor"
							? style.color
							: (style["stop-color"] ?? ([0, 0, 0, 255] as const))
						: name === "background-color"
							? paintBackground(style)
							: name === "caret-color"
								? paintCaret(style)
								: (style[name as BorderColorProperty] ?? style.color);
		return color[3] === 255
			? `rgb(${color[0]}, ${color[1]}, ${color[2]})`
			: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Number((color[3] / 255).toFixed(3))})`;
	}
	return "";
}

export class ComputedStyles {
	private objects = 0;
	private closed = false;
	private readonly unregisterClose: () => unknown;
	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		private readonly maxObjects: number = computedStyleLimits.maxObjects,
	) {
		if (
			!Number.isInteger(maxObjects) ||
			maxObjects < 1 ||
			maxObjects > computedStyleLimits.maxObjects
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid computed style object limit",
			);
		this.unregisterClose = tree.onClose(() => this.close());
	}

	get(id: number, pseudo?: unknown): object {
		this.ensureOpen(id);
		if (this.tree.get(id).kind !== "element")
			throw new TypeError("Computed style requires an element");
		if (pseudo != null && scalar(pseudo).startsWith(":"))
			throw new AgentBrowserError(
				"unsupported",
				"Pseudo-element computed styles are not implemented",
			);
		if (this.objects >= this.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"Computed style object limit exceeded",
			);
		const read = (name: string) => {
			this.ensureOpen(id);
			return resolvedStyleValue(this.tree, id, name);
		};
		const readonly = () => {
			this.ensureOpen(id);
			throw new DOMException(
				"Computed styles are read-only",
				"NoModificationAllowedError",
			);
		};
		const names = () => {
			this.ensureOpen(id);
			return this.tree.isConnected(id)
				? [
						...computedStyleProperties,
						...documentStyles(this.tree).customNames(id),
					]
				: [];
		};
		const argument = (args: readonly unknown[], minimum = 1) => {
			this.ensureOpen(id);
			if (args.length < minimum)
				throw new TypeError("Missing CSS declaration argument");
			const name = scalar(args[0]);
			return name.startsWith("--")
				? name
				: name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
		};
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> = {
			cssText: {
				get: () => {
					this.ensureOpen(id);
					return "";
				},
				set: readonly,
			},
			parentRule: {
				get: () => {
					this.ensureOpen(id);
					return null;
				},
			},
		};
		for (const name of [
			...computedStyleProperties,
			...Object.keys(cssPropertyAliases),
			"margin",
			"padding",
			"margin-block",
			"padding-block",
			"background",
			"flex",
			"flex-flow",
			"gap",
			"overflow",
			"text-decoration",
			"border-radius",
		]) {
			const property = {
				get: () => read(canonicalCssProperty(name)),
				set: readonly,
			};
			for (const accessor of cssPropertyAccessors(name))
				properties[accessor] = property;
		}
		properties.cssFloat = { get: () => read("float"), set: readonly };
		const capability = this.factory.createHostObject({
			properties,
			indexed: {
				maxLength:
					computedStyleProperties.length + cssVariableLimits.maxProperties,
				length: () => names().length,
				get: (index) => names()[index],
			},
			methods: {
				getPropertyValue: (...args) => read(argument(args)),
				getPropertyPriority: (...args) => {
					argument(args);
					return "";
				},
				setProperty: (...args) => {
					argument(args, 2);
					readonly();
				},
				removeProperty: (...args) => {
					argument(args);
					readonly();
				},
				item: (...args) => {
					argument(args);
					if (typeof args[0] === "bigint")
						throw new TypeError("Invalid CSS index");
					const numeric = Number(args[0]);
					const index = Number.isFinite(numeric)
						? ((Math.trunc(numeric) % 4_294_967_296) + 4_294_967_296) %
							4_294_967_296
						: 0;
					return names()[index] ?? "";
				},
			},
		});
		this.objects++;
		return capability;
	}

	metrics() {
		return Object.freeze({
			objects: this.objects,
			maxObjects: this.maxObjects,
			closed: this.closed,
		});
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.unregisterClose();
	}
	private ensureOpen(id: number) {
		if (this.closed)
			throw new AgentBrowserError("closed", "Computed styles are closed");
		this.tree.get(id);
	}
}
