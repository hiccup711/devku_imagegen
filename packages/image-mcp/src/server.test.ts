import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { windowsCredentialPath } from "./credentials.js";
import { buildImageEndpoint, detectImageType, safeOutputName } from "./image-client.js";

test("buildImageEndpoint appends the standard generation path", () => {
  assert.equal(
    buildImageEndpoint("https://a1.devku.ai/v1/"),
    "https://a1.devku.ai/v1/images/generations",
  );
});

test("buildImageEndpoint preserves a complete endpoint", () => {
  assert.equal(
    buildImageEndpoint("https://a1.devku.ai/v1/images/generations"),
    "https://a1.devku.ai/v1/images/generations",
  );
});

test("buildImageEndpoint derives the edit endpoint from any base or complete endpoint", () => {
  for (const base of [
    "https://a1.devku.ai/v1",
    "https://a1.devku.ai/v1/images/generations",
    "https://a1.devku.ai/v1/images/edits/",
  ]) {
    assert.equal(buildImageEndpoint(base, "edits"), "https://a1.devku.ai/v1/images/edits");
  }
  assert.equal(
    buildImageEndpoint("https://a1.devku.ai/v1/images/edits"),
    "https://a1.devku.ai/v1/images/generations",
  );
});

test("detectImageType accepts only PNG, JPEG and WebP signatures", () => {
  assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType, "image/png");
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.extension, "jpg");
  assert.equal(detectImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.mimeType, "image/webp");
  assert.equal(detectImageType(Buffer.from("<html>not an image</html>")), undefined);
  assert.equal(detectImageType(new Uint8Array()), undefined);
});

test("safeOutputName removes directories and normalizes the extension", () => {
  assert.equal(safeOutputName("../../ui concept.webp"), "ui-concept.png");
});

test("windowsCredentialPath uses the per-user local application data directory", () => {
  assert.equal(
    windowsCredentialPath("C:\\Users\\friend\\AppData\\Local", "C:\\Users\\friend"),
    join("C:\\Users\\friend\\AppData\\Local", "Devku", "ImageGen", "credential.dat"),
  );
});
