import { cn } from "@/lib/utils";
import { reelIdOf, sceneNumber, type Project } from "@/lib/director/types";

export function SceneStrip({
  project,
  projects,
  onSelect,
}: {
  project: Project;
  projects: Project[];
  onSelect: (id: string) => void;
}) {
  const reel = projects
    .filter((p) => reelIdOf(p) === reelIdOf(project))
    .sort((a, b) => sceneNumber(a) - sceneNumber(b));

  if (reel.length < 2 && sceneNumber(project) === 1 && !project.continuity) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-subtle">Reel</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {reel.map((p) => {
          const active = p.id === project.id;
          const n = sceneNumber(p);
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
