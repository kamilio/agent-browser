import { AgentBrowserError } from "./errors.js";
import type { FormattingTree } from "./formatting-tree.js";
import {
	createRaster,
	paintRasterImage,
	rasterLimits,
	type RasterImage,
} from "./raster.js";

export const opacityLayoutLimits = Object.freeze({
	maxRetainedPixels: 4 * rasterLimits.maxPixels,
});

interface OpacityChain {
	readonly id: number;
	readonly opacity: number;
	readonly depth: number;
	readonly parent?: OpacityChain;
}

export function prepareOpacityLayout(
	formatting: FormattingTree,
	canvas: RasterImage,
	charge: (work?: number) => void,
) {
	if (!formatting.nodes.some((node) => node.opacity !== undefined)) return;
	const chains = new Map<number, OpacityChain | undefined>();
	const pending: { id: number; inherited?: OpacityChain }[] = [
		{ id: formatting.root },
	];
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		if (!node || chains.has(node.id))
			throw new AgentBrowserError("invalid-input", "Invalid opacity ownership");
		let chain = state.inherited;
		if (node.opacity !== undefined) {
			if (
				!Number.isFinite(node.opacity) ||
				node.opacity < 0 ||
				node.opacity >= 1
			)
				throw new AgentBrowserError("invalid-input", "Invalid group opacity");
			chain = {
				id: node.id,
				opacity: node.opacity,
				depth: (chain?.depth ?? 0) + 1,
				...(chain ? { parent: chain } : {}),
			};
		}
		chains.set(node.id, chain);
		for (const id of node.children) {
			charge();
			pending.push({ id, inherited: chain });
		}
	}
	const active: { chain: OpacityChain; image: RasterImage }[] = [];
	const completed = new Set<OpacityChain>();
	const pixels = canvas.width * canvas.height;
	const metrics = { groups: 0, pixels: 0, peakPixels: 0 };
	let retainedPixels = 0;
	const target = () => active.at(-1)?.image ?? canvas;
	const close = () => {
		charge(pixels);
		const layer = active.pop();
		if (!layer)
			throw new AgentBrowserError("invalid-input", "Missing opacity layer");
		paintRasterImage(
			target(),
			layer.image,
			0,
			0,
			canvas.width,
			canvas.height,
			undefined,
			layer.chain.opacity,
		);
		retainedPixels -= pixels;
		completed.add(layer.chain);
	};
	return {
		metrics,
		target(id: number, releaseDestination?: () => void): RasterImage {
			charge();
			if (!chains.has(id))
				throw new AgentBrowserError(
					"invalid-input",
					"Missing opacity item owner",
				);
			const missing: OpacityChain[] = [];
			let shared = chains.get(id);
			while (shared && active[shared.depth - 1]?.chain !== shared) {
				charge();
				missing.push(shared);
				shared = shared.parent;
			}
			if (missing.length || active.length > (shared?.depth ?? 0))
				releaseDestination?.();
			while (active.length > (shared?.depth ?? 0)) close();
			for (const chain of missing.reverse()) {
				charge();
				if (completed.has(chain))
					throw new AgentBrowserError(
						"unsupported",
						"Non-contiguous opacity group painting is unsupported",
					);
				if (retainedPixels + pixels > opacityLayoutLimits.maxRetainedPixels)
					throw new AgentBrowserError(
						"resource-limit",
						"Retained opacity raster limit exceeded",
					);
				charge(pixels);
				active.push({
					chain,
					image: createRaster(canvas.width, canvas.height),
				});
				retainedPixels += pixels;
				metrics.groups++;
				metrics.pixels += pixels;
				metrics.peakPixels = Math.max(metrics.peakPixels, retainedPixels);
			}
			return target();
		},
		finish() {
			while (active.length) close();
		},
	};
}
