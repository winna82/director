import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { composeSequencePrompt, composeShotPrompt, lockWorld, panelNames, shotLimit } from "./compose";
import { DIRECTOR_SYSTEM } from "./prompt";
import type {
  AspectRatio,
  ClipDuration,
  Continuity,
  DirectorMode,
  SceneLayout,
  Shot,
  ShotSize,
  Storyboard,
  WorldBible,
} from "./types";
import { asLayout, LAYOUT_LABELS, SHOT_SIZES } from "./types";

const XAI = "https://api.x.ai/v1";
const CHAT_MODEL = "grok-4.5";
const VIDEO_MODEL = "grok-imagine-video-1.5";
const VIDEO_FALLBACK = "grok-imagine-video";

type ContinuityPayload = Omit<Continuity, "lastFrameDataUrl" | "previousVideoUrl">;

type PlanInput = {
  brief: string;
  mode: DirectorMode;
  aspectRatio: AspectRatio;
  duration: ClipDuration;
  layout: SceneLayout;
  continuity?: ContinuityPayload | null;
};

type StartVideoInput = {
  prompt: string;
  duration: number;
  aspectRatio: AspectRatio;
  startImageDataUrl?: string | null;
};

function apiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key || null;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Director did not return a storyboard.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeShotSize(value: unknown): ShotSize | string {
  const s = asString(value, "medium").toLowerCase().replace(/\s+/g, "-");
  return (SHOT_SIZES as readonly string[]).includes(s) ? (s as ShotSize) : s;
}

function parseBoard(
  raw: unknown,
  duration: ClipDuration,
  layout: SceneLayout,
  aspectRatio: AspectRatio,
  continuity?: ContinuityPayload | null,
): Storyboard {
  if (!raw || typeof raw !== "object") {
    throw new Error("Director returned an empty board.");
  }
  const o = raw as Record<string, unknown>;
  const worldRaw = (o.world ?? {}) as Record<string, unknown>;
  const charsRaw = Array.isArray(worldRaw.characters) ? worldRaw.characters : [];

  let world: WorldBible = {
    setting: asString(worldRaw.setting, "unspecified interior"),
    lighting: asString(worldRaw.lighting, "natural motivated light"),
    palette: asString(worldRaw.palette, "neutral cinematic"),
    style: asString(worldRaw.style, "photoreal 35mm cinematic"),
    characters: charsRaw
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const row = c as Record<string, unknown>;
        const name = asString(row.name);
        if (!name) return null;
        return { name, look: asString(row.look, "consistent across shots") };
      })
      .filter((c): c is { name: string; look: string } => Boolean(c)),
  };

  if (continuity) {
    world = lockWorld(world, continuity.world);
  }

  const shotsRaw = Array.isArray(o.shots) ? o.shots : [];
  const limit = shotLimit(layout, duration);
  if (shotsRaw.length < limit.min) {
    throw new Error(
      shotsRaw.length
        ? `Director planned ${shotsRaw.length} of the ${limit.min} panels ${LAYOUT_LABELS[layout].toLowerCase()} needs. Call Director again.`
        : "Director returned no shots.",
    );
  }

  const shots: Shot[] = shotsRaw.slice(0, limit.max).map((item, i) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const dialogueRaw = s.dialogue;
    let dialogue: Shot["dialogue"] = null;
    if (dialogueRaw && typeof dialogueRaw === "object") {
      const d = dialogueRaw as Record<string, unknown>;
      const character = asString(d.character);
      const line = asString(d.line);
      if (character && line) dialogue = { character, line };
    }
    return {
      id: `s${i + 1}`,
      index: i + 1,
      duration: Math.max(1, Math.round(asNumber(s.duration, 2))),
      shotSize: normalizeShotSize(s.shotSize),
      angle: asString(s.angle, "eye-level"),
      camera: asString(s.camera, "static"),
      action: asString(s.action, "holds"),
      dialogue,
      audio: asString(s.audio, asString(o.audio, "natural ambience")),
      prompt: asString(s.prompt),
    };
  });

  const sum = shots.reduce((n, s) => n + s.duration, 0);
  if (layout !== "single") {
    // Panels play simultaneously, each for the whole clip.
    for (const shot of shots) shot.duration = duration;
  } else if (sum !== duration && sum > 0) {
    const scale = duration / sum;
    let used = 0;
    shots.forEach((shot, i) => {
      if (i === shots.length - 1) {
        shot.duration = Math.max(1, duration - used);
      } else {
        shot.duration = Math.max(1, Math.round(shot.duration * scale));
        used += shot.duration;
      }
    });
  }

  const board: Storyboard = {
    title: asString(o.title, "Untitled scene"),
    logline: asString(o.logline),
    world,
    audio: asString(o.audio, continuity?.audio ?? "natural ambience, no score"),
    shots,
    sequencePrompt: asString(o.sequencePrompt),
    layout,
  };
  const cont: Continuity | null = continuity
    ? { ...continuity, lastFrameDataUrl: null, previousVideoUrl: null }
    : null;
  board.sequencePrompt = composeSequencePrompt(board, cont, aspectRatio);
  board.shots = board.shots.map((shot) => ({
    ...shot,
    prompt: composeShotPrompt(board, shot, cont),
  }));
  return board;
}

function continuityUserBlock(c: ContinuityPayload): string {
  const faces = c.world.characters
    .map((ch) => `- ${ch.name}: ${ch.look}`)
    .join("\n");
  return [
    `CONTINUATION — next scene of the same film.`,
    `Previous scene title: ${c.fromTitle}`,
    `Previous logline: ${c.fromLogline}`,
    `It ended on: ${c.fromLastShot}`,
    `Locked style: ${c.world.style}`,
    `Locked palette: ${c.world.palette}`,
    `Locked lighting (evolve only if the brief moves): ${c.world.lighting}`,
    `Locked setting (evolve only if the brief moves): ${c.world.setting}`,
    `Locked characters (copy looks verbatim):`,
    faces || "- none",
    `Master audio so far: ${c.audio}`,
    `The user's brief is ONLY what happens next. First shot picks up from the ending beat.`,
  ].join("\n");
}

export const checkAi = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: Boolean(apiKey()) };
});

export const planStoryboard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: PlanInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; board: Storyboard } | { ok: false; error: string }> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };

    const brief = data.brief.trim();
    if (brief.length < 8) return { ok: false, error: "Give the director a bit more to work with." };
    if (brief.length > 4000) return { ok: false, error: "Brief is too long. Keep it under 4,000 characters." };

    const layout = asLayout(data.layout);
    const limit = shotLimit(layout, data.duration);
    const layoutLine =
      layout === "single"
        ? `Layout: single — one full frame at a time. Plan 1 to ${limit.max} shots; durations MUST sum to ${data.duration}.`
        : `Layout: ${layout} — ${limit.max} panels on screen together (${panelNames(layout, data.aspectRatio).join(", ")}). Plan exactly ${limit.max} shots, one per panel in that order, each ${data.duration} seconds long.`;
    const user = [
      `Mode: ${data.mode === "storyboard" ? "storyboard (honor the user's shot list)" : "automatic (plan coverage)"}`,
      `Aspect ratio: ${data.aspectRatio}`,
      `Total duration: ${data.duration} seconds.`,
      layoutLine,
      data.continuity ? continuityUserBlock(data.continuity) : "",
      "",
      "Brief:",
      brief,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch(`${XAI}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.7,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DIRECTOR_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Director is unavailable (${res.status}).` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      const board = parseBoard(extractJson(text), data.duration, layout, data.aspectRatio, data.continuity);
      return { ok: true, board };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse the storyboard.";
      return { ok: false, error: message };
    }
  });

async function imagineError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const detail = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "";
  return detail ? `Imagine returned ${res.status}: ${detail}` : `Imagine returned ${res.status}.`;
}

async function startGeneration(
  key: string,
  model: string,
  data: StartVideoInput,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string; status: number }> {
  const duration = Math.min(15, Math.max(1, Math.round(data.duration)));
  const body: Record<string, unknown> = {
    model,
    prompt: data.prompt.slice(0, 8000),
    duration,
    aspect_ratio: data.aspectRatio,
    resolution: "720p",
    generate_audio: true,
  };
  if (data.startImageDataUrl) {
    // The API takes the start frame as `{ url }` — a public URL or a base64 data URL.
    body.image = { url: data.startImageDataUrl };
  }

  const res = await fetch(`${XAI}/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, error: await imagineError(res), status: res.status };
  }

  const payload = (await res.json()) as { request_id?: string; id?: string };
  const requestId = payload.request_id ?? payload.id;
  if (!requestId) return { ok: false, error: "Imagine did not start the job.", status: res.status };
  return { ok: true, requestId };
}

export const startVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: StartVideoInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    if (!data.prompt.trim()) return { ok: false, error: "Nothing to roll — the prompt is empty." };

    // Never retry without the start frame: a rejected frame must surface, not
    // silently roll a take that ignores continuity.
    const first = await startGeneration(key, VIDEO_MODEL, data);
    if (first.ok) return first;
    if (first.status === 404 || first.status === 400) {
      const retry = await startGeneration(key, VIDEO_FALLBACK, data);
      if (retry.ok) return retry;
    }
    return { ok: false, error: first.error };
  });

type VideoStatus = {
  status: "queued" | "processing" | "done" | "failed" | "expired";
  url: string | null;
  error: string | null;
};

function mapStatus(raw: string | undefined): VideoStatus["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "done" || s === "succeeded" || s === "completed" || s === "success") return "done";
  if (s === "failed" || s === "error") return "failed";
  if (s === "expired") return "expired";
  if (s === "queued" || s === "pending" || s === "created") return "queued";
  return "processing";
}

export const pollVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { requestId: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } & VideoStatus | { ok: false; error: string }> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "AI is not available in this environment." };
    const id = data.requestId.trim();
    if (!id) return { ok: false, error: "Missing generation id." };

    const res = await fetch(`${XAI}/videos/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      return { ok: false, error: `Could not check the roll (${res.status}).` };
    }

    const body = (await res.json()) as {
      status?: string;
      error?: string | { message?: string };
      video?: { url?: string };
      url?: string;
    };

    const status = mapStatus(body.status);
    const url = body.video?.url ?? body.url ?? null;
    const errText =
      typeof body.error === "string"
        ? body.error
        : body.error?.message ?? (status === "failed" ? "Generation failed." : null);

    return { ok: true, status, url, error: errText };
  });

/** Pull one frame from a take: at `atSeconds`, or the last frame when omitted. */
export const grabFrame = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { videoUrl: string; atSeconds?: number | null }) => input)
  .handler(async ({ context, data }): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> => {
    const url = data.videoUrl.trim();
    let buf: Buffer | null = null;
    const media = await import("./media.server");

    if (url.startsWith("/api/media/")) {
      const parsed = new URL(url, "http://director.local");
      const id = parsed.pathname.split("/").pop() ?? "";
      const access = parsed.searchParams.get("k") ?? "";
      if (id && access) {
        const { getSql } = await import("@/lib/db");
        const sql = await getSql();
        const rows = await sql<{ id: string; storage: string; object_key: string | null; user_id: string }>`
          select id, storage, object_key, user_id from director_takes
          where id = ${id} and access_key = ${access} and user_id = ${context.userId} and deleted_at is null
          limit 1
        `;
        if (rows[0]) buf = await media.readTakeBytes(sql, rows[0]);
      }
    } else if (url.startsWith("https://")) {
      const res = await fetch(url);
      if (!res.ok) return { ok: false, error: "Previous take is no longer available." };
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      return { ok: false, error: "Invalid video." };
    }

    if (!buf) return { ok: false, error: "Previous take is no longer available." };

    try {
      const jpg = await media.extractFrame(buf, { atSeconds: data.atSeconds });
      if (jpg.length > 900_000) return { ok: false, error: "Frame too large." };
      return { ok: true, dataUrl: `data:image/jpeg;base64,${jpg.toString("base64")}` };
    } catch {
      return { ok: false, error: "Couldn't pull that frame." };
    }
  });
