import * as Dialog from "@radix-ui/react-dialog";
import { Clapperboard, RotateCcw, SkipBack, SkipForward, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/director/types";
import { cn } from "@/lib/utils";

/** How long the "no take" card holds before moving on. */
const GAP_MS = 2000;

function takeUrl(scene: Project | undefined): string | null {
  return scene?.sequence?.status === "done" ? scene.sequence.url : null;
}

function sceneLabel(scene: Project): string {
  return scene.board?.title || scene.brief.trim().slice(0, 48) || "Untitled";
}

/** Plays each scene's in-use take back to back, so a reel can be watched as one film. */
export function ReelPlayer({
  open,
  onOpenChange,
  scenes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The reel's scenes in order. */
  scenes: Project[];
}) {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setFinished(false);
  }, [open]);

  const scene = scenes[index];
  const url = takeUrl(scene);
  const nextUrl = takeUrl(scenes[index + 1]);

  const jump = useCallback((to: number) => {
    setIndex(to);
    setFinished(false);
  }, []);

  const advance = useCallback(() => {
    if (index + 1 < scenes.length) setIndex(index + 1);
    else setFinished(true);
  }, [index, scenes.length]);

  useEffect(() => {
    if (!open || finished || url || !scene) return;
    const timer = window.setTimeout(advance, GAP_MS);
    return () => window.clearTimeout(timer);
  }, [open, finished, url, scene, advance]);

  const position = String(index + 1).padStart(2, "0");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-4 text-fg shadow-2xl sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs tabular-nums text-subtle">
                Scene {position} of {String(scenes.length).padStart(2, "0")}
              </p>
              <Dialog.Title className="mt-1 truncate font-display text-2xl leading-tight tracking-tight">
                {scene ? sceneLabel(scene) : "Play reel"}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Plays every scene's chosen take in order.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close player">
                <X className="size-5" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {finished ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <p className="font-display text-2xl italic">End of reel</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => jump(0)}>
                  <RotateCcw className="size-4" />
                  Play again
                </Button>
              </div>
            ) : url ? (
              // One element for the whole reel: once the viewer starts it, later clips may autoplay.
              <video
                src={url}
                className="size-full object-contain"
                controls
                autoPlay
                playsInline
                onEnded={advance}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <Clapperboard className="size-6 text-subtle" />
                <p className="font-display text-xl italic">No take for scene {position}</p>
                <p className="text-sm text-muted">Roll camera on it to include it in the reel.</p>
              </div>
            )}
            {nextUrl && !finished ? (
              <video src={nextUrl} preload="auto" muted playsInline className="hidden" aria-hidden />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Previous scene"
              disabled={index === 0 && !finished}
              onClick={() => jump(finished ? scenes.length - 1 : index - 1)}
            >
              <SkipBack className="size-4" />
            </Button>
            <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
              {scenes.map((s, i) => (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-current={i === index && !finished ? "true" : undefined}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-left text-xs transition-colors duration-[var(--motion-quick)]",
                      i === index && !finished
                        ? "border-border-strong bg-raised text-fg"
                        : "border-border text-muted hover:text-fg",
                      !takeUrl(s) && "opacity-60",
                    )}
                  >
                    <span className="block font-mono tabular-nums">Scene {String(i + 1).padStart(2, "0")}</span>
                    <span className="block text-subtle">{takeUrl(s) ? "Take" : "No take"}</span>
                  </button>
                </li>
              ))}
            </ol>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Next scene"
              disabled={finished}
              onClick={advance}
            >
              <SkipForward className="size-4" />
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
