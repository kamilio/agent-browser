import type { BoxSpecifiedStyle } from "./css-box.js";
import type { FlexSpecifiedStyle } from "./css-flex.js";
import type { TextSpecifiedStyle } from "./css-text.js";
import type { DocumentNode } from "./document.js";
import { isHtmlElement } from "./dom-namespaces.js";

const box: BoxSpecifiedStyle = Object.freeze({ "box-sizing": "border-box" });
const text: TextSpecifiedStyle = Object.freeze({
	"text-align": "center",
	"line-height": "normal",
	"text-indent": "0px",
	"text-transform": "none",
});
const flex: FlexSpecifiedStyle = Object.freeze({ "align-content": "center" });

export function buttonBoxDefaults(node: Readonly<DocumentNode>) {
	return isHtmlElement(node, "button") ? box : undefined;
}

export function buttonTextDefaults(node: Readonly<DocumentNode>) {
	return isHtmlElement(node, "button") ? text : undefined;
}

export function buttonFlexDefaults(node: Readonly<DocumentNode>) {
	return isHtmlElement(node, "button") ? flex : undefined;
}
