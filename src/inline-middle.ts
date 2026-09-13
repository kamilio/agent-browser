import type { TextStyle } from "./css-text.js";
import { nativeFontXHeight } from "./font-metrics.js";
import { layoutNumber } from "./layout-values.js";

export interface InlineMiddleBox {
	borderBoxHeight: number;
	marginTop: number;
	marginBottom: number;
}

export function inlineMiddleBaseline(
	parent: TextStyle,
	box: Readonly<InlineMiddleBox>,
): number {
	const height = layoutNumber(box.borderBoxHeight);
	const marginTop = layoutNumber(box.marginTop, true);
	const marginBottom = layoutNumber(box.marginBottom, true);
	const halfHeight = layoutNumber(
		(height + marginTop + marginBottom) / 2,
		true,
	);
	const halfXHeight =
		nativeFontXHeight(
			Number.parseFloat(parent["font-size"]),
			Number(parent["font-weight"]),
			parent["font-family"],
		) / 2;
	return layoutNumber(halfHeight + halfXHeight - marginTop, true);
}
