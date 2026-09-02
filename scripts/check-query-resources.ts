import { DocumentTree } from "../src/document.js";
import { AgentBrowserError } from "../src/errors.js";
import { DocumentQueries } from "../src/selectors.js";

const startedAt = new Date().toISOString();
const cases: Record<string, unknown>[] = [];

for (const size of [100, 2000, 10_000]) {
	const rssBefore = process.memoryUsage().rss;
	const start = performance.now();
	const tree = new DocumentTree("https://fixture.invalid/");
	const queries = new DocumentQueries(tree, { maxResults: 20_000 });
	try {
		const list = tree.createElement("ul");
		tree.append(tree.root, list);
		const expected: number[] = [];
		let last = list;
		for (let index = 0; index < size; index++) {
			last = tree.createElement("li", {
				id: `entry-${index}`,
				class: "item",
				"data-index": String(index),
			});
			tree.append(list, last);
			if (index % 2 === 0) expected.push(last);
		}
		const constructionMs = performance.now() - start;
		const checks: Record<string, unknown>[] = [];
		for (const [selector, wanted] of [
			[`#entry-${size - 1}`, [last]],
			[".item:nth-child(odd of .item)", expected],
			[`ul:has(> li[data-index="${size - 1}"])`, [list]],
		] as [string, number[]][]) {
			const queryStart = performance.now();
			const actual = queries.querySelectorAll(selector);
			checks.push({
				selector,
				passed:
					actual.length === wanted.length &&
					actual.every((id, index) => id === wanted[index]),
				matches: actual.length,
				elapsedMs: performance.now() - queryStart,
				work: queries.metrics().lastWork,
			});
		}
		const limited = new DocumentQueries(tree, { maxWork: 1000 });
		const limitStart = performance.now();
		let budgetDenied = false;
		try {
			limited.querySelectorAll("li:has(.absent)");
		} catch (error) {
			budgetDenied =
				error instanceof AgentBrowserError && error.code === "resource-limit";
		}
		const limitElapsedMs = performance.now() - limitStart;
		const rssPopulated = process.memoryUsage().rss;
		tree.close();
		cases.push({
			size,
			constructionMs,
			checks,
			budgetDenied,
			limitElapsedMs,
			cleanup: queries.metrics(),
			limitedCleanup: limited.metrics(),
			rssBefore,
			rssPopulated,
			rssAfterClose: process.memoryUsage().rss,
			passed:
				checks.every((check) => check.passed) &&
				budgetDenied &&
				queries.metrics().closed &&
				queries.metrics().indexedNodes === 0 &&
				limited.metrics().closed,
		});
	} catch (error) {
		cases.push({
			size,
			passed: false,
			error:
				error instanceof AgentBrowserError
					? { code: error.code, message: error.message }
					: { code: "unexpected" },
		});
	} finally {
		tree.close();
	}
}

const allPassed = cases.every((item) => item.passed);
console.log(
	JSON.stringify(
		{
			schemaVersion: 1,
			scope: "constructed-query-fixtures-only",
			startedAt,
			finishedAt: new Date().toISOString(),
			node: process.versions.node,
			platform: process.platform,
			architecture: process.arch,
			cases,
			allPassed,
			limitations: [
				"No HTML parsing, website JavaScript, rendering or network requests.",
				"Timing includes cold index construction on the first query and cached indexing on subsequent queries in each fixture.",
				"RSS samples include the Node process and earlier fixtures; they are not peaks, per-document allocations or full-browser memory estimates.",
				"No forced garbage collection; closing releases references but does not promise immediate RSS reduction.",
			],
		},
		null,
		2,
	),
);
if (!allPassed) process.exitCode = 1;
