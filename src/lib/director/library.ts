import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { rowToProject, SCENE_COLUMNS, type SceneRow } from "./persist";
import type { Project, VideoJob } from "./types";

export type ReelSummary = {
  id: string;
  title: string;
  sceneCount: number;
  bytes: number;
  updatedAt: number;
  posterUrl: string | null;
};

export type TakeSummary = {
  id: string;
  kind: "sequence" | "shot";
  shotId: string | null;
  createdAt: number;
  bytes: number;
  job: VideoJob;
};

type TakeRow = {
  id: string;
  user_id: string;
  scene_id: string;
  kind: string;
  shot_id: string | null;
  request_id: string | null;
  access_key: string;
  storage: string;
  object_key: string | null;
  byte_size: number | null;
  created_at: string;
};

const TAKE_COLUMNS = `id, user_id, scene_id, kind, shot_id, request_id, access_key, storage, object_key,
  byte_size, created_at`;

function takeJob(take: TakeRow): VideoJob {
  return {
    requestId: take.request_id ?? "",
    status: "done",
    url: `/api/media/${take.id}?k=${take.access_key}`,
    error: null,
    kind: take.kind === "shot" ? "shot" : "sequence",
    shotId: take.shot_id,
    startedAt: Date.parse(take.created_at) || Date.now(),
    takeId: take.id,
  };
}

function takeSummary(take: TakeRow): TakeSummary {
  return {
    id: take.id,
    kind: take.kind === "shot" ? "shot" : "sequence",
    shotId: take.shot_id,
    createdAt: Date.parse(take.created_at) || Date.now(),
    bytes: Number(take.byte_size) || 0,
    job: takeJob(take),
  };
}

/**
 * Remove each take's video from storage, then stamp the row deleted. Takes whose
 * media could not be removed stay live so a retry picks them up.
 */
async function deleteTakes(sql: Sql, takes: TakeRow[]): Promise<{ deletedIds: string[]; failed: number }> {
  const { purgeTakeMedia } = await import("./media.server");
  const results = await Promise.allSettled(takes.map((take) => purgeTakeMedia(sql, take)));
  const deletedIds = takes.filter((_, i) => results[i]?.status === "fulfilled").map((t) => t.id);
  if (deletedIds.length) {
    await sql`
      update director_takes set deleted_at = now(), poster = null
      where id = any(${deletedIds}) and deleted_at is null
    `;
  }
  return { deletedIds, failed: takes.length - deletedIds.length };
}

function storageError(failed: number): string {
  return `Couldn't remove ${failed === 1 ? "a video" : `${failed} videos`} from storage. Try again.`;
}

/** Point the scene's picture and shot rows away from deleted takes, onto the newest remaining ones. */
async function detachTakes(sql: Sql, userId: string, sceneId: string): Promise<Project | null> {
  const rows = await sql.query<SceneRow>(
    `select ${SCENE_COLUMNS} from director_scenes where id = $1 and user_id = $2 and deleted_at is null limit 1`,
    [sceneId, userId],
  );
  if (!rows[0]) return null;
  const project = rowToProject(rows[0]);
  const live = await sql.query<TakeRow>(
    `select ${TAKE_COLUMNS} from director_takes
     where scene_id = $1 and user_id = $2 and deleted_at is null
     order by created_at desc`,
    [sceneId, userId],
  );
  const liveIds = new Set(live.map((t) => t.id));

  let changed = false;
  if (project.sequence?.takeId && !liveIds.has(project.sequence.takeId)) {
    const next = live.find((t) => t.kind === "sequence");
    project.sequence = next ? takeJob(next) : null;
    changed = true;
  }
  for (const [shotId, job] of Object.entries(project.shotJobs)) {
    if (!job.takeId || liveIds.has(job.takeId)) continue;
    const next = live.find((t) => t.kind === "shot" && t.shot_id === shotId);
    if (next) project.shotJobs[shotId] = takeJob(next);
    else delete project.shotJobs[shotId];
    changed = true;
  }
  if (changed) {
    project.updatedAt = Date.now();
    await sql`
      update director_scenes
      set sequence_json = ${JSON.stringify(project.sequence)},
          shot_jobs_json = ${JSON.stringify(project.shotJobs)},
          updated_at = now()
      where id = ${sceneId} and user_id = ${userId}
    `;
  }
  return project;
}

export const listLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; reels: ReelSummary[] }> => {
    const sql = await getSql();
    // Reels with at least one non-empty scene; blank drafts stay off the list.
    const rows = await sql<{
      id: string;
      title: string | null;
      updated_at: string;
      scene_count: number;
      bytes: number | null;
      poster: string | null;
    }>`
      select
        r.id,
        coalesce(nullif(r.title, ''), (
          select coalesce(nullif(s.board_json::json ->> 'title', ''), left(s.brief, 60))
          from director_scenes s
          where s.reel_id = r.id and s.user_id = r.user_id and s.deleted_at is null
          order by s.scene_index, s.created_at
          limit 1
        )) as title,
        r.updated_at,
        (
          select count(*)::int from director_scenes s
          where s.reel_id = r.id and s.user_id = r.user_id and s.deleted_at is null
        ) as scene_count,
        (
          select sum(t.byte_size) from director_takes t
          join director_scenes s on s.id = t.scene_id and s.user_id = t.user_id
          where s.reel_id = r.id and t.user_id = r.user_id and t.deleted_at is null and s.deleted_at is null
        ) as bytes,
        (
          select t.id || '?k=' || t.access_key from director_takes t
          join director_scenes s on s.id = t.scene_id and s.user_id = t.user_id
          where s.reel_id = r.id and t.user_id = r.user_id and t.kind = 'sequence'
            and t.deleted_at is null and s.deleted_at is null
          order by s.scene_index, t.created_at desc
          limit 1
        ) as poster
      from director_reels r
      where r.user_id = ${context.userId} and r.deleted_at is null
        and exists (
          select 1 from director_scenes s
          where s.reel_id = r.id and s.user_id = r.user_id and s.deleted_at is null
            and (s.brief <> '' or coalesce(s.board_json, 'null') <> 'null')
        )
      order by r.updated_at desc
      limit 100
    `;
    return {
      ok: true,
      reels: rows.map((row) => ({
        id: row.id,
        title: row.title?.trim() || "Untitled reel",
        sceneCount: Number(row.scene_count) || 0,
        bytes: Number(row.bytes) || 0,
        updatedAt: Date.parse(row.updated_at) || Date.now(),
        posterUrl: row.poster ? `/api/poster/${row.poster}` : null,
      })),
    };
  });

export const listReelScenes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reelId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; projects: Project[] }> => {
    const sql = await getSql();
    const rows = await sql.query<SceneRow>(
      `select ${SCENE_COLUMNS} from director_scenes
       where user_id = $1 and reel_id = $2 and deleted_at is null
       order by scene_index, created_at`,
      [context.userId, data.reelId],
    );
    return { ok: true, projects: rows.map(rowToProject) };
  });

export const renameReel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reelId: string; title: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const title = data.title.trim().slice(0, 120);
    if (!title) return { ok: false, error: "Give the reel a name." };
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update director_reels set title = ${title}, updated_at = now()
      where id = ${data.reelId} and user_id = ${context.userId} and deleted_at is null
      returning id
    `;
    return rows[0] ? { ok: true } : { ok: false, error: "Reel not found." };
  });

export const listTakes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sceneId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; takes: TakeSummary[] }> => {
    const sql = await getSql();
    const rows = await sql.query<TakeRow>(
      `select ${TAKE_COLUMNS} from director_takes
       where user_id = $1 and scene_id = $2 and deleted_at is null
       order by created_at desc`,
      [context.userId, data.sceneId],
    );
    return { ok: true, takes: rows.map(takeSummary) };
  });

export const deleteTake = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { takeId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; scene: Project | null } | { ok: false; error: string }> => {
    const sql = await getSql();
    const rows = await sql.query<TakeRow>(
      `select ${TAKE_COLUMNS} from director_takes where id = $1 and user_id = $2 and deleted_at is null limit 1`,
      [data.takeId, context.userId],
    );
    const take = rows[0];
    if (!take) return { ok: false, error: "Take not found." };
    const { failed } = await deleteTakes(sql, [take]);
    if (failed) return { ok: false, error: storageError(failed) };
    return { ok: true, scene: await detachTakes(sql, context.userId, take.scene_id) };
  });

export const deleteScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { sceneId: string }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; takeIds: string[] } | { ok: false; error: string }> => {
    const sql = await getSql();
    const scenes = await sql<{ id: string; reel_id: string }>`
      select id, reel_id from director_scenes
      where id = ${data.sceneId} and user_id = ${context.userId} and deleted_at is null
      limit 1
    `;
    const scene = scenes[0];
    if (!scene) return { ok: false, error: "Scene not found." };
    const takes = await sql.query<TakeRow>(
      `select ${TAKE_COLUMNS} from director_takes where scene_id = $1 and user_id = $2 and deleted_at is null`,
      [scene.id, context.userId],
    );
    const { deletedIds, failed } = await deleteTakes(sql, takes);
    if (failed) return { ok: false, error: storageError(failed) };
    await sql`update director_scenes set deleted_at = now() where id = ${scene.id} and user_id = ${context.userId}`;
    await sql`update director_reels set updated_at = now() where id = ${scene.reel_id} and user_id = ${context.userId}`;
    return { ok: true, takeIds: deletedIds };
  });

export const deleteReel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reelId: string }) => input)
  .handler(
    async ({ context, data }): Promise<{ ok: true; sceneIds: string[]; takeIds: string[] } | { ok: false; error: string }> => {
      const sql = await getSql();
      const scenes = await sql<{ id: string }>`
        select id from director_scenes
        where reel_id = ${data.reelId} and user_id = ${context.userId} and deleted_at is null
      `;
      const sceneIds = scenes.map((s) => s.id);
      const takes = sceneIds.length
        ? await sql.query<TakeRow>(
            `select ${TAKE_COLUMNS} from director_takes
             where scene_id = any($1) and user_id = $2 and deleted_at is null`,
            [sceneIds, context.userId],
          )
        : [];
      const { deletedIds, failed } = await deleteTakes(sql, takes);
      if (failed) return { ok: false, error: storageError(failed) };
      if (sceneIds.length) {
        await sql`
          update director_scenes set deleted_at = now()
          where id = any(${sceneIds}) and user_id = ${context.userId}
        `;
      }
      // Stamp the reel even if its row never existed, so a stale tab can't recreate it.
      await sql`
        insert into director_reels (id, user_id, deleted_at) values (${data.reelId}, ${context.userId}, now())
        on conflict (id) do update set deleted_at = now()
        where director_reels.user_id = ${context.userId}
      `;
      return { ok: true, sceneIds, takeIds: deletedIds };
    },
  );
