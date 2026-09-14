import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const distDir = resolve(projectRoot, "dist");
const zipPath = resolve(distDir, "win-unpacked-latest.zip");

const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET;
const prefix = (process.env.AWS_S3_PREFIX || process.env.S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;

if (!bucket) {
  throw new Error("Set AWS_S3_BUCKET or S3_BUCKET before running publish:s3.");
}

if (!existsSync(zipPath)) {
  throw new Error(`Missing release artifact: ${zipPath}. Run npm run release:win-zip first.`);
}

function buildKey(fileName) {
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function runAws(args, stepName) {
  const result = spawnSync("aws", args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${stepName} failed with exit code ${result.status ?? 1}`);
  }
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

const uploads = [];

if (existsSync(zipPath)) {
  uploads.push({ filePath: zipPath, key: "win-unpacked-latest.zip", cacheControl: "public,max-age=300" });
}

const installer = collectNewestFile(/^iReader by Pro Buyer Setup .*\.exe$/i);
if (installer) {
  uploads.push({
    filePath: installer.filePath,
    key: installer.fileName,
    cacheControl: "public,max-age=300",
  });
}

const blockMap = collectNewestFile(/^iReader by Pro Buyer Setup .*\.exe\.blockmap$/i);
if (blockMap) {
  uploads.push({
    filePath: blockMap.filePath,
    key: blockMap.fileName,
    cacheControl: "public,max-age=300",
  });
}

const latestYml = collectNewestFile(/^latest\.yml$/i);
if (latestYml) {
  uploads.push({
    filePath: latestYml.filePath,
    key: latestYml.fileName,
    cacheControl: "no-cache",
  });
}

if (uploads.length === 0) {
  throw new Error(`No release artifacts found in ${distDir}. Run npm run dist:win first.`);
}

for (const upload of uploads) {
  const args = [];
  if (region) {
    args.push("--region", region);
  }
  args.push("s3", "cp", upload.filePath, `s3://${bucket}/${buildKey(upload.key)}`, "--acl", "private", "--cache-control", upload.cacheControl);
  console.log(`[publish:s3] Uploading ${upload.filePath} to s3://${bucket}/${buildKey(upload.key)}`);
  runAws(args, `aws s3 cp ${upload.key}`);
}

console.log("[publish:s3] Done.");
