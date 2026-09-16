import { pollVideo } from "@/lib/director/ai";
import type { VideoJob } from "@/lib/director/types";

const INTERVAL = 4000;
const MAX_MS = 8 * 60 * 1000;

export function watchJob(
  requestId: string,
  onUpdate: (job: Pick<VideoJob, "status" | "url" | "error">) => void,
): () => void {
  let stopped = false;
  const started = Date.now();

  const tick = async () => {
    if (stopped) return;
    if (Date.now() - started > MAX_MS) {
      onUpdate({ status: "expired", url: null, error: "The roll timed out." });
      return;
    }
    const result = await pollVideo({ data: { requestId } });
    if (stopped) return;
    if (!result.ok) {
      onUpdate({ status: "processing", url: null, error: result.error });
      timer = window.setTimeout(tick, INTERVAL);
      return;
    }
    onUpdate({ status: result.status, url: result.url, error: result.error });
    if (result.status === "done" || result.status === "failed" || result.status === "expired") {
      return;
    }
    timer = window.setTimeout(tick, INTERVAL);
  };

  let timer = window.setTimeout(tick, 1500);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
