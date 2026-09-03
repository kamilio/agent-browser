import { type ClientRectangle, documentGeometry } from "./document-geometry.js";
import type { DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

export const scriptGeometryLimits = Object.freeze({
	maxObjects: 16_384,
	maxListLength: 4_096,
});

export class ScriptGeometry {
	private created = 0;
	private closed = false;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
	) {}

	getBoundingClientRect(id: number) {
		this.ensureOpen();
		const rect = documentGeometry(this.tree).getBoundingClientRect(id);
		this.reserve(1);
		return this.rect(rect);
	}

	getClientRects(id: number) {
		this.ensureOpen();
		const source = documentGeometry(this.tree).getClientRects(id);
		if (source.length > scriptGeometryLimits.maxListLength)
			throw new AgentBrowserError(
				"resource-limit",
				"Script geometry list limit exceeded",
			);
		this.reserve(source.length + 1);
		const rects = source.map((value) => this.rect(value));
		return this.factory.createHostObject({
			indexed: {
				maxLength: scriptGeometryLimits.maxListLength,
				length: () => {
					this.ensureOpen();
					return rects.length;
				},
				get: (index) => {
					this.ensureOpen();
					return rects[index];
				},
			},
			methods: {
				item: (...args) => {
					this.ensureOpen();
					if (!args.length)
						throw new TypeError("DOMRectList.item requires an index");
					const value = +(args[0] as number);
					const index = Number.isFinite(value)
						? ((Math.trunc(value) % 4_294_967_296) + 4_294_967_296) %
							4_294_967_296
						: 0;
					return rects[index] ?? null;
				},
			},
		});
	}

	metrics() {
		return Object.freeze({ created: this.created, closed: this.closed });
	}
	close() {
		this.closed = true;
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script geometry is closed");
	}
	private reserve(count: number) {
		this.ensureOpen();
		if (this.created + count > scriptGeometryLimits.maxObjects)
			throw new AgentBrowserError(
				"resource-limit",
				"Script geometry object limit exceeded",
			);
		this.created += count;
	}
	private rect(source: ClientRectangle) {
		const values = {
			x: source.x,
			y: source.y,
			width: source.width,
			height: source.height,
		};
		const edges = {
			top: () => Math.min(values.y, values.y + values.height),
			right: () => Math.max(values.x, values.x + values.width),
			bottom: () => Math.max(values.y, values.y + values.height),
			left: () => Math.min(values.x, values.x + values.width),
		};
		const properties: NonNullable<ScriptHostObjectDefinition["properties"]> =
			{};
		for (const key of ["x", "y", "width", "height"] as const) {
			properties[key] = {
				get: () => {
					this.ensureOpen();
					return values[key];
				},
				set: (value) => {
					this.ensureOpen();
					values[key] = +(value as number);
				},
			};
		}
		for (const key of ["top", "right", "bottom", "left"] as const)
			properties[key] = {
				get: () => {
					this.ensureOpen();
					return edges[key]();
				},
			};
		return this.factory.createHostObject({
			properties,
			methods: {
				toJSON: () => {
					this.reserve(1);
					return {
						...values,
						top: edges.top(),
						right: edges.right(),
						bottom: edges.bottom(),
						left: edges.left(),
					};
				},
			},
		});
	}
}
