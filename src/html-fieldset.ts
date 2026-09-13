import type { BoxSpecifiedStyle } from "./css-box.js";
import type { PaintSpecifiedStyle } from "./css-paint.js";
import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const fieldsetBox: BoxSpecifiedStyle = Object.freeze({
	"margin-left": "2px",
	"margin-right": "2px",
	"border-top-width": "2px",
	"border-right-width": "2px",
	"border-bottom-width": "2px",
	"border-left-width": "2px",
	"border-top-style": "groove",
	"border-right-style": "groove",
	"border-bottom-style": "groove",
	"border-left-style": "groove",
	"padding-top": "0.35em",
	"padding-right": "0.75em",
	"padding-bottom": "0.625em",
	"padding-left": "0.75em",
	"min-width": "min-content",
});
const legendBox: BoxSpecifiedStyle = Object.freeze({
	"padding-left": "2px",
	"padding-right": "2px",
});
const fieldsetPaint: PaintSpecifiedStyle = Object.freeze({
	"border-top-color": "rgb(240, 240, 240)",
	"border-right-color": "rgb(240, 240, 240)",
	"border-bottom-color": "rgb(240, 240, 240)",
	"border-left-color": "rgb(240, 240, 240)",
});

export function fieldsetBoxDefaults(
	node: Readonly<DocumentNode>,
): BoxSpecifiedStyle | undefined {
	if (isHtmlElement(node, "fieldset")) return fieldsetBox;
	if (isHtmlElement(node, "legend")) return legendBox;
	return undefined;
}

export function fieldsetPaintDefaults(
	node: Readonly<DocumentNode>,
): PaintSpecifiedStyle | undefined {
	return isHtmlElement(node, "fieldset") ? fieldsetPaint : undefined;
}
