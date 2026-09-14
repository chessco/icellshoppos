import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const distDir = resolve(projectRoot, "dist");
const winUnpackedDir = resolve(distDir, "win-unpacked");
const outputZip = resolve(distDir, "win-unpacked-latest.zip");

function runStep(command, args, stepName) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${stepName} failed with exit code ${result.status ?? 1}`);
  }
}

function runStepAllowFailure(command, args, stepName) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    return false;
  }

  return true;
}

console.log("[release:win-zip] Building app bundles...");
runStep("npx", ["electron-vite", "build"], "electron-vite build");

console.log("[release:win-zip] Packaging win-unpacked artifact...");
const packaged = runStepAllowFailure(
  "npx",
  ["electron-builder", "--win", "dir", "--publish", "never"],
  "electron-builder --win dir"
);

if (!packaged) {
  if (!existsSync(winUnpackedDir)) {
    throw new Error("Packaging failed and no dist/win-unpacked output was found.");
  }

  console.warn(
    "[release:win-zip] Packaging reported an error, but dist/win-unpacked exists. Continuing to zip output."
  );
}

if (existsSync(outputZip)) {
  rmSync(outputZip, { force: true });
}

console.log("[release:win-zip] Creating dist/win-unpacked-latest.zip...");
runStep(
  "tar",
  ["-a", "-c", "-f", outputZip, "-C", distDir, "win-unpacked"],
  "tar zip creation"
);

console.log(`[release:win-zip] Done: ${outputZip}`);
