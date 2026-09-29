/**
 * Public, unauthenticated static file server for iReader release artifacts
 * (latest.yml, the NSIS installer, and its .blockmap), read from a
 * server-side directory outside the git repo (see src/lib/ireader-releases.ts).
 *
 * electron-updater's differential-update path depends on HTTP Range
 * requests working (see docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md §9/§11),
 * so this implements Range support rather than only whole-file responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { resolveReleaseFilePath } from "@/lib/ireader-releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".yml")) return "text/yaml; charset=utf-8";
  return "application/octet-stream";
}

function cacheControlFor(filename: string): string {
  // latest.yml must always be revalidated; versioned artifact filenames
  // never change in place, so they're safe to cache aggressively.
  return filename.endsWith(".yml") ? "no-cache" : "public, max-age=31536000, immutable";
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;

  if (!segments.length || segments.some((segment) => segment === "..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = resolveReleaseFilePath(segments.join("/"));
  if (!filePath || !existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const filename = segments[segments.length - 1];
  const contentType = contentTypeFor(filename);
  const cacheControl = cacheControlFor(filename);
  const range = request.headers.get("range");

  if (range) {
    const match = range.match(/^bytes=(\d+)-(\d*)$/);
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${stat.size}` },
        });
      }

      const stream = createReadStream(filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
