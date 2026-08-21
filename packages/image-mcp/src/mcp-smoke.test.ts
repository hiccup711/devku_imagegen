import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("bundled MCP server exposes generate_image and fails clearly without a key", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "plugins", "devku-imagegen", "server.mjs")],
    env: {
      PATH: process.env.PATH || "",
      DEVKU_IMAGE_BASE_URL: "https://a1.devku.ai/v1",
      DEVKU_IMAGE_DISABLE_KEYCHAIN: "1",
      DEVKU_IMAGE_DISABLE_DPAPI: "1",
    },
  });
  const client = new Client({ name: "devku-image-test", version: "0.1.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["generate_image"],
    );

    const result = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "A centered black circle on a white background. No text.",
      },
    });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), /No image API credential is available/);
  } finally {
    await client.close();
  }
});
