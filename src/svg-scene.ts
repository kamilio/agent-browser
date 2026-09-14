import { cssNamedColors } from "./css-color.js";
import type { SvgFill } from "./svg-paint-value.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import {
	elementNamespace,
	isHtmlElement,
	svgNamespace,
} from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type { Rgba } from "./raster.js";
import { documentStyles, type DocumentStyles } from "./styles.js";
import {
	multiplySvgMatrices,
	parseSvgTransform,
	svgIdentity,
} from "./svg-affine.js";
import { parseSvgPath } from "./svg-path.js";
import { svgGradientPaint } from "./svg-gradient-paint.js";
import { SvgLinearGradient } from "./svg-linear-gradient.js";
import { svgPathBounds } from "./svg-path-bounds.js";
import type { SvgPathSegment, SvgPoint } from "./svg-path-types.js";
import type {
	SvgMatrix,
	SvgScene,
	SvgSceneShape,
	SvgSceneStroke,
	SvgSceneClip,
	SvgSceneClipShape,
	SvgBounds,
} from "./svg-scene-types.js";

const limits = Object.freeze({
	nodes: 4096,
	shapes: 512,
	segments: 16384,
	source: 262144,
	depth: 64,
	field: 4096,
});
const scalar = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/;
const metadata = new Set([
	"title",
	"desc",
	"defs",
	"style",
	"linearGradient",
	"radialGradient",
	"stop",
	"clipPath",
]);
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
	clipPath: string | null;
	opacity: number;
	fill: SvgFill;
	fillRule: "nonzero" | "evenodd";
	fillOpacity: number;
	stroke: SvgFill;
	strokeOpacity: number;
	strokeWidth: string;
	lineCap: "butt" | "round" | "square";
	lineJoin: "miter" | "round" | "bevel";
	miterLimit: number;
}

export function documentSvgScene(
	tree: DocumentTree,
	id: number,
	charge: (amount: number) => void,
	options: { readonly outerOpacityHandled?: boolean } = {},
): SvgScene {
	return buildSvgScene(
		tree,
		id,
		charge,
		"inline",
		undefined,
		options.outerOpacityHandled,
	);
}

export function imageSvgScene(
	tree: DocumentTree,
	id: number,
	charge: (amount: number) => void,
	styleOwner?: DocumentStyles,
): SvgScene {
	const root = tree.get(id);
	charge(1);
	if (
		root.kind !== "element" ||
		root.tagName !== "svg" ||
		elementNamespace(root) !== svgNamespace
	)
		unsupported("root must be an SVG-namespace svg");
	if (root.parent !== tree.root)
		unsupported("image root must be a document child");
	for (const childId of tree.get(tree.root).children) {
		charge(1);
		if (childId === id) continue;
		const child = tree.get(childId);
		if (child.kind === "comment") continue;
		if (child.kind === "text") {
			charge(child.data.length + 1);
			if (/^[\t\n\r ]*$/.test(child.data)) continue;
		}
		unsupported("image document must contain exactly one SVG root");
	}
	const styles = styleOwner ?? documentStyles(tree);
	const metrics = styles.metrics();
	if (Object.keys(metrics.issues).length)
		unsupported("image styles require an issue-free supported profile");
	return buildSvgScene(tree, id, charge, "image", styles);
}

function buildSvgScene(
	tree: DocumentTree,
	id: number,
	charge: (amount: number) => void,
	context: "inline" | "image",
	styleOwner?: DocumentStyles,
	outerOpacityHandled = false,
): SvgScene {
	let sourceCodeUnits = 0;
	let nodeCount = 0;
	let segmentCount = 0;
	const references = new Map<string, number>();
	const preflighted = new Set<number>();
	let clipReferences: Map<string, number> | undefined;
	charge(1);
	const root = tree.get(id);
	if (
		root.kind !== "element" ||
		root.tagName !== "svg" ||
		elementNamespace(root) !== svgNamespace
	)
		unsupported("root must be an SVG-namespace svg");
	charge(1);
	if (
		context === "inline" &&
		(root.parent === null || !isHtmlElement(tree.get(root.parent)))
	)
		unsupported("root must be embedded in HTML");

	function source(text: string): void {
		if (text.length > limits.source - sourceCodeUnits)
			resource("source code unit limit exceeded");
		charge(text.length + 1);
		sourceCodeUnits += text.length;
	}
	function preflight(node: Readonly<DocumentNode>, depth: number): void {
		if (depth > limits.depth) resource("ancestry depth limit exceeded");
		if (preflighted.has(node.id)) return;
		if (++nodeCount > limits.nodes) resource("visited node limit exceeded");
		preflighted.add(node.id);
		charge(1);
		source(node.tagName);
		source(node.data);
		for (const name in node.attributes) {
			source(name);
			source(node.attributes[name]);
		}
		if (
			node.kind === "element" &&
			node.attributes.id !== undefined &&
			!references.has(node.attributes.id)
		)
			references.set(node.attributes.id, node.id);
		for (const child of node.children) {
			if (nodeCount >= limits.nodes) resource("visited node limit exceeded");
			charge(1);
			preflight(tree.get(child), depth + 1);
		}
	}
	preflight(root, 0);
	const styles = styleOwner ?? documentStyles(tree);
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
	interface ClipRequest {
		target: number;
		transform: SvgMatrix;
		start: number;
		end: number;
	}
	const pendingClips = new Map<number, readonly ClipRequest[]>();
	const clipDefinitions = new Map<
		number,
		Readonly<{ units: string; shapes: readonly SvgSceneClipShape[] }>
	>();
	const resolvedClips = new Map<ClipRequest, SvgSceneClip>();
	let clipShapeCount = 0;
	let clipInstanceCount = 0;
	function indexClipReferences(): Map<string, number> {
		if (clipReferences) return clipReferences;
		const indexed = new Map<string, number>();
		let visited = 0;
		function visit(node: Readonly<DocumentNode>, depth: number): void {
			charge(1);
			if (++visited > limits.nodes)
				resource("clip reference node limit exceeded");
			if (depth > limits.depth) resource("clip reference depth limit exceeded");
			const identifier = node.attributes.id;
			if (node.kind === "element" && identifier !== undefined) {
				if (!preflighted.has(node.id)) source(identifier);
				else charge(identifier.length + 1);
				if (!indexed.has(identifier)) indexed.set(identifier, node.id);
			}
			for (const child of node.children) visit(tree.get(child), depth + 1);
		}
		visit(tree.get(tree.root), 0);
		clipReferences = indexed;
		return indexed;
	}
	function clipTarget(reference: string | null): number | undefined {
		if (reference === null) return undefined;
		charge(reference.length + 2);
		let fragment: string;
		try {
			fragment = decodeURIComponent(reference);
		} catch {
			return undefined;
		}
		const target = indexClipReferences().get(fragment);
		if (target === undefined) return undefined;
		const node = tree.get(target);
		return node.kind === "element" &&
			elementNamespace(node) === svgNamespace &&
			node.tagName === "clipPath"
			? target
			: undefined;
	}
	function elementMatrix(
		node: Readonly<DocumentNode>,
		parent: SvgMatrix,
		root = false,
	): SvgMatrix {
		const text = attribute(node, "transform");
		if (root && text) unsupported("root transform is not implemented");
		const origin = attribute(node, "transform-origin");
		if (text && origin !== undefined) {
			charge(origin.length + 1);
			const coordinates = origin.split(/\s+/);
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
		return root
			? parent
			: multiplySvgMatrices(parent, parseSvgTransform(text, charge), charge);
	}

	function validateOpacity(value: string | undefined): void {
		if (
			value === undefined ||
			["inherit", "unset", "initial", "revert"].includes(value)
		)
			return;
		if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$/.test(value))
			unsupported("invalid opacity");
		const amount = Number(value.endsWith("%") ? value.slice(0, -1) : value);
		if (!Number.isFinite(amount)) unsupported("invalid opacity");
	}
	function presentation(node: Readonly<DocumentNode>): Presentation {
		const computed = styles.paint(node.id);
		if (computed.svgPaintError || computed.svgClipError)
			unsupported("unsupported paint presentation attribute");
		function resolve(fill: SvgFill): SvgFill {
			if (fill !== null && typeof fill === "object" && "reference" in fill) {
				const targetId = references.get(fill.reference);
				const target = targetId === undefined ? undefined : tree.get(targetId);
				charge(2);
				if (
					!target ||
					target.kind !== "element" ||
					elementNamespace(target) !== svgNamespace ||
					!["linearGradient", "radialGradient", "pattern"].includes(
						target.tagName,
					)
				)
					fill = fill.fallback === undefined ? null : fill.fallback;
			}
			return fill;
		}
		for (const [name, neutral] of [
			["stroke-dasharray", "none"],
			["stroke-dashoffset", "0"],
			["paint-order", "normal"],
		] as const) {
			const value = attribute(node, name);
			if (value !== undefined && value !== neutral)
				unsupported(`unsupported ${name}`);
		}
		for (const name of ["marker-start", "marker-mid", "marker-end"]) {
			const value = attribute(node, name);
			if (
				value !== undefined &&
				!["none", "inherit", "unset", "initial"].includes(value)
			)
				unsupported("marker painting is not implemented");
		}
		for (const name of ["filter", "mask", "vector-effect"]) {
			const value = attribute(node, name);
			if (value !== undefined && value !== "none")
				unsupported(`unsupported ${name}`);
		}
		charge(3);
		return {
			clipPath: computed["clip-path"] ?? null,
			opacity: computed.opacity ?? 1,
			fill: resolve(
				computed.fill === undefined ? cssNamedColors.black : computed.fill,
			),
			fillRule: computed["fill-rule"] ?? "nonzero",
			fillOpacity: computed["fill-opacity"] ?? 1,
			stroke: resolve(computed.stroke ?? null),
			strokeOpacity: computed["stroke-opacity"] ?? 1,
			strokeWidth: computed["stroke-width"] ?? "1px",
			lineCap: computed["stroke-linecap"] ?? "butt",
			lineJoin: computed["stroke-linejoin"] ?? "miter",
			miterLimit: computed["stroke-miterlimit"] ?? 4,
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
	function clipDefinition(target: number) {
		const cached = clipDefinitions.get(target);
		if (cached) return cached;
		const definition = tree.get(target);
		preflight(definition, 0);
		const rootPaint = styles.clip(target);
		if (rootPaint.svgClipError)
			unsupported("unsupported clip presentation attribute");
		if (clipTarget(rootPaint["clip-path"] ?? null) !== undefined)
			unsupported("nested clip definitions are not implemented");
		const units = attribute(definition, "clipPathUnits") ?? "userSpaceOnUse";
		if (units !== "userSpaceOnUse" && units !== "objectBoundingBox")
			unsupported("unsupported clipPathUnits");
		const transform = elementMatrix(definition, svgIdentity);
		const content: SvgSceneClipShape[] = [];
		for (const childId of definition.children) {
			charge(1);
			const child = tree.get(childId);
			if (child.kind === "comment") continue;
			if (child.kind === "text") {
				charge(child.data.length + 1);
				if (child.data.trim())
					unsupported("text clip geometry is not implemented");
				continue;
			}
			if (child.kind !== "element") unsupported("unsupported clip node kind");
			const visibility = styles.get(childId);
			if (visibility.display === "none" || visibility.visibility !== "visible")
				continue;
			if (elementNamespace(child) !== svgNamespace)
				unsupported("non-SVG clip geometry");
			if (["title", "desc"].includes(child.tagName)) continue;
			if (!shapes.has(child.tagName))
				unsupported(`unsupported clip element ${child.tagName}`);
			const paint = styles.clip(childId);
			if (paint.svgClipError)
				unsupported("unsupported clip presentation attribute");
			if (clipTarget(paint["clip-path"] ?? null) !== undefined)
				unsupported("nested clipping of clip geometry is not implemented");
			for (const grandchildId of child.children) {
				charge(1);
				const grandchild = tree.get(grandchildId);
				if (
					grandchild.kind === "element" &&
					!["title", "desc"].includes(grandchild.tagName)
				)
					unsupported("graphics nested inside clip geometry");
				if (grandchild.kind === "text") {
					charge(grandchild.data.length + 1);
					if (grandchild.data.trim())
						unsupported("text nested inside clip geometry");
				}
			}
			if (++clipShapeCount > limits.shapes)
				resource("clip shape limit exceeded");
			content.push(
				Object.freeze({
					path: path(child),
					transform: elementMatrix(child, transform),
					fillRule: paint["clip-rule"] ?? "nonzero",
				}),
			);
		}
		const result = Object.freeze({ units, shapes: Object.freeze(content) });
		clipDefinitions.set(target, result);
		return result;
	}
	function objectBounds(request: ClipRequest): SvgBounds {
		charge(24);
		const matrix = request.transform;
		const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
		if (!Number.isFinite(determinant))
			resource("clip bounding transform overflow");
		if (determinant === 0)
			unsupported("degenerate objectBoundingBox clipping is not implemented");
		const inverse: SvgMatrix = Object.freeze([
			bounded(matrix[3] / determinant),
			bounded(-matrix[1] / determinant),
			bounded(-matrix[2] / determinant),
			bounded(matrix[0] / determinant),
			bounded((matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant),
			bounded((matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant),
		]);
		let left = Infinity,
			top = Infinity,
			right = -Infinity,
			bottom = -Infinity;
		for (let index = request.start; index < request.end; index++) {
			charge(4);
			const shape = output[index];
			const bounds = svgPathBounds(
				shape.path,
				multiplySvgMatrices(inverse, shape.transform, charge),
				charge,
			);
			if (!bounds) continue;
			left = Math.min(left, bounds.x);
			top = Math.min(top, bounds.y);
			right = Math.max(right, bounds.x + bounds.width);
			bottom = Math.max(bottom, bounds.y + bounds.height);
		}
		if (!Number.isFinite(left) || right <= left || bottom <= top)
			unsupported("degenerate objectBoundingBox clipping is not implemented");
		return Object.freeze({
			x: bounded(left),
			y: bounded(top),
			width: bounded(right - left),
			height: bounded(bottom - top),
		});
	}
	function resolveClip(request: ClipRequest): SvgSceneClip {
		const cached = resolvedClips.get(request);
		if (cached) return cached;
		const definition = clipDefinition(request.target);
		let transform = request.transform;
		if (definition.units === "objectBoundingBox" && definition.shapes.length) {
			const bounds = objectBounds(request);
			transform = multiplySvgMatrices(
				transform,
				[bounds.width, 0, 0, bounds.height, bounds.x, bounds.y],
				charge,
			);
		}
		const content: SvgSceneClipShape[] = [];
		for (const shape of definition.shapes) {
			charge(3);
			if (++clipInstanceCount > limits.shapes)
				resource("clip instance shape limit exceeded");
			content.push(
				Object.freeze({
					...shape,
					transform: multiplySvgMatrices(transform, shape.transform, charge),
				}),
			);
		}
		const result = Object.freeze({ shapes: Object.freeze(content) });
		resolvedClips.set(request, result);
		return result;
	}
	function visit(
		node: Readonly<DocumentNode>,
		transform: SvgMatrix,
		ancestors: readonly string[],
		inheritedClips: readonly ClipRequest[],
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
		const paint = presentation(node);
		validateOpacity(attribute(node, "opacity"));
		const alpha = paint.opacity;
		if (
			container &&
			alpha !== 1 &&
			!(node.id === id && context === "inline" && outerOpacityHandled)
		)
			unsupported("group opacity requires compositing");
		const matrix = elementMatrix(node, transform, node.id === id);
		const target = clipTarget(paint.clipPath);
		let clips = inheritedClips;
		let request: ClipRequest | undefined;
		if (target !== undefined) {
			if (clips.length >= limits.depth)
				resource("clip ancestry limit exceeded");
			charge(clips.length + 5);
			request = {
				target,
				transform: matrix,
				start: output.length,
				end: output.length,
			};
			clips = Object.freeze(clips.concat(request));
		}
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
			const rootBox = styles.box(id);
			const absolute = (value: string) =>
				/^\d+(?:\.\d+)?(?:e[+-]?\d+)?px$/i.test(value)
					? Number.parseFloat(value)
					: undefined;
			const width = absolute(rootBox.width);
			const height = absolute(rootBox.height);
			const viewport =
				viewBox ??
				(width !== undefined && height !== undefined
					? { x: 0, y: 0, width, height }
					: null);
			function paintValue(
				value: SvgFill,
				opacity: number,
			): Rgba | SvgLinearGradient | null {
				const color =
					value === "currentcolor" ? styles.paint(node.id).color : value;
				if (
					color !== null &&
					typeof color === "object" &&
					"reference" in color
				) {
					const target = references.get(color.reference);
					if (target === undefined) unsupported("unresolved paint reference");
					return (
						svgGradientPaint(
							tree,
							target,
							styles,
							viewport,
							svgPathBounds(segments, svgIdentity, charge),
							charge,
						)?.withOpacity(opacity, charge) ?? null
					);
				} else
					return color === null
						? null
						: Object.freeze([
								color[0],
								color[1],
								color[2],
								Math.round(color[3] * opacity),
							]);
			}
			let stroke: SvgSceneStroke | undefined;
			if (paint.stroke !== null) {
				const strokeWidth = Number.parseFloat(paint.strokeWidth);
				if (!Number.isFinite(strokeWidth) || strokeWidth > 1e9)
					resource("stroke width magnitude limit exceeded");
				if (strokeWidth > 0) {
					const strokePaint = paintValue(paint.stroke, paint.strokeOpacity);
					if (strokePaint !== null)
						stroke = Object.freeze({
							paint: strokePaint,
							width: strokeWidth,
							...(paint.strokeWidth.endsWith("%")
								? { widthPercentage: true as const }
								: {}),
							lineCap: paint.lineCap,
							lineJoin: paint.lineJoin,
							miterLimit: paint.miterLimit,
						});
				}
			}
			const fill = paintValue(
				paint.fill,
				paint.fillOpacity * (stroke === undefined ? alpha : 1),
			);
			charge(10);
			if (clips.length) pendingClips.set(output.length, clips);
			output.push(
				Object.freeze({
					id: node.id,
					ref,
					ancestors,
					path: segments,
					transform: matrix,
					fill,
					...(stroke === undefined
						? {}
						: { stroke, ...(alpha === 1 ? {} : { opacity: alpha }) }),
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
			visit(childNode, matrix, childAncestors, clips);
		}
		if (request) request.end = output.length;
	}
	charge(5);
	visit(root, svgIdentity, Object.freeze([]), Object.freeze([]));
	const clipLists = new Map<readonly ClipRequest[], readonly SvgSceneClip[]>();
	for (const [index, requests] of pendingClips) {
		charge(2);
		let clips = clipLists.get(requests);
		if (!clips) {
			charge(requests.length + 1);
			clips = Object.freeze(requests.map(resolveClip));
			clipLists.set(requests, clips);
		}
		output[index] = Object.freeze({ ...output[index], clips });
	}
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
