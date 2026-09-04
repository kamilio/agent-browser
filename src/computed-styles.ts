import {
	initialBackgroundValues,
	isNeutralBackgroundProperty,
} from "./css-background.js";
import { cssBoxProperties, isCssBoxProperty } from "./css-box.js";
import { cssInteractionProperties } from "./css-interaction.js";
import { cssListProperties, isCssListProperty } from "./css-list.js";
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
import { cssPaintProperties, paintBackground } from "./css-paint.js";
import { cssTextProperties, isCssTextProperty } from "./css-text.js";
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
		...cssFlexProperties,
		...cssFlowProperties,
		...cssInteractionProperties,
		...cssListProperties,
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
	name: string,
): string {
	if (tree.get(id).kind !== "element")
		throw new TypeError("Computed style requires an element");
	if (!tree.isConnected(id)) return "";
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
	if (name === "pointer-events") return styles.pointerEvents(id);
	if (isCssListProperty(name)) return styles.list(id)[name];
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
				styles.flow(id).position === "relative") ||
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
		name === "color" ||
		name === "background-color" ||
		borderColorProperties.includes(name as BorderColorProperty)
	) {
		const style = styles.paint(id);
		const color =
			name === "color"
				? style.color
				: name === "background-color"
					? paintBackground(style)
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
			"margin",
			"padding",
			"background",
			"flex",
			"flex-flow",
			"gap",
			"overflow",
		]) {
			const property = { get: () => read(name), set: readonly };
			properties[name] = property;
			properties[
				name.replace(/-([a-z])/g, (_match, letter: string) =>
					letter.toUpperCase(),
				)
			] = property;
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
