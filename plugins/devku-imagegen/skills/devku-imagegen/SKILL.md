---
name: devku-imagegen
description: Generate and edit real raster images through the configured Devku-compatible image service. Use for UI concepts, website or game assets, illustrations, product imagery, backgrounds, other bitmap generation requests, and image-to-image edits such as restyling, background changes or reference-based generation. Do not use for deterministic SVG icons or code-native diagrams.
---

# Devku Image Gen

Use the `devku_image` MCP tools for real image generation and editing. Prefer `gpt-image-2`; use `gpt-image-1.5` only when the user requests it or compatibility requires it.

## Generate

- Call `mcp__devku_image__generate_image` with the user's visual requirements.
- Preserve exact requested text and constraints. Do not add unrequested branding or subjects.
- Use the returned preview to inspect composition, text accuracy, and obvious artifacts.
- For project assets, copy the returned file into the workspace before referencing it from code.
- Report the selected model, final prompt, and saved path.

## Edit

- Call `mcp__devku_image__edit_image` when the user wants to modify an existing image, change its background or style, combine images, or generate from reference images.
- Pass absolute local file paths in `images` (PNG, JPEG or WebP; up to 16). Paths returned by earlier `generate_image` or `edit_image` calls work directly, so iterative edits can chain.
- If the user only attached an image in the conversation without a local path, ask for the file path. Do not guess paths.
- Omit `size` unless the user asks for one (default `1024x1024`); for landscape, portrait or to keep the original aspect ratio, pass `1536x1024` or `1024x1536`.
- Use `mask` only with a PNG that has an alpha channel and matches the first image's size; transparent areas are edited.

Never replace requested image generation with SVG, canvas, CSS, a local drawing script, or the system `$imagegen` fallback. If the MCP tool is unavailable, report that the `devku_image` MCP server is not active.
