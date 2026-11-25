import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolveImageApiKey } from "./credentials.js";
import { editImage, generateImage, IMAGE_MODELS, MAX_EDIT_IMAGES, type GeneratedImage } from "./image-client.js";

const server = new McpServer(
  { name: "devku-image", version: "0.2.0" },
  {
    instructions:
      "Generate real raster images with generate_image, and edit or transform existing images with edit_image, through the configured Devku-compatible Image API. Use them for UI concepts, illustrations, product imagery, bitmap assets, restyling, background changes and reference-based generation. edit_image needs absolute local file paths; if the user only attached an image without a path, ask for the file path. Never replace requested image generation with SVG, CSS, canvas, or local drawing commands.",
  },
);

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const sharedSchema = {
  model: z.enum(IMAGE_MODELS).default("gpt-image-2").describe("Image model"),
  size: z.string().min(3).max(32).default("1024x1024").describe("Requested image dimensions"),
  quality: z.enum(["low", "medium", "high", "auto"]).default("auto"),
  outputName: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Optional filename only; directories are ignored"),
};

async function runImageTool(summary: string, run: (options: { baseUrl: string; apiKey: string }) => Promise<GeneratedImage>) {
  try {
    const apiKey = await resolveImageApiKey();
    const image = await run({
      baseUrl: process.env.DEVKU_IMAGE_BASE_URL || "https://a1.devku.ai/v1",
      apiKey,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `${summary} with ${image.model}. Saved to ${image.path}`,
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
}

server.registerTool(
  "generate_image",
  {
    title: "Generate image",
    description:
      "Generate a raster image with gpt-image-2 or gpt-image-1.5, save it securely, and return both a preview and the exact local path.",
    inputSchema: {
      prompt: z.string().min(1).max(32_000).describe("Detailed image generation prompt"),
      ...sharedSchema,
    },
    annotations,
  },
  async (input) => runImageTool("Generated", (options) => generateImage(input, options)),
);

server.registerTool(
  "edit_image",
  {
    title: "Edit image",
    description:
      "Edit or transform existing local images (image-to-image) with gpt-image-2 or gpt-image-1.5, save the result securely, and return both a preview and the exact local path. Use when the user wants to modify, restyle, extend, combine or use reference images. Pass absolute local file paths, including paths returned by earlier generate_image or edit_image calls.",
    inputSchema: {
      prompt: z.string().min(1).max(32_000).describe("What to change or create from the input images"),
      images: z
        .array(z.string().min(1).max(1024))
        .min(1)
        .max(MAX_EDIT_IMAGES)
        .describe("Absolute local paths of PNG, JPEG or WebP input images; the mask applies to the first image"),
      mask: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe(
          "Optional absolute path of a PNG mask with an alpha channel, the same size as the first image; transparent areas are edited",
        ),
      ...sharedSchema,
    },
    annotations,
  },
  async (input) =>
    runImageTool(`Edited ${input.images.length} image(s)`, (options) => editImage(input, options)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
