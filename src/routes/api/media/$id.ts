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
          where id = ${id} and access_key = ${key} and deleted_at is null
          limit 1
        `;
        const take = rows[0];
        if (!take) return new Response("Not found", { status: 404 });

        const { readTakeBytes } = await import("@/lib/director/media.server");
        const body = await readTakeBytes(sql, take);
        if (!body) return new Response("Not found", { status: 404 });

        const headers = new Headers({
          "Content-Type": take.content_type || "video/mp4",
          "Cache-Control": "private, max-age=31536000, immutable",
          "Accept-Ranges": "bytes",
        });
        if (download) {
          headers.set("Content-Disposition", `attachment; filename="director-${take.id}.mp4"`);
        }

        // Safari only plays <video> from servers that answer byte-range requests.
        const total = body.length;
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range")?.trim() ?? "");
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
          if (start > end || start >= total) {
            headers.set("Content-Range", `bytes */${total}`);
            return new Response(null, { status: 416, headers });
          }
          headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
          headers.set("Content-Length", String(end - start + 1));
          return new Response(new Uint8Array(body.subarray(start, end + 1)), { status: 206, headers });
        }
        headers.set("Content-Length", String(total));
        return new Response(new Uint8Array(body), { status: 200, headers });
      },
    },
  },
});
