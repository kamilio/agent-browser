import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { jpegFixtures } from "./jpeg-fixtures.js";
import { inflateSync } from "node:zlib";
import { capturePng, capturePdf } from "../src/capture-client.js";
import { BrowserCommandHost } from "../src/command-host.js";
import { documentImages, documentImageLimits } from "../src/document-images.js";
import { rasterizeDocument } from "../src/document-raster.js";
import { loadBrowserDocument } from "../src/document-loader.js";
import type { DocumentTree } from "../src/document.js";
import { documentInteractions } from "../src/interactions.js";
import { scriptFrame } from "../src/node-script-protocol.js";
import { PageScripts, type PageScriptCore } from "../src/page-scripts.js";
import { encodePng } from "../src/png.js";
import { decodePng } from "../src/png-decoder.js";
import { createRaster } from "../src/raster.js";
import type { ScriptEvaluation } from "../src/safejs.js";
import { ScriptLoader } from "../src/script-loader.js";
import { BrowserSession } from "../src/session.js";
import { loadExtendedCore } from "./extended-safejs-core.js";

const startedAt = new Date().toISOString();
if (process.argv.length > 3)
	throw new Error("Optionally provide the independent one-megapixel JPEG path");
const largeImageBytes = process.argv[2]
	? await readFile(process.argv[2])
	: undefined;
const core = (await loadExtendedCore()) as unknown as PageScriptCore;
const owners = new Map<DocumentTree, PageScripts>();
const sessions: BrowserSession[] = [];
const checks: { label: string; passed: boolean }[] = [];
const requests: string[] = [];
let passed = false;
let maximumFrameBytes = 0;
let pixelEvidence: unknown;
let largeImageEvidence: unknown;
const captures: unknown[] = [];
const html =
	'<style>main{font-size:8px;line-height:10px}#photo{display:block;width:15px;padding:2px;background:navy}</style><main id="status">loading</main><img id="photo" src="/one.png"><script>var photo=document.getElementById("photo");var loads=0;var failures=0;var windowSawImage=false;photo.onload=function(event){loads++;document.getElementById("status").textContent="image "+photo.naturalWidth+"x"+photo.naturalHeight;};photo.onerror=function(){failures++;};window.addEventListener("load",function(){windowSawImage=photo.complete&&photo.naturalWidth===3;});</script>';
const host = new BrowserCommandHost({
	websiteScripts: true,
	createSession: () => {
		const browser = new BrowserSession({
			createTransport: () => ({
				async request(input) {
					requests.push(input.url);
					const jpeg = input.url.endsWith(".jpg");
					const image = jpeg || input.url.endsWith(".png");
					if (image) await new Promise((resolve) => setTimeout(resolve, 10));
					const second = input.url.endsWith("/two.png");
					const largeImage = input.url.endsWith("/benchmark.jpg");
					if (largeImage && !largeImageBytes)
						throw new Error("No large JPEG fixture was provided");
					const reference = jpegFixtures.find(
						(entry) =>
							entry.name.includes("RGB-17x13-q80-s2-") &&
							entry.progressive === input.url.endsWith("/progressive.jpg"),
					);
					if (jpeg && !reference)
						throw new Error("Missing independent JPEG fixture");
					const body =
						largeImage && largeImageBytes
							? largeImageBytes
							: jpeg && reference
								? Buffer.from(reference.jpeg, "base64")
								: image
									? encodePng(
											createRaster(
												second ? 5 : 3,
												second ? 4 : 2,
												second ? [0, 0, 255, 255] : [255, 0, 0, 255],
											),
										)
									: new TextEncoder().encode(html);
					return {
						url: input.url,
						status: input.url.endsWith("/missing.png") ? 404 : 200,
						headers: {
							"content-type": [
								jpeg ? "image/jpeg" : image ? "image/png" : "text/html",
							],
						},
						body,
						encodedBytes: body.length,
						redirects: [],
						elapsedMs: 0,
					};
				},
				metrics: () => ({
					requests: requests.length,
					redirects: 0,
					encodedBytes: 0,
					decodedBytes: 0,
					active: 0,
					closed: false,
				}),
				close() {},
			}),
			loadDocument: (response, context) =>
				loadBrowserDocument(response, {
					...context,
					scripts: new ScriptLoader({
						response,
						signal: context.signal,
						fetch: context.fetchScript,
						owner: (tree) => {
							const page = new PageScripts(
								{ document: tree, interactions: documentInteractions(tree) },
								core,
							);
							owners.set(tree, page);
							return page;
						},
					}),
				}),
		});
		sessions.push(browser);
		return browser;
	},
	evaluatePage: (page, source, signal) => {
		const owner = owners.get(page.document);
		if (!owner) throw new Error("Missing actual page runtime");
		return owner.evaluate(source, { signal });
	},
});
function check(label: string, valid: boolean) {
	checks.push({ label, passed: valid });
	if (!valid) throw new Error(label);
}
async function execute(argv: readonly string[]) {
	const result = await host.execute(argv);
	const frame = scriptFrame({ result });
	maximumFrameBytes = Math.max(maximumFrameBytes, Buffer.byteLength(frame));
	return (JSON.parse(frame) as { result: typeof result }).result;
}
async function command(argv: string[]) {
	return (await execute(argv)).data;
}
async function guest(label: string, source: string) {
	const result = (await command(["eval", source])) as ScriptEvaluation;
	if (!result.ok) throw new Error(`${label}: ${JSON.stringify(result.error)}`);
	check(label, result.value === true);
}
try {
	await command(["open", "https://fixture.invalid/images"]);
	await command(["resize", "96", "64"]);
	await guest(
		"Parser-created image completes through the real guest handler before Window load",
		'return photo.complete && photo.naturalWidth===3 && photo.naturalHeight===2 && loads===1 && windowSawImage && document.getElementById("status").textContent==="image 3x2";',
	);
	const inspection = (await command(["images"])) as {
		images: { ref: string; state: string; naturalWidth: number }[];
	};
	check(
		"Agent image inspection reports actual decoded intrinsic dimensions",
		inspection.images[0].state === "complete" &&
			inspection.images[0].naturalWidth === 3,
	);
	const browser = sessions[0];
	const tree = browser.page(browser.tabs()[0].id).document;
	const images = documentImages(tree);
	const imageId = tree.resolve(inspection.images[0].ref).id;
	await guest(
		"Actual interpreted image geometry, used styles and client sizes agree with intrinsic-ratio layout",
		'var bounds=photo.getBoundingClientRect();var used=window.getComputedStyle(photo);return bounds.x===0&&bounds.y===10&&bounds.width===19&&bounds.height===14&&used.width==="15px"&&used.height==="10px"&&photo.clientWidth===19&&photo.offsetHeight===14;',
	);
	const before = await capturePng(execute, inspection.images[0].ref);
	const beforeImage = decodePng(before.bytes).image;
	check(
		"Agent element PNG contains actual scaled red image pixels inside navy padding",
		before.released &&
			beforeImage.width === 19 &&
			beforeImage.height === 14 &&
			[...beforeImage.pixels.slice(0, 4)].join(",") === "0,0,128,255" &&
			[...beforeImage.pixels.slice(160, 164)].join(",") === "255,0,0,255",
	);
	captures.push({
		kind: "before-element",
		width: beforeImage.width,
		height: beforeImage.height,
		bytes: before.bytes.length,
		sha256: createHash("sha256").update(before.bytes).digest("hex"),
	});
	await guest(
		"Actual page code receives the image decode promise and source replacement",
		'var decoded=false;photo.src="/two.png";photo.decode().then(function(){decoded=true;},function(){decoded="failed";});return photo.complete===false&&photo.naturalWidth===0;',
	);
	await images.settle();
	await guest(
		"Post-navigation image decoding resolves the guest promise and updates DOM",
		'return decoded===true&&loads===2&&photo.complete&&photo.naturalWidth===5&&photo.naturalHeight===4&&document.getElementById("status").textContent==="image 5x4";',
	);
	const decoded = images.decoded(imageId);
	check(
		"The loaded resource contains actual blue RGBA pixels, not dimensions-only metadata",
		!!decoded &&
			decoded.image.pixels.length === 80 &&
			[...decoded.image.pixels.slice(0, 4)].join(",") === "0,0,255,255",
	);
	pixelEvidence = decoded
		? {
				width: decoded.image.width,
				height: decoded.image.height,
				sha256: createHash("sha256").update(decoded.image.pixels).digest("hex"),
			}
		: undefined;
	await guest(
		"Guest geometry invalidates after source replacement changes intrinsic ratio",
		'var updated=photo.getBoundingClientRect();return updated.width===19&&updated.height===16&&window.getComputedStyle(photo).height==="12px"&&photo.offsetHeight===16;',
	);
	const after = await capturePng(execute, inspection.images[0].ref);
	const afterImage = decodePng(after.bytes).image;
	check(
		"The subsequent agent element PNG has the new dimensions and blue pixels",
		after.released &&
			afterImage.width === 19 &&
			afterImage.height === 16 &&
			[...afterImage.pixels.slice(160, 164)].join(",") === "0,0,255,255",
	);
	captures.push({
		kind: "after-element",
		width: afterImage.width,
		height: afterImage.height,
		bytes: after.bytes.length,
		sha256: createHash("sha256").update(after.bytes).digest("hex"),
	});
	const viewport = await capturePng(execute);
	const viewportImage = decodePng(viewport.bytes).image;
	check(
		"Full agent PNG places the real image in normal document flow below guest-generated text",
		viewport.released &&
			viewportImage.width === 96 &&
			viewportImage.height === 64 &&
			[
				...viewportImage.pixels.slice((12 * 96 + 2) * 4, (12 * 96 + 2) * 4 + 4),
			].join(",") === "0,0,255,255",
	);
	const pdf = await capturePdf(execute);
	const source = Buffer.from(pdf.bytes).toString("latin1");
	const pattern =
		/<< \/Type \/XObject \/Subtype \/Image.*?\/Length (\d+) >>\nstream\n/gs;
	const match = pattern.exec(source);
	if (!match) throw new Error("PDF lacks its actual raster stream");
	const pixels = inflateSync(
		pdf.bytes.subarray(pattern.lastIndex, pattern.lastIndex + Number(match[1])),
	);
	const expected = Buffer.from(
		[...rasterizeDocument(tree).image.pixels].filter(
			(_, index) => index % 4 !== 3,
		),
	);
	check(
		"Agent PDF visual pixels exactly equal the shared image-aware document raster",
		pdf.released && pixels.equals(expected),
	);
	captures.push({
		kind: "pdf",
		bytes: pdf.bytes.length,
		sha256: createHash("sha256").update(pdf.bytes).digest("hex"),
	});
	await guest(
		"A second interpreted image shares the existing decoded resource",
		'var copy=document.createElement("img");copy.src="/two.png";document.body.appendChild(copy);return copy.complete===true&&copy.naturalWidth===5&&document.images.length===2;',
	);
	await images.settle();
	check(
		"Image deduplication avoids a second request and second pixel buffer",
		requests.filter((url) => url.endsWith("/two.png")).length === 1 &&
			images.metrics().decodedBytes === 80,
	);
	for (const kind of ["baseline", "progressive"]) {
		await guest(
			`Guest code starts a ${kind} JPEG decode through the active session`,
			`var jpegReady=false;photo.style.width="17px";photo.src="/${kind}.jpg";photo.decode().then(function(){jpegReady=true;});return photo.complete===false;`,
		);
		await images.settle();
		await guest(
			`The ${kind} JPEG updates actual guest dimensions, events and geometry`,
			`return jpegReady&&photo.complete&&photo.naturalWidth===17&&photo.naturalHeight===13&&photo.getBoundingClientRect().width===21&&photo.getBoundingClientRect().height===17&&loads===${kind === "baseline" ? 3 : 4};`,
		);
		const jpegCapture = await capturePng(execute, inspection.images[0].ref);
		const jpegRaster = decodePng(jpegCapture.bytes).image;
		const owned = images.decoded(imageId);
		const cropped = new Uint8Array(17 * 13 * 4);
		for (let row = 0; row < 13; row++)
			cropped.set(
				jpegRaster.pixels.subarray(
					((row + 2) * 21 + 2) * 4,
					((row + 2) * 21 + 19) * 4,
				),
				row * 17 * 4,
			);
		check(
			`Agent PNG contains the actual ${kind} JPEG resource pixels`,
			jpegCapture.released &&
				jpegRaster.width === 21 &&
				jpegRaster.height === 17 &&
				owned?.mediaType === "image/jpeg" &&
				owned.progressive === (kind === "progressive") &&
				Buffer.from(cropped).equals(owned.image.pixels),
		);
		captures.push({
			kind: `${kind}-jpeg-element`,
			width: jpegRaster.width,
			height: jpegRaster.height,
			bytes: jpegCapture.bytes.length,
			sha256: createHash("sha256").update(jpegCapture.bytes).digest("hex"),
		});
	}
	if (largeImageBytes) {
		await command(["resize", "160", "180"]);
		await guest(
			"Guest code starts the independently encoded one-megapixel photo",
			'var largeReady=false;photo.style.width="128px";photo.src="/benchmark.jpg";photo.decode().then(function(){largeReady=true;});return !photo.complete;',
		);
		await images.settle();
		await guest(
			"The large JPEG resolves through the real page owner and updates guest geometry",
			"return largeReady&&photo.complete&&photo.naturalWidth===1024&&photo.naturalHeight===1024&&photo.getBoundingClientRect().width===132&&photo.getBoundingClientRect().height===132&&loads===5;",
		);
		const large = images.decoded(imageId);
		check(
			"The one-megapixel resource stays within the unchanged default page work guard",
			large?.mediaType === "image/jpeg" &&
				large.work <= documentImageLimits.maxDecodeWork &&
				documentImageLimits.maxDecodeWork === 33554432 &&
				large.image.pixels.length === 4194304,
		);
		if (!large) throw new Error("Missing decoded large photo");
		const capture = await capturePng(execute, inspection.images[0].ref);
		const painted = decodePng(capture.bytes).image;
		let exact = painted.width === 132 && painted.height === 132;
		for (let row = 0; row < 128; row++)
			for (let column = 0; column < 128; column++)
				for (let channel = 0; channel < 4; channel++) {
					if (
						painted.pixels[((row + 2) * 132 + column + 2) * 4 + channel] !==
						large.image.pixels[
							((row * 8 + 4) * 1024 + column * 8 + 4) * 4 + channel
						]
					)
						exact = false;
				}
		check(
			"The actual agent PNG contains exact downscaled pixels from the one-megapixel image",
			capture.released && exact,
		);
		largeImageEvidence = {
			encodedBytes: largeImageBytes.length,
			decodedBytes: large.image.pixels.length,
			work: large.work,
			defaultPageDecodeWorkLimit: documentImageLimits.maxDecodeWork,
			resourceSha256: createHash("sha256")
				.update(large.image.pixels)
				.digest("hex"),
			screenshotBytes: capture.bytes.length,
			screenshotWidth: painted.width,
			screenshotHeight: painted.height,
			screenshotSha256: createHash("sha256")
				.update(capture.bytes)
				.digest("hex"),
		};
	}
	const jpegPdf = await capturePdf(execute);
	const jpegPdfText = Buffer.from(jpegPdf.bytes).toString("latin1");
	const jpegPdfPattern =
		/<< \/Type \/XObject \/Subtype \/Image.*?\/Length (\d+) >>\nstream\n/gs;
	const jpegPdfMatch = jpegPdfPattern.exec(jpegPdfText);
	if (!jpegPdfMatch) throw new Error("JPEG PDF is missing its raster");
	const jpegPdfPixels = inflateSync(
		jpegPdf.bytes.subarray(
			jpegPdfPattern.lastIndex,
			jpegPdfPattern.lastIndex + Number(jpegPdfMatch[1]),
		),
	);
	check(
		"Agent PDF contains the exact mixed JPEG and PNG document raster",
		jpegPdf.released &&
			jpegPdfPixels.equals(
				Buffer.from(
					[...rasterizeDocument(tree).image.pixels].filter(
						(_, index) => index % 4 !== 3,
					),
				),
			),
	);
	check(
		"Agent image inspection distinguishes live JPEG and PNG resources",
		JSON.stringify(await command(["images"])).includes(
			'"mediaType":"image/jpeg"',
		) && images.get(imageId).ignoredMetadata.length === 0,
	);
	await guest(
		"Actual page code starts a failed image and retains its error handler",
		'photo.src="/missing.png";return photo.complete===false;',
	);
	await images.settle();
	await guest(
		"Failed image delivery reports broken completion and zero intrinsic dimensions",
		"return photo.complete&&photo.naturalWidth===0&&failures===1&&copy.naturalWidth===5;",
	);
	const journal = JSON.stringify(await command(["requests"]));
	check(
		"The real agent request journal includes image network activity",
		journal.includes('"kind":"image"'),
	);
	await command(["close"]);
	check(
		"Closing the agent tab releases all decoded image resources",
		images.metrics().closed &&
			images.metrics().decodedBytes === 0 &&
			images.metrics().resources === 0,
	);
	check(
		"Image command frames stay within the existing JSON protocol bound",
		maximumFrameBytes < 100000,
	);
	passed = true;
} finally {
	await host.close();
	await Promise.all([...owners.values()].map((owner) => owner.close()));
	console.log(
		JSON.stringify(
			{
				startedAt,
				finishedAt: new Date().toISOString(),
				passed,
				checks,
				maximumFrameBytes,
				pixelEvidence,
				largeImageEvidence,
				captures,
				requests: requests.length,
				runtime:
					"existing experimental SafeJS core, not released-SDK acceptance",
				fixture:
					"production document loader, image session transport and agent commands over in-memory mocked responses; no network or sockets",
				limitations:
					"Loaded PNG and 8-bit Huffman JPEG normal-flow layout; responsive sources, CORS attributes, color management, EXIF orientation, other formats, released SDK and real-site acceptance remain open",
			},
			null,
			2,
		),
	);
}
