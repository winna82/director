import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/** A take's thumbnail, extracted once on first request and kept on the take row. */
export const Route = createFileRoute("/api/poster/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id?.trim();
        const key = new URL(request.url).searchParams.get("k")?.trim();
        if (!id || !key) {
          return new Response("Not found", { status: 404 });
        }
        const sql = await getSql();
        const rows = await sql<{
          id: string;
          user_id: string;
          storage: string;
          object_key: string | null;
          poster: unknown;
        }>`
          select id, user_id, storage, object_key, poster
          from director_takes
          where id = ${id} and access_key = ${key} and deleted_at is null
          limit 1
        `;
        const take = rows[0];
        if (!take) return new Response("Not found", { status: 404 });

        const media = await import("@/lib/director/media.server");
        let poster = media.asBuffer(take.poster);
        if (!poster) {
          const video = await media.readTakeBytes(sql, take);
          if (!video) return new Response("Not found", { status: 404 });
          try {
            poster = await media.extractFrame(video, { atSeconds: 0.5, maxWidth: 480 });
          } catch {
            return new Response("Not found", { status: 404 });
          }
          await sql`update director_takes set poster = ${poster} where id = ${take.id} and deleted_at is null`;
        }
        return new Response(new Uint8Array(poster), {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
