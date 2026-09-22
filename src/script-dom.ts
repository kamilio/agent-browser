import { controlChecked, controlValue, inputType } from "./controls.js";
import {
	HtmlDocumentFamily,
	htmlDocumentFamily,
	documentOrigin,
} from "./html-document-family.js";
import { DocumentEvents } from "./events.js";
import type { PageEventConstructors } from "./page-event-constructors.js";
import { documentMode } from "./document-mode.js";
import type { ObservedDocumentMutation } from "./document-observers.js";
import { ScriptMutationRecords } from "./script-mutation-records.js";
import { ScriptMutationObservers } from "./script-mutation-observers.js";
import { ScriptNodePublications } from "./script-node-publications.js";
import {
	ScriptNodeIterators,
	scriptNodeIteratorHasInstance,
} from "./script-node-iterators.js";
import {
	registerScriptNodeBrand,
	scriptNodeHasInstance,
} from "./script-dom-brands.js";
import { documentScriptState } from "./document-script-state.js";
import {
	documentBody,
	documentElement,
	documentHead,
	setDocumentBody,
} from "./document-elements.js";
import { existingDocumentFiles } from "./document-files.js";
import { documentImages } from "./document-images.js";
import { NodeRelations } from "./node-relations.js";
import {
	type DocumentElementOffsets,
	documentElementOffsets,
} from "./element-offsets.js";
import { documentBaseUrl } from "./document-url.js";
import {
	documentTitle,
	setDocumentTitle,
	titleElementText,
} from "./document-title.js";
import { writeDocument } from "./document-write.js";
import type { DocumentNode, DocumentTree } from "./document.js";
import { AgentBrowserError } from "./errors.js";
import {
	elementNamespace,
	htmlNamespace,
	isHtmlElement,
} from "./dom-namespaces.js";
import { ScriptDatasets } from "./script-dataset.js";
import { ElementTraversal } from "./element-traversal.js";
import { scriptElementFocusProperties } from "./element-focus.js";
import type { PageFocus } from "./page-focus.js";
import { scrollArguments } from "./page-scroll.js";
import {
	type DocumentElementSizes,
	documentElementSizes,
	elementSizeProperties,
} from "./element-sizes.js";
import {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
import { serializeHtml } from "./html-serialization.js";
import { sanitizeInputValue } from "./input-values.js";
import { InlineStyles } from "./inline-styles.js";
import { ComputedStyles } from "./computed-styles.js";
import {
	ScriptAttributes,
	scriptAttributeMapHasInstance,
} from "./script-attributes.js";
import { ScriptClassLists } from "./script-class-list.js";
import { scriptCharacterData } from "./script-character-data.js";
import { ScriptCollections } from "./script-collections.js";
import { ScriptRanges, scriptRangeCharacterMethods } from "./script-ranges.js";
import {
	ScriptEventBindings,
	type ScriptCallbackRuntime,
	type ScriptEventOptions,
} from "./script-events.js";
import { scriptFormMethods, scriptFormProperties } from "./script-form.js";
import { ScriptValidity } from "./script-validity.js";
import { supportsConstraintValidation } from "./form-validation.js";
import { ScriptGeometry } from "./script-geometry.js";
import {
	RootScroll,
	rootScrollProperties,
	type RootScrollRequest,
} from "./root-scroll.js";
import type { ScriptLocation } from "./script-location.js";
import { scriptMutationMethods } from "./script-mutations.js";
import { scriptSelectBindings } from "./script-select.js";
import type { ScriptStorage } from "./script-storage.js";
import { scriptUrlProperties } from "./script-urls.js";
import { scriptElementProperties } from "./script-element-properties.js";
import { scriptImageProperties } from "./script-image-properties.js";
import { scriptCanvasBindings } from "./script-canvases.js";
import { initializeScriptElement } from "./script-element-state.js";
import { DocumentQueries } from "./selectors.js";
import { documentHitTesting, type DocumentHitTesting } from "./hit-testing.js";
import { ScriptBlankFrames } from "./script-blank-frames.js";

function reflectedTagName(node: Readonly<DocumentNode>): string {
	return isHtmlElement(node)
		? node.tagName.replace(/[a-z]/g, (letter) => letter.toUpperCase())
		: node.tagName;
}

export interface ScriptHostObjectDefinition {
	expandos?: {
		maxKeys: number;
		maxKeyCodeUnits: number;
		assertActive?: () => void;
	};
	named?: {
		maxKeys: number;
		maxKeyCodeUnits: number;
		enumerable?: boolean;
		keys: () => readonly string[];
		get: (name: string) => unknown;
		set?: (name: string, value: unknown) => void;
		delete?: (name: string) => boolean;
	};
	indexed?: {
		maxLength: number;
		length: () => number;
		get: (index: number) => unknown;
	};
	properties?: Record<
		string,
		{ get: () => unknown; set?: (value: unknown) => void }
	>;
	methods?: Record<string, (...args: readonly unknown[]) => unknown>;
}

export interface ScriptHostObjectFactory {
	readonly domExpandos?: "bounded-v1";
	eventTargetValue?(target: object): unknown;
	createHostObject(definition: ScriptHostObjectDefinition): object;
}

export class ScriptDom {
	readonly document: object;
	readonly eventBindings?: ScriptEventBindings;
	private readonly queries: DocumentQueries;
	private readonly collections: ScriptCollections;
	private readonly inlineStyles: InlineStyles;
	private readonly attributes: ScriptAttributes;
	private readonly datasets: ScriptDatasets;
	private readonly elementTraversal: ElementTraversal;
	private readonly relations: NodeRelations;
	private readonly classLists: ScriptClassLists;
	private readonly validity: ScriptValidity;
	private readonly geometry: ScriptGeometry;
	private readonly rootScroll: RootScroll;
	private readonly elementSizes: DocumentElementSizes;
	private readonly elementOffsets: DocumentElementOffsets;
	private readonly hitTesting: DocumentHitTesting;
	private readonly computedStyles: ComputedStyles;
	private readonly capabilities = new Map<number, object>();
	private readonly publications: ScriptNodePublications;
	private implementation?: object;
	private readonly inert: boolean;
	private readonly inheritedFamily?: HtmlDocumentFamily;
	private ownedFamily?: HtmlDocumentFamily;
	private templateBinding?: { dom: ScriptDom; events?: DocumentEvents };
	private publishingTemplate = false;
	private readonly callbacks?: ScriptCallbackRuntime;
	private readonly window?: object;
	private blankFrames?: ScriptBlankFrames;
	private mutationRecordOwner?: ScriptMutationRecords;
	private rangeBindings?: ScriptRanges;
	private nodeIterators?: ScriptNodeIterators;
	private mutationObserverOwner?: {
		runtime: ScriptCallbackRuntime;
		bindings: ScriptMutationObservers;
	};
	private identities = new WeakMap<object, number>();
	private closed = false;
	private unregisterClose: () => unknown;

	constructor(
		private readonly tree: DocumentTree,
		private readonly factory: ScriptHostObjectFactory,
		events?: ScriptEventOptions,
		private readonly location?: ScriptLocation,
		private readonly storage?: ScriptStorage,
		scrollRequest?: RootScrollRequest,
		private readonly pageFocus?: PageFocus,
		private readonly eventConstructors?: PageEventConstructors,
	) {
		pageFocus?.assertDocument(tree);
		eventConstructors?.assertDocument(tree);
		this.inheritedFamily = htmlDocumentFamily(tree);
		this.inert =
			this.inheritedFamily !== undefined || tree.isTemplateContentsDocument;
		this.callbacks = events?.callbacks;
		this.window = this.inert ? undefined : events?.window;
		if (typeof factory?.createHostObject !== "function")
			throw new AgentBrowserError(
				"unsupported",
				"SafeJS live host objects are required",
			);
		this.queries = new DocumentQueries(tree);
		this.inlineStyles = new InlineStyles(tree, factory);
		this.classLists = new ScriptClassLists(tree, factory);
		this.validity = new ScriptValidity(tree, factory);
		this.datasets = new ScriptDatasets(tree, factory);
		this.elementTraversal = new ElementTraversal(tree);
		this.geometry = new ScriptGeometry(tree, factory, !this.inert);
		this.rootScroll = new RootScroll(tree, scrollRequest);
		this.elementSizes = documentElementSizes(tree);
		this.elementOffsets = documentElementOffsets(tree);
		this.hitTesting = documentHitTesting(tree);
		this.computedStyles = new ComputedStyles(tree, factory);
		this.relations = new NodeRelations(tree);
		this.publications = new ScriptNodePublications(factory, () =>
			this.ensureOpen(),
		);
		this.attributes = new ScriptAttributes(
			tree,
			factory,
			(id) => this.node(id),
			this.relations,
			this.publications,
		);
		this.collections = new ScriptCollections(tree, factory, (id) =>
			this.node(id),
		);
		this.unregisterClose = tree.onClose(() => this.close());
		try {
			if (events)
				this.eventBindings = new ScriptEventBindings(
					tree,
					factory,
					(target) => this.node(target),
					events,
				);
			this.document = this.node(tree.root);
		} catch (error) {
			this.close();
			throw error;
		}
	}

	node(id: number): object {
		const initial = this.read(id);
		const pageFocus = this.pageFocus;
		const eventConstructors = this.eventConstructors;
		const existing = this.capabilities.get(id);
		if (existing) return existing;
		const definition: Required<
			Pick<ScriptHostObjectDefinition, "properties" | "methods">
		> = {
			properties: {
				baseURI: {
					get: () => {
						this.read(id);
						return documentBaseUrl(this.tree);
					},
				},
				nodeType: {
					get: () =>
						({
							document: 9,
							fragment: 11,
							element: 1,
							text: 3,
							comment: 8,
							doctype: 10,
						})[this.read(id).kind],
				},
				nodeName: {
					get: () =>
						this.read(id).kind === "element"
							? reflectedTagName(this.read(id))
							: this.read(id).kind === "doctype"
								? (this.read(id).doctype?.name ?? "")
								: this.read(id).kind === "fragment"
									? "#document-fragment"
									: `#${this.read(id).kind}`,
				},
				ownerDocument: {
					get: () =>
						this.read(id).kind === "document"
							? null
							: this.node(this.tree.root),
				},
				parentNode: { get: () => this.optional(this.read(id).parent) },
				parentElement: {
					get: () => {
						const parent = this.read(id).parent;
						return parent !== null && this.read(parent).kind === "element"
							? this.node(parent)
							: null;
					},
				},
				firstChild: { get: () => this.optional(this.read(id).children[0]) },
				lastChild: { get: () => this.optional(this.read(id).children.at(-1)) },
				nextSibling: { get: () => this.sibling(id, 1) },
				previousSibling: { get: () => this.sibling(id, -1) },
				childNodes: {
					get: () => this.read(id).children.map((child) => this.node(child)),
				},
				isConnected: {
					get: () => {
						this.read(id);
						return this.tree.isConnected(id);
					},
				},
				textContent: {
					get: () => {
						const node = this.read(id);
						return node.kind === "document" || node.kind === "doctype"
							? null
							: node.kind === "element" || node.kind === "fragment"
								? this.tree.textContent(id)
								: node.data;
					},
					set: (value) => {
						this.read(id);
						this.tree.setTextContent(
							id,
							value === null ? "" : domString(value),
						);
					},
				},
				nodeValue: {
					get: () => {
						const node = this.read(id);
						return node.kind === "text" || node.kind === "comment"
							? node.data
							: null;
					},
					set: (value) => {
						const node = this.read(id);
						if (node.kind === "text" || node.kind === "comment")
							this.tree.setData(id, value === null ? "" : domString(value));
					},
				},
			},
			methods: {
				getRootNode: () => {
					this.read(id);
					return this.node(this.tree.rootOf(id));
				},
				cloneNode: (deep: unknown = false) => {
					this.read(id);
					return this.node(this.tree.clone(id, Boolean(deep)));
				},
				...scriptMutationMethods(this.tree, id, {
					read: (target) => this.read(target),
					identify: (value) => this.identify(value),
					node: (target) => this.node(target),
					string: domString,
				}),
				hasChildNodes: () => this.read(id).children.length > 0,
			},
		};
		if (initial.kind === "doctype") {
			definition.properties.name = {
				get: () => this.read(id).doctype?.name ?? "",
			};
			definition.properties.publicId = {
				get: () => this.read(id).doctype?.publicId ?? "",
			};
			definition.properties.systemId = {
				get: () => this.read(id).doctype?.systemId ?? "",
			};
		}
		if (isHtmlElement(initial, "title"))
			definition.properties.text = {
				get: () => {
					this.read(id);
					return titleElementText(this.tree, id);
				},
				set: (value) => {
					this.read(id);
					this.tree.setTextContent(id, domString(value));
				},
			};
		const relations = this.relations.definition(id);
		Object.assign(definition.properties, relations.properties);
		Object.assign(definition.methods, relations.methods);
		const characterData = scriptCharacterData(this.tree, id, {
			read: (target) => this.read(target),
			node: (target) => this.node(target),
			string: domString,
		});
		Object.assign(definition.properties, characterData.properties);
		Object.assign(definition.methods, characterData.methods);
		if (initial.kind === "text" || initial.kind === "comment")
			Object.assign(
				definition.methods,
				scriptRangeCharacterMethods(this.tree, id, {
					ensureOpen: () => this.read(id),
					node: (target) => this.node(target),
					string: domString,
				}),
			);
		const eventBindings = this.eventBindings;
		if (
			eventBindings &&
			(initial.kind === "element" || initial.kind === "document")
		)
			definition.properties.ontoggle = {
				get: () => {
					this.read(id);
					return eventBindings.getHandler(id, "toggle");
				},
				set: (value) => {
					this.read(id);
					eventBindings.setHandler(id, "toggle", value);
				},
			};
		if (eventBindings && eventConstructors && !this.inert)
			definition.properties.dispatchEvent = {
				get: () => eventConstructors.dispatchEventValue,
			};
		if (
			initial.kind === "document" &&
			eventBindings &&
			eventConstructors &&
			!this.inert
		)
			definition.properties.createEvent = {
				get: () => {
					this.read(id);
					return eventConstructors.createEventValue;
				},
			};
		if (eventBindings)
			Object.assign(definition.methods, {
				addEventListener: (
					type: unknown,
					callback: unknown,
					options: unknown,
				) => {
					this.read(id);
					eventBindings.add(id, domString(type), callback, options);
				},
				removeEventListener: (
					type: unknown,
					callback: unknown,
					options: unknown,
				) => {
					this.read(id);
					eventBindings.remove(id, domString(type), callback, options);
				},
			});
		if (["document", "fragment", "element"].includes(initial.kind)) {
			for (const [name, method] of [
				["firstElementChild", "first"],
				["lastElementChild", "last"],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.optional(this.elementTraversal[method](id));
					},
				};
			definition.properties.childElementCount = {
				get: () => {
					this.read(id);
					return this.elementTraversal.count(id);
				},
			};
			Object.assign(definition.properties, {
				children: {
					get: () => {
						this.read(id);
						return this.collections.get(id, "children");
					},
				},
			});
			Object.assign(definition.methods, {
				querySelector: (selector: unknown) => {
					this.read(id);
					return this.optional(
						this.queries.querySelector(domString(selector), id),
					);
				},
				querySelectorAll: (selector: unknown) => {
					this.read(id);
					return this.queries
						.querySelectorAll(domString(selector), id)
						.map((child) => this.node(child));
				},
			});
		}
		if (["element", "text", "comment"].includes(initial.kind))
			for (const [name, method] of [
				["previousElementSibling", "previous"],
				["nextElementSibling", "next"],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.optional(this.elementTraversal[method](id));
					},
				};
		if (initial.kind === "document" || initial.kind === "element") {
			for (const [name, kind] of [
				["getElementsByTagName", "tag"],
				["getElementsByClassName", "class"],
			] as const)
				definition.methods[name] = (...args) => {
					this.read(id);
					if (args.length === 0)
						throw new AgentBrowserError(
							"invalid-input",
							"Collection query requires an argument",
						);
					return this.collections.get(id, kind, domString(args[0]));
				};
			definition.methods.getElementsByTagNameNS = (...args) => {
				this.read(id);
				if (args.length < 2)
					throw new AgentBrowserError(
						"invalid-input",
						"Namespace collection query requires two arguments",
					);
				const namespace =
					args[0] === null || args[0] === undefined ? null : domString(args[0]);
				const localName = domString(args[1]);
				return this.collections.getByNamespace(id, namespace, localName);
			};
		}
		if (initial.kind === "document" || initial.kind === "fragment") {
			definition.methods.getElementById = (value: unknown) => {
				this.read(id);
				const wanted = domString(value);
				if (wanted === "") return null;
				for (const { node } of this.tree.walk(id))
					if (node.kind === "element" && node.attributes.id === wanted)
						return this.node(node.id);
				return null;
			};
		}
		if (initial.kind === "document") {
			definition.properties.defaultView = {
				get: () => {
					this.read(id);
					return this.window ?? null;
				},
			};
			definition.methods.getElementsByName = (...args) => {
				this.read(id);
				if (args.length === 0)
					throw new TypeError("getElementsByName requires a name");
				return this.collections.get(id, "name", domString(args[0]));
			};
			definition.properties.compatMode = {
				get: () => {
					this.read(id);
					return documentMode(this.tree) === "quirks"
						? "BackCompat"
						: "CSS1Compat";
				},
			};
			definition.properties.implementation = {
				get: () => this.documentImplementation(),
			};
			definition.properties.doctype = {
				get: () =>
					this.optional(
						this.read(id).children.find(
							(child) => this.read(child).kind === "doctype",
						),
					),
			};
			definition.properties.title = {
				get: () => {
					this.read(id);
					return documentTitle(this.tree);
				},
				set: (value) => {
					this.read(id);
					setDocumentTitle(this.tree, domString(value));
				},
			};
			if (this.eventBindings)
				definition.properties.onscroll = {
					get: () => {
						this.read(id);
						return this.eventBindings?.getHandler(id, "scroll") ?? null;
					},
					set: (value) => {
						this.read(id);
						this.eventBindings?.setHandler(id, "scroll", value);
					},
				};
			for (const method of ["elementFromPoint", "elementsFromPoint"] as const)
				definition.methods[method] = (...args: readonly unknown[]) => {
					this.read(id);
					if (args.length < 2)
						throw new TypeError(`${method} requires two coordinates`);
					for (const value of args.slice(0, 2))
						if (
							value !== null &&
							(typeof value === "object" || typeof value === "function")
						)
							throw new AgentBrowserError(
								"unsupported",
								"Object-to-coordinate conversion is not implemented",
							);
					const x = +(args[0] as number);
					const y = +(args[1] as number);
					if (method === "elementsFromPoint")
						return this.hitTesting
							.elementsFromPoint(x, y)
							.map((target) => this.node(target));
					return this.optional(
						this.hitTesting.elementFromPoint(x, y) ?? undefined,
					);
				};
			definition.properties.forms = {
				get: () => {
					this.read(id);
					return this.collections.getByNamespace(id, htmlNamespace, "form");
				},
			};
			definition.properties.images = {
				get: () => {
					this.read(id);
					return this.collections.getByNamespace(id, htmlNamespace, "img");
				},
			};
			for (const [name, kind, query] of [
				["scripts", "tag", "script"],
				["embeds", "tag", "embed"],
				["plugins", "tag", "embed"],
				["links", "links", ""],
				["anchors", "anchors", ""],
			] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return kind === "tag"
							? this.collections.getByNamespace(id, htmlNamespace, query)
							: this.collections.get(id, kind, query);
					},
				};
			if (this.storage)
				definition.properties.cookie = {
					get: () => {
						this.read(id);
						return this.storage?.readCookie();
					},
					set: (value) => {
						this.read(id);
						this.storage?.writeCookie(value);
					},
				};
			if (this.location)
				definition.properties.location = {
					get: () => {
						this.read(id);
						return this.location?.object;
					},
					set: (value) => this.location?.navigate(value),
				};
			Object.assign(definition.properties, {
				activeElement: {
					get: () => {
						this.read(id);
						return this.optional(
							this.tree.activeElement ??
								this.queries.querySelector("body") ??
								this.read(id).children.find(
									(child) => this.read(child).kind === "element",
								),
						);
					},
				},
				readyState: {
					get: () => {
						this.read(id);
						return documentScriptState(this.tree)?.readyState ?? "complete";
					},
				},
				currentScript: {
					get: () => {
						this.read(id);
						return this.optional(
							documentScriptState(this.tree)?.currentScript ?? undefined,
						);
					},
				},
				URL: {
					get: () => {
						this.read(id);
						return this.tree.url;
					},
				},
				documentURI: {
					get: () => {
						this.read(id);
						return this.tree.url;
					},
				},
				domain: {
					get: () => {
						this.read(id);
						const origin = documentOrigin(this.tree);
						return origin.opaque ? "" : new URL(origin.serialized).hostname;
					},
				},
				body: {
					get: () => {
						this.read(id);
						return this.optional(documentBody(this.tree));
					},
					set: (value: unknown) => {
						this.read(id);
						setDocumentBody(this.tree, this.identify(value));
					},
				},
				head: {
					get: () => {
						this.read(id);
						return this.optional(documentHead(this.tree));
					},
				},
				documentElement: {
					get: () => {
						this.read(id);
						return this.optional(documentElement(this.tree));
					},
				},
				scrollingElement: {
					get: () => {
						this.read(id);
						return this.optional(this.rootScroll.element());
					},
				},
			});
			Object.assign(definition.methods, {
				write: (...values: readonly unknown[]) => this.write(values, false),
				createRange: () => this.ranges().createRange(),
				createNodeIterator: (...args: readonly unknown[]) => {
					this.read(id);
					if (!args.length)
						throw new TypeError("createNodeIterator requires a root");
					const root = this.identify(args[0]);
					this.nodeIterators ??= new ScriptNodeIterators(
						this.tree,
						this.factory,
						this.publications,
						(node) => this.node(node),
					);
					return this.nodeIterators.create(root, args[1], args[2]);
				},
				getSelection: () => this.getSelection(),
				importNode: (...values: readonly unknown[]) => this.importNode(values),
				createAttribute: (...args: readonly unknown[]) => {
					this.read(id);
					if (!args.length)
						throw new AgentBrowserError(
							"invalid-input",
							"Missing attribute name",
						);
					return this.attributes.create(domString(args[0]));
				},
				writeln: (...values: readonly unknown[]) => this.write(values, true),
				createDocumentFragment: () => {
					this.read(id);
					return this.node(this.tree.createFragment());
				},
				createElement: (name: unknown) => {
					this.read(id);
					const created = this.tree.createElement(domString(name));
					if (isHtmlElement(this.tree.get(created), "script"))
						initializeScriptElement(this.tree, created, "dynamic");
					return this.node(created);
				},
				createElementNS: (...args: readonly unknown[]) => {
					this.read(id);
					if (args.length < 2)
						throw new TypeError("createElementNS requires two arguments");
					const namespace =
						args[0] === null || args[0] === undefined ? "" : domString(args[0]);
					const created = this.tree.createElementNS(
						namespace,
						domString(args[1]),
					);
					if (isHtmlElement(this.tree.get(created), "script"))
						initializeScriptElement(this.tree, created, "dynamic");
					return this.node(created);
				},
				createTextNode: (data: unknown) => {
					this.read(id);
					return this.node(this.tree.createText(domString(data)));
				},
				createComment: (data: unknown) => {
					this.read(id);
					return this.node(this.tree.createComment(domString(data)));
				},
			});
			if (this.inert) {
				for (const [name, value] of Object.entries({
					defaultView: null,
					location: null,
					referrer: "",
					contentType: this.tree.isTemplateContentsDocument
						? "application/xml"
						: "text/html",
					characterSet: "UTF-8",
					charset: "UTF-8",
					inputEncoding: "UTF-8",
				}))
					definition.properties[name] = {
						get: () => {
							this.read(id);
							return value;
						},
					};
				definition.properties.cookie = {
					get: () => {
						this.read(id);
						return "";
					},
					set: (value) => {
						this.read(id);
						domString(value);
					},
				};
				definition.methods.hasFocus = () => {
					this.read(id);
					return false;
				};
				definition.properties.activeElement = {
					get: () => {
						this.read(id);
						return this.optional(
							documentBody(this.tree) ?? documentElement(this.tree),
						);
					},
				};
				for (const method of ["elementFromPoint", "elementsFromPoint"])
					definition.methods[method] = (...args) => {
						this.read(id);
						if (args.length < 2)
							throw new TypeError(`${method} requires two coordinates`);
						inertCoordinate(args[0]);
						inertCoordinate(args[1]);
						return method === "elementsFromPoint" ? [] : null;
					};
			}
		}
		if (initial.kind === "element") {
			if (isHtmlElement(initial, "iframe"))
				for (const name of ["contentWindow", "contentDocument"] as const)
					definition.properties[name] = {
						get: () => {
							this.read(id);
							if (this.inert || !this.window) return null;
							this.blankFrames ??= new ScriptBlankFrames(
								this.tree,
								this.factory,
								this.window,
								(target) => this.node(target),
								this.callbacks,
							);
							const frame = this.blankFrames.get(id);
							return name === "contentWindow"
								? (frame?.window ?? null)
								: (frame?.dom.document ?? null);
						},
					};
			if (isHtmlElement(initial, "canvas")) {
				const canvas = scriptCanvasBindings(
					this.tree,
					id,
					this.factory,
					() => this.node(id),
					() => this.read(id),
					(value) => this.identify(value),
				);
				Object.assign(definition.properties, canvas.properties);
				Object.assign(definition.methods, canvas.methods);
			}
			if (pageFocus && !this.inert) {
				definition.methods.focus = (options) => {
					this.read(id);
					return pageFocus.focusAsync(id, options);
				};
				definition.methods.blur = () => {
					this.read(id);
					return pageFocus.blurAsync(id);
				};
			}
			if (isHtmlElement(initial, "template"))
				definition.properties.content = {
					get: () => this.templateContent(id),
				};
			Object.assign(definition.methods, this.attributes.elementMethods(id));
			definition.properties.dataset = {
				get: () => {
					this.read(id);
					return this.datasets.get(id);
				},
			};
			if (isHtmlElement(initial, "img")) {
				const images = documentImages(this.tree);
				images.get(id);
				Object.assign(
					definition.properties,
					scriptImageProperties(this.tree, id, () => this.read(id), images),
				);
				for (const name of [
					"complete",
					"currentSrc",
					"naturalWidth",
					"naturalHeight",
				] as const)
					definition.properties[name] = {
						get: () => {
							this.read(id);
							return images.get(id)[name];
						},
					};
				definition.properties.alt = {
					get: () => this.read(id).attributes.alt ?? "",
					set: (value) => {
						this.read(id);
						this.tree.setAttribute(id, "alt", domString(value));
					},
				};
				definition.methods.decode = () => {
					this.read(id);
					return images.decode(id);
				};
				if (this.eventBindings)
					for (const type of ["load", "error"])
						definition.properties[`on${type}`] = {
							get: () => {
								this.read(id);
								return this.eventBindings?.getHandler(id, type);
							},
							set: (value) => {
								this.read(id);
								this.eventBindings?.setHandler(id, type, value);
							},
						};
			}
			if (isHtmlElement(initial, "script")) {
				Object.assign(
					definition.properties,
					scriptElementProperties(
						this.tree,
						id,
						() => this.read(id),
						domString,
					),
				);
				if (this.eventBindings)
					for (const type of ["load", "error"])
						definition.properties[`on${type}`] = {
							get: () => {
								this.read(id);
								return this.eventBindings?.getHandler(id, type);
							},
							set: (value) => {
								this.read(id);
								this.eventBindings?.setHandler(id, type, value);
							},
						};
			}
			if (isHtmlElement(initial)) {
				Object.assign(
					definition.properties,
					scriptFormProperties(
						this.tree,
						id,
						() => this.read(id),
						(target) => this.node(target),
						this.collections,
						domString,
						this.validity,
					),
				);
				Object.assign(
					definition.methods,
					scriptFormMethods(this.tree, id, () => this.read(id)),
				);
			}
			if (
				isHtmlElement(initial) &&
				supportsConstraintValidation(initial.tagName)
			)
				definition.methods.setCustomValidity = (
					...args: readonly unknown[]
				) => {
					this.read(id);
					if (!args.length)
						throw new TypeError("setCustomValidity requires a message");
					this.tree.setCustomValidity(id, domString(args[0]));
				};
			definition.properties.classList = {
				get: () => this.classLists.get(id),
				set: (value) => this.classLists.setValue(id, value),
			};
			if (isHtmlElement(initial))
				Object.assign(
					definition.properties,
					scriptUrlProperties(this.tree, id, () => this.read(id), domString),
				);
			if (isHtmlElement(initial, "a") || isHtmlElement(initial, "area"))
				definition.methods.toString = () =>
					String(definition.properties.href.get());
			definition.properties.attributes = { get: () => this.attributes.map(id) };
			definition.methods.getClientRects = () =>
				this.geometry.getClientRects(id);
			definition.methods.getBoundingClientRect = () =>
				this.geometry.getBoundingClientRect(id);
			definition.methods.scrollIntoView = (argument) => {
				this.read(id);
				return this.rootScroll.intoView(id, argument);
			};
			for (const name of ["scroll", "scrollTo", "scrollBy"])
				definition.methods[name] = (...args) => {
					this.read(id);
					return this.rootScroll.scroll(id, name === "scrollBy", args);
				};
			for (const property of rootScrollProperties)
				definition.properties[property] = {
					get: () => {
						this.read(id);
						return this.rootScroll.get(id, property);
					},
					...(property === "scrollTop" || property === "scrollLeft"
						? {
								set: (value: unknown) => {
									this.read(id);
									this.rootScroll.set(id, property, value);
								},
							}
						: {}),
				};
			for (const name of elementSizeProperties)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						return this.elementSizes.get(id)[name];
					},
				};
			for (const name of ["offsetTop", "offsetLeft", "offsetParent"] as const)
				definition.properties[name] = {
					get: () => {
						this.read(id);
						const value = this.elementOffsets.get(id)[name];
						return name === "offsetParent" ? this.optional(value) : value;
					},
				};
			definition.properties.style = {
				get: () => this.inlineStyles.get(id),
				set: (value) =>
					this.inlineStyles.replace(id, value === null ? "" : domString(value)),
			};
			Object.assign(definition.properties, {
				innerHTML: {
					get: () => {
						this.read(id);
						return serializeHtml(this.tree, id);
					},
					set: (value: unknown) => {
						this.read(id);
						setInnerHtml(this.tree, id, value === null ? "" : domString(value));
					},
				},
				outerHTML: {
					get: () => {
						this.read(id);
						return serializeHtml(this.tree, id, { includeSelf: true });
					},
					set: (value: unknown) => {
						this.read(id);
						setOuterHtml(this.tree, id, value === null ? "" : domString(value));
					},
				},
				tagName: { get: () => reflectedTagName(this.read(id)) },
				localName: { get: () => this.read(id).tagName },
				namespaceURI: {
					get: () => elementNamespace(this.read(id)),
				},
				prefix: {
					get: () => {
						this.read(id);
						return null;
					},
				},
				id: this.attribute(id, "id"),
				className: this.attribute(id, "class"),
				title: this.attribute(id, "title"),
				...scriptElementFocusProperties(
					this.tree,
					id,
					() => this.read(id),
					domString,
				),
			});
			if (isHtmlElement(initial, "details")) {
				definition.properties.name = this.attribute(id, "name");
				definition.properties.open = {
					get: () => Object.hasOwn(this.read(id).attributes, "open"),
					set: (value) => {
						this.read(id);
						if (value) this.tree.setAttribute(id, "open", "");
						else this.tree.removeAttribute(id, "open");
					},
				};
			}
			Object.assign(definition.methods, {
				insertAdjacentHTML: (...args: readonly unknown[]) => {
					this.read(id);
					if (args.length < 2)
						throw new AgentBrowserError(
							"invalid-input",
							"Adjacent HTML requires position and markup",
						);
					insertAdjacentHtml(
						this.tree,
						id,
						domString(args[0]),
						domString(args[1]),
					);
				},
				getAttributeNode: (...args: readonly unknown[]) => {
					this.read(id);
					if (!args.length)
						throw new AgentBrowserError(
							"invalid-input",
							"Missing attribute name",
						);
					return this.attributes.get(id, domString(args[0]));
				},
				setAttributeNode: (attribute: unknown) =>
					this.attributes.set(id, attribute),
				removeAttributeNode: (attribute: unknown) =>
					this.attributes.remove(id, attribute),
				matches: (selector: unknown) => {
					this.read(id);
					return this.queries.matches(id, domString(selector));
				},
				closest: (selector: unknown) => {
					this.read(id);
					return this.optional(this.queries.closest(id, domString(selector)));
				},
			});
			if (
				isHtmlElement(initial, "input") ||
				isHtmlElement(initial, "textarea")
			) {
				definition.properties.value = {
					get: () => {
						this.read(id);
						return controlValue(this.tree, id);
					},
					set: (value) => this.setValue(id, value),
				};
			}
			if (isHtmlElement(initial, "input")) {
				definition.properties.checked = {
					get: () => {
						this.read(id);
						return controlChecked(this.tree, id);
					},
					set: (value) => {
						this.read(id);
						this.tree.setInputChecked(id, Boolean(value));
					},
				};
			}
			if (isHtmlElement(initial)) {
				const select = scriptSelectBindings(
					this.tree,
					id,
					() => this.read(id),
					(target) => this.node(target),
					this.collections,
					domString,
				);
				Object.assign(definition.properties, select.properties);
				Object.assign(definition.methods, select.methods);
			}
			if (this.inert) {
				for (const name of ["scroll", "scrollTo", "scrollBy"])
					definition.methods[name] = (...args) => {
						this.read(id);
						scrollArguments(args);
						return Promise.resolve();
					};
				for (const method of ["focus", "blur", "scrollIntoView"])
					definition.methods[method] = () => {
						this.read(id);
					};
				for (const name of [
					...elementSizeProperties,
					"offsetTop",
					"offsetLeft",
					"scrollWidth",
					"scrollHeight",
				])
					definition.properties[name] = {
						get: () => {
							this.read(id);
							return 0;
						},
					};
				for (const name of ["scrollTop", "scrollLeft"])
					definition.properties[name] = {
						get: () => {
							this.read(id);
							return 0;
						},
						set: (value) => {
							this.read(id);
							inertCoordinate(value);
						},
					};
				definition.properties.offsetParent = {
					get: () => {
						this.read(id);
						return null;
					},
				};
			}
		}
		return this.publications.publish(
			"node",
			id,
			definition,
			(capability) => {
				this.relations.register(capability, id);
				this.capabilities.set(id, capability);
				this.identities.set(capability, id);
				registerScriptNodeBrand(capability, this.factory, () => this.read(id));
			},
			pageFocus && !this.inert && initial.kind === "element"
				? (methods) => pageFocus.bindMethods(methods)
				: undefined,
			eventConstructors && eventBindings && !this.inert
				? (capability, assertActive) =>
						eventConstructors.registerTarget(id, capability, assertActive)
				: undefined,
		);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		try {
			this.blankFrames?.close();
			this.publications.close();
			this.implementation = undefined;
			this.mutationObserverOwner?.bindings.close();
			this.mutationObserverOwner = undefined;
			this.mutationRecordOwner?.close();
			this.rangeBindings?.close();
			this.nodeIterators?.close();
			this.nodeIterators = undefined;
			this.rangeBindings = undefined;
			this.eventBindings?.close();
			this.queries.close();
			this.collections.close();
			this.inlineStyles.close();
			this.attributes.close();
			this.datasets.close();
			this.elementTraversal.close();
			this.relations.close();
			this.classLists.close();
			this.validity.close();
			this.geometry.close();
			this.computedStyles.close();
			this.capabilities.clear();
			this.identities = new WeakMap();
			this.unregisterClose();
		} finally {
			const binding = this.templateBinding;
			this.templateBinding = undefined;
			try {
				try {
					binding?.dom.close();
				} finally {
					binding?.events?.close();
				}
			} finally {
				this.ownedFamily?.close();
			}
		}
	}

	getSelection(): object | null {
		this.ensureOpen();
		return this.inert ? null : this.ranges().getSelection();
	}

	private ranges(): ScriptRanges {
		this.ensureOpen();
		return (this.rangeBindings ??= new ScriptRanges(this.tree, this.factory, {
			ensureOpen: () => this.ensureOpen(),
			node: (id) => this.node(id),
			identify: (value) => this.identify(value),
		}));
	}

	consoleLabel(value: object): string | undefined {
		const id = this.identities.get(value);
		if (id === undefined) return undefined;
		const node = this.read(id);
		return node.kind === "element"
			? `<${node.tagName}>`
			: node.kind === "fragment"
				? "#document-fragment"
				: `#${node.kind}`;
	}

	hasInstance(value: unknown, name: unknown): boolean {
		this.ensureOpen();
		if (name === "NodeIterator")
			return scriptNodeIteratorHasInstance(value, this.factory);
		if (name === "NamedNodeMap")
			return scriptAttributeMapHasInstance(value, this.factory);
		return scriptNodeHasInstance(value, this.factory, name);
	}

	parseFromString(source: unknown, type: unknown): object {
		this.ensureOpen();
		if (typeof source !== "string" || typeof type !== "string")
			throw new TypeError("DOMParser requires string arguments");
		if (type !== "text/html")
			throw new AgentBrowserError(
				"unsupported",
				"DOMParser XML parsing is unsupported",
			);
		return this.documentFamily().parseHtml(
			source,
			(tree) => {
				const child = new ScriptDom(
					tree,
					this.factory,
					this.callbacks
						? { events: new DocumentEvents(tree), callbacks: this.callbacks }
						: undefined,
				);
				this.ensureOpen();
				return child.document;
			},
			this.tree,
		);
	}

	metrics() {
		return Object.freeze({
			documents: (this.ownedFamily ?? this.inheritedFamily)?.metrics() ?? null,
			nodeIterators: this.nodeIterators?.metrics() ?? null,
			publications: this.publications.metrics(),
			queries: this.queries.metrics(),
			classLists: this.classLists.metrics(),
			geometry: this.geometry.metrics(),
			computedStyles: this.computedStyles.metrics(),
			elementSizes: this.elementSizes.metrics(),
			elementOffsets: this.elementOffsets.metrics(),
			hitTesting: this.hitTesting.metrics(),
		});
	}

	mutationObservers(runtime: ScriptCallbackRuntime): ScriptMutationObservers {
		this.read(this.tree.root);
		if (this.mutationObserverOwner) {
			if (this.mutationObserverOwner.runtime !== runtime)
				throw new AgentBrowserError(
					"invalid-input",
					"Script observer runtime cannot be replaced",
				);
			return this.mutationObserverOwner.bindings;
		}
		const bindings = new ScriptMutationObservers(
			this.tree,
			this.factory,
			{
				identify: (value) => this.identify(value),
				records: (records) => this.mutationRecords(records),
			},
			runtime,
		);
		this.mutationObserverOwner = { runtime, bindings };
		return bindings;
	}

	mutationRecords(
		records: readonly ObservedDocumentMutation[],
	): readonly object[] {
		this.read(this.tree.root);
		this.mutationRecordOwner ??= new ScriptMutationRecords(
			this.tree,
			this.factory,
			(id) => this.node(id),
		);
		return this.mutationRecordOwner.wrap(records);
	}

	getComputedStyle(element: unknown, pseudo?: unknown): object {
		return this.computedStyles.get(this.identify(element), pseudo);
	}

	private ensureOpen() {
		if (this.closed)
			throw new AgentBrowserError("closed", "Script document is closed");
	}
	private read(id: number): Readonly<DocumentNode> {
		this.ensureOpen();
		return this.tree.get(id);
	}
	private optional(id: number | null | undefined) {
		return id == null ? null : this.node(id);
	}
	private documentImplementation(): object {
		this.ensureOpen();
		if (this.implementation) return this.implementation;
		return this.publications.publish(
			"implementation",
			this.tree.root,
			{
				methods: {
					hasFeature: () => true,
					createHTMLDocument: (value) => {
						const title = value === undefined ? undefined : domString(value);
						this.read(this.tree.root);
						return this.documentFamily().create(
							title,
							(tree) => {
								const child = new ScriptDom(
									tree,
									this.factory,
									this.callbacks
										? {
												events: new DocumentEvents(tree),
												callbacks: this.callbacks,
											}
										: undefined,
								);
								this.ensureOpen();
								return child.document;
							},
							this.tree,
						);
					},
					createDocumentType: (...values) => {
						if (values.length < 3)
							throw new TypeError(
								"createDocumentType requires three arguments",
							);
						return this.node(
							this.tree.createDocumentType(
								domString(values[0]),
								domString(values[1]),
								domString(values[2]),
							),
						);
					},
				},
			},
			(capability) => {
				this.implementation = capability;
			},
		);
	}
	private documentFamily(): HtmlDocumentFamily {
		this.ensureOpen();
		const inherited = this.inheritedFamily ?? htmlDocumentFamily(this.tree);
		if (inherited) return inherited;
		this.ownedFamily ??= new HtmlDocumentFamily(this.tree);
		return this.ownedFamily;
	}

	private templateContent(id: number): object {
		this.read(id);
		const content = this.tree.templateContent(id);
		if (content.tree === this.tree) return this.node(content.id);
		if (this.templateBinding) return this.templateBinding.dom.node(content.id);
		if (this.publishingTemplate)
			throw new AgentBrowserError(
				"invalid-input",
				"Reentrant template contents publication",
			);
		this.publishingTemplate = true;
		let candidate: ScriptDom | undefined;
		let events: DocumentEvents | undefined;
		try {
			this.documentFamily().attachTemplate(this.tree, id);
			if (this.callbacks) events = new DocumentEvents(content.tree);
			candidate = new ScriptDom(
				content.tree,
				this.factory,
				events && this.callbacks
					? { events, callbacks: this.callbacks }
					: undefined,
			);
			const capability = candidate.node(content.id);
			this.ensureOpen();
			this.templateBinding = { dom: candidate, events };
			return capability;
		} catch (error) {
			try {
				candidate?.close();
			} finally {
				events?.close();
			}
			throw error;
		} finally {
			this.publishingTemplate = false;
		}
	}
	private importNode(values: readonly unknown[]): object {
		this.read(this.tree.root);
		if (!values.length) throw new TypeError("importNode requires a node");
		this.relations.source(values[0]);
		const options = values[1];
		let deep = false;
		if (options === null) deep = true;
		else if (typeof options === "object" || typeof options === "function") {
			const dictionary = options as {
				customElementRegistry?: unknown;
				selfOnly?: unknown;
			};
			if (dictionary.customElementRegistry !== undefined)
				throw new AgentBrowserError(
					"unsupported",
					"Importing with a custom element registry is not implemented",
				);
			deep = !dictionary.selfOnly;
		} else deep = Boolean(options);
		this.read(this.tree.root);
		const source = this.relations.source(values[0]);
		if (source.attribute) {
			return this.attributes.copyFrom(source.tree, source.id);
		}
		if (source.tree.get(source.id).kind === "document")
			throw new DOMException(
				"Documents cannot be imported",
				"NotSupportedError",
			);
		return this.node(this.tree.copyFrom(source.tree, source.id, deep));
	}
	private identify(value: unknown) {
		const id =
			value && typeof value === "object"
				? this.identities.get(value)
				: undefined;
		if (id === undefined)
			throw new AgentBrowserError(
				"invalid-input",
				"Expected a node from this script document",
			);
		this.read(id);
		return id;
	}
	private sibling(id: number, direction: number) {
		const parent = this.read(id).parent;
		if (parent === null) return null;
		const siblings = this.read(parent).children;
		return this.optional(siblings[siblings.indexOf(id) + direction]);
	}
	private write(values: readonly unknown[], newline: boolean) {
		this.read(this.tree.root);
		const parts: string[] = [];
		let length = newline ? 1 : 0;
		for (const value of values) {
			const text = domString(value);
			length += text.length;
			if (length > this.tree.limits.maxTextCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Document write text limit exceeded",
				);
			parts.push(text);
		}
		writeDocument(this.tree, parts.join("") + (newline ? "\n" : ""));
	}
	private attribute(id: number, name: string) {
		return {
			get: () => this.read(id).attributes[name] ?? "",
			set: (value: unknown) => {
				this.read(id);
				this.tree.setAttribute(id, name, domString(value));
			},
		};
	}
	private setValue(id: number, value: unknown) {
		const node = this.read(id);
		const text = value === null ? "" : domString(value);
		if (node.tagName === "textarea") {
			this.tree.setControl(id, { value: text.replace(/\r\n?/g, "\n") });
			return;
		}
		const type = inputType(node);
		if (type === "file") {
			if (text !== "")
				throw new DOMException(
					"File input values can only be cleared",
					"InvalidStateError",
				);
			existingDocumentFiles(this.tree)?.clear(id);
			this.tree.clearControl(id, ["value"]);
			return;
		}
		if (
			[
				"checkbox",
				"radio",
				"hidden",
				"submit",
				"image",
				"reset",
				"button",
			].includes(type)
		) {
			this.tree.setAttribute(id, "value", text);
			return;
		}
		if (
			![
				"text",
				"search",
				"tel",
				"url",
				"email",
				"password",
				"number",
				"range",
				"date",
				"month",
				"week",
				"time",
				"datetime-local",
			].includes(type)
		)
			throw new AgentBrowserError(
				"unsupported",
				"This input value mode is not implemented for scripts",
			);
		this.tree.setControl(id, {
			value: sanitizeInputValue(type, text, node.attributes),
		});
	}
}

function inertCoordinate(value: unknown): number {
	if (
		value !== null &&
		(typeof value === "object" || typeof value === "function")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object-to-coordinate conversion is not implemented",
		);
	return +(value as number);
}

export function domString(value: unknown): string {
	if (
		value !== null &&
		(typeof value === "object" ||
			typeof value === "function" ||
			typeof value === "symbol")
	)
		throw new AgentBrowserError(
			"unsupported",
			"Object-to-DOM-string conversion is not implemented",
		);
	return String(value);
}
