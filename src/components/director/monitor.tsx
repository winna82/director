import { Clapperboard, Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { vaultGet } from "@/lib/director/vault";
import type { AspectRatio, VideoJob } from "@/lib/director/types";
import { Button } from "@/components/ui/button";

const ASPECT_CLASS: Record<AspectRatio, string> = {
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16] max-h-[70vh]",
  "1:1": "aspect-square",
};

export function Monitor({
  aspect,
  job,
  title,
}: {
  aspect: AspectRatio;
  job: VideoJob | null;
  title?: string;
}) {
  const rolling = job && (job.status === "queued" || job.status === "processing");
  const failed = job && (job.status === "failed" || job.status === "expired");
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setLocalUrl(null);
    const takeId = job?.takeId;
    if (!takeId || job?.status !== "done") return;
    vaultGet(takeId)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setLocalUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job?.takeId, job?.status]);

  const src = localUrl || job?.url || null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Picture</p>
        <div className="flex items-center gap-3">
          {src && job?.status === "done" ? (
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href={job.url ? `${job.url}${job.url.includes("?") ? "&" : "?"}download=1` : src} download="director-take.mp4">
                <Download className="size-3.5" />
                Save take
              </a>
            </Button>
          ) : null}
          <StatusChip job={job} archived={Boolean(job?.takeId)} />
        </div>
      </div>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-raised",
          ASPECT_CLASS[aspect],
          aspect === "9:16" ? "mx-auto w-full max-w-56" : "w-full",
          !src && aspect !== "9:16" && "max-h-60",
        )}
      >
        {src && job?.status === "done" ? (
          <video key={src} src={src} className="size-full object-cover" controls autoPlay playsInline />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {rolling ? (
              <>
                <LoaderCircle className="size-6 animate-spin text-muted" />
                <p className="font-display text-xl italic text-fg">Camera rolling</p>
                <p className="max-w-xs text-sm text-muted">Grok Imagine is exposing the sequence. This usually takes a minute.</p>
              </>
            ) : failed ? (
              <>
                <p className="font-display text-xl italic text-fg">Cut</p>
                <p className="max-w-xs text-sm text-muted">{job?.error || "The take didn't come back. Try rolling again."}</p>
              </>
            ) : (
              <>
                <Clapperboard className="size-6 text-subtle" />
                <p className="font-display text-xl italic text-fg">Picture is not up</p>
                <p className="max-w-xs text-sm text-muted">Call Director to block the scene, then roll camera.</p>
              </>
            )}
          </div>
        )}
      </div>
      {title ? <p className="text-sm text-muted">{title}</p> : null}
    </div>
  );
}

function StatusChip({ job, archived }: { job: VideoJob | null; archived?: boolean }) {
  if (!job) return <span className="text-xs uppercase tracking-widest text-subtle">Standby</span>;
  const label =
    job.status === "done" ? (archived ? "Archived" : "Take ready") : job.status === "failed" || job.status === "expired" ? "Failed" : "Rolling";
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs uppercase tracking-widest", job.status === "done" ? "text-fg" : "text-muted")}>
      {job.status !== "done" && job.status !== "failed" && job.status !== "expired" ? (
        <span className="size-1.5 rounded-full bg-rec" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}
