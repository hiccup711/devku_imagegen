import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";

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

export interface EditImageInput {
  prompt: string;
  images: string[];
  mask?: string;
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
export const MAX_EDIT_IMAGES = 16;
export const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
// Leaves room under common 32 MiB gateway body limits for multipart framing and text fields.
export const MAX_EDIT_UPLOAD_BYTES = 28 * 1024 * 1024;

type ImageOperation = "generations" | "edits";

export function buildImageEndpoint(baseUrl: string, operation: ImageOperation = "generations"): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("DEVKU_IMAGE_BASE_URL is empty.");
  // A base URL may already name a complete image endpoint; swap it for the requested operation.
  const root = normalized.replace(/\/images\/(generations|edits)$/, "");
  return `${root}/images/${operation}`;
}

export function detectImageType(bytes: Uint8Array): { mimeType: string; extension: string } | undefined {
  const startsWith = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: "image/png", extension: "png" };
  if (startsWith([0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return undefined;
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

  return saveImageResponse(response, "Image generation", input.model, input.outputName, options.outputDirectory);
}

async function saveImageResponse(
  response: Response,
  operation: string,
  model: ImageModel,
  outputName: string | undefined,
  outputDirectoryOption: string | undefined,
): Promise<GeneratedImage> {
  if (!response.ok) {
    throw new Error(`${operation} failed (${response.status}): ${await readResponseBody(response)}`);
  }

  const payload = (await response.json()) as { data?: ImageApiItem[] };
  const item = payload.data?.[0];
  if (!item) throw new Error(`${operation} response did not contain data[0].`);

  const image = item.b64_json
    ? { base64: item.b64_json, mimeType: "image/png" }
    : item.url
      ? await downloadImage(item.url)
      : null;
  if (!image) throw new Error(`${operation} response contained neither b64_json nor url.`);

  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`${operation} returned invalid size: ${bytes.length} bytes`);
  }

  const outputDirectory =
    outputDirectoryOption ?? join(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images");
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const path = join(outputDirectory, safeOutputName(outputName));
  await writeFile(path, bytes, { mode: 0o600 });

  return { path, base64: image.base64, mimeType: image.mimeType, model };
}

interface InputFile {
  label: string;
  path: string;
  size: number;
  mask: boolean;
}

// Messages name the input slot, never the local path.
async function locateInput(path: string, label: string, mask: boolean): Promise<InputFile> {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute local file path.`);
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${label} was not found or is not a file.`);
  if (info.size > MAX_INPUT_IMAGE_BYTES) throw new Error(`${label} is larger than 20 MB.`);
  return { label, path, size: info.size, mask };
}

/**
 * Reads a located file and accepts only real PNG, JPEG or WebP bytes (PNG for the mask),
 * so a prompt-injected path can never upload a non-image file.
 */
async function readInput(file: InputFile): Promise<{ bytes: Uint8Array<ArrayBuffer>; mimeType: string; extension: string }> {
  const bytes = new Uint8Array(await readFile(file.path));
  if (bytes.length > MAX_INPUT_IMAGE_BYTES) throw new Error(`${file.label} is larger than 20 MB.`);
  const type = detectImageType(bytes);
  if (file.mask && type?.mimeType !== "image/png") throw new Error("The mask must be a PNG image.");
  if (!type) throw new Error(`${file.label} is not a PNG, JPEG or WebP image.`);
  return { bytes, ...type };
}

export async function editImage(
  input: EditImageInput,
  options: { baseUrl: string; apiKey: string; outputDirectory?: string },
): Promise<GeneratedImage> {
  if (!options.apiKey) throw new Error("DEVKU_IMAGE_API_KEY is not configured.");
  if (input.images.length === 0 || input.images.length > MAX_EDIT_IMAGES) {
    throw new Error(`Provide between 1 and ${MAX_EDIT_IMAGES} input images.`);
  }

  // Every local check runs before the request, so bad inputs never spend quota.
  const files: InputFile[] = [];
  for (const [index, path] of input.images.entries()) files.push(await locateInput(path, `Image ${index + 1}`, false));
  if (input.mask) files.push(await locateInput(input.mask, "The mask", true));
  const tooLarge = "Input images are larger than 28 MB in total; compress them or use fewer images.";
  if (files.reduce((total, file) => total + file.size, 0) > MAX_EDIT_UPLOAD_BYTES) throw new Error(tooLarge);

  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("size", input.size);
  form.append("quality", input.quality);
  form.append("n", "1");
  let total = 0;
  for (const [index, file] of files.entries()) {
    const { bytes, mimeType, extension } = await readInput(file);
    // A file can grow between the size check and the read.
    total += bytes.length;
    if (total > MAX_EDIT_UPLOAD_BYTES) throw new Error(tooLarge);
    // Uploaded names never reveal local paths.
    const blob = new Blob([bytes], { type: mimeType });
    if (file.mask) form.append("mask", blob, "mask.png");
    else form.append("image[]", blob, `image-${index + 1}.${extension}`);
  }

  const response = await fetch(buildImageEndpoint(options.baseUrl, "edits"), {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  return saveImageResponse(response, "Image edit", input.model, input.outputName, options.outputDirectory);
}
