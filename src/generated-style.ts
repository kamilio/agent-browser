import { initialBoxStyle } from "./css-box.js";
import { initialPaintStyle } from "./css-paint.js";
import type { DocumentTree } from "./document.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { documentStyles } from "./styles.js";

export function generatedControlStyle(tree: DocumentTree, reference: string) {
	const target = documentGeneratedControls(tree).resolve(reference);
	const styles = documentStyles(tree);
	const visibility = styles.get(target.owner);
	return Object.freeze({
		display: "list-item" as const,
		visibility: visibility.visibility,
		displayed: visibility.displayed,
		visible: visibility.visible,
		box: initialBoxStyle,
		text: styles.text(target.owner),
		paint: Object.freeze({
			...initialPaintStyle,
			color: styles.paint(target.owner).color,
		}),
		list: Object.freeze({
			"list-style-type": Object.hasOwn(
				tree.get(target.owner).attributes,
				"open",
			)
				? ("disclosure-open" as const)
				: ("disclosure-closed" as const),
			"list-style-position": "inside" as const,
		}),
		pointerEvents: styles.pointerEvents(target.owner),
	});
}
