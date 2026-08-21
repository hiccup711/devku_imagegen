#!/bin/sh
set -eu

SERVICE="devku-image-mcp"
MARKETPLACE="devku-imagegen"
REPOSITORY="hiccup711/devku_imagegen"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This setup script only supports macOS." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required. Found: $(node --version)" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI is required." >&2
  exit 1
fi

printf "Devku Image API Key: "
stty -echo
IFS= read -r API_KEY
stty echo
printf "\n"

trap 'stty echo 2>/dev/null || true; unset API_KEY' EXIT HUP INT TERM

if [ -z "$API_KEY" ]; then
  echo "API Key cannot be empty." >&2
  exit 1
fi

/usr/bin/security add-generic-password -U -a "${USER:-devku-imagegen}" -s "$SERVICE" -w "$API_KEY" >/dev/null
unset API_KEY

echo "Credential saved to macOS Keychain service: $SERVICE"

if codex plugin marketplace list | awk 'NR > 1 { print $1 }' | grep -qx "$MARKETPLACE"; then
  codex plugin marketplace upgrade "$MARKETPLACE"
else
  codex plugin marketplace add "$REPOSITORY"
fi

codex plugin add "devku-imagegen@$MARKETPLACE"

echo "Devku Image Gen plugin installed."
echo "Restart Codex and start a new task before testing image generation."
