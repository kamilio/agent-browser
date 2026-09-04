import { afterEach, expect, it } from "vitest";
import { BrowserCommandHost } from "./command-host.js";
import { initialBoxStyle, type BoxStyle } from "./css-box.js";
import type { ListStyle } from "./css-list.js";
import { initialPaintStyle, type PaintStyle } from "./css-paint.js";
import type { TextStyle } from "./css-text.js";
import { buildFormattingTree } from "./formatting-tree.js";
import { documentGeneratedControls } from "./generated-controls.js";
import { parseHtmlDocument } from "./html-parser.js";
import { documentInteractions } from "./interactions.js";
import { DocumentQueries } from "./selectors.js";
import { BrowserSession } from "./session.js";
import { documentStyles } from "./styles.js";

interface StyleReport {
	reference: string;
	display: string;
	visibility: string;
	displayed: boolean;
	visible: boolean;
	box: BoxStyle;
	text: TextStyle;
	paint: PaintStyle;
	list: ListStyle;
	pointerEvents: string;
}
const hosts: BrowserCommandHost[] = [];
afterEach(() => {
	for (const host of hosts.splice(0)) host.close();
});
async function fixture(css = "", attributes = "", content = "Body") {
	const session = new BrowserSession({
		createTransport: () => ({
			async request(input) {
				return {
					url: input.url,
					status: 200,
					headers: {},
					body: new Uint8Array(),
					redirects: [],
					encodedBytes: 0,
					elapsedMs: 0,
				};
			},
			metrics: () => ({
				requests: 1,
				active: 0,
				redirects: 0,
				encodedBytes: 0,
				decodedBytes: 0,
				closed: false,
			}),
			close() {},
		}),
		loadDocument: (response) =>
			parseHtmlDocument(
				`<style>${css}</style><details id="host" ${attributes}>${content}</details>`,
				response.url,
			),
	});
	const host = new BrowserCommandHost({
		createSession: () => session,
		timeoutMs: 500,
	});
	hosts.push(host);
	await host.execute(["open", "https://fixture.invalid/generated-style"]);
	const tree = session.page(session.tabs()[0].id).document;
	const owner = new DocumentQueries(tree).querySelector("#host");
	if (owner === null) throw new Error("Missing details host");
	const controls = documentGeneratedControls(tree);
	const target = controls.detailsSummary(owner);
	if (!target) throw new Error("Missing generated header");
	const inspect = async () => {
		const result = await host.execute(["styles", target.ref]);
		return result.data as StyleReport;
	};
	return { host, tree, owner, target, controls, inspect };
}

it("reports native generated styles without aliasing the host or creating DOM nodes", async () => {
	const { tree, owner, target, inspect } = await fixture();
	const revision = tree.revision;
	const children = [...tree.get(owner).children];
	expect(await inspect()).toMatchObject({
		reference: target.ref,
		profile: "generated-details-summary-style",
		generated: { kind: "details-summary", owner: tree.reference(owner) },
		display: "list-item",
		visibility: "visible",
		displayed: true,
		visible: true,
		partial: true,
		layout: false,
	});
	expect(tree.revision).toBe(revision);
	expect(tree.get(owner).children).toEqual(children);
	expect(() => tree.resolve(target.ref)).toThrow();
});

it.each(["block", "inline", "flex", "inline-flex"])(
	"keeps generated display and box defaults separate from host display %s",
	async (display) => {
		const { host, inspect } = await fixture(
			`details{display:${display};width:200px;padding:12px;margin:9px;border:5px solid red;background:blue}`,
		);
		const report = await inspect();
		expect(report.display).toBe("list-item");
		expect(report.box).toEqual(initialBoxStyle);
		expect(report.paint).toEqual(initialPaintStyle);
		expect((await host.execute(["styles", "#host"])).data).toMatchObject({
			display,
			box: { width: "200px", "padding-top": "12px" },
		});
	},
);

it("inherits supported typography and color without inheriting host decoration", async () => {
	const { tree, owner, inspect } = await fixture(
		"body{color:red;font-family:monospace;font-size:24px;line-height:2;white-space:pre;text-align:center}details{background:blue;border:4px solid green}",
	);
	const report = await inspect();
	expect(report.text).toEqual(documentStyles(tree).text(owner));
	expect(report.text).toMatchObject({
		"font-size": "24px",
		"white-space": "pre",
		"text-align": "center",
	});
	expect(report.paint).toEqual({
		...initialPaintStyle,
		color: [255, 0, 0, 255],
	});
});

it.each(["", "open"])(
	"uses the native disclosure marker for %s hosts despite author list styles",
	async (attributes) => {
		const { inspect } = await fixture(
			"details{list-style:none outside}",
			attributes,
		);
		expect((await inspect()).list).toEqual({
			"list-style-type": attributes ? "disclosure-open" : "disclosure-closed",
			"list-style-position": "inside",
		});
	},
);

it.each(["", "display:flex", "font-size:0", "visibility:hidden"])(
	"reports precisely the styles consumed by generated formatting for %s",
	async (css) => {
		const { tree, target, inspect } = await fixture(
			`details{${css};color:green}`,
		);
		const report = await inspect();
		const nodes = buildFormattingTree(tree).nodes.filter(
			(node) => node.generated?.ref === target.ref,
		);
		expect(nodes.length).toBe(css === "font-size:0" ? 2 : 3);
		for (const node of nodes) {
			expect(node.typography).toEqual(report.text);
			expect(node.paint).toEqual(report.paint);
			expect(node.visible).toBe(report.visible);
			if (node.box) expect(node.box).toEqual(report.box);
			if (node.marker)
				expect(node.marker.type).toBe(report.list["list-style-type"]);
			if (node.kind === "block") expect(node.display).toBe(report.display);
		}
	},
);

it("does not apply authored summary selectors to an internal fallback", async () => {
	const { inspect } = await fixture(
		"summary{display:none;color:blue;font-size:99px;padding:40px}details{color:red}",
	);
	const report = await inspect();
	expect(report).toMatchObject({
		display: "list-item",
		visible: true,
		text: { "font-size": "16px" },
	});
	expect(report.paint.color).toEqual([255, 0, 0, 255]);
	expect(report.box).toEqual(initialBoxStyle);
});

it("updates inherited styles and marker state without mutating previous reports", async () => {
	const { tree, owner, inspect } = await fixture();
	const before = await inspect();
	tree.setAttribute(owner, "style", "font-size:32px;color:blue");
	tree.setAttribute(owner, "open", "");
	const after = await inspect();
	expect(after).toMatchObject({
		text: { "font-size": "32px" },
		paint: { color: [0, 0, 255, 255] },
		list: { "list-style-type": "disclosure-open" },
	});
	expect(before).toMatchObject({
		text: { "font-size": "16px" },
		list: { "list-style-type": "disclosure-closed" },
	});
});

it.each([
	["display:none", false, false],
	["visibility:hidden", true, false],
	["visibility:collapse", true, false],
])(
	"inspects available but hidden controls with %s",
	async (css, displayed, visible) => {
		const { inspect } = await fixture(`details{${css}}`);
		expect(await inspect()).toMatchObject({
			display: "list-item",
			displayed,
			visible,
			layout: false,
		});
	},
);

it.each(["auto", "none"])(
	"reports inherited pointer eligibility %s independently of visibility",
	async (pointerEvents) => {
		const { inspect } = await fixture(`body{pointer-events:${pointerEvents}}`);
		expect(await inspect()).toMatchObject({ pointerEvents, visible: true });
	},
);

it("keeps inert rendering styles separate from action eligibility", async () => {
	const { inspect } = await fixture("", "inert");
	expect(await inspect()).toMatchObject({
		visible: true,
		displayed: true,
		pointerEvents: "auto",
	});
});

it("uses the same unique role locator as other generated actions", async () => {
	const { host, target } = await fixture();
	expect(
		(
			await host.execute([
				"styles",
				'getByRole("button", {name:"Details", exact:true})',
			])
		).data,
	).toMatchObject({
		reference: target.ref,
		profile: "generated-details-summary-style",
	});
});

it.each(["detach", "summary", "close"])(
	"rejects unavailable generated styles after %s",
	async (change) => {
		const { host, tree, owner, target, controls, inspect } = await fixture();
		await inspect();
		if (change === "detach") tree.remove(owner);
		else if (change === "summary")
			tree.append(owner, tree.createElement("summary"));
		else controls.close();
		await expect(host.execute(["styles", target.ref])).rejects.toThrow();
	},
);

it("restores the same fallback styles after authored summary removal", async () => {
	const { tree, owner, target, inspect } = await fixture();
	await inspect();
	const summary = tree.createElement("summary");
	tree.append(owner, summary);
	tree.setAttribute(owner, "style", "color:blue");
	tree.remove(summary);
	expect(await inspect()).toMatchObject({
		reference: target.ref,
		paint: { color: [0, 0, 255, 255] },
	});
});

it("returns immutable style records and a bounded JSON report", async () => {
	const { inspect } = await fixture();
	const report = await inspect();
	for (const record of [report.box, report.text, report.paint, report.list])
		expect(Object.isFrozen(record)).toBe(true);
	expect(JSON.parse(JSON.stringify(report))).toEqual(report);
	expect(JSON.stringify(report).length).toBeLessThan(4096);
	expect(report).not.toHaveProperty("outline");
});

it("refreshes inherited styles after stylesheet text replacement", async () => {
	const { tree, inspect } = await fixture("details{color:red}");
	const before = await inspect();
	const stylesheet = new DocumentQueries(tree).querySelector("style");
	if (stylesheet === null) throw new Error("Missing stylesheet");
	tree.setTextContent(stylesheet, "details{color:blue;font-size:28px}");
	expect(await inspect()).toMatchObject({
		paint: { color: [0, 0, 255, 255] },
		text: { "font-size": "28px" },
	});
	expect(before.paint.color).toEqual([255, 0, 0, 255]);
});

it("inherits host focus styles without representing native feedback as CSS outline", async () => {
	const { tree, target, inspect } = await fixture(
		"details:focus{color:red;font-size:24px}",
	);
	await inspect();
	documentInteractions(tree).focus.focus(target.ref);
	const focused = await inspect();
	expect(focused).toMatchObject({
		paint: { color: [255, 0, 0, 255] },
		text: { "font-size": "24px" },
	});
	expect(focused).not.toHaveProperty("outline");
	tree.setActiveElement(null);
	expect((await inspect()).paint).toEqual(initialPaintStyle);
});

it("reports nested disclosure visibility when its closed ancestor opens", async () => {
	const { host, tree, owner } = await fixture(
		"",
		"",
		'<details id="inner">Nested body</details>',
	);
	const inner = new DocumentQueries(tree).querySelector("#inner");
	if (inner === null) throw new Error("Missing inner host");
	const target = documentGeneratedControls(tree).detailsSummary(inner);
	if (!target) throw new Error("Missing inner header");
	expect((await host.execute(["styles", target.ref])).data).toMatchObject({
		displayed: false,
		visible: false,
	});
	tree.setAttribute(owner, "open", "");
	expect((await host.execute(["styles", target.ref])).data).toMatchObject({
		displayed: true,
		visible: true,
	});
});

it("rejects a foreign document's generated reference rather than using its numeric owner", async () => {
	const first = await fixture();
	const second = await fixture();
	await first.inspect();
	await second.inspect();
	await expect(
		second.host.execute(["styles", first.target.ref]),
	).rejects.toThrow();
});

it("does not bypass a closed style owner", async () => {
	const { host, tree, target, inspect } = await fixture();
	await inspect();
	documentStyles(tree).close();
	await expect(host.execute(["styles", target.ref])).rejects.toThrow(/closed/);
});
