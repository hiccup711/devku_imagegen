---
name: devku-imagegen
description: Generate real raster images through the configured Devku-compatible image service. Use for UI concepts, website or game assets, illustrations, product imagery, backgrounds, and other bitmap generation requests. Do not use for image editing, deterministic SVG icons, or code-native diagrams.
---

# Devku Image Gen

Use the `devku_image` MCP tools for real image generation. Prefer `gpt-image-2`; use `gpt-image-1.5` only when the user requests it or compatibility requires it.

## Generate

- Call `mcp__devku_image__generate_image` with the user's visual requirements.
- Preserve exact requested text and constraints. Do not add unrequested branding or subjects.
- Use the returned preview to inspect composition, text accuracy, and obvious artifacts.
- For project assets, copy the returned file into the workspace before referencing it from code.
- Report the selected model, final prompt, and saved path.

Never replace requested image generation with SVG, canvas, CSS, a local drawing script, or the system `$imagegen` fallback. If the MCP tool is unavailable, report that the `devku_image` MCP server is not active.
