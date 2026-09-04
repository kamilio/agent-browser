import { AgentBrowserError } from "./errors.js";

let graphemeSegmenter: Intl.Segmenter | undefined;

function nativeSegmenter(): Intl.Segmenter {
	if (graphemeSegmenter) return graphemeSegmenter;
	if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
		throw new AgentBrowserError(
			"unsupported",
			"Native grapheme segmentation is unavailable",
		);
	}
	graphemeSegmenter = new Intl.Segmenter(undefined, {
		granularity: "grapheme",
	});
	return graphemeSegmenter;
}

export function textGraphemeBoundaries(
	text: string,
	charge: (units?: number) => void,
): Set<number> {
	if (typeof text !== "string" || typeof charge !== "function") {
		throw new AgentBrowserError(
			"invalid-input",
			"Invalid grapheme boundary input",
		);
	}
	if (text.length > 500000) {
		throw new AgentBrowserError(
			"resource-limit",
			"Grapheme text length limit exceeded",
		);
	}
	charge(text.length || 1);
	charge();
	const boundaries = new Set<number>([0]);
	if (/^[\x20-\x7e]*$/.test(text)) {
		for (let offset = 1; offset <= text.length; offset++) {
			charge();
			boundaries.add(offset);
		}
		return boundaries;
	}
	charge();
	const iterator = nativeSegmenter().segment(text)[Symbol.iterator]();
	while (true) {
		charge();
		const next = iterator.next();
		if (next.done) break;
		charge();
		boundaries.add(next.value.index + next.value.segment.length);
	}
	return boundaries;
}
