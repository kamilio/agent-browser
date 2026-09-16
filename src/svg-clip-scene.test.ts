import { expect, it } from "vitest";
import { resolvedStyleValue } from "./computed-styles.js";
import { documentGeometry } from "./document-geometry.js";
import { rasterizeDocument } from "./document-raster.js";
import type { DocumentTree } from "./document.js";
import { htmlNamespace, svgNamespace } from "./dom-namespaces.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { decodeImage } from "./image-decoder.js";
import { InlineStyles } from "./inline-styles.js";
import type { RasterImage } from "./raster.js";
import type { ScriptHostObjectDefinition } from "./script-dom.js";
import { DocumentQueries } from "./selectors.js";
import { documentStyles, type DocumentStyles } from "./styles.js";
import { rasterizeSvgScene } from "./svg-projection.js";
import { documentSvgScene } from "./svg-scene.js";

interface InlineStyle {
	getPropertyValue(name: string): string;
	getPropertyPriority(name: string): string;
	setProperty(name: string, value: string, priority?: string): void;
	removeProperty(name: string): string;
}

interface Fixture {
	tree: DocumentTree;
	root: number;
	styles: DocumentStyles;
	id(selector: string): number;
	style(selector: string): InlineStyle;
	value(selector: string, property: string): string;
	scene(charge?: (amount: number) => void): ReturnType<typeof documentSvgScene>;
	image(): RasterImage;
}

const noCharge = () => {};
const red = [255, 0, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];
const rectangle = '<rect id="target" width="12" height="12" fill="red"/>';
const half = '<rect id="clipShape" width="6" height="12"/>';
const ring = "M0 0H12V12H0Z M4 4H8V8H4Z";
const factory = {
	createHostObject(definition: ScriptHostObjectDefinition): object {
		const object = Object.create(null);
		for (const [name, descriptor] of Object.entries(
			definition.properties ?? {},
		))
			Object.defineProperty(object, name, descriptor);
		for (const [name, value] of Object.entries(definition.methods ?? {}))
			Object.defineProperty(object, name, { value });
		return object;
	},
};

function definition(children = half, attributes = "", name = "Crop") {
	return `<clipPath id="${name}" ${attributes}>${children}</clipPath>`;
}

function target(attributes = 'clip-path="url(#Crop)"') {
	return rectangle.replace("/>", ` ${attributes}/>`);
}

function withFixture(
	content: string,
	inspect: (fixture: Fixture) => void,
	css = "",
) {
	const tree = parseHtmlDocument(
		`<!doctype html><style>html,body{margin:0;background:white}svg{display:block}${css}</style><main><svg width="12" height="12" viewBox="0 0 12 12">${content}</svg></main>`,
		"https://fixture.invalid/svg-clip-scene",
	);
	let queries: DocumentQueries | undefined;
	let inline: InlineStyles | undefined;
	try {
		const owner = new DocumentQueries(tree);
		queries = owner;
		const id = (selector: string) => {
			const found = owner.querySelector(selector);
			if (found === null) throw new Error(`Missing clip fixture ${selector}`);
			return found;
		};
		const root = id("svg");
		const styles = documentStyles(tree);
		styles.setViewport(24, 24);
		const declarations = new InlineStyles(tree, factory);
		inline = declarations;
		const scene = (charge: (amount: number) => void = noCharge) =>
			documentSvgScene(tree, root, charge);
		inspect({
			tree,
			root,
			styles,
			id,
			style: (selector) => declarations.get(id(selector)) as InlineStyle,
			value: (selector, property) =>
				resolvedStyleValue(tree, id(selector), property),
			scene,
			image: () => rasterizeSvgScene(scene(), 12, 12, noCharge),
		});
	} finally {
		inline?.close();
		queries?.close();
		tree.close();
		if (queries)
			expect(queries.metrics()).toMatchObject({
				closed: true,
				indexedNodes: 0,
				cachedSelectors: 0,
			});
		if (inline)
			expect(inline.stats).toEqual({ objects: 0, cachedCodeUnits: 0 });
		expect(tree.nodeCount).toBe(0);
	}
}

function decode(content: string, css = "") {
	const result = decodeImage(
		new TextEncoder().encode(
			`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><style>${css}</style>${content}</svg>`,
		),
		"image/svg+xml",
	);
	if (result.mediaType !== "image/svg+xml")
		throw new Error("Expected SVG decode");
	return result;
}

function pixel(image: RasterImage, column: number, row: number) {
	const offset = (row * image.width + column) * 4;
	return Array.from(image.pixels.slice(offset, offset + 4));
}

function insertUnrelated(
	tree: DocumentTree,
	parent: number,
	count: number,
	before?: number,
) {
	for (let index = 0; index < count; index++)
		tree.insert(parent, tree.createElement("div"), before);
}

function insertOutsideDefinition(
	fixture: Fixture,
	name = "Crop",
	before?: number,
	width = "6",
) {
	const { tree, id } = fixture;
	const sibling = tree.createParserElement(
		"svg",
		{ style: "display:none" },
		svgNamespace,
	);
	const clip = tree.createParserElement("clipPath", { id: name }, svgNamespace);
	const shape = tree.createParserElement(
		"rect",
		{ width, height: "12" },
		svgNamespace,
	);
	tree.append(clip, shape);
	tree.append(sibling, clip);
	tree.insert(id("main"), sibling, before);
	return { sibling, clip };
}

it("preserves the unclipped scene and decoded raster defaults", () => {
	withFixture(rectangle, ({ scene, value }) => {
		expect(value("#target", "clip-path")).toBe("none");
		expect(value("#target", "clip-rule")).toBe("nonzero");
		expect(scene().shapes[0].clips).toBeUndefined();
	});
	const result = decode(rectangle);
	expect(result.shapes).toBe(1);
	expect(result.intrinsic).toEqual({ width: 12, height: 12 });
	expect(pixel(result.image, 10, 10)).toEqual(red);
});

it.each(["attribute", "stylesheet", "inline"])(
	"actually decodes and clips SVG through %s declarations",
	(mode) => {
		const attributes =
			mode === "attribute"
				? 'clip-path="url(#Crop)"'
				: mode === "inline"
					? "style=\"clip-path:URL('#Crop')\""
					: "";
		const css = mode === "stylesheet" ? '#target{CLIP-PATH:URL("#Crop")}' : "";
		const content = `<defs>${definition()}</defs>${target(attributes)}`;
		const result = decode(content, css);
		expect(pixel(result.image, 2, 6)).toEqual(red);
		expect(pixel(result.image, 9, 6)[3]).toBe(0);
		withFixture(
			content,
			({ value, scene }) => {
				expect(value("#target", "clip-path")).toBe('url("#Crop")');
				expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(1);
			},
			css,
		);
	},
);

it("clips to a true cubic curved region rather than its rectangle", () => {
	const curve =
		'<path d="M6 1C9 1 11 3 11 6C11 9 9 11 6 11C3 11 1 9 1 6C1 3 3 1 6 1Z"/>';
	const result = decode(`${definition(curve)}${target()}`);
	expect(pixel(result.image, 6, 6)).toEqual(red);
	expect(pixel(result.image, 1, 1)[3]).toBe(0);
	expect(pixel(result.image, 10, 1)[3]).toBe(0);
	withFixture(`${definition(curve)}${target()}`, ({ scene }) => {
		expect(
			scene().shapes[0].clips?.[0].shapes[0].path.some(
				(segment) => segment.kind === "cubic",
			),
		).toBe(true);
	});
});

it("unions clip children before intersecting independently specified ancestor clips", () => {
	const content = `${definition('<rect width="4" height="12"/><rect x="8" width="4" height="12"/>')}${definition('<rect y="4" width="12" height="4"/>', "", "Band")}<g clip-path="url(#Crop)">${target('clip-path="url(#Band)"')}</g>`;
	withFixture(content, ({ scene, image }) => {
		const clips = scene().shapes[0].clips;
		expect(clips).toHaveLength(2);
		expect(clips?.map((region) => region.shapes.length)).toEqual([2, 1]);
		const raster = image();
		expect(pixel(raster, 1, 5)).toEqual(red);
		expect(pixel(raster, 10, 5)).toEqual(red);
		expect(pixel(raster, 6, 5)[3]).toBe(0);
		expect(pixel(raster, 1, 1)[3]).toBe(0);
	});
	expect(pixel(decode(content).image, 10, 5)).toEqual(red);
});

it("transforms a mirrored clipped group under translation without clipping its sibling", () => {
	const content = `${definition('<rect width="2" height="4"/>')}<g transform="translate(1 1)"><g clip-path="url(#Crop)" transform="matrix(2 0 0 -2 1 8)"><rect width="4" height="4" fill="red"/></g></g><rect id="sibling" x="9" y="2" width="2" height="2" fill="blue"/>`;
	withFixture(content, ({ scene, image }) => {
		const result = scene();
		expect(result.shapes[0].clips?.[0].shapes[0].transform).toEqual([
			2, 0, 0, -2, 2, 9,
		]);
		expect(result.shapes[1].clips).toBeUndefined();
		const raster = image();
		expect(pixel(raster, 3, 3)).toEqual(red);
		expect(pixel(raster, 7, 5)[3]).toBe(0);
		expect(pixel(raster, 10, 2)).toEqual(blue);
	});
	expect(pixel(decode(content).image, 7, 5)[3]).toBe(0);
});

it("composes definition and child transforms in referencing local coordinates", () => {
	const content = `${definition('<rect width="2" height="4" transform="translate(1 0)"/>', 'transform="translate(2 0)"')}<g transform="translate(1 2)">${target()}</g>`;
	withFixture(content, ({ scene, image }) => {
		expect(scene().shapes[0].clips?.[0].shapes[0].transform).toEqual([
			1, 0, 0, 1, 4, 2,
		]);
		const raster = image();
		expect(pixel(raster, 4, 3)).toEqual(red);
		expect(pixel(raster, 2, 3)[3]).toBe(0);
	});
});

it("does not multiply target opacity where clipping child silhouettes overlap", () => {
	const content = `${definition('<rect width="8" height="12"/><rect x="4" width="8" height="12"/>')}${target('clip-path="url(#Crop)" opacity=".5"')}`;
	const raster = decode(content).image;
	expect(pixel(raster, 2, 6)).toEqual([255, 0, 0, 128]);
	expect(pixel(raster, 6, 6)).toEqual([255, 0, 0, 128]);
	expect(pixel(raster, 10, 6)).toEqual([255, 0, 0, 128]);
});

it("uses a shape's unclipped geometry, not stroke expansion, for objectBoundingBox", () => {
	const content = `${definition('<rect width=".5" height="1"/>', 'clipPathUnits="objectBoundingBox"')}<rect id="target" x="2" y="2" width="8" height="8" fill="red" stroke="blue" stroke-width="2" clip-path="url(#Crop)"/>`;
	withFixture(content, ({ scene, image }) => {
		expect(scene().shapes[0].clips?.[0].shapes[0].transform).toEqual([
			8, 0, 0, 8, 2, 2,
		]);
		const raster = image();
		expect(pixel(raster, 4, 5)).toEqual(red);
		expect(pixel(raster, 7, 5)[3]).toBe(0);
		expect(pixel(raster, 1, 5)[3]).toBe(0);
	});
});

it("resolves a rotated group's object bbox in group-local rather than root coordinates", () => {
	const content = `${definition('<rect width=".5" height="1"/>', 'clipPathUnits="objectBoundingBox"')}<g clip-path="url(#Crop)" transform="matrix(0 1 -1 0 10 1)"><rect width="4" height="2" fill="red"/><rect x="4" width="4" height="2" fill="blue"/></g>`;
	withFixture(content, ({ scene, image }) => {
		const result = scene();
		expect(result.shapes[0].clips).toBe(result.shapes[1].clips);
		expect(result.shapes[0].clips?.[0].shapes[0].transform).toEqual([
			0, 8, -2, 0, 10, 1,
		]);
		const raster = image();
		expect(pixel(raster, 9, 2)).toEqual(red);
		expect(pixel(raster, 9, 7)[3]).toBe(0);
	});
});

it.each(["", 'clipPathUnits="userSpaceOnUse"'])(
	"uses referencing user space for default/explicit units %s",
	(attributes) => {
		withFixture(
			`${definition(half, attributes)}${target('x="2" clip-path="url(#Crop)"')}`,
			({ scene }) => {
				expect(scene().shapes[0].clips?.[0].shapes[0].transform).toEqual([
					1, 0, 0, 1, 0, 0,
				]);
			},
		);
	},
);

it("keeps a valid empty clip distinct from a missing reference", () => {
	withFixture(`${definition("")}${target()}`, ({ scene, image }) => {
		expect(scene().shapes[0].clips).toEqual([{ shapes: [] }]);
		expect(image().pixels.every((channel) => channel === 0)).toBe(true);
	});
	expect(
		decode(`${definition("")}${target()}`).image.pixels.every(
			(channel) => channel === 0,
		),
	).toBe(true);
});

it.each(["Missing", "crop", "%ZZ", "%E0%A4%A"])(
	"leaves invalid or case-mismatched local reference %s unclipped",
	(reference) => {
		const content = `${definition()}${target(`clip-path="url(#${reference})"`)}`;
		withFixture(content, ({ scene }) =>
			expect(scene().shapes[0].clips).toBeUndefined(),
		);
		expect(pixel(decode(content).image, 10, 6)).toEqual(red);
	},
);

it("percent-decodes the case-preserved local fragment before lookup", () => {
	withFixture(
		`${definition()}${target('clip-path="url(#%43rop)"')}`,
		({ image, value }) => {
			expect(value("#target", "clip-path")).toBe('url("#%43rop")');
			expect(pixel(image(), 9, 6)[3]).toBe(0);
		},
	);
});

it.each(["rect", "linearGradient"])(
	"ignores a local reference to wrong-kind %s",
	(tag) => {
		const content = `<defs><${tag} id="Crop"/></defs>${target()}`;
		withFixture(content, ({ scene }) =>
			expect(scene().shapes[0].clips).toBeUndefined(),
		);
		expect(pixel(decode(content).image, 9, 6)).toEqual(red);
	},
);

it("does not treat an HTML-namespace clipPath as an SVG clip source", () => {
	withFixture(`<defs id="definitions"/>${target()}`, ({ tree, id, scene }) => {
		const foreign = tree.createParserElement(
			"clipPath",
			{ id: "Crop" },
			htmlNamespace,
		);
		tree.append(id("#definitions"), foreign);
		expect(scene().shapes[0].clips).toBeUndefined();
	});
});

it.each([true, false])(
	"actually clips through an outside-root definition beforeRoot=%s",
	(beforeRoot) => {
		withFixture(target(), ({ tree, root, id, scene }) => {
			const sibling = tree.createParserElement(
				"svg",
				{ style: "display:none" },
				svgNamespace,
			);
			const definitions = tree.createParserElement("defs", {}, svgNamespace);
			const clip = tree.createParserElement(
				"clipPath",
				{ id: "Crop" },
				svgNamespace,
			);
			const shape = tree.createParserElement(
				"rect",
				{ width: "6", height: "12" },
				svgNamespace,
			);
			tree.append(clip, shape);
			tree.append(definitions, clip);
			tree.append(sibling, definitions);
			tree.insert(id("main"), sibling, beforeRoot ? root : undefined);
			const result = scene();
			expect(result.shapes[0].clips).toHaveLength(1);
			const raster = rasterizeSvgScene(result, 12, 12, noCharge);
			expect(pixel(raster, 2, 6)).toEqual(red);
			expect(pixel(raster, 9, 6)[3]).toBe(0);
		});
	},
);

it("honors the first outside wrong-kind ID over a local valid clipPath", () => {
	withFixture(`${definition()}${target()}`, ({ tree, root, id, scene }) => {
		const sibling = tree.createParserElement(
			"svg",
			{ style: "display:none" },
			svgNamespace,
		);
		const wrongKind = tree.createParserElement(
			"rect",
			{ id: "Crop", width: "12", height: "12" },
			svgNamespace,
		);
		tree.append(sibling, wrongKind);
		tree.insert(id("main"), sibling, root);
		expect(id("#Crop")).toBe(wrongKind);
		const result = scene();
		expect(result.shapes[0].clips).toBeUndefined();
		const raster = rasterizeSvgScene(result, 12, 12, noCharge);
		expect(pixel(raster, 2, 6)).toEqual(red);
		expect(pixel(raster, 9, 6)).toEqual(red);
	});
});

it("resolves an early clip without charging an unrelated tail over 4096 nodes", () => {
	withFixture(`${definition()}${target()}`, ({ tree, id, scene }) => {
		let baselineWork = 0;
		const baseline = scene((amount) => {
			baselineWork += amount;
		});
		insertUnrelated(tree, id("main"), 4097);
		let work = 0;
		const result = scene((amount) => {
			work += amount;
		});
		expect(result.shapes[0].clips).toHaveLength(1);
		expect(result).toEqual(baseline);
		expect(work).toBe(baselineWork);
	});
});

it.each([true, false])(
	"stops at an outside-root clip before a long tail with beforeRoot=%s",
	(beforeRoot) => {
		withFixture(target(), (fixture) => {
			const { tree, root, id, scene } = fixture;
			insertOutsideDefinition(fixture, "Crop", beforeRoot ? root : undefined);
			insertUnrelated(tree, id("main"), 4097);
			const result = scene();
			expect(result.shapes[0].clips).toHaveLength(1);
			const raster = rasterizeSvgScene(result, 12, 12, noCharge);
			expect(pixel(raster, 2, 6)).toEqual(red);
			expect(pixel(raster, 9, 6)[3]).toBe(0);
		});
	},
);

it.each([
	["rect", svgNamespace],
	["clipPath", htmlNamespace],
] as const)(
	"stops at the first wrong-kind %s in %s before a duplicate and long tail",
	(tag, namespace) => {
		withFixture(`${definition()}${target()}`, ({ tree, root, id, scene }) => {
			const blocker = tree.createParserElement(tag, { id: "Crop" }, namespace);
			tree.insert(id("main"), blocker, root);
			insertUnrelated(tree, id("main"), 4097);
			expect(scene().shapes[0].clips).toBeUndefined();
		});
	},
);

it("resumes clip lookup and reuses earlier IDs without recharging the prefix", () => {
	const names = ["Crop", "Later", "Earlier", "Crop"];
	withFixture(
		names.map((name) => target(`clip-path="url(#${name})"`)).join(""),
		(fixture) => {
			const { tree, root, id, scene } = fixture;
			insertOutsideDefinition(fixture, "Earlier", undefined, "2");
			insertOutsideDefinition(fixture, "Crop", undefined, "4");
			insertOutsideDefinition(fixture, "Later");
			let baselineWork = 0;
			const baseline = scene((amount) => {
				baselineWork += amount;
			});
			const identifier = "prefix".repeat(24000);
			tree.insert(
				id("main"),
				tree.createElement("div", { id: identifier }),
				root,
			);
			insertUnrelated(tree, id("main"), 1024, root);
			insertUnrelated(tree, id("main"), 4097);
			let work = 0;
			const result = scene((amount) => {
				work += amount;
			});
			expect(result.sourceCodeUnits - baseline.sourceCodeUnits).toBe(
				identifier.length,
			);
			expect(work - baselineWork).toBeLessThan(150000);
			expect(result.shapes).toHaveLength(4);
			for (const [index, width] of [4, 6, 2, 4].entries()) {
				const shape = result.shapes[index];
				expect(shape.clips).toHaveLength(1);
				const raster = rasterizeSvgScene(
					{ ...result, shapes: [shape] },
					12,
					12,
					noCharge,
				);
				expect(pixel(raster, 1, 6)).toEqual(red);
				expect(pixel(raster, width + 1, 6)[3]).toBe(0);
			}
		},
	);
});

it.each([4096, 4097])(
	"bounds the examined clip prefix when the requested ID is node %s",
	(position) => {
		withFixture(target(), (fixture) => {
			const { tree, id, scene } = fixture;
			const { sibling, clip } = insertOutsideDefinition(fixture);
			const prefix =
				Array.from(tree.walk()).findIndex(({ node }) => node.id === clip) + 1;
			insertUnrelated(tree, id("main"), position - prefix, sibling);
			expect(
				Array.from(tree.walk()).findIndex(({ node }) => node.id === clip) + 1,
			).toBe(position);
			if (position === 4096) expect(scene().shapes[0].clips).toHaveLength(1);
			else expect(scene).toThrow("clip reference node limit exceeded");
		});
	},
);

it("keeps the clip index node cap cumulative across resumed references", () => {
	withFixture(
		`${target().repeat(3)}${target('clip-path="url(#Later)"')}`,
		(fixture) => {
			const { tree, id, scene } = fixture;
			const first = insertOutsideDefinition(fixture);
			const later = insertOutsideDefinition(fixture, "Later");
			for (const [entry, position] of [
				[first, 2048],
				[later, 4097],
			] as const) {
				const prefix =
					Array.from(tree.walk()).findIndex(
						({ node }) => node.id === entry.clip,
					) + 1;
				insertUnrelated(tree, id("main"), position - prefix, entry.sibling);
			}
			expect(scene).toThrow("clip reference node limit exceeded");
		},
	);
});

it("still exhausts the clip prefix cap for a missing ID", () => {
	withFixture(target(), ({ tree, id, scene }) => {
		insertUnrelated(tree, id("main"), 4097);
		expect(scene).toThrow("clip reference node limit exceeded");
	});
});

it.each([64, 65])(
	"bounds the requested clip's absolute document depth at %s",
	(depth) => {
		withFixture(target(), (fixture) => {
			const { tree, id, scene } = fixture;
			const { sibling, clip } = insertOutsideDefinition(fixture);
			const initialDepth = Array.from(tree.walk()).find(
				({ node }) => node.id === clip,
			)?.depth;
			if (initialDepth === undefined) throw new Error("Missing outside clip");
			let outer = sibling;
			for (let current = initialDepth; current < depth; current++) {
				const wrapper = tree.createElement("div");
				tree.insert(id("main"), wrapper, outer);
				tree.append(wrapper, outer);
				outer = wrapper;
			}
			expect(
				Array.from(tree.walk()).find(({ node }) => node.id === clip)?.depth,
			).toBe(depth);
			if (depth === 64) expect(scene().shapes[0].clips).toHaveLength(1);
			else expect(scene).toThrow("clip reference depth limit exceeded");
		});
	},
);

it.each(["depth", "source"])(
	"does not charge an irrelevant trailing %s overflow after resolving a clip",
	(limit) => {
		withFixture(`${definition()}${target()}`, ({ tree, id, scene }) => {
			let baselineWork = 0;
			const baseline = scene((amount) => {
				baselineWork += amount;
			});
			let parent = id("main");
			if (limit === "source")
				tree.append(
					parent,
					tree.createElement("div", { id: "x".repeat(262145) }),
				);
			else
				for (let depth = 0; depth < 65; depth++) {
					const child = tree.createElement("div");
					tree.append(parent, child);
					parent = child;
				}
			let work = 0;
			expect(
				scene((amount) => {
					work += amount;
				}),
			).toEqual(baseline);
			expect(work).toBe(baselineWork);
		});
	},
);

it.each([0, 1])(
	"charges examined outside IDs against the source limit with overflow=%s",
	(overflow) => {
		withFixture(`${definition()}${target()}`, ({ tree, root, id, scene }) => {
			const baseline = scene();
			const identifier = "x".repeat(
				262144 - baseline.sourceCodeUnits + overflow,
			);
			tree.insert(
				id("main"),
				tree.createElement("div", { id: identifier }),
				root,
			);
			if (overflow) expect(scene).toThrow("source code unit limit exceeded");
			else {
				const result = scene();
				expect(result.sourceCodeUnits).toBe(262144);
				expect(result.shapes[0].clips).toHaveLength(1);
			}
		});
	},
);

it("charges an outside clip descendant once when missing nested lookup resumes after preflight", () => {
	withFixture(target(), (fixture) => {
		const { tree, root, scene } = fixture;
		const { clip } = insertOutsideDefinition(fixture);
		const shape = tree.get(clip).children[0];
		tree.setAttribute(shape, "id", "clip-descendant");
		tree.setAttribute(clip, "clip-path", "url(#Missing)");
		const sourceSize = (start: number) =>
			Array.from(tree.walk(start)).reduce(
				(total, { node }) =>
					total +
					node.tagName.length +
					node.data.length +
					Object.entries(node.attributes).reduce(
						(size, [name, value]) => size + name.length + value.length,
						0,
					),
				0,
			);
		const result = scene();
		expect(result.sourceCodeUnits).toBe(
			sourceSize(root) + sourceSize(clip) + 4,
		);
		expect(result.shapes[0].clips).toHaveLength(1);
		expect(pixel(rasterizeSvgScene(result, 12, 12, noCharge), 9, 6)[3]).toBe(0);
	});
});

it.each([0, 1])(
	"retains geometry source admission during resumed lookup with overflow=%s",
	(overflow) => {
		withFixture(target(), (fixture) => {
			const { tree, scene } = fixture;
			const { clip } = insertOutsideDefinition(fixture);
			const shape = tree.get(clip).children[0];
			tree.setAttribute(shape, "id", "");
			tree.setAttribute(clip, "clip-path", "url(#Missing)");
			const baseline = scene();
			tree.setAttribute(
				shape,
				"id",
				"x".repeat(262144 - baseline.sourceCodeUnits + overflow),
			);
			if (overflow) expect(scene).toThrow("source code unit limit exceeded");
			else {
				const result = scene();
				expect(result.sourceCodeUnits).toBe(262144);
				expect(result.shapes[0].clips).toHaveLength(1);
			}
		});
	},
);

it("rebuilds first-ID lookup after insertion and ID mutation, not creation order", () => {
	withFixture(`${definition()}${target()}`, (fixture) => {
		const { tree, root, id, scene } = fixture;
		const originalClip = id("#Crop");
		insertUnrelated(tree, id("main"), 4097);
		const original = scene();
		const { clip } = insertOutsideDefinition(fixture, "Crop", root, "3");
		expect(clip).toBeGreaterThan(originalClip);
		const replaced = scene();
		expect(pixel(rasterizeSvgScene(original, 12, 12, noCharge), 4, 6)).toEqual(
			red,
		);
		expect(pixel(rasterizeSvgScene(replaced, 12, 12, noCharge), 4, 6)[3]).toBe(
			0,
		);
		tree.setAttribute(clip, "id", "Other");
		const restored = scene();
		expect(restored.shapes).toEqual(original.shapes);
		expect(pixel(rasterizeSvgScene(replaced, 12, 12, noCharge), 4, 6)[3]).toBe(
			0,
		);
	});
});

it("propagates work exhaustion while indexing an outside ID without mutating the document", () => {
	withFixture(`${definition()}${target()}`, ({ tree, root, id, scene }) => {
		const identifier = "x".repeat(8192);
		tree.insert(
			id("main"),
			tree.createElement("div", { id: identifier }),
			root,
		);
		insertUnrelated(tree, id("main"), 4097);
		const revision = tree.revision;
		const nodeCount = tree.nodeCount;
		const failure = new Error("Clip prefix caller budget exhausted");
		let exhausted = false;
		expect(() =>
			scene((amount) => {
				if (amount === identifier.length + 1) {
					exhausted = true;
					throw failure;
				}
			}),
		).toThrow(failure);
		expect(exhausted).toBe(true);
		expect(tree.revision).toBe(revision);
		expect(tree.nodeCount).toBe(nodeCount);
		expect(scene().shapes[0].clips).toHaveLength(1);
	});
});

it.each([true, false])(
	"uses the first matching ID even when firstIsClip=%s",
	(firstIsClip) => {
		const wrong = '<rect id="Crop"/>';
		const content = `<defs>${firstIsClip ? definition() + wrong : wrong + definition()}</defs>${target()}`;
		withFixture(content, ({ scene }) => {
			if (firstIsClip) expect(scene().shapes[0].clips).toHaveLength(1);
			else expect(scene().shapes[0].clips).toBeUndefined();
		});
	},
);

it.each(['<defs display="none">', '<defs style="display:none">'])(
	"keeps definitions referenceable under %s",
	(opening) => {
		const content = `${opening}${definition(half, 'display="none"')}</defs>${target()}`;
		expect(pixel(decode(content).image, 2, 6)).toEqual(red);
		expect(pixel(decode(content).image, 9, 6)[3]).toBe(0);
	},
);

it.each([
	'display="none"',
	'visibility="hidden"',
	'style="display:none"',
	'style="visibility:hidden"',
])("omits clipping children made invisible by %s", (attributes) => {
	withFixture(
		`${definition(half.replace("/>", ` ${attributes}/>`))}${target()}`,
		({ scene, image }) => {
			expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(0);
			expect(pixel(image(), 2, 6)[3]).toBe(0);
		},
	);
});

it("allows child visibility:visible to override definition ancestry", () => {
	const content = `<defs visibility="hidden">${definition(half.replace("/>", ' visibility="visible"/>'))}</defs>${target()}`;
	expect(pixel(decode(content).image, 2, 6)).toEqual(red);
});

it.each(["nonzero", "evenodd"])(
	"inherits clip-rule from definition ancestry, not the referencing %s rule",
	(referenceRule) => {
		const content = `<defs clip-rule="evenodd">${definition(`<path d="${ring}" fill-rule="nonzero"/>`)}</defs>${target(`clip-path="url(#Crop)" clip-rule="${referenceRule}"`)}`;
		withFixture(content, ({ scene, image }) => {
			expect(scene().shapes[0].clips?.[0].shapes[0].fillRule).toBe("evenodd");
			expect(pixel(image(), 6, 6)[3]).toBe(0);
		});
	},
);

it("does not use fill-rule to select clipping winding", () => {
	const content = `${definition(`<path d="${ring}" fill-rule="evenodd"/>`)}${target('clip-path="url(#Crop)" clip-rule="evenodd"')}`;
	withFixture(content, ({ scene, image }) => {
		expect(scene().shapes[0].clips?.[0].shapes[0].fillRule).toBe("nonzero");
		expect(pixel(image(), 6, 6)).toEqual(red);
	});
});

it.each([
	'fill="none" stroke="none" opacity="0"',
	'fill-opacity="0" stroke="blue" stroke-width="100"',
	'fill="url(external)" stroke-width="bogus" fill-rule="invalid"',
	'opacity="not-an-opacity" stroke-opacity="invalid"',
])(
	"ignores irrelevant clip paint attributes %s without poisoning geometry",
	(attributes) => {
		const content = `${definition(half.replace("/>", ` ${attributes}/>`))}${target()}`;
		withFixture(content, ({ scene, image }) => {
			expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(1);
			expect(pixel(image(), 2, 6)).toEqual(red);
			expect(pixel(image(), 9, 6)[3]).toBe(0);
		});
	},
);

it.each(["clipShape", "Crop", "definitions"])(
	"isolates raw clipping from irrelevant stroke-width overflow on %s",
	(location) => {
		const attributes = 'stroke="none" stroke-width="1e308in"';
		const content = `<defs id="definitions" ${location === "definitions" ? attributes : ""}>${definition(
			location === "clipShape" ? half.replace("/>", ` ${attributes}/>`) : half,
			location === "Crop" ? attributes : "",
		)}</defs>${target()}`;
		withFixture(content, ({ scene, image, styles, id }) => {
			expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(1);
			expect(() => styles.paint(id(`#${location}`))).toThrow(
				"CSS box computed length overflow",
			);
			const raster = image();
			expect(pixel(raster, 2, 6)).toEqual(red);
			expect(pixel(raster, 9, 6)[3]).toBe(0);
		});
		const raster = decode(content).image;
		expect(pixel(raster, 2, 6)).toEqual(red);
		expect(pixel(raster, 9, 6)[3]).toBe(0);
	},
);

it("ignores stylesheet stroke conversion overflow when decoding a raw clipping silhouette", () => {
	const raster = decode(
		`${definition()}${target()}`,
		"#clipShape{stroke:none;stroke-width:1e308in}",
	).image;
	expect(pixel(raster, 2, 6)).toEqual(red);
	expect(pixel(raster, 9, 6)[3]).toBe(0);
});

it.each(["none", "initial", "unset", "revert"])(
	"does not inherit clip-path through child %s or remove the ancestor clip",
	(keyword) => {
		withFixture(
			`${definition()}<g clip-path="url(#Crop)">${target(`clip-path="${keyword}"`)}</g>`,
			({ value, scene }) => {
				expect(value("#target", "clip-path")).toBe("none");
				expect(scene().shapes[0].clips).toHaveLength(1);
			},
		);
	},
);

it("honors explicit clip-path inheritance without cancelling the ancestor region", () => {
	withFixture(
		`${definition()}<g clip-path="url(#Crop)">${target('clip-path="inherit"')}</g>`,
		({ value, scene }) => {
			expect(value("#target", "clip-path")).toBe('url("#Crop")');
			expect(scene().shapes[0].clips).toHaveLength(2);
		},
	);
});

it.each([
	["inherit", "evenodd"],
	["unset", "evenodd"],
	["initial", "nonzero"],
] as const)("resolves definition-side clip-rule:%s", (keyword, expected) => {
	withFixture(
		`<defs clip-rule="evenodd">${definition(`<path id="clipShape" d="${ring}"/>`)}</defs>${target()}`,
		({ scene, value }) => {
			expect(value("#clipShape", "clip-rule")).toBe(expected);
			expect(scene().shapes[0].clips?.[0].shapes[0].fillRule).toBe(expected);
		},
		`#clipShape{clip-rule:${keyword}}`,
	);
});

it.each([
	["#target{clip-path:none}", 'clip-path="url(#Crop)"', "none"],
	["#target{clip-path:none}", 'style="clip-path:url(#Crop)"', 'url("#Crop")'],
	["#target{clip-path:none!important}", 'style="clip-path:url(#Crop)"', "none"],
	[
		"#target{clip-path:none!important}",
		'style="clip-path:url(#Crop)!important"',
		'url("#Crop")',
	],
] as const)(
	"resolves clip cascade %s against %s",
	(css, attributes, expected) => {
		withFixture(
			`${definition()}${target(attributes)}`,
			({ value, scene }) => {
				expect(value("#target", "clip-path")).toBe(expected);
				expect(scene().shapes[0].clips?.length ?? 0).toBe(
					expected === "none" ? 0 : 1,
				);
			},
			css,
		);
	},
);

it("preserves case through CSSOM, priority and removeProperty while rebuilding scenes", () => {
	withFixture(
		`${definition()}${rectangle}`,
		({ style, value, scene, image }) => {
			const inline = style("#target");
			const before = scene();
			inline.setProperty("CLIP-PATH", 'URL("#Crop")', "important");
			expect(inline.getPropertyValue("clip-path")).toBe('url("#Crop")');
			expect(inline.getPropertyPriority("clip-path")).toBe("important");
			expect(value("#target", "clip-path")).toBe('url("#Crop")');
			expect(scene().shapes[0].clips).toHaveLength(1);
			expect(before.shapes[0].clips).toBeUndefined();
			expect(pixel(image(), 9, 6)[3]).toBe(0);
			expect(inline.removeProperty("clip-path")).toBe('url("#Crop")');
			expect(pixel(image(), 9, 6)).toEqual(red);
		},
	);
});

it("invalidates referenced geometry and clip-rule without mutating the prior scene", () => {
	withFixture(
		`${definition(`<path id="clipShape" d="${ring}"/>`)}${target()}`,
		({ tree, id, style, scene, image }) => {
			const before = scene();
			expect(pixel(image(), 6, 6)).toEqual(red);
			style("#clipShape").setProperty("clip-rule", "evenodd");
			expect(pixel(image(), 6, 6)[3]).toBe(0);
			tree.setAttribute(id("#clipShape"), "d", "M0 0H3V12H0Z");
			expect(pixel(image(), 6, 2)[3]).toBe(0);
			expect(before.shapes[0].clips?.[0].shapes[0].fillRule).toBe("nonzero");
			expect(Object.isFrozen(before.shapes[0].clips)).toBe(true);
			expect(Object.isFrozen(before.shapes[0].clips?.[0])).toBe(true);
			expect(Object.isFrozen(before.shapes[0].clips?.[0].shapes)).toBe(true);
		},
	);
});

it("updates layout raster and hits after referenced geometry changes, without shrinking BCR", () => {
	withFixture(`${definition()}${target()}`, ({ tree, id, root, styles }) => {
		expect(buildFormattingTree(tree).issues).toEqual({});
		const geometry = documentGeometry(tree);
		const hits = documentHitTesting(tree);
		try {
			expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
				x: 0,
				y: 0,
				width: 12,
				height: 12,
			});
			expect(hits.elementFromPoint(2, 6)).toBe(id("#target"));
			expect(hits.elementFromPoint(9, 6)).toBe(root);
			const first = rasterizeDocument(tree, {
				clip: { x: 0, y: 0, width: 12, height: 12 },
			}).image;
			expect(pixel(first, 2, 6)).toEqual(red);
			expect(pixel(first, 9, 6)).toEqual(white);
			tree.setAttribute(id("#clipShape"), "width", "12");
			expect(hits.elementFromPoint(9, 6)).toBe(id("#target"));
			styles.setViewport(30, 30);
			expect(geometry.getBoundingClientRect(id("#target"))).toMatchObject({
				width: 12,
				height: 12,
			});
		} finally {
			hits.close();
			geometry.close();
		}
	});
});

it.each(["clip-path", "clip-rule"])(
	"keeps invalid %s attributes separate from paint errors until author override",
	(property) => {
		withFixture(
			`${definition(half.replace("/>", ` ${property}="invalid"/>`))}${target()}`,
			({ styles, id, scene, style }) => {
				expect(styles.paint(id("#clipShape")).svgClipError).toBe(true);
				expect(styles.paint(id("#clipShape")).svgPaintError).toBeUndefined();
				expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
				style("#clipShape").setProperty(
					property,
					property === "clip-path" ? "none" : "nonzero",
				);
				expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(1);
			},
		);
	},
);

it("skips hidden invalid clip children but not active invalid definitions", () => {
	withFixture(
		`${definition('<rect width="6" height="12" clip-rule="invalid" display="none"/>')}${target()}`,
		({ scene }) => {
			expect(scene().shapes[0].clips?.[0].shapes).toHaveLength(0);
		},
	);
	withFixture(
		`${definition(half, 'clip-rule="invalid"')}${target()}`,
		({ scene }) => {
			expect(scene).toThrow("unsupported clip presentation attribute");
		},
	);
});

it("does not inherit clipping from the definition's ancestors", () => {
	const content = `${definition("", "", "Empty")}<defs clip-path="url(#Empty)">${definition()}</defs>${target()}`;
	withFixture(content, ({ image }) =>
		expect(pixel(image(), 2, 6)).toEqual(red),
	);
});

it("keeps invalid active referencing attributes guarded until hidden or author-overridden", () => {
	withFixture(
		`${definition()}${target('clip-path="circle(50%)"')}`,
		({ scene, style, value }) => {
			expect(() => value("#target", "clip-path")).toThrow(
				expect.objectContaining({ code: "unsupported" }),
			);
			expect(scene).toThrow(expect.objectContaining({ code: "unsupported" }));
			style("#target").setProperty("display", "none");
			expect(scene().shapes).toHaveLength(0);
			style("#target").setProperty("clip-path", "url(#Crop)");
			style("#target").removeProperty("display");
			expect(scene().shapes[0].clips).toHaveLength(1);
		},
	);
});

it.each([
	"circle(50%)",
	"inset(1px)",
	"url(https://fixture.invalid/clip.svg#Crop)",
])(
	"retains diagnostics and decode rejection for unsupported CSS clip-path:%s",
	(value) => {
		const css = `#target{clip-path:${value}}`;
		withFixture(
			`${definition()}${rectangle}`,
			({ styles }) => {
				expect(Object.keys(styles.metrics().issues).length).toBeGreaterThan(0);
			},
			css,
		);
		expect(() => decode(`${definition()}${rectangle}`, css)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it.each([
	[definition(half, 'clip-path="url(#Crop)"'), "nested clip definitions"],
	[
		definition(half.replace("/>", ' clip-path="url(#Crop)"/>')),
		"nested clipping of clip geometry",
	],
	[definition("<text>clip</text>"), "unsupported clip element text"],
	[
		definition('<use href="#geometry"/>') +
			'<defs><path id="geometry" d="M0 0H6V12H0Z"/></defs>',
		"unsupported clip element use",
	],
	[definition(`<g>${half}</g>`), "unsupported clip element g"],
	[
		definition('<rect width="50%" height="12"/>'),
		"unsupported numeric geometry",
	],
	[
		definition(
			half,
			'transform="translate(1 0)" transform-origin="center center"',
		),
		"nondefault transform-origin",
	],
	[definition(half, 'clipPathUnits="invalid"'), "unsupported clipPathUnits"],
] as const)(
	"rejects documented unsupported clip geometry %s",
	(definitions, message) => {
		withFixture(`${definitions}${target()}`, ({ scene }) =>
			expect(scene).toThrow(message),
		);
		expect(() => decode(`${definitions}${target()}`)).toThrow(
			expect.objectContaining({ code: "unsupported" }),
		);
	},
);

it("terminates mutual clipping cycles at the nested-reference guard", () => {
	const content = `${definition(half, 'clip-path="url(#Other)"')}${definition(half, 'clip-path="url(#Crop)"', "Other")}${target()}`;
	withFixture(content, ({ scene }) => {
		let work = 0;
		expect(() =>
			scene((amount) => {
				work += amount;
			}),
		).toThrow("nested clip definitions");
		expect(work).toBeLessThan(100_000);
	});
});

it("ignores missing nested references instead of classifying them as supported nesting", () => {
	const content = `${definition(half.replace("/>", ' clip-path="url(#Missing)"/>'), 'clip-path="url(#Absent)"')}${target()}`;
	expect(pixel(decode(content).image, 2, 6)).toEqual(red);
	expect(pixel(decode(content).image, 9, 6)[3]).toBe(0);
});

it.each([
	'<line id="target" x2="12" stroke="red" clip-path="url(#Crop)"/>',
	'<g transform="scale(0)" clip-path="url(#Crop)"><rect width="12" height="12"/></g>',
])("rejects degenerate objectBoundingBox clipping for %s", (content) => {
	withFixture(
		`${definition('<rect width="1" height="1"/>', 'clipPathUnits="objectBoundingBox"')}${content}`,
		({ scene }) => {
			expect(scene).toThrow("degenerate objectBoundingBox clipping");
		},
	);
});

it("fails HTML active clip layout instead of silently ignoring the property", () => {
	withFixture(
		rectangle,
		({ tree }) => {
			expect(buildFormattingTree(tree).issues).toHaveProperty(
				"clip-path-layout-not-supported",
			);
			expect(() =>
				rasterizeDocument(tree, {
					clip: { x: 0, y: 0, width: 12, height: 12 },
				}),
			).toThrow(expect.objectContaining({ code: "unsupported" }));
		},
		"main{clip-path:url(#Missing)}",
	);
});

it("enforces the shared 512 clip-definition shape limit", () => {
	withFixture(
		`${definition('<rect width="1" height="1"/>'.repeat(513))}${target()}`,
		({ scene }) => {
			expect(scene).toThrow("clip shape limit exceeded");
		},
	);
});

it("enforces clip instance limits even when repeated definitions are cached", () => {
	const shapes = Array.from(
		{ length: 257 },
		(_, index) =>
			`<rect x="${index % 12}" width="1" height="1" clip-path="url(#Crop)"/>`,
	).join("");
	withFixture(
		`${definition('<rect width="1" height="1"/><rect x="1" width="1" height="1"/>')}${shapes}`,
		({ scene }) => {
			expect(scene).toThrow("clip instance shape limit exceeded");
		},
	);
});

it("shares one ancestor clip instance across many descendant shapes", () => {
	const shapes = '<rect width="1" height="1"/>'.repeat(257);
	withFixture(
		`${definition('<rect width="1" height="1"/><rect x="1" width="1" height="1"/>')}<g clip-path="url(#Crop)">${shapes}</g>`,
		({ scene }) => {
			const result = scene();
			expect(result.shapes).toHaveLength(257);
			expect(
				result.shapes.every((shape) => shape.clips === result.shapes[0].clips),
			).toBe(true);
		},
	);
});

it("enforces bounded ancestry before nested clip instances can grow without limit", () => {
	withFixture(
		`${definition()}${'<g clip-path="url(#Crop)">'.repeat(65)}${rectangle}${"</g>".repeat(65)}`,
		({ scene }) => {
			expect(scene).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		},
	);
});

it("shares the aggregate path-segment budget between painted and clipping geometry", () => {
	const path = `<path d="M0 0${"L1 1".repeat(400)}"/>`;
	withFixture(
		`${definition(path.repeat(10))}<g clip-path="url(#Crop)">${path.repeat(32)}</g>`,
		({ scene }) => {
			expect(scene).toThrow(
				expect.objectContaining({ code: "resource-limit" }),
			);
		},
	);
});

it("propagates caller work exhaustion and retains an unchanged reusable document", () => {
	withFixture(`${definition()}${target()}`, ({ tree, scene }) => {
		const revision = tree.revision;
		const failure = new Error("Clip caller budget exhausted");
		let work = 0;
		expect(() =>
			scene((amount) => {
				work += amount;
				if (work > 100) throw failure;
			}),
		).toThrow(failure);
		expect(tree.revision).toBe(revision);
		expect(scene().shapes[0].clips).toHaveLength(1);
	});
	expect(() =>
		decodeImage(
			new TextEncoder().encode(
				`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">${definition()}${target()}</svg>`,
			),
			"image/svg+xml",
			{ maxWork: 1 },
		),
	).toThrow(expect.objectContaining({ code: "resource-limit" }));
});
