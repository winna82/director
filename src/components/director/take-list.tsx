import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ActionMenu } from "@/components/director/action-menu";
import { ConfirmDialog } from "@/components/director/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBytes, formatWhen } from "@/lib/director/format";
import { deleteTake, listTakes, type TakeSummary } from "@/lib/director/library";
import { useDirector } from "@/lib/director/store";
import type { Project } from "@/lib/director/types";
import { vaultDelete } from "@/lib/director/vault";
import { cn } from "@/lib/utils";

function takeLabel(take: TakeSummary, project: Project): string {
  if (take.kind === "sequence") return "Scene take";
  const shot = project.board?.shots.find((s) => s.id === take.shotId);
  return shot ? `Shot ${String(shot.index).padStart(2, "0")}` : "Shot take";
}

function inUse(take: TakeSummary, project: Project): boolean {
  if (take.kind === "sequence") return project.sequence?.takeId === take.id;
  return Boolean(take.shotId && project.shotJobs[take.shotId]?.takeId === take.id);
}

/** Every archived take of the scene: pick which one is used, download, or delete. */
export function TakeList({ project }: { project: Project }) {
  const setSequenceJob = useDirector((s) => s.setSequenceJob);
  const setShotJob = useDirector((s) => s.setShotJob);
  const applyTakes = useDirector((s) => s.applyTakes);
  const [takes, setTakes] = useState<TakeSummary[]>([]);
  const [pending, setPending] = useState<TakeSummary | null>(null);
  const [busy, setBusy] = useState(false);

  // Refetch when the scene changes or a new take is archived onto it.
  const archivedKey = [
    project.id,
    project.sequence?.takeId ?? "",
    ...Object.values(project.shotJobs).map((j) => j.takeId ?? ""),
  ].join("|");

  const load = useCallback(async (sceneId: string) => {
    if (sceneId === "draft") {
      setTakes([]);
      return;
    }
    try {
      const res = await listTakes({ data: { sceneId } });
      setTakes(res.takes);
    } catch {
      /* keep the last list; the next archive or scene switch retries */
    }
  }, []);

  useEffect(() => {
    void load(project.id);
  }, [archivedKey, project.id, load]);

  function use(take: TakeSummary) {
    if (take.kind === "sequence") setSequenceJob(take.job);
    else if (take.shotId) setShotJob(take.shotId, take.job);
  }

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await deleteTake({ data: { takeId: pending.id } });
      if (!res.ok) throw new Error(res.error);
      void vaultDelete([pending.id]).catch(() => {});
      if (res.scene) applyTakes(res.scene.id, res.scene.sequence, res.scene.shotJobs);
      setTakes((prev) => prev.filter((t) => t.id !== pending.id));
      setPending(null);
      toast.success("Take deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the take.");
    } finally {
      setBusy(false);
    }
  }

  if (!takes.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-subtle">
        Takes <span className="font-mono tabular-nums">· {takes.length}</span>
      </p>
      <ul className="flex flex-col gap-1.5">
        {takes.map((take) => {
          const active = inUse(take, project);
          return (
            <li
              key={take.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border py-1.5 pl-3 pr-1.5",
                active ? "border-border-strong bg-raised" : "border-border bg-surface",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", active ? "bg-fg" : "border border-border-strong")}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{takeLabel(take, project)}</span>
                <span className="block text-xs text-subtle">
                  {formatWhen(take.createdAt)} · {formatBytes(take.bytes)}
                  {active ? " · In use" : ""}
                </span>
              </span>
              {!active ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => use(take)}>
                  Use
                </Button>
              ) : null}
              <ActionMenu
                label={`Actions for ${takeLabel(take, project)} from ${formatWhen(take.createdAt)}`}
                items={[
                  { label: "Download", icon: Download, href: `${take.job.url}&download=1` },
                  { label: "Delete take", icon: Trash2, danger: true, onSelect: () => setPending(take) },
                ]}
              />
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmDelete()}
        confirmLabel="Delete take"
        title="Delete this take?"
        description={
          pending && inUse(pending, project)
            ? "The video is removed from storage and can't be recovered. The scene switches to its newest remaining take."
            : "The video is removed from storage and can't be recovered."
        }
      />
    </div>
  );
}
