import { afterEach, expect, it } from "vitest";
import type { DocumentTree } from "./document.js";
import { extractDocument } from "./extraction.js";
import { parseHtmlDocument } from "./html-parser.js";
import { reconstructReactStreams } from "./react-streaming.js";

const segmentHelper =
	"$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};";
const boundaryHelper =
	'$RB=[];$RV=function(a){$RT=performance.now();for(var b=0;b<a.length;b+=2){var c=a[b],e=a[b+1];null!==e.parentNode&&e.parentNode.removeChild(e);var f=c.parentNode;if(f){var g=c.previousSibling,h=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d||"/&"===d)if(0===h)break;else h--;else"$"!==d&&"$?"!==d&&"$~"!==d&&"$!"!==d&&"&"!==d||h++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;e.firstChild;)f.insertBefore(e.firstChild,c);g.data="$";g._reactRetry&&requestAnimationFrame(g._reactRetry)}}a.length=0};\n$RC=function(a,b){if(b=document.getElementById(b))(a=document.getElementById(a))?(a.previousSibling.data="$~",$RB.push(a,b),2===$RB.length&&("number"!==typeof $RT?requestAnimationFrame($RV.bind(null,$RB)):(a=performance.now(),setTimeout($RV.bind(null,$RB),2300>a&&2E3<a?2300-a:$RT+300-a)))):b.parentNode.removeChild(b)};';
const trees: DocumentTree[] = [];

afterEach(() => {
	for (const tree of trees.splice(0)) tree.close();
});

function fixture(
	script: string,
	source = '<div hidden id="S:3"><p>Resolved content</p></div>',
) {
	const tree = parseHtmlDocument(
		`<main><template id="P:3"></template></main>${source}<script>${script}</script><aside hidden>PRIVATE_SENTINEL</aside>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	return tree;
}

function content(tree: DocumentTree) {
	return extractDocument(tree, { format: "markdown" }).content;
}

it("projects a declared segment into its placeholder without revealing unrelated hidden content", async () => {
	const tree = fixture(`${segmentHelper}$RS("S:3","P:3")`);
	expect(content(tree)).not.toContain("Resolved content");
	expect(await reconstructReactStreams(tree)).toMatchObject({
		segments: 1,
		boundaries: 0,
		rendered: false,
		verified: false,
	});
	expect(content(tree)).toContain("Resolved content");
	expect(content(tree)).not.toContain("PRIVATE_SENTINEL");
});

it.each([
	'$RS("S:3","P:3")',
	`${segmentHelper}if(false)$RS("S:3","P:3")`,
	`${segmentHelper}// $RS("S:3","P:3")`,
	`${segmentHelper}const quoted='$RS("S:3","P:3")'`,
	'$RS=function(){};$RS("S:3","P:3")',
	`${segmentHelper}$RS("S:3","P:3",true)`,
])("does not evaluate or infer arbitrary script source: %s", async (script) => {
	const tree = fixture(script);
	expect((await reconstructReactStreams(tree)).segments).toBe(0);
	expect(content(tree)).not.toContain("Resolved content");
});

it.each([
	'<div hidden id="S:3">Resolved content</div><div hidden id="S:3">Duplicate</div>',
	'<section hidden id="S:3">Resolved content</section>',
	'<div id="S:3" style="display:none">Resolved content</div>',
])("requires a unique hidden HTML segment container: %s", async (source) => {
	const tree = fixture(`${segmentHelper}$RS("S:3","P:3")`, source);
	expect((await reconstructReactStreams(tree)).segments).toBe(0);
	expect(content(tree)).not.toContain("Resolved content");
});

it("does not project forward references to elements that follow the command", async () => {
	const tree = parseHtmlDocument(
		`<main><template id="P:3"></template></main><script>${segmentHelper}$RS("S:3","P:3")</script><div hidden id="S:3">Resolved content</div>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	expect((await reconstructReactStreams(tree)).segments).toBe(0);
});

it("honors cancellation before changing the document", async () => {
	const tree = fixture(`${segmentHelper}$RS("S:3","P:3")`);
	const controller = new AbortController();
	controller.abort();
	await expect(
		reconstructReactStreams(tree, controller.signal),
	).rejects.toMatchObject({ code: "aborted" });
	expect(content(tree)).not.toContain("Resolved content");
});

it("resolves nested boundaries and segments while retaining pending and unrelated hidden content", async () => {
	const tree = parseHtmlDocument(
		`<body><!--$?--><template id="B:0"></template><p>Outer pending</p><!--/$--><div hidden id="S:0"><main><!--$?--><template id="B:1"></template><p>Inner pending</p><!--/$--><!--$?--><template id="B:9"></template><p>Still pending</p><!--/$--></main></div><script>${boundaryHelper}$RC("B:0","S:0")</script><div hidden id="S:1"><template id="P:3"></template><!--$--><!--/$--></div><div hidden id="S:3"><h1>Leaderboard</h1><p>Resolved content</p><p hidden>PRIVATE_SENTINEL</p></div><script>self.__next_f.push([1,"opaque Flight data"])</script><script async src="/application.js"></script><script>${segmentHelper}$RS("S:3","P:3")</script><script>$RC("B:1","S:1")</script><div hidden id="S:9">UNRESOLVED_SENTINEL</div></body>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	expect(content(tree)).not.toContain("Leaderboard");
	expect(await reconstructReactStreams(tree)).toMatchObject({
		boundaries: 2,
		segments: 1,
		unresolved: 0,
	});
	expect(content(tree)).toContain("Leaderboard");
	expect(content(tree)).toContain("Resolved content");
	expect(content(tree)).toContain("Still pending");
	expect(content(tree)).not.toMatch(
		/Inner pending|Outer pending|PRIVATE_SENTINEL|UNRESOLVED_SENTINEL/,
	);
});

it.each(["$!", "$", "ordinary", ""])(
	"does not replace an unrecognized or completed boundary marker %s",
	async (marker) => {
		const tree = parseHtmlDocument(
			`<body><!--${marker}--><template id="B:0"></template><p>Pending</p><!--/$--><div hidden id="S:0">Resolved content</div><script>${boundaryHelper}$RC("B:0","S:0")</script></body>`,
			"https://stream.fixture.invalid/",
		);
		trees.push(tree);
		expect((await reconstructReactStreams(tree)).boundaries).toBe(0);
		expect(content(tree)).not.toContain("Resolved content");
	},
);

it("does not trust a helper after unrelated inline code intervenes", async () => {
	const tree = parseHtmlDocument(
		`<body><main><template id="P:1"></template><template id="P:3"></template></main><div hidden id="S:1">First</div><script>${segmentHelper}$RS("S:1","P:1")</script><div hidden id="S:3">Resolved content</div><script>$RS=function(){}</script><script>$RS("S:3","P:3")</script></body>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	expect((await reconstructReactStreams(tree)).segments).toBe(1);
	expect(content(tree)).not.toContain("Resolved content");
});

it.each(["template", "noscript", "svg"])(
	"ignores completion calls inside inert or foreign %s subtrees",
	async (tag) => {
		const tree = parseHtmlDocument(
			`<body><main><template id="P:3"></template></main><div hidden id="S:3">Resolved content</div><${tag}><script>${segmentHelper}$RS("S:3","P:3")</script></${tag}></body>`,
			"https://stream.fixture.invalid/",
		);
		trees.push(tree);
		expect((await reconstructReactStreams(tree)).segments).toBe(0);
		expect(content(tree)).not.toContain("Resolved content");
	},
);

it("leaves an unterminated boundary and its hidden payload unchanged", async () => {
	const tree = parseHtmlDocument(
		`<body><!--$?--><template id="B:0"></template><p>Pending</p><div hidden id="S:0">Resolved content</div><script>${boundaryHelper}$RC("B:0","S:0")</script></body>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	expect(await reconstructReactStreams(tree)).toMatchObject({
		boundaries: 0,
		unresolved: 1,
	});
	expect(content(tree)).toContain("Pending");
	expect(content(tree)).not.toContain("Resolved content");
});

it("replaces nested fallback markers without removing following content", async () => {
	const tree = parseHtmlDocument(
		`<body><!--$?--><template id="B:0"></template><p>Outer pending</p><!--$?--><p>Inner pending</p><!--/$--><!--/$--><p>Keep following content</p><div hidden id="S:0">Resolved content</div><script>${boundaryHelper}$RC("B:0","S:0")</script></body>`,
		"https://stream.fixture.invalid/",
	);
	trees.push(tree);
	expect((await reconstructReactStreams(tree)).boundaries).toBe(1);
	expect(content(tree)).toContain("Resolved content");
	expect(content(tree)).toContain("Keep following content");
	expect(content(tree)).not.toMatch(/Outer pending|Inner pending/);
});

it("bounds completion processing rather than silently dropping excess calls", async () => {
	const tree = fixture(`${segmentHelper}${'$RS("S:3","P:3");'.repeat(257)}`);
	await expect(reconstructReactStreams(tree)).rejects.toMatchObject({
		code: "resource-limit",
	});
});

it.each([false, true])(
	"recognizes only the exact inert theme bootstrap (modified=%s)",
	async (modified) => {
		const theme =
			'((a,b,c,d,e,f,g,h)=>{let i=document.documentElement,j=["light","dark"];function k(b){var c;(Array.isArray(a)?a:[a]).forEach(a=>{let c="class"===a,d=c&&f?e.map(a=>f[a]||a):e;c?(i.classList.remove(...d),i.classList.add(f&&f[b]?f[b]:b)):i.setAttribute(a,b)}),c=b,h&&j.includes(c)&&(i.style.colorScheme=c)}if(d)k(d);else try{let a=localStorage.getItem(b)||c,d=g&&"system"===a?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":a;k(d)}catch(a){}})("class","theme","system",null,["light","dark"],null,true,true)';
		const tree = parseHtmlDocument(
			`<body><main><template id="P:1"></template><template id="P:3"></template></main><div hidden id="S:1">First</div><script>${segmentHelper}$RS("S:1","P:1")</script><script>${theme}${modified ? ";$RS=function(){}" : ""}</script><div hidden id="S:3">Resolved content</div><script>$RS("S:3","P:3")</script></body>`,
			"https://stream.fixture.invalid/",
		);
		trees.push(tree);
		expect((await reconstructReactStreams(tree)).segments).toBe(
			modified ? 1 : 2,
		);
		expect(content(tree).includes("Resolved content")).toBe(!modified);
	},
);
