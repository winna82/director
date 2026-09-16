import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { emptyProject, type Project } from "./types";

const MAX_BYTES = 28 * 1024 * 1024;

type SceneRow = {
  id: string;
  reel_id: string;
  scene_index: number;
  parent_id: string | null;
  brief: string;
  mode: string;
  aspect_ratio: string;
  duration: number;
  board_json: string | null;
  continuity_json: string | null;
  sequence_json: string | null;
  shot_jobs_json: string | null;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToProject(row: SceneRow): Project {
  return emptyProject({
    id: row.id,
    reelId: row.reel_id,
    sceneIndex: Number(row.scene_index) || 1,
    parentId: row.parent_id,
    brief: row.brief ?? "",
    mode: (row.mode as Project["mode"]) || "automatic",
    aspectRatio: (row.aspect_ratio as Project["aspectRatio"]) || "16:9",
    duration: (Number(row.duration) as Project["duration"]) || 10,
    board: parseJson(row.board_json, null),
    continuity: parseJson(row.continuity_json, null),
    sequence: parseJson(row.sequence_json, null),
    shotJobs: parseJson(row.shot_jobs_json, {}),
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  });
}

export const listScenes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true; projects: Project[] } | { ok: false; error: string }> => {
    const sql = await getSql();
    const rows = await sql<SceneRow>`
      select id, reel_id, scene_index, parent_id, brief, mode, aspect_ratio, duration,
             board_json, continuity_json, sequence_json, shot_jobs_json, created_at, updated_at
      from director_scenes
      where user_id = ${context.userId}
      order by updated_at desc
      limit 24
    `;
    return { ok: true, projects: rows.map(rowToProject) };
  });

export const saveScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Project) => input)
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const project = data;
    if (!project.id || project.id === "draft") return { ok: false, error: "Nothing to save." };
    const sql = await getSql();
    const now = new Date().toISOString();
    await sql`
      insert into director_scenes (
        id, user_id, reel_id, scene_index, parent_id, brief, mode, aspect_ratio, duration,
        board_json, continuity_json, sequence_json, shot_jobs_json, created_at, updated_at
      ) values (
        ${project.id}, ${context.userId}, ${project.reelId || project.id}, ${project.sceneIndex || 1},
        ${project.parentId}, ${project.brief}, ${project.mode}, ${project.aspectRatio}, ${project.duration},
        ${JSON.stringify(project.board)}, ${JSON.stringify(project.continuity)},
        ${JSON.stringify(project.sequence)}, ${JSON.stringify(project.shotJobs)},
        ${now}, ${now}
      )
      on conflict (id) do update set
        reel_id = excluded.reel_id,
        scene_index = excluded.scene_index,
        parent_id = excluded.parent_id,
        brief = excluded.brief,
        mode = excluded.mode,
        aspect_ratio = excluded.aspect_ratio,
        duration = excluded.duration,
        board_json = excluded.board_json,
        continuity_json = excluded.continuity_json,
        sequence_json = excluded.sequence_json,
        shot_jobs_json = excluded.shot_jobs_json,
        updated_at = excluded.updated_at
      where director_scenes.user_id = ${context.userId}
    `;
    return { ok: true };
  });

type ArchiveInput = {
  sceneId: string;
  requestId: string;
  videoUrl: string;
  kind: "sequence" | "shot";
  shotId: string | null;
};

export const archiveTake = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ArchiveInput) => input)
  .handler(
    async ({
      context,
      data,
    }): Promise<{ ok: true; takeId: string; playUrl: string } | { ok: false; error: string }> => {
      const videoUrl = data.videoUrl.trim();
      if (!videoUrl.startsWith("https://")) return { ok: false, error: "Invalid take URL." };
      const sceneId = data.sceneId.trim();
      if (!sceneId) return { ok: false, error: "Missing scene." };

      const sql = await getSql();
      const owned = await sql<{ id: string }>`
        select id from director_scenes where id = ${sceneId} and user_id = ${context.userId} limit 1
      `;
      if (!owned[0]) return { ok: false, error: "Scene is not on your reel." };

      const existing = await sql<{ id: string; access_key: string }>`
        select id, access_key from director_takes
        where user_id = ${context.userId} and request_id = ${data.requestId}
        limit 1
      `;
      if (existing[0]) {
        return {
          ok: true,
          takeId: existing[0].id,
          playUrl: `/api/media/${existing[0].id}?k=${existing[0].access_key}`,
        };
      }

      const res = await fetch(videoUrl);
      if (!res.ok) return { ok: false, error: "Could not pull the take from Imagine." };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return { ok: false, error: "Take is too large to archive." };

      const takeId = crypto.randomUUID();
      const accessKey = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      const objectKey = `${context.userId}/${sceneId}/${takeId}.mp4`;
      const { putMedia } = await import("./bucket");
      let storage: string = "db";
      try {
        storage = await putMedia(objectKey, buf, "video/mp4");
      } catch {
        storage = "db";
      }
      if (storage === "db") {
        await sql`
          insert into director_take_blobs (take_id, user_id, body)
          values (${takeId}, ${context.userId}, ${buf})
        `;
      }
      await sql`
        insert into director_takes (
          id, user_id, scene_id, kind, shot_id, request_id, access_key, storage, object_key, content_type, byte_size
        ) values (
          ${takeId}, ${context.userId}, ${sceneId}, ${data.kind}, ${data.shotId},
          ${data.requestId}, ${accessKey}, ${storage}, ${storage === "db" ? null : objectKey},
          ${"video/mp4"}, ${buf.length}
        )
      `;
      return { ok: true, takeId, playUrl: `/api/media/${takeId}?k=${accessKey}` };
    },
  );

export const storageStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { bucketReady } = await import("./bucket");
    return { bucket: bucketReady() };
  });
