import { parseCssColor, type CssColor } from "./css-color.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import {
	elementNamespace,
	isHtmlElement,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { Rgba } from "./raster.js";
import { documentStyles } from "./styles.js";
import {
	multiplySvgMatrices,
	parseSvgTransform,
	svgIdentity,
} from "./svg-affine.js";
import { parseSvgPath } from "./svg-path.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";
import type { SvgMatrix, SvgScene, SvgSceneShape } from "./svg-scene-types.js";

const limits = Object.freeze({
	nodes: 4096,
	shapes: 512,
	segments: 16384,
	source: 262144,
	depth: 64,
	field: 4096,
});
const scalar = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/;
const metadata = new Set(["title", "desc", "defs", "style"]);
const shapes = new Set([
	"path",
	"rect",
	"circle",
	"ellipse",
	"polygon",
	"polyline",
	"line",
]);

function unsupported(message: string): never {
	throw new AgentBrowserError("unsupported", `SVG scene: ${message}`);
}

function resource(message: string): never {
	throw new AgentBrowserError("resource-limit", `SVG scene: ${message}`);
}

interface Presentation {
	fill: CssColor | null;
	fillRule: "nonzero" | "evenodd";
	fillOpacity: number;
}

export function documentSvgScene(
	tree: DocumentTree,
	id: number,
	charge: (amount: number) => void,
): SvgScene {
	let sourceCodeUnits = 0;
	let nodeCount = 0;
	let segmentCount = 0;
	charge(1);
	const root = tree.get(id);
	if (
		root.kind !== "element" ||
		root.tagName !== "svg" ||
		elementNamespace(root) !== svgNamespace
	)
		unsupported("root must be an SVG-namespace svg");
	charge(1);
	if (root.parent === null || !isHtmlElement(tree.get(root.parent)))
		unsupported("root must be embedded in HTML");

	function source(text: string): void {
		if (text.length > limits.source - sourceCodeUnits)
			resource("source code unit limit exceeded");
		charge(text.length + 1);
		sourceCodeUnits += text.length;
	}
	function preflight(node: Readonly<DocumentNode>, depth: number): void {
		if (++nodeCount > limits.nodes) resource("visited node limit exceeded");
		if (depth > limits.depth) resource("ancestry depth limit exceeded");
		charge(1);
		source(node.tagName);
		source(node.data);
		for (const name in node.attributes) {
			source(name);
			source(node.attributes[name]);
		}
		for (const child of node.children) {
			if (nodeCount >= limits.nodes) resource("visited node limit exceeded");
			charge(1);
			preflight(tree.get(child), depth + 1);
		}
	}
	preflight(root, 0);
	const styles = documentStyles(tree);
	function field(text: string): string {
		if (text.length > limits.field)
			resource("style or attribute field limit exceeded");
		charge(text.length + 1);
		return text.trim();
	}
	function attribute(
		node: Readonly<DocumentNode>,
		name: string,
	): string | undefined {
		charge(1);
		const value = node.attributes[name];
		return value === undefined ? undefined : field(value);
	}
	function bounded(value: number): number {
		if (!Number.isFinite(value) || Math.abs(value) > 1e9)
			resource("coordinate limit exceeded");
		return value === 0 ? 0 : value;
	}
	function numeric(value: string, nonnegative = false): number {
		if (!scalar.test(value)) unsupported("unsupported numeric geometry");
		const parsed = bounded(
			Number(value.endsWith("px") ? value.slice(0, -2) : value),
		);
		if (nonnegative && parsed < 0) unsupported("negative geometry dimension");
		return parsed;
	}
	function geometry(
		node: Readonly<DocumentNode>,
		name: string,
		nonnegative = false,
	): number {
		const value = attribute(node, name);
		return value === undefined ? 0 : numeric(value, nonnegative);
	}
	function numbers(text: string, maximum: number, viewBox = false): number[] {
		charge(text.length + 1);
		const numberToken = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
		const values: number[] = [];
		let position = 0;
		while (position < text.length) {
			while (position < text.length && /[\t\n\r ]/.test(text[position]))
				position++;
			if (position === text.length) break;
			if (values.length >= maximum) {
				if (viewBox) unsupported("invalid viewBox");
				resource("numeric list limit exceeded");
			}
			numberToken.lastIndex = position;
			const parsed = numberToken.exec(text);
			if (!parsed) unsupported("malformed number list");
			charge(parsed[0].length + 1);
			values.push(bounded(Number(parsed[0])));
			position = numberToken.lastIndex;
			const beforeSpace = position;
			while (position < text.length && /[\t\n\r ]/.test(text[position]))
				position++;
			if (text[position] === ",") {
				position++;
				while (position < text.length && /[\t\n\r ]/.test(text[position]))
					position++;
				if (position === text.length) unsupported("trailing number separator");
			} else if (position < text.length && position === beforeSpace)
				unsupported("missing number separator");
		}
		return values;
	}
	const viewBoxText = attribute(root, "viewBox");
	let viewBox: SvgScene["viewBox"] = null;
	if (viewBoxText !== undefined) {
		const values = numbers(viewBoxText, 4, true);
		if (values.length !== 4 || values[2] < 0 || values[3] < 0)
			unsupported("invalid viewBox");
		charge(4);
		viewBox = Object.freeze({
			x: values[0],
			y: values[1],
			width: values[2],
			height: values[3],
		});
	}
	const aspect = attribute(root, "preserveAspectRatio") ?? "xMidYMid meet";
	let alignX = 0.5;
	let alignY = 0.5;
	let mode: "meet" | "slice" | "none" = "meet";
	if (/^none(?:\s+(?:meet|slice))?$/.test(aspect)) mode = "none";
	else {
		const match = /^x(Min|Mid|Max)Y(Min|Mid|Max)(?:\s+(meet|slice))?$/.exec(
			aspect,
		);
		if (!match) unsupported("invalid preserveAspectRatio");
		alignX = match[1] === "Min" ? 0 : match[1] === "Max" ? 1 : 0.5;
		alignY = match[2] === "Min" ? 0 : match[2] === "Max" ? 1 : 0.5;
		mode = match[3] === "slice" ? "slice" : "meet";
	}
	charge(4);
	const preserveAspectRatio = Object.freeze({ alignX, alignY, mode });
	const output: SvgSceneShape[] = [];

	function opacity(value: string | undefined, inherited: number): number {
		if (value === undefined || value === "inherit" || value === "unset")
			return inherited;
		if (value === "initial") return 1;
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$/.test(value))
			unsupported("invalid opacity");
		const amount = Number(value.endsWith("%") ? value.slice(0, -1) : value);
		if (!Number.isFinite(amount)) unsupported("invalid opacity");
		return Math.max(
			0,
			Math.min(1, value.endsWith("%") ? amount / 100 : amount),
		);
	}
	function presentation(
		node: Readonly<DocumentNode>,
		parent: Presentation,
	): Presentation {
		const fillText = attribute(node, "fill");
		let fill = parent.fill;
		if (
			fillText !== undefined &&
			fillText !== "inherit" &&
			fillText !== "unset"
		) {
			const parsed =
				fillText === "none"
					? null
					: parseCssColor(fillText === "initial" ? "black" : fillText);
			if (parsed === undefined) unsupported("unsupported fill paint");
			fill = parsed;
		}
		const rule = attribute(node, "fill-rule");
		const fillRule =
			rule === undefined || rule === "inherit" || rule === "unset"
				? parent.fillRule
				: rule === "initial"
					? "nonzero"
					: rule;
		if (fillRule !== "nonzero" && fillRule !== "evenodd")
			unsupported("unsupported fill rule");
		const stroke = attribute(node, "stroke");
		if (
			stroke !== undefined &&
			!["none", "inherit", "unset", "initial"].includes(stroke)
		)
			unsupported("stroke painting is not implemented");
		for (const name of ["marker-start", "marker-mid", "marker-end"]) {
			const value = attribute(node, name);
			if (
				value !== undefined &&
				!["none", "inherit", "unset", "initial"].includes(value)
			)
				unsupported("marker painting is not implemented");
		}
		for (const name of ["filter", "mask", "clip-path", "vector-effect"]) {
			const value = attribute(node, name);
			if (value !== undefined && value !== "none")
				unsupported(`unsupported ${name}`);
		}
		charge(3);
		return {
			fill,
			fillRule,
			fillOpacity: opacity(attribute(node, "fill-opacity"), parent.fillOpacity),
		};
	}
	function path(node: Readonly<DocumentNode>): readonly SvgPathSegment[] {
		charge(1);
		const result: SvgPathSegment[] = [];
		let current: SvgPoint = Object.freeze({ x: 0, y: 0 });
		let start = current;
		function reserve(): void {
			if (segmentCount >= limits.segments)
				resource("aggregate path segment limit exceeded");
			charge(16);
			segmentCount++;
		}
		function point(across: number, down: number): SvgPoint {
			return Object.freeze({ x: bounded(across), y: bounded(down) });
		}
		function move(across: number, down: number): void {
			reserve();
			current = point(across, down);
			start = current;
			result.push(Object.freeze({ kind: "move", end: current }));
		}
		function line(across: number, down: number): void {
			reserve();
			const end = point(across, down);
			result.push(Object.freeze({ kind: "line", start: current, end }));
			current = end;
		}
		function arc(
			across: number,
			down: number,
			radiusX: number,
			radiusY: number,
		): void {
			reserve();
			const end = point(across, down);
			result.push(
				Object.freeze({
					kind: "arc",
					start: current,
					end,
					radiusX,
					radiusY,
					rotation: 0,
					largeArc: false,
					sweep: true,
				}),
			);
			current = end;
		}
		function close(): void {
			reserve();
			result.push(Object.freeze({ kind: "close", start: current, end: start }));
			current = start;
		}
		if (node.tagName === "path") {
			const text = node.attributes.d ?? "";
			charge(text.length + 1);
			if (!text.trim()) return Object.freeze(result);
			if (segmentCount === limits.segments)
				resource("aggregate path segment limit exceeded");
			let parsed: readonly SvgPathSegment[];
			let ownerError: unknown;
			let ownerFailed = false;
			try {
				parsed = parseSvgPath(
					text,
					(amount) => {
						try {
							charge(amount);
						} catch (error) {
							ownerFailed = true;
							ownerError = error;
							throw error;
						}
					},
					{ maxSegments: limits.segments - segmentCount },
				);
			} catch (error) {
				if (ownerFailed) throw ownerError;
				if (error instanceof SyntaxError) unsupported(error.message);
				if (error instanceof RangeError) resource(error.message);
				throw error;
			}
			segmentCount += parsed.length;
			return parsed;
		}
		if (node.tagName === "polygon" || node.tagName === "polyline") {
			const coordinates = numbers(
				node.attributes.points ?? "",
				2 * (limits.segments - segmentCount),
			);
			if (coordinates.length % 2) unsupported("odd points coordinate count");
			if (coordinates.length) {
				move(coordinates[0], coordinates[1]);
				for (let index = 2; index < coordinates.length; index += 2)
					line(coordinates[index], coordinates[index + 1]);
				if (node.tagName === "polygon") close();
			}
		} else if (node.tagName === "line") {
			move(geometry(node, "x1"), geometry(node, "y1"));
			line(geometry(node, "x2"), geometry(node, "y2"));
		} else if (node.tagName === "circle" || node.tagName === "ellipse") {
			const across = geometry(node, "cx");
			const down = geometry(node, "cy");
			const radiusX = geometry(
				node,
				node.tagName === "circle" ? "r" : "rx",
				true,
			);
			const radiusY =
				node.tagName === "circle" ? radiusX : geometry(node, "ry", true);
			if (radiusX && radiusY) {
				move(across + radiusX, down);
				arc(across - radiusX, down, radiusX, radiusY);
				arc(across + radiusX, down, radiusX, radiusY);
				close();
			}
		} else if (node.tagName === "rect") {
			const across = geometry(node, "x");
			const down = geometry(node, "y");
			for (const name of ["width", "height"]) {
				const value = attribute(node, name);
				if (value !== undefined && value !== "auto") numeric(value, true);
			}
			charge(2);
			const box = styles.box(node.id);
			const widthText = field(box.width);
			const heightText = field(box.height);
			const width = widthText === "auto" ? 0 : numeric(widthText, true);
			const height = heightText === "auto" ? 0 : numeric(heightText, true);
			const radiusXText = attribute(node, "rx");
			const radiusYText = attribute(node, "ry");
			const radiusX = Math.min(
				numeric(radiusXText ?? radiusYText ?? "0", true),
				width / 2,
			);
			const radiusY = Math.min(
				numeric(radiusYText ?? radiusXText ?? "0", true),
				height / 2,
			);
			if (width && height) {
				if (radiusX && radiusY) {
					move(across + radiusX, down);
					line(across + width - radiusX, down);
					arc(across + width, down + radiusY, radiusX, radiusY);
					line(across + width, down + height - radiusY);
					arc(across + width - radiusX, down + height, radiusX, radiusY);
					line(across + radiusX, down + height);
					arc(across, down + height - radiusY, radiusX, radiusY);
					line(across, down + radiusY);
					arc(across + radiusX, down, radiusX, radiusY);
				} else {
					move(across, down);
					line(across + width, down);
					line(across + width, down + height);
					line(across, down + height);
				}
				close();
			}
		}
		return Object.freeze(result);
	}
	function visit(
		node: Readonly<DocumentNode>,
		inherited: Presentation,
		transform: SvgMatrix,
		ancestors: readonly string[],
	): void {
		charge(1);
		if (node.kind === "comment") return;
		if (node.kind === "text") {
			charge(node.data.length + 1);
			if (node.data.trim()) unsupported("text rendering is not implemented");
			return;
		}
		if (node.kind !== "element") unsupported("unsupported node kind");
		if (elementNamespace(node) !== svgNamespace)
			unsupported("non-SVG descendant");
		if (metadata.has(node.tagName)) return;
		charge(1);
		const visibility = styles.get(node.id);
		if (!visibility.displayed) return;
		if (node.id !== id && node.tagName !== "g" && !shapes.has(node.tagName))
			unsupported(`unsupported element ${node.tagName}`);
		const container = node.id === id || node.tagName === "g";
		const paint = presentation(node, inherited);
		const alpha = opacity(attribute(node, "opacity"), 1);
		if (container && alpha !== 1)
			unsupported("group opacity requires compositing");
		const transformText = attribute(node, "transform");
		if (node.id === id && transformText)
			unsupported("root transform is not implemented");
		const originText = attribute(node, "transform-origin");
		if (transformText && originText !== undefined) {
			charge(originText.length + 1);
			const coordinates = originText.split(/\s+/);
			const zero = /^[+-]?(?:0+(?:\.0*)?|\.0+)(?:px|%)?$/;
			if (
				coordinates.length !== 2 ||
				!(
					((coordinates[0] === "left" || zero.test(coordinates[0])) &&
						(coordinates[1] === "top" || zero.test(coordinates[1]))) ||
					(coordinates[0] === "top" && coordinates[1] === "left")
				)
			)
				unsupported("nondefault transform-origin is not implemented");
		}
		const matrix =
			node.id === id
				? transform
				: multiplySvgMatrices(
						transform,
						parseSvgTransform(transformText, charge),
						charge,
					);
		charge(1);
		const ref = tree.reference(node.id);
		let childAncestors = ancestors;
		if (container) {
			if (node.id !== id) {
				charge(ancestors.length + 1);
				childAncestors = Object.freeze(ancestors.concat(ref));
			}
		} else {
			if (output.length >= limits.shapes) resource("shape limit exceeded");
			const segments = path(node);
			charge(4);
			const color =
				paint.fill === "currentcolor"
					? styles.paint(node.id).color
					: paint.fill;
			const fill: Rgba | null =
				color === null
					? null
					: Object.freeze([
							color[0],
							color[1],
							color[2],
							Math.round(color[3] * paint.fillOpacity * alpha),
						]);
			charge(10);
			output.push(
				Object.freeze({
					id: node.id,
					ref,
					ancestors,
					path: segments,
					transform: matrix,
					fill,
					fillRule: paint.fillRule,
					visible: visibility.visible,
					pointerEvents: styles.pointerEvents(node.id) !== "none",
				}),
			);
		}
		for (const child of node.children) {
			charge(1);
			const childNode = tree.get(child);
			if (
				!container &&
				childNode.kind === "element" &&
				!metadata.has(childNode.tagName)
			)
				unsupported("graphics nested inside a shape");
			visit(childNode, paint, matrix, childAncestors);
		}
	}
	charge(5);
	visit(
		root,
		{
			fill: Object.freeze([0, 0, 0, 255]),
			fillRule: "nonzero",
			fillOpacity: 1,
		},
		svgIdentity,
		Object.freeze([]),
	);
	charge(8);
	return Object.freeze({
		rootRef: tree.reference(id),
		viewBox,
		preserveAspectRatio,
		shapes: Object.freeze(output),
		disabled: viewBox !== null && (viewBox.width === 0 || viewBox.height === 0),
		sourceCodeUnits,
	});
}
