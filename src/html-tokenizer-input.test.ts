import { expect, it } from "vitest";
import { HtmlTokenizer } from "./html-tokenizer.js";

it("inserts input before unread source and pauses without treating the boundary as EOF", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("<p>original</p>", (issue) =>
		issues.push(issue),
	);
	input.insert("<span>new</span>", 0);
	input.setBoundary(16);
	expect(input.next()).toMatchObject({ kind: "start", name: "span" });
	expect(input.next()).toEqual({ kind: "text", data: "new" });
	expect(input.next()).toMatchObject({ kind: "end", name: "span" });
	expect(input.next()).toBeUndefined();
	expect(input.paused).toBe(true);
	input.setBoundary(undefined);
	expect(input.next()).toMatchObject({ kind: "start", name: "p" });
	expect(issues).toEqual([]);
});

it("retains incomplete tags and quoted attributes across inserted chunks", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("after", (issue) => issues.push(issue));
	const first = '<span title="unfinished';
	input.insert(first, 0);
	input.setBoundary(first.length);
	expect(input.next()).toBeUndefined();
	expect(input.position).toBe(0);
	const second = '">text</span>';
	input.insert(second, first.length);
	input.setBoundary(first.length + second.length);
	expect(input.next()).toMatchObject({
		kind: "start",
		name: "span",
		attributes: { title: "unfinished" },
	});
	expect(input.next()).toEqual({ kind: "text", data: "text" });
	expect(issues).toEqual([]);
});

it("does not emit a split character reference prematurely", () => {
	const input = new HtmlTokenizer("", () => {});
	input.insert("text &am", 0);
	input.setBoundary(8);
	expect(input.next()).toEqual({ kind: "text", data: "text " });
	expect(input.next()).toBeUndefined();
	input.insert("p;", 8);
	input.setBoundary(10);
	expect(input.next()).toEqual({ kind: "text", data: "&" });
});

it("pauses raw script text until its closing token becomes available", () => {
	const issues: string[] = [];
	const input = new HtmlTokenizer("", (issue) => issues.push(issue));
	input.insert("content</scr", 0);
	input.setBoundary(12);
	expect(input.raw("script")).toBeUndefined();
	input.insert("ipt>", 12);
	input.setBoundary(16);
	expect(input.raw("script")).toBe("content");
	expect(input.next()).toMatchObject({ kind: "end", name: "script" });
	expect(issues).toEqual([]);
});

it("rejects insertion into consumed source", () => {
	const input = new HtmlTokenizer("text", () => {});
	input.next();
	expect(() => input.insert("bad", 0)).toThrow();
});
