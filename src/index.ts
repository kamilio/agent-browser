export {
	PasskeyBroker,
	passkeyLimits,
	type PasskeyAuthenticator,
	type PasskeyContext,
	type PasskeyCapabilities,
	type PasskeyCreationOptions,
	type PasskeyRequestOptions,
	type PasskeyCreationCredential,
	type PasskeyAssertionCredential,
	type PasskeyRegistration,
	type PasskeyAssertion,
} from "./passkeys.js";
export { PagePasskeys, type PagePasskeyContext } from "./page-passkeys.js";
export {
	cssGridProperties,
	cssGridLimits,
	gridStyleCapabilities,
	type CssGridProperty,
	type GridStyle,
	type GridSpecifiedStyle,
} from "./css-grid.js";
export { placeGridItems, gridPlacementLimits } from "./grid-placement.js";
export { sizeGridTracks, gridTrackSizingLimits } from "./grid-tracks.js";
export {
	layoutFormattingGridContainer,
	gridLayoutCapabilities,
	gridLayoutLimits,
	type GridContainerConstraints,
	type GridContainerOptions,
	type GridLayoutContext,
} from "./grid-layout.js";
export type {
	GridTrack,
	GridPlacementInput,
	GridPlacedItem,
	GridPlacedAxis,
	GridPlacement,
	GridTrackContribution,
	GridTrackSizingOptions,
	GridTrackSizing,
} from "./grid-types.js";
export {
	SecretBroker,
	secretProviderLimits,
	type SecretBinding,
	type SecretBrokerOptions,
	type SecretProvider,
} from "./secret-providers.js";
export {
	ScriptMutationObservers,
	type ScriptMutationObserverLimits,
	type ScriptMutationObserverPort,
} from "./script-mutation-observers.js";
export {
	ScriptMutationRecords,
	type ScriptMutationRecordLimits,
} from "./script-mutation-records.js";
export {
	DocumentObservers,
	type DocumentObserverOptions,
	type DocumentObserverLimits,
	type DocumentObserverDelivery,
	type ObservedDocumentMutation,
} from "./document-observers.js";
export { AgentBrowserError, type ErrorCode } from "./errors.js";
export { rangeKeyboardCapabilities } from "./range-keyboard.js";
export {
	findClickPoint,
	findHoverPoint,
	hoverActionabilityCapabilities,
	clickActionabilityCapabilities,
	type ClickPoint,
	type ClickTargetResult,
} from "./click-target.js";
export { keyboardScrollCapabilities } from "./keyboard-scroll.js";
export {
	DocumentMouse,
	BrowserMouseEvent,
	BrowserPointerActivationEvent,
	BrowserWheelEvent,
	mouseLimits,
	mouseCapabilities,
	type MouseButton,
	type MouseResult,
} from "./mouse.js";
export {
	interactionStyleCapabilities,
	cssInteractionProperties,
	type PointerEventsStyle,
} from "./css-interaction.js";
export {
	DocumentHitTesting,
	documentHitTesting,
	hitTestLimits,
	hitTestCapabilities,
	type HitTestLimits,
} from "./hit-testing.js";
export { selectKeyboardCapabilities } from "./select-keyboard.js";
export { fontRelativeBoxUnits, type BoxFontMetrics } from "./css-box.js";
export { cssMathCapabilities, cssMathLimits } from "./css-math.js";
export { cssVariableCapabilities, cssVariableLimits } from "./css-variables.js";
export { inlineDeclarationLimits } from "./document-inline-declarations.js";
export { borderCapabilities } from "./border-box.js";
export {
	measureIntrinsicWidths,
	intrinsicWidthLimits,
	type IntrinsicWidth,
	type IntrinsicWidthOptions,
} from "./intrinsic-widths.js";
export {
	resolveFlexMainSizes,
	flexMainLimits,
	type FlexMainConstraints,
	type FlexMainOptions,
	type MeasuredFlexMainItem,
} from "./flex-main.js";
export {
	reflowFlexItems,
	flexReflowLimits,
	type FlexReflowOptions,
} from "./flex-reflow.js";
export {
	layoutFlexContainer,
	flexLayoutLimits,
	type FlexContainerConstraints,
	type FlexContainerLayoutOptions,
} from "./flex-layout.js";
export {
	controlRenderingCapabilities,
	controlRenderingLimits,
} from "./control-rendering.js";
export {
	atomicInlineCapabilities,
	type AtomicInlineMetrics,
} from "./inline-atomic.js";

export { flowStyleCapabilities } from "./css-flow.js";
export { flexStyleCapabilities } from "./css-flex.js";
export {
	resolveFlexLines,
	flexLineLimits,
	type FlexLineItemInput,
	type FlexLineOptions,
	type FlexLines,
	type FlexLine,
	type FlexLineItem,
	type FlexJustification,
} from "./flex-line.js";
export {
	DocumentScroll,
	documentScroll,
	documentScrollPosition,
	viewportScrollCapabilities,
	viewportScrollLimits,
} from "./document-scroll.js";
export { pageScrollCapabilities, pageScrollLimits } from "./page-scroll.js";
export {
	RootScroll,
	rootScrollCapabilities,
	rootScrollProperties,
	type RootScrollRequest,
	type RootScrollProperty,
} from "./root-scroll.js";
export {
	DocumentElementScroll,
	documentElementScroll,
	elementScrollCapabilities,
	elementScrollLimits,
	type ElementScrollMetrics,
	type ElementScrollLimits,
} from "./element-scroll.js";
export {
	DocumentScrollIntoView,
	documentScrollIntoView,
	scrollIntoViewCapabilities,
	type ScrollAlignment,
	type ScrollIntoViewOptions,
	type ScrollIntoViewResult,
} from "./scroll-into-view.js";
export {
	DocumentElementOffsets,
	documentElementOffsets,
	elementOffsetLimits,
	elementOffsetCapabilities,
	type ElementOffsets,
} from "./element-offsets.js";
export {
	capturePng,
	capturePdf,
	readCapture,
	readPdf,
	readTrace,
	type CaptureExecutor,
} from "./capture-client.js";
export {
	captureArtifactLimits,
	type CaptureArtifact,
	type PdfArtifact,
	type TraceArtifact,
	type TraceDetails,
	type ArtifactChunk,
} from "./capture-artifacts.js";
export {
	SessionTrace,
	sessionTraceLimits,
	sessionTraceCapabilities,
	type TraceOutcome,
} from "./session-trace.js";
export {
	parseTraceForReview,
	readTraceFile,
	describeTraceFrame,
	type ReviewTrace,
	type ReviewFrame,
} from "./trace-review.js";
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
	PageAbortSignals,
	type PageAbortSignal,
	type PageAbortSignalLimits,
} from "./page-abort-signals.js";
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
	keyboardActivationCapabilities,
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
	type ColorSchemePreference,
	nativeColorScheme,
} from "./native-color-scheme.js";
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
	type SessionHoverResult,
	type SessionMouseResult,
	type KeyPressOptions,
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
export {
	PageIdleCallbacks,
	idleCallbackLimits,
	idleCallbackIntervalMs,
	idleCallbackBudgetMs,
} from "./page-idle-callbacks.js";
export type { IdleCallbackLimits } from "./page-idle-callbacks.js";
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
export {
	type BrowserIdentity,
	type BrowserIdentityOptions,
	browserIdentityLimits,
	browserIdentityHeaders,
	createBrowserIdentity,
	defaultBrowserIdentity,
} from "./browser-identity.js";
