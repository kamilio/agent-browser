import { expect, it } from "vitest";
import {
	type DocumentFlowCoordinator,
	layoutDocument,
	layoutFormattingDocument,
} from "./document-layout.js";
import { AgentBrowserError } from "./errors.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { snapshotDocument } from "./snapshot.js";
import { documentStyles } from "./styles.js";
import { layoutDocumentText } from "./text-layout.js";

function fixture(content: string, css: string) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:32px}#float{float:left;width:8px;height:24px}#cleared{clear:both}${css}</style><main id="main">${content}</main>`,
		"https://fixture.invalid/nonfloating-clearance-boundaries",
	);
	documentStyles(tree).setViewport(128, 256);
	const query = new DocumentQueries(tree);
	const source = snapshotDocument(tree);
	const revision = tree.revision;
	const formatting = buildFormattingTree(tree);
	const owners = JSON.stringify(formatting);
	const ref = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing ${selector}`);
		return tree.reference(found);
	};
	const layout = () => {
		const result = layoutDocument(tree);
		expect(Object.isFrozen(result.boxes)).toBe(true);
		return result;
	};
	return {
		tree,
		ref,
		layout,
		box: (selector: string) => {
			const matches = layout().boxes.filter((box) => box.ref === ref(selector));
			expect(matches).toHaveLength(1);
			return matches[0];
		},
		context: (selector: string) => {
			const matches = layout().contexts.filter(
				(context) => context.ref === ref(selector),
			);
			expect(matches).toHaveLength(1);
			return matches[0];
		},
		close: () => {
			try {
				expect(tree.revision).toBe(revision);
				expect(snapshotDocument(tree)).toEqual(source);
				expect(JSON.stringify(formatting)).toBe(owners);
			} finally {
				query.close();
				tree.close();
				expect(tree.nodeCount).toBe(0);
				expect(query.metrics()).toMatchObject({
					closed: true,
					cachedSelectors: 0,
					indexedNodes: 0,
				});
			}
		},
	};
}

it.each([
	[1, 6],
	[2, 6],
	[2, -4],
])(
	"recomputes %i nested empty parents and removes the stale %ipx trailing strut",
	(depth, incomingBottom) => {
		let nested = '<div id="cleared"></div>';
		for (let index = 0; index < depth; index++)
			nested = `<section id="nest${index}">${nested}</section>`;
		const page = fixture(
			`<section id="parent"><div id="before"><span id="float"></span>AA</div>${nested}</section><div id="after">BB</div>`,
			`#before{margin-bottom:${incomingBottom}px}#after{margin-top:3px}`,
		);
		try {
			expect(page.box("#before")).toMatchObject({
				borderY: 0,
				borderBoxHeight: 8,
				marginBottom: incomingBottom,
			});
			expect(page.box("#float")).toMatchObject({
				borderY: 0,
				borderBoxHeight: 24,
			});
			expect(page.box("#cleared")).toMatchObject({
				borderY: 24,
				borderBoxHeight: 0,
				marginCollapse: { through: false, bottom: { value: 0 } },
			});
			for (let index = 0; index < depth; index++)
				expect(page.box(`#nest${index}`)).toMatchObject({
					borderY: 8 + incomingBottom,
					naturalContentHeight: 16 - incomingBottom,
					contentHeight: 16 - incomingBottom,
					marginCollapse: { through: false, bottom: { value: 0 } },
				});
			expect(page.box("#parent")).toMatchObject({
				borderY: 0,
				contentHeight: 24,
				marginCollapse: { bottom: { value: 0 } },
			});
			expect(page.box("#after").borderY).toBe(27);
			expect(page.box("#main").contentHeight).toBe(35);
		} finally {
			page.close();
		}
	},
);

it.each([9, 12, 14])(
	"rechecks a cached later clearance after an earlier empty block advances flow (%ipx margin)",
	(secondTop) => {
		const page = fixture(
			'<div id="before"><span id="left"></span><span id="right"></span>AA</div><section id="parent"><div id="first"></div><div id="second">BB</div></section><div id="after">CC</div>',
			`#left{float:left;width:8px;height:16px}#right{float:right;width:8px;height:24px}#first{clear:left}#second{clear:right;margin-top:${secondTop}px}`,
		);
		try {
			expect(page.box("#parent")).toMatchObject({
				borderY: 8,
				contentHeight: 16 + secondTop,
				marginCollapse: { top: { value: 0 } },
			});
			expect(page.box("#first")).toMatchObject({
				borderY: 16,
				contentHeight: 0,
			});
			expect(page.box("#second")).toMatchObject({
				borderY: 16 + secondTop,
				contentHeight: 8,
			});
			expect(page.box("#after").borderY).toBe(24 + secondTop);
		} finally {
			page.close();
		}
	},
);

it.each([
	[10, 6],
	[-10, -6],
])(
	"retains an ancestor strut supplied by the intermediate parent's own margin (%i, %i)",
	(parentTop, clearTop) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><section id="outer"><section id="parent"><div id="cleared">BB</div></section></section><div id="after">CC</div>',
			`#parent{margin-top:${parentTop}px}#cleared{margin-top:${clearTop}px}`,
		);
		try {
			for (const selector of ["#outer", "#parent"])
				expect(page.box(selector)).toMatchObject({
					borderY: 8 + parentTop,
					contentHeight: 24 - parentTop,
					marginCollapse: { top: { value: parentTop } },
				});
			expect(page.box("#cleared")).toMatchObject({
				borderY: 24,
				contentHeight: 8,
				marginTop: clearTop,
			});
			expect(page.box("#after").borderY).toBe(32);
			expect(page.box("#main").contentHeight).toBe(40);
		} finally {
			page.close();
		}
	},
);

it.each([10, -4])(
	"does not erase an ancestor's later-sibling %ipx escape risk at a zero-strut wrapper",
	(tailTop) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><section id="parent"><section id="wrapper"><div id="cleared"></div></section><div id="tail">BB</div></section><div id="after">CC</div>',
			`#tail{margin-top:${tailTop}px}`,
		);
		try {
			expect(page.box("#parent")).toMatchObject({
				borderY: 8,
				contentHeight: 24 + tailTop,
				marginCollapse: { top: { value: 0 } },
			});
			expect(page.box("#wrapper")).toMatchObject({
				borderY: 8,
				contentHeight: 16,
				marginCollapse: { through: false },
			});
			expect(page.box("#cleared")).toMatchObject({
				borderY: 24,
				contentHeight: 0,
				marginCollapse: { through: false },
			});
			expect(page.box("#tail").borderY).toBe(24 + tailTop);
			expect(page.box("#after").borderY).toBe(32 + tailTop);
			expect(page.box("#main").contentHeight).toBe(40 + tailTop);
		} finally {
			page.close();
		}
	},
);

it.each([
	[-6, 4],
	[6, -4],
	[-6, -4],
	[8, 8],
])(
	"clears the signed incoming boundary (%i, %i) without breaking outgoing collapse",
	(incomingBottom, incomingTop) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><div id="cleared">BB</div><div id="after">CC</div>',
			`#before{margin-bottom:${incomingBottom}px}#cleared{margin-top:${incomingTop}px;margin-bottom:5px}#after{margin-top:-2px}`,
		);
		try {
			expect(page.box("#cleared")).toMatchObject({
				borderY: 24,
				borderBoxHeight: 8,
				marginTop: incomingTop,
				marginBottom: 5,
				marginCollapse: { bottom: { value: 5 } },
			});
			expect(page.box("#after").borderY).toBe(35);
			expect(page.box("#main").contentHeight).toBe(43);
			expect(page.context("#before").glyphs.map((glyph) => glyph.y)).toEqual([
				0, 0,
			]);
			expect(page.box("#float").borderY).toBe(0);
		} finally {
			page.close();
		}
	},
);

it.each([
	["no matching side", "right", 64],
	["already below the float", "left", 12],
	["exactly at the float bottom", "left", 38],
] as const)(
	"preserves nonzero empty through-collapse when clear is a no-op: %s",
	(_label, side, floatHeight) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><div id="cleared"></div><div id="after">BB</div>',
			`#float{float:${side};height:${floatHeight}px}#before{height:32px;margin-bottom:6px}#cleared{clear:left;margin-top:4px;margin-bottom:9px}#after{margin-top:3px}`,
		);
		try {
			expect(page.box("#cleared")).toMatchObject({
				borderY: 38,
				contentHeight: 0,
				marginCollapse: {
					through: true,
					top: { value: 9 },
					bottom: { value: 9 },
				},
			});
			expect(page.box("#after").borderY).toBe(41);
			expect(page.box("#main").contentHeight).toBe(49);
			expect(page.box("#float").borderBoxHeight).toBe(floatHeight);
		} finally {
			page.close();
		}
	},
);

it("does not borrow an overflowing float from an earlier independent owner", () => {
	const page = fixture(
		'<section id="independent"><span id="float"></span></section><div id="cleared">AA</div><div id="after">BB</div>',
		"#independent{display:flow-root;height:8px}#float{height:40px}",
	);
	try {
		expect(page.box("#independent").borderBoxHeight).toBe(8);
		expect(page.box("#float")).toMatchObject({
			borderY: 0,
			borderBoxHeight: 40,
		});
		expect(page.box("#cleared").borderY).toBe(8);
		expect(page.context("#cleared").glyphs.map((glyph) => glyph.x)).toEqual([
			0, 6,
		]);
		expect(page.box("#after").borderY).toBe(16);
		expect(page.box("#main").contentHeight).toBe(24);
	} finally {
		page.close();
	}
});

it("queries the outer float owner before creating a clearing independent owner", () => {
	const page = fixture(
		'<div id="before"><span id="float"></span>AA</div><section id="cleared"><span id="inner"></span>BB</section><div id="after">CC</div>',
		"#cleared{display:flow-root}#inner{float:right;width:8px;height:12px}",
	);
	try {
		expect(page.box("#cleared")).toMatchObject({
			borderY: 24,
			contentHeight: 12,
		});
		expect(page.box("#inner")).toMatchObject({
			borderX: 24,
			borderY: 24,
			borderBoxHeight: 12,
		});
		expect(page.context("#cleared").lines.map((line) => line.top)).toEqual([
			24,
		]);
		expect(page.box("#after").borderY).toBe(36);
		expect(page.box("#main").contentHeight).toBe(44);
		expect(page.box("#float").borderY).toBe(0);
	} finally {
		page.close();
	}
});

it("does not retroactively use a taller future float or duplicate its owner", () => {
	const page = fixture(
		'<div id="before"><span id="float"></span>AA</div><div id="cleared">BB</div><div id="after"><span id="future"></span>CC</div>',
		"#future{float:right;width:8px;height:80px}",
	);
	try {
		expect(page.box("#cleared").borderY).toBe(24);
		expect(page.box("#after").borderY).toBe(32);
		expect(page.box("#future")).toMatchObject({
			borderX: 24,
			borderY: 32,
			borderBoxHeight: 80,
		});
		expect(page.box("#float").borderY).toBe(0);
		expect(page.box("#main").contentHeight).toBe(40);
		expect(page.context("#cleared").glyphs.map((glyph) => glyph.y)).toEqual([
			24, 24,
		]);
	} finally {
		page.close();
	}
});

it.each(["both"])(
	"wraps text at its final clear:%s origin instead of moving two provisional lines",
	(clear) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><div id="cleared">AA BB</div><div id="after">CC</div>',
			`#cleared{clear:${clear}}`,
		);
		try {
			expect(page.box("#cleared")).toMatchObject({
				borderX: 0,
				borderY: 24,
				contentWidth: 32,
				contentHeight: 8,
			});
			expect(page.context("#cleared").lines.map((line) => line.top)).toEqual([
				24,
			]);
			expect(
				page
					.context("#cleared")
					.glyphs.filter((glyph) => glyph.character !== " ")
					.map((glyph) => [glyph.character, glyph.x, glyph.y]),
			).toEqual([
				["A", 0, 24],
				["A", 6, 24],
				["B", 18, 24],
				["B", 24, 24],
			]);
			expect(
				page.context("#before").glyphs.map((glyph) => [glyph.x, glyph.y]),
			).toEqual([
				[8, 0],
				[14, 0],
			]);
			expect(page.box("#after").borderY).toBe(32);
			expect(page.box("#main").contentHeight).toBe(40);
		} finally {
			page.close();
		}
	},
);

it.each([0, 4, 8])(
	"anchors a clearing block's own float at its content origin with margin-top:%ipx",
	(marginTop) => {
		const page = fixture(
			'<div id="before"><span id="float"></span>AA</div><div id="cleared"><span id="inner"></span>BB</div><div id="after">CC</div>',
			`#cleared{margin-top:${marginTop}px}#inner{float:right;width:8px;height:8px}`,
		);
		try {
			expect(page.box("#cleared")).toMatchObject({
				borderY: 24,
				contentY: 24,
				marginTop,
			});
			expect(page.box("#inner")).toMatchObject({
				borderX: 24,
				borderY: 24,
				borderBoxHeight: 8,
			});
			expect(
				page.context("#cleared").glyphs.map((glyph) => [glyph.x, glyph.y]),
			).toEqual([
				[0, 24],
				[6, 24],
			]);
			expect(page.box("#after").borderY).toBe(32);
			expect(page.box("#main").contentHeight).toBe(40);
			expect(page.box("#float").borderY).toBe(0);
		} finally {
			page.close();
		}
	},
);

function coordinatorFor(
	target: string,
	floor: unknown,
	entered: string[],
): DocumentFlowCoordinator {
	return {
		work: () => 0,
		clearanceBottom: (frame) => {
			expect(Object.isFrozen(frame)).toBe(true);
			return frame.node.ref === target ? (floor as number | null) : null;
		},
		enterBlock: (frame) => {
			if (frame.node.ref) entered.push(frame.node.ref);
		},
		layoutText: (context) => ({
			context,
			metrics: {
				tokens: 0,
				lines: 0,
				glyphs: 0,
				fragments: 0,
				unsupportedGlyphs: 0,
				work: 0,
			},
		}),
		naturalHeight: (frame) => frame.naturalContentHeight,
		positionBlock: (frame) => frame.borderY,
		finishBlock: () => {},
	};
}

it.each([
	["undefined", undefined],
	["NaN", Number.NaN],
] as const)(
	"rejects a malformed %s clearance floor before entering the target owner",
	(_label, floor) => {
		const page = fixture('<div id="cleared"></div>', "#cleared{height:8px}");
		try {
			const text = layoutDocumentText(page.tree);
			const original = JSON.stringify(text);
			const entered: string[] = [];
			let failure: unknown;
			try {
				layoutFormattingDocument(
					text,
					undefined,
					false,
					new Map(),
					coordinatorFor(page.ref("#cleared"), floor, entered),
				);
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(AgentBrowserError);
			expect(failure).toMatchObject({ code: "invalid-input" });
			expect(entered).not.toContain(page.ref("#cleared"));
			expect(JSON.stringify(text)).toBe(original);
		} finally {
			page.close();
		}
	},
);

it("accepts an explicit null clearance floor without replacing text owners", () => {
	const page = fixture('<div id="cleared"></div>', "#cleared{height:8px}");
	try {
		const text = layoutDocumentText(page.tree);
		const original = JSON.stringify(text);
		const entered: string[] = [];
		const result = layoutFormattingDocument(
			text,
			undefined,
			false,
			new Map(),
			coordinatorFor(page.ref("#cleared"), null, entered),
		);
		const boxes = result.boxes.filter(
			(box) => box.ref === page.ref("#cleared"),
		);
		expect(boxes).toHaveLength(1);
		expect(boxes[0]).toMatchObject({ borderY: 0, contentHeight: 8 });
		expect(entered.filter((ref) => ref === page.ref("#cleared"))).toHaveLength(
			1,
		);
		expect(result.contexts.map((context) => context.id)).toEqual(
			text.contexts.map((context) => context.id),
		);
		expect(JSON.stringify(text)).toBe(original);
	} finally {
		page.close();
	}
});
