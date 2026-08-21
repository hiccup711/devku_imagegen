import { execFile as execFileCallback } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
export const KEYCHAIN_SERVICE = "devku-image-mcp";
const WINDOWS_CREDENTIAL_DIRECTORY = ["Devku", "ImageGen"];
const WINDOWS_CREDENTIAL_FILENAME = "credential.dat";

export function windowsCredentialPath(
  localAppData = process.env.LOCALAPPDATA,
  userHome = homedir(),
): string {
  return (
    process.env.DEVKU_IMAGE_CREDENTIAL_FILE ||
    join(
      localAppData || join(userHome, "AppData", "Local"),
      ...WINDOWS_CREDENTIAL_DIRECTORY,
      WINDOWS_CREDENTIAL_FILENAME,
    )
  );
}

async function readMacOsKeychain(): Promise<string | undefined> {
  try {
    const { stdout } = await execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8", maxBuffer: 64 * 1024 },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function readWindowsDpapiCredential(): Promise<string | undefined> {
  const script = [
    "$path = [Environment]::GetEnvironmentVariable('DEVKU_IMAGE_CREDENTIAL_FILE_INTERNAL')",
    "$bytes = [IO.File]::ReadAllBytes($path)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))",
  ].join("; ");

  try {
    const { stdout } = await execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DEVKU_IMAGE_CREDENTIAL_FILE_INTERNAL: windowsCredentialPath(),
        },
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function resolveImageApiKey(): Promise<string> {
  const environmentKey = process.env.DEVKU_IMAGE_API_KEY?.trim();
  if (environmentKey) return environmentKey;

  if (process.platform === "darwin" && process.env.DEVKU_IMAGE_DISABLE_KEYCHAIN !== "1") {
    const keychainKey = await readMacOsKeychain();
    if (keychainKey) return keychainKey;
  }

  if (process.platform === "win32" && process.env.DEVKU_IMAGE_DISABLE_DPAPI !== "1") {
    const dpapiKey = await readWindowsDpapiCredential();
    if (dpapiKey) return dpapiKey;
  }

  throw new Error(
    "No image API credential is available. Run the setup script for your operating system or set DEVKU_IMAGE_API_KEY.",
  );
}
