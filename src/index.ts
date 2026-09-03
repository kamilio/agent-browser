export { AgentBrowserError, type ErrorCode } from "./errors.js";
export { rangeKeyboardCapabilities } from "./range-keyboard.js";
export {
	capturePng,
	capturePdf,
	readCapture,
	readPdf,
	type CaptureExecutor,
} from "./capture-client.js";
export {
	captureArtifactLimits,
	type CaptureArtifact,
	type PdfArtifact,
	type ArtifactChunk,
} from "./capture-artifacts.js";
export { encodePdf, pdfLimits, type PdfGlyph, type PdfPage } from "./pdf.js";
export { renderDocumentPdf, documentPdfLimits } from "./document-pdf.js";
export {
	extensionPageRuntime,
	extensionPageRuntimeLimits,
} from "./extension-page-runtime.js";
export type {
	ReleasedCore,
	ReleasedContext,
	ReleasedRealm,
} from "./safejs-extension-types.js";
export {
	findInDocument,
	renderSnapshotSearch,
	type SnapshotSearch,
	type SnapshotSearchMatch,
	type SnapshotSearchOptions,
} from "./snapshot-search.js";
export {
	NetworkRoutes,
	type NetworkRoute,
	type RouteFulfillment,
} from "./network-routes.js";
export {
	PageFetch,
	type PageFetchLimits,
	type PageFetchRequestContext,
	type PageFetchTransport,
} from "./page-fetch.js";
export {
	NetworkJournal,
	type NetworkCorsResult,
	type ObserveCorsResult,
	diagnosticUrl,
	type NetworkJournalEntry,
	type NetworkJournalSnapshot,
	type NetworkRequestKind,
} from "./network-journal.js";
export {
	extractDocument,
	type DocumentExtraction,
	type ExtractedNode,
	type ExtractionOptions,
	type ExtractionType,
} from "./extraction.js";
export { DocumentFocus, BrowserFocusEvent } from "./focus.js";
export {
	DocumentKeyboard,
	BrowserKeyboardEvent,
	type KeyboardResult,
} from "./keyboard.js";
export {
	BrowserCommandHost,
	type CommandExecutor,
	type CommandHostOptions,
	type CommandRequestOptions,
	type CommandResult,
} from "./command-host.js";
export { loadTextDocument } from "./text-loader.js";
export type { SessionHistorySnapshot } from "./navigation-history.js";
export {
	BrowserSession,
	type BrowserSessionOptions,
	type SessionLimits,
	type SessionPage,
	type SessionTab,
	type SessionRequests,
	type DocumentLoader,
	type DocumentLoaderContext,
	type NavigationOptions,
	type NavigationResult,
	type SessionClickResult,
	type SessionSubmitResult,
	type SessionKeyResult,
} from "./session.js";
export {
	CookieJar,
	cookieStateLimits,
	type CookieState,
	type CookieStateEntry,
	cookieSameSite,
	cookiePathMatches,
	type CookieContext,
	type CookieRequestContext,
	type CookieLimits,
	type CookieRejection,
	type CookieSetResult,
} from "./cookies.js";
export {
	DocumentForms,
	BrowserSubmitEvent,
	type FormResetResult,
	type FormRequestResult,
} from "./form-actions.js";
export type { InvalidFormControl } from "./form-validation.js";
export {
	DocumentHistory,
	BrowserPopStateEvent,
	BrowserHashChangeEvent,
	type HistoryValue,
	type HistoryLimits,
	type HistoryArchive,
	type HistorySnapshot,
} from "./history.js";
export {
	canRewriteDocumentUrl,
	documentBaseTarget,
	documentBaseUrl,
	urlFragment,
	decodeUrlFragment,
	selectDocumentFragmentTarget,
} from "./document-url.js";
export { DocumentQueries, type QueryLimits } from "./selectors.js";
export {
	BrowserInputEvent,
	DocumentInteractions,
	type DefaultActionIntent,
	type InteractionResult,
} from "./interactions.js";
export {
	BrowserEvent,
	DocumentEvents,
	controlledEventListener,
	type BrowserEventInit,
	type BrowserEventListener,
	type BrowserListenerOptions,
	type BrowserListenerError,
	type EventLimits,
	type DocumentEventOptions,
} from "./events.js";
export {
	controlChecked,
	controlValue,
	fillTextControl,
	validateTextControl,
	radioGroup,
	formControls,
	formOwner,
	inputType,
	isControlDisabled,
	isLabelable,
	isInteractiveElement,
	labelControl,
	isInsideDatalist,
	optionValue,
	optionSelected,
	selectControlValues,
	selectOptions,
	selectedOptions,
	setControlChecked,
} from "./controls.js";
export {
	prepareFormSubmission,
	type FormUpload,
	type FormSubmissionOptions,
	type PreparedFormSubmission,
} from "./forms.js";
export {
	BrowserStorage,
	type StorageArea,
	type StorageLimits,
	type StorageMutation,
	type LocalStorageState,
} from "./storage.js";
export { BrowserStorageEvent } from "./storage-events.js";
export {
	exportBrowserState,
	replaceBrowserState,
	type BrowserState,
	type BrowserStateOwner,
} from "./browser-state.js";
export {
	NetworkPolicy,
	decodeResponseText,
	addressFamily,
	isPublicAddress,
	networkHostname,
	parseNetworkUrl,
	responseHeader,
	type NetworkLimits,
	type NetworkMetrics,
	type NetworkPolicyOptions,
	type NetworkRequest,
	type NetworkResponse,
	type NetworkRouteResolver,
	type NetworkTransport,
} from "./network.js";
export {
	diffSnapshots,
	renderSnapshot,
	snapshotDocument,
	type SemanticSnapshot,
	type SnapshotDiff,
	type SnapshotEntry,
	type SnapshotOptions,
} from "./snapshot.js";
export {
	parseInvocation,
	type Invocation,
	type OptionValue,
} from "./cli-parser.js";
export { commands, type CommandDefinition } from "./commands.js";
export {
	DocumentTree,
	type DocumentNode,
	type DocumentLimits,
	type DocumentChange,
	type DocumentMutation,
} from "./document.js";
export { loadBrowserDocument } from "./document-loader.js";
export {
	parseHtmlDocument,
	parseHtmlFragment,
	parseHtmlDocumentAsync,
	type HtmlParseOptions,
	type HtmlFragmentContext,
	type HtmlScriptHooks,
	type HtmlScriptContext,
} from "./html-parser.js";
export { ScriptLoader, type ScriptLoaderOptions } from "./script-loader.js";
export {
	documentScriptState,
	type ScriptLoadReport,
} from "./document-script-state.js";
export { htmlParseInfo, type HtmlParseInfo } from "./html-info.js";
export {
	insertAdjacentHtml,
	setInnerHtml,
	setOuterHtml,
} from "./html-content.js";
export {
	readPageConsole,
	type PageConsoleSnapshot,
	type ConsoleEntry,
	type ConsoleLevel,
	type ConsoleLimits,
} from "./page-console.js";
export {
	serializeHtml,
	type HtmlSerializationOptions,
} from "./html-serialization.js";
export {
	ScriptDom,
	type ScriptHostObjectFactory,
	type ScriptHostObjectDefinition,
} from "./script-dom.js";
export {
	ScriptEventBindings,
	type ScriptCallbackRuntime,
	type ScriptEventOptions,
} from "./script-events.js";
export type { TimerLimits } from "./page-timers.js";
export { characterDataCapabilities } from "./script-character-data.js";
export { PageClock, pageClockPrecisionMs } from "./page-performance.js";
export type { PageClockSource } from "./page-performance.js";
export {
	PageAnimationFrames,
	animationFrameLimits,
	animationFrameIntervalMs,
} from "./page-animation-frames.js";
export type { AnimationFrameLimits } from "./page-animation-frames.js";
export { PageMedia, pageMediaLimits } from "./page-media.js";
export {
	compileCssMedia,
	cssMediaLimits,
	type CompiledCssMedia,
	type MediaViewport,
} from "./css-media.js";
export { BrowserMediaQueryListEvent } from "./media-query-event.js";
export type {
	PageRuntime,
	PageRuntimeError,
	PageRuntimeFactory,
	PageRuntimeOptions,
	PageRuntimeResult,
} from "./page-runtime.js";
export {
	PageScripts,
	type PageScriptCore,
	type PageRealm,
	type PageRealmOptions,
	type PageScriptOptions,
} from "./page-scripts.js";
export {
	DocumentStyles,
	documentStyles,
	type StyleLimits,
	type VisibilityStyle,
} from "./styles.js";
export {
	cssBoxProperties,
	type BoxStyle,
	type CssBoxProperty,
} from "./css-box.js";
export {
	resolveBlockWidth,
	type BlockWidth,
	type BlockWidthStyle,
	type BlockWidthOptions,
} from "./block-width.js";
export { layoutValueLimits } from "./layout-values.js";
export {
	bitmapFont,
	bitmapFontMetrics,
	bitmapGlyph,
	type BitmapGlyph,
} from "./bitmap-font.js";
export {
	createRaster,
	paintRasterRect,
	paintRasterImage,
	paintBitmapGlyph,
	rasterLimits,
	type RasterImage,
	type Rgba,
} from "./raster.js";
export { resolveReplacedSize, type ReplacedSize } from "./replaced-box.js";
export { encodePng } from "./png.js";
export {
	DocumentImages,
	documentImages,
	documentImageLimits,
	type DocumentImageOptions,
	type ImageFetch,
	type ImageSnapshot,
} from "./document-images.js";
export {
	decodePng,
	pngDecodeLimits,
	type DecodedPng,
	type PngDecodeOptions,
} from "./png-decoder.js";
export {
	decodeJpeg,
	jpegDecodeLimits,
	type DecodedJpeg,
	type JpegDecodeOptions,
} from "./jpeg-decoder.js";
export {
	decodeImage,
	imageMediaTypes,
	type DecodedImage,
	type ImageMediaType,
} from "./image-decoder.js";
export {
	inflateZlib,
	inflateLimits,
	type InflateOptions,
	type InflateResult,
} from "./inflate.js";
export { parseCssColor, cssNamedColors, type CssColor } from "./css-color.js";
export {
	cssBackgroundProperties,
	initialBackgroundValues,
	parseBackgroundShorthand,
	type CssBackgroundProperty,
} from "./css-background.js";
export {
	cssPaintProperties,
	initialPaintStyle,
	paintBackground,
	type PaintStyle,
	type CssPaintProperty,
} from "./css-paint.js";
export {
	rasterizeDocument,
	documentRasterLimits,
	type DocumentRaster,
	type DocumentRasterOptions,
	type DocumentClip,
} from "./document-raster.js";
export {
	layoutDocument,
	documentLayoutLimits,
	type DocumentLayout,
	type DocumentLayoutOptions,
	type DocumentBox,
	type PositionedTextContext,
	type MarginStrut,
} from "./document-layout.js";
export {
	cssTextProperties,
	initialTextStyle,
	type CssTextProperty,
	type TextStyle,
} from "./css-text.js";
export {
	layoutDocumentText,
	textLayoutLimits,
	type DocumentTextLayout,
	type TextLayoutOptions,
	type TextLayoutLimits,
	type TextContext,
	type TextGlyph,
	type TextInlineFragment,
	type TextLine,
} from "./text-layout.js";
export {
	buildFormattingTree,
	resolveDocumentBlockWidths,
	formattingLimits,
	type FormattingTree,
	type FormattingNode,
	type FormattingLimits,
	type FormattingBlockWidth,
	type FormattingImageSize,
	type DocumentBlockWidths,
} from "./formatting-tree.js";
export {
	SafeJsRuntime,
	type SafeJsSdk,
	type ScriptLimits,
	type ScriptEvaluation,
} from "./safejs.js";
export {
	inspectDom,
	type DomInspection,
	type DomInspectionOptions,
	type InspectedDomNode,
} from "./dom-inspection.js";
export {
	parseTargetLocator,
	resolveBrowserTarget,
	type TargetLocator,
} from "./target-locator.js";
export {
	generateLocator,
	locatorGenerationLimits,
	type GeneratedLocator,
} from "./locator-generation.js";
export {
	documentGeometry,
	DocumentGeometry,
	geometryLimits,
	type ClientRectangle,
} from "./document-geometry.js";
export {
	ComputedStyles,
	computedStyleProperties,
	computedStyleLimits,
	resolvedStyleValue,
} from "./computed-styles.js";
export {
	DocumentElementSizes,
	documentElementSizes,
	elementSizeProperties,
	elementSizeLimits,
	type ElementSizes,
} from "./element-sizes.js";
