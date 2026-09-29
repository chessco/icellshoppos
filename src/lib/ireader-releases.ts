/**
 * Reads iReader (desktop) release artifacts from disk for the download page
 * and the /downloads route handler. Deliberately NOT stored under the
 * Next.js `public/` folder or the git repo: releases are published directly
 * to a server-side directory (outside git) via `desktop/scripts/publish-hetzner.mjs`,
 * so shipping a new iReader version never requires rebuilding or redeploying
 * this web app.
 *
 * latest.yml is parsed with a small targeted parser rather than a general
 * YAML library — electron-builder's output for this file has a fixed,
 * simple shape (confirmed in docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md).
 */

import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const DEFAULT_RELEASES_DIR = "/data/ireader-releases";

export function getReleasesDir(): string {
  return process.env.IREADER_RELEASES_DIR || DEFAULT_RELEASES_DIR;
}

export type ReleaseFile = {
  url: string;
  sha512: string;
  size: number;
};

export type LatestRelease = {
  version: string;
  path: string;
  sha512: string;
  releaseDate: string;
  files: ReleaseFile[];
};

function unquote(value: string): string {
  return value.trim().replace(/^['"](.*)['"]$/, "$1");
}

function parseLatestYml(raw: string): LatestRelease {
  const scalar = (key: string): string => {
    const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? unquote(match[1]) : "";
  };

  const files: ReleaseFile[] = [];
  const filesBlock = raw.match(/^files:\n((?:^ {2}.*\n?)+)/m);
  if (filesBlock) {
    const entries = filesBlock[1].split(/^ {2}- /m).filter((entry) => entry.trim().length > 0);
    for (const entry of entries) {
      const url = entry.match(/url:\s*(.+)/)?.[1];
      const sha512 = entry.match(/sha512:\s*(.+)/)?.[1];
      const size = entry.match(/size:\s*(\d+)/)?.[1];
      if (url) {
        files.push({ url: unquote(url), sha512: sha512 ? unquote(sha512) : "", size: size ? Number(size) : 0 });
      }
    }
  }

  return {
    version: scalar("version"),
    path: scalar("path"),
    sha512: scalar("sha512"),
    releaseDate: scalar("releaseDate"),
    files,
  };
}

export async function readLatestRelease(): Promise<LatestRelease | null> {
  try {
    const raw = await readFile(join(getReleasesDir(), "latest.yml"), "utf8");
    const parsed = parseLatestYml(raw);
    return parsed.version ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a requested download path against the releases directory,
 * rejecting anything that would escape it (directory traversal).
 * Returns null if the resolved path is not inside the releases directory.
 */
export function resolveReleaseFilePath(requestedPath: string): string | null {
  const releasesDir = resolve(getReleasesDir());
  const target = resolve(releasesDir, requestedPath);
  if (target !== releasesDir && !target.startsWith(releasesDir + sep)) {
    return null;
  }
  return target;
}
