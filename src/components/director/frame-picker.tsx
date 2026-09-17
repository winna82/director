import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const STEP = 0.1;

/** Scrub a previous take and choose the exact frame the next scene opens on. */
export function FramePicker({
  videoUrl,
  busy,
  onPick,
  onCancel,
}: {
  videoUrl: string;
  busy: boolean;
  onPick: (seconds: number) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);

  function nudge(delta: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const end = Number.isFinite(video.duration) ? video.duration : video.currentTime + delta;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), end);
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full rounded-md bg-raised"
        controls
        muted
        playsInline
        preload="auto"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onSeeked={(e) => setTime(e.currentTarget.currentTime)}
      />
      <p className="text-xs text-subtle">
        Pause on the moment the next scene should open on, then use that frame.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => nudge(-STEP)}>
          −0.1s
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => nudge(STEP)}>
          +0.1s
        </Button>
        <span className="font-mono text-xs tabular-nums text-muted">{time.toFixed(1)}s</span>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => {
            videoRef.current?.pause();
            onPick(videoRef.current?.currentTime ?? time);
          }}
        >
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          Use this frame
        </Button>
      </div>
    </div>
  );
}
