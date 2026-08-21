import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { windowsCredentialPath } from "./credentials.js";
import { buildImageEndpoint, safeOutputName } from "./image-client.js";

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

test("safeOutputName removes directories and normalizes the extension", () => {
  assert.equal(safeOutputName("../../ui concept.webp"), "ui-concept.png");
});

test("windowsCredentialPath uses the per-user local application data directory", () => {
  assert.equal(
    windowsCredentialPath("C:\\Users\\friend\\AppData\\Local", "C:\\Users\\friend"),
    join("C:\\Users\\friend\\AppData\\Local", "Devku", "ImageGen", "credential.dat"),
  );
});
