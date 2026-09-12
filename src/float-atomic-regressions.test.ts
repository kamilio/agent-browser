import { expect, it } from "vitest";
import { documentGeometry } from "./document-geometry.js";
import { layoutDocument } from "./document-layout.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { parseHtmlDocument } from "./html-parser.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles } from "./styles.js";
import { measureFormattingText } from "./text-layout.js";

function intrinsicFixture(css: string, children: string, viewport = 64) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}#atom{display:inline-block}${css}</style><span id="atom">${children}</span>`,
		"https://fixture.invalid/float-intrinsic-cases",
	);
	documentStyles(tree).setViewport(viewport, 128);
	const query = new DocumentQueries(tree);
	const atom = query.querySelector("#atom");
	if (atom === null) throw new Error("Missing intrinsic fixture owner");
	return {
		tree,
		rect: () => documentGeometry(tree).getBoundingClientRect(atom),
		close: () => {
			query.close();
			tree.close();
		},
	};
}

it("excludes a floated child's line from an otherwise empty atomic baseline", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}main{width:64px}</style><main><span id="atom" style="display:inline-block;width:20px"><span style="float:left;width:20px;height:40px">x</span></span>y</main>',
		"https://fixture.invalid/float-atomic-baseline",
	);
	try {
		documentStyles(tree).setViewport(64, 64);
		const query = new DocumentQueries(tree);
		const atom = query.querySelector("#atom");
		if (atom === null) throw new Error("Missing baseline owner");
		const rect = documentGeometry(tree).getBoundingClientRect(atom);
		expect(rect).toMatchObject({ width: 20, height: 40 });
		const glyph = layoutDocument(tree)
			.contexts.flatMap((context) => context.glyphs)
			.find((entry) => entry.character === "y");
		expect(glyph?.y).toBe(rect.y + 33);
		query.close();
	} finally {
		tree.close();
	}
});

it("shrink-to-fits an auto-width inline-block around a floating child", () => {
	const tree = parseHtmlDocument(
		'<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:8px}</style><span id="atom" style="display:inline-block"><span id="float" style="float:left;width:20px;height:20px"></span></span>',
		"https://fixture.invalid/float-atomic-intrinsic",
	);
	try {
		documentStyles(tree).setViewport(64, 64);
		const query = new DocumentQueries(tree);
		const atom = query.querySelector("#atom");
		const floated = query.querySelector("#float");
		if (atom === null || floated === null)
			throw new Error("Missing intrinsic owners");
		const geometry = documentGeometry(tree);
		expect(geometry.getBoundingClientRect(atom)).toMatchObject({
			width: 20,
			height: 20,
		});
		expect(geometry.getBoundingClientRect(floated)).toMatchObject({
			width: 20,
			height: 20,
		});
		query.close();
	} finally {
		tree.close();
	}
});

it.each(["left", "right"])(
	"measures an auto-width atom containing a %s float and inline text",
	(side) => {
		const page = intrinsicFixture(
			"",
			`<span style="float:${side};width:20px;height:20px"></span>AA`,
		);
		try {
			expect(page.rect()).toMatchObject({ width: 32, height: 20 });
		} finally {
			page.close();
		}
	},
);

it.each([
	[64, 30, 20],
	[15, 20, 40],
])(
	"measures floating siblings within a %ipx viewport",
	(viewport, width, height) => {
		const page = intrinsicFixture(
			"",
			'<span style="float:left;width:10px;height:20px"></span><span style="float:right;width:20px;height:20px"></span>',
			viewport,
		);
		try {
			expect(page.rect()).toMatchObject({ width, height });
		} finally {
			page.close();
		}
	},
);

it.each(["left", "right", "both"])(
	"separates intrinsic preferred-width groups after clear:%s",
	(clear) => {
		const side = clear === "right" ? "right" : "left";
		const page = intrinsicFixture(
			"",
			`<span style="float:${side};width:10px;height:20px"></span><span style="float:left;clear:${clear};width:20px;height:20px"></span>`,
		);
		try {
			expect(page.rect()).toMatchObject({ width: 20, height: 40 });
		} finally {
			page.close();
		}
	},
);

it("retains opposite-side preferred width when a later float clears only one side", () => {
	const page = intrinsicFixture(
		"",
		'<span style="float:left;width:10px;height:20px"></span><span style="float:right;width:20px;height:40px"></span><span style="float:left;clear:left;width:40px;height:20px"></span>',
	);
	try {
		expect(page.rect()).toMatchObject({ width: 60, height: 40 });
	} finally {
		page.close();
	}
});

it.each([
	[64, 30, 8],
	[18, 18, 16],
])(
	"recursively measures auto float content at viewport %i",
	(viewport, width, height) => {
		const page = intrinsicFixture(
			"",
			'<span style="float:left"><span style="float:right">AA BB</span></span>',
			viewport,
		);
		try {
			expect(page.rect()).toMatchObject({ width, height });
		} finally {
			page.close();
		}
	},
);

it("includes float margins, padding and borders in an atomic intrinsic contribution", () => {
	const page = intrinsicFixture(
		"#atom{padding:3px;border:1px solid red}",
		'<span style="float:left;width:10px;height:10px;margin:3px;padding:2px;border:1px solid blue"></span>',
	);
	try {
		expect(page.rect()).toMatchObject({ width: 30, height: 30 });
	} finally {
		page.close();
	}
});

function intrinsicInput() {
	const page = intrinsicFixture(
		"",
		'<span id="float" style="float:left;width:20px;height:20px"></span>',
	);
	const query = new DocumentQueries(page.tree);
	const rootRef = page.tree.reference(query.querySelector("#atom") as number);
	const floatRef = page.tree.reference(query.querySelector("#float") as number);
	query.close();
	const formatting = buildFormattingTree(page.tree);
	const root = formatting.nodes.find((node) => node.ref === rootRef);
	const floated = formatting.nodes.find((node) => node.ref === floatRef);
	if (!root || !floated) throw new Error("Missing intrinsic input nodes");
	return {
		...page,
		root: root.id,
		floated: floated.id,
		input: {
			formatting,
			widths: [{ id: root.id, ref: rootRef, contentX: 0, contentWidth: 0 }],
			images: [],
		},
	};
}

it.each(["min-content", "max-content"] as const)(
	"consumes frozen measured float contributions for %s without mutating them",
	(constraint) => {
		const page = intrinsicInput();
		try {
			const values = Object.freeze([
				Object.freeze({ id: page.floated, width: 20 }),
			]);
			const result = measureFormattingText(
				{ ...page.input, intrinsicFloats: values },
				constraint,
			);
			expect(result.widths).toContainEqual({ id: page.root, width: 20 });
			expect(values).toEqual([{ id: page.floated, width: 20 }]);
			expect(Object.isFrozen(result)).toBe(true);
		} finally {
			page.close();
		}
	},
);

it.each([
	["duplicate", "invalid-input"],
	["nonfloating", "unsupported"],
	["absent", "unsupported"],
	["negative id", "invalid-input"],
	["fractional id", "invalid-input"],
	["negative width", "invalid-input"],
	["nonfinite width", "invalid-input"],
	["oversized width", "resource-limit"],
	["missing metrics", "unsupported"],
])("rejects %s intrinsic float contributions", (kind, code) => {
	const page = intrinsicInput();
	try {
		const value = { id: page.floated, width: 20 };
		if (kind === "nonfloating") value.id = page.root;
		if (kind === "absent") value.id = page.input.formatting.nodes.length;
		if (kind === "negative id") value.id = -1;
		if (kind === "fractional id") value.id = 0.5;
		if (kind === "negative width") value.width = -1;
		if (kind === "nonfinite width") value.width = Number.NaN;
		if (kind === "oversized width") value.width = 16_777_217;
		const values =
			kind === "duplicate"
				? [value, value]
				: kind === "missing metrics"
					? []
					: [value];
		expect(() =>
			measureFormattingText(
				{ ...page.input, intrinsicFloats: values },
				"min-content",
			),
		).toThrow(expect.objectContaining({ code }));
	} finally {
		page.close();
	}
});
