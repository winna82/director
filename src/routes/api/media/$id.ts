import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id?.trim();
        const key = new URL(request.url).searchParams.get("k")?.trim();
        const download = new URL(request.url).searchParams.get("download") === "1";
        if (!id || !key) {
          return new Response("Not found", { status: 404 });
        }
        const sql = await getSql();
        const rows = await sql<{
          id: string;
          user_id: string;
          storage: string;
          object_key: string | null;
          content_type: string;
        }>`
          select id, user_id, storage, object_key, content_type
          from director_takes
          where id = ${id} and access_key = ${key}
          limit 1
        `;
        const take = rows[0];
        if (!take) return new Response("Not found", { status: 404 });

        let body: Buffer | null = null;
        if (take.storage === "db") {
          const blobs = await sql<{ body: Buffer | Uint8Array | string }>`
            select body from director_take_blobs
            where take_id = ${take.id} and user_id = ${take.user_id}
            limit 1
          `;
          const raw = blobs[0]?.body;
          if (raw instanceof Uint8Array) body = Buffer.from(raw);
          else if (typeof raw === "string") body = Buffer.from(raw, "base64");
        } else if (take.object_key) {
          const { getMedia } = await import("@/lib/director/bucket");
          body = await getMedia(take.storage, take.object_key);
        }
        if (!body) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "Content-Type": take.content_type || "video/mp4",
          "Cache-Control": "private, max-age=31536000, immutable",
        });
        if (download) {
          headers.set("Content-Disposition", `attachment; filename="director-${take.id}.mp4"`);
        }
        return new Response(new Uint8Array(body), { status: 200, headers });
      },
    },
  },
});
