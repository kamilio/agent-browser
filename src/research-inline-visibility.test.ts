import { expect, it, vi } from "vitest";
import * as cssParser from "./css-parser.js";
import { sourceInlineDisplayHidden } from "./research-inline-visibility.js";

it.each([
	"display:none",
	"DISPLAY: NoNe;",
	"\t\n\f\r display \t\n\f\r : \t\n\f\r none \t\n\f\r ;",
	"display:none!important",
	"display: NONE ! IMPORTANT;",
	"display:none\t!\n\f\r important",
	";;; \t;display:none;;",
	"color:red; display:none; margin:0; padding:1px 2px",
	"--display:block; -vendor-property:value; display:none",
	'content:"display:block; all:initial"; display:none',
	"content:'display:block; all:initial'; display:none",
	'content:"visible 🐈 text"; display:none',
	"width:calc(100% - min(1px, max(2px, 3px))); display:none",
	"--config:fn([nested(display:block; all:initial)]); display:none",
	'background:url("image;display:block).png"); display:none',
	"background:url('image;display:block).png'); display:none",
	"background:url(image;display:block.png); display:none",
	"background:URL( image.png ); display:none",
	"background:url(); display:none",
])(
	"accepts bounded ASCII declarations without spoofed boundaries: %s",
	(style) => {
		expect(sourceInlineDisplayHidden(style)).toBe(true);
	},
);

it.each([
	["display:none;display:block", false],
	["display:block;display:none", true],
	["display:none!important;display:block", true],
	["display:block!important;display:none", false],
	["display:none;display:block!important", false],
	["display:block;display:none!important", true],
	["display:none!important;display:block!important", false],
	["display:block!important;display:none!important", true],
	["display:none!important;display:block;display:inline", true],
	["display:none;display:none", true],
])("resolves display order and importance: %s", (style, expected) => {
	expect(sourceInlineDisplayHidden(style)).toBe(expected);
});

it.each([
	"contents",
	"block",
	"inline",
	"inline-block",
	"list-item",
	"flex",
	"inline-flex",
	"grid",
	"inline-grid",
	"flow-root",
	"table",
	"inline-table",
	"table-row",
	"table-cell",
	"table-row-group",
	"table-header-group",
	"table-footer-group",
	"table-column",
	"table-column-group",
	"table-caption",
])("recognizes the single-keyword non-none display value %s", (value) => {
	expect(sourceInlineDisplayHidden(`display:none;display:${value}`)).toBe(
		false,
	);
	expect(sourceInlineDisplayHidden(`display:${value};display:none`)).toBe(true);
	expect(
		sourceInlineDisplayHidden(`display:none!important;display:${value}`),
	).toBe(true);
});

it.each([
	undefined,
	"",
	" \t\n\f\r ;;;",
	"display:block",
	"visibility:hidden;opacity:0;content-visibility:hidden",
	"class:hidden;id:hidden;inert:true",
	"--display:none;--display-none:none;--all:none",
	'content:"display:none"',
	"--config:fn(display:none;display:none!important)",
	'background:url("image;display:none.png")',
	"background:url(image;display:none.png)",
])("does not infer hidden content from unrelated source: %s", (style) => {
	expect(sourceInlineDisplayHidden(style)).toBe(false);
});

it.each([
	"initial",
	"inherit",
	"unset",
	"revert",
	"revert-layer",
	"var(--display)",
	"var(--display, none)",
	"env(display, none)",
	"attr(data-display)",
	"block flow",
	"inline flex",
	"ruby",
	"unknown",
	"none block",
	'"none"',
	"none()",
	"none !urgent",
	"none !important!important",
	"none !important trailing",
	"none ! important()",
])("retains content for unsupported display syntax anywhere: %s", (value) => {
	expect(sourceInlineDisplayHidden(`display:${value}`)).toBe(false);
	expect(
		sourceInlineDisplayHidden(`display:${value};display:none!important`),
	).toBe(false);
	expect(
		sourceInlineDisplayHidden(`display:none!important;display:${value}`),
	).toBe(false);
});

it.each([
	"all:initial",
	"ALL:unset!important",
	"all:unknown",
	"display/**/:none",
	"color:/*comment*/red",
	"color:red/*unterminated",
	"color:red*/",
	String.raw`d\69splay:none`,
	String.raw`display:n\6fne`,
	String.raw`content:"a\"b"`,
	"color:red\0",
	"color:red\v",
	"color:red\u001b",
	"color:red\u007f",
	'content:"text\0"',
	"background:url(image\0.png)",
	".hidden{display:none}",
	"@media screen {display:none}",
	'content:"{}"',
	'content:"/*text*/"',
	"broken",
	"color:",
	":red",
	"display none",
	"*display:none",
	"color:red)",
	"color:red]",
	"width:calc(1px",
	"--value:[unclosed",
	"--value:([)]",
	'content:"unterminated',
	"content:'unterminated",
	'content:"first\nsecond"',
	'content:"first\rsecond"',
	'content:"first\fsecond"',
	'background:url(bad") ; display:block ; color:red")',
	'background:url(bad ") ; display:block ; color:red")',
	'background:url("good"bad)',
	"background:url(bad url)",
	"background:url(bad(nested))",
	"background:url(bad[)",
	"background:url(bad])",
	'background:url("first\nsecond")',
	`background:url(${" ".repeat(8000)}`,
])(
	"retains on unsafe or ambiguous components before or after none: %s",
	(value) => {
		expect(sourceInlineDisplayHidden(`${value};display:none!important`)).toBe(
			false,
		);
		expect(sourceInlineDisplayHidden(`display:none!important;${value}`)).toBe(
			false,
		);
	},
);

it.each([
	"\u00a0",
	"\u1680",
	"\u2003",
	"\u2028",
	"\u2029",
	"\u202f",
	"\u3000",
	"\ufeff",
])("does not treat non-CSS whitespace as trivia: %j", (whitespace) => {
	for (const style of [
		`${whitespace}display:none`,
		`display${whitespace}:none`,
		`display:${whitespace}none`,
		`display:none${whitespace}`,
		`display:none!${whitespace}important`,
		`display:none;${whitespace}`,
	]) {
		expect(sourceInlineDisplayHidden(style)).toBe(false);
	}
});

it.each([8191, 8192, 8193])(
	"bounds UTF-16 source length at %i units",
	(length) => {
		const prefix = 'display:none;content:"🐈';
		const style = `${prefix}${"a".repeat(length - prefix.length - 1)}"`;
		expect(style.length).toBe(length);
		expect(sourceInlineDisplayHidden(style)).toBe(length <= 8192);
	},
);

it.each([127, 128, 129])("bounds nonempty declaration count at %i", (count) => {
	const other = "color:red;".repeat(count - 1);
	for (const style of [`display:none;${other}`, `${other}display:none`]) {
		expect(sourceInlineDisplayHidden(style)).toBe(count <= 128);
	}
});

it("does not count empty statements or nested and quoted semicolons as declarations", () => {
	const style = `;;;\t;${"color:red; ;".repeat(125)}content:"${";".repeat(129)}";--config:fn(${";".repeat(129)});display:none;;;`;
	expect(sourceInlineDisplayHidden(style)).toBe(true);
	expect(sourceInlineDisplayHidden(`${style}color:red`)).toBe(false);
});

it.each([31, 32, 33])("bounds balanced component nesting at %i", (depth) => {
	const style = `--value:${"fn(".repeat(depth)}value${")".repeat(depth)};display:none`;
	expect(sourceInlineDisplayHidden(style)).toBe(depth <= 32);
});

it("retains content if the native scanner reports an issue", () => {
	const scanner = vi
		.spyOn(cssParser, "cssDeclarationStatements")
		.mockImplementation(function* (_source, issue) {
			yield "display:none";
			issue("unterminated-css-string");
		});
	try {
		expect(sourceInlineDisplayHidden("display:none")).toBe(false);
	} finally {
		scanner.mockRestore();
	}
});

it("retains content if the native scanner throws after a hidden declaration", () => {
	const scanner = vi
		.spyOn(cssParser, "cssDeclarationStatements")
		.mockImplementation(function* () {
			yield "display:none";
			throw new Error("scanner limit");
		});
	try {
		expect(sourceInlineDisplayHidden("display:none")).toBe(false);
	} finally {
		scanner.mockRestore();
	}
});
