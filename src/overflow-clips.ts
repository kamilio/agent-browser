import { initialRadiusStyle, resolveRadiusStyle } from "./css-radius.js";
import type { DocumentLayout } from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { clipsOverflow } from "./overflow-policy.js";
import {
	createRoundedBox,
	insetRoundedBox,
	roundedBoxContains,
	type RoundedBox,
} from "./rounded-box.js";

export interface OverflowClip {
	readonly parent?: Readonly<OverflowClip>;
	readonly box: Readonly<RoundedBox>;
	readonly x: boolean;
	readonly y: boolean;
}

export interface OverflowClipFrame {
	readonly border?: Readonly<OverflowClip>;
	readonly content?: Readonly<OverflowClip>;
}

export interface OverflowRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export function layoutOverflowClips(
	layout: Readonly<DocumentLayout>,
	charge: (work?: number) => void = () => {},
): ReadonlyMap<number, Readonly<OverflowClipFrame>> {
	const formatting = layout.text.horizontal.formatting;
	const frames = new Map<number, Readonly<OverflowClipFrame>>();
	if (!formatting.nodes.some((node) => node.overflow)) return frames;
	const boxes = new Map(
		layout.boxes.map((box) => {
			charge();
			return [box.id, box] as const;
		}),
	);
	const pending: { id: number; inherited?: Readonly<OverflowClip> }[] = [
		{ id: formatting.root },
	];
	while (pending.length) {
		charge();
		const state = pending.pop() as (typeof pending)[number];
		const node = formatting.nodes[state.id];
		if (!node)
			throw new AgentBrowserError(
				"invalid-input",
				"Missing overflow clip owner",
			);
		const box = boxes.get(node.id);
		let border = state.inherited;
		if (node.position === "fixed") border = undefined;
		else if (node.position === "absolute") {
			const frame = box ? frames.get(box.containingBlock) : undefined;
			if (!frame)
				throw new AgentBrowserError(
					"invalid-input",
					"Missing overflow clip containing block",
				);
			border = frame.content;
		}
		let content = border;
		if (box && node.overflow && node.kind !== "viewport") {
			const horizontal = clipsOverflow(node.overflow.x);
			const vertical = clipsOverflow(node.overflow.y);
			const outer = createRoundedBox(
				box.borderX,
				box.borderY,
				box.borderBoxWidth,
				box.borderBoxHeight,
				resolveRadiusStyle(
					horizontal && vertical
						? (node.radius ?? initialRadiusStyle)
						: initialRadiusStyle,
					box.borderBoxWidth,
					box.borderBoxHeight,
				),
			);
			const padding = insetRoundedBox(outer, {
				top: box.borderTop,
				right: box.borderRight,
				bottom: box.borderBottom,
				left: box.borderLeft,
			});
			content = Object.freeze({
				...(border ? { parent: border } : {}),
				box: padding,
				x: horizontal,
				y: vertical,
			});
		}
		frames.set(
			node.id,
			Object.freeze({
				...(border ? { border } : {}),
				...(content ? { content } : {}),
			}),
		);
		for (let index = node.children.length - 1; index >= 0; index--) {
			charge();
			pending.push({ id: node.children[index], inherited: content });
		}
	}
	return frames;
}

export function overflowClipContains(
	chain: Readonly<OverflowClip> | undefined,
	horizontal: number,
	vertical: number,
	charge: (work?: number) => void = () => {},
): boolean {
	let depth = 0;
	for (let clip = chain; clip; clip = clip.parent) {
		charge();
		if (++depth > 1024)
			throw new AgentBrowserError(
				"resource-limit",
				"Overflow clip depth limit exceeded",
			);
		if (clip.x && clip.y) {
			if (!roundedBoxContains(clip.box, horizontal, vertical)) return false;
		} else if (
			(clip.x &&
				(horizontal < clip.box.x ||
					horizontal >= clip.box.x + clip.box.width)) ||
			(clip.y &&
				(vertical < clip.box.y || vertical >= clip.box.y + clip.box.height))
		)
			return false;
	}
	return true;
}

export function clipOverflowRectangle(
	chain: Readonly<OverflowClip> | undefined,
	rectangle: Readonly<OverflowRectangle>,
	charge: (work?: number) => void = () => {},
): Readonly<OverflowRectangle> | undefined {
	let left = rectangle.x;
	let top = rectangle.y;
	let right = left + rectangle.width;
	let bottom = top + rectangle.height;
	let depth = 0;
	for (let clip = chain; clip; clip = clip.parent) {
		charge();
		if (++depth > 1024)
			throw new AgentBrowserError(
				"resource-limit",
				"Overflow clip depth limit exceeded",
			);
		if (clip.x) {
			left = Math.max(left, clip.box.x);
			right = Math.min(right, clip.box.x + clip.box.width);
		}
		if (clip.y) {
			top = Math.max(top, clip.box.y);
			bottom = Math.min(bottom, clip.box.y + clip.box.height);
		}
	}
	return right > left && bottom > top
		? Object.freeze({
				x: left,
				y: top,
				width: right - left,
				height: bottom - top,
			})
		: undefined;
}

export function rasterOverflowClips(
	chain: Readonly<OverflowClip> | undefined,
	capture: Readonly<OverflowRectangle>,
	charge: (work?: number) => void = () => {},
): readonly Readonly<RoundedBox>[] {
	const clips: Readonly<RoundedBox>[] = [];
	for (let clip = chain; clip; clip = clip.parent) {
		charge();
		if (clips.length >= 1024)
			throw new AgentBrowserError(
				"resource-limit",
				"Overflow clip depth limit exceeded",
			);
		const horizontal = clip.x ? clip.box.x : capture.x;
		const vertical = clip.y ? clip.box.y : capture.y;
		const width = clip.x ? clip.box.width : capture.width;
		const height = clip.y ? clip.box.height : capture.height;
		clips.push(
			createRoundedBox(
				horizontal - capture.x,
				vertical - capture.y,
				width,
				height,
				clip.box.radii,
			),
		);
	}
	return Object.freeze(clips);
}
