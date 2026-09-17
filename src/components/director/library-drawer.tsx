import { Clapperboard, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionMenu } from "@/components/director/action-menu";
import { ConfirmDialog } from "@/components/director/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBytes, formatWhen } from "@/lib/director/format";
import { deleteReel, deleteScene, listLibrary, renameReel, type ReelSummary } from "@/lib/director/library";
import { useDirector } from "@/lib/director/store";
import { bySceneOrder, reelIdOf, type Project } from "@/lib/director/types";
import { vaultDelete } from "@/lib/director/vault";
import { cn } from "@/lib/utils";

type PendingDelete =
  | { kind: "reel"; reel: ReelSummary }
  | { kind: "scene"; scene: Project; position: number };

function sceneLabel(project: Project): string {
  return project.brief.trim().slice(0, 60) || project.board?.title || "No brief yet";
}

/** Collapsible side drawer: every reel, the open reel's scenes, rename and delete. */
export function LibraryDrawer({
  open,
  onClose,
  project,
  projects,
  onOpenReel,
  onOpenScene,
  onNewReel,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  projects: Project[];
  onOpenReel: (reelId: string) => void;
  onOpenScene: (sceneId: string) => void;
  onNewReel: () => void;
}) {
  const removeProjects = useDirector((s) => s.removeProjects);
  const [reels, setReels] = useState<ReelSummary[] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [busy, setBusy] = useState(false);

  const currentReel = reelIdOf(project);
  const reelScenes = projects.filter((p) => reelIdOf(p) === currentReel).sort(bySceneOrder);
  // Refetch when the drawer opens and whenever the open reel's content changes shape.
  const contentKey = [
    currentReel,
    reelScenes.length,
    project.board?.title ?? "",
    project.sequence?.takeId ?? "",
    project.brief.trim() ? "brief" : "",
  ].join("|");

  const refresh = useCallback(async () => {
    try {
      const res = await listLibrary();
      setReels(res.reels);
    } catch {
      setReels((prev) => prev ?? []);
    }
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    // Immediately on open; after an edit, give the 1s scene autosave time to land.
    const delay = wasOpen.current ? 1200 : 0;
    wasOpen.current = true;
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [open, contentKey, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending && !document.querySelector("[role=menu]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  async function submitRename() {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (!title) return;
    const res = await renameReel({ data: { reelId: renaming.id, title } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setReels((prev) => prev?.map((r) => (r.id === renaming.id ? { ...r, title } : r)) ?? prev);
    setRenaming(null);
  }

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "reel") {
        const res = await deleteReel({ data: { reelId: pending.reel.id } });
        if (!res.ok) throw new Error(res.error);
        removeProjects([...res.sceneIds, ...projects.filter((p) => reelIdOf(p) === pending.reel.id).map((p) => p.id)]);
        void vaultDelete(res.takeIds).catch(() => {});
        toast.success(`Deleted “${pending.reel.title}”.`);
      } else {
        const res = await deleteScene({ data: { sceneId: pending.scene.id } });
        if (!res.ok) throw new Error(res.error);
        removeProjects([pending.scene.id]);
        void vaultDelete(res.takeIds).catch(() => {});
        toast.success(`Deleted scene ${String(pending.position).padStart(2, "0")}.`);
      }
      setPending(null);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = reels?.reduce((n, r) => n + r.bytes, 0) ?? 0;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/50 transition-opacity duration-[var(--motion-fast)] lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
        onClick={onClose}
      />
      <aside
        aria-label="Library"
        inert={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-80 max-w-[88vw] flex-col border-r border-border bg-surface transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <p className="font-display text-2xl leading-none tracking-tight">Library</p>
            <p className="mt-1 text-xs text-subtle">
              {reels ? `${reels.length} ${reels.length === 1 ? "reel" : "reels"} · ${formatBytes(totalBytes)}` : "Loading…"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close library" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="px-3 pt-3">
          <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onNewReel}>
            <Plus className="size-4" />
            New reel
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {reels === null ? (
            <div className="flex justify-center py-8">
              <LoaderCircle className="size-5 animate-spin text-subtle" />
            </div>
          ) : reels.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted">
              No reels yet. Write a brief and it will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {reels.map((reel) => {
                const isCurrent = reel.id === currentReel;
                return (
                  <li
                    key={reel.id}
                    className={cn(
                      "rounded-lg border",
                      isCurrent ? "border-border-strong bg-raised" : "border-transparent hover:bg-raised",
                    )}
                  >
                    <div className="flex items-center gap-1 p-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenReel(reel.id)}
                        aria-current={isCurrent ? "true" : undefined}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="grid aspect-video w-16 shrink-0 place-items-center overflow-hidden rounded bg-bg">
                          {reel.posterUrl ? (
                            <img src={reel.posterUrl} alt="" loading="lazy" className="size-full object-cover" />
                          ) : (
                            <Clapperboard className="size-4 text-subtle" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-fg">{reel.title}</span>
                          <span className="block text-xs text-subtle">
                            {reel.sceneCount} {reel.sceneCount === 1 ? "scene" : "scenes"} · {formatBytes(reel.bytes)} ·{" "}
                            {formatWhen(reel.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <ActionMenu
                        label={`Actions for ${reel.title}`}
                        items={[
                          {
                            label: "Rename",
                            icon: Pencil,
                            onSelect: () => setRenaming({ id: reel.id, title: reel.title }),
                          },
                          {
                            label: "Delete reel",
                            icon: Trash2,
                            danger: true,
                            onSelect: () => setPending({ kind: "reel", reel }),
                          },
                        ]}
                      />
                    </div>

                    {renaming?.id === reel.id ? (
                      <form
                        className="flex gap-2 px-2 pb-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitRename();
                        }}
                      >
                        <input
                          autoFocus
                          aria-label="Reel name"
                          value={renaming.title}
                          maxLength={120}
                          onChange={(e) => setRenaming({ id: reel.id, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              setRenaming(null);
                            }
                          }}
                          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button type="submit" size="sm" disabled={!renaming.title.trim()}>
                          Save
                        </Button>
                      </form>
                    ) : null}

                    {isCurrent && reelScenes.length ? (
                      <ol className="flex flex-col gap-0.5 border-t border-border px-1.5 py-1.5">
                        {reelScenes.map((scene, i) => (
                          <li key={scene.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenScene(scene.id)}
                              aria-current={scene.id === project.id ? "true" : undefined}
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                scene.id === project.id ? "bg-bg text-fg" : "text-muted hover:text-fg",
                              )}
                            >
                              <span className="font-mono text-xs tabular-nums text-subtle">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="truncate">{sceneLabel(scene)}</span>
                            </button>
                            <ActionMenu
                              label={`Actions for scene ${i + 1}`}
                              items={[
                                {
                                  label: "Delete scene",
                                  icon: Trash2,
                                  danger: true,
                                  onSelect: () => setPending({ kind: "scene", scene, position: i + 1 }),
                                },
                              ]}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmDelete()}
        confirmLabel={pending?.kind === "reel" ? "Delete reel" : "Delete scene"}
        title={
          pending?.kind === "reel"
            ? `Delete “${pending.reel.title}”?`
            : `Delete scene ${String(pending?.kind === "scene" ? pending.position : 0).padStart(2, "0")}?`
        }
        description={
          pending?.kind === "reel"
            ? `${pending.reel.sceneCount === 1 ? "Its scene and every take are" : `All ${pending.reel.sceneCount} scenes and every take are`} removed, and the videos are deleted from storage. This can't be undone.`
            : "Its storyboard and every take are removed, and the videos are deleted from storage. Later scenes keep their locked characters and chosen frame. This can't be undone."
        }
      />
    </>
  );
}
