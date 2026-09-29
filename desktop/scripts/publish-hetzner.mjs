import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const distDir = resolve(projectRoot, "dist");

// Same secret names as .github/workflows/deploy-hetzner.yml, so this script
// can be run with the same credentials a human or CI already uses to deploy
// the web app — no new credential scheme, no keys committed anywhere here.
const host = process.env.HETZNER_HOST;
const user = process.env.HETZNER_USER;
const port = process.env.HETZNER_PORT || "22";
const sshKeyPath = process.env.HETZNER_SSH_KEY_PATH; // path to a local key file, never the key contents
// Host-side bind mount path (docker-compose.prod.yml maps this to
// /data/ireader-releases inside the icellshop-probuyer container).
const remoteDir = process.env.IREADER_RELEASES_REMOTE_DIR || "/srv/ireader/releases";

if (!host || !user) {
  throw new Error(
    "Set HETZNER_HOST and HETZNER_USER before running publish:hetzner (same values used for the web app's Hetzner deploy). Optionally set HETZNER_SSH_KEY_PATH and IREADER_RELEASES_REMOTE_DIR."
  );
}

function collectNewestFile(matcher) {
  const matches = readdirSync(distDir)
    .filter((fileName) => matcher.test(fileName))
    .map((fileName) => {
      const filePath = resolve(distDir, fileName);
      return { fileName, filePath, mtimeMs: statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return matches[0];
}

const installer = collectNewestFile(/^iReader by Pro Buyer Setup .*\.exe$/i);
const blockmap = collectNewestFile(/^iReader by Pro Buyer Setup .*\.exe\.blockmap$/i);
const latestYml = collectNewestFile(/^latest\.yml$/i);

if (!installer || !blockmap || !latestYml) {
  throw new Error(`Missing release artifacts in ${distDir}. Run npm run dist:win first.`);
}

function scp(filePath, fileName) {
  const args = [];
  if (sshKeyPath) args.push("-i", sshKeyPath);
  args.push("-P", port, filePath, `${user}@${host}:${remoteDir}/${fileName}`);

  console.log(`[publish:hetzner] Uploading ${fileName}...`);
  const result = spawnSync("scp", args, { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`scp failed for ${fileName} with exit code ${result.status ?? 1}`);
  }
}

// Upload the installer and blockmap first, latest.yml LAST — so a client
// polling mid-publish never sees latest.yml pointing at a file that isn't
// fully uploaded yet (same ordering rationale as publish-s3.mjs / the
// integrity notes in docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md).
scp(installer.filePath, installer.fileName);
scp(blockmap.filePath, blockmap.fileName);
scp(latestYml.filePath, latestYml.fileName);

console.log("[publish:hetzner] Done.");
