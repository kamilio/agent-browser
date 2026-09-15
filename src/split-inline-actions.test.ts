import { afterEach, expect, it } from "vitest";
import { findClickPoint, findHoverPoint } from "./click-target.js";
import { documentGeometry } from "./document-geometry.js";
import { documentScroll } from "./document-scroll.js";
import type { DocumentTree } from "./document.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentHitTesting } from "./hit-testing.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { BrowserMouseEvent } from "./mouse.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

const documents: DocumentTree[] = [];
const sessions: BrowserSession[] = [];
const queries: DocumentQueries[] = [];
afterEach(() => {
	for (const query of queries.splice(0)) query.close();
	for (const session of sessions.splice(0)) session.close();
	for (const tree of documents.splice(0)) tree.close();
});

const content =
	'<span id="target" role="button"><div id="block" class="block"></div></span>';
function markup(body = content, css = "") {
	return `<!doctype html><style>html,body{margin:0;padding:0;font-size:8px;line-height:12px}.block{display:block;width:40px;height:20px}${css}</style><main>${body}</main>`;
}
function inspect(tree: DocumentTree) {
	documentStyles(tree).setViewport(120, 80);
	const query = new DocumentQueries(tree);
	queries.push(query);
	const id = (selector: string) => {
		const found = query.querySelector(selector);
		if (found === null) throw new Error(`Missing fixture ${selector}`);
		return found;
	};
	return {
		tree,
		id,
		ref: (selector: string) => tree.reference(id(selector)),
		geometry: documentGeometry(tree),
	};
}
function fixture(body = content, css = "") {
	const tree = parseHtmlDocument(
		markup(body, css),
		"https://fixture.invalid/split-inline",
	);
	documents.push(tree);
	return inspect(tree);
}
async function sessionFixture(body = content, css = "") {
	const requests: string[] = [];
	let closed = false;
	const session = new BrowserSession({
		createTransport: () => ({
			async request(request) {
				requests.push(request.url);
				return {
					url: request.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: requests.length,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed,
			}),
			close() {
				closed = true;
			},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(markup(body, css), response.url),
	});
	sessions.push(session);
	const tab = session.createTab();
	await session.navigate(tab.id, "https://fixture.invalid/split-inline");
	return {
		...inspect(session.page(tab.id).document),
		session,
		tab,
		requests,
	};
}
function actionableBoxes(tree: DocumentTree, target: number) {
	return documentGeometry(tree)
		.getActionableClientRects(target)
		.filter((rectangle) => rectangle.width > 0 && rectangle.height > 0);
}
function pointerEvents(tree: DocumentTree, target: number) {
	const events: {
		type: string;
		target: number | null;
		currentTarget: number | null;
		clientX: number;
		clientY: number;
	}[] = [];
	for (const type of [
		"mouseover",
		"mousemove",
		"mousedown",
		"mouseup",
		"click",
	])
		documentInteractions(tree).events.addEventListener(
			target,
			type,
			(event) => {
				if (event instanceof BrowserMouseEvent)
					events.push({
						type: event.type,
						target: event.target,
						currentTarget: event.currentTarget,
						clientX: event.clientX,
						clientY: event.clientY,
					});
			},
		);
	return events;
}
function expectInsideBlock(
	tree: DocumentTree,
	block: number,
	point: { x: number; y: number } | undefined,
) {
	if (!point) throw new Error("Missing receiving point");
	const bounds = documentGeometry(tree).getBoundingClientRect(block);
	expect(point.x).toBeGreaterThanOrEqual(bounds.left);
	expect(point.x).toBeLessThan(bounds.right);
	expect(point.y).toBeGreaterThanOrEqual(bounds.top);
	expect(point.y).toBeLessThan(bounds.bottom);
	expect(documentHitTesting(tree).elementFromPoint(point.x, point.y)).toBe(
		block,
	);
}

it("records nested split ownership inner to outer without changing DOM parents", () => {
	const { tree, id, ref } = fixture(
		'<span id="outer">A<span id="inner">B<div id="block" class="block"></div>C</span>D</span>',
	);
	const parent = tree.get(id("#block")).parent;
	const revision = tree.revision;
	const formatting = buildFormattingTree(tree);
	expect(formatting.issues).toEqual({});
	expect(
		formatting.nodes.find((node) => node.ref === ref("#block"))
			?.splitInlineAncestors,
	).toEqual([ref("#inner"), ref("#outer")]);
	expect(tree.get(id("#block")).parent).toBe(parent);
	expect(tree.revision).toBe(revision);
});

it("keeps multiple lifted blocks associated only with their own inline ancestors", () => {
	const { tree, ref } = fixture(
		'<span id="outer"><span id="inner"><div id="first" class="block"></div></span><div id="second" class="block"></div></span><div id="sibling" class="block"></div>',
	);
	const formatting = buildFormattingTree(tree);
	const owners = (selector: string) =>
		formatting.nodes.find((node) => node.ref === ref(selector))
			?.splitInlineAncestors ?? [];
	expect(owners("#first")).toEqual([ref("#inner"), ref("#outer")]);
	expect(owners("#second")).toEqual([ref("#outer")]);
	expect(owners("#sibling")).toEqual([]);
});

it("carries split ownership through display:contents without giving it a CSS box", () => {
	const { tree, id, ref, geometry } = fixture(
		'<span id="target"><section id="contents" style="display:contents"><div id="block" class="block"></div></section></span>',
	);
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.find((node) => node.ref === ref("#block"))
			?.splitInlineAncestors,
	).toEqual([ref("#target")]);
	expect(geometry.getClientRects(id("#contents"))).toEqual([]);
	expect(actionableBoxes(tree, id("#target"))).toEqual(
		geometry.getClientRects(id("#block")),
	);
});

it("freezes ownership snapshots and refreshes ownership after a block moves", () => {
	const { tree, id, ref, geometry } = fixture();
	const formatting = buildFormattingTree(tree);
	const block = formatting.nodes.find((node) => node.ref === ref("#block"));
	const owners = block?.splitInlineAncestors;
	if (!owners) throw new Error("Missing split ownership");
	expect(Object.isFrozen(block)).toBe(true);
	expect(Object.isFrozen(owners)).toBe(true);
	expect(Reflect.set(owners, "0", ref("main"))).toBe(false);
	expect(Reflect.set(owners, "length", 0)).toBe(false);
	expect(actionableBoxes(tree, id("#target"))).toEqual(
		geometry.getClientRects(id("#block")),
	);
	tree.append(id("main"), id("#block"));
	const updated = buildFormattingTree(tree);
	expect(
		updated.nodes.find((node) => node.ref === ref("#block"))
			?.splitInlineAncestors ?? [],
	).toEqual([]);
	expect(owners).toEqual([ref("#target")]);
	expect(actionableBoxes(tree, id("#target"))).toEqual([]);
});

it("leaves ordinary inline CSS and actionable rectangles unchanged", () => {
	const { tree, id, ref, geometry } = fixture(
		'<span id="target" role="button">ordinary <em>inline</em></span>',
	);
	const formatting = buildFormattingTree(tree);
	expect(
		formatting.nodes.every((node) => !node.splitInlineAncestors?.length),
	).toBe(true);
	expect(
		formatting.nodes.find((node) => node.ref === ref("#target"))?.fragmentCount,
	).toBe(1);
	const rectangles = geometry.getClientRects(id("#target"));
	expect(rectangles.length).toBeGreaterThan(0);
	expect(geometry.getActionableClientRects(id("#target"))).toEqual(rectangles);
	expect(geometry.getBoundingClientRect(id("#target")).width).toBeGreaterThan(
		0,
	);
	expect(findClickPoint(tree, id("#target")).point).toBeDefined();
});

it("uses the owned border box including padding and borders but not margins", () => {
	const { tree, id, geometry } = fixture(
		content,
		"#block{box-sizing:content-box;padding:3px;border:2px solid black;margin:7px 11px}",
	);
	const bounds = geometry.getBoundingClientRect(id("#block"));
	expect(bounds).toMatchObject({ width: 50, height: 30 });
	expect(actionableBoxes(tree, id("#target"))).toEqual([bounds]);
	expect(
		documentHitTesting(tree).elementFromPoint(bounds.left - 1, bounds.top + 1),
	).not.toBe(id("#block"));
	expectInsideBlock(
		tree,
		id("#block"),
		findClickPoint(tree, id("#target")).point,
	);
});

it("rejects CSS geometry for each split owner even after actionable geometry succeeds", () => {
	const { tree, id, geometry } = fixture(
		'<span id="outer"><span id="inner"><div id="block" class="block"></div></span></span>',
	);
	for (const selector of ["#inner", "#outer"]) {
		const target = id(selector);
		expect(actionableBoxes(tree, target)).toEqual(
			geometry.getClientRects(id("#block")),
		);
		for (const read of [
			() => geometry.getClientRects(target),
			() => geometry.getBoundingClientRect(target),
			() => geometry.getUsedStyle(target),
		])
			expect(read).toThrowError(
				expect.objectContaining({ code: "unsupported" }),
			);
	}
});

it("keeps separate actionable block rectangles without including siblings or gaps", () => {
	const { tree, id, geometry } = fixture(
		'<span id="target"><div id="first" class="block"></div><div id="second" class="block" style="margin-top:9px"></div></span><div id="sibling" class="block"></div>',
	);
	const first = geometry.getBoundingClientRect(id("#first"));
	const second = geometry.getBoundingClientRect(id("#second"));
	expect(second.top).toBeGreaterThan(first.bottom);
	expect(actionableBoxes(tree, id("#target"))).toEqual([first, second]);
	expect(actionableBoxes(tree, id("#target"))).not.toContainEqual(
		geometry.getBoundingClientRect(id("#sibling")),
	);
});

it("clicks a hit-tested owned block and bubbles the real mouse sequence to its owner", async () => {
	const { tree, id, ref, session, tab, requests } = await sessionFixture();
	const events = pointerEvents(tree, id("#target"));
	expectInsideBlock(
		tree,
		id("#block"),
		findClickPoint(tree, id("#target")).point,
	);
	expect(events).toEqual([]);
	const result = await session.click(tab.id, ref("#target"));
	expect(result.interaction.reference).toBe(ref("#target"));
	expect(
		events
			.filter((event) => event.type !== "mouseover")
			.map((event) => event.type),
	).toEqual(["mousemove", "mousedown", "mouseup", "click"]);
	for (const event of events) {
		expect(event.target).toBe(id("#block"));
		expect(event.currentTarget).toBe(id("#target"));
		expectInsideBlock(tree, id("#block"), {
			x: event.clientX,
			y: event.clientY,
		});
	}
	expect(requests).toHaveLength(1);
});

it("hovers a hit-tested owned block without dispatching activation", async () => {
	const { tree, id, ref, session, tab, requests } = await sessionFixture();
	const events = pointerEvents(tree, id("#target"));
	expectInsideBlock(
		tree,
		id("#block"),
		findHoverPoint(tree, id("#target")).point,
	);
	await session.hover(tab.id, ref("#target"));
	expect(events.map((event) => event.type)).toEqual(["mouseover", "mousemove"]);
	for (const event of events) {
		expect(event.target).toBe(id("#block"));
		expectInsideBlock(tree, id("#block"), {
			x: event.clientX,
			y: event.clientY,
		});
	}
	expect(requests).toHaveLength(1);
});

it("preserves coverage and overflow clipping when selecting owned block points", async () => {
	const { tree, id, ref, session, tab } = await sessionFixture(
		`${content}<div id="overlay"></div>`,
		"#overlay{position:absolute;left:0;top:0;width:120px;height:80px;z-index:2}",
	);
	const events = pointerEvents(tree, id("#target"));
	for (const find of [findClickPoint, findHoverPoint])
		expect(find(tree, id("#target"))).toMatchObject({
			blocked: "covered",
			interceptingRef: ref("#overlay"),
		});
	for (const action of ["click", "hover"] as const)
		await expect(session[action](tab.id, ref("#target"))).rejects.toMatchObject(
			{
				code: "not-actionable",
			},
		);
	expect(events).toEqual([]);
	tree.setAttribute(id("#overlay"), "style", "pointer-events:none");
	await session.click(tab.id, ref("#target"));
	expect(events.filter((event) => event.type === "click")).toHaveLength(1);
	const clipped = await sessionFixture(
		content,
		"main{width:20px;height:10px;overflow:clip}",
	);
	const clippedEvents = pointerEvents(clipped.tree, clipped.id("#target"));
	expect(actionableBoxes(clipped.tree, clipped.id("#target"))).toEqual(
		clipped.geometry.getClientRects(clipped.id("#block")),
	);
	for (const find of [findClickPoint, findHoverPoint]) {
		const point = find(clipped.tree, clipped.id("#target")).point;
		expectInsideBlock(clipped.tree, clipped.id("#block"), point);
		expect(point?.x).toBeLessThan(20);
		expect(point?.y).toBeLessThan(10);
	}
	clipped.tree.setAttribute(clipped.id("#block"), "style", "margin-left:30px");
	for (const find of [findClickPoint, findHoverPoint])
		expect(find(clipped.tree, clipped.id("#target")).point).toBeUndefined();
	for (const action of ["click", "hover"] as const)
		await expect(
			clipped.session[action](clipped.tab.id, clipped.ref("#target")),
		).rejects.toMatchObject({ code: "not-actionable" });
	expect(clippedEvents).toEqual([]);
});

it("preserves inherited pointer-events:none on split owners and their blocks", async () => {
	const { tree, id, ref, session, tab } = await sessionFixture(
		content,
		"#target{pointer-events:none}",
	);
	const events = pointerEvents(tree, id("#target"));
	expect(actionableBoxes(tree, id("#target"))).toHaveLength(1);
	for (const find of [findClickPoint, findHoverPoint])
		expect(find(tree, id("#target")).point).toBeUndefined();
	for (const action of ["click", "hover"] as const)
		await expect(session[action](tab.id, ref("#target"))).rejects.toMatchObject(
			{
				code: "not-actionable",
			},
		);
	expect(events).toEqual([]);
});

it("does not make hidden split descendants clickable or hoverable", async () => {
	for (const style of ["visibility:hidden", "display:none"]) {
		const { tree, id, ref, session, tab } = await sessionFixture(
			content,
			`#target{${style}}`,
		);
		const events = pointerEvents(tree, id("#target"));
		for (const find of [findClickPoint, findHoverPoint])
			expect(find(tree, id("#target")).point).toBeUndefined();
		for (const action of ["click", "hover"] as const)
			await expect(
				session[action](tab.id, ref("#target")),
			).rejects.toMatchObject({
				code: "not-actionable",
			});
		expect(events).toEqual([]);
	}
});

it("does not bypass an inert ancestor through split actionable geometry", async () => {
	const { tree, id, ref, session, tab } = await sessionFixture(
		`<section inert>${content}</section>`,
	);
	const events = pointerEvents(tree, id("#target"));
	expect(actionableBoxes(tree, id("#target"))).toHaveLength(1);
	for (const action of ["click", "hover"] as const)
		await expect(session[action](tab.id, ref("#target"))).rejects.toMatchObject(
			{
				code: "not-actionable",
			},
		);
	expect(events).toEqual([]);
});

it("preserves ARIA disabling for split owners while allowing nonactivating hover", async () => {
	const { tree, id, ref, session, tab } = await sessionFixture(
		`<section aria-disabled="true">${content}</section>`,
	);
	const events = pointerEvents(tree, id("#target"));
	expect(findClickPoint(tree, id("#target")).blocked).toBe("aria-disabled");
	await expect(session.click(tab.id, ref("#target"))).rejects.toMatchObject({
		code: "not-actionable",
	});
	expect(events).toEqual([]);
	await session.hover(tab.id, ref("#target"));
	expect(events.map((event) => event.type)).toEqual(["mouseover", "mousemove"]);
});

it("automatically root-scrolls to owned blocks for click and hover without inventing CSS geometry", async () => {
	for (const action of ["click", "hover"] as const) {
		const { tree, id, ref, geometry, session, tab, requests } =
			await sessionFixture(`<div style="height:200px"></div>${content}`);
		const events = pointerEvents(tree, id("#target"));
		const before = geometry.getBoundingClientRect(id("#block"));
		expect(findClickPoint(tree, id("#target")).blocked).toBe(
			"outside-viewport",
		);
		expect(documentScroll(tree).get()).toEqual({ x: 0, y: 0 });
		await session[action](tab.id, ref("#target"));
		const scroll = documentScroll(tree).get();
		expect(scroll.y).toBeGreaterThan(0);
		const after = geometry.getBoundingClientRect(id("#block"));
		expect(after.top).toBeCloseTo(before.top - scroll.y);
		expect(actionableBoxes(tree, id("#target"))).toEqual([after]);
		expectInsideBlock(
			tree,
			id("#block"),
			findHoverPoint(tree, id("#target")).point,
		);
		expect(events.filter((event) => event.type === "click")).toHaveLength(
			action === "click" ? 1 : 0,
		);
		expect(events.some((event) => event.type === "mousemove")).toBe(true);
		expect(() => geometry.getBoundingClientRect(id("#target"))).toThrowError(
			expect.objectContaining({ code: "unsupported" }),
		);
		expect(requests).toHaveLength(1);
	}
});
