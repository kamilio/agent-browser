import { type CanvasImageSource, paintCanvasImage } from "./canvas-image.js";
import { parseCssColor } from "./css-color.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import {
	type RasterImage,
	type Rgba,
	createRaster,
	paintRasterRect,
	rasterLimits,
} from "./raster.js";

export const canvasLimits = Object.freeze({
	maxContexts: 64,
	maxPixels: rasterLimits.maxPixels,
	maxSavedStates: 64,
});
type PaintState = { style: string; color: Rgba; alpha: number };
const initialState = (): PaintState => ({
	style: "#000000",
	color: [0, 0, 0, 255],
	alpha: 1,
});

// A runtime shares this counter with its child-document bindings. It retains
// no documents, contexts or pixel buffers.
export class CanvasBudget {
	private pixels = 0;
	private contexts = 0;
	reserve(pixels: number, contexts = 0): void {
		if (this.pixels + pixels > canvasLimits.maxPixels)
			throw new AgentBrowserError(
				"resource-limit",
				"Document canvas pixel limit exceeded",
			);
		if (this.contexts + contexts > canvasLimits.maxContexts)
			throw new AgentBrowserError(
				"resource-limit",
				"Canvas context limit exceeded",
			);
		this.pixels += pixels;
		this.contexts += contexts;
	}
	release(pixels: number, contexts = 0): void {
		this.pixels -= pixels;
		this.contexts -= contexts;
	}
}

export function canvasDimension(
	raw: string | undefined,
	fallback: number,
): number {
	const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(raw ?? "");
	const value = match === null ? Number.NaN : Number(match[1]);
	return value <= 2_147_483_647 ? value : fallback;
}

export function canvasIntrinsicSize(node: Readonly<DocumentNode>): {
	width: number;
	height: number;
} {
	if (!isHtmlElement(node, "canvas"))
		throw new TypeError("Expected an HTML canvas element");
	return {
		width: canvasDimension(node.attributes.width, 300),
		height: canvasDimension(node.attributes.height, 150),
	};
}

function numeric(value: unknown): number {
	if (
		(typeof value === "object" && value !== null) ||
		["function", "symbol", "bigint"].includes(typeof value)
	)
		throw new TypeError("Canvas coordinates require primitive numeric input");
	return Number(value);
}

export class NativeCanvas2D {
	private image?: Readonly<RasterImage>;
	private clean = true;
	private state = initialState();
	private readonly saved: PaintState[] = [];
	constructor(
		private readonly owner: DocumentCanvases,
		readonly id: number,
	) {}

	reset(): void {
		if (this.image) this.owner.release(this.image.width * this.image.height);
		this.image = undefined;
		this.clean = true;
		this.state = initialState();
		this.saved.length = 0;
	}
	bitmap(): Readonly<RasterImage> | undefined {
		this.owner.assertOpen();
		return this.image;
	}
	get originClean(): boolean {
		this.owner.assertOpen();
		return this.clean;
	}
	drawImage(source: CanvasImageSource, ...args: readonly unknown[]): void {
		this.owner.assertOpen();
		if (![2, 4, 8].includes(args.length))
			throw new TypeError("drawImage requires three, five or nine arguments");
		const values = args.map(numeric);
		if (!values.every(Number.isFinite)) return;
		if (source.width === 0 || source.height === 0)
			throw new DOMException("Image source has no pixels", "InvalidStateError");
		let sx = 0;
		let sy = 0;
		let sw = source.width;
		let sh = source.height;
		let [dx, dy, dw = source.width, dh = source.height] = values;
		if (values.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = values;
		if (sw === 0 || sh === 0 || dw === 0 || dh === 0) return;
		if (sw < 0) {
			sx += sw;
			sw = -sw;
		}
		if (sh < 0) {
			sy += sh;
			sh = -sh;
		}
		if (dw < 0) {
			dx += dw;
			dw = -dw;
		}
		if (dh < 0) {
			dy += dh;
			dh = -dh;
		}
		if (
			![sx, sy, dx, dy, sx + sw, sy + sh, dx + dw, dy + dh].every(
				Number.isFinite,
			)
		)
			return;
		// Taint survives clipping, transparent paint, clearing and state restoration.
		if (!source.originClean) this.clean = false;
		if (!source.image || this.state.alpha === 0) return;
		const image = this.surface();
		if (image)
			paintCanvasImage(
				image,
				source,
				[sx, sy, sw, sh, dx, dy, dw, dh],
				this.state.alpha,
			);
	}
	get fillStyle(): string {
		this.owner.assertOpen();
		return this.state.style;
	}
	set fillStyle(value: unknown) {
		this.owner.assertOpen();
		if (typeof value !== "string") return;
		const parsed = parseCssColor(value);
		if (parsed === undefined || parsed === "currentcolor") return;
		const hex = parsed
			.slice(0, 3)
			.map((c) => c.toString(16).padStart(2, "0"))
			.join("");
		this.state = {
			...this.state,
			color: parsed,
			style:
				parsed[3] === 255
					? `#${hex}`
					: `rgba(${parsed[0]}, ${parsed[1]}, ${parsed[2]}, ${parsed[3] / 255})`,
		};
	}
	get globalAlpha(): number {
		this.owner.assertOpen();
		return this.state.alpha;
	}
	set globalAlpha(value: unknown) {
		this.owner.assertOpen();
		const alpha = numeric(value);
		if (Number.isFinite(alpha) && alpha >= 0 && alpha <= 1)
			this.state = { ...this.state, alpha };
	}
	save(): void {
		this.owner.assertOpen();
		if (this.saved.length >= canvasLimits.maxSavedStates)
			throw new AgentBrowserError(
				"resource-limit",
				"Canvas state limit exceeded",
			);
		this.saved.push(this.state);
	}
	restore(): void {
		this.owner.assertOpen();
		this.state = this.saved.pop() ?? this.state;
	}

	private surface(): Readonly<RasterImage> | undefined {
		this.owner.assertOpen();
		if (this.image) return this.image;
		const { width, height } = this.owner.dimensions(this.id);
		if (width === 0 || height === 0) return;
		this.owner.reserve(width, height);
		try {
			this.image = createRaster(width, height);
		} catch (error) {
			this.owner.release(width * height);
			throw error;
		}
		return this.image;
	}
	private rect(
		args: readonly unknown[],
	): readonly [number, number, number, number] | undefined {
		this.owner.assertOpen();
		if (args.length < 4)
			throw new TypeError("Canvas rectangles require four arguments");
		let [x, y, width, height] = args.slice(0, 4).map(numeric);
		if (![x, y, width, height, x + width, y + height].every(Number.isFinite))
			return;
		if (width < 0) {
			x += width;
			width = -width;
		}
		if (height < 0) {
			y += height;
			height = -height;
		}
		return [x, y, width, height];
	}
	fillRect(...args: readonly unknown[]): void {
		const rect = this.rect(args);
		if (!rect || rect[2] === 0 || rect[3] === 0) return;
		const image = this.surface();
		if (!image) return;
		// Clip before calling the raster API so finite, very large coordinates stay bounded.
		const left = Math.max(0, Math.min(image.width, rect[0]));
		const top = Math.max(0, Math.min(image.height, rect[1]));
		const right = Math.max(left, Math.min(image.width, rect[0] + rect[2]));
		const bottom = Math.max(top, Math.min(image.height, rect[1] + rect[3]));
		const [r, g, b, a] = this.state.color;
		paintRasterRect(image, left, top, right - left, bottom - top, [
			r,
			g,
			b,
			Math.round(a * this.state.alpha),
		]);
	}
	clearRect(...args: readonly unknown[]): void {
		const rect = this.rect(args);
		if (!rect) return;
		const image = this.surface();
		if (!image) return;
		const left = Math.max(0, Math.min(image.width, Math.ceil(rect[0] - 0.5)));
		const top = Math.max(0, Math.min(image.height, Math.ceil(rect[1] - 0.5)));
		const right = Math.max(
			left,
			Math.min(image.width, Math.ceil(rect[0] + rect[2] - 0.5)),
		);
		const bottom = Math.max(
			top,
			Math.min(image.height, Math.ceil(rect[1] + rect[3] - 0.5)),
		);
		for (let y = top; y < bottom; y++)
			image.pixels.fill(
				0,
				(y * image.width + left) * 4,
				(y * image.width + right) * 4,
			);
	}
	getImageData(...args: readonly unknown[]): {
		width: number;
		height: number;
		data: Uint8ClampedArray;
	} {
		this.owner.assertOpen();
		if (!this.clean)
			throw new DOMException(
				"Canvas contains cross-origin pixels",
				"SecurityError",
			);
		if (args.length < 4)
			throw new TypeError("getImageData requires four arguments");
		let [x, y, width, height] = args
			.slice(0, 4)
			.map((v) => Math.trunc(numeric(v)));
		if (![x, y, width, height].every(Number.isFinite))
			throw new TypeError("Invalid canvas readback coordinates");
		if (width === 0 || height === 0)
			throw new RangeError("Canvas readback dimensions must be nonzero");
		if (width < 0) {
			x += width;
			width = -width;
		}
		if (height < 0) {
			y += height;
			height = -height;
		}
		this.owner.validateSize(width, height);
		const image = this.surface();
		const data = new Uint8ClampedArray(width * height * 4);
		if (image)
			for (
				let row = Math.max(0, -y);
				row < Math.min(height, image.height - y);
				row++
			) {
				const left = Math.max(0, -x);
				const right = Math.min(width, image.width - x);
				if (right > left)
					data.set(
						image.pixels.subarray(
							((row + y) * image.width + x + left) * 4,
							((row + y) * image.width + x + right) * 4,
						),
						(row * width + left) * 4,
					);
			}
		return { width, height, data };
	}
}

export class DocumentCanvases {
	private readonly contexts = new Map<number, NativeCanvas2D>();
	private budget?: CanvasBudget;
	private pixels = 0;
	private closed = false;
	private readonly unsubscribe: () => void;
	private readonly unsubscribeClose: () => void;
	constructor(private readonly tree: DocumentTree) {
		this.unsubscribe = tree.onMutation((record) => {
			if (
				record.type === "attributes" &&
				record.attributeNamespace === null &&
				(record.attributeName === "width" || record.attributeName === "height")
			)
				this.contexts.get(record.target)?.reset();
		});
		this.unsubscribeClose = tree.onClose(() => this.close());
	}
	assertOpen(): void {
		if (this.closed)
			throw new AgentBrowserError("closed", "Document canvases are closed");
	}
	attachBudget(budget: CanvasBudget): void {
		this.assertOpen();
		if (this.budget === budget) return;
		if (this.budget !== undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Canvas runtime ownership cannot change",
			);
		budget.reserve(this.pixels, this.contexts.size);
		this.budget = budget;
	}
	dimensions(id: number): { width: number; height: number } {
		this.assertOpen();
		return canvasIntrinsicSize(this.tree.get(id));
	}
	bitmap(id: number): Readonly<RasterImage> | undefined {
		this.dimensions(id);
		return this.contexts.get(id)?.bitmap();
	}
	originClean(id: number): boolean {
		this.dimensions(id);
		return this.contexts.get(id)?.originClean ?? true;
	}
	get(id: number): NativeCanvas2D {
		this.dimensions(id);
		let context = this.contexts.get(id);
		if (context) return context;
		if (this.contexts.size >= canvasLimits.maxContexts)
			throw new AgentBrowserError(
				"resource-limit",
				"Canvas context limit exceeded",
			);
		context = new NativeCanvas2D(this, id);
		this.budget?.reserve(0, 1);
		this.contexts.set(id, context);
		return context;
	}
	validateSize(width: number, height: number): void {
		if (
			width > rasterLimits.maxDimension ||
			height > rasterLimits.maxDimension ||
			width * height > canvasLimits.maxPixels
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Canvas pixel limit exceeded",
			);
	}
	reserve(width: number, height: number): void {
		this.validateSize(width, height);
		if (this.pixels + width * height > canvasLimits.maxPixels)
			throw new AgentBrowserError(
				"resource-limit",
				"Document canvas pixel limit exceeded",
			);
		this.budget?.reserve(width * height);
		this.pixels += width * height;
	}
	release(pixels: number): void {
		this.pixels -= pixels;
		this.budget?.release(pixels);
	}
	close(): void {
		if (this.closed) return;
		for (const context of this.contexts.values()) context.reset();
		this.budget?.release(0, this.contexts.size);
		this.contexts.clear();
		this.closed = true;
		this.unsubscribe();
		this.unsubscribeClose();
	}
}
const owners = new WeakMap<DocumentTree, DocumentCanvases>();
export function existingDocumentCanvases(
	tree: DocumentTree,
): DocumentCanvases | undefined {
	return owners.get(tree);
}
export function documentCanvases(tree: DocumentTree): DocumentCanvases {
	let owner = owners.get(tree);
	if (!owner) {
		owner = new DocumentCanvases(tree);
		owners.set(tree, owner);
	}
	return owner;
}
