import { CanvasBudget, documentCanvases } from "./document-canvases.js";
import { documentImages } from "./document-images.js";
import type { DocumentTree } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";
import { AgentBrowserError } from "./errors.js";
import type {
	ScriptHostObjectDefinition,
	ScriptHostObjectFactory,
} from "./script-dom.js";

const budgets = new WeakMap<ScriptHostObjectFactory, CanvasBudget>();

export function scriptCanvasBindings(
	tree: DocumentTree,
	id: number,
	factory: ScriptHostObjectFactory,
	node: () => object,
	ensureOpen: () => unknown,
	identify: (value: unknown) => number,
): ScriptHostObjectDefinition {
	const owner = documentCanvases(tree);
	let budget = budgets.get(factory);
	if (budget === undefined) {
		budget = new CanvasBudget();
		budgets.set(factory, budget);
	}
	owner.attachBudget(budget);
	let published: object | undefined;
	let publishing = false;
	return {
		properties: Object.fromEntries(
			(["width", "height"] as const).map((name) => [
				name,
				{
					get: () => {
						ensureOpen();
						return owner.dimensions(id)[name];
					},
					set: (value: unknown) => {
						ensureOpen();
						if (
							(typeof value === "object" && value !== null) ||
							["function", "symbol", "bigint"].includes(typeof value)
						)
							throw new TypeError(
								"Canvas dimensions require primitive numeric input",
							);
						tree.setAttribute(id, name, String(Number(value) >>> 0));
					},
				},
			]),
		),
		methods: {
			getContext: (kind: unknown) => {
				ensureOpen();
				if (typeof kind !== "string")
					throw new TypeError("Canvas context identifiers require strings");
				if (kind !== "2d") return null;
				if (published) return published;
				if (publishing)
					throw new AgentBrowserError(
						"invalid-input",
						"Reentrant canvas context publication",
					);
				const context = owner.get(id);
				const active = () => {
					ensureOpen();
					owner.assertOpen();
				};
				publishing = true;
				try {
					const candidate = factory.createHostObject({
						properties: {
							canvas: {
								get: () => {
									active();
									return node();
								},
							},
							fillStyle: {
								get: () => {
									active();
									return context.fillStyle;
								},
								set: (value) => {
									active();
									context.fillStyle = value;
								},
							},
							globalAlpha: {
								get: () => {
									active();
									return context.globalAlpha;
								},
								set: (value) => {
									active();
									context.globalAlpha = value;
								},
							},
						},
						methods: {
							drawImage: (value, ...args) => {
								active();
								const sourceId = identify(value);
								const sourceNode = tree.get(sourceId);
								if (isHtmlElement(sourceNode, "canvas")) {
									const dimensions = owner.dimensions(sourceId);
									const source = owner.bitmap(sourceId);
									context.drawImage(
										{
											...dimensions,
											image: source,
											originClean: owner.originClean(sourceId),
										},
										...args,
									);
								} else if (isHtmlElement(sourceNode, "img")) {
									const images = documentImages(tree);
									const snapshot = images.get(sourceId);
									if (snapshot.state === "broken")
										throw new DOMException(
											"Image source is broken",
											"InvalidStateError",
										);
									const decoded = images.decoded(sourceId);
									if (!decoded) return;
									context.drawImage(
										{
											width: snapshot.naturalWidth,
											height: snapshot.naturalHeight,
											image: decoded.image,
											originClean: snapshot.originClean,
										},
										...args,
									);
								} else
									throw new TypeError(
										"drawImage requires an HTML image or canvas from this document",
									);
							},
							fillRect: (...args) => {
								active();
								context.fillRect(...args);
							},
							clearRect: (...args) => {
								active();
								context.clearRect(...args);
							},
							getImageData: (...args) => {
								active();
								return context.getImageData(...args);
							},
							save: () => {
								active();
								context.save();
							},
							restore: () => {
								active();
								context.restore();
							},
						},
					});
					active();
					published = candidate;
					return published;
				} finally {
					publishing = false;
				}
			},
		},
	};
}
