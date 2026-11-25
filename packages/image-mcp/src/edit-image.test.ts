import assert from "node:assert/strict";
import { mkdtemp, open, readdir, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { editImage, MAX_EDIT_UPLOAD_BYTES, MAX_INPUT_IMAGE_BYTES } from "./image-client.js";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=";
const png = Buffer.from(PNG_BASE64, "base64");

interface Captured {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}

/** A local gateway that records every request and answers with a 1x1 PNG. */
async function mockGateway() {
  const requests: Captured[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("latin1"),
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "devku-edit-"));
  const write = async (name: string, bytes: Uint8Array) => {
    const path = join(root, name);
    await writeFile(path, bytes);
    return path;
  };
  /** A file that reports `size` bytes but only stores a PNG header. */
  const sized = async (name: string, size: number) => {
    const path = join(root, name);
    const handle = await open(path, "w");
    await handle.write(png);
    await handle.truncate(size);
    await handle.close();
    return path;
  };
  return { root, write, sized, output: join(root, "out") };
}

const defaults = { model: "gpt-image-2", size: "1024x1024", quality: "auto" } as const;

test("editImage sends every image and the mask as multipart without local names", async () => {
  const gateway = await mockGateway();
  const { root, write, output } = await fixture();
  try {
    const first = await write("private-first.png", png);
    const second = await write("private-second.png", png);
    const mask = await write("private-mask.png", png);
    const image = await editImage(
      { ...defaults, prompt: "make it blue", images: [first, second], mask },
      { baseUrl: gateway.baseUrl, apiKey: "test-key", outputDirectory: output },
    );

    assert.equal(gateway.requests.length, 1);
    const [request] = gateway.requests;
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, "/v1/images/edits");
    assert.equal(request?.headers.authorization, "Bearer test-key");
    assert.match(request?.headers["content-type"] ?? "", /^multipart\/form-data; boundary=/);
    const body = request?.body ?? "";
    assert.equal(body.match(/name="image\[\]"/g)?.length, 2);
    assert.match(body, /name="image\[\]"; filename="image-1\.png"/);
    assert.match(body, /name="image\[\]"; filename="image-2\.png"/);
    assert.match(body, /name="mask"; filename="mask\.png"/);
    assert.match(body, /name="model"\r\n\r\ngpt-image-2\r\n/);
    assert.match(body, /name="size"\r\n\r\n1024x1024\r\n/);
    assert.match(body, /name="n"\r\n\r\n1\r\n/);
    assert.match(body, /make it blue/);
    assert.doesNotMatch(body, /private-/);
    assert.ok(!body.includes(root));

    assert.equal(image.mimeType, "image/png");
    assert.equal(image.base64, PNG_BASE64);
    assert.deepEqual(await readdir(output), [image.path.slice(output.length + 1)]);
  } finally {
    await gateway.close();
  }
});

test("editImage rejects bad local inputs before sending any request", async () => {
  const gateway = await mockGateway();
  const { root, write, sized } = await fixture();
  try {
    const good = await write("good.png", png);
    const html = await write("page.png", Buffer.from("<html>not an image</html>"));
    const jpegMask = await write("mask.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
    const huge = await sized("huge.png", MAX_INPUT_IMAGE_BYTES + 1);
    const half = Math.floor(MAX_EDIT_UPLOAD_BYTES / 2) + 1;
    const big1 = await sized("big1.png", half);
    const big2 = await sized("big2.png", half);
    const cases: Array<[{ images: string[]; mask?: string }, RegExp]> = [
      [{ images: [] }, /between 1 and 16/],
      [{ images: ["relative/a.png"] }, /^Image 1 must be an absolute local file path/],
      [{ images: [join(root, "missing.png")] }, /^Image 1 was not found or is not a file/],
      [{ images: [root] }, /^Image 1 was not found or is not a file/],
      [{ images: [good, html] }, /^Image 2 is not a PNG, JPEG or WebP image/],
      [{ images: [good], mask: jpegMask }, /^The mask must be a PNG image/],
      [{ images: [huge] }, /^Image 1 is larger than 20 MB/],
      [{ images: [big1, big2] }, /28 MB in total/],
    ];
    for (const [input, message] of cases) {
      await assert.rejects(
        editImage({ ...defaults, prompt: "edit", ...input }, { baseUrl: gateway.baseUrl, apiKey: "test-key" }),
        (error: Error) => {
          assert.match(error.message, message);
          assert.ok(!error.message.includes(root));
          return true;
        },
      );
    }
    assert.equal(gateway.requests.length, 0);
  } finally {
    await gateway.close();
  }
});
