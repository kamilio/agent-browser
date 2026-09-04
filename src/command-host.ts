import { rangeKeyboardCapabilities } from "./range-keyboard.js";
import { SessionTrace, sessionTraceCapabilities } from "./session-trace.js";
import { keyboardActivationCapabilities } from "./keyboard.js";
import { keyboardScrollCapabilities } from "./keyboard-scroll.js";
import { selectKeyboardCapabilities } from "./select-keyboard.js";
import { mouseCapabilities, type MouseButton } from "./mouse.js";
import {
	clickActionabilityCapabilities,
	hoverActionabilityCapabilities,
} from "./click-target.js";
import { type WaitingAction, runWhenActionable } from "./action-wait.js";
import { imageMediaTypes } from "./image-decoder.js";
import {
	CaptureArtifacts,
	captureArtifactLimits,
} from "./capture-artifacts.js";
import { type Invocation, parseInvocation } from "./cli-parser.js";
import { commands } from "./commands.js";
import {
	cookieCommandOptions,
	executeCookieCommand,
} from "./cookie-commands.js";
import { cssBoxProperties } from "./css-box.js";
import { cssVariableCapabilities } from "./css-variables.js";
import { inlineDeclarationLimits } from "./document-inline-declarations.js";
import { pageCssLimits } from "./page-css.js";
import { cssSupportsLimits } from "./css-supports.js";
import { selectorSyntaxLimits } from "./selectors.js";
import { interactionStyleCapabilities } from "./css-interaction.js";
import { documentHitTesting, hitTestCapabilities } from "./hit-testing.js";
import {
	scrollIntoViewCapabilities,
	scrollIntoViewOptions,
} from "./scroll-into-view.js";
import {
	documentScrollPosition,
	viewportScrollCapabilities,
} from "./document-scroll.js";
import { pageScrollCapabilities } from "./page-scroll.js";
import { rootScrollCapabilities } from "./root-scroll.js";
import { elementScrollCapabilities } from "./element-scroll.js";
import { elementOffsetCapabilities } from "./element-offsets.js";
import {
	computedStyleLimits,
	computedStyleProperties,
} from "./computed-styles.js";
import { cssPaintProperties } from "./css-paint.js";
import { cssTextProperties } from "./css-text.js";
import { documentGeometry } from "./document-geometry.js";
import { documentImages, documentImageLimits } from "./document-images.js";
import { rasterizeDocument } from "./document-raster.js";
import { renderDocumentPdf, documentPdfLimits } from "./document-pdf.js";
import { inspectDom } from "./dom-inspection.js";
import { AgentBrowserError } from "./errors.js";
import {
	documentElementSizes,
	elementSizeLimits,
	elementSizeProperties,
} from "./element-sizes.js";
import { type ExtractionOptions, extractDocument } from "./extraction.js";
import { serializeHtml } from "./html-serialization.js";
import {
	generateLocator,
	locatorGenerationLimits,
} from "./locator-generation.js";
import { readPageConsole } from "./page-console.js";
import {
	animationFrameLimits,
	animationFrameIntervalMs,
} from "./page-animation-frames.js";
import { pageClockPrecisionMs } from "./page-performance.js";
import { encodePng } from "./png.js";
import type { ScriptEvaluation } from "./safejs.js";
import { scriptMutationLimits } from "./script-mutations.js";
import { characterDataCapabilities } from "./script-character-data.js";
import { nodeRelationCapabilities } from "./node-relations.js";
import { scriptGeometryLimits } from "./script-geometry.js";
import { BrowserSession, type SessionPage } from "./session.js";
import { findInDocument } from "./snapshot-search.js";
import {
	type SemanticSnapshot,
	diffSnapshots,
	renderSnapshot,
} from "./snapshot.js";
import { StateTransfers } from "./state-transfer.js";
import { resolveBrowserTarget } from "./target-locator.js";
import { textLocatorLimits } from "./text-locator.js";
import { resolveVisualTarget } from "./generated-controls.js";
import { generatedControlStyle } from "./generated-style.js";
import type { DocumentFileSelections } from "./control-files.js";
import { executeUploadCommand } from "./upload-commands.js";
import {
	uploadCommandSchemas,
	uploadProtocolLimits,
	uploadRequest,
	type UploadTransferInfo,
} from "./upload-protocol.js";
import { UploadTransfers } from "./upload-transfers.js";

export const uploadSessionLimits = Object.freeze({
	maxSelectedBytes: 67_108_864,
	maxStagedBytes: 33_554_432,
	maxTransfers: 8,
});

interface UploadSessionState {
	owners: Map<
		string,
		{ owner: DocumentFileSelections; unsubscribe: () => void }
	>;
	transfers: Map<
		string,
		{ documentId: string; bytes: number; expiresAt: number }
	>;
}

const uploadNames = new Set<string>(
	uploadCommandSchemas.map((schema) => schema.name),
);

function uploadFailure(error: unknown) {
	return new AgentBrowserError(
		error instanceof AgentBrowserError ? error.code : "invalid-input",
		"Upload command failed",
	);
}

export interface CommandHostOptions {
	uploadLimits?: ConstructorParameters<typeof UploadTransfers>[0];
	uploadSessionLimits?: Partial<
		Record<keyof typeof uploadSessionLimits, number>
	>;
	websiteScripts?: boolean;
	pageFetch?: boolean;
	createSession: (name: string) => BrowserSession;
	evaluatePage?: (
		page: SessionPage,
		source: string,
		signal: AbortSignal,
	) => Promise<ScriptEvaluation>;
	maxSessions?: number;
	maxPendingCommands?: number;
	maxCommands?: number;
	timeoutMs?: number;
	maxSnapshotCacheBytes?: number;
	documentFormats?: readonly string[];
}

export interface CommandRequestOptions {
	session?: string;
	signal?: AbortSignal;
}

export interface CommandResult {
	schemaVersion: 1;
	command: string;
	session: string;
	data: unknown;
}

export interface CommandExecutor {
	execute(
		argv: readonly string[],
		options?: CommandRequestOptions,
	): Promise<CommandResult>;
	close(): void | Promise<void>;
}

interface SessionEntry {
	name: string;
	browser: BrowserSession;
	tail: Promise<void>;
	controllers: Set<AbortController>;
	trace?: SessionTrace;
}

const ownedSessions = new WeakSet<BrowserSession>();
const frontendCommands = new Set([
	"state-save",
	"state-load",
	"serve",
	"stop-server",
	"playground",
	"terminal",
]);

const supportedOptions: Readonly<Record<string, readonly string[]>> = {
	...Object.fromEntries(
		uploadCommandSchemas.map((schema) => [schema.name, []]),
	),
	...cookieCommandOptions,
	"state-export": [],
	"state-import-begin": [],
	"state-import-append": [],
	"state-import-commit": [],
	"state-transfer-read": [],
	"state-transfer-delete": [],
	open: [],
	goto: [],
	close: [],
	reload: [],
	"go-back": [],
	"go-forward": [],
	"tab-new": [],
	"tab-close": ["expected-key"],
	"tab-select": ["expected-key"],
	"tab-list": [],
	click: [],
	dblclick: [],
	hover: [],
	fill: ["submit"],
	type: [],
	press: ["target", "expected-viewport", "expected-document"],
	keydown: [],
	keyup: [],
	mousemove: [],
	mousedown: [],
	mouseup: [],
	mousewheel: ["expected-viewport", "expected-document"],
	resize: ["expected-tab", "expected-viewport"],
	viewport: [],
	styles: [],
	geometry: [],
	"scroll-into-view": ["block", "inline", "behavior", "container"],
	"hit-test": [],
	screenshot: ["hires"],
	pdf: [],
	"tracing-start": [],
	"tracing-stop": [],
	"tracing-status": [],
	"artifact-list": [],
	"artifact-read": ["offset", "length"],
	"artifact-delete": [],
	select: [],
	check: [],
	uncheck: [],
	snapshot: ["depth", "diff", "max-bytes", "observe"],
	find: ["regex", "max-results", "context", "max-bytes"],
	"generate-locator": ["raw"],
	text: [],
	html: ["max-code-units"],
	dom: ["depth", "max-nodes", "max-code-units"],
	extract: ["format", "max-bytes", "max-nodes", "depth"],
	requests: [],
	images: [],
	request: [],
	route: ["status", "body", "content-type", "header", "headers"],
	"route-list": [],
	unroute: [],
	"localstorage-list": [],
	"localstorage-get": [],
	"localstorage-set": [],
	"localstorage-delete": [],
	"localstorage-clear": [],
	"sessionstorage-list": [],
	"sessionstorage-get": [],
	"sessionstorage-set": [],
	"sessionstorage-delete": [],
	"sessionstorage-clear": [],
	"cookie-clear": [],
	list: [],
	"close-all": [],
	metrics: [],
	capabilities: [],
	help: [],
};

function cancellation(signal: AbortSignal) {
	return signal.reason instanceof AgentBrowserError
		? signal.reason
		: new AgentBrowserError("aborted", "Command aborted");
}

function abortable<Result>(
	work: Promise<Result>,
	signal: AbortSignal,
): Promise<Result> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(cancellation(signal));
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
		work
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

export class BrowserCommandHost {
	private readonly uploadTransfers: UploadTransfers;
	private readonly uploadSessions = new Map<string, UploadSessionState>();
	private readonly uploadSessionLimits;
	private readonly artifacts = new CaptureArtifacts();
	private readonly stateTransfers = new StateTransfers();
	private sessions = new Map<string, SessionEntry>();
	private snapshots = new Map<
		string,
		{ snapshot: SemanticSnapshot; bytes: number }
	>();
	private cachedBytes = 0;
	private pending = 0;
	private executed = 0;
	private closed = false;
	private readonly limits;
	private readonly formats: readonly string[];
	private readonly createSession: CommandHostOptions["createSession"];
	private readonly evaluatePage: CommandHostOptions["evaluatePage"];
	private readonly websiteScripts: boolean;
	private readonly pageFetch: boolean;

	constructor(options: CommandHostOptions) {
		if (!options || typeof options.createSession !== "function")
			throw new AgentBrowserError(
				"invalid-input",
				"A command host requires a session factory",
			);
		this.uploadSessionLimits = Object.freeze({
			...uploadSessionLimits,
			...options.uploadSessionLimits,
		});
		for (const key of Object.keys(
			uploadSessionLimits,
		) as (keyof typeof uploadSessionLimits)[])
			if (
				!Number.isSafeInteger(this.uploadSessionLimits[key]) ||
				this.uploadSessionLimits[key] < 1 ||
				this.uploadSessionLimits[key] > uploadSessionLimits[key]
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Invalid upload session limits",
				);
		this.uploadTransfers = new UploadTransfers(options.uploadLimits);
		this.limits = Object.freeze({
			maxSessions: options.maxSessions ?? 8,
			maxPendingCommands: options.maxPendingCommands ?? 64,
			maxCommands: options.maxCommands ?? 10_000,
			timeoutMs: options.timeoutMs ?? 30_000,
			maxSnapshotCacheBytes: options.maxSnapshotCacheBytes ?? 1_048_576,
		});
		for (const [name, value] of Object.entries(this.limits))
			if (
				!Number.isSafeInteger(value) ||
				value < 1 ||
				value >
					(name === "maxSnapshotCacheBytes"
						? 16_777_216
						: name === "timeoutMs"
							? 300_000
							: name === "maxCommands"
								? 1_000_000
								: 256)
			)
				throw new AgentBrowserError(
					"invalid-input",
					`Invalid command host limit: ${name}`,
				);
		const formats = options.documentFormats ?? [];
		if (
			!Array.isArray(formats) ||
			formats.length > 32 ||
			formats.some((value) => typeof value !== "string" || value.length > 128)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid document format capabilities",
			);
		this.formats = Object.freeze([...formats]);
		this.createSession = options.createSession;
		if (
			options.evaluatePage !== undefined &&
			typeof options.evaluatePage !== "function"
		)
			throw new AgentBrowserError("invalid-input", "Invalid page evaluator");
		this.evaluatePage = options.evaluatePage;
		if (
			(options.websiteScripts !== undefined &&
				typeof options.websiteScripts !== "boolean") ||
			(options.websiteScripts && !options.evaluatePage)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Website scripts require an explicit page evaluator",
			);
		this.websiteScripts = options.websiteScripts ?? false;
		if (
			(options.pageFetch !== undefined &&
				typeof options.pageFetch !== "boolean") ||
			(options.pageFetch && !options.evaluatePage)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Page fetch requires an explicit page evaluator",
			);
		this.pageFetch = options.pageFetch ?? false;
	}

	capabilities() {
		return {
			apiVersion: 1,
			engine: "independent-typescript",
			documentFormats: this.formats,
			websiteJavaScript: this.websiteScripts,
			domMutations: {
				partial: true,
				parentNode: ["append", "prepend", "replaceChildren"],
				childNode: ["before", "after", "replaceWith", "remove"],
				element: ["insertAdjacentElement", "insertAdjacentText"],
				adjacentPositions: [
					"beforebegin",
					"afterbegin",
					"beforeend",
					"afterend",
				],
				replaceChild: true,
				maxArguments: scriptMutationLimits.maxArguments,
				objectStringCoercion: false,
				crossDocumentAdoption: false,
				mutationObservers: false,
			},
			htmlInsertion: {
				partial: true,
				innerHTML: true,
				outerHTML: true,
				insertAdjacentHTML: [
					"beforebegin",
					"afterbegin",
					"beforeend",
					"afterend",
				],
				insertedScripts: "inert",
				trustedTypes: false,
				sanitization: false,
			},
			domTokens: {
				partial: true,
				classList: true,
				indexed: true,
				iteration: true,
				valueAssignment: true,
				forEach: false,
				iteratorMethods: false,
			},
			pageUrls: {
				location: "session-owned",
				baseURI: true,
				hyperlinkComponents: true,
				resourceAttributes: true,
				locationNavigation: true,
				globalLocationAssignment: false,
				fragmentWrites: "synchronous-url-deferred-events",
				historyBindings: true,
			},
			pageStorage: {
				partial: true,
				localStorage: true,
				sessionStorage: true,
				documentCookie: true,
				namedProperties: false,
				storageEvents: true,
				eventScheduling: "bounded-session-task-queue",
				persistence: "in-memory-session-lifetime",
			},
			pageHistory: {
				partial: true,
				state: "finite-json",
				pushState: true,
				replaceState: true,
				length: "session-wide",
				guestTraversal: true,
				traversalScheduling: "bounded-session-task-queue",
				stateIdentity: false,
			},
			routing: {
				enabled: true,
				partial: true,
				scope: "session",
				fulfillment: true,
				redirectFulfillment: true,
				requestRewriting: false,
				transportRedirectHops: "adapter-dependent",
			},
			scriptLoading: {
				mode: this.websiteScripts ? "classic" : "disabled",
				partial: true,
				modules: false,
				dynamicInsertion: false,
				documentWrite: {
					mode: this.websiteScripts ? "parser-blocking-subset" : "disabled",
					nestedInline: false,
					documentReplacement: false,
				},
			},
			domInspection: {
				partial: true,
				scoped: true,
				hiddenNodes: true,
				passwordFileValuesRedacted: true,
				layout: false,
			},
			locators: {
				partial: true,
				methods: [
					"locator",
					"getByRole",
					"getByTestId",
					"getByText",
					"getByLabel",
					"getByPlaceholder",
					"getByAltText",
					"getByTitle",
				],
				roleOptions: ["name", "exact"],
				textOptions: ["exact"],
				textLimits: textLocatorLimits,
				textAndLabelIncludeHidden: true,
				regularExpressions: false,
				chaining: false,
				autoWait: true,
			},
			rangeKeyboard: rangeKeyboardCapabilities,
			actionWaiting: {
				partial: true,
				commands: [
					"click",
					"dblclick",
					"hover",
					"fill",
					"select",
					"check",
					"uncheck",
				],
				intervalMs: 25,
				maxPolls: 2048,
				stableLayout: false,
				hitTesting: true,
				hitTestCommands: ["click", "dblclick", "hover"],
				replayActions: false,
			},
			clickActionability: {
				...clickActionabilityCapabilities,
				commands: ["click", "dblclick"],
			},
			hoverActionability: hoverActionabilityCapabilities,
			snapshotSearch: {
				partial: true,
				streaming: true,
				maxDocumentNodes: 50_000,
				maxStringLength: 4096,
				literalCaseSensitive: true,
				context: 3,
				maxPatternCodeUnits: 1024,
				maxStates: 2048,
				maxWork: 4_000_000,
				regex: {
					engine: "bounded-nfa",
					flags: ["i", "m", "s"],
					ignoreCase: "ascii",
					backreferences: false,
					lookarounds: false,
				},
			},
			locatorGeneration: { partial: true, ...locatorGenerationLimits },
			pageEvaluation: !!this.evaluatePage,
			tracing: sessionTraceCapabilities,
			pageFetch: {
				enabled: this.pageFetch,
				partial: true,
				sameOrigin: true,
				cors: true,
				preflightCache: false,
				requestBodies: ["string"],
				responseBodies: ["text", "json"],
				streaming: false,
				abortSignal: false,
			},
			pageTimers: {
				enabled: !!this.evaluatePage,
				partial: true,
				methods: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"],
				stringHandlers: false,
			},
			pageConsole: {
				enabled: !!this.evaluatePage,
				partial: true,
				methods: [
					"log",
					"info",
					"debug",
					"warn",
					"error",
					"dir",
					"assert",
					"clear",
				],
			},
			cssVisibility: {
				partial: true,
				properties: ["display", "visibility"],
				layout: false,
			},
			cssBox: {
				partial: true,
				properties: cssBoxProperties,
				usedGeometry: false,
				fontRelativeLengths: false,
			},
			browserEngineDependency: false,
			interactionStyles: interactionStyleCapabilities,
			viewportScrolling: viewportScrollCapabilities,
			pageScrolling: pageScrollCapabilities,
			computedStyles: {
				partial: true,
				methods: ["getComputedStyle", "window.getComputedStyle"],
				properties: computedStyleProperties,
				live: true,
				readonly: true,
				usedValues: "normal-flow-block-and-inline",
				pseudoElements: false,
				customProperties: false,
				...computedStyleLimits,
			},
			clientGeometry: {
				partial: true,
				profile: "normal-flow-client-rects",
				methods: ["getClientRects", "getBoundingClientRect"],
				command: "geometry",
				scroll: "root-viewport",
				domRectConstructors: false,
				blockInInline: false,
				inlineEdges: "ltr-sliced-margin-padding",
				...scriptGeometryLimits,
			},
			characterData: characterDataCapabilities,
			nodeRelations: nodeRelationCapabilities,
			elementOffsets: elementOffsetCapabilities,
			rootElementScrolling: rootScrollCapabilities,
			elementScrolling: elementScrollCapabilities,
			scrollIntoView: scrollIntoViewCapabilities,
			hitTesting: hitTestCapabilities,
			mouse: { ...mouseCapabilities, doubleClick: true },
			uploads: {
				partial: true,
				commands: uploadCommandSchemas.map((schema) => schema.name),
				captureBeforeRead: true,
				documentOwned: true,
				chunkBytes: uploadProtocolLimits.maxChunkBytes,
				limits: this.uploadTransfers.limits,
				sessionLimits: this.uploadSessionLimits,
				events: ["input", "change"],
				serverFilesystem: false,
				guestFileFileList: false,
				liveUploadAcceptance: false,
			},
			keyboard: {
				partial: true,
				activation: keyboardActivationCapabilities,
				commands: ["type", "press", "keydown", "keyup"],
				targetedPress: true,
				select: selectKeyboardCapabilities,
				scrolling: keyboardScrollCapabilities,
				heldKeys: true,
				repeat: true,
				maxHeldKeys: 64,
				stateScope: "document",
				modifiers: ["Shift", "Control", "Alt", "Meta"],
				platformShortcuts: false,
				clipboard: false,
				ime: false,
			},
			elementSizes: {
				partial: true,
				properties: elementSizeProperties,
				profile: "normal-flow-no-quirks-no-scrollbars",
				readonly: true,
				offsetPositions: false,
				scrollSizes: false,
				...elementSizeLimits,
			},
			animationFrames: {
				partial: true,
				profile: "software-frame-opportunities",
				methods: ["requestAnimationFrame", "cancelAnimationFrame"],
				intervalMs: animationFrameIntervalMs,
				automaticPaint: false,
				...animationFrameLimits,
			},
			performance: {
				partial: true,
				methods: ["now", "toJSON"],
				properties: ["timeOrigin"],
				precisionMs: pageClockPrecisionMs,
				timeline: false,
			},
			screenshots: {
				compression: "bounded-fixed-huffman-or-stored",
				partial: true,
				format: "image/png",
				profile: "normal-flow-solid-colors",
				deviceScaleFactor: 1,
				viewport: true,
				element: "normal-flow-block-or-wrapped-inline",
				transport: "artifact-chunks",
				filename: "node-cli-client-only",
				...captureArtifactLimits,
			},
			pdf: {
				partial: true,
				profile: "normal-flow-paginated-raster-text",
				mediaType: "application/pdf",
				searchableText: true,
				printMedia: false,
				pagination: "viewport-height-with-uncut-text",
				transport: "artifact-chunks",
				...documentPdfLimits,
			},
			cssPaint: {
				partial: true,
				properties: cssPaintProperties,
				backgroundShorthand: "solid-color-or-none",
				nonColorBackgroundComponents:
					"initial-values-and-css-wide-keywords-only",
				colorSpace: "srgb-8bit",
			},
			cssText: {
				partial: true,
				properties: cssTextProperties,
				font: "Agent Mono",
				pageGeometry: false,
			},
			cssVariables: cssVariableCapabilities,
			cssUtilities: {
				partial: true,
				escape: true,
				supports: true,
				supportsProfile: "native-declaration-values-and-conditions",
				selectorQueries: true,
				selectorProfile: "single-complex-native-selector",
				selectorLimits: selectorSyntaxLimits,
				supportsLimits: cssSupportsLimits,
				limits: pageCssLimits,
			},
			inlineDeclarations: {
				partial: true,
				profile: "document-owned-inline-declarations",
				preservesDeclarationOrder: true,
				allReset: "supported-native-longhands",
				limits: inlineDeclarationLimits,
			},
			mediaQueries: {
				partial: true,
				matchMedia: true,
				changeEvents: true,
				resizeEvents: true,
				windowDimensions: true,
				profile: "bounded-viewport-ranges-and-conditions",
				features: [
					"width",
					"height",
					"orientation",
					"aspect-ratio",
					"resolution",
				],
				compiledPageQueries: true,
				globalDimensionAccessors: false,
				functionAliasIdentity: "not-guaranteed-by-selected-runtime",
			},
			imageResources: {
				partial: true,
				formats: imageMediaTypes,
				jpeg: {
					precision: 8,
					frames: ["baseline", "extended-sequential", "progressive"],
					entropy: "huffman",
					colorSpaces: ["grayscale", "rgb", "ycbcr"],
					chromaUpsampling: "centered-bilinear",
					exifOrientation: false,
				},
				inspection: true,
				pageState: true,
				decode: true,
				events: true,
				sharedRequests: true,
				limits: documentImageLimits,
				layout: true,
				painting: true,
				layoutProfile: "loaded-images-normal-flow-inline-and-block",
				scaling: "nearest-neighbor",
				responsiveSources: false,
				corsAttributes: false,
				colorManagement: false,
			},
			viewport: {
				partial: true,
				inspection: true,
				expectedTabGuard: true,
				expectedViewportGuard: true,
				deviceEmulation: false,
			},
			fullPlaywrightCliSuperset: false,
			limitations: [
				"HTML support depends on the loader; the built-in HTML parser is partial",
				this.websiteScripts
					? "Classic page scripts and normal-flow CSS are partial; modules, many DOM APIs and general layout remain unimplemented"
					: "Automatic website JavaScript is disabled; CSS layout supports only a restricted normal-flow profile",
				"Cross-document back/forward, submission and non-self navigation targets are incomplete",
				"Disk profile persistence and full locator/action semantics are incomplete; artifact file writes currently cover native PNG only",
			],
			commands: Array.from(commands.keys(), (name) => ({
				name,
				status: frontendCommands.has(name)
					? "frontend"
					: this.commandOptions(name) !== undefined
						? "partial"
						: "unsupported",
				options: this.commandOptions(name) ?? [],
			})),
			limits: this.limits,
		};
	}

	metrics() {
		return Object.freeze({
			sessions: this.sessions.size,
			pendingCommands: this.pending,
			executedCommands: this.executed,
			cachedSnapshotBytes: this.cachedBytes,
			captureArtifacts: this.artifacts.metrics(),
			stateTransfers: this.stateTransfers.metrics(),
			uploads: this.uploadTransfers.metrics(),
			closed: this.closed,
		});
	}

	async execute(
		argv: readonly string[],
		options: CommandRequestOptions = {},
	): Promise<CommandResult> {
		if (this.closed)
			throw new AgentBrowserError("closed", "Command host is closed");
		if (
			!Array.isArray(argv) ||
			argv.length > 256 ||
			argv.some((argument) => typeof argument !== "string")
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Command arguments must be a bounded string array",
			);
		if (
			!options ||
			(options.signal !== undefined && !(options.signal instanceof AbortSignal))
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Invalid command request options",
			);
		let invocation: Invocation;
		try {
			invocation = parseInvocation([...argv], {
				AGENT_BROWSER_SESSION: options.session,
			});
		} catch (error) {
			if (argv.some((argument) => uploadNames.has(argument)))
				throw uploadFailure(error);
			throw error;
		}
		const upload = uploadNames.has(invocation.command);
		if (
			upload &&
			options.session !== undefined &&
			invocation.session !== options.session
		)
			throw new AgentBrowserError("policy-denied", "Upload session mismatch");
		const result = (data: unknown): CommandResult => ({
			schemaVersion: 1,
			command: invocation.command,
			session: invocation.session,
			data,
		});
		if (options.signal?.aborted)
			throw new AgentBrowserError("aborted", "Command aborted");
		if (invocation.options.version)
			return result({ version: "0.1.0", engine: "independent-typescript" });
		if (invocation.command === "help" || invocation.options.help)
			return result(
				this.help(
					invocation.command === "help"
						? invocation.arguments[0]
						: invocation.command,
				),
			);
		this.validateInvocation(invocation);
		if (invocation.command === "capabilities")
			return result(this.capabilities());
		if (invocation.command === "list")
			return result(
				Array.from(this.sessions.values(), (entry) => ({
					name: entry.name,
					tabs: this.tabList(entry.browser),
					metrics: entry.browser.metrics(),
				})),
			);
		if (invocation.command === "close-all") {
			for (const entry of [...this.sessions.values()]) this.closeEntry(entry);
			return result({ closed: true });
		}
		if (invocation.command === "close") {
			const entry = this.sessions.get(invocation.session);
			if (entry) this.closeEntry(entry);
			return result({ closed: true });
		}
		if (
			this.pending >= this.limits.maxPendingCommands ||
			this.executed >= this.limits.maxCommands
		)
			throw new AgentBrowserError(
				"resource-limit",
				"Command host limit exceeded",
			);
		let entry = this.sessions.get(invocation.session);
		if (!entry && invocation.command === "open") {
			if (this.sessions.size >= this.limits.maxSessions)
				throw new AgentBrowserError(
					"resource-limit",
					"Named session limit exceeded",
				);
			const browser = this.createSession(invocation.session);
			if (ownedSessions.has(browser))
				throw new AgentBrowserError(
					"invalid-input",
					"Session factory returned an already owned session",
				);
			if (!(browser instanceof BrowserSession) || browser.metrics().closed)
				throw new AgentBrowserError(
					"invalid-input",
					"Session factory must return a live browser session",
				);
			if (this.closed || this.sessions.size >= this.limits.maxSessions) {
				browser.close();
				throw new AgentBrowserError(
					"resource-limit",
					"Session creation is no longer allowed",
				);
			}
			ownedSessions.add(browser);
			entry = {
				name: invocation.session,
				browser,
				tail: Promise.resolve(),
				controllers: new Set(),
			};
			this.sessions.set(entry.name, entry);
		}
		if (!entry)
			throw new AgentBrowserError(
				"not-found",
				"No named session; run open first",
			);
		const activeEntry = entry;
		const controller = new AbortController();
		const signal = controller.signal;
		const inputSignal = options.signal;
		const abort = () =>
			controller.abort(new AgentBrowserError("aborted", "Command aborted"));
		const timeoutMs = Number(
			invocation.options.timeout ?? this.limits.timeoutMs,
		);
		const timer = setTimeout(
			() =>
				controller.abort(
					new AgentBrowserError("timeout", "Command deadline exceeded"),
				),
			timeoutMs,
		);
		const cleanup = () => {
			clearTimeout(timer);
			inputSignal?.removeEventListener("abort", abort);
		};
		signal.addEventListener("abort", cleanup, { once: true });
		inputSignal?.addEventListener("abort", abort, { once: true });
		activeEntry.controllers.add(controller);
		this.pending++;
		this.executed++;
		const work = activeEntry.tail
			.then(async () => {
				if (signal.aborted) throw cancellation(signal);
				if (this.closed || this.sessions.get(activeEntry.name) !== activeEntry)
					throw new AgentBrowserError("closed", "Named session is closed");
				const trace = /^(tracing-|artifact-)/.test(invocation.command)
					? undefined
					: activeEntry.trace;
				const startedAt = performance.now();
				try {
					const value = await this.run(activeEntry, invocation, signal);
					if (upload) invocation.arguments.fill("[redacted]");
					trace?.record(
						invocation.command,
						Math.max(0, performance.now() - startedAt),
						signal.aborted ? "interrupted" : "returned",
						signal.aborted ? cancellation(signal) : undefined,
					);
					return result(value);
				} catch (error) {
					if (upload) invocation.arguments.fill("[redacted]");
					const failure = upload ? uploadFailure(error) : error;
					trace?.record(
						invocation.command,
						Math.max(0, performance.now() - startedAt),
						signal.aborted ? "interrupted" : "threw",
						signal.aborted ? cancellation(signal) : failure,
					);
					throw failure;
				}
			})
			.finally(() => {
				cleanup();
				signal.removeEventListener("abort", cleanup);
				activeEntry.controllers.delete(controller);
				this.pending--;
			});
		activeEntry.tail = work.then(
			() => {},
			() => {},
		);
		return abortable(work, signal);
	}

	close() {
		if (this.closed) return;
		this.closed = true;
		try {
			for (const entry of [...this.sessions.values()]) this.closeEntry(entry);
		} finally {
			this.uploadTransfers.close();
		}
	}

	private closeEntry(entry: SessionEntry) {
		const uploads = this.uploadSessions.get(entry.name);
		for (const binding of uploads?.owners.values() ?? []) binding.unsubscribe();
		this.uploadSessions.delete(entry.name);
		this.uploadTransfers.detach(entry.name);
		this.stateTransfers.clear(entry.browser);
		this.sessions.delete(entry.name);
		entry.trace?.close();
		this.artifacts.clear(entry.name);
		for (const controller of entry.controllers)
			controller.abort(
				new AgentBrowserError("closed", "Named session is closed"),
			);
		entry.browser.close();
		for (const [key, cached] of this.snapshots)
			if (key.startsWith(`${entry.name}/`)) {
				this.snapshots.delete(key);
				this.cachedBytes -= cached.bytes;
			}
	}

	private help(name?: string) {
		if (name !== undefined && !commands.has(name))
			throw new AgentBrowserError("invalid-input", "Unknown help command");
		return {
			usage: "agent-browser [-s=name] <command> [arguments] [--json]",
			currentScope:
				"Independent browser core; HTML/JavaScript and full CLI parity are incomplete",
			commands: Array.from(commands.values())
				.filter((command) => !name || command.name === name)
				.map((command) => ({
					...command,
					availableOptions: this.commandOptions(command.name) ?? [],
					status: frontendCommands.has(command.name)
						? "frontend"
						: this.commandOptions(command.name) !== undefined
							? "partial"
							: "unsupported",
				})),
		};
	}

	private commandOptions(name: string) {
		return ["eval", "console"].includes(name) && this.evaluatePage
			? []
			: supportedOptions[name];
	}

	validateInvocation(invocation: Invocation) {
		if (invocation.options.raw && invocation.options.json)
			throw new AgentBrowserError(
				"invalid-input",
				"Choose either raw or JSON output",
			);
		if (invocation.command === "eval" && invocation.arguments[1] !== undefined)
			throw new AgentBrowserError(
				"unsupported",
				"Element-scoped evaluation is not implemented",
			);
		if (
			invocation.command === "snapshot" &&
			invocation.options.observe &&
			invocation.options.diff
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Observer snapshots cannot consume diffs",
			);
		const supported = this.commandOptions(invocation.command);
		if (!supported)
			throw new AgentBrowserError(
				"unsupported",
				`Command is not implemented: ${invocation.command}`,
			);
		for (const key of Object.keys(invocation.options))
			if (!["json", "help", "version", "timeout", ...supported].includes(key))
				throw new AgentBrowserError(
					"unsupported",
					`Option is not implemented: --${key}`,
				);
		if (
			invocation.options.timeout !== undefined &&
			(Number(invocation.options.timeout) < 1 ||
				Number(invocation.options.timeout) > 300_000)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Command timeout must be between 1 and 300000 milliseconds",
			);
		if (
			(invocation.command === "click" || invocation.command === "dblclick") &&
			invocation.arguments[1] !== undefined &&
			invocation.arguments[1] !== "left"
		)
			throw new AgentBrowserError(
				"unsupported",
				"Only left-button activation is implemented",
			);
	}

	private tabList(browser: BrowserSession) {
		return browser.tabs().map((tab, index) => ({
			index,
			...tab,
			key: browser.viewport(tab.id).key,
		}));
	}

	private activeTab(browser: BrowserSession) {
		const tab = browser.tabs().find((candidate) => candidate.selected);
		if (!tab)
			throw new AgentBrowserError("not-found", "Session has no selected tab");
		return tab.id;
	}

	private checkTabKey(browser: BrowserSession, tab: string, expected: unknown) {
		if (expected === undefined) return;
		if (
			typeof expected !== "string" ||
			expected.length === 0 ||
			expected.length > 256
		)
			throw new AgentBrowserError("invalid-input", "Invalid expected tab key");
		if (expected !== browser.viewport(tab).key)
			throw new AgentBrowserError(
				"stale-reference",
				"Tab or session changed before the operation",
			);
	}

	private indexedTab(browser: BrowserSession, value: string) {
		if (!/^(0|[1-9][0-9]*)$/.test(value))
			throw new AgentBrowserError(
				"invalid-input",
				"Tab must be a zero-based index",
			);
		const tab = browser.tabs()[Number(value)];
		if (!tab)
			throw new AgentBrowserError("not-found", "Tab index does not exist");
		return tab.id;
	}

	private target(browser: BrowserSession, tabId: string, value: string) {
		const page = browser.page(tabId);
		return resolveBrowserTarget(page.document, page.queries, value);
	}

	private async uploadCommand(
		entry: SessionEntry,
		invocation: Invocation,
		signal: AbortSignal,
	) {
		const args = invocation.arguments;
		let state = this.uploadSessions.get(entry.name);
		if (invocation.command === "upload-cancel") {
			entry.browser.tabs();
			const result = await executeUploadCommand(
				this.uploadTransfers,
				entry.name,
				[invocation.command, ...args],
				signal,
			);
			if (state?.transfers.get(args[1])?.documentId === args[0])
				state.transfers.delete(args[1]);
			return result.data;
		}
		const tab = this.activeTab(entry.browser);
		const context = entry.browser.uploadContext(tab);
		const owner = context.owner;
		if (!state) {
			state = { owners: new Map(), transfers: new Map() };
			this.uploadSessions.set(entry.name, state);
		}
		if (!state.owners.has(owner.documentId)) {
			const selected = [...state.owners.values()].reduce(
				(bytes, binding) => bytes + binding.owner.limits.maxTotalBytes,
				0,
			);
			if (
				selected + owner.limits.maxTotalBytes >
				this.uploadSessionLimits.maxSelectedBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Upload session selection reservation exceeded",
				);
		}
		if (!state.owners.has(owner.documentId)) {
			const current = state;
			const unsubscribe = owner.onInvalidate((reason) => {
				for (const [id, transfer] of current.transfers)
					if (transfer.documentId === owner.documentId)
						current.transfers.delete(id);
				if (reason === "close") current.owners.delete(owner.documentId);
			});
			try {
				this.uploadTransfers.attach(entry.name, owner, context.run);
				state.owners.set(owner.documentId, { owner, unsubscribe });
			} catch (error) {
				unsubscribe();
				throw error;
			}
		} else this.uploadTransfers.attach(entry.name, owner, context.run);
		for (const [id, transfer] of state.transfers)
			if (transfer.expiresAt <= performance.now()) state.transfers.delete(id);
		if (invocation.command === "upload-begin") {
			if (args[0].length > uploadProtocolLimits.maxMetadataCodeUnits)
				throw new AgentBrowserError(
					"resource-limit",
					"Upload metadata exceeds its limit",
				);
			const request = uploadRequest(JSON.parse(args[0]), owner.limits);
			const bytes = request.files.reduce(
				(total, file) => total + file.bytes,
				0,
			);
			const staged = [...state.transfers.values()].reduce(
				(total, transfer) => total + transfer.bytes,
				0,
			);
			if (
				state.transfers.size >= this.uploadSessionLimits.maxTransfers ||
				staged + bytes > this.uploadSessionLimits.maxStagedBytes
			)
				throw new AgentBrowserError(
					"resource-limit",
					"Upload session staging reservation exceeded",
				);
		}
		const parameters =
			invocation.command === "upload-target"
				? [this.target(entry.browser, tab, args[0])]
				: args;
		try {
			const result = await executeUploadCommand(
				this.uploadTransfers,
				entry.name,
				[invocation.command, ...parameters],
				signal,
			);
			if (invocation.command === "upload-begin") {
				const info = result.data as UploadTransferInfo;
				try {
					owner.validateTarget(info, info.files);
				} catch (error) {
					this.uploadTransfers.cancel(entry.name, info.documentId, info.id);
					throw error;
				}
				state.transfers.set(info.id, {
					documentId: info.documentId,
					bytes: info.bytes,
					expiresAt: info.expiresAt,
				});
			}
			return result.data;
		} catch (error) {
			if (
				(invocation.command === "upload-write" ||
					invocation.command === "upload-commit") &&
				state.transfers.get(args[1])?.documentId === args[0]
			) {
				this.uploadTransfers.cancel(entry.name, args[0], args[1]);
				state.transfers.delete(args[1]);
			}
			throw error;
		}
	}

	private async run(
		entry: SessionEntry,
		invocation: Invocation,
		signal: AbortSignal,
	): Promise<unknown> {
		const browser = entry.browser;
		if (uploadNames.has(invocation.command))
			return this.uploadCommand(entry, invocation, signal);
		if (invocation.command === "state-export")
			return this.stateTransfers.export(browser);
		if (invocation.command === "state-import-begin")
			return this.stateTransfers.begin(
				browser,
				Number(invocation.arguments[0]),
			);
		if (invocation.command === "state-import-append")
			return this.stateTransfers.append(
				browser,
				invocation.arguments[0],
				Number(invocation.arguments[1]),
				invocation.arguments[2],
			);
		if (invocation.command === "state-import-commit")
			return this.stateTransfers.commit(browser, invocation.arguments[0]);
		if (invocation.command === "state-transfer-read")
			return this.stateTransfers.read(
				browser,
				invocation.arguments[0],
				Number(invocation.arguments[1]),
			);
		if (invocation.command === "state-transfer-delete")
			return this.stateTransfers.delete(browser, invocation.arguments[0]);
		const args = invocation.arguments;
		const options = invocation.options;
		if (invocation.command === "tracing-status")
			return (
				entry.trace?.status() ?? {
					recording: false,
					frames: 0,
					droppedFrames: 0,
					truncated: false,
				}
			);
		if (invocation.command === "tracing-start") {
			if (entry.trace)
				throw new AgentBrowserError(
					"invalid-input",
					"A trace is already recording or awaiting export",
				);
			entry.trace = new SessionTrace(browser);
			return entry.trace.status();
		}
		if (invocation.command === "tracing-stop") {
			if (!entry.trace)
				throw new AgentBrowserError("invalid-input", "No trace is recording");
			this.artifacts.assertCapacity();
			const trace = entry.trace.finish();
			const artifact = this.artifacts.addTrace(
				entry.name,
				trace.bytes,
				trace.details,
			);
			entry.trace.close();
			entry.trace = undefined;
			return artifact;
		}
		if (invocation.command === "artifact-list")
			return this.artifacts.list(entry.name);
		if (invocation.command === "artifact-read")
			return this.artifacts.read(
				entry.name,
				args[0],
				Number(options.offset ?? 0),
				Number(options.length ?? captureArtifactLimits.maxChunkBytes),
			);
		if (invocation.command === "artifact-delete") {
			this.artifacts.delete(entry.name, args[0]);
			return { deleted: true };
		}
		if (invocation.command === "pdf") {
			this.artifacts.assertCapacity();
			const page = browser.page(this.activeTab(browser));
			const pdf = renderDocumentPdf(page.document);
			return this.artifacts.addPdf(entry.name, pdf.bytes, {
				mediaType: "application/pdf",
				partial: true,
				profile: "normal-flow-paginated-raster-text",
				document: page.document.reference(page.document.root),
				revision: page.document.revision,
				width: pdf.width,
				height: pdf.height,
				pages: pdf.metrics.pages,
				clips: pdf.clips,
				metrics: pdf.metrics,
			});
		}
		if (invocation.command === "screenshot") {
			this.artifacts.assertCapacity();
			const tab = this.activeTab(browser);
			const page = browser.page(tab);
			const target = args.length ? this.target(browser, tab, args[0]) : null;
			const capture = rasterizeDocument(
				page.document,
				target ? { element: target } : {},
			);
			const bytes = encodePng(capture.image);
			return this.artifacts.add(entry.name, bytes, {
				mediaType: "image/png",
				partial: true,
				profile: "normal-flow-solid-colors",
				document: page.document.reference(page.document.root),
				revision: page.document.revision,
				target,
				width: capture.image.width,
				height: capture.image.height,
				deviceScaleFactor: 1,
				hires: options.hires === true,
				clip: capture.clip,
				paint: capture.metrics,
			});
		}
		if (invocation.command === "route-list") return browser.routes.list();
		if (invocation.command === "unroute")
			return { removed: browser.routes.remove(args[0]) };
		if (invocation.command === "route") {
			const headers: Record<string, string> = Object.create(null);
			if (options.headers !== undefined) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(options.headers as string);
				} catch {
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers must be a JSON record",
					);
				}
				if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers must be a JSON record",
					);
				for (const [name, value] of Object.entries(parsed)) {
					if (typeof value !== "string")
						throw new AgentBrowserError(
							"invalid-input",
							"Route header values must be strings",
						);
					const lower = name.toLowerCase();
					if (lower === "location" && Object.hasOwn(headers, lower))
						throw new AgentBrowserError(
							"invalid-input",
							"Duplicate route Location header",
						);
					headers[lower] = value;
				}
			}
			for (const header of (options.header ?? []) as string[]) {
				const colon = header.indexOf(":");
				if (colon < 1)
					throw new AgentBrowserError(
						"invalid-input",
						"Route headers require Name: Value",
					);
				const name = header.slice(0, colon).trim().toLowerCase();
				const value = header.slice(colon + 1).trim();
				if (name === "location" && Object.hasOwn(headers, name))
					throw new AgentBrowserError(
						"invalid-input",
						"Duplicate route Location header",
					);
				headers[name] = Object.hasOwn(headers, name)
					? `${headers[name]}, ${value}`
					: value;
			}
			return browser.routes.add(args[0], {
				status: options.status as number | undefined,
				body: options.body as string | undefined,
				contentType: options["content-type"] as string | undefined,
				headers,
			});
		}
		if (
			invocation.command === "go-back" ||
			invocation.command === "go-forward"
		) {
			const tab = this.activeTab(browser);
			const navigation = await browser.go(
				tab,
				invocation.command === "go-back" ? -1 : 1,
				{ signal },
			);
			return {
				navigation,
				history: browser.history(tab),
				tabs: this.tabList(browser),
			};
		}
		if (invocation.command === "open") {
			const tab = browser.tabs().length
				? this.activeTab(browser)
				: browser.createTab().id;
			const navigation =
				args[0] === undefined
					? undefined
					: await browser.navigate(tab, args[0], { signal });
			return { navigation, tabs: this.tabList(browser) };
		}
		if (invocation.command === "metrics")
			return { host: this.metrics(), session: browser.metrics() };
		if (invocation.command === "viewport")
			return browser.viewport(this.activeTab(browser));
		if (invocation.command === "resize") {
			const tab = this.activeTab(browser);
			if (
				options["expected-tab"] !== undefined &&
				options["expected-tab"] !== tab
			)
				throw new AgentBrowserError(
					"stale-reference",
					"Selected tab changed before viewport resize",
				);
			if (
				options["expected-viewport"] !== undefined &&
				options["expected-viewport"] !== browser.viewport(tab).key
			)
				throw new AgentBrowserError(
					"stale-reference",
					"Selected tab or session changed before viewport resize",
				);
			return browser.resize(tab, Number(args[0]), Number(args[1]));
		}
		if (invocation.command === "hit-test") {
			const page = browser.page(this.activeTab(browser));
			const horizontal = Number(args[0]);
			const vertical = Number(args[1]);
			if (
				!args[0].trim() ||
				!args[1].trim() ||
				!Number.isFinite(horizontal) ||
				!Number.isFinite(vertical)
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Hit testing requires finite coordinates",
				);
			const hits = documentHitTesting(page.document).elementsFromPoint(
				horizontal,
				vertical,
			);
			return {
				x: horizontal,
				y: vertical,
				reference: hits.length ? page.document.reference(hits[0]) : null,
				references: hits.map((id) => page.document.reference(id)),
				revision: page.document.revision,
				viewport: page.styles.viewport,
				partial: true,
				profile: hitTestCapabilities.profile,
			};
		}
		if (invocation.command === "scroll-into-view") {
			const tab = this.activeTab(browser);
			let alignment: ReturnType<typeof scrollIntoViewOptions>;
			try {
				alignment = scrollIntoViewOptions(options);
			} catch (error) {
				if (error instanceof TypeError)
					throw new AgentBrowserError("invalid-input", error.message);
				throw error;
			}
			return browser.scrollIntoView(
				tab,
				this.target(browser, tab, args[0]),
				alignment,
				{ signal },
			);
		}
		if (invocation.command === "geometry") {
			const tab = this.activeTab(browser);
			const page = browser.page(tab);
			const reference = this.target(browser, tab, args[0]);
			const { node, generated } = resolveVisualTarget(page.document, reference);
			const id = node.id;
			const geometry = documentGeometry(page.document);
			const rects = generated
				? geometry.getGeneratedClientRects(reference)
				: geometry.getClientRects(id);
			if (rects.length > scriptGeometryLimits.maxListLength)
				throw new AgentBrowserError(
					"resource-limit",
					"Geometry command rectangle limit exceeded",
				);
			return {
				reference,
				revision: page.document.revision,
				partial: true,
				profile: generated
					? "generated-control-client-rects"
					: "normal-flow-client-rects",
				viewport: page.styles.viewport,
				scroll: documentScrollPosition(page.document),
				bounds: generated
					? geometry.getGeneratedBoundingClientRect(reference)
					: geometry.getBoundingClientRect(id),
				sizes: generated ? null : documentElementSizes(page.document).get(id),
				...(generated
					? {
							generated: {
								kind: generated.kind,
								owner: page.document.reference(id),
							},
						}
					: {}),
				rects,
			};
		}
		if (invocation.command === "styles") {
			const tab = this.activeTab(browser);
			const page = browser.page(tab);
			if (!args.length) return page.styles.metrics();
			const reference = this.target(browser, tab, args[0]);
			const { node, generated } = resolveVisualTarget(page.document, reference);
			if (generated)
				return {
					reference,
					...generatedControlStyle(page.document, reference),
					generated: {
						kind: generated.kind,
						owner: page.document.reference(node.id),
					},
					profile: "generated-details-summary-style",
					partial: true,
					layout: false,
				};
			return {
				reference,
				...page.styles.get(node.id),
				box: page.styles.box(node.id),
				text: page.styles.text(node.id),
				paint: page.styles.paint(node.id),
				outline: page.styles.outline(node.id),
				partial: true,
				layout: false,
			};
		}
		if (invocation.command === "tab-list") return this.tabList(browser);
		if (invocation.command === "tab-new") {
			const tab = browser.createTab();
			const navigation =
				args[0] === undefined
					? undefined
					: await browser.navigate(tab.id, args[0], { signal });
			return { navigation, tabs: this.tabList(browser) };
		}
		if (invocation.command === "tab-select") {
			const tab = this.indexedTab(browser, args[0]);
			this.checkTabKey(browser, tab, options["expected-key"]);
			browser.selectTab(tab);
			return this.tabList(browser);
		}
		if (invocation.command === "tab-close") {
			const tab =
				args[0] === undefined
					? this.activeTab(browser)
					: this.indexedTab(browser, args[0]);
			this.checkTabKey(browser, tab, options["expected-key"]);
			browser.closeTab(tab);
			const key = `${entry.name}/${tab}`;
			const cached = this.snapshots.get(key);
			if (cached) {
				this.cachedBytes -= cached.bytes;
				this.snapshots.delete(key);
			}
			return this.tabList(browser);
		}
		if (invocation.command === "cookie-clear") {
			browser.cookies.clear();
			return { cleared: true };
		}
		if (Object.hasOwn(cookieCommandOptions, invocation.command)) {
			const activeUrl =
				invocation.command === "cookie-set"
					? browser.page(this.activeTab(browser)).document.url
					: null;
			return executeCookieCommand(browser.cookies, invocation, activeUrl);
		}
		const tabId = this.activeTab(browser);
		if (invocation.command === "generate-locator") {
			const page = browser.page(tabId);
			return generateLocator(page.document, page.queries, args[0]);
		}
		if (invocation.command === "requests") return browser.requests(tabId);
		if (invocation.command === "images")
			return documentImages(browser.page(tabId).document).inspect();
		if (invocation.command === "request") {
			if (!/^(0|[1-9]\d*)$/.test(args[0]))
				throw new AgentBrowserError("invalid-input", "Invalid request index");
			return browser.request(tabId, Number(args[0]));
		}
		if (invocation.command === "eval" && this.evaluatePage)
			return this.evaluatePage(browser.page(tabId), args[0], signal);
		if (invocation.command === "console")
			return readPageConsole(browser.page(tabId).document, args[0] ?? "info");
		if (invocation.command === "goto")
			return browser.navigate(tabId, args[0], { signal });
		if (invocation.command === "reload")
			return browser.reload(tabId, { signal });
		if (invocation.command === "html") {
			const tree = browser.page(tabId).document;
			const root =
				args[0] === undefined
					? tree.root
					: tree.resolve(this.target(browser, tabId, args[0])).id;
			return {
				url: tree.url,
				partial: true,
				html: serializeHtml(tree, root, {
					includeSelf: true,
					maxCodeUnits: Math.min(
						tree.limits.maxTextCodeUnits,
						Number(options["max-code-units"] ?? 1_000_000),
					),
				}),
			};
		}
		if (invocation.command === "dom") {
			return inspectDom(browser.page(tabId).document, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				maxDepth: options.depth as number | undefined,
				maxNodes: options["max-nodes"] as number | undefined,
				maxCodeUnits: options["max-code-units"] as number | undefined,
			});
		}
		if (invocation.command === "extract") {
			return extractDocument(browser.page(tabId).document, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				...(options.format === undefined
					? {}
					: { format: options.format as ExtractionOptions["format"] }),
				...(options["max-bytes"] === undefined
					? {}
					: { maxBytes: Number(options["max-bytes"]) }),
				...(options["max-nodes"] === undefined
					? {}
					: { maxNodes: Number(options["max-nodes"]) }),
				...(options.depth === undefined
					? {}
					: { maxDepth: Number(options.depth) }),
			});
		}
		if (invocation.command === "find")
			return findInDocument(browser.page(tabId).document, args[0], {
				regex: options.regex as boolean | undefined,
				maxResults: options["max-results"] as number | undefined,
				context: options.context as number | undefined,
				maxBytes: options["max-bytes"] as number | undefined,
			});
		if (invocation.command === "snapshot" || invocation.command === "text") {
			const snapshot = browser.snapshot(tabId, {
				...(args[0] === undefined
					? {}
					: { root: this.target(browser, tabId, args[0]) }),
				...(options.depth === undefined
					? {}
					: { maxDepth: Number(options.depth) }),
				...(options["max-bytes"] === undefined
					? {}
					: { maxBytes: Number(options["max-bytes"]) }),
			});
			if (invocation.command === "text")
				return {
					text: renderSnapshot(snapshot),
					truncated: snapshot.truncated,
				};
			if (options.observe) return snapshot;
			const key = `${entry.name}/${tabId}`;
			const previous = this.snapshots.get(key)?.snapshot;
			this.cache(key, snapshot);
			return options.diff ? diffSnapshots(previous, snapshot) : snapshot;
		}
		const storage =
			/^(localstorage|sessionstorage)-(list|get|set|delete|clear)$/.exec(
				invocation.command,
			);
		if (storage) {
			const url = browser.page(tabId).document.url;
			const area =
				storage[1] === "localstorage"
					? browser.storage.localStorage(tabId, url)
					: browser.storage.sessionStorage(tabId, url);
			if (storage[2] === "list") return area.entries();
			if (storage[2] === "get") return { value: area.getItem(args[0]) };
			if (storage[2] === "set") area.setItem(args[0], args[1]);
			if (storage[2] === "delete") area.removeItem(args[0]);
			if (storage[2] === "clear") area.clear();
			return { changed: true };
		}
		const actions = browser.page(tabId).interactions;
		if (invocation.command === "mousewheel" || invocation.command === "press") {
			const inputKind = invocation.command === "press" ? "keyboard" : "wheel";
			if (
				options["expected-viewport"] !== undefined &&
				options["expected-viewport"] !== browser.viewport(tabId).key
			)
				throw new AgentBrowserError(
					"stale-reference",
					`Selected tab or session changed before ${inputKind} input`,
				);
			const document = browser.page(tabId).document;
			if (
				options["expected-document"] !== undefined &&
				options["expected-document"] !== document.reference(document.root)
			)
				throw new AgentBrowserError(
					"stale-reference",
					`Selected document changed before ${inputKind} input`,
				);
		}
		if (
			invocation.command === "mousemove" ||
			invocation.command === "mousewheel" ||
			invocation.command === "mousedown" ||
			invocation.command === "mouseup"
		) {
			if (
				(invocation.command === "mousemove" ||
					invocation.command === "mousewheel") &&
				(!args[0].trim() || !args[1].trim())
			)
				throw new AgentBrowserError(
					"invalid-input",
					"Mouse requires finite coordinates",
				);
			const result =
				invocation.command === "mousemove" ||
				invocation.command === "mousewheel"
					? await browser[invocation.command](
							tabId,
							Number(args[0]),
							Number(args[1]),
							{ signal },
						)
					: await browser[invocation.command](
							tabId,
							(args[0] ?? "left") as MouseButton,
							{ signal },
						);
			if (result.mouse.defaultAction && !result.navigation && !result.form)
				throw new AgentBrowserError(
					"unsupported",
					"Mouse default action is not implemented",
				);
			return result;
		}
		if (invocation.command === "type")
			return actions.keyboard.typeAsync(args[0], signal);
		if (
			invocation.command === "press" ||
			invocation.command === "keydown" ||
			invocation.command === "keyup"
		) {
			const result = await browser[invocation.command](tabId, args[0], {
				signal,
				...(options.target === undefined
					? {}
					: { target: this.target(browser, tabId, options.target as string) }),
			});
			if (result.keyboard.defaultAction && !result.navigation && !result.form)
				throw new AgentBrowserError(
					"unsupported",
					"Keyboard default action is not implemented",
				);
			return result;
		}
		const waitingAction: WaitingAction =
			invocation.command === "fill"
				? { kind: "fill", value: args[1] }
				: invocation.command === "select"
					? { kind: "select", values: [args[1]] }
					: invocation.command === "check" || invocation.command === "uncheck"
						? { kind: "checked", checked: invocation.command === "check" }
						: { kind: invocation.command === "hover" ? "hover" : "click" };
		return runWhenActionable(
			() => browser.page(tabId),
			args[0],
			waitingAction,
			signal,
			async (page, target) => {
				const actions = page.interactions;
				if (invocation.command === "fill") {
					const interaction = await actions.fillAsync(target, args[1], signal);
					if (!options.submit) return interaction;
					if (interaction.defaultPrevented) return { interaction };
					const result = await browser.press(tabId, "Enter", { signal });
					if (
						result.keyboard.defaultAction &&
						!result.navigation &&
						!result.form
					)
						throw new AgentBrowserError(
							"unsupported",
							"Keyboard default action is not implemented",
						);
					return { interaction, ...result };
				}
				if (invocation.command === "check" || invocation.command === "uncheck")
					return actions.setCheckedAsync(
						target,
						invocation.command === "check",
					);
				if (invocation.command === "select")
					return actions.selectAsync(target, [args[1]]);
				if (invocation.command === "hover")
					return browser.hover(tabId, target, { signal });
				if (invocation.command === "dblclick")
					return browser.dblclick(tabId, target, { signal });
				if (invocation.command === "click") {
					const result = await browser.click(tabId, target, { signal });
					if (
						result.interaction.defaultAction &&
						!result.navigation &&
						!result.form
					)
						throw new AgentBrowserError(
							"unsupported",
							"Click event ran, but its pending default action is not implemented",
						);
					return result;
				}
				throw new AgentBrowserError(
					"unsupported",
					"Command dispatch is not implemented",
				);
			},
		);
	}

	private cache(key: string, snapshot: SemanticSnapshot) {
		const previous = this.snapshots.get(key);
		if (previous) {
			this.cachedBytes -= previous.bytes;
			this.snapshots.delete(key);
		}
		const serialized = JSON.stringify(snapshot);
		const bytes = new TextEncoder().encode(serialized).byteLength;
		if (bytes > this.limits.maxSnapshotCacheBytes) return;
		while (
			this.cachedBytes + bytes > this.limits.maxSnapshotCacheBytes &&
			this.snapshots.size
		) {
			const oldest = this.snapshots.entries().next().value;
			if (!oldest) break;
			this.snapshots.delete(oldest[0]);
			this.cachedBytes -= oldest[1].bytes;
		}
		this.snapshots.set(key, {
			snapshot: JSON.parse(serialized) as SemanticSnapshot,
			bytes,
		});
		this.cachedBytes += bytes;
	}
}
