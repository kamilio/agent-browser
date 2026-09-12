import type { DocumentNode, DocumentTree } from "./document.js";
import { elementNamespace, svgNamespace } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { Rgba } from "./raster.js";
import type { DocumentStyles } from "./styles.js";
import {
	multiplySvgMatrices,
	parseSvgTransform,
	svgIdentity,
} from "./svg-affine.js";
import {
	SvgLinearGradient,
	type SvgGradientStop,
} from "./svg-linear-gradient.js";
import type { SvgBounds, SvgMatrix } from "./svg-scene-types.js";

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `SVG gradient paint: ${message}`);
}

export function svgGradientPaint(
	tree: DocumentTree,
	id: number,
	styles: DocumentStyles,
	viewport: SvgBounds | null,
	bounds: SvgBounds | null,
	charge: (amount: number) => void,
): SvgLinearGradient | null {
	charge(1);
	const gradient = tree.get(id);
	if (
		gradient.kind !== "element" ||
		gradient.tagName !== "linearGradient" ||
		elementNamespace(gradient) !== svgNamespace
	)
		unsupported("paint reference must identify a linearGradient");
	function attribute(
		node: Readonly<DocumentNode>,
		name: string,
	): string | undefined {
		charge(1);
		const value = node.attributes[name];
		if (value === undefined) return undefined;
		if (value.length > 4096)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG gradient attribute limit exceeded",
			);
		charge(value.length + 1);
		return value.trim();
	}
	if (
		attribute(gradient, "href") !== undefined ||
		attribute(gradient, "xlink:href") !== undefined
	)
		unsupported("gradient templates are not implemented");
	const units = attribute(gradient, "gradientUnits") ?? "objectBoundingBox";
	if (units !== "userSpaceOnUse" && units !== "objectBoundingBox")
		unsupported("unsupported gradient units");
	let implicit: SvgMatrix = svgIdentity;
	if (units === "objectBoundingBox") {
		if (!bounds || bounds.width === 0 || bounds.height === 0) return null;
		implicit = [bounds.width, 0, 0, bounds.height, bounds.x, bounds.y];
	}
	function scalar(value: string, dimension: number | undefined): number {
		const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|px)?$/i.exec(
			value,
		);
		if (!match) unsupported("unsupported gradient coordinate");
		if (match[2] === "px" && units === "objectBoundingBox")
			unsupported("absolute object-box coordinate");
		const amount = Number(match[1]);
		if (!Number.isFinite(amount)) unsupported("nonfinite gradient coordinate");
		if (match[2] === "%" && dimension === undefined)
			unsupported("percentage coordinate requires a viewport");
		const result = match[2] === "%" ? (amount / 100) * dimension! : amount;
		if (!Number.isFinite(result) || Math.abs(result) > 1e9)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG gradient coordinate limit exceeded",
			);
		return result;
	}
	const width = units === "objectBoundingBox" ? 1 : viewport?.width;
	const height = units === "objectBoundingBox" ? 1 : viewport?.height;
	const x1 = scalar(attribute(gradient, "x1") ?? "0%", width);
	const y1 = scalar(attribute(gradient, "y1") ?? "0%", height);
	const x2 = scalar(attribute(gradient, "x2") ?? "100%", width);
	const y2 = scalar(attribute(gradient, "y2") ?? "0%", height);
	const spreadMethod = attribute(gradient, "spreadMethod") ?? "pad";
	if (
		spreadMethod !== "pad" &&
		spreadMethod !== "repeat" &&
		spreadMethod !== "reflect"
	)
		unsupported("unsupported gradient spread");
	let interpolation = "sRGB";
	let ancestor: number | null = id;
	let ancestry = 0;
	while (ancestor !== null) {
		if (++ancestry > 65)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG gradient ancestry limit exceeded",
			);
		const node = tree.get(ancestor);
		const value = attribute(node, "color-interpolation");
		if (value !== undefined && value !== "inherit" && value !== "unset") {
			interpolation =
				value === "initial" || value === "revert" ? "sRGB" : value;
			break;
		}
		ancestor = node.parent;
	}
	if (interpolation !== "sRGB" && interpolation !== "auto")
		unsupported("only sRGB gradient interpolation is implemented");
	const stops: SvgGradientStop[] = [];
	let previous = 0;
	for (const childId of gradient.children) {
		charge(1);
		const child = tree.get(childId);
		if (child.kind === "comment") continue;
		if (child.kind === "text") {
			charge(child.data.length + 1);
			if (/^[\t\n\r ]*$/.test(child.data)) continue;
		}
		if (child.kind !== "element" || elementNamespace(child) !== svgNamespace)
			unsupported("unsupported gradient child");
		if (child.tagName === "title" || child.tagName === "desc") continue;
		if (child.tagName !== "stop") unsupported("unsupported gradient child");
		if (stops.length >= 256)
			throw new AgentBrowserError(
				"resource-limit",
				"SVG gradient stop limit exceeded",
			);
		for (const stopChildId of child.children) {
			charge(1);
			const stopChild = tree.get(stopChildId);
			if (stopChild.kind === "comment") continue;
			if (stopChild.kind === "text") {
				charge(stopChild.data.length + 1);
				if (/^[\t\n\r ]*$/.test(stopChild.data)) continue;
			}
			if (
				stopChild.kind === "element" &&
				elementNamespace(stopChild) === svgNamespace &&
				["title", "desc"].includes(stopChild.tagName)
			)
				continue;
			unsupported("unsupported stop child");
		}
		const offsetText = attribute(child, "offset") ?? "0";
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i.test(offsetText))
			unsupported("unsupported stop offset");
		const amount = Number(
			offsetText.endsWith("%") ? offsetText.slice(0, -1) : offsetText,
		);
		if (!Number.isFinite(amount)) unsupported("nonfinite stop offset");
		const offset = Math.max(
			previous,
			Math.min(
				1,
				Math.max(0, offsetText.endsWith("%") ? amount / 100 : amount),
			),
		);
		previous = offset;
		charge(8);
		const paint = styles.paint(childId);
		const stopColor = paint["stop-color"];
		const color: Rgba =
			stopColor === "currentcolor"
				? paint.color
				: (stopColor ?? [0, 0, 0, 255]);
		stops.push({
			offset,
			color: [
				color[0],
				color[1],
				color[2],
				Math.round(color[3] * (paint["stop-opacity"] ?? 1)),
			],
		});
	}
	if (!stops.length) return null;
	const transform = multiplySvgMatrices(
		implicit,
		parseSvgTransform(attribute(gradient, "gradientTransform"), charge),
		charge,
	);
	return new SvgLinearGradient(
		{
			x1,
			y1,
			x2,
			y2,
			stops,
			transform,
			spreadMethod,
			colorInterpolation: "sRGB",
		},
		charge,
	);
}
