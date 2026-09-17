import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Sql } from "@/lib/db";
import { deleteMedia, getMedia } from "./bucket";

const execFileAsync = promisify(execFile);

/** Where a take's bytes live — the storage columns of `director_takes`. */
export type StoredTake = {
  id: string;
  user_id: string;
  storage: string;
  object_key: string | null;
};

/** Postgres drivers return bytea as Buffer / Uint8Array (pg, PGLite) or base64 text. */
export function asBuffer(raw: unknown): Buffer | null {
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  return null;
}

/** The take's video from wherever `archiveTake` stored it, or null when gone. */
export async function readTakeBytes(sql: Sql, take: StoredTake): Promise<Buffer | null> {
  if (take.storage === "db") {
    const rows = await sql<{ body: unknown }>`
      select body from director_take_blobs
      where take_id = ${take.id} and user_id = ${take.user_id}
      limit 1
    `;
    return asBuffer(rows[0]?.body);
  }
  if (!take.object_key) return null;
  return getMedia(take.storage, take.object_key);
}

/** Remove a take's video from storage (bucket object, disk file or DB blob). */
export async function purgeTakeMedia(sql: Sql, take: StoredTake): Promise<void> {
  if (take.storage === "db") {
    await sql`delete from director_take_blobs where take_id = ${take.id} and user_id = ${take.user_id}`;
    return;
  }
  if (take.object_key) await deleteMedia(take.storage, take.object_key);
}

/**
 * One JPEG frame of a video: at `atSeconds`, or the last frame when omitted.
 * `maxWidth` scales it down (posters). Throws when ffmpeg yields no frame.
 */
export async function extractFrame(
  video: Buffer,
  opts: { atSeconds?: number | null; maxWidth?: number } = {},
): Promise<Buffer> {
  const at = opts.atSeconds;
  const seek =
    typeof at === "number" && Number.isFinite(at) && at >= 0
      ? ["-ss", Math.min(at, 60).toFixed(3)]
      : ["-sseof", "-0.4"];
  const scale = opts.maxWidth ? ["-vf", `scale=${opts.maxWidth}:-2`] : [];
  const dir = await mkdtemp(join(tmpdir(), "director-frame-"));
  try {
    const input = join(dir, "in.mp4");
    const output = join(dir, "out.jpg");
    await writeFile(input, video);
    await execFileAsync(
      "ffmpeg",
      ["-y", ...seek, "-i", input, "-frames:v", "1", ...scale, "-q:v", "5", output],
      { timeout: 20000 },
    );
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
