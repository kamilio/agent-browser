import { createServer } from "node:http";
import { expect, it } from "vitest";
import { fillTextControl, setControlChecked } from "./controls.js";
import { DocumentTree } from "./document.js";
import { prepareFormSubmission } from "./forms.js";
import { NodeNetworkTransport } from "./node-transport.js";

it.each([
	"get",
	"application/x-www-form-urlencoded",
	"multipart/form-data",
	"text/plain",
])(
	"round trips %s forms through the real Node transport and an independent HTTP peer",
	async (encoding) => {
		const server = createServer(async (request, response) => {
			try {
				const chunks: Buffer[] = [];
				for await (const chunk of request) chunks.push(Buffer.from(chunk));
				const body = Buffer.concat(chunks);
				let entries: unknown;
				if (request.method === "GET")
					entries = [
						...new URL(request.url ?? "/", "http://fixture.test").searchParams,
					];
				else if (encoding === "text/plain") entries = body.toString();
				else {
					const formData = await new Response(body, {
						headers: { "content-type": request.headers["content-type"] ?? "" },
					}).formData();
					entries = await Promise.all(
						[...formData].map(async ([name, value]) => [
							name,
							typeof value === "string"
								? value
								: {
										name: value.name,
										size: value.size,
										text: await value.text(),
									},
						]),
					);
				}
				response.setHeader("content-type", "application/json");
				response.end(
					JSON.stringify({
						entries,
						origin: request.headers.origin,
						method: request.method,
					}),
				);
			} catch {
				response.writeHead(400);
				response.end("fixture parse failure");
			}
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Missing fixture address");
		const origin = `http://127.0.0.1:${address.port}`;
		const network = new NodeNetworkTransport({ allowPrivateOrigins: [origin] });
		const tree = new DocumentTree(`${origin}/form`);
		try {
			const form = tree.createElement("form", {
				action: "/echo",
				method: encoding === "get" ? "get" : "post",
				enctype: encoding,
			});
			tree.append(tree.root, form);
			const input = tree.createElement("input", { name: "query" });
			tree.append(form, input);
			fillTextControl(tree, tree.reference(input), "日本語 search");
			const checkbox = tree.createElement("input", {
				type: "checkbox",
				name: "enabled",
				value: "yes",
			});
			tree.append(form, checkbox);
			setControlChecked(tree, tree.reference(checkbox), true);
			const files = new Map<
				number,
				{ name: string; type: string; data: Uint8Array }[]
			>();
			if (encoding === "multipart/form-data") {
				const inputFile = tree.createElement("input", {
					type: "file",
					name: "file",
				});
				tree.append(form, inputFile);
				files.set(inputFile, [
					{
						name: "tiny.txt",
						type: "text/plain",
						data: new TextEncoder().encode("hello"),
					},
				]);
			}
			const plan = prepareFormSubmission(tree, tree.reference(form), { files });
			const result = await network.request(plan.request);
			expect(result.status).toBe(200);
			const echoed = JSON.parse(new TextDecoder().decode(result.body));
			if (encoding === "text/plain")
				expect(echoed.entries).toBe("query=日本語 search\r\nenabled=yes\r\n");
			else
				expect(echoed.entries.slice(0, 2)).toEqual([
					["query", "日本語 search"],
					["enabled", "yes"],
				]);
			if (encoding === "multipart/form-data")
				expect(echoed.entries[2]).toEqual([
					"file",
					{ name: "tiny.txt", size: 5, text: "hello" },
				]);
			if (encoding !== "get") expect(echoed.origin).toBe(origin);
		} finally {
			tree.close();
			network.close();
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	},
);
