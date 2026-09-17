import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bySceneOrder, reelIdOf, sceneNumber, type Project } from "@/lib/director/types";

export function SceneStrip({
  project,
  projects,
  onSelect,
  onPlayReel,
}: {
  project: Project;
  projects: Project[];
  onSelect: (id: string) => void;
  /** Present when the reel has takes worth playing back to back. */
  onPlayReel?: () => void;
}) {
  const reel = projects.filter((p) => reelIdOf(p) === reelIdOf(project)).sort(bySceneOrder);

  if (reel.length < 2 && sceneNumber(project) === 1 && !project.continuity) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-widest text-subtle">Reel</p>
        {onPlayReel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onPlayReel}>
            <Play className="size-3.5" />
            Play reel
          </Button>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {reel.map((p, i) => {
          const active = p.id === project.id;
          // Numbered by position, so a deleted scene leaves no gap.
          const n = i + 1;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-left text-sm transition-colors duration-[var(--motion-quick)]",
                active
                  ? "border-border-strong bg-raised text-fg"
                  : "border-border bg-surface text-muted hover:text-fg",
              )}
            >
              <span className="block font-mono text-xs tabular-nums text-subtle">
                Scene {String(n).padStart(2, "0")}
              </span>
              <span className="mt-0.5 block max-w-40 truncate">
                {p.board?.title || p.brief.slice(0, 28) || "Untitled"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
