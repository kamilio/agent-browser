import { expect, it } from "vitest";
import { renderReferenceHtml } from "../scripts/reference-renderer.js";

const options = {
	url: "https://reference.invalid/test",
	width: 20,
	height: 12,
};

it("checks a propagated canvas against independent known RGBA, not another rendering", async () => {
	const result = await renderReferenceHtml(
		"<style>body{background:green}</style><body></body>",
		options,
	);
	for (let offset = 0; offset < result.image.pixels.length; offset += 4)
		expect(result.image.pixels.slice(offset, offset + 4)).toEqual(
			new Uint8Array([0, 128, 0, 255]),
		);
	expect(result.scripts).toBeNull();
	expect(Object.values(result.timings).every((value) => value >= 0)).toBe(true);
	expect(result.work.layout).toBeGreaterThan(0);
	expect(result.work.paint).toBeGreaterThan(0);
});

it("checks normal-flow rectangle placement against an independent coordinate oracle", async () => {
	const result = await renderReferenceHtml(
		"<style>html,body{margin:0}div{margin-left:3px;margin-top:2px;width:4px;height:5px;background:blue}</style><div></div>",
		options,
	);
	for (let row = 0; row < options.height; row++)
		for (let column = 0; column < options.width; column++) {
			const expected =
				column >= 3 && column < 7 && row >= 2 && row < 7
					? [0, 0, 255, 255]
					: [255, 255, 255, 255];
			const offset = (row * options.width + column) * 4;
			expect(result.image.pixels.slice(offset, offset + 4)).toEqual(
				new Uint8Array(expected),
			);
		}
});

it.each([
	'<script>throw new Error("must not run")</script>',
	'<html class="reftest-wait"></html>',
])("does not silently skip script/readiness requirements", async (source) => {
	await expect(renderReferenceHtml(source, options)).rejects.toMatchObject({
		code: "unsupported",
	});
});

it("refuses a stylesheet fetch rather than accessing a live origin", async () => {
	await expect(
		renderReferenceHtml(
			'<link rel="stylesheet" href="https://example.com/private.css">',
			options,
		),
	).rejects.toMatchObject({ code: "unsupported" });
});

it("refuses image resources outside the declared profile", async () => {
	await expect(
		renderReferenceHtml('<img src="https://example.com/photo.png">', options),
	).rejects.toMatchObject({ code: "unsupported" });
});

it.each([
	{ width: 0 },
	{ height: 1025 },
	{ width: 1.5 },
	{ timeoutMs: 0 },
	{ timeoutMs: 5001 },
])("enforces bounded render inputs %j", async (override) => {
	await expect(
		renderReferenceHtml("", { ...options, ...override }),
	).rejects.toMatchObject({ code: "invalid-input" });
});
