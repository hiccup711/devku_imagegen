import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveImageApiKey } from "./credentials.js";
import { generateImage, IMAGE_MODELS } from "./image-client.js";

const server = new McpServer(
  { name: "devku-image", version: "0.1.0" },
  {
    instructions:
      "Generate real raster images through the configured Devku-compatible Image API. Use generate_image for UI concepts, illustrations, product imagery, and bitmap assets. Never replace requested image generation with SVG, CSS, canvas, or local drawing commands.",
  },
);

server.registerTool(
  "generate_image",
  {
    title: "Generate image",
    description:
      "Generate a raster image with gpt-image-2 or gpt-image-1.5, save it securely, and return both a preview and the exact local path.",
    inputSchema: {
      prompt: z.string().min(1).max(32_000).describe("Detailed image generation prompt"),
      model: z.enum(IMAGE_MODELS).default("gpt-image-2").describe("Image model"),
      size: z.string().min(3).max(32).default("1024x1024").describe("Requested image dimensions"),
      quality: z.enum(["low", "medium", "high", "auto"]).default("auto"),
      outputName: z
        .string()
        .min(1)
        .max(120)
        .optional()
        .describe("Optional filename only; directories are ignored"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (input) => {
    try {
      const apiKey = await resolveImageApiKey();
      const image = await generateImage(input, {
        baseUrl: process.env.DEVKU_IMAGE_BASE_URL || "https://a1.devku.ai/v1",
        apiKey,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Generated with ${image.model}. Saved to ${image.path}`,
          },
          {
            type: "image" as const,
            data: image.base64,
            mimeType: image.mimeType,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image generation error";
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
