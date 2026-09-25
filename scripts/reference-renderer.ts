import { documentImages } from "../src/document-images.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import { prepareDocumentRaster } from "../src/document-raster.js";
import { documentScriptState } from "../src/document-script-state.js";
import type { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { documentInteractions } from "../src/interactions.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { ScriptLoader } from "../src/script-loader.js";
import { documentStyles } from "../src/styles.js";

export async function renderReferenceHtml(
	source: string,
	options: {
		url: string;
		width: number;
		height: number;
		core?: PageScriptCore;
		timeoutMs?: number;
	},
) {
	const timeoutMs = options.timeoutMs ?? 1000;
	if (
		typeof source !== "string" ||
		source.length > 262_144 ||
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs < 1 ||
		timeoutMs > 5000 ||
		![options.width, options.height].every(
			(value) => Number.isSafeInteger(value) && value > 0 && value <= 1024,
		)
	)
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid reference rendering input",
		);
	const controller = new AbortController();
	const alarm = setTimeout(() => controller.abort(), timeoutMs);
	let tree: DocumentTree | undefined;
	const owners: PageScripts[] = [];
	const started = performance.now();
	const body = new TextEncoder().encode(source);
	const response = {
		url: options.url,
		status: 200,
		headers: { "content-type": ["text/html; charset=utf-8"] },
		body,
		redirects: [],
		encodedBytes: body.length,
		elapsedMs: 0,
	};
	const blockedFetch = async () => {
		throw new AgentBrowserError(
			"policy-denied",
			"Reference network access is disabled",
		);
	};
	try {
		const core = options.core;
		tree = await loadBrowserDocument(response, {
			signal: controller.signal,
			tabId: "reference",
			limits: {
				maxNodes: 10_000,
				maxDepth: 256,
				maxTextCodeUnits: 1_000_000,
				maxChanges: 1024,
			},
			fetchImage: blockedFetch,
			fetchScript: blockedFetch,
			fetchStylesheet: blockedFetch,
			initializeDocument(document) {
				tree = document;
				documentStyles(document).setViewport(options.width, options.height);
			},
			scripts: core
				? new ScriptLoader({
						response,
						signal: controller.signal,
						fetch: blockedFetch,
						owner(document) {
							const page = new PageScripts(
								{ document, interactions: documentInteractions(document) },
								core,
							);
							owners.push(page);
							return page;
						},
					})
				: undefined,
		});
		const loaded = performance.now();
		const scripts = documentScriptState(tree)?.report;
		if (
			scripts &&
			(!scripts.complete || scripts.failed || scripts.skipped || scripts.halted)
		)
			throw new AgentBrowserError(
				"invalid-input",
				"Reference scripts did not all complete successfully",
			);
		if (!core && [...tree.walk()].some(({ node }) => node.tagName === "script"))
			throw new AgentBrowserError(
				"unsupported",
				"Reference requires a script runtime",
			);
		const root = tree
			.get(tree.root)
			.children.find((id) => tree?.get(id).tagName === "html");
		const waiting = () =>
			root !== undefined &&
			tree
				?.get(root)
				.attributes.class?.split(/[\t\n\f\r ]+/)
				.includes("reftest-wait");
		if (waiting() && !core)
			throw new AgentBrowserError(
				"unsupported",
				"Reference wait requires a script runtime",
			);
		while (waiting()) {
			if (controller.signal.aborted || owners.some((owner) => owner.closed))
				throw new AgentBrowserError(
					"timeout",
					"Reference readiness deadline exceeded",
				);
			await new Promise<void>((resolve) => setTimeout(resolve, 5));
		}
		if (controller.signal.aborted)
			throw new AgentBrowserError(
				"timeout",
				"Reference rendering deadline exceeded",
			);
		const ready = performance.now();
		const styleMetrics = documentStyles(tree).metrics();
		if (Object.keys(styleMetrics.issues).length)
			throw new AgentBrowserError(
				"unsupported",
				"Reference has unhandled stylesheet issues",
			);
		const images = documentImages(tree).inspect();
		if (images.images.length)
			throw new AgentBrowserError(
				"unsupported",
				"Reference image resources are outside this corpus profile",
			);
		const prepared = prepareDocumentRaster(tree);
		const laidOut = performance.now();
		const raster = prepared.rasterize();
		const painted = performance.now();
		if (raster.layout.text.metrics.unsupportedGlyphs)
			throw new AgentBrowserError(
				"unsupported",
				"Reference uses unsupported font glyphs",
			);
		return {
			image: raster.image,
			timings: {
				loadMs: loaded - started,
				waitMs: ready - loaded,
				layoutMs: laidOut - ready,
				paintMs: painted - laidOut,
			},
			work: { layout: raster.layout.metrics.work, paint: raster.metrics.work },
			scripts: scripts ?? null,
			animationFrames: owners.map((owner) => owner.metrics().animationFrames),
			canvas: raster.canvasBackground.color,
			partialRenderer: true,
		};
	} finally {
		clearTimeout(alarm);
		controller.abort();
		try {
			for (const owner of owners) await owner.close();
		} finally {
			tree?.close();
		}
	}
}
