import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
export type ImageQuality = "low" | "medium" | "high" | "auto";

export interface GenerateImageInput {
  prompt: string;
  model: ImageModel;
  size: string;
  quality: ImageQuality;
  outputName?: string;
}

export interface GeneratedImage {
  path: string;
  base64: string;
  mimeType: string;
  model: ImageModel;
}

interface ImageApiItem {
  b64_json?: string;
  url?: string;
}

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

export function buildImageEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("DEVKU_IMAGE_BASE_URL is empty.");
  return normalized.endsWith("/images/generations")
    ? normalized
    : `${normalized}/images/generations`;
}

export function safeOutputName(outputName?: string): string {
  if (!outputName) return `devku-image-${Date.now()}-${randomUUID().slice(0, 8)}.png`;

  const name = basename(outputName).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const extension = extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  const safeStem = stem.replace(/^\.+/, "").slice(0, 80) || "devku-image";
  return `${safeStem}.png`;
}

async function readResponseBody(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

async function downloadImage(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}): ${await readResponseBody(response)}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Image download returned unsupported content type: ${mimeType}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image download returned invalid size: ${bytes.length} bytes`);
  }

  return { base64: bytes.toString("base64"), mimeType };
}

export async function generateImage(
  input: GenerateImageInput,
  options: { baseUrl: string; apiKey: string; outputDirectory?: string },
): Promise<GeneratedImage> {
  if (!options.apiKey) throw new Error("DEVKU_IMAGE_API_KEY is not configured.");

  const response = await fetch(buildImageEndpoint(options.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
      n: 1,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    throw new Error(`Image generation failed (${response.status}): ${await readResponseBody(response)}`);
  }

  const payload = (await response.json()) as { data?: ImageApiItem[] };
  const item = payload.data?.[0];
  if (!item) throw new Error("Image generation response did not contain data[0].");

  const image = item.b64_json
    ? { base64: item.b64_json, mimeType: "image/png" }
    : item.url
      ? await downloadImage(item.url)
      : null;
  if (!image) throw new Error("Image generation response contained neither b64_json nor url.");

  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image generation returned invalid size: ${bytes.length} bytes`);
  }

  const outputDirectory =
    options.outputDirectory ?? join(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images");
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const path = join(outputDirectory, safeOutputName(input.outputName));
  await writeFile(path, bytes, { mode: 0o600 });

  return { path, base64: image.base64, mimeType: image.mimeType, model: input.model };
}
